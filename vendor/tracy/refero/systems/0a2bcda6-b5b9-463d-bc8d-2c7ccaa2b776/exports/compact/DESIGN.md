# Wallpaper Projects — Style Reference
> Editorial gallery on warm paper — a spread from a 12×16 art monograph where cream stock, near-black ink, and one enormous serif do all the talking.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Wallpaper Projects reads like a high-end art book spread printed on warm cream stock: massive editorial serif type (Cardinal Fruit) set against quiet, paper-warm surfaces, with a single near-black ink doing all the work. The palette is rigorously monochrome — no chromatic accents, no decorative gradients, no shadows — letting the photography and the typographic scale do the heavy lifting. Layout is asymmetric and gallery-paced: full-bleed atmospheric heroes give way to split text+image compositions on cream, with generous negative space acting as the primary structural device. Every interactive element is reduced to a dark pill on warm paper, and the entire system whispers 'considered, expensive, restrained' rather than shouting.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#1e1e1e` | Primary text, dark pill button fills, borders, heading strokes — the only ink in the system |
| Paper White | `#ffffff` | Primary canvas, image backgrounds, button text on dark fills |
| Warm Cream | `#fbf9f3` | Alternate surface — the signature cream stock that gives the system its editorial warmth, used for secondary sections and cards |
| Pure Black | `#000000` | Maximum contrast moments, occasional true-black text where #1e1e1 isn't dark enough |

## Typography

### Cardinal Fruit — The signature display serif — exclusively used for hero headlines, section openers, and any moment that needs to feel like a magazine cover. The medium weight (500) is reserved for the most massive treatments (132–180px) where hairline strokes would disappear. Negative letter-spacing tightens the massive forms into a cohesive block of ink.
- **Substitute:** Playfair Display, Tiempos Headline, GT Sectra
- **Weights:** 400, 500
- **Sizes:** 36px, 48px, 132px, 180px
- **Line height:** 1.00–1.24
- **Letter spacing:** -9px at 180px, -6.6px at 132px, -1.2px at 48px, -0.72px at 36px

### Soehne Breit Buch — The workhorse grotesque with widened proportions. At small sizes (10–14px) the 0.1em tracking creates the editorial 'kicker' label aesthetic. At 72–80px it serves as a secondary display face for contexts where serif would feel too precious. The 600 weight is used sparingly for emphasis.
- **Weights:** 400, 600
- **Sizes:** 10px, 12px, 14px, 72px, 80px
- **Line height:** 1.00–1.50
- **Letter spacing:** 1.0px at 10px, 1.2px at 12px, 1.4px at 14px, tighter at larger sizes

### Soehne Mono Buch — Monospaced UI face for technical labels, metadata, button text, and small data displays. Its presence signals 'system metadata' versus 'editorial content' — the mono is the interface voice, the serif is the gallery voice.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Berkeley Mono
- **Weights:** 400
- **Sizes:** 12px, 14px
- **Line height:** 1.00–1.60
- **Letter spacing:** 0.3px at 12px, 0.7px at 14px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 1px |
| body | — | — | 14px | 1.6 | 0px |
| subheading | — | — | 36px | 1.1 | -0.72px |
| heading-sm | — | — | 48px | 1.05 | -1.2px |
| heading | — | — | 72px | 1 | -1.44px |
| display | — | — | 132px | 1 | -6.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1440px
- **Section gap:** 100px
- **Card padding:** 24px
- **Element gap:** 20px

### Border Radius

- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 20px

## Components

### Dark Pill Button (Primary Action)
**Role:** The only button style that matters — the system's single interactive punctuation mark

Filled with #1e1e1, white text in Soehne Mono 12px, 20px border-radius (distinctive squircle-pill, not full pill), 7px top padding + 8px bottom padding + 16px horizontal padding. Tracks tight at 0.3px letter-spacing. Label is always uppercase. No hover state changes color — it just feels like ink on paper.

### Ghost Outline Button
**Role:** Secondary action for less critical interactions

Transparent fill, 1px #1e1e1 border, #1e1e1 text in Soehne Mono 12px, 20px radius, 7-8px vertical padding, 16px horizontal padding. Shares the pill geometry with the dark variant.

### Section Kicker Label
**Role:** Tiny uppercase label that opens every content section like a magazine department header

Soehne Breit Buch 10px, weight 400, #1e1e1, letter-spacing 1.0px (0.1em), uppercase. Sits above headings with 10-12px gap. No punctuation. Examples of the pattern: 'TRANSFORMING SPACES', 'PROJECTS'.

### Editorial Display Headline
**Role:** The hero/cover headline that defines the page

Cardinal Fruit 132-180px, weight 500 at the largest sizes, #1e1e1 or #fbf9f3 (white-cream) when overlaid on photography. Letter-spacing -0.05em at 132-180px. Line-height 1.0 to 1.2. This is the only element allowed to be this large.

### Asymmetric Section Header
**Role:** Left-column header for split text+image sections

Cardinal Fruit 48px weight 500, #1e1e1, letter-spacing -0.025em. Sits above a body text block (Soehne Breit 14px, 1.5 line-height) with 20px gap. No horizontal rule — whitespace is the divider.

### Full-Bleed Hero with Overlay Type
**Role:** The page-opening canvas — atmospheric photography as backdrop, type as subject

