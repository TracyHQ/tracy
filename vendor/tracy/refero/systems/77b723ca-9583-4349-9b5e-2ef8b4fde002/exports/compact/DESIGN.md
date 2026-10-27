# Basedash — Style Reference
> Midnight data terminal with frosted type. A dark observatory where metrics glow in violet and green, serif headlines float above the noise, and white pill buttons are the only bright objects in a room of soft black surfaces.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Basedash presents a dark-mode command surface for data work: pure black canvas, near-black elevated cards, and white type that reads like a terminal. The brand voice is calm and technical — Inter does all functional labor at tight tracking, while a custom display serif (Alpha Lyrae) carries hero headlines at exactly 48px, giving the page a quiet editorial accent against the monochrome interface. Two chromatic notes — a vivid violet and a vivid green — appear sparingly as chart and accent fills, never as decoration. Buttons invert the usual dark-mode expectation: filled actions are white pills on black, outlined actions are ghost links, which makes the single primary action glow. Layout is centered and generous, with cards floating on the void at 16px radius and buttons cut to 6px, a split that signals 'card is a container, button is a tool.'

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, hero background, primary action fill — the default stage for every screen |
| Carbon Card | `#050607` | Card and elevated surface background — barely lighter than the canvas so cards read as recessed wells, not raised panels |
| Ghost White | `#ffffff` | Primary text, filled button background, primary action fill — the highest-contrast color in the system, used to make actions unmistakable |
| Bone White | `#e8eaee` | Subtle surface washes and light contrast elements — sparingly used for tonal variation in dark sections |
| Ash Gray | `#b3b3b3` | Secondary body text, table content, muted helper copy |
| Steel Gray | `#808080` | Borders, dividers, icon strokes, disabled text — the workhorse neutral for structural lines |
| Graphite | `#333333` | Deep borders, subtle separators between heavy content blocks |
| Lavender Pulse | `#9984d8` | Violet outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Mint Signal | `#3fcb7f` | Green state accent for badges, validation surfaces, and short status labels. |

## Typography

### Inter — All functional UI text: body copy, nav links, buttons, badges, table data, card labels. Inter carries the entire system at tight -0.03em tracking — its neutrality lets the single display serif do the editorial work.
- **Substitute:** Inter (Google Fonts) or system-ui fallback
- **Weights:** 400, 500, 600
- **Sizes:** 12, 13, 14, 15, 16, 18, 30, 34, 48
- **Line height:** 1.0–1.56
- **Letter spacing:** -0.03em across all sizes

### Alpha Lyrae — Display headlines only — hero h1 and major section titles at exactly 48px. This custom serif is the signature move: a quiet, engraved quality that contrasts with Inter's geometric clarity, giving the dark page a literary anchor.
- **Substitute:** Cormorant Garamond, EB Garamond, or PT Serif
- **Weights:** 400
- **Sizes:** 48
- **Line height:** 1.0
- **OpenType features:** `"ss01" on, "ss02" on`

### Iowan Old Style — Testimonial pull-quote body — a light-weight old-style serif at 24px that humanizes the interface and breaks Inter's rhythm at key trust-building moments.
- **Substitute:** Source Serif Pro Light, Lora, or Palatino
- **Weights:** 300
- **Sizes:** 24
- **Line height:** 1.25
- **Letter spacing:** -0.025em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.36px |
| body-sm | — | — | 14px | 1.43 | -0.42px |
| body | — | — | 16px | 1.5 | -0.48px |
| body-lg | — | — | 18px | 1.56 | -0.54px |
| subheading | — | — | 24px | 1.25 | -0.6px |
| heading-sm | — | — | 30px | 1.2 | -0.9px |
| heading | — | — | 34px | 1.2 | -1.02px |
| display | — | — | 48px | 1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 16-20px
- **Element gap:** 12px

### Border Radius

- **cards:** 16px
- **badges:** 999px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Filled Primary Button
**Role:** Primary call-to-action in the header and hero

