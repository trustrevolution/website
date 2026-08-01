#!/usr/bin/env node
/**
 * Archive every asset the Trust Revolution back catalogue depends on off Fountain.
 *
 * This is the one irreversible step in the Fountain -> R2 migration. Fountain's
 * terms permit content removal after termination with no stated grace period, so
 * this must complete and verify before the subscription is cancelled.
 *
 * Downloads the raw feed XML (kept byte-identical as the migration source of
 * truth), then every MP3 enclosure, SRT transcript, JSON chapters file, and
 * artwork referenced by the feed. Writes a manifest recording source URL, byte
 * count, and SHA-256 per asset.
 *
 * Media lands outside the repo by default -- 1.6 GB does not belong in git.
 * Override with ARCHIVE_DIR.
 *
 * Usage:
 *   node scripts/archive-fountain.js
 *   node scripts/archive-fountain.js --dry-run   # parse and report, download nothing
 *   ARCHIVE_DIR=/mnt/backup/tr node scripts/archive-fountain.js
 *
 * Idempotent: assets already present with a matching byte count are skipped.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const FOUNTAIN_RSS_URL = 'https://feeds.fountain.fm/OIYZniSDb9jd3Pb78CpF';

const ARCHIVE_DIR =
  process.env.ARCHIVE_DIR ||
  path.join(os.homedir(), 'Archive', 'trust-revolution-fountain');

const MANIFEST_PATH = path.join(
  __dirname,
  '..',
  'docs',
  'plans',
  'fountain-archive-manifest.json'
);

const DURATION_TOLERANCE_SECONDS = 2;

const DRY_RUN = process.argv.includes('--dry-run');

/* ------------------------------------------------------------------ *
 * Feed parsing
 *
 * Deliberately regex-based rather than using an XML library. GUIDs and
 * pubDates must survive byte-identically into the replacement feed, and
 * a parse/reserialize round trip is exactly how those get mangled.
 * ------------------------------------------------------------------ */

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * The open-tag pattern requires `>` or whitespace immediately after the tag
 * name. Without it, a search for `itunes:episode` also matches the opening of
 * `itunes:episodeType` and then runs to the next real close tag, returning
 * garbage that parses as NaN.
 */
function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1].trim()) : null;
}

function attr(xml, tag, name) {
  const open = xml.match(new RegExp(`<${tag}\\b[^>]*>`));
  if (!open) return null;
  const m = open[0].match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : null;
}

/** Channel-level metadata sits before the first <item>. */
function channelHeadOf(xml) {
  return xml.slice(0, xml.indexOf('<item>'));
}

