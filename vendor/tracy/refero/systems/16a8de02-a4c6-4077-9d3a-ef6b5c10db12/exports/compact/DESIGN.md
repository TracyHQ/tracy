# Intra — Style Reference
> white-walled gallery placard with one giant black eye

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Intra is a brutally editorial cafe identity: a white canvas dominated by an oversized black eye-mark and gigantic sans-serif wordmarks that read like gallery wall text. Color is almost entirely suppressed — only black, near-black, white, and a single hairline gray — so that the bright packaging of its coffee bags (magenta, lime, terracotta) detonates against the monochrome page like curated art objects. Type is the interface: 95px Whyte at weight 400 does the heavy lifting that buttons and color would do on a conventional site, and every section breathes through generous 100px vertical padding and wide 50px gutters. The aesthetic borrows from Swiss editorial print, brutalist signage, and museum labeling — content is presented as a series of facts, images, and objects rather than wrapped in a product UI.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page canvas, card surfaces, type knocked out of black panels |
| Ink Black | `#212529` | Primary text, bold panels, the dominant non-white surface — carries a barely-perceptible cool tint that softens it from pure #000 |
| Pure Black | `#000000` | Button strokes, logo fill, and the heaviest typographic moments where absolute zero contrast is required |
| Hairline Gray | `#e4e4e4` | Dividers, card borders, image outlines, table rules — the only mid-tone in the system |

## Typography

### Whyte — Single-weight type system. 95px display headlines for the wordmark and section titles carry the brand's editorial weight; 18–20px reads as body and meta; 16px as captions and link lists. The single weight (400) at all sizes is a signature choice — no bold, no light, the hierarchy is built through SIZE, not stroke. Substitute with Inter, Söhne, or Neue Haas Grotesk.
- **Substitute:** Inter or Söhne
- **Weights:** 400
- **Sizes:** 16px, 18px, 20px, 95px
- **Line height:** 1.00 for display, 1.50 for body

### -apple-system — System fallback for environments where Whyte is unavailable; inherits macOS/iOS native rhythm. Use only as the last-resort stack, not the primary voice.
- **Substitute:** system-ui
- **Weights:** 400
- **Sizes:** 16px, 20px
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading | — | — | 20px | 1.5 | — |
| display | — | — | 95px | 1 | — |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 100px
- **Card padding:** 40px
- **Element gap:** 20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Eye Logo Lockup
**Role:** Primary brand mark — the most identifiable asset on the site

A large black oval with a centered circular pupil, stacked above the wordmark "INTRA" set in 95px Whyte. Used at full-bleed scale on the home page as a hero panel. Always 0px radius, always pure black on white, no color variants.

### Display Wordmark Section
**Role:** Editorial section header — replaces what a colored banner or card would do on a conventional site

One or two words (CAFE, HOURS, BUY IN-STORE) at 95px Whyte weight 400, line-height 1.0, color #212529 on #ffffff. The word IS the section header. No subhead, no decorative element. Let the size carry the page.

### Body Text Block
**Role:** Long-form copy describing the venue, menu philosophy, hours

16–18px Whyte weight 400, line-height 1.50, color #212529, max-width reads around 50–60 characters. Paragraph spacing roughly 20px. No drop caps, no pull quotes — the type speaks plainly.

### Hairline Divider
**Role:** Section separation

1px line in #e4e4e4 spanning the full column width. No drop shadow, no color fill, no decorative element — just a flat rule between blocks.

### Product Card (Coffee Bag)
**Role:** Showcase tile for available single-origin beans

Rectangular card with 0px radius, 1px #e4e4e4 border, no shadow. Contains a flat-color product photograph (magenta, lime, terracotta) on a #ffffff background, with origin name ("Ethiopia", "Honduras", "Staple") set large in 20px Whyte above the image. The bag photo provides the only chromatic moment on the page.

### Outlined Action Button
**Role:** Navigation and call-to-action control

1px #000000 border, 0px radius, 6px horizontal × 1px vertical padding, color #000000, text 16–20px Whyte weight 400. The minimal vertical padding (1px) creates a very thin, type-like bar — this button reads as underlined text with a stroke, not a conventional pill. Used for "BUY IN-STORE" and similar nav-style actions.

### Editorial Photo Block
**Role:** Documentary imagery of the venue and team

Full-bleed or column-width photograph with 0px radius, framed by 78px horizontal margins to let it sit within a 3-column grid. Treatment is unmanipulated, high-resolution, slightly desaturated to harmonize with the monochrome page.

### Metadata Row
**Role:** Hours, locations, and structured information

