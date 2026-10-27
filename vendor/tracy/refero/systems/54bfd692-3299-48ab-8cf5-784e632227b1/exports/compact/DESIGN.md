# Common — Style Reference
> graph paper under neon streaks

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Common operates on a graphite-and-paper economy: the canvas is near-white, structure is near-black, and everything meaningful is signalled by one of two narrow chromatic accents or a single full-spectrum gradient. Type is compact and uniform (NeueHaasUnica, tabular figures, whisper-wide tracking) so the page reads as a ledger rather than a brochure. The 6px radius is the system's only bend — nothing is fully pill, nothing is sharp. Color is rationed: blue and violet appear as thin borders, link strokes, and icon dots; the vivid spectrum is reserved for the launch card and the launch button, which together form a single ceremonial moment on an otherwise quiet page. Elevation is barely there (a 1px/5% shadow) — depth is created by hairline borders on a stacked gray surface, not by floating cards.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon | `#000000` | Body text, structural hairlines, dark icon strokes — the universal ink that defines every other element on the page |
| Paper | `#ffffff` | Page canvas, card surfaces, input fields, button text on dark fills |
| Fog | `#f0eff0` | Body background wash, second surface tier below cards |
| Silver | `#e0dfe1` | Input borders, subtle dividers between content bands |
| Mist | `#c1c0c2` | Card borders — a half-step lighter than the structural hairline, used to separate stacked cards from the canvas |
| Ash | `#a09da1` | Muted icon strokes, inactive nav borders, secondary metadata |
| Obsidian | `#282729` | Heavy icon borders, strong dividers, secondary structural lines that need more weight than #000 hairline |
| Onyx | `#141315` | Deepest text tier for high-emphasis labels over light surfaces |
| Graphite | `#3d3a3e` | Primary action button fill — the dark solid button (Sign in, Randomize); slightly lifted from pure black to read as a surface, not absence |
| Cobalt Pulse | `#338fff` | Link text, icon dots, chromatic borders — the blue half of the system, used to mark tokens, active links, and the start of gradients |
| Ultraviolet | `#7a33ff` | Outlined action border, secondary link accent — appears as a stroke on ghost controls and as the mid-stop in gradient transitions |
| Spectrum Bridge | `linear-gradient(90deg, #0079cc 0%, #050fa3 27%, #ff1000 59%, #ff1000 100%)` | Blue wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Aurora Wash | `linear-gradient(90deg, rgba(255, 31, 0, 0.3) 0%, rgba(255, 128, 215, 0.3) 50%, rgba(0, 121, 204, 0.3) 100%)` | Hero card gradient — soft translucent wash from ember through pink to cobalt, a 30% opacity field that sits behind the launch prompt |

## Typography

### NeueHaasUnica — All interface type — body, nav, buttons, cards, inputs, links, icons labels. Weight 400 for body and secondary; 500 for buttons and emphasized labels; 600 reserved for section headings. Tabular figures ('tnum', 'lnum') on all numeric displays so token counts and prices align in columns.
- **Substitute:** Inter, Neue Haas Grotesk Display, Söhne
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 20, 24, 28, 32, 36px
- **Line height:** 1.00–1.71
- **Letter spacing:** 0.01em at body sizes (14–16px); 0.02em at display sizes (28–36px) — tracking tightens relative to size, giving headlines a slightly tighter optical fit than body
- **OpenType features:** `"lnum" on, "tnum" on`

### Silka — Supplementary display face — used sparingly for editorial moments and icon-adjacent labels where a different texture is needed from the interface default
- **Substitute:** Söhne, Inter, GT America
- **Weights:** 400, 700
- **Sizes:** 20, 24, 28px
- **Line height:** 1.17–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | 0.14px |
| body | — | — | 16px | 1.5 | 0.16px |
| subheading | — | — | 20px | 1.4 | 0.2px |
| heading-sm | — | — | 24px | 1.43 | 0.24px |
| heading | — | — | 28px | 1.17 | 0.56px |
| heading-lg | — | — | 32px | 1.15 | 0.64px |
| display | — | — | 36px | 1 | 0.72px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 32px
- **Card padding:** 16px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 6px
- **icons:** 6px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Spectrum Launch Button
**Role:** The single ceremonial action — the launch token submission

