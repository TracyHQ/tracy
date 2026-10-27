# Duna — Style Reference
> Sunset watercolor on warm marble — a single painted landscape over a quiet, editorial compliance document.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Duna is a monochromatic editorial canvas warmed by a single illustrated sunset landscape — the interface stays nearly 99% achromatic, with a deep aubergine-black as both text and primary action color, replacing the blue/green convention of fintech. Components are soft and pillowy: heavily rounded corners (24px on cards and images, 999px on buttons), generous breathing room, and almost no shadow — elevation is built from hairline borders and contrast alone. The hero watercolor is the only moment of color saturation in the system, a deliberate artistic peak that frames an otherwise quiet, confident, document-like surface. Typography is GT America at restrained weights with aggressive negative tracking on display sizes, giving headlines a compressed, editorial feel rather than the wide, friendly SaaS look.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aubergine Ink | `#1b0624` | Primary text, heading borders, and brand character — the slight warm-purple undertone replaces conventional near-black, giving Duna a distinctive almost-black that is neither pure black nor navy |
| Espresso | `#160f0c` | Primary action fill — filled buttons (Get started, Schedule a demo). Slightly warmer and darker than Aubergine Ink, used exclusively for interactive surfaces that need to feel pressed-into the page |
| Warm Ash | `#766a7c` | Muted secondary text and subtle borders — a desaturated warm gray that softens long-form copy without competing with the primary text |
| Graphite | `#444444` | Body text variant, icon strokes, input borders — the workhorse neutral for non-heading content |
| Stone | `#898683` | Tertiary text and dividers — a lighter warm gray for labels, metadata, and less important copy |
| Onyx | `#0d0d0d` | Icon fills and select text instances — the deepest near-black in the scale, reserved for graphic emphasis |
| Smoke | `#1a1816` | Icon borders, card edge cases, and dark UI elements — a warm-tinted dark for graphical components |
| Charcoal | `#292421` | Heading borders and dark decorative fills — a warm brown-black for borders on headings and subtle structural elements |
| Paper White | `#ffffff` | Primary surface — cards, buttons, and the dominant page background |
| Linen | `#f7f7f5` | Warm canvas background — the off-white page tint that gives the entire system its warm, paper-like atmosphere instead of clinical pure white |
| Bone | `#edece7` | Card surfaces and subtle elevated panels — a barely-warm cream for cards sitting on the Linen canvas |
| Mist | `#eeeeee` | Input field background — the only functional surface tint that signals a fillable area |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### GT America — Primary typeface across all UI — body at 400, emphasis at 500, display at 400 with aggressive negative tracking. The compressed, geometric forms at large sizes give headlines an editorial, almost legal-document authority rather than the typical rounded SaaS friendliness.
- **Substitute:** Inter, Söhne, or Suisse Int'l
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16, 18, 20, 24, 32, 40, 44, 72, 80
- **Line height:** 1.00–1.76
- **Letter spacing:** -0.06em at 72-80px display, -0.05em at 44px, -0.03em at 32px, -0.02em at 24px, -0.01em at 20px, normal below 18px
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11", "tnum", "zero"`

### GT America Regular — GT America Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 24px, 32px, 40px, 44px, 72px
- **Line height:** 1, 1.1, 1.2, 1.3, 1.4, 1.5
- **Letter spacing:** -0.06, -0.05, -0.03, -0.02, -0.01, -0.006, 0.02
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### GT America Trial Rg — GT America Trial Rg — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.5, 1.6, 1.71

