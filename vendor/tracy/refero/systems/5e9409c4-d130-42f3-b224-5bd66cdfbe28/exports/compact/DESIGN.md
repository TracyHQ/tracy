# Anuc Home — Style Reference
> editorial gallery in warm white — a quiet, magazine-like space where oversized serif headlines and monumental rounded geometric letterforms frame intimate interior photography

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Anuc Home is an editorial interior-design gallery: a near-monochrome warm-white canvas where oversized Instrument Serif headlines converse with quiet Instrument Sans UI, creating a magazine-meets-architectural-portfolio atmosphere. The signature move is the massive ANUC wordmark built from pure geometric shapes — full-radius arches and circles — that doubles as the brand's visual identity and its spatial language. The palette is deliberately restrained to 2% chromatic, letting photography of styled interiors carry all the warmth; the UI never competes, just frames. Components feel architectural rather than app-like: sharp corners, hairline borders, generous negative space, and no shadows. Density is compact in data sections but breathing in editorial sections, with 96px+ section gaps creating a gallery-walk rhythm.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#1a1a1e` | Primary text, all borders, logo forms, icon strokes — the structural near-black that defines every contour across the system |
| Canvas | `#f3f3f2` | Page background — warm off-white that gives the entire system its gallery-wall warmth rather than clinical white |
| Paper | `#ffffff` | Card surfaces, article blocks, elevated panels — pure white sits on top of Canvas to create subtle layering without shadows |
| Ash | `#d1d1d2` | Hairline borders, divider lines, subtle structural rules — the thinnest visible grid |
| Stone | `#c1c2bd` | Secondary borders, muted fills, icon strokes at lower emphasis |
| Linen | `#e7e6e4` | Muted surface for category tags, soft chips, low-emphasis backgrounds — warm-tinted neutral that steps between Paper and Canvas |
| Graphite | `#4d4942` | Muted body text, secondary copy — warm dark gray for hierarchy below Ink |
| Mist | `#8d8d8f` | Tertiary text, timestamps, metadata — the lightest readable gray |
| Bronze | `#9a682c` | Sparingly used warm accent — appears as small punctuation dots or category indicators, never as fills; adds a whisper of warmth to the achromatic system |
| Slate | `#4a626f` | Secondary accent — cool counterpoint to Bronze, used in equally restrained dot/tag contexts to create subtle color rhythm |

## Typography

### Instrument Sans — All UI, navigation, body copy, button labels, and small headlines. Weight 500 carries nav and button emphasis; weight 400 is the default reading voice. Free substitute: Inter, DM Sans.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 15, 16, 18px
- **Line height:** 1.20
- **Letter spacing:** normal

### Instrument Serif — All display and editorial headlines — the 52px and 74px sizes carry the brand's magazine-portfolio voice. The contrast between this high-contrast serif and the neutral sans is the system's signature typographic gesture. Free substitute: Playfair Display, Cormorant Garamond.
- **Substitute:** Cormorant Garamond
- **Weights:** 400
- **Sizes:** 15, 16, 32, 52, 74px
- **Line height:** 1.00–1.20
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 1.2 | — |
| body-lg | — | — | 18px | 1.2 | — |
| subheading | — | — | 32px | 1.1 | — |
| heading | — | — | 52px | 1.05 | — |
| display | — | — | 74px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **buttons:** 0px
- **logoShapes:** 9999px

## Components

### ANUC Wordmark
**Role:** Primary brand identity — monumental geometric letterforms

