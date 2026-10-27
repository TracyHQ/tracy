# Allfeat — Style Reference
> Backstage monitor at midnight — one teal stage light cutting through warm cream type on charcoal glass.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Allfeat is a dark-mode music infrastructure platform that uses a warm cream-on-charcoal palette as its resting state, then ignites the canvas with a teal radial wash for heroes and a coral-red gradient for emotional punctuation. The system is built on a single typeface (TASA Orbiter) in three restrained weights, with display sizes pulled tight via -0.02em tracking so headlines read as confident blocks rather than airy declarations. Geometry splits sharply: anything interactive is a full pill (900px), anything containing content is a 12px-radius card with an inset hairline border in #383835 — no floating shadows, no glass, no blur. Color is rationed: teal is the only fill that means 'do this', coral is the only color that means 'feel something', and every other surface stays in the warm-gray neutral family. The result feels like a concert venue's backstage monitor — dark, functional, with one stage light cutting through.

## Colors

| Name | Value | Role |
|------|-------|------|
| Charcoal Stage | `#151515` | Page canvas, primary surface, all dark backgrounds — the base layer every other color sits on |
| Warm Cream | `#fffbeb` | Primary text, nav links, heading copy, hairline borders on dark surfaces — never pure white, always slightly buttered |
| Card Edge | `#383835` | Inset 1px card borders, card ambient shadow, subtle separator lines on elevated surfaces |
| Mute Cream | `#b8b8b8` | Secondary body text, subdued descriptions, muted helper copy |
| Ash Gray | `#a6a6a6` | Subdued heading text, list separators, inactive link borders |
| Bronze Veil | `#504f4a` | Badge borders, card hairline accents, low-emphasis outline treatments |
| Signal Teal | `#00b18c` | Teal action color for filled buttons, selected navigation states, and focused conversion moments. |
| Ember Coral | `#ff4a5f` | Red action color for filled buttons, selected navigation states, and focused conversion moments |

## Typography

### TASA Orbiter — Single typeface across the entire system. Weight 600 for hero and section headlines, weight 500 for subheadings and emphasized body runs, weight 400 for body and metadata. The tight -0.02em tracking on display sizes (54-56px) collapses the headline into a confident slab; the 0.02em loosening on badge/eyebrow text (13-14px) makes labels feel like printed marks.
- **Substitute:** Inter, Manrope, or any geometric humanist sans at matching weights
- **Weights:** 400, 500, 600
- **Sizes:** 13px, 14px, 16px, 18px, 19px, 20px, 24px, 25px, 40px, 54px, 56px
- **Line height:** 0.95–1.20
- **Letter spacing:** -0.02em on display/headings; 0.02em on small caps and labels

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.1 | 0.2px |
| body | — | — | 16px | 1.2 | — |
| body-lg | — | — | 18px | 1.2 | — |
| subheading | — | — | 20px | 1.2 | — |
| heading-sm | — | — | 24px | 1.1 | — |
| heading-lg | — | — | 40px | 1 | — |
| display | — | — | 56px | 0.95 | -1.12px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 900px
- **cards:** 12px
- **badges:** 900px
- **images:** 12px
- **buttons:** 900px

## Components

### Pill Primary Button
**Role:** The default call-to-action — teal fill on charcoal

Fully rounded (900px) pill button. Fill #00b18c, text #fffbeb at 14-16px weight 500. Padding 16px horizontal by 9px vertical. No drop shadow; instead a 2px inset ring at rgba(255,251,235,0.25) defines the edge so the button reads as illuminated rather than elevated.

### Pill Ghost Button
**Role:** Secondary navigation action — text only inside a pill outline

900px radius, transparent fill on #151515, 1px border in #fffbeb at ~40% opacity, 14-16px weight 500 text in #fffbeb. Padding 16px horizontal. Sits beside filled CTAs in the nav as the quieter option.

### Nav Capsule
**Role:** The header pill containing all nav controls

A single 900px-radius container floating top-right of the page. Fill #151515, subtle border. Houses nav links, dropdown caret, and the 'Get started' filled pill, all separated by thin #fffbeb dividers.

### Inset-Border Card
**Role:** Feature/product/insight card — the system's only card pattern

12px radius, fill #151515 (same as canvas so it reads as a cutout), 1px inset border in #383835. Padding 24px. Image area at the top uses 12px radius and bleeds to card edges. No drop shadow — the inset stroke is the only depth signal.

### Hero Radial Wash
**Role:** Atmospheric background for hero and section transitions

A large soft radial gradient centered on the page in #00b18c at 20-35% opacity, fading to transparent over 60-80% of the viewport height. Creates a stage-light effect against the #151515 canvas.

### Display Headline Block
**Role:** Section-spanning typographic statement

TASA Orbiter 56px weight 600, color #fffbeb, line-height 0.95, letter-spacing -1.12px (-0.02em). Mixed-weight runs are common: weight 600 for the primary statement, weight 400-500 in #a6a6a6 or #504f4a for the secondary clause, creating a built-in hierarchy within a single headline.

### Eyebrow Label
**Role:** Section pre-titles — 'OUR SOLUTION', 'PRELUDE'

