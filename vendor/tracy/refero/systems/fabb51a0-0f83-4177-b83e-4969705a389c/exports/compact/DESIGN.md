# Uniswap Cup — Style Reference
> Esports broadcast on a wireframe court — a pink highlighter tracing through a grid of white boxes and hairline rules.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Uniswap Cup is a flat, near-monochrome tournament visualization treated as a broadcast overlay — white canvas, hairline gray rules, and a single neon pink that behaves like a highlighter running through a sports bracket. The pink never decorates; it punctuates: filling winner nodes, bordering connectors, stamping group-stage labels, and tagging the final match. Everything else dissolves into a grid of black text on white, monospace numbers, and 1px lines — the interface IS the bracket, nothing competes with the data structure. Type is utilitarian and system-native, with monospace doing the heavy lifting for scores and stages. Components feel diagrammatic rather than designed — thin-bordered boxes, square corners, no shadows, no gradients, no rounding beyond a couple of pixels.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bracket Pink | `#f50db4` | Pink outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Graphite Black | `#000000` | Primary text, icon fills, team-name boxes, score text — the typographic and structural anchor |
| Page White | `#ffffff` | Page canvas, inverted text on dark or pink nodes |
| Off-Black | `#222222` | Secondary headings and subdued text — softer than pure black for non-critical labels |
| Wire Gray | `#f2f2f2` | Hairline borders, divider rules, bracket connector lines, card outlines — the structural skeleton of the entire diagram |
| Blush Wash | `#fef4ff` | Soft pink-tinted surface for highlighted match cards and accent panel backgrounds — pink diluted almost to white |

## Typography

### ui-sans-serif — System sans-serif for body text, team names, labels, and UI chrome. Small scale (12–16px) and tight line-heights keep the bracket compact; weight 500–600 for labels, 400 for secondary text. Substitute: Inter, -apple-system, or any geometric sans.
- **Substitute:** Inter, system-ui
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 16px
- **Line height:** 1.33, 1.50

### ui-monospace — Monospace for all numerical scores, stage labels (R16, QF, SF), the UNISWAP CUP wordmark, and the central VS separator. Weight 700 at 32px for hero match scores with -0.02em tracking; weight 500 at 12px for stage markers. This monospace handling is signature — numbers and stages read like broadcast graphics, not body text. Substitute: JetBrains Mono, IBM Plex Mono, SF Mono.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 500, 700
- **Sizes:** 12px, 32px
- **Line height:** 1.00, 1.33
- **Letter spacing:** -0.0200em

### Basel — Custom brand face used sparingly for select body text passages — a single weight (500) suggests Basel Grotesk or a geometric grotesque chosen for its even, technical character. Substitute: Inter or Söhne at weight 500.
- **Substitute:** Inter, Söhne
- **Weights:** 500
- **Sizes:** 16px
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | — |
| body | — | — | 16px | 1.5 | — |
| display | — | — | 32px | 1 | -0.64px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 24px
- **Card padding:** 8px
- **Element gap:** 4-8px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **nodes:** 0px
- **buttons:** 0px

## Components

### Bracket Connector Line
**Role:** Structural diagram edge

1px hairline in #f2f2f2 connecting match nodes across the bracket. Turns to Bracket Pink (#f50db4) on the winning path. No curves — orthogonal right-angle joins only, like a circuit diagram.

### Winner Node (Pink Filled Box)
**Role:** Highlighted match result box

Filled #f50db4 square, 0px radius, white monospace text at 12px weight 500–700. Contains score number, team icon, or single-letter marker. Typically 24×24px or 32×32px. The pink fill = this is the advancing team.

### Team Identity Box (Black Filled)
**Role:** Team name or avatar container

Filled #000000 square, 0px radius, white text or white icon glyph. Adjacent to a white box with the score in black. The black/white pairing creates the scoreboard unit.

### Stage Label Tag (R16 / QF / SF)
**Role:** Round-of-tournament marker

