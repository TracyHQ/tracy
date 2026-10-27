# Maisonmargiela — Style Reference
> Gallery wall with a whisper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Maison Margiela operates on a radical editorial restraint: the interface is nearly invisible so that photography and product carry the entire experience. The palette is 100% achromatic — no chromatic accent exists anywhere in the system — using a near-black ink (#121212) against warm off-whites (#f7f7f2, #eaeae6) and pure white (#ffffff) to evoke gallery walls and atelier surfaces. Typography is custom and whispered, never shouted: Margiela Sans at low weights with extreme letter-spacing on small uppercase labels, and Margiela Serif with hairline negative tracking for the wordmark and editorial captions. Surfaces are flat, shadowless, and borderless; hierarchy is created by typographic scale and whitespace, not chrome. Components feel like printed matter — announcement strips, centered nav, full-bleed image plates, and tiny ghost text-links — not software.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#121212` | Primary text, nav links, button labels, footer copy — the near-black (not pure) gives the page a slightly warmer, printed feel rather than a screen feel |
| Paper | `#ffffff` | Page canvas, input fills, button text on dark — the clean base against which warm off-white sections layer |
| Atelier White | `#f7f7f2` | Light supporting surface for subtle backgrounds and section separation. |
| Linen | `#eaeae6` | Deeper warm neutral for tertiary sections, input borders, subtle dividers — sits one step below Atelier White in the surface stack |
| Stone | `#898989` | Supporting neutral for secondary UI, dividers, and muted labels. |
| Graphite | `#484847` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Pebble | `#bababa` | Input field borders, form field outlines, subtle structural dividers |
| Smoke | `#818181` | Disabled button text and inactive state labels |
| Charcoal | `#333333` | Long-form body text in editorial blocks where the slightly lighter tone than Ink reduces visual weight over long reads |
| Pure Black | `#000000` | SVG icon fills, logo lockup, strict black-tone elements where maximum contrast is required |

## Typography

### Margiela Sans — All UI text, navigation, buttons, labels, captions. The custom sans is the structural voice of the system. Weights 375-500 handle body and nav; 600-700 appear in micro-labels at the upper edge. The extreme letter-spacing (0.067-0.125em) applied to the smaller sizes is a signature choice — uppercase micro-text at 8-12px breathes like engraved metalwork rather than digital UI. The narrow weight range (no display-weight condensation) means type never yells; hierarchy comes from tracking and size, not boldness.
- **Substitute:** Inter or Neue Haas Grotesk with letter-spacing adjusted per size
- **Weights:** 375, 400, 475, 500, 600, 700
- **Sizes:** 8, 10, 11, 12, 13, 14, 15, 16
- **Line height:** 1.00, 1.20, 1.40, 1.50, 1.60
- **Letter spacing:** 0.0070em, 0.0100em, 0.0670em, 0.0770em, 0.0910em, 0.1250em

### Margiela Serif — The wordmark 'Maison Margiela Paris', editorial pull-quotes, product name captions, and serif body in select sections. Single weight (400) only, with hairline negative tracking (-0.004 to -0.002em) that makes the serif feel drawn rather than typeset. It appears sparingly — when it does, it signals a shift from UI to editorial register.
- **Substitute:** Cormorant Garamond or Adobe Caslon Pro at weight 400 with negative tracking
- **Weights:** 400
- **Sizes:** 14, 18, 20
- **Line height:** 1.30, 1.40
- **Letter spacing:** -0.0040em, -0.0020em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption-xs | — | — | 10px | 1.2 | 0.91px |
| eyebrow | — | — | 12px | 1.4 | 0.8px |
| serif-body | — | — | 14px | 1.4 | -0.06px |
| serif-heading-sm | — | — | 18px | 1.3 | -0.07px |
| serif-heading | — | — | 20px | 1.3 | -0.08px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 80-120px
- **Card padding:** 16-24px
- **Element gap:** 16px

### Border Radius

- **cards:** 0px
- **images:** 0px
- **inputs:** 9999px
- **buttons:** 0px

## Components

### Announcement Bar
**Role:** Site-wide top strip

Full-bleed horizontal band, Atelier White (#f7f7f2) background, Ink (#121212) text. Content is a single line of Margiela Sans 12px, weight 400, letter-spacing 0.8px, centered or left-aligned with a close (×) icon flush right. Height ≈ 40px. No border, no shadow.

### Primary Navigation
**Role:** Main site navigation

White background, no border, no shadow. Three-zone layout: left cluster (category links), center (wordmark logo), right cluster (utility links + icons). Links are Margiela Sans 12-13px, weight 400, letter-spacing 0.8-0.85px, uppercase, Ink color with no underline. Vertical padding 16-20px. The wordmark is Margiela Serif 14-18px centered.

### Ghost Text Link
**Role:** Inline and standalone text action

Ink (#121212) Margiela Sans 12px, weight 500-600, letter-spacing 0.8px, uppercase. No background, no border, no underline at rest. Underline appears on hover, 1px from baseline. Padding 0. This is the primary CTA pattern — there is no filled button anywhere in the system.

### Hero Image Plate
**Role:** Full-bleed editorial hero

Full-viewport-width image with no border, no radius, no overlay. Caption block (product name in Margiela Serif 18-20px + ghost CTA 'DESCUBRA MÁS' in uppercase sans) sits bottom-center or bottom-left, white text on the image, 32-48px above bottom edge. Aspect ratio follows image source, not a fixed ratio.

### Pill Input Field
**Role:** Form input, search field

Fully rounded (9999px radius), 1px border in Pebble (#bababa) or Linen (#eaeae6), background Paper (#ffffff) or transparent. Text in Margiela Sans 13-14px Ink, placeholder in Stone (#898989). Padding 12px 20px. Focus state: border darkens to Ink (#121212), no glow ring.

### Tab Pair Link
**Role:** Binary navigation between paired destinations

Two ghost text links side by side, separated by 24-32px gap, same uppercase Margiela Sans 12px style. Example: MUJER / HOMBRE. Active state: Ink color and optional 1px underline; inactive: Stone (#898989). No background fill, no pill, no border.

### Utility Icon Button
**Role:** Search, account, wishlist, cart in nav

Icon-only, 16-20px SVG in Ink (#121212) or Pure Black (#000000), no background, no border, no padding beyond the icon hit area. Label appears as uppercase Margiela Sans 12px text to the left of icon for nav text-links; icons are naked in the right cluster.

### Editorial Caption Block
**Role:** Image caption / product name label

Centered or left-aligned text overlay on imagery. Product name in Margiela Serif 18-20px weight 400, letter-spacing -0.08px, white. Followed by ghost text CTA in Margiela Sans 12px uppercase, white, 16px below. No background, no backdrop blur.

### Product Tile (implied)
**Role:** Product listing cell

Square or portrait image flush to grid, no card chrome. Product name and price in Margiela Sans 13-14px, Ink, 12-16px below image, left-aligned. No border, no radius, no shadow. Grid cells butt directly against neighbors or sit on Linen background with 16-20px gutters.

### Section Divider (implicit)
**Role:** Vertical rhythm between editorial sections

No visible divider line. Sections are separated by 80-120px vertical whitespace and/or a surface color shift from Paper to Atelier White. The page reads as a continuous scroll, not a series of boxed blocks.

### Footer
**Role:** Site footer

Atelier White (#f7f7f2) or Paper background, flush to viewport edges. Columns of Margiela Sans 12-13px uppercase links in Ink, 24-32px between columns, 16px between links within a column. Wordmark repeated at top in Margiela Serif. No background blocks, no social icon backgrounds, no newsletter card.

## Do's and Don'ts

### Do
- Use Margiela Sans for all UI, navigation, buttons, labels, and captions — the system has no second sans family
- Apply uppercase + letter-spacing 0.067-0.125em to all text at 12px and below to create the engraved-label feel
- Build hierarchy through size, tracking, and weight — never through color, borders, or shadows, which are absent from the system
- Let full-bleed photography carry the visual weight; the UI must remain a thin whisper around it
- Use only ghost text-links as actions — there is no filled or outlined button variant in this system
- Reach for Margiela Serif 14-20px only at moments that demand an editorial register: the wordmark, product name captions, pull-quotes
- Use the three-surface stack (#ffffff → #f7f7f2 → #eaeae6) to create depth instead of shadows or borders

### Don't
- Do not introduce any chromatic color — the palette is 100% achromatic; adding accent hues breaks the gallery-wall discipline
- Do not use border-radius on any component other than pill inputs (9999px); cards, images, buttons, and tiles must have 0px radius
- Do not apply box-shadow to any element; depth comes from surface color and whitespace alone
- Do not create a filled or outlined button variant — all actions are ghost text-links in Ink
- Do not set body text below 13px or above 16px without moving to the Serif family; the sans scale is tightly bounded
- Do not use bold (weight 700) for long-form text; reserve heavier weights for short uppercase labels where tracking does the work
- Do not use pure #000000 for body text or links — Ink #121212 is the text color throughout; pure black is reserved for SVG icon fills

## Elevation

Shadows are absent from this system. Depth and separation are achieved through surface color shifts (white → f7f7f2 → eaeae6) and the natural contrast of full-bleed photography. Components never float — they sit flush on the page like prints on paper.

## Surfaces

- **Canvas** (`#ffffff`) — Page base, announcement bar, full-bleed image plates behind white-text overlays
- **Atelier White** (`#f7f7f2`) — Warm off-white for secondary sections, product detail backgrounds, cart drawer, editorial blocks
- **Linen** (`#eaeae6`) — Tertiary surface for nested elements, input fills, subtle banded sections

## Imagery

Imagery is editorial fashion photography: full-bleed, no crops, no rounded corners, no frames. Subjects are products (a black patent Tabi pump on translucent vinyl) and models in conceptual styling (denim jacket against draped industrial sheeting) with desaturated, cool, slightly muted color grading. The photography carries slight coolness and grain that complements the warm off-white surfaces. Logos, badges, illustrations, and icons-only screens are absent — the system does not draw, it photographs. Image density is high in the hero, then gives way to near-text-only editorial sections.

## Layout

Full-bleed, edge-to-edge layout with no max-width container — photography and sections span the full viewport. The nav is a single horizontal row with a centered wordmark and flanking link clusters. Hero is a single full-viewport image plate with a small bottom caption block. Below the fold, sections alternate between full-bleed photography plates and narrow centered text blocks (Margiela Serif captions and ghost CTAs). No card grids, no multi-column product tables, no sidebar layouts — the page is a vertical scroll of image + caption + link, one section at a time. Vertical rhythm is generous (80-120px section gaps) to mimic a printed lookbook rather than a catalog.

## Similar Brands

- **The Row** — Same editorial restraint — near-invisible UI, achromatic palette, uppercase tracked nav, full-bleed photography as the primary visual element
- **Aesop** — Custom serif wordmark, warm off-white surfaces, no chromatic accent, ghost text-link actions, and a literary tone that treats the page as editorial
- **Bottega Veneta** — Full-bleed high-fashion imagery, centered wordmark, uppercase tracked nav, warm neutral canvas — the same 'the product is the only color' philosophy
- **Jil Sander** — Achromatic palette, generous whitespace, sans-serif micro-labels, and the same reductive design discipline that strips UI to its essential surfaces
