# The Pop Manifesto — Style Reference
> Orange editorial firehose

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The Pop Manifesto operates on editorial maximalism: a single saturated orange field floods the entire viewport, and the only typographic authority is raw black sans-serif at oversized display scale. Layout is brutally simple — full-bleed canvas, edge-to-edge photo grid, no card surfaces or shadows to soften the impact. The brand wordmark 'POP' uses a custom balloon/bubble script that punctures the otherwise austere type system with a single moment of softness. Color lives inside the photography (hot pink, electric blue backdrops) rather than in UI chrome, making the orange the only color the interface itself ever wears.

## Colors

| Name | Value | Role |
|------|-------|------|
| Manifesto Orange | `#ff7a00` | Full-viewport canvas, page background — one unmodulated orange flood with no gradients, no overlays, no surface variation |
| Magenta Backdrop | `#ff29f1` | Photography studio backdrop — appears as flat color blocks behind models, not as UI chrome |
| Cobalt Backdrop | `#287aea` | Photography studio backdrop — second flat color block behind models in the photo grid |
| Ink Black | `#000000` | All text, wordmark, hairline borders, nav links, photo tile labels — pure black with no softening |
| Paper White | `#ffffff` | Inset text on dark photo backgrounds, photo label cards where reverse-out is needed |

## Typography

### Roobert — Primary typeface for all UI — navigation, body, subheadings, and display headlines. Used exclusively at weight 400; the design system gains its heaviness from size and uppercase transforms, not from font weight. A geometric humanist sans with high x-height and clean terminals that reads as modern European editorial. Free substitute: Inter or Söhne.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12px, 15px, 22px, 33px
- **Line height:** 1.2
- **Letter spacing:** normal

### Roobert (Bubble Display Cut) — Reserved for the 'POP' wordmark in the masthead — a custom balloon/bubble script with rounded inflated letterforms that is the system's only counterpoint to the otherwise hard-edged sans-serif. Never use this style for body, nav, or section labels.
- **Substitute:** Pangram Sans Rounded (display variant)
- **Weights:** 400
- **Sizes:** 12px, 15px, 22px, 33px
- **Line height:** 0.7

### Roobert Bold — Roobert Bold — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body | — | — | 15px | 1.2 | — |
| subheading | — | — | 22px | 1.2 | — |
| heading | — | — | 33px | 1.2 | — |
| display | — | — | 120px | 0.7 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Section gap:** 40px
- **Card padding:** 0px
- **Element gap:** 20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **photos:** 0px
- **buttons:** 0px

## Components

### Full-Bleed Orange Canvas
**Role:** Page background

Single solid #ff7a00 fills the entire viewport with no gradient, texture, or banding. The orange is the page — no card surfaces, no white sections, no alternating bands. Body and padding sit directly on this color.

### Masthead Wordmark
**Role:** Brand identity header

'THE [POP] MANIFESTO' anchored to the very top edge of the viewport. 'THE' and 'MANIFESTO' set in Roobert 400 uppercase at ~120px, line-height 0.7, letter-spacing tight, in pure #000000. The 'POP' portion uses a custom bubble/balloon display cut in the same black, breaking the typographic grid as the only curved, soft element on the page.

### Top-Right Nav
**Role:** Site navigation

Right-aligned horizontal row: SHOP, ARCHIVE, NEWSLETTER. Roobert 400, 12px, uppercase, #000000, no separators or bullets. ~20px gap between items. Sits at the same baseline as the wordmark, optically aligned to the top edge.

### Photo Grid Row
**Role:** Editorial content listing

Three edge-to-edge photo tiles arranged horizontally with no gutters (or 0px gap). The center tile is roughly 2x the width of the flanking tiles. Photos are full-bleed with no border, radius (0px), or shadow. Each tile sits directly on the orange canvas.

### Photo Tile Label
**Role:** Caption beneath photo

Small uppercase Roobert 400, 12–15px, #000000, sits in the orange margin ~20–25px below each photo. Left-aligned to the photo edge. Text is the section name (INTERVIEW, connections, TOTAL LUXURY SPA, READ MORE) — mixed case acceptable, with some labels lowercase to create rhythm.

