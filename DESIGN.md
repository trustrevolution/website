---
name: Trust Revolution
description: Stream sats, not ads. Brutalist podcast site for unfiltered conversations.
colors:
  signal-vermillion: "#F04E23"
  signal-vermillion-deep: "#D53312"
  press-black: "#000000"
  ink-black: "#1a1a1a"
  ink-secondary: "#4a4a4a"
  ink-muted: "#666666"
  newsprint: "#FAFAFA"
  newsprint-tinted: "#F0F0F0"
  press-elevated: "#111111"
  press-divider: "#333333"
  press-divider-hover: "#555555"
  paper-rule: "#cccccc"
  inverse-secondary: "#aaaaaa"
  inverse-tertiary: "#999999"
typography:
  display:
    fontFamily: "DIN Condensed, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
  headline:
    fontFamily: "DIN Condensed, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
  title:
    fontFamily: "DIN Condensed, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.1em"
  mono:
    fontFamily: "'SF Mono', Monaco, monospace"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  none: "0px"
spacing:
  3xs: "4px"
  xs: "8px"
  sm: "16px"
  md: "20px"
  content: "32px"
  lg: "64px"
  xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.signal-vermillion}"
    textColor: "{colors.newsprint}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.signal-vermillion-deep}"
    textColor: "{colors.newsprint}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.press-black}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.press-black}"
    textColor: "{colors.newsprint}"
  tag-link:
    backgroundColor: "{colors.newsprint}"
    textColor: "{colors.press-black}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  tag-link-hover:
    backgroundColor: "{colors.newsprint}"
    textColor: "{colors.press-black}"
  episode-card:
    backgroundColor: "{colors.newsprint}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.none}"
  input-email:
    backgroundColor: "{colors.press-black}"
    textColor: "{colors.newsprint}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "20px"
  section-label:
    textColor: "{colors.inverse-tertiary}"
    typography: "{typography.label}"
---

# Design System: Trust Revolution

## 1. Overview: The Manifesto Broadsheet

**Creative North Star: "The Manifesto Broadsheet"**

