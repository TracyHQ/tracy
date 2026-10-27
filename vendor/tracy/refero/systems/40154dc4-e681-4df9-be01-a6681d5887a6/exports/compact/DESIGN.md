# V–A–C — Style Reference
> Gallery wall on a drafting table. The starkness of a printed exhibition catalog where every margin, weight, and registration mark is deliberate.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

V–A–C reads like a printed exhibition catalog translated to the web: pure white paper, pure black ink, and not a single chromatic pixel. The entire system is achromatic — typography does all the expressive work, and it does so at a single weight (400) across both body and display. The signature is the V—A—C registration line stretching full-bleed across the top of every screen, turning the page header into an architectural measurement mark. Layout is a strict three-column card grid where each card is a museum wall label: full-bleed image, tiny ↗ metadata link, and a tight two-line title — separated by 250px+ of vertical breathing room between rows. No shadows, no rounded corners, no gradients, no accent color. The visual language is the visual restraint.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Primary text, all borders, card outlines, link color, arrow glyphs, V—A—C registration marks |
| Paper | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Graphite | `#999999` | Diagonal category watermarks on cards, subtle decorative strokes — the only third tone in the system |

## Typography

### Diagramatika Text — Body copy, metadata links, card titles, list items, navigation, all UI text. The only weight used is 400 — no bold, no medium, no light. This even single-weight voice is the defining typographic choice: nothing shouts, everything reads at the same conversational volume.
- **Substitute:** Inter, Söhne, or system-ui at weight 400 only
- **Weights:** 400
- **Sizes:** 16px, 20px
- **Line height:** 1.00–1.15

### Diagramatika Display — Larger headings, hero text, featured card titles. Despite the name, used at the same 400 weight as body — the distinction is size and tight line-height (0.88–0.90) which lets lines of large type lock together into a dense block. The absence of weight contrast between display and text is anti-convention; most systems use 600-700 for headings.
- **Substitute:** GT Sectra, Söhne Breit, or Suisse Int'l at weight 400 with tight tracking
- **Weights:** 400
- **Sizes:** 24px, 34px, 35px
- **Line height:** 0.88–1.15

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.15 | — |
| subheading | — | — | 20px | 1.1 | — |
| heading-sm | — | — | 24px | 0.9 | — |
| heading-lg | — | — | 35px | 0.88 | — |

## Spacing & Layout

**Base unit:** 6px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 150px
- **Card padding:** 0px
- **Element gap:** 5px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Event Card
**Role:** Primary content unit — displays an event, screening, installation, or exhibition

Three-column grid item. Full-bleed image (square or landscape, 0px radius) occupies the top of the card slot. Below the image: a small metadata line prefixed with ↗ (e.g., '↗ Film screening, 11 Jun 2026') in 16px Diagramatika Text. Title in 24–35px Diagramatika Display, 400 weight, line-height 0.88–0.90, #000000, wrapping to 2–3 lines. No card border, no shadow, no background fill — the card exists only in the white space of the grid. A diagonal category watermark (Architecture, Observation) at ~45° rotation in #999999 may overlay the right edge of the card in 16px text.

### V—A—C Registration Bar
**Role:** Site-wide page header — functions as both navigation and brand mark

A 1px #000000 horizontal line spanning the full viewport width, positioned at the very top of the page. Three letter labels (V, A, C) sit on this line at left edge, center, and right edge respectively — functioning as registration marks like a printer's alignment guide. An upward arrow (↑) appears beneath the 'A'. The letter spacing between V—A—C is extremely wide, with long em-dash-like gaps. Typography: 20px Diagramatika Text, 400 weight, #000000.

### Arrow Metadata Link
**Role:** Event type + date label above each card title

Plain text link prefixed with ↗ (north-east arrow glyph). Format: '↗ Film screening, 11 Jun 2026' or '↗ Installation'. 16px Diagramatika Text, 400 weight, #000000. No underline by default. Dates always in numeric '11 Jun 2026' format. Functions as both a category tag and a link to event details.

### Diagonal Category Watermark
**Role:** Category indicator overlaid on select cards

