# Captions — Style Reference
> Sunlit editing desk. Float a translucent rounded navigation bar over a paper-white, subtly noisy workspace, then punctuate it with pale-air-blue production surfaces and tightly cropped creator footage.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Captions — sunlit editing desk beneath frosted glass. The page is a white, lightly grain-textured canvas where charcoal editorial headlines sit above soft blue editor surfaces and human video thumbnails. Exposure headlines use a serif-like, slightly compressed voice at 48px, while DenimINK keeps navigation, controls, FAQs, and supporting copy compact and conversational. Color is withheld from public conversion controls: white outlined actions and dark ink buttons carry navigation, while electric cyan is reserved for selected in-product editing tools.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Paper White | `#ffffff` | `--color-paper-white` | Page canvas, footer, white cards, upload controls, and outlined public controls |
| Air Wash | `#effbff` | `--color-air-wash` | Pale editor surfaces, soft feature-media cards, and quiet selected-control fills |
| Mist Border | `#e8eff2` | `--color-mist-border` | Low-contrast section rules, upload-zone boundaries, and recessed editor framing |
| Steel Inset | `#d0d6d7` | `--color-steel-inset` | Fine outlined-control borders and 0.5px inset outlines |
| Ash Copy | `#7e8486` | `--color-ash-copy` | Supporting paragraphs, legal text, secondary links, and muted metadata |
| Graphite Copy | `#434647` | `--color-graphite-copy` | Secondary headings, inline links, and medium-emphasis explanatory text |
| Editorial Ink | `#2a2c2d` | `--color-editorial-ink` | Exposure display headlines, compact editor labels, and hero text |
| Charcoal | `#1d1f20` | `--color-charcoal` | Navigation text, body copy, dark filled controls, icon strokes, and strong borders |
| Prism Cyan | `#00d0ff` | `--color-prism-cyan` | Selected in-product tool labels and small editor icon details — a cool digital cue inside otherwise monochrome controls |
| Sky Fade | `linear-gradient(180deg, #effbff 40%, #a6ecff 100%)` | `--color-sky-fade` | Feature-panel atmosphere and pale blue visual transitions |
| Cyan Halo | `#ccf6ff` | `--color-cyan-halo` | Subtle Prism Cyan control halo and selected-tool inset accent |

## Tokens — Typography

### Exposure-09cb373df0d2138c — Display and section headlines. The 48px headings use -0.48px tracking; their broad, editorial forms make the product proposition feel typeset rather than software-standard. · `--font-exposure-09cb373df0d2138c`
- **Substitute:** Libre Baskerville, Georgia, serif
- **Weights:** 400
- **Sizes:** 16px, 48px, 72px
- **Line height:** 1.00, 1.10, 1.30, 1.41
- **Letter spacing:** -0.48px at 48px; normal at 16px and 72px
- **Role:** Display and section headlines. The 48px headings use -0.48px tracking; their broad, editorial forms make the product proposition feel typeset rather than software-standard.

