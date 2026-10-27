# OhDada — Style Reference
> Editorial gallery wall

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

OhDada operates on a gallery-catalog visual language: two quiet, chalky neutrals (warm cream and lavender-gray) alternate as full-bleed section canvases, and a single saturated saddle brown does all the typographic and structural work. The signature typographic move pairs GrandSlang-Roman at weight 100 — an ultra-thin display serif — with Neue Haas Grotesk, so the brand name whispers in calligraphic hairline strokes while supporting text sits in crisp, engineered grotesque. This is a low-density, image-forward layout where the product photography (kinetic sculptures in primary blues and browns against white walls) provides all the color the UI refuses to use. The interface is minimal to the point of editorial restraint: thin hairline borders, almost no shadows, no gradients, and components that feel like printed catalog plates rather than software surfaces.

## Colors

| Name | Value | Role |
|------|-------|------|
| Chalk Cream | `#e6e0d9` | Primary page canvas and secondary section background; the warm off-white that makes brown type and sculpture photography feel curated rather than clinical |
| Lavender Stone | `#b7b3be` | Alternate section background and hero canvas; introduces a cool, chalky counterpoint to the warm cream without breaking the achromatic discipline |
| Saddle Brown | `#5d3a19` | All headings, body copy, link text, and hairline borders — the only chromatic voice in the system, used as a drawn-with-ink accent against the pale neutrals; Outlined and ghost interactive borders; links and navigation controls carry a 1px brown stroke rather than a filled background, keeping the surface quiet |
| Ink Black | `#000000` | Decorative SVG fills only; never used for UI text or surface elements |

## Typography

### GrandSlang-Roman — Brand mark and large display headings only — used at 58px+ for the wordmark and section titles. Weight 100 is the entire signature: hairline serif strokes that read as drawn rather than typeset. Substitute: Cormorant Garamond Ultralight or Italiana, which approximate the extreme thinness and high-contrast serif construction.
- **Substitute:** Cormorant Garamond Ultralight
- **Weights:** 100
- **Sizes:** 58px
- **Line height:** 1.00
- **Letter spacing:** normal

### Neue Haas Grotesk Display — All body copy, navigation, secondary headings, and product labels. Weights 400 for body, 500 for emphasis. The neo-grotesque geometry acts as a neutral ground for the expressive display serif — a deliberate Swiss-type baseline that lets GrandSlang perform. Substitute: Inter, Neue Haas Unica, or Helvetica Neue.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 16px, 17px, 72px
- **Line height:** 1.00, 1.18, 1.20
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 16px | 1.18 | — |
| display | — | — | 58px | 1 | — |
| display-lg | — | — | 72px | 1 | — |

## Spacing & Layout

**Base unit:** 6px

**Density:** compact

- **Section gap:** 115px
- **Card padding:** 40px
- **Element gap:** 10px

### Border Radius

- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Hero Wordmark
**Role:** Brand identity display

