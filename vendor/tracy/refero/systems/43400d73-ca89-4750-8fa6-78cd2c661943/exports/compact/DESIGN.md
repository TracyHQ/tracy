# Liron Moran Interiors — Style Reference
> fashion editorial on dark linen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Liron Moran Interiors operates as an editorial gallery portal: a near-colorless canvas of warm off-whites and charcoal olives, punctuated by oversized serifs that consume the viewport and physically intersect photography. The interface recedes — hairline borders, ghost controls, zero elevation — while the typography carries every ounce of visual weight, with letterforms at 185–260px acting as both heading and compositional frame. Sections alternate between light linen surfaces and deep charcoal bands, but the overall rhythm stays sparse and curatorial, with generous edge padding (130–173px) and vast vertical breathing room. Color is deliberately absent; every hue in the system is a desaturated neutral, so contrast and scale do all the expressive work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Linen | `#f2f0ed` | Primary page canvas, card surfaces, heading fills — the warm off-white that gives the site its gallery-walls aesthetic |
| Light Mist | `#eeeeee` | Hairline borders, divider lines, light text on dark sections, icon strokes — the most-used neutral, threading structure through every screen |
| Soft Stone | `#c1bfbc` | Muted background washes, secondary card surfaces, subdued borders |
| Warm Taupe | `#978f84` | Mid-tone neutral for secondary text and muted UI elements |
| Dark Olive | `#41443e` | Hero section backgrounds, dark band surfaces — the deep warm-charcoal that grounds the editorial typography |
| Near Black | `#050505` | Deepest dark for filled button backgrounds, high-contrast overlays |
| Pure Black | `#000000` | Icon strokes, strong borders, body text emphasis — the sharpest neutral in the system |

## Typography

### Lausanne-300 — Primary serif used at every scale from 12px captions to 185px display headlines. The lineHeight collapses to 0.80 at display sizes — letters physically overlap or nearly touch, creating the dense editorial texture. Used for nav links, body text, labels, and all heading levels. A refined didone-influenced serif; substitute with Playfair Display or DM Serif Display.
- **Substitute:** Playfair Display
- **Weights:** 400
- **Sizes:** 12px, 13px, 14px, 20px, 23px, 30px, 75px, 93px, 185px
- **Line height:** 0.80–1.00

### cardinalfruit-regular — Mega-display serif reserved for 260px hero-scale typography. The extreme size and custom letterforms make individual words into compositional objects. No substitute needed — this is a signature moment, not a workhorse.
- **Substitute:** Bodoni Moda
- **Weights:** 400
- **Sizes:** 260px
- **Line height:** 1.00

### Metropolis — Geometric sans for select body text passages where a neutral voice is needed. Medium weight provides just enough presence without competing with the serifs.
- **Substitute:** Inter
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.14
- **Letter spacing:** -0.0040em

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body | — | — | 14px | 1.14 | — |
| subheading | — | — | 20px | 1 | — |
| heading-sm | — | — | 23px | 1 | — |
| heading | — | — | 30px | 1 | — |
| heading-lg | — | — | 75px | 0.8 | — |
| display | — | — | 93px | 0.8 | — |
| display-xl | — | — | 185px | 0.8 | — |
| mega | — | — | 260px | 1 | — |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 89px
- **Card padding:** 38px
- **Element gap:** 35px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Logo Monogram + Wordmark
**Role:** Brand identity in nav

Stacked: 'LM' monogram in Lausanne-300 at ~30px, then 'LIRON MORAN' / 'INTERIORS' stacked beneath at ~12px, uppercase, letter-spacing normal, color #eeeeee on dark sections / #000000 on light. Left-aligned in top-left corner with ~39px padding from edges. No symbol or icon — pure typographic mark.

### Nav Text Link
**Role:** Navigation item

Plain text in Lausanne-300, ~12–13px, uppercase, color #eeeeee on dark hero / #000000 on light sections. No underline, no background, no hover state beyond opacity. Generous letter-spacing for editorial feel. 22px right margin between links.

### Hamburger Menu Button
**Role:** Primary nav toggle

Circular button, ~48px diameter, 1px border in #eeeeee (dark sections) or #000000 (light sections), no fill. Contains three horizontal lines as icon. No text label. Sits in top-right corner with ~39px edge padding.

### Scroll Indicator Label
**Role:** Page scroll cue

Small uppercase text 'SCROLL' in Lausanne-300, ~12px, #eeeeee on dark. Positioned mid-left edge. No icon, no animation described. Functions as a quiet page label.

### Page Counter
**Role:** Slide/page position indicator

Small text '1 - 3' in Lausanne-300, ~12px, #eeeeee on dark. Positioned mid-right edge. Minimal fraction format.

### Category Label
**Role:** Section category tag

Uppercase text in Lausanne-300, ~12–14px, #eeeeee on dark or #000000 on light. Positioned at bottom-left of sections. Examples like 'COMMERCIAL INTERIORS'. No background, no border — just typography.

### Text Link (View All Projects)
**Role:** Navigation link to collection

