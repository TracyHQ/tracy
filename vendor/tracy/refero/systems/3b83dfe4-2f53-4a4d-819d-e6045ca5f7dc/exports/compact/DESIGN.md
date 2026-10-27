# xAI — Style Reference
> warm cream laboratory with a black pill

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

xAI runs a restrained near-monochrome editorial system on a warm-white canvas. Type leads the visual hierarchy: oversized display headlines at near-100% line-height with tight negative tracking sit above generous breathing room, while GeistMono punctuates the interface with terminal/code fragments. The single defining interaction is a pill-shaped, pure-black filled button — everything else is ghost, outlined, or surface-toned. Cards are flat, borderless, and warm-cream (#f9f8f6); depth comes from a single hairline ring rather than shadow stacks. Color is rationed: a warm off-white page, cream cards, near-black ink, and the occasional vivid accent (Beta pill, traffic-light terminal dots, gradient orbs) that earns attention precisely because the rest of the page refuses it.

## Colors

| Name | Value | Role |
|------|-------|------|
| Jet Ink | `#0a0a0a` | Primary text, filled CTA buttons, logo mark — near-black anchors the hierarchy without the harshness of pure black |
| Charcoal | `#151515` | Dark code-block surface behind terminal demos (used where black feels too stark against warm white) |
| Fog | `#858585` | Secondary text, icon strokes, inactive nav items — the most-used gray; carries the bulk of body and link copy |
| Pewter | `#9d9d9d` | Tertiary text, meta labels, decorative fills — softer than Fog for de-emphasized utility copy |
| Steel | `#545454` | Mid-weight body text where Fog reads too washed out (inline stats, spec lines) |
| Dove | `#d5d9e2` | Hairline borders, input rings, button focus outlines — the only border color in the system |
| Cream | `#f9f8f6` | Card surfaces, secondary panels, tag backgrounds — warm off-white distinguishes layered surfaces from the pure-white page |
| Paper | `#ffffff` | Page background, button text on filled CTAs, icon foreground on dark surfaces |
| Sand | `#f2ede5` | Warm wash backgrounds, subtle highlight zones, section tints |
| Slate | `#3b3b3b` | Muted heading variant for secondary headlines and section labels |
| Ember | `#ff5f57` | Terminal traffic-light dot (red) — decorative accent inside code-block mocks only |
| Sunbeam | `#ffbd2e` | Terminal traffic-light dot (yellow), and the Beta pill background — the single warm accent that signals novelty |
| Sprout | `#28c840` | Terminal traffic-light dot (green) — decorative accent inside code-block mocks only |

## Typography

### universalSans — Primary UI typeface — used for nav, body, buttons, cards, labels, and inline links. The dual-weight scale (400 for copy, 500 for emphasis) is the sole hierarchy tool for running text. The negative tracking at small sizes tightens headlines without compressing readability.
- **Substitute:** Inter, system-ui
- **Weights:** 400, 500
- **Sizes:** 10, 11, 12, 13, 14, 16, 18
- **Line height:** 1.00–1.63
- **Letter spacing:** -0.025em at display, 0 at body

### universalSansDisplay — Editorial display face for H1/H2 only — set at near-100% line-height (-1.8px at 72px) to lock the type to a grid and create the confident, monolithic headline blocks. Weight 400 at 48–72px is the signature: headlines whisper rather than shout.
- **Substitute:** Söhne, GT America, Inter Display
- **Weights:** 400, 500
- **Sizes:** 24, 30, 48, 60, 72
- **Line height:** 1.00–1.33
- **Letter spacing:** -0.025em across the scale

### GeistMono — Technical monospace — terminal mockups, code snippets, metadata labels, tab labels (Python/TypeScript/cURL). Sets the developer-engineering tone; pairs against the universalSans to mark technical vs editorial voice.
- **Substitute:** Geist Mono, JetBrains Mono
- **Weights:** 400, 700
- **Sizes:** 10, 11, 12, 13
- **Line height:** 1.50–1.85
- **Letter spacing:** -0.01em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 20 | -0.12px |
| body-sm | — | — | 14px | 20 | 0px |
| body | — | — | 16px | 24 | — |
| heading-sm | — | — | 24px | 32 | -0.6px |
| subheading | — | — | 30px | 36 | -0.75px |
| heading | — | — | 48px | 48 | -1.2px |
| heading-lg | — | — | 60px | 60 | -1.5px |
| display | — | — | 72px | 72 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 12px

### Border Radius

- **cards:** 16px
- **pills:** 9999px
- **inputs:** 6px
- **buttons:** 9999px
- **smallCards:** 8px

## Components

### Filled Primary Button
**Role:** Main call-to-action

Background #0a0a0a, text #ffffff, radius 9999px, padding 12px 20px, font 14px/20 universalSans weight 500. Used for 'Get API Access', 'Start Building', 'Try for free'. The single high-contrast element on the page; no border, no shadow.

### Ghost Secondary Button
**Role:** Tertiary action

Background transparent, text #0a0a0a, radius 9999px, padding 12px 20px, font 14px/20 universalSans weight 500. Pairs directly beside a filled primary as the soft alternative. No visible border by default; hover adds 1px #d5d9e2 ring.

### Compact Nav Button
**Role:** Top-bar utility (Contact Sales)

Background #ffffff, text #0a0a0a, radius 9999px, padding 6px 12px, border 1px #d5d9e2. Smaller scale than hero buttons; sits in the sticky header alongside the filled primary.

### Beta Tag Pill
**Role:** Feature-release badge

Background #f2ede5 (warm wash), text #0a0a0a, radius 9999px, padding 2px 8px, font 12px universalSans weight 500. Used inline before a feature label ('Beta  Grok Voice Agent Builder'). The only colored pill in the system.

### Flat Cream Card
**Role:** Product showcase tile (Chat, Voice, Build, Imagine)

Background #f9f8f6, radius 8–16px (asymmetric — inner mockup radius differs from card radius), padding 0, no shadow, no border. Card holds a media element (code mockup, audio waveform, image) flush to its edges; the surface tone alone separates it from the page.

### Pricing Tier Card
**Role:** Large comparison panel

Background #f9f8f6, radius 16px, padding 40px on all sides, no shadow. Spacious interior with generous heading-to-body ratio. Uses universalSans weight 500 for tier name, weight 400 for spec lines.

### Terminal Code Block
**Role:** Developer-facing mockup (chat/code demos)

Background #151515, radius 12px, padding not standardized, font GeistMono 12–13px. Traffic-light dots (#ff5f57, #ffbd2, #28c840) sit top-left at ~8px. Syntax highlighting uses a muted code palette (#032f62 keys, #91c17a strings, #d73a49 errors) — these are mockup-internal, not system tokens.

### Language Tab Pill
**Role:** Code-snippet language switcher (Python/TypeScript/cURL)

Radius 9999px, padding 6px 12px, font 13px GeistMono. Active state: background #0a0a0a, text #ffffff. Inactive: background transparent, text #858585. Sits beneath code-block mocks.

### Navigation Link
**Role:** Top-nav menu item

Font 14px/20 universalSans weight 500, text #858585 default → #0a0a0a on hover, no underline, no background. Underline appears only on focus. Dropdown indicators (▾) drawn with stroke #858585.

### News Card
**Role:** Latest-news tile in 4-column grid

Background transparent (inherits page), no border, no radius, no padding. Image at top with default radius, then date meta in 11px universalSans weight 400 #858585, then title in 16px weight 500 #0a0a0a. The absence of a card surface is intentional — news feels like an index, not a gallery.

### Feature Stat Block
**Role:** Hero metric (1M+ API calls/day, <200ms median latency)

Large number 18px universalSans weight 400 #0a0a0a stacked above 11px label #9d9d9d. No card wrapper; sits inline within a feature column.

### Checklist Row
**Role:** Pricing-tier bullet line

UniversalSans 14px/20 weight 400 #0a0a0a. Leading check glyph in #0a0a0a stroke. Vertical stack with 8px row-gap; no dividers between rows.

## Do's and Don'ts

### Do
- Use #0a0a0a for the primary filled button — never substitute a chromatic CTA color; the system is intentionally monochrome
- Set all headlines (24px+) with letter-spacing -0.025em and line-height 1.0–1.33; lock them to the type grid rather than centring them visually
- Apply radius 9999px to every button, tag, and language tab; the pill is the system's signature shape
- Use #f9f8f6 for any surface that sits above the page; let the warm cream alone separate layers — avoid shadows
- Reach for GeistMono whenever content is technical (code, terminal, tabs, metadata); reserve universalSans for editorial and UI copy
- Keep the Beta pill to feature-release moments only (#f2ede5 background, 12px weight 500); do not introduce other accent pills
- Default to ghost/outlined buttons for any action that is not the page's single primary conversion

### Don't
- Do not use chromatic colors for buttons or links — the only saturated color on a page should be a single Beta pill or a terminal dot
- Do not stack shadows; the system uses a single hairline ring (1px solid #d5d9e2) as the sole depth cue
- Do not set body text below 14px or above 18px on screen; the type scale jumps from 18 → 24 → 30 → 48 to preserve hierarchy through size alone
- Do not add background colors to nav links, news cards, or inline list items — the page should read as quiet whitespace
- Do not use line-heights above 1.63 for running text; display headlines must stay at 1.0–1.33 to maintain the editorial lockup
- Do not introduce new radii; the system is binary — pills (9999px) or cream cards (16px), no intermediate rounding
- Do not use pure black (#000000) — always #0a0a0a; the slight lift keeps the dark surfaces on-brand warm rather than CRT-cold

## Elevation

- **Compact nav button, ghost button focus state:** `0 0 0 1px rgba(10, 10, 10, 0.15)`
- **Sticky header (on scroll):** `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)`
- **Elevated cream card (pricing, modal-like surfaces):** `0 0 0 1px rgba(0, 0, 0, 0.06), 0 18px 40px -24px rgba(15, 23, 42, 0.18)`

## Surfaces

- **Paper** (`#ffffff`) — Page background, modal canvas, inline white surfaces
- **Cream** (`#f9f8f6`) — Card surfaces, secondary panels, tag backgrounds — the dominant elevated layer
- **Sand** (`#f2ede5`) — Warm wash for highlight zones, Beta pill, subtle section tints
- **Charcoal** (`#151515`) — Inverted surface for code-block mocks, terminal demos — appears only inside product illustrations

## Imagery

Imagery is product-screenshot-driven, not lifestyle. The hero and feature tiles contain in-context product captures: a chat thread rendered as a UI mockup, a code editor with syntax-highlighted TypeScript, a voice waveform on a cream card, a code-snippet panel on a warm gradient backdrop. All product visuals sit inside flat cream containers with no rounded inner edges masking the media. Decorative warmth comes from large radial gradient orbs (peach/coral) that bleed behind code panels — blurred at 64px, they read as ambient glow rather than imagery. Photography is absent; the system is pure UI + illustration + gradient. Icons are stroke-based, 1.5px weight, Fog (#858585) by default with Jet (#0a0a0a) on hover. No 3D renders, no stock photography, no human figures.

## Layout

Layout is max-width centered (~1200px) on a full-bleed white canvas, with generous vertical rhythm (80px section gaps). The hero is text-first: a centered headline stack on white with two CTAs below, followed by a 2-column product-card row (Chat / Code) at comfortable density. Below the hero, the page alternates into single-column feature blocks (One API. Every modality.) with text-left and code-panel-right splits, then a 4-column news index, then a 2-column pricing/CTA tier. Navigation is a single sticky top bar (64px) with logo + horizontal menu + two right-aligned action buttons. The page never uses a sidebar; content density stays low. Cards are flat and borderless — the cream surface alone carries the grouping. The sticky header adopts a backdrop-blur (12px) and hairline bottom border on scroll.

## Similar Brands

- **Linear** — Same near-monochrome palette with one high-contrast filled pill CTA, and editorial-grade display headlines at near-100% line-height
- **Vercel** — Same black-pill-on-white hero button system and tight negative tracking on display type, with similar hairline-border depth cues
- **Anthropic** — Same warm-paper editorial tone with restrained color rationing and Geist-family type pairing for developer surfaces
- **Stripe** — Same pill-shaped CTA convention, near-flat card surfaces, and use of one vivid gradient orb as the sole chromatic punctuation
