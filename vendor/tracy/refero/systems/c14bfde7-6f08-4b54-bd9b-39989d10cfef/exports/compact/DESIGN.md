# Render — Style Reference
> Blueprint on brushed aluminum. The interface reads as a clean, geometric engineering document — white space, hairline rules, and one violet marker line drawing the eye to the action.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Render presents a clinical, paper-white canvas for cloud infrastructure — an interface that feels like a well-organized technical schematic rather than a marketing surface. The system is overwhelmingly achromatic: #0d0d0d text on #ffffff surfaces, separated by hairline #e3e3e3 borders, with one vivid violet (#8a05ff) acting as the singular brand punctuation and a warm-to-cool gradient (violet→orange) reserved for hero emphasis. Typography is the primary expressive tool — Roobert at light weight 300 with tight tracking carries headlines with geometric quietness, while PPNeueMontreal handles UI with workmanlike neutrality. Code-adjacent elements use PPNeueMontrealMono, lending technical credibility without resorting to cliché terminal aesthetics. Components are square-cornered, border-defined, and low-elevation; the interface reads as a grid of confident panels rather than floating cards. Color appears sparingly — a violet step number, a soft tinted surface, a gradient text phrase — so when it does appear, it carries weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#0d0d0d` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on dark fills — the dominant base against which all content rests |
| Graphite Hairline | `#e3e3e3` | Borders, dividers, subtle surface tints — the workhorse neutral at 4000+ occurrences that defines structural edges throughout the UI |
| Smoke | `#4d4d4d` | Secondary text, muted nav, footer copy — the soft mid-gray for de-emphasized but still readable text |
| Ash | `#6b6b6b` | Tertiary text, helper labels, inactive metadata — the quietest text tier for non-essential guidance |
| Carbon | `#272727` | Deep surface tone for code blocks, terminal-style badges — a near-black with a whisper of warmth for developer-flavored elements |
| Plasma Violet | `linear-gradient(to right, #8a05ff, #d67f2e)` | Brand accent — step indicators, decorative illustration fills, link highlights, gradient text origin — the single chromatic mark that makes this interface feel like Render; Hero emphasis text and promotional banners — the signature warm-to-cool transition that defines Render's expressive typography moments |
| Wisteria Tint | `linear-gradient(120deg, #ffffff 17.4%, #e6daff 36.67%)` | Soft violet surface wash for tinted cards, hero illustration backgrounds, highlight panels — a 12% saturation tint of the brand violet that creates brand presence without commitment; Soft highlight wash behind hero text and illustration panels — a barely-there violet tint that signals brand presence on neutral surfaces |
| Deep Indigo | `#48008c` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Marigold | `#d67f2e` | Gradient text terminus (violet→orange), warm accent in illustrations — the chromatic counterweight to Plasma Violet in the signature gradient |
| Coral | `#e96770` | Decorative illustration accent, infographic data points — used in product mockups to add warmth and color variety |
| Mint Signal | `#006d4c` | Green supporting accent for decorative details and low-frequency emphasis |
| Sky Pulse | `#33acff` | Decorative accent in product illustrations, secondary data visualization — a clear electric blue for chart and metric highlights |
| Fuchsia Pop | `#f347ff` | Decorative accent in gradient text and illustration hotspots — the highest-chroma pink used sparingly for energy bursts |

## Typography

### PPNeueMontreal — UI and body text — the workhorse grotesque used for nav, buttons, body copy, and all functional interface elements. The tight tracking at small sizes (-0.01em at 12px) and slight loosening at larger sizes (0.02em at 24px) create optical balance across the UI scale. Weight 400 is the default; weight 500 appears in nav links and button labels where a subtle emphasis is needed without switching faces.
- **Substitute:** Inter, Söhne, General Sans
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16, 18, 20, 24
- **Line height:** 1.21, 1.25, 1.33, 1.38, 1.40, 1.44, 1.50
- **Letter spacing:** -0.01em at 12px, 0em at 16px, 0.02em at 24px

### Roobert — Display and heading text — used for hero headlines, section titles, and all oversized type. The signature choice is weight 300 for the largest sizes (64-80px), which is anti-convention — most sites use 600-700 for impact, but Render uses whisper-weight to achieve authority through restraint. Line-heights compress to 1.00-1.10 at display sizes, creating tight, architectural headlines. Tracking tightens aggressively with size (-0.03em at 80px) to compensate for the visual airiness of light weight.
- **Substitute:** Inter (weight 300), Söhne Breit, Söhne
- **Weights:** 300, 400
- **Sizes:** 20, 32, 40, 48, 56, 64, 80
- **Line height:** 1.00, 1.05, 1.06, 1.07, 1.08, 1.10, 1.15, 1.20
- **Letter spacing:** -0.03em at 80px, -0.025em at 64px, -0.02em at 48px, -0.015em at 40px, -0.01em at 32px, -0.01em at 20px

