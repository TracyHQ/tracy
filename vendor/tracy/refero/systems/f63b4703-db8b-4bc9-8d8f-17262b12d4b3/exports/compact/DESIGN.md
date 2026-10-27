# Acceptandproceed — Style Reference
> editorial broadsheet on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Accept & Proceed treats the browser as an editorial broadsheet: a single-weight sans-serif at nine sizes, a warm cream canvas, and an almost completely achromatic palette let photography and layout do the expressive work. Hierarchy is built from scale alone — weight 400 is used for everything from 8px captions to 72px display, so contrast comes from size jumps, not boldness. Surfaces are paper-warm: #f9f7f3 is the page, #ecebe7 the button fill, and the only structural chrome is a hairline 1px black border. Components are deliberately quiet — pill buttons at 100px radius, small badges with a 3.4px corner, 8px card radius — so the project imagery and long-form editorial content carry the page. The system feels like flipping through a thoughtfully typeset design annual rather than scrolling a SaaS dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Primary text, hairline borders, icon strokes, badge outlines, card outlines — the only structural line color in the system |
| Paper Warm | `#f9f7f3` | Page canvas, card surfaces, body backgrounds — the warm cream base layer for all content |
| Bone | `#ecebe7` | Raised surfaces, pill button fills, input fills, link backgrounds — one step warmer/darker than the canvas for tactile depth without shadows |
| White | `#ffffff` | Headline color on dark hero overlays, card highlight wash, inverted surface accents |
| Graphite | `#8c8c8c` | Secondary borders, muted metadata text, badge secondary text and borders — the warm mid-gray step in the neutral scale |
| Ash | `#a2a1a1` | Tertiary badge borders and subtle dividers — the lightest structural gray for the quietest separators |
| Charcoal | `#333333` | Input text and form field copy — softer than pure black for longer reading inside form contexts |

## Typography

### Messina Sans — The only workhorse typeface — used for everything from micro-labels (8px) to display headlines (72px). Weight 400 is the sole weight; hierarchy is created entirely by size and line-height, never by weight contrast. This produces a quiet, editorial voice where the type whispers at every level rather than shouting with bold.
- **Substitute:** Inter, Söhne, GT America, or Untitled Sans (clean neo-grotesques with similar x-height and aperture)
- **Weights:** 400
- **Sizes:** 8px, 10px, 14px, 17px, 20px, 24px, 34px, 50px, 72px
- **Line height:** 1.00 (8–10px) to 1.71 (72px display)
- **Letter spacing:** -0.01em consistently across all sizes — slight tightening that becomes more perceptible at larger display sizes, tightening the headline silhouette

### Letterformvariations 04 Dmgx — Decorative display face used very sparingly for typographic moments — an experimental or contrast voice to break the Messina Sans monotony, reserved for editorial flourishes only
- **Weights:** 400
- **Sizes:** 34px
- **Line height:** 1.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | -0.1px |
| body-sm | — | — | 14px | 1.41 | -0.14px |
| body | — | — | 17px | 1.43 | -0.17px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 24px | 1.33 | -0.24px |
| heading | — | — | 34px | 1.29 | -0.34px |
| heading-lg | — | — | 50px | 1.28 | -0.5px |
| display | — | — | 72px | 1 | -0.72px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **pills:** 100px
- **badges:** 3.4px
- **buttons:** 20px

## Components

### Pill Button (Primary)
**Role:** Primary action button for CTAs like 'See More' and 'Listen'

Filled pill button: #ecebe7 background, 100px border-radius, 12–20px horizontal padding, 15px vertical padding. Text in Messina Sans weight 400 at 14px, color #000000. No border. No shadow. The high radius (100px) is a signature — buttons are full pills, never rectangles.

### Medium Radius Button
**Role:** Secondary action button

Slightly less rounded button at 20px border-radius. Same #ecebe7 background, same weight 400 text. Used when a pill is too soft and a medium radius provides more visual weight.

### Project Card
**Role:** Featured project tile in a 2-column grid

Image area with 8px border-radius on all corners. No background fill on the card itself — the image sits directly on the #f9f7f3 canvas. Below the image: project title at 14px weight 400, description at 14px weight 400 in #000000, followed by a row of outlined tag badges.

### Outlined Tag Badge
**Role:** Category label for projects (Technology, Design, Digital, Climate, Space)

Inline-flex badge: 1px border in #000000 or #8c8c8c, 3.4px border-radius, 4–8px vertical padding, 12px horizontal padding. Text in Messina Sans weight 400 at 10–14px, #000000. A small icon can appear inline before the label. The slight (3.4px) radius is distinctive — not fully rounded, not sharp.

### Audio List Row
**Role:** Tabular row in the Endless Vital Activity podcast/audio catalogue

Full-width row separated by a 1px #000000 hairline border-top. Four columns: episode title (14px, #000000), description (14px, #000000), season/episode code (14px, #000000 right-aligned), and a 'Listen' pill button at the far right. No row padding beyond the 1px divider — extremely tabular and editorial.

### Text Input
**Role:** Form field for user input

100px border-radius (full pill) on #ecebe7 background, text in #333333 at 14px Messina Sans. No visible border. 20px horizontal padding. The pill shape signals a search-bar or chat-field semantics.

### Full-Bleed Hero
**Role:** Above-the-fold section image

Full viewport-width image with no border-radius. Headline overlaid in white (Messina Sans 34–50px, weight 400) centered or left-aligned over the image. No gradient overlay — the text relies on image contrast or a subtle dark scrim. Bottom-left caption label at 10–14px in white.

