# 12th Berlin Biennale for Contemporary Art — Style Reference
> Iris-and-ink broadsheet — violet skies over monumental black type on white paper.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The 12th Berlin Biennale reads as an iris-and-ink broadsheet: white paper canvas, monumental black geometric forms, and a single saturated violet (#7373ff) that functions as sky, border, and accent simultaneously. The system is editorial and constructivist — overlapping rectangular shapes at display scale carry the brand, while a geometric grotesque (ABCMonumentGrotesk) pairs with a transitional serif (BradfordLL) to create a high-contrast, catalog-like rhythm. Interactions are tight and rectilinear: 3px corners, 4px base spacing, hairline black or violet borders, and almost no shadow or gradient — visual weight comes from type size and color, not elevation. The page is text- and information-dense rather than spacious, with compact nav, overlapping panels, and event cards stacked close together like a biennale program leaflet.

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris Violet | `#7373ff` | Violet accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Deep Iris | `#23234d` | Decorative SVG fill for large geometric shapes and map elements — a darker register of the brand violet used for tonal depth inside illustrations, not for UI |
| Obsidian | `#000000` | Primary text, hairline borders on neutral actions and nav dividers, and the fill for the monumental hero shapes that overlap the headline |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text, and input backgrounds. The base layer everything else sits on |
| Ash Gray | `#f2f2f2` | Subtle surface fill for link backgrounds, list rows, and secondary button states — a quiet wash that distinguishes hover/focus from pure white without introducing chroma |
| Mist Gray | `#e7e7e7` | Nav panel background and low-emphasis surface tone — sits one step below Ash Gray for the overlapping side panel |

## Typography

### ABCMonumentGrotesk — Primary grotesque used for nav, headings, event cards, buttons, and most UI labels. The geometric construction and tight tracking give the site its editorial, catalog-like authority. Weight 400 carries body and nav; 700 is reserved for section headings and emphasis. Line-heights collapse to near-1.0 at display sizes — the type sits as flat architectural mass on the page.
- **Substitute:** Inter, Space Grotesk, or Neue Haas Grotesk
- **Weights:** 400, 700
- **Sizes:** 12, 14, 16, 17, 19, 20, 22, 25, 29, 32px
- **Line height:** 1.02–1.20 for headings, 2.00–2.40 for nav and list rows
- **Letter spacing:** -0.01em at display sizes, -0.004em at body, 0.01em for uppercase UI labels

### BradfordLL — Transitional serif used for long-form body copy, about-section paragraphs, and venue descriptions. Pairs with the grotesque to create a printed-publication rhythm — grotesque for chrome and headlines, serif for reading. The contrast between angular sans and humanist serif is the system's typographic signature.
- **Substitute:** Source Serif 4, Tiempos Text, or PT Serif
- **Weights:** 400
- **Sizes:** 20, 23, 30px
- **Line height:** 1.03–1.15
- **Letter spacing:** -0.01em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 14 | 0.12px |
| body-sm | — | — | 14px | 17 | — |
| body-lg | — | — | 17px | 20 | — |
| subheading | — | — | 19px | 23 | — |
| heading-sm | — | — | 22px | 23 | — |
| heading | — | — | 25px | 26 | — |
| heading-lg | — | — | 29px | 30 | — |
| display | — | — | 32px | 33 | -0.32px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 32px
- **Card padding:** 12px
- **Element gap:** 5-12px

### Border Radius

- **tags:** 3px
- **cards:** 3-7px
- **inputs:** 7px
- **buttons:** 3px
- **navPills:** 44px

## Components

### Overlapping Side Nav Panel
**Role:** Primary site navigation

Dark Obsidian (#000000) panel that overlaps the left edge of the page when activated. Contains nav links in ABCMonumentGrotesk 16-17px, white text, with hairline 1px white dividers between groups. Secondary links (Visit, Contact, Press) sit in a white sub-bar at the top with black 1px borders. Language switcher and search field stack at the bottom. The panel is the most visually dominant UI element — it declares the system as editorial, not corporate.

### Violet Outlined Action Button
**Role:** Primary interactive action

Transparent fill with 1-2px Iris Violet (#7373ff) border, Iris Violet text, ABCMonumentGrotesk 14-16px weight 700. 3px corner radius, 5-7px vertical padding, 11-12px horizontal padding. Used for nav items, tag pills, and program links. The violet border IS the brand signal — there is no filled violet button variant in the system.

### Neutral Outlined Button
**Role:** Secondary action

White fill with 1px Obsidian border, black text, 3px radius, 3-6px vertical and 5-11px horizontal padding. ABCMonumentGrotesk 14-16px. Used for language switcher (EN/DE), utility links, and less prominent actions.

### Pill Nav Button
**Role:** Top-bar utility actions (Guide, Menu)

White fill, 1px Obsidian border, 44px corner radius (fully rounded), ABCMonumentGrotesk 14px. The 'Guide' and 'Menu' buttons that anchor the top-left of every screen.

### Search Input
**Role:** Search field

White fill, 1px Obsidian border, 7px corner radius, ABCMonumentGrotesk 16px placeholder. Magnifying-glass icon button in 16px to the right. 8-10px padding all sides.

### Program Tag Pill
**Role:** Event category filter

White fill, 1px Obsidian border, 3px radius, ABCMonumentGrotesk 12-14px weight 700 uppercase. Compact 2-3px vertical padding, 11-12px horizontal. Tags like 'Performance', 'Guided Tour' that sit inside event cards.

### Event Card
**Role:** Program listing entry

White surface, 1px Obsidian border, 3-7px radius, 12px padding. Date row in 12px uppercase, title in ABCMonumentGrotesk 19-25px, venue line in 12px. Some event cards have a dark Obsidian variant with white text and Iris Violet accents. Cards stack vertically and are information-dense rather than spacious.

### Venue Card
**Role:** Venue directory entry

White surface, 1px Obsidian border, 7px radius, 12-16px padding. Letter label (A, B, C) at top, venue name in ABCMonumentGrotesk 19-25px, action links (Info, Program, Artists, Directions) as small outlined buttons below. Compact, directory-card feel.

### Hero Date Block
**Role:** Exhibition date display

Iris Violet (#7373ff) full-bleed background section with large ABCMonumentGrotesk 29-32px text in Obsidian or white. Dates stack vertically with tight line-height. This is the brand's most identifiable surface — the violet sky over the event.

### Overlapping Hero Type Block
**Role:** Display headline container

Massive Obsidian (#000000) filled rectangles and half-circles that overlap the Iris Violet background, with ABCMonumentGrotesk 32px+ display text in Iris Violet sitting on top. The shapes ARE the layout — the '12' numeral and 'Berlin Biennale for Contemporary Art' title sit inside and beside these forms. This is the system's signature visual.

### Language Switcher
**Role:** Locale selector

Compact group of 3 outlined buttons (EN, DE, Easy Language), 3px radius, 1px Obsidian border, ABCMonumentGrotesk 12px. Sits at the bottom of the side nav panel.

### Map Overlay
**Role:** Venue map

Iris Violet background with deep iris line work for streets. White diamond-shaped venue markers labeled A–F. No conventional map chrome — the map is treated as a brand-colored graphic, not a utility.

### Info Card
**Role:** About / descriptive text block

White surface, no border or shadow, ABCMonumentGrotesk 19px for the 'About' label and BradfordLL 20-30px for the paragraph text. The serif body is the strongest typographic contrast in the system and signals 'readable content' vs. navigational chrome.

## Do's and Don'ts

### Do
- Use Iris Violet (#7373ff) for section backgrounds, outlined action borders, and heading accents — it is the only chromatic color and should appear at scale, not as a tiny dot.
- Pair ABCMonumentGrotesk for all UI, nav, and headlines with BradfordLL for long-form body copy — the grotesque/serif contrast is the system's typographic signature.
- Use 3px border-radius for buttons, tags, and links; 7px for inputs and cards; 44-64px for pill-shaped nav buttons only.
- Build visual hierarchy with type size and color contrast, never with box-shadow — the design is flat and printed, not elevated.
- Set body and nav text in ABCMonumentGrotesk with line-height 2.0-2.4 for generous row spacing in compact lists; collapse line-height to 1.02-1.15 at display sizes.
- Let large Obsidian (#000000) shapes overlap content sections as graphic architecture — flat rectangles, half-circles, and irregular polygons placed behind or beside display text.
- Use 1px Obsidian borders as the default divider and component outline; Iris Violet borders are reserved for the most important interactive elements.

### Don't
- Do not add box-shadow, blur, or drop-shadow effects to any component — the system is deliberately flat.
- Do not use gradient fills — the palette is entirely solid color.
- Do not introduce additional chromatic colors; the only saturated hue is Iris Violet.
- Do not use Filled violet buttons as primary CTAs — the system uses outlined violet actions and neutral outlined buttons, not filled chromatic buttons.
- Do not set body text in ABCMonumentGrotesk; serif (BradfordLL) is reserved for paragraphs to create the grotesque/serif rhythm.
- Do not use large corner radii (12px+) on standard buttons, tags, or cards — only pill-shaped nav elements get 44px+ radii.
- Do not place content on a colored background without considering the overlap behavior — sections are designed to layer, not sit in isolated containers.

## Elevation

The system deliberately avoids box-shadow elevation. Visual hierarchy is built through type scale, color contrast, overlapping flat shapes, and hairline 1px borders. Components feel printed rather than floating.

## Surfaces

- **Paper White** (`#ffffff`) — Base canvas and content card background
- **Ash Gray** (`#f2f2f2`) — Subtle wash for list rows, link hovers, and soft button states
- **Mist Gray** (`#e7e7e7`) — Overlapping side-panel surface, one step recessed from content
- **Iris Violet** (`#7373ff`) — Section-background canvas for date/title blocks and event overlays
- **Obsidian** (`#000000`) — Hero shape fills and full-bleed dark bands

## Imagery

Imagery is minimal and graphic — the system itself is the visual. Large flat geometric shapes (rectangles, half-circles, polygons) in Obsidian and Iris Violet serve as the primary visual content, functioning as both layout structure and branding. Event cards and venue markers provide the only representational content. The map is stylized as a violet-tinted line drawing rather than a realistic map. No photography, no illustration, no 3D renders — the aesthetic is constructivist broadsheet, not image-heavy editorial.

## Layout

Full-bleed page with no fixed max-width containment; sections span edge to edge. The hero uses an Iris Violet background with massive overlapping Obsidian shapes carrying the '12' numeral and 'Berlin Biennale for Contemporary Art' display headline. Content sections alternate between white canvas and Iris Violet full-bleed bands. A dark side-nav panel overlaps the left edge from any position on the page. Below the hero, content flows as a compact, information-dense stack: program tags row, about paragraph, event cards in a grid (3 columns), venue cards, and a full-width venue map. Event cards alternate between white and Obsidian variants for rhythm. Spacing between sections is tight (32px) — the page reads as a single broadsheet, not as isolated screens.

## Similar Brands

- **ICA (Institute of Contemporary Arts)** — Same editorial broadsheet approach with high-contrast type, single accent color, and overlapping geometric hero blocks over flat color sections.
- **MCA Chicago** — Museum site using Monument-Grotesk-family type, flat color blocks, and minimal border-radius on all components.
- **Manifesta** — European biennale platform with constructivist layout — full-bleed violet/color sections, hairline borders, compact card grids, and display-scale numerals.
- **Serpentine Galleries** — Contemporary art institution site that pairs a geometric grotesque for nav with serif for long-form text, and uses a single saturated brand color against black and white.
- **KW Institute for Contemporary Art** — Berlin contemporary-art peer with flat-shape hero compositions, tight 4px-base spacing, and a design-forward rather than utility-first approach.
