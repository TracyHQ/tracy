# Subset — Style Reference
> editorial boutique on raw linen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Subset is an editorial intimates boutique rendered on warm raw linen rather than stark white. The page breathes through a muted earth palette — sage, dusty blue, blush, ember — with Founders Grotesk as the workhorse voice and a refined serif (TT Ramillas) reserved for editorial headlines. Product photography is the hero; the UI gets out of the way with hairline borders, minimal radii, and no decorative shadows. The signature moves: aggressive letter-spacing on uppercase labels (0.1–0.15em), generous cream canvas, and color used as quiet punctuation on borders, badges, and icons rather than as large filled blocks.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#241f20` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Raw Linen | `#f5f4ee` | Page canvas and card backgrounds — warm off-white, the signature surface that distinguishes this system from generic white SaaS |
| White | `#ffffff` | Elevated card surfaces, badge fills, inverse text on dark buttons |
| Fog | `#808080` | Muted helper text, secondary dividers, disabled labels |
| Blush | `#edcdc2` | Accent surface wash — hero image tint, product photo backdrop, soft highlight zones |
| Charcoal | `#26262a` | Darkest UI surface — footer dark bands, chat widget shell, overlaid panels |
| Sage Leaf | `#8bbd78` | Signature accent — top announcement bar, hairline decorative borders, icon strokes, functional green; the brand's quiet living color |
| Heritage Blue | `#6487ba` | Primary action — filled buttons, link underlines, selected states; dusty mid-blue carries trust without corporate coldness |
| Midnight Forest | `#233735` | Dark filled buttons (hero CTA), deep green-black for high-emphasis actions; warmer than charcoal, more sophisticated than black |
| Ember | `#ff965b` | NEW badges, notification dots, star ratings, cart count bubble — vivid warm orange used sparingly as functional punctuation |

## Typography

### FoundersGrotesk — Workhorse sans for navigation, product cards, badges, body text, buttons, inputs, icons. The 0.1–0.15em letter-spacing on 13–15px sizes is the signature tracking pattern for uppercase labels (NEW, ORGANIC COTTON, Shop Underwear).
- **Substitute:** Inter, Söhne, or DM Sans
- **Weights:** 400, 500, 700
- **Sizes:** 13, 14, 15, 16, 17, 18, 20, 24
- **Line height:** 1.20–1.63
- **Letter spacing:** 0.0180em, 0.0210em, 0.0240em, 0.0250em, 0.0270em, 0.0280em, 0.0300em, 0.0330em, 0.1000em, 0.1500em

### TTRamillas_Light — Editorial serif for hero headline, subhead, and body excerpts. Tight -0.01em tracking and low contrast strokes create a quiet, literary feel that contrasts the geometric sans.
- **Substitute:** Cormorant Garamond, Playfair Display, or Lora
- **Weights:** 400
- **Sizes:** 18, 20, 24, 32, 40, 42
- **Line height:** 1.00–1.53
- **Letter spacing:** -0.0100em

### GTStandard-M — Specialty text at 17px with 0.025em tracking — used for minimal secondary copy, not a primary face
- **Substitute:** Söhne or Inter at matching weight
- **Weights:** 400
- **Sizes:** 17
- **Line height:** 1.50
- **Letter spacing:** 0.0250em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | 0.1px |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.4 | -0.01px |
| heading-sm | — | — | 20px | 1.4 | 0.025px |
| heading | — | — | 24px | 1.2 | — |
| heading-lg | — | — | 32px | 1.24 | -0.01px |
| display | — | — | 42px | 1.29 | -0.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 0px
- **badges:** 2px
- **buttons:** 0px
- **swatches:** 9999px
- **chat-pill:** 9999px

## Components

### Dark Filled Button
**Role:** Primary call-to-action (hero, product detail, checkout)

Background #233735, text #ffffff, FoundersGrotesk 14px weight 500, letter-spacing 0.025em, uppercase. Padding 16px vertical / 24px horizontal. Radius 0px — sharp rectangle, no rounding. No shadow. This is the 'SHOP MOTHERS DAY' button.

### Outlined Action Button
**Role:** Secondary action or link-style button

Transparent background, 1px border #233735 or #6487ba, text matching border color. FoundersGrotesk 14px weight 500, 0.025em tracking, uppercase. Padding 14px / 20px. Radius 0px.

### Announcement Bar
**Role:** Site-wide top strip

Full-bleed #8bbd78 sage background. Centered text, FoundersGrotesk 13px weight 400, #241f20, letter-spacing 0.10em, uppercase. Padding 8px vertical. No border.

### Top Navigation
**Role:** Primary site navigation

