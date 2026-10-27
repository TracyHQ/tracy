# Palmer — Style Reference
> Ceramic gallery in soft daylight — the interface is the wall, the objects are the art.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Palmer treats dinnerware like a museum exhibit on a warm cream canvas (#f5f6ee). The interface dissolves — no shadows, no chrome, no saturated accents — so hand-glazed ceramics become the only color in the room. Typography runs tight: TWK Lausanne at near-mono weights (300–500) with aggressive negative tracking that pulls letters together, including an enormous 120px display tier that functions more as editorial statement than UI label. Interactive elements are reduced to hairline borders and pill-shaped toggles, sitting at the edges of the viewport to leave the center completely uninterrupted. Everything below the fold assumes the same gallery logic: small text, thin rules, generous space between objects.

## Colors

| Name | Value | Role |
|------|-------|------|
| Gallery Cream | `#f5f6ee` | Page canvas and base surface — a warm off-white that flatters glazed ceramics more than pure white would |
| Ink | `#222222` | Primary text, hairline borders, card outlines, icon strokes — the entire structural skeleton runs through this one near-black |
| Bone | `#ffffff` | Product image backgrounds, occasional inverse surface when a card needs to sit forward of the cream canvas |
| Fog | `#a1a19c` | Muted secondary borders and low-priority text — used when Ink would be too heavy for a structural divider |
| Lampblack | `#000000` | Reserved for the rare filled element (active nav background, weight anchors) — used sparingly so Ink remains the default voice |

## Typography

### TWK Lausanne — Sole typeface — handles everything from micro-labels to 120px editorial display. Weight 300 carries display and large headings (whisper-thin Swiss grotesque that lets the ceramics dominate), weight 400–500 for body and UI, weight 600–700 reserved for active states and filter labels. The tight letter-spacing (-0.04em at display, -0.02em at body) is signature: characters nestle together, giving even 11px labels a compressed, considered feel rather than airy defaults.
- **Substitute:** Inter Tight or Neue Haas Grotesk Display Pro at matching weights
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 11px, 12px, 14px, 16px, 18px, 120px
- **Line height:** 0.90 (display), 1.40 (body)
- **Letter spacing:** -0.04em at 120px display, -0.03em at 18px, -0.02em at 11–16px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.4 | -0.02px |
| body | — | — | 14px | 1.4 | -0.02px |
| body-lg | — | — | 18px | 1.4 | -0.03px |
| display | — | — | 120px | 0.9 | -0.04px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 12px

### Border Radius

- **card:** 9px
- **input:** 3px
- **button:** 3px
- **nav-pill:** 100px

## Components

### Experience View Toggle
**Role:** Primary mode switcher floating top-center

Pill-shaped container (100px radius) with a 1px Ink border, 7px vertical padding, 15–16px horizontal padding. Contains a small icon (dot grid) and 'experience view' label at 12px weight 400, color Ink. Sits on the cream canvas with no background fill — it's an outlined ghost pill.

### Scattered Product Tile
**Role:** Individual ceramic piece in the main editorial canvas

Square or near-square product photograph, no border, no radius (products are cut sharp or with minimal rounding). Cast with a soft natural shadow only from the photography itself, not from CSS. Positioned at irregular intervals across the full viewport — layout is curated, not gridded.

### Bottom Control Bar
**Role:** Fixed footer with menu and filter toggles

Sits at viewport bottom center. Contains two adjacent pill buttons: 'menu' (with hamburger icon) and 'filter' (with list icon), each at 3px radius, Ink text on cream, 1px Ink border, ~12–14px type. A 'Drag to rotate' hint with zoom in/out circular buttons sits at bottom-right.

### Navigation Link
**Role:** Text link in top-left brand mark and ancillary nav

'palmer' wordmark at top-left, 16px weight 400–500, color Ink, no decoration. No traditional nav bar — secondary navigation appears contextually.

### Zoom Control
**Role:** Circular zoom in/out buttons

Two small circles, ~24px diameter, 100px radius (fully rounded), 1px Ink border on cream fill. '+' and '−' glyphs centered at 12px Ink.

### Filter Chip
**Role:** Category or attribute filter in menu mode

Outlined pill, 100px radius, 1px Ink border, 12px weight 500 label, cream background. Active state fills with Ink and inverts text to cream/white. No drop shadow, no scale on hover.

### Card Surface
**Role:** Product card used in grid/list views (non-scattered mode)

9px corner radius, 1px Ink border, 16px internal padding, cream fill (#f5f6ee). No shadow — depth comes from the border alone. Image fills top edge to edge inside the radius.

### Input Field
**Role:** Text input for search or filter

3px radius, 1px Ink border, cream fill, 14px placeholder text in Fog (#a1a19c). Focus state darkens border to Lampblack (#000000) with no ring.

## Do's and Don'ts

### Do
- Use #f5f6ee for every page background — never pure white, it flatters the ceramics and signals the editorial tone
- Set all borders to 1px solid #222222 — hairlines are the only structural separator in the system
- Reach 120px for editorial display headlines in weight 300 with -0.04em tracking — the extreme scale is part of the brand voice
- Use 100px border-radius only for pills (toggles, filter chips, zoom buttons) and 9px for cards, 3px for everything else
- Set type at weight 300–400 for display and large headings; reserve 600–700 for active/selected states only
- Keep interactive elements at the viewport edges (top-center toggle, bottom-center control bar) so the center stays open for product imagery
- Use letter-spacing -0.02em on all body sizes (11–16px) and tighten further as type scales up

### Don't
- Don't introduce any chromatic accent color — the ceramics supply all the color, the UI stays grayscale
- Don't add drop shadows to cards, buttons, or nav — borders alone define depth
- Don't use corner radius above 100px or below 3px — the three tiers (3px, 9px, 100px) are the complete system
- Don't set type at weight 600+ in display sizes — it would overwhelm the whisper-thin signature of the 120px tier
- Don't use pure black (#000000) for text — Ink (#222222) is the text color; black is reserved for filled active states
- Don't add background color to the main canvas behind product photography — flat cream is non-negotiable
- Don't use letter-spacing 0 or positive values — all text tracks negative

## Elevation

No shadows. Depth is communicated entirely through 1px borders and the inherent shadows in product photography. The cream canvas is flat and shadowless — any drop shadow would break the gallery-wall illusion.

## Surfaces

- **Gallery Canvas** (`#f5f6ee`) — The base page surface — warm off-white, used everywhere as the default background
- **Card Surface** (`#f5f6ee`) — Cards use the same cream fill — depth comes from the 1px Ink border, not a lighter or darker shade
- **Inverse Surface** (`#222222`) — Rare filled-dark surface for active states and inverted sections (e.g., dark product detail panels)

## Imagery

Pure product photography — top-down or 3/4-angle shots of individual ceramic pieces (plates, bowls) on transparent or cream backgrounds. No lifestyle context, no hands, no tablescapes. Each piece is cropped with slight shadow to imply contact with a surface. Imagery is the only source of color on the site: glazed blues, olive greens, speckled whites, amber browns. Density is high but breathable — pieces are scattered with deliberate negative space between them, curatorial rather than catalog.

## Layout

Full-bleed viewport with no max-width constraint. The hero IS the product scatter: ceramic pieces distributed across the entire viewport at curated positions, not a grid. Navigation chrome is pushed to the corners (wordmark top-left, toggle top-center, control bar bottom-center), leaving the center field entirely to imagery. This is a one-screen-first experience — the scatter is the hero, and all secondary UI (menu, filter, zoom) is conditionally revealed. Section rhythm is minimal: one viewport, one scattered composition, minimal text. No traditional alternating bands.

## Similar Brands

- **HAY (Danish furniture/design retailer)** — Same Scandinavian editorial-product approach — objects float on a warm neutral canvas with minimal typographic chrome, the catalog reads like a magazine spread
- **Menu Space (Audo Copenhagen)** — Full-bleed product photography on warm off-white, hairline borders instead of shadows, sparse Swiss-grotesque type, no traditional e-commerce navigation
- **Atelier Vime** — Artisanal ceramics presented as gallery objects — similar warm canvas, scattered composition, typographic restraint, ceramics supplying all the color
- **The New Craftsmen** — British craft retailer with editorial gallery layout, warm neutral canvas, minimal UI chrome, letting handmade objects carry the visual weight
