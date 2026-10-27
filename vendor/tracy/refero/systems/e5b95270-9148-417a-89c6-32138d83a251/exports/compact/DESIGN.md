# Uniswap — Style Reference
> cotton-candy swap terminal in white air. Vivid magenta accents pierce an otherwise colorless, floating interface, while soft chromatic orbs drift in the background like currency made visible.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Uniswap presents a light, airy swap terminal aesthetic: a near-white canvas where a single vivid magenta-pink brand color carries every interactive signal, surrounded by soft floating color orbs that lend the page a playful, weightless atmosphere. Typography is confident and tight — a single custom display face (Basel) at near-black weight, with an unusual 485 weight that sits between regular and medium, creating a subtly compressed, modern feel across both display and UI copy. Components stay compact and rounded — 20px radii on swap cards, 16px on buttons, pill shapes for tokens — with barely-there shadows that let the white surface breathe. The overall experience feels like a DeFi command center rendered in pastel air: structured enough to trust with money, colorful enough to feel alive.

## Colors

| Name | Value | Role |
|------|-------|------|
| Uniswap Magenta | `#ff37c7` | Pink supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink | `#131313` | Primary text, nav labels, headings, body copy, and default icon strokes — near-black rather than pure black for a slightly softer read |
| Charcoal | `#222222` | Secondary text and strong UI borders where extra weight is needed without going to pure black |
| Steel | `#6a6a6a` | Muted helper text, secondary labels, inactive nav items, and supporting copy |
| Fog | `#acacac` | Disabled states, placeholder text, and faint dividers |
| Pure White | `#ffffff` | Page canvas, card surfaces, and button text on magenta fills |
| Bone | `#f2f2f2` | Subtle button borders and faint surface tints |
| Onyx | `#000000` | Maximum-contrast text and select icon fills where absolute black is required |
| Electric Violet | `#8251fb` | Decorative icon accent and floating orb color — part of the hero atmosphere palette, not a UI state |
| Ember Orange | `#ff4d00` | Decorative orb and icon accent in the hero atmosphere |
| Hot Pink | `#f50db4` | Decorative orb accent — deeper sibling to the primary magenta for tonal variety in background blobs |
| Sky Cyan | `#2abdff` | Decorative orb and icon accent in the hero atmosphere |
| Mint Teal | `#00c3a0` | Decorative orb and icon accent in the hero atmosphere |
| Coral Red | `#e01a2b` | Decorative orb accent and select icon tint |
| Forest Green | `#0c8911` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |

## Typography

### Basel — Sole typeface for every text surface — nav, body, buttons, headings, and display. The signature 485 weight (slightly heavier than regular, lighter than medium) creates a distinctive subtly-compressed feel that no system font replicates. Consistent -0.02em tracking tightens the rhythm at every scale, from 12px captions to 64px display.
- **Substitute:** Inter (closest free match for the geometric grotesque structure) or General Sans; replicate the 485 weight by using 500 at 96% opacity
- **Weights:** 400, 485, 500, 535
- **Sizes:** 12, 13, 14, 16, 18, 24, 36, 52, 64
- **Line height:** 1.2–1.5 body, 0.96–1.19 display
- **Letter spacing:** -0.02em across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.24px |
| body-sm | — | — | 14px | 1.25 | -0.28px |
| body | — | — | 16px | 1.49 | -0.32px |
| subheading | — | — | 18px | 1.33 | -0.36px |
| heading-sm | — | — | 24px | 1.2 | -0.48px |
| heading | — | — | 36px | 1.15 | -0.72px |
| heading-lg | — | — | 52px | 1 | -1.04px |
| display | — | — | 64px | 0.96 | -1.28px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **nav:** 20px
- **cards:** 20px
- **links:** 32px
- **tokens:** 999999px
- **buttons:** 12-16px
- **swap-widget:** 20px

## Components

### Filled Magenta CTA
**Role:** Primary action button — Connect wallet, Get started, Select token

Background #ff37c7, white text, 16px radius, padding 12px 20px, Basel 485 at 16px. Filled magenta against the white canvas is the loudest UI moment; never use more than one per viewport.

### Soft Pink CTA
**Role:** Secondary full-width action — Get started in hero

