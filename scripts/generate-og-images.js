const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const COVER_SIZE = 630;
const BAR_WIDTH = (OG_WIDTH - COVER_SIZE) / 2;

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
    console.log(`  Skip: ${episodeId} (no cover)`);
    return null;
  }

  // Check if OG image exists and is newer than episode file
  if (fs.existsSync(outputPath)) {
    const episodeStat = fs.statSync(episodePath);
    const ogStat = fs.statSync(outputPath);

    if (ogStat.mtime > episodeStat.mtime) {
      return null; // OG image is up to date
    }
    // If episode is newer, regenerate
    console.log(`  Regenerating ${episodeId}.jpg (episode updated)`);
  }

  const cover = await sharp(coverPath)
    .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover' })
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

  console.log(`  ${episodeId}.jpg`);
  return outputPath;
}

async function main() {
  console.log('Generating OG images...');
  const episodes = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md')).sort();
  let generated = 0;
  for (const file of episodes) {
    const result = await generateOgImage(path.join(CONTENT_DIR, file));
    if (result) generated++;
  }
  console.log(`Done. Generated ${generated} new image(s).`);
}

main().catch(console.error);
