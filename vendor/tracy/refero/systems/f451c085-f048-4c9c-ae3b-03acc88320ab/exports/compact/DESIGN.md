# Resident — Style Reference
> Architecture monograph on cream paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Resident operates as a quiet editorial gallery for design objects: white paper canvas, near-zero chrome, and large-format photography doing all the visual work. The interface is almost entirely monochrome — black ink on white paper with hairline rules and small ghost text — letting the rooms, furniture, and light fixtures themselves provide every chromatic decision. Typography is a single custom sans-serif (MessinaSans) at moderate weights with tightened tracking, giving headlines a precise, catalogue-like authority without ever feeling loud. Components are reduced to their skeletons: a tiny underlined nav, border-only buttons, a section heading that scales to the edge of the column. No shadows, no gradients, no surface elevation — depth comes only from the photographs and generous vertical breathing room between editorial spreads.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Body text, nav links, icon strokes, and all hairline borders (1px rules under nav, around inputs, and between editorial blocks). The structural workhorse — 724 borderColor occurrences and 336 body borders show it carries the layout's edges |
| Paper White | `#ffffff` | Page canvas, card surfaces, nav background, and ghost button fills. Everything floats on this surface; the entire interface is one flat sheet |
| Soft Graphite | `#979797` | Muted body text and secondary borders. 2.9:1 contrast against white means it is intentionally faint — used for helper copy and less critical dividers, never for primary content |
| Charcoal | `#333333` | Icon strokes, fills, and button borders for secondary controls. Sits between ink-black and mid-gray, giving icons a softer presence than body text without losing legibility at 12.6:1 |

## Typography

### MessinaSansWeb — Brand typeface — used for all headings, body copy, nav, and product descriptions. Custom geometric sans with tightened tracking (-0.0370em at display, -0.0300em at body) and moderate weight (400–500, never bold). The anti-conventional choice: running a custom sans at weight 400 for section headings instead of 600–700 — authority comes from the typeface's precision and the negative letter-spacing, not from weight.
- **Substitute:** Inter, Suisse Int'l, or Söhne (for closest tracking and geometric character)
- **Weights:** 400, 500
- **Sizes:** 14, 18, 19, 23, 27
- **Line height:** 1.00–1.40 (varies by size: 1.00 at 27px display, 1.20 at 23px heading, 1.29–1.40 at body sizes)
- **Letter spacing:** -0.0370em at display sizes (27px), -0.0300em at body sizes (14–19px)

### system-ui sans-serif — Utility text for small chrome — nav secondary items, footer micro-copy, minor UI labels. Deliberately reduced to two sizes and one weight; the system stack disappears so MessinaSans remains the voice of the brand.
- **Weights:** 400
- **Sizes:** 12, 14
- **Line height:** 1.20–1.30
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.3 | -0.42px |
| body-lg | — | — | 19px | 1.4 | -0.57px |
| heading-sm | — | — | 23px | 1.2 | -0.69px |
| display | — | — | 27px | 1 | -1px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 48-64px
- **Card padding:** 0px
- **Element gap:** 18-21px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Sticky top bar on white background. Left cluster: primary nav items (Furniture, Lighting, Designers, Journal, Resources, About) in 12–14px MessinaSans 400, black, spaced ~18–21px apart. Right cluster: secondary actions (Login, Search, Cart with count) in system sans 12–14px. 21px vertical padding. No background, no border-bottom — the nav sits naked on white paper.

### Ghost Nav Link
**Role:** Navigation item

Text-only, no background, no border, no underline at rest. 12–14px MessinaSans 400, #000000. On hover or active state, a 1px black underline appears beneath the text. 5–10px horizontal margin between items.

### Section Display Heading
**Role:** Editorial section title

Massive 27px MessinaSans 400, #000000, line-height 1.00, letter-spacing -1.00px. Can be set to the right column edge of a two-column layout (as in the 'Resident' wordmark in the hero). Zero margin — it anchors the section rather than centering within it.

### Editorial Image Spread
**Role:** Hero photography and product showcases

Full-bleed or column-width photographs with 0px border-radius, displayed at 1:1 or 4:3 aspect ratios. Images sit edge-to-edge with no frames, no captions overlays, and 24–48px gaps between paired photographs. The photographs themselves are the entire visual system — no illustrations, no icons overlaid.

### Two-Column Editorial Block
**Role:** Body content layout

Two equal columns with ~24px gap. Left column: descriptive body text in 18–19px MessinaSans 400, line-height 1.29–1.40, #000000. Right column: complementary paragraph at the same spec. No vertical rule between columns — the gap is the divider.

### Ghost Link / Text Button
**Role:** Inline link and minimal CTA

14px MessinaSans 400, #000000, 1px black underline, 3–6px horizontal padding. No background, no border, no fill. The only interactive element style on the site — there are no filled buttons anywhere.