Full-bleed Lavender Stone (#b7b3be) section. GrandSlang-Roman weight 100 at 58–72px, Saddle Brown (#5d3a19), set on two lines with tight line-height 1.0. No logo mark, no icon — the type IS the brand. Generous left margin, text aligned to the left third.

### Hero Subtitle
**Role:** Tagline beneath wordmark

Neue Haas Grotesk weight 400 at 16px, color Chalk Cream (#e6e0d9) on Lavender Stone ground. Three short lines stacked with 5px vertical rhythm. The cream-on-lavender pairing is deliberately low-contrast — the subtitle is read second, not first.

### Section Title (Display)
**Role:** Major section heading

Neue Haas Grotesk weight 500 at 58px, Saddle Brown (#5d3a19) on Chalk Cream ground. Tight line-height 1.0. No underline, no decoration. Appears as the first content element in each section with 115px top padding.

### Product Card — Editorial
**Role:** Product entry in catalog

Full-bleed image on the right (50% width), product name in Neue Haas Grotesk italic weight 400 at 17px, Saddle Brown, aligned to the bottom-left of the image column. No border, no shadow, no background card — the image sits directly on the Chalk Cream canvas. The product name is the only metadata visible.

### Outlined Link
**Role:** Navigation and inline links

Saddle Brown (#5d3a19) text in Neue Haas Grotesk weight 400 at 16–17px, 1px Saddle Brown bottom border, no background fill. 10px right margin when grouped. The border acts as the clickable affordance; the text alone would be too quiet.

### Section Divider
**Role:** Implicit section break

No visible rule. Sections separate through background color alternation (Chalk Cream → Lavender Stone → Chalk Cream) and 115px vertical padding. The layout breath IS the divider.

### Product Photography Frame
**Role:** Sculpture product imagery

Edge-to-edge photographic crops with 0px radius, no border, no shadow. Images fill their column edge-to-edge. Subjects are shot on white or neutral gallery walls — the image provides its own contrast against the cream page.

### Navigation Bar
**Role:** Top-level site navigation

Full-width, transparent, sits directly on the current section's background color. Neue Haas Grotesk weight 400 at 16px, Saddle Brown, inline items separated by spacing, no background fill, no shadow, no sticky behavior implied.

## Do's and Don'ts

### Do
- Use only GrandSlang-Roman weight 100 for the wordmark and display headings — never set it bold or above 72px
- Alternate Chalk Cream (#e6e0d9) and Lavender Stone (#b7b3be) as full-bleed section backgrounds to create rhythm without introducing new colors
- Apply 115px top/bottom padding to all major sections to maintain gallery-wall breathing room
- Set all body and navigation text in Neue Haas Grotesk weight 400–500, Saddle Brown (#5d3a19), 16–17px
- Mark links and interactive elements with a 1px Saddle Brown bottom border rather than a filled background
- Use 0px border-radius on all components — cards, buttons, images, and product frames are sharp-edged
- Let product photography be the only source of additional color (blues, whites from the sculptures); the UI itself stays three-tone

### Don't
- Do not introduce gradients, drop shadows, or elevation effects — the system is flat by design
- Do not use rounded corners on any element; 0px radius is structural to the editorial feel
- Do not add a fourth color to the palette — Saddle Brown, Chalk Cream, and Lavender Stone are the complete chromatic vocabulary
- Do not set GrandSlang-Roman below 58px or in any weight other than 100; it loses its character at small sizes
- Do not use filled button backgrounds for primary actions; use the outlined-link treatment with a brown border instead
- Do not center body text — the layout is left-aligned throughout, even in the hero
- Do not add hover animations, color transitions, or motion; the interface reads as a printed catalog

## Elevation

No shadows, no blur, no stacked surfaces. Depth comes solely from alternating cream and lavender-stone background bands and the natural dimension of product photography against flat UI.

## Surfaces

- **Cream Canvas** (`#e6e0d9`) — Dominant page and product-section background
- **Lavender Plinth** (`#b7b3be`) — Hero and accent section background, creates a tonal shift without introducing a new hue family

## Imagery

Product photography dominates and is the only source of color beyond the three-tone UI. Sculptures are shot in clean, well-lit studio conditions on white or neutral gallery walls — tight, straight-on crops that show the kinetic mobile in full. No lifestyle context, no human subjects, no decorative backgrounds. Treatment is high-key, natural, unretouched. The blue and brown geometric forms of the sculptures echo the UI palette by coincidence, not by art direction. Icons are absent from the interface entirely. Imagery ratio: image-forward on product pages, text-only on the hero.

## Layout

Full-bleed page model with no max-width container — content aligns to the page edges with generous left margins. The hero is a full-viewport Lavender Stone band with the wordmark left-aligned at roughly 10% from the left edge, no centered composition. Sections alternate between Chalk Cream and Lavender Stone bands separated by 115px vertical padding. Product sections use a 2-column split: product name in italic serif on the left third, full-bleed photograph filling the right two-thirds. Navigation is a minimal top bar with inline links, no logo block, no hamburger. The overall rhythm is editorial — large quiet bands, single product per section, no card grids or multi-column feature blocks.

## Similar Brands

- **Maison & Objet** — Same editorial catalog layout with full-bleed section bands, product photography as the sole color source, and minimal sans-serif supporting type around a distinctive display face
- **Hem (hem.com)** — Same flat two-tone background alternation, oversized low-weight display headings, and the discipline of using a single warm accent color for all text and borders
- **Atelier Bingo** — Same gallery-portfolio rhythm: quiet neutral canvases alternating with accent bands, sharp-edged product imagery flush to page edges, and restraint as the primary design principle
- **Menu Space (menu.space)** — Same warm cream and muted cool-gray alternating sections, hairline-only interactive elements, and the pairing of a thin display serif with a neutral grotesque
