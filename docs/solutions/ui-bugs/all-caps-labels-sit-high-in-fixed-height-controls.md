---
title: "All-caps button labels sit high in fixed-height controls"
date: 2026-08-02
category: ui-bugs
problem_type: ui_bug
module: css
component: buttons
tags: ["typography", "css", "vertical-alignment", "flexbox", "fonts", "measurement"]
symptoms: ["button labels look too high inside their box", "one button looks low next to its neighbours", "labels shift when a correction is applied to only some controls"]
root_cause: "Flex centring centres the line box, and a line box reserves descender depth that an all-caps label never uses, so the caps sit high by half that depth"
resolution_type: css_fix
---

# All-caps button labels sit high in fixed-height controls

## Problem

Every button on the site rendered its label 4.5–6px above the vertical centre of
its own box. The effect is uniform, so nothing looks broken until one control is
"fixed" in isolation — at which point the corrected one reads as sitting low next
to its uncorrected neighbours.

## Symptoms

- Labels in `.cta-button`, `.support-cta`, `.profile-links a`, `.transport__step`,
  `.transport__watch` and `.pay__btn` all sat high in their boxes.
- After nudging only `.transport__watch`, that button read as *low* beside the
  three seek/rate buttons next to it, which were untouched.
- After nudging only `.pay__btn`, those two buttons became the odd ones out
  against every other button on the site.

## What Didn't Work

**Estimating the offset from canvas font metrics.** Computing the baseline from
`fontBoundingBoxAscent`/`fontBoundingBoxDescent` and comparing it to a cap height
reported the error as ~1px. The real error was 6.5px. A correction sized from that
estimate did essentially nothing, which made it look like the CSS was not applying
at all and sent the investigation in the wrong direction.

**Measuring the wrong string.** A later pixel-scan measured `element.textContent`
directly. Because these labels are cased in the markup and uppercased with
`text-transform`, the canvas rendered *"Open Wallet"* rather than *"OPEN WALLET"* —
the lowercase `p` contributed a descender that did not exist on screen and skewed
the ink box downward. The measurement must apply the element's computed
`text-transform` before rendering.

**Changing `line-height`.** The offset measured 6.5px at `line-height: 1`, at
`normal` and at `1.2` alike. The reason is that line-height cancels out of the
final glyph position:

```
baseline = boxCentre − lineHeight/2 + (lineHeight − (A + D))/2 + A
         = boxCentre + (A − D)/2
```

Only the font's own ascent and descent survive, so no leading value fixes it.

**Correcting a subset of controls.** Twice. Fixing one control in a row, or two
controls on one page, converts a uniform site-wide offset into a visible local
misalignment — strictly worse than leaving it alone.

## Solution

Shift the text down by `S` where `S = 0.35em`, measured per font (see below).
Offset from the border-box centre is `(padding-top − padding-bottom) / 2`, so the
difference between the two paddings must widen by `2S`.

Two forms, because the arithmetic differs by whether there is padding to give back:

```css
:root { --cap-shift: 0.35em; }

/* Symmetric vertical padding: take from the bottom, give to the top, so the
   total is unchanged and the box keeps its exact height. */
.cta-button {
  padding-block:
    calc(var(--btn-padding-y) + var(--cap-shift))
    calc(var(--btn-padding-y) - var(--cap-shift));
}

/* No vertical padding to give back: the whole 2S goes on top. Height comes
   from min-height, which is far larger than one line plus this padding. */
.pay__btn,
.transport__step,
.transport__watch {
  padding-top: calc(var(--cap-shift) * 2);
}
```

**Repeat the correction for every variant that sets its own padding.**
`.cta-button.primary` (specificity 0,2,0) overrides the base `.cta-button` rule
(0,1,0), so a correction written only against `.cta-button` silently never reaches
the primary buttons. Each variant repeats the correction against the padding token
it actually uses, so each keeps its own height.

**Apply it only to controls with a visible box.** `.view-all` and
`.transport__download` are bare text links whose `min-height` exists solely as a
touch target. There is no box to centre within, and shifting their text moves
their baseline — including them dragged the heading beside `.view-all` down 5px.

## Why This Works

A flex container with `align-items: center` centres the *line box*. A line box
reserves the font's full ascent and descent. An all-caps label uses the ascent but
none of the descent, so the visible glyphs sit high by half the descent. The
correction is a constant of the typeface, not of the control, so one value scales
across every size via `em`.

Measured by pixel-scanning rendered ink against the laid-out baseline:

| Font stack | Measured shift |
|---|---|
| System sans (`-apple-system`, …) | 0.345em |
| DIN Condensed (display face) | 0.353em |
| Monospace (`SF Mono`, …) | 0.368em |

One value of `0.35em` covers all three to within a quarter-pixel, verified at
13px, 18px and 28px.

## Prevention

**Measure ink, do not estimate it.** The reliable method reads the baseline from
layout and the ink bounds from rendered pixels:

```js
// baseline: a zero-width inline sits on it, so its bottom IS the baseline
const m = document.createElement('span');
m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
el.appendChild(m);
const baseline = m.getBoundingClientRect().bottom;
m.remove();

// ink: render what actually displays, honouring text-transform, then scan pixels
let t = el.textContent.trim();
const cs = getComputedStyle(el);
if (cs.textTransform === 'uppercase') t = t.toUpperCase();
// ...draw at 8x on a canvas, scan rows for the first/last non-transparent pixel
```

**Two guards worth keeping in an automated check:**

1. Every control with a border or background must have its ink centre within 1px
   of its box centre. This is what catches a partial correction.
2. Render each page with `--cap-shift: 0em` and again at its real value, and diff
   every element's box. The correction must change *no* geometry — that check is
   what caught the `.view-all` baseline regression before it shipped.

**When a uniform flaw is found, fix it uniformly or not at all.** A site-wide
offset that is consistent reads as intentional. Correcting part of it is a
regression even though each individual control is objectively more correct.
