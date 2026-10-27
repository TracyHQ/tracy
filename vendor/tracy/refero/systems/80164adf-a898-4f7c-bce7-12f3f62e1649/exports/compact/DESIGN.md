# Ferrari — Style Reference
> cavallino rampante on black marble. Black voids punctuated by singular Ferrari red, white uppercase tracking, and full-bleed cinematic photography.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ferrari.com speaks in a restrained editorial whisper over cinematic darkness: a predominantly black canvas broken by full-bleed photography and a single signal red that interrupts only when something demands attention. Typography is set in uppercase with wide tracking, small sizes, and tight weights — the type behaves as captions and labels, never as decoration. Layout favors negative space, centered compositions, and vertical scrolling over chrome — the cars and content breathe in full-viewport panels while navigation sits flat and borderless, signaled by color shifts rather than rules. Every element is reduced to its essential geometry: square corners, hairline dividers, flat surfaces, no rounded buttons.

## Colors

| Name | Value | Role |
|------|-------|------|
| Rosso Corsa | `#da291c` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Rosso Scuro | `#9d2211` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Bianco Ferrari | `#ffffff` | Canvas, primary text on dark surfaces, iconography, and link color — the dominant tone across the entire interface |
| Carbone Nero | `#000000` | Full-bleed dark backgrounds, hero panels, and overlay surfaces — creates the cinematic void behind photography |
| Notte Profonda | `#181818` | Footer and secondary dark surfaces — one step softer than pure black to break the infinite void |
| Grafite | `#303030` | Borders, dividers, and muted surface treatments — thin structural separation between dark layers |
| Fumo | `#8f8f8f` | Muted body text, caption labels, and secondary metadata on light surfaces |
| Piombo | `#666666` | Supporting body text and quieter label treatments |
| Argento Chiaro | `#d2d2d2` | Light surface dividers and disabled borders on white backgrounds |
| Velo di Luce | `#f7f7f7` | Lightest surface wash — subtle background tonal shifts on white sections |
| Cemento | `#ebebeb` | Section backgrounds on light areas — the only chromatic step in the white canvas |

## Typography

### Body-Font — Body-Font — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 9px, 11px, 12px, 13px
- **Line height:** 1.27, 1.5, 1.78, 2
- **Letter spacing:** 0.015, 0.022, 0.028, 0.083, 0.091

