# NEON Rated — Style Reference
> cinematic gallery behind crimson neon

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

NEON operates as a cinematic poster wall in browser form: near-total achromatic restraint broken by a single deep crimson that only appears at brand-significant moments — the wordmark bar, release-date tags, and micro-accents. The interface is essentially a frame; the films are the content. A custom grotesque (Flatspot) handles every piece of UI at compact sizes with tight negative tracking, while a dramatic display face (Girott) is reserved exclusively for titanic section titles that bleed past 100px and anchor entire pages. Components are minimal: cards are raw image frames with thin borders, buttons are flat pills or sharp rectangles, and there is no shadow language to speak of — depth comes from film photography itself, not from chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Crimson Marquee | `#821e1e` | Brand wordmark bar, release-date tags, selected-state borders, and the singular chromatic accent that anchors an otherwise monochrome system — deep, slightly oxidized, never orange, never bright |
| Ink | `#000000` | Primary text, icon strokes, heading color, button text, and dark-surface fills (hero overlay, footer) |
| Paper | `#ffffff` | Page background, card surface, button text on dark fills, input fields, badge text |
| Bone | `#f3f3f3` | Alternate card surface and section background, used to separate one row of film tiles from the next without a hard divider |
| Silver | `#e5e7eb` | Hairline borders on cards, buttons, inputs, and dividers — the universal 1px rule that frames almost every element |
| Smoke | `#cccccc` | Secondary surface tint and shadow base; used sparingly where a surface needs to read as slightly recessed from Bone |
| Cornflower | `#9dc1fb` | Focus ring and link/hover halo only — a cool sky-blue that signals interactivity without competing with the crimson brand color |

## Typography

### Flatspot — Universal UI typeface: navigation, body copy, button labels, metadata tags, card titles, section headers, icons, and badge text. Tight negative tracking across the board (-0.010em to -0.012em) keeps even the smallest 9px labels legible and compressed. The 500 weight is the default for most running text; 700 is reserved for uppercase section titles and emphasis.
- **Substitute:** Inter, Neue Haas Grotesk, or Suisse Int'l
- **Weights:** 400, 500, 700
- **Sizes:** 9px, 10px, 12px, 14px, 16px
- **Line height:** 1.00 – 1.50
- **Letter spacing:** -0.0120em, -0.0110em, -0.0100em

### Girott — Display-only face used for page heroes and feature titles. The 160px / 0.80 line-height / -0.031em tracking combination is the signature move: a single film title bleeds across the full viewport edge-to-edge, set tight against itself so descenders nearly touch ascenders. The 36-42px range covers secondary display moments (sub-hero headlines, featured card titles).
- **Substitute:** Druk, Condensed, or Test Press
- **Weights:** 400, 700
- **Sizes:** 36px, 41px, 42px, 160px
- **Line height:** 0.80 – 0.90
- **Letter spacing:** -0.031em at 160px, -0.030em at 36-42px

### Flatspot — (Letter-spacing note) Body and body-small run on -0.010em to -0.011em tracking; the 9-10px caption/metadata tier sits at -0.012em — tighter as the size shrinks, which is unusual and gives the tiniest text a compressed, almost stenciled feel.
- **Weights:** 400
- **Sizes:** 9px, 10px, 12px, 14px, 16px
- **Line height:** 1.40
- **Letter spacing:** -0.012em at 9-10px, -0.010em at 14-16px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| heading | — | — | 36px | 0.9 | -1.08px |
| heading-lg | — | — | 42px | 0.9 | -1.26px |
| display | — | — | 160px | 0.8 | -4.96px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 120-160px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **tags:** 4px
- **cards:** 8px
- **pills:** 100px
- **badges:** 80px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Crimson Brand Bar
**Role:** Primary navigation header

Solid #821e1 rectangle spanning the top of every page, containing a left-aligned hamburger icon, the centered NEON wordmark in white Flatspot 700, and a right-aligned cluster of search/heart/bag icons in white. Height is compact (~40px). The bar acts as the single constant chromatic element in the otherwise monochrome interface.

