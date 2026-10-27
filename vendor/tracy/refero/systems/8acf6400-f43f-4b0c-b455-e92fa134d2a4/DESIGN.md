# Baba — Style Reference
> care notes in red sunlight. Build broad red narrative bands around intimate white, blush, and cream information surfaces, with human photography carrying the emotional center.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Baba pairs an expansive red advocacy field with a warm cream information canvas. Söhne display type is large, tightly tracked, and weighty; Atkinson Hyperlegible Next keeps navigation, answers, and care details unusually legible at small sizes. White and blush panels interrupt the red field, while rounded photographic crops, translucent status pills, and deep wine-tinted shadows turn care coordination into a visible, human scene.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Baba Red | `radial-gradient(140% 120% at 15% 0%, #d0302a 0%, #bc2823 60%)` | `--color-baba-red` | Large campaign bands, footer surfaces, branded links, icons, and red-on-white labels — the deep warm red establishes the site’s continuous care-setting atmosphere; Layer behind large red campaign panels and animated care-plan scenes |
| Signal Red | `#ea1111` | `--color-signal-red` | Filled conversion controls on light navigation and cream surfaces — the brighter red reads as a precise interruption within the warmer red system |
| Red Light | `#cc5c56` | `--color-red-light` | Lighter red panel illumination and gradient endpoint within red feature sections |
| Cream Paper | `#faf9f1` | `--color-cream-paper` | Page backgrounds, pale outlined controls, and light-on-dark typography |
| White | `#ffffff` | `--color-white` | Cards, light navigation controls, image badges, and high-contrast text on red surfaces |
| Ink | `#2a1d18` | `--color-ink` | Primary dark headings, body copy, dark controls, and dark feature-card surfaces |
| Soft Ink | `#3e312c` | `--color-soft-ink` | Long-form body copy and secondary explanatory text |
| Warm Gray | `#645953` | `--color-warm-gray` | Muted supporting copy and low-emphasis labels |
| Paper Divider | `#ede7e2` | `--color-paper-divider` | Hairline accordion rules, quiet control borders, and light-surface separation |
| Blush | `#f8e2db` | `--color-blush` | Soft feature-card surfaces and calm transitional blocks between cream content sections |

## Tokens — Typography

### Söhne — Display headings, section titles, large statistics, care-plan labels, and image-overlay badges. The 600 display treatment uses -2.04px tracking at 68px, -1.68px at 56px, and -0.72px at 36px; this compression gives the oversized language its compact, direct silhouette. · `--font-shne`
- **Substitute:** Arial, Helvetica Neue, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 13px, 16px, 24px, 36px, 54px, 56px, 68px
- **Line height:** 1.00, 1.05, 1.15, 1.25, 1.50
- **Letter spacing:** -2.04px at 68px, -1.68px at 56px, -0.72px at 36px, -0.36px at 24px; normal at 16px
- **Role:** Display headings, section titles, large statistics, care-plan labels, and image-overlay badges. The 600 display treatment uses -2.04px tracking at 68px, -1.68px at 56px, and -0.72px at 36px; this compression gives the oversized language its compact, direct silhouette.

