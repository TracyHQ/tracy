# Made With Gsap — Style Reference
> editorial ink on warm concrete

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Made With Gsap is a high-contrast editorial showcase built on a near-monochrome canvas: warm light-gray surfaces against ink-black type at near-architectural scale. A single vivid lime accent (#c9fe6e) acts as the only chromatic note, used sparingly for CTA fills, active borders, and hover states. The visual system is typographically driven — display headlines reach 100-250px with aggressively tight tracking and line-heights under 0.90, letting the words themselves become composition. Cards, dividers, and frames keep radii at 2-12px (nearly sharp), and the page alternates between the light canvas and full-bleed dark demo cards that invert the palette. Everything else is restraint: thin borders, compact spacing, no shadows, no gradients, and one custom geometric grotesk doing all the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lime Voltage | `#c9fe6e` | Primary CTA fill, active border accent, highlight tags — the only chromatic note in an otherwise monochrome system, used at 1-2 instances per viewport to make actions feel switched on |
| Concrete | `#f1f1f1` | Page canvas, card surfaces, light borders, inverted text on dark — the base background layer every other element sits on |
| Ink | `#121212` | Primary text, heading borders, nav borders, dark demo-card surfaces, icon strokes — the dominant structural color across the system |
| Charcoal Edge | `#252525` | Card borders, elevated surface edges — one step lighter than Ink for layered card frames |
| Fog | `#777777` | Muted body copy, secondary metadata, inactive borders |
| Graphite | `#1a1a1a` | Deep SVG fills, dark interior backgrounds for inverted panels |
| Paper | `#ffffff` | Inverted text on dark cards, light link borders, occasional white surfaces |

## Typography

### LayGrotesk — Single-family display + body system. Weight 700 carries all display sizes (65-250px) and nav headings; weight 500 handles body, labels, and captions. The aggressive line-height compression (0.80-0.90) on display sizes lets massive headlines stack tightly without breathing room, creating an editorial-poster density. Negative letter-spacing scales with size — -0.04em at display, -0.01em at subheading — so large type tightens optically.
- **Substitute:** Inter Tight (500, 700) or Space Grotesk (500, 700)
- **Weights:** 500, 700
- **Sizes:** 12, 18, 22, 40, 44, 65, 100, 114, 250px
- **Line height:** 0.80 at 250px, 0.88 at 114px, 0.90 at 100px, 1.00 at 65px, 1.08 at 40-44px, 1.20 at 18-22px, 1.30 at 12px
- **Letter spacing:** -0.04em at 250px, -0.03em at 100-114px, -0.02em at 65px, -0.01em at 40-44px
- **OpenType features:** `"cswh", "dlig", "hlig", "kern", "liga", "ss02"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.3 | 0px |
| body-sm | — | — | 18px | 1.2 | 0px |
| body | — | — | 22px | 1.2 | 0px |
| subheading | — | — | 40px | 1.08 | -0.4px |
| heading-sm | — | — | 44px | 1.08 | -0.44px |
| heading | — | — | 65px | 1 | -1.3px |
| heading-lg | — | — | 100px | 0.9 | -3px |
| display | — | — | 250px | 0.8 | -10px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 80-120px
- **Card padding:** 24-32px
- **Element gap:** 12-16px

### Border Radius

- **tags:** 2px
- **cards:** 8px
- **links:** 2px
- **buttons:** 2px
- **demo-cards:** 12px

## Components

### Primary CTA Button
**Role:** Conversion action — 'Start Learning Now', 'Explore Collection'

Filled lime (#c9fe6e) rectangle, 2px radius, 16px horizontal padding × 10px vertical padding. Text in Ink (#121212), 12-18px weight 500, uppercase or sentence case. Small inline icon (arrow/play) in 12-14px to the left of the label. No shadow, no border. The lime is the only chromatic element on the page — it must be used at most once or twice per viewport.

### Ghost Outline Button
**Role:** Secondary action — 'Explore Collection' alternative

Transparent fill, 1px Ink (#121212) border, 2px radius. Text Ink 12-18px weight 500. Icon (12-14px) to the left, same as primary. On hover, inverts to Ink fill with Concrete text.

### Collection Demo Card
**Role:** Showcases individual GSAP effects — the core content card

Dark surface (#121212) with 12px radius, full-bleed image at 4:3 or 16:10 ratio. Lime (#c9fe6e) 2-3px border that intensifies the contrast against the light page. Cards tilt at -8° to +12° in a layered fan arrangement. Overlay text in white or lime, 40-65px weight 700, sits bottom-left. Tag badges ('COLLECTION', genre labels) in 12px uppercase, weight 500, lime or white, positioned top corners.

### Tilted Card Stack
**Role:** Display pattern for showcasing multiple effects

3-5 demo cards overlapping in a fan layout, each rotated -12° to +12°, with z-index staggering. The rotation is part of the brand identity — flat grids are avoided in hero/feature sections. Lime borders on the front-most card; Ink or gray on background cards.

### Header Navigation
**Role:** Top-level site navigation

Concrete (#f1f1f1) background, 1px Ink bottom border. Left: brand wordmark 'Made With Gsap' in 22px weight 700, Ink. Center: nav links in 18px weight 500, Ink, 15-16px horizontal padding. Right: 'Sign In' text link + lime CTA button. Sticky on scroll, height ~64-72px.

### Hero Headline
**Role:** Opening statement — 3-4 line massive type block

Concrete canvas, Ink (#121212) text, 100-250px weight 700, line-height 0.80-0.90, letter-spacing -0.03em to -0.04em. Text left-aligned, occupies 60% of viewport width. Supporting paragraph in 18-22px weight 500, Fog (#777777), max-width 480px, positioned to the right or below.

### Dark Inverted Section
**Role:** Demo embed panels, featured effect showcases

Full-bleed Ink (#121212) rectangle spanning viewport width. White or Concrete text inside, 40-65px weight 700 for section labels. Used to embed live effect demos that need a dark canvas. 0 radius, seamless flow from the light page.

### Metadata Tag / Badge
**Role:** Genre labels, count indicators, status chips

2px radius, no fill, 1px Ink or lime border. Text 12px weight 500 uppercase, letter-spacing 0.02em. Padding 5px 10px. Sits on canvas or over image overlays.

### Footer
**Role:** Site footer with links and credits

Concrete background, 1px Ink top border, 3-4 column link grid. Link text 18px weight 500, Ink. Column headers 12px uppercase weight 700, Fog. Compact 40-60px section padding.

### Newsletter / Input Field
**Role:** Email capture for updates

1px Ink border, 2px radius, Concrete fill. Input text 18px weight 500, Ink. Placeholder Fog. No focus ring shadow — border thickens to 2px on focus. Lime submit button adjacent.

### Scroll-Indicator Bar
**Role:** Persistent demo command bar at page bottom

Bright blue (#146ef5) background, 1-2px radius, 12-16px padding. White text 12-14px weight 500, uppercase, with a dismiss × icon on the right. Fixed to viewport bottom, ~480-640px wide, left-aligned.

### Section Header Label
**Role:** Small uppercase section identifiers

12-18px weight 500 uppercase, Ink or Fog, letter-spacing 0.05em. Often paired with a numeric or count annotation ('50 EFFECTS', '7 ARTISTS'). Sits at the top edge of each section block.

## Do's and Don'ts

### Do
- Use LayGrotesk weight 700 at 65-250px for all display headlines, with line-height ≤ 1.00 and letter-spacing scaled negative from -0.01em (40px) to -0.04em (250px)
- Reserve Lime Voltage (#c9fe6e) for primary CTAs and active accent borders — maximum 1-2 instances per viewport to preserve its punch
- Set card radii at 8-12px and button/link radii at 2px — the system is nearly sharp; avoid pill shapes (9999px)
- Apply dark inverted sections (Ink #121212 background) for effect demos and feature showcases, then flow seamlessly back to the Concrete (#f1f1f1) canvas
- Use Concrete (#f1f1f1) as the page background and Ink (#121212) for text and borders — these two colors form the entire structural backbone
- Tilt demo cards at -12° to +12° in overlapping fans for showcase sections — flat grids break the editorial rhythm
- Keep body text at 18-22px weight 500 — this system is large-format; 14-16px body type would feel undersized

### Don't
- Do not introduce secondary chromatic colors — Lime Voltage is the only accent; adding blue, red, or purple will dilute the poster-like clarity
- Do not apply box-shadows to cards or buttons — the system relies on hard borders and surface contrast for hierarchy, not elevation
- Do not use line-height above 1.08 for display sizes — loose tracking at 100-250px destroys the editorial density that defines this system
- Do not center-align headlines — all display type is left-aligned to the grid edge, creating a brutalist asymmetry
- Do not use border-radius above 12px — rounded corners above this threshold feel soft and contradict the architectural, near-sharp language
- Do not add gradients — the palette is strictly flat; gradients would break the ink-on-concrete metaphor
- Do not use weight 400 — LayGrotesk is used at 500 and 700 only; lighter weights would undermine the bold typographic voice

## Elevation

The system intentionally avoids box-shadows entirely. Hierarchy is built through hard surface contrast (Concrete ↔ Ink inversion), 1-2px borders in Ink, and the lime accent — never through soft drop shadows or blurs. Depth is implied by card stacking, rotation, and the light/dark section alternation.

## Surfaces

- **Concrete Canvas** (`#f1f1f1`) — Base page background, dominant surface across all sections
- **Paper** (`#ffffff`) — Occasional white panels, inverted text on dark cards
- **Ink Panel** (`#121212`) — Dark inverted sections for effect demos, dark card surfaces
- **Graphite** (`#1a1a1a`) — Deepest dark for featured embedded demos and SVG interiors
- **Lime Voltage** (`#c9fe6`) — Accent fill surface for CTAs and highlighted card borders

## Imagery

Imagery is content-first: full-bleed photography on dark demo cards dominates the visual field, with no lifestyle or contextual staging. Portraits, abstract renders, and product crops are treated as raw material — they fill their cards edge-to-edge, rotated in tilted fan arrangements, and bordered by thin lime or ink lines. No image overlays, no duotone treatments, no color grading beyond what the photos naturally carry. The cards themselves are the design; the images are the subject. Iconography is minimal: small monochrome line icons (12-16px) for UI controls (play, arrow, dismiss), drawn in Ink or lime at consistent 1.5px stroke weight.

## Layout

Page model is max-width contained (~1200-1440px) with full-bleed section bands. The hero is a left-aligned massive headline (60% width) paired with a right-side supporting paragraph + CTA, sitting on the Concrete canvas. Below the hero, sections alternate between light canvas and full-bleed dark Inverted panels that host live effect demos. Content arrangement is asymmetric and editorial: 2-column text-plus-image, 3-4 column card grids, and tilted fan stacks for showcase sections. Section gaps are 80-120px, generous enough to let massive display type breathe vertically. Navigation is a top sticky bar with brand left, center links, and lime CTA right. Footer is a compact 3-4 column link grid. The overall rhythm is: quiet light hero → loud dark demo section → quiet light features → loud dark showcase → quiet light pricing/FAQ.

## Similar Brands

- **Linear** — Same near-monochrome canvas with a single vivid chromatic accent (purple for Linear, lime here) used sparingly on CTAs and active states
- **Vercel** — Similar editorial display-type approach with massive headlines at 80-120px, tight tracking, and near-black ink on near-white surfaces
- **Rauno Freiberg** — Shares the brutalist-typographic aesthetic — oversized left-aligned headlines, hard borders, no shadows, and a single accent color against monochrome
- **Modulz / Radix** — Same compact-density devtool layout with hard-edged 2-8px radii, no gradients, and a restrained two-color plus accent palette
