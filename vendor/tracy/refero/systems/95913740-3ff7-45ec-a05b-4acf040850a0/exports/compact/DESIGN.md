# Reworkd — Style Reference
> Soft daylight over a product blueprint — the only color that speaks is the action button and the gradient headline above it.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Reworkd presents a quiet, AI-tool aesthetic built on a soft lavender-to-white canvas with a single vivid blue accent that powers CTAs, gradient text fills, and the product's blue-violet glow. The defining typographic move is pairing a custom high-contrast display serif (Selecta) at near-black against Suisse Intl for the entire UI chrome — the serif headline is the only decorative gesture on an otherwise utilitarian surface, creating a calm-product contrast. Layout is compact, centered, max-width contained, with thin 6px-radius cards floating on layered soft shadows and hairline 1px borders. Color discipline is strict: 95% achromatic plus one electric blue family, with green reserved for status badges and gradients used sparingly for atmosphere (hero glow) and emphasis (gradient headline text).

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris Blue | `radial-gradient(335.69% 99.21% at 57.77% 0px, rgb(0, 89, 255) 0px, rgba(129, 118, 255, 0.73) 36.5%, rgba(255, 225, 66, 0) 75.65%, rgba(72, 132, 239, 0) 100%)` | Brand borders, gradient text fills, icon strokes, link accents — the dominant chromatic identifier across the entire site; Hero background radial glow — the atmospheric blue light at the top of the page |
| Cobalt | `linear-gradient(rgb(88, 151, 247) 0px, rgb(56, 114, 230) 100%)` | Primary action button fill, active states — the only solid color button in the system; Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Sky Glow | `#3e9ed0` | Secondary blue accent for illustrations and decorative icon strokes |
| Mint Pulse | `#89ecb0` | Green outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |
| Midnight Iris | `#2c65d3` | Link border accent, gradient text deep stop |
| Ink | `#272c30` | Primary text, dominant border color, nav text, heading text — the structural dark of the system |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text, inverted surfaces |
| Lavender Mist | `#f0f5fe` | Hero gradient origin, soft section backgrounds — gives the page its daylight wash |
| Pale Slate | `#e3e8ea` | Secondary surface, input backgrounds, hairline border variant |
| Dove Gray | `#a6b4ba` | Icon strokes, muted borders, secondary button borders — cool-toned mid-gray |
| Iron | `#526068` | Body text muted, secondary button text, supportive UI labels |
| Graphite | `#60737a` | Tertiary text, helper copy, table row metadata |
| Slate Mist | `#7b8e95` | Icon stroke variant, heading accent borders, decorative line work |

## Typography

### Selecta — Display and headline serif — the only decorative typeface, used exclusively for hero/page-level headlines with tight negative tracking. The choice of a high-contrast serif for an AI devtool is the system's signature: it signals editorial confidence against an otherwise utilitarian sans-serif body. Tightest tracking at 86px (-0.025em ≈ -2.15px) tightens to -0.015em at 40px, loosening as size decreases.
- **Substitute:** Fraunces, Tiempos Headline, or Playfair Display
- **Weights:** 400, 500
- **Sizes:** 18px, 40px, 56px, 80px, 86px
- **Line height:** 0.95, 1.00, 1.10, 1.17, 1.33
- **Letter spacing:** -2.15px at 86px, -2.0px at 80px, -1.12px at 56px, -0.60px at 40px, 0.36px at 18px

### Suisse Intl — Primary UI typeface — body text, nav, buttons, cards, icons labels, badges. Carries the entire system except headlines. Weight 450 (the unusual mid-weight) is the signature body weight; 500 for emphasis and nav items. Tracking opens positive (0.04–0.05em) at the smallest sizes (8–10px) to keep tiny UI labels legible.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 450, 500, 600
- **Sizes:** 8px, 9px, 10px, 11px, 12px, 14px, 16px
- **Line height:** 1.00, 1.09, 1.20, 1.33, 1.40, 1.43, 1.45, 1.50, 1.57, 1.67
- **Letter spacing:** 0.05em at 8–9px, 0.04em at 10px, 0.02em at 12–14px, 0.01em at 16px

