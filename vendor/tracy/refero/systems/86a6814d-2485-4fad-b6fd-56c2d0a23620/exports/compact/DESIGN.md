# Square — Style Reference
> blue signal on white steel.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Square's design system is a confident, white-canvas fintech language that lets one vivid blue do all the talking. The interface stays nearly monochrome: white surfaces, a soft gray page background, near-black text, and a single Signal Blue (#006aff) that punctuates CTAs, links, and the subscription form. Headlines lean on a geometric custom display face at near-display sizes (50–86px) with tight line-heights and negative tracking, creating a weight-of-restraint authority rather than shouting. Components are flat and minimal — a 4px-cornered filled button, a ghost variant, light-blue tinted feature cards with 24px image radii, and a single hard-edged dark footer band that flips the palette to black with white type and the same blue for the send button. Elevation is essentially absent: a 1px 16% black shadow on buttons is the only depth the system allows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Blue | `#006aff` | Primary CTAs, link text, active nav, submit buttons, icon accents — the sole chromatic voice in an otherwise achromatic system |
| Carbon | `#1a1a1a` | Primary text, heading fills, dark icon strokes, nav labels — near-black that reads softer than pure black on white |
| Slate Gray | `#737373` | Secondary text, helper copy, muted nav, input placeholder tone |
| Platinum | `#d9d9d9` | Hairline borders, input outlines, subtle dividers between sections |
| Ash | `#b3b3b3` | Disabled text, tertiary metadata, very subtle structural lines |
| Cloud | `#f2f2f2` | Page canvas beneath white cards, soft section background, muted surface |
| Paper | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Obsidian | `#030303` | Dark footer section background, inverted surfaces — the only break from white |
| True Black | `#000000` | Icon fills, monochrome graphic elements, SVG illustration strokes |

## Typography

### Square Sans Display VF — Headlines and large display copy at 32–86px; the display weight (regular 400) at display sizes is a signature choice — most fintechs push 600–700 at this scale, Square uses the lighter weight with negative tracking to feel architectural rather than aggressive. System substitute: Inter Tight or Manrope at matching tracking.
- **Substitute:** Inter Tight
- **Weights:** 400, 500
- **Sizes:** 16, 20, 24, 32, 50, 62, 86
- **Line height:** 0.97, 1.10, 1.12, 1.19, 1.25, 1.30, 1.33, 1.42, 1.50
- **Letter spacing:** -0.0120em
- **OpenType features:** `"ss01" on`

### Square Sans Text VF — Body copy, nav labels, footer text, card descriptions at 12–16px with relaxed 1.5–1.75 line-height for legibility. The same family as the display face keeps the text voice continuous — the only difference is size and tracking. System substitute: Inter or Söhne.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16
- **Line height:** 1.38, 1.43, 1.50, 1.71, 1.75, 2.00, 2.63

### Cash Sans — Button labels and in-line CTA microcopy at 18px medium — a distinct text face for actions so they read as tappable artifacts separate from body copy. Substitute: same family as text at 500 weight, or DM Sans Medium.
- **Substitute:** DM Sans Medium
- **Weights:** 500
- **Sizes:** 18
- **Line height:** 1.00, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.3 | — |
| heading-sm | — | — | 24px | 1.25 | -0.29px |
| heading | — | — | 32px | 1.19 | -0.38px |
| heading-lg | — | — | 50px | 1.1 | -0.6px |
| display | — | — | 62px | 1 | -0.74px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 10-15px

### Border Radius

- **icons:** 32px
- **images:** 24px
- **inputs:** 4px
- **buttons:** 4px
- **pillButtons:** 20px

## Components

### Primary Filled Button
**Role:** Main CTA across hero, feature cards, footer form

