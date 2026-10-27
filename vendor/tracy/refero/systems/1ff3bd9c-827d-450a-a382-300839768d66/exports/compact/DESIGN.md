# Agence K72 — Style Reference
> theater marquee at midnight — a single electric spark cutting through cinematic black

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Agence K72 runs on radical binary minimalism: a near-black photographic void overlaid with white display type, and exactly one chartreuse spark used as precision mark — never decoration. The system is essentially a two-color engine (white-on-black, black-on-white) with #d3fd50 appearing only as stroke or ring, turning that single hue into a loaded gesture. Typography carries the entire identity: a single custom sans-serif stretched to 137px headlines with line-heights compressed to 0.70, making letterforms behave like architecture rather than reading material. Every interactive surface is a fully pill-shaped stadium form, and the French-first voice signals a confident creative agency that treats restraint as posture.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure Black | `#000000` | Page canvas, full-bleed photography backgrounds, nav bar surface |
| Paper White | `#ffffff` | Primary text, navigation borders, pill button borders and labels, icon strokes |
| Iron Gray | `#4d4d4d` | Muted secondary text and low-emphasis nav borders — the only intermediate neutral permitted in the scale |
| Spark Lime | `#d3fd50` | Sole accent — appears exclusively as a hand-drawn stroke or ring marking a single word in a headline; never as fill, never as background |

## Typography

### Lausanne — Exclusive typeface for all UI. Weight 300 for display and large headings to create a whisper-light monumental effect against dark photography; weight 400 for body, buttons, and small UI. The dramatic size range (11px meta text up to 137px display) with matching line-height compression (0.70 at 137px) turns the single family into both signage and paragraph text. Substitute: Inter or Neue Haas Grotesk for closest geometric neutrality.
- **Substitute:** Inter, Neue Haas Grotesk, or Suisse Int'l
- **Weights:** 300, 400
- **Sizes:** 11, 14, 16, 20, 35, 94, 115, 137
- **Line height:** 0.70, 0.75, 0.87, 1.20, 1.30, 1.50
- **Letter spacing:** normal at all sizes — the tight tracking is achieved through compressed line-height, not letter-spacing
- **OpenType features:** `Disabled — no ligatures or tabular numerals in evidence; the type speaks through weight contrast and size jumps alone`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.3 | — |
| body-sm | — | — | 14px | 1.3 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.3 | — |
| heading | — | — | 35px | 1.2 | — |
| heading-lg | — | — | 94px | 0.87 | — |
| display | — | — | 137px | 0.7 | — |

## Spacing & Layout

**Density:** compact

- **Section gap:** 40px
- **Card padding:** 28px
- **Element gap:** 10px

### Border Radius

- **cards:** 0px (no cards in this system — surfaces are full-bleed)
- **buttons:** 9999px (fully pill-shaped stadium)
- **nav-items:** 9999px (fully pill-shaped stadium)

## Components

### Pill Navigation Button
**Role:** Primary navigation link for section entry (e.g. PROJETS, AGENCE)

Fully pill-shaped stadium form with 9999px border-radius, transparent fill, 1px Paper White border, white text in Lausanne 400 at ~20px, ~10px vertical padding and ~28px horizontal padding. Sits in a row at the page bottom with ~3px gap between pills.

### Stadium Hamburger Trigger
**Role:** Menu toggle in the top-right corner

Two short horizontal white lines forming a hamburger glyph, enclosed in the same fully pill-shaped stadium form as nav buttons but smaller, ~20px tall. Paper White stroke on transparent fill.

### Wordmark Logo Lockup
**Role:** Brand identifier in the top-left nav position

"K72" set in Lausanne 400 at ~20px in Paper White. No container, no border — sits flush left with 3px left padding. Minimal, almost vestigial.

### Display Headline Block
**Role:** Hero text dominating the first viewport

