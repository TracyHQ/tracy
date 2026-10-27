# Replay — Style Reference
> editorial red-pen on white blueprint. A debugging instrument that speaks in a whisper and marks its targets in coral.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Replay reads as a serious developer-tool brand dressed in quiet confidence: an almost entirely achromatic canvas where charcoal text and white surfaces do 95% of the work, and a single saturated coral-red acts as surgical punctuation on headlines, buttons, and the active nav state. The signature typographic move is emphatic color-splitting inside display headlines — a dark line in #111827 immediately followed by a line in the brand red — which makes the voice feel editorial and opinionated rather than corporate. Components stay lightweight: pill buttons, thin hairline borders, cards that float on soft elevation, and almost no decorative gradient beyond a thin top banner. Every surface earns its place; color is rationed like a resource, not applied as decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#111827` | Primary body text, headline base, nav text — the default foreground against every surface |
| Slate 600 | `#374151` | Secondary text, button borders on outlined/ghost actions, list markers |
| Graphite 800 | `#1f2937` | Dark surface fills for secondary buttons, dark cards, reverse sections |
| Steel 500 | `#6b7280` | Muted helper text, secondary link text, inactive nav |
| Fog 400 | `#9ca3af` | Icon strokes, tertiary metadata, placeholder text |
| Mist 300 | `#d1d5db` | Disabled controls, subtle borders, secondary dividers |
| Cloud 200 | `#e5e7eb` | Hairline borders, icon outlines, the dominant UI border color across the system |
| Paper 100 | `#f3f4f6` | Page background, list rows, subtle section tints |
| Snow 50 | `#ffffff` | Card surfaces, elevated panels, button text on dark fills, the top of the surface stack |
| Coral Pulse | `#f02d5e` | Brand emphasis color — highlights one line of display headlines, marks active nav links, outlines ghost CTA borders, the coral-red ink of the editorial system |
| Coral 500 | `#f43f5e` | Red action color for filled buttons, selected navigation states, and focused conversion moments. |
| Cobalt Link | `#3762e2` | Violet text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Lilac Whisper | `#e9d5ff` | Decorative card border tint on case-study cards — a barely-there violet that softens the otherwise monochrome system |
| Banner Gradient | `linear-gradient(to right top, rgb(255, 128, 181), rgb(144, 137, 252))` | Top announcement banner — pink to violet sweep signals urgency and brand energy without adding permanent surface noise |

## Typography

### Inter — Sole brand typeface — handles everything from 12px micro-labels to 80px display headlines. Weight 500/600 for headlines keeps the voice confident without shouting; weight 400 carries body text. The tight letter-spacing on large sizes (-0.025em at 80px, -0.019em at 40–48px) makes display lines feel set, not stacked.
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 40px, 48px, 80px
- **Line height:** 1.17–1.78
- **Letter spacing:** -2px at 80px, -1.2px at 48–40px, -0.4px at 20px, normal at 16px and below; uppercase labels use +0.05em

### ui-monospace — Inline code, keyboard shortcuts, technical tokens — appears sparingly, never as a headline face
- **Substitute:** JetBrains Mono, SF Mono, Menlo, Consolas
- **Weights:** 600
- **Sizes:** 12px
- **Line height:** 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 0.6px |
| body-sm | — | — | 14px | 1.71 | — |
| body | — | — | 16px | 1.75 | — |
| body-lg | — | — | 18px | 1.78 | — |
| subheading | — | — | 20px | 1.6 | -0.4px |
| heading-sm | — | — | 40px | 1.17 | -1.2px |
| heading | — | — | 48px | 1.1 | -1.2px |
| display | — | — | 80px | 1.1 | -2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 24px
- **Element gap:** 16-24px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **icons:** 4-8px
- **inputs:** 8px
- **buttons:** 9999px
- **smallChips:** 8px

## Components

### Announcement Banner
**Role:** Top-of-page gradient strip with CTA

