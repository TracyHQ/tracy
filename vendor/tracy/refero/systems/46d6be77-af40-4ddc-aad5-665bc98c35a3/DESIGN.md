# AYOCIN — Style Reference
> Sunlit wellness totem. Build screens like a warm interior photograph: monumental type, softly blurred architectural shadows, and a single glowing object held inside quiet cream space.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

AYOCIN stages wellness technology as a large, sculptural home object under soft natural light. Full-bleed cream, clay, and pale-yellow surfaces carry dark espresso typography, while the illuminated product becomes the visual center rather than a supporting image. Oversized compressed-looking display type and tiny utility labels create a deliberate scale contrast; pill controls, hairline dividers, and unshadowed cards keep the interface tactile but planar.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Porcelain Cream | `#fcf6ec` | `--color-porcelain-cream` | Primary canvas, light cards, light-button fill, and text on espresso surfaces |
| Espresso Ink | `#2e2521` | `--color-espresso-ink` | Primary text, dark page bands, dark filled buttons, input rules, and dark card surfaces |
| Parchment Border | `#d3ccc3` | `--color-parchment-border` | Hairline borders and restrained separators on light surfaces |
| Stone Haze | `#cec1b2` | `--color-stone-haze` | Hero backdrop and muted architectural surface behind warm product imagery |
| Ivory Sand | `#f4e8d7` | `--color-ivory-sand` | Warm secondary surface, circular control fill, and contained graphic fields |
| Daylight Wash | `#fdf0c7` | `--color-daylight-wash` | Pale yellow feature-section background; it introduces the impression of natural daylight without becoming an interface accent |
| Peach Wash | `#fdc6b3` | `--color-peach-wash` | Muted warm section background for alternating editorial moments |
| Sunlit Stone Gradient | `linear-gradient(266.47deg, #c4b3a3 41.41%, #9f8e7a 97.58%)` | `--color-sunlit-stone-gradient` | Soft atmospheric background gradient for warm product and architectural scenes |

## Tokens — Typography

### Systemia — Primary interface and display family: 12-14px handles navigation, labels, forms, and buttons; 36px and 60px hold section headings; 170px and 240px create wall-scale editorial statements. The consistent medium 500 weight avoids heavy headline typography, letting scale rather than boldness carry the product’s presence. · `--font-systemia`
- **Substitute:** Manrope
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 36px, 60px, 170px, 240px
- **Line height:** 0.80, 0.90, 1.00, 1.20, 1.40
- **Letter spacing:** -13.6px at 170px for compressed display numerals; -0.03em on selected oversized Systemia display settings
- **Role:** Primary interface and display family: 12-14px handles navigation, labels, forms, and buttons; 36px and 60px hold section headings; 170px and 240px create wall-scale editorial statements. The consistent medium 500 weight avoids heavy headline typography, letting scale rather than boldness carry the product’s presence.

### Azeret Mono — Use only for oversized numerical statements beside Systemia punctuation or labels. Its -13.6px tracking makes numbers read as engineered measurements rather than conventional marketing statistics. · `--font-azeret-mono`
- **Substitute:** Azeret Mono
- **Weights:** 500
- **Sizes:** 170px
- **Line height:** 0.90
- **Letter spacing:** -13.6px at 170px
- **Role:** Use only for oversized numerical statements beside Systemia punctuation or labels. Its -13.6px tracking makes numbers read as engineered measurements rather than conventional marketing statistics.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| caption | Systemia | 400 | 12px | 1.4 | 0px | `--text-caption` |
| body | Systemia | 400 | 14px | 1.4 | 0px | `--text-body` |
| nav | Systemia | 500 | 14px | 1.2 | 0px | `--text-nav` |
| button | Systemia | 500 | 14px | 1 | 0px | `--text-button` |
| heading | Systemia | 500 | 36px | 1 | 0px | `--text-heading` |
| display | Systemia | 500 | 60px | 1 | 0px | `--text-display` |
| metric-display | Azeret Mono | 500 | 170px | 0.9 | -13.6px | `--text-metric-display` |
| masthead-display | Systemia | 500 | 240px | 0.8 | 0px | `--text-masthead-display` |

## Tokens — Spacing & Shapes

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 5 | 5px | `--spacing-5` |
| 8 | 8px | `--spacing-8` |
| 9 | 9px | `--spacing-9` |
| 10 | 10px | `--spacing-10` |
| 12 | 12px | `--spacing-12` |
| 14 | 14px | `--spacing-14` |
| 15 | 15px | `--spacing-15` |
| 18 | 18px | `--spacing-18` |
| 20 | 20px | `--spacing-20` |
| 30 | 30px | `--spacing-30` |
| 35 | 35px | `--spacing-35` |
| 40 | 40px | `--spacing-40` |
| 50 | 50px | `--spacing-50` |
| 60 | 60px | `--spacing-60` |
| 100 | 100px | `--spacing-100` |
| 120 | 120px | `--spacing-120` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 10px |
| pills | 9999px |
| inputs | 0px |
| buttons | 20px |
| circularControls | 100% |
| decorativeCapsules | 500px |

