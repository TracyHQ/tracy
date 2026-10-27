# Ssense — Style Reference
> White gallery wall with editorial serifs. A high-fashion magazine spread rendered as a single-page web experience — where the only color is photography and the only weight is restraint.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

SSENSE operates as a digital fashion editorial: pristine white canvas, razor-thin sans-serif navigation, and oversized serif headlines that behave like magazine cover titles rather than web UI. The visual system is deliberately monochrome — no accent colors, no filled CTAs, no decorative gradients — letting editorial photography and typography do all the expressive work. Hierarchy is achieved through extreme scale contrast (95px display down to 11px meta labels) and tight negative letter-spacing on serif faces that pulls letterforms into elegant, compressed shapes. Components are minimal and ghost-like: outlined buttons, hairline borders, near-invisible dividers. The site reads less like a store and more like a curated print publication that happens to sell things.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, navigation links, logo wordmark, footer links, SVG icon strokes — the anchor color of the entire system |
| Graphite | `#333333` | Body text and headings — slightly softer than pure black for long-form editorial readability at large sizes |
| Silver | `#979797` | Hairline borders, dividers, inactive UI separators, secondary meta labels |
| Ash | `#888888` | Muted helper text, list items, tertiary metadata, subdued navigation states |
| Marble | `#f4f4f4` | Page canvas background, subtle section differentiation, footer surface — barely warmer than pure white |
| Paper | `#ffffff` | Card surfaces, hero background, product tiles, elevated content panels |
| Mist | `#e8e8e8` | Alternative surface tint, subtle alternating bands, ghost button hover backgrounds |

## Typography

### JHA Times Now — Editorial display and subhead serif — the voice of the brand. Used at 56px for hero editorial titles with extreme tight tracking (-0.04em) and 1.07 line-height, creating a compressed magazine-cover effect. Weight 100 is a near-hairline whisper that feels anti-commerce. Substitute: Playfair Display, GT Sectra, or Canela for a similar high-contrast transitional serif.
- **Substitute:** Playfair Display, GT Sectra, Canela
- **Weights:** 100, 400
- **Sizes:** 15px, 20px, 56px
- **Line height:** 1.07, 1.20, 1.30, 2.00
- **Letter spacing:** -0.0400em at 56px, -0.0030em at 20px, -0.0020em at 15px

### Favorit SSENSE Inter — Primary UI and content sans-serif — used for navigation, body text, editorial descriptions, and the largest display sizes (95px). The letter-spacing scales aggressively tighter as size increases: -0.047em at 95px pulls the giant wordforms into a dense architectural block, while -0.004em at 14px keeps body text natural. This negative-tracking-at-scale pattern is the signature. Substitute: Inter, Söhne, or Neue Haas Grotesk.
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 100, 400
- **Sizes:** 11px
- **Line height:** 0.99, 1.16, 1.19, 1.26, 1.37
- **Letter spacing:** -0.0470em at 95px, -0.0330em at 38px, -0.0180em at 29px, -0.0130em at 19px, -0.0040em at 14px

### ssense-fonts (micro-tag) — Bold micro-label for category tags and merchandising markers — the one place weight 700 appears in the entire system. Always uppercase, always 11px, always tight line-height.
- **Substitute:** Inter Bold, Söhne Bold
- **Weights:** 700
- **Sizes:** 11px
- **Line height:** 1.00
- **Letter spacing:** normal

### Favorit SSENSE Inter1 — Favorit SSENSE Inter1 — detected in extracted data but not described by AI
- **Weights:** 100, 400
- **Sizes:** 14px, 19px, 29px, 38px, 95px
- **Line height:** 0.99, 1.16, 1.19, 1.26, 1.37
- **Letter spacing:** -0.047, -0.033, -0.018, -0.013, -0.004

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1 | 0px |
| body-sm | — | — | 14px | 1.37 | -0.056px |
| subheading | — | — | 20px | 1.2 | -0.06px |
| heading-sm | — | — | 29px | 1.19 | -0.522px |
| heading | — | — | 38px | 1.16 | -1.254px |
| heading-lg | — | — | 56px | 1.07 | -2.24px |
| display | — | — | 95px | 0.99 | -4.465px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 10-20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **links:** 0px
- **buttons:** 0px

## Components

### Ghost Outlined Button
**Role:** Primary call-to-action on editorial banners (e.g. 'View Editorial')

1px solid #000000 border, no fill, transparent background, #000000 text. Padding approximately 10px 20px. No border-radius — completely sharp corners. Text in Favorit SSENSE Inter at 11px weight 400, uppercase, letter-spacing normal. On hover: fill becomes #000000, text inverts to #ffffff. This is the only interactive element style in the system.

### Top Navigation Bar
**Role:** Primary site navigation across all pages

