# Coda — Style Reference
> Cream-paper workspace — warm editor's desk where bold black type and a single orange accent do all the work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Coda reads as a warm editorial workspace printed on cream paper: a nearly monochrome system anchored by heavy black sans-serif headlines that sit on a buttery #fff6ec canvas, with one vivid orange accent used as high-signal punctuation. The product itself is shown the way a magazine would show a well-designed tool — inside browser-chrome mockups with hard offset shadows, not soft Material-style elevation. Surfaces are mostly white; warm cream appears as the emotional entry band and as a footer anchor. Typography does almost all of the brand work: a custom 700-weight display face (Calibre-R) screams in tight tracking while Inter handles everything else at near-default weight. The result is confident and blunt — black buttons, hard shadows, and zero chromatic noise outside the single orange.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#212121` | Primary text, heading fills, primary borders, and the structural ink color across all UI surfaces |
| Pure White | `#ffffff` | Default page canvas, card surfaces, button text on dark fills, and outlined-button fills |
| Carbon | `#000000` | Filled primary action background, hard offset shadow color, and high-contrast icon fills |
| Cream Paper | `#fff6ec` | Warm hero band, footer surface, and the signature alternate canvas that gives Coda its editorial mood |
| Ash Border | `#e0e0e0` | Hairline borders, card edges, and subtle dividers separating surfaces from canvas |
| Graphite | `#666666` | Secondary body text, muted helper text, and low-emphasis metadata |
| Smoke | `#8e8e8e` | Tertiary text, placeholder text, disabled labels, and nav item resting state |
| Slate Button | `#444444` | Secondary button borders and mid-weight icon strokes |
| Ember Orange | `#ee5a29` | Sole chromatic accent — heading highlights, section eyebrow text, decorative underlines, and brand-mark punctuation. The single warm note against an otherwise black-and-cream system |

## Typography

### Calibre-R — Display and section headlines. Custom geometric 700-weight face with extremely tight tracking that compresses letterforms into dense blocks of ink. The heavy + tight combination is Coda's signature — headlines feel carved rather than written. Substitute: Manrope 800 or DM Sans 800 with -0.03em tracking.
- **Substitute:** Manrope
- **Weights:** 700
- **Sizes:** 38px, 52px, 72px
- **Line height:** 1.00–1.10
- **Letter spacing:** -0.025em to -0.045em

### Inter — All UI text: body copy, nav links, buttons, labels, captions. Inter carries the entire functional layer; its near-default weights and tracking let the Calibre headlines lead.
- **Substitute:** Inter
- **Weights:** 400, 600, 700
- **Sizes:** 10px, 14px, 16px, 20px, 22px
- **Line height:** 1.20–1.55
- **Letter spacing:** -0.03em to +0.01em

### Tiempos-Headline — Occasional editorial subheading in a light serif weight — the soft counterpoint to Calibre's blocky display. Used sparingly for emphasis rather than hierarchy.
- **Substitute:** Source Serif Pro
- **Weights:** 300
- **Sizes:** 38px
- **Line height:** 1.37
- **Letter spacing:** -0.01em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.1px |
| body-sm | — | — | 14px | 1.55 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.43 | -0.2px |
| heading-sm | — | — | 22px | 1.38 | -0.22px |
| heading | — | — | 38px | 1.1 | -0.95px |
| heading-lg | — | — | 52px | 1.1 | -1.82px |
| display | — | — | 72px | 1 | -3.24px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **icons:** 44px
- **images:** 8px
- **buttons:** 8px
- **largeButtons:** 12px

## Components

### Top Navigation Bar
**Role:** Primary site header

