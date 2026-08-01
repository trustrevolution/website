#!/usr/bin/env node
/**
 * Match every published episode to a local video master before encoding.
 *
 * Video for the R2 migration comes from local Riverside exports, not from
 * Fountain's HLS ladder -- see KTD2 in
 * docs/plans/2026-08-01-001-feat-fountain-to-r2-migration-plan.md. This script
 * reports which episodes have a usable master, which have only clips, and which
 * are missing entirely, so the gaps can be re-exported from Riverside before the
 * Fountain subscription lapses.
 *
 * Published durations come from content/episodes/ front matter rather than the
 * Fountain feed, because the feed's own season/episode numbering is wrong (it
 * tags two different episodes as S01E10).
 *
 * Usage:
 *   node scripts/reconcile-video-masters.js
 *   VIDEO_DIR="/mnt/media/TR" node scripts/reconcile-video-masters.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const VIDEO_DIR =
  process.env.VIDEO_DIR || path.join(os.homedir(), 'Videos', 'Trust Revolution');

const REPORT_PATH = path.join(
  __dirname,
  '..',
  'docs',
  'plans',
  'video-master-reconciliation.json'
);

/** Reports are committed to a public repo, so paths are written home-relative. */
function tildify(p) {
  return p.startsWith(os.homedir()) ? p.replace(os.homedir(), '~') : p;
}

/** Seconds of drift tolerated before a master counts as a different cut. */
const CUT_TOLERANCE_SECONDS = 120;

/** Anything shorter than this in an episode directory is a promo clip. */
const CLIP_CEILING_SECONDS = 600;

/**
 * Directories whose names predate the SxxExx convention. Without this the
 * trailer looks like a missing master when its file is sitting right there.
 */
const DIRECTORY_ALIASES = {
  'Season 1 Trailer': 'S01E00'
};

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.m4v']);

function parseDuration(hhmmss) {
  const parts = hhmmss.split(':').map((n) => parseInt(n, 10));
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/** Published episodes keyed SxxExx, from repo front matter. */
function readPublishedEpisodes() {
  const dir = path.join(__dirname, '..', 'content', 'episodes');
  const episodes = new Map();

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');

    const season = text.match(/^season:\s*(\d+)/m);
    const episode = text.match(/^episode:\s*(\d+)/m);
    if (!season || !episode) continue;

    // Only episodes with published audio are in scope; _index and drafts are not.
    if (!/^audio_url:\s*"\S+"/m.test(text)) continue;

    const slugField = text.match(/^slug:\s*(.+)$/m);
    const durationField = text.match(/^duration:\s*"([\d:]+)"/m);
    const key = `S${season[1].padStart(2, '0')}E${episode[1].padStart(2, '0')}`;

    episodes.set(key, {
      key,
      slug: (slugField ? slugField[1].trim() : path.basename(file, '.md')).replace(/^["']|["']$/g, ''),
      file: path.join('content/episodes', file),
      publishedDuration: durationField ? parseDuration(durationField[1]) : null
    });
  }

  return episodes;
}

function probeDuration(file) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8', timeout: 60000 }
    );
    const seconds = parseFloat(out.trim());
    return Number.isFinite(seconds) ? Math.round(seconds) : null;
  } catch (err) {
    console.warn(`  ! ffprobe failed on ${path.basename(file)}: ${err.message}`);
    return null;
  }
}

function probeResolution(file) {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0',
        file
      ],
      { encoding: 'utf8', timeout: 60000 }
    );
    const [width, height] = out.trim().split(',').map((n) => parseInt(n, 10));
    return Number.isInteger(width) && Number.isInteger(height) ? { width, height } : null;
  } catch {
    return null;
  }
}

/** Episode-directory key for a path, honoring the alias table. */
function episodeKeyFor(dirName) {
  if (DIRECTORY_ALIASES[dirName]) return DIRECTORY_ALIASES[dirName];
  const m = dirName.match(/^(S\d{2}E\d{2})/i);
  return m ? m[1].toUpperCase() : null;
}

