# Linus Rogge — Style Reference
> Editorial portfolio on gallery-white — each project a wall-sized photograph with whisper-quiet captions in the corner.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Linus Rogge is a personal portfolio built on radical typographic restraint: a single 14px type size across all text, only two colors (pure black and pure white), and gallery-scale photography as the only visual voice. Hierarchy is created through weight (400 vs 500) and generous negative space, not through size escalation. Each project is presented as a sparse left-aligned label paired with a full-bleed photograph, reading like museum wall text beside a large print. Components are nearly invisible — no shadows, no rounded corners on the canvas, no decorative color — letting the work itself carry the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Primary canvas, all text on dark surfaces, inverted button text |
| Ink Black | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Gallery Gray | `#e5e5e5` | Secondary surface for section bands, footer background washes |
| Plinth Gray | `#d4d4d4` | Tertiary surface, alternating section rhythm dividers |
| Carbon Black | `#0a0a0a` | Dark section background for content blocks (writing index, project list) — near-black avoids the harshness of pure #000 |
| Slate Black | `#171717` | Secondary dark surface for stacked dark sections |
| Concrete | `#a3a3a3` | Muted helper text, metadata dates, tertiary annotations on white |
| Stone | `#737373` | Secondary muted text, labels, non-active annotations |
| Graphite | `#525252` | Strongest muted text before full black, subtle emphasis |

## Typography

### ABC Oracle — Sole typeface for all text — headlines, body, labels, metadata, navigation. The signature choice is using a single 14px size across the entire site: hierarchy comes from weight contrast (400 for body, 500 for titles and active items) and whitespace, never from size. This anti-hierarchical approach treats all information as equally important, like gallery wall text.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk at a fixed 14px
- **Weights:** 400, 500
- **Sizes:** 14px
- **Line height:** 1.00, 1.25, 1.43
- **Letter spacing:** normal

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 48-96px
- **Card padding:** 12px
- **Element gap:** 12px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Project Header Label
**Role:** Project metadata block at top-left of each project section

Three-line left-aligned stack: client/brand name (weight 500), project title (weight 500), project description (weight 400). All at 14px, black text on white. No icons, no bullets, no decorative elements. Appears in the top-left corner of each full-bleed image section.

### Project Footer Label
**Role:** Date and studio attribution at bottom-left of each project

Two lines: year range (weight 400) and studio/company name (weight 400). 14px, black text, bottom-left corner. Minimal — just enough to credit the work.

### Full-Bleed Project Image
**Role:** Primary visual element of each project

Large photograph occupying majority of viewport. No border, no radius (0px), no shadow. Images are product/lifestyle photography on clean backgrounds. No captions or overlays on the image itself — labels sit outside the image area in the corners.

### Writing Index Entry
**Role:** Blog post listing in the dark writing section

Two-column layout: post title (weight 500, white) on left, publication date (weight 400, white) below it. Arranged in a multi-column grid. 14px, no links or hover states visible. Sits on Carbon Black (#0a0a0a) background.

### Section Label
**Role:** Category header for grouped content (e.g. 'Writing')

Single word in weight 400, 14px, black on white or white on dark. Sits at top-left of its section with generous left margin. Functions as a quiet section anchor.

### Filled Action Button
**Role:** Primary call-to-action (e.g. 'Information')

Ink Black (#000000) background, Paper White (#ffffff) text, weight 500, 14px. Zero border-radius (0px). Padding 12px 12px (top/bottom 12px, left/right 12px). No border, no shadow, no hover state. Sharp rectangular shape — the only 'colorful' element in the entire system is the inversion of black and white.

### About Text Block
**Role:** Personal bio text in the footer area

Multi-line paragraph at 14px, weight 400, black text. Max-width appears to be 8-column equivalent (roughly 40% of viewport). Line-height 1.43. Sits on Gallery Gray (#e5e5e5) background. No pull quotes or emphasis — flat continuous prose.

### Alternating Section Band
**Role:** Vertical rhythm device separating page zones

Full-width horizontal bands alternating between Gallery Gray (#e5e5e5), Plinth Gray (#d4d4d4), and Concrete (#a3a3a3). No text or content — purely a visual breath between sections, similar to the way a book uses blank pages between chapters.

## Do's and Don'ts

### Do
- Use exactly 14px for all text regardless of importance — let weight (400 vs 500) and whitespace create hierarchy
- Use pure #000000 and pure #ffffff for all primary text and surfaces; the system is strictly two-color
- Set border-radius to 0px on every component — buttons, cards, images, inputs are all sharp rectangles
- Left-align all text to the left edge with consistent left padding; never center text
- Place project metadata in the corners (top-left and bottom-left) of full-bleed images, not overlaid on the image
- Use section bands of Gallery Gray (#e5e5e5) and Plinth Gray (#d4d4d4) to create vertical rhythm between projects
- Use weight 500 only for titles, active items, and button text — everything else stays at 400

### Don't
- Never introduce a second type size — the entire system runs on 14px
- Never add color, gradients, or shadows — the design is flat and strictly monochrome
- Never use border-radius greater than 0px on any element
- Never center text or use symmetrical layouts — everything anchors to the left
- Never overlay text on photographs — labels live in the margin outside the image
- Never use decorative icons, bullets, or dividers — whitespace is the only separator
- Never use #0a0a0a or #171717 as body text on white — those are surface colors for dark blocks only

## Elevation

The design has zero elevation. No shadows, no glows, no depth cues of any kind. Surfaces are defined purely by color contrast between adjacent bands of white and gray. Components sit flush against their background, and the only spatial separation comes from whitespace and the hard edges of photographs meeting solid color fields.

## Surfaces

- **Canvas** (`#ffffff`) — Page background, primary surface
- **Section Band** (`#e5e5e5`) — Alternating section backgrounds, footer wash
- **Plinth** (`#d4d4d4`) — Secondary banded surface
- **Dark Block** (`#0a0a0a`) — Inverted content sections (writing index, archive)

## Imagery

Large-format product and lifestyle photography is the dominant visual element. Images are full-bleed or near-full-bleed, with no borders, no rounded corners, and no overlays. Treatment is clean and natural — laptops on white desks, tablets on wood surfaces, hands interacting with devices. No duotone, no color grading, no masks. Photography carries the entire visual weight of the page; there are no illustrations, no abstract graphics, no icons of consequence. The objects in the photographs (products, devices, hands) are the heroes — the surrounding context is minimal and neutral so the subject reads clearly.

## Layout

Full-bleed single-column layout. Each project occupies a vertical section: metadata in top-left corner, large photograph filling the viewport, date/credit in bottom-left corner. Sections stack vertically with no gutters — each new project starts where the last one ends. Within sections, a dark inverted block (writing index) uses a multi-column grid (3-4 columns) for list items. The footer uses a light gray background with text left-aligned to a column roughly 40% of viewport width. No navigation bar, no sidebar, no sticky header — the page is a continuous vertical scroll of project blocks. No max-width constraint on images; text blocks are constrained to a narrow left column.

## Similar Brands

- **Rauno Freiberg** — Same single-type-size anti-hierarchical typography, full-bleed photography, strict black-and-white palette, and left-aligned project lists with minimal metadata
- **Studio Dumbar** — Portfolio presentation as curated gallery walls — large-format images with whisper-quiet text annotations in corners, no decorative chrome
- **Frank Chimero** — Single-typeface restraint, generous whitespace, left-aligned text columns on light gray section bands, zero ornamental elements
- **Bret Victor** — Radical typographic minimalism where one small body font carries all information and the work itself fills the page