A paler pink fill (near #f2f2f2 with a magenta tint) with magenta text, 20px radius, 16px 24px padding. Reads as a gentler sibling of the filled magenta button for cases where the full-saturation version would dominate the hero.

### Ghost Text Link
**Role:** Tertiary navigation — Trade without fees, Get the app

No background, no border. Basel 485 at 14–16px in #131313 with a trailing arrow glyph. Lives inline with body copy or in the top-right nav cluster.

### Swap Input Card
**Role:** Token swap interface container — Sell and Buy panels

White surface, 1px border in #f2f2f2, 20px radius, padding 16px 20px. Label (Sell/Buy) at 14px Steel, input value at 36px Ink. Token selector chip is a pill (999999px radius) with token icon + ticker + chevron.

### Token Selector Pill
**Role:** Inline token picker inside swap cards

White pill, 999999px radius, 1px border #f2f2f2, padding 6px 12px. Contains a 24px circular token icon (ETH, etc.) and 16px Basel 500 ticker, with a 12px chevron.

### Stat Tile
**Role:** Metrics display — All time volume, TVL, swapper count, 24H volume

White card, 1px border #f2f2f2, 20px radius, padding 20px. Label at 14px Steel, value at 36–52px Ink. The 24H volume variant uses #0c8911 for the value text and a #c5e3c6 tint background to signal real-time data.

### Nav Bar
**Role:** Top-level navigation

White with a subtle frosted/blurred quality. Logo (magenta unicorn) at left, nav links in Basel 485 14–16px, center search field (rounded pill, 1px border, placeholder text in Fog), right cluster with Ghost text link + filled magenta Connect button. Active nav item carries a soft magenta background highlight.

### Search Field
**Role:** Centered token/pool/wallet search in nav

Pill-shaped (999999px radius), 1px border #f2f2f2, white fill, 40px height. Leading search icon in Steel, placeholder at 14px Fog. Slash-key hint badge on the right.

### Feature Card
**Role:** Product entry points — Web App, Uniswap Wallet

Rounded card with 20px radius, light tinted background (pastel blue or pink wash), padding 24px. Icon at top-left in chromatic accent, heading at 24px Ink, subtle description text below.

### Floating Decorative Orb
**Role:** Atmospheric background element in hero

Large soft-blurred circular shapes (60–120px diameter) scattered across the hero in violet, orange, pink, cyan, teal, and red. No border, no shadow — pure color clouds. They carry the page's personality without adding UI weight.

### Section Heading
**Role:** Page-level section titles — Build for all the ways you swap

Basel 485 at 36–52px in #131313, line-height 1.15, letter-spacing -0.02em. Left-aligned with comfortable left margin; no underline, no accent bar.

## Do's and Don'ts

### Do
- Use #ff37c7 for filled action buttons — the single chromatic moment in the UI
- Set all type to Basel at 485 weight with -0.02em letter-spacing across every size
- Use 20px radius for all card surfaces and 999999px for token pills and search fields
- Keep the page canvas pure white (#ffffff); let floating orbs supply all background color
- Use #0c8911 exclusively for highlighted real-time stat values — no other color for data emphasis
- Pair 16px padding inside cards with 8px gaps between elements for a compact-but-airy rhythm
- Place at most one filled magenta CTA per viewport; use ghost or soft-pink variants for additional actions

### Don't
- Don't introduce a second chromatic accent into the UI — the system is monochrome + magenta by design
- Don't use pure black (#000000) for body copy — use #131313 for a slightly softer, warmer read
- Don't apply visible drop shadows; the one allowed shadow is the 10px black-3% on elevated widgets
- Don't use any color outside the orb palette for backgrounds — orbs decorate, surfaces stay white
- Don't round buttons to 999999px (pill) unless they are token selectors or search; use 12–16px for CTAs
- Don't use colored text for body or nav labels; only #ff37c7 (actions), #0c8911 (data), and the Ink/Steel neutral scale
- Don't reduce the 64px display size or increase the 0.96 line-height — the tight display rhythm is signature

## Elevation

- **Elevated widget (swap terminal, overlays):** `0px 0px 10px 0px rgba(19, 19, 19, 0.003) — a near-invisible shadow that separates surfaces without adding visual weight`

## Surfaces

- **Canvas** (`#ffffff`) — Full-page background; the white space that lets the magenta and floating orbs carry all the visual energy
- **Card Surface** (`#ffffff`) — Swap input cards, stat tiles, and feature cards sit on the same white but are defined by a faint border or near-invisible shadow
- **Elevated Widget** (`#ffffff`) — The swap terminal and overlay surfaces; same white but separated by a barely-perceptible 10px black-3% shadow

## Imagery

The visual language is dominated by soft, blurred floating color orbs scattered across the hero — large circular shapes in violet, orange, pink, cyan, teal, and red that drift against the white canvas like chromatic clouds. These are the only atmospheric imagery; there is no photography, no illustration, no product screenshots in the hero. Token icons are simple circular logos in their native brand colors (ETH violet, USDC blue, etc.) and serve as the primary recognizable visuals. The page is overwhelmingly UI-and-typography, with the orbs providing personality without competing for attention.

## Layout

Centered max-width 1200px container with generous left/right gutters. The hero is a centered vertical stack: 64px display headline, subtitle, the swap terminal widget (contained max-width ~420px), and a soft-pink CTA below. Sections below use full-width bands with the same centered 1200px content area. The stats section uses a 2-column grid of 4 stat tiles. Product feature cards form a multi-column grid below. Navigation is a single top bar with frosted/blurred quality, center search field, and right-aligned action cluster. Vertical rhythm is built on 64px section gaps with 8px element gaps within cards.

## Similar Brands

- **Coinbase** — Same light-canvas, single-accent-color approach with a clean swap/trade hero; both use a blue or brand-color filled CTA against a white background
- **Phantom Wallet** — Similar light-mode crypto interface with compact rounded cards, pill-shaped token selectors, and a minimal near-monochrome palette punctuated by a vivid accent
- **1inch** — Both present a centralized swap terminal as the hero interaction with a tight typographic system and white card surfaces on a light background
- **Rainbow Wallet** — Shares the playful floating-orb aesthetic in the hero and the use of a single saturated brand color against an otherwise white, minimal interface
