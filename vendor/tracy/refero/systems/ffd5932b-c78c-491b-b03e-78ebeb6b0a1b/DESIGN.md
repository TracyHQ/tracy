# Basha-Franklin — Style Reference
> gallery grid beneath a white lintel. Use a warm #f4ede6 field, hairline black structure, and photograph-led asymmetric columns that read like a printed architectural portfolio.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Basha-Franklin — gallery grid beneath a white lintel. The site treats architecture photography as the dominant interface material: oversized, uncropped rectangular project images sit inside a fine ruled grid on a warm plaster canvas. Typography is deliberately split between small, tracked sans-serif labels and a single large, softly tightened serif voice; this makes navigation and descriptive statements feel like exhibition captions rather than marketing modules. A saturated navy footer interrupts the pale field as a dense endcap, carrying the pale cream type and newsletter controls.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Plaster Canvas | `#f4ede6` | `--color-plaster-canvas` | Page backgrounds and project-index field |
| Gallery White | `#ffffff` | `--color-gallery-white` | Masthead surface and bright interface plane |
| Ink | `#000000` | `--color-ink` | Headings, project captions, navigation, icons, hairline rules, and transparent text controls |
| Footer Cream | `#eddbcc` | `--color-footer-cream` | Footer copy, newsletter field treatment, and light arrow controls on navy — an aged-paper contrast against the dark endcap |
| Reception Navy | `#001060` | `--color-reception-navy` | Footer background and high-contrast closing surface — the single saturated architectural block in the composition |
| Terracotta Wash | `#e5c0a4` | `--color-terracotta-wash` | Large warm feature surface and decorative graphic fill |

## Tokens — Typography

### STKBureau-Sans — All compact interface language: uppercase section labels, utility links, project captions, footer details, controls, and menu glyphs. The +0.48px tracked 12px uppercase treatment makes labels read as measured architectural annotation rather than navigation chrome. · `--font-stkbureau-sans`
- **Substitute:** Arial, Helvetica, sans-serif
- **Weights:** 400
- **Sizes:** 12px, 14px
- **Line height:** 1.20, 1.30
- **Letter spacing:** -0.144px at 12px, -0.14px at 14px, and +0.48px at 12px
- **Role:** All compact interface language: uppercase section labels, utility links, project captions, footer details, controls, and menu glyphs. The +0.48px tracked 12px uppercase treatment makes labels read as measured architectural annotation rather than navigation chrome.

