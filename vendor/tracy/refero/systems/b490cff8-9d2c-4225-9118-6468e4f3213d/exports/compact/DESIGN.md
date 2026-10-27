# TheyDo — Style Reference
> Blush editorial spread with magenta confetti. Warm pink paper, serif headlines, a single hot-pink accent that only outlines and whispers — never shouts.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

TheyDo reads as an editorial product page printed on warm blush paper: a soft #fce7f3 canvas (never cold white) carries a confident serif headline (Wulkan) that pairs with a pragmatic sans (DM Sans) for body and UI. The visual identity is built on a single saturated hot-pink (#e82183) used exclusively as outline, stroke, and italic accent — never as a filled surface — which keeps the interface calm while still feeling branded. Floating magenta diamond motifs (echoing the TheyDo logo mark) scatter across the hero like confetti, establishing a playful geometry that recurs in card borders and section dividers. Components are flat and border-driven: 8px corners, 1px hairline rules (#c6c3c3 or pink tints), no shadows, and dark charcoal filled buttons (#131110) as the single primary action. The rhythm is generous — 80px between sections, 15–20px within cards — producing a spacious, magazine-like cadence rather than a dense SaaS dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Blush Paper | `#fce7f3` | Primary page canvas, hero washes, and large background blocks — the warm off-white that replaces cold #ffffff in most full-page contexts |
| Pure White | `#ffffff` | Card surfaces, button text on dark fills, and the contrast layer that sits on top of the blush canvas inside containers |
| Charcoal Ink | `#131110` | Primary text, filled primary-action buttons (Get a demo, Explore Ask TheyDo), and the nav's dark CTA — the heaviest value in the system |
| Black | `#000000` | Secondary text color, icon strokes, and sharp typographic accents where maximum weight is needed without warmth |
| Graphite | `#56504d` | Body text, nav labels, and list copy — slightly warmer than pure black, carries the paragraph voice |
| Stone | `#7b7674` | Muted helper text, secondary link color, and disabled-state labels — the quietest text tier |
| Smoke | `#888381` | Tertiary body and caption text — barely darker than Stone, used for timestamp-style metadata |
| Ash | `#625c5b` | Deep muted text for sub-labels and fine print |
| Hairline | `#c6c3c3` | The dominant border color (2,700+ occurrences) — 1px dividers, card edges, list separators, link underlines. The structural skeleton of every layout |
| Mist | `#e8e8e8` | Secondary card borders and subtle internal dividers where Hairline would feel too heavy against the blush canvas |
| Magenta Pop | `#e82183` | The single brand accent — italic headline words, decorative diamond strokes, icon outlines, and outlined/ghost action borders. Never used as a filled surface or background |
| Rose Whisper | `#fad6e9` | Pink-tinted card borders that carry the magenta family into container edges without the visual weight of the vivid hue |
| Rose Glow | `#f9b4db` | Mid-saturation pink border accent for highlighted cards and decorative borders that need more presence than Rose Whisper |

## Typography

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 15px, 16px
- **Line height:** 1.2, 1.25, 1.5

### Wulkan — Display and heading serif — carries the editorial voice. Used for hero headlines, section titles, and large numerical callouts. The aggressive negative tracking (-0.035em at 72px) makes the letterforms lock together into a sculpted block rather than a loose paragraph. Wulkan is custom; a close substitute is GT Super or Tobias.
- **Substitute:** GT Super (Bold) or Tobias
- **Weights:** 400, 500
- **Sizes:** 19px, 24px, 32px, 36px, 40px, 48px, 60px, 72px
- **Line height:** 1.10–1.25
- **Letter spacing:** -0.035em at 72px → -0.004em at 19px (tighter as size grows)

### DM Sans — Body, UI, and navigation sans-serif — the workhorse. Paragraph copy at 16–18px/400, nav labels and buttons at 14–15px/500, and bold emphasis at 600–700. The tight tracking even at small sizes gives the UI a crisp, intentional feel rather than a relaxed default.
- **Substitute:** Inter or General Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14px, 15px, 16px, 17px, 18px
- **Line height:** 1.33–1.60
- **Letter spacing:** -0.014em at 18px → -0.005em at 14px (mild tightening, barely perceptible at body sizes)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | -0.07px |
| body | — | — | 16px | 1.5 | -0.112px |
| body-lg | — | — | 18px | 1.56 | -0.252px |
| subheading | — | — | 24px | 1.25 | -0.456px |
| heading-sm | — | — | 32px | 1.2 | -0.768px |
| heading | — | — | 40px | 1.17 | -1.16px |
| heading-lg | — | — | 48px | 1.16 | -1.392px |
| display | — | — | 72px | 1.1 | -2.52px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 15px

