# Co2 — Style Reference
> climate atlas in winter light. Build pages as an airy document landscape where serif headlines, category-coded data, and icy image treatments punctuate broad white fields.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Co2.is frames public climate-policy information as a quiet editorial archive: expansive white space, hairline rules, and low-contrast pill navigation leave room for oversized, whisper-weight serif statements. A near-black editorial ink carries all reading and controls, while pale cyan and mint blocks mark filters and responsible bodies rather than turning the interface into a brightly branded dashboard. Saturated blue, teal, violet, orange, and yellow appear as a compact classification language for climate systems, with a high-contrast blue-and-white environmental image providing the hero’s only large visual interruption.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page canvas, hero surfaces, light cards |
| Editorial Ink | `#181b22` | Headlines, body text, navigation, icons, dark card surfaces, and 1px control outlines |
| Soft Canvas | `#f9f9f9` | Alternate section backgrounds and rounded quiet panels |
| Washed Gray | `#f5f5f5` | Light neutral action fill for buttons on dark surfaces |
| Rule Gray | `#d9d9d9` | 1px dividers, list separators, and understated outlined-control borders |
| Charcoal Surface | `#1f232d` | Dark informational cards with white text |
| Muted Steel | `#8b8d90` | Secondary text on dark cards |
| Cyan Wash | `#dff9ff` | Pale cyan category chips and highlighted institution controls — an icy marker within the otherwise paper-white document |
| Mint Wash | `#dbffe7` | Gray action color for filled buttons, selected navigation states, and focused conversion moments |
| Climate Blue | `#4098ff` | Text links, selection highlight, and blue environmental-image treatment |
| Land Teal | `#00b595` | Land-use system labels and coded graphic blocks |
| Community Violet | `#5077ff` | Community-emissions system labels and coded graphic blocks |
| Market Orange | `#ff7b1b` | Emissions-trading system labels and coded graphic blocks |
| Cross-Action Purple | `#a545e0` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Signal Yellow | `#f8e645` | Feature-card surface for a single high-attention content grouping |

## Typography

### Gt Alpina Standard — Display and sectional headings. Weight 300 at 64px makes climate-policy headlines feel literary and measured rather than institutional; reserve it for large statements and major section names.
- **Substitute:** Cormorant Garamond
- **Weights:** 300, 400
- **Sizes:** 30px, 38px, 56px, 64px
- **Line height:** 1.08, 1.32

### Abacaxilatinweb — Primary sans for navigation, long-form body copy, labels, links, controls, numeric content, and occasional condensed display figures. Its 18px / 1.5 body setting gives dense Icelandic text room without weakening the page’s compact control language.
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 14px, 16px, 18px, 20px, 22px, 26px, 36px, 40px, 44px, 80px
- **Line height:** 1.00, 1.08, 1.32, 1.35, 1.50, 1.69, 1.93
- **Letter spacing:** -6px at 80px (-0.075em) and -2.96px at 80px (-0.037em); normal tracking at measured body, navigation, and heading steps

### Abacaxilatin — Navigation and compact inline metadata, including 16px / 1.32 navigation labels and 18px / 1.5 counts.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 16px, 18px
- **Line height:** 1.32, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| meta-label | Abacaxilatinweb | 400 | 14px | 1.32 | 0px |
| nav | Abacaxilatin | 400 | 16px | 1.32 | 0px |
| body | Abacaxilatinweb | 400 | 18px | 1.5 | 0px |
| body-count | Abacaxilatin | 400 | 18px | 1.5 | 0px |
| eyebrow-heading | Abacaxilatinweb | 400 | 20px | 1.08 | 0px |
| system-heading | Abacaxilatinweb | 400 | 26px | 1.5 | 0px |
| section-heading-small | Gt Alpina Standard | 300 | 30px | 1.32 | 0px |
| section-heading | Gt Alpina Standard | 300 | 38px | 1.32 | 0px |
| display | Gt Alpina Standard | 300 | 64px | 1.08 | 0px |
| data-display | Abacaxilatinweb | 400 | 80px | 1 | -2.96px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **pills:** 999px
- **images:** 0px
- **buttons:** 8px
- **navigation:** 999px
- **featureCards:** 32px

## Components

### Global Pill Navigation
**Role:** Top-level page and category navigation

Use Abacaxilatin at 16px / 21.12px, weight 400, in Editorial Ink. Each category item sits in a 999px-radius pill with rgba(186, 186, 186, 0.16) fill; the compact navigation rhythm uses 8px gaps and 10px vertical padding.

### Text Navigation Link
**Role:** Secondary header route

Set in Editorial Ink with the 16px Abacaxilatinweb navigation treatment. Use a quiet #f5f5f5 rounded backing only where a route needs active-state containment; keep the route pair separated by 8px.

### Hero Editorial Heading
**Role:** Opening statement

Use Gt Alpina Standard at 64px, weight 300, 69.12px line-height, in Editorial Ink. Place the statement in a broad white field with large open space below before the image begins.

### Blue Environmental Hero Image
**Role:** Full-width visual break beneath the opening statement

Use a raw-edge, square-cornered photographic or environmental texture treated almost entirely in Climate Blue #4098ff and Paper White #ffffff. Do not place it in a card, add a shadow, or round its corners.

### Editorial Intro Block
**Role:** Section lead and explanatory copy

Pair a 20px Abacaxilatinweb eyebrow at 21.6px line-height with 18px Abacaxilatinweb body copy at 27px line-height, both in Editorial Ink. Separate paragraphs by 32px and let the text occupy a deliberately restrained reading column.

### System Accordion Row
**Role:** Expandable climate-system category

Use a 1px top divider in Rule Gray #d9d9d9, a 26px Abacaxilatinweb label at 39px line-height, and an Editorial Ink plus icon aligned at the far edge. Keep each row on a white surface with 24px vertical spacing; render its superscript-like count at 18px / 27px.

