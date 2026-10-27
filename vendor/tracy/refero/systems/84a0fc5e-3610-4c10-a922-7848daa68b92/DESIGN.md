# Bee — Style Reference
> Sunlit honey-yellow talisman. Build each screen as a tactile editorial spread: intimate wrist-worn product imagery contained in generously rounded frames beside bold, near-black type on yellow or pale neutral fields.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bee pairs warm, close-cropped lifestyle photography with blocks of saturated honey yellow, pale lavender, putty gray, and near-black. Oversized Acidgrotesk headlines are heavy and tightly tracked, while Inter carries longer explanations with unusually loose leading. Surfaces are large rounded rectangles with no shadow hierarchy; the physical wearable, human hands, and color-blocked panels supply the page’s depth.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Bee Ink | `#21200b` | `--color-bee-ink` | Headlines, body text, hairline borders, dark surface panels, and outlined action borders |
| Pioneer Yellow | `#ffd900` | `--color-pioneer-yellow` | Navigation links, icon marks, colored content fields, and dark-surface button text — vivid yellow makes the near-black/yellow pairing unmistakably Bee |
| Lavender Memory | `#d2c4ff` | `--color-lavender-memory` | Feature-card surfaces and occasional supporting text treatment; this cool interruption prevents the yellow-and-ink system from becoming monochrome |
| Putty | `#e5e0dd` | `--color-putty` | Large card surfaces and the dominant warm-gray page canvas |
| Paper | `#f7f3f1` | `--color-paper` | Light card surfaces and filled light outlined-action backgrounds |
| True Black | `#000000` | `--color-true-black` | Occasional deepest media or card surface |
| White | `#ffffff` | `--color-white` | Hero text over photography and the lightest canvas surface |
| Recruiter Indigo | `#150a45` | `--color-recruiter-indigo` | Full-width recruitment and announcement strip behind white text |

## Tokens — Typography

### Fff Acidgrotesk — The signature display and interface face: use 700 for 48-96px headlines, 700 at 19px for compact section statements, and 500 for navigation, controls, and feature labels. The 96px display tracking is aggressively tight, making large words read as one dense graphic form rather than separate letters. · `--font-fff-acidgrotesk`
- **Substitute:** Arial, Helvetica Neue, or Space Grotesk
- **Weights:** 400, 500, 700
- **Sizes:** 13px, 16px, 19px, 20px, 48px, 59px, 96px, 734px
- **Line height:** 0.80, 1.00, 1.20, 1.40, 1.50
- **Letter spacing:** -3.19px at 96px; -0.38px at 13px; -0.19px at 19px
- **Role:** The signature display and interface face: use 700 for 48-96px headlines, 700 at 19px for compact section statements, and 500 for navigation, controls, and feature labels. The 96px display tracking is aggressively tight, making large words read as one dense graphic form rather than separate letters.

