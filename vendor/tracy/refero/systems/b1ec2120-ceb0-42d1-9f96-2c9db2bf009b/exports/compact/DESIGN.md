# Index — Style Reference
> editorial broadsheet with yellow highlighter — a stark black-and-white printed publication where #ffd600 marks the only point of emphasis

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Index reads as an editorial broadsheet translated to the web: near-total achromatic discipline, a single condensed serif for display headlines, and one highlighter-yellow accent used sparingly to mark what matters. Surfaces stay paper-white for most content, but the design flips to full-ink black for announcement bars and feature cards, creating high-contrast plate-like breaks rather than gradients or shadows. Typography does the heavy lifting — light-weight serif at 75–80px with aggressive negative tracking for headlines, a geometric sans for UI, and small uppercase labels with positive tracking as section markers. Components are flat, thin-bordered, and unornamented: links live as outlined text pills, buttons are 6px-radius rectangles, and the only color punctuation is a 16px yellow dot. The world map is rendered as a row of black triangular segments with yellow location pins — graphic, diagrammatic, and never illustrative.

## Colors

| Name | Value | Role |
|------|-------|------|
| Index Ink | `#000000` | Primary text, announcement bar background, dark feature cards, map silhouettes, hairline borders. The dominant structural color — used where ink would go on a printed page |
| Paper White | `#ffffff` | Page canvas, card surfaces, body backgrounds, inverted text on dark surfaces. The base layer of the entire system |
| Highlighter Yellow | `#ffd600` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |

## Typography

### ITCGaramondStdLtCond — Display headlines and editorial body. The condensed light Garamond at 75–80px is the brand's voice — narrow proportions and hairline weight make it feel printed, not digital. The 2.10 line-height appears for tall stacked address blocks. Free substitute: Cormorant Garamond Light (condensed cut if available), or Playfair Display Light as a looser alternative.
- **Substitute:** Cormorant Garamond Light, Playfair Display Light
- **Weights:** 300, 400
- **Sizes:** 20, 24, 40, 50, 75px
- **Line height:** 1.00, 1.05, 1.20, 2.10
- **Letter spacing:** -0.022em at 50px, 0.011em at 20px, 0.018em at small sizes

### ABCDiatypeLight — UI text, navigation, labels, buttons, body, input. The workhorse sans — geometric and clean with tight negative tracking at display sizes. Small sizes get slight positive tracking for legibility. Free substitute: Inter, or Söhne if licensed.
- **Substitute:** Inter, Söhne
- **Weights:** 300, 400
- **Sizes:** 12, 16, 24, 30, 50, 56, 80px
- **Line height:** 0.90, 1.10, 1.20, 1.25
- **Letter spacing:** -0.037em at 80px, -0.027em at 56px, -0.015em at 30px, -0.009em at 24px, 0.008em at 12–16px

### IndexLogotype — The wordmark 'Index' in the top-left navigation. A custom logotype only used at this single placement — not a body font. Do not substitute for headlines.
- **Substitute:** ITCGaramondStdLtCond 50px (closest visual match)
- **Weights:** 300
- **Sizes:** 50px
- **Line height:** 0.90
- **Letter spacing:** normal

### Times — Falls back to system Times for unstyled content. Not a brand choice — system fallback only.
- **Substitute:** serif
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.18px |
| body-sm | — | — | 16px | 1.2 | 0.128px |
| body | — | — | 20px | 1.2 | 0.22px |
| subheading | — | — | 24px | 1.2 | -0.216px |
| heading-sm | — | — | 30px | 1.2 | -0.45px |
| heading | — | — | 50px | 1 | -1.1px |
| heading-lg | — | — | 56px | 0.9 | -1.512px |
| display | — | — | 80px | 0.9 | -2.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **nav:** 6px
- **cards:** 16px
- **icons:** 6px
- **links:** 6px
- **buttons:** 6px

## Components

### Announcement Bar
**Role:** Site-wide notification strip

