# Axelar — Style Reference
> Signal lights through dark lattice

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Axelar's interface reads as infrastructure-grade crypto plumbing rendered in a dark command-center aesthetic. The canvas sits at near-black abyss (#04070a), with a deliberate surface hierarchy stepping up through progressively lighter grays for cards, nav, and elevated panels — depth without brightness. A single vivid orange (#ff6314) is the chromatic authority: every primary action, every product surface, every active state draws from it. Supporting accent hues (electric green, violet, magenta, cyan) appear only as tiny category dots and badges, functioning as node indicators in a network topology rather than decorative variety. Clashgrotesk carries the angular, geometric voice at 500/600 weights; Inter provides the readable body; DM Mono stamps technical labels and metadata. The hero's diamond-lattice pattern with scattered colored dots establishes a network/graph metaphor that recurs in the partner-section category indicators.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Orange | `#ff6314` | Orange action color for filled buttons, selected navigation states, and focused conversion moments. |
| Node Green | `#33ffac` | Category dot indicators, success-tinted badges — functions as a network-node status light, never as a full surface |
| Node Violet | `#5b76ff` | Category dot indicators and info-adjacent badges — part of the node-light spectrum for category encoding |
| Node Magenta | `#ff2ad4` | Category dot indicators and accent badges — part of the node-light spectrum for category encoding |
| Node Cyan | `#16c4ff` | Category dot indicators and accent badges — part of the node-light spectrum for category encoding |
| Abyss | `#04070a` | Page canvas background, hero background, primary dark surface |
| Void | `#000000` | Deepest layer beneath the canvas, SVG icon fills in nav and decorative contexts |
| Obsidian | `#0f1214` | Navigation bar background, link/button hover backgrounds — one step above the canvas |
| Charcoal | `#1a1d1f` | Card border lines, elevated surface borders, mid-tier separators on dark backgrounds |
| Carbon | `#090c0f` | Card surface fill — sits between canvas and nav, gives cards a subtle lift without changing brightness dramatically |
| Steel | `#676f7a` | Muted helper text, secondary borders, nav dividers, badge outlines on dark backgrounds |
| Cloud | `#c6ced7` | Card border accent on light sections, subtle elevated borders |
| Mist | `#e1e6eb` | Light-section dividers, input inset borders, faint borders on light surfaces |
| Snow | `#f0f5fa` | Secondary text, nav text, light body copy on dark surfaces — slightly cool-tinted near-white |
| White | `#ffffff` | Primary headings, primary body text, high-contrast labels, icon strokes on dark surfaces |

## Typography

### Clashgrotesk — Display and heading font — used for all headings, navigation, buttons, and links. The geometric, angular character of Clashgrotesk gives the interface an engineering/infrastructure feel; medium weight (500) carries most headings while 600 anchors the largest display sizes. Tight tracking at 0.033em tightens the geometric forms into a confident block.
- **Substitute:** Space Grotesk, Geist, or Satoshi
- **Weights:** 500, 600
- **Sizes:** 14, 16, 19, 21, 28, 37, 56, 70, 74px
- **Line height:** 1.00–1.50
- **Letter spacing:** 0.033em across all sizes (≈0.46px at 14px up to ≈2.44px at 74px)

### Inter — Body and hero paragraph text — used for descriptive copy, card body content, footer text. Inter's neutral clarity provides a calm counterpoint to Clashgrotesk's angular voice; 400 for body, 600 for emphasis within body contexts.
- **Substitute:** system-ui, -apple-system, or IBM Plex Sans
- **Weights:** 400, 600
- **Sizes:** 16, 19, 21px
- **Line height:** 1.25
- **Letter spacing:** normal

### DM Mono — Monospaced technical labels, metadata, category tags, badge text, and inline code-like elements — stamps a developer/infrastructure credibility onto the interface. Used in nav badges, card category headers, and small status indicators.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Geist Mono
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16, 19px
- **Line height:** 1.00–1.33
- **Letter spacing:** normal

### F77 Minecraft — F77 Minecraft — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.25
- **Letter spacing:** 0.246

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 0.4px |
| body-sm | — | — | 14px | 1.25 | 0.46px |
| body | — | — | 16px | 1.5 | 0.53px |
| body-lg | — | — | 19px | 1.5 | 0.63px |
| subheading | — | — | 21px | 1.25 | 0.69px |
| heading-sm | — | — | 28px | 1.25 | 0.92px |
| heading | — | — | 37px | 1.25 | 1.22px |
| heading-lg | — | — | 56px | 1.15 | 1.85px |
| display | — | — | 74px | 1 | 2.44px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **cards:** 8px
- **small:** 4px
- **badges:** 100px
- **inputs:** 24px
- **buttons:** 24px

