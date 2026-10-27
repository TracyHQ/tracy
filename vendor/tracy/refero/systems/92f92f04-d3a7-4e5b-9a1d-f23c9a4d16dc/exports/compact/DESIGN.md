# GitButler — Style Reference
> Teal terminal on paper. Pair high-contrast serif headlines with quiet technical grids, warm graphite surfaces, and restrained teal activation.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

GitButler — teal terminal on paper. The page is built on a warm off-white canvas with dense black editorial display type, compact Inter utility text, and terminal-like demonstrations that make version control feel tangible. Teal appears as controlled punctuation: a compact login fill, a broad conversion panel, code highlights, and pale aqua washes, while hairline gray borders and dotted technical textures organize the otherwise open page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper | `#f3f2f1` | Page background and low-contrast section surface |
| White | `#ffffff` | Terminal chrome, badges, light controls, and elevated content surfaces |
| Ink | `#1c1917` | Primary headings, navigation, body text, icons, and hairline outlined controls |
| Charcoal | `#272321` | Terminal demonstration background and dark text-on-light supporting surface |
| Deep Graphite | `#3a3532` | Dark installation-panel fill and inset terminal depth |
| Warm Gray | `#7c716a` | Body copy, helper text, secondary links, and subdued icons |
| Steel | `#aaa29d` | Inactive controls and muted icon strokes |
| Rule Gray | `#cac6c3` | 1px borders, feature-grid dividers, outlined control borders, and muted tiled surfaces |
| Aqua Mist | `#d3f3f3` | Pale promotional card surface and cool highlighted section wash |
| Aqua Midtone | `#8dd9d9` | Secondary aqua surface for layered promotional artwork |
| Outline Aqua | `#9fe4e4` | Outlined documentation-control border and monospace command highlight |
| Butler Teal | `#25b1b1` | Filled login control and large conversion panels — saturated teal punctuates the mostly paper-and-ink interface |
| Deep Teal | `#1d8a8a` | Badge text, command syntax, icon fills, and teal display-text accents |

## Typography

### But Head — Display and section headings plus large segmented-control labels. Its narrow, high-contrast serif construction makes 400-weight text feel editorial rather than bold; use 82px/82px for the hero, 60px/60px for section headings, 48px/48px on dark command panels, and 40px/60px for the wordmark.
- **Substitute:** Bodoni Moda
- **Weights:** 400
- **Sizes:** 40px, 48px, 60px, 82px
- **Line height:** 1.00, 1.10, 1.50
- **Letter spacing:** -0.82px at 82px, -0.8px at 40px, normal at 48px and 60px

### Inter — Navigation, body copy, feature descriptions, badges, links, and UI labels. Keep prose at 16px/24px weight 400, navigation at 14px/16.8px weight 500, and feature titles at 18px/21.6px weight 600.
- **Substitute:** IBM Plex Sans
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px
- **Line height:** 1.00, 1.20, 1.50, 1.60, 2.00
- **Letter spacing:** normal

### Geist Mono — Terminal commands and code-style instructional text at 14px/21px; its monospaced texture distinguishes executable text from the editorial headline voice.
- **Substitute:** JetBrains Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.50
- **Letter spacing:** normal

### Source Code Pro — Fallback monospace treatment for small code fragments at 14px/21px.
- **Substitute:** Geist Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.50
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | Inter | 400 | 12px | 1.5 | 0px |
| nav | Inter | 500 | 12px | 1.2 | 0px |
| body-small | Inter | 400 | 14px | 1.2 | 0px |
| code | Geist Mono | 400 | 14px | 1.5 | 0px |
| body | Inter | 400 | 16px | 1.5 | 0px |
| feature-title | Inter | 600 | 18px | 1.2 | 0px |
| wordmark | But Head | 400 | 40px | 1.5 | 0px |
| command-panel-heading | But Head | 400 | 48px | 1 | 0px |
| section-heading | But Head | 400 | 60px | 1 | 0px |
| display | But Head | 400 | 82px | 1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 32px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **links:** 20px
- **pills:** 60px
- **badges:** 100px
- **images:** 16px

## Components

### Public Header
**Role:** Top navigation bar

Use the Ink wordmark in But Head 40px/60px beside compact Inter navigation at 14px/16.8px weight 500. Keep links in Ink with 20px navigation gaps; pair a square-corner transparent sign-up control with a small Butler Teal login control.

### Square Outline Button
**Role:** Public secondary action

Transparent fill, 1px solid Ink border, Ink label, 0px radius, and 12px 20px padding. This is the hard-edged counterweight to the rounded segmented controls.

### Teal Login Button
**Role:** Compact filled public action

Butler Teal #25b1b1 fill with White text, 8px radius, and compact 12px 20px padding. Reserve this saturated fill for conversion controls rather than every button.

### Hero Platform Toggle
**Role:** Segmented CLI and desktop selector

Wrap the control in a 1px Rule Gray #cac6c3 outline with 60px radius. Set each segment in But Head 40px/40px; active CLI is Deep Graphite #3a3532 with White text, while inactive Desktop remains transparent with Ink text.

### Dark Install Command Panel
**Role:** Installation callout

Use Deep Graphite #3a3532 on a 0px-radius rectangular panel with 16px padding. Set the title in But Head 48px/48px White and the command in Geist Mono 14px/21px with Deep Teal and Outline Aqua syntax accents; add the inset shadow rgb(58, 53, 50) 0px 4px 100px 0px.

### Pill Documentation Button
**Role:** Outlined reference link

