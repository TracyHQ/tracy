# B150 — Style Reference
> Future workshop in film grain. Build bright ivory editorial sections around dark, human-scale product and creator imagery.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

B150 — future workshop in warm film grain. The system alternates an ivory editorial canvas with immersive, dark photographic moments, using near-black ink and warm-white type instead of cool digital neutrals. Huge, tightly tracked Geist headlines occupy decisive blocks of space, while Fragment Mono turns navigation, labels, and metadata into tiny technical annotations. Surfaces stay flat and lightly bordered; pill actions and rounded media frames soften the otherwise direct, poster-like composition.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Charcoal Ink | `#1f1915` | `--color-charcoal-ink` | Primary text, dark photographic overlays, dark page bands, logo marks, and iconography |
| Workshop Ivory | `#f2efe9` | `--color-workshop-ivory` | Page canvas, light hero fields, and broad editorial section backgrounds |
| Paper White | `#fffdf6` | `--color-paper-white` | Warm light text over dark media, light pill actions, and high-contrast light surfaces |
| Studio White | `#ffffff` | `--color-studio-white` | Filled pill actions, product-interface surfaces, and compact elevated media controls |
| Soft Paper | `#f7f5f1` | `--color-soft-paper` | Large display text on dark imagery and the palest alternate surface |
| Drafting Line | `#e6e3dd` | `--color-drafting-line` | Hairline borders, card fills, image frames, and dividers |
| Quiet Graphite | `#6b6661` | `--color-quiet-graphite` | Secondary body copy and subdued supporting descriptions |
| Faded Graphite | `#8d8883` | `--color-faded-graphite` | Tertiary metadata, low-emphasis icons, and supporting labels |
| Signal Coral | `#fa725a` | `--color-signal-coral` | Orange text accent for links, tags, and emphasized short phrases |

## Tokens — Typography

### Geist — Primary editorial and interface family. Use 400 at 120px for display headlines; its -8px tracking and 0.93 line-height make the message read as a compressed poster rather than a conventional marketing headline. Use 500 for section titles, body hierarchy, and interface controls. · `--font-geist`
- **Substitute:** Arial, sans-serif
- **Weights:** 400, 500
- **Sizes:** 10px, 12px, 16px, 32px, 40px, 48px, 120px
- **Line height:** 0.93, 1.00, 1.12, 1.50, 1.70
- **Letter spacing:** -8px at 120px; approximately -2px at 48px; approximately -1.24px at 40px; approximately -0.99px at 32px; +0.5px at 16px; -0.3px at 10px
- **Role:** Primary editorial and interface family. Use 400 at 120px for display headlines; its -8px tracking and 0.93 line-height make the message read as a compressed poster rather than a conventional marketing headline. Use 500 for section titles, body hierarchy, and interface controls.

### Fragment Mono — Technical microtype for all-caps navigation, small labels, status text, and compact metadata. At 10px with +0.3px tracking, it gives the interface its workshop-inventory character against the expressive Geist display type. · `--font-fragment-mono`
- **Substitute:** IBM Plex Mono, monospace
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px
- **Line height:** 1.00, 1.33, 1.42, 1.50
- **Letter spacing:** +0.3px for tracked uppercase labels; -0.3px for compact utility text
- **Role:** Technical microtype for all-caps navigation, small labels, status text, and compact metadata. At 10px with +0.3px tracking, it gives the interface its workshop-inventory character against the expressive Geist display type.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| nav | Fragment Mono | 400 | 10px | 1.5 | 0.3px | `--text-nav` |
| micro-label | Geist | 500 | 10px | 1.5 | -0.3px | `--text-micro-label` |
| body | Geist | 400 | 12px | 1.7 | 0px | `--text-body` |
| button-label | Geist | 500 | 16px | 1.5 | 0.496px | `--text-button-label` |
| section-title | Geist | 500 | 32px | 1.12 | -0.992px | `--text-section-title` |
| display | Geist | 400 | 120px | 0.93 | -8.04px | `--text-display` |

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
| 36 | 36px | `--spacing-36` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 96 | 96px | `--spacing-96` |
| 120 | 120px | `--spacing-120` |
| 160 | 160px | `--spacing-160` |
| 208 | 208px | `--spacing-208` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 16px |
| links | 8px |
| images | 8px |
| buttons | 1440px |
| media-frame | 16px |
| large-panels | 24px |

