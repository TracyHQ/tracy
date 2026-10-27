# AZAK — Style Reference
> expedition vehicle in twilight. Build pages as a sequence of stark technical exhibits: black field, pale specification sheet, then a rendered mobility system.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

AZAK — expedition vehicle in twilight. The interface alternates between near-black field sections and an almost-paper-white product stage, using full-bleed engineering imagery as the main visual material rather than decorative UI. FT Aktual at weight 300 keeps large statements quiet and technical, while hairline rules, flush edges, and borderless controls make the page feel like a product dossier rather than a sales landing page. Color is nearly absent from the interface; the ochre wheel hardware and muted blue-green image environments carry the visual warmth.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ultra Light Azak Grey | `#f8f7f3` | `--color-ultra-light-azak-grey` | Light editorial canvas, reversed text, navigation text, feature-tile text, and fine underlines |
| Dark Azak Black | `#121211` | `--color-dark-azak-black` | Primary page field, dark section surface, dark text on the pale product stage, and footer base |
| Medium Azak Grey | `#85837e` | `--color-medium-azak-grey` | Secondary explanatory copy, inactive feature labels, metadata, and legal text |
| Terrain Slate | `#3a4a49` | `--color-terrain-slate` | Contained product-render backdrop and muted dark visual surface |

## Tokens — Typography

### FT Aktual — The sole interface and display family. Weight 300 at 45px/45px carries all large statements with an unusually whisper-light technical tone; 68px/68px identifies product series, while 16px weight 400 carries navigation and body copy. · `--font-ft-aktual`
- **Substitute:** Arial, Helvetica Neue, sans-serif
- **Weights:** 300, 400, 500
- **Sizes:** 10px, 11px, 14px, 16px, 20px, 30px, 45px, 68px
- **Line height:** 1.00, 1.10, 1.20, 1.30, 1.40, 1.59, 1.99
- **Letter spacing:** normal
- **Role:** The sole interface and display family. Weight 300 at 45px/45px carries all large statements with an unusually whisper-light technical tone; 68px/68px identifies product series, while 16px weight 400 carries navigation and body copy.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| microcopy | FT Aktual | 400 | 10px | 1.3 | 0px | `--text-microcopy` |
| caption | FT Aktual | 400 | 14px | 1.3 | 0px | `--text-caption` |
| body | FT Aktual | 400 | 16px | 1.4 | 0px | `--text-body` |
| feature-tile | FT Aktual | 400 | 16px | 1.2 | 0px | `--text-feature-tile` |
| body-strong | FT Aktual | 500 | 16px | 1.4 | 0px | `--text-body-strong` |
| product-support | FT Aktual | 300 | 20px | 3.33 | 0px | `--text-product-support` |
| section-intro | FT Aktual | 300 | 30px | 1.1 | 0px | `--text-section-intro` |
| display | FT Aktual | 300 | 45px | 1 | 0px | `--text-display` |
| product-code | FT Aktual | 300 | 68px | 1 | 0px | `--text-product-code` |

## Tokens — Spacing & Shapes

**Base unit:** 6px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 6 | 6px | `--spacing-6` |
| 18 | 18px | `--spacing-18` |
| 36 | 36px | `--spacing-36` |
| 72 | 72px | `--spacing-72` |
| 144 | 144px | `--spacing-144` |

### Border Radius

| Element | Value |
|---------|-------|
| links | 0px |
| buttons | 0px |

### Layout

- **Section gap:** 144px
- **Card padding:** 18px
- **Element gap:** 4px

## Components

### Transparent Site Header
**Role:** Persistent top navigation over a dark hero image.

Use a #121211 header field with #f8f7f3 wordmark and 16px/22.4px FT Aktual weight 400 navigation. Keep links unboxed, with 18px horizontal internal spacing and 4px to 17px local gaps.

### Hero Image Field
**Role:** Full-bleed opening statement over a darkened expedition or vehicle photograph.

Place image content beneath a near-black #121211 veil so #f8f7f3 display text stays dominant. Set the headline in FT Aktual 300, 45px/45px; position a small underlined text link nearby rather than a filled control.

### Underlined Exploration Link
**Role:** Low-weight navigation from hero or editorial content.

Render as #f8f7f3 text on #121211 with no fill, no radius, and a 1px #f8f7f3 bottom rule. Use 3px vertical spacing between the text and underline.

### Split Product Introduction
**Role:** Product reveal pairing a contained render with a pale specification statement.

Divide the section into equal visual halves: a Terrain Slate #3a4a49 render field at left and an Ultra Light Azak Grey #f8f7f3 text field at right. Use Dark Azak Black #121211 for the 30px weight-300 statement and Medium Azak Grey #85837e for its supporting phrase.

