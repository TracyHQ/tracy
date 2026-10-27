# ARKET — Style Reference
> Scandinavian white gallery. Full-bleed photography on bone-white canvases, hairline rules, and a small-caps monospace labeling each section like a museum wall tag.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ARKET is a Scandinavian fashion retailer whose digital presence reads as a curated white-gallery space: bone-white canvases, carbon-black type, hairline borders, and no color anywhere except inside the photography itself. Typography pairs a quiet humanist sans with a small-caps monospace that labels editorial cards like museum wall text, reinforcing the art-direction-over-advertising voice. Interactive elements are sharp (2px corners), flat, and rely on inversion rather than color for emphasis — a solid black button sits beside an outlined one at the same height. The system prizes restraint: generous whitespace, no gradients, minimal elevation, and a single nearly invisible blue accent reserved for links. Every screen should feel like a printed lookbook page — spacious, monochrome, and let the imagery do the chromatic work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon | `#000000` | Primary text, navigation, icons, hairline borders, filled emphasis buttons, and the membership overlay surface |
| Bone White | `#ffffff` | Page canvas, card surfaces, and inverse text on dark surfaces |
| Linen | `#eaeae8` | Outlined button borders, tag and chip backgrounds |
| Mist | `#e0e0e0` | Hairline dividers, input borders, subtle section separators |
| Slate | `#333333` | Button labels and secondary headings on light surfaces |
| Graphite | `#666666` | Input placeholder text and form helper copy |
| Pewter | `#767676` | Muted metadata, tag fill, and secondary link underlines |
| Obsidian | `#080808` | Deep text and link stroke alternative — visually indistinguishable from Carbon but slightly softer on screen |
| Indigo Whisper | `#3860be` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |

## Typography

### Arket Sans — Primary UI and body typeface. Renders navigation, buttons, links, form labels, and product copy. Humanist proportions with generous x-height keep body text legible at 13–16px while the 18–24px steps carry section headings without visual weight.
- **Substitute:** Inter, Söhne, or system-ui sans-serif
- **Weights:** 400
- **Sizes:** 10px, 13px, 16px, 18px, 24px
- **Line height:** 1.23, 1.50

### arketSansMono — The signature editorial label font. Used for navigation, product cards, tags, button text, and headings throughout the site. The monospace geometry contrasts the humanist sans and reinforces the museum-catalogue voice.
- **Substitute:** IBM Plex Mono, JetBrains Mono, or Roboto Mono
- **Weights:** 400
- **Sizes:** 10px, 12px, 16px, 22px, 28px
- **Line height:** 1.21, 1.27, 1.38, 1.50, 1.88

