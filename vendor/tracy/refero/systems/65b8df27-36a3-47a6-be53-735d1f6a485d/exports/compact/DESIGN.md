# REKKI — Style Reference
> Mission control dashboard in a darkroom

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

REKKI is a midnight enterprise control room: a pitch-black canvas hosting dense product interfaces that glow from within. The visual system is nearly monochromatic — no semantic color clutter, no decorative gradients — letting one electric blue do all the emotional heavy lifting on CTAs, active states, and brand punctuation. Typography is custom and characterful: Diatype REKKI brings quiet authority with tight negative tracking on display sizes, while OCD-GARRI handles the utilitarian UI labels. Components sit on the canvas like instrument panels — dark, lightly elevated by near-invisible inset white borders rather than drop shadows, with pill-shaped interactive elements that feel like physical switches.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Blue | `#0063e1` | Primary CTA fill, active nav indicator, brand accent dots, link highlights — the single chromatic voice in an otherwise silent monochrome system |
| Obsidian | `#000000` | Page canvas, dominant background, hairline divider color, icon fill — the floor of the entire system |
| Carbon | `#040910` | Card surface base, deep panel backgrounds — first step above the page canvas |
| Graphite | `#0d0d0d` | Elevated card surfaces, section backgrounds, border fills — the mid-surface layer |
| Iron | `#1f1f1f` | Input field backgrounds, form controls, tertiary surfaces |
| Steel | `#2b2c2e` | Highest card elevation, modal surfaces, hover-state surfaces — the ceiling of the surface stack |
| Ash | `#858585` | Body text, muted labels, secondary borders, link underlines — the workhorse neutral for non-heading text |
| Smoke | `#979797` | Icon strokes, tertiary button borders, low-priority text |
| Fog | `#8c8c8c` | Link text, subdued navigation labels |
| Paper | `#ffffff` | Light neutral action fill for buttons on dark surfaces. |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Diatype REKKI — Primary brand typeface — body text at 16-20px weight 400, large headlines at 56-86px weight 400 with aggressive negative tracking (as tight as -0.064em at 86px). The whisper-weight headlines are signature: no bold shouting, just precise geometric calm. Subheadings/nav at 16-20px weight 400-600.
- **Substitute:** Inter, Söhne, or system-ui sans-serif
- **Weights:** 400, 600
- **Sizes:** 12, 16, 18, 20, 24, 56, 72, 86
- **Line height:** 1.00–1.67
- **Letter spacing:** Tight: -0.064em at 86px, -0.042em at 72px, -0.040em at 56px, -0.027em at 20px, -0.015em at 18px, -0.007em at 16px, -0.005em at 12px
- **OpenType features:** `"case"`

### Diatype REKKI Bolder Rounded — Display variant for the most prominent brand moments — heavier geometric terminals, used sparingly at 72px for hero declarations and at 12-20px weight 700 for emphasis labels in nav/inputs.
- **Substitute:** Inter Bold, Söhne Bold
- **Weights:** 400, 700
- **Sizes:** 12, 14, 16, 20, 72
- **Line height:** 1.00–1.17
- **Letter spacing:** Positive tracking: 0.020em at 20px, 0.040em at 72px

### OCD-GARRI — Secondary utility face — likely for product UI labels, status indicators, or monospaced-feeling tabular data within the embedded product screenshots. Carries slight positive letter-spacing (0.033-0.038em) giving it a structured, instrument-label quality.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Roboto Mono
- **Weights:** 400
- **Sizes:** 13, 15, 16
- **Line height:** 1.00–1.23
- **Letter spacing:** 0.033em at 13px, 0.038em at 15px

