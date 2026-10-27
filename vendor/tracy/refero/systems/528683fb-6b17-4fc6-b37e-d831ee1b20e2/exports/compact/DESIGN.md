# Myrch Club — Style Reference
> white-walled exhibition vitrine — editorial serif labels floating in generous negative space, disrupted by a single red script signature

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Myrch Club operates as a typographic archive: a near-monochrome gallery where serif body type, narrow sans labels, and a single defiant red script wordmark define the entire visual identity. The interface is deliberately white-spaced and editorial — product photography sits in soft gray cards (#f9f9f9) on a pure white canvas, separated by hairline borders rather than heavy elevation. The red appears only in the oversized cursive logo bleeding through the header, functioning as a watermark of intent rather than a functional UI color. Everything else — navigation chips, filter tags, captions — is rendered in near-black (#111111) with thin borders, creating a catalog-of-objects feeling closer to a museum index than an e-commerce grid.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas White | `#ffffff` | Page background, image surfaces, inverted text on dark chips |
| Gallery Gray | `#f9f9f9` | Card and product tile backgrounds — sets objects apart from the page with a whisper of warmth |
| Hairline Gray | `#cfcfcf` | Dividers, secondary borders, placeholder structure |
| Caption Gray | `#888888` | Secondary text, metadata, timestamps, muted helper labels |
| Ink Black | `#111111` | Primary text, filled filter chips, button borders, headings — the dominant interface color |
| True Black | `#000000` | Hard borders and text where maximum contrast is needed |
| Signature Red | `#ff0000` | The wordmark only — a pure, unmoderated red used at oversized scale behind the header as a brand watermark; never used for buttons, links, or functional UI |

## Typography

### Times New Roman — Primary body and interface type — used for descriptions, product metadata, and general reading text. The serif choice signals editorial/archive intent; a humanist serif substitute like EB Garamond or Lora preserves the curatorial atmosphere
- **Substitute:** EB Garamond, Lora, Source Serif Pro
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.20
- **Letter spacing:** normal

### Arial Narrow — Secondary structural type — condensed sans for compact labels, filter chips, navigation, and the 42px brand name in the header. The narrow proportions contrast the serif body and create catalog/inventory utility. Substitute with a condensed grotesk like Barlow Condensed or Roboto Condensed
- **Substitute:** Barlow Condensed, Roboto Condensed, Helvetica Neue Condensed
- **Weights:** 400
- **Sizes:** 14px, 20px, 42px
- **Line height:** 1.24, 1.33, 1.40, 1.43
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.2 | — |
| subheading | — | — | 20px | 1.33 | — |
| heading | — | — | 42px | 1.24 | — |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1280px
- **Section gap:** 40px
- **Card padding:** 30px
- **Element gap:** 20px

### Border Radius

- **cards:** 10px
- **chips:** 10px
- **buttons:** 10px

## Components

### Header Brand Lockup
**Role:** Site identity in the top-left

'Myrch(dot)Club® — All ⓘ' rendered in Arial Narrow 20px, #111111. The registered trademark and circled-i are literal typographic characters, not icons. The wordmark dot is spelled out, reinforcing the archival/dot-matrix catalog feel.

### Red Script Watermark
**Role:** Brand signature bleeding behind the header

Oversized red (#ff0000) cursive 'myrch' set behind the header zone at 200px+ size, intentionally clipped by the page edges. Not a component to recreate literally — it is one custom artwork. On other pages, treat the red as reserved for this single hero watermark; do not reuse for buttons or accents.

### Description Block
**Role:** Introductory paragraph beneath the brand

Times 16px, weight 400, #111111, line-height 1.20. Two lines of text describing the archive's purpose. Sets the editorial reading voice for the site.

### Filter Chip — Active
**Role:** Currently selected category filter

Filled #111111 background, #ffffff text, 10px radius, padding 6px 12px. Text in Arial Narrow 14px weight 400. No border needed — the fill is the signal.

### Filter Chip — Inactive
**Role:** Unselected category filter

Transparent background, 1px solid #111111 border, #111111 text, 10px radius, padding 6px 12px. Arial Narrow 14px. On hover, can invert to the active style.

### Curatorial Caption
**Role:** Tiny attribution line under the chips

Times 14px, #888888. E.g. 'Myrch.Club is built and curated by ⬛ Manual Engineering.' Acts as a footer-of-the-header, a museum wall plaque.

### Product Grid Card
**Role:** Individual merch item tile

#f9f9f9 background, 10px border-radius, 30px internal padding, 1px #cfcfcf or absent border. Contains a product image centered on a slightly lighter inner area, then below: brand name in Times italic (#111111) left-aligned, and item name + source venue in Arial Narrow 14px (#888888) right-aligned. No drop shadow on the card itself.

### Product Image Frame
**Role:** Photograph container within a card

White (#ffffff) or very light background, generous internal padding around the photographed object, no border. The shadow rgba(17,17,17,0.3) 0px 0px 20px 0px may apply here as a subtle vignette around the object to lift it from the card surface.

### Card Label Row
**Role:** Metadata strip beneath each product image

Two-column inline layout: brand name left in Times italic 14px #111111; product + venue right in Arial Narrow 14px #888888. ~20px gap from the image to the label row, ~30px from label row to the card edge.

### Instagram Icon Button
**Role:** Social link in the top-right corner

Small, minimal — likely a stroke-only icon at ~20px, no background, no border, #111111. Sits in the absolute top-right of the header strip.

## Do's and Don'ts

### Do
- Set all product tiles on a #f9f9f9 gallery card with 10px radius and 30px internal padding.
- Use Times 16px weight 400 for all body and description copy; use Arial Narrow 14px for labels, chips, and metadata.
- Reserve #ff0000 exclusively for the oversized script wordmark behind the header; treat it as a signature artwork, not a functional color.
- Use #111111 as the dominant interface color for text, filled chips, and borders — keep the palette strictly black-on-white for everything else.
- Use 10px border-radius for all chips, buttons, and cards as a single consistent rhythm.
- Separate content with hairline #cfcfcf borders and color shifts rather than drop shadows.
- Allow generous whitespace — section gaps of 40px and card padding of 30px — to preserve the gallery/archive feel.

### Don't
- Do not use #ff0000 for buttons, links, tags, error states, or any functional UI element.
- Do not introduce additional accent colors — the system is strictly monochrome with one red artwork exception.
- Do not use heavy or stacked shadows; the single 20px 30%-opacity blur is the maximum elevation allowed.
- Do not use bold or display-weight typography; both Times and Arial Narrow appear at weight 400 only.
- Do not fill buttons with chromatic colors — buttons should be #111111 fill on #ffffff or outlined #111111.
- Do not use rounded or pill shapes (9999px radius) — the 10px radius is deliberate and consistent.
- Do not add gradients, glows, or colored backgrounds to the product cards.

## Elevation

- **Product tile:** `rgba(17, 17, 17, 0.3) 0px 0px 20px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Page background
- **Gallery Card** (`#f9f9f9`) — Product tile and component surface
- **Ink Surface** (`#111111`) — Active filter chip, filled control

## Imagery

Product photography is the primary visual content: individual merch objects (apparel, accessories, containers) photographed in isolation on near-white backgrounds, with no lifestyle or contextual staging. Each object is treated as an archival specimen — centered, lit evenly, and given generous internal padding within its card. The only non-product imagery is the red cursive 'myrch' script, which functions as a decorative brand watermark rather than a photograph. There is no illustration, no 3D rendering, and no abstract graphics. Imagery occupies roughly 50-60% of the viewport in the main content area, with the remainder as white space and label text.

## Layout

The page is a max-width centered layout (estimated 1280px) with a full-bleed header zone where the red script wordmark bleeds beyond the container edges. The header is a single left-aligned block: brand name, description paragraph, and a horizontal row of filter chips. Below the header, the content is a 3-column product grid of square-ish cards on a white canvas, each card holding a single product photo and a two-line label row. Vertical rhythm is spacious — ~40px between sections and 30px inside each card. The layout is symmetric and grid-based with no asymmetric or overlapping sections. Navigation is minimal: just the filter chip row, a tiny social icon in the top-right, and the scroll itself.

## Similar Brands

- **Are.na** — Same near-monochrome archive aesthetic with hairline borders, generous whitespace, and serif/sans typographic pairing for cataloging content
- **Mubi** — Editorial typographic restraint with black-and-white interface and a single bold accent used as a signature mark rather than functional UI
- **It's Nice That** — Gallery-style grid of objects with serif italic labels and condensed sans metadata, prioritising content over chrome
- **Cabinet magazine** — Archive/catalog sensibility using Times serif body and narrow sans labels on white space, treating items as curated specimens