### Bordered Input
**Role:** Form fields

1px solid #000000 border, 0px radius, white background, 14px MessinaSans 400, #000000 text. 10px vertical padding, no focus ring color shift (border remains black). Placeholder text at default body color.

### Footer
**Role:** Site footer

21px vertical padding, system sans-serif 12–14px, #000000. Organized in small text clusters (links, locale switcher EN/DE, legal). No dividers, no background fill — continues the white paper sheet.

### Product/Collection Card
**Role:** Product listing entry

Zero-padding card — just a photograph followed by product name in 14–18px MessinaSans 400 and price/spec in the same size. No card background, no border, no shadow. The card is a typographic block beneath a photograph, not a container.

### Locale Switcher
**Role:** Language toggle (EN/DE)

12px system sans, #000000, inline text with a thin space separator. No dropdown, no flags — just adjacent uppercase two-letter codes in a single line.

## Do's and Don'ts

### Do
- Set all borders to 1px solid #000000 — never use thicker rules or colored borders.
- Use MessinaSans at weights 400 or 500 only; never bold (700) — the typeface's geometry carries the hierarchy, not weight.
- Apply letter-spacing -0.0370em to display sizes (23px+) and -0.0300em to body sizes (14–19px).
- Keep all border-radius at 0px — the design is intentionally architectural and sharp-edged.
- Let full-bleed or column-width photography be the sole source of color and visual interest on the page.
- Use ghost/underline links (14px MessinaSans 400, 1px black underline) for all interactions — never filled buttons.
- Maintain 48–64px vertical gaps between editorial sections to preserve the magazine spread rhythm.

### Don't
- Do not introduce any chromatic color, gradient, or colored fill — the palette is four neutrals and the photographs provide everything else.
- Do not add box-shadow, elevation, or surface tinting — depth comes from photography, not chrome.
- Do not use bold (700) weights on MessinaSans — moderate weight with tight tracking is the signature.
- Do not use border-radius on any element — cards, buttons, images, and inputs are all sharp-edged.
- Do not use filled or colored buttons — all interactive elements are text links with 1px black underlines.
- Do not place icon overlays, badges, or decorative graphics on top of product photography.
- Do not center-align body text in multi-column layouts — the editorial grid uses left-aligned asymmetric columns.

## Elevation

The design deliberately avoids shadows, gradients, and any surface lift. Depth is achieved only through full-bleed photography and generous vertical whitespace. No box-shadow, no colored fills, no modal scrims — the page is a flat editorial sheet where images create their own dimensionality against white.

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas and the only surface in the system. All content — nav, cards, images, text blocks — sits directly on this single plane.

## Imagery

Photography is the entire visual language — no illustrations, no 3D renders, no iconography beyond minimal UI glyphs. Imagery is editorial-architectural: warm interior shots of rooms with Resident furniture and lighting, shot at natural light with muted earth tones (dusty pinks, warm woods, concrete greys, firelit ambers). Composition is wide and environmental — the furniture is shown in lived-in spaces, not on white seamless. Images are always full-bleed or column-width with 0px corner radius, never masked, never with text overlays. Color treatment is naturalistic with slight warmth — not desaturated, not duotone. Photography occupies 60–70% of the page surface area on most screens; the remaining white paper is intentional negative space.

## Layout

Editorial two-column magazine grid. Max-width ~1440px with no centered container constraint — the grid runs edge-to-edge with generous outer margins. Hero pattern: oversized section heading (e.g. 'Resident') set at display weight positioned in the right column, with a two-photograph spread beneath filling the full width. Content sections alternate between two-column text blocks and image grids (2-up or 3-up). No full-viewport hero, no video, no animated banners — the page begins immediately as a quiet editorial spread. Section rhythm is consistent: 48–64px vertical gaps between blocks, no background bands, no visual dividers beyond whitespace. Navigation is a minimal top bar with small ghost links. No sidebar, no sticky elements beyond the nav, no mega-menu. The overall feel is of flipping through a design monograph rather than browsing a product catalog.

## Similar Brands

- **Menu (menu.world)** — Same editorial-monograph approach: custom geometric sans at moderate weights, near-zero chrome, full-bleed furniture photography as the sole color source, and hairline 1px rules replacing all decorative borders.
- **Aesop (aesop.com)** — Shared restraint philosophy: white canvas, single custom typeface, no filled buttons (all ghost links), photographic warmth providing the only chromatic content, and generous editorial whitespace between sections.
- **Hem (hem.com)** — Same Scandinavian design-object sensibility with monochrome UI, tight-tracked geometric sans, borderless image-led grids, and ghost-text navigation that disappears to let product photography lead.
- **Vitra (vitra.com)** — Identical editorial-design language: catalog-style two-column layouts, oversized section headings, architectural photography of furniture in rooms, and a four-neutral palette with no decorative color.
