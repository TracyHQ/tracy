# Handshake — Style Reference
> neon highlighter on white paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Handshake runs on a monochrome canvas punched open by one radioactive lime (#d3fb52) that acts less like a brand color and more like a highlighter dragged across white paper. The system is deliberately binary: almost everything is black text on white surfaces, and then the accent ignites — on nav pills, primary actions, and the hero's cyan-to-lime radial glow. Custom NoiGrotesk carries the UI with tight tracking and three stylistic sets (ss03, ss06, ss12) active everywhere, while SansPlomb at 201px declares the page in display headlines so large they feel architectural rather than typographic. Surfaces are pillow-soft (24px on cards and inputs), buttons are compact (8px), and the overall density is comfortable — the page breathes because the typography and gradient do the heavy emotional work, not ornament.

## Colors

| Name | Value | Role |
|------|-------|------|
| Voltage Lime | `#d3fb52` | Primary action fill, nav pill, active state, hero gradient endpoint — the single chromatic ignition point against an otherwise monochrome system |
| Cyan Spark | `radial-gradient(at 55% 45%, rgb(122, 243, 255) 0%, rgb(211, 251, 82) 70%, rgba(0, 0, 0, 0) 76%)` | Hero gradient start point, secondary glow tone — pairs with Voltage Lime to create the aurora-like radial background |
| Mid Abyss | `#052326` | Footer surface, dark section backgrounds — a near-black with a subtle teal undertone that keeps the dark mode on-brand |
| Carbon Ink | `#14151c` | Primary text, icon strokes, input borders — the slightly cool near-black used for the majority of foreground content |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text on lime fills, input interiors — the dominant surface tone (1590+ appearances) |
| True Black | `#000000` | Nav borders, strong text emphasis, icon fills — used sparingly where maximum contrast is needed |
| Ash | `#666666` | Body helper text, muted body borders — the secondary text level for de-emphasized copy |

## Typography

### NoiGrotesk — Primary UI and body typeface — handles all navigation, buttons, inputs, cards, and headings up to 40px. Custom grotesque with active stylistic sets ss03, ss06, and ss12 that subtly shape letterforms across the entire system
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16, 20, 22, 28, 40
- **Line height:** 0.85, 1.10, 1.40, 1.50
- **Letter spacing:** -0.025em at 40px, -0.020em at 22–28px, -0.015em at 14–20px, normal at 12–16px
- **OpenType features:** `"ss03" on, "ss06" on, "ss12" on`

### SansPlomb — Display-only typeface for hero and section-defining headlines. Used at 201px with ultra-tight 0.80 line-height and -0.020em tracking — the sheer scale makes the headline feel architectural, not typographic
- **Substitute:** Druk Wide, Obviously, or Knockout
- **Weights:** 600
- **Sizes:** 201
- **Line height:** 0.80
- **Letter spacing:** -0.020em at 201px

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5
- **OpenType features:** `"ss03", "ss06", "ss12"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | -0.015px |
| body | — | — | 16px | 1.5 | -0.015px |
| subheading | — | — | 20px | 1.4 | -0.015px |
| heading-sm | — | — | 22px | 1.1 | -0.02px |
| heading | — | — | 28px | 1.1 | -0.02px |
| heading-lg | — | — | 40px | 0.85 | -0.025px |
| display | — | — | 201px | 0.8 | -0.02px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 24px
- **inputs:** 24px
- **buttons:** 8px
- **navPills:** 8px

## Components

### Voltage CTA Button
**Role:** Primary action trigger

Filled with #d3fb52 Voltage Lime, #000000 text, 8px radius, 12px vertical / 16px horizontal padding. NoiGrotesk 16px weight 500. The lime fill is the only chromatic action surface in the system — it glows against the monochrome canvas.

### Ghost Button
**Role:** Secondary action trigger

Transparent fill, 1px #000000 border, #000000 text, 8px radius, 12px/16px padding. NoiGrotesk 16px weight 500. Used when a primary CTA is present and the secondary needs to recede.

### Sign Up Nav Pill
**Role:** Top-right primary action in header

#d3fb52 fill, #000000 text, 8px radius, 8px/16px padding, NoiGrotesk 14px weight 500. Distinct from the ghost Log In button beside it — the lime marks the desired action.

### Search Input
**Role:** Hero search bar for job queries

White fill, 1px #e5e5e5 border, 24px radius, 16px vertical / 24px horizontal padding. Placeholder text in #666666, 16px NoiGrotesk. A magnifier icon sits left, an arrow submit button sits right. The 24px radius is the softest radius in the system — this input is the user's main tool.

### Suggestion Chip
**Role:** Quick-select filter tags below search

Transparent fill, 1px #ffffff border on dark background (or #000000 on light), 9999px radius, 8px/16px padding. NoiGrotesk 14px. Fully pill-shaped — the 9999px radius makes these feel like removable labels.

### Job Card
**Role:** Individual job listing in results grid

White surface, 1px #e5e5e5 border, 24px radius, 24px internal padding. Company logo top-left, title in NoiGrotesk 20px weight 500, metadata in 14px #666666. No drop shadow — the border and radius provide structure.

### Hero Gradient Banner
**Role:** Page-opening atmospheric section

Full-bleed radial gradient from #7af3ff to #d3fb52 fading to transparent at ~76%, centered at ~50% 50%. 201px SansPlomb 600 headline in #ffffff. The gradient is the brand's signature — no other section uses this treatment.

### Footer
**Role:** Site-wide bottom navigation

#052326 Mid Abyss background, white text, 24px radius on outer container. Links in NoiGrotesk 14px. The dark footer is the only dark surface besides the hero, creating a bookend structure.

### Nav Link
**Role:** Header navigation items

NoiGrotesk 14px weight 500, #ffffff text on the dark hero header. No underline, no background — just the word in space, relying on the 8px padding and spacing to create hit areas.

## Do's and Don'ts

### Do
- Use #d3fb52 Voltage Lime only for the single most important action per view — CTAs, active nav pills, and the hero gradient endpoint
- Set font-feature-settings to 'ss03' on, 'ss06' on, 'ss12' on for all NoiGrotesk usage — the stylistic sets are part of the brand identity
- Apply 24px radius to all cards, inputs, and large containers; 8px to buttons and nav items; 9999px to tags and chips
- Use the radial cyan-to-lime gradient only in the hero and atmospheric section backgrounds — never on content cards or UI surfaces
- Anchor all spacing to the 8px base unit: 8, 16, 24, 32, 40, 80, 120px
- Keep the canvas #ffffff for 90% of the page — dark surfaces are limited to the hero gradient and the #052326 footer
- Set letter-spacing to -0.025em at 40px and tighten further as size increases — the system relies on dense tracking

### Don't
- Don't use #d3fb52 for body text, borders, icons, or non-action surfaces — it is an action color, not a decoration
- Don't use multiple chromatic colors — the system is monochrome with one accent; adding a second hue breaks the binary
- Don't apply drop shadows to cards or panels — depth comes from the 24px radius and hairline borders only
- Don't use system fonts as a substitute for NoiGrotesk at UI sizes — the custom letterforms and feature settings carry the identity
- Don't use display type (201px SansPlomb) more than once per page — its scale is meant to be a singular declaration
- Don't reduce the 24px input/card radius to match the 8px button radius — the soft/pillow vs compact contrast is intentional
- Don't use #000000 for large backgrounds — the system prefers #ffffff canvas with #052326 for the only dark surface

## Elevation

- **Search Input:** `0 1px 0 rgba(0,0,0,0.04)`

## Surfaces

- **Canvas** (`#ffffff`) — Default page background — the white paper the entire system sits on
- **Card** (`#ffffff`) — Elevated content blocks with 24px radius and hairline borders
- **Accent Surface** (`#d3fb52`) — Voltage Lime fills for CTAs, nav pills, and accent panels
- **Hero Glow** (`#7af3ff`) — Radial gradient origin — cyan-to-lime aurora on the hero
- **Dark Surface** (`#052326`) — Footer and dark section background — near-black with teal undertone

## Imagery

Minimal photography or illustration. The hero is a pure gradient aurora with no photographic content. Product UI relies on typography, the gradient, and the lime accent to create atmosphere. When imagery appears (job listings, company logos), it is contained within 24px-radius cards and treated as functional data, not decoration. The visual language is: gradient atmosphere + massive type + monochrome surface + one chromatic spark.

## Layout

Max-width 1200px centered container. Hero is full-bleed with a centered radial gradient and left-aligned 201px headline that dominates the viewport. Below the hero, content shifts to white-background sections with 80px vertical gaps. Search bar spans the container width within the hero. Suggestion chips sit below the search in a horizontal row. The page uses a single-column flow for the hero, transitioning to multi-column card grids (2–3 columns) in content sections. Navigation is a simple top bar with logo left, links center, and Log In / Sign Up right — no sticky behavior, no mega-menu.

## Similar Brands

- **Linear** — Both use a near-monochrome interface with a single vivid accent color and custom geometric sans-serif typography with tight tracking
- **Spotify Design** — Similar binary palette approach — white/black canvas with a single high-saturation accent (lime for Handshake, green for Spotify) and oversized display headlines
- **Arc Browser** — Shared philosophy of one explosive accent color against a neutral system, with custom typography and gradient hero treatments
- **Substack** — Both rely on massive display type as the primary visual element, monochrome layouts, and a single accent color for interactive elements
