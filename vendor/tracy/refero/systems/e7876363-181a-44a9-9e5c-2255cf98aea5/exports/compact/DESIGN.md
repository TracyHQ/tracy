# Visitors — Style Reference
> white engineering blueprint

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Visitors is a bright white-canvas analytics product with a restrained grayscale spine and a single lavender accent (#918df6) that does the heavy lifting as a CTA color. Typography is confident and geometric — OpenRunde at heavy display weights with tight negative tracking, creating headlines that feel engineered rather than editorial. The interface lives flat: hairline borders, subtle surface tinting, minimal elevation, and pill-shaped controls that read as light and fast. Color appears as functional punctuation — green for positive deltas, amber for neutral data, pink and blue for feature categories — never as decoration on chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon | `#181925` | Primary text, headings, nav links — near-black with the faintest cool tint gives type a deliberate, engineered weight without pure-black harshness |
| Paper White | `#ffffff` | Page canvas, card surfaces, button fills — the base layer everything sits on |
| Linen | `#fafafa` | Subtle background sections, table rows, secondary surfaces — separates content bands from pure white without introducing a visible gray |
| Mist | `#f5f5f5` | Primary page canvas and white card surfaces. Do not promote it to the primary CTA color |
| Fog | `#e8e8e8` | Table gridlines, hairline borders, divider lines — the structural 1px that defines table cells and card edges |
| Ash | `#999999` | Muted body text, placeholder text, inactive nav items — secondary information that recedes |
| Graphite | `#666666` | Secondary text, button text on light fills, captions — readable but clearly subordinate to Carbon |
| Lavender | `#918df6` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Iris | `#9580ff` | Register button and gradient endpoint — a slightly deeper lavender for secondary action emphasis |
| Mint | `#33c758` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Mint Wash | `#def6e4` | Soft section background, alternate surface, and quiet card fill. Use as a supporting accent, not as a status color |
| Amber | `#ffa600` | Yellow text accent for links, tags, and emphasized short phrases |
| Sky | `#2c78fc` | Violet text accent for links, tags, and emphasized short phrases. |
| Magenta | `#d6409f` | Visitor profiles category, icon accents — vivid pink that earns its place by mapping to one specific feature domain |
| Ember | `#ff3e00` | Chart fill accents, decorative illustration — warm orange that breaks the cool palette inside data visualizations |

## Typography

### OpenRunde — Single typeface across all UI — geometric humanist sans with tight apertures and slightly compressed proportions. Display headlines at 60px/600 with -3px tracking feel engineered; body at 16px/400 with -0.32px tracking reads crisp without feeling clinical.
- **Substitute:** Inter, DM Sans, or Geist Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 20px, 24px, 36px, 48px, 60px
- **Line height:** 1.00–1.56
- **Letter spacing:** -0.007em at 48px, -0.017em at 36px, -0.013em at 24px, -0.016em at 20px, -0.018em at 18px, -0.020em at 16px, -0.023em at 14px, -0.025em at 13px, -0.027em at 12px, -0.050em at 60px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.32px |
| body | — | — | 16px | 1.5 | -0.32px |
| subheading | — | — | 18px | 1.33 | -0.32px |
| heading-sm | — | — | 24px | 1.17 | -0.31px |
| heading | — | — | 36px | 1.22 | -0.61px |
| heading-lg | — | — | 48px | 1 | -0.34px |
| display | — | — | 60px | 1.13 | -3px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 16px
- **images:** 8px
- **inputs:** 8px
- **tables:** 24px
- **buttons:** 9999px

## Components

### Primary Action Button (Filled)
**Role:** Main conversion CTA — Start trial, Register

Pill shape (9999px radius), Lavender (#918df6) fill, white text, OpenRunde 14px weight 500, letter-spacing -0.32px, padding 10px 20px, no border. Subtle shadow: rgba(0,0,0,0.08) 0px 1px 1px 1px + rgba(0,0,0,0.06) 0px 0px 0px 0.5px.

### Register Button (Deeper Lavender)
**Role:** Secondary emphasis CTA in nav

Pill shape, Iris (#9580ff) fill, white text, OpenRunde 14px weight 500, padding 6px 10px. Slightly deeper saturation differentiates from the main CTA.

### Ghost Button
**Role:** See demo, secondary nav actions

Transparent fill, Graphite (#666666) text, no border, pill shape (9999px radius), OpenRunde 14px weight 500, padding 10px 20px. Relies on whitespace and contrast alone.

### Text Link Button
**Role:** Inline nav links, Login

Transparent fill, Carbon (#181925) text, 12px horizontal padding, no border, no radius. Hairline underline on hover. Weight 500, 14px.

### Announcement Chip
**Role:** Top banner — 'NEW We hit $1K MRR'

White fill, Sky (#2c78fc) 'NEW' tag text + Carbon (#181925) body text, thin border, pill shape (9999px radius), inline icon. 14px weight 500.

### Navigation Pill
**Role:** Top nav bar with Features dropdown

White fill, Carbon text, full pill container (9999px radius) wrapping nav items. Active state shows Lavender underline or fill. Padding 8px internal.

### Tab Bar (Dashboard Tabs)
**Role:** Dashboard sub-navigation — Dashboard, Profiles, Funnels, Performance, Realtime

Horizontal tab row, white fill, Ash (#999999) inactive text, Carbon active text with Lavender underline indicator. 14px weight 500, no background fill change.

### Feature Card
**Role:** Three-column feature grid — Lightweight, 5-minute, Independent

Transparent fill (or very light wash), no border, no shadow, Lavender icon circle (40px) above Carbon bold heading + Graphite body. Center-aligned, 32px vertical padding.

### Pricing Tier Card
**Role:** Subscription plan container

White fill, 1px Fog (#e8e8e8) border, 24px radius, 64px vertical / 32px horizontal padding, no shadow. Carbon heading, Graphite feature list.

### Metric Callout Card
**Role:** Dashboard stat tiles — People, Revenue, Views, etc.

White fill, 1px Fog border, 16px radius, tight padding (12px). Mint (#33c758) for positive delta text, Ember (#ff3e00) for negative. Label in Ash, value in Carbon bold.

### Dashboard Panel Card
**Role:** Chart container — 28 people, Experience Score, Revenue

White fill, 1px Fog border, 16px radius, 20px padding. Carbon heading, small Ash caption. Soft inner shadow for depth: rgba(0,0,0,0.06) 0px 1px 3px + rgba(0,0,0,0.06) 0px 8px 16px.

### Data Table
**Role:** Analytics data grid

White fill, 1px Fog (#e8e8e8) gridlines, 24px container radius, no row striping. OpenRunde 12-14px weight 400-500. Header row in Carbon bold, body in Graphite.

### Avatar Circle
**Role:** User identification in dashboard

40px circle, photographic fill, no border or 1px white ring. Used sparingly in nav and dashboard header.

## Do's and Don'ts

### Do
- Use Lavender (#918df6) exclusively for the primary action button — never for body text, borders, or decorative elements.
- Set display headlines at 60px/600 with -3px letter-spacing; the tight tracking is what makes the type feel engineered.
- Use 9999px radius on every button, chip, and tag — the pill shape is a signature.
- Apply 1px solid Fog (#e8e8e8) borders on cards and tables; avoid heavy box-shadows for surface definition.
- Pair Mint (#33c758) with Mint Wash (#def6e4) backgrounds for positive metric callouts; never use green text on white without the pastel fill.
- Use OpenRunde weight 500 for all headings and buttons; reserve weight 400 for body and captions.
- Center the hero headline and CTA stack; let the whitespace below the 60px display do the work.

### Don't
- Don't use Iris (#9580ff) for body CTAs — it's reserved for the Register nav button to differentiate from the main Lavender CTA.
- Don't apply elevation shadows larger than the three-layer stack — dramatic drop shadows break the flat aesthetic.
- Don't mix multiple accent colors in one component — each feature category gets exactly one color (Sky for realtime, Amber for performance, Magenta for profiles).
- Don't set heading text in pure black (#000000) — use Carbon (#181925) for the slight cool tint.
- Don't use Ember (#ff3e00) for UI chrome — it's decorative-only, for chart fills and illustration.
- Don't break the pill-radius convention with rectangular buttons or sharp-cornered tags.
- Don't add background colors to feature card containers — they should sit on pure white with only icon + text.

## Elevation

- **Primary Action Button:** `rgba(0, 0, 0, 0.08) 0px 1px 1px 1px, rgba(0, 0, 0, 0.06) 0px 0px 0px 0.5px`
- **Secondary Button / Ghost:** `rgba(0, 0, 0, 0.08) 0px 1px 1px 0px, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px`
- **Elevated Card / Dashboard Panel:** `rgba(0, 0, 0, 0.06) 0px 1px 3px 0px, rgba(0, 0, 0, 0.06) 0px 8px 16px 0px, rgba(0, 0, 0, 0.02) 0px 0px 0px 1px`

## Surfaces

- **Canvas** (`#ffffff`) — Base page background, hero area, dashboard cards
- **Linen Band** (`#fafafa`) — Subtle alternating sections, feature rows, secondary content bands
- **Mist Fill** (`#f5f5f5`) — Ghost button backgrounds, input fields, disabled states
- **Mint Wash** (`#def6e4`) — Positive metric callout backgrounds, growth indicator surfaces

## Imagery

Minimal product photography — no lifestyle imagery, no people. Visual content is dominated by dashboard screenshots rendered as hero artwork (the analytics UI mockup in the gradient band) and small grayscale partner logos (Temple, inbound, Buildkite, etc.) used as social proof. Decorative gradients in the blue-to-lavender spectrum appear as atmospheric bands behind product imagery. Iconography is flat, single-color, circular containers — no outlined or illustrated icons, just solid filled glyphs in a 40px Lavender circle.

## Layout

Full-width sections stacked vertically with max-width ~1200px content centered. Hero is a centered text stack (announcement chip → 60px headline → subtext → dual CTA → partner logos) on white, followed immediately by a full-bleed atmospheric gradient band (blue-to-lavender) containing a floating dashboard mockup in a white card with rounded corners. Feature sections alternate between centered 3-column icon grids and alternating 2-column text+product layouts. All sections use generous 64px+ vertical breathing room. Navigation is a single centered pill-bar floating at the top with no sticky behavior visible. Footer is minimal, multi-column link grid.

## Similar Brands

- **Plausible Analytics** — Same white-canvas analytics aesthetic with a single vivid accent color for CTAs, generous spacing, and pill-shaped controls
- **Linear** — Same hairline-border-on-white surface treatment, tight geometric type with negative tracking, and minimal elevation philosophy
- **Fathom Analytics** — Same privacy-first SaaS pattern: monochrome spine with one brand color doing CTA duty, flat cards, and tight typographic scale
- **Vercel** — Same engineering-blueprint visual language: white canvas, subtle gray borders, single accent gradient for hero bands, geometric sans-serif type
- **Cal.com** — Same pill-button convention, pastel accent surfaces for positive states, and flat minimal-elevation card aesthetic
