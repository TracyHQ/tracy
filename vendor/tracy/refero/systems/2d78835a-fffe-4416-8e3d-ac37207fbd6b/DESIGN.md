# AWE — Style Reference
> robot observatory after midnight. Build black, gallery-like screens where pale editorial type floats above contained AI-world imagery and tiny instrument-panel labels.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

AWE stages an autonomous-systems portal as a near-black field punctuated by porcelain-white robot imagery and luminous cyan details inside the visual content. Oversized Office Times Round headlines create an editorial, almost ceremonial pause against compact Messina Sans explanations, while mono, letter-spaced utility labels make navigation feel like an instrument panel. Surfaces remain nearly flat: charcoal pills, hairline dividers, translucent dark media wells, and rounded image containers carry structure without lifting from the black canvas.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Void | `linear-gradient(0deg, #010101 30%, rgba(26, 26, 26, 0.9))` | `--color-void` | Page canvas, full-screen dark sections, and dark-image overlays |
| Charcoal Control | `#1f1f23` | `--color-charcoal-control` | Navigation pills, compact filled controls, secondary surface fills, and high-frequency 1px outlines |
| Porcelain | `#e0e0e0` | `--color-porcelain` | Primary headlines, UI labels, links, icons, strokes, and input text |
| Machine Well | `#16191b` | `--color-machine-well` | Contained card interiors and dark media panels |
| Hairline Ash | `#252525` | `--color-hairline-ash` | Section rules, list separators, and restrained structural borders |
| Muted Steel | `#828b8d` | `--color-muted-steel` | Body copy, descriptions, and secondary explanatory text |
| Dormant Graphite | `#444444` | `--color-dormant-graphite` | Inactive step numerals and low-emphasis heading-adjacent metadata |
| Faint Steel | `#646e71` | `--color-faint-steel` | Navigation counters and tertiary mono metadata |

## Tokens — Typography

### Office Times Round — Display headlines. The rounded, high-contrast serif turns large statements into editorial placards; the -3% tracking keeps its broad letterforms from becoming stately or classical. · `--font-office-times-round`
- **Substitute:** Cormorant Garamond
- **Weights:** 400
- **Sizes:** 100px, 200px
- **Line height:** 1.00 at 100px; 0.80 at 200px
- **Letter spacing:** -3px at 100px; -6px at 200px
- **Role:** Display headlines. The rounded, high-contrast serif turns large statements into editorial placards; the -3% tracking keeps its broad letterforms from becoming stately or classical.

### Messina Sans — Primary interface and reading face. Use 400 for body, labels, and controls; use 600 only for 26px and 32px feature headings, where the slight negative tracking gives modules a compressed technical voice. · `--font-messina-sans`
- **Substitute:** Inter
- **Weights:** 400, 600
- **Sizes:** 10px, 13px, 16px, 18px, 24px, 26px, 32px
- **Line height:** 1.20, 1.40
- **Letter spacing:** -0.52px at 26px; -0.64px at 32px; normal at 13-24px; 2.4px at 10px
- **Role:** Primary interface and reading face. Use 400 for body, labels, and controls; use 600 only for 26px and 32px feature headings, where the slight negative tracking gives modules a compressed technical voice.

### ABC Laica Mono — Navigation, counters, steps, and uppercase metadata. Its light mono weight plus expanded tracking makes microcopy read as coordinates rather than ordinary navigation. · `--font-abc-laica-mono`
- **Substitute:** IBM Plex Mono
- **Weights:** 300
- **Sizes:** 13px
- **Line height:** 1.20, 1.30, 1.40, 1.50
- **Letter spacing:** 1.04px at 13px
- **Role:** Navigation, counters, steps, and uppercase metadata. Its light mono weight plus expanded tracking makes microcopy read as coordinates rather than ordinary navigation.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| micro-label | Messina Sans | 600 | 10px | 1.4 | 2.4px | `--text-micro-label` |
| utility-nav | ABC Laica Mono | 300 | 13px | 1.4 | 1.04px | `--text-utility-nav` |
| utility-nav-tight | ABC Laica Mono | 300 | 13px | 1.3 | 1.04px | `--text-utility-nav-tight` |
| body | Messina Sans | 400 | 16px | 1.4 | 0px | `--text-body` |
| body-large | Messina Sans | 400 | 18px | 1.4 | 0px | `--text-body-large` |
| module-heading | Messina Sans | 600 | 26px | 1.2 | -0.52px | `--text-module-heading` |
| feature-heading | Messina Sans | 600 | 32px | 1.2 | -0.64px | `--text-feature-heading` |
| display | Office Times Round | 400 | 100px | 1 | -3px | `--text-display` |
| display-monumental | Office Times Round | 400 | 200px | 0.8 | -6px | `--text-display-monumental` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** compact

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 60 | 60px | `--spacing-60` |
| 96 | 96px | `--spacing-96` |
| 120 | 120px | `--spacing-120` |
| 192 | 192px | `--spacing-192` |
| 224 | 224px | `--spacing-224` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 16px |
| pills | 100px |
| badges | 100px |
| images | 80px |
| inputs | 0px |
| buttons | 100px |
| compact-cards | 8px |

