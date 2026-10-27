# Compound — Style Reference
> ink-on-paper wealth journal — a quiet editorial system where one font at one weight does all the work, and the only color is the cream ribbon at the top of the page.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Compound operates on near-total chromatic silence: one typeface (Monument Grotesk) at a single weight of 400, a fully achromatic palette, and shadows so faint they register as atmosphere rather than depth. Surfaces are nearly invisible — a white canvas, #e5e7eb hairline borders, and 20px rounded cards — so hierarchy is carried entirely by dramatic size jumps (14px body climbing to 60–72px display) and generous whitespace. The only chromatic note in the system is a warm cream announcement bar (#ffe9bf) flush at the very top edge. Interactive elements are deliberately quiet: a single near-black pill button and ghost underlined text links that read as typeset words more than UI chrome. The product preview card — with its subtle four-layer drop shadow and 20px radius — is the one moment of visual thickness in the layout, the only thing the eye can actually grasp as an object.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#171717` | Primary text, filled pill buttons, navigation emphasis, logo wordmark — the only dark anchor in an otherwise white system |
| Paper | `#ffffff` | Page canvas, card surfaces, product preview background — the default ground for all content |
| Graphite Hairline | `#e5e7eb` | All structural borders, dividers, card edges, input borders — the most-used color in the system by frequency, defining every container |
| Vellum | `#f3f3f3` | Secondary surface fills, subtle hover washes, tertiary panel background — the lightest gray still distinct from white |
| Slate | `#6f6f6f` | Secondary body text, metadata, icon strokes, tab labels — the primary muted text voice |
| Pewter | `#5e5e5e` | Helper text, descriptive captions, micro-copy — darker than Slate for emphasized secondary text |
| Ash | `#a0a0a0` | Tertiary text, disabled link color, placeholder text — the quietest readable gray |
| Carbon | `#222222` | SVG fill and stroke for icons, 3D graphic elements — nearly identical to Ink but reserved for decorative vector work |
| Stone | `#c7c7c7` | Decorative fills, gradient endpoints, subtle background washes — never used for text or borders |
| Cream Notice | `#ffe9bf` | Announcement bar background, the single warm accent in the entire system — used only for the top promotional strip |

## Typography

