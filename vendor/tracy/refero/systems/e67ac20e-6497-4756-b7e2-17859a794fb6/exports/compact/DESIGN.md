# Silencio — Style Reference
> white room with floating artifacts. A warm-paper gallery vitrine where every element earns its space against negative volume, and silence is a deliberate design material.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Silencio operates as a visual silence — a monochrome gallery where objects float on warm paper-white and typography does nearly all the talking. The system strips away every non-essential: no chromatic accents, no shadows, no decorative geometry; instead it relies on extreme type contrast (141px display whispers next to 9px metadata) and one warm gray (#dbdad9) as the only departure from pure black-on-white. Surfaces are paper-flat, separated by hairline rules and small radius (7.2px) rather than elevation. The brand voice reads like museum wall text: centered, brief, slightly italicized by silence, with monospaced labels (PT Mono, 11px) used as quiet signatures next to a custom Haas grotesque. Components feel like printed catalog pages more than web UI — buttons are full pill shapes (129.6px), cards have a single rounded corner, and the whole composition breathes with the confidence of a room with nothing on its walls.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Primary text, iconography, hairline rules, table borders — the only high-contrast element on the page |
| Paper Warm Gray | `#dbdad9` | Card surfaces, soft fills, the single chromatic departure from pure white, gentle gradient origin |
| Graphite Border | `#808080` | Subtle table dividers and secondary rule lines — used when #000000 would feel too heavy |
| Bleach White | `#ffffff` | Supporting palette color for small decorative accents when the core palette needs contrast. |

## Typography

### HaasR — Workhorse grotesque for body, subheadings, and mid-size headings. Weight 100 is used for restraint in body contexts; 700 sparingly for emphasis. The single most-used face carries the page.
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 100, 400, 700
- **Sizes:** 9px, 12px, 16px, 19px, 22px, 39px, 58px
- **Line height:** 0.90–1.40

### HaasT — Display-only face at 141px with tightened leading (0.90). Used for hero statements and singular set-pieces — the only moment typography shouts, and it shouts at full volume against pure white.
- **Substitute:** Neue Haas Grotesk Display, Söhne Breit, Inter Display at weight 100
- **Weights:** 100, 400
- **Sizes:** 141px
- **Line height:** 0.90

### PT Mono — Metadata, spec labels, catalog tags — the typographic equivalent of a printed museum label. Appears at 11px only; functions as a quiet signature rather than informational copy.
- **Substitute:** IBM Plex Mono, JetBrains Mono
- **Weights:** 400
- **Sizes:** 11px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 16px | 1.4 | — |
| subheading | — | — | 22px | 1.1 | — |
| heading-sm | — | — | 39px | 1 | — |
| heading | — | — | 58px | 0.9 | — |
| display | — | — | 141px | 0.9 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 43px
- **Card padding:** 29px
- **Element gap:** 7px

### Border Radius

- **tags:** 9999px
- **cards:** 7.2px
- **buttons:** 129.6px
- **surfaces:** 43.2px

## Components

### Pill Button
**Role:** Primary interactive element

Full pill radius (129.6px), 14px vertical × 29px horizontal padding, Inkwel Black border at 1px, transparent fill. Text in HaasR 12px weight 400 #000000. No fill state — the outline IS the button.

### Ghost Link
**Role:** Inline navigation and content links

No underline, no color shift. HaasR 16px weight 400 #000000. Underline appears only on hover at 1px, #000000, 2px offset. The link reads as a continuation of the sentence, not a clickable widget.

### Paper Card
**Role:** Grouped content surface

Background #dbdad9, no border, radius 7.2px, padding 29px on all sides. No shadow. The card's only separation from the white canvas is its warm gray fill — a whisper of elevation.

### Display Headline
**Role:** Hero and section set-pieces

HaasT weight 100 at 141px, lineHeight 0.90, color #000000, letter-spacing normal, centered. Used at most once per viewport. Pairs with PT Mono 11px caption directly beneath as a museum-style label.

### Museum Label
**Role:** Metadata, catalog tags, object captions

PT Mono 11px weight 400 #000000, lineHeight 1.20, letter-spacing normal, often uppercase. Functions as the only typographic ornament — a small typographic signature against the otherwise grotesque system.

### Hairline Divider
**Role:** Section separation

1px solid #000000, full-bleed or container-width. The primary structural divider — replaces shadows, padding, and color blocking.

### Table Rule
**Role:** Data and catalog row separation

1px #808080 border. Lighter than the primary hairline (#000000) to keep dense data tables from feeling heavy.

### Floating Product Showcase
**Role:** Primary visual carrier

Object photography rendered on transparent white, no frame, no shadow, no caption box. The object sits in the canvas like a museum artifact — the page itself is the pedestal.

### Centered Statement Block
**Role:** Editorial copy placement

HaasR 22px weight 400, lineHeight 1.10, #000000, centered, max width 640px. Used for manifesto text, section openers, and the SILENCIO ® VISUAL LANGUAGES signature.

### Micro Caption
**Role:** Image credit, footnote, and ancillary copy

HaasR 9px weight 400 #000000, lineHeight 1.20. The smallest text on the site — used for the kind of copy that would be printed in 6pt in a printed catalog.

### Navigation Anchor
**Role:** Top-level menu items

HaasR 12px weight 400 #000000, letter-spacing normal, uppercase optional. No background, no border, no hover fill — navigation is typographic only.

## Do's and Don'ts

### Do
- Use the full 141px HaasT weight 100 for display headlines — it is the only moment this system is allowed to be loud
- Reach for #dbdad9 as the only chromatic surface departure; every other surface stays #ffffff or #000000
- Separate content with 1px #000000 hairlines, not padding, not shadows, not color blocks
- Pair every display headline with a PT Mono 11px museum label directly beneath it
- Use radius 7.2px for cards and 129.6px for buttons — do not interpolate intermediate values
- Set lineHeight at 0.90 for any type at 39px or above; tight leading is a signature, not an accident
- Let product photography float on pure white with no frame, no caption box, and no drop shadow

### Don't
- Never introduce a chromatic color — the palette ends at #000000, #dbdad9, #808080, and #ffffff
- Never use drop shadows for elevation; the gradient #dbdad9 → #ffffff is the only depth the system allows
- Never set type above 141px or below 9px — the 132px range is the entire expressive spectrum
- Never use #0000ee or any default browser link color — links are #000000, no exception
- Never fill a button with color; the pill is always transparent with a 1px #000000 border
- Never center body text in paragraphs; only display statements and labels earn centered alignment
- Never use shadows, blurs, or glows on photographs or product imagery

## Elevation

Elevation is achieved through contrast and gentle gradient lift (#dbdad9 → #ffffff) rather than drop shadows. The page reads as paper-flat; depth is implied by a single degree of warmth, not by z-axis blur.

## Surfaces

- **Page Canvas** (`#ffffff`) — The dominant background — silence made visible
- **Paper Card** (`#dbdad9`) — The only warm departure from white; soft cards, subtle fills, gradient origin
- **Ink Surface** (`#000000`) — Inverted moments — text blocks on black, dark contrast panels

## Imagery

Product photography rendered as floating artifacts on pure white — the objects (packaging, containers, objects) sit in the canvas like museum pieces, uncaptioned, unframed, and shadowless. The treatment is high-key and even, with no lifestyle context: tight product crops on warm paper-white, with the object itself functioning as the hero. The photographic style is editorial-catalog — every product is isolated, every surface is neutral, and the page itself reads as the gallery wall. No illustration, no abstract graphics, no 3D renders; the visual language is strictly photographic and rigorously austere.

## Layout

The page is a centered, max-width 1440px composition with generous breathing room between sections (43px). Hero patterns favor a single statement line of HaasT 141px centered above a small PT Mono label, with floating product artifacts arranged asymmetrically around the typography. Sections are separated by hairline rules, not by background color shifts — the entire page is #ffffff with #dbdad9 appearing only as soft card fills. The grid is loose: no rigid column structure, no card grids, no pricing tables. Navigation is minimal and typographic only. Content rhythm alternates between quiet text-only bands and sparse, object-laden bands where a single photograph occupies 60–80% of the viewport. The overall feel is closer to a printed art-book spread than a traditional web layout.

## Similar Brands

- **Aesop** — Same warm-paper canvas with single accent gray, tightly typeset editorial copy, and product-as-artifact photography on pure white backgrounds
- **COS (cosstores.com)** — Same restrained monochrome system, large display type against vast white space, and product photography that reads as gallery objects rather than retail shots
- **Pentagram** — Same studio-discipline of typographic hierarchy with custom-feeling grotesques, minimal color, and case-study layouts that let work breathe on white
- **Maison Margiela** — Same quiet-luxury restraint where absence of decoration and white space itself become the design language, with typographic details doing the heavy lifting
