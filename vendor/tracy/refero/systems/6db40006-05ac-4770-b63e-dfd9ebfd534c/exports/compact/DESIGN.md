# Angellist — Style Reference
> Editorial annual on matte paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Angellist's 2024 Year in Review reads as a printed editorial annual repurposed for the web — enormous display type set in a custom sans, a single chromatic accent, and surfaces that breathe. The system runs light: warm off-white canvases carry deep teal ink, while a soft lavender punctuates highlights, badges, and the signature gradient that floods the hero headlines. Everything rounds to a pill (9999px) — buttons, tags, nav anchors, even section labels — which makes the monumental type feel approachable rather than imposing. The result is confident, restrained, and slightly literary: an annual report, not a product page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Inkwell Teal | `#001d21` | Primary text, heading fill, hero background, card backgrounds for high-contrast panels |
| Vellum Lavender | `#bdbbff` | Signature accent — highlight washes behind text, section badges, decorative strokes, the right-hand terminus of display gradients |
| Sage Mist | `#ccd5d6` | Dominant canvas background, hairline borders, dividers |
| Paper White | `#ffffff` | Card surfaces, image panels, inverse text on dark |
| Bone | `#f9f9f7` | Warm off-white alt surface, muted body text on dark backgrounds |
| Driftwood | `#eaebea` | Subtle banded sections, tertiary surface layer |
| Slate Veil | `#647577` | Mid-gray supporting text, muted UI labels |
| Pewter Deep | `#43585a` | Dark banded section fills, layered surface |
| Gunmetal | `#213a3d` | Even darker banded fills, image overlay scrim base |
| Patina | `#002b31` | Deepest teal — link backgrounds, footer anchors |
| Frost | `#a7b0b1` | Cool mid-gray surface accent |
| Pebble | `#859394` | Muted surface layer for stacked color bands |
| Mist | `#b2bfc1` | Secondary border tone |
| Olive Violet Wash | `linear-gradient(98.78deg, rgb(127, 120, 51) 6.69%, rgb(137, 142, 229) 40.89%, rgb(137, 142, 229) 83.02%, rgb(134, 123, 54) 100.19%)` | Display type gradient — mid-stop of the olive→violet hero fill |

## Typography

### angellistDisplay — Display headlines — the brand's signature voice. Used from 28px section openers up to 288px hero type. Single weight (400) carries the system; size alone does the shouting. Tabular lining numerals and three stylistic sets (ss01–ss03) make this a purpose-built editorial face, not a system font fallback.
- **Substitute:** Inter Tight, Söhne Breit, or Suisse Int'l
- **Weights:** 400
- **Sizes:** 28px, 38px, 60px, 80px, 144px, 260px, 288px
- **Line height:** 0.75, 0.80, 1.00, 1.05, 1.10, 1.15, 1.25, 1.30
- **Letter spacing:** -0.025em at 80px+ to -0.01em at 28px — tracking tightens as size grows
- **OpenType features:** `"lnum" on, "tnum" on, "ss01" on, "ss02" on, "ss03" on`

