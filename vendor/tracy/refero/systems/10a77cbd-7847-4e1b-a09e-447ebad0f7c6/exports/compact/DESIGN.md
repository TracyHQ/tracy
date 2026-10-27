# Galileo-ft — Style Reference
> deep-space command deck with electric blue signals

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Galileo operates in a deep-space financial observatory: near-black navy canvases, whisper-thin type at display weights, and a single electric cobalt-blue accent that lights the interface like circuit current. Surfaces stack as dark on dark, separated by hairline lavender-tinted borders rather than elevation, giving the page a flat, architectural depth. The brand voice is restrained and premium — generous radii, oversized 3D glass sculpture photography as the hero motif, and color used sparingly so the blue accent always reads as intentional and high-stakes. Type is the signature: weight 100 headlines on a custom geometric face float above the page rather than commanding it, creating authority through restraint.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Navy | `#03081a` | Page canvas and primary dark surface — the base layer everything else floats on |
| Deep Indigo | `#020626` | Card surfaces, raised panels, and secondary structural fills |
| Inkline Violet | `#292f66` | Hairline dividers, card borders, icon strokes — the structural skeleton color |
| Quartz Lavender | `#aab1f2` | Secondary text, outlined link borders, muted body copy, inactive navigation |
| Mist Lilac | `#7a83cc` | Tertiary text and supporting UI elements needing softer contrast |
| Dusk Iris | `#4d5499` | Muted borders, disabled states, low-priority card outlines |
| Glacier White | `#f5f6ff` | Light-theme card surfaces, light section backgrounds, high-contrast text on dark |
| Pure White | `#ffffff` | Primary headlines, primary text on dark, nav and button borders |
| Pulse Cobalt | `#3d50fc` | Primary action buttons, active states, key icons, brand signal — the single vivid accent that powers the entire interface |
| Signal Teal | `#05e0e0` | Secondary accent for icons, tertiary links, gradient terminal, and data-viz highlights |
| Cyan Teal | `#05cee0` | Decorative gradient origin and atmospheric illustration accent |
| Gradient Teal-Blue | `linear-gradient(90deg, rgb(5, 161, 201) 0%, rgb(61, 80, 252) 100%)` | Hero gradient banner, brand transition washes — teal flowing into cobalt creates a continuous energy signal |

## Typography

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Plain — Primary interface typeface. Weight 100 for large display and heading sizes (42–147px), weight 300 for body, weight 400 for emphasized inline text. The ultralthin weights are the defining signature — no other fintech brand runs 100-weight at this scale. Substitute: Inter (light/extra-light), Neue Haas Grotesk Display Thin, or Untitled Sans Light.
- **Substitute:** Inter, Neue Haas Grotesk Display Thin, Untitled Sans Light
- **Weights:** 100, 300, 400
- **Sizes:** 10px, 13px, 14px, 16px
- **Line height:** 1.20, 1.30
- **Letter spacing:** 0.2500em at 10px (tracked eyebrow/label style), normal at body sizes

### Plain Light — Long-form body copy, description paragraphs, and card detail text. Weight 300 keeps long passages airy and scannable against the dark canvas. The 1.80 line-height variant is used for spacious paragraph blocks. Substitute: Inter Light, Untitled Sans Light.
- **Substitute:** Inter Light, Untitled Sans Light
- **Weights:** 300
- **Sizes:** 12px, 14px
- **Line height:** 1.40, 1.50, 1.80
- **Letter spacing:** normal

### Plain Ultralight — Subheadings, section headers within cards, and product category labels. Weight 100 at 28px stays in the same whisper register as the display sizes but at a scannable mid-scale. Substitute: Inter ExtraLight, Neue Haas Grotesk Display Thin.
- **Substitute:** Inter ExtraLight, Neue Haas Grotesk Display Thin
- **Weights:** 100
- **Sizes:** 28px
- **Line height:** 1.30
- **Letter spacing:** -0.56px (-0.02em)

### Plain Ultrathin — Hero headlines, display text, and section-leading titles. Weight 100 at 147px is the brand's most extreme typographic move — the characters nearly dissolve into hairlines, which is why the vivid blue accent and surrounding negative space carry so much of the visual weight. Substitute: Inter Thin, Neue Haas Grotesk Display Thin.
- **Substitute:** Inter Thin, Neue Haas Grotesk Display Thin
- **Weights:** 100
- **Sizes:** 42px, 56px, 83px, 147px
- **Line height:** 0.80, 1.00, 1.10, 1.20
- **Letter spacing:** -0.84px at 42px, -1.12px at 56px, -1.66px at 83px, -2.94px at 147px (all -0.02em)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 10px | 1.2 | 2.5px |
| caption | — | — | 12px | 1.5 | — |
| body | — | — | 16px | 1.3 | — |
| subheading | — | — | 28px | 1.3 | -0.56px |
| heading-sm | — | — | 42px | 1.1 | -0.84px |
| heading | — | — | 56px | 1.1 | -1.12px |
| heading-lg | — | — | 83px | 1 | -1.66px |
| display | — | — | 147px | 0.8 | -2.94px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 9px

