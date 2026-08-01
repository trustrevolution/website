#!/usr/bin/env node
/**
 * Derive WebVTT captions from the archived SRT transcripts.
 *
 * The <track> element only accepts WebVTT -- point it at an SRT and browsers
 * fail silently, so the video ships with captions that never appear. The feed
 * keeps using SRT, which is what podcast:transcript declares and what Fountain
 * served, so both formats are published rather than one replacing the other.
 *
 * The conversion is mechanical: a WEBVTT header, comma decimal separators
 * changed to periods, and the numeric cue indices dropped (legal in WebVTT but
 * meaningless). Text content is untouched.
 *
 * Usage:
 *   node scripts/srt-to-vtt.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ARCHIVE_DIR =
  process.env.ARCHIVE_DIR ||
  path.join(os.homedir(), 'Archive', 'trust-revolution-fountain');

const SRC = path.join(ARCHIVE_DIR, 'transcripts');
const OUT = path.join(ARCHIVE_DIR, 'captions');

const TIMECODE = /^(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})(.*)$/;

function convert(srt) {
  const lines = srt.replace(/^﻿/, '').split(/\r?\n/);
  const out = ['WEBVTT', ''];
  let cues = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tc = line.match(TIMECODE);

    if (tc) {
      // A bare number on the preceding line is an SRT cue index; WebVTT does
      // not need it and it is already emitted, so remove it.
      if (out.length && /^\d+$/.test(out[out.length - 1].trim())) out.pop();
      out.push(`${tc[1]}.${tc[2]} --> ${tc[3]}.${tc[4]}${tc[5]}`);
      cues += 1;
      continue;
    }
    out.push(line);
  }

  return { vtt: out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', cues };
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`no transcripts at ${SRC}`);
  fs.mkdirSync(OUT, { recursive: true });

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.srt')).sort();
  let converted = 0;
  const problems = [];

  for (const file of files) {
    const srt = fs.readFileSync(path.join(SRC, file), 'utf8');
    const { vtt, cues } = convert(srt);

    if (cues === 0) {
      problems.push(`${file}: no timecodes recognised`);
      continue;
    }

    const dest = path.join(OUT, file.replace(/\.srt$/, '.vtt'));
    fs.writeFileSync(dest, vtt);
    converted += 1;
    console.log(`  ${path.basename(dest).padEnd(40)} ${cues} cues`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Converted: ${converted}/${files.length}`);
  console.log(`Output:    ${OUT}`);

  if (problems.length) {
    console.log(`\nProblems (${problems.length}):`);
    for (const p of problems) console.log(`  - ${p}`);
    throw new Error(`${problems.length} transcript(s) failed to convert`);
  }
}

try {
  main();
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
}
