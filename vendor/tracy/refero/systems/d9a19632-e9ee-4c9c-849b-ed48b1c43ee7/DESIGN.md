# Nuxt — Style Reference
> terminal glow in deep space. Build dark, contained interface planes where green appears as a switched-on signal against blue-black surfaces.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Nuxt — terminal-lit framework workshop. The site holds a near-black blue canvas beneath a thin, glassy header, then punctuates documentation-like density with white display type and electric #00dc82 green. Large 72px and 48px Public Sans headlines are tightly tracked and bluntly bold, while compact feature copy, hairline outlines, code panes, and quiet muted-blue navigation keep the page grounded in a developer tool rather than a promotional poster.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Void Canvas | `#020618` | `--color-void-canvas` | Page background, header field, dark controls, command surfaces |
| Midnight Panel | `#080e21` | `--color-midnight-panel` | Card surfaces, code-editor body, contained product panels |
| Deep Slate | `#0f172b` | `--color-deep-slate` | Selected dark tabs, secondary dark buttons, inset control surfaces |
| Steel Outline | `#1d293d` | `--color-steel-outline` | Hairline card outlines, image frames, dark raised button fills |
| Blue Steel | `#314158` | `--color-blue-steel` | Inset control rings, subdued control borders, navigation separators |
| Muted Fog | `#90a1b9` | `--color-muted-fog` | Body copy, inactive navigation, secondary labels, supporting metadata |
| Pale Frost | `#e2e8f0` | `--color-pale-frost` | High-emphasis navigation text, secondary button labels, light icon strokes |
| Signal White | `#ffffff` | `--color-signal-white` | Display headings, selected tab labels, inverted button fills |
| Nuxt Signal | `#00dc82` | `--color-nuxt-signal` | Filled getting-started buttons, logo, release markers, highlighted display words — vivid green acts as a precise activation signal in the blue-black interface |
| Vue Link | `#42b883` | `--color-vue-link` | Partner-technology links and small ecosystem references |
| Vite Link | `#a156fe` | `--color-vite-link` | Vite ecosystem links and compact technology references |
| Nitro Link | `#fb848e` | `--color-nitro-link` | Nitro ecosystem links and compact technology references |

## Tokens — Typography

### Public Sans — The universal UI and editorial face: 16px/400 body text, 14px/500 navigation, 14px/600 section labels, 16px/500 buttons, and 48px or 72px/700 displays. The -0.025em tracking at 48px and 72px compresses the heavy display weight into framework-tool directness rather than oversized marketing softness. · `--font-public-sans`
- **Substitute:** Inter, Arial, sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 14px, 15px, 16px, 18px, 20px, 48px, 72px
- **Line height:** 1.00, 1.14, 1.20, 1.33, 1.40, 1.43, 1.50, 1.56, 1.60, 1.71
- **Letter spacing:** -1.2px at 48px and -1.8px at 72px; normal at UI sizes
- **Role:** The universal UI and editorial face: 16px/400 body text, 14px/500 navigation, 14px/600 section labels, 16px/500 buttons, and 48px or 72px/700 displays. The -0.025em tracking at 48px and 72px compresses the heavy display weight into framework-tool directness rather than oversized marketing softness.

