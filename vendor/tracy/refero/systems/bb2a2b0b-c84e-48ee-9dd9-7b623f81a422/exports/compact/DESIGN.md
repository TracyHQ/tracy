# Ysl — Style Reference
> black-and-white cinema still — a single model under a single wordmark, nothing else permitted

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

YSL is a luxury fashion editorial stage where the interface dissolves into full-bleed photography and the only visible chrome is a single line of text navigation. The system is pure binary: obsidian black and pure white, with zero intermediate tones, zero shadows, zero borders, and zero decoration. Every element earns its place by carrying the brand wordmark or a functional link — there is no card, no badge, no gradient, no rounded surface. The site reads as a magazine spread: the photograph fills the screen, the YSL logotype anchors the top center, and tiny uppercase captions float near the bottom edge. Whitespace and letter-spacing do the heavy lifting that color and shadow do on conventional sites.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, nav labels on light photography, footer and legal copy, card inversions, and full-bleed section dividers — the absolute dark that frames everything |
| Pure White | `#ffffff` | Page canvas, card surfaces, and inverse nav labels on dark photography — the negative space that lets imagery breathe |

## Typography

### Saint Laurent Wordmark (custom) — The YSL logotype is a proprietary custom mark — elongated wedges, condensed proportions, and a vertical stress that no system font replicates. Used only as the centered site identifier in the header. Do not substitute; this mark IS the brand. If a stand-in is needed, use Bodoni 175 condensed or Didot thin, tracked tightly.
- **Substitute:** Bodoni 175 (Adobe) or any condensed Didone as a visual proxy
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.0

### Helvetica Neue / Inter / system sans — Navigation labels, footer links, and small functional UI (sign in, bag, search). Always uppercase, always tracked wide. The whisper-weight restraint is intentional: the wordmark does the visual work, the nav merely signals location.
- **Substitute:** Helvetica Neue, Inter, or any neutral neo-grotesque
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.4

### Helvetica Neue / Inter / system sans — Editorial captions and collection labels floating near image edges (e.g. 'WOMEN'S SUMMER 25 / DESCUBRE LA SELECCIÓN DE BOLSO'). Centered, uppercase, wide letter-spacing — a film-credit feel rather than a product label.
- **Substitute:** Helvetica Neue, Inter, or any neutral neo-grotesque
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 1.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 68px
- **Card padding:** 0px
- **Element gap:** 20px

### Border Radius

- **all:** 0px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Transparent bar overlaid on the hero image. Height auto, no background fill, no border. Left-aligned cluster of 4-5 uppercase text links (HIGHLIGHTS, MUJER, HOMBRE, SL PRODUCTIONS, RIVE DROITE), centered YSL wordmark, right-aligned cluster of 4 text links + search icon + bag icon (LA MAISON, TIENDAS, SERVICIOS, INICIAR SESIÓN). Text in #ffffff at 11-12px, letter-spacing ~1.2px, uppercase. Links are plain text — no underline, no color change on hover, no pill. Padding: 20px horizontal, minimal vertical.

### YSL Wordmark Lockup
**Role:** Brand identifier in header

