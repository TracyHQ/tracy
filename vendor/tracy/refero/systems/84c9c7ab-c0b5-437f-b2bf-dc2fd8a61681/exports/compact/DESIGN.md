# Home — Style Reference
> Botanical specimen on vellum — an oxblood-stamped plate of golden fat, edges sharp, paper warm, nothing rounded.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Savor uses a warm editorial-ingredient-archive language: cream-paper canvases, full-bleed macro photographs of fats and oils as the dominant visual, and a single deep oxblood accent that replaces shadows with hairline 1px borders. Typography carries a deliberate weight contrast — Roslindale Display Condensed whispers at weight 300 across 120–140px display lines, while Suisse Intl handles body, nav, and UI chrome at 400/700. Components stay thin and outlined rather than filled: a uniform 5px corner radius across buttons, cards, and badges, generous warm-cream negative space, and a palette of essentially three tones — cream, oxblood, and ink. The site reads less like a product page and more like a botanical plate or a science monograph photographed in late-afternoon light.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vellum Cream | `#fff9eb` | Page canvas, card surfaces, text on dark — the dominant warm-paper background that sets the entire temperature of the interface |
| Linen | `#f0e7d7` | Secondary surface for elevated cards, button fills, and body borders — slightly warmer and denser than vellum, creates a cream-on-cream layering without leaving the neutral family |
| Buttered Gold | `#f8e47d` | Accent wash for highlights, badge fills, and tonal surface variation — a saturated warm gold used sparingly to suggest the ingredient palette without competing with photography |
| Ink | `#000000` | Primary text, logo mark, and high-contrast accents — appears in nav fills and select UI chrome where absolute blackness is needed |
| Warm Graphite | `#4d4b47` | Muted text, secondary metadata, and low-emphasis borders — a warm dark gray that softens the otherwise stark black |
| Oxblood | `#370808` | Primary action borders, nav borders, card outlines, badge text, and the single chromatic brand color — a deep wine red that reads almost as a darker cousin of the cream rather than a competing hue, functioning as ink-with-a-pulse |

## Typography

### Roslindale Display Condensed — Hero display only — used at light weight 300 in tightly-leaded (0.86) display lines up to 140px; the condensed proportions and thin weight make the type feel like an etched caption on a botanical print rather than a SaaS headline
- **Substitute:** GT Sectra Display, Migra Display, editorial condensed serifs
- **Weights:** 300
- **Sizes:** 120px, 140px
- **Line height:** 0.86–0.90
- **Letter spacing:** -0.01em (≈ -1.2 to -1.4px at display sizes)

