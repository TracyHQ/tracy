# Adnaut — Style Reference
> After-hours mission control lit by sodium lamps

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Adnaut operates in a nocturnal command-deck language: near-black canvas, confident yellow punctuation, and ultra-light display type that floats above a landscape of rounded, glassy cards and isometric 3D vignettes. Color is rationed — almost the entire surface is achromatic or a single carbonized dark, with #ffe900 as a reactive highlighter that draws the eye to nav, CTAs, and accent cards; #00ff1a flashes in once or twice per screen for editorial emphasis. The system feels weightless despite the dark base: cards are tall and lightly bordered, headlines whisper at weight 100-300, and components lean on radius rather than shadow to separate layers. Every interface element should feel like a control surface in a control room — restrained, precise, and lit from within by a single warm-yellow lamp.

## Colors

| Name | Value | Role |
|------|-------|------|
| Sodium Yellow | `#ffe900` | Primary CTA fills, active nav indicators, accent card backgrounds, logo wordmark, and the single chromatic punctuation across an otherwise monochrome system |
| Lime Pulse | `#00ff1a` | Editorial accent — one or two keyword words per page glow in this green to carry emphasis and keep the palette from feeling monochrome |
| Carbon | `#1f1d01` | Page background canvas — the near-black with a barely-warm tint that anchors the entire system |
| Graphite | `#282828` | Elevated card surfaces, outlined button borders, and the primary border tone for sections that need separation from the canvas |
| Slate | `#707070` | Secondary borders, divider lines, and inactive control outlines where a softer edge is needed |
| Frost | `#d7d7d7` | Primary body and UI text — the off-white that softens contrast against the carbon canvas and reduces eye strain across long reading passages |
| Cloud | `#f2f2f2` | Headline and display text on dark surfaces — a step brighter than Frost, reserved for the largest type that needs extra punch |
| Pure White | `#ffffff` | Text on yellow fills and inside bright accent cards; the only acceptable text color over Sodium Yellow |
| Ash | `#8d8d8d` | Muted helper text, metadata, and secondary link colors where legibility matters less than hierarchy |
| Charcoal | `#333333` | Deep accents within dark illustrations and subtle depth layers where pure black would feel too harsh |

## Typography

### Archivo — Display and heading family. The ultra-light weights (100, 300) at 56-64px are the signature move — headlines whisper rather than shout, creating authority through restraint. Tight line-height of 1.00 on the largest sizes lets the type breathe vertically while occupying minimal visual space. Also handles subheading sizes at 24-32px in weight 300-400.
- **Substitute:** Inter, Space Grotesk, or DM Sans
- **Weights:** 100, 300, 400
- **Sizes:** 16px, 18px, 24px, 32px, 56px, 64px
- **Line height:** 1.00, 1.50

### Geist — UI and body text. Used for navigation, buttons, body copy, and form controls. Weight 400 at 16px is the default reading size; weight 500-600 for button labels and nav active states. Line-height 1.50 on body, 1.00-1.10 on compact UI elements like nav and tags.
- **Substitute:** Inter, system-ui, or Söhne
- **Weights:** 300, 400, 500, 600
- **Sizes:** 14px, 16px, 20px
- **Line height:** 1.00, 1.10, 1.50

### Geist Mono — Monospace moments — small uppercase labels, tag prefixes, the 3D spotlight heading, and any technical or coded feel. The 56px instance in monospace is unusual and adds a terminal/control-room accent to specific display moments.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 400, 600
- **Sizes:** 14px, 16px, 24px, 56px
- **Line height:** 1.00, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | — |
| body-sm | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 24px | 1.1 | — |
| heading | — | — | 32px | 1.1 | — |
| heading-lg | — | — | 56px | 1 | — |
| display | — | — | 64px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 24-32px
- **Element gap:** 24px

### Border Radius

- **nav:** 8px
- **tags:** 4px
- **cards:** 16px
- **buttons:** 16px
- **large-panels:** 24px

## Components

### Primary CTA Button
**Role:** The signature conversion action — used for 'LET'S TALK' and other high-intent interactions

