# Henry — Style Reference
> darkroom gallery at midnight — measured, restrained, photograph-centric

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Henry operates in a near-monochrome dark world: a coal-black canvas interrupted by a single dramatic landscape photograph in the hero, and absolutely nothing else competing for attention. Typography does the heavy lifting — NB International Pro at whisper-light 300 weight for headlines (including a staggering 204px display) creates editorial confidence that monochrome palettes usually can't achieve, while tight -0.02em tracking keeps even the giant display sizes from feeling loose. The interface language is deliberately quiet: pill-shaped white CTA against black, hairline warm-gray borders (the #d4d0c9 family is the only chromatic deviation from pure neutral), translucent dark surfaces stacked in barely-perceptible layers. Color is rationed — appearing only as small functional punctuation in stat numbers and product UI cards. Components are flat, border-driven, and dense rather than spacious. The whole system feels like a high-end editorial magazine that happens to sell enterprise software.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary canvas, page background, base borders — the absolute ground zero of the visual system |
| Carbon | `#141414` | Card and elevated surface background, subtle border tint — the first lift off pure black |
| Tar | `#0c0c0c` | Deep surface fill for nested elements, icon containers — sits between canvas and card |
| Bone | `#d4d0c9` | Light neutral action fill for buttons on dark surfaces. |
| Ash | `#878581` | Muted body text, secondary headings, low-emphasis borders — warm mid-gray companion to Bone |
| Smoke | `#615f5c` | Tertiary borders, disabled states, link underlines in rest position — the lowest visible neutral |
| Pearl | `#d9d9d9` | Cool-toned secondary text, icon fills on hover, light surface highlights |
| Graphite | `#a1a1a1` | Supporting text and icon borders, mid-weight border emphasis |
| Chalk | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### NB International Pro — Primary typeface across all contexts. The 300 weight for headlines is the signature choice — most enterprise brands shout at 700; Henry whispers at 300 and achieves more authority. The 204px display weight 400 with tight tracking is unmistakably editorial, treating the product name like a magazine cover. NB International Pro's geometric humanist forms carry warmth without friendliness — it is NB Studio's workhorse, not a generic grotesque.
- **Substitute:** Inter (300/400/500) for web, with a geometric humanist fallback
- **Weights:** 300, 400, 500
- **Sizes:** 10, 14, 15, 16, 20, 24, 32, 64, 96, 204
- **Line height:** 1.00–1.71
- **Letter spacing:** -0.02em (body), up to -0.037em (display)

### NB International Pro Mono — Used at 10px for metadata, tags, and technical annotations in the product UI mockup — the mono variant signals 'this is a system label, not marketing copy'
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 10
- **Line height:** 1.20

### Inter — Secondary UI font for dense body contexts, form labels, and table-like content. Inter's wider x-height handles small sizes better than NB International Pro. The -0.037em tracking at 12px compensates for Inter's tendency to look loose at caption sizes.
- **Substitute:** System sans-serif stack
- **Weights:** 400, 500, 600
- **Sizes:** 12, 14, 16
- **Line height:** 1.14–1.50
- **Letter spacing:** -0.037em to -0.006em (tightens aggressively at smaller sizes)

### NB International Pro Light — NB International Pro Light — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 14px, 16px, 64px
- **Line height:** 1, 1.5, 1.71
- **Letter spacing:** -0.02

### NB International Pro Regular — NB International Pro Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px, 14px, 15px, 16px, 20px, 24px, 32px, 64px, 96px, 204px
- **Line height:** 1, 1.14, 1.2, 1.25, 1.33, 1.43, 1.5
- **Letter spacing:** -0.02

### NB International Pro CG Medium — NB International Pro CG Medium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 14px, 15px
- **Line height:** 1.33, 1.43
- **Letter spacing:** -0.02

