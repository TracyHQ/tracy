# Letterboxd — Style Reference
> Darkened cinema lobby with neon rating glow

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Letterboxd reads as a darkened cinema lobby: a near-black canvas tinted blue, content stacked in quiet horizontal bands, and one unmistakable acid-green accent that fires only at moments of action or rating. The dual-typeface system pairs a utilitarian neo-grotesque (Graphik) for chrome with a literary serif (Tiempos) for editorial moments, creating a tension between product UI and magazine. Density is comfortable, never crowded — the grid breathes around film posters and review cards, with 3px micro-radii keeping the geometry sharp and the green CTA as the only curve that matters.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#14181c` | Page canvas, app background |
| Carbon | `#202830` | Elevated surface — cards, modals, popovers |
| Slate | `#2c3440` | Borders, dividers, subtle separators |
| Graphite | `#445566` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Steel | `#586370` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Fog | `#667788` | Secondary body text, inactive icon strokes |
| Silver Mist | `#778899` | Tertiary body text, meta information, timestamps |
| Ash | `#8899aa` | Muted helper text, placeholder copy |
| Pewter | `#99aabb` | Primary body text, navigation links, dominant interface text |
| Ice | `#aabbcc` | Headings, emphasis text, strong links |
| Glacier | `#ddeeff` | Bright accent text, active link states, highlight labels |
| Bone | `#d8e0e8` | Navigation hover states, light iconography |
| Chalk | `#c8d4e0` | Button labels, inverted text on dark fills |
| Absolute White | `#ffffff` | Maximum contrast text, inverse fills, poster borders |
| True Black | `#000000` | Shadow base, icon glyphs, deepest contrast |
| Acid Green | `#00e054` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Pro Green | `#00c030` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |

## Typography

### object-fit: cover; — object-fit: cover; — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1

### Graphik — Primary UI sans-serif — navigation, buttons, labels, metadata, tags, form controls, and all small-size interface text. The wide letter-spacing at 0.075–0.083em is reserved for uppercase eyebrows and nav labels, giving the chrome a deliberate, almost printed feel. Weight 400 carries body and metadata, 700 for emphasis and buttons.
- **Substitute:** Inter, DM Sans, or Source Sans 3
- **Weights:** 300, 400, 700
- **Sizes:** 10px, 11px, 12px, 13px, 14px, 15px, 16px, 17px, 18px, 24px, 26px
- **Line height:** 1.00–2.00
- **Letter spacing:** 0.0750em, 0.0770em, 0.0830em (applied to uppercase labels and small caps at 10–18px; 0.75–1.5px tracking)

### Tiempos Text — Editorial serif for body copy in reviews, log entries, and long-form text. The 15px/1.67 pairing creates generous line height for comfortable reading. Switches the interface from product UI into magazine mode wherever prose appears.
- **Substitute:** Source Serif 4, Lora, or PT Serif
- **Weights:** 400, 700
- **Sizes:** 15px, 22px
- **Line height:** 1.20, 1.25, 1.67

### Tiempos Headline — Display serif for hero headlines and major page titles. A single use at 36px — the only size where this voice speaks, making it feel ceremonial and rare.
- **Substitute:** Playfair Display, DM Serif Display, or Source Serif 4
- **Weights:** 700
- **Sizes:** 36px
- **Line height:** 1.33

### masonry — masonry — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.83px |
| body | — | — | 14px | 1.5 | — |
| body-md | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.38 | 1.49px |
| heading-sm | — | — | 22px | 1.25 | — |
| heading | — | — | 26px | 1.23 | — |
| display | — | — | 36px | 1.33 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 10px

### Border Radius

- **cards:** 3px
- **icons:** 20px
- **badges:** 3px
- **inputs:** 3px
- **buttons:** 3px

## Components

### Primary Action Button (Acid Green)
**Role:** Hero CTA, account creation, primary conversion

Filled with #00e054, white text, Graphik 700 at 14px, 3px radius, 10px 16px padding. The only color-saturated button in the system. Drop shadow base: rgba(0,0,0,0.25) 0 1px 5px. Inner highlight: rgba(255,255,255,0.1) 0 1px 0 inset.