Lausanne 300 at 94-137px, Paper White, line-height 0.70-0.87, all caps, no letter-spacing adjustment. The text bleeds across nearly the full viewport width. One word in the block is encircled by a hand-drawn Spark Lime (#d3fd50) stroke ring — this ring is the only accent moment in the entire system.

### Spark Lime Accent Ring
**Role:** Precision mark highlighting a single word within a display headline

An imperfect oval or ring shape drawn in Spark Lime (#d3fd50) at ~2-3px stroke weight, encircling one word. Functions as a visual lasso — it says 'this word is the point' without any other annotation. Never appears as a fill, never on a background, never on body text.

### Body Description Block
**Role:** Small contextual paragraph on the hero and section openers

Right-aligned or bottom-right placement, Lausanne 300-400 at 14-16px, Paper White, line-height 1.30-1.50. The text is unadorned — no background, no border. It floats over the dark photographic canvas. Functions as a quiet counterweight to the massive display headline.

### Location Time Stamp
**Role:** Persistent meta-information showing the agency's local time and city

Bottom-left of the viewport. A small globe icon (Paper White stroke) followed by "MONTREAL_" and a live-updating time in Lausanne 300 at ~11px, Paper White. This component signals 'we are a real studio, right now, in this city' — a humanizing live-data detail.

### Full-Bleed Hero Surface
**Role:** The first viewport and section backgrounds

Edge-to-edge dark photography or video at full viewport size, Pure Black (#000000) as fallback. No overlay, no gradient — the photography carries its own light and the white type sits directly on it.

### Thin Nav Hairline
**Role:** Border separating the nav strip from the content below

1px Paper White (#ffffff) bottom border on the nav element. Not a shadow, not a fill — a single hairline that defines the nav's lower edge against the photographic void below.

## Do's and Don'ts

### Do
- Use #d3fd50 exclusively as a hand-drawn stroke or ring encircling exactly one word in a display headline — never as a fill, background, or border on any element
- Set display headlines in Lausanne 300 at 94-137px with line-height compressed to 0.70-0.87 so letterforms stack and nearly touch across lines
- Render every interactive element (nav links, buttons, menu triggers) as a fully pill-shaped stadium form using 9999px border-radius with a 1px Paper White border and transparent fill
- Let the page background be Pure Black or full-bleed dark photography — never use a card, panel, or elevated surface to group content
- Maintain a binary palette: Paper White text on Pure Black, or Pure Black text on Paper White — #4d4d4d is the only permitted intermediate neutral, used sparingly for muted meta
- Use the single Lausanne family across all sizes from 11px to 137px; let the weight jump (300 vs 400) and the size jump carry all hierarchy
- Place small body copy (14-16px) as a quiet counterweight in the lower-right of a viewport dominated by massive type — the asymmetry is the composition

### Don't
- Do not introduce a second accent color, a gradient, or any chromatic fill — the system is binary plus one spark
- Do not use shadows, glows, blurs, or any multi-layer box-shadow stacks — depth is typographic, not spatial
- Do not use rounded but non-pill radii (8px, 12px, 16px) on any element — either fully pill (9999px) or sharp (0px), nothing between
- Do not set body or button text at 400 weight where a 300 option would be legible — the whisper-light weight at small sizes is the signature
- Do not place display type over a light background — all monumental type lives on Pure Black or dark photography
- Do not add letter-spacing, text-transform justification, or font-feature-settings — the type is raw, all caps where used, tracked normally
- Do not create contained cards, panels, or boxed content groups — content either spans the full viewport or floats freely on the dark surface

## Elevation

Elevation is rejected. The system has no shadows, no glows, no blur stacks. Depth is created exclusively through the contrast between full-bleed dark photography and flat white type, and through the weight contrast of type at different sizes. Elements sit on the same Z-plane — differentiation is typographic and chromatic, not spatial.

## Surfaces

- **Void** (`#000000`) — Full-bleed canvas — either solid black or dark photographic imagery covering the entire viewport
- **Nav Bar** (`#000000`) — Transparent-to-black nav strip at the top of the page, sitting over photography with thin white hairline border

## Imagery

Full-bleed cinematic photography, typically dark and moody, covering the entire viewport as the background for type. Imagery is not illustrated — it is photographed, often showing hands at work, studio environments, or close-cropped production moments. No icons beyond minimal white-stroke glyphs (globe, hamburger lines). No product screenshots, no 3D renders, no abstract graphics. The photography carries its own lighting and the white type sits directly on it without overlays or scrims.

## Similar Brands

- **Locomotive Mtl** — Montreal creative agency with full-bleed dark photography, massive type, and pill-shaped navigation — shares the cinematic-black-canvas + bold-display-type approach
- **Ueno** — Agency site using full-bleed dark imagery with oversized type and minimal color palette — same commitment to one font family stretched across extreme sizes
- **Bureau Cool** — Design studio with near-monochrome palette, single accent mark, and pill-shaped interactive elements on dark photographic backgrounds
- **Pentagram** — Agency portfolio using massive display type on dark imagery with near-zero chromatic palette and precision accent marks
