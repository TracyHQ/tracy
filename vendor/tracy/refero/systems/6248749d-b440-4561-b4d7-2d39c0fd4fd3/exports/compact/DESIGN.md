# Metamask — Style Reference
> Warm peach workshop with giant purple type — cozy, loud headlines, quiet controls.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

MetaMask's visual system is a warm, maximalist-on-type language built on a single signature cream-peach canvas (#fff1eb) that makes every page feel like an editorial spread. Display type does the heavy lifting: an ultra-condensed geometric face at 75–158px in deep violet carries authority through sheer scale rather than weight, while the rest of the interface stays compact and quiet. CTAs are small black pill buttons that sit against the warm canvas as a precise, high-contrast anchor. Color is used functionally as wash — green, pink, blue, and orange swatches paint cards and illustrations rather than chrome — leaving the chrome itself nearly monochrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Peach Cream | `#fff1eb` | Page canvas, hero backgrounds, dominant surface — the warm skin of the entire site |
| Ink Black | `#0a0a0a` | Primary text, pill CTA fill, nav icons, borders — near-black rather than pure #000 for slightly softer edges |
| Pure White | `#ffffff` | Card surfaces on cream sections, button labels, inverted text on black CTAs |
| Cool Mist | `#e9edf6` | Secondary surface, link/button hover washes, soft card backgrounds when a section needs visual cooling |
| Slate | `#393d46` | Muted body text, secondary headings, icon strokes — lifts information below the black primary |
| Hairline | `#c8ceda` | Borders, dividers, list-item separators on neutral surfaces |
| Deep Violet | `#3d065f` | Brand primary — display headlines, decorative strokes, key UI accents; saturated enough to dominate 158px type against the cream canvas |
| Midnight Plum | `#190066` | Headline emphasis, link text, dark card backgrounds — the second register of the violet system, used when Deep Violet needs a partner with more weight |
| Lime Wash | `#e5ffc3` | Accent card surface, decorative wash — fresh, spring-green that lights up product/feature blocks |
| Acid Lime | `#baf24a` | Saturated green highlight inside illustrations and graphic accents — punctuation color, never structural |
| Lilac Haze | `#eac2ff` | Soft pink-purple card wash, pastel type accent — gentle partner to Deep Violet |
| Orchid Pop | `#d075ff` | Saturated pink-purple for decorative shapes and graphic punctuation sitting over lilac or cream |
| Sky Wash | `#cce7ff` | Cool blue card surface — the cool counterweight to the warm canvas in feature blocks |
| Periwinkle | `#89b0ff` | Saturated blue highlight for icons and illustration fills |
| Apricot | `#ffa680` | Warm accent card surface — echoes the cream canvas but steps up in saturation for energy |
| Burnt Sienna | `#661800` | Dark warm accent for display text and decorative borders — the orange system's deep register |

## Typography

### MMPolyVariable — Display headlines only — ultra-condensed geometric face that carries page-level authority at 75–158px. The narrow proportions let 
- **Substitute:** Bebas Neue
- **Weights:** 400
- **Sizes:** 32px, 48px, 75px, 127px, 158px
- **Line height:** 1.0–1.25
- **Letter spacing:** -0.006em

### MMSansVariable — Secondary sans for sub-headlines and short labels that sit beneath the poly display — keeps the brand on one type system without competing with the hero. Substitute: Inter, Söhne, or General Sans.
- **Substitute:** Inter
- **Weights:** 400–600
- **Sizes:** 16px, 24px
- **Line height:** 1.0

### MMEuclidCircularB — Body, UI, nav, buttons, badges, inputs — the workhorse. Circular geometric forms keep a friendly counterpoint to the aggressive poly display. Weight 500 for nav, 700 for button labels, 400 for body. Tight line-height 0.80 used for badge micro-text. Substitute: DM Sans, Nunito, or Nunito Sans.
- **Substitute:** DM Sans
- **Weights:** 400, 500, 700
- **Sizes:** 8px, 12px, 13px, 14px, 15px, 16px, 24px
- **Line height:** 0.80–1.65

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 24px | 1.2 | 0px |
| heading-sm | — | — | 32px | 1.16 | -0.19px |
| heading | — | — | 48px | 1.1 | -0.29px |
| heading-lg | — | — | 75px | 1.1 | -0.45px |
| display | — | — | 127px | 1.05 | -0.76px |
| display-xl | — | — | 158px | 1 | -0.95px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 4px
- **cards:** 12px
- **pills:** 69px
- **small:** 4px
- **buttons:** 9999px

## Components

### Pill CTA Button
**Role:** Primary action — download/install entry points

