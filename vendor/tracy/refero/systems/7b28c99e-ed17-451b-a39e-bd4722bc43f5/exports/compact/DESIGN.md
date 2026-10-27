# 21 TSI — Style Reference
> Crimson void, single silhouette — a high-fashion editorial spread where the UI dissolves into atmosphere.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

21 TSI operates in the grammar of luxury fashion editorial: the interface itself is austere monochrome — white type, black canvas, hairline rules — while full-bleed crimson photography carries the entire emotional register. UI chrome is deliberately reduced to a single thin top divider, small uppercase wordmarks, and pill-bordered controls; nothing competes with the image. Typography is the structural skeleton: Saans at 12px for nav, then jumping to 106–245px for display — a near-vertical scale that makes individual headlines feel like runway installations rather than page headers. The system prefers silence over information density; every interactive element is a ghost, every frame is a photograph, and the only color that matters is whatever the lens captures.

## Colors

| Name | Value | Role |
|------|-------|------|
| Black Void | `#000000` | Page canvas behind full-bleed imagery, button borders on inverted elements, deepest surface layer |
| Paper White | `#ffffff` | Primary text, navigation labels, ghost-button borders, hairline rules, every UI stroke above imagery |
| Smoke | `#4d4d4d` | Muted secondary borders and dividers used when full white feels too hot against the photographic background |
| Crimson Heat | `#b62b1a` | Dominant brand atmosphere from full-bleed editorial photography — the only chromatic note in the system, always carried by the image rather than applied to UI chrome |

## Typography

