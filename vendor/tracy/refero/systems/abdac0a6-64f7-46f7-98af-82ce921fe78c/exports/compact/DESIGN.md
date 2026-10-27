# Gt-america — Style Reference
> type foundry press sheet

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

GT-America is a type specimen for its own typeface — a site that treats the letterform as the primary interface. The canvas is pure white; the navigation is a single line of black micro-type. The whole page is structured around display-size typography (up to 900px) that swallows the viewport, with the brand's signature duotone — electric blue (#0000ff) and hot orange-red (#ff3500) — used to create product illustrations, test strips, and section dividers. Everything else (spacing, components, shadows) is suppressed in favor of the type. Components are functional minimums: pill buttons, hairline inputs, no card elevation. The system feels like a type foundry press sheet printed on white stock — the letters are loud, the chrome is invisible.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Cobalt | `#0000ff` | Primary brand color — display headings, section rules, outlined action borders, form field borders, large-type stamps. The dominant chromatic voice on the page, used wherever the brand needs to announce itself |
| Press Orange | `#ff3500` | Secondary brand color — the duotone partner to Electric Cobalt, used in the product mockup illustrations and as a filled action accent. Reads as warm against the cool blue, creating a two-color print-poster tension |
| Stock White | `#ffffff` | Page background, card surfaces, input fills, text on dark/colored fills. The entire canvas — there is no off-white or gray alternative |
| Press Black | `#000000` | Navigation text, footer text, fine metadata labels, small caps, SVG fill in the specimen imagery. Used sparingly — only for utility type under ~16px where the massive display type doesn't dominate |

## Typography

### GT America Intl — Primary typeface for everything — display, headings, body, nav, buttons, inputs. The signature choice: a single weight (400) scaled across an enormous range (12px to 900px). The site refuses to use bold/black weights; visual weight comes purely from size. Tight tracking (-0.04em) at large sizes creates headline compression; positive tracking (0.03em) at small sizes aids legibility for micro-labels
- **Substitute:** Inter, Helvetica Neue, Arial
- **Weights:** 400
- **Sizes:** 12, 14, 16, 18, 21, 22, 24, 32, 36, 39, 54, 58, 60, 65, 79, 88, 101, 108, 115, 130, 135, 144, 158, 171, 230, 287, 338, 346, 900
- **Line height:** 0.74–1.60 (tight 0.74–0.95 for display, relaxed 1.35–1.60 for body)
- **Letter spacing:** -4px at 900px, -0.5px at 20px, 0.42px at 14px (scales linearly: -0.04em for display >60px, -0.025em for 24-60px, 0 for body, 0.03em for micro)
- **OpenType features:** `"kern", "ss03" for body; "kern", "onum", "pnum" for prose; "kern", "ss01", "ss02", "ss03", "ss04", "ss05" for display specimens`

### GT America Intl Mono — Monospaced companion — used for specimen data tables, test strips showing character sets, and technical metadata. Wider tracking (0.06em) at display sizes to compensate for mono's denser rhythm
- **Substitute:** JetBrains Mono, IBM Plex Mono, Roboto Mono
- **Weights:** 400
- **Sizes:** 12, 18, 60, 65, 101, 255, 338, 346
- **Line height:** 0.95–1.35
- **Letter spacing:** 0.02em at small sizes, 0.06em at display sizes
- **OpenType features:** `"kern", "ss03"`

### GT America Japanese — GT America Japanese — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px, 32px, 65px, 108px, 130px, 900px
- **Line height:** 0.8, 1.11, 1.22, 1.5
- **OpenType features:** `"kern", "ss03"`

### GT America Thai Looped — GT America Thai Looped — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px, 36px, 101px, 108px, 115px, 346px
- **Line height:** 0.8, 1, 1.11, 1.2, 1.45
- **Letter spacing:** -0.025
- **OpenType features:** `"kern", "ss03"`

### GT America Thai Loopless — GT America Thai Loopless — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px, 108px, 121px, 346px
- **Line height:** 0.8, 1.1, 1.2
- **Letter spacing:** -0.025
- **OpenType features:** `"kern", "ss03"`

### GT America Contrast — GT America Contrast — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px, 195px
- **Line height:** 1
- **OpenType features:** `"kern", "ss03"`

