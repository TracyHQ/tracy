# Koox — Style Reference
> Brutalist cold-press lab — white tile, sticker print, stencil voice.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Koox is a brutalist cold-press lab where white subway tile meets product photography and shouty stencil typography. The brand trades in confident all-caps headlines tracked wide across the page, orange grout-line borders that frame every surface like a tiled wall, and a dark-green apothecary palette anchored by a single hard-offset burgundy shadow that makes every button feel like a screen-printed sticker. Pages stay clinical and bright — white canvas, near-black text, thin hairlines — with color reserved for functional punctuation: the orange frame, the dark-green CTA, the burgundy shadow. The result is loud but disciplined, like a juice bar designed by a printmaker.

## Colors

| Name | Value | Role |
|------|-------|------|
| Tile Grout | `#d25a24` | Signature brand border and link accent — orange tile-line strokes that frame cards, links, and section edges with the warmth of fired clay against the clinical white canvas |
| Cold-Press Green | `#113722` | Primary action fill — the dark botanical green of filled CTA buttons, footer band, and category button backgrounds, signaling the product inside without resorting to food-photo greens |
| Sticker Crimson | `#6b1229` | Hard-offset shadow accent — deep burgundy that throws a zero-blur 5px shadow under stickers and emphasized buttons, turning flat elements into screen-print layers peeled onto the page |
| Noir | `#000000` | Navigation, body text, and default border color — the unyielding black that carries every paragraph, icon stroke, and card hairline |
| Glacial White | `#ffffff` | Page canvas, card surface, and reverse text on dark nav and green CTAs — the clinical white tile of the entire system |
| Ash | `#efefef` | Soft card border and subtle fill — the gray grout between white surfaces, used for hairline dividers and recessed card frames |
| Char | `#232323` | Heading color and deep-surface accent — nearly-black tone for the heaviest display text and occasional dark bands |
| Concrete | `#cccccc` | Mid-gray utility border and muted body text — quieter dividers where full black would be too loud |
| Fog | `#d7d7d7` | Input field border — neutral resting-state outline for form fields |
| Slate | `#646464` | Input text and icon fill — secondary legibility gray for form labels and small icon detail |
| Pewter | `#808080` | Decorative low-emphasis border and text — rarely used, appears on tertiary UI marks |

## Typography

### Helvetica — All UI and editorial text. The choice of system Helvetica is deliberate — it reads as lab-label stencil rather than fashion-serif sophistication. Weight 900 headlines shout at 40-48px in all-caps with positive tracking, weight 400-500 carries body copy at 14-18px. No custom display face: the system itself is the brand.
- **Substitute:** Helvetica, Arial, Inter (as functional stand-in if Helvetica unavailable)
- **Weights:** 400, 500, 600, 700, 900
- **Sizes:** 14, 16, 18, 20, 24, 26, 30, 32, 40, 46, 48
- **Line height:** 0.70-2.50 (tight for display, generous for body)
- **Letter spacing:** 0.0080em, 0.0120em, 0.0160em, 0.0180em, 0.0200em, 0.0500em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.38 | 0.7px |
| body-sm | — | — | 16px | 1.5 | 0.26px |
| body | — | — | 18px | 1.57 | 0.29px |
| subheading | — | — | 24px | 1.44 | 0.48px |
| heading-sm | — | — | 30px | 1.3 | 0.6px |
| heading | — | — | 32px | 1.2 | 0.64px |
| heading-lg | — | — | 40px | 1.1 | 0.8px |
| display | — | — | 48px | 1 | 0.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40-60px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **tags:** 5px
- **cards:** 5px
- **buttons:** 5px

## Components

### Top Navigation Bar
**Role:** Persistent site navigation

Solid #000000 background, full bleed. Left-aligned white wordmark 'KOOX' in 26px weight 700 uppercase. Center cluster of nav items (HOME, JUICE SHOP, CLEANSE, ABOUT US, CONTACT, BECOME A STOCKIST) in 14px weight 600 uppercase, #ffffff, letter-spacing 0.7px. Right-aligned cart icon with white circle count badge. Vertical padding 20px.

### Hero Image Section
**Role:** First-screen brand and product statement

Full-bleed product photography (juice bottles arranged on white subway tile) with a dark overlay. Centered uppercase headline overlay at 48px weight 900 #ffffff, letter-spacing 0.96px, line-height 1.0, stacked three lines. Star rating '4.8★' in 32px weight 700 below headline. Reviews caption in 16px weight 400. CTA button anchored below.

### Primary CTA Button (Filled Green)
**Role:** Main conversion action

Filled #113722 background, 5px radius, 11px vertical and 15px horizontal padding. Text in #ffffff, 14px weight 600 uppercase, letter-spacing 0.7px. Sits flat on white surface with no shadow by default.

### Sticker Button (Burgundy Shadow)
**Role:** Emphasized action with screen-print offset

Filled #113722 background, 5px radius, 11px/15px padding, white uppercase text at 14px weight 600. Distinctive hard-offset shadow: rgb(107, 18, 41) 5px 5px 0px 0px — no blur, creating a printed-sticker look. Used for hero CTAs and high-priority links.

### Ghost / Outline Button
**Role:** Secondary action

Transparent or #ffffff fill with 1px #000000 or #d25a24 border, 5px radius. White or black uppercase text at 14px weight 600. No shadow.

### Marquee Quality Bar
**Role:** Repetitive brand-attribute ticker

