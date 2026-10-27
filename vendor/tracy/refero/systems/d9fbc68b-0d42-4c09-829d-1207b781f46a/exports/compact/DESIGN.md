# Wayfinder — Style Reference
> A black cinema screen with one whispered title floating over a living illustration. The interface is a dimmer switch, not a dashboard.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Wayfinder is an immersive interactive film that treats the entire viewport as a stage for animated illustration. The UI is deliberately vestigial: a pure black canvas, a single light-weight display title, two compact action buttons, and a few icon-only controls in the corners. Almost everything visual is illustration content — stylized trees, mushrooms, flowers, earth textures — while the interface stays flat, borderless, and silent. The design discipline is subtraction: no shadows, no gradients, no card layers, no decorative color. The wide letter-spacing on the display type and the centered composition give every screen a cinematic, title-card quality.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, primary borders, icon strokes — the literal theater curtain everything sits on |
| Smolder Earth | `#0b0502` | Secondary surface tone — picks up a warm cast from the illustration overlay, used as a slightly lifted dark |
| Charcoal | `#1a1a1a` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Bone White | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Ash | `#e3e3e2` | Hairline borders on the dark button, subtle separators, muted off-white dividers |
| Driftwood | `#c0bfbe` | Muted surface for low-emphasis background panels and body containers |

## Typography

### Enreal — Display and UI type. Weight 300 carries the title — a thin geometric sans that whispers against the dark canvas. The 0.042em tracking (roughly 0.67px at 16px) is wide for a sans, giving every word a cinematic, breathing quality. Body and labels step up to 400, reserved to 700 for the rare emphasis.
- **Substitute:** Jost Light, DM Sans Light, or Outfit Light
- **Weights:** 300, 400, 700
- **Sizes:** 14px, 16px, 24px
- **Line height:** 1.20, 1.75
- **Letter spacing:** 0.0420em

### Ciutadella-Medium — Secondary support face at weight 300 — used for small labels, links, and metadata. Tight line-height (1.0) and normal tracking make it a quiet, textural companion to the wider Enreal.
- **Substitute:** Karla Light, Inter Light, or Manrope Light
- **Weights:** 300
- **Sizes:** 14px
- **Line height:** 1.00

### Arial — System fallback for button text and small body contexts where the custom faces are not loaded.
- **Substitute:** system-ui, -apple-system, Helvetica
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | 0px |
| body | — | — | 16px | 1.2 | 0.67px |
| subheading | — | — | 24px | 1.2 | 1.01px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 4px

### Border Radius

- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Centered Title Block
**Role:** Hero typography composition

Vertically and horizontally centered in the viewport. Title at ~48-64px in Enreal weight 300, #ffffff, letter-spacing 0.042em, all-caps. Subtitle in Ciutadella-Medium weight 300, 14px, #ffffff at reduced opacity, two short lines separated by a hard line break. No drop shadow, no background — type floats directly on the illustration.

### Start Button (Filled White)
**Role:** Primary user action