### ui-monospace — Code editor content, terminal commands, and implementation snippets; the system monospace face makes product demonstrations read as live tooling rather than decorative mockups. · `--font-ui-monospace`
- **Substitute:** SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.71
- **Letter spacing:** normal
- **Role:** Code editor content, terminal commands, and implementation snippets; the system monospace face makes product demonstrations read as live tooling rather than decorative mockups.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| micro-label | Public Sans | 500 | 10px | 1.2 | 0px | `--text-micro-label` |
| caption | Public Sans | 400 | 12px | 1.33 | 0px | `--text-caption` |
| nav | Public Sans | 500 | 14px | 1.43 | 0px | `--text-nav` |
| feature-title | Public Sans | 600 | 14px | 1.43 | 0px | `--text-feature-title` |
| code | ui-monospace | 400 | 14px | 1.71 | 0px | `--text-code` |
| body | Public Sans | 400 | 16px | 1.5 | 0px | `--text-body` |
| body-strong | Public Sans | 500 | 16px | 1.5 | 0px | `--text-body-strong` |
| eyebrow-heading | Public Sans | 500 | 18px | 1.56 | 0px | `--text-eyebrow-heading` |
| section-display | Public Sans | 700 | 48px | 1 | -1.2px | `--text-section-display` |
| hero-display | Public Sans | 700 | 72px | 1 | -1.8px | `--text-hero-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** compact

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
| 44 | 44px | `--spacing-44` |
| 48 | 48px | `--spacing-48` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 96 | 96px | `--spacing-96` |
| 128 | 128px | `--spacing-128` |

### Border Radius

| Element | Value |
|---------|-------|
| tabs | 6px |
| cards | 8px |
| pills | 16777200px |
| images | 6px |
| inputs | 6px |
| buttons | 6px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `oklch(0.279 0.041 260.031) 0px 0px 0px 1px` | `--shadow-subtle` |
| subtle-2 | `oklch(0.372 0.044 257.287) 0px 0px 0px 1px inset` | `--shadow-subtle-2` |
| subtle-3 | `oklab(0.786145 -0.174855 0.0792278 / 0.25) 0px 0px 0px 1p...` | `--shadow-subtle-3` |
| subtle-4 | `oklch(0.279 0.041 260.031) 0px 0px 0px 0px` | `--shadow-subtle-4` |

### Layout

- **Page max-width:** 1440px
- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 8px

## Components

### Global Header
**Role:** 64px-tall top navigation with brand, documentation links, utility controls, and repository count

Use a 64px-high Void Canvas #020618 bar with a 1px Steel Outline #1d293d bottom divider. Keep navigation at 14px/500 Public Sans in Muted Fog #90a1b9, reserve Pale Frost #e2e8f0 for active utility labels, and space compact groups on the 8px grid.

### Release Announcement Pill
**Role:** Small version or release-status link

Set 12px/600 Public Sans Nuxt Signal #00dc82 inside a fully pill-shaped 16777200px-radius control. Use a 6px internal rhythm and keep the treatment compact enough to sit above a hero heading.

### Nuxt Signal Button
**Role:** Filled public conversion button

Use a #00dc82 fill, 6px radius, and 8px 12px padding. Label text is 16px/500 Public Sans in Deep Slate #0f172b; do not add a drop shadow.

### White Utility Button
**Role:** High-contrast secondary public button

Use Signal White #ffffff fill with Deep Slate #0f172b text, 16px/500 Public Sans, 6px radius, and 8px 12px padding. This is the light counterweight to the green conversion button.

### Dark Outline Button
**Role:** Secondary media, navigation, or product-demo control

Use transparent or Void Canvas #020618 backing with Pale Frost #e2e8f0 text, a 1px inset Blue Steel #314158 ring, 6px radius, and 6px 10px padding. Maintain 16px/500 Public Sans for labeled controls.

### Ghost Navigation Control
**Role:** Low-emphasis text control for inactive nav and tab choices

Use transparent background, Muted Fog #90a1b9 text, 4px radius, and no added padding beyond its navigation layout. Keep labels at 14px/500 Public Sans and separate adjacent items by 16px or 24px.

### Editor Demonstration Panel
**Role:** Contained product showcase with a tab rail, file tree, and code area

Build the outer panel on Midnight Panel #080e21 with an 8px radius and 1px Steel Outline #1d293d ring. Use Deep Slate #0f172b for the selected file row, Signal White #ffffff for selected labels, Muted Fog #90a1b9 for inactive tabs, and 14px/400 ui-monospace for code.

### Editor Tab
**Role:** Product-demo mode selector

Use a 6px radius tab with 6px 10px padding; selected tabs sit on Deep Slate #0f172b with Signal White #ffffff text, while unselected tabs are transparent with Muted Fog #90a1b9 text.

### Module Repository Card
**Role:** Carousel item for a package, description, and repository metrics

Use Midnight Panel #080e21 with an 8px radius and a 1px Steel Outline #1d293d ring. Apply 12px internal padding, 16px/500 Pale Frost #e2e8f0 package text, 14px/400 Muted Fog #90a1b9 description text, and 8px gaps between icon, title, and metrics.

### Feature Capability Item
**Role:** Borderless feature-grid cell

Keep the cell flush to Void Canvas #020618 with no card fill or shadow. Use a small Nuxt Signal #00dc82 outline icon, a 14px/600 Pale Frost #e2e8f0 title, 14px/400 Muted Fog #90a1b9 copy, and 8px vertical separation.

### Command Snippet
**Role:** Copyable installation or terminal command

Use Void Canvas #020618 with a 1px Steel Outline #1d293d border and 6px radius. Set the command in 14px/400 ui-monospace with Pale Frost #e2e8f0 text, use 8px vertical and 12px horizontal padding, and place a compact copy icon at the trailing edge.

### Carousel Pagination Dot
**Role:** Compact state indicator below horizontal card collections

Use small circular markers on Void Canvas #020618 with 6px gaps. The active marker is Signal White #ffffff; inactive markers use Steel Outline #1d293d.

## Do's and Don'ts

### Do
- Use Void Canvas #020618 as the default page field and Midnight Panel #080e21 for contained product surfaces.
- Set display headlines in Public Sans 700 at 72px/72px or 48px/48px with -1.8px or -1.2px tracking.
- Use Nuxt Signal #00dc82 for filled getting-started actions, release markers, logo treatment, and isolated headline emphasis.
- Apply 6px radii to controls and inputs; use 8px radii for standard cards.
- Build spacing from the 4px base unit, using 8px element gaps, 12px card padding, and 64px section gaps.
- Outline panels and controls with 1px Steel Outline #1d293d or inset Blue Steel #314158 rings instead of soft cast shadows.
- Keep body and inactive navigation copy in Muted Fog #90a1b9; reserve Signal White #ffffff for headings and selected states.

### Don't
- Do not use gradients; the interface relies on flat blue-black planes and single-color green punctuation.
- Do not round controls into 9999px pills except compact release markers and badge-like status controls.
- Do not use shadows with blur or vertical offset; use the 0 0 0 1px #1d293d panel ring.
- Do not turn all buttons green; use #00dc82 only for conversion-oriented public actions and use dark or white utility variants elsewhere.
- Do not introduce large soft cards around feature-grid items; feature cells remain borderless on #020618.
- Do not set display headings at semibold weights or positive tracking; retain Public Sans 700 and -0.025em tracking.
- Do not use ecosystem link colors #42b883, #a156fe, or #fb848e as global semantic status colors.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Void Canvas | `#020618` | Global page field, header, dark command controls |
| 1 | Midnight Panel | `#080e21` | Cards, editor bodies, contained module surfaces |
| 2 | Deep Slate | `#0f172b` | Selected editor rows, dark button fills, inset control states |
| 3 | Steel Outline | `#1d293d` | Panel boundaries, image frames, subtle raised dark controls |

