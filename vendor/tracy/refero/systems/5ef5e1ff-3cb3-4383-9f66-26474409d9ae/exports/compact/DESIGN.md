# Pa'lais — Style Reference
> Botanical sketchbook dipped in honey. The cream paper canvas, blue toile-style line illustrations, and warm color blobs recall a hand-bound recipe journal, while the bold condensed display type and generous whitespace give it modern editorial confidence.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Pa'lais reads like a hand-illustrated artisan cookbook dropped into a modern food-magazine layout. The canvas is a warm cream paper (#fbf9f6) with pure white cards layered on top, anchored by a single deep-indigo brand voice (#234386) that owns every headline, link, and primary button. That indigo is intentionally the only saturated cool in the system; everything else is warm and edible — honey-gold (#ffc400), burnt orange (#ed7328), warm sand (#d2b68c), mint sage (#a2d3a6) — and those warms appear almost exclusively as organic flowing blob shapes and botanical line-art, never as flat fills. Typography splits into two loud voices: bold condensed display fonts in all-caps navy for headlines, and widely-tracked geometric sans (Axiforma / ITC Avant Garde) for labels and UI chrome with letter-spacing up to 0.27em. A handwritten script carries emotional taglines ('The future of cooking – today'). Components stay lightweight — soft 8px cards, generous 32px-radius pill buttons, hairline borders — letting the illustrations and photography do the storytelling.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Indigo | `#234386` | Primary brand color — headlines, navigation text, links, filled CTA buttons, and dark section backgrounds. The only cool saturated hue in the system, it gives every action weight and authority |
| Honey Gold | `#ffc400` | Decorative accent — used exclusively in organic flowing blob shapes and illustration highlights, never as a fill or button. The warm burst of yellow is the system's signature punctuation against the cream canvas |
| Burnt Orange | `#ed7328` | Orange accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Sky Blue | `#6aa8dc` | Soft illustration blue — used in botanical line-art washes and supporting decorative blobs. Lighter and more atmospheric than the primary indigo, it adds depth to the plant illustrations |
| Warm Sand | `#d2b68c` | Subtle warm accent — used sparingly in illustration details and supporting decorative shapes. Bridges the gap between the cream canvas and the more saturated orange and gold accents |
| Mint Sage | `#a2d3a6` | Botanical green — appears in organic blob shapes and plant illustration washes. Soft enough to read as a pastel, it reinforces the plant-based brand without competing with the indigo or orange |
| Ink Black | `#000000` | Primary text, hairline borders, icon strokes, and neutral UI elements. The sheer frequency of black borders (503+ occurrences) signals the system relies on thin dividing lines rather than card elevation to separate content |
| Pure White | `#ffffff` | Card surfaces, text on dark backgrounds, button text fills, and inset panels. Creates the layered surface effect — white cards resting on the cream canvas |
| Cream Paper | `#fbf9f6` | Page canvas and hero background. This warm off-white is the system's base surface, immediately distinguishing it from a stark white SaaS layout — it reads as paper, not screen |
| Soft Shadow | `#d6d6d6` | Card shadow base tone — used exclusively in box-shadow declarations at low opacity. The shadow is the only elevation mechanism; there are no borders on cards |

## Typography

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 8px
- **Line height:** 1.2

### hwt-artz — Primary display headline font — bold condensed slab/sans used in all-caps for section headings like 'INCREDIBLE RECIPES'. The 0.043em letter-spacing tightens the character set into a confident, packed block of type. Substitute: Bebas Neue, Anton, or Oswald Bold for a similar condensed display voice.
- **Substitute:** Bebas Neue
- **Weights:** 400
- **Sizes:** 32px, 33px, 46px
- **Line height:** 0.87–1.20
- **Letter spacing:** 0.043em (approx 1.38px at 32px, 1.98px at 46px)

### Delivery Note DEMO — Secondary display font — used for large hero-level headlines at 56–58px. Slightly looser tracking (0.031em) than hwt-artz, it reads as the 'loud' voice while hwt-artz handles sub-display. Substitute: Oswald Bold or Roboto Condensed Black.
- **Substitute:** Oswald
- **Weights:** 400
- **Sizes:** 16px, 28px, 32px, 56px, 58px
- **Line height:** 0.86–1.20
- **Letter spacing:** 0.031em (approx 0.5px at 16px, 1.74px at 56px)

