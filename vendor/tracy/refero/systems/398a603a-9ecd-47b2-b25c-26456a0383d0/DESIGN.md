# Beings — Style Reference
> portrait gallery on warm paper. Build with monumental type, tightly cropped human photography, and sharp rectangular compositions punctuated by pale peach and dark cocoa fields.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Beings combines oversized, almost poster-like black typography with sharp-edged editorial portraiture and warm skin-tone section fields. The white opening canvas is interrupted by deep brown and peach editorial panels, where compact uppercase navigation sits far quieter than the imagery and type. The system gives visual authority to representation-led photography: faces are cropped close, media blocks are large and unrounded, and thin circular linework creates a recurring gallery-layout gesture.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Paper White | `#ffffff` | `--color-paper-white` | Primary page canvas, header background, and bright media surround |
| Milk Paper | `#fff4ec` | `--color-milk-paper` | Warm light surface for talent pages, partner labels, and soft text on dark sections |
| Cocoa Ink | `#1b0800` | `--color-cocoa-ink` | Primary text, navigation, outlined controls, logo treatment, and dark surface |
| Talent Peach | `#f6c9a1` | `--color-talent-peach` | Talent-section display text and supporting copy on Cocoa Ink — the muted peach makes dark editorial panels feel human rather than corporate |
| Home Umber | `#381a06` | `--color-home-umber` | Deep brown feature-section surface for high-contrast editorial statements |
| Join Blush | `#fae3cf` | `--color-join-blush` | Pale peach participation and joining surface |
| Shortlist Clay | `#78492d` | `--color-shortlist-clay` | Shortlist area surface and dark-on-light warm brown emphasis |
| Shortlist Cream | `#fdf4ed` | `--color-shortlist-cream` | Text on Shortlist Clay surfaces |
| Peach Wash | `#ffe2cc` | `--color-peach-wash` | Secondary pale warm surface |
| Profile Copper | `#db9a68` | `--color-profile-copper` | Profile dark-theme text and small warm highlight |
| Fine Grey | `#999999` | `--color-fine-grey` | Hairline decorative circles and subdued interface marks |

## Tokens — Typography

### Die Grotesk B SemiBold — Workhorse reading and utility face for compact body copy, links, skip navigation, and partner names. Its 12px and 16px settings retain a blunt, compact texture instead of expanding into conventional airy sans-serif body text. · `--font-die-grotesk-b-semibold`
- **Substitute:** Space Grotesk
- **Weights:** 400
- **Sizes:** 12px, 15px, 16px
- **Line height:** 1.10, 1.40
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`
- **Role:** Workhorse reading and utility face for compact body copy, links, skip navigation, and partner names. Its 12px and 16px settings retain a blunt, compact texture instead of expanding into conventional airy sans-serif body text.

### Die Grotesk B Bold — Navigation, text controls, brand links, and the 22px introductory heading. Keep the nominal 400 weight mapping: visual boldness comes from the bespoke face rather than a CSS 700 value. · `--font-die-grotesk-b-bold`
- **Substitute:** Archivo
- **Weights:** 400
- **Sizes:** 12px, 22px
- **Line height:** 1.10, 1.40
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`
- **Role:** Navigation, text controls, brand links, and the 22px introductory heading. Keep the nominal 400 weight mapping: visual boldness comes from the bespoke face rather than a CSS 700 value.

### Die Grotesk B Black — Rare 12px emphatic micro-label treatment. · `--font-die-grotesk-b-black`
- **Substitute:** Archivo Black
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.40
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`
- **Role:** Rare 12px emphatic micro-label treatment.

### Die Grotesk C Black — 30px statement heading for dark, warm-toned editorial panels. The black cut gives short declarations a dense, carved texture. · `--font-die-grotesk-c-black`
- **Substitute:** Archivo Black
- **Weights:** 400
- **Sizes:** 30px
- **Line height:** 1.18
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`
- **Role:** 30px statement heading for dark, warm-toned editorial panels. The black cut gives short declarations a dense, carved texture.

