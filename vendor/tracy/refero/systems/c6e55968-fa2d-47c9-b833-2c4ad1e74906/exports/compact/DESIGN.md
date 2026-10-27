# BUTT STUDIO — Style Reference
> gallery wall with one massive serif wordmark

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

BUTT Studio is an editorial portfolio that treats type as architecture: one enormous Caslon wordmark stretches wall-to-wall across the top of the page, broken by an organic illustration that weaves through the letterforms. Below the hero, the system collapses into a clinical three-column ledger of contact, clients, and features in a quiet sans-serif, then opens into a generous two-column project grid. Color is almost entirely absent — matte black ink on warm gray paper, with a single deep indigo badge as the only chromatic punctuation. The feel is a print magazine that happens to be alive: confident serif display, utilitarian sans body, no gradients, no rounded chrome, no decorative shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Primary text, borders, button outlines, structural strokes — the only color that ever carries information |
| Paper | `#ffffff` | Card surfaces, thumbnail covers, inverted text on dark blocks |
| Carbon | `#131313` | Dark project tile backgrounds, near-black surface for video panels |
| Bone Gray | `#e0e0e0` | Page canvas, neutral button fills — the warm gray the whole composition sits on |
| Studio Indigo | `#31338e` | Sole chromatic accent — STUDIO pill badge, and any deep brand punctuation. The only saturated color in the system |

## Typography

### helvetica — Every utility, body, list, button, and link on the site. Stays at one weight — no bold, no medium. The decision to use weight 400 Helvetica at 20px for body (not 16px) is deliberate: text is meant to feel like printed matter, not a UI. Tighter letter-spacing on larger sizes (-0.03em) prevents the 40px from feeling airy.
- **Substitute:** Helvetica Neue, Inter, or Arial as system fallback
- **Weights:** 400
- **Sizes:** 20px body, 40px subhead
- **Line height:** 1.20
- **Letter spacing:** -0.03em at 20px, -0.02em at 40px

### Caslon — The hero wordmark and any serif accent. A single weight of a custom display serif — chosen because its high contrast strokes and ball terminals read as editorial print, not web type. This font IS the brand; everything else is scaffolding.
- **Substitute:** Playfair Display, Cormorant Garamond, or any high-contrast didone/transitional serif
- **Weights:** 400
- **Sizes:** 42px display, scales up to fill the viewport at the wordmark level
- **Line height:** 1.00
- **Letter spacing:** -0.02em at display sizes, tightening to nearly none at body

### Sometimes Times — Sometimes Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 20px
- **Line height:** 1.2
- **Letter spacing:** -0.02

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 20px | 1.2 | -0.6px |
| heading | — | — | 42px | 1 | -0.84px |
| display | — | — | 200px | 1 | -4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **cards:** 0px (sharp, like printed paper)
- **badges:** 50px-68px (rounded pill, almost stadium)
- **buttons:** 50px (pill-shaped)

## Components

### Wordmark Hero
**Role:** The site identity block

Full-bleed Caslon display set oversized (approximately 200-280px) so a single word fills the viewport width. Tight letter-spacing (-0.02em to -0.04em) so strokes nearly touch. An interactive illustration may weave horizontally through the letterforms, breaking the baseline — this is the signature move.

### STUDIO Pill Badge
**Role:** Brand stamp overlapping the wordmark

50-68px border-radius capsule. Fill #31338 (Studio Indigo). Text in Helvetica 20px, white, weight 400, letter-spacing -0.02em. Sits at the lower-left of the first letterform, partially overlapping it. The only chromatic UI element on the site.

### Three-Column Info Ledger
**Role:** Primary navigation and metadata block beneath the hero

Three equal columns separated only by whitespace, no dividers. Left column: contact name + email + social handle in Helvetica 20px black. Middle column: 'Selected Clients' list (adidas, Boiler Room, Chloé, Google, Instagram, Nike, Warner Records, Sony Music). Right column: 'Features' list with publication and year. All black text, no links styled differently, all weight 400.

### Project Tile (Light)
**Role:** Standard project entry with video thumbnail

Two-column grid item. Thumbnail is a 16:9 video player (color-tinted, often pink/magenta or blue gradient fills behind glass-like 3D objects). Below: project title in Caslon 42px, black, followed by a description in Helvetica 20px. Optional 50px-pill 'Download' button in #e0e0e0 with black text.