### Inter Variable — Use for explanatory paragraphs, introductory copy, and small supporting information. At 16px/1.8 it creates a calm, spacious counterweight to Acidgrotesk’s compressed, emphatic headings. · `--font-inter-variable`
- **Substitute:** Inter, Arial, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 13px, 16px, 19px, 22px, 24px, 32px
- **Line height:** 1.00, 1.20, 1.50, 1.80
- **Letter spacing:** -0.48px at 16px; -0.38px at 13px
- **Role:** Use for explanatory paragraphs, introductory copy, and small supporting information. At 16px/1.8 it creates a calm, spacious counterweight to Acidgrotesk’s compressed, emphatic headings.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| footer-nav | Fff Acidgrotesk | 500 | 13px | 1.5 | -0.39px | `--text-footer-nav` |
| body | Inter Variable | 400 | 16px | 1.8 | -0.48px | `--text-body` |
| section-label | Fff Acidgrotesk | 700 | 19px | 1.2 | 0px | `--text-section-label` |
| feature-heading | Fff Acidgrotesk | 500 | 19px | 1.4 | -0.19px | `--text-feature-heading` |
| section-heading | Fff Acidgrotesk | 700 | 48px | 1.2 | 0px | `--text-section-heading` |
| editorial-heading | Fff Acidgrotesk | 700 | 59px | 1.2 | 0px | `--text-editorial-heading` |
| hero-display | Fff Acidgrotesk | 700 | 96px | 1 | -3.168px | `--text-hero-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 60 | 60px | `--spacing-60` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 96 | 96px | `--spacing-96` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 38.325px |
| links | 24px |
| pills | 1440px |
| badges | 9999px |
| images | 38.325px |
| inputs | 38.325px |
| buttons | 38.325px |
| darkButtons | 100px |

### Layout

- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 16px

## Components

### Public Header
**Role:** Top navigation over light or ink sections.

Use Bee Ink #21200b or Pioneer Yellow #ffd900 for the logo and navigation depending on the surrounding surface. Set navigation in Fff Acidgrotesk 500 at 13px with -0.38px tracking; keep the header as a flat band with no shadow.

### Outlined Order Button
**Role:** Public conversion control on light surfaces.

Fill with Paper #f7f3f1, use a 1px Bee Ink #21200b border and Bee Ink text, radius 38.325px, and 0px 60px horizontal padding. Pair it with Fff Acidgrotesk at 13px or 16px weight 500.

### Ink Order Pill
**Role:** Dark filled purchase control.

Fill with Bee Ink #21210a, set Pioneer Yellow #ffd900 text, use no contrasting border, radius 100px, and 22px vertical by 30px horizontal padding. Use Fff Acidgrotesk 500 at 20px.

### Rounded Lifestyle Hero
**Role:** Hero-level product storytelling through photography.

Use a warm, tightly cropped lifestyle photograph in a 38.325px-radius frame. Place white #ffffff Acidgrotesk display text directly over the lower image area at 96px/1.0/700 with -3.19px tracking; preserve the photograph as the dominant field.

### Hero Video Tile
**Role:** Playable media overlay within the hero.

Set a Bee Ink #21200b media tile over the photography with a 38.325px radius. Use Pioneer Yellow #ffd900 oversized wordmark-style lettering and a white #ffffff play icon; keep the tile compact relative to the hero image.

### Yellow Split Feature Panel
**Role:** Editorial product explanation beside a lifestyle image.

Use a Pioneer Yellow #ffd900 text panel paired edge-to-edge with a warm product photograph, clipped as one 38.325px-radius composition. Set the main statement in Fff Acidgrotesk 700 at 59px/1.2 in Bee Ink #21200b and body copy in Inter 400 at 16px/1.8 with -0.48px tracking.

### Feature Accordion Row
**Role:** Expandable capability statement.

Use Bee Ink #21200b text in Fff Acidgrotesk 700 at 19px/1.2. Separate rows with a 1px Bee Ink divider; maintain 16px internal spacing and avoid filled containers or shadows.

### Pioneer Purchase Stage
**Role:** Centered product-order module.

Place a centered Fff Acidgrotesk 700 section heading at 48px/1.2 in Bee Ink #21200b above Inter support copy and the Ink Order Pill. Use Paper #f7f3f1 or Putty #e5e0dd as the product-stage background, with the wearable render emerging from below the text.

### Putty Feature Card
**Role:** Neutral feature or product-detail card.

Fill with Putty #e5e0dd, use no shadow, no visible border, 38.325px radius, and 16px padding when text sits inside. Set headings in Bee Ink #21200b.

### Lavender Feature Card
**Role:** Accent feature or supporting product card.

Fill with Lavender Memory #d2c4ff, use no shadow and a 38.325px radius. Keep copy Bee Ink #21200b and limit this surface to distinct feature moments rather than the entire page canvas.

### Ink Media Card
**Role:** Dark product or video content tile.

Fill with Bee Ink #21200b or True Black #000000, use a 38.325px radius and no shadow. Set text in White #ffffff and reserve Pioneer Yellow #ffd900 for graphic marks, labels, or control text.

### Recruitment Announcement Strip
**Role:** Persistent full-width hiring notice.

Use Recruiter Indigo #150a45 as a flat full-width band with white #ffffff copy. Set the message in Inter 400 around 19px and the destination link in white; avoid radius and shadows.

### Footer Navigation Link
**Role:** Compact footer navigation.

Set links in Pioneer Yellow #ffd900 using Fff Acidgrotesk 500 at 13px/1.5 with -0.38px tracking. Use a dark Bee Ink #21200b footer field and 16px gaps between grouped items.

## Do's and Don'ts

### Do
- Use Bee Ink #21200b as the default text, border, and dark-surface color.
- Use Pioneer Yellow #ffd900 as a large color-block surface and as text or marks on Bee Ink #21200b surfaces.
- Set hero display type in Fff Acidgrotesk 700 at 96px with -3.19px letter-spacing and 1.0 line-height.
- Set explanatory copy in Inter Variable 400 at 16px with 1.8 line-height and -0.48px tracking.
- Clip photo frames and feature cards to a 38.325px radius with no box shadow.
- Use 1px solid Bee Ink #21200b rules for accordion rows and outlined controls.
- Build local spacing with 16px gaps and use 40px section gaps.

### Don't
- Do not replace Pioneer Yellow #ffd900 with a muted gold, amber, or gradient.
- Do not use drop shadows to elevate cards; Putty #e5e0dd, Lavender Memory #d2c4ff, and Ink cards stay flat.
- Do not use small-radius rectangles for primary cards or media; use 38.325px.
- Do not use a filled yellow primary button; the supported filled control is Bee Ink #21200b with Pioneer Yellow #ffd900 text.
- Do not set long paragraphs in Fff Acidgrotesk; use Inter Variable 400 at 16px/1.8.
- Do not use white body text on Paper #f7f3f1, Putty #e5e0dd, or Pioneer Yellow #ffd900 surfaces.
- Do not introduce blue, pink, or green interface accents alongside the yellow, lavender, putty, and ink palette.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Paper Canvas | `#f7f3f1` | Light page fields and outlined-control fill. |
| 1 | Putty Panel | `#e5e0dd` | Primary warm-gray card and product-stage surface. |
| 2 | Lavender Memory Panel | `#d2c4ff` | Accent feature-card surface. |
| 3 | Bee Ink Panel | `#21200b` | Dark media, footer, and filled-control surface. |
| 4 | True Black Panel | `#000000` | Deepest occasional media-card surface. |