### GT America TradChinese — GT America TradChinese — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 32px, 108px, 130px
- **Line height:** 0.8, 1.11, 1.22
- **OpenType features:** `"kern", "ss03"`

### GT America Intl Italic — GT America Intl Italic — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 32px, 86px
- **Line height:** 1
- **OpenType features:** `"kern", "ss03"`

### GT America SimpChinese — GT America SimpChinese — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 65px, 108px
- **Line height:** 0.8, 1.11
- **OpenType features:** `"kern", "ss03"`

### GT America Intl Latin Subset — GT America Intl Latin Subset — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.17
- **Letter spacing:** 0.03
- **OpenType features:** `"kern", "ss03"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.17 | 0.42px |
| body-sm | — | — | 14px | 1.45 | 0.42px |
| body | — | — | 16px | 1.5 | 0.08px |
| body-lg | — | — | 18px | 1.6 | 0.09px |
| subheading | — | — | 22px | 1.22 | -0.55px |
| heading-sm | — | — | 32px | 1.15 | -0.8px |
| heading | — | — | 54px | 1.11 | -1.35px |
| heading-lg | — | — | 88px | 1 | -2.2px |
| display | — | — | 346px | 0.8 | -13.84px |
| display-xl | — | — | 900px | 0.74 | -36px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 96px
- **Card padding:** 12px
- **Element gap:** 12-18px

### Border Radius

- **cards:** 0px
- **images:** 0px
- **inputs:** 9999px
- **buttons:** 9999px

## Components

### Pill Button — Filled
**Role:** Primary action (e.g. Buy, Download)

Pill shape at 9999px radius, Press Orange (#ff3500) fill, white text at 12-14px GT America Intl weight 400 with 0.03em tracking. Padding 12px 18px. No border, no shadow. The filled chromatic action is the only 'loud' button in the system — everything else recedes

### Pill Button — Outlined
**Role:** Secondary action

Pill shape at 9999px radius, transparent fill, 1px Electric Cobalt (#0000ff) border, Electric Cobalt text. Same 12-14px size and 12px 18px padding. Used for secondary CTAs that shouldn't compete with the filled orange button

### Pill Input
**Role:** Text input field

9999px radius, white fill, 1px Electric Cobalt (#0000ff) border, black placeholder text at 12-14px. Padding 12px 18px. No focus ring — the border color stays constant. The cobalt border is the only visual treatment

### Display Heading
**Role:** Page-level type specimen hero

GT America Intl at 338-900px, weight 400, line-height 0.74-0.80, letter-spacing -0.04em. Color alternates between Electric Cobalt and Press Orange depending on section. Renders as the dominant visual element, often bleeding to the edges of the viewport

### Specimen Table
**Role:** Character set / weight display grid

White background, no visible borders or dividers between cells. GT America Intl Mono at 18-65px showing character variants. Clean rows separated only by whitespace. No zebra striping, no card chrome — the type samples are the content

### Product Mockup Collage
**Role:** Brand illustration / lifestyle specimen

Overlapping product package illustrations (candy boxes, popcorn bags, hot dog wrappers) rendered in the two-color duotone palette: Press Orange (#ff3500) fills and line work on Electric Cobalt (#0000ff) backgrounds, with white type stamped on top. Sharp 0px corners. Arranged as a dense pile, edge-to-edge, filling the viewport width

### Top Navigation Bar
**Role:** Site-wide navigation

Single line, white background, no border or shadow. Left: brand mark 'GT America Intl' in GT America Intl 12-14px black with 0.03em tracking. Right: utility links (e.g. 'Type Tester') in same micro-style. Padding 12px 18px. Sticky to viewport top

### Footer Link Stack
**Role:** Site footer metadata

White background, no background card. Links grouped under small-caps-style labels (Credits, Languages, Design, Information, Trials, Buy) in GT America Intl 12px black. Labels preceded by a small dot marker. No dividers, no grid lines — pure typographic list

### Language/Region Badge
**Role:** Specimen selector (script/language variant)

Text-only label, no background or border. GT America Intl 12-14px black with 0.03em tracking. Used in a row to list available language subsets (Japanese, Thai Looped, Thai Loopless, Traditional Chinese, etc.). No pill shape — just typographic items separated by spaces

### Section Divider
**Role:** Visual break between specimen sections

Either a full-width band of solid Electric Cobalt (#0000ff) or Press Orange (#ff3500) with large display type in white, or simply a generous 96px vertical whitespace gap. No rules, no hairlines

## Do's and Don'ts

### Do
- Use GT America Intl at weight 400 only — the system refuses bold/black; visual weight comes from size alone
- Scale display type to 338px, 346px, or 900px for section heroes; the extreme size IS the design
- Apply -0.04em letter-spacing to any display type above 60px; apply 0.03em tracking to micro-labels below 14px
- Use Electric Cobalt (#0000ff) and Press Orange (#ff3500) as a strict duotone — never introduce a third chromatic color
- Set all buttons and inputs to 9999px pill radius; keep cards and images at 0px (sharp corners)
- Let display type bleed to the viewport edges — set pageMaxWidth to null; the type specimen is full-bleed
- Use 96px as the canonical section gap; 12px 18px for button padding; 6px as the base spacing unit

### Don't
- Don't introduce bold (600/700) or black (800/900) weights of GT America Intl — weight 400 scaled to extreme size is the signature
- Don't add box-shadows, drop-shadows, or elevation — the system is flat, pressed onto the page like a print sheet
- Don't use neutral grays for backgrounds or borders — the palette is binary: pure white, pure black, plus the two brand colors
- Don't add border-radius to cards or images — only buttons and inputs receive the 9999px pill
- Don't set display type in any color other than Electric Cobalt, Press Orange, or Press Black — never a muted/tinted variant
- Don't use line-height above 1.60 for body or below 0.74 for display — the compression is deliberate
- Don't wrap the page in a max-width container — the type specimen demands edge-to-edge presentation

## Elevation

The system is intentionally flat. The only 'shadow' detected is a white 1px hairline (rgb(255,255,255)) used as a 1px inset border treatment — this is not elevation, it's a print-press registration mark. No drop shadows, no card lift, no modal overlay dim. Surfaces are distinguished by color (white canvas vs cobalt/orange bands) not by depth.

## Surfaces

- **Press White** (`#ffffff`) — Primary page canvas — the paper stock the type is printed on
- **Cobalt Band** (`#0000ff`) — Full-bleed section bands for duotone type announcements; the only 'elevated' surface, and it uses color not depth
- **Press Orange** (`#ff3500`) — Accent band for illustration collages and filled action buttons; the warm counterweight to cobalt

