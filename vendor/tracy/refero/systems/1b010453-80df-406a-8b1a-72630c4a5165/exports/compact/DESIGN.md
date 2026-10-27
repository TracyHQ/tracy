# Qatchup — Style Reference
> Ink on warm paper, whispered quietly.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Qatchup uses a near-achromatic canvas where the only color is emotional: a washed-out grid of gray ink on warm white, with the product almost entirely communicated through type, spacing, and a single handwritten accent. The system is defined by restraint — a custom display sans (Aspekta) set tight with negative tracking, pill-shaped controls, and cards that float on layered hairline shadows rather than colored surfaces. Structure is established by border weight and vertical rhythm, not fills or gradients. A single script typeface (Fasthand) appears sparingly as a human signature — the 'Listen!' above the hero, the 'Open Letter' kicker — creating emotional warmth against an otherwise architectural grid. Components are minimal and ghosted: dark pill buttons for primary action, light pill buttons for secondary, bordered cards for content blocks, and thin dividers carrying the layout's load. The colorful hand-drawn illustration is decorative atmosphere, not a UI token system — the interface itself stays quiet and monochrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Charcoal | `#080808` | Primary headings, high-emphasis text — the deepest ink against the warm white canvas, anchoring headlines at maximum contrast |
| Graphite | `#222222` | Body text, icon strokes, secondary headings — slightly lighter than Charcoal for body density where pure black feels too heavy |
| Mid Ink | `#292929` | Filled button background, dark UI surfaces, strong border emphasis — the primary action surface; charcoal-darker than body text for weight contrast against pills |
| Steel | `#696969` | Default border color, card edges, icon strokes at rest — the structural hairline that carries the entire layout; appears in 260 borderColor uses, making it the most-used stroke in the system |
| Fog | `#999999` | Muted secondary borders, low-emphasis dividers — a lighter hairline for de-emphasized structure |
| Ash | `#b2b2b2` | Card inner borders, subtle dividers inside containers — softer than Steel for nested elements |
| Slate | `#8d8d8d` | Disabled or inactive border state, decorative dividers — sits between Steel and Fog for tertiary structural lines |
| Mist | `#cccccc` | Subtle shadow contribution, light card shadow base — a desaturated mid-gray for soft elevation |
| Silk | `#e4e4e7` | Image borders, body content dividers, light surface separators — the lightest visible structural line, near-white with just enough definition |
| Bone | `#fafafa` | Page canvas, card surfaces, link border, light text on dark — the warm white foundation; every other neutral reads against this base |
| Cream | `#f4f4f5` | Secondary button fill, elevated surface tone, subtle hover state — one step warmer/lighter than Bone for nested surfaces |

## Typography

### Aspekta — All UI text — headlines at 40-56px use weight 400 with aggressive negative tracking (-0.035em to -0.020em) to create a condensed, modern feel; body text at 16-18px uses weight 400 with lighter tracking (-0.011em to -0.010em); weight 500 reserved for button labels and emphasis. The tight letter-spacing at display sizes is signature — it pulls letters together so headlines read as confident blocks rather than airy sentences.
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16, 18, 20, 24, 32, 40, 48, 56
- **Line height:** 1.14, 1.17, 1.20, 1.25, 1.33, 1.38, 1.40, 1.43, 1.50, 1.56, 2.00
- **Letter spacing:** -0.035em at 56px, -0.030em at 48px, -0.020em at 40px, -0.017em at 32px, -0.016em at 24px, -0.011em at 18-20px, -0.010em at 16px, normal at 12-14px
- **OpenType features:** `"ss01" on, "cv11" on`

### Fasthand — Handwritten accent for emotional kickers and signatures — the 'Listen!' above the hero headline, the 'Open Letter' section intro. One weight, one size, used at most once per section. This is the human voice in an otherwise architectural system; it appears only where the brand needs warmth over precision.
- **Substitute:** Caveat, Kalam, Patrick Hand
- **Weights:** 400
- **Sizes:** 32
- **Line height:** 1.38
- **Letter spacing:** -0.010em

### Aspekta 500 — Aspekta 500 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.12px |
| body-sm | — | — | 14px | 1.43 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 18px | 1.56 | -0.2px |
| subheading | — | — | 20px | 1.4 | -0.34px |
| heading-sm | — | — | 24px | 1.38 | -0.38px |
| heading | — | — | 32px | 1.38 | -0.54px |
| heading-lg | — | — | 40px | 1.25 | -0.8px |
| display | — | — | 48px | 1.2 | -1.44px |
| display-lg | — | — | 56px | 1.14 | -1.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24-32px
- **Element gap:** 10-16px

