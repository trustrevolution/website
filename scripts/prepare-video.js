#!/usr/bin/env node
/**
 * Make the local video masters streamable without re-encoding them.
 *
 * The Riverside masters are already H.264/AAC in MP4 at 1080p, which every
 * browser plays natively -- there is nothing to transcode, and transcoding would
 * throw away picture quality for no gain. What they are not is *streamable*: all
 * 37 carry the `moov` atom after `mdat`, so a browser must download the whole
 * file before it can start playback.
 *
 * `-c copy -movflags +faststart` rewrites the container with the header first
 * and copies both streams bit-for-bit. Same video, same audio, same bitrate;
 * it runs at disk speed rather than CPU speed.
 *
 * Masters are never modified. Output goes next to the Fountain archive so one
 * directory holds everything destined for R2.
 *
 * Usage:
 *   node scripts/prepare-video.js --list
 *   node scripts/prepare-video.js
 *   node scripts/prepare-video.js --force
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const REPORT = path.join(__dirname, '..', 'docs', 'plans', 'video-master-reconciliation.json');

const ARCHIVE_DIR =
  process.env.ARCHIVE_DIR ||
  path.join(os.homedir(), 'Archive', 'trust-revolution-fountain');

const OUT_DIR = path.join(ARCHIVE_DIR, 'video');

const LIST_ONLY = process.argv.includes('--list');
const FORCE = process.argv.includes('--force');

function untildify(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function probe(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0',
     '-show_entries', 'stream=codec_name,width,height',
     '-show_entries', 'format=duration',
     '-of', 'json', file],
    { encoding: 'utf8', timeout: 120000 }
  );
  const d = JSON.parse(out || '{}');
  const s = (d.streams || [{}])[0];
  return {
    codec: s.codec_name,
    width: s.width,
    height: s.height,
    duration: Math.round(parseFloat((d.format || {}).duration || '0'))
  };
}

/** True when the moov atom precedes mdat, i.e. playback can start early. */
function isFaststart(file) {
  const fd = fs.openSync(file, 'r');
  const order = [];
  try {
    let pos = 0;
    const head = Buffer.alloc(16);
    while (order.length < 12) {
      const n = fs.readSync(fd, head, 0, 8, pos);
      if (n < 8) break;
      let size = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      order.push(type);
      if (size === 1) {
        fs.readSync(fd, head, 0, 8, pos + 8);
        size = Number(head.readBigUInt64BE(0));
      } else if (size === 0) {
        break;
      }
      pos += size;
    }
  } finally {
    fs.closeSync(fd);
  }
  const moov = order.indexOf('moov');
  const mdat = order.indexOf('mdat');
  return moov !== -1 && mdat !== -1 && moov < mdat;
}

function remux(input, output) {
  return new Promise((resolve, reject) => {
    const tmp = `${output}.partial`;
    const proc = spawn(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-nostats', '-y',
       '-i', input,
       '-c', 'copy',
       '-movflags', '+faststart',
       '-f', 'mp4',
       tmp],
      { stdio: ['ignore', 'inherit', 'inherit'] }
    );
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        return reject(new Error(`ffmpeg exited ${code}`));
      }
      fs.renameSync(tmp, output);
      resolve();
    });
  });
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const jobs = [];
  const skipped = [];

  for (const ep of report.episodes) {
    if (!ep.master) { skipped.push(`${ep.key} -- no master`); continue; }
    const input = untildify(ep.master.path);
    if (!fs.existsSync(input)) { skipped.push(`${ep.key} -- master missing`); continue; }
    const output = path.join(OUT_DIR, `${ep.slug}.mp4`);
    if (fs.existsSync(output) && !FORCE) { skipped.push(`${ep.key} -- already prepared`); continue; }
    jobs.push({ ...ep, input, output });
  }

  console.log(`Output: ${OUT_DIR}`);
  console.log(`To prepare: ${jobs.length}   skipping: ${skipped.length}\n`);

  if (LIST_ONLY) {
    for (const j of jobs) console.log(`  ${j.slug}  <- ${path.basename(j.input)}`);
    return;
  }

  const failures = [];
  let n = 0;

  for (const job of jobs) {
    n += 1;
    const before = probe(job.input);
    const started = Date.now();
    process.stdout.write(`[${n}/${jobs.length}] ${job.slug} ... `);

    try {
      await remux(job.input, job.output);
    } catch (err) {
      failures.push(`${job.slug}: ${err.message}`);
      console.log(`FAILED: ${err.message}`);
      continue;
    }

    const after = probe(job.output);
    const bytes = fs.statSync(job.output).size;
    const problems = [];

    // A remux that silently re-encoded or truncated is the failure that matters.
    if (after.codec !== before.codec) problems.push(`codec changed ${before.codec} -> ${after.codec}`);
    if (after.width !== before.width || after.height !== before.height) {
      problems.push(`resolution changed ${before.width}x${before.height} -> ${after.width}x${after.height}`);
    }
    if (Math.abs(after.duration - before.duration) > 2) {
      problems.push(`duration changed ${before.duration}s -> ${after.duration}s`);
    }
    if (!isFaststart(job.output)) problems.push('still not faststart');

    if (problems.length) {
      failures.push(`${job.slug}: ${problems.join('; ')}`);
      console.log(`PROBLEM: ${problems.join('; ')}`);
      continue;
    }

    console.log(
      `${(bytes / 1048576).toFixed(0)} MB  ${after.width}x${after.height}  ${((Date.now() - started) / 1000).toFixed(1)}s`
    );
  }

  const done = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp4'));
  const total = done.reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0);

  console.log('\n' + '='.repeat(60));
  console.log(`Prepared: ${done.length}/${report.episodes.length}`);
  console.log(`Total:    ${(total / 1073741824).toFixed(1)} GB`);

  if (failures.length) {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f}`);
    throw new Error(`${failures.length} failure(s)`);
  }
  console.log('\nAll streams copied without re-encoding.');
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