### Full-Bleed Hero Slide
**Role:** Landing-page feature presentation

Edge-to-edge landscape photograph with no padding or border, overlaid by a massive Girott display title (typically a single film name) in white, positioned bottom-left at 160px. A small uppercase Flatspot 12px 700 tag in #821e1 ('IN THEATERS MAY 1, 2026') sits above the title. A row of pagination dots (small circles, active = #821e1e) anchors the bottom center. The next slide peeks from the right edge, creating a card-stack effect.

### Film Tile Card
**Role:** Catalog browsing unit

Landscape image card (roughly 2:1 or 16:9 aspect) with no padding, no shadow, and a 1px #e5e7eb hairline border on all sides. 8px corner radius. The film title sits directly beneath the image in Flatspot 16px 500 in black, flush-left with no extra spacing. A small uppercase release-date tag in Flatspot 9-10px 700 in #821e1 overlays the top-left corner of the image itself. Cards are arranged in a horizontally scrolling row.

### Section Header
**Role:** Content section label

Uppercase Flatspot 36-42px 700 in #000000, flush-left, no underline or ornament. Paired with left/right navigation arrows (thin #000 line icons) for scrollable rows, or with a 'SEE ALL' ghost link on the right for static sections. Sits with generous vertical breathing room above the card row (60-80px).

### Ghost Directional Arrow
**Role:** Horizontal scroll control

Minimal thin-line left/right chevron icon, 16-20px, #000000, no background, no border, no padding. Floats inline next to section headers. The flatness of the control is deliberate — it must not compete with the film artwork.

### Outlined Tag Badge
**Role:** Release-date / status label

Small uppercase Flatspot 9-12px 700 in #821e1, no background fill, no border, no padding. Sits as a free-floating overlay on card images or as an inline label next to a section title. Occasionally enclosed in a 1px #821e1 border with 4-8px padding to form a pill variant.

### Footer Bar
**Role:** Page-bottom information strip

Solid #000000 band, full-width, with secondary navigation links and legal text in white Flatspot 12-14px 400. Minimal padding (20-40px vertical). No social icons, no newsletter form — purely utility.

### Cookie Consent Badge
**Role:** Persistent privacy notice

Small circular icon, 40-48px diameter, #9dc1fb (cornflower) background with a white flat icon centered. Fixed to the bottom-right corner of the viewport. The single use of the cornflower accent in production UI.

### Pagination Dots
**Role:** Hero carousel progress indicator

Row of 8-12 small circles, 6-8px diameter, spaced ~8px apart, centered horizontally at the bottom of the hero. Active dot filled in #821e1e; inactive dots are outlined #cccccc or #ffffff at low opacity. No numbers, no labels.

### In-Text Link
**Role:** Inline navigation / emphasis

Flatspot body-weight text in #000000, no underline by default, with a subtle #9dc1fb box-shadow halo on hover (the only interactive feedback in the system). Links never use a chromatic color for their default state.

### Input Field
**Role:** Search / form input (used in search overlay)