### NB International Pro CG Mono — NB International Pro CG Mono — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.5 | -0.28px |
| body | — | — | 16px | 1.5 | -0.32px |
| subheading | — | — | 20px | 1.33 | -0.4px |
| heading-sm | — | — | 24px | 1.25 | -0.48px |
| heading | — | — | 32px | 1.2 | -0.64px |
| heading-lg | — | — | 64px | 1 | -1.28px |
| display | — | — | 96px | 1 | -1.92px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 2px
- **cards:** 10px
- **icons:** 6px
- **inputs:** 6px
- **buttons:** 100px

## Components

### Pill CTA Button (Filled)
**Role:** Primary call-to-action in navigation and hero

White fill (#ffffff), black text, 100px border-radius, 8px 12px padding, NB International Pro weight 500 at 12-14px. The only fully opaque white element on dark surfaces — functions as a beacon. Sits beside a single square icon button (sun/snowflake toggle) at 28-32px with no border, pure white.

### Ghost CTA Button
**Role:** Secondary call-to-action paired with primary CTA

Transparent background, 1px border in #615f5c (Smoke), text in #d4d0c9 (Bone), 100px radius, 8px 12px padding, NB International Pro weight 500 at 12-14px. Subtly present — the border is the lowest visible neutral, so the button whispers rather than competes.

### Navigation Bar
**Role:** Top-of-page navigation, sticky

Transparent background over hero, flush with page edges. Logo 'aiwork' in NB International Pro weight 400 at ~14-16px, all lowercase, white. Nav links at 12px weight 400, white, separated by ~24px gap. Right side clusters secondary links then a white pill CTA. No visible border or background — relies on the hero image behind it for separation.

### Integration Logo Chip
**Role:** Display partner/tool integrations in a horizontal row

Transparent background, contains brand logo + product name in 12px NB International Pro weight 400, Bone text color. Arranged in a single row with ~32-48px gaps. Used to communicate breadth of integration without visual noise — no card containers, no borders, just logos on canvas.

### Skill Card
**Role:** Display actionable AI worker skills in a card grid

Carbon (#141414) background, 10px border-radius, 1px border in #d4d0c9 at ~10-15% opacity, 16-20px padding. Header: small app icon (6px radius) + skill title in NB International Pro weight 400 at 14-16px, Bone text. Description in Ash (#878581) at 14px. Bottom-right shows related app icons. No shadow, no hover lift — flat and functional.

### Stat Card
**Role:** Display quantitative proof points in the results section

Transparent or Carbon background, no visible border. Large percentage number (70%, 10%, 50%) at 32-48px in NB International Pro weight 400. Accent color appears as a left vertical bar: green (#1fe274), blue (#00a8f0), orange (#ff9634) — these are the only places chromatic color appears at structural scale. Label in 16-20px Bone below.

### Product UI Card (Chat/Mission Panel)
**Role:** Show product functionality via embedded mockup

White (#ffffff) background — the only light surface in the dark system, making it pop as a product artifact. 6-10px border-radius. Contains nested rows: user avatar circle + name in NB International Pro, status badges with small colored dots, action buttons with 100px radius pills. The inversion from dark to white inside this card is the system's primary visual trick — it signals 'this is a screenshot, not chrome'.

### Section Tag/Pill
**Role:** Small uppercase category label above section headings

No background, no border. NB International Pro Mono at 10px, uppercase, letter-spacing normal, Ash (#878581) color. Renders as plain text — no chip styling. Appears centered above section headlines (e.g. 'READY', 'SKILL', 'PROOF'). The monospaced treatment makes it feel like a print section marker, not a UI badge.

### Hero Headline
**Role:** Primary product announcement at the top of the page

NB International Pro weight 300 (Light), 64-96px, white (#ffffff), line-height 1.0, letter-spacing -0.02em to -0.037em. Centered over a full-bleed landscape photograph. The 300 weight at this scale is the system's boldest decision — it requires confidence to make 64px text feel light. Often split into two lines: product name on line 1, descriptor on line 2.

### App Icon Tile
**Role:** Small icon representation for third-party integrations

6-8px border-radius, 24-32px square, contains brand logo. No background fill — transparent over canvas. Sometimes appears in a row at the bottom of a skill card to show related apps.

## Do's and Don'ts

### Do
- Use NB International Pro weight 300 for all headlines — the whisper-light approach is the signature; weight 400 is acceptable for body, never 600+ for display
- Apply 100px border-radius to all buttons, action chips, and interactive pills — this pill shape is non-negotiable
- Reserve #ffffff (Chalk) for filled CTA buttons and the product mockup card only — everywhere else, use #d4d0c9 (Bone) for text
- Use 10px border-radius for skill cards and content surfaces, 6px for icons and image thumbnails
- Keep letter-spacing at -0.02em for body text (16px and below), tightening to -0.037em at display sizes 64px+
- Center section headlines and let generous 80px section gaps create vertical breathing room between content blocks
- Let the warm-gray #d4d0c9 family carry all text and border work — never introduce a cool blue-gray

### Don't
- Do not use weight 600+ for any heading — the 300-400 range is the system's voice; bold breaks the editorial register
- Do not add drop shadows beyond the whisper-soft 1px lift — no card hover elevations, no dramatic depth
- Do not use the chromatic accent colors (green, blue, orange, violet) outside the stat card context — they are rationed, not decorative
- Do not introduce additional surface colors beyond the three-layer stack (#000000 → #0c0c0c → #141414)
- Do not use solid colored backgrounds for cards or sections — the entire system is flat over near-black
- Do not break the pill convention by using sharp or 4px-radius buttons — 100px is mandatory for all interactive elements
- Do not use sans-serif system fonts as the primary face — NB International Pro's humanist warmth is the brand

## Elevation

- **Floating product mockup card:** `rgba(20, 21, 26, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Obsidian Canvas** (`#000000`) — Page-level background, hero image container, full-bleed sections
- **Tar Recess** (`#0c0c0c`) — Icon containers, nested inset elements, first surface lift
- **Carbon Card** (`#141414`) — Skill cards, product mockup surfaces, stat card backgrounds — the workhorse surface

## Imagery

Imagery is rationed to one asset: a single dramatic landscape photograph in the hero — golden-hour mountains with rolling green hills and dramatic cloud formations, evoking scale and exploration. This is the only full-bleed photograph on the entire site; it functions as a brand signature rather than decoration. All other visual content is product UI mockups (white cards embedded on dark canvas) and small third-party brand logos. The photography treatment is high-saturation, warm-toned, natural light — no duotone, no overlays, no masks. The contrast between this warm photographic moment and the cold dark chrome around it is intentional: the product enters a human world.

## Layout

Full-bleed hero with centered text overlay on landscape photograph, then a max-width 1200px content frame for all subsequent sections. Navigation is transparent and flush to edges — no contained bar. Sections alternate between centered text blocks and left-aligned card grids, with generous 80px vertical gaps. The integration row is full-width with logos spaced evenly. Skill cards appear in a 3-column grid with equal-width cards. Stats section uses a 3-column grid where each stat has a colored vertical bar on the left. The product mockup card breaks out of the grid, floating slightly with 1px shadow. Overall rhythm: dramatic visual → quiet text → dense functional grid → quiet text → dramatic stats.

## Similar Brands

- **Linear** — Same commitment to a near-black canvas with whisper-light typography and tight letter-spacing; both ration color to functional moments only
- **Vercel** — Dark-mode-first enterprise dev tool with dramatic full-bleed imagery in the hero and monochrome surface system with hairline borders
- **Stripe** — Editorial typography approach with tight tracking at large display sizes, warm-gray neutrals, and the same instinct to let one large image carry the hero
- **Anthropic** — Restrained monochrome palette, generous section spacing, and product-first surface treatment with minimal chrome
- **Runway** — Dark editorial canvas with dramatic photography and a single muted warm-white text color carrying the entire typographic system
