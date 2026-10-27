# Magnetism — Style Reference
> White linen gallery wall

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Magnetism operates as a luxury editorial canvas where the wordmark itself is the architecture. The site is almost entirely achromatic — one warm off-white surface, one near-black ink, a single mid-gray for secondary text — with all chromatic content arriving through full-bleed campaign photography. The signature is an enormous weight-300 wordmark stretched edge-to-edge at the top of every page, paired with a bullet-separated navigation that floats in extremely wide tracking. The mood is gallery-quiet: tiny tracked-out labels, hairline rules, subtle circular field-line graphics, and a repeating 'M' watermark on the left margin. Nothing competes with the photographs. The interface is a frame, not a surface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone White | `#e5e7eb` | Page canvas, card surfaces, border-on-hover washes — the warm off-white ground that the entire site sits on |
| Graphite Ink | `#222222` | Primary text, wordmark fill, body copy — near-black with a touch of warmth, softer than pure black |
| Charcoal | `#343434` | Navigation text, secondary headings, muted body — the darker of the two navigation grays |
| Ash | `#aaaaaa` | Tertiary text, inactive nav items, page number indicator — sits behind primary content |
| Silver | `#cccccc` | Hairline dividers, section separators, subtle card backgrounds — the structural border color |
| Pale Mist | `#dbdbdb` | Decorative stroke work, SVG compass/field-line graphics, ultra-faint border accents |
| Pure Black | `#000000` | SVG illustration fills, maximum-contrast moments — used sparingly where the ink needs to be absolute |

## Typography

### TT Hoves Pro Trial — Sole typeface for wordmark, nav, labels, body, and metadata. The ultra-light 300 carries the enormous wordmark — a neogrotesque at whisper weight reads as confident editorial restraint rather than display shouting. 400 runs all body and nav copy; 500 is reserved for the rare emphasis moment.
- **Substitute:** Neue Haas Grotesk, Inter, Aktiv Grotesk, Helvetica Now
- **Weights:** 300, 400, 500
- **Sizes:** 8, 10, 11, 14, 16, 20, 24px (plus ~140px display wordmark)
- **Line height:** 1.00, 1.50, 2.00, 2.50
- **Letter spacing:** 0.10em at 14–16px body, scaling to 0.22em at 8–10px micro-labels

### NeueMontreal — Rare secondary face for body paragraphs in the about/descriptive blocks — a warmer geometric that softens the Hoves rigidity in long-form reading
- **Substitute:** Inter, DM Sans, Switzer
- **Weights:** 400
- **Sizes:** 24px
- **Line height:** 1.50
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.5 | 1.4px |
| body-lg | — | — | 16px | 1.5 | 1.6px |
| subheading | — | — | 20px | 1.5 | 0px |
| heading | — | — | 24px | 1.5 | 0px |
| display | — | — | 140px | 1 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 64px
- **Card padding:** 0px
- **Element gap:** 16px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Wordmark Display
**Role:** Brand identifier stretched across the full viewport top of every page

All-caps TT Hoves Pro Trial at weight 300, ~140px size, tracking 0, color #222222, stretching edge-to-edge. The trademark 'TM' sits as a small superscript at the top right. The wordmark is the hero — no tagline, no supporting mark, no logo lockup. It IS the page header.

### Bullet-Separated Nav
**Role:** Primary navigation across the top of the page

