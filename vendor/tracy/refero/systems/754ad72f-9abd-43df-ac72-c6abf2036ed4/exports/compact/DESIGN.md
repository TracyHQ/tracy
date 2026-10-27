# Viewport — Style Reference
> Mint sticky-notes on a glass desk. A clean productivity canvas where one vivid indigo button is the only thing that 'switches on' against pale teal surfaces and white walls.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Viewport uses a bright, airy workspace language: pure white canvas, generous breathing room, and a signature mint-teal surface that softens sections without darkening them. The entire chromatic story is a tight two-color duo — vivid indigo for actions and mint-teal for surfaces — connected by a cyan-to-violet gradient that lives only on the primary CTA. Typography is calm and geometric: HK Sentiments Bold for headlines at a whisper-heavy 700 weight, Silka for everything functional at 14–18px, tracking pulled tight across the scale. Components feel like smooth tiles: large 16px radii on cards, 12px on buttons, 100px pills for tags, and shadows that are either barely-there gray or a branded cyan glow — never neutral mid-tones. Layouts center a single headline per section, then let wide product screenshots do the work, often floating over the mint surface like sticky notes on a glass desk.

## Colors

| Name | Value | Role |
|------|-------|------|
| Indigo Voltage | `linear-gradient(0deg, rgb(0,202,242) 0%, rgb(77,77,255) 100%)` | Primary action buttons, active nav states, accent borders, heading highlights — the sole chromatic brand color, making every interactive element unmistakable; Primary CTA button fill — the only gradient in the system, flowing from cyan to indigo vertically |
| Mint Whisper | `radial-gradient(102% 82% at 50% 107.7%, rgba(0,202,242,0.3) 0%, rgb(241,243,245) 100%)` | Signature section surface — replaces gray for feature panels, product wrappers, and comparison cards; a soft teal that reads as a colored canvas rather than a colored card; Radial hero wash — cyan blooming into neutral gray for ambient atmosphere on showcase sections |
| Cyan Pulse | `#00caf2` | Gradient origin point and link glow shadow; appears only inside the cyan→indigo button gradient and the radial brand wash |
| Cyan Mist | `#66dff7` | Soft cyan used as a link-focus glow ring; bridges Mint Whisper and the gradient endpoints |
| Ink Black | `#000000` | Primary text, icons, hairline borders, and image outlines — used at high frequency for structural edges rather than fills |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on indigo fills |
| Fog Veil | `#f8f9fa` | Secondary card and section surface — the next step up from pure white before reaching Mint Whisper |
| Ash Border | `#c8c9cf` | Muted borders and dividers; structural edges that need to be visible but never assertive |
| Graphite Depth | `#333333` | Deep accent for headings and section frames where pure black would feel too sharp |
| Steel Caption | `#7f8087` | Body helper text, link base color, icon fills, and secondary metadata — the de facto mid-neutral for prose |
| Haze Card | `#e3e6ec` | Tertiary card surface for grouped content blocks and inner panels |

## Typography

### Silka SemiBold — Silka SemiBold — detected in extracted data but not described by AI
- **Weights:** 400, 600, 700
- **Sizes:** 14px, 16px
- **Line height:** 1, 1.2, 1.4
- **Letter spacing:** -0.036

### HK Sentiments — Display and section headings — a bold serif-adjacent sans that carries the voice of headlines, tightened by negative tracking
- **Substitute:** Manrope
- **Weights:** 700
- **Sizes:** 24px, 28px, 32px
- **Line height:** 1.10-1.20
- **Letter spacing:** -0.018em at 32px, -0.017em at 28px, -0.006em at 24px

### Silka — All UI text, body copy, button labels, and inline links — a neutral geometric sans for the functional layer
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1.00-1.40
- **Letter spacing:** -0.036em to 0.010em depending on weight

### Silka Italic — Accent italic for emphasized phrases inside body copy
- **Substitute:** Inter Italic
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.20
- **Letter spacing:** 0.010em

### system-ui sans-serif — Micro UI text — tag labels, fine print, timestamp-style metadata
- **Substitute:** system-ui
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20

