# Bajgart Office — Style Reference
> Editorial gallery wall. Use a vast white field where whisper-weight serif statements and raw portfolio crops carry more visual mass than interface chrome.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bajgart Office — editorial clarity on a white gallery wall. The interface holds nearly everything in black, white, and pale gray, reserving a small green availability signal for real-time scarcity. Oversized Rhymes Text headlines alternate upright and italic phrases, while Saans carries the practical voice in compact, tightly set supporting copy. Pages move between expansive editorial statements, sharp-edged case-study imagery, sparse proof rows, and lightweight pill controls rather than boxed marketing modules.

## Colors

| Name | Value | Role |
|------|-------|------|
| Gallery White | `#ffffff` | Page canvas, header field, testimonial background, and unframed content surfaces |
| Ink | `#000000` | Headlines, body copy, logo, filled conversion buttons, accordion labels, and monochrome marks |
| Paper Gray | `#f6f6f6` | Pill navigation backgrounds, quiet swatches, subdued icon containers, and low-contrast secondary surfaces |
| Quiet Gray | `#878787` | Muted attribution, supporting metadata, and secondary logo treatment |
| Availability Green | `#189e48` | Small availability dots and live-capacity copy — a restrained signal against the otherwise achromatic interface |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Rhymes Text Light — Primary editorial display face for multi-line section headlines. The 300 weight and aggressive -3.36px at 56px or -4.32px at 72px tracking make statements feel typeset rather than interface-generated.
- **Substitute:** Cormorant Garamond Light
- **Weights:** 300
- **Sizes:** 56px, 72px
- **Line height:** 1.05 at 56px; 1.00 at 72px
- **Letter spacing:** -3.36px at 56px; -4.32px at 72px

### Rhymes Text Light Italic — Italic interruption within Rhymes display headlines; use for one emotionally weighted word or closing phrase, not an entire paragraph. Its -3.36px at 56px and -5.04px at 72px tracking lets the italic splice lock tightly into the upright headline.
- **Substitute:** Cormorant Garamond Light Italic
- **Weights:** 300
- **Sizes:** 56px, 72px
- **Line height:** 1.05 at 56px; 1.00 at 72px
- **Letter spacing:** -3.36px at 56px; -5.04px at 72px

### Saans Regular — Functional sans for body copy, labels, proof copy, and occasional oversized sans emphasis inside display lines. The 70px word treatment is deliberately a near-peer to the 72px Rhymes line, creating a blunt sans-versus-serif contrast.
- **Substitute:** DM Sans
- **Weights:** 400, 700
- **Sizes:** 14px, 16px, 24px, 26px, 70px, 72px
- **Line height:** 1.00, 1.03, 1.21, 1.29, 1.33, 1.40, 1.50, 1.71, 2.27
- **Letter spacing:** -1.4px at 70px; -0.52px at 26px; use normal tracking for 16px body copy

### Saans Medium — Compact emphasis for small labels and utility text without turning the interface into a bold sans system.
- **Substitute:** DM Sans Medium
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.00, 1.29
- **Letter spacing:** normal

### Satoshi — Tiny metadata inside portfolio imagery and embedded visual artifacts.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro-metadata | Satoshi | 400 | 12px | 1.2 | 0px |
| label | Saans Regular | 400 | 14px | 1.21 | 0px |
| label-medium | Saans Medium | 500 | 14px | 1.29 | 0px |
| body | Saans Regular | 400 | 16px | 1.5 | 0px |
| body-strong | Saans Regular | 700 | 16px | 1.5 | 0px |
| display | Rhymes Text Light | 300 | 56px | 1.05 | -3.36px |
| display-italic | Rhymes Text Light Italic | 300 | 56px | 1.05 | -3.36px |
| hero-sans-emphasis | Saans Regular | 400 | 70px | 1.03 | -1.4px |
| hero-display | Rhymes Text Light | 300 | 72px | 1 | -4.32px |
| hero-display-italic | Rhymes Text Light Italic | 300 | 72px | 1 | -5.04px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 0px
- **pills:** 9999px
- **images:** 80px
- **buttons:** 50px
- **imageSmall:** 12px
- **buttonLarge:** 60px
- **utilitySurfaces:** 20px

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

## Elevation

Depth is removed rather than simulated: white content sits directly on the white canvas, portfolio work gains presence from scale and cropping, and pills separate through pale fills and fully rounded silhouettes instead of shadows.

## Surfaces

- **Gallery White** (`#ffffff`) — Page background, content field, header, testimonials, and base component surface.
- **Paper Gray** (`#f6f6f6`) — Low-emphasis navigation pills, utility chips, and restrained decorative blocks.

## Imagery

Imagery is portfolio-first rather than lifestyle-led: contained project screenshots, typographic compositions, and campaign crops appear as a horizontally assembled collage with raw square edges. Tiles are large, unevenly sized, and sometimes visibly clipped by the viewport, making the work feel like physical sheets spread across a white studio table. Brand graphics inside those crops may be vivid and multicolored, but the surrounding interface remains monochrome; client marks are converted to subdued gray, and icons are minimal mono marks.

## Layout

The page is a broad white editorial canvas with a persistent split header: compact pill navigation on the left, a centered two-line wordmark, and availability plus conversion control on the right. The opening hero is left-aligned, led by a large multi-line serif/sans/italic statement, a short explanatory line, filter-like industry tags, and a black pill; beneath it, an unequal-width horizontal collage of raw case-study crops creates the visual counterweight. Subsequent sections use long white intervals: a centered client-proof row, a centered manifesto with a small visual swatch sequence and offset project cards, then a split FAQ with utility copy left and questions right. Social proof resolves as three unboxed testimonial columns, preserving the page's spacious, text-led rhythm.

## Similar Brands

- **Daylight** — Editorial serif-led messaging paired with sparse monochrome conversion controls and wide white-space intervals.
- **Porto Rocha** — Studio portfolio rhythm built from oversized type, raw case-study imagery, and deliberately reduced interface chrome.
- **Studio Freight** — High-contrast black-and-white agency presentation where typography and cropped project work carry the composition.
- **Practice** — Gallery-like white canvas, minimal navigation, and case-study artwork treated as large unboxed visual material.
