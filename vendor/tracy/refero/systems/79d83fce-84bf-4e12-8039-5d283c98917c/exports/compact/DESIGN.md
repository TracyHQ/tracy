# Allbirds — Style Reference
> Natural materials on white linen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Allbirds runs on quiet, natural confidence — a near-totally achromatic canvas punctuated by warm sand (#e0dacf) and muted earth tones lifted directly from the product photography. The UI stays out of the product's way: white surfaces, hairline borders, uppercase tracking-heavy nav, and pill-shaped controls that feel like physical buttons rather than web elements. Self Modern (a custom serif) is reserved for the few moments of editorial weight — hero headlines and collection names — while Geograph carries every label, body line, and button at three disciplined weights. Category cards become the color system: each one takes its background swatch from the product it features, turning the navigation into a living Pantone deck.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas White | `#ffffff` | Page backgrounds, card surfaces, product card backgrounds |
| Charcoal | `#212121` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| True Black | `#000000` | Headlines, icons, high-contrast borders, nav text |
| Warm Sand | `#e0dacf` | Hero section background, secondary surface tone, large editorial panels |
| Olive Char | `#222519` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Iron Gray | `#525252` | Secondary text, helper copy, subtle borders |
| Stone | `#737373` | Muted borders, disabled dividers, footer separators |
| Slate Border | `#6a6767` | Outlined button border color |
| Oat Milk | `#ece9e2` | Tertiary surface, subtle nav tint, warm off-white alt background |
| Mist | `#bdbab5` | Soft shadow tone for elevated elements |

## Typography

### Self Modern — Display headlines and editorial copy — used sparingly for hero statements and collection titles. The serif italic-leaning forms break the sans-serif monotony and signal 'this is the story'.
- **Substitute:** Playfair Display, DM Serif Display, Cormorant Garamond
- **Weights:** 400
- **Sizes:** 18px, 40px
- **Line height:** 1.00, 1.20, 1.50, 1.78
- **Letter spacing:** normal

### Geograph — The workhorse UI typeface — body copy, nav labels, buttons, product titles, footers, inputs, badges. 500 for emphasized labels, 700 for product names. Wide letter-spacing (0.025em–0.10em) on uppercase nav and category labels gives the brand its editorial cadence.
- **Substitute:** Inter, Söhne, GT America, Neue Haas Grotesk
- **Weights:** 400, 500, 700
- **Sizes:** 12px, 14px, 16px, 20px, 24px
- **Line height:** 1.00, 1.25, 1.33, 1.40, 1.43, 1.50, 1.67
- **Letter spacing:** 0.025em at 12–14px, 0.05em at 16px, 0.10em on uppercase nav labels

### HurmeGeometricSans3 — Rarely used — a fallback or specialized button label variant. Geograph carries the system day-to-day.
- **Substitute:** Inter, Söhne
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.14

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.25 | 0.3px |
| body-sm | — | — | 14px | 1.43 | 0.35px |
| body | — | — | 16px | 1.5 | 0.8px |
| subheading | — | — | 20px | 1.4 | 1px |
| heading-sm | — | — | 24px | 1.33 | 1.2px |
| heading | — | — | 40px | 1.2 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 40-56px
- **Card padding:** 32-40px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 12px
- **cards:** 16px
- **inputs:** 4px
- **buttons:** 9999px (pill)
- **large-surfaces:** 20-24px

## Components

### Pill Button (Primary)
**Role:** Primary action trigger — Shop Men, Shop Women, Shop Now

Fully rounded pill (9999px radius), 14px Geograph 500, uppercase, letter-spacing 0.10em, 12px vertical / 24px horizontal padding, background #ffffff on hero or #212121 on dark contexts, text in opposite tone. No shadow, no border.

### Pill Button (Dark Surface)
**Role:** CTA on light or sand backgrounds

Same pill geometry, fill #212121 or #222519, text #ffffff. Used on warm sand hero where the dark pill creates the only strong contrast point on the page.

### Category Color Card
**Role:** Navigation entry for a product collection

4-column grid, each card is a full-bleed image of one shoe centered on a solid muted color swatch (dusty blue, warm brown, dusty rose, sage). Category label sits in a small white pill with black text and 0.10em tracking at the upper-left of the shoe. No card shadow — the swatch IS the card.

### Product Detail Card
**Role:** PDP or collection grid entry

White (#ffffff) surface, shoe image centered, no visible border. Product name in Geograph 700 at 16px, price below in Geograph 400 at 14px in #525252. 16px radius on the image container or card edge.

### Editorial Hero Panel
**Role:** Top-of-page story section

Full-width band on #e0dacf warm sand. Headline in Self Modern 400 at 40px, white. Eyebrow text in Geograph 500 uppercase at 12px with 0.10em tracking above headline. No gradient, no shadow — flat editorial block.

### Split Lifestyle + Product Block
**Role:** Brand storytelling section below hero

Two-column: left = full-bleed lifestyle photo with overlaid Self Modern headline and a Shop Now pill; right = large square product swatch panel showing the shoe on a matching muted color background with a small PANTONE swatch card overlay. The color-on-color pairing is the signature move.

### Top Navigation Bar
**Role:** Primary site navigation

White #ffffff, 12px bottom padding, logo left (Geograph 700 20px), nav center (MEN / WOMEN / SALE in Geograph 500 uppercase 12px, 0.10em tracking, 32px horizontal padding between items), utility icons + account/return links right in Geograph 400 14px. Hairline #e0dacf or transparent border at bottom.

### Free Shipping Announcement Bar
**Role:** Top-most utility strip

Full-bleed #212121 black bar, white text Geograph 400 12px, centered, 8px vertical padding. Always-on, never styled — functional, not decorative.

### Badge / Tag (NEW COLOR, PANTONE COLOR)
**Role:** Product annotation chip

Inline label, Geograph 500 12px uppercase with 0.10em tracking, no fill, no border, just text on the product card. Sits in the upper-left of the card in #212121. Zero chrome.

### Inset-Border Input
**Role:** Newsletter or search field

4px radius, white fill, 1px inset border via box-shadow stack: inset rgb(87,87,87) 0 0 0 1px + rgb(0,0,0) 0 0 0 1px. Placeholder in #525252, 14px Geograph 400. Flat, tactile, no floating label.

### Carousel Arrow Button
**Role:** Navigation for product carousels

Circular outline button (~32px), 1px border in #212121, chevron icon centered, white fill. Used for the New Arrivals carousel arrows.

### Section Title with Underline
**Role:** Centered Geograph 700 16px uppercase, 0.10em tracking, with a short 1px black underline beneath the text (24-40px wide). Minimal period punctuation or dot separator.

Centered Geograph 700 16px uppercase, 0.10em tracking, with a short 1px black underline beneath the text (24-40px wide). Minimal period punctuation or dot separator.

### Footer
**Role:** Site footer

White or off-white #ece9e2 surface, multi-column link grid in Geograph 400 14px #525252, headings in Geograph 500 14px #212121, country/region selector and legal copy at the bottom in 12px. No social icons colored — all monochrome.

## Do's and Don'ts

### Do
- Use 9999px pill radius for every button, tag, and icon button — pill is the brand's signature control shape
- Pull hero and section backgrounds from the warm sand family (#e0dacf, #ece9e2) rather than neutral gray to keep the palette earth-toned
- Apply 0.10em letter-spacing on all uppercase labels (nav, badges, category pills) — tracking is the brand's typographic signature
- Reserve Self Modern for the one or two largest headlines per screen; let Geograph do everything else
- Use solid color swatches as full-bleed card backgrounds for category navigation — each category card IS its color story
- Maintain a 4px spacing base; prefer 8/16/32 increments for element gaps, 40-56px for section gaps
- Keep shadows to zero or near-zero — separation comes from color blocks and 1px borders, not elevation

### Don't
- Don't introduce saturated or chromatic brand colors — the system is intentionally near-achromatic, with color coming from product photography
- Don't use drop shadows on cards or buttons — Allbirds separates surfaces with flat color and hairline borders
- Don't mix multiple display fonts — Self Modern appears once or twice per page maximum, always at 40px+
- Don't use low-contrast grays for body text — body copy stays at #212121 or #525252 on white, never lighter
- Don't break the pill rule with square or rounded-rect buttons — every interactive control is fully rounded
- Don't use gradients on UI surfaces — the brand is flat color blocks, no gradient fills anywhere
- Don't add decorative icon colors or multicolor icon sets — icons stay mono in #212121 or #000000

## Elevation

Elevation is essentially absent. Surfaces are separated by flat color blocks, hairline 1px borders, or solid background swatch changes. The only shadow detected is an inset border stack on input fields — a tactile, not elevated, effect. Cards, buttons, and panels rest on the canvas with no shadow lift, reinforcing the brand's material-natural aesthetic where things sit flat like paper on a table.

## Surfaces

- **Canvas** (`#ffffff`) — Page background, footer, card surfaces, product card background
- **Warm Sand** (`#e0dacf`) — Hero section background, editorial full-bleed bands, product swatch panels
- **Oat Milk** (`#ece9e2`) — Tertiary surface, subtle nav tint, warm off-white alt background
- **Charcoal Surface** (`#212121`) — Dark mode-adjacent surface for announcement bar, dark CTA buttons, footer dark areas
- **Category Swatch** (`#d1b0a4`) — Category card background (warm rose tone for Women's etc.)

## Imagery

Photography is the entire visual system. All product shots are tightly cropped on the shoe at a slight angle, isolated on a solid color background that matches or complements the shoe's accent color — effectively turning each photo into a color study. Lifestyle photography is warm, sunlit, outdoor-natural (agave fields, wooden boardwalks, earthy terrain), slightly desaturated to match the muted palette. No illustrations, no 3D renders, no abstract graphics. The Pantone collaboration introduces a literal color swatch card as a graphic device. Iconography is minimal and monochrome (outlined stroke icons in nav and utility positions).

## Layout

Max-width ~1200px centered with generous side padding. The hero is a full-bleed editorial band on warm sand with a large product carousel fanning outward from center. Category navigation is a 4-column equal grid of solid color cards, each containing a single centered shoe. Below the fold, the layout alternates between full-bleed split panels (lifestyle photo left + product swatch right) and centered product carousels under a small underlined section title. The overall rhythm is: full-bleed editorial → 4-column grid → centered product carousel → 2-column split → centered product carousel. Spacing between sections is 40-56px, creating airy but not cavernous transitions. Navigation is a minimal sticky top bar with centered primary links.

## Similar Brands

- **Everlane** — Same near-achromatic UI with warm off-white backgrounds, editorial serif display headlines paired with clean sans-serif body, and pill-shaped minimal buttons that let the product photography carry all the color
- **Aesop** — Same restraint — warm sand and oat-milk neutrals, wide-tracked uppercase labels, serif display type used sparingly, zero shadows, and the product itself as the only source of color
- **Glossier** — Similar editorial confidence — white canvas, thin uppercase nav, serif display accents on otherwise sans-serif pages, and the product photography doing all chromatic heavy lifting
- **M.Gemi** — Same product-card-as-color-swatch approach — category cards use solid muted color blocks that extend the palette pulled from the shoes themselves
- **Cuyana** — Same warm-sand hero backgrounds, pill buttons, wide-tracked uppercase category labels, and the philosophy that the UI should disappear so the materials speak
