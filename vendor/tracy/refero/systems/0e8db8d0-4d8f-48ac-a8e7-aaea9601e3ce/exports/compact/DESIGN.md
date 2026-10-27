# Martin Laxenaire — Style Reference
> kinetic poster crashing through liquid color waves

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Martin Laxenaire's site operates as a kinetic poster on a white gallery wall: a near-monochrome interface where one massive black display typeface (MonumentExtended UltraBold) at sizes up to 419px does all the shouting, surrounded by generous negative space. The rest of the typography collapses into a tiny, tight utility voice (Swiss 16–21px) for links, buttons, and body — the hierarchy is binary, either whisper or roar. A single soft pink (#f9d9f7) provides the canvas for an abstract, organic wave-field of fluid color shapes that the headline text crashes through, creating the site's signature collision of brutalist black letterpress against liquid color. Components are minimal — pill-shaped controls, hairline borders, and almost no surface differentiation. The system feels like a print designer's portfolio disguised as a web dev portfolio: editorial in restraint, explosive in the focal pieces.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#121212` | Primary text, all borders, icon strokes, the dominant UI color — every word and divider is this near-black |
| Paper White | `#ffffff` | Page canvas, surface background, button fills for outlined ghost controls |
| Blush Wash | `#f9d9f7` | Hero art backdrop, accent surface — the soft pink that hosts the fluid color-shape composition |

## Typography

### MonumentExtended UltraBold — Display and heading voice — used at extreme sizes (94–419px) with crushed line-height (0.75–0.85) to create block-of-ink typographic moments. This is the site's signature: oversized, nearly touching, black slab letterforms that read as physical print objects, not web text. At smaller sizes (18–21px) it serves nav and icon labels.
- **Substitute:** Druk Wide Bold, Antonio Bold, Knockout 90 Ultblack
- **Weights:** 400, 700
- **Sizes:** 18px, 21px, 63px, 94px, 105px, 167px, 419px
- **Line height:** 0.75–1.20

### MonumentExtended Regular — Secondary display weight — used for subheadings and link labels where UltraBold would be excessive. The Regular cut retains the same wide proportions but with thinner strokes, creating a secondary rhythm below the UltraBold roars.
- **Substitute:** Druk Wide Medium, Antonio Regular, Knockout 50 Wide
- **Weights:** 400
- **Sizes:** 16px, 21px, 26px
- **Line height:** 0.85, 1.20

### Swiss — Body and utility voice — the invisible workhorse for paragraphs, button labels, footer text, list items. At 31px it steps into subheading territory. Its neutral, humanist sans character prevents the MonumentExtended from exhausting the reader.
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 400
- **Sizes:** 16px, 17px, 19px, 21px, 31px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.2 | — |
| body | — | — | 19px | 1.2 | — |
| subheading | — | — | 21px | 1.2 | — |
| heading-sm | — | — | 26px | 0.85 | — |
| heading | — | — | 31px | 1.2 | — |
| heading-lg | — | — | 63px | 0.85 | — |
| display | — | — | 94px | 0.85 | — |
| display-xl | — | — | 167px | 0.75 | — |
| poster | — | — | 419px | 0.75 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 42px
- **Card padding:** 21px
- **Element gap:** 21px

### Border Radius

- **tags:** 20.93px
- **buttons:** 20.93px
- **controls:** 20.93px
- **surfaces:** 0px

## Components

### Pill Button (Outlined)
**Role:** Primary interactive control

