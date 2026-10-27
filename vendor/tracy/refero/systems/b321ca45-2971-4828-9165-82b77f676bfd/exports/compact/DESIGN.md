# The Beams — Style Reference
> overlapping ink on white paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The Beams is an editorial monolith: pure black ink on pure white paper, where typography does all the heavy lifting. A single weight 400 sans-serif scales from 19px body copy to 160px display, with line-heights that compress dramatically at large sizes (0.90 at display) to let letterforms overlap and collide — the signature visual. No shadows, no rounded corners, no gradients, no accent color: the design system strips UI to ink, paper, and an occasional full-bleed photograph. Density is generous and unhurried, sections separated by vast whitespace rather than dividers. The only interaction is text on text, cursor on canvas — a cultural venue that presents itself as a magazine spread rather than a website.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Primary text, all borders, structural rules, button text and outlines — the only chromatic signal in the system |
| Paper | `#ffffff` | Page canvas, surface backgrounds, button interiors, inverse text on dark photography |

## Typography

### NeueHaas-web — Sole typeface across every role: 19px body, 29px subheading, 38px secondary heading, 95px hero display, 160px editorial display. Weight stays at 400 (regular) even at maximum scale — the system derives hierarchy from size and line-height compression, never from boldness. Tracking tightens to -0.03em universally. At display scale (160px), line-height drops to 0.90 so lines physically overlap, creating layered typographic compositions rather than stacked headlines.
- **Substitute:** Neue Haas Grotesk Display Pro, Inter (weight 400), Helvetica Neue
- **Weights:** 400
- **Sizes:** 19px, 29px, 38px, 95px, 160px
- **Line height:** 0.90, 1.00, 1.10, 1.95, 2.90
- **Letter spacing:** -0.03em at all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 19px | 2.9 | -0.57px |
| subheading | — | — | 29px | 1.95 | -0.87px |
| heading-sm | — | — | 38px | 1.1 | -1.14px |
| display | — | — | 160px | 0.9 | -4.8px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 120px
- **Card padding:** 19px
- **Element gap:** 19px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Editorial Display Headline
**Role:** Hero typographic statement

160px NeueHaas-web weight 400, line-height 0.90, letter-spacing -0.03em, color #000000 on #ffffff. Lines overlap intentionally — multiple phrases layered at the same position create a typographic texture rather than a stacked headline. No margin or padding around the composition; it bleeds to container edges.

### Outlined Action Button
**Role:** Primary call-to-action (e.g. SIGN UP)

1px solid #000000 border, transparent background, #000000 text. Padding 11px top/bottom, 19px left/right (matches base unit). Typography: 19px NeueHaas-web weight 400. No radius. No fill state changes. A trailing arrow glyph (↗) sits inside the button as part of the text label.

### Minimal Top Navigation
**Role:** Site header

White background, no border, no background fill. Brand mark "BEAMS" in 19px weight 400 left-aligned. Center title in same weight, sentence-case. Right-side single-character icon ("+") as the only interactive element. No sticky behavior implied; sits at the very top of the page.

### Two-Column Body Block
**Role:** Narrative text pair

Two equal columns separated by whitespace (no divider, no gutter rule). Each column: 29px NeueHaas-web weight 400, line-height 1.95, #000000, -0.03em tracking. Left column carries the lead statement in shorter form; right column expands with supporting prose. Generous vertical breathing room (120px+) above and below.

### Full-Bleed Photographic Section
**Role:** Atmospheric content moment

Edge-to-edge image (no border-radius, no margin, no frame). Overlays sit as text directly on the photograph. The button variant anchored to the top-right corner uses the Outlined Action Button style but in white outline + white text against the dark photographic area. A "Sound on/off" toggle in the bottom-left uses 19px body type, no background, no border — just text.

### Body Paragraph
**Role:** Standard running text

19px NeueHaas-web weight 400, line-height 2.90 (extremely generous), color #000000, letter-spacing -0.03em. No first-line indent, no paragraph spacing beyond line-height. The 2.9 ratio on 19px produces ~55px line height — an editorial luxury-magazine measure.

