# Balsa — Style Reference
> engineering notebook on white drafting paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Balsa's design language is an engineering notebook on white drafting paper: an almost exclusively achromatic canvas interrupted only by amber highlighter-pen annotations and one deep purple accent. The hero voice is Van Condensed Pro Bold set uppercase at extreme negative tracking (-0.047em at 48px) — industrial, compressed, shouting in a whisper. Inter handles every secondary voice at compact sizes (11–18px), with the entire interface reading as product-first: a large embedded product screenshot is the real hero, flanked by floating yellow callout cards that explain the screenshot like margin notes. Black filled buttons with 6px radius and 12px-radius flat white cards with hairline borders carry the entire component vocabulary. Shadows are barely there (0.5px black at 10% or a single 1px line at 5%), the palette does almost no decorative work, and the layout breathes with generous 60–80px section gaps so each annotation card and product crop can do its job.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon Black | `#000000` | Primary text, filled action buttons, icons — the only assertive color in the system carries all interactive and typographic weight |
| Paper White | `#ffffff` | Card surfaces, product screenshot backgrounds, button labels on filled buttons |
| Drafting Gray | `#f7f7f7` | Page canvas, the base surface every component sits on; sets the off-white tone that makes cards read as elevated without shadow |
| Graphite | `#313131` | Secondary headings and body emphasis, slightly softer than pure black for hierarchical depth |
| Pencil Gray | `#686868` | Muted helper text, inactive metadata, subtle icon fills, soft borders on secondary surfaces |
| Faint Gray | `#bbbbbb` | Disabled state surfaces, ultra-quiet dividers, placeholder card backgrounds |
| Charcoal Trace | `#7c7c7c` | Tertiary caption text, very subtle annotation labels |
| Highlighter Amber | `#ffb700` | Annotation callout cards, highlight washes, tag pills — the single chromatic accent that mimics yellow highlighter on paper, used sparingly as functional punctuation not decoration |
| Indigo Ink | `#914db2` | Pink outline accent for tags, dividers, and focused UI edges. |
| Link Navy | `#003399` | Outlined link borders and underlined text links — a classic editorial link blue, used only for inline hyperlink elements |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Van Condensed Pro Bold — Hero display headlines, section titles — the signature voice. Used uppercase at tight tracking to create compressed, industrial-scale authority that contrasts against the soft canvas. The only place the system shouts.
- **Substitute:** Oswald Bold, Bebas Neue, Antonio
- **Weights:** 400 (display weight built into family)
- **Sizes:** 24px, 32px, 48px
- **Line height:** 1.20–1.50
- **Letter spacing:** -0.047em at 48px, -0.031em at 32px

### Inter — Primary UI and body typeface. Carries 90% of the interface: navigation, buttons, body copy, list items, small headings. The 500/600 weights step in for UI emphasis; 700 is reserved for short label headings. Light negative tracking (-0.01em) at all sizes gives it a slightly tightened, modern feel without becoming display-level.
- **Substitute:** system-ui, -apple-system, Helvetica Neue
- **Weights:** 400, 500, 600, 700
- **Sizes:** 11px, 14px, 16px
- **Line height:** 1.18–2.00
- **Letter spacing:** -0.010em

### Roboto Mono — Code-style labels, keyboard shortcuts, technical metadata, monospaced micro-text within product chrome
- **Substitute:** IBM Plex Mono, Source Code Pro
- **Weights:** 400
- **Sizes:** 11px, 13px
- **Line height:** 1.20

### Inter-Bold — Inter-Bold — detected in extracted data but not described by AI
- **Weights:** 700
- **Sizes:** 11px, 14px, 18px
- **Line height:** 1.2, 1.43, 1.64, 2
- **Letter spacing:** -0.01

### Noto Sans Mono — Noto Sans Mono — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 11px
- **Line height:** 1.2

### Inter-Medium — Inter-Medium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.43, 1.5, 2

### Inter-Light — Inter-Light — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 11px
- **Line height:** 1.73
- **Letter spacing:** -0.01

### Inter-Black — Inter-Black — detected in extracted data but not described by AI
- **Weights:** 900
- **Sizes:** 24px
- **Line height:** 1.2

