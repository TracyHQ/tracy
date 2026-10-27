# Getburnt — Style Reference
> editorial monochrome on warm paper — a minimal typeset spread where warm-black ink, a light display serif, and pill-shaped controls turn a B2B tool into something that reads like a quarterly journal.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Getburnt operates in a near-achromatic editorial register: a warm near-black ink against white paper, with a single mid-gray for secondary text. The visual language borrows from print typography — a featherweight display serif carries headlines while a neutral grotesque handles everything operational, creating the rhythm of a magazine spread rather than a SaaS dashboard. Pill-shaped controls and small-radius cards keep the UI tactile and quick, and the deliberate absence of chromatic accents forces hierarchy through scale, weight, and whitespace alone. Product mockups float as photographic-style still lifes within warm grayscale containers, making the interface feel like a curated catalog rather than a software platform.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#1a1a17` | Primary text, filled buttons, dark surface backgrounds, heading strokes — a warm-tinted near-black that replaces pure #000 throughout the system |
| Paper | `#ffffff` | Page canvas, card surfaces, light section backgrounds, button borders on dark surfaces |
| Ash | `#5f5f5d` | Secondary body text, helper text, muted borders, low-emphasis UI metadata |

## Typography

### Nyght Serif — Reserved exclusively for display and heading levels (26-72px). Weight 300 is the signature: most systems reach for 600-700 serif, this whisper-weight creates editorial gravitas through restraint. Letter-spacing widens slightly at smaller sizes (0.03em) and tightens at display sizes (0.01em) to preserve optical balance.
- **Substitute:** Fraunces (Google Fonts) at weight 300, or Cormorant Garamond Light
- **Weights:** 300
- **Sizes:** 26px, 48px, 62px, 72px
- **Line height:** 1.00-1.20
- **Letter spacing:** 0.01em at 62-72px, 0.03em at 26-48px

### Switzer — Workhorse for nav, body, buttons, labels, card metadata, and small headings. Tracking runs consistently at 0.03em — a subtle positive letter-spacing that gives the grotesque a calm, considered cadence. Weight 500 for emphasis, 600 for button text and nav active states.
- **Substitute:** Inter, or Manrope (Google Fonts)
- **Weights:** 400, 500, 600
- **Sizes:** 14px, 15px, 16px, 20px
- **Line height:** 1.50
- **Letter spacing:** 0.03em uniform across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 21 | 0.42px |
| body | — | — | 16px | 24 | 0.48px |
| subheading | — | — | 20px | 30 | 0.6px |
| heading-sm | — | — | 26px | 31.2 | 0.78px |
| heading | — | — | 48px | 52.8 | 0.48px |
| heading-lg | — | — | 62px | 68.2 | 0.62px |
| display | — | — | 72px | 72 | 0.72px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 1440px
- **tags:** 1440px
- **cards:** 6px
- **buttons:** 1440px

## Components

### Pill Primary Button
**Role:** Filled action button for top-level CTAs

Background #1a1a17, text #ffffff, 1440px border-radius (full pill), 28px horizontal padding × ~12px vertical, Switzer 15-16px weight 500, 0.03em tracking. Optional trailing arrow icon in white. Anchors the header and hero.

### Pill Ghost Button
**Role:** Outlined or text-only action for secondary actions

Transparent background, 1px border #1a1a17 or #ffffff depending on surface, 1440px radius, matching pill padding. Used for less prominent CTAs alongside the filled pill.

### Pill Nav Link
**Role:** Navigation items in header

