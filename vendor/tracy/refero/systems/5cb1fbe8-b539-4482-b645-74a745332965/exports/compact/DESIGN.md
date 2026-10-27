# Swwim — Style Reference
> Cobalt wave with floating luxury objects.

A vivid blue ocean where oversized white type is pierced by editorial product still-lifes.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Swwim is a full-bleed, blue-saturated agency site where the hero IS the brand: a massive all-caps Baton Turbo display at 151px sits on a vivid cobalt field, scattered with floating product crops (a diamond ring, a Givenchy sandal, a megaphone) that overlap the letterforms. The rest of the system stays disciplined — white canvas pages, hairline #e5e7eb borders, pill-shaped controls with 9999px radius, Greycliff for everything readable. The color palette is nearly monochromatic: one hero blue (#1658b3) carries the page, with deeper #0d3c88 and darkest #01295f as gradient depth inside decorative graphics, and a single warm #eee1d9 flesh-tone accent peeking through illustration fills. Components are flat, borderless against the blue, and almost borderless against white — elevation comes from typography weight, not shadow stacks.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cobalt Current | `#1658b3` | Hero background, primary surface flood, outlined-link borders — the single color that defines every full-bleed section |
| Deep Channel | `#0d3c88` | Darker blue for gradient depth in decorative graphics, icon accents, footer bands |
| Electric Ripple | `#015fee` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Abyssal Ink | `#01295f` | Darkest blue used inside SVG decoration and deep gradient stops — never as text or button |
| White Canvas | `#ffffff` | Page background, body text on blue, primary pill button fill — the neutral that carries white sections and inverts on blue |
| Cloud Border | `#e5e7eb` | Hairline dividers, card borders, separator rules across all white surfaces — the structural neutral of the system |
| Carbon | `#000000` | Body text on white, icon fills in black-mode illustrations |
| Nude Clay | `#eee1d9` | Warm flesh-tone accent inside decorative illustration fills and strokes — the only chromatic neutral, used to humanize blue compositions |

## Typography

### Baton Turbo — Display and oversized headlines only — the 151px hero weight is the signature choice, a single weight (400) stretched across 14px to 151px to create the full editorial scale
- **Substitute:** Druk Wide, Tungsten, Antonio
- **Weights:** 400
- **Sizes:** 14px, 16px, 18px, 29px, 36px, 48px, 151px
- **Line height:** 1.00–1.56

### Greycliff — Body, UI labels, nav, buttons, badges, footer — the working typeface at three weights, with 500/700 reserved for small headings and nav emphasis
- **Substitute:** Inter, Manrope, DM Sans
- **Weights:** 400, 500, 700
- **Sizes:** 14px, 16px, 18px, 20px, 24px, 30px
- **Line height:** 1.20–1.56
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| body-lg | — | — | 18px | 1.56 | 0px |
| subheading | — | — | 20px | 1.4 | 0px |
| heading-sm | — | — | 24px | 1.33 | 0px |
| heading | — | — | 30px | 1.25 | 0px |
| heading-lg | — | — | 36px | 1.2 | 0px |
| display | — | — | 48px | 1.11 | 0px |
| hero | — | — | 151px | 1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 9999px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 9999px

## Components

### White Pill CTA
**Role:** Primary action button

