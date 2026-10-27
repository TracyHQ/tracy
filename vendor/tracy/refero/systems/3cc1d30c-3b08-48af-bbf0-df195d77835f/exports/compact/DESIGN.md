# Piet Oudolf — Style Reference
> Botanical index on white paper.
A field guide to gardens, set in light type with the restraint of a museum wall label.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Piet Oudolf's site is a typographic herbarium pressed flat on white paper: a single column of oversized, whisper-weight place names punctuated by tiny two-letter country codes, all rendered in pure grayscale. The system refuses every conventional interface signal — no fills, no shadows, no accent hues, no rounded corners, no gradients — letting scale contrast and a single hairline rule carry the entire hierarchy. Whitespace is the dominant material; elements sit on an infinite white field with surgical, near-calligraphic gaps between them. The mood is botanical index meets art-book colophon: the design disappears so the named gardens can breathe.

## Colors

| Name | Value | Role |
|------|-------|------|
| Field White | `#ffffff` | Page canvas, text on dark inverted sections, and link underline anchor for body copy |
| Charcoal Black | `#000000` | SVG icon fills and absolute typographic black where maximum contrast is needed (headings against light imagery) |
| Lead Gray | `#808080` | Primary type, all link and border lines, and the connective tissue of the system — every hairline rule, navigation separator, and body character sits here |
| Ash Gray | `#b3b3b3` | Navigation labels, muted metadata, footer text, and the secondary tonal floor that recedes behind lead-gray working type |
| Smoke | `#999999` | Subtle border accent used sparingly to separate tertiary structural elements |

## Typography

### Maison Neue Book — Signature display face for project titles and section headings — 60px at weight 300 is the defining choice, letting each garden name whisper across the page rather than announce
- **Substitute:** Canela, Tiempos Headline Light, or a thin cut of a humanist sans
- **Weights:** 300
- **Sizes:** 60px
- **Line height:** 1.25
- **Letter spacing:** normal

### UniversLTStd-Light — Workhorse sans for navigation, country-code labels, body, footer, and all meta information — 12px handles the tiny geo tags above project names, 15px carries paragraph body at generous 1.87 leading for editorial breathing room
- **Substitute:** Univers Next Pro Light, Aktiv Grotesk Light, or Inter Light
- **Weights:** 400
- **Sizes:** 12px, 15px
- **Line height:** 1.60, 1.87, 2.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.6 | — |
| body | — | — | 15px | 1.87 | — |
| display | — | — | 60px | 1.25 | 0px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 60px
- **Card padding:** 40px
- **Element gap:** 6px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Full-bleed white bar with 40px top/bottom padding. Left: brand wordmark 'Piet Oudolf' in 15px UniversLTStd-Light #808080. Center: nav items 'Projects', 'Information', 'Private Garden' at 15px, #808080. Right: search icon. 6px gap between nav items. No border, no background, no shadow.

### Country Code Tag
**Role:** Geographic metadata for each project entry

Tiny 12px UniversLTStd-Light at 1.6 line-height, set in lead gray #808080. Appears directly above its associated project name, 3px gap. Two-letter uppercase abbreviation (US, DE, NL, SE, UK, IT, SP, JP, KR). The only typographic ornament in the system — functions as a herbarium label.

### Project Title Link
**Role:** Primary clickable entry — the core content unit

60px Maison Neue Book weight 300 at 1.25 line-height, #808080. Underlined with a 1px #808080 rule offset 3px from baseline. 22px left indent from the country tag column. Hovered titles shift to #000000. Punctuation is a trailing comma, turning the list into a continuous typographic sentence.

### Side Margin Label
**Role:** Vertical section indicator

Rotated 90° text reading 'Public gardens' / 'Private gardens' in 12px UniversLTStd-Light #808080, sitting in the left margin. Anchors the reader's orientation to which index they are reading.

### Inline Link
**Role:** Connected text link within body or nav