## Elevation

Avoid elevation effects entirely: cards, photo frames, and purchase surfaces differentiate through oversized 38.325px clipping, warm surface changes, and product imagery rather than box shadows.

## Imagery

Photography is the primary visual material: warm, sunlit, close-cropped scenes of people wearing or handling the black wrist device, with skin, fabric, food, and domestic surroundings filling the frame. Images are contained in very large rounded rectangles and often paired directly with a solid yellow text panel. Product imagery is a dark, studio-like render on pale neutral ground, oversized and cropped so the hardware feels physical. Icons are sparse, compact, and predominantly monochrome or Pioneer Yellow; visuals occupy as much or more area than text in major sections.

## Layout

The page is an editorial sequence of wide rounded modules inside a lightly framed canvas, with a compact top header and a persistent full-width announcement strip near the viewport bottom. The opening screen is a full-bleed lifestyle-photo hero with oversized white display type anchored low and a compact dark video overlay near the upper-right. Follow it with a split yellow-copy/photography composition, then a long run of large product and feature cards in Putty, Lavender Memory, Bee Ink, and black; the purchase section returns to a centered pale product stage with a large wearable render. Content is spacious rather than dense, using large image fields, centered purchase information, and stacked feature areas rather than tightly packed grids.

## Agent Prompt Guide

Quick Color Reference:
- Bee Ink: #21200b — Headlines, body text, hairline borders, dark surface panels, and outlined action borders
- Pioneer Yellow: #ffd900 — Navigation links, icon marks, colored content fields, and dark-surface button text — vivid yellow makes the near-black/yellow pairing unmistakably Bee
- Lavender Memory: #d2c4ff — Feature-card surfaces and occasional supporting text treatment; this cool interruption prevents the yellow-and-ink system from becoming monochrome
- Putty: #e5e0dd — Large card surfaces and the dominant warm-gray page canvas
- Paper: #f7f3f1 — Light card surfaces and filled light outlined-action backgrounds
- True Black: #000000 — Occasional deepest media or card surface
- White: #ffffff — Hero text over photography and the lightest canvas surface
- Recruiter Indigo: #150a45 — Full-width recruitment and announcement strip behind white text

Create a rounded lifestyle hero with a warm close-up wrist-wear photograph, White text, and an Fff Acidgrotesk 700 display at 96px/96px with -3.19px tracking; clip the image at 38.325px.
Create a split feature module with a Pioneer Yellow #ffd900 text field and a warm wearable photograph; use a Bee Ink #21200b Fff Acidgrotesk 700 headline at 59px/70.5px and Inter Variable 400 body copy at 16px/28.7px.
Create a centered purchase stage on Paper #f7f3f1 with a Bee Ink #21200b Fff Acidgrotesk 700 heading at 48px/57.5px, a large cropped black wearable render, and an Ink Order Pill with Pioneer Yellow text.
Create a flat Lavender Memory #d2c4ff feature card with 38.325px corners, Bee Ink text, no shadow, and a 19px Fff Acidgrotesk 500 feature heading.
Create a full-width Recruiter Indigo #150a45 announcement strip with White Inter Variable 400 text at 19px and a white destination link.

