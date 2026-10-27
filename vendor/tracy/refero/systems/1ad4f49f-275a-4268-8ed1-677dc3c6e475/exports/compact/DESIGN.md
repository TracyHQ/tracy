# Increase — Style Reference
> institutional blueprint on vellum — one electric chartreuse stripe cuts the navy calm, mint data signals pulse beneath it.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Increase projects the quiet authority of institutional banking through a disciplined navy-and-paper palette, with chartreuse and mint used as deliberate voltage — the only colors bright enough to stop the eye. Typography is structurally mathematical: a custom grotesque (Untitled Sans) pulled tight with negative tracking pairs with a monospaced companion (Input Mono) for code, creating a typographic handshake between API documentation and product surface. Cards float on a warm off-white canvas with subtle tinted shadows rather than hard borders, while a gradient hero grounds the page in cool-to-warm motion. Buttons are nearly black ink on paper — the action language is gravitas, not energy, leaving the accent colors free to signal features, status, and data flow.

## Colors

| Name | Value | Role |
|------|-------|------|
| Inkwell Navy | `#1a2b3b` | Primary text, nav text, icon strokes, hairline borders — the structural graphite of every screen. Used as filled button background for primary actions to project institutional weight rather than enthusiasm |
| Slate 600 | `#314352` | Secondary borders and supporting text where Inkwell Navy is too heavy — outlines on cards, tertiary headings, subdued dividers |
| Abyss | `#0d1726` | Dark code-block and terminal surfaces — deeper than Inkwell Navy so syntax highlighting reads with high voltage against the near-black |
| Graphite | `#687887` | Muted helper text, inactive nav links, secondary button outlines — recedes so the navy headlines and mint accents can carry the hierarchy |
| Steel | `#8995a1` | Tertiary text and disabled-state borders — the quietest navy in the scale, used where information is supplementary |
| Fog | `#edf0f2` | Page canvas — the warm off-white that holds all content; section bands alternate with pure white to create quiet vertical rhythm |
| Pure White | `#ffffff` | Card surfaces, form inputs, nav background — the elevated layer that floats above Fog with minimal shadow |
| Silver | `#caced2` | Hairline dividers, input borders at rest, table separators — the thread that separates without announcing itself |
| Mist | `#e1e5e9` | Card edges and subtle surface tints where a second neutral step is needed between white and Fog |
| Pewter | `#bdc2c8` | Body-level borders, subtle rule lines, the quietest non-white neutral |
| Voltage | `#e4ff33` | Announcement bar, high-attention data highlights, occasional feature accent — the single chromatic punctuation that earns the eye's attention by being used sparingly. Never decorates, always signals |
| Mint Signal | `#31f2bf` | Green outline accent for tags, dividers, and focused UI edges |

## Typography

### Untitled Sans — Primary interface and display typeface — custom geometric grotesque. Weight 400 runs the body and UI; weight 500 lifts subheadings; weight 700 anchors the wordmark. Negative letter-spacing (-0.04em at display sizes, -0.01em at body) tightens the grotesque into a dense, architectural feel — the closer the eye gets to a heading, the more the letters close ranks, producing a precise, financial-document quality.
- **Substitute:** Inter
- **Weights:** 400, 500, 700
- **Sizes:** 10px, 14px, 16px, 20px, 24px, 32px, 40px, 90px
- **Line height:** 1.00–1.50
- **Letter spacing:** -5.4px at 90px, -1.6px at 40px, -0.32px at 32px, -0.24px at 24px, -0.2px at 20px, -0.16px at 16px, -0.14px at 14px

