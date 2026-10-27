# SuperMush — Style Reference
> Sun-bleached skate ramp meets wellness billboard. Warm bone canvas, one electric blue action color, and full-bleed lifestyle photography that does the shouting.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

SuperMush runs on a sun-drenched DTC wellness playbook: a warm bone canvas, electric cobalt as the singular action color, and a tri-color accent system (cobalt, ember orange, volt lime) that shouts without cluttering. Layout breathes between quiet white product grids and explosive full-bleed lifestyle photography, with colored bands — a lime promo bar up top, an orange retailer strip in the middle — acting as visual exclamation points. Typography is geometric and confident, leaning on tight line-heights at large sizes so headlines feel like stickers slapped onto the page rather than typed paragraphs. Components are flat and pill-shaped; the 50px button radius and near-total absence of shadows produce a tactile, high-energy feel that mirrors the packaging itself, and the orange product body color is allowed to bleed into the brand skin (retailer bar, sale flags) without ever crossing into button territory.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Cobalt | `#2f59f8` | Primary action fills, active nav links, icon accents, link underlines. The only chromatic button color in the system — cobalt against the warm bone canvas makes every CTA feel switched on |
| Ember Orange | `#ff632a` | Orange outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Volt Lime | `#eaff00` | Promotional and urgency surfaces: top sale bar, Subscribe & Save tags, sale-bubble accents on product cards. Reads as a highlighter against the warm canvas — use sparingly, never as a section background |
| Obsidian | `#000000` | Primary text, hairline borders, logo, icon strokes. The structural backbone — used aggressively for borders and dividers rather than reserving it for text alone |
| Bone | `#f5f4f1` | Page canvas and quiet section backgrounds. Warm off-white that gives the system its sunlit feel; never pure white at the page level |
| Paper | `#ffffff` | Elevated card surfaces, input fields, and any element that needs to sit forward of the bone canvas. Always a surface, never a text color |
| Concrete | `#eeeeee` | Soft borders, dividers, and secondary surface fills. Quieter than Obsidian when a hairline needs to recede |
| Ash | `#707170` | Muted helper text, secondary metadata, star-rating inactive state, and low-emphasis form labels |
| Graphite | `#171717` | Slightly softened near-black for headings and dark UI surfaces where pure Obsidian feels too aggressive; button hover states on dark |
| Mist | `#e3e3e3` | Faint borders and disabled input outlines — one step lighter than Concrete for tertiary edges |
| Pebble | `#d9d9d9` | Disabled button background, out-of-stock product card state. The only neutral allowed to function as an action fill, and only for disabled |

## Typography

### Founders Grotesk — Primary typeface for body, headings, and product copy. Used across nearly every context — body, nav, hero, card, button, footer, heading. The geometric grotesque carries the brand voice: tight line-heights at large sizes (1.04–1.17 above 32px) make headlines feel like block letters slapped on the page rather than flowing paragraphs.
- **Substitute:** Inter, Söhne, or Aktiv Grotesk
- **Weights:** 400, 500, 700
- **Sizes:** 12, 14, 16, 17, 18, 20, 32, 34, 36, 40, 43, 48
- **Line height:** 1.00–1.67 depending on size

### GT Planar — Secondary typeface for fine print, sale tags, form labels, and dense UI metadata in the 10–14px range. A quieter geometric companion to Founders Grotesk — use it wherever a label needs to whisper instead of speak.
- **Substitute:** Inter, Untitled Sans, or Suisse Int'l
- **Weights:** 400, 500, 700
- **Sizes:** 10, 11, 13, 14, 16, 18, 20
- **Line height:** 1.00–1.60

### Font Awesome 5 Pro — Font Awesome 5 Pro — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 18px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.6 | — |
| body-lg | — | — | 18px | 1.4 | — |
| subheading | — | — | 20px | 1.25 | — |
| heading | — | — | 32px | 1.21 | — |
| heading-lg | — | — | 40px | 1.15 | — |
| display | — | — | 48px | 1.04 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 4px
- **tags:** 4px
- **cards:** 16px
- **images:** 8px
- **buttons:** 50px

## Components

### Primary Pill Button
**Role:** Main CTA across the site (Shop Gummies, Add to Cart, Learn More)

