# Bareis + Nicolaus — Style Reference
> White chalk on black slate. A typographic control panel and a full-bleed visual index share one strict monochrome stage, with pill-shaped outlines as the only punctuation.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bareis + Nicolaus operates as a monochrome editorial grid: pitch-black canvas, bone-white outlines, and a single typeface carrying the entire voice. The interface is a split workspace — a typographic control column on the left filters and indexes, a full-bleed visual index on the right showcases the work. Every interactive element is a pill: 120px radius, 1px white stroke, no fill, no shadow, no hover fill — the geometry does the work. Typography is the protagonist: 72px display at weight 400 with a 1.0 line-height gives headlines architectural presence without weight, while 24px body text reads as quiet annotation. The system refuses decoration — no gradients, no brand color, no elevation, no rounded cards — and that absence is the identity. Every element earns its pixel by being typographic, structural, or navigational.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page background, card surface, filled button fill — the flat black ground that all white typography and outlines sit on |
| Bone | `#ffffff` | Primary text, pill button borders, link text, section dividers, card hover overlays — every outlined and typographic element |
| Ash | `#a9a9a9` | Muted borders and secondary structural strokes where pure white would compete with primary controls |

## Typography

### Lausanne — The single voice — used for display headings (72px/1.00), section labels, body text, pill labels, and navigation. Weight 400 at 72px is a deliberate anti-convention: headlines whisper into the dark rather than shout, gaining authority through geometric restraint instead of boldness. The tight 1.0 line-height at display size creates blocky architectural headlines.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400
- **Sizes:** 24px, 72px
- **Line height:** 1.00–1.20
- **Letter spacing:** normal

### Victor Serif — Rare editorial accent — appears as italic or contrast voice at body size. A serif breaking the sans-only system signals 'this text is different' (timestamps, quotes, personal notes). Used sparingly enough that each appearance is noticed.
- **Substitute:** GT Sectra, Lyon Text, or Source Serif Pro
- **Weights:** 400
- **Sizes:** 24px
- **Line height:** 1.20

### Black Tie — Decorative display face for one-off moments — a monospaced or display serif/script that breaks rhythm. The system is nearly all Lausanne, so a single Black Tie appearance acts as typographic spice.
- **Substitute:** Editorial New, Migra, or Tobias
- **Weights:** 400
- **Sizes:** 24px
- **Line height:** 1.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 24px | 1.2 | 0px |
| display | — | — | 72px | 1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 48-80px
- **Card padding:** 0px
- **Element gap:** 10-13px

### Border Radius

- **nav:** 120px
- **tags:** 120px
- **cards:** 0px
- **images:** 0px
- **buttons:** 120px

## Components

### Pill Tag (Outlined)
**Role:** Category filter and navigation control — the signature element of the system

