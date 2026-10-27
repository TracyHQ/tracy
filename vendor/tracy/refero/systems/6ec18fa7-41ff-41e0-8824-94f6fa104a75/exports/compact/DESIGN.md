# Glyphy — Style Reference
> buttercream specimen sheet beneath sunset bands. A warm cream page sliced by yellow-to-plum horizontal stripes, anchored by an oversized neo-grotesque wordmark and tiny pixel Japanese eyebrows.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Glyphy is a warm-cream canvas cut by horizontal sunset bands: yellow, orange, red, burgundy, plum stacked top-to-bottom like a heat map. The interface stays almost entirely achromatic (ink on buttercream) with chromatic color appearing only as full-width category strips. Typography carries the personality: a monumental neo-grotesque display face (Neue Machina) anchors the wordmark at 120px with line-height 0.75, paired with pixel-accurate Japanese eyebrows and a clean system sans for everything else. Components are pill-shaped and minimal — outlined ghost buttons on colored bands, flat dark or cream cards with 14px corners, and dense symbol grids that feel like a typographic specimen book.

## Colors

| Name | Value | Role |
|------|-------|------|
| Buttercream | `#fef9e6` | Page canvas, card surfaces, light text on dark — the warm cream ground that unifies the entire site |
| Ink | `#000000` | Primary text, hairlines, card borders, outlined button borders, link strokes — the only structural non-cream color in the neutral stack |
| Carbon | `#060606` | Near-black surface for dark cards, filled button background, nav strip — slightly softer than pure ink for large fills |
| Driftwood | `#c7c3b4` | Muted hairline borders on cards and lists, warm gray that sits between buttercream and ink without breaking the warmth |
| Stone | `#8d8b80` | Secondary card text and tertiary borders — the warm mid-gray for de-emphasized copy |
| Amber Pulse | `#fdc331` | First sunset band (Font Generator) — warm yellow stripe signaling the start of the category stack |
| Ember Glow | `#fe5722` | Second sunset band (Cool Symbols) — saturated orange that pushes the stack hotter |
| Signal Red | `#f0353c` | Third sunset band (Name Generator) — true red midway through the gradient |
| Merlot Depth | `#b4213d` | Fourth sunset band (Emoticons) — deep crimson cooling the stack |
| Plum Shadow | `#671c3b` | Fifth sunset band (PFP Maker) — the darkest plum, the bottom of the heat-map |

## Typography

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 32px, 64px
- **Line height:** 1, 1.33

### Neue Machina — Display and wordmark only — the 120px hero at line-height 0.75 creates the condensed, monumental block that defines the brand. Tighter than default, almost stack-cut. Used for the GL YPHY logotype and section display headlines.
- **Substitute:** Space Grotesk (700) or any wide geometric grotesque
- **Weights:** 400, 700, 800
- **Sizes:** 21px, 64px, 120px
- **Line height:** 0.75, 1.00

### System85 — Primary UI and body sans — handles nav links, button labels, card text, section headers, and list items. The workhorse family covering 90% of text.
- **Substitute:** Inter or Söhne
- **Weights:** 400, 700
- **Sizes:** 14px, 16px, 18px, 24px, 32px, 40px
- **Line height:** 1.00, 1.20

### Pixel M Plus 10 — Japanese pixel-font eyebrows above English headlines (フォント, シンボル, グリフィー) and occasional decorative bits — a deliberate retro-arcade accent that contrasts the modern grotesque body face
- **Substitute:** Press Start 2P or Misaki Gothic pixel
- **Weights:** 400, 700
- **Sizes:** 12px, 14px, 18px, 24px, 64px
- **Line height:** 1.00, 1.33

### System85 Mono — Card labels and small metadata (Font Generator, Instagram Fonts captions) — monospace signals data/specimen identity
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1 | — |
| body-sm | — | — | 14px | 1 | — |
| body | — | — | 16px | 1.2 | — |
| subheading | — | — | 18px | 1.2 | — |
| heading-sm | — | — | 24px | 1.2 | — |
| heading | — | — | 32px | 1.2 | — |
| heading-lg | — | — | 40px | 1.2 | — |
| display | — | — | 64px | 1 | — |
| hero | — | — | 120px | 0.75 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Section gap:** 32px
- **Card padding:** 27px
- **Element gap:** 24px

### Border Radius

- **nav:** 14px
- **body:** 14px
- **cards:** 14px
- **buttons:** 28px

## Components

### Category Band Row
**Role:** Full-bleed horizontal entry for each major tool (Font Generator, Cool Symbols, Name Generator, Emoticons, PFP Maker)

Full-width strip filled with one of the five sunset colors (Amber Pulse, Ember Glow, Signal Red, Merlot Depth, Plum Shadow). Left-aligned category name in 32px Ink/Butttercream. Right-aligned pill button. No rounded corners on the band itself — the color bleeds to viewport edges. Vertical padding ~40px.

### Pill Ghost Button
**Role:** Primary action on category bands and specimen cards

28px border-radius pill, 1px Ink border, Buttercream/white fill, 24px vertical padding, 27px horizontal padding. Label in 14-18px System85 weight 400 Ink, with right-arrow → icon. Transparent interior on colored bands, opaque on cream sections.

### Dark Specimen Card
**Role:** Font preview tile in the Popular Font Generators grid

