# Brisbane Web Developer — Style Reference
> gallery wall in winter light. An achromatic, spacious portfolio on a warm bone-white canvas, with each project tile framed by soft brown-toned shadows and labeled in a whisper-thin display face.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Carl Beaverson's portfolio operates on radical restraint: a warm off-white canvas, exclusively neutral tones, and a single accent typeface (Suisse Works) reserved for the smallest typographic moments. The entire system is achromatic — no brand color, no chromatic accent, no semantic hues. Hierarchy is built through scale jumps, tracking, and generous negative space rather than color or weight. Components float on warm-tinted brown shadows that subtly warm an otherwise cold minimalist grid. The reading order is content-first: three-up project tiles, tiny attribution text, and large section gutters that let each piece breathe independently.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone Canvas | `#f4f3f1` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Ink | `#333333` | Primary headings, button text, input text, high-contrast labels |
| Graphite | `#4d4d4d` | Body text, paragraph copy, longer-form descriptions |
| Slate | `#666666` | Muted secondary text, tertiary metadata |
| Ash | `#aaaaaa` | Subtle borders, dividers, light secondary text, project attribution labels |
| Mist | `#dddddd` | Card surface lift from canvas, subtle background variation |

## Typography

### system-ui, -apple-system, sans-serif — Body copy, navigation, buttons, inputs, hero description, project labels — the workhorse face. 14px for inline meta, 15px for inputs/buttons, 20px for hero paragraph and project titles.
- **Substitute:** Inter, Helvetica Neue, Arial
- **Weights:** 400
- **Sizes:** 14px, 15px, 20px
- **Line height:** 1.2–1.5

### Suisse Works Trial — Reserved exclusively for the '60 Selected Projects' section label. A serif display face set at 13px with tightened tracking — an anti-type-scale choice that makes a heading read as an editorial caption. This font carries the only typographic personality in the system.
- **Substitute:** GT Sectra, Tiempos Text, Source Serif Pro
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.5
- **Letter spacing:** -0.038em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | -0.49px |
| body | — | — | 15px | 1.4 | — |
| subheading | — | — | 20px | 1.2 | — |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 122px
- **Card padding:** 0px
- **Element gap:** 20px

### Border Radius

- **cards:** 5px
- **tiles:** 5px
- **inputs:** 5px
- **buttons:** 5px

## Components

### Project Tile Card
**Role:** Primary content unit — displays one portfolio project

Container with no visible border, 5px radius. Background matches canvas. Contains centered project artwork (no padding around image — image fills tile). Warm brown shadow stack below artwork. Project title in 14px system sans, #333333, left-aligned below tile. 'Design by [studio]' in 14px system sans, #aaaaaa, right-aligned on same line.

### Project Grid
**Role:** Three-column responsive grid of project tiles

3 columns, 20px row gap, ~65px column gap. Tiles are roughly equal width. Grid breathes with 122px top margin from the section header.

### Section Header Label
**Role:** Editorial section marker

13px Suisse Works Trial, #aaaaaa, letter-spacing -0.038em. Left-aligned. Acts as a typographic signature moment — the only place the serif face appears.

### Hero Description Block
**Role:** Centered introductory paragraph at top of page

20px system sans, #4d4d4d, centered, max-width constrained to roughly 600px. Line-height 1.2. No eyebrow, no headline — the paragraph is the hero.

### Minimal Top Navigation
**Role:** Persistent header

Logo (circular 'C' monogram) left, nav links right. No background fill — sits directly on canvas. Links in 14px system sans, #aaaaaa, normal tracking.

### Nav Link
**Role:** Text-only navigation item

14px system sans, #aaaaaa. No underline, no hover background. No visible active state — presence is implied by position.

### Ghost Button
**Role:** Inline action trigger (implied by button color evidence)

5px radius, #f4f3f1 background or transparent, 1px border in #333333 or #4d4d4d. 14–15px system sans text in #333333. No fill, no shadow — pure outline.

### Image Container
**Role:** Artwork presentation within a project tile

No padding, image fills the tile edge-to-edge. The warm brown shadow lifts it off the canvas. 5px radius corners on the tile and on the image.

## Do's and Don'ts

### Do
- Use #f4f3f1 as the only background color for page, cards, and inputs — never introduce a pure white or pure gray
- Use 5px border-radius uniformly for buttons, inputs, cards, and tiles — do not mix in larger radii
- Use the warm brown shadow stack (rgba(90,50,40,0.15) + rgba(80,40,30,0.1)) only beneath artwork and imagery — never on text blocks or nav
- Use 20px for element gaps and 122px for section gaps to maintain the spacious gallery rhythm
- Use Suisse Works (or a serif substitute) at 13px with -0.038em tracking for editorial section labels — never larger than 13px
- Use #aaaaaa for all borders, dividers, and attribution text — let hierarchy come from spacing, not weight
- Keep the palette to the six neutral tokens — no brand color, no semantic hue, no accent

### Don't
- Do not introduce any chromatic color — no blues, greens, reds, or purples anywhere in the system
- Do not use cool gray shadows — the shadow tone must stay warm (brown undertone) or be omitted entirely
- Do not set Suisse Works above 13px — it is a caption face, not a heading face
- Do not use card padding around project artwork — the image must fill the tile to the edges
- Do not use borders to separate cards from the canvas — rely on shadow and the #f4f3f1 surface tone instead
- Do not use bold weights — the system is 400 across the board, hierarchy comes from size and color only
- Do not use uppercase, letter-spacing on body text, or decorative type treatments — restraint is the identity

## Elevation

- **Project tile artwork:** `0 5px 15px rgba(90, 50, 40, 0.15), 0 4px 8px rgba(80, 40, 30, 0.1)`

## Surfaces

- **Canvas** (`#f4f3f1`) — Base page background — warm bone-white
- **Card Surface** (`#dddddd`) — Slightly lifted surface for project tile containers
- **Elevated Tile** (`#f4f3f1`) — Project artwork sits on canvas-tinted surface, separated by warm brown shadow

## Imagery

Photography and product screenshots are the visual content. Project tiles display high-quality web/photography artwork (sunsets, editorial portraits, aerial drone shots, brand identity spreads) presented as flat rectangular images with 5px corners. No illustrations, no abstract graphics, no icons in the UI. The logo monogram is the only graphic mark. Artwork is presented as-is — no duotones, no overlays, no color grading treatment. Images occupy roughly 40% of total visual space, balanced by generous negative space and large gutters.

## Layout

Full-bleed layout with no max-width container — content stretches to viewport edges. Top bar is minimal: circular monogram left, two text links right. Hero is a centered single-paragraph block, vertically positioned in the upper third. Below the hero is a large section gap (122px), then a tiny section label left-aligned, followed by a 3-column project grid with 20px row gap and ~65px column gap. Project tiles are roughly 33% viewport width each, with artwork filling the tile and metadata in a single line below (title left, designer credit right). The grid is the dominant page pattern — repetitive, rhythmic, gallery-like. Navigation does not persist as a heavy bar; it sits featherlight at the top with no background fill.

## Similar Brands

- **Studio Snny** — Same achromatic-only portfolio approach with large white space, tiny gray labels, and project grid as the primary layout
- **Rauno Freiberg** — Extreme minimal monochrome portfolio on warm off-white canvas with hairline navigation and generous gutters
- **Tobias van Schneider** — Austere light-mode personal site with bone-white background, no brand color, and grid-based project presentation
- **Manual Studio** — Editorial agency portfolio using generous spacing, tiny serif labels, and project tiles with subtle warm shadows
