# Shopify — Style Reference
> Midnight greenhouse — merchants' brands blooming against deep teal-black, lit by a single mint spark.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Shopify's design system is a midnight workshop for commerce: an almost-black canvas tinted with deep teal-green, broad confident sans-serif type, and one electric mint accent that activates interactive moments. The interface feels like a darkroom where products and brands are the light source — photography and merchant storefronts glow against the near-black surfaces while chrome recedes. Components are geometric but soft: 12px-radius cards with hairline borders, pill buttons, and weight-330 display type that whispers scale rather than shouting. A single chromatic punctuation (#36f4a4) appears sparingly on links, tags, and focus states, reserving color for functional moments so the merchant stories stay the visual focus.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Forest | `#02090a` | Page canvas, hero backgrounds, section backgrounds |
| Deep Lichen | `#061a1c` | Primary card surfaces, elevated panels, content blocks |
| Shaded Fern | `#072720` | Navigation bar, secondary cards, subtle panel lift |
| Spruce Border | `#1e2c31` | Hairline card borders, divider lines, input outlines |
| Abyss Indigo | `#000a1e` | Secondary surface for product/demo embeds, feature panels |
| Pure White | `#ffffff` | Primary text, button fills, heading copy, logo marks |
| Mist Gray | `#a1a1aa` | Body text, secondary copy, muted labels, footer links |
| Sage Gray | `#99b3ad` | Body paragraphs, description text with subtle teal warmth |
| Faded Steel | `#9dabad` | Link text, breadcrumb labels, tertiary copy |
| Soft Pearl | `#9797a2` | Helper text, micro-copy, metadata labels |
| Carbon Black | `#000000` | Icon fills, nav SVG strokes, maximum-contrast text |
| Slate | `#71717a` | Headings needing reduced emphasis, section eyebrows |
| Graphite | `#333333` | Disabled button backgrounds, inactive control states |
| Shopify Mint | `#36f4a4` | Active nav indicators, focus rings, highlight tags, link hover accents — the single chromatic spark that makes interactivity feel switched on against the dark canvas |
| Mossy Edge | `#133b32` | Inset borders on elevated cards, subtle separator strokes with teal undertone |

## Typography

### Neue Haas Grotesk — Primary type system — display headlines at 70–96px weight 330–400 whisper scale rather than shout it; body at 16–18px weight 400–500; nav and UI at 14–16px weight 500–550. The ultra-light 330 weight at display sizes is the signature: it says confidence through restraint, not volume.
- **Substitute:** Inter, Helvetica Neue, Söhne
- **Weights:** 330, 400, 500, 550, 600
- **Sizes:** 14, 16, 18, 20, 24, 28, 48, 55, 70, 96
- **Line height:** 1.0–1.5 depending on size (0.83–0.96 for display, 1.4–1.5 for body)
- **Letter spacing:** 0.015em at 14px, 0.02em at 16–20px, 0.04em at 48px+
- **OpenType features:** `"ss03"`

### Inter Variable — Secondary utility type — used in nav chrome, small UI labels, tab controls, footer micro-copy. The slightly higher x-height and more standard tracking make it more legible at compact sizes. Also serves where weight 420 fills the gap between regular and medium.
- **Substitute:** Inter, system-ui
- **Weights:** 400, 420, 450, 550
- **Sizes:** 12, 14, 16, 18, 20
- **Line height:** 1.0–1.56
- **Letter spacing:** 0.06em — applied to uppercase eyebrow labels and tab indicators
- **OpenType features:** `"ss03"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.72px |
| body-sm | — | — | 14px | 1.43 | 0.28px |
| body | — | — | 16px | 1.5 | 0.32px |
| subheading | — | — | 20px | 1.4 | 0.4px |
| heading-sm | — | — | 24px | 1.25 | 0.48px |
| heading | — | — | 28px | 1.16 | 0.56px |
| heading-lg | — | — | 48px | 1.14 | 1.92px |
| display | — | — | 70px | 0.96 | 2.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **nav:** 12px
- **cards:** 12px
- **pills:** 9999px
- **inputs:** 4px
- **buttons:** 9999px
- **large_panels:** 20px

## Components

### Primary Pill Button
**Role:** Main call-to-action

White fill (#ffffff), dark text (#02090a), 9999px pill radius, 12px 24px padding, 16px Inter Variable weight 550. Subtle inset highlight rgba(255,255,255,0.04) for surface texture. This is the dominant action — used once per view.

### Ghost Pill Button
**Role:** Secondary action

Transparent fill, 1px white border (#ffffff at ~30% opacity), white text, 9999px radius, 12px 24px padding, 16px Inter Variable weight 550. Paired alongside primary on hero sections.

### Dark Surface Card
**Role:** Content container

Background #061a1c, 1px border #1e2c31, 12px radius, 24px padding. Used for feature blocks, product embeds, content tiles. Stack of layered dark tones separates it from the deeper #02090a canvas.

### Raised Showcase Card
**Role:** Hero/feature card with lift

Background #072720, 20px radius, generous padding (24–40px), with shadow stack: rgba(5,24,19,0.05) 0px 20px 60px + rgb(19,59,50) 0px 1px 0px inset. Inset border gives the card a subtle green-lit edge against the dark canvas.

### Navigation Bar
**Role:** Top-level site navigation

Background #072720, 12px radius on outer container, 24px vertical padding. Logo left, primary nav links center-left at 14px weight 500, utility links and CTA right. Active nav item gets a #36f4a4 underline or dot indicator.

### Feature Image Card
**Role:** Merchant showcase tile

Full-bleed photograph (16:9 or 3:4) with 12px radius, sits on #061a1c background, often paired with merchant logo overlay. Image is the hero — no decorative borders.

### Product Preview Card
**Role:** Inline product/storefront embed

White or near-white interior (often pulled from merchant site), 12px radius, floats above dark canvas with 4px inner shadow border. Buy button inside is dark pill on white surface.

### Eyebrow Label
**Role:** Section pre-title / category tag

Inter Variable 12px weight 550, 0.06em letter-spacing, uppercase, color #99b3ad or #36f4a4 (when active/highlighted). Sits 8–12px above its heading.

### Display Headline
**Role:** Page-level hero text

Neue Haas Grotesk 70–96px, weight 330–400, line-height 0.96–1.0, letter-spacing 0.015–0.04em, color #ffffff. The ultra-light weight at extreme size is the system's most recognizable signature — it signals scale through restraint, not volume.

### Body Copy
**Role:** Paragraph text and descriptions

Neue Haas Grotesk 16–18px, weight 400, line-height 1.4–1.5, color #99b3ad. Muted teal-gray against the dark canvas keeps body copy present but secondary to headings.

### Minting Link
**Role:** Inline text link with accent

Color #36f4a4, no underline by default, 1px solid underline on hover. Used for key inline CTAs and navigational text links that need to stand out from the muted body.

### Flag/Icon Chip
**Role:** Country selector or status indicator

40×40 or 48×48 square, 8–12px radius, contains country flag or icon. Subtle 1px #1e2c31 border. Used in international/markets feature blocks.

## Do's and Don'ts

### Do
- Use weight 330–400 Neue Haas Grotesk at 70–96px for display headlines — the ultra-light weight at extreme size is the system's most distinctive signature.
- Set the canvas to #02090a for all pages; use #061a1c for cards and #1e2c31 for hairline borders to build the layered dark surface stack.
- Use pill buttons (9999px radius) for all primary and secondary actions — square or slightly rounded buttons break the system's silhouette.
- Reserve #36f4a4 for functional moments: active nav, focus rings, key link accents, highlight tags. Never use it for decorative fills or large background areas.
- Apply letter-spacing 0.015–0.04em on Neue Haas Grotesk at 48px+; tight tracking on heavy display type but slightly opened on small sizes.
- Use 12px radius for cards and 4px for inputs/buttons — these two values carry the geometric identity.
- Set font-feature-settings to "ss03" on both type families to preserve the alternate character set that defines the brand's typographic feel.

### Don't
- Don't use weight 600+ at display sizes — it overpowers the whisper-light headlines and collapses the system's contrast between headline and body.
- Don't introduce new chromatic colors for buttons or CTAs — white pill on dark is the only primary action; ghost white-bordered pill is the only secondary.
- Don't use #36f4a4 as a background fill or large surface color — it loses its power as a functional spark when applied broadly.
- Don't add drop shadows beyond the subtle inset highlights — heavy shadows break the flat dark-surface language and the inset-bright border convention.
- Don't use radius values other than 12px (cards), 4px (inputs), or 9999px (pills) — inconsistent rounding breaks the geometric consistency.
- Don't use light-theme colors (white surfaces, dark text) except inside merchant/product embeds where the merchant's own content takes over.
- Don't set body copy in #ffffff — use #99b3ad or #a1a1aa so the hierarchy between headline (white) and paragraph (muted) remains intact.

## Elevation

- **Feature card:** `rgba(5, 24, 19, 0.05) 0px 20px 60px 0px, rgb(19, 59, 50) 0px 1px 0px 0px inset`
- **Standard card:** `rgba(0, 0, 0, 0.1) 0px 8px 8px 0px, rgba(0, 0, 0, 0.1) 0px 4px 4px 0px, rgba(0, 0, 0, 0.1) 0px 2px 2px 0px, rgba(0, 0, 0, 0.1) 0px 0px 0px 1px, rgba(255, 255, 255, 0.03) 0px 1px 0px 0px inset`
- **Button:** `rgba(255, 255, 255, 0.05) 0px 1px 2px 0px, rgba(255, 255, 255, 0.04) 0px 1px 0px 0px inset`
- **Dropdown/list:** `rgba(0, 0, 0, 0.2) 10px 13px 12px 2px`

## Surfaces

- **Canvas** (`#02090a`) — Page background, hero sections, outer page chrome
- **Card Surface** (`#061a1c`) — Standard card and content block background
- **Elevated Panel** (`#072720`) — Navigation bar, raised feature cards with subtle green lift
- **Inset/Product Surface** (`#000a1`) — Secondary demo embeds, product preview frames

## Imagery

Imagery is merchant-first: full-bleed product photography and brand event photos carry the visual weight, often as hero-scale backgrounds with overlaid white type. Shots are tightly cropped, high-contrast, and celebratory (Nasdaq bell-ringing, group cheers, product-in-hand close-ups). The dark canvas makes these photographs feel like illuminated spotlights. Illustrations are minimal — product embeds and merchant storefront screenshots do most explanatory work. Icons are mono-outline at 1.5–2px stroke, typically white or #36f4a4 for active states.

## Layout

Max-width ~1280px centered, with full-bleed hero sections that break out of the container for photography. The page rhythm alternates: (1) full-bleed dark hero with overlaid headline + pill CTAs, (2) comfortable dark sections with max-width 2-column text+image blocks or 3-column image grids, (3) interactive demo panels (product card, shipping calculator, world map) that float as raised cards against the deeper canvas. Navigation is a sticky top bar with logo + 3 nav items + utility links + primary CTA right-aligned. Vertical rhythm uses 80px section gaps with seamless flow — no dividers between dark sections, just surface tone shifts.

## Similar Brands

- **Linear** — Same dark-mode near-black canvas with a single chromatic accent (Linear's purple vs Shopify's mint), ultra-light display type, and hairline-border cards on layered dark surfaces.
- **Vercel** — Similar ultra-clean dark UI with geometric sans-serif at large sizes, pill buttons, and the philosophy that product/photography content should be the visual focus against a quiet dark canvas.
- **Notion** — Comfortable-density dark theme with the same instinct to keep UI chrome minimal and let user/merchant content carry the visual weight, with restrained accent color use.
- **Stripe** — Linear-style gradient overlays on dark sections, pill buttons, and the same approach to mixing brand color sparingly with a largely achromatic interface.