## Similar Brands

- **Humane** — Wearable-AI hardware presented through intimate human-use photography and oversized product storytelling.
- **Nothing** — Consumer electronics language built from stark hardware close-ups, restrained palette blocks, and compact geometric controls.
- **Teenage Engineering** — Product pages treat hardware as an editorial object, using oversized type and deliberately sparse color fields.
- **Rabbit** — AI device marketing that combines playful saturated color surfaces with large, direct typographic statements.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-bee-ink: #21200b;
  --color-pioneer-yellow: #ffd900;
  --color-lavender-memory: #d2c4ff;
  --color-putty: #e5e0dd;
  --color-paper: #f7f3f1;
  --color-true-black: #000000;
  --color-white: #ffffff;
  --color-recruiter-indigo: #150a45;

  /* Typography — Font Families */
  --font-fff-acidgrotesk: 'Fff Acidgrotesk', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-inter-variable: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-footer-nav: 13px;
  --leading-footer-nav: 1.5;
  --tracking-footer-nav: -0.39px;
  --text-body: 16px;
  --leading-body: 1.8;
  --tracking-body: -0.48px;
  --text-section-label: 19px;
  --leading-section-label: 1.2;
  --tracking-section-label: 0px;
  --text-feature-heading: 19px;
  --leading-feature-heading: 1.4;
  --tracking-feature-heading: -0.19px;
  --text-section-heading: 48px;
  --leading-section-heading: 1.2;
  --tracking-section-heading: 0px;
  --text-editorial-heading: 59px;
  --leading-editorial-heading: 1.2;
  --tracking-editorial-heading: 0px;
  --text-hero-display: 96px;
  --leading-hero-display: 1;
  --tracking-hero-display: -3.168px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;

  /* Layout */
  --section-gap: 40px;
  --card-padding: 16px;
  --element-gap: 16px;

  /* Border Radius */
  --radius-3xl: 24px;
  --radius-3xl-2: 31.9375px;
  --radius-3xl-3: 38.325px;
  --radius-full: 100px;
  --radius-full-2: 1440px;
  --radius-full-3: 9999px;

  /* Named Radii */
  --radius-cards: 38.325px;
  --radius-links: 24px;
  --radius-pills: 1440px;
  --radius-badges: 9999px;
  --radius-images: 38.325px;
  --radius-inputs: 38.325px;
  --radius-buttons: 38.325px;
  --radius-darkbuttons: 100px;

  /* Surfaces */
  --surface-paper-canvas: #f7f3f1;
  --surface-putty-panel: #e5e0dd;
  --surface-lavender-memory-panel: #d2c4ff;
  --surface-bee-ink-panel: #21200b;
  --surface-true-black-panel: #000000;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-bee-ink: #21200b;
  --color-pioneer-yellow: #ffd900;
  --color-lavender-memory: #d2c4ff;
  --color-putty: #e5e0dd;
  --color-paper: #f7f3f1;
  --color-true-black: #000000;
  --color-white: #ffffff;
  --color-recruiter-indigo: #150a45;

  /* Typography */
  --font-fff-acidgrotesk: 'Fff Acidgrotesk', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-inter-variable: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-footer-nav: 13px;
  --leading-footer-nav: 1.5;
  --tracking-footer-nav: -0.39px;
  --text-body: 16px;
  --leading-body: 1.8;
  --tracking-body: -0.48px;
  --text-section-label: 19px;
  --leading-section-label: 1.2;
  --tracking-section-label: 0px;
  --text-feature-heading: 19px;
  --leading-feature-heading: 1.4;
  --tracking-feature-heading: -0.19px;
  --text-section-heading: 48px;
  --leading-section-heading: 1.2;
  --tracking-section-heading: 0px;
  --text-editorial-heading: 59px;
  --leading-editorial-heading: 1.2;
  --tracking-editorial-heading: 0px;
  --text-hero-display: 96px;
  --leading-hero-display: 1;
  --tracking-hero-display: -3.168px;

  /* Spacing */
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;

  /* Border Radius */
  --radius-3xl: 24px;
  --radius-3xl-2: 31.9375px;
  --radius-3xl-3: 38.325px;
  --radius-full: 100px;
  --radius-full-2: 1440px;
  --radius-full-3: 9999px;
}
```
