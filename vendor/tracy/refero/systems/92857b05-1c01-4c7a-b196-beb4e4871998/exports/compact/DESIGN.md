# Julia Krantz — Style Reference
> Darkroom contact sheet — a grid of photographic tiles on pure black, identity spelled in barely-visible weight-300 letterforms.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Julia Krantz's portfolio operates like a darkroom contact sheet — dense grid of image tiles on near-black, with stark white typography hovering over photography. The canvas is #000000, surfaces are pure darkness, and the only warmth comes from the photographic content inside each tile. Typographic restraint is extreme: ClashDisplay at weight 300 for large display initials (the abbreviated project codes 'Se', 'Fd', 'Ga') creates a barely-there identity mark, while DM Sans at weight 300 handles all body and navigation at 10-14px with wide tracking. The grid is the interface — a mosaic of image tiles with 1px solid rgba(248,248,248,0.12) borders separating them, no rounded corners anywhere, no shadows, no gradients. Color is entirely absent from the UI layer; all chromatic interest is delegated to the photography.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, all section backgrounds — the true floor of the UI; every element floats above absolute black |
| Salt | `#f8f8f8` | All text, links, nav labels, borders, icons — the single foreground tone serving every text and UI edge function against black |
| Ash | `#707070` | Secondary labels, muted nav text, subdued body copy — mid-tone for visual hierarchy without introducing any hue |
| Ghost Line | `rgba(248,248,248,0.12)` | Grid tile borders, dividers — rgba(248,248,248,0.12) at 12% opacity; nearly invisible structural seams |
| Veil | `rgba(248,248,248,0.45)` | Overlay labels, secondary text on image tiles — rgba(248,248,248,0.45) at 45% opacity for text sitting over photography |

## Typography

### DM Sans — All body copy, navigation labels, press list items, links, captions. Weight 300 across every size — the site refuses to bold anything in this family, keeping the text layer visually quiet against photography.
- **Substitute:** DM Sans (Google Fonts — same family)
- **Weights:** 300
- **Sizes:** 10px, 12px, 13px, 14px
- **Line height:** 1.30 – 1.72
- **Letter spacing:** 0.06em at small sizes (10-12px), 0.07em at 13-14px — wide tracking compensates for the light weight at small sizes

### ClashDisplay — Project initials on tiles (44px weight 300, tracking -0.04em), section codes and labels (12-14px weight 300, tracking +0.05em to +0.14em), name logotype. The 44px weight-300 display setting — a nearly invisible letterform over a photograph — is the signature visual move of the portfolio.
- **Substitute:** Cabinet Grotesk (Fontshare) or Space Grotesk (Google Fonts)
- **Weights:** 300, 500
- **Sizes:** 10px, 12px, 14px, 29px, 44px
- **Line height:** 1.00 at display / 1.72 at text sizes
- **Letter spacing:** -0.04em at 44px display; +0.04em to +0.14em at 10-14px label sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.3 | 0.6px |
| heading | — | — | 29px | 1 | -1.16px |
| display | — | — | 44px | 1 | -1.76px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 30px
- **Card padding:** 16px
- **Element gap:** 6px

### Border Radius

- **cards:** 0px
- **tiles:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Project Grid Tile
**Role:** Primary portfolio navigation — each tile is a cropped photograph with abbreviated project code overlaid

Full-bleed photograph filling the tile. No border-radius (0px). Border: 1px solid rgba(248,248,248,0.12). Project code (e.g. 'Cd', 'Ga') in ClashDisplay 44px weight 300, #f8f8f8, letter-spacing -0.04em, positioned top-left with 16px padding. Sequential number ('01', '02') in DM Sans 10px weight 300, #707070, top-left above the code. Practice/category label in DM Sans 10px weight 300, tracking 0.14em, #707070 below project name. Hover: filter: brightness(0.82) transition 0.4s ease.

### Name Logotype
**Role:** Primary identity mark in the top-left header

ClashDisplay weight 500, approximately 29px, #f8f8f8, letter-spacing -0.04em. Sits against #000000 background with 16px left padding. No decoration, no logo mark — text is the entire brand.

### Navigation Link
**Role:** Top-right global nav: Magic Fabric ↗, Bio, Contact

DM Sans 12px weight 300, #f8f8f8, letter-spacing 0.06em. External links include '↗' glyph appended directly. No underline by default. Color transitions to rgba(248,248,248,0.45) on hover over 0.2s ease. No background, no border, no padding block.

### About Bio Block
**Role:** Multi-column text section with label headers

Background #000000. Column header label (e.g. 'ABOUT', 'PRESS') in DM Sans 10px weight 300, #707070, letter-spacing 0.07em, uppercase. Body text in DM Sans 13px weight 300, #f8f8f8, line-height 1.72. Paragraph margin-bottom 3px. Column gap 20-32px. Top border: 1px solid rgba(248,248,248,0.12) separating from header.

### Press List Item
**Role:** Numbered external press links within the bio section

DM Sans 12px weight 300, #f8f8f8. Number prefix in #707070. '↗' arrow glyph after publication name. Spacing: margin-bottom 3-4px per item. On hover: color transitions from #f8f8f8 to rgba(248,248,248,0.45) over 0.2s ease.