### Input Mono — Code, API identifiers, numerical data, and inline technical labels. Alternates and stylistic sets ss01/ss02/ss12 are active — these micro-detailed glyph variants give the monospace a humanist, designed quality rather than a default-terminal feel, reinforcing that the product is engineered with intention.
- **Substitute:** JetBrains Mono
- **Weights:** 400
- **Sizes:** 10px, 13px, 14px, 20px
- **Line height:** 1.43–1.60
- **Letter spacing:** -0.14px at 14px, -0.13px at 13px, -0.1px at 10px, -0.2px at 20px
- **OpenType features:** `"ss01" on, "ss02" on, "ss12" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 1.6 | -0.1px |
| caption | — | — | 13px | 1.54 | -0.13px |
| body | — | — | 16px | 1.43 | -0.16px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 24px | 1.17 | -0.96px |
| heading | — | — | 32px | 1.13 | -1.28px |
| heading-lg | — | — | 40px | 1.1 | -1.6px |
| display | — | — | 90px | 1 | -5.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20-24px
- **Element gap:** 8-12px

### Border Radius

- **tags:** 4px
- **cards:** 12px
- **pills:** 999px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Announcement Bar
**Role:** Full-bleed top-of-page strip for time-bound news, awards, and feature launches.

Background #e4ff33 (Voltage), Inkwell Navy (#1a2b3b) text at 14px weight 500, 4px vertical padding, centered content with an inline chevron. The only place chartreuse earns full-bleed real estate — treat as rare, never decorative.

### Top Navigation
**Role:** Primary header carrying brand, product taxonomy, account actions.

White (#ffffff) background, 64–72px tall, brand wordmark left at 20px weight 700, nav links at 16px weight 500 Inkwell Navy with 8px gap. Right cluster: text-link 'Sign in' (Graphite #687887) and filled primary 'Sign up' (Inkwell Navy bg, white text, 8px radius, 10px 20px padding). Hairline 1px Silver (#caced2) bottom border.

### Primary Filled Button
**Role:** The default action affordance — sign-up, create, submit.

Inkwell Navy (#1a2b3b) background, white text at 16px weight 500, 8px radius, 10px vertical / 20px horizontal padding, subtle two-layer black shadow (0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)). Trailing chevron is part of the variant grammar. Letter-spacing -0.16px.

### Ghost / Outlined Button
**Role:** Secondary actions — 'Contact sales', 'Sign in', 'Learn more'.

Transparent background, 1px Inkwell Navy border, Inkwell Navy text, 8px radius, 10px 20px padding, trailing chevron at right. When on white cards, the border is the only visual weight.

### Hero Headline
**Role:** Page-opening display line establishing product category.

Untitled Sans 90px / line-height 1.0, weight 500, Inkwell Navy, letter-spacing -5.4px (-0.06em). Set tight on two lines; the extreme negative tracking is the signature — the headline reads as a single dense block of type rather than airy display copy.

### Hero Subtext
**Role:** Supporting paragraph under the headline.

Untitled Sans 20px / line-height 1.4, weight 400, Graphite (#687887), letter-spacing -0.2px. Max width ~540px, two to three lines, left-aligned.

### Code Block Card
**Role:** Live API demonstration embedded in hero and feature sections.

Abyss (#0d1726) background, 12px radius, 20–24px padding, soft navy-tinted shadow. Syntax uses Input Mono 14px: keywords in Voltage (#e4ff33), strings in Mint Signal (#31f2bf), identifiers in light blue (#33bbff — content-only, not a UI token), numbers in white. Line numbers and line-height 1.54. The dark card sits as the visual counterweight to the white form card beside it.

### Product Feature Card
**Role:** Feature highlight in a 4-column grid (ACH, Cards, Bank accounts, Wires, etc.).

White (#ffffff) background, 12px radius, 1px Mist (#e1e5e9) border, 20–24px padding, faint tinted shadow. Mint Signal (#31f2bf) icon container at top-left — a 40–48px square with 1.5px stroke icon on a subtle mint-tinted surface. Title at 16px weight 500 Inkwell Navy, description at 13px Graphite, 8px vertical gap between.

### Icon Badge
**Role:** Reusable icon container for feature cards and inline labels.

40×40px (or 48×48px) square, 8px radius, Mint Signal (#31f2bf) 1.5px stroke icon centered on a near-white mint-tinted fill (rgba(49,242,191,0.08) effect). The mint-on-mint treatment is the visual signature of an 'active system feature'.

### Trust Logo Bar
**Role:** Social proof band beneath the hero.

Fog (#edf0f2) full-bleed band, centered row of monochrome navy wordmarks (gusto, stripe, ramp, check, AtoB, vantaca, coast) at 24–28px, all rendered in Inkwell Navy or Graphite, 48–64px gap between logos. No logos are colored — uniformity signals impartiality.

### Gradient Accent Visual
**Role:** Decorative hero backdrop and feature-section color washes.

Series of left-to-right linear gradients cycling through Voltage → mint → cyan → blue (linear-gradient(90deg, #deff34, #8cf97c), → linear-gradient(90deg, #65f75f, #12f0aa), → linear-gradient(90deg, #45f4bc, #33dfdf), → linear-gradient(90deg, #01d3d8, #02b7f1)). Used as 3D geometric blocks floating behind hero content, clipped with sharp angular edges — never soft-blurred.

### Form Input
**Role:** Text input in the hero demo card ('Send an ACH transfer').

White background, 1px Silver (#caced2) border, 8px radius, 12–16px padding, 16px body text Inkwell Navy. Label above at 13px weight 500 Graphite. Focus state: 2px Mint Signal border. Active/highlighted input shows a mint-tinted fill.

### Step Progress Indicator
**Role:** Multi-step flow visualization inside product cards.

Horizontal line with two filled mint nodes connected by a 2px Mint Signal stroke. A third node appears as a hollow mint circle indicating pending step. Label set in 14px Input Mono for numerical precision feel.

## Do's and Don'ts

### Do
- Use Inkwell Navy (#1a2b3b) as the only filled-button background — never a chromatic fill for a primary action.
- Set display type at 90px with -5.4px letter-spacing to preserve the dense, financial-document quality of headlines.
- Apply the Voltage (#e4ff33) announcement-bar color only on full-bleed strips or single token highlights — never on cards, buttons, or text.
- Use 12px radius for cards and 8px radius for buttons, inputs, and nav; reserve 999px exclusively for pill tags.
- Pair Untitled Sans for prose and UI with Input Mono (with ss01/ss02/ss12 active) for all code, numbers, and API identifiers.
- Let cards float on Fog (#edf0f2) canvas with the navy-tinted three-layer shadow stack rather than hard borders.
- Render the four-step gradient (chartreuse → mint → cyan → blue) only as angular geometric blocks behind hero copy — never as soft glows or button backgrounds.

### Don't
- Don't use Mint Signal (#31f2bf) or Voltage (#e4ff33) as a primary button fill — they are signal colors, not action colors.
- Don't add a second saturated accent — the system runs on navy + chartreuse + mint only; introducing a fourth chromatic breaks the institutional register.
- Don't use straight #000000 for text on white surfaces — Inkwell Navy reads as authoritative while pure black reads as unfinished.
- Don't soften the hero gradients with blur or rounded edges — the angular, faceted geometry is what makes them read as financial infrastructure rather than marketing artwork.
- Don't use letter-spacing greater than -0.01em at body sizes — the negative tracking is what makes Untitled Sans feel architectural; loosening it dissolves the brand.
- Don't promote the code-syntax blue (#33bbff) into the UI palette — it exists only inside the code-block context.
- Don't add a dark mode variant without rebuilding the canvas as a warmer near-black (#0d1726-family) — the cool gray-navy scale does not invert cleanly to a black scale.

## Elevation

- **Cards (standard):** `0px 6px 8px 0px rgba(12, 25, 39, 0.03), 0px 18px 22px 0px rgba(12, 25, 39, 0.09)`
- **Cards (elevated/feature):** `0px 6px 8px 0px rgba(12, 25, 39, 0.05), 0px 16px 20px 0px rgba(12, 25, 39, 0.06), 0px 50px 60px 0px rgba(12, 25, 39, 0.1)`
- **Buttons:** `0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)`

## Surfaces

- **Page Canvas** (`#edf0f2`) — Warm off-white field that holds all content sections; provides the neutral backdrop against which white cards and the chartreuse announcement bar gain their contrast.
- **Card Surface** (`#ffffff`) — Pure white for product cards, feature panels, nav, and inputs — the layer that floats above canvas with subtle tinted shadow.
- **Code Surface** (`#0d1726`) — Deepest surface in the system, used exclusively for code blocks and terminal demos; syntax colors (mint, blue, chartreuse) pop against it.
- **Announcement Surface** (`#e4ff33`) — Single-purpose full-bleed strip for time-sensitive messaging; the only surface in the system with native chromatic energy.