### Border Radius

- **nav:** 8px
- **cards:** 8px
- **buttons:** 8px
- **small-chips:** 5px
- **decorative-shapes:** 20px

## Components

### Filled Primary Button
**Role:** Primary action (Get a demo, Explore Ask TheyDo)

Charcoal #131110 background, white #ffffff text, 8px radius, 15px vertical / 20px horizontal padding, DM Sans 15px weight 500. The only dark filled surface in the system — appears once per screen as the dominant CTA. No shadow, no border.

### Outlined Magenta Button
**Role:** Secondary brand action with color

Transparent background, 1px border in Magenta Pop #e82183, text in #e82183, 8px radius, 15px/20px padding, DM Sans 15px weight 500. Used when the action is brand-relevant but secondary to the dark filled CTA.

### Outlined Neutral Button
**Role:** Tertiary action (Talk to a person, Login)

Transparent background, 1px border in Hairline #c6c3c3, text in Charcoal #131110, 8px radius, 15px/20px padding. The quiet ghost variant — always paired with a dark filled CTA.

### Nav Bar
**Role:** Top-level site navigation

Horizontal bar on blush canvas, 15px padding, DM Sans nav items at 15px weight 500 in Graphite #56504d. The TheyDo diamond logo sits left; the dark filled 'Get a demo' button sits right. No drop shadow, no sticky background change.

### Hero Headline
**Role:** Page-top title with italic accent

Wulkan 72px weight 400 (or 500), tracking -2.52px, color #131110. One word is set in italic Magenta Pop #e82183 as the editorial accent. Subhead below in DM Sans 18px weight 400 in Graphite #56504d. Centered alignment, 80px vertical breathing room.

### Diamond Motif
**Role:** Decorative geometric element

Rotated squares (45°) in two sizes: small at ~15px, large at ~40px, scattered asymmetrically around the hero. Filled in Magenta Pop #e82183, Rose Glow #f9b4db, or Rose Whisper #fad6e9. Echoes the TheyDo logo mark — a signature visual device.

### Pink-Bordered Card
**Role:** Feature or content card with brand-tinted edge

White #ffffff surface, 1px border in Rose Whisper #fad6e9 or Rose Glow #f9b4db, 8px radius, 20px padding. Title in DM Sans 16px weight 600 in Charcoal, body in DM Sans 15px weight 400 in Graphite. No shadow — the colored border is the elevation signal.

### Neutral Card
**Role:** Standard content container

White #ffffff surface, 1px border in Mist #e8e8e8, 8px radius, 20px padding. Used for product UI panels, journey map previews, and grouped content blocks. Flat — no shadow.

### Client Logo Strip
**Role:** Social proof — 'world's leading brands' band

