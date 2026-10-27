# Bajgart Office — Style Reference
> Editorial gallery wall. Use a vast white field where whisper-weight serif statements and raw portfolio crops carry more visual mass than interface chrome.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bajgart Office — editorial clarity on a white gallery wall. The interface holds nearly everything in black, white, and pale gray, reserving a small green availability signal for real-time scarcity. Oversized Rhymes Text headlines alternate upright and italic phrases, while Saans carries the practical voice in compact, tightly set supporting copy. Pages move between expansive editorial statements, sharp-edged case-study imagery, sparse proof rows, and lightweight pill controls rather than boxed marketing modules.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Gallery White | `#ffffff` | `--color-gallery-white` | Page canvas, header field, testimonial background, and unframed content surfaces |
| Ink | `#000000` | `--color-ink` | Headlines, body copy, logo, filled conversion buttons, accordion labels, and monochrome marks |
| Paper Gray | `#f6f6f6` | `--color-paper-gray` | Pill navigation backgrounds, quiet swatches, subdued icon containers, and low-contrast secondary surfaces |
| Quiet Gray | `#878787` | `--color-quiet-gray` | Muted attribution, supporting metadata, and secondary logo treatment |
| Availability Green | `#189e48` | `--color-availability-green` | Small availability dots and live-capacity copy — a restrained signal against the otherwise achromatic interface |

## Tokens — Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI · `--font-sans-serif`
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2
- **Role:** sans-serif — detected in extracted data but not described by AI

### Rhymes Text Light — Primary editorial display face for multi-line section headlines. The 300 weight and aggressive -3.36px at 56px or -4.32px at 72px tracking make statements feel typeset rather than interface-generated. · `--font-rhymes-text-light`
- **Substitute:** Cormorant Garamond Light
- **Weights:** 300
- **Sizes:** 56px, 72px
- **Line height:** 1.05 at 56px; 1.00 at 72px
- **Letter spacing:** -3.36px at 56px; -4.32px at 72px
- **Role:** Primary editorial display face for multi-line section headlines. The 300 weight and aggressive -3.36px at 56px or -4.32px at 72px tracking make statements feel typeset rather than interface-generated.

### Rhymes Text Light Italic — Italic interruption within Rhymes display headlines; use for one emotionally weighted word or closing phrase, not an entire paragraph. Its -3.36px at 56px and -5.04px at 72px tracking lets the italic splice lock tightly into the upright headline. · `--font-rhymes-text-light-italic`
- **Substitute:** Cormorant Garamond Light Italic
- **Weights:** 300
- **Sizes:** 56px, 72px
- **Line height:** 1.05 at 56px; 1.00 at 72px
- **Letter spacing:** -3.36px at 56px; -5.04px at 72px
- **Role:** Italic interruption within Rhymes display headlines; use for one emotionally weighted word or closing phrase, not an entire paragraph. Its -3.36px at 56px and -5.04px at 72px tracking lets the italic splice lock tightly into the upright headline.

### Saans Regular — Functional sans for body copy, labels, proof copy, and occasional oversized sans emphasis inside display lines. The 70px word treatment is deliberately a near-peer to the 72px Rhymes line, creating a blunt sans-versus-serif contrast. · `--font-saans-regular`
- **Substitute:** DM Sans
- **Weights:** 400, 700
- **Sizes:** 14px, 16px, 24px, 26px, 70px, 72px
- **Line height:** 1.00, 1.03, 1.21, 1.29, 1.33, 1.40, 1.50, 1.71, 2.27
- **Letter spacing:** -1.4px at 70px; -0.52px at 26px; use normal tracking for 16px body copy
- **Role:** Functional sans for body copy, labels, proof copy, and occasional oversized sans emphasis inside display lines. The 70px word treatment is deliberately a near-peer to the 72px Rhymes line, creating a blunt sans-versus-serif contrast.

### Saans Medium — Compact emphasis for small labels and utility text without turning the interface into a bold sans system. · `--font-saans-medium`
- **Substitute:** DM Sans Medium
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.00, 1.29
- **Letter spacing:** normal
- **Role:** Compact emphasis for small labels and utility text without turning the interface into a bold sans system.

