# Twocreate — Style Reference
> gallery wall on cream paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Twocreate operates on a gallery-floor logic: a warm cream canvas, a single near-black ink, one typeface, and absolutely nothing else. Every interface decision is subordinated to typography — there is no color system, no shadow system, no border system, no icon system, no button system. The page reads like a printed exhibition catalogue set in PP Neue Montreal at extreme scale jumps, from 10px footer labels to 111px display headlines that fill half the viewport. Components are not really components; they are typographic blocks separated by whitespace. The product photography that does appear is a single editorial image — no cards, no grids, no treatments — placed in the flow with the same restraint as the text. This is a studio site that trusts the work and the typeface to carry all visual weight, and treats every other design discipline as decoration to be omitted.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#0c0c0c` | All text, links, nav items, body copy, client names, list items, and icon strokes. The near-black rather than pure black keeps type from feeling harsh against the warm canvas |
| Paper | `#f9f7f4` | Page background and primary canvas. A warm off-white with a faint yellow-pink cast — replaces the coldness of #fff with the tactility of uncoated stock |
| Stone | `#e3e1dd` | Secondary surface tone, subtle dividers, and any banded section that needs a half-step away from the canvas without introducing a true contrast color |
| Carbon | `#000000` | Reserved for the highest-weight text moments where pure black is needed — typically the display headline and nav lockups. Slightly heavier than Ink for typographic emphasis rather than color contrast |

## Typography

### PP Neue Montreal — The single typeface carrying all text — nav, body, list items, section headers, and the 111px display headline. The fact that only weight 400 is used is the signature: no bold cuts exist, so hierarchy is built entirely through scale jumps (10→22→33→44→67→111) and the single tight line-height range. This produces a typeface system that reads as confident restraint rather than typographic volume. PP Neue Montreal's geometric-but-warm character pairs with the warm Paper canvas to feel editorial rather than corporate.
- **Substitute:** Inter, Söhne, or General Sans as close open-source alternatives
- **Weights:** 400
- **Sizes:** 10px, 22px, 33px, 44px, 67px, 111px
- **Line height:** 1.00–1.10
- **Letter spacing:** -0.0100em across all sizes — a near-imperceptible tightening that becomes visible only at the 67px and 111px display sizes, where it prevents the letterforms from drifting apart optically.
- **OpenType features:** `Default OpenType features; no stylistic alternates or tabular numerals are activated.`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1 | -0.1px |
| body | — | — | 22px | 1 | -0.22px |
| subheading | — | — | 33px | 1.02 | -0.33px |
| heading | — | — | 44px | 1.02 | -0.44px |
| heading-lg | — | — | 67px | 1.02 | -0.67px |
| display | — | — | 111px | 1 | -1.11px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 50px
- **Element gap:** 10px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **controls:** 0px

## Components

### Sticky Text Nav
**Role:** Primary site navigation