### Sandman_Fill — Mega display font reserved for the largest brand-level statements. At 86–88px with a 0.73–0.82 line-height, it creates an enormous visual anchor. The very tight line-height lets characters stack and fill space. Substitute: Playfair Display Black or DM Serif Display for a serif display alternative.
- **Substitute:** Playfair Display Black
- **Weights:** 400
- **Sizes:** 86px, 88px
- **Line height:** 0.73–0.82
- **Letter spacing:** normal

### Axiforma — Primary body and UI font — geometric humanist sans used for paragraph text, form inputs, and small labels. Its signature is the dramatically wide letter-spacing (0.063em to 0.267em) on labels and navigation, creating a spaced-out, editorial cadence. At 16px in body copy, tracking relaxes. Substitute: Inter or DM Sans.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12px, 14px, 15px, 16px
- **Line height:** 1.00–2.17
- **Letter spacing:** 0.063em at 12px, 0.071em at 14px, ~0.063em at 16px (labels); tighter in body paragraphs

### ITC Avant Garde Std Bk — Geometric sans for navigation and labels — used at the widest tracking in the system (0.133em to 0.267em). The Avant Garde influence is unmistakable in the perfectly circular letterforms (O, C, G) when used in nav items. Substitute: Futura or Jost.
- **Substitute:** Futura
- **Weights:** 400
- **Sizes:** 12px, 16px, 24px
- **Line height:** 1.00–1.67
- **Letter spacing:** 0.133em at 12px, 0.2em at 16px, 0.267em at 24px — the most aggressively tracked text in the system

### Caveat (script accent) — Handwritten italic script for emotional taglines and subheadlines (e.g. 'The future of cooking – today'). This is a brand voice layer — not a structural font — that adds the human, handwritten quality. Substitute: Caveat, Dancing Script, or Sacramento.
- **Substitute:** Caveat
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.20
- **Letter spacing:** normal

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.6 | 1.67px |
| body-sm | — | — | 14px | 1.67 | 0.99px |
| body | — | — | 16px | 1.5 | 0.5px |
| subheading | — | — | 24px | 1 | 6.4px |
| heading-sm | — | — | 32px | 0.9 | 1.38px |
| heading | — | — | 46px | 1.18 | 1.98px |
| heading-lg | — | — | 56px | 1.14 | 1.74px |
| display | — | — | 88px | 0.82 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 16px
- **blobs:** organic (SVG paths, no fixed radius)
- **cards:** 8px
- **inputs:** 8px
- **buttons:** 32px

## Components

### Filled Indigo CTA Button
**Role:** Primary call-to-action across the site — the only filled button variant in the system

