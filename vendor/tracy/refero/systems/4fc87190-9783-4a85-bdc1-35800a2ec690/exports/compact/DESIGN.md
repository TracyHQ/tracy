# WOUQ — Style Reference
> Monochrome gallery wall, museum label typography

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

WOUQ operates as a monochrome editorial portfolio: a near-total absence of color, with black text and hairline rules carrying all functional weight on a white canvas. The page is image-forward — large photography and 3D-rendered artwork dominate, treated as gallery objects with a single shared 10px corner radius and minimal chrome. Typography is the only expressive instrument: a custom neo-grotesque face (ESAllianz) is deployed at near-display sizes (45px) for the tagline and category labels, with a tight 1.11 line-height that lets the text stack into editorial blocks rather than breathing room. The interface deliberately removes every non-essential signal — no buttons, no badges, no gradients, no shadows, no accent color — so that the work itself carries the visual identity. Navigation is a plain text row, and project tiles are flat rectangles with two stacked text lines overlaid in a corner, mimicking museum wall labels rather than card UI patterns.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon Black | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Gallery White | `#ffffff` | Page canvas, card surfaces, and heading backgrounds — the dominant surface across all sections |
| Plaster Gray | `#efefef` | Subtle surface variation against white — used at near-imperceptible contrast for stacked layers |

## Typography

### ESAllianz — Primary brand typeface for navigation links, body copy, and display headlines. The custom face is a neo-grotesque with restrained geometry — its near-monolinear strokes and generous counters give the editorial feel. At 45px it functions as display; at 27px as section headings; at 18px as body and nav. Two weights (Light, Regular) both used at 400 — the visual difference is in the eye, not the number.
- **Substitute:** Inter, Neue Haas Grotesk, Manrope
- **Weights:** 400
- **Sizes:** 18px, 27px, 45px
- **Line height:** 1.11–1.50
- **Letter spacing:** normal

### Open Sans — Secondary face for general body text and link rendering — serves as a web-safe fallback and the default for text blocks where the custom face is unavailable
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 400
- **Sizes:** 18px, 22px
- **Line height:** 1.00–1.67

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 18px | 1.67 | — |
| subheading | — | — | 22px | 1.67 | — |
| heading | — | — | 27px | 1.5 | — |
| display | — | — | 45px | 1.11 | — |

## Spacing & Layout

**Base unit:** 6px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 25px
- **Element gap:** 30px

### Border Radius

- **cards:** 10px
- **images:** 10px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Persistent site header with brand mark and section links

Minimal horizontal bar with #000000 WOUQ wordmark left-aligned and three text links (Work, About, Dreams) right-aligned. 18px ESAllianz at weight 400, normal letter-spacing. No background fill, no border, no shadow. Links use #000000 with no underline; hover state inherits text-decoration: underline. Sits directly on the #ffffff canvas with no padding separation.

### Tagline Headline Block
**Role:** Opening editorial statement that replaces a traditional hero

Large 45px ESAllianz display text in #000000, line-height 1.11, left-aligned, set directly under the nav with 25px top padding. Functions as the primary value proposition — a full declarative sentence, not a marketing slogan. No background, no CTA button, no supporting visual.

### Project Thumbnail Card
**Role:** Gallery tile for a portfolio piece

Image-first card on #ffffff background, 10px border-radius, no border, no shadow. An image fills the card edge-to-edge. Two lines of overlaid text sit in the top-left or bottom-left corner: a 18px category label in #000000 and a 27px project name in #000000 weight 400. No hover state lifts the card — the tile is a static gallery object.

### Wide Hero Banner Card
**Role:** Full-width featured project image

Spans the full content width (approximately 1200px), 10px border-radius. The same overlay-label pattern applies (category + project name) in the top-left corner. Functions as a visual lead-in to the grid below.

### Two-Column Grid Pair
**Role:** Side-by-side project tiles of equal width

Two project thumbnail cards placed adjacent with 5–10px gap between them. Both share the 10px radius and overlaid label treatment. Heights are equal, creating a magazine-spread rhythm.

