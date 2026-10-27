# Fonts In Use — Style Reference
> White gallery wall for letterforms

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fonts In Use operates as a typographic museum: an editorial archive where the interface is deliberately invisible so the letterforms being catalogued can speak. Every surface is white or near-white, every stroke is black, and the only typographic personality comes from the custom BentonSansRE UI sans and RelayCond display — never from decoration. The 5-column thumbnail grid functions as the page's primary content unit, each card pairing a photographic evidence image with a live sample of the typeface it documents (Baste, Proxima Nova, Zilla Slab…). Density is compact and newspaper-like rather than spacious-SaaS: tight vertical rhythm, 5px gaps, hairline 2px radii on controls, no shadows, no gradients, no accent color. The whole system reads as a printed specimen sheet rendered for the screen — restrained, factual, anti-decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon | `#000000` | Primary text, all borders, logo wordmark, nav links, search input border — the sole ink color in the entire system |
| Paper | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Bone | `#f0f0f0` | Alternate row striping, search input fill, subtle list separators — a barely-there warm gray for differentiation |
| Mist | `#dddddd` | Input borders, subtle dividers — the lightest functional border tone |
| Ash | `#999999` | Muted helper text, secondary metadata, disabled nav — 7.4:1 contrast against white still passes AAA |

## Typography

### BentonSansRE — The sole UI typeface — navigation, body, buttons, input fields, table data, footer. At 9–10px it functions as fine print (image counts, sort labels); at 14–16px as body and nav. The condensed proportions and newspaper-grade x-height give the interface its specimen-sheet feel. Substitute: Franklin Gothic URW or a neutral grotesque like Source Sans 3.
- **Substitute:** Franklin Gothic URW, Source Sans 3, or Lyon Display
- **Weights:** 400, 700
- **Sizes:** 9px, 10px, 12px, 14px, 16px
- **Line height:** 1.10, 1.20, 1.60

### RelayCond — Reserved for editorial accents — the 'FONTS IN USE' wordmark at 36px (line-height 1.0, nearly square) and 'Staff Pick' ribbon badges at 18px. The condensed width makes the logo read as a masthead rather than UI. Substitute: Roboto Condensed or Oswald.
- **Substitute:** Roboto Condensed, Oswald, or Roboto Slab condensed cuts
- **Weights:** 400, 700
- **Sizes:** 18px, 36px
- **Line height:** 1.00, 1.60

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | — |
| body-sm | — | — | 12px | 1.2 | — |
| body | — | — | 14px | 1.2 | — |
| body-lg | — | — | 16px | 1.2 | — |

## Spacing & Layout

**Base unit:** 6px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 30px
- **Card padding:** 5px
- **Element gap:** 5px

### Border Radius

- **cards:** 0px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Masthead Wordmark
**Role:** Primary brand identity at page top

'FONTS IN USE' set in RelayCond bold, 36px, line-height 1.0, color #000000. Stacked on two lines (FONTS / IN USE) in the upper-left. The condensed masthead style is the strongest visual signature of the brand — it reads as a newspaper flag, not a SaaS logo.

### Top Navigation Tab
**Role:** Primary section selector (Collection / Blog)

BentonSansRE 16px 700, color #000000, 20px horizontal padding. Active tab has no underline or background — it is differentiated by weight (700) versus inactive (400) and by the 'Typefaces ▾' etc. sub-nav appearing below. Tab area sits in a white bar separated from the sub-nav by a 1px #000000 hairline.

### Sub-Navigation Row
**Role:** Faceted filter (Topics, Formats, Typefaces)

BentonSansRE 14px 400, #000000, each label followed by a down-caret. Appears below a 1px #000000 hairline, on #ffffff. No active state styling — simplicity over affordance.

### Search Input
**Role:** Typography/term search

BentonSansRE 14px 400, #000000 text, #f0f0f0 fill, 1px #999999 border, 2px radius. Placeholder 'Enter a word, typeface, tag…' in Ash (#999999). Small magnifier icon as right-side adornment. No focus ring color — focus is implied by cursor alone.

### Sort Dropdown
**Role:** Result ordering control

BentonSansRE 12px 400, #000000. Inline text 'Sort: Contribution Date ▾' with the active sort label bolded. No boxed container — the control is just text until hovered.

### Type Specimen Card
**Role:** Grid item showcasing one font in use

