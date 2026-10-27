# Bōjka Studio — Style Reference
> fluorescent gallery wall

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bōjka Studio operates on radical typographic confidence: a single custom display face blown up to poster dimensions, paired with a near-total absence of color until a saturated electric green detonates across the hero. The page reads as a printed art-poster dragged into a browser — oversized black wordmark, generous whitespace, a single chromatic explosion, then calm white again. Surfaces stay flat and unshadowed; weight comes from scale and contrast, never from elevation or gradients. Components are reduced to their typographic essence — nav is bare text on a white strip, cards are giant rounded rectangles, and decorative geometry is implied by oversized radii (68px) rather than by borders or shadows. An orange (#ff4600) accent threads through headings and rule lines as a warm counterpoint to the cold green, never enough to compete — it just keeps the eye moving.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon | `#000000` | Primary text, all hairline borders, nav text, link underlines — the dominant ink. At 21:1 against white it carries the entire typographic system on its own |
| Graphite | `#282828` | Secondary text, image and card borders, soft structural strokes — slightly lifted from pure black to create a quieter border weight without losing contrast |
| Bone | `#ffffff` | Page canvas, card surfaces, image backgrounds — the neutral ground that lets the green and oversized type do all the visual work |
| Fluorescent | `#0af500` | Full-bleed hero/feature band background, section color blocks — a near-lime pure green used sparingly as a single saturated field. Its only job is to shock the eye and establish the studio's visual voice; it should never appear on UI controls, text, or thin UI strokes |
| Ember | `#ff4600` | Orange outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |

## Typography

### custom_15364 (Bōjka Display) — The studio's signature display face — used at 157px for the wordmark and section headlines, and at 44px for sub-headings. Its 1.0 line-height at 157px lets characters nearly touch; this tight vertical spacing combined with negative tracking is what gives the wordmark its poster-like compression. The custom letterforms (note the macron over 'o' in 'Bōjka') are non-negotiable brand identity and must be preserved at all sizes.
- **Substitute:** If unavailable, use PP Editorial New or Migra Italic for closest editorial weight; never substitute a geometric grotesque — the warmth and slight contrast variation of the custom face is the point
- **Weights:** 400
- **Sizes:** 22px, 44px, 157px
- **Line height:** 1.00, 1.09, 2.73
- **Letter spacing:** -0.008em at body, +0.009em at display
- **OpenType features:** `"ss01" on, "kern" on, "liga" on`

### -apple-system / BlinkMacSystemFont (System UI) — Body copy, supporting text, and utilitarian UI labels. Intentionally restrained — the system font at default 16px recedes so the display face carries the personality. Never use it for headlines or navigation links.
- **Substitute:** SF Pro Text, Inter, Helvetica Neue
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.00

### Roboto — Larger body and descriptive paragraphs where the system stack needs a more readable default — slightly looser leading (1.44) suggests it's used for longer copy blocks rather than labels.
- **Substitute:** Inter, IBM Plex Sans
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.44

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 16px | 16 | -0.128px |
| body-lg | — | — | 18px | 26 | 0px |
| subheading | — | — | 22px | 22 | -0.176px |
| heading | — | — | 44px | 48 | 0.396px |
| display | — | — | 157px | 157 | -1.256px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80-120px
- **Card padding:** 32-48px
- **Element gap:** 16px

### Border Radius

- **tags:** 68px
- **cards:** 68px
- **buttons:** 20px

## Components

### Hero Wordmark Block
**Role:** Studio identity statement at the top of the page

Full-bleed Fluorescent (#0af500) section, min-height 100vh, padding 48px. Displays the brand wordmark at 157px using custom_15364 weight 400, line-height 1.0, letter-spacing -0.008em, color #000000. Text is top-left aligned, breaking the viewport edge if needed.

### Image Card
**Role:** Project showcase and case-study thumbnail

White (#ffffff) surface, 1px solid #282828 border, border-radius 68px, padding 0 (image bleeds to the radius edge). Image is full-bleed within the card. No shadow. Card sits on the white page canvas, separated only by its border and radius — never by elevation.

### Section Heading (Display)
**Role:** Section titles and feature statements

Custom_15364 weight 400 at 44px, line-height 1.09, letter-spacing +0.009em, color #000000. Left-aligned, no underline, no accompanying label. May use Ember (#ff4600) as text color for emphasis variants.

### Body Paragraph
**Role:** Descriptive and supporting copy

System font (apple-system) at 16px, line-height 1.0, color #000000. Tighter leading than usual — the tight rhythm is intentional and matches the compressed display type. For longer paragraphs, switch to Roboto 18px / 1.44.

### Bottom Nav Strip
**Role:** Primary site navigation

Fixed/sticky horizontal bar at viewport bottom, white (#ffffff) background, 1px top border #000000. Links set in system font 16px weight 400, color #000000, separated by generous horizontal gap (~48px). No background fills, no pills, no icons — pure text navigation. Language toggle ('ENG') right-aligned.

### Accent Rule Line
**Role:** Decorative horizontal divider and section punctuation

1-2px solid Ember (#ff4600) line used as an editorial accent between sections or beneath key headings. Functions as the only warm color thread in the system besides the green band — use sparingly, never as a functional UI divider (use #282828 for those).

### Oversized Section Title
**Role:** Full-bleed statement type between content sections

Custom_15364 at 157px, line-height 1.0, color #000000, set on white canvas with 80-120px vertical padding. Functions as a typographic 'section break' — essentially a second hero in miniature. Letter-spacing -0.008em.

### Language Toggle
**Role:** Locale switcher in bottom nav

Plain text label ('ENG') in system font 16px, color #000000, no background, no border, no chevron. Underline on hover only.

### Full-Bleed Color Band
**Role:** Section background block — the only chromatic surface

Edge-to-edge Fluorescent (#0af500) section containing a headline and optional image. No border, no internal card, no shadow. Always sits between two white sections to maximize contrast.

### Rounded Image Frame
**Role:** Inline image/photography within body sections

Image wrapped in a 68px radius container with 1px #282828 border. Used for secondary images that aren't full project cards. Padding inside the radius is 0; the image fills the frame.

## Do's and Don'ts

### Do
- Set the wordmark at 157px in custom_15364 weight 400 with line-height 1.0 and letter-spacing -0.008em — this exact combination is the brand's identity
- Reserve Fluorescent (#0af500) for full-bleed section bands only; never use it for buttons, text, borders, or small UI elements
- Use 68px border-radius on all cards, image frames, and tag-like elements to maintain the rounded-poster feel
- Separate UI layers with 1px borders in #282828, never with shadows — the system is intentionally flat
- Set body copy in -apple-system at 16px with line-height 1.0; the tight rhythm matches the compressed display type
- Let the display face carry section titles at 44px or 157px — never substitute a system font for headlines
- Use the 16px column gap token for inline element spacing; pad cards internally with 32-48px

### Don't
- Do not add box-shadows to any element — depth comes from scale, not elevation
- Do not use the Fluorescent green on text, icons, or button fills — it's a section background color only
- Do not call #ff4600 a CTA or primary action color — it has no action-background or action-border evidence and is used purely for heading/border decoration
- Do not shrink the wordmark below 44px; the custom face is designed for poster dimensions
- Do not introduce additional accent hues (blues, pinks, yellows) — the palette is intentionally black/white/green/orange
- Do not use a multi-column grid system for hero sections — hero text breaks the grid intentionally for editorial effect
- Do not use icons in navigation or as decoration — the design relies on type and whitespace, not iconography

## Elevation

The system uses zero shadows. Depth and hierarchy are created entirely through scale, color contrast, and hairline borders (1px graphite #282828). Any added shadow breaks the flat poster aesthetic and must be avoided.

## Surfaces

- **Bone Canvas** (`#ffffff`) — Default page background across all body sections
- **Card Surface** (`#ffffff`) — Project cards and content blocks sitting on the canvas — distinguished by 68px radius and hairline graphite border, not by fill change
- **Fluorescent Band** (`#0af500`) — Full-bleed accent section (hero/feature) that interrupts the white canvas — the only chromatic surface in the system

## Imagery

Photography is used selectively as product/lifestyle evidence (e.g., the framed device shot in the hero) — always full-bleed within a card, always contained inside the 68px radius that defines the system. No decorative illustration, no abstract graphics, no icons in the traditional sense; the only 'graphic' element is the massive type itself. When imagery appears it sits on a clean light surface, cropped tight, and never overlaps type. The Fluorescent green band acts as a pure-color stand-in for imagery in sections that don't need a photograph.

## Layout

The page is a vertical sequence of full-bleed horizontal bands: a tall Fluorescent hero (roughly one viewport) with the 157px wordmark top-aligned, followed by white sections with centered or left-aligned oversized type, and a fixed bottom nav strip. Content is max-width contained (~1440px) with generous gutters, but sections themselves are full-bleed to allow the green band to span edge-to-edge. Project/showcase cards are large single-column or two-column blocks with 68px radius and 1px graphite borders — they read as physical prints pinned to a gallery wall rather than UI components. The grid is loose, not a strict 12-column: expect asymmetric arrangements where oversized headings dictate flow.

## Similar Brands

- **Pentagram** — Same editorial-poster sensibility with oversized display type and full-bleed color bands interrupting white sections
- **Studio Dumbar** — Confident typographic identity pushed to extreme scale, with bold flat color sections and zero reliance on shadows or gradients
- **Wieden+Kennedy** — Studio-as-author voice: the wordmark and type do the branding, supported by a single saturated accent color used as full-bleed canvas
- **Instrument** — Restrained palette with one electric accent color and oversized display type breaking conventional grid hierarchies
- **Vitra** — Gallery-wall presentation of work — large rounded image cards, generous whitespace, and type-led layout with minimal UI chrome