### Suisse Intl — Universal workhorse — nav, body, buttons, badges, cards, footer, and all subheading levels from 14px caption up to 40px section headings; weight 400 for body, 700 for nav labels and emphasis
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 400, 700
- **Sizes:** 14px, 16px, 18px, 21px, 22px, 28px, 40px
- **Line height:** 1.24–1.45
- **Letter spacing:** -0.009em to -0.01em across all sizes (≈ -0.13 to -0.4px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.45 | -0.13px |
| body-sm | — | — | 16px | 1.45 | -0.14px |
| body | — | — | 18px | 1.35 | -0.18px |
| heading-sm | — | — | 22px | 1.35 | -0.22px |
| subheading | — | — | 28px | 1.25 | -0.28px |
| heading | — | — | 40px | 1.24 | -0.4px |
| display | — | — | 120px | 0.9 | -1.2px |
| display-xl | — | — | 140px | 0.86 | -1.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **all:** 5px
- **cards:** 5px
- **badges:** 5px
- **inputs:** 5px
- **buttons:** 5px

## Components

### Outlined Action Button
**Role:** Primary CTA across the site

Ghost/outlined variant — 1px solid oxblood (#370808) border, vellum (#fff9eb) background, oxblood text, 5px radius, 16px vertical × 20px horizontal padding. Suisse Intl 16px weight 400. The outlined treatment is the dominant button style; filled buttons appear only 1× in the data.

### Filled Linen Button
**Role:** Secondary or default state button

Linen (#f0e7d7) fill, 1px oxblood border, 5px radius, 16px × 20px padding, 16px Suisse Intl 400. Reads as a paper-on-paper button — no shadow, no gradient.

### Ghost Text Button
**Role:** Tertiary / nav-style action

No background, no border, 16px Suisse Intl 400 in oxblood or ink, 5px radius (invisible), used inline with body copy.

### Oxblood-Bordered Card
**Role:** Content card for features, recipes, or product highlights

Vellum (#fff9eb) fill, 1px solid oxblood (#370808) border, 5px radius, 20px padding. No drop shadow. Optional buttered-gold (#f8e47d) accent strip on the top edge in some variants. Cards stack on the vellum canvas with only the border distinguishing them — the page already feels layered because of the warm cream.

### Linen Elevated Card
**Role:** Variant card for warmer emphasis

Linen (#f0e7d7) fill, 1px oxblood border, 5px radius, 20px padding. Used when a card needs to step forward from the vellum canvas without darkening.

### Pill-Tag Badge (5px)
**Role:** Category labels, ingredient tags, status pills

Vellum or transparent background, 1px oxblood border, 5px radius (not pill-shaped despite the name — the radius is shared with everything), 4px × 12px padding, 14px Suisse Intl 400 oxblood text. Tight horizontal pill with squared-ish corners.

### Buttered-Gold Fill Badge
**Role:** Highlight or featured-state badge

Buttered-gold (#f8e47d) fill, oxblood text, 5px radius, 4px × 12px padding, 14px weight 700. The rare chromatic badge variant — appears as a warm punctuation mark against the otherwise monochrome UI.

### Nav Link
**Role:** Primary site navigation

Transparent background, 1px oxblood bottom border (308 occurrences — the defining nav treatment), 16–18px Suisse Intl 400 ink text. The bottom border IS the active-state indicator; no background fill change on hover.

### Full-Bleed Image Plate
**Role:** Section dividers, ingredient photography, hero backgrounds

Edge-to-edge macro photograph with no border, no radius (sharp corners even at viewport edges), vellum caption overlay. The photograph itself carries the section — no frame, no rounded corner, no shadow. The image bleeds fully into the next cream section.

### Image Caption Overlay
**Role:** Inline labels on full-bleed photography

Suisse Intl 14–18px weight 400 in vellum, placed on top of photography with generous padding. A thin oxblood em-dash or divider line separates caption fragments (e.g. 'From butter — to palm oil'). The caption is the only typography sitting on the photograph.

### Footer Block
**Role:** Site footer with links and legal

Linen (#f0e7d7) or vellum background, 1px oxblood top border, 36px padding, two- or three-column link grid with 20px row gaps. Footer text in 14–16px Suisse Intl 400 ink or warm graphite.

### Section Divider
**Role:** Between editorial sections

No visible line — sections flow into each other on the same vellum canvas. The 80px vertical gap is the only divider.

## Do's and Don'ts

### Do
- Use 5px border-radius for every interactive element — buttons, cards, badges, inputs. Do not introduce pills, fully rounded corners, or any other radius value.
- Use 1px solid #370808 (Oxblood) as the default border on cards, buttons, and nav. The border is the elevation system; never pair it with a drop shadow.
- Pair Roslindale Display Condensed 300 at 120–140px with line-height 0.86–0.90 for hero display only. Do not use it for subheadings, body, or UI chrome.
- Use Suisse Intl at weight 400 for body (18–21px) and weight 700 for nav, badges, and emphasis. Keep letter-spacing between -0.009em and -0.01em across all sizes.
- Build sections on #fff9eb (Vellum) as the base canvas; use #f0e7d7 (Linen) only when a card or surface needs a one-step elevation. Never use a card background lighter than the page.
- Treat the macro photograph as a full-bleed section with sharp corners and no frame. Place a 14–18px vellum caption directly on the image — never inside a bordered card overlaid on the photo.
- Let Oxblood (#370808) carry structural weight — borders, outlines, nav rules, and badge text. Avoid using it as a large filled area unless it is a deliberate inverted section.

### Don't
- Do not add drop shadows, blurs, or glow effects. The system expresses depth through 1px borders and 1–2% tonal shifts between Vellum and Linen.
- Do not use rounded corners larger than 5px. No pill buttons, no circular avatars, no 12–16px card radii — those belong to a different design language.
- Do not introduce saturated blue, green, or other chromatic accents outside the cream/oxblood/gold family. The palette is intentionally narrow.
- Do not set Roslindale Display Condensed at body sizes. It is a 120px+ display face; using it at 22–28px collapses its distinctive condensed proportions.
- Do not center the display headline. Display type in this system anchors to the left or sits with a small caption offset — not dead-centered like a SaaS hero.
- Do not add gradients, glassmorphism, or texture overlays to UI surfaces. The cream paper is the texture; layering on top of it breaks the analog feel.
- Do not use filled oxblood buttons as the default CTA. The outlined variant (1px oxblood border, vellum fill) is the system default — a filled oxblood button would compete with the section photography.

## Elevation

Shadows are absent by design. Elevation is expressed entirely through 1px oxblood (#370808) hairlines on the vellum background — borders are the shadow system. Where stacking is needed, a card on vellum uses a single oxblood 1px border; a button on a card adds no additional shadow. The visual depth comes from the 1–2% tonal shift between vellum and linen surfaces, not from blur or offset. The only exception is full-bleed photography, which provides the real sense of depth by replacing flat color with texture.

## Surfaces

- **Vellum Page** (`#fff9eb`) — Dominant canvas — every section, hero, and footer sits on this warm cream paper tone
- **Linen Card** (`#f0e7d7`) — Elevated card surface, button fill, and secondary background — the one step warmer than vellum for subtle layering
- **Buttered Gold Wash** (`#f8e47d`) — Tonal accent surface and badge fill — used very sparingly for warmth punctuation
- **Warm Graphite** (`#4d4b47`) — Dark muted surface for inverted sections or dense metadata blocks
- **Oxblood Inset** (`#370808`) — Deepest brand surface — reserved for inverted footers or hero overlays where the wine tone needs to feel solid, not just a line

## Imagery

Macro photography is the design system. Every section is either a full-bleed photograph of an ingredient at extreme close-up — oils, fats, butter, palm — or a calm cream canvas with a single small caption. The photographs have warm amber/gold tones, natural light, and no human subjects. Images are sharp-cornered and edge-to-edge, never framed, never rounded, never inside a card. There are no illustrations, no product mockups, no abstract graphics, no icons in the traditional sense — the ingredient itself is the visual. Photography density is high: roughly one full-bleed image per editorial section, with the text acting as a caption to the photograph rather than the other way around.

## Layout

Full-bleed editorial layout with no fixed max-width. Sections flow vertically as alternating bands of full-bleed photography and quiet cream text blocks. The hero is a display headline (Roslindale 120–140px) on vellum, followed by a full-bleed macro photograph with a small left-aligned caption. Section rhythm is spacious: 80px between sections, with photography sections feeling like page turns. Content is left-aligned, not centered, and the display headline sets the left margin that body text follows. Navigation is a single thin top bar with a 1px oxblood bottom rule — no sticky mega-menu, no sidebar. Two-column layouts (text + image) appear in mid-page sections, but the overall impression is vertical and cinematic rather than grid-dense.

## Similar Brands

- **Brightland** — Same warm cream canvas with full-bleed ingredient photography and a single deep accent — though Brightland leans black instead of oxblood
- **Graza** — Same food-ingredient brand tone with bold condensed display type and a restrained cream + dark accent palette
- **Omsom** — Editorial CPG layout language: oversized serif/sans display contrast, generous cream space, and macro ingredient imagery as the primary visual
- **Aesop** — Same warm-paper editorial restraint with hairline 1px borders replacing shadows and a near-monochrome warm palette
- **Farmacy** — Same botanical-archive aesthetic with left-aligned display type, cream backgrounds, and ingredient-as-specimen photography
