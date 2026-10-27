# 601 Inc. — Style Reference
> warm film marquee in darkness

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

601 is a Tokyo film studio whose visual system reduces the web to the ingredients of cinema itself: a near-black void, one warm cream tone pulled from aged celluloid, and a single custom typeface rendered at architectural scale. The entire palette is functional — cream for everything that addresses the viewer, black for the screen behind it — which forces every compositional decision to be about scale, photography, and silence rather than chrome or ornament. Borders are 1px hairlines, elevation is absent, and the only structure is the photograph itself and the oversized numerals that float beside it like a screening schedule. Every page behaves like a single reel unspooling: a wordmark, a date, a still, and room to breathe.

## Colors

| Name | Value | Role |
|------|-------|------|
| Celluloid Cream | `#ece4b4` | Primary text, all icon strokes, 1px hairline borders, and the only outlined-link action border in the system — a warm off-white that reads as aged film stock against black |
| Darkroom Shadow | `#4f4d3c` | Atmospheric mid-surface visible around and between film stills — a desaturated warm olive-black that softens the page from pure void into projection-room dimness |
| Projection Black | `#000000` | Deep canvas void used for the darkest recesses of the page and behind embedded media; the floor beneath everything |

## Typography

### changeling-neo — Sole typeface — used for both the smallest nav label and the 280px display numerals. Weight 400 across every role is a deliberate anti-convention: no bold ever appears, so hierarchy is built purely through scale and tracking. The very tight -4% letter-spacing at 230-280px is what makes the giant wordmark feel carved rather than typeset.
- **Substitute:** Space Grotesk (Google Fonts) at the same tight tracking — closest free match for the geometric humanist geometry; Manrope is a secondary fallback
- **Weights:** 400
- **Sizes:** 42px, 230px, 280px
- **Line height:** normal
- **Letter spacing:** -0.0400em at all sizes
- **OpenType features:** `"ss01" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 42px | 1.3 | — |
| body-sm | — | — | 230px | 1.3 | — |
| body | — | — | 280px | 1.3 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 120px
- **Card padding:** 0px
- **Element gap:** 12px

### Border Radius

- **ui:** 12px
- **nav:** 0px
- **images:** 0px

## Components

### Wordmark "601"
**Role:** Primary brand identity rendered as a single oversized lockup

changeling-neo weight 400 at 230-280px, Celluloid Cream, letter-spacing -0.04em. Sits top-left, anchored to the page edge with no padding. The only moment on the site that large numbers are used as logo; no symbol or icon accompanies it.

### Floating Date Numeral
**Role:** Editorial display element marking screenings or releases

changeling-neo weight 400 at 280px, Celluloid Cream, letter-spacing -0.04em. Positioned mid-canvas with absolute coordinates so it floats in the negative space beside a film still rather than reading as a label. Acts as typographic wallpaper.

### Top Navigation Bar
**Role:** Minimal site chrome

Right-aligned, changeling-neo weight 400 at 42px, Celluloid Cream, with 21px horizontal padding and bullet glyphs (•) as separators between items. No background, no border, no hover treatment beyond opacity shift. ABOUT • ARCHIVE is the entire structure.

### Outlined Link
**Role:** The system's only interactive element pattern

1px solid Celluloid Cream border, changeling-neo 42px Celluloid Cream text, 12px vertical / 21px horizontal padding, no background fill, 0px radius. The 1px border is the button — there is no fill state, no shadow, no filled variant. Used for EXPLORE and similar editorial actions.

### Film Still Frame
**Role:** Primary content surface carrying all chromatic information

Full-bleed photograph with no container chrome — no border, no padding, no radius, no shadow. The image touches the page edges. Caption (if present) sits below in changeling-neo 42px Celluloid Cream with 28px bottom padding. The still is the card.

### Email Footer Label
**Role:** Contact affordance, bottom-left

changeling-neo 42px Celluloid Cream, no border, no background. A bare text link — the design commits to cream-on-black legibility at 42px so no underline or weight change is needed.

### Scroll Indicator
**Role:** Subtle scroll cue, right edge

A single cream dot or short 1px line in Celluloid Cream, positioned at the right viewport margin near the bottom. Minimal to the point of being ambient — discoverable but never demanding.

### Hairline Divider
**Role:** Structural separator between sections

1px solid Celluloid Cream, full-width or constrained to content width. This is the only structural element on the site — there are no backgrounds behind cards, no shaded sections, no panels. Sections divide by 120px gap plus optional 1px rule.

## Do's and Don'ts

### Do
- Use only #ece4b4 and the two blacks; introducing a third color breaks the celluloid projection logic
- Set changeling-neo to exactly 230px or 280px for any branded moment — the giant scale is the brand
- Keep all borders at exactly 1px solid Celluloid Cream — never thicker, never with a fill behind them
- Render images full-bleed with 0px padding, 0px radius, and no frame; the photograph meets the viewport edge
- Separate nav and footer items with the bullet glyph (•) and 21px horizontal padding, not with dividers or spacing alone
- Use the 12px radius token only for incidental UI elements (a small chip, a notification), never for the primary content surface
- Anchor all text to viewport edges — left or right — never center within a constrained column

### Don't
- Do not add drop shadows, glows, blurs, or any other elevation effect
- Do not introduce a second typeface; the system is one font, one weight, three sizes
- Do not use a filled button — the only action pattern is the 1px outlined link
- Do not constrain the layout to a max-width; full-bleed is required to preserve the cinematic frame
- Do not use a color of any kind on UI elements — all color must come from photography
- Do not set body or paragraph text below 42px; if it is not a label or a display moment, it does not belong on this site
- Do not apply gradient fills, noise textures, or film-grain overlays to UI surfaces; the only grain in the system is in the photography

## Elevation

No shadows. Depth is created entirely by three forces: the cream/black contrast boundary (1px border lines that act as the only edge definition), the scale difference between 42px labels and 280px display type, and the full-bleed photograph itself which breaks the dark plane. Adding any drop shadow, glow, or blur would shatter the projection-room stillness the system is built around.

## Surfaces

- **Projection Black** (`#000000`) — Deepest canvas — embedded media backgrounds and absolute void
- **Darkroom Shadow** (`#4f4d3c`) — Primary page background — warm-tinted near-black that prevents the page from reading as a flat #000 UI and instead as a dimly lit room

