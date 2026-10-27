# clau.as.kee — Style Reference
> lavender poster wall, monumental type. A flat periwinkle field with a single black-letter sculpture filling the viewport and a thin line of small nav text floating above it.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

clau.as.kee is a typographic monolith on a field of periwinkle. The page is essentially one giant poster: a single lavender canvas (#8e93ff) carries colossal custom-drawn letterforms that dwarf everything else, while a thin black hairline system and one jarring green badge do the work of UI. Almost no component vocabulary exists — navigation, headlines, and portfolio frames are all variations of oversized type and flat color blocks. The design is anti-SaaS: no cards, no shadows, no buttons-as-pills, no soft radii. The restraint is total: two neutrals (black ink, paper white), one saturated background, one green signal. When new pages are built, the first decision is canvas: lavender. The second is scale: type must be monumental or it is wrong.

## Colors

| Name | Value | Role |
|------|-------|------|
| Periwinkle Field | `#8e93ff` | Page canvas, hero background, full-bleed section fills — the single defining brand color, a mid-saturation lavender that swallows the viewport and against which all type is set in black ink |
| Carbon Ink | `#1a1a1a` | Primary text, display type, hairline borders, dark panels, nav links — near-black rather than pure black, keeps the lavender from vibrating too hard |
| Paper White | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Signal Green | `#47f654` | Green action color for filled buttons, selected navigation states, and focused conversion moments. |

## Typography

### Beastly clauworks — Display / wordmark — the proprietary display face, used only at monumental scale (288–504px) for the brand wordmark and hero sculpture. Chunky, almost stencil-cut geometric forms that read as a graphic object rather than readable text. Single weight, no italic. Substitute: a heavy display grotesque like Druk Wide or a custom commission. Do not use at small sizes — this face is architecture, not communication.
- **Weights:** 400
- **Sizes:** 288px, 504px
- **Line height:** 1.00–1.05
- **Letter spacing:** normal

### Suisse Intl clauworks — Headlines, subheads, and long-form body — a custom-cut Suisse International (Swiss grotesque) in a single weight. Used at three distinct scales: 20px for body and nav, 30px for section subheads, 144px for editorial display headings like 'Art direction – Dig…'. The absence of bold/medium weights is the signature: everything is the same quiet weight, hierarchy comes from size alone. Substitute: Suisse Int'l, Inter, or Neue Haas Grotesk.
- **Weights:** 400
- **Sizes:** 20px, 30px, 144px
- **Line height:** 1.15–1.50
- **Letter spacing:** normal

### Times — Smallest body fallback / metadata — appears as system Times at 16px, likely the serif default for tiny labels and captions. Single weight, system face. Substitute: any system serif.
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.15
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.15 | — |
| body | — | — | 20px | 1.5 | — |
| subheading | — | — | 30px | 1.3 | — |
| display | — | — | 144px | 1.15 | — |
| display-lg | — | — | 288px | 1.05 | — |
| display-xl | — | — | 504px | 1 | — |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 130px
- **Card padding:** 65px
- **Element gap:** 30px

### Border Radius

- **badge:** 75px
- **default:** 0px

## Components

### Display Wordmark
**Role:** Hero brand mark and section-opening sculpture

Beastly clauworks at 288–504px, Carbon Ink (#1a1a1a), set tight on the periwinkle canvas with near-zero letter-spacing and line-height 1.00–1.05. Fills the full viewport width; characters bleed off the edges intentionally. Single line, no wrapping. The letters are the layout — there is no other hero content.

### Editorial Display Headline
**Role:** Large in-flow headings on the periwinkle canvas

Suisse Intl clauworks at 144px, weight 400, line-height 1.15, Carbon Ink (#1a1a1a). Example: 'Art direction – Dig…'. Set as a single sentence that may run past the viewport — cropping is acceptable and expected. No underline, no italic, no color variation.

### Top Navigation
**Role:** Minimal horizontal nav across the top edge

Three text links ('About', 'Contact', 'Playground') in Suisse Intl clauworks 20px weight 400, Carbon Ink. Distributed across the full viewport width with left/center/right alignment rather than grouped. No background, no border, no hover state visible — the nav is a whisper, not a bar.

### Request Badge
**Role:** Sole chromatic interactive element on the page

Circular pill in Signal Green (#47f654) with Carbon Ink text. Radius 75px (appears fully circular). Text reads 'ON REQUEST • ON REQUEST' in a repeating ring pattern, or curved along the circumference in Suisse Intl clauworks 20px. Placed as a floating overlay element, typically bottom-left of a portfolio block.

### Carbon Panel
**Role:** Dark inverted section for portfolio content

Full-bleed Carbon Ink (#1a1a1a) band, no border, no shadow, no radius. Contains Paper White (#ffffff) sub-surfaces that frame individual portfolio spreads or images. Generous internal padding (130px top/bottom). Functions as a negative-space container that makes the surrounding lavender feel more saturated by contrast.

### Portfolio Spread
**Role:** Image-and-text content block inside a Carbon Panel

Rectangular composition: a large photographic or scan plate (Paper White background, 0px radius) on the left, dense editorial copy in Suisse Intl clauworks 20px on the right. Copy uses Carbon Ink on Paper White, line-height 1.50. No card chrome, no shadow — the white rectangle against black does all the separation.

### Image Carousel
**Role:** Horizontal scroller for project imagery

Contained inside a Carbon Panel. Large landscape images, Paper White or photographic fill, 0px radius. Pagination dots below (Carbon Ink dots on Paper White). Frame counter in small monospace numerals ('04 / 24'). No rounded corners, no padding around individual images.

### Hairline Divider
**Role:** Section separator

1px solid Carbon Ink (#1a1a1a) line, full viewport width, 0px margin above and below. The only border in the system. Used sparingly — typically once between major editorial sections.

### Body Copy
**Role:** Long-form paragraph text

Suisse Intl clauworks 20px, weight 400, line-height 1.50, Carbon Ink on periwinkle or Carbon Ink on Paper White inside a dark panel. Justified-left, no hyphenation, no first-line indent. Paragraph spacing 30px between blocks.

### Subheading
**Role:** Section label and small editorial title

Suisse Intl clauworks 30px, weight 400, line-height 1.30, Carbon Ink. Single weight — no bold option. Used above body copy to introduce a portfolio spread or service description.

## Do's and Don'ts

### Do
- Set every page background to Periwinkle Field (#8e93ff) — this is the operating mode of the system
- Use Beastly clauworks at 288px or larger for any display-level headline; do not use it below 200px
- Reach for Suisse Intl clauworks at 20px, 30px, or 144px only — do not interpolate intermediate sizes
- Separate dark content from the lavender canvas with a full-bleed Carbon Ink (#1a1a1a) panel, not a shadow or border
- Let display type run past the viewport edge — cropping is the layout, not a bug
- Place at most one Signal Green (#47f654) badge per page; it is punctuation, not decoration
- Use 130px vertical breathing room between major sections; 30px between typographic elements within a section

### Don't
- Do not add a fifth color, a tinted neutral, or a soft shadow to soften the lavender — the flatness is the design
- Do not use rounded corners on panels, cards, or images; 0px radius everywhere except the green badge
- Do not introduce a bold or medium weight of Suisse Intl — hierarchy is size-driven only
- Do not use Beastly at small sizes (under 200px) — it loses its character and becomes a bad display grotesque
- Do not center body copy or set it in narrow columns; body text is left-aligned, full-width-feeling, generous
- Do not add a sticky header, breadcrumb, or secondary navigation; the three-link top bar is the entire nav system
- Do not use gradients, blur, glow, or any CSS filter on the lavender background — it must read as a flat printed field

## Elevation

No shadows. The design rejects elevation entirely — surfaces are defined by color contrast (periwinkle vs carbon vs paper), not depth. No drop shadows, no inner glow, no tinted shadows on lavender. The only separator is the 1px Carbon Ink hairline. If something needs to feel 'above' the canvas, flip the surface to Carbon Ink — do not add blur.

## Surfaces

- **Periwinkle Canvas** (`#8e93ff`) — Base page background, occupies the entire viewport by default
- **Carbon Panel** (`#1a1a1a`) — Dark inverted bands for portfolio content — the magazine spread, the image carousel wrapper
- **Paper Plate** (`#ffffff`) — Inner surfaces inside dark panels — the white paper of a catalog page, the clean rectangle around a photograph

## Imagery

Imagery is portfolio-first and editorial in tone. Photographs and scans are presented as large rectangular plates with 0px radius, framed by a Carbon Ink panel. No lifestyle, no stock, no decoration — every image is project output (catalog spreads, exhibition documentation, printed materials). No illustration, no 3D, no icon system. The visual language is: flat color background → flat color frame → flat image surface → flat text. Three layers, zero effects.

## Layout

Full-bleed single-page architecture with no max-width container. The hero is a viewport-filling Beastly wordmark on periwinkle, followed by a full-width Carbon Panel band of portfolio content, then a return to periwinkle for editorial display headlines. Sections alternate periwinkle → carbon → periwinkle in a strict 1:1 rhythm. Spacing is generous: 130px between major sections, 30px between typographic elements, 65px container padding on the sides. Navigation is a single row of three text links distributed across the top edge. No sidebar, no grid system, no card layout — content is a vertical editorial scroll where every section is allowed to break the viewport.

## Similar Brands

- **Bureau Cool** — Same custom-display-monumentalism on a single saturated field, same flat periwinkle-adjacent canvas, same anti-component minimalism
- **Pentagram portfolio sites** — Editorial full-bleed sections on a vivid brand color, oversized custom display type, hairline-divided dark/light rhythm
- **M/M (Paris) site** — Lavender-adjacent monochrome field, sculptural custom wordmark, the work itself is the only other content
- **Vitra design museum microsites** — Flat saturated color blocks alternating with dark image bands, display type that treats the page as a poster rather than a layout
- **Actual Source** — Custom grotesque + custom display duo, single chromatic field, almost no UI chrome — type and color do the work