### Layout

- **Section gap:** 40px
- **Card padding:** 12px
- **Element gap:** 8px

## Components

### Transparent Top Navigation
**Role:** Persistent public navigation over both light sections and dark hero media.

Use a 65px-tall horizontal bar with a 1px solid #e6e3dd bottom divider on light sections; over dark hero media, use a low-contrast light divider. Render the B150 wordmark at the far left and Fragment Mono navigation at 10px/400, 15px line-height, +0.3px tracking, uppercase.

### Light Pill Navigation Button
**Role:** Public conversion control in the header and light sections.

Use #ffffff or #fffdf6 fill, #1f1915 text, a 1px solid #e6e3dd border, 1440px radius, and 12px vertical padding with 16px or 20px horizontal padding.

### Dark Hero Glass Pill
**Role:** Conversion control placed directly over dark photography.

Use rgba(255,253,246,0.16) fill with a 1px solid rgba(255,253,246,0.32) border, #fffdf6 label text, 1440px radius, and 12px 20px padding.

### Photographic Display Hero
**Role:** Opening full-bleed editorial statement.

Fill the hero with muted, dark documentary photography; place the content in the left portion of the image and let the subject occupy the opposing side. Set the display headline in Geist 400 at 120px, 111.6px line-height, -8px tracking, and #f7f5f1; use #fffdf6 for the compact supporting copy.

### App Download Badge
**Role:** Compact platform-download action beside the hero pill.

Use a black #000000 rectangular badge with #ffffff iconography and lettering, 8px corner radius, and no visible shadow. Keep it visually smaller than the adjacent 1440px-radius pill.

### Floating Film Teaser
**Role:** Inset media control layered in the lower hero corner.

Wrap the video still in an rgba(255,253,246,0.32) container with 16px radius and 8px padding. Use an 8px-radius image inside, a centered #ffffff circular play control, and a small Fragment Mono caption beneath.

### Eyebrow Capsule
**Role:** Centered section label above editorial statements and logo strips.

Use a minimal outlined capsule with a 1px solid #e6e3dd border, 1440px radius, 8px horizontal internal gaps, and Fragment Mono 10px uppercase text. Pair with a small mono icon rather than a filled color marker.

### Editorial Statement Block
**Role:** Centered manifesto-style introduction.

Set large Geist 500 copy in #1f1915 on #f2efe9, centered in a narrow multi-line block. Keep the lettering tightly tracked at large sizes and leave a 40px gap before the product visual.

### Product Interface Frame
**Role:** Contained product showcase beneath a centered statement.

Present the interface screenshot on a #ffffff surface with 1px solid #e6e3dd framing and 16px corner radius. Preserve the pale product UI rather than placing it on a dark device mockup; use 32px internal padding when the frame includes surrounding content.

### Trusted By Logo Rail
**Role:** Partner and sponsor recognition strip.

Place monochrome or native-color logos in one horizontal rail bounded by 1px solid #e6e3dd rules. Use #f2efe9 as the field, an outlined mono eyebrow above, and 24px gaps between individual marks.

### Four-Column Resource Grid
**Role:** Text-led overview of network resources.

Use four evenly distributed columns on #f2efe9 with a small #8d8883 icon, Geist heading in #1f1915, and #6b6661 supporting copy. Separate columns with whitespace rather than card borders; use 16px internal text gaps and 24px column gaps.

### Pale Feature Card
**Role:** Contained supporting module for denser content.

Use #e6e3dd fill, no shadow, 16px radius, and 32px padding. Keep typography in #1f1915 and avoid saturated fills inside the card.

## Do's and Don'ts

### Do
- Use #f2efe9 as the default page canvas and #1f1915 for primary text.
- Set display headlines in Geist 400 at 120px with 111.6px line-height and -8px letter-spacing when using the full editorial hero treatment.
- Use Fragment Mono 10px with +0.3px tracking for uppercase navigation, labels, and metadata.
- Build public conversion buttons as #ffffff or #fffdf6 pills with 1440px radius, #1f1915 text, and 12px vertical padding.
- Use 1px solid #e6e3dd dividers and frames instead of shadows for light-section structure.
- Use 16px radius for cards and media containers, with 8px radius for inset images.
- Reserve #fa725a for compact availability or upcoming-status text.

