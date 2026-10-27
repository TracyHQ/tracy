# Trawelt — Style Reference
> Boarding pass on black marble

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Trawelt is a high-contrast, editorial luxury system that alternates between dramatic black canvases and warm cream surfaces, stitched together by a single saturated forest-green accent. The typography pairing is deliberate tension: a sharp neo-grotesk (Labour Grotesk) carries all functional text at one voice — weight 400, tight tracking, no italics — while an ultra-light contemporary serif (Reckless Neue at 250) appears only on large display headings to whisper rather than shout. The mint-green pill navigation bar acts as a constant brand anchor, persisting across both dark and light sections like a boarding-pass stub. Surfaces are flat and paper-like; elevation is replaced by border weight (predominantly 1px black) and generous whitespace, giving the system a print-magazine logic rather than a typical app-dashboard logic.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Command | `#2d9b4c` | Primary CTA fills, active nav indicators, footer link accents, tag chips — the single chromatic heartbeat of the system; warm green against matte black creates urgency without aggression |
| Mint Boarding Pass | `#d3ffc3` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Champagne Beige | `#e7d5ba` | Hero illustration backdrop and premium accent panel — warm near-neutral that introduces tonal warmth inside predominantly black/green compositions |
| Linen Cream | `#e4e9dc` | Light-section page background — slightly green-tinted off-white that keeps light pages feeling on-brand rather than clinical |
| Parchment | `#efefe7` | Card surfaces in light sections, secondary fills, ghost-button borders — warmer than pure white, pairs with linen cream for a two-tier light surface stack |
| Obsidian | `#000000` | Dominant dark canvas, 1px structural borders everywhere, button text on green fills, all text on light surfaces — the structural black that carries the system |
| Paper White | `#ffffff` | Headline and body text on dark sections, card surfaces elevated above black backgrounds, reverse borders on light sections |
| Carbon | `#020202` | Near-black variant for subtle text/background differentiation where pure #000 would be too flat — imperceptible shift that softens edges in dense text blocks |

## Typography

### Labour Grotesk — Primary system font at a single weight — used for navigation, body, buttons, card titles, footer, and the massive 435px hero display. The decision to lock to weight 400 instead of ranging 300–700 is the signature: it forces hierarchy through size and tracking, not weight, producing a uniform, confident, almost monoline voice. The 435px size is a single decorative display moment, not a functional text size.
- **Substitute:** Inter, DM Sans, General Sans
- **Weights:** 400
- **Sizes:** 16px, 20px, 23px, 28px, 31px, 39px, 43px, 53px, 435px
- **Line height:** 0.80–1.50
- **Letter spacing:** -0.072em at display (435px), -0.01em at 39–53px, +0.01em at small body (16–23px)

### Reckless Neue — Editorial serif at ultra-light 250 weight — appears only on large blog and content headings. The choice of weight 250 (near-hairline) instead of the conventional 400–500 is anti-SaaS: headlines whisper rather than declare authority, creating a magazine-editorial contrast against Labour Grotesk's steady functional voice.
- **Substitute:** PP Editorial New, Cormorant Garamond Light, Source Serif Light
- **Weights:** 250
- **Sizes:** 20px, 39px, 43px, 53px
- **Line height:** 1.10–1.30
- **Letter spacing:** -0.01em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.5 | 0.01px |
| body-sm | — | — | 20px | 1.5 | — |
| body | — | — | 23px | 1.3 | — |
| subheading | — | — | 28px | 1.2 | — |
| heading-sm | — | — | 31px | 1.2 | — |
| heading | — | — | 39px | 1.1 | -0.01px |
| heading-lg | — | — | 43px | 1.1 | -0.01px |
| display | — | — | 53px | 1 | -0.01px |
| mega-display | — | — | 435px | 0.8 | -0.072px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 120-187px
- **Card padding:** 22-37px
- **Element gap:** 15-27px

### Border Radius

- **cards:** 15.04px
- **buttons:** 10.08px
- **navPill:** 9999px

## Components

### Persistent Navigation Pill
**Role:** Sticky top navigation bar present on every section

