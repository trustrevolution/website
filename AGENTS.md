# AGENTS.md

Instructions for AI coding agents working in this repository.

## Quick Reference

```bash
# Development server (includes drafts)
hugo server -D

# Production build
hugo --gc --minify

# Full build with OG images and search index
npm ci && npm run build

# Generate OG images only
npm run generate:og

# Update episode data from RSS
node scripts/update-episode-data.js
```

## Technology Stack

- **Hugo** v0.154.1+ (static site generator)
- **Node.js** 20+ (build scripts)
- **Netlify** (hosting, auto-deploys on push to main/master)
- **Pagefind** (search, generated at build time)
- **sharp** (image processing for OG images)

## Project Structure

```
content/           # Markdown content
  episodes/        # Podcast episodes (s##e##-slug.md)
  essays/          # Written content
layouts/           # Hugo templates
  partials/        # Reusable components
  shortcodes/      # Content shortcodes
assets/
  css/main.css     # Single CSS file (~2200 lines)
  images/          # Hugo-processed images
static/
  js/              # Client-side JavaScript
  fonts/           # Web fonts
scripts/           # Build/utility scripts (Node.js, Python)
data/              # JSON data files
```

## Testing

**No test suite exists.** Validate changes by:
1. Running `hugo server -D` and checking the browser
2. Running `hugo --gc --minify` to ensure build succeeds
3. Checking browser console for JavaScript errors

## Code Style Guidelines

### CSS (assets/css/main.css)

**Design Tokens — ALWAYS use CSS custom properties:**
```css
/* Good */
padding: var(--spacing-md);
color: var(--accent-orange);
font-family: var(--font-display);

/* Bad — never hardcode */
padding: 20px;
color: #F04E23;
```

**Available token categories:**
- Colors: `--text-*`, `--accent-*`, `--bg-*`, `--border-*`
- Spacing: `--spacing-xs` through `--spacing-xl`
- Typography: `--font-size-*`, `--font-display`
- Layout: `--max-width-narrow`, `--max-width-content`
- Borders: `--border-thin`, `--border-component`, `--border-section`
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

**Mobile-first responsive design:**
```css
/* Base styles = mobile */
.component { padding: var(--spacing-sm); }

/* Enhance for larger screens */
@media (min-width: 768px) {
  .component { padding: var(--spacing-md); }
}
```

**Naming conventions:**
- BEM-like: `.episode-card`, `.episode-card .card-content`
- State classes: `.is-open`, `.is-selected`
- Utilities: `.sr-only`, `.fade-in`

**Design philosophy:** Brutalist — no rounded corners, thick borders, hard offset shadows on hover.

### JavaScript (static/js/)

**Pattern:** IIFE (Immediately Invoked Function Expression)
```javascript
(function() {
  // Guard against missing elements
  const element = document.getElementById('my-element');
  if (!element) {
    console.warn('MyFeature: Required element not found');
    return;
  }

  // State object for complex components
  const state = {
    isOpen: false,
    selectedIndex: -1
  };

  // Implementation...
})();
```

**Conventions:**
- Use `const` by default, `let` when reassignment needed
- Early return with guard clauses
- ARIA attributes for accessibility (`aria-expanded`, etc.)
- No external dependencies (vanilla JS only)

### Hugo Templates (layouts/)

**Partial invocation with dict:**
```go
{{ partial "image.html" (dict 
  "src" .Params.featured_image 
  "alt" .Title 
  "width" 400 
  "grayscale" true
) }}

{{ partial "episode-card.html" (dict 
  "RelPermalink" .RelPermalink 
  "Params" .Params 
  "Title" .Title 
  "headingLevel" "h3"
) }}
```

**Conditionals and loops:**
```go
{{ with .Params.guest }}
  <p>{{ .name }}</p>
{{ end }}

{{ range first 5 .Pages }}
  {{ partial "episode-card.html" . }}
{{ end }}
```

### Episode Frontmatter Schema

```yaml
---
title: "S02E16 Guest Name — Episode Title"
date: 2025-12-18
draft: false
slug: s02e16-guest-name
season: 2
episode: 16
description: "2-3 sentence hook"
summary: |
  Multi-line summary with markdown...
featured_image: "images/cover-art/s02e16.jpg"
audio_url: "https://feeds.fountain.fm/..."
duration: "1:08:58"
fountain_url: "https://fountain.fm/episode/..."
guest:
  name: "Guest Name"
  bio: "Full bio text..."
  social:
    nostr: "https://primal.net/p/..."
    twitter: "https://twitter.com/..."
guests:
  - Guest Name    # For taxonomy
timestamps:
  - time: "00:44"
    topic: "Topic description"
resources:
  - name: "Resource Name"
    url: "https://..."
---
```

## Guest Headshots

Store at `assets/images/guests/{slug}.jpg` (800x800 JPEG, color).

**Slug derivation** (Hugo's `urlize`):
- "John Robb" → `john-robb.jpg`
- "Yaël Ossowski" → `yael-ossowski.jpg`

**Process new headshot:**
```bash
magick input.jpg -resize 800x800^ -gravity center -extent 800x800 -quality 90 assets/images/guests/{slug}.jpg
```

Hugo applies grayscale filter at build time via `layouts/partials/image.html`.

## Brand Guidelines

| Element | Value |
|---------|-------|
| Primary Orange | #F04E23 |
| Text Black | #000000 |
| Background | #FAFAFA |
| Display Font | DIN Condensed |
| Body Font | System sans-serif |

## Key Files

| File | Purpose |
|------|---------|
| `hugo.toml` | Site configuration |
| `assets/css/main.css` | Design system (single file) |
| `layouts/partials/image.html` | Responsive image processing |
| `layouts/episodes/single.html` | Episode page template |
| `scripts/generate-og-images.js` | OG image generation |
| `netlify.toml` | Deployment config |

## Common Tasks

**Add new episode:**
1. Create `content/episodes/s##e##-slug.md` with frontmatter
2. Add cover art to `assets/images/cover-art/s##e##.jpg`
3. Add guest headshot if new guest
4. Run `hugo server -D` to preview

**Modify design:**
1. Edit `assets/css/main.css`
2. Use existing design tokens
3. Follow mobile-first pattern
4. Test at 320px, 768px, 1024px widths

**Add new partial:**
1. Create `layouts/partials/name.html`
2. Accept parameters via `dict`
3. Document expected parameters in comments