function parseItems(xml) {
  const channel = xml.slice(xml.indexOf('<channel>'));
  const items = [...channel.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

  return items.map((item, index) => {
    const season = tagText(item, 'itunes:season') || tagText(item, 'podcast:season');
    const episode = tagText(item, 'itunes:episode') || tagText(item, 'podcast:episode');

    // Chapters and transcript are self-closing tags carrying a url attribute.
    const chapters = attr(item, 'podcast:chapters', 'url');
    const transcript = attr(item, 'podcast:transcript', 'url');

    return {
      index,
      title: tagText(item, 'title'),
      guid: tagText(item, 'guid'),
      pubDate: tagText(item, 'pubDate'),
      duration: parseInt(tagText(item, 'itunes:duration') || '0', 10) || null,
      season: season ? parseInt(season, 10) : null,
      episode: episode ? parseInt(episode, 10) : null,
      enclosureUrl: attr(item, 'enclosure', 'url'),
      enclosureLength: parseInt(attr(item, 'enclosure', 'length') || '0', 10) || null,
      chaptersUrl: chapters,
      transcriptUrl: transcript,
      imageUrl: attr(item, 'itunes:image', 'href')
    };
  });
}

/**
 * Slugs come from content/episodes/ front matter, not from the feed.
 *
 * Fountain's own numbering is unreliable: it tags both Stephen Pollock and
 * Rishad Tobaccowala as S01E10, and leaves the trailer and S01E01 unnumbered.
 * The repo's front matter is authoritative and already drives episode URLs, so
 * key on the Fountain item ID embedded in each enclosure URL, which is unique
 * per episode in both places.
 */
function buildSlugMap() {
  const dir = path.join(__dirname, '..', 'content', 'episodes');
  const map = new Map();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const audio = text.match(/^audio_url:\s*"([^"]+)"/m);
    if (!audio) continue;

    const itemId = audio[1].match(/\/items\/([^/]+)\//);
    if (!itemId) continue;

    const slugField = text.match(/^slug:\s*(.+)$/m);
    const slug = (slugField ? slugField[1].trim() : path.basename(file, '.md')).replace(/^["']|["']$/g, '');

    if (map.has(itemId[1])) {
      throw new Error(`two episode files claim Fountain item ${itemId[1]}`);
    }
    map.set(itemId[1], slug);
  }

  return map;
}

function slugFor(item, slugMap) {
  const itemId = item.enclosureUrl && item.enclosureUrl.match(/\/items\/([^/]+)\//);
  if (!itemId) {
    throw new Error(`cannot extract Fountain item ID from enclosure: ${item.enclosureUrl}`);
  }

  const slug = slugMap.get(itemId[1]);
  if (!slug) {
    throw new Error(
      `feed item "${item.title}" (${itemId[1]}) has no matching file in content/episodes/`
    );
  }
  return slug;
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

/**
 * Truncation is the failure that matters, and the authority for it is the
 * HTTP Content-Length of the response we actually read -- not the feed's
 * declared enclosure length. Fountain rounds the declared length on MP3s it
 * derives from video masters (S03E06 is published as 68330000 against a real
 * 68331458 bytes), so treating the feed as truth would reject good downloads.
 * Divergence from the feed is returned for the caller to record, not enforced.
 */
async function download(url, dest, declaredBytes) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (fs.existsSync(dest)) {
    const size = fs.statSync(dest).size;
    const head = await fetch(url, { method: 'HEAD' });
    const remote = head.ok ? parseInt(head.headers.get('content-length') || '0', 10) : 0;

    if (remote && size === remote) {
      return { skipped: true, bytes: size, declaredBytes, remoteBytes: remote };
    }
    console.warn(
      `  ! ${path.basename(dest)} is ${size} bytes, origin says ${remote || 'unknown'} -- re-downloading`
    );
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  const remoteBytes = parseInt(res.headers.get('content-length') || '0', 10) || null;

  const tmp = `${dest}.partial`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));

  const bytes = fs.statSync(tmp).size;
  if (remoteBytes && bytes !== remoteBytes) {
    fs.unlinkSync(tmp);
    throw new Error(
      `truncated download for ${url}: got ${bytes} bytes, origin sent Content-Length ${remoteBytes}`
    );
  }
  if (bytes === 0) {
    fs.unlinkSync(tmp);
    throw new Error(`empty download for ${url}`);
  }

  fs.renameSync(tmp, dest);
  return { skipped: false, bytes, declaredBytes, remoteBytes };
}

function probeDuration(file) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8' }
    );
    return Math.round(parseFloat(out.trim()));
  } catch (err) {
    console.warn(`  ! ffprobe failed on ${path.basename(file)}: ${err.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log(`Archive directory: ${ARCHIVE_DIR}\n`);
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  // 1. Raw feed XML -- saved verbatim, never reserialized.
  console.log('Fetching feed XML...');
  const feedRes = await fetch(FOUNTAIN_RSS_URL);
  if (!feedRes.ok) {
    throw new Error(`HTTP ${feedRes.status} fetching feed: ${FOUNTAIN_RSS_URL}`);
  }
  const feedXml = await feedRes.text();
  const feedPath = path.join(ARCHIVE_DIR, 'feed.xml');
  fs.writeFileSync(feedPath, feedXml);
  console.log(`  saved ${feedXml.length} bytes to feed.xml\n`);

  const items = parseItems(feedXml);
  console.log(`Feed declares ${items.length} items\n`);

  // Guard: a slug collision would silently overwrite one episode with another.
  // Check before spending a multi-gigabyte download on a broken mapping.
  const slugMap = buildSlugMap();
  console.log(`content/episodes/ supplies ${slugMap.size} slugs\n`);

  const slugs = items.map((item) => slugFor(item, slugMap));
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupes.length) {
    throw new Error(`slug collision -- would overwrite episodes: ${[...new Set(dupes)].join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('--dry-run: parse check only, downloading nothing\n');
    for (const item of items) {
      const s = slugFor(item, slugMap);
      const missing = [
        !item.guid && 'guid',
        !item.enclosureUrl && 'enclosure',
        !item.transcriptUrl && 'transcript',
        !item.chaptersUrl && 'chapters'
      ].filter(Boolean);
      console.log(
        `  ${s.padEnd(10)} ${String(item.enclosureLength).padStart(10)} bytes  ` +
          `${String(item.duration).padStart(5)}s  guid=${(item.guid || 'MISSING').slice(0, 8)}` +
          (missing.length ? `  missing: ${missing.join(',')}` : '')
      );
    }
    const totalDeclared = items.reduce((n, i) => n + (i.enclosureLength || 0), 0);
    console.log(`\n  ${items.length} items, ${new Set(slugs).size} unique slugs`);
    console.log(`  unmatched content files: ${slugMap.size - new Set(slugs).size}`);
    console.log(`  declared audio total: ${(totalDeclared / 1073741824).toFixed(2)} GB`);
    console.log(`  podcast:guid: ${tagText(channelHeadOf(feedXml), 'podcast:guid')}`);
    return;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceFeed: FOUNTAIN_RSS_URL,
    // Home-relative: this manifest is committed to a public repo.
    archiveDir: ARCHIVE_DIR.startsWith(os.homedir())
      ? ARCHIVE_DIR.replace(os.homedir(), '~')
      : ARCHIVE_DIR,
    feed: {
      path: 'feed.xml',
      bytes: Buffer.byteLength(feedXml),
      sha256: sha256(feedPath)
    },
    channel: {
      podcastGuid: tagText(channelHeadOf(feedXml), 'podcast:guid'),
      coverArt: null
    },
    episodes: [],
    problems: []
  };

  // 2. Channel cover art.
  const coverUrl = attr(channelHeadOf(feedXml), 'itunes:image', 'href');
  if (coverUrl) {
    const dest = path.join(ARCHIVE_DIR, 'art', 'cover' + path.extname(new URL(coverUrl).pathname));
    const { bytes } = await download(coverUrl, dest);
    manifest.channel.coverArt = {
      sourceUrl: coverUrl,
      path: path.relative(ARCHIVE_DIR, dest),
      bytes,
      sha256: sha256(dest)
    };
    console.log(`Cover art archived (${bytes} bytes)\n`);
  } else {
    manifest.problems.push({ scope: 'channel', issue: 'no itunes:image on channel' });
  }

  // 3. Per-episode assets.
  for (const item of items) {
    const slug = slugFor(item, slugMap);
    console.log(`[${item.index + 1}/${items.length}] ${slug} -- ${item.title}`);

    const record = {
      slug,
      title: item.title,
      guid: item.guid,
      pubDate: item.pubDate,
      declaredDuration: item.duration,
      season: item.season,
      episode: item.episode,
      assets: {}
    };

    if (!item.guid) {
      manifest.problems.push({ scope: slug, issue: 'item has no guid' });
      console.warn('  ! item has no guid');
    }

    // Audio -- the one asset that must not be missing.
    if (!item.enclosureUrl) {
      manifest.problems.push({ scope: slug, issue: 'item has no enclosure url' });
      throw new Error(`${slug} has no enclosure URL; feed is malformed`);
    }

    const audioDest = path.join(ARCHIVE_DIR, 'audio', `${slug}.mp3`);
    const audio = await download(item.enclosureUrl, audioDest, item.enclosureLength);
    const observedDuration = probeDuration(audioDest);

    if (
      item.duration &&
      observedDuration &&
      Math.abs(observedDuration - item.duration) > DURATION_TOLERANCE_SECONDS
    ) {
      manifest.problems.push({
        scope: slug,
        issue: `duration mismatch: feed says ${item.duration}s, file is ${observedDuration}s`
      });
      console.warn(
        `  ! duration mismatch: feed ${item.duration}s vs file ${observedDuration}s`
      );
    }

    // The true byte count is what the replacement feed's enclosure length must
    // carry; the feed's declared value is recorded only to show the divergence.
    if (item.enclosureLength && audio.bytes !== item.enclosureLength) {
      manifest.problems.push({
        scope: slug,
        severity: 'info',
        issue: `feed declares ${item.enclosureLength} bytes, actual is ${audio.bytes}`
      });
    }

    record.assets.audio = {
      sourceUrl: item.enclosureUrl,
      path: path.relative(ARCHIVE_DIR, audioDest),
      bytes: audio.bytes,
      declaredBytes: item.enclosureLength,
      observedDuration,
      sha256: sha256(audioDest)
    };
    console.log(
      `  audio ${audio.skipped ? 'present' : 'downloaded'} (${audio.bytes} bytes, ${observedDuration}s)`
    );

    // Optional assets -- absence is recorded, not fatal.
    const optional = [
      ['transcript', item.transcriptUrl, 'transcripts', '.srt'],
      ['chapters', item.chaptersUrl, 'chapters', '.json'],
      ['image', item.imageUrl, 'art', null]
    ];

    for (const [name, url, dir, forcedExt] of optional) {
      if (!url) {
        record.assets[name] = null;
        continue;
      }
      const ext = forcedExt || path.extname(new URL(url).pathname) || '.bin';
      const dest = path.join(ARCHIVE_DIR, dir, `${slug}${ext}`);
      try {
        const result = await download(url, dest);
        record.assets[name] = {
          sourceUrl: url,
          path: path.relative(ARCHIVE_DIR, dest),
          bytes: result.bytes,
          sha256: sha256(dest)
        };
        console.log(`  ${name} ${result.skipped ? 'present' : 'downloaded'} (${result.bytes} bytes)`);
      } catch (err) {
        record.assets[name] = null;
        manifest.problems.push({ scope: slug, issue: `${name} failed: ${err.message}` });
        console.warn(`  ! ${name} failed: ${err.message}`);
      }
    }

    manifest.episodes.push(record);
  }

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  // 4. Report.
  const audioCount = manifest.episodes.filter((e) => e.assets.audio).length;
  const totalBytes = manifest.episodes.reduce((sum, e) => sum + (e.assets.audio?.bytes || 0), 0);
  const uniqueGuids = new Set(manifest.episodes.map((e) => e.guid).filter(Boolean)).size;

  console.log('\n' + '='.repeat(60));
  console.log(`Audio archived:   ${audioCount}/${items.length}`);
  console.log(`Unique GUIDs:     ${uniqueGuids}/${items.length}`);
  console.log(`Transcripts:      ${manifest.episodes.filter((e) => e.assets.transcript).length}`);
  console.log(`Chapters:         ${manifest.episodes.filter((e) => e.assets.chapters).length}`);
  console.log(`Episode art:      ${manifest.episodes.filter((e) => e.assets.image).length}`);
  console.log(`Total audio:      ${(totalBytes / 1073741824).toFixed(2)} GB`);
  console.log(`Manifest:         ${MANIFEST_PATH}`);

  const notes = manifest.problems.filter((p) => p.severity === 'info');
  const failures = manifest.problems.filter((p) => p.severity !== 'info');

  if (failures.length) {
    console.log(`\nProblems (${failures.length}):`);
    for (const p of failures) console.log(`  - [${p.scope}] ${p.issue}`);
  } else {
    console.log('\nNo problems recorded.');
  }

  if (notes.length) {
    console.log(`\nNotes (${notes.length}) -- recorded in the manifest, not blocking:`);
    for (const p of notes) console.log(`  - [${p.scope}] ${p.issue}`);
  }

  if (audioCount !== items.length || uniqueGuids !== items.length) {
    throw new Error(
      `archive incomplete: ${audioCount}/${items.length} audio, ${uniqueGuids}/${items.length} unique GUIDs`
    );
  }
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
