# Roberta's Pizza — Style Reference
> Brooklyn pizza punk parlor — a checkered tablecloth lit by neon red signage, where every screen is a poster.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Roberta's runs on a near-monochromatic system anchored by white canvas and charcoal type, with vivid red deployed as a single loud punctuation color for primary actions, social-proof walls, and signature brand moments. The type system pairs a quirky tracked-out sans (Offset TM) for body, UI labels, and most controls with a condensed display face (Borensa) that takes over at 80–120px for headlines that shout from full-bleed sections. Layouts are unapologetically full-bleed: a video hero, a red 'Get Social' wall, a centered text-and-CTA stack — with content rhythm set by generous vertical breathing room and a decorative vocabulary of checkered borders, star bands, polaroid frames, and hand-drawn skull and pizza-slice iconography borrowed from Italian-American diner signage and zine culture. Buttons sit flat without elevation on the filled state; the only shadow in the system is a hard, 4px-offset drop on secondary links, deliberately retro rather than soft-modern.

## Colors

| Name | Value | Role |
|------|-------|------|
| Roberta Red | `#ed2023` | Primary filled CTAs, full-bleed social section background, logo wordmark, and any place the brand must shout — vivid red against white and charcoal creates urgency and warmth without aggression |
| Charcoal | `#2b2f36` | Primary text, body copy, dark CTA fill, hairline borders, icon strokes, image borders — the structural neutral that carries 90% of the interface |
| Pure White | `#ffffff` | Page canvas, card surfaces, text on dark backgrounds, button text, badge backgrounds — the dominant neutral that gives the system its airy, poster-like feel |
| Pure Black | `#000000` | Input field borders and the deepest surface accent — used sparingly for the hardest possible contrast point on form elements |
| Shadow Gray | `#bfbfbf` | Supporting neutral for secondary UI, dividers, and muted labels. |

## Typography

### Offset TM — Workhorse sans for body, UI labels, buttons, navigation, and most headings up to 80px — a quirky custom face with 0.04em positive tracking that gives every line a slightly informal, sign-painter rhythm.
- **Substitute:** Space Grotesk, Outfit, or Familjen Grotesk (closest free analogues for the tracked geometric feel)
- **Weights:** 400
- **Sizes:** 14, 20, 22, 24, 34, 54, 80
- **Line height:** 1.0–1.5
- **Letter spacing:** 0.04em (applied as a constant ~0.8px at 20px and ~3.2px at 80px)

