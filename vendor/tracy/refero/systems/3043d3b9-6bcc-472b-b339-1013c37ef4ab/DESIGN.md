# Bedouin's Daughter — Style Reference
> Sun flare over black velvet. Use luminous butter yellow, hard black surfaces, and grainy sunlit imagery as equal parts of the visual composition.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bedouin's Daughter - sun flare over black velvet. The system pairs a near-black shop canvas with butter-yellow typography and borders, treating the yellow as a continuous editorial thread rather than a small accent. Large ROM Extended product statements sit beside compact, widely tracked ROM utility labels, while Gaisyr gives section titles and editorial fragments a distinctly literary voice. Product presentation is image-led and edge-to-edge; controls remain spare, outlined, or pill-shaped against the darkness.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Void | `#000000` | `--color-void` | Page canvas, footer backgrounds, and black text on white pill controls |
| Charcoal | `#080808` | `--color-charcoal` | Dark product-link and secondary surface backgrounds |
| Ink | `#111111` | `--color-ink` | Filled add-to-bag controls and raised dark UI surfaces |
| White | `#ffffff` | `--color-white` | Body copy, white outlined actions, and inverted pill action fills |
| Ash | `#999999` | `--color-ash` | Muted supporting body copy |
| Desert Butter | `#f5e78d` | `--color-desert-butter` | Headings, navigation, hairline borders, badges, and editorial links — the warm yellow makes the black interface read like a night-lit printed zine |

## Tokens — Typography

### ROM — Core compact sans for navigation, body copy, buttons, product metadata, links, footer content, and uppercase utility labels. Its small, dense letterforms make the store language feel typographic rather than interface-default. · `--font-rom`
- **Substitute:** Arial, Helvetica, sans-serif
- **Weights:** 400, 700
- **Sizes:** 10px, 12px, 13px, 14px, 24px
- **Line height:** 1.00, 1.20, 1.40
- **Letter spacing:** 0.06em and 0.12em on tracked utility treatments; normal on navigation and controls.
- **Role:** Core compact sans for navigation, body copy, buttons, product metadata, links, footer content, and uppercase utility labels. Its small, dense letterforms make the store language feel typographic rather than interface-default.

### Gaisyr — Editorial serif for yellow section headings, compact quotes, and collection links. The mix of sturdy 700 weight and loose tracking makes short phrases feel like printed pull quotes rather than conventional ecommerce headings. · `--font-gaisyr`
- **Substitute:** Libre Baskerville, Georgia, serif
- **Weights:** 400, 700
- **Sizes:** 10px, 14px, 15px, 16px, 20px
- **Line height:** 1.10, 1.20, 1.40
- **Letter spacing:** 0.04em, 0.06em, 0.12em, 0.18em; 0.06em equals 1.2px at the 20px editorial heading step.
- **Role:** Editorial serif for yellow section headings, compact quotes, and collection links. The mix of sturdy 700 weight and loose tracking makes short phrases feel like printed pull quotes rather than conventional ecommerce headings.

### ABC ROM Extended — Ultra-compact extended sans reserved for the uppercase announcement marquee. · `--font-abc-rom-extended`
- **Substitute:** Arial Narrow, Arial, sans-serif
- **Weights:** 500
- **Sizes:** 10px
- **Line height:** 1.00
- **Letter spacing:** normal
- **Role:** Ultra-compact extended sans reserved for the uppercase announcement marquee.

### ROM Extended — Wide display sans for product-feature names and large promotional statements. The 48px, weight-700 display treatment is the largest measured type and stays blunt, uppercase, and untracked. · `--font-rom-extended`
- **Substitute:** Arial Narrow, Impact, sans-serif
- **Weights:** 400, 700
- **Sizes:** 24px, 48px
- **Line height:** 1.20
- **Letter spacing:** normal
- **Role:** Wide display sans for product-feature names and large promotional statements. The 48px, weight-700 display treatment is the largest measured type and stays blunt, uppercase, and untracked.

