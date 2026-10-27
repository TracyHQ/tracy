# 15five — Style Reference
> Sunrise over a clean desk

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

15Five pairs warm sunset-toned gradient washes with crisp white product surfaces, producing a brand that feels both human and data-driven. Deep violet headlines set in an editorial serif anchor sections with magazine-like authority, while a geometric sans carries UI chrome and body copy — the two faces create a quiet tension between editorial warmth and operational precision. The palette is deliberately restrained: violet for primary action and emphasis, a peach-to-coral gradient as atmospheric background, and white as the default surface, with chart accents (teal, coral, amber) appearing only inside product screenshots. Buttons are fully pill-shaped, cards use gentle 10–16px radii, and shadows are nearly absent — depth comes from background washes and surface contrast rather than elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Royal Violet | `linear-gradient(90deg, #3b1572 0%, #1a0d3f 100%)` | Violet accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color; Deeper atmospheric gradient — a 90° wash from Iris into Midnight Plum used on dark feature panels |
| Midnight Plum | `#1a0d3f` | Primary body and heading text, outlined action borders — near-black violet that reads as ink rather than as color |
| Iris | `#3b1572` | Hovered action state, gradient anchor — sits one step brighter than Royal Violet for interaction feedback |
| Slate Mute | `#5e5777` | Secondary text, hairline borders, icon stroke — the desaturated violet that forms the neutral system backbone |
| Ember Orange | `#ff4b11` | Orange accent for outlined action borders, linked labels, and lightweight interactive emphasis |
| White | `#ffffff` | Page canvas, card surfaces, button text on dark fills, nav background |
| Cream Wash | `#fff2e8` | Softest tier of the warm gradient — the first stop in hero and testimonial backgrounds |
| Peach Blush | `#ffdacf` | Mid-stop in warm gradient washes, ghost button fill, soft surface tint |

## Typography

### DM Serif Display — Editorial headline face — used at 40–66px for section titles, never below 24px. Its single weight 400 carries the brand's serif authority without shouting; the contrast with the geometric sans body is the system's signature move
- **Substitute:** Playfair Display, Cormorant Garamond, Source Serif Pro
- **Weights:** 400
- **Sizes:** 24px, 40px, 52px, 66px
- **Line height:** 1.15–1.33

### Manrope — All UI and body copy — 16px/400 for body, 14px/500 for nav and metadata, 600–700 for metric numbers and card labels. The 0.375em letter-spacing on small uppercase eyebrows ('15 FIVE', 'YOU'RE IN GOOD COMPANY') is a distinctive tracking choice that creates breathing room around tiny all-caps labels
- **Substitute:** Inter, Plus Jakarta Sans, DM Sans
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 14px, 16px, 18px, 22px, 24px
- **Line height:** 1.33–1.64
- **Letter spacing:** 0.0020em at body sizes; 0.3750em on 12–14px all-caps eyebrows

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 20 | 5.25px |
| body | — | — | 16px | 26 | — |
| subheading | — | — | 18px | 28 | — |
| heading-sm | — | — | 22px | 34 | — |
| heading | — | — | 24px | 32 | — |
| heading-lg | — | — | 40px | 48 | — |
| display | — | — | 66px | 76 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **cards:** 16px
- **links:** 10px
- **badges:** 10px
- **buttons:** 68px

## Components

### Primary CTA Pill
**Role:** Main action button — 'Book a Demo' style

