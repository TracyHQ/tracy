# Dub Links — Style Reference
> warm sunrise over monochrome architecture

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Dub presents a warm, confident SaaS aesthetic: a near-monochrome interface anchored by soft cream-to-white gradients, with one vivid orange accent that makes every action feel activated. The system breathes through generous whitespace on a compact 4px grid, pairing Inter's utility precision with Satoshi's rounded display character for headlines. Surfaces stay matte and light with hairline borders and whisper-soft shadows — depth comes from subtle tonal shifts and elevation, never heavy panels. The primary CTA is always a black pill with orange-ember micro-accents nearby, creating a contrast between structural neutrality and brand warmth. Components should feel quick and utilitarian: 4px and 8px radii dominate, pill buttons carry CTAs, and cards are flat white rectangles on a faintly warm canvas.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Cream | `#f5f5f5` | Page background base — the warm off-white that gives the interface its sunlit feel |
| Paper White | `#ffffff` | Card surfaces, elevated panels, input fields — pure white for content containers |
| Ink Black | `#0a0a0a` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Charcoal | `#171717` | Secondary text, button text on dark fills, heading weights |
| Graphite | `#404040` | Tertiary text, muted descriptions, secondary button text |
| Steel | `#737373` | Placeholder text, disabled states, low-emphasis body copy |
| Ash | `#a3a3a3` | Icon fills at rest, muted helper text, tertiary icons |
| Fog | `#d4d4d4` | Input borders at rest, subtle dividers, inactive form controls |
| Mist | `#e5e5e5` | Hairline borders throughout — the workhorse divider color |
| Slate | `#6b7280` | Muted body text, secondary icon strokes, meta information |
| Ember Orange | `#ea580c` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ember Glow | `#fb923c` | Lighter orange for hover states on ember elements, soft accent fills |
| Ember Deep | `#7c2d12` | Dark orange for icon strokes and decorative accents needing depth |
| Signal Blue | `#3b82f6` | Decorative icon accent, link highlights, informational touches — the secondary chromatic note |
| Terminal Green | `#22863a` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Alert Red | `#d32f2f` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Warm Sunrise | `linear-gradient(90deg, rgb(244, 149, 12), rgb(235, 92, 12))` | Gradient endpoint for the hero's warm peach wash — the signature atmospheric gradient |

## Typography

### Satoshi — Display headlines — the custom Satoshi at medium weight creates a rounded, friendly authority at hero scale; its geometric softness contrasts with Inter's utilitarian precision
- **Substitute:** General Sans, Switzer, Inter (weight 600)
- **Weights:** 500
- **Sizes:** 40px, 48px
- **Line height:** 1.00-1.15

### Inter — Primary UI font — handles body text, nav items, buttons, form labels, section headings; weight 500 for nav active states and subtle emphasis, 600-700 for subheadings; tight 1.25-1.43 line-height at body sizes keeps the compact density working
- **Weights:** 400, 500, 600, 700
- **Sizes:** 8px, 12px, 14px, 16px, 18px, 20px, 24px
- **Line height:** 1.25-1.56

### Geist Mono — Short URL display, code snippets, technical metadata — monospace where data precision matters (the shortened link, the click counter)
- **Weights:** 400
- **Sizes:** 12px, 13px, 14px
- **Line height:** 1.33-1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| body-lg | — | — | 18px | 1.56 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 24px | 1.4 | — |
| display | — | — | 48px | 1.15 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **pills:** 9999px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary CTA Button
**Role:** Main conversion action — 'Start for free', 'Sign up'

