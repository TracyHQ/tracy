# Earlydog — Style Reference
> Bauhaus poster pinned to a cloud architect's corkboard — cream paper, primary-color shapes, oversized geometric type.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Earlydog operates as a Bauhaus design lab transplanted into DevOps — warm cream paper backgrounds, near-black typography, one vivid blue accent, and geometric illustrations built from primary-color primitives (circles, squares, checkerboards, starbursts, triangles). The display face (degular-display) sets oversized 52–116px headlines with positive letter-spacing, an unusual choice that gives the type geometric breathing room rather than the tight editorial tension most display fonts chase. Body copy stays at 18px in a humanist sans (usual), keeping reading temperature warm against the eggshell canvas. Components are intentionally sparse: pill-shaped outlined buttons, ghost links with play-triangle markers, and generous 96px section gaps that let the geometric artwork breathe. The functional palette is restricted to three colors — cream, ink, blue — while illustrations carry the full primary-color spectrum as decorative punctuation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#fff9f0` | Page canvas, card surfaces, button fills — warm off-white gives the entire interface a paper-like, print-graphic feel that warms the cool blue accent |
| Midnight Ink | `#000609` | Primary text, heading strokes, hairline borders, outlined button frames, logo mark — near-black with a barely-perceptible blue tint keeps it from feeling dead |
| Signal Blue | `#0a65db` | Accent headings, icon strokes, active nav emphasis, illustration accent shapes — the single chromatic functional color, used sparingly to mark emphasis and brand voice |
| Ember Red | `#ee4623` | Illustration accent — primary-color punctuation in geometric compositions, starbursts, circular forms, and triangle fills |
| Saffron Yellow | `#ffd23f` | Illustration accent — warm primary used in geometric blocks, semicircles, and composition fills alongside Ember Red and Signal Blue |
| Blush Pink | `#f4c6c6` | Illustration accent — softens the primary-color palette in geometric compositions, used in rectangles and overlapping shapes |

## Typography

### degular-display — Display headlines for all section headings and the hero title. The single weight 700 and positive letter-spacing (0.009–0.019em) create a wide-set, geometric presence — letterspacing INCREASES with size, the opposite of conventional display type. This gives 116px headlines airy breathing room rather than dense visual mass, matching the Bauhaus illustration language of separated geometric forms.
- **Substitute:** Archivo Black, Space Grotesk, or any wide geometric grotesque
- **Weights:** 700
- **Sizes:** 52px, 80px, 116px
- **Line height:** 1.03–1.23
- **Letter spacing:** 0.009em at 52px, 0.013em at 80px, 0.019em at 116px

### usual — Body copy, navigation, buttons, links, footer, card descriptions. The 1.78–1.82 line-height is notably generous for sans-serif body text — typical SaaS body sits at 1.5–1.6, but Earlydog's open leading reinforces the spacious layout. Weight 700 is used sparingly for inline emphasis.
- **Substitute:** Inter, IBM Plex Sans, or DM Sans
- **Weights:** 400, 700
- **Sizes:** 16px, 18px, 22px
- **Line height:** 1.78–1.82
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.78 | 0px |
| body | — | — | 18px | 1.82 | 0px |
| subheading | — | — | 22px | 1.82 | 0px |
| heading-sm | — | — | 52px | 1.23 | 0.47px |
| heading | — | — | 80px | 1.1 | 1.04px |
| display | — | — | 116px | 1.03 | 2.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 16-32px

### Border Radius

- **cards:** 0px
- **buttons:** 9999px
- **illustrations:** 0px

## Components

### Outlined Pill Button
**Role:** Primary interactive element — all CTAs and section links use this variant