### Diatype REKKI Regular — Diatype REKKI Regular — detected in extracted data but not described by AI
- **Weights:** 400, 600
- **Sizes:** 12px, 16px, 18px, 20px, 24px
- **Line height:** 1.33, 1.4, 1.5, 1.67
- **Letter spacing:** -0.027, -0.015, -0.007, -0.005
- **OpenType features:** `"case"`

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.005px |
| body | — | — | 16px | 1.5 | -0.007px |
| subheading | — | — | 18px | 1.4 | -0.015px |
| heading-sm | — | — | 20px | 1.33 | -0.027px |
| heading | — | — | 24px | 1.33 | -0.027px |
| heading-lg | — | — | 56px | 1.25 | -0.04px |
| display | — | — | 86px | 1 | -0.064px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 20px

### Border Radius

- **nav:** 2px
- **cards:** 16px
- **images:** 24px
- **inputs:** 8px
- **buttons:** 59px
- **largeCards:** 30px

## Components

### Primary CTA Button
**Role:** The singular conversion action

Pill-shaped button (59px border-radius), Signal Blue #0063e1 fill, white #ffffff text at 16px Diatype REKKI weight 400-600 with -0.007em letter-spacing. Padding 20px vertical, 32px horizontal. No drop shadow — the saturated blue against the black canvas is sufficient visual weight. Used for 'Get a demo' / 'Book a demo' patterns.

### Navigation Header Button
**Role:** Compact header action

Smaller pill button (59px radius), Signal Blue #0063e1 fill, white text at 12-14px. Dense horizontal padding (14-20px). Sits in the top-right of the header.

### Nav Link
**Role:** Primary navigation text

Plain text link, no underline, Ash #858585 or Paper #ffffff color, Diatype REKKI 16px weight 400 at -0.007em tracking. Inactive links use #858585; the active/current page uses Paper #ffffff. No background, no border.

### Hero Display Heading
**Role:** Page-level headline

Diatype REKKI 86px weight 400, Paper #ffffff, -0.064em letter-spacing, line-height 1.0. The negative tracking at this size is signature — it makes the type feel architectural rather than editorial. No bold, no italic, just precise geometry.

### Section Heading
**Role:** Subsection headline

Diatype REKKI 56px weight 400, Paper #ffffff, -0.040em letter-spacing, line-height 1.25. Same whisper-weight philosophy as display, scaled down for sub-sections.

### Product UI Panel Card
**Role:** Embedded product screenshot container