### Email CTA Link
**Role:** Contact email in the top-right of the header, the site's only direct CTA

DM Sans 12px weight 300, #f8f8f8. Followed by ' →' directional arrow. Letter-spacing 0.06em. Small dot indicator (8px circle, #f8f8f8) sits adjacent — likely an availability indicator. No button chrome — plain text link on black.

### Section Divider
**Role:** Horizontal rule separating header from bio section and bio section from grid

1px solid rgba(248,248,248,0.12). Full-width of container. No margin offset — content begins immediately below.

### Category Label
**Role:** Small uppercase tag beneath project initials on tiles

DM Sans 10px weight 300, #707070, letter-spacing 0.14em. Values: 'PRACTICE', 'ARCHIVE', 'BLOG'. All-caps text transform. No background, no border — pure typographic label.

### Archive Year Badge
**Role:** Year label on archive tiles (e.g. '· 2009', '· 2011')

DM Sans 10px weight 300, rgba(248,248,248,0.45). Preceded by middot separator. Inline after project title on tile.

## Do's and Don'ts

### Do
- Use #000000 for all backgrounds — the CSS token --bg: #000 is absolute; never substitute dark gray or near-black
- Set all ClashDisplay display headings (44px tile codes) at weight 300 with letter-spacing -0.04em — the ultra-light setting against photography is the signature move
- Apply 1px solid rgba(248,248,248,0.12) for every structural border: tile separators, section dividers, column rules
- Keep all interactive hover states to color/filter transitions only — color: rgba(248,248,248,0.45) for links, filter: brightness(0.82) for image tiles, 0.2s ease
- Use 0px border-radius on every element — tiles, any containers, any interactive elements. The sharp-corner rule is absolute
- Maintain DM Sans weight 300 for all body, nav, and label text — no bold text anywhere in the UI layer
- Express secondary hierarchy through #707070 (section labels, numbers, category tags) — never through size increases or weight changes

### Don't
- Never add any color to the UI chrome — buttons, links, labels, borders must remain in the #f8f8f8 / #707070 / rgba opacity system only
- Never round corners — no border-radius on tiles, containers, or any interactive element; 0px is non-negotiable
- Never use font weight above 500 — ClashDisplay 500 is the ceiling and used only for the name logotype; DM Sans stays at 300
- Never add box-shadows or elevation — the design has zero shadow tokens; depth comes from contrast with the black canvas only
- Never add hover backgrounds or button fills — interactive states change text opacity or image brightness only, never add a background color
- Never introduce gradients, overlays, or tinted backgrounds — the CSS tokens confirm no gradient system exists; #000 is the only background
- Never separate the category label from its tile project code with more than 4px margin — the tight stacking (4px marginBottom between elements) is the spatial rhythm

## Elevation

Zero shadows across the entire system. Depth is created purely by the contrast between the black canvas and photographic tile content. No box-shadow values appear anywhere; the 1px rgba(248,248,248,0.12) border is the only surface separator. Hover states use filter: brightness(0.82) — darkening the image rather than lifting the element.

## Surfaces

- **Void Canvas** (`#000000`) — Base page background, section backgrounds, nav bar
- **Image Tile** (`#111111`) — Grid project tiles — filled with photography, bordered by Ghost Line 1px

## Imagery

Photography-dominant — every project grid tile is a full-bleed photographic crop: fashion portraiture, macro textile/material studies, AI-generated imagery, event photography. Photographs are raw-edged, sharp-cornered, zero border-radius. Images are not contained or padded — they fill their tile completely, edge to edge. No lifestyle staging context visible; images are treated as abstract color fields at tile scale, only readable as subjects when enlarged. Color in the UI exists exclusively within these photographs — from vivid AI-generated chromatics to desaturated fashion editorial. The photographic density IS the design: at the grid scale, the tiles form a chromatic mosaic against black. Icons: minimal use of directional glyphs ('↗', '→') inline with text, no standalone icon components. No illustrations, no 3D renders in the UI chrome.

## Layout

Full-bleed, no max-width container. Header bar spans full width: name logotype pinned left, email and nav pinned right, both at 16px horizontal padding. Bio section below header uses a multi-column horizontal layout — approximately 4-5 text columns (About, Press, Speaking, Podcasts, Links) filling full width with 20-32px column gaps. Grid section below bio: 10-column mosaic of variable-width tiles in rows, each tile filled with photography. Tiles vary in width — some span one column, some two — creating a journalistic contact-sheet rhythm. No gutters visible between tiles except the 1px Ghost Line border. Navigation is a minimal top-right inline set of 3 links. No sidebar, no sticky header. The entire page scrolls vertically with no section anchoring or visual dividers beyond the Ghost Line horizontal rule.

## Similar Brands

- **Hiepler & Brunier (photographer portfolio)** — Same black-canvas grid-of-photographs approach where photography provides all color and UI chrome is pure white typography on black
- **Bureau Borsche** — Identical ultra-light weight-300 display typography as identity mark, with text-only brand and no decorative UI elements
- **Cargo Collective (minimal dark template)** — Same mosaic grid of full-bleed images with zero-radius tiles and typographic labels floating over photography
- **Koto Studio portfolio** — Shared achromatic UI-layer philosophy where brand color is entirely absent from chrome and delegated to content imagery
