# BAM Photographers — Style Reference
> gallery projection after midnight. Black canvas, blown-up white lettering, and cinematic image pairs make the site feel like a projected portfolio rather than a conventional editorial grid.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

BAM Photographers frames editorial automotive and lifestyle imagery against an uninterrupted black field, with white type behaving as a sparse navigational layer rather than a content block. The opening uses a monumental, high-contrast serif BAM Selected wordmark over a blurred grayscale atmosphere; portfolio content then cuts to edge-led photography with only small all-caps identifiers. Helveesti at 14px with unusually open 0.84px tracking gives navigation, captions, and labels a consistent art-book index quality.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Gallery Black | `#000000` | `--color-gallery-black` | Page background, navigation field, gallery gutters, and media-stage canvas |
| Projection White | `#ffffff` | `--color-projection-white` | Navigation, editorial labels, captions, logo lettering, and image-overlay text |
| Index Gray | `#999999` | `--color-index-gray` | Muted secondary index text and subdued metadata |

## Tokens — Typography

### Helveesti — The sole measured interface face for uppercase navigation, project metadata, captions, and small editorial labels. Its 0.06em tracking turns plain sans-serif text into widely spaced catalogue notation. · `--font-helveesti`
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.30
- **Letter spacing:** 0.84px at 14px
- **Role:** The sole measured interface face for uppercase navigation, project metadata, captions, and small editorial labels. Its 0.06em tracking turns plain sans-serif text into widely spaced catalogue notation.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| navigation-and-editorial-label | Helveesti | 400 | 14px | 1.3 | 0.84px | `--text-navigation-and-editorial-label` |

## Tokens — Spacing & Shapes

**Base unit:** 8px

**Density:** spacious

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 15 | 15px | `--spacing-15` |
| 20 | 20px | `--spacing-20` |
| 25 | 25px | `--spacing-25` |
| 72 | 72px | `--spacing-72` |
| 144 | 144px | `--spacing-144` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 0px |
| links | 0px |
| images | 15px |
| navigation | 0px |

### Layout

- **Section gap:** 72px
- **Card padding:** 0px
- **Element gap:** 20px

## Components

### Four-Column Top Navigation
**Role:** Persistent portfolio navigation

Set on Gallery Black with a 48px-tall band, 15px vertical padding, and 25px horizontal edge padding. Distribute the four navigation groups across the full width; use Projection White Helveesti 14px/18.2px, weight 400, uppercase, with 0.84px tracking.

### Active Navigation Label
**Role:** Current gallery category

Use the same Projection White Helveesti 14px/18.2px uppercase label as the top navigation, adding a thin white underline directly beneath the active text. Keep the label background transparent and radius 0px.

### Editorial Navigation Label
**Role:** Inactive category and contact link

Use transparent background, no border, 0px radius, and Projection White Helveesti 14px/18.2px with 0.84px tracking. Do not introduce filled navigation buttons.

### BAM Selected Display Lockup
**Role:** Opening-page identity mark

Render as a large custom high-contrast serif wordmark in Projection White on Gallery Black; stack the two words tightly and let it dominate the opening viewport. This is display artwork, not a Helveesti heading; preserve its flared serif letterforms and do not replace it with a bold grotesk.

### Atmospheric Intro Backdrop
**Role:** Opening visual field behind the display lockup

Use full-bleed grayscale moving-image or photography treatment that falls from pale gray at the top into Gallery Black at the lower field. Keep edges square, overlays absent, and place the Projection White display lockup above it.

### Rounded Split Portfolio Pair
**Role:** Featured project entry

Place two equal visual panes side by side on Gallery Black with a narrow black gutter. Clip the outer media container with 15px corners; retain unpadded image content and no shadow.

### Portfolio Media Tile
**Role:** Automotive, portrait, or campaign image

Use photographic media edge to edge inside its pane with 0px internal padding and no border. In paired featured entries, inherit the 15px clipping of the parent container; standalone gallery media remains unframed against Gallery Black.

### Image Edge Caption
**Role:** Project name and collaborator identifier

Overlay small Projection White Helveesti at 14px/18.2px, weight 400, uppercase, and 0.84px tracking directly on photography. Keep the caption background transparent, borderless, and inset using the 20px element-gap token.

### Centered Portfolio Identifier
**Role:** BAM title and discipline line over gallery media

Center the white BAM Selected lockup over the top of a featured media pair, with a smaller Helveesti 14px/18.2px uppercase descriptor beneath it. Use no panel, blur, shadow, or badge behind the type.

## Do's and Don'ts

### Do
- Use Gallery Black #000000 as the uninterrupted page, navigation, and gallery-gutter background.
- Set measured interface text in Helveesti 14px, weight 400, 18.2px line-height, and 0.84px letter-spacing.
- Transform navigation, captions, and project identifiers to uppercase.
- Use 25px horizontal navigation padding and 15px vertical navigation padding within the 48px top bar.
- Keep gallery cards at 0px internal padding and use 15px radius only to clip featured image containers.
- Use 20px as the standard caption inset and immediate element gap; separate major gallery groups by 72px.
- Keep photo overlays as bare Projection White #ffffff text with no backing chip or translucent panel.

