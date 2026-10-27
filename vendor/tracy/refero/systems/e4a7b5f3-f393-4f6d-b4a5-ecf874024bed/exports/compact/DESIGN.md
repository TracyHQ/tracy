# 099 SUPPLY — Style Reference
> Gallery wall of black-on-white objects

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

099 Supply is a museum-grid: white walls, black objects, labels in tiny tracked-out monospace caps. The entire interface is reduced to a pure white canvas with one near-black (#101010) doing all the work — typography, borders, fills, buttons, mockup silhouettes — so every rendered asset reads as a specimen on a gallery plinth. Typography is exclusively Soehne Mono at weight 400, with uppercase tracking up to 0.18em giving every label the air of a curator's index card. Components are flat, borderless, and defined by 1px hairline edges and tight 8px radii; there are no shadows, no gradients, and no chromatic accents. The aesthetic is forensic — each mockup and component tile is framed identically, letting the objects themselves carry the visual weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas White | `#ffffff` | Page background, card surfaces, button backgrounds, link containers — the gallery wall everything sits on |
| Ink | `#101010` | Primary headings, body text, and icon fills on light surfaces. Do not promote it to the primary CTA color |
| Charcoal | `#000000` | Pure-black decorative fills for mockup rendering and high-contrast object silhouettes |
| Muted Hard | `#222222` | Dark surface tint for elevated dark components and modal/overlay backgrounds; Dark surface fill for elevated panels, toggle/loader component backgrounds |
| Muted | `#555555` | Secondary body text, supporting copy, muted helper labels |
| Muted Soft | `#999999` | Section headings, icon fills, badge text, hover border state — the softest readable gray |
| Border Soft | `#c8c8c8` | Soft hairline borders for less prominent dividers and input outlines |
| Border Subtle | `#e0e0e0` | Card edges, link borders, subtle dividers between tiles — the dominant hairline color |

## Typography

### Soehne Mono — The exclusive typeface — used for every heading, body, badge, link, icon, and label. Weight 400 dominates; weight 500 is reserved for the 26px hero label. All non-body sizes render in uppercase with tracking between 0.02em and 0.18em. The monospaced face reinforces the museum-catalog, specimen-tag atmosphere.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 400, 500
- **Sizes:** 8px, 10px, 11px, 12px, 16px, 26px, 54px
- **Line height:** 1.00, 1.20, 1.50
- **Letter spacing:** 0.025em at 54px display, 0.18em at 26px hero, 0.08em at 12px badge, 0.02em at 8px micro
- **OpenType features:** `No special features detected — monospaced face is the visual identity`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.8px |
| label | — | — | 26px | 1.2 | 4.68px |
| display | — | — | 54px | 1 | 1.35px |

## Spacing & Layout

**Density:** compact

- **Section gap:** 80px
- **Element gap:** 12px

### Border Radius

- **cards:** 8px
- **badges:** 0px
- **inputs:** 4px
- **buttons:** 9999px

## Components

### Mockup Tile Card
**Role:** Primary unit — displays a 3D mockup asset with catalog-style metadata strip

White background, 1px solid #e0e0e0 border, 8px radius. Top portion: centered mockup image on white. Bottom metadata strip: padded 10px top/bottom, 12px right/left, separated from image by a 1px #e0e0e0 horizontal divider. Left metadata label in Soehne Mono 11px weight 400 #555 (format 'M 005'). Right label in Soehne Mono 12px weight 400 #555 uppercase with 0.08em tracking (asset name like 'IPHONE'). No shadow.

### Framer Component Tile Card
**Role:** Second tile variant for interactive component previews

White background, 1px solid #e0e0e0 border, 6px or 8px radius. Centered component preview (toggle, loader, browser frame). Bottom label strip same format as mockup tile but prefixed 'C' instead of 'M' (e.g. 'C 000 THEME TOGGLE'). Expand icon (two arrows) sits in the top-right corner as a 16px #555 stroke.

### Section Heading
**Role:** Section label above each grid block

Soehne Mono 26px weight 500, uppercase, #999999, letter-spacing 0.18em (4.68px). Acts as a quiet, tracked-out curator's heading. Examples: '3D MOCKUPS', 'FRAMER COMPONENTS'. No underline, no decoration.

### Primary Button
**Role:** Filled dark button for 'Buy' and conversion actions

Background #101010, text #ffffff, Soehne Mono 12px weight 400 uppercase with 0.08em tracking, 9999px (pill) radius, padding ~10px 16px. Hover: background shifts to #999999. Used sparingly — appears in modal CTAs and the browser-frame demo.

### Ghost Button
**Role:** Secondary outlined button paired with primary

Background transparent, border 1px #999999, text #555555, same Soehne Mono 12px uppercase treatment, 9999px radius, padding ~10px 16px. Appears alongside Primary Button in modal demo ('Close').

### Metadata Label
**Role:** Catalog-style tag below each tile

Soehne Mono 12px weight 400, uppercase, 0.08em letter-spacing, #555555. Left-aligned: asset ID (e.g. 'M 005'). Right-aligned: asset name (e.g. 'IPHONE'). No background, no border, sits on the card's metadata strip.

### Modal Panel
**Role:** Overlay for copy/info interactions

White background, 1px #e0e0e0 border, 8px radius. Header text Soehne Mono 16px weight 400 #101010 ('Less is more'). Body copy Soehne Mono 11px #555. Footer contains a Ghost Button + Primary Button pair right-aligned.

### Theme Toggle
**Role:** Interactive component demo — pill switch

Pill-shaped (999px radius), 1px #e0e0e0 border, white background, inner circle thumb at left position showing #ffffff fill on #101010 track, or reversed when toggled.

### Loader Ring
**Role:** Circular progress component demo

Two concentric arcs forming a ring: lighter arc #e0e0e0 (background ring), darker arc #101010 (progress arc, ~270° sweep). No fill, pure stroke composition.

### Browser Frame
**Role:** Windowed screenshot frame component

Rounded rectangle with 8px radius, 1px #e0e0e0 border. Top chrome bar: three small circles (traffic lights) and a URL pill input with #c8c8c8 placeholder text ('https://'). Interior content area displays a globe or page preview.

### Compare Slider
**Role:** Before/after image comparison component

Rectangular frame split vertically: left side shows light-mode garment, right side dark-mode variant, divided by a 1px #101010 handle/bar with a draggable circle grip.

### Table Component
**Role:** Structured data table demo

Header row: 'COMPANY' / 'FOUNDED ↑' in Soehne Mono 12px uppercase #999999 with 0.08em tracking. Body rows alternating white background, 1px #e0e0e0 horizontal dividers, text in Soehne Mono 12px #101010. No vertical borders.

### Form Builder Checkbox
**Role:** Form control component demo

Small 16px square with 4px radius. Unchecked: 1px #e0e0e0 border, white fill. Checked: #101010 fill with white checkmark stroke at ~2px weight.

### Counter Display
**Role:** Large numeric typographic component

Soehne Mono weight 400 at large display size (~54px or scaled), rendered as three stacked digits '099' in #101010 on white. Pure typographic exercise — no frame, no border.

## Do's and Don'ts

### Do
- Use only Soehne Mono (or JetBrains Mono substitute) for every piece of text — no second typeface.
- Set every label, badge, and metadata strip in uppercase with tracking between 0.02em and 0.18em.
- Render all buttons at 9999px radius and all cards/tiles at 8px radius — the contrast is the system.
- Use 1px solid borders in #e0e0e0 for default state, #999999 for hover, and #101010 for strong emphasis.
- Keep all mockup assets on pure white backgrounds centered within their tiles — the object IS the content.
- Maintain the catalog metadata pattern: asset ID left ('M 005'), asset name right ('IPHONE'), separated by a horizontal divider.
- Use #101010 as the sole fill for dark elements — buttons, strokes, silhouettes, checkmark icons, loader arcs.

### Don't
- Never introduce chromatic color — no blues, greens, reds, or any hue. The system is monochrome.
- Never apply box-shadow, drop-shadow, or any elevation effect. Depth comes from hairline borders only.
- Never use a sans-serif or proportional typeface. Mono is non-negotiable.
- Never use background gradients except for the single conic-gradient loader pattern (#101010 → #c8c8c8).
- Never set border-radius below 4px on cards or above 9999px on buttons — the radius vocabulary is fixed.
- Never use bold (600+) or light (300-) weights. Stay at 400, with 500 reserved for the 26px section heading.
- Never mix section heading style — always 26px uppercase #999999 with 0.18em tracking, nothing decorative.

## Elevation

Zero shadows. All depth is conveyed through 1px hairline borders (#e0e0e0 default, #999999 on hover, #101010 for strong emphasis). The absence of shadows is deliberate — the museum-plinth aesthetic requires flat, paper-thin surfaces where objects sit on the same plane as their frames.

## Surfaces

- **Canvas** (`#ffffff`) — Page background — the gallery wall.
- **Card** (`#ffffff`) — Individual mockup and component tile surfaces, visually identical to canvas but defined by a 1px border.
- **Elevated Dark** (`#222222`) — Dark mode toggle, loader ring fills, modal overlays — the only surface that breaks from white.

## Imagery

Pure UI, no decorative photography. The only imagery is the mockup assets themselves — high-fidelity 3D product renders (iPhone, hoodie, Apple Watch, drink carton, cap, Pro Display, MacBook Pro, business card, digital tablet) rendered in pure black or near-black against white. Illustrations are limited to UI component previews (theme toggle, loader ring, kinetic text dot sphere, grid loader plus-pattern, compare slider garment). Icon style: thin 1-2px stroke outlines, monochrome #555 or #101010, no fills. No lifestyle, no atmosphere, no context — each object is isolated like a product shot for a catalog.

## Layout

Full-bleed white canvas with no max-width container — content extends edge to edge. Hero is a centered site title area (the '099' counter in large mono) followed by section grids. Each section begins with a left-aligned uppercase heading ('3D MOCKUPS', 'FRAMER COMPONENTS') in muted gray with wide tracking, then a uniform 5-column tile grid with consistent 12px gaps between tiles. Tiles are identically sized and shaped — a square-ish rectangle containing a centered asset and a metadata strip footer. No alternating bands, no dark sections, no asymmetric compositions. The grid is the page: museum-row after museum-row of black objects on white. Navigation is minimal — likely a top bar with category links in the same tracked-out uppercase treatment.

## Similar Brands

- **Are.na** — Same flat white-canvas grid with no chrome — objects/content tiles presented as bare specimens with minimal labels.
- **Linear** — Monochrome dark-on-light discipline, tight typographic system, gallery-grade restraint in component design.
- **Framer Marketplace** — Same component-grid presentation pattern with catalog-style metadata strips under each tile.
- **Apple Design Resources** — Same white-plinth aesthetic for product mockups — black objects on white, no lifestyle context, identical framing.
- **Minimalissimo** — Editorial design portfolio with same museum-catalog feel — monochrome, monospace labels, specimen-card layouts.
