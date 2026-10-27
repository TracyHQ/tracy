# Contrast — Style Reference
> neon coral signal on white silence

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Contrast runs on white-silence interrupted by one vivid coral signal. The entire visual system is deliberately restrained — generous whitespace, monochrome surfaces, heavy geometric type — so that the single warm-red CTA can do all the emotional work. Cards float on barely-visible shadows (0.06 alpha), radii are generous and pill-heavy, and the coral accent repeats as a system: buttons, borders, icons, badges, decorative washes. Black text is near-pure (#0e0f10) rather than softened gray, giving the headlines weight and authority that the otherwise delicate chrome would otherwise lack. Layout alternates between full-bleed centered hero stacks and dense multi-column card grids, with a persistent floating webinar widget anchoring the lower-left.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Coral | `#ff5065` | Primary action buttons, active links, icon accents, decorative badges — the only chromatic element allowed to fill space |
| Ember Wash | `#ff7a59` | Secondary warm accent for icon borders, decorative fills, and illustration strokes when coral needs a lighter companion |
| Persimmon | `#ff5c35` | Deepest warm accent for icon borders, decorative fills, and hero illustration strokes |
| Coral Mist | `#ffe9eb` | Soft pink-tinted wash for accent backgrounds, hover surfaces, and decorative bands |
| Carbon Ink | `#0e0f10` | Primary text, filled neutral buttons, dark surface backgrounds |
| Pure White | `#ffffff` | Page canvas, card surfaces, text on dark fills, outlined button borders |
| Fog | `#f4f4f8` | Subtle section backgrounds, tertiary surface layer |
| Graphite | `#2f3133` | Badge fills, dark nav backgrounds, subtle card borders |
| Slate | `#7a7b7c` | Muted helper text, icon strokes, secondary borders, list dividers |
| Smoke | `#666666` | Secondary text on light surfaces |

## Typography

### Gilroy — All UI and display text. Used at 56px weight 700 for hero headlines with extremely tight leading (~0.80), creating chunky display blocks. Weight 600 for section headings at 48px, weight 500–600 for body 16–18px, weight 500 for nav and labels at 14px
- **Substitute:** Sora, DM Sans, or Manrope
- **Weights:** 500, 600, 700
- **Sizes:** 14, 16, 18, 20, 48, 56
- **Line height:** 1.0–1.2 for display, 1.4–1.6 for body, 0.80–0.88 for tightest headline lockups
- **Letter spacing:** normal (0) at all sizes — tracking is never adjusted, letting the geometric letterforms do the work

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | — |
| body-sm | — | — | 16px | 1.5 | — |
| body | — | — | 18px | 1.56 | — |
| subheading | — | — | 20px | 1.6 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 48px | 1.11 | — |
| display | — | — | 56px | 0.8 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 4px
- **cards:** 24px
- **badges:** 100px
- **images:** 100px
- **buttons:** 100px
- **largeCards:** 40px
- **smallCards:** 16px
- **extraLargeCards:** 120px

## Components

### Coral Filled Button
**Role:** Primary call-to-action across the site

Background #ff5065, white text, 100px border-radius (pill), padding 12px 24px, font-weight 500 at 16px, Gilroy. Used for 'Start for free' and 'Register now' actions.

### Dark Filled Button
**Role:** Secondary action in the navigation

Background #0e0f10, white text, 100px border-radius, 8px 16px padding, 14px Gilroy weight 500. Used for 'Log in' in the header.

### Outlined Ghost Button
**Role:** Secondary action paired with coral CTAs

White background, 1px black border (#000000), black text, 100px border-radius, 12px 24px padding, 16px Gilroy weight 500. Used for 'Book a demo'.

### Navigation Bar
**Role:** Top-level site navigation

White background, sticky, horizontal layout with logo left, nav links centered, actions right. Links are 16px Gilroy 500 in #0e0f10. 'Partners' carries a small inline 'new' badge in coral.

### 'New' Diagonal Badge
**Role:** Marker for recently added nav items

Coral #ff5065 text on white, small italic 12px, placed inline after a nav label. Repeats as a decorative marquee band in the pink-coral diagonal stripe.

### Hero Headline Block
**Role:** Opening screen title and subtitle

Centered layout, 56px Gilroy weight 700, #0e0f10, line-height 0.80 (tight stack). Subtitle at 18px weight 500 in #0e0f10. Below: two CTAs (coral filled + ghost outlined).

### Logo Marquee Strip
**Role:** Social proof band

Single row of client logos in grayscale on white, no dividers, even spacing, sits between hero and first content section.

### Feature Screenshot Card
**Role:** Product showcase panel

White surface, 16px or 24px border-radius, 0 5px 25px rgba(38,42,62,0.06) shadow. Contains a product UI screenshot above a short label. The shadow is deliberately faint — cards sit on the page rather than float above it.

### Testimonial Card
**Role:** Social proof quote card

White background, 24px radius, subtle shadow, 24px padding. Five coral stars at top, headline at 18px weight 600, quote at 16px weight 500, author with circular 100px avatar and name + role at 14px.

### Floating Webinar Widget
**Role:** Persistent lead-capture overlay

Fixed bottom-left card, 16px radius, white surface, soft shadow. Contains 'Upcoming webinar' label with close icon, a 100px-radius thumbnail, webinar title at 16px weight 600, and a full-width coral CTA ('Register now') at 100px radius.

### Coral Diagonal Marquee Band
**Role:** Decorative announcement strip

Coral-tinted #ffe9eb background with repeating 'new' text on a 45° diagonal angle, creating a ribbon effect between sections.

### Rating Badge Row
**Role:** Trust indicator cluster

Row of platform icons (G2, Capterra, HubSpot) paired with star counts and ratings at 14px Gilroy 500. Coral stars, black text, light spacing between groups.

### Footer Link Section
**Role:** Site footer navigation

Dark or white background, column-based link groupings, 16px Gilroy 500 in #0e0f10 or #ffffff, 8px row gap between links.

## Do's and Don'ts

### Do
- Use #ff5065 as the sole filled chromatic color for primary actions, active states, and icon accents
- Apply 100px border-radius to all buttons, badges, and small images for the signature pill shape
- Set display headlines at 56px Gilroy weight 700 with line-height 0.80 for tight stacked blocks
- Use #0e0f10 (not #000000) for primary text to keep warmth in the dark tones
- Apply the single shadow token 0 5px 25px rgba(38,42,62,0.06) to all elevated cards
- Space sections at 80px vertical gaps with 24px card padding as the default interior rhythm
- Keep the floating webinar widget pattern in the bottom-left as a persistent lead-capture anchor

### Don't
- Don't introduce additional chromatic colors beyond coral, ember, persimmon, and the pink wash
- Don't use heavy or dark shadows — the entire elevation system relies on 0.06 alpha only
- Don't soften body text below weight 500 — Gilroy's lighter weights are reserved for nothing here
- Don't use sharp corners (0–4px) on any user-facing surface except small nav details
- Don't add background colors to body copy sections — the white silence IS the design
- Don't apply letter-spacing adjustments — tracking stays at normal across all sizes
- Don't use photography as hero imagery — product UI screenshots and illustrations carry the visual weight

## Elevation

- **Cards and floating panels:** `0 5px 25px rgba(38, 42, 62, 0.06)`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — most of the site is bare white
- **Fog** (`#f4f4f8`) — Subtle section bands and tertiary containers
- **Card** (`#ffffff`) — Testimonial cards, feature cards, floating widget — same as canvas but defined by shadow and border
- **Accent Wash** (`#ffe9eb`) — Coral-tinted decorative backgrounds and banner areas
- **Dark Surface** (`#0e0f10`) — Inverted sections, filled dark buttons, dark nav blocks

## Imagery

Product UI screenshots are the primary visual asset, shown inside rounded white cards with soft shadows. Photography is absent from marketing surfaces — the product IS the hero. Illustrated icons use coral and persimmon strokes against white. A persistent floating widget (webinar thumbnail) in the lower-left adds a persistent visual anchor. The decorative diagonal 'new' marquee ribbon provides the only non-product visual texture.

## Layout

Max-width 1200px centered, generous vertical rhythm with ~80px section gaps. Hero is a centered headline stack with two CTAs below. Content alternates between full-bleed centered headline blocks and multi-column card grids (3-column testimonials, 4-column logo marquee). A floating webinar widget persists in the bottom-left corner across scroll. A diagonal coral 'new' marquee band appears as a decorative section divider. Navigation is a sticky white top bar with logo-left, links-center, actions-right.

## Similar Brands

- **Cal.com** — Same single-accent coral on white silence, pill-shaped buttons, heavy display headlines, and soft-shadow card approach
- **Loom** — Restrained white canvas with one vivid accent color driving CTAs, rounded card chrome, geometric sans display type
- **Webflow** — Clean white-space-dominant layout, bold geometric type, generous radii, and minimal but precise shadow elevation
- **Pitch** — High-contrast black text on white with a single warm accent, pill buttons, tight headline leading, and confident display weight