### angellist — Body, UI, and supporting type. 400 for body copy, 500/550 for labels, nav, and button text. The 550 weight is a half-step — a quiet way to add emphasis without bolding. Same stylistic sets as the display face keep the two families visually stitched together.
- **Substitute:** Inter, Söhne, or Suisse Int'l
- **Weights:** 400, 500, 550
- **Sizes:** 13px, 14px, 16px, 18px, 20px, 144px
- **Line height:** 0.80, 1.00, 1.40, 1.50, 1.60
- **Letter spacing:** -0.004em at 16–20px, -0.002em at 13–14px, tightening to -0.05em only on micro-labels
- **OpenType features:** `"lnum" on, "tnum" on, "ss01" on, "ss02" on, "ss03" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | -0.002px |
| body | — | — | 16px | 1.5 | -0.004px |
| body-lg | — | — | 18px | 1.6 | -0.004px |
| subheading | — | — | 20px | 1.4 | -0.004px |
| heading-sm | — | — | 28px | 1.25 | -0.01px |
| heading-lg | — | — | 60px | 1.1 | -0.02px |
| display | — | — | 80px | 1.05 | -0.025px |
| display-lg | — | — | 144px | 1 | -0.025px |
| display-xl | — | — | 260px | 0.8 | -0.025px |
| display-2xl | — | — | 288px | 0.75 | -0.025px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80-96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 9999px
- **links:** 2px
- **buttons:** 9999px

## Components

### Pill Button — Filled
**Role:** Primary action control

9999px radius. 4px vertical / 10–12px horizontal padding. Body weight 500 at 14–16px, letter-spacing -0.004em. Filled with Inkwell Teal (#001d21), text Paper White. No border. The pill shape is the signature — never square it.

### Pill Button — Ghost / Outlined
**Role:** Secondary action on dark backgrounds

9999px radius. 1px Paper White border, transparent fill, Paper White text. Same internal padding as filled variant. Used for the nav 'JOIN US' CTA on the dark bar.

### Section Badge
**Role:** Eyebrow label above section headings

9999px radius. Vellum Lavender (#bdbbff) fill, Inkwell Teal text. Body weight 500 at 13–14px. Padding 4px top/bottom, 10px sides. Functions as a soft category tag, e.g. '2024 BUILD'.

### Navigation Bar
**Role:** Top-level site navigation

Full-width, Inkwell Teal (#001d21) background. Logo wordmark left in Paper White, nav links centered in Paper White at 14px/500, ghost pill CTA right. No drop shadow — flat against the dark.

### Display Headline — Hero
**Role:** Page-level monumental type

angellistDisplay 400 at 144–288px. Line-height 0.75–0.80 (negative leading — letters almost touch). Letter-spacing -0.025em. Fill is the Olive→Violet linear-gradient. Mixed weight variants of characters sit in the same line, creating a duotone letterform effect within a single word.

### Display Headline — Section
**Role:** Sub-hero section opener

angellistDisplay 400 at 60–80px on white, Inkwell Teal fill. Line-height 1.05–1.10. Letter-spacing -0.02em. Often paired with a lavender text-highlight on a key phrase.

### Text Highlight
**Role:** Inline emphasis on a phrase within a heading

Vellum Lavender (#bdbbff) rectangle behind one or two words of a heading. Crisp 2px corners, no padding adjustment — it sits flush behind the text baseline. Inkwell Teal text remains on top, contrast is still AAA.

### Feature Image Card
**Role:** Three-up content card with overlay text

Three equal cards in a row, 9999px radius. Each is a full-bleed image (or solid color block in Vellum Lavender, Inkwell Teal) with Paper White body text bottom-left, 16px, weight 400. No card shadow — the image IS the card.

### Horizontal Band Stack
**Role:** Full-bleed section divider / color catalogue

Stacked full-width horizontal bands in the surface palette (Sage Mist → Driftwood → Frost → Pewter Deep → Gunmetal → Inkwell Teal). Each band 40–60px tall. No gaps, no text — pure color rhythm. Functions as a typological signature between major content sections.

### Two-Column Split Section
**Role:** Heading-left, body-right editorial layout

60/40 split. Large display heading (heading-lg / display) left-aligned on left, body copy at 18px/1.6 right-aligned on right. Vertically centered. Sage Mist background, no card containers — text floats on canvas.

### Body Paragraph
**Role:** Running text

angellist 400 at 18px, line-height 1.6, letter-spacing -0.004em. Inkwell Teal on Sage Mist. Max width ~50ch. Never center-aligned.

### Footer Anchor
**Role:** Bottom link/CTA

Pill-shaped link with Patina (#002b31) background, Paper White text. 9999px radius. Same internal padding as nav ghost button.

## Do's and Don'ts

### Do
- Set display type at 60px minimum when it carries meaning — anything smaller undermines the editorial voice.
- Use 9999px radius on every button, tag, badge, and image card. The pill is the shape language.
- Reach for the Olive→Violet linear-gradient only on display headlines. Never on body type, buttons, or backgrounds.
- Pair the Vellum Lavender highlight with Inkwell Teal text — the contrast is 8:1+, never lose it to a lighter background.
- Use the 550 weight of angellist for labels and button text; reserve 500 for inline emphasis. Never use 700+ — the system speaks in one voice.
- Keep body text at 18px on the canonical reading sections. 16px is the floor for UI chrome only.
- Separate major sections with the horizontal band stack — let the palette breathe as its own composition.

### Don't
- Don't set display type in pure Paper White on dark — the gradient IS the display color, not a fallback.
- Don't introduce a second accent color. The system is monochrome + lavender; any other hue breaks the annual-report register.
- Don't use 2px or 4px radii on interactive elements — those values are reserved for the lavender text highlight only.
- Don't center-align body copy. The system is asymmetric and editorial, left rail first.
- Don't add drop shadows to cards or buttons. Elevation is handled by surface tone shifts (Sage → Paper White → Bone), never by blur.
- Don't break the 9999px pill on the nav CTA, even at desktop scale. The roundedness scales with the layout.
- Don't use the Olive→Violet gradient at body sizes — it reads muddy below 60px.

## Elevation

- **Feature Image Card:** `none — flat, no shadow`
- **Section Badge:** `none — the lavender fill against the canvas is sufficient separation`
- **Pill Button:** `none — relies on fill, no elevation`

## Surfaces

- **Sage Mist** (`#ccd5d6`) — Dominant page canvas and section dividers
- **Paper White** (`#ffffff`) — Card and image panel surfaces
- **Bone** (`#f9f9f7`) — Warm alt-surface for nested content blocks
- **Driftwood** (`#eaebea`) — Tertiary section banding
- **Inkwell Teal** (`#001d21`) — Dark hero and feature-card backgrounds

