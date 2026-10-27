# Locomotive — Style Reference
> Monochrome zine between blood-red slides. Black ink and white paper form the structural grammar; only photography is allowed to scream.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Locomotive operates a strict two-color monochrome system — black ink on white paper, nothing else. The visual language is editorial and gallery-like: massive display type at 110px sets a museum-catalogue tone, while a single weight 400 across all text avoids the visual noise of bold or light variants, letting scale alone carry hierarchy. Full-bleed dramatic photography supplies all color and atmosphere; the interface itself never does. Generous vertical breathing room (150px section padding) and hairline horizontal dividers create a Swiss-style zine rhythm. The result feels like flipping through a high-end art monograph where typography is the architecture and images are the exhibits.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Body text, headings, footer text, inverted section backgrounds, cards, borders, nav — the universal structural color |
| Paper | `#ffffff` | Page canvas, card surfaces on dark sections, text on inverted black backgrounds |

## Typography

### HelveticaNowDisplay — Workhorse for everything non-display: body copy at 15px, section sub-headings and card titles at 26px. The choice to stay at a single weight 400 — no bold, no light — forces hierarchy through size and space rather than stroke contrast. Substitute: Neue Haas Grotesk Display Pro or Inter at 400.
- **Substitute:** Neue Haas Grotesk Display Pro
- **Weights:** 400
- **Sizes:** 15px, 26px
- **Line height:** 1.0–1.3
- **Letter spacing:** normal

### LocomotiveNew — Signature display face for hero headlines and feature titles. At 110px it commands the viewport; the tight 1.0–1.1 line-height and zero tracking make the letterforms feel architectural and monolithic. Custom and ownable — no direct substitute, but Migra or Söhne Breit at 400 come close in feel. Do not substitute with a bold weight; the whisper-thin strokes at scale are the point.
- **Substitute:** Söhne Breit at 400 or Migra Display at 400
- **Weights:** 400
- **Sizes:** 70px, 110px
- **Line height:** 1.0–1.1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 15px | 1.3 | — |
| heading-sm | — | — | 26px | 1.2 | — |
| heading-lg | — | — | 70px | 1.1 | — |
| display | — | — | 110px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 150px
- **Card padding:** 20-40px
- **Element gap:** 20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Full-Bleed Hero Image
**Role:** First-viewport dramatic photography with overlaid display headline

100vw × 100vh image with no rounding, no border. Display headline (LocomotiveNew 110px, weight 400, white or black depending on image) overlaid bottom-left. Nav floats absolute over the image.

### Editorial Display Headline
**Role:** Hero and section title type

LocomotiveNew at 70–110px, weight 400, line-height 1.0–1.1, normal tracking. No bold, no italic. Sits in the lower-left quadrant over full-bleed imagery, or breaks the left margin of a white section.

### Ghost Navigation Link
**Role:** Top-bar nav items and 'Let's talk' CTA

HelveticaNowDisplay 15px, weight 400. No background, no border, no underline. Color: Ink on Paper canvas, Paper on Ink canvas. The 'Locomotive®' wordmark carries a registered trademark glyph as a typographic signature.

### Article List Row
**Role:** Editorial index of articles, culture entries, or store links

Full-width single-line row, HelveticaNowDisplay 15px, separated from neighbors by a 1px Ink hairline. Category label left-aligned, title fills the center-right, optional arrow icon right-aligned. 20px vertical padding per row.

### Centered Image with Floating Labels
**Role:** Portfolio feature block

A single product/portrait image centered on the canvas, approximately 40% page width, with no rounding. Short text labels (HelveticaNowDisplay 15–26px) float in the surrounding white space — top-left, top-right, bottom-left, bottom-right — connected to the image by proximity rather than lines. The composition is curatorial: the object is the exhibit, labels are wall text.

### Inverted Section Panel
**Role:** Full-bleed black block interrupting the white canvas

Background #000000, text #ffffff. Used for footer, closing CTAs, or featured project blocks. Maintains the same typography scale but inverts the color pair. No elevation, no rounded corners.

### Hairline Section Divider
**Role:** Vertical or horizontal separator