Solid Signal Blue (#006aff) background, white text in Cash Sans 18px medium, 4px corner radius, 10px vertical × 15px horizontal padding. Carries a single subtle shadow rgba(0,0,0,0.16) 0 1px 4px — the only elevation the system grants any component. No hover state color shift, no border.

### Ghost Outlined Button
**Role:** Secondary action alongside the primary

Transparent fill, 1px Signal Blue (#006aff) border, Signal Blue text in Cash Sans 18px, 4px radius, 10px × 15px padding. Always pairs horizontally with a filled primary button on the same baseline.

### Header Nav
**Role:** Top-level site navigation

White background, logo left (Carbon mark + Square wordmark), nav links in Square Sans Text 14px Carbon, right-aligned secondary actions. No visible bottom border; sits on white and reads through whitespace rather than a divider line.

### Hero Headline Block
**Role:** Primary above-the-fold message

Square Sans Display 62px / 1.0 line-height, Carbon (#1a1a1a), tracking -0.012em. Sub-copy at Square Sans Text 16px Slate Gray (#737373) sits ~18px below. Two-button row at 10px gap. Left-aligned, paired with a 24px-radius editorial photograph on the right.

### Feature Card
**Role:** Three-column solution overview

White card with a very light blue (Signal Blue at ~8% opacity) background fill, 24px image radius for the leading visual, 24px internal padding, 20px gap between image and headline. Title in Square Sans Display 24px Carbon, body in Square Sans Text 16px Carbon/Slate, bottom link in Signal Blue 16px with → arrow.

### Inverted Footer Section
**Role:** Email capture and contact band at page bottom

Full-bleed Obsidian (#030303) background, white headline in Square Sans Display 50px, Signal Blue link row directly beneath. Email input is 4px radius white field with Carbon text and a Signal Blue filled 'Enviar' button attached. White icon trio (mail, paper plane, smiley) at 32px render size on the right.

### Email Input with Attached Submit
**Role:** Newsletter capture inside the dark footer

White Paper (#ffffff) input field, 4px radius, Carbon text at Square Sans Text 16px, Slate Gray placeholder, no visible border. Signal Blue submit button flush against the right edge of the field, same 4px radius, white 'Enviar' label in Cash Sans 18px.

### Section Heading with Link
**Role:** Subsection introductions (e.g. 'Empieza a vender al instante')

Square Sans Display 50px / 1.10 Carbon, with a Signal Blue 16px link directly below prefixed by a small arrow or '→'. Heading and link share the same left-alignment axis; no decorative rules.

### Lifestyle Photography Block
**Role:** Hero image and card imagery

Full-bleed editorial photography with 24px corner radius on card contexts, sharp edges on hero. Warm, naturalistic, real-customer scenes — hands, devices, food, retail counters. No duotone, no overlay tint, no graphic treatment.

## Do's and Don'ts

### Do
- Use Signal Blue (#006aff) as the only chromatic element in the system — never introduce a second brand color, secondary accent, or decorative gradient.
- Set headlines in Square Sans Display at 400 weight with -0.012em tracking; use 50–86px sizes with line-heights between 1.0 and 1.19 so type feels architectural, not bulky.
- Give all editorial and card imagery a 24px corner radius; let hero photographs bleed edge-to-edge only on full-bleed sections.
- Pair every filled primary button with a ghost outlined variant of the same label, separated by a 10px gap, on a shared baseline.
- Use 4px radius for all buttons, inputs, and nav elements; reserve 20px exclusively for pill-shaped button variants and 32px for icon containers.
- Let cards lift off the page through the #ffffff on #f2f2f2 surface contrast — never add a drop shadow to a card or panel.
- Use Cash Sans 18px medium for every button label so actions read as a distinct typographic register from body copy.

### Don't
- Don't use Carbon (#1a1a1a) for button backgrounds — buttons are always Signal Blue filled, ghost blue outlined, or white-on-dark in the footer.
- Don't add drop shadows to cards, feature panels, or images — the only shadow allowed is the 1px 16% black on filled buttons.
- Don't use 600 or 700 weight on display headlines; the system relies on 400 weight at large sizes with negative tracking for its visual voice.
- Don't introduce semantic colors (green for success, red for error) into the neutral-by-default interface — accent is blue only.
- Don't break the white canvas with decorative gradients, colored section bands, or pattern fills — let the dark Obsidian footer be the single chromatic inversion.
- Don't use border-radius values outside the four-token set (4, 20, 24, 32) — inconsistent radii fragment the geometric discipline.
- Don't use letter-spacing on body copy; tracking adjustments are reserved for display sizes 24px and above.

## Elevation

- **Primary Filled Button:** `rgba(0, 0, 0, 0.16) 0px 1px 4px 0px`

## Surfaces

- **Page Canvas** (`#f2f2f2`) — Subtle off-white base that lets pure white cards lift off the page
- **Card Surface** (`#ffffff`) — Primary content surface for hero, feature cards, inputs, nav
- **Inverted Footer** (`#030303`) — Full-bleed dark band at page bottom for email capture and social

## Imagery

Photography-led visual language: warm, naturalistic editorial scenes of merchants and customers interacting with phones and card readers. High-key lighting, candid hands-and-objects framing (fries on green paper, wooden tables, counter tops), no staged studio polish. Images are tightly cropped to human moments and devices, never wide environmental shots. No illustration, no 3D renders, no abstract graphics. Images sit in 24px-radius frames inside feature cards and bleed sharp-edged into the hero. The photography is the only source of warmth and color in the system — the UI itself is intentionally cold and minimal so the imagery feels like sunlight in a steel room.

## Layout

Max-width ~1200px centered container with generous horizontal padding. Hero is a two-column split: left-aligned headline + dual-button stack on roughly 45% width, right-aligned 24px-radius editorial photograph on 55%. Below the hero, a three-column equal-width feature card grid with ~24px gutters, each card stacking image → headline → body → blue link vertically. The page ends with a full-bleed dark footer band that spans edge to edge, breaking the centered grid. Vertical rhythm is comfortable and unhurried — roughly 96px between major sections, 10–15px between elements within a block. Navigation is a single white top bar, not sticky, not shadowed. No sidebar, no mega-menu — links are flat horizontal text.

## Similar Brands

- **Stripe** — Same single-accent-on-white approach with one bold blue and a custom geometric display face at large sizes for headlines
- **Linear** — Shares the restrained typographic voice — weight 400 at display sizes, tight tracking, one accent color doing all the work on a clean light canvas
- **Plaid** — Same fintech editorial photography (hands, devices, real merchants) paired with minimal white UI and a single chromatic link/accent color
- **Notion** — Similar near-black text (#1a1a1a) on white, minimal shadow discipline, and feature cards with soft surface tints instead of elevation