Filled Sodium Yellow (#ffe900) background, black text, 16px border-radius, generous padding (20px vertical, 24px horizontal). Often paired with a separate arrow button of the same yellow that sits flush to the right edge, creating a compound 'label + arrow' control. Font: Geist weight 500-600 at 16px. This is the only filled button style in the system.

### Outlined Nav Button
**Role:** Secondary action and navigation controls within the persistent bottom nav bar

Transparent background with a 1px Sodium Yellow (#ffe900) border, yellow text, 8px border-radius, compact padding (12px 16px). Used for dropdown triggers and section links in the sticky navigation bar. Becomes filled yellow on active/hover.

### Sticky Bottom Navigation
**Role:** Persistent site-wide navigation that floats at the bottom of the viewport

Dark surface (#282828) with a thin top border, horizontally centered nav items, 8px radius on individual items. Contains HOME (active = yellow), SERVICES, TECHNOLOGY, ABOUT US, LIFE AT ADNAUT, CONTACT US, RESOURCES — most with dropdown carets. Sits above content with a subtle backdrop.

### Large Content Card
**Role:** Primary content containers — hero panels, feature blocks, and editorial cards

Graphite (#282828) background with a 1px hairline border in #707070, 16px border-radius, padding 32px. Cards are wide (often spanning 60-70% of viewport) and tall, allowing generous internal whitespace. Some variants use a lighter interior fill (#f2f2f2 or #1f1d01) for inverted contrast.

### Accent Card
**Role:** Bright sodium-yellow cards that break the monochrome rhythm — used for CTAs, highlights, and emphasis blocks

Sodium Yellow (#ffe900) background, black or dark text, 16px border-radius, padding 24-32px. Functions as a visual exclamation point. Never more than one or two per viewport to preserve their impact.

### Logo Mark
**Role:** Brand identity — the Adnaut wordmark with its distinctive angled 'A'

Custom wordmark in white or yellow depending on context, often paired with a small yellow accent dot or symbol. Sits at the top-left of pages and inside the primary CTA button. The angled 'A' and lowercase 'dnaut' create a modern tech-mark feel.

### 3D Isometric Vignette
**Role:** Decorative hero and section illustrations — the visual signature of the brand

Dark 3D-rendered geometric shapes (cubes, spheres, prisms) with subtle gradient lighting in purple, teal, and warm tones, set against the carbon canvas. Often features a central glowing element. These are atmospheric, not explanatory — they establish the mission-control mood.

### Hero Headline Block
**Role:** Primary page-level headline with supporting subtext

Archivo weight 300 at 56-64px, Cloud (#f2f2f2) color, line-height 1.00, occupying the left portion of the hero. Subtext in Frost (#d7d7d7) at 16-18px weight 400 sits to the right or below, constrained to 40-50% width. A small yellow 'WATCH US IN ACTION' tag button often appears between headline and visual.

### Keyword Emphasis Text
**Role:** Highlighted single words within headlines that glow in Lime Pulse green

Same Archivo weight 300 as surrounding headline, but colored #00ff1a. Used once or twice per page maximum (e.g., 'Sustainably.' in the manifesto section). This is the system's only secondary chromatic accent and must be rationed.

### Contact Info Block
**Role:** Footer or sidebar contact details with icon + text pairs

Yellow phone icon paired with 'Contact Us' text in white, email address in Frost (#d7d7d7) at 16px. Sits inside a bordered panel with the same styling as Large Content Cards.

### Color Dot Indicator
**Role:** Small colored squares used in color swatches and decorative dividers

6-8px squares in a row, each a different accent color (yellow, cyan, pink, purple, etc.). Used decoratively to hint at the brand's broader color vocabulary without committing to a full palette.

### Section Headline with Caret
**Role:** Large display headlines for major page sections

Archivo weight 100-300 at 48-64px, sometimes followed by a small yellow caret or arrow icon. Centered or left-aligned depending on section rhythm. No underline, no decoration — the size and weight do the work.

## Do's and Don'ts

### Do
- Use Archivo at weights 100-300 for all display and heading text — the ultra-light weight is the system's most recognizable choice and must not be swapped for bold.
- Apply Sodium Yellow (#ffe900) as a filled background for the primary CTA only; pair it with black text and a 16px radius.
- Default to 16px border-radius on cards and buttons, 8px on nav items and compact controls.
- Maintain the dark canvas (#1f1d01) across the full page — never introduce light or white page backgrounds.
- Use Lime Pulse (#00ff1a) green for no more than one or two keyword words per page, always inside an otherwise neutral headline.
- Space sections at 64px vertical gaps and pad cards at 24-32px to preserve the breathable, control-room density.
- Combine Geist for all UI text and Archivo for all display text — never mix the two families at the same size.

### Don't
- Do not introduce new chromatic colors for CTAs or buttons — Sodium Yellow is the only filled action color in the system.
- Do not use bold or semibold (600+) weights for display headlines; the signature is the ultra-light whisper.
- Do not place colored cards or yellow backgrounds on more than 20% of any viewport — the impact depends on rationing.
- Do not use sharp corners (0px radius) on any interactive element — every control should feel rounded and approachable.
- Do not add drop shadows to elevate cards; the system relies on hairline borders (#707070) and background color shifts for separation.
- Do not use more than one Lime Pulse green moment per scroll-screen — overuse collapses its editorial power.
- Do not use pure black (#000000) for backgrounds — the near-black #1f1d01 with its warm tint is what gives the dark mode its depth.

## Elevation

- **Large Content Card:** `none — relies on 1px #707070 border and #282828 fill against the #1f1d01 canvas`
- **Accent Card:** `none — the yellow fill itself provides elevation against the dark canvas`
- **Sticky Bottom Navigation:** `none — sits flush with a 1px top border in #707070`

## Surfaces

- **Carbon Canvas** (`#1f1d01`) — Page-wide background — the near-black that absorbs the entire screen
- **Graphite Card** (`#282828`) — Elevated content cards and section blocks sitting above the canvas
- **Bordered Panel** (`#282828`) — Cards with hairline #707070 borders that read as outlined panels rather than filled blocks
- **Sodium Highlight** (`#ffe900`) — Accent card surfaces used sparingly to break the monochrome rhythm — never more than one or two per viewport

## Imagery

Imagery is dominated by dark 3D isometric renders: floating cubes, prisms, spheres, and glowing geometric forms with subtle gradient lighting in purple, teal, and warm amber tones. These vignettes are atmospheric rather than literal — they never depict specific products or people, instead establishing a sci-fi, mission-control mood. The 3D elements sit on dark canvas backgrounds, often within bordered card containers. Photography is absent. Icons are minimal and line-based. The overall visual density is low — large areas of dark canvas are punctuated by one 3D vignette and one or two yellow accent elements per viewport.

## Layout

Full-width page structure with content constrained to ~1280px max-width, centered. The hero is a split composition: oversized Archivo headline on the left (40-50% width) with smaller descriptive text to the right, followed by a full-bleed 3D illustration band below. Sections alternate between dark canvas and graphite-bordered card panels, separated by 64px vertical gaps. A persistent sticky bottom navigation bar floats at the viewport bottom, creating a fixed control strip. Card grids use a 2-column asymmetric layout (one large card + two smaller stacked cards) rather than uniform grids. The page reads top-to-bottom as a controlled descent through different display contexts, with rhythm maintained through consistent border-radius and card styling.

## Similar Brands

- **Linear** — Same dark-mode command-center aesthetic with restrained color use, geometric sans-serif type, and rounded card components — though Linear uses purple where Adnaut uses yellow
- **Vercel** — Similar near-black canvas with a single chromatic accent, ultra-light display type, and hairline-border card components that rely on surface contrast rather than shadows
- **Raycast** — Shared dark interface language with geometric type, pill-shaped controls, and the sense of a precision control surface rather than a marketing page
- **Resend** — Comparable dark-canvas approach with one vivid accent color, generous card radii, and oversized light-weight headlines that carry the page hierarchy