### Saans — The only typeface. Saans' four-weight ladder runs from 300 whispers to 790 black shouts, with 380 as the confident default and 570 as the editorial mid-voice. Custom by Displaay — a geometric sans with a distinctly contemporary editorial posture.
- **Substitute:** Inter, Manrope, or General Sans — any geometric grotesque with a true 300 weight and tight default tracking will carry the same silence-plus-shock dynamic.
- **Weights:** 300, 380, 570, 790
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 47px, 79px, 106px, 130px, 136px, 245px
- **Line height:** 1.00–1.43 (1.0–1.15 for display, 1.30–1.43 for body)
- **Letter spacing:** -0.025em on display sizes (47px and above); +0.05em on uppercase UI labels (12–20px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.3 | 0.6px |
| body-sm | — | — | 14px | 1.38 | 0.7px |
| body | — | — | 16px | 1.43 | 0.8px |
| subheading | — | — | 20px | 1.3 | 1px |
| heading-sm | — | — | 47px | 1.15 | -1.18px |
| heading | — | — | 79px | 1.14 | -1.98px |
| heading-lg | — | — | 106px | 1.11 | -2.65px |
| display | — | — | 130px | 1.08 | -3.25px |
| display-lg | — | — | 136px | 1.05 | -3.4px |
| display-xl | — | — | 245px | 1 | -6.13px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 30-60px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **bodies:** 8px
- **buttons:** 70px
- **circular:** 594px

## Components

### Top Nav Bar
**Role:** The only persistent navigation surface

A single 1px white hairline runs edge-to-edge across the top, with items floating below it in Saans 12px, weight 380, letter-spacing 0.6px, uppercase, white. The logo wordmark sits left ('21|TSI' with a vertical bar separator), navigation links ('THE SPHERE LAB', 'JOIN THE TEAM', 'INVEST') are evenly distributed across the bar with roughly 38px horizontal gaps, and utility controls (CONTACT, FR, SOUND) cluster on the right. No background fill, no border below — just the hairline above.

### Ghost Pill Button
**Role:** Secondary action control (language toggle, contact, sound)

70px border-radius, 1px white border, fully transparent fill, padding 10px 20px. Label in Saans 12px, weight 380, uppercase, letter-spacing 0.6px, white. The pill geometry softens the monochrome severity and signals interactivity without weight. The leading dot before 'CONTACT' (visible in screenshots) is a 4px white circle as an online/active indicator.

### Nav Link
**Role:** Primary navigation item

Inline text only — no background, no border. Saans 12px, weight 380, uppercase, letter-spacing 0.6px, white. No hover affordance other than subtle opacity shift. The nakedness is the affordance: nothing else on the page looks like this except the button labels.

### Logo Wordmark
**Role:** Brand mark and home link

'21' + vertical bar (1px wide, ~12px tall, white) + 'TSI' rendered as inline Saans 12px, weight 380, uppercase, letter-spacing 0.6px, white. The bar is the only graphic device in the entire logo system — no symbol, no glyph, no mark.

### Full-Bleed Editorial Hero
**Role:** Primary content surface, replaces traditional hero section

Photograph fills 100vw at full or near-full viewport height with no overlay text, no gradient, no scrim. The image is the hero. A single human figure occupies the frame off-center (rule-of-thirds left), shot in profile or three-quarter, with motion (wind, hair, fabric) to give the static frame life. Lighting is dramatic, saturated crimson with deep shadow falloff — the red is in the photograph, never applied as a CSS background.

### Display Headline
**Role:** Editorial-scale title set in oversized type

Saans 79–245px, weight 300 (light) for the most dramatic moments or 570 for the more declarative ones, line-height 1.0–1.14, letter-spacing -0.025em. White on the photographic background — no shadow, no outline. The extreme size and light weight create a 'whispered shout' that mirrors the visual restraint of the rest of the UI.

### Circular Frame (594px radius)
**Role:** Reserved for portrait crops or signature graphic elements

A 594px border-radius on a square container produces a full circle. Used for tightly-cropped portrait vignettes when the brand needs a geometric counterpoint to the free-bleed photography — the only place a hard shape appears in the system.

### Body Card (8px radius)
**Role:** Rare utility surface for form, modal, or grouped content

8px border-radius, 1px #4d4d4d border, transparent or #000000 fill, 20px padding. Body text in Saans 16px, weight 380, line-height 1.43, letter-spacing 0.8px, white. Used sparingly — the editorial mode of the site rarely needs cards at all.

## Do's and Don'ts

### Do
- Use Saans (or Inter/Manrope) for all type — never substitute a humanist or slab serif, the geometric precision is the voice.
- Apply the 0.05em positive tracking to every uppercase label at 12–20px — the airy spacing is what makes 12px readable as editorial chrome.
- Apply -0.025em tight tracking on every display size 47px and above — the negative tracking is required to prevent oversized letters from drifting apart.
- Use the 70px pill radius on every interactive control — CONTACT, FR, SOUND and their peers — never use the 8px radius on a button.
- Let the photograph fill 100vw at maximum viewport height with no overlay, scrim, or text — the image is the design.
- Hold the UI to #ffffff on #000000 plus a single 1px hairline at the top — chrome should never exceed two colors and one line.
- Use weight 300 (not 700) for the most dramatic display moments — the whisper-weight against massive size is the signature move.

### Don't
- Do not apply a solid red CSS background — the crimson is always a photograph, never a fill color.
- Do not use filled buttons with a chromatic background; all interactive controls are ghost/outlined with 1px white border.
- Do not place body text on top of editorial photography — give text its own background or breathing space.
- Do not use drop shadows, glows, or any elevation effect — the system is strictly flat, depth comes from the lens only.
- Do not introduce a second typeface or icon font; every glyph comes from Saans or is drawn as a primitive shape.
- Do not use a max-width content container — the layout is full-bleed by philosophy, not by accident.
- Do not use display sizes below 47px or above 245px — the scale jump is the rhythm; intermediate sizes break the vertical accent.

## Elevation

No shadow system. Elevation is expressed through photography depth and figure-to-ground contrast, not drop shadows. Components sit flat against the image as if printed onto it; the only vertical cue is the 1px hairline at the top of the viewport.

## Surfaces

- **Page Canvas** (`#000000`) — True black base beneath all photography; visible only at the very top of the viewport and during transitions
- **Hairline Rule** (`#ffffff`) — The single 1px white line that separates the nav from the hero — the only structural element of the UI
- **Photographic Surface** (`#b62b1a`) — Full-bleed crimson editorial imagery that functions as the actual page background where content lives

## Imagery

Full-bleed editorial fashion photography is the only imagery the system uses, and it does all the work. Treatment: 100vw width, large viewport height, no padding, no rounded corners, no overlay. Subjects are single human figures (typically a model in motion — hair or fabric caught mid-swing), shot in profile or three-quarter pose, lit by dramatic single-source crimson light that produces deep shadow falloff and a near-silhouette body. Color treatment is saturated and warm — the red dominates, skin tones are bronzed and slightly desaturated, blacks are crushed deep. Resolution feels cinematic and slightly grain-textured. Density: image-heavy to the extreme — a single photograph often occupies an entire screen, and text never sits on top of imagery (it gets its own breathing space above or below). Iconography is essentially absent; the few UI indicators (online dot, nav separators) are hand-built geometric primitives, never an icon font.

## Layout

Full-bleed throughout — there is no max-width container, no card grid, no multi-column body text. The page model is a vertical stack of photographic viewports with hairline-separated content strips between them. The hero is always a full-viewport editorial image; nav sits above the hero as a single 60–80px strip. Section rhythm is defined by image-to-image transitions rather than background bands: one crimson frame dissolves into the next, with maybe 20–30px of black breathing space and a small uppercase label marking each section. Content arrangement is asymmetric — figures placed off-center, text aligned left with generous left margin (38px+), and the right side of the frame left empty to let the photograph breathe. No card grids, no pricing tables, no feature matrices. The grid is essentially the photographic frame itself.

## Similar Brands

- **Maison Margiela** — Same editorial restraint: monochrome type, single hairline nav, oversized display headlines, and photography-as-design with no chrome interfering.
- **Rick Owens** — Identical dark-canvas-plus-crimson-photography tension, extreme type scale jumps, and brutalist pill-button utility controls.
- **Acne Studios** — Shares the thin-rule top nav, small uppercase wordmark, oversized light-weight display type, and full-bleed single-subject editorial imagery.
- **Issey Miyake** — Same whisper-weight headlines at runway scale, quiet monochrome UI, and reliance on the photograph to deliver the entire chromatic identity.
- **Saint Laurent (YSL.com)** — Identical pattern of black canvas, white 12px uppercase nav, pill-bordered utility buttons, and fashion-editorial crimson/black photography at full viewport.
