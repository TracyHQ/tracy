# Perplexity AI — Style Reference
> scholar's parchment behind clean glass

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Perplexity's interface reads as a warm-paper research desk: an off-white parchment canvas (#faf8f5) with quiet ink-dark text, hairline warm-gray dividers, and a single restrained teal that signals navigation and active states. Components stay compact and low-elevation — soft 16px-radius cards, ghost buttons, pill chips — letting the central search input dominate as the focal artifact. Type uses a custom geometric sans (pplxSans) at modest weights with generous line-height, producing a calm, readable surface that trusts content density over chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#faf8f5` | Page canvas, card surfaces, nav backgrounds — warm off-white that replaces pure white as the base layer everywhere |
| Soft Paper | `#fdfbfa` | Slightly elevated card surface (one step above the canvas) — used on suggestion cards |
| Warm Mist | `#d1d1cd` | Hairline card and input borders — warm gray that reads as a pencil line on parchment |
| Ash | `#92918b` | Muted helper text, secondary labels — warmer than #72706b |
| Graphite | `#72706b` | Nav icons, secondary button text, inactive labels — the dominant neutral text color |
| Ink | `#27251e` | Primary text, icon fills, button backgrounds — deep warm-black (not pure #000) carries the brand's brownish undertone |
| Pure Black | `#000000` | High-contrast text and icon accents — used sparingly where maximum weight is needed |
| Deep Teal | `#016a71` | Active nav item background, selected state fill, brand-signaling accent — single chromatic color carrying all navigational emphasis |

## Typography

### pplxSans — Custom geometric sans used everywhere — body text at 16px/1.5 weight 400, UI labels at 14px/1.43, micro text at 11–12px weight 500. The narrow weight range (400–500) keeps the interface visually quiet; there is no bold display weight. Letter-spacing stays at 0 (normal) across all sizes.
- **Substitute:** Inter, system-ui, -apple-system, sans-serif
- **Weights:** 400, 500
- **Sizes:** 11px, 12px, 14px, 16px
- **Line height:** 1.00, 1.25, 1.33, 1.43, 1.50, 2.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.43 | — |
| body-sm | — | — | 12px | 1.43 | — |
| body | — | — | 14px | 1.43 | — |
| body-lg | — | — | 16px | 1.43 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 900px
- **Section gap:** 32px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 16px
- **chips:** 9999px
- **inputs:** 12px
- **buttons:** 6px

## Components

### Sidebar Nav Item
**Role:** Primary left-rail navigation entry

Transparent background, Graphite (#72706b) icon + label, no border, 0px padding. Active state uses Deep Teal (#016a71) background with white text. Uses 12px radius for selected state. Weight 400 at 16px.

### Ghost Button
**Role:** Low-emphasis action (nav controls, dropdown triggers)

Transparent background, Graphite (#72706b) text, 1px Warm Mist (#d1d1cd) border, 6px radius, 8px vertical / 12px horizontal padding. Weight 400 at 14px.

### Pill Chip
**Role:** Search mode selector (Search, Computer, Model)

Transparent or near-transparent fill, Ink (#27251e) text, 9999px full pill radius, 8px vertical / 12px horizontal padding. Active chips fill with Deep Teal (#016a71). Weight 400 at 14px.

### Filled Action Button
**Role:** High-emphasis action (search submit, record)

Ink (#27251e) background, Parchment (#faf8f5) text, no border, 12px radius, 8px/12px padding. The dark warm-black fill is the only filled button style. Used for the microphone/record control.

### Suggestion Card
**Role:** Below-search prompt suggestions

Soft Paper (#fdfbfa) background, 16px radius, 12px vertical padding, no border, subtle 1px shadow (rgba(0,0,0,0.08) 0 1px 2px). Contains an icon (Ink) + title (Ink weight 400) + description text (Graphite weight 400 14px). Arranged in a 2-column grid.

### Search Input
**Role:** Central hero query field

Parchment (#faf8f5) background with subtle decorative glow border (teal oklch at 40% opacity), 12px radius, 16px vertical padding. Placeholder text in Graphite (#72706b) at 16px/1.5. Accommodates inline mode chips and trailing controls. Largest interactive element on the page.

### Badge Tag
**Role:** "NEW" indicator on feature cards

Deep Teal (#016a71) background, white text, 9999px pill radius, weight 500 at 11px, 2px vertical / 8px horizontal padding. Marks new features without using a different color.

### Top Nav Link
**Role:** Category navigation (Discover, Finance, Health, Academic, Patents)

Transparent background, Graphite (#72706b) text, no border, 0px padding, 16px weight 400. Hover transitions color to Ink (#27251e). Centered horizontally above the search area.

### Sidebar Brand Mark
**Role:** Perplexity icon at top of left rail

Ink (#27251e) filled icon, no background, 16px box. Acts as visual anchor for the sidebar.

### Sidebar Section Label
**Role:** Group headings in left rail (Connectors, Skills, Workflows)

Graphite (#72706b) text, weight 400 at 12px, uppercase or sentence case, no background or border. Provides typographic rhythm without visual weight.

## Do's and Don'ts

### Do
- Use Parchment (#faf8f5) as the base canvas for all full-page backgrounds — never substitute pure white (#ffffff) unless a token explicitly requires it.
- Set primary text to Ink (#27251e) for body content and Pure Black (#000000) only for maximum-weight UI elements.
- Reserve Deep Teal (#016a71) exclusively for: active nav states, the "NEW" badge fill, and the decorative glow around the search input.
- Use 16px radius for cards, 12px radius for inputs and filled buttons, 6px radius for ghost buttons, and 9999px for chips and badges.
- Keep type weights between 400 and 500 only — the interface relies on color and spacing, not typographic weight, for hierarchy.
- Apply 1px Warm Mist (#d1d1cd) borders for hairline card/button outlines; avoid heavier 2px+ borders.
- Use the pplxSans type scale: 16px/1.5 for body, 14px/1.43 for UI labels, 12px/1.33 for micro labels, 11px/1.5 for badges.

### Don't
- Don't introduce new accent colors — the system is deliberately monochrome with one teal; any second chromatic color breaks the brand's restraint.
- Don't use bold (600+) weights — pplxSans caps at 500 and the design depends on that calmness.
- Don't add drop shadows beyond the single 1px subtle shadow on cards — the interface is intentionally flat.
- Don't use pure white (#ffffff) as a surface color — always offset with Parchment (#faf8f5) or Soft Paper (#fdfbfa) to maintain the warm paper feel.
- Don't apply teal to text or iconography in body content — teal belongs on fills and selected-state backgrounds only.
- Don't exceed the 900px max-width for the main content column — the layout is centered and narrow by design.
- Don't add gradients, blurs, or decorative imagery to component surfaces — the visual language is strictly flat and textural.

## Elevation

The design intentionally avoids elevation. Only one shadow exists in the entire system — a barely-visible 1px shadow on suggestion cards (rgba(0,0,0,0.08) 0 1px 2px). All other components rely on background color contrast and hairline borders to establish layering. This flat treatment reinforces the paper/parchment metaphor: surfaces sit on the canvas like sheets, not floating panels.

## Surfaces

- **Page Canvas** (`#faf8f5`) — Full-viewport warm off-white background for the entire app
- **Card Surface** (`#fdfbfa`) — Suggestion cards and elevated content blocks — one shade lighter than the canvas
- **Active Nav** (`#016a71`) — Selected navigation item background — the only chromatic surface
- **Button Fill** (`#27251`) — Solid button background — dark warm ink against parchment for high contrast

## Imagery

No photography, illustration, or product screenshots. The interface is pure UI on a parchment canvas — visual identity comes from typography, spacing, and the single teal accent. Icons are simple monochromatic glyphs (Ink #27251 or Graphite #72706b) used sparingly for navigation and suggestion affordances. The search input's decorative teal glow is the only non-structural visual effect.

## Layout

Two-pane application layout: a fixed left sidebar (~260px wide) containing nav items, brand mark, and user sign-in, paired with a centered main content column capped at 900px max-width. The main column is vertically sparse — a top category nav row, a large centered "perplexity" wordmark, then the dominant search input (~640px wide), followed by a 2-column suggestion card grid. Generous whitespace between sections (32px+) creates a calm reading rhythm. The sidebar uses a slightly darker parchment tone with subtle separation from the main canvas. Everything is compact-density with 8px element gaps and 16px card padding.

## Similar Brands

- **Notion AI** — Same compact-density, off-white-canvas interface with restrained accent color usage and flat component treatment
- **Phind** — Same developer-tool-meets-AI-assistant aesthetic with centered minimal search inputs and minimal decoration
- **ChatGPT** — Same two-pane sidebar-plus-centered-content layout with clean monochrome surfaces and a single restrained accent
- **You.com** — Same AI-answer-engine pattern: centered hero search above suggestion cards on a quiet light background