### Atkinson Hyperlegible Next — Navigation, controls, FAQ copy, labels, body text, and small step indicators. Its accessible letterforms remain deliberately plain beside Söhne’s compressed headings; use 500 for buttons and compact labels, 600 for numbered steps. · `--font-atkinson-hyperlegible-next`
- **Substitute:** Atkinson Hyperlegible, Arial, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 12px, 13px, 14px, 15px, 16px, 17px, 18px, 20px
- **Line height:** 1.00, 1.15, 1.25, 1.33, 1.35, 1.38, 1.43, 1.50, 1.60, 1.63
- **Letter spacing:** -0.48px at 16px where compacted; +0.325px at 13px labels; normal for navigation and body copy
- **Role:** Navigation, controls, FAQ copy, labels, body text, and small step indicators. Its accessible letterforms remain deliberately plain beside Söhne’s compressed headings; use 500 for buttons and compact labels, 600 for numbered steps.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| eyebrow | Atkinson Hyperlegible Next | 500 | 13px | 1.25 | 0.325px | `--text-eyebrow` |
| nav | Atkinson Hyperlegible Next | 400 | 15px | 1.63 | 0px | `--text-nav` |
| card-heading | Söhne | 400 | 16px | 1.5 | 0px | `--text-card-heading` |
| body | Atkinson Hyperlegible Next | 400 | 16px | 1.5 | 0px | `--text-body` |
| heading | Söhne | 600 | 36px | 1.15 | -0.72px | `--text-heading` |
| statistic | Söhne | 400 | 54px | 1 | 0px | `--text-statistic` |
| section-heading | Söhne | 600 | 56px | 1.05 | -1.68px | `--text-section-heading` |
| display | Söhne | 600 | 68px | 1 | -2.04px | `--text-display` |

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
| 56 | 56px | `--spacing-56` |
| 64 | 64px | `--spacing-64` |
| 72 | 72px | `--spacing-72` |
| 80 | 80px | `--spacing-80` |
| 88 | 88px | `--spacing-88` |
| 128 | 128px | `--spacing-128` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 16px |
| links | 6px |
| pills | 9999px |
| badges | 9999px |
| images | 32px |
| buttons | 12px |
| largeFeatureCards | 32px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0p...` | `--shadow-subtle` |
| xl | `rgba(42, 29, 24, 0.16) 0px 12px 30px 0px` | `--shadow-xl` |
| xl-2 | `rgba(0, 0, 0, 0.28) 0px 22px 70px 0px` | `--shadow-xl-2` |
| xl-3 | `rgba(61, 0, 23, 0.45) 0px 32px 64px -16px` | `--shadow-xl-3` |
| xl-4 | `rgba(61, 0, 23, 0.45) 0px 18px 40px -18px` | `--shadow-xl-4` |

### Layout

- **Section gap:** 48px
- **Card padding:** 24px
- **Element gap:** 8px

## Components

### Hero Navigation Bar
**Role:** Top-level public navigation over red or cream page bands.

Set a 73px-high horizontal bar with a 1px bottom rule when on cream. Use Atkinson Hyperlegible Next 16px/24px weight 400 for navigation; on red use white at 92% opacity, on cream use Ink #2a1d18. Keep the compact white 12px-radius conversion button separate from the text links.

### Light Conversion Button
**Role:** Header conversion control on red surfaces.

Use a White #ffffff fill, Baba Red #bc2823 text in Atkinson Hyperlegible Next 15px/22.5px weight 500, 12px radius, 20px horizontal padding, and a 44px control height.

### Signal Conversion Button
**Role:** Filled conversion control on cream or white surfaces.

Use Signal Red #ea1111 fill with White #ffffff text, 12px radius, 12px 20px padding, and Atkinson Hyperlegible Next 15px/22.5px weight 500.

### Dark Utility Button
**Role:** Dark filled utility control and skip-link treatment.

Use Ink #2a1d18 fill, Cream Paper #faf9f1 text, 12px radius, 12px 20px padding, and Atkinson Hyperlegible Next 15px/22.5px weight 500.

### Outlined Eligibility Button
**Role:** Secondary conversion beside a filled hero control.

Use a transparent fill, 1px solid Cream Paper #faf9f1 border, white 15px/22.5px Atkinson Hyperlegible Next weight 500 text, 12px radius, and 20px horizontal padding.

### Hero Photo Card
**Role:** Contained lifestyle photograph with live care-status overlays.

Crop warm, candid outdoor photography into a 32px-radius frame. Float Söhne 16px/24px weight 400 status pills over the image with rgba(255,255,255,0.12) fill, rgba(255,255,255,0.92) text, 9999px radius, and 12px 16px padding.

### Red How-It-Works Panel
**Role:** Large procedural feature panel within a red page band.

Use the Red Atmosphere radial field with a 32px radius and no visible border. Give the interior 32px horizontal padding; present a Söhne 56px/58.8px weight 600 white title and divide step rows with 1px rgba(255,255,255,0.2) rules.

### Numbered Care Step
**Role:** Sequential care-plan item.

Use a 20px rounded-square numeral marker with a White #ffffff fill and Baba Red #bc2823 14px/20px Atkinson Hyperlegible Next weight 600 numeral for the active item. Pair it with Söhne 24px/30px weight 500 white text; inactive markers sit at reduced opacity.

### Floating Care Plan Card
**Role:** Elevated service-detail panel inside red explanatory sections.

Use a translucent red surface, 16px radius, 36px padding, and the shadow 0 12px 30px rgba(42,29,24,0.16). Set its heading in Söhne 24px/30px weight 500 White and service rows in white at 92% opacity.

### White Content Card
**Role:** Light-surface card for contained content and small media.

Use White #ffffff, 16px radius, 36px padding, and the shadow 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1).

### Blush Statement Panel
**Role:** Large warm pause between cream informational sections.

Use Blush #f8e2db with a 32px radius and no border. Set display copy in Ink #2a1d18 using Söhne 36px/41.4px weight 600 with -0.72px tracking.

### FAQ Accordion Row
**Role:** Expandable question-and-answer control on the cream canvas.

Use a transparent background, Ink #2a1d18 question text, 1px solid Paper Divider #ede7e2 bottom border, and 24px vertical padding. Open answers use Soft Ink #3e312c; retain a small right-aligned chevron rather than a boxed icon.

### Avatar Conversation Pair
**Role:** Human-care connection cue above plan details.

Use circular portrait crops with a thin light ring and compact Söhne 11px labels underneath. Separate the two avatars with a white audio-wave icon; keep the group floating on the red field rather than inside a white card.

## Do's and Don'ts

### Do
- Use Cream Paper #faf9f1 as the default informational canvas and Ink #2a1d18 for primary text.
- Set display headings in Söhne weight 600 with -0.03em tracking at 56px and 68px.
- Use Atkinson Hyperlegible Next 15px/24.375px weight 400 for public navigation.
- Use 12px radius and 20px horizontal padding for rectangular conversion buttons.
- Use 9999px radius with 12px 16px padding for photo-overlay status badges.
- Reserve 32px radius for large red panels and image crops; use 16px radius for standard white cards.
- Separate FAQ rows with 1px Paper Divider #ede7e2 rules and 24px vertical padding.

### Don't
- Do not use #ea1111 as the fill for every red surface; use Baba Red #bc2823 for broad page bands and Signal Red only for filled conversion controls.
- Do not replace Cream Paper #faf9f1 with pure white as the main page canvas.
- Do not set display headlines in Atkinson Hyperlegible Next or body copy in oversized Söhne display sizes.
- Do not use pill radii on standard buttons; keep buttons at 12px and pills at 9999px.
- Do not add heavy generic shadows to every card; use either the 0 1px 3px / 0 1px 2px shadow or the 0 12px 30px Ink shadow for floating care cards.
- Do not introduce cool blue, purple, or green interface accents into the red, cream, blush, and ink system.
- Do not box accordion questions in rounded cards; keep them as ruled rows on the cream field.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Cream Paper | `#faf9f1` | Default page canvas and FAQ background. |
| 1 | White Card | `#ffffff` | Content cards, light controls, and contained media support. |
| 2 | Blush Panel | `#f8e2db` | Large editorial statement panels and soft feature surfaces. |
| 3 | Baba Red Field | `#bc2823` | Hero, process sections, and footer. |
| 4 | Ink Surface | `#2a1d18` | Dark utility controls and occasional high-contrast surfaces. |

