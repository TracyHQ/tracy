# Timescale — Style Reference
> Engineering blueprint on warm graph paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Timescale speaks the language of infrastructure diagrams: a warm off-white canvas with subtle grid texture, bold orange statement type that functions as a visual highlighter, and monospace numerals that feel like terminal readouts. The palette is almost entirely achromatic with exactly two chromatic punctuation marks — vivid orange for voice and chartreuse for spotlight — so color always carries intent rather than decoration. Typography is structural and dual: Geist handles interface voice while Geist Mono handles numbers, codes, and emphasis, creating a constant productive tension between the conversational and the computational. The neo-brutalist hard offset shadow (5px 5px 0px solid black) on cards and the pill-shaped CTAs give the system a tactile, blueprint-on-graph-paper quality — engineered, not decorated.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Orange | `#ff5b29` | Headline accent, large stat numerals, emphasis spans, decorative borders — the only color with voice, used to make key phrases feel switched on against the monochrome canvas |
| Chartreuse Highlight | `#f5ff80` | Announcement bars, highlighted callout blocks, featured chip backgrounds — acts as a spotlight wash, never a CTA fill, drawing the eye to time-sensitive or notable content |
| Carbon Black | `#000000` | Primary text, filled button backgrounds, hairline borders, hard offset shadows, icon strokes — the dominant structural color, used at scale for borders and dividers |
| Paper White | `#fafafa` | Page canvas, card surfaces, button text on dark fills — warm off-white, never pure #fff, giving the whole system a printed-paper warmth |
| Graphite | `#242424` | Dark surface variant for inverted sections and elevated panels — a softer black for areas that need depth without going fully dark |
| Steel | `#6c6c6c` | Secondary text, subdued labels, muted helper copy, and shadow tints — the first step down from black when text needs to recede |
| Ash | `#b3b3b3` | Tertiary text, disabled states, placeholder copy, very light dividers — the lightest functional gray before content disappears entirely |

## Typography

### Geist — Primary interface and heading typeface — used for navigation, body copy, button labels, and hero headlines. Weight 600 for headings, 400 for body, 700 for the largest display. Negative tracking tightens the type as size grows, creating a dense, engineered feel.
- **Substitute:** Inter
- **Weights:** 400, 600, 700
- **Sizes:** 14, 16, 18, 20, 24, 52, 80
- **Line height:** 1.10, 1.33, 1.40, 1.43, 1.50, 1.56
- **Letter spacing:** -0.03em at 52px+, -0.02em at 18-24px

### Geist Mono — Technical and numerical typeface — reserved for large stat readouts, inline code, API references, and any text that should feel computed or terminal-generated. The dual-font system (Geist for voice, Geist Mono for numbers) is a signature: it means stats always feel like live data, not marketing copy.
- **Substitute:** JetBrains Mono
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14, 16, 20, 24, 28, 40, 50
- **Line height:** 1.10, 1.20, 1.33, 1.40, 1.43, 1.50
- **Letter spacing:** -0.02em

### ui-sans-serif (system fallback) — System fallback for rendering edge cases — not a design choice, just coverage
- **Weights:** 400, 600
- **Sizes:** 16
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 20 | — |
| body | — | — | 16px | 24 | — |
| subheading | — | — | 18px | 25 | -0.02px |
| heading-sm | — | — | 20px | 28 | -0.02px |
| heading | — | — | 24px | 33 | -0.02px |
| heading-lg | — | — | 52px | 57 | -0.03px |
| display | — | — | 80px | 88 | -0.03px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40-56px
- **Card padding:** 16-24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **links:** 8px
- **buttons:** 9999px
- **smallButtons:** 4px

## Components

### Announcement Bar
**Role:** Site-wide notification strip

Full-width band with #f5ff80 chartreuse background, Geist 14px weight 400, Carbon Black text, centered content. No border, no radius. Padding 8px top/bottom. Used sparingly — only for genuinely time-sensitive or notable announcements.