Switzer 15-16px weight 400-500, no background, 1440px radius only when active (inverted: #1a1a17 bg, #ffffff text). Dropdown items get 12-16px padding.

### Editorial Display Heading
**Role:** Section and hero headlines

Nyght Serif weight 300, color #1a1a17, sizes 48-72px, line-height 1.0-1.1, letter-spacing 0.01em. The light weight and generous line-height create breathing space between lines — never set tight.

### Product Mockup Card
**Role:** Embedded product UI screenshots within feature sections

White card surface, 6px radius, ~24px internal padding, subtle #5f5f5d or #1a1a17 hairline border. Contains a miniaturized product UI with a chat input, task list, and status badges. Floats over a soft warm gradient backdrop in the surrounding panel.

### Workflow Card
**Role:** Three-column feature card on light section

White surface, 6px radius, 24px padding, faint 1px border. Contains a product mockup at top, then a Switzer small caps label (14px weight 500, 0.06em tracking), a Nyght Serif heading-sm (26px weight 300), and Ash body text. Three cards sit on a soft horizontal band gradient.

### Stat Tile
**Role:** Metric callouts in the trust strip below hero

Three equal columns separated by hairline #5f5f5d dividers. Each tile: small icon (16px) in #1a1a17, Switzer 15-16px weight 400, the numeric value not styled larger — the stat is part of the sentence rather than a hero number.

### Feature Row
**Role:** Two-column text + visual feature layout

Left column holds a Switzer small-caps eyebrow label and a Nyght Serif heading (48-62px weight 300). Right column holds a large dark-surface panel (#1a1a17 with subtle warm gradient) containing the product mockup. 48-64px vertical gap between rows.

### Chat Input Bar
**Role:** AI assistant prompt inside product mockup

Rounded pill input, white background, placeholder text in #5f5f5d, send button is a solid purple-ish or Ink filled circle. Sits as the top element of the Ozai Task List card.

### Task List Item
**Role:** Individual row inside the product mockup task list

White surface, no border, 16px row gap, 16px Switzer weight 500 title, 14px Ash subtitle, right-side chevron in #5f5f5d. Inactive rows fade to ~50% opacity.

### Status Pill Badge
**Role:** Order/inventory status indicators inside mockups

Inline pill, ~6px vertical × 10px horizontal padding, 1440px radius, Switzer 12-13px weight 500. Healthy = subtle green-tinted neutral bg + dark text; Critical = warm-tinted neutral bg + dark text. The system deliberately avoids saturated red/green — badges stay within the warm-monochrome palette.

### Icon Bullet
**Role:** Small leading icon for feature list items

16-18px monochrome icon, stroke weight ~1.5px, color #1a1a17, aligned to the first line of each feature row with 16-24px gap to the label.

### Header Bar
**Role:** Top-of-page navigation

White background, ~16px vertical padding, flex row with logo (left), nav links (center-left, 34px gap), and CTA pill (right). No border-bottom — the header relies on the white-on-white separation from the hero.

## Do's and Don'ts

### Do
- Use Nyght Serif weight 300 for all heading and display text — never set a heading in Switzer
- Keep the entire interface within the #1a1a17 / #ffffff / #5f5f5d triad; resist introducing chromatic accents
- Set all buttons, nav active states, and tags to 1440px border-radius for the pill signature
- Maintain 0.03em letter-spacing on all Switzer text to preserve the editorial cadence
- Use 6px radius for cards, mockup containers, and any rectangular UI surface
- Place product mockups on #1a1a17 dark panels to create a museum-vitrine effect against the white page
- Anchor every section with 48-64px vertical gap to keep the editorial pacing

### Don't
- Do not introduce blue, green, red, or any saturated brand color — the warmth comes from the near-black, not from accents
- Do not set Nyght Serif in weights other than 300 — adding bold or medium breaks the editorial voice
- Do not use square or 12px+ radii on buttons or tags — the pill shape is load-bearing
- Do not set body or heading text in pure #000000 — always use #1a1a17 for the warm-ink quality
- Do not use heavy drop shadows on cards — the system relies on hairline borders and surface contrast, not elevation
- Do not set line-height above 1.2 on Nyght Serif display sizes — the serif needs to sit tight to read as display, not body
- Do not apply gradients to text, buttons, or text containers — the palette is flat by design

## Elevation

The system avoids drop shadows entirely. Spatial separation is achieved through hairline 1px borders in #5f5f5d, surface contrast (white card on #1a1a17 panel or white card on white canvas with border), and generous whitespace. Elevation is implied by container, not by blur.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas and default section background
- **Ink Plate** (`#1a1a17`) — Inverted surface used for dark feature panels, product mockup backings, and high-contrast blocks

## Imagery

Photography plays a hero role: a single large full-bleed image of stacked wooden crates of strawberries in a warehouse occupies the entire right half of the hero, warm-toned, natural light, no overlays. The image is treated as a photographic still life — the physical supply chain is the product, not abstract illustration. Product mockups appear as in-page screenshots on dark panels, functioning as visual evidence rather than decoration. No icons beyond minimal 1.5px stroke monochrome marks; no illustration system; no decorative graphics.

## Layout

Max-width 1200px centered container, comfortable density. Hero is a 50/50 split: left column holds the serif headline at 62-72px, Switzer subtext, and a pill CTA; right column holds a full-bleed food photograph. Below the hero, a three-column stat strip divided by hairline rules. Subsequent sections alternate between left-text/right-dark-panel-with-mockup layouts and centered three-column workflow card grids. Sections are separated by 48-64px vertical gaps on a continuous white canvas. Navigation is a single white header bar with left-aligned logo and right-aligned pill CTA, no sticky behavior or mega-menu.

## Similar Brands

- **Linear** — Same editorial discipline: near-monochrome palette, generous whitespace, serif-or-grotesque type pairing, and pill-shaped controls that disappear into the layout
- **Vercel** — Identical reliance on typographic scale and weight contrast over color for hierarchy, with the warm-black-on-white palette and minimal interface chrome
- **Notion** — Same warm-tinted near-black replacing pure #000, the same avoidance of saturated accent colors, and a serif-light display weight used for editorial moments
- **Arc browser** — Same design-philosophy move of letting a single warm-tinted near-black do all the work while reserving color for functional moments inside product surfaces
