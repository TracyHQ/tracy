# Studio Oker — Style Reference
> darkened gallery with scarlet punctuation — a black-walled portfolio room where white type floats and one red whisper cuts through the silence.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Studio Oker presents a darkened gallery aesthetic where pure black canvases frame white typography and project showcases with monastic restraint. The system speaks through negative space — generous 120–264px section breaks, hairline borders, and tight letter-spacing that pulls type into whisper-thin compositions. A single vivid scarlet acts as punctuation rather than decoration, surfacing only in project-specific contexts and a single 'Think Big' hero moment. Photography dominates the surface, displayed in asymmetric tile grids that let the work carry visual weight without decorative chrome. The rhythm is slow, considered, and confident — a portfolio that trusts silence over spectacle and treats every margin as a deliberate composition choice.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure Black | `#000000` | Page canvas, section backgrounds, project card fills — the void everything else floats on |
| Soft Black | `#101010` | Subtle surface elevation over the pure black canvas, card backgrounds in tight stacks |
| Bone White | `#ffffff` | Primary text, headings, hairline borders, nav text — the only light in the room |
| Fog Gray | `#a0a0a0` | Secondary text, metadata, captions, image borders, inactive labels |
| Graphite | `#484848` | Footer borders, section dividers, rare structural lines that recede into the dark |
| Scarlet Signal | `#e4002b` | Supporting palette color for small decorative accents when the core palette needs contrast. |
| Rose Brand Spectrum | `linear-gradient(90deg, #f5a5a5 0%, #e85a5a 25%, #d42020 50%, #7a0a0a 70%, #2a0606 85%, #000000 100%)` | Brand color exploration panel — a pink-to-black swatch that walks from #f5a5a5 → #e85a5a → #d42020 → #7a0a0a → #2a0606 → #000000 as a literal brand-color system reveal |

## Typography

### NextBook — The studio's own custom display and text face. Weight 300 whispers in section headings and 80px display; weight 400 carries body, labels, and nav. Used across every context — hero, body, heading, link, list, icon, footer.
- **Substitute:** Söhne (Klim Type Foundry) or Inter as a free alternative — both share the same humanist-geometric balance and tight tracking behavior
- **Weights:** 300, 400
- **Sizes:** 16px, 24px, 32px, 80px
- **Line height:** 1.00, 1.13, 1.25
- **Letter spacing:** -0.01em to -0.02em — tighter as size grows (16px uses -0.01em, 32–80px use -0.02em)

### Circular Std — Referenced inside project case studies (the 'AaBbCc 1234' specimen tile) as a client font example — not part of Studio Oker's own UI system
- **Substitute:** Inter or Manrope
- **Weights:** Book, Bold
- **Sizes:** specimen display sizes only
- **Line height:** 1.0

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 16px | 1.25 | -0.16px |
| subheading | — | — | 24px | 1.13 | -0.24px |
| heading-sm | — | — | 32px | 1 | -0.64px |
| display | — | — | 80px | 1 | -1.6px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 120px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Site-wide persistent header

Full-bleed #000000 bar, ~48px tall, 16px horizontal padding. Three zones: left = 'Studio Oker' wordmark in NextBook 16px #ffffff; center = timestamp/date in NextBook 16px #a0a0a0 ('2758.22.57:55'); right = nav links (Work, Feed, Studio, Contact) in NextBook 16px #ffffff with 16px gaps, followed by a 2×2 grid expand icon. No background fill beyond black, no border-bottom — the bar blends into the canvas.

### Project Tile Card
**Role:** Grid cell in the work showcase