Full-bleed banner with the pink-to-violet linear-gradient (#ff80b5 → #9089fc). White text at 14px Inter weight 500, centered. Contains a small white outlined pill button ('Apply now') on the right. Height ~40px, sits above the nav.

### Primary Navigation
**Role:** Sticky site nav with logo, links, and CTA

White background, 64–72px tall. Left: Replay wordmark with play-triangle icon in #111827. Center: horizontal links (Overview active state in #f02d5, inactive in #111827) at 14px Inter 500 with 32px column gap. Right: filled coral CTA pill 'Try Replay Free'.

### Filled Coral CTA
**Role:** Primary action button

Pill shape at 9999px radius. Background #f43f5, white text at 14–16px Inter 600. Padding 8px 24px. Subtle shadow rgba(0,0,0,0.05) 0px 1px 2px. Hover deepens the coral slightly. Used once or twice per viewport maximum.

### Outlined Ghost CTA
**Role:** Secondary action button on light surfaces

Pill shape at 9999px radius. Transparent background, 1px border in #f02d5 or #374151, text matches border color. Same padding as filled CTA. Sits beside filled CTAs to create a paired action set.

### Display Headline with Color Split
**Role:** Hero and section-level H1

Inter 80px weight 700, line-height 1.10, letter-spacing -2px. Multi-line headline where one line is set in #111827 and the following line is set in #f02d5 — the editorial signature. Centered on hero, left-aligned in body sections.

### Body Lead Paragraph
**Role:** Hero subhead, section introductions

Inter 18px weight 400, line-height 1.78, color #6b7280. Max-width ~640px to keep line length readable. Follows the display headline with 24–32px top gap.

### Eyebrow Label
**Role:** Uppercase category tag above section titles

Inter 12px weight 600, uppercase, letter-spacing 1.5px (0.05em), color #f02d5e. Centered, sits 16–24px above its parent heading.

### Case Study Card
**Role:** Testimonial / quote card in social proof grid

White surface, 12px radius, 24px padding. 1px border in #e9d5ff (Lilac Whisper) for soft definition. Contains a quote in #111827 at 16px, a 'Read full case study →' link in Cobalt Link, and a footer row with circular avatar (32px), name in 14px 600, handle in 12px #6b7280, and brand logo on the right.

### Link with Arrow
**Role:** Inline navigation link to detail pages

Inter 14px weight 500, color #3762e2, trailing → character. No underline by default; appears underlined on hover.

### Avatar with Brand Mark
**Role:** Person attribution in case study cards

32px circular avatar photo, name in 14px Inter 600 #111827, handle in 12px Inter 400 #6b7280. Company logo or product mark positioned on the right edge of the card footer.

### Section Container
**Role:** Vertical rhythm wrapper for content bands

Max-width 1200px, centered, 24–32px horizontal padding. 64–80px vertical padding between sections. White or #f3f4f6 background alternates to create band separation.

### Trust Logo Strip
**Role:** Horizontal row of customer/team logos

Single-row layout under a centered 'Trusted by top engineering teams' caption. Logos in monochrome #6b7280 or #9ca3af, roughly 32–40px tall, evenly spaced with 48px column gap.

## Do's and Don'ts

### Do
- Use #f43f5 for exactly one filled CTA per viewport — it loses all power if it appears more than twice on a screen
- Split display headlines across two lines so the first line is #111827 and the second is #f02d5 — the color contrast is the design
- Set all buttons and tags at 9999px radius — the pill is non-negotiable and unifies every interactive element
- Use #e5e7eb for 1px hairline borders on cards, inputs, and dividers — never use heavier borders or background fills to create separation
- Cap body text at 18px and max-width ~640px — the system trusts the reader and refuses to fill horizontal space for its own sake
- Apply letter-spacing -2px at 80px and -1.2px at 40–48px to all display and heading sizes — the tight tracking is what makes the large type feel set rather than dropped in
- Alternate white and #f3f4f6 section backgrounds to create rhythm without lines or heavy dividers

### Don't
- Don't use the coral red (#f43f5 / #f02d5e) for body text, icons, or decorative fills — it is rationed for emphasis lines, active states, and CTAs only
- Don't introduce new chromatic colors for illustrations, badges, or section accents — the system runs on charcoal, white, and one coral
- Don't use card radius smaller than 12px on case study / testimonial cards or larger than 8px on inputs — radius carries semantic weight
- Don't use weight 300 or 200 for headlines — Inter at 600–700 is the voice; thin weights break the editorial authority
- Don't stack two filled CTAs side by side — pair a filled coral with an outlined ghost or a text link instead
- Don't apply drop shadows to elements that aren't cards or floating panels — buttons get the whisper 1px shadow, nothing more
- Don't use #f3f4f6 as a card background on a white canvas — it only works as a section tint behind a white card, never as a card on white

## Elevation

- **Cards, elevated panels:** `rgba(17, 24, 39, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px`
- **Buttons, interactive controls:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Canvas** (`#f3f4f6`) — Page background, the softest tone the eye sees
- **Card** (`#ffffff`) — Default content surface, case study cards, pricing panels
- **Dark Section** (`#1f2937`) — Reverse hero or feature panels where white text sits on graphite

## Imagery

The visual language is text-dominant with almost no decorative photography. Imagery is restricted to small circular user avatars in case study cards and a sparse row of monochrome company logos in the trust strip. The hero relies entirely on typography — the editorial color-split headline IS the visual. No illustrations, no 3D renders, no product screenshots visible in the captured screens. The thin pink-to-violet gradient banner at the top is the only chromatic graphic element on the page, and it reads as a notification rather than decoration. Iconography is geometric and minimal: a play-triangle logomark, simple → arrows on links, and flat outlined social icons.

## Layout

Max-width 1200px centered container with generous 64–80px vertical section gaps. The hero is a centered typographic stack — display headline, lead paragraph, single CTA — sitting on a white canvas with a faint diagonal scratch pattern. Subsequent sections use a centered single-column text block on #f3f4f6 tinted backgrounds, then a 3-column card grid for case studies. Navigation is a centered top bar with logo left, links center, CTA right. The page rhythm alternates between white and #f3f4f6 bands to separate concerns without resorting to heavy dividers.

## Similar Brands

- **Linear** — Same pill-button + monochrome canvas + rationed accent color approach, both treat the page as a typographic instrument
- **Vercel** — Similar near-black/white base palette with geometric simplicity, large confident display type, and a single vivid accent reserved for emphasis
- **Posthog** — Developer-tool branding with an editorial headline voice, tight letter-spacing on display type, and coral-as-accent restraint
- **Sentry** — Same devtools category with a hairline-border card system, pill CTAs, and a single warm accent punctuating an otherwise grayscale interface