## Imagery

Cinematic film stills, full-bleed, shot on location or in studio with controlled lighting. The example shows a wide group portrait in a desaturated blue environment — the photography is the only place saturated color appears in the entire design system, and it is always a single still per screen rather than a collage or grid. No illustration, no iconography beyond stroke-only marks, no decorative graphics. Captures are wide, production-quality, and the subject is always people or architecture in defined space — never abstract.

## Layout

Full-bleed, no max-width container, no centered column. The page is a vertical scroll through a single dark projection room. Top band carries the wordmark left, minimal nav right, and one small contextual line of cream text. Subsequent bands alternate between oversized type (wordmark, date numerals) and full-bleed film stills, separated by 120px gaps and the occasional 1px hairline. Text is anchored to viewport edges, not to a content column. No card grids, no feature rows, no pricing tables — this is a portfolio, not a product surface. Navigation is a fixed thin top bar, nothing else is sticky.

## Similar Brands

- **A24 Films** — Same single-tone cream-on-black aesthetic with full-bleed stills and oversized type — both sites treat the web as a screening room rather than a product page
- **Mansour Martin** — Editorial film/photography studio site with the same dark canvas, warm accent, and the discipline of letting one photograph carry a whole screen
- **Acne Studios** — Same commitment to a single warm neutral on black with minimal chrome and oversized custom type as the primary brand element
- **Bureau Cool** — Portfolio-grade agency site where photography is full-bleed and the only structure is type at extreme scale against a dark ground
- **Playdate Studio** — Creative studio identity built on near-monochrome dark palette with a single warm accent and typography doing all the compositional work