White background (#ffffff), black text (#000000), Inter weight 500 at 14px, 6px border-radius, 12px vertical × 20px horizontal padding. No border, no shadow — the contrast against the black canvas is the elevation. Used for 'Sign up' and 'Start free'.

### Ghost Text Button
**Role:** Secondary action paired with the primary button

No background, no border. White text (#ffffff) at Inter 14px weight 500 with a subtle underline on hover. Sits immediately right of the filled button with ~16px gap. Used for 'Book a demo' and 'Log in'.

### Top Navigation Bar
**Role:** Persistent header across all pages

Full-width transparent bar on black canvas. Left: 24×24px logo mark + 'Basedash' wordmark in Inter 16px weight 500 white. Center: nav links in Inter 14px weight 400 at Ash Gray (#b3b3b3), white on active/hover. Right: 'Log in' ghost text + white-filled 'Sign up' button. Height ~64px, no border-bottom.

### Hero Centered Stack
**Role:** Above-the-fold headline section

Vertically stacked, horizontally centered. Pill badge at top ('New: Basedash Automations') in Inter 13px with subtle border, 999px radius. Headline: Alpha Lyrae 48px weight 400 white, line-height 1.0. Subhead: Inter 18px weight 400 at Ash Gray, max-width ~640px. Button row below. Trust line at bottom in Inter 13px Ash Gray.

### Dashboard Mockup Frame
**Role:** Hero visual / product showcase image

Full-bleed dark image with subtle 3D perspective tilt. Contains chart visualizations using the violet (#9984d8) and green (#3fcb7f) accents as data colors. Sits beneath the hero text as a visual anchor, fading into the black canvas at edges.

### Testimonial Card
**Role:** Social proof quote with attribution

No visible card border or background — sits directly on the black canvas. Layout: circular avatar (64px) on the left, quote text in Iowan Old Style 24px weight 300 white on the right. Below: company logo + name (Inter 14px weight 500 white) and role (Inter 13px Ash Gray). 'Read case study →' ghost link in Inter 14px.

### Metric Display Card
**Role:** Dashboard preview cards showing key numbers

16px border-radius, background #050607 (Carbon Card). Internal padding 16-20px. Title in Inter 14px Ash Gray. Large number in Inter 34px weight 600 white. Delta indicator: mint green (#3fcb7f) text with '+%' and absolute value below in smaller Ash Gray. Chart visualization fills the lower portion.

### Section Header
**Role:** Standardized heading block for content sections

Centered. H2 in Alpha Lyrae 48px weight 400 white, line-height 1.0. Subhead in Inter 18px weight 400 Ash Gray, max-width ~640px, centered. 24-32px gap between heading and subhead.

### Pill Badge
**Role:** Status indicators, new feature announcements, live tags

999px border-radius, 4px vertical × 12px horizontal padding, background transparent with 1px border in Steel Gray (#808080) or tinted with Mint Signal. Text in Inter 13px weight 500. Small dot prefix in matching color for 'Live' indicators.

### Outlined Action Button
**Role:** Secondary action in section CTAs (e.g., 'See all 750+ integrations')

Transparent background, 1px solid border in Steel Gray (#808080), 6px border-radius, 10px vertical × 20px horizontal padding. Text in Inter 14px weight 500 white. Hover: border lightens to white.

### Integration Logo Grid
**Role:** Display of supported data source integrations

Multi-row grid of third-party brand logos (6-8 per row) at ~40×40px each, rendered in their native brand colors on the black canvas. 12-16px gap between logos. Logos appear as-is, no monochrome treatment — the colorful grid is the visual statement of breadth.

### Live Status Indicator
**Role:** Real-time / connected state badge

Small (8px) mint green (#3fcb7f) filled circle with subtle glow, paired with 'Live' text in Inter 13px weight 500. Used in metric card headers to signal data freshness.

### Gradient Accent Block
**Role:** Decorative purple wash behind hero mockup or section dividers

Radial or linear gradient using the violet palette: rgba(163, 102, 255, 0.38) → rgba(123, 78, 245, 0.24) → rgba(82, 49, 184, 0.12) → transparent. Applied as background overlay to add atmospheric color without solid fills.

## Do's and Don'ts

### Do
- Use #ffffff as the filled button background on the black canvas — this inversion is the system's signature action style
- Set all headings at 48px in Alpha Lyrae weight 400 with line-height 1.0 — do not scale or weight-shift the display serif
- Apply -0.03em letter-spacing to all Inter text regardless of size — the tight tracking is part of the system voice
- Use 6px radius for buttons, 16px radius for cards — never swap or interpolate these values
- Reserve the violet (#9984d8) and mint (#3fcb7f) for data/chart contexts and live status — never apply them to text or backgrounds as decoration
- Center-align all hero and section headers — the layout rhythm is symmetric, not asymmetric
- Render integration logos in their native brand colors on black — the multicolored grid is intentional visual proof of breadth

### Don't
- Do not use violet or mint as a button fill — the primary action is always white-on-black
- Do not add box-shadows to cards — the dark surface system relies on near-identical values and no shadow language
- Do not break the 6px/16px radius rule by rounding buttons to match cards or vice versa
- Do not use Inter for display headlines — Alpha Lyrae at 48px is reserved for h1/h2 hero moments only
- Do not use full white (#ffffff) for body copy — use Ash Gray (#b3b3b3) for secondary text to establish hierarchy
- Do not place light cards on the black canvas with hard edges — use #050607 to keep the surface language recessive
- Do not use warm grays — all neutrals lean cool, matching the violet accent's temperature

## Elevation

This design intentionally avoids drop shadows. Elevation is communicated through near-identical surface values (#000000 canvas → #050607 card) that read as recessed wells rather than raised panels. The contrast ratio between these two values is deliberately minimal (~0.5%) so cards feel carved into the void, not floating above it. The only 'elevation' in the system comes from color contrast: white buttons on black canvas are the brightest objects in any scene.

## Surfaces

- **Void Canvas** (`#000000`) — Page background — the default stage
- **Carbon Card** (`#050607`) — Metric cards, dashboard preview surfaces — nearly black, reads as a recessed well
- **Tonal Wash** (`#e8eaee`) — Rare light surface for tonal contrast in specific sections

## Imagery

The visual language is product-screenshot-dominant with a dark, atmospheric treatment. The hero features a 3D-perspective dashboard mockup with chart visualizations in violet and green, fading into the black canvas at edges — the product IS the hero image. Integration logos appear in a multicolored grid as native brand marks, serving as social proof of ecosystem breadth. Avatars in testimonials are circular crops on black. No lifestyle photography, no illustrations — the interface communicates through its own product visuals and typography alone. Iconography is minimal and geometric, rendered in white or Steel Gray line style at 16-20px.

## Layout

Full-page max-width 1200px centered layout on a pure black canvas. Hero is a centered vertical stack: announcement pill → serif headline → subhead → button pair → trust line, followed by a full-bleed product mockup image that bleeds beyond the content container. Sections alternate between centered text blocks and multi-column card grids, all with generous 80-120px vertical breathing room. Testimonials are a 2-column grid with avatar+quote pairs. Integration logos form a dense 6-8 column grid that fills the section width. Navigation is a fixed transparent top bar with left-aligned logo, centered nav links, and right-aligned auth actions. No sidebar, no mega-menu — the navigation is intentionally minimal to let the hero and product visuals dominate.

## Similar Brands

- **Linear** — Same dark-mode-only interface with near-black canvas, white type at tight tracking, and a single display moment (Linear's gradient hero text vs Basedash's serif headlines) that breaks the monochrome rhythm
- **Vercel** — Identical pure-black canvas treatment with no card shadows, white pill buttons as the primary action, and grid layouts that let the void do the visual work
- **Stripe** — Similar restrained color palette with one or two chromatic accents used only for data/illustration, and a preference for centered hero stacks with generous vertical breathing room
- **Resend** — Same dark technical-tool aesthetic with a single editorial serif accent, white-on-black action buttons, and integration-logo grids as social proof
