# Guest Page Image Debug Guide

## Symptoms
- Guest pages: Episode cover images render at full size
- Episodes archive (`/episodes/`): Images render correctly

## Possible Causes

### 1. CSS Cascade Issue (Most Likely)

The CSS has 3 breakpoints for `.episode-card img`:

**Mobile (<768px):**
```css
.episode-card img {
  width: 110px;  /* Base rule */
  height: 110px;
}
```

**Tablet+ (≥768px):**
```css
.episode-card img {
  width: 100%;    /* Full width for vertical cards */
  height: auto;
  aspect-ratio: 1;
}
.episode-card .card-link {
  flex-direction: column;  /* Vertical layout */
}
```

**What to check:**
1. Open guest page in browser
2. Open DevTools → Elements tab
3. Inspect an episode card image
4. Check computed width - is it 110px or something larger?
5. Check viewport width - is it >768px?

### 2. Grid Not Wrapping Properly

The episode grid uses:
```css
grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
```

**What to check:**
1. Inspect `.episode-grid` element
2. Check computed `grid-template-columns` value
3. If it shows only "1fr" instead of multiple columns, the container might be too narrow

### 3. Image Resources Not Found

If images aren't found in Hugo resources, they fall back to static references without width/height attributes.

**What to check:**
1. Look for console warnings: "Image not found in resources"
2. Check if `<img>` tags have `srcset` attribute (processed) or just `src` (fallback)

## Quick Diagnostic

Run in browser console on broken guest page:

```javascript
// Check all episode card images
document.querySelectorAll('.episode-card img').forEach((img, i) => {
  console.log(`Image ${i}:`, {
    src: img.src,
    width: img.width,
    height: img.height,
    computedWidth: getComputedStyle(img).width,
    computedHeight: getComputedStyle(img).height,
    hasSrcset: !!img.srcset
  });
});

// Check grid columns
const grid = document.querySelector('.episode-grid');
console.log('Grid columns:', getComputedStyle(grid).gridTemplateColumns);
console.log('Viewport width:', window.innerWidth);
```

## Expected Output

**On mobile (<768px):**
- Horizontal cards (image on left, content on right)
- Images: 110px × 110px

**On tablet+ (≥768px):**
- Vertical cards (image on top, content below)
- Images: Full card width (not exceeding card size)
- Multiple columns in grid (2-3 depending on width)

## If Images Are Too Large

**Scenario A: Single column grid on wide screens**
- Grid is only showing 1 column when it should show 2-3
- Each card is full container width
- Images are 100% of that width = very large

**Fix:** Check if guest page has narrower container or different CSS

**Scenario B: Wrong media query applying**
- 768px+ styles applying on mobile
- Images showing at 100% width on small screens

**Fix:** CSS media query issue - need to investigate cascade

## File Paths to Check

- `layouts/guests/term.html` - Guest page template
- `layouts/episodes/list.html` - Episodes archive template
- `layouts/partials/episode-card.html` - Card partial
- `assets/css/main.css` - Lines 561-565 (grid), 580-586 (img base), 1697-1705 (tablet img)

## Next Steps

Please provide:
1. Screenshot of broken guest page
2. Screenshot of working episodes page (same browser width)
3. Browser DevTools console output from diagnostic script above
4. Viewport width when testing
