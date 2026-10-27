# Phantom Studios — Style Reference
> green signal line on a black void

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Phantom Studios operates as a near-totalist dark canvas: a single black field with one centered white text mark and a thin green horizon line anchoring the bottom of the viewport. The aesthetic is terminal-meets-poster — almost no chrome, no images, no navigation visible in the fold, just type on void with one signal color doing all the work. Typography is split between a geometric workhorse (Helvetica Now) for UI and display, and a tiny monospace face (ballinger-mono) for metadata, taglines, and trademark marks — the pairing reads as coded rather than designed. Everything is uppercase, everything is small, and the green line acts as a system indicator or cursor rather than decoration. The page makes you look harder than usual because there is almost nothing to look at; restraint is the product.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, primary surface — the only background; every other color reads as light emitted from this base |
| Pure White | `#ffffff` | All text, dividers, list markers, and outline borders — 21:1 contrast against Void means type is the loudest element on the page by far |
| Dark Graphite | `#333333` | Hairline borders, secondary dividers, and structural rules — sits just above the void to define edges without lifting weight |
| Mid Gray | `#666666` | Muted helper text and inactive label borders — 3.7:1 against black intentionally fails contrast, signaling de-emphasis rather than legibility |
| Signal Green | `#1eff66` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content |

## Typography

### Helvetica Now — Primary UI and display face — geometric grotesque set tight (0.93 on the 56px display creates an almost single-line block of text)
- **Substitute:** Inter, Helvetica Neue, Neue Haas Grotesk
- **Weights:** 400, 500, 700
- **Sizes:** 11, 16, 18, 22, 24, 56px
- **Line height:** 0.93 (display 56px), 1.20 (16–24px)

### ballinger-mono — Micro-copy, taglines, and trademark marks (the ® in 'PHANTOM STUDIOS® TECHNOLOGY CREATIVE'); 11px monospaced at 1.10 is intentionally difficult — it reads as metadata, not prose
- **Substitute:** JetBrains Mono, IBM Plex Mono, Berkeley Mono
- **Weights:** 400
- **Sizes:** 11px
- **Line height:** 1.10

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.1 | 0px |
| body | — | — | 16px | 1.2 | 0px |
| subheading | — | — | 18px | 1.2 | 0px |
| heading | — | — | 22px | 1.2 | 0px |
| heading-lg | — | — | 24px | 1.2 | 0px |
| display | — | — | 56px | 0.93 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 88px
- **Card padding:** 24-40px
- **Element gap:** 16px

### Border Radius

- **tags:** 14px
- **cards:** 14px
- **buttons:** 14px

## Components

### Centered Display Lockup
**Role:** Primary brand mark for hero/landing screens

