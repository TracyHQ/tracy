# Filling Pieces — Style Reference
> monochrome fashion editorial

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Filling Pieces operates as a monochrome fashion editorial: the entire interface is grayscale, so the brand voice lives in photography and type, not color. A single custom sans-serif (favorit, weights 400/600) carries every label, headline, and product name, with a fixed -0.04em tracking that compresses every glyph into a tight editorial lockup. The 100px display weight is the hero's only punctuation — it is enormous, sitting directly over full-bleed photography with no overlay card or gradient. Surfaces stay warm and flat: hairline #e5e7eb borders at 1px, no shadows, no gradients, an 8px radius applied uniformly to inputs and buttons. Product cards are flat on a warm-gray canvas; the grid reads like a magazine spread, not a typical ecommerce tile wall. Every element earns its presence by being quiet.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Body text, icons, primary action button fill, footer ink — the only chromatic-feeling value, used at maximum contrast for all interactive affordances |
| Paper White | `#ffffff` | Primary surface for cards, input fields, product tiles, and modal backgrounds; white text on dark photographic hero backgrounds |
| Hairline Gray | `#e5e7eb` | 1px borders, dividers, input outlines, card edges — the structural skeleton that separates every surface |
| Stone | `#efefef` | Secondary surface behind product grids, checkout bands, and footer — the warm neutral that lifts the page off pure white |
| Driftwood | `#bfbfbf` | Canvas/background tone for editorial sections and product category walls — warm enough to distinguish from clinical white |
| Slate | `#6b7280` | Input border accent, muted helper text, inactive form controls |
| Ink Wash | `#241f20` | Near-black text alternative with a warm undertone — used where pure #000000 reads too cold against the warm-gray canvas |

## Typography

### favorit — Single typeface for everything. Weight 400 for body, nav, and editorial captions; weight 600 for buttons, product names, and navigation labels. The custom ss04 alternate character set is part of the brand identity — it must be enabled.
- **Substitute:** Söhne or Inter (close geometric sans-serifs with tight tracking); General Sans as a free alternative
- **Weights:** 400, 600
- **Sizes:** 8px, 10px, 11px, 12px, 14px, 16px, 18px, 35px, 50px, 100px
- **Line height:** 0.90–1.78
- **Letter spacing:** -0.04em (applied uniformly across all sizes — the negative tracking compresses the type into an editorial lockup at every scale)
- **OpenType features:** `"ss04" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.5 | -0.04px |
| subheading | — | — | 18px | 1.5 | -0.04px |
| heading-sm | — | — | 35px | 1.2 | -0.04px |
| heading | — | — | 50px | 1 | -0.04px |
| display | — | — | 100px | 0.9 | -0.04px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 8px
- **modals:** 0px
- **buttons:** 8px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Full-width flat bar on #ffffff, no shadow, 1px #e5e7eb bottom border. Left: brand wordmark in favorit 400, 16px, #000000. Center: horizontal links (Men, Women, Our World, Rewards) in favorit 400, 12–14px, #000000, 32px gap. Right: utility icons (Search, Login, Wishlist, Bag with count) in favorit 400, 12px, #000000, 24–32px gap. Height ~60px. No background fill, no sticky behavior beyond scroll.

### Announcement Bar
**Role:** Site-wide promotional strip

1px #e5e7eb top + bottom border, ~32px height, centered favorit 400 11–12px text in #000000, letter-spacing -0.04em. Warm-neutral background or white. Used for loyalty point messaging.

### Primary Button (Black Filled)
**Role:** Primary call-to-action across the site

Background #000000, text #ffffff, favorit 400, 14px, letter-spacing -0.04em, uppercase or sentence case. Border-radius 8px. Padding 12px 32px. No shadow, no hover color change beyond subtle darkening. Used for DISCOVER NOW, NEXT, and checkout actions.

### Ghost Button (Dark Outline)
**Role:** Secondary editorial CTA over photography

Transparent background, 1px border in #ffffff or #000000 depending on surface. Text in #ffffff over dark hero, #000000 over light. Border-radius 8px. Padding 12px 32px. favorit 400, 14px. Used for DISCOVER overlays on editorial image blocks.

### Product Card
**Role:** Product grid item

Flat card on warm-gray canvas (#bfbfbf). No border, no shadow, no radius. Product image fills the card at ~1:1.2 aspect ratio. Top-left: small uppercase category tag in favorit 400, 10–11px, #000000 (e.g. 'POPULAIR', 'NEW', 'BESTSELLER'). Top-right: wishlist heart icon, 16px, #000000. Below image: product name in favorit 400, 14px, #000000, followed by price in favorit 400, 14px, #000000 on its own line. No card padding between image and text.

### Hero Display Block
**Role:** Full-bleed editorial hero with overlaid text

Full-viewport photographic background, dark-toned. White display text in favorit 400, 100px, line-height 0.90, letter-spacing -0.04em, centered. Subhead in favorit 400, 16–18px, #ffffff, centered below. Ghost-button CTA (white border, white text) centered below subhead. No overlay scrim, no gradient — the image is the atmosphere.

### Editorial Split Section
**Role:** Two-column lifestyle/editorial block

Two equal-width columns side by side, each containing a full-bleed photographic image with text overlaid. Category label in favorit 400, 35–50px, #ffffff, positioned lower-left. Ghost-button CTA (white border) above the label or in the center. No border between columns, no padding — images touch edge to edge.

### Email Capture Input
**Role:** Newsletter and form input field

Background #ffffff, 1px border in #6b7280 (focus state shifts to #000000). Border-radius 8px. Padding 12px 16px. Placeholder text in favorit 400, 14px, #6b7280. Input text in favorit 400, 14px, #000000. Full-width within its container.

### Category Tag (Product Badge)
**Role:** Small status label on product cards

No background, no border. Uppercase favorit 400, 10–11px, #000000, letter-spacing -0.04em. Positioned top-left of product image. Labels: POPULAIR, NEW, BESTSELLER, BESTSELLIJER.

### Language Selector
**Role:** Locale switcher in header

Inline text link with flag icon + country name in favorit 400, 12px, #000000, followed by dropdown caret. No border, no background. Dropdown opens a simple list of language options.

### Wishlist Heart Icon
**Role:** Product save toggle

16–20px outline heart icon, stroke #000000, no fill. Positioned top-right corner of product card. No background, no badge. Fills to #000000 on active state.

### Modal Overlay (Newsletter Popup)
**Role:** Email capture overlay

Centered white card on semi-transparent black backdrop (rgba(0,0,0,0.5)). Card: #ffffff background, 0px radius, 24–32px padding. Close (×) button in top-right corner, 16px, #000000. Headline in favorit 400, 24–35px, #000000. Email input + primary black filled button stacked. No shadow on the card itself.

### Footer
**Role:** Site-wide footer

Background #000000 or #ffffff depending on section. White text on black or black text on white. Multi-column link lists in favorit 400, 12px, -0.04em. 1px #e5e7eb divider lines between sections. No large logo, no social icons in color.

## Do's and Don'ts

### Do
- Apply -0.04em letter-spacing and `"ss04"` font-feature-settings to every text element using favorit — the tracking is what makes the type feel editorial
- Use 1px #e5e7eb borders for all separators, input outlines, and card edges; never use thicker borders or colored dividers
- Use 8px border-radius for all inputs and buttons; use 0px for cards, modals, and tags — the contrast between rounded controls and flat surfaces is a signature
- Reserve the 100px display size for hero headlines only; pair it with line-height 0.90 to make the type fill the frame edge-to-edge
- Let full-bleed photography be the background; lay white text and ghost buttons directly on the image with no scrim, gradient, or overlay card
- Use #000000 for all primary action button fills and body text; use #ffffff only for card surfaces and text on dark imagery
- Keep the entire palette achromatic — the brand is grayscale by intent, and any chromatic color introduced will read as an error

### Don't
- Don't introduce any color outside the achromatic scale — no blues, greens, reds, or brand accents; 1% colorfulness is the system ceiling
- Don't add box-shadows to cards, modals, or buttons — the design is deliberately flat and uses surface tone contrast for depth
- Don't use border-radius values other than 8px (inputs/buttons) or 0px (everything else) — the data shows no other radii exist
- Don't use font weights outside 400 and 600 — no bold, no light, no black weights; favorit exists in exactly these two voices
- Don't use a second typeface — favorit is the only font in the system, including for icons, badges, and buttons
- Don't use decorative gradients, scrims, or overlay tints over hero photography — the image is meant to breathe through the text
- Don't use colored icon fills or multi-color iconography — all icons are stroke-only in #000000 or #ffffff, single-color

## Elevation

The design is deliberately shadowless. Depth is created through surface tonal contrast (#bfbfbf → #efefef → #ffffff) and hairline 1px borders in #e5e7eb, not through box-shadow elevation. This keeps the interface flat and editorial — products and photography sit flush against the canvas without floating.

## Surfaces

- **Canvas** (`#bfbfbf`) — Warm-gray page background visible behind product grids and editorial sections
- **Surface** (`#efefef`) — Secondary surface for checkout bands, footer, and content dividers
- **Card** (`#ffffff`) — Product cards, modal popups, input fields, and all raised content
- **Photographic Overlay** (`#000000`) — Full-bleed editorial and hero images with white text laid directly on top