1px solid Ink rule, full-width. The only structural element besides typography. No gradients, no shadows.

### Workhorse Text Link
**Role:** Inline or standalone link within editorial copy

HelveticaNowDisplay 15px weight 400, Ink color. May be underlined or sit inline without decoration. Hover state: no color change — the only feedback is the registered ® mark on the wordmark.

## Do's and Don'ts

### Do
- Stay at weight 400 for all type — no bold, no light variants exist in this system; let size and space build hierarchy instead
- Use LocomotiveNew at 70–110px for display moments and HelveticaNowDisplay at 15–26px for everything else; never cross the 26px/70px gap without editorial intent
- Anchor content to a 4px grid with 150px+ section padding and 20px row padding; the system breathes because it is mostly white space
- Keep all corners square — 0px radius on cards, buttons, tags, and images; sharpness reinforces the editorial catalog tone
- Use full-bleed photography to supply all color and mood; the interface itself should never introduce a chromatic accent
- Separate list rows with 1px Ink hairlines and generous 20px vertical padding rather than backgrounds or chips
- Invert by swapping Ink and Paper only — do not introduce a gray, a tint, or a third tone

### Don't
- Do not introduce a brand color or accent — the 0% colorfulness is a deliberate, ownable constraint, not an oversight
- Do not add bold, semibold, or light weights to either font family; the single-weight 400 stance is the signature
- Do not round corners on images, cards, buttons, or any container; keep all geometry orthogonal
- Do not use shadows, blurs, or elevation layers to imply depth — rely on the Ink/Paper inversion for contrast
- Do not apply letter-spacing or text-transform; the display type sits at default tracking and sentence/upper case as written
- Do not place UI chrome (badges, chips, tags with fills) inside the white canvas — these break the gallery-wall metaphor
- Do not use gradients under any circumstances; if a section needs energy, swap to a full-bleed photograph

## Elevation

This system has zero elevation. Depth is communicated exclusively through the full-bleed / inverted contrast between Paper (#ffffff) and Ink (#000000). There are no shadows, no blurs, no z-axis layering — the visual hierarchy is flat and editorial, like a printed page.

## Surfaces

- **Paper** (`#ffffff`) — Primary page canvas — body, article lists, centered image compositions
- **Ink** (`#000000`) — Inverted section panels, footer, full-bleed hero overlays, project feature blocks

## Imagery

Photography is the sole source of color and atmosphere. Treatment is full-bleed, sharp-cornered, uncropped by UI elements. The hero uses a dramatic high-contrast portrait (red-lit face, near-black surroundings) at 100vw × 100vh. Secondary images (rings, product shots) sit centered on white at roughly 40% page width with floating editorial labels — museum-catalogue framing rather than e-commerce framing. No lifestyle or stock photography; imagery is always a focused subject on a controlled background.

## Layout

Full-bleed page model — content breaks the viewport edge rather than sitting inside a max-width container. The hero is a single 100vh image with absolutely-positioned nav and a bottom-left display headline. Below the hero, sections alternate between white Paper and black Ink inverted blocks, separated by hairline rules. The signature composition is a centered image (≈40% width) with short text labels floating in the surrounding white space at the corners — a curatorial, not commercial, arrangement. Navigation is a minimal top bar (logo left, center links, CTA right) that floats over the hero and becomes opaque as you scroll. Article and culture lists run full-width as single-line rows with hairline dividers — no cards, no grid cards. Vertical rhythm is built from 150px section padding and 20px row padding, giving the page the cadence of a print zine rather than a SaaS dashboard.

## Similar Brands

- **Ueno** — Same agency-portfolio restraint — monochrome palette, large editorial display type, full-bleed photography, zero decorative UI chrome
- **Resn** — Experimental creative agency sites that lean on custom display typefaces and full-bleed dramatic imagery rather than component-heavy interfaces
- **Manual** — Editorial-agency layouts with hairline dividers, centered compositions, and the same refusal to introduce a brand color
- **Pentagram** — Gallery-wall presentation: work presented as exhibits, type as architecture, white space as the dominant material
