# Vanmoof — Style Reference
> cinematic monochrome showroom

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Vanmoof operates on radical monochromatic discipline: a black, white, and gray system where the only visual loudness comes from 280px product-letter typography and full-bleed dark product photography. The interface itself is almost invisible — thin 1px borders at #e5e7eb, ghost controls, no accent color, no decorative gradients, no brand fills. The page alternates between dark cinematic hero panels (where the product IS the color) and white editorial sections with quiet 4-column feature grids. Every chrome decision prioritizes negative space and typographic confidence over UI density. Components feel like museum labels next to sculpture, not a software dashboard. The 2px radius on buttons and 8px on cards keep geometry sharp and architectural, reinforcing a premium industrial-product language rather than a consumer-app softness.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon | `#222222` | Navigation bar, dark surface panels, primary text on light, logo wordmark fill — the near-black anchor of the system, softer than pure #000 for reduced eye strain on large surfaces |
| Obsidian | `#000000` | Body text, headline text on light surfaces, footer text — reserved for highest-emphasis type where absolute black is needed for maximum contrast (21:1 on white) |
| Graphite | `#313131` | Secondary text, link text on light, button labels on light surfaces — the mid-dark step between Carbon and Obsidian for hierarchy without a hue shift |
| Frost | `#ffffff` | Page canvas for content sections, card surfaces, icon fills on dark hero, button text on dark fills |
| Paper | `#f7f7f7` | Subtle surface tint alternating with pure white for section banding, elevated card backgrounds when pure white feels too sharp |
| Mist | `#e5e7eb` | Hairline borders, dividers, nav separator lines, input borders, card outlines — the most-used color in the system by frequency (1231 occurrences), defining structural edges without visual weight |
| Ash | `#e0e0e0` | Secondary surface fills, muted background panels, subtle hover states — one step deeper than Mist for surfaces that need slightly more presence |

## Typography

### Unica77LLWeb — Primary typeface for all UI and editorial text. Weight 400 for body and navigation, weight 600 for subheadings and button labels, weight 700 for product-name hero displays (S6, A5 at 280px) and section headings. The geometric humanist character with its tall x-height carries authority at massive sizes while remaining legible at 12px. The 280px step is the signature — product names function as graphic objects, not text.
- **Substitute:** Inter, or DM Sans for geometric humanist fallback
- **Weights:** 400, 600, 700
- **Sizes:** 12, 14, 16, 18, 24, 32, 48, 80, 280px
- **Line height:** 1.00–1.56 (display sizes use tight 1.0–1.1; body uses 1.43–1.56)

### Unica77Mono — Monospaced companion for technical metadata, spec labels, navigation micro-text, and any data-adjacent content (dimensions, weights, delivery estimates) where tabular alignment matters
- **Substitute:** JetBrains Mono, or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.56 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 32px | 1.25 | — |
| heading-lg | — | — | 48px | 1.1 | — |
| display | — | — | 80px | 1 | — |
| hero-product | — | — | 280px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 2px
- **cards:** 8px
- **links:** 8px
- **pills:** 9999px
- **buttons:** 2px

## Components

### Full-Bleed Dark Hero Panel
**Role:** Cinematic product showcase

