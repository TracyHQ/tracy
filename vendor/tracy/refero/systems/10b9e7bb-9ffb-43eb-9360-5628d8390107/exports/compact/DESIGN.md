# Studio HEED — Style Reference
> midnight gallery wall — black exhibition space with hairline white frames and tiny precise labels

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Studio HEED operates as a midnight editorial gallery: an almost entirely monochrome canvas where the page itself is the dark room, white hairline borders become picture frames, and the work hangs like a curated exhibition. Every surface decision — the near-black canvas, a single deep navy panel, a warm cement gray alternate — reduces visual noise to let the project tiles breathe. Typography is deliberately microscopic (12–14px, weight 600) so labels whisper authority rather than shout, turning small caps into the studio's signature rhythm. Radii are locked to 5px everywhere, which keeps the aesthetic architectural and unfussy — no soft pillowy cards, no decorative gradients, no shadows. The grid gap of 14px is the heartbeat of the layout, giving every project the same precise breathing room regardless of column count.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, dominant card surface — the near-black that absorbs the eye and lets project imagery carry all visual weight |
| White | `#ffffff` | Hairline borders, text, link borders, and the 124 link borders form the white wireframe structure of every tile and section |
| Midnight Navy | `#00174f` | Accent card surface and decorative panels — the only chromatic hue in the system, used sparingly as a deep tonal interruption against the void |
| Cement | `#c2c1bf` | Alternate card surface — a warm desaturated gray that breaks the black/navy rhythm when a tile needs to feel physical or grounded |

## Typography

### Suisse Intl — Exclusive display and body font — the studio's signature is deploying a weight 600 grotesque at a whisper-small 12–14px for absolutely everything, from navigation to project labels to body copy. This uniform micro-size is anti-convention; most agencies use a dramatic type scale, but HEED treats 12–14px weight 600 as a single visual register, like a single monospace that carries every function.
- **Substitute:** Inter, Neue Haas Grotesk, NB International
- **Weights:** 600
- **Sizes:** 12px, 14px
- **Line height:** 1.40
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | — |
| body-sm | — | — | 14px | 1.4 | — |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 14px

### Border Radius

- **all:** 5px
- **cards:** 5px
- **images:** 5px
- **buttons:** 5px

## Components

### Project Gallery Tile
**Role:** Primary content unit — the exhibition piece hanging on the gallery wall

A rectangular card with 5px border radius, no shadow, sitting on the #000000 canvas. The tile alternates between four surface treatments: full-bleed photo (rounded to 5px), solid Midnight Navy #00174f, solid Cement #c2c1bf, or inverted White #ffffff for product/white-bg photography. No internal padding between image and tile edge — the image IS the tile. Below the tile, a 20px caption block holds the project name in Suisse Intl 14px weight 600 white, with the category (e.g. 'Brand & Packaging') at 12px weight 600 white directly beneath. The 14px gap between image bottom and caption creates the studio's tight editorial rhythm.

### Project Caption Label
**Role:** The two-line label identifying each gallery tile

Two stacked lines: project name at 14px weight 600 white #ffffff, category/discipline at 12px weight 600 white #ffffff. No separator, no bullet, no period — just two lines of identical weight at different sizes. The 20px padding block creates visual breathing room above the next tile or section edge.

### Studio Header Block
**Role:** Top-of-page identity, navigation, and contact information

A horizontal block on the void canvas. Left: 'Studio HEED' in Suisse Intl 14px weight 600 white, followed by 'Work, Info' nav links at the same size and weight. Right: stacked contact lines (email, phone, Instagram, Twitter) at 12px weight 600 white, with a language toggle ('En, De') below. The header occupies roughly the top 40% of the viewport with the descriptive paragraph (Suisse Intl 14px weight 600) sitting in a narrow left-aligned column beneath the studio name.

### Nav Link
**Role:** Primary site navigation items

Inline text link in Suisse Intl 14px weight 600 white #ffffff, separated by 14px gaps. No underlines, no background fills — pure typographic navigation. Sits horizontally next to the studio name in the header.

### Language Toggle
**Role:** Bilingual site switcher

Two items ('En, De') at 12px weight 600 white #ffffff, separated by a comma and space. No active state styling — the comma itself acts as separator. Sits at the bottom of the right-side contact stack.