Carbon (#060606) background, 14px radius, ~27px padding. Large display font sample centered (Instagram, GLITCH, Fansy, etc.) in Buttercream. Top-left label 'Font Generator' in 14px Mono Buttercream. Top-right pill 'VIEW →' button with 1px Buttercream border.

### Light Specimen Card
**Role:** Alternating specimen tile in the font grid

Buttercream background, 14px radius, 1px Ink or Driftwood border, 27px padding. Display font sample in Ink. Same label and VIEW button pattern as dark variant, with Ink text/border.

### Top Nav Bar
**Role:** Sticky header with brand mark and tool links

Carbon (#060606) background full-width. Left: GLYPHY wordmark in System85 weight 700 Buttercream. Center-left: nav links (Font Generator, Cool Symbols, Name Generator, Emoticons, Blog) in 14px System85 Buttercream with 32px horizontal padding and 4-8px gaps. Right: language toggle. 14px radius on any nested containers.

### Symbol Grid Cell
**Role:** Individual symbol tile in the Browse Cool Symbols grid

Square cell on Buttercream canvas, separated by 1px Driftwood/ink hairlines forming a continuous grid. Single glyph centered in Ink, ~32-40px display size. No padding beyond the implicit cell margins. The grid is the visual — no card containers, just lines.

### Hero Wordmark Block
**Role:** The brand's signature opening element

Tiny pixel Japanese eyebrow (グリフィー) in Pixel M Plus at 14-18px Buttercream. Below: GL YPHY in Neue Machina weight 700-800 at 120px, line-height 0.75, Ink on Buttercream. Right-aligned tagline 'Copy & paste fancy fonts + cool symbols' in 18px System85. Spans the full cream canvas with generous 40-80px top/bottom padding.

### Section Header
**Role:** Section titles for content blocks (POPULAR FONT GENERATORS, BROWSE COOL SYMBOLS)

Pixel Japanese eyebrow label in 14-18px Pixel M Plus Buttercream/Stone above. English display headline in 40px Neue Machina or System85 weight 700, Ink, left-aligned. Tight 4-8px gap between eyebrow and headline.

### Font Card Meta Strip
**Role:** Sub-label below each specimen card

Small 14px Mono caption in Stone (e.g. 'Instagram Fonts', 'Glitch Text', 'Discord Fonts') — identifies the font style category underneath each preview.

## Do's and Don'ts

### Do
- Stack the five sunset colors (Amber Pulse → Ember Glow → Signal Red → Merlot Depth → Plum Shadow) in that exact order as full-width category bands — do not reorder or substitute hues
- Use Neue Machina at 120px with line-height 0.75 for the hero wordmark and any 64px+ display headlines — the condensed line-height is what makes it monumental
- Pair every English section title with a tiny Pixel M Plus Japanese eyebrow (12-14px) sitting 4-8px above it
- Use 28px border-radius for all pill buttons and 14px for all cards, nav, and body containers — the two-radius system is the only rounding vocabulary
- Set card padding to 27px horizontal and 24-40px vertical — generous, never tight, matching the spacious density
- Separate symbol grid cells with 1px Driftwood (#c7c3b4) hairlines forming a continuous grid — never add card containers or gaps that break the specimen-sheet feel
- Use 1px Ink borders at 14px radius for all card and button outlines — flat, no shadows, no fills beyond the cream canvas or the five band colors

### Don't
- Do not add drop shadows, elevation, or blur effects — the design is deliberately flat and relies only on hairlines and color bands for separation
- Do not introduce additional chromatic colors outside the five-band sunset palette — the site is 99% achromatic, with color appearing only as those full-width category stripes
- Do not use System85 or Arial for display sizes above 40px — Neue Machina owns everything 64px+; mixing faces at display sizes breaks the monumentality
- Do not round card corners to anything other than 14px — 28px on cards would look like buttons, 0px would clash with the pill button vocabulary
- Do not use any background color other than Buttercream (#fef9e6) on the page canvas — even 'white' breaks the warm-tone system
- Do not center-align category band content — left-aligned name + right-aligned pill button is the signature rhythm
- Do not use line-height above 1.2 for body or 1.0 for display — the tight tracking is part of the visual identity

## Elevation

Flat by design — no shadows anywhere. The only depth cues are 1px hairline borders in ink or driftwood, and full-bleed color bands that create rhythm without shadow lift. Cards sit on the same plane as their surroundings.

## Surfaces

- **Canvas** (`#fef9e6`) — Page background — the warm cream ground
- **Category Band** (`#fdc331`) — Full-width colored stripe for category entry
- **Dark Card** (`#060606`) — Inverted specimen cards with buttercream text
- **Light Card** (`#fef9e6`) — Same as canvas but with driftwood/ink border to define card edge

## Imagery

No photography, no illustrations, no product screenshots. The site is a pure typographic specimen system: the 'imagery' is the display fonts themselves (Instagram, GLITCH, Fansy, Discord, Zaigo, Stylish) rendered at large size inside specimen cards, and the symbol grid where hundreds of unicode glyphs are arranged in a continuous grid. Japanese pixel-font eyebrows add a retro-arcade decorative layer. The sunset color bands serve as the only atmospheric/decorative visual element.

## Layout

Full-bleed layout with no max-width constraint — content extends to viewport edges. The page reads as a vertical stack of horizontal bands: dark nav strip → cream hero with oversized wordmark → five colored category bands (yellow to plum) → cream content sections with card grids → footer. Card grids use a 3-column layout on desktop for font previews. The symbol browser is a dense continuous grid with hairline dividers, no card containers. Navigation is a single horizontal dark bar at the top with inline links. All vertical rhythm is generous (40-80px section padding) while card-internal padding is tighter (24-27px).

## Similar Brands

- **Cool Symbol / Lingojam** — Same specimen-sheet symbol grid approach with continuous hairlines and cream canvas
- **Yatopia / Lapa Ninja** — Full-bleed horizontal color bands as navigation/entry pattern, pill ghost buttons on colored grounds
- **Typewolf specimen pages** — Typography-first layouts where display type IS the visual content inside bordered specimen cards
- **Pinterest (old grid)** — Continuous grid with hairline dividers and no card padding for dense visual browsing