### Border Radius

- **tags:** 17px
- **cards:** 35px
- **inputs:** 35px
- **buttons:** 48px

## Components

### Primary Filled Button
**Role:** Main call-to-action — used for the highest-priority conversion on each surface

Pulse Cobalt (#3d50fc) fill, Pure White text, 48px border-radius (pill-shaped), 22px horizontal padding × 14px vertical padding. Plain weight 300 at 16px, letter-spacing normal. No shadow, no border. The saturated blue against the deep navy creates a high-voltage focal point without needing elevation.

### Ghost Outline Button
**Role:** Secondary action — paired beside primary CTAs to offer an alternative path

Transparent background, 1px Pure White border (#ffffff), Pure White text, 48px border-radius, 22px × 14px padding. Plain weight 300 at 16px. Used for actions like 'Learn More' in the announcement bar and navigation-level secondary actions.

### Pill Navigation Link
**Role:** Right-side utility nav items and floating action triggers

Transparent fill, 1px border in Pure White or Quartz Lavender (#aab1f2), white or lavender text, 48px border-radius. 13–14px Plain weight 300–400. The lavender border variant signals a non-primary or secondary nav position.

### Dark Card
**Role:** Feature card, product tile, and content block container on dark sections

Deep Indigo (#020626) background, 1px Inkline Violet (#292f66) border, 35px border-radius, 32px padding. No drop shadow. Cards rely on the violet hairline border and subtle background shift rather than elevation to separate from the void canvas.

### Light Card
**Role:** Content card used on light/white sections of the page

Pure White (#ffffff) background, 1px Mist Lilac (#7a83cc) or Dusk Iris (#4d5499) border, 35px border-radius, 32px padding. Contains dashboard screenshots, product mockups, and tabbed content panels. Dark text (#020626) inside.

### Tab Pill
**Role:** Active category selector inside product navigation bars

Pulse Cobalt (#3d50fc) fill for the active tab, white text, 17px border-radius (smaller pill than buttons), 22px × 14px padding. Inactive tabs are transparent with a faint violet border. 14px Plain weight 400.

### Eyebrow Label
**Role:** Small section-prelude text above headings — e.g. 'FINANCIAL TECHNOLOGY PLATFORM'

Plain weight 400 at 10px with 0.25em letter-spacing (2.5px), uppercase, Quartz Lavender (#aab1f2) or Signal Teal (#05e0e0) color. Functions as a tracked-out category tag that frames the weight-100 heading below it.

### Outlined Link
**Role:** Inline 'Explore →' and 'Learn more' style links within body copy

No background, Quartz Lavender (#aab1f2) 1px bottom border acting as the link underline, lavender text, Plain weight 300 at 16px. The thin lavender rule replaces the traditional solid underline for a lighter, architectural feel.

### Floating Chat Trigger
**Role:** Persistent 'Talk With Gala' conversation launcher

Glacier White (#f5f6ff) pill-shaped background, 48px border-radius, 1px light border, small avatar icon at left, Plain weight 400 at 14–16px. Floats fixed at bottom-center on all screens. Represents the brand's always-on customer engagement.

### Announcement Bar
**Role:** Top-of-page notice for product news or company updates

Teal-to-Cobalt gradient background (linear 90deg, #05a1c9 → #3d50fc), Pure White text at 14px Plain weight 300, full-bleed. Contains a white ghost 'Learn More' button and a dismiss × icon at right.

### Hero Headline
**Role:** Primary page-level title — the largest typographic statement on each page

Plain Ultrathin weight 100, Pure White (#ffffff), 56–83px size range with -0.02em letter-spacing. 1.0–1.1 line-height. Sits left-aligned in the hero with a generous left margin, paired with a 3D glass sculpture or product mockup on the right.

### Dashboard / Product Screenshot
**Role:** In-context product visuals embedded in cards and sections

Contained within a 35px-radius card with a 1px violet border. The screenshot itself uses a dark UI with cobalt and teal data accents. Rendered with a slight inset shadow or border to separate from the card background.

### Navigation Menu
**Role:** Primary top-right vertical navigation list

Plain weight 300 at 14–16px, Pure White text, no background. Vertically stacked right-aligned links with ~14px row gap. The 'Login' item is rendered as a 48px-radius ghost pill button with a 1px white border.

### Brand Logo Lockup
**Role:** Wordmark + glyph in the top-left header position

Custom crescent/glyph mark in Pure White followed by lowercase 'galileo' wordmark in Plain weight 300 at ~20px, white. Sits in the top-left of the header with 32px margin from the left edge.

## Do's and Don'ts

### Do
- Use Plain Ultrathin weight 100 for all hero and section-level headlines at 42px or larger
- Use 48px border-radius for all buttons, nav pills, and floating action triggers
- Use 35px border-radius for all cards, panels, and content containers
- Use #3d50fc exclusively for primary filled actions and active states — never another color
- Use 0.25em letter-spacing (2.5px) on all 10px uppercase eyebrow labels
- Separate dark surfaces with 1px #292f66 hairlines, not drop shadows
- Pair the teal-to-cobalt gradient only with full-bleed banner surfaces, never inside cards

### Don't
- Never use weight 600 or 700 for headlines — the ultralthin register is the signature
- Never add drop shadows to cards or buttons — the system is flat by design
- Never use more than one vivid accent color per surface; cobalt and teal should not compete on the same element
- Never use solid underlines on links — use the 1px Quartz Lavender (#aab1f2) bottom border instead
- Never set body copy below weight 300 — the whole system is thin, but body must remain readable
- Never use sharp corners (0px or 4px radius) on interactive elements — all buttons, inputs, and cards use generous radii
- Never introduce a second dark-canvas color outside #03081a and #020626 — surface depth comes from the two-step shift between them

## Elevation

Galileo does not use drop shadows for elevation. Depth is achieved through hairline violet borders (#292f66, #4d5499), subtle surface color shifts between #03081a and #020626, and generous border-radius. This flat-architectural approach keeps the dark canvas clean and lets the vivid blue accent do the visual lifting.

## Surfaces

- **Void Canvas** (`#03081a`) — Page-level background, the deep-space base layer
- **Deep Indigo Card** (`#020626`) — Card and panel surfaces sitting on the void canvas
- **Light Content Surface** (`#ffffff`) — Light-theme content cards, dashboard mockups, and section inversions

## Imagery

The visual identity is anchored by a single hero motif: a large 3D-rendered sculpture of translucent cobalt-blue glass links or liquid chains, occupying roughly 40% of the hero viewport on the right side. The sculpture has a glossy, refractive quality with deep blue-to-cyan gradient surfaces and no hard edges. Beyond the hero, the site uses minimal imagery — product dashboard screenshots rendered in a dark UI with cobalt and teal data accents, set inside rounded cards. No lifestyle photography, no people, no environmental shots. Icons are outlined with 1.5–2px strokes in lavender or cobalt. The overall impression is abstract, premium, and product-focused — the technology itself is the visual subject.

## Layout

Max-width 1200px centered container with a 32–64px outer gutter. The hero is a full-bleed dark band with a split layout: weight-100 headline left-aligned occupying 45% of width, 3D glass sculpture right-aligned at 40% with 40–80px of breathing room between text and image. Below the hero, sections alternate between full-bleed dark and contained light cards, separated by 64px vertical gaps. The logo-and-top-bar sits 24px from the top edge with right-aligned vertical nav. Content blocks within sections use a 2-column text-plus-visual split or a single centered headline stack. Logo strip below the hero is a single centered row of 5–6 partner logos on a dark band. Product feature sections use 2-column layouts with a tabbed pill nav at top, headline + CTA on the left, and a rounded dashboard card on the right. The floating 'Talk With Gala' chat trigger is fixed at bottom-center on all viewports.

## Similar Brands

- **Mercury** — Same dark-canvas fintech premium aesthetic with a single vivid accent color (Mercury uses violet) and thin geometric headlines
- **Ramp** — Dark-mode financial platform with a single electric blue accent and ultralight display type floating on a near-black canvas
- **Modern Treasury** — Deep navy dark theme with cobalt-blue primary actions and the same hairline-border card separation approach
- **Plaid** — Developer-facing fintech with dark UI, monochromatic-violet palette, and abstract 3D illustration as the hero motif
- **Linear** — Thin-weight display type, generous border-radius, and a single vivid accent color punching through a dark, quiet canvas
