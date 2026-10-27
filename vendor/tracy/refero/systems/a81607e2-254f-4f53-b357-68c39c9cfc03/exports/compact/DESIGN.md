# Genway — Style Reference
> Indigo observatory at lavender dawn — a research terminal floating above a violet mist.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Genway operates in a deep-indigo-and-lavender atmosphere: a near-white canvas that dissolves into a vivid violet gradient wash, then returns to paper-white further down the page. The visual language is built on three forces — a single dominant indigo (#0a0449) that owns every headline, a soft lavender gradient (#e2e0f9 → #cfccf5) that provides atmospheric depth, and generous white space that makes both elements feel premium rather than loud. Typography is massive and geometric (Geist Bold at 88px for display with -0.04em tracking), creating a research-terminal authority that contrasts with the dreamy purple wash beneath. Surfaces stay feather-light — white cards with 12-32px radii, hairline violet-tinted borders, and shadows that bleed the brand's own indigo into the canvas rather than using generic gray drops. The overall effect is an AI research workspace that feels both scientifically precise and softly inviting, like a observatory at violet dawn.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Indigo | `linear-gradient(0deg, rgb(10, 4, 73) 0%, rgb(107, 94, 224) 145%)` | Primary brand color, all display headlines, logo, dominant borders — the gravitational center of the system; Dark-to-light gradient — midnight indigo dissolving into vivid violet for dramatic panels |
| Vivid Violet | `linear-gradient(rgba(255, 255, 255) 0%, rgba(107, 94, 224, 0.12) 100%)` | Accent fills, gradient endpoints, decorative highlights, secondary text emphasis; Signature hero gradient — translucent violet dissolving into pure white |
| Midnight Iris | `#0a0163` | Darkest accent, gradient start, heavy emphasis text and fills in dark contexts |
| Slate Lavender | `#706e87` | Body text, muted UI labels, secondary navigation, link borders, ghost button strokes — near-gray with a violet cast |
| Soft Mauve | `#a89fc7` | Shadow tint, filled surface accents, decorative washes — bridges neutral and brand |
| Dusty Rose | `#a085a6` | Secondary muted text, subtle decorative strokes, soft border accents |
| Blush Petal | `#efb9fd` | Decorative highlight, soft glow accents, illustration fills |
| Lavender Mist | `#f7f6fd` | Card and elevated surface backgrounds — the quietest off-white with a violet undertone |
| Pure White | `#ffffff` | Primary page canvas, card surfaces, inverse text on dark backgrounds |
| Ink Black | `#000000` | Hairline borders, high-frequency structural lines, icon strokes |
| Pale Wisteria | `linear-gradient(rgb(226, 224, 249) 0%, rgb(194, 187, 242) 40%)` | Gradient surface tone, soft glow backgrounds; Atmospheric gradient — soft lilac into deeper morning-lilac for depth panels |
| Morning Lilac | `#cfccf5` | Gradient surface tone, atmospheric depth washes |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Geist — Primary typeface across the entire system. Geist Bold (weight 600) carries all display and heading sizes from 36-88px with aggressive -0.04em tracking; Geist SemiBold handles subheadings and card titles at 14-36px; Geist Regular flows body and caption text at 10-24px. The geometric precision of Geist pairs with the deep indigo to create a research-terminal feel — the letterforms feel measured and exact, which suits an AI research product. The extreme size range (10px to 88px) is a signature: display headlines at 88px are nearly 9x the smallest text, creating dramatic scale contrast.
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 10, 12, 14, 16, 20, 24, 36, 56, 68, 88
- **Line height:** 0.90, 1.00, 1.20, 1.30, 1.50
- **Letter spacing:** -0.04em at 56-88px, -0.02em at 20-36px, -0.01em at 14-16px, -0.04em at 10-12px

### Geist Regular — Geist Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px, 12px, 14px, 16px, 20px, 24px
- **Line height:** 1.2, 1.3, 1.5
- **Letter spacing:** -0.04, -0.02

### Geist SemiBold — Geist SemiBold — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px, 16px, 24px, 36px
- **Line height:** 1.2, 1.3, 1.5
- **Letter spacing:** -0.02, -0.01

### Geist Bold — Geist Bold — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 56px, 68px, 88px
- **Line height:** 0.9, 1
- **Letter spacing:** -0.04

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.24px |
| body-sm | — | — | 14px | 1.5 | -0.14px |
| body | — | — | 16px | 1.5 | -0.32px |
| body-lg | — | — | 20px | 1.3 | -0.4px |
| subheading | — | — | 24px | 1.3 | -0.48px |
| heading-sm | — | — | 36px | 1.2 | -0.72px |
| heading | — | — | 56px | 1 | -2.24px |
| heading-lg | — | — | 68px | 1 | -2.72px |
| display | — | — | 88px | 0.9 | -3.52px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **cards:** 12px
- **badges:** 200px
- **avatars:** 9999px
- **buttons:** 8px
- **largeCards:** 32px
- **smallElements:** 8px

## Components

### Top Navigation Bar
**Role:** Minimal header

White/transparent background, logo left in Deep Indigo (#0a0449) at 16px SemiBold, three text links right-aligned (About, Blog, Login) in Slate Lavender (#706e87) at 14px Regular. No background fill, no shadow, no border — the nav is invisible until you look for it, letting the hero own attention. Height ~64px, full-width with inner max-width 1200px.

### Display Headline
**Role:** Hero title

Geist Bold at 88px, line-height 0.90, letter-spacing -3.52px (-0.04em), color Deep Indigo (#0a0449). The extremely tight line-height (0.9) and aggressive tracking create a dense, commanding block of type. Maximum 2 lines. No gradient text — the indigo is solid and absolute.

### Hero Subheadline
**Role:** Supporting hero text

16-18px Geist Regular, line-height 1.5, color Slate Lavender (#706e87). Centered beneath the display headline, max-width ~600px. Quiet by design — the headline shouts, the subhead whispers.

### Gradient Wash Section
**Role:** Atmospheric section background

Full-width band with vertical gradient from Lavender Mist (#f7f6fd) at top through Pale Wisteria (#e2e0f9) to Morning Lilac (#cfccf5) at bottom, or a violet wash using rgba(105, 92, 224, 0.2) → #cfccf5. No border, no shadow — the gradient IS the visual element. Content sits on top with white or light text.

### Numbered Step Card
**Role:** Process step indicator

Three-column card on the gradient. Number badge (01/02/03) in a 200px-radius circle, 48-56px diameter, white text on translucent white/lavender fill. Title at 20-24px SemiBold in white. Description at 14px Regular in white at 80% opacity. No card border or background — the cards are text compositions floating on the gradient.

### Client Logo Strip
**Role:** Social proof band

Horizontal row of 6-7 grayscale logos on the gradient wash, evenly spaced, Slate Lavender (#706e87) or 40% white. Logos are rendered as simple wordmarks or icon+text marks. No borders, no cards — the logos breathe directly on the gradient.

### Two-Tone Section Heading
**Role:** Section title with hierarchy contrast

Two stacked lines: first line in Soft Mauve (#a89fc7) or Slate Lavender at 36-56px, second line in Deep Indigo (#0a0449) at 36-56px Geist Bold. The color shift between lines creates an emphasis pattern without changing weight. Example structure: 'Conducted by AI' (muted) / 'Loved by humans' (bold indigo).

### Product Preview Card
**Role:** Dashboard or UI screenshot frame

White (#ffffff) card with 16-32px radius, 1px border in rgba(10, 1, 99, 0.08), and the signature violet-tinted shadow: rgba(10, 1, 99, 0.4) 0px 8px 16px -10px. Internal content is a full product UI mockup (sidebar nav, project cards, avatars). 32px internal padding. The violet-tinted shadow is critical — it makes even the drop shadow feel on-brand.

### Chat Interface Card
**Role:** AI conversation mockup

White card with 12-16px radius, containing chat bubbles alternating left/right. User bubbles: Lavender Mist (#f7f6fd) background, Slate Lavender text. AI bubbles: white with Deep Indigo text, accompanied by small icon avatars at 9999px radius. Cards float on the gradient with subtle 4px violet-tinted ring shadow: rgba(10, 1, 99, 0.08) 0px 0px 0px 4px.

### Quote Chip
**Role:** Testimonial snippet

Pill-shaped container (200px radius), Lavender Mist (#f7f6fd) or white fill, 12-16px horizontal padding, 8-12px vertical padding. Text at 14px Regular in Slate Lavender (#706e87). No border, no shadow. Arranged in a horizontal row of 2-3 chips.

### Outline Action Button
**Role:** Secondary/ghost action

8px radius, 1px border in Slate Lavender (#706e87), transparent fill, text in Slate Lavender or Deep Indigo at 14px SemiBold. Padding 10px 20px. No shadow, no fill — a text-first action that feels light and non-committal. Used for navigation-like actions (Login, secondary CTAs).

### Feature Card
**Role:** Content card on light surface

White or Lavender Mist (#f7f6fd) background, 12px radius, 1px hairline border in rgba(10, 1, 99, 0.08) or transparent. 24-32px padding. Title at 16-20px SemiBold in Deep Indigo. Body at 14px Regular in Slate Lavender. No shadow on light surfaces — elevation comes from background contrast and hairline borders.

### Floating UI Element
**Role:** Decorative product mockup chip

Small white card (200x80px range) with 12px radius, positioned absolutely over the gradient as a floating accent. Contains simplified UI elements (text, icons, small avatars). Slight rotation (-2 to 2 degrees) for organic feel. Uses the same violet-tinted shadow.

## Do's and Don'ts

### Do
- Use Deep Indigo (#0a0449) for all display headlines and primary text — it is the only chromatic text color that matters at the heading level
- Apply the violet-tinted shadow rgba(10, 1, 99, 0.4) 0px 8px 16px -10px for all elevated cards; never use neutral gray shadows
- Set display headlines at 88px with -3.52px letter-spacing and 0.9 line-height — the extreme density is the signature
- Use the Lavender Mist (#f7f6fd) surface for cards that need to separate from pure white without adding visual weight
- Build atmospheric depth with the lavender gradient washes (#e2e0f9 → #cfccf5) rather than solid colored backgrounds
- Keep body text in Slate Lavender (#706e87), never pure gray — the violet cast ties text to the brand palette
- Use 8px and 32px as the two anchor card radii — 8px for compact elements, 32px for hero content cards

### Don't
- Don't use a separate blue or teal accent — indigo IS the brand color; introducing another hue dilutes the system
- Don't use neutral gray shadows like rgba(0, 0, 0, 0.1) — every shadow should bleed the brand's indigo
- Don't set display headlines below 56px or above 88px — the scale contrast is what creates impact
- Don't use line-height above 1.0 for display sizes — the tight leading (0.9) is essential to the type's density
- Don't fill backgrounds with solid vivid violet (#6b5ee0) — it should only appear as gradient endpoint, accent fill, or text
- Don't add borders thicker than 1px — the system relies on hairline violet-tinted lines, never heavy rules
- Don't use pure black (#000000) for text — Deep Indigo (#0a0449) reads as softer while maintaining maximum contrast

## Elevation

- **Product Preview Card:** `rgba(10, 1, 99, 0.4) 0px 8px 16px -10px`
- **Chat Interface Card:** `rgba(10, 1, 99, 0.08) 0px 0px 0px 4px`
- **Floating UI Element:** `rgba(10, 1, 99, 0.4) 0px 8px 16px -10px`

## Surfaces

- **Canvas White** (`#ffffff`) — Primary page background — the starting surface for all content
- **Lavender Mist** (`#f7f6fd`) — Elevated card surface — the quietest off-white for separating content from the canvas
- **Gradient Wash** (`#cfccf5`) — Atmospheric section backgrounds — lavender gradient creating visual depth bands
- **Vivid Violet** (`#6b5ee0`) — Accent surface for highlights, gradient endpoints, and interactive emphasis
- **Deep Indigo** (`#0a0449`) — Dark surface for inverted panels and maximum-emphasis containers

## Imagery

No photography — the visual language is entirely product-screenshot and UI-mockup based. Product cards show actual interface previews (dashboards, chat windows, project lists) with real data placeholders. Decorative floating UI elements (small cards, chips, avatars) are arranged at slight rotations over the gradient washes to create depth. Avatars are circular (9999px radius) with solid color fills or simple gradient backgrounds. Icons appear to be simple line-art or filled geometric shapes in Deep Indigo or Slate Lavender. The chat mockups show conversational AI exchanges with message bubbles, creating a sense of the product in action without needing screenshots of real users.

## Layout

Full-width sections with max-width 1200px inner content. The hero is a vertically split composition: top half is white space with a centered display headline and subhead, then the bottom half transitions into a violet gradient wash that fills the viewport. Content on the gradient is centered and white-on-violet. Below the hero, the page returns to white with a soft lavender radial glow behind section headings. Sections are separated by 96px gaps with generous vertical breathing room. Cards and product mockups are centered, typically in a 3-column grid for step indicators and single-column for hero product showcases. The navigation is minimal — just a logo and three text links, no mega-menu, no sticky header visible. The overall density is airy: 60% white space, compact only within card internals.

## Similar Brands

- **Linear** — Same compact Geist-family typography with aggressive negative tracking on display sizes, hairline borders, and deep dark-on-light text hierarchy
- **Vercel** — Shares the Geist typeface origin and the minimalist approach where gradient washes replace solid colored sections as atmospheric depth
- **Resend** — Same light-canvas + single bold accent + oversized display type philosophy with tight letter-spacing and airy section spacing
- **Perplexity** — Similar AI-product feel with indigo/purple as the primary chromatic identity and product mockups floating on gradient backgrounds
- **Anthropic** — Same restrained color palette where a single deep hue carries all brand weight, with warm gradient washes providing the only atmospheric color