Filled button with the full-spectrum gradient (cobalt → violet → ember red, 90deg), white text, weight 500 at 16px, 6px radius, 8px 16px padding, optional rocket/arrow icon in white. The only button that carries color.

### Graphite Filled Button
**Role:** Standard dark action — Sign in, Randomize, confirmations

Solid #3d3a2 background, #ffffff text, weight 500 at 16px, 6px radius, 8px 16px padding. No border. This is the workhorse button; the dark fill sits squarely between paper and carbon so it reads as a solid object, not a void.

### Ghost Outlined Button
**Role:** Secondary action — Create account, cancel

Transparent background, 1px #000000 border, #000000 text, 6px radius, 8px 16px padding. Hairline border matches the system border weight — the button is a container, not a filled object.

### Aurora Launch Card
**Role:** Hero surface wrapping the token-launch prompt

Full-width card with the aurora-wash gradient (ember→pink→cobalt at 30% opacity) on a white base, 1px #c1c0c2 border, 6px radius, 16–20px padding. Contains a single text input and the spectrum launch button. This card is the only place a gradient appears as a surface.

### Text Input
**Role:** Token idea entry, search

White background, 1px #e0dfe1 border, 6px radius, 8–10px vertical / 12px horizontal padding, 14–16px placeholder text in Ash #a09da1. Focus state: border darkens to Carbon #000000 — no glow, no ring, just a weight shift.

### Section Header Row
**Role:** Trending, Recently Launched, Graduated — list section titles

NeueHaasUnica 24px weight 500 in Carbon, paired with a right-aligned text link in Cobalt #338fff weight 400 at 16px. No background, no border — just a typographic moment. Token indicator dots (4px circles in Cobalt and Ultraviolet) sit inline as visual punctuation.

### Token Indicator Dot
**Role:** Marks a list section as token-related

Two 8px filled circles in Cobalt #338fff and Ultraviolet #7a33ff, overlapping or adjacent at 6px gap. No border, no shadow. The system uses only these two colors as filled chromatic shapes; everything else is a stroke.

### Notification Banner
**Role:** Top-of-page announcement strip

Full-width row with the aurora-wash gradient at 30% opacity, 2–4px vertical padding, centered 14px text in Carbon, with a compact spectrum-fill claim button on the right. Close icon (×) in Carbon at the far right.

### Side Rail
**Role:** Left-edge contextual panel — sign-in prompt, community filters

Narrow column (≈200px), white background, no visible border, separated from the main content by whitespace alone. Contains stacked icon buttons (4px squares in Ash) and a graphite sign-in button. The rail is whisper-thin; it hints rather than divides.

### Top Navigation Bar
**Role:** Primary site navigation

White background, 16px vertical padding, 1px bottom border in #e0dfe1. Left: brand mark. Center: search input (full-width, 1px Silver border, 6px radius, magnifier icon in Ash). Right: text link (About), icon buttons (theme toggle, help — 1px Ash borders, 6px radius), ghost outlined Create account, graphite filled Sign in.

### Search Input
**Role:** Global site search

White field, 1px #e0dfe1 border, 6px radius, 8–10px vertical padding, leading magnifier icon in #a09da1, placeholder in #a09da1. Stretchable to fill available width — there is no max-width on the search itself, only on its container.

### Icon Button
**Role:** Theme toggle, help, sidebar controls

1px border in #a09da1 or #282729, transparent background, 6px radius, 6–8px internal padding, 16px icon in matching color. Hover: border darkens to #000000, icon darkens to #000000. The stroke IS the button — no fill state.

### Arrow Link
**Role:** Inline navigation — 'Tokens →', 'See all →', 'Create Your Community →'

NeueHaasUnica 16px weight 400 in Cobalt #338fff, trailing → arrow (U+2192) at 1.1em size. The arrow is part of the text, not a separate icon — it inherits color and weight.

### Hairline Divider
**Role:** Separates nav from content, cards from lists, sections within the page

1px solid line in #e0dfe1 (or #000000 for stronger structural breaks). No padding above or below — the line lives in the gap. The system has no thick rules.

## Do's and Don'ts