### Silka Regular — Silka Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1, 1.2
- **Letter spacing:** 0.01

### Silka Medium Italic — Silka Medium Italic — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.2
- **Letter spacing:** 0.01

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.2 | -0.144px |
| body | — | — | 16px | 1.3 | -0.176px |
| subheading | — | — | 18px | 1.2 | -0.198px |
| heading-sm | — | — | 24px | 1.2 | -0.144px |
| heading | — | — | 28px | 1.2 | -0.476px |
| display | — | — | 32px | 1.1 | -0.576px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 100px
- **cards:** 16px
- **inputs:** 8px
- **buttons:** 12px
- **featureFrames:** 20px

## Components

### Gradient Primary Button
**Role:** Hero CTA — the one and only filled action

Vertical cyan-to-indigo gradient (rgb(0,202,242) → rgb(77,77,255)), white text in Silka Medium 16px, 12px corner radius, padding 12px 24px, no border, subtle drop shadow rgba(0,0,0,0.25) 0 8px 16px. This is the brand's loudest element and should appear once per section at most.

### Outlined Sign-In Button
**Role:** Secondary nav action

Transparent fill, 1px solid #000000 border, 12px radius, Silka Medium 14px in #000000, padding 8px 16px. Sits in the top nav next to the gradient CTA.

### Section Tag Pill
**Role:** Eyebrow label above section headings

100px pill radius, #e3e6ec background, uppercase Silka SemiBold 12px in #4d4dff, padding 6px 14px. Marks the topic of the next section in a soft chip.

### Before/After Comparison Card
**Role:** Hero dual-card showing the product's value

Two side-by-side cards with 16px radius, 24px padding, #f8f9fa background. Each contains a screenshot frame with a small circular status badge centered above (red #ff4d4d X or indigo #4d4dff check), plus a short caption in Silka Regular 14px #333333.

### Mint Feature Panel
**Role:** Full-width product showcase wrapper

Full-bleed #c5fbee background, generous 64px vertical padding, centered product screenshot framed inside a white card with 16px radius and a soft drop shadow. The mint surface replaces the typical gray section.

### Product Screenshot Frame
**Role:** Inset preview of the product UI

White card, 16px radius, 1px hairline border in #c8c9cf, inner padding 0 (image bleeds to edges), drop shadow rgba(0,0,0,0.1) 0 15px 20px -5px. Always centered inside a Mint Feature Panel.

### Brand Showcase Carousel Card
**Role:** Full-bleed brand design samples

Wide card with multi-image grid inside, 20px radius, layered over a cyan radial wash background. Contains labeled sub-panels in white with their own 12px radius and small captions.

### Status Icon Badge
**Role:** Tiny circular indicator above cards

40px circle, solid fill in #4d4dff (positive) or warm red (negative), white icon centered, drops with 8px gap above the card. Sits like a sticker.

### Top Navigation Bar
**Role:** Site-wide header

White background, no border, 64px height, flex row with logo left, links centered in Silka Medium 14px #333333, CTA pair right-aligned. Sticky behavior assumed for long pages.

### Footer Link Group
**Role:** Bottom-of-page navigation

Stacked Silka Regular 14px links in #7f8087 with 10px row gap, 24px column gap between groups. Group headings in Silka SemiBold 12px uppercase in #333333.

### Section Heading Block
**Role:** Title + subtitle pair above a feature

Centered stack: HK Sentiments Bold 28-32px in #000000 with -0.476 to -0.576px letter-spacing, optional one-line subtitle in Silka Regular 18px #7f8087. Vertical rhythm 16px between lines.

### Ghost Link
**Role:** Inline text link

Silka Regular 14px in #7f8087, 1px dotted underline in #7f8087, hover state adds the cyan glow ring rgba(0,202,242,0.6) 0 4px 12px around the text.

## Do's and Don'ts