Full-viewport dark photographic background (#222 to near-black gradient from the bike imagery), product name overlaid at 280px Unica77 weight 700 in #ffffff positioned left-third, supporting headline + ghost CTA positioned right-third at ~32% from right edge. The hero text never centers — it anchors left to create editorial tension with the right-aligned description. No overlay tint needed; the product photography provides its own darkness.

### Product Name Display
**Role:** Hero typographic element

Model identifier (S6, A5) rendered at 280px Unica77LLWeb weight 700, #ffffff on dark hero, letter-spacing normal, line-height 1.0. Functions as a graphic object — occupies the left portion of the hero at roughly 50% of viewport height. The single accent element in the entire visual system (a small red reflector/light on the bike itself) is part of the product, not the UI.

### Ghost CTA Button
**Role:** Primary call-to-action

Transparent background with 1px border in #ffffff (on dark hero) or #222222 (on light sections), 2px radius, 12px 24px padding, label in Unica77 weight 600 at 14px. Icon prefix (arrow ↗) in 12px before label. No fill state — these are always outline. Padding: 8px vertical, 24px horizontal.

### Top Navigation Bar
**Role:** Primary site navigation

Fixed/sticky top bar with #222222 background, #ffffff text, 64px height, horizontal flex layout. Left: hamburger menu icon (☰). Center: VANMOOF logo in outlined pill badge. Right: shopping bag icon. Separated from page content by a 1px #e5e7eb bottom border that only appears when content scrolls beneath.

### VANMOOF Logo Pill Badge
**Role:** Brand mark in navigation

Oval/pill shape with 9999px radius, 1px stroke border in #ffffff, transparent fill, VANMOOF text inside in Unica77 weight 700 at 12px tracking +0.1em uppercase, #ffffff. Functions as the wordmark container — the text alone would feel too small to anchor the nav.

### Country Selector Bar
**Role:** Localization prompt

Thin top bar above main nav, #ffffff background, 1px bottom border in #e5e7eb. Body text in Unica77 14px #000000 with bold weight on the country name. Inline 'Select country' button: #222222 background, #ffffff text, 2px radius, 8px 16px padding, 14px weight 600. Dismiss '×' icon right-aligned.

### Feature Card Grid Item
**Role:** App/feature section content card

4-column grid item on white background, no card surface (flat layout). Icon at 32px line-art in #222222 at top, heading in Unica77 weight 600 at 18px #000000 below icon, description in Unica77 weight 400 at 14px #313131. Vertical gap of 12px between icon, heading, and body. No border, no shadow, no background — pure typographic structure.

### App Feature Icon
**Role:** Visual identifier for feature cards

Monochromatic line-art icon in #222222, 32px size, 1.5px stroke weight, geometric and minimal. No fill, no color — always outlined. Aligned to start (left) of its card column.

### Section Header
**Role:** Editorial section title

Centered or left-aligned section title in Unica77 weight 600 at 32–48px #000000, with optional sub-description in 16px #313131 weight 400 below. Generous 64px padding-top from previous section. No dividers or decorative elements between sections — whitespace is the separator.

### Award Badge (iF Design Gold)
**Role:** Trust/credential marker

Small square badge ~48px in the bottom-left of the hero, gold/yellow background with iF logo and 'GOLD AWARD 2025' text in dark type. Positioned absolutely over the hero image. The only non-monochrome UI element permitted — a third-party credential, not a brand color choice.

### Hero Support Text Block
**Role:** Hero secondary messaging

Right-aligned text block in the hero: headline in Unica77 weight 400 at 16px #ffffff line-height 1.5, followed by the Ghost CTA Button with 16px vertical gap. Positioned at approximately 30% from right, 50% vertical. Maximum width ~280px.

### Delivery/Reservation Footer Link
**Role:** Micro-CTA at hero base

Small text link at bottom-right of hero: 'Reserve now →' or 'Delivery within 7 days →' in Unica77 14px #ffffff weight 400 with right-arrow glyph, positioned 24px from bottom-right corner. Functions as the secondary conversion path below the main ghost CTA.

## Do's and Don'ts

### Do
- Use 280px Unica77LLWeb weight 700 in #ffffff for all hero product names — this is the single most recognizable typographic signature
- Set button and nav radius to 2px; set card and link radius to 8px; use 9999px only for the VANMOOF logo pill — the geometric sharpness is intentional, not lazy default rounding
- Maintain 8px as the base spacing unit; snap all padding, margins, and gaps to multiples of 4px
- Render all icons as 1.5px stroke line-art in #222222 — no filled icons, no multicolor iconography, no emoji-style pictograms
- Use #e5e7eb for all structural dividers and borders; never use a heavier border weight than 1px
- Let product photography provide all color and atmosphere in hero sections — never add background tints, overlays, or gradients to UI chrome
- Alternate between #ffffff and #f7f7f7 for section banding in content areas to create rhythm without borders

### Don't
- Do not introduce any chromatic color (red, blue, green, purple) to the UI system — the monochromatic discipline IS the brand identity
- Do not use drop shadows, elevation, or blur effects on cards or buttons — flat surfaces only, separated by whitespace and hairlines
- Do not center hero text — always anchor product names left and supporting text right for editorial tension
- Do not set body text below 14px or above 18px; do not set display text below 80px (except the 280px hero step)
- Do not use border-radius values other than 2px (controls), 8px (containers), or 9999px (logo pill) — no 4px, 6px, 12px, 16px, or 24px radii
- Do not add background colors, patterns, or decorative graphics to white content sections — the product and typography carry the visual weight
- Do not use the Gold Award badge color (#FFD700 or similar) as a brand accent — it is a third-party credential, not a design system token

## Surfaces

- **Hero Panel** (`#222222`) — Full-bleed dark photographic background for product heroes — the darkest surface in the system
- **Canvas** (`#ffffff`) — Primary page background for content sections, feature grids, editorial blocks
- **Section Band** (`#f7f7f7`) — Alternating section tint to create visual rhythm between white content blocks
- **Muted Surface** (`#e0e0e0`) — Subtle background for inactive states, placeholder fills, or tertiary panels
- **Structural Line** (`#e5e7eb`) — Hairline border and divider color — defines edges without surface weight

## Imagery

Imagery is the sole source of color and atmosphere in this system. Hero panels use full-bleed, high-contrast product photography — tight crops on bicycle frames, handlebars, lights, and wheels against dark studio backgrounds with no lifestyle context. The bike IS the subject; the photography eliminates all background noise, leaving the product to occupy the entire visual field. No people, no environments, no props. Lower sections transition to white-background product shots and UI mockups (app screens, dashboard tiles). The treatment is editorial-commerce: think automotive launch photography, not lifestyle cycling. Images are always rectangular with sharp corners (no rounding), overlapping the navigation boundary, and frequently full-bleed edge-to-edge. The 280px product name sits as a typographic overlay on the left, never centered, creating an asymmetric balance with the product imagery occupying the right and center.

## Layout

Page model is full-bleed with no max-width constraint on hero panels — dark cinematic imagery spans the entire viewport. Content sections after the hero use a centered max-width of ~1200–1440px with generous 24–64px horizontal gutters. The hero pattern is a single full-viewport dark panel per product, stacking vertically as the user scrolls (S6 hero, then A5 hero, then app section). Each hero is a split: oversized left-anchored product name (280px) + right-aligned supporting text with ghost CTA. Navigation is a fixed top bar with centered logo. Section rhythm alternates between dark full-bleed hero bands and white content sections, creating high-contrast vertical pulses. Content arrangement uses 4-column symmetric grids for feature cards (track, configure, share, unlock) with equal gutters. No sidebar, no mega-menu — the hamburger is the only nav trigger. Density is extremely sparse: each section gets 64–80px vertical padding, and the page never exceeds 5–6 content blocks above the fold of any given product.

## Similar Brands

- **Apple (apple.com)** — Same monumental display typography over full-bleed dark product photography, same monochromatic discipline with zero accent color, same editorial whitespace-driven layout, same ghost outline button language
- **Nothing (nothing.tech)** — Same ultra-minimal interface with massive product-name typography, same hairline border restraint, same refusal to use color as brand identity — the product and type carry all visual weight
- **Teenage Engineering** — Same industrial-product-as-luxury-object treatment, same generous whitespace, same typographic confidence without decorative UI chrome, same monochromatic palette with product photography providing all atmosphere
- **Arc'teryx (arcteryx.com)** — Same premium-product editorial layout with full-bleed dark hero photography, same hairline border restraint, same ghost CTA pattern, same discipline of letting product imagery dominate over UI
