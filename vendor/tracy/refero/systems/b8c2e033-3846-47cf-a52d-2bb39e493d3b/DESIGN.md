# Bauhaus Clock — Style Reference
> Bauhaus Clock — turquoise mechanical glow. Frame quiet pale surfaces around dark, cinematic clock imagery and use aqua as a rare illuminated detail.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bauhaus Clock builds its page as a pale-gray gallery interrupted by deep black clock footage, white testimonial tiles, and occasional aqua dial surfaces. The visual signature is oversized, tightly tracked system type set in near-black, with enormous headline scale balanced by compact rounded controls. Soft 30px containers make product media and review modules feel like physical display cards, while a floating frosted purchase bar stays above the content like a hardware control strip.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Gallery Gray | `#eef0f2` | `--color-gallery-gray` | Page background, header field, and low-contrast section canvas |
| Porcelain | `#ffffff` | `--color-porcelain` | Review cards, floating navigation surface, and light content panels |
| Instrument Ink | `#04080d` | `--color-instrument-ink` | Hero headlines, long-form headings, body copy, and dark product-media fields |
| Charcoal Type | `#121317` | `--color-charcoal-type` | Secondary headings, testimonial quotes, and strong supporting text |
| Slate | `#6a6b6f` | `--color-slate` | Muted explanatory copy and low-emphasis labels |
| Graphite | `#4a4e52` | `--color-graphite` | Footer links and subdued inline navigation |
| Dial Teal | `#a1e5e4` | `--color-dial-teal` | Large feature-card surface and illuminated dial treatment — a soft aqua interruption in the otherwise achromatic gallery |
| Mint Glass | `#d5efef` | `--color-mint-glass` | Text-highlight bands, pale feature surfaces, and the soft aqua wash behind selected review phrases |
| Evergreen Dial | `#00753e` | `--color-evergreen-dial` | Occasional clock-dial feature surface; reserve for isolated product artwork rather than general interface states |
| Machine Night Gradient | `radial-gradient(53% 128% at 36.4% -18.1%, #6d6f73 0%, #04080d 95.8527%)` | `--color-machine-night-gradient` | Dark clock and product-media atmosphere, fading from metallic gray into Instrument Ink |
| Icy Display Gradient | `linear-gradient(#d6f6ff 0%, #f2ffff 100%)` | `--color-icy-display-gradient` | Pale luminous treatment for aqua product callouts |
| Luminous Teal Gradient | `radial-gradient(50% 50% at 50% 24.1%, #bfffff 0%, #29cfcf 100%)` | `--color-luminous-teal-gradient` | Radial glow within dial-focused graphics and illuminated product details |

## Tokens — Typography