## Components

### Signal Orange CTA Button
**Role:** Primary action trigger

Pill-shaped (24px radius) filled button. Background: #ff6314. Text: #ffffff, Clashgrotesk 500, 14–16px, letter-spacing 0.033em, uppercase. Padding: 12px 24px. No border, no shadow — the vivid orange against the dark canvas is its own elevation. This is the sole chromatic CTA in the system.

### Ghost Outlined Button
**Role:** Secondary action trigger

Pill-shaped (24px radius) outlined button. Background: transparent. Border: 1px solid #ffffff. Text: #ffffff, Clashgrotesk 500, 14–16px, letter-spacing 0.033em, uppercase. Padding: 12px 24px. Used for lower-priority actions like 'ECOSYSTEM'.

### Category Dot Badge
**Role:** Category or status indicator

Small filled circle in one of the node accent colors (Node Green, Node Violet, Node Magenta, Node Cyan). Diameter: 8–10px. Always paired with a DM Mono category label. Functions as a network-node status light — the color spectrum encodes categories across the partner ecosystem.

### Pill Badge
**Role:** Compact label or tag

Fully rounded (100px radius) pill shape. Background: #1a1d1f or accent color. Text: DM Mono 400, 12–14px. Border: 1px solid #676f7a for neutral variants. Padding: 4px 12px. Used for metadata labels and inline status indicators.

### Dark Partner Card
**Role:** Logo grid card with category header

Rectangular card on dark canvas. Background: #090c0f. Border: 1px solid #1a1d1f. Radius: 8px. Padding: 24px. Contains a category dot badge + DM Mono category label at top, then a 2-column grid of partner logos with 1px borders on #1a1d1f separating each cell. Inner cells: #090c0f background with white logos.

### Orange Product Card
**Role:** Feature or product showcase card

