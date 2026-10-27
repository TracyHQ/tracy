# Haus Otto — Style Reference
> Monumental wordmark on white void

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Haus Otto operates as a typographic monolith: a single ultra-condensed wordmark stretches across a vast white void, treating the brand name as both logo and content. The entire interface is two-tone — near-black on paper-white — with no shadows, no gradients, no borders, and no decorative geometry. Typography is the only material; Monument at 216px dominates with weight 400 and aggressive negative tracking, while smaller sizes at 13–23px handle navigation and metadata at near-whisper volumes. The layout is radically spacious, using emptiness as the primary compositional tool rather than fills, cards, or dividers. Every screen should feel like walking into a gallery where one object occupies the room.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, wordmark fills, link text, all heading color — the only non-white pigment in the interface |
| Paper | `#ffffff` | Page canvas, card surfaces, inverse text on dark moments |
| Terracotta | `#af7653` | Sole chromatic accent — warm earthen tone for hover states, active indicators, or single-element highlights against the monochrome field |

## Typography

### Monument — Sole typeface across the entire system. Regular variant at 13–23px for nav links, metadata, body micro-copy. Medium variant at 216px for the hero wordmark — the only element that earns the 216px scale, with -0.033em tracking to tighten the ultra-condensed letterforms into a continuous bar of black
- **Substitute:** Bebas Neue (display), Inter (body micro-copy)
- **Weights:** 400 (Regular + Medium variants)
- **Sizes:** 13px, 20px, 23px, 216px
- **Line height:** 1.15–2.00 (contextual: tight at display, generous at body)
- **Letter spacing:** -0.033em at 216px display; normal at 13–23px body sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 2 | 0px |
| body | — | — | 20px | 1.23 | 0px |
| subheading | — | — | 23px | 1.16 | 0px |
| display | — | — | 216px | 1 | -7.13px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 30px
- **Card padding:** 12-20px
- **Element gap:** 4px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Display Wordmark
**Role:** Hero brand identifier — the signature element

Single-line brand name at 216px Monument Medium, weight 400, letter-spacing -0.033em, Obsidian (#000000) on Paper (#ffffff). Fills viewport width edge-to-edge. No surrounding chrome, no tagline, no subtitle — the word IS the content.

### Navigation Link
**Role:** Top-level nav items (e.g. 'Info')

13px Monument Regular, weight 400, Obsidian color, no underline, no padding. Sits at the absolute top edge of the viewport with 3–4px horizontal margin. Hover state: Terracotta (#af7653).

### Top-Left Brand Mark
**Role:** Persistent brand identifier in nav

13px Monument Regular, 'Haus Otto' in Obsidian, top-left corner, no logo mark — text only. Functions as home link.

### Page Dot Indicators
**Role:** Section navigation (right edge, top)

Two small circular dots (approximately 8px diameter) stacked vertically at the top-right edge. Active dot: Obsidian. Inactive: Terracotta (#af7653). Zero border-radius added — native circle shape.

### Cookie Consent Bar
**Role:** Legal/UX footer notice

Full-width bar at viewport bottom, 30px vertical padding, Paper background. Body text at 13px Monument Regular, Obsidian. 'Yes' button: solid Obsidian fill, Paper text, 4px padding, 0px radius — no rounding. 'No' and 'More': text-only links in Obsidian.

### Page Section Spacer
**Role:** Vertical rhythm device between content blocks

30px top/bottom padding with no visible divider line, no background change, no rule. Whitespace itself separates sections. This is the primary structural tool.

### Tertiary Body Text
**Role:** Supplementary information, metadata, descriptions

20–23px Monument Regular, line-height 1.16–1.23, Obsidian. Sits in generous white space beneath the display wordmark. No max-width constraint — text is allowed to breathe at whatever length it needs.

## Do's and Don'ts

### Do
- Set hero type at exactly 216px Monument Medium with letter-spacing -0.033em — this scale is non-negotiable, it IS the brand
- Use zero border-radius on every interactive element: buttons, tags, inputs, cards — sharp corners only
- Keep the color palette to Obsidian (#000000) and Paper (#ffffff) as the default; reserve Terracotta (#af7653) for single-element accent moments only
- Set base spacing to a 4px grid with 30px section gaps — the design is compact in its tokens but vast in its whitespace
- Let the wordmark fill the full viewport width — no max-width container should clip the display type
- Use 13px Monument Regular for all navigation and metadata at line-height 1.77–2.00 for breathing room at small sizes
- Treat the white canvas as an active design element — never fill backgrounds with color or imagery behind text

### Don't
- Never introduce a second typeface family — Monument is the sole voice
- Never apply border-radius to buttons, cards, or tags — every corner is sharp
- Never use shadows, gradients, or glow effects — the design is flat and chromatically minimal
- Never add borders, dividers, or rules between sections — whitespace is the only separator
- Never reduce the 216px display below 120px — the wordmark's authority depends on its scale
- Never use more than one accent color per screen — Terracotta appears as punctuation, not decoration
- Never fill the page with imagery, illustrations, or product photography — text on void is the entire visual system

## Elevation

The design eliminates elevation entirely. There are no shadows, no stacked layers, no depth cues. Hierarchy is achieved through scale (216px vs 13px) and whitespace alone, not through z-axis separation. This flatness is deliberate — it treats the white page as a single infinite plane.

## Surfaces

- **Canvas** (`#ffffff`) — Full-page background, all content sits on this surface

## Imagery

No imagery present. The site is pure typography on white space — no photography, no illustrations, no icons, no product shots, no decorative graphics. The only visual marks are the two navigation dot indicators in the top-right corner. This is a typographic-first identity where the wordmark replaces all visual content.

## Similar Brands

- **Pentagram** — Same radical typographic-first identity where the studio name IS the visual content — no imagery, no decoration, just type on white
- **Bureau Cool** — Shares the ultra-condensed display typeface at extreme scale with near-zero supporting visual elements
- **Manuel Bürger (manuelbuerger.com)** — Identical approach: single bold wordmark on infinite white void, no chrome, no navigation beyond text links
- **Dia Studio** — Same minimal agency presentation — monochrome palette, display-scale typography, whitespace as the primary design material
