# Midday — Style Reference
> Editorial broadsheet on parchment — a 72px serif headline over warm stone, spaced sans-serif body text, pill-shaped controls, zero shadows.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Midday reads like an editorial broadsheet translated to software: a warm parchment canvas, a spaced sans-serif body voice, and a serif display face that announces sections like magazine pull-quotes. The system is monochrome to the point of austerity — surfaces stack in warm off-whites, borders are hairline-thin, and chromatic color appears only as functional punctuation for financial data (a single moss green) and the dark filled CTA. Every interactive element is pill-shaped; nothing is squared off. The design is completely flat — no shadows, no gradients, no decorative depth. Spacing is compact and rhythmic on a 4px grid, keeping dense ledger data legible without breathing room.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#dbdad7` | Page canvas and hairline borders — the warm off-white that unifies every surface and defines every divider at 1px |
| Paper | `#ffffff` | Card surfaces, input fields, pill button fills — pure white sits one level above the warm canvas |
| Sand | `#e6e4e0` | Secondary surface for table rows, inset panels, and tonal contrast between stacked cards |
| Ink | `#121212` | Primary text, icons, and logo — near-black for maximum contrast against parchment and paper |
| Smoke | `#616161` | Secondary text, muted labels, chart axis lines, non-active icon strokes |
| Charcoal | `#18181b` | Primary action fill — dark filled buttons and active navigation state, white text reverses on top |
| Moss | `#4caf50` | Green text accent for links, tags, and emphasized short phrases |

## Typography

### Hedvig Letters Sans — Body text, navigation, labels, buttons, and mid-weight headings. The positive letter-spacing (0.05em at small sizes, 0.025em at large) creates a distinctive editorial voice — most interfaces tighten spacing as size grows, this one widens it. Weight 400 for prose, 500 for labels and nav links.
- **Substitute:** Inter (400, 500) with letter-spacing overridden, or General Sans
- **Weights:** 400, 500
- **Sizes:** 10px, 11px, 12px, 14px, 16px, 18px, 20px, 24px, 48px, 508px
- **Line height:** 1.0–1.63
- **Letter spacing:** 0.05em at 10–14px (0.5–0.7px), 0.025em at 16–48px (0.4–1.2px)

