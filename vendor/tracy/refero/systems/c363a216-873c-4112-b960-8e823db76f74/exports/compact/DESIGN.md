# Stable Audio — Style Reference
> Sunlit studio on warm paper.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Stable Audio uses a warm-paper studio language: the canvas is cream (#f4f1ec) rather than clinical white, letting bold black headlines and a single amber CTA sit on a surface that feels analog and approachable, like a record sleeve. Full-bleed colored panels — lavender, mustard, sage, khaki — function as oversized section backgrounds behind product mockups, giving the page rhythm the way paint-chip swatches might behind a mixing console. Every interactive element is pill-shaped (9999px) and every card surface is a near-sharp 4px, creating a deliberate contrast between round controls and angular content blocks. A signature half-circle "sun" graphic recurs in every track artwork, and a vivid neon green (#a0f32f) marks every audio-active element, making sound visible across the interface. Product screenshots do the explanatory work; illustration and lifestyle photography are deliberately absent.

## Colors

| Name | Value | Role |
|------|-------|------|
| Amber Pulse | `#f9a916` | Yellow supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Lime Signal | `#a0f32f` | Green supporting accent for decorative details and low-frequency emphasis. |
| Lavender Wash | `#c4bae3` | Text-to-audio feature panel background — large full-bleed section tint |
| Mustard Field | `#e1ca46` | Audio-to-audio feature panel background — full-bleed section tint |
| Sage Mist | `#9fc2c7` | Sound effects feature panel background — full-bleed section tint |
| Khaki Paper | `#e5dfc8` | Secondary panel tint, hero left-column background — warm beige sitting one step darker than the main cream canvas |
| Warm Canvas | `#f4f1ec` | Page background, dominant cream surface — every section and most cards sit on this tone |
| Pure Paper | `#ffffff` | Card surfaces, track cards, elevated panels — the only true white in the system |
| Pale Mist | `#e2e2e7` | Cool light-gray structural tone for subtle UI layers beneath the warm cream |
| Hairline | `#d2d1db` | Borders, dividers, subtle separators |
| Ink Stone | `#27262b` | Secondary text, dark app-interface surfaces, filled toggle states — near-black with a slight warm cast |
| Charcoal | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Ash | `#737170` | Muted body text, helper text, metadata — mid-gray for tertiary information |

## Typography

### Inter — All text — headlines commit to weight 700 (bold), never 500 or 600; the two-weight commitment is a signature choice that gives the interface a confident, opinionated voice without needing a display face
- **Substitute:** DM Sans, Manrope
- **Weights:** 400, 700
- **Sizes:** 12, 14, 16, 18, 20, 30, 40
- **Line height:** 1.00, 1.15, 1.33, 1.50, 1.71, 1.78
- **Letter spacing:** -0.0210em, -0.0170em, -0.0150em, -0.0140em, -0.0110em, -0.0060em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 18 | -0.07px |
| body-sm | — | — | 14px | 20 | -0.09px |
| body | — | — | 16px | 25 | -0.1px |
| subheading | — | — | 18px | 28 | -0.2px |
| heading-sm | — | — | 20px | 30 | -0.3px |
| heading | — | — | 30px | 40 | -0.51px |
| heading-lg | — | — | 40px | 46 | -0.84px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 4px
- **images:** 4px
- **buttons:** 9999px
- **toggles:** 9999px
- **trackCards:** 4px

## Components

### Amber CTA Button
**Role:** Primary call-to-action (Sign up, Try now, Generate)

Filled pill, #f9a916 background, #000000 bold text, 9999px border-radius, padding 12px 24px, Inter weight 700 at 14-16px. Often paired with a → arrow icon at the right.

### Ghost Nav Button
**Role:** Secondary nav action (Log in)

White fill, #000000 1px border, 9999px border-radius, #000000 bold text at 14px, padding 8px 20px. Sits inline with the amber CTA in the header.

### Active Toggle Pill
**Role:** Selected state in text-to-audio / audio-to-audio toggle group

Filled pill, #27262b background, #ffffff bold text, 9999px border-radius, padding 8px 20px, Inter weight 700 at 14-16px.

### Inactive Toggle Pill
**Role:** Unselected state in toggle groups

Transparent fill, #000000 1px border, #000000 bold text, 9999px border-radius, same padding as active state.

### Track Card
**Role:** Display a generated music track with artwork, title, description, and player

White #ffffff surface, 4px border-radius, padding 24px. Contains a square half-circle lime-green (#a0f32f) artwork block at top, track title in Inter 700 16px, description in Inter 400 14px #737170, and a 'Try prompt' dark button.

### Try Prompt Dark Button
**Role:** Action inside track cards to reuse the generation prompt

Filled pill, #27262b background, #ffffff bold text, 9999px border-radius, padding 6px 16px, Inter weight 700 at 12-14px.

### Lavender Feature Panel
**Role:** Text-to-audio feature showcase section

Full-bleed #c4bae3 background section, 2-column layout: left column has bold #000000 heading at 30-40px and body copy; right column holds a white product mockup card. Padding 48-64px vertical.

### Mustard Feature Panel
**Role:** Audio-to-audio feature showcase section

Full-bleed #e1ca46 background, same 2-column structure as the lavender panel, with yellow-toned product mockup card on the right.

### Half-Circle Art Graphic
**Role:** Signature track-artwork element

A semi-circular arc shape in #a0f32f filling the top half of a square frame, set against a muted panel color. This 'sun' motif recurs in every track card and product mockup — it is the visual shorthand for 'audio' across the system.

### Audio Waveform Player
**Role:** In-card playback control with timeline and playhead

Horizontal waveform visualization spanning the card width, time labels (0:00 / 3:00) in Inter 400 12px #737170 at each end, circular play button on the left, draggable playhead. Waveform rendered in #27262b against the white card.

### Product Mockup Card
**Role:** Full app interface preview embedded in feature sections

Large white card (#ffffff) with 4px radius, containing a realistic screenshot of the Stable Audio app — prompt input textarea, model selector, duration slider, generate button, and history list. Often set against a colored feature panel.

### Header Bar
**Role:** Site-wide navigation

Transparent bar on the cream canvas, logo 'Stable Audio' with sun-burst icon at top-left in #000000, Sign up (amber) and Log in (ghost) buttons at top-right. Minimal, no background fill.

## Do's and Don'ts

### Do
- Use #f4f1ec Warm Canvas as the page background for every section — never replace it with pure white
- Give every button, tag, and toggle a 9999px border-radius; the pill shape is the system's most recognizable trait
- Use #f9a916 Amber Pulse as the sole fill for primary action buttons (Try now, Sign up, Generate)
- Render headlines at Inter weight 700 with negative tracking (-0.84px at 40px) — do not use weight 500 or 600 for display copy
- Build feature sections as full-bleed colored panels (lavender, mustard, sage, khaki) behind white product mockup cards
- Use the half-circle lime-green (#a0f32f) arc graphic in every track-artwork and music-related visual
- Keep card surface radius at 4px — the contrast between round controls and angular cards is intentional

### Don't
- Do not use #ffffff as a full page or section background — it breaks the warm-paper feeling
- Do not add drop shadows to cards or panels — depth comes from surface color contrast only
- Do not introduce additional button accent colors — amber is the single action color
- Do not use weight 500 or 600 for headlines — the system commits to 700 bold or 400 regular
- Do not use photography, lifestyle imagery, or people in section visuals — product mockups and geometric graphics only
- Do not use square radii on buttons or tags — the 9999px pill is non-negotiable
- Do not use the vivid lime green (#a0f32f) for non-audio UI — reserve it for active sound and waveform elements

## Elevation

No shadows. Depth is created entirely by surface color contrast — warm cream canvas behind white cards behind full-bleed colored feature panels. The absence of drop shadows keeps the design flat and poster-like, like printed album art.

## Surfaces

- **Canvas** (`#f4f1ec`) — Page background, dominant warm cream surface
- **Card** (`#ffffff`) — Elevated card surfaces (track cards, nav, product cards)
- **Feature Panel** (`#c4bae3`) — Full-bleed colored section backgrounds (lavender, mustard, sage, khaki variants)
- **Dark Surface** (`#27262b`) — Dark app-interface surfaces, active toggle states

## Imagery

No photography, no people, no lifestyle imagery. The visual system is pure UI: product mockups (screenshots of the Stable Audio app) and geometric graphic motifs. The signature visual is a half-circle lime-green arc inside a muted square — a flat 'sun' shape that recurs in every track artwork. Audio waveforms are rendered as thin dark bars on white. All imagery is flat, sharp-cornered, and product-focused: the app IS the hero.

## Layout

Full-bleed colored sections with centered max-width content (1280px). Hero is a 2-column split: headline left, product card right, both on the warm cream canvas. Feature sections alternate as full-bleed colored panels (lavender, mustard, sage) each with a 2-column text-left / product-mockup-right structure. Intro sections on white have centered headlines. Vertical rhythm is generous: 80px between sections. Navigation is a transparent bar with no background fill, logo top-left, action buttons top-right. The overall page reads top-to-bottom as: cream hero → centered white intro → lavender feature → mustard feature → sage feature → white CTA, a colorful vertical progression.

## Similar Brands

- **Suno AI** — Same music-generation product category with bold black headlines and product-mockup-driven marketing pages
- **Luma AI** — Same flat, poster-like aesthetic with full-bleed colored section panels behind product showcases
- **Runway** — Same commitment to pill-shaped controls, bold display type, and feature-section-as-product-demo layout
- **Stability AI** — Parent brand sibling with a similar warm, confident typographic voice and clean light-mode interface
- **Midjourney** — Same anti-corporate, opinionated visual identity with strong black headlines and minimal chrome
