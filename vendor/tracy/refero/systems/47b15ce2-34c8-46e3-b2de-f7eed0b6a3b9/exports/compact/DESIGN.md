# PencilBooth — Style Reference
> Monochrome broadsheet manifesto. PencilBooth looks like a typographic broadsheet laid flat on a gallery wall — enormous display type anchoring two-column reading rows, hairline rules separating sections, and a single deep-navy accent breaking the gray silence only when a state is active.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

PencilBooth is a monochrome editorial broadsheet: pure white and soft gray surfaces carry the load, with a single deep navy accent reserved exclusively for the active/selected state. The visual system is dominated by typographic architecture — 96px display headlines at weight 700 act as section anchors, while body copy stays compact and dense in a two-column reading grid. The interface reads like a curated print manifesto, not a SaaS dashboard: components are flat, borders are hairlines, and chromatic color appears only as functional punctuation (a highlighted tab, a colored emoji-style icon avatar). Every surface decision prioritizes legibility and quiet hierarchy over visual flourish.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Primary text, display headlines, icon strokes — the only true black in the system, used at full strength for headlines and body to maximize contrast against the light canvas |
| Paper White | `#ffffff` | Card surfaces, elevated panels, and inset backgrounds — the bright surface that floats above the canvas gray |
| Canvas Gray | `#f2f2f2` | Page background and recessed surface — the dominant canvas that makes white cards feel lifted without using shadows |
| Hairline Gray | `#e5e7eb` | Borders, dividers, card outlines, and structural rules — by far the most-used color (4960 occurrences), it defines every interface edge with 1px restraint |
| Body Gray | `#5a5e62` | Secondary body text — softened black for long-form copy in the right column, reduces visual weight without sacrificing legibility |
| Muted Gray | `#b2b2b2` | Tertiary text and metadata — captions, labels, and supporting copy that should recede behind primary content |
| Deep Navy | `#0f1ea1` | Active/selected tab background and the system's sole chromatic accent — appears once per section to signal the current state against the monochrome field |
| Sky Blue | `#8fbaff` | Subtle surface wash and decorative highlight — soft chromatic field used sparingly behind small elements, never as a CTA |
| Pale Lavender | `#cfd2ec` | Soft surface tint — the gentlest chromatic wash for background sections that need to break the achromatic field without competing with content |

## Typography

