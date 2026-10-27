# Gumroad — Style Reference
> Pink coin on a cream sketchbook. Warm off-white canvas, inky geometric type, and a single hot-pink coin mascot stamped across every page like a sticker on a notebook.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Gumroad is a warm-cream canvas stamped with a single hand-drawn pink coin motif and an inky geometric sans. The off-white #f4f4f0 background feels like a sketchbook page; black type and black filled buttons land on it with the weight of a marker stroke. Surfaces stay flat — white cards sit on the warm canvas with thin gray hairline borders rather than shadows. Saturated color appears in small, deliberate punctuation: a pink coin mascot, yellow and green accent swatches used as inline color markers, and the occasional red highlight. The tone is informal, creator-first, anti-corporate — typography is tight, tracking pulls negative on display sizes, and the type scale stretches from 14px body up to 192px hero type, all from one family. Components are utility-shaped (4px radii on inputs and buttons, 16–24px on larger cards) and never decorated with gradients or glow.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Cream | `#f4f4f0` | Page background, input fills, and the warm base layer every other surface sits on |
| Paper White | `#ffffff` | Card and product-tile surfaces elevated above the cream canvas |
| Ink Black | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Graphite | `#242423` | Secondary text and input borders; reads as a softened black when true black would feel too harsh against cream |
| Hairline | `#d1d5dc` | Card and button borders, dividers, and ghost-button outlines |
| Coin Pink | `#ff90e8` | Brand mascot coin fills, decorative accents, and the single chromatic signature of the product |
| Highlight Yellow | `#ffc900` | Accent swatches and small punctuation marks — never backgrounds of full components |
| Highlight Lime | `#f1f333` | Accent swatches used alongside yellow as a paired color-marker system |
| Highlight Vermillion | `#dc341e` | Accent swatch for the third color in the marker trio; reserved for emphasis only |

## Typography

### ABC Favorit — The sole type family across the system — used for headings, body, buttons, inputs, and even icons. Weights split into 400 (body/UI), 500 (emphasis, prices, nav), 700 (display and oversized marketing type). Letter-spacing pulls negative on every step above 24px, reaching -0.029em at 192px, which tightens the geometric forms into a confident, almost stencil-like display voice. The stylistic alternates ss04 and ss11 are always on and shape the personality of every glyph.
- **Substitute:** Inter (closest freely available geometric grotesque with similar apertures) or General Sans
- **Weights:** 400, 500, 700
- **Sizes:** 14, 16, 18, 20, 24, 30, 36, 48, 72, 96, 192
- **Line height:** 1.20 (body), 0.90–1.00 (display)
- **Letter spacing:** Tracking is negative on every step: -0.0020em at 14px, -0.0040em at 16px, -0.0060em at 18px, -0.0080em at 20px, -0.0110em at 24px, -0.0130em at 30px, -0.0170em at 36px, -0.0200em at 48px, -0.0220em at 72px, -0.0250em at 96px, -0.0290em at 192px
- **OpenType features:** `"ss04" on, "ss11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.028px |
| body-sm | — | — | 16px | 1.5 | -0.064px |
| body | — | — | 18px | 1.56 | -0.108px |
| subheading | — | — | 24px | 1.33 | -0.264px |
| heading-sm | — | — | 30px | 1.38 | -0.39px |
| heading | — | — | 36px | 1.4 | -0.612px |
| heading-lg | — | — | 48px | 1.25 | -0.96px |
| display | — | — | 96px | 1 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40-48px
- **Card padding:** 24-32px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 16px
- **tiles:** 24px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Filled Black Button
**Role:** Primary action — the only solid-color button in the system

#000000 background, #ffffff text in ABC Favorit 16px / 500, 4px radius, 12px 24px padding, no border. Used for the main CTA on each page (e.g. 'Start selling'). Text is the only white element allowed to sit on black; never put a colored fill behind it.

### Ghost Outline Button
**Role:** Secondary action paired next to the filled black button

Transparent background on the cream canvas, #000000 text in 16px / 500, 1px border in #d1d5dc, 4px radius, 12px 24px padding. Reads as the soft counterpart to the black filled button.

### Search Input
**Role:** Marketplace search field embedded inline in the hero

#ffffff background, 1px #d1d5dc border, 4px radius, 12px 16px padding. Placeholder in #242423 at 16px / 400. Trailing search icon button is a square 40×40 inset in the same border color.

### Nav Pill (Active)
**Role:** Currently selected top-nav item

#000000 pill with #ffffff text in 14px / 500, full-radius (9999px), 6px 12px padding. Sits inline with the regular text-nav links to mark the active page.

### Stat Badge
**Role:** Inline social-proof chip — the '8.9K ★' marker beside the wordmark

#ffffff background, 1px #000000 border, full-radius (9999px), 4px 8px padding. Text in ABC Favorit 14px / 500 in #000000. Star icon inline.

### Product Tile Card
**Role:** White card showing a creator's product preview in the marketplace

#ffffff background, 1px #d1d5dc border, 16px radius, no shadow. Internal layout: 12px row gap between thumbnail image, title (ABC Favorit 18px / 500), and price (ABC Favorit 16px / 500 in #000000). Tile sits on the cream canvas with 32px gap between siblings in a grid.

### Feature Card
**Role:** Larger content block used in feature sections like 'Sell anything' and 'Make your own road'

#ffffff background, 1px #d1d5dc border, 24px radius, 32–40px internal padding. Heading at ABC Favorit 30–36px / 500 in #000000, optional supporting copy at 16px / 400 in #242423. Generous breathing room — no shadows, only the hairline border to define the edge.

### Phone Mockup Frame
**Role:** Decorative device frame that holds a product screenshot inside feature cards

Outlined phone illustration in #242423 stroke, white screen, 16px radius on the device, content (a small product card) inset with 8px padding. Always rendered as a flat illustration, never a photo.

### Pink Coin Mascot
**Role:** Signature decorative element scattered across hero and feature sections

Flat hot-pink #ff90e8 ellipse with a 1px #000000 stroke, 45° tilt, centered black 'G' set in ABC Favorit 700. Used at 60–160px sizes; always floating, never as a clickable element.

### Color Marker Swatch
**Role:** Tiny inline color chip used as a decorative period or bullet

Small 8–12px square or circle in #ffc900, #f1f333, #dc341, or #ff90e8. Placed inline with text as a playful replacement for a dot or comma. Never carries information on its own.

### Footer Link
**Role:** Low-weight secondary navigation

ABC Favorit 14px / 400 in #242423, no underline, 8px vertical gap between siblings. Hover state lifts to #000000.

## Do's and Don'ts

### Do
- Use ABC Favorit with 'ss04' and 'ss11' feature settings on at all times — these alternates are part of the brand voice.
- Set the page background to #f4f4f0 and every card surface to #ffffff with a 1px #d1d5dc border; never use shadows to separate layers.
- Make the primary action a solid #000000 button with white text at 4px radius — the only filled button in the system.
- Keep all display type from 30px upward with negative letter-spacing reaching -2.4px at 96px; tracking is part of the aesthetic.
- Use the pink coin (#ff90e8) only as the mascot and as one item in the yellow / lime / vermillion / pink marker palette; never as a button background.
- Pad section blocks with 40–48px vertical rhythm and 12–16px between UI elements; use 58px horizontal page padding on hero areas.
- Round cards at 16px (product tiles) or 24px (feature cards) and round buttons, inputs, and nav pills at 4px or 9999px — never an intermediate value.

### Don't
- Don't add box-shadows to cards, buttons, or navigation; the system expresses depth with hairline #d1d5dc borders only.
- Don't introduce gradients — the palette is fully flat; color appears as solid fills only.
- Don't use blue, purple, or any hue outside the cream / black / pink / yellow / lime / vermillion set.
- Don't create a colored CTA — black is the only filled button color; secondary actions are ghost-outlined in #d1d5dc.
- Don't set body text below 14px or use anything other than ABC Favorit (or its substitute) for the entire interface.
- Don't set the canvas to pure #ffffff; the warm #f4f4f0 cream is what makes the system feel like a sketchbook rather than a blank app shell.
- Don't use the accent colors (#ffc900, #f1f333, #dc341e) as full backgrounds of components — they live only as small swatches and inline punctuation.

## Surfaces

- **Canvas** (`#f4f4f0`) — Page-level warm off-white base that all sections sit on
- **Card** (`#ffffff`) — Product tiles, feature cards, and content blocks lifted off the canvas
- **Filled Action** (`#000000`) — The only solid black surface — primary CTA buttons and the active nav pill

