# AXEL ARIGATO — Style Reference
> AXEL ARIGATO — candid city contact sheet. Build pages as a sequence of white editorial margins and tightly cropped, socially charged fashion photography, punctuated by compact black labels.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

AXEL ARIGATO uses a gallery-like commerce language: black Helvetica Now labels on a white field, documentary street photography in broad edge-to-edge image modules, and almost no decorative interface treatment. The page feels editorial rather than promotional; navigation, utility controls, and calls to explore are reduced to compact uppercase text and small icon marks. A pale butter-yellow surface interrupts the white canvas in service and footer areas, while square corners and hairline rules keep the interface deliberately architectural.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Gallery White | `#ffffff` | `--color-gallery-white` | Page backgrounds, header surfaces, navigation fields, and editorial whitespace |
| Ink Black | `#000000` | `--color-ink-black` | Primary text, logo marks, icon fills, and transparent-control text |
| Near-Black | `#090909` | `--color-near-black` | Navigation text, links, input text, and fine dark rules |
| Rule Gray | `#e9e9e9` | `--color-rule-gray` | 1px dividers, quiet section boundaries, and image-grid separation |
| Studio Gray | `#f3f3f3` | `--color-studio-gray` | Image loading fields and input surfaces |
| Inactive Gray | `#aaaaaa` | `--color-inactive-gray` | Inactive navigation and disabled text |
| Butter Ticket | `#faedbc` | `--color-butter-ticket` | Footer and service-information surfaces; the muted yellow reads as a printed event ticket against the monochrome interface |

## Tokens — Typography

### HelveticaNowVar — The complete interface voice: 520 for navigation, utility links, controls, and uppercase discovery labels; 470 for quieter editorial or descriptive copy. The fixed 13px scale makes the photography—not oversized type—the dominant visual material. · `--font-helveticanowvar`
- **Substitute:** Helvetica Neue, Arial, sans-serif
- **Weights:** 470, 520
- **Sizes:** 13px
- **Line height:** 15.6px, 18.2px, 19.5px, 24.05px
- **Letter spacing:** 0px at 13px
- **Role:** The complete interface voice: 520 for navigation, utility links, controls, and uppercase discovery labels; 470 for quieter editorial or descriptive copy. The fixed 13px scale makes the photography—not oversized type—the dominant visual material.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| nav | HelveticaNowVar | 520 | 13px | 1.5 | 0px | `--text-nav` |
| utility-uppercase | HelveticaNowVar | 520 | 13px | 1.5 | 0px | `--text-utility-uppercase` |
| compact-discovery-link | HelveticaNowVar | 520 | 13px | 1.2 | 0px | `--text-compact-discovery-link` |
| editorial-label | HelveticaNowVar | 470 | 13px | 1.4 | 0px | `--text-editorial-label` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |

### Border Radius

| Element | Value |
|---------|-------|
| links | 0px |
| pills | 9999px |
| images | 0px |
| inputs | 0px |
| buttons | 0px |

### Layout

- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 16px

## Components

### Delivery Announcement Strip
**Role:** A compact, full-width service message above the primary header.

Use a #faedbc background with 13px/520 HelveticaNowVar uppercase #090909 text. Keep the strip flat, square-cornered, and separated from surrounding content without a shadow.

### Wordmark Header
**Role:** Primary site header carrying the black wordmark and category navigation.

Place the #000000 wordmark on #ffffff with 13px/520 HelveticaNowVar navigation labels. Use 16px horizontal internal spacing, 8px vertical spacing, square edges, and no elevation.

### Category Navigation Label
**Role:** Text-only category control for top-level collections.

Set at 13px/520 HelveticaNowVar, #090909, with 19.5px line-height and no letter spacing. Keep the control background transparent, borderless, radius 0px, and padded only through its surrounding 16px layout gap.

### Inactive Category Navigation Label
**Role:** Muted alternative for an unselected or unavailable category.

Match the 13px/520 HelveticaNowVar category treatment but use #aaaaaa text. Keep a transparent background, #aaaaaa text/border state, 0px radius, and no filled hover treatment.

### Utility Navigation Link
**Role:** Help, search, account, and regional utility navigation.

Use uppercase 13px/520 HelveticaNowVar in #090909 with 19.5px line-height. Controls are transparent, borderless, square, and separated by 6px to 16px gaps rather than contained button fills.

### Icon Utility Control
**Role:** Compact cart, favorite, and account icon control.

Use a #000000 or #090909 filled icon on transparent #ffffff, with no visible border and 0px radius. Maintain 4px to 6px gaps between icon and adjacent count or label.