Fully rounded pill (border-radius: 9999px), 1px solid Midnight Ink (#000609) border, Cream Paper (#fff9f0) fill, text in usual 16px weight 700 Midnight Ink. Horizontal padding 30px, vertical padding 14–20px. No fill, no shadow — the border IS the button. Examples: 'Why you need us', 'What we do', 'Talk to us'.

### Ghost Link with Triangle
**Role:** Minimal navigation and inline text links

Plain Midnight Ink text in usual 16px weight 700, followed by a small right-pointing triangle marker (▸) in Midnight Ink. No underline, no background. Used for header CTA ('Talk to us ▶') and inline section links.

### Hamburger Menu Icon
**Role:** Top-left navigation trigger

Two horizontal black bars (Midnight Ink) stacked with 2px gap. Sits at 44px from top, paired with the vertical EARLYDOG wordmark below it. Clean, minimal — the menu icon is decorative architecture, not a brand mark.

### Vertical Wordmark
**Role:** Brand identity anchor in the left rail

EARLYDOG rotated 90° counter-clockwise, set in usual 16px weight 700 Midnight Ink, letter-spacing normal. Sits in the left margin as a fixed brand signature, paired with a small geometric 'e' glyph above the rotated text.

### Hero Display Heading
**Role:** First-fold headline anchoring the page

degular-display 80px weight 700, line-height 1.10, letter-spacing +1.04px. Two-tone treatment: 'Your Cloud' in Midnight Ink, 'Ops Team' in Signal Blue. The blue second-line is the only chromatic text on the page — a deliberate accent that mirrors the blue shapes in the adjacent illustration.

### Body Paragraph Block
**Role:** Descriptive copy beneath section headings

usual 18px weight 400 Midnight Ink, line-height 1.82, max-width ~480px. Generous leading and short line length create a calm, editorial reading rhythm against the cream background.

### Section Heading (Sub-display)
**Role:** Section-level display text for content blocks like 'Your own Ops Team' and 'Managed Kubernetes'

degular-display 52px weight 700, line-height 1.23, letter-spacing +0.47px, Midnight Ink. Smaller than the hero display but follows the same wide-set geometric character.

### Geometric Illustration Block
**Role:** Brand-defining visual element — appears in hero and alternating sections

Square or near-square composition (~520px) built from Bauhaus primitives: solid color rectangles, circles, semicircles, triangles, checkerboard grids (8×8 black/cream), and thin-line starburst patterns radiating from a point. Color palette restricted to Ember Red, Saffron Yellow, Signal Blue, Blush Pink, Midnight Ink, and Cream Paper. All shapes have sharp 0px corners — no rounded forms. Often contains a 3×3 or 4×4 grid of sub-shapes. Functions as the page's visual identity, not decoration.

### Two-Column Feature Section
**Role:** Content block layout — alternates illustration-left/text-right and text-left/illustration-right

Two equal columns separated by 104px horizontal margin within a max-width container. One column holds a geometric illustration block, the other holds a section heading + body paragraph + pill button. Vertical spacing between sections: 96px. No card backgrounds, no dividers — sections flow directly on the cream canvas.

### Starburst Line Pattern
**Role:** Decorative element within illustrations

Thin (1px) Midnight Ink lines radiating from a single point at 15° intervals, filling a circular area. Always overlaid on a cream or blue square within the composition. Functions as a visual texture/energy marker, not a stand-alone element.

### Checkerboard Grid
**Role:** Decorative geometric element within illustrations

8×8 alternating Midnight Ink and Cream Paper squares. Appears as a solid block within larger compositions. No border, sharp 0px edges — the grid IS the shape.

## Do's and Don'ts

### Do
- Use degular-display 700 for all headings — never substitute a different weight or face for display text
- Set display headings at 52, 80, or 116px with the corresponding positive letter-spacing (0.009–0.019em) — letter-spacing scales WITH size, not against it
- Use border-radius: 9999px for all buttons and tags — pill shape is the only radius in the system
- Build illustrations from Bauhaus primitives: circles, squares, triangles, checkerboards, starbursts, semicircles — all with sharp 0px corners
- Restrict the UI palette to three colors (#fff9f0, #000609, #0a65db) — let illustrations carry the primary-color spectrum
- Maintain 96px vertical gaps between major sections to preserve the spacious, poster-like rhythm
- Pair body text at 18px/1.82 with a max-width of ~480px for editorial readability

### Don't
- Don't use rounded corners on illustrations, cards, or decorative shapes — everything geometric is sharp 0px
- Don't use filled colored buttons — all interactive elements are outlined pills with 1px Midnight Ink border
- Don't apply negative letter-spacing to display headings — the positive tracking IS the brand voice
- Don't introduce more than one chromatic functional color — Signal Blue is the sole accent; other primary colors live only in illustrations
- Don't use body text below 16px or with line-height tighter than 1.78 — the open leading is part of the warm, spacious feel
- Don't add drop shadows, gradients, or glows — the system is flat, print-graphic, and depthless
- Don't use photographic imagery or realistic illustrations — the visual language is strictly geometric and abstract

## Elevation

Earlydog uses zero elevation. The design is deliberately flat — surfaces are defined by color contrast (cream canvas, midnight ink shapes) and geometric composition, not shadows. Depth is implied through overlapping geometric forms within illustrations, not through z-axis shadow stacks. This flatness reinforces the print-poster, Bauhaus-influenced aesthetic.

## Surfaces

- **Cream Canvas** (`#fff9f0`) — Page background across all sections
- **Signal Blue Panel** (`#0a65db`) — Accent surface for illustration blocks containing the blue base — appears inside artwork, not as page chrome

## Imagery

Zero photography. The entire visual system is built from flat geometric illustrations: Bauhaus-inspired compositions of circles, squares, triangles, checkerboards, starbursts, and semicircles rendered in a primary-color palette (Ember Red, Saffron Yellow, Signal Blue, Blush Pink, Midnight Ink, Cream Paper). Illustrations are square or near-square blocks (~500–550px), placed as compositional counterparts to text columns. All shapes have sharp corners. The illustrations function as brand identity markers — they are not decorative supporting visuals but the primary visual voice of the site. No icons beyond simple geometric marks; no product screenshots; no photography of any kind.

## Layout

Two-column alternating layout on a full-bleed cream canvas. The page is not contained in a max-width box — instead, the left rail holds a fixed vertical wordmark and hamburger menu, while content flows in a ~1200px centered column. Hero is text-left/illustration-right with a two-tone display heading ('Your Cloud' in ink, 'Ops Team' in blue). Subsequent sections alternate: illustration-left/text-right, then text-left/illustration-right. No card grids, no pricing tables, no blog feeds. Each section is a single text+illustration pairing with 96px vertical breathing room between them. Navigation is minimal: hamburger menu (left rail) and a single ghost link CTA in the top-right. The layout reads as a curated series of editorial spreads, not a typical SaaS page.

## Similar Brands

- **Pentagram** — Same Bauhaus-influenced geometric illustration language, primary-color compositions, and oversized display type paired with generous white space
- **Figma Config** — Same flat geometric illustration approach with primary colors, bold display headings, and editorial-style section layouts on warm canvas
- **Linear** — Same confident display type at large sizes, generous section spacing, and minimal UI chrome that lets a single accent color carry brand identity
- **Stripe Sessions** — Same editorial-spread layout pattern with alternating text/visual columns, warm off-white canvas, and oversized geometric display headings