### Satoshi — Tiny metadata inside portfolio imagery and embedded visual artifacts. · `--font-satoshi`
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20
- **Letter spacing:** normal
- **Role:** Tiny metadata inside portfolio imagery and embedded visual artifacts.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| micro-metadata | Satoshi | 400 | 12px | 1.2 | 0px | `--text-micro-metadata` |
| label | Saans Regular | 400 | 14px | 1.21 | 0px | `--text-label` |
| label-medium | Saans Medium | 500 | 14px | 1.29 | 0px | `--text-label-medium` |
| body | Saans Regular | 400 | 16px | 1.5 | 0px | `--text-body` |
| body-strong | Saans Regular | 700 | 16px | 1.5 | 0px | `--text-body-strong` |
| display | Rhymes Text Light | 300 | 56px | 1.05 | -3.36px | `--text-display` |
| display-italic | Rhymes Text Light Italic | 300 | 56px | 1.05 | -3.36px | `--text-display-italic` |
| hero-sans-emphasis | Saans Regular | 400 | 70px | 1.03 | -1.4px | `--text-hero-sans-emphasis` |
| hero-display | Rhymes Text Light | 300 | 72px | 1 | -4.32px | `--text-hero-display` |
| hero-display-italic | Rhymes Text Light Italic | 300 | 72px | 1 | -5.04px | `--text-hero-display-italic` |

## Tokens — Spacing & Shapes

**Base unit:** 8px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 8 | 8px | `--spacing-8` |
| 16 | 16px | `--spacing-16` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 56 | 56px | `--spacing-56` |
| 64 | 64px | `--spacing-64` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 0px |
| pills | 9999px |
| images | 80px |
| buttons | 50px |
| imageSmall | 12px |
| buttonLarge | 60px |
| utilitySurfaces | 20px |

### Layout

- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

## Components

### Persistent Split Header
**Role:** Site-wide navigation

A white horizontal header with the Bajgart Design Office wordmark centered as a two-line Rhymes-style lockup; compact navigation pills sit left, while an #189e48 availability dot and text sit beside a black conversion pill on the right. Keep all surrounding header surfaces #ffffff and avoid a visible divider.

### Soft Navigation Pill
**Role:** Public navigation link

Use #f6f6f6 background, #000000 14px Saans text, 50px radius, and 8px vertical by 16px horizontal padding. Keep the control compact and separated from adjacent pills by an 8px gap.

### Availability Indicator
**Role:** Live capacity status

Pair a small circular #189e48 dot with 14px Saans Regular copy on #ffffff; use it only for current capacity or time-sensitive availability, never as a generic success badge.

### Compact Black Pill Button
**Role:** Header and inline conversion control

Set #000000 fill with #ffffff text, 50px radius, and 8px 16px padding. Use the compact pill for header-level conversion and short in-flow prompts.

### Standard Black Pill Button
**Role:** Section conversion control

Set #000000 fill with #ffffff text, 60px radius, and 12px vertical by 16px horizontal padding. Use the taller treatment beside introductory copy and at the opening of utility sections.

### Industry Filter Tag
**Role:** Audience/category marker

Build as a #f6f6f6 pill with #000000 12px Saans text, 50px radius, 8px vertical and 16px horizontal padding; place a tiny colored dot before the label. Maintain an 8px gap between tags.

### Case Study Crop
**Role:** Portfolio showcase tile

Use raw, edge-to-edge project screenshots or artwork as sharp rectangular crops with 0px radius and no shadow. Arrange tiles at intentionally unequal widths and allow the gallery to run beyond the central text alignment.

### Client Proof Row
**Role:** Credibility strip

Center a single 14px Saans supporting sentence above a widely spaced row of muted client wordmarks. Render wordmarks in #878787 or grayscale rather than introducing brand colors.

### Editorial Manifesto Block
**Role:** Centered positioning statement

Center a 56px Rhymes Text Light heading at 59px line-height with -3.36px tracking; swap a meaningful phrase into Rhymes Text Light Italic at the same measured treatment. Set explanatory copy below in 16px Saans Regular, 24px line-height.

### FAQ Split Section
**Role:** Question-and-answer navigation

Use a left text column with a compact black 60px-radius button and a right column of plain #000000 16px Saans questions. Each row is separated by generous white space and ends with a minimal circular plus affordance on #ffffff; do not place FAQ rows inside bordered cards.

### Founder Testimonial Column
**Role:** Social proof

Lay out three unboxed columns on #ffffff. Use 16px Saans Regular quote text at 24px line-height, then a compact attribution row with a circular 80px or 12px-cropped avatar, #000000 name, and #878787 role/company metadata.

## Do's and Don'ts

