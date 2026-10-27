# Ragged Edge — Style Reference
> Editorial brutalism on white marble. Imagine Vogue's typographic confidence merged with a Berlin gallery's color restraint — all ink and air, with one burst of color used as exclamation, never decoration.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ragged Edge operates as a confident brand consultancy site built on near-total monochrome discipline: near-black ink on white, with a single saturated violet used sparingly as an outlined accent and a singular full-bleed gradient hero that acts as the only chromatic event on the homepage. Typography is the entire personality — an extremely expanded uppercase display face (ABCDiatypeExpanded) does the shouting while a refined serif (Grit) does the talking, creating a tension between editorial magazine typography and brutalist display letterforms. Layouts are maximalist in scale (full-bleed hero, 180px section gaps) but minimal in palette, and all interactive surfaces are pill-shaped with radii in the 40–64px range, giving every button and nav item a soft capsule form that contrasts against the angular expanded type.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian Ink | `#181f1f` | Primary text, hairline borders, filled action buttons — the dominant near-black that carries 90% of the interface |
| Paper White | `#ffffff` | Canvas background, inverted text on dark blocks, nav/button borders |
| Fog | `#d1d2d2` | Subtle dividers and secondary borders where Obsidian would be too heavy |
| Ash | `#a3a5a5` | Muted helper text, inactive button borders, secondary metadata |
| Graphite | `#374151` | Secondary body text and subtle icon strokes where a lighter black is needed |
| True Black | `#000000` | Navigation dividers and surface backing for select blocks |
| Mint Wash | `#eaf7f3` | Soft tinted surface for nav backgrounds and breathing sections — barely-there green to warm the white canvas |
| Deep Teal | `#1f3233` | Dark surface blocks for case study framing and image-overlay panels |
| Iris Voltage | `#516fea` | Outlined action border only — the sole chromatic accent; appears as a violet ring around secondary call-to-action buttons against monochrome surroundings |
| Solar Bloom | `linear-gradient(0deg, rgba(255, 194, 64, 0), rgb(255, 194, 64) 25%, rgb(255, 196, 244) 50%, rgb(150, 235, 235) 75%, rgba(150, 235, 235, 0) 100%)` | Hero gradient stop — warm yellow anchoring the top of the full-bleed gradient wash |

## Typography

### ABCDiatypeExpanded-Bold — Display, brand logo, section headings, project titles, and nav labels. The extremely wide expanded letterforms (letter-spacing -0.02em at 78–82px) are the signature element — uppercase, never set small under 10px, and reserved for moments that demand visual weight. The 78–82px sizes fill the full width of the hero canvas. Weight stays at 400 because the expansion provides all the weight needed; going bolder would distort the geometric proportions.
- **Substitute:** Druk Wide, Antonio Expanded, Bebas Neue (as fallback only — no substitute matches the expansion precisely)
- **Weights:** 400
- **Sizes:** 10px, 12px, 16px, 20px, 40px, 78px, 82px
- **Line height:** 1.10–1.20 for display, 2.00 for vertical/rotated use
- **Letter spacing:** -0.02em at display sizes (78–82px), -0.01em at mid sizes (20–40px), normal at 10–16px
- **OpenType features:** `"kern"`

