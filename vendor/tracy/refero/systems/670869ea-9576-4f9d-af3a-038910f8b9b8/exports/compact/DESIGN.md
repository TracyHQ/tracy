# Studio Emmerer — Style Reference
> Typeset on drafting paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Studio Emmerer presents itself as typed content first, photography second — a two-tone document where NHaasGrotesk weight 400 carries every word at 16px or 30px, with tight 0.90–1.16 line-heights and negative tracking at every size. The palette is strictly black, white, and a single mid-gray (#999999) reserved for table column headers; there are no fills, no shadows, no rounded corners, no decorative graphics of any kind. A flat project table dominates the page — 1px black row dividers, 12px vertical padding, edge to edge with no card containers wrapping the rows. The right-arrow glyph (→) is the only interactive ornament, prefixing inline underlined links for both site navigation and individual project entries. Everything else is whitespace and type: the layout reads like a printed catalogue spread, not a software interface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure Black | `#000000` | Body text, inline links, project titles, table row dividers, the arrow (→) glyph |
| Drafting White | `#ffffff` | Page background, surface under all content — no tint, no gradient |
| Index Gray | `#999999` | Table column headers (PROJECT, TYPE, LOCATION, YEAR), supporting metadata, secondary borders |

## Typography

### NHaasGrotesk — Sole typeface for every UI element — headlines, body, links, table cells, column headers, navigation. Single weight 400 across the entire system, with negative letter-spacing tightening at every size. The Neue Haas Grotesk DNA (geometric neutrality, grotesque proportions) is what carries the architectural-document feel; substitute Helvetica Neue or Inter as a free fallback.
- **Substitute:** Helvetica Neue, Inter, Neue Haas Grotesk Text Pro
- **Weights:** 400
- **Sizes:** 15px, 16px, 20px, 30px
- **Line height:** 0.90 (display), 1.16 (body, caption, subheading)
- **Letter spacing:** -0.0110em at 30px, -0.0100em at 20px, -0.0080em at 16px, -0.0050em at 15px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 17.4 | -0.08px |
| subheading | — | — | 20px | 23.2 | -0.2px |
| display | — | — | 30px | 27 | -0.33px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 32px
- **Element gap:** 5px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Project Table Row
**Role:** The primary repeating element on the page — each project is one row in a four-column table.

Flat table cell with no fill, no padding-top, 12px padding-bottom, 4px padding-left. 1px solid #000000 bottom border separates each row. Project name (left column) in 16px NHaasGrotesk weight 400 #000000, left-aligned with 4px indent. Type, Location, and Year columns are right-aligned in the same 16px #000000. No hover state, no zebra striping, no rounded corners.

### Table Column Header
**Role:** Labels the four columns above the project list.

Small caps (or CSS text-transform: uppercase with default tracking) set in 15px NHaasGrotesk weight 400 #999999. Same 12px bottom padding as data rows. Words: PROJECT, TYPE, LOCATION, YEAR. The lighter gray distinguishes the header label from the data row beneath without changing weight or size drastically.

### Inline Navigation Link
**Role:** Site-level navigation — about, contact, imprint, read more.

Inline text with a 1px #000000 underline. No pill shape, no fill, no border-radius. Often prefixed with a → arrow glyph and separated by 30px right margin. Wraps inline with the surrounding paragraph text. Hover state: no change — color and weight stay constant.

### Arrow Glyph (→)
**Role:** The only icon in the entire system. Marks navigability.

U+2192 RIGHTWARDS ARROW rendered in NHaasGrotesk at the same size and color as the adjacent text. Used to prefix every link (→ about, → contact, → Open Project, → read more) and as left/right nav controls (← →) beside the news count. Never replaced by a graphic icon or SVG.

### Hero Photograph
**Role:** Large editorial image occupying the right half of the viewport on first load.

Full-bleed within its column, no border, no border-radius, no padding, no caption overlaid. Aspect ratio is determined by the viewport — it is simply the right half of the screen at 100% height. Subject is always architectural site documentation at high contrast (stone, concrete, interior, tunnel, building). No filter, no duotone, no gradient overlay.

### Intro Paragraph
**Role:** Landing text describing the practice, anchored in the upper-left column.

30px NHaasGrotesk weight 400 #000000, line-height 0.90, letter-spacing -0.33px. Wraps at approximately 45% of viewport width to leave room for the hero image. The display scale is used here rather than the body scale — there is no separate headline element.

### News/Featured Project Caption
**Role:** Metadata strip directly under the hero image.

Three-part inline row: 'News 2/19' in 15px #999999 on the left, ← → nav arrows in 16px #000000 centered, project title ('Castle museum Linz - New underground city access') and '→ Open Project' link in 16px #000000 on the right. No box, no border, no background.

## Do's and Don'ts

### Do
- Use NHaasGrotesk weight 400 for every piece of text on the page — no exceptions, no weight variations.
- Set display text to 30px with line-height 0.90 and letter-spacing -0.33px; set body to 16px / 1.16 / -0.13px.
- Use 1px solid #000000 as the only border — for table row dividers, link underlines, and any structural separator.
- Prefix every interactive link with the → arrow glyph in the same size and color as the link text.
- Use #999999 for table column headers and supporting metadata only; keep all primary text and links at #000000.
- Let whitespace define hierarchy — use 12px row padding and 32px section gaps rather than cards or fills.
- Keep photography edge-to-edge with no border-radius, no overlay, and no caption box.

### Don't
- Never introduce a chromatic color — the palette is strictly black, white, and #999999.
- Never use font-weight above 400 — bold or semibold would shatter the single-weight voice of the system.
- Never add box-shadow, drop-shadow, or any z-axis elevation.
- Never apply border-radius — all corners stay at 0px.
- Never wrap content in filled cards, panels, or containers — rows sit directly on the page surface.
- Never introduce an icon set beyond the → arrow; no SVGs, no pictograms, no button shapes.
- Never change link color on hover — links stay #000000 with the same underline weight to preserve the printed-page feel.

## Elevation

Elevation is intentionally absent. Surfaces are flat to the page. Hierarchy comes from type size, weight (which never changes from 400), and 1px solid #000000 hairlines — never from shadow or z-axis. The design treats the browser viewport as a sheet of paper, not a stack of cards.

## Surfaces

- **Drafting White** (`#ffffff`) — Sole surface — page background, table background, everything. No card, panel, or elevated layer exists.

## Imagery

Photography only, and exclusively architectural site documentation — stone tunnels, concrete interiors, built environments in raw daylight or shadow. Full-bleed within their column, zero border-radius, zero padding, no caption frame. The subject is the building itself, never people, never lifestyle, never staged. High contrast, documentary sharpness, no color treatment, no duotone, no filter. There are no illustrations, no decorative graphics, no abstract shapes, and no product renders. The arrow glyph is the only non-photographic visual element in the system.

## Layout

Single-page composition with no scrollable sub-pages in the visible chrome. The viewport is split roughly 45/55 on first load: a 30px intro paragraph and three inline arrow-links occupy the left column; a full-height hero photograph occupies the right. Below the fold, a full-width four-column table (PROJECT / TYPE / LOCATION / YEAR) extends edge to edge, with 12px row padding and 1px black dividers. The table is the entire body of the page — there is no card grid, no feature sections, no pricing rows, no testimonials. Navigation is three inline links, not a top bar or sidebar. The whole layout reads as one continuous document, not a stack of distinct page sections.

## Similar Brands

- **Sou Fujimoto (sou-fujimoto.net)** — Same single-weight grotesque typography on white, photography placed without frames or filters, project list rendered as a flat table rather than a card grid.
- **John Pawson (johnpawson.com)** — Identical architectural-document restraint — no shadows, no rounded corners, no decorative graphics, content delivered as type and unframed photography.
- **Pinboard (pinboard.in)** — Same two-tone text-on-white vocabulary with thin row dividers and inline arrow-prefixed links; treats the browser viewport as a printed index rather than a software surface.
- **OMA / AMO (oma.eu)** — Project listings rendered as flat tables with the same hairline-divider rhythm, relying on a single grotesque family at one weight to carry the entire hierarchy.
- **Bureau Borsche (bueroborsche.com)** — Catalogue-style project index set tight in a single Helvetica-family weight, black on white, with the same discipline of avoiding fills, shadows, and decorative iconography.
