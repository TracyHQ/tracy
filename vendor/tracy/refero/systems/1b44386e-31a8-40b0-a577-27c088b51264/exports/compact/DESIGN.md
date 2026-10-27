# Lusion — Style Reference
> 3D sculpture gallery on a frosted lavender plane. Every interface element should feel like a tactile object resting on a pale, slightly cool gallery floor, with the 3D content doing all the chromatic and dramatic work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lusion treats its website as a digital sculpture gallery rather than a typical agency portfolio. The entire chrome sits on a cold lavender-tinted off-white (#f0f1fa) that makes pure black Aeonik text feel etched into the canvas, while the 3D renders — vivid electric indigo crosses, polished metal, glass cylinders — supply every drop of chromatic energy. Pill-shaped components at 87–100px radius make the UI feel like physical objects placed on a gallery floor, never card stacks. Shadows are reduced to a 4% whisper; depth and drama come from the 3D content itself, not from UI elevation. Whitespace is generous, navigation is reduced to bare essentials, and the few text links are pure black with the same tight -0.02em tracking as body copy.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lavender Mist | `#f0f1fa` | Page canvas — the dominant background, a cool off-white with a barely-perceptible lavender cast that makes pure black text feel sharper than it would on pure white |
| Paper White | `#ffffff` | Elevated card and surface backgrounds, button text on dark fills, inverted surfaces |
| Ink | `#000000` | Primary text, all headings, body copy, icons, and link text — pure black with no softening |
| Graphite | `#2b2e3a` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Haze | `#e4e6ef` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Slate Hollow | `#34393f` | Deep surface layer for dark bands or modal overlays, darker than graphite for clear hierarchy separation |
| Electric Indigo | `#1a2ffb` | Chromatic brand accent — appears as icon stroke, inline highlight marks, and as the signature color inside the 3D hero render. The single source of energy against the otherwise achromatic UI |
| Acid Lime | `#c1ff00` | Highlight wash for emphasis zones, secondary accent inside 3D compositions — used sparingly as a surprise contrast |

## Typography

### Aeonik — Used for every text element on the site — navigation, body, headings, buttons, inputs. The deliberate weight ceiling at 500 (no bold) and uniformly tight -0.02em tracking create a uniform geometric confidence. Display sizes compress line-height to 0.90, letting the largest headlines (108–144px) feel sculpted rather than set. The 400 weight is the workhorse; 500 is reserved for navigation, labels, and button text where a slight emphasis is needed.
- **Substitute:** Inter, Satoshi, General Sans, or DM Sans
- **Weights:** 400, 500
- **Sizes:** 12, 13, 14, 16, 18, 20, 22, 26, 36, 38, 43, 49, 50, 108, 115, 144
- **Line height:** 0.90, 1.00, 1.10, 1.15, 1.20, 1.40, 1.50
- **Letter spacing:** -0.02em applied uniformly across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.24px |
| body-sm | — | — | 14px | 1.4 | -0.28px |
| body | — | — | 16px | 1.4 | -0.32px |
| subheading | — | — | 20px | 1.2 | -0.4px |
| heading-sm | — | — | 26px | 1.2 | -0.52px |
| heading | — | — | 38px | 1.15 | -0.76px |
| heading-lg | — | — | 50px | 1.1 | -1px |
| display | — | — | 144px | 0.9 | -2.88px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1400px
- **Section gap:** 72px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 15px
- **inputs:** 18px
- **buttons:** 87.5px
- **smallDetails:** 3px
- **imageContainers:** 100px

## Components

### Pill Action Button
**Role:** Primary call-to-action (e.g. 'LET'S TALK')

Filled dark pill at #2b2e3a background, white text in Aeonik 14px weight 500, -0.02em tracking, uppercase. Radius 87.5px (full pill). Padding 14px 24px. No border, no shadow. A small 1px white dash or plus icon sits to the left of the label as a decorative tick mark.

### Ghost Navigation Link
**Role:** Header menu items and inline links

Pure black text (#000000) in Aeonik 14–16px weight 500, uppercase, -0.02em tracking. No underline, no background. Hover state increases opacity or adds a subtle underline. Sits directly on the Lavender Mist canvas.

### Menu Toggle Button
**Role:** Header right-side menu trigger

Text label 'MENU' in Aeonik 14px weight 500, black, followed by a small horizontal dash/plus icon. No background or border. Identical visual weight to the pill button label but without the dark fill — it relies on proximity and the canvas for separation.

### Hero Image Container
**Role:** Large 3D artwork display

Full-width container with 100px border-radius (the signature soft-rectangle shape). No padding inside — the 3D render bleeds to the edges. Sits directly on the Lavender Mist canvas with no shadow; the contrast between the dark 3D scene and the pale canvas is the only visual separation.

### Card Surface
**Role:** Content cards, secondary information blocks

White (#ffffff) background, 15px border-radius, 24px padding, no shadow. Optional 1px border in #e4e6ef for definition against the canvas. Typography inside uses black on white at Aeonik 16px weight 400.

### Scroll Indicator
**Role:** Bottom-of-viewport prompt

Centered 'SCROLL TO EXPLORE' label in Aeonik 12–14px weight 500, black, uppercase, with flanking plus signs (+) as decorative ticks. No background, sits in the margin between hero and content sections.

### Input Field
**Role:** Form inputs in contact or newsletter areas

White or Lavender Mist background, 18px border-radius, 1px border in #e4e6ef, Aeonik 16px weight 400 placeholder text in a muted gray. Focus state replaces border with Electric Indigo (#1a2ffb). Padding 14px 18px.

### Header Bar
**Role:** Site-wide navigation

Transparent, sits directly on the Lavender Mist canvas with 24–32px vertical padding. Logo (Aeonik wordmark) left-aligned, a short descriptive headline centered, and action + menu controls right-aligned. No background fill, no border, no shadow — the header is typographic, not architectural.

### Section Divider Tick
**Role:** Visual rhythm element between sections

Small plus-sign (+) marks in black, scattered as decorative punctuation along section edges. Aeonik 16px, no background, used as a signature visual signature rather than functional UI.

## Do's and Don'ts

### Do
- Use Lavender Mist (#f0f1fa) as the canvas for every full-page background; never use pure white as the page base — the slight lavender cast is the brand
- Set all text to pure black (#000000) with Aeonik at weight 400–500 and tracking -0.02em; never introduce a bold weight or a softer gray for emphasis
- Use the 87.5px pill radius for all action buttons and the 100px radius for all image/hero containers; these two radii are the signature shape language
- Reach for Electric Indigo (#1a2ffb) only as a chromatic punctuation — icon stroke, inline highlight, focus ring on inputs — never as a large filled surface
- Keep shadows at the single 4% black whisper stack (0px 6px 10px + 0px 2px 4px); do not stack multiple elevations or introduce colored shadows
- Space sections at 72px vertical rhythm; let the generous breathing room and 3D content do the work rather than adding dividers or borders
- Use Aeonik at the full size range from 12px caption through 144px display; let the type scale itself create hierarchy rather than color or weight variation

### Don't
- Don't introduce a third type weight above 500 — bold or black weights break the restrained typographic system
- Don't use white (#ffffff) as the page background; the Lavender Mist canvas is what makes black text and 3D content feel cut and crisp
- Don't fill large UI surfaces with Electric Indigo; it is an accent, not a brand wash — large indigo blocks destroy the gallery-floor metaphor
- Don't add decorative gradients, glassmorphism, or blur effects; surfaces are flat and physical
- Don't use 8px, 12px, or 20px border-radii on cards, buttons, or containers — stick to the defined 3px, 15px, 18px, 87.5px, and 100px values
- Don't add hover states that change background fill or introduce color; rely on opacity shifts and underline reveals against the static canvas
- Don't use the Acid Lime (#c1ff00) as a CTA or text background; it lacks the contrast hierarchy needed for interactive elements and belongs only inside 3D compositions or highlight washes

## Elevation

- **Pill Action Button:** `rgba(0, 0, 0, 0.04) 0px 6px 10px 0px, rgba(0, 0, 0, 0.04) 0px 2px 4px 0px`
- **Card Surface:** `rgba(0, 0, 0, 0.04) 0px 6px 10px 0px, rgba(0, 0, 0, 0.04) 0px 2px 4px 0px`

## Surfaces

- **Lavender Canvas** (`#f0f1fa`) — Default page background, dominant surface
- **Paper Surface** (`#ffffff`) — Elevated cards and content blocks
- **Haze Edge** (`#e4e6ef`) — Borders, dividers, disabled states
- **Graphite Plate** (`#2b2e3a`) — Dark UI elements, button fills
- **Slate Hollow** (`#34393f`) — Darkest surface layer for inverted sections or overlays

## Imagery

The site is image-driven through full-bleed 3D renders — metallic, glass, and matte plastic objects (cross shapes, cylinders, spheres) rendered in Electric Indigo, black, and white. These renders occupy the entire viewport inside 100px-radius containers, floating on the Lavender Mist canvas with no padding or frame. No photography, no illustration, no icons in the traditional sense — the 3D content IS the visual system. Iconography is minimal: small plus signs, dashes, and arrows in pure black or Electric Indigo, used as decorative ticks and scroll prompts. The 3D work carries all the chromatic and dramatic weight, leaving the UI chrome achromatic and quiet.

## Layout

Full-bleed canvas with a max content width of approximately 1400px centered. The header is a thin transparent bar with the wordmark left, a short descriptive line center, and action/menu controls right — no sticky behavior, no background fill. The hero pattern is a centered short headline (3 lines max) followed by a massive rounded-corner 3D render container that fills the viewport width. Section rhythm is consistent vertical spacing at 72px with no dividers or background alternation — the entire page sits on the same Lavender Mist canvas, so visual separation comes from 3D content and generous whitespace rather than from colored bands. Content arrangement is centered stacks for text and full-bleed for imagery; no asymmetric two-column layouts or z-patterns. The overall density is spacious and gallery-like, with each 3D render given room to breathe as a standalone object.

## Similar Brands

- **Active Theory** — Both are 3D/webGL agency sites that use full-bleed rendered scenes as the primary visual, with a minimal achromatic UI frame and a single chromatic accent inside the 3D content
- **Resn** — Same spacious-gallery layout philosophy, dark 3D artwork against pale canvas, and restrained UI chrome that defers all drama to the rendered content
- **Locomotive** — Shares the pill-shaped button language, generous whitespace, and an almost-typographic navigation approach with nearly no border or shadow on the interface
- **Basement Studio** — Both use vivid single-hue accents (indigo/blue) inside 3D compositions while keeping the surrounding UI strictly achromatic and gallery-like
- **Gunner** — Similar dark 3D renders inside soft-cornered containers, with flat chrome and a focus on letting the artwork dominate while UI stays quiet