### Bonto — Display face for the 66px Talent title and major identity-scale words. The tight tracking and single-line leading make the lettering read as a graphic slab rather than ordinary headline text. · `--font-bonto`
- **Substitute:** Anton
- **Weights:** 400
- **Sizes:** 66px
- **Line height:** 1.00
- **Letter spacing:** -1.99px at 66px
- **OpenType features:** `"kern", "ss01" 0, "ss02", "ss03" 0, "ss04" 0`
- **Role:** Display face for the 66px Talent title and major identity-scale words. The tight tracking and single-line leading make the lettering read as a graphic slab rather than ordinary headline text.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| nav-control | Die Grotesk B Bold | 400 | 12px | 1.4 | 0px | `--text-nav-control` |
| body | Die Grotesk B SemiBold | 400 | 12px | 1.4 | 0px | `--text-body` |
| skip-link | Die Grotesk B SemiBold | 400 | 15px | 1.4 | 0px | `--text-skip-link` |
| partner-label | Die Grotesk B SemiBold | 400 | 16px | 1.1 | 0px | `--text-partner-label` |
| intro-heading | Die Grotesk B Bold | 400 | 22px | 1.1 | 0px | `--text-intro-heading` |
| statement-heading | Die Grotesk C Black | 400 | 30px | 1.18 | 0px | `--text-statement-heading` |
| display-title | Bonto | 400 | 66px | 1 | -1.98px | `--text-display-title` |

## Tokens — Spacing & Shapes

**Base unit:** 6px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 6 | 6px | `--spacing-6` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |

### Border Radius

| Element | Value |
|---------|-------|
| links | 0px |
| images | 0px |
| buttons | 0px |

### Layout

- **Element gap:** 12px

## Components

### Utility Header
**Role:** Top-level public navigation

Use a Paper White #ffffff horizontal bar with Cocoa Ink #1b0800 12px Die Grotesk B Bold navigation labels, 16.8px line-height, uppercase text, and 8px internal link padding.

### Text Navigation Link
**Role:** Public-section and brand navigation

Render as transparent text in Cocoa Ink #1b0800, Die Grotesk B Bold at 12px/16.8px, uppercase, with 0px radius and 8px padding. Do not add a filled background.

### Transparent Utility Button
**Role:** Playback and shortlist controls

Use transparent background, Cocoa Ink #1b0800 text and border color, 0px radius, 0px padding, and uppercase Die Grotesk B Bold at 12px/16.8px.

### Skip Link
**Role:** Keyboard-accessible route into page content

Place White #ffffff Die Grotesk B SemiBold text at 15px/21px on a Cocoa Ink #1b0800 focus surface.

### Intro Copy Block
**Role:** Talent-directory introduction

Set the heading in Cocoa Ink #1b0800 using Die Grotesk B Bold at 22px with 24.2px line-height; pair only with compact 12px/16.8px Die Grotesk B SemiBold support copy.

### Bonto Display Title
**Role:** Section-scale identity wordmark

Set a single short word in Bonto at 66px/66px with -1.99px tracking. Use Talent Peach #f6c9a1 when the title sits on Home Umber #381a06.

### Dark Editorial Statement Panel
**Role:** High-emphasis narrative section

Use Home Umber #381a06 as the full panel surface; set the main statement in Talent Peach #f6c9a1 using Die Grotesk C Black at 30px/35.25px, with supporting copy in Die Grotesk B SemiBold at 12px/16.8px.

### Sharp Portrait Media Block
**Role:** Talent showcase imagery

Use high-contrast, tightly cropped portrait photography in a raw rectangular frame with 0px image radius. Surround against Paper White #ffffff or Milk Paper #fff4ec; do not add card borders or shadows.

### Orbital Line Motif
**Role:** Editorial divider and image overlap device

Overlay a single oversized Fine Grey #999999 circular hairline across the boundary of a sharp portrait block and adjacent empty surface. Keep the interior transparent and avoid filling the circle.

### Shortlist Surface
**Role:** Warm saved-talent area

Use Shortlist Clay #78492d as the surface with Shortlist Cream #fdf4ed text in Die Grotesk B SemiBold at 16px/17.6px; retain square 0px geometry.

### Partner Name Label
**Role:** Funding and partner acknowledgement

Set Milk Paper #fff4ec text in Die Grotesk B SemiBold at 16px/17.6px on Cocoa Ink #1b0800 or Home Umber #381a06.

## Do's and Don'ts

### Do
- Use Paper White #ffffff as the primary canvas and Milk Paper #fff4ec as the warm secondary surface.
- Set public navigation and text controls in uppercase Die Grotesk B Bold at 12px with 16.8px line-height.
- Use 0px radius for buttons, navigation links, and portrait media.
- Reserve Bonto at 66px/66px with -1.99px tracking for isolated section-scale words.
- Place Talent Peach #f6c9a1 type only on Cocoa Ink #1b0800 or Home Umber #381a06 surfaces.
- Keep repeated local spacing on the 6px base unit, using 12px for adjacent control and copy gaps.
- Use Fine Grey #999999 only as thin unfilled circular linework or subdued interface detail.