13-14px TASA Orbiter weight 500, letter-spacing 0.02em (positive, unusual), uppercase, color #00b18c or #ff4a5f. Acts as a colored tag that names the section before the headline arrives.

### Pill Badge
**Role:** Status, tag, and identifier labels

900px radius, no fill, 1px border in #504f4a or #383835, padding 6px 12px, 13px text in #fffbeb or #b8b8b8 weight 500. Used for identifiers like 'ATS', 'Soon - MIDS'.

### Community Node
**Role:** Circular avatar/badge element in the hero orbital layout

Fully round disc, ~80-100px diameter, #151515 fill with 1px #383835 border. Contains either a partner logo (ISRC, IPI, ISWC, etc.) in #b8b8b8 or a portrait photo. Arranged in concentric orbits around the central logo.

### Central Brand Mark
**Role:** Hero focal point — the Allfeat logo with headline

White #fffbeb triangular/constellation logo glyph at 48-64px, centered above a 40-56px headline in #fffbeb weight 600. Followed by a single Signal Teal filled pill button ('Discover how').

### Gradient Accent Border
**Role:** Decorative hairline that traces card or section edges in coral

A 1px linear gradient from #151515 through #ff4a5f back to #151515, applied as a border on select highlight cards. Frequency is low — only used to signal featured or status-quo-breaking content.

## Do's and Don'ts

### Do
- Use #00b18c fill as the only chromatic CTA — every interactive filled button in the system is this exact teal
- Set all buttons, badges, and nav capsules to 900px radius — this is non-negotiable, the only allowed exception is cards/images at 12px
- Pull all display type to letter-spacing -0.02em and line-height 0.95-1.00 so headlines collapse into confident slabs
- Use the 1px inset #383835 border as the sole card depth treatment — never add a drop shadow on top of it
- Reserve #ff4a5f for eyebrow labels, gradient accents, and emotional emphasis runs inside headlines — never as a button fill or body text color
- Anchor every hero and major section in a soft teal radial wash fading from #00b18c at ~25% opacity to transparent
- Keep body text in TASA Orbiter weight 400 at 16-18px in #fffbeb or #b8b8b8; never go below 13px

### Don't
- Don't introduce a new accent color — teal and coral are the only chromatic voices in the system
- Don't use 8px or 16px radius on cards or images; the system is strictly 12px for containers and 900px for interactive elements
- Don't use pure white (#ffffff) for text — always #fffbeb, the warm cream tint is part of the brand
- Don't apply drop shadows anywhere — the entire elevation system is inset-only
- Don't break the single-typeface rule by introducing a second font; TASA Orbiter at 400/500/600 covers every need
- Don't set headlines in light or thin weights — 600 is the floor for display sizes, mixing in 400-500 only as muted secondary clauses
- Don't fill buttons with #ff4a5f coral — coral is atmospheric, not actionable; only #00b18c signals an action

## Elevation

- **Inset-Border Card:** `rgb(56, 56, 53) 0px 0px 0px 1px inset`
- **Pill Primary Button:** `rgba(255, 251, 235, 0.25) 0px 0px 0px 2px inset`

## Surfaces

- **Charcoal Canvas** (`#151515`) — Page base, hero background beneath the teal radial wash
- **Card Surface** (`#151515`) — Card interior — same color as canvas, distinguished only by the 1px inset border in #383835
- **Teal Wash** (`#00b18c`) — Hero radial gradient overlay creating atmospheric depth, not a true surface

## Imagery

Visuals are dominated by illustrated 3D isometric graphics (a translucent cube on a grid, networked circular nodes with geometric face patterns) rendered in a limited palette of teal, coral, cream, and charcoal. Photography is restricted to small circular partner portraits in the community orbital hero, presented as soft black-and-white crops. Icons are monoline geometric marks (ISRC, IPI, ISWC badges) in #b8b8b8. The illustrative style is flat-isometric with hard edges, no gradients on the objects themselves — the only gradient in the system is the atmospheric teal wash behind them.

## Layout

Max-width 1200px centered, full-bleed dark canvas. The hero is a full-viewport radial teal wash with the brand mark, headline, and single CTA dead-centered; the community nodes orbit this center as fixed-position circles. Below the fold, content arranges in alternating 2-column card grids (2-up on desktop, stacked on mobile) with generous 80px vertical section gaps. Each section opens with a centered eyebrow + display headline, then drops into 2-up or 3-up card rows. Navigation is a fixed top-left wordmark plus a top-right floating pill capsule — no full-width nav bar. The footer is compact, dark, and text-only. The overall rhythm is: one big centered moment, then a long quiet section of paired cards, then another big centered moment.

## Similar Brands

- **Audius** — Same dark-mode music-infrastructure palette with a single vivid accent (Audius uses green, Allfeat uses teal) and pill-shaped CTAs
- **Sound.xyz** — Dark canvas, teal/vivid-green primary action, minimal card system with hairline borders, single sans-serif throughout
- **Zora** — Dark-mode crypto-creator platform using a single chromatic accent against near-black, with pill buttons and 12px-radius cards
- **Lens Protocol** — Identical dark-canvas-plus-vivid-teal accent language, pill navigation capsules, and inset-border card treatment
- **Royal** — Music-industry crypto platform with a warm-on-dark palette, single accent color, and display headlines that mix weights within one block