## Elevation

- **White Content Card:** `0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)`
- **Floating Care Plan Card:** `0px 12px 30px 0px rgba(42, 29, 24, 0.16)`
- **Floating Navigation:** `0px 22px 70px 0px rgba(0, 0, 0, 0.28)`

## Imagery

Lifestyle photography is the hero visual: candid, close-cropped older adults outdoors, dressed in red and lit by sun, contained in a large 32px-radius frame rather than spread full bleed. The photograph acts as a product scene through translucent white status pills layered directly over it. Human portrait avatars appear as small circular crops in process modules, paired with a white waveform icon. Graphics remain sparse: thin-line chevrons, phone marks, and audio symbols support the care-flow story while text retains most of the page.

## Layout

The site uses a full-bleed sequence of red narrative bands and a dominant Cream Paper information canvas. The first screen is a horizontal hero: oversized left-aligned copy and paired controls sit beside a contained, large-radius lifestyle photo with floating status pills; the public nav spans the top edge. Red procedural sections place a large rounded panel within the field, pairing a left-hand numbered list with a right-hand floating care-plan scene. Cream sections shift into asymmetric editorial layouts, with a left introduction column and a wider accordion column; broad blush panels create sectional pauses. The page is comfortably spaced, moving between centered content blocks, two-column explanation panels, and human-proof modules, before a full-width Baba Red footer with dense multi-column navigation.