## Imagery

Imagery is sparse and editorial rather than decorative. The few photographs (e.g. the laptop-on-cushion card) are treated as full-bleed card fills, tightly cropped, and overlaid with Paper White body text. There are no lifestyle contexts, no human subjects, no atmosphere shots — the object or surface is the subject. Color is used in lieu of imagery more often than not: solid Vellum Lavender and Inkwell Teal card panels stand in for photographs, making the layout feel more like a design annual than a product page. Icons are absent from the visible chrome; the wordmark and display type do the brand work alone.

## Layout

The page model is full-bleed for the dark hero and the band-stack dividers, then constrained to a ~1280px max-width content rail for the editorial sections. Hero: full-viewport-width dark teal field with monumental display type that bleeds past the edges — no centered headline, no subtitle lockup, just type and a single body subline. Sections alternate: dark hero → white editorial block → three-up image cards → full-bleed color band stack → next section. The editorial blocks use a 60/40 two-column split (heading left, body right) and generous 80–96px vertical padding. Navigation is a minimal top bar (logo left, links center, pill CTA right) on the dark hero. The rhythm is: dramatic opening, quiet reading sections, visual card break, more quiet reading — like turning pages in a print annual.

## Similar Brands

- **Stripe Press** — Same annual-report editorial register, monumental display type on dark, single accent color, pill-shaped controls, and a near-achromatic chrome
- **Linear** — Light, clean SaaS surface treatment with pill-shaped buttons, restrained palette, and oversized display type — though Angellist's hero is more typographic and less product-photography-driven
- **Figma Config** — Editorial microsite language: massive custom display type, flat color band section dividers, restrained palette letting type carry the brand
- **Notion Year in Review** — Annual-report format with large display headlines, soft pastel accents on a near-white canvas, and a deliberately un-corporate editorial feel
- **Arc browser** — Pill-shaped nav and CTAs, warm off-white canvas, oversized display headings, and the same kind of confident type-led hierarchy