## Elevation

Elevation is drawn as exact 1px perimeter or inset rings, never as floating blur. Panels use 0 0 0 1px #1d293d, while compact controls use 0 0 0 1px inset #314158; this keeps every surface reading like an editor pane or terminal window.

## Imagery

The page is text- and UI-dominant, with the editor demonstration serving as the hero visual and repository cards acting as product-data tiles. Graphics are contained rather than full-bleed: dark framed panes, small monochrome or green line icons, and compact code syntax sit on blue-black fields. There is no lifestyle photography, illustration, or decorative gradient atmosphere; visual space is allocated to real interface anatomy, file trees, tabs, command snippets, and metrics.

## Layout

The page is a full-width, blue-black documentation-marketing composition within a 1440px container system. A fixed-feeling 64px top bar runs across the canvas; the hero below uses a left-aligned text block and right-aligned editor demonstration, with a release pill above the 72px display and a small command line below the action row. Subsequent sections are separated by thin horizontal rules and broad 64px vertical rhythm: a left-aligned 48px heading introduces a four-column feature grid, then a left-aligned modules introduction leads into a three-card horizontal carousel with centered pagination dots. Content stays compact inside sections, with 8px and 16px local gaps, rather than alternating into large colored bands.

## Agent Prompt Guide

Quick Color Reference:
- Void Canvas: #020618 — Page background, header field, dark controls, command surfaces
- Midnight Panel: #080e21 — Card surfaces, code-editor body, contained product panels
- Deep Slate: #0f172b — Selected dark tabs, secondary dark buttons, inset control surfaces
- Steel Outline: #1d293d — Hairline card outlines, image frames, dark raised button fills
- Blue Steel: #314158 — Inset control rings, subdued control borders, navigation separators
- Muted Fog: #90a1b9 — Body copy, inactive navigation, secondary labels, supporting metadata
- Pale Frost: #e2e8f0 — High-emphasis navigation text, secondary button labels, light icon strokes
- Signal White: #ffffff — Display headings, selected tab labels, inverted button fills
- Nuxt Signal: #00dc82 — Filled getting-started buttons, logo, release markers, highlighted display words — vivid green acts as a precise activation signal in the blue-black interface
- Vue Link: #42b883 — Partner-technology links and small ecosystem references
- Vite Link: #a156fe — Vite ecosystem links and compact technology references
- Nitro Link: #fb848e — Nitro ecosystem links and compact technology references

