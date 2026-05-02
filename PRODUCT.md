# Trust Revolution

register: brand

## Product Purpose

Trust Revolution is a Hugo-powered podcast website deployed on Netlify. The site serves as a content hub for show notes, guest information, and written content, with prominent CTAs driving listeners to Fountain for sat streaming support. Tagline: "Stream sats, not ads." It is a brand-register surface end-to-end — the design IS the product. There are no app UI, dashboard, or admin surfaces.

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

## Brand Tokens (quick reference)

| Element | Value |
|---------|-------|
| Primary Orange (vermillion) | `#F04E23` |
| Text Black | `#000000` |
| Background | `#FAFAFA` |
| Display Font | DIN Condensed |
| Body Font | System sans-serif |

Full token system lives in `assets/css/main.css`. Always reference tokens (`--accent-orange`, `--spacing-md`, `--font-display`, etc.) rather than hardcoded values.
