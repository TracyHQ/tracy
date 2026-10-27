# Composer — Style Reference
> Bauhaus confetti on concrete

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Composer speaks in the language of an editorial trading manifesto: a light ash canvas scattered with Bauhaus confetti — vivid blue, green, pink, and yellow rectangles that read as information shapes, not decoration. The Neue Haas Grotesk Display type stretches to 244px, letting headlines dominate like magazine covers while Inter handles the quiet, compact UI chrome below. The system is confident and maximalist for marketing surfaces but contracts to a clean, functional dashboard for product work — sharp 2px icon edges and pill-shaped 9999px buttons coexist without contradiction, because both serve clarity over softness. Color is deployed as functional punctuation: black text on near-white surfaces, hairline gray borders everywhere, and saturated chromatic blocks that mark emphasis, group information, and create visual rhythm across an otherwise monochrome grid.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Blue | `#1871da` | Brand blue — decorative color blocks, icon fills, secondary borders, and the blue-tinted shadow that gives elevation its on-brand cast |
| Pulse Green | `#1ec072` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Hot Pink | `#f6609f` | Vivid pink — decorative strokes, confetti blocks, and gradient underline washes |
| Cotton Candy | `#ffb4ed` | Pink action color for filled buttons, selected navigation states, and focused conversion moments. |
| Solar Yellow | `#ffbb38` | Yellow accent — confetti blocks, gradient underlines, and warm decorative surfaces |
| Ember Orange | `#ff5500` | Orange accent — decorative fills, strokes, and secondary button surfaces |
| Forest Moss | `#31805a` | Deep green — heading text color, card backgrounds, and muted button surfaces that need an earthy chromatic weight |
| Tangerine | `#ffa724` | Warm orange — button backgrounds and body accent fills, slightly softer than Ember Orange |
| Ultraviolet | `#9664d7` | Purple accent — rare chromatic punctuation for buttons and decorative fills |
| Deep Iris | `#0c4cbe` | Dark blue border — used for emphasis borders that need more weight than Signal Blue |
| Azure | `#1f86ff` | Lighter blue border — paired with Deep Iris in decorative border compositions |
| Alert Red | `#c60808` | Red action color for filled buttons, selected navigation states, and focused conversion moments. Use as a supporting accent, not as a status color |
| Deep Moss | `#1c372a` | Dark text/footer — near-black with a green undertone, used for footer backgrounds and deep heading text |
| Concrete | `#e5e7eb` | Hairline border — the dominant neutral border color, appearing on virtually every element |
| Obsidian | `#000000` | Primary text and filled CTA — all body and heading text, plus filled button backgrounds |
| Paper | `#ffffff` | Card and nav surface — opaque white for cards, navigation bar, and button text |
| Carbon | `#101516` | Dark surface — footer background and inverted dark blocks, near-black with a slight teal undertone |
| Mist | `#f7f7f7` | Subtle background — off-white fill for sections that need separation from Paper without a visible border |
| Pebble | `#bec6cc` | Secondary border — slightly darker than Concrete for borders that need more weight |
| Ash | `#cccccc` | Border and shadow base — mid-gray borders and shadow midtones |
| Smoke | `#d7d7d7` | Background wash — light gray fill for inactive states and subtle surface differentiation |
| Stone | `#999999` | Icon border — medium gray for icon outlines that recede behind content |
| Graphite | `#262d2f` | Dark card surface and stroke — deep neutral for inverted cards and decorative strokes |
| Iron | `#666666` | Muted text and icon fill — secondary text color, icon fills, and decorative strokes |
| Slate | `#808080` | Tertiary border and shadow — mid-gray for low-emphasis borders and shadow accents |

## Typography

### Neue Haas Grotesk Display — Primary typeface — the editorial voice of the brand. Drives the 244px display headline that defines the hero, all headings down to 14px nav links. The extreme range from 244px to 14px in a single family creates visual cohesion: one geometric grotesque doing everything from poster-scale headlines to micro-labels.
- **Substitute:** Inter (closest free alternative), Helvetica Neue, or Suisse Int'l
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14, 16, 20, 24, 32, 36, 56, 64, 244
- **Line height:** 1.00, 1.07, 1.11, 1.20, 1.25, 1.30, 1.33, 1.40, 1.43, 1.50
- **Letter spacing:** 0.0100em to 0.0570em — tracking stays positive even at display sizes, an unusual choice that keeps the massive 244px headline from feeling condensed and preserves breathing room at all scales