### Layout

- **Page max-width:** 940px
- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 8px

## Components

### Desktop Portal Header
**Role:** Persistent public navigation

Use a 76px-tall #010101 bar with the AWE mark and ABC Laica Mono metadata at 13px/300, 1.04px tracking. Place navigation links in separate #1f1f23 pills with 100px radius and 8px gaps; use #e0e0e0 link text and #646e71 for parenthetical counters.

### Floating Section Navigation
**Role:** Centered navigation for dark content sections

Center a compact row of individual #1f1f23 navigation pills over the #010101 canvas. Keep 100px radius, 8px inter-pill gaps, #e0e0e0 mono labels, and 4px spacing between a label and its muted #646e71 numeric marker.

### Portal Display Hero
**Role:** Primary editorial opening

Set the hero on #010101 with a centered Office Times Round headline at 100px/400, 100px line-height, and -3px tracking in #e0e0e0. Position a narrow centered Messina Sans supporting paragraph in #828b8d below it; do not add a filled conversion button.

### Monumental Section Marker
**Role:** Section-opening title treatment

Use Office Times Round at 200px/400 with 0.8 line-height and -6px tracking in #e0e0e0. Keep it isolated on the black canvas before dense module content rather than placing it inside a card.

### Process Step Header
**Role:** Sequential feature navigation

Build a full-width row with a Messina Sans 16px/400 step title in #e0e0e0 on the left and ABC Laica Mono 13px/300 step metadata on the right. Separate the row from its description with a 1px #252525 rule; render the active numeral in #e0e0e0 and inactive numerals in #444444.

### Feature Module Heading
**Role:** Technical capability heading

Use Messina Sans 600 at either 26px/31.2px with -0.52px tracking or 32px/38.4px with -0.64px tracking. Set the heading in #e0e0e0 and follow it with 16px/1.4 Messina Sans body copy in #828b8d.

### Framed Media Card
**Role:** Product visual and world-preview container

Use a 16px outer radius with a 1px structural frame and 1px inset padding; do not use a shadow. Hold the visual in a #16191b well, reserving the 80px radius for oversized image-focused compositions.

### Compact Translucent Card
**Role:** Small data or control grouping

Use rgba(54, 61, 67, 0.4) over #010101 with an 8px radius, no shadow, and no internal padding. Keep any contained text in #e0e0e0 or #828b8d.

### Underlined Text Control
**Role:** Minimal text-led action

Render as transparent background, 0px radius, 0px padding, #e0e0e0 text, and a 1px #e0e0e0 border edge. Use this sparingly for terse controls such as viewing an index; do not convert it into a filled pill.

### Inline Search or Command Input
**Role:** Unboxed utility input

Use a transparent background, transparent border, 0px radius, #e0e0e0 text, and 24px horizontal padding. Pair with a 24px Messina Sans treatment only where a large command-like input is needed.

### Footer Link Cluster
**Role:** Closing utility navigation

Arrange links as compact mono labels on #010101 with #e0e0e0 primary text, #646e71 counters, 8px gaps, and #252525 dividers where groups need separation.

## Do's and Don'ts

### Do
- Use #010101 as the default page canvas and reserve #16191b for contained media or card interiors.
- Set display statements in Office Times Round 400 at 100px/100px with -3px tracking; use the 200px treatment only as an isolated section marker.
- Use Messina Sans 600 only at 26px or 32px feature-heading sizes with -0.02em tracking.
- Set utility navigation in ABC Laica Mono 300 at 13px with 1.04px tracking and uppercase text.
- Use #1f1f23-filled navigation controls with 100px radius and 8px gaps.
- Draw structural separators as 1px #252525 rules and keep cards shadowless.
- Use 16px card corners, 8px compact-card corners, and 80px radii only for large image-led containers.