Full-bleed #ffffff band, 20px vertical padding. Single line of uppercase text in 18px weight 700 #000000, items separated by a pipe '|'. Repeats horizontally. Examples: '100% ORGANIC | 100% COLD-PRESSED | 100% RAW | 0% ADDITIVES | 0% PASTEURISATION | 0% HPP'.

### Category Tile Card
**Role:** Product category entry point

Square product-photo card filling its grid cell. No padding — image bleeds to edges. Large white uppercase category label overlaid on the lower-center of the image at 32px weight 700, letter-spacing 0.64px. 5px radius. Cards are flanked by 1px #000000 hairline dividers to recreate the tile-grout effect.

### Star Rating Display
**Role:** Social proof inline component

Large numeric value (e.g. '4.8') in 32px weight 700 #ffffff, paired with a solid star glyph. Supporting caption below in 14px weight 400 #ffffff. Sits over the hero overlay.

### Bordered Link
**Role:** Inline text or nav link with frame

Text or block wrapped in 1-2px #d25a24 border, 5px radius, 10px-15px padding. Link text in #d25a24 weight 600 uppercase. Optional offset shadow with #6b1229 to elevate to sticker status.

### Hairline Divider
**Role:** Section and grid separator

1px solid #000000 or #efefef line spanning full width or a column. The grid is built from these lines — they form the visual tiling that holds the whole system together.

### Footer Band
**Role:** Site footer with promotional message

Full-bleed #113722 dark-green band, ~60px vertical padding. Centered uppercase message in 18-24px weight 700 #ffffff, letter-spacing 0.48-0.6px. Functions as a repeat-CTA close to the page.

### Form Input
**Role:** Text input for forms

1px #d7d7d7 border, 5px radius, 11px vertical and 15px horizontal padding. Text in #646464 at 14-16px weight 400. No fill by default.

### Organic Certification Mark
**Role:** Trust badge

Circular outlined badge in #000000, 14px uppercase text wrapping the ring perimeter, central icon. Positioned bottom-right of footer or floating over product imagery.

## Do's and Don'ts

### Do
- Use Helvetica at weight 900 for all display headlines at 40-48px, all uppercase, with positive letter-spacing between 0.8px and 0.96px
- Frame cards, links, and category tiles with 1-2px #d25a24 (Tile Grout) borders and 5px radius to reinforce the subway-tile language
- Apply the #6b1229 hard-offset shadow (5px 5px 0px 0px, zero blur) only to sticker-style buttons and emphasized links — never use it as a generic elevation
- Keep page canvas at #ffffff and reserve #113722 for filled CTAs and the footer band
- Set card padding to 20px and element gap to 20px for consistent tile rhythm
- Use the marquee bar pattern (uppercase, weight 700, pipe-separated) for repeating brand-attribute claims
- Reference the green #113722 only as a fill on the primary action and footer; do not use it for text or icons

### Don't
- Do not use negative letter-spacing — the brand's voice depends on positive tracking that gives text room to shout
- Do not apply soft drop shadows, blurs, or multi-layer elevation stacks; elevation is one color and one offset
- Do not introduce additional brand hues beyond Tile Grout orange, Cold-Press green, and Sticker crimson
- Do not use 6px+ border radius or pill-shaped buttons — 5px is the maximum softness in this system
- Do not set body text in anything but weight 400-500 Helvetica; weight 700+ is reserved for display, navigation, and marquee
- Do not place light text on white or dark text on the dark-green band without testing AAA contrast
- Do not use the #6b1229 crimson as a fill — it is a shadow layer, not a brand color

## Elevation

- **Sticker Button / Emphasis Link:** `rgb(107, 18, 41) 5px 5px 0px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background and most card surfaces — the white subway tile
- **Recessed** (`#efefef`) — Subtle alt-surface for bordered cards and section dividers
- **Ink** (`#000000`) — Top navigation bar and occasional dark bands
- **Apothecary Green** (`#113722`) — Primary CTA buttons and footer band
- **Crimson Plate** (`#6b1229`) — Hard-offset shadow layer beneath emphasized elements

## Imagery

Product photography is the sole imagery type. Bottles are shot from directly above, arranged in a strict grid on white subway-tile with visible dark grout lines — the tile surface and grout are part of the composition. Treatment is flat, high-key, no lifestyle context, no people, no props beyond the bottles themselves. Photography is overlaid with a dark scrim in the hero so the white uppercase headline can sit on top at full opacity. Category tiles reuse the same top-down grid aesthetic at full bleed, with a single white uppercase label floating over the image. No illustration, no 3D, no icons beyond simple outlined badges.

## Layout

Full-bleed page with no centered max-width constraint on the hero, marquee, or footer — those sections stretch to the viewport. Content blocks below the hero sit inside a 1200px max-width container. The hero is a full-bleed photo with centered text overlay. Below it, a single horizontal marquee bar spans the page. Then a 3-column equal-width grid of category tile cards with hairline dividers between cells, each tile filling its column. The footer is a full-bleed dark-green band. Navigation is a fixed top bar in black with a 3-zone layout (logo left, links center, cart right). Density is comfortable — generous breathing room between marquee, grid, and footer, with 40-60px section gaps.

## Similar Brands

- **Joe & The Juice** — Same bold uppercase Helvetica signage voice over flat product photography, with a dark single-accent CTA approach for an organic juice bar brand
- **Pressed Juicery** — Clinical white-tile product staging with full-bleed bottle photography and a deep botanical green as the action color
- **Glossier** — Brutalist grid structure where hairlines and frame borders organize the page like a tiled wall, with serif-free type shouting at full weight
- **Sweetgreen** — All-caps tracked navigation and marquee patterns over clean product photography, with a single dark green carrying the brand through CTAs and footer
