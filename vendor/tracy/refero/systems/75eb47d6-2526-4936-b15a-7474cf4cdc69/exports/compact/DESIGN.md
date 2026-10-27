# Quicken — Style Reference
> electric violet on white marble

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Quicken's design system orbits a single electric violet — vivid #471cff — that acts as the power source for every interactive element against a clean white canvas. The visual personality is confident financial-tech: a custom geometric sans (Haffer) sets the voice with tight negative tracking that tightens further as type grows, creating density and authority without weight. Dark violet sections (#0f0733) alternate with white bands to create rhythm, while soft lavender card borders (#dbd3ff, #bbc5fa) replace the usual gray dividers and reinforce brand identity at every edge. Components lean rounded and pill-shaped: cards use 16px corners, buttons stretch to 400px radius, and shadows are nearly absent — depth comes from color contrast and border treatment, not elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Voltage Violet | `#471cff` | Primary action buttons, active nav items, key links, brand emphasis — the single chromatic pulse of the interface; everything else defers to it |
| Deep Iris | `#0f0733` | Dark section backgrounds, hero canvas, high-contrast text on light surfaces — the midnight counterpart that anchors alternating dark bands |
| Signal Red | `#eb0130` | Promotional accents, sale/urgency indicators, highlight strokes — used sparingly to flag attention without competing with the primary violet |
| Lilac Whisper | `#dbd3ff` | Soft card and container borders — a low-contrast violet edge that brands outlines without adding visual weight |
| Periwinkle Mist | `#bbc5fa` | Cooler card border tone for grouping and container edges — second step in the violet border scale for layered cards |
| Coral Burst | `#ff5a43` | Error and warning badge fills, alert pills — warm contrast against the cool violet system |
| Aqua Pop | `#7ae7fb` | Decorative badge backgrounds, hero trust-pill fill — cool cyan that brightens dark sections |
| Ink Black | `#18181f` | Primary body and heading text, dominant border color, icon strokes — the near-black that carries all readable content |
| Carbon | `#494949` | Secondary text, muted nav, supporting borders — the mid-gray step between ink and white |
| Pure White | `#ffffff` | Page and card backgrounds, text on dark surfaces, button fills for ghost variants |
| Frost Blue | `#f0f5fa` | Subtle surface tint for alternating bands, header backgrounds — barely-there cool wash |
| Linen Gray | `#eaecf7` | Table dividers, hairline borders in data-heavy layouts — a cool neutral that doesn't fight the violet palette |

## Typography

### Haffer — Single-family system for everything from body to display. Weight 400 carries body, nav, and table text; weight 600 handles headings, buttons, and emphasis. The custom geometric construction gives a contemporary financial-tech voice — rounder apertures than Inter, tighter terminals than Geist.
- **Substitute:** Inter, DM Sans, or General Sans
- **Weights:** 400, 600
- **Sizes:** 12, 13, 14, 16, 17, 18, 19, 20, 22, 26, 30, 48, 60
- **Line height:** 1.0–2.0 (tight 1.0–1.2 on display, comfortable 1.4–1.5 on body)
- **Letter spacing:** -0.045em at 60px, -0.033em at 30px, -0.030em at 20px and below

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.03px |
| body-sm | — | — | 14px | 1.4 | -0.03px |
| body | — | — | 16px | 1.5 | -0.03px |
| subheading | — | — | 20px | 1.31 | -0.03px |
| heading-sm | — | — | 26px | 1.2 | -0.033px |
| heading | — | — | 30px | 1.16 | -0.033px |
| heading-lg | — | — | 48px | 1 | -0.045px |
| display | — | — | 60px | 1 | -0.045px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 400px
- **tags:** 100px
- **cards:** 16px
- **badges:** 20px
- **buttons:** 400px

## Components

### Primary Action Button
**Role:** Main CTA for conversion moments

Pill shape (400px radius), background #471cff, white text at 16px Haffer weight 600, padding 12px 24px, no border. Hover deepens the violet fill. The signature interactive element of the system.

### Ghost Action Button
**Role:** Secondary CTA paired beside a primary

Pill shape (400px radius), transparent background, 1.5px border in #471cff, text in #471cff at 16px Haffer weight 600, padding 12px 24px. Mirrors the primary's shape but defers visually — violet outline against white card.

### Hero Headline
**Role:** Top-of-page value proposition