### FerrariSans — Primary display and interface typeface — custom sans used across all copy
- **Substitute:** Inter, Helvetica Neue, Arial Narrow
- **Weights:** 400-500
- **Sizes:** 
- **Line height:** 1.27-2.0
- **Letter spacing:** 0.005em to 0.091em depending on size — tracking widens as type shrinks
- **OpenType features:** `"ss01" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.78 | — |
| body-sm | — | — | 12px | 1.78 | — |
| body | — | — | 13px | 1.78 | — |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 64-96px
- **Card padding:** 24-32px
- **Element gap:** 10-16px

### Border Radius

- **full:** 9999px
- **tags:** 0px
- **cards:** 0px
- **buttons:** 0px

## Components

### Ghost Navigation Link
**Role:** Primary nav element

Transparent background, white uppercase text at 11-12px with 0.083-0.091em tracking, zero border-radius, 5px vertical padding. No fill, no border — relies on color shift to white on hover. The nav itself is a flat bar without background, floating over hero imagery.

### Dark Cinematic Hero Panel
**Role:** Full-viewport section

Full-bleed #000000 or #181818 background with centered or overlaid display type at 16px weight 500. Display headlines rendered in uppercase, tightly tracked, centered. Car photography fills the viewport edge-to-edge with no padding or frame — the image IS the layout.

### Section Label Button
**Role:** Categorical navigation chip

Transparent background, white uppercase 12px Body-Font with 0.083em tracking, 5px vertical padding, 0px radius, 1px bottom border that appears on hover. No fill, no rounded corners — text-only with underline state.

### Carousel Indicator Dot
**Role:** Scroll position indicator

8-10px circles at 0px radius, inactive state #8f8f8f, active state #ffffff or #da291c. No labels — purely geometric position markers below full-bleed hero panels.

### Footer Block
**Role:** Site footer

#181818 background extending edge-to-edge, white text at 11-12px uppercase with wide tracking, no borders between columns — only vertical white space separates groups. Social icons are white outlined, 16px square, no fill.

### Featured Content Card
**Role:** Editorial card

Flat rectangular block on #181818 or #000000 background, 0px corner radius, no shadow, no border. Headline set in 16px weight 500 uppercase FerrariSans with tight tracking. Body copy at 11-13px. Photography bleeds to card edges with no inset.

### Utility Icon Button
**Role:** Functional icon control

Search and close icons rendered as white SVG strokes at 16px, transparent background, 0px radius. No background fill, no border — icon alone signals function. 10px padding all sides.

### Category Pill (Full Radius)
**Role:** Filter or tag label

The single rounded element in the system: 9999px radius pill for filter tags or status labels on body copy contexts. Transparent background with 1px hairline white border, uppercase 9-11px text.

### Hairline Divider
**Role:** Structural separator

1px solid line in #303030 on dark surfaces or #d2d2d2 on light surfaces. No double rules, no decorative spacing — minimal structural geometry between content blocks.

### Full-Bleed Photography Frame
**Role:** Imagery container

Edge-to-edge image presentation with 0px radius, no padding, no border, no caption overlay chrome. The image speaks for itself against the black void.

### Body Text Link
**Role:** Inline text link

White #ffffff text with no underline by default, uppercase tracking matching surrounding copy. Color shifts to #da291c on hover — the only chromatic moment in body copy.

### CTA Arrow Link
**Role:** Action prompt with directional indicator

Uppercase 11-12px text in white with a right-pointing arrow (→) glyph appended. Transparent background, no border, no radius. The arrow IS the affordance — no button chrome surrounds the action.

## Do's and Don'ts

### Do
- Set all display copy in uppercase with tracking between 0.083em and 0.091em — the wide letter-spacing is the system's voice
- Use #000000 and #181818 as full-bleed section backgrounds; let photography and white type carry the visual weight without competing surfaces
- Use #da291c exclusively for interactive hover, focus, and active states — never as a background fill, never as decorative color
- Keep all corner radii at 0px except for the single 9999px pill — sharp geometry is the signature
- Set type at 11-13px for all interface copy; reserve 16px only for section titles and hero headlines
- Let images bleed to viewport edges with no padding, frames, or rounding — the photograph is the layout
- Use hairline 1px #303030 or #d2d2d2 dividers for structural separation — never card shadows or elevated panels

### Don't
- Do not introduce rounded corners on buttons, cards, or panels — the system is zero-radius by design
- Do not use #da291c as a filled background or decorative wash — it signals action only
- Do not set body copy below 11px without uppercase treatment; the tracking depends on the size relationship
- Do not add card shadows, elevation, or floating panels — surfaces sit flush on the black void
- Do not use colored type for anything other than #ffffff, #8f8f8f, or #da291c hover states
- Do not introduce gradients as backgrounds — the CSS tokens define gradient behavior for specific component states, not page-level decoration
- Do not add padding or margins around full-bleed hero photography — the image must reach every edge

## Surfaces

- **Void Black** (`#000000`) — Full-bleed hero panels and cinematic section backgrounds
- **Night Surface** (`#181818`) — Footer and secondary dark surfaces — one tonal step softer than void
- **Graphite Edge** (`#303030`) — Hairline borders and subtle dividers on dark surfaces
- **Canvas White** (`#ffffff`) — Light section backgrounds and primary text color
- **Smoke Wash** (`#f7f7f7`) — Tonal shifts on white sections — almost imperceptible warmth
- **Concrete** (`#ebebeb`) — Lightest background step for alternating sections

## Imagery

Imagery is full-bleed cinematic photography: vehicles shot against dark or studio environments, filling the viewport edge-to-edge with no inset, frame, or rounding. Photography occupies 70-90% of each viewport section. No lifestyle context, no people-centric shots — the car is always the subject, isolated and hero-prominent. Color treatment is high-contrast with deep shadows and vivid reds or metallic paint catching light. No illustrations, no abstract graphics, no product screenshots — pure photographic storytelling. Iconography is minimal white outlined SVG at 16px stroke weight, used only for functional navigation (search, social, close).

## Layout

Full-bleed vertical scroll with no max-width constraint — sections extend edge-to-edge at 100vw. Each viewport-height section is either a full-bleed photograph with centered white type overlay or a dark void with minimal copy. Hero pattern: first screen is a cinematic car photograph with a centered headline beneath or overlaid, followed by vertically scrolling full-bleed panels. Navigation sits as a flat transparent bar over the hero — no sticky background, no border. Content rhythm alternates between massive image-driven panels and quiet dark sections with centered uppercase typography. No sidebar, no multi-column grids in the fold — composition is single-column and centered throughout. Card grids appear only in secondary content areas (collections, editorial) and remain flat with 0px radius against dark backgrounds. Section transitions are seamless — no dividers, no alternating color bands — only the photography itself marks the shift.

## Similar Brands

- **Aston Martin** — Same dark cinematic full-bleed photography approach with centered uppercase tracked typography and a single restrained accent color
- **Porsche** — Black-dominant editorial layout with sharp 0px geometry, hairline dividers, and photography that bleeds to viewport edges
- **Lamborghini** — Dark void backgrounds with full-bleed vehicle photography, uppercase tracked display type, and zero-radius sharp UI elements
- **McLaren** — Monochromatic dark UI with cinematic hero panels, minimal navigation chrome, and uppercase widely-tracked micro-copy as the typographic voice
- **Bugatti** — Full-bleed dark editorial sections with centered white display type and a single brand color used only for interactive states
