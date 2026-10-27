# Mezmo — Style Reference
> observatory at dawn

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mezmo uses a quiet observatory language: warm off-white canvases, generous whitespace, and a single confident violet as the sole chromatic voice. The interface is typographically driven — thin weight 300 Onest headlines, compact monospace for telemetry values — with color appearing sparingly as semantic punctuation (violet for emphasis, muted teal for primary action, amber/green for data states). Components are flat and border-defined rather than elevated; 5–8px radii and 1px hairline borders create a low-noise, instrument-panel feel. Density is compact but the overall rhythm is unhurried, with wide section gaps and an emphasis on data density within calm containers.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Ink | `#0a090c` | Primary text, card borders, list dividers, nav labels |
| Near-Black Green | `#031403` | Secondary text, heavy borders, code-adjacent content |
| Bone White | `#e6e6e5` | Page canvas, outer section backgrounds |
| Paper White | `#ffffff` | Card surfaces, button text, elevated content blocks |
| Frost | `#f4f4f4` | Subtle surface fill, decorative washes |
| Stone | `#8a8a8a` | Muted helper text, inactive borders |
| Slate | `#696969` | Body secondary text, disabled labels |
| Ash | `#777777` | Body borders at 1px, low-priority dividers |
| Dust | `#d1d5db` | Card borders on elevated surfaces, input frames |
| Cinder | `#2d2d2d` | Dark mode accents, badge fills, strong contrast borders |
| Smoke | `#5a5a5a` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Iron | `#404040` | Dark badges, dense contrast text on tinted chips |
| Iris | `#7561b1` | Signature emphasis color — hero word highlights, key callouts, brand accents — the only saturated chromatic voice in the system |
| Coastal Teal | `#96beca` | Gray action color for filled buttons, selected navigation states, and focused conversion moments |
| Slate Blue | `#74a9b9` | Decorative borders, icon strokes, secondary blue accents |
| Amber Glow | `#f4b811` | Yellow outline accent for tags, dividers, and focused UI edges |
| Moss | `#9db161` | Green outline accent for tags, dividers, and focused UI edges |
| Lilac Mist | `#ccc6df` | Tinted card borders, violet-tinted shadow glows |
| Pale Aqua | `#d5e8ed` | Cool surface wash, hover state for primary buttons |
| Sand Sage | `#dfe4d1` | Warm neutral surface, decorative section tint |
| Faded Aqua | `#b4cfd7` | Muted border tone, low-contrast decorative strokes |
| Dusk | `#3a344b` | Dark violet text — used for emphasis on light surfaces |

## Typography

### Onest Variable — All interface text — display headlines at weight 300 create a technical-confident tone; body at 16–18px weight 400; labels and micro UI at 11–13px weight 500. Weight 300 headlines are a signature anti-convention choice that makes the system feel like an instrument panel rather than a marketing page
- **Substitute:** Inter, Geist, Satoshi
- **Weights:** 300, 400, 500, 600
- **Sizes:** 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 22, 24, 26, 30, 36, 48
- **Line height:** 1.00, 1.05, 1.13, 1.20, 1.23, 1.25, 1.33, 1.45, 1.50, 1.55
- **Letter spacing:** 0.04em at 9–11px (uppercase eyebrow labels); 0.06em at 10–12px (badge text); 0.12em at 9–10px (tracked micro UI)

### monospace (system) — Telemetry values, code snippets, configuration keys, metric labels in the product UI. Used at 10–12px weight 500 for data density; 0.057em tracking gives a technical, terminal-like read
- **Substitute:** JetBrains Mono, IBM Plex Mono, Berkeley Mono
- **Weights:** 300, 500, 600
- **Sizes:** 9, 10, 11, 12
- **Line height:** 1.50
- **Letter spacing:** 0.0570em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 11px | 1.55 | 0.06px |
| caption | — | — | 13px | 1.5 | — |
| body-sm | — | — | 16px | 1.5 | — |
| body | — | — | 18px | 1.45 | — |
| subheading | — | — | 20px | 1.33 | -0.2px |
| heading-sm | — | — | 24px | 1.25 | -0.24px |
| heading | — | — | 30px | 1.2 | -0.3px |
| heading-lg | — | — | 36px | 1.13 | -0.36px |
| display | — | — | 48px | 1.05 | -0.48px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **badges:** 5px
- **inputs:** 5px
- **buttons:** 5px
- **hairlines:** 1px
- **large-cards:** 14px

## Components

### Primary Filled Button
**Role:** Main call-to-action — e.g. "Get a demo", "Start building with AURA"