White text at 60px Haffer weight 600, line-height 1.0, letter-spacing -0.045em. Sits on Deep Iris (#0f0733) background. Below it, 18px body text in #dbd3ff or white at 80% opacity for subtitle.

### Trust Badge Pill
**Role:** Social proof or category label above hero headline

Rounded pill (100–400px radius), background #7ae7fb or #f0f5fa, text in #18181f at 13px Haffer weight 600, padding 8px 16px. The cyan variant on the hero creates the only cool color interruption on dark sections.

### Pricing Tier Card
**Role:** Product plan comparison on pricing sections

White background, 16px corner radius, 1.5px border in #bbc5fa or #dbd3ff, padding 24px. Contains tier icon (violet square 32px), plan name at 20px weight 600, description at 14px, strikethrough original price + bold monthly price + red promotional badge. Drop shadow rgba(0,0,0,0.15) 10px 20px 30px for depth on white.

### Promotional Badge
**Role:** Highlight discount or urgency markers

Rounded pill (20px radius), background #eb0130 or #ff5a43, white text at 12px Haffer weight 600, padding 4px 8px. The red-on-white micro-badge attached to strikethrough prices.

### Feature Showcase Card
**Role:** Dark-section feature highlight with illustration

Deep Iris (#0f0733) background, 16px corner radius, padding 0 (image bleeds to edges). Upper portion is a full-bleed product visualization; lower portion is white with heading at 26px weight 600, body at 16px, and a violet text link.

### Feature Comparison Table
**Role:** Side-by-side plan feature matrix

White background, row dividers in #eaecf7 (1px), column headers with violet icon tiles (#471cff background, 16px radius, 40px square) above plan names at 16px weight 600. Checkmarks for included features rendered in a small green or violet circle.

### Top Navigation Bar
**Role:** Persistent site navigation

White background, 400px pill radius on nav items and CTA, 16px Haffer weight 400 for links, 600 for active item in #471cff. Quicken logo in #471cff at top-left. Sign-in link right-aligned. Sticky on scroll.

### Phone Mockup Frame
**Role:** Hero product visualization

iPhone-style frame with thin black bezel, slight 3D rotation (-10° to -15°), floating beside headline. Screen content is white with Haffer type and data visualizations. Sits on Deep Iris hero background.

### Centered Section Header
**Role:** Transitional section introduction

Centered heading at 48px Haffer weight 600, #18181f, letter-spacing -0.045em, with optional violet pill button (#471cff, white text, 400px radius) directly below. White background section.

### Inline Feature Icon
**Role:** Category indicator on pricing and feature cards

32×32px square with 8px radius, #471cff background, white line-icon centered. Marks each plan tier or feature category without adding label noise.

## Do's and Don'ts

### Do
- Use Voltage Violet (#471cff) exclusively for the single most important action per screen — never split attention across multiple violet CTAs
- Set card borders to Lilac Whisper (#dbd3ff) or Periwinkle Mist (#bbc5fa) instead of neutral gray to reinforce brand identity at every edge
- Set all buttons to 400px border-radius — pill shapes are non-negotiable in this system and signal action
- Tighten letter-spacing progressively: -0.030em at 16px, -0.033em at 26–30px, -0.045em at 48px+
- Alternate between white and Deep Iris (#0f0733) sections to create rhythm — never let two dark sections sit adjacent without a white break
- Anchor dark sections with white text at full opacity; use Lilac Whisper (#dbd3ff) for secondary text on dark rather than dimmed white
- Use Signal Red (#eb0130) only for discount badges and urgency — never as a replacement for the primary action color

### Don't
- Don't introduce new hues — the system is binary: violet accents on white, or white on Deep Iris
- Don't use drop shadows on components other than the pricing card stack — depth should come from color and border
- Don't use sharp 0px or minimal 4px corner radii on cards — 16px is the minimum card radius and buttons must stay pill-shaped
- Don't place body text below 14px or above 18px — the system avoids both micro-copy and large body type
- Don't use #18181f and #000000 interchangeably — #000000 is reserved for navigation chrome; body text uses #18181f
- Don't add gradients — the system is flat by design; depth comes from violet-to-Deep-Iris section contrast
- Don't use weight 400 for headings or weight 600 for body — the binary weight assignment is part of the typographic signature

## Elevation

- **Pricing Card:** `rgba(0, 0, 0, 0.15) 10px 20px 30px 0px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default light page background and card surfaces
- **Frost Band** (`#f0f5fa`) — Subtle alternating section tint, header strip
- **Deep Iris** (`#0f0733`) — Dark hero sections and feature card surfaces

## Imagery

Product screenshots take center stage, rendered as iPhone mockups floating at slight rotation angles against the Deep Iris hero background — the device is the hero, not lifestyle photography. Secondary visuals are flat data visualizations (charts, projected cash flow lines, budget breakdowns) rendered in violet, cyan, and white directly on dark card surfaces. Illustrations are absent — the system relies on real product UI, trust badges, and large numeric headlines. Photography is not used; the visual language is pure product-and-data.

## Layout

Max-width 1200px centered container with generous side padding. The hero is full-bleed Deep Iris (#0f0733) with asymmetric text-left/product-right composition at 60/40 split. Below the hero, content alternates: white pricing-card row (3-column grid), white centered comparison section, then 2×2 dark feature-card grid. Section gaps are 80px with consistent 24px card padding. Navigation is a clean white sticky top bar with centered nav links and right-aligned sign-in. Grid systems favor 2-column and 3-column arrangements; the layout never exceeds 3 columns of cards.

## Similar Brands

- **Plaid** — Same fintech authority through tight custom sans-serif type, violet/indigo dark sections alternating with white, and pill-shaped CTAs
- **Mercury** — Dark-mode hero sections with white display type, single accent color (Mercury's gold vs Quicken's violet), and clean borderless card grids
- **Notion** — Single-brand-color accent system on white with geometric sans type, pill buttons, and borderless minimal elevation
- **Linear** — Tight typographic tracking that intensifies at large sizes, flat surfaces, and single-accent-color action language
- **Brex** — Dark hero with large display headlines, product mockup floating at angle, and white-card pricing tiers with pill CTAs
