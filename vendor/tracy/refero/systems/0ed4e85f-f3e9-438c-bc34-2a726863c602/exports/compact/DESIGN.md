# Peggy — Style Reference
> monochrome art gallery on a winter morning — the only color comes from the work on the walls

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Peggy operates as a curated white-cube gallery translated to the web: an entirely monochrome interface that treats color as something the artwork supplies, not the chrome. The page is anchored by Reckless, a contemporary serif used at whisper weight (300) for display and regular weight (400) for mid-tier headings — this single typographic decision is what separates Peggy from the sea of geometric-sans art marketplaces. Inter handles all UI chrome at 12-16px, Monument Grotesk micro-caps label the footer's category architecture. Surfaces are flat and almost invisible: #f4f4f4 canvas, #ffffff cards, hairline #f4f4f4 borders, with one dark surface (#141414) reserved for the app-download notification strip and the primary CTA. There is no brand color, no gradient, no decorative elevation — the system earns its atmosphere through generous negative space, squareness (no rounded corners except pill-masked photography), and the trust that real art and real type are enough.

## Colors

| Name | Value | Role |
|------|-------|------|
| Gallery White | `#ffffff` | Card surfaces, input fields, button text on dark fills, nav surface over dark strips |
| Canvas Mist | `#f4f4f4` | Page background; also functions as the universal hairline border (borderColor 572 occurrences across every context) — the system draws structure with the canvas color itself |
| Ink Black | `#000000` | Primary text, logo, nav labels, body copy — the strongest type color, never used as a surface |
| Charcoal | `#141414` | High-contrast neutral action fill for primary buttons on light surfaces. |
| Fog | `#e2e8f0` | Muted accents, icon fills at rest, secondary surface tint, subtle dividers where Canvas Mist is too light |
| Graphite | `#666666` | Secondary/muted text — helper copy, metadata in transaction cards, footer body, link at rest |

## Typography

### Reckless — All display and heading copy. Weight 300 at the largest sizes (48-60px) is the signature move — most gallery/marketplace sites use 600-700 serif weights; the light cut reads as editorial restraint rather than shouting authority. Weight 400 takes over for 20-36px subheadings. Line-height collapses from 1.40 at 20px to 1.00 at 60px, letting large display text sit tight like a magazine cover.
- **Substitute:** Cormorant Garamond, Lora, or PT Serif for close editorial spirit; no system serif substitutes the specific warmth of Reckless
- **Weights:** 300, 400
- **Sizes:** 20px, 30px, 36px, 48px, 60px
- **Line height:** 1.00, 1.11, 1.20, 1.40

### Inter — All UI chrome: nav labels, button text, body paragraphs, helper copy, card metadata. Inter is deliberately invisible here — it serves Reckless by getting out of the way. Weight 500 appears in nav and active states; 400 is the body default. Line-height opens up to 1.50 at 16px for paragraph readability.
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.33, 1.43, 1.50

### Monument Grotesk — Footer column labels ('Product', 'Partners', 'Company', 'Support', 'Get the App') and the copyright line. Acts as a structural label typeface — small caps category architecture under a serif body. Strictly 12px, weight 400, used at 11 occurrences, signaling intentional scarcity.
- **Substitute:** Space Grotesk, Inter at weight 500 with letter-spacing 0.08em
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 30px | 1.2 | — |
| heading | — | — | 36px | 1.2 | — |
| heading-lg | — | — | 48px | 1.11 | — |
| display | — | — | 60px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 128px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 0px
- **images:** 9999px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Primary site chrome

White background, 1px bottom border in #f4f4f4, 16px vertical padding, 48px horizontal padding. Left: Peggy glyph logo (black mark). Right: 'Join Peggy' filled CTA. No other links visible in the header — navigation is intentionally minimal, consistent with the gallery-catalog feel.

### Download App Notification Strip
**Role:** Dismissible app-promo bar

Full-width #141414 background, white text. Left: close (×) icon + Peggy app-icon tile in white #f4f4f4 square. Center: 'Download the Peggy App' headline (Inter 14px weight 500, white) with sub-copy 'Install the app and sign in to get started.' (Inter 12px, #e2e8f0). Right: cloud-download icon. 48px vertical padding. This is the only dark band on the page outside the CTA button.