### Inter — Secondary typeface — handles compact UI chrome: fine-print body text, captions, tabular data, and icon-adjacent labels below 16px. Frees the primary face to own the editorial moments.
- **Substitute:** System UI sans-serif (SF Pro, Segoe UI)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9, 10, 12, 14, 16
- **Line height:** 1.25, 1.33, 1.43, 1.50
- **Letter spacing:** 0.0250em
- **OpenType features:** `"calt" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.3px |
| body-sm | — | — | 14px | 1.43 | 0.35px |
| body | — | — | 16px | 1.5 | 0.4px |
| subheading | — | — | 20px | 1.33 | 0.5px |
| heading-sm | — | — | 24px | 1.25 | 0.6px |
| heading | — | — | 32px | 1.2 | 0.8px |
| heading-lg | — | — | 56px | 1.07 | 1.4px |
| display | — | — | 64px | 1.07 | 1.28px |
| display-xl | — | — | 244px | 1 | 2.44px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 6px
- **icons:** 2px
- **buttons:** 9999px
- **large-buttons:** 100px

## Components

### Editorial Display Headline
**Role:** Hero and section-defining headlines

Neue Haas Grotesk Display at 244px, weight 600, line-height 1.0, letter-spacing 0.01em. Renders in Obsidian (#000000). The extreme size is the brand's signature — it transforms headings from text into posters. Pair with a smaller-weight subtitle at 24-32px to create the editorial 'headline + dek' structure.

### Confetti Color Block
**Role:** Decorative geometric rectangles scattered across the canvas

Solid-filled rectangles in Signal Blue (#1871da), Pulse Green (#1ec072), Hot Pink (#f6609f), Solar Yellow (#ffbb38), and Cotton Candy (#ffb4ed). Zero border-radius (sharp 0px edges), various sizes from 40px to 200px, positioned absolutely or in a grid. These are the Bauhaus confetti — they carry visual rhythm without representing any data.

### Pill Navigation Link
**Role:** Top navigation bar items

Neue Haas Grotesk 14px, weight 500, Obsidian text. 8px vertical padding, 12px horizontal padding. No visible border or background. Sits directly on the white nav bar with 16px gaps between items. The 'Sign Up' variant is a filled black pill with white text.

### Filled Black CTA Button
**Role:** Primary call-to-action — the only filled button style

Obsidian (#000000) background, Paper (#ffffff) text, 9999px border-radius (fully pill-shaped), 12px vertical padding, 24px horizontal padding. Neue Haas Grotesk 16px weight 500. Includes a right arrow (→) glyph for directional actions. This is the system's only CTA — there is no chromatic filled button variant.

### Ghost Text Link
**Role:** Inline links and secondary navigation

Neue Haas Grotesk 16px weight 500, Obsidian text, no background or border. Underline appears on hover only. The 'Login' link in the nav uses this style — it sits alongside the filled 'Sign Up' pill to create a quiet/loud pair.

### Highlighted Body Text
**Role:** Emphasized words within body copy

Body text (16px Neue Haas Grotesk 400) with selected words wrapped in a Cotton Candy (#ffb4ed) background fill. The highlight extends slightly beyond the text bounds (2-4px padding) with no radius. This is the editorial 'marker pen' effect — it makes key phrases scannable without changing text color.

### Gradient Underline Accent
**Role:** Decorative underline beneath headings or links

A 20px-tall horizontal line that fades from a solid chromatic color to transparent: Hot Pink (#f6609f), Pulse Green (#1ec072), or Solar Yellow (#ffbb38). Rendered as a pseudo-element with a linear-gradient (solid 20px → transparent). Sits 4px below the text it accompanies.

### Elevated Card
**Role:** Content cards for features, pricing, and data panels

Paper (#ffffff) background, 6px border-radius, 1px Concrete (#e5e7eb) border, 24px padding. Optional multi-layer soft shadow (45px/68px spread at 1% opacity, cascading to 3px/4px at 4% opacity) for cards that need to float above the canvas. Zero or minimal shadow for cards on flat sections.

### Icon Container
**Role:** Small icon backgrounds for feature lists and nav

2px border-radius (near-sharp), 16-20px padding, filled with a chromatic accent color or Concrete gray. Icons inside are 16-20px, rendered in Paper white or Obsidian. The sharp 2px radius contrasts deliberately with the 9999px pill buttons to create geometric tension.

### Dark Footer
**Role:** Site footer

Carbon (#101516) background, Paper (#ffffff) text, Deep Moss (#1c372a) as a secondary surface tone. 64px vertical padding. Links in 14px Neue Haas Grotesk 400. The only dark surface on the page — it creates a strong terminal band.

### Section Divider Band
**Role:** Visual separation between page sections

Full-width horizontal band in a chromatic accent color (Pulse Green, Hot Pink, Solar Yellow) or Mist (#f7f7f7), 8-16px tall. Acts as a color-coded section break without using a visible border line.

### Navigation Bar
**Role:** Sticky top navigation

Paper (#ffffff) background, 1px Concrete (#e5e7eb) bottom border, 16px vertical padding. Logo (Composer wordmark) on the left, nav links centered, Login + Sign Up on the right. Sticky on scroll. The border-bottom is the only structural divider — the nav itself is borderless on three sides.

## Do's and Don'ts

### Do
- Use 9999px border-radius for all interactive elements that are buttons, tags, or nav items — the pill shape is non-negotiable.
- Let the display headline reach 244px when it needs to own the page; don't constrain editorial moments to 48-64px.
- Deploy confetti color blocks as geometric composition elements — zero radius, solid fills, scattered across the gray canvas in Signal Blue, Pulse Green, Hot Pink, Solar Yellow, and Cotton Candy.
- Use the blue-tinted shadow (rgba(24, 113, 218, 0.25)) for focus rings and brand-flavored elevation — never use a neutral gray shadow when the blue cast is available.
- Set body text and headings in Obsidian (#000000) on Paper (#ffffff) or Concrete (#e5e7eb) — the 21:1 contrast ratio is the system's safety floor.
- Use the Cotton Candy (#ffb4ed) highlight background on emphasized words within body copy to create editorial scannability without changing text color.
- Keep letter-spacing positive at all sizes including display — 0.01em to 0.057em — the airy tracking distinguishes this system from condensed editorial type.

### Don't
- Don't create a chromatic filled CTA button — the only filled button is Obsidian (#000000). Color is for decoration, not action.
- Don't use shadows on flat sections — cards on the Concrete canvas should rely on 1px Concrete borders, not elevation, to maintain the Swiss-editorial flatness.
- Don't set body text below 14px or above 16px — the 14-16px band is where the secondary Inter face takes over from Neue Haas Grotesk.
- Don't apply border-radius larger than 6px to cards or containers — the 2px (icons) and 6px (cards) are the system; 9999px is reserved for buttons and tags only.
- Don't use more than three chromatic accent colors in a single composition — the confetti effect works because each color is isolated, not blended.
- Don't substitute the blue-tinted shadow with a neutral shadow on interactive elements — the brand cast at rgba(24, 113, 218, 0.25) is what makes focus states feel on-system.
- Don't set the display headline below 56px or use negative letter-spacing at any size — the positive tracking (0.01em minimum) preserves the editorial breathing room.

## Elevation

- **Brand-tinted focus ring:** `0 1px 2px 0 rgba(24, 113, 218, 0.25)`
- **Elevated card (subtle):** `45px 68px 33px 0 rgba(0,0,0,0.01), 25px 38px 27px 0 rgba(0,0,0,0.02), 11px 17px 20px 0 rgba(0,0,0,0.03), 3px 4px 11px 0 rgba(0,0,0,0.04)`
- **Elevated card (strong):** `54px 82px 39px 0 rgba(31,33,35,0.03), 31px 46px 33px 0 rgba(31,33,35,0.09), 14px 20px 24px 0 rgba(31,33,35,0.15), 3px 5px 13px 0 rgba(31,33,35,0.18)`

## Surfaces

- **Concrete** (`#e5e7eb`) — Page canvas — the dominant light gray background that unifies the entire page
- **Paper** (`#ffffff`) — Card and nav surface — opaque white that lifts elements off the gray canvas
- **Mist** (`#f7f7f7`) — Subtle fill — near-white for sections that need tonal separation without a hard border
- **Graphite** (`#262d2f`) — Dark elevated card — for inverted content blocks and data-dense panels
- **Carbon** (`#101516`) — Deepest surface — footer and dark-mode-adjacent blocks

