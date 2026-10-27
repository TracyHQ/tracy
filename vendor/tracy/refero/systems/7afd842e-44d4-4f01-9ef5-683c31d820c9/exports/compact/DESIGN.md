# Bpowell — Style Reference
> type as architecture on white plaster

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A text-only portfolio that lets typography do every job — no imagery, no decoration, no chrome. The page reads as an architectural list: small tightly-set labels act as section markers, then oversized project names stack like concrete blocks on a wall. Two surfaces alternate — a bright white canvas for design work, an inverted near-black canvas for film — and the contrast between them is the only visual rhythm. The layout is brutally asymmetric: a single column of oversized text pinned to the left, generous gutters of negative space, and a top nav that distributes itself across the full viewport width rather than clustering in a corner. The system has no buttons, no cards, no borders in the traditional sense — the nearest thing to a border is a 1px black hairline, and even that is used sparingly. The result feels like reading a credits sequence printed on a gallery wall: austere, deliberate, and confident that the names themselves carry the weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Plaster White | `#ffffff` | Primary canvas for the light sections; text color on the dark sections; hairline dividers on the dark sections |
| Carbon | `#111111` | Page background for the dark/film section; primary body text on light sections; structural fill for project name typography |
| Ink Black | `#000000` | Secondary text and fill on light sections; used where maximum contrast is needed against the white canvas |
| Graphite | `#2b2b2b` | Subtle darker border for low-emphasis rules on light surfaces |

## Typography

### Teg — Display — reserved for the largest project names and the hero text. The aggressive -0.033em tracking at 86px tightens the letters into a near-monolithic block; this is the font that creates the 'stacked concrete' reading. Substitute: Migra, Editorial New, or Canela Display.
- **Substitute:** Migra or Editorial New
- **Weights:** 500, 600
- **Sizes:** 58px, 86px
- **Line height:** 1.04, 1.05
- **Letter spacing:** -0.0330em at 86px, -0.0170em at 58px

### Beatrice Display — Mid-scale editorial type — appears as secondary project list text alongside the larger Teg names, providing typographic counterpoint at a calmer scale. Substitute: Tiempos Headline, Canela, or Reckless.
- **Substitute:** Tiempos Headline or Canela
- **Weights:** 500, 600
- **Sizes:** 26px
- **Line height:** 1.15
- **Letter spacing:** normal

### Beatrice — Body-weight Beatrice variant for the same 26px role but with the text-figure character set. Substitute: same as Beatrice Display.
- **Substitute:** Tiempos Text
- **Weights:** 500
- **Sizes:** 26px
- **Line height:** 1.15
- **Letter spacing:** normal

### Diatype — Workhorse sans for body copy, nav items, and supporting text. Weight 500 is the default; 700 is reserved for the nav name 'Ben Powell' to give it anchor weight in the distributed nav. Substitute: Söhne, Inter, or ABC Diatype.
- **Substitute:** Söhne or Inter
- **Weights:** 500, 700
- **Sizes:** 26px, 58px
- **Line height:** 1.04, 1.05, 1.15
- **Letter spacing:** -0.0170em

### New Grotesk — Wide-tracked all-caps label face for section markers ('Design', 'Film'). The extreme +0.069em tracking turns short words into spaced-out type-art — this is the system's only 'decorative' choice. Substitute: ABC Diatype Mono Upper, Space Grotesk, or Neue Haas Grotesk Display.
- **Substitute:** Space Grotesk or ABC Diatype Mono
- **Weights:** 600
- **Sizes:** 58px, 60px
- **Line height:** 1.00, 1.04
- **Letter spacing:** 0.0690em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 26px | 1.15 | — |
| heading | — | — | 58px | 1.05 | -0.17px |
| display | — | — | 86px | 1.04 | -2.84px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1400px
- **Section gap:** 104px
- **Card padding:** 0px
- **Element gap:** 16px

### Border Radius

- **none:** 0px

## Components

### Distributed Top Nav
**Role:** Primary navigation — replaces a conventional logo-cluster layout

A single horizontal row pinned to the very top of the viewport, 40px horizontal padding, items distributed across the full width using flexbox space-between (no centered logo, no hamburger). Four text items: the owner name (Diatype 500/700), the descriptor ('Designer & filmmaker'), the email address, and an availability status. Font: Diatype 500 at 26px, color #111111. The first item (owner name) is set at weight 700 to act as the only visual anchor in an otherwise flat row.

### Section Label
**Role:** Marker that introduces a new category block

Small, wide-tracked, acts as a typographic flag above each project list. Font: New Grotesk 600, ~12-14px, letter-spacing 0.069em, all uppercase or sentence case. Color: #111111 on light sections, #ffffff on the dark section. Sits 40-56px above the first project name. No underline, no icon — the tracking does the work.

### Project List Item — Large
**Role:** The primary content unit; project names that form the page's structure