### Top Navigation
**Role:** Global site navigation

Horizontal bar on #f9f7f3 background. Brand wordmark 'Accept & Proceed' far left in Messina Sans 14px weight 400. Center group of links: Work, Journal, About, Contact, all weight 400 at 14px. Far right: a contextual action link (e.g. 'Endless Vital Activity') at 14px. No background bar, no border-bottom — the nav floats on the page.

### Section Header
**Role:** Label for content sections like 'Featured Projects'

Messina Sans 14–17px weight 400 in #000000, left-aligned with 16–24px margin-bottom. No divider line, no uppercase tracking — the section title is just a quietly sized word, not a banner.

### Project Description Block
**Role:** Long-form description under a project title

Body text in Messina Sans 14–17px, weight 400, #000000, line-height ~1.43. Multi-line, wraps naturally. No drop cap, no first-line indent — straight left-aligned editorial copy.

## Do's and Don'ts

### Do
- Use weight 400 of Messina Sans for every piece of type — from 8px captions to 72px headlines. Never introduce a bold or medium weight; hierarchy comes from size alone.
- Use only the warm cream palette: #f9f7f3 for canvas, #ecebe7 for raised interactive surfaces, #000000 for text and hairlines. No chromatic colors of any kind.
- Use 100px border-radius for all primary action buttons and input fields. Pills are the dominant button shape.
- Use 8px border-radius on project images and card containers. This subtle rounding keeps the print-like crispness while avoiding sharp corners.
- Separate content sections with 1px #000000 hairline borders, not colored bands or background changes. The page reads as connected paper, not segmented panels.
- Let photography fill the full viewport width in hero and feature sections. The image is the page; type and chrome step back.
- Use the 3.4px border-radius on all badges and tag chips. This is a signature micro-radius — not fully rounded, not sharp — that reads as editorial label.

### Don't
- Don't introduce bold, semibold, or any non-400 weight. The single-weight system is the entire typographic voice; a bold headline would break the editorial whisper.
- Don't add any color — no blue links, no red errors, no green success states. Every state change uses #000000 ↔ #8c8c8c opacity shifts, or #f9f7f3 ↔ #ecebe7 surface steps.
- Don't apply drop shadows or box-shadows to any element. Depth is communicated by surface color and hairlines only.
- Don't use a border-radius outside the four-tier system: 3.4px (badges), 8px (cards/images), 20px (secondary buttons), 100px (pills/inputs). No 4px, no 12px, no 16px.
- Don't use uppercase tracking or letter-spacing increases for labels. The -0.01em tightening is consistent across the type scale — never widen it.
- Don't add icons, illustrations, or decorative graphics. Photography is the only imagery; everything else is type and hairline structure.
- Don't use colored hover states. Hover changes on links and buttons should toggle between #000000 and #8c8c8c text/border, or swap #ecebe7 → #f9f7f3 surface inversion.

## Elevation

- **All components:** `none — the design intentionally avoids drop shadows`

## Surfaces

- **Page Canvas** (`#f9f7f3`) — The warm cream base beneath everything — never pure white, always paper-toned
- **Raised Surface** (`#ecebe7`) — One step darker for pill buttons, inputs, and subtle interactive surfaces
- **Inverted Overlay** (`#000000`) — Full-bleed dark sections (hero overlays) where white type reads against imagery

## Imagery

Photography is the dominant visual medium and the primary expression of the brand. All imagery is documentary or editorial in nature: concert crowds, retail installations, product renderings of a globe graphic, exhibition spaces. Images are full-bleed (zero-radius corners in hero, 8px radius in cards), high-resolution, and treated honestly — no duotones, no color grading overlays, no decorative masks. The photography does the brand's emotional work; the type and chrome stay out of the way. There are no illustrations, no icon sets of any visual weight, and no 3D renders. The only graphical flourish is a globe/dot-pattern image used as a project visual. Image-to-text ratio is moderate: one large image per project card, then a tight block of editorial description below.

## Layout

Full-bleed hero opens the page — a single image spanning the full viewport width with a centered or left-aligned headline overlaid in white. Below the fold, a 'Featured Projects' section uses a 2-column asymmetric grid (one large card left, one standard card right) with generous gutters. Project cards are image-on-top, type-below with no card chrome. The 'Endless Vital Activity' section uses a strictly tabular row layout — 4 columns separated by 1px horizontal rules, no vertical dividers, no card backgrounds. Section transitions are marked only by generous vertical whitespace and a 14px section title, never by background color changes. The top nav is a single horizontal row floating on the cream canvas with no background bar or border. The entire page is max-width-free, content extends to the full viewport with internal padding of ~24–48px on either side.

## Similar Brands

- **Pentagram** — Same achromatic editorial system: single-weight sans-serif, full-bleed project photography, hairline structure, and a near-zero color palette that lets work speak
- **Manual Studio** — Same restraint: weight 400 across all type sizes, warm off-white canvas, pill buttons, and project-grid portfolio layout with no decorative chrome
- **Locomotive (locomotive.ca)** — Same single-weight editorial typography, full-bleed imagery, and the discipline of letting one typeface do all the work at every size
- **Buck (buck.co)** — Same full-bleed cinematic hero, achromatic chrome, and a project-card portfolio layout where the imagery carries brand expression
- **Resn** — Same experimental-but-restrained agency aesthetic: large-scale photography as the visual voice, minimal type hierarchy, and zero chromatic decoration