## Imagery

The site has no photography or illustration. Visual language is built entirely from typography, flat color blocks, and geometric composition. The 'confetti' rectangles in Signal Blue, Pulse Green, Hot Pink, Solar Yellow, and Cotton Candy function as the only graphic elements — they read as Bauhaus information shapes rather than decoration. Icons are minimal, rendered in 2px-radius containers with solid chromatic fills. No product screenshots, no lifestyle photography, no 3D renders. The restraint is total: the display type and color blocks do all the visual work.

## Layout

Full-bleed layout with no max-width container on the hero — the gray Concrete canvas extends edge-to-edge, and the confetti blocks scatter beyond any column boundary. Below the fold, content contracts to a 1200px max-width centered column. The hero is a split composition: left-aligned text block (headline + subhead + CTA) occupying roughly 40% of the width, with the display headline bleeding into the right 60% where the confetti blocks cluster. Sections are separated by full-width chromatic divider bands (8-16px tall) rather than whitespace gaps. Feature sections use 3-column card grids. The footer is a full-width dark band (Carbon) that extends edge-to-edge.

## Similar Brands

- **Stripe** — Same editorial display typography approach — massive sans-serif headlines on light canvas, hairline gray borders, and color used sparingly for functional emphasis rather than decoration
- **Replit** — Same playful maximalist color deployment — vivid chromatic rectangles and shapes scattered across a light background, treating color as geometric information rather than UI chrome
- **Linear** — Same sharp-vs-pill geometric tension — crisp 2px icon edges and 6px cards alongside fully pill-shaped buttons, with near-white surfaces and hairline borders as the connective tissue
- **Pitch** — Same Swiss-editorial typography attitude — Neue Haas-adjacent grotesque at display sizes with positive letter-spacing, light canvas, and color blocks that feel like Bauhaus information shapes
- **Ramp** — Same compact density and pill-button-only interaction model — filled black CTAs, ghost text links, and a single brand accent color deployed as decoration rather than action
