# Laura Monin — Style Reference
> editorial gallery wall, white marble, ink stamp

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Laura Monin is an editorial fashion portfolio built on absolute chromatic restraint: pure white canvas, black ink, and a single custom display serif that carries the entire brand voice. The layout behaves like a curated mood board — photographs scatter asymmetrically across generous negative space rather than aligning to a conventional grid, with overlay captions functioning as whispered labels rather than navigation. Typography carries all hierarchy: the massive display serif at 58–158px commands the center, while Neue Haas Grotesk at 12–22px serves as quiet scaffolding for navigation, metadata, and supporting text. There are no shadows, no rounded corners, no gradients, no color — the system achieves its luxury through what it removes, not what it adds. Every element should feel like it was placed by hand on a gallery wall: precise, unhurried, and never filling more of the frame than necessary.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page canvas, card surfaces, image borders, nav backgrounds — the only surface tone in the system |
| Ink Black | `#000000` | Primary text, all border outlines on images and nav, list markers — the sole chromatic anchor |

## Typography

### title — Display serif used exclusively for the brand title and hero headlines. The custom serif — with its high contrast strokes and slightly condensed forms — carries all brand identity. Letter-spacing of -0.018em tightens the large caps just enough to feel deliberate without becoming stiff. A close substitute would be a transitional or didone-style serif like 'GT Sectra Display' or free options 'Playfair Display' / 'DM Serif Display'
- **Substitute:** Playfair Display or DM Serif Display
- **Weights:** 400
- **Sizes:** 58px, 158px
- **Line height:** 1.20
- **Letter spacing:** -0.018em

### neue-haas-grotesk-display — All UI, navigation, captions, metadata, and body-adjacent text. Geometric grotesque at a single weight (400) — the system deliberately avoids bold/light contrast, using size and placement to create hierarchy instead. Use 'Inter' or 'Neue Haas Grotesk' itself (free via Adobe) as substitutes
- **Substitute:** Inter or Neue Haas Grotesk
- **Weights:** 400
- **Sizes:** 12px, 14px, 18px, 22px
- **Line height:** 1.15–1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.15 | 0px |
| body-sm | — | — | 14px | 1.2 | 0px |
| body | — | — | 18px | 1.2 | 0px |
| subheading | — | — | 22px | 1.2 | 0px |
| heading | — | — | 58px | 1.2 | -1.04px |
| display | — | — | 158px | 1.2 | -2.84px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Card padding:** 0px
- **Element gap:** 7-12px

### Border Radius

- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Image Tile
**Role:** Scattered photography containers — the primary content unit

Rectangular photograph on white. Thin 1px border in #000000 or a barely-visible white border. Zero border-radius (0px). No padding. No shadow. Image fills the tile edge-to-edge. Tiles vary in size from ~200px to ~400px and are placed in an asymmetric scatter pattern, not a grid.

### Image Overlay Caption
**Role:** Label text positioned over or adjacent to image tiles

Neue Haas Grotesk 12–14px, weight 400, color #000000. Positioned in the top-left corner of the image tile, 9px from left/right edge. Functions as a gallery placard — extremely minimal, no background, no border.

### Display Title
**Role:** Hero brand title — the dominant visual element of the page

Custom serif 'title' font, weight 400, sizes 58px or 158px, line-height 1.20, letter-spacing -0.018em. Color #000000. Centered horizontally on the page. No background, no border. The 158px size is the signature scale — it must dominate the viewport.

### Navigation Link
**Role:** Top-bar navigation items (INDEX, INFOS, ARCHIVES)

Neue Haas Grotesk 14px, weight 400, uppercase. Color #000000. 16px margin-right between items. No underline, no background, no border. Hover state: no visual change — the minimalism is absolute.

### Wordmark/Brand Mark
**Role:** Site identity in the top-left

Neue Haas Grotesk 14px, weight 400, uppercase 'LAURA MONIN'. Color #000000. Left-aligned, 16px from edge. No logo graphic — the type IS the brand mark.

