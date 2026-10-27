# Favorit Studio — Style Reference
> Gallery wall in black and white — a single oversized serif floating on infinite white, anchored by a quiet photograph.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Favorit Studio is an editorial gallery in browser form: pure white canvas, near-absolute monochrome ink, and photography that does the emotional work. Two custom typefaces carry the entire visual language — a sharp serif (Favorit Times) reserved for monumental display, and a quiet grotesk (TWKLausanne) for everything utilitarian. Spacing breathes like a printed magazine spread; no shadows, no borders, no color, no gradients. Every element either sets type or shows an image, nothing else is allowed to exist.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | All text, thin dividers, image overlays, wordmark fill, and the sole stroke color for outlined controls. Maximum contrast against paper |
| Paper | `#ffffff` | Page canvas, all surface backgrounds, inverted text on dark photographic plates, scroll indicator wells |

## Typography

### Favorit Times — Display and editorial headlines only. The wordmark 'Favorit' and section titles live here. Set at sizes between 44px and 179px, always weight 400, always with negative tracking that tightens proportionally with size. A single weight at display size is the signature: no bold, no italic — authority comes from scale and the serif's contrast, not from weight.
- **Substitute:** Playfair Display, GT Sectra, or Canela
- **Weights:** 400
- **Sizes:** 44px, 55px, 179px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.025em at all display sizes

### TWKLausanne — Utility and body voice — navigation labels, scroll indicators, list items, body copy, and the rare button. Also handles oversized sans display work in the 135–189px range where the serif would feel wrong. Tracking loosens as size shrinks: -0.025em at display, -0.017em at mid, -0.010em at body. A single weight across the entire scale keeps the sans disciplined and the serif dramatic by contrast.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400
- **Sizes:** 14px, 23px, 135px, 159px, 189px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.025em at 135–189px, -0.017em at 23px, -0.010em at 14px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.2 | -0.14px |
| body | — | — | 23px | 1.2 | -0.39px |
| heading-sm | — | — | 44px | 1.2 | -1.1px |
| heading | — | — | 55px | 1.2 | -1.375px |
| display | — | — | 179px | 1 | -4.475px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 46px
- **Card padding:** 16px
- **Element gap:** 21px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Wordmark Display
**Role:** Primary brand identifier

The word 'Favorit' or 'Studio' rendered at 179px in Favorit Times, weight 400, letter-spacing -0.025em, line-height 1.0. Ink black on Paper white. Anchors the top-left of every page. No logo mark, no icon — the word IS the mark.

### Minimal Nav Link
**Role:** Navigation text anchor

TWKLausanne 14px, weight 400, letter-spacing -0.14px, Ink color. Vertically oriented (rotated 90°) for the right-edge 'Scroll' indicator and the 'M' section marker. No underlines, no buttons — just letters. 21px padding around the clickable area.

### Full-Bleed Photograph
**Role:** Primary content surface

Edge-to-edge image occupying the full viewport width. No border, no radius, no shadow. Aspect ratio varies per image (the studio portraits sit roughly 4:3 landscape). Subject always centered, always against a warm neutral seamless backdrop. This IS the layout — the photograph replaces cards, sections, and grids.

### Editorial Image Stack
**Role:** Scrollable content sequence

A vertical rhythm of full-bleed photographs separated by approximately 46px of white space. No captions, no labels, no overlays. The sequencing of images creates the narrative; typography appears only at section breaks.

### Sans Display Heading
**Role:** Secondary large-type moment

TWKLausanne at 135–189px, weight 400, letter-spacing -0.025em, line-height 1.0. Used where the editorial serif would compete with a photographic subject. Same scale as the serif display but in the utilitarian voice — a quieter kind of loud.

### Scroll Indicator
**Role:** Affordance for vertical exploration

The word 'Scroll' set vertically (rotated -90°) in TWKLausanne 14px, weight 400, Ink. Pinned to the right edge with 21px offset from the viewport edge. No arrow, no animation described — the word itself is the cue.