16–20px Whyte weight 400, color #212529, arranged in a left-aligned two-column or stacked list with 15px vertical padding per row. No icons, no color coding, no badges — just plain labels and values.

### Link List (Footer/Info)
**Role:** Secondary navigation and contact links

16px Whyte weight 400, color #212529 with #000000 underline, 15px vertical padding between items. No hover color change documented — the link is defined by the underline, not by a color shift.

### Black Panel Block
**Role:** Inverse section — the only large dark surface on the site

Full-width #212529 (or #000000) background with white type (#ffffff) at the same 95px display scale. Used sparingly as a counterpoint to the white canvas, often for the logo or a single statement word.

## Do's and Don'ts

### Do
- Use 95px Whyte weight 400 as the only display size — never split into bold/regular variants, let the SIZE carry hierarchy.
- Hold the page to four colors total: #ffffff canvas, #212529 ink, #000000 for the heaviest moments, #e4e4e4 hairlines.
- Use 0px border-radius on every component — cards, buttons, images, tags. Sharp corners are the brand.
- Set section padding to 100px top and bottom, with 50px horizontal gutters — the breathing room IS the layout.
- Let product photography supply color: when a colored element is needed, use a real product image rather than introducing a new brand color.
- Use 1px outlined buttons with 6px horizontal / 1px vertical padding — the bar should feel like a typographic underline, not a conventional CTA.
- Keep the body line-height at 1.50 and the display line-height at 1.00 — never let the giant headlines feel airy.

### Don't
- Don't introduce a chromatic accent color for buttons, links, badges, or icons — there is no brand color in this system, the packaging supplies the only saturation.
- Don't use drop shadows, gradients, or blur effects — surfaces are flat, defined only by hairline borders.
- Don't use rounded corners anywhere, even on tags or avatars — everything is a sharp rectangle.
- Don't use bold (weight 600+) or light (weight 300) cuts of Whyte — weight 400 is the only voice, all hierarchy is typographic scale.
- Don't add icons, emojis, or decorative glyphs to the UI — the eye mark and the wordmark are the only marks.
- Don't split the giant wordmark into multiple lines or hyphenate it — "CAFE", "HOURS", "INTRA" each occupy one line at 95px.
- Don't apply a hover color change to links — the underline is the affordance, not a color shift.

## Elevation

Intra uses no shadow elevation at all. Depth is created by hairline 1px #e4e4e4 borders and by alternating white canvas with full-bleed #212529 panels. Components do not float — they sit on the page as printed elements.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas — the dominant background, covering most of the viewport
- **Ink Panel** (`#212529`) — Inverse sections, logo plate, and the rare dark band that punctuates the white page

## Imagery

Imagery is documentary and editorial: unmanipulated photographs of the two owners inside the venue, shot in available light with slightly desaturated tones that harmonize with the monochrome page. Product photography of the coffee bags is the chromatic event of the page — flat, high-contrast, full-bleed within a hairline-framed card, with vivid packaging colors (magenta #d92a8a-ish, lime #c5e63a-ish, terracotta) that become the only color on an otherwise achromatic site. No illustrations, no 3D renders, no abstract graphics. Icons are absent — the eye mark is the only iconography. Photography occupies roughly 30–40% of the page and is contained, never full-bleed, framed by 0px-radius edges and 78px gutters.

## Layout

Full-bleed multi-column grid that fills the viewport without a max-width container. The page is divided into roughly three vertical columns: a large left panel for the eye mark, a center column for display wordmarks and body text, and a right column for product cards and a secondary black panel. Section rhythm alternates white canvas with an occasional #212529 black panel rather than white/gray bands. The hero is a giant eye-mark on white with no headline or CTA — the mark itself is the hero. Section spacing is generous: 100px vertical padding between blocks creates a gallery-walk feel rather than a scrolling feed. Navigation is minimal — likely a top bar with simple text links rather than a sticky header. Cards are arranged in a vertical stack in the right rail, not a grid. The overall page model is editorial print more than SaaS dashboard.

## Similar Brands

- **Aesop** — Same restrained editorial typography at oversized scale, near-monochrome canvas, sharp 0px corners, and product photography as the sole source of color saturation
- **The Wing / Soho House site** — Similar gallery-walk layout with hairline dividers, document-style body copy, and type that reads as wall labels rather than web copy
- **Muji** — Shared brutalist restraint — flat surfaces, single weight sans-serif, 0px radii, and a refusal to decorate the UI with color or shadow
- **Kinfolk Magazine** — Same Swiss-print sensibility: oversized single-weight display type, generous 100px+ vertical breathing room, documentary photography, and near-achromatic palette
