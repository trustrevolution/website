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

## Documented Solutions

`docs/solutions/` is this repo's knowledge store: solved problems written up so
the next occurrence takes minutes instead of an afternoon. Search it before
digging into an area — by category directory, or by the `module`, `tags` and
`problem_type` fields in each file's frontmatter.

After a solved, verified problem produces a non-trivial, reusable learning,
automatically invoke the `ce-compound` skill, passing `mode:headless` as the
skill argument. This repository accepts `docs/solutions/` as a tracked knowledge
store. Do it before handing the result back, not at some later "end" of the
session — a verified fix is the trigger.

The bar is a generalisable insight worth re-reading, not merely an expensive
one-off. A typo fix is not a learning; a wrong measurement that sent three
attempts in the wrong direction is.

## Key Files

- `hugo.toml` - Site configuration
- `layouts/index.html` - Homepage template
- `layouts/episodes/single.html` - Episode page template
- `layouts/episodes/list.html` - Episode archive
- `layouts/partials/media-player.html` - Audio/video transport
- `layouts/partials/lightning-pay.html` - Lightning payment plate (/support/)
- `layouts/index.podcast.xml` - Podcast RSS feed
- `assets/css/main.css` - Design system
- `assets/js/` - Client-side JS, fingerprinted through Hugo's asset pipeline
- `scripts/verify-feed.js` - Build gate: fails if the feed drifts from the archive
- `netlify.toml` - Deployment config
- `.github/workflows/update-latest-episode.yml` - Fountain RSS import, manual dispatch only

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

## Design Context

### Users
Broad tech audience — anyone interested in technology, trust systems, and the future of the internet. They come to the site to find episodes, learn about guests, and decide whether to listen. Many arrive from social shares or search. They range from Bitcoin-curious developers to experienced operators, but the site should never assume insider knowledge or tribal affiliation.

### Brand Personality
**Direct, Uncompromising, Bold.** Trust Revolution says what others won't. The voice is confrontational in a constructive way — it challenges assumptions, asks hard questions, and refuses to soften the message. No hedging, no corporate-speak, no hype. The tagline "Stream sats, not ads" captures the ethos: opt out of the broken model.

### Aesthetic Direction
- **Visual tone:** Brutalist, high-contrast, typographically driven. DIN Condensed headers in uppercase create an industrial, poster-like feel. Pure black text on off-white. Vermillion (#F04E23) as the sole accent color — used sparingly for maximum impact.
- **Key patterns:** No rounded corners. Thick black borders. Hard offset shadows on hover. Grayscale guest photos. Fluid spacing via clamp(). Mobile-first everything.
- **References:** Punk zines, Swiss typographic posters, Bloomberg Terminal density. The confidence of a manifesto, the clarity of a broadsheet.
- **Anti-references:** No crypto bro / Web3 aesthetic — no gradients, neon, dark-mode-by-default, "wagmi" energy, or speculative hype culture. No generic podcast templates. No soft pastels, stock photography, or rounded-corner card UI.
- **Theme:** Light mode only. Black background bleeds at html level for edge framing.

### Design Principles
1. **Content is the interface.** Typography, spacing, and hierarchy do the work — not decoration. Every element earns its place.
2. **Brutalist, not broken.** Sharp edges and hard shadows are intentional choices, not lack of polish. Craft is in the precision.
3. **One color means something.** Vermillion marks action and emphasis. If everything is orange, nothing is.
4. **Tokens, not magic numbers.** Every spacing, font size, and dimension comes from the design token system. No one-off values.
5. **Mobile-first, always.** Base styles target small screens. Larger viewports enhance — never the other way around.

### Accessibility
- WCAG AA compliance as baseline — contrast ratios, keyboard navigation, screen reader support
- Semantic HTML throughout (skip links, aria labels, landmark roles already in place)
- `font-display: swap` for web fonts, `prefers-reduced-motion` respected for animations
- Touch targets minimum 44px
