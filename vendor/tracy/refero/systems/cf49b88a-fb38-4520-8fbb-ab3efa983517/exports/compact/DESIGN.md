# OFF WHITE — Style Reference
> Glitched editorial monolith on midnight — a wall of pixelated green typography in which portrait photographs of a single human face are pressed into the negative space between monumental letterforms, all on absolute black.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

This is a conceptual editorial experience, not a product UI — the visual system weaponizes binary extremes (pure black canvas, pure white text) and three vivid chromatic accents (electric green, alarm red, hi-vis yellow) to physically manifest the site's theme of the 'gray area between black and white.' Typography is deliberately polarized: a custom blocky display face scaled to 180–500px acts as architecture, while a conventional Times serif at 16px whispers against it as editorial annotation. Layout is collage-driven rather than grid-rigid — portrait photographs overlap display type, bleed past frames, and stack in an irregular scatter, producing a zine/protest-poster feel that rejects conventional product UI patterns. Spacing is generous vertically (60–120px) but horizontally dense and chaotic, with no max-width container constraining the canvas. The custom 'Offwhite' display face is the single most important asset in the system: its blocky pixel-inspired geometry makes every letter a sculptural object.

## Colors

| Name | Value | Role |
|------|-------|------|
| Voltage Green | `#00fb34` | Green action color for filled buttons, selected navigation states, and focused conversion moments |
| Alarm Red | `#ff0000` | Frame borders, decorative strokes, section dividers — the most-used border color in the system. Borders total 44 instances vs only 12 backgrounds, meaning red reads as a hard rectangular frame or alert outline rather than a surface fill |
| Caution Yellow | `#fff500` | Yellow outline accent for tags, dividers, and focused UI edges |
| Absolute Black | `#000000` | Page canvas, photo tile borders (104 image borders), all text colors. The most frequent single color in the system (3357 occurrences) — everything else floats on it |
| Pure White | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Ashen Gray | `#aba4a4` | Medium-contrast borders, control outlines, and structural separators. |

## Typography

### Offwhite — Sole display and heading face, also used for buttons and links. The blocky pixel-inspired geometry of this custom face is the brand's most important asset — at 180–500px each letter becomes a sculptural object that photographs nest into. Weights 600/700 are reserved for display-scale usage; 400 carries inline link and button use.
- **Substitute:** Druk Wide Bold, VT323 (for pixel-mood at small sizes), or a custom blocky display sans
- **Weights:** 400, 600, 700
- **Sizes:** 11, 18, 20, 36, 38, 42, 48, 56, 72, 96, 180, 500
- **Line height:** 1.00–1.56 (tight 1.00–1.10 for display, 1.25–1.56 for inline use)

### Times — Sole body face. The deliberate collision of a conventional serif against the radical blocky display face is a core editorial gesture — Times reads as quiet annotation, the opposite of Offwhite's shout. Body text is always 16px, always Times, always 1.20 leading.
- **Substitute:** Source Serif Pro, PT Serif, or system 'Times New Roman'
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.20

### Arial — Rare utility use for small button labels and meta text where Times would feel too 'editorial.' Used sparingly (freq=6) — only when functional UI needs a neutral voice.
- **Substitute:** Helvetica, Inter, system-ui
- **Weights:** 400
- **Sizes:** 13
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | — |
| body | — | — | 16px | 1.2 | — |
| subheading | — | — | 18px | 1.3 | — |
| body-lg | — | — | 20px | 1.31 | — |
| heading-sm | — | — | 36px | 1.25 | — |
| heading-lg | — | — | 48px | 1.15 | — |
| display | — | — | 72px | 1.1 | — |
| display-lg | — | — | 96px | 1 | — |
| hero | — | — | 180px | 1 | — |
| monumental | — | — | 500px | 1 | — |

## Spacing & Layout

**Base unit:** 6px

**Density:** spacious

- **Section gap:** 60-120px
- **Card padding:** 40px
- **Element gap:** 40px

### Border Radius

- **links:** 30px
- **images:** 0px
- **buttons:** 30px
- **surfaces:** 0px
- **display-type:** 0px

## Components

### Monumental Display Letterform
**Role:** Hero scale typography

Custom Offwhite face at 180–500px, line-height 1.00, weight 600 or 700, color #00fb34 on #000000. Each letter is a near-window-sized sculptural object with blocky pixel-inspired geometry. Letters interlock and overlap horizontally to form a single compound word, with portrait photos pressed into the gaps between strokes.

### Portrait Photo Tile
**Role:** Scattered editorial imagery

Sharp-edged (0px radius) rectangular photographs of a single human subject in cinematic dark-moody lighting. Sits at varying scales (roughly 120–280px wide), rotated slightly in some cases, with no internal padding or framing. Always layered against #000000 with no drop shadow — depth comes from z-stacking, not blur.

### Photo Collage Field
**Role:** Hero background composition

Irregular scatter of 12–20 Portrait Photo Tiles filling the negative space between Monumental Display Letterforms. No fixed grid columns — tiles are positioned to accentuate letter geometry, with eyes and faces deliberately placed at letter intersections.

### Editorial Body Passage
**Role:** Narrative annotation

Times 16px / 1.20 line-height, color #fff500 (Caution Yellow) on #000000. Body text is always 16px, never larger or smaller, and the serif/grotesk contrast against the Offwhite display face is the entire point. May run horizontally or rotated 90° vertically through the collage.

### Caution Yellow Hamburger Icon
**Role:** Navigation trigger

Three short horizontal bars in #fff500 (Caution Yellow), 2px stroke weight, positioned top-right. The only navigation UI visible — a minimal intrusion into the editorial composition.

### Red Frame Border
**Role:** Section delimiter / alert frame