## Imagery

Illustration-driven, not photographic. The dominant visual motif is a flat hot-pink (#ff90e8) coin with a black 'G' and a thin black outline, scattered at multiple sizes and 45° tilts as a mascot. Secondary visuals are flat product mockups rendered inside a black-outlined phone frame sitting on a white screen. The illustration style is hand-drawn and slightly wobbly — line work is 1–2px black strokes, fills are flat, no gradients or shading. Icons are inline 1px black line glyphs drawn in the same stroke language. Photography is absent; the system relies on creator-product screenshots and vector coin/phone illustrations to carry visual interest.

## Layout

Max-width 1200px centered content with full-bleed cream #f4f4f0 background. Hero is a single centered column — oversized 72–96px headline, a 1–2 line subhead, then a horizontal row containing a black filled CTA plus a white-outlined search input side by side, followed by a small 'Contribute on GitHub' helper line. The mascot coins float as absolute-positioned decorative elements in the hero corners at 45° tilts, breaking the centered alignment. Below the hero, the page flows into a 2-column or 3-column card grid for product tiles and feature blocks, with alternating white card surfaces on the cream canvas separated by 40–48px vertical gaps. The top navigation is a single horizontal bar with the wordmark on the left, text links centered, and 'Log in' plus a black 'Start selling' CTA on the right; an active nav link is marked by a black filled pill behind white text. Sections never alternate dark/light — the whole page stays on cream with white cards.

## Similar Brands

- **Substack** — Same off-white canvas, oversized single-family geometric sans for headlines, and a single accent-orange CTA — the anti-corporate creator-platform look.
- **Buy Me a Coffee** — Same warm cream background, flat illustration mascots, informal tone, and a high-contrast black filled CTA anchoring the hero.
- **Kofi / Gumroad competitor set** — Shared creator-economy visual language: hairline-bordered cards, 4px-radius controls, and zero box-shadow depth.
- **Carrd** — Same single-typeface system, tight negative tracking on display, and ultra-flat card surfaces with hairline borders.