Ink Black (#0a0a0a) fill, Paper White (#ffffff) text, 8px radius, Inter weight 500 at 14px, 8px 16px padding, subtle 0px 1px 2px shadow at 5% black. The near-black fill against the warm cream canvas is the strongest visual element on any page.

### Secondary Ghost Button
**Role:** Secondary action — 'Get a demo', 'Log in'

Transparent fill with Mist (#e5e5e5) 1px border, Charcoal (#171717) text, 8px radius, Inter weight 500 at 14px, 8px 16px padding. Sits beside the primary CTA as a quiet alternative.

### Sign Up Pill Button
**Role:** Navigation primary action

Ink Black (#0a0a0a) fill, white text, 9999px radius (full pill), Inter weight 500 at 14px, 6px 14px padding. Slightly tighter padding than card CTAs for the nav context.

### Ember Action Button
**Role:** Brand-emphasized action — 'Shorten link', key conversion in product context

Ember Orange (#ea580c) fill, white text, 8px radius, Inter weight 500 at 14px, 8px 16px padding. The single chromatic button in the system — use sparingly for the most important in-product action.

### Text Input
**Role:** URL destination, search, text fields

Paper White (#ffffff) fill, Fog (#d4d4d4) 1px border, Ash (#a3a3a3) placeholder text, Charcoal (#171717) input text, 8px radius, Inter at 14px, 10px 14px padding. Focus state: 4px black-at-10% outer ring.

### Link Shortener Card
**Role:** Hero product demonstration — the centerpiece of the homepage

Paper White surface, 12px radius, two-layer shadow (0px 4px 6px -1px / 0px 2px 4px -2px at 10% black). Contains: input row with Ember Action Button, and a result row with Geist Mono short URL + click count badge. This is the signature component.

### Brand Tag / Badge
**Role:** Category label above headlines — 'Dub Links', 'Branded Short Links'

Light tinted background, Charcoal text, 9999px radius, Inter weight 500 at 12px, 2px 10px padding. Features a small leading icon. Tints include #fef9c3 (warm yellow), #eff6ff (cool blue), #dcfce7 (mint).

### Navigation Bar
**Role:** Top-level site navigation

Transparent on canvas, Ink Black logo wordmark, Inter nav items at 14px weight 500 in Charcoal. Dropdown items have 8px radius. Active nav item has light background highlight.

### Trust Logo Grid
**Role:** Social proof — customer logos

2-row grid of 5 columns, 40px row gap, each logo rendered in Ash (#a3a3a3) or muted monochrome. 'CASE STUDY' link in Geist Mono appears beneath select logos. No borders, pure whitespace separation.

### Product UI Mockup
**Role:** Feature section visual — link creation interface

Paper White surface, 12px radius, layered shadow. Contains form fields, QR code preview, social link preview icons. Simulated browser chrome with traffic light dots at top. Rounded input fields at 8px.

### QR Code Preview Tile
**Role:** Embedded QR code in product mockup

Paper White fill with 8px radius, 1px Mist border, small external link icon. Centered QR code pattern in black.

### Section Heading
**Role:** Feature section titles

Satoshi weight 500 at 40-48px, Ink Black color, centered, line-height 1.15. Followed by 18px body text in Slate (#6b7280) at weight 400, max-width ~600px centered.

## Do's and Don'ts

### Do
- Use 8px radius for all rectangular buttons and inputs, 9999px for pill-shaped tags and nav CTAs
- Apply Inter weight 500 for navigation items, button text, and subtle emphasis; reserve 600-700 for subheadings
- Use Satoshi weight 500 at 40-48px for section display headlines — never drop below 40px
- Pair the Ink Black (#0a0a0a) primary CTA with an Ember Orange (#ea580c) in-product action for a clear primary/secondary distinction
- Use Geist Mono for shortened URLs, click counts, and any technical data display
- Keep section gaps at 80px+ to maintain the airy, spacious rhythm
- Use hairline 1px Mist (#e5e5e5) borders for all dividers and input resting states

### Don't
- Don't use Ember Orange (#ea580c) for more than one action per view — it loses impact when overused
- Don't apply heavy drop shadows — the system uses whisper-soft 1-6px lifts only
- Don't use Satoshi for body text or UI labels — it's display-only at 40px+
- Don't use filled colored backgrounds for cards — surfaces stay white or light-tinted only
- Don't use 4px radius for primary CTAs or feature cards — 8px and 12px are the system minimums for significant elements
- Don't introduce new chromatic colors — the palette is monochrome + orange + blue accent
- Don't use decorative gradients on product surfaces — the warm gradient is hero-only atmospheric

## Elevation

- **Primary button:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`
- **Product card / link shortener:** `rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px`
- **Input focus ring:** `rgba(0, 0, 0, 0.1) 0px 0px 0px 4px`

## Surfaces

- **Canvas** (`#f5f5f5`) — Page background with warm cream tint — the base layer everything sits on
- **Paper** (`#ffffff`) — Card surfaces and product UI mockups — pure white containers
- **Elevated** (`#ffffff`) — Modals, popovers, floating panels with subtle shadow elevation

## Imagery

Visuals are product-first: the site uses UI mockups and product screenshots rather than lifestyle photography. The hero link-shortener card and the branded-links product mockup are the primary visual elements. Customer logos appear as small monochrome marks in a trust grid. The only decorative gradient is the warm peach-to-white wash behind the hero section — everything else sits on a clean neutral canvas. No stock photography, no illustrations, no 3D renders. Icons are minimal: small leading icons in section badges and inline link/chain icons in the shortener UI.

## Layout

The page uses a max-width ~1200px centered container with generous outer padding. The hero is centered text over a warm gradient wash that fades to white — full-bleed gradient with a constrained content stack. Below, sections alternate between centered headline + product visual patterns. The trust logo grid is a 2×5 layout with even spacing. The feature sections use a single-column centered heading followed by a wide product mockup card. Navigation is a simple top bar with horizontal links and right-aligned auth buttons. Content density is low — large vertical breathing room between sections (80px+).

## Similar Brands

- **Vercel** — Same monochrome-first aesthetic with hairline borders, near-black primary CTAs, and minimal color usage; shared commitment to a compact 4px grid and utility-focused Inter typography
- **Linear** — Similar product-mockup-as-hero approach, pill-shaped CTAs, and the same 8px/12px radius hierarchy for buttons and cards
- **Cal.com** — Comparable warm gradient hero washes, orange brand accent against neutral canvas, and the same Satoshi-style rounded display headlines for hero copy
- **Raycast** — Shared product screenshot emphasis over lifestyle imagery, clean monochrome UI with single chromatic accent, and Geist Mono for technical data