### GTStandard-M — One-off long-form supporting text treatment. · `--font-gtstandard-m`
- **Substitute:** Arial, Helvetica, sans-serif
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.50
- **Letter spacing:** normal
- **Role:** One-off long-form supporting text treatment.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| announcement | ABC ROM Extended | 500 | 10px | 1 | 0px | `--text-announcement` |
| button-label | ROM | 700 | 12px | 1 | 0px | `--text-button-label` |
| body | ROM | 400 | 14px | 1.4 | 0px | `--text-body` |
| utility-link | ROM | 400 | 14px | 1.4 | 1.68px | `--text-utility-link` |
| section-kicker | Gaisyr | 700 | 14px | 1.2 | 0px | `--text-section-kicker` |
| editorial-quote | Gaisyr | 700 | 16px | 1.2 | 0px | `--text-editorial-quote` |
| editorial-heading | Gaisyr | 700 | 20px | 1.1 | 1.2px | `--text-editorial-heading` |
| display | ROM Extended | 700 | 48px | 1.2 | 0px | `--text-display` |

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
| 64 | 64px | `--spacing-64` |
| 100 | 100px | `--spacing-100` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 0px |
| links | 0px |
| pills | 100px |
| badges | 2px |
| images | 0px |
| buttons | 20px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `rgb(255, 255, 255) 0px 0px 0px 1px inset` | `--shadow-subtle` |

### Layout

- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 12px

## Components

### Announcement Marquee
**Role:** Full-width shipping or promotional strip above the main navigation.

Use a #000000 bar with repeating #ffffff uppercase ABC ROM Extended text at 10px/500, 10px line height. Keep each message on a single line and animate the horizontal loop over 40s with linear motion.

### Editorial Utility Navigation
**Role:** Top navigation for shop, about, account, and bag controls.

Set navigation labels in ROM 14px/700 with a 19.6px line height and lowercase transformation, colored Desert Butter #f5e78d. Separate the navigation from the hero with a 1px solid #f5e78d rule; use 10px horizontal and 22px vertical padding where a padded nav row is needed.

### Transparent Yellow Navigation Control
**Role:** Account, bag, and compact navigation actions on dark imagery.

Use a transparent background, #f5e78d text and 1px #f5e78d border, 0px radius, and no internal padding. Keep the treatment text-like rather than turning it into a filled button.

### White Outline Pill Link
**Role:** Image-overlay conversion link on dark photography.

Use transparent fill, #ffffff text, and a 1px solid #ffffff border with a 100px radius. Apply 12px vertical and 24px horizontal padding; use ROM 12px/700 uppercase with 12px line height.

### White Filled Pill Link
**Role:** Inverted conversion link placed on dark backgrounds.

Use #ffffff fill with #000000 text and border, a 100px radius, and 12px 24px padding. Set the label in ROM 12px/700 uppercase with a 12px line height.

### Add-to-Bag Button
**Role:** Product purchase control.

Use #111111 fill, #ffffff text, and a 1px solid #ffffff border with 20px radius. Apply 8px vertical and 12px horizontal padding; retain a white 0 0 0 1px inset outline when the component needs an explicit edge.

### Product Tile
**Role:** Borderless commerce card for product image, newness, product name, shade description, price, and purchase control.

Keep the tile transparent with 0px radius, no border, no shadow, and 0px card padding. Place white product copy over or beneath the visual, use a 12px internal rhythm, and keep the add-to-bag control as its own #111111 rounded element.

### New Product Badge
**Role:** Small product-status marker.

Use transparent fill with #f5e78d text and a 1px #f5e78d border, 2px radius, and 6px vertical by 10px horizontal padding. Set ROM at 10px/400, 10px line height, uppercase, with 1.2px tracking.

### Tracked Collection Link
**Role:** Collection navigation and view-all link.

Use transparent fill and #f5e78d text with no radius; set ROM or Gaisyr at 14px/400 with 19.6px line height, uppercase transformation, and 1.68px letter spacing. Add only a text-decoration-color transition rather than a filled hover state.

### Editorial Section Heading
**Role:** Compact label or chapter heading above product and brand content.

Use Desert Butter #f5e78d Gaisyr at 20px/700 with 22px line height; use 1.2px tracking only for highly editorial uppercase labels. Keep the heading short and let the surrounding black space carry the scale.

### Extended Display Statement
**Role:** Large product campaign heading.

