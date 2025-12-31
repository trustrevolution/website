# Refactoring Testing Checklist

## Build Tests

- [ ] `hugo --gc --minify` builds without errors
- [ ] `hugo server -D` runs without warnings
- [ ] `npm run generate:og` completes successfully
- [ ] No template execution errors in console

---

## Page-by-Page Visual Tests

### Homepage (/)
- [ ] Latest episode card displays correctly
- [ ] Episode cover image loads
- [ ] "Listen Now" primary CTA button visible and styled
- [ ] "Support" secondary button visible
- [ ] Recent episodes grid displays (6 episodes)
- [ ] Episode card images load
- [ ] Fade-in animations work (delay-1, delay-2, etc.)
- [ ] Mobile: grid collapses to single column
- [ ] Mobile: spacing uses clamp() values appropriately

### Episode Page (/episodes/[any-episode]/)
- [ ] Episode title displays clean (no "S##E## Name — " prefix)
- [ ] Back arrow works and renders correctly
- [ ] Sidebar "Listen Now" CTA displays
- [ ] Guest bio section displays
- [ ] Guest social links render (if present)
- [ ] Episode metadata shows correctly
- [ ] Featured image loads
- [ ] Mobile: sidebar moves below content
- [ ] Mobile: images scale appropriately

### About Page (/about/)
- [ ] Manifesto hero section displays
- [ ] Host photo loads and displays
- [ ] Host social links render as plain text links
- [ ] Fade-in animations work
- [ ] Mobile: layout stacks correctly

### Support Page (/support/)
- [ ] Manifesto hero section displays
- [ ] Philosophy section renders
- [ ] Primary "Listen on Fountain" CTA with custom label
- [ ] Platform grid displays with arrow icons
- [ ] Platform links work
- [ ] Newsletter section hidden (newsletter_enabled = false)
- [ ] Mobile: platform grid collapses appropriately

### Episode Archive (/episodes/)
- [ ] Episode list displays
- [ ] Episode cards show clean titles
- [ ] Cover images load
- [ ] Grid layout responsive
- [ ] Mobile: single column layout

---

## Functional Tests

### Fountain CTA Variants
- [ ] Homepage: Primary variant CTA works
- [ ] Episode sidebar: Sidebar variant CTA works
- [ ] Support page: Custom label "Listen on Fountain" displays
- [ ] All CTAs link to correct URLs (episode or show)

### Social Links Partial
- [ ] Guest bio: Social links render from map format
- [ ] About page: Host links render from array format
- [ ] Links open correctly
- [ ] Nostr links use correct protocol

### Animations
- [ ] `.fade-in` elements animate on page load
- [ ] `.delay-1`, `.delay-2`, `.delay-3` stagger correctly
- [ ] `.fade-only` class works (fade without slide)
- [ ] No animation jank or breaks

### Navigation
- [ ] Mobile menu toggle works
- [ ] Nav opens/closes smoothly
- [ ] Escape key closes nav
- [ ] External JS loads (`/js/nav-toggle.js`)

---

## Technical Validation

### Structured Data (@graph)
Visit any page, view source, search for `application/ld+json`:

- [ ] Only ONE `<script type="application/ld+json">` tag per page
- [ ] JSON contains `"@graph": [...]`
- [ ] Organization entity present on all pages
- [ ] PodcastSeries present on homepage and episode pages
- [ ] PodcastEpisode present on individual episodes
- [ ] BreadcrumbList present on non-homepage pages
- [ ] All entities have `@id` properties
- [ ] PodcastEpisode references PodcastSeries by `@id`

**Test with Google's Rich Results Test:**
```
https://search.google.com/test/rich-results
```
- [ ] Test homepage URL
- [ ] Test episode page URL
- [ ] No errors or warnings

### Open Graph / Social Meta
View source on any page:

- [ ] `og:image` points to correct image
- [ ] Episode pages use episode-specific OG image (s##e##.jpg)
- [ ] `og:title`, `og:description` present
- [ ] Twitter card meta tags present

**Test with validators:**
- [ ] https://www.opengraph.xyz/
- [ ] https://cards-dev.twitter.com/validator

### RSS Feed
- [ ] `/index.xml` exists and loads
- [ ] `/episodes/index.xml` exists
- [ ] `/posts/index.xml` does NOT exist (removed per optimization)
- [ ] Other section RSS feeds do NOT exist

### CSS Design Tokens
Inspect computed styles in DevTools:

- [ ] Spacing uses `--spacing-*` variables
- [ ] Grid gap uses `clamp()` and responds to viewport
- [ ] Image widths use `--img-width-*` variables
- [ ] Utility classes (`.bg-dark`, `.text-white`) work
- [ ] Animation delays use `--delay` custom property

### Image Handling
Check browser console:

- [ ] No 404s for missing images
- [ ] Hugo build shows warnings for missing images (expected)
- [ ] Images use `srcset` for responsive loading
- [ ] Images lazy load (check Network tab)

---

## Responsive Testing

### Mobile (375px - 768px)
- [ ] Episode grid: single column
- [ ] Typography: clamp() scales smoothly
- [ ] Spacing: clamp() prevents cramping
- [ ] Nav toggle button visible and works
- [ ] Images fit viewport without horizontal scroll
- [ ] CTAs are thumb-friendly size
- [ ] No text overflow issues

### Tablet (768px - 1024px)
- [ ] Episode grid: 2 columns
- [ ] Spacing increases appropriately
- [ ] Images scale up

### Desktop (1024px+)
- [ ] Episode grid: 3 columns
- [ ] Maximum widths enforced
- [ ] Spacing reaches max values
- [ ] Hover states work on CTAs and links

---

## Performance Tests

### Build Performance
```bash
time hugo --gc --minify
```
- [ ] Build completes in reasonable time
- [ ] No unnecessary RSS files generated

### OG Image Generation
```bash
npm run generate:og
```
- [ ] Skips unchanged episodes (timestamp check)
- [ ] Only regenerates when episode file updated
- [ ] Logs show "OG image is up to date" for unchanged

### Page Load
Use Lighthouse or WebPageTest:

- [ ] Homepage loads quickly
- [ ] Episode pages load quickly
- [ ] No render-blocking resources
- [ ] CSS is minified and fingerprinted
- [ ] JS loads with `defer`

---

## Regression Tests

### Things That Should NOT Have Changed
- [ ] Episode URLs still work (no permalink changes)
- [ ] Guest names display correctly
- [ ] Dates and metadata unchanged
- [ ] Color scheme identical
- [ ] Typography identical
- [ ] Border styles identical
- [ ] Footer content unchanged
- [ ] Header/nav unchanged (except external JS)

---

## Browser Compatibility

Test in:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Safari iOS (mobile)
- [ ] Chrome Android (mobile)

---

## Automated Tests (Optional)

### HTML Validation
```bash
# Build site first
hugo --gc --minify

# Validate HTML (if using validator)
# https://validator.w3.org/nu/
```

### Link Checking
```bash
# If you have broken-link-checker installed
npm install -g broken-link-checker
blc http://localhost:1313 -ro
```

### Schema Validation
```bash
# Use schema.org validator or Google's structured data testing tool
```

---

## Critical Path Test (Quick Smoke Test)

**5-Minute Validation:**

1. `hugo server -D` → No errors
2. Visit homepage → Latest episode displays
3. Click episode → Episode page loads, sidebar CTA visible
4. Click "About" → Manifesto + host photo display
5. Click "Support" → Platform grid + custom CTA label
6. View source → Single JSON-LD script with @graph
7. Resize browser → Responsive layout works
8. Mobile menu → Toggle works

If all 8 pass → ✓ Core functionality intact

---

## Regression Smoke Test Commands

```bash
# Full test sequence
hugo --gc --minify && \
npm run generate:og && \
hugo server -D
```

Then manually verify:
- Homepage loads
- Episode page loads
- Navigation works
- No console errors
- Structured data present (view source)

---

## Sign-off Checklist

- [ ] All 18 refactorings tested individually
- [ ] No visual regressions found
- [ ] No functional regressions found
- [ ] Structured data validates
- [ ] RSS feeds correct
- [ ] Mobile responsive
- [ ] Performance maintained or improved
- [ ] Ready for merge to main branch
