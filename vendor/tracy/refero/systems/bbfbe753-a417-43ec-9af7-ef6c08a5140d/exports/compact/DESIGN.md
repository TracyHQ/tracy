# Design — Style Reference
> neon green glyph in a dark void

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Cash App's design system is a dark-mode monolith: near-black canvas, white type that ranges from whisper-quiet 10px labels to 122px display monuments, and exactly one chromatic accent — electric Cash Green — that appears almost never but defines the brand when it does. Depth is communicated through typographic scale and whitespace rather than shadows or layered surfaces; hairline silver borders (#e5e7eb) at sub-1px visual weight separate regions without breaking the void. The type scale is intentionally extreme: no medium headings exist between 16px body and 86px display, forcing dramatic contrast that makes every page feel like an editorial spread. Spacing is generous (64px section gaps, 30px internal padding) and density stays low — this system rewards restraint and punishes decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page canvas, inverted surfaces, display type on light blocks |
| Snow | `#ffffff` | Primary text, high-contrast headings, logo lockup fills |
| Mist | `#e5e7eb` | Hairline dividers, section borders, card outlines, link borders — the only structural separator in the system |
| Slate | `#858585` | Muted body text, secondary labels, list items, metadata |
| Fog | `#b3b3b3` | Tertiary text, disabled states, icon strokes, subtle UI annotations |

## Typography

### CashSans — All text — Cash App's custom geometric sans. The 400 weight handles body and utility; 500 for sub-labels and nav; 700 reserved for extreme display moments. The type scale is deliberately bimodal: micro (10–16px) for functional UI and monumental (86–122px) for editorial display, with nothing in between.
- **Substitute:** Inter, SF Pro Display, or General Sans
- **Weights:** 400, 500, 700
- **Sizes:** 10px, 12px, 16px, 86px, 117px, 122px
- **Line height:** 1.00 (display) / 1.50 (body & utility)
- **Letter spacing:** -0.015em across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | -0.15px |
| body | — | — | 16px | 1.5 | -0.24px |
| heading-lg | — | — | 86px | 1 | -1.29px |
| display | — | — | 117px | 1 | -1.755px |
| display-xl | — | — | 122px | 1 | -1.83px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 64px
- **Card padding:** 20-30px
- **Element gap:** 12px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 15px
- **buttons:** 0px

## Components

### Display Heading
**Role:** Hero and section titles

CashSans 700, 86–122px, line-height 1.0, letter-spacing -0.015em. Color: #ffffff. Sets editorial tone with monumental scale; never wraps below two lines. No medium-weight headings exist — this is the heading.

### Body Paragraph
**Role:** Descriptive content, explanations

CashSans 400, 16px, line-height 1.5, letter-spacing -0.015em. Color: #ffffff for primary, #b3b3b3 for secondary. Max-width should constrain reading measure; comfortable leading compensates for tight tracking.

### Micro Label
**Role:** Captions, metadata, section indices, footnotes

CashSans 500, 10–12px, line-height 1.5, letter-spacing -0.015em. Color: #858585. Uppercase optional. The second pole of the bimodal type scale — whisper-quiet against the display monuments.

### Hairline Divider
**Role:** Section separation, content boundaries

1px solid #e5e7eb. Full-width or inset. The only structural element separating regions — no cards, no shadows, no background fills. Dividers carry the entire structural load.

### Ghost Link
**Role:** Inline navigation, cross-references

CashSans 400, 16px, #ffffff. No underline by default; underline appears on hover. Inherits the flat, borderless language — no chip, no background, no arrow unless the link leaves the site.

### Muted Link
**Role:** Secondary navigation, footer links

CashSans 400, 12–16px, #858585. Same interaction model as ghost link but de-emphasized. Used for utility navigation where the user is leaving the primary content path.

### Logo Lockup
**Role:** Brand mark, app icon, favicon

