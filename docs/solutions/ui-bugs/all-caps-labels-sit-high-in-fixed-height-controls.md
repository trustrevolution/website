---
title: "A baseline probe returns the wrong answer inside a flex container"
date: 2026-08-02
category: ui-bugs
problem_type: ui_bug
module: css
component: buttons
tags: ["typography", "css", "vertical-alignment", "flexbox", "measurement", "instrumentation"]
symptoms: ["measured text offset disagrees with what the screenshot shows", "a correction sized from measurement overshoots badly", "button labels end up visibly low after being 'centred'"]
root_cause: "A zero-size inline-block with vertical-align:baseline only reports the baseline inside an inline formatting context; appended to a flex container it becomes a flex item and reports the flex alignment position instead"
resolution_type: reverted
---

# A baseline probe returns the wrong answer inside a flex container

## Problem

Button labels on this site sit very slightly above the vertical centre of their
box. An attempt to correct that overshot by more than three times and left every
label visibly *low* — a real regression shipped to production, from a measurement
that was confidently wrong.

## Symptoms

- The instrument reported labels sitting 4.5–6.5px high. The true figure is
  0.2–1.9px depending on the control.
- A correction sized from the bad figure moved labels 6.3px when 1.9px was
  needed, landing them ~4.4px low.
- A magnified screenshot showed the caps low while the numbers claimed centred.
  **The screenshot was right and was overruled.**

## What Didn't Work

**Estimating from canvas font metrics.** Computing the baseline from
`fontBoundingBoxAscent`/`Descent` reported ~1px against a real offset several
times larger. Abandoned for pixel-scanning.

**Pixel-scanning ink without applying `text-transform`.** These labels are cased
in markup and uppercased in CSS, so the canvas rendered "Open Wallet" and its
lowercase descender skewed the ink box. Fixed by applying the computed
`text-transform` before rendering.

**The baseline probe itself — the one that actually caused the damage.** The
standard trick is a zero-size inline-block with `vertical-align: baseline`, whose
bottom edge sits on the text baseline:

```js
const m = document.createElement('span');
m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
el.appendChild(m);
const baseline = m.getBoundingClientRect().bottom;   // WRONG inside a flex box
```

That only holds in an **inline formatting context**. These buttons are
`display: inline-flex`, so the appended span became a *flex item*. `vertical-align`
does not apply to flex items, so the element was placed by `align-items: center`
and its bottom reported the **flex centre**, not the baseline — off by 4.47px here,
in the direction that made labels look high when they were nearly centred.

The failure is silent. There is no error; the number is just wrong, and it is
stable and reproducible, which is precisely what makes it convincing.

## Solution

Put the marker inside an inline wrapper so it participates in a line box:

```js
const orig = el.innerHTML;
el.innerHTML = '<span>' + orig +
  '<span data-mark style="display:inline-block;width:0;height:0;vertical-align:baseline"></span></span>';
const baseline = el.querySelector('[data-mark]').getBoundingClientRect().bottom;
el.innerHTML = orig;
```

**Then validate the instrument before trusting a single reading from it:**

1. **Internal consistency.** `spaceAbove + inkHeight + spaceBelow` must equal the
   box height. If it does not, the reading is nonsense.
2. **Line-box arithmetic.** The probe's own rect should be exactly the used
   `line-height`, and `ascent + descent` should sum to it. The broken probe put
   the "baseline" at exactly half the line box — the tell-tale of a centred item
   rather than a baseline.
3. **Font fidelity.** Canvas may silently fall back to a different font than the
   DOM. Compare `measureText(t).width + letterSpacing * t.length` against the
   DOM's `Range` width; they should agree within a pixel.
4. **Corroborate against a screenshot.** A magnified render with a guide line at
   the box centre is the ground truth. When it disagrees with the number, the
   number is wrong.

The correction itself was **reverted**. With a working instrument the real offsets
are 0.2–1.9px across every control — below the threshold of perception, and
uniform enough that no control looks wrong beside its neighbours. There is
nothing here worth the risk of another regression.

## Why This Works

`vertical-align` applies to inline-level boxes and table cells. A flex container
blows away the inline formatting context of its children: every child becomes a
flex item positioned by `align-items`/`align-self`. The probe silently changes
meaning from "where is the baseline" to "where does this container align its
items", and with `align-items: center` those differ by roughly half the leading.

## Prevention

**A measurement that contradicts a screenshot is a broken measurement.** Reconcile
before acting on it. This cost three shipped regressions because a reproducible
number felt more authoritative than an image.

**Reproducibility is not correctness.** The broken probe returned an identical
value on every run. Stability only proves determinism.

**Check the formatting context before using any inline-alignment trick.**
`vertical-align`, baseline alignment and line-box reasoning all quietly stop
meaning what you think inside `display: flex` or `display: grid`.

**Sanity-check magnitude against the CSS.** A discrepancy that happens to equal a
value you introduced — here, exactly the `0.35em` shift — is a strong hint you are
measuring stale styles or your own change rather than the underlying condition.

**Reload after rebuilding before measuring.** One reading here was taken against a
page loaded before the rebuild, producing a fourth, different number and nearly
sending the investigation off again.