### Grit-Regular — All body copy, paragraph text, descriptions, and mid-weight headings. A contemporary serif with subtle texture — provides editorial gravitas against the expanded display sans. Weight 400 for running text, 500 for emphasized phrases and sub-headings. The 56px size with 1.25 line-height creates dramatic editorial pull-quotes. Pairs with ABCDiatypeExpanded by contrasting serif warmth against geometric coldness.
- **Substitute:** Söhne (serif alternative), GT Sectra, Tiempos Text, Lora
- **Weights:** 400, 500
- **Sizes:** 14px, 16px, 20px, 30px, 56px
- **Line height:** 1.43 for body, 1.20–1.25 for headings, 2.60 for spacious lead paragraphs
- **Letter spacing:** normal
- **OpenType features:** `"kern"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.25 | 0px |
| heading | — | — | 30px | 1.2 | 0px |
| heading-lg | — | — | 40px | 1.15 | -0.4px |
| display | — | — | 56px | 1.25 | -0.56px |
| hero | — | — | 80px | 1.1 | -1.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 180px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **nav:** 64px
- **cards:** 40px
- **inputs:** 54px
- **buttons:** 64px
- **body-blocks:** 40px

## Components

### Hero Gradient Banner
**Role:** Full-viewport opening visual

Full-bleed gradient (yellow → pink → cyan, 0deg, with transparent ends) fills the entire viewport. The 'RAGGED EDGE' wordmark sits centered in white ABCDiatypeExpanded-Bold at 80px with -0.02em tracking, extending nearly edge-to-edge. No shadow, no overlay — the gradient is the surface.

### Pill Navigation Button
**Role:** Primary nav and utility navigation

Rounded 64px radius, 12px vertical / 32px horizontal padding, background Mint Wash (#eaf7f3) with Obsidian Ink (#181f1f) border at 1px. Label in ABCDiatypeExpanded-Bold at 10–12px, uppercase. Group of nav pills on the left, utility pills ('Join', 'Contact') on the right. No fill on the secondary right-side pills — they sit transparent on the gradient.

### Outlined Accent Button
**Role:** Secondary call-to-action with chromatic distinction

54px radius pill, 34px horizontal padding, 1.5px border in Iris Voltage (#516fea), white fill, Obsidian Ink label text. The only chromatic border in the entire system — reserved for actions that need to stand apart from the monochrome nav/button field.

### Editorial Headline
**Role:** Section-opening statement

Grit-Regular weight 500 at 56px, Obsidian Ink, line-height 1.25, -0.01em tracking. Often followed by a serif body paragraph at 20–30px / 1.43 line-height with generous 180px top margin separating it from the preceding section.

### Case Study Split Block
**Role:** Project showcase with text-left, image-right layout

Two-column grid at ~5/7 ratio. Left column: project name in ABCDiatypeExpanded-Bold at 20–40px, then a short Grit-Regular serif description (20px / 1.43), then a bold sans-serif tagline and location detail in Grit weight 500 at 14px. Right column: full-bleed image or color-block panel (e.g. the Free Soul maroon block) with the project name rotated 90° in white ABCDiatypeExpanded.

### Vertical Project Mark
**Role:** Overlaid image identity

White ABCDiatypeExpanded-Bold at 16–20px, rotated -90°, set centered within a solid-color image block. Functions as a watermark-style label on case study imagery.

### Image-Block Panel
**Role:** Full-bleed case study visual

Large rectangular media surface with no border-radius on the outer edges (bleeds to container), containing either photography or a solid brand color (maroon, deep teal, etc.). Padding inside is zero — type overlays directly on the image.

### Section Divider
**Role:** Thin horizontal break between content bands

1px hairline in Fog (#d1d2d2) or Obsidian Ink (#181f1f) at very low opacity, spanning the full content width. Minimal — the generous 180px vertical gaps do most of the separation work.

## Do's and Don'ts

### Do
- Use ABCDiatypeExpanded-Bold only at 10px or above; below that the expanded forms become illegible.
- Pair Grit-Regular body text with ABCDiatypeExpanded-Bold headings — never two serifs or two expanded sans in the same block.
- Reserve the 180px section gap for major content divisions; use 80px for within-section breaks.
- Apply the 64px radius to all nav and button surfaces; 40–54px for body content blocks.
- Use Iris Voltage (#516fea) only as a 1.5px border on outlined buttons — never as a fill, never on text.
- Let the hero gradient be the only colorful surface on any given page; all subsequent sections stay on white or mint.
- Set hero display text at 78–82px with -0.02em tracking to achieve the edge-to-edge brand mark effect.

### Don't
- Do not introduce additional accent colors — the system is 98% monochrome; a second chromatic breaks the discipline.
- Do not apply box-shadows anywhere — depth comes from surface tone shifts, not elevation.
- Do not use ABCDiatypeExpanded for body copy longer than 4–5 words; it is a display face, not a running-text face.
- Do not center body text blocks; editorial layouts read left-aligned with generous left margin.
- Do not use border-radius below 40px on any container — sharp corners clash with the pill-button system.
- Do not place Iris Voltage on dark backgrounds; it loses its accent role against high-contrast surfaces.
- Do not set the hero gradient above 0deg orientation or stop count; the directional flow is part of the signature.

## Elevation

No shadows. Depth is achieved through tonal contrast (white → mint → teal → obsidian) and generous spacing, not drop-shadows. The interface reads as flat printed editorial, not skeuomorphic UI.

## Surfaces

- **Paper White** (`#ffffff`) — Primary page canvas and most content sections
- **Mint Wash** (`#eaf7f3`) — Tinted section background, nav pill bases — adds subtle warmth
- **Deep Teal** (`#1f3233`) — Dark image/panel framing for case study blocks
- **Obsidian Ink** (`#181f1f`) — Highest-elevation dark surface — hero overlay, footer

## Imagery

Imagery is case-study-driven: large rectangular photography and solid-color brand blocks bleed to container edges with zero border-radius on the outer boundary. Case study images carry no lifestyle context — they are product crops, packaging, or brand-environment photography that fills the frame. A signature move is rotating the project name 90° in white ABCDiatypeExpanded as a vertical watermark overlaid directly on a solid color panel (maroon, teal, etc.). No illustrations, no icons beyond simple chevrons and arrows. The only 'decorative' visual is the full-bleed hero gradient itself — a flowing yellow-to-pink-to-cyan wash that functions as the site's sole chromatic moment. Photography treatment is editorial: high-contrast, often duotone-feeling, always full-bleed within its block.

## Layout

Full-bleed hero with centered display wordmark, then alternating white and mint sections separated by 180px vertical gaps. Below-the-fold layout shifts to a 2-column split: text-left at ~5/12 width, image-right at ~7/12 width, for case study blocks. No sidebar navigation. The top-level nav is a single horizontal row of pill buttons sitting directly on the hero gradient. Content density is low — each section gets the full viewport height to breathe. Case studies stack vertically with the text/image alternating sides as the page scrolls. The overall rhythm is editorial magazine: headline, generous air, image, headline, air, image — never card grids or dense feature blocks.

## Similar Brands

- **Pentagram** — Same editorial-monochrome discipline with bold display typography and full-bleed case study imagery — both treat type as the primary brand asset
- **Manual (design agency)** — Identical pill-button navigation aesthetic, generous section spacing, and serif/sans typographic tension in case study layouts
- **Locomotive (MTL)** — Same approach of a single chromatic gradient hero against a near-totally monochrome site below, with bold expanded display type
- **Bureau Cool** — Shared typographic confidence — oversized display headings, restrained palette, editorial white space, and ultra-rounded capsule buttons
