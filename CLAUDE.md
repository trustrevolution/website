# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Overview

Trust Revolution is a Hugo-powered podcast website deployed on Netlify. The site serves as a content hub for show notes, guest information, and written content, with prominent CTAs driving listeners to Fountain for sat streaming support.

## Technology Stack

- **Hugo**: Static site generator (v0.154.1+)
- **Netlify**: Hosting and deployment
- **Buttondown**: Email subscriptions
- **Fountain**: Primary listening platform (sat streaming)

## Architecture

### Content Structure
```
content/
├── episodes/          # Podcast episodes (s##e##.md format)
├── posts/             # Written content (analysis, research)
├── about.md           # About page
└── subscribe.md       # Subscribe/platforms page
```

### Episode Frontmatter
```yaml
---
title: "S01E## Guest Name — Title"
date: 2024-12-25
season: 1
episode: 12
guest:
  name: "Guest Name"
  bio: "Bio text"
  social:
    twitter: "https://twitter.com/handle"
    nostr: "npub..."
    website: "https://example.com"
fountain:
  episode_id: "xyz123"
youtube:
  video_id: "abc123"
featured_image: "/images/cover-art/s01e12.jpg"
description: "Episode hook - 2-3 sentences"
---
```

### Design System

**Brand Colors:**
- Primary Orange: #F04E23 (Trust Revolution vermillion)
- Text: #000000 (pure black)
- Background: #FAFAFA (off-white)

**Typography:**
- Display/Headers: DIN Condensed
- Body: System sans-serif stack

**Design Philosophy:** Bold, brutalist, high-contrast. No rounded corners, thick borders, hard shadows on hover.

**CSS Rules:**
- NO hardcoded values — use design tokens (`--spacing-*`, `--font-size-*`, `--max-width-*`, etc.)
- NO page-specific one-off styles — create reusable patterns
- Mobile-first — base styles for mobile, enhance in media queries

## Key Files

- `hugo.toml` - Site configuration
- `layouts/index.html` - Homepage template
- `layouts/episodes/single.html` - Episode page template
- `layouts/episodes/list.html` - Episode archive
- `layouts/partials/fountain-cta.html` - Listen CTA component
- `static/css/main.css` - Design system
- `netlify.toml` - Deployment config
- `.github/workflows/update-latest-episode.yml` - RSS automation

## Commands

```bash
# Development
hugo server -D

# Build
hugo --gc --minify

# Generate episode OG images
npm run generate:og

# Update episode data from RSS
node scripts/update-episode-data.js
```

## Adding a New Episode

**IMPORTANT: Always run the script first. Never manually create episode files.**

```bash
# 1. Run the script to pull episode data from RSS
node scripts/create-episode-from-rss.js

# 2. Process guest headshot (if provided)
magick ~/Downloads/guest-name.jpg -resize 800x800^ -gravity center -extent 800x800 -quality 90 assets/images/guests/guest-name.jpg
```

The script automatically:
- Pulls all metadata from the Fountain RSS feed (title, description, timestamps, resources, etc.)
- Downloads cover art
- Maps Fountain URLs
- Generates timestamps from transcript via Claude API (if ANTHROPIC_API_KEY is set)

After running, review the generated file and commit.

## Deployment

Deploys automatically on push to master/main branch via Netlify.

## Guest Headshots

Guest headshots are stored in color at `assets/images/guests/{slug}.jpg` (800x800 JPEG). Hugo applies a grayscale filter at build time for visual uniformity.

### Adding a New Guest Headshot

1. Source a high-quality image (minimum 400x400, square or croppable to square)
2. Process to 800x800 JPEG:
   ```bash
   magick input.jpg -resize 800x800^ -gravity center -extent 800x800 -quality 90 assets/images/guests/{slug}.jpg
   ```
3. The slug is derived using Hugo's `urlize` function on the guest's name:
   - Converts to lowercase
   - Strips diacritics (e.g., ë → e, ü → u)
   - Replaces spaces and special characters with hyphens
   - Examples:
     - "John Robb" → `john-robb.jpg`
     - "R.U. Sirius" → `r.u.-sirius.jpg`
     - "Matt O'Dell" → `matt-odell.jpg`
     - "Yaël Ossowski" → `yael-ossowski.jpg`

### How It Works

The `layouts/partials/guest-bio.html` and `layouts/guests/list.html` templates:
1. Generate a slug from the guest name using `| urlize`
2. Check if `assets/images/guests/{slug}.jpg` exists
3. If found, render via `layouts/partials/image.html` with `grayscale: true`

Hugo's `images.Grayscale` filter is applied at build time. Processed images are cached in `resources/` for fast rebuilds.

## TODO (Pre-Launch)

- [x] Full mobile test
- [x] Rework about copy
- [x] Font optimization, preloading, etc.
- [x] Lighthouse testing to determine areas of improvement
- [x] Favicon
- [x] Meta tags
- [x] og-images
- [x] JSON-LD structured data (entities)
- [x] Source and incorporate guest headshots
- [x] Episode-specific og-image generation

## TODO (Post-Launch)

- [ ] Automate new episode intake
- [ ] Update Support page copy to cover subscriptions, early access, streaming