Large surface (Carbon #040910 or Graphite #0d0d0d background), 16px border-radius, 1px inset white border at rgba(255,255,255,0.12) for definition against the black canvas. 24px internal padding. Contains dense tabular data with OCD-GARRI labels.

### Standard Card
**Role:** Content grouping surface

Graphite #0d0d0d or Steel #2b2c2 background, 8-16px border-radius, subtle 1px inset border rgba(255,255,255,0.12) for edge definition. 16-24px internal padding. No drop shadow — elevation is communicated through surface color and the inset border only.

### Feature Card with Image
**Role:** Marketing card with visual

Larger radius (24-30px), dark background, image area with 24px radius and overflow hidden. Title at 20-24px Diatype REKKI, body text at 16px Ash #858585.

### Text Input
**Role:** Form input field

Iron #1f1f1f background, 8px border-radius, subtle outer glow via rgba(255,255,255,0.2) 0px 0px 1px 0px. White text, Ash placeholder. 12-16px Diatype REKKI Bolder Rounded for the field text.

### Status Pill / Tag
**Role:** State indicator or category label

Small pill-shaped element, dark background with white or muted text, OCD-GARRI 12-13px. Used within the product UI for order statuses (upload pending, upload successful, etc.).

### Cookie Consent Banner
**Role:** Legal/privacy overlay

Fixed bottom-right, Steel #2b2c2 background, 16px radius, compact padding. Body text in Ash #858585, 'OKAY' dismiss button in a neutral dark style.

### Logo Mark
**Role:** Brand identity

Custom REKKI wordmark with a distinctive 'π'-like geometric mark preceding the wordmark. White #ffffff on dark canvas. Sits top-left of every page.

## Do's and Don'ts

### Do
- Use #0063e1 exclusively for the single primary CTA per viewport — never for decorative elements, illustrations, or non-action accents
- Apply -0.064em letter-spacing on display type (72px+) and scale proportionally down to -0.005em at body sizes (12px)
- Use Diatype REKKI weight 400 for all headlines — no bold weights for display type; authority comes from size and tracking, not weight
- Communicate card elevation through the rgba(255,255,255,0.12) 1px inset border, never through drop shadows
- Maintain the 5-level surface stack (Obsidian → Carbon → Graphite → Iron → Steel) with clear 3-5% luminance steps between each level
- Use 59px border-radius for all pill-shaped buttons and 16px radius for content cards — never mix the two radii on the same element type
- Let product UI screenshots occupy the visual focal point of marketing sections rather than stock photography or lifestyle imagery

### Don't
- Never use multiple chromatic accent colors — the system is monochromatic + one blue; introducing green, red, or purple breaks the entire visual language
- Never apply drop shadows to cards or panels; the inset white border IS the elevation system
- Never set body text below #858585 contrast against the black canvas; use Paper #ffffff for any text that needs to be read at a glance
- Never use bold (700) weights for headlines; Diatype REKKI weight 400 at large sizes with tight tracking is the signature — bolding destroys it
- Never use letter-spacing greater than 0em on display type; the negative tracking is what makes the headlines feel architectural
- Never place white or light-colored cards on the dark canvas; all surfaces must stay in the black-to-charcoal range
- Never use rounded images or organic shapes for the logo or brand mark — the geometry is angular and precise

## Elevation

- **Cards:** `rgba(255, 255, 255, 0.12) 0px 0px 0px 1px inset`
- **Input fields:** `rgba(255, 255, 255, 0.2) 0px 0px 1px 0px`

## Surfaces

- **Obsidian Canvas** (`#000000`) — Page background, infinite floor
- **Carbon Panel** (`#040910`) — First card elevation, product UI containers
- **Graphite Card** (`#0d0d0d`) — Standard card surfaces, content blocks
- **Iron Form** (`#1f1f1f`) — Input fields, interactive form surfaces
- **Steel Overlay** (`#2b2c2`) — Top elevation, hover states, prominent overlays

## Imagery

The page uses embedded product UI screenshots as the primary visual — not lifestyle photography, not illustrations. These screenshots are full-bleed within their card containers, showing dense tabular order data, status indicators, and product features. The hero section includes a dark atmospheric photograph of a desk/office scene at low opacity, serving as a textural background behind floating UI status badges ('scanned 27 invoices', 'detected 4 customers churning'). Customer logos appear as a monochrome text-based logo wall. The imagery strategy is 'show the product, not the lifestyle' — the interface IS the hero.

## Layout

Full-bleed dark canvas with max-width 1200px centered content. The hero is a centered stack: floating status badges in the upper third, large display headline centered below, subtext, then a single CTA — no split-screen, no side image. Below the hero, sections alternate between centered text blocks and embedded product UI screenshots in 16px-radius cards. The rhythm is: centered headline → product screenshot → feature grid (2-3 columns) → customer logo wall → footer. Navigation is a minimal top bar: logo left, 4-5 text links center, CTA button right. No sidebar, no mega-menu. Section gaps are generous (80px) creating breathing room in the dark space.

## Similar Brands

- **Linear** — Same dark canvas with one vivid blue accent, custom geometric sans-serif with tight tracking, inset-border card elevation replacing drop shadows, pill-shaped primary CTAs
- **Vercel** — Nearly pure black background, monochrome palette with minimal accent color, large whisper-weight display headlines with aggressive negative letter-spacing, embedded product UI as hero imagery
- **Retool** — Dark enterprise control-panel aesthetic, dense product UI screenshots as marketing visuals, pill buttons, custom brand typeface with tight tracking on display sizes
- **Railway** — Pitch-black canvas, single chromatic accent for CTAs, custom rounded display variant of a geometric sans-serif, surface elevation through subtle border rather than shadow