The ANUC logo constructed from four oversized shapes: two full-radius arches (left and right) and two full circles (inner letters), all filled with Ink (#1a1a1e) on the Canvas background. Each shape is roughly 250–300px tall and fills nearly the full viewport width in the hero. The shapes have 9999px border-radius making them pure geometric forms — no padding, no border, no shadow. This is not a typographic logo; it IS the page.

### Top Navigation
**Role:** Minimal site navigation

Horizontal bar at viewport top with brand mark 'ANUC HOME' left (Instrument Sans 500, 15–16px, Ink) and nav items (NOSOTROS, SERVICIOS, CONTACTO) right-aligned in Instrument Sans 400, 15–16px, uppercase or small-caps tracking. No background fill — sits directly on Canvas. Items separated by bullet dots (·). No border, no shadow, no sticky behavior visible.

### Hero Image Grid
**Role:** Full-viewport visual statement for the landing

Multi-column grid of interior photography tiles filling the viewport, separated by 1–2px hairline borders in Ink. Each tile is a different interior space (living rooms, reading nooks, styled corners). The 'ANUC' wordmark overlays as massive negative-space shapes. No captions, no overlays on the photos themselves.

### Editorial Section Heading
**Role:** Large display text for section openers

Instrument Serif 400, 52–74px, Ink, line-height 1.0–1.05, left-aligned with generous left margin. Preceded by a small uppercase label (e.g., 'SERVICIOS', 'ARTÍCULOS') in Instrument Sans 500, 15px, uppercase, letter-spacing wide, positioned above-left of the headline. The serif's high contrast at 74px is the brand's loudest typographic moment — it commands the page without color or weight tricks.

### Article Card
**Role:** Content preview block in articles section

Rectangular card on Paper (#ffffff) background, 24px padding, no border, no shadow, 0px radius. Contains: a date in Instrument Sans 400, 15px, Mist (#8d8d8f); a title in Instrument Serif 400, 32px, Ink; and a category tag below. Cards stack vertically with 8–16px gaps between them.

### Category Tag
**Role:** Small label chip for content categorization

Inline tag with a small leading dot (·) in Bronze (#9a682c) or Slate (#4a626f), followed by uppercase text in Instrument Sans 500, 15px, Ink. Background: transparent or Linen (#e7e6e4) when given more weight. No border, 0px radius, 4px 8px padding. The colored dot is the system's only chromatic punctuation.

### CTA Button — Outlined Ghost
**Role:** Primary action button (e.g., 'AGENDAR CONSULTA')

Rectangle, 0px radius, 1px solid Ink (#1a1a1e) border, transparent background. Label in Instrument Sans 500, 15px, uppercase, Ink, letter-spacing slightly tracked. Followed by a small arrow icon (→). Padding approximately 12px 24px. No fill state on hover — the border may thicken or the background fills with Ink inverting text to white. This is the system's only interactive element and it stays architecturally restrained.

### Two-Column Editorial Section
**Role:** Content layout pattern for text+image or label+content

Wide left column (label + headline) paired with a narrower right column (list of items or cards). Columns separated by generous whitespace rather than dividers. Left column uses the small uppercase label + oversized serif headline; right column uses compact sans-serif lists or cards.

### Hairline Divider
**Role:** Structural separation between sections and grid cells

1px solid line in Ash (#d1d1d2) or Ink (#1a1a1e). Used to define image grid cells, separate content sections, and outline cards. No decorative styling — the divider is pure architecture.

### Section Label
**Role:** Small uppercase section identifier (e.g., 'SERVICIOS', 'ARTÍCULOS')

Instrument Sans 500, 15px, Ink, uppercase, positioned at the top-left of each editorial section. Optional letter-spacing of 0.5–1px. Functions as the typographic equivalent of a museum placard.

## Do's and Don'ts

### Do
- Use Instrument Serif 400 at 52–74px for all display headlines — the high-contrast serif at oversized scale is the brand's signature typographic moment
- Set all radii to 0px for buttons, cards, and tags — the system is architectural, not soft; sharpness communicates precision
- Maintain the warm off-white Canvas (#f3f3f2) as the dominant background; never use pure clinical white for full-page backgrounds
- Use Ink (#1a1a1e) for all text and borders; let color do no work — the system is deliberately achromatic
- Separate image grid cells with 1–2px hairline borders in Ink to create the gallery-grid structure
- Precede every display headline with a small uppercase Instrument Sans 500 label (15px) to create the editorial section-opening rhythm
- Apply 96px minimum vertical spacing between major sections to maintain the gallery-walk pacing

### Don't
- Do not introduce shadows, glows, or blur effects — the system communicates elevation through background color steps (Canvas → Paper → Linen), never through box-shadow
- Do not use border-radius greater than 0px on any UI element — rounded buttons or cards would break the architectural language; the only rounded forms are the monumental logo shapes
- Do not add chromatic fills to buttons, backgrounds, or large UI surfaces — Bronze and Slate are reserved for dot punctuation only
- Do not use Instrument Sans for display headlines — the serif/sans contrast is the system's signature; flattening both to sans destroys the editorial voice
- Do not place body copy at sizes below 15px — the system is generous with reading size, not compact
- Do not stack dense information without the 96px section gap — the gallery-walk rhythm requires breathing room between content blocks
- Do not use decorative gradients, textures, or background imagery behind text — every text surface must sit on a flat, untextured neutral

## Elevation

The system deliberately avoids shadows entirely. Elevation is communicated exclusively through flat background color stepping: Canvas (#f3f3f2) → Paper (#ffffff) → Linen (#e7e6e4). This creates a paper-architecture feel where every surface feels physically placed, like prints mounted on a gallery wall, rather than digitally floating.

## Surfaces

- **Canvas** (`#f3f3f2`) — Base page background — the warm off-white gallery wall
- **Paper** (`#ffffff`) — Card surfaces and article blocks that float above Canvas
- **Linen** (`#e7e6e4`) — Soft chip and tag backgrounds — the most recessed surface

## Imagery

Photography is the visual centerpiece: large, warm-toned interior design photographs styled with natural light, organic materials (linen, wood, ceramics), and lived-in warmth. Images are treated as full-bleed grid tiles with no overlays, no rounded corners, and no color grading beyond natural warmth. The objects and spaces ARE the heroes — no lifestyle models, no abstract graphics, no illustration. The brand identity itself is geometric shapes rather than photography or illustration, creating a deliberate contrast between organic interiors and architectural wordmark.

## Layout

Full-bleed hero with multi-column image grid (4–5 columns) that spans the entire viewport, with the monumental ANUC wordmark as oversized negative-space shapes overlaying the grid. Below the hero, the layout shifts to a generous max-width (~1200–1440px) centered container for editorial sections. Section pattern is consistently two-column: a wide left column for the small label + oversized serif headline, and a right column for compact lists or article cards. Vertical rhythm is gallery-like: 96px+ between major sections, with flat transitions rather than alternating color bands. Navigation is a single minimal top bar. Content arrangement is left-aligned and asymmetric, with whitespace carrying the compositional weight rather than borders or rules.

## Similar Brands

- **Studio KO** — Same editorial gallery approach — oversized serif display type, near-monochrome warm-white canvas, architectural grid layouts, and photography that speaks without UI decoration
- **Casa Brutus (magazine)** — Magazine-like restraint with Instrument Serif-style display typography, generous whitespace, and a hierarchy driven by typographic scale rather than color
- **Bureau Borsche** — Identical near-monochrome palette, monumental geometric identity marks, and the same editorial-gallery density where whitespace and type carry the composition
- **Gensler** — Architecture-portfolio layout language — full-bleed image grids, hairline cell borders, oversized serif section openers, and the same warm-off-white canvas treatment
- **Norm Architects** — Scandinavian interior-design restraint with 2% colorfulness, warm off-white backgrounds, serif/sans typographic duality, and architectural rather than app-like component design
