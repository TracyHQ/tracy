# Nile Postgres — Style Reference
> infra sunset on black velvet — a quiet command center where three pastel tiles glow in the dark

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Nile operates in the visual language of an infrastructure command center: a near-black canvas (#0e0e0e) with elevated surface cards (#1c1c1c) and a trio of pastel feature blocks — cyan #6fe2ff, amber #ffba6a, and lavender #d8d3ff — that function as colored tiles floating in deep space. Typography is geometric and precise: Aeonik at weights 400/500/600/700, with display sizes stretching to 96px on tight negative tracking, giving headlines an architectural, engineered feel. A signature sunset gradient (amber → lavender → cyan) threads through the hero wordmark and likely other moments, providing the only moment of continuous color flow. Components stay flat and quiet — hairline borders (#2f3336) over heavy elevation, pill buttons (9999px), rounded 16-20px cards, and no decorative shadows. The overall atmosphere is restrained infrastructure: developer-facing, confident through restraint rather than spectacle, with chromatic accents used sparingly as functional category tags rather than decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Void | `#0e0e0e` | Page canvas, deepest surface — the black that everything floats on |
| Carbon | `#1c1c1c` | Card surfaces, elevated panels, testimonial tiles |
| Graphite | `#2b2b2b` | Mid-elevation surfaces, subtle layering above cards |
| Smoke | `#3f3f3f` | Borders, dividers on elevated elements, button outlines |
| Charcoal Edge | `#2f3336` | Hairline card borders — the quietest structural line |
| Snow | `#ffffff` | Primary text, headings, icons — the dominant foreground |
| Ash | `#d3d3d3` | Secondary text, muted labels, icon fills at rest |
| Slate Mist | `#a1a1aa` | Tertiary text, helper copy, de-emphasized metadata |
| Signal Cyan | `#6fe2ff` | Blue action color for filled buttons, selected navigation states, and focused conversion moments. |
| Amber Tile | `#ffba6a` | Amber feature card background, warm category accent in the trio |
| Lavender Tile | `#d8d3ff` | Lavender feature card background, cool category accent in the trio |
| Sunset Sweep | `linear-gradient(90deg, #f4c587 9%, #d6d3e9 52%, #99d2ec 94%)` | Signature gradient — amber to lavender to cyan, used on hero wordmark highlights and atmospheric washes |

## Typography

### Aeonik — Primary interface and display typeface — geometric, precise, used for everything from body copy to 96px hero headlines
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 400, 600, 700
- **Sizes:** 12px, 14px, 15px, 16px, 18px, 20px, 24px, 32px, 40px, 42px, 48px, 64px, 96px
- **Line height:** 1.00, 1.08, 1.10, 1.18, 1.20, 1.25, 1.43, 1.50, 1.56, 1.60
- **Letter spacing:** -0.01em on display (40px+), 0.01em on small text, normal at body

### ui-monospace — Code snippets, technical labels, inline code — the developer voice within the geometric system
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.14, 1.18, 1.50
- **Letter spacing:** 0.01em

### aeonikMedium — aeonikMedium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 16px, 20px, 24px, 96px
- **Line height:** 1, 1.2, 1.25, 1.5

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.01px |
| body-sm | — | — | 14px | 1.43 | 0.01px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 18px | 1.56 | 0px |
| heading-sm | — | — | 20px | 1.25 | 0px |
| heading-lg | — | — | 32px | 1.2 | -0.01px |
| heading-xl | — | — | 40px | 1.18 | -0.4px |
| heading-2xl | — | — | 48px | 1.1 | -0.48px |
| display | — | — | 64px | 1.08 | -0.64px |
| display-lg | — | — | 96px | 1 | -0.96px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-96px
- **Card padding:** 24px
- **Element gap:** 8-12px

### Border Radius

- **tags:** 6px
- **cards:** 20px
- **pills:** 9999px
- **inputs:** 10px
- **buttons:** 9999px
- **special:** 100px
- **smallCards:** 16px

## Components

### Pill Primary Button
**Role:** Main call-to-action across hero and feature sections

Filled with Signal Cyan #6fe2ff, text in Deep Void #0e0e0, font-weight 500, 16px text, padding 10px 20px, border-radius 9999px (fully pill-shaped). Includes a right-arrow glyph in the same dark color. This is the only chromatic filled button in the system.

### Ghost Outline Button
**Role:** Secondary actions, nav-adjacent controls

Transparent fill, 1px border in #3f3f3f, white text at 14-16px, border-radius 9999px, padding 8px 16px. Blends into the dark canvas with just enough edge to register as interactive.

### Pill Nav Link
**Role:** Top navigation items

White text on transparent, 15-16px weight 400, no border. On hover or active: subtle white/10 background appears.

### Announcement Pill
**Role:** Compact top-of-page announcement (e.g. product launches)

Dark fill #1c1c1c, 1px border #3f3f3f, text 14px white with muted secondary, border-radius 9999px, padding 8px 16px. Includes a small arrow icon on the right.

### Testimonial Card
**Role:** Social proof in horizontal scroll layout

Background #1c1c1c, 1px border #2f3336, border-radius 20px, padding 16-20px. Contains avatar (40px circle), name in white weight 600, role/company in Ash #d3d3d3, quote body in white weight 400 at 14-15px. Includes a 'View on X' link and a close X glyph. Cards are slightly wider than tall, designed to sit in a horizontal scroll row.

### Colored Feature Tile
**Role:** Category-coded feature blocks in the feature grid

Solid pastel fill: Amber #ffba6a, Lavender #d8d3ff, or Signal Cyan #6fe2ff. Text in Deep Void #0e0e0e. Border-radius 20px, padding 24px. Contains a bold heading (18-20px weight 600), body text (15px weight 400), and a 'Learn more →' link. These are the only large chromatic surfaces in the system.

### Gradient Highlight Box
**Role:** Signature moment — the hero word treatment and section dividers

Rounded container (20-24px radius) with the sunset gradient fill (#f4c587 → #d6d3e9 → #99d2ec). May contain text clipped to the gradient or sit as a decorative wash. In the hero, it frames a single highlighted word from the headline with a dashed border outline.

### Code Block Card
**Role:** SQL/code examples in feature sections

Dark terminal-style card: background #1c1c1c, border 1px #2f3336, border-radius 16px, padding 24px. Monospace font (ui-monospace) at 14px. Uses VS Code-style syntax highlighting: #9cdcfe for keywords, #dcdcaa for functions/strings, #b5cea8 for numbers, #4fc1ff for types.

### Product Icon Tile
**Role:** Visual badge for feature sections (e.g. the chip/vector graphic)

Dark square 200x200px with rounded corners (24px), 1px border #3f3f3f, contains a centered icon or product graphic. Functions as a visual anchor beside feature copy.

### Brand Logo Mark
**Role:** Site identity — 'Nile' wordmark with N-glyph

Stylized 'N' glyph in white, followed by 'Nile' wordmark in Aeonik weight 600. Approximately 24px tall in the header. The N has a distinctive curved/ribbon-like construction.

### Info Statement Banner
**Role:** Full-width summary statement (e.g. the gradient description block)

Rounded container (20px radius) with the sunset gradient as background, large padding (40-48px), contains the brand logo + a sentence-length summary in Deep Void text. Functions as a brand-recap moment between sections.

### Icon (UI)
**Role:** Small interface icons — arrows, close, social, nav

Stroke-based or filled glyphs in white or Ash #d3d3d3 at 16-20px. Generally 1.5-2px stroke weight, geometric construction matching Aeonik's precision.

## Do's and Don'ts

### Do
- Use 9999px border-radius for all interactive elements — buttons, nav pills, announcement tags — to maintain the pill-shaped consistency across the system
- Use Signal Cyan #6fe2ff exclusively for primary actions; never substitute it for decorative or non-action purposes
- Use the three pastel feature tile colors (Amber #ffba6a, Lavender #d8d3ff, Cyan #6fe2ff) as solid card fills with Deep Void text, never as text colors or thin accents
- Apply the sunset gradient only as a deliberate signature moment — full container fills or clipped text — not as a subtle background wash
- Set body text at 16px Aeonik weight 400 in white #ffffff, with secondary text in Ash #d3d3d3 — never use gray for primary copy
- Use card padding of 24px and card border-radius of 20px as the default for all surface containers
- Maintain section gaps of 80-96px to preserve the comfortable, breathing rhythm between content blocks
- Set display headlines at 64-96px with negative letter-spacing (-0.01em) to achieve the architectural, engineered feel

### Don't
- Do not use chromatic colors (Cyan, Amber, Lavender) for body text, borders, or icons — they are exclusively surface fills for feature tiles and primary actions
- Do not add box-shadows or drop-shadows to cards or buttons — the system relies on flat surfaces and hairline borders for depth
- Do not use the gradient as a button background, icon fill, or text color outside its intended signature moments
- Do not break the pill shape — every button, tag, and announcement must use 9999px radius, never rounded rectangles
- Do not use pure black #000000 — always use Deep Void #0e0e0 for canvas and Carbon #1c1c1c for cards
- Do not introduce new accent colors beyond the trio — the system is deliberately constrained to cyan/amber/lavender plus neutrals
- Do not set body text below 14px or use weights other than 400 for paragraph copy — Aeonik's geometric clarity depends on generous sizing and regular weight
- Do not use spacing values outside the 4/8/12/16/24/32/48/80/96 scale — the 8px base unit must govern all rhythm

## Elevation

Nile intentionally avoids shadows. Depth is achieved through a three-step surface stack (Deep Void #0e0e0 → Carbon #1c1c1c → Graphite #2b2b2b) and hairline borders in #2f3336. Elevation is flat and architectural, not skeuomorphic — cards sit on the canvas like tiles, not floating panels.

## Surfaces

- **Deep Void** (`#0e0e0`) — Page canvas, the base of the stack
- **Carbon** (`#1c1c1c`) — Card surfaces, testimonial tiles, elevated panels
- **Graphite** (`#2b2b2b`) — Mid-elevation backgrounds, nested panels
- **Smoke** (`#3f3f3f`) — High-elevation surfaces, modal backgrounds

## Imagery

Visual language is minimal and product-focused: no lifestyle photography, no abstract decorative graphics. Imagery consists of (1) a single product graphic — a dark square tile with a circuit/vector icon (the Nile N-glyph on a dotted grid) — used as a visual anchor in feature sections, and (2) code screenshots styled as dark terminal cards with VS Code syntax highlighting. The pastel feature tiles themselves act as visual elements, breaking up the dark canvas with blocks of color. Icons are geometric, stroke-based, and white or ash-gray. The overall feel is engineering documentation meets product page: everything serves to explain a technical capability.

## Layout

Max-width ~1200px centered content with full-bleed dark canvas. The hero is a left-aligned text stack: announcement pill, then a 64-96px headline with one word highlighted by a dashed-border gradient box, followed by a one-sentence subhead and a cyan pill CTA. The page flows in vertical sections with 80-96px gaps. Below the hero: a 'What People Are Saying' section with horizontally scrolling testimonial cards. Then a full-width gradient statement banner with logo + summary. Then feature sections in a 2-column layout (left: text + colored feature tiles stacked, right: code screenshot or product graphic). Navigation is a top bar with centered nav links, brand left, and a ghost outline button + cyan pill CTA on the right. The grid is generous and breathing — no dense information layouts.

## Similar Brands

- **Vercel** — Same dark-canvas + single bright accent approach, with pill-shaped CTAs and restrained geometric typography
- **Supabase** — Dark infrastructure-product aesthetic with developer-focused code screenshots and green-cyan accent palette
- **PlanetScale** — Database-infrastructure brand with deep dark surfaces, generous spacing, and a single vivid accent color for primary actions
- **Railway** — Dark devtool landing pages with horizontal-scroll social proof sections and minimal flat component design
- **Linear** — Dark UI with precise geometric typography (similar to Aeonik's style), tight letter-spacing on display sizes, and quiet color usage
