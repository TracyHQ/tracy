# Aaron Poe & Co — Style Reference
> Quiet white gallery — coral pink whispers float in vast considered silence, framed only by pill-shaped nav and tightly-tracked type.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aaron Poe & Co operates as a curator's white room — a creative director's portfolio that strips interface to typography, whitespace, and a single accent. The canvas is pure white; the type stack pairs Geist (tightly tracked, negative letter-spacing) with system fonts for body copy; and a warm coral pink (#ea587d) surfaces only on heading text and hairline borders, never as a filled button. Components feel like gallery placards: a floating pill-shaped nav, centered bio blocks, and subtle 1px inset borders replacing the need for drop shadows. The rhythm is editorial — vast negative space punctuated by compressed, confident type and one whisper of color.

## Colors

| Name | Value | Role |
|------|-------|------|
| Coral Rose | `#ea587d` | Accent for heading text, hairline borders, and active-state markers — the single chromatic signal in an otherwise achromatic system |
| Pure White | `#ffffff` | Page canvas, card surfaces, and inverted backgrounds |
| Cloud | `#f2f2f2` | Pill nav background, subtle surface elevation, and inset border shadows |
| Bone | `#d9d8d4` | Warm-toned secondary surface tint for alternating bands |
| Char | `#282828` | Primary text, body copy, and most interface strokes |
| Ink | `#121212` | Heavier headings, body text, and prominent borders |
| Black | `#000000` | Maximum-emphasis text, logo wordmark, and strong border lines |
| Fog | `#b3b3b3` | Muted helper text and disabled-state strokes |
| Mist | `#cccccc` | Lowest-emphasis borders and decorative dividers |

## Typography

### -apple-system — System-font fallback for body text and rendering across platforms. Used wherever native OS fonts provide a reliable, performance-optimized default at body size.
- **Substitute:** BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.00
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### Geist — Primary display and UI typeface. The 300 weight at micro sizes (8–10px) creates whisper-quiet labels; the negative letter-spacing (-0.056em at 8px, -0.037em at 10px) tightens small type into dense, confident blocks. 400 at 16–18px serves body and subheadings with -0.025em to -0.011em tracking.
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 300, 400, 500
- **Sizes:** 8px, 10px, 16px, 18px
- **Line height:** 1.00, 1.17, 1.38, 2.67
- **Letter spacing:** -0.056em at 8px, -0.037em at 10px, -0.025em at 16px, -0.011em at 18px
- **OpenType features:** `"ss02", "lnum"`

### wtqc (custom display) — Reserved for prominent display headings (30px, 1.07 line-height, -0.033em tracking) and compact labels (12px, 1.33 line-height). The tight 1.07 line-height on the 30px size gives headings a condensed, editorial feel.
- **Substitute:** Geist, Inter
- **Weights:** 500
- **Sizes:** 12px, 30px
- **Line height:** 1.07, 1.33
- **Letter spacing:** -0.033em at both sizes
- **OpenType features:** `"lnum"`

### custom_166638 — custom_166638 — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 8px
- **Line height:** 1.5
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption-sm | — | — | 10px | 1.17 | -0.37px |
| body | — | — | 16px | 1.38 | -0.4px |
| subheading | — | — | 18px | 2.67 | -0.2px |
| heading | — | — | 30px | 1.07 | -0.99px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 720px
- **Section gap:** 120px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 4px
- **inputs:** 4px
- **buttons:** 4px
- **pillNav:** 24px

## Components

### Wordmark Logo
**Role:** Brand identity in the top-left corner

Bold text-only 'aaronpoe' mark in #000000 or #282828, set at approximately 18–20px with tight tracking. No icon, no symbol — the name IS the brand. Positioned flush-left with generous left margin.

### Pill Navigation Bar
**Role:** Primary site navigation

Floating horizontal pill centered at the top of the page. Background #f2f2f2, border-radius 24px (fully pill-shaped), padding approximately 8px 8px. Contains three nav items separated by subtle spacing. The pill sits on the white canvas with no shadow — the color difference and rounded form do all the work.

### Nav Item — Default
**Role:** Inactive navigation link

Text label in #282828 at 12–14px, weight 400, letter-spacing near zero. No background fill, no border. Padding approximately 8px 16px.

### Nav Item — Active (with dot indicator)
**Role:** Current page indicator in the pill nav

Identical text styling to default nav items, prefixed with a small coral pink dot (#ea587d) at approximately 6px diameter. The dot is the only active-state signal — no bold weight change, no background shift, no underline.

### Bio Text Block
**Role:** Centered hero content — the creator's statement

Centered paragraph block at max-width ~520–640px, set in system or Geist 16–18px weight 400 in #282828, line-height 1.38–1.5. Two paragraphs separated by one blank line. No background, no border, no decoration — pure typography floating in white space.

### Section Heading with Coral Border
**Role:** Content section titles and category labels

Text in coral pink (#ea587d), potentially with a coral hairline border-bottom (1px solid #ea587d). The pink heading is the primary chromatic event in the system — it draws the eye without filling space. Size 24–30px, weight 300–500.

### Ghost Button (Start a Project)
**Role:** Contact / conversion action in the nav

Text-only or hairline-bordered button in the pill nav. Text at 12–14px weight 400 in #282828. No background fill, no border in default state. On hover, optionally a #f2f2f2 background or 1px #282828 border.

### Hairline Card
**Role:** Content container for case studies, project tiles, or grouped content

White surface (#ffffff) with 1px solid border in #e5e5e5 or #cccccc, border-radius 4px, padding 24px. No drop shadow — the 1px border defines the edge. May optionally use the inset shadow technique (box-shadow: rgb(242,242,242) 0px 0px 0px 1px inset) for a hairline that matches the cloud surface color.

### Inset Border Divider
**Role:** Ultra-subtle section separation without visible lines

A 1px inset shadow using #f2f2f2 (rgb(242,242,242)) creates a barely-perceptible edge. Used when a physical border would be too heavy but some surface definition is needed.

### Project Tile
**Role:** Portfolio work entry — image or text-based

Larger card variant with border-radius 4px, 1px border, generous internal padding (32–48px). Likely contains a project title in Geist, optional thumbnail, and a coral-pink category label or hairline accent.

## Do's and Don'ts

### Do
- Use #ea587d only on heading text, hairline borders, and the active-nav dot — never as a filled button or background
- Set all headings in Geist or wtqc with negative letter-spacing (-0.033em to -0.056em depending on size) to achieve the compressed editorial feel
- Use 24px border-radius for the pill navigation and 4px for all cards and buttons
- Default to max-width 720px for centered text blocks; let whitespace do the layout work
- Separate cards and sections with 1px solid borders in #cccccc or #e5e5e5 — never with drop shadows
- Use #f2f2f2 as the surface tint for floating elements like the pill nav
- Set body text at 16–18px in #282828 with 1.38–1.5 line-height for comfortable reading

### Don't
- Do not add drop shadows to cards, buttons, or navigation — the system is intentionally flat
- Do not use #ea587d as a button background fill — the accent only appears on headings and borders
- Do not use large border-radii on cards — keep them at 4px; only the pill nav gets 24px
- Do not introduce new chromatic colors — the system is deliberately monochrome with one pink accent
- Do not use positive letter-spacing — all text tracks tight (negative values) to feel compressed and confident
- Do not fill the page with imagery or illustrations — let typography and whitespace carry the composition
- Do not use dark mode as the default theme — white canvas is the signature; dark (#121212) is reserved for inverted sections only

## Elevation

- **All surfaces:** `rgb(242, 242, 242) 0px 0px 0px 1px inset`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — the infinite white wall
- **Pill Surface** (`#f2f2f2`) — Navigation pill background and subtle card elevation
- **Warm Band** (`#d9d8d4`) — Occasional warm-toned section divider or band
- **Inverted** (`#121212`) — Dark-mode sections or inverted text blocks

## Imagery

No photography, illustration, or product imagery detected. The site is pure typography and whitespace — the creator's name, bio text, and navigation are the only visual content. Any portfolio work would be presented as text-based case study entries within hairline cards, not as image galleries. This text-only approach reinforces the editorial, gallery-curated personality.

## Layout

Page-level layout is centered and max-width contained (approximately 720px for text content). The top of the page features a split header: the wordmark logo flush-left, the pill navigation floating centered. Below the header, vast white space leads to a centered bio text block that sits in the upper-middle of the viewport. The rhythm is vertical and unhurried — sections separated by 100–120px of whitespace, with no visible dividers or alternating color bands. Navigation is minimal (a single pill nav, no sidebar, no mega-menu). The overall density is sparse — the page is approximately 80% white space, making the centered type feel like a gallery placard on a white wall.

## Similar Brands

- **Manual (cerealmag.com/manual)** — Same editorial white-space approach with centered text blocks, hairline borders, and almost no imagery — relies on typography and whitespace as the design
- **It's Nice That (itsnicethat.com)** — Gallery-curated white canvas with pill-shaped navigation, restrained color palette, and editorial typography with tight tracking
- **Pentagram (pentagram.com)** — Creative agency portfolio using pure white backgrounds, single accent color moments, and text-forward project tiles within hairline-bordered cards
- **Sam Soffes (soff.es)** — Minimal personal site with system font typography, pill-shaped nav, and one accent color used sparingly on headings and links
- **Are.na (are.na)** — Generous white space, 4px card radii, 1px hairline borders replacing shadows, and a single warm accent against an otherwise achromatic palette
