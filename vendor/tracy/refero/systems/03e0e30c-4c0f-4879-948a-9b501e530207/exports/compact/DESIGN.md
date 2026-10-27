# Grafana Labs — Style Reference
> Sunrise signal control room. Pair a quiet gray-white workspace with a broad four-color horizon gradient and exact blue interface signals.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Grafana Labs — observability control room under a sunrise signal. The interface holds a predominantly #f4f4f6 canvas beneath a soft peach-to-aqua hero wash, then uses black Poppins headlines as large, decisive anchors. Product proof arrives in oversized dark dashboard captures framed by pastel 24px cards, while #1b55f5 supplies the precise electric-blue punctuation for links, arrows, and filled conversion controls. Spacious stacked sections alternate centered statements, split product narratives, and diagrammatic integration fields rather than dense application-style panels.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cloud Canvas | `#f4f4f6` | Page background, quiet footer bands, subdued action surfaces |
| White Surface | `#ffffff` | Header, inputs, search surfaces, elevated content fields |
| Divider Ash | `#e6e6ea` | 1px structural dividers, card outlines, and header separation |
| Input Steel | `#d8d8df` | Input borders and stronger contained-surface outlines |
| Charcoal Panel | `#2b2d32` | Dark product-preview panels and dark icon or text treatment |
| Ink | `#000000` | Headlines, prominent body copy, dark outlined controls |
| Graphite Copy | `#454554` | Secondary body copy and descriptive text |
| Slate Navigation | `#67677e` | Navigation labels, utility links, muted metadata, and subdued icons |
| Electric Signal | `#1b55f5` | Filled CTA buttons, text links, directional arrows, and active interface marks — the saturated blue cuts through the otherwise restrained canvas |
| Blue Mist | `#eaf0ff` | Pale blue card fields and quiet highlighted-control backgrounds |
| Peach Paper | `#f4e5d9` | Warm card surfaces and pale decorative panel backgrounds |
| Lilac Wash | `#f9e8ff` | Pale purple product-card surfaces |
| Apricot Fill | `#fad8ac` | Warm feature-card surface |
| Orchid Edge | `#eeaafd` | Pastel purple feature-card borders |
| Sky Edge | `#8ec0ff` | Pastel blue feature-card borders |
| Tangerine Edge | `#ffae70` | Pastel orange feature-card borders |
| Horizon Wash | `linear-gradient(120deg, #f7bfa3 10%, #e6b3e6 40%, #a3d8f7 75%, #7be7e7)` | Hero atmosphere behind centered messaging — a diffuse warm-to-cool transition rather than a button or panel treatment |

## Typography

### Poppins — Display and section-heading family. Semibold Poppins creates the site’s broad geometric headline silhouette; the -0.025em tracking at major sizes pulls its round letterforms into compact, high-density statements.
- **Substitute:** Manrope
- **Weights:** 500, 600
- **Sizes:** 20px, 24px, 30px, 36px, 48px, 60px
- **Line height:** 1.13, 1.25, 1.35, 1.38
- **Letter spacing:** -1.5px at 60px, -1.2px at 48px, -0.75px at 30px, -0.6px at 24px; 36px may use normal tracking

### Inter — Body, navigation, links, input text, buttons, and utility metadata. Use 16px/24px regular for reading copy, 13px/19.5px medium for primary navigation, 14px/20px medium for account controls, and 18px/28px semibold for compact plan statements.
- **Substitute:** Arial
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 11px, 12px, 13px, 14px, 16px, 18px, 20px
- **Line height:** 1.00, 1.23, 1.25, 1.33, 1.38, 1.40, 1.43, 1.50, 1.56, 1.63
- **Letter spacing:** -0.72px at 16px for compact labels, -0.4px at 16px for tight UI text, -0.13px at 13px for navigation; body defaults to normal tracking

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| nav | Inter | 500 | 13px | 1.5 | 0px |
| utility-nav | Inter | 500 | 14px | 1 | 0px |
| body | Inter | 400 | 16px | 1.5 | 0px |
| body-strong | Inter | 600 | 16px | 1.5 | 0px |
| heading-small | Poppins | 600 | 24px | 1.25 | -0.6px |
| heading | Poppins | 600 | 30px | 1.25 | -0.75px |
| heading-centered | Poppins | 600 | 36px | 1.25 | 0px |
| display-section | Poppins | 600 | 48px | 1.13 | -1.2px |
| display-hero | Poppins | 600 | 60px | 1.25 | -1.5px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 12px