### Full-Width Editorial Image
**Role:** Atmospheric photography strip

Bleeds edge-to-edge across the content area (1200px max), 10px border-radius on corners, no overlay text. Acts as a visual breath between grid sections — a single uncaptioned image, like a magazine double-page spread.

## Do's and Don'ts

### Do
- Use #000000 for all text, borders, and outlined interactive elements on #ffffff or #efefef surfaces
- Set headlines at 45px ESAllianz with line-height 1.11 for editorial display impact
- Apply 10px border-radius to all image-containing cards and thumbnails
- Keep card padding at 25px top/right/left and 10px bottom for overlay labels
- Overlay category labels (18px) and project names (27px) in the top-left corner of project tiles, stacked vertically
- Use a max content width of 1200px, centered, with generous 48px section gaps
- Keep the palette strictly to #000000, #ffffff, and #efefef — no accent colors, no gradients

### Don't
- Do not introduce any color beyond #000000, #ffffff, and #efefef — no brand accent, no semantic colors
- Do not add drop shadows, glows, or any elevation to cards — surfaces are flat by design
- Do not add visible CTA buttons with fills or large rounded radii — the interface is buttonless
- Do not use font weights other than 400 (ESAllianz Light and Regular are both 400, distinguished by face not number)
- Do not apply letter-spacing modifications — all text uses normal tracking
- Do not add hover lifts, transforms, or scale animations to cards — tiles are static gallery objects
- Do not use fully justified or centered text in body blocks — left-align all paragraphs and headlines

## Elevation

The design eliminates elevation entirely. No drop shadows, no border-based depth, no z-axis differentiation between cards and canvas. Surfaces are defined by content boundaries (images, text) rather than depth cues. The 10px border-radius provides the only geometric softening; the #efefef surface is used so sparingly it barely registers as a separate layer. This flatness is intentional — it forces the imagery and typography to carry all visual weight, preventing the interface from competing with the portfolio work.

## Surfaces

- **Canvas** (`#ffffff`) — Page background
- **Recessed** (`#efefef`) — Near-white surface tint for secondary layers
- **Card** (`#ffffff`) — Project thumbnail backgrounds, same as canvas — cards are defined by their image content, not a fill

## Imagery

Image-forward, photographic and 3D-rendered. Two distinct treatment modes appear: (1) abstract 3D renders with warm metallic surfaces — copper, chrome, polished black — used as hero and feature tiles, treated as full-bleed gallery objects with no cropping; (2) editorial still-life photography (interior objects, instruments, stationery, plants) used in the grid tiles, also uncropped and edge-to-edge. All images are contained within 10px-radius rectangles. There is no lifestyle photography, no people, no candid shots. The visual density is high: imagery occupies roughly 70% of the page area, with text acting as a thin labeling layer rather than competing for attention. No icons, no illustrations, no decorative graphics — the work itself is the only visual content.

## Layout

Max-width 1200px centered on a #ffffff canvas. The page opens with a minimal nav bar, followed by a large left-aligned editorial tagline (45px display) that acts as the hero — no supporting visual, no CTA. Below the tagline, a full-width hero image card introduces the work. The main body is a masonry-style grid of project tiles: one full-width banner, then paired two-column rows, then another full-bleed image strip, repeating. Each tile follows the same overlay-label pattern (category + project name in top-left corner). No sidebar, no footer chrome, no alternating background bands — the entire page reads as a continuous white gallery wall. Navigation is a single flat text row at the top with no sticky behavior implied.

## Similar Brands

- **Locomotive** — Same monochrome editorial approach with large neo-grotesque type and image-driven project grids
- **Resn** — Gallery-style portfolio layout with full-bleed imagery, flat surfaces, and minimal UI chrome
- **Pentagram** — Museum-label typography overlaid on project thumbnails, zero accent color, text as the only structural element
- **Manual** — Spacious image grid with hairline-thin UI and neo-grotesque custom typeface at display sizes