### Inter-SemiBold — Inter-SemiBold — detected in extracted data but not described by AI
- **Weights:** 600
- **Sizes:** 32px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | -0.01px |
| body | — | — | 14px | 1.5 | -0.01px |
| subheading-lg | — | — | 18px | 1.73 | -0.01px |
| heading-sm | — | — | 24px | 1.2 | -0.047px |
| heading | — | — | 32px | 1.2 | -0.031px |
| display | — | — | 48px | 1.2 | -0.047px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 30px
- **Element gap:** 10px

### Border Radius

- **tags:** 12px
- **cards:** 12px
- **icons:** 12px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Primary Filled Button
**Role:** The sole action button in the system

Solid #000000 background, #ffffff label text, Inter 14px weight 600, 6px border radius, 8px vertical × 20px horizontal padding, no border, no shadow. Compact and rectangular — the small radius and tight padding make it feel utilitarian, not marketing.

### Ghost Navigation Button
**Role:** Secondary nav actions like 'Log in'

Transparent background, #686868 or #000000 text, Inter 14px weight 400, no border, no padding beyond text. Sits quietly in the top-right header.

### Acquisition Banner
**Role:** System-level announcement strip

#000000 background, #ffffff text, centered, compact 8px vertical padding, Inter 12-14px weight 500, with a right-arrow chevron. Pill or rounded-rectangle shape with small radius. Black-on-black urgency.

### Product Screenshot Card
**Role:** Hero visual — the product UI itself is the hero

#ffffff background, 12px border radius, 0.5px hairline border at rgba(0,0,0,0.1), no internal padding (screenshot fills edge-to-edge), 30px margin clearance around it. Sometimes extends beyond page max-width for emphasis.

### Annotation Callout Card
**Role:** Floating feature callouts beside the product screenshot

#ffb700 amber background, #000000 text, Inter 14-16px weight 600 uppercase heading followed by body copy at weight 400, 12px border radius, 20-30px padding, no border, no shadow. Positioned with slight overlap or margin to the product card, creating the 'highlighter on printout' metaphor.

### Pricing Tier Card
**Role:** Starter / Professional / Enterprise plan display

#ffffff background, 12px border radius, subtle 0.5px hairline border, 30px padding, vertical stack: icon + tier name, large price in Inter 32px weight 700, billing cadence in #686868 body, feature checklist with #000000 checkmarks, and a filled black CTA button at the bottom.

### Feature Checklist Item
**Role:** Pricing list bullets and benefit lists

Stacked rows with 10px vertical gap. Inter 14px weight 400, #000000 text, preceded by a small #000000 checkmark or arrow glyph. No background, no borders — pure typographic rhythm.

### Module List Item
**Role:** Product feature rows like 'Kickoff prep' or 'Text Formatting'

