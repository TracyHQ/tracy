# Woset — Style Reference
> paper gallery in morning light — a quiet, warm-gray room where one golden accent is the only color allowed on the walls.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Woset reads as a curated art-supply shop rendered as a gallery wall: soft warm-gray canvas (#e5e7eb), monochrome black-on-gray chrome, and a single golden-yellow accent (#ecca53) that activates filter pills and key actions. Typography anchors on Macan, a geometric sans used at a whisper-tight -0.04em tracking — the 95px display headline is the loudest element on the page, then everything collapses to a quiet 15px body. The product grid trades glossy photography for hand-drawn illustrations in a generous 3-column layout with no card borders, no drop shadows, and 30px pill-radius controls. The system is intentionally restrained: one warm color, one typeface, zero elevation — every screen should feel like a well-lit page in a stationery boutique.

## Colors

| Name | Value | Role |
|------|-------|------|
| Soft Pebble | `#e5e7eb` | Page canvas, card surfaces, and the dominant background tone — a warm-leaning gray that reads as handmade paper rather than digital white |
| Carbon Ink | `#000000` | Primary text, nav labels, icons, and the default state of unselected interactive controls. Carries all typographic and chrome weight in the system |
| Ash | `#bbbab7` | Hairline borders and dividers on buttons and structural elements — just visible enough to define edges without ever competing with text |
| Stone | `#8d8c8a` | Muted helper text — product prices, secondary metadata, and any label that should recede behind the primary content |
| Sunlit Marigold | `#ecca53` | The sole chromatic accent — active filter pills, selected nav states, and the only place a UI element may be filled with color. The warmth against Soft Pebble creates an almost-handmade yellow, not a digital primary |

## Typography

### ts-unused — ts-unused — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 15px
- **Line height:** 1
- **Letter spacing:** -0.02

### Macan — Single-family type system used for display, heading, body, nav, and UI. The signature choice is weight 500 at 95px with -0.04em tracking for the hero headline — a tight, modern geometric sans that feels like a custom craft brand, not a tech platform. Substitute with Inter (free) or Söhne (commercial) for the closest matching grotesque feel.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 15px, 24px, 25px, 95px
- **Line height:** 1.00, 1.20, 1.35
- **Letter spacing:** -3.8px at 95px, -1.0px at 25px, +1.6px at 24px, -0.3px at 15px

### GTStandard-M — GTStandard-M — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.5
- **Letter spacing:** -0.02

### A1 Gothic M — A1 Gothic M — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1
- **Letter spacing:** -0.019

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 15px | 20.25 | -0.3px |
| product-title | — | — | 24px | 32.4 | 1.6px |
| display | — | — | 95px | 95 | -3.8px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 60px
- **Card padding:** 22px
- **Element gap:** 22px

### Border Radius

- **cards:** 0px
- **images:** 0px
- **inputs:** 30px
- **buttons:** 30px

## Components

### Top Navigation Bar
**Role:** Persistent header with three-zone layout: left nav links, centered wordmark, right utility links.

Full-bleed Soft Pebble (#e5e7eb) background, no border, no shadow. Three groups: left cluster ('Shop', 'World', 'Information' in 15px Macan weight 400 Carbon Ink), centered 'Woset' wordmark in 15px Macan weight 500, right cluster (language flag + 'En', 'Account', 'Cart (0)') in same 15px Macan. All items 22px apart, vertically centered. No hover states visible — typography does the work.

### Display Headline
**Role:** Hero-level statement that anchors the page top.

Centered, 95px Macan Medium (weight 500), Carbon Ink (#000000), line-height 1.0, letter-spacing -0.04em (-3.8px). Occupies the upper third of the viewport on its own. The tight tracking is the signature: at 95px the headline reads as a single confident breath, not a shout.

### Filter Pill — Default
**Role:** Unselected category filter button.

30px border-radius (full pill), 1px Ash (#bbbab7) border, Soft Pebble (#e5e7eb) fill, Carbon Ink text at 15px Macan weight 400. Padding 11px top / 9px bottom / 14px left/right. No shadow, no fill change on hover implied.

### Filter Pill — Active
**Role:** Selected category filter — the only filled accent on the page.

30px border-radius, no visible border (or border matches fill), Sunlit Marigold (#ecca53) fill, Carbon Ink text at 15px Macan weight 400. Same 11/9/14px padding as default. The yellow fill against the Soft Pebble canvas is the system's only color punctuation in the hero zone.

### Product Card
**Role:** Single product tile in the 3-column grid.

No border, no shadow, no background — the product image sits directly on the Soft Pebble canvas with 0px corner radius. Below the image: 22px gap, then product title in 15px Macan weight 400 Carbon Ink, followed by 4px gap, then price in 15px Macan weight 400 Stone (#8d8c8a). The image is a hand-drawn illustration (not a photo) at roughly 3:2 aspect ratio.

### Product Image
**Role:** Hero visual for each product card.

Hand-drawn or hand-lettered illustration, full-bleed within the card, 0px corner radius, no caption overlay. The illustration style is the brand — raw line work, imperfect strokes, childlike charm, occasional hand-set title lettering integrated into the artwork. Color is used inside the illustration (crayon textures, marker scribbles) but never as a UI surface.

### Language/Region Selector
**Role:** Utility control in the top nav right cluster.

15px Macan weight 400 Carbon Ink, inline flag emoji + 'En' label, no border, no background, no dropdown chrome visible at rest. Sits inline with Account and Cart links at the same baseline.

### Account/Cart Link
**Role:** Utility nav items in the top nav right cluster.

15px Macan weight 400 Carbon Ink, plain text, no underline, no icon. Cart includes a parenthetical count: 'Cart (0)'. Sits inline with the language selector, separated by the same 22px gap used throughout the nav.

## Do's and Don'ts

### Do
- Use Sunlit Marigold (#ecca53) as the only chromatic surface — one accent per viewport, never as a full-bleed background.
- Apply 30px border-radius to all interactive controls (buttons, inputs, filter pills) — the pill is the system's only shape language.
- Set hero text at 95px Macan Medium with -0.04em tracking (-3.8px) — this tight setting is what makes the headline feel custom.
- Keep all product cards borderless with 0px radius — let the hand-drawn illustration define the edge.
- Maintain 60px vertical gaps between major sections and 22px between sibling elements.
- Use Stone (#8d8c8a) at 15px for all prices and secondary metadata; Carbon Ink (#000) is reserved for primary text and labels.
- Center the hero zone (headline + filters); left-align product card metadata below each image.

### Don't
- Don't introduce additional accent colors — the system is monochrome chrome plus one warm yellow. The violet/green/red tones in product art are illustration-only.
- Don't apply drop shadows to product cards, buttons, or any UI surface — the design is flat by intent.
- Don't use font weights above 500 — Macan caps at Medium, and heavier weights would break the quiet, geometric feel.
- Don't add card backgrounds or borders to product tiles — the Soft Pebble canvas is the only surface.
- Don't use letter-spacing looser than -0.02em for body text or -0.04em for display — the system is deliberately tight-tracked.
- Don't add a secondary CTA color, gradient, or filled black button — the only filled accent is Sunlit Marigold.
- Don't left-align the hero headline or add a hero image — the centered text-only hero is a signature.

## Elevation

The system is deliberately flat. No drop shadows, no glow effects, no elevation tokens. Separation is achieved through the warm-gray canvas color and 1px Ash borders on interactive controls. Product cards rely on the hand-drawn illustration itself to define their edge, not on shadow or border.

## Surfaces

- **Page Canvas** (`#e5e7eb`) — The single background for the entire site — full-bleed Soft Pebble with no variation between hero, grid, or footer.
- **Active Filter Surface** (`#ecca53`) — Sunlit Marigold fill used exclusively for the selected filter pill — the only elevated color surface in the system.

## Imagery

Imagery is the brand identity: every product is presented as a hand-drawn or hand-lettered illustration, not a photograph. The illustration style is intentionally imperfect — visible pencil texture, slightly wobbly line work, childlike charm, and integrated hand-set title typography within the artwork. Color appears inside the illustrations (crayon multi-color, marker scribbles, watercolor washes) but is never used as a UI surface. Product images are full-bleed within their card with sharp 0px corners. There is no lifestyle photography, no staged scenes, no human models — the artwork IS the product, and the page is a gallery wall for it.

## Layout

Centered max-width 1200px container on a full-bleed Soft Pebble canvas. Hero is a single centered 95px headline with no supporting visual, followed by a centered row of filter pills — no sidebars, no asymmetric hero. Product grid is a clean 3-column layout with generous gutters, no card chrome (no border, no shadow, no background fill). Vertical rhythm uses 60px section gaps and 22px element gaps. Navigation is a single top bar with three zones (left nav, centered wordmark, right utilities) — no sticky behavior, no mega-menu. The page reads as a single editorial column with a product gallery below the headline.

## Similar Brands

- **Areaware** — Same gallery-wall approach to commerce — products as curated objects on a neutral canvas, illustrated or designerly rather than photographic, with minimal chrome and no shadow.
- **Schoolhouse** — Same soft warm-gray canvas with monochrome type and a single restrained palette; both treat the product grid as a quiet editorial spread rather than a busy marketplace.
- **The Citizenry** — Same centered max-width layout, generous 60px section gaps, and typographic-first hero with no hero image — craft brand with editorial restraint.
- **Toast** — Same single warm accent against a neutral background, tight geometric sans at large display sizes, and a product-first grid that lets the imagery carry the page.