Black fill (#0a0a0a), white text, 9999px radius (full pill), MMEuclidCircularB 14–15px weight 700, 11px vertical / 20px horizontal padding. Always uppercase or title-case short label. Acts as the single dark anchor on the warm cream canvas.

### Ghost Nav Button
**Role:** Secondary header control (menu toggle)

Transparent fill, #0a0a0a 1px border, 9999px radius, 40–48px square proportions. Hamburger icon centered. Sits to the right of the primary CTA in the header.

### Top Navigation Bar
**Role:** Global site navigation

Transparent over the cream canvas — no background fill, no border. Wordmark logo at left (

### Hero Display Block
**Role:** Above-the-fold page headline

Full-bleed cream (#fff1eb) section, centered text stack. MMPolyVariable at 127–158px weight 400, color #3d065f, line-height 1.0, three lines stacked tight. Subtext and pill CTA centered below with 24–32px gap.

### Feature Card (Accent Wash)
**Role:** Product/feature illustration container

Square or near-square card on cream canvas, filled with one accent color (Lime Wash, Lilac Haze, Apricot, or Sky Wash). 12px radius, 24px internal padding, 3D illustration or product mock centered. Deep Violet (#3d065f) display text overlays as 32–48px type that breaks the card edges.

### Phone Product Mockup Card
**Role:** In-context product showcase

Tall portrait card with a dark (#1a1a1a) phone-frame surface containing the wallet UI screenshot. Decorative purple/lilac shape fragments break out horizontally past the card edges, creating the signature \"shapes that escape their container\" effect.

### Side Floating Widget
**Role:** Persistent secondary nav/menu

Small vertical pill, #0a0a0a fill, fixed to the right edge of the viewport, ~12px wide × 80px tall, 9999px radius, 3 white dot indicators stacked vertically.

### Update Toast
**Role:** Dismissible system notification

Fixed bottom-left card, white (#ffffff) surface, #e9edf6 border, 12px radius, 16px padding. 

### Footer/Subnav
**Role:** Page-bottom navigation

Sits directly on the cream canvas — no background plate, no border-top divider. Horizontal list of text links at 14px weight 500 #393d46, 12–16px row-gap, left-aligned or centered.

### Link (Inline)
**Role:** Hyperlinks within body text

#190066 or #0a0a0a text, 1px underline offset 2px, MMEuclidCircularB 16px weight 500. No background change on hover — underline thickens or color shifts to Deep Violet.

### Badge/Pill Label
**Role:** Tag, status, small label

3px or 4px vertical padding, 8–10px horizontal padding, MMEuclidCircularB 12px weight 700, line-height 0.80, 9999px radius. Background is one of the accent washes (#eac2ff, #cce7ff, #baf24a), text is #0a0a0a.

## Do's and Don'ts

### Do
- Use MMPolyVariable at 75–158px weight 400 for display headlines, always in #3d065f or #190066 on the #fff1eb canvas
- Build CTAs as #0a0a0a pills with 9999px radius, 14px MMEuclidCircularB weight 700 white label, 11px/20px padding
- Set the page canvas to #fff1eb — never use pure white as a full-page background
- Rotate one accent wash per feature card (Lime Wash, Lilac Haze, Apricot, or Sky Wash) — pick one, not two
- Let decorative shapes break the card boundary — purple fragments extending past the card edge are a signature, not a bug
- Keep body text compact: MMEuclidCircularB 14–16px, line-height 1.5, #0a0a0a primary, #393d46 secondary
- Stack display type on 3 lines max with line-height 1.0–1.16; the headline IS the hero

### Don't
- Don't use MMPolyVariable below 32px — it becomes illegible and loses its identity
- Don't put the pill CTA in a chromatic color (no purple, no green pills) — the black pill IS the brand
- Don't add box-shadows to cards — the design relies on flat colored surfaces, not elevation
- Don't use pure #000000 for text or buttons — use #0a0a0a throughout
- Don't alternate between dark and light page sections — the entire site lives on the single #fff1eb canvas
- Don't mix more than two accent colors on one card surface — the rotation is one wash per block
- Don't center body paragraphs wider than 65ch or add a top border/drop-shadow to the navigation bar

## Elevation

The system intentionally avoids box-shadows. Elevation is communicated through the warm cream canvas (#fff1eb) receding behind white cards (#ffffff), which in turn sit behind accent-wash feature cards. Depth comes from color layering and scale, never from drop shadows. The single exception is the floating right-edge pill widget, which uses position alone (not shadow) to read as 'on top'.

## Surfaces

- **Peach Canvas** (`#fff1eb`) — Page-wide base — the signature warm cream that defines the entire site
- **White Card** (`#ffffff`) — Elevated cards and product surfaces that need to step off the warm canvas
- **Cool Mist** (`#e9edf6`) — Cooling secondary surface for links, chips, and hover states
- **Accent Wash** (`#e5ffc3`) — Vibrant card surface for feature/illustration blocks — one of several color washes rotated through

## Imagery

Imagery is treated as 3D rendered illustrations and stylized product mockups rather than photography. Character illustrations are soft, rounded, almost toy-like figures in pastel jackets set against vivid orange or cream backgrounds. Product surfaces (the phone mockup) are shown at life-size with deep black UI inside, dramatized by the contrast against the cream page. Decorative purple shape fragments frequently break out of their card boundaries, creating a collage/poster feel. The role is editorial-heroic — imagery IS the page, not supporting content. Photography is essentially absent; the brand speaks in illustration and display type.

## Layout

Full-bleed sections all sitting on the single #fff1eb cream canvas — no banded dark/light alternation. The hero is a centered display-type stack with a single CTA below; subsequent sections use an asymmetric collage of accent-colored cards and product mockups, not a regular grid. Decorative elements consistently break the grid (purple shapes extend past card edges, display type overlaps illustrations). The floating right-edge pill widget persists across sections. Navigation is a flat transparent top bar — no sticky backdrop, no shadow, no border. Content density is compact: small body text and tight paddings, but the massive display type at 127–158px makes individual sections feel enormous.

## Similar Brands

- **Linear** — Same single-canvas approach with one dominant neutral surface, compact type, and pill-shaped dark CTAs
- **Stripe** — Same custom geometric type system, warm off-white canvas, and accent-color washes behind feature content
- **Arc Browser** — Same maximalist display type at 100+ px, warm pastel canvas, and editorial poster-like page compositions
- **Figma Config** — Same playful 3D-illustration-on-pastel-wash approach with display type that breaks out of containers
- **Notion** — Same compact spacing, minimal chrome, and reliance on one or two accent colors to bring energy to an otherwise quiet interface
