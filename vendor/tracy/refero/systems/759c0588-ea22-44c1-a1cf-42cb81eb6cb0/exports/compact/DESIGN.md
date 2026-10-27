# VSCO® — Style Reference
> Monochrome gallery wall — a black-and-white photo exhibition where a single warm spotlight makes the next action glow.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

VSCO's visual system reads as a monochrome photography gallery: a near-pure black-and-white canvas where a single warm amber accent punctuates action. Display type is narrow, geometric, and enormous — hero headlines push 89-98px, commanding attention through scale and tight tracking rather than through color or ornament. The palette stays disciplined: white sections frame black product bands, and full-bleed photography carries emotional weight that decoration never tries to. Buttons are pill-shaped and unflinching — black fills for default actions, amber for the single moment of warmth. The design is deliberately flat: no shadows, no gradients, no skeuomorphic depth. Elevation comes from surface contrast (white → black bands) and image bleed, not from layered depth effects.

## Colors

| Name | Value | Role |
|------|-------|------|
| Photo Black | `#000000` | Body text, filled buttons, dark section backgrounds, nav text, borders, icon strokes — the dominant structural color across all surfaces |
| Paper White | `#ffffff` | Page canvas, hero background, footer background, text on dark surfaces, nav fill — the primary light surface |
| Fog Gray | `#f2f2f2` | Subtle alternate section backgrounds, hairline washes — barely-there surface differentiation |
| Graphite | `#737373` | Secondary text, footer link text, muted labels — the first step down from body black |
| Ash | `#b8b8b8` | Tertiary text, lighter secondary labels, disabled-adjacent text |
| Silver | `#d9d9d9` | Borders on ghost/outline buttons, subtle dividers, placeholder text |
| Steel | `#999999` | Mid-gray auxiliary text and borders |
| Amber | `#f1a900` | Yellow supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Goldenrod | `#ffbc3c` | Lighter amber variant for hover states, secondary accent surfaces — same hue family, one step lighter |

## Typography

