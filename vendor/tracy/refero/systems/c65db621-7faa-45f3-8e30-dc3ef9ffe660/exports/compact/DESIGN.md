# Subframe — Style Reference
> graphite blueprint on warm vellum. A designer's drafting paper where every mark is either graphite or erasure, never paint — depth comes from line weight and the occasional serif flourish.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Subframe is a monochrome designer's workbench: warm off-white canvas, graphite-black ink, and zero chromatic accent. The entire interface reads as a single material — paper, pencil, and shadow — with one bold typographic gesture: a refined serif display (Instrument Serif) against a systematic sans (Inter) to give editorial gravity to the headlines. Surfaces are flat and bordered, not elevated; depth comes from hairline dividers in #e5e7eb and inset highlights on dark controls rather than drop shadows. Density is generous: wide vertical rhythm (48–64px section gaps), centered max-width layouts, and large breathing room around type. The only color is the contrast between near-white and near-black — making the dark filled button the single loudest element on every page, and the logo strip of grayscale partner brands the only decorative visual rhythm.

## Colors

| Name | Value | Role |
|------|-------|------|
| Page Canvas | `#fafafa` | Page background, card-on-canvas, light text on dark surfaces — the warm white that carries the entire monochrome system |
| Hairline Border | `#e5e7eb` | Dividers, card borders, image frames, icon outlines — the most-used stroke in the system, defines spatial structure |
| Card Surface | `#ededed` | Elevated card backgrounds, secondary surface — sits one step above canvas to create grouping without shadow |
| Divider Mid | `#dadada` | Mid-tone dividers and section transitions |
| Graphite | `#242424` | High-contrast neutral action fill for primary buttons on light surfaces. |
| Ink Black | `#171717` | Primary body text, headings, icon strokes — slightly cooler than Graphite, reserved for typography not surfaces |
| Pencil | `#5c5c5c` | Secondary body text, descriptions, subhead copy |
| Faint Graphite | `#a3a3a3` | Muted helper text, tertiary metadata, inactive nav items |

## Typography

### Inter — System UI sans — nav, body, button, subhead, section headings. Weight 500 for body and controls, 600 for subheadings and nav emphasis, 700 for section headlines. Heavy negative tracking tightens the geometric forms at every size, giving the UI a compressed, technical feel.
- **Substitute:** Inter (Google Fonts)
- **Weights:** 500, 600, 700
- **Sizes:** 12px, 14px, 18px, 24px, 28px, 48px, 96px
- **Line height:** 1.00–1.43
- **Letter spacing:** -0.0500em, -0.0250em, -0.0050em

### Instrument Serif — Display-only serif for hero and editorial moments. Weight 400 with -0.025em tracking creates an italic-leaning elegance that contrasts Inter's industrial geometry — the signature move: a single serif word or phrase inside an otherwise sans-serif page, acting as visual punctuation rather than a heading style.
- **Substitute:** Playfair Display, DM Serif Display
- **Weights:** 400
- **Sizes:** 80px, 128px
- **Line height:** 1.00
- **Letter spacing:** -0.0250em

### Fragment Mono — Accent mono for inline code-like elements, tag labels, and technical callouts. Used sparingly — appears in feature lists and inline annotations where the design tool wants to signal 'this is machine output'.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.33
- **Letter spacing:** -0.0250em

### ui-monospace — Micro-labels, keyboard shortcuts, and small technical annotations. System monospace fallback keeps it neutral.
- **Substitute:** SF Mono, Menlo
- **Weights:** 500
- **Sizes:** 10px
- **Line height:** 1.70
- **Letter spacing:** -0.0060em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1 | -0.06px |
| body-sm | — | — | 14px | 1.43 | -0.07px |
| body | — | — | 18px | 1.33 | -0.45px |
| subheading | — | — | 24px | 1.17 | -0.6px |
| heading-sm | — | — | 28px | 1.14 | -0.7px |
| heading | — | — | 48px | 1.13 | -1.2px |
| display | — | — | 128px | 1 | -6.4px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 24px
- **cards:** 24px
- **pills:** 9999px
- **images:** 24px
- **buttons:** 16px

## Components

### Dark Filled Button
**Role:** Primary action trigger

