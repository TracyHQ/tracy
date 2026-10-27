# Nathan Riley — Style Reference
> Gallery wall in a black void. A monochrome portfolio where the grid of atmospheric renders is the only color, and a single oversized serif name card anchors the center like a magazine cover floating over the work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Nathan Riley's portfolio is a monochrome art gallery rendered as a full-bleed image mosaic — a tight grid of atmospheric 3D renders that fills every pixel, with the artist's name floating in a single pale-rose card at the center. The palette is ruthlessly reduced to three values: pure black, pure white, and a warm dark gray, so all visual energy comes from the imagery itself rather than color. Typography is custom-serif, ultra-light at display weight, and stretched to a 238px hero that dominates the center card like a magazine masthead. The system has no rounded corners, no shadows, no gradients, and no button fills — navigation is a row of small pill-shaped text chips at the bottom, and the overall feel is that of a curated exhibition catalog printed on white paper with one large editorial title.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure Black | `#000000` | Text, image grid gutter borders, hairline dividers, nav chip outlines — the structural ink that defines the grid structure and typography |
| Paper White | `#ffffff` | Page canvas, nav chip backgrounds, card surface — the gallery wall behind everything |
| Warm Charcoal | `#393939` | Central name card surface, secondary text, soft borders — the mid-tone that makes the pale-rose card read as a distinct layer without breaking the monochrome |
| Blush Card | `#e8c4c0` | Background of the central name card — the only chromatic accent, a dusty rose that warms the otherwise pure black-and-white system |

## Typography

### font1 — font1 — detected in extracted data but not described by AI
- **Weights:** 300, 400
- **Sizes:** 12px, 238px
- **Line height:** 0.8, 1.1
- **Letter spacing:** -0.04

### Custom Display Serif — Hero name display and small print. The 238px size with line-height 0.80 and -0.04em tracking creates a tightly cropped masthead that feels printed, not rendered. Weight 300 at display size is the signature — it whispers rather than shouts, giving the name editorial weight through restraint rather than boldness. The italic treatment in the screenshot adds a calligraphic warmth that contrasts the rigid grid around it.
- **Substitute:** GT Sectra Display, Tiempos Headline, or Domaine Display Light
- **Weights:** 300, 400
- **Sizes:** 
- **Line height:** 0.80, 1.10

### Custom Body Serif — Body copy, bio description, nav chip text, and link labels. Tight line-height 1.10 at small sizes creates a dense, catalog-like feel. The -0.025em tracking tightens the letterforms for compact, refined small text that reads as label or caption rather than prose.
- **Substitute:** GT Sectra, Söhne Buch, or Publico Text
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.10

### font2 — font2 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.1
- **Letter spacing:** -0.025

### ui-sans-serif — ui-sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.1 | -0.3px |
| body-sm | — | — | 14px | 1.1 | -0.35px |
| body | — | — | 16px | 1.1 | -0.4px |
| display | — | — | 238px | 0.8 | -9.52px |

## Spacing & Layout

**Density:** comfortable

- **Card padding:** 38px
- **Element gap:** 6px

### Border Radius

- **tags:** 9999px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 9999px

## Components

### Image Grid Tile
**Role:** Primary content unit — each cell of the mosaic

A 3D-rendered image or photograph filling its grid cell edge-to-edge. No padding, no border, no radius, no shadow. Tiles abut directly with 2px black gutter lines or hairline gaps acting as the only separation. The image is the surface — no container chrome.

### Central Name Card
**Role:** The artist's identity card anchored over the grid

Fixed-position card centered on the viewport with #e8c4c0 dusty-rose background and 38px padding all sides. Contains the display serif name at 238px weight 300-400 italic, line-height 0.80, letter-spacing -0.04em. Below: a bio paragraph at 14-16px weight 400, charcoal text, tight 1.10 line-height. A small 'PROFILE >' link in monospace-style caps at 12px. No border, no shadow, no radius — the color contrast alone separates it from the image grid.

### Pill Navigation Chip
**Role:** Social/contact link in the bottom bar

