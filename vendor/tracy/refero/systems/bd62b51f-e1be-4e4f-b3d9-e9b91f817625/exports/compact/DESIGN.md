# Little Troop — Style Reference
> Monochrome gallery with chromatic artworks. A black pearl floating in white void.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Little Troop is a design studio portfolio that behaves like a monochrome gallery: white walls, black frames, and the work itself provides all the color. The system is ruthlessly reduced to two colors and one signature radius (50px), letting project imagery carry the chromatic and visual weight. Type stays in two registers — Arial Narrow as the functional voice for navigation, labels, body, and metadata, and Times Now at weight 250 as a single display moment that whispers rather than announces. No shadows, no gradients, no decorative surface treatments — just border, whitespace, and the rounded rectangle as the sole repeating shape.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure Black | `#000000` | All text, all borders, the nav mark, section dividers, filter indicators. The structural ink of the entire system — every line, frame, and glyph is black on white |
| Pure White | `#ffffff` | Page canvas and inverse text. The only surface; cards do not introduce a separate fill — they borrow the page and let imagery do the work |

## Typography

### Arial Narrow — The functional voice of the entire interface — navigation, body, metadata, project captions, filter labels, footer copy. Narrow letterforms in a generous white field create a typesetter's galley feel; everything reads as a running label rather than as UI chrome.
- **Substitute:** Barlow Condensed (Google Fonts)
- **Weights:** 400, 700
- **Sizes:** 14px, 16px
- **Line height:** 0.86, 1.0, 1.14

### Times Now — The single display voice, reserved for the hero headline curved around the orb. Weight 250 is anti-convention — most studios reach for 600-800 bold serifs. This whisper-weight, paired with a sculptural -0.066em tracking and 0.79 line-height, makes the text feel like a ribbon on the surface rather than a title above it. When the system needs authority, it gets it through restraint, not volume.
- **Substitute:** Spectral (Google Fonts) at weight 200 with tight tracking, or Cormorant Garamond at 300
- **Weights:** 250
- **Sizes:** 76px
- **Line height:** 0.79
- **Letter spacing:** -0.066em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.14 | — |
| body | — | — | 16px | 1.14 | — |
| display | — | — | 76px | 0.79 | -5.016px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 100px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **tags:** 50px
- **cards:** 50px
- **buttons:** 50px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Five items spread edge-to-edge across the top of the page: Work, News, brand mark, Info, Contact. All text in Arial Narrow 14px black, no background, no border, no padding container. The brand mark (penguin illustration) sits centered. Generous space between items (100-230px) reads as floating labels rather than a menu bar.

### Project Grid Card
**Role:** Project thumbnail in the work index

A 50px-radius rounded rectangle filled edge-to-edge with a project image or illustration. No border, no padding, no shadow. The colorful artwork IS the card. Project title sits below the card in Arial Narrow 14px black, with a one-line description underneath. Cards are arranged in a 5-column grid.

### Project Spotlight Card
**Role:** Featured project presentation

A larger 50px-radius card (roughly 2.5x the grid card area) showing a single project's hero artwork. Cards overlap each other with a small z-offset and translate rotation for a deliberately casual, pinned-to-the-wall arrangement. No border, no shadow — only the 50px radius gives them physical presence.

### Project Index Filter
**Role:** Category filter for the work grid

A row of categories (AI, 3D Design, Animation, Naming, Brand Identity, etc.) each preceded by a small circular radio indicator (12px black-bordered circle, unfilled). Text in Arial Narrow 14px black. Wraps across the top of the project grid. No pills, no chips, no backgrounds — just dots and labels.

### Hero Orb with Curved Text
**Role:** Splash/hero moment

A single large 3D-rendered black sphere (roughly 600-700px diameter) centered in a white void. A pink/magenta specular highlight runs down its left side. Times Now 76px weight 250 text curves along the sphere's left edge, following the contour. Massive bottom padding (~89px) between the orb and the footer credit line.

### Footer Credit Block
**Role:** Studio identity and current work status

Two text blocks pinned to the bottom corners of the viewport. Bottom-left: Arial Narrow 14px — 'Little Troop is a design studio driven by craft, culture and imagination.' Bottom-right: 'Currently creating: A book for our favorite designers.' No border, no background — just black text floating in the white margin.

### Section Header
**Role:** Section label for project groupings

A short label like 'Project Index' or 'Project Spotlights' in Arial Narrow 14-16px black, top-left aligned, with a small penguin mark or icon adjacent. The label introduces a content block; the block itself sits ~100px below.

