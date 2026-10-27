# Dries Bos — Style Reference
> editorial ink on warm vellum

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A monochromatic portfolio language built on warm vellum paper and near-black ink — the visual equivalent of an architect's drafting table. Every element is a line, a label, or empty space; no fills, no shadows, no chromatic accents interrupt the editorial calm. The work list is a spreadsheet made beautiful: columns, dates, project names, and discipline tags sit on the same horizontal grid, separated by hairline rules rather than card containers. The hero is a large wireframe drawing — thin strokes on warm ground — that signals the developer's craft without ever showing a screenshot. Color is structural (paper, ink, gray) not expressive; the site trusts whitespace and type to carry mood.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vellum | `#e8e7e3` | Page background, table row base, card surfaces — warm off-white reads as paper, not screen |
| Parchment | `#dddbd5` | Alternating table rows, subtle surface lift one step above the canvas |
| India Ink | `#050200` | Body text, hairline borders, wireframe strokes, icon strokes — the only high-contrast tone in the system |
| Graphite | `#747472` | Muted secondary text, disabled icon strokes, de-emphasized metadata |

## Typography

### Sohne Buch — All interface and editorial text — headlines, body, table cells, labels. Used at one weight (400) across all roles; the single weight plus generous letter-spacing carries the quiet authority instead of bold/regular contrast
- **Substitute:** Inter, Söhne, Untitled Sans, Neue Haas Grotesk
- **Weights:** 400
- **Sizes:** 20px
- **Line height:** 1.45

### myFont — Icon glyph set — arrows, external-link markers, theme toggle, search, moon/sun. The 1.0 line-height confirms this is a pictogram face, not running text
- **Substitute:** Phosphor, Lucide, or a custom icon set with 1.0 line-height metrics
- **Weights:** 400
- **Sizes:** 20px
- **Line height:** 1.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.45 | — |
| body | — | — | 16px | 1.45 | — |
| subheading | — | — | 20px | 1.45 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 79px
- **Card padding:** 25px
- **Element gap:** 10px

### Border Radius

- **icons:** 0px
- **buttons:** 0px
- **table_rows:** 0px
- **pill_elements:** 1000px

## Components

### Work Table Row
**Role:** Primary navigation through portfolio — one project per row