### Project Tile (Dark)
**Role:** Inverted project entry for visual rhythm

Same dimensions as the light tile but the right half is a #131313 carbon-black panel with minimal white progress indicators (four short white dashes) at the bottom — mimicking a video player scrubber. Used to alternate against light tiles.

### Download Button
**Role:** Neutral pill action

50px border-radius pill. Fill #e0e0e0 (Bone Gray). Padding 5px top/bottom, 20px left/right. Text in Helvetica 20px black, weight 400, letter-spacing -0.02em. No border, no shadow. Sits inline with project titles.

### Video Thumbnail
**Role:** Clickable preview for project media

Full-bleed 16:9 rectangle, no border, no radius. Centered white triangle play icon (no background plate). Behind the icon: full-color 3D render or animation frame — these are the only places saturated color appears, and they are content, not UI.

### Page Divider
**Role:** Visual break between project entries

1px solid #000000 horizontal line spanning the full content width, with 180px of vertical space on either side. Functions like a section break in a printed catalog.

## Do's and Don'ts

### Do
- Set the hero wordmark oversized in Caslon at weight 400, tight tracking (-0.02em), so one word fills the full viewport width
- Use #e0e0e0 as the page canvas — never pure white at the page level; reserve #ffffff for card surfaces only
- Use Studio Indigo #31338 exactly once per surface as the only chromatic accent
- Set body text at 20px Helvetica weight 400 with -0.03em letter-spacing — bigger and tighter than web convention
- Give buttons and the STUDIO badge a 50px pill radius for the only rounded elements in the system
- Separate project tiles with a 1px black hairline and 180px vertical space to read as a printed catalog
- Let interactive illustrations physically break through or weave between the serif letterforms in the hero

### Don't
- Do not introduce any color other than the four neutrals and Studio Indigo — no gradients, no tints, no hover-state color shifts
- Do not use shadows, glows, or elevation — the design is flat like print, with no synthetic depth
- Do not add border-radius to cards, tiles, or thumbnails — they must stay sharp like cut paper
- Do not set body text below 20px or add bold/medium weights to Helvetica — weight 400 is the only weight that exists
- Do not use Caslon for anything below the hero — reserve it for the wordmark and project titles to preserve its weight
- Do not add underlines, color, or icons to links in the client/feature lists — they read as plain text on purpose
- Do not center body text or list items — the ledger columns are left-aligned like a contact page

## Elevation

- **Page Divider:** `1px solid #000000 — the only structural line in the system`

## Surfaces

- **Bone Gray Canvas** (`#e0e0e0`) — Page background — the warm off-white paper the whole site rests on
- **Paper Card** (`#ffffff`) — White card surfaces for project details, inline blocks
- **Carbon Plate** (`#131313`) — Dark video panels and feature blocks for contrast sections
- **Studio Indigo Plate** (`#31338`) — Indigo badge and any accent wash

## Imagery

Imagery is concentrated in the hero — a full-width interactive illustration (the tomato vine and fruit garland) that physically threads through the serif letterforms, breaking the wordmark. Below the fold, project thumbnails are 16:9 video stills: saturated, high-key 3D renders and motion frames in pinks, magentas, blues, and warm reds. These are content (the work itself), not UI decoration. No stock photography, no lifestyle imagery, no icons as illustration.

## Layout

Hero is full-bleed with no max-width — the wordmark scales to fill the viewport. Below the hero, content sits in a wide unconstrained column with generous left/right breathing room. A three-column ledger spans the page (contact / clients / features) with no dividers between columns. Project entries are arranged in a two-column grid, alternating light tiles (white card + video thumbnail) with dark tiles (carbon-black video panel) to create rhythm. Vertical spacing is generous: 180px between major sections, 70px between project cards. Navigation is essentially absent — the page is a single scroll, the wordmark IS the navigation.

## Similar Brands

- **Locomotive Mtl** — Same full-bleed typographic hero where a single oversized serif word dominates the viewport, followed by a restrained two-column project grid
- **Studio Brasch** — Editorial portfolio language with massive display type, no UI chrome, and a two-column case-study grid in monochrome
- **Pentagram partner sites** — Print-magazine treatment of a portfolio: serif display, sans body, hairline dividers, no decorative elevation
- **Resn** — Bold oversized identity wordmark over a single accent color, with a flat monochrome project grid below
