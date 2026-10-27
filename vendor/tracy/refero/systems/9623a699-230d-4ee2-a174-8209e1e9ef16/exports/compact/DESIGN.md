# Relace — Style Reference
> Warm paper notebook with amber ink — an editor's desk, not a dashboard.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Relace operates as a warm-paper devtool: a cream canvas (#fffef2) rather than cold white, with a single rationed amber accent (#fcaa2d) that punctuates CTAs and inline highlights. Typography carries the entire personality — a distinctive geometric sans (Parabole Trial) with aggressively tight tracking at display sizes produces editorial-weight, left-aligned headlines, while a monospace (Decima Mono Pro) handles all UI chrome, version labels, and code. The system is radically sharp: 2px radii dominate, hairlines replace shadows, and structural black borders (#000000) define separation rather than elevation. Landscape photography with code overlays breaks the monochrome rhythm, and the single warm accent is reserved for moments that must land — never decorative.

## Colors

| Name | Value | Role |
|------|-------|------|
| Page Cream | `#fffef2` | Universal page background and card surface — the warm, almost unbleached paper that defines the entire visual temperature |
| Ink Black | `#191918` | Primary text color, dark surface fills, and code-window backgrounds — warm near-black, never pure optical black |
| Rule Black | `#000000` | Structural hairlines and borders — 1px lines that define cards, separate sections, and replace shadow as the elevation language |
| Warm Stone | `#75756f` | Muted body text, secondary borders, and inactive link states — a warm gray that recedes without going cool |
| Linen Beige | `#edece0` | Secondary elevated surface — warm light beige for tags, subtle background panels, and hover washes that lift off the cream canvas |
| Ash Gray | `#bab9b0` | Tertiary dividers and inactive UI elements — a mid-warm gray for the lightest structural lines |
| Amber Signal | `#fcaa2d` | Yellow outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Parabole Trial — Primary typeface across all display, heading, and body contexts. Regular weight 400 carries body and display; Medium 500 handles subheadings (20px) and emphasis captions (14px). The aggressively tight tracking at large sizes (-0.05em at 64px) is a signature choice — display headlines compress into a confident block rather than spreading airy. Substitute: 'Instrument Sans' or 'Space Grotesk' from Google Fonts for the closest free match to Parabole's geometric character
- **Substitute:** Instrument Sans
- **Weights:** 400, 500
- **Sizes:** 14px, 20px
- **Line height:** 1.06–1.50
- **Letter spacing:** -0.0500em at 64px → -0.0400em at 40px → -0.0500em at 36px → -0.0300em at 20px → -0.0400em at 18px → -0.0400em at 16px → -0.0300em at 14px

### Decima Mono Pro — Monospace for all UI chrome: version labels, timeline ticks, navigation micro-text, code blocks, badge labels, and tag metadata. The slight positive tracking (0.03–0.04em) at small sizes is anti-default — monospace usually tightens at small sizes, but this opens up to read clearly as inline UI text. Substitute: 'JetBrains Mono' or 'IBM Plex Mono'
- **Substitute:** JetBrains Mono
- **Weights:** 400
- **Sizes:** 10px, 12px, 16px
- **Line height:** 1.10–1.20
- **Letter spacing:** 0.0400em at 10px → 0.0300em at 12px → 0.0300em at 16px

### Parabole Trial Regular Text — Parabole Trial Regular Text — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px, 12px, 16px, 18px, 36px, 40px, 64px
- **Line height:** 1.1, 1.2, 1.5
- **Letter spacing:** -0.05, -0.04, 0.04

### Parabole Trial Regular Display — Parabole Trial Regular Display — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 36px, 40px, 64px
- **Line height:** 1.1
- **Letter spacing:** -0.05, -0.04

### Karla — Karla — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| mono-xs | — | — | 10px | 1.2 | 0.4px |
| mono-sm | — | — | 12px | 1.2 | 0.36px |
| caption | — | — | 14px | 1.5 | -0.42px |
| body-sm | — | — | 16px | 1.5 | -0.64px |
| body | — | — | 18px | 1.5 | -0.72px |
| subheading | — | — | 20px | 1.06 | -0.6px |
| heading | — | — | 36px | 1.1 | -1.8px |
| heading-lg | — | — | 40px | 1.1 | -1.6px |
| display | — | — | 64px | 1.1 | -3.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40-60px
- **Card padding:** 20-40px
- **Element gap:** 8-20px