Ghost/pill-shaped button: 1px Ink Black (#121212) border, transparent or Paper White fill, Swiss 16–21px text, 20.93px border-radius (fully rounded ends), 8px vertical × 21px horizontal padding. The pill geometry is the only border-radius used — no squares, no cards.

### Pill Button (Filled)
**Role:** Secondary or selected control

Solid Ink Black (#121212) fill with Paper White (#ffffff) text. Same 20.93px radius, 8px × 21px padding. Used sparingly to indicate active/selected states or the primary action among siblings.

### Display Headline (Poster Scale)
**Role:** Hero text moments

MonumentExtended UltraBold at 94–419px, line-height 0.75–0.85 (lines physically touch/overlap), Ink Black (#121212) fill with white stroke/outline effect where the text intersects color shapes. The white outline punches through the abstract shapes to maintain legibility. Never set in more than 4 lines.

### Abstract Wave Composition
**Role:** Hero art and section dividers

Organic, flowing blob/wave shapes in vivid purples, violets, teals, blues, and pinks that radiate from a central point and fill the hero zone on the Blush Wash (#f9d9f7) background. Shapes have soft, hand-drawn curves — no geometric edges. The headline text overlays and intersects these shapes.

### Minimal Top Bar
**Role:** Site navigation

Transparent background, Paper White canvas. Left: brand name 'MARTIN LAXENAIRE' in MonumentExtended UltraBold at 18–21px, uppercase, Ink Black. Right: a pill-shaped percentage indicator (0%) showing scroll progress. No menu items, no links — the nav is intentionally stripped to two elements.

### Scroll Cue
**Role:** Invitation to interact

'SLIDE TO BEGIN' label in MonumentExtended Regular at 16px uppercase, letter-spacing wide, positioned below the hero composition. A horizontal pill-shaped track (pill radius 20.93px) sits beneath as the interaction surface. Minimal, deliberate, no arrows or icons.

### Section Heading
**Role:** Content section titles

MonumentExtended Regular at 26–31px, line-height 0.85, Ink Black. Used to introduce project sections, about blocks, and case studies. Paired with generous 31–38px column gaps in multi-column layouts.

### Body Text Block
**Role:** Paragraphs and descriptions

Swiss at 17–19px, line-height 1.20, Ink Black. Dense but not crowded. Paragraphs are short (2–3 lines max). The tight 1.20 line-height keeps the body voice compact and utilitarian, contrasting the display voice's expansiveness.

### Link List Item
**Role:** Navigation within content

MonumentExtended Regular at 21px, line-height 0.85, Ink Black with underline or 2px vertical padding. Links stack vertically with 21px row gaps. Tight line-height creates visual stacking that reads as a printed list, not a web menu.

### Footer Mark
**Role:** Closing signature

MonumentExtended UltraBold or Regular at 16–21px, Ink Black, minimal content. The footer carries the same typographic confidence as the hero but at utility scale — a bookend, not a statement.

## Do's and Don'ts

### Do
- Use MonumentExtended UltraBold at 94px or larger for any headline meant to be a focal point, with line-height 0.75–0.85
- Set all borders to 1px solid #121212 — no colored borders, no thicker hairlines
- Use 20.93px border-radius for all interactive controls (buttons, tags, indicators) — never square corners on controls
- Keep the page background #ffffff everywhere except the hero zone, which uses #f9d9f7 as the wave-art canvas
- Use Swiss at 16–19px for all body, button labels, and utility text with line-height 1.20
- Position wave-art shapes to intersect headline text, using white text outlines to maintain legibility through the color
- Maintain a 42px minimum vertical gap between content sections to preserve gallery-wall breathing room

### Don't
- Never use color on functional UI elements — buttons, links, tags, and text are always #121212 on #ffffff
- Never use drop shadows, box-shadows, or any elevation — the design is poster-flat
- Never use border-radius other than 20.93px (for controls) or 0px (for surfaces) — no mixed rounding
- Never set body text larger than 31px or with line-height above 1.20 — the utility voice must stay quiet
- Never use decorative icons or illustrations outside the hero wave composition — the rest of the page is type-only
- Never use #f9d9f7 as a card, section, or component background — it exists solely as the wave-art field
- Never add more than one wave-art composition per page — the collision of monochrome and color is a single-moment effect

## Elevation

The system has zero elevation. There are no drop shadows, no box-shadows, no layered surfaces. Depth is created entirely through the interplay of black text against flat color shapes on a white page. Components sit on the same plane — the design is poster-flat, not app-dimensional.

## Surfaces

- **Paper White** (`#ffffff`) — Default page background, dominates all non-hero sections
- **Blush Wash** (`#f9d9f7`) — Hero zone only — the field behind the wave-shaped color shapes

## Imagery

Imagery is dominated by the abstract wave-shape composition: fluid, organic blobs in vivid purples, violets, teals, pinks, and blues that radiate outward like a paint pour. These are not illustrations of objects — they are pure color-form compositions with a hand-drawn, liquid quality. Below the hero, imagery would shift to project screenshots, process videos, and case-study visuals rendered without frames or rounded corners (matching the poster-flat aesthetic). No lifestyle photography, no stock imagery, no decorative icons — every visual element is either the wave art, a project deliverable, or the typography itself.

## Layout

Full-bleed single-column hero with the wave composition centered on the page, massive display text breaking through it. Below the fold, content likely shifts to a max-width 1200px centered container with generous 42px section gaps. The overall page rhythm is: one explosive focal point, then quiet monochrome sections that let the hero breathe. Navigation is a minimal two-element top bar (brand left, scroll percentage right). The layout philosophy is gallery-wall: the hero piece commands the room, everything else recedes.

## Similar Brands

- **Locomotive** — Same maximalist display typography (oversized, condensed sans-serifs) crashing through minimal monochrome layouts — a French web agency tradition of treating each page as a printed poster
- **Benedikt Groß** — Personal portfolio for a creative technologist using a single-color-accent-against-white approach with oversized display type and organic abstract shape compositions as hero art
- **Active Theory** — Bold, poster-scale typography with zero surface elevation, relying on the collision of massive type and abstract geometric/organic shapes rather than traditional UI chrome
- **Pentagram** — Editorial-print sensibility applied to web — binary typographic scale (whisper or roar), monochrome interface with a single hero moment of visual complexity, gallery-wall spatial rhythm
- **Hungryman** — French creative portfolio aesthetic with oversized MonumentExtended-style display faces at extreme sizes, pill-shaped controls, and an anti-app anti-dashboard spatial approach