### PPNeueMontrealMono — Code and technical labels — the monospaced face for terminal badges, code snippets, and developer-facing metadata. The slight positive tracking (0.02-0.025em) is typical for mono at small sizes to improve readability of technical strings. Used in elements like the '$ git push' badge and command labels.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Berkeley Mono
- **Weights:** 400, 500
- **Sizes:** 11, 12, 14
- **Line height:** 1.27, 1.33, 1.43
- **Letter spacing:** 0.02em at 12px, 0.025em at 14px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.38 | -0.01px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.33 | -0.01px |
| heading-sm | — | — | 24px | 1.21 | 0.02px |
| heading | — | — | 32px | 1.1 | -0.01px |
| heading-lg | — | — | 40px | 1.08 | -0.015px |
| heading-xl | — | — | 48px | 1.07 | -0.02px |
| display | — | — | 64px | 1.05 | -0.025px |
| display-lg | — | — | 80px | 1 | -0.03px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-96px
- **Card padding:** 24px
- **Element gap:** 16-20px

### Border Radius

- **cards:** 2px
- **pills:** 937px
- **badges:** 2px
- **buttons:** 2px

## Components

### Primary Dark Button
**Role:** Main call-to-action in hero sections and key conversion points

Filled #0d0d0d button with white text, 2px radius, 20px horizontal padding and 10px vertical padding. PPNeueMontreal 16px weight 500. Optional right-arrow chevron in white. Used for 'Start for free' and 'Get Started' — the dark fill against white canvas creates the strongest possible contrast emphasis without resorting to chromatic color.

### Ghost Outline Button
**Role:** Secondary action paired with primary CTA

Transparent fill with 1px #0d0d0d border, 2px radius, same padding as primary. PPNeueMontreal 16px weight 500 in #0d0d0d. Used for 'Get in touch' beside the hero primary. The outlined treatment signals secondary hierarchy without introducing a second fill color.

### Pill Navigation CTA
**Role:** Top-right header call-to-action

Fully rounded (937px radius) #0d0d0d fill with white text. PPNeueMontreal 14px weight 500, 10px 16px padding. Distinct from the rectangular hero buttons — the pill shape signals 'quick entry point' in the persistent header context.

### Step Indicator Badge
**Role:** Numbered step markers in process sections

8x8 or 10x10 square (2px radius) filled with #8a05ff Plasma Violet, containing a white numeral in PPNeueMontrealMono 12px weight 500. The violet square against the white page is the most prominent use of brand color in the system — reserved for numbered processes to make the sequence scannable.

### Logo Cloud Bar
**Role:** Social proof section with customer or partner logos

Full-width section with logos in #0d0d0d on white, arranged in a responsive grid (5 columns visible). No cards or containers — logos float directly on the page background. Generous vertical padding (80px+) separates this band from surrounding sections.

### Feature Card
**Role:** Content blocks for steps, features, or process explanation

White surface on white page, no card shadow or fill. Content separated by typography and spacing alone. 2px radius on any embedded UI elements (input fields, dropdowns shown in illustrations). Uses generous left-aligned text with 20-24px element gaps between heading, description, and visual.

### Terminal Badge
**Role:** Inline code or command highlight (e.g. '$ git push')

#272727 Carbon background, 2px radius, PPNeueMontrealMono 14px weight 400, white text. 6-8px vertical padding, 10-12px horizontal. The dark mono badge is the signature developer credibility marker — a small block of code language embedded directly in marketing copy.

### Top Notification Banner
**Role:** Promotional or migration message bar at very top of page

Thin (1px) strip with a subtle gradient background (violet to warm). PPNeueMontreal 12px weight 400 in white text. Centered or left-aligned content with inline link and optional CTA. This is the only place where the gradient system appears at a structural level.

### Header Navigation
**Role:** Persistent top navigation bar

