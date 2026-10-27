# Perplexity AI — Style Reference
> Warm research terminal. A cream-toned search bar floats on aged-paper canvas, surrounded by quiet monochrome controls — the calm of a library reading desk distilled into a single input field.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Perplexity's interface operates like a quiet research terminal: a warm off-white canvas (#faf8f5) that reads more like aged paper than sterile app-white, a single monochrome typographic voice, and one restrained teal accent (#016a71) that appears only as functional punctuation. The entire visual system compresses to a search bar as the hero — every surrounding control (sidebar, top nav, model selector, voice button) is a subordinate satellite. Density is compact but not cramped: 8px is the workhorse gap, 12–16px the padding standard, with 9999px pill rounding on all interactive controls. There is almost no elevation — the design is deliberately flat, using a barely-there 1px border at #d1d1cd and a single whisper-soft shadow to separate the card layer from the canvas. Typography is custom (pplxSans) at exactly two weights (400, 500) and three sizes (12, 14, 16) — the scale is intentionally narrow, making the interface feel like a document rather than a dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aged Paper | `#faf8f5` | Page canvas and card surfaces — warm off-white replaces sterile pure white, giving the interface a document-like, paper-textured quality |
| Ink Black | `#000000` | Primary text, icon strokes, and the dominant fill across navigation and body copy |
| Charcoal | `#27251e` | Primary action button background and high-emphasis text — warm near-black that pairs with the cream canvas for a softer than pure-black contrast |
| Ash Gray | `#72706b` | Secondary text, muted icons, and inactive nav fills — carries the warm tint of the palette |
| Stone | `#92918b` | Tertiary/placeholder text and low-emphasis labels |
| Pebble | `#d1d1cd` | Hairline borders on cards and input containers — warm gray that recedes against the cream canvas |
| Deep Teal | `#016a71` | Sole chromatic accent — active nav indicator and selected state fill, provides the only color punctuation in the interface |

## Typography

### pplxSans — All interface text — the deliberately narrow scale (3 sizes, 2 weights) makes the system feel document-like. Weight 400 handles body, labels, and input text; weight 500 is reserved for active/selected states and emphasis. The custom typeface is geometric and humanist, tighter and more distinctive than a system sans like Inter. Normal letter-spacing throughout.
- **Substitute:** Inter (system fallback) — closest in geometric proportions; alternatively DM Sans for similar warmth
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.25, 1.33, 1.43, 1.50, 2.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.43 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.43 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 640px
- **Section gap:** 32px
- **Card padding:** 12px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 16px
- **input:** 12px
- **buttons:** 9999px
- **nav-items:** 9999px

## Components

### Search Input
**Role:** Central input field — the primary action surface of the product

