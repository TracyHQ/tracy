# Katherine Pihl — Style Reference
> art gallery wall at dawn — a white-walled space where black type, generous gaps, and full-bleed imagery do all the work, and the UI itself is almost invisible.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Katherine Pihl is an editorial portfolio system where the work does the talking and the interface recedes into the wall. The page is a pure white canvas with black and two grays — zero chromatic accent, zero decorative gradient, zero shadow — so the imagery carries all the color. The typographic system is the only expressive layer: a precise neo-grotesque (Neue Montreal) at 300–500 for all structural and label text, paired with a high-contrast light-weight serif (Ryhmes) that appears only as large display type overlaid on project imagery. Cards are not cards — they are unbordered, full-bleed images with text labels hanging in the whitespace below. Navigation is two text links. The layout rhythm is a 3-column grid with generous vertical breathing room; everything else is silence.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Primary text, all structural borders, hairline page frames, link underlines — the single typographic ink |
| Fog | `#b3b3b3` | Page background, watermark-level surfaces, lightest borders |
| Ash | `#999999` | Medium-contrast borders, control outlines, and structural separators. |

## Typography

### Neue Montreal — All structural UI text: top-bar name, contact link, filter nav, project labels, category tags. Weight 300 for uppercase nav and filter items, 400 for body, 500 for active filter ('All') and project names. Letter-spacing opens dramatically at small sizes (0.07em at 12px) to give the nav a typeset, editorial cadence.
- **Substitute:** Inter or General Sans at matching weights
- **Weights:** 300, 400, 500
- **Sizes:** 16px
- **Line height:** 1.20 (display use), 1.50 (body use)
- **Letter spacing:** 0.07em at 12px (uppercase nav), 0.02em at 16px (body), 0 at display use

### Ryhmes — Display serif used exclusively for project titles overlaid on hero imagery (e.g. 'recreation', 'BROWN JORDAN'). Weight 300 — the thinnest possible stroke — combined with tight tracking (-0.03em) makes the text feel etched into the photograph rather than placed on top. This serif is the portfolio's only expressive voice; it never appears in chrome, nav, or labels.
- **Substitute:** Playfair Display or DM Serif Display at weight 300
- **Weights:** 300
- **Sizes:** 32px
- **Line height:** 1.10
- **Letter spacing:** -0.03em (tightened tracking at all sizes)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.84px |
| body | — | — | 16px | 1.5 | 0.32px |
| display | — | — | 64px | 1.1 | -1.92px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1400px
- **Section gap:** 40px
- **Card padding:** 0px
- **Element gap:** 12px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Portfolio Header
**Role:** Top of page — brand mark and single contact link