### arketSCSansMono — Small-caps variant of the mono for editorial metadata like 'GUÍA DE CUIDADO', 'FEBRERO 2026', 'ENTREVISTAS'. Tighter letter-spacing (-0.05em) and uppercase transforms make category labels feel like archival wall text.
- **Substitute:** IBM Plex Mono SC, JetBrains Mono with text-transform: uppercase
- **Weights:** 400
- **Sizes:** 10px, 12px, 16px
- **Line height:** 1.00, 1.38, 1.50
- **Letter spacing:** -0.5
- **OpenType features:** `"smcp" on, "c2sc" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 0px |
| body-md | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 18px | 1.5 | 0px |
| heading-sm | — | — | 22px | 1.21 | 0px |
| heading | — | — | 24px | 1.23 | 0px |
| display | — | — | 28px | 1.21 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 64-80px
- **Card padding:** 20-24px
- **Element gap:** 16px

### Border Radius

- **tags:** 2px
- **inputs:** 2px
- **modals:** 0px
- **buttons:** 2px
- **contentBlocks:** 20px

## Components

### Announcement Bar
**Role:** Slim top strip surfacing seasonal or membership messages

Full-bleed #ffffff background, single line of 12px arketSansMono text in Carbon. Inline link underlined with 1px Pewter. Padding 8px top/bottom, centered content. No divider above or below — it sits flush against the header.

### Primary Header Bar
**Role:** Sticky top navigation containing brand mark, search, and account actions

#ffffff background, 64px tall, no border. Left: ARKET wordmark in Arket Sans 24px Carbon. Center: 48px-tall search input with Linen border (#eaeae8), 2px radius, 12px Arket Sans placeholder in Graphite, and a leading search icon in Carbon. Right: account, wishlist, and bag icons in Carbon, 24px, 32px gap between.

### Category Navigation
**Role:** Horizontal product category selector below the header

#ffffff background, 48px tall, no border. Arket Sans 13px Carbon, uppercase-transformed, 32px horizontal gap. Active item uses Carbon weight 400 (no bolder weight — the system never increases weight to indicate state). Right-aligned utility links ('ARKET CAFÉ', 'Servicio de atención al cliente') and locale switcher in the same type style.

### Outlined Text Button
**Role:** Secondary action — explore, discover, read more

Transparent background, 1px Carbon border, 2px radius. Padding 12px 24px. Arket Sans 13px Carbon, uppercase or sentence case. Example from the hero: 'Explora novedades en ropa femenina' — a quiet invitation that doesn't compete with the photography.

### Solid Black Button
**Role:** Primary emphasis action — commit, join, checkout

#000000 fill, #ffffff text, 2px radius. Padding 12px 24px. Arket Sans 13px, letter-spacing normal. Example: 'Hacerse miembro' on the membership card. Always used sparingly — never more than one per viewport — because the system inverts for emphasis rather than colors.

### Membership Overlay Card
**Role:** Persistent bottom-right panel promoting the loyalty program

#000000 solid surface, #ffffff text, 0px radius (flush square corner). Padding 24px. Width ~320px. Headline in Arket Sans 16px white, body copy 12px white at 80% opacity, three checklist items with circular check icons in white. Solid Black Button anchored at the bottom for the CTA. The card floats above page content with no shadow — it relies on its tonal contrast alone to separate from the page.

### Editorial Content Card
**Role:** Journal or story tile in the 4-up content grid

Vertical card on #ffffff canvas, no border, no shadow, no radius (square corners in the grid, 20px radius only on container blocks). Image fills the top 70% of the card edge-to-edge with 0px radius. Below the image: 10px arketSansMono uppercase category label in Slate (#333333), then 22px Arket Sans headline in Carbon, then 13px Arket Sans excerpt in Pewter. 20px vertical gap between image and headline, 8px between headline and excerpt. Grid gap: 24px column, 32px row.

### Hero Image Block
**Role:** Full-bleed editorial photography anchoring the top of the page

100vw width, auto height (typically 70vh), 0px radius, no overlay text. A single outlined text button ('Explora novedades en ropa femenina') sits centered just below the image as the only UI element in the hero zone. The button has a #ffffff background to lift it off the photo.

### Search Input
**Role:** Inline product and content search in the header

#ffffff fill, 1px Linen (#eaeae8) border, 2px radius. 40px height, 16px horizontal padding. Leading search icon 16px Carbon. Placeholder 'Buscar' in 13px Graphite (#666666). No visible focus ring — on focus the border darkens to Carbon.

### Category Tag (Small Caps)
**Role:** Editorial metadata label above headlines and on product cards

#ffffff background, no border. 10px arketSCSansMono uppercase, letter-spacing -0.05em, in Slate (#333333). 0px padding, 8px bottom margin to the headline it labels.

### Footer Link Column
**Role:** Dense link grid in the site footer

#ffffff background, separated from content by a 1px Mist (#e0e0e0) top border. Column titles in 12px arketSansMono uppercase Carbon, 16px gap to the first link. Links in 13px Arket Sans Carbon, 8px row gap. Four to five columns on desktop, stacking to two on tablet and one on mobile.

### Product Card (implicit)
**Role:** Merchandising tile for clothing items in category grids

#ffffff surface, no border or radius. Product image edge-to-edge, 0px radius. Below: product name in 13px Arket Sans Carbon, price in 13px arketSansMono Carbon. 16px vertical gap between image and name, 4px between name and price. No hover state beyond image scale — the system doesn't add color or shadows on interaction.

## Do's and Don'ts

### Do
- Use 2px radius on all buttons, inputs, and tags — sharp corners are a signature of the ARKET restraint
- Pair a solid black button with an outlined white button at the same height when offering primary + secondary actions, rather than using a chromatic accent
- Use arketSCSansMono at 10–12px with -0.05em letter-spacing for editorial category labels and metadata, never for body copy
- Keep all UI surfaces achromatic — #ffffff canvas, Carbon text, Mist dividers, Linen borders — and let the photography supply the only color on a page
- Maintain 16px element gaps and 64–80px section gaps; whitespace is the primary hierarchy tool, not weight or color
- Use #000000 filled cards (like the membership overlay) as the only way to introduce tonal contrast; never add shadows to lift a surface
- Anchor every editorial content card with an edge-to-edge photograph at 0px radius — the image IS the card, the type sits below it like a caption

### Don't
- Never use the #3860be Indigo Whisper as a decorative fill, badge background, or illustration color — it exists only for link or interactive states
- Never increase type weight above 400 to signal emphasis — use size, position, or tonal contrast (black on white vs. white on black) instead
- Never add gradient fills, glow effects, or colored shadows — the system is deliberately flat
- Never round card corners with anything other than 0px in grids or 20px on isolated content blocks; mixing radii breaks the gallery wall feel
- Never replace the custom Arket Sans or arketSansMono with a system fallback in production — the mono is essential to the editorial voice
- Never add more than one filled black button per viewport — the inversion effect loses its emphasis if everything is inverted
- Never apply shadows to elevate cards, navigation, or modals — the single rgba(0,0,0,0.1) 0px 2px 10px 2px shadow is reserved for floating link tooltips only

## Elevation

- **Floating link tooltip:** `rgba(0, 0, 0, 0.1) 0px 2px 10px 2px`

## Surfaces

- **Canvas** (`#ffffff`) — Page background and card surfaces — the dominant uninterrupted light field
- **Hairline** (`#e0e0e0`) — Dividers, input borders, and tag outlines that separate content bands without weight
- **Inverse Panel** (`#000000`) — Membership card and filled emphasis buttons — solid black panels that invert type to white