Full-width black (#000000) bar at the very top of every page. White text, ABCDiatype 16px, 1px top/bottom padding, left-aligned message. Contains a 'MORE' outlined text link button (1px white border, 6px radius, white text) and a close '×' icon right-aligned. No shadow, no rounding on the bar itself — flush with viewport edges.

### Top Navigation
**Role:** Persistent site header

Minimal white bar with three elements: 'Index' wordmark in IndexLogotype 50px at the left, a circular menu button (black border, 6px radius, three dots inside) beside it, and a cart counter (black circle with white number '0', ~24px) at the far right. Transparent/white background, no border, no shadow. Sits directly below the announcement bar.

### Outlined Text Link
**Role:** In-text navigation and tag link — the signature interaction

The most repeated component on the site. 1px solid #000000 border, transparent background, ABCDiatype uppercase text at 12–16px, 4–8px vertical padding and 6–8px horizontal padding, 6px border-radius. Examples: PROGRAMMING, CHINATOWN, GREENPOINT, NODES, ABOUT, RESOURCES, OUR DISCORD, LEARN MORE. On dark surfaces, the border and text invert to #ffffff. No fill state — always outlined.

### Filled Dark Button
**Role:** Primary compact action

Solid #000000 background, white ABCDiatype 12–16px uppercase text, 6px border-radius, 8px vertical and 20px horizontal padding. Used sparingly — the 'MORE' button in the announcement bar is the clearest example. Inverts to white-on-black only; never a chromatic fill.

### Editorial Display Headline
**Role:** Hero and section titles

ITCGaramondStdLtCond at 50–80px, weight 300, with aggressive negative letter-spacing (-0.022em to -0.037em) and tight line-height (0.90–1.00). Black on white, never reversed color. The condensed light weight + negative tracking combination is the most distinctive visual signature of the brand — it reads as broadsheet print, not web.

### Section Label
**Role:** Small uppercase category marker

ABCDiatype uppercase at 12–16px, weight 400, with positive letter-spacing (0.008–0.015em), black text. Used to label sections like 'ASYNCHRONOUS COURSES'. Sits above or beside content as a typographic marker, not a chip or pill — no border, no background.

### Dark Feature Card
**Role:** Promoted content block with full-bleed image

Full-width #000000 background, 16px border-radius. Two-column layout: left half is a tightly cropped photographic image (no rounding, bleeds to card edge), right half holds white ABCDiatype text and a white-bordered outlined text link button at the bottom. The 'Learn at your own pace' / asynchronous courses card is the reference. High contrast plate — appears as a dark band breaking up the white page.

### World Map Visualization
**Role:** Location directory graphic

A row of black triangular/pyramidal segments tiled horizontally to form a flattened world map silhouette. No fill detail, no coastlines — just the triangular lattice. Yellow (#ffd600) circular pins (~12–16px diameter) mark specific locations. Each pin anchors a stacked address block below in ABCDiatype 12–16px black. The map has no border or container — it bleeds full-width.

### Map Location Pin
**Role:** Map annotation marker

Solid #ffd600 circle, 12–16px diameter, no border, no shadow. Sits on the map at each physical location. The only yellow element in the entire system besides highlights — its visual weight is amplified by the total absence of other color.

### Location Info Block
**Role:** Address caption under map pin

Stacked three-line block: location name (ABCDiatype 16px bold/400), street address (ABCDiatype 12px), city/state/zip (ABCDiatype 12px). All #000000, left-aligned, 4–8px line spacing. Appears in a horizontal row beneath the map, one per pin.

### Menu Trigger Button
**Role:** Hamburger/menu toggle in nav

Circular or pill-shaped button with 1px black border, 6px radius, three horizontal dots inside (ellipsis indicator). White background, black icon. Tapping opens the navigation menu.

### Cart Counter Badge
**Role:** Notification dot in nav

Solid #000000 circle (~24px diameter) with white ABCDiatype number inside, positioned at the far right of the navigation. Functions as a cart or notification indicator. No border, no shadow.

## Do's and Don'ts

### Do
- Set display headlines in ITCGaramondStdLtCond at 50–80px, weight 300, with letter-spacing between -0.022em and -0.037em — this is the brand's most distinctive choice
- Use ABCDiatype (or Inter substitute) for all UI, navigation, body, and labels at 12–30px
- Use the outlined text link (1px border, 6px radius, transparent fill) as the default interactive element — reserve the filled black button for compact primary actions only
- Reserve #ffd600 exclusively for map pins and single-point highlights — never use it for backgrounds, text, or buttons
- Break long white pages with full-width black-surface bands (announcement bar, feature cards) to create high-contrast plate transitions
- Set letter-spacing to slightly positive values (0.008–0.015em) on text 16px and below for legibility, and to negative values above 24px for editorial density
- Keep all borders at 1px and all component radii at 6px (buttons, links, nav) or 16px (cards) — the system has only two corner-radius values

### Don't
- Don't introduce a third font family — the system runs on exactly two: ITCGaramondStdLtCond for display, ABCDiatype for everything else
- Don't use box-shadows for elevation — the system is deliberately shadowless; rely on color inversion and hairline borders
- Don't use #ffd600 for buttons, text, or large fills — it is a marker color, not a surface color
- Don't set display headlines at weight 400 or above in the serif — the hairline 300 weight is the signature; heavier weights break the broadsheet feel
- Don't use border-radius values other than 6px (small elements) or 16px (cards) — rounded corners should be subtle and uniform
- Don't add gradients — the system is strictly flat; color is solid, never blended
- Don't use chromatic borders for outlined buttons on dark surfaces — always invert to #ffffff border and text, not a color tint

## Elevation

The system uses zero box-shadows. Elevation is achieved entirely through color inversion — a black surface on a white canvas reads as 'raised' or 'emphasized' without needing shadow. This keeps the aesthetic flat and print-like. The only spatial separation comes from hairline 1px borders and generous whitespace.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas and all light content sections
- **Ink Plate** (`#000000`) — Dark surface for announcement bars, feature cards, and dramatic breaks

## Imagery

Photography appears only in the dark feature card as a full-bleed left-half image — a moody, dimly lit still life (open book among white lilies on dark ground) that matches the card's black surface. The primary visual element is the diagrammatic world map: a row of black triangular segments forming a simplified world silhouette, diagrammatic rather than illustrative, with yellow circular pins. No decorative gradients, no abstract graphics, no 3D renders. Icons are minimal — a three-dot menu glyph and a close '×' — rendered as simple line marks. The overall visual language is editorial broadsheet: high-contrast photography used sparingly, diagrammatic information graphics, and type as the dominant visual element.

## Layout

The page is full-bleed horizontally — the world map, announcement bar, and feature cards all span the full viewport width. Text content sits in a centered max-width container of ~1200px with generous left/right margins. The vertical rhythm alternates between white paper sections and black ink-plate sections, creating dramatic contrast breaks. The hero is a massive left-aligned serif headline that fills most of the first viewport. The map and location blocks form a full-width horizontal band. The dark feature card breaks the page with a full-bleed two-column image+text plate. Navigation is a minimal sticky-feeling white bar at the top with a dark announcement bar above it. The overall pattern reads top-to-bottom: announcement bar → nav → editorial hero headline → world map band → location directory → editorial headline + body text + outlined links → dark feature card → continuation content. No sidebar, no multi-column dashboard layout — this is a long-scroll editorial page, not an application.

## Similar Brands

- **Cooper Hewitt** — Same broadsheet editorial aesthetic — large condensed serif display headlines, achromatic palette, flat surfaces, and minimal UI ornamentation
- **Cabinet Magazine** — Same printed-publication typographic approach with tight-tracked serif headlines and a single restrained color accent on an otherwise monochrome page
- **Printed Matter** — Similar near-total-black-and-white palette with a single high-saturation yellow accent used for specific functional marks
- **Rhizome** — Cultural/arts organization with editorial web typography, minimal nav, and a diagrammatic visual approach to information
- **The New York Review of Books** — Same light-mode editorial layout with a condensed serif carrying the visual identity and hairline sans for secondary text