White background, 64–72px tall. Coda wordmark at left in Inter 600. Center: Product, Solutions, Resources dropdowns plus Gallery, Blog, Pricing. Right: outlined 'Request a demo' button (white fill, 1.5px inset #e0e0e0 border, 8px radius) and filled black 'Get started' button. Hairline 1px #e0e0e0 bottom border.

### Filled Primary Button
**Role:** Main conversion action

#000000 background, #ffffff text, Inter 600 14–16px. 8px border-radius. 1.5px inset #212121 shadow for a pressed-in edge. Padding 12px 20px. Used for 'Get started for free' and 'Get started' in nav.

### Outlined Button
**Role:** Secondary action

White background, 1.5px inset #e0e0e0 border, Inter 600 14px #212121 text. 8px radius. 12px 20px padding. Used for 'Contact sales' and 'Request a demo'.

### Ghost Link Button
**Role:** Tertiary text action

No background, no border. Inter 600 #212121 text. Often paired with arrow glyph. Padding 8px 0.

### Hero Section
**Role:** Above-the-fold brand statement

Full-width #fff6ec (cream) background. Left-aligned massive headline in Calibre-R 700 at 52–72px, #212121, tracking -0.035em to -0.045em. Single-line subhead in Inter 400 16–18px #666666. Two-button row below: filled black + outlined white. Product mockup overlaps section boundary at bottom.

### Product Mockup Frame
**Role:** Browser-chrome product screenshot container

White surface with 8px radius, subtle two-layer soft shadow (rgba 0,0,0,0.06 at 0 12px 24px -5px and 0 5px 10px -6px). Traffic-light dots in top-left. Full app UI rendered inside. Overlaps section boundaries with no border.

### Hard Shadow Block
**Role:** Editorial feature card with retro offset

White card with 8px radius and a hard #000000 8px 8px 0px 0px offset shadow — no blur, solid black. This zero-blur shadow is Coda's signature elevation move, replacing the usual soft Material lift with print-style drop.

### Status Badge
**Role:** Inline status indicator in product tables

Pill shape, ~9999px radius. Filled background per status: yellow-amber for 'Blocked', light green for 'In progress', blue for 'Not started'. Inter 600 12px text. 4px 10px padding.

### Social Proof Logo Bar
**Role:** Customer trust strip

Center-aligned Inter 400 14px label in #666666. Below: row of customer wordmarks (Figma, NYT, Square, DoorDash, Toast, TED, Uber) rendered in #212121 at uniform height (~28–32px), evenly spaced with 48–64px gaps. No logos in color.

### Section Eyebrow
**Role:** Small label above a heading

Inter 600 12–14px in #ee5a29 (ember orange) or #212121, uppercase optional, tracking 0.01em. Marks the topic of the upcoming block.

### Document Card
**Role:** Content tile in galleries and resource grids

White background, 8px radius, 1px #e0e0e0 border, 24px padding. Thumbnail image at top (8px radius), Inter 600 18–20px title, Inter 400 14px #666666 description below.

### Footer
**Role:** Site bottom anchor

Full-width #fff6ec background. Multi-column link grid in Inter 400 14px #212121, column headers in Inter 600 12px #212121. Coda wordmark and social icons at top or bottom.

### Inset Input Field
**Role:** Text input with pressed-in edge

White background, 1.5px inset #e0e0e0 border giving a recessed look, 8px radius, Inter 400 14px placeholder in #8e8e8e. Padding 10px 16px. Focus state intensifies the inset border to #212121.

## Do's and Don'ts

### Do
- Use Calibre-R (or Manrope 800 substitute) at 52–72px with -0.035em to -0.045em tracking for all display headlines.
- Anchor the primary CTA on a solid #000000 fill with white Inter 600 text, 8px radius, and a 1.5px inset #212121 shadow.
- Open the page with a full-bleed #fff6ec hero band when the goal is brand introduction or top-of-funnel conversion.
- Show product through browser-chrome mockups that overlap section boundaries, anchored by the soft two-layer rgba(0,0,0,0.06) shadow stack.
- Reserve #ee5a29 for single-word emphasis, eyebrows, or small icon accents — never fills or large surfaces.
- Use 8px radius as the universal default for cards, buttons, and images; reach for 12px only on large CTAs.
- Let Inter at 400/600 carry every functional label; never let body weight climb above 700.

### Don't
- Don't introduce a second chromatic accent — the system is monochrome plus a single ember orange.
- Don't use soft blurred drop-shadows on content cards; elevation is either the hard 8px/8px black offset or the two-layer rgba stack, nothing in between.
- Don't set body or subheading text in Calibre-R — it belongs only at 38px and above, 700 weight only.
- Don't apply rounded pill (9999px) radii to primary buttons; 8px is the system default.
- Don't place white cards directly on the cream band without a visible border or shadow — the value difference is too subtle.
- Don't use light grays (#8e8e8, #aeaeae) for primary text; reserve them for placeholder and disabled states only.
- Don't break the 4px spacing grid — all padding, gaps, and margins should snap to 4 / 8 / 12 / 16 / 20 / 24 / 32.

## Elevation

- **Product Mockup Frame:** `rgba(0, 0, 0, 0.06) 0px 12px 24px -5px, rgba(0, 0, 0, 0.06) 0px 5px 10px -6px`
- **Hard Shadow Block:** `rgb(0, 0, 0) 8px 8px 0px 0px`
- **Filled Primary Button:** `rgb(33, 33, 33) 0px 0px 0px 1.5px inset`
- **Outlined Button:** `rgb(224, 224, 224) 0px 0px 0px 1.5px inset`

## Surfaces

- **Cream Canvas** (`#fff6ec`) — Hero band, footer, and the warm editorial entry surface.
- **Default White** (`#ffffff`) — Main content canvas, card surfaces, product mockup frames.
- **Cool White** (`#dbeefa`) — Subtle secondary canvas for alternating sections.
- **Apricot** (`#f8ad40`) — Accent surface washes (rarely used, brand tone).

## Imagery

Coda's visual language is product-screenshot-first, not lifestyle photography. Every feature section is illustrated through in-context product UI — tables, doc editors, kanban boards, Gantt charts — rendered inside browser-chrome mockups with traffic-light dots. These mockups overlap section boundaries for a layered, scrapbook feel rather than sitting in clean containers. Supporting graphics lean editorial: hard offset shadows give the impression of cut paper or riso print, not Material elevation. There is no stock photography of people; brand voice comes through bold type and product artifacts alone. Customer logos appear in a single uniform grayscale row as social proof. Iconography is monochrome, line-based, 1.5px stroke, sitting in #212121 or #8e8e8e.

## Layout

Coda uses a max-width ~1200px centered column on white, with the hero breaking out into a full-bleed cream (#fff6ec) band. The hero follows a left-aligned pattern: massive Calibre-R headline stacked in 2–3 lines, a single sentence subhead, and a two-button row — no hero image competing with the type. Below, the product mockup anchors the section and overlaps the cream-to-white transition. Subsequent sections alternate white and cream bands at ~96px vertical gaps, each with a centered or left-aligned display heading followed by 2-column or 3-column content blocks. Feature sections pair text-left with mockup-right or stack centered screenshots. The footer returns to the cream band. Navigation is a single white top bar with a thin hairline border; no sticky mega-menus in the hero state. The rhythm is editorial: generous vertical breathing, one big idea per section, no information-dense grids.

## Similar Brands

- **Notion** — Same monochrome-plus-single-accent approach with bold display headlines, a product-screenshot-as-hero philosophy, and a near-identical button vocabulary (filled black primary, outlined white secondary).
- **Linear** — Shares the hard-edge 8px radius system, dense Inter UI, and the discipline of restricting chromatic color to a single accent token.
- **Pitch** — Editorial hero treatment with oversized tight-tracked display type on a warm off-white canvas, and product shown through overlapping browser-frame mockups.
- **Airtable** — Comparable product-screenshot-driven marketing pages with light canvas, black CTAs, and a tightly restricted accent palette.
