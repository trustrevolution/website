const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const COVER_SIZE = 630;
const BAR_WIDTH = (OG_WIDTH - COVER_SIZE) / 2;
const CONCURRENCY_LIMIT = 5;

const CONTENT_DIR = path.join(__dirname, '../content/episodes');
const COVER_DIR = path.join(__dirname, '../assets/images/cover-art');
const OUTPUT_DIR = path.join(__dirname, '../assets/images/og');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateOgImage(episodePath) {
  const content = fs.readFileSync(episodePath, 'utf-8');
  const { data } = matter(content);

  const episodeId = `s${String(data.season).padStart(2, '0')}e${String(data.episode).padStart(2, '0')}`;
  const coverPath = path.join(COVER_DIR, `${episodeId}.jpg`);
  const outputPath = path.join(OUTPUT_DIR, `${episodeId}.jpg`);

  if (!fs.existsSync(coverPath)) {
    return { status: 'skip', episodeId, reason: 'no cover' };
  }

  // Check if OG image exists and is newer than episode file
  if (fs.existsSync(outputPath)) {
    const episodeStat = fs.statSync(episodePath);
    const ogStat = fs.statSync(outputPath);

    if (ogStat.mtime > episodeStat.mtime) {
      return { status: 'skip', episodeId, reason: 'up to date' };
    }
  }

  const cover = await sharp(coverPath)
    .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover', position: 'centre' })
    .toBuffer();

  await sharp({
    create: {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
    .composite([{ input: cover, left: BAR_WIDTH, top: 0 }])
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  return { status: 'generated', episodeId };
}

// Process items in parallel with a concurrency limit
async function parallelLimit(items, fn, limit) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const promise = Promise.resolve().then(() => fn(item));
    results.push(promise);
    executing.add(promise);

    const cleanup = () => executing.delete(promise);
    promise.then(cleanup, cleanup);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

async function main() {
  console.log('Generating OG images...');
  const episodes = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md')).sort();
  const episodePaths = episodes.map(file => path.join(CONTENT_DIR, file));

  const results = await parallelLimit(
    episodePaths,
    async (episodePath) => {
      try {
        return await generateOgImage(episodePath);
      } catch (err) {
        const file = path.basename(episodePath);
        console.error(`  Error processing ${file}: ${err.message}`);
        return { status: 'error', file, error: err.message };
      }
    },
    CONCURRENCY_LIMIT
  );

  // Report results
  const generated = results.filter(r => r.status === 'generated');
  const errors = results.filter(r => r.status === 'error');

  for (const result of generated) {
    console.log(`  ${result.episodeId}.jpg`);
  }

  console.log(`Done. Generated ${generated.length} new image(s).`);
  
  if (errors.length > 0) {
    console.error(`Failed to process ${errors.length} file(s):`);
    errors.forEach(e => console.error(`  - ${e.file}: ${e.error}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
