# Sing-sing — Style Reference
> butter-paper broadsheet at golden hour — a warm saffron canvas with sea-glass ink.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sing-sing is a sunlit editorial system where the page itself is a warm saffron canvas and the interface sits on top like ink printed on butter paper. Color is structural, not decorative: teal sea-glass lines stripe the top of the page, bleed through a gradient, and underline the wordmark — the rest of the system is austere black type on yellow with no shadows, no cards, and no traditional UI chrome. Typography is the protagonist: a grotesk at near-poster scale (147px) with heavy negative tracking carries identity, while a smaller serif (signifier) plays a supporting role for editorial captions. Layout is art-directed, not gridded — each section behaves like a magazine spread, alternating between full-bleed photography, typographic statements, and the signature striped zone.

## Colors

| Name | Value | Role |
|------|-------|------|
| Marigold | `#fcd579` | Page canvas, full-bleed backgrounds, the base layer every other element sits on |
| Sea Glass | `#81d6b9` | Decorative stroke accent — horizontal stripe pattern, top page divider, wordmark underline, gradient terminus |
| Inkstone | `#171717` | Primary text, nav labels, headings, logo wordmark, and all interface borders |
| Marigold Gradient | `linear-gradient(90deg, #81d6b9 40%, #efcb75 100%)` | Right terminus of the signature horizontal gradient (teal → warm gold) used for stripe fades and section dividers |

## Typography

### untitledsans — Primary typeface across all contexts — body copy, nav, footer, links, and the colossal display wordmark. The 147px size at tight tracking (-0.025em) is the identity: the word 'Sing' becomes a spatial event, not a heading. Weight 400 carries body and nav; weight 700 anchors headings and footer emphasis. Kern feature is active throughout to manage the extreme size range.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400, 700
- **Sizes:** 16px, 23px, 24px, 147px
- **Line height:** 1.00–1.22
- **Letter spacing:** -0.025em at 147px, -0.020em at 23-24px, normal at 16px
- **OpenType features:** `"kern" on`

