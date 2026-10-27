# Klarna ES — Style Reference
> midnight gallery with candy accents — a near-black plum void opens onto a warm bone-white floor scattered with vibrant product cards, anchored by oversized geometric type and pill-shaped controls.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Klarna's visual system is a confident dark-meets-light duality: a near-black plum (#0b051d) anchors brand presence across the hero and display type, set against a warm bone-white canvas (#f9f8f5) that keeps content sections approachable rather than clinical. Oversized custom display typography at 90px commands the hero, while compact body text at 16px stays quiet and legible. Playful accent colors — bubblegum pink, lavender, lime, deep plum — appear as small punctuation on cards and CTAs, never as structural or background elements. Generous rounded corners (16-32px on cards, pill-shaped buttons), near-zero shadows, and hairline borders create a premium, almost gallery-like feel where depth comes from color contrast and scale, not from elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Plum | `#0b051d` | Violet supporting accent for decorative details and low-frequency emphasis. |
| Deep Plum | `#2c2242` | Accent card background — a slightly lifted version of Midnight Plum, used for dark-themed product/feature cards to create tonal variation within the dark family |
| Lavender Mist | `#aa89f2` | Violet supporting accent for decorative details and low-frequency emphasis |
| Lime Sherbet | `#e6ffa9` | Accent card background — high-key lime used as a rotating card surface color. High contrast against Midnight Plum text makes it ideal for dark-on-light product cards |
| Bubblegum Pink | `#ffa8cd` | Red supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Warm Bone | `#f9f8f5` | Page canvas — the warm off-white that fills the body of every content section. Slightly cream-toned to feel inviting rather than clinical |
| Pure White | `#ffffff` | Card surfaces and nav background — used for elevated cards on the Warm Bone canvas, and for the sticky top navigation bar |
| Silver Mist | `#e2e2e7` | Hairline borders, input outlines, and card edge definition. Also functions as the inset shadow color on buttons (rgb(228, 227, 223) inset ring) |
| Storm Gray | `#615f6d` | Primary muted text — body copy, nav links, secondary descriptions. Near-gray with a slight cool violet undertone matching the brand |
| Slate Gray | `#75727f` | Secondary text — captions, helper text, fine print, and less prominent body copy |
| Charcoal Plum | `#373544` | Dark UI text and button borders — used on pill buttons and nav controls where a softer dark than Midnight Plum is needed |
| Ash Gray | `#999999` | Tertiary neutral — placeholder text, disabled states, and very low-emphasis UI elements |

## Typography

### Klarna Title — Custom display font used exclusively for headings and hero text. Sizes escalate dramatically (40→58→90px) with tight 1.05-1.10 line-height — the 90px hero weight is a signature: oversized geometric type that commands the viewport. Normal letter-spacing at these sizes lets the letterforms breathe at their natural width.
- **Substitute:** Inter, system-ui, -apple-system
- **Weights:** 500, 700
- **Sizes:** 40px, 41px, 52px, 58px, 90px
- **Line height:** 1.05, 1.06, 1.10
- **Letter spacing:** normal

### Klarna Text — Custom UI/body font for navigation labels, input text, and smaller headings. Slight negative tracking (-0.01em) tightens display usage; -0.003em for body keeps text compact without feeling cramped. Weight 500 for nav, 700 for subheadings, 400 for body.
- **Substitute:** Inter, system-ui, -apple-system
- **Weights:** 400, 500, 700
- **Sizes:** 14px, 16px, 20px
- **Line height:** 1.05, 1.20, 1.30
- **Letter spacing:** -0.0100em, -0.0030em

### -apple-system — System font fallback for body text, links, buttons, and general UI at 12-20px. Tighter line-heights (1.14-1.20) for compact UI elements, relaxed 1.43-1.50 for readable body paragraphs.
- **Substitute:** -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 20px
- **Line height:** 1.00, 1.05, 1.14, 1.20, 1.25, 1.43, 1.50
- **Letter spacing:** -0.0030em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.43 | -0.003px |
| body | — | — | 16px | 1.5 | -0.003px |
| subheading | — | — | 20px | 1.25 | — |
| heading-sm | — | — | 40px | 1.1 | — |
| heading | — | — | 52px | 1.06 | — |
| heading-lg | — | — | 58px | 1.05 | — |
| display | — | — | 90px | 1.05 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 20px
- **cards:** 16px
- **pills:** 999px
- **images:** 32px
- **inputs:** 20px
- **buttons:** 100px