### Do
- Use the cyan→indigo vertical gradient (rgb(0,202,242) → rgb(77,77,255)) only on the single highest-priority CTA per section; never apply it to cards, nav, or secondary buttons
- Reserve #c5fbee Mint Whisper for full-bleed feature panels behind product screenshots; never use it as a small accent or badge fill
- Set hero and section headings in HK Sentiments Bold 28–32px with -0.476 to -0.576px letter-spacing to lock in the tight, geometric voice
- Apply 16px radius to all cards, 12px to all buttons, and 100px to all tags and pills — these three radii define the system
- Use 1px solid #000000 or #c8c9cf for hairline borders; never reach for thicker decorative borders
- Center every section's heading block (tag pill + title + optional subtitle) and let product screenshots do the visual work below it
- Pull Silka tracking to -0.036em on SemiBold 14–16px to match the extracted micro-tightening at UI sizes

### Don't
- Don't introduce new saturated colors — the chromatic system is exactly two: indigo #4d4dff and mint #c5fbee, connected by cyan in the gradient
- Don't use #c5fbee on a white card as a hover state or chip fill; it is a surface-level treatment, not a foreground accent
- Don't apply shadows to text, nav, or tags; elevation belongs only on product frames, comparison cards, and the gradient CTA
- Don't switch to a serif or display script for headings — HK Sentiments Bold 700 is the only display voice, and tracking stays negative at every size
- Don't stack multiple feature blocks per section; one headline, one product frame, one breath of space is the rhythm
- Don't use dark mode patterns — the canvas is always #ffffff or #f8f9fa, never a near-black surface
- Don't substitute the cyan→indigo gradient with a flat #4d4dff fill on the hero CTA; the gradient is what makes the primary action feel 'switched on'

## Elevation

- **Comparison cards and feature panels:** `rgba(0, 0, 0, 0.1) 0px 15px 20px -5px`
- **Showcase frames and elevated tiles:** `rgba(0, 0, 0, 0.25) 0px 8px 16px 0px`
- **Cyan link glow:** `rgba(0, 202, 242, 0.6) 0px 4px 12px 0px`

## Surfaces

- **Paper White Canvas** (`#ffffff`) — Default page background
- **Fog Veil** (`#f8f9fa`) — Section separators and quiet content blocks
- **Haze Card** (`#e3e6ec`) — Tertiary grouped panels
- **Mint Whisper** (`#c5fbee`) — Signature feature surface and product wrapper

## Imagery

Product screenshots dominate the visual language — real UI captures of the Viewport board, asset library, and brand kit views, not abstract mockups. Screenshots are presented as floating white cards on the mint surface with hairline borders and soft shadows, never with gradients or color overlays applied to them. The only non-product imagery is contained inside the screenshots themselves (design samples in green-teal palettes). No lifestyle photography, no people, no hero illustration — the product IS the hero. Icons are minimal and outlined, using the same #4d4dff or #000000 as surrounding text. Decorative graphics are limited to the cyan radial wash behind the brand showcase carousel.

## Layout

Page is max-width 1200px centered with a fixed top nav. The hero opens as a centered single-column stack: eyebrow-style headline in HK Sentiments Bold 32px, a one-sentence subtitle in Silka Regular 18px #7f8087, then the gradient CTA, then a two-column comparison row with 24px gap. Sections alternate between white canvas and Mint Whisper (#c5fbee) full-bleed bands, separated by 64px vertical padding. Each feature section follows the same pattern: optional tag pill, centered heading block, then a single wide product frame or 2–3 column grid of product previews. Navigation is a minimal sticky top bar — no sidebar, no mega-menu. Content density stays low; each section claims the full viewport-width with generous breathing room rather than packing information side by side.

## Similar Brands

- **Pitch** — Same light-canvas-plus-one-vivid-accent approach with generous section spacing and product-screenshot-led layouts
- **Notion** — Quiet white surfaces, minimal chrome, and product screenshots treated as floating tiles with soft shadows
- **Linear** — Tight typographic scale with negative letter-spacing on bold headings and a single saturated brand color that does the work of a palette
- **Frame.io** — Creative-tool marketing pages that lead with centered hero copy, before/after visual storytelling, and wide product preview frames
