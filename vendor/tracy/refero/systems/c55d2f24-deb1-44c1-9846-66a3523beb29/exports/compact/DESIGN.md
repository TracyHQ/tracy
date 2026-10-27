# Codex.io — Style Reference
> Citrine beacon in void — a glowing lime cube anchoring a dark room, with thin white type and scattered node rings floating around it.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Codex.io speaks in a single dramatic gesture: a luminous citrine cube floating in deep carbon void, surrounded by orbiting blockchain nodes. The interface is almost entirely dark with one electric lime accent (#e5ff5d) that does all the chromatic work — primary actions, icon strokes, decorative cubes, brand marks. Typography is a single humanist sans (Neue Haas Grotesk) set with confident, slightly tight tracking, where 80px display headlines occupy entire rows and small labels earn positive tracking. The page oscillates between dense dark sections packed with constellation diagrams and one cream reversal where giant translucent cubes frame a centered message. Every screen should feel like looking into a server room through a viewport — dark, quiet, punctuated by one bright signal.

## Colors

| Name | Value | Role |
|------|-------|------|
| Citrine Signal | `#e5ff5d` | Primary action buttons, brand cube fills, accent icon strokes, decorative 3D cubes, featured logo marks — the single chromatic voice of the system |
| Carbon Black | `#111111` | Page canvas, primary text on light sections, dominant border color, button fills on reversed (light) sections |
| Bone White | `#f9f9f9` | Primary text on dark canvas, nav and body text, light icon fills, ghost button text |
| Graphite | `#2b2b2b` | Elevated surface above carbon, secondary panels, darker card variants |
| Ash | `#6e6e6e` | Muted card surface, tertiary background layers behind content blocks |
| Stone | `#9c9c9c` | Muted body text, secondary link text, low-priority borders, helper labels |
| Smoke | `#565656` | Dividers, subtle borders, decorative strokes in illustrations |
| Chalk | `#d6d6d6` | Card borders on dark sections, hairline dividers between content blocks |
| Cream Paper | `#eeeeee` | Light section background — the single warm reversal that breaks the dark rhythm |
| Pure Black | `#000000` | Maximum contrast text, logo silhouettes, hard-edge decorative fills |
| Sand | `#b7b3a2` | Warm-tinted decorative fills, illustration accents — the only chromatic neutral |

## Typography

### Neue Haas Grotesk Text — Sole typeface across the entire system. Weight 400 carries body, nav, and most UI; weight 500 reserved for emphasized labels and button text. Display headlines at 80px with 0.90 line-height create the signature monolithic rows. Small labels (10–12px) use positive tracking (+0.020 to +0.032em) to read as uppercase utility marks. The humanist geometry of Haas Grotesk — slightly humanist terminals, even stroke contrast — gives the dark interface a warm, editorial quality rather than feeling like a terminal.
- **Substitute:** Inter, Söhne, Neue Haas Grotesk Display
- **Weights:** 400, 500
- **Sizes:** 10, 12, 16, 20, 24, 80
- **Line height:** 1.20–1.50 body, 0.90 display, 1.30 subhead
- **Letter spacing:** -0.01em at 80px display, 0em at 16–24px body, +0.020 to +0.032em at 10–12px utility labels
- **OpenType features:** `"kern" on, "liga" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| utility-label | — | — | 10px | 1.5 | 0.32px |
| caption | — | — | 12px | 1.5 | 0.24px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subhead | — | — | 20px | 1.3 | 0px |
| heading-sm | — | — | 24px | 1.2 | -0.24px |
| heading | — | — | 48px | 1.1 | -0.48px |
| display | — | — | 80px | 0.9 | -0.8px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24-32px
- **Element gap:** 16-24px

### Border Radius

- **nav:** 8px
- **cards:** 12px
- **pills:** 9999px
- **buttons:** 4px
- **decorative:** 20px

## Components

### Citrine Primary Button
**Role:** Main call-to-action across the site

Filled #e5ff5d background, #111111 text, 4px radius, padding 12px 24px. Neue Haas Grotesk Text 500 at 16px. Includes a small left-side pixel icon. The lime against carbon creates the highest-attention signal in the system — use sparingly, never more than one per viewport.

### Dark Primary Button
**Role:** Primary action on the cream/light reversal section

Filled #111111 background, #f9f9f9 text, 4px radius, padding 12px 24px. Inverted counterpart to the Citrine Primary. The lime accent shifts to a small left-side pixel glyph (citrine or dark depending on section) so the action always carries a brand seed.

### Ghost Button
**Role:** Secondary action, paired with primary

Transparent background, #f9f9f9 1px border on dark sections / #111111 border on light, uppercase Neue Haas 500 at 12px with +0.032em tracking, 4px radius, 10px 20px padding. Reads as a utility chip rather than a competing CTA.

### Navigation Bar
**Role:** Top-level site navigation

Transparent on dark canvas. Left: CODEX wordmark in #f9f9f9 weight 500 at 20px, tracking 0.027em. Center-right: nav links (PRODUCT, PRICING, CUSTOMERS, COMPARE, AGENTS, DOCS) in Neue Haas 500 at 12px with +0.027em tracking, #f9f9f9, separated by 32px. Right: Citrine Primary Button. 8px radius on the nav container.

### Citrine Cube
**Role:** Brand signature element — 3D glowing cube

Translucent lime cube (#e5ff5d with internal gradient highlights suggesting volume) rendered as a 3D isometric block. Appears in hero (centered above headline), in the constellation diagram (as central node), and in the cream reversal (as large 3–4 cube cluster framing content). Cube edges glow — this is the only place gradients, light, and dimensionality live in the system.

### Constellation Network Diagram
**Role:** Visual showing multi-chain coverage

Central Citrine Cube with 12–16 blockchain node icons arranged in a radial ring around it. Each node is a 40px circle with a dark fill, lime or white chain-icon inside, connected to the center by thin dashed #565656 lines. Demonstrates the '80+ networks' positioning through visual geometry rather than a list.

### Node Icon Ring
**Role:** Reusable container for chain/crypto icons

40px circle with 1px #2b2b2b border on dark, or #d6d6d6 on light. Icon centered, 20px, in lime or white. Used scattered in the hero, in constellation diagrams, and in feature illustrations.

### Display Headline
**Role:** Hero and section-level titles

Neue Haas Grotesk Text 400 at 80px, line-height 0.90, letter-spacing -0.01em, #f9f9f9 on dark, #111111 on light. Text-transform: uppercase. The tight leading and large size make 4 lines of text fill the entire viewport. Weight 400 (not 700) is the signature choice — it whispers rather than shouts, letting the green cube do the shouting.

### Section Heading
**Role:** Mid-level section titles

Neue Haas 500 at 24px, line-height 1.20, #f9f9f9 on dark. Used to label secondary explanations and feature blocks.

### Body Text
**Role:** Paragraph copy and descriptions

Neue Haas 400 at 16px, line-height 1.50, #f9f9f9 for primary body, #9c9c9c for muted/helper. Comfortable reading width max 560px within content columns.

### Feature Pill
**Role:** Small utility tags highlighting capabilities

Compact label: uppercase Neue Haas 500 at 10–12px with +0.032em tracking, #e5ff5d text, optional 4px radius background. Used in rows like 'TRADING-READY · SUB-SECOND · ALL-IN-ONE' with a small lime dot/icon prefix.

### Logo Cloud Row
**Role:** Social proof — customer brand marks

Two centered rows of monochrome white logos on the carbon canvas. Logos at 60% opacity, #f9f9f9 fill, evenly spaced via flex with 48px column gap. No card backgrounds — logos float directly on the dark canvas.

### Split Feature Block
**Role:** Two-column explanation with text left, visual right

Text column (40% width) with heading + 2 body paragraphs left-aligned. Visual column (60%) centered, containing constellation or cube illustration. 80px column gap, vertically centered. Dark background, #f9f9f9 text.

### Reversal Band
**Role:** Light section that breaks the dark rhythm

Full-width #eeeeee background band with large 3D Citrine Cubes floating at far left and right edges (3–4 cubes each, slight rotation, overlapping). Centered content stack: display headline at 80px #111111, subheading at 16px #9c9c9c, CTA row (dark button + ghost button). 80px top/bottom padding.

## Do's and Don'ts

### Do
- Use #e5ff5d (Citrine Signal) for exactly one primary action per viewport and let the Citrine Cube carry the brand mark everywhere else
- Set display headlines at 80px Neue Haas 400, line-height 0.90, uppercase — the whisper-weight on massive type is the system's signature voice
- Use 4px radius for all interactive elements (buttons, nav items, tags) and 12px for cards — never round buttons into pills
- Apply +0.027 to +0.032em letter-spacing to all 10–12px uppercase utility labels to read as terminal/UI marks rather than prose
- Break the dark rhythm with exactly one cream (#eeeeee) reversal band per major page — the brightness reset is the page's dramatic beat
- Connect nodes in constellation diagrams with thin dashed #565656 lines — the network topology IS the content, not decoration
- Keep all imagery iconographic and monochrome (white or lime) — never introduce photography, gradients, or decorative illustrations

### Don't
- Do not use a second chromatic accent — the system's power comes from single-color discipline; adding blue, red, or purple destroys the signal-to-noise ratio
- Do not set display headlines in weight 700 or 600 — the 400 weight at 80px is the signature; bolding makes it generic
- Do not use pill-shaped (9999px) buttons — the 4px radius is sharp and architectural, pills would feel consumer/cute
- Do not place content on rounded card backgrounds with shadows — everything sits flat on the carbon canvas or the cream reversal, no nesting
- Do not use multiple shades of lime for hover/active states — the green is binary (on/off); rely on opacity shifts and surface steps for state changes
- Do not introduce more than one light band per page — stacking light sections dilutes the reversal's impact
- Do not use photography, lifestyle imagery, or human faces — the system is abstract infrastructure, not a consumer product

## Elevation

- **Nav container:** `none — sits flat on canvas`
- **Citrine Primary Button:** `none — flat color, no shadow`
- **Cards:** `none — relies on color step from canvas to surface`
- **Citrine Cube:** `inner gradient + outer glow (rgba(229,255,93,0.15) 0 0 40px) to simulate light emission`

## Surfaces

- **Carbon Canvas** (`#111111`) — Page base — majority of the experience lives here
- **Graphite Panel** (`#2b2b2b`) — Elevated cards and panels sitting on the carbon canvas
- **Ash Plate** (`#6e6e6`) — Muted secondary surfaces, logo cloud backgrounds
- **Cream Reversal** (`#eeeeee`) — Light section — the single bright band that resets the eye

## Imagery

No photography anywhere. The visual language is entirely constructed from: (1) the 3D Citrine Cube — the brand's hero object, rendered as a translucent isometric block with internal gradient highlights and soft outer glow, (2) blockchain node icons in circular frames, arranged in constellation/ring patterns, (3) thin dashed connector lines between nodes suggesting network topology. The aesthetic is abstract data-visualization rather than illustrative — icons feel like terminal glyphs, not friendly illustrations. All imagery lives on pure canvas (no card containers, no rounded masks) and uses the lime accent sparingly for emphasis. Color treatment is strictly limited: lime for the cube and accent icons, white for everything else. The single light section (cream reversal) introduces large cube clusters as the only compositional change.

## Layout

Max-width 1280px, centered. The page is a vertical stack of full-width bands, most of them dark with 80px vertical section padding. The hero is a centered headline-over-cube composition with scattered node icons orbiting the cube — the cube sits above the headline text, not behind it. Below the hero, a centered logo cloud band with no background change. The second section is a 2-column split: text left (40%), constellation visual right (60%), both vertically centered. The third section is a centered reversal — cream background, large cubes at left/right edges, headline and CTA stacked in the center column. Navigation is a flat top bar with no background fill. The rhythm is: DARK HERO → DARK LOGO CLOUD → DARK FEATURE → LIGHT REVERSAL → (DARK CONTINUES). Grid usage is minimal — most content is centered stacks or 2-column splits, no card grids.

## Similar Brands

- **Helius** — Same dark canvas blockchain API positioning with single vivid accent color and constellation-style multi-chain diagrams
- **Alchemy** — Dark infrastructure API with restrained typography, monochrome surfaces, and minimal accent color discipline
- **Chainbase** — Blockchain data API with similar dark-mode layout, single neon accent, and network-topology visualizations
- **Messari** — Dark crypto-data platform with humanist sans typography, uppercase utility labels with positive tracking, and monochrome logo clouds
- **Privy** — Crypto infrastructure brand using dark canvas, single saturated accent for CTAs, and minimal decorative imagery