### Geist Mono — Code snippets, tab labels in the product mockup, file path labels, technical micro-copy. Most distinctive use: extreme 0.15em tracking on the smallest sizes (the "What's the problem?" eyebrow label style), creating an all-caps, wide-tracked technical eyebrow that contrasts the serif headline below it.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Geist Mono (open-source)
- **Weights:** 400, 450, 500, 600
- **Sizes:** 8px, 9px, 10px, 12px, 16px
- **Line height:** 1.20, 1.33, 1.50, 1.60, 1.67
- **Letter spacing:** 0.15em for eyebrow labels, 0.02em for code blocks, 0.01em for inline code

### Geist Sans — Fallback/secondary sans for specific UI clusters where Geist Mono's monospace character isn't needed but a lighter weight sans is. Used sparingly — Suisse Intl does the heavy lifting.
- **Substitute:** Inter or system-ui
- **Weights:** 400, 500, 600, 700
- **Sizes:** 8px, 11px, 12px
- **Line height:** 1.45, 1.50, 1.67, 2.18
- **Letter spacing:** 0.0100em, 0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 0.4px |
| body | — | — | 14px | 1.43 | 0.14px |
| heading-sm | — | — | 18px | 1.33 | 0.36px |
| heading | — | — | 40px | 1.1 | -0.6px |
| heading-lg | — | — | 56px | 1 | -1.12px |
| display | — | — | 80px | 0.95 | -2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 12px

### Border Radius

- **nav:** 6px
- **tags:** 9999px
- **cards:** 6px
- **icons:** 9999px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Primary CTA Button
**Role:** Hero and section-level action button