Deep Indigo (#234386) background, Pure White (#ffffff) text, 32px border-radius (pill-adjacent — wider than tall), padding 24px top/bottom × 48px left/right. Text in Axiforma or system sans, 13px, uppercase, letter-spacing ~0.1em. No border, no shadow. Examples: 'STORE LOCATOR' in the nav, 'CHECK OUT OUR RECIPES' in the recipes section.

### Outlined Orange Secondary Button
**Role:** Secondary or informational call-to-action — 'learn more' style with an arrow icon

Transparent background with 2px Burnt Orange (#ed7328) border, Burnt Orange text, 32px border-radius. Padding 24px × 48px. Always includes a right-arrow icon before or after the label. Used for 'MEET US' and similar exploration CTAs. This is the outlined-action variant — not filled.

### Top Navigation Bar
**Role:** Persistent site navigation

Horizontal bar, white or transparent background resting on the cream canvas. Logo (Pa'lais wordmark) left, nav items center (GET INSPIRED, OUR PRODUCTS, FOR A BETTER WORLD, CONTACT), filled indigo CTA button right. Nav items in Axiforma or ITC Avant Garde at 12–16px with 0.13–0.2em letter-spacing, all-caps, Deep Indigo color. 40px horizontal margin on nav items.

### Recipe Card
**Role:** Content card for individual recipes in the carousel/section

8px border-radius, soft box-shadow rgba(0,0,0,0.16) -14px 10px 49px 0px (asymmetric, drifting down-right). White background. Full-bleed food photography at the top with a semi-transparent overlay containing the recipe title in white all-caps condensed display type and a 30-min time badge. Padding 16px. Cards sit directly on the orange section background.

### Hero Section with Organic Wavy Divider
**Role:** First-screen impact layout with split text and product image

Full-bleed cream (#fbf9f6) background. Left side: large condensed display headline (56–58px, Deep Indigo) with a script tagline below (32–40px, Caveat-style). Right side: product photography of a Pa'lais tub. A flowing SVG blob shape (honey-gold on top, mint-sage on bottom) acts as a wavy vertical divider between the two halves — not a straight line, but an organic curve that bleeds across the section.

### Organic Blob Shape
**Role:** Decorative SVG accent that defines the system's visual rhythm

Free-form SVG path with no fixed dimensions, using a solid fill from the accent palette (Honey Gold, Burnt Orange, Mint Sage). Appears at section boundaries, behind product images, and as background washes. The blobs are not abstract — they evoke liquid, plant, or splash forms. They carry the warm color energy while the indigo type carries the structural weight.

### Botanical Line Illustration
**Role:** Hand-drawn decorative element that establishes the botanical/editorial mood

Detailed blue line-art (Deep Indigo #234386 or Sky Blue #6aa8dc, 1–1.5px stroke) of plants, cashews, leaves, knives, and herbs — rendered in a toile/engraving style. Scattered around sections, overlapping content edges, and bleeding off the page. They never have fills — only outlines — and act as the connective tissue between sections.

### Eyebrow Label / Section Tag
**Role:** Small all-caps label above section headings (e.g. time badges, category tags)

ITC Avant Garde or Axiforma, 12–16px, Deep Indigo or white text, letter-spacing 0.2–0.27em. Always uppercase. The aggressive tracking is the system's signature typographic device — it makes even tiny labels feel editorial and intentional. Often paired with a small icon (clock for time, leaf for plant-based).

### Product Tub Image
**Role:** Hero product photography — the Pa'lais spread/sauce container

Photographed in soft natural light on a textured surface (wood, linen, ceramic). The tub itself is off-white/cream with a Deep Indigo label featuring the Pa'lais wordmark and a small botanical illustration. The product is the visual hero — always shot at an angle that shows both the label and a hint of the contents.

### Food Photography Plate
**Role:** Lifestyle food imagery supporting recipes and product usage

Close-up, slightly overhead shots of prepared dishes (toast with spread, wraps, bowls) on light ceramic or wooden surfaces. Warm, natural lighting, shallow depth of field. Garnished with fresh herbs, nuts (cashews), and crumbs to reinforce the artisan/handmade feel. The food is the product context.

### Section Divider Curve
**Role:** Organic separator between major page sections

A large SVG path (typically 200–400px tall) that creates a flowing wave boundary between two color fields (e.g. cream → orange, white → deep indigo). Filled with a single solid color matching the section below. Unlike a hard line, it creates a hand-painted, watercolor-edge effect — the signature transition device of the layout.

### Scroll Indicator
**Role:** Small downward-arrow icon below the hero to prompt scrolling

Simple circular outlined icon in Deep Indigo, ~48px diameter, 1.5px stroke, containing a downward-pointing chevron. Centered below the hero text. Minimal — the system doesn't rely on elaborate scroll animations.

## Do's and Don'ts

### Do
- Use #234386 Deep Indigo as the only filled-button background color — it is the single saturated cool anchor in an otherwise warm palette.
- Apply Axiforma or ITC Avant Garde with 0.13–0.27em letter-spacing for all labels, nav items, and UI text in uppercase — the aggressive tracking is the system's typographic signature.
- Render all decorative organic shapes as SVG paths in solid accent fills (#ffc400, #ed7328, #a2d3a6) — never use CSS gradients or multiple colors in one blob.
- Use 32px border-radius for all buttons and 8px for cards — the radius contrast between pill-buttons and soft-cornered cards is intentional and creates the system's tactile feel.
- Layer Pure White (#ffffff) cards on the Cream Paper (#fbf9f6) canvas rather than using gray surfaces — the warm off-white base is what makes the system feel like a cookbook rather than a dashboard.
- Combine bold condensed display type (hwt-artz / Bebas Neue substitute) in Deep Indigo all-caps with a handwritten script (Caveat substitute) for emotional subheadlines — this two-voice headline pattern is the brand's verbal-visual signature.
- Use botanical line illustrations in #234386 or #6aa8dc with 1–1.5px stroke and no fills as decorative connective tissue between sections.

### Don't
- Don't introduce new blue or indigo shades — #234386 is the sole cool saturated color and any additional blue will dilute the warm/cool tension.
- Don't use #ffc400 Honey Gold or #ed7328 Burnt Orange as filled button backgrounds — these accents are reserved for organic shapes and outlined secondary actions.
- Don't apply letter-spacing tighter than 0.03em on display headlines or wider than 0.27em on labels — the tracking extremes are calibrated; flattening them kills the editorial cadence.
- Don't use flat gray (#f5f5f5, #e0e0e0) for surface separation — the system achieves layering through cream → white → orange → indigo, not through neutral grays.
- Don't add drop shadows to buttons or navigation — shadows appear only on recipe cards, and even there they are asymmetric and soft.
- Don't set body text in the display fonts (hwt-artz, Delivery Note, Sandman) — those are reserved for headlines at 32px and above.
- Don't place the script accent font (Caveat substitute) in UI chrome, labels, or buttons — it is an emotional headline voice only, used sparingly.

## Elevation

- **Recipe Card:** `rgba(0, 0, 0, 0.16) -14px 10px 49px 0px`
- **Navigation Link / Hover Surface:** `rgba(0, 0, 0, 0.05) 0px 20px 27px 0px`

## Surfaces

- **Cream Paper Canvas** (`#fbf9f6`) — Base page background and hero section — warm off-white that sets the editorial, paper-like atmosphere
- **Pure White Card** (`#ffffff`) — Recipe cards, content panels, and inset surfaces that float above the cream canvas
- **Burnt Orange Section** (`#ed7328`) — Full-bleed alternating section background (e.g. the recipes block) that breaks the cream rhythm with warm energy
- **Deep Indigo Section** (`#234386`) — Dark or footer-level section for high-contrast moments, reinforcing the brand primary as a structural color

## Imagery

Imagery is split between two distinct modes: (1) hand-drawn botanical line illustrations in Deep Indigo or Sky Blue, rendered in a toile/engraving style with no fills, depicting plants, cashews, leaves, knives, and herbs — scattered around sections, overlapping content edges, and bleeding off the page; (2) warm natural-light food photography showing the Pa'lais product tub in context (on linen, wood, ceramic surfaces) and finished dishes (toast with spread, wraps, bowls) garnished with fresh herbs. Product shots are slightly angled, lifestyle food shots are close-up and slightly overhead with shallow depth of field. The illustrations carry the editorial/artisan mood; the photography carries the appetite appeal. Neither uses duotone or color treatment — illustrations are pure line, photography is natural color.

## Layout

The page uses a full-bleed cream canvas with content max-widthed to ~1200px centered. The hero is a split layout: condensed display headline + script tagline on the left, product photography on the right, divided by a flowing organic SVG blob (gold over sage) that replaces a straight vertical line. Below the hero, sections alternate between white and full-bleed orange bands, each separated by organic wavy dividers rather than hard lines. Content sections are typically 2-column (text + image/illustration) or centered single-column stacks. The recipes section is a horizontal card carousel on an orange background. Navigation is a minimal top bar with logo left, nav center, CTA right. Density is spacious — 64px section gaps and generous breathing room around illustrations let the decorative elements (blobs, line-art) feel curated rather than cluttered. The overall rhythm is: quiet cream → bold orange → quiet cream → dark indigo footer.

## Similar Brands

- **Oatly** — Same warm editorial energy with bold condensed display headlines, playful script accents, and warm/cool color tension — though Oatly leans more into beige and Oatly's signature off-white rather than this system's cream + indigo contrast.
- **Allbirds** — Shares the hand-drawn botanical illustration language (leaves, plants) combined with a single saturated brand color, though Allbirds uses more photography and less organic blob shapes.
- **Bumble Bee Foods (or any artisan food brand like Graza)** — Same warm cream-canvas-plus-organic-illustrations approach with bold condensed display type and warm accent colors used in fluid shapes — the 'recipe-journal' visual language is nearly identical.
- **Meow Mix (rebrand) or Wild One** — Shares the system-level decision to use a single cool saturated color (indigo/blue) for all structure while pushing all warmth into organic decorative shapes and illustrations — the color-lanes separation is the same.
- **Seed (seed.com)** — Same botanical line-art illustrations, same generous whitespace, same single-accent-color discipline, though Seed leans more clinical while Pa'lais leans more artisan/handcrafted.