### Soehne — Sole typeface — used for display, headings, body, links, icons, and everything between. Weight 700 carries all display and heading roles; weight 400 handles body, captions, and links. Soehne's humanist grotesque proportions and tight terminals give the editorial broadsheet its distinctive voice — a system font would feel too neutral, too SaaS-generic.
- **Substitute:** Inter or Untitled Sans — both are humanist grotesques with similar x-height and terminal treatment; General Sans is also a close match for the open apertures
- **Weights:** 400, 700
- **Sizes:** 12px, 14px, 16px, 18px, 32px, 96px
- **Line height:** 1.00–1.20
- **Letter spacing:** 0.0100em applied uniformly (0.96px at 96px, 0.18px at 18px, 0.12px at 12px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.12px |
| body-sm | — | — | 14px | 1.2 | 0.14px |
| body | — | — | 16px | 1.2 | 0.16px |
| subheading | — | — | 18px | 1.2 | 0.18px |
| heading-sm | — | — | 32px | 1 | 0.32px |
| display | — | — | 96px | 1 | 0.96px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 48-80px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **tags:** 2px
- **cards:** 10px
- **icons:** 9999px
- **buttons:** 2px

## Components

### Display Headline Block
**Role:** Section anchor — the 96px bold headline that opens every editorial section

Soehne weight 700 at 96px, line-height 1.0, letter-spacing 0.96px, color #000000. Paired directly beneath with a weight 400 subtitle at 32px in a medium gray (#5a5e62 or #b2b2b2). The extreme size ratio (96px headline → 32px subtitle) creates the broadsheet's signature vertical rhythm.

### Two-Column Editorial Row
**Role:** Primary content layout — pairs a left display column with a right body text column

Left column: 96px display heading + 32px subtitle, left-aligned. Right column: 16px body copy at weight 400 in #5a5e62, narrow measure (~400-500px). Columns separated by generous whitespace, not vertical rules. This is the page's structural DNA — every major section follows this template.

### Feature Tab Item
**Role:** Selectable list item in the left column feature stack

Full-width row with 10px horizontal padding, 10-12px vertical padding, 10px border-radius. Left side: circular icon avatar (40px, 9999px radius, white background with emoji-style icon). Right side: 16px weight 400 label in #000000. Hairline bottom border (#e5e7eb) between items. Background: #ffffff.

### Active Feature Tab
**Role:** Selected state for a feature tab item — the system's sole chromatic surface

Same dimensions as Feature Tab Item, but background switches to #0f1ea1 (Deep Navy), text to #ffffff, and icon avatar to a gold/yellow emoji. This inversion is the only place Deep Navy appears in the interface — it functions as wayfinding, not decoration.

### Content Card
**Role:** Generic elevated surface for grouped content blocks

White (#ffffff) background, 10px border-radius, 1px hairline border in #e5e7eb, internal padding 24px. No shadow — elevation is achieved through surface contrast against the #f2f2f2 canvas. Cards never use chromatic fills or gradients.

### Icon Avatar
**Role:** Circular badge containing an emoji-style icon — the system's only multi-color element

40px circle with 9999px border-radius, white (#ffffff) background, containing a full-color emoji glyph (👁, 💜, 📔, 🎨, 🌐, 📩, 🌊, 🆓, 📊, 💸, ✅, 💰). The emoji's native color is the source of all chromatic variety on the page — it is never replaced by monochrome line icons.

### Image Grid Tile
**Role:** Portfolio thumbnail in the 'Meet the Crowd' section

Square or near-square tile, no border, no radius constraint (edges are sharp by default). Each tile contains a full-bleed image at its native aspect ratio. Caption sits below: 14px weight 400 in #000000, with a small ↗ arrow link in #000000.

### Inline Link
**Role:** Text link with minimal visual treatment

Color: #000000 (black) with 1px underline in #e5e7eb (hairline gray), or no underline at all. Weight 400, inherits surrounding body size. 2px border-radius only appears on small tag-like links or pill badges. Links never use blue — color is never the signal for clickability.

### Metadata Caption
**Role:** Small text for labels, tags, and supporting information

12-14px, weight 400, color #b2b2b2 (Muted Gray). Used above section heads, below image tiles, and as inline metadata. Never bold, never colored — it should recede behind primary content.

## Do's and Don'ts

### Do
- Use 96px Soehne weight 700 for all section-opening display headlines; pair with a 32px weight 400 subtitle in #5a5e62
- Apply #0f1ea1 (Deep Navy) exclusively to active/selected states — never to decorative elements, never to primary actions outside the tab context
- Use 1px #e5e7eb hairline borders for all component edges; never use box-shadows for elevation
- Maintain the two-column editorial row template: display heading left, body copy right, separated by whitespace not vertical rules
- Use #f2f2f2 for the page canvas and #ffffff for cards — the contrast between these two near-whites IS the elevation system
- Let emoji glyphs carry the system's color variety in icon avatars; do not replace them with monochrome line icons or SVG illustrations
- Keep letter-spacing at 0.0100em across all sizes — this uniform tracking is part of the Soehne voice

### Don't
- Do not use color (blue, green, red) to signal links or clickable elements — links are #000000 with optional hairline underline
- Do not apply box-shadows to cards, modals, or popovers — the system is intentionally flat
- Do not use gradient fills on any surface, button, or background
- Do not introduce additional accent colors beyond Deep Navy (#0f1ea1), Sky Blue (#8fbaff), and Pale Lavender (#cfd2ec)
- Do not use display sizes smaller than 96px for section headlines — the extreme scale jump is the system's signature
- Do not use icons with custom SVG line illustrations; emoji-style colorful avatars are the icon system
- Do not use border-radius larger than 10px for any rectangular element — only icon avatars (9999px) and tags (2px) deviate from the 10px standard

## Elevation

- **Content Card:** `none — elevation is achieved through surface contrast (#ffffff on #f2f2f2 canvas) and 1px hairline borders in #e5e7eb`
- **Feature Tab Item:** `none — flat surface with hairline bottom border`
- **Active Feature Tab:** `none — the #0f1ea1 fill itself signals elevation through chromatic contrast`

## Surfaces

- **Canvas** (`#f2f2f2`) — Page background — the base field that the entire editorial layout sits on
- **Card** (`#ffffff`) — Feature list panels, content cards, and elevated surfaces — defined by hairline borders rather than shadow
- **Tinted** (`#cfd2ec`) — Chromatic wash for sections requiring gentle color separation from the achromatic field
- **Active** (`#0f1ea1`) — Selected tab or active state surface — the only fully saturated surface in the system

## Imagery

Imagery is sparse and editorial. The only consistent visual pattern is the image grid of portfolio thumbnails (square crops of artists' work, full-bleed, no rounded corners, no borders, no overlays). Individual images carry their own color and style — they are the product, not decorative atmosphere. Outside the portfolio grid, the page is pure typography. There are no hero images, no background photographs, no decorative illustrations. Emoji glyphs (👁, 💜, 🎨, etc.) serve as the only colorful visual elements in the interface itself, acting as functional iconography rather than illustration.

## Layout

The page follows a max-width contained model (1200px centered) with a strict two-column editorial grid. Every major section opens with a massive left-aligned display headline (96px) in the left column, paired with dense body copy in the right column — this two-column reading row is the structural DNA and repeats throughout. Between major sections, a feature-stack component appears in the left column: a vertical list of icon+text items with the active item highlighted in deep navy, while the right column shows a corresponding description with its own display heading. The final section breaks to a 4-column image grid for portfolio thumbnails. Vertical rhythm is generous (48-80px between sections) but content density within each column is compact. No sidebar, no sticky header, no mega-menu — navigation is minimal. The overall feel is a scrollable broadsheet, not a dashboard.

## Similar Brands

- **Are.na** — Same editorial-broadsheet layout philosophy — text-first two-column grids, massive display type, and color that appears only as functional punctuation rather than decoration
- **Cargo Collective** — Creator-portfolio platform with a similar monochrome canvas and typographic hierarchy, where the artist's work itself provides all the color
- **The Creative Independent** — Editorial long-form layout with oversized display headlines, tight body measure, and a restrained palette that lets the typography carry the visual weight
- **Readymag** — Same typographic architecture approach — display type at extreme sizes, flat surfaces, hairline borders, and a single chromatic accent for state indication
- **Field Notes (print)** — Shares the compact dense information design and monochrome editorial voice that makes PencilBooth feel more like a printed broadsheet than a web product