Mint Boarding Pass (#d3ffc3) background, full-width pill with significant internal padding (~27px horizontal, ~15px vertical). Contains the Trawelt wordmark + circular arrow-up badge on the left, and a horizontal nav link list + black-filled 'Get in touch' pill button on the right. Border-radius approximately 15px. The mint green bar persists across dark and light sections, acting as a constant brand anchor.

### Forest CTA Button (filled)
**Role:** Primary action button

Forest Command (#2d9b4c) fill, white text, Labour Grotesk 400 at ~16px, padding ~10px 18px, border-radius 10.08px. No shadow. Black 1px border optional. The saturated green against the otherwise black/cream system makes this button feel like a power switch — small, filled, and unmistakable.

### Black Pill Button
**Role:** Secondary action / nav CTA ('Get in touch')

Black (#000000) fill, white text, Labour Grotesk 400 at ~16px, padding ~10px 22px, border-radius 9999px (full pill). Sits inside the mint navigation bar, creating a high-contrast punch against the pastel green.

### Ghost Arrow Button
**Role:** Carousel/pagination navigation

Circular 48px button, 1px black border on white fill (inactive) or filled black with white arrow (active/hover). Used for blog post carousel arrows. No background, no shadow — purely outline-driven.

### Hero Service Card (dark)
**Role:** Horizontal-scrolling service category card on dark canvas

Full-bleed image card with category label overlay in white text, Labour Grotesk 400. The image fills the card with no padding; text sits at the top-left with ~27px padding. Cards are part of a horizontal scroll row — no visible card border, the image is the card.

### Centered White Feature Card
**Role:** Promotional callout floating on dark hero

White (#ffffff) card with significant padding (~37px), large Labour Grotesk text spanning multiple lines ('Upgrade your Tour operator to first class.'), and a Forest Command CTA button inset at the bottom right. Border-radius 15.04px. Acts as a paper card on the black canvas — the only bright object in the dark hero.

### Boarding Pass Card
**Role:** Branded illustration/promotional asset

Forest Command green card mimicking a physical boarding pass with perforated/torn edges and rounded corners ~15px. Contains bold Trawelt wordmark, small descriptor text, and a separate card stub for URL display. Black text on green. Used as a decorative/brand moment in the dark section transition.

### Blog Feature Card
**Role:** Editorial blog post preview on light section

Two-column layout: large image on left (~50% width, full-bleed to card edge), text block on right with title in Reckless Neue 250 weight ~39px in Obsidian black, excerpt in Labour Grotesk 400 ~16px in a muted dark. White card surface on Linen Cream page background. No border, generous ~37px internal padding.

### Tag/Chip
**Role:** Inline metadata label

Small inline element using Labour Grotesk 400 at 16px, Forest Command text color or 1px black border with black text. No fill. Used for category labels and language tags.

### Logo Mark
**Role:** Brand wordmark in navigation

Trawelt set in Labour Grotesk 400 at ~23px, black on mint nav background. Accompanied by a circular badge icon with an upward arrow (~40px diameter, black 1px border, white fill). The mark is always locked with the badge — never the wordmark alone in the nav.

### Section Heading (serif)
**Role:** Large editorial heading on light sections

Reckless Neue at 250 weight, sizes 39–53px, Obsidian black (#000000), line-height 1.10–1.20, letter-spacing -0.01em. Appears only on light cream backgrounds. The ultra-light serif weight is the signature — it gives blog/editorial sections a print-magazine authority that contrasts the grotesk-led functional UI.

### Section Heading (grotesk)
**Role:** Large functional heading on dark sections

Labour Grotesk 400 at 39–53px, white (#ffffff) on Obsidian black, line-height 1.10–1.20, letter-spacing -0.01em. Used for hero copy and section titles on dark canvases. Single weight across all sizes — hierarchy comes from size alone.

### Footer Link Group
**Role:** Site footer navigation and legal links

Obsidian black or Linen Cream background, Labour Grotesk 400 at 16px, Forest Command link color for active items, white or black for inactive. Items arranged in a multi-column grid with generous row gaps.

## Do's and Don'ts

### Do
- Use Forest Command (#2d9b4c) as the only chromatic fill in the system — never introduce secondary accent colors
- Lock the persistent Mint Boarding Pass (#d3ffc3) nav pill at the top of every page, both dark and light sections
- Set all body and UI text in Labour Grotesk weight 400 — build hierarchy through size and tracking, never through weight variation
- Use Reckless Neue weight 250 only for editorial headings on light cream sections; never pair it with bold or italic variants
- Communicate elevation by canvas inversion (white card on black page) or 1px black borders — never use box-shadows
- Apply 15.04px radius to all cards and panels, 10.08px to all buttons and small inputs, 9999px to nav pills and tags
- Alternate full-bleed dark and light section bands with 120–187px vertical gaps between them

### Don't
- Don't introduce a second or third accent color — green is the only chromatic heartbeat
- Don't use font-weight 600/700 anywhere — the system is intentionally monoline at weight 400
- Don't use box-shadows, drop-shadows, or glow effects on any element
- Don't use the mega-display 435px size for functional text — reserve it for a single decorative moment per page
- Don't place Reckless Neue on dark backgrounds — it is a light-section exclusive
- Don't use pure white (#ffffff) as a page background — light sections should always be Linen Cream (#e4e9dc) or Parchment (#efefe7)
- Don't break the nav pill — it must remain a single continuous mint-green bar across all sections

## Elevation

- **White feature card on dark hero:** `none — elevation conveyed by contrast inversion, not shadow`
- **Blog card on cream section:** `none — flat paper-on-paper`
- **Navigation pill:** `none — the persistent pill is its own elevation signal`

## Surfaces

- **Obsidian Canvas** (`#000000`) — Base dark canvas for hero, feature, and CTA sections
- **Paper Card** (`#ffffff`) — Elevated card surface floating on dark sections
- **Linen Page** (`#e4e9dc`) — Light-section page background for blog and editorial content
- **Parchment Card** (`#efefe7`) — Card surfaces sitting on linen cream pages

## Imagery

Imagery follows a luxury-hospitality editorial logic: tight, well-lit interior and architectural photography of hotels, lounges, and boutique spaces. Treatment is naturalistic with warm tones (leather, wood, natural light) — never duotone, never overlaid with brand color. Images are used at two scales: (1) full-bleed in horizontal service-category cards where the image IS the card, and (2) large 50%-width crops in blog posts. No lifestyle people-photography, no staged scenes, no abstract gradients. Where illustration appears, it's the boarding-pass green card — a flat, two-color, die-cut shape rather than a drawn illustration. Icons are minimal: a single arrow-up badge in the nav and circular arrow buttons for pagination. The visual language is restrained, photographic, and print-magazine in its crop discipline.

## Layout

Trawelt uses a max-width ~1200px content frame centered on the page, but the canvas itself is full-bleed. The page is structured as alternating dark/light bands: the hero and feature sections sit on a full-bleed Obsidian black canvas, then the blog/editorial section flips to full-bleed Linen Cream. Within the dark canvas, content alternates between centered text stacks (headline + subhead) and full-bleed horizontal-scrolling card rows. Within the light canvas, content is a two-column blog grid (image-left, text-right) with generous gutters. Vertical rhythm is spacious — section gaps of 120–187px between major bands create a slow, scroll-as-flipping-pages cadence. The persistent mint-green nav pill floats over everything, breaking the band structure and acting as a constant brand rail.

## Similar Brands

- **Linear** — Same dark-canvas + single-accent-color discipline with very tight typographic control; both lock to a constrained weight range and use size alone for hierarchy
- **Studio Bergini** — Editorial serif headings paired with a clean grotesk for body, and the same print-magazine sectioning logic with alternating dark/light bands
- **Resend** — Persistent pill navigation, generous whitespace, and the same restraint of using one chromatic accent against an achromatic base
- **Pentagram** — Ultra-light serif display weights on large headings and a flat, border-driven (not shadow-driven) elevation philosophy
