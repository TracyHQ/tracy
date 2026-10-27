# Backlight — Style Reference
> Vermillion stamp on warm vellum — a printed catalog cover where one ink red commands the cream page and everything else stays in quiet grayscale.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Backlight uses a warm editorial language built on cream vellum and one vermillion accent. The full-bleed orange-red hero acts as the cover page of a printed catalog, with white type and a single white pill button as the only allowed elements. Below the hero, the canvas shifts to warm cream (#e4ddd5) carrying white cards, dark text, and a thin peach hairline (#f3b8a9) that traces the grid like a printer's rule. Chat-bubble cards are used as a signature device to dramatize team conversations and pain points. The type system is confident but quiet — Instrument Sans with consistent negative tracking creates density without weight, and Fragment Mono punctuates timestamps and metadata. The palette never escalates: no shadows, no gradients, no secondary accents — just warm neutrals, one bold red, and a single full-bleed black band for tonal contrast.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vermillion | `#dd3508` | Orange accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Peach Hairline | `#f3b8a9` | Orange outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Cream Vellum | `#e4ddd5` | Page canvas below the hero, input borders, soft surface washes — the warm paper stock everything else sits on |
| Bone White | `#ffffff` | Card surfaces, button fills on the orange hero, nav text on dark/orange, inverted typography — the bright surface layer |
| Midnight Ink | `#151515` | Primary headings, body text, dark section backgrounds, chat bubble fills, button borders on light — the heavy type and the rare full-bleed dark band |
| Graphite | `#4f4f4f` | Card borders, secondary text, muted UI rules — the mid-neutral that softens edges between Bone White and Midnight Ink |
| Charcoal | `#333333` | Link text on light surfaces, image strokes, secondary borders |
| Ochre Tan | `#d7cabb` | Badge backgrounds and borders, secondary surface tint — a warm neutral tag fill that sits between cream and peach |
| Press Black | `#000000` | Icon fills, tight border accents, true-black for print-style contrast moments |

## Typography

### Instrument Sans — Primary interface and editorial typeface. Weight 500 for nav and buttons, weight 600 for headings, weight 400 for body. Consistent -0.02em tracking across all sizes tightens the geometric forms and gives the warm palette a modern editorial voice. The slight positive tracking at caption (12px) opens up small labels so they don't feel crushed.
- **Substitute:** Inter, DM Sans, or system-ui sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 12, 14, 16, 18, 20, 24, 28, 32, 39, 48
- **Line height:** 1.00, 1.15, 1.20, 1.25, 1.30, 1.43
- **Letter spacing:** -0.020em at 14px and up; +0.020em at 12px caption

### Fragment Mono — Accent monospace for timestamps in chat bubbles, metadata labels, and small data tags. The extreme -0.08em tracking at 14px collapses letterforms into a dense printed-stamp feel that contrasts the airy sans-serif body.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 400, 700
- **Sizes:** 14, 16
- **Line height:** 1.00, 1.15, 1.30
- **Letter spacing:** -0.08em at 14px, -0.02em at 16px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 17 | 0.24px |
| body-sm | — | — | 14px | 20 | -0.28px |
| body | — | — | 16px | 21 | -0.32px |
| subheading | — | — | 18px | 23 | -0.36px |
| heading-sm | — | — | 20px | 24 | -0.4px |
| heading | — | — | 24px | 29 | -0.48px |
| heading-lg | — | — | 32px | 37 | -0.64px |
| display | — | — | 39px | 45 | -0.78px |
| display-lg | — | — | 48px | 48 | -0.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-96px
- **Card padding:** 16-24px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **badges:** 60px
- **inputs:** 4px
- **buttons:** 80px
- **chat-bubbles:** 20px

## Components

### Primary Pill Button
**Role:** Hero CTA and form submit

Bone White (#ffffff) fill, Midnight Ink (#151515) text, 1px Midnight Ink border, 80px border-radius (full pill), 12px 24px padding, Instrument Sans 14px weight 500. Sits on the Vermillion hero as the only permitted action element.

### Outlined Action Button
**Role:** Secondary call-to-action on light backgrounds

Transparent fill, 1px Vermillion (#dd3508) border, Midnight Ink text, 80px border-radius, 12px 24px padding, Instrument Sans 14px weight 500. The chromatic border is the only color this button carries.

### Email Input
**Role:** Hero capture form

Transparent background, 1px Bone White border, Bone White placeholder text, 4px border-radius, Instrument Sans 14px, 12px 16px padding. No focus ring color change — the border remains the same weight.

### Transparent Nav Bar
**Role:** Top navigation over the Vermillion hero

Sits directly on the Vermillion hero with no background fill. Logo 'BACKLIGHT' left in Bone White, Instrument Sans 12px weight 600, letter-spacing wide (uppercase tracking). Nav items in Bone White, 14px weight 500, with Peach Hairline (#f3b8a9) underline indicating active state. Primary CTA is a Bone White pill button flush right.

### Hero Band
**Role:** Full-bleed opening section

Vermillion (#dd3508) background spanning full viewport width, 64-96px vertical padding, left-aligned content with 1200px max-width. Display headline in Bone White at 48px, body at 18px in Bone White. The hero is the only place Vermillion appears as a surface.

### Dark Contrast Band
**Role:** Full-bleed section for tonal break

Midnight Ink (#151515) background, Bone White text, 64-96px vertical padding. Used sparingly — once per page — to create a printed-poster moment of inversion between the warm cream sections.

### Chat Bubble Card (Dark)
**Role:** Team pain-point messaging on light background

Midnight Ink (#151515) fill, Bone White text, 20px border-radius, 16px padding, small avatar circle on the left. Name + Fragment Mono 14px timestamp above message, message in Instrument Sans 16px weight 400. Functions as a social-proof dramatization device.

### Chat Bubble Card (Light)
**Role:** Team pain-point messaging on light background (alternate)

Bone White fill, Graphite (#4f4f4f) 1px border, Midnight Ink text, 20px border-radius, 16px padding. Same internal structure as the dark variant but inverts the relationship — sits on Cream Vellum canvas.

### FAQ Accordion Row
**Role:** Expandable question list

Full-width row, Graphite (#4f4f4f) 1px hairline divider, 24px vertical padding, Instrument Sans 18px weight 500 question text in Midnight Ink. Plus icon right-aligned in Vermillion (#dd3508), 20px. No background fill, no card chrome — the divider does the visual work.

### Carousel Arrow Button
**Role:** Horizontal content navigation

Circular button, 40px diameter, Bone White fill, Midnight Ink (#151515) 1px border, Midnight Ink chevron icon centered. Left/right pair sits above content blocks.

### Product Card
**Role:** Feature or product listing

Bone White fill, Graphite (#4f4f4f) 1px border, 8px border-radius, 16-24px padding, Instrument Sans 18px weight 500 title in Midnight Ink, body at 14px in Graphite. No shadow, no hover elevation — the border carries the definition.

### Pill Badge
**Role:** Status, category, or NEW tag

Ochre Tan (#d7cabb) background, Graphite (#4f4f4f) 1px border, 60px border-radius (pill), 4px 12px padding, Instrument Sans 12px weight 500 in Midnight Ink. Used for 'NEW' labels and category tags.

### Sticky Promo Banner
**Role:** Bottom-right persistent announcement

Midnight Ink (#151515) fill, 8px border-radius, Bone White text, Fragment Mono 12px weight 700 for the 'NEW' label in Vermillion, headline at 16px Instrument Sans weight 500, inline thumbnail image on the right with Peach Hairline border.

### Footer
**Role:** Site footer with link columns

Sits on the Vermillion hero continuation or transitions to Midnight Ink. Bone White text, Instrument Sans 14px, link columns separated by Peach Hairline (#f3b8a9) vertical rules. Logo bottom-left in Bone White uppercase.

## Do's and Don'ts

### Do
- Use Vermillion (#dd3508) as a full-bleed hero background — it is the only place this color appears as a surface
- Set border-radius to 80px (full pill) for all primary buttons and to 8px for all cards and rectangular elements
- Apply -0.02em letter-spacing to all Instrument Sans text at 14px and above; use +0.02em at 12px caption
- Use Cream Vellum (#e4ddd5) as the page canvas and Bone White (#ffffff) for all cards and surfaces that sit on it
- Use Fragment Mono at 14px with -0.08em tracking for timestamps, metadata, and small data labels in chat bubbles
- Use chat-bubble cards (dark or light, 20px radius) to dramatize team conversations and social proof moments
- Limit Vermillion accents on light backgrounds to thin 1px borders and small icons (FAQ plus, carousel arrows)

### Don't
- Do not add drop shadows, glow effects, or any box-shadow to cards, buttons, or modals — the system is intentionally flat
- Do not use Vermillion as a filled button background — it is only an outlined-action border and a hero surface
- Do not use Peach Hairline (#f3b8a9) as a text color or interactive fill — it is decorative border only
- Do not introduce a second chromatic accent color — the system is monochromatic warm with one red
- Do not use gradients anywhere in the interface — surfaces are solid colors only
- Do not use Midnight Ink (#151515) as body text on the Vermillion hero — all hero text must be Bone White
- Do not center-align headlines — Backlight's editorial voice is left-aligned with generous left padding

## Elevation

Flat by design. No drop shadows, no elevation effects. Surface separation is achieved entirely through color contrast between the warm cream canvas and Bone White cards, and through thin 1px borders in Graphite. This reinforces the printed/editorial feel — the design reads as ink on paper, not as digital elevation.

## Surfaces

- **Cream Vellum** (`#e4ddd5`) — Page canvas — the warm paper background that carries the majority of content
- **Bone White** (`#ffffff`) — Cards, chat bubbles, button fills — the bright surface layer above the canvas
- **Midnight Ink** (`#151515`) — Dark chat bubbles, full-bleed contrast bands, footer — tonal inversion surfaces
- **Vermillion** (`#dd3508`) — Hero band — the single chromatic surface, used once per page for maximum impact

## Imagery

Backlight uses three image modes: (1) small circular avatar portraits inside chat bubble cards, shown at ~32px with a subtle Peach Hairline border, (2) inline product/media thumbnails in the sticky promo banner with a 1px Peach Hairline stroke, and (3) full-bleed media crops on the right edge of content sections, treated with sharp rectangular edges (no rounding) so they read as printed halftones. Photography is warm-toned and editorial — never stock-lifestyle. No illustrations, no 3D renders, no abstract graphics. The visual language is print-catalog: portraits, media stills, and chat artifacts arranged in a grid of cards and bubbles.

## Layout

Backlight is a left-aligned, max-width 1200px layout with full-bleed section bands. The hero is a full-viewport-width Vermillion band with left-aligned headline and email capture. Below the hero, the layout alternates between Cream Vellum canvas and occasional Midnight Ink full-bleed bands. Content blocks use generous 64-96px vertical section gaps. The FAQ section is a single-column list of left-aligned questions with right-aligned Vermillion plus icons. Carousel sections use left/right circular arrow buttons above horizontally-scrolling content. Navigation is a transparent top bar flush with the hero — no sticky behavior, no background fill until the hero ends. The page reads top-to-bottom as a sequence of editorial spreads: orange cover, cream pages with card grids and chat dramatizations, one black inversion page, then a warm footer.

## Similar Brands

- **Frame.io** — Same warm editorial palette with cream/beige surfaces and a single bold accent — both are media-workflow tools that favor a printed-catalog feel over a typical SaaS dashboard
- **Pitch** — Same warm cream canvas with one strong accent color and left-aligned editorial headlines — both use generous spacing and chat/bubble cards as signature visual devices
- **Ceros** — Same warm-toned, editorial-brand aesthetic with flat surfaces, no shadows, and a single chromatic voice — both treat the page as a printed publication
- **Stripe** — Same tight tracking on display headlines, generous section spacing, and confident use of a warm-leaning palette with one strong accent
