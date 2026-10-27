# How Many Plants — Style Reference
> Golden botanical broadside on cream paper — a illustrated shelf system where the page title sits inside bands of potted plants and brass instruments.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

How Many Plants is a warm botanical editorial — a cream-paper broadside where a single golden-olive hue carries every illustration, banner, and accent. The hero is built from horizontal illustrated shelves in mustard that interlock with oversized display type, turning the page title into a shelf of plant pots, books, and vases. Surfaces are flat and paper-like; shadows are hard 6px offsets in the mustard itself, not soft drops, giving every decorated element the look of a cut-and-paste collage. The palette is ruthlessly small — cream canvas, black ink, one saturated gold, one dusty lavender, one dark teal — and that constraint IS the identity. Typography mixes a chunky geometric display face with a typewriter secondary, so headings feel poster-like while body copy stays intimate and typewritten.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#f9f5f1` | Page background, card surfaces, section bands — the warm off-white that reads as uncoated stock rather than digital white |
| Ink Black | `#222222` | Primary text, illustration outlines, large display letters, image borders — near-black that feels like a drafting pen rather than pure black |
| Golden Olive | `#bfb33b` | Signature illustration color, hero shelf bands, decorative borders, hard offset shadows, icon fills — the only saturated hue in the system and the brand's defining mark |
| Dusty Lavender | `#e8d1eb` | Tab backgrounds, tag pills, soft surface accents — desaturated lilac that cools the warm cream without competing with the gold |
| Deep Teal | `#025050` | Secondary text and accent on lavender surfaces, occasional icon detail — the only dark chromatic in the palette, used sparingly for contrast against light washes |

## Typography

### Chromatica — Primary display and body face — the chunky geometric letterforms spell out the brand in the hero and carry all body copy. The extremely tight 0.89 leading at 36px is what makes display letters stack into compact shelf-height bands rather than airy headlines.
- **Substitute:** Druk Wide, Recoleta, or GT Super
- **Weights:** 400, 500
- **Sizes:** 14, 16, 20, 24, 36px
- **Line height:** 0.89, 1.33, 1.43, 1.6, 2.0

### Hellenictypewriter — Secondary typewriter face for section headings, navigation labels, and editorial accents — its mechanical rhythm contrasts with Chromatica's geometry to create a handmade-meets-typeset feel
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Special Elite
- **Weights:** 400, 500
- **Sizes:** 16, 20, 28, 36px
- **Line height:** 1.14, 1.25, 1.33, 1.6

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.6 | — |
| body | — | — | 16px | 1.6 | — |
| subheading | — | — | 20px | 1.43 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 28px | 1.25 | — |
| heading-lg | — | — | 36px | 1.14 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 48px
- **Element gap:** 16px

### Border Radius

- **tabs:** 0px
- **tags:** 0px
- **images:** 0px
- **buttons:** 0px
- **shelves:** 0px

## Components

### Illustrated Hero Shelf
**Role:** Full-width horizontal band that spells out brand letters inside botanical still-life illustrations

