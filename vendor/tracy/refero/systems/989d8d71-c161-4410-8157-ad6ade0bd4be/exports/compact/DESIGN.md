# Artboard — Style Reference
> Lime-voltage designer's tabletop. White paper, ink-black type, and one electric green that powers the whole studio.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Artboard Studio reads as a designer's toolshed laid out on a white tabletop — clinical canvas, high-contrast near-black type, and a single lime-green voltage that makes active states feel switched on. The system is overwhelmingly light and spacious, with confidence coming from tight tracking on large display type rather than weight or color. Buttons lean outlined rather than filled, borrowing the near-black as their stroke so primary actions feel like ink stamps on paper rather than glossy pills. Category surfaces (phone, apparel, packaging) are coded with soft pastel washes — peach, sky, mint — so visual variety arrives as color-coded cards, not gradients or shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#0d1400` | Primary text, ghost/outline action borders, filled dark buttons — near-black with a faint green undertone carries both editorial type and CTA strokes |
| Lime Voltage | `#aaff00` | Brand accent, active states, highlight tags, energetic punctuation — the single chromatic accent that gives the white canvas its electric charge |
| Paper White | `#ffffff` | Page canvas, card surfaces, button fills — the foundation everything sits on |
| Olive Stone | `#838976` | Muted helper text, secondary icons, neutral badge borders, low-emphasis UI chrome |
| Soft Mist | `#e6e7e4` | Hairline dividers, subtle surface edges, low-contrast separators |
| Peach Wash | `#ffe4c3` | Category card accent — warm pastel surface for color-coded product groupings |
| Sky Wash | `#cbedff` | Category card accent — cool pastel surface for color-coded product groupings |
| Mint Wash | `#caf3aa` | Category card accent — fresh pastel surface for color-coded product groupings |

## Typography

### Vend Sans — Custom display + label typeface. Headlines run at 43–61px weight 600/700 with tight negative tracking (-0.033em to -0.023em) for a compressed, editorial feel. The same family doubles as small all-caps labels at 11–13px with wide positive tracking (+0.039em to +0.045em) — a deliberate dual register: whisper-quiet labels, assertive display.
- **Substitute:** Inter
- **Weights:** 400, 600, 700
- **Sizes:** 11px, 13px, 19px, 43px, 61px
- **Line height:** 1.20, 1.50
- **Letter spacing:** -0.033em at 61px, -0.023em at 43px, +0.039em at 13px, +0.045em at 11px

### system-ui — Body and supporting text. Stays at 16px with 0.031em tracking — deliberately understated so Vend Sans can lead. No custom body face: the system font is the quiet workhorse, and custom type is reserved for moments of emphasis.
- **Substitute:** system-ui
- **Weights:** 400, 700
- **Sizes:** 16px
- **Line height:** 1.00, 1.50
- **Letter spacing:** 0.0310em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | 0.5px |
| body | — | — | 16px | 1.5 | 0.5px |
| subheading | — | — | 19px | 1.5 | -0.44px |
| heading | — | — | 43px | 1.2 | -0.99px |
| display | — | — | 61px | 1.2 | -2.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 8px

### Border Radius

- **nav:** 8px
- **cards:** 12px
- **icons:** 12px
- **badges:** 8px
- **buttons:** 8px

## Components

### Top Navigation Bar
**Role:** Persistent site header