Image fills 100vw × ~85vh, no border-radius, type overlays in light cream (#fbf9f3 or white) with a thin vertical divider line and downward arrow in #1e1e1e. No darkening overlay — the type sits on the raw image.

### Two-Column Image Grid
**Role:** Quick visual proof beneath introductory text

Two equal-width images side by side, 12-16px gap between them, zero radius, full-bleed within their column. Images are uncropped architectural/interior photography.

### Split Content Section (Text Left / Image Right)
**Role:** The primary content arrangement for project showcases and about sections

Two-column grid at roughly 40/60 or 35/65 ratio. Left column: kicker label, Cardinal Fruit heading, body text, pill button. Right column: large uncropped photography, zero radius. Background alternates between #ffffff and #fbf9f3. 100px vertical section padding.

### Minimal Navigation Header
**Role:** Persistent top bar — almost invisible by design

Sticky, white or transparent background, #1e1e1 elements. Left: small two-line wordmark logo (Soehne Breit 12-14px, stacked). Right: single hamburger icon. No nav links visible, no background bar — just floats on the page.

### Footer Single-Line
**Role:** Minimal page closure

Single line of metadata in Soehne Mono 12px, #1e1e1, tracking 0.6px. Left: project identifier or studio name. Right: small action link or credit. 32px bottom padding separates it from page edge.

### Scroll Indicator
**Role:** Vertical guide suggesting 'there's more below'

Thin 1px vertical line in #1e1e1, ~120px tall, centered, terminating in a small downward arrow (SVG). Centered in the hero, the only graphical element competing with the display type.

## Do's and Don'ts

### Do
- Use Cardinal Fruit at 48-180px for all display headlines; never below 36px
- Set all buttons to 20px border-radius with 7-8px vertical and 16px horizontal padding in Soehne Mono 12px
- Alternate section backgrounds between #ffffff and #fbf9f3 to create editorial rhythm
- Prefix every content section with a Soehne Breit 10px uppercase kicker label at 1.0px letter-spacing
- Use 100px section gaps and 20px element gaps as the standard rhythm
- Let images fill their containers edge-to-edge with zero border-radius
- Reserve #1e1e1 for text, borders, and button fills only — never as a decorative wash

### Don't
- Never introduce chromatic colors — the 0% colorfulness is the entire brand
- Never use box-shadow for elevation; let surface color contrast do the work
- Never use a border-radius other than 20px for interactive elements or 0px for images/cards
- Never set body text below 14px or above 18px; the editorial scale is fixed
- Never use the display serif (Cardinal Fruit) at sizes below 36px — it loses its character
- Never add visible dividers, rules, or borders between sections — whitespace is the only separator
- Never darken or overlay hero photography; let the type sit directly on the raw image

## Elevation

The system uses zero shadows. All depth and separation comes from the contrast between #ffffff, #fbf9f3, and #1e1e1 surfaces, plus generous whitespace. The cream-on-white tonal shift IS the elevation system — there is no z-axis, only surface levels. This is a deliberate editorial choice: shadows would cheapen the gallery aesthetic.

## Surfaces

- **Paper White** (`#ffffff`) — Primary page canvas
- **Warm Cream** (`#fbf9f3`) — Alternate section surface, card backgrounds, editorial warmth
- **Ink Black** (`#1e1e1`) — Dark mode sections, button fills, footer

## Imagery

Imagery is the content, not decoration. The site uses large-format, uncropped architectural and interior photography — retail spaces, living rooms, and art installations where custom wallpaper is the protagonist. The hero is an abstract painted wallpaper texture (warm peach, pink, and blue atmospheric wash) that functions as a mood board rather than a product shot. All images have zero border-radius and fill their containers edge-to-edge. No image overlays, no darkened scrims, no duotone treatments. The color is allowed to live in the photography because the UI itself is strictly monochrome — this is a deliberate handoff: the interface is the frame, the imagery is the art. Density is image-heavy in content sections but text-dominant in the hero, where the 180px serif headline occupies the full viewport.

## Layout

Page model: full-bleed sections that alternate between atmospheric image backgrounds and cream/white editorial blocks, all max-width ~1440px centered for content. Hero pattern: full-viewport atmospheric image with massive overlaid serif headline in light cream, no nav, no CTAs — just title and a thin scroll indicator. Section rhythm: alternating bands of #ffffff and #fbf9f3, each separated by 100px of vertical breathing room, no visible dividers or rules. Content arrangement: consistently asymmetric — text occupies a narrow left column (35-40%) while photography takes the dominant right column (60-65%), creating a gallery-catalog reading rhythm. Grid usage: 2-column image grids for visual proof, 2-column text+image splits for editorial content, no 3+ column grids. Navigation: minimal sticky header with stacked wordmark and single hamburger, no mega-menu, no visible nav links until interaction. The overall feel is a printed monograph digitized — each screen is a spread.

## Similar Brands

- **Other Means** — Same editorial agency aesthetic — monochrome palette, massive serif display type, generous whitespace, and the sense that every screen is a printed spread
- **Resn** — Creative studio with the same typographic confidence — serif display headlines at extreme sizes against atmospheric full-bleed imagery
- **&Walsh** — Shared warm-tone minimalism, asymmetric text+image splits, and the same gallery-pacing whitespace rhythm
- **Locomotive** — Both treat the portfolio page as an editorial publication — large serif type, warm neutral surfaces, and a single dark ink color
- **Cereal Magazine (digital)** — Same warm cream stock, serif-driven hierarchy, and the conviction that photography should be uncropped and edge-to-edge without chrome