function collectCandidates() {
  const byEpisode = new Map();

  if (!fs.existsSync(VIDEO_DIR)) {
    throw new Error(`video directory not found: ${VIDEO_DIR} (set VIDEO_DIR to override)`);
  }

  for (const season of fs.readdirSync(VIDEO_DIR, { withFileTypes: true })) {
    if (!season.isDirectory()) continue;
    const seasonPath = path.join(VIDEO_DIR, season.name);

    for (const episode of fs.readdirSync(seasonPath, { withFileTypes: true })) {
      if (!episode.isDirectory()) continue;

      const key = episodeKeyFor(episode.name);
      if (!key) continue;

      const episodePath = path.join(seasonPath, episode.name);
      const files = fs
        .readdirSync(episodePath)
        .filter((f) => VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()))
        .map((f) => path.join(episodePath, f));

      if (files.length) {
        byEpisode.set(key, (byEpisode.get(key) || []).concat(files));
      }
    }
  }

  return byEpisode;
}

function main() {
  console.log(`Video directory: ${VIDEO_DIR}\n`);

  const published = readPublishedEpisodes();
  const candidates = collectCandidates();

  console.log(`${published.size} published episodes, ${candidates.size} episode directories\n`);

  const results = [];

  for (const key of [...published.keys()].sort()) {
    const episode = published.get(key);
    const files = candidates.get(key) || [];

    const probed = files
      .map((file) => ({ file, duration: probeDuration(file) }))
      .filter((c) => c.duration != null)
      .sort((a, b) => b.duration - a.duration);

    if (!probed.length) {
      results.push({ ...episode, status: 'missing', master: null, delta: null });
      continue;
    }

    // The longest file in an episode directory is the full recording; the rest
    // are promo clips cut from it.
    const best = probed[0];

    let status;
    let delta = null;

    if (best.duration < CLIP_CEILING_SECONDS && (episode.publishedDuration || 0) >= CLIP_CEILING_SECONDS) {
      status = 'clip-only';
    } else if (episode.publishedDuration == null) {
      status = 'unknown-published-duration';
    } else {
      delta = best.duration - episode.publishedDuration;
      status = Math.abs(delta) <= CUT_TOLERANCE_SECONDS ? 'matched' : 'different-cut';
    }

    results.push({
      ...episode,
      status,
      delta,
      master: {
        path: tildify(best.file),
        duration: best.duration,
        resolution: probeResolution(best.file),
        bytes: fs.statSync(best.file).size
      },
      otherFilesInDirectory: probed.length - 1
    });
  }

  // Report.
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `${pad('EPISODE', 9)}${pad('PUBLISHED', 11)}${pad('MASTER', 9)}${pad('DELTA', 8)}${pad('RES', 11)}STATUS`
  );

  for (const r of results) {
    const res = r.master?.resolution ? `${r.master.resolution.width}x${r.master.resolution.height}` : '-';
    console.log(
      pad(r.key, 9) +
        pad(r.publishedDuration ?? '-', 11) +
        pad(r.master?.duration ?? '-', 9) +
        pad(r.delta == null ? '-' : (r.delta > 0 ? `+${r.delta}` : r.delta), 8) +
        pad(res, 11) +
        (r.status === 'matched' ? 'ok' : r.status.toUpperCase())
    );
  }

  const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const needsWork = results.filter((r) => r.status !== 'matched');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), videoDir: tildify(VIDEO_DIR), counts, episodes: results },
      null,
      2
    ) + '\n'
  );

  console.log('\n' + '='.repeat(60));
  for (const [status, count] of Object.entries(counts)) {
    console.log(`${pad(status, 28)}${count}`);
  }
  console.log(`\nReport: ${REPORT_PATH}`);

  if (needsWork.length) {
    console.log(`\nNeeds a Riverside re-export (${needsWork.length}):`);
    for (const r of needsWork) {
      const detail =
        r.status === 'different-cut'
          ? `local is ${r.delta > 0 ? `${r.delta}s longer` : `${-r.delta}s shorter`} than published`
          : r.status;
      console.log(`  ${r.key}  ${r.slug} -- ${detail}`);
    }
  } else {
    console.log('\nEvery published episode has a matching local master.');
  }
}

try {
  main();
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
}