White (#ffffff) solid fill, #000000 text, no border, 0px radius. Inline arrow icon (→) left of the label 'start' in Enreal or Arial 13px. Padding ~8px 16px. The only visually loud element on the page besides the title.

### Info Button (Outlined Dark)
**Role:** Secondary action

Charcoal (#1a1a1a) fill with Ash (#e3e3e2) 1px hairline border, 0px radius, white text 'info' at 13px. Sits 30px below the primary action. Quiet but clearly interactive — the border is the affordance.

### Corner Utility Cluster (Top-Left)
**Role:** Scene control toggles

Three small icon-only controls aligned top-left at ~8-10px padding: a filmstrip/scene-selector icon, a pause/play toggle, and an info dot. Monochrome white on black, no background, no labels. The film-strip icon implies a chapter/segment picker.

### Corner Utility Cluster (Top-Right)
**Role:** Global controls

Three icon-only controls top-right: language toggle 'FR', speaker/audio icon, and fullscreen expand icon. Same monochrome treatment as the left cluster. Equal padding from the edge as the left cluster to create visual balance.

### Immersive Illustration Layer
**Role:** Full-bleed visual content

The page background is not a color — it is a full-viewport animated illustration. Warm earth palette (ochre, terracotta, moss green, cream) rendered in a flat, slightly textured style with stylized trees, mushrooms, wildflowers, and landscape motifs. Edges are not masked; the illustration bleeds into every corner. This layer is content, not chrome, and carries the entire emotional weight of the experience.

### Button Stack
**Role:** Action container

Two buttons stacked vertically with 30px gap between them. Center-aligned. No background container — the buttons exist directly on the illustration.

## Do's and Don'ts

### Do
- Keep the canvas at #000000. The black is a stage, not a background color.
- Set all type in Enreal weight 300 for titles and weight 400 for body. The thinness is the signature.
- Maintain 0.042em letter-spacing on all Enreal usage — do not tighten it for body sizes.
- Center the primary composition vertically and horizontally in the viewport.
- Use the filled white button for the single most important action and the dark outlined button for secondary.
- Keep corner utility controls icon-only and monochrome. No labels, no backgrounds, no tooltips.
- Let the illustration occupy the full viewport. Never crop it, never overlay a surface on top of it.

### Don't
- Do not introduce shadows, glows, or elevation effects on any element.
- Do not add gradients, brand accent colors, or chromatic highlights — the palette is intentionally achromatic.
- Do not use border-radius on any component. Everything is sharp-edged and architectural.
- Do not switch the title to a bold or heavy weight. Weight 300 on Enreal is the defining voice.
- Do not add card containers, backgrounds, or frosted-glass panels behind the type or buttons.
- Do not use any color from the illustration (ochre, terracotta, moss) as a UI token — those belong to the artwork.
- Do not build dense layouts. This is a one-screen-at-a-time experience; whitespace is the layout.

## Elevation

The design uses no shadows whatsoever. Depth is implied only through the illustrated background and the slight contrast step from #000000 to #1a1a1a. Components float on the illustration as flat shapes — any shadow would compete with the artwork and break the cinematic illusion.

## Surfaces

- **Void Black** (`#000000`) — Underlying page canvas — the theater-dark base layer
- **Smolder Earth** (`#0b0502`) — Warm dark surface that absorbs the illustration's color cast
- **Charcoal** (`#1a1a1a`) — Secondary button fill and border — the only stepped dark

## Imagery

The visual language is hand-illustrated 2D animation — flat shapes with a slight painterly texture, no outlines on most forms, warm earth palette (terracotta, ochre, olive, cream, sienna). Trees are rendered as triangular canopies with horizontal striping; mushrooms and wildflowers are scattered as small graphic accents. The illustration occupies the entire viewport at all times and is animated (parallax or character movement). There is no photography, no product imagery, no 3D. Icons in the UI are thin, monochrome, line-based and sit at roughly 1px stroke weight. The art style evokes mid-century children's book illustration crossed with a Studio Ghibli background plate — cozy, handcrafted, slightly nostalgic.

## Layout

Single-screen, full-bleed layout with no scrolling content sections. The page model is 100vw × 100vh, center-aligned. The hero is the entire page: a centered title block, a two-line subtitle, and a vertical button stack, all overlaid on the full-bleed animated illustration. Top-left holds a 3-icon scene control cluster; top-right holds a 3-icon utility cluster (language, audio, fullscreen). There is no navigation bar, no sidebar, no footer. Section rhythm does not apply — there is only one section, and it loops between scenes controlled by the top-left filmstrip icon.

## Similar Brands

- **Bear 71 (NFB Interactive)** — Same NFB interactive-film lineage — full-bleed illustrated/photographic canvas with minimal monochrome UI overlaid, no shadows, no card layers, type floating directly on imagery
- **The Boat (SBS Interactive)** — Cinematic full-viewport narrative with centered light-weight display type and an almost invisible interface — the art carries the page, the chrome stays out of the way
- **Silk – Interactive Generative Art** — Pure black canvas with thin, airy type and a single primary action button — the generative artwork is the entire visual system
- **Everyone Has a Story (Google)** — Full-bleed illustrated scenes with centered whisper-light display type and a single white-on-dark action button — the same title-card, cinema-screen discipline