Use ROM Extended at 48px/700 with 57.6px line height, uppercase, normal tracking, and #ffffff text on a #080808 or photographic dark field.

## Do's and Don'ts

### Do
- Use #000000 as the default canvas and #080808 only as a distinct dark surface layer.
- Set editorial headings in Desert Butter #f5e78d Gaisyr at 20px/700 and 22px line height.
- Use ROM Extended 48px/700 with 57.6px line height for large uppercase promotional statements.
- Keep standard utility actions in ROM 12px/700 uppercase at a 12px line height.
- Use 100px radius with 12px 24px padding for white or white-outline pill links.
- Use 20px radius with 8px 12px padding for #111111 add-to-bag buttons.
- Maintain a 64px section gap and 12px local component rhythm.

### Don't
- Do not replace Desert Butter #f5e78d with a generic white or neon yellow for headings, navigation, borders, or badges.
- Do not use rounded cards; product tiles use 0px radius, no shadow, and no container padding.
- Do not introduce gradients.
- Do not use soft drop shadows; retain flat black surface separation and occasional 1px rules.
- Do not turn all actions into white filled pills; reserve the white pill treatment for inverted conversion links.
- Do not use a radius between 20px and 100px for buttons.
- Do not set large campaign headings in Gaisyr; use ROM Extended for the 48px display treatment.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Void Canvas | `#000000` | Page background, footer, and deepest full-bleed section field. |
| 1 | Charcoal Surface | `#080808` | Dark link and product surface layer. |
| 2 | Ink Control | `#111111` | Filled purchase controls and raised dark UI. |
| 3 | White Inversion | `#ffffff` | Inverted pill links and light text. |

## Elevation

Surfaces stay flat and photographic. Separate layers with #f5e78d hairlines, tonal shifts from #000000 to #111111, and a single white inset keyline on dark purchase buttons rather than cast shadows.

## Imagery

Photography is the primary visual material: grainy, low-resolution-feeling outdoor lifestyle imagery with a direct sun flare, saturated blue sky, deep shadow, and cropped human presence. Images are full-bleed or occupy wide, raw-edged rectangular fields with no rounding, allowing the butter-yellow wordmark and navigation to sit over them. Product imagery and product tiles carry explanatory commerce content; editorial photography supplies the atmosphere. Icons are minimal and largely text-led, with no illustrated icon system competing against the photography.

## Layout

The page begins with a narrow black announcement marquee, then a transparent or image-overlay utility navigation split between left-side browsing links and right-side account/bag controls. The hero is a full-bleed, sun-drenched photographic field with the oversized butter-yellow wordmark spanning the upper composition; the navigation rule overlays this image rather than sitting in a separate opaque header. Main content flows through dark, image-led product and editorial sections with generous 64px sectional pauses, borderless product tiles, and compact text clusters. Product content uses a repeated commerce grid, while editorial sections use short centered or image-overlaid statements; the footer continues as a deep black band.

## Agent Prompt Guide

Quick Color Reference:
- Void: #000000 — Page canvas, footer backgrounds, and black text on white pill controls
- Charcoal: #080808 — Dark product-link and secondary surface backgrounds
- Ink: #111111 — Filled add-to-bag controls and raised dark UI surfaces
- White: #ffffff — Body copy, white outlined actions, and inverted pill action fills
- Ash: #999999 — Muted supporting body copy
- Desert Butter: #f5e78d — Headings, navigation, hairline borders, badges, and editorial links — the warm yellow makes the black interface read like a night-lit printed zine

Create a full-bleed nocturnal lifestyle-photo hero with a #f5e78d oversized wordmark over the upper image; place a transparent utility nav in ROM 14px/700 and a #f5e78d 1px divider across the frame.
Create a dark product campaign panel on #080808 with a #ffffff ROM Extended 48px/700 uppercase display statement at 57.6px line height and a transparent #ffffff-outline pill link using 12px 24px padding and 100px radius.
Create a borderless product tile with raw-edge product imagery, a transparent #f5e78d NEW badge in ROM 10px/400 with 1.2px tracking, white metadata, and a #111111 add-to-bag button with a white 1px border and 20px radius.
Create an editorial chapter break on #000000 using a short #f5e78d Gaisyr 20px/700 heading at 22px line height, followed by a widely tracked #f5e78d ROM 14px/400 collection link.

