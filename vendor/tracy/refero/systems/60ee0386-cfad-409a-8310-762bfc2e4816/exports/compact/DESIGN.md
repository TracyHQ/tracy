# Cosmos Network — Style Reference
> Deep space command center — a near-black financial observatory where white type and concentric diagrams float in measured silence.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Cosmos Network presents an institutional dark-mode financial infrastructure aesthetic: a near-black canvas where white typography does all the visual work, supported by pill-shaped ghost controls and generous whitespace. The single custom typeface 'The Future' carries a slight positive tracking that gives headlines a measured, ceremonial quality — authority through restraint rather than volume. Layout follows a disciplined two-column rhythm: large declarative headlines paired with restrained secondary imagery (like the concentric-circle globe diagram), followed by horizontal case-study card carousels. Color is almost entirely suppressed — any chromatic presence is deeply desaturated, creating a quiet, high-trust environment where structure and whitespace carry the weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, section backgrounds, maximum-contrast surface |
| Carbon | `#181818` | Navigation bar, elevated surface base, footer surface |
| Graphite | `#1e1f20` | Card surfaces, elevated panels, contained content blocks |
| Iron | `#333333` | Hairline borders, dividers, structural separators |
| Slate | `#807f7f` | Muted secondary text, inactive nav items, subtle metadata |
| Fog | `#999999` | Disabled labels, low-emphasis helper text, tertiary metadata |
| Ash | `#666666` | Deep-recessed borders, very-low-emphasis outlines |
| Chalk | `#f1f4f4` | Alternate light surface, inverted card context |
| Pure White | `#ffffff` | Primary headings, body text, icon strokes, button borders, link text — the single chromatic force in the system |
| Signal Mint | `#22e2a8` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Deep Navy | `#0a2142` | Ambient atmospheric tint, decorative background wash behind globe visualization |
| Concentric Teal | `#085556` | Diagram and data-visualization stroke, subtle infographic accent |

## Typography

