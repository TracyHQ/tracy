# Eindhoven Design District — Style Reference
> editorial brutalism on white paper — a municipal design manifesto rendered in oversized type, sparse photographs, and absolute restraint.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Eindhoven Design District reads as editorial brutalism on white paper: a near-monochrome canvas where typography does the heavy lifting and photography earns its space through scale and asymmetric placement. The entire interface is a conversation between massive HelveticaNow display type and quiet supporting text, with black-on-white doing 95% of the work. The only chromatic note is a single vivid red used as a content accent (article category labels) — never as UI chrome. Components are deliberately flat: pill-shaped ghost buttons, image-top article cards, hairline borders, zero shadows or gradients. The result is less a website and more a printed design journal that happens to be interactive.

## Colors

| Name | Value | Role |
|------|-------|------|
| Charcoal Ink | `#000000` | All text, borders, icon strokes, nav links, button outlines, and structural lines. The dominant ink of the system — every shape and character carries this weight |
| Paper White | `#ffffff` | Primary page canvas, card surfaces, button fills, and inverted text on dark blocks. The ground against which everything else is set |
| Newsprint Gray | `#e8e8e8` | Section background for content bands (article grids, footer areas) — creates quiet tonal shifts between white sections without introducing a second hue |
| Pewter | `#bfbfbf` | Muted helper text, list dividers, secondary link borders — used sparingly where information is deprioritized but still present |
| Signal Red | `#ff0000` | Red outline accent for tags, dividers, and focused UI edges. |

## Typography

### HelveticaNow — The sole typeface across the entire system. Weight 600 carries headlines, button labels, and card titles; weight 400 handles body, navigation, and supporting text. The display sizes (50px and beyond) compress to tight line-heights of ~0.93–1.00, letting oversized words like 'Eindhoven' and 'Design District' stack with sculptural density. Letter-spacing tightens aggressively at large sizes (-0.05em) and loosens slightly at small sizes (+0.015em), giving the type an editorial confidence that shifts with scale.
- **Substitute:** Helvetica Neue, Inter, Neue Haas Grotesk
- **Weights:** 400, 600
- **Sizes:** 14px, 16px, 18px, 19px, 23px, 35px, 46px, 50px, 150px+ (display)
- **Line height:** 0.93, 1.00, 1.15, 1.20, 1.31, 1.40, 1.47
- **Letter spacing:** -0.05em at 150px+ display, -0.03em at 50px heading, -0.02em at 35px subheading, -0.004em at 18px body, +0.005em at 16px body-sm, +0.015em at 14px caption

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.4 | 0.21px |
| body-sm | — | — | 16px | 1.4 | 0.08px |
| body | — | — | 18px | 1.31 | -0.07px |
| subheading | — | — | 23px | 1.2 | -0.39px |
| heading-sm | — | — | 35px | 1.15 | -0.7px |
| heading | — | — | 46px | 1 | -1.38px |
| heading-lg | — | — | 50px | 1 | -1.5px |
| display | — | — | 150px | 0.93 | -7.5px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **tags:** 500px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 500px

## Components

### Pill Ghost Button
**Role:** Primary interactive element across the site — used for navigation, CTAs, and content links

Border: 1px solid #000000. Border-radius: 500px (full pill). Background: #ffffff. Text: #000000 at 16px weight 400, letter-spacing 0.005em. Padding: 10px 15px (compact) or 16px 20px (standard). No fill, no shadow, no hover background change — the button is a line of text inside an oval outline. Appears in 'Meer over Eindhoven Design District' and 'Zie alle artikelen'.

### Pill Filled Button
**Role:** Secondary action variant when higher emphasis is needed

Border: none. Border-radius: 500px. Background: #000000. Text: #ffffff at 16px weight 400. Padding: 10px 18px. Inverts the ghost pattern — solid black pill with white text for moments of stronger commitment.

### Display Headline
**Role:** Hero and section-defining typography

Font: HelveticaNow weight 400 (the lighter weight at maximum size is the signature — weight 600 is never used for display). Size: 150px+ with line-height 0.93. Letter-spacing: -0.05em. Color: #000000. Can be set horizontally or rotated 90° for architectural compositions. The compressed line-height and extreme negative tracking make the letterforms feel carved rather than typed.

### Navigation Bar
**Role:** Top-level site navigation

Position: top of page, non-sticky. Background: #ffffff. Contains logo (top-left, 'Eindhoven / Design District' in two lines, weight 400, ~14px), and right-aligned controls: language selector ('NL ▾' in pill outline), search icon (circle with magnifier), and 'Menu ≡' pill button. All elements use 14–16px weight 400. Generous padding creates breathing room above the hero.

### Article Card
**Role:** Content card for editorial articles in grid layouts

Background: #ffffff (on #e8e8e8 section). No border, no shadow, no radius. Structure: full-bleed photo at top, then content area with no padding gap. Content stack: 'Interview' label in 14px weight 400 #ff0000, then title at 19px weight 600 #000000 line-height 1.2, then excerpt at 16px weight 400 #000000 truncated to 3 lines. The card is a clean rectangle — the photo provides all visual energy.

### Hero Composition
**Role:** First-screen visual identity for landing pages