### STKBureau-Serif — Editorial statements and expanded navigation links. Its modest 29px scale and tightened tracking make the serif feel like a composed printed line, not a conventional oversized display headline. · `--font-stkbureau-serif`
- **Substitute:** Cormorant Garamond, Georgia, serif
- **Weights:** 400
- **Sizes:** 29px
- **Line height:** 1.19
- **Letter spacing:** -0.58px at 29px
- **Role:** Editorial statements and expanded navigation links. Its modest 29px scale and tightened tracking make the serif feel like a composed printed line, not a conventional oversized display headline.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| eyebrow | STKBureau-Sans | 400 | 12px | 1.3 | 0.48px | `--text-eyebrow` |
| caption | STKBureau-Sans | 400 | 12px | 1.2 | -0.144px | `--text-caption` |
| utility | STKBureau-Sans | 400 | 14px | 1.2 | -0.14px | `--text-utility` |
| icon-control | STKBureau-Sans | 400 | 14px | 1.2 | 0px | `--text-icon-control` |
| editorial-display | STKBureau-Serif | 400 | 29px | 1.19 | -0.58px | `--text-editorial-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 9 | 9px | `--spacing-9` |
| 12 | 12px | `--spacing-12` |
| 14 | 14px | `--spacing-14` |
| 18 | 18px | `--spacing-18` |
| 22 | 22px | `--spacing-22` |
| 25 | 25px | `--spacing-25` |
| 36 | 36px | `--spacing-36` |
| 72 | 72px | `--spacing-72` |
| 93 | 93px | `--spacing-93` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 0px |
| links | 0px |
| images | 0px |
| inputs | 0px |
| buttons | 0px |

### Layout

- **Section gap:** 93px
- **Card padding:** 0px
- **Element gap:** 9px

## Components

### White Masthead
**Role:** Persistent public site header

Use a Gallery White #ffffff horizontal bar with a centered black wordmark, a left-aligned menu control, and small right-aligned social icons. Keep every element square-edged; use Ink #000000 and 14px STKBureau-Sans at weight 400 for utility controls.

### Hamburger Menu Control
**Role:** Global navigation trigger

Render as a transparent Ink #000000 text/icon button with 0px radius, 0px padding, and no filled background. Use 14px STKBureau-Sans weight 400; do not turn it into a rounded icon container.

### Expanded Editorial Navigation
**Role:** Large-format site navigation

Set navigation destinations in Ink #000000, 29px STKBureau-Serif weight 400, 34.2px line height, and -0.576px tracking. Separate groups with 22px or 36px gaps; retain a warm Plaster Canvas #f4ede6 field and square geometry.

### Tracked Section Eyebrow
**Role:** Section title and utility link

Use Ink #000000 uppercase STKBureau-Sans at 12px, weight 400, 15.6px line height, and +0.48px tracking. Apply the same treatment to compact links prefixed by a plus sign.

### Editorial Serif Statement
**Role:** Prominent descriptive copy

Set in STKBureau-Serif at 29px, weight 400, 34.2px line height, and -0.576px tracking. Use Ink #000000 on Plaster Canvas #f4ede6 or Footer Cream #eddbcc on Reception Navy #001060.

### Project Image Tile
**Role:** Portfolio project link

Use a raw-edge rectangular photograph with 0px radius, no shadow, no panel background, and 0px card padding. Pair it with an Ink #000000 project caption beneath; keep the image and caption inside a ruled grid cell rather than a floating card.

### Project Mosaic Grid
**Role:** Featured-work content arrangement

Compose unequal-width project tiles across a three-column editorial grid with 1px Ink #000000 dividers and 9px, 22px, or 36px internal gaps. Do not normalize image heights; preserve varied large and small photographic crops.

### Inline Plus Link
**Role:** Textual discovery control

Use a transparent background, 0px border radius, 0px padding, and Ink #000000 text in 12px uppercase STKBureau-Sans with +0.48px tracking. Prefix the label with a literal plus sign rather than adding a separate filled icon.

### Navy Footer Endcap
**Role:** Newsletter and legal footer surface

Use a full-width Reception Navy #001060 panel with Footer Cream #eddbcc typography. Space primary footer groups by 93px; set labels in 12px uppercase STKBureau-Sans with +0.48px tracking and legal text in 12px STKBureau-Sans with -0.144px tracking.

### Footer Newsletter Field
**Role:** Email capture input

Use a transparent Reception Navy #001060 background, Footer Cream #eddbcc text, a 1px Footer Cream #eddbcc rule, 0px radius, and 0px padding. Pair it with a transparent 14px STKBureau-Sans arrow button in Footer Cream #eddbcc.

## Do's and Don'ts

### Do
- Use Plaster Canvas #f4ede6 as the primary page field and Gallery White #ffffff only for the masthead or bright structural planes.
- Set section eyebrows and compact links in 12px uppercase STKBureau-Sans, 15.6px line height, and +0.48px letter spacing.
- Set editorial navigation and lead statements in 29px STKBureau-Serif, 34.2px line height, and -0.576px letter spacing.
- Keep buttons, inputs, cards, links, and images at 0px radius.
- Use 1px Ink #000000 grid rules to divide project columns and preserve 0px padding inside project tiles.
- Use 9px for close label-and-control relationships, 36px for navigation group separation, and 93px between major footer groups.
- Use Reception Navy #001060 with Footer Cream #eddbcc for footer surfaces and controls.

### Don't
- Do not add rounded corners, pill controls, or card shadows; every captured component uses 0px radius and no box-shadow.
- Do not place project photography inside white cards with internal padding; use raw rectangular images with 0px card padding.
- Do not use bold weights for navigation, captions, or labels; retain weight 400 across both type families.
- Do not replace the +0.48px tracked uppercase sans labels with sentence-case body UI.
- Do not use a saturated filled conversion button; public controls are transparent with Ink #000000 or Footer Cream #eddbcc text and rules.
- Do not introduce gradients or multicolor interface accents.
- Do not use Terracotta Wash #e5c0a4 as a general button fill; reserve it for large warm feature surfaces or decorative fills.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Plaster Canvas | `#f4ede6` | Primary content field for the portfolio grid. |
| 1 | Gallery White | `#ffffff` | Masthead and bright structural surface. |
| 2 | Terracotta Wash | `#e5c0a4` | Warm feature panel and decorative graphic surface. |
| 3 | Reception Navy | `#001060` | Footer endcap and dark contrast surface. |

## Elevation

Use ruled boundaries, image edges, and field changes instead of elevation. Cards and project tiles remain flush with their background at 0px radius and box-shadow: none.

## Imagery

Architecture and interior photography are the principal visual language. Images are large, high-resolution project documentation rather than lifestyle scenes: lobby interiors, workplace rooms, stairwells, and building exteriors appear in natural material palettes with daylight, warm timber, stone, and occasional vivid interior color. Photography is contained in sharp-cornered rectangular cells, cropped edge-to-edge without masks, overlays, frames, or shadow. The page is image-heavy in the portfolio areas, with small caption text serving as the only interface layer over or beneath the visual work; iconography is limited to tiny monochrome utility and social marks.

## Layout

The page begins with a thin Gallery White masthead spanning the viewport, with a centered wordmark, menu trigger at left, and social links at right. The opening project presentation is full-bleed photography directly below the header; subsequent content shifts onto a Plaster Canvas #f4ede6 portfolio index structured by continuous vertical and horizontal Ink rules. The work area uses an asymmetric three-column mosaic: text occupies grid cells above or beside raw rectangular images, and tile dimensions vary rather than resolving into equal cards. Sections flow without alternating color bands until a large Reception Navy #001060 footer endcap, where newsletter content is centered or broadly spaced and legal details sit low at the edges. The visual density is spacious at section scale but compact within captions, utility controls, and grid seams.