### DenimINK-fc4757ccf169d42a — Navigation, buttons, body copy, FAQs, labels, and feature titles. Its restrained 400-weight controls and lightly spaced 13–14px utility text make the editing interface feel like a toolset rather than a campaign page. · `--font-denimink-fc4757ccf169d42a`
- **Substitute:** Inter, Arial, sans-serif
- **Weights:** 400, 500
- **Sizes:** 11px, 13px, 14px, 16px, 18px, 24px, 32px, 48px
- **Line height:** 1.00, 1.20, 1.30, 1.33, 1.38, 1.45, 1.71
- **Letter spacing:** -0.24px at 24px; normal at 16–32px; +0.14px at 14px; +0.30px at 13px; +0.22px at 11px
- **Role:** Navigation, buttons, body copy, FAQs, labels, and feature titles. Its restrained 400-weight controls and lightly spaced 13–14px utility text make the editing interface feel like a toolset rather than a campaign page.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| utility | DenimINK-fc4757ccf169d42a | 500 | 11px | 1.45 | 0.22px | `--text-utility` |
| caption | DenimINK-fc4757ccf169d42a | 400 | 13px | 1.38 | 0.299px | `--text-caption` |
| editor-label | DenimINK-fc4757ccf169d42a | 500 | 14px | 1.71 | 0.14px | `--text-editor-label` |
| nav | DenimINK-fc4757ccf169d42a | 400 | 16px | 1.2 | 0px | `--text-nav` |
| body | DenimINK-fc4757ccf169d42a | 400 | 16px | 1.33 | 0px | `--text-body` |
| feature-label | DenimINK-fc4757ccf169d42a | 500 | 18px | 1.3 | 0px | `--text-feature-label` |
| card-heading | DenimINK-fc4757ccf169d42a | 400 | 24px | 1 | -0.24px | `--text-card-heading` |
| feature-heading | DenimINK-fc4757ccf169d42a | 400 | 32px | 1 | 0px | `--text-feature-heading` |
| hero-display | Exposure-09cb373df0d2138c | 400 | 48px | 1.41 | -0.48px | `--text-hero-display` |
| section-display | Exposure-09cb373df0d2138c | 400 | 48px | 1 | -0.48px | `--text-section-display` |
| display-xl | Exposure-09cb373df0d2138c | 400 | 72px | 1.1 | 0px | `--text-display-xl` |

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
| 44 | 44px | `--spacing-44` |
| 52 | 52px | `--spacing-52` |
| 60 | 60px | `--spacing-60` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 100 | 100px | `--spacing-100` |
| 160 | 160px | `--spacing-160` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 12px |
| pills | 9999px |
| badges | 15px |
| images | 20px |
| inputs | 12px |
| buttons | 12px |
| editorAction | 58px |
| featureMedia | 40px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `rgb(208, 214, 215) 0px 0px 0px 0.5px inset` | `--shadow-subtle` |
| md | `rgba(0, 0, 0, 0.05) 0px 4px 10px 0px` | `--shadow-md` |
| xl | `rgba(190, 210, 235, 0.45) 0px 0px 80px 0px` | `--shadow-xl` |
| subtle-2 | `color(srgb 0 0.815686 1 / 0.2) 0px 0px 0px 0.5px inset` | `--shadow-subtle-2` |

### Layout

- **Section gap:** 160px
- **Card padding:** 20px
- **Element gap:** 16px

## Components

### Floating Frosted Header
**Role:** Persistent public-site navigation shell.

Use a white translucent surface over page content with a 120px backdrop blur, 1px #d0d6d7 outline, and a 30px radius. Keep the logo left, centered 16px DenimINK navigation, and a compact outlined account control at the far right.

### Navigation Link
**Role:** Top-level public navigation and menu triggers.

Set in DenimINK 400 at 16px with Charcoal #1d1f20 text; arrange links with 16px internal gaps. Dropdown triggers use the same text treatment with a small ink chevron.

### Outlined Sign-up Pill
**Role:** Header conversion link.

Use Paper White #ffffff, Charcoal #1d1f20 text in DenimINK 500 at 16px, a 1px Charcoal border, and a 9999px radius. Keep 11px vertical and 16px horizontal padding.

### Dark Ink Button
**Role:** High-commitment filled public or product action.

Fill with Charcoal #1d1f20 and set Paper White #ffffff text; use a 12px radius and the standard 0.5px #d0d6d7 inset edge only when it appears among adjacent pale controls.

### Editor Utility Button
**Role:** Compact in-product action such as edit mode selection.

Use Paper White #ffffff with Editorial Ink #2a2c2d text, a 0.5px #d0d6d7 border, 58px radius, and 11px 12px 11px 16px padding. The long pill silhouette distinguishes editor utilities from square public controls.

### Prism Tool Chip
**Role:** Selected AI editing option inside the product demonstration.

Use an Air Wash #effbff fill with a 12px radius and a Cyan Halo #ccf6ff 0 0 0 0.5px inset shadow. Set the selected tool label in Prism Cyan #00d0ff; do not reuse cyan for public conversion buttons.

### Video Upload Workspace
**Role:** Hero product-demo drop zone.

Place a Paper White #ffffff editor shell on an Air Wash #effbff workspace with 12px radius and a 1px Mist Border #e8eff2 edge. Center a small stacked-footage illustration and DenimINK 500 14px upload prompt; reserve a narrow control strip below with 12px gaps.

### Style Thumbnail Card
**Role:** Selectable AI-edit visual treatment.

Use portrait video imagery inside a 12px-radius card, with a Charcoal #1d1f20 border on the selected thumbnail. Put the style label below in compact DenimINK text; preserve the four-up, tightly spaced thumbnail rhythm.

### Pale Blue Feature Media Card
**Role:** Feature visual container for vertical video demonstrations.