## Similar Brands

- **Dazed** — Oversized editorial typography laid over raw, youth-culture photography with little container framing.
- **Eckhaus Latta** — Art-fashion ecommerce treatment using blunt type, dark product fields, and image-led commerce modules.
- **Paloma Wool** — Editorial product storytelling where cropped lifestyle imagery carries as much visual weight as the merchandise.
- **Jil Sander** — Restrained monochrome product presentation and sparse utility navigation, though Bedouin's Daughter replaces cool neutrals with butter yellow.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-void: #000000;
  --color-charcoal: #080808;
  --color-ink: #111111;
  --color-white: #ffffff;
  --color-ash: #999999;
  --color-desert-butter: #f5e78d;

  /* Typography — Font Families */
  --font-rom: 'ROM', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-gaisyr: 'Gaisyr', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-abc-rom-extended: 'ABC ROM Extended', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-rom-extended: 'ROM Extended', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-gtstandard-m: 'GTStandard-M', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-announcement: 10px;
  --leading-announcement: 1;
  --tracking-announcement: 0px;
  --text-button-label: 12px;
  --leading-button-label: 1;
  --tracking-button-label: 0px;
  --text-body: 14px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-utility-link: 14px;
  --leading-utility-link: 1.4;
  --tracking-utility-link: 1.68px;
  --text-section-kicker: 14px;
  --leading-section-kicker: 1.2;
  --tracking-section-kicker: 0px;
  --text-editorial-quote: 16px;
  --leading-editorial-quote: 1.2;
  --tracking-editorial-quote: 0px;
  --text-editorial-heading: 20px;
  --leading-editorial-heading: 1.1;
  --tracking-editorial-heading: 1.2px;
  --text-display: 48px;
  --leading-display: 1.2;
  --tracking-display: 0px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;

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
  --spacing-64: 64px;
  --spacing-100: 100px;

  /* Layout */
  --section-gap: 64px;
  --card-padding: 12px;
  --element-gap: 12px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-2xl: 20px;
  --radius-full: 100px;

  /* Named Radii */
  --radius-cards: 0px;
  --radius-links: 0px;
  --radius-pills: 100px;
  --radius-badges: 2px;
  --radius-images: 0px;
  --radius-buttons: 20px;

  /* Shadows */
  --shadow-subtle: rgb(255, 255, 255) 0px 0px 0px 1px inset;

  /* Surfaces */
  --surface-void-canvas: #000000;
  --surface-charcoal-surface: #080808;
  --surface-ink-control: #111111;
  --surface-white-inversion: #ffffff;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-void: #000000;
  --color-charcoal: #080808;
  --color-ink: #111111;
  --color-white: #ffffff;
  --color-ash: #999999;
  --color-desert-butter: #f5e78d;

  /* Typography */
  --font-rom: 'ROM', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-gaisyr: 'Gaisyr', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-abc-rom-extended: 'ABC ROM Extended', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-rom-extended: 'ROM Extended', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-gtstandard-m: 'GTStandard-M', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-announcement: 10px;
  --leading-announcement: 1;
  --tracking-announcement: 0px;
  --text-button-label: 12px;
  --leading-button-label: 1;
  --tracking-button-label: 0px;
  --text-body: 14px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-utility-link: 14px;
  --leading-utility-link: 1.4;
  --tracking-utility-link: 1.68px;
  --text-section-kicker: 14px;
  --leading-section-kicker: 1.2;
  --tracking-section-kicker: 0px;
  --text-editorial-quote: 16px;
  --leading-editorial-quote: 1.2;
  --tracking-editorial-quote: 0px;
  --text-editorial-heading: 20px;
  --leading-editorial-heading: 1.1;
  --tracking-editorial-heading: 1.2px;
  --text-display: 48px;
  --leading-display: 1.2;
  --tracking-display: 0px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-64: 64px;
  --spacing-100: 100px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-2xl: 20px;
  --radius-full: 100px;

  /* Shadows */
  --shadow-subtle: rgb(255, 255, 255) 0px 0px 0px 1px inset;
}
```
