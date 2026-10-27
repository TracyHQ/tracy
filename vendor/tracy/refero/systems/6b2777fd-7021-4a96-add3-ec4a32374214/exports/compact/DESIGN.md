# Mews — Style Reference
> Hospitality command center at pink dawn. A white-walled, sunlit workspace where bold black type, warm cream cards, and a single candy-pink action button define every screen — playful confidence over enterprise restraint.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mews operates as a hospitality command center bathed in pink dawn: a predominantly white canvas, warm cream card surfaces, and a saturated candy-pink accent that drives every primary action. The visual language is unapologetically confident — headlines render at extreme weights (900) at display sizes, pushed tight with aggressive negative tracking, while body copy sits in a comfortable 400-weight Soehne. Surfaces stay flat and minimal; the few chromatic moments (soft pink, ice blue, lime green) are reserved for categorical tiles, product UI highlights, and the signature pill-shaped CTA. The result reads as a modern operating system for hotels: structured, optimistic, slightly playful, and decidedly not corporate-grey SaaS.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas White | `#ffffff` | Primary page background, top of surface stack |
| Warm Cream | `#fffcf6` | Card and elevated surface backgrounds, gentle warmth against pure white |
| Ink Black | `#000000` | Primary text, icons, borders, and dark hero panels — the dominant structural color |
| Charcoal | `#333333` | Secondary text and softer borders where pure black would feel too heavy |
| Deep Panel | `#161616` | Dark feature cards, inverse surface for hero blocks, and high-contrast panels |
| Fog Gray | `#8c8c8c` | Muted helper text, disabled button fills, and tertiary borders |
| Mist Gray | `#cccccc` | Hairline dividers, nav separators, subtle structural borders |
| Lilac Mist | `#c4c9dd` | Cool-toned decorative borders, illustration fills, and subtle chrome highlights |
| Bubblegum | `#ff83da` | Primary brand accent — pill-shaped CTAs, announcement bar background, active highlights; vivid pink against white is the visual signature |
| Cotton Pink | `#ffc5ee` | Softer pink surface for secondary buttons and pastel card variants |
| Blush Mist | `#f7e1f7` | Lightest pink wash for category tile backgrounds and quiet brand surfaces |
| Ice Blue | `#d2f4ff` | Cool supporting accent for product UI screenshots, informational tiles, and category surface variation |
| Voltage Lime | `#e8ff5b` | High-energy accent for spotlight highlights, image overlays, and surprise moments — used sparingly for visual punctuation |

## Typography

### Soehne — Single typeface across all UI. Body and UI copy at 400–500, navigation and labels at 500–600, subheads at 700, and display headlines at 900 — the extreme weight contrast between 400 body and 900 display is the signature typographic move. Aggressive negative tracking (-0.025em at display sizes) tightens headlines into bold block-like forms that feel architectural rather than airy.
- **Substitute:** Inter, Söhne Trial, or GT America (closest free alternative for similar grotesque proportions and weight range)
- **Weights:** 400, 500, 600, 700, 900
- **Sizes:** 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 28, 32, 40, 48, 64, 72, 96
- **Line height:** 0.80–1.50 depending on context (tight for display, comfortable for body)
- **Letter spacing:** Display 56–96px: -0.025em; mid headings 22–48px: -0.015em to -0.012em; body 14–18px: normal to -0.010em; small caps/eyebrow text 11–13px: +0.020em to +0.050em
- **OpenType features:** `Tabular numerals for data-heavy product UI; ligatures disabled in display`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.35 | 0.5px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.35 | -0.2px |
| heading-sm | — | — | 22px | 1.2 | -0.33px |
| heading | — | — | 28px | 1.15 | -0.42px |
| heading-lg | — | — | 48px | 1.03 | -0.72px |
| display | — | — | 96px | 0.9 | -1.68px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 10px

### Border Radius

- **tags:** 9999px
- **cards:** 4px
- **inputs:** 8px
- **avatars:** 4px
- **buttons:** 9999px

## Components

### Primary CTA Button
**Role:** Top-level conversion action — the signature pink pill