### Product Series Marker
**Role:** Oversized product-code treatment within a pale product section.

Set the product identifier in Dark Azak Black #121211 using FT Aktual 300 at 68px/68px. Pair secondary product-status text in 20px weight 300, retaining the sparse pale #f8f7f3 surface.

### Black Editorial Feature Section
**Role:** Long-form engineering proposition with large title and restrained supporting copy.

Use a #121211 full-width field with #f8f7f3 45px/45px weight-300 heading at the upper left. Place 16px/22.4px weight-400 explanatory copy in a separate upper-right column; leave the central field intentionally open.

### Feature Selector Tile
**Role:** Horizontal set of selectable engineering propositions.

Use transparent background, 0px radius, 18px left/right padding, 18px top padding, and 0px bottom padding. Draw a 1px top border in #f8f7f3; set active title and description in #f8f7f3, while inactive tiles use #85837e.

### Feature Tile Copy Stack
**Role:** Two-line label and explanation inside the selector tile.

Set the title in FT Aktual 16px weight 400 and the supporting line below with an 8px internal gap. Keep the stack left aligned and constrain it to the tile column; do not add icon containers or colored state fills.

### Minimal Legal Footer
**Role:** Terminal information strip after the page narrative.

Use Dark Azak Black #121211 with 68px top padding and 30px bottom padding. Set legal and secondary links in Medium Azak Grey #85837e, retaining #f8f7f3 only for priority footer navigation.

## Do's and Don'ts

### Do
- Use #121211 as the dominant field and reserve #f8f7f3 for text, pale product stages, and hairline rules.
- Set principal statements in FT Aktual weight 300 at 45px/45px.
- Use FT Aktual 16px/22.4px weight 400 for global navigation and standard explanatory copy.
- Keep all observed text controls square at 0px radius.
- Build feature-selector tiles with 18px left/right padding, 18px top padding, 0px bottom padding, and a #f8f7f3 top border.
- Use 144px vertical section padding for major narrative transitions and 72px for tighter dark-section spacing.
- Use #85837e only for secondary content on #121211; do not place it as small text on #f8f7f3.

### Don't
- Do not introduce saturated interface accents, gradients, or colored button fills.
- Do not use bold display headings; keep primary display copy at FT Aktual weight 300.
- Do not round buttons, tiles, image frames, tags, or navigation controls beyond the observed 0px radius.
- Do not turn the exploration link into a filled #f8f7f3 button.
- Do not place feature content inside raised cards or add shadowed panels.
- Do not use #85837e as a primary heading or navigation color.
- Do not fill the open central space of dark editorial sections with extra cards, statistics, or ornamental graphics.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Dark Azak Black | `#121211` | Primary page canvas, hero veil, editorial sections, and footer. |
| 1 | Terrain Slate | `#3a4a49` | Product-render field within otherwise dark compositions. |
| 2 | Ultra Light Azak Grey | `#f8f7f3` | Pale product specification stage and high-contrast reversed text. |

## Elevation

Interface layers stay flat: separation comes from full-bleed surface changes, image contrast, and 1px rules rather than box shadows, floating cards, or inset depth.

## Imagery

Imagery is sparse but dominant: full-bleed, dark, low-key field photography establishes the opening atmosphere, while later sections use large contained photorealistic 3D product renders against a muted blue-green ground. The wheel render is treated as an engineering specimen with ample surrounding negative space, not as a floating UI illustration. Photography and renders occupy more visual space than text, but they remain subdued under dark overlays or restrained studio lighting; visible interface iconography is effectively absent.

## Layout

The page is a full-bleed vertical narrative with a compact dark header, then a screen-dominant photographic hero carrying its headline at the lower left. A pale split section follows, with a large contained product render on the left and a generous empty text field on the right; later sections return to near-black editorial bands. Dark sections use asymmetric title-left/support-copy-right placement and large vacant space before a six-column horizontal feature-selector row anchored at the bottom. Navigation is a minimal top bar with a left wordmark and widely separated text links; content is spacious, with major section padding around 144px and no visible card grid or boxed dashboard layout.

## Agent Prompt Guide

Quick Color Reference:
- Ultra Light Azak Grey: #f8f7f3 — Light editorial canvas, reversed text, navigation text, feature-tile text, and fine underlines
- Dark Azak Black: #121211 — Primary page field, dark section surface, dark text on the pale product stage, and footer base
- Medium Azak Grey: #85837e — Secondary explanatory copy, inactive feature labels, metadata, and legal text
- Terrain Slate: #3a4a49 — Contained product-render backdrop and muted dark visual surface