### Primary Filled CTA Button
**Role:** Main conversion action (e.g. 'Join Peggy')

#141414 background, #ffffff text, Inter 14px weight 500, 0px border-radius (sharp rectangle), 16px horizontal × ~12px vertical padding, single line, no icon. Sits as a deliberate weight-anchor against the white field — the only black rectangle in the interface.

### Ghost Text Link
**Role:** Secondary inline action (e.g. 'Learn more')

No background, no border, Inter 14px weight 500, #000000 text. Underline appears on hover. Used inside feature panels where a filled button would be too heavy.

### Split Hero Section
**Role:** Above-the-fold brand statement

Two-column layout on #f4f4f4 canvas, no top/bottom borders. Left column (roughly 50%): display headline in Reckless 60px weight 300, line-height 1.00, #000000 — multi-line, tight tracking. Below at 24px gap: sub-copy in Inter 16px weight 400, #000000, 2 lines max. Right column: full-bleed photograph masked to 9999px border-radius (pill shape), no caption. The pill-masked image is Peggy's signature visual element.

### Section Header (Editorial)
**Role:** Introduces an explanatory section

Reckless 36px weight 400, #000000, line-height 1.20. Sits left-aligned with generous left margin (48px). No eyebrow text, no decorative rule — the serif heading alone anchors the section.

### Royalty Transaction Card
**Role:** Data row showing a resale payout

#ffffff surface, 1px #f4f4f4 border, 0px radius, 16px padding. Internal grid: left column = small 24px square artwork thumbnail + title 'Royal Flush, 2021' (Inter 14px weight 500, #000000) with 'Sold on {date}, {year}' (Inter 12px, #666666) beneath. Right column: dollar amount (Inter 14px weight 500, #000000) with 'Royalties Paid' (Inter 12px, #666666) beneath. Cards stack vertically with 8px gap, no shadows.

### Trust Badge Cell
**Role:** Reassurance row item (6 across)