White background, 8px radius on interactive elements, 20px horizontal padding on nav items, 11px row gap between link groups. Logo lockup on the left at left, nav links center-left, outlined action buttons (Unlock, Login) on the right with 1px Midnight Ink (#0d1400) border, 8px radius, 19px horizontal / 11px vertical padding, Vend Sans 13px weight 600 at +0.045em tracking.

### Outlined Action Button
**Role:** Primary CTA in ghost/outline style

1px solid #0d1400 border, 8px radius, white fill, #0d1400 text at 13px Vend Sans weight 600 with wide tracking. Padding 8px 19px. This is the dominant button pattern — actions feel like ink-stamped outlines, not filled pills. The filled-dark variant uses #0d1400 background with #ffffff text (ACTION_BACKGROUND evidence).

### Filled Dark Button
**Role:** High-emphasis CTA

#0d1400 background, #ffffff text, 8px radius, 8px 19px padding. Used sparingly — reserved for the most important conversion when outline feels too quiet.

### Category Filter Pill
**Role:** Horizontal filter/category selector

Pill shape, 8px radius, thin 1px #0d1400 border, white fill, 11px Vend Sans weight 600 at +0.045em uppercase tracking. Active variant fills with #0d1400 and inverts text to #ffffff. Stretches as a horizontal scrollable row with 4px gap.

### Category Feature Card
**Role:** Large navigational card for a mockup category

White background, 12px radius, 1px #e6e7e4 hairline border, no shadow. Contains a 2×2 grid of mockup preview thumbnails (each with 8px radius) and a category label below at 19px Vend Sans weight 400 with -0.023em tracking. Some category cards use pastel washes (#ffe4c3, #cbedff, #caf3aa) as their background to color-code categories.

### Mockup Preview Tile
**Role:** Individual mockup image thumbnail

8px radius, white or transparent background, no visible border. Arranged in 2×2 grids within category cards. The tile itself is purely image-driven; the label lives on the parent card.

### Hero Section
**Role:** Above-the-fold introduction

Centered stack on white. 61px Vend Sans weight 600 headline at -2.01px tracking, 19px body subhead at -0.44px tracking, 43px headline can repeat for secondary lines. Above the headline: a horizontal row of 4 small icon+text labels (Online Editor, Video Mockups, AI Generators, Figma Plugin) at 11px Vend Sans with wide tracking, each preceded by a 12px-radius line icon in #0d1400.

### Icon+Label Feature Strip
**Role:** Capability highlights above hero

Row of 4 items, each a 12px-radius outlined icon paired with 11px Vend Sans uppercase label. 12px gap between icon and text, ~32px gap between items. Icons are stroke-based, 1.5px weight, #0d1400.

### Client Logo Strip
**Role:** Social proof band

Horizontal row of monochrome logos in #838976 (Olive Stone), centered, with generous vertical padding (48px). Logos sit at uniform height (~32px) with 48–64px horizontal spacing.

### Badge / Tag
**Role:** Small status or label chip

8px radius, thin 1px #838976 or #0d1400 border, white fill, 11px Vend Sans weight 600 at +0.045em tracking, 4px vertical / 8px horizontal padding.

### Category Accent Card
**Role:** Color-coded category surface

Large card with a pastel wash background (#ffe4c3, #cbedff, or #caf3aa), 12px radius, generous padding (24px+). Used to introduce categories with visual variety without resorting to gradients or imagery.

## Do's and Don'ts

### Do
- Use Vend Sans for all display, heading, and label text; let system-ui carry body copy at 16px without competition
- Apply -2.01px tracking at 61px and -0.99px at 43px — Vend Sans headlines should feel compressed, not airy
- Use wide tracking (+0.045em) on all Vend Sans labels at 11–13px; these read as uppercase tags, not body text
- Default buttons to the outlined style (1px #0d1400 border, white fill, 8px radius) and reserve the filled-dark variant for the single most important action per screen
- Use 8px radius for buttons, badges, and nav elements; reserve 12px radius for cards and icon containers — these two radii define the geometry
- Pull #aaff00 Lime Voltage only for active states, selected indicators, and highlight tags — never as a large fill or background
- Code categories with the three pastel washes (peach, sky, mint) at the card level; let the rest of the page stay achromatic

### Don't
- Do not introduce filled colorful buttons — the system is outlined-first, filled-dark-second; any other button fill breaks the ink-on-paper logic
- Do not apply the wide label tracking (+0.045em) to body or paragraph text; it belongs only to 11–13px Vend Sans labels
- Do not add drop shadows or elevation to cards — depth comes from pastel color washes and border hairlines, not box-shadow
- Do not use #aaff00 as a page background or large surface fill; it is accent punctuation, not canvas
- Do not mix #0d1400 with pure #000000 — the faint green undertone is part of the brand voice
- Do not introduce a third border-radius value; 8px and 12px are the only radii in the system
- Do not use gradient fills — the system is flat, with color variety delivered through solid pastel card surfaces

## Elevation

Elevation is intentionally absent. Cards are separated from the white canvas by 1px hairline borders (#e6e7e4) and by color — pastel washes, not shadows. Where a card needs to feel distinct, it gets a color, not a shadow. This keeps the interface flat, fast, and print-like.

## Surfaces

- **Paper White** (`#ffffff`) — Primary page canvas — everything sits on this
- **Soft Mist** (`#e6e7e4`) — Hairline dividers and low-contrast separators
- **Category Pastel** (`#ffe4c3`) — Color-coded category card surfaces (warm variant)
- **Category Pastel Cool** (`#cbedff`) — Color-coded category card surfaces (cool variant)
- **Category Pastel Fresh** (`#caf3aa`) — Color-coded category card surfaces (fresh variant)

## Imagery

Imagery is the product itself: mockup photographs (devices, apparel, packaging, print materials, tote bags, laptops) are the heroes. Treatment is full-color, product-focused, tight crops on solid color backgrounds — the object is isolated, no lifestyle context. Mockup tiles use 8px radius and sit in 2×2 grids within larger category cards. The homepage is a gallery: visual space occupied by imagery far exceeds text. No illustrations, no abstract graphics, no 3D renders — the site is a catalog of photographic mockups.

## Layout

Max-width 1200px centered content column. The hero is a centered text stack (no split layout, no sidebar) on a pure white background. Below the hero, a client logo strip introduces social proof, followed by a single-row horizontal mockup showcase with large color-coded cards. The main content area is a 3-column grid of category cards, each containing a 2×2 mockup tile grid and a label. Category cards alternate between white and pastel-wash backgrounds to create visual rhythm without section bands. Navigation is a single top bar — no sidebar, no mega-menu. Sections are separated by generous 64px vertical gaps with no visible dividers, letting whitespace carry the structure.

## Similar Brands

- **Figma** — White canvas, outlined-button-first interaction model, single accent color used sparingly for active states, custom display type with tight tracking
- **Linear** — Flat white surface, thin borders instead of shadows, compact 8px/12px radius geometry, and near-black type treated as the primary visual anchor
- **Unfold** — Design-tool portfolio aesthetic with product imagery as the hero, generous whitespace, and a quiet neutral palette with one chromatic accent
- **Are.na** — Minimalist creative-tool language with white canvas, small radii, outlined controls, and restraint with color and elevation