Text rotated approximately 30–45° in light gray (#999999), positioned along the right edge of a card. 16px Diagramatika Text, 400 weight. Examples seen: 'Architecture', 'Observation'. Creates a subtle classification system without color or borders. Optional — appears only on cards in specific categories.

### Left Edge Language Switcher
**Role:** Locale toggle pinned to the left viewport edge

Stacked text 'Ru / En' in 16px Diagramatika Text, 400 weight, #000000, positioned at the bottom-left edge of the viewport, oriented horizontally. Minimal — no border, no background, just text flush to the edge.

### Right Edge Vertical Navigation
**Role:** Primary section navigation pinned to the right viewport edge

Vertically stacked section links reading top-to-bottom along the right edge: 'About · Projects · Publishing' (and likely more sections). 16px Diagramatika Text, 400 weight, #000000, rotated 90° so text reads bottom-to-top. Separated by middle dots (·). This edge-pinned navigation is signature — it frames the content like the margins of a printed page.

### Cookie Consent Banner
**Role:** GDPR/cookie notice

Small text banner ('We use cookies ×') positioned at bottom-right. 16px Diagramatika Text, 400 weight, #000000, with an × close glyph. No background, no border, no box — just dismissible text floating over the content.

## Do's and Don'ts

### Do
- Use only #000000, #ffffff, and #999999. Never introduce color — the achromatic system is the identity.
- Set every text element to weight 400. Do not use bold, medium, light, or any other weight. The flat single-weight voice is the design.
- Apply 0px border-radius to all elements — images, cards, buttons, tags. The geometry is sharp and architectural.
- Prefix every event-type metadata link with the ↗ arrow glyph. It is the universal marker for 'clickable event detail'.
- Maintain the V—A—C registration bar on every page with the three letters at left/center/right on a 1px black line.
- Use the 250–275px vertical gap between card rows. The generous inter-row breathing room is what makes the grid feel like gallery wall spacing, not a product card list.
- Set display headings to line-height 0.88–0.90. The tight leading makes large type lock into a dense block, not airy paragraphs.

### Don't
- Do not add brand colors, accent colors, or semantic state colors (no green for success, no red for error). The system is deliberately colorless.
- Do not use bold or semibold weights. Do not increase font-weight on hover or active states — use underline or color shift instead.
- Do not apply border-radius, box-shadow, or gradients. Surfaces are flat, edges are sharp, and there is no elevation system.
- Do not use centered text alignment for card titles or body copy. Text is left-aligned in a strict grid.
- Do not reduce the vertical gap between card rows below 150px. The spacious row separation is essential to the gallery feel.
- Do not use colored icons, filled icons, or multi-color illustrations. Icons should be single-stroke black outlines or typographic glyphs (↗, ×, ·).
- Do not add background colors, tinted overlays, or section bands. The page is one continuous white field — section distinction comes from whitespace and grid rhythm, not color.

## Elevation

The design uses zero elevation. No box-shadows, no border-radius, no background tints distinguish cards from the page surface. The 3-column grid structure alone provides spatial organization. This is a deliberate editorial-print translation to web: cards behave like printed page items in a catalog, not like interactive UI components.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas — the entire site sits on pure white
- **Image Field** (`#f5f5f5`) — Implicit neutral behind unloaded card images (placeholder gray before media renders)

## Imagery

Photography dominates — event documentation, film stills, exhibition installation shots, portrait photography. All images are full-bleed within their grid cell with no cropping masks, no rounded corners, and no overlay treatments. The imagery is documentary and editorial: film festival stills show raw cinematic moments (actors mid-performance, audience reactions, architectural spaces), not stylized product shots. Color in images is permitted because the chrome around them is strictly achromatic — the photographs are the only source of visual color on the page. Image aspect ratios vary between landscape and square within the same row, creating an intentional editorial irregularity. No illustrations, no abstract graphics, no decorative imagery.

## Layout

Full-bleed layout with a strict three-column card grid. The V—A—C registration bar spans the entire viewport width at the top. Content sits in a max-width ~1440px centered container with generous side margins. Each row contains exactly three cards; the vertical gap between rows is 250–275px — far more than typical card grids, creating a gallery-walk rhythm. Within each card: image fills the top of the column width, then a tight stack of metadata link + title text below. Left and right viewport edges host pinned navigation (language switcher bottom-left, section nav right edge) that frames the content. No sidebar, no full-width hero section, no alternating band layouts — the entire page is one continuous white field with the same 3-column rhythm repeating. Content is left-aligned, never centered.

## Similar Brands

- **ICA (Institute of Contemporary Arts)** — Same strict editorial grid, achromatic palette, and museum-label-style card layout with image + small metadata + title stacked vertically
- **SculptureCenter** — Same zero-colorfulness approach, 3-column event grid, sharp 0px radius geometry, and typographic-only hierarchy at a single weight
- **Printed exhibition catalogs (e.g., MoMA PS1, Tate publications)** — The V—A—C design is a direct digital translation of a printed art-institution catalog — same registration marks, same row gap, same flat ink-on-paper feel
- **KW Institute for Contemporary Art** — Same minimal achromatic aesthetic, single-weight typography, and generous whitespace that frames content like a gallery wall rather than a website
- **e-flux Announcements** — Same archival, catalog-like density of event listings in a simple grid, with dates in numeric format and no decorative color or chrome
