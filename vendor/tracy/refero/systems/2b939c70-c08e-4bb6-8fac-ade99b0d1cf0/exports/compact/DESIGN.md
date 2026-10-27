# Lazy — Style Reference
> Midnight typeset manuscript

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lazy speaks in a whisper-dark, almost monastic register: deep charcoal canvas, near-achromatic borders, and headlines set in a refined serif that feels like editorial print transplanted into a productivity tool. The entire palette stays within three values of gray — no chromatic accents, no decorative gradients on text — letting structure and serif weight carry all hierarchy. Components float on the canvas with soft, low-opacity shadows rather than hard borders, evoking a darkroom where objects glow rather than reflect. Information density is intentionally sparse; one focal element per viewport, generous negative space, and serif type at 55-58px that anchors every section like a magazine pull quote.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon Canvas | `#26272c` | Page background, hero canvas, section grounds |
| Obsidian | `#0a0a0a` | Deepest borders, shadow cores, overlaid text on light surfaces |
| Inkwell | `#1a1b1f` | Secondary surface tint, input fills, subtle elevation step above canvas |
| Graphite Card | `#3b3c3e` | Elevated card surfaces, modal panels, floating UI containers |
| Pewter | `#8a8c93` | Primary hairline borders, structural dividers, most-used neutral |
| Slate | `#62646a` | Secondary borders, link underlines, subdued UI strokes |
| Ash | `#535355` | Badge borders, tertiary separators, muted structural lines |
| Bone | `#e0e0e0` | Light card borders, high-contrast dividers, icon strokes on dark surfaces |
| Chalk | `#b8b8b8` | Muted body borders, low-emphasis separators |
| Paper | `#ffffff` | Primary heading text, high-contrast body text, emphasis borders |

## Typography

### Migra — Display headlines and section labels — the only serif in the system, giving Lazy its editorial identity
- **Substitute:** Fraunces, Source Serif Pro, or Cormorant Garamond
- **Weights:** 500
- **Sizes:** 21px, 58px
- **Line height:** 1.09, 1.25
- **Letter spacing:** 0.026em at 21px, 0.048em at 58px — positive tracking is anti-convention for serif, making labels feel architectural and headlines feel set rather than typed

### Inter — Ultra-light display weight for large UI headlines, pairing with Migra serif in hero
- **Weights:** 300, 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 20px, 24px, 28px, 55px
- **Line height:** 1.09, 1.10, 1.20, 1.23, 1.25, 1.38, 1.43, 1.50, 1.57, 1.60, 1.83, 2.00
- **Letter spacing:** -0.045em at 55px — extreme negative tracking compensates for thin strokes

### Inter — Body text, descriptions, and subheads — comfortable reading at 16px with generous 1.5 line-height
- **Weights:** 300, 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 20px, 24px, 28px, 55px
- **Line height:** 1.09, 1.10, 1.20, 1.23, 1.25, 1.38, 1.43, 1.50, 1.57, 1.60, 1.83, 2.00
- **Letter spacing:** -0.0450em, -0.0420em, -0.0360em, -0.0310em, -0.0250em, -0.0210em, -0.0170em, -0.0050em, -0.0040em, 0.1380em

### Inter — Navigation, labels, button text, micro-copy — the workhorse UI weight
- **Weights:** 300, 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 20px, 24px, 28px, 55px
- **Line height:** 1.09, 1.10, 1.20, 1.23, 1.25, 1.38, 1.43, 1.50, 1.57, 1.60, 1.83, 2.00
- **Letter spacing:** -0.0450em, -0.0420em, -0.0360em, -0.0310em, -0.0250em, -0.0210em, -0.0170em, -0.0050em, -0.0040em, 0.1380em

### Inter — Emphasis in body copy, strong button text, active state indicators
- **Weights:** 300, 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 20px, 24px, 28px, 55px
- **Line height:** 1.09, 1.10, 1.20, 1.23, 1.25, 1.38, 1.43, 1.50, 1.57, 1.60, 1.83, 2.00
- **Letter spacing:** -0.0450em, -0.0420em, -0.0360em, -0.0310em, -0.0250em, -0.0210em, -0.0170em, -0.0050em, -0.0040em, 0.1380em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.45 | 0.138px |
| body | — | — | 16px | 1.5 | -0.08px |
| serif-label | — | — | 21px | 1.25 | 0.546px |
| heading-sm | — | — | 24px | 1.25 | -0.504px |
| heading | — | — | 28px | 1.23 | -0.756px |
| display | — | — | 55px | 1.09 | -2.475px |
| serif-display | — | — | 58px | 1.09 | 2.784px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 14px

### Border Radius

- **cards:** 8px
- **input:** 8px
- **pills:** 100px
- **modals:** 12px
- **buttons:** 4px

## Components

### Top Navigation
**Role:** Persistent header bar with brand, nav links, auth actions

