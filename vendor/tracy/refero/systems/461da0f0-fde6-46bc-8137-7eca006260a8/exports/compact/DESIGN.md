# Together AI — Style Reference
> Research console on glacier paper

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Together AI reads as a research-grade console on glacier-white paper: stark black-on-white typography, near-zero chrome, and pastel data cards (blush, peach, sky, mint) that act as colored sticky-notes on an otherwise monochrome page. The single dark band — a near-black navy research section — is the dramatic inversion that gives the system its contrast and signals depth-of-work. Hierarchy is built through type weight and scale rather than color, and a thin periwinkle accent (#bdbbff) appears as small dashes and underlines to mark active states. Pastel backgrounds are decorative, not decorative-only: they tag metric categories. Components are sharp-cornered (4px), low-elevation, and rely on the monospace label family to feel like a lab notebook.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Paper White | `#ffffff` | Page canvas, card surfaces on light theme, text on dark surfaces |
| Slate | `#4d4d4d` | Muted secondary text, subdued metadata, low-emphasis body copy |
| Hairline | `#d6d6d6` | Hairline borders, table dividers, input outlines |
| Midnight Ink | `#010120` | Dark surface (research section background) — near-black navy that reads as deeper than pure black, giving the dark band a tinted, on-brand cast |
| Periwinkle | `#bdbbff` | Accent dashes, active indicators, small UI punctuation — the system's only mid-saturation chromatic accent, used sparingly as underlines and section markers |
| Mint Cyan | `#c8f6f9` | Gray supporting accent for decorative details and low-frequency emphasis. |
| Sky | `#c1dff9` | Gray supporting accent for decorative details and low-frequency emphasis. |
| Blush | `#fde3f6` | Light supporting surface for subtle backgrounds and section separation. |
| Peach | `#ffdccd` | Card background — used for the third stat tile, warm counterweight to the cool pinks and blues |

## Typography

### The Future — Primary sans-serif for body, nav, headings, and hero — the sole display and text family. Aggressive negative tracking at display sizes (-0.03em at 64px) tightens headlines into compact, near-condensed blocks. Tight line-heights (1.10 at display) keep multi-line headlines visually dense rather than airy.
- **Substitute:** Inter Tight, Satoshi, General Sans
- **Weights:** 400, 500
- **Sizes:** 14, 16, 18, 22, 28, 40, 64
- **Line height:** 1.10–1.40
- **Letter spacing:** -1.92px at 64px, -0.80px at 40px, -0.42px at 28px, -0.22px at 22px, -0.18px at 18px, -0.16px at 16px, -0.14px at 14px

### PP Neue Montreal Mono — Monospace for labels, category badges, button text, and technical metadata — the lab-notebook voice that signals research credibility. Slightly positive tracking (0.005–0.007em) keeps mono caps readable at small sizes.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Geist Mono
- **Weights:** 400, 500
- **Sizes:** 10, 11, 13, 16
- **Line height:** 1.00–1.40
- **Letter spacing:** 0.07px at 10px, 0.08px at 11px, 0.09px at 13px, 0.11px at 16px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.25 | -0.14px |
| body-sm | — | — | 16px | 1.3 | -0.16px |
| body | — | — | 18px | 1.3 | -0.18px |
| subheading | — | — | 22px | 1.25 | -0.22px |
| heading-sm | — | — | 28px | 1.2 | -0.42px |
| heading | — | — | 40px | 1.15 | -0.8px |
| display | — | — | 64px | 1.1 | -1.92px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40-80px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **tabs:** 4px
- **cards:** 4px
- **badges:** 4px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Primary Dark Button
**Role:** High-emphasis action (START BUILDING, SIGN IN)

Filled black (#000000) background, white text in PP Neue Montreal Mono 13px weight 500, 4px radius, padding 8px 16px. No border. Black-on-black hover (no color shift). Inline arrow icon (→) on SIGN IN variant.

### Ghost Button
**Role:** Secondary action (CONTACT SALES)

Transparent background, 1px border in #d6d6d6 or currentColor, black text in PP Neue Montreal Mono 13px weight 500, 4px radius, padding 8px 16px. Hover darkens text to #000000.

### Announcement Bar
**Role:** Top-of-page news strip

Full-width #000000 background, white centered text in The Future 14px weight 400, padding 8px vertical. Sits above the nav with no separator.

### Sticky Navigation
**Role:** Primary site navigation

White (#ffffff) background, 1200px max-width container, 16–24px vertical padding. Logo (gradient mark + wordmark) left, nav links center (The Future 16px, weight 400, #000000), CTA cluster right (Ghost + Primary). Sticky with a soft navy-tinted horizontal glow on scroll: rgba(1,1,32,0.1) -10px 0px 75px 0px.

### Hero Section
**Role:** Above-the-fold introduction

Two-column split on white. Left: display headline at 64px The Future weight 500 (#000000), continuation line at 64px weight 400 in #4d4d4d, supporting subtext at 18px weight 400 in #4d4d4d, Primary + Ghost button pair. Right: abstract 3D illustration of translucent gradient shapes (blue, purple, orange rings and a diamond) with floating labels in mono.

### Stat Metric Card
**Role:** Performance headline tile (Faster Inference, Lower Cost, Faster Pre-training)

Solid pastel fill (one of #c1dff9, #fde3f6, #ffdccd, #c8f6f9), 4px radius, padding 20–24px. Small mono label top-left with directional arrow (↑ FASTER INFERENCE, ↓ LOWER COST). Giant metric number in The Future 64px weight 500 #000000. Single-line caption below in The Future 14–16px weight 400 #4d4d4d. No border, no shadow — the fill IS the card.

### Platform Tab Card
**Role:** Category selector for the Full-stack cloud section (Inference, Compute, Model shaping)

White background card with 4px radius, centered label in The Future 22px weight 500. Active state: pastel fill (#c8f6f9 mint) replaces the white surface, providing color-on-color contrast without a border or shadow change. Padding 20–24px vertical.

### Research Paper Card
**Role:** Featured publication tile in the dark research section

Dark card on Midnight Ink (#010120) background — card fill is a slightly lighter navy tone derived from the surface. 4px radius, padding 24–32px. Category badge top-center (PP Neue Montreal Mono 11px weight 500, white on translucent periwinkle or white on dark). Paper title centered in The Future 22px weight 500 white. Author list in PP Neue Montreal Mono 11px weight 400 in muted white (#4d4d4d equivalent at low opacity). A small periwinkle (#bdbbff) dash sits to the left edge of each card as a visual link.

### Category Badge
**Role:** Compact label for paper type or section tag

PP Neue Montreal Mono 11px weight 500, uppercase, white text on dark surface. No background fill (sits directly on the card). Tracking slightly positive for mono legibility.

### Trusted-By Logo Row
**Role:** Social proof strip

Single horizontal row of grayscale partner logos in #4d4d4d, separated by generous whitespace. Small 'TRUSTED BY' label in PP Neue Montreal Mono 11px weight 500 #4d4d4d to the left. No logos are colored — all are desaturated to preserve the monochrome system.

### Hero Illustration
**Role:** Brand-defining 3D visual on the hero

Abstract 3D render: translucent gradient rings, a central spherical form, and a faceted orange diamond shape, with small mono labels (PRODUCTION INFERENCE, OPTIMIZED TRAINING, CUTTING-EDGE RESEARCH) anchoring the shapes like callouts. Glossy, smooth, dimensional — not flat illustration. Gradient palette runs blue → purple → orange across the three main forms.

## Do's and Don'ts

### Do
- Set body and heading text in The Future with aggressive negative tracking at large sizes (-0.03em at 64px, -0.02em at 40px)
- Use mono (PP Neue Montreal Mono) for all labels, badges, button text, and technical metadata — the mono voice is the system's research credibility signal
- Use 4px radius for every card, button, badge, and input — the sharp corner is a defining trait
- Place at most one dark band per page, using #010120 (near-black navy, not pure black) to create a deliberate inversion
- Apply pastel card backgrounds (#c1dff9, #fde3f6, #ffdccd, #c8f6f9) as category-coded fills, not as decoration — each pastel should tag a distinct metric or topic
- Reserve #bdbbff periwinkle for small UI punctuation: active indicators, section dashes, underlines — never as a surface fill or large block
- Keep the sticky nav the only element with shadow; use the navy-tinted horizontal glow rgba(1,1,32,0.1) -10px 0px 75px 0px

### Don't
- Don't introduce drop shadows on cards, buttons, or sections — the system is flat by design
- Don't use pure white text on pure black surfaces — use #ffffff on #010120 so the dark band reads as brand-tinted, not generic dark mode
- Don't color trusted-by or partner logos — keep them desaturated to #4d4d4d so they don't compete with the pastel stat cards
- Don't round corners above 4px for standard UI; large radii (8px, 16px) break the sharp, editorial feel
- Don't use color to indicate hierarchy on light surfaces — use type weight (400 vs 500) and size instead, matching the headline pattern of one bold line + one lighter continuation line
- Don't add gradients to UI chrome; gradients belong only in the hero 3D illustration
- Don't mix the two font families casually — mono stays in labels/badges/buttons, sans stays in body and headings

## Elevation

- **Sticky Navigation:** `rgba(1, 1, 32, 0.1) -10px 0px 75px 0px`

## Surfaces

- **Paper Canvas** (`#ffffff`) — Default page background across hero, stats, and platform sections
- **Midnight Band** (`#010120`) — Dark research section — the single inverted surface that breaks the light theme

## Imagery

Imagery is dominated by a single abstract 3D illustration on the hero: translucent gradient geometric forms (rings, a central sphere, a faceted orange diamond) in a blue→purple→orange palette, glossy and dimensional, floating against white space with small mono callout labels. No photography anywhere on the site. No flat illustration or iconographic graphics. The 3D style is the brand's only visual mark beyond typography and the pastel card system. Icons throughout the UI are mono outlines drawn from the system weight.

## Layout

Full-width sections with 1200px max-width centered content. Nav: top bar with logo left, links center, CTA cluster right. Hero: asymmetric two-column split — text block left (50%), 3D illustration right (50%) on white. Stats: three equal pastel cards in a row. Platform section: centered header, then three tab cards in a row with the active tab recolored. Research section: full-bleed dark band (#010120) with a horizontally scrollable row of four paper cards, section header left-aligned, nav arrows right. Section gaps run 40–80px; card padding runs 16–24px; element gaps run 8–16px on a 4px base grid.

## Similar Brands

- **Anthropic** — Same clean light-paper aesthetic with a single dark inversion section, tight sans-serif display type, and mono labels for technical credibility
- **Hugging Face** — Pastel category-coded cards on a white canvas with mono badges, and a research-credibility layout where papers and models are the hero content
- **Linear** — Sharp 4px corners, almost shadowless surfaces, aggressive negative tracking on large display type, and near-monochrome palette with a single chromatic accent
- **Modal Labs** — Devtools-for-AI branding with a single bold headline + lighter continuation line pattern, pastel stat tiles, and dark research/feature bands as visual punctuation
- **Vercel** — Black-on-white editorial typography with tight letter-spacing, a sole dark hero variant, and minimal UI chrome that lets type and 3D illustration carry the brand