Aspect-ratio-locked tile (varies per tile, appears ~1:1, ~3:4, and ~4:3) with 0px radius. Content is either a brand mark on white (#ffffff background, black logo) or a full-bleed photograph. Tiles are separated by 16px gutters on a #000000 canvas. No border, no shadow, no padding — the edge of the photograph IS the edge of the card.

### Full-Bleed Red Panel
**Role:** Hero-scale statement tile (e.g. 'Think Big.')

Single tile spanning roughly one full grid column at large height, #000000 background, displaying oversized type in #e4002b. The text is NextBook weight 300, approximately 120–160px, set tight. A small red dot (●) followed by 'Read more' in NextBook 400 16px #ffffff sits at the bottom-left with 16px padding. This is the system's only place where color shouts.

### Brand Color Swatch Panel
**Role:** A literal brand-system reveal inside a project tile

One tile is dedicated to a 6-stop pink-to-black gradient (#f5a5a5 → #e85a5a → #d42020 → #7a0a0a → #2a0606 → #000000), split into vertical bars of equal width. The tile IS the gradient — no labels, no copy. Functions as a self-portrait of the brand's color DNA.

### Typography Specimen Tile
**Role:** A client's font system displayed inside a project card

White (#f5f5f5 or #ffffff) tile containing 'Circular Std' and 'Book Bold' labels in small caps, followed by 'AaBbCc' and '1234' in large display sizes. Used to show a brand's typographic identity at a glance. Zero radius, tight margins.

### Section Heading
**Role:** Top-of-section title for Feed, Studio, etc.

Left-aligned, NextBook weight 300 or 400, 80px, line-height 1.0, letter-spacing -1.6px, #ffffff on #000000. Sits with 120px margin-bottom to its content. The size commands the room; the weight keeps it from shouting.

### Studio Stat Block
**Role:** Compact label/value pairs in the About/Studio section

Two-column layout. Labels ('Established', 'Location', 'Employees', 'Clients') in NextBook 400 16px #a0a0a0. Values ('2018.08.05', 'Stavanger, Norway', '11', '66') in NextBook 400 16px #ffffff directly below, no gap. No borders, no boxes — typography does the structuring.

### Services List
**Role:** Vertical list of service offerings

Plain stack of strings — 'Brand strategy', 'Brand design', 'Digital experiences', 'Motion design', 'Spatial design' — each in NextBook 400 16px #ffffff with no bullets, no leading characters, line-height 1.25. Functions as raw copy, not a styled list.

### Project Showcase Card (Feed)
**Role:** Large format work card with image + caption

Full-width or half-width block, #000000 background, 0px radius. Image fills the upper portion (no padding, edge-to-edge). Below the image: client name in NextBook 400 ~24px #ffffff, then a short project description in NextBook 400 16px #a0a0a0, then a list of disciplines in 16px #a0a0a0. Caption block has ~16px padding. No border, no shadow — the photograph defines the card's boundary.

### Link with Red Dot
**Role:** Standalone call-to-action / read-more affordance

A 6px #e4002b circle followed by 16px text in NextBook 400 #ffffff. The dot is the only color element; the text is the only typographic element. No underline, no padding, no border — the dot does the work of a button without a button shape.

### Footer
**Role:** Page-bottom site info

#000000 background, 16px padding, 1px top border in #484848. Content in NextBook 400 16px #a0a0a0 (or #ffffff for the 'Studio Oker' mark). Minimal, quiet, no CTAs.

## Do's and Don'ts

### Do
- Use Pure Black (#000000) as the universal background — never introduce gray surfaces, tints, or off-white panels
- Set all radii to 0px — cards, buttons, images, and tags all share sharp corners
- Use NextBook weight 300 at 80px for section headings, with -0.02em letter-spacing (-1.6px) — the whisper-weight is the signature, not the size
- Reserve Scarlet Signal (#e4002b) for exactly one use per screen — a single red dot, a single red panel, or a single red link — never as a fill color across multiple elements
- Honor the 120px section gap and 240–264px breathing-room margins as the page's structural rhythm; collapse these only inside dense tile grids
- Use #a0a0a0 for ALL secondary text, metadata, and image borders — never invent intermediate grays
- Treat photographs as edge-to-edge artwork with no inner padding, no rounded corners, and no overlay treatments

### Don't
- Don't add drop shadows, inner shadows, or glow effects — the system uses void, not elevation, to separate elements
- Don't introduce a second accent color — the scarlet is the only chromatic signal in the entire system
- Don't use bullet points, numbered lists, or icon prefixes in body copy — the Services list and Studio stat block prove that raw stacked text carries more weight than decorated lists
- Don't center-align body paragraphs — every long-form block is left-aligned and reads as a typographic column, not a display statement
- Don't use buttons with backgrounds — actions are dots, links, or text; the red dot IS the button
- Don't add gradients to UI elements (the rose panel is a single brand artifact, not a pattern to replicate on cards, buttons, or backgrounds)
- Don't use NextBook weight 600+ — the system only operates at 300 and 400; bolder weights would break the whisper-confident voice

## Elevation

Elevation is replaced by the void. The design treats the pure black canvas itself as the lowest surface and refuses to add shadows, glows, or tonal lifts — cards and tiles sit on the same plane as the page, distinguished only by the content (image, type, color) they contain. When separation is needed, a single hairline border at #484848 or #a0a0a0 is used. This is a deliberate anti-skeuomorphic stance: the page behaves like a gallery wall, not a stack of cards.

## Surfaces

- **Canvas Black** (`#000000`) — Full-bleed page background across all sections
- **Soft Black** (`#101010`) — Rare slightly-elevated card or panel that breaks the void by 1-2% lightness
- **Graphite Line** (`#484848`) — Hairline divider between footer blocks and major section breaks

## Imagery

Photography is the dominant visual element. Treatment: full-bleed, edge-to-edge, no rounding, no internal padding, no overlay text. Subjects range from tight product crops (the Strutt wheelchair joystick, the tablet showing a website) to human portraiture (the smiling woman in soft natural light) to abstract textures (the dark grid with scattered red dots). Images are high-resolution and treated as artwork objects, not content blocks — they get breathing room (120px+ margins) and are arranged in asymmetric grids. The studio does not use illustrations, icons (except a single 2×2 expand glyph in the nav), or 3D renders of their own. Color treatment is natural and unmanipulated, with the exception of one image (the red-dot grid) that doubles as a brand reference.

## Layout

Full-bleed dark canvas, no max-width containment. The page is structured as a vertical sequence of full-width sections separated by 120–240px vertical air. Top: a fixed-height nav bar, then a 3- or 4-column asymmetric grid of project tiles (varying aspect ratios create rhythm — a white logo card, a rose-gradient panel, a photo card, a red 'Think Big' panel). Middle: the About/Studio section uses a 3-column text block (description, manifesto, services+stats) at left-aligned, then a 'Feed' heading that introduces a 2-column project showcase grid. Navigation is a single minimal top bar — no sidebar, no mega-menu. Density is sparse: large negative-space margins dominate, and information is meted out in small typographic blocks rather than dense panels.

## Similar Brands

- **Locomotive (locomotive.ca)** — Same full-bleed dark canvas approach, generous vertical breathing room between sections, and a portfolio-first grid where project photography carries visual weight with zero chrome
- **Snøhetta (snohetta.com)** — Shared Scandinavian agency restraint — left-aligned typographic columns, hairline dividers, and project showcases that let oversized photography dominate without competing UI
- **Manual (manual.to)** — Same zero-radius, dark-canvas, single-accent-color discipline; both use a vivid color as a single punctuation mark inside an otherwise monochrome portfolio grid
- **Pentagram (pentagram.com)** — Same project-tile-as-art-object treatment — each work is its own bordered image without padding or decoration, arranged in a grid that reads as a wall rather than a list
- **& Studio Cheha (studiocheha.com) ""** — Shared obsession with type-as-architecture — large display sizes at whisper weights, tight negative letter-spacing, and a willingness to let one oversized word fill a panel