### Borensa — Condensed display face for oversized posters and the most aggressive headlines — sits at 80–120px with -0.02em tight tracking and aggressive line-height (~0.88) that lets the type stack into blocks; also used at 14–26px for micro-labels that need to feel editorial.
- **Substitute:** Anton, Bebas Neue, or Oswald (free condensed display alternatives)
- **Weights:** 400
- **Sizes:** 14, 22, 26, 80, 120
- **Line height:** 0.88–2.14
- **Letter spacing:** -0.02em (applied as -0.28px at 14px down to -2.4px at 120px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | 0.56px |
| body-sm | — | — | 16px | 1.5 | — |
| body | — | — | 20px | 1.5 | 0.8px |
| subheading | — | — | 24px | 1.3 | 0.96px |
| heading-sm | — | — | 34px | 1.25 | 1.36px |
| heading | — | — | 54px | 1.25 | 2.16px |
| heading-lg | — | — | 80px | 1.1 | 3.2px |
| display | — | — | 120px | 0.88 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 20-30px
- **Element gap:** 20-30px

### Border Radius

- **pills:** 9999px (from 16000px raw value)
- **buttons:** 7.2px
- **asymmetric:** 80px (for shapes that round two corners and square the other two)

## Components

### Filled Primary CTA (Red)
**Role:** Highest-priority action button — Order Delivery, About Roberta's, and any single dominant call on a page

Solid Roberta Red (#ed2023) fill, white text, Offset TM 14–16px uppercase, 7.2px corner radius, 18–20px horizontal padding, 25–30px vertical padding, no shadow. Sits on white, charcoal, or red surfaces; when placed on red it becomes a charcoal-on-red or white-on-red variant.

### Filled Secondary CTA (Charcoal)
**Role:** Secondary high-priority actions on light surfaces — Book a Table, Order Catering

Solid Charcoal (#2b2f36) fill, white text, Offset TM uppercase, 7.2px radius, 18–24px horizontal padding, 20–25px vertical padding. No shadow, flat surface.

### Outlined/Transparent CTA
**Role:** Tertiary action that must stay quiet — Order Frozen, Book a Table, Order Catering in the light nav

Transparent fill, 1px Charcoal or White border, Charcoal or White text in Offset TM uppercase, 7.2px radius, 18–24px horizontal padding. No shadow.

### Ghost Link with Hard Retro Shadow
**Role:** Text or icon links that need a hover lift — the only component in the system with elevation

Transparent or white fill, text or icon in Charcoal, on hover or active state receives the signature hard drop-shadow: rgba(0,0,0,0.25) 0px 4px 4px 0px. The shadow is deliberately un-blurred for a zine/screen-print feel.

### Navigation Bar (Light)
**Role:** Top-of-page navigation on interior sections

White background, 1px hairline Charcoal border, 30px horizontal padding. Houses the hamburger menu (left), centered nav text, and the CTA cluster (right). Optional checkered border band sits above as a decorative ribbon.

### Hero Video Container
**Role:** Full-bleed opening frame on the home page

100vw × ~70vh, autoplaying muted video background, Charcoal gradient overlay for legibility, hand-painted red 'Roberta's' wordmark centered, single filled red CTA in the top-right, three-button cluster (one filled charcoal, two outlined) anchored to the bottom center. 'PAUSE VIDEO' micro-label sits bottom-right in white.

### Centered Text Block with CTA
**Role:** Introductory copy sections — the menu description, the story

White background, single column of Offset TM 20–24px body text in Charcoal, max-width ~600px, centered. A single filled red CTA sits 20–30px below the last line. Followed by a decorative red star band.

### Decorative Star Band
**Role:** Section divider between content blocks

Full-bleed Roberta Red strip, 80–120px tall, repeating white 8-point star/starburst icons evenly spaced. Acts as a visual breath between text blocks.

### Checkered Border Ribbon
**Role:** Decorative top-and-bottom frame for interior sections — the retro Italian-American diner signature

Full-bleed band, ~30–40px tall, alternating white and Charcoal (or black) square tiles, no gap. Sits flush against the section above and below.

### Full-Bleed Social Wall
**Role:** Instagram/social-proof section — the loudest page moment

Roberta Red background, oversized Borensa white 'GET SOCIAL!' headline (80–120px) centered, hand-drawn white skull-and-crossbones and pizza-slice icons flanking the headline at the top corners, Instagram and Facebook icon links below the headline, a 5–7 image polaroid collage overlapping and slightly rotated along the bottom half. Each photo has a 4–8px white border and a hard 4px-offset charcoal shadow.

### Polaroid Photo Tile
**Role:** Single social photo in the collage

Square or 4:5 photo, 6–10px white border, 4–8° random rotation, hard 4px-offset shadow rgba(0,0,0,0.25). Photos overlap by 10–20px to form a zine-style spread.

### Hand-Drawn Brand Icon
**Role:** Decorative line illustrations — skull-and-crossbones, pizza slice, starburst

White stroke, 3–4px weight, no fill, hand-drawn slight imperfection. Used at 40–80px on red or dark backgrounds as visual punctuation. Not a functional UI icon — purely decorative.

### Input Field
**Role:** Form inputs for reservations and ordering

White background, 1px Pure Black border, 28px vertical padding, 18px horizontal padding, Offset TM 14–16px text in Charcoal, no radius or 4px radius. Focus state thickens the border to 2px.

### Hamburger Menu Button
**Role:** Primary navigation trigger on mobile and the hero

30×30px white container with 1px Charcoal border, 7.2px radius, three horizontal Charcoal bars inside. Positioned top-left in the hero, replaces the full nav on small viewports.

## Do's and Don'ts

### Do
- Use Roberta Red (#ed2023) exclusively for the single most important action on a surface and for full-bleed brand moments — never decorate with it
- Set headlines at 80–120px in Borensa with -0.02em tracking and 0.88 line-height so they stack into poster blocks
- Keep body, UI labels, and buttons in Offset TM at 14–24px with the constant 0.04em positive tracking — the looseness is the signature
- Use 7.2px radius on all rectangular buttons and 9999px (pill) for tags and the hamburger menu
- Apply the hard retro shadow rgba(0,0,0,0.25) 0px 4px 4px 0px only on hover/active link states — never as resting elevation
- Let sections go full-bleed (100vw) and stack content as centered single columns at 600–1200px max-width inside them
- Separate text sections with the red star band or the checkered border ribbon instead of relying on whitespace alone

### Don't
- Do not introduce any new color — the system is two neutrals plus one red; adding a fourth color breaks the poster logic
- Do not use soft blurred shadows (no 12px+ blur, no large spread) — the only shadow in the system is the hard 4px-offset retro drop
- Do not set Borensa below 22px for any visible text — at small sizes its condensed forms become illegible
- Do not center-align body copy longer than four lines — keep long-form text in a left-aligned measure or break it into shorter centered chunks
- Do not use the red CTA on a red background — switch to charcoal or white in that context to maintain contrast
- Do not add gradients, glassmorphism, or any decorative blur — the system is flat, printed, and zine-like
- Do not round all four corners to a pill shape on buttons — 7.2px is the button radius, 9999px is reserved for tags and the menu icon

## Elevation

- **Link / interactive tile (hover/active only):** `rgba(0, 0, 0, 0.25) 0px 4px 4px 0px`

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas and card surface — the base the system is printed on
- **Roberta Red** (`#ed2023`) — Full-bleed accent sections (social wall) and filled primary CTAs
- **Charcoal** (`#2b2f36`) — Dark CTA fill and any inverted panel
- **Pure Black** (`#000000`) — Input chrome and the deepest focal accents

## Imagery

Imagery is split between full-bleed video, photography, and hand-drawn line illustration. The hero is a muted-tone, slightly desaturated video of pizza being made — the dough and the sauce do the work, no lifestyle context. Social proof lives in a polaroid-style photo collage: candid restaurant and staff shots, customers eating, products held up close, each framed in white and slightly rotated. Decorative illustration is limited to a small vocabulary of white-stroked line icons — skull-and-crossbones, pizza slice, eight-point star — used as section punctuation on red and dark surfaces, never as functional UI. The color treatment across photography is warm and slightly muted; nothing is over-saturated. Checkered tile and starburst patterns function as graphic texture rather than image content.

## Layout

Page model is full-bleed with centered constrained content — the canvas is always 100vw, but every text column lives inside a 600–1200px max-width and is center-aligned. The home page opens with a full-viewport video hero, then alternates: a white centered text-and-CTA block, a red star band, a white photo-and-text section, then a full-bleed red social wall. Sections are separated by decorative bands (checkered ribbon, star strip) rather than whitespace alone, giving the page a poster-spine rhythm. Navigation is a minimal top bar with hamburger on the left and a 2–3 button cluster on the right; on the hero the nav collapses to hamburger + single red CTA. Grids are used sparingly — 2-column text+image on interior pages, a loose 5–7-tile polaroid arrangement for social photos. Density is spacious: 64–80px between sections, 20–30px between elements, no multi-column dashboards or dense data tables.

## Similar Brands

- **Prince Street Pizza** — Same red/white/black NYC pizzeria palette and bold uppercase button system
- **Emmy Squared** — Similar near-monochromatic palette with a single loud accent color and oversized condensed display headlines
- **Sweetgreen** — Comparable restraint — white canvas, one signature color, big confident display type with no decorative gradients
- **Stumptown Coffee** — Same zine-inspired aesthetic mixing hand-drawn illustration, bold condensed type, and checkered/halftone graphic elements
- **Joe's Pizza** — Classic American pizza-parlor color story (red, white, black) with checkered visual cues and a retro signage voice