### Don't
- Do not introduce white page backgrounds; keep base sections on #010101.
- Do not use bright UI accent colors, gradients of saturated hues, or semantic status-color families.
- Do not replace the 100px-radius navigation pills with 16px rounded rectangles.
- Do not use heavy font weights for display type; Office Times Round remains 400.
- Do not set body copy in #e0e0e0 when #828b8d is appropriate for explanatory paragraphs.
- Do not add drop shadows to cards, pills, media frames, or separators.
- Do not add padded filled primary buttons when the available public controls are charcoal navigation pills and transparent underlined text controls.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Void Canvas | `#010101` | Page background and full-bleed narrative sections. |
| 1 | Machine Well | `#16191b` | Contained visual wells and dark card interiors. |
| 2 | Charcoal Control | `#1f1f23` | Navigation pills, compact controls, and outlined surface details. |

## Elevation

Depth comes from nested charcoal surfaces, 1px #252525 rules, broad blur treatments, and black-to-charcoal overlays rather than box shadows. A surface should appear embedded in the void, not raised above it.

## Imagery

Imagery is dominated by cinematic 3D robot-world renders: glossy white humanoid agents with black face screens and small cyan-lit details, staged in bright seamless environments. The opening visual is full-bleed and wide, with cropped foreground robots framing a central figure; later visuals are contained inside deeply rounded dark media wells. This creates a deliberate contrast between almost colorless black interface chrome and high-key simulation imagery. Icons and marks are predominantly monochrome, compact, and geometric; imagery carries the only conspicuous cyan color and functions as world-building content rather than a reusable UI accent.

## Layout

The page uses a black, full-bleed narrative canvas with a compact top header and a centered content column constrained to 940px for text-led sections. It opens with a full-width, high-key robot image band beneath the header, then transitions into a centered dark hero with a large serif statement and narrow supporting copy. Subsequent sections are vertically staged rather than card-grid dense: an oversized serif section marker introduces a left-aligned process row, right-aligned step counter, divider, explanatory copy, and a large rounded dark media panel below. Navigation appears both as a standard header and as a centered floating pill cluster inside later dark sections; the page closes with a compact link-heavy footer.

## Agent Prompt Guide