Background #96beca (Coastal Teal), text #ffffff or #0a090c at 16px Onest weight 500. 5px border-radius, 12px 24px padding (10px vertical / 20px horizontal variant). Subtle hover lift via rgba(0,0,0,0.2) 0px 2px 5px shadow. No border.

### Ghost Outline Button
**Role:** Secondary action — e.g. "Talk to an engineer"

Transparent background, 1px solid #031403 border, text #0a090c at 16px weight 500. 5px radius, 12px 24px padding. Sits adjacent to the primary filled button to create a two-button CTAs cluster.

### Top Navigation Bar
**Role:** Persistent header with logo, primary nav, and auth actions

Full-width white surface, 1px bottom border #d1d5db. Logo "mezmo+" in #0a090c with a violet + glyph (#7561b1). Nav items in Onest 14px weight 500, text #0a090c, 16px horizontal gap. Right side: "Sign In" text link + Primary Filled Button.

### Hero Stat Card
**Role:** Quantitative summary card in the hero — INGEST, DEDUPLICATE, CLUSTER, CONTEXT-READY

White card surface, 1px border #d1d5db, 8px radius. Title in monospace 10–11px weight 500 with 0.057em tracking and uppercase treatment. Metric value in monospace 22–26px weight 600, #0a090c. Colored horizontal progress bar beneath (amber #f4b811, teal #96beca, violet #7561b1, moss #9db161) showing proportional states.

### Code Window
**Role:** Embedded code/configuration snippet panel

