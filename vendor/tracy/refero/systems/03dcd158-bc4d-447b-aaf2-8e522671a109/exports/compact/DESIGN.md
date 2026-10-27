# Evervault — Style Reference
> Encrypted vault behind ultraviolet light — a dark crypt where one violet beam reveals everything.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Evervault is a nocturnal crypto-vault interface: an almost-black canvas pierced by ultraviolet light, where every surface feels like brushed obsidian. The palette is 95% achromatic, leaning on cool gray-violet tints (#dfe1f4, #ececfb) rather than pure white, with a single vivid violet (#b88cff) acting as the encryption key — it appears on links, icons, gradient washes, and a glowing portal in the hero. Typography is the brand's quiet flex: Roobert for headlines with aggressive negative tracking that pulls characters into each other, Inter for body/UI at a comfortable density, and Roboto Mono for code that signals developer-first credibility. Components are floating and layered — a pill-shaped nav bar, 12–16px-radius cards with inset shadow stacks, pill CTAs — and the layout alternates between deep canvas and luminous gradient bands to create a sense of moving through encrypted chambers.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Canvas | `#010314` | Primary page background, hero canvas — near-black with a blue-violet undertone, not a true neutral |
| Obsidian Surface | `#171825` | Elevated panels, nav bar, secondary cards — one step up from canvas, reads as a subtle surface tier |
| Slate Layer | `#2a2b3a` | Card backgrounds, input fields, inset panels — the main surface level for content containers |
| Carbon Border | `#343543` | Hairline borders, dividers, card edges — barely visible structural lines on dark surfaces |
| Ash Text | `#5e6077` | Muted helper text, disabled labels, tertiary metadata |
| Fog Text | `#9fa2b9` | Secondary body text, inactive icons, subdued UI labels |
| Mist Text | `#babcd2` | Link resting state, sub-labels, low-emphasis body |
| Lunar White | `#dfe1f4` | Primary body and heading text — a cool off-white, the dominant readable surface in the system |
| Frost White | `#ececfb` | High-contrast text, hover states, icon highlights — the brightest text in the hierarchy |
| Pure White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Ultraviolet Key | `#b88cff` | Brand accent — links, highlight icons, gradient termini, the signature violet that signals encryption |
| Deep Iris | `#6633ee` | Brand gradient anchor — hero gradient origin, logo violet, saturated primary brand tone |
| Amethyst Glow | `#8e64ff` | Mid-gradient violet, hover states on brand elements, secondary accent fills |
| Shadow Iris | `#2e2a4c` | Tinted shadows and border accents — gives depth a violet cast rather than pure black |
| Plum Depth | `#1f1d3a` | Deep accent backgrounds, violet-tinted shadow layers, card hover glows |
| Code Rose | `#f92672` | Code syntax highlighting (Monokai-style keywords), inline emphasis in code blocks |

## Typography

### Roobert — Headlines and display text — the brand's signature face. Aggressive negative tracking at large sizes makes characters pull into each other, creating a custom-display feel no system font replicates. Use for h1–h3, hero copy, and section titles.
- **Substitute:** Inter Tight or Manrope
- **Weights:** 400, 500, 600
- **Sizes:** 12, 13, 14, 16, 18, 24, 32, 48, 52, 56
- **Line height:** 1.00, 1.13, 1.25, 1.30
- **Letter spacing:** -0.010em to -0.025em (tightens as size grows; -0.025em at 56px display, -0.010em at 14px body)
- **OpenType features:** `"kern", "liga", "salt"`

### Inter — Body text, navigation, buttons, UI labels, footer copy. The workhorse face for everything below the headline tier. Weight 580 is an uncommon mid-weight that fills the gap between 500 and 600 for UI emphasis.
- **Substitute:** Inter (native)
- **Weights:** 400, 500, 580
- **Sizes:** 9, 11, 12, 13, 14, 15, 16
- **Line height:** 1.00, 1.55, 1.75, 1.76, 1.94, 2.00
- **OpenType features:** `"kern", "liga", "salt"`

### Roboto Mono — Code snippets, terminal output, technical labels. The 0.400em tracking at small sizes is a deliberate eyebrow/label pattern for uppercase micro-copy like 'Built for Developers'.
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400, 500, 600
- **Sizes:** 10, 12, 15, 18, 20
- **Line height:** 1.00, 1.21, 1.40, 1.50
- **Letter spacing:** -0.050em at small sizes, 0.400em for all-caps micro-labels (tracking-out for eyebrow text)
- **OpenType features:** `"kern", "liga", "salt"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.55 | 0px |
| body | — | — | 14px | 1.76 | 0px |
| body-lg | — | — | 16px | 1.94 | 0px |
| subheading | — | — | 18px | 1.5 | -0.18px |
| heading-sm | — | — | 24px | 1.3 | -0.36px |
| heading | — | — | 32px | 1.25 | -0.64px |
| heading-lg | — | — | 48px | 1.13 | -1.2px |
| display | — | — | 56px | 1.13 | -1.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 19.2px
- **hero:** 38.4px
- **cards:** 16px
- **badges:** 8px
- **inputs:** 12px
- **buttons:** 9999px

## Components

### Floating Pill Navigation
**Role:** Primary site navigation

Pill-shaped nav bar (19.2px radius) floating over the hero with #171825 background, 1px white-alpha inset highlight on top edge. Contains logo left, centered link cluster, CTA right. Padding approximately 8px 12px internally with 13px gap between links.

### Primary CTA Button (Pill)
**Role:** Main call-to-action

White background (#ffffff), dark text (#010314), Inter 13–14px weight 500, pill radius (9999px), padding 8px 16px. Subtle inset shadow at top. The inversion against the dark canvas makes it the brightest element on screen.

### Ghost Text Link
**Role:** Secondary navigation or inline link

No background, #ececfb or #dfe1f4 text, Inter weight 500, with a right-arrow chevron (→) suffix. Used for 'Get Started' and 'View our docs' alongside the primary pill CTA.

### Hero Credit Card Visualization
**Role:** Hero centerpiece

Rounded card (24px radius) with white-to-violet gradient, chip, card number, and contactless icon. Positioned left of a vertical violet glow beam (#6633ee → #ffffff radial) and a cascade of encrypted characters (#847fa1) suggesting tokenization.

### Product Feature Card
**Role:** Feature explanation container

Dark card (#2a2b3a background), 12px radius, 24px padding. Contains a violet-tinted icon or 3D cube illustration, bold heading, and 2–3 line description. Multi-layer shadow with inset violet glow (rgba(190,167,255,0.24) 1px inset) gives an encrypted-chamber depth.

### Code Snippet Card
**Role:** Developer-facing code example

Dark card with frosted-glass treatment, tabbed header (Checkout.jsx | theme.js), syntax-highlighted code using Monokai-like palette (#f92672 keywords, #b88cff strings, #ececfb variables). Roboto Mono 12–13px, 1px border #343543, 12px radius.

### Trust Logo Cloud
**Role:** Social proof band

Two-row grid of partner/client logos on transparent background, rendered in #dfe1f4 or white monochrome. Centered caption below in muted gray: 'Global leaders trust Evervault to secure their most sensitive payment data'.

### Product Icon Grid
**Role:** Product line overview

8-column horizontal grid of square icon tiles (each ~48×48px) on rounded dark containers. Icons are violet-tinted line-art. Labels below in Inter 11px caption. Used to enumerate the product suite (PCI, Payments, Card, Network, etc.).

### Gradient Hero Band
**Role:** Section background

Full-bleed gradient zone transitioning from #6633ee radial at top-center fading to white at bottom edge (radial-gradient 130% 120% at 50% 0px). Creates a luminous arch over content sections — the visual signature of page transitions.

### Eyebrow Label Pill
**Role:** Section category indicator

Small rounded badge (8px radius), #2a2b3a background, 1px inset border. Text in Roboto Mono 11–12px with 0.400em letter-spacing, uppercase, #ececfb color. Used for 'Built for Developers' and similar categorical labels.

### Logo Wordmark
**Role:** Brand identity in nav/footer

Custom Evervault logo: three horizontal bars forming an 'E' shape (varying lengths) + 'evervault' wordmark in Roobert or Inter weight 500, all in #dfe1f4 on dark canvas.

### Announcement Bar
**Role:** Top-of-page notification

Full-width thin bar (2–3px vertical padding), centered text in Inter 12–13px, #dfe1f4. No background tint — sits directly on the canvas. Icon prefix + 'Learn more →' link suffix.

## Do's and Don'ts

### Do
- Use #010314 as the universal canvas — never introduce a lighter background for page-level surfaces
- Reserve #b88cff for links, icons, and gradient termini — it is the encryption key, not a fill color
- Set headline tracking to -0.025em at 48px+ display sizes; tighten as type scales up
- Apply 19.2px radius to the floating nav and 16px to content cards; use 9999px for all CTA buttons and tags
- Layer shadows with the violet-tinted shadow stack (rgba(190,167,255,0.24) inset + rgba(0,0,0,0.25) drop) for cards, not generic gray shadows
- Use Roboto Mono 0.400em-tracked uppercase for all eyebrow/category labels under 14px
- Alternate between Void Canvas sections and Gradient Hero Bands to create the encrypted-chamber rhythm

### Don't
- Do not introduce a light theme — the dark canvas is the brand's identity
- Do not use #6633ee as a flat fill for large surfaces — it belongs inside gradients and the logo only
- Do not use pure #ffffff for body text — use #dfe1f4 or #ececfb to avoid harsh contrast on the near-black canvas
- Do not apply the same radius everywhere — 8px for badges/buttons, 12px for cards, 19.2px for nav, 24px+ for hero shapes
- Do not use generic gray shadows — the violet-tinted shadow stack is what makes the depth feel encrypted
- Do not use Roobert for body copy below 18px — switch to Inter for readability at UI sizes
- Do not center-align long-form body paragraphs — center only headlines and short CTA clusters

## Elevation

- **Content Card:** `rgba(0,0,0,0.25) 0px 8px 16px -4px, rgba(0,0,0,0.25) 0px 4px 8px -2px, rgba(0,0,0,0.2) 0px 1px 2px 0px, rgba(190,167,255,0.24) 0px 0px 0px 1.5px inset`
- **Elevated Card (hero / feature):** `rgba(255,255,255,0.2) 0px 1px 0px 0px inset, rgba(0,0,0,0.12) 0px -1px 24px 0px inset, rgba(0,0,0,0.08) 0px 0px 16px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 1px, rgba(0,0,0,0.2) 0px 1px 2px 0px, rgba(0,0,0,0.2) 0px 2px 4px 0px`
- **Badge / Pill:** `rgba(0,0,0,0.12) 0px 0px 0px 1px inset`

## Surfaces

- **Void Canvas** (`#010314`) — Primary page background, hero base — the deepest surface in the stack
- **Obsidian Panel** (`#171825`) — Floating nav bar, secondary panels, inset containers
- **Slate Card** (`#2a2b3a`) — Content cards, feature tiles, input fields, the standard card surface
- **Frost Surface** (`#ffffff`) — Primary action buttons, inverted card sections, maximum-emphasis elements

## Imagery

Visual language is dominated by 3D abstract renders and gradient washes rather than photography. The hero centerpiece is a credit card illustration paired with a cascade of encrypted character glyphs, suggesting tokenization. Product feature cards use isometric 3D cube/hexagon shapes in violet-to-blue gradients. The gradient hero bands are full-bleed radial washes of ultraviolet that arch over content like light through a cathedral window. Icons are thin-stroke line-art in violet (#b88cff) or white, never filled. The overall feel is diagrammatic and cryptographic — the visual is the data, not a metaphor for it.

## Layout

Max-width 1200px centered container, but hero sections break to full-bleed. Hero is a centered headline stack over a full-bleed dark canvas with the credit-card visualization floating left. Below the hero, a trust logo cloud spans full-width. Sections alternate between dark canvas and luminous gradient bands (radial violet → white arches) that act as visual room-changers. Content sections use a 2-column split (text-left, visual-right) pattern. Product features arrange as 4-column icon grids. Code examples sit in single-column card blocks. Navigation is a floating pill bar anchored to the top, never a full-width strip.

## Similar Brands

- **Vercel** — Same near-black canvas with a single bright white pill CTA, and tight letter-spaced display headlines over gradient hero washes
- **Linear** — Identical floating pill nav pattern and dark-mode UI with violet-tinted accent glow, plus inset shadow stacks on cards
- **Stripe** — Similar developer-first product presentation with gradient hero bands, code snippet cards, and a trust logo cloud mid-page
- **Railway** — Same encrypted-vault aesthetic: deep canvas, violet accent, terminal/code-forward typography, and pill-shaped navigation