Background #242424, text #fafafa, 16px border-radius, padding 8px 20px. Inter weight 500, 14px. The only high-contrast surface element on the page. Has a subtle inset highlight (rgba(255,255,255,0.25) 0px 4px 4px -2px inset at top, rgba(0,0,0,0.25) 0px -4px 4px -2px inset at bottom) creating a faint glassy bevel — the signature of the system is that even the 'loud' element has a hand-drawn, pressed-in feel rather than a flat fill.

### Ghost/Outlined Button
**Role:** Secondary action trigger

Transparent background, 1px border in #e5e7eb, text #171717, 16px border-radius, padding 8px 20px. Inter weight 500, 14px. Sits beside the filled button as a quiet counterpart — the border is the same hairline as page dividers, so the button reads as 'a divider that happens to be clickable'.

### Pill Nav Group
**Role:** Segmented selector (e.g. Ask AI / Design / Code)

Dark capsule container #242424 with 9999px radius, containing 2–3 segment items in #fafafa text. Active segment has a lighter inner pill or highlighted state. Padding 8px 16px per segment. This is the interactive control that introduces color contrast on the page — the dark pill on warm white is the most visually distinctive UI element.

### Top Navigation Bar
**Role:** Site-wide navigation

Centered group of 3 text links (Pricing, Docs, Blog) with 32px row gap, plus right-aligned 'Log in' text link and 'Start for free' filled button. Logo mark at top-left, very small. No background container — the nav floats on canvas. Inter weight 500, 14px for links. Active/hovered link uses #171717; inactive uses #a3a3a3.

### Hero Display Headline
**Role:** Above-the-fold statement

Inter weight 700, 96px, line-height 1.0, letter-spacing -4.8px, color #171717, centered. The extreme tracking compression is a signature: the wordforms are so tight they almost touch, creating a dense graphic block. No serif here — the display is reserved for secondary moments; the hero is pure Inter.

### Serif Accent Phrase
**Role:** Editorial punctuation within a sentence

Instrument Serif weight 400, 80–128px, line-height 1.0, letter-spacing -3.2px, color #171717, used as a single inline word or short phrase inside or after an Inter headline. The size discrepancy (serif rendered larger than the sans) makes it read as a handwriting gesture. This is the system's one moment of warmth.

### Section Heading
**Role:** In-page feature section title

Inter weight 700, 48px, line-height 1.13, letter-spacing -1.2px, color #171717, left-aligned. Followed by a two-line body subhead in Inter weight 500, 18px, #5c5c5c, with 32px vertical gap between heading and subhead.

### Product Showcase Frame
**Role:** Image or product screenshot container

Rounded rectangle with 24px radius, 1px border in #e5e7eb, no shadow, no padding. Contains either a real product screenshot (with its own internal UI) or a warm-toned illustration. The border is the only frame — no drop shadow, no gradient backdrop. Images inside have natural rounded corners matching the frame radius.

### Grayscale Logo Strip
**Role:** Social proof / partner brands

Horizontal row of 4–6 brand logos (Apollo, The New Parts, Shopify, Octave, Gem) rendered in #a3a3a3 or #5c5c5c, no color, equal spacing with 48–64px column gap. Logos sit on the same warm-white canvas with no container — the eye reads them as a single decorative band.

### Card Surface
**Role:** Grouped content block

Background #ededed, 24px border-radius, padding 24px, no border, no shadow. Used for feature tiles and content groups. The single-step lightness jump from #fafafa canvas to #ededed card creates grouping without any elevation visual — the system is deliberately flat.

### Icon Mark
**Role:** Brand and feature icons

Stroke-only icons in #171717 at 20–24px, 1.5px stroke weight. Simple geometric forms — the logo mark is a split square shape. Icons share the same border-radius family (16–24px) as containers, creating a visual rhythm between icon and surrounding UI.

### Watch Demo Button
**Role:** Tertiary action with media affordance

Ghost button style with a small play-triangle icon preceding 'Watch demo' text. Transparent background, #e5e7eb border, 16px radius, padding 8px 20px. Icon and text both in #171717, Inter weight 500, 14px. The icon differentiates it from the 'Start building' primary action.