Full-viewport white canvas. Oversized display headline (150px+) split into two words positioned asymmetrically — one word horizontal, one word rotated 90° vertical. Subtitle in 19px weight 400 below the horizontal word. Photographs (architecture, people, objects) placed in a loose collage grid, roughly 300–400px wide, no borders, no rounded corners, integrated into the type composition rather than separated from it.

### Language Selector
**Role:** Locale switcher in navigation

Pill-shaped outline button. Border: 1px solid #000000. Border-radius: 500px. Text: 'NL ▾' in 14px weight 400 #000000. Padding: ~8px 12px. Minimal footprint, ghost style consistent with other interactive elements.

### Search Button
**Role:** Search trigger in navigation

Circular icon button. Border: 1px solid #000000. Border-radius: 50%. Contains a magnifier glyph at 16px #000000. No background, no fill. Diameter: ~40px.

### Intro Paragraph Block
**Role:** Body text introduction for page sections

Max-width: ~600px. Font: HelveticaNow 18px weight 400, line-height 1.31, letter-spacing -0.004em. Color: #000000. No drop cap, no decorative elements. Sits on #ffffff with generous vertical space above and below.

### Section Divider
**Role:** Implicit transition between content bands

No visible line or ornament. Sections are separated by vertical space (80px+) and a background shift from #ffffff to #e8e8e8. The tonal change IS the divider.

## Do's and Don'ts

### Do
- Use HelveticaNow weight 400 for all display-size text above 50px — the lighter weight at extreme scale is the system's signature tension
- Set border-radius to 500px on every button, tag, and language selector — the pill shape is non-negotiable
- Maintain the black/white/#e8e8e8 trichromatic discipline — resist adding accent colors to UI chrome
- Use #ff0000 only for editorial category labels in content areas, never for buttons, links, or structural elements
- Set letter-spacing to -0.05em at 150px+ display sizes and progressively loosen toward +0.015em at 14px caption
- Alternate section backgrounds between #ffffff and #e8e8e8 to create rhythm without ornament
- Place photographs in rectangular crops with no border, radius, or shadow — let the images sit raw on the page

### Don't
- Don't use weight 600 for display headlines above 50px — the system whispers at scale, it doesn't shout
- Don't add drop shadows, gradients, or glass effects to any component — the system is flat by conviction
- Don't introduce a second action color — buttons are always black-outline-on-white or solid-black-on-white
- Don't use border-radius values other than 0px (rectangular) or 500px (pill) — no 4px, 8px, or 16px rounding
- Don't set line-height above 1.0 for display text — the compressed stacking of oversized words is the visual identity
- Don't separate photographs from the typographic composition with frames, whitespace buffers, or containers
- Don't use the red accent for interactive states, hover effects, or focus rings — it is a content mark, not a system token

## Elevation

The system is intentionally shadowless. Elevation is achieved through spatial separation, tonal contrast between #ffffff and #e8e8e8, and generous vertical rhythm — not through drop shadows. Cards sit flat on their surface; buttons are defined by stroke, not depth.

## Surfaces

- **Paper White** (`#ffffff`) — Primary page canvas and content sections
- **Newsprint Gray** (`#e8e8e8`) — Alternating section background for article grids and footer bands

## Imagery

Photography is documentary and editorial, not decorative. Subjects are architecture (modern facades, geometric building patterns), people in their work environments (designers, makers, industrial settings), and objects in situ. Treatment is raw: full-saturation natural color, no filters, no duotone, no overlay effects. Photos are presented as rectangular crops (not square, not rounded) at varying scales — some fill half the viewport, others are small inline details. The images are placed with deliberate asymmetry, often abutting or overlapping the boundary of the typographic composition. There is no lifestyle staging, no model photography, no stock imagery — everything looks shot on location with a documentary eye. Iconography is essentially absent from the visible UI; navigation uses text labels and simple geometric glyphs (≡, ▾, magnifier).

## Layout

Full-bleed page with no outer frame. Content sections max at ~1200px but photography frequently breaks the container. The hero is a full-viewport typographic composition with scattered photo crops — not a centered banner. Below the hero, sections alternate between white and #e8e8e8 backgrounds with 80px+ vertical rhythm. Content is primarily left-aligned with generous left margin. The article section uses a 3-column equal grid. Navigation is a minimal top bar (logo left, controls right). The overall rhythm is editorial-magazine: sparse, large, typographic, with photography as punctuation rather than illustration.

## Similar Brands

- **Vitra** — Same editorial restraint with oversized sans-serif type, near-monochrome palette, and rectangular photography crops placed in typographic compositions
- **Muji** — Identical flat-surface philosophy, no shadows, no gradients, pill-shaped ghost buttons, and absolute typographic minimalism as the primary design language
- **Karlsruhe Design University (HfG)** — Same display-type-as-identity approach with massive Helvetica-family headlines, white canvas, and architectural photography
- **Pentagram** — Editorial brutalism with oversized type, hairline borders, no decorative elements, and photography integrated into the type grid
- **Swiss Design Archive** — Direct lineage to Swiss/International typographic tradition — tight tracking at display sizes, generous whitespace, neutral palette, Helvetica as the only voice