## Imagery

Photography is the entire brand. Full-bleed editorial images dominate every section — hero blocks, product backgrounds, and split editorial panels are all unmasked photographs. The imagery is warm-toned, slightly desaturated, and lifestyle-oriented: people in motion within real environments (Brazil, urban settings, natural light). Product photography is clean and centered on warm-gray or white backgrounds with no lifestyle context — the object stands alone. No illustrations, no 3D renders, no abstract graphics. Icons are outline-only, single-color, 1–1.5px stroke weight, never filled. The ratio of imagery to UI chrome is roughly 80/20 — the interface recedes so the photography can speak.

## Layout

Full-width page model with no centered max-width container — sections bleed edge to edge. Hero is a full-viewport photographic image with centered overlay text and a single ghost CTA. Product grid is a 4–5 column flat card row, no gutters between cards, sitting on a warm-gray (#bfbfbf) canvas. Editorial sections alternate as two-column splits (50/50) with full-bleed images and overlaid text. Vertical rhythm uses 40px section gaps with no visible dividers between sections — the flow is seamless. Navigation is a single flat top bar, not sticky. No sidebar, no mega-menu. Content density is generous and breathing — each product or editorial image gets full room to dominate.

## Similar Brands

- **Acne Studios** — Same monochrome-only palette, custom sans-serif identity, and full-bleed editorial photography as the primary layout device
- **COS** — Identical approach to warm-gray canvas (#bfbfbf-range) with flat product cards, hairline 1px borders, and zero shadow elevation
- **Mr Porter** — Same magazine-spread product grid with uppercase category tags, wishlist hearts, and editorial text-over-photography section blocks
- **The Row** — Same restrained luxury language: single typeface, tight tracking, achromatic surfaces, and photography that does all the brand work
- **Needles** — Same tight -0.04em tracking discipline and editorial oversized display headlines over unmasked lifestyle photography