### GT America Trial Md — GT America Trial Md — detected in extracted data but not described by AI
- **Weights:** 400, 500
- **Sizes:** 17px, 80px
- **Line height:** 1, 1.76
- **Letter spacing:** -0.012
- **OpenType features:** `"tnum", "zero"`

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px, 14px
- **Line height:** 1.2, 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 12px | 1.2 | — |
| caption | — | — | 14px | 1.5 | — |
| body-sm | — | — | 16px | 1.6 | — |
| body | — | — | 18px | 1.5 | — |
| body-lg | — | — | 20px | 1.4 | -0.2px |
| subheading | — | — | 24px | 1.3 | -0.48px |
| heading | — | — | 32px | 1.2 | -0.96px |
| heading-lg | — | — | 44px | 1.1 | -2.2px |
| display | — | — | 72px | 1 | -4.32px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24-32px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **badges:** 999px
- **images:** 24px
- **inputs:** 8px
- **buttons:** 999px
- **large-buttons:** 60px

## Components

### Navigation Bar
**Role:** Top-level site navigation

White background, 64-72px tall, logo (asterisk mark + DUNA wordmark) on the left, centered text links (Product, Customers, Company, Resources) at 14-16px in Charcoal, and a dark filled pill CTA ('Schedule a demo') on the right. No border, no shadow — sits directly on the Linen canvas.

### Hero Illustrated Landscape
**Role:** Full-bleed hero artwork

A painted watercolor sunset scene (warm oranges, pinks, greens, distant mountains, water reflection) that fills the viewport and bleeds into the white section below. The illustration is the only color saturation in the system — it functions as the brand's emotional moment and should never be replicated as a UI accent.

### Hero Headline
**Role:** Primary page headline

72-80px GT America weight 400 in Aubergine Ink, centered, with letter-spacing -0.06em and line-height 1.00. The extreme negative tracking at this size is signature — the letters almost touch, creating a compressed, authoritative block of text.

### Announcement Pill
**Role:** Editorial tag above hero

Small dark pill (999px radius) with white text at 12-14px, sitting centered above the hero headline. Used for news, funding announcements, or feature launches.

### Primary Filled Button
**Role:** Main call-to-action