### VSCO Gothic — Single custom family used at every size — nav items at 13px tracked to 0.08-0.10em, body at 15-16px, product card titles at 24px, section headings at 36-54px, and hero display at 89-98px with -0.05em tracking. The narrow geometric letterforms with ligatures disabled give every text element a distinctive editorial-gallery feel, even at body sizes.
- **Substitute:** Oswald (closest free match for the narrow geometric forms) or Bebas Neue for display-only; pair with Inter for body if splitting families
- **Weights:** 400, 500, 600
- **Sizes:** 10, 11, 13, 15, 16, 24, 29, 36, 54, 89, 98
- **Line height:** 0.88-1.50
- **Letter spacing:** Tight -0.05em on display sizes (54px+), 0 on body, wide 0.08-0.10em on nav/eyebrow text
- **OpenType features:** `"clig" 0, "liga" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.4 | 1.1px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 24px | 1.29 | -1.2px |
| heading-sm | — | — | 29px | 1.2 | -1.45px |
| heading | — | — | 36px | 1.14 | -1.8px |
| heading-lg | — | — | 54px | 1.08 | -2.7px |
| display | — | — | 89px | 0.95 | -4.45px |
| display-xl | — | — | 98px | 0.93 | -4.9px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 48px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **nav:** 4px
- **tags:** 999px
- **cards:** 4px
- **badges:** 4px
- **buttons:** 999px

## Components

### Filled Black Button
**Role:** Default action — login, sign-up, primary navigation

999px pill radius, #000000 background, #ffffff text, VSCO Gothic 13px weight 500, 1.08em letter-spacing, 6px 20px padding. The universal action button. No shadow, no border, no hover gradient — just inverted contrast.

### Filled Amber Button
**Role:** Accent action — explore, learn more, secondary CTA

999px pill radius, #f1a900 background, #000000 text, VSCO Gothic 13px weight 500, 1.08em letter-spacing, 6px 20px padding. The single warm element on the page — used sparingly, one per viewport maximum.

### Ghost Outline Button
**Role:** Secondary action on dark surfaces — play video, explore stories

999px pill radius, transparent background, 1px #d9d9d9 border, #ffffff text, VSCO Gothic 13px weight 500, 1.08em letter-spacing, 6px 20px padding. Designed for overlay on photography or dark sections.

### Top Navigation Bar
**Role:** Primary site navigation

#ffffff background, 60-72px height, VSCO circular logo (black) on left, nav items in VSCO Gothic 13px weight 500 uppercase, 0.10em letter-spacing, #000000 color. Nav items separated by 24-28px gap. Right side: 'LOG IN' text link (13px, #000) and 'TRY FOR FREE' filled black pill button. No drop shadow, no border-bottom.

### Product Card
**Role:** Product feature showcase — photo filters, editor, capture, canvas

Dark card with #000000 background, 4px border radius, product image filling top ~75% of card height, label bar at bottom with 16px padding. Label in VSCO Gothic 13px weight 500, 0.08em letter-spacing, #ffffff color, uppercase, with a small arrow indicator (↗). Cards sit directly on a #000000 section background — the card edge is defined by the image boundary, not a visible card border.

### Tab Bar
**Role:** Section-level content switcher — What's New, Create, Connect, Work

Horizontal text tabs on a #000000 background. Each tab: VSCO Gothic 13px weight 500, 0.10em letter-spacing, uppercase. Active tab: #ffffff with a hairline underline. Inactive tabs: #737373 (Graphite). No background fill on tabs, no pill containers — just text with an underline indicator.

### Hero Headline
**Role:** Above-the-fold primary message

VSCO Gothic weight 600, 89-98px, #000000 on white sections / #ffffff on dark sections. Letter-spacing -0.05em. Line-height 0.93-0.95 (tight, almost touching). Always left-aligned, never centered. Occupies 2-3 lines at maximum.

### Section Heading
**Role:** Mid-page section titles

VSCO Gothic weight 600, 36-54px, uppercase, #ffffff on dark sections or #000000 on white. Letter-spacing -0.05em. Single line, left-aligned. Sits with generous space above (40-48px) and tight space below (16-20px).

### Full-Bleed Photography Band
**Role:** Atmospheric photography — product lifestyle, community imagery

Edge-to-edge image spanning 100% viewport width, variable height (40-100vh). No border radius, no overlay frame. Text overlays use VSCO Gothic weight 500-600 in white with a 0-2px text-shadow for legibility. Photography is warm-toned, documentary/editorial style, often golden-hour or natural light.

### Badge / New Tag
**Role:** Product feature indicator — 'NEW' on AI Lab, Galleries

4px border radius, #f1a900 background, #000000 text, VSCO Gothic 10-11px weight 500, 0.08em letter-spacing, uppercase. 2px vertical padding, 4-6px horizontal padding. Small, understated, sits adjacent to product names.

### Mega Footer
**Role:** Site-wide link directory

#ffffff background, 4-column grid (Products, Solutions, Resources, Company) on white. Column headers in VSCO Gothic 13px weight 600, 0.10em letter-spacing, uppercase, #000000. Links in 15px weight 400, #737373. 28-30px gap between columns. 20-24px gap between links. Logo + two CTAs ('TRY FOR FREE' outlined, 'DOWNLOAD NOW' filled black) above the link grid. Thin bottom bar with language selector and legal links in #737373.

### Ghost Footer Button
**Role:** Secondary footer action — 'TRY FOR FREE' in footer

999px pill radius, transparent background, 1px #000000 border, #000000 text, VSCO Gothic 13px weight 500, 0.08em letter-spacing, uppercase, 6px 20px padding. Pairs with the filled black button as a text/link-equivalent alternative.

## Do's and Don'ts

### Do
- Use 999px border-radius for all buttons, tags, and pill-shaped interactive elements
- Set display headlines at 89-98px with -0.05em letter-spacing and line-height 0.93-0.95
- Track nav items and uppercase labels at 0.08-0.10em letter-spacing
- Use #000000 as the default filled button background and #f1a900 only for accent actions — never more than one amber button per viewport
- Set font-feature-settings to 'clig' 0, 'liga' 0 on VSCO Gothic to preserve the distinctive un-ligated letterforms
- Alternate white (#ffffff) and black (#000000) section backgrounds to create rhythm — never use intermediate grays for full sections
- Let photography bleed to viewport edges with no border-radius or overlay frames

### Don't
- Never add drop shadows, glows, or blur to cards, buttons, or any UI element — the system is flat by design
- Never use gradients — the palette is strictly solid colors
- Never introduce chromatic colors beyond the amber accent — no blues, greens, purples, or secondary hues
- Never use border-radius values other than 4px (for cards/badges/nav) or 999px (for buttons/tags)
- Never set display type below 54px for section headings or below 89px for hero headlines — the scale IS the identity
- Never use centered text alignment for headlines — always left-align
- Never use more than one amber button on the same screen — the accent is a one-per-viewport moment

## Elevation

Flat by conviction. No drop shadows on cards, buttons, or floating elements anywhere in the system. Elevation is achieved entirely through surface inversion (white → black) and full-bleed image bleed, never through shadow depth or blur. The absence of shadows is deliberate: it keeps the photography sharp and unmediated.

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — hero, footer, and light sections
- **Alternate Light** (`#f2f2f2`) — Subtle band differentiation within light areas — used sparingly
- **Inverted Surface** (`#000000`) — Dark sections, product card backgrounds, button fills — contrast surface for product showcases

## Imagery

Photography is the primary visual content, not decoration. Images are full-bleed, edge-to-edge, with no rounded corners or frames. The style is warm-toned, documentary/editorial — natural light, golden-hour palettes, candid human subjects, and unposed moments. Product screenshots appear as card thumbnails within a dark product grid. No illustrations, no abstract graphics, no 3D renders. The photography is always the hero; UI chrome stays out of its way. Color treatment is natural — no duotones, no filters applied to the imagery itself. Icon style is minimal: the VSCO circular logo mark, small arrow indicators (↗) on cards, and no icon system elsewhere.

## Layout

Max-width 1280px centered for content blocks, with full-bleed photography bands breaking out to viewport edges. Hero is a white canvas with a massive left-aligned headline (89-98px) occupying the upper third, followed by body text and two pill buttons, then a full-bleed photograph. The page rhythm alternates: white hero → full-bleed photo → black section with 5-column product card grid → white mega footer. Navigation is a top bar (not sticky). The black product section is the visual anchor — it's the only large dark surface and it contains the entire product catalog as a 5-column grid. Section gaps are compact (40-48px) despite the large type, creating a tight editorial density rather than a spacious SaaS feel.

## Similar Brands

- **Squarespace** — Same monochrome-first palette, oversized display headlines, pill-shaped buttons, and full-bleed photography as the primary content type
- **Behance** — Dark product showcase sections with image-driven card grids, photography-first content, and the same editorial creative-tool energy
- **Format** — Photographer-focused platform with a similar black-and-white gallery aesthetic, large type, and minimal decorative chrome
- **Polaroid Originals** — Photography brand with the same warm-amber accent against monochrome surfaces and a curatorial, gallery-style presentation