### Section Label
**Role:** Small text used for project names and collection titles overlaid on images

Neue Haas Grotesk 12px, weight 400, uppercase, #000000. Appears at the top of certain image tiles. No decorative elements.

## Do's and Don'ts

### Do
- Use only #ffffff and #000000 for all surfaces, text, and borders — never introduce a third color
- Set the hero display title at 58–158px in the custom serif with letter-spacing -0.018em; this scale is non-negotiable for the editorial feel
- Use neue-haas-grotesk-display at weight 400 only — never bold, never light — for all UI text at 12/14/18/22px
- Maintain 200–300px vertical spacing between major page sections to preserve the gallery-wall breathing room
- Keep all border-radius at 0px — every container, image, and button is perfectly rectangular
- Place image tiles in an asymmetric scatter, not a uniform grid — irregular positioning is the layout signature
- Use generous negative space (60%+ of the viewport) rather than packing content into the available area

### Don't
- Do not add drop shadows, glows, or any box-shadow to any element — the design is intentionally flat
- Do not use rounded corners (border-radius > 0) on any image, card, or button
- Do not introduce accent colors, gradients, or background fills — the system is strictly black on white
- Do not use bold or semibold weights for UI text — weight 400 at all sizes is the rule
- Do not align images to a uniform grid with equal gutters — the asymmetric scatter is the layout identity
- Do not add hover animations, transitions, or micro-interactions to navigation or links
- Do not use sans-serif or grotesque fonts for headlines or display text — the serif carries all brand weight

## Elevation

The design has zero shadow vocabulary. Depth is created entirely through generous negative space and asymmetric placement — elements feel like they float on a gallery wall, not stacked on a UI. No drop shadows, no glow, no border elevation under any circumstance. This absence is signature: adding any shadow would break the editorial flatness that defines the system.

## Surfaces

- **Paper** (`#ffffff`) — Full-page background — the single surface tone for canvas, cards, and image wrappers alike

## Imagery

Photography-only visual language: full-color fashion editorial photographs (seaside, backstage, portrait) presented as rectangular tiles with no cropping effects, no duotone, no filters. Images are placed raw on the white canvas with thin hairline borders. No illustration, no icons, no abstract graphics. The photographs are the only color in the entire system — everything else is monochrome, making the images feel like vivid objects mounted on a white gallery wall. Photo tiles are isolated (no overlapping, no masking), full-bleed to their container edges.

## Layout

Full-bleed page with no max-width constraint — the canvas extends to the viewport edges. Layout is a deliberately asymmetric scatter: a top bar with brand mark left, nav center, secondary nav right; then photographs placed in irregular positions across the viewport (top-left, top-center, top-right, mid-left, center, mid-right, bottom-left, bottom-right). The massive 'La Croisette' display title sits in the center of the composition, acting as the gravitational anchor between the scattered image tiles. Vertical rhythm uses extreme section gaps (200–300px padding-bottom) to create gallery-like intervals. No traditional grid columns, no card rows — every element is hand-positioned. Navigation is a minimal top bar with small text links. No sidebar, no mega-menu, no sticky header.

## Similar Brands

- **Acne Studios (acnestudios.com)** — Same editorial fashion-portfolio language — pure white canvas, sparse asymmetric image placement, custom serif display headlines, and zero color beyond monochrome
- **Lemaire (lemaire.fr)** — Identical restraint: white space as material, scattered image grids on pure white, serif display type for hero titles, geometric grotesque for micro-copy
- **Celine (celine.com)** — Shared fashion-portfolio DNA — massive custom serif display headlines, full-bleed white canvas, photographs as the sole source of color, and anti-grid asymmetric layout
- **The Row (therow.com)** — Same luxury-through-omission approach: no color, no shadows, no rounded corners, oversized serif titles floating on white with editorial image placement
- **Phoebe Philo's brand site** — Near-identical typographic system — custom serif display titles, grotesque secondary type at weight 400, pure white canvas, and editorial photo scatter with no UI chrome