Use Air Wash #effbff with 20px side padding, 20px top padding, 40px bottom padding, and a 40px radius. Frame the vertical video inside with a 20px radius; fade the container toward Sky Fade #a6ecff from mid-card downward.

### Feature Copy Stack
**Role:** Paired explanatory copy beside a product video.

Set feature titles in DenimINK 400 at 32px with a 32px line height and Charcoal #1d1f20. Supporting paragraphs use DenimINK 400 at 16px/20.8px in Ash Copy #7e8486; separate stacked feature points with a 1px Mist Border #e8eff2 rule.

### FAQ Accordion Row
**Role:** Expandable question list.

Use a full-width Paper White #ffffff row with a 1px Mist Border #e8eff2 bottom rule, DenimINK 400 question text in Charcoal #1d1f20, and a small ink plus aligned right. Keep the row spacious rather than card-contained; no shadow or filled hover panel.

### Footer Link Column
**Role:** Dense lower-page navigation.

Keep the footer on Paper White #ffffff. Use DenimINK labels and links in Charcoal #1d1f20, with secondary legal and auxiliary links in Ash Copy #7e8486 at 13px/18px with +0.325px tracking.

## Do's and Don'ts

### Do
- Use Paper White #ffffff as the dominant canvas and retain the subtle grain texture across broad page surfaces.
- Set display headlines in Exposure 400 at 48px with -0.48px tracking; use 67.68px line height for multi-line hero headlines and 48px for concise section headlines.
- Use DenimINK 400 at 16px for public navigation, body copy, and standard controls.
- Separate major page sections with the 160px section gap.
- Use 12px radii for standard cards and controls, 40px for pale feature-media containers, and 9999px only for compact pill controls.
- Give repeated white controls a 0.5px inset outline in Steel Inset #d0d6d7 instead of a heavy drop shadow.
- Keep Prism Cyan #00d0ff inside selected product-editing chips, labels, and icon details.

### Don't
- Do not replace the Paper White #ffffff canvas with gray section bands; reserve Air Wash #effbff for editor and media surfaces.
- Do not use Prism Cyan #00d0ff as a universal public CTA fill.
- Do not set public navigation heavier than DenimINK 400 at 16px.
- Do not round every media element to 12px; use the 20px image radius inside 40px feature-media cards.
- Do not add broad dark shadows to cards; cards are predominantly flat with borders, inset edges, or a single soft blue 0 0 80px rgba(190, 210, 235, 0.45) halo.
- Do not turn FAQ rows into detached cards; retain full-width rows and #e8eff2 divider rules.
- Do not introduce saturated status-color systems without product-state evidence.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Paper Canvas | `#ffffff` | Primary page, footer, white cards, and outlined controls. |
| 1 | Air Surface | `#effbff` | Editor workspace, selected product controls, and feature-media containers. |
| 2 | Mist Edge | `#e8eff2` | Recessed frames, low-contrast dividers, and upload-zone outlines. |
| 3 | Charcoal Surface | `#1d1f20` | Rare filled controls and strongest interface contrast. |

## Elevation

- **Prism Tool Chip:** `0 0 0 0.5px #ccf6ff inset`
- **Outlined Sign-up Pill:** `0 0 0 0.5px #d0d6d7 inset`
- **Pale Blue Feature Media Card:** `0 0 80px rgba(190, 210, 235, 0.45)`

## Imagery

The visual system is product-showcase-led: contained editor screenshots, portrait-oriented video tiles, and close human creator footage occupy the visual space rather than abstract illustration. Video frames are saturated but naturally lit, tightly cropped, and rounded at 12px or 20px, often shown as a selectable set within pale blue interface containers. Icons are sparse, monochrome line marks with occasional cyan tool emphasis; the page remains text-dominant outside the product demonstrations. A fine grain filter over white and pale-blue backgrounds prevents the broad empty surfaces from reading as sterile.

## Layout

The page runs as a centered, text-led landing page on a full white canvas, with a floating fixed header inset from the viewport edges. The hero centers a two-line Exposure headline above a large, contained editor workspace and a four-up strip of portrait video style thumbnails. Below, a centered 48px section heading opens a two-column editorial layout: stacked copy and divider-separated feature statements sit on the left while a large pale-blue rounded vertical-video card sits on the right. Lower content continues through broad white bands with generous 160px section rhythm before resolving into a full-width FAQ list of oversized divider rows and a dense footer.

## Agent Prompt Guide

