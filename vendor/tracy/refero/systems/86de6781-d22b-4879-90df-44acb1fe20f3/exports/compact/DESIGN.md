# Discover — Style Reference
> Type museum on white marble — a near-black wordmark, a whisper of coral, and everything else recedes.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fonts Ninja is a near-monochrome gallery for letterforms, where the only chromatic note is a single warm coral that punctuates action. The canvas is near-white and stays quiet; type is the protagonist, presented at extreme scale and paired with generous negative space. Cards are soft-cornered white panels floating on a barely-there shadow, and every interactive element earns its color — most UI is ink-on-paper, and the coral appears only when something wants to be clicked. Density is compact but the layout breathes because margins are large and rhythm is measured in 10px and 24px increments rather than tight 4-8px stacks.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#121212` | Primary text, card borders, icon strokes, hairline dividers. A warm near-black chosen over #000 to soften contrast against white without losing authority |
| Canvas | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Fog | `#dbdada` | Ambient shadow tint, muted background washes, subtle surface elevation. Carries the 0.16-alpha shadow that lifts cards off the canvas |
| Slate | `#8e8e93` | Secondary body text, de-emphasized metadata, inactive nav borders, helper copy |
| Obsidian | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Signal Coral | `#ee585a` | Filled CTA backgrounds (action buttons, filter pills), inline text links, notification dot, hover/focus glow. The sole chromatic accent — one warm red against matte white creates urgency without aggression |

## Typography