## Agent Prompt Guide

Quick Color Reference:
- Plaster Canvas: #f4ede6 — Page backgrounds and project-index field
- Gallery White: #ffffff — Masthead surface and bright interface plane
- Ink: #000000 — Headings, project captions, navigation, icons, hairline rules, and transparent text controls
- Footer Cream: #eddbcc — Footer copy, newsletter field treatment, and light arrow controls on navy — an aged-paper contrast against the dark endcap
- Reception Navy: #001060 — Footer background and high-contrast closing surface — the single saturated architectural block in the composition
- Terracotta Wash: #e5c0a4 — Large warm feature surface and decorative graphic fill

Create a white masthead with a centered black Basha-Franklin wordmark, left hamburger, and right social marks; use Ink text, 0px radii, and 14px STKBureau-Sans weight 400.
Create an asymmetric three-column portfolio mosaic on Plaster Canvas with 1px Ink rules, raw-edge architecture photographs, and captions set in 12px STKBureau-Sans weight 400.
Create an editorial navigation panel on Plaster Canvas using stacked Ink links in 29px STKBureau-Serif, 34.2px line height, and -0.576px tracking.
Create a Reception Navy footer with a Footer Cream newsletter statement in 29px STKBureau-Serif and a transparent, 1px Footer Cream underlined email field.
Create a compact discovery link using a plus-sign prefix, Ink text, and 12px uppercase STKBureau-Sans with +0.48px tracking; use no filled background or rounded container.

## Similar Brands

- **David Chipperfield Architects** — Architecture-led portfolio composition with restrained serif editorial language and large project photography.
- **Pentagram** — Uses a work-first index where imagery, terse captions, and uncompromising grid structure carry the page.
- **Studio Gang** — Shares sharp-cornered architectural imagery and a sparse, typographic project-presentation approach.
- **OMA** — Similar reliance on rectilinear image grids, compact annotation-like labels, and black rules as layout structure.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-plaster-canvas: #f4ede6;
  --color-gallery-white: #ffffff;
  --color-ink: #000000;
  --color-footer-cream: #eddbcc;
  --color-reception-navy: #001060;
  --color-terracotta-wash: #e5c0a4;

  /* Typography — Font Families */
  --font-stkbureau-sans: 'STKBureau-Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-stkbureau-serif: 'STKBureau-Serif', ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;

  /* Typography — Scale */
  --text-eyebrow: 12px;
  --leading-eyebrow: 1.3;
  --tracking-eyebrow: 0.48px;
  --text-caption: 12px;
  --leading-caption: 1.2;
  --tracking-caption: -0.144px;
  --text-utility: 14px;
  --leading-utility: 1.2;
  --tracking-utility: -0.14px;
  --text-icon-control: 14px;
  --leading-icon-control: 1.2;
  --tracking-icon-control: 0px;
  --text-editorial-display: 29px;
  --leading-editorial-display: 1.19;
  --tracking-editorial-display: -0.58px;

  /* Typography — Weights */
  --font-weight-regular: 400;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-9: 9px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-18: 18px;
  --spacing-22: 22px;
  --spacing-25: 25px;
  --spacing-36: 36px;
  --spacing-72: 72px;
  --spacing-93: 93px;

  /* Layout */
  --section-gap: 93px;
  --card-padding: 0px;
  --element-gap: 9px;

  /* Named Radii */
  --radius-cards: 0px;
  --radius-links: 0px;
  --radius-images: 0px;
  --radius-inputs: 0px;
  --radius-buttons: 0px;

  /* Surfaces */
  --surface-plaster-canvas: #f4ede6;
  --surface-gallery-white: #ffffff;
  --surface-terracotta-wash: #e5c0a4;
  --surface-reception-navy: #001060;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-plaster-canvas: #f4ede6;
  --color-gallery-white: #ffffff;
  --color-ink: #000000;
  --color-footer-cream: #eddbcc;
  --color-reception-navy: #001060;
  --color-terracotta-wash: #e5c0a4;

  /* Typography */
  --font-stkbureau-sans: 'STKBureau-Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-stkbureau-serif: 'STKBureau-Serif', ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;

  /* Typography — Scale */
  --text-eyebrow: 12px;
  --leading-eyebrow: 1.3;
  --tracking-eyebrow: 0.48px;
  --text-caption: 12px;
  --leading-caption: 1.2;
  --tracking-caption: -0.144px;
  --text-utility: 14px;
  --leading-utility: 1.2;
  --tracking-utility: -0.14px;
  --text-icon-control: 14px;
  --leading-icon-control: 1.2;
  --tracking-icon-control: 0px;
  --text-editorial-display: 29px;
  --leading-editorial-display: 1.19;
  --tracking-editorial-display: -0.58px;

  /* Spacing */
  --spacing-9: 9px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-18: 18px;
  --spacing-22: 22px;
  --spacing-25: 25px;
  --spacing-36: 36px;
  --spacing-72: 72px;
  --spacing-93: 93px;
}
```
