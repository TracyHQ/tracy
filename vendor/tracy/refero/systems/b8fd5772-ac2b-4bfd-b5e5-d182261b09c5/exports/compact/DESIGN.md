# destroytoday.com — Style Reference
> Designer's monograph on cream paper. A portfolio that reads like a printed document — paragraph text, underlined links, small blue initials stamp, and illustrations that arrive as full-bleed moments between blocks of writing.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A designer's personal monograph rendered as a quiet, text-first portfolio on white paper. The visual language is almost typographic: a single dark gray on warm white, a tiny blue square logo stamp, underlined links in muted indigo, and paper-warm dividers — like reading someone's printed case studies. Color only enters as illustration accent: a Stripe section with flowing yellow and orange arrows weaving through cobalt gradient blocks, a Casper product photo on bare white, a Dropbox phone mockup with carousel UI. The system deliberately refuses visual noise — no shadows, no gradients on UI, no decorative borders. What breaks the monochrome is meaningful: project imagery and the signature blue stamp that anchors identity.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#222222` | Primary text, nav text, body copy, image borders, dominant foreground on white canvas |
| Paper White | `#ffffff` | Page background, image backgrounds, the base surface every section sits on |
| Stone Border | `#d8d4cf` | Warm hairline dividers, image borders, subtle structural lines — the only neutral that carries a paper-warm tint |
| Pure Black | `#000000` | Icon fills, absolute contrast moments in illustration shadows |
| Stamp Blue | `#0000ff` | DT logo badge fill and link/nav border — a pure, unmoderated blue that acts as the only brand mark, used sparingly as a square stamp in the header |
| Indigo Link | `#555abf` | Underlined link text and link borders throughout body copy and project entries — the workhorse interactive color |
| Navy Deep | `#000080` | Drop shadow tone beneath illustration blocks — the darkest blue in the gradient stack |
| Cobalt Mid | `#276baa` | Mid-tone blue in the Stripe illustration gradient stack |
| Sky Bright | `#2181c2` | Brighter blue in the Stripe illustration gradient, adjacent to the mid-tone |
| Amber Flow | `#fcd669` | Yellow stroke for the flowing curved arrows in the Stripe illustration |
| Tangerine Arc | `#f79a59` | Orange stroke for the secondary flowing arrows in the Stripe illustration |
| Ember Link | `#eb5e28` | Rare warm-orange link variant for cross-section references |

## Typography

### -apple-system — Entire site — system stack used unapologetically as the brand voice. Body text at 400, section headings at 700 large, inline emphasis at 600. The refusal to load a webfont is the signature: the portfolio reads like a native document, not a designed artifact.
- **Substitute:** system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Weights:** 400, 600, 700
- **Sizes:** 14px, 16px, 18px, 24px, 40px, 48px
- **Line height:** 1.20, 1.40, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | — |
| body-sm | — | — | 16px | 1.5 | — |
| body | — | — | 18px | 1.5 | — |
| subheading | — | — | 24px | 1.4 | — |
| heading | — | — | 40px | 1.2 | — |
| heading-lg | — | — | 48px | 1.2 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **logo:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### DT Stamp Logo
**Role:** Brand mark in header

