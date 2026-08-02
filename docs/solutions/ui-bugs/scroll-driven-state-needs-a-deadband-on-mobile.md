---
title: "Scroll-driven state toggles need a deadband on mobile"
date: 2026-08-02
category: ui-bugs
problem_type: ui_bug
module: js
component: media-player
tags: ["javascript", "scroll", "mobile", "hysteresis", "position-fixed", "animation"]
symptoms: ["visible jerk on the first upward scroll", "sticky element flickers as it releases", "enter animation replays several times in a row"]
root_cause: "A single threshold for both entering and leaving a scroll-driven state flips repeatedly when the mobile URL bar animates in and changes the viewport height under the rect reads"
resolution_type: js_fix
---

# Scroll-driven state toggles need a deadband on mobile

## Problem

The docked audio player jerked on the first upward scroll after being docked —
and only that first one. Everything settled correctly afterwards, so the end
state was never wrong; the transition was.

## Symptoms

- A visible stutter on the first scroll-up gesture, absent on later ones.
- Absent on desktop, present on a phone.

## Cause

The dock test used one threshold for both directions:

```js
var anchor = docked ? spacer : plate;
var passed = anchor.getBoundingClientRect().bottom < 0;   // enters AND leaves here
```

The first upward scroll on a phone is also when the browser's URL bar animates
back in. That changes the viewport height, and every `getBoundingClientRect()`
read during those frames moves with it. With enter and leave sharing a boundary,
that wobble drives the state back and forth across consecutive frames, and each
re-entry replays the bar's slide-in animation — several times, in a few hundred
milliseconds.

Replaying a realistic crossing (values wobbling either side of the boundary as
the toolbar animates) through both versions of the logic:

| Logic | State changes across the wobble |
|---|---|
| Single threshold | **5** — release, dock, release, dock, release |
| Deadband of 24px | **1** — one clean release |

## Solution

Separate the two thresholds, so leaving requires real travel that noise cannot
manufacture:

```js
var RELEASE = 24;   // px of travel required before a docked bar lets go

var bottom = anchor.getBoundingClientRect().bottom;
var passed = docked ? bottom < RELEASE : bottom < 0;
```

Docking still needs the anchor fully off the top. Releasing needs it clearly back
on screen. Anything between the two changes nothing.

## Why This Works

Hysteresis is the standard answer to a boundary crossed by a noisy signal, and a
rect read during a viewport animation is exactly that. The deadband has to exceed
the amplitude of the noise, not the precision of the measurement — 24px is far
larger than the per-frame wobble while comfortably smaller than a deliberate
scroll, so the control still feels immediate.

## Prevention

**Any state derived from scroll position needs two thresholds, not one.** This
applies to sticky headers, scroll-spy highlighting, infinite-scroll triggers and
reveal-on-scroll — anything sampling geometry while the user is moving.

**A symptom confined to the *first* gesture points at browser chrome.** Mobile
toolbars animate on the first scroll in a direction and then stay put, so a
transient that only ever appears once per direction is usually viewport
resizing rather than the code's own logic.

**An entry animation makes state churn visible.** If a transition looks janky,
check how many times the state actually changed before reaching for the easing —
the animation is often reporting the bug rather than being it.