Full-width row on vellum (#e8e7e3) or parchment (#dddbd5) background, no border between rows. Four-column flex layout: year (left-aligned, ~80px), project name (flexible width, India Ink #050200), discipline tag (muted Graphite #747472), action icons (right-aligned). Vertical padding ~25px. Type: Sohne Buch 400 at the base scale. No hover state beyond the existing tone — the row is always legible.

### Column Header
**Role:** Labels above the work table

Same baseline as table cells but in Graphite #747472 instead of India Ink. Right-aligned for the last column (action icons). Padding 25px top/sides, matches row padding so columns optically align.

### Header Bar
**Role:** Persistent identity strip at the top of every viewport

Single horizontal band, vellum background, no border. Left: wordmark 'Name — Discipline' in India Ink at 14-16px. Right: three icon controls (theme toggle, expand/collapse, close) in 20px myFont glyphs, stroke India Ink. No logo lockup, no nav links — the header IS the navigation.

### Theme Toggle Icon
**Role:** Switch between light and dark rendering

20×20px myFont glyph (half-filled circle), India Ink stroke. Sits inline with other header icons. No background, no border, no label — the icon is self-explanatory.

### Arrow Link
**Role:** Inline directional cue for the bio/intro line

20px myFont right-arrow glyph, India Ink, sits at the right edge of the description text block. The arrow IS the link affordance — no underline, no color change, no button container. Vertical-aligned to the last line of the paragraph.

### External Link Icon
**Role:** Indicator that a work item opens in a new tab

20px myFont diagonal-arrow glyph, India Ink, positioned in the action column of table rows that have an external URL. Paired with the standard arrow icon in the same row.

### Bio Description Block
**Role:** Hero-adjacent text introducing the developer

Two short sentences in Sohne Buch 400, India Ink, left-aligned, max-width matches the table width. Arrow link at the end of the second line. No headline, no label, no decoration — just type on vellum.

### Wireframe Hero Illustration
**Role:** Signature visual element — a line drawing occupying the top third of the page

Thin-stroke architectural sketch (perspective box / room / frame) rendered in India Ink lines at ~0.5-1px. No fills, no shading, no color. Sits on vellum background. The drawing bleeds off the edges of the viewport — it is not contained in a card. This is the only piece of visual content on the entire site.

### Search Icon
**Role:** Optional filter trigger for the work table

20px myFont magnifying-glass glyph, Graphite #747472 (de-emphasized vs the action icons), right-aligned in the column header row.

## Do's and Don'ts

### Do
- Keep the palette to exactly four tones: Vellum, Parchment, India Ink, Graphite. Never introduce a chromatic color.
- Set table row and card padding to 25px on all sides — this is the dominant rhythm of the layout.
- Use Sohne Buch 400 at a single weight for all text. Do not bold, do not italic. Hierarchy comes from size and color (Graphite vs India Ink), not weight.
- Draw borders and dividers as 1px India Ink hairlines. Do not use 2px+ rules; do not use shadows.
- Use the myFont icon set at 20px with 1.0 line-height. Align icons optically to the x-height of adjacent text, not to the bounding box.
- Let whitespace carry visual weight. Maintain ~79px vertical gap between major sections.
- Keep all interactive elements borderless. The arrow, link, and icon ARE the affordance — no button containers, no filled states.

### Don't
- Do not add a brand color, accent color, or CTA fill. The system is monochromatic by design.
- Do not apply border-radius to rows, table cells, or cards. Corners are sharp (0px). Only pill elements (1000px) curve.
- Do not introduce drop shadows, glows, or elevation effects. Surfaces are flat; separation is tonal (Vellum → Parchment) or hairline.
- Do not use multiple font weights. Sohne Buch 400 is the only registered weight — adding 500/600/700 breaks the editorial restraint.
- Do not wrap interactive elements in button containers. Links are text + arrow icon, nothing more.
- Do not use photography, gradients, or colored illustrations. The wireframe line drawing is the only visual content; honor that.
- Do not right-align body text. All editorial copy is left-aligned, including the bio description.

## Elevation

The system deliberately uses zero shadow. Separation between elements is achieved through tonal shifts (Vellum → Parchment), hairline 1px borders, and whitespace — never through drop shadows or blur effects. This flatness is a signature choice: it makes the interface read as printed matter, not software.

## Surfaces

- **Canvas** (`#e8e7e3`) — Page background — the warm paper ground
- **Row Surface** (`#dddbd5`) — Alternating table row background, creates the only surface differentiation in the system

## Imagery

The site has exactly one visual element: a large wireframe / line-drawing illustration in the hero zone, rendered as thin India Ink strokes on the Vellum background. No photography, no raster images, no colored illustrations, no gradients, no product screenshots. The wireframe (perspective architectural geometry) bleeds beyond the viewport edges and signals the developer's spatial/structural thinking. The rest of the site is pure type and table.

## Layout

Single full-width column, max-width ~1200px centered. Hero zone contains the wireframe illustration bleeding to viewport edges, with the header bar overlaying its bottom edge. Below the hero, a bio description block sits in the same left-aligned column. The majority of the page is a four-column data table (year, project name, discipline, action icons) with generous 25px row padding. No multi-column grids, no card grids, no sidebar. The entire scroll is vertical through a single list. Navigation is a minimal header bar with three icon controls — no nav links, no menu.

## Similar Brands

- **Rauno Freiberg** — Same editorial minimalism — warm monochrome palette, generous whitespace, type and wireframe as the primary visual language
- **Stas Ponomarenko** — Same table-as-portfolio pattern with hairline structure, no card containers, sharp 0px corners
- **Cobe (architects)** — Same wireframe/blueprint line-drawing hero treatment on warm off-white background, type-only body
- **Phil Stumph** — Same single-weight sans-serif typography, monochromatic restraint, and index-list-as-navigation approach
