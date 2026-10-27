# Freytag Anderson — Style Reference
> cinema curtain rising on a single word.

A vast moving image carries the screen, the brand name sits in the corner like a title card, and nothing else competes for attention.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Freytag Anderson operates as a cinematic portfolio: full-bleed atmospheric photography carries the entire visual weight while typography recedes to a whisper. The site is almost entirely achromatic — an off-white canvas (#fafafa), pure black ink, and a single warm-charcoal section that reads like a film intermission. FAVORIT, a single grotesque sans-serif, is the only voice, used identically for headlines, body, and UI; weight shifts and tracking do all the work of hierarchy. Text consistently anchors to the top-left viewport corner over imagery, and a single hamburger line replaces conventional navigation. Components are reduced to their minimum: pill-shaped ghost controls with hairline borders, no card surfaces, no shadows, no gradients. The impression is of a film opening — image, title, silence — rather than a product surface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper | `#fafafa` | Page canvas, base surface behind text — off-white, never pure white, to soften photographic edges |
| Ink | `#000000` | Primary text, hairline borders, link underlines — the only chromatic accent in the system is its absence of color |
| Charcoal | `#1c1c1c` | Dark content surface for text-only sections — warm-leaning black that softens contrast against pure ink |
| Midnight Soil | `#141109` | Deepest dark surface, used for the most recessed bands — barely distinguishable from charcoal but warmer |
| Ash | `#dcdcdc` | Hairline borders, disabled borders, subtle dividers — a neutral gray that whispers structure without drawing the eye |
| Driftwood | `#c2b5ae` | Warm taupe accent surface, used sparingly as a tonal break in dark sections — the only non-achromatic hint in the palette |

## Typography

### FAVORIT — The single typeface for everything: hero titles at 41px weight 400, body at 17px weight 400, captions at 15px weight 300. Weight 300 is the signature choice for secondary text — it creates hierarchy through restraint rather than bold contrast. Slight negative tracking (-0.02em to -0.022em) tightens the grotesque's default rhythm. The same family voices headlines, navigation, buttons, and body, which is unusual — most systems differentiate roles through typefaces. Here, FAVORIT's dual weight and tight letterforms carry the entire hierarchy alone.
- **Substitute:** Söhne, Inter, Neue Haas Grotesk
- **Weights:** 300, 400
- **Sizes:** 15px, 17px, 41px
- **Line height:** 1.0–1.7
- **Letter spacing:** -0.02em to -0.022em across all sizes
- **OpenType features:** `"ss01" on, "tnum" on`

### Clarkson — Reserved for micro-copy or supporting text in specific contexts — appears at low frequency and never headlines. Could be a FAVORIT alternate cut rather than a true second family.
- **Substitute:** Söhne
- **Weights:** 300, 400
- **Sizes:** 17px
- **Line height:** 1.40, 1.70
- **Letter spacing:** -0.0200em

### halyard-display — Rare accent — appears in button or micro-label contexts. Functions as a display-only voice when FAVORIT needs to step aside.
- **Substitute:** Söhne, Söhne Breit
- **Weights:** 300
- **Sizes:** 15px, 17px
- **Line height:** 1.20, 1.40
- **Letter spacing:** -0.0200em, 0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 1.4 | -0.33px |
| body | — | — | 17px | 1.7 | -0.34px |
| display | — | — | 41px | 1.18 | -0.9px |

## Spacing & Layout

**Base unit:** 6px

**Density:** spacious

- **Card padding:** 43px
- **Element gap:** 17px

### Border Radius

- **tags:** 0px
- **cards:** 0px (no rounding)
- **inputs:** 0px
- **buttons:** 300px (fully pill)

## Components

### Ghost Pill Button
**Role:** Primary interactive control

Fully rounded pill (border-radius: 300px), hairline 1px border, no fill. Padding: 12px vertical, 20px horizontal. FAVORIT 15px weight 400, letter-spacing -0.02em. Default state: transparent background, #000000 border, #000000 text. Hover likely inverts or thickens border. No shadow, no gradient.

### Outlined Pill Button (Light)
**Role:** Secondary action on dark/photographic backgrounds

Same pill geometry as Ghost Pill Button, but border and text are #fafafa for legibility over imagery. No background fill. 1px border, FAVORIT 15px weight 400.

### Hamburger Menu
**Role:** Sole navigation control

Two thin horizontal lines (1px each) in #fafafa or #000000, top-right viewport corner. No labels, no visible menu items — the menu reveals content on activation. Always the same size regardless of scroll position.

### Hero Title
**Role:** Opening statement over cinematic media

FAVORIT 41px weight 400, line-height 1.18, letter-spacing -0.022em. White (#fafafa). Anchored to the top-left viewport corner, never centered. Sits over full-bleed photographic or video media that fills the entire viewport.

### Section Statement
**Role:** Large declarative text introducing a content block

FAVORIT 41px weight 400, #fafafa on dark surfaces or #000000 on light. Top-left anchored. Generous line-height (1.18) gives each phrase breathing room. The statement acts as the section's only visual identity — no graphics, no icons.

### Three-Column Body Block
**Role:** Detailed descriptive text in a constrained grid

Three equal-width text columns with 17px body text in FAVORIT 400, line-height 1.7. White on dark surface. Columns are tightly leaded with ~17px vertical gap between paragraphs. No column borders, no dividers — the grid is implied through alignment.

### Photographic Hero
**Role:** Primary content surface — not a component but a structural device

Full-viewport, full-bleed cinematic video or still photography. No overlay, no gradient, no text shadow for legibility. The image is unframed — no border, no radius. Text contrast is handled by the image's own tonal range, not by UI chrome.

### Dark Content Section
**Role:** Text-only section with photographic weight

Solid #1c1c1c or #141109 background, no texture. White text only. Functions as a visual pause between photographic acts — like a film intertitle. Generous 288px bottom padding before the next section.

### Image Grid Item (implied)
**Role:** Project thumbnail in portfolio contexts

Full-bleed image, no padding, no caption chrome visible. Images likely sit edge-to-edge in a grid. The system has no card or frame device — images are presented raw, as if printed on the page.

## Do's and Don'ts

### Do
- Keep the palette to six neutrals — never introduce a chromatic accent color; the design's power comes from restraint.
- Anchor all text to the top-left viewport corner on full-bleed media; centering or middle-alignment breaks the title-card logic.
- Use FAVORIT exclusively for UI and body — do not import secondary typefaces for hierarchy; let weight (300 vs 400) and size do the work.
- Set body line-height to 1.7 — generous leading is part of the system's quiet, slow-reading rhythm.
- Use 288px bottom padding between major sections to create the cinematic breath between acts.
- Let photographs and video fill the viewport edge-to-edge with no border, radius, or overlay chrome.
- Use pill geometry (border-radius: 300px) for every button — there is no square or slightly-rounded button in this system.

### Don't
- Do not add a chromatic accent color (blue, red, green) — the system is deliberately achromatic and a single hue would shatter the cinema metaphor.
- Do not add card shadows, drop shadows, or elevation tokens — the design is flat, relying on color contrast and whitespace for separation.
- Do not center text horizontally — the top-left anchor is the system's defining gesture.
- Do not add a traditional navigation bar with visible menu items — the hamburger is the only nav surface.
- Do not use multiple typefaces to create hierarchy — FAVORIT is the only voice, period.
- Do not frame or round images — photographs are presented raw, full-bleed, unbordered.
- Do not use bold (600+) weights — the system speaks at 300 and 400 only; heavier weights would break the whispered tone.

## Elevation

Elevation is deliberately absent. The system relies entirely on color contrast (off-white vs charcoal vs photographic media) and generous whitespace to separate layers. No shadows exist because no surface needs to 'rise' — the page reads as a sequence of full-bleed planes rather than a stack of cards. This is a flat-design system taken to its logical extreme: the photograph itself is the only elevated element, and it sits flush with the viewport edge.

## Surfaces

- **Paper** (`#fafafa`) — Base canvas, the default page surface behind text-only blocks
- **Driftwood** (`#c2b5ae`) — Warm tonal break surface — used as an accent band, not a default
- **Ash** (`#dcdcdc`) — Divider lines, disabled borders, subtle structural gray
- **Midnight Soil** (`#141109`) — Deepest dark band — used sparingly for the most recessed sections
- **Charcoal** (`#1c1c1c`) — Dark content surface for intertitle-style text sections

## Imagery

Imagery is the dominant content type and carries the site's entire emotional weight. Full-bleed cinematic photography and video — atmospheric, often motion-blurred, shot during golden hour, with deep natural grain and warm/cool tonal range. No product photography, no headshots, no UI screenshots. Images are presented raw: no borders, no rounded corners, no overlays, no captions, no attribution chrome. They function like film stills in a director's reel rather than marketing visuals. The system has zero illustration or iconography — no SVG decorations, no spot graphics, no logos competing with the media.

## Layout

Full-bleed, viewport-as-section. The page is not a max-width container with padding gutters; it is a sequence of edge-to-edge planes. The hero is a single full-viewport image or video. The second plane continues the same full-bleed media with a new top-left text statement. The third plane shifts to a solid dark surface (#1c1c1c) with a large headline and a three-column body grid below. Navigation is a single hamburger line in the top-right — no top bar, no breadcrumb, no footer chrome. Sections are separated by generous 288px gaps, creating a cinematic intermission rhythm. Content density is extremely low: one statement per screen, no sidebars, no floating elements, no overlapping layers. The grid that does exist (the three-column body block) is tight and uniform, contrasting the otherwise unbounded photography above and below it.

## Similar Brands

- **Pentagram** — Same single-typeface, full-bleed editorial approach with achromatic palette and text-as-image hero statements
- **Manual (design studio)** — Same achromatic portfolio language — vast photography, minimal type, no decorative chrome, whitespace as structure
- **Bureau Cool** — Same quiet grotesque typography anchored in viewport corners over cinematic full-bleed media
- **Studio Dumbar** — Same anti-product visual logic — portfolio as film, not as UI surface, with restrained type and no component clutter
- **Order** — Same single-family grotesque throughout, generous tracking-tightened headlines, and a near-monochrome palette