## Agent Prompt Guide

Quick Color Reference:
- Baba Red: radial-gradient(140% 120% at 15% 0%, #d0302a 0%, #bc2823 60%) — Large campaign bands, footer surfaces, branded links, icons, and red-on-white labels — the deep warm red establishes the site’s continuous care-setting atmosphere; Layer behind large red campaign panels and animated care-plan scenes
- Signal Red: #ea1111 — Filled conversion controls on light navigation and cream surfaces — the brighter red reads as a precise interruption within the warmer red system
- Red Light: #cc5c56 — Lighter red panel illumination and gradient endpoint within red feature sections
- Cream Paper: #faf9f1 — Page backgrounds, pale outlined controls, and light-on-dark typography
- White: #ffffff — Cards, light navigation controls, image badges, and high-contrast text on red surfaces
- Ink: #2a1d18 — Primary dark headings, body copy, dark controls, and dark feature-card surfaces
- Soft Ink: #3e312c — Long-form body copy and secondary explanatory text
- Warm Gray: #645953 — Muted supporting copy and low-emphasis labels
- Paper Divider: #ede7e2 — Hairline accordion rules, quiet control borders, and light-surface separation
- Blush: #f8e2db — Soft feature-card surfaces and calm transitional blocks between cream content sections

Create a red hero with a Söhne 68px/68px weight 600 white headline tracked -2.04px, an Atkinson Hyperlegible Next 15px/22.5px white outlined secondary control, and a 32px-radius candid lifestyle photo carrying White 92%-opacity Söhne 16px/24px status pills.
Create a Cream Paper FAQ section with a Söhne 36px/41.4px weight 600 Ink introduction at left and ruled Ink question rows at right; use Soft Ink answer copy and 24px vertical row padding.
Create a 32px-radius Baba Red process panel with a Söhne 56px/58.8px white title, three numbered care steps, and a 16px-radius floating plan card elevated by 0 12px 30px rgba(42,29,24,0.16).
Create a Blush statement panel with a 32px radius and Söhne 36px/41.4px weight 600 Ink display copy; do not add a border or generic drop shadow.

## Similar Brands

- **Nourish** — Warm healthcare editorial layouts that use friendly human photography, rounded cards, and information-first type.
- **Oscar Health** — Healthcare navigation expressed with large typography, candid people photography, and direct conversion controls.
- **One Medical** — Human-centered care presentation with restrained interface chrome and editorial informational sections.
- **Tia** — Soft warm surface palette and rounded care-content modules built around approachable health guidance.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-baba-red: #bc2823;
  --gradient-baba-red: radial-gradient(140% 120% at 15% 0%, #d0302a 0%, #bc2823 60%);
  --color-signal-red: #ea1111;
  --color-red-light: #cc5c56;
  --color-cream-paper: #faf9f1;
  --color-white: #ffffff;
  --color-ink: #2a1d18;
  --color-soft-ink: #3e312c;
  --color-warm-gray: #645953;
  --color-paper-divider: #ede7e2;
  --color-blush: #f8e2db;

  /* Typography — Font Families */
  --font-shne: 'Söhne', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-atkinson-hyperlegible-next: 'Atkinson Hyperlegible Next', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-eyebrow: 13px;
  --leading-eyebrow: 1.25;
  --tracking-eyebrow: 0.325px;
  --text-nav: 15px;
  --leading-nav: 1.63;
  --tracking-nav: 0px;
  --text-card-heading: 16px;
  --leading-card-heading: 1.5;
  --tracking-card-heading: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-heading: 36px;
  --leading-heading: 1.15;
  --tracking-heading: -0.72px;
  --text-statistic: 54px;
  --leading-statistic: 1;
  --tracking-statistic: 0px;
  --text-section-heading: 56px;
  --leading-section-heading: 1.05;
  --tracking-section-heading: -1.68px;
  --text-display: 68px;
  --leading-display: 1;
  --tracking-display: -2.04px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

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
  --spacing-56: 56px;
  --spacing-64: 64px;
  --spacing-72: 72px;
  --spacing-80: 80px;
  --spacing-88: 88px;
  --spacing-128: 128px;

  /* Layout */
  --section-gap: 48px;
  --card-padding: 24px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;
  --radius-3xl-2: 32px;
  --radius-full: 9999px;

  /* Named Radii */
  --radius-cards: 16px;
  --radius-links: 6px;
  --radius-pills: 9999px;
  --radius-badges: 9999px;
  --radius-images: 32px;
  --radius-buttons: 12px;
  --radius-largefeaturecards: 32px;

  /* Shadows */
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px;
  --shadow-xl: rgba(42, 29, 24, 0.16) 0px 12px 30px 0px;
  --shadow-xl-2: rgba(0, 0, 0, 0.28) 0px 22px 70px 0px;
  --shadow-xl-3: rgba(61, 0, 23, 0.45) 0px 32px 64px -16px;
  --shadow-xl-4: rgba(61, 0, 23, 0.45) 0px 18px 40px -18px;

  /* Surfaces */
  --surface-cream-paper: #faf9f1;
  --surface-white-card: #ffffff;
  --surface-blush-panel: #f8e2db;
  --surface-baba-red-field: #bc2823;
  --surface-ink-surface: #2a1d18;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-baba-red: #bc2823;
  --color-signal-red: #ea1111;
  --color-red-light: #cc5c56;
  --color-cream-paper: #faf9f1;
  --color-white: #ffffff;
  --color-ink: #2a1d18;
  --color-soft-ink: #3e312c;
  --color-warm-gray: #645953;
  --color-paper-divider: #ede7e2;
  --color-blush: #f8e2db;

  /* Typography */
  --font-shne: 'Söhne', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-atkinson-hyperlegible-next: 'Atkinson Hyperlegible Next', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-eyebrow: 13px;
  --leading-eyebrow: 1.25;
  --tracking-eyebrow: 0.325px;
  --text-nav: 15px;
  --leading-nav: 1.63;
  --tracking-nav: 0px;
  --text-card-heading: 16px;
  --leading-card-heading: 1.5;
  --tracking-card-heading: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-heading: 36px;
  --leading-heading: 1.15;
  --tracking-heading: -0.72px;
  --text-statistic: 54px;
  --leading-statistic: 1;
  --tracking-statistic: 0px;
  --text-section-heading: 56px;
  --leading-section-heading: 1.05;
  --tracking-section-heading: -1.68px;
  --text-display: 68px;
  --leading-display: 1;
  --tracking-display: -2.04px;

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
  --spacing-56: 56px;
  --spacing-64: 64px;
  --spacing-72: 72px;
  --spacing-80: 80px;
  --spacing-88: 88px;
  --spacing-128: 128px;

  /* Border Radius */
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;
  --radius-3xl-2: 32px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-subtle: rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px;
  --shadow-xl: rgba(42, 29, 24, 0.16) 0px 12px 30px 0px;
  --shadow-xl-2: rgba(0, 0, 0, 0.28) 0px 22px 70px 0px;
  --shadow-xl-3: rgba(61, 0, 23, 0.45) 0px 32px 64px -16px;
  --shadow-xl-4: rgba(61, 0, 23, 0.45) 0px 18px 40px -18px;
}
```