Filled Bracket Pink (#f50db4) rectangle, 0px radius, white monospace text at 12px weight 500. Labels: R16, QF, SF, F. Positioned at the top of each bracket column.

### Status Pill (WINNER / Final / Road to final)
**Role:** Match-state annotation

Small uppercase text label. 'WINNER' sits as a Bracket Pink filled tag above the champion's node. 'Final' uses larger monospace at 32px weight 700 in Bracket Pink. 'Road to final' is centered body text in #000000.

### Central VS Separator
**Role:** Final-match divider

Large monospace 'VS' at ~40–56px weight 700 in Bracket Pink (#f50db4), centered between the two finalist teams. The typographic climax of the bracket.

### Header Nav Tags (GROUP STAGE / LIVESTREAM)
**Role:** Top navigation chips

Inverted style: black text on light gray (#f2f2f2) pill/rectangle tags with hairline borders, monospace 12px. Uniswap unicorn logo in Bracket Pink at the far left.

### Uniswap Cup Wordmark
**Role:** Page title lockup

'UNISWAP' in monospace 12px weight 500, dot separator, 'CUP' below in monospace with letter-spacing. Black on white, centered. No logo mark — type IS the mark.

### Tournament Bracket Frame
**Role:** Full-page layout container

Full-bleed white (#ffffff) canvas with bracket diagram spanning the full viewport width. A faint circle (the 'pitch') sits behind the final match at center. No card containers — nodes are directly placed on the canvas with hairline connectors.

### Match Date/Time Label
**Role:** Scheduling annotation

Monospace 12px text showing date and time (e.g., 'November 10' with '1pm' underlined). Black text on white, minimal, positioned beneath the central final match.

## Do's and Don'ts

### Do
- Use #f50db4 exclusively for highlighted/winning states, stage tags, and the final-match callout — never as a decorative background fill on large areas
- Keep all component corners at 0px radius — the design is deliberately square and diagrammatic
- Use monospace (ui-monospace) for all numbers, scores, stage labels, and the wordmark; use system sans-serif for body and team names
- Draw bracket connectors as 1px orthogonal lines in #f2f2f2 with right-angle turns, never curves or diagonals
- Apply -0.02em letter-spacing to all monospace text at 32px and above to tighten the broadcast-graphic feel
- Use #fef4ff as a soft accent surface behind highlighted match cards — it is a diluted pink, not a full brand fill
- Keep the layout full-bleed and symmetrical; the bracket is the page, not a component within the page

### Don't
- Do not add shadows, gradients, or any elevation effects — the system is intentionally flat and diagrammatic
- Do not introduce border-radius above 0px on any bracket node, tag, or structural element
- Do not use #f50db4 for body text or large background fills — it is a highlighter, not a paint roller
- Do not use a second accent color — the entire chromatic system is one pink; any second hue breaks the broadcast language
- Do not use serif, display, or decorative typefaces — system sans and monospace only
- Do not add card padding beyond 8px or section gaps beyond 24px — the design is compact and diagrammatic, not spacious
- Do not wrap the bracket in a max-width container or centered column — it must span the full viewport to maintain symmetry

## Elevation

The design system is entirely flat — no shadows, no gradients, no blur. Depth is created exclusively through color contrast: filled black and pink nodes sit on the white canvas and read as elevated by their chromatic value alone. This diagrammatic flatness is a signature choice: the interface presents itself as a printed tournament chart, not a software application.

## Surfaces

- **Canvas** (`#ffffff`) — Full-bleed page background — the white field on which the bracket is drawn
- **Blush Panel** (`#fef4ff`) — Soft pink-tinted surface used behind highlighted match cards or accent zones — a whisper of the brand pink
- **Wire** (`#f2f2f2`) — Not a surface per se but the dominant structural color — used for hairline borders, connectors, and grid scaffolding at 660+ instances

## Imagery

No photography, no illustration, no decorative imagery. The visual language is pure typographic and diagrammatic — team logos appear as small monochrome glyphs inside black squares, scored digits are typeset in monospace, and the bracket itself is drawn with 1px rules. The only graphic element is a faint concentric circle behind the final match (the 'pitch'), drawn in a hairline gray. Iconography is reduced to single-letter or two-letter abbreviations inside filled squares. Density is text-and-structure-dominant; visual space is occupied by the bracket geometry, not by images.

## Layout

Full-bleed single-page layout: the tournament bracket spans the entire viewport width with no max-width container, organized as a symmetric double-elimination tree radiating from a central final match. The left half shows one side of the bracket, the right half mirrors it, and the center column holds the final with the 'VS' separator and date. The page reads as a single horizontal diagram rather than a scrolled stack of sections. Navigation is a thin top bar with two text tags (GROUP STAGE, LIVESTREAM) flanking the centered UNISWAP CUP wordmark. Below the fold, rounds stack vertically with consistent 8px gaps and 1px connectors. The entire layout is a grid: no cards, no padding buffers, no breathing room beyond what the bracket geometry requires.

## Similar Brands

- **Challonge** — Same diagrammatic tournament bracket approach — flat layout, monochromatic structure, single accent color on winner nodes, hairline connector lines
- **Smash.gg (Start.gg)** — Esports tournament bracket aesthetic — monospace scores, black/white identity boxes, bracket-as-page composition with minimal chrome
- **Bracketology sites (ESPN March Madness)** — Classic sports bracket visualization with hairline rules, node-based team boxes, and stage labels — though Uniswap Cup adds a neon-pink system
- **Linear changelogs** — Same minimalist monochromatic-plus-one-accent approach with monospace data, flat surfaces, and zero decorative effects
