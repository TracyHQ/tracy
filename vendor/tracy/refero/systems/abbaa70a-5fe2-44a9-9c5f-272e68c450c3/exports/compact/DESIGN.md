# Customer.io — Style Reference
> dark spruce forest meeting cream paper

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Customer.io uses a deep forest palette anchored in near-black spruce greens, creating a page that feels like dark pine on warm paper. Typography is custom Saans at near-uniform weight 475 — an unusual medium-light voice that avoids the typical SaaS shout of bold headings, instead making 96px display text feel architectural and quietly authoritative. Color appears sparingly as functional punctuation: a vivid verdant green glow marks interactive elements, while warm cream surfaces and soft blue washes tint alternate sections. The system is built on thin 1px borders, minimal elevation, pill-shaped primary buttons, and 2px corner radii everywhere else — a flat, almost editorial product surface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Spruce Abyss | `#00191c` | Deepest background — footer canvas, dramatic section breaks |
| Spruce 900 | `#032125` | Primary dark surface — headers, hero, main navigation background; dominant text color on light surfaces |
| Spruce 700 | `#0b363b` | Primary CTA fill on dark backgrounds, elevated card surfaces, border accent |
| Spruce 500 | `#437278` | Muted teal accent — illustration fills, secondary icon color |
| Spruce 200 | `#a1c2c6` | Decorative stroke, muted link text, icon outlines on dark surfaces |
| Spruce Mist | `#354d51` | Body text on light surfaces, secondary heading color |
| Charcoal 100 | `#ebebeb` | Hairline borders, dividers, subtle separators across the interface |
| Charcoal Mist | `#fafafa` | Alternate section background, subtle card backgrounds |
| Cream Warm | `#fffcf6` | Primary light surface — content sections, card backgrounds |
| Pure White | `#ffffff` | Elevated card surface, button text on dark fills, content blocks |
| Verdant 300 | `#abffae` | Interactive glow — CTA button fill, focus ring halo, active state border; vivid green signals action without aggression |
| Verdant Whisper | `#eafde8` | Primary page canvas and white card surfaces. Use as a supporting accent, not as a status color |
| Wave 700 | `#123a88` | Violet text accent for links, tags, and emphasized short phrases. |
| Wave 500 | `#0a6de6` | Heading accent color for keyword highlights in display text |
| Wave Frost | `#e2f4ff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Use as a supporting accent, not as a status color |
| Zest 700 | `#863d1c` | Orange text accent for links, tags, and emphasized short phrases. |
| Zest Blush | `#fdf0e9` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Use as a supporting accent, not as a status color |
| Mustard 700 | `#83611c` | Yellow text accent for links, tags, and emphasized short phrases. |

## Typography

### Saans — Custom display + body typeface used for everything. Weight 475 dominates — a near-medium voice that feels calm and confident rather than aggressive.
- **Substitute:** Inter, Helvetica Neue, Arial
- **Weights:** 475, 500, 600, 700
- **Sizes:** 10px, 12px, 14px, 16px, 18px, 20px, 24px, 30px, 40px, 48px, 96px
- **Line height:** 1.00 (display), 1.13 (headings), 1.38 (body)
- **Letter spacing:** 0.0020em at 96px, 0.0040em at 48px, 0.0050em at 40px, 0.0070em at 30px, 0.0080em at 24px, 0.0100em at 20px, 0.0110em at 18px, 0.0130em at 16px, 0.0140em at 14px, 0.0170em at 12px, 0.0200em at 10px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.38 | 0.2px |
| body | — | — | 16px | 1.38 | 0.21px |
| subheading | — | — | 20px | 1.13 | 0.2px |
| heading-sm | — | — | 24px | 1.13 | 0.19px |
| heading | — | — | 30px | 1.13 | 0.21px |
| heading-lg | — | — | 40px | 1.13 | 0.2px |
| display | — | — | 96px | 1 | 0.19px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 24px

### Border Radius

- **tags:** 2px
- **cards:** 2px
- **images:** 6px
- **inputs:** 2px
- **buttons:** 9999px
- **default:** 2px

## Components

### Primary Pill Button
**Role:** Main CTA — 'Get started'