### Contact Info Line
**Role:** Email, phone, and social handles displayed in the header

Single-line entries (hello@studioheed.com, +43 650 257 9101, Instagram, Twitter) in Suisse Intl 12px weight 600 white #ffffff, stacked vertically with 14px row gap. No labels, no icons — the content is self-evident.

### Description Paragraph
**Role:** Studio self-description below the header identity

Left-aligned body copy in Suisse Intl 14px weight 600 white #ffffff, limited to a narrow column (~30% of viewport width). The text describes the studio's practice in third person, treated with the same weight and size as navigation — no hierarchy distinction between meta-info and body copy.

### Gallery Row
**Role:** Horizontal strip of project tiles

A single-row horizontal carousel/scroll of project tiles. Tiles are equal-height rectangles, separated by 14px column gaps, filling the viewport width. The 5px radius applies to each tile. Tiles may clip at viewport edges, suggesting horizontal scroll. No navigation controls visible — the row is an endless exhibition wall.

## Do's and Don'ts

### Do
- Use #000000 as the default page canvas for every section — the void IS the brand
- Apply 5px border-radius to every card, image, and interactive surface — never deviate
- Keep all type at 12px or 14px weight 600 Suisse Intl — the micro-type register is the signature
- Maintain 14px gaps between gallery tiles and between stacked metadata lines
- Use #ffffff for all text and hairline borders — the white wireframe IS the UI structure
- Present projects as equal-height tiles in a horizontal row, separated by 14px gaps
- Let the four surface colors (void, white, midnight navy, cement) carry all visual variety — no gradients, no shadows, no decorative elements

### Don't
- Never add drop shadows, elevation, or glow effects to any surface
- Never use a type size larger than 14px — the micro-type register is non-negotiable
- Never introduce additional colors beyond the four surface tones — the palette is closed
- Never use soft radii (8px+) or pill shapes (9999px) — 5px is the only radius in the system
- Never use font weights below 600 — the uniform semibold weight carries the entire voice
- Never add underlines, backgrounds, or color differentiation to active nav states
- Never use gradients, photographic backgrounds, or illustrated section dividers between content blocks

## Elevation

Elevation is deliberately absent. The design language treats the void canvas as a flat gallery wall — tiles are distinguished by their fill color, never by shadow or depth. This creates a print-editorial feel rather than a software UI feel. No drop shadows, no glow effects, no modal overlays with backdrop blur.

## Surfaces

- **Void Canvas** (`#000000`) — Full-bleed page background — the dark room that holds the exhibition
- **Midnight Panel** (`#00174f`) — Accent project tiles and decorative breaks
- **Cement Tile** (`#c2c1bf`) — Warm alternate surface for project cards that need physical presence
- **White Inset** (`#ffffff`) — Inverted project tiles (white photography backgrounds) and image surfaces

## Imagery

Photography and project artwork are the only imagery. Project tiles contain full-bleed product photography, brand identity mockups, or campaign visuals that fill the entire tile edge-to-edge. The 5px radius softens the images just enough to feel contemporary without feeling soft. There is no decorative photography, no lifestyle imagery, no abstract graphics — the work itself is the visual content. Iconography is absent from the interface. The contrast between white-background product photography (tiles) and dark campaign imagery (other tiles) creates visual rhythm within the single-row gallery. Labels are always white, sitting in the void below the tile, never overlaid on imagery.

## Layout

Full-bleed dark canvas with no maximum content width — the void extends to all viewport edges. The header block occupies the top ~40% of the viewport with a narrow left-aligned text column and a right-aligned contact stack. The project gallery is a single horizontal row of equal-height rectangular tiles with 14px gaps, filling the full viewport width and suggesting horizontal scroll. Below each tile, a caption block provides project identification. There are no multi-row grids, no sidebars, no traditional page sections — just the header block and the gallery wall. Navigation is inline text in the header, not a separate bar.

## Similar Brands

- **Pentagram** — Same editorial portfolio gallery approach with project tiles as the primary content unit and a typographic-only header
- **Bureau Cool** — Same flat dark canvas with no shadows, minimal type scale, and project-first tile-based layouts
- **Mast Studio** — Same micro-type register (12-14px) carrying the entire interface voice and 5px radii on all surfaces
- **DIA Studio** — Same monochrome void canvas with hairline white structural elements and four-tone surface palette
