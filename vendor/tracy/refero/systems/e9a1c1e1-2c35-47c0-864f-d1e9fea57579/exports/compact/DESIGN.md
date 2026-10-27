# Devin — Style Reference
> Electric ink on drafting paper. Let near-black type and pale technical surfaces do nearly all of the work, with #2200ff appearing as a deliberate switched-on signal.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Devin uses a warm off-white canvas, near-black typography, and a single electric violet-blue interruption. Large, tightly tracked grotesk headlines sit in expansive centered compositions, while the product is presented as pale, low-elevation software panels with compact utility text. The page alternates roomy editorial statements with dense interface evidence, dark bento panels, and repeated rounded gray tiles; blue is reserved for linked product names, selected words, and the occasional saturated control.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper | `#f7f6f5` | Page background, navigation bar, footer background |
| Carbon | `#141414` | Primary text, dark buttons, outlines, dark iconography, and dark feature surfaces |
| Tile Gray | `#efefef` | Logo tiles, integration cards, pale product modules |
| Mist | `#e7e7e7` | Inverse text on dark surfaces and subdued pale interface areas |
| Graphite | `#1f1f1f` | Dark bento-card surfaces |
| Steel | `#7d7d7d` | Eyebrows, muted labels, and monochrome partner marks |
| White | `#ffffff` | Text and icons on Carbon or Electric Blue controls |
| Electric Blue | `#2200ff` | Highlighted headline words, inline product links, selected icon strokes, and rare filled controls — the hard violet-blue creates a technical interruption in the otherwise grayscale system |

## Typography

### nbInternationalPro — The sole interface and display family: 400 handles compact navigation, links, and reading text; 500 carries headings from 24px through the 70px hero. The 64px and 70px displays use -2.56px and -2.816px tracking respectively; the 24px subheads use -0.48px. This compressed display tracking makes the large statements feel engineered rather than promotional.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 11px, 14px, 15px, 16px, 17px, 21px, 24px, 26px, 27px, 64px, 70px
- **Line height:** 1.00, 1.16, 1.20, 1.25, 1.27, 1.35, 1.40, 1.50
- **Letter spacing:** -2.816px at 70.4px, -2.56px at 64px, -0.48px at 24.16px; normal elsewhere

### geistMono — Sparse code-like and product-detail text inside technical interface content; use it only where a software artifact needs a distinct machine-readable texture.
- **Substitute:** IBM Plex Mono
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.50
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | nbInternationalPro | 400 | 11px | 1.2 | 0px |
| nav | nbInternationalPro | 400 | 14px | 1.4 | 0px |
| code | geistMono | 400 | 15px | 1.5 | 0px |
| body-strong | nbInternationalPro | 500 | 15px | 1.5 | 0px |
| body | nbInternationalPro | 400 | 16px | 1.5 | 0px |
| body-large | nbInternationalPro | 400 | 17px | 1.5 | 0px |
| eyebrow | nbInternationalPro | 400 | 21px | 1.5 | 0px |
| heading-small | nbInternationalPro | 500 | 24px | 1.27 | -0.48px |
| heading-inverse | nbInternationalPro | 500 | 26px | 1.25 | 0px |
| display | nbInternationalPro | 500 | 64px | 1.16 | -2.56px |
| hero-display | nbInternationalPro | 500 | 70px | 1 | -2.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 36px
- **Card padding:** 12px
- **Element gap:** 4px

### Border Radius

- **cards:** 16px
- **links:** 2px
- **pills:** 200px
- **buttons:** 2px
- **accentedControls:** 7.2px

## Components

### Global Navigation Bar
**Role:** Persistent public-site header