### Aeonik — Sole typeface across all UI. 700 for the monumental wordmark and large display headings, 500 for medium-emphasis labels and nav, 400 for body and metadata. Tight -0.011em tracking across all sizes tightens the geometric forms and gives the wordmark its dense, packed look.
- **Substitute:** Inter, Satoshi, or General Sans
- **Weights:** 400, 500, 700
- **Sizes:** 12, 14, 16, 24, 32, 44px
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.011em (consistent across all sizes, roughly -0.13px at 12px through -0.48px at 44px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.13px |
| body-sm | — | — | 14px | 1.5 | -0.15px |
| body | — | — | 16px | 1.5 | -0.18px |
| subheading | — | — | 24px | 1.2 | -0.26px |
| heading-sm | — | — | 32px | 1.14 | -0.35px |
| heading | — | — | 44px | 1.15 | -0.48px |
| display | — | — | 120px | 1 | -1.32px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1320px
- **Section gap:** 48px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **cards:** 32px
- **links:** 16px
- **pills:** 9999px
- **buttons:** 32px

## Components

### Font Preview Card
**Role:** Grid tile displaying a single typeface specimen

White surface (#ffffff) on Canvas, 32px border-radius, ambient shadow rgba(72,72,74,0.16) 0px 2px 32px 0px. Centered specimen at ~120px Aeonik weight 700 in Ink (#121212) dominates the card. Below: font name in 16px weight 500 Ink, foundry and style count/price in 12-14px Slate (#8e8e93). Internal padding 24px, specimen area ~60% of card height.

### Primary CTA Button (Filled)
**Role:** Action trigger — filter, submit, navigate

Signal Coral (#ee585a) background, white (#ffffff) text, Aeonik 500 at 14-16px, 32px border-radius, 16px vertical × 24px horizontal padding. No border. Sits at full saturation against the monochrome canvas — the coral is the only chromatic voice in the room.

### Ghost Text Link
**Role:** Inline navigation and secondary affordances

Signal Coral (#ee585a) text in Aeonik 500 at 16px with an external-arrow glyph (↗). No underline, no background, no border. Inline within body copy or as standalone link. 16px border-radius on any container.

### Floating Filter Pill
**Role:** Sticky filter trigger for typeface grid

Signal Coral (#ee585a) filled pill, white text reading 'Filter typefaces' with a dropdown caret icon, 9999px border-radius (full pill), 10-12px vertical × 20px horizontal padding. Floats over grid content at fixed position.

### Top Navigation Bar
**Role:** Primary site navigation

Transparent/Canvas background, 56px horizontal padding. Left: small ninja mark icon. Right cluster: 'Fonts' (active, weight 500 Ink), 'Bookmarks' (weight 400 Slate), search icon, profile icon, hamburger — all 24px outlined icons in Ink with 24-32px gap between items.

### Hero Wordmark
**Role:** Brand statement and page identity

Full-bleed 'FONTS NINJA' set in Aeonik 700 at ~120px, Ink (#121212), tracking -1.32px, line-height 1.0. Near-edge-to-edge horizontal span. A 12px Signal Coral notification dot sits at the top-right of the final 'A' — a single pop of color that says 'new' without a badge or banner.

### Notification Dot
**Role:** Status indicator on wordmark and possibly nav elements

12px diameter circle, Signal Coral (#ee585a), no border, no shadow. Positioned as a superscript overlay.

### Metadata Label
**Role:** Supporting text — foundry name, style count, price

Aeonik 400 at 12-14px, Slate (#8e8e93). Two-column layout within cards: left-aligned descriptor, right-aligned price/style count. 10px gap between label and value.

### Body Paragraph
**Role:** Hero subtext and descriptive copy

Aeonik 400 at 16-24px, Ink (#121212), line-height 1.5, max-width constrained to ~50-60ch. Inline links adopt Ghost Text Link styling.

## Do's and Don'ts

### Do
- Use Signal Coral (#ee585a) exclusively for filled CTAs, inline text links, notification dots, and the floating filter pill — never as a background wash, never on large surface areas
- Set all type in Aeonik (or Inter/Satoshi substitute) at -0.011em letter-spacing regardless of size — the consistent tight tracking is part of the brand voice
- Apply 32px border-radius to all cards, buttons, and containers — this large radius is signature and defines the soft, modern feel
- Use Ink (#121212) for all text and borders instead of pure #000000 — the warmth keeps the near-monochrome palette from feeling harsh
- Limit shadows to the single token rgba(72,72,74,0.16) 0px 2px 32px 0px, applied only to cards and floating elements
- Maintain 10px element gaps and 24px card padding as the base rhythm — jump to 48px for section separation
- Let the wordmark or display heading carry visual weight; keep supporting UI quiet and monochrome

### Don't
- Don't introduce additional accent colors — the 1% colorfulness is deliberate; Signal Coral is the only chromatic note allowed
- Don't use sharp corners (0-4px radius) on any container — the 32px radius defines the system
- Don't apply drop shadows to text, nav, or inline elements — shadows are reserved for cards and floating pills only
- Don't use pure #000000 for body text — always use #121212 to maintain the soft contrast ratio (18.7:1)
- Don't set display type at loose or normal letter-spacing — the -0.011em tight tracking is non-negotiable
- Don't fill large background areas with Signal Coral — it loses impact at scale and should remain a small functional accent
- Don't add gradients, textures, or decorative imagery — the system is deliberately flat and typographic

## Elevation

- **Font Preview Card:** `rgba(72, 72, 74, 0.16) 0px 2px 32px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Base page background, full-bleed
- **Card** (`#ffffff`) — Font preview tiles, content panels — same hex as canvas but separated by shadow
- **Shadow Tint** (`#dbdada`) — Ambient gray carried in card shadows at 0.16 alpha
- **Action Surface** (`#ee585a`) — Filled CTAs, floating filter button, notification dot

## Imagery

No photography, no illustration, no abstract graphics. The only visual content beyond UI chrome is typographic specimens — oversized 'Aa' glyphs rendered directly in the interface as the product itself. Icons are minimal outlined glyphs (search, profile, hamburger, ninja mark) drawn in Ink at 24px with thin consistent stroke weight, monoline style. The wordmark functions as the hero image. Visual density is extremely low — text and specimens dominate, the rest is whitespace.

## Layout

Full-bleed layout with the wordmark stretching nearly edge-to-edge in the hero, establishing maximum typographic impact immediately. Below the hero, a 3-column responsive grid of font preview cards with generous 24-32px gutters. Content max-width approximately 1320px centered on the canvas. Section rhythm: the hero is a single expansive band, followed by a tighter grid section. Navigation is a minimal top bar with right-aligned utility cluster. No sidebar, no mega-menu, no sticky elements beyond the floating filter pill. The page reads top-to-bottom as: monumental wordmark → short descriptive paragraph → dense specimen grid. Asymmetric only in the hero's near-full-bleed scale; the grid below is symmetric and evenly spaced.

## Similar Brands

- **Pangram Pangram** — Same near-monochrome gallery treatment for type specimens, oversized 'Aa' previews, and large border-radius on specimen cards
- **Klim Type Foundry** — Editorial type-foundry presentation with white canvas, single-weight typography, and type specimens as the primary visual
- **Are.na** — Near-monochrome minimalist interface with quiet chrome and a single accent color reserved for interactive elements
- **Linear** — Compact dense UI with generous border-radius, near-black text on white, and a single restrained accent palette
- **Velvetyne Type Foundry** — Type-specimen-first layout with specimen cards on white, minimal chrome, and no decorative imagery