Transparent surface with a 1px Rule Gray #cac6c3 border, 60px radius, and 10px 14px 10px 16px padding. Use Ink iconography and Warm Gray #7c716a text at 16px/24px.

### Terminal Product Demo
**Role:** Product showcase

Use a White 16px-radius terminal frame with a narrow light chrome strip and a Charcoal #272321 code area. Set terminal content in Geist Mono 14px/21px White, with subdued Deep Teal or Outline Aqua command fragments; apply rgba(0, 0, 0, 0.1) 0px 1px 6px 0px, rgba(0, 0, 0, 0.2) 0px 24px 44px 3px.

### Feature Tab Strip
**Role:** Selectable capability navigation

Build a contiguous White tab row with 1px Rule Gray #cac6c3 borders and 8px outer corners. Each tab uses Ink labels, 12px internal padding, and a small muted line icon; mark the selected tab with a 4px Butler Teal top rule.

### Feature Grid Tile
**Role:** Capability summary card

Create a two-row, three-column grid bounded by 1px Rule Gray #cac6c3 dividers and 8px outer corners on Paper #f3f2f1. Give each tile 20px padding, an Ink icon, Inter 18px/21.6px weight 600 title, and Inter 16px/24px Warm Gray body copy.

### Open Source Badge
**Role:** Promotional label

White fill, 100px radius, 8px 12px padding, and Deep Teal #1d8a8a Inter 15px/18px weight 500 text. Place it over Aqua Mist or Butler Teal surfaces.

### Teal Conversion Card
**Role:** Large promotional panel

Use Butler Teal #25b1b1 or Aqua Mist #d3f3f3 as the full card fill, 20px radius, and 58px vertical by 32px horizontal padding. Set the prominent headline in But Head 60px/60px; on teal use White headline text and pale supporting copy, and on aqua use Ink.

### Community Quote
**Role:** Testimonial block

Set quote copy in Inter 16px/24px Ink, followed by a small circular avatar and an Inter identity line. Arrange quotes in a compact two-column composition with 32px gaps; use 100px-radius outline circles with 1px Rule Gray borders for carousel arrows.

## Do's and Don'ts

### Do
- Use Paper #f3f2f1 as the default page canvas and Ink #1c1917 as the default text color.
- Set hero headlines in But Head 82px/82px weight 400 with -0.82px tracking.
- Set section headlines in But Head 60px/60px weight 400 and keep their tracking normal.
- Use Inter 16px/24px weight 400 in Warm Gray #7c716a for explanatory copy.
- Build technical grids with 1px solid Rule Gray #cac6c3 and 8px outer corners.
- Use 60px radius only for segmented platform selectors and compact outlined reference controls.
- Use Butler Teal #25b1b1 for filled conversion controls and 20px-radius promotional surfaces.

### Don't
- Do not replace Paper #f3f2f1 with pure white as the page canvas.
- Do not set But Head headings at weights above 400.
- Do not use Butler Teal #25b1b1 as a universal fill for feature cards, navigation, and every action.
- Do not give square outline buttons a pill radius; keep them at 0px with 12px 20px padding.
- Do not use borderless floating cards in the feature system; use 1px Rule Gray #cac6c3 dividers.
- Do not use heavy drop shadows on ordinary cards; reserve the terminal shadow for product-demo elevation.
- Do not use colored semantic red or green as recurring interface states without product-status evidence.

## Elevation

- **Terminal Product Demo:** `0px 1px 6px 0px rgba(0, 0, 0, 0.1), 0px 24px 44px 3px rgba(0, 0, 0, 0.2)`
- **Dark Install Command Panel:** `0px 4px 100px 0px rgb(58, 53, 50) inset`

## Surfaces

- **Paper Canvas** (`#f3f2f1`) — Default page and quiet section background.
- **White Utility Surface** (`#ffffff`) — Terminal chrome, badges, tab rows, and light elevated controls.
- **Aqua Mist Panel** (`#d3f3f3`) — Pale promotional and illustrated-card surface.
- **Teal Promotional Surface** (`#25b1b1`) — Large conversion cards and compact filled conversion controls.
- **Charcoal Terminal Surface** (`#272321`) — Code demonstrations and terminal content fields.

## Imagery

Visuals are product-focused terminal and command-line screenshots contained in rounded frames, with no lifestyle photography. Graphics are sparse and technical: fine monochrome line icons, faint dot-matrix grids behind feature cards, tiny terminal-window controls, and subtle dark grain or code-like texture inside teal promotional panels. Imagery supports explanations and product proof; editorial typography occupies more visual space than graphics.

## Layout

The page uses a centered, contained content column on a Paper canvas, with a slim top header that places the wordmark left and navigation plus account controls right. The hero leads with a large left-aligned editorial headline, a horizontal CLI/Desktop selector, compact explanatory text, then a paired dark install panel and rounded documentation link before a wide terminal demonstration. Below it, a compact feature-tab strip feeds into a bordered two-by-three capability grid; later sections continue as broad, generously separated stacks with a two-column testimonial area and a full-width teal conversion card. The page is text-dominant, using screenshots of terminal UI and dotted technical textures as contained proof rather than full-bleed imagery.

## Similar Brands

- **Graphite** — Developer-tool storytelling built around stacked-branch workflows, restrained sans-serif utility text, and terminal-first product proof.
- **Raycast** — Uses contained dark product demonstrations against a light editorial marketing surface with compact utility controls.
- **Warp** — Shares terminal-as-product-showcase composition and monospace command content treated as a visual asset.
- **Readwise** — Pairs expressive high-contrast serif display type with an off-white canvas and sparse functional interface framing.
