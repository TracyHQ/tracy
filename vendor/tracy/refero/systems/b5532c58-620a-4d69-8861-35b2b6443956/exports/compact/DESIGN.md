# Escape Coffee Company — Style Reference
> Frost-bleached editorial broadsheet — large display type cut into warm off-white, all atmosphere carried by raw photography.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Escape is a monochromatic, editorial system built around weather-worn photography and three custom typefaces that do the heavy lifting. The canvas is a warm off-white (#f5f4f2) rather than pure white, giving every page the feel of a sun-bleached magazine spread rather than a SaaS dashboard. Molitor at 250px carries the emotional weight — oversized, tightly leaded (0.85), and slightly negative-tracked so the type feels cut from stone — while TWK Lausanne at near-light weights (200–300) handles everything functional with the restraint of a printed caption. Color is deliberately absent: the entire palette is warm grays from #ffffff to #151515, and accents arrive only as the texture of the imagery itself (snow, stone, coffee grounds). Components are minimal and geometric: thin borders, no elevation, tiny radii (3–10px), and generous whitespace. The system never decorates — it curates.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone | `#f5f4f2` | Primary canvas, page background, section surfaces — warm off-white replaces pure white to give every page a printed, slightly weathered feel |
| Ink | `#151515` | High-contrast neutral action fill for primary buttons on light surfaces. |
| Ash | `#ebe9e6` | Secondary surface, input fills, subtle dividers, disabled states — one step darker than Bone, used to separate zones without introducing color |
| Paper | `#ffffff` | Card surfaces, elevated panels, reverse text on dark images — true white reserved for surface lift against the warm canvas |
| Pure Black | `#000000` | Link borders, input borders, maximum-contrast accents where Ink is too soft |
| Smoke | `#8a8a8a` | Muted helper text, input border default state, low-emphasis dividers |
| Fog | `#929292` | Mid-tone panel surface for subdued dark UI layers and secondary containers. Do not promote it to the primary CTA color |

## Typography

### TWK Lausanne — Body, UI, captions, links, buttons, table cells, lists — the workhorse at 13–18px weight 300–400; weight 700 used sparingly for section heads; tracking near 0 at body sizes opens to 0.06–0.075em at 11–13px for micro-labels
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 200, 300, 400, 600, 700
- **Sizes:** 11px, 13px, 14px, 16px, 18px, 19px, 22px, 24px, 28px, 50px
- **Line height:** 1.00, 1.05, 1.06, 1.20, 1.35, 1.81
- **Letter spacing:** -0.16px at 16px, 0.68px at 11px, 0.83px at 13px

### Molitor — Display and hero headlines only — oversized (75–250px) with line-height 0.85, negative tracking at -0.02em at display sizes, positive tracking 0.021–0.037em at smaller sizes; the signature voice, used for 1–3 word emotional statements
- **Substitute:** Playfair Display (for character) or Tiempos Headline
- **Weights:** 300, 700
- **Sizes:** 26px, 45px, 75px, 250px
- **Line height:** 0.85, 1.00
- **Letter spacing:** -0.5px at 250px, -0.9px at 75px, 0.57px at 26px

### Garaje — All-caps category labels, tags, and small display micro-copy — wide tracking 0.044–0.053em gives a stamped, industrial quality to product names, status labels, and nav items
- **Substitute:** JetBrains Mono uppercase, or Space Mono uppercase
- **Weights:** 300, 600, 700
- **Sizes:** 18px, 22px
- **Line height:** 1.00, 1.20
- **Letter spacing:** 0.8px at 18px, 1.17px at 22px

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### GTStandard-M — GTStandard-M — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 16px
- **Line height:** 1.5
- **Letter spacing:** 0.06

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.81 | 0.83px |
| body | — | — | 16px | 1.35 | -0.16px |
| subheading | — | — | 19px | 1.2 | 0px |
| heading-sm | — | — | 24px | 1.2 | 0.5px |
| heading | — | — | 28px | 1.2 | 0.5px |
| heading-lg | — | — | 50px | 1.06 | 0.4px |
| display | — | — | 75px | 0.85 | -0.9px |
| display-xl | — | — | 250px | 0.85 | -0.5px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 10px
- **cards:** 16px
- **badges:** 10px
- **images:** 0px
- **inputs:** 3px
- **buttons:** 3px

## Components

### Filled Action Button
**Role:** Primary interactive element when a action is required

Background #151515, text #ffffff, no border, 3px radius, padding 14px 24px, TWK Lausanne 13px weight 400 uppercase with 0.073em tracking. Reverses to outlined on hover. Used sparingly — Escape's commerce moments, not every click.

### Text Underline Link
**Role:** Default inline and standalone link

TWK Lausanne 13–16px weight 400 in #151515, single 1px bottom border in #151515. No background, no padding. The 1px underline IS the affordance — never replaced with color or weight.

### Shop Now Pill Button
**Role:** Inline commerce call-to-action embedded over photography

Transparent background, 1.5px border in #f5f4f2 (matching canvas, creating a soft ring on dark imagery), padding 10px 20px, Garaje 18px weight 600 uppercase with 0.044em tracking. Floats over product photography without competing with the image.

### Product Card
**Role:** Coffee product listing in grids

White (#ffffff) surface on Bone (#f5f4f2) canvas, 16px radius, no shadow, 24px internal padding. Product image fills card, name and price below in TWK Lausanne 19px weight 300. Origin/process metadata in Garaje 18px uppercase at 0.044em tracking.

### Limited Series Card
**Role:** Featured collection or editorial tile

Full-bleed photography inside a 16px-radius frame, 4:3 or 3:4 aspect, no border, no shadow. Overlay label in Molitor 45–75px weight 300 over the bottom-left corner, white text. Title repeated below card in TWK Lausanne 24px weight 600.

### Sidecar Info Bar
**Role:** Persistent vertical strip on the right edge

80px wide, full viewport height, #f5f4f2 background, fixed position. Contains rotated shipping notice in Garaje 18px weight 600 at 0.053em tracking, plus stacked social/utility icons at top and bottom. Separated from content by a 1px #ebe9e6 line.

### Category Label (Garaje Tag)
**Role:** Uppercase product categories, table headers, and metadata labels

Garaje 18–22px weight 300–600, #151515, tracking 0.044–0.053em, uppercase. No background, no border, no padding. Functions as a typographic tag, not a UI chip.

### Data Table Row
**Role:** Product detail tables (origin, type, process)

TWK Lausanne 13px weight 400 in #151515, single-cell layout with 1px #ebe9e6 row dividers, 5px vertical padding. Label column in Garaje 18px uppercase at 0.044em tracking, value column left-aligned in TWK.

### Input Field
**Role:** Newsletter, search, form entry

No visible border by default. Underline-only style: 1px bottom border in #8a8a8a, 3px radius on the underline ends. Placeholder in TWK Lausanne 14px weight 300, #8a8a8a. Focus state thickens underline to 2px and shifts to #151515. No background fill.

### Hero Display Headline
**Role:** Primary emotional statement on landing

Molitor 250px weight 300, line-height 0.85, letter-spacing -0.02em, color #ffffff, set over full-bleed atmospheric photography. Never centered always left-aligned, starting at the canvas edge. Often 2–4 words, wrapping to 3–5 lines.

### Nav Bar
**Role:** Top-level site navigation

Sticky, transparent or #f5f4f2, left-aligned logo in TWK Lausanne 18px weight 600, right-aligned nav items in Garaje 18px weight 600 uppercase at 0.044em tracking. 1px #ebe9e6 bottom border. No background fill, no shadow.

### Collection Card Grid Item
**Role:** Card in the Collections section

Image tile 16px radius, aspect ratio matches the feature it previews. Below the image, a category label in Garaje 18px uppercase + title in Molitor 45px weight 300, all left-aligned. The grid breathes with 40px gutters on a Bone canvas.

## Do's and Don'ts

### Do
- Use Molitor only at 45px or larger — below that scale it loses its editorial weight and fights with TWK Lausanne body text
- Set every display headline at line-height 0.85 so lines of type lock together like stone courses; do not let them breathe vertically
- Use Garaje exclusively for all-caps tracked labels (categories, metadata, nav) — never for body copy or sentences
- Let photography bleed full-width whenever possible; the design system's job is to frame the image, not to decorate it
- Use #f5f4f2 as the default surface for everything that isn't a card or input — pure white only appears as a surface lift, never as the canvas
- Set product metadata (TYPE / ORIGIN / PROCESS) in Garaje 18px with 0.044em tracking to create a typographic spine that runs through the page
- Keep all borders at 1px or 1.5px in warm grays (#ebe9e6 or #f5f4f2) — the system whispers, it does not announce
- Give every link a visible 1px underline in #151515 — never rely on color alone to signal interactivity

### Don't
- Never introduce chromatic color (blue, red, green) into the UI — the system is intentionally 0% colorfulness; the only accent is the warm-to-cool contrast in the photography itself
- Do not use shadows for elevation — the design avoids drop-shadows entirely; use surface tone shifts (#f5f4f2 → #ffffff → #ebe9e6) instead
- Do not use border-radius above 16px on any element — radii above 20px break the editorial, stone-cut feel
- Do not set body text below 13px or above 19px — the type scale has a strict functional range outside of display
- Never use italics in body or UI; weight contrast (200 vs 600) is the only typographic hierarchy tool
- Do not center body copy or paragraph blocks — left-align everything, even short micro-copy
- Do not use a chromatic accent for sale badges, new tags, or status — rely on Garaje uppercase + tracking to distinguish labels
- Do not use gradients — the palette is flat and the system relies on photographic depth for visual interest
- Do not let UI elements sit inside the right-edge sidecar — that 80px strip is reserved for shipping info and utility icons

## Elevation

Escape uses no drop-shadows. Surfaces are distinguished by tone shifts within the warm-gray palette: #f5f4f2 canvas → #ffffff card → #ebe9e6 recessed → #151515 inverse. The only 'shadow' in the system is a 1.5px ring used on a handful of outlined buttons and badges, which functions as a border not elevation. Depth is created by photography and whitespace, never by z-axis separation.

## Surfaces

- **Canvas** (`#f5f4f2`) — Page background, full-bleed warm off-white
- **Card** (`#ffffff`) — Product cards, content panels, elevated containers
- **Recessed** (`#ebe9e6`) — Input fields, subtle zone separators, disabled states
- **Inverse** (`#151515`) — Inverted sections, filled actions, dark overlays on imagery

## Imagery

Photography is the design system's primary material. Every section above the fold is built around a full-bleed, atmospheric photograph: frost on stone, weathered mountain fog, coffee grounds scattered on granite, product bags laid on raw surfaces. Treatment is documentary and unpolished — never studio-lit, never lifestyle-staged, never stock-cheerful. Images are desaturated or already muted in capture, sitting naturally within the monochromatic palette. Subjects are always textures and surfaces (stone, snow, bark, paper, cloth) rather than people. Composition favors tight crops and overhead angles. The Shop Now button and product cards sit ON the image, not next to it, so photography and commerce share the same plane. No illustration, no 3D, no abstract graphics — the system is anti-decorative.

## Similar Brands

- **Aesop** — Same warm off-white canvas, monochrome restraint, and large editorial serif display type against photography
- **Mast Brothers** — Same editorial product photography on raw stone/wood surfaces, three-typeface system with a dramatic display voice, near-zero color
- **Fellow** — Same obsession with thin type, warm grays, and photography-driven commerce moments; similar use of full-bleed atmospheric imagery over restrained UI
- **La Cabra** — Same left-aligned oversized display type, warm off-white canvas, monochromatic palette, and product-as-art photography treatment