Quick Color Reference:
- Void: linear-gradient(0deg, #010101 30%, rgba(26, 26, 26, 0.9)) — Page canvas, full-screen dark sections, and dark-image overlays
- Charcoal Control: #1f1f23 — Navigation pills, compact filled controls, secondary surface fills, and high-frequency 1px outlines
- Porcelain: #e0e0e0 — Primary headlines, UI labels, links, icons, strokes, and input text
- Machine Well: #16191b — Contained card interiors and dark media panels
- Hairline Ash: #252525 — Section rules, list separators, and restrained structural borders
- Muted Steel: #828b8d — Body copy, descriptions, and secondary explanatory text
- Dormant Graphite: #444444 — Inactive step numerals and low-emphasis heading-adjacent metadata
- Faint Steel: #646e71 — Navigation counters and tertiary mono metadata

Create a black AWE portal hero: #010101 canvas, centered Office Times Round 400 headline at 100px with 100px line-height and -3px tracking in Porcelain, followed by a narrow Messina Sans 16px/1.4 description in Muted Steel.
Create a 76px public header on Void with an AWE wordmark at left and separate Charcoal Control navigation pills at right; use ABC Laica Mono 300 at 13px with 1.04px tracking, Porcelain labels, Faint Steel counters, 100px pill radii, and 8px gaps.
Create an AWE process module with a Porcelain Messina Sans 16px title, right-aligned ABC Laica Mono step counter, a 1px Hairline Ash divider, Muted Steel descriptive copy, and a shadowless Machine Well media panel with 16px outer corners.
Create a full-width high-key 3D autonomous-agent image strip beneath a Void header: porcelain robots with black display faces and cyan-lit details, raw wide crop, with no colorful interface controls over the image.

## Similar Brands

- **MUBI** — Black editorial canvas, oversized serif display typography, and restrained utility navigation.
- **On Cyber** — Immersive black-space storytelling with contained digital-world imagery and sparse navigation.
- **Rive** — Dark product presentation that lets interactive or rendered visuals carry the strongest color.
- **Dithered** — Mono utility typography and gallery-like black layouts structured with quiet rules and sparse controls.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-void: #010101;
  --gradient-void: linear-gradient(0deg, #010101 30%, rgba(26, 26, 26, 0.9));
  --color-charcoal-control: #1f1f23;
  --color-porcelain: #e0e0e0;
  --color-machine-well: #16191b;
  --color-hairline-ash: #252525;
  --color-muted-steel: #828b8d;
  --color-dormant-graphite: #444444;
  --color-faint-steel: #646e71;

  /* Typography — Font Families */
  --font-office-times-round: 'Office Times Round', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-messina-sans: 'Messina Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-abc-laica-mono: 'ABC Laica Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-micro-label: 10px;
  --leading-micro-label: 1.4;
  --tracking-micro-label: 2.4px;
  --text-utility-nav: 13px;
  --leading-utility-nav: 1.4;
  --tracking-utility-nav: 1.04px;
  --text-utility-nav-tight: 13px;
  --leading-utility-nav-tight: 1.3;
  --tracking-utility-nav-tight: 1.04px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-body-large: 18px;
  --leading-body-large: 1.4;
  --tracking-body-large: 0px;
  --text-module-heading: 26px;
  --leading-module-heading: 1.2;
  --tracking-module-heading: -0.52px;
  --text-feature-heading: 32px;
  --leading-feature-heading: 1.2;
  --tracking-feature-heading: -0.64px;
  --text-display: 100px;
  --leading-display: 1;
  --tracking-display: -3px;
  --text-display-monumental: 200px;
  --leading-display-monumental: 0.8;
  --tracking-display-monumental: -6px;

  /* Typography — Weights */
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-60: 60px;
  --spacing-96: 96px;
  --spacing-120: 120px;
  --spacing-192: 192px;
  --spacing-224: 224px;

  /* Layout */
  --page-max-width: 940px;
  --section-gap: 40px;
  --card-padding: 16px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-lg: 8px;
  --radius-2xl: 16px;
  --radius-full: 80px;
  --radius-full-2: 100px;

  /* Named Radii */
  --radius-cards: 16px;
  --radius-pills: 100px;
  --radius-badges: 100px;
  --radius-images: 80px;
  --radius-inputs: 0px;
  --radius-buttons: 100px;
  --radius-compact-cards: 8px;

  /* Surfaces */
  --surface-void-canvas: #010101;
  --surface-machine-well: #16191b;
  --surface-charcoal-control: #1f1f23;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-void: #010101;
  --color-charcoal-control: #1f1f23;
  --color-porcelain: #e0e0e0;
  --color-machine-well: #16191b;
  --color-hairline-ash: #252525;
  --color-muted-steel: #828b8d;
  --color-dormant-graphite: #444444;
  --color-faint-steel: #646e71;

  /* Typography */
  --font-office-times-round: 'Office Times Round', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-messina-sans: 'Messina Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-abc-laica-mono: 'ABC Laica Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-micro-label: 10px;
  --leading-micro-label: 1.4;
  --tracking-micro-label: 2.4px;
  --text-utility-nav: 13px;
  --leading-utility-nav: 1.4;
  --tracking-utility-nav: 1.04px;
  --text-utility-nav-tight: 13px;
  --leading-utility-nav-tight: 1.3;
  --tracking-utility-nav-tight: 1.04px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-body-large: 18px;
  --leading-body-large: 1.4;
  --tracking-body-large: 0px;
  --text-module-heading: 26px;
  --leading-module-heading: 1.2;
  --tracking-module-heading: -0.52px;
  --text-feature-heading: 32px;
  --leading-feature-heading: 1.2;
  --tracking-feature-heading: -0.64px;
  --text-display: 100px;
  --leading-display: 1;
  --tracking-display: -3px;
  --text-display-monumental: 200px;
  --leading-display-monumental: 0.8;
  --tracking-display-monumental: -6px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-60: 60px;
  --spacing-96: 96px;
  --spacing-120: 120px;
  --spacing-192: 192px;
  --spacing-224: 224px;

  /* Border Radius */
  --radius-lg: 8px;
  --radius-2xl: 16px;
  --radius-full: 80px;
  --radius-full-2: 100px;
}
```
