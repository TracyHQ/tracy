# David Kirschberg — Style Reference
> midnight gallery wall — a darkened room where spotlit work is the only color, and the frame around it is intentionally invisible.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Kirschberg operates as a darkened exhibition space: a near-black canvas (#181818) with a single elevated surface (#262626) hosts colorful project work as the only chromatic event on screen. The interface is deliberately austere — Inter at weight 400 handles all text at 16-17px, while a custom display face (twkLausanne) appears at exactly 32px with aggressive -0.04em tracking for the sole headline. The signature structural shape is the 24px rounded card; there are no shadows, no gradients, and no interface accent color. The portfolio reads as a single horizontal-scroll row where the frame is engineered to disappear so the work is remembered.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#181818` | Page canvas, primary background — the dominant surface that recedes so work thumbnails advance |
| Graphite | `#262626` | Elevated surface, card thumbnail backgrounds, and content containers that need to sit one level above the page |
| Bone | `#fafafa` | Primary text, hero headlines, card titles — near-white that reads as soft rather than clinical against the dark canvas |
| Ash | `#a3a3a3` | Muted secondary text, subtitles, card descriptions — one step quieter than primary text for hierarchy without color |

## Typography

### Inter — All body text, subtitles, card titles, UI labels, navigation — single weight (400) across every context, relying on size and color contrast rather than weight shifts for hierarchy
- **Substitute:** DM Sans or General Sans
- **Weights:** 400
- **Sizes:** 16px, 17px
- **Line height:** 1.18 / 1.29 / 1.50
- **Letter spacing:** -0.009em

### twkLausanne — Sole display face for the hero headline — a custom typeface with tight tracking and unusually compressed line-height that gives the 32px headline editorial gravitas without bold weight. The -0.04em letter-spacing is aggressive for body size but measured for display, pulling characters close enough to read as a unified mark rather than individual letters
- **Substitute:** Söhne Breit or Editorial New (both share the tight, wide proportions)
- **Weights:** 400
- **Sizes:** 32px
- **Line height:** 1.10
- **Letter spacing:** -0.04em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 16px | 1.5 | -0.14px |
| display | — | — | 32px | 1.1 | -1.28px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 24px
- **Card padding:** 0px
- **Element gap:** 8px

### Border Radius

- **cards:** 24px
- **navPill:** 16px

## Components

### Navigation Pill
**Role:** Floating top navigation

Centered floating bar with 16px border-radius, contains brand name in Inter 400 and a hamburger icon. Sits at the top of the viewport with generous margin, appearing as a detached object rather than a full-width header bar.

### Hero Headline
**Role:** Page-level statement

Centered, single block of text at 32px in twkLausanne weight 400 with -1.28px letter-spacing and 1.10 line-height. Color #fafafa. This is the only display-size text on the site and the only use of the custom typeface.

### Hero Subtitle
**Role:** Contextual description below headline

Centered paragraph in Inter 400 at 17px, color #a3a3a3, line-height 1.29. Constrained to a text-width column (approximately 500-600px) centered in the viewport. Separated from the headline by 24px vertical gap.

### Project Card Thumbnail (Dark)
**Role:** Work preview for projects with dark or photographic content

Large rounded container at 24px border-radius, filled with #181818 (same as canvas — the card shape is defined by its content, not a visible background). Contains project artwork, illustration, or product screenshot that fills the container edge-to-edge with the 24px radius masking the corners.

### Project Card Thumbnail (Elevated)
**Role:** Work preview for app/UI projects needing visible surface separation

Same 24px border-radius and dimensions as the dark variant, but filled with #262626 to create subtle contrast against the #181818 canvas. Used for project thumbnails that contain screenshots of digital products where the surface needs to be perceptible.

### Card Title with Arrow Link
**Role:** Project name and navigation indicator

Inter 400 at 16px in #fafafa, followed by a small ↗ arrow icon. The arrow is a typographic character or icon at the same baseline as the text. No underline, no color change — the arrow is the sole affordance signal.

### Card Description
**Role:** One-line project summary

Inter 400 at 16px in #a3a3a3, positioned directly below the card title with minimal vertical gap. Kept to one or two lines, using muted color to recede beneath the title.

### Horizontal Scroll Gallery
**Role:** Full-bleed project showcase

Single row of project cards scrolling horizontally. Full viewport width with no padding constraints. Cards are separated by 8px gaps. The scroll track is the only content section — there is no vertical stacking of project grids or multi-row arrangements.

### Card Stack
**Role:** Thumbnail + meta group

A single project card unit combining the thumbnail (24px radius) and the title + description block below it. The meta block has no visible container or background — it exists as a typographic stack on the dark canvas. Vertical rhythm: 8px between thumbnail and title, 4px between title and description.

## Do's and Don'ts

### Do
- Use #181818 as the sole page background — never introduce lighter or darker canvas variants
- Use 24px border-radius for all card-shaped surfaces; use 16px for the navigation pill only
- Use twkLausanne at exactly 32px with -1.28px letter-spacing for headlines; never use this typeface for body text
- Use Inter weight 400 for all body, UI, and label text — never introduce weight 500, 600, or 700
- Keep all spacing on the 4px grid; use 8px as the default element gap
- Let project artwork and identity work provide all color on the page — the interface itself stays achromatic
- Center the hero text block in the viewport and float the nav as a centered pill, not a full-width bar

### Don't
- Never add drop shadows, inner shadows, or box-shadows to any element — depth comes from surface color contrast only
- Never introduce accent colors, brand colors, or saturated hues into the UI chrome — the palette is locked to four neutrals
- Never use font weights other than 400 — hierarchy is built through size and color (Bone vs Ash), not weight
- Never use sharp corners on containers — all surfaces are rounded (16px or 24px)
- Never stack project cards in a multi-row grid — the gallery is a single horizontal scroll row only
- Never add gradients, textures, patterns, or decorative backgrounds to the interface
- Never use letter-spacing wider than -0.009em on body text — the slight tightening is part of the voice

## Elevation

No shadows. Depth is communicated exclusively through a two-level surface system (#181818 canvas → #262626 elevated cards). The absence of shadows is a deliberate editorial choice — shadows would introduce warmth and materiality that competes with the work thumbnails, while flat surfaces keep the frame weightless and gallery-like.

## Surfaces

- **Obsidian** (`#181818`) — Full-bleed page canvas; everything floats on this
- **Graphite** (`#262626`) — Elevated card thumbnails and content containers needing subtle separation from the canvas

## Imagery

The site has no decorative imagery of its own — no photography, no abstract graphics, no textures, no patterns. The only visual content is the project work inside the card thumbnails: vibrant brand illustrations (SPSQ x Collectivo's green/pink/purple figures, Discord Nitro's astronaut), product UI screenshots (Nitro Value's green-gradient app), and black-and-white identity work (ScamSpotter). These are the ONLY color on the entire site. Icons are minimal: a single hamburger menu icon and ↗ arrow characters on card titles. The chrome itself is purely typographic and structural — the design system deliberately delegates all visual expression to the portfolio content.

## Layout

Single-page horizontal-scroll layout with no vertical page sections. The nav pill floats centered at the top of the viewport. Below it, the hero text (headline + subtitle) is centered in a constrained text-width column (~560px) within the full viewport. The remainder of the page is a single full-bleed horizontal scroll row of project cards with 8px gaps. There is no footer, no sidebar, no secondary sections, no grid system, and no page-level navigation beyond the hamburger. The entire spatial structure is: floating pill → centered text → horizontal scroll gallery. Content density is generous — cards are large, the scroll track is the primary real estate, and the chrome occupies minimal vertical space.

## Similar Brands

- **rauno.me** — Same single-weight Inter on a near-black canvas with no accent color, where project work is the only chromatic element
- **tony.xyz** — Same dark, near-monochrome portfolio with a custom display typeface and flat, shadowless card surfaces
- **linear.app** — Same restraint of four neutrals on a dark canvas, with content (screenshots) providing all visual color and no decorative chrome
- **cobe.io** — Same gallery-wall approach where a near-black background makes portfolio work thumbnails the visual focus
