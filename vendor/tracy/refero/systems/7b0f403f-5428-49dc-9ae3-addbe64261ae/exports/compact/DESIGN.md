# Shuttle — Style Reference
> Floating pill in white void — one blue spark on infinite paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Shuttle renders as a single floating pill bar adrift in near-total white space — the entire brand hinges on that one chrome-plated capsule at the top of every page, and a single electric blue that punctuates it. The interface below is deliberately sparse, relying on a tight monochrome spine of black text, gray hairlines, and white surfaces to create a laboratory-clean canvas. Components sit flat against the page with whisper-thin 1px shadows rather than elevation stacks; cards, buttons, and inputs all share an 8px radius, while decorative images and content cards use a softer 16px. Inter Variable carries the whole voice at a tightened -0.025em tracking, ranging from a 62px display whisper down to 10px micro-labels. The result reads like a tool that has been stripped to its chassis — every pixel earns its place, and the blue is the only sound in the room.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Blue | `#0077ff` | Primary CTA fill, active nav state, single accent across the entire interface — the only saturated color permitted on chrome, everything else recedes to monochrome |
| Paper | `#ffffff` | Page canvas, card surfaces, button text on Signal Blue, pill navigation fill — the default surface at every level |
| Ink | `#000000` | Primary text, icon strokes, hairline borders, logo mark — the dominant typographic and structural color |
| Hairline | `#e5e7eb` | Borders, dividers, card edges, input outlines, image frames — the structural skeleton running through the entire system |
| Smoke | `#b8b8b8` | Shadow tint, secondary border accent, button box-shadow base — the only non-black/white value used in elevation |
| Graphite | `#525252` | Secondary body text, muted link color, list items — readable but clearly secondary to Ink |
| Ash | `#737373` | Tertiary text, icon strokes at rest, placeholder content, button secondary labels |
| Mercury | `#a3a3a3` | Decorative SVG strokes, disabled icon state, subtle ornamental linework |
| Slate | `#ababab` | Quiet border accent, nearly invisible dividers in dense layouts |
| Ember | `#f97316` | Decorative illustration accent, warm icon fill — permitted only in graphics, never on chrome |
| Amber | `#f59e0b` | Decorative illustration accent, warm icon fill — pairs with Ember in artwork |
| Crimson | `#ef4444` | Red text accent for links, tags, and emphasized short phrases |
| Deep Signal | `#2563eb` | Secondary blue used only in illustrations and icon sets — not an interface color |

## Typography

### InterVariable — Sole typeface across all contexts — body, headings, nav, buttons, inputs, cards. Tracking tightened globally to -0.025em which makes even 12px body text feel engineered rather than casual. The 62px display size is the only moment of typographic drama, used sparingly for hero statements; everything else lives at 16px or below, reinforcing the tool-like density.
- **Substitute:** Inter (variable) from rsms.me/inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 11px, 12px, 14px, 15px, 16px, 62px
- **Line height:** 1.00–1.67
- **Letter spacing:** -0.025em across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 1.4 | -0.25px |
| caption | — | — | 12px | 1.5 | -0.3px |
| body-sm | — | — | 14px | 1.43 | -0.35px |
| body-lg | — | — | 16px | 1.5 | -0.4px |
| display | — | — | 62px | 1.16 | -1.55px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 128px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 16px
- **pills:** 9999px
- **images:** 16px
- **inputs:** 8px
- **buttons:** 8px
- **nav-pill:** 9999px

## Components

### Floating Pill Navigation
**Role:** Primary site chrome — the signature element visible on every screen