Full-width transparent bar over canvas. Logo (icon + 

### Outlined CTA Button
**Role:** Primary call-to-action in header and inline contexts

Ghost button: transparent background, 1px border in #62646a, 4px radius, padding 6px 14px. Text Inter 13px weight 500, #ffffff. The border is the affordance, not a fill — this button never uses solid color, maintaining the monochrome discipline.

### Command Bar
**Role:** Central hero element — the product's capture interface demonstrated inline

Floating card on canvas: 8px radius, background #3b3c3 with 40% black shadow stack. Internal input area with placeholder 

### Serif Section Label
**Role:** Small uppercase tagline above section headlines

Migra 21px weight 500, letter-spacing 0.026em, color #8a8c93. Centered above display headline. The positive tracking on serif gives it a printed-typeset quality, contrasting the sans-serif body. Used as section markers like 

### Serif Display Headline
**Role:** Primary section headline in editorial serif

Migra 58px weight 500, letter-spacing 0.048em, line-height 1.09, color #ffffff. Centered, max-width 800px. The headline reads like a book chapter title — this is Lazy's signature type choice. Below it sits a lighter-weight subhead in the same serif.

### Sans Display Headline
**Role:** Hero headline that pairs with the serif subhead

Inter 55px weight 300, letter-spacing -0.045em, line-height 1.10, color #ffffff. The whisper-weight (300) is deliberate — Lazy doesn't shout. Pairs with a subhead at 16-20px Inter 400 in #8a8c93.

### Note Preview Card
**Role:** Embedded article/note preview in interactive sections

Light-toned card (simulating a note app): background #ffffff or very light gray, 8px radius, padding 14-24px, subtle shadow. Content includes bold title 

### Inline Tag
**Role:** Small contextual label or category marker

Inter 12px weight 500, padding 2px 8px, 4px radius, border 1px solid #535355, color #8a8c93. Outlined only — no fill. Functions as a quiet metadata marker.

### Demo Link
**Role:** Inline text link to interactive product demo

Inter 14px weight 500, color #ffffff, underline on hover. Preceded by descriptive text in #8a8c93. Example: 

### Floating Orb / Cursor Indicator
**Role:** Interactive cursor or loading indicator overlay

Circular dark element (#0a0a0a) approximately 120-160px diameter, positioned absolutely over content during interaction states. Casts no shadow itself but sits above cards to suggest a cursor following a user's attention. Unique to Lazy's interaction model.

### Radial Light Wash
**Role:** Hero section background glow effect

Concentric circular gradient emanating from center of hero — brightest at core fading to canvas. Creates a 

## Do's and Don'ts

### Do
- Use Migra 58px weight 500 with 0.048em tracking for all section-level display headlines — this is the brand's voice
- Set body text at Inter 16px weight 400 with line-height 1.5 for comfortable reading rhythm
- Apply the dual-layer shadow stack (rgba(4,4,7,0.25) 0 2px 4px + rgba(4,4,7,0.4) 0 8px 24px) to all floating UI elements like command bars and modals
- Maintain 8px radius for cards and 4px radius for buttons — this 2:1 ratio is consistent across the system
- Use #8a8c93 as the default border color at 1px width — it is the most-used token in the system (1357 occurrences) and defines visual structure
- Center all hero and section content; Lazy is a symmetrical, meditative layout — never left-align primary headlines
- Pair every serif headline with a sans-serif subhead in #8a8c93 — the contrast between Migra and Inter creates Lazy's editorial-meets-UI identity

### Don't
- Never introduce chromatic colors — the entire system is achromatic by design; adding a blue or green would break the editorial register
- Never use solid-fill CTA buttons; all action buttons are ghost/outlined with #62646a borders to maintain the quiet aesthetic
- Never set body text tighter than -0.005em letter-spacing or display text looser than 0.138em — the tracking curve is the system
- Never use Migra below 21px — at smaller sizes the serif loses its editorial character and becomes noise
- Never add drop shadows stronger than the documented two values — Lazy floats softly, never projects hard edges
- Never left-align serif display headlines — they must be centered to maintain the typeset manuscript metaphor
- Never use white (#ffffff) as a background; white is reserved for primary text and the note-preview card contrast moment

## Elevation

- **Command Bar / Floating Input:** `rgba(4, 4, 7, 0.25) 0px 2px 4px 0px, rgba(4, 4, 7, 0.4) 0px 8px 24px 0px`
- **Card with soft drop:** `rgba(0, 0, 0, 0.12) 0px 12px 12px 0px`

## Surfaces

- **Carbon Canvas** (`#26272c`) — Base page background for all sections
- **Inkwell** (`#1a1b1f`) — Recessed inputs, subtle inset surfaces, secondary canvas tint
- **Obsidian** (`#0a0a0a`) — Deepest border, shadow anchor, maximum contrast for text
- **Graphite Card** (`#3b3c3`) — Elevated card surfaces, floating command bars, modal panels

## Imagery

Lazy uses almost no traditional imagery — the visual system is type-driven and UI-driven. The only 

## Layout

Lazy follows a full-bleed dark canvas with centered content blocks. The page reads as vertical scroll through typographic acts: each section is a centered composition with a serif label, serif headline, sans subhead, and one focal UI element. Max-width is 1200px for the content column, but the canvas extends edge-to-edge. The hero occupies a full viewport with the command bar centered and a radial light effect drawing the eye. Subsequent sections are 80px vertical gaps with the same centered axis. There is no left/right alternation, no sidebar, no grid of cards — each section is a single editorial spread. Navigation is a minimal top bar with no background fill.

## Similar Brands

- **Notion** — Same centered, single-focal-element-per-section hero pattern with a command bar as the hero UI
- **Linear** — Dark-mode productivity tool with extreme typographic restraint and Inter as the UI workhorse font
- **Vercel** — Full-bleed dark canvas with centered editorial compositions and generous vertical rhythm between sections
- **Read.cv** — Serif-and-sans typography pairing on a dark canvas that reads as editorial rather than SaaS
- **Are.na** — Monochrome, type-driven visual system where structure and whitespace carry all hierarchy