### Border Radius

- **cards:** 24px
- **links:** 8px
- **pills:** 16777200px
- **images:** 12px
- **inputs:** 8px
- **buttons:** 8px
- **navigation:** 4px

## Components

### Announcement Strip
**Role:** Thin top-of-page editorial notice

Use a White Surface strip with a 1px Divider Ash lower rule; set the message in Inter at 11px and pair the inline destination link with Slate Navigation text and a small Electric Signal arrow.

### Public Navigation Bar
**Role:** Two-tier desktop header navigation

Place navigation on White Surface with 13px/19.5px Inter medium Slate Navigation labels, 16px horizontal control padding, 4px radius utility controls, and a 1px Divider Ash boundary.

### Electric Signal Button
**Role:** Filled conversion button

Fill with Electric Signal #1b55f5, use white Inter 14px/20px medium text, match the border to #1b55f5, apply 8px radius, and use 7px 14px 9px padding.

### Text Comparison Button
**Role:** Unfilled paired decision control

Use a transparent background, Ink text, a 1px #e6e6ea border, 0px radius, and 8px 32px padding; retain its flat rectangular treatment beside a filled Electric Signal Button.

### Compact Utility Button
**Role:** Header dropdown, search, and language control

Use transparent fill, Slate Navigation text and border treatment, 6px radius, and 0px 16px padding; set labels in Inter 13px/19.5px medium.

### Pill Icon Control
**Role:** Circular arrow, icon-only, and compact navigation affordance

Use a fully rounded 16777200px radius, transparent fill, Ink outline or icon color, and no interior padding; reserve it for icon-first controls.

### Ask AI Search Field
**Role:** Prominent assistant query entry

Set on White Surface with Ink text, 1px solid Input Steel #d8d8df, 8px radius, and 13px 44px padding; use Poppins 24px/30px semibold for the leading assistant label and a small Electric Signal circular submit icon.

### Pastel Product Showcase Card
**Role:** Oversized product screenshot frame

Use a 24px radius with no shadow and no internal padding; choose Lilac Wash #f9e8ff with Orchid Edge #eeaafd or Blue Mist #eaf0ff with Sky Edge #8ec0ff as the 1px surrounding frame, then inset the dark Charcoal Panel product capture.

### Warm Product Showcase Card
**Role:** Warm-toned product demonstration frame

Use Peach Paper #f4e5d9 or Apricot Fill #fad8ac with a Tangerine Edge #ffae70 border, 24px radius, zero padding, and no box shadow; preserve the large dark dashboard screenshot as the visual center.

### Feature Narrative Block
**Role:** Text half of a split product section

Use a small 12px-radius icon tile above a Poppins 30px/37.5px semibold Ink heading, then Inter 16px/24px Graphite Copy body text and Electric Signal 16px/24px regular text links.

### Integration Orbit Diagram
**Role:** Centered ecosystem explainer

Build on Cloud Canvas with faint 1px concentric circular paths; place individual White Surface logo discs around the paths with 12px-radius containers and restrained, multicolor source logos while keeping the center copy Ink and Electric Signal.

### Trust Logo Row
**Role:** Social-proof logo band

Center an Inter 14px/20px Graphite Copy lead-in above a single horizontal row of monochrome partner marks; maintain a 16px minimum gap and do not recolor marks with Electric Signal.