### Layout

- **Section gap:** 30px
- **Card padding:** 20px
- **Element gap:** 20px

## Components

### Transparent Hero Header
**Role:** Public navigation over the full-bleed hero

Set navigation in Porcelain Cream #fcf6ec using Systemia 14px/16.8px weight 500. Use transparent fill with thin low-opacity cream separator rules; keep the header integrated with the hero image rather than placing it on an opaque bar.

### Espresso Order Pill
**Role:** Dark filled conversion button on light or image-led surfaces

Use Espresso Ink #2e2521 fill with Porcelain Cream #fcf6ec text and a 1px Porcelain Cream border. Set Systemia 14px/14px weight 500, 20px radius, and padding 10px 60px 10px 20px; reserve the extended right padding for an arrow icon.

### Porcelain Order Pill
**Role:** Light filled conversion button for dark surfaces

Use Porcelain Cream #fcf6ec fill with Espresso Ink #2e2521 text and a 1px Espresso Ink border. Set Systemia 14px/14px weight 500, 20px radius, and padding 10px 60px 10px 20px with an arrow placed in the right-side pocket.

### Transparent Feature Tab
**Role:** Low-emphasis feature selector on dark imagery

Use a transparent background, Porcelain Cream #fcf6ec Systemia 14px/19.6px weight 400 text, a 1px rgba(252, 246, 236, 0.1) border, 0px radius, and padding 10px 20px.

### Ivory Circular Carousel Control
**Role:** Previous and next control

Use Ivory Sand #f4e8d7 fill, Espresso Ink #2e2521 iconography, an Espresso Ink border, 100% radius, and zero internal padding. Keep the control icon-only and circular.

### Translucent Feature Card
**Role:** Quiet overlay or feature container on warm image-led sections

Use rgba(178, 162, 139, 0.1) fill, no shadow, 10px radius, and zero padding. Let internal content establish its own 20px inset rather than making this decorative container visibly padded.

### Porcelain Content Card
**Role:** Light contained content block

Use Porcelain Cream #fcf6ec fill, 10px radius, no shadow, and 10px padding. Place against Stone Haze #cec1b2, Daylight Wash #fdf0c7, or Peach Wash #fdc6b3 fields.

### Espresso Content Card
**Role:** Dark contained feature block

Use #2c2722 fill, 10px radius, zero shadow, and zero outer padding. Set any internal text in Porcelain Cream #fcf6ec.

### Espresso Underline Input
**Role:** Form field on light surfaces

Use transparent fill, Espresso Ink #2e2521 text, a 1px Espresso Ink underline or border, and 0px radius with no built-in padding. Keep form geometry flat and typographic.

### Cream Underline Input
**Role:** Form field on dark surfaces

Use transparent fill, Porcelain Cream #fcf6ec text, a 1px rgba(252, 247, 237, 0.1) underline or border, 0px radius, and vertical padding 10px. Keep placeholder text in the same cream family at reduced opacity.

### Feature Heading
**Role:** Section-level feature title

Set in Systemia 36px/36px weight 500, normally tracked, in Porcelain Cream #fcf6ec on dark or image-led panels. Keep headings compact and do not add bold weights.

### Monospaced Metric Display
**Role:** Large numerical feature callout

Set numbers in Azeret Mono 170px/153px weight 500 with -13.6px tracking and Porcelain Cream #fcf6ec. Pair punctuation in Systemia 170px/153px weight 500 so the numeral remains visibly technical while punctuation stays typographic.

## Do's and Don'ts

### Do
- Use Porcelain Cream #fcf6ec as the default page canvas and Espresso Ink #2e2521 as the default text color.
- Set navigation and compact labels in Systemia 14px weight 500; use Systemia 14px/19.6px weight 400 for longer control labels.
- Use Systemia 36px/36px weight 500 for feature headings and reserve 170px or 240px display settings for isolated editorial statements.
- Build filled conversion buttons as 20px-radius pills with padding 10px 60px 10px 20px.
- Use 10px radius and no box-shadow for cards; use 0px radius for inputs and feature tabs.
- Separate small interface groups with 20px gaps and use 30px section spacing where sections meet.
- Place #fdf0c7 and #fdc6b3 in broad background bands, not as small badges, status colors, or button accents.

