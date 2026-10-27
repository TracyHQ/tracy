# Claude Type — Style Reference
> curated gallery on warm parchment

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Claude Type operates as a curated type foundry gallery rendered on warm linen parchment: an editorial cream canvas, pill-shaped UI chrome, and arched image portals that frame type specimens like museum vitrines. The interface is almost entirely achromatic — deep warm-black text on cream surfaces — with a single electric green badge as the only chromatic punctuation. Frosted-glass navigation floats over content, display serifs are treated as hero artwork not as UI text, and borders rather than shadows define every surface. The visual rhythm is gallery-slow: generous breathing room, tombstone-arched cards, and the type itself doing the heavy lifting.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Cream | `#fcfbf7` | Primary page canvas and hero section background — warm off-white that flatters display serifs the way museum walls flatter paintings |
| Pure Linen | `#ffffff` | Card surfaces, button fills, icon strokes — the cleanest white sits one step above the cream canvas to separate cards from page |
| Warm Linen | `#e7e4e0` | Secondary surface and frosted nav background — a muted stone tone that softens the nav bar against the cream canvas |
| Ink Black | `#0d0d0f` | Primary text and button borders — near-black with a cool undertone, used for all body copy and the outlined button strokes |
| Espresso | `#2b1b1b` | Secondary text and hairline borders — a warm dark brown that acts as the dominant border color across cards, nav, and dividers |
| Carbon | `#000000` | SVG fills, logo marks, and icon strokes — pure black for the highest-contrast graphic elements |
| Bitter Brown | `#100401` | Dark showcase card background — nearly black with warm brown undertone, used for display type specimen cards to make white serifs glow |
| Acid Lime | `#99ff66` | Accent badge fill for metadata tags — the only chromatic color in the UI, used sparingly to mark type specs, style counts, and new releases |

## Typography

