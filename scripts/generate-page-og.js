const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const CONTENT_DIR = path.join(__dirname, '../content');
const OUTPUT_DIR = path.join(__dirname, '../assets/images/og');

// Approximate character width for condensed bold font at 80px
const CHAR_WIDTH = 45;

function estimateTextWidth(text) {
  return text.length * CHAR_WIDTH;
}

async function generateOg({ output, headline, subtext, brand = 'TRUST REVOLUTION' }) {
  const outputPath = path.join(OUTPUT_DIR, output);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Calculate HR width to match headline
  const hrWidth = estimateTextWidth(headline);

  const svg = `
    <svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .headline {
          font-family: 'Arial Narrow', 'Helvetica Neue', sans-serif;
          font-size: 80px;
          font-weight: bold;
          fill: #FFFFFF;
        }
        .subtext {
          font-family: 'Arial Narrow', 'Helvetica Neue', sans-serif;
          font-size: 40px;
          font-weight: normal;
          fill: #FFFFFF;
        }
        .brand {
          font-family: 'Arial Narrow', 'Helvetica Neue', sans-serif;
          font-size: 28px;
          font-weight: bold;
          fill: #F04E23;
        }
      </style>

      <rect width="100%" height="100%" fill="#000000"/>
      <text x="60" y="175" class="headline">${headline}</text>
      <rect x="60" y="195" width="${hrWidth}" height="4" fill="#F04E23"/>
      <text x="60" y="280" class="subtext">${subtext[0] || ''}</text>
      <text x="60" y="330" class="subtext">${subtext[1] || ''}</text>
      <text x="1140" y="580" class="brand" text-anchor="end">${brand}</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  console.log(`  ${output}`);
}

async function main() {
  console.log('Generating OG images...\n');

  const pages = [];

  // Home page
  const homeFile = path.join(CONTENT_DIR, '_index.md');
  if (fs.existsSync(homeFile)) {
    const { data } = matter(fs.readFileSync(homeFile, 'utf-8'));
    if (data.og_headline) {
      pages.push({
        output: 'home.jpg',
        headline: data.og_headline,
        subtext: data.og_subtext || [],
        brand: data.og_brand || 'TRUST REVOLUTION'
      });
    }
  }

  // Static pages (why, about, support)
  for (const page of ['why', 'about', 'support']) {
    const file = path.join(CONTENT_DIR, `${page}.md`);
    if (fs.existsSync(file)) {
      const { data } = matter(fs.readFileSync(file, 'utf-8'));
      if (data.og_headline) {
        pages.push({
          output: `${page}.jpg`,
          headline: data.og_headline,
          subtext: data.og_subtext || [],
          brand: 'TRUST REVOLUTION'
        });
      }
    }
  }

  // Essays
  const essaysDir = path.join(CONTENT_DIR, 'essays');
  if (fs.existsSync(essaysDir)) {
    const essayFiles = fs.readdirSync(essaysDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'));

    for (const file of essayFiles) {
      const { data } = matter(fs.readFileSync(path.join(essaysDir, file), 'utf-8'));
      if (data.slug) {
        pages.push({
          output: `essays/${data.slug}.jpg`,
          headline: (data.og_headline || data.title || '').toUpperCase(),
          subtext: data.og_subtext || [],
          brand: 'TRUST REVOLUTION'
        });
      }
    }
  }

  // Generate all
  for (const page of pages) {
    await generateOg(page);
  }

  console.log(`\nDone. Generated ${pages.length} image(s).`);
}

main().catch(console.error);