White (#ffffff) background, no border, no shadow. Left-aligned category links (MENSWEAR, WOMENSWEAR, EVERYTHING ELSE, SALE, SEARCH) in Favorit SSENSE Inter 11px weight 400, uppercase, #000000. Centered logo wordmark 'SSENSE' in larger weight. Right-aligned utility links (ENGLISH, LOGIN, WISHLIST, BAG). All text tracking normal, all elements vertically centered with ~20px horizontal padding.

### Editorial Hero Block
**Role:** Landing page hero section combining headline + editorial photography

Two-column layout: left column holds serif headline (JHA Times Now, 56px, weight 400, #333333) stacked over sans-serif editorial description (Favorit SSENSE Inter, 19-20px, weight 400, #333333), with ghost outlined button below. Right column holds a full-bleed editorial photograph. No card container, no background fill, no dividers — content floats directly on the #ffffff canvas. Gap between columns approximately 40-55px.

### Editorial Card Grid Item
**Role:** Content tiles in the secondary editorial grid below the hero

Three-column grid of editorial content cards. Each card: top is a landscape photograph with no border-radius, no padding around image. Below image: 'RECENT' micro-label in ssense-fonts weight 700, 11px, uppercase, #000000. Then a headline in Favorit SSENSE Inter 14-19px, weight 400, #000000. Then a metadata line (category + date) in 11px weight 400, #888888. No card background, no border, no shadow — the photograph is the visual anchor.

### Product Feature Card
**Role:** Featured product placement with dark moody photography

Two-column product feature layout. Each column contains a product photograph on a gradient background (dark teal-to-gray), sharp corners, no border. Below: 'Featured' label in 11px weight 400, then 'NEW ARRIVALS' in Favorit SSENSE Inter ~19px weight 400. The dark photographic backgrounds create tonal contrast against the white page without any colored UI elements.

### Promotional Banner Strip
**Role:** Site-wide announcement bar at the very top

Full-width horizontal strip at the top of the page. Very light background, thin bottom border. Centered text in Favorit SSENSE Inter 11px weight 400, #000000. A small close (×) icon in the far right corner. No padding drama — sits as a single-line 30-40px tall band.

### Header Logo Mark
**Role:** Brand wordmark centered in navigation

Text-only 'SSENSE' wordmark in Favorit SSENSE Inter, approximately 19-20px, weight 400, #000000, centered in the top navigation bar. No symbol, no tagline — the wordmark IS the logo. Functions as a home link.

### Micro Category Label
**Role:** Metadata and category tagging on editorial content

ssense-fonts family at weight 700, 11px, #000000, uppercase. Always precedes an editorial headline. Sets a typographic rhythm: bold tag → regular headline → muted meta. Letter-spacing normal, line-height 1.0 — sits tight against the line below.

### Meta Description Line
**Role:** Secondary descriptive text under editorial headlines

Favorit SSENSE Inter 14-15px, weight 400, #888888. Pairs with the black headline above to create a two-tone label hierarchy. The 3:1 contrast between #000000 headline and #888888 meta is the system's only typographic color gradient.

### Editorial Paragraph Block
**Role:** Long-form editorial body text in hero sections

JHA Times Now serif, 20px, weight 100 (hairline), #333333, line-height 1.30. The ultra-light serif weight for body copy is a signature anti-pattern — most luxury sites use regular or medium for body. This creates a whisper-thin text quality that feels typeset, not typed. No maximum width constraint visible — text flows within its column.

## Do's and Don'ts

### Do
- Use only the seven neutral colors — no accent colors, no brand colors, no fills on interactive elements
- Set display headlines at 56-95px with letter-spacing of -0.033em to -0.047em for compressed editorial weight
- Use weight 100 (hairline) for serif body text at 20px — the thinness is the signature
- Keep all component corners at 0px radius — SSENSE is a sharp-edged system
- Use the Ghost Outlined Button (1px #000000 border, transparent fill) for all calls to action
- Maintain 64px vertical gaps between major sections and 10-20px gaps between related elements
- Pair serif editorial headlines (JHA Times Now) with sans-serif body text (Favorit SSENSE Inter) — the contrast is the system

### Don't
- Never add a colored CTA button — the system has no primary action color
- Never use border-radius above 0px on any UI element
- Never use a sans-serif font for editorial display headlines above 38px
- Never use letter-spacing above normal on any element — tracking is always negative or zero
- Never place content on anything other than #ffffff or #f4f4f4 surfaces
- Never use drop shadows or elevation effects — the system is flat
- Never use bold weights (600-700) for anything other than the 11px micro-tag label

## Elevation

SSENSE is a completely flat design system. No drop shadows, no box-shadows, no elevation effects of any kind. Visual separation is achieved exclusively through whitespace, the natural contrast between #ffffff and #f4f4f4 surfaces, and 1px hairline borders in #979797. The flatness reinforces the editorial print-magazine metaphor — like ink on paper, not digital UI.

## Surfaces

- **Canvas** (`#f4f4f4`) — Page background — the warm-white gallery wall
- **Card Surface** (`#ffffff`) — Elevated content areas, hero backgrounds, product tiles
- **Alt Band** (`#e8e8e8`) — Subtle section alternation, ghost hover states

## Imagery

Photography is the sole source of color and visual energy in this system. Editorial fashion photography dominates: full-bleed or near-full-bleed landscape and portrait crops of models in designer clothing, product photography on gradient backgrounds (dark teal-to-gray studio shots), and environmental lifestyle imagery. Images have sharp corners with no border-radius, no overlays, no duotone treatment — they appear as raw photographic prints placed on the white page. No illustrations, no icons (except the × close button and minimal UI markers), no 3D renders, no abstract graphics. The images do all the emotional and chromatic work that a typical e-commerce site would delegate to color and decoration.

## Similar Brands

- **Mr Porter** — Same editorial-magazine approach to luxury e-commerce — large serif display type, monochrome palette, photography as the sole color source, sharp-cornered ghost buttons, and generous whitespace between editorial sections
- **The Row** — Identical restraint philosophy — pure white canvas, no accent colors, hairline-thin sans-serif navigation, serif editorial headlines, and an absolute refusal to use UI decoration that would distract from the product
- **COS** — Same ultra-minimal monochrome system with oversized sans-serif display type, negative letter-spacing on large text, completely flat surfaces with no shadows, and sharp 0px corners on all components
- **Aesop** — Shares the warm-white (#f4f4f4) canvas, deep typographic contrast between display and body sizes, and a near-total absence of color — both treat photography and typography as the entire visual language
- **Net-a-Porter** — Same luxury editorial e-commerce model — large-scale editorial headlines, monochrome navigation, content-card grids with image-dominant cards, and a flat no-elevation component system
