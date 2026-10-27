# Orderful — Style Reference
> industrial command deck — a logistics dispatcher's printed control sheet in black ink and surgical vermillion, every page restrained enough to let a single CTA shout.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Orderful reads as an industrial command deck: a near-pure achromatic surface where black-and-white typography and 8px radii meet a single surgical vermillion accent that punctuates actions rather than decorates. The typographic voice belongs to telegraf, a custom grotesk spanning weights 100–700 and sizes 12–72px, tightened with −0.025em to −0.03em tracking on display and expanded 0.025em on uppercase eyebrows, with modernGothic at 14px/300 handling a specific small-text register via the ss02 alternate. Geometry is disciplined — one universal 8px radius, one two-layer shadow stack used sparingly, and a base 8px spacing scale that breathes at 40–64px section gaps. The result is a calm, information-rich B2B surface that treats color as a scarce commodity: most screens stay monochrome, letting the single red-orange mark function as the only signal that something is actionable.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vermillion Signal | `linear-gradient(94deg, rgb(255, 2, 1) -33.85%, rgb(255, 120, 2) -1.54%, rgb(255, 2, 1) 73.55%)` | Orange action color for filled buttons, selected navigation states, and focused conversion moments. |
| Ink Black | `#000000` | Hairline borders, logo marks, high-contrast icon strokes, strong body emphasis |
| Carbon | `#1f1f1f` | Dark card backgrounds, inverted feature panels, footer surface |
| Slate 900 | `#101828` | Display and heading text, hero headlines — the dominant typographic color |
| Slate 700 | `#364153` | Navigation text, active nav items, secondary headings |
| Slate 600 | `#4a5565` | Body copy, sub-text, icon strokes, eyebrow labels |
| Steel | `#676767` | Subdued heading text, testimonial attributions |
| Iron | `#8a8a8a` | Tertiary helper text, decorative dividers |
| Mist | `#99a1af` | Icon borders, muted labels, disabled states |
| Cloud | `#d4d4d4` | Button borders, input borders, section dividers |
| Frost | `#e5e7eb` | Card hairline borders, subtle container edges |
| Paper | `#ffffff` | Card surfaces, button text on dark fills, primary content canvas |
| Vellum | `#f5f5f5` | Primary page canvas and white card surfaces. |

## Typography

### telegraf — The workhorse grotesk used across every context: display, heading, body, nav, button, card, icon, input, footer. Tight tracking on large sizes (−0.025em to −0.03em) signals editorial confidence; expanded 0.025em on uppercase eyebrows gives the system its industrial-label voice. Weights 300–500 carry the personality — weight 700 appears sparingly for emphasis.
- **Substitute:** Söhne, Inter, Suisse Int'l
- **Weights:** 100, 300, 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 18, 20, 24, 30, 48, 60, 72
- **Line height:** 1.0 (60–72px) / 1.2 (48px) / 1.33 (30px) / 1.38 (24px) / 1.43 (20px) / 1.5 (16–18px) / 1.63 (12px)
- **Letter spacing:** −2.16px at 72px, −1.5px at 60px, −1.2px at 48px, 0 at 14–30px, 0.3px at 12px (uppercase)
- **OpenType features:** `"case" on; "case", "dlig" on for display`