Filled Electric Cobalt (#2f59f8), white text, 50px border-radius, 16px vertical / 24px horizontal padding, Founders Grotesk 500 at 16px. Sits on Bone canvas and reads as a pill sticker.

### Ghost Outline Button
**Role:** Secondary action paired with primary (Shop All, Learn More outline)

1.5px Obsidian border, transparent fill, Obsidian text, 50px radius, 16/24px padding. Same typography as primary — the distinction is fill, not size.

### Product Card
**Role:** Grid card for each gummy SKU on the Daily Essentials section

Paper (#ffffff) background, 16px radius, 16px padding. Product image at top with 8px radius corners. Star rating (Ash #707170, Founders Grotesk 12px). Product name at 16px weight 500 Obsidian. Subtitle at 14px Ash. Price at 16px weight 700 with struck-through compare-at price in Ash. Add to cart button is the Primary Pill Button at full card width.

### Top Promo Banner
**Role:** Sticky announcement bar above the nav

Full-bleed Volt Lime (#eaff00) band, Obsidian text, Founders Grotesk 500 at 14px centered. Height ~40px. The only full-bleed colored element above the fold.

### Save Badge
**Role:** Inline tag on product cards and nav (Save 40%, Subscribe & Save 40%)

Volt Lime (#eaff00) background, Obsidian text, Founders Grotesk 500 at 12px, 4px radius, 4px vertical / 8px horizontal padding. Sits inline next to nav items or above product card titles.

### Main Navigation
**Role:** Top-level site nav

Bone canvas, 4px bottom border in Obsidian. Logo left (SUPER MUSH in bold Founders Grotesk 700, 20px, Obsidian). Nav links center: SHOP, SCIENCE, BUNDLE & SAVE, each Founders Grotesk 500 at 14px Obsidian with 20px horizontal padding. Right cluster: Primary Pill Button (Shop All), account icon, cart icon with count. Height ~64px.

### Hero Section
**Role:** Full-bleed opening on home and category pages

Full-bleed lifestyle photo (beach, fitness, social). Headline at 48px Founders Grotesk 700, white text, left-aligned, anchored mid-left. Subtext at 16px white, 1.5 line-height, max-width 400px. Two-button row: Primary Pill Button + Ghost Outline Button (white border, white text for the ghost variant on dark photo).

### Testimonial Card
**Role:** Social proof in the 'Loved by 700k+ athletes' carousel

Paper background, 16px radius, 24px padding. 5-star rating in Electric Cobalt at the top. Quote at 16px Founders Grotesk 400 Obsidian. Author name at 14px weight 500, 'Verified Buyer' tag in Founders Grotesk 12px Ash. Product image thumbnail 8px radius in the corner.

### Retailer Strip
**Role:** 'Find us at' social-proof band between product grid and features

Full-bleed Ember Orange (#ff632a) band, ~80px tall. Label 'Find us at' in Founders Grotesk 500 14px Obsidian left-aligned. Retailer logos (Target, Sprouts, Urban Outfitters) centered and right-aligned in Obsidian or Paper depending on logo. No border, no radius — a flat colored band.

### Trust Bar
**Role:** Inline reassurance row above the final photo CTA

Bone canvas, single row, three items separated by 32px gaps. Each item: Electric Cobalt checkmark icon + label in Founders Grotesk 500 14px Obsidian (Free Shipping for orders $60+, 30-Day Easy Returns, Organic & 3rd Party Tested). Centered horizontally.

### Star Rating
**Role:** 5-star display on product cards and testimonials

Five stars in Electric Cobalt (#2f59f8), 12px each, 2px gap. Review count beside in Founders Grotesk 12px Ash. Active state: Electric Cobalt; inactive (if used): Concrete (#eeeeee).

### Accordion Section
**Role:** Movement / Recovery / Clarity expandable list in the feature area

Bone canvas section. Each row: 1px Obsidian bottom border, 48px row height. Title at 24px Founders Grotesk 500 Obsidian left-aligned. Plus/minus toggle icon in Electric Cobalt right-aligned. Expanded body text at 16px Ash, 1.5 line-height, 24px top padding.

### Photo CTA Banner
**Role:** Closing full-bleed lifestyle image with overlay text

Full-bleed photo, dark gradient overlay (transparent to rgba(0,0,0,0.45)) for legibility. Headline at 48px Founders Grotesk 700 white, centered. Primary Pill Button centered below. Used as the page closer — energy stays high, not quiet.

### Footer
**Role:** Site footer

Bone canvas, 1px Obsidian top border. Multi-column link grid (Shop, Science, Support, Company) at Founders Grotesk 400 14px Obsidian. Section headers at 14px weight 700. Newsletter signup row at top with ghost email input (1.5px Obsidian border, 50px radius, Paper fill) and Primary Pill Button submit.

## Do's and Don'ts

### Do
- Use 50px border-radius for every interactive button, input, and pill-shaped tag — the pill is the signature
- Reserve #2f59f8 exclusively for primary action fills, active nav states, icon accents, and link underlines
- Anchor large headlines at 40–48px with tight 1.04–1.17 line-height so they read as block stickers, not paragraphs
- Place product photography full-bleed at section boundaries, never inset in a card next to text
- Use GT Planar at 10–14px for fine print, sale tags, and metadata; reserve Founders Grotesk for body and headings
- Anchor every section to either Bone canvas (#f5f4f1) or Paper (#ffffff) — avoid introducing a third neutral surface
- Let the Volt Lime bar appear at most once per scroll depth as a highlighter, not a background

### Don't
- Never use #ff632a as a button fill or CTA background — Ember Orange belongs to the product and the retailer band only
- Never apply drop shadows for elevation — communicate depth through background color steps (Bone → Paper → Volt → Ember)
- Never set body copy below 14px; use 12px only for legal/footnote metadata in GT Planar
- Never use more than three colors in a single section — the system runs on restrained tri-color punctuation, not rainbow surfaces
- Never break the 50px radius on primary action buttons — ghost variants stay pill-shaped too
- Never use system fonts or fall back to Helvetica/Arial — always Founders Grotesk or GT Planar
- Never stack two full-bleed photo sections back-to-back; always interleave a white or colored band between them

## Elevation

Elevation is communicated through background color steps, never shadows. Cards sit on Paper above a Bone canvas; the retailer band sits on Ember above Paper; the promo bar sits on Volt above Paper. The absence of drop shadows is deliberate — the system is flat and sticker-like, not skeuomorphic.

## Surfaces

- **Bone Canvas** (`#f5f4f1`) — Default page background — warm off-white that softens the otherwise high-contrast system.
- **Paper Card** (`#ffffff`) — Product cards, testimonial cards, and any content block that needs to sit forward of the canvas.
- **Volt Bar** (`#eaff00`) — Promotional top banner and sale-bubble accents — the loudest non-action surface.
- **Ember Band** (`#ff632a`) — Retailer strip and product-accent fills — the orange product color as a brand band.

## Imagery

Full-bleed lifestyle photography is the brand's loudest element — candid, sun-drenched, high-key moments of people in motion (beach, training, social, recovery). Treatment is warm-toned with no heavy color grading; skin and product packaging do the color work. Product photography is isolated on white, tightly cropped, and warm-lit to match the orange packaging. The imagery is decorative atmosphere first, explanatory content second — text overlay is always white on a dark gradient rather than placed beside the image. Image-heavy overall: photos occupy roughly 40% of total viewport space across the home flow, alternating with white product grids.

## Layout

Full-bleed hero photo with left-anchored text, then max-width 1200px centered content for the product grid and feature sections. The 4-column product grid is the structural unit. Sections alternate between quiet white (Bone canvas + Paper cards), full-bleed photo, and flat colored bands (Volt promo bar, Ember retailer strip) — the colored bands are the rhythm, not just decoration. Navigation is a single sticky top bar with no sidebar or mega-menu. Generous vertical breathing room (64px section gaps) keeps the high-energy palette from feeling cramped.

## Similar Brands

- **OLIPOP** — Same tri-color accent punctuation on a warm off-white canvas, pill-shaped CTAs, and lifestyle photography that does the brand shouting
- **Liquid Death** — Bold full-bleed lifestyle imagery, a single vivid action color, and flat sticker-like components with no decorative shadows
- **Magic Spoon** — Playful wellness DTC with bright accent colors used sparingly, large geometric type, and product-forward 4-column grids
- **MUSH** — Direct same-category competitor sharing the mushroom-gummy product card aesthetic, warm canvas, and lifestyle-led hero