Light surface (#f4f4f4 or #ffffff), 8px radius, 1px border #d1d5db. macOS-style traffic-light dots in red/yellow/green. Body text in monospace 11–12px weight 400, with syntax highlighting in #7561b1 (violet for keys), #74a9b9 (blue for strings), #9db161 (green for values), and #c04040 (red for errors). 16px internal padding.

### Pastel Gradient Banner
**Role:** Section divider / eyebrow strip above major sections

Horizontal band with soft 90deg linear gradient cycling through rgba(147,131,194,0.376) → rgba(116,169,185,0.376) → rgba(147,131,194,0.376) → rgba(157,177,97,0.376). Acts as a chromatic breath between content blocks without competing with content.

### Agent Timeline Step
**Role:** Node in the "Open-source agent control plane" flow

Circular icon node (24–32px) in #74a9b9 or #7561b1 fill, label below in Onest 12–13px weight 500. Connected by 1px horizontal divider line #d1d5db. Active state: filled color; inactive: outlined 1px border only.

### Tab / Pill Selector
**Role:** Entry-point selector — "Single Agent", "Agent Team", etc.

Transparent background, 1px solid #031403 border, 5px radius, 10px 16px padding. Text in Onest 13px weight 500, #0a090c. Active state: #0a090c background, #ffffff text. Horizontal flex row with 8px gaps.

### Logo Lockup
**Role:** Brand mark — "mezmo" wordmark with + glyph

Wordmark in Onest weight 500, #0a090c. The + symbol rendered in #7561b1 (Iris) at roughly 1.2x the cap height, positioned as a superscript accent. Functions as a monogram and the only place the violet appears at brand-logotype scale.

### Section Header
**Role:** Intro block for a content section — "Pick your entry point"

Eyebrow label in Onest 11px weight 500, uppercase, 0.06em tracking, #7561b1 or #8a8a8a. Main heading in Onest weight 300, 36–48px, #0a090c, tight -0.36 to -0.48px tracking. Optional subhead in 18px weight 400, #696969.

### Metric Stat Strip
**Role:** Inline KPIs — "<1min total investigation", "<1K signals", "<$1 per investigation"

Three or more inline stats in a horizontal flex row. Values in monospace 22–26px weight 600 colored by semantic state: moss #9db161 for positive, violet #7561b1 for emphasis. Labels in Onest 13px weight 400, #696969. Separated by 1px vertical dividers or 24px gaps.

### Feature Card
**Role:** Product capability card

White surface (#ffffff), 1px border #d1d5db or #ccc6df, 8px radius. Internal padding 24px. Optional violet-tinted shadow rgba(117,97,177,0.063) 0px 4px 20px for elevated variant. Title in Onest 18–20px weight 500, body in 16px weight 400.

### Eyebrow Tag
**Role:** Small all-caps label — "AURA", "MEZMO", "CONTEXT-READY"

5px radius, 4–6px vertical / 8–10px horizontal padding. Background: #e6e5ee or transparent with 1px #ccc6df border. Text in Onest 9–10px weight 600, uppercase, 0.12em tracking, #0a090c or #7561b1.

### Progress Bar (Data Signal)
**Role:** Colored horizontal bar beneath metric cards

4–6px height, full container width, 5px radius (or pill = 9999px). Colors drawn from the chromatic accent set: #f4b811 (amber), #96beca (teal), #7561b1 (violet), #9db161 (moss). Represents deduplication %, clustering volume, etc.

## Do's and Don'ts

### Do
- Use #7561b1 (Iris) as the sole emphasis color — apply it to one word or one element per section, never to a button background or body paragraph
- Set headlines at Onest weight 300 with -0.4 to -0.5px tracking; this whisper-weight is the system's most distinctive typographic move
- Use 5px radius for all buttons, badges, and pills; 8px for cards; 14px only for large feature cards
- Pair #96beca filled buttons with #031403 ghost outline buttons for any two-button CTA cluster
- Reserve monospace for telemetry values, code, and metric numbers — never for marketing copy
- Maintain 80px section gaps between major content blocks; the system needs air to read as an instrument panel
- Use 0.04–0.12em letter-spacing only on uppercase 9–12px text; never apply tracking to sentence-case body copy

### Don't
- Do not use #7561b1 as a button background — Iris is for emphasis only, not action
- Do not mix #96beca and #74a9b9 as both primary actions; Coastal Teal is the sole primary action color
- Do not apply shadows heavier than rgba(0,0,0,0.2) 0px 2px 5px — the system is flat-first, border-defined
- Do not use weight 600 or 700 for headlines; weight 300 is the signature move and carries the system's identity
- Do not use the chromatic accents (#f4b811, #9db161, #74a9b9) outside of data-visualization contexts — they signal signal-state, not decoration
- Do not set body text below 16px or above 20px; the 16–18px band is the readable core
- Do not introduce new radii between 5px and 8px — the two-tier system is intentional

## Elevation

- **Primary Filled Button:** `rgba(0, 0, 0, 0.2) 0px 2px 5px 0px`
- **Feature Card:** `rgba(0, 0, 0, 0.2) 2px 2px 8px 0px`
- **Elevated Feature Card:** `rgba(117, 97, 177, 0.063) 0px 4px 20px 0px`
- **Subtle Card Hover:** `rgba(10, 9, 12, 0.04) 0px 1px 4px 0px`

## Surfaces

- **Canvas** (`#e6e6e5`) — Outer page background, banded section backgrounds
- **Paper** (`#ffffff`) — Cards, buttons, input fields, code panels
- **Frost** (`#f4f4f4`) — Inline decorative fills, code body backgrounds, light accent surfaces
- **Tinted Wash** (`#dfe4d1`) — Warm-tinted section bands, hover state surfaces
- **Lilac Mist** (`#e7e5ee`) — Violet-tinted wash for emphasis sections, badge backgrounds

## Imagery

Minimal illustrative imagery — the system relies on data visualization rather than photography or illustration. The hero features a product mockup: a horizontal card row with colored progress bars (amber, teal, violet, moss) representing signal processing states. The agent timeline is a flat node-and-connector diagram with circular icon markers. Code panels with macOS chrome dots appear as product screenshots. The only photographic element is the logo mark (mezmo+). Overall density is text-and-data dominant; the page reads as a technical product surface, not a marketing canvas. When color appears in imagery, it is always one of the four data-state hues and never decorative.

## Layout

Max-width 1200px centered content with full-bleed section bands. The hero is a centered headline over a soft gradient strip, followed by a two-column primary button cluster and a full-width product mockup. Sections below alternate between text-left/data-right compositions and centered single-column blocks. The entry-point selector uses a horizontal pill row above a split layout: left column lists journey stages in a vertical stack, right column shows a code window. Navigation is a single top bar, sticky on scroll. Card grids appear in feature sections at 2–3 column counts with 16–24px gutters. Vertical rhythm is 80px between major sections, 16–24px between elements within sections.

## Similar Brands

- **Linear** — Same typographic confidence with weight-light display headlines, compact density, and a single saturated accent against a near-monochrome interface
- **Vercel** — Light-mode instrument-panel aesthetic with flat surfaces, hairline borders, monospace for code and metrics, and minimal elevation
- **PlanetScale** — Developer-tool voice with a single signature color emphasis, 5–8px radii, and content sections that alternate between prose and code/data panels
- **Honeycomb** — Observability product with violet/purple as the brand voice, monospace-heavy metric presentation, and quiet canvas with data bars as the primary visual motif
- **Axiom** — Compact devtools layout, monospace telemetry values, and restrained color where accent appears only on data signals and emphasis text
