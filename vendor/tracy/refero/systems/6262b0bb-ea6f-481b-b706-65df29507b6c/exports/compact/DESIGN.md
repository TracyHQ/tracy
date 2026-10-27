# INK — Style Reference
> Editorial spread on warm paper. A single humanist voice, monochrome with a whisper of taupe, interrupted only by full-bleed photography and a slim band of warm orange.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

INK is an editorial gallery for a digital studio: warm-white paper, a single weight of a humanist sans, and photography that fills the viewport edge-to-edge. The palette is almost entirely grayscale with one warm taupe (#afa697) doing duty as a 'whispered' secondary voice, while a pair of vivid oranges surfaces only inside decorative bands and illustrations — never inside UI controls. Components are reduced to their quietest form: pill-shaped nav, hairline-thin labels, and image captions that float beneath full-bleed frames. The visual rhythm alternates between vast editorial type passages and cinematic image plates, separated by 160px of negative space.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Carbon | `#2e2a2b` | Primary text, logo mark, dark surface inversions, footer text on cream — a near-black with a barely-warm undertone that keeps the page from feeling clinical |
| Paper White | `#ffffff` | Page canvas and nav surface — the warm-white background that everything floats on |
| Whisper Taupe | `#afa697` | Supporting neutral for secondary UI, dividers, and muted labels. |
| Bone Cream | `#e6dcd4` | Alternate panel background and footer band — a warm cream that signals a quieter section without leaving the monochrome family |
| Lampblack | `#212121` | Deep surface for inversions and image overlays — slightly cooler than Ink Carbon, used where absolute darkness is needed without color cast |
| Signal Orange | `#fe5431` | Decorative illustration accent — appears inside graphic bands and artwork, never as a UI control fill |
| Amber Pulse | `#ff8000` | Decorative illustration accent — companion to Signal Orange inside warm gradient bands and visual punctuation |

## Typography

### Good Sans — Single voice across the entire interface — body, nav, buttons, headings, and display all share weight 400. The absence of bold is the signature: hierarchy comes from size and color, not weight.
- **Substitute:** Inter, Söhne, or GT America — any humanist sans with a relaxed x-height and open apertures will carry the same conversational tone
- **Weights:** 400
- **Sizes:** 18px, 22px, 27px, 60px
- **Line height:** 1.0–1.75 (size-dependent)
- **Letter spacing:** normal at all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 18px | 1.6 | — |
| body-lg | — | — | 22px | 1.31 | — |
| subheading | — | — | 27px | 1.25 | — |
| display | — | — | 60px | 1.09 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Section gap:** 160px
- **Element gap:** 16px

### Border Radius

- **nav:** 100px

## Components

### Pill Nav Indicator
**Role:** Primary navigation trigger

A solid dark dot (Ink Carbon #2e2a2b) positioned in the top-right corner, acting as the menu/menu-state indicator. 100px border-radius makes it a perfect circle. No background fill beyond the dot itself.

### Wordmark Logo
**Role:** Brand identity mark

The text 'INK' set in Good Sans 400 at ~22px, Ink Carbon #2e2a2b, top-left of the viewport with 64px left padding. No icon, no enclosure — the typography alone carries the brand.

### Hero Statement Block
**Role:** Opening page headline

Two stacked lines: a muted taupe lead-in ('Technology made Beautiful.') at 27px in Whisper Taupe #afa697, followed by the main statement at 60px in Ink Carbon #2e2a2b. Left-aligned with 64px left padding, generous line-height (1.09 on the 60px line). No border, no background — just type on paper.

### Full-Bleed Project Plate
**Role:** Portfolio showcase frame

Edge-to-edge image occupying 100% viewport width, 100% viewport height of its container. No border-radius, no frame, no caption inside the image area. Photography extends past all gutters.

### Project Caption Row
**Role:** Label and pagination beneath an image

Single row below each project plate, separated from the image by ~64px of white. Left: project name in Good Sans 400 at 18px, Ink Carbon #2e2a2b. Right: '1/7' counter in the same size. No dividers, no icons.

### Decorative Warm Band
**Role:** Section transition graphic

A full-bleed gradient strip using Signal Orange #fe5431 to Amber Pulse #ff8000, with soft cloud-like diffusion. Appears as a visual exhale between text sections. Lives outside the type system — never carries copy.

### Cream Footer Panel
**Role:** Closing section surface

Bone Cream #e6dcd4 background spanning full viewport width, with Ink Carbon #2e2a2b type. Functions as a quiet coda — the only departure from pure white inside the page.

## Do's and Don'ts

### Do
- Use Good Sans weight 400 at every size — never introduce bold or medium weights to create hierarchy
- Set section breaks to 160px of vertical whitespace; this is the system's most recognizable rhythm
- Let project images fill 100% viewport width with zero border-radius and zero frame
- Use Whisper Taupe #afa697 for secondary headlines and Ink Carbon #2e2a2b for primary statements in the same block
- Use 100px border-radius on the nav indicator dot — it must read as a perfect circle
- Keep left-edge text alignment with 64px padding from viewport edge on every section
- Use Bone Cream #e6dcd4 only for footer-level coda sections, never mid-page

### Don't
- Don't add drop-shadows to any element — depth comes from fill, not blur
- Don't use Signal Orange #fe5431 or Amber Pulse #ff8000 as button backgrounds or link colors — they are decoration only
- Don't introduce a max-width container on text blocks — the left-edge 64px padding is the only gutter
- Don't use a second typeface, even for captions — Good Sans 400 covers the entire voice
- Don't add borders, dividers, or rules between sections — let whitespace do the work
- Don't crop project images with rounded corners or contain them in cards
- Don't bold or italicize any text for emphasis — use the taupe-to-carbon color shift instead

## Elevation

The system has no shadows. Depth comes from scale and negative space, not drop-shadow. Where a dark element must rise above a light one, it does so by being filled with Lampblack or Ink Carbon — never by being raised with a blur.

## Surfaces

- **Paper Canvas** (`#ffffff`) — Default page background and nav surface
- **Bone Panel** (`#e6dcd4`) — Footer band and quiet alternation sections
- **Lampblack Overlay** (`#212121`) — Image overlays and inversion surfaces

## Imagery

Photography is full-bleed and cinematic: wide-angle product and architectural shots, often at golden hour, with deep horizon lines and minimal foreground clutter. The Joby Aviation frame centers a single subject against a silhouetted skyline, letting the object own the composition. No lifestyle context, no human subjects, no text overlays baked into the image. Imagery is text-dominant-page's counterweight: when the type is generous, the image is enormous, and vice versa. Illustration is reserved for warm gradient bands that act as visual breaths between sections.

## Layout

The page is full-bleed with no max-width container. The hero opens with a left-aligned text block at 64px inset from the viewport edge, followed by a warm gradient band, then a sequence of full-viewport-height project plates stacked vertically. Navigation is reduced to a wordmark top-left and a circular dot top-right — there is no horizontal nav bar, no sidebar. Section rhythm is dictated by 160px gaps between the last text block and the next image, and by the alternation of type-heavy and image-heavy blocks. Content density is low: one idea per screen, one image per idea.

## Similar Brands

- **Pentagram** — Same single-weight typography, full-bleed editorial imagery, and left-edge text alignment at the viewport gutter — both treat the page as a printed spread
- **Resn** — Shared playful-but-restrained digital studio voice with monochrome type and warm accent colors reserved for decorative moments
- **Manual** — Same generous negative space, humanist single-weight sans, and portfolio-first page structure with minimal navigation chrome
- **Locomotive** — Full-viewport project plates stacked vertically with caption rows beneath, and near-zero use of UI decoration between frames