Rectangular photographic image fills the top of the card; no padding, no border, no radius. Below the image, on white, two lines of BentonSansRE: the typeface name (16px 400, #000000, the live specimen) and the designer/secondary font (14px 400, #000000). The card itself has no border or shadow — it is defined entirely by its gap in the grid.

### Staff Pick Ribbon
**Role:** Curatorial highlight on select specimens

RelayCond 18px 400, white text on a #000000 diagonal band overlaid on the top-right corner of the card image. Rotated approximately -30° on the top edge. The only chromatic contrast device in the entire UI — pure black-on-image, no color.

### Thumbnail Image
**Role:** Evidence photo of the typeface in real-world use

Always rectangular, always flush to card edges with no padding, no border, no radius. Aspect ratio varies by content. The photograph IS the product — no overlay, caption, or treatment.

### Result Count Label
**Role:** Collection size indicator (e.g. 'Show: All (33217)')

BentonSansRE 12px 400, #000000. The count itself is set in 700 weight to create an inline emphasis. Sits at the top of the result grid, right-aligned in the sort row.

### Grid List Row Striping
**Role:** Alternate row differentiation in text-list contexts

#ffffff base rows alternating with #f0f0f0 — barely perceptible. Used in secondary list views, not in the primary image grid.

## Do's and Don'ts

### Do
- Set all body and UI text in BentonSansRE — never substitute display serifs or decorative faces in chrome elements
- Use the 5px/10px/20px/30px spacing scale consistently; gap between grid cards is 20px column-gap, 30px row-gap
- Keep all borders 1px solid #000000 or #999999 — never use thicker rules or colored strokes
- Let the typeface name in specimen cards render in the actual font being documented (Baste set in Baste, Proxima Nova set in Proxima Nova) — the system makes this its feature
- Use RelayCond only for the masthead wordmark and Staff Pick ribbons; treat it as a restricted accent face
- Keep radius at 2px for all interactive controls; 0px for cards and images — sharp corners everywhere
- Set page background to #ffffff and never introduce surface tint variation; the flatness is the brand

### Don't
- Don't introduce any accent color, gradient, or chromatic background — the system is strictly achromatic
- Don't add drop shadows, glows, or any box-shadow elevation to cards, buttons, or modals
- Don't use rounded corners above 2px — pill shapes, 8px card radii, or large circular avatars break the editorial feel
- Don't apply different font families to headings vs body — the UI uses one sans (BentonSansRE) and one condensed accent (RelayCond); nothing else
- Don't use colors other than #000000, #ffffff, #f0f0f0, #dddddd, and #999999 in any UI context
- Don't center-align body text or nav items — the layout is left-aligned and left-anchored throughout
- Don't add icons inside form fields or buttons except the search magnifier; the interface is largely text-only

## Elevation

No shadows. The system is flat by conviction — elevation is communicated only through the hairline #999999 border, never through cast shadow. Cards in the grid sit directly on the white canvas with whitespace as their only separator.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas
- **Bone** (`#f0f0f0`) — Alternate list rows, input fill

## Imagery

Photography is the content. The grid is composed of full-color real-world photographs showing each typeface printed on packaging, books, signage, screens, and environmental graphics. Images are rectangular and flush to the card edge with no padding, no border, no radius, and no overlay treatments. There is no decorative photography, no stock lifestyle imagery, no abstract graphics. The only non-photographic visual element is the diagonal 'Staff Pick' black ribbon overlaid on the top-right corner of select thumbnails. Iconography is minimal: a single magnifier glyph in the search field and small downward-pointing carets on dropdown triggers, all in #000000. The visual language is 'specimen page from a printed type catalog' — the artifact speaks, the chrome stays silent.

## Layout

Full-bleed white canvas with a max-width 1200px centered content column. The top of the page is a masthead bar: logo upper-left, descriptive tagline and sponsor mention upper-center, sign-in link upper-right, with Collection/Blog primary tabs and a search field below. A hairline #000000 rule separates the masthead from a sub-nav row of Topics/Formats/Typefaces filter links. Below that, a thin control row holds result counts (left) and sort dropdowns (right). The body is a 5-column image grid where each card is an image stacked above two lines of type-specimen text. Vertical gap between rows is 30px; horizontal gap between columns is 20px. Cards have no borders or shadows. The page extends in long scrollable runs — 20+ cards visible per page, with the rhythm continuing seamlessly. Navigation is a top bar only; no sidebar, no sticky header beyond the masthead. The overall feel is a horizontally-scrolling printed catalog page rather than a vertical SaaS scroll.

## Similar Brands

- **Fonts.com specimen pages** — Same specimen-grid approach where each card shows the font in use, typographic-first chrome, no decorative color
- **AIGA Eye on Design** — Editorial archive aesthetic with white canvas, left-aligned text, hairline rules, and zero accent color
- **Type Together** — Type foundry catalog grid with photographic evidence, minimal UI typography, and specimen-as-product presentation
- **It's Nice That** — Newsprint-on-screen density: compact spacing, black-on-white only, masthead wordmark in a condensed display face
- **Print magazine (theprintmagazine.com)** — Typographic archive with grid-driven layout, 0% colorfulness, and the interface deliberately invisible behind the content