### Do
- Use #ffffff as the page canvas and #f6f6f6 only for quiet utility surfaces and pill navigation.
- Set principal editorial headlines in Rhymes Text Light 300 at 56px/59px or 72px/72px with -3.36px or -4.32px tracking.
- Use Rhymes Text Light Italic 300 for one selected phrase within a display statement, at the matching upright headline size.
- Set standard reading copy in Saans Regular 16px with 24px line-height.
- Use #000000-filled conversion buttons with #ffffff text; use 50px radius with 8px 16px padding or 60px radius with 12px 16px padding.
- Keep portfolio cards at 0px radius and without box shadows.
- Reserve #189e48 for a small availability dot and capacity-related supporting text.

### Don't
- Do not use #189e48 as a filled button, generic success state, section background, or decorative color block.
- Do not introduce gradients, colored page backgrounds, or tinted panels.
- Do not use rounded white cards; testimonial, FAQ, and proof content stays unboxed on #ffffff.
- Do not set display headings in heavy sans weights or use Rhymes Text above weight 300.
- Do not replace the 50px and 60px button radii with small rounded rectangles.
- Do not add drop shadows to portfolio crops, navigation pills, or content modules.
- Do not treat project-artwork colors as global interface accents.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Gallery White | `#ffffff` | Page background, content field, header, testimonials, and base component surface. |
| 1 | Paper Gray | `#f6f6f6` | Low-emphasis navigation pills, utility chips, and restrained decorative blocks. |

## Elevation

Depth is removed rather than simulated: white content sits directly on the white canvas, portfolio work gains presence from scale and cropping, and pills separate through pale fills and fully rounded silhouettes instead of shadows.

## Imagery

Imagery is portfolio-first rather than lifestyle-led: contained project screenshots, typographic compositions, and campaign crops appear as a horizontally assembled collage with raw square edges. Tiles are large, unevenly sized, and sometimes visibly clipped by the viewport, making the work feel like physical sheets spread across a white studio table. Brand graphics inside those crops may be vivid and multicolored, but the surrounding interface remains monochrome; client marks are converted to subdued gray, and icons are minimal mono marks.

## Layout

The page is a broad white editorial canvas with a persistent split header: compact pill navigation on the left, a centered two-line wordmark, and availability plus conversion control on the right. The opening hero is left-aligned, led by a large multi-line serif/sans/italic statement, a short explanatory line, filter-like industry tags, and a black pill; beneath it, an unequal-width horizontal collage of raw case-study crops creates the visual counterweight. Subsequent sections use long white intervals: a centered client-proof row, a centered manifesto with a small visual swatch sequence and offset project cards, then a split FAQ with utility copy left and questions right. Social proof resolves as three unboxed testimonial columns, preserving the page's spacious, text-led rhythm.

## Agent Prompt Guide

Quick Color Reference:
- Gallery White: #ffffff — Page canvas, header field, testimonial background, and unframed content surfaces
- Ink: #000000 — Headlines, body copy, logo, filled conversion buttons, accordion labels, and monochrome marks
- Paper Gray: #f6f6f6 — Pill navigation backgrounds, quiet swatches, subdued icon containers, and low-contrast secondary surfaces
- Quiet Gray: #878787 — Muted attribution, supporting metadata, and secondary logo treatment
- Availability Green: #189e48 — Small availability dots and live-capacity copy — a restrained signal against the otherwise achromatic interface

Create a left-aligned introductory hero on Gallery White with a 72px/72px Rhymes Text Light 300 headline at -4.32px tracking; splice one phrase in Rhymes Text Light Italic 300 at 72px/72px and follow with 16px/24px Ink Saans Regular copy.
Create a persistent white header with centered two-line Bajgart Office-style wordmark, left-aligned Paper Gray navigation pills, and a right-side Availability Green status dot followed by a Compact Black Pill Button.
Create an edge-to-edge horizontal case-study collage using raw 0px-radius artwork crops of unequal widths; do not frame, shadow, or recolor the project imagery.
Create a centered manifesto using 56px/59px Rhymes Text Light 300 at -3.36px tracking, a matching italic phrase, then a 16px/24px Saans explanation on Gallery White.
Create a three-column testimonial section on Gallery White using 16px/24px Ink Saans quote text and #878787 attribution metadata beside circular cropped avatars.

## Similar Brands

