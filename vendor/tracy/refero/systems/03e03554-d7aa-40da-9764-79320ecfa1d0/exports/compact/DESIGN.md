# OHZI Interactive Studio / Dive into digital magic. — Style Reference
> A glowing cube suspended in a dark gallery

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

OHZI is a dark immersive void-gallery: a near-black expanse with a single luminous 3D object suspended in the center, reflected on a wet floor. The interface is deliberately skeletal — a logo, a hamburger, a headline, a ghost button — so the 3D render carries all the visual energy. Typography is exclusively Unbounded set with generous positive tracking, giving every line of text a wide, monumental, almost cinematic feel that whispers rather than shouts. Color is absent by design: the palette is pure grayscale so the 3D scene provides the only chromatic moment, making it feel like looking through a portal. Controls are thin-bordered, sharp-cornered, and translucent — they frame the experience rather than intrude on it.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure White | `#ffffff` | Primary text, icon strokes, hairline borders, outlined button frame — the only foreground color on the dark canvas, used at full opacity for headlines and at 1px hairline weight for UI structure |
| Void Black | `#000000` | Deep background fill, SVG icon bases — the absolute floor of the visual hierarchy, used for full-bleed canvas and asset fills |
| Carbon | `#111111` | Heading text on light sections, deep surface layer — near-black with a whisper of warmth, used where #000000 would feel too flat |
| Fog | `#f5f5f7` | Secondary text, subtle panel surfaces, light-section borders — cool-tinted off-white that softens transitions on inverted sections |
| Ash | `#cfcfcf` | Muted helper text, disabled states, tertiary borders — the mid-gray for elements that should recede |

## Typography

### Unbounded — Sole typeface for everything — headlines, body, buttons, nav. Its geometric, slightly squared character with wide-aperture letterforms reads as digital-native and architectural. Weight 100 for display text creates a near-wireframe quality that feels holographic against the dark background.
- **Substitute:** Space Grotesk, or Chakra Petch for a similar geometric-futurist feel
- **Weights:** 100, 400, 500, 600, 700
- **Sizes:** 14, 16, 17, 18, 19, 23, 24, 30, 32, 38
- **Line height:** 1.20
- **Letter spacing:** 0.067em at 38px → 0.188em at 14px; the scale widens tracking as size decreases, inverting the usual typographic instinct

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.2 | 2.63px |
| body-sm | — | — | 16px | 1.2 | 3.01px |
| body | — | — | 18px | 1.2 | 2.38px |
| subheading | — | — | 24px | 1.2 | 2.66px |
| heading-sm | — | — | 30px | 1.2 | 2.61px |
| heading | — | — | 32px | 1.2 | 2.27px |
| display | — | — | 38px | 1.2 | 2.55px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 80-120px
- **Card padding:** 24-40px
- **Element gap:** 20px

### Border Radius

- **cards:** 0px
- **badges:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Ghost CTA Button
**Role:** Primary action trigger

Transparent fill, 1px solid #ffffff border, 0px radius, ~15px vertical × 30px horizontal padding. Text in Unbounded weight 500, uppercase, ~15px, letter-spacing ~0.132em, color #ffffff. The button is a pure frame — no fill, no shadow, no hover fill change. Its geometry (sharp corners, thin stroke) echoes the 3D cube's edges.

### Brand Lockup
**Role:** Top-left identity mark

Geometric shield/hex icon in #ffffff stroke, followed by 'OHZI INTERACTIVE STUDIO' in Unbounded weight 600, ~14px, uppercase, letter-spacing ~0.188em, color #ffffff. The lockup sits at the top-left with ~25-30px padding from the viewport edge.

### Hamburger Menu Trigger
**Role:** Navigation toggle

Three horizontal lines in #ffffff, 0px radius, ~24px wide, positioned top-right. No background, no border — just raw stroke geometry against the void.

### Hero Headline
**Role:** Page title

Centered, Unbounded weight 600-700, ~38px, uppercase, letter-spacing ~0.067em, color #ffffff. The wide tracking makes it feel like a film title card — monumental but unhurried.

### Hero Subtext
**Role:** Supporting description

Centered, Unbounded weight 300-400, ~16-18px, letter-spacing ~0.132em, color #cfcfcf or #f5f5f7. Single sentence, sits directly beneath headline with ~20px gap.