Uppercase text in Lausanne-300, ~12–14px, with thin underline. Color matches section context (#eeeeee on dark). Centered at bottom of hero. Hover: opacity shift.

### Split-Typography Hero Block
**Role:** Hero section with embedded imagery

Full-viewport dark band (#41443 background) with massive serif type ('IC INTERIORS' at ~185–260px in cardinalfruit or Lausanne) spanning beyond viewport edges. A rectangular photograph is inset, positioned to physically overlap and split the type — the image acts as a window through the letterforms. Zero padding inside the image; sharp 0px corners. Text is clipped by the image, not by CSS overflow — the composition is intentional.

### Project Image Frame
**Role:** Full-bleed project photograph

Rectangular image with 0px border-radius, no border, no shadow. Presented as raw photography. Used both as inset in hero typography and as standalone gallery frames. Images are tight crops on interior spaces — the object IS the frame.

### Section Divider
**Role:** Horizontal separator between sections

1px hairline line in #eeeeee or #f2f0ed depending on canvas. Full-width or contained. No other decoration.

### Footer
**Role:** Page footer

Minimal text-only footer. Lausanne-300, ~12px, uppercase. 36px padding-bottom, 39px padding sides. Links in body context, no buttons. Possibly contains audio/CC controls in bottom-right corner.

## Do's and Don'ts

### Do
- Use Lausanne-300 at every UI text size from 12px captions through 185px display — it is the only workhorse family
- Set lineHeight to 0.80 on any display text at 75px or larger; letters should nearly touch vertically
- Use 0px border-radius on every element — cards, buttons, images, tags — the editorial aesthetic demands sharp corners
- Separate surfaces with 1px hairlines in Light Mist (#eeeeee) or Warm Linen (#f2f0ed), never with shadows
- Pad section edges with 130–173px on the horizontal axis; the layout is full-bleed with generous breathing room from the viewport edge
- Position hero imagery to physically overlap and split display typography — the image is a window through the letterforms, not a companion element
- Keep the palette to seven neutrals maximum; any chromatic color breaks the monochrome editorial system

### Don't
- Never introduce chromatic color — no blue, red, green, or warm accents; the system is deliberately colorless
- Never apply border-radius greater than 0px; rounded corners would destroy the architectural/gallery character
- Never use drop shadows or blur effects; achieve depth through tonal contrast (dark bands on light canvases)
- Never set body or caption lineHeight below 1.0; only display sizes (75px+) collapse to 0.80
- Never center body text or paragraph copy; editorial layouts use left-alignment exclusively
- Never use more than one font family at a time per visual moment; cardinalfruit appears only at 260px scale, never as a secondary voice
- Never add background fills to text labels or category tags — type alone communicates the role

## Elevation

No drop shadows. The design achieves separation exclusively through value contrast — dark bands against light canvases, hairline 1px borders in Light Mist or Warm Linen, and generous whitespace. Elevation is implied by tonal shift, never by blur or offset.

## Surfaces

- **Warm Linen Canvas** (`#f2f0ed`) — Primary page background — the warm off-white base
- **Light Mist Layer** (`#eeeeee`) — Subtle card or section surfaces with hairline borders
- **Soft Stone Panel** (`#c1bfbc`) — Muted content panels and secondary surfaces
- **Dark Olive Band** (`#41443`) — Dark hero sections and feature bands
- **Near Black Floor** (`#050505`) — Deepest dark for overlays and filled elements

## Imagery

Interior photography is the sole visual content. Images are tight, architectural crops of furnished commercial spaces — living rooms, lounges, offices — shot in natural daylight with no lifestyle staging or human subjects. Color treatment is true-to-life but naturally desaturated: muted greens, warm woods, neutral textiles. The signature compositional move is positioning photography to physically intersect and split the massive serif typography, creating a window-through-letters effect. No illustrations, no icons beyond a hamburger menu, no decorative graphics. Photography is always rectangular with sharp 0px corners, never masked or rounded.

## Layout

Full-bleed layout with no max-width container. The viewport edge is the design edge. Hero section occupies the full viewport height as a dark charcoal band (#41443e) with centered-but-overflowing serif typography and an inset photograph. Horizontal edge padding ranges from 130px (nav) to 173px (section content), creating generous breathing room from the screen edge. Sections alternate between dark bands (charcoal/olive) and light canvases (warm linen/off-white). Navigation is minimal: logo top-left, single text link + hamburger top-right, both with ~39px edge offset. No sidebar, no sticky behavior described. Content arrangement is centered for hero typography, left-aligned for body text and labels. The page reads as a single-slide editorial spread rather than a scrolling feed.

## Similar Brands

- **Saint Laurent** — Same editorial-fashion language: massive serif typography, near-zero color palette, dark-on-light section alternation, hairline borders, and the attitude that restraint itself is luxury
- **Aesop** — Monochrome editorial system with generous whitespace, typographic identity carrying the brand, zero chromatic accents, and gallery-like presentation of content
- **Studio Vincent Van Duysen** — Architectural interior portfolio aesthetic: dark warm-charcoal sections, oversized serifs, photography that IS the design, and 0px radii throughout
- **Kinfolk Magazine** — Same curatorial restraint — warm off-white canvases, near-colorless palette, editorial serif typography at dramatic scale, and whitespace as primary compositional element
- **The Row** — Minimal luxury through typographic weight alone; no color, no decoration, no icons — just massive serifs and architectural photography on alternating light/dark sections
