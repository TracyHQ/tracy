# 70Materia — Style Reference
> Architectural sample board on white paper — the UI is the mount, never the artwork.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

70Materia is a neutral frame built to disappear around its content — a curated material library where the UI chrome is deliberately invisible so stone, terrazzo, and pigment samples can dominate. Every typographic element sits at weight 400 in a single sans family (Matter), with a monospace companion (Matter Mono) used for labels, navigation, and small UI controls. Letter-spacing on the mono (0.02em–0.04em) plus tabular numerals gives the interface a spec-sheet, architectural-drawing quality — as if the page itself is a technical sample board. The palette is strictly achromatic: black text, white surfaces, and a warm mid-gray canvas (#bababa) that recedes behind the photography. Buttons are thin, square, and outlined; the only filled surface is a near-black (#1e1e1e) for select actions and the footer. No accent color exists in the system — all chromatic energy is outsourced to the product photography.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, hairline borders, navigation outlines — the structural ink |
| Bone | `#ffffff` | Page highlights, card surfaces, text on dark surfaces, button outlines |
| Graphite | `#1e1e1e` | Filled button background, footer surface, dark UI blocks — warm near-black replacing pure black for non-text surfaces |
| Ash | `#bababa` | Dominant page canvas, muted dividers, secondary surface tone |

## Typography

### Matter — Primary text family for headings, body, hero captions, and links. Used exclusively at weight 400 — no bold variation exists in the system, which forces hierarchy through size and placement rather than weight. Custom font with tabular numerals ("tnum") baked in, so numbers in body copy align like a price list.
- **Substitute:** Inter, Söhne, or Untitled Sans at weight 400
- **Weights:** 400
- **Sizes:** 15px, 19px, 20px
- **Line height:** 1.20
- **OpenType features:** `"tnum"`

### Matter Mono — Micro-label and UI chrome family — navigation items, button text, section labels, product codes (AT.OLO). Letter-spacing of 0.02em–0.04em widens the mono into a uppercase-leaning technical readout. This font carries the brand's architectural-drawing personality; without it the page reads as a generic minimalist site.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Berkeley Mono
- **Weights:** 400
- **Sizes:** 10px, 12px
- **Line height:** 1.20–1.30
- **Letter spacing:** 0.02em (12px) and 0.04em (10px)
- **OpenType features:** `"tnum"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.3 | 0.4px |
| body | — | — | 15px | 1.2 | — |
| subheading | — | — | 19px | 1.2 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 960px
- **Section gap:** 100-180px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 3px

## Components

### Primary Outlined Button
**Role:** Default action trigger (DISCOVER MORE, DISCOVER THE SHOWROOM, SUBSCRIBE TO OUR NEWSLETTER)

1px solid #000000 border on transparent background, 3px corner radius, 8px vertical × 24px horizontal padding. Label set in Matter Mono 12px, weight 400, letter-spacing 0.02em, uppercase, #000000. No hover fill — the button stays an outline at all times, reading more like a tagged label than a CTA.

### Filled Dark Button
**Role:** Secondary emphasis action, used sparingly

Background #1e1e1, white Matter Mono 12px label, 3px radius, 8px × 24px padding. Reserved for high-intent actions; the rest of the system is outlined.

### Top Navigation Bar
**Role:** Primary site navigation

Transparent over the hero image, single row, logo '70Materia' left in Matter 20px, nav items right (MATERIALS, APPLICATIONS, PRODUCTS, PROJECTS, JOURNAL, COMPANY, NEWS, CONTACTS) in Matter Mono 10px uppercase, letter-spacing 0.04em, #000000. No background fill, no shadow — the nav floats on the image.

### Full-Bleed Hero Image
**Role:** Opening visual statement

Edge-to-edge photograph, no overlay, no gradient, no text within the image area. The first screen of the site is 100% photography — the UI only appears as nav chrome on top.

### Two-Column Showcase Section
**Role:** Editorial content blocks (project highlights, newsletter CTA)

Two equally weighted columns, each containing a full-bleed image, a Matter Mono 10px label (e.g. VISIT OUR SHOWROOM), a Matter 15px description paragraph in #000000, and an outlined button beneath. 24px row gap between elements, columns separated by the page canvas, not a divider.

### Product Caption Tag
**Role:** Persistent product identification overlay

Bottom-left of the viewport, Matter Mono 10px, uppercase, letter-spacing 0.04em (e.g. 'AT.OLO'). Functions as a museum-style object label — the same piece of furniture/material gets identified regardless of which section you're viewing.

### Footer
**Role:** Site closure

Dark band, background #1e1e1, text #ffffff in Matter Mono 10–12px. Minimal — links, address, and legal. The only place the page drops below the gray canvas into a defined dark block.

### Image Card
**Role:** Contained photography in mixed sections

Zero radius, no border, no shadow. Images sit directly on the #bababa canvas or on a white (#ffffff) panel. The corner is always sharp — the materials themselves provide the visual interest, not the frame.

### Newsletter Input Row
**Role:** Email capture

Underlined text input (1px #000000 bottom border only) with a SUBSCRIBE button to the right. No filled input field, no rounded corners — the underline is the entire affordance.

## Do's and Don'ts

### Do
- Set every heading and body run in Matter at weight 400 — never introduce a bold weight to create hierarchy; use size and space instead.
- Use Matter Mono 10–12px with letter-spacing 0.02em–0.04em for all labels, nav items, button text, and product codes.
- Let product photography fill the viewport edge-to-edge; never crop, frame, or overlay UI on hero images.
- Build buttons as 1px outlined rectangles with 3px radius and 8px × 24px padding — the default action style.
- Use #bababa as the page canvas and let white (#ffffff) appear only as inset paper or dark text on dark surfaces.
- Keep the corner radius at 3px for buttons and 0px for everything else; the system is fundamentally sharp-edged.
- Apply tabular numerals ("tnum") on all text containing numbers so they align vertically across the page.

### Don't
- Do not introduce any chromatic accent color — orange, blue, green, red. The palette is permanently achromatic; color is the photography's job.
- Do not use drop shadows, gradients, or glow effects — the depth model is light surface → mid-gray canvas → dark footer, nothing more.
- Do not round card corners, image corners, or section containers — only buttons get a 3px radius; everything else is sharp.
- Do not use a bold or semibold weight from Matter; weight 400 is the only weight in the system.
- Do not place colored text, colored icons, or colored borders on functional UI — keep all chrome black, white, or gray.
- Do not center body copy in editorial sections; left-align descriptions and labels in the two-column showcase layout.
- Do not use a filled white input field with a visible border — form fields are defined by a single bottom underline only.

## Elevation

The design intentionally avoids all shadow-based elevation. Depth is communicated exclusively through surface tone: #bababa canvas recedes behind #ffffff paper panels, and #1e1e1 footer sits as the deepest layer. Components never cast shadows, never float, never feel detached from the surface — they are drawn, not lifted.

## Surfaces

- **Canvas** (`#bababa`) — Dominant page background — the warm gray field on which all content sits
- **Paper** (`#ffffff`) — Inset cards, text panels, and high-contrast image surrounds
- **Lacquer** (`#1e1e1`) — Footer and filled button surfaces — the deepest UI layer

## Imagery

Photography is the entire visual identity. Images are tight, material-focused crops of finished surfaces — terrazzo tables, stone slabs, pigment samples, furnished interiors — presented as full-bleed objects with no lifestyle context. The subject is always the material itself, isolated against neutral concrete or white walls, lit with soft natural light. No illustration, no abstract graphics, no icons except tiny mono-style UI labels. Color treatment is true-to-life — the system trusts the materials to be chromatic. The visual density is overwhelmingly image-heavy: one photograph typically occupies 60–100% of the viewport, with text and UI chrome compressed into small 10–12px labels that read as documentation rather than design.

## Layout

The page is a vertical sequence of full-bleed editorial moments, each consisting of either a single full-width image or a two-column image+text block. The hero opens with an edge-to-edge photograph and the nav floats on top; no centered headline, no gradient overlay. After the hero, sections appear as centered two-column grids with a max content width of ~960px, where each column contains an image stacked above a mono label, a short body paragraph, and an outlined button. Section spacing is generous (100–180px vertical padding), creating a slow museum-walk rhythm between content blocks. There is no sidebar, no card grid, no pricing table — the layout is always image-then-text, never the reverse. Navigation is a single transparent top bar; the footer is a dark band that closes the page.

## Similar Brands

- **Dzek (dzekdzek.com)** — Same material-library editorial approach — achromatic UI, full-bleed stone and surface photography, mono-style small labels, and outlined ghost buttons that defer to the materials
- **Studio Zhu Pei** — Architectural practice websites that use the same neutral-canvas + large-format photography + tiny mono label pattern, with buttons as thin-outlined rectangles
- **Salvatori** — Italian stone brand that pairs a mid-gray or white page canvas with large hero photography and minimal outlined UI chrome
- **Mutina (mutina.it)** — Surface/tile brand using a similar spec-sheet sensibility — mono labels with letter-spacing, matter-of-fact body type at 400, and a palette that stays achromatic so the tile photography carries the color