Blush canvas background, 30px vertical padding, centered Wulkan subhead ('The world's leading brands run on experience intelligence'), then a 2-row grid of monochrome black logos at consistent height. No card containers, no borders — logos float on the pink.

### Section Header
**Role:** Subsection title with centered alignment

Wulkan 40–48px weight 400, tracking -1.16 to -1.39px, Charcoal #131110. Centered on the page with 15–20px gap to a Graphite #56504d subhead in DM Sans 18px. Optional Magenta Pop diamond cluster above the headline as a visual entry point.

### Forrester / Award Badge Block
**Role:** Third-party validation card

White card with 8px radius, 1px Hairline border, 20px padding. Left column: Wulkan headline with one word in Magenta Pop italic. Right column: the award badge as a contained image. No decorative diamonds in this variant — it sits inside a structured card.

### Floating Prompt Bubble
**Role:** Interactive product demo element

White surface, 8px radius, 1px Hairline border, 15px padding. Contains a DM Sans prompt label and a magenta-accented action button. Positioned to overlap or sit beside a product screenshot — a bridge between the static page and the live tool.

### Journey Card Grid
**Role:** 4-column feature explanation

Four equal-width Neutral Cards in a single row, 30px gap, each with a short Wulkan-or-DM-Sans-bold label and a one-line DM Sans description. Connected below by a dashed/dotted Hairline line to a row of diamond-shaped capability cards — the only place the grid breaks symmetry.

## Do's and Don'ts

### Do
- Use the Charcoal #131110 filled button as the single dark surface in any view — one per screen, never two side by side.
- Set the primary headline in Wulkan and never let it exceed 72px on the largest display — beyond that, the tracking breaks.
- Apply Magenta Pop #e82183 only as outline, stroke, or italic accent — never as a filled background, badge fill, or text color on a colored ground.
- Default the page canvas to Blush Paper #fce7f3; reserve #ffffff for card surfaces that need to lift off the canvas.
- Use Rose Whisper #fad6e9 or Rose Glow #f9b4db for card borders when the card sits on the blush canvas and needs to feel on-brand without a dark stroke.
- Maintain 80px between major sections and 15–20px within cards — the spacious cadence is the difference between editorial and dashboard.
- Place 1–3 magenta diamond motifs near the hero or section transitions to signal the brand geometry; never use more than a handful per viewport.

### Don't
- Do not set the page background to pure #ffffff — the blush canvas is the brand's warm identity; cold white makes the site feel generic.
- Do not use Magenta Pop #e82183 as a filled button background, badge fill, or large solid block — it becomes visually aggressive and breaks the whisper-loud rhythm.
- Do not add drop shadows, glows, or blur effects to cards or buttons — the system is flat by design and elevation is expressed through border and surface color.
- Do not mix more than two border colors in a single card (e.g. Hairline + pink tint) — the visual noise competes with the editorial calm.
- Do not set body copy below 15px or use line-heights tighter than 1.45 — the generous leading is part of the magazine cadence.
- Do not center-align body paragraphs longer than two lines — use left-align for paragraphs, reserve center-align for headlines and short subheads.
- Do not introduce a third typeface or a new accent color — the system is built on the Wulkan/DM Sans pair and the single magenta accent; additions dilute the identity.

## Elevation

The system is deliberately shadowless. Depth is communicated through surface color shifts (Blush Paper → Card White → Ink Surface) and border color (Hairline for structural, pink tints for brand-aware). A single 1px line carries more visual weight in this system than a 12px blur shadow would — adding elevation would break the editorial, printed-on-paper feel.

## Surfaces

- **Blush Canvas** (`#fce7f3`) — Page-wide background — the warm off-white that defines the entire site's atmosphere
- **Card White** (`#ffffff`) — Elevated card surfaces, content containers, and product UI panels sitting on the canvas
- **Ink Surface** (`#131110`) — Filled primary-action buttons — the only dark surface in the system, used sparingly for maximum contrast

## Imagery

Photography is minimal and product-focused: tight crops of real human faces used in floating circular avatars that compose the hero diamond cluster, and contained product-UI screenshots of the journey-mapping tool shown as white-surface panels with Hairline borders. No full-bleed lifestyle photography, no abstract gradients, no 3D renders. The dominant graphic device is the magenta diamond motif — rotated 45° squares scattered as decorative confetti in sizes from 8px to 40px, filled in Magenta Pop, Rose Glow, or Rose Whisper. Icons are outline-style at ~20px stroke weight, mono-color, using Magenta Pop for decorative or category icons and Charcoal for functional UI icons. The visual language is printed-page-meets-product-tool: human faces and product screenshots sit in white containers, while the pink paper and diamond confetti provide atmospheric branding around them.

## Layout

Centered max-width 1200px content column on a full-bleed Blush Paper canvas. The hero is a centered text stack (Wulkan headline, DM Sans subhead, two-button row) with diamond motifs scattered asymmetrically to the left and product-UI screenshots anchored to the right at a lower z-position. Below the hero, sections alternate between full-width pink bands and white-surface card rows at 80px vertical gaps. Client logos appear in a centered 2-row grid floating directly on the pink canvas with no card containers — the only time logos are not inside a surface. Card grids use 4 equal columns at 30px gap; feature sections use 2-column text+visual alternation. The nav is a single horizontal bar with no sticky behavior or background change. The overall rhythm is editorial: generous whitespace, centered titles, and one prominent visual element per section rather than dense information stacking.

## Similar Brands

- **Notion** — Same flat, border-driven card system on a warm off-white canvas with a single accent color and generous editorial spacing.
- **Linear** — Similar tight tracking on display type and the discipline of using one dark filled button as the sole primary action per view.
- **Pitch** — Shares the editorial serif headline + clean sans body pairing and the playful use of geometric decorative shapes scattered across the hero.
- **Loom** — Same warm approachable canvas color (off-white/pink) replacing cold pure white, with confident display type and minimal shadow usage.
- **Framer** — Uses a similarly restrained single-accent-color system with bold serif headlines and floating decorative geometric motifs in the hero.
