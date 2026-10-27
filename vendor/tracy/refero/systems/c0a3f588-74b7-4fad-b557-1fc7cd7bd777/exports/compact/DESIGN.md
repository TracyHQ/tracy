# Not Real — Style Reference
> Editorial gallery spread on greyscale vellum — a high-end catalog where only the artwork is allowed to scream with color.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

NotReal operates as a typographic gallery: a near-empty off-white canvas where large product renders and campaign stills do the visual talking while two custom typefaces carry the verbal load. The system is deliberately chromatic-starved — three grays compose 99% of the interface — so that every saturated pixel arrives as client artwork, never as UI chrome. Layout is editorial, not app-like: an asymmetric two-column grid where hero images land at varying vertical offsets to create z-pattern reading flow, with vertical running text and micro-metadata adding a printed-catalog rhythm. The pairing of ogg (a high-contrast didone-influenced serif) for display with telegraf (geometric sans) for everything else is the signature — a whisper-and-speak duality where the serif announces the work and the sans documents it.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Charcoal | `#292a2c` | Primary text, dominant border strokes (635 occurrences as borderColor), nav accents |
| Vellum | `#f2f2f2` | Page canvas, card surfaces — warm-leaning off-white that gives the page a paper-stock feel rather than digital white |
| Full Black | `#000000` | Link border underlines, footer text, icon strokes, image overlay text — used as a chromatic anchor only where maximum contrast against Vellum is required |

## Typography

### ogg — Display and project headlines. This is a high-contrast didone-flavored serif used at 55px with aggressive -0.036em tracking — it acts as the gallery label, announcing each case study with typographic weight that the sans-serif never attempts. At smaller sizes (24-26px) the same family handles editorial pull-quotes and the wordmark, where the negative tracking tightens less aggressively (-0.02em). The signature choice: a single weight (400) doing all serif work, relying on the contrast within letterforms rather than weight variation to create hierarchy.
- **Substitute:** Playfair Display, DM Serif Display, or Cormorant Garamond
- **Weights:** 400
- **Sizes:** 24px, 26px, 55px
- **Line height:** 1.06, 1.10, 1.50
- **Letter spacing:** -0.0360em, -0.0200em

### telegraf — Body copy, navigation, metadata tags, project category labels, and secondary headings. A geometric sans that does all the quiet documentation work. At 55px it can also serve as display type, creating a rare moment where both fonts meet at the same size — typically the serif announces the project name while the sans describes it below. Tracking is positive throughout (0.002em to 0.040em), widening as size decreases — a deliberate inverse relationship that keeps small caps-styled metadata readable and gives the wordmark breathing room.
- **Substitute:** Inter, Söhne, or Suisse Int'l
- **Weights:** 400
- **Sizes:** 15px, 18px, 20px, 24px, 25px, 55px
- **Line height:** 0.75, 1.00, 1.08, 1.10, 1.25, 1.33, 1.67, 2.00
- **Letter spacing:** 0.0020em, 0.0210em, 0.0250em, 0.0330em, 0.0400em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 1.67 | 0.6px |
| body-sm | — | — | 18px | 1.5 | 0.38px |
| body | — | — | 20px | 1.33 | 0.5px |
| subheading | — | — | 24px | 1.25 | 0.6px |
| heading | — | — | 26px | 1.1 | -0.52px |
| heading-lg | — | — | 55px | 1.08 | 0.11px |

## Spacing & Layout

**Base unit:** 6px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 120px
- **Card padding:** 0px
- **Element gap:** 18px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Wordmark / Site Logo
**Role:** Persistent brand identifier in top-left of every page

Renders 'NotReal®' in ogg at approximately 55px with the registered trademark superscript. The serif letterforms with aggressive negative tracking create a luxury-fashion-house impression. Links to home. No background, no border — pure typographic mark on the Vellum canvas.

### Top Navigation Bar
**Role:** Primary site navigation, sits flush at the top of every page

Four links (Work, About, Jobs, Contact) in telegraf 18px, weight 400, color Ink Charcoal, spaced with wide horizontal distribution (the nav items push to the right side of the bar). No background fill, no border, no active state indicator beyond the hover/focus treatment on the link text. The nav is a transparent overlay on the Vellum canvas with generous top/bottom padding.

### Project Tile (Large Featured)
**Role:** Full-bleed campaign artwork for top case studies in the work grid

Large rectangular image (roughly 16:9 to 4:3) rendered at native resolution with zero border-radius. No border, no shadow, no padding. The image sits directly on the Vellum canvas. Below: project title in ogg 26px (or 55px for the largest), subtitle in ogg italic at the same line, category tags in telegraf 15px separated by ' / '. Title and subtitle are separated by an em-dash (—).

### Project Tile (Compact)
**Role:** Smaller secondary case study presentations in the asymmetric grid

Same composition language as the large tile but scaled down — image at roughly 2:3 or square aspect, no radius, no border, positioned with intentional vertical offset relative to neighboring tiles to create the editorial z-pattern. Typography below scales to telegraf 18-20px for title and 15px for tags.

### Inline Text Link
**Role:** Text links within body copy and navigation

telegraf body size, Ink Charcoal color, with a 1px Full Black bottom border acting as underline. The border is the visual weight — not the text color shift. No background hover state; the underline thickens or shifts to double on hover.

### Vertical Running Text
**Role:** Rotated metadata strip pinned to the right edge of the viewport