## Imagery

Imagery is sparse and product-driven. The hero is dominated by two UI cards (dark code block, light form) rather than photography, with a single 3D geometric gradient block floating behind — angular, faceted, no rounded edges or soft glows. Feature sections use iconography (mint-stroke line icons in tinted squares) rather than screenshots or photos. The trust band is a row of monochrome navy wordmarks. No lifestyle photography appears anywhere — the visual language is deliberately diagrammatic, closer to a financial terminal than a consumer fintech.

## Layout

Max-width 1200px centered container with a 80–96px section gap between major bands. The hero is a split composition: left half holds the 90px headline, subtext, and two-button cluster; right half holds the dual-card visual stack (dark code card below, white form card above, both with a subtle 12px offset). Below the hero sits a centered trust-logo band, then a centered heading plus 4×2 product feature grid on Fog canvas, then alternating white/Fog content bands. Navigation is a single sticky top bar with a separate chartreuse announcement strip above it. Sections are separated by background-color alternation rather than dividers — vertical rhythm comes from canvas color, not rules.

## Similar Brands

- **Modern Treasury** — Same institutional-navy-on-warm-canvas fintech-API visual register with tight grotesque typography and dark code surfaces as the product hero.
- **Plaid** — Banking-infrastructure brand language: restrained near-black text, white cards, single bright accent for data flow, monospaced type for API credibility.
- **Mercury** — Premium fintech with a muted navy/paper palette and minimal use of color — confidence through typographic discipline rather than chromatic energy.
- **Linear** — Geometric grotesque at display sizes with extreme negative tracking, paper-canvas surface, and accent color used as rare data signal rather than decoration.
- **Stripe** — Developer-facing financial product with the same code-block-into-product-surface integration and institutional restraint in the primary palette.
