# Vanta — Style Reference
> Editorial violet ledger on parchment

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Vanta presents a trust-forward enterprise language built on a deep violet palette and an editorial type system. Reckless serif headlines (weight 400, sizes 42–90px) carry warmth and authority, while Inter Variable at 400–700 handles every UI surface, keeping components functional and quiet. The visual identity hinges on a lavender hero wash (#ddd6ff), fully pill-shaped controls (999px radius), and a single deep-violet CTA color (#5e05c4) that never shouts — it punctuates. Cards float on white with 16px radii and hairline #181822 borders rather than shadows, producing a flat, architectural feel closer to a printed compliance report than a typical SaaS dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Indigo Ink | `#260048` | Logo, brand wordmark, decorative icon fills, strong border accents |
| Vivid Violet | `#5e05c4` | Primary action button fills, active nav text, filled badges — the single saturated brand moment |
| Mid Violet | `#8f47d5` | Inline link text, outlined badge borders, icon accents, secondary emphasis |
| Soft Violet | `#ba9dff` | Decorative icon strokes, light borders, muted link treatments |
| Lavender Wash | `#ddd6ff` | Hero section background, soft highlight surfaces, card tints |
| Carbon | `#181822` | Primary text, card borders, dividers, all structural hairlines |
| Slate | `#484960` | Secondary text, heading borders, muted borders |
| Graphite | `#6d6e87` | Tertiary text, icon fills, inactive borders |
| Steel | `#9e9fb7` | Placeholder text, disabled borders, divider lines |
| Ash | `#dfdfe9` | Subtle borders, input resting borders |
| Fog | `#eaeaf1` | Section dividers, faint surface tint |
| Parchment | `#f7f8fa` | Page canvas background, recessed surfaces |
| Paper | `#ffffff` | Card surfaces, input fills, button text on dark fills |
| Amber Signal | `#ffbe0f` | Warning badge fill — status callouts only |

## Typography

### Reckless — Editorial display headlines. A contemporary serif chosen specifically to soften the compliance/security subject matter — the curves and high contrast strokes make 'Trust is everything' read like a magazine cover, not a vendor pitch.
- **Substitute:** Source Serif 4, Lora, or DM Serif Display
- **Weights:** 400, 500
- **Sizes:** 30px, 42px, 56px, 72px, 90px
- **Line height:** 1.10–1.25
- **Letter spacing:** -1.62px at 90px, -1.44px at 72px, -1.12px at 56px, -0.84px at 42px, -0.18px at 30px

### Inter Variable — All UI, body, navigation, buttons, cards, badges. The single workhorse face — Inter's neutral geometry keeps the brand violet doing the emotional work while text stays invisible.
- **Substitute:** Inter (Google Fonts), or Manrope
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px, 40px
- **Line height:** 1.30–1.60
- **Letter spacing:** -0.02em uniform across sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.02px |
| body-sm | — | — | 14px | 1.43 | -0.02px |
| body | — | — | 16px | 1.5 | -0.02px |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.35 | — |
| heading | — | — | 32px | 1.3 | — |
| heading-lg | — | — | 42px | 1.2 | -0.84px |
| display | — | — | 90px | 1.1 | -1.62px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **tags:** 4px
- **cards:** 16px
- **icons:** 8px
- **badges:** 999px
- **inputs:** 999px
- **buttons:** 999px

## Components

### Primary Filled Button
**Role:** Main conversion CTA

Pill-shaped (999px radius), fill #5e05c4, text #ffffff in Inter 16px weight 500. Horizontal padding 24px, vertical 12px. On hover/active: 8% darker. Always accompanied by a leading arrow or trailing dot icon for directional momentum.

### Outlined Ghost Button
**Role:** Secondary action

Pill-shaped (999px), transparent fill, 1.5px border #181822, text #181822 in Inter 16px weight 500. Same padding as primary. Used for 'Log in' and less-pressured choices.

### Email Capture Input
**Role:** Hero form field

Pill-shaped (999px) white fill, border #dfdfe9 resting / #5e05c4 on focus. 48px tall, text Inter 16px #484960. Placeholder 'nodrama@flama.com' in #9e9fb7. The adjacent submit button is the same height, sharing the pill outline — the input+CTA reads as a single fused control.

### Feature Card
**Role:** Product capability showcase

White (#ffffff) fill, 1px hairline border in #181822, 16px radius. Internal padding 24–32px. Contains a Reckless heading at 30–42px, body copy at 16px #484960, and a product mock or visual at the bottom. No shadow — the border is the elevation.

### Compliance Card
**Role:** Nested status block inside feature cards

White fill, 16px radius, 1px #181822 border. Houses a status header (e.g. 'SOC 2', 'Inherent risk'), a percentage figure at 32px Inter weight 600, and a thin progress bar in #5e05c4 on #eaeaf1 track.

### Navigation Bar
**Role:** Site header

Transparent on lavender hero, white on scroll. Logo 'Vanta' in Reckless 24px weight 500 #260048. Nav links Inter 14px weight 500 #181822 with chevron-down carets for dropdowns. Right side: ghost 'Log in' + filled 'Get a demo' button. 16px vertical padding, 1200px max-width container.

### Vendor List Card
**Role:** Third-party risk display

16px radius white card with 1px #181822 border. Lists vendor entries as 48px-tall rows with a square logo thumbnail (8px radius), vendor name in Inter 14px weight 500, and a small status chevron.

### Chat Widget Panel
**Role:** Persistent conversational support

Fixed bottom-right, ~360px wide, white surface with 16px radius and 1px #181822 border. Header 'Welcome to Vanta' uses Inter 16px weight 600. Suggested-question pills (#ddd6ff fill, #260048 text, 999px radius, 12px padding). Close X in #484960.

### Logo Strip
**Role:** Social proof band

Centered, 12px uppercase Inter weight 500 #484960 label 'TRUSTED BY 16,000+ CUSTOMERS'. Logo lockup grid: two rows of 5–6 monochrome #000000 SVG logos at uniform height (~24px), generous 48px column gap.

### Hero Product Mock
**Role:** Above-the-fold product visualization

Full-width, contained in a 1200px max-width frame. White product UI with a dark left sidebar (icons in #484960, active item in #5e05c4), centered canvas showing an ISO 42001 compliance widget with circular progress dial and segment grid in violet/yellow.

### Status Badge
**Role:** Inline status indicator

Pill shape (999px), 4px vertical / 12px horizontal padding, Inter 12px weight 500. Variants: filled #ddd6ff with #260048 text for informational, #5e05c4 fill with white text for active, #ffbe0f fill with #181822 text for warning.

### Inline Link
**Role:** Text-embedded navigation

Inter 16px weight 500 in #5e05c4, no underline at rest, 1px underline on hover. Used sparingly — Vanta prefers buttons over links for primary navigation.

## Do's and Don'ts

### Do
- Use Reckless serif at 42–90px for any page-level headline; reserve Inter for everything below the h2.
- Reach for #5e05c4 only on filled action buttons and active states — one saturated moment per view.
- Set every button, input, and badge to 999px radius — the pill is the signature.
- Use 1px #181822 hairlines for card and section borders instead of shadows.
- Open the page with a #ddd6ff lavender hero band, then transition to #f7f8fa canvas for body content.
- Pull #8f47d5 into body copy for inline links and outlined badges — never as a filled surface.
- Keep the type scale tight: -1.62px tracking at 90px display, tightening proportionally as size grows.

### Don't
- Don't drop shadows on cards — the flat 1px-border treatment is the system.
- Don't use #5e05c4 as decorative icon fill, section background, or text color — it's action-only.
- Don't mix radii: avoid 8px on buttons or 4px on cards; the 999px/16px/8px triad must stay clean.
- Don't use Reckless below 30px — the serif loses readability and the brand identity at small sizes.
- Don't introduce blue, green, or red as accent colors — the system is monochromatic-warm-violet.
- Don't stack the violet family on itself: never put a #5e05c4 button on a #ddd6ff background without white space separation.
- Don't use corner-radius smaller than 4px anywhere — sharp corners fight the pill vocabulary.

## Elevation

Vanta rejects drop shadows entirely. Elevation is communicated through three tools: (1) 1px hairline borders in #181822 that frame every card and section, (2) surface contrast between #ffffff cards and #f7f8fa canvas, and (3) the lavender hero band that physically separates itself from the rest of the page by color alone. This produces a flat, editorial, almost printed-document feel — closer to a legal compliance report than a typical SaaS dashboard.

## Surfaces

- **Page Canvas** (`#f7f8fa`) — Body page background below the hero
- **Hero Wash** (`#ddd6ff`) — Above-the-fold lavender background band
- **Card Surface** (`#ffffff`) — Feature cards, product mocks, input fields
- **Recessed Surface** (`#eaeaf1`) — Embedded blocks, chat input wells

## Imagery

Product UI mockups dominate the visual language — full-bleed white-framed screenshots of the Vanta dashboard with sidebar nav, compliance widgets, and risk heatmaps. No lifestyle photography, no stock imagery, no illustrations. The hero product mock is literally a photograph of the app itself, set against a lavender wash. Customer logos appear as monochrome black SVG lockups in a grid, never in color. The chat widget is a persistent UI element, not marketing imagery. Overall: the product IS the imagery — the site treats screenshots with the reverence a fashion brand gives editorial photography.

## Layout

Max-width 1200px centered container with full-bleed lavender hero band on top. Hero is a centered text stack: oversized Reckless headline (90px), single-line subhead, fused pill input+CTA — followed immediately by a large product mock that breaks the container edge slightly. Below the hero, content shifts to #f7f8fa canvas. Feature sections use a 3-column equal card grid (Compliance / Risk / Third Party Risk), each card a white bordered block with an inner product mini-mock. A 2-row logo strip band separates social proof from features. Navigation is a transparent-on-hero, white-on-scroll top bar with centered logo group and right-aligned actions. Section rhythm is generous — 80px vertical gaps between bands create the feel of a printed annual report rather than a scrolling landing page.

## Similar Brands

- **Linear** — Same restraint with hairline borders, single saturated accent, and confident serif/sans pairing for product UI
- **Notion** — Pill-shaped controls, flat surface treatment, and a warm-neutral background canvas under the hero
- **Mercury** — Editorial serif display headlines over a light canvas, with a single brand color doing all the action work
- **Webflow** — Large product-mock hero above the fold and bordered feature cards arranged in a 3-column grid
- **Stripe** — Lavender hero wash, pill CTAs, and product UI as the primary visual asset rather than photography
