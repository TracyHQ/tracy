# Digit 5 — Style Reference
> Agility — robot workshop at dusk. Warm-white technical documentation emerges from a near-black machine bay, with soft industrial photography and restrained instrument-panel details.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Agility frames industrial robotics as a sequence of cinematic machine studies and precise technical diagrams. A warm-white canvas carries near-black typography, while the opening hero drops into a black, low-key robot film with oversized white type; color is deliberately almost absent so material, motion, and engineering forms hold attention. The custom Diatype family alternates tightly tracked display text with uppercase monospace labels, and rounded 12px panels organize explanatory content without shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm White | `#f0eeeb` | Page canvas, light-on-dark text, navigation text, pale action fills, and hero overlay copy |
| Off Black | `#292827` | Primary text, dark sections, footer surfaces, and dark photographic overlays |
| True Black | `#000000` | Deepest media treatment and black feature surfaces |
| Graphite | `#393837` | Large dark conversion panels and pill-shaped destination controls |
| Charcoal | `#30302f` | Alternate dark filled controls |
| Light Gray | `#d6d3ce` | Utility card surfaces and quiet diagram panels |
| Bright White | `#ffffff` | Raised media and content-card surfaces |
| Middle Gray | `#938f89` | Secondary copy, section numerals, and hairline strokes |
| Pale Steel | `#c2bfba` | Medium-contrast borders, control outlines, and structural separators. Do not promote it to the primary CTA color |

## Typography

### Agility Diatype — Primary interface and editorial family. Use 400-weight display faces at 62px/0.93 with -1.86px tracking and 36px/1.0 with -1.08px tracking; the compressed tracking and light weight make large statements feel engineered rather than promotional. Use 700 at 19px/1.2 for compact feature headings.
- **Substitute:** Inter
- **Weights:** 400, 700
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 19px, 28px, 36px, 62px, 120px
- **Line height:** 0.93, 1.00, 1.20, 1.25
- **Letter spacing:** -4.8px at 120px, -1.86px at 62px, -1.08px at 36px, -0.56px at 28px, -0.19px at 19px, -0.14px at 14px
- **OpenType features:** `"ss01", "ss07", "ss09", "ss10", "ss11"`

### Agility Diatype Mono — Technical label family for uppercase eyebrows, compact section identifiers, button labels, and small metadata. Its 700-weight 12px setting with 0.72px or 0.96px tracking turns ordinary labels into equipment markings.
- **Substitute:** IBM Plex Mono
- **Weights:** 400, 700
- **Sizes:** 12px, 13px, 24px
- **Line height:** 1.00
- **Letter spacing:** 0.36px at 12px for regular mono labels; 0.72px at 12px for standard uppercase labels; 0.96px at 12px for hero eyebrows
- **OpenType features:** `"ss01", "ss07", "ss09", "ss10", "ss11"`

### Helvetica Neue — Secondary fallback treatment for isolated badge or utility copy.
- **Substitute:** Arial
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.50
- **Letter spacing:** -0.195px at 15px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| hero-eyebrow | Agility Diatype Mono | 700 | 12px | 1 | 0.96px |
| technical-label | Agility Diatype Mono | 700 | 12px | 1 | 0.72px |
| nav | Agility Diatype | 400 | 14px | 1.25 | -0.14px |
| interface-text | Agility Diatype | 400 | 19px | 1.2 | -0.19px |
| feature-heading | Agility Diatype | 700 | 19px | 1.2 | -0.19px |
| card-heading | Agility Diatype | 400 | 28px | 1 | -0.56px |
| section-heading | Agility Diatype | 400 | 36px | 1 | -1.08px |
| hero-heading | Agility Diatype | 400 | 62px | 0.93 | -1.86px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 55px
- **Card padding:** 18px
- **Element gap:** 18px

### Border Radius

- **cards:** 12px
- **icons:** 2px
- **pills:** 24px
- **buttons:** 6px
- **navigation:** 12px

## Components

### Translucent Global Navigation
**Role:** Floating public-site navigation over dark hero media.

Use a rounded 12px bar with #e8e3d8b3 translucent tan fill, 57px backdrop blur, and #f0eeeb navigation text in Agility Diatype 14px/14px, weight 400, -0.14px tracking. Keep item gaps at 10px and use 6px rounded compact controls inside the bar.

### Hero Media Stage
**Role:** Opening full-bleed product-film container.

Set machine photography against #000000 or #292827 with a strong dark overlay; overlay #f0eeeb monospace eyebrow text at 12px/12px, weight 700, 0.96px tracking and a #f0eeeb display headline at 62px/57.66px, weight 400, -1.86px tracking. Keep controls minimal and place the pause indicator at the lower edge.

### Warm White Compact Button
**Role:** Light filled link control on dark media and dark surfaces.

Fill with #f0eeeb, set #292827 label text in Agility Diatype Mono 12px/12px weight 700 with 0.72px tracking, use 6px radius, and apply 13px vertical by 15px horizontal padding.

### Black Outline Button
**Role:** Dark media control with a light perimeter.

Use rgba(0, 0, 0, 0.8) fill, #f0eeeb text and a 1px #f0eeeb border; set 6px radius and 15px padding on every side.

### Graphite Pill Destination Panel
**Role:** Large paired conversion destination.