### MagicUIPro — Sole UI typeface — all navigation, body copy, buttons, labels, and section headings use this family at 11–18px; the custom font includes discretionary ligatures ("dlig") that add character to small text
- **Substitute:** Inter, General Sans, or Söhne
- **Weights:** 400
- **Sizes:** 11px, 12px, 14px, 15px, 18px
- **Line height:** 1.00–2.00
- **Letter spacing:** 11px: -0.0020em, 12px: 0.0010em, 14px: 0.0020em, 15px: 0.0100em, 18px: 0.0200em
- **OpenType features:** `"dlig" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.4 | -0.022px |
| body-lg | — | — | 15px | 1.67 | 0.15px |
| subheading | — | — | 18px | 2 | 0.36px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1400px
- **Section gap:** 64-96px
- **Card padding:** 16px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 100px
- **badges:** 100px
- **buttons:** 100px
- **heroCard:** 40px
- **archedCards:** 900px
- **standardCards:** 16-32px

## Components

### Frosted Glass Navigation Bar
**Role:** Primary site navigation

Floating pill-shaped bar with 100px border-radius, Warm Linen (#e7e4e0) semi-transparent background, and 1px Espresso (#2b1b1b) border. Contains CLAUDE wordmark centered with nav links in two pairs flanking it. Vertical padding 14px, horizontal padding 16px. Sits above content with a slight backdrop blur effect.

### Pill Nav Link
**Role:** Navigation item

Text-only link at 12–14px MagicUIPro weight 400, Ink Black (#0d0d0f) color. No background or border — the parent nav bar provides the pill shape. No active state styling visible beyond the grouping.

### Arched Image Card
**Role:** Product/editorial showcase card

Full-bleed image with 900px border-radius creating a tombstone/arched-top shape. No padding, no shadow, no border. Images fill the entire card. Used for fashion editorial and product photography in the hero row.

### Dark Display Specimen Card
**Role:** Typeface showcase on dark background

Bitter Brown (#100401) background, 900px border-radius (matching the arched card language). Contains oversized white display serif at 80–120px as the hero element. Two pill buttons centered below the display text. Represents the inverted dark variant of the arched card system.

### Outlined Pill Button
**Role:** Primary action button on dark cards

100px border-radius, 1px white border, transparent fill, white text at 14px MagicUIPro. Padding 14px vertical, 20px horizontal. Used for 'Explore' and 'Buy' actions on dark specimen cards.

### Filled Dark Pill Button
**Role:** Primary action on light backgrounds

100px border-radius, Ink Black (#0d0d0f) fill, white text at 14px MagicUIPro. Padding 14px vertical, 20px horizontal. High-contrast filled variant for CTAs on cream surfaces.

### Acid Lime Badge
**Role:** Metadata tag for type specimens

100px border-radius pill, Acid Lime (#99ff66) background, Ink Black (#0d0d0f) text at 12px. Padding 3px vertical, 8–10px horizontal. Marks metadata like '12 Styles' next to typeface names. The only chromatic element in the system.

### Standard Card
**Role:** Content card with border

16–32px border-radius, Pure Linen (#ffffff) background, 1px Espresso (#2b1b1b) border. No shadow. Padding 16px. Used for content blocks, type listings, and secondary information.

### Section Title
**Role:** Page section heading

MagicUIPro weight 400 at 18px, Ink Black color, letter-spacing 0.36px. Centered alignment. No bold weight — the type system is intentionally quiet, letting display serifs elsewhere carry visual weight.

### Hero Display Serif
**Role:** Typeface specimen headline

Custom serif (one of Claude's own typefaces) at 80–120px, white on Bitter Brown background. Tight letter-spacing, centered. This is product content, not UI — but establishes the typographic authority the entire site orbits.

### Gradient Feature Section
**Role:** Promotional band between content blocks

Full-bleed soft gradient section transitioning from pale green to warm peach/pink. Centered text at 18px MagicUIPro, weight 400. Creates a momentary color wash in an otherwise achromatic layout.

### Footer
**Role:** Site footer

Cream (#fcfbf7) background, generous padding (64px top, 48px bottom, 42px horizontal). Minimal text content in Ink Black. Hairline Espresso borders separate footer from content above.

## Do's and Don'ts

### Do
- Use 100px border-radius for all interactive elements: nav bar, buttons, badges, and tags
- Use 900px border-radius for full-bleed image cards and dark specimen cards to create the signature arched/tombstone shape
- Set all body text in MagicUIPro weight 400 — never use bold weights in UI copy; the system stays visually quiet so display serifs can speak
- Reserve #99ff66 (Acid Lime) exclusively for metadata badges; never apply it to backgrounds, borders, or body text
- Use #2b1b1b (Espresso) for all hairline borders at 1px; this warm brown is the structural line color across the system
- Maintain generous spacing: 64px minimum between major sections, 14–16px within component groups
- Activate "dlig" font-feature-settings on all MagicUIPro text to enable the custom discretionary ligatures

### Don't
- Do not add drop shadows, glows, or blur effects to cards or buttons — the system is shadow-free by design
- Do not introduce additional accent colors beyond #99ff66; the 3% colorfulness is intentional
- Do not use border-radius values below 10px for cards or 100px for interactive elements — the pill/arch vocabulary is binary
- Do not set body text above 18px or use MagicUIPro for display headlines; display serifs are product content, not UI
- Do not use pure white (#ffffff) as a page background — always use #fcfbf7 cream as the canvas
- Do not apply bold (600+) or semibold weights to MagicUIPro; the family exists at 400 only and any synthetic bolding breaks the system
- Do not center-align body paragraphs or create dense text blocks; the layout is gallery-sparse with generous line-height (1.6–2.0)

## Elevation

- **Arched Image Card:** `none — relies on full-bleed imagery and arched radius for presence`
- **Standard Card:** `none — 1px Espresso (#2b1b1b) border provides definition`
- **Frosted Nav:** `none — frosted glass effect replaces shadow as elevation signal`

## Surfaces

- **Cream Canvas** (`#fcfbf7`) — Base page background, hero sections
- **Linen Card** (`#ffffff`) — Card surfaces raised above canvas
- **Stone Overlay** (`#e7e4e0`) — Frosted nav bar, secondary surface
- **Bitter Card** (`#100401`) — Dark display specimen card — inverted surface for type showcase

## Imagery

Full-bleed editorial photography dominates the visual hierarchy: tight fashion crops, portraiture, and product close-ups fill the arched image cards with no padding or margins. Photography is naturalistic and high-resolution — no filters, duotones, or color treatments. The images function as type specimens' contextual environments, showing the typefaces in luxury editorial use. No illustrations, no abstract graphics, no icons beyond minimal UI nav indicators. The one gradient element (green-to-peach band) provides the only non-photographic color moment. Image density is high in the hero and feature sections, then drops to text-only for type specimen displays.

## Layout

Max-width ~1400px centered with full-bleed image cards breaking the container. The page follows an editorial rhythm: frosted glass nav floats over everything, then a three-column arched image hero row, then a full-bleed gradient text section, then alternating dark specimen cards and light content blocks. Section gaps are large (64–96px) creating gallery-pace breathing room. Content arrangement is consistently centered — no left-aligned text-left/image-right patterns. The layout treats the page as a vertical exhibition: each typeface or product gets its own dedicated dark card or light section with generous whitespace above and below.

## Similar Brands

- **Dinamo (dinamo.xyz)** — Same editorial type foundry aesthetic with pill-shaped nav, cream canvas, and display serifs treated as hero artwork
- **Production Type** — French/European type foundry sensibility with gallery-sparse layouts, warm neutral palettes, and large type specimens
- **Grilli Type** — Minimal foundry site with frosted glass nav, arched image treatments, and achromatic palette with single accent color
- **Sharp Type** — Type specimen presentation with dark inverted cards for display type, pill buttons, and cream/off-white light sections
- **Future Fonts** — Curated type marketplace with tombstone/arched card shapes, warm linen backgrounds, and borders-as-structure (no shadows)