### Don't
- Do not use blue, green, or purple as general interface accents; keep the working palette achromatic with #fa725a as the exception.
- Do not replace the 1440px button radius with rounded rectangles such as 8px or 16px.
- Do not use drop shadows on #ffffff, #fffdf6, or #e6e3dd cards.
- Do not set large headings in bold weights; use Geist 400 for the 120px display treatment and Geist 500 for subordinate headings.
- Do not use pure #ffffff as the broad page background when #f2efe9 is available.
- Do not turn the four-column resource layout into four heavy bordered cards.
- Do not use photographic imagery as bright stock imagery; retain dark, muted documentary treatment behind light hero type.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Workshop Ivory | `#f2efe9` | Default page canvas and broad editorial bands. |
| 1 | Soft Paper | `#f7f5f1` | Pale alternate field and light display text on dark imagery. |
| 2 | Studio White | `#ffffff` | Pills, product-interface surfaces, and compact elevated controls. |
| 3 | Drafting Line | `#e6e3dd` | Framed cards, rules, and muted feature panels. |
| 4 | Charcoal Ink | `#1f1915` | Dark hero overlays, dark page bands, and primary foreground. |

## Elevation

Avoid cast shadows entirely. Hierarchy comes from the #f2efe9 → #ffffff → #e6e3dd surface progression, 1px #e6e3dd frames, translucent light overlays on dark photography, and nested 8px or 16px rounded media edges.

## Imagery

Imagery is sparse but dominant where it appears: the opening visual is a full-bleed, darkened documentary-style photograph of a young maker holding a complex object, with subdued warm-gray color and no glossy color grade. Product screenshots are explanatory rather than decorative, presented as wide, contained pale interfaces with soft 16px frames. The only layered graphic treatment is the small film teaser, which uses a cropped still, centered play icon, and translucent rounded surround. Icons are tiny, mostly mono black or muted graphite line marks; the page remains text-dominant outside hero photography and product showcase sections.

## Layout

The page is a long, vertically sequenced editorial landing page on a #f2efe9 canvas, with a slim horizontal navigation bar repeated across the top. The opening screen breaks the light-page pattern with a full-bleed dark photographic hero: oversized left-aligned display text, compact supporting copy and actions below, a human subject centered or right-weighted, and a floating film teaser in the lower-right corner. Light sections return to centered statement blocks followed by wide contained product screenshots, then a ruled horizontal logo rail and spacious text-led resource modules. Content favors broad seams of empty canvas over dense stacking; the resource overview resolves into a four-column grid without heavy card treatment.

## Agent Prompt Guide

Quick Color Reference:
- Charcoal Ink: #1f1915 — Primary text, dark photographic overlays, dark page bands, logo marks, and iconography
- Workshop Ivory: #f2efe9 — Page canvas, light hero fields, and broad editorial section backgrounds
- Paper White: #fffdf6 — Warm light text over dark media, light pill actions, and high-contrast light surfaces
- Studio White: #ffffff — Filled pill actions, product-interface surfaces, and compact elevated media controls
- Soft Paper: #f7f5f1 — Large display text on dark imagery and the palest alternate surface
- Drafting Line: #e6e3dd — Hairline borders, card fills, image frames, and dividers
- Quiet Graphite: #6b6661 — Secondary body copy and subdued supporting descriptions
- Faded Graphite: #8d8883 — Tertiary metadata, low-emphasis icons, and supporting labels
- Signal Coral: #fa725a — Orange text accent for links, tags, and emphasized short phrases

Create a full-bleed dark documentary-photo hero with a left-aligned Geist 400 headline at 120px, 111.6px line-height, -8px tracking in Soft Paper #f7f5f1; add a Dark Hero Glass Pill using Paper White #fffdf6 text and rgba(255,253,246,0.16) fill.
Create a 65px public top navigation on Workshop Ivory #f2efe9 with Fragment Mono 400 at 10px, 15px line-height, +0.3px tracking; finish with a Studio White #ffffff Light Pill Navigation Button.
Create a centered editorial statement on Workshop Ivory #f2efe9 in Charcoal Ink #1f1915, followed by a wide Product Interface Frame with #ffffff fill, 1px Drafting Line #e6e3dd border, 16px radius, and 32px padding.
Create a Trusted By Logo Rail on Workshop Ivory #f2efe9 with two 1px Drafting Line #e6e3dd rules, a Fragment Mono 10px uppercase eyebrow capsule, and evenly spaced logos.
Create a Four-Column Resource Grid on Workshop Ivory #f2efe9 with #8d8883 line icons, Charcoal Ink #1f1915 Geist headings, Quiet Graphite #6b6661 body copy, 16px internal gaps, and no card borders.