Fully rounded pill at 120px border-radius, 1px Bone (#ffffff) stroke, transparent fill on Obsidian (#000000) background. Internal padding 10px vertical × 13px horizontal, with 7px margin-right for inline tag flow. Label in Lausanne 400/24px Bone. No fill on any state — the outline IS the element.

### Pill Tag (Filled Black)
**Role:** Active/selected state for category tags

Same 120px pill geometry, but filled with Obsidian (#000000) and bordered with 1px Bone (#ffffff). Used only for the 'Selected' filter — the active state is signaled by inversion, not by color.

### Pill Tag (Muted)
**Role:** Secondary or inactive labels (e.g., footer 'Imprint')

120px pill, 1px Ash (#a9a9a9) stroke, transparent fill, Lausanne 400/24px in Ash. Sits quieter than Bone-outlined tags to indicate metadata rather than control.

### Display Heading
**Role:** Brand name, section headers ('Work', 'Info', 'Contact')

Lausanne 400/72px at line-height 1.0, Bone (#ffffff) on Obsidian. No margin tricks — the tight line-height and weight 400 create the architectural block. Used left-aligned against the split-screen gutter.

### Project Thumbnail with Overlay Label
**Role:** Right-column portfolio index items

Full-bleed image (no border-radius — images sit sharp against the page), with a pill-shaped overlay label in the top-left corner. Label uses the outlined Pill Tag style with 1px Bone stroke over the image. No captions, no shadows, no padding around the image itself.

### Top Nav Pill
**Role:** Persistent header navigation (Archive, Research)

Two Pill Tags anchored to the top-right of the left column, same 120px geometry. Functions as a sticky secondary nav, separated from the Work filter grid below by a 1px Bone divider line.

### Section Divider
**Role:** Horizontal rule separating nav from content sections

1px Bone (#ffffff) full-width line, no padding above/below. Used to separate brand area, Work filter grid, Info header, Contact header. The only structural separator in the system.

### Footer Info Bar
**Role:** Bottom strip with location, weather, email, discipline

Full-width band at the very bottom. Inline text in Lausanne 400/24px Bone, separated by pipe characters (|). 1px Bone top border. Content reads as a single quiet line: city · temperature · city · temperature · brand · discipline · email.

### Collapse Toggle
**Role:** Minus-sign control next to the 'Work' header

A small circular control (120px radius) containing a minus glyph, used to collapse/expand the Work filter grid. Same outlined-pill construction as tags, scaled down to icon size.

## Do's and Don'ts

### Do
- Use 120px border-radius on every button, tag, and nav element — the pill is the system's only shape
- Use exactly 1px Bone (#ffffff) strokes for all outlined controls; never go thicker
- Set display text to 72px Lausanne weight 400 at line-height 1.0 — the light weight at large size is the signature
- Keep all spacing between tags at 7-13px; the tight cluster density is deliberate
- Use Bone (#ffffff) and Obsidian (#000000) only — Ash (#a9a9a9) is reserved for metadata, never for primary controls
- Use the split-screen layout: typographic control column left, visual index right, full-bleed both sides
- Separate sections with a 1px Bone line and generous vertical air — no cards, no panels, no backgrounds

### Don't
- Never add a fill color, gradient, or brand accent — the system is strictly monochrome
- Never apply a border-radius other than 120px (or 0px for images/dividers) — mixed radii break the geometric language
- Never use bold or semibold weights on Lausanne — weight 400 at all sizes is the rule
- Never add drop shadows, glows, or any elevation effect to any element
- Never add internal padding to project images — they must sit flush against the page edge
- Never use Ash (#a9a9a9) for active states or primary text — it is metadata-only
- Never introduce a second font for body or navigation — Victor Serif and Black Tie are accents, not workhorses

## Elevation

No shadows. No drop shadows, no glows, no inner shadows. Depth is communicated exclusively through 1px Bone strokes on an Obsidian field — the system treats light and dark as the only spatial language. Adding a shadow would break the flat editorial stage.

## Surfaces

- **Obsidian Field** (`#000000`) — Full-bleed page background — the single flat stage
- **Bone Plate** (`#ffffff`) — Inverse surface for image fills and right-column content; also the text/border color on the dark side

## Imagery

Photography is the right column's sole content. Project thumbnails are full-bleed, no border-radius, no padding, no overlay effects beyond the pill-shaped label in the top-left. The images span from product photography (the phone in a painted blur) to editorial portraiture (the basketball player with tattooed arm), spanning cultural, commercial, and identity work. There is no consistent photographic treatment — the work itself is the diversity. The label overlay is the only consistent graphic element tying images to the typographic system. No illustrations, no abstract graphics, no icons beyond the minus-glyph toggle.

## Layout

A rigid split-screen full-bleed layout. Left column (~40% width) contains the entire typographic interface: brand wordmark at top, two-pill top nav, section heading 'Work', a dense filter tag grid (8+ rows of outlined pills), then 'Info' and 'Contact' section headers further down. Right column (~60% width) is a full-bleed vertical stack of project thumbnails, each filling its row edge-to-edge. No max-width container — both columns run to the viewport edges. A single 1px Bone horizontal line separates the top brand area from the Work grid; another separates the last filter row from the Info/Contact area. The bottom 40-60px is a horizontal footer info bar with inline pipe-separated metadata. There are no cards, no gutters between sections, no centered content — the layout is a strict two-column editor.

## Similar Brands

- **Pentagram** — Same monochrome editorial portfolio structure with split-screen navigation and full-bleed project thumbnails, typographic-first identity
- **Studio Dumbar** — Restrained geometric typography, strict 2-column layouts, and a refusal of decorative color or shadow
- **Manual Studio** — Dense pill-based navigation systems, split-screen index/control layouts, and editorial discipline
- **Violaine & Jérémy** — Dark-mode studio portfolio with white outline controls and large light-weight display type
- **Kasper-Florio** — Typographic monolith landing pages with filter-pill navigation and full-bleed image grids