### Don't
- Do not use black #000000 as a primary interface color; use Espresso Ink #2e2521 for text, rules, and dark fills.
- Do not introduce blue, green, red, or high-chroma status accents; the interface palette remains cream, espresso, stone, yellow, and peach.
- Do not add drop shadows to cards, buttons, or panels; cards remain flat against their warm surface fields.
- Do not round text inputs, tabs, or underlined fields beyond their specified 0px radius.
- Do not use 9999px pills for content cards; reserve 9999px for compact pills and tags, and 20px for conversion buttons.
- Do not set Systemia display copy above weight 500 or substitute bold headings for the 170px and 240px scale shifts.
- Do not use the Sunlit Stone Gradient on every section; limit it to atmospheric image or product-stage backgrounds.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Porcelain Canvas | `#fcf6ec` | Default page background and light content surface. |
| 1 | Daylight Field | `#fdf0c7` | Pale warm section band. |
| 2 | Ivory Sand Surface | `#f4e8d7` | Secondary warm component and graphic surface. |
| 3 | Peach Field | `#fdc6b3` | Alternating warm editorial section. |
| 4 | Espresso Surface | `#2e2521` | Dark section, card, and inversion surface. |

## Elevation

Elevation is created by tonal fields, product photography, translucent overlays, blur, and 1px rules rather than box shadows. Keep cards flat; use backdrop blur of 8px or 16px only for translucent overlays, and reserve 70px-80px blur for atmospheric background light or shadow forms.

## Imagery

Imagery is product-first and atmospheric: a tall furniture-like air-and-light object is photographed or rendered at close range, with warm internal yellow illumination, dark wood edges, and visibly tactile material detail. Product scenes occupy large full-bleed fields with soft blurred architectural shadows rather than lifestyle rooms or busy contextual photography. The visual is often centered beneath oversized type, with the object allowed to overlap typographic scale and divider lines. Icons are small, thin, monochrome cream or espresso utility marks; they explain features without competing with the product. The page is image-led at major moments, but each image is given abundant empty space and sparse technical annotation.

## Layout

The page is a full-bleed editorial product narrative rather than a constrained application shell. The opening screen layers a transparent top navigation over a warm architectural hero: an oversized wordmark-scale display title spans nearly the full composition, small utility copy sits on divider lines, and a tall glowing product render anchors the center. The main narrative extends through 16 sections, using broad cream, espresso, pale-yellow, peach, and stone surface changes as sectional boundaries; content alternates between monumental statements, product-focused feature modules, and contained cards. Navigation remains a minimal horizontal top bar, with a pill conversion control at the far edge. The rhythm is comfortable and cinematic, using sparse microcopy around large product imagery instead of dense multi-column interface grids.

## Agent Prompt Guide