### 3D Hero Object
**Role:** Central visual anchor

A rendered 3D cube or geometric form floating in the center of the viewport, with a reflective wet-floor effect beneath. This is the only source of color and light in the system — it can glow blue, cyan, violet, or warm white depending on the scene. The object occupies the visual center while text wraps around or overlays it.

### Cookie Consent Banner
**Role:** Compliance overlay

Fixed bottom bar, transparent or #000000 background, white text at ~14px Unbounded weight 400, letter-spacing ~0.188em. Dismiss icon (X) in top-right of banner, rendered as thin #ffffff stroke.

## Do's and Don'ts

### Do
- Use Unbounded exclusively — never substitute a secondary typeface, the single-family discipline is the identity
- Apply positive letter-spacing to all text; never collapse tracking below 0.067em even at display sizes
- Keep all UI elements at 0px border-radius — sharp corners are non-negotiable and echo the 3D geometry
- Let the 3D scene be the sole source of color and light; UI stays pure grayscale (#ffffff, #f5f5f7, #cfcfcf, #111111, #000000)
- Use 1px hairline borders for all structural elements — buttons, dividers, card frames
- Center-align hero content and maintain generous vertical breathing room (80-120px between sections)
- Pair weight 600-700 for headlines with weight 100-400 for body to create a weight-contrast hierarchy that replaces color contrast

### Don't
- Never introduce accent colors, gradients, or chromatic buttons — the system is deliberately achromatic
- Never use border-radius on buttons, cards, inputs, or images — the sharp geometry is load-bearing
- Never apply shadows, glows, or blur effects to UI elements — depth belongs to the 3D scene only
- Never use negative letter-spacing or tight tracking — the wide-open spacing is the typographic signature
- Never fill buttons with solid color — always use the transparent ghost-button treatment with a 1px stroke frame
- Never use more than one typeface or mix serif/sans — Unbounded is the sole voice
- Never crowd the central viewport with UI — the 3D object needs negative space to breathe

## Elevation

No shadows, no glows, no blur. Depth is created entirely through the 3D scene's own lighting and the reflective floor effect. UI elements sit flat against the void — any elevation would compete with the central 3D object.

## Surfaces

- **Void Canvas** (`#000000`) — Full-bleed page background — the dark gallery floor
- **Carbon Panel** (`#111111`) — Inverted-section surfaces, heading backgrounds where depth is needed
- **Fog Surface** (`#f5f5f7`) — Light-mode content sections that alternate with the dark hero

## Imagery

Imagery is exclusively 3D-rendered geometric objects (cubes, prisms, abstract forms) floating in a dark void with reflective floor effects. No photography, no illustration, no flat icons. The 3D renders provide all chromatic content — they glow, refract, and cast reflections. UI icons (hamburger, dismiss X, logo mark) are minimal thin-stroke line geometry in #ffffff. The visual density is extremely low: one hero object, lots of void. This is an imagery-light site where a single rendered artifact carries the entire visual weight.

## Layout

Full-bleed dark canvas with no max-width constraint. Hero is a single full-viewport section: the 3D object sits dead-center, headline and subtext are centered directly above or overlapping the object, and the CTA button sits below. Navigation is minimal — a brand lockup top-left and hamburger top-right, both floating over the void with no background or container. Vertical rhythm is spacious, with 80-120px between distinct content blocks. The page likely scrolls to reveal additional sections (about, work, contact) that may alternate to lighter surfaces, but the dominant impression is of a single dark room with one illuminated object.

## Similar Brands

- **Activision (gaming/entertainment)** — Same dark-void hero with a single luminous 3D object as the visual centerpiece, wide-tracked uppercase headlines, minimal UI chrome
- **Apple Vision Pro** — Full-bleed dark canvases with a single floating product/object, zero accent color, ghost button controls, cinematic negative space
- **Unity Technologies** — 3D-rendered hero objects suspended in dark space, geometric sans-serif typography with wide tracking, agency/tech crossover aesthetic
- **Burberry (luxury fashion)** — Unbounded's wide positive tracking at all sizes mirrors luxury fashion's letter-spaced wordmarks — the same typographic restraint signals premium positioning
- **Spline (3D design tool)** — Dark immersive 3D-first landing pages with minimal UI, single hero object, grayscale interface that lets the 3D content provide all color