### Monument Grotesk — The sole typeface for everything from 12px captions to 72px display headlines. No bold, no italic, no light — a single weight does all expressive work. The dramatic size jump from 18px subheading directly to 36px heading creates a distinctive editorial scale where display type towers over body text. Tight line-heights at display sizes (1.00–1.11) let large type stack into near-solid blocks.
- **Substitute:** Inter or General Sans as free alternatives; Söhne if licensed — all are geometric grotesks with similar x-height and neutrality
- **Weights:** 400
- **Sizes:** 12, 13, 14, 16, 18, 36, 48, 58, 60, 72
- **Line height:** 1.00 / 1.10 / 1.11 / 1.25 / 1.33 / 1.38 / 1.43 / 1.50 / 1.56 / 1.71
- **OpenType features:** `"kern"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.38 | — |
| heading-sm | — | — | 36px | 1.25 | — |
| heading | — | — | 48px | 1.11 | — |
| heading-lg | — | — | 60px | 1.1 | — |
| display | — | — | 72px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 20px
- **icons:** 9999px
- **buttons:** 9999px
- **list-items:** 28px
- **large-cards:** 24px
- **small-cards:** 8px

## Components

### Announcement Bar
**Role:** Top-of-page promotional strip

Full-bleed #ffe9bf background, centered #171717 text at 12–14px Monument Grotesk, vertical padding 7–8px. Contains a text message and a pill-shaped 'Read more' button with #171717 background and white text. Sits flush against the viewport top edge with no border or shadow.

### Top Navigation
**Role:** Primary site navigation

White background, no border or shadow. Wordmark 'compound' in #171717 at 18–20px left-aligned. Centered nav links at 14px in #171717 with 20px horizontal gap. Right side: 'Sign in' text link and a filled pill button (#171717, white text, 9999px radius, 16px horizontal padding).

### Filled Pill Button
**Role:** Primary action trigger (e.g., 'Get started')

#171717 background, white text, Monument Grotesk 14px, 9999px border-radius, 16px horizontal padding, 8–9px vertical padding. No border, no shadow. The only filled button in the system.

### Ghost Text Link
**Role:** Inline navigation, secondary actions

No background, no border, #171717 text at 14px Monument Grotesk with 1px underline. Hover may darken to #000000. Used for nav items, footer links, and inline references.

### Product Preview Card
**Role:** Embedded dashboard screenshot in hero

White (#ffffff) surface, 20px border-radius, 1px #e5e7eb border, four-layer soft drop shadow (rgba(207,207,207, 0.01→0.1) at distances 8–132px). Contains a full dashboard UI mockup. The only element with visible elevation in the system.

### Feature Service Card
**Role:** Service category tile in feature row

Transparent or #f3f3f3 background, no border, 20px radius. Contains a small purple/icon indicator (visible in data as chromatic accent), a 14–16px label in #171717, and a 12–14px description in #6f6f6f. Arranged in a 4-column row.

### Publication Logo Card
**Role:** Press feature showcase

#f3f3f3 background, 20px radius, no border, no shadow. Contains a centered brand logo (Y Combinator, Axios, InvestmentNews) at grayscale. Arranged in a 3-column row with a left-aligned 'featured in' label.

### Section Divider
**Role:** Section transition with label

Thin 1px #e5e7eb horizontal line spanning the content width, with a centered 14px #6f6f6f label (e.g., 'Our approach') sitting on the line as a break in the stroke.

### Hero Display Headline
**Role:** Primary page headline

60–72px Monument Grotesk weight 400, #171717, line-height 1.00–1.10, centered. Single sentence broken across two lines, never more than 12–14 words total. No subtitle or eyebrow — the headline stands alone.

### Circular Icon Container
**Role:** Icon wrapper for UI indicators

9999px border-radius, 32–40px diameter, #f3f3f3 or white background, contains a 16–20px monochrome icon. Used for feature icons, tab indicators, and chart markers.

### Stats Metric Row
**Role:** Performance data display

Inline row with a 12px #6f6f6f label (e.g., 'Projected net worth 2029') above a 24–36px #171717 value (e.g., '$16.2M'). Change indicators use a small green up-arrow icon — the only place a non-grayscale chromatic accent appears in product UI.

## Do's and Don'ts

### Do
- Use only Monument Grotesk at weight 400 — never introduce bold, italic, or a second typeface
- Use 9999px border-radius for all buttons, tags, and icon containers
- Use 20px border-radius for all cards and content containers
- Use #e5e7eb for all borders and dividers — never darker than #dbdbdb
- Space sections with 80px vertical gaps to let the whitespace carry hierarchy
- Keep the palette strictly achromatic — the only color is #ffe9bf for the announcement bar
- Use four-layer soft shadows with 0.01–0.10 opacity for any elevated element

### Don't
- Never introduce a chromatic accent color outside the cream announcement bar
- Never use a typeface other than Monument Grotesk or add a second weight
- Never use sharp corners on cards or buttons — all corners are rounded
- Never use heavy or dark drop shadows — opacity must stay below 0.10
- Never use background colors other than #ffffff, #f3f3f3, or #ffe9bf for full surfaces
- Never reduce section gaps below 64px — the whitespace is the hierarchy
- Never add decorative borders, outlines, or colored strokes to text or headings

## Elevation

- **Product Preview Card:** `rgba(207, 207, 207, 0.01) 0px 132px 53px 0px, rgba(207, 207, 207, 0.05) 0px 74px 44px 0px, rgba(207, 207, 207, 0.09) 0px 33px 33px 0px, rgba(207, 207, 207, 0.1) 0px 8px 18px 0px`
- **Link hover lift:** `rgba(0, 0, 0, 0.01) 0px 128px 51px 0px, rgba(0, 0, 0, 0.02) 0px 72px 43px 0px, rgba(0, 0, 0, 0.03) 0px 32px 32px 0px, rgba(0, 0, 0, 0.04) 0px 8px 18px 0px`
- **List container:** `rgba(194, 194, 194, 0.01) 0px 168px 67px 0px, rgba(194, 194, 194, 0.05) 0px 94px 57px 0px, rgba(194, 194, 194, 0.09) 0px 42px 42px 0px, rgba(194, 194, 194, 0.1) 0px 10px 23px 0px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background, the ground all content sits on
- **Vellum Surface** (`#f3f3f3`) — Secondary panels, publication logo cards, subtle hover fills
- **Graphite Edge** (`#e5e7eb`) — Borders and dividers — the structural line between surfaces
- **Stone Accent** (`#c7c7c7`) — Decorative vector fills, gradient endpoints, depth without weight
- **Cream Notice** (`#ffe9bf`) — Announcement bar — the single warm chromatic surface, always at the very top

## Imagery

Imagery is restrained and editorial. The signature visual is a large translucent gray 3D helix/ribbon form floating behind the hero text — rendered in #c7c7c7 to #8f8f8f gradients, it acts as atmospheric depth rather than a literal object. The only product imagery is the embedded dashboard UI screenshot framed in a Product Preview Card. Publication logos (Y Combinator, Axios, InvestmentNews) appear in grayscale on Vellum cards. There is no photography, no lifestyle imagery, no human figures — the system communicates through typography and the abstract 3D form alone.

## Layout

The page follows a centered, max-width-contained layout at ~1200px. The hero is a single centered display headline (60–72px) with no eyebrow or subheading, positioned over a large translucent 3D graphic. A Product Preview Card sits centered below the hero. Below the fold, a 4-column row of service cards spans the width, followed by a 3-column row of publication logos. Sections are separated by 80px vertical gaps or thin divider lines with centered labels. Navigation is a single clean bar — wordmark left, centered links, action button right. The overall rhythm is vertical-stack with generous breathing room; no sidebar, no asymmetric compositions, no overlapping content.

## Similar Brands

- **Wealthfront** — Same achromatic palette with a single dark CTA and generous whitespace; both treat wealth management as a quiet editorial product
- **Mercury** — Identical single-weight grotesque typography, white-canvas minimalism, and pill-shaped dark buttons as the only interactive color
- **Public.com** — Monochrome investing interface that relies on type size and whitespace for hierarchy rather than accent colors
- **Modern Treasury** — Same editorial financial-publication aesthetic with centered max-width layout, hairline borders, and 20px card radii