### Border Radius

- **cards:** 32px
- **pills:** 999px
- **images:** 16px
- **buttons:** 100px
- **small-images:** 12px

## Components

### Dark Pill Button
**Role:** Primary action control

Filled dark button at #292929 background, #fafafa text, Aspekta 500 at 16px. Radius 100px creates the pill shape. Padding 11px vertical, 22px horizontal. Used for the main 'Login / Sign up' action and any single primary CTA per screen. No visible border — the dark fill IS the boundary.

### Light Pill Button
**Role:** Secondary action control

Ghost button at #f4f4f5 background with #292929 text. Radius 100px. Same dimensions as the dark pill. Used when a secondary action sits next to a primary one without competing for weight.

### Floating Content Card
**Role:** Content panel — feedback widget, feature block

White surface (#fafafa) with 32px radius. Layered shadow: hairline ring (rgba(19,19,22,0.05) 0px 0px 0px 1px) + soft drop (rgba(0,0,0,0.04) 0px 2px 3px 0px, rgba(34,42,53,0.04) 0px 4px 6px 0px, rgba(0,0,0,0.05) 0px 1px 1px 0px). Padding 24-32px. Contains structured lists with icon + title + description rows separated by 16-24px gaps.

### Modal/Card with Deep Elevation
**Role:** Elevated overlay or popover

Same 32px radius and #fafafa surface, but with stronger shadow: adds rgba(47,48,55,0.05) 0px 24px 68px 0px to the standard card shadow stack. Used for elements that need to feel detached from the page surface.

### Rounded Image Frame
**Role:** Image container

16px radius border with subtle drop shadow (rgba(16,24,40,0.08) 0px 17px 23px -6px, rgba(16,24,40,0.03) 0px 6px 9px -3px). Used for product screenshots, portraits, and editorial images that need to feel lifted from the page.

### Navigation Bar
**Role:** Top-level page navigation

Full-width bar on Bone (#fafafa) background. Three-zone layout: brand mark left ('QP' wordmark), centered logo (the 'Q.' glyph), utility links right ('Blog' text link + dark pill button). No visible border or background fill — sits on the page canvas. Height ~60px.

### Centered Hero Block
**Role:** First-screen hero pattern

Vertically stacked, horizontally centered. Fasthand 32px accent line at #696969, then Aspekta 48-56px display headline at #080808 in 2 lines, then 16-18px body subtext at #696969. No background, no border — pure type on canvas. Generous vertical padding (80-120px top/bottom).

### Two-Column Letter Layout
**Role:** Long-form narrative sections

Left column: Fasthand kicker + Aspekta heading-lg subhead, max-width ~40% of container. Right column: body text at 18px weight 400, #696969, line-height 1.56. Columns separated by 40-60px gap. The asymmetric split creates editorial rhythm.

### Feedback Option Row
**Role:** Selectable item in the feedback widget

Horizontal row: icon (24px, #292929 stroke) + title (16px Aspekta 500, #080808) + description (14px Aspekta 400, #696969). Padding 12px vertical. Separated from neighbors by subtle background change or 8px gap, not a visible divider line.

### Grid Background Pattern
**Role:** Subtle page texture

Very faint square grid (1px lines at #e4e4e7 or similar low-contrast) behind the hero section. Not a component but a visual foundation — gives the flat canvas a sense of structure and technical precision.

### Wordmark Lockup
**Role:** Brand identity in header/footer

Small uppercase 'QP' set in Aspekta 500 at 14px, or the standalone 'Q.' glyph at 24px with the period as a design detail. Charcoal (#080808) on the light canvas. No logo color — identity is purely typographic.

### Illustrative Crowd Border
**Role:** Decorative full-bleed illustration

Hand-drawn doodle characters in a rainbow spectrum (blue, yellow, pink, orange, green) forming a crowd border at the bottom of the hero. Full-bleed width, organic edge (not clipped to a rectangle). This is the ONLY color in the system — purely decorative, never applied to UI controls or text.

### Text Link
**Role:** Inline navigation link

Aspekta 400 at 16px, #292929, no underline by default. Appears in nav and body copy. 28 borderColor uses of #fafafa suggest links may have a subtle background or underline treatment in certain states.

### Hairline Divider
**Role:** Section separator within cards or lists

1px line at #e4e4e7 (Silk) or #b2b2b2 (Ash). No vertical padding — just a thin horizontal rule. Used between content rows inside the feedback widget card.

## Do's and Don'ts

### Do
- Use 100px or 999px radius for all interactive elements — pill buttons and fully rounded tags only
- Set Aspekta at 48-56px with -0.030em to -0.035em letter-spacing for all display headlines
- Use #696969 (Steel) as the default border color for cards, dividers, and structural lines
- Layer shadows with a hairline ring (0px 0px 0px 1px) first, then soft drop shadows — never use a single hard shadow
- Reserve Fasthand for at most one emotional kicker per section — the 'Listen!' or 'Open Letter' moment
- Keep all UI elements in the neutral palette; color appears only in decorative illustration
- Maintain 80-120px vertical rhythm between sections — the whitespace is part of the brand

### Don't
- Don't introduce a chromatic accent color for buttons, links, or text — the system has none
- Don't use square or 4-8px radius on cards — the 32px radius is structural to the brand
- Don't apply the decorative rainbow illustration style to icons, controls, or functional graphics
- Don't use Aspekta weight 500 for body text — reserve it for button labels and single-word emphasis
- Don't add background colors to sections — the system relies on whitespace and the warm-white canvas for separation
- Don't use gradients on UI elements — the system is flat and matte, elevation comes from shadow only
- Don't set letter-spacing to 0 or positive values on display sizes — the tight tracking is signature

## Elevation

- **Content Card:** `rgba(19, 19, 22, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 2px 3px 0px, rgba(34, 42, 53, 0.04) 0px 4px 6px 0px, rgba(0, 0, 0, 0.05) 0px 1px 1px 0px`
- **Elevated Modal/Popover:** `rgba(19, 19, 22, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 2px 3px 0px, rgba(47, 48, 55, 0.05) 0px 24px 68px 0px, rgba(34, 42, 53, 0.04) 0px 4px 6px 0px, rgba(0, 0, 0, 0.05) 0px 1px 1px 0px`
- **Image Frame:** `rgba(16, 24, 40, 0.08) 0px 17px 23px -6px, rgba(16, 24, 40, 0.03) 0px 6px 9px -3px`
- **Subtle Card Hairline:** `rgba(0, 0, 0, 0.2) 0px 0px 0.5px 0.5px, rgba(0, 0, 0, 0.08) 0px 1px 1px -0.5px, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px`

## Surfaces

- **Page Canvas** (`#fafafa`) — The base warm-white background of all pages
- **Card Surface** (`#fafafa`) — Floating content panels and cards — same color as canvas, distinguished only by shadow and radius
- **Secondary Surface** (`#f4f4f5`) — Nested or secondary buttons, subtle hover states, elevated sub-panels
- **Dark Surface** (`#292929`) — Primary action button fill, dark UI elements requiring maximum contrast against the light canvas

## Imagery

Imagery is bimodal: product/UI screenshots sit in 16px-radius frames with soft directional shadows, while decorative editorial illustration appears as a full-bleed crowd of hand-drawn doodle characters in rainbow colors. The illustration is organic, uncontained, and runs edge-to-edge at the base of sections — it bleeds without a frame or mask. Photography (if any) would be high-key and desaturated to match the neutral palette. Icons are 24px outlined strokes in #292929, thin weight, monoline. The system treats illustration as atmosphere, not content — it's the only place color is permitted, and it stays in a contained decorative band rather than leaking into UI controls.

## Layout

Page model is max-width 1200px centered with generous outer padding (40-60px). The hero is a centered single-column type stack on the canvas — no split image+text, no full-bleed background. Sections below transition to a two-column asymmetric layout: left column is narrow (~40%) for heading + kicker, right column is wider for body copy, with 40-60px gap. The feedback widget card breaks the pattern — it appears as a floating centered card overlapping the decorative illustration band, creating a layered focal point. Navigation is a minimal top bar with three zones (brand left, logo center, actions right), no sticky behavior visible. The page breathes: 80-120px between sections, no dense grids, no card grids. The rhythm is editorial — one idea per section, each given room to exist. The faint background grid pattern behind the hero adds technical texture without competing with content.

## Similar Brands

- **Linear** — Same monochromatic near-black-on-white palette, same tight-tracked geometric sans for headlines, same pill-shaped controls and editorial whitespace
- **Vercel** — Identical approach to near-achromatic interface with strong typographic hierarchy, minimal color, and ghost/ghost-bordered component patterns
- **Stripe** — Same warm-white canvas with soft-layered card shadows, near-black text, and restraint as the primary design philosophy
- **Raycast** — Similar ultra-minimal layout with centered hero type, pill buttons, and a focus on typography over color to establish identity
- **Frame.io** — Same editorial two-column asymmetric layout and large quiet headlines on a warm-white surface
