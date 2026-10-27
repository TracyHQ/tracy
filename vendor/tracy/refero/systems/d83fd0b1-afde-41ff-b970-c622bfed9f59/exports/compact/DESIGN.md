# MANNA — Style Reference
> Architecture monograph at golden hour — warm bone pages, rust accent panels, and oversized grotesk display type floating over full-bleed photography.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

MANNA operates as an architecture monograph laid flat on the screen: expansive photography commands the canvas, typography arrives in two scales (whisper and shout), and the page alternates between warm bone and terracotta rust like rooms in a sunlit house. There is almost no UI chrome — no buttons, no cards, no rounded containers — instead images sit edge-to-edge framed by hairline black rules, and captions float in the gutter beneath. The palette is brutally disciplined: a single chromatic accent (rust orange) used only for full-bleed section panels, everything else is bone white, black ink, and photography. Type is editorial: a geometric grotesk at weight 300 or 500 for monumental display words, a humanist sans for image captions and quiet running text. The result feels less like a website and more like the opening spread of an architecture book.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone | `#f2edde` | Primary canvas, page background, footer surface — warm off-white that reads as paper, not screen |
| Rust | `#af6446` | Full-bleed section panels, footer band — terracotta accent that anchors the page in earthy materiality |
| Ink | `#000000` | All text, image borders, hairline rules — pure black for maximum contrast against bone |

## Typography

### Scto Grotesk A — Display and heading type. Weight 500 at ~60px for monumental section labels (MANNA, ABOUT) that anchor the bottom of the viewport; weight 300 for softer subheadings. The geometric grotesk proportions with high x-height give the display words architectural weight without becoming decorative.
- **Substitute:** Space Grotesk
- **Weights:** 300, 500
- **Sizes:** 14px, 60px
- **Line height:** 1.29
- **Letter spacing:** normal

### Merlo — Body text, image captions, running copy. The humanist warmth of Merlo softens the grotesk display type and reads as editorial annotation — the voice of the architect narrating over the work. 26px for intro paragraphs, 16px for captions and metadata.
- **Substitute:** Söhne or Inter
- **Weights:** 400
- **Sizes:** 16px, 26px
- **Line height:** 1.23–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.29 | — |
| body-sm | — | — | 16px | 1.5 | — |
| subheading | — | — | 26px | 1.23 | — |
| display | — | — | 60px | 1.29 | — |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 60px
- **Card padding:** 0px
- **Element gap:** 12-20px

### Border Radius

- **images:** 0px
- **buttons:** 0px
- **containers:** 0px

## Components

### Full-Bleed Photograph
**Role:** Primary content unit — every project image fills its column edge-to-edge

No border-radius. Surrounded by 1px solid #000000 hairline border. Caption sits below in 14px Merlo, separated by 10px margin-bottom. Images are uncropped, uncaptioned within the frame — the photograph IS the component.

### Image Caption
**Role:** Annotation beneath each project photograph

14px Merlo weight 400, #000000. Left-aligned to image edge. 10px margin-bottom from image. No italic, no bold — treated as quiet editorial footnote.

### Display Word Marker
**Role:** Anchors the bottom of a section like a section title in a book chapter

60px Scto Grotesk A weight 500, #000000, left-aligned at viewport edge. These are the largest type elements on the page (MANNA, ABOUT) and they function as wayfinding without navigation chrome.

### Rust Section Panel
**Role:** Full-bleed colored band that divides the page like a room transition

Background #af6446, no padding override, no border. Contains text and images at standard black-on-rust contrast (4.7:1, AA). Functions as accent — appears sparingly, never as CTA fill.

### Bone Section Panel
**Role:** Default page surface

Background #f2edde, no border, no radius. The neutral ground on which photography and type rest.

### Horizontal Image Row
**Role:** 3-column or 2-column image grid at section top

Images arranged side-by-side at full height of the row, equal columns, 0px gap. Each image has its own 1px black border and its own caption. Reads as a contact sheet.

### Footer Band
**Role:** Page footer with contact and credits

Background #f2edde or #af6446, 20px padding on all sides. Merlo 16px text. No dividers, no links styled as buttons — plain text links in #000000.

## Do's and Don'ts

### Do
- Use 0px border-radius on every image, container, and surface — this is an editorial system, not a product UI
- Frame every photograph with 1px solid #000000 hairline border
- Set display type at 60px Scto Grotesk A weight 500, anchored to the viewport edge (left or right) as wayfinding markers
- Use 14px Merlo for all image captions, separated by 10px from the image bottom
- Apply #af6446 rust only as full-bleed section backgrounds — never as button fills, badges, or icon tints
- Maintain comfortable density: 12-20px gaps between elements, 60px between major sections
- Let photography be the content — avoid decorative overlays, gradients, or cards wrapping images

### Don't
- Do not introduce rounded corners on any element — the 0px radius is non-negotiable for the editorial feel
- Do not use #af6446 as a CTA or button background — it is a section panel color, not an action color
- Do not add drop shadows, elevation, or z-depth — surfaces are flat planes
- Do not mix more than two type sizes within a single section — the system runs on whisper (14px) and shout (60px)
- Do not apply letter-spacing, text-transform, or font-feature decorations to display type — it speaks at default grotesk proportions
- Do not fill icons or UI elements with the rust color — it belongs only on full-bleed backgrounds
- Do not add navigation buttons, hamburger menus, or overlay UI — the page is the navigation

## Elevation

The system is deliberately flat — no drop shadows, no blur, no z-depth. Spatial separation is achieved through full-bleed color shifts (bone → rust), hairline 1px black borders around images, and generous whitespace. The only 'elevation' is the literal photographic subject rising from the flat plane.

## Surfaces

- **Bone Canvas** (`#f2edde`) — Default page background — warm paper-white ground for photography and text
- **Rust Panel** (`#af6446`) — Full-bleed accent section — provides chromatic punctuation and room-transition rhythm

## Imagery

Photography is the entire content system. Full-bleed architectural photographs dominate every section — tight crops of materials, trees, grasses, interior details, and building exteriors. Treatment is naturalistic and high-fidelity: no filters, no duotone, no color grading that departs from documentary realism. Images are framed by 1px black hairline borders and arranged in horizontal contact-sheet rows (2–3 columns at full viewport height). No illustration, no icons, no abstract graphics — the architecture itself provides all visual interest. Photography occupies 70-80% of viewport space; text floats in the remaining space as caption, heading, or section marker.

## Layout

Full-bleed page model with no max-width container. Sections flow vertically as alternating bone and rust bands. The hero pattern is a horizontal row of 2–3 full-height photographs side by side, each with a small caption beneath, followed by a large display word marker (60px grotesk) anchored to a viewport corner that labels the section. Navigation is minimal — likely a small text logo top-left. The layout reads as a vertical scroll through an architecture portfolio: image row → display word → image row → display word. No card grids, no pricing tables, no feature blocks — just photography and oversized type alternating with rust accent panels. Content density is spacious: each section breathes with 60px+ vertical gap.

## Similar Brands

- **Studio Mumbai** — Same architecture-monograph approach — photography-dominant pages, minimal UI, warm earthy palette, and editorial display type
- **Edition Office** — Full-bleed architectural photography, hairline-framed images, warm neutral canvas, and oversized grotesk section markers
- **Neri&Hu** — Editorial architecture portfolio with restrained palette, large-scale type as wayfinding, and photography as the primary interface
- **David Chipperfield Architects** — Monograph-style web presence with generous whitespace, flat surfaces, and text-as-architecture rather than UI elements