### Location Editorial Label
**Role:** Two-line location or campaign identifier positioned above an image story.

Use 13px/470 HelveticaNowVar in #090909 with 18.2px line-height, aligned to the page’s 16px side inset. Keep the label unboxed on #ffffff.

### Editorial Image Triptych
**Role:** Three-up campaign photography module.

Use three tall, tightly cropped photographic panels on #f3f3f3 image surfaces, separated by 20px gutters. Images have 0px radius, no shadow, and consume substantially more visual area than their surrounding text labels.

### Discovery Text Link
**Role:** Low-chrome editorial route beneath a visual story.

Render as uppercase #090909 text in 13px/520 HelveticaNowVar with 15.6px line-height. Pair it with a minimal black directional glyph, retain a transparent background, 0px radius, and use 4px icon-to-label spacing.

### Search Input
**Role:** Inline search field within the navigation layer.

Use #f3f3f3 background, #090909 text, and a 1px solid #6b7280 border. Set padding to 8px 12px 8px 16px, radius 0px, and 13px/520 HelveticaNowVar with 24.05px line-height.

### Floating Chat Launcher
**Role:** Persistent support entry point.

Use the lone 9999px-radius treatment as a compact floating pill/circle with a #ffffff surface and #000000 chat icon. Keep it visually isolated at the viewport corner; do not square this control or turn it into a text-heavy banner.

### Butter Footer Band
**Role:** Service, policy, and secondary navigation container.

Set the footer on #faedbc with #000000 text and 13px HelveticaNowVar labels. Use 32px internal group gaps, 40px separation between list groups, square content modules, and no drop shadows.

## Do's and Don'ts

### Do
- Use Gallery White #ffffff as the default page canvas and reserve Butter Ticket #faedbc for footer and service bands.
- Set navigation, utility links, and discovery labels in HelveticaNowVar at 13px weight 520 with 0px tracking.
- Keep interface controls transparent with 0px radius; use spacing, not filled rectangles, to define their hit areas.
- Use 1px solid Rule Gray #e9e9e9 for structural dividers and quiet image-grid boundaries.
- Apply 16px as the default internal and inter-control gap, with 4px, 8px, 12px, 20px, 24px, 32px, and 40px as supporting increments.
- Keep editorial images square-cornered and separated by 20px when used in multi-column campaign grids.
- Restrict 9999px radius to the Floating Chat Launcher and similarly isolated floating utility affordances.

### Don't
- Do not introduce rounded 4px, 8px, or 12px cards; standard content surfaces use 0px radius.
- Do not use filled black, colored, or gradient buttons for public navigation without evidence of a separate action treatment.
- Do not use #aaaaaa for body copy; reserve it for inactive navigation or disabled controls.
- Do not set interface type larger than the established 13px system merely to manufacture a marketing hierarchy.
- Do not add box shadows to headers, image modules, inputs, or footer containers.
- Do not substitute vivid interface accents for Butter Ticket #faedbc; it is the only recurring chromatic surface.
- Do not use rounded image masks, soft pastel overlays, or decorative background gradients over campaign photography.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Gallery White | `#ffffff` | Primary page, header, navigation, and editorial whitespace. |
| 1 | Studio Gray | `#f3f3f3` | Image loading fields and search input surface. |
| 2 | Butter Ticket | `#faedbc` | Footer and service-information bands. |

## Elevation

Surfaces stay flush and are distinguished by white space, square edges, image boundaries, and 1px #e9e9e9 rules rather than shadow. The only visually detached object is the 9999px floating chat launcher.

## Imagery

Photography is the main storytelling system: candid group portraits and street scenes, tightly cropped in tall rectangular frames with raw square edges. The images are documentary and socially active rather than studio product cutouts, with natural mixed lighting, urban architecture, and muted garment tones. Photography is presented as contained campaign panels in dense multi-column arrangements, not as softly masked decorations. Icons are tiny monochrome black utility marks; their role is navigational, while imagery carries the campaign atmosphere.

## Layout

The page is a full-bleed editorial storefront on a white canvas. A narrow delivery strip sits above a compact two-level header: wordmark and category navigation occupy the upper navigation field, while location/campaign context can sit as a small left-aligned label before the main visual content. The hero and campaign sections prioritize large image-led modules, including a three-column vertical-photo grid with consistent white gutters; minimal discovery links sit beneath imagery rather than overlaying it. Content moves in generous 40px section intervals, with 16px side/control spacing and very little panel framing. The footer shifts to a broad Butter Ticket #faedbc band, while the chat launcher remains as the lone rounded floating element.

## Agent Prompt Guide

