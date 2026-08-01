#!/usr/bin/env node
/**
 * Check every media URL the generated feed and episode pages publish against
 * what R2 actually serves.
 *
 * verify-feed.js proves the feed is internally correct. This proves the URLs in
 * it resolve, carry the right content type, report the byte count the feed
 * declares, and answer ranged requests. Those are the failures that would reach
 * a subscriber as a broken episode rather than as a build error.
 *
 * Run before the directory cutover, and any time the bucket changes.
 *
 * Usage:
 *   hugo --gc && node scripts/verify-media.js
 */

const fs = require('fs');
const path = require('path');

const FEED = process.env.GENERATED_FEED || path.join(__dirname, '..', 'public', 'podcast.xml');
const EPISODES_DIR = path.join(__dirname, '..', 'content', 'episodes');

const CONCURRENCY = 8;

const EXPECTED_TYPE = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
  '.json': 'application/json',
  '.jpg': 'image/jpeg'
};

function attr(xml, tag, name) {
  const open = xml.match(new RegExp(`<${tag}\\b[^>]*>`));
  if (!open) return null;
  const m = open[0].match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Everything the feed points at, plus what episode pages load. */
function collectTargets() {
  const targets = [];

  const xml = fs.readFileSync(FEED, 'utf8');
  const channel = xml.slice(xml.indexOf('<channel>'));

  const cover = attr(channel.slice(0, channel.indexOf('<item>')), 'itunes:image', 'href');
  if (cover) targets.push({ url: cover, from: 'channel cover', expectBytes: null });

  for (const m of channel.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'untitled';

    const enclosure = attr(item, 'enclosure', 'url');
    const length = attr(item, 'enclosure', 'length');
    if (enclosure) {
      targets.push({ url: enclosure, from: `${title} audio`, expectBytes: length ? parseInt(length, 10) : null, ranged: true });
    }

    for (const [tag, label] of [['podcast:source', 'video'], ['podcast:transcript', 'transcript'], ['podcast:chapters', 'chapters']]) {
      const key = tag === 'podcast:source' ? 'uri' : 'url';
      const url = attr(item, tag, key);
      if (url) targets.push({ url, from: `${title} ${label}`, expectBytes: null, ranged: label === 'video' });
    }

    const image = attr(item, 'itunes:image', 'href');
    if (image) targets.push({ url: image, from: `${title} art`, expectBytes: null });
  }

  // Captions are used by the page's <track>, not by the feed.
  for (const file of fs.readdirSync(EPISODES_DIR).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(EPISODES_DIR, file), 'utf8');
    const cap = text.match(/^captions_url:\s*"([^"]+)"/m);
    if (cap) targets.push({ url: cap[1], from: `${file} captions`, expectBytes: null });
  }

  return targets;
}

async function check(target) {
  const problems = [];
  try {
    // Range request doubles as an existence and size probe: content-range
    // carries the authoritative total, which a HEAD does not reliably expose.
    const res = await fetch(target.url, { headers: { Range: 'bytes=0-0' } });

    if (res.status !== 206 && res.status !== 200) {
      problems.push(`HTTP ${res.status}`);
      return { ...target, problems };
    }

    if (target.ranged && res.status !== 206) {
      problems.push(`no ranged response (got ${res.status}); seeking will not work`);
    }

    const total = (res.headers.get('content-range') || '').match(/\/(\d+)\s*$/);
    const bytes = total ? parseInt(total[1], 10) : null;

    if (target.expectBytes && bytes && bytes !== target.expectBytes) {
      problems.push(`feed declares ${target.expectBytes} bytes, R2 serves ${bytes}`);
    }
    if (bytes === 0) problems.push('zero bytes');

    const ext = path.extname(new URL(target.url).pathname).toLowerCase();
    const expected = EXPECTED_TYPE[ext];
    const actual = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (expected && actual !== expected) {
      problems.push(`content-type ${actual || 'missing'}, expected ${expected}`);
    }

    await res.arrayBuffer().catch(() => {});
    return { ...target, bytes, problems };
  } catch (err) {
    problems.push(err.message);
    return { ...target, problems };
  }
}

async function main() {
  if (!fs.existsSync(FEED)) throw new Error(`no generated feed at ${FEED} -- run hugo first`);

  const targets = collectTargets();
  console.log(`Checking ${targets.length} published URLs\n`);

  const results = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(check))));
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, targets.length)}/${targets.length}`);
  }
  process.stdout.write('\n\n');

  const failed = results.filter((r) => r.problems.length);
  const totalBytes = results.reduce((n, r) => n + (r.bytes || 0), 0);

  console.log('='.repeat(60));
  console.log(`Reachable:   ${results.length - failed.length}/${results.length}`);
  console.log(`Total bytes: ${(totalBytes / 1073741824).toFixed(2)} GB`);

  if (failed.length) {
    console.log(`\nProblems (${failed.length}):`);
    for (const f of failed) console.log(`  - ${f.from}\n      ${f.url}\n      ${f.problems.join('; ')}`);
    throw new Error(`${failed.length} published URL(s) failed`);
  }

  console.log('\nEvery published URL resolves, serves the right type, and answers ranged requests.');
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