Hard rectangular outline in #ff0000 (Alarm Red), 1–4px stroke, sharp 0px corners. Wraps a section, a single photo, or a body passage to signal 'this is the warning / this is the framed statement.' Background stays #000000 inside the frame.

### Filled Action Button
**Role:** Primary CTA

Offwhite face, 13px Arial or 18px Offwhite, weight 400, color #000000 on #00fb34 (Voltage Green) fill, 30px border-radius, padding 12px 24px. The 30px radius is the only soft edge in the system — every other element is sharp.

### Yellow Inline Link
**Role:** In-prose navigation

Offwhite 18px / 1.30, color #fff500, no underline by default, underline on hover. 30px border-radius if it ever becomes a pill-shaped tag. Sits inside Editorial Body Passages as a quiet yellow accent.

### Inverted White Text Block
**Role:** Binary counterpart passage

Times 16px / 1.20, color #000000 on #ffffff, no padding border. Used for passages that need to read as 'the other extreme' of the black/white binary — a literal white panel breaking the black canvas.

### Vertical Text Column
**Role:** Compositional spine

Same Times 16px body type, rotated 90° (reading bottom-to-top), threading vertically through the photo collage. Functions as a visual string connecting the top and bottom of the page composition.

## Do's and Don'ts

### Do
- Scale the Offwhite display face to 180–500px for hero letterforms and keep it at 1.00 line-height — the monumentality is the whole point
- Use 30px border-radius exclusively on buttons and links; everything else (display type, images, frames, surfaces) stays at 0px sharp edges
- Layer Portrait Photo Tiles behind and between display type, never in clean modular grids — the chaos is compositional
- Keep body copy at Times 16px / 1.20 line-height in #fff500 — the serif/grotesk collision against blocky Offwhite is the signature editorial gesture
- Maintain #000000 as the only canvas color across every section, including transition between sections — no light bands
- Use #00fb34 as the only filled action color, and let its neon glow carry CTA visibility against the black canvas

### Don't
- Don't apply box-shadows, drop-shadows, or gradients anywhere — depth must come from z-stacking and color contrast only
- Don't round image corners or display type edges; the blocky 0px geometry is what gives the system its protest-poster identity
- Don't introduce new accent colors beyond the four anchors (#000000, #ffffff, #00fb34, #ff0000, #fff500) — the chromatic vocabulary is intentionally narrow
- Don't constrain the layout to a max-width container; let display type and photos bleed to viewport edges
- Don't set the Offwhite display face below 36px — at small sizes it loses its blocky monumentality and reads as a generic bold sans
- Don't stack body copy in conventional centered columns — float it through the collage, including rotated 90° vertical runs
- Don't use a light background, even for cards or panels, unless intentionally creating a binary 'white extreme' passage with #000000 text

## Elevation

Flat by absolute rule. Depth is generated exclusively through z-index layering, color contrast, and photo overlap — never through box-shadow, blur, or gradient. The blocky geometry of the Offwhite display face and the scattered photo tiles are the only depth signals; any soft shadow would dissolve the protest-poster tension the system is built on.

## Surfaces

- **Midnight Canvas** (`#000000`) — Full-bleed page background, all sections
- **Inverse Panel** (`#ffffff`) — Rare white-on-black inversion blocks, photo card edges
- **Alert Frame** (`#ff0000`) — Rectangular border frames, alert outlines
- **Neon Type Field** (`#00fb34`) — Display type fills, action backgrounds
- **Caution Highlight** (`#fff500`) — Editorial body text, link color, icon color

## Imagery

The visual language is single-subject cinematic portraiture: tight crops on a Black man's face (eyes, jaw, three-quarter profile, full-face), lit with high-contrast dark-moody key light, desaturated except for skin tones, set against deep out-of-focus dark backgrounds. Treatment is sharp-edged, never rounded or masked; images are rotated slightly and layered with hard rectangular edges rather than feathered. There is no lifestyle context, no product photography, no illustration — the human face IS the hero content. Density is high: 12–20 portrait tiles crowd the viewport at any given scroll position, deliberately overwhelming the eye. Role is narrative atmosphere, not decorative or explanatory — the portraits embody the site's 'gray area between black and white' theme through human presence.

## Layout

Full-bleed, no max-width container, no modular grid system. The page is built as a single tall vertical composition: Section 1 uses massive green 'OFF' letterforms (180–500px) with portrait photos filling the letter interiors and negative space, running edge-to-edge. Section 2 continues the pattern with 'WHITE' letterforms, same scale, same photo scatter, same black canvas. Body text (Times 16px in #fff500) floats through both sections, including rotated 90° vertical passages. A single yellow hamburger icon sits top-right as the only fixed navigation element. There is no header bar, no footer, no sidebar, no card grid — the composition is closer to a vertical poster or zine spread than a product page. Section gaps are 60–120px of pure black breathing room, but within sections the horizontal composition is dense and chaotic.

## Similar Brands

- **Virgil Abloh / Off-White™** — Shared quotation-mark and industrial-stencil typographic attitude, black-canvas default, and the deliberate conflation of 'off-white' as both a literal color and a conceptual middle ground
- **Bloomberg Businessweek covers** — Same radical use of full-bleed typography at extreme scale against photographic subjects, with a custom display face doing the work a layout grid would normally do
- **David Carson's Ray Gun era** — Anti-grid collage composition, type set at angles and overlapping imagery, and the rejection of clean product-UI conventions in favor of editorial chaos
- **Saul Bass title sequences** — Monumental single-color typographic forms carved out of black, with imagery pressed into letter-shaped negative space
- **It's Nice That / feature editorial spreads** — Same generous vertical rhythm (60–120px section gaps) and the alternation between a serif body voice and a display sans headline voice