### Penguin Brand Mark
**Role:** Studio logo / nav anchor

A small illustrated penguin in black with a red beak and white belly. Appears centered in the nav and adjacent to section headers. Functions as the only chromatic mark in the chrome (the red beak is a tiny accent of red).

## Do's and Don'ts

### Do
- Use 50px border-radius on every rectangular element — cards, tags, buttons, frames. This is the system's only shape.
- Restrict the palette to #000000 and #ffffff for all chrome, text, and borders. Color is the exclusive property of project imagery.
- Set Arial Narrow at 14-16px for every functional element — nav, labels, body, metadata. Reserve Times Now weight 250 for at most one display moment per page.
- Apply 100px+ section gaps between major content blocks. The system needs white void to breathe.
- Let full-bleed imagery fill cards edge-to-edge inside the 50px radius — no padding, no captions inside the frame.
- Use 20px padding for card metadata blocks beneath cards. Keep that rhythm consistent.
- Anchor the nav and footer to viewport edges with extreme lateral margins (100-230px) so items read as floating labels.

### Don't
- Do not introduce a third color, a shadow, a gradient, or any surface tint. The two-color discipline is the brand.
- Do not use a bold display weight for headlines. Times Now weight 250 is the only display voice; if you need more presence, increase size, never weight.
- Do not use rectangular corners anywhere. Even small chips, tags, and buttons get 50px radius.
- Do not add borders, outlines, or focus rings that aren't pure 1px black. No colored states, no tinted hovers.
- Do not break the white canvas with a panel, sidebar, or container surface. The page is the only surface.
- Do not center-align body or metadata text. The footer credit and project captions are left- or right-aligned to specific edges.
- Do not use a sans-serif system font for display. The serif at ultra-light weight is what separates this system from every other minimalist agency portfolio.

## Elevation

The design is entirely flat. No shadows, no glows, no inner highlights. Depth and separation are achieved exclusively through the 50px border-radius and the contrast of full-bleed colorful imagery against the white void. This is a deliberate editorial choice — the work itself sits in the same physical plane as the chrome around it.

## Surfaces

- **Gallery White** (`#ffffff`) — Single flat canvas. No card surface, no panel surface — the page is the surface.

## Imagery

Imagery is the chromatic content of the system and is treated as a found object, not a designed asset. The work grid contains full-bleed editorial photography (campaign shoots, portraits, product stills), flat illustration (the MoMA Family Festival poster uses bold, high-contrast cartoon forms in green, pink, and purple), 3D-rendered objects (the hero orb is a glossy black sphere with a pink specular highlight — a literal glossy-painted ceramic or chrome ball photographed under studio light), and typography-as-art (the MoMA wordmark, the 'ROCCO' logo, the 'TEATIME pictures' title card). All imagery is contained inside the 50px-radius card frame. No drop shadows, no torn edges, no rotation artifacts — only the radius. The hero sphere is the only instance where an object appears without a frame; it is the page. Photography ranges from high-key to high-contrast editorial, with no consistent color treatment because each project is its own world. The system never adds duotones, overlays, or color grading — what the work looks like, it looks like.

## Layout

Edge-to-edge full-bleed layout with no visible max-width container; the page reads as a series of full-viewport bands. The hero is a single centered object (the orb) with text floating to its left and footer credits pinned to the bottom-left and bottom-right corners. Below the hero, a filter band runs the full width with 15+ category labels in two horizontal rows. The project index is a 5-column grid of 50px-radius image cards with titles beneath; the grid fills the viewport width with no gutters beyond the implicit spacing of the grid. The project spotlight section breaks the grid with two oversized 50px-radius cards that overlap each other and extend off-frame — a deliberately casual, gallery-wall arrangement. Navigation is a single thin band at the very top with five labels and a centered brand mark. Sections are separated by 100px+ of pure white space. No sidebars, no containers, no centered content column — the work itself is the layout.

## Similar Brands

- **Studio Output** — Same two-color discipline with bold 50px-radius project cards and Arial Narrow / narrow-grotesque functional type
- **Pentagram** — Editorial white-canvas agency portfolio where project work provides all color and the chrome is almost invisible
- **Instrument** — Full-bleed project grids with generous whitespace, monochrome chrome, and a single ultra-light display moment
- **Bureau Cool** — A narrow-grotesque interface type, absence of shadows, and oversize rounded cards as the sole repeating component
- **Wieden+Kennedy** — Treats the portfolio as a gallery wall — no decorative chrome, no branded colors, the work is the visual system