### Border Radius

- **cards:** 2px
- **icons:** 800px
- **badges:** 800px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Amber CTA Button
**Role:** Primary action trigger — the only filled button in the system

Filled #fcaa2d background, #191918 or #000000 text, 2px border-radius, 10px 20px padding. Label in Decima Mono at 12px (0.04em tracking) or Parabole Medium at 14px. Often paired with a small ↗ arrow icon. No hover state elevation — the design trusts color to communicate action, not depth.

### Ghost Outline Button
**Role:** Secondary action paired with the amber CTA

Transparent or #fffef2 background, 1px #000000 border, #191918 text, 2px border-radius, 10px 20px padding. Same label typography as the amber button. Functions as the 'lighter weight sibling' in button pairs — never standalone.

### Navigation Bar
**Role:** Sticky top header across all pages

Full-width #fffef2 background, ~60-80px height, 1px #000000 bottom border. Logo lockup left (small square icon + 'Relace' wordmark in Parabole), nav links in Parabole 16px left-of-center, amber CTA button + 'APP' text link far right. Generous horizontal padding (~40px) keeps the bar breathing.

### Hero Headline
**Role:** Above-the-fold display headline

64px Parabole Regular, #191918, tracking -3.2px, line-height 1.10, left-aligned. Sits beside a ~400px right-column of body text and CTA pair. Never centered — the editorial left-align is a brand-defining choice that separates Relace from typical SaaS hero conventions.

### Section Header with Inline Accent
**Role:** Mid-page section titles with a single amber word

Display or heading-lg Parabole, left-aligned, where one word switches to #fcaa2d color mid-sentence (e.g. 'Get started in minutes'). The amber word is the same size and weight as the surrounding text — it earns attention purely through color, not size or weight change.

### Code Window with Image Overlay
**Role:** Product showcase — code floating over a landscape photograph

Dark #191918 window with 3 traffic-light dots top-left, 12px Decima Mono code with syntax highlighting (keywords amber/white, strings green-tinted, comments muted), positioned over a full-bleed warm landscape image. The code window has 2px radius and no shadow — it sits ON the image as a flat overlay, not floating above it.

### Horizontal Timeline Strip
**Role:** Version or milestone visualization

Full-width band with dense vertical tick marks (hundreds of small 1px lines), short amber tick markers at key positions, version labels in 10px Decima Mono at corners (e.g. 'v3.001', 'v3.851'). The density of tick marks is the visual hook — it looks like a ruler or printer's registration mark, not a typical progress bar.

### Concentric Circles Diagram
**Role:** Feature or capability explanation graphic

Three nested circles with thin #000000 borders, innermost solid #75756f, outer two #edece0 and transparent fills. Labels in 12px Parabole sit outside each ring. A small stylized logo glyph sits in the center. 2px radius on any hard edges.

### FAQ Accordion Item
**Role:** Expandable Q&A list

Full-width row, 20px 40px padding, 1px #000000 bottom border separating items, question text in 16-18px Parabole left-aligned, '+' icon in 20px right-aligned. Expanded state reveals answer text below at 16px body. No background change on hover — the border IS the interaction affordance.

### Brand Trust Strip
**Role:** Social proof row of customer/partner logos

Horizontal row of grayscale brand logos (desaturated, ~60% opacity), preceded by a small mono label 'Trusted by the best leading brands' in 12px Decima Mono. Logos sit on the cream canvas with generous spacing (~40-60px gaps), no dividers between them.

### List Item with Left Accent Border
**Role:** Feature list or navigation list item

Left-aligned text with a 2px #fcaa2d vertical bar on the left edge (8-20px tall), 20px 40px padding, 16-18px Parabole text. The amber bar replaces traditional bullet points or icons — it is the only chromatic element in the list.