### modernGothic — A geometric secondary used at a single 14px register for body and link contexts where a more humanist tone is desired. Carries the ss02 stylistic alternate for a distinctive lowercase 'a' and 'g'.
- **Substitute:** Söhne Breit, GT America Mono, Inter at light weight
- **Weights:** 300
- **Sizes:** 14
- **Line height:** 1.43
- **OpenType features:** `"ss02" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 12px | 1.5 | 0.3px |
| caption | — | — | 14px | 1.43 | — |
| body-sm | — | — | 16px | 1.5 | — |
| body | — | — | 18px | 1.5 | — |
| body-lg | — | — | 20px | 1.43 | — |
| subheading | — | — | 24px | 1.38 | — |
| heading-sm | — | — | 30px | 1.33 | — |
| heading | — | — | 48px | 1.2 | -1.2px |
| heading-lg | — | — | 60px | 1 | -1.5px |
| display | — | — | 72px | 1 | -2.16px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24-32px
- **Element gap:** 16px

### Border Radius

- **nav:** 8px
- **tags:** 8px
- **cards:** 8px
- **images:** 8px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Vermillion Filled Action Button
**Role:** Primary CTA — 'Book a Demo', 'Get Started', 'Read Case Study'

Background #e42b0c, white text, 8px radius, padding 12px 24px (compact) or 16px 24px (comfortable). telegraf 14–16px weight 500, 0.025em tracking, uppercase. Trailing arrow icon. Used at most one per visible fold.

### Sunset Gradient Nav Button
**Role:** Sole conversion button in the top navigation

Background uses the Sunset Flux gradient (linear-gradient 94deg, #ff0201 → #ff7802 → #ff0201). White uppercase text in telegraf 14px weight 600, 0.025em tracking, 8px radius, padding 12px 20px. Visually distinct from all other vermillion buttons — reserved for nav only.

### Carbon Dark Action Button
**Role:** Secondary CTA — 'View Success Stories' type read-next actions

Background #1f1f1f or #000000, white text, 8px radius, padding 16px 24px. telegraf 14px weight 500 uppercase, 0.025em tracking. Sits below hero or section content as a quiet next-step prompt.

### Outlined Nav Pill (Eyebrow Badge)
**Role:** Section eyebrow or current-page indicator in nav

1px border #d4d4d4, transparent background, 8px radius, padding 4px 12px. telegraf 12px weight 500 uppercase, #4a5565 text, 0.3px tracking. Example: the 'AI-NATIVE EDI' pill in the nav.

### Feature Card (3-Column Grid)
**Role:** Product capability card in feature sections

Background #ffffff, 8px radius, 1px #e5e7eb border, optional subtle two-layer shadow. Padding 32px. Icon top-left at 24px in #4a5565. telegraf 24px weight 400 heading at #101828, 16px weight 400 body at #4a5565. Trailing 'Learn more →' link in #4a5565.

### Hero Product Visual Tile
**Role:** The dashboard mockup panel shown in the hero right column

#ffffff background with the product UI rendered inside: dark cards (#1f1f1f) for the ERP/trading-partner selector panels, vermillion connector nodes, and a right-side brand-logo grid with a red-orange frame border. 8px radius on inner cards, sharp 1px hairlines on dividers.

### Testimonial / Case Study Card
**Role:** Customer quote with metrics row

White background, 40px padding, no border, 8px radius on the outer card. Large pull-quote in telegraf 30px weight 300 at #101828, 1.33 line-height, with a vermillion opening quotation mark. Customer headshot 64px square, 8px radius. Three-up stat row below: oversized number (60px weight 300) in #101828 over a 14px label in #4a5565.

### Stat Block
**Role:** Metric unit inside a testimonial or social-proof band

telegraf 60px weight 300 at #101828 for the number, tight −1.5px tracking. telegraf 14px weight 400 at #4a5565 for the label below, 1.43 line-height. No card chrome — floats directly on the section background.

### Logo Strip (Trust Bar)
**Role:** Social-proof band of partner or customer logos

Full-width white band, 64px vertical padding, 1200px max-width inner row. Grayscale-treated logos (#000000 or #364153) at uniform 32–40px height, evenly spaced with 48px column gap. No card containers, no borders — the row reads as a printed masthead.

### Trading Partner Brand Grid
**Role:** Visual showcase of connected retailers in the hero

Right-rail mosaic of retailer brand logos in a red-orange (#e42b0c) framed grid. White logo cells, 1px #d4d4d4 hairlines between cells, 8px radius on the outer frame. A vermillion connector line traces a path through selected cells to suggest a 'connect once' flow.

### Navigation Bar
**Role:** Sticky top navigation across all pages

White background, 1px #e5e7eb bottom border, 64px height, 1200px max-width inner. Left: wordmark 'Orderful*' in telegraf 20px weight 600 at #000000 (the asterisk is the brand device). Center: 6–7 nav items in telegraf 14px weight 500 uppercase, 0.3px tracking, #364153. Right: outlined 'Login' ghost button + the Sunset Flux gradient 'Get Started' button.

### Chat Widget (Bottom-Right Float)
**Role:** Persistent conversational overlay

Floating card bottom-right, 320px wide, white background, 8px radius, two-layer shadow. Vermillion avatar circle 40px in #e42b0c, white initial. Telegraf 14px weight 500 header, 12px caption. Vermillion send-arrow button, 8px radius. 'Book a Demo' and 'Sign Up Now' as dual mini-CTA chips at the bottom.

### Section Display Header
**Role:** Large centered section heading pattern

telegraf 48–60px weight 300, #101828, tight −1.2 to −1.5px tracking, centered. Optional eyebrow line above in 12px uppercase weight 500 at #4a5565, 0.3px tracking. Lede paragraph below in 18px weight 400 at #4a5565, max-width 640px centered.

### Text Input Field
**Role:** Form inputs in demos, contact, signup flows

White background, 1px #d4d4d4 border, 8px radius, padding 12px 16px. telegraf 16px weight 400 at #101828 for value, #99a1af placeholder. Focus state: 1px #101828 border, no glow. 48px height for comfortable touch targets.

## Do's and Don'ts

### Do
- Use #e42b0c exclusively for filled primary action buttons and as a 1–2px border on outlined action variants — never as a decorative fill
- Set display headlines at 48–72px with −0.025em to −0.03em letter-spacing to tighten the geometric grotesk into editorial weight
- Apply 8px border-radius uniformly to cards, buttons, inputs, tags, and image containers — the system standardizes on a single radius
- Keep shadows to a single two-layer stack: rgba(0,0,0,0.1) 0 1px 3px 0 + rgba(0,0,0,0.1) 0 1px 2px −1px; never exceed 3px offset
- Use #101828 for display and heading text, reserving #000000 for hairlines and small icon marks
- Set body text at 16–18px in telegraf weight 400 with 1.5 line-height
- Apply the 'case' font-feature setting on telegraf across the site for stylistic alternates; enable 'ss02' on modernGothic passages

### Don't
- Never use 4px, 6px, 12px, or pill (9999px) border-radii — 8px is the system standard
- Never set display text in weight 700 — the system prefers weight 300–500 for headlines to keep authority through restraint
- Never use #e42b0c on text-only links, decorative fills, illustration accents, or non-action surfaces
- Never use body text below 14px — 12px is reserved for uppercase eyebrows and micro-labels only
- Never introduce a second saturated chromatic color — vermillion must remain the sole color punctuation in the system
- Never use letter-spacing values outside −0.03em, −0.025em, or 0.025em
- Never place a Carbon (#1f1f1f) card on a Paper (#ffffff) section without a clear elevation or emphasis reason

## Elevation

- **Card / Button resting state:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

## Surfaces

- **Vellum Canvas** (`#f5f5f5`) — Page background — the matte-paper base that every section sits on
- **Paper Card** (`#ffffff`) — Primary card and content surface — sits one step above the vellum canvas
- **Carbon Panel** (`#1f1f1f`) — Inverted dark panel for emphasis sections, footers, or product visual containers