### signifier — Secondary editorial typeface — used for rotated/vertical captions beside photography and occasional body annotations. Its serif presence contrasts the grotesk wordmark to introduce a magazine-like voice. Normal letter-spacing; the small size keeps it as whisper copy, never a headline.
- **Substitute:** Source Serif Pro, Lyon Text, or Tiempos Text
- **Weights:** 400
- **Sizes:** 20px, 21px
- **Line height:** 1.15–1.30
- **OpenType features:** `"kern" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 16px | 1.22 | 0px |
| body-sm | — | — | 20px | 1.3 | 0px |
| body-md | — | — | 23px | 1.15 | -0.46px |
| display | — | — | 147px | 1 | -3.675px |

## Spacing & Layout

**Base unit:** 6px

**Density:** compact

- **Section gap:** 35px
- **Card padding:** 0px
- **Element gap:** 5-7px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Striped Header Band
**Role:** Signature top-of-page element

Full-bleed #81d6b9 horizontal lines (~1px) spaced at ~14px intervals across the top 250-400px of the page on the #fcd579 canvas. Lines function as both decoration and wayfinding. The band has 5px top padding and acts as the page's 'masthead zone'. No shadow, no border-radius.

### Index Label
**Role:** Top-right navigation indicator

Single word ('Index') in untitledsans 16px weight 400, #171717, positioned in the upper right margin. Functions as a minimal nav toggle — the entire navigation is one text link, no menu bar.

### Display Wordmark
**Role:** Brand identity and section openers

The word 'Sing' repeated at 147px / line-height 1.0 / letter-spacing -0.025em in untitledsans weight 400, #171717. Renders at viewport scale, often appearing twice across a spread. A single teal-to-yellow gradient line underlines the wordmark at its baseline. No background, no border — the type IS the component.

### Editorial Image Block
**Role:** Full-bleed photography placement

Large rectangular image containers with 0px radius, no border, no shadow, no padding. Photography bleeds to its container edge with raw crops — no rounded corners or masks. Captions use signifier 20-21px at -90° rotation placed in the gutter beside the image.

### Rotated Caption
**Role:** Editorial annotation beside imagery

signifier 21px weight 400 at normal letter-spacing, rotated -90°, #171717, placed in the narrow margin between image and page edge. Functions as a magazine-style figure caption. Line-height 1.15 keeps the rotated text block tight.

### Gradient Stripe Divider
**Role:** Section separator and rhythm device

A single horizontal line using linear-gradient(90deg, #81d6b9 40%, #efcb75 100%), 1-2px height, full container width. Replaces traditional spacing gaps and section backgrounds — the gradient fades from teal into the marigold canvas, creating seamless flow between sections.

### Footer Wordmark
**Role:** Page-bottom brand anchor

untitledsans weight 400, large size (matching display scale), #171717, left-aligned. No border, no background, no social icons. The footer IS the wordmark — nothing else is needed.

## Do's and Don'ts

### Do
- Use #fcd579 as the only page background — never introduce white or gray canvases
- Let display type reach 147px with -0.025em tracking; restraint at small sizes is the contrast that makes the scale work
- Place teal (#81d6b9) only as thin horizontal lines, single underlines, and gradient strokes — never as fills or blocks
- Use the teal-to-yellow linear-gradient(90deg, #81d6b9 40%, #efcb75 100%) for any divider that needs to feel structural
- Keep all radii at 0px — sharp edges are part of the editorial language
- Let photography fill its container edge-to-edge with raw crops, no rounding or masking
- Activate "kern" on all untitledsans and signifier text to handle the extreme type range

### Don't
- Do not introduce shadows, cards, or elevated surfaces — the system is flat by design
- Do not add white, gray, or off-white backgrounds; marigold is the only canvas
- Do not use teal (#81d6b9) as a button fill or large color block — it is a line/stroke accent only
- Do not create rounded corners on any element; the aesthetic is architectural and sharp
- Do not use multiple accent colors; the system is two chromatic notes (teal + yellow) on black ink
- Do not add decorative borders, boxes, or containers around text or images
- Do not use a traditional grid card system — layout is art-directed, not modular

## Elevation

The system is deliberately shadowless. There is no elevation, no depth, no card-on-canvas layering — everything sits flat on the marigold surface. Visual separation comes from whitespace, the stripe pattern, and the gradient dividers, not from shadows. A dropped shadow would break the printed-on-paper metaphor.

## Surfaces

- **Marigold Canvas** (`#fcd579`) — Full-bleed page background — the only surface in the system

## Imagery

Imagery is photographic, editorial, and full-bleed. The visible example is a color photograph of window blinds backlit by a circular yellow light source, cropped tight to fill its container with no padding. Photographs have saturated, warm-leaning color grading that harmonizes with the marigold canvas. No illustrations, no 3D renders, no abstract graphics — the only 'graphic' element is the teal stripe pattern itself. Imagery is content, not decoration: it is treated as a magazine plate, not a product card.

## Layout

Full-bleed layout with no max-width container — the marigold canvas extends to all viewport edges. The page reads as a vertical sequence of editorial spreads rather than a traditional web layout. Hero is the striped header band, not a centered headline. Sections alternate between typographic statements (the repeated 'Sing' wordmark at 147px spanning the full width), full-bleed photographic plates, and small rotated caption text. Navigation is a single 'Index' link in the top-right — no menu bar, no sidebar, no sticky header. The footer is a large wordmark. Vertical rhythm uses 35px section padding and 5-7px micro-gaps in nav. The overall density is compact but spacious — the large display type breathes while the nav and captions are tightly tracked.

## Similar Brands

- **It's Nice That** — Same editorial-zine layout with full-bleed color backgrounds, massive display type, and photography treated as magazine plates
- **Pentagram** — Bold typographic identity, flat color canvases, art-directed sections instead of card grids, and confidence in near-poster scale type
- **Studio Dumbar** — Warm dominant background colors paired with high-contrast black type and accent stripes — similar editorial confidence
- **Mucca** — Custom typefaces at extreme sizes, warm palette, and a flat no-shadow surface treatment