Quick Color Reference:
- Porcelain Cream: #fcf6ec — Primary canvas, light cards, light-button fill, and text on espresso surfaces
- Espresso Ink: #2e2521 — Primary text, dark page bands, dark filled buttons, input rules, and dark card surfaces
- Parchment Border: #d3ccc3 — Hairline borders and restrained separators on light surfaces
- Stone Haze: #cec1b2 — Hero backdrop and muted architectural surface behind warm product imagery
- Ivory Sand: #f4e8d7 — Warm secondary surface, circular control fill, and contained graphic fields
- Daylight Wash: #fdf0c7 — Pale yellow feature-section background; it introduces the impression of natural daylight without becoming an interface accent
- Peach Wash: #fdc6b3 — Muted warm section background for alternating editorial moments
- Sunlit Stone Gradient: linear-gradient(266.47deg, #c4b3a3 41.41%, #9f8e7a 97.58%) — Soft atmospheric background gradient for warm product and architectural scenes

Create a full-bleed Stone Haze #cec1b2 product hero with soft architectural shadow blur, a centered tall illuminated product render, transparent top navigation in Porcelain Cream #fcf6ec Systemia 14px/16.8px weight 500, and an Espresso Order Pill.
Create a dark Espresso Ink #2e2521 feature panel with a Porcelain Cream #fcf6ec Systemia 36px/36px weight 500 heading, a three-item transparent feature-tab row, and no card shadows.
Create a pale Daylight Wash #fdf0c7 metric section with an Azeret Mono 170px/153px weight 500 numeral tracked -13.6px, Systemia punctuation at 170px/153px, and restrained Espresso Ink #2e2521 supporting copy.
Create a Peach Wash #fdc6b3 editorial section with a Porcelain Content Card in #fcf6ec, 10px radius, 10px padding, and a Porcelain Order Pill using Espresso Ink #2e2521 text.
Create a dark signup block with a Cream Underline Input: transparent fill, Porcelain Cream #fcf6ec 14px/19.6px Systemia text, 1px rgba(252, 247, 237, 0.1) rule, and 0px radius.

## Similar Brands

- **Aesop** — Shares the restrained warm-neutral palette, editorial whitespace, and product-as-object composition.
- **Teenage Engineering** — Shares oversized technical typography, sparse interface annotation, and hardware presented as a cultural object.
- **Bang & Olufsen** — Shares large-scale product imagery, muted material colors, and luxury-object staging with minimal controls.
- **Dyson** — Shares product-led health technology storytelling and feature communication through isolated hardware visuals.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-porcelain-cream: #fcf6ec;
  --color-espresso-ink: #2e2521;
  --color-parchment-border: #d3ccc3;
  --color-stone-haze: #cec1b2;
  --color-ivory-sand: #f4e8d7;
  --color-daylight-wash: #fdf0c7;
  --color-peach-wash: #fdc6b3;
  --color-sunlit-stone-gradient: #c4b3a3;
  --gradient-sunlit-stone-gradient: linear-gradient(266.47deg, #c4b3a3 41.41%, #9f8e7a 97.58%);

  /* Typography — Font Families */
  --font-systemia: 'Systemia', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-azeret-mono: 'Azeret Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.4;
  --tracking-caption: 0px;
  --text-body: 14px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-nav: 14px;
  --leading-nav: 1.2;
  --tracking-nav: 0px;
  --text-button: 14px;
  --leading-button: 1;
  --tracking-button: 0px;
  --text-heading: 36px;
  --leading-heading: 1;
  --tracking-heading: 0px;
  --text-display: 60px;
  --leading-display: 1;
  --tracking-display: 0px;
  --text-metric-display: 170px;
  --leading-metric-display: 0.9;
  --tracking-metric-display: -13.6px;
  --text-masthead-display: 240px;
  --leading-masthead-display: 0.8;
  --tracking-masthead-display: 0px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Spacing */
  --spacing-5: 5px;
  --spacing-8: 8px;
  --spacing-9: 9px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-15: 15px;
  --spacing-18: 18px;
  --spacing-20: 20px;
  --spacing-30: 30px;
  --spacing-35: 35px;
  --spacing-40: 40px;
  --spacing-50: 50px;
  --spacing-60: 60px;
  --spacing-100: 100px;
  --spacing-120: 120px;

  /* Layout */
  --section-gap: 30px;
  --card-padding: 20px;
  --element-gap: 20px;

  /* Border Radius */
  --radius-lg: 10px;
  --radius-2xl: 20px;
  --radius-full: 500px;
  --radius-full-2: 9999px;

  /* Named Radii */
  --radius-cards: 10px;
  --radius-pills: 9999px;
  --radius-inputs: 0px;
  --radius-buttons: 20px;
  --radius-circularcontrols: 100%;
  --radius-decorativecapsules: 500px;

  /* Surfaces */
  --surface-porcelain-canvas: #fcf6ec;
  --surface-daylight-field: #fdf0c7;
  --surface-ivory-sand-surface: #f4e8d7;
  --surface-peach-field: #fdc6b3;
  --surface-espresso-surface: #2e2521;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-porcelain-cream: #fcf6ec;
  --color-espresso-ink: #2e2521;
  --color-parchment-border: #d3ccc3;
  --color-stone-haze: #cec1b2;
  --color-ivory-sand: #f4e8d7;
  --color-daylight-wash: #fdf0c7;
  --color-peach-wash: #fdc6b3;
  --color-sunlit-stone-gradient: #c4b3a3;

  /* Typography */
  --font-systemia: 'Systemia', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-azeret-mono: 'Azeret Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.4;
  --tracking-caption: 0px;
  --text-body: 14px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-nav: 14px;
  --leading-nav: 1.2;
  --tracking-nav: 0px;
  --text-button: 14px;
  --leading-button: 1;
  --tracking-button: 0px;
  --text-heading: 36px;
  --leading-heading: 1;
  --tracking-heading: 0px;
  --text-display: 60px;
  --leading-display: 1;
  --tracking-display: 0px;
  --text-metric-display: 170px;
  --leading-metric-display: 0.9;
  --tracking-metric-display: -13.6px;
  --text-masthead-display: 240px;
  --leading-masthead-display: 0.8;
  --tracking-masthead-display: 0px;

  /* Spacing */
  --spacing-5: 5px;
  --spacing-8: 8px;
  --spacing-9: 9px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-15: 15px;
  --spacing-18: 18px;
  --spacing-20: 20px;
  --spacing-30: 30px;
  --spacing-35: 35px;
  --spacing-40: 40px;
  --spacing-50: 50px;
  --spacing-60: 60px;
  --spacing-100: 100px;
  --spacing-120: 120px;

  /* Border Radius */
  --radius-lg: 10px;
  --radius-2xl: 20px;
  --radius-full: 500px;
  --radius-full-2: 9999px;
}
```