UniversLTStd-Light 15px #808080 with a 1px #808080 underline, 3px offset below baseline. No color change, no background — interaction is conveyed through the underline alone.

### Search Icon
**Role:** Utility trigger in the top right of navigation

SVG glyph at #000000, minimal line weight, approximately 16px. No border, no background, no hover state beyond cursor.

### Footer
**Role:** Site colophon and secondary links

UniversLTStd-Light 12px #b3b3b3, generous 2.33 line-height for breathing room. Left-aligned, separated from main content by 60px vertical gap. No dividers, no columns — a quiet block of small gray type.

## Do's and Don'ts

### Do
- Set all project and section titles at exactly 60px Maison Neue Book weight 300 — never bold, never above 300
- Use 12px UniversLTStd-Light for all metadata, country codes, and side labels at 1.6 line-height
- Use 15px UniversLTStd-Light for body copy and navigation at 1.87 line-height for editorial airiness
- Render every link with a 1px #808080 underline offset 3px from the baseline — no fill, no border box, no background color
- Indent every project link exactly 22px from the country code column so the tag and title align as a herbarium pair
- Let the page breathe: use 60px horizontal padding on hero sections and 40px vertical padding on the nav bar
- Keep the page at 0% colorfulness — grayscale only, no accent hues, no brand color, no filled buttons

### Don't
- Never introduce a brand color, accent, or fill of any kind — the monochromatic palette is the identity
- Never set a project title below 48px or above 64px — the 60px headline scale is a fixed point of the system
- Never add shadows, gradients, glows, or any form of z-axis depth to cards, buttons, or containers
- Never round corners — all radii are 0px; the system is deliberately rectilinear like a printed page
- Never bold body or heading type — weight 300 is the ceiling for display, weight 400 for everything else
- Never place more than 6px between an inline link and its sibling, or more than 3px between text and its underline
- Never use a filled button, pill, or chip — interaction is expressed only through typographic underlines

## Elevation

Zero elevation. The design intentionally eschews all shadows, borders on content blocks, and z-axis depth — every element lives on the same white plane. Hierarchy is built purely through typographic scale, whitespace, and a single hairline rule. This flatness is core to the system: it makes the site read as a printed field guide rather than a software interface.

## Surfaces

- **Paper** (`#ffffff`) — The single global surface — the entire interface is pressed directly onto pure white with no card or panel system

## Imagery

Photography is conspicuously absent from the index view — the project list relies entirely on typography and the reader's prior knowledge of each named garden. The visual language is that of a printed field guide or museum wall text: type as image, whitespace as frame. Where photography does appear (project detail pages), it is likely high-key, naturalistic, and full-bleed — generous crops of planting compositions without lifestyle staging, consistent with Piet Oudolf's own artistic photography. Iconography is monoline SVG, 1px stroke, black on white.

## Layout

Full-bleed, single-column typographic index. The hero is the list itself — a continuous run of project titles with country-code labels, flowing top-to-bottom with no section breaks, no card containers, and no imagery. Navigation is a minimal top bar with 40px vertical padding. Side margin holds rotated section labels. There are no grids, no card layouts, and no two-column splits on the index; the entire page reads as one uninterrupted column of type on white paper. Content is left-aligned with 22px indent from the country tag column.

## Similar Brands

- **Hauser & Wirth gallery site** — Same oversized-light-weight serif/sans display type, pure white canvas, country-or-city micro-labels, and index-style project listings with hairline underlines
- **Serpentine Galleries site** — Same editorial-art-book restraint — whisper-weight 60px titles, tiny uppercase meta tags, zero color, navigation reduced to a wordmark plus a few text links
- **OMA / Rem Koolhaas** — Same field-guide typographic system — monumental light-weight project names with abbreviated geographic codes above, pure white background, no decorative chrome
- **Lars Müller Publishers** — Same museum-colophon mood — Univers-style sans, generous leading, hairline rules instead of borders, and content that behaves like a printed index rather than a software interface