### Don't
- Do not use a light page canvas or off-white card surface in place of Gallery Black #000000.
- Do not introduce colored accents, gradients, semantic badges, or filled conversion buttons.
- Do not set interface labels below or above the measured 14px Helveesti treatment.
- Do not use heavy font weights for navigation, captions, or project labels; keep them at weight 400.
- Do not round navigation controls, captions, or ordinary gallery tiles; reserve 15px rounding for clipped featured media.
- Do not add card borders, drop shadows, or floating surface layers around photographs.
- Do not replace the oversized BAM Selected display mark with the Helveesti interface font.

## Elevation

Surfaces stay flush to Gallery Black: images gain separation through black gutters, crop, and occasional 15px clipping rather than shadows, borders, or raised panels.

## Imagery

Photography is the primary content: automotive motion shots, low-angle lifestyle portraiture, and monochrome or naturally muted campaign imagery. Images are oversized and nearly edge-to-edge, with no decorative frames; featured pairs are contained by a single 15px rounded outer crop while internal image edges remain hard. The first visual is treated as an abstracted, blurred grayscale atmosphere, while portfolio photography stays raw and cinematic. White, widely tracked labels sit directly on the media as project identifiers, making imagery occupy far more space than explanatory copy.

## Layout

The page is a full-bleed black portfolio sequence with a four-way top navigation bar spanning the upper edge. The opening screen places an oversized centered BAM Selected display lockup over a soft, grayscale, black-fading visual field; it is followed by a featured portfolio composition in which a centered white identity lockup overlaps two tall side-by-side photographs. Subsequent work should continue as edge-led image modules on black, using sparse image-edge captions and 72px separation between major project groups rather than contained text sections. The navigation remains visually minimal, with the active section marked only by an underline.

## Agent Prompt Guide

Quick Color Reference:
- Gallery Black: #000000 — Page background, navigation field, gallery gutters, and media-stage canvas
- Projection White: #ffffff — Navigation, editorial labels, captions, logo lettering, and image-overlay text
- Index Gray: #999999 — Muted secondary index text and subdued metadata

Create a 48px Gallery Black #000000 top navigation with four widely distributed Helveesti labels in Projection White #ffffff, 14px weight 400, 18.2px line-height, 0.84px tracking, 15px vertical padding, and 25px horizontal padding; underline only the active label.
Create a full-viewport Gallery Black #000000 opening with a blurred grayscale photographic field fading into black and an oversized centered Projection White #ffffff custom high-contrast serif BAM Selected wordmark; do not use Helveesti for the display mark.
Create a featured portfolio pair as two tall edge-to-edge campaign photographs with a narrow Gallery Black #000000 gutter and one shared 15px rounded outer crop; overlay bare Projection White #ffffff project labels in Helveesti 14px weight 400 with 0.84px tracking.
Create a centered identity overlay above the featured images with the white BAM Selected display lockup and a smaller Projection White #ffffff Helveesti descriptor at 14px/18.2px, uppercase, 0.84px tracking; use no backing panel or shadow.

## Similar Brands

- **Aesop** — Uses restrained typography, expansive negative space, and image-led editorial pacing rather than interface-heavy promotion.
- **MUBI** — Shares the black-field presentation, white typographic overlays, and cinema-like prioritization of imagery.
- **Bureau Borsche** — Shares experimental oversized display typography set against sparse, art-directed page composition.
- **NOWNESS** — Uses full-bleed visual storytelling and minimal white navigation over dark media stages.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-gallery-black: #000000;
  --color-projection-white: #ffffff;
  --color-index-gray: #999999;

  /* Typography — Font Families */
  --font-helveesti: 'Helveesti', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-navigation-and-editorial-label: 14px;
  --leading-navigation-and-editorial-label: 1.3;
  --tracking-navigation-and-editorial-label: 0.84px;

  /* Typography — Weights */
  --font-weight-regular: 400;

  /* Spacing */
  --spacing-unit: 8px;
  --spacing-15: 15px;
  --spacing-20: 20px;
  --spacing-25: 25px;
  --spacing-72: 72px;
  --spacing-144: 144px;

  /* Layout */
  --section-gap: 72px;
  --card-padding: 0px;
  --element-gap: 20px;

  /* Border Radius */
  --radius-xl: 15px;

  /* Named Radii */
  --radius-cards: 0px;
  --radius-links: 0px;
  --radius-images: 15px;
  --radius-navigation: 0px;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-gallery-black: #000000;
  --color-projection-white: #ffffff;
  --color-index-gray: #999999;

  /* Typography */
  --font-helveesti: 'Helveesti', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-navigation-and-editorial-label: 14px;
  --leading-navigation-and-editorial-label: 1.3;
  --tracking-navigation-and-editorial-label: 0.84px;

  /* Spacing */
  --spacing-15: 15px;
  --spacing-20: 20px;
  --spacing-25: 25px;
  --spacing-72: 72px;
  --spacing-144: 144px;

  /* Border Radius */
  --radius-xl: 15px;
}
```
