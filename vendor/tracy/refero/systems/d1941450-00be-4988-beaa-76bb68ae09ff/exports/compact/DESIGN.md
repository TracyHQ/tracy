# ARTU — Style Reference
> Gallery wall on white paper. ARTU treats the browser as a museum spread — massive product photography, hairline rules, and a single shock of lime at the bottom edge to close the room.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ARTU operates as a furniture gallery in browser form: one custom neo-grotesque at a single weight, pure white canvas, product photography that fills the viewport, and almost no visible UI chrome. The discipline is extreme — there is one weight, one type family, two surface colors, and negative space does the work that shadows and gradients do elsewhere. Color is used surgically: a high-chroma lime green (#d7ff66) punctuates only the footer band as a terminal signal, while a raw red (#ff1313) appears as thin border lines and icon strokes — deliberately failing contrast, it functions as graphic rhythm, not information. The result reads less like a commerce site and more like an art-book spread: the products are the layout, the layout is whitespace, and the UI is a thin black line of all-caps navigation at the top edge.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas White | `#ffffff` | Page background, card surface, image plate — the entire site sits on pure white |
| Ink Black | `#000000` | All text, hairline borders, navigation, link underlines, image frames — the sole structural color |
| Terminal Lime | `#d7ff66` | Footer band, surface highlight wash, terminal accent — high-chroma green that signals a page boundary the way a colored edge stops a gallery wall |
| Signal Red | `#ff1313` | Decorative border strokes, icon outlines, hairline rules in editorial layouts — used at sub-readable contrast as graphic punctuation, never as body text |

## Typography

### HelveticaNeuePro — Universal type family for navigation, body, headings, inputs, and footer — the only weight on the site (400), set in all-caps across the nav and footer, with positive tracking 0.0140em–0.0240em that gives the single weight a mechanical, catalog-like cadence
- **Substitute:** Neue Haas Grotesk, Inter, Helvetica Now
- **Weights:** 400
- **Sizes:** 18px, 20px, 24px, 32px
- **Line height:** 1.00–1.20
- **Letter spacing:** 0.0140em at body, stepping up to 0.0240em at display — positive tracking everywhere is anti-default for neo-grotesques and is a signature of the brand

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 18px | 1.2 | 0.014px |
| body | — | — | 20px | 1.2 | 0.014px |
| subheading | — | — | 24px | 1.15 | 0.022px |
| heading | — | — | 32px | 1 | 0.024px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1440px
- **Section gap:** 32px
- **Card padding:** 0px
- **Element gap:** 11px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Persistent global navigation

Single-row header: logo ('artu' lowercase, weight 400, 18–20px, black) at the left edge, then PRODUCTS, STORES, ABOUT, NEWS, CONTACTS in all-caps at 400 weight with 0.022em tracking, separated by commas not pipes. Right edge: EN, CART (0), MENU, same weight and case. No background fill, no border, 17px padding-top, 32px column-gap between items, sits directly on white.

### Full-bleed Hero Image
**Role:** Opening viewport statement

Edge-to-edge product photography with no caption, no overlay, no button. 0px radius, no border, spans full viewport width. The image IS the hero — the only frame is a 1px black hairline (border-bottom on the section) separating it from the next block.

### Editorial Image Grid
**Role:** Scrolling product gallery

Asymmetric multi-column layout mixing 1:1, 3:4, and 2:3 ratio product shots at varying sizes (roughly 3–4 columns, images sized 40–55% of viewport). White gutters between images, no captions or titles, 0px radius, no borders. Composition feels curated, not gridded.

### Hairline Divider
**Role:** Section separator

1px solid black (#000000) horizontal rule, full-width or content-width, used between major page sections. Carries the visual structure that padding and gaps do elsewhere.

### Decorative Red Border
**Role:** Editorial graphic accent

Thin red (#ff1313) stroked lines used sparingly inside content blocks and around icons — a graphic mark, not a container. Contrast is intentionally below WCAG; it exists to be seen as a line, not read as text.

### Carousel Arrows
**Role:** Image slider controls

Two simple black arrows (← →) at 18–20px, positioned bottom-right of the hero image block, on the white margin between the image and the hairline divider. No circle, no fill — just the glyph in #000000 at 1px stroke weight.

### Lime Footer Band
**Role:** Page terminal / site footer

Full-width band filled #d7ff66, no text inside, acts as a colored wall that closes the page. Sits below all content, height set by footer padding (~24–32px). The vivid green is the only color that occupies real estate in the layout.

### Footer Link Row
**Role:** Secondary navigation

If present, sits just above the lime band: all-caps, 400 weight, 18px, comma-separated links in #000000 with 29–37px margin-bottom between rows. Inherits the nav's all-caps typographic system.

### Image Thumbnail Link
**Role:** Product teaser

Unframed product image, 0px radius, optional 1px black border, no caption beneath. Behaves as a visual link in a gallery — the image is the affordance, not a button.

## Do's and Don'ts

### Do
- Use only one type family (HelveticaNeuePro or Neue Haas Grotesk substitute) and one weight (400) across the entire site
- Set all navigation and footer text in uppercase with positive tracking 0.014–0.024em
- Reserve #d7ff66 for the footer band or a single terminal surface — never spread it across the page
- Use 1px solid #000000 hairlines for all section dividers and image borders
- Let product photography fill the viewport at 0px radius with no overlay text or CTA
- Keep 0px border-radius on every image, card, button, and tag — sharpness is the brand

### Don't
- Don't introduce a second type weight, a serif, or a display face — 400 Helvetica is the system
- Don't use #ff1313 for body text, headings, or CTAs — its 3.9:1 contrast on white is the point; it belongs only in thin decorative strokes
- Don't add drop shadows, gradients, or glass effects — the site is flat by design
- Don't use rounded corners on any element — not images, not buttons, not tags
- Don't fill the page with the lime green — it only appears as the closing footer band
- Don't add a sticky header, sidebar, or modal — the layout is one continuous gallery scroll
- Don't break the all-caps nav convention with mixed-case menu items or sentence-case headings

## Surfaces

- **Canvas** (`#ffffff`) — Full-page background, image plate
- **Footer Band** (`#d7ff66`) — Terminal colored band closing the page

## Imagery

Photography is the entire visual identity. Full-bleed, high-resolution product shots of chairs and furniture, shot in warm interior light with natural shadows falling on white or wood floors. The first hero image fills the entire viewport edge-to-edge. The gallery section uses an asymmetric editorial layout with images at mixed scales and aspect ratios (1:1, 3:4, 2:3) arranged with generous white gutters, no captions, no overlays. There are no illustrations, no icons beyond a few thin red-stroked marks, no abstract graphics, and no lifestyle photography — the object is always the subject, shot in context but never decorated.

## Layout

Single-column, single-page gallery scroll. The first viewport is a full-bleed hero photograph with a thin top navigation bar (logo left, menu items comma-separated, language/cart/menu right) and minimal carousel arrows at the bottom-right of the image. Below the hero sits a 1px black hairline divider, then a spacious editorial image grid that mixes scales asymmetrically — small thumbnail, medium square, and large portrait images at varying widths (roughly 25–55% of the page), all on white with no gutters wider than 32px. The page terminates with a full-width lime-green (#d7ff66) footer band roughly 24–32px tall. The overall feel is a printed catalog spread — typography stays in the margins, photography takes the center, and the lime band closes the room.

## Similar Brands

- **Vitra** — Same furniture-catalog discipline: white canvas, product photography as the entire layout, hairline rules, comma-separated nav, and almost no decorative UI
- **HAY (hay.dk)** — Shares the neo-grotesque single-weight typography and editorial image grids, though HAY uses color more liberally
- **Massimo (massimolubicz.com)** — Same brand-book-as-website restraint: single font, flat surfaces, photography-first pages, no shadows or gradients
- **Fellow (fellowproducts.com)** — Specialty product brand that treats the site as a gallery — large hero images, minimal nav, single accent color used sparingly
- **Aarke** — Premium product site with white canvas, product photography, thin black nav, and a single bold accent color reserved for terminal moments