Pill shape (9999px radius), Verdant 300 (#abffae) background, Spruce 900 (#032125) text at 16px weight 475, padding 8px 20px, 4px Verdant glow shadow ring on hover/focus

### Secondary Outline Button
**Role:** Secondary CTA — 'Book a demo'

Pill shape (9999px radius), transparent background, Spruce 900 (#032125) text at 16px weight 475, 1px Spruce 700 (#0b363b) border, padding 8px 20px

### Ghost Navigation Button
**Role:** Nav item with dropdown

Transparent background, Spruce 900 text at 16px weight 475, no border, padding 0 16px, chevron indicator

### Small Tag Button
**Role:** 'New' badge, 'case study' link

2px radius, subtle background tint, Mustard 700 (#83611c) text at 12-14px weight 475, padding 4px 8px

### Content Card
**Role:** Feature card, platform overview tile

32px padding all sides, Pure White (#ffffff) background, 1px Charcoal 100 (#ebebeb) hairline border, 2px corner radius, no shadow

### Dark Section Card
**Role:** Card on dark spruce background

32px padding, Spruce 700 (#0b363b) background, 1px Spruce 700 border, 2px radius, Spruce 200 (#a1c2c6) body text

### Tinted Feature Surface
**Role:** Section background with soft color wash

Full-bleed tinted background — Wave Frost (#e2f4ff), Zest Blush (#fdf0e9), or Verdant Whisper (#eafde8), 2px radius containers inside, generous 96px vertical padding

### Footer Column
**Role:** Footer link column

4-column grid on Spruce Abyss (#00191c) background, white heading text at 16px weight 600, Spruce 200 (#a1c2c6) link text at 14px, 24px row gap

### Logo Strip Card
**Role:** Customer logo in trust strip

Pure White background, 1px Charcoal 100 border, 2px radius, logo centered, no padding variation; arranged in horizontal marquee

### Heading with Keyword Accent
**Role:** Display headline with colored words

96px Saans weight 475, Spruce 900 base text with individual words in Zest 700 ('messaging'), Wave 700 ('AI'), Wave 500 ('AI'), Verdant 600 ('data'), Nova 500 ('customers') — words stay inline, color creates semantic meaning

### Trust Indicator Row
**Role:** Social proof list — '14-day free trial'

Inline list with checkmark icon (Verdant 300), Spruce 900 text at 14px, separated by 16px gaps, no bullet markers

### Interactive Product Preview
**Role:** Hero product screenshot

Large product UI screenshot with browser chrome, set against a warm interior photography background with green plant, no border or shadow — raw edges blending into scene

### Status Badge
**Role:** 'All Systems Operational' indicator

Small green dot (2px radius circle, Verdant 300 fill) beside white text at 12px weight 500

## Do's and Don'ts

### Do
- Use 2px border-radius on all cards, inputs, images, and containers — pill shapes (9999px) are reserved exclusively for buttons
- Use weight 475 for all text including 96px display headlines — never bold above 600 except for 20px subheadings
- Use 1px solid #ebebeb hairline borders for card edges and dividers — never thicker
- Color individual words in display headlines using #863d1c (orange), #123a88 (blue), #41a251 (green), #b52473 (pink) — words stay inline, never separate blocks
- Use #abffae exclusively for primary CTA fills and focus glow rings — never as body text or background tint
- Use 24px for element gaps, 32px for card padding, 96px for section vertical gaps — the 4px base unit scales through these three tiers
- Use #fffcf6 as the default light surface; alternate to #032125 for dark sections; tint with #e2f4ff, #fdf0e9, or #eafde8 for semantic accent bands
- Use 4px colored focus glow rings (0px 0px 0px 4px) for interactive focus states instead of outline or shadow changes

### Don't
- Never use drop shadows for elevation — depth comes from colored 4px glow rings only
- Never use bold weights above 600 for display or heading text — the signature is the calm 475 voice
- Never use corner radius above 2px on non-button elements — sharp-cornered cards define this system
- Never use #0000ee or default browser blue for links — links use #032125 or #a1c2c6
- Never place #abffae on white or light backgrounds without sufficient contrast — it is a glow color, not a fill
- Never use more than 4 columns in content grids — the system favors generous spacing over density
- Never use the heading accent colors (#863d1c, #123a88, etc.) for UI chrome — they exist only for inline keyword coloring in display text

## Elevation

- **Primary Pill Button (focus):** `0px 0px 0px 4px oklch(0.9263 0.136 145.2) — 4px Verdant glow ring`
- **Secondary Button (focus):** `0px 0px 0px 4px oklch(0.97 0 0) — 4px white glow ring`
- **Dark Section Button (focus):** `0px 0px 0px 4px oklch(0.3068 0.046 206.34) — 4px Spruce glow ring`

## Surfaces

- **Spruce Abyss** (`#00191c`) — Deepest canvas — footer and dramatic section breaks
- **Spruce Dark** (`#032125`) — Primary background for headers, hero, and major sections
- **Spruce Mid** (`#0b363b`) — Card surfaces, elevated panels, button fills on dark backgrounds
- **Cream Warm** (`#fffcf6`) — Primary light surface for content sections, card backgrounds
- **Charcoal Mist** (`#fafafa`) — Subtle alternating background tint
- **Zest Blush** (`#fdf0e9`) — Warm accent wash for feature callouts
- **Verdant Whisper** (`#eafde8`) — Soft green tint for success-related surfaces
- **Wave Frost** (`#e2f4ff`) — Soft blue tint for info-related surfaces
- **Pure White** (`#ffffff`) — Topmost surface — elevated cards, content blocks

## Imagery

Warm interior photography with greenery as the backdrop for the hero product preview — a person working at a desk with potted plants, soft natural light, slightly desaturated warm tones. Product screenshots are presented raw without device frames or shadows, blending directly into the photographic background. The brand mark uses a geometric double-chevron arrow symbol in Spruce 900. No illustrations — the visual language is photography + product UI + typography-driven keyword coloring in headings. Logo strip is monochrome black marks on white. The overall density is moderate: generous whitespace in hero, information-dense footer with 4-column link structure.

## Layout

Full-bleed sections that alternate between dark Spruce 900 (#032125) and warm cream (#fffcf6) backgrounds. Hero is left-aligned text block occupying ~40% width with product screenshot occupying right ~60%, set against photographic backdrop. Content sections use centered 1200px max-width containers with 96px vertical section gaps. Trust strip uses horizontal marquee of monochrome logos. Footer is full-bleed dark with 4-column grid of links. Navigation is a 64px-tall sticky top bar with logo left, centered nav items, and sign-in + CTA cluster right. Key sections are full-viewport-width colored bands rather than card grids.

## Similar Brands

- **Linear** — Same near-uniform medium weight custom typeface, dark primary surface with cream/warm light alternation, hairline 1px borders, minimal corner radii, generous vertical rhythm
- **Vercel** — Dark hero-to-light-section alternation with full-bleed bands, pill-shaped CTAs, subdued typography that lets color accents do the emotional work
- **Attio** — Warm cream surfaces paired with deep saturated dark sections, thin borders, near-flat elevation, editorial product photography in hero
- **Resend** — Custom geometric sans at restrained weight, dark spruce-toned palette, glow-ring focus states instead of traditional shadows, monochrome logo strip trust section
