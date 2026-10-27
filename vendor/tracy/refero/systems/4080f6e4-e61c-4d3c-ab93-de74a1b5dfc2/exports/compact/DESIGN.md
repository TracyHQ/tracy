# Ryan Stephen — Style Reference
> Quiet gallery wall on white plaster — the portfolio is the product, the UI is invisible.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ryan Stephen's portfolio is a quiet gallery wall on white plaster: nearly all black and white, with one warm gray doing the work of secondary text and link borders. The layout is content-first and image-dominant — a single bio block on the left, a 3-column photo grid on the right — with no chrome, no decoration, and no brand color competing with the work. The visual system is intentionally austere: system fonts, a single 10px image radius, generous whitespace, and zero shadows or gradients. Every interface element is reduced to its function so the photographs carry the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Primary text, image frame borders, structural lines |
| Charcoal | `#404040` | Secondary body text, subdued labels |
| Warm Ash | `#8b8b94` | Muted helper text, link borders, link text, decorative dividers |
| Plaster White | `#ffffff` | Page canvas, card surfaces, image backgrounds |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### system-ui — All text uses the OS system font stack. 16px weight 500 carries the bio paragraph and link text; 12px weight 400 covers the small link row (Email · Twitter · LinkedIn) and metadata. The deliberate choice of native system fonts — no custom typeface, no webfont load — keeps the chrome weightless and lets the photographs be the only typographic event on the page.
- **Substitute:** system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Weights:** 400, 500
- **Sizes:** 16px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body | — | — | 16px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 100px
- **Card padding:** 40px
- **Element gap:** 20px

### Border Radius

- **cards:** 10px
- **images:** 10px

## Components

### Bio Block
**Role:** Left-column introduction paragraph

Body paragraph in 16px system-ui weight 500, #000000. Sits flush-left at the top of the page, directly above the link row. No card, no border, no background — just text on the white canvas.

### Social Link Row
**Role:** Inline list of outbound links

Three links (Email, Twitter, LinkedIn) separated by whitespace, 12px system-ui weight 400, #000000. No icons, no underlines, no buttons — just bare text labels on a single line.

### Image Gallery Grid
**Role:** 3-column photo grid showing portfolio work

Three equal columns with 15–20px row and column gaps. Each tile is a photograph inside a 10px-radius container. No captions, no borders, no hover effects visible — the images speak for themselves.

### Gallery Tile
**Role:** Single photograph in the grid

Full-bleed image clipped to a 10px border-radius. No padding, no shadow, no border. Aspect ratio is left natural to the source photo — the grid accepts mixed orientations.

### Text Link
**Role:** Inline navigation to email/social profiles

Bare text at 12–16px, #000000, no underline by default. Inherits system-ui. When chromatic, sits in #000000 — the same color as body text, distinguished only by context and convention.

## Do's and Don'ts

### Do
- Use 10px border-radius for all images and any card-like surface
- Keep the palette restricted to #000000, #404040, #8b8b94, and #ffffff — no accent colors
- Use system-ui at 16px weight 500 for body and 12px weight 400 for meta/link rows
- Set line-height to 1.20 across all text
- Maintain the 3-column image grid with 15–20px gaps and 100px section breathing room
- Let images sit on the white canvas with no frames, shadows, or backgrounds
- Write links as plain text — no buttons, no underlines, no icons

### Don't
- Don't introduce a brand color or accent — the absence of color is the brand
- Don't add drop shadows, gradients, or elevation effects to any element
- Don't load a custom webfont — system fonts are the system
- Don't use a border-radius other than 10px on images or cards
- Don't wrap the bio or link row in a card, container, or bordered box
- Don't add icons to social links or nav items
- Don't apply different radii to different elements — one value across the system

## Elevation

The design has zero elevation — no shadows, no layered surfaces, no z-axis distinction. The only depth cue is the 10px corner radius on images, which separates photograph from canvas through shape alone. Everything else is flat and flush.

## Surfaces

- **Canvas** (`#ffffff`) — Full page background — the only surface in the system
- **Image Tile** (`#ffffff`) — White backstop behind photographs, 10px-clipped to the image

## Imagery

Photography is the entire visual language. The grid shows hands holding phones displaying UI work — tight first-person product crops, no lifestyle staging, no environmental context beyond a blurred tabletop or wall. Treatment is natural color, not filtered or duotone. Images are presented unframed at 10px radius with no captions or labels — the work is self-documenting. Iconography, illustration, and abstract graphics are absent; photography fills 100% of the visual space outside the text block.

## Layout

Two-zone asymmetric composition: a narrow left column (roughly 30% width) holds the bio paragraph and link row, flush-left with no alignment to the grid below. The right zone (roughly 70% width) is a 3-column image grid that starts at the top of the page and continues as a uniform stack. Both zones share the same top edge — the text doesn't center against the first row of images. Vertical spacing between the bio block and the link row is tight (single line break); the gap between the link row and the image grid is the page's first real section break. There is no header, nav bar, or footer. The page reads top-to-bottom as one continuous surface: text → links → infinite photo scroll.

## Similar Brands

- **Craigslist** — Same radical content-first minimalism — no chrome, no decoration, the work or text is the only thing on the page
- **Are.na** — Same grid-of-images-on-white aesthetic with system fonts and no brand color
- **Cargo Collective portfolios** — Same photographer/designer portfolio pattern: large white canvas, image grid, minimal text, no UI ornamentation
- **Pinterest** — Same masonry-style image grid structure with rounded image corners, though Pinterest adds much more UI chrome
