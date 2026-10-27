# UGLYCASH — Style Reference
> Sticker-covered notebook on cream paper — a vibe of irreverent, maximalist fintech that wears its chaos proudly.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

UGLYCASH runs a sticker-bombed Gen-Z finance language: warm light canvas, oversized black display type, and a riot of vivid accent panels (hot pink, electric cyan, toxic lime, dusty khaki) splashed across mostly achromatic layouts. The signature move is a heavy black hairline (1px) that traces every surface — cards, phone frames, buttons, illustrations — giving the impression of printed stickers peeled onto a page. Radii are exaggerated (16px for controls, 38–46px for hero cards) to amplify the soft, toy-like feel, while the palette stays disciplined: one neutral canvas, one neutral surface, and three or four saturated brand colors used as full-bleed card fills rather than thin accents. Headlines shout at 85–164px with negative tracking; body text retreats to 14–18px Inter. Everything reads as fast, loud, and deliberately unpolished.

## Colors

| Name | Value | Role |
|------|-------|------|
| Static Black | `#000000` | Text, borders, icon strokes, button outlines — the structural ink that outlines every sticker-like surface and carries all body and heading type |
| Paper Cream | `#f2f2f2` | Page canvas, body backgrounds, and soft section fills |
| Card White | `#ffffff` | Elevated card surfaces and inverse text on dark panels |
| Surface Graphite | `#3a3a3a` | Dark card and panel fills for inverted sections |
| Hardware Ink | `#000100` | Near-black phone-frame and hardware fills (visually indistinguishable from #000000, used on device mockups) |
| Hairline Smoke | `#6e6e6e` | Muted body text and secondary borders |
| Placeholder Ash | `#888888` | Helper text, disabled-state type, and low-priority metadata |
| Sticker Khaki | `#e7e3bf` | Card and panel fills — dusty olive-cream that reads as vintage paper against the white canvas |
| Riot Pink | `#fa00ff` | Saturated card fills, sticker backgrounds, hero callouts — the loudest voice in the accent set |
| Voltage Cyan | `#02bbff` | Saturated card fills and feature panel backgrounds — secondary brand voice, often paired with phone mockup screenshots |
| Toxic Lime | `#adff02` | Green action color for filled buttons, selected navigation states, and focused conversion moments |

## Typography

### Helvetica Now Display Cn Bold — Display and headline voice — compressed, ultra-bold, negative tracking (-0.033em at 85–164px). Carries the page's identity: shouty statements like 164px section openers. Substitute with 'Helvetica Neue Condensed Bold' or 'Roboto Condensed 900'.
- **Substitute:** Helvetica Neue Condensed Bold or Roboto Condensed 900
- **Weights:** 700, 900
- **Sizes:** 20px, 64px, 85px, 164px
- **Line height:** 0.85, 0.94, 1.20
- **Letter spacing:** -0.033em at display sizes, -0.020em at 20px

### Inter — Body, UI, navigation, and small headings. Weight 400 for body, 500 for emphasis, 700 for subheadings. Letter-spacing -0.02em tightens the UI text. Free Google Font.
- **Substitute:** Inter
- **Weights:** 400, 500, 700
- **Sizes:** 12px, 14px, 18px, 20px, 24px
- **Line height:** 1.17, 1.20, 1.22, 1.29, 1.33, 1.40
- **Letter spacing:** -0.02em

### Miss Fajardose — Hand-lettered display accent — used sparingly (one observation) for a personal signature on a card. Substitute with 'Caveat Brush' or 'Permanent Marker' for the same marker-on-paper feel.
- **Substitute:** Caveat Brush or Permanent Marker
- **Weights:** 400
- **Sizes:** 38px
- **Line height:** 1.20

### System sans-serif — Fallback body fallback; appears in 357 instances as the default rendering surface for generic UI chrome and inline text nodes.
- **Substitute:** system-ui
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.24px |
| body-sm | — | — | 14px | 1.29 | — |
| body | — | — | 18px | 1.33 | -0.36px |
| subheading | — | — | 20px | 1.2 | -0.4px |
| heading-sm | — | — | 24px | 1.22 | -0.48px |
| heading | — | — | 64px | 0.94 | -1.28px |
| heading-lg | — | — | 85px | 0.85 | -2.81px |
| display | — | — | 164px | 0.85 | -5.41px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **cards:** 16px
- **buttons:** 16px
- **hairline:** 1px
- **heroCards:** 38px
- **phoneFrames:** 43px
- **featurePanels:** 46px

## Components

### Floating Navigation Pill
**Role:** Persistent top header

White (#ffffff) pill, 16px radius, 1px black border, fixed at the top center of the viewport. Contains the wordmark left-aligned, social icons centered, and a black-bordered 'Get the App' ghost button on the right with a small black square icon. Padding roughly 10px vertical, 20px horizontal.

### Ghost Navigation Button (Get the App)
**Role:** Secondary header action

White background, 1px black border, 16px radius, Inter 14px weight 500, black text, padding 5–10px. Left-side 20px black square icon.

### Display Headline Block
**Role:** Hero and section openers

Helvetica Now Display Cn Bold 85–164px, weight 900, line-height 0.85, letter-spacing -0.033em (-2.81px at 85px, -5.41px at 164px), color #000000, centered or left-aligned at 168px page padding. The condensed bold caps are the loudest element on any screen.

### Feature Card (Saturated Sticker)
**Role:** Three-up feature showcase

Full-bleed saturated fill (Riot Pink #fa00ff, Voltage Cyan #02bbff, or Sticker Khaki #e7e3bf), 1px black border, 16px radius, 24px padding. Contains a tilted phone-mockup illustration and a heading. Cards sit on a 34px column gap.

### Sticker Card (Khaki)
**Role:** Neutral feature card

Sticker Khaki (#e7e3bf) fill, 1px black border, 16px radius, 24px padding, no shadow. Used when a card needs visual weight without screaming a brand color.

### Dark Panel Card
**Role:** Inverted surface for bank/account listings

Surface Graphite (#3a3a3a) or Hardware Ink (#000100) fill, white (#ffffff) text, 1px black border, 16–46px radius. Hosts list rows with flag icons, country names, and outlined 'Open' buttons.

### Toxic Lime Pill Button
**Role:** Primary action in lists or CTAs

Toxic Lime (#adff02) background, 1px black border, 16px radius, Inter 14px weight 700, black text, padding 5–10px. The only filled color CTA in the system.

### Outlined Open Button
**Role:** Row-level action inside account lists

White (#ffffff) background, 1px black border, 16px radius, Inter 14px weight 500 black text, padding 5–10px.

### Bank Account Row
**Role:** List item inside Dark Panel Card

White interior surface inside a dark panel, 1px black border, 8–16px radius. Left: 24px square flag icon. Center: country name (Inter 18px weight 700) over muted helper text (Inter 14px weight 400 in #6e6e6e). Right: Outlined Open Button.

### Phone Mockup Frame
**Role:** Product preview

Hardware Ink (#000100) or Surface Graphite (#3a3a3a) body, 1px black border, 43px outer radius with 8–16px offset duplicate frame creating the peeled-sticker effect. Interior shows the app screen on a white card.

### Tilted Sticker Illustration
**Role:** Decorative motif across cards

Saturated fills (#fa00ff, #02bbff, #adff02, #e7e3bf) with 1px black borders, rotated -8° to +12°, sitting on top of card surfaces as if physically pasted on. Often contains bold short copy or iconography.

### Footer Social Row
**Role:** Brand/footer micro-interaction

Inline icon group (Discord, Instagram) rendered as 16–20px black-filled glyphs inside the navigation pill. No background, no border, 10px gap between icons.

### Section Title (H2)
**Role:** Mid-page section headers

Helvetica Now Display Cn Bold 64px, weight 700, line-height 0.94, letter-spacing -0.02em (-1.28px), color #000000, left-aligned, 96px section padding above/below.

### Card Caption (Sub-label)
**Role:** Two-line card description

Inter 18px weight 500, line-height 1.33, color #000000. Always rendered as a two-line stack: action verb first, benefit clause second.

## Do's and Don'ts

### Do
- Use 1px solid #000000 borders on every card, button, and phone frame — borders are the load-bearing structure, not shadows
- Use Helvetica Now Display Cn Bold at 85–164px with letter-spacing -0.033em for section openers; never let body text reach display sizes
- Reach for the saturated brand colors (#fa00ff, #02bbff, #adff02, #e7e3bf) as full card or panel fills, never as thin text accents
- Set card and button radius to 16px; escalate to 38–46px only for hero-scale panels and phone frames
- Keep the page canvas at #f2f2f2 and default card surface at #ffffff; let the saturated stickers do the loud work on top
- Use Inter for everything below 24px — body, UI, navigation, captions — at 14–18px with -0.02em tracking
- Maintain 96px vertical section gaps and 10–20px element gaps to preserve the comfortable, sticker-pasted rhythm

### Don't
- Do not add drop shadows; elevation is drawn with borders and offset duplicate frames
- Do not use the saturated brand colors for thin underlines, icon strokes, or 1px borders — they need fill to read as stickers
- Do not use more than two type families on a single surface; Helvetica Now + Inter (or one handwritten accent) is the ceiling
- Do not push body text below 14px or above 20px — the UI scale is tight and the contrast assumes 14–18px body
- Do not set radius to 0 or to 9999px; the system lives in the 1px / 16px / 38–46px range
- Do not use the brand colors as text color on white backgrounds — black text on saturated fills, white text only on #000100/#3a3a3a panels
- Do not let display headlines wrap before 4 words; the 164px size assumes 1–3 short lines at 0.85 line-height

## Elevation

- **Sticker Cards:** `1px solid #000000 — borders carry the weight`
- **Phone Mockups:** `1px solid #000000 with optional 8–16px offset duplicate frame for the peeled-sticker depth illusion`

## Surfaces

- **Canvas Cream** (`#f2f2f2`) — Page background and outer gutter
- **Card White** (`#ffffff`) — Default product/feature card surface
- **Sticker Khaki** (`#e7e3bf`) — Tinted feature panel and section background
- **Surface Graphite** (`#3a3a3a`) — Inverted dark sections and phone-frame fills

## Imagery

Imagery is dominated by tilted, sticker-style illustrations of credit cards, percentage badges, candy/gem shapes, and phone mockups — all rendered with 1px black outlines and saturated fills as if die-cut and pasted onto the page. Photography is absent. Phone mockups appear repeatedly, sometimes overlapping cards at -8° to +12° rotations. Icons are flat, single-color, and outline-stroked in black. The visual register is printed-ephemera, not polished product render.

## Layout

Max-width 1200px centered, with the navigation rendered as a floating pill (not a full-width bar). The hero is a centered stacked composition: small floating nav, two-line 164px headline, then a phone mockup directly below. Mid-page alternates a three-column feature card row (16px radius, 24px column gap) with two-line captions beneath. A 168px horizontal padding wraps the hero, and 96px vertical gaps separate major sections. The bank-listing section uses a single dark panel with stacked white rows rather than a grid. Overall density is comfortable — generous whitespace between sections, tight rhythm inside cards.

## Similar Brands

- **Cash App** — Same bright-against-neutral sticker aesthetic with single-vivid accent panels and oversized bold type, but UGLYCASH pushes the outlined-sticker border treatment harder
- **Revolut** — Comparable fintech information architecture (multi-currency account lists inside dark panels), though UGLYCASH swaps Revolut's purple for a louder neon-pink/cyan/lime palette and a brutalist border language
- **Gumroad** — Shares the irreverent Gen-Z tone, sticker-style illustration treatment, and a cream-and-black canvas that lets saturated accent colors do the work
- **Pimento** — Tilted illustrated cards, condensed display headlines, and a paper-on-paste visual metaphor are virtually identical in approach