telegraf 15px text rotated 90° (reading bottom-to-top), Full Black, positioned absolutely along the right margin. Contains project ID or campaign reference (e.g., 'BA 1112PM – MAD 0&12AM ✳'). Functions as a printed-magazine running header, not a UI control.

### Category Metadata Tag
**Role:** Small text label indicating project discipline (cgi, art direction, campaign, etc.)

telegraf 15px, weight 400, Ink Charcoal, separated by ' / ' delimiters when multiple tags apply. No background, no border, no capitalization — sits directly on Vellum as quiet factual metadata.

### Project Title with Em-Dash Separator
**Role:** The signature heading treatment for every case study

Two-part heading: primary title in ogg (26-55px), em-dash separator (—), secondary descriptor in ogg italic at the same size. Both parts share the same typographic voice — the dash is the only structural punctuation. Used for every project across the grid.

### Agency Statement Block
**Role:** Introductory description text near the top of the Work page

Two-column layout: left side is a short descriptive paragraph in telegraf 20-24px, Ink Charcoal, with the phrase 'design-driven' rendered in ogg serif to mark it as the agency's self-identifier. No background panel — text floats on Vellum with generous surrounding space.

### Asymmetric Image Grid Cell
**Role:** Individual positioned image within the editorial layout

Each cell contains a single image at its native aspect ratio, positioned with calculated left/right offset within a two-column grid. Images overlap the column boundary on purpose to break the grid's rigidity. No captions inside the cell — the tile below carries the text.

## Do's and Don'ts

### Do
- Use only three colors: #292a2c for text, #f2f2f2 for canvas, #000000 for maximum-contrast links and dark surfaces
- Apply ogg for all display text and project titles at 55px with letter-spacing -1.98px; use telegraf at 18-20px for body with 0.38-0.5px tracking
- Render all images as sharp-edged rectangles with 0px border-radius and no drop shadow
- Separate project titles from subtitles with an em-dash (—) in ogg, with the subtitle in italic ogg
- Use ' / ' delimiters between category metadata tags in telegraf 15px
- Position the vertical running text strip absolutely along the right viewport edge on pages that present project work
- Let the canvas breathe: 120px between major sections, no card containers, no elevated panels

### Don't
- Do not introduce any chromatic color into the UI — saturated color belongs exclusively to client artwork
- Do not apply border-radius to any element, including buttons, cards, tags, or images
- Do not add box-shadow, drop-shadow, or any CSS elevation — the design is intentionally flat
- Do not use centered layouts or constrained max-width wrappers — let content flow to viewport edges
- Do not use bold (600+) or semibold weights — both fonts operate at 400 only
- Do not create a distinct filled CTA button — links are text with 1px black borders, nothing more prominent
- Do not alternate background colors between sections — the entire page shares the single Vellum canvas

## Elevation

The design system has zero elevation. No shadows, no border-radius, no stacked z-axis. Every element lives on the same flat plane on the Vellum canvas — the only depth comes from the natural overlap of large positioned images, which creates perceived layering without any CSS shadow. This is a deliberate anti-SaaS choice: the page behaves like a printed gallery catalog where flatness signals editorial authority.

## Surfaces

- **Vellum Canvas** (`#f2f2f2`) — The page itself — a warm off-white that reads as paper stock rather than digital background. Everything floats on this surface with no card containers or elevated panels.
- **Ink Surface** (`#000000`) — Rare dark inversions for full-bleed campaign sections or video containers where the artwork demands a black surround.

## Imagery

Imagery is the entire color system. The site hosts large, high-resolution CGI renders and product photography (crystal formations, metallic objects, liquid simulations, branded consumer products) that carry saturated violets, pinks, greens, and golds — colors that never appear elsewhere in the UI. Images are always sharp-edged rectangles (no radius, no masks, no duotone treatment), presented at native resolution without cropping overlays. The visual rule: the more vivid the artwork, the more monochrome and silent the surrounding UI must be. No illustrations, no icon system beyond simple glyphs, no abstract graphics — the case study renders ARE the visual identity.

## Layout

Two-column asymmetric editorial grid with full-bleed outer margins and no centered constraint. The left column holds the wordmark and large project tiles; the right column holds additional project tiles, the agency statement, and the vertical running text pinned to the far-right edge. Images within the grid are intentionally offset vertically — a tile on the left may start at 200px from top while its right-column neighbor starts at 80px — creating a staggered z-pattern rather than a rigid table. The nav bar sits at the very top with no sticky behavior and no background fill. Content flows top-to-bottom as a single continuous scroll with no section dividers, no alternating background bands, and no contained max-width wrapper — the page breathes outward to the viewport edges. The overall rhythm is slow and gallery-like: one case study per viewport-height, large image, then title block, then breathing space.

## Similar Brands

- **Buck (buck.co)** — Same editorial agency-portfolio approach with monochrome UI letting colorful 3D motion work dominate, and generous whitespace as the structural system
- **Manual (manual.tv)** — Identical gallery-grid layout with asymmetric image positioning, zero border-radius, and custom serif/sans type pairing on a warm off-white canvas
- **Gunner (gunner.co)** — Shares the flat no-elevation, no-radius aesthetic with a single off-white canvas and large positioned product imagery as the only color source
- **Locomotive (locomotive.ca)** — Same print-catalog feel: large hero imagery, minimal type hierarchy, editorial asymmetric grid, and extreme restraint in UI chrome