Sits on Raw Linen canvas. Logo (SUBSET in serif) centered. Left: category links (Start Here, Underwear, Bras, Lounge, Mens) in FoundersGrotesk 14px weight 400, 0.025em tracking. Right: search icon, Fitting Room, Recycle, Account, and cart bubble (Ember #ff965b fill, white number). All items vertically aligned, no dividers.

### Hero Overlay Card
**Role:** Centered editorial card on full-width hero image

White #ffffff background, 0px radius, generous padding (~48px). Contains serif headline at 42px, subtext, dark filled CTA, and meta line. Sits over split editorial imagery (product on left, model on right) at ~60% page width, centered.

### Category Card
**Role:** 5-up category grid (Shop Underwear, Bras, Lounge, Men's, All)

Portrait-ratio image fills card top, no border, 0px radius. Label below image: FoundersGrotesk 20px weight 400, #241f20, 0.025em tracking. Product count subtext: 14px, #808080, 0.025em tracking. Full-bleed within column, no card background — image sits directly on Raw Linen.

### Product Card
**Role:** 3-up product grid items

Square product image on Raw Linen background, no border or radius. NEW badge (Ember fill, white text, 2px radius) positioned top-right of image. Below image: star rating (Ember stars) + review count in 13px #808080. ORGANIC COTTON label in 13px #241f20, 0.10em tracking, uppercase. Product name 16px #241f20 weight 500. Price in 16px #241f20. Color swatch row: 16px circles, current variant outlined in #241f20.

### New Badge
**Role:** Product freshness indicator

Background #ff965b Ember, text #ffffff, FoundersGrotesk 13px weight 500, 0.10em tracking, uppercase. Padding 4px / 8px. Radius 2px. Positioned top-right of product image.

### Press Strip
**Role:** Editorial social proof band below hero

Raw Linen background, full-width single row. Left-aligned quote in serif (TTRamillas 18px) + bold publication name in FoundersGrotesk 14px weight 700, uppercase, 0.025em tracking. Items separated by generous horizontal whitespace, no dividers. 4 items at ~25% width each.

### Color Swatch
**Role:** Product variant selector

16px diameter circle, #9999px radius. Border 1px #e0e0e0 default; current selection gets 1px #241f20 outer ring. No fill change between states — only border weight signals selection.

### Chat Widget
**Role:** Persistent bottom-left support trigger

Pill shape, 9999px radius. Dark circle icon (#241f20) + white pill (#ffffff) with 'Chat with us' text in FoundersGrotesk 14px weight 500, #241f20. Fixed bottom-left, 16px offset from edges.

### Cart Count Bubble
**Role:** Cart icon notification

Small circle in navigation, #ff965b Ember fill, white number at 12px weight 700. Diameter ~20px, positioned overlapping the cart icon.

## Do's and Don'ts

### Do
- Set all page backgrounds and section bands to #f5f4ee Raw Linen — never use pure white as a canvas
- Use #233735 Midnight Forest for primary filled buttons with #ffffff text at 14px FoundersGrotesk weight 500, 0.025em tracking, uppercase
- Apply 0.10em letter-spacing to all uppercase micro-labels (NEW, ORGANIC COTTON, navigation links) at 13–15px FoundersGrotesk
- Reserve #ff965b Ember exclusively for badges, star ratings, and the cart count bubble — never for large filled blocks
- Use #8bbd78 Sage Leaf for hairline decorative borders and icon strokes, not for filled backgrounds
- Keep component radii at 0px for cards, buttons, and product images; use 9999px only for the chat pill and color swatches
- Use TTRamillas serif at 32–42px for editorial headlines; switch to FoundersGrotesk for all UI text and product information

### Don't
- Don't use pure #000000 for text or button fills — use #241f20 Ink instead for warmth
- Don't apply border-radius larger than 2px to product cards, buttons, or product images — the sharp rectangular geometry is the signature
- Don't use the sage green #8bbd78 or blue #6487ba as large filled backgrounds — they are accent and action colors only
- Don't set tracking below 0.025em on FoundersGrotesk body or UI text at 14–18px — the wide tracking is intentional
- Don't use drop shadows or box-shadows on cards or buttons — the system is flat, separated only by hairline borders and surface color shifts
- Don't use the blush #edcdc2 for UI components — it's a photographic surface tone, not a UI fill
- Don't introduce a new chromatic color for hover or active states — deepen the existing color (e.g. #8bbd78 → #5b7763) rather than adding new hues

## Surfaces

- **Raw Linen** (`#f5f4ee`) — Base page canvas — all section backgrounds sit on this warm cream
- **White** (`#ffffff`) — Product cards, hero overlay card, badge fills — the only true-white surface
- **Blush** (`#edcdc2`) — Accent wash — soft highlight zones in hero and editorial imagery
- **Midnight Forest** (`#233735`) — Dark CTA surface — filled primary buttons, inverted panels

## Imagery

Large-scale editorial product and lifestyle photography dominates the visual language. Product shots are flat-lay on neutral surfaces (blush pink, raw linen), showing garments alone or in packaging with no lifestyle context. Hero imagery is split editorial: product-on-left, model-on-right, both warm-toned and softly lit. Category cards use full-bleed model portraits against neutral studio backdrops. No illustration, no 3D, no abstract graphics — photography is the only visual content and it occupies roughly 70% of the viewport on product-heavy pages. Stars in the rating system are the only graphic iconography; product imagery carries all the brand warmth.

## Layout

Max-width ~1280px centered, with the hero stretching full-bleed. The hero is a full-viewport editorial image with a centered white overlay card containing headline + CTA + meta. Below the hero, sections alternate between the Raw Linen canvas and product imagery, separated by generous 64px vertical gaps. The product grid is 3 columns; the category grid is 5 columns; the press strip is a 4-column single row of quotes. Navigation is a single horizontal bar with centered serif logo, left-aligned category links, and right-aligned account/cart cluster. The page rhythm is slow and editorial: large image blocks, then text, then image — never dense information stacking.

## Similar Brands

- **Everlane** — Same editorial product photography on warm neutral canvas, wide-tracked uppercase labels, serif headlines paired with geometric sans, and zero-shadow flat component design
- **Cuyana** — Shared warm cream canvas, restrained earth-tone palette, hairline borders, and the boutique-editorial feel where photography and whitespace replace decorative UI
- **Reformation** — Same full-bleed editorial hero, serif logo wordmark, warm neutral backgrounds, and product grids where images sit directly on canvas without card containers
- **Glossier** — Similar soft, warm light-mode aesthetic with muted accent colors used sparingly on a near-white canvas, and a flat component system without heavy shadows
