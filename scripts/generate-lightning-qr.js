#!/usr/bin/env node
/**
 * Generate the Lightning tipping QR as a committed SVG asset.
 *
 * The payload never changes, so the QR is built once here rather than by a
 * runtime library. That keeps the support block working with JavaScript
 * disabled and adds no dependency to the page.
 *
 * qrencode's own SVG writer emits one <rect> per module (~26 KB) with a baked
 * white background. This collapses the modules into a single <path> and drops
 * the background, so the QR takes its ink from currentColor and obeys the
 * design tokens like any other mark.
 *
 * Requires qrencode (pacman -S qrencode).
 *
 * Usage:
 *   node scripts/generate-lightning-qr.js
 *   LN_ADDRESS=someone@example.com node scripts/generate-lightning-qr.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ADDRESS = process.env.LN_ADDRESS || 'trustrev@getalby.com';

// The lightning: scheme is what wallet scanners key on; the bare address alone
// is not recognised by every scanner.
const PAYLOAD = `lightning:${ADDRESS}`;

const OUT = path.join(__dirname, '..', 'assets', 'images', 'lightning-qr.svg');

/** Module grid from qrencode's ASCII output: two characters per module. */
function modules(payload) {
  const ascii = execFileSync(
    'qrencode',
    ['-t', 'ASCII', '-m', '0', '-l', 'M', '-o', '-', payload],
    { encoding: 'utf8' }
  );

  const rows = ascii.split('\n').filter((r) => r.length > 1);
  return rows.map((row) => {
    const cells = [];
    for (let i = 0; i < row.length; i += 2) {
      // qrencode's ASCII writer marks a dark module with '#' and leaves light
      // ones blank. Inverting this produces a negative no scanner will read.
      cells.push(row[i] === '#');
    }
    return cells;
  });
}

function toPath(grid) {
  const parts = [];
  for (let y = 0; y < grid.length; y++) {
    let runStart = null;
    for (let x = 0; x <= grid[y].length; x++) {
      const on = grid[y][x];
      if (on && runStart === null) runStart = x;
      if (!on && runStart !== null) {
        // Horizontal runs merged into one rect each: far fewer path commands
        // than a per-module emit, and identical output.
        parts.push(`M${runStart} ${y}h${x - runStart}v1h-${x - runStart}z`);
        runStart = null;
      }
    }
  }
  return parts.join('');
}

function main() {
  const grid = modules(PAYLOAD);
  const size = grid.length;
  if (!size || grid.some((r) => r.length < size)) {
    throw new Error(`unexpected QR grid ${size}x${grid[0] ? grid[0].length : 0}`);
  }

  const d = toPath(grid);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img" ` +
    `aria-label="Lightning payment code for ${ADDRESS}">` +
    `<path fill="currentColor" d="${d}"/>` +
    `</svg>\n`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, svg);

  console.log(`payload: ${PAYLOAD}`);
  console.log(`grid:    ${size}x${size} modules`);
  console.log(`output:  ${path.relative(path.join(__dirname, '..'), OUT)}  (${svg.length} bytes)`);
}

try {
  main();
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
}