### Do
- Use 6px border-radius on every container — cards, buttons, inputs, icon buttons. There is one radius in this system; the pill (80px) appears only on the launch card's gradient border treatment and should not propagate.
- Reserve the full-spectrum gradient exclusively for the launch action. No other button, no other card, no other element should carry cobalt→violet→ember.
- Set body type at 16px / line-height 1.5 and never go below 14px. The type scale is compact but not micro — density comes from spacing, not from shrinking text.
- Use #3d3a3 (Graphite) for primary action fills, not pure #000000. Pure black reads as absence; graphite reads as a solid object. Reserve #000000 for text and hairlines.
- Apply tabular figures ('tnum', 'lnum') on every numeric display via font-feature-settings. Token counts, prices, and percentages must align vertically.
- Separate cards from the canvas with a 1px #c1c0c2 hairline. Reach for the 1px/5% shadow only when a border alone cannot break the card from its background.
- Use Cobalt #338fff and Ultraviolet #7a33ff only as strokes, dots, and link text. The system has exactly two chromatic filled shapes: the two token indicator dots.

### Don't
- Do not introduce a second gradient surface. The aurora wash belongs only on the launch card and the notification banner — not on pricing, not on feature blocks, not on empty states.
- Do not use rounded-rectangle shadows of 8px+ blur. The system is flat; a 1px/2px offset at 5% opacity is the ceiling.
- Do not use a chromatic border on a filled action button. Spectrum goes on spectrum buttons; graphite goes on graphite buttons; outlines go on ghost buttons. Mixing fill and chromatic stroke is not in the vocabulary.
- Do not place type below 14px or above 36px. The scale is narrow by design — out-of-scale sizes read as imported from another system.
- Do not use a soft drop shadow to indicate focus. Focus is communicated by a 1px border weight shift from Silver to Carbon, nothing else.
- Do not apply color to body text. Carbon #000000 is the only text color; muted helper text uses Ash #a09da1, never a tinted gray.
- Do not create new radii. If 6px doesn't fit a component, the component doesn't belong in this system.

## Elevation

- **Card:** `rgba(40, 39, 41, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Page background — the dominant white field
- **Body Wash** (`#f0eff0`) — Optional second-tier background for sections that need to recede behind the canvas
- **Card** (`#ffffff`) — Card surfaces — sit on the canvas with a #c1c0c2 hairline border, no shadow
- **Launch Card** (`#ff80d7`) — Sole ceremonial surface — translucent aurora gradient field wrapping the token-launch prompt

## Imagery

Common is essentially imageless — the visual identity is carried by the aurora gradient on the launch card and the two filled token dots, not by photography or illustration. Where icons appear (magnifier, theme toggle, help, close, arrow), they are 16px line icons with 1.5px stroke weight in Carbon or Ash, sitting inside 1px-bordered 6px-radius containers. Token entries are represented by the two-color dot pair (Cobalt + Ultraviolet, 8px each) — no avatars, no thumbnails, no product imagery. The only gradient treatment that functions as 'imagery' is the aurora wash and the spectrum button, both of which are system elements, not decorative media. There are no people, no product photos, no screenshots anywhere in the interface.

## Layout

The page is a max-width 1200px centered column on a white canvas, with a thin side rail on the left (≈200px, whitespace-separated, not bordered) and the main content column on the right. The hero is a full-width launch card with the aurora gradient, sitting flush between the top nav and the first list section. Below the hero, content is a single vertical stack of section header rows (Trending, Recently Launched, Graduated, Trending Communities) each followed by a list — no multi-column grids, no card carousels, no masonry. Navigation is a top bar with a borderless full-width search, right-aligned controls, and a compact notification strip above it. The layout rhythm is: gradient card → repeated plain rows → repeated plain rows. The eye is led by the gradient, then by the alignment of section labels and right-aligned arrow links. Density is compact — 8–16px element gaps, 32px section gaps, no hero illustration to compete with the launch card.

## Similar Brands

- **Farcaster** — Same near-monochrome canvas with a single vivid accent per surface — the launch experience uses gradient where everything else is grayscale
- **Mirror.xyz** — Compact type, 6px radii, editorial ledger layout — both treat the page as a structured list rather than a marketing surface
- **Paragraph** — Newsletter-native crypto publishing with the same restrained palette and gradient-reserved-for-ceremony approach
- **Paragraph.xyz** — Identical type-system discipline (NeueHaasUnica or close substitute, tabular figures, 6px radius, hairline borders) and the same compact rhythm of header-plus-list rows
- **Tally** — Same hairline-bordered cards on a white canvas with chromatic dots and arrows as the only color punctuation