Trust Revolution looks like a press-shop poster pulled fresh off the platen. DIN Condensed runs as masthead and marquee; type sets as declaration, not decoration. Pure black ink on warm off-white paper. A single ink — Signal Vermillion (#F04E23) — carries every act of meaning: links, calls to action, the rule under a section label, the offset shadow under a hovered card. Density is high, white space is intentional, and every rule, border, or shadow is hard-edged. The site reads as a confident broadsheet that opted out of the broken model and printed its case in plate-on-paper.

This system explicitly rejects the visual language that podcast and crypto sites have collapsed into. **No gradients, no neon, no dark-mode-by-default, no "wagmi" energy, no soft pastels, no rounded-corner card UI, no glassmorphism, no stock photography, no generic podcast templates.** It is light-mode only by design, brutalist by craft, and tokenized by discipline. Sharp edges and hard offset shadows are intentional — craft is in the precision, not the polish.

**Key Characteristics:**
- One ink color (Signal Vermillion) marks every act of meaning. If everything is orange, nothing is.
- DIN Condensed in uppercase for all headings; system sans for body. Display as marquee, body as broadsheet copy.
- Pure black borders ranging from 1px hairline to 6px section frames. No rounded corners anywhere.
- Hard-offset, zero-blur shadows on hover only — surfaces are flat at rest.
- Fluid spacing via `clamp()`. Mobile-first base styles; larger viewports enhance.
- Grayscale guest portraits at build time — color reserved for the accent ink.
- Black background bleed at the html level frames the page like ink at the paper edge.

## 2. Colors: The One-Ink Palette

A single saturated ink against tinted neutrals. Signal Vermillion is the only chromatic color in the system; everything else is paper, ink, and rule.

### Primary

- **Signal Vermillion** (#F04E23): The one ink. Every link, every primary CTA, every section-label underrule, every hovered card's offset shadow. Reserved for moments of meaning — never decoration. Approximately ≤10% of any given screen.
- **Signal Vermillion Deep** (#D53312): The pressed-deeper variant. Hover and active states for primary buttons and links.

### Neutral

- **Press Black** (#000000): Pure ink black. Used for borders, top-nav and footer surfaces, dark sections, and primary text on the lightest backgrounds.
- **Ink Black** (#1a1a1a): The default body-text ink — slightly softer than pure black to reduce eye strain at body sizes.
- **Ink Secondary** (#4a4a4a): Subordinate text — meta lines, breadcrumbs, episode duration, deck copy.
- **Ink Muted** (#666666): Disabled and tertiary text. Also `text-dim`, `text-muted`.
- **Newsprint** (#FAFAFA): The warm off-white paper. The default page surface. Never `#fff`.
- **Newsprint Tinted** (#F0F0F0): A half-step deeper for subtle surface containers (the guest-bio block).
- **Press Elevated** (#111111): The slightly-lifted dark surface (search overlays, elevated dark UI).
- **Press Divider** (#333333) / **Press Divider Hover** (#555555): Hairline rules on dark backgrounds.
- **Paper Rule** (#cccccc): Hairline rules on light backgrounds (timestamps separators, episode-section divider).
- **Inverse Secondary** (#aaaaaa) / **Inverse Tertiary** (#999999): Demoted text on dark backgrounds.

### Named Rules

**The One Voice Rule.** Signal Vermillion is the only chromatic color in the system. It marks action and emphasis only — links, CTAs, the underrule under a section label, the offset shadow on a hovered card. Cap it near 10% of any given screen. If everything is orange, nothing is.

**The No-True-White, No-True-Black Rule.** Body backgrounds are Newsprint (#FAFAFA), not #fff. Body text is Ink Black (#1a1a1a), not #000. Pure #000 is reserved for borders, dark surfaces, and inverse text — structure, not type.

## 3. Typography: Marquee and Broadsheet

**Display Font:** DIN Condensed (with `sans-serif` fallback)
**Body Font:** System sans stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
**Mono Font:** `'SF Mono', Monaco, monospace` — used only for podcast timestamps in the timestamp list.

**Character:** DIN Condensed sets every heading in uppercase, like a press marquee or broadsheet masthead. System sans handles body copy with a long, comfortable measure and 1.7 line-height — broadsheet density without web-typography compromises.

### Hierarchy

- **Display** (400, `clamp(2.5rem, 5vw, 4.5rem)`, 1.2): Hero declarations and marquee moments. Always uppercase, slight positive tracking (0.02em).
- **Headline** (400, 2.5rem, 1.2): Page titles (h1 on episode pages, section pages, posts). Uppercase, 0.02em tracking.
- **Title** (400, 1.5rem, 1.2): Section titles (h2). Uppercase, 0.02em tracking.
- **Body** (400, 1rem, 1.7): Long-form reading (essays, episode summaries, transcripts). System sans, comfortable measure (~480–680px), no uppercase.
- **Label** (700, 0.75rem, 1.5, 0.1em letter-spacing, UPPERCASE): Section labels, button copy, breadcrumb links, profile-link chips, footer nav, view-all links. The system's structural metadata layer.
- **Mono Timestamp** (600, 0.9375rem, mono): Reserved for episode timestamp values inside the timestamp list. Vermillion-inked. Nowhere else in the system.

### Named Rules

**The Marquee Rule.** All headings (h1–h6) are DIN Condensed, uppercase, with positive tracking. No exceptions. No mixed-case display type. No script, no serif, no playful weights.

**The Mono-as-Mark Rule.** Monospace appears in exactly one place: the timestamp value in an episode timestamp list. Mono is wayfinding — a typed marker that says "this is a coordinate, click here." Don't use it for code samples, IDs, or filler.

**The Broadsheet Measure Rule.** Body copy caps at the 65–75ch reading measure (the project tokenizes this as `--measure-narrow: 480px` and `--max-width-narrow: 680px`). Line-height stays at 1.7 — newspaper density, not blog airiness.

## 4. Elevation: Hard-Offset on State Only

This system does not use ambient shadows. Surfaces are flat at rest. Depth appears only as a *response* to a state change — hover, focus, active. The shadow vocabulary is hard-offset, zero-blur, in either Signal Vermillion (the loud version) or Press Black (the quiet version). It looks like a printing plate has shifted under the page.

There are no soft drop shadows, no glows, no glassmorphism, no `backdrop-filter`, and no 3D depth. There is no shadow on a default-state surface — never. If you see a shadow, the user is doing something.

### Shadow Vocabulary

- **state-shadow-xs** (`box-shadow: 3px 3px 0 var(--accent-orange)`): The smallest offset. Tag-link hover.
- **state-shadow-sm** (`box-shadow: 4px 4px 0 var(--text-black)`): Quiet black offset. Reserved for elements where vermillion would over-amplify.
- **state-shadow-md** (`box-shadow: 6px 6px 0 var(--accent-orange)`): The signature card/cover offset. Episode cover at rest, episode-card hover, latest-episode hover.
- **state-shadow-lg** (`box-shadow: 8px 8px 0 var(--accent-orange)`): The biggest offset. Guest-card hover on larger viewports.

There is also one inset rule that behaves like elevation:

- **inline-underrule** (`box-shadow: inset 0 -2px 0 var(--accent-orange)`): A hairline vermillion underrule under a heading or label. Used as a contained "this is a section" mark inside a dark band.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. No ambient shadow. Depth is signal — it appears only when the user does something (hover, focus, active).

**The Pressed-Plate Rule.** All shadows are hard-offset (no blur, no spread) and step in fixed offsets (3 / 4 / 6 / 8 px). They look mechanical, not atmospheric — a plate that has shifted, not a halo of light.

## 5. Components

Components feel like type-locked-up letterpress objects: pressed plates on paper, framed by ink-thick borders, with hover states that feel mechanical rather than digital. Buttons feel pressed. Cards feel printed. Tag links feel die-cut.

### Buttons

- **Shape:** Sharp 0px corners. No radius anywhere.
- **Primary:** Signal Vermillion fill, Newsprint text, transparent 3px border. Uppercase Label typography (0.75rem, 700, 0.1em tracking). Padding 12px × 20px (or 16px × 32px for the `.primary` variant). Min-height 44px (touch-target compliant).
- **Primary hover:** Background steps to Signal Vermillion Deep (#D53312). 150ms `transition-fast` on all properties. No movement; only color step.
- **Secondary:** Transparent fill, Press Black text, 3px Press Black border. Uppercase Label typography. Same padding.
- **Secondary hover:** Inverts — fills with Press Black, text becomes Newsprint. Color-only state change, no offset shadow.
- **CTA group:** Buttons live in a flex group with `flex-wrap`, gap = `--spacing-sm` (16px), centered.

### Tag Links / Profile Link Chips

The signature small-component. Inline, bordered, die-cut.

- **Shape:** Sharp corners. 2px Press Black border on Newsprint background.
- **Default:** Newsprint background, Press Black text, uppercase Label typography (0.75rem, 700, 0.05em tracking). Padding 8px × 12px.
- **Hover:** Border color steps to Signal Vermillion. The element translates (-1px, -1px) and gains a 3px Signal Vermillion offset shadow. The element appears to lift toward the reader, leaving its plate-shadow behind it.
- **Large variant** (`.tag-link--lg`): Min-height 44px touch-target for primary outbound links (host profile, fountain CTA in inline contexts).

### Cards (Episode Card / Guest Card / Guest Bio)

- **Corner Style:** 0px. Sharp.
- **Background:** Newsprint (#FAFAFA). Guest bio variant uses Newsprint Tinted (#F0F0F0) for a half-step deeper container.
- **Border:** 3px Press Black on all four sides. Border-color is the elevation primitive — it transitions on hover.
- **Shadow Strategy:** Flat at rest. On hover, gains the signature 6px × 6px Signal Vermillion offset shadow (`state-shadow-md`). Heading text inside the card simultaneously steps to Signal Vermillion.
- **Internal layout:** Episode card is horizontal — 110px square cover image on the left with a 3px Press Black right-border (the cover is *part of* the card frame), content area to the right with `--spacing-sm` × `--spacing-md` padding. Heading is line-clamped to 3 lines with `text-wrap: balance`.
- **Episode cover (sidebar / hero):** Always carries the 6px Signal Vermillion offset shadow at rest — this is the one place a cover image earns ambient elevation, because the cover *is* the artwork.

### Inputs (Email Signup)

Inputs live almost exclusively inside dark sections (the email signup band).

- **Shape:** 0px corners.
- **Default:** Press Black background, Newsprint text, 3px Newsprint border. `--spacing-md` (20px) padding. Body typography. Placeholder uses `--text-inverse-dim` (rgba(255,255,255,0.5)).
- **Focus:** 2px Signal Vermillion outline, 2px outset offset, border-color steps to Signal Vermillion. The focus ring is structural, not glowing.

### Navigation

- **Top nav (mobile-first overlay):** Press Black bar with a 4px Signal Vermillion bottom border (`--border-section`). The brand wordmark is bold uppercase Newsprint with negative tracking. A hamburger toggle (44px touch-target) reveals a full-screen Press Black overlay with DIN Condensed nav links in `--font-size-2xl` (2rem), uppercase, wide tracking.
- **Active state:** `aria-current="page"` and hover both step the link color to Signal Vermillion. The current page wordmark beside the brand is also Signal Vermillion in Label typography.
- **Footer nav:** Centered horizontal flex on a Press Black band with a 4px Signal Vermillion top border. Footer links are uppercase Label, 500 weight, hover-to-Vermillion.

### Section Label (Signature Component)

A small composite that appears at the top of dark sections.

- **Style:** Inline-block uppercase Label (0.75rem, 700, 0.15em tracking) in `inverse-tertiary` text color, with a 2px Signal Vermillion underrule (a `border-bottom`, not a separate underline element), `--spacing-3xs` (4px) of padding-bottom, `--spacing-sm` (16px) margin-bottom.
- **Role:** Marks a "this is what you are looking at" frame above an h2/h3. It is the broadsheet's section dingbat.

### Disclosure (Transcript Toggle)

A custom `<details>` summary that hides the native marker and renders a "READ" / "HIDE" hint as uppercase Label-typography text with a hover-to-Vermillion color step.

## 6. Do's and Don'ts

### Do:

- **Do** use one of the seven defined spacing tokens (`--spacing-3xs/xs/sm/md/content/lg/xl`) for every spacing decision. Never type a literal `20px`, `1rem`, or `2em` value.
- **Do** keep Signal Vermillion at or below ~10% of any given screen. Reserve it for links, primary CTAs, section underrules, and the offset shadow on a hovered card.
- **Do** set every heading in DIN Condensed, uppercase, with `--tracking-normal` (0.02em) — including h3 inside cards.
- **Do** specify shadow as `<offset> <offset> 0 <color>` only. Always 0 blur, always 0 spread, always one of the four defined offset steps (3 / 4 / 6 / 8 px).
- **Do** use 3px (`--border-component`) as the default component border. 1px hairlines for in-content rules. 4px (`--border-section`) for major section frames (header bottom, footer top). 2px and 6px exist for specific roles — don't substitute.
- **Do** use `text-wrap: balance` on card and hero headings.
- **Do** keep mono typography to timestamps only.
- **Do** apply `images.Grayscale` at build time to every guest portrait — color reserved for the accent ink.
- **Do** start all CSS at mobile, enhance up via `min-width` media queries.

### Don't:

- **Don't** introduce gradients of any kind — color, text, or background. The system is one ink, flat fills.
- **Don't** use neon, pastel, or any chromatic color other than Signal Vermillion. No secondary accents, no "category color" schemes, no syntax-rainbow palettes.
- **Don't** ship dark mode as a toggle. The system is light-mode by design — Press Black is a structural surface inside the light-mode page, not an alternate theme.
- **Don't** use rounded corners. `border-radius: 0` is enforced. Pills, soft cards, and "friendly" UI shapes are forbidden.
- **Don't** use ambient or blurred shadows. No `box-shadow: 0 4px 16px rgba(0,0,0,0.1)`. No glass cards, no `backdrop-filter`.
- **Don't** ship "wagmi" energy or any crypto-bro / Web3 visual cliché — neon-on-black, holographic gradients, hexagon avatars, glow effects, terminal-on-glass. The brand opts out of that aesthetic on principle.
- **Don't** reach for stock photography or generic-podcast-template chrome (mic-and-headphones illustrations, soundwave SVGs, "host card" carousels).
- **Don't** use side-stripe borders. No `border-left: 4px solid <color>` as a callout accent. If a block needs framing, use a full 3px Press Black border or no border.
- **Don't** use gradient text or `background-clip: text`. Type is one solid ink.
- **Don't** wrap everything in a card. Most modules sit directly on the page; a card means a discrete object that can be picked up.
- **Don't** use modals as a default. Disclosures (`<details>`), inline panels, and full-page navigation overlays are the established pattern.
- **Don't** use em dashes in copy. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** type a hardcoded color, font-size, spacing, border, or shadow value. The token system is normative — bypassing it is a defect, not a shortcut.