## Imagery

ARKET's visual language is photography-first, editorial-grade lifestyle imagery rendered as full-bleed or edge-to-edge blocks with 0px radius. Shots are high-key, softly lit by natural window light, and staged in calm domestic interiors — linen bedding, warm wood, neutral ceramics. Models appear unposed and intimate, often in motion or partially cropped, reinforcing the unretouched, quiet-luxury voice. Wardrobe stays within muted earth tones and softened primaries (terracotta, navy, oatmeal, deep red), so the photography carries all the chromatic weight the interface refuses to. The single blue accent (#3860be) never appears inside the imagery — it belongs only to the UI as a near-invisible link color. Icons throughout the site are thin, single-color Carbon line icons at 16–24px, used sparingly for account, search, wishlist, and cart actions.

## Layout

ARKET uses a full-bleed page model with no central max-width container on the hero and editorial bands — imagery and content stretch edge-to-edge. The page opens with a sticky two-row header (utility bar + main header) followed by a thin category navigation, then a single full-viewport hero photograph with a centered outlined text button beneath it. Below the hero, content shifts to a 4-column editorial card grid for journal content, with generous 64–80px vertical gaps between bands. A persistent membership overlay card anchors the bottom-right of the viewport, floating above all content. The footer is a dense 4–5 column link grid separated from the page by a 1px hairline. The system never uses alternating colored bands — every section shares the same #ffffff canvas, with tonal variation introduced only by photography.

## Similar Brands

- **COS** — Same Scandinavian restraint, achromatic UI, full-bleed editorial photography, and 2px corner radius on interactive elements
- **Toteme** — Identical white-gallery aesthetic, large serif-free headings paired with mono labels, and no color anywhere except inside campaign imagery
- **Mr Porter** — Same monochrome editorial layout language — black-on-white sans type, full-bleed hero photography, and a persistent side utility card
- **Aesop** — Equal commitment to achromatic UI, thin rule lines, monospace category labels, and letting the product photography carry all visual interest
- **&Other Stories** — Shares the H&M-group design DNA — custom humanist sans + monospace pairing, hairline borders, and a flat card-driven editorial grid