Small square (#0000ff) approximately 32×32px, white 'DT' initials centered inside, no border-radius. Functions as the only brand graphic on the entire site — positioned left of nav links in the header. Pairs with the text nav as a compact identity block.

### Header Navigation Bar
**Role:** Top-level site navigation

Logo stamp on the left, horizontal link list (Blog, RSS, LinkedIn, Email) on the right. No background, no border, sits on white. Links use 16px system font at weight 400 in #0000ff with underline. Centered within page max-width with 8px horizontal padding around links.

### Body Link (Underlined)
**Role:** Inline reference within paragraphs

Text color #555abf, underlined, no background, no border. On hover would shift to #0000ff or brighten. Appears inline within project descriptions and the 'read about' references.

### Section Heading
**Role:** Project or topic title

40–48px, weight 700, color #222222, left-aligned within the content column. Examples: 'stripe', 'Casper'. No decorative underline or accent — the size and weight alone carry the hierarchy. Tight line-height (1.2) for visual density.

### Body Paragraph
**Role:** Descriptive prose for project entries

18px system font at weight 400, color #222222, line-height 1.5. Constrained to roughly half the page width (reading column). Multiple short paragraphs separated by 16px gaps, not block-level headers between them.

### Project Entry Block
**Role:** Self-contained case study section

Vertical stack: section heading → 1–3 body paragraphs with inline links → optional project image. Sections separated by 64–135px vertical padding. Content left-aligned within a column roughly 480–560px wide. Images break the column width and extend further right or center below the text.

### Project Image Container
**Role:** Visual evidence within a project entry

Full-bleed or near-full-bleed images, no border-radius, thin #d8d4cf border (1px) or no border at all. The Casper bedding photo and Dropbox phone mockup both sit on bare white — the product or illustration IS the content, no card chrome frames it.

### Stripe Illustration Block
**Role:** Signature decorative element

Abstract composition of stacked blue gradient rectangles (cobalt-to-navy, using #276baa, #2181c2, #000080) with two flowing curved arrows in #fcd669 and #f79a59. Arrows have visible stroke caps and no fill, tracing diagonal paths through the block stack. Functions as the visual punctuation between text sections — the one moment the system permits color abundance.

### Phone Mockup Frame
**Role:** Product screenshot presentation

Realistic iPhone render showing app UI (Dropbox carousel), centered on white. Sits beside or below related text. No decorative frame, no shadow — the device photo's own edge defines the boundary.

### Date Stamp
**Role:** Metadata for writing entries

14px, weight 400, color #222222, appears directly below a post title. Format: 'Dec 16th, 2025'. No label prefix, no tag styling — the date reads as plain text.

### Intro Paragraph
**Role:** Opening bio block at top of page

18px body text, weight 400, slightly larger or same size as body paragraphs, 2 sentences max. No heading above it — the first text on the page is the bio itself, sitting right of the header alignment zone. Functions as the portfolio's thesis statement.

## Do's and Don'ts

### Do
- Use the system font stack (-apple-system, system-ui, etc.) for all text — never load a webfont; the native reading experience is the brand.
- Set backgrounds to #ffffff and body text to #222222 for every content surface.
- Use #0000ff only as a fill for the small square DT logo badge — treat it as a stamp, not a wash.
- Underline all links with #555abf text color; never remove the underline, it signals the document-like reading mode.
- Separate sections with 64–135px vertical padding and let project images break out of the text column to full width.
- Reserve chromatic color (cobalt gradients, amber arcs) exclusively for the Stripe-style illustration moments — never bleed illustration palette into UI controls or text.
- Keep the content column at roughly 480–560px wide for body text; this narrow measure is what makes the portfolio read like a printed page.

### Don't
- Do not apply border-radius to any element — cards, buttons, images, and the logo are all sharp-cornered.
- Do not use box-shadows on UI components; if a layer needs separation, use a 1px #d8d4cf border instead.
- Do not fill buttons or tags with chromatic color — this system has no filled action buttons, only underlined links and the logo stamp.
- Do not add gradients to backgrounds, cards, or text; gradients are reserved for the illustration blocks and never for chrome.
- Do not introduce accent borders, colored dividers, or decorative rules between sections — rely on whitespace alone.
- Do not use vibrant color for hover states on links; stay within the indigo-to-stamp-blue family (#555abf → #0000ff).
- Do not center body paragraphs or section headings — everything reads left-aligned within its column.

## Elevation

The design deliberately avoids shadows. Layer separation is achieved through whitespace, 1px #d8d4cf hairline borders, and the natural boundary of product imagery — not through elevation. The one shadow present is a #000080 drop shadow inside the Stripe illustration, which is content, not UI chrome.

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas — the single base surface every section shares

## Imagery

Imagery is sparse and project-specific: one product photograph (Casper bedding on white, shot from a slight angle), one realistic device render (iPhone with Dropbox app), and one abstract signature illustration (stacked blue gradient blocks with amber and tangerine curved arrows). All imagery sits on bare white with no frames, masks, or decorative treatment. The visual ratio is overwhelmingly text-to-image — the portfolio is ~85% typography, with images functioning as evidence or punctuation rather than atmosphere. No photography of people, no lifestyle imagery, no icons beyond the system default set.

## Similar Brands

- **Frank Chimero** — Same personal-portfolio-as-printed-document aesthetic: narrow text column, system or near-system typeface, generous whitespace, and illustrations that arrive as full-color moments between paragraphs of plain prose.
- **Robin Rendle** — Text-first portfolio on white with a single small color mark for identity, underlined body links in a muted blue/violet, and project entries where the writing carries the page and images serve as evidence.
- **Tobias van Schneider** — Minimal personal site with large bold section headings, left-aligned body text on white, and a tiny logo mark anchoring the header — the same refusal to decorate the chrome.
- **Marc Hoberman** — Quiet designer portfolio with paragraphs of body text, underlined links in a single accent color, and project sections separated by whitespace alone — no cards, no shadows, no borders.