### Inline Link
**Role:** Navigable text

Inherits body typography. No underline by default, no color change — the only signal is the 1px bottom border in #000000 applied directly to the text. Border sits tight to the baseline rather than the descender.

### List Item
**Role:** Navigation or content list

19px body type, 1px solid #000000 bottom border per item. Vertical padding 11px. No bullets, no markers — the border itself provides structure. Stacked items read as a typographic index.

### Form Input
**Role:** Text entry field

Transparent or #ffffff background, 1px solid #000000 bottom border only (no full border box), 19px body type, no placeholder color treatment beyond a lighter opacity. Padding 6px vertical. No focus ring, no box-shadow on focus — the existing border thickens or color inverts.

### Footer Block
**Role:** Closing content area

White background, no border. Body text and list items in 19px weight 400. 46px top margin separates footer from preceding content. 19px column gap between footer items. Structure: text columns rather than a framed panel.

## Do's and Don'ts

### Do
- Use only #000000 and #ffffff — no gray, no accent, no tint. Every element must commit to full black or full white.
- Set every text element to weight 400; derive hierarchy from size and line-height compression, never from boldness.
- Set letter-spacing to -0.03em on all text regardless of size.
- Compress line-height at display sizes (0.90–1.00 at 95px and above) to let lines overlap and form typographic compositions.
- Use 1px solid #000000 borders for all structural elements — dividers, button outlines, input underlines, list separators.
- Set border-radius to 0 on every component — buttons, inputs, images, cards. Sharp corners only.
- Bleed photographs and display text edge-to-edge. Never frame an image with a border, shadow, or margin.

### Don't
- Never introduce a chromatic color, gradient, or shadow — the system is strictly binary.
- Never use font-weight above 400; no bold, no medium, no semibold variants.
- Never round corners on any element — buttons, cards, inputs, and images stay perfectly square.
- Never use a color or background highlight to indicate hover or active states — change nothing, or thicken the existing border.
- Never stack display headlines with generous line-height; the overlap at 0.90 is the signature, not a bug.
- Never add padding or margin to display text; let the 160px type bleed to its container edges.
- Never add decorative elements — no icons beyond single glyphs, no illustrations, no patterns, no dividers beyond 1px rules.

## Elevation

The system uses zero elevation. No shadows, no glows, no z-axis depth. Dimensionality comes entirely from typographic overlap at display scale and from full-bleed photography replacing flat surface. Every element sits flush on the paper.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, the only surface in the system

## Imagery

Photography is the sole non-typographic visual element. Treatment is full-bleed, edge-to-edge, uncropped, no border-radius. Imagery carries dramatic, atmospheric content — long-exposure light trails, warm amber beams cutting through dark interiors — and acts as emotional punctuation between white typographic sections. No icons, no illustrations, no decorative graphics. Image-to-text ratio is low: one or two photographs per page, each large enough to dominate its section.

## Layout

Full-bleed, edge-to-edge composition with no max-width container. The hero is a centered overlapping typographic block with no supporting visual; subsequent sections alternate between full-bleed photography and white-text-only blocks. Content below photography uses a two-column layout (split roughly 1:1) with no gutter rule — separation is whitespace alone. Navigation is a single thin top bar with three text elements left/center/right. No sidebar, no grid of cards, no pricing table. The page reads as a vertical sequence of full-width sections separated by 100–120px of white space. No sticky elements, no floating UI.

## Similar Brands

- **Vitra** — Same editorial minimalism — near-zero UI chrome, photography as atmosphere, and typography-as-hero at extreme display scale.
- **Apple iPhone Pro (product page)** — Full-bleed dark photography punctuated by stark white type, no borders or shadows, single-weight display type.
- **Magazine Antidote (creative agency)** — Overlapping display headlines on white, binary black/white palette, and a magazine-spread approach to web layout.
- **Galerie Kreo** — Cultural/gallery presentation with zero decorative UI, weight 400 display type at enormous scale, and full-bleed imagery.
