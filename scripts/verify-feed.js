#!/usr/bin/env node
/**
 * Gate the generated podcast feed against the archived Fountain feed.
 *
 * The migration's central risk is silent: a regenerated GUID or a shifted
 * pubDate does not break the build, it republishes the entire back catalogue to
 * every subscriber as 37 new episodes, or splits the show into a duplicate
 * listing. Nothing downstream catches that, so it gets caught here.
 *
 * Requires that every item GUID, pubDate, and duration match what Fountain
 * published, and that podcast:guid is unchanged. Enclosure URLs and lengths are
 * expected to differ -- that is the point of the migration -- and are reported
 * rather than enforced.
 *
 * The baseline is the committed archive manifest, not the 1.6 GB archive
 * directory, so this runs in CI where that directory does not exist.
 *
 * Usage:
 *   hugo --gc && node scripts/verify-feed.js
 */

const fs = require('fs');
const path = require('path');

const GENERATED = process.env.GENERATED_FEED || path.join(__dirname, '..', 'public', 'podcast.xml');

const MANIFEST =
  process.env.ARCHIVE_MANIFEST ||
  path.join(__dirname, '..', 'docs', 'plans', 'fountain-archive-manifest.json');

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

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

/** Baseline of what Fountain published, from the committed archive manifest. */
function readBaseline() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(`archive manifest not found at ${MANIFEST} -- run scripts/archive-fountain.js`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return {
    podcastGuid: manifest.channel.podcastGuid,
    items: manifest.episodes.map((e) => ({
      guid: e.guid,
      title: e.title,
      pubDate: e.pubDate,
      duration: e.declaredDuration == null ? null : String(e.declaredDuration),
      season: e.season == null ? null : String(e.season),
      episode: e.episode == null ? null : String(e.episode)
    }))
  };
}

function parse(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`${label} feed not found at ${file} -- run hugo first`);
  }
  const xml = fs.readFileSync(file, 'utf8');
  const channel = xml.slice(xml.indexOf('<channel>'));
  const head = xml.slice(0, xml.indexOf('<item>'));

  const items = [...channel.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const item = m[1];
    return {
      guid: tagText(item, 'guid'),
      title: tagText(item, 'title'),
      pubDate: tagText(item, 'pubDate'),
      duration: tagText(item, 'itunes:duration'),
      season: tagText(item, 'itunes:season'),
      episode: tagText(item, 'itunes:episode'),
      enclosureUrl: attr(item, 'enclosure', 'url'),
      enclosureLength: attr(item, 'enclosure', 'length'),
      transcript: attr(item, 'podcast:transcript', 'url'),
      chapters: attr(item, 'podcast:chapters', 'url')
    };
  });

  return {
    podcastGuid: tagText(head, 'podcast:guid'),
    ownerEmail: tagText(head, 'itunes:email'),
    valueRecipients: [...head.matchAll(/<podcast:valueRecipient\b[^>]*>/g)].map((m) => ({
      name: (m[0].match(/name="([^"]*)"/) || [])[1],
      address: (m[0].match(/address="([^"]*)"/) || [])[1],
      split: parseInt((m[0].match(/split="([^"]*)"/) || [])[1] || '0', 10)
    })),
    items
  };
}

function main() {
  const generated = parse(GENERATED, 'generated');
  const archived = readBaseline();

  const failures = [];
  const notes = [];

  console.log(`generated: ${generated.items.length} items   archived: ${archived.items.length} items\n`);

  if (generated.items.length !== archived.items.length) {
    failures.push(
      `item count differs: generated ${generated.items.length}, archived ${archived.items.length}`
    );
  }

  // podcast:guid is the show's identity across feed moves.
  if (generated.podcastGuid !== archived.podcastGuid) {
    failures.push(
      `podcast:guid changed: "${generated.podcastGuid}" vs archived "${archived.podcastGuid}"`
    );
  }

  // The gap the Fountain feed left open.
  if (!generated.ownerEmail) {
    failures.push('generated feed has no itunes:email; directory ownership recovery stays broken');
  }

  const valueTotal = generated.valueRecipients.reduce((n, r) => n + r.split, 0);
  if (generated.valueRecipients.length && valueTotal !== 100) {
    failures.push(`podcast:value splits total ${valueTotal}, expected 100`);
  }
  if (generated.valueRecipients.some((r) => /fountain/i.test(r.address || ''))) {
    failures.push('generated feed still routes a value split to Fountain');
  }

  // Per-item comparison, keyed on GUID.
  const archivedByGuid = new Map(archived.items.map((i) => [i.guid, i]));
  const seen = new Set();

  for (const item of generated.items) {
    if (!item.guid) {
      failures.push(`item "${item.title}" has no guid`);
      continue;
    }
    if (seen.has(item.guid)) {
      failures.push(`duplicate guid in generated feed: ${item.guid}`);
    }
    seen.add(item.guid);

    const original = archivedByGuid.get(item.guid);
    if (!original) {
      failures.push(`guid ${item.guid} ("${item.title}") does not exist in the archived feed`);
      continue;
    }

    if (item.pubDate !== original.pubDate) {
      failures.push(
        `pubDate changed for "${item.title}": "${item.pubDate}" vs archived "${original.pubDate}"`
      );
    }
    if (item.duration !== original.duration) {
      failures.push(
        `itunes:duration changed for "${item.title}": ${item.duration} vs archived ${original.duration}`
      );
    }
    if (item.season !== original.season || item.episode !== original.episode) {
      // Fountain's own numbering is known-bad, so this is informational.
      notes.push(
        `numbering differs for "${item.title}": S${item.season}E${item.episode} vs archived S${original.season}E${original.episode}`
      );
    }
    if (!item.enclosureUrl) {
      failures.push(`item "${item.title}" has no enclosure URL`);
    }
    if (!/^\d+$/.test(item.enclosureLength || '')) {
      failures.push(`item "${item.title}" has a non-numeric enclosure length`);
    }
  }

  for (const original of archived.items) {
    if (!seen.has(original.guid)) {
      failures.push(`archived guid ${original.guid} ("${original.title}") is missing from the generated feed`);
    }
  }

  const stillOnFountain = generated.items.filter((i) => /fountain\.fm/.test(i.enclosureUrl || ''));
  if (stillOnFountain.length) {
    failures.push(`${stillOnFountain.length} enclosures still point at fountain.fm`);
  }

  console.log(`GUIDs preserved:      ${seen.size}/${archived.items.length}`);
  console.log(`podcast:guid:         ${generated.podcastGuid === archived.podcastGuid ? 'unchanged' : 'CHANGED'}`);
  console.log(`itunes:email:         ${generated.ownerEmail || 'MISSING'}`);
  console.log(`value splits:         ${generated.valueRecipients.map((r) => `${r.name} ${r.split}%`).join(', ') || 'none'}`);
  console.log(`enclosures migrated:  ${generated.items.length - stillOnFountain.length}/${generated.items.length}`);

  if (notes.length) {
    console.log(`\nNotes (${notes.length}):`);
    for (const n of notes) console.log(`  - ${n}`);
  }

  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f}`);
    throw new Error(`feed verification failed with ${failures.length} problem(s)`);
  }

  console.log('\nFeed verification passed.');
}

try {
  main();
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
}
