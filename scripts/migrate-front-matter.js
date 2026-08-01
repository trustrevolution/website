#!/usr/bin/env node
/**
 * Point episode front matter at self-hosted media and carry the durable feed
 * data the replacement RSS feed needs.
 *
 * Rewrites audio_url, video_url, and transcript_url to the R2 media domain, and
 * adds three fields extracted from the archived Fountain feed:
 *
 *   guid             the item GUID, which must survive byte-identically or
 *                    every subscriber re-downloads the catalogue
 *   feed_pubdate     the original RFC-822 publication timestamp; Hugo's own
 *                    `date` field is date-only, so emitting from it would shift
 *                    every episode's time and reshuffle app sort order. Named
 *                    `feed_pubdate` rather than `pubdate` because Hugo treats
 *                    the latter as a reserved date key and coerces the string
 *                    into a Go timestamp, which is not valid RSS.
 *   enclosure_bytes  the true byte size of the archived MP3 (Fountain's own
 *                    declared lengths are rounded on derived files)
 *   duration_seconds itunes:duration verbatim, so the feed template needs no
 *                    mm:ss parsing (Go's int cast rejects zero-padded "08")
 *   chapters_url     previously not carried in front matter at all
 *
 * Edits are line-scoped rather than a YAML round-trip on purpose: parsing and
 * re-emitting the front matter would reflow quoting, reorder keys, and reformat
 * the multi-line summary blocks across all 37 files.
 *
 * Usage:
 *   node scripts/migrate-front-matter.js --dry-run
 *   node scripts/migrate-front-matter.js
 */

const fs = require('fs');
const path = require('path');

const MEDIA_BASE = process.env.MEDIA_BASE || 'https://media.trustrevolution.co';

const MANIFEST_PATH = path.join(__dirname, '..', 'docs', 'plans', 'fountain-archive-manifest.json');
const EPISODES_DIR = path.join(__dirname, '..', 'content', 'episodes');

const DRY_RUN = process.argv.includes('--dry-run');

/** Fields whose values are replaced outright, in front-matter order. */
function mediaUrlsFor(slug) {
  return {
    audio_url: `${MEDIA_BASE}/audio/${slug}.mp3`,
    video_url: `${MEDIA_BASE}/video/${slug}.mp4`,
    transcript_url: `${MEDIA_BASE}/transcripts/${slug}.srt`
  };
}

/** Replace `key: "value"` on its own line, preserving everything else. */
function replaceScalar(text, key, value) {
  const pattern = new RegExp(`^${key}:.*$`, 'm');
  if (!pattern.test(text)) return { text, changed: false };
  return { text: text.replace(pattern, `${key}: "${value}"`), changed: true };
}

/**
 * Insert `key: value` after the anchor line, or before the closing ---.
 * `raw: true` emits the value unquoted, so numbers stay numbers for Hugo --
 * enclosure_bytes is arithmetic in the feed template, not a label.
 */
function upsertAfter(text, key, value, anchorKey, { raw = false } = {}) {
  const rendered = raw ? `${key}: ${value}` : `${key}: "${value}"`;

  const existing = new RegExp(`^${key}:.*$`, 'm');
  if (existing.test(text)) {
    return text.replace(existing, rendered);
  }

  const anchor = new RegExp(`^(${anchorKey}:.*)$`, 'm');
  if (anchor.test(text)) {
    return text.replace(anchor, `$1\n${rendered}`);
  }

  // No anchor -- fall back to the end of the front-matter block.
  const close = text.indexOf('\n---', 3);
  if (close === -1) throw new Error(`cannot locate front-matter close for key ${key}`);
  return text.slice(0, close) + `\n${rendered}` + text.slice(close);
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `archive manifest not found at ${MANIFEST_PATH} -- run scripts/archive-fountain.js first`
    );
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const bySlug = new Map(manifest.episodes.map((e) => [e.slug, e]));

  console.log(`Media base: ${MEDIA_BASE}`);
  console.log(`Manifest:   ${manifest.episodes.length} episodes${DRY_RUN ? '   (dry run)' : ''}\n`);

  const files = fs.readdirSync(EPISODES_DIR).filter((f) => f.endsWith('.md'));
  const results = { migrated: 0, skipped: [], problems: [] };

  for (const file of files.sort()) {
    const filePath = path.join(EPISODES_DIR, file);
    let text = fs.readFileSync(filePath, 'utf8');

    const slugField = text.match(/^slug:\s*(.+)$/m);
    const slug = (slugField ? slugField[1].trim() : path.basename(file, '.md')).replace(/^["']|["']$/g, '');

    const record = bySlug.get(slug);
    if (!record) {
      // _index.md and anything without published audio legitimately has no record.
      if (/^audio_url:\s*"\S+"/m.test(text)) {
        results.problems.push(`${file}: has audio_url but no manifest entry for slug "${slug}"`);
      } else {
        results.skipped.push(file);
      }
      continue;
    }

    if (!record.guid) {
      results.problems.push(`${file}: manifest entry has no guid`);
      continue;
    }

    if (!record.pubDate) {
      results.problems.push(`${file}: manifest entry has no pubDate`);
      continue;
    }

    const before = text;
    const urls = mediaUrlsFor(slug);

    for (const [key, value] of Object.entries(urls)) {
      const result = replaceScalar(text, key, value);
      if (!result.changed && key === 'audio_url') {
        results.problems.push(`${file}: no audio_url line to replace`);
      }
      text = result.text;
    }

    // Durable feed data, anchored after the media URLs so it reads in one block.
    // WebVTT captions for the <video> track element; SRT stays for the feed.
    text = upsertAfter(text, 'captions_url', `${MEDIA_BASE}/captions/${slug}.vtt`, 'transcript_url');
    text = upsertAfter(text, 'chapters_url', `${MEDIA_BASE}/chapters/${slug}.json`, 'captions_url');
    text = upsertAfter(text, 'guid', record.guid, 'chapters_url');
    text = upsertAfter(text, 'feed_pubdate', record.pubDate, 'guid');
    text = upsertAfter(text, 'enclosure_bytes', record.assets.audio.bytes, 'feed_pubdate', { raw: true });

    const seconds = record.declaredDuration || record.assets.audio.observedDuration;
    if (!seconds) {
      results.problems.push(`${file}: no duration available in manifest`);
      continue;
    }
    text = upsertAfter(text, 'duration_seconds', seconds, 'enclosure_bytes', { raw: true });

    if (text === before) {
      results.skipped.push(file);
      continue;
    }

    if (!DRY_RUN) fs.writeFileSync(filePath, text);
    results.migrated += 1;
    console.log(`  ${slug}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Migrated: ${results.migrated}`);
  console.log(`Skipped:  ${results.skipped.length} (${results.skipped.join(', ') || 'none'})`);

  if (results.problems.length) {
    console.log(`\nProblems (${results.problems.length}):`);
    for (const p of results.problems) console.log(`  - ${p}`);
    throw new Error('front-matter migration incomplete');
  }

  if (results.migrated !== manifest.episodes.length) {
    throw new Error(
      `migrated ${results.migrated} files but manifest has ${manifest.episodes.length} episodes`
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
}