### Navigation Bar
**Role:** Top-level site navigation

Paper White background with thin #000 bottom border (1px). Logo left, nav links in Geist 16px weight 400, right side has a stats badge (Geist Mono), ghost login link, and a black filled CTA button. Height approximately 64px. No shadow.

### Hero Section
**Role:** Primary landing message

Paper White canvas with a subtle dot/grid pattern overlay. Two-column layout: left has eyebrow text in Geist Mono uppercase tracking-wide, headline in Geist 52-80px weight 600 in Signal Orange with a faded 'echo' word behind in reduced opacity, Geist 18px body, and two CTAs side by side. Right has a technical isometric illustration in black line art on Paper White.

### Filled Primary Button
**Role:** Primary call to action

Carbon Black (#000) background, Paper White text, Geist 16px weight 600, 9999px pill radius, 10px vertical / 16-24px horizontal padding. Uppercase tracking not applied — sentence case. Hard hover: slight translate or no change. The black fill is the strongest visual anchor on any page.

### Outlined Secondary Button
**Role:** Secondary action

Transparent background, 1.5-2px Carbon Black border, Carbon Black text, Geist 16px weight 600, 9999px pill radius, 10px vertical / 16-24px horizontal padding. Sits next to the filled CTA in hero patterns.

### Logo Strip
**Role:** Social proof band

Row of partner/customer logos on Paper White, logos rendered in grayscale or single-color Carbon Black. Geist Mono 14px uppercase caption 'TRUSTED BY...' above, separated by a thin hairline border from adjacent sections.

### Stats Banner
**Role:** Quantitative proof block

Card with 12px radius, 1px Carbon Black border, and the signature 5px 5px 0px #000 hard offset shadow. Interior divided into columns by vertical hairline borders. Stats rendered in Geist Mono 40-50px weight 700 in Signal Orange, with Geist Mono 14px uppercase weight 400 Carbon Black labels beneath. Dense, terminal-like feel.

### Feature Card
**Role:** Product capability highlight

Paper White surface, 12px radius, 1px Carbon Black border, 5px 5px 0px #000 hard offset shadow. Padding 20-24px. Icon at top in Carbon Black stroke (outlined, ~1.5px stroke weight). Title in Geist 20px weight 600, body in Geist 16px weight 400. Arranged in 2-3 column grids.

### Integration Icon Grid
**Role:** Ecosystem showcase

Grid of circular containers (9999px radius), each ~56-64px diameter, 1px Carbon Black border, containing a partner logo in its brand colors. Arranged in a wrapping grid with 12px gap. The circles echo the pill-button shape language at a smaller scale.

### Enterprise Feature List
**Role:** Security/compliance detail block

Vertical stack of rows. Each row: Carbon Black icon (24px, outlined) left, then title in Geist 18px weight 600, body in Geist 16px weight 400 Steel (#6c6c6c). 16-24px vertical gap between rows. No card wrapper — sits directly on the section background.

### Section with Grid Pattern
**Role:** Content section background

Paper White with a subtle dot-grid or line-grid pattern overlay (dots at 1px Carbon Black at ~5% opacity, 20px spacing). Creates a graph-paper texture that reinforces the engineering blueprint metaphor. Applied to most content sections.

### Text Input
**Role:** Form input

Paper White background, 1px Carbon Black border, 4px radius, 12-16px padding. Geist 16px text. No focus glow — just a thicker border or a solid black outline on focus. Placeholder in Ash (#b3b3b3).

### Pill Tag / Badge
**Role:** Category or status indicator

9999px radius, Paper White background, 1px Carbon Black border, Geist Mono 12-14px uppercase weight 500 Carbon Black text, 4px vertical / 10px horizontal padding. Small and technical — feels like a version tag or a label sticker.

## Do's and Don'ts

### Do
- Use Signal Orange (#ff5b29) only for emphasis — headline words, stat numerals, decorative borders — never for backgrounds, body text, or non-emphasis UI
- Apply Geist Mono to all large numbers, stat readouts, and inline code references; use Geist for everything else
- Give every elevated card the 5px 5px 0px #000 hard offset shadow — soft blurred shadows break the blueprint metaphor
- Set all pill buttons and tags to 9999px radius, small action buttons to 4px radius, and cards to 12px radius — these three values are the system's full radius vocabulary
- Maintain the dual-color discipline: #ff5b29 for voice, #f5ff80 for highlight, and pure achromatic for everything else
- Use the grid-pattern background on content sections to reinforce the engineering aesthetic — solid white sections feel unfinished
- Keep letter-spacing tight: -0.03em at 52px+, -0.02em at 18-24px, normal below — the type should feel dense and structural

### Don't
- Don't add gradients, glassmorphism, or soft diffused shadows — the system is flat and hard-edged by design
- Don't use Signal Orange for CTA button fills or link text — orange is voice, not action; black fills are action
- Don't use a third chromatic color — the orange/chartreuse/achromatic trinity is the full palette
- Don't mix Geist and Geist Mono within the same text run — pick one per block and let the contrast between blocks create rhythm
- Don't round cards to anything other than 12px, or buttons to anything other than 4px (small) or 9999px (pill) — other radii look out of system
- Don't use pure #ffffff for backgrounds — always #fafafa to maintain the warm paper feel
- Don't apply colored shadows or tinted glows — all shadows are pure black, solid, and offset

## Elevation

- **Feature Card, Stats Banner:** `rgb(0, 0, 0) 5px 5px 0px 0px`
- **Floating elements, tooltips:** `rgba(0, 0, 0, 0.6) 0px 3px 4px 0px`

## Surfaces

- **Paper White** (`#fafafa`) — Page canvas, section backgrounds
- **Card White** (`#fafafa`) — Card surfaces sitting on the canvas, often with hard offset shadow
- **Chartreuse Wash** (`#f5ff80`) — Announcement bar, highlighted callout blocks
- **Carbon Panel** (`#000000`) — Inverted sections, dark feature panels
- **Graphite Panel** (`#242424`) — Softer dark variant for elevated dark surfaces

## Imagery

Imagery is minimal and technical: black-line isometric illustrations of infrastructure components (database blocks, data flow arrows, storage units) rendered in an engineering-drawing style on Paper White backgrounds. The illustrations use thin uniform stroke weights and occasional stipple/shading textures. No photography, no lifestyle imagery, no abstract gradients. The hero illustration sits in a card with the hard offset shadow. Integration partner logos appear in small circular frames. The overall visual density is low — text and structured data dominate, illustrations serve as conceptual diagrams rather than decoration.

## Layout

Max-width 1200px centered content within sections that are full-bleed. The hero is a two-column split: left for text (eyebrow + headline + body + dual CTAs), right for a technical illustration. Sections alternate between Paper White and subtle grid-pattern backgrounds, separated by hairline borders or generous 40-56px gaps. Stats are presented in a wide banner card. Feature grids use 2-3 column layouts. Integration showcases use wrapping icon grids. Navigation is a flat top bar with no sticky behavior visible. The overall rhythm is spacious but structured — breathing room comes from section gaps, not internal padding.

## Similar Brands

- **Vercel** — Same Geist typeface family, same ultra-clean light-mode aesthetic, and same restraint with color — though Vercel uses more photography while Timescale stays technical with line illustrations
- **Supabase** — Same developer-infrastructure audience and neo-brutalist hard-shadow card treatment, though Supabase leans more colorful with its green brand
- **Linear** — Same monospace-meets-sans typographic system for numbers and UI, same achromatic-dominant palette, and same hard-edged geometric component style
- **Plausible Analytics** — Same warm off-white canvas, same single-accent-color discipline, same generous use of monospace for stats and data readouts
- **Railway** — Same engineering-blueprint aesthetic with grid textures, same bold typographic statements, same monospace numerals for infrastructure-scale stats
