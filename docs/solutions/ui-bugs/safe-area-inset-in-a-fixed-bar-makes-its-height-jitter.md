---
title: "safe-area-inset in a fixed bar's padding makes its height jitter on mobile"
date: 2026-08-02
category: ui-bugs
problem_type: ui_bug
module: css
component: media-player
tags: ["css", "mobile", "safe-area", "viewport", "position-fixed", "android"]
symptoms: ["docked bar carries extra space below its controls", "bar height changes during scroll", "bar pops into place with different padding than it settles at"]
root_cause: "env(safe-area-inset-bottom) is live on Android when the page sets viewport-fit=cover, and its value changes as the browser toolbar animates, so any fixed element that adds it to padding changes height mid-scroll"
resolution_type: css_fix
---

# safe-area-inset in a fixed bar's padding makes its height jitter on mobile

## Problem

The docked audio player sat permanently taller than it needed to be, with a band
of empty background below its controls, and its height changed during the scroll
that dismissed it — a visible interim state where the bar popped into position
carrying extra space underneath before disappearing.

## Symptoms

- Roughly 26px of empty bar below the play button on an Android phone, absent on
  desktop.
- The extra space appeared and disappeared while scrolling back up, rather than
  being a constant.

## Cause

The bar reserved the gesture-navigation area in its own padding:

```css
.transport--audio.is-docked .transport__plate {
  padding: var(--spacing-xs) var(--spacing-md);
  padding-bottom: calc(var(--spacing-xs) + env(safe-area-inset-bottom, 0px));
}
```

Two things make that a problem rather than the usual good practice:

1. **The page sets `viewport-fit=cover`.** Without it, `env(safe-area-inset-*)`
   resolves to 0 everywhere and the `calc()` is inert. With it, the insets are
   live — and on an Android device with gesture navigation the bottom inset is
   a real ~26px, added on top of the intended 8px.
2. **The inset is not a constant.** Mobile browsers change the visual viewport as
   the URL bar animates in and out during scroll, and the reported inset moves
   with it. Anything that folds the inset into the height of a `position: fixed`
   element therefore changes that element's height mid-scroll.

## Solution

Keep the padding symmetric and static; do not fold the inset into it.

```css
.transport--audio.is-docked .transport__plate {
  padding: var(--spacing-xs) var(--spacing-md);
}
```

The controls inside the bar are a 44px touch target sitting within 8px of
padding, so they stay clear of the gesture strip without the bar reserving the
whole inset. The only thing the inset was protecting was background, not
anything interactive.

## Why This Works

Removing the dynamic term makes the bar's height a fixed 56px, which matters for
more than looks: the dock logic measures the plate to size the spacer that holds
its place in the flow, and sets a body `padding-bottom` from the same measurement
so the footer clears the bar. A height that changes under those measurements
makes both of them wrong intermittently.

## Prevention

**Reserve safe-area insets on static page furniture, not on fixed elements whose
height is measured.** The site footer and the nav still add
`env(safe-area-inset-bottom)`, which is correct — they sit in the flow, are not
measured by script, and genuinely need to clear the gesture bar.

**`viewport-fit=cover` is what switches these insets on.** Before assuming an
`env()` value is inert, check the viewport meta. A `calc()` that is harmless on
one project is load-bearing on another purely because of that attribute.

**Treat "it looks different mid-scroll" as a dynamic-value symptom.** A layout
that settles correctly but transits wrongly usually has a term that depends on
viewport state — insets, `vh` units, or a measurement taken at the wrong moment.