## Do's and Don'ts

### Do
- Use #242424 as the filled button background with #fafafa text — the contrast is the system's single loud signal
- Apply -0.025em letter-spacing on all headings 18px and above; tighten to -0.05em at display sizes (96px+) for extreme graphic compression
- Use 24px border-radius on all cards, images, and nav containers; reserve 16px for buttons and 9999px only for pill-shaped segmented controls
- Separate surface levels by one lightness step (#fafafa canvas → #ededed card) rather than shadow elevation
- Place a single Instrument Serif phrase inside or after an Inter headline as editorial punctuation — never use serif for full sentences or body text
- Keep section gaps at 48–64px to maintain the generous, comfortable density; the breathing room is what makes the monochrome palette feel premium rather than austere
- Render all partner logos and decorative icons in grayscale (#5c5c5c or #a3a3a3) to preserve the system's zero-color rule

### Don't
- Never introduce chromatic color into the interface — the 1% colorfulness is structural, not accidental; any accent color will break the editorial system
- Never use drop shadows for elevation; use #ededed card backgrounds or #e5e7eb borders instead
- Never use Inter for display-size headlines above 96px when Instrument Serif is available — the serif/sans contrast is the signature
- Never use #000000 (pure black) — use #171717 or #242424, both slightly warm to match the vellum canvas
- Never set border-radius below 16px on interactive elements; the system is deliberately soft and the radii are part of its identity
- Never use weight 400 Inter for body text — minimum weight is 500 to maintain visual density against the compressed tracking
- Never put backgrounds on decorative logo strips or partner bands — they float directly on canvas with whitespace as their container

## Elevation

- **Dark Filled Button:** `inset 0 4px 4px -2px rgba(255,255,255,0.25), inset 0 -4px 4px -2px rgba(0,0,0,0.25), inset -2px 0 2px -2px rgba(255,255,255,0.1)`

## Surfaces

- **Canvas** (`#fafafa`) — Base page background — warm off-white that carries the entire monochrome system
- **Card** (`#ededed`) — First elevation step — grouped content, feature tiles, subtle containers
- **Dark Surface** (`#242424`) — Inverted surface for primary actions, active nav pills, segmented controls — the only high-contrast element

## Imagery

Imagery is minimal and functional. The system relies on two visual modes: (1) bordered product screenshots and UI mockups contained within 24px-radius frames — these show real interface components (tables, buttons, forms) rendered in the same monochrome palette, making the screenshots feel native to the page; (2) a single grayscale logo strip of partner brands as social proof, rendered flat without color or container. There is no lifestyle photography, no abstract gradients, no 3D renders. The only illustrative element is a dark-product 'tile' centered on warm gray with a brand icon — it reads as a product showcase, not decoration. All imagery occupies a text-dominant layout where type carries the visual weight.

## Layout

Centered, max-width contained layouts (1200px) with generous vertical rhythm. The hero is a single centered stack: a dark segmented pill control at the top, a large Inter headline, a single-line subhead, and two side-by-side buttons (filled + ghost) — no side-image, no split layout. Below the hero, a centered grayscale logo strip. Each subsequent section follows the same pattern: left-aligned heading + subhead block, then a full-width product showcase frame beneath with 48–64px gaps between sections. Navigation is minimal: a top bar with centered links and right-aligned actions, no sidebar, no mega-menu. The page reads top-to-bottom as a series of centered statements, each given room to breathe — the layout is more like an editorial portfolio than a dense product page.

## Similar Brands

- **Linear** — Same dark-on-light monochrome interface with minimal color, generous spacing, and the same confidence in a single high-contrast button as the primary action signal
- **Vercel** — Shared restraint in palette (near-monochrome with grays and black), use of hairline borders instead of shadows for structure, and tight typographic tracking at display sizes
- **Frame.io** — Similar warm off-white canvas, borderless or hairline-bordered containers, and a serif/sans typographic contrast in marketing surfaces
- **Pitch** — Same editorial presentation style with centered max-width sections, generous vertical rhythm, and a single dark filled button as the only high-contrast element per screen
- **Figma Config** — Shares the large-scale serif display moments paired with sans-serif UI type, and the grayscale partner logo strip as social proof treatment