Vertically and horizontally centered all-caps wordmark 'PHANTOM STUDIOS® TECHNOLOGY CREATIVE' — Helvetica Now 400 at 16px white (#ffffff) on Void (#000000), line-height 1.20, with a ballinger-mono 11px superscript ® separating the two phrases. Total lockup spans the full viewport with massive negative space above and below — the mark reads at arm's length.

### Signal Horizon Line
**Role:** Page-level system indicator and visual anchor

A 1–2px tall Signal Green (#1eff66) horizontal rule pinned to the absolute bottom edge of the viewport, full-bleed. Functions as a loading/scan bar, a system status pulse, or a closing punctuation mark. 15.6:1 contrast against Void makes even a hairline register as a deliberate UI event.

### Outlined Link / Ghost Action Border
**Role:** Interactive text and outline-button borders

White (#ffffff) 1px border on transparent Void fill. ACTION_BORDER evidence is strong (270 instances on #ffffff, 90 on #333333) — links and outline buttons are rendered as border-only geometry, never as filled shapes. Inset text 16px Helvetica Now 500, uppercase, letter-spacing normal.

### Section Divider
**Role:** Horizontal rule between content blocks

Dark Graphite (#333333) 1px full-width line, 16px vertical padding above and below. Used to separate stacked sections without introducing a surface change — the void remains continuous.

### Mono Caption / Tagline Strip
**Role:** Micro-copy, version marks, and metadata

ballinger-mono 400 at 11px, line-height 1.10, Pure White (#ffffff) on Void. Always uppercase, always tracked at normal. Sits as a small secondary line under or beside display type, reading as a system log rather than marketing copy.

### List Marker
**Role:** Ordered/unordered list bullets and item separators

White (#ffffff) 1px borders used as inline list rules (list/borderColor=1796 instances). Lists are rendered as text with thin white horizontal rules between items rather than bullet glyphs — a terminal-list aesthetic.

### Input / Form Field
**Role:** Text fields and form controls

Transparent Void fill with White (#ffffff) 1px border, 14px corner radius, 16px Helvetica Now 400 in white, 11px ballinger-mono placeholder in Mid Gray (#666666). Focus state thickens the border to 2px and shifts to Signal Green (#1eff66) — the only time green touches a component.

### Tag / Chip
**Role:** Category labels and status pills

White (#ffffff) 1px border, Void fill, 14px radius, ballinger-mono 11px uppercase white text, 3px vertical / 8px horizontal padding. No fill color — tags are always hollow.

## Do's and Don'ts

### Do
- Use #1eff66 only on the viewport-edge signal line and on input focus borders — it is a system event color, not a decoration
- Keep all type uppercase across all sizes — mixed case breaks the coded/terminal reading
- Use 14px radius for every rounded component (tags, inputs, buttons) — the single radius value unifies the system
- Center critical content both vertically and horizontally in the viewport; the void is the layout grid
- Pair Helvetica Now with ballinger-mono so every screen has a geometric-plus-mono contrast — never use a second sans-serif
- Set display type (56px) at line-height 0.93 so multi-line headlines almost touch — the tight lockup is signature
- Use Dark Graphite (#333333) for structural rules and White (#ffffff) for interactive borders — gray signals passive, white signals actionable

### Don't
- Never fill a button or surface with a solid color — the system is outline-only on transparent void
- Never use #1eff66 on body text, icons, or large surfaces — a single pixel-thin line is the maximum dose
- Never introduce shadows, blurs, or gradients — depth must come from the green horizon line alone
- Never use Mid Gray (#666666) for primary text — it intentionally fails contrast and should only mark inactive/muted states
- Never mix in a third font family — Helvetica Now for structure, ballinger-mono for metadata, nothing else
- Never pad sections less than 48px — the void needs breathing room; compact spacing collapses the poster effect
- Never use a color background for cards or panels — every surface stays transparent over Pure Black

## Elevation

No shadows. Depth is communicated through the single Signal Green accent line at the viewport edge — the only element that implies a plane above the void. Everything else sits flush on Pure Black, relying on contrast and weight (not elevation) to establish hierarchy.

## Surfaces

- **Void** (`#000000`) — Unified page canvas — no distinction between background and surface; the entire site is one black field
- **Signal Green Plane** (`#1eff66`) — Edge-of-screen accent stripe that doubles as a system indicator and the only non-monochrome surface

## Imagery

No photography, illustration, or product imagery. The page is pure type on void with one Signal Green horizon line. Any visual content would compete with the terminal aesthetic and is treated as out-of-system. Iconography (if present elsewhere) is line-only in White (#ffffff) with 1px stroke, never filled and never green.

## Layout

Full-bleed viewport — no max-width container, no side margins. The hero is a single centered text lockup with the entire viewport as negative space around it. The Signal Green line sits at the absolute bottom edge of the viewport (not the page) as a system indicator. Navigation is absent from the visible fold; the page is treated as a poster rather than a document. Section rhythm is defined by Dark Graphite (#333333) 1px horizontal dividers with 88px vertical spacing, not by alternating surface colors — the void remains continuous top to bottom.

## Similar Brands

- **Active Theory** — Dark immersive canvas, single-color accent punctuation, geometric sans display type centered on near-empty viewport
- **Resn** — Creative technology studio aesthetic with near-monochrome dark pages, minimal chrome, and one signature accent doing all the work
- **Pentagram partner sites** — Poster-like centered lockups on void, Helvetica/Helvetica-class type, uppercase wordmarks, no decoration
- **Instrument** — Creative technology agency using black canvas with selective chromatic accent lines and tight geometric typography
- **Ueno** — Creative agency with all-caps wordmark, monospace metadata, and a single neon signal color against pure black
