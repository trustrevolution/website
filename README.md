# Trust Revolution

Podcast website for [Trust Revolution](https://trustrevolution.co).

## Stack

- [Hugo](https://gohugo.io) static site generator
- [Netlify](https://netlify.com) hosting
- [Fountain](https://fountain.fm) for podcast distribution
- [Pagefind](https://pagefind.app) for search

## Prerequisites

- Hugo 0.154.1 or higher
- Node.js 20+
- npm 10+

## Quick Start

1. Clone and install dependencies:
   ```bash
   git clone git@github.com:trustrevolution/website.git
   cd website
   npm ci
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:1313

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Hugo dev server with drafts |
| `npm run build` | Build production site |
| `npm run generate:og` | Generate OG images for episodes and pages |
| `npm run fetch:youtube` | Fetch YouTube stats (requires API key) |

## Production Build

Full production build with search index:

```bash
npm run build && npx pagefind --site public
```

## Project Structure

```
content/
  episodes/     # Podcast episodes (s##e##.md)
  essays/       # Written content
  about.md      # About page
  support.md    # Support page
  why.md        # Why page

layouts/
  _default/     # Base templates
  episodes/     # Episode templates
  essays/       # Essay templates
  partials/     # Reusable components

assets/
  css/          # Stylesheets
  images/       # Processed images

static/
  js/           # Client-side JavaScript
  images/       # Static images

scripts/        # Build scripts
```

## License

All rights reserved.