### Hedvig Letters Serif — Display headings and section titles. The serif/sans contrast is the signature editorial moment — 72px serif with -0.025em tracking sits above spaced sans-serif body. Weight stays at 400 even at display size; the font carries authority through form, not weight.
- **Substitute:** GT Sectra, Tobias, or Source Serif 4 (400)
- **Weights:** 400
- **Sizes:** 24px, 72px
- **Line height:** 1.0–1.33
- **Letter spacing:** -0.025em at all sizes (-0.6px at 24px, -1.8px at 72px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.56 | 0.5px |
| body | — | — | 14px | 1.43 | 0.7px |
| heading-sm | — | — | 20px | 1.4 | 0.5px |
| heading | — | — | 24px | 1.33 | -0.6px |
| heading-lg | — | — | 48px | 1 | 1.2px |
| display | — | — | 72px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **icons:** 8px
- **pills:** 9999px
- **badges:** 9999px
- **inputs:** 8px
- **buttons:** 9999px

## Components

### Top Navigation Bar
**Role:** Site-wide header

Transparent over parchment canvas. Logo (sun mark) at far left, 4–5 text links (Features, Pricing, Story, Download, Resources) right-aligned with dropdown carets, outlined pill button at far right. 16px vertical padding, no border, no background fill.

### Announcement Pill
**Role:** Marketing announcement badge

White (#ffffff) fill, #dbdad7 1px border, 9999px radius. Padding 6px 12px. Text: 12px Hedvig Letters Sans weight 500, #121212, letter-spacing 0.6px. Optional trailing arrow icon in #121212.

### Primary CTA Button
**Role:** Dark filled pill button

#18181b fill, white text, 9999px radius. Padding 6px 16px. Text: 14px Hedvig Letters Sans weight 500, #ffffff, letter-spacing 0.7px. No border, no shadow.

### Ghost/Outline Button
**Role:** Secondary action (e.g. Sign in)

Transparent fill, #dbdad7 1px border, 9999px radius. Padding 6px 12px. Text: 14px Hedvig Letters Sans weight 500, #121212, letter-spacing 0.7px.

### Product Screenshot Frame
**Role:** Hero product showcase

Full-bleed section with #121212 or dark gradient background. Centered laptop/screen frame containing the live product UI (dashboard with sidebar nav, data cards, bar charts, tables). The dark frame is the only visual depth in the entire system.

### Integration Pill
**Role:** Third-party tool marker

White (#ffffff) fill, #dbdad7 1px border, 9999px radius. Padding 6px 10px. Contains a small grayscale tool logo (16px) + 12px sans-serif label. Arranged in a wrapping row with 8px gaps.

### Pricing Toggle
**Role:** Monthly/Yearly selector

Pill-shaped container with #e6e4e0 fill, 9999px radius. Two segments: inactive segment is transparent text, active segment has white (#ffffff) fill with 9999px radius. Text: 12px sans-serif weight 500.

### Pricing Card
**Role:** Plan tier display

White (#ffffff) fill, #dbdad7 1px border, 8px radius. Padding 24px. Tier name: 18px sans-serif weight 500, #121212. Price: 48px sans-serif weight 500, #121212, with /month suffix at 14px. Description and features in 14px body text, #616161. The 'Most popular' card adds a badge.

### Most Popular Badge
**Role:** Pricing card emphasis

White fill, #dbdad7 1px border, 9999px radius. Positioned at top-right of card, overlapping the border. Text: 12px sans-serif weight 500, #121212.

### Dashboard Data Card
**Role:** In-product stat tile

White (#ffffff) fill, #dbdad7 1px border, 8px radius. Padding 20px. Contains a category label (12px sans-serif, #616161), a primary value (24px sans-serif weight 500, #121212), and an optional mini-chart (bar or line, #dbdad7 strokes with #4caf50 or #121212 fills).

### Sidebar Navigation
**Role:** In-product left rail

Transparent or #ffffff fill, no border. Icons: 20px outlined style, #616161 default / #121212 active, 8px radius. Vertical stack with 8px gaps. Active item may show a subtle #e6e4e0 pill background.

### Data Table Row
**Role:** Financial data display

Transparent fill, #dbdad7 1px bottom border. Padding 12px 16px. Text: 14px sans-serif weight 400, #121212. Alternating rows use #e6e4e0 fill. Positive values shown in #4caf50.

## Do's and Don'ts

### Do
- Set body sans-serif text to 0.05em letter-spacing at 10–14px and 0.025em at 16px+ — the positive tracking is the system's editorial signature
- Use Hedvig Letters Serif at 72px with -0.025em tracking for display headlines; pair it with spaced sans-serif body below
- Set all buttons, badges, and pills to 9999px border-radius — no element in the interface is squared off
- Fill primary CTAs with #18181b and reverse to white text; keep all secondary actions as transparent ghost or outlined pills
- Use 1px #dbdad7 hairline borders for cards, inputs, and table rows — the same color as the canvas, so borders feel engraved not stamped
- Keep the canvas at #dbdad7 — never switch to cool grays, pure white page backgrounds, or off-brand cream tones
- Use #4caf50 only inside data contexts (chart bars, positive table values, status pills) — never as a button fill or decorative accent

### Don't
- Don't add box-shadows to any component — depth comes from surface tone shifts and hairline borders only
- Don't use #4caf50 for CTAs, links, or brand decoration — it's a data color, not an action color
- Don't apply negative letter-spacing to sans-serif body text — the positive tracking is the voice, not a bug to fix
- Don't use square corners on buttons, inputs, badges, or tags — everything interactive is pill-shaped
- Don't introduce blue, purple, or any second chromatic accent — the system is monochrome by design
- Don't use Hedvig Letters Serif for body copy, labels, or navigation — it's reserved for display headings at 24px and above
- Don't use cool gray borders or backgrounds — the warm stone palette (#dbdad7, #e6e4e0) is non-negotiable

## Elevation

Flat by design. Zero box-shadows, zero gradients, zero decorative depth. Hierarchy is communicated through surface tone shifts (parchment → sand → paper) and 1px hairline borders in the same warm stone color. The only depth cue is a dark device frame around the product screenshot — and even that is a photographic edge, not a CSS shadow.

## Surfaces

- **Parchment** (`#dbdad7`) — Page canvas — the warm stone that fills every background
- **Sand** (`#e6e4e0`) — Tonal shift for table bands and inset panels
- **Paper** (`#ffffff`) — Elevated cards, inputs, and product surfaces

## Imagery

Photography-free. The visual centerpiece is a single product screenshot presented in a dark laptop frame, showing a full dashboard with bar charts, line graphs, and data tables rendered in the same monochrome palette with moss-green data accents. Secondary imagery is limited to grayscale third-party tool logos (Slack, Stripe, Xero, etc.) used as integration markers. No decorative illustrations, no abstract graphics, no stock photography — the product UI itself is the hero visual.

## Layout

Max-width 1200px centered, generous 64px vertical gaps between sections. Hero is a centered text stack (announcement pill → serif display → sans subtext → CTA → trust line → tool logos) on the warm parchment canvas. The product screenshot breaks full-bleed with a dark device frame. Mid-page sections use centered text headings above wide grids (integration pills in a single flowing row, pricing cards in a 2-column grid). Navigation is a minimal top bar: logo left, right-aligned text links, outlined sign-in button. Content density is compact within cards and data tables, spacious between marketing sections.

## Similar Brands

- **Linear** — Same flat monochrome system with pill-shaped controls, hairline borders, and a single dark filled CTA — both treat shadow as a design failure
- **Mercury** — Same editorial typography approach for a financial product — warm canvas, serif/sans contrast, spaced sans-serif body, austere color palette
- **Arc Browser** — Same serif display + spaced sans-serif body pairing and pill-shaped UI elements that treat the browser/app as an editorial object
- **Stripe** — Same editorial typography discipline on marketing pages — large serif headlines above clean sans-serif body, generous whitespace, restrained color