## Imagery

Imagery is utilitarian and product-led, not lifestyle. The hero's right column is a rendered product-UI mockup — a dark trading-partner selector panel with vermillion connector nodes, beside a red-orange framed mosaic of retailer brand logos (Kroger, Meijer, Chewy, Tractor Supply, TD) acting as a visual network map. Customer headshots are tight 64px square crops at 8px radius, never full-bleed. Trust logos are uniformly grayscale-treated at 32–40px height on a white band. G2 leader badges and award icons appear in their native multicolor treatment. Iconography is simple geometric (asterisk, sparkle, bars, target) in #4a5565 line work, 1.5px stroke equivalent. The brand mark 'Orderful*' uses an asterisk as a deliberate device — a star-burst punctuation that rhymes with the asterisk icons inside product mockups. No photography of people in environmental settings; no abstract gradients or 3D renders.

## Layout

Page model: max-width 1200px centered, 8-column grid implied, 64px section gaps. Hero is a split layout inside a single white card on a Vellum (#f5f5f5) canvas — left ~45% holds the 72px headline + 18px subtext + Vermillion CTA, right ~55% holds the product visual tile. Below: a full-bleed white logo-strip band, then a Vellum section with a centered 60px display heading and a 3-column feature card grid (equal columns, 32px gaps). Testimonial section is a two-column block — large quote + attribution on the left, a red-orange-branded customer visual on the right, with a 3-up stat row beneath. Navigation is a sticky top bar with a 1px Frost bottom border. Sections alternate Paper and Vellum to create quiet rhythm without dark/light inversion. Density is comfortable but information-rich — the page never feels sparse, but sections breathe with 64px vertical gaps.

## Similar Brands

- **Linear** — Same monochrome enterprise surface with a single vivid accent and custom geometric grotesk at large display sizes with tight negative tracking
- **Vercel** — Identical ultra-clean light canvas, 8px universal radius, and discipline around a single chromatic action color used sparingly
- **Retool** — Similar B2B SaaS restraint: black-and-white typography, flat 8px-radius cards, vermillion/orange CTA, and dense information architecture
- **Mercury** — Same financial/operational feel — calm matte paper canvas, sober typographic hierarchy, and one surgical accent for action surfaces
- **Ramp** — Matching enterprise-B2B voice with a near-pure achromatic palette, generous section spacing, and a single bold accent for primary actions