Fully pill-shaped (68px border-radius), Royal Violet (#2f115b) fill, white text in Manrope 16px/600, 16px vertical × 24px horizontal padding, 20px element gap between paired CTAs. No shadow.

### Ghost Outline Button
**Role:** Secondary action — 'See Pricing' style

Pill-shaped (68px radius), transparent fill, 1px Midnight Plum (#1a0d3f) border, Midnight Plum text, same 16/24 padding as primary. The border and text match for a quiet, integrated look.

### Soft Ghost Button
**Role:** Tertiary action on warm backgrounds — 'Read full customer story'

Pill-shaped, Peach Blush (#ffdacf) fill, Midnight Plum text, 16/24 padding. Sits inside testimonial cards to stay subtle against the gradient.

### Top Nav Bar
**Role:** Primary site navigation

White background, 1px Slate Mute (#5e5777) bottom hairline, Manrope 16px/500 for nav links, logo left ('15five' wordmark with orange asterisk burst icon), utility links right ('Log In' in Slate Mute, primary CTA pill in Royal Violet at far right). Sticky, ~72px tall.

### Hero Stat Card
**Role:** Metric tile in hero — Manager Effectiveness, Engagement, Performance, Turnover

White surface, 16px radius, 20px padding, no shadow. Label in Manrope 14px/500 Slate Mute uppercase, big number in Manrope 40px/600 Royal Violet, small '/100' or '%' suffix in lighter weight, footnote in Manrope 14px/400 Slate Mute.

### Dashboard Preview Card
**Role:** Product mockup card — charts, objectives, performance rating

White surface, 16px radius, 20px padding, no shadow, contains a label row (Manrope 14px/500 + slate mute subhead + 'Past Month' date pill), then the chart canvas. Charts use stacked area fills in teal/coral/amber — these are product-screenshot colors, not design system tokens.

### Action Plan Pill Badge
**Role:** Inline badge inside dashboard cards — 'Draft Action Plan'

10px radius, light lavender fill (#f0eaf7, derived from violet family), Midnight Plum text, Manrope 12px/500, 8px vertical × 12px horizontal padding. Always paired with a small star icon.

### Testimonial Carousel Card
**Role:** Customer quote block

Full-width card with a warm gradient background (cream wash → peach blush → soft coral). Five Ember Orange stars top-left, quote text in Midnight Plum Manrope 18px/400, customer logo + name + title block, Soft Ghost Button for the CTA. Pagination dots bottom-left (8px circles, active = Royal Violet, inactive = Peach Blush outline).

### Eyebrow Label
**Role:** Section pre-title — '15 FIVE', 'YOU'RE IN GOOD COMPANY'

Manrope 14px/500 Slate Mute, letter-spacing 0.375em, uppercase. Sits centered above serif headlines with 20px gap. The wide tracking is the signature — it makes tiny text feel deliberate.

### Section Headline
**Role:** Primary section heading

DM Serif Display 400, 40–66px, Midnight Plum (#1a0d3f), line-height 1.15–1.25, centered alignment on hero sections. Never left-aligned at display sizes — the editorial serif reads best when it commands the centerline.

### Logo Mark
**Role:** 15Five brand mark in nav

Wordmark '15five' in Midnight Plum, preceded by an asterisk-burst icon in Ember Orange (#ff4b11) — the burst is the only place the orange appears in the nav.

### Decorative Line Art
**Role:** Background illustration on testimonial cards

Thin 1px strokes in Peach Blush (#ffdacf) and Ember Orange (#ff4b11), low-opacity geometric shapes (arcs, quarter-circles, dots). Floats behind content; never functional, only atmospheric.

## Do's and Don'ts

### Do
- Use DM Serif Display 400 for all section headlines at 40px or larger — the serif weight is the brand's editorial signature and should not be replaced with bold sans.
- Apply the 68px pill radius to every button, including ghost and soft variants — full pill geometry is non-negotiable across the system.
- Build hero and testimonial sections on the cream-to-coral warm gradient (cream wash → peach blush → soft coral) so the warmth reads as atmosphere, not decoration.
- Set eyebrow labels in 14px Manrope with 0.375em letter-spacing and uppercase — this tracking is what makes small all-caps text feel intentional.
- Use Royal Violet (#2f115b) as the single filled-action color; pair it with white text and the 68px pill for primary CTAs.
- Anchor headlines and body copy in Midnight Plum (#1a0d3f) so text reads as ink rather than as color — reserve Royal Violet for emphasis and action.
- Lay sections at 80px vertical gap with max-width 1200px to preserve the calm, spacious editorial rhythm.

### Don't
- Do not introduce a second heading font or bold the serif to 700 — the single-weight DM Serif Display is the discipline.
- Do not use sharp 4–6px radii on buttons or large surfaces; the 68px pill and 16px card radii are the only two button/card shapes in the system.
- Do not place Ember Orange on UI controls or body text — it is reserved for star ratings, the logo burst, and decorative line art.
- Do not add drop shadows to cards or buttons; depth comes from warm gradient washes behind white surfaces, not from elevation.
- Do not use teal, coral, or amber as interface colors — those hues belong inside product-screenshot chart fills only.
- Do not center body copy in long paragraphs; the serif headline is centered, but body text below it should be left-aligned and constrained to 640–720px.
- Do not stack the warm gradient behind dense product UI; reserve it for hero, testimonial, and breathing sections where the warmth can perform.

## Elevation

- **Link / interactive card hover:** `rgba(0, 0, 0, 0.1) 0px 12px 30px 0px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background, all product chrome
- **Warm Wash** (`#fff2e8`) — Gradient band on hero and testimonial sections
- **Card Surface** (`#ffffff`) — Product mockup cards, metric tiles, stat blocks
- **Soft Tint** (`#ffdacf`) — Ghost button fills, highlighted card interiors
- **Action Fill** (`#2f115b`) — Primary CTA pill, highest-attention surface

## Similar Brands

- **Linear** — Same disciplined minimal-canvas approach with one bold accent color reserved for primary action, though Linear favors dark mode and monospaced UI chrome where 15Five uses warm light washes and editorial serif headlines.
- **Notion** — Shared warm-light product-screenshot aesthetic and gentle card-based layout, but Notion leans monochrome and utilitarian where 15Five adds editorial serif headlines and peach gradient atmosphere.
- **Lattice** — Both are HR-tech product sites that pair clean white product UI with a single saturated brand color and centered hero compositions; 15Five differs by using violet rather than Lattice's red and adding the sunset gradient bands.
- **Webflow** — Same editorial tension between a serif display face and a geometric sans for UI, with pill-shaped CTAs and generous section spacing — Webflow is darker and more blue, 15Five is lighter and more violet/peach.
- **Calendly** — Both center a single bold serif headline over a soft gradient hero, use pill buttons, and keep product UI in calm white surfaces with a single brand-violet action color.