Espresso (#160f0c) background, white text at 14-16px GT America weight 400, 999px pill radius, 10-12px vertical padding with 18-24px horizontal padding. No shadow, no border. Used for 'Get started' and 'Schedule a demo'.

### Large Pill Button
**Role:** Hero-scale primary action

Variant of the primary button with 60px border-radius (deeply rounded rectangle rather than full pill), 20-24px vertical padding. Used for the most prominent hero CTA where a full pill would feel too small.

### Ghost/Outlined Button
**Role:** Secondary action or dismiss

White or transparent background, 1px border in Graphite or Stone, dark text, 999px radius, matching padding to filled variant. Used for the cookie 'Okay' button and other low-emphasis dismissals.

### Customer Logo Bar
**Role:** Social proof strip

Horizontal row of 6-7 grayscale customer logos (Plaid, Svea, Mews, Moss, CCV, Fiserv) at uniform height, evenly spaced, rendered in Stone or Graphite monochrome — never in their original brand colors.

### Stat Display
**Role:** Large metric with label

Oversized number (6.2x, 22%, 2.8x) at 72-80px GT America weight 400 in Aubergine Ink with tight tracking, paired with a small caption label (14px, Stone) below. Three-up layout in a row.

### Feature Card
**Role:** Product capability block

White card on Linen canvas, 16px radius, 24-32px internal padding, small line-icon at top, bold heading, description text. Separated from neighboring cards by white space alone — no shadow, no visible border.

### Cookie Banner
**Role:** Compliance/consent notice

Small floating panel, bottom-right, white background, subtle border, 12-16px radius, short text + ghost 'Okay' button. Minimal footprint — never full-width or modal.

### Input Field
**Role:** Form input

Mist (#eeeeee) background, 8px radius, 1px border in Graphite or Stone, 16px text in Aubergine Ink. No focus glow — focus state is a border color shift to Espresso. No shadow at any state.

### Logo Mark
**Role:** Brand identifier

Asterisk/star glyph (✱) followed by 'DUNA' wordmark in GT America weight 500, Aubergine Ink. The asterisk is the distinctive brand mark — simple, geometric, non-decorative.

## Do's and Don'ts

### Do
- Use Espresso (#160f0c) as the only filled button color — never introduce blue, green, or saturated brand colors for actions
- Set display headlines at 72-80px with letter-spacing -0.06em — the compressed tracking at scale is the system's editorial signature
- Use Linen (#f7f7f5) as the page canvas, not pure white — the warm off-white atmosphere is load-bearing for the system's mood
- Apply 999px radius to all interactive buttons and tags — pill-shaped controls are non-negotiable
- Enable GT America font features ("blwf", "cv03", "cv04", "cv09", "cv11") when the custom font is available — they define the typeface's character
- Keep the entire interface 99% achromatic — let the hero illustration be the single moment of color saturation
- Use 16-24px radius on all cards and images — soft, generous rounding is structural, not decorative

### Don't
- Don't introduce a blue or green accent — the warm aubergine-black replaces conventional fintech blue
- Don't add drop shadows beyond the 1px inset ring — elevation is built from borders and background tint, not shadows
- Don't use sharp corners on buttons or cards — anything below 8px radius breaks the system's softness
- Don't use the hero illustration's sunset colors as UI accent colors — those colors belong only to the artwork
- Don't use display-size tracking on body text — letter-spacing -0.06em only works at 44px+
- Don't fill the page with multiple colored sections — Duna is monochromatic with warm neutrals, not multi-colored
- Don't use icon libraries with rounded, friendly iconography — use thin-stroke, geometric line icons that match GT America's tone

## Elevation

Duna uses almost no shadow. The single detected elevation is a 1px inset ring at rgba(0,0,0,0.05) on cards — this hairline border IS the elevation system. Components are separated by white space, borders, and background tint shifts rather than drop shadows. This keeps the interface feeling flat, editorial, and document-like.

## Surfaces

- **Linen Canvas** (`#f7f7f5`) — Primary page background — the warm off-white that gives the entire system its paper-like atmosphere
- **Paper Card** (`#ffffff`) — Card surfaces, elevated panels, and button fills
- **Bone Panel** (`#edece7`) — Subtle surface variation for nested cards or sectioned panels

## Imagery

Imagery is dominated by a single full-bleed watercolor illustration in the hero: a warm sunset landscape with distant mountains, a reflective water body, green meadow foreground, and pink-orange sky. This is the only color in the system and should never be repeated as UI accents. Below the hero, imagery is product-screenshot-free and icon-driven — thin-stroke geometric line icons in Charcoal sit atop white cards. Customer logos appear as grayscale monochrome strips. There is no photography, no 3D renders, no stock imagery. The visual language is: one painted landscape moment, then pure editorial UI.

## Layout

The page uses a max-width 1200px centered column on a full-bleed Linen canvas. The hero breaks the container entirely with a full-viewport illustrated landscape that fades to white, containing a centered headline stack (announcement pill, 72px headline, subtext, CTA). Below the fold, sections alternate between white card surfaces on the Linen canvas and pure Linen sections with no container. A customer logo bar sits as a horizontal strip. A stats section uses a three-column row of oversized metrics. Feature cards appear in a three-column grid. Navigation is a flat top bar (not sticky in the data shown). Vertical rhythm is generous: 80-120px between major sections, creating a document-like, unhurried reading pace. No sidebar, no mega-menu, no dark sections.

## Similar Brands

- **Linear** — Same near-black text on warm off-white canvas with pill-shaped buttons and aggressively tight letter-spacing on large display headlines
- **Mercury** — Same warm-cream canvas, pill buttons, and absence of saturated accent colors — both fintech brands that use nearly-monochromatic editorial systems
- **Vercel** — Same document-like restraint, 24px+ card radii, and the confidence to leave the interface nearly colorless with one illustration moment
- **Stripe** — Same GT America-adjacent geometric sans-serif and the convention of using near-black with a warm cast rather than navy or blue for a fintech brand
- **Plaid** — Same compliance/fintech space, same editorial confidence, and similar restraint in avoiding decorative color on core UI surfaces
