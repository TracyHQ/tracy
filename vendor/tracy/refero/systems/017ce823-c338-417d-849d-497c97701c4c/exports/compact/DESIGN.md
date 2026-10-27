# Simone Sniekers — Style Reference
> A single editorial photograph breathes behind whisper-thin black captions — the image does all the work, the UI almost disappears.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Simone Sniekers is a photography portfolio stripped to its essence: the photograph is the interface. The site uses a single full-bleed editorial image as the entire canvas, with a barely-there UI layer of three text elements — a progress counter bottom-left, a name credit bottom-center, and an 'Info' trigger bottom-right. Typography is unified to one size and one weight across every UI element, treating all chrome as equal-weight caption text. The color palette is almost entirely photographic: warm amber, vermillion, and ochre washes bleed from the imagery itself, while the UI overlay sticks to black on whatever the photo presents. No cards, no borders, no shadows, no gradients in the traditional sense — the image provides all visual richness.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Dark borders and separators for elevated surfaces and inverted UI |
| Paper White | `#ffffff` | Inset text on dark photographic zones and button border accents |
| Warm Fog | `#bcbcbc` | Dominant canvas wash — the neutral mid-tone the warm gradient settles into at its lower band |
| Bone | `#cccbbb` | Cool-warm neutral surface, secondary canvas tone between photography passages |
| Slate Drift | `#c0c4ca` | Cooler neutral surface variant for section breaks and contrast |
| Rose Clay | `#cdbcb9` | Warm-tinted neutral surface — desaturated pink-beige for soft section transitions |
| Linen | `#cfbca6` | Warm cream neutral for lighter photographic sections |
| Graphite | `#4f4c4c` | Mid-neutral for subdued text and secondary borders |
| Espresso | `#2e2321` | Deep warm neutral for dark photographic zones and shadow anchors |
| Vermillion | `#e01365` | Photographic accent — vivid magenta-red pulled from editorial imagery, not a UI token |
| Saffron | `#d0a43e` | Photographic accent — warm gold from editorial imagery, bleeds into the canvas wash |
| Cinnabar | `#cc4132` | Photographic accent — vivid red-orange from editorial imagery |
| Ochre | `#a48b0b` | Photographic accent — deep saturated gold from editorial imagery |

## Typography

### Neue Haas Grotesk — The only typeface and the only size — applied to every UI element (progress counter, name credit, info button, nav). Using a single weight and size for all chrome treats every UI element as equal-weight editorial caption text, not as hierarchical interface
- **Substitute:** Helvetica Neue, Inter, Neue Haas Unica
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.00, 1.20
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1 | 0px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Card padding:** 0px
- **Element gap:** 12px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Full-Bleed Editorial Image
**Role:** The primary content surface — occupies the entire viewport as the page background

Single photographic image fills 100% viewport width and height. No padding, no border, no radius, no shadow. The image carries all visual weight; UI elements float over it. Color and warmth are provided entirely by the photograph.

### Progress Counter (bottom-left)
**Role:** Scroll/section position indicator

Left-aligned text at bottom edge, 16px Neue Haas Grotesk weight 400, #000000, positioned with 12-16px from viewport edge. No background, no border. Displays percentage like '0%'.

### Name Credit (bottom-center)
**Role:** Persistent photographer attribution

Center-aligned text at bottom edge, 16px Neue Haas Grotesk weight 400, #000000. No decoration. Functions as both watermark and navigation anchor to home.

### Info Trigger (bottom-right)
**Role:** Secondary navigation to metadata or contact

Right-aligned text at bottom edge, 16px Neue Haas Grotesk weight 400, #000000. Functions as a text-only link — no button chrome, no background, no border. Identical typographic treatment to the progress counter and name credit.

### Three-Element Bottom Bar
**Role:** Minimal persistent UI layer

Three text nodes anchored to bottom of viewport: progress (left), name (center), info (right). All 16px, weight 400, #000000. No container, no background, no divider lines. Spacing between elements is governed by viewport edges and flex distribution.

## Do's and Don'ts

### Do
- Use exactly one type size (16px) and one weight (400) for all UI chrome — do not introduce hierarchy through type
- Let the photograph provide all color, warmth, and visual richness — the UI layer stays black on whatever the image presents
- Anchor UI elements to viewport edges (top, bottom, corners) rather than centering them in content areas
- Use Neue Haas Grotesk or Helvetica Neue as the system typeface — no serif, no display, no decorative fonts
- Treat every interactive element as a text link — no buttons, no backgrounds, no borders, no fill states
- Let images bleed to the full viewport with zero padding, zero radius, zero border

### Don't
- Do not introduce a type scale — do not use multiple font sizes to create visual hierarchy
- Do not use card components, containers, boxes, or any surface that frames the image
- Do not add shadows, gradients, or background colors to UI elements
- Do not use chromatic colors for UI chrome — all color comes from the photography
- Do not add borders or dividers between UI elements or sections
- Do not use rounded corners on any element — the system is entirely sharp-edged
- Do not add navigation menus, hamburger icons, or visible chrome beyond the three text elements

## Elevation

The design intentionally has no elevation. The photograph IS the surface — it occupies the full viewport at z-index zero, and all UI text floats directly on it without containers, shadows, or backgrounds to create separation. This eliminates the distinction between foreground and background, making the photograph and the UI coexist in the same visual plane.

## Imagery

Full-bleed editorial fashion photography. Single hero image occupies the entire viewport. The model wears avant-garde sculptural clothing in vivid vermillion, saffron, and black against warm amber and ochre tones. Lighting is studio-controlled with rich directional warmth. The image bleeds to all edges with no padding or framing. The photograph is not cropped or masked — it IS the page. The warm gradient quality (red-orange at top transitioning to golden yellow at bottom) is baked into the photograph itself, not an overlay.

## Similar Brands

- **Mert Alas (mertalas.com)** — Same full-bleed editorial photograph with minimal black text overlay and no visible UI chrome
- **Tim Walker (timwalkerphotography.com)** — Same single-image-per-viewport approach with the photograph as the entire page and whisper-thin caption text
- **Annie Leibovitz (annieleibovitz.com)** — Same photographer-portfolio pattern where one image fills the screen and UI text is reduced to near-invisibility
- **Paolo Roversi (paoloroversi.com)** — Same approach of letting editorial fashion photography occupy the full viewport with no card frames, borders, or type hierarchy