Full-width within 640px max-width container. White (#ffffff) background with 1px border in #d1d1cd, 12px border-radius. 16px pplxSans weight 400 placeholder text in #92918b. 16px vertical padding. Contains an inline '+' icon, a 'Computer' mode toggle chip, a 'Model' dropdown, a microphone icon, and a dark submit button (#27251, 9999px radius, white up-arrow icon).

### Primary Submit Button
**Role:** Search submission — the only filled dark button in the interface

28×28px circle, #27251 background, 9999px radius, white (#ffffff) up-arrow icon at 14px. Sits inline at the right edge of the search input.

### Sidebar Nav Item
**Role:** Left rail navigation links

36px height, 8px horizontal padding, 9999px radius. pplxSans 14px weight 400 in #27251e. Active state: #e8e6e1 background fill. Leading icon 16px in #27251e. Full-width within 220px sidebar.

### Top Nav Link
**Role:** Horizontal category links in the header

Inline 14px pplxSans weight 400 in #27251e. No background by default. Active/category indicator uses #016a71 teal fill as an underline or pill background.

### Mode Toggle Chip
**Role:** Inline capability selector within the search input

Compact pill with 6px radius, 4px 8px padding, #faf8f5 background, 12px pplxSans weight 500 label in #27251, with a small icon prefix and '+' suffix for adding more modes.

### Status Card
**Role:** System/connection status notification below the search

Full-width 640px, #ffffff background, 16px radius, 1px #d1d1cd border, 12px padding. 14px pplxSans weight 500 label in #27251 with a small status icon. Contains 3-4 skeleton placeholder blocks (rounded 9999px, #f0eeea fill) indicating loading state.

### Skeleton Placeholder
**Role:** Loading state for content cards

Rounded 9999px bar, 8px height, #f0eeea fill, animated with a subtle shimmer. Arranged in rows with 8px gap.

### Sign In Button
**Role:** Authentication entry at sidebar bottom

28px height, 8px 12px padding, 9999px radius, pplxSans 14px weight 500 in #27251e. Circular avatar/icon prefix.

### Model Selector
**Role:** Dropdown trigger for AI model selection

Inline text button, 14px pplxSans weight 400 in #27251, trailing chevron-down icon at 12px. No border or background.

## Do's and Don'ts

### Do
- Use 9999px border-radius for all interactive controls (buttons, nav items, toggle chips, tags)
- Maintain the narrow type scale: 12px caption, 14px body-sm, 16px body — do not introduce sizes outside this set
- Set all card and input backgrounds to #ffffff on the #faf8f5 canvas to create the paper-on-paper layering effect
- Use 1px #d1d1cd borders for all container separation — avoid shadows except the single whisper-soft card shadow
- Use #016a71 teal only for active/selected state indicators — it should appear on fewer than 5% of elements
- Keep the main content column at 640px max-width centered — the search bar is the focal point, not a wide canvas
- Use pplxSans weight 500 exclusively for emphasis and active states; weight 400 for all default and body text

### Don't
- Do not introduce new colors — the palette is deliberately minimal: cream, black, warm grays, and one teal
- Do not use bold weights (600+) — the system maxes at weight 500
- Do not use 0px or 4px border-radius on interactive elements — always pill (9999px) or 12px minimum
- Do not apply heavy shadows or multiple shadow layers — the design is intentionally flat
- Do not use pure white (#ffffff) as a page background — the warm #faf8f5 canvas is a signature choice
- Do not center-align body text — left-align all labels, descriptions, and input text
- Do not use the teal accent decoratively — it signals a functional state (active, selected, live)

## Elevation

- **Status Card:** `rgba(0, 0, 0, 0.08) 0px 1px 2px 0px`

## Surfaces

- **Canvas** (`#faf8f5`) — Page background — warm off-white that reads as paper or aged cream
- **Card** (`#ffffff`) — Elevated container surfaces — input fields, status cards, content blocks
- **Subtle Fill** (`#e8e6e1`) — Active nav item backgrounds, hover states — a barely-visible warm gray

## Imagery

No photography, illustration, or decorative graphics. The visual language is pure UI — typography, whitespace, and a single teal accent do all the work. Icons are minimal line-style at 16-20px, rendered in #27251 or #72706b. The brand wordmark 'perplexity' is the only typographic identity element. There are no product screenshots, hero images, or marketing visuals on the primary search interface.

## Layout

Centered single-column layout at 640px max-width. Left sidebar (220px) contains primary navigation (New, Computer, Spaces, Customize, History) with a Sign In button pinned at the bottom. Top header bar (56px) holds horizontal category links (Discover, Finance, Health, Academic, Patents) right-aligned. The main content area is dominated by the centered 'perplexity' wordmark and the search input — the hero is literally a search bar, not a visual. Below the search, a status card and skeleton placeholders extend the column. The layout is deliberately minimal: no multi-column grids, no hero imagery, no card carousels on the primary screen. Navigation is a compact sidebar + thin top bar. Section rhythm is defined by generous vertical breathing room (32px+) rather than visual dividers.

## Similar Brands

- **Notion AI** — Same warm off-white canvas, monochrome text system, and single accent color approach — both feel like documents rather than dashboards
- **Phind** — Developer-focused search interface with centered input hero, minimal chrome, and teal/dark dual-tone palette
- **You.com** — Search-first AI interface with compact sidebar nav, centered query input as the page hero, and restrained accent usage
- **Linear** — Same flat elevation philosophy, hairline borders instead of shadows, narrow type scale, and pill-shaped interactive controls