Inter 16px weight 600 heading with leading indigo (#914db2) icon, followed by 8-10px gap to a stack of task items. Each task is a 14px row with a #000000 checkbox and optional #686868 assignee avatar on the right.

### Header Bar
**Role:** Site-wide navigation

Transparent background over #f7f7f7 canvas. Left: balsa wordmark (small SVG mark + Inter 14px wordmark, #000000). Right: 'Log in' ghost button. No nav menu items — minimal to the point of absence. Fixed/sticky not visually indicated.

### Tag Pill
**Role:** Status badges like 'In progress' or 'Next week'

12px border radius, 4-8px vertical × 8-12px horizontal padding, #000000 text on #f7f7f7 background or white background, Inter 11-12px weight 500, often with a small leading dot in #000000 or accent color.

### Section Heading Block
**Role:** Section titles like 'Get started quickly'

Van Condensed Pro Bold, 24-32px, uppercase, #000000, letter-spacing -0.031em to -0.047em, centered or left-aligned depending on section, followed by 16-20px gap to a single-line Inter 14-16px #686868 subtitle.

## Do's and Don'ts

### Do
- Use Van Condensed Pro Bold uppercase at 32-48px with -0.047em tracking for all hero and section display headlines — this is the signature voice.
- Keep the canvas at #f7f7f7 and let cards read as elevated through white-on-off-white brightness contrast rather than shadow.
- Use #ffb700 amber only for annotation callout cards and highlight washes — never for buttons, backgrounds, or body text.
- Set all primary action buttons to #000000 fill with 6px radius, Inter 14px weight 600, and 8px × 20px padding.
- Maintain 12px border radius on all cards, product surfaces, and icons — 6px on all buttons and inputs.
- Use #914db2 violet only for small inline accents: badges, icon strokes, link underlines, and inline tags under 60px wide.
- Keep section gaps at 80px and product screenshot cards breathing with at least 30px of clearance on all sides.

### Don't
- Do not introduce drop shadows beyond the existing 0.5px hairline — the system is shadow-free by design.
- Do not use color as a primary differentiator between UI elements — the palette is intentionally narrow, use weight and size instead.
- Do not set body text below 11px or above 18px; the type scale is compact and deliberate.
- Do not use Inter for hero or display headlines — Van Condensed Pro Bold is the only display voice.
- Do not place #ffb700 amber on full-width backgrounds or large surfaces — it loses its 'highlighter accent' meaning at scale.
- Do not add border-radius above 12px on cards or 6px on buttons — the system is rectangular, not pill-shaped.
- Do not use #0000ee or any browser-default link blue — Balsa's link color is #003399 for outlined borders and #914db2 for inline.

## Elevation

- **Product screenshot card:** `rgba(0, 0, 0, 0.1) 0px 0px 0px 0.5px`
- **Section divider:** `rgba(0, 0, 0, 0.05) 0px 1px 0px 0px`
- **Focus ring on interactive elements:** `rgb(255, 255, 255) 0px 0px 0px 2px (inset halo)`

## Surfaces

- **Drafting Paper** (`#f7f7f7`) — Page canvas — the off-white base every section sits on
- **Card White** (`#ffffff`) — Product screenshot frames, pricing cards, content cards — reads as lifted from the canvas via brightness alone, no shadow needed
- **Highlighter Card** (`#ffb700`) — Floating annotation cards that call out product features like highlighter strokes on a printout
- **Quiet Card** (`#bbbbbb`) — Disabled or placeholder surface level, extremely rare

## Imagery

No lifestyle photography or abstract illustrations. The visual hierarchy is carried entirely by embedded product screenshots rendered on pure white cards with hairline borders — the product UI IS the imagery. Floating #ffb700 amber annotation cards sit beside screenshots like highlighter margin notes, with bold uppercase labels and body copy explaining features. Avatars are small circular crops in gray. Icons are flat, single-color, #000000 or #914db2, 12-16px, used as leading glyphs for module names. The overall effect is a technical product showcase, not a marketing narrative — every pixel of visual space either shows the product or explains it.

## Layout

Centered max-width 1200px container with the hero extending to full viewport width. The hero is a vertically stacked block: tiny acquisition banner, then a massive centered uppercase display headline, then a single short subtitle line, then a large embedded product screenshot card that may extend slightly beyond the 1200px max-width for emphasis. Below the fold, the page alternates between product-screenshot-with-amber-callout sections and typographic feature blocks, all centered, with consistent 80px vertical breathing room. The pricing section is a 3-column equal-width grid of white cards on the #f7f7f7 canvas. Navigation is a minimal top bar (logo left, single ghost 'Log in' right) with no menu, no hamburger, no sticky behavior visible. The layout rhythm is: text → product → text → pricing — never two product blocks in a row, never more than one annotation per product screenshot.

## Similar Brands

- **Notion** — Same flat white-on-off-white surface stack, minimal type, and product-screenshot-as-hero approach with compact spacing
- **Linear** — Same condensed uppercase display voice, near-achromatic palette, and engineering-notebook atmosphere with hairline borders
- **Pitch** — Same product-screenshot-centric hero with floating annotation cards, though Pitch uses more color than Balsa's amber-only accent
- **Coda** — Same condensed display headline treatment and minimalist product-page layout, both built to showcase the product interface as the primary visual
- **Figma** — Same shadow-free elevation philosophy, white card on light canvas, and confidence in letting the product do the talking visually