Pill-shaped (9999px radius), #ff83da background, white text at 13–14px Soehne weight 600–700, horizontal padding 24–32px, vertical padding 12–14px. Always uppercase or sentence-case depending on context. The vivid candy-pink against white is the single most recognizable element of the brand.

### Ghost / Outline Button
**Role:** Secondary action paired with the primary CTA

Transparent or white background, 1px #000000 border, #000000 text, 8px radius (not pill), 12px vertical padding. Used in navigation-adjacent contexts and as quiet alternative CTAs.

### Navigation Pill (Active State)
**Role:** Active state indicator inside nav menus

9999px radius pill, #f7e1f7 or #ffc5ee pink fill, black text — the same pill family as the primary CTA but softer and used for inline nav highlights.

### Dark Hero Panel
**Role:** Full-bleed dark surface for hero copy blocks

#161616 or #000000 background, white text at 96px Soehne weight 900 for headline (-0.025em letter-spacing), body text 18px weight 400 in white or #cccccc, rounded outer corner matching the surrounding layout. The dark block sits beside a product screenshot in a two-column hero composition.

### Solution / Category Card
**Role:** Grid tile for product verticals (Hotels, Groups & Chains, etc.)

Warm cream (#fffcf6) or near-white surface with #c4c9dd border at 4px radius. Icon at top-left (simple line or filled icon, 24px). Title 18–20px Soehne weight 700 black, description 14–15px weight 400 in #333333, and a small all-caps arrow link at the bottom: 'MEWS FOR HOTELS →' at 12px weight 600 with +0.030em letter-spacing. Padding 24–32px.

### Product Screenshot Frame
**Role:** Container for in-app product imagery on the right side of hero sections

Slight rotation or 3D tilt effect, hard rectangular corners (no radius or 4px max), sits against a scenic photographic background (pool, terrace, hotel exterior). The product UI inside the frame shows the actual calendar/timeline application.

### FAQ Accordion Item
**Role:** Expandable question/answer list

Full-width row separated by a 1px #cccccc or #e5e5e5 hairline divider. Question text 16–18px Soehne weight 600 black. Plus/minus toggle icon on the right in a #ffc5ee circle (24–28px) — the pink icon is the only chromatic element in the FAQ section, reinforcing brand color usage on interactive affordances. Expanded answer at 16px weight 400 in #333333.

### Announcement Bar
**Role:** Slim top bar for product news or feature highlights

Full-width #ffc5ee or #f7e1f7 pink background strip at 36–40px height. Text 13px Soehne weight 500 black with an arrow icon. Sits above the main nav.

### Top Navigation Bar
**Role:** Primary site navigation

White background, 1px #cccccc bottom border. Mews wordmark at far left in black, weight 700. Center: nav links (Platform, Solutions, Customers, Resources, Pricing) at 14–15px weight 500 black. Right: utility links (language switcher, search, Contact us, Log in) in 13px weight 500, followed by the primary pink CTA. Sticky on scroll.

### Eyebrow / Category Label
**Role:** Small all-caps label above section headings

Soehne 12–13px weight 600–700, letter-spacing +0.020em to +0.050em, black or #333333. Often paired with a small decorative icon. E.g. 'HOSPITALITY MANAGEMENT SYSTEM' above the hero headline.

### Product Feature Pill
**Role:** Rounded tag for highlighting product capabilities (Property Management, Revenue, Payments, Point of Sale)

9999px radius pill, white or near-white fill, 1px subtle border, 12–13px Soehne weight 600 black text. Floating over a scenic image or product screenshot.

### Link with Arrow
**Role:** Inline navigational link ending with directional arrow

Black text 13–14px Soehne weight 600, uppercase, letter-spacing +0.020em, followed by a rightward arrow (→) at the same size. Used at the bottom of category cards and in body text. No underline.

## Do's and Don'ts

### Do
- Use the candy-pink #ff83da pill CTA (#ff83da fill, white text, 9999px radius, 12–14px vertical padding) as the single primary action on any screen — never duplicate it for multiple competing actions.
- Set display headlines at weight 900 Soehne with -0.025em letter-spacing; this tight black-heavy lockup against white is the brand's signature typographic moment.
- Stack surface levels as: #ffffff (canvas) → #fffcf6 (card) → #c4c9dd (border) → #161616 (dark panel) — preserve the warm-cream-on-white layering instead of defaulting to cool grays.
- Use 4px radius for cards and 8px for inputs; reserve 9999px exclusively for CTA buttons, active nav pills, and tags.
- Keep body text at 16px Soehne 400 with 1.5 line-height in #333333 on white or cream surfaces — never below 14px for running text.
- Drop chromatic accents (pink, ice blue, lime) onto supporting tiles, FAQ toggles, and product UI highlights only — the canvas and body should remain achromatic.
- Let product screenshots breathe in 80px section gaps with 1280px max-width containers; spacing rhythm is generous and architectural.

### Don't
- Don't use the pink CTA fill for anything other than the primary conversion — ghost, outline, and text-link alternatives exist for secondary actions.
- Don't set headlines in weights below 700; the 900/400 contrast between display and body is the brand's voice — flattening to 600 kills the energy.
- Don't add drop shadows to cards; the design relies on flat warm-cream surfaces and hairline borders for separation — shadows would feel corporate and wrong.
- Don't use the lime #e8ff5b or ice blue #d2f4ff on body text or large surfaces; they're accent and supporting-tile colors only.
- Don't introduce new rounded radii (12px, 16px, 24px) — stick to the 4px / 8px / 9999px scale or the visual rhythm collapses.
- Don't use cool grays (#94a3b8, #64748b) for text or borders; the system runs warm with #333333, #8c8c8c, and #cccccc.
- Don't add decorative gradients; the design is flat, photographic, or product-screenshot-driven — gradients would clash with the editorial flatness.

## Elevation

- **Dark Hero Panel:** `0px 0px 0px 1px #000000 (hard border, no shadow)`
- **Solution Category Card:** `0px 0px 0px 1px #c4c9dd (hairline border, no shadow)`

## Surfaces

- **Canvas** (`#ffffff`) — Default page background
- **Warm Cream** (`#fffcf6`) — Card surfaces, soft elevation
- **Lilac Mist** (`#c4c9dd`) — Border and chrome highlight on cards
- **Deep Panel** (`#161616`) — Dark hero and feature panels

## Imagery

Photography appears as full-bleed scenic hotel imagery (poolside terraces, tropical resorts, modern hotel exteriors) used as background plates behind the product screenshot in the hero. The photography is high-key, warm, and aspirational — it sets the hospitality mood without showing people. Product UI screenshots are the second visual pillar: raw in-app calendar/timeline views shown straight, slightly tilted, with hard rectangular edges. Icons are simple, single-color, line or filled at 24px, sitting in the top-left of category cards. No 3D renders, no illustrations, no abstract graphics — the visual language is strictly photography + product UI + flat iconography.

## Layout

Max-width 1280px centered containers. Hero is a two-column split: dark text panel on the left (roughly 45% width) with a product screenshot overlapping a scenic photographic background on the right. Solution sections use a 4-column card grid (collapses to 2 then 1 on smaller screens) with consistent 24–32px padding inside each card. FAQ section is single-column, max-width ~800px centered. Vertical rhythm is generous: 80px between major sections, creating an airy, breathing layout. Navigation is a sticky white top bar with a hairline bottom border. No sidebars, no mega-menus visible in the primary navigation — secondary nav opens as simple dropdowns.

## Similar Brands

- **Linear** — Shares the extreme weight 900 display headlines with tight negative tracking and a minimal black-on-white canvas, though Linear is darker and Mews adds the warm cream and pink warmth.
- **Stripe** — Similar restrained palette with a single vivid accent (Mews pink, Stripe purple), clean editorial typography, and product-screenshot-as-hero composition.
- **Figma** — Both use a mostly-achromatic canvas with playful colorful accents on supporting tiles, rounded 4px card corners, and product UI screenshots presented flat without heavy chrome.
- **Mercury** — Same generous 80px section gaps, warm neutral surfaces, and a single punchy accent color (Mercury green, Mews pink) driving the primary CTA.
- **Notion** — Both lean on flat surfaces, hairline borders instead of shadows, and a minimalist approach where typography weight contrast does the visual heavy lifting.