Create a left-aligned framework hero on Void Canvas #020618 with a Public Sans 72px/72px 700 white headline at -1.8px tracking; color one short phrase Nuxt Signal #00dc82 and place an 8px-radius Midnight Panel #080e21 code editor to the right.
Create a 4-column feature grid on Void Canvas #020618: each borderless cell has a Nuxt Signal #00dc82 outline icon, a 14px/20px Public Sans 600 Pale Frost #e2e8f0 title, and 14px/24px Muted Fog #90a1b9 copy.
Create a 3-card module carousel using 8px-radius Midnight Panel #080e21 cards with 1px Steel Outline #1d293d rings, 12px padding, Pale Frost #e2e8f0 package names, and Muted Fog #90a1b9 metadata.
Create a command snippet with 14px/24px ui-monospace Pale Frost #e2e8f0 text on Void Canvas #020618, a 1px Steel Outline #1d293d border, 6px radius, and 8px by 12px padding.
Create a public action pair: a Nuxt Signal #00dc82 6px-radius button with 16px/24px Public Sans 500 Deep Slate #0f172b text beside a dark outlined control with Pale Frost #e2e8f0 text and a 1px inset Blue Steel #314158 ring.

## Similar Brands

- **Vercel** — Dark developer-platform pages use high-contrast typography, contained product demonstrations, and hairline interface framing.
- **Astro** — Framework marketing combines oversized technical headlines with documentation-like feature grids and compact developer controls.
- **Svelte** — Open-source framework presentation uses bold product messaging alongside code and ecosystem content rather than lifestyle imagery.
- **Linear** — Dark surfaces are separated by precise low-contrast borders and sparse saturated accent color.
- **Raycast** — Product visuals are framed as dark, dense application panes with restrained navigation and compact utility controls.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-void-canvas: #020618;
  --color-midnight-panel: #080e21;
  --color-deep-slate: #0f172b;
  --color-steel-outline: #1d293d;
  --color-blue-steel: #314158;
  --color-muted-fog: #90a1b9;
  --color-pale-frost: #e2e8f0;
  --color-signal-white: #ffffff;
  --color-nuxt-signal: #00dc82;
  --color-vue-link: #42b883;
  --color-vite-link: #a156fe;
  --color-nitro-link: #fb848e;

  /* Typography — Font Families */
  --font-public-sans: 'Public Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-ui-monospace: 'ui-monospace', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-micro-label: 10px;
  --leading-micro-label: 1.2;
  --tracking-micro-label: 0px;
  --text-caption: 12px;
  --leading-caption: 1.33;
  --tracking-caption: 0px;
  --text-nav: 14px;
  --leading-nav: 1.43;
  --tracking-nav: 0px;
  --text-feature-title: 14px;
  --leading-feature-title: 1.43;
  --tracking-feature-title: 0px;
  --text-code: 14px;
  --leading-code: 1.71;
  --tracking-code: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.5;
  --tracking-body-strong: 0px;
  --text-eyebrow-heading: 18px;
  --leading-eyebrow-heading: 1.56;
  --tracking-eyebrow-heading: 0px;
  --text-section-display: 48px;
  --leading-section-display: 1;
  --tracking-section-display: -1.2px;
  --text-hero-display: 72px;
  --leading-hero-display: 1;
  --tracking-hero-display: -1.8px;

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
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-128: 128px;

  /* Layout */
  --page-max-width: 1440px;
  --section-gap: 64px;
  --card-padding: 12px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-md: 6px;
  --radius-2xl: 16px;

  /* Named Radii */
  --radius-tabs: 6px;
  --radius-cards: 8px;
  --radius-pills: 16777200px;
  --radius-images: 6px;
  --radius-inputs: 6px;
  --radius-buttons: 6px;

  /* Shadows */
  --shadow-subtle: oklch(0.279 0.041 260.031) 0px 0px 0px 1px;
  --shadow-subtle-2: oklch(0.372 0.044 257.287) 0px 0px 0px 1px inset;
  --shadow-subtle-3: oklab(0.786145 -0.174855 0.0792278 / 0.25) 0px 0px 0px 1px inset;
  --shadow-subtle-4: oklch(0.279 0.041 260.031) 0px 0px 0px 0px;

  /* Surfaces */
  --surface-void-canvas: #020618;
  --surface-midnight-panel: #080e21;
  --surface-deep-slate: #0f172b;
  --surface-steel-outline: #1d293d;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-void-canvas: #020618;
  --color-midnight-panel: #080e21;
  --color-deep-slate: #0f172b;
  --color-steel-outline: #1d293d;
  --color-blue-steel: #314158;
  --color-muted-fog: #90a1b9;
  --color-pale-frost: #e2e8f0;
  --color-signal-white: #ffffff;
  --color-nuxt-signal: #00dc82;
  --color-vue-link: #42b883;
  --color-vite-link: #a156fe;
  --color-nitro-link: #fb848e;

  /* Typography */
  --font-public-sans: 'Public Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-ui-monospace: 'ui-monospace', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-micro-label: 10px;
  --leading-micro-label: 1.2;
  --tracking-micro-label: 0px;
  --text-caption: 12px;
  --leading-caption: 1.33;
  --tracking-caption: 0px;
  --text-nav: 14px;
  --leading-nav: 1.43;
  --tracking-nav: 0px;
  --text-feature-title: 14px;
  --leading-feature-title: 1.43;
  --tracking-feature-title: 0px;
  --text-code: 14px;
  --leading-code: 1.71;
  --tracking-code: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.5;
  --tracking-body-strong: 0px;
  --text-eyebrow-heading: 18px;
  --leading-eyebrow-heading: 1.56;
  --tracking-eyebrow-heading: 0px;
  --text-section-display: 48px;
  --leading-section-display: 1;
  --tracking-section-display: -1.2px;
  --text-hero-display: 72px;
  --leading-hero-display: 1;
  --tracking-hero-display: -1.8px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-128: 128px;

  /* Border Radius */
  --radius-md: 6px;
  --radius-2xl: 16px;

  /* Shadows */
  --shadow-subtle: oklch(0.279 0.041 260.031) 0px 0px 0px 1px;
  --shadow-subtle-2: oklch(0.372 0.044 257.287) 0px 0px 0px 1px inset;
  --shadow-subtle-3: oklab(0.786145 -0.174855 0.0792278 / 0.25) 0px 0px 0px 1px inset;
  --shadow-subtle-4: oklch(0.279 0.041 260.031) 0px 0px 0px 0px;
}
```