White (#ffffff) background, no visible border, 9999px border-radius for a fully rounded pill shape. Text is 12-14px weight 400 in uppercase tracking, black (#000000). Chips sit in a horizontal row with 6px gap between them. No fill state, no hover color shift evident — the pill shape and size do all the work.

### Profile Link
**Role:** Secondary text link inside the name card

Small uppercase or mono-style text at 12px, likely with a '>' or arrow glyph. Functions as a tertiary navigation affordance, styled as a text label rather than a button. No underline, no color change — spatial relationship to surrounding text is the only hierarchy cue.

### Masonry Grid Container
**Role:** Page-level layout structure

Full-bleed CSS grid covering the entire viewport. No max-width constraint, no centering, no margins. Image tiles arranged in a masonry-like pattern with varying row heights to accommodate different aspect ratios. Black 2px lines or minimal gaps form the grid lattice. The grid is the page — there is no header, no footer bar, no sidebar.

### Image Gutter Divider
**Role:** Hairline separation between grid cells

2px black (#000000) lines or minimal gap between adjacent image tiles. Functions as a gallery wall mount system — thin, structural, invisible until you look for it. No decorative role, purely organizational.

### Bio Description Block
**Role:** Text body inside the central name card

14-16px custom body serif, weight 400, line-height 1.10, color #393939 or #000000. Uppercase or small-caps treatment with -0.025em tracking. Reads as a credit line or exhibition wall text — compressed, label-like, not narrative prose. Max-width constrained within the card to maintain a narrow text column beside or below the oversized name.

## Do's and Don'ts

### Do
- Use only the three neutral values plus the single dusty-rose card color — never introduce a new hue, the system is intentionally monochrome
- Set display name text at 238px with line-height 0.80 and -0.04em letter-spacing to reproduce the editorial masthead effect
- Use 9999px radius exclusively for nav pill chips — all other elements stay at 0px radius
- Keep all image tiles edge-to-edge with no padding, no rounded corners, and no shadows — the grid is the layout, not a container
- Anchor the central name card with #e8c4c0 background and 38px padding on all sides as the single non-monochrome surface
- Use custom serif at weight 300-400 for all display text — never substitute a sans-serif headline, the serif is the brand
- Maintain 6px gap between nav chips and 2px between image grid cells to keep spacing tight and structural

### Don't
- Do not add any new color — no blues, greens, or warm tones beyond the single blush card background
- Do not use border-radius on cards, images, or content containers — only pill nav chips get radius
- Do not apply shadows or elevation effects to any component — the system is flat, relying on color contrast and grid structure for depth
- Do not add gradients of any kind — the palette is solid only
- Do not use sans-serif for headlines or display text — the custom serif at extreme sizes is the signature element
- Do not constrain the image grid with a max-width container — the grid must be full-bleed edge-to-edge
- Do not add header navigation, footers, or sidebar chrome — the floating name card and bottom pill row are the entire navigation system

## Surfaces

- **Canvas** (`#ffffff`) — Full-viewport page background behind the image mosaic
- **Image Tile** (`#000000`) — Image cells fill the grid; black serves as the gutter/border color between cells
- **Blush Name Card** (`#e8c4c0`) — Central floating card with the artist's name — the single non-grayscale surface
- **Nav Pill** (`#ffffff`) — Small pill-shaped chips in the bottom nav row

## Imagery

The entire site IS imagery — a dense grid of 3D-rendered atmospheric scenes: surreal garden pools, floating furniture, overgrown ruins, lavender fields, golden orbs, mountain landscapes at sunset. All renders share a cohesive mood: soft natural light, painterly atmosphere, dreamlike scale, muted natural palettes (pinks, greens, golds, blues within the art itself). The images are full-bleed, no rounded corners, no overlays, no captions — each render is a self-contained frame in the gallery wall. The photography/3D style is editorial-surreal, reminiscent of Thomas Demand or teamLab installations, where natural and architectural elements exist in impossible gentle arrangements.

## Layout

Full-bleed image mosaic covering 100% of the viewport with no page-level container. A fixed/aspected masonry grid of 3D renders tiles the entire screen edge-to-edge with hairline gaps. A single dusty-rose name card is centered in the viewport (not the page) as a floating overlay, positioned dead-center like a magazine cover pasted on a gallery wall. A horizontal row of small pill-shaped nav chips sits near the bottom of the central card. No traditional header, no footer bar, no sidebar — the image grid IS the page structure, and the centered card is the only interruption. Navigation is minimal: a bottom row of contact links inside the card.

## Similar Brands

- **Daniel Arsham** — Same art-portfolio-as-mosaic approach with grid-based image presentation and minimal text chrome
- **teamLab** — Dense image-grid portfolios with no traditional navigation, where the artwork is the layout
- **James Turrell** — Minimalist artist portfolio with restrained palette where the work itself provides all visual interest
- **Refik Anadol** — Full-bleed media-mosaic landing pages with a single centered identity element floating over imagery
- **COS (cosstores.com)** — Same editorial restraint with custom serif display type at extreme sizes and a strictly achromatic palette
