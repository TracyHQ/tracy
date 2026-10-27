# mono — Style Reference
> White-walled gallery grid. A page organized like a museum contact sheet — stark white cells, thin black rules, and type that floats without shadow or ornament.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mono X7 operates as a Brutalist editorial canvas: pure white surface, dark ink type, hard 2px rules dividing the page into modular cells. NH and S-Condensed do all the talking — weight 100/300 at large sizes with negative tracking creates breathy headlines that sit beside S-Condensed uppercase labels tracking wide at +0.1em. No shadows, no gradients, no color accent; the system is deliberately monastic, treating typography and grid as the entire visual language. Every component is rectilinear, zero radius, and bound by visible borders rather than elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#292929` | Primary text, heading color, link color, border strokes, surface blocks — the structural dark that replaces shadow everywhere in the system |
| Paper | `#ffffff` | Page canvas, card surface, input fill, inverse text — the dominant white ground |
| Carbon | `#000000` | SVG illustration fills and input text — appears in decorative line-art and form value color |

## Typography

### NH — Primary type family for body copy, hero text, headings, and interactive labels
- **Substitute:** Inter, Helvetica Neue, Arial
- **Weights:** 100, 300, 400
- **Sizes:** 16px, 18px, 25px, 32px, 40px, 43px
- **Line height:** 1.20, 1.25, 1.27, 1.34, 1.50
- **Letter spacing:** -0.0200em

### S-Condensed — Utility face for uppercase labels, nav, tags, captions, and condensed body
- **Substitute:** Roboto Condensed, Barlow Condensed, Univers Condensed
- **Weights:** 300, 400, 500
- **Sizes:** 12px, 14px, 40px
- **Line height:** 0.90, 1.18, 1.20, 1.34
- **Letter spacing:** 0.1000em, 0.2000em

### EV — Special display accent
- **Substitute:** Times New Roman, serif
- **Weights:** 100
- **Sizes:** 28px
- **Line height:** 0.90
- **Letter spacing:** -0.0500em

### S-Works — Reserved display heading
- **Substitute:** Söhne, GT America
- **Weights:** 350
- **Sizes:** 40px
- **Line height:** 1.34
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.34 | 0.12px |
| body-sm | — | — | 14px | 0.9 | 0.14px |
| body | — | — | 16px | 1.34 | -0.32px |
| body-lg | — | — | 18px | 1.5 | -0.36px |
| subheading | — | — | 25px | 1.27 | -0.5px |
| heading-sm | — | — | 32px | 1.25 | -0.64px |
| heading | — | — | 40px | 1.34 | -0.8px |
| display | — | — | 43px | 1.34 | -0.86px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Bordered Cell
**Role:** Fundamental layout unit — replaces cards/sections with hard-edged grid cells