Full pill shape (9999px radius), white fill (#ffffff), thin 1px black shadow (rgba(0,0,0,0.25) 0px 0px 1px 0px). Horizontally centered, sits ~16px from top. Contains logo (Ink-colored), text links at 12px weight 500 in Graphite (#525252), and a Signal Blue (#0077ff) 'Sign up' button with white text at 8px radius, 6px 12px padding, 12px text. The entire bar feels like a single floating object rather than a fixed header.

### Primary CTA Button (Filled)
**Role:** The only high-saturation action element in the system

Signal Blue (#0077ff) fill, white (#ffffff) text, 8px radius, 6px 12px padding, InterVariable 12px weight 500. Thin 1px black shadow. No hover state color shift in raw data — the blue IS the hover-state-equivalent. Arrow icon (→) in white at 12px right-aligned inside the button.

### Ghost Nav Link
**Role:** Secondary navigation items (Updates, Pricing)

No background, no border. Text only: 12px InterVariable weight 500, color Graphite (#525252). Sits inside the pill with ~12px horizontal padding. Relies entirely on typography weight for emphasis rather than color.

### Content Card
**Role:** Container for grouped information blocks

White (#ffffff) surface, 16px border-radius, 16px padding, 1px Hairline (#e5e7eb) border. No shadow or extremely subtle 1px black shadow. Flat against the page — the border does the structural work, not elevation.

### Elevated Feature Card
**Role:** Occasional card with visible elevation for emphasis

White surface, 16px radius, dramatic shadow: rgba(0,0,0,0.25) 0px 25px 50px -12px. Used sparingly — only 2 instances in extracted data. Reserved for hero-adjacent cards or key feature highlights that need to lift off the canvas.

### Text Input
**Role:** Form fields

White fill, 1px Hairline (#e5e7eb) border, 8px radius, 8px vertical / 12px horizontal padding. Text at 14px InterVariable weight 400, Ink (#000000). Placeholder in Ash (#737373). No focus ring color data extracted — default to Hairline darkening to Ink on focus.

### Framed Image
**Role:** Content images and illustrations

16px border-radius, 1px Hairline (#e5e7eb) border. Sits flush in card layouts. 13px horizontal margins when used in image grids.

### Hairline Divider
**Role:** Structural section separator

1px Hairline (#e5e7eb) horizontal line, full container width. No margin — sits flush between content blocks.

### Icon Set
**Role:** UI and decorative icons throughout the interface

1.5px stroke weight consistent across set. Icons in UI context: Ink (#000000) at rest, Ash (#737373) for secondary, white on Signal Blue fills. Decorative icons in illustrations use the full accent palette: Ember, Amber, Crimson, Deep Signal.

### Logo Mark
**Role:** Brand identification in pill nav

Small square icon in Signal Blue (#0077ff) at ~20px, followed by 'Shuttle' wordmark in Ink (#000000) at 12px weight 700. The blue icon is the only non-text blue element in the nav besides the CTA button.

### List Item
**Role:** Ordered or unordered lists in body content

Graphite (#525252) text, 12px InterVariable, tight vertical rhythm with 8px row spacing. No bullet color differentiation from text.

### Link
**Role:** Inline text links

Graphite (#525252) default — NOT blue. Shuttle deliberately avoids the default blue link convention. Links are distinguished by weight (500) rather than color, keeping the page's chromatic discipline intact.

## Do's and Don'ts

### Do
- Use Signal Blue (#0077ff) exclusively for the primary CTA fill and the logo icon — it is the only saturated color in the interface
- Apply the 9999px pill radius to the navigation bar, tag elements, and any floating UI capsules
- Use 8px radius for all interactive elements (buttons, inputs) and 16px for content containers (cards, images)
- Set letter-spacing to -0.025em on all InterVariable text regardless of size
- Pair every elevated surface with the thin 1px black shadow (rgba(0,0,0,0.25) 0px 0px 1px 0px); reserve the dramatic 25px 50px shadow for feature cards only
- Keep section gaps at 128px and element gaps at 8px to preserve the compact laboratory rhythm
- Use Ink (#000000) for text and Hairline (#e5e7eb) for borders as the structural backbone — the system is 98% monochrome

### Don't
- Do not use the accent palette (Ember, Amber, Crimson, Deep Signal) on any chrome element — they are illustration-only
- Do not apply rounded corners larger than 16px to content cards; oversized radii break the tool-like density
- Do not introduce gradients, colored shadows, or tinted elevations — shadows are always black at 0.25 opacity
- Do not color links blue — Shuttle uses Graphite (#525252) with weight 500 for inline links to preserve chromatic discipline
- Do not use display-size type (62px) more than once per page section; the whisper-light display is a punctuation mark, not a paragraph
- Do not add background color to the nav pill — its whiteness against the white canvas is established by the 1px black shadow alone
- Do not mix radius scales within a single component family; buttons stay at 8px, cards stay at 16px, no exceptions

## Elevation

- **Floating Pill Navigation:** `rgba(0, 0, 0, 0.25) 0px 0px 1px 0px`
- **Primary CTA Button:** `rgba(0, 0, 0, 0.25) 0px 0px 1px 0px`
- **Content Card:** `rgba(0, 0, 0, 0.25) 0px 0px 1px 0px`
- **Elevated Feature Card:** `rgba(0, 0, 0, 0.25) 0px 25px 50px -12px`

## Surfaces

- **Paper** (`#ffffff`) — Page canvas — the infinite white background that defines Shuttle's minimalism
- **Card** (`#ffffff`) — Content containers and the nav pill — same white, distinguished by 1px Hairline border or thin shadow
- **Action** (`#0077ff`) — Primary CTA fill — the only elevated surface with chromatic identity

## Imagery

Imagery is minimal and white-backgrounded. Content images and illustrations are framed with 16px radius and 1px Hairline borders, sitting flush in card grids with 13px gutters. Decorative illustrations use a warm accent palette (Ember #f97316, Amber #f59e0b, Crimson #ef4444, Deep Signal #2563eb) that is strictly quarantined from the interface — these colors never appear on chrome. The overall visual weight is text-dominant with sparse, contained imagery.

## Layout

Max-width 1200px centered content. The hero pattern is a floating pill navigation centered at the top with 16px top margin, followed by expansive white space. Sections are separated by 128px vertical gaps with hairline dividers. Content arrangement favors centered stacks and 2-column text+image blocks. Card grids appear in 3-column configurations for feature blocks. The page breathes — sections are spacious and information-sparse, with each element given room to exist independently rather than packed into dense information clusters.

## Similar Brands

- **Linear** — Same ultra-minimal monochrome interface with a single accent color (Linear's purple, Shuttle's blue) and near-zero colorfulness — the entire brand rests on one saturated CTA against infinite white
- **Vercel** — Floating centered nav, white-canvas minimalism, Inter typeface with tightened tracking, single chromatic accent on CTAs and nothing else
- **Cal.com** — Compact 4px-based spacing system, 8px button radii, hairline borders, and a disciplined single-accent approach to color across a dev-tool surface
- **Resend** — Dev-tool aesthetic with white-dominant pages, tight Inter typography, pill-shaped nav, and the philosophy that one blue should do all the work
- **Plausible Analytics** — Extreme whitespace discipline with minimal color palette, compact spacing tokens, and the visual feeling that the product itself is deliberately understated