Use a Paper (#f7f6f5) horizontal bar with a 1px bottom divider in rgba(0,0,0,0.10). Navigation labels use nbInternationalPro 14px/19.6px weight 400 in Carbon (#141414), with 4px and 8px micro-gaps around chevrons and grouped controls.

### Navigation Text Link
**Role:** Public navigation and utility link

Set nbInternationalPro 14px/19.6px weight 400 in Carbon (#141414). Keep the control visually unfilled; use 4px internal icon/text separation when a chevron is present.

### Outlined Utility Button
**Role:** Secondary navigation conversion control

Use transparent fill, 1px solid Carbon (#141414), Carbon text, 2px radius, and padding 6px 8px 5px 12px. Keep the footprint compact rather than turning it into a large rounded CTA.

### Carbon Compact Button
**Role:** Dark public-site conversion button

Use Carbon (#141414) fill, White (#ffffff) text, 2px radius, and padding 6px 12px 5px. Button text follows nbInternationalPro 14px/19.6px weight 400 in navigation or 16px/22.4px weight 400 in main content.

### Pill Filter Button
**Role:** Compact selector or segmented utility control

Use transparent fill, Carbon (#141414) text and border, 200px radius, and padding 6px 8px 5px 12px. This is the only fully pill-shaped control treatment.

### Electric Blue Control
**Role:** Rare product-level saturated action

Use Electric Blue (#2200ff) fill with White (#ffffff) text and a 7.2px radius. Preserve the observed zero outer padding when it functions as a colored wrapper around a nested product control; do not substitute it for every public conversion button.

### Hero Action Pair
**Role:** Centered hero conversion controls

Place a Carbon Compact Button beside an Outlined Utility Button with a 8px gap. Use 16px body sizing for the central pair: Carbon fill with White text for the lead choice, then transparent fill with Carbon border and text for the alternate path.

### Product Workspace Frame
**Role:** Large embedded product demonstration

Build the software preview as a broad, pale interface composition with Tile Gray (#efefef) module surfaces, 16px outer corners, 1px dividers in rgba(0,0,0,0.10), and no card shadow. Use compact 11px to 17px nbInternationalPro UI text, with geistMono 15px/22.5px only for code-like details.

### Pale Logo Tile
**Role:** Customer proof mark container

Use Tile Gray (#efefef), 16px radius, no shadow, and 4px 0 padding. Center a monochrome Steel (#7d7d7d) partner mark; arrange repeated tiles in a horizontal multi-column band.

### Integration Tile
**Role:** Tool ecosystem card

Use Tile Gray (#efefef), 16px radius, no shadow, and 4px 0 padding. Place a subdued Steel (#7d7d7d) tool mark centrally and let repeated tiles form an irregular skyline rather than a dense icon list.

### Dark Bento Feature Card
**Role:** Inverse product capability panel

Use Graphite (#1f1f1f) fill, 16px radius, no shadow, and 0px padding on the outer card shell. Set headings in Mist (#e7e7e7) at 26.27px/32.84px weight 500; keep any contained interface or media inset rather than floating above the surface.

### Electric Inline Link
**Role:** Product detail link

Render nbInternationalPro in Electric Blue (#2200ff); use the 16px/24px body treatment where embedded in explanatory copy. Reserve this color for linked product names and selected textual emphasis, not all hyperlinks.

### Footer Link Group
**Role:** Legal and utility navigation

Use Paper (#f7f6f5) as the footer field with Carbon (#141414) links in nbInternationalPro 16px/24px weight 400. Separate items using 9px to 14px gaps and retain the same quiet, unfilled treatment as header links.

## Do's and Don'ts

### Do
- Use Paper (#f7f6f5) as the default page and navigation canvas.
- Set public navigation in nbInternationalPro 14px/19.6px weight 400 with 4px micro-gaps.
- Use Carbon (#141414) fill, White (#ffffff) text, 2px radius, and 6px 12px 5px padding for compact dark buttons.
- Use 16px radius for Tile Gray (#efefef) tiles and Graphite (#1f1f1f) bento cards.
- Set 64px display text at -2.56px tracking and 70.4px hero text at -2.816px tracking.
- Reserve Electric Blue (#2200ff) for emphasized headline fragments, product links, icon strokes, and the rare 7.2px-radius saturated control.
- Keep structural spacing on the 4px base unit; use 4px element gaps and 36px section gaps where the composition is not intentionally expansive.

### Don't
- Do not use bright color families beyond Electric Blue (#2200ff).
- Do not round standard Carbon buttons beyond 2px; reserve 200px radius for pill filters only.
- Do not give Tile Gray (#efefef) or Graphite (#1f1f1f) cards prominent drop shadows.
- Do not set display headings in 600 or 700 weight; use nbInternationalPro 500.
- Do not loosen large-heading tracking to normal; retain -0.04em on the 64px and 70px display steps.
- Do not use White (#ffffff) as the default page background when Paper (#f7f6f5) is available.
- Do not turn every link or button Electric Blue (#2200ff); most conversion controls remain Carbon (#141414).

## Elevation

Surfaces separate through Paper-to-Tile Gray contrast, 1px rgba(0,0,0,0.10) dividers, and 16px geometry rather than floating shadows. Keep cards flat; any product-frame lift should be limited to a faint ambient edge such as 0 1px 2px 0 rgb(0 0 0 / 0.05).

## Surfaces

- **Paper** (`#f7f6f5`) — Page canvas, header, and footer
- **Tile Gray** (`#efefef`) — Pale cards, logo containers, and integration modules
- **Mist** (`#e7e7e7`) — Light inverse text and subdued interface treatment
- **Graphite** (`#1f1f1f`) — Dark bento feature panels

## Imagery

Imagery is product-first: large contained screenshots of a coding-agent workspace act as explanatory proof, with pale UI panes, thin dividers, small metadata, and restrained blue code/result highlights. Customer and integration sections replace photography with monochrome logos and simplified tool marks centered in oversized Tile Gray rounded rectangles. Icons are small, mostly mono near-black or Steel marks; Electric Blue appears selectively in product indicators and strokes. The page is text-dominant, with visual space allocated to software evidence and tiled marks rather than lifestyle scenes or decorative illustration.

## Layout

The site is a full-page Paper canvas with a shallow horizontal top bar and centered public navigation groups. The opening screen uses a centered two-line display headline, a compact paired-action row, and a wide contained product-workspace preview directly beneath it. Subsequent sections use generous vertical whitespace for centered statements, then introduce evidence in horizontal logo-tile rows, broad product panels, and a staggered field of integration tiles; dark Graphite bento panels punctuate the otherwise pale sequence. The page remains text-led and editorial at section openings, then resolves each statement with software UI or monochrome marks rather than lifestyle imagery.

## Similar Brands

- **Linear** — Shares dense product-interface proof, tightly tracked grotesk displays, and a restrained monochrome canvas punctuated by a saturated accent.
- **Vercel** — Shares near-black utility controls, sparse public navigation, and software demonstrations that function as the central visual material.
- **Cursor** — Shares developer-tool positioning through editor-like product screenshots, compact technical labels, and dark product surfaces against a pale marketing page.
- **Notion** — Shares warm off-white page fields, thin black outlines, small utility typography, and low-elevation interface cards.
