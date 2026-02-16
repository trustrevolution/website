const fs = require('fs');
const path = require('path');
const https = require('https');

const CONTENT_DIR = path.join(__dirname, '../content/episodes');
const TRANSCRIPT_DIR = path.join(__dirname, '../data/transcripts');

// Ensure transcript directory exists
if (!fs.existsSync(TRANSCRIPT_DIR)) {
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
}

// Clean existing transcripts
const existing = fs.readdirSync(TRANSCRIPT_DIR).filter(f => f.endsWith('.json'));
// Keep existing files for incremental runs

/**
 * Fetch a URL and return the response body as a string
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse SRT content into clean text paragraphs grouped by timestamp blocks
 */
function parseSrt(srtContent) {
  const blocks = srtContent.trim().split(/\n\n+/);
  const segments = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    // Line 0: sequence number
    // Line 1: timestamp (00:00:00,000 --> 00:00:03,000)
    // Lines 2+: text
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!timeMatch) continue;

    const text = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim();
    if (!text) continue;

    segments.push({
      hours: parseInt(timeMatch[1]),
      minutes: parseInt(timeMatch[2]),
      seconds: parseInt(timeMatch[3]),
      text
    });
  }

  return segments;
}

/**
 * Group SRT segments into paragraphs (roughly every 60 seconds)
 */
function segmentsToParagraphs(segments, intervalSeconds = 60) {
  if (segments.length === 0) return '';

  const paragraphs = [];
  let currentParagraph = [];
  let paragraphStartTime = 0;

  for (const seg of segments) {
    const segTime = seg.hours * 3600 + seg.minutes * 60 + seg.seconds;

    if (currentParagraph.length > 0 && segTime - paragraphStartTime >= intervalSeconds) {
      paragraphs.push(currentParagraph.join(' '));
      currentParagraph = [];
      paragraphStartTime = segTime;
    }

    if (currentParagraph.length === 0) {
      paragraphStartTime = segTime;
    }
    currentParagraph.push(seg.text);
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(' '));
  }

  return paragraphs.join('\n\n');
}

/**
 * Extract frontmatter from a markdown file
 */
function extractFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    if (kvMatch) {
      fm[kvMatch[1]] = kvMatch[2];
    }
  }
  return fm;
}

async function main() {
  const episodeFiles = fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of episodeFiles) {
    const slug = file.replace('.md', '');
    const transcriptPath = path.join(TRANSCRIPT_DIR, `${slug}.json`);

    // Skip if already downloaded
    if (fs.existsSync(transcriptPath)) {
      skipped++;
      continue;
    }

    const fm = extractFrontmatter(path.join(CONTENT_DIR, file));
    if (!fm.transcript_url) {
      console.log(`  [skip] ${slug}: no transcript_url`);
      skipped++;
      continue;
    }

    console.log(`  [download] ${slug}...`);
    try {
      const srtContent = await fetchUrl(fm.transcript_url);
      const segments = parseSrt(srtContent);
      const text = segmentsToParagraphs(segments);

      if (text.length < 100) {
        console.log(`    [warn] Very short transcript (${text.length} chars), skipping`);
        failed++;
        continue;
      }

      const paragraphs = text.split('\n\n').filter(p => p.trim());
      fs.writeFileSync(transcriptPath, JSON.stringify({ paragraphs }));
      console.log(`    [ok] ${text.length} chars, ${paragraphs.length} paragraphs`);
      downloaded++;
    } catch (err) {
      console.log(`    [error] ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
}

main().catch(console.error);
