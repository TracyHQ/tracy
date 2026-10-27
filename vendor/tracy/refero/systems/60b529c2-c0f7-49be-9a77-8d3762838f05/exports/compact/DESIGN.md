# Jp — Style Reference
> Monochrome museum wall of templates — quiet, editorial, pill-shaped.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Jp is a curated template gallery built on a near-monochrome canvas: a single white page, a single near-black accent, and pill-shaped geometry that reads like a museum wall of brand systems. Typography does the heavy lifting — PP Neue Montreal at restrained sizes and weights creates editorial calm, with the occasional 38px headline as the only moment of scale. Color is rationed: the UI itself stays grayscale, while small chromatic badges (violet, blue) act as category punctuation on the template thumbnails. The overall feel is a high-end stock-photo agency merged with a minimalist directory — every element earns its place through shape and whitespace, never decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#333333` | Primary text, icons, card borders, structural lines — the default foreground across all body and heading content |
| Paper | `#ffffff` | Page canvas, card surfaces, button text, inverted foregrounds |
| Whisper | `#e6e6e6` | Hairline borders, dividers, subtle separators, card outlines |
| Carbon | `#202020` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Slate | `#3b3b3b` | Secondary dark surfaces, icon strokes, muted dark text on light surfaces |
| Graphite | `#555555` | Tertiary text, secondary button borders, subdued labels |
| Ash | `#838383` | Body secondary text, helper copy, placeholder text |
| Fog | `#bdbdbd` | Disabled controls, very light icon strokes, decorative dot motifs |
| Mist | `#c7c7c7` | Inverted muted foreground — light text on Carbon-filled buttons and dark cards (replaces Paper when on dark surfaces) |
| Indigo Pulse | `#4177ff` | Saturated category badge fill — the sole chromatic accent on chrome elements, used sparingly to tag template categories |
| Sky Pulse | `#41a9ff` | Secondary category badge fill — lighter blue companion to Indigo Pulse for alternating category tags |

## Typography

### PP Neue Montreal — The sole typeface across the entire product — body copy at 14px/1.43, UI labels at 12–13px, subheadings at 16–18px, and a single display step at 38px. Weights 400 for body, 500 for navigation/tabs, 600 for the hero headline and button text. The 0.020em positive tracking is signature: it opens the geometric forms slightly so small sizes (10–12px) stay legible without feeling mechanical.
- **Substitute:** Inter, General Sans, Satoshi
- **Weights:** 400, 500, 600
- **Sizes:** 10, 11, 12, 13, 14, 16, 18, 38
- **Line height:** 1.0, 1.11, 1.20, 1.40, 1.43, 1.60
- **Letter spacing:** 0.0200em

### proxima-nova — proxima-nova — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.43

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | — |
| body | — | — | 14px | 1.43 | — |
| heading-sm | — | — | 18px | 1.4 | — |
| display | — | — | 38px | 1.11 | — |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 0px
- **Element gap:** 8px

### Border Radius

- **tabs:** 100px
- **cards:** 12px
- **badges:** 100px
- **buttons:** 100px

## Components

### Hero Headline
**Role:** Primary page title at the top of landing pages

Centered text, 38px PP Neue Montreal weight 500, line-height 1.11, color #333333. Two-line max, no decoration. Sits above a 16px subheading in #838383.

### Primary Pill Button (Filled)
**Role:** The only high-emphasis action — 'Get unlimited access', 'Subscribe', primary CTAs

100px border-radius, background #202020, text #ffffff at 13–14px weight 500, horizontal padding 18px, vertical padding 10px. No border, no shadow. Sits as a compact pill, not a chunky button.

### Filter Tab (Default)
**Role:** Category filter in the tab bar above template grid

Transparent background, text #333333 at 13px weight 500, no border, no padding fill — just a text label. Horizontal spacing of 18–22px between tabs.

### Filter Tab (Active)
**Role:** Selected category — 'All' in the default view

100px border-radius pill, background #202020, text #ffffff at 13px weight 500, padding 8px 18px. Sits inline with default tabs as a visual anchor.

### Template Card
**Role:** Each preview thumbnail in the 3-column grid

12px border-radius, no border, no shadow in resting state. The card is purely a frame for the template preview image; no padding inside — the thumbnail fills edge-to-edge. Cards sit on the white page with 8px gaps.

### Category Badge
**Role:** Chromatic tag on template cards or template detail

100px border-radius, background #4177ff or #41a9ff, text #ffffff at 10–12px weight 500, padding 4px 10px. The only place saturated color appears in the interface chrome.