### Don't
- Do not use rounded cards, pill buttons, or any radius above the documented 0px geometry.
- Do not set Talent Peach #f6c9a1 text on Paper White #ffffff or Milk Paper #fff4ec.
- Do not introduce drop shadows beneath portrait blocks, header controls, or editorial sections.
- Do not replace the 66px Bonto display treatment with a generic bold sans-serif headline.
- Do not turn transparent 12px navigation controls into filled buttons without a documented section-specific surface.
- Do not use bright blue, green, or red status colors; the system stays within Cocoa Ink #1b0800 and its peach-to-umber range.
- Do not use soft rounded stock imagery; crop portraits close and retain sharp rectangular edges.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Paper White | `#ffffff` | Primary page canvas and header surface. |
| 1 | Milk Paper | `#fff4ec` | Warm talent-area and light editorial surface. |
| 2 | Join Blush | `#fae3cf` | Pale peach participation surface. |
| 3 | Cocoa Ink | `#1b0800` | Dark text field and high-contrast surface. |
| 4 | Home Umber | `#381a06` | Deep editorial statement-panel surface. |

## Elevation

Surfaces are separated by hard image edges, white space, warm field changes, and thin orbital strokes rather than shadows. Portraits should look placed on a printed editorial spread, not raised as interface cards.

## Imagery

Photography is the central visual language: high-contrast portraits of people are tightly cropped, often allowing hair, shoulders, and faces to exceed the apparent frame. Images are large, raw rectangular blocks with no rounding, no device mockups, and little visual separation from the page; their role is talent showcase rather than background decoration. The page is text-dominant only in the masthead and dark declaration panels, while most visual weight belongs to documentary/editorial portrait crops. Graphics are limited to thin mono circular outlines that overlap media and adjacent negative space.

## Layout

The page opens on a Paper White #ffffff canvas with a thin, widely distributed utility header and an enormous dark identity wordmark spanning most of the viewport. The first content composition is asymmetric: a large, tightly cropped portrait anchors the left while a compact 22px introductory heading occupies the open white area to the right. Subsequent sections behave like an editorial collage rather than a card grid, placing large raw-edge portraits in offset two-column arrangements over warm light and brown fields; fine circular outlines bridge image and negative-space boundaries. The page is spacious and image-led, with minimal navigation, large uninterrupted media rectangles, and occasional full-width dark statement bands.

## Agent Prompt Guide

Quick Color Reference:
- Paper White: #ffffff — Primary page canvas, header background, and bright media surround
- Milk Paper: #fff4ec — Warm light surface for talent pages, partner labels, and soft text on dark sections
- Cocoa Ink: #1b0800 — Primary text, navigation, outlined controls, logo treatment, and dark surface
- Talent Peach: #f6c9a1 — Talent-section display text and supporting copy on Cocoa Ink — the muted peach makes dark editorial panels feel human rather than corporate
- Home Umber: #381a06 — Deep brown feature-section surface for high-contrast editorial statements
- Join Blush: #fae3cf — Pale peach participation and joining surface
- Shortlist Clay: #78492d — Shortlist area surface and dark-on-light warm brown emphasis
- Shortlist Cream: #fdf4ed — Text on Shortlist Clay surfaces
- Peach Wash: #ffe2cc — Secondary pale warm surface
- Profile Copper: #db9a68 — Profile dark-theme text and small warm highlight
- Fine Grey: #999999 — Hairline decorative circles and subdued interface marks

Create a Paper White #ffffff landing composition with a compact 12px/16.8px uppercase Die Grotesk B Bold navigation row in Cocoa Ink #1b0800, then a monumental Cocoa Ink identity wordmark and a sharp-edged portrait crop.
Create an asymmetric talent-introduction block: a raw 0px-radius portrait on Milk Paper #fff4ec at left and a Cocoa Ink #1b0800 heading in Die Grotesk B Bold at 22px/24.2px in the adjacent white space.
Create a Home Umber #381a06 editorial statement panel with Talent Peach #f6c9a1 statement text in Die Grotesk C Black at 30px/35.25px and 12px/16.8px Die Grotesk B SemiBold supporting copy.
Create a section title on Home Umber #381a06 using the Bonto display face at 66px/66px with -1.99px tracking in Talent Peach #f6c9a1; overlap one Fine Grey #999999 unfilled circular hairline across a nearby sharp portrait.
Create a Shortlist Clay #78492d saved-talent panel with Shortlist Cream #fdf4ed 16px/17.6px Die Grotesk B SemiBold labels and square, shadowless geometry.