### Secondary Button (Graphite)
**Role:** Less prominent actions, filter toggles

Filled with #445566, #c8d4e0 text, Graphik 400 at 13px, 3px radius, 8px 14px padding. No shadow, flat surface that sits one step above canvas.

### Ghost / Text Button
**Role:** Nav items, inline links, dismissable actions

No background, Pewter (#99aabb) or Fog (#667788) text, Graphik 400–700 at 13–14px. Hover transitions text to Glacier (#ddeeff). No border, no radius — just text with optional 1px underline.

### Film Poster Card
**Role:** Grid content item — primary content unit

Carbon (#202830) background, 3px radius, 1px inset border at rgba(20,24,28,0.125). Poster image fills card with object-fit: cover. No padding around image — poster edges meet card edges. Meta text below in Graphik 11–12px with 0.83px tracking.

### Rating Star Icon
**Role:** Film rating display, interactive rating input

Five stars in a row, 20px border-radius (fully rounded). Filled stars use #00e054 acid green. Unfilled stars use transparent fill with Fog (#667788) stroke at 1px. 20px size, 7px gap between stars.

### Navigation Bar
**Role:** Top-level site navigation, persistent across all pages

Void Black (#14181c) background, no visible border. Logo left (Graphik 700 18px white), nav links centered (Graphik 400 12px, 0.96px tracking, uppercase Pewter #99aabb). Search input right (Steel #586370 fill, 3px radius). Sticky, full-width.

### Search Input
**Role:** Film/person/search query field

Steel (#586370) background, Glacier (#ddeeff) placeholder text, Graphik 400 at 14px. 3px radius, 8px 12px padding. No visible border. Focus state adds rgba(221,238,255,0.25) 0 0 0 1px inset ring.

### Badge / Tag
**Role:** Film genre labels, status indicators, category pills

Slate (#2c3440) background, Ice (#ddeeff) or Pewter (#99aabb) text, Graphik 400 at 11px with 0.83px tracking, uppercase. 3px radius, 4px 8px padding. Pro Green (#00c030) variant for positive states.

### Review Block
**Role:** Long-form user review or editorial content

Carbon (#202830) surface, 3px radius, 1px inset border. Body text in Tiempos Text 15px/1.67 Pewter (#99aabb). Username header in Graphik 700 14px Ice (#aabbcc). 16px internal padding.

### Hero Banner
**Role:** Full-width featured film image with overlay text

Full-bleed photographic background with dark gradient overlay. Headline in Tiempos Headline 36px or Graphik 700 26px white. Subtext in Tiempos Text 15px or Graphik 400 14px Pewter. Acid Green CTA button centered below text. Image attribution rotated 90° on right edge in Graphik 10px.

### Masonry Grid
**Role:** Primary content layout for poster displays

CSS masonry or column-based layout, 7px column gap, 12px row gap. Posters in 2:3 aspect ratio. No visible grid lines or section dividers — the dark canvas absorbs boundaries.

### Footer
**Role:** Site links, legal, app download badges

Void Black (#14181c) background, 1px top border in Slate (#2c3440). Link columns in Graphik 400 12px Fog (#667788), section headers in Graphik 700 12px uppercase Pewter. 64px vertical padding.

### Modal Dialog
**Role:** Security checks, confirmations, auth flows

Carbon (#202830) background, 3px radius, drop shadow rgba(0,0,0,0.25) 0 1px 5px + rgba(0,0,0,0.35) 0 1px 10px. Title in Graphik 700 16px white. Body text in Graphik 400 14px Pewter. Centered on dimmed overlay (rgba(0,0,0,0.6)).

## Do's and Don'ts

### Do
- Use #00e054 exclusively for the primary action button, star ratings, and brand-acknowledging moments — never as a background, surface, or decorative wash.
- Set all uppercase labels in Graphik with letter-spacing between 0.075em and 0.083em to preserve the printed, deliberate feel of the chrome.
- Reach for Tiempos Text at 15px/1.67 whenever the content shifts from product to editorial — reviews, log entries, descriptions.
- Use 3px border-radius on all cards, buttons, badges, and inputs; reserve 20px only for icon containers and rating stars.
- Create depth through color shifts across the neutral stack (#14181c → #202830 → #2c3440) rather than cast shadows.
- Pair Pewter (#99aabb) for primary body text, Fog (#667788) for secondary, and Ice (#aabbcc) for headings — the cool-blue grayscale creates a consistent temperature.
- Anchor the top of every page with the nav bar at full width over Void Black, and let the dark canvas extend edge-to-edge without max-width containers for the nav.

### Don't
- Never introduce a second saturated color — the acid green is a soloist, and adding any other hue dilutes its signal.
- Don't use shadows for card or button elevation; the inset 1px border is the only depth treatment for in-flow elements.
- Avoid Tiempos Headline at sizes other than 36px — it loses its ceremonial weight when scaled down or stretched across components.
- Don't apply the wide letter-spacing to sentence-case body text; it belongs only to uppercase labels and eyebrows.
- Never use pure white (#ffffff) for large body text blocks — it creates too much contrast in a dark UI; use Pewter or Ice instead.
- Don't round corners beyond 3px on rectangular components; the sharp geometry is part of the cinema-lobby aesthetic.
- Avoid mixing the serif (Tiempos) into navigation, buttons, or tags — the typeface boundary between UI and editorial must stay clean.

## Elevation

- **Cards and content blocks:** `rgba(20, 24, 28, 0.125) 0px 0px 1px 1px inset`
- **Dropdowns and overlays:** `rgba(0, 0, 0, 0.25) 0px 1px 5px 0px, rgba(0, 0, 0, 0.35) 0px 1px 10px 0px`
- **Focus and active rings:** `rgba(221, 238, 255, 0.25) 0px 0px 0px 1px inset`
- **Button inner highlight:** `rgba(255, 255, 255, 0.1) 0px 1px 0px 0px inset`

## Surfaces

- **Void Black** (`#14181c`) — Base page canvas behind all content
- **Carbon** (`#202830`) — Card surfaces, review blocks, elevated content panels
- **Slate** (`#2c3440`) — Hover states, input fields, inset surfaces

## Imagery

Photography is the dominant visual language: large cinematic stills serve as hero backgrounds (full-bleed, edge-to-edge, with dark overlay for text legibility), while film poster artwork populates grid layouts in 2:3 portrait orientation. Posters have no frames, shadows, or rounded corners — they sit directly on the dark canvas, letting the artwork itself provide visual weight. No illustrations, no 3D renders, no abstract graphics. Image treatment is natural and unmanipulated: full color, ungraded, presented as-is. Iconography is minimal and outlined: thin 1px strokes in Fog or Pewter, with star icons as the only filled glyphs (in acid green). The visual hierarchy is: photographic hero → poster grid → editorial text blocks. Imagery occupies roughly 40% of the above-fold real estate and 60% in content sections.

## Layout

Full-bleed dark canvas with centered max-width content containers (1200px). The hero pattern is a full-viewport-width photographic banner with a dark gradient overlay, centered headline in serif, and a single acid-green CTA button — no split layouts, no side-by-side hero variants. Below the fold, content flows in alternating bands: a horizontal poster strip, then a text+grid section, then another poster grid. The masonry/grid layout is the primary content arrangement, with 6–8 columns of film posters separated by 7px gaps. Sections are separated by vertical space (64px) rather than visible dividers — the dark background absorbs boundaries. Navigation is a persistent top bar at full width, sticky on scroll. The overall rhythm is: wide hero → dense grid → editorial text block → dense grid → footer, with consistent 64px breathing room between sections.

## Similar Brands

- **Mubi** — Same dark cinema-lobby atmosphere with a single saturated accent color and serif/sans type pairing for editorial film content
- **Trakt** — Identical dark-mode interface with poster-grid content, similar compact sans-serif chrome, and the same graphik-like geometric proportions
- **Goodreads** — Same social-tracking-for-media pattern with poster/book grids, though warmer in tone — Letterboxd is the darker, cooler sibling
- **Rotten Tomatoes** — Same editorial-meets-database tension, with serif body text and a clean sans-serif chrome, though RT uses red instead of green as its single accent
- **The Criterion Channel** — Same cinematic reverence, dark canvas, serif display headlines, and the philosophy that one color (green for Letterboxd, red for Criterion) is enough
