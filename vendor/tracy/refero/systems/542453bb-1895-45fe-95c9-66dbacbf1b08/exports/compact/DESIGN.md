# Palette Supply — Style Reference
> art-supply shelf in a sunlit studio

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Palette Supply operates on the principle that color IS the product — the interface recedes so that swatches can speak. A warm cream canvas (#f2f0e9) acts like a designer's worktable, with matte rectangular swatches scattered at varying sizes and aspect ratios, each one a distinct earthy hue from a curated palette. The UI chrome is deliberately quiet: a deep ink black (#141212) for text, a single saturated blue-violet (#3051a8) reserved exclusively for actions and links, and zero shadows — every boundary is a hairline border or a color edge. Typography is custom and confident: 'esbuild' stamps oversized 64px display titles with extremely tight tracking, while 'ppsupply' handles everything else at whisper-light weights (100 and 300) that make the page feel airy and unhurried. The result reads less like a web app and more like a well-organized stationery catalog — generous whitespace, tactile surfaces, no gradients, no glassmorphism, no decorative noise.

## Colors

| Name | Value | Role |
|------|-------|------|
| Studio Cream | `#f2f0e9` | Page canvas — warm off-white ground that warms every color placed on it, the single largest surface in the system |
| Paper White | `#ffffff` | Elevated card and surface layer, used when a swatch or content block needs to sit above the canvas |
| Ink Black | `#141212` | Primary text, heading strokes, and hairline borders — slightly warmer than pure black, pairs cleanly with the cream canvas |
| Pencil Gray | `#a1a0a0` | Muted secondary text and inactive borders, the only mid-gray in the neutral scale |
| Sage Wash | `#dde5d8` | Soft tinted surface for tags, list rows, and secondary buttons — a barely-green neutral that adds warmth without committing to color |
| Studio Ivory | `#d7d7c8` | Swatch surface — the neutral anchor card color used to display palette sets; warm, slightly green-tinged, reads as unpainted canvas |
| Cobalt Command | `#3051a8` | Primary action fill, active link color, and icon accents — the only saturated chromatic in the UI, used sparingly to make clicks feel decisive |
| Forest Ink | `#3f593d` | Dark accent for premium swatches and select button variants — muted, almost black, recedes like aged leather |
| Marigold | `#f89c35` | Warm chromatic swatch accent — vivid orange that pops against the cream canvas, used as a featured palette member |
| Buttercup | `#f6dc2e` | Bright chromatic swatch — primary yellow, the most luminous accent in the palette set, draws the eye like a highlighter |
| Cobalt Pop | `#0159bd` | Secondary blue swatch — brighter and more cyan than Cobalt Command, used as a palette swatch rather than UI action |
| Terracotta | `#863a29` | Earth-red swatch accent — the deep burnt-orange that grounds warm palettes |
| Rose Clay | `#ed93af` | Soft pink swatch — dusty rose that reads as warm, not saccharine |
| Rust | `#a0674f` | Warm brown swatch — mid-tone earthy orange, a bridge between terracotta and tan |
| Wheat | `#b99572` | Muted tan swatch — soft warm neutral that sits between cream and brown |
| Saffron | `#d8c660` | Olive-yellow swatch — slightly green-shifted yellow, more sophisticated than pure butter |
| Olive Stone | `#a9ab72` | Muted yellow-green swatch — the sage-olive that ties natural palettes together |
| Linen Blush | `#dcc5bd` | Soft pink-beige swatch — the lightest warm neutral in the chromatic range, like raw silk |
| Stone | `#c7b8ab` | Warm gray swatch — taupe with pink undertones, the bridge between cream and brown |

## Typography

### ui-sans-serif — ui-sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2, 1.5
- **OpenType features:** `"ss02"`

### esbuild — Display and hero heading — used at a single oversized 64px size with negative tracking (-0.03em) and aggressive 0.94 line-height. The extremely tight leading and condensed letterforms make one word command the page. If unavailable, substitute with 'PP Editorial New' or 'Söhne Breit' for similar geometric presence.
- **Substitute:** PP Editorial New, Söhne Breit Halbfett, or system geometric sans at tightened tracking
- **Weights:** 400
- **Sizes:** 64px
- **Line height:** 0.94
- **Letter spacing:** -0.0300em
- **OpenType features:** `"ss02"`

### ppsupply — Body, UI, buttons, links, list items, inputs — the workhorse typeface at four sizes. The whisper-light weight 100 and 300 are the signature: text doesn't shout, it sits lightly on the cream surface. Weight 400 appears in interactive elements and emphasis. The -0.04em tracking at smaller sizes tightens the airy feel. Substitute with 'Inter' or 'Söhne' at matching weights.
- **Substitute:** Inter, Söhne, or Suisse Int'l at matching weights
- **Weights:** 100, 300, 400
- **Sizes:** 13px, 15px, 16px, 18px
- **Line height:** 1.00, 1.20, 1.22, 1.25, 1.54
- **Letter spacing:** -0.04em at 13-15px; -0.04em at 16px body; +0.02em at 18px for list/button contexts
- **OpenType features:** `"ss02"`

### PPSupplyMonoLight — Monospaced annotation and metadata — for hex codes, technical labels, and codespell-grade detail. Reserved for moments that need machine-precise alignment.
- **Substitute:** JetBrains Mono Light, IBM Plex Mono Light, or Berkeley Mono
- **Weights:** 300
- **Sizes:** 12px
- **Line height:** 1.20
- **OpenType features:** `"ss02"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| mono-detail | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 15px | 1.22 | -0.6px |
| subheading | — | — | 18px | 1.25 | 0.36px |
| display | — | — | 64px | 0.94 | -1.92px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 72px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 100px
- **cards:** 12px
- **pills:** 100px
- **images:** 12px
- **inputs:** 100px
- **buttons:** 5px

## Components

### Color Swatch Card
**Role:** The primary product display — rectangular color samples shown at varying sizes and aspect ratios across the canvas

Flat rectangle with no border, no shadow, no padding. Background is a single solid color from the palette (e.g. #3f593d, #d7d7c8, #c7b8ab). Border-radius is 12px. Sizes vary deliberately — some are tall narrow strips, some are wide short bands, some are small squares — creating a scattered gallery layout rather than a uniform grid. No text overlay on the swatch itself; metadata sits adjacent.

### Rectangular Button
**Role:** Primary action control — used for 'Add to cart', 'Subscribe', and similar functional triggers

5px border-radius, 14px vertical padding × 30px horizontal padding. Fill is Cobalt Command (#3051a8) with white text at 15px ppsupply weight 300. Border 1px solid Ink Black (#141212) wraps all buttons — even filled ones — creating a printed-sticker feel. No hover state with shadow; hover shifts fill slightly or inverts to white-fill + ink text.

### Pill Button
**Role:** Secondary action, tag toggle, or filter chip

100px border-radius (full pill). 8px vertical padding × 20px horizontal padding. Fill is white or Sage Wash (#dde5d8). Text is ppsupply weight 300 at 15px in Ink Black. 1px Ink Black border. Compact, tactile, button-like — used for 'All', 'Warm', 'Cool' filter tags and similar.

### Ghost Text Link
**Role:** Inline navigation and editorial links within body copy

No background, no border, no underline by default. Text color is Cobalt Command (#3051a8) at ppsupply weight 400, 15-16px. On hover, underline appears with 1px offset. Links feel inline and continuous with body text rather than chunky click targets.

### Discount Badge
**Role:** Floating promotional indicator — anchored to a corner of the canvas or card

Circular 1000px-radius badge (appears as a perfect circle ~40-48px diameter). Fill is Cobalt Command (#3051a8). Text is white ppsupply weight 300 at 12px, centered, two lines ('35%' / 'OFF'). No border, no shadow. Functions as a persistent floating element on the page corner.

### Input Field
**Role:** Text input for email capture, search, and form fields

100px border-radius (pill shape). 10-12px vertical padding × 20px horizontal padding. Fill is white. Border 1px solid Ink Black. Placeholder text is ppsupply weight 300 at 15px in Pencil Gray (#a1a0a0). Focus state thickens or darkens the border to 2px Ink Black; no glow or ring.

### List Row
**Role:** Navigation menu items, palette member listings, or directory rows

Full-width row with 8px vertical padding. Sage Wash (#dde5d8) or white fill. 1px Ink Black border separates rows. Text is ppsupply weight 300 at 15-18px. Tight rhythm with no extra vertical air — lists feel like notebook entries.

### Display Wordmark
**Role:** Hero text — the single 64px statement that names the page or section

esbuild weight 400 at 64px. Line-height 0.94 (nearly touching). Letter-spacing -0.03em (-1.92px). Text color is Ink Black (#141212). No all-caps; set in lowercase or sentence case. Sits alone on the cream canvas, often centered, with no supporting decoration.

### Swatch Set Card
**Role:** Curated palette container — a group of 4-6 related swatches presented as a unit

White or Studio Ivory (#d7d7c8) fill, 12px border-radius, 20px padding. Contains 3-6 smaller swatch rectangles inside, each at ~60-80px with 8px gaps. Title in ppsupply weight 300 18px sits above. Functions as the purchasable/downloadable unit.

## Do's and Don'ts

### Do
- Set all page backgrounds to Studio Cream (#f2f0e9); never use pure white as a full-page background
- Use esbuild at exactly 64px for display headings with -0.03em letter-spacing and 0.94 line-height — one word should command the page
- Use ppsupply at weights 100 or 300 for body copy; reserve weight 400 for interactive elements and emphasis
- Use 12px border-radius for all cards, swatches, and images; 5px for rectangular buttons; 100px for pill buttons, tags, and inputs
- Wrap all interactive elements (buttons, inputs, cards) in a 1px solid Ink Black (#141212) border — this is the system's only structural line
- Use Cobalt Command (#3051a8) exclusively for primary actions, active links, and icon accents — never as a background fill or large surface
- Vary swatch rectangle dimensions deliberately — tall narrow strips, wide short bands, small squares — to create gallery rhythm rather than uniform grid tiles

### Don't
- Don't add drop shadows, blurs, or frosted-glass effects — the design is intentionally flat and relies on color and borders for separation
- Don't use system sans-serifs (Arial, Helvetica, SF Pro) for body text — always ppsupply; the custom font's light weights define the airy feel
- Don't use multiple saturated colors as UI chrome — chromatic colors are swatch content, not interface elements
- Don't center content in a max-width container for the whole page — let the swatches scatter full-bleed; the canvas is the layout
- Don't use white card fills on the cream canvas unless elevation is needed — default to Studio Ivory (#d7d7c8) for palette cards
- Don't set display text in all caps; esbuild's geometric character works in lowercase or sentence case where letterforms stay distinct
- Don't use gradient fills, even subtle ones — every surface in this system is a single solid color

## Elevation

This design is intentionally shadowless. Depth is communicated exclusively through color contrast and hairline 1px borders (most often Ink Black #141212). There are no drop shadows, no blurs, no frosted glass — the flatness is deliberate and reinforces the paper/stationery metaphor. Surfaces separate by tone, not by lift.

## Surfaces

- **Canvas** (`#f2f0e9`) — The full-bleed page background; warm cream ground
- **Paper** (`#ffffff`) — White cards and elevated content blocks
- **Studio Ivory** (`#d7d7c8`) — Neutral swatch surface — the standard card body for palette displays
- **Sage Wash** (`#dde5d8`) — Tinted surface for tags, list items, and secondary buttons

## Imagery

The site has essentially no traditional imagery — no photography, no illustration, no 3D renders. The visual content IS the color: flat rectangular swatches of varying sizes and aspect ratios scattered across the warm cream canvas like paint chips on a studio table. Swatches are sharply edge-defined (no shadows, no rounded content within), 12px-cornered, and presented as raw color blocks rather than styled cards. Icons (when present) are line-style with 1px strokes in Cobalt Command or Ink Black, monoline, geometric. The visual density is very low — most of the page is breathing cream space, with color appearing as deliberate, curated punctuation.

## Layout

Full-bleed warm cream canvas with no hard container width; content floats as scattered elements rather than confined to a centered column. The hero is minimal: a single large display wordmark (esbuild 64px) centered or left-aligned on the open canvas, with color swatches distributed asymmetrically around it at varying scales. Below the hero, palette sets appear as loose groups of swatch rectangles rather than a rigid grid — positions feel curated, not algorithmic. Navigation is minimal: likely a top-right cluster of text links, no sticky header, no sidebar. The overall rhythm is gallery-like — generous 72px vertical gaps between sections, each section reading as one composed arrangement rather than stacked blocks. No alternating dark/light bands; the entire page lives in the light cream world.

## Similar Brands

- **Are.na** — Same scattered-block-on-cream-canvas aesthetic where user content (color swatches / image blocks) floats freely on a warm neutral ground with minimal UI chrome
- **Pigment by Shape** — Color-focused product with a similar hand-curated, stationery-shop feel — muted earthy palette, oversized restrained typography, no decorative effects
- **Courier (read.cv)** — Editorial minimalism with a single warm canvas color, custom low-weight type, hairline borders, and zero shadows creating a printed-page feel
- **Things 3 (Cultured Code)** — Same deliberate restraint — one accent color, generous whitespace, custom geometric typography, and an anti-decoration stance that lets the product breathe
- **Kraft / Field Notes brand sites** — Analog stationery influence — warm cream backgrounds, matte surfaces, tight typography, and the sense of a curated supply shelf rather than a digital app