Centered icon (24px, #000000, solid filled style for lock/shield/shipping, line for museum/pricing/community) above label in Inter 14px weight 500, #000000. No background, no border, no padding — sits on the #f4f4f4 canvas as a bare typographic/icon unit. 6 cells in a single row, separated by 1px #f4f4f4 vertical dividers between adjacent cells.

### Gallery CTA Panel
**Role:** Conversion block for gallery partners

Two-column on #ffffff surface (one level above canvas). Left: 'Interested in joining as a gallery?' (Reckless 30px weight 400) over body copy in Inter 16px #000000, with a 'Learn more' ghost link below. Right: full-bleed gallery interior photograph, no border, no mask. 48px outer padding.

### Footer Column
**Role:** Site map link group

Five columns on #f4f4f4 canvas, top border 1px #f4f4f4 (effective divider by negative space). Column heading: Monument Grotesk 12px weight 400, #000000, uppercase tracking. Links below: Inter 14px weight 400, #666666, 8px row gap, 0px padding. No hover color shift documented — subtle and quiet.

### Footer Copyright Bar
**Role:** Legal/social strip

Below the link columns, 1px top border #f4f4f4, 24px vertical padding. Left: '© Peggy . {year}' in Monument Grotesk 12px #666666. Right: social icon cluster (Facebook, Instagram, X) in 20px solid #000000 squares with no radius.

### Hero Photograph (Pill-Masked)
**Role:** Artwork/contextual imagery

The only recurring shape in the system. 9999px border-radius creates a stadium/pill crop. Full-bleed within its container, no caption, no border, no shadow. The pill silhouette over the flat canvas is what makes the photography feel like a gallery object rather than a web image.

### Decorative Brushstroke Curve
**Role:** Background motif on the 'What are royalties?' section

A large organic #000000 line/curve that sweeps behind the transaction cards, partially extending past the section edges. Not an icon or illustration — a printed-mark motif. No other decorative graphics appear elsewhere on the site; this single gesture is the entire ornamental vocabulary.

## Do's and Don'ts

### Do
- Use Reckless at weight 300 for any display-size heading (48px and above); the light cut is the brand's typographic signature — using 600+ breaks the editorial tone
- Set the CTA background to #141414 with #ffffff text, 0px border-radius, Inter 14px weight 500; this is the only filled button style in the system
- Mask all artwork and lifestyle photography to 9999px border-radius — the pill silhouette is how Peggy signals 'this is art' without color or framing
- Use #f4f4f4 for both the page background AND 1px hairline borders; the canvas color doing double duty as the divider keeps the palette at six colors total
- Reserve Inter for everything below 20px; Reckless handles 20px and up; Monument Grotesk stays at 12px for footer category labels only
- Maintain the monochrome constraint — do not introduce chromatic brand colors, gradients, or colored status pills; trust the artwork to provide color
- Use 128px vertical breathing room between major sections; the page earns its gallery feel through space, not decoration

### Don't
- Do not add rounded corners (4px, 8px, 12px) to cards, buttons, or inputs — the system is deliberately sharp-edged, reserving curvature for pill-masked photography only
- Do not use colored badges, tags, or status pills (no green for success, no red for error) — the palette is grayscale only; communicate status through text or icon shape
- Do not use Reckless at weight 400 for display-size text; the serif loses its whisper quality and reads as ordinary at 60px
- Do not apply drop shadows, colored glows, or colored borders to elevate cards — elevation is expressed through surface color contrast (#f4f4f4 canvas vs #ffffff card), never through shadow
- Do not place CTAs anywhere except inside the top nav and as the primary action of a section; ghost links handle all secondary actions
- Do not use Monument Grotesk for body copy or headings — it is a 12px label-only typeface; using it elsewhere breaks the typographic hierarchy
- Do not introduce illustrations, icons with chromatic fills, or decorative gradients; the brushstroke curve is the only ornamental element and it should not be replicated

## Surfaces

- **Canvas** (`#f4f4f4`) — Page background and the default border color — one neutral does both jobs to keep the palette lean
- **Card** (`#ffffff`) — Elevated panels (royalty transaction cards, feature cells) sitting on the canvas
- **Inverted Strip** (`#141414`) — Full-bleed dark band for the download-app notification and the only filled CTA

## Imagery

Photography-first, zero illustration except for one decorative black brushstroke curve on the 'What are royalties?' section. Imagery is art-object photography (framed paintings, gallery interiors) and lifestyle context (a yellow chair beside a framed piece) — always high-key, well-lit, gallery-quality. Treatment is full-bleed within a pill mask (9999px radius) for hero and feature imagery, and rectangular for the gallery CTA panel. No duotone, no color grading — images are shown as-shot. Icons are solid black silhouettes (lock, shipping box, shield-check, museum, dollar, person) in a 6-cell trust row, and a single cloud-download icon in the notification strip. Image density is low: one photograph per section maximum, relying on typography and whitespace to carry the layout.

## Layout

Full-bleed sections on a #f4f4f4 canvas, each section ~128px vertical padding, no visible section borders (the canvas color itself separates them). Hero is a 50/50 split: serif headline left, pill-masked photograph right. The 'What are royalties?' section inverts the split: illustration+transaction cards left, serif body copy right. Trust badges form a single 6-column row separated by 1px hairlines. Gallery CTA is a 2-column card on white. Footer is a 5-column link grid with a single-row copyright/social strip below. Navigation is a minimal top bar (logo left, one CTA right) with a full-bleed dark download-app strip immediately beneath it. The layout rhythm is gallery-catalog: quiet, spacious, typographically driven, with photographs acting as punctuation rather than wallpaper.

## Similar Brands

- **Artsy** — Same serif-display-headline + monochrome palette approach, same gallery-marketplace positioning, same trust that art photography provides the color
- **1stDibs** — Same editorial serif at large sizes over a near-white canvas, same luxury restraint, same pill-or-sharp photographic crops
- **The Weave Shop / Saint Paul Editions** — Same weight-300 serif display, same near-zero chromatic palette, same reliance on pill-masked photography to signal 'art object'
- **SSENSE (editorial mode)** — Same generous 128px section rhythm, same all-grayscale discipline, same single-weight-anchor CTA against a white field
- **Arc'teryx (product pages)** — Same sharp-edged components, no rounded buttons, no shadows, one dark-on-light CTA, photograph does all the visual work