Filled white pill on blue or white surfaces, 9999px radius, 16px 24px padding, Greycliff 500 at 16px, text in Cobalt Current (#1658b3). The signature control — no shadows, no border, shape alone communicates the action.

### Ghost Nav Button
**Role:** Secondary header action

White text on blue header, no background, 16px Greycliff 500, sits inline with a Menu label and hamburger icon. Underline or icon pairing is the only affordance.

### Header Logo Lockup
**Role:** Brand mark in navigation

Wordmark 'swwim' in white Greycliff 500 lowercase, followed by a 1px vertical white divider, then the descriptor 'Social Media Marketing' in Greycliff 400. Left-aligned, no logo image.

### Hero Headline
**Role:** Primary page statement

Baton Turbo 400 at 151px, white on Cobalt Current (#1658b3), all-caps, line-height 1.0. Product images absolutely positioned to overlap letterforms — a deliberate collage effect, never centered-clean.

### Hero Body Caption
**Role:** Supporting hero copy

Greycliff 400 at 18px, white, line-height 1.56, placed in the negative space beside the headline. No quotation marks, no italics — plain prose that lets the display type carry the weight.

### Dive In Link
**Role:** Anchor for scroll

Small Greycliff 500 link with a circled down-arrow icon, white on blue, 14-16px. The site's only repeated micro-link style — used to invite the user below the fold.

### Service Marquee
**Role:** Horizontal service ticker

Full-bleed white-on-blue band, Baton Turbo 400 all-caps at 29-36px, separated by bullet dots, scrolling horizontally or static. Sits flush to the bottom of the hero as a visual footer for the section.

### Product Float Image
**Role:** Decorative product crop

Tightly cropped object photography (rings, shoes, packaging) absolutely positioned over the hero headline, no border-radius, no shadow, no caption. The objects overlap letterforms to create a collage system.

### White Surface Card
**Role:** Content container on white

24px padding, 1px #e5e7eb border, no radius, no shadow. The default card treatment — flat, hairline-bordered, relying on white-space rather than elevation.

### Icon
**Role:** UI iconography

Minimal stroked icons, 1.5-2px stroke weight, monochromatic white on blue or Carbon on white. Used sparingly — the megaphone and arrow-down are the only icon-shaped elements visible.

## Do's and Don'ts

### Do
- Use Baton Turbo only for display and oversized headlines — 29px and up; never set it below 20px
- Set the hero headline at 151px on the cobalt background, line-height 1.0, all-caps, with at least one product image overlapping the letterforms
- Use 9999px radius for every button, tag, and pill control — there are no rounded-corner cards or inputs in this system
- Keep surfaces flat: 1px #e5e7eb hairline borders separate content, never drop shadows
- Let #1658b3 carry full-bleed sections as the dominant surface; reserve white for content pages and #0d3c88 for footer/gradient depth
- Use Greycliff 500 for interactive labels and small headings, 400 for body, 700 sparingly for emphasis
- Place a 1px white vertical divider between the wordmark and the descriptor in the header lockup

### Don't
- Do not use Baton Turbo for body copy, nav labels, buttons, or anything below 20px — it loses its editorial voice at small sizes
- Do not introduce drop shadows, glows, or multi-layer elevation stacks — the system is intentionally flat
- Do not add chromatic colors outside the blue family plus the single #eee1d9 flesh tone accent
- Do not center the hero composition in a clean symmetrical layout — the scattered overlapping product crops are the signature
- Do not round card corners or input fields; the only radius in the system is the 9999px pill
- Do not use 151px type outside the hero; the display scale steps sharply down to 48px
- Do not break the blue monochrome with a contrasting CTA color — the white pill on blue IS the action pattern

## Surfaces

- **White Canvas** (`#ffffff`) — Default page background for all content sections
- **Cobalt Field** (`#1658b3`) — Full-bleed hero and section floods — the dominant branded surface
- **Deep Channel** (`#0d3c88`) — Gradient depth and decorative fills

## Imagery

Object photography is the signature: tightly cropped luxury product still-lifes (diamond ring, Givenchy sandal, beauty packaging) floating as overlapping elements over the hero typography. No lifestyle photography, no portraits, no environmental context — each object is hero on its own. The megaphone illustration is the only drawn graphic, rendered in flat brand colors with no outline. Imagery is full-bleed in spirit (objects escape their containers to overlap type) but the individual crops are unframed rectangles, not rounded or masked. Iconography is minimal and line-based, monochromatic.

## Layout

Full-bleed cobalt hero dominates the first viewport with a centered-but-asymmetric composition: oversized headline on the left, supporting body copy nested in the negative space right of center, product images absolutely positioned to break the type grid. Below the hero, a full-width white-on-blue service marquee ticker runs horizontally. Subsequent content sections are white-canvas with 1px hairline dividers, 24px card padding, and a 1440px max-width centered column. The header is a minimal top bar — wordmark left, single pill CTA + menu right — not sticky, not mega. Navigation is a single line, no dropdowns visible. Vertical rhythm is generous (64px section gaps) but the hero itself is deliberately dense through type-image overlap.

## Similar Brands

- **Gretel** — Editorial agency layouts with oversized display type overlapping small product or texture crops on a bold single-color field
- **Resn** — Full-bleed brand-color sections paired with playful scattered object imagery and confident oversized headlines
- **Locomotive** — Agency portfolio pattern of full-bleed saturated hero bands and restrained white content sections beneath
- **Gunner** — Monochromatic blue-dominant brand systems with pill-shaped controls and a single working neutral palette