White (#ffffff) background, 2px solid #292929 border on all sides, 0px radius, variable internal padding (commonly 43px top/bottom and 45px left/right for heading cells, 20px for content cells). This is the dominant container — every section, card, and panel uses this pattern instead of shadows or fill colors.

### Outline Button
**Role:** Primary interactive — text-style outlined action

Transparent background, 1–2px #292929 border, 0px radius, padding 0px 20px vertically centered (text-baseline alignment), text in #292929 at 12–14px S-Condensed weight 500 uppercase with +0.1em tracking. Buttons sit on grid lines and inherit the rectilinear grid rather than floating above it.

### Text Link
**Role:** In-flow navigation and reference link

No border, no background, #292929 text at 12px S-Condensed weight 300 uppercase, +0.2em tracking, 20px horizontal padding. Examples: EN/JP language toggle, ABOUT tag, Pre-order label.

### Inverse Text Button
**Role:** Highlighted action — white text on dark surface

#292929 or #000000 background, #ffffff text, 0px radius, no border, 12px S-Condensed uppercase. Used for active/selected nav states and inverse actions on dark cells (e.g., the 'MONO X7' label on the product image cell).

### Underline Input
**Role:** Single-line form field — brutalist minimal

White (#ffffff) background, 1px #000000 bottom border only (no full border), 0px radius, padding 8px 0, #000000 text. The hairline-bottom-only treatment replaces boxed inputs — text sits directly on the page grid.

### Display Headline
**Role:** Hero and section-defining copy

NH weight 300 at 43px, lineHeight 1.34, letter-spacing -0.02em (-0.86px), #292929. Large size with whisper-weight and tight tracking is the system's signature — anti-bolding, editorial register.

### Uppercase Label
**Role:** Section/metadata tag (e.g., ABOUT, services)

S-Condensed weight 400–500 at 12px, lineHeight 1.34, uppercase, letter-spacing +0.1em (+0.12px), #292929 on white or #ffffff on #292929 inverse. Functions like museum plaque text — identifies what each cell contains.

### Editorial Caption
**Role:** Rotated/aspirational taglines wrapped around imagery

S-Condensed or NH at 12–16px, #292929, often rotated or wrapped in a circle as decorative SVG text. The 'Digital canvas that elevates a space with the ease of...' treatment is a signature pattern.

### Vertical Sidebar Label
**Role:** Page-edge rotated text — brand/category markers

S-Condensed weight 300 at 12px, rotated 90° on the right edge of the page, #292929, uppercase, tracking +0.2em. Marks vertical navigation categories (Illustration, Creative Coding, Web Experiments, etc.).

### Product Hero Image
**Role:** Full-bleed product photograph as centerpiece

Renders without frame/border inside its grid cell, 0px radius, sits on pure white background, no shadow or mask — the product is shown raw within the bordered cell, not lifted off it.

### Footer Bar
**Role:** Copyright and utility nav row

Single horizontal row across page width, 2px top border #292929, 12px S-Condensed uppercase content with +0.2em tracking, 20px vertical padding, white background. Examples: '© FRM Inc. 2026  SHOP  CONTACT  PRESS  CORPORATE'.

### Dark Inverse Cell
**Role:** Occasional dark surface for contrast

#292929 fill, #ffffff text and borders, 0px radius, 2px #292929 outer border (visually seamless to adjacent cells). Used sparingly for inverse panels and product overlay labels.

## Do's and Don'ts

### Do
- Use 2px solid #292929 borders as the primary separator and container system instead of shadows or background fills
- Set all border-radius to 0px — no rounded corners anywhere
- Use NH weight 100–300 at 32–43px for headlines with -0.02em letter-spacing
- Set S-Condensed labels at 12–14px uppercase with +0.1em to +0.2em letter-spacing for all nav, tags, and metadata
- Let the grid go edge-to-edge (no max-width container) — sections butt directly against each other via shared borders
- Use 8px as the base spacing unit, stepping in multiples (8, 12, 20, 43, 45)
- Pair white (#ffffff) surfaces with #292929 ink for all text and borders — never introduce accent color

### Don't
- Don't add box-shadow, drop-shadow, or any elevation — the system is intentionally flat
- Don't round any corner — cards, buttons, inputs, images all stay 0px
- Don't use bold weights (600+) — the system's voice comes from weight 100/300/400/500
- Don't introduce a brand accent color — the palette is strictly black/white/ink
- Don't use gradients — fills are always flat solids
- Don't use lowercase body text in S-Condensed — that face is always uppercase
- Don't center-align body paragraphs — copy flows left-aligned in editorial register

## Elevation

The system intentionally uses no shadows or elevation. Visual hierarchy is created entirely through 2px hard borders, stark white/dark inversions, and typographic scale. This is a deliberate Brutalist/editorial choice — surfaces are flat planes, not lifted cards.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, dominant cell fill, input ground
- **Ink Block** (`#292929`) — Inverse dark surface used sparingly for contrast panels and product overlay labels

## Imagery

Product photography dominates: a single hardware device (the Mono X7 display) rendered straight-on against white, treated as an object in a museum rather than a lifestyle product. Black-and-white decorative SVG line-art appears in editorial rotations and rotating circular typographic ornaments. The page is text-and-product dominant, not image-heavy — imagery occupies roughly 30% of total visual real estate and is always contained inside bordered cells with 0px radius, no masks or vignettes.

## Similar Brands

- **Bloomberg Businessweek** — Same editorial-grid approach with hard-bordered modular cells, uppercase condensed labels for metadata, and flat surfaces without shadows
- **Kinfolk Magazine** — Same whisper-weight serif/sans typography at large sizes with tight tracking, pure white backgrounds, and zero-radius frames around imagery
- **Teenage Engineering** — Same brutalist flat aesthetic with technical product photography, uppercase tracked labels, and 2px black rules as the dominant visual element
- **Hito Steyerl / Rhizome art sites** — Same gallery-as-grid layout with rotated vertical sidebar text, editorial weight-100 type, and raw product/object imagery without masks
