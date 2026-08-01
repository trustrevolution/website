#!/usr/bin/env node
/**
 * Extract a real poster frame from each episode video.
 *
 * The video was previously postered with the episode cover art, which put the
 * same image on screen twice within one viewport -- once in the sidebar and
 * again in the video frame -- and made the page read as repetitive rather than
 * as two distinct things.
 *
 * A frame from the conversation itself shows what the video actually is.
 * Sampled at 25% of the runtime to land inside the conversation rather than on
 * an intro card or a title slate.
 *
 * Usage:
 *   node scripts/generate-video-posters.js
 *   node scripts/generate-video-posters.js --force
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ARCHIVE_DIR =
  process.env.ARCHIVE_DIR ||
  path.join(os.homedir(), 'Archive', 'trust-revolution-fountain');

const VIDEO_DIR = path.join(ARCHIVE_DIR, 'video');
const OUT_DIR = path.join(ARCHIVE_DIR, 'posters');

const FORCE = process.argv.includes('--force');
const SAMPLE_FRACTION = 0.25;
const WIDTH = 1280;

function duration(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8', timeout: 60000 }
  );
  const s = parseFloat(out.trim());
  return Number.isFinite(s) ? s : null;
}

function grab(input, output, atSeconds) {
  execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y',
     // -ss before -i seeks by keyframe, which is near-instant on a faststart file.
     '-ss', String(atSeconds),
     '-i', input,
     '-frames:v', '1',
     '-vf', `scale=${WIDTH}:-2`,
     '-q:v', '4',
     output],
    { timeout: 120000 }
  );
}

function main() {
  if (!fs.existsSync(VIDEO_DIR)) throw new Error(`no prepared video at ${VIDEO_DIR}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const videos = fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith('.mp4')).sort();
  const failures = [];
  let made = 0, skipped = 0;

  for (const [i, file] of videos.entries()) {
    const slug = path.basename(file, '.mp4');
    const input = path.join(VIDEO_DIR, file);
    const output = path.join(OUT_DIR, `${slug}.jpg`);

    if (fs.existsSync(output) && !FORCE) { skipped += 1; continue; }

    const dur = duration(input);
    if (!dur) { failures.push(`${slug}: could not read duration`); continue; }

    const at = Math.max(1, Math.floor(dur * SAMPLE_FRACTION));
    try {
      grab(input, output, at);
    } catch (err) {
      failures.push(`${slug}: ${err.message.split('\n')[0]}`);
      continue;
    }

    const bytes = fs.statSync(output).size;
    if (bytes < 5000) {
      failures.push(`${slug}: poster is only ${bytes} bytes, likely a blank frame`);
      continue;
    }

    made += 1;
    console.log(`[${i + 1}/${videos.length}] ${slug}  ${Math.round(at)}s  ${(bytes / 1024).toFixed(0)} KB`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Created: ${made}   already present: ${skipped}   failed: ${failures.length}`);
  console.log(`Output:  ${OUT_DIR}`);

  if (failures.length) {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f}`);
    throw new Error(`${failures.length} poster(s) failed`);
  }
}

try {
  main();
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
}