Inline horizontal list: • WORKS •  • ABOUT •  • BOUTIQUE •  • COB •. Each item is 12–14px TT Hoves Pro Trial weight 400, letter-spacing 0.10em (#1.4px), color #343434. Items are separated by middle-dot bullet characters with 32–64px horizontal padding. The logo sits flush left in the same treatment. No background, no border, no underline — pure typographic separation.

### Hero Campaign Banner
**Role:** Full-bleed editorial photograph for featured work

Single image spanning the full viewport width with 0px padding, no radius. No text overlay — the image carries the brand voice. Below the image, a single hairline divider in #cccccc separates the image from its label row.

### Campaign Grid Cell
**Role:** 2-column case study tile in the works grid

Full-bleed photograph filling its 50% column, no border, no radius, no shadow. Below the image sits a label row: 'CAMPAIGN' aligned left, client name (e.g. 'RICHARD MILLE', 'LOUIS VUITTON') aligned right, both at 8–10px weight 400 with 0.22em tracking in #222222. The label row is separated from the image by 16px vertical space and a #cccccc hairline.

### M Side Watermark
**Role:** Repeating brand mark on the left margin

A large 'M' character rendered at ~80–120px in #cccccc, positioned vertically centered on the left page margin. Acts as a quiet running mark — visible but never demanding attention. Repeats on every scroll position.

### Magnetic Field Graphic
**Role:** Subtle decorative line illustration

Thin concentric or radiating circular lines in #dbdbdb, 1px stroke, partially visible at large scale. References the 'magnetism' concept without literal magnetism iconography. Used behind the wordmark and section headers as ambient texture.

### Section Eyebrow Label
**Role:** Tiny tracked-out label introducing a section or page

Format: '• SELECTED WORKS 2019 — 2026 •'. 8–10px TT Hoves Pro Trial weight 400, letter-spacing 0.22em (#2.2px), color #222222, centered or left-aligned. Uses bullet separators and em-dashes as typographic punctuation.

### Page Indicator
**Role:** Small navigation state indicator

'1/2' or arrow marks positioned in the top-right area, 8–10px, 0.22em tracking, #aaaaaa. No container, no button — just characters at the right margin.

### About Block
**Role:** Long-form descriptive text on the home/about page

Narrow column (~154px or constrained width), 10–11px TT Hoves Pro Trial weight 400, line-height 1.5, color #222222 with 0.10–0.22em tracking depending on length. All-caps or sentence case. Sits below the wordmark in the upper-left quadrant.

## Do's and Don'ts

### Do
- Use TT Hoves Pro Trial weight 300 for any display-scale typography — the whisper-weight wordmark is the brand's identity and should never be rendered bold or medium
- Apply 0.22em letter-spacing to all micro-labels at 8–10px, and 0.10em at 14–16px — tracking is the signature that makes text read as editorial rather than utilitarian
- Separate navigation items with middle-dot bullet characters (•) and generous 32–64px horizontal padding — never use pipes, slashes, or vertical dividers
- Render photographs full-bleed with 0px padding and 0px border-radius — any chrome around the imagery dilutes the gallery effect
- Keep all UI chrome achromatic — the only color on the page should come from campaign photography, never from buttons, borders, or accents
- Anchor every page with a tiny eyebrow label in the format '• LABEL — YEAR •' using bullet separators and an em-dash
- Place a large light-gray 'M' character on the left margin of the page as a running watermark — it is the brand's quiet continuous presence

### Don't
- Never introduce a chromatic brand color, CTA button, or accent fill — this system is monochrome by design and color would break the editorial contract
- Never apply border-radius to images, cards, or containers — everything sits sharp-edged on the linen canvas
- Never render the wordmark at weight 500+ or in a condensed/extended variant — the ultra-light 300 stretched across the viewport is non-negotiable
- Never use sentence-case body copy under 14px without the wide 0.22em tracking — small text needs the spacing to read as deliberate rather than cramped
- Never place text overlays on top of campaign photography — labels always sit in a dedicated row below the image
- Never use box-shadow, drop-shadow, or elevation effects — depth is communicated through whitespace and hairline rules, never through blur
- Never separate nav items with visual elements (dividers, backgrounds, borders) — the bullet character IS the separator

## Elevation

Magnetism uses no shadows. Depth is constructed entirely through whitespace, full-bleed imagery, and 1px hairline rules in #cccccc and #dbdbdb. Cards and sections exist on the same surface plane — what separates them is the white space around them, not a shadow. This is intentional: shadows would imply a digital product surface, which contradicts the editorial print-magazine identity.

## Surfaces

- **Bone White** (`#e5e7eb`) — Full-bleed page canvas — the entire site is one continuous off-white field
- **Silver** (`#cccccc`) — Subtle background tint for selected info blocks, nav hover washes

## Imagery

The site is dominated by full-bleed luxury campaign photography — product shots, portraiture, and lifestyle imagery from brands like Richard Mille, Louis Vuitton, and Hennessy. Treatment is editorial: images extend to viewport edges with no padding, no rounded corners, no masks. The photography carries the full color spectrum (vivid blue oceans, pastel skincare tones, warm amber spirits, high-contrast B&W sports) while the surrounding UI remains rigorously achromatic — a high-key gallery approach where each photograph is the art and the page is the wall. No illustration, no abstract graphics, no icons. The only non-photographic visual elements are the typographic wordmark, the 'M' watermark, and the faint circular field-line graphics. Image density is high — 50%+ of every viewport is photographic content.

## Layout

Full-bleed throughout — the wordmark and hero photographs extend to viewport edges with no max-width container. Below the header, the works grid is a clean 2-column split with a 16–24px vertical gap between rows, each image filling its 50% column edge-to-edge. No centered text columns, no asymmetric compositions, no card chrome. The page rhythm is: massive wordmark header → hero campaign banner (full-width) → 2-column campaign grid with label rows below each image. Navigation floats at the very top in a single horizontal line spanning the full width, anchored left (logo) and distributed right (nav items). Vertical spacing between major sections is generous (64–80px), creating the breathing room of a print spread. The 'M' watermark repeats on the left margin at every scroll position, anchoring the brand identity without interrupting the imagery.

## Similar Brands

- **Bureau Cool** — Same editorial monochrome canvas, oversized light-weight display type, and full-bleed campaign photography with tiny tracked-out labels
- **Locomotive** — Similar gallery-quiet layout, hairline rules as the only structural divider, and extreme typographic restraint in nav
- **Pentagram** — Print-magazine page rhythm, wordmark-as-hero header pattern, and the philosophy that the work should dominate while the chrome disappears
- **Studio Dumbar** — Near-monochrome identity system where typographic weight and tracking carry the brand instead of color