Use #393837 fill with #f0eeeb text, a 1px #f0eeeb border, 24px radius, and 18px padding on every side. Keep the entire panel clickable rather than nesting a second filled control.

### Utility Diagram Card
**Role:** Three-up explanatory capability card.

Use #d6d3ce background, 12px radius, no shadow, 18px bottom padding, and generous 88.3281px top space for the title and diagram. Pair a 28px/28px Agility Diatype 400 heading with compact dark body copy, then anchor thin #292827 outlined diagram blocks near the bottom.

### White Media Card
**Role:** Contained video, resource, or product-image panel.

Use #ffffff fill, 12px radius, no box shadow, and full-bleed imagery clipped to the rounded edge.

### Rounded Editorial Image
**Role:** Large contained industrial photograph between text sections.

Use a 12px radius with the image cropped edge-to-edge; favor washed, pale factory imagery on #f0eeeb sections and preserve the photograph's soft low-contrast treatment.

### Technical Section Eyebrow
**Role:** Section index and category marker.

Set uppercase Agility Diatype Mono at 12px/12px, weight 700, with 0.72px tracking in #292827 on light sections and #f0eeeb on dark sections. Use it above the content with an 18px gap.

### Text-First Introduction Block
**Role:** Offset editorial introduction beside a technical label.

Use a small mono eyebrow on the left and a large text column on the right; set the main copy in Agility Diatype 36px/36px, weight 400, -1.08px tracking, in #292827. Keep the surrounding #f0eeeb canvas uninterrupted by card borders.

### Dark Resource Footer
**Role:** Closing navigation and resource region.

Use a #292827 background with #f0eeeb headings and links, preserving the 12px uppercase mono label treatment for category markers. Avoid elevation; divide groups with spacing and thin #938f89 strokes.

## Do's and Don'ts

### Do
- Use #f0eeeb as the default page canvas and #292827 as the default text color.
- Set display headlines in Agility Diatype 400 with negative tracking: 62px uses -1.86px and 36px uses -1.08px.
- Set all technical eyebrows and compact action labels in Agility Diatype Mono 700 at 12px/12px with 0.72px tracking.
- Use 12px radius for cards, clipped media, and navigation containers; use 6px radius for compact buttons.
- Use #d6d3ce utility cards with no box shadow and 18px bottom padding.
- Use #393837 24px-radius panels only for large dark destination controls with #f0eeeb text.
- Keep standard component gaps at 18px and section gaps at 55px.

### Don't
- Do not introduce saturated UI colors; the interface palette remains neutral from #f0eeeb through #000000.
- Do not use a 9999px pill radius; only large destination panels use the 24px pill treatment.
- Do not add drop shadows to #ffffff or #d6d3ce cards.
- Do not set public navigation in generic system sans-serif; use Agility Diatype 14px/14px with -0.14px tracking.
- Do not use 600-700 weight for large display headlines; use Agility Diatype 400 at 62px or 36px.
- Do not place light-section copy on pure white by default; reserve #ffffff for contained cards and use #f0eeeb for the surrounding canvas.
- Do not use border radii larger than 12px for media cards, utility cards, or compact buttons.

## Elevation

Surfaces separate through warm neutral shifts, clipped 12px geometry, and photographic contrast rather than cast shadows. The navigation is the exception: translucency and heavy backdrop blur create depth without a visible shadow.

## Surfaces

- **Warm White Canvas** (`#f0eeeb`) — Primary page background and light dark-section typography.
- **Light Gray Utility Surface** (`#d6d3ce`) — Capability cards and quiet technical panels.
- **Bright White Raised Surface** (`#ffffff`) — Contained media and content cards.
- **Graphite Destination Surface** (`#393837`) — Large dark conversion panels.
- **Off Black Depth Surface** (`#292827`) — Hero overlays, dark sections, and footer.

## Imagery

Imagery is product-focused industrial photography and cinematic robot footage rather than lifestyle scenes. The hero uses an extreme, low-key machine crop with black negative space and narrow pools of green, amber, and white reflected light; the robot is treated as a monumental moving object. Interior imagery is contained in wide 12px-radius panels and shifts to pale, slightly misted factory or workwear crops. Graphics inside utility cards are monochrome, thin outlined diagrams with dotted placeholder blocks, functioning as explanatory system diagrams rather than decoration. The page is text-dominant outside these large image moments; icons are sparse, small, and mostly monochrome.

## Layout

The page begins with a full-bleed, near-black robot-film hero and a floating translucent navigation bar. Hero copy sits low and left over the footage, while a small playback control occupies the lower-right edge. The page then shifts to a warm-white editorial canvas: a narrow technical eyebrow aligns left while an oversized introduction block is offset to the right, followed by a wide rounded industrial photograph. Explanatory content uses a three-column row of equal #d6d3ce utility cards, then returns to large rounded media modules and dark conversion/footer bands. The structure is spacious and vertically paced, using uninterrupted canvas areas rather than frequent ruled dividers.

## Similar Brands

- **Nothing** — Uses oversized tightly tracked sans-serif typography, sparse monochrome surfaces, and industrial product photography.
- **Teenage Engineering** — Shares equipment-label typography, technical diagram language, and a physical-product-first visual composition.
- **Figure AI** — Pairs humanoid robotics imagery with dark cinematic hero treatment and restrained monochrome interface framing.
- **Figma** — Uses large light-weight display typography and roomy light editorial sections broken by contained visual modules.