## Imagery

Imagery is exclusively type-driven product mockups — overlapping candy boxes, popcorn bags, hot dog wrappers, and snack packages rendered as flat duotone illustrations in Electric Cobalt and Press Orange. No photography, no 3D renders, no abstract graphics. The illustrations are sharp-cornered (0px radius), edge-to-edge, and arranged as dense piles that fill the viewport. Typography itself functions as imagery: the 338-900px display headings are the hero images, not photographs. Iconography is minimal — small black dots and arrows used as list markers and navigation cues. The entire visual language is the type specimen; everything else is in service of demonstrating the letterforms.

## Layout

Full-bleed layout with no max-width container. The page is a vertical scroll through type specimens, each section structured around a single massive display heading (338-900px) that bleeds to viewport edges. Sections alternate between white-background type announcements (with the heading in cobalt or orange) and full-bleed duotone illustration bands (the product mockup collages). The top navigation is a single sticky line with left-aligned brand mark and right-aligned utility link. The footer is a typographic list — no grid, no columns, just labeled groups of links. The only internal grid is the specimen table, which is a single-column stack of character rows. Vertical rhythm is aggressive: 96px between sections, but the display type often spans the full viewport height, so rhythm is created by type size rather than padding.

## Similar Brands

- **Dinamo (dinamo.org)** — Type foundry site that lets display type at extreme scale (200-400px) dominate the layout with minimal chrome and a duotone accent palette
- **Grilli Type (grillitype.com)** — Specimen site with pure-white canvas, single-weight type as the hero, and pill-shaped UI controls at 9999px radius
- **Klim Type Foundry (klim.co.nz)** — Full-bleed type specimen with massive display headings bleeding to viewport edges and flat zero-elevation surfaces
- **Production Type (productiontype.com)** — Type foundry presentation using tight letter-spacing at large display sizes and a two-color brand palette on white
- **Commercial Type (commercialtype.com)** — Editorial-style specimen layout with oversized type as the primary visual, sharp corners, and pill navigation elements
