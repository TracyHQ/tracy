# Alpine Hearing Protection — Style Reference
> Sunlit Scandinavian editorial. A cinnamon-ink wordmark on warm cream paper, with one red exclamation — the rest is photography and generous whitespace.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Alpine uses a warm Scandinavian-editorial language: an off-white canvas bathed in cinnamon undertones, a near-black cocoa ink for text, and a single electric red accent that appears only in the brand bar and product badges. The system feels like a print magazine spread — generous full-bleed photography sits next to tight, sharp-cornered product cards with minimal rounding (2.23px) and no decorative elevation. Typography is custom and slightly compressed (Antarctica), pulling headlines close for editorial tension. Warm cream surfaces (#f8f0ec, #f3e7e2, #fde3d6) layer underneath product imagery like a gallery wall. The visual mood is calm, premium, and tactile — photography does the emotional work while UI components stay near-flat and information-dense. Red is rationed: a logo bar, a badge, a guarantee bar — never buttons. The only filled action color is the warm cocoa (#200e0e), which replaces what most sites would use as black.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cocoa Ink | `#200e0e` | Primary text, filled action buttons, card text, icon strokes, card borders — warm near-black replaces pure black throughout, giving every label a roasted, tactile quality |
| Signal Red | `#ed212d` | Red decorative accent for icons, marks, and small graphic details. |
| Canvas White | `#ffffff` | Page background, nav text, button labels on dark surfaces — the neutral base all warm tones sit on |
| Blush Cream | `#f8f0ec` | Card surfaces, soft elevated sections, product detail backgrounds — the warm secondary layer beneath the white canvas |
| Rose Stone | `#f3e7e2` | Badge backgrounds, subtle card elevation, border tints on light cards — a step warmer than Blush Cream for tag/label contexts |
| Apricot Wash | `#fde3d6` | Decorative illustration panels, soft highlight washes on icons and product imagery backgrounds |
| Warm Gray | `#d2cfcf` | Hairline borders, dividers, input field outlines on neutral surfaces |
| Deep Espresso | `#202020` | Secondary card backgrounds for dark product variants — used sparingly as a near-black with slight warmth |
| Sage Mist | `#9ac9b5` | Product color swatch — specific earplug variant color, not a system-wide token |
| Dusty Rose | `#dbb0b3` | Product color swatch — specific earplug variant color, not a system-wide token |

## Typography

### Antarctica — Sole typeface across all UI: navigation, buttons, product cards, body, and display headlines. Custom geometric sans with slight warmth in the terminals. Medium-weight (545) is the workhorse for body and UI; 600 carries CTAs and product names; 400 appears in secondary metadata. Headlines compress with -0.02em tracking to feel editorial rather than airy.
- **Substitute:** DM Sans or Söhne — both have the geometric warmth and humanist terminal cuts that match Antarctica's character
- **Weights:** 400, 500, 545, 600
- **Sizes:** 10, 12, 13, 14, 16, 18, 24, 27, 42
- **Line height:** 1.10, 1.15, 1.20, 1.30, 1.45, 1.50, 1.60
- **Letter spacing:** -0.01em to -0.02em at 18px and above; normal below

### GTStandard-M — GTStandard-M — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 0px |
| body | — | — | 14px | 1.5 | 0px |
| heading-sm | — | — | 18px | 1.3 | -0.18px |
| heading | — | — | 24px | 1.2 | -0.24px |
| heading-lg | — | — | 27px | 1.15 | -0.27px |
| display | — | — | 42px | 1.1 | -0.84px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 15px
- **Element gap:** 8px

### Border Radius

- **cards:** 2.23px
- **badges:** 2.23px
- **images:** 2.23px
- **inputs:** 2.23px
- **buttons:** 2.23px

## Components

### Red Brand Bar
**Role:** Slim brand-identity header

Full-width Signal Red (#ed212d) bar, ~48px tall, containing a white hamburger icon on the left, centered 'Alpine' wordmark in white Antarctica 600, and a language selector (ES) with shopping bag icon on the right. Sits directly below the dark guarantee bar. Padding: 10px top/bottom. This is the single most identifiable UI element of the system.

### Guarantee Announcement Bar
**Role:** Trust signal above the fold

Narrow dark band at the very top, Cocoa Ink (#200e0e) background, white centered text at 10–12px Antarctica 500, uppercase tracking. Single line, no close button visible. Sets a premium tone before the red brand bar.

### Hero Photograph Section
**Role:** Full-bleed marketing hero

100% viewport width lifestyle photograph with a white headline overlaid at bottom-left in Antarctica weight 500 at 42px, letter-spacing -0.02em. Subhead in weight 400 at 16px, slightly muted white. A filled Cocoa Ink (#200e0e) CTA button with white text and right-arrow icon sits below the subhead. A small carousel dot indicator appears at bottom-right.

### Category Navigation Bar
**Role:** Horizontal category selector

Centered row of 7 text-only navigation links (Focus, Music, Playing, DIY, Motor, Watersport, Race) in Antarctica 500 at 16px, Cocoa Ink color, no underlines or backgrounds. 64px vertical padding above and below. No active state styling visible — pure typographic navigation.

### Help Me Choose Pill
**Role:** Outlined contextual action

Centered button below the category nav: 1px Cocoa Ink (#200e0e) border, 2.23px radius, transparent background, 'Help Me Choose' label in Cocoa Ink Antarctica 500 14px, with a right-arrow chevron icon. Padding: 10px 20px. Ghost/outlined style — not filled.

### Product Card
**Role:** E-commerce product tile

Square product image on a solid colored background (purple, sand, blue, or pink — matching the earplug color), 2.23px border in Cocoa Ink (#200e0e), 2.23px radius. Below the image: product name in Antarctica 600 16px Cocoa Ink, feature line in Antarctica 400 13px Cocoa Ink, 'Stay in conversation' tagline in 13px, 5-star rating with review count in 13px, price in Antarctica 600 16px. No shadow, no hover lift — the card is flat and printed.

### Top Seller Badge
**Role:** Product status tag

Small rectangular label in the top-left corner of a product image: white background, 2.23px radius, 'Top Seller' text in Antarctica 500 12px Cocoa Ink. No border, no color fill — pure typographic badge sitting on the product photo.

### Color Swatch Row
**Role:** Product variant selector

Horizontal row of 4–5 small color squares (each ~16px, 2.23px radius) positioned below the product image, above the product name. Colors are exact product variants: sand, gold, black, navy, blue, pink. No labels — the swatches are self-explanatory.

### Star Rating Display
**Role:** Social proof indicator

Row of 5 small filled stars in Cocoa Ink (#200e0e) followed by review count in Antarctica 400 13px (e.g. '394 reviews'). Stars are tightly spaced, ~10px each. Half-star rendering supported. No separate star+text vertical stacking — always horizontal.

### Hero CTA Button
**Role:** Primary filled action

Filled button with Cocoa Ink (#200e0e) background, white Antarctica 500 text, 2.23px radius, right-arrow icon after the label. Padding: 12px 20px. Label is sentence-case ('Find Calm Throughout The Day'). This is the only filled button style in the system.

### Advice Card
**Role:** Editorial content tile

Full-bleed or near-full-bleed image (portrait photograph or line illustration) with a title and body paragraph below in Antarctica 600/400 at 18px/14px Cocoa Ink. No card background or border — sits directly on the white or cream section background. Images themselves are the visual container.

### Carousel Navigation Arrows
**Role:** Horizontal scroll control

Pair of circular outlined arrow buttons (left/right) at the right edge of horizontally-scrolling rows, 32px diameter, 1px Cocoa Ink border, 2.23px radius, Cocoa Ink arrow icon inside. Transparent fill, ghost style.

## Do's and Don'ts

### Do
- Use Cocoa Ink (#200e0e) for all body text, icons, and borders — never use pure #000000 or charcoal grays; the warm undertone is the brand
- Apply 2.23px radius to every surface — cards, buttons, badges, inputs, images; sharp corners are non-negotiable
- Use Signal Red (#ed212d) only in three places: the brand bar, the guarantee bar, and product status badges — never on CTAs, links, or body text
- Compress display headlines to letter-spacing -0.02em (e.g. -0.84px at 42px) for editorial tightness; body and below stays at normal tracking
- Alternate white (#ffffff) and Blush Cream (#f8f0ec) section backgrounds to create rhythm without using shadows
- Center-align the category navigation row and the 'Help Me Choose' button — left-aligned navigation would break the print-catalogue feel
- Use full-bleed lifestyle photography (portrait crops, natural light, shallow DOF) for heroes and editorial sections; product-only shots on solid color backgrounds for the grid

### Don't
- Do not add box-shadows to any component — elevation comes from background-color shifts, never from blur or offset
- Do not round corners beyond 2.23px — no pill buttons, no large radii; the near-sharp aesthetic defines the system
- Do not use Signal Red (#ed212d) for buttons, links, or hover states — it is brand-identity color, not an action color
- Do not introduce drop shadows, gradients, or glassmorphism — the design is deliberately flat and print-like
- Do not use the product color swatches (Sage Mist #9ac9b5, Dusty Rose #dbb0b3) as system-wide accent tokens — they are product variant colors only
- Do not center-align body paragraphs or use fonts other than Antarctica (or its substitute); the single-typeface discipline is what makes the system feel like one publication
- Do not use pure black (#000000) for text or icons — always use Cocoa Ink (#200e0e) to maintain the warm tonal harmony

## Elevation

- **Top Seller Badge:** `none — flat rectangle with text only, no shadow`
- **Product Card:** `none — sharp 2.23px border in Cocoa Ink (#200e0e), no box-shadow`

## Surfaces

- **Canvas** (`#ffffff`) — Page background, full-bleed white surface for navigation, hero, and product grids
- **Blush Card** (`#f8f0ec`) — Soft product detail cards, gentle elevation from canvas
- **Rose Tag** (`#f3e7e2`) — Badge backgrounds, tag pills, label containers
- **Apricot Panel** (`#fde3d6`) — Decorative illustration backdrops and icon highlight washes

## Imagery

Photography is the dominant visual element: tight, intimate portrait crops of people wearing earplugs, always full-bleed or large-format, shot in natural light with shallow depth of field. The hero image (profile of a woman with closed eyes against blue sky) is the signature — calm, sensory, slightly aspirational. Product photography is clean, product-only on solid colored backgrounds (purple, sand, blue, pink) that double as color swatches. Illustrations are minimal: a single line-art headphone drawing on Apricot Wash (#fde3d6) in coral stroke, used as a decorative section accent. No 3D renders, no abstract graphics, no icon families beyond simple stroke icons. The overall impression is editorial fashion-photography meets medical-product catalogue.

## Layout

Full-bleed hero photograph (100% viewport width) with white headline overlaid bottom-left. Below the hero: a max-width 1280px centered container with compact product grid (3–4 columns). Navigation is a slim text bar of category links centered above the grid. Section rhythm: white bands alternating with warm cream (#f8f0ec) bands, separated by generous 64px gaps. Content blocks alternate between centered text stacks and asymmetric photo+text pairs. Product cards are uniform size with a consistent internal grid: image → badge → name → metadata → price. No sidebar, no mega-menu — navigation stays as a single horizontal row. Carousel arrows on the right edge suggest horizontal scroll for product and advice rows. The layout reads top-to-bottom as: guarantee bar → red brand bar → hero photo → category nav → product grid → advice section with 3-column image grid.

## Similar Brands

- **Teenage Engineering** — Same near-sharp 2px corners, warm cream card surfaces, and photography-driven product grid with minimal UI chrome
- **Olab (oratory eyewear brands)** — Same editorial lifestyle photography, warm-neutral palette, and print-catalogue layout rhythm with centered text navigation
- **Aesop** — Same warm cream-and-white tonal layering, serif-adjacent editorial restraint, and rationed single accent color
- **Muji** — Same near-flat components, minimal elevation, and warm off-white canvas with brown text replacing pure black
- **Mismo** — Same Scandinavian-product-photography approach, tight type spacing, and card grids with hairline borders in a warm dark tone