### Secondary Pill Button (Ghost/Outlined)
**Role:** Lower-emphasis actions beside the primary pill

100px border-radius, transparent background, 1px border #555555, text #555555 at 13px weight 500. Used when a second action is needed without competing with the dark pill.

### Top Nav Bar
**Role:** Persistent header with brand mark and primary CTA

Full-width white bar, 16–20px vertical padding, no border. Left: small 'P' wordmark in #333. Right: primary pill button (#202020). No navigation links visible in the captured screens — the nav is deliberately minimal.

### Subheading Text
**Role:** Supporting copy under hero headline

14–16px PP Neue Montreal weight 400, color #838383, line-height 1.6. Centered, max-width matches headline width.

### Chat Widget Bubble
**Role:** Floating support/contact affordance in the bottom-right

Circular (100px radius), 40–48px diameter, background #202020, white icon glyph centered. No shadow or a single soft 5px drop-shadow at 45% black.

## Do's and Don'ts

### Do
- Use 100px border-radius on every button, tab, and badge — the pill shape is non-negotiable
- Keep the interface grayscale: #333333 text, #ffffff surface, #202020 for filled interactive moments
- Reach for PP Neue Montreal at 13–14px weight 400–500 for all body and UI text
- Reserve #4177ff and #41a9ff exclusively for category badges — never use them for buttons, text, or borders
- Set the hero headline at exactly 38px weight 500, centered, with no more than two lines
- Separate template cards with consistent 8px gaps in a 3-column grid
- Use #e6e6e6 for any hairline divider or card border — never a heavier gray

### Don't
- Don't introduce a chromatic CTA — the only filled action surface is #202020
- Don't use 12px radius on buttons or badges; 12px is reserved for cards only
- Don't add shadows to cards or buttons — elevation is implied by the white-on-white grid, not by drop-shadows
- Don't set body text below 12px or use weight 600 for anything smaller than 16px
- Don't alternate between sans-serifs or substitute PP Neue Montreal with a serif anywhere
- Don't place blue or violet on text, borders, or icon strokes — the chromatic colors are badge-fills only
- Don't use 4px or 8px radius on anything — the design has exactly two radii: 12px and 100px

## Elevation

Jp uses almost no elevation. There is a single soft 5px/45% black shadow used on the floating chat widget only; cards, buttons, and modals rely on the white-on-white canvas and 12px radius to imply depth. This is a deliberately flat, editorial approach — the product IS the content (template previews), so chrome stays invisible.

## Surfaces

- **Page Canvas** (`#ffffff`) — The entire page background — the gallery wall
- **Template Card** (`#ffffff`) — Same white as canvas; the thumbnail image provides the visual surface
- **Filled Dark Surface** (`#202020`) — Primary button, active tab, chat widget — the only non-white surface in the system

## Imagery

The page is image-dominant below the fold: a 3-column masonry grid of full-bleed template preview thumbnails that fill their cards edge-to-edge with no padding, no border, no shadow. The thumbnails themselves are wildly varied — dark editorial layouts, bright orange product pages, lavender SaaS heroes, teal mobile app shots — so the gallery acts as a visual portfolio of the product's range. Above the fold is text-only; no hero image, no illustration, no decorative graphic. The 'P' wordmark is the only persistent brand glyph.

## Layout

Full-width page with a 1200px max-width content well. Above the fold: centered text stack (38px headline, 14–16px subheading, single dark pill CTA) on pure white, with a minimal top nav (logo left, CTA right). Below the fold: a horizontally centered filter tab bar (pill-shaped active state, ghost text for inactive), then a 3-column responsive grid of template cards with 8px gaps — no section dividers, no alternating bands, just a continuous gallery flowing top to bottom. Section rhythm is defined by the grid, not by visual breaks.

## Similar Brands

- **Framer Showcase** — Same template-gallery model with a 3-column grid of full-bleed preview cards, pill-shaped navigation, and a near-monochrome interface that lets the colorful template thumbnails dominate
- **Webflow Templates** — Shared grid-of-previews layout with category filter pills above a card grid, though Jp's pill geometry (100px radius on everything) is more extreme
- **Dribbble Shots** — Same editorial-gallery logic: white canvas, image-dominant grid below a minimal text header, no chrome competing with the showcased work
- **Minimal Gallery (Awwwards)** — Shared typographic restraint — both use a single geometric sans at modest sizes, letting the featured work speak in full-bleed color while the chrome stays invisible