White background with no border or shadow — sits directly on the page canvas. Logo left, nav links center (PPNeueMontreal 14px weight 500, #0d0d0d), contact/sign-in/CTA right. Sticky behavior implied. No dropdown menus visible at the top level.

### Illustration Panel (Product Mockup)
**Role:** Hero and feature section right-side visuals

Light #e6daff Wisteria Tint background panel with floating product UI cards inside. The cards are white with 2px radius and thin #e3e3e3 borders, containing miniature line charts, status badges, and service names. The tinted background creates a 'stage' for the product preview without using heavy elevation.

### Dropdown / Select Input
**Role:** Form controls in step illustrations and actual UI

White fill, 1px #e3e3e3 border, 2px radius. PPNeueMontreal 14px weight 400 in #0d0d0d for value text, #6b6b6b for placeholder. 10-12px padding. No focus ring visible in static state — relies on border darkening to #0d0d0d on interaction.

### Status Badge (Success/Deploying)
**Role:** Inline status indicators in product mockups

Pill shape (9999px) with light tinted background and dark text. E.g., 'Deploying' uses #e3e3e3 fill with #0d0d0d text; 'Available' uses #dffeed fill (very light green) with #006d4c text. PPNeueMontrealMono 12px. These appear inside illustration panels to show live product states.

### Metric Sparkline
**Role:** Inline mini-charts in product UI mockups

2px stroke line chart in #8a05ff Plasma Violet, 60-80px wide, 24-32px tall. No axis labels or gridlines. Appears inside service cards in the hero illustration to suggest live monitoring without literal chart furniture.

## Do's and Don'ts

### Do
- Use #0d0d0d for all primary filled buttons — never introduce a chromatic CTA color; the dark-on-white contrast is the system's defining emphasis pattern.
- Set display headlines (64-80px) in Roobert weight 300 with letter-spacing -0.025em to -0.03em — the whisper-weight with tight tracking is the signature voice.
- Apply the violet→orange gradient text treatment to a maximum of one phrase per section — typically the last 1-3 words of a hero headline that carry the value proposition.
- Use PPNeueMontrealMono 12-14px with 0.02em tracking for any code, command, or technical string — the mono face signals developer-facing content at a glance.
- Reserve #8a05ff Plasma Violet for step indicators, accent icons, and the first word of emphasis — never for backgrounds of primary buttons or large surface fills.
- Set border-radius to 2px on all rectangular elements (cards, inputs, buttons) and 937px only for pill-shaped badges and nav CTAs — the sharp corners are essential to the engineering-document feel.
- Maintain #e3e3e3 at 1px for all structural borders and dividers — this is the single most-used color in the system and defines the grid.

### Don't
- Do not use pure #000000 for body text or primary buttons — use #0d0d0d; the slight warmth prevents the harsh contrast of pure black on white.
- Do not apply the brand violet (#8a05ff) as a large fill or background — keep it to accents under 40px and to step indicators; overuse dilutes its signaling power.
- Do not use the chromatic accent colors (coral, fuchsia, sky blue) as functional UI colors — they are decorative illustration tones, not status or category indicators.
- Do not introduce a second heading font — Roobert carries all display type; mixing faces breaks the two-font (display + UI + mono) discipline.
- Do not add drop shadows or elevation to cards or panels — the system relies on hairline borders and surface tint, not shadow depth, for hierarchy.
- Do not use border-radius above 4px on any rectangular component — the 2px standard is a defining trait; rounded corners would push the system toward generic SaaS softness.
- Do not center-align body text or feature descriptions — left-align is the norm; centering is reserved for hero headlines and the notification banner.

## Elevation

The system deliberately avoids drop shadows. Depth and hierarchy are achieved through hairline #e3e3e3 borders at 1px, surface tint variations (white → #e6daff → #272727), and typographic weight contrast. No component in the system uses box-shadow for elevation — this is a defining trait that keeps the interface flat, document-like, and precise.

## Surfaces

- **Paper White** (`#ffffff`) — Primary page canvas and card surfaces
- **Wisteria Tint** (`#e6daff`) — Illustration panel backgrounds and hero visual stage
- **Lilac Wash** (`#f4f0ff`) — Lightest violet tint for subtle section backgrounds
- **Carbon** (`#272727`) — Terminal-style code badges and developer-facing dark elements
- **Obsidian** (`#0d0d0d`) — Filled button surfaces and inverted dark zones

## Imagery

Illustrations are schematic product mockups rather than photography: light violet (#e6daff) panel backgrounds containing floating white cards with hairline borders, miniature line charts in Plasma Violet, and inline status badges. No lifestyle photography, no 3D renders, no abstract decorative graphics. The visual language is 'screenshot of the actual product, gently abstracted' — the product UI IS the hero imagery. Icons (visible in the logo cloud and step indicators) are flat, single-weight, monochrome silhouettes. The only photographic-style content is the very thin gradient strip at the very top of the page (violet to warm orange).

## Layout

The page is a max-width 1200px centered layout on a white canvas. The hero is a two-column split: left column holds the headline (Roobert 80px weight 300), supporting copy, and dual CTAs (dark filled + ghost outline); right column holds a tilted illustration panel showing product UI cards. Below the hero, a full-width logo cloud band with 5-column grid separates social proof from the next content block. The 'Click, click, done' section uses a 3-column step layout with violet numbered squares, heading, body text, and a visual beneath each. Section gaps are 80-96px, creating comfortable vertical rhythm. Navigation is a single horizontal bar: logo left, 5 nav links center, contact/sign-in/CTA right. The page has no sidebar, no sticky elements beyond the header, and no full-bleed colored sections — it stays white from edge to edge.

## Similar Brands

- **Vercel** — Same achromatic white canvas with hairline gray borders, dark-filled primary CTAs, and a single brand accent color (Vercel uses black, Render uses violet) — both present developer infrastructure as quiet, document-like surfaces
- **Linear** — Both use whisper-weight display type (Linear at 400-500, Render at 300) with aggressive negative tracking, creating architectural headlines; both rely on hairline borders and zero drop shadows for hierarchy
- **Stripe** — Similar gradient-text hero treatment (Stripe uses gradient on key nouns, Render uses violet→orange gradient on 'apps & agents'); both use clean geometric sans-serifs with tight tracking and minimal chromatic UI
- **Railway** — Both target developers with mono-font code badges, terminal aesthetics, and purple/violet brand accents; both present infrastructure-as-a-service as precise, almost schematic interface panels
- **Planetscale** — Shared developer-infrastructure visual language: white canvas, hairline borders, violet brand accent, monospaced code elements, and weight-300 display headlines that let the product UI illustrations do the visual heavy lifting