### The Future — Sole typeface across the entire system — navigation, body, headings, buttons, and labels. The slight positive tracking (0.02–0.04em) at all sizes creates a measured, architectural quality uncommon in fintech.
- **Substitute:** Geist, Inter, or DM Sans with positive letter-spacing applied at small sizes
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px, 24px, 32px, 36px, 60px
- **Line height:** 1.13–1.63
- **Letter spacing:** 0.02em at 12–14px, 0.025em at 16–24px, 0.04em at 32–60px
- **OpenType features:** `"ss02" on, "ss09" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.24px |
| body-sm | — | — | 14px | 1.43 | 0.28px |
| body | — | — | 16px | 1.6 | 0.4px |
| subheading | — | — | 24px | 1.33 | 0.6px |
| heading-sm | — | — | 32px | 1.25 | 0.8px |
| heading | — | — | 36px | 1.13 | 0.9px |
| display | — | — | 60px | 1.13 | 2.4px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 16px

### Border Radius

- **nav:** 20px
- **cards:** 20px
- **images:** 10px
- **buttons:** 20px
- **largeCards:** 30px

## Components

### Ghost Pill Button
**Role:** Primary interactive control used for top-level calls-to-action in navigation and hero

Transparent fill with 1px white border (#ffffff), 20px border-radius (pill shape), 10px 30px padding, text in 'The Future' at 16px weight 400, letter-spacing 0.025em, with a trailing arrow icon ›

### Card Surface
**Role:** Container for case studies, features, and content blocks

20px border-radius, #1e1f20 background, no visible border or shadow, generous internal padding (20px), full-bleed image at top with sharp top corners rounding to match card

### Case Study Card
**Role:** Horizontal card displaying a customer/partnership story in a scrollable carousel

Image header (rounded top corners), #1e1f20 background, 20px radius, white company name at 24px with positive tracking, body description at 16px in #807f7f, small uppercase category tag at bottom (Lending, Payments, Tokenization)

### Navigation Bar
**Role:** Top-level site navigation

Dark Carbon (#181818) background, 'C☿SMOS' wordmark left, four nav items centered (Solutions, Technology, Resources, About) with dropdown indicators, ghost pill CTA 'Contact Us' right-aligned

### Headline Display Block
**Role:** Hero and section headlines

Left-aligned, 'The Future' at 60px weight 400, pure white (#ffffff), line-height 1.13, letter-spacing 0.04em, occupies left half of a two-column hero layout

### Body Paragraph
**Role:** Supporting descriptive text under headlines

'The Future' at 16px weight 400, white with reduced visual weight, line-height 1.6, max-width ~540px, left-aligned in hero context

### Stat Strip
**Role:** Horizontal row of key metrics in the hero

Single line, 'The Future' at 24–32px, large numeric value in white followed by descriptive label in #807f7f, items separated by generous horizontal spacing (30px+)

### Carousel Navigation Dots
**Role:** Indicator for horizontal scroll position in case-study carousel

Small circular dots (6px), #807f7f for inactive, #ffffff for active state, positioned top-right of carousel header

### Globe Visualization
**Role:** Decorative data-visualization element in hero

Stylized Earth render in dark tones with concentric circles radiating from a 'TDeFi' node, white annotation labels ('FIGURE', 'Ondo fintech', 'ripple'), positioned right of headline

### Footer Surface
**Role:** Site footer with links and metadata

#181818 background, same nav and typography as header, hairline #333333 top border, compact link rows

### Category Tag Label
**Role:** Small uppercase tag at bottom of case study cards

'The Future' at 12px weight 400, letter-spacing 0.02em, #807f7f color, no background or border, sits flush left at card bottom

## Do's and Don'ts

### Do
- Use 'The Future' exclusively at weight 400 — the system carries authority through spacing and restraint, not bold weights
- Maintain 20px border-radius for all interactive surfaces (buttons, nav items, cards) to preserve the pill geometry
- Keep the canvas near-pure-black (#000000) with #1e1f20 as the only card elevation — avoid introducing mid-gray fills that dilute contrast
- Apply positive letter-spacing from the type scale to every text element, including body copy at small sizes
- Use #ffffff for all text and icon strokes; introduce #807f7f only for genuine de-emphasis, never for decoration
- Anchor hero and section layouts on a two-column split (text-left, visual-right) with the headline at 60px display size
- Reserve #22e2a8 for live-status or active-state indicators only — do not use it as a brand color or button fill

### Don't
- Do not introduce a second typeface — 'The Future' at varying sizes and tracking covers the entire system
- Do not use colored backgrounds (blue, teal, orange) as section backgrounds — these appeared only in decorative diagrams and would break the monochrome system
- Do not add box-shadows or glows to cards or buttons — the system relies on flat dark surfaces and hairline borders, never elevation effects
- Do not bold or italicize type — weight 400 with tracking is the only typographic move available
- Do not place buttons in a filled-white style on dark sections — the ghost outlined pill is the canonical action surface
- Do not use #0000ee or any default-link blue — links inherit #ffffff with optional underline only
- Do not introduce gradients between surfaces — the system is strictly flat, with color appearing only in infographic elements

## Elevation

The system intentionally avoids all shadow and glow effects. Elevation is communicated exclusively through surface tone shifts: #000000 canvas → #181818 nav/footer → #1e1f20 card. No drop-shadows, no inner-shadows, no blur effects. This flat elevation strategy creates a clean, diagrammatic quality where every element sits clearly on the same plane, reinforcing the institutional and technical character of the brand.

## Surfaces

- **Void** (`#000000`) — Page-level canvas, full-bleed section backgrounds
- **Carbon** (`#181818`) — Navigation bar, footer, primary surface container
- **Graphite** (`#1e1f20`) — Elevated card surfaces, content blocks above canvas
- **Chalk** (`#f1f4f4`) — Inverted light surface for contrast sections or modal dialogs

## Imagery

Visual language is restrained and diagrammatic rather than photographic. The hero uses a single large data-visualization element — a dark globe render with concentric circle nodes and white annotation labels (FIGURE, Ondo fintech, ripple) that reads like a schematic or system diagram. Case study cards use real photography but crop it tight to the top of the card, desaturated to fit the dark palette, functioning as content headers rather than lifestyle imagery. No full-bleed editorial photography exists anywhere on the page. Iconography is minimal-stroke white line icons used sparingly for nav dropdowns and directional arrows. The overall visual register is institutional and technical — closer to an annual report or infrastructure dashboard than a consumer product.

## Layout

Page architecture is centered max-width contained at ~1280px with generous outer padding. The hero is a two-column split: headline + body left (~55%), globe diagram right (~45%), with the headline at 60px and a clear vertical hierarchy of headline → body → CTA → stat strip below. Below the hero, sections flow seamlessly on the same #000000 canvas with 80px vertical gaps between blocks. Case study content uses a horizontal card carousel with 4 visible cards and partial bleed on the right edge to suggest scroll continuation, with navigation dots top-right. Navigation is a single horizontal bar — no sidebar, no mega-menu overlay visible. The overall rhythm is quiet and spacious: large headlines anchor dark sections, whitespace separates content blocks, and no section uses a contrasting background color, keeping the monochrome system intact throughout.

## Similar Brands

- **Chainalysis** — Same dark-canvas financial-infrastructure aesthetic with white tracked type and minimal color
- **Stripe (Press / Institutional pages)** — Large declarative headlines on near-black backgrounds with pill-shaped ghost controls and flat card surfaces
- **Messari** — Institutional crypto research aesthetic with dark backgrounds, generous whitespace, and single-weight geometric type
- **Fidelity Institutional** — Financial trust language expressed through monochrome dark surfaces and measured typography rather than color