### Pill Badge
**Role:** Tags, status indicators, and category labels

800px (fully rounded) border-radius, #edece0 or #fcaa2d background, 10px 16px padding, 10-12px Decima Mono text at 0.04em tracking. Used sparingly — only for genuine metadata labels, not decorative chips.

## Do's and Don'ts

### Do
- Use #fffef2 for every page and card background — never #ffffff or any cool neutral
- Set display heading tracking to -0.05em (-3.2px at 64px) to compress headlines into confident blocks
- Use #fcaa2d exclusively for filled CTAs, single inline accent words in headlines, and left-border list indicators
- Apply 2px border-radius to all rectangular components — buttons, cards, inputs, code windows
- Use Decima Mono (or JetBrains Mono substitute) for all UI chrome: version labels, timestamps, metadata tags, and code
- Separate sections with 1px #000000 hairlines rather than background color shifts or shadows
- Left-align all headlines and body text — the editorial left-flow is a brand-defining layout choice

### Don't
- Never use #ffffff as a background — the warm cream canvas is the brand's visual temperature
- Do not round corners beyond 2px on rectangular components; reserve 800px only for badges and icon containers
- Do not use #fcaa2d for body text, large background areas, or decorative fills — it is rationed for action and single-word emphasis only
- Never add drop shadows or box-shadows — the design uses lines, not depth, for separation
- Do not use cool grays, blues, or any non-warm neutrals — the entire palette is warm-toned
- Do not center headlines or use centered text blocks — left-alignment is non-negotiable
- Do not use system sans-serif (Arial, Helvetica) for headlines — always use Parabole or a geometric sans substitute at tight tracking

## Elevation

Relace uses 1px #000000 hairline borders as its sole separation language. There are no drop shadows, no layered surfaces, and no z-axis elevation — the design is deliberately flat. Structure comes from line weight, not from shadow depth. This is an intentional choice: the editorial paper aesthetic would be broken by any sense of digital depth or floating panels.

## Surfaces

- **Canvas** (`#fffef2`) — Page-wide background — the warm paper field everything sits on
- **Linen** (`#edece0`) — Subtle elevated wash for tags, secondary panels, and quiet hover states
- **Ink** (`#191918`) — Code windows, dark feature blocks, and high-contrast content surfaces
- **Amber** (`#fcaa2d`) — Accent surface for filled CTAs, active indicators, and brand-colored highlights

## Imagery

Photography appears as full-bleed landscape bands — warm-toned outdoor scenes (grasslands, mountains at golden hour) that break the monochrome text rhythm at major section transitions. Images always carry a dark code-window or UI element overlaid on top, creating a 'nature interrupted by interface' juxtaposition. Treatment is unfiltered, natural-color, no duotone or color grading. Product screenshots are absent — all visual storytelling is done through code overlays and abstract diagrams (concentric circles, timeline strips) rather than product UI captures. Icons are minimal: a small square logo glyph, ↗ arrows on CTUs, and a few line-style indicators. No illustration or 3D rendering.

## Layout

Max-width 1200px centered content with generous left/right padding (~40px). Header is full-width sticky with bottom border. Hero is a two-column split: left 60% headline, right 40% body text + CTA pair, no hero image. Sections are left-aligned stacks — never centered text blocks. Content rhythm alternates between text-only sections and full-bleed image bands, creating a breathing pattern of compressed text and wide visual resets. FAQ and feature lists use full-width single-column rows. No card grids, no masonry, no multi-column feature matrices — the layout stays in 1-2 column editorial flows.

## Similar Brands

- **Anthropic** — Same warm cream backgrounds, editorial left-aligned headlines, and rationed single-color accent strategy against a muted neutral canvas
- **Linear** — Same sharp 2px radii, hairline-border separation, and monochrome-first approach with a single vivid accent reserved for action
- **Vercel** — Same geometric sans typography with tight tracking at display sizes, monospace for UI chrome, and flat no-shadow design language
- **Stripe** — Same left-aligned editorial layout flow, generous whitespace between sections, and confident typographic hierarchy as the primary visual tool