### Ghost Border Control
**Role:** Rarefied interactive element

Outlined button using a 1px Ink border, transparent fill, Ink text in TWKLausanne 14px. 16px padding on all sides, 0px radius. No fill state, no hover color shift — the border simply exists or doesn't. Used only for essential actions; the site avoids interactive elements almost entirely.

### List Item
**Role:** Sequential content (case studies, links)

TWKLausanne 14px, weight 400, Ink. 21px horizontal padding, 46px vertical padding, 54px right margin between items. No bullets, no dividers — spacing alone separates entries.

## Do's and Don'ts

### Do
- Set display headlines in Favorit Times at 179px with -0.025em tracking — the size and the negative tracking are inseparable from the brand.
- Use TWKLausanne weight 400 exclusively across every size from 14px to 189px; never introduce a bold or medium weight.
- Let photographs bleed to the viewport edge with 0px radius and no border — the image IS the layout.
- Separate content blocks with exactly 46px of white space; let the page breathe like a printed spread.
- Reserve all color for photography; the UI itself must remain pure #000000 on #ffffff.
- Use the serif (Favorit Times) for moments of editorial drama and the sans (TWKLausanne) for everything utilitarian — never mix them in the same line.
- When a control is necessary, use the 1px Ink ghost border at 16px padding with 0px radius — no fills, no shadows.

### Don't
- Never add color, gradients, or shadows to UI elements — the monochrome ink-on-paper discipline is the brand.
- Never round corners on images, cards, or buttons — 0px radius is the only radius.
- Never use a bold or semibold weight; the entire system speaks in weight 400, differentiating through size and family alone.
- Never set body or navigation text in the serif face — TWKLausanne is the only utilitarian voice.
- Never add visible borders, dividers, or cards around photographic content — the white space between images is the only separator.
- Never use iconography, illustrations, or decorative graphics — the site uses type and photography exclusively.
- Never place text directly on photographs without a solid color treatment; text always lives on the white canvas.

## Elevation

The design is intentionally flat — zero shadows, zero borders, zero elevation effects. Depth is created through scale contrast (type and image), generous white space, and the editorial sequencing of full-bleed photographs. Any shadow would break the print-on-paper illusion the entire system depends on.

## Surfaces

- **Paper** (`#ffffff`) — The entire page canvas. There is no surface above it — no cards, no panels, no elevated layers. All text and all photographs sit directly on Paper.

## Imagery

Full-bleed studio photography is the only visual content beyond typography. Subjects (people, objects) are always centered against a warm neutral seamless backdrop in desaturated earth tones — taupe, putty, warm gray. The treatment is editorial fashion photography: controlled studio lighting, sharp focus, deliberate negative space around the subject. Images are large, edge-to-edge, and uncropped — no rounded corners, no masks, no overlays. The colorfulness score of 0% applies strictly to the UI; the photography carries all the warmth and tonal variation the interface refuses to show.

## Layout

Full-bleed single-column scroll with no max-width constraint. The page is essentially a vertical exhibition: the wordmark anchors the top-left, navigation lives in the top-right as minimal vertical text, and the body is a sequence of oversized photographs stacked vertically with ~46px of white breathing room between them. No grid system is visible — each photograph claims the full viewport width at varying aspect ratios. Section titles in the serif face appear as full-width text blocks that interrupt the image sequence. The overall rhythm is gallery-walk: walk forward, see one piece, pause, see the next.

## Similar Brands

- **Pentagram** — Same editorial-magazine approach: oversized serif type on white, photography as primary content, no decorative chrome
- **Manual (manual.to)** — Radical monochrome with two-typeface system (serif display + sans utility), generous white space, studio photography
- **DIA Studio** — Gallery-like single-column scroll with monumental serif headlines interrupting full-bleed image sequences
- **Locomotive (locomotive.ca)** — Agency portfolio aesthetic: pure white canvas, quiet navigation, oversized custom type, image-dominant layout