Quick Color Reference:
- Paper White: #ffffff — Page canvas, footer, white cards, upload controls, and outlined public controls
- Air Wash: #effbff — Pale editor surfaces, soft feature-media cards, and quiet selected-control fills
- Mist Border: #e8eff2 — Low-contrast section rules, upload-zone boundaries, and recessed editor framing
- Steel Inset: #d0d6d7 — Fine outlined-control borders and 0.5px inset outlines
- Ash Copy: #7e8486 — Supporting paragraphs, legal text, secondary links, and muted metadata
- Graphite Copy: #434647 — Secondary headings, inline links, and medium-emphasis explanatory text
- Editorial Ink: #2a2c2d — Exposure display headlines, compact editor labels, and hero text
- Charcoal: #1d1f20 — Navigation text, body copy, dark filled controls, icon strokes, and strong borders
- Prism Cyan: #00d0ff — Selected in-product tool labels and small editor icon details — a cool digital cue inside otherwise monochrome controls
- Sky Fade: linear-gradient(180deg, #effbff 40%, #a6ecff 100%) — Feature-panel atmosphere and pale blue visual transitions
- Cyan Halo: #ccf6ff — Subtle Prism Cyan control halo and selected-tool inset accent

Create a centered landing-page hero on a Paper White #ffffff grain-textured canvas, with a two-line Exposure 400 headline at 48px/67.68px and -0.48px tracking in Editorial Ink #2a2c2d above a 12px-radius Air Wash #effbff video-upload workspace.
Create a fixed floating Frosted Header with a translucent white 30px-radius shell, 120px backdrop blur, DenimINK 400 16px Charcoal #1d1f20 navigation, and a Paper White outlined 9999px-radius sign-up pill in DenimINK 500 16px.
Create a two-column feature section separated from adjacent sections by 160px: left-side DenimINK 400 32px/32px Charcoal feature titles and Ash Copy #7e8486 16px/20.8px supporting text, right-side an Air Wash #effbff 40px-radius vertical-video card with 20px inner image rounding.
Create a full-width FAQ stack on Paper White #ffffff using DenimINK 400 16px Charcoal questions, right-aligned plus icons, and one 1px Mist Border #e8eff2 divider per row.

## Similar Brands

- **Descript** — Creator-video product demonstrations and editorially framed software workflows share the same product-as-proof approach.
- **Luma AI** — Pale atmospheric gradients paired with contained generative-media product visuals create a similar airy technology surface.
- **Arc** — A floating rounded navigation shell over an otherwise minimal canvas matches the same browser-like frosted control treatment.
- **Framer** — Large expressive display typography sits against intentionally sparse white sections and tightly controlled UI cards.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-paper-white: #ffffff;
  --color-air-wash: #effbff;
  --color-mist-border: #e8eff2;
  --color-steel-inset: #d0d6d7;
  --color-ash-copy: #7e8486;
  --color-graphite-copy: #434647;
  --color-editorial-ink: #2a2c2d;
  --color-charcoal: #1d1f20;
  --color-prism-cyan: #00d0ff;
  --color-sky-fade: #a6ecff;
  --gradient-sky-fade: linear-gradient(180deg, #effbff 40%, #a6ecff 100%);
  --color-cyan-halo: #ccf6ff;

  /* Typography — Font Families */
  --font-exposure-09cb373df0d2138c: 'Exposure-09cb373df0d2138c', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-denimink-fc4757ccf169d42a: 'DenimINK-fc4757ccf169d42a', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-utility: 11px;
  --leading-utility: 1.45;
  --tracking-utility: 0.22px;
  --text-caption: 13px;
  --leading-caption: 1.38;
  --tracking-caption: 0.299px;
  --text-editor-label: 14px;
  --leading-editor-label: 1.71;
  --tracking-editor-label: 0.14px;
  --text-nav: 16px;
  --leading-nav: 1.2;
  --tracking-nav: 0px;
  --text-body: 16px;
  --leading-body: 1.33;
  --tracking-body: 0px;
  --text-feature-label: 18px;
  --leading-feature-label: 1.3;
  --tracking-feature-label: 0px;
  --text-card-heading: 24px;
  --leading-card-heading: 1;
  --tracking-card-heading: -0.24px;
  --text-feature-heading: 32px;
  --leading-feature-heading: 1;
  --tracking-feature-heading: 0px;
  --text-hero-display: 48px;
  --leading-hero-display: 1.41;
  --tracking-hero-display: -0.48px;
  --text-section-display: 48px;
  --leading-section-display: 1;
  --tracking-section-display: -0.48px;
  --text-display-xl: 72px;
  --leading-display-xl: 1.1;
  --tracking-display-xl: 0px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;

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
  --spacing-44: 44px;
  --spacing-52: 52px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-100: 100px;
  --spacing-160: 160px;

  /* Layout */
  --section-gap: 160px;
  --card-padding: 20px;
  --element-gap: 16px;

  /* Border Radius */
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-xl-2: 15px;
  --radius-2xl: 20px;
  --radius-3xl: 30px;
  --radius-3xl-2: 40px;
  --radius-full: 58px;
  --radius-full-2: 9999px;

  /* Named Radii */
  --radius-cards: 12px;
  --radius-pills: 9999px;
  --radius-badges: 15px;
  --radius-images: 20px;
  --radius-inputs: 12px;
  --radius-buttons: 12px;
  --radius-editoraction: 58px;
  --radius-featuremedia: 40px;

  /* Shadows */
  --shadow-subtle: rgb(208, 214, 215) 0px 0px 0px 0.5px inset;
  --shadow-md: rgba(0, 0, 0, 0.05) 0px 4px 10px 0px;
  --shadow-xl: rgba(190, 210, 235, 0.45) 0px 0px 80px 0px;
  --shadow-subtle-2: color(srgb 0 0.815686 1 / 0.2) 0px 0px 0px 0.5px inset;

  /* Surfaces */
  --surface-paper-canvas: #ffffff;
  --surface-air-surface: #effbff;
  --surface-mist-edge: #e8eff2;
  --surface-charcoal-surface: #1d1f20;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-paper-white: #ffffff;
  --color-air-wash: #effbff;
  --color-mist-border: #e8eff2;
  --color-steel-inset: #d0d6d7;
  --color-ash-copy: #7e8486;
  --color-graphite-copy: #434647;
  --color-editorial-ink: #2a2c2d;
  --color-charcoal: #1d1f20;
  --color-prism-cyan: #00d0ff;
  --color-sky-fade: #a6ecff;
  --color-cyan-halo: #ccf6ff;

  /* Typography */
  --font-exposure-09cb373df0d2138c: 'Exposure-09cb373df0d2138c', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-denimink-fc4757ccf169d42a: 'DenimINK-fc4757ccf169d42a', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-utility: 11px;
  --leading-utility: 1.45;
  --tracking-utility: 0.22px;
  --text-caption: 13px;
  --leading-caption: 1.38;
  --tracking-caption: 0.299px;
  --text-editor-label: 14px;
  --leading-editor-label: 1.71;
  --tracking-editor-label: 0.14px;
  --text-nav: 16px;
  --leading-nav: 1.2;
  --tracking-nav: 0px;
  --text-body: 16px;
  --leading-body: 1.33;
  --tracking-body: 0px;
  --text-feature-label: 18px;
  --leading-feature-label: 1.3;
  --tracking-feature-label: 0px;
  --text-card-heading: 24px;
  --leading-card-heading: 1;
  --tracking-card-heading: -0.24px;
  --text-feature-heading: 32px;
  --leading-feature-heading: 1;
  --tracking-feature-heading: 0px;
  --text-hero-display: 48px;
  --leading-hero-display: 1.41;
  --tracking-hero-display: -0.48px;
  --text-section-display: 48px;
  --leading-section-display: 1;
  --tracking-section-display: -0.48px;
  --text-display-xl: 72px;
  --leading-display-xl: 1.1;
  --tracking-display-xl: 0px;

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
  --spacing-44: 44px;
  --spacing-52: 52px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-100: 100px;
  --spacing-160: 160px;

  /* Border Radius */
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-xl-2: 15px;
  --radius-2xl: 20px;
  --radius-3xl: 30px;
  --radius-3xl-2: 40px;
  --radius-full: 58px;
  --radius-full-2: 9999px;

  /* Shadows */
  --shadow-subtle: rgb(208, 214, 215) 0px 0px 0px 0.5px inset;
  --shadow-md: rgba(0, 0, 0, 0.05) 0px 4px 10px 0px;
  --shadow-xl: rgba(190, 210, 235, 0.45) 0px 0px 80px 0px;
  --shadow-subtle-2: color(srgb 0 0.815686 1 / 0.2) 0px 0px 0px 0.5px inset;
}
```
