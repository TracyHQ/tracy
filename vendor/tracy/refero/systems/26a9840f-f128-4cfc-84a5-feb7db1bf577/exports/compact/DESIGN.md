# Adora — Style Reference
> impressionist museum behind frosted glass

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Adora wraps a precise product-analytics interface inside an impressionist gallery — white cards and crisp dashboards sit on canvas-like backgrounds of swirling oil-paint color, with hand-drawn squiggle underlines giving headings a notebook-becoming-poster feel. The color story is white-surface discipline broken by a single vivid violet for action and a palette of pastel accents (sky blue, lime, bubblegum pink, hot magenta) that are used as small confetti, not washes. Shapes are confidently rounded: cards and the product frame are very generous (40-64px), badges and the floating nav pill are stadium-rounded, buttons are gently rounded (8-12px). Typography pairs a custom display face (PolySans) at heavy weights for headlines against Plus Jakarta Sans at 400-500 for UI, with universal -0.02em tracking pulling the whole system tight and contemporary.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Violet | `#592eff` | Primary action background, filled CTA buttons, active link borders, selected badge strokes — the single saturated chromatic that drives every conversion and active state |
| Midnight Plum | `#21164c` | Headline text color, display-weight typography — deep violet-ink that reads as near-black but carries a violet undertone matching the primary |
| Obsidian Charcoal | `#353241` | Body text, paragraph copy, list items, icon strokes, default borders and dividers — the workhorse neutral that defines almost all interface line work |
| Slate Smoke | `#5f5f69` | Secondary body text, muted helper copy, supporting metadata |
| Pearl Mist | `#e0e0db` | Hairline borders on buttons, cards, and inputs; subtle structural dividers |
| Soft Concrete | `#eeeeee` | Subtle surface fills, secondary button backgrounds, disabled or recessed controls |
| Pure White | `#ffffff` | Page and card surfaces, button text on violet fills, nav-pill and elevated panel backgrounds |
| Sky Tint | `#bcf2ff` | Decorative pastel accent — painterly background fills, soft highlight washes, illustrative splashes |
| Lime Spritz | `#dfff9d` | Decorative pastel accent — painterly background fills, squiggle underline fills, product card surface variation |
| Cotton Candy | `#ffaae6` | Decorative pastel accent — soft pink washes, squiggle underline highlights, atmospheric card backgrounds |
| Neon Cyan | `#2ed6ff` | Badge stroke and informational icon accent — vivid, used in tag outlines and feature flags |
| Lime Pop | `#a2ea13` | Badge stroke and positive/success-leaning icon accent — vivid green used in tag outlines |
| Magenta Pulse | `#f843c2` | Badge stroke and energetic icon accent — hot pink for tag outlines and feature highlights |

## Typography

### PolySans — Display and headline face — custom geometric sans used exclusively for page titles, section headers, and hero copy at heavy weights. The 68px hero size with weight 700 and tight -0.02em tracking is the system's signature: it reads architectural and confident, not friendly. Substitute with General Sans Bold or Plus Jakarta Sans 700 if unavailable.
- **Substitute:** General Sans Bold
- **Weights:** 600, 700
- **Sizes:** 18px, 28px, 38px, 58px, 68px
- **Line height:** 1.10, 1.20
- **Letter spacing:** -0.02em

### Plus Jakarta Sans — Body, UI, and supporting type — paragraphs at 18px/1.6 weight 400, button labels and nav links at 16px weight 500, badges at 14px, medium emphasis at 500. The 32px size at tight 1.10 line-height appears in sub-section headings. Universal -0.02em tracking pulls it into the same family feel as PolySans.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14px, 16px, 18px, 20px, 32px
- **Line height:** 1.00, 1.10, 1.60
- **Letter spacing:** -0.02em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.6 | -0.28px |
| body-sm | — | — | 16px | 1.6 | -0.32px |
| body | — | — | 18px | 1.6 | -0.36px |
| subheading | — | — | 20px | 1.6 | -0.4px |
| heading-sm | — | — | 32px | 1.1 | -0.64px |
| heading | — | — | 38px | 1.1 | -0.76px |
| heading-lg | — | — | 58px | 1.1 | -1.16px |
| display | — | — | 68px | 1.1 | -1.36px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 12px

