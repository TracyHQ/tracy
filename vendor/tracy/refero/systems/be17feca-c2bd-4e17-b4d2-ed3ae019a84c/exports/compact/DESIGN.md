# Sandland Sleep — Style Reference
> warm cream sleep journal with deep navy nights

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sandland Sleep uses a warm cream canvas as its foundation, creating a soft, restful atmosphere that reads like a linen-wrapped pharmacy rather than a cold e-commerce site. Deep navy (#1a365d) provides the nighttime counterpart — anchoring the hero gradient and dark data cards as moments of cool, clinical authority that contrast the otherwise warm palette. A single vivid yellow (#fae467) serves as the sole chromatic punctuation for primary actions, badges, and data highlights, making every CTA feel switched on against the muted surroundings. Typography stays restrained and even, with a custom sans (Sandland-550) at moderate weights and tight tracking on display sizes, letting generous spacing and soft 10-20px radii carry the calm. Components are pill-shaped and rounded, shadows are whisper-soft (0.1 opacity), and the overall feel is a sleep journal: warm paper, navy ink, one highlighter.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Navy | `#1a365d` | Hero gradient base, dark data cards, icon strokes — the cool nocturnal counterpoint to the warm cream canvas, signals science and trust at the deepest end of the palette |
| Sunlit Yellow | `#fae467` | Primary CTA fill, bestseller badges, data-highlight accents — the only vivid chromatic in the system, warm and optimistic like morning light, used sparingly so every action glows |
| Linen Cream | `#f2ede8` | Page canvas, default section background — the dominant warm neutral that sets the entire sleep-warmth tone of the site |
| Paper White | `#ffffff` | Card surfaces, product photography backgrounds, nav backgrounds — pure white creates lift against the cream canvas |
| Soft Vellum | `#faf8f6` | Secondary card surfaces, subtle elevation layer — warmer than pure white, used when cards need to nest within cream sections without disappearing |
| Graphite | `#3d3d3d` | Body text, subtle border accents — softer than pure black for extended reading |
| Smoke | `#666666` | Secondary text, list borders, muted link underlines — the mid-gray that carries all supporting copy |
| Slate | `#726f6d` | Input borders, disabled button text and borders — the warm-leaning gray for form and inactive states |
| Charcoal | `#191923` | Deep surface fill for dark accent cards, alternative button backgrounds — nearly black with a slight cool cast, sits between midnight navy and true black |
| Frost | `#e6e6e6` | Hairline dividers, image borders, section separators — neutral-cool gray for structural lines |
| Ink Black | `#000000` | Primary text, dominant heading color, primary borders — the typographic anchor across all surfaces |

## Typography

### Sandland-550 — Custom sans-serif used across every UI surface — body, headings, buttons, nav, cards. Weight 400 dominates body and most headings, weight 500/600 reserved for emphasis. The tight negative tracking on display sizes (-0.03em at 48-72px) gives headlines a composed, compact feel; positive tracking on small uppercase labels (0.036-0.045em at 10-13px) provides the airy editorial rhythm seen in nav links, badge text, and section eyebrows.
- **Substitute:** DM Sans, Inter, or General Sans
- **Weights:** 400, 500, 600
- **Sizes:** 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 24, 28, 40, 48, 72
- **Line height:** 1.00, 1.10, 1.20, 1.30, 1.40, 1.60, 1.67
- **Letter spacing:** -0.03em at 48-72px, +0.036em to +0.045em at 10-13px (uppercase labels), normal at body sizes

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px, 24px
- **Line height:** 1.1, 1.4

### GTStandard-M — GTStandard-M — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.3 | 0.4px |
| body | — | — | 14px | 1.5 | — |
| body-lg | — | — | 16px | 1.6 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.3 | — |
| heading | — | — | 28px | 1.2 | — |
| heading-lg | — | — | 40px | 1.1 | — |
| display | — | — | 48px | 1.1 | -1.44px |
| hero | — | — | 72px | 1 | -2.16px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 12-16px

### Border Radius

- **cards:** 10px
- **badges:** 10px
- **inputs:** 4px
- **buttons:** 20px
- **nav-pills:** 20px

## Components

### Primary CTA Button
**Role:** Main conversion action (Shop Now, Add to Cart)

Pill shape with 20px border-radius, Sunlit Yellow (#fae467) fill, Ink Black (#000000) text at 14-15px weight 500/600. Padding 12px 24px. Box shadow at 10% opacity adds subtle depth. Generous horizontal padding makes the button feel confident but not heavy.

### Ghost Nav Pill Button
**Role:** Secondary navigation action (Take the Sleep Quiz)

Pill shape, 20px border-radius, transparent or Paper White fill with 1px Ink Black border. Text at 13-14px weight 500. Sits in the top-right of the navigation bar, visually quieter than the primary CTA.

### Nav Link
**Role:** Top-level navigation items (Shop All, Stay Asleep, Deep Sleep, FAQ)

Text-only, Ink Black at 13-14px weight 500, 0.036-0.045em letter-spacing. No underline by default. Aligned left in the header bar with the brand wordmark centered and action pill right-aligned.

### Product Card
**Role:** Product showcase in the Science-Backed Solutions grid

10px border-radius, Paper White (#ffffff) background, 0 4px 12px rgba(0,0,0,0.1) shadow. Colored top band (pink for Stay Asleep, orange for Deep Sleep) with product mockup centered. 20px internal padding. Bestseller badge as yellow pill in top-left corner.

### Bestseller Badge
**Role:** Product ranking indicator on product cards

Sunlit Yellow (#fae467) fill, 10px border-radius, small pill. Text at 10-11px weight 500 in Ink Black with 0.036em tracking. Positioned top-left of product cards.

### Testimonial Card
**Role:** Customer review with avatar, rating, quote, and product reference

Paper White background, 10px radius, soft shadow. Circular avatar (40-48px) top-left, 5-star rating in Sunlit Yellow, large italic quote at 18-20px, product thumbnails row at bottom showing products used.

### Dark Data Card
**Role:** Oura Ring sleep score results — the dramatic counterpoint to the warm sections

Midnight Navy (#1a365d) or Charcoal (#191923) background, 10-20px radius, white text. Contains two semi-circular progress gauges (Before/After scores) with thin arc strokes. Sunlit Yellow percentage badge anchors the bottom. This is the card that breaks the warmth and signals clinical proof.

### Circular Progress Gauge
**Role:** Sleep score visualization in the dark data card

Semi-circular arc stroke, 2-3px width, drawn in white or light gray at low opacity for the track, with a bright stroke for the score fill. Large score number (48-72px weight 500) centered below the arc. Label text (BEFORE SANDLAND, AFTER 1 WEEK) in uppercase tracking at 11-12px.

### Star Rating
**Role:** 5-star review display in testimonial cards

Sunlit Yellow (#fae467) filled stars at 14-16px, five stars inline. No text count needed, purely visual.

### Carousel Navigation Arrow
**Role:** Left/right navigation for testimonial and product carousels

Circular button, 32-40px diameter, Paper White fill with 1px Frost (#e6e6e6) border. Black chevron icon centered. Subtle shadow for lift off the cream canvas.

### Section Heading Block
**Role:** Section titles (Science-Backed Solutions for Better Rest)

Centered layout, large heading at 40-48px weight 500 in Ink Black, with -1.44px letter-spacing. Supporting paragraph at 16-18px weight 400 in Graphite (#3d3d3d), max-width 600-700px for comfortable line length.

### Input Field
**Role:** Form inputs (email, search)

No background fill, bottom border only at 1px Slate (#726f6d) via box-shadow technique. Text in Ink Black, placeholder in Smoke (#666666). Minimal, underline-only style rather than boxed inputs.

### Cookie Consent Banner
**Role:** Bottom-fixed privacy notice

Full-width strip at the bottom, Paper White background, thin top border. Body text at 12-14px in Graphite on the left, two action buttons on the right (black filled 'Accept & Continue' and outlined 'Do Not Share Information'). Functional, not decorative.

## Do's and Don'ts

### Do
- Use Sunlit Yellow (#fae467) as the fill for exactly one element per viewport: the primary action or the single data highlight
- Set border-radius to 20px for buttons and nav pills, 10px for cards and badges, 4px for inputs — three radius values, no others
- Keep the cream canvas (#f2ede8) unbroken across full page-width sections; never tile it within cards or components
- Apply -0.03em letter-spacing at 48px and above; apply 0.036-0.045em tracking at 10-13px uppercase labels; leave body text at default tracking
- Use Midnight Navy (#1a365d) as a section-level surface, not as a text color or border — it should feel like turning off the lights
- Limit shadows to 10% black opacity with 12-20px blur; never use sharp or saturated shadows
- Place the brand wordmark centered in the top nav with nav links left-aligned and action pill right-aligned

### Don't
- Do not introduce a second chromatic accent color — yellow is the only highlighter in the system
- Do not use sharp corners (0-2px radius) on any container, card, or interactive element
- Do not use saturated shadows, glow effects, or multi-layer shadow stacks
- Do not place colored product top bands outside the product card — the pink/orange lives on the product mockup only
- Do not use Midnight Navy as a body text color; reserve it for surface fills and large display contexts
- Do not use pure black (#000000) as a background fill; use Charcoal (#191923) for dark surfaces
- Do not apply letter-spacing tighter than -0.03em or looser than 0.045em — the tracking scale is narrow and intentional

## Elevation

- **Product card:** `0 4px 12px rgba(0,0,0,0.1)`
- **Elevated card / hero card:** `0 4px 20px rgba(0,0,0,0.1)`
- **Input field bottom border:** `0 1px 0 rgba(0,0,0,0.13)`

## Surfaces

- **Linen Canvas** (`#f2ede8`) — Page background — warm cream, the dominant surface
- **Paper White** (`#ffffff`) — Card and product surfaces that sit on the cream canvas
- **Soft Vellum** (`#faf8f6`) — Nested card backgrounds, secondary surface layer
- **Midnight Navy** (`#1a365d`) — Hero gradient, dark accent cards — the inverse surface
- **Charcoal Deep** (`#191923`) — Data cards, button backgrounds — near-black with slight cool cast

## Imagery

Product photography is the dominant imagery: isolated product boxes (pill bottles and supplement boxes) photographed on white, presented as tilted mockups with soft shadows. The product packaging itself carries the color story — pink-capped boxes for the 'Stay Asleep' line, orange-capped boxes for 'Deep Sleep'. The hero composition pairs two product mockups at slight angles against a dark navy gradient, creating a still-life feel. No lifestyle photography, no people imagery beyond a single circular avatar in testimonials. Icons are minimal — simple line icons in nav (person, bag) and a small ring icon for the Oura data card. The overall visual density is low; whitespace and product photography carry the visual weight, not illustration or graphics.

## Layout

Full-width sections with max-width 1200px centered content containers. The page alternates between dark and light bands: a dark navy hero → cream product section → white testimonial section. Within sections, content is centered with a 3-column card grid for products and a 2-column layout for testimonials (white card left, dark data card right). Navigation is a single thin top bar with wordmark centered. The layout rhythm is calm and unhurried — generous vertical breathing room between sections (64px+), no aggressive dividers, and the warmth of the cream canvas carries the eye through transitions.

## Similar Brands

- **Olipop** — Same warm cream canvas with a single vivid accent color, pill-shaped CTAs, and generous whitespace — both use color temperature (warm/cool) to pace the page
- **Athletic Greens / AG1** — Supplement ecommerce with clinical data cards paired against soft warm sections, dark navy for proof moments, minimal chromatic palette
- **Magic Spoon** — Direct-to-consumer product cards on a warm neutral canvas, bold centered product photography, pill-shaped buttons, editorial spacing rhythm
- **Brumate** — Product-first e-commerce with tilted product mockups on light backgrounds, dark hero bands, and a single accent color for CTAs and badges
- **Mela Vitamins** — Warm-toned supplement brand with cream/white surfaces, pill-shaped CTAs, soft shadows, and a clean clinical feel built on color temperature contrast