Rectangular card with vivid orange (#ff6314) background. Radius: 8px. Padding: 24px. Contains a numbered step indicator (1, 2, 3 in a white circle), a white dotted-pattern icon/illustration, a category tag in DM Mono (e.g. 'INTERCHAIN TOKEN SERVICE (ITS)'), a heading in Clashgrotesk 500 white, and body copy in Inter 400 white at reduced opacity.

### Announcement Bar
**Role:** Top-of-page promotional strip

Full-width bar at the very top. Background: #33ffac (Node Green). Text: Clashgrotesk 500, 14px, uppercase, #04070a. Height: ~40px. Contains dismissable text. The green-on-dark contrast makes it the highest-attention element on the page.

### Navigation Bar
**Role:** Primary site navigation

Horizontal bar below the announcement strip. Background: #0f1214. Height: ~60px. Left: Axelar wordmark logo. Center: nav links (Products, Solutions, Resources, About) in Clashgrotesk 500, 14px, #f0f5fa. Right: social icons + Signal Orange CTA 'EXPLORE ECOSYSTEM' pill button. Fixed/sticky positioning.

### Hero Diamond-Lattice Visual
**Role:** Decorative hero illustration

Full-height geometric pattern on the hero right side. Composed of repeating diamond/rhombus shapes in #1a1d1f outlines on the #04070a canvas. Small colored dots (Node Green, Node Violet, Signal Orange) scattered across the lattice at intersection points — functioning as network nodes. One diamond at bottom-center has a pink/magenta glow gradient.

### Hero Headline Block
**Role:** Primary hero text content

Left-aligned text block. Headline: Clashgrotesk 600, 56–74px, #ffffff, letter-spacing ≈0.033em. Subhead: Clashgrotesk 500, 21–28px, #f0f5fa. Body: Inter 400, 19px, #f0f5fa at reduced opacity. CTA pair: Signal Orange filled + Ghost outlined pill buttons below the copy.

### Input Field
**Role:** Text input or form field

Rounded (24px radius) input. Background: transparent or #0f1214. Border: 1px inset #e1e6eb. Text: Inter 400, 16px, #f0f5fa. Placeholder: #676f7a. Padding: 12px 24px. The inset border shadow gives a subtle pressed-in feel.

### Trust Indicator Strip
**Role:** Security/credibility footer in hero

Horizontal row at the bottom of the hero. Three items separated by spacing, each with a small icon and DM Mono 400, 12px label in #676f7a. Items: institutional-grade security, 75+ validators, zero exploits. Minimal visual weight — the icons do the talking.

## Do's and Don'ts

### Do
- Use Signal Orange (#ff6314) exclusively for primary actions, product surfaces, and active states — it is the only chromatic authority in the interface.
- Apply the surface stack in order: #04070a canvas → #090c0f cards → #0f1214 nav → #1a1d1f borders. Depth comes from tonal stepping, never from shadows or brightness jumps.
- Use Clashgrotesk 500/600 for all headings, navigation, and interactive elements; pair with Inter 400/600 for body and DM Mono 400/500 for technical labels and metadata.
- Encode categories using the node accent spectrum (Node Green, Violet, Magenta, Cyan) only as small dot indicators (8–10px) — never as full card or surface backgrounds.
- Use 24px pill radius for all buttons and inputs, 8px radius for cards, and 100px for pill badges. The pill button is a defining shape choice.
- Maintain 64px section gaps and 24px element gaps for comfortable density. Let dark sections breathe — avoid stacking more than 3 elements vertically without generous spacing.
- On light sections, flip the surface stack: white canvas, #f0f5fa secondary text, #e1e6eb borders, #04070a headings. Orange product cards remain as the color punctuation.

### Don't
- Don't use Signal Orange for anything that isn't a primary action or key product surface — it loses its authority when diluted across secondary elements.
- Don't apply shadows for elevation — the system uses tonal stepping through the neutral surface stack. Shadows break the flat engineering aesthetic.
- Don't use node accent colors (green, violet, magenta, cyan) as large fills, gradients, or backgrounds. They are signal dots, not surface treatments.
- Don't use Clashgrotesk for body paragraphs or long-form text — its angular geometry strains readability below 19px. Use Inter for anything over two lines of body copy.
- Don't mix radii arbitrarily — the system is specific: 24px for buttons/inputs, 8px for cards, 100px for pill badges, 4px for small inline elements.
- Don't use pure black (#000000) as a page background — the canvas must be #04070a to maintain the near-black surface hierarchy. Pure black is reserved for SVG icon fills and the deepest layer.
- Don't add decorative gradients to cards or panels — the only gradient in the system is the orange linear-gradient on the hero lattice glow. Color stays flat.

## Surfaces

- **Abyss** (`#04070a`) — Page canvas, hero background, primary dark surface
- **Carbon** (`#090c0f`) — Card surface — one tonal step above the canvas for subtle card lift
- **Obsidian** (`#0f1214`) — Navigation bar, link hover backgrounds — mid-tier surface for interactive elements
- **Charcoal** (`#1a1d1f`) — Borders and dividers on dark surfaces, elevated card outlines

## Imagery

Imagery is minimal and structural rather than photographic. The hero features a custom geometric diamond-lattice illustration — repeating rhombus outlines in #1a1d1f on the dark canvas with small colored node-dots scattered at intersections, one diamond glowing with a pink-magenta gradient. Product cards use white dotted-pattern icons rendered as pixel-grid halftones. The partner section uses partner brand logos in white monochrome on dark card cells. No lifestyle photography, no 3D renders, no product screenshots — the geometric lattice and logo grids are the visual identity.

## Layout

Full-bleed sections with a max-width content container at ~1280px centered. The hero is a split layout: text block left-aligned at ~50% width, diamond-lattice visual occupying the right half. Nav is a horizontal fixed bar with logo left, links center, social icons + CTA right. Below the hero, the partner showcase uses a 2×2 card grid on the dark canvas. The product features section flips to a light background with a 3-column equal-width card grid, each card fully orange. Section rhythm alternates dark → dark → light, with generous 64px vertical gaps between sections. Content within cards is left-aligned. No sidebar navigation, no mega-menus visible — navigation is horizontal and minimal.

## Similar Brands

- **Chainlink** — Dark canvas with a single vivid blue primary action color, geometric/technical iconography, and a 'infrastructure-grade' visual language targeting developer audiences
- **Polygon Labs** — Dark-first design with purple/vivid accent CTAs, angular geometric typography, and a flat surface treatment with minimal shadows
- **Celestia** — Near-black canvas with a single saturated accent color, monospaced technical labels for metadata, and a dark lattice/geometric hero illustration
- **LayerZero** — Dark command-center aesthetic with vivid orange/red primary CTAs, pill-shaped buttons, and a network-topology visual metaphor
- **Arbitrum** — Dark background with vivid blue/cyan accents, geometric sans-serif headings, and a flat tonal surface stack for cards without shadow-based elevation