Two text elements on the white background. Left: 'KATHERINE PIHL' in Neue Montreal 300, 12px, uppercase, letter-spacing 0.07em, color Ink (#000000). Right: 'CONTACT' in the same spec. No background, no border, no hamburger, no menu bar. ~40px top/bottom padding from the page edge.

### Filter Nav
**Role:** Category filter for the project grid

Inline horizontal text row, no buttons, no pills. Three items: 'All' (Neue Montreal 500, 13px, color Ink), 'Branding' (Neue Montreal 400, 13px, color Ash #999999), 'Web Design' (same as Branding). 24px gap between items. Active state = weight change, not color change. No underline, no background, no border.

### Project Image Block
**Role:** Full-bleed photographic or graphic content in the grid

No border, no radius (0px), no shadow, no padding. Image fills its column edge-to-edge. Aspect ratio varies per project (portrait, landscape, square, solid color field). The orange block and the photographic landscapes are treated identically as 'image content'.

### Project Card
**Role:** Composite unit = image + label group

An image block stacked above a label group with 12px gap. The label group has 8px bottom margin to the next row. No card container, no border, no background — the white space between cards IS the card system. Spacing between rows: 40px.

### Project Label
**Role:** Name + category text below each project image

Two-line stack. Line 1: project name in Neue Montreal 500, 13px, color Ink. Line 2: category ('Branding', 'Web Design', 'Branding & Web Design') in Neue Montreal 400, 13px, color Ash (#999999). 4px gap between lines. Left-aligned, not centered.

### Display Title Overlay
**Role:** Large serif title set directly over hero imagery

Ryhmes 300, ~64px, line-height 1.10, letter-spacing -0.03em, color white (#ffffff) over dark images or Ink (#000000) when it appears as project label in the grid. Positioned bottom-left or centered within the image. The thin weight over a full-bleed photograph is the portfolio's signature moment.

### Date Stamp
**Role:** Small editorial annotation on hero imagery

e.g. 'NYC 2025'. Neue Montreal 400, 12px, uppercase, letter-spacing 0.07em, color white or Ink depending on image. Positioned top-right of the image. Functions as a publication-style byline.

### Text Link
**Role:** Navigational link (header 'CONTACT', filter items)

Neue Montreal 300–400, 12–13px, uppercase, letter-spacing 0.07em, color Ink. No underline at rest; underline appears on hover via 1px Ink border-bottom. No button shape, no background.

## Do's and Don'ts

### Do
- Use the three-color palette only: #000000 for ink, #b3b3b3 for paper, #999999 for muted labels. No chromatic color anywhere in the UI.
- Set all images to 0px border-radius. Sharp corners are part of the gallery-wall language.
- Use Neue Montreal for every piece of structural text (nav, labels, body) and reserve Ryhmes exclusively for display titles overlaid on imagery.
- Space the grid with 40px row gaps and 24px column gaps. The white space IS the design system.
- Express active state through weight (500 vs 400), not color or background. 'All' is bold; the others are regular.
- Open letter-spacing on uppercase nav text to ~0.07em; tighten display serif to -0.03em. The two typographic temperatures must be felt at a glance.
- Place all color into project imagery. Let photographs and solid color blocks carry visual weight; the chrome stays quiet.

### Don't
- Do not introduce any accent color, gradient, or brand hue — even a CTA blue. This system has no chromatic accent by design.
- Do not add card backgrounds, borders, or drop shadows to project images. The white wall is the surface.
- Do not use Ryhmes for nav, labels, body, or any non-display text. It is reserved for the serif moment over imagery.
- Do not round corners on images, buttons, or containers. Every edge is 0px.
- Do not use icons, buttons, or hamburger menus for navigation. Two text links is the entire nav system.
- Do not center-align project labels. Left-align name + category stack under the image.
- Do not add hover transforms, scale, or color shifts to images. A subtle opacity change is the maximum interaction feedback.

## Elevation

This system uses no shadows. Elevation is expressed entirely through white-space separation and typographic weight. Cards float not by being raised but by the negative space around them.

## Surfaces

- **Paper** (`#b3b3b3`) — Page background — light, warm, barely-tinted near-white
- **Canvas** (`#ffffff`) — No actual card surfaces — project images sit directly on the page background

## Imagery

Imagery is the entire color and visual system. The portfolio contains photography (product shots, landscape, editorial), solid color blocks (orange, deep blue), and graphic compositions — all treated identically as full-bleed image content with 0px radius. No icons, no illustrations, no decorative graphics outside the project images themselves. Display titles (Ryhmes 300, white or black) are overlaid on imagery at editorial scale. Images are shown at their native aspect ratio — no cropping, no masking, no color treatment. The 'icon' vocabulary is zero; the 'illustration' vocabulary is zero; the only graphic language is the photograph or block.

## Layout

Full-bleed page within a max-width ~1400px centered container. Header is a two-text-link top bar with ~40px vertical breathing room. Below: a single filter row, then a 3-column grid of project cards. Each card is image (natural aspect ratio) stacked above a 2-line label group, separated by 12px; rows are separated by 40px; columns are separated by 24px. The grid is the page — there are no other section types, no sidebars, no footers visible in the viewport. The rhythm is uniform: header → filter → row 1 → row 2 → row N. The visual weight alternates row by row only because the project images differ in tone and color — the grid skeleton is identical across all rows.

## Similar Brands

- **Studio Bruch** — Same gallery-wall layout: white canvas, no card borders, 3-column image grid, and project labels hanging in whitespace below images
- **Locomotive (locomotive.ca)** — Same editorial-portfolio language with mixed grotesque + display-serif typography and no chromatic accent in the UI
- **Anish Tailor (anishtailor.com)** — Same full-bleed image grid with 0px radius, generous row gaps, and text-only navigation — the work is the entire visual system
- **Pentagram portfolio pages** — Same restrained two-font approach: a neo-grotesque for structure and a high-contrast serif used sparingly as display type over imagery
- **Manual (manualcreative.com)** — Same achromatic UI with a neo-grotesque sans for nav/labels, letting project photography supply all color and atmosphere