### Border Radius

- **cards:** 40px
- **badges:** 200px
- **buttons:** 8px
- **navPill:** 40px
- **productFrame:** 64px

## Components

### Floating Navigation Pill
**Role:** Top-of-page primary navigation

White pill-shaped container with 40px radius, floating above content with a subtle hairline border in #e0e0db. Contains logo lockup, nav links (Product, Resources with chevron dropdowns, Pricing, Request demo, Login) in #353241 at 16px Plus Jakarta 500, and a filled violet Get Started button on the right. The pill form is a signature — nav is never a full-bleed bar.

### Primary Action Button
**Role:** Filled CTA for highest-priority conversion

Background #592eff, white text, Plus Jakarta Sans 16px weight 500, padding 10px 20px, border-radius 8px. No border. The single chromatic filled button in the system.

### Ghost Action Button
**Role:** Secondary action with icon, paired with primary CTA

Transparent background, 1px #e0e0db border, #353241 text, 16px Plus Jakarta 500, padding 10px 20px, border-radius 8px. Icon prefix (e.g. play triangle) in #353241. Used for Watch demo, Learn more patterns.

### Learn More Ghost Link
**Role:** Textual entry point to feature detail

Underlined text link in #353241, Plus Jakarta 500 at 16px, no background, no border. Acts as the feature-card call-to-action when a filled button would over-weight the layout.

### Feature Card
**Role:** Three-up feature block in product sections

White background, 1px #e0e0db border, border-radius 40px, padding 32px. Contains a large rounded product-screenshot image at top, heading in #21164c at PolySans 700 28-32px, body in #353241 at 18px/1.6, and a Learn More ghost link at bottom. Cards are roomy and image-led.

### Product Showcase Frame
**Role:** Large hero/feature visual with painterly backdrop

Oversized rounded container (radius 40-64px) holding a screenshot of the product dashboard. Sits on top of an impressionist oil-painting background that bleeds in pastel swatches of #bcf2ff, #dfff9d, and #ffaae6. The painted backdrop is decorative-only and never appears behind text blocks.

### Squiggle Underline
**Role:** Decorative emphasis on key words in headlines

