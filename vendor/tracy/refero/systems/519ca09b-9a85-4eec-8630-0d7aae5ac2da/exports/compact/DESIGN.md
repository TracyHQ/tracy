# Andrei Rybin — Style Reference
> monochrome atelier notebook — a designer's sketchbook where phone screens are pinned like contact sheets on a white wall

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A monochrome atelier notebook: a near-pure black-on-white canvas where the only visual event is typography against a generous grid of project tiles. Every surface is paper-white; every element either ink-black or a single shade of graphite for secondary information — there is no accent color, no gradient, no fill that isn't neutral. Components are stripped to their function: a pill-shaped label names the work, a circular arrow button invites the next view, thin 1px borders quietly separate sections. The product is the showcase, so the system recedes — the phone mockups carry all the visual weight while the framework stays silent.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper | `#ffffff` | Page background, card surfaces, image holders — the dominant canvas; everything sits on this |
| Ink | `#000000` | Primary text, link text, icon strokes, thin section dividers — the only mark-making color |
| Graphite | `#858585` | Secondary text, muted metadata, and softer border lines that recede behind primary ink |
| Stone | `#8e8e90` | Cool-toned border and divider strokes for borders that need a hairline without competing with Ink |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Inter — Body copy, project captions, and the larger intro paragraphs. Used at a single weight — regularity IS the signature; no bold headlines shout, no light weight whispers.
- **Substitute:** system-ui, -apple-system, 'Segoe UI', sans-serif
- **Weights:** 400
- **Sizes:** 12px, 24px
- **Line height:** 1.20, 1.23, 1.30
- **Letter spacing:** -0.0170em

### system-ui (sans-serif) — Small UI labels, tag text, icon-adjacent microcopy. Appears wherever a single token of body-size type recurs — utility, not statement.
- **Substitute:** inherit Inter or use system sans
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20
- **Letter spacing:** normal

### .SFNSText — .SFNSText — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2
- **Letter spacing:** -0.017

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| subheading | — | — | 24px | 1.23 | -0.4px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 120px
- **Card padding:** 16px
- **Element gap:** 10px

### Border Radius

- **tags:** 40px
- **cards:** 8px
- **icons:** 16px
- **buttons:** 9999px

## Components

### Project Tile Card
**Role:** Container for a single showcase image (phone mockup) with label and navigation arrow

White paper surface, 8px radius, no border, 16px internal padding. A pill label sits top-left at 40px corner radius with 1px Ink border, 10px vertical / 8px horizontal padding, Inter 12px. A 32px circular arrow button with 1px Ink border sits top-right. Caption text (Inter 12px Graphite) sits centered beneath the card with 8px gap.

### Pill Label
**Role:** Project category tag overlaid on each card

Fully rounded capsule (40px radius) on white paper. 1px Ink border, 6px padding top/bottom, 8px padding left/right. Text: Inter 12px, color Ink, letter-spacing -0.0170em.

### Arrow Navigation Button
**Role:** Compact circular control to open a project

32px circle, white fill, 1px Ink border, centered right-pointing arrow icon at 16px radius geometry. No shadow, no fill state — the border is the only affordance.

### Header Bar
**Role:** Top-of-page identity, nav, and social link strip

Full-bleed white band with 16px padding. Four text columns separated by generous white space: name+role (left), showreel link (center-left), social links (center-right), index+about (right). All Inter 12px, Ink, letter-spacing -0.0170em. No dividers between columns — whitespace carries the rhythm.

### Intro Block
**Role:** Two-column intro: contact email on the left, welcome paragraph on the right

40px row gap between the email and the welcome copy. Email is Inter 12px Ink; the welcome paragraph is Inter 24px Graphite at line-height 1.23 — this is the largest type in the system, used exactly once.

### Project Grid
**Role:** Responsive grid of project tiles filling the rest of the page

5 columns at full width, 16px gutters. Each tile occupies a fixed aspect slot (roughly 3:5 portrait). The grid recedes visually — its job is to hold images, not to assert itself.

### Caption Label
**Role:** One-line description under each tile describing the project type

Inter 12px, Graphite (#858585), centered, 8px below the card. Format is 'X → Y' or a short noun phrase.

## Do's and Don'ts

### Do
- Keep the entire interface achromatic — Ink on Paper, with Graphite and Stone for soft hierarchy.
- Use 8px radius for project tiles, 16px for icon containers, 40px (or 9999px) for pill labels and circular buttons.
- Set body and caption type at Inter 12px with -0.0170em letter-spacing; reserve 24px Inter for the single intro paragraph.
- Separate header columns with whitespace alone — no vertical rules or dividers between nav items.
- Use 10px element gap inside cards and 120px section gap between page bands.
- Let image weight carry the page; the system should be invisible behind the work.

### Don't
- Do not introduce any chromatic color — no accent, no brand hue, no semantic state color.
- Do not use multiple font weights — Inter 400 is the only voice; no bold, no light, no italic.
- Do not apply shadows, gradients, or fills to tiles or buttons; borders are the only separator.
- Do not center body text — captions and metadata are left- or context-aligned, not centered except where a tile naturally centers its caption beneath.
- Do not use a border radius below 8px on cards or above 16px on icons — the radii carry the system's softness and must stay consistent.
- Do not add navigation patterns (hamburgers, sidebars, mega-menus); the header is a single text strip.
- Do not break the grid with asymmetric or overlapping tile placements — the grid is the page's structural truth.

## Elevation

The design uses no shadow, no blur, no z-axis elevation. Depth is implied only by the contrast of Ink on Paper, with 1px borders doing all the work that shadows would do in a richer system. Flatness is the philosophy.

## Surfaces

- **Paper** (`#ffffff`) — Full-page canvas and the back of every card and image tile
- **Ink Mask** (`#000000`) — The near-black surfaces that appear inside phone-screen mockups — not a page surface, but defines the photo-to-canvas contrast

## Imagery

Photography-style product mockups of iPhone screens are the only visual content — tightly cropped, high-contrast, most showing dark UI inside white phone frames. Each card is a portrait-ratio still. No lifestyle photography, no illustrations, no abstract graphics. The phone IS the hero; the system frames it like a contact sheet.

## Layout

Full-bleed page on a white canvas, max-width ~1440px. Header is a single row of four text blocks separated by whitespace (name, showreel, social, index). Below sits a two-column intro: contact email left, welcome paragraph right, separated by 40px gap and generous horizontal space. The main body is a 5-column responsive grid of project tiles at 16px gutters, each tile containing a pill label, a circular arrow button, an image, and a centered caption beneath. Section gap of 120px separates the intro from the grid; the grid itself flows without internal section breaks.

## Similar Brands

- **Cargo Collective portfolios** — Same monochrome grid-of-tiles approach with generous whitespace and minimal chrome — content is the design.
- **Readymag project pages** — Editorial-grade minimal layouts where typography does all the work and the system disappears behind showcased work.
- **Tobias van Schneider portfolio** — Single-weight type, achromatic palette, and large project tiles arranged in a quiet grid — restraint as a visual language.
- **Linear app marketing pages** — Crisp type, flat surfaces, no decorative gradients, and a strong reliance on whitespace and thin borders to organize content.
