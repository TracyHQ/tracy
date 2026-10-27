# Grafik — Style Reference
> Editorial gallery on warm paper. A design annual laid out as a full-bleed screen — typographic grid lines, monochrome photography, and nothing between the work and the page.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Grafik is a monochromatic editorial portfolio rendered as a design annual: a warm off-white canvas (#f0eeeb) holds a rigid 3-column grid of oversized black-and-white photography, separated by hairline 1px lines rather than gutters or shadows. Typography is reduced to a single weight (Grotesk 400) at three sizes, with negative tracking that pulls headlines tight and gives body text a measured, printed-page feel. Color is deliberately absent from the interface — the vivid green block on the Tom Gould card and the sepia Beings panel are content within the portfolio, not UI tokens. The design's confidence comes from restraint: no rounded corners, no elevation, no gradients, no secondary typeface, no bold weight. The grid lines and the type are the entire visual system.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone | `#f0eeeb` | Page background and primary canvas — a warm off-white that reads as paper rather than screen, the defining surface of the entire system |
| Ink | `#000000` | Primary text, body copy, navigation, project metadata, 1px grid lines, image borders, and dark image treatments — the only non-canvas color |
| Paper | `#ffffff` | Card surfaces, image backgrounds, and reverse-text blocks — white inserts on the warm canvas to isolate portfolio pieces |

## Typography

### Grotesk — Sole typeface across all UI — navigation, project metadata, and headlines. Used exclusively at weight 400 (no bold, no light), which is anti-convention for an agency portfolio; the regular weight whispers where competitors shout. Negative tracking tightens headlines at -0.02em while body sits at -0.005em, giving every line a printed-page density. The dlig feature enables discretionary ligatures for editorial flourish.
- **Substitute:** Söhne or Neue Haas Grotesk (paid); Inter at weight 400 with negative tracking is the closest free alternative
- **Weights:** 400
- **Sizes:** 20px, 38px, 40px
- **Line height:** 1.00, 1.11, 1.20
- **Letter spacing:** -0.02em at 38px, -0.01em at 40px, -0.005em at 20px
- **OpenType features:** `"dlig"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 20px | 1 | -0.1px |
| heading | — | — | 38px | 1.11 | -0.76px |
| heading-lg | — | — | 40px | 1.2 | -0.4px |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **all:** 0px — no rounded corners anywhere in the system
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Hairline Grid Divider
**Role:** Structural separator between portfolio columns and rows

1px solid #000000 lines that form the portfolio grid. No gaps, no gutters — images and metadata sit flush against these hairlines. The lines are the skeleton of every page section.

### Navigation Bar
**Role:** Site-wide top navigation

Full-bleed horizontal bar on #f0eeeb canvas. Left: 'Grafik, About, Contact.' in Grotesk 400 at 20px with #000000. Right: a greeting ('Hi') in the same style. No background fill, no border, no logo mark — text is the entire nav system. Fixed positioning not assumed.

### Portfolio Grid Cell
**Role:** Single project tile within the 3-column portfolio grid

Full-bleed image container with 1px solid #000000 border. Images sit on #ffffff or #000000 background depending on project. No padding, no radius, no shadow. Images extend edge-to-edge within their grid cell.

### Project Metadata Block
**Role:** Caption beneath each portfolio item

Three lines of Grotesk 400 at 20px, #000000, line-height 1.0. Line 1: project number ('1', '2'). Line 2: project name and year. Line 3: service categories. Aligned left, sits in the warm canvas zone below the image grid with ~80px gap.

### Full-Bleed Image
**Role:** Oversized project image spanning full viewport width

Some portfolio images break the 3-column grid and span full-bleed at 100vw. Maintains 1px #000000 border, 0px radius, no padding. The image is the entire section — no overlaid text or framing.

### Tablet/Device Frame
**Role:** Portfolio project shown in context (tablet or browser frame)

A project artifact (website screenshot, app screen) displayed inside a device frame with 1px #000000 border and #000000 background fill. The frame is a structural device, not decorative — it shows the work in its native medium.

### Footer
**Role:** Site footer with contact and legal

Minimal text block in Grotesk 400 at 20px, #000000 on #f0eeeb. Single line of text with 'Contact' link. Matches nav treatment exactly — text-only, no rules, no columns.

## Do's and Don'ts

### Do
- Use only Grotesk at weight 400 — never introduce bold, semibold, or light variants. The single-weight discipline is the signature.
- Set backgrounds to #f0eeeb for the page canvas and #ffffff for card/image inserts. The warm bone is non-negotiable; pure white as canvas breaks the paper metaphor.
- Separate all portfolio elements with 1px solid #000000 hairlines. Use borders to create the grid, never padding gaps or box-shadows.
- Set border-radius to 0px on every element. No rounded corners on images, cards, buttons, or containers — the design is architecturally sharp.
- Type at three sizes only: 20px for body and metadata, 38px and 40px for headings. The sparse scale forces hierarchy through content, not through type variety.
- Apply negative letter-spacing: -0.02em at 38px, -0.01em at 40px, -0.005em at 20px. This tracking is what makes Grotesk feel like editorial print rather than screen type.
- Keep the interface fully monochromatic. Any color should live inside portfolio content (photography, project artifacts), never in the UI chrome.

### Don't
- Do not introduce a second typeface. Grotesk carries the entire system — adding a serif or display face fragments the editorial cohesion.
- Do not add box-shadows or any form of elevation. The design uses surface contrast and hairline borders, not depth.
- Do not use rounded corners on any element. Every edge is sharp — cards, images, buttons, tags.
- Do not use bright or saturated colors in the UI. The green and brown tones in screenshots are project content, not system tokens.
- Do not set the page background to pure #ffffff. The warm #f0eeeb canvas is the paper-like foundation — white-as-canvas looks clinical and breaks the design annual metaphor.
- Do not add decorative gradients, patterns, or background textures. The design is flat, monochromatic, and print-faithful.
- Do not use bold or semibold weights. The entire system runs on Grotesk 400 — adding weight breaks the measured, restrained voice.

## Elevation

Shadows are entirely absent. The design achieves hierarchy through surface contrast (warm bone vs white vs black) and 1px hairline grid lines, not through elevation. Depth is implied by content layering, not by box-shadow.

## Surfaces

- **Canvas** (`#f0eeeb`) — Full-bleed page background — the warm off-white that defines the paper-like quality
- **Card** (`#ffffff`) — Reverse surfaces and image cards sitting on the canvas
- **Inverted** (`#000000`) — Dark image treatments and high-contrast blocks within the grid

## Imagery

Photography dominates: large, full-bleed, black-and-white portrait and editorial photography fills the 3-column grid. Treatment is high-contrast, gallery-style — tight crops, subjects centered, no lifestyle staging. Color appears only within portfolio content (a neon green business card on the Tom Gould project, a sepia-brown panel on the Beings project) but these are artifacts within the work, not system colors. No icons, no illustrations, no decorative graphics. The portfolio imagery IS the visual language.

## Similar Brands

- **Pentagram** — Editorial portfolio aesthetic with a single weight per page, hairline grid structure, and monochromatic restraint — same gallery-on-paper approach to showcasing work
- **Manual (manual.to)** — Minimal text-only navigation, full-bleed project imagery, and a typographic system built on a single sans-serif at regular weight with negative tracking
- **DIA Studio** — Swiss-design sensibility with sharp 0px corners, monochromatic interface, and oversized black-and-white photography in a rigid grid
- **Studio Dumbar** — Editorial typography-first portfolio with hairline dividers, no decorative shadows, and a canvas that reads as paper rather than screen
- **Ramotion (agency site)** — Full-bleed project showcases with device-framed screenshots, monochromatic chrome, and generous vertical breathing room between sections