## Similar Brands

- **Vercel** — Shares restrained monochrome product presentation, dense technical micro-navigation, and large high-contrast editorial type.
- **Are.na** — Shares an editorial, community-network composition where pale canvas and small utility typography frame content rather than decorate it.
- **Linear** — Shares a tightly controlled dark-light surface system, compact mono-like metadata behavior, and minimal reliance on shadows.
- **Notion** — Shares warm off-white surfaces, black-first typography, sparse dividers, and product screenshots treated as primary content.
- **A24** — Shares dark cinematic photography paired with oversized quiet typography and an editorial rather than conventionally corporate page rhythm.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-charcoal-ink: #1f1915;
  --color-workshop-ivory: #f2efe9;
  --color-paper-white: #fffdf6;
  --color-studio-white: #ffffff;
  --color-soft-paper: #f7f5f1;
  --color-drafting-line: #e6e3dd;
  --color-quiet-graphite: #6b6661;
  --color-faded-graphite: #8d8883;
  --color-signal-coral: #fa725a;

  /* Typography — Font Families */
  --font-geist: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-fragment-mono: 'Fragment Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-nav: 10px;
  --leading-nav: 1.5;
  --tracking-nav: 0.3px;
  --text-micro-label: 10px;
  --leading-micro-label: 1.5;
  --tracking-micro-label: -0.3px;
  --text-body: 12px;
  --leading-body: 1.7;
  --tracking-body: 0px;
  --text-button-label: 16px;
  --leading-button-label: 1.5;
  --tracking-button-label: 0.496px;
  --text-section-title: 32px;
  --leading-section-title: 1.12;
  --tracking-section-title: -0.992px;
  --text-display: 120px;
  --leading-display: 0.93;
  --tracking-display: -8.04px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
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
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-120: 120px;
  --spacing-160: 160px;
  --spacing-208: 208px;

  /* Layout */
  --section-gap: 40px;
  --card-padding: 12px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-lg: 8px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;
  --radius-full: 1440px;

  /* Named Radii */
  --radius-cards: 16px;
  --radius-links: 8px;
  --radius-images: 8px;
  --radius-buttons: 1440px;
  --radius-media-frame: 16px;
  --radius-large-panels: 24px;

  /* Surfaces */
  --surface-workshop-ivory: #f2efe9;
  --surface-soft-paper: #f7f5f1;
  --surface-studio-white: #ffffff;
  --surface-drafting-line: #e6e3dd;
  --surface-charcoal-ink: #1f1915;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-charcoal-ink: #1f1915;
  --color-workshop-ivory: #f2efe9;
  --color-paper-white: #fffdf6;
  --color-studio-white: #ffffff;
  --color-soft-paper: #f7f5f1;
  --color-drafting-line: #e6e3dd;
  --color-quiet-graphite: #6b6661;
  --color-faded-graphite: #8d8883;
  --color-signal-coral: #fa725a;

  /* Typography */
  --font-geist: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-fragment-mono: 'Fragment Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-nav: 10px;
  --leading-nav: 1.5;
  --tracking-nav: 0.3px;
  --text-micro-label: 10px;
  --leading-micro-label: 1.5;
  --tracking-micro-label: -0.3px;
  --text-body: 12px;
  --leading-body: 1.7;
  --tracking-body: 0px;
  --text-button-label: 16px;
  --leading-button-label: 1.5;
  --tracking-button-label: 0.496px;
  --text-section-title: 32px;
  --leading-section-title: 1.12;
  --tracking-section-title: -0.992px;
  --text-display: 120px;
  --leading-display: 0.93;
  --tracking-display: -8.04px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-120: 120px;
  --spacing-160: 160px;
  --spacing-208: 208px;

  /* Border Radius */
  --radius-lg: 8px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;
  --radius-full: 1440px;
}
```