- **Daylight** — Editorial serif-led messaging paired with sparse monochrome conversion controls and wide white-space intervals.
- **Porto Rocha** — Studio portfolio rhythm built from oversized type, raw case-study imagery, and deliberately reduced interface chrome.
- **Studio Freight** — High-contrast black-and-white agency presentation where typography and cropped project work carry the composition.
- **Practice** — Gallery-like white canvas, minimal navigation, and case-study artwork treated as large unboxed visual material.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-gallery-white: #ffffff;
  --color-ink: #000000;
  --color-paper-gray: #f6f6f6;
  --color-quiet-gray: #878787;
  --color-availability-green: #189e48;

  /* Typography — Font Families */
  --font-sans-serif: 'sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-rhymes-text-light: 'Rhymes Text Light', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-rhymes-text-light-italic: 'Rhymes Text Light Italic', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-saans-regular: 'Saans Regular', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-saans-medium: 'Saans Medium', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-satoshi: 'Satoshi', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-micro-metadata: 12px;
  --leading-micro-metadata: 1.2;
  --tracking-micro-metadata: 0px;
  --text-label: 14px;
  --leading-label: 1.21;
  --tracking-label: 0px;
  --text-label-medium: 14px;
  --leading-label-medium: 1.29;
  --tracking-label-medium: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.5;
  --tracking-body-strong: 0px;
  --text-display: 56px;
  --leading-display: 1.05;
  --tracking-display: -3.36px;
  --text-display-italic: 56px;
  --leading-display-italic: 1.05;
  --tracking-display-italic: -3.36px;
  --text-hero-sans-emphasis: 70px;
  --leading-hero-sans-emphasis: 1.03;
  --tracking-hero-sans-emphasis: -1.4px;
  --text-hero-display: 72px;
  --leading-hero-display: 1;
  --tracking-hero-display: -4.32px;
  --text-hero-display-italic: 72px;
  --leading-hero-display-italic: 1;
  --tracking-hero-display-italic: -5.04px;

  /* Typography — Weights */
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;

  /* Spacing */
  --spacing-unit: 8px;
  --spacing-8: 8px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-56: 56px;
  --spacing-64: 64px;

  /* Layout */
  --section-gap: 64px;
  --card-padding: 16px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-xl: 12px;
  --radius-xl-2: 15px;
  --radius-2xl: 20px;
  --radius-full: 50px;
  --radius-full-2: 60px;
  --radius-full-3: 80px;
  --radius-full-4: 9999px;

  /* Named Radii */
  --radius-cards: 0px;
  --radius-pills: 9999px;
  --radius-images: 80px;
  --radius-buttons: 50px;
  --radius-imagesmall: 12px;
  --radius-buttonlarge: 60px;
  --radius-utilitysurfaces: 20px;

  /* Surfaces */
  --surface-gallery-white: #ffffff;
  --surface-paper-gray: #f6f6f6;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-gallery-white: #ffffff;
  --color-ink: #000000;
  --color-paper-gray: #f6f6f6;
  --color-quiet-gray: #878787;
  --color-availability-green: #189e48;

  /* Typography */
  --font-sans-serif: 'sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-rhymes-text-light: 'Rhymes Text Light', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-rhymes-text-light-italic: 'Rhymes Text Light Italic', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-saans-regular: 'Saans Regular', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-saans-medium: 'Saans Medium', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-satoshi: 'Satoshi', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-micro-metadata: 12px;
  --leading-micro-metadata: 1.2;
  --tracking-micro-metadata: 0px;
  --text-label: 14px;
  --leading-label: 1.21;
  --tracking-label: 0px;
  --text-label-medium: 14px;
  --leading-label-medium: 1.29;
  --tracking-label-medium: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.5;
  --tracking-body-strong: 0px;
  --text-display: 56px;
  --leading-display: 1.05;
  --tracking-display: -3.36px;
  --text-display-italic: 56px;
  --leading-display-italic: 1.05;
  --tracking-display-italic: -3.36px;
  --text-hero-sans-emphasis: 70px;
  --leading-hero-sans-emphasis: 1.03;
  --tracking-hero-sans-emphasis: -1.4px;
  --text-hero-display: 72px;
  --leading-hero-display: 1;
  --tracking-hero-display: -4.32px;
  --text-hero-display-italic: 72px;
  --leading-hero-display-italic: 1;
  --tracking-hero-display-italic: -5.04px;

  /* Spacing */
  --spacing-8: 8px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-56: 56px;
  --spacing-64: 64px;

  /* Border Radius */
  --radius-xl: 12px;
  --radius-xl-2: 15px;
  --radius-2xl: 20px;
  --radius-full: 50px;
  --radius-full-2: 60px;
  --radius-full-3: 80px;
  --radius-full-4: 9999px;
}
```