## Do's and Don'ts

### Do
- Use Cloud Canvas #f4f4f6 as the dominant page field and White Surface #ffffff for header and input layers.
- Set page display headings in Poppins 600; use 60px/75px with -1.5px tracking for the main hero and 48px/54px with -1.2px tracking for major section statements.
- Use Inter 400 at 16px/24px for paragraph copy and Inter 500 at 13px/19.5px for desktop navigation.
- Reserve Electric Signal #1b55f5 for filled conversion buttons, text links, arrows, and active interface accents.
- Frame product imagery in 24px-radius pastel cards with no shadow; pair Lilac Wash #f9e8ff with Orchid Edge #eeaafd or Blue Mist #eaf0ff with Sky Edge #8ec0ff.
- Build spacing from the 4px base unit, using 12px element gaps and 64px section gaps.
- Use 1px Divider Ash #e6e6ea rules for structural boundaries and Input Steel #d8d8df for input outlines.

### Don't
- Do not use heavy drop shadows on feature cards; product showcase cards use no shadow.
- Do not replace 24px card corners with 8px corners; reserve 8px for buttons and inputs.
- Do not use Electric Signal #1b55f5 as a large page background or broad section fill.
- Do not set large marketing headings in Inter; use Poppins 600 for 24px through 60px heading levels.
- Do not make navigation labels black; keep standard public navigation in Slate Navigation #67677e.
- Do not introduce saturated status colors as universal badges; the visible chromatic system is primarily blue links and pastel card framing.
- Do not compress major sections below the 64px section gap or turn the page into a dense dashboard grid.

## Elevation

- **Ask AI Search Field:** `0 0 0 1px oklab(0 0 0 / 0.05), 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)`
- **Electric Signal Button:** `0 1px 2px 0 rgba(0, 0, 0, 0.05)`

## Surfaces

- **Cloud Canvas** (`#f4f4f6`) — Primary page background and subdued footer surface
- **White Surface** (`#ffffff`) — Header, input, and contained interactive surface
- **Pastel Feature Surface** (`#eaf0ff`) — Quiet blue product-card and highlighted-control field
- **Lilac Feature Surface** (`#f9e8ff`) — Purple product-card frame
- **Peach Feature Surface** (`#f4e5d9`) — Warm product-card frame

## Imagery

The visual field is text-dominant but product-showcase-led: large dark Grafana interface screenshots are contained inside broad pastel frames with rounded 24px corners, never raw full-bleed images. Screenshots act as explanatory evidence beside feature copy, with charcoal dashboards, dense charts, and small colored data marks contrasting the pale page. The integration section replaces photography with sparse circular-line graphics and isolated white logo tokens; icons are mostly small outlined or simple filled marks, using Electric Signal selectively for interface symbols rather than turning the page into an illustration system.

## Layout

The page is a centered, max-width-contained marketing composition inside a light gray canvas, with a narrow announcement strip and two-tier white header above the main content. The hero is a centered text stack over a full-width Horizon Wash gradient, followed by paired decision controls, a wide assistant search field, and a centered monochrome trust-logo row. Subsequent sections use generous vertical bands: a centered major statement leads into alternating two-column text-and-product-screenshot blocks, where left/right positions swap between rows. The integration section returns to centered copy, surrounded by sparse orbiting integration-logo discs on faint circular lines; later content continues the spacious stacked narrative toward a large footer.

## Similar Brands

- **Datadog** — Uses dark, information-rich product screenshots as the central proof against a lighter marketing canvas.
- **Vercel** — Shares oversized black geometric headlines, restrained neutral surfaces, and exact blue conversion punctuation.
- **Webflow** — Pairs large type-led marketing sections with colorful contained product demonstrations and rounded showcase panels.
- **Miro** — Uses a pale workspace-like page field with colorful accent cards and wide centered explanatory sections.