The $ glyph in Cash Green (#00d54b) on the dark canvas, or inverted (#000000) on white inverted blocks. Rounded square container with 15px radius. Typically 48–80px display size. The only element that uses brand green.

### List Item
**Role:** Enumerated content, navigation menus, spec lists

CashSans 400, 12–16px, #ffffff or #858585. 1px #e5e7eb bottom border on each item. 20–30px vertical padding per item. Minimal hierarchy — no bullets, no icons, no indentation unless nested.

### Full-Bleed Section
**Role:** Page-level content blocks

100% width, #000000 background, 64px vertical padding (top and bottom). No max-width container — content sits on the raw canvas edge. Type provides internal structure.

### Rounded Image
**Role:** Product visuals, illustrative content

15px border-radius. No border, no shadow. The only radius in the system — a deliberate single-value choice that keeps the geometric language sharp while softening visual content.

### Icon
**Role:** UI affordances, decorative marks

CashSans glyphs or custom stroke icons. 1–1.5px stroke weight, #ffffff or #b3b3b3. No fill icons. Sized to match adjacent type (12–16px for inline, up to 24px for standalone).

## Do's and Don'ts

### Do
- Use #000000 as the page canvas for all primary screens; the dark void is the system's foundation
- Set display type at 86–122px in CashSans 700 with -0.015em tracking and line-height 1.0
- Separate content regions with 1px #e5e7eb hairline dividers — never with cards, shadows, or background fills
- Reserve Cash Green (#00d54b) for the $ logo and singular signature moments; one appearance per screen maximum
- Use 64px vertical padding for section gaps and 20–30px for internal content padding
- Apply 15px border-radius exclusively to images and logo containers; keep all other elements sharp-edged
- Maintain the bimodal type scale: jump from 16px body directly to 86px display with no intermediate heading sizes

### Don't
- Do not introduce box-shadows, drop-shadows, or glow effects — depth comes from contrast and scale only
- Do not use Cash Green on text, borders, or large fills — it loses impact at scale and belongs only in the logo
- Do not create medium-weight headings (20–40px range) — the gap between 16px and 86px is the system
- Do not add background colors to cards, buttons, or panels — everything sits flush on #000000
- Do not use border-radius on buttons, tags, or inputs — keep geometry sharp except for the 15px image/logo radius
- Do not exceed three text colors per screen (#ffffff, #b3b3b3, #858585) — the hierarchy is strict
- Do not use light theme surfaces except for rare inverted blocks; the dark canvas is non-negotiable

## Elevation

No shadows. Depth is achieved exclusively through hairline borders (#e5e7eb at 1px), whitespace, and extreme type-scale contrast. The dark canvas eliminates the need for elevated cards — everything sits flush on the void.

## Surfaces

- **Canvas** (`#000000`) — Full-bleed page background; the dark void the entire system sits on
- **Inverted Block** (`#ffffff`) — Inverted content panels (rare) — white blocks on the black canvas for emphasis

## Imagery

The visual language is almost entirely typographic and flat. The only chromatic element is the Cash Green $ logo mark. Imagery, when present, uses the 15px border-radius and sits directly on the black canvas without frames, captions, or supporting graphics. No photography, no illustration system, no decorative gradients — the void and the type do all the work.

## Layout

Full-bleed, edge-to-edge layout with no max-width container. Sections are separated by 64px vertical padding and hairline dividers rather than alternating background bands. The page rhythm is editorial: large white display type on black, generous breathing room, minimal navigation chrome. Content stacks vertically with centered alignment in hero moments. No card grids, no multi-column feature layouts — the system is a single-column editorial canvas. Navigation, when present, sits as a flat top bar with ghost links.

## Similar Brands

- **Linear** — Dark canvas with strict type-driven hierarchy and minimal chromatic accents
- **Vercel** — Black background, oversized display type, hairline structural dividers, near-zero decoration
- **Arc Browser** — Dark void aesthetic with one electric accent color and geometric type at extreme scales
- **Stripe** — Restraint-first system with generous spacing and type as the primary visual element