### Magenta Studio Tile
**Role:** Photography variant

Photo tile with flat #ff29f1 magenta as the studio backdrop behind a model. The magenta is a hard color block, not a gradient — it bleeds to all four edges of the crop.

### Cobalt Studio Tile
**Role:** Photography variant

Photo tile with flat #287aea deep blue as the studio backdrop. Same edge-bleed treatment as the magenta variant. Blue and magenta never appear together in the same tile.

### Neutral Studio Tile
**Role:** Photography variant

Photo tile with white/off-white interior backdrop (lifestyle, natural light). Provides visual rest between the two saturated studio tiles.

## Do's and Don'ts

### Do
- Flood the entire viewport with a single solid #ff7a00 orange — no gradients, no overlays, no panel differentiation.
- Set all type in Roobert 400 at the five-step scale (12/15/22/33/120px); let size and uppercase transforms carry weight, never bold cuts.
- Use 0px border-radius on all photos, buttons, tags, and cards — this system has no rounded corners anywhere.
- Reserve the bubble/balloon display cut exclusively for the 'POP' wordmark; it must never appear in body, nav, or section labels.
- Let photos bleed edge-to-edge with no gutters, no borders, and no drop shadows — the orange canvas is the only frame.
- Keep all text pure #000000 on the orange canvas; reserve #ffffff only for reverse-out on dark photo backdrops.
- Maintain ~291px of top padding before the photo grid to let the masthead breathe and signal editorial gravitas.

### Don't
- Don't introduce any new colors — the palette is orange, black, white, and the two photo backdrops (magenta + cobalt). No grays, no accent hues.
- Don't add card surfaces, drop shadows, or elevation — the design is intentionally flat, direct, and unmediated.
- Don't use bold or semibold weights — Roobert 400 at large sizes is the system's only voice.
- Don't round corners on photos, buttons, or any container — 0px radius is structural, not negotiable.
- Don't add body copy, paragraphs, or long-form text in the body type size — this is an editorial cover, not an article page.
- Don't use the bubble display font for headlines, nav, or labels — it is wordmark-only.
- Don't break the orange canvas with white sections, alternating bands, or boxed content — the orange must always reach all four edges.

## Elevation

This system intentionally uses zero shadows and zero elevation. The orange canvas is flat, the photos are flush against it, and the only depth comes from the typographic scale and the saturated color blocks inside the photography. Adding any drop shadow or card lift would soften the editorial directness that defines the look.

## Imagery

Photography is editorial fashion: tight to medium crops of male models in styled poses, shot against flat saturated studio backdrops (hot magenta, deep cobalt blue) or soft natural-light interiors. The model is always the subject; environment is reduced to a color field. Treatment is high-contrast and direct with no overlays, no duotones, no text-on-image — labels sit in the orange margin below each frame, never inside the photo. The central tile is given disproportionate scale (roughly 2x width) to create visual hierarchy within a simple 3-column grid.

## Layout

Full-bleed edge-to-edge layout with no max-width constraint. The masthead occupies the top ~15% of the viewport with the wordmark anchored to the top-left and nav to the top-right. A single horizontal photo grid row follows after ~291px of vertical breathing space, with three tiles at a 1:2:1 width ratio. Labels sit in the orange margin beneath each tile. The page is a single editorial cover frame — no scrolling sections, no cards, no sidebar. Navigation is minimal (3 text links) and hugs the top-right corner.

## Similar Brands

- **Apartamento Magazine** — Same editorial-cover approach with oversized black sans-serif masthead and full-bleed photography on a single saturated field
- **Ssense** — Same fashion-editorial confidence with bold type, edge-to-edge imagery, and zero decorative chrome
- **Hypebeast** — Same loud single-color canvas with black uppercase type and a minimal right-aligned nav
- **Acne Studios** — Same restraint — letting photography and typography do all the work with no cards, shadows, or surface variation