Create a full-bleed dark hero using Dark Azak Black #121211 over a low-key off-road mobility photograph; set the lower-left statement in FT Aktual weight 300, 45px/45px, Ultra Light Azak Grey #f8f7f3, with a #f8f7f3 underlined text link.
Create a split product reveal: Terrain Slate #3a4a49 on the left containing a large photorealistic wheel render, Ultra Light Azak Grey #f8f7f3 on the right with a Dark Azak Black #121211 FT Aktual weight-300 30px statement and Medium Azak Grey #85837e supporting text.
Create a pale product-series panel with a Dark Azak Black #121211 code in FT Aktual weight 300, 68px/68px and a smaller FT Aktual weight-300 20px future-product label.
Create a Dark Azak Black #121211 engineering section with a #f8f7f3 FT Aktual weight-300 45px/45px heading, a small upper-right #f8f7f3 explanatory paragraph, and six transparent 0px-radius feature tiles aligned along the bottom with #f8f7f3 top rules.
Create a feature tile with 18px horizontal and 18px top padding, 0px bottom padding, a 1px Ultra Light Azak Grey #f8f7f3 top border, and FT Aktual 16px weight-400 copy; use Medium Azak Grey #85837e for inactive tiles.

## Similar Brands

- **Rivian** — Shares dark, terrain-led automotive imagery and restrained large type that lets vehicle hardware carry the color.
- **Canoo** — Shares an industrial mobility focus, expansive product-render staging, and sparse technical presentation.
- **Polestar** — Shares pale product-specification stages, low-weight sans display typography, and minimal navigation.
- **Nothing** — Shares the use of empty space, unboxed text controls, and product-as-specimen composition rather than conventional card UI.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-ultra-light-azak-grey: #f8f7f3;
  --color-dark-azak-black: #121211;
  --color-medium-azak-grey: #85837e;
  --color-terrain-slate: #3a4a49;

  /* Typography — Font Families */
  --font-ft-aktual: 'FT Aktual', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-microcopy: 10px;
  --leading-microcopy: 1.3;
  --tracking-microcopy: 0px;
  --text-caption: 14px;
  --leading-caption: 1.3;
  --tracking-caption: 0px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-feature-tile: 16px;
  --leading-feature-tile: 1.2;
  --tracking-feature-tile: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.4;
  --tracking-body-strong: 0px;
  --text-product-support: 20px;
  --leading-product-support: 3.33;
  --tracking-product-support: 0px;
  --text-section-intro: 30px;
  --leading-section-intro: 1.1;
  --tracking-section-intro: 0px;
  --text-display: 45px;
  --leading-display: 1;
  --tracking-display: 0px;
  --text-product-code: 68px;
  --leading-product-code: 1;
  --tracking-product-code: 0px;

  /* Typography — Weights */
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Spacing */
  --spacing-unit: 6px;
  --spacing-6: 6px;
  --spacing-18: 18px;
  --spacing-36: 36px;
  --spacing-72: 72px;
  --spacing-144: 144px;

  /* Layout */
  --section-gap: 144px;
  --card-padding: 18px;
  --element-gap: 4px;

  /* Named Radii */
  --radius-links: 0px;
  --radius-buttons: 0px;

  /* Surfaces */
  --surface-dark-azak-black: #121211;
  --surface-terrain-slate: #3a4a49;
  --surface-ultra-light-azak-grey: #f8f7f3;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-ultra-light-azak-grey: #f8f7f3;
  --color-dark-azak-black: #121211;
  --color-medium-azak-grey: #85837e;
  --color-terrain-slate: #3a4a49;

  /* Typography */
  --font-ft-aktual: 'FT Aktual', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-microcopy: 10px;
  --leading-microcopy: 1.3;
  --tracking-microcopy: 0px;
  --text-caption: 14px;
  --leading-caption: 1.3;
  --tracking-caption: 0px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-feature-tile: 16px;
  --leading-feature-tile: 1.2;
  --tracking-feature-tile: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.4;
  --tracking-body-strong: 0px;
  --text-product-support: 20px;
  --leading-product-support: 3.33;
  --tracking-product-support: 0px;
  --text-section-intro: 30px;
  --leading-section-intro: 1.1;
  --tracking-section-intro: 0px;
  --text-display: 45px;
  --leading-display: 1;
  --tracking-display: 0px;
  --text-product-code: 68px;
  --leading-product-code: 1;
  --tracking-product-code: 0px;

  /* Spacing */
  --spacing-6: 6px;
  --spacing-18: 18px;
  --spacing-36: 36px;
  --spacing-72: 72px;
  --spacing-144: 144px;
}
```