Hand-drawn wavy underline (SVG stroke) applied beneath one or two words in a display heading, filled in a pastel (#ffaae6 pink, #bcf2ff blue, or #dfff9d lime). The squiggle sits below the baseline and extends 4-8px past the word edges, giving an editorial, notebook-feel accent.

### Tag Badge
**Role:** Status, category, or filtering label

Stadium-pill (200px radius), small padding 6px 12px, transparent or very light fill, 1px chromatic border in #2ed6ff, #a2ea13, or #f843c2. Label text in matching chromatic at 14px Plus Jakarta 500. Used inline in copy and at the top of content cards.

### Logo Lockup
**Role:** Brand identity in nav and footer

Adora wordmark with a small abstract spiral/swirl icon prefix in #592eff. Icon is a single continuous curved line, wordmark is Plus Jakarta Sans 600 at 20px in #21164c.

### Social Proof Logo Strip
**Role:** Trust signal beneath hero

Centered horizontal row of partner logos (Linktree, Canva, Replit, Granola, Chess.com etc.) rendered in monochrome #353241, evenly distributed with consistent visual weight, no logo larger than 28px tall. Optional kicker text above in #5f5f69 14px uppercase.

### Input Field
**Role:** Text input for forms and search

White background, 1px #e0e0db border, border-radius 12px, padding 12px 16px. Placeholder text in #5f5f69. Focus state thickens border to 1.5px #592eff with no glow ring.

### Section Divider
**Role:** Structural break between content blocks

No visible rule — sections are separated by generous vertical spacing (80px section gap) and alternation between white canvas and painterly-wash backgrounds. Divider lines are reserved for inside cards and lists.

## Do's and Don'ts

### Do
- Use Electric Violet (#592eff) only for one filled CTA per viewport, plus active-link borders and selected badge strokes — never as a large background wash
- Set display headings at PolySans 700 in #21164c (Midnight Plum), not pure black, so the violet undertone links to the action color
- Apply -0.02em letter-spacing universally across all type sizes — it is the single typographic move that unifies PolySans and Plus Jakarta
- Use the 40px and 64px border-radii on cards and product frames — generous rounding is the system, not a 16px default
- Limit the pastel accents (#bcf2ff, #dfff9d, #ffaae6) to painterly backgrounds and squiggle underlines — they should never appear as solid button fills or large text colors
- Place hand-drawn squiggle underlines beneath 1-2 words in a display heading to add the editorial accent — never under body copy or UI labels
- Keep the floating nav as a white pill with 40px radius; never convert it to a full-bleed header bar

### Don't
- Do not use #592eff on text or as a page-background tint — it is an action color, not a brand wash
- Do not use #bcf2ff, #dfff9d, or #ffaae6 as filled button backgrounds or large text colors — they are decoration only
- Do not mix rounded buttons (8-12px) with sharp square cards — the system trusts large radius on containers and small radius on controls
- Do not set body text in pure #000000 — use #353241 so the neutral has a violet undertone that ties to the brand
- Do not add drop shadows to elevate cards — depth comes from white-on-white layering and generous radius, not shadow stacks
- Do not introduce a third display font or a serif — PolySans for headlines and Plus Jakarta for everything else is a closed pair
- Do not extend the painterly background behind text blocks — it belongs only behind product frames and image containers, never behind reading content

## Surfaces

- **Page Canvas** (`#ffffff`) — Primary page background, most reading surfaces
- **Elevated Card** (`#ffffff`) — Feature cards, product frame, nav pill, content panels
- **Recessed Surface** (`#eeeeee`) — Secondary button backgrounds, subtle alt bands
- **Atmospheric Wash** (`#bcf2ff`) — Painterly decorative background bleeding behind product frames

## Imagery

The visual language mixes two distinct modes: (1) clean product-screenshot crops inside large rounded frames, always shown against a layered backdrop and never decorated with lifestyle context — the UI is the hero, and (2) impressionist oil-painting swatches in pastel sky blue, lime, and pink that bleed behind product frames as soft atmospheric washes. Illustrations are limited to hand-drawn squiggle SVG underlines beneath headline words. Icons in the product UI are thin-stroke line icons in #353241, 1.5px weight, geometric and functional. No photography, no 3D renders, no stock imagery. The painterly texture is a single repeating decorative asset, not a per-section illustration set.

## Layout

Max-width 1200px centered content column with a floating pill nav at the top. The hero is a centered text stack (headline, subhead, dual-button row) on white canvas with the product showcase frame directly below, extending full-bleed to the viewport edges so the painterly background can bleed past the container. Sections are vertically separated by ~80px gaps with no dividers. Feature blocks use a 3-column equal grid of feature cards with generous internal padding. The social proof band sits centered as a single horizontal logo strip with a small kicker above. Overall rhythm: open and spacious, with painterly color used as punctuation between otherwise quiet white bands.

## Similar Brands

- **Linear** — Same tight -0.02em letter-spacing, same 8px button radius paired with generous card rounding, and the same discipline of using a single saturated brand color against a near-monochrome neutral palette
- **Framer** — Same floating pill nav pattern, same painterly gradient washes behind product screenshots, and the same hand-drawn squiggle accents under display headlines
- **Pitch** — Same custom-display + geometric-body font pairing, same generous card radii, and the same preference for bold violet/navy as the primary text color over pure black
- **Arc** — Same commitment to a single vivid chromatic action color against a white-and-neutral canvas, with decorative color appearing only as small confetti accents
- **Raycast** — Same 40px-range card radii, same 8px control radius, and the same quiet surface treatment where depth comes from layering and rounding rather than shadow