Golden Olive (#bfb33b) rectangle spanning full page width, 100-150px tall, filled with flat plant/vase/book illustrations in black line art. Oversized Ink Black display letters (Chromatica 36px, 0.89 leading) overlap the band. Hard 6px 6px 0px Golden Olive offset shadow below. 0px radius. Stacks vertically to form the full brand wordmark.

### Top Announcement Banner
**Role:** Slim marquee strip above the navigation

Cream (#f9f5f1) background, centered Hellenictypewriter 14-16px italic text in Ink Black, flanked by small leaf icons. No border, no padding beyond 8px vertical. The text itself is a handwritten-style announcement.

### Primary Navigation Bar
**Role:** Top-level site navigation with centered logo

Cream canvas, 64px vertical padding. Logo 'HOW MANY PLANTS' centered in Hellenictypewriter 16-20px weight 500. Left-aligned nav links (Guides, Care, About) in Chromatica 16px, with wavy Dusty Lavender (#e8d1eb) underlines on hover/active. Right-aligned utility buttons.

### Nav Utility Button (Ghost)
**Role:** Right-side navigation actions like Plant Club and Search

No background fill. 1px Ink Black (#222222) border, 0px radius, 12px vertical and 48px horizontal padding. Chromatica 16px uppercase text. The Plant Club variant adds a heart icon; Search adds a magnifier icon.

### Wavy Underline Link
**Role:** Inline navigation and body links

Chromatica or Hellenictypewriter text in Ink Black with a Dusty Lavender (#e8d1eb) wavy SVG underline beneath. The wavy line — not straight — is the signature link treatment and replaces standard text-decoration: underline.

### Vertical Side Tab
**Role:** Rotated category labels floating along the left edge of the hero

Lavender (#e8d1eb) background, Ink Black Chromatica 14px uppercase text, 0px radius, ~44px wide, rotated 90° counter-clockwise. Acts as a decorative category index, not an active navigation pattern.

### Category Label Card
**Role:** Small stacked text blocks embedded in the illustration (e.g. 'PLANT CARE 101', 'HOUSEPLANTS A-Z')

No background. Stacked lines of Chromatica 16px Ink Black text, left-aligned, with a thin 1px Ink Black top border on the first line. Appears as a printed index inside the illustrated shelves.

### Editorial Content Section
**Role:** Text-led content blocks below the hero (e.g. 'Get to know your plants')

Cream canvas, max-width ~1200px centered. Two-column layout: illustration on left, heading + body on right. Heading uses Hellenictypewriter 28-36px weight 500, body uses Chromatica 16-20px. 64px section padding, 32px gap between heading and body.

### Illustrated Plant with Speech Bubble
**Role:** Botanical illustration paired with a handwritten caption

Flat Chromatica-style plant illustration in green and black line art on cream. Adjacent hand-drawn arrow points to a speech-bubble-shaped text annotation in Chromatica 14-16px italic. No borders, no background — the illustration IS the visual.

### Footer Category Link List
**Role:** Stacked text links in the footer (e.g. 'BEST LAID PLANTS', 'MY PLANT BABIES')

Chromatica 16px Ink Black, left-aligned, stacked vertically with 12px row gap. Each link has a wavy Dusty Lavender underline. Functions as a printed table-of-contents style index.

## Do's and Don'ts

### Do
- Use Golden Olive (#bfb33b) as the sole saturated brand color — never introduce a second vivid hue into illustrations, borders, or shadows
- Apply the hard 6px 6px 0px Golden Olive offset shadow to every mustard-bordered element; do not substitute a blurred drop shadow
- Set display type at 36px with 0.89 line-height in Chromatica so letters stack into compact shelf-height bands, not airy headlines
- Underline links with a Dusty Lavender (#e8d1eb) wavy SVG stroke, never with text-decoration: underline
- Keep all radii at 0px — the system is sharp-edged paper, not rounded digital surfaces
- Maintain 64px section padding and 32px inter-section gaps to preserve the spacious editorial rhythm
- Pair Chromatica (geometric display) with Hellenictypewriter (mechanical secondary) for heading-to-body contrast

### Don't
- Do not add soft drop shadows, blur effects, or gradient overlays to any element
- Do not use rounded corners on cards, buttons, tabs, or images — 0px radius is non-negotiable
- Do not introduce a second saturated chromatic color; the palette is cream, black, gold, lavender, teal — nothing more
- Do not set display type with generous line-height (1.2+); the 0.89 leading is what makes letters interlock with the illustration
- Do not use straight underlines on links — always the wavy lavender treatment
- Do not fill the canvas with pure white (#ffffff); the warm cream (#f9f5f1) is the background and must be visible
- Do not place illustrations on white or neutral gray panels — illustrations always sit directly on the cream canvas

## Elevation

- **Golden shelf bands and mustard-bordered cards:** `rgb(191, 179, 59) 6px 6px 0px 0px`

## Surfaces

- **Cream Canvas** (`#f9f5f1`) — Full-page background, the base paper stock
- **Lavender Wash** (`#e8d1eb`) — Tab and tag backgrounds that sit on the cream canvas
- **Golden Shelf** (`#bfb33b`) — Illustrated hero bands and decorative banners — the only mid-saturation surface in the system

## Imagery

Illustration is the dominant visual language — flat, 2D, hand-drawn botanical still lifes composed of potted plants, vases, books, frames, brass instruments, and household objects. All illustrations use a two-color treatment: Golden Olive (#bfb33b) fills with Ink Black (#222222) line work, or pure black line art on cream. No photography, no gradients, no 3D, no shadows within illustrations. Icons are line-art matching the illustration style. Illustrations always sit directly on the cream canvas with no containers or frames — the object IS the frame. The hero illustration integrates oversized display type as compositional elements, with letters overlapping and interlocking with the illustrated objects rather than sitting in separate text blocks.

## Layout

Full-bleed hero composed of stacked horizontal illustrated shelf bands (4-5 bands, each 100-150px tall) that span edge to edge and contain the full brand wordmark. Below the hero, content shifts to a centered max-width ~1200px layout with two-column text+illustration sections at 64px vertical padding. Vertical side tabs float along the left edge of the hero as decorative category indices. Navigation is a single top bar with centered logo and ghost-outline utility buttons. No sidebar, no grid of feature cards — the site reads as a vertical scroll through editorial spreads rather than a product dashboard. Generous whitespace between sections (64px) creates a slow, magazine-like rhythm.

## Similar Brands

- **The New Yorker** — Same editorial-broadside energy where illustration and display typography are the primary content, not decoration
- **Beverly (editorial plant brand)** — Shared botanical illustration language with two-color flat fills and hand-drawn still lifes
- **Aesop (brand site)** — Restrained two-or-three-color palette, generous whitespace, and editorial typography that treats the page like printed matter
- **Pithitude** — Custom display typefaces with extremely tight leading used as compositional elements rather than just headings