Two text anchors at 22px, weight 400, in Ink (#0c0c0c), left-aligned to the page edge with 20px horizontal padding from the viewport. No background, no border, no shadow — sits directly on Paper. The right anchor mirrors the left at the opposite page edge. No logo, no hamburger, no container. When state changes (e.g. 'TWO CREATE / STUDIO' at the top becomes 'WORK / ABOUT' on scroll), only the text content changes; the layout is identical.

### Display Headline
**Role:** Hero and section-opening typography

PP Neue Montreal at 111px, weight 400, line-height 1.0, letter-spacing -1.11px, in Ink (#0c0c0c). Left-aligned, flush to the left page padding. Occupies 3–4 lines, each line running the natural text width without truncation. This block is the visual centerpiece of the page — no gradient, no background treatment, no supporting imagery competes with it.

### Section Header Bar
**Role:** Subsection labels and navigation

A horizontal band at 22px weight 400, Ink on Paper, with 20px vertical padding and 10px horizontal padding. Left side holds a static section label ('Selected work', 'Clients'); right side holds a text link or anchor ('+ MORE WORK'). A 1px hairline in Stone (#e3e1dd) may separate this band from the content below.

### Client List
**Role:** Credibility display in the work section

A vertical stack of brand names at 33–44px, weight 400, Ink, flush left with no bullet markers, no separators, and 10px vertical gap between entries. Each name sits on its own line. This list functions as both content and graphic — the sheer size of the type turns a name-dump into a typographic wall.

### Editorial Product Image
**Role:** Sole imagery treatment on the site

A single product photograph placed in the flow, natural aspect ratio, no border, no radius, no caption, no overlay. Sits on the Paper canvas with 50px+ vertical breathing room above and below. No lightbox, no hover treatment, no gallery frame — the image is treated as a printed plate in a catalogue.

### Footer Lockup
**Role:** Site closure and secondary nav

Minimal text block at 10px weight 400, Ink on Paper, with 50px padding-top from the last content block. Likely contains contact information and small-print links at the smallest type size in the system, reinforcing the editorial scale hierarchy.

## Do's and Don'ts

### Do
- Use PP Neue Montreal at weight 400 only — never introduce a bold or light weight to create hierarchy
- Build hierarchy through scale jumps (10 → 22 → 33 → 44 → 67 → 111), not through color or weight variation
- Maintain the warm Paper (#f9f7f4) canvas across all pages; never switch to pure white or introduce a true background color
- Keep all spacing in the established rhythm: 10px between elements, 20px page padding for type blocks, 50px between sections, 67–139px right-side whitespace for asymmetrical layouts
- Set line-height to 1.00–1.10 for all display sizes to preserve the compressed, editorial feel
- Let product photography sit raw on the canvas — no frames, no radii, no overlays, no captions
- Write copy that is short enough to live at 44–67px without wrapping into a dense paragraph

### Don't
- Do not introduce any accent, brand, or semantic color — the system is deliberately achromatic
- Do not add shadows, borders, or rounded corners to any element; separation comes from whitespace and type alone
- Do not use multiple typefaces; PP Neue Montreal (or its substitute) is the only voice
- Do not create a button component — interactions are text links with optional underline on hover, never filled or outlined controls
- Do not add icons, badges, tags, or any small UI ornament that would break the typographic-only vocabulary
- Do not center-align body copy or list items; everything sits flush left against the page padding
- Do not apply card patterns, grid backgrounds, or any container treatment around text or image blocks

## Elevation

No elevation system exists. The design deliberately rejects shadows, borders, and depth — every element sits flush on the Paper canvas. Separation is achieved through whitespace, type size, and the occasional tonal shift to Stone, never through z-axis depth.

## Surfaces

- **Paper** (`#f9f7f4`) — Base canvas for the entire site. The warm white carries all content.
- **Stone** (`#e3e1dd`) — Inset bands or subtle section shifts that need a tonal step without breaking the monochrome discipline.

## Imagery

The visual language is essentially typographic — there is no recurring photography, illustration, or graphic system. The single product image visible (a cosmetics flat-lay on a mauve/pink surface) is editorial in nature: staged, high-key, tight crop, no human subjects, no lifestyle context. It functions as a printed plate rather than a digital asset. Iconography is absent; navigation and interaction are text-only. No SVG illustrations, no abstract graphics, no animated elements. The site's 'imagery' is its own type at extreme scale.

## Layout

The page is full-bleed, edge-to-edge, with no max-width container and no centered column. Content anchors to the left edge with consistent horizontal padding (20–67px) and lets the right side breathe into whitespace — an asymmetric, left-weighted composition. Navigation is a sticky two-anchor text bar at the top, with the left/right anchors updating as the user scrolls past sections. The hero is a massive flush-left display headline occupying the first two-thirds of the viewport, followed by a section header bar, then content blocks that alternate between text-only zones and single editorial images. There are no card grids, no multi-column feature rows, no pricing tables, no testimonials blocks. Vertical rhythm is generous: 50px between sections, with 67–139px of right-side whitespace creating the gallery-wall asymmetry.

## Similar Brands

- **Resn** — Same typographic-only navigation and massive-scale display headlines on a warm off-white canvas; both treat the studio site as an art object rather than a product page.
- **Pentagram** — Shared editorial confidence — single serif/sans typeface, no accent color, generous whitespace, and the belief that the work itself is the visual system.
- **Manual (manualcreative.com)** — Same cream-paper canvas, flush-left type-as-hero pattern, and zero-decoration philosophy where whitespace and scale do all the work.
- **Locomotive (locomotive.ca)** — Both push type to extreme sizes on a warm neutral background, relying on scale jumps rather than color or weight to create hierarchy, and use a single boutique sans-serif throughout.