## Components

### Top Navigation Bar
**Role:** Sticky header with logo, nav links, search, and sign-in

White (#ffffff) background, full-width, ~64px height. Klarna wordmark left in Midnight Plum, nav links centered in Storm Gray with 500 weight, search icon and dark 'Inicio de sesión' pill button right. Nav links: 'Descubre Klarna', 'Compra', 'App de Klarna', 'Ayuda'. Top utility row above in small text.

### Pink Accent CTA Button
**Role:** Primary action call-to-action in hero and feature areas

Pill-shaped (100px border-radius), Bubblegum Pink (#ffa8cd) background, Midnight Plum (#0b051d) text at 16px weight 500, padding ~10px 20px. This is the playful action color — warm and inviting. Use sparingly, one per screen at most.

### Dark Sign-in Pill Button
**Role:** Navigation sign-in / login action

Pill-shaped (100px radius), Midnight Plum (#0b051d) background, white text, 16px weight 500, 10px 20px padding. Contrasts with the pink CTA as the 'serious' counterpart action in the nav bar.

### Ghost Text Link with Arrow
**Role:** Secondary navigation link under feature cards

No background or border, Storm Gray (#615f6d) text at 16px, right-arrow icon (→) inlined. Text: 'Más información' or 'Descarga la app'. Underlined on hover.

### Dark Hero Section
**Role:** Full-bleed opening section with headline and product visual

Full-width Midnight Plum (#0b051d) background, ~560px height. Left: 90px display headline in white. Right: phone mockup image with 32px border-radius. Below headline: body text in lighter gray with a pink CTA button. The dark hero is a signature — it sets a premium, gallery-like tone before transitioning to the warm light canvas.

### White Feature Card
**Role:** Light card in the feature grid with product image

White (#ffffff) background, 16px border-radius, image area with 32px radius, 24px padding. Card title in 20px Midnight Plum weight 700, 'Más información →' text link below. Subtle drop shadow: rgba(0,0,0,0.1) 0 2px 4px.

### Accent Feature Card (Colored)
**Role:** Vibrant product/feature card with colored background

Full-bleed colored background — rotating between Lavender Mist (#aa89f2), Lime Sherbet (#e6ffa9), Deep Plum (#2c2242). 16px border-radius, product image or illustration fills the card. Title in 20px weight 700, link arrow below. These cards bring the 'candy' to the gallery — they should be scattered, not grouped, for visual rhythm.

### Section Heading Block
**Role:** Large section title introducing a content area

Left-aligned, 40-58px Klarna Title weight 500-700, Midnight Plum text, no subtitle. Tight line-height (1.05-1.10). Typically sits above a card grid or feature row with 48px gap below.

### Search Input
**Role:** Rounded search field in the nav bar

Circular/pill input, Warm Bone (#f9f8f5) background, Silver Mist (#e2e2e7) 1px inset border, search icon left, placeholder text in Ash Gray. 20px+ border-radius for pill shape.

### App Rating Badge
**Role:** Social proof indicator in the hero

Small inline element: star icon (★) + rating text in white, '4,8/5 en el App Store'. No background or border, sits inline with hero description text.

### Legal Disclaimer Block
**Role:** Fine print and regulatory text

Full-width below feature cards, Storm Gray (#615f6d) text at 12-14px, tight line-height, with underlined links. Multi-paragraph, separated by superscript markers (1, 2, 3). Uses the system font, not Klarna Text.

### Phone Mockup Visual
**Role:** Hero product screenshot showing the Klarna app

Large image of a hand holding a phone, phone screen showing payment options. 32px border-radius on the phone frame. Takes up roughly 40% of the hero width. The human hand (with neon green sleeve, gold rings, yellow nails) adds warmth and lifestyle context — this is the only photography in the system.

## Do's and Don'ts

### Do
- Use Midnight Plum (#0b051d) for all display headlines, hero backgrounds, and primary text — it's the signature brand color
- Set page background to Warm Bone (#f9f8f5) for all content sections; reserve Midnight Plum for full-bleed dark sections only
- Scale Klarna Title aggressively: 40px for section headings, 58px for major, 90px for hero — tight line-height (1.05-1.10) is essential
- Use pill-shaped buttons (100px border-radius) for all interactive controls; pink (#ffa8cd) for accent CTAs, Midnight Plum for serious actions
- Place accent cards (lavender, lime, deep plum) as individual scattered items, never in consecutive pairs — rhythm requires breathing room
- Use 16px border-radius for cards and 32px for images/visuals; avoid 4-8px radii which would feel too sharp for this system
- Keep shadows minimal: a single rgba(0,0,0,0.1) 0 2px 4px on cards, and 1px inset #e2e2e7 borders on buttons — never stack or blur shadows

### Don't
- Don't use gray or neutral backgrounds for CTA buttons — pink (#ffa8cd) and Midnight Plum (#0b051d) are the only button fills
- Don't use small heading sizes — the system requires 40px+ for any heading-level text; 16-20px is body/UI only
- Don't add heavy drop shadows, glows, or glassmorphism — the design relies on flat color contrast for depth
- Don't use pure black (#000000) — always use Midnight Plum (#0b051d) for dark elements to maintain the violet undertone
- Don't group accent cards together (lavender next to lime next to plum) — intersperse with white cards for visual rest
- Don't use line-heights above 1.20 for display type — the tight 1.05-1.10 line-height is what makes the oversized headlines feel controlled
- Don't use system fonts for display headings — Klarna Title at 40px+ is the signature and must not be replaced with generic sans-serif

## Elevation

- **Card:** `rgba(0, 0, 0, 0.1) 0px 2px 4px 0px`
- **Button (inset border):** `rgb(228, 227, 223) 0px 0px 0px 1px inset`

## Surfaces

- **Page Canvas** (`#f9f8f5`) — Warm off-white body background filling all content sections
- **Card Surface** (`#ffffff`) — White cards sitting on the Warm Bone canvas, and the top nav bar
- **Accent Card Surfaces** (`#aa89f2`) — Vibrant rotating card backgrounds (lavender, lime, deep plum) for feature/product showcases
- **Dark Hero Surface** (`#0b051d`) — Full-bleed dark hero section and dark-themed product cards

## Imagery

Imagery is minimal but intentional. The hero features a single large lifestyle photograph: a hand with neon green sleeve, gold rings, and yellow-painted nails holding a phone displaying the Klarna app. This is the only photography in the system and it carries significant weight — the hand's bold styling mirrors the playful accent palette. Product screenshots appear in feature cards, shown on phone frames with 32px corner radius. No illustrations, no abstract graphics, no 3D renders. The visual language is: one warm human moment, surrounded by colorful product cards, set against generous white space.

## Layout

The page uses a max-width 1200px centered container with full-bleed dark hero. The hero is a split layout: oversized left-aligned headline (occupying ~45% width) paired with a right-aligned phone mockup (~40% width). Below the hero, the page flows in single full-width bands of Warm Bone (#f9f8f5) canvas, each containing centered content. The primary content pattern is a 4-column card grid (gap: 24px) with a section heading above. Cards alternate between white and accent-colored backgrounds for visual rhythm. Navigation is a sticky white top bar with centered links, search icon, and dark sign-in pill button right-aligned. Vertical rhythm is generous: 48px section gaps, 16px element gaps, 24px card padding. The overall page reads as: dark dramatic opening → light airy content with colorful product cards → quiet legal disclaimer band.

## Similar Brands

- **Revolut** — Same dark-on-light duality with a deep near-black brand color, oversized geometric headlines, and rounded card components in a fintech context
- **N26** — Similar premium fintech visual language with generous border-radius, pill-shaped controls, and a restrained palette with single vibrant accent moments
- **Cash App** — Shares the playful approach to fintech with vibrant accent colors (pink/lime) scattered across cards on a light canvas, though Cash App leans more saturated
- **Wise** — Same warm off-white canvas treatment, oversized custom display typography, and minimal shadow philosophy where depth comes from color contrast
- **Spotify** — Similar confident use of oversized display type, dark hero-to-light-content transition, and a restrained base palette that lets accent colors pop on cards