### All-Items Text Link
**Role:** Compact continuation link below an accordion group

Set in Abacaxilatinweb at 14px, weight 500, 27.02px line-height, Editorial Ink, followed by a small right chevron. Do not use a filled container.

### Cyan Institution Chip
**Role:** Responsible-ministry filter or linked label

Use Cyan Wash #dff9ff with Editorial Ink text, 8px radius, and 16px 24px padding. Keep the label in the 18px / 27px Abacaxilatinweb treatment and place chips above or alongside a 1px Rule Gray divider.

### Mint Status Button
**Role:** Implementation-status filter

Use Mint Wash #dbffe7 with Editorial Ink text, 8px radius, and 16px 24px padding. Use this filled treatment for status groups such as progress states; do not reuse it as the universal site action.

### Transparent Outline Pill
**Role:** Inline filter and low-emphasis control

Use a transparent background, 1px solid Editorial Ink border, 999px radius, and horizontal 16px padding. Keep vertical padding at 0px and use compact Abacaxilatinweb text.

### Dark Data Card
**Role:** High-contrast statistical or grouped content module

Use Charcoal Surface #1f232d, 16px radius, no shadow, and 32px padding on every side. Set primary content in Paper White and supporting text in Muted Steel #8b8d90.

### White Data Card
**Role:** Contained informational module

Use Paper White, 16px radius, no shadow, 32px top/right/left padding, and 16px bottom padding. Use Editorial Ink text and Rule Gray dividers where internal rows need separation.

### Large Quiet Panel
**Role:** Grouped background container

Use Soft Canvas #f9f9f9 with a 32px radius and no box shadow. Keep the panel minimally framed; its distinction comes from the surface shift rather than borders or elevation.

### System Color Marker
**Role:** Category identification in charts, labels, and summary blocks

Assign one solid coded surface per system: Community Violet #5077ff, Market Orange #ff7b1b, Land Teal #00b595, or Cross-Action Purple #a545e0. Keep surrounding typography Editorial Ink and avoid gradients.

## Do's and Don'ts

### Do
- Use Paper White #ffffff as the primary canvas and Soft Canvas #f9f9f9 only for quiet grouped regions.
- Set major page statements in Gt Alpina Standard at 64px, weight 300, with 69.12px line-height.
- Use Abacaxilatinweb at 18px / 27px for reading copy and at 16px / 21.12px for navigation.
- Use 1px Rule Gray #d9d9d9 dividers for accordion rows, lists, and quiet structural boundaries.
- Use 999px radius for navigation chips and transparent outline pills; use 8px radius for pale cyan and mint filled controls.
- Keep standard cards at 16px radius with 32px padding and no shadow.
- Reserve #5077ff, #ff7b1b, #00b595, and #a545e0 for climate-system classification rather than general decoration.

### Don't
- Do not use heavy shadows; dark, white, and #f9f9f9 cards have box-shadow: none.
- Do not round environmental imagery; hero visuals use 0px image radius and full-bleed raw edges.
- Do not use Mint Wash #dbffe7 as every page’s default filled action; restrict it to status and implementation filters.
- Do not replace 1px #d9d9d9 rules with thick separators or dark enclosing borders.
- Do not set large display headings in the sans family; use the Gt Alpina Standard 300 treatment for 30px, 38px, and 64px editorial headings.
- Do not add gradients to category surfaces or image overlays.
- Do not compress section rhythm below the 64px section gap or reduce standard card padding below 32px.

## Elevation

Surfaces are separated by paper-white space, #f9f9f9 tonal shifts, 1px #d9d9d9 rules, and 16px or 32px corner geometry. Cards intentionally use no shadow.

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas, hero, and default reading surface
- **Soft Canvas** (`#f9f9f9`) — Quiet large panels and alternate content regions
- **Washed Gray** (`#f5f5f5`) — Subtle utility and inactive-control surfaces
- **Cyan Wash** (`#dff9ff`) — Highlighted institution labels and cyan content markers
- **Charcoal Surface** (`#1f232d`) — High-contrast data-card surface

## Imagery

Imagery is sparse and atmospheric rather than product-oriented. The main visual is a full-width environmental photograph or textured aerial scene rendered in an aggressively reduced blue-and-white duotone, with grainy water or terrain detail becoming an abstract climate map; it has raw square edges and occupies the full visual width beneath the hero. Icons are monochrome Editorial Ink line marks, including thin plus signs and chevrons. The page is text-dominant: photography functions as a single thematic interruption between editorial text fields rather than a repeated card illustration system.

## Layout

The page is an expansive white editorial document with a compact top navigation bar: a black linked-ring logo at the far left, a small route switch beside it, and category pills aligned across the remaining header. The hero is text-first rather than split: a large left-aligned serif statement occupies a deep white field, followed by a full-width blue-and-white environmental image. Introductory copy returns to a narrow left reading column, while later index sections use a two-column composition with a large serif title at left and a ruled accordion list at right. Sections remain seamless on white rather than alternating dense bands; 64px and larger empty intervals create the rhythm, with pale cyan and mint chips acting as contained functional highlights.

## Similar Brands

- **The Government of Iceland** — Shares the Icelandic public-information context, restrained white document surfaces, and policy-led navigation.
- **The New York Times Climate** — Shares oversized literary serif headlines set against sparse editorial whitespace and environmental imagery.
- **Carbon Brief** — Shares climate-data categorization and a text-first research-publication structure.
- **GOV.UK** — Shares direct public-service information architecture, high-contrast ink typography, and rule-based content grouping.
- **Our World in Data** — Shares a restrained document canvas where saturated color is reserved for data-system classification.