## Similar Brands

- **The Gentlewoman** — Shares the editorial use of oversized typography, direct portrait photography, and expansive white space.
- **A24** — Uses graphic-scale wordmarks and image-led compositions with intentionally sparse interface chrome.
- **It’s Nice That** — Shares the gallery-like treatment of creative work, sharp media framing, and typography-led page structure.
- **Dazed** — Uses tightly cropped human portraiture and editorial layouts where photography carries the visual hierarchy.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-paper-white: #ffffff;
  --color-milk-paper: #fff4ec;
  --color-cocoa-ink: #1b0800;
  --color-talent-peach: #f6c9a1;
  --color-home-umber: #381a06;
  --color-join-blush: #fae3cf;
  --color-shortlist-clay: #78492d;
  --color-shortlist-cream: #fdf4ed;
  --color-peach-wash: #ffe2cc;
  --color-profile-copper: #db9a68;
  --color-fine-grey: #999999;

  /* Typography — Font Families */
  --font-die-grotesk-b-semibold: 'Die Grotesk B SemiBold', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-die-grotesk-b-bold: 'Die Grotesk B Bold', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-die-grotesk-b-black: 'Die Grotesk B Black', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-die-grotesk-c-black: 'Die Grotesk C Black', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-bonto: 'Bonto', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-nav-control: 12px;
  --leading-nav-control: 1.4;
  --tracking-nav-control: 0px;
  --text-body: 12px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-skip-link: 15px;
  --leading-skip-link: 1.4;
  --tracking-skip-link: 0px;
  --text-partner-label: 16px;
  --leading-partner-label: 1.1;
  --tracking-partner-label: 0px;
  --text-intro-heading: 22px;
  --leading-intro-heading: 1.1;
  --tracking-intro-heading: 0px;
  --text-statement-heading: 30px;
  --leading-statement-heading: 1.18;
  --tracking-statement-heading: 0px;
  --text-display-title: 66px;
  --leading-display-title: 1;
  --tracking-display-title: -1.98px;

  /* Typography — Weights */
  --font-weight-regular: 400;

  /* Spacing */
  --spacing-unit: 6px;
  --spacing-6: 6px;
  --spacing-8: 8px;
  --spacing-12: 12px;

  /* Layout */
  --element-gap: 12px;

  /* Named Radii */
  --radius-links: 0px;
  --radius-images: 0px;
  --radius-buttons: 0px;

  /* Surfaces */
  --surface-paper-white: #ffffff;
  --surface-milk-paper: #fff4ec;
  --surface-join-blush: #fae3cf;
  --surface-cocoa-ink: #1b0800;
  --surface-home-umber: #381a06;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-paper-white: #ffffff;
  --color-milk-paper: #fff4ec;
  --color-cocoa-ink: #1b0800;
  --color-talent-peach: #f6c9a1;
  --color-home-umber: #381a06;
  --color-join-blush: #fae3cf;
  --color-shortlist-clay: #78492d;
  --color-shortlist-cream: #fdf4ed;
  --color-peach-wash: #ffe2cc;
  --color-profile-copper: #db9a68;
  --color-fine-grey: #999999;

  /* Typography */
  --font-die-grotesk-b-semibold: 'Die Grotesk B SemiBold', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-die-grotesk-b-bold: 'Die Grotesk B Bold', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-die-grotesk-b-black: 'Die Grotesk B Black', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-die-grotesk-c-black: 'Die Grotesk C Black', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-bonto: 'Bonto', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-nav-control: 12px;
  --leading-nav-control: 1.4;
  --tracking-nav-control: 0px;
  --text-body: 12px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-skip-link: 15px;
  --leading-skip-link: 1.4;
  --tracking-skip-link: 0px;
  --text-partner-label: 16px;
  --leading-partner-label: 1.1;
  --tracking-partner-label: 0px;
  --text-intro-heading: 22px;
  --leading-intro-heading: 1.1;
  --tracking-intro-heading: 0px;
  --text-statement-heading: 30px;
  --leading-statement-heading: 1.18;
  --tracking-statement-heading: 0px;
  --text-display-title: 66px;
  --leading-display-title: 1;
  --tracking-display-title: -1.98px;

  /* Spacing */
  --spacing-6: 6px;
  --spacing-8: 8px;
  --spacing-12: 12px;
}
```