Oversized text in Teg 500 or 600, 86px on desktop, line-height 1.04, letter-spacing -0.033em. Color: #111111 on light sections, #ffffff on the dark section. Stacked vertically with 0-4px gap between lines (the lines nearly touch, creating a continuous block). No bullet, no link styling, no metadata — the name is the entire item.

### Project List Item — Secondary
**Role:** Typographic counterpoint in the list stack

Slightly smaller project names at 58px, set in Beatricedisplay or Teg weight 500, line-height 1.05, letter-spacing -0.017em. Appears alongside the 86px names to create a rhythmic size alternation in the list — some names shout, others speak. Same color rules as the large variant.

### Light Canvas Section
**Role:** The default page surface for design work

Full-bleed white (#ffffff) background, left-aligned content column starting at the 40px page margin, 104px top/bottom internal padding. Contains the section label and project list. No borders, no shadows, no card containers.

### Dark Canvas Section
**Role:** Inverted surface for the film category

Full-bleed near-black (#111111) background with identical layout rhythm to the light section — same 40px left margin, same 104px vertical padding, same typographic structure. Text and labels invert to #ffffff. The alternation between the two surfaces is the page's only visual section break; there is no dividing line or gradient between them.

### Content Column
**Role:** The single left-aligned text column that holds all content

Left-pinned at 40px from the viewport edge, extends rightward as far as the longest line needs. No max-width cap on the text itself, but the longest project names (e.g. 'Iceland in Winter') naturally bound the column at roughly 800-900px. No centering, no right rail.

## Do's and Don'ts

### Do
- Use exactly two surfaces — #ffffff and #111111 — and alternate them as full-bleed sections to create rhythm without any divider lines
- Set project names in Teg at 86px / line-height 1.04 / letter-spacing -0.033em on desktop; this aggressive tracking is what makes the list read as a wall of text
- Use New Grotesk 600 with 0.069em tracking for all section labels — the wide spacing is the system's only 'decorative' typographic move
- Distribute nav items across the full viewport width with space-between; never cluster them in a corner or center them
- Anchor the leftmost nav item at weight 700 (Diatype) so the owner's name reads as the only visual weight in an otherwise flat row
- Maintain 40px left padding from the viewport edge for the content column on all sections
- Use 104px for the major vertical section padding — it is the largest spacing unit in the system and defines the page's breathing rhythm

### Don't
- Do not introduce any color beyond #ffffff, #111111, #000000, and #2b2b2b — the system is monochrome by design
- Do not add images, thumbnails, or preview artwork to project list items; the name alone is the entry
- Do not center project names or align them to a grid — they are pinned to the left margin and let their own length determine the column
- Do not use card containers, rounded corners, or drop shadows; the system has zero elevation and zero radius
- Do not set body or nav text larger than 26px; the scale jumps directly to 58px for sub-headings and 86px for display, and bridging that gap destroys the contrast
- Do not add hover color changes, underlines, or button styles to project names — they read as a list, not as links
- Do not use more than one typeface per text block; mixing Teg with Beatricedisplay inside the same line breaks the typographic system

## Surfaces

- **Plaster White** (`#ffffff`) — Default page canvas for the design section; all text and labels render as #111111 on it
- **Carbon** (`#111111`) — Inverted canvas for the film section; all text and labels render as #ffffff on it

## Imagery

No imagery whatsoever — the site is pure typography. There are no photographs, illustrations, product screenshots, project thumbnails, icons, or decorative graphics. Every visual decision is made through type, color inversion, and spatial rhythm. Even the contact email in the nav is rendered as raw text rather than an icon. The absence of imagery is the defining visual language: the work itself is the portfolio, and the typography asks you to recognize the names.

## Layout

The page is a vertical scroll of full-bleed sections that alternate between white and near-black surfaces. There is no traditional hero — the viewport opens directly onto the distributed top nav, then immediately into a left-aligned list of project names. Each section begins with a tiny wide-tracked label ('Design', 'Film') followed by a stack of oversized project names pinned to the left margin. Content is asymmetric and left-aligned throughout; there is no centered text, no right rail, no grid columns. The nav itself is the only horizontal layout decision, and it uses space-between to push four text items to the four edges of the viewport. Section breaks are created entirely by surface color inversion — there are no dividers, rules, or extra spacing between sections beyond the 104px internal padding. The overall density is extremely sparse: one or two text elements per viewport height, with vast areas of negative space.

## Similar Brands

- **Manual (manual.co)** — Same text-as-portfolio philosophy with oversized project names stacked on a near-empty canvas
- **Rauno Freiberg (raunofreiberg.com)** — Single-column left-aligned typography, monochrome palette, no imagery, work presented as a typographic list
- **Frank Chimero** — Editorial manuscript feel with generous whitespace and typography carrying all visual weight
- **Bret Victor** — Extreme typographic restraint, text-only page structure, content density expressed through size jumps rather than imagery