Filled Cobalt (#3e79ea) background, white text, Suisse Intl 14px weight 500, 6px radius, 8px vertical / 14–16px horizontal padding. Subtle inset highlight (rgba(255,255,255,0.25) 0 1px 0 inset) plus soft outer drop shadow stack. The only fully chromatic button in the system — use it once per viewport.

### Secondary Outline Button
**Role:** Companion action next to primary CTA

White or transparent background, 1px Ink (#272c30) or Dove Gray (#a6b4ba) border, Ink text, 6px radius, same padding as primary. No fill on hover — just a subtle Pale Slate (#e3e8ea) wash.

### Ghost Nav Button
**Role:** Top navigation items (Features, Pricing, Blog, Docs)

No background, no border, Ink (#272c30) text at 14px weight 450, 6px hover state, transparent until hover. 8px vertical / 12px horizontal click target padding.

### Pill Badge
**Role:** Status indicators (Active, Beta, New), tag chips, count indicators

Full pill radius (9999px), 2–3px vertical / 8–10px horizontal padding. Mint Pulse (#89ecb0) fill with Ink text for status; neutral Pale Slate fill with Graphite text for neutral tags. Text at 10–11px weight 500, tracking 0.04em.

### Product Mockup Card
**Role:** Hero product showcase, screenshot containers

White surface, 6px radius, complex layered shadow: rgba(63,70,75,0.1) 0 21px 44px -32px, rgba(39,44,48,0.2) 0 26px 30px -23px, rgba(39,44,48,0.05) 0 14px 40px 0px, rgba(39,44,48,0.08) 0 0 0 1px, rgba(39,44,48,0.12) 0 4px 8px 0px. Contains a browser-chrome header (3 dot controls, tab bar) above a data table or app UI.

### Elevated Card
**Role:** Feature cards, pricing tiers, testimonial cards

White surface, 6px radius, 12px padding, 1px Pale Slate (#e3e8ea) hairline border. No shadow by default; on hover uses the same product mockup shadow stack at reduced opacity. The hairline border is the primary elevation cue, not shadow.

### Browser Tab Bar
**Role:** Product screenshot top chrome

Pale Slate (#e3e8ea) background, rounded tab pills with white fill and 1px Dove Gray border, 9–10px Geist Mono weight 500 with 0.02em tracking. Three-dot macOS controls on the left in Dove Gray.

### Data Table Row
**Role:** Table rows inside product mockup

White row, 1px bottom border in Pale Slate, 12px vertical / 16px horizontal padding. Geist Mono 12px for ID/codes, Suisse Intl 12px for descriptions. Active row shows Mint Pulse background tint at 10% opacity.

### Logo Strip Card
**Role:** Investor/partner logos row

White card, 1px Pale Slate border, 6px radius, generous vertical padding (32–48px). Logos rendered in Ink at 60% opacity. Separated from neighbors by vertical 1px Pale Slate dividers, not spacing gaps.

### Team Member Card
**Role:** Advisor/team listing

No background, centered. Circular avatar (40–48px) above name in Suisse Intl 14px weight 500 Ink, then role in Graphite 12px. 12px gap between elements. No border, no card — relies on whitespace alone.

### Search Input
**Role:** Filter/search fields in product UI

White background, 1px Dove Gray border, 6px radius, 8px vertical / 12px horizontal padding. Leading magnifier icon in Dove Gray stroke. Placeholder text in Graphite at 12px.

### Filter Select
**Role:** Dropdown selects in product UI

White background, 1px Dove Gray border, 6px radius, same vertical padding as search. Label/value text in Ink, chevron icon in Dove Gray. Active state: 1px Iris Blue border.

### Sunset Banner
**Role:** Top-of-page deprecation notice

Full-width Ink (#272c30) bar, 8–10px vertical padding, white text centered at 12px weight 450, 1.5 line-height. Underlined email link in Cobalt.

### Section Eyebrow Label
**Role:** Pre-headline section labels

Geist Mono 10–12px weight 500, 0.15em tracking, Graphite text, often with a trailing dot or bracket mark. Sits centered above serif headlines as a typographic signature transition.

## Do's and Don'ts

### Do
- Use Selecta serif exclusively for display headlines (40px+) and never for body copy — the sans/serif split is the system's signature.
- Use 6px radius for all rectangular surfaces (buttons, cards, inputs, nav) and 9999px only for pills, tags, and circular icons — never mix intermediate radii like 8px or 12px.
- Apply the blue gradient (88,151,247 → 56,114,230) to the second line of hero headlines to create the "data extraction" effect — keep the first line in solid Ink.
- Use the layered card shadow stack on hero product mockups and hover states only; for static feature cards, rely on a 1px Pale Slate hairline border with no shadow.
- Set the hero on a radial aurora glow over a Lavender Mist → white linear wash; never use a flat white hero.
- Use Mint Pulse (#89ecb0) exclusively for "Active" status and success states; do not introduce a separate green for decorative purposes.
- Apply tight negative tracking on Selecta at all sizes above 40px (down to -0.025em) and switch to positive tracking (0.01–0.05em) for Suisse Intl body text and labels.

### Don't
- Don't use Cobalt (#3e79ea) for any non-action element — it is reserved for the primary CTA button and is the only filled chromatic button allowed.
- Don't pair the serif headline with a serif body — Selecta must not appear below 18px; the transition to Suisse Intl at subheading level is mandatory.
- Don't use intermediate border radii (8px, 10px, 12px) — the system commits to 6px for rectangles and 9999px for pills.
- Don't add green decoration outside of status badges — Mint Pulse signals Active/success, nothing else.
- Don't use the blue gradient on body text, buttons, or subheadings — it is a display-headline treatment only.
- Don't use dark backgrounds for cards or sections — the palette is a daylight system; Ink is for text and borders, never large fills.
- Don't introduce additional blue or violet shades — the palette has exactly two blues (Iris Blue #3161df and Cobalt #3e79ea) plus Sky Glow #3e9ed0 for minor accents.

## Elevation

- **Product Mockup Card / Hero Screenshot:** `rgba(63, 70, 75, 0.1) 0px 21px 44px -32px, rgba(39, 44, 48, 0.2) 0px 26px 30px -23px, rgba(39, 44, 48, 0.05) 0px 14px 40px 0px, rgba(39, 44, 48, 0.08) 0px 0px 0px 1px, rgba(39, 44, 48, 0.12) 0px 4px 8px 0px`
- **Static Feature Card / Elevated Card:** `rgba(39, 44, 48, 0.1) 0px 0px 0px 1px`
- **Button (subtle elevation):** `rgba(255, 255, 255, 0.25) 0px 1px 0px 0px inset, rgba(26, 41, 61, 0.15) 0px 1px 3px 0px, rgba(26, 41, 61, 0.11) 0px 7px 11px -5px, rgba(26, 41, 61, 0.08) 0px 0px 0px 1px`
- **Icon Halo (on colored backgrounds):** `rgb(255, 255, 255) 0px 0px 0px 2px, rgba(39, 44, 48, 0.13) 0px 1px 2px 2px`

## Surfaces

- **Pure Canvas** (`#ffffff`) — Page base background, card surfaces, product mockup interior
- **Lavender Wash** (`#f0f5fe`) — Hero gradient origin, soft section tints beneath the aurora glow
- **Pale Slate** (`#e3e8ea`) — Browser tab bar backgrounds, secondary surfaces, input backgrounds
- **Dove Gray** (`#a6b4ba`) — Hairline border variant, icon strokes, button border in neutral contexts
- **Graphite Smoke** (`#d4d5d6`) — Card shadow inner stop, subtle elevated panel backgrounds

## Imagery

Imagery is minimal and product-centric: the dominant visual is a UI mockup of the data extraction dashboard (browser chrome with tabs, a filterable data table, status badges, and search inputs) presented as a large hero card with a layered soft shadow. The only other photographic element is circular team/advisor headshots at 40–48px with no border treatment. There is no lifestyle photography, no abstract illustration, and no 3D rendering — the product UI IS the hero. The lavender-to-white aurora gradient backdrop provides atmospheric depth without imagery. Logos in the partner strip are flat monochrome Ink, never colored.

## Layout

Page is centered and max-width contained (1200px) with generous outer padding. The hero is a centered text block (headline + subhead + single CTA) sitting above a wide product mockup card that nearly touches the viewport edges. Below the hero, sections alternate between centered text blocks and full-bleed dividers (no colored bands). A "Backed by the best" section uses a 3-column team grid followed by a 4-column logo strip with vertical hairline dividers. The "Web data is difficult" section repeats the centered hero pattern: eyebrow label → serif headline → body → visual. Navigation is a minimal top bar (logo left, 4–5 ghost nav items centered/right, outlined Sign Up button far right) plus a full-width dark sunset announcement bar above it. Section gaps are large (64px+) creating spacious vertical rhythm; card grids are 3-column at desktop collapsing to 1-column on mobile. Information density is compact inside cards but breathing room between sections is generous.

## Similar Brands

- **Linear** — Same compact UI density, single-accent color discipline, and serif-free system with one chromatic brand color against a near-white canvas
- **Perplexity** — Same daylight lavender-to-white hero treatment and a single blue accent driving all interactive elements, with product UI screenshots as the hero visual
- **Vercel** — Same minimal top nav with ghost items + outlined CTA, hairline 1px borders as the primary elevation cue, and 6px-radius surfaces throughout
- **Anthropic** — Same restraint of color to a single brand hue plus warm neutrals, with serif-free sans body and centered max-width content blocks
- **Raycast** — Same browser-chrome product mockup with macOS dots and tab bar above a data UI, Geist-family typography, and compact 6px-radius surfaces