### ui-sans-serif — Use the native system sans throughout. Headlines use 600 weight with increasingly negative tracking as they grow: -0.2px at 40px, -1px at 60px, and -1.2px at 96px; this makes the large statements feel cut from one dense typographic plane rather than like marketing display type. Quotes remain 400 at 32px/38.4px, preserving a conversational counterweight to the compact heavy headings. · `--font-ui-sans-serif`
- **Substitute:** Inter
- **Weights:** 400, 500, 599, 600, 700
- **Sizes:** 10px, 12px, 15px, 16px, 18px, 20px, 24px, 29px, 32px, 37px, 40px, 60px, 96px, 215px
- **Line height:** 1.00, 1.07, 1.10, 1.20, 1.25, 1.30, 1.40, 1.50
- **Letter spacing:** -3.655px at 215px, -1.2px at 96px, -1.02px at 60px, -0.2px at 40px, normal at 32px, -0.2px at 20px, and +0.2px to +0.32px for compact labels
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`
- **Role:** Use the native system sans throughout. Headlines use 600 weight with increasingly negative tracking as they grow: -0.2px at 40px, -1px at 60px, and -1.2px at 96px; this makes the large statements feel cut from one dense typographic plane rather than like marketing display type. Quotes remain 400 at 32px/38.4px, preserving a conversational counterweight to the compact heavy headings.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| micro-label | ui-sans-serif | 400 | 12px | 1.2 | 0px | `--text-micro-label` |
| body | ui-sans-serif | 400 | 20px | 1.4 | -0.2px | `--text-body` |
| body-strong | ui-sans-serif | 600 | 20px | 1.2 | 0px | `--text-body-strong` |
| product-name | ui-sans-serif | 400 | 32px | 1.2 | 0px | `--text-product-name` |
| testimonial-quote | ui-sans-serif | 400 | 32px | 1.2 | 0.192px | `--text-testimonial-quote` |
| section-heading | ui-sans-serif | 600 | 40px | 1.1 | -0.2px | `--text-section-heading` |
| feature-heading | ui-sans-serif | 600 | 60px | 1.07 | -1.02px | `--text-feature-heading` |
| hero-display | ui-sans-serif | 600 | 96px | 1 | -1.152px | `--text-hero-display` |
| oversized-display | ui-sans-serif | 500 | 215px | 1.2 | -3.225px | `--text-oversized-display` |

## Tokens — Spacing & Shapes

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 5 | 5px | `--spacing-5` |
| 8 | 8px | `--spacing-8` |
| 10 | 10px | `--spacing-10` |
| 12 | 12px | `--spacing-12` |
| 14 | 14px | `--spacing-14` |
| 15 | 15px | `--spacing-15` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 23 | 23px | `--spacing-23` |
| 25 | 25px | `--spacing-25` |
| 30 | 30px | `--spacing-30` |
| 35 | 35px | `--spacing-35` |
| 50 | 50px | `--spacing-50` |
| 75 | 75px | `--spacing-75` |
| 100 | 100px | `--spacing-100` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 30px |
| links | 100px |
| pills | 9999px |
| images | 30px |
| buttons | 100px |
| small-controls | 12px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `rgba(0, 0, 0, 0.1) 0px 1px 2px 0px` | `--shadow-subtle` |
| subtle-2 | `rgba(0, 0, 0, 0.1) 0px 0px 0px 0.5px` | `--shadow-subtle-2` |
| subtle-3 | `rgba(18, 19, 23, 0.02) 0px 0px 0px 1px` | `--shadow-subtle-3` |
| subtle-4 | `rgb(255, 255, 255) 0px 2px 0.5px 0px inset, rgba(255, 255...` | `--shadow-subtle-4` |
| sm | `rgba(0, 0, 0, 0.15) 0px -5px 7px 4px inset, rgba(255, 255...` | `--shadow-sm` |
| subtle-5 | `rgba(255, 255, 255, 0.5) 0px 2px 0.5px 0px inset, rgba(25...` | `--shadow-subtle-5` |
| subtle-6 | `rgba(18, 19, 23, 0.02) 0px 0px 0px 1px inset` | `--shadow-subtle-6` |

### Layout

- **Section gap:** 50px
- **Card padding:** 30px
- **Element gap:** 15px

## Components

### Floating Product Navigation
**Role:** Persistent top purchase bar

Use a Porcelain (#ffffff) rounded bar with a 9999px radius, blur(9px), and a light perimeter treatment of rgba(0, 0, 0, 0.1) 0 0 0 0.5px plus rgba(0, 0, 0, 0.1) 0 1px 2px 0. Place the small clock mark and 32px/38.4px product name at left; anchor the purchase control at right.

### Black Purchase Pill
**Role:** Top-bar conversion control

Set Instrument Ink (#04080d) or black (#000000) behind white purchase text, with a 100px radius and 8px vertical padding. Use the dense 20px system-sans treatment and the layered control shadow: inset white highlights, 0 2px 4px rgba(0,0,0,0.1), and 0 12px 30px rgba(0,0,0,0.1).

### Aqua Announcement Pill
**Role:** Small product-release callout

Use the Icy Display Gradient from #d6f6ff to #f2ffff with a 9999px radius, 8px horizontal-scale spacing, and 20px/25px medium text in Instrument Ink (#04080d). Add a small Luminous Teal Gradient dot before the label and a subtle right-facing chevron.

### Hero Display Statement
**Role:** Centered first-screen message

Set the hero phrase in Instrument Ink (#04080d), ui-sans-serif 600, 96px/96px with -1.2px tracking. Keep it centered on Gallery Gray (#eef0f2), with the release pill as the only colored punctuation above it.

### Cinematic Clock Media Frame
**Role:** Hero product showcase

Present video or clock imagery in a wide black (#000000) frame with a 30px radius and no visible border. Use the Machine Night Gradient within dark imagery; preserve blurred teal light, mechanical dial details, and low-key interior footage rather than placing a static product UI on a white card.

### Star Testimonial Marker
**Role:** Social-proof separator

Center five small Charcoal Type (#121317) star icons in a compact horizontal row with 8px gaps. Keep the marker directly above the testimonial carousel on the Gallery Gray (#eef0f2) field.

### Editorial Testimonial
**Role:** Large social-proof quote

Set the quote in Charcoal Type (#121317), ui-sans-serif 400, 32px/38.4px with +0.2px tracking. Pair it with a circular 9999px avatar, a 20px/24px near-600 author name, and a 16px/19.2px secondary role label.

### Review Tile
**Role:** Carousel review card

Use a Porcelain (#ffffff) tile with 30px radius, 30px padding, and no shadow. Highlight selective words with Mint Glass (#d5efef) rectangular inline bands; use Instrument Ink (#04080d) for the review text and compact author metadata.

### Featured Review Tile
**Role:** Tall review-card variation

Use a Porcelain (#ffffff) card with a 30px radius, 75px top padding, 30px side and bottom padding, and a 1px outline of rgba(18, 19, 23, 0.02). This variant carries longer review copy without introducing strong elevation.

### Aqua Feature Card
**Role:** Product configuration or dial showcase

Use Dial Teal (#a1e5e4) as a 30px-radius surface with 75px top padding, 50px horizontal padding, and 30px bottom padding. Keep typography in Instrument Ink (#04080d) and use this card as an exceptional color field, not a repeating neutral card style.

### Benefit Checklist Row
**Role:** Purchase reassurance list

Arrange each benefit as a 20px or larger Instrument Ink (#04080d) text line with a small circular check icon at left and a 15px internal gap. Keep rows separated by 15px and use the same unboxed Gallery Gray (#eef0f2) background as the surrounding call-to-action section.

### Footer Utility Link
**Role:** Support and legal navigation

Set links in Graphite (#4a4e52) or 70% Instrument Ink, ui-sans-serif 400 at 20px/24px; reserve 500 for the maker credit. Avoid underlines and use restrained inline spacing rather than boxed navigation.

## Do's and Don'ts

### Do
- Use Gallery Gray (#eef0f2) as the default canvas and Porcelain (#ffffff) for testimonial and floating-nav surfaces.
- Set hero statements in ui-sans-serif 600 at 96px/96px with -1.2px tracking.
- Set major section headings in ui-sans-serif 600 at 60px/64px with -1px tracking.
- Use 30px radii for media frames and cards; use 100px radii for purchase controls and 9999px for pill-like elements.
- Give standard review tiles exactly 30px padding and 15px gaps between compact content rows.
- Use Dial Teal (#a1e5e4), Mint Glass (#d5efef), and Evergreen Dial (#00753e) only as isolated product-display surfaces or text highlights.
- Use the light floating-bar shadow recipe with blur(9px), rgba(0,0,0,0.1) 0 1px 2px 0, and a 0.5px perimeter shadow.

### Don't
- Do not replace the Gallery Gray (#eef0f2) canvas with pure white across the full page.
- Do not use squared card corners; cards and product media use a 30px radius.
- Do not put every content block in an elevated card; standard white cards have no shadow.
- Do not use saturated aqua or green as a universal button fill; keep Dial Teal (#a1e5e4) and Evergreen Dial (#00753e) inside product-display surfaces.
- Do not set large headings above 600 weight or add wide tracking; use -0.2px at 40px, -1px at 60px, and -1.2px at 96px.
- Do not use a generic blue browser-link treatment; footer links use Graphite (#4a4e52) or 70% Instrument Ink.
- Do not flatten clock imagery into bright catalog photography; retain black fields, blurred teal illumination, and mechanical close-up atmosphere.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Gallery Gray | `#eef0f2` | Primary page canvas and seamless section field. |
| 1 | Porcelain | `#ffffff` | Review tiles, content cards, and floating navigation. |
| 2 | Dial Teal | `#a1e5e4` | Exceptional feature-card and clock-display surface. |
| 3 | Instrument Ink | `#04080d` | Cinematic product-media field and dark purchase control. |

## Elevation

- **Floating Product Navigation:** `0 0 0 0.5px rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.1)`
- **Black Purchase Pill:** `inset 0 2px 0.5px 0 rgb(255, 255, 255), inset 0 1px 1px 0 rgba(255, 255, 255, 0.5), 0 0 1px 0 rgba(0, 0, 0, 0.1), 0 2px 4px 0 rgba(0, 0, 0, 0.1), 0 12px 30px 0 rgba(0, 0, 0, 0.1)`
- **Featured Review Tile:** `0 0 0 1px rgba(18, 19, 23, 0.02)`

## Imagery

Imagery is product-focused and cinematic: close clock and mechanical-device footage sits in black 30px-radius frames, often with out-of-focus cyan or teal illumination and low-detail dark interiors. The product visual acts as atmosphere and proof rather than a flat app screenshot. Social proof uses small raw circular profile photos; review cards are text-dominant, with Mint Glass highlight strokes acting as the only graphic ornament. Icons are mostly monochrome, compact, and functional: stars, checkmarks, chevrons, Apple marks, and a fine-lined clock emblem.

## Layout

The page is a centered, full-bleed pale-gray composition with wide rounded media contained inside generous side margins. The first screen stacks a small aqua release pill over a centered oversized hero line, followed by a large black rounded clock-video frame. A floating horizontal product bar becomes an overlay while scrolling, with the product identity at left and a black purchase pill at right. Social proof begins with centered stars and prominent editorial quotes, then expands into a horizontally clipped grid or carousel of white 30px review tiles. Subsequent product sections continue as broad editorial bands: oversized centered headings, isolated aqua or green product cards, and a centered purchase-reassurance checklist rather than dense comparison tables.

## Agent Prompt Guide

Quick Color Reference:
- Gallery Gray: #eef0f2 — Page background, header field, and low-contrast section canvas
- Porcelain: #ffffff — Review cards, floating navigation surface, and light content panels
- Instrument Ink: #04080d — Hero headlines, long-form headings, body copy, and dark product-media fields
- Charcoal Type: #121317 — Secondary headings, testimonial quotes, and strong supporting text
- Slate: #6a6b6f — Muted explanatory copy and low-emphasis labels
- Graphite: #4a4e52 — Footer links and subdued inline navigation
- Dial Teal: #a1e5e4 — Large feature-card surface and illuminated dial treatment — a soft aqua interruption in the otherwise achromatic gallery
- Mint Glass: #d5efef — Text-highlight bands, pale feature surfaces, and the soft aqua wash behind selected review phrases
- Evergreen Dial: #00753e — Occasional clock-dial feature surface; reserve for isolated product artwork rather than general interface states
- Machine Night Gradient: radial-gradient(53% 128% at 36.4% -18.1%, #6d6f73 0%, #04080d 95.8527%) — Dark clock and product-media atmosphere, fading from metallic gray into Instrument Ink
- Icy Display Gradient: linear-gradient(#d6f6ff 0%, #f2ffff 100%) — Pale luminous treatment for aqua product callouts
- Luminous Teal Gradient: radial-gradient(50% 50% at 50% 24.1%, #bfffff 0%, #29cfcf 100%) — Radial glow within dial-focused graphics and illuminated product details

Create a centered Gallery Gray hero with an Aqua Announcement Pill above a one-line hero-display in Instrument Ink; use ui-sans-serif 600 at 96px/96px with -1.2px tracking, then place a 30px-radius black cinematic clock-media frame beneath it.
Create a Porcelain review tile with a 30px radius and 30px padding; set the quote in Instrument Ink and add selective Mint Glass inline highlights, then finish with a 9999px circular avatar and compact author metadata.
Create a floating Porcelain product navigation bar with blur(9px), a fine gray perimeter shadow, a clock emblem and 32px/38.4px product name at left, and a black 100px-radius purchase pill at right.
Create an aqua product feature card using Dial Teal, a 30px radius, 75px top padding, 50px side padding, and Instrument Ink section-heading text at 40px/44px with -0.2px tracking.

## Similar Brands

- **Nothing** — Product storytelling uses sparse typography, monochrome hardware-like controls, and isolated high-chroma graphic illumination.
- **Apple** — Uses native-system typography, oversized centered product statements, black purchase controls, and cinematic product media.
- **Teenage Engineering** — Shares the mix of functional product design, graphic color fields, and tactile hardware-oriented visual framing.
- **Arc** — Shares pill-shaped floating interface controls, pale neutral canvases, and rare colorful luminous accents.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-gallery-gray: #eef0f2;
  --color-porcelain: #ffffff;
  --color-instrument-ink: #04080d;
  --color-charcoal-type: #121317;
  --color-slate: #6a6b6f;
  --color-graphite: #4a4e52;
  --color-dial-teal: #a1e5e4;
  --color-mint-glass: #d5efef;
  --color-evergreen-dial: #00753e;
  --color-machine-night-gradient: #6d6f73;
  --gradient-machine-night-gradient: radial-gradient(53% 128% at 36.4% -18.1%, #6d6f73 0%, #04080d 95.8527%);
  --color-icy-display-gradient: #d6f6ff;
  --gradient-icy-display-gradient: linear-gradient(#d6f6ff 0%, #f2ffff 100%);
  --color-luminous-teal-gradient: #bfffff;
  --gradient-luminous-teal-gradient: radial-gradient(50% 50% at 50% 24.1%, #bfffff 0%, #29cfcf 100%);

  /* Typography — Font Families */
  --font-ui-sans-serif: 'ui-sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-micro-label: 12px;
  --leading-micro-label: 1.2;
  --tracking-micro-label: 0px;
  --text-body: 20px;
  --leading-body: 1.4;
  --tracking-body: -0.2px;
  --text-body-strong: 20px;
  --leading-body-strong: 1.2;
  --tracking-body-strong: 0px;
  --text-product-name: 32px;
  --leading-product-name: 1.2;
  --tracking-product-name: 0px;
  --text-testimonial-quote: 32px;
  --leading-testimonial-quote: 1.2;
  --tracking-testimonial-quote: 0.192px;
  --text-section-heading: 40px;
  --leading-section-heading: 1.1;
  --tracking-section-heading: -0.2px;
  --text-feature-heading: 60px;
  --leading-feature-heading: 1.07;
  --tracking-feature-heading: -1.02px;
  --text-hero-display: 96px;
  --leading-hero-display: 1;
  --tracking-hero-display: -1.152px;
  --text-oversized-display: 215px;
  --leading-oversized-display: 1.2;
  --tracking-oversized-display: -3.225px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-w599: 599;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-5: 5px;
  --spacing-8: 8px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-15: 15px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-23: 23px;
  --spacing-25: 25px;
  --spacing-30: 30px;
  --spacing-35: 35px;
  --spacing-50: 50px;
  --spacing-75: 75px;
  --spacing-100: 100px;

  /* Layout */
  --section-gap: 50px;
  --card-padding: 30px;
  --element-gap: 15px;

  /* Border Radius */
  --radius-md: 4px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-3xl: 25px;
  --radius-3xl-2: 30px;
  --radius-3xl-3: 40px;
  --radius-full: 100px;
  --radius-full-2: 9999px;

  /* Named Radii */
  --radius-cards: 30px;
  --radius-links: 100px;
  --radius-pills: 9999px;
  --radius-images: 30px;
  --radius-buttons: 100px;
  --radius-small-controls: 12px;

  /* Shadows */
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 2px 0px;
  --shadow-subtle-2: rgba(0, 0, 0, 0.1) 0px 0px 0px 0.5px;
  --shadow-subtle-3: rgba(18, 19, 23, 0.02) 0px 0px 0px 1px;
  --shadow-subtle-4: rgb(255, 255, 255) 0px 2px 0.5px 0px inset, rgba(255, 255, 255, 0.5) 0px 1px 1px 0px inset, rgba(0, 0, 0, 0.1) 0px 0px 1px 0px, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px, rgba(0, 0, 0, 0.1) 0px 12px 30px 0px;
  --shadow-sm: rgba(0, 0, 0, 0.15) 0px -5px 7px 4px inset, rgba(255, 255, 255, 0.5) 0px 5px 15px 0px inset, rgba(90, 94, 99, 0.3) 0px 1.5px 4.5px 0px;
  --shadow-subtle-5: rgba(255, 255, 255, 0.5) 0px 2px 0.5px 0px inset, rgba(255, 255, 255, 0.5) 0px 1px 1px 0px inset, rgba(0, 141, 176, 0.05) 0px 0px 1px 0px, rgba(0, 140, 140, 0.1) 0px 8px 15px 0px, rgba(0, 141, 176, 0.15) 0px 0px 0px 1px;
  --shadow-subtle-6: rgba(18, 19, 23, 0.02) 0px 0px 0px 1px inset;

  /* Surfaces */
  --surface-gallery-gray: #eef0f2;
  --surface-porcelain: #ffffff;
  --surface-dial-teal: #a1e5e4;
  --surface-instrument-ink: #04080d;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-gallery-gray: #eef0f2;
  --color-porcelain: #ffffff;
  --color-instrument-ink: #04080d;
  --color-charcoal-type: #121317;
  --color-slate: #6a6b6f;
  --color-graphite: #4a4e52;
  --color-dial-teal: #a1e5e4;
  --color-mint-glass: #d5efef;
  --color-evergreen-dial: #00753e;
  --color-machine-night-gradient: #6d6f73;
  --color-icy-display-gradient: #d6f6ff;
  --color-luminous-teal-gradient: #bfffff;

  /* Typography */
  --font-ui-sans-serif: 'ui-sans-serif', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-micro-label: 12px;
  --leading-micro-label: 1.2;
  --tracking-micro-label: 0px;
  --text-body: 20px;
  --leading-body: 1.4;
  --tracking-body: -0.2px;
  --text-body-strong: 20px;
  --leading-body-strong: 1.2;
  --tracking-body-strong: 0px;
  --text-product-name: 32px;
  --leading-product-name: 1.2;
  --tracking-product-name: 0px;
  --text-testimonial-quote: 32px;
  --leading-testimonial-quote: 1.2;
  --tracking-testimonial-quote: 0.192px;
  --text-section-heading: 40px;
  --leading-section-heading: 1.1;
  --tracking-section-heading: -0.2px;
  --text-feature-heading: 60px;
  --leading-feature-heading: 1.07;
  --tracking-feature-heading: -1.02px;
  --text-hero-display: 96px;
  --leading-hero-display: 1;
  --tracking-hero-display: -1.152px;
  --text-oversized-display: 215px;
  --leading-oversized-display: 1.2;
  --tracking-oversized-display: -3.225px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-5: 5px;
  --spacing-8: 8px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-15: 15px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-23: 23px;
  --spacing-25: 25px;
  --spacing-30: 30px;
  --spacing-35: 35px;
  --spacing-50: 50px;
  --spacing-75: 75px;
  --spacing-100: 100px;

  /* Border Radius */
  --radius-md: 4px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-3xl: 25px;
  --radius-3xl-2: 30px;
  --radius-3xl-3: 40px;
  --radius-full: 100px;
  --radius-full-2: 9999px;

  /* Shadows */
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 2px 0px;
  --shadow-subtle-2: rgba(0, 0, 0, 0.1) 0px 0px 0px 0.5px;
  --shadow-subtle-3: rgba(18, 19, 23, 0.02) 0px 0px 0px 1px;
  --shadow-subtle-4: rgb(255, 255, 255) 0px 2px 0.5px 0px inset, rgba(255, 255, 255, 0.5) 0px 1px 1px 0px inset, rgba(0, 0, 0, 0.1) 0px 0px 1px 0px, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px, rgba(0, 0, 0, 0.1) 0px 12px 30px 0px;
  --shadow-sm: rgba(0, 0, 0, 0.15) 0px -5px 7px 4px inset, rgba(255, 255, 255, 0.5) 0px 5px 15px 0px inset, rgba(90, 94, 99, 0.3) 0px 1.5px 4.5px 0px;
  --shadow-subtle-5: rgba(255, 255, 255, 0.5) 0px 2px 0.5px 0px inset, rgba(255, 255, 255, 0.5) 0px 1px 1px 0px inset, rgba(0, 141, 176, 0.05) 0px 0px 1px 0px, rgba(0, 140, 140, 0.1) 0px 8px 15px 0px, rgba(0, 141, 176, 0.15) 0px 0px 0px 1px;
  --shadow-subtle-6: rgba(18, 19, 23, 0.02) 0px 0px 0px 1px inset;
}
```