White (#ffffff) background, 1px #e5e7eb border, 4px corner radius, compact height (~36-40px). Placeholder text in #cccccc, Flatspot 14px 400. Focus state replaces the border with a #9dc1fb box-shadow ring (rgba-based, not a real border-color change).

## Do's and Don'ts

### Do
- Use #821e1 exclusively for the brand bar, release-date tags, and active pagination — never as a background fill for buttons or cards.
- Set display titles in Girott at 36px or larger with line-height 0.80-0.90 and tracking -0.030em to -0.031em; never set Girott below 36px, and never set body copy in Girott.
- Frame every film card and button with a 1px #e5e7eb border; use 8px radius on cards and 4px on buttons/inputs — these two values are the entire radius language.
- Let film photography provide all visual interest — do not add decorative gradients, background patterns, or illustration behind text.
- Keep the UI monochrome except for the brand bar: default text is #000000 on #ffffff or #f3f3f3, icons inherit text color, and the only chromatic accent is #821e1 at the brand-significant moments.
- Compress letter-spacing tighter as type size shrinks: -0.012em at 9-10px, -0.011em at 12px, -0.010em at 14-16px. This inverse relationship is a signature — do not normalize to a single tracking value.
- Maintain compact spacing throughout: 10px element gaps, 20px card padding, and at least 120px between major sections so film tiles can breathe.

### Don't
- Do not introduce additional accent colors. The system is monochrome-plus-crimson; any second chromatic will dilute the poster-gallery feel.
- Do not use box-shadow or drop-shadow for elevation. Depth comes from the 1px silver border and from film photography, not from CSS shadow stacks.
- Do not set body text larger than 16px or smaller than 9px — Flatspot is the workhorse only between these bounds.
- Do not mix the two typefaces on the same line. Flatspot handles everything except the display moment; Girott handles only the display moment.
- Do not center body copy or section headers. NEON is flush-left editorial — every text block, button, and label starts from the same vertical axis.
- Do not add rounded corners beyond 8px on standard components. Pill shapes (80-100px) are reserved for badges and tag overlays only.
- Do not animate or transition color on hover. The cornflower box-shadow halo is the only interactive feedback — adding color shifts, underlines, or transforms will break the static poster aesthetic.

## Elevation

Elevation is deliberately absent from the design system. With only one shadow occurrence in the entire codebase (rgba(0,0,0,0.2) 0px 4px 8px 0px, used twice), depth is communicated through the film photography itself, not through CSS shadows. Cards do not float; they sit directly on the canvas separated by 1px silver borders. This keeps the UI flat, editorial, and poster-like — closer to a magazine spread than a web app.

## Surfaces

- **Paper** (`#ffffff`) — Primary page canvas — the wall everything hangs on
- **Bone** (`#f3f3f3`) — Alternating section background, introduces a subtle off-white band to break up horizontal tile rows
- **Smoke** (`#cccccc`) — Rarely used recessed tint for tertiary surfaces or shadow fills

## Imagery

Film photography is the entire visual language. Every section is a horizontal row of landscape-format stills from NEON's catalog — 2:1 or 16:9 crops, never portrait, never square. Images are presented raw: no duotone treatment, no color grading, no overlay tint. The hero uses a full-bleed frame-filling photograph with the film title composited directly over it. There is no lifestyle photography, no abstract illustration, no 3D rendering, and no icon system beyond thin-line UI glyphs (hamburger, search, heart, bag, arrows). Photography density is extremely high — the page is essentially a streaming catalog where imagery occupies 70-80% of the visible area and text fills the gaps.

## Layout

Full-bleed viewport-width design with no centered max-width column. The hero is an edge-to-edge photographic slide that occupies the full viewport height (~85vh) with no padding. Below the hero, content is organized into horizontal scrolling rows, each introduced by a large flush-left section header in Girott or heavy Flatspot. Cards within rows are landscape tiles arranged in a horizontal track that scrolls left-to-right; arrows sit beside the section header to signal scrollability. Sections alternate between #ffffff and #f3f3f3 backgrounds to separate one catalog row from the next without hard dividers. The navigation is a thin fixed top bar, not a sidebar. The overall rhythm is: full-bleed hero → header + horizontal scroll row → header + horizontal scroll row → footer.

## Similar Brands

- **A24** — Same poster-as-website philosophy: nearly monochrome interface where film photography carries 90% of the visual weight, single bold display type for titles, and an almost editorial restraint in the UI chrome.
- **MUBI** — Same horizontal-scrolling catalog rows of landscape film stills, same flush-left uppercase section headers, same compact grotesque body type, same anti-decoration approach to the interface.
- **Criterion Channel** — Same archival-gallery sensibility: film stills presented raw in uniform card frames with hairline borders, minimal UI ornamentation, and a typographic hierarchy that lets the catalog do the talking.
- **Sideshow / Janus Films** — Same cinephile-distributor restraint: the brand treats itself as a frame for the films rather than a platform, using near-zero decorative chrome and letting the photography and titles carry the page.