Quick Color Reference:
- Gallery White: #ffffff — Page backgrounds, header surfaces, navigation fields, and editorial whitespace
- Ink Black: #000000 — Primary text, logo marks, icon fills, and transparent-control text
- Near-Black: #090909 — Navigation text, links, input text, and fine dark rules
- Rule Gray: #e9e9e9 — 1px dividers, quiet section boundaries, and image-grid separation
- Studio Gray: #f3f3f3 — Image loading fields and input surfaces
- Inactive Gray: #aaaaaa — Inactive navigation and disabled text
- Butter Ticket: #faedbc — Footer and service-information surfaces; the muted yellow reads as a printed event ticket against the monochrome interface

Create a full-bleed three-panel campaign gallery on Gallery White #ffffff: tall square-cornered documentary fashion photographs with 20px gutters, a 13px/470 HelveticaNowVar Near-Black #090909 location label above, and no image shadow.
Create a compact wordmark header on Gallery White #ffffff with #000000 mark treatment, 13px/520 HelveticaNowVar Near-Black #090909 category labels, 16px horizontal spacing, and transparent 0px-radius controls.
Create a Butter Footer Band using Butter Ticket #faedbc, #000000 13px HelveticaNowVar service links, 32px group gaps, 40px list separation, and no cards or elevation.
Create a square-cornered search field with Studio Gray #f3f3f3 fill, 1px solid #6b7280 border, Near-Black #090909 13px/520 HelveticaNowVar text, 8px 12px 8px 16px padding, and 0px radius.
Create a floating support launcher with Gallery White #ffffff surface, #000000 monochrome chat icon, 9999px radius, and no accompanying banner.

## Similar Brands

- **Acne Studios** — Shares sparse black-on-white fashion navigation and editorial photography that carries more hierarchy than oversized display text.
- **A.P.C.** — Shares compact typographic utility navigation, square image treatment, and restrained monochrome commerce surfaces.
- **Our Legacy** — Shares documentary-style fashion imagery arranged as an editorial campaign sequence rather than isolated product cards.
- **COS** — Shares whitespace-led retail layouts, compact sans-serif labels, and image-first collection storytelling.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-gallery-white: #ffffff;
  --color-ink-black: #000000;
  --color-near-black: #090909;
  --color-rule-gray: #e9e9e9;
  --color-studio-gray: #f3f3f3;
  --color-inactive-gray: #aaaaaa;
  --color-butter-ticket: #faedbc;

  /* Typography — Font Families */
  --font-helveticanowvar: 'HelveticaNowVar', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-nav: 13px;
  --leading-nav: 1.5;
  --tracking-nav: 0px;
  --text-utility-uppercase: 13px;
  --leading-utility-uppercase: 1.5;
  --tracking-utility-uppercase: 0px;
  --text-compact-discovery-link: 13px;
  --leading-compact-discovery-link: 1.2;
  --tracking-compact-discovery-link: 0px;
  --text-editorial-label: 13px;
  --leading-editorial-label: 1.4;
  --tracking-editorial-label: 0px;

  /* Typography — Weights */
  --font-weight-w470: 470;
  --font-weight-w520: 520;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;

  /* Layout */
  --section-gap: 40px;
  --card-padding: 16px;
  --element-gap: 16px;

  /* Border Radius */
  --radius-full: 9999px;

  /* Named Radii */
  --radius-links: 0px;
  --radius-pills: 9999px;
  --radius-images: 0px;
  --radius-inputs: 0px;
  --radius-buttons: 0px;

  /* Surfaces */
  --surface-gallery-white: #ffffff;
  --surface-studio-gray: #f3f3f3;
  --surface-butter-ticket: #faedbc;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-gallery-white: #ffffff;
  --color-ink-black: #000000;
  --color-near-black: #090909;
  --color-rule-gray: #e9e9e9;
  --color-studio-gray: #f3f3f3;
  --color-inactive-gray: #aaaaaa;
  --color-butter-ticket: #faedbc;

  /* Typography */
  --font-helveticanowvar: 'HelveticaNowVar', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-nav: 13px;
  --leading-nav: 1.5;
  --tracking-nav: 0px;
  --text-utility-uppercase: 13px;
  --leading-utility-uppercase: 1.5;
  --tracking-utility-uppercase: 0px;
  --text-compact-discovery-link: 13px;
  --leading-compact-discovery-link: 1.2;
  --tracking-compact-discovery-link: 0px;
  --text-editorial-label: 13px;
  --leading-editorial-label: 1.4;
  --tracking-editorial-label: 0px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;

  /* Border Radius */
  --radius-full: 9999px;
}
```