Custom YSL logotype centered in the nav bar. White (#ffffff) when over dark photography, black (#000000) when over light sections. No surrounding box, no link styling — the wordmark sits naked in the negative space. Rendered at display size relative to the nav (~40-50px), exact ratio controlled by the brand asset.

### Icon Button (Search / Bag)
**Role:** Utility actions in nav

Text-less icon at 16-18px in #ffffff or #000000 depending on surface. No border, no background, no hover state beyond opacity or color flip. Square hit area padded to ~12px. The bag icon may carry a numeric count in 10px text adjacent.

### Full-Bleed Editorial Image
**Role:** Hero and primary content

Photograph fills 100vw, height typically 85-100vh for the hero. No border-radius, no border, no overlay tint. The image is the component. May carry a small text caption overlaid at bottom-center.

### Editorial Caption
**Role:** Image label and collection reference

Two-line block centered near the bottom of a full-bleed image. Line 1 in 12px uppercase (collection name, e.g. 'WOMEN'S SUMMER 25'). Line 2 in 10-11px uppercase (call to discover, e.g. 'DESCUBRE LA SELECCIÓN DE BOLSO'). White (#ffffff) over dark photography, letter-spacing 1.5-2px. No background, no button chrome — the caption is the call to action.

### Footer
**Role:** Legal, regional, and secondary links

Solid #000000 background block. Multiple columns of 11px uppercase white text with generous vertical rhythm (20-32px row gap). No icons, no logos except a small YSL mark. Link color #ffffff, no underline, no hover color change — opacity reduction is the only affordance.

### Inverted Section Block
**Role:** Dark band breaking the white canvas

Full-width #000000 rectangle used for editorial interludes (campaign intros, collection announcements). White text only. No radius, no border, no shadow. Sits directly adjacent to the white canvas — the seam itself is the design.

## Do's and Don'ts

### Do
- Use only #000000 and #ffffff for every UI element — no grays, no tints, no opacity-based neutrals except at 100% or 0% on photography
- Set all text in uppercase with letter-spacing between 1.0px and 2.0px — tracking carries the luxury register
- Let photography bleed full-bleed (100vw) with no border-radius, no border, no overlay gradient
- Keep the wordmark centered, naked, and unboxed — never wrap it in a pill, circle, or bordered container
- Express all interactive feedback as a color flip (white↔black) or opacity reduction, never as a shadow, border highlight, or fill change
- Use the YSL wordmark as the only brand identifier — never combine it with a wordmark subtitle or tagline in the header
- Hold card and section padding to 0px; the photograph IS the surface, not a container for one

### Don't
- Never introduce a chromatic accent, brand color, or status hue — there is no green for success, no red for error, no blue for link
- Never add a box-shadow, drop shadow, inner shadow, or glow to any element — the system is shadowless by design
- Never apply border-radius to any UI element — all corners are square, the system reads as cut paper
- Never use mixed-case or sentence-case in nav, captions, or footer — everything is uppercase
- Never place the wordmark on a colored or photographic panel with a backing shape — it floats on negative space or directly on the image
- Never use a sans-serif display weight above 400 for nav or captions — restraint is the design language
- Never add icons, badges, tags, or decorative elements to product or editorial surfaces — the image carries all meaning

## Elevation

No shadows exist in this system. Elevation is expressed exclusively by value inversion (white-to-black) and by full-bleed photographic bleed. Adding any box-shadow would break the editorial flatness and the cinema-still feel of the brand.

## Surfaces

- **Canvas** (`#ffffff`) — Page background, the field photography floats on or replaces
- **Inversion** (`#000000`) — Full-bleed dark sections and card surfaces that invert the canvas — no shadow needed, the value flip is the elevation

## Imagery

Full-bleed editorial fashion photography is the entire visual system. High-contrast, low-key lighting on dark exteriors (night street, parked car, leather and skin). Models photographed in tight medium shots with intense direct gaze. Color is desaturated to near-monochrome — the photography already feels black-and-white even when it isn't. No product cutouts on white, no lifestyle warmth, no graphic illustration. Icons are stroke-only line icons at 1.5px weight in the nav. No decorative graphics anywhere; the system is photography + wordmark + text, nothing more.

## Layout

Full-bleed single-column layout. The hero occupies the entire viewport (100vw × ~100vh) with a single editorial photograph and no inner padding. Navigation overlays the top of the hero as a transparent bar — no sticky behavior interferes with the photograph. Section rhythm is defined by alternating full-bleed photographic frames and thin horizontal bands of white or black solid color, separated by 68px vertical gaps. The grid is invisible: content is either centered (wordmark, captions) or left/right clustered (nav links), never gridded into columns of cards. Content density is deliberately sparse — one image, one wordmark, one line of caption per screen.

## Similar Brands

- **Celine (celine.com)** — Same shadowless monochrome system, same uppercase-tracked nav, same full-bleed editorial photography replacing all UI chrome
- **Bottega Veneta (bottegaveneta.com)** — Same single-wordmark-centered header and photography-dominant page model with zero decorative UI elements
- **The Row (therow.com)** — Same restraint to pure black/white and uppercase small-caps nav — the interface is nearly invisible, the imagery is the brand
- **Helmut Lang (helmutlang.com)** — Same anti-decorative editorial grid, binary palette, and uppercase tracked typography as the sole UI vocabulary
