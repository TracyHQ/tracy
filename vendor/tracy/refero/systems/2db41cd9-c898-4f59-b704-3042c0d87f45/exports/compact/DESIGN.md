# Ditto — Style Reference
> marked-up manuscript on warm parchment

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ditto speaks the visual language of a copy editor's desk: warm parchment-cream canvases, confident black sans-serif type at near-poster scale, and a full crayon box of highlighter colors applied as if someone grabbed a marker. Every color in the palette is a tool — green, yellow, orange, purple, blue, pink all function as markup ink over running text, never as decorative fills. Components are stubby and rounded into pills — buttons, tags, and nav items all collapse into the same soft capsule shape, keeping the surface quiet so the annotated text can shout. There are no shadows, no gradients, no glassmorphism — the entire identity is built from flat color, heavy type, and the metaphor of someone reviewing a manuscript with a set of Sharpies.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#f7f5f3` | Page canvas, section backgrounds, and the inside of cards — a warm off-white that reads as paper, not screen. Every other color in the system is applied as ink on top of this surface |
| India Ink | `#000000` | Primary text, heading color, nav text, button fills, and hairline borders — the heaviest presence in the system at 1,849 hits. High-contrast against Parchment (#f7f5f3) at 19.3:1 |
| Charcoal Warm | `#222222` | Secondary text and structural borders, softer than pure black for elements that need hierarchy without dropping out of the warm palette |
| Graphite Warm | `#6a6559` | Muted text, secondary nav labels, and border accents — a brown-tinted dark gray that keeps the system's warmth even in its quietest elements |
| Bone White | `#ffffff` | Card surfaces that need to pop above Parchment, badge fills, and the base for inverse-on-color elements |
| Smoke | `#e2e2e2` | Subtle background lift and pill backgrounds on light elements where Parchment is too close to the canvas |
| Linen | `#dcd8cf` | The faintest warm neutral — used for stroke accents and very low-contrast section backgrounds |
| Highlight Green | `#3e6b15` | Green accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Marker Yellow | `#ffdd33` | Yellow state accent for badges, validation surfaces, and short status labels. |
| Edit Orange | `#ff6137` | Orange accent for outlined action borders, linked labels, and lightweight interactive emphasis |
| Markup Purple | `#b26dc2` | Pink accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Comment Blue | `#0097e6` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Sticky Pink | `#f5c4cc` | Soft pink annotation accent — used as a desaturated highlight wash where a more aggressive color would overpower the text underneath |
| Olive Gold | `#aa7e2e` | Workflow stage active marker (the filled square in the Draft/Design/Review sidebar) and muted annotation accent — a brass tone that ages the system slightly |
| Mustard | `#bbb809` | Vivid yellow-olive accent for highlighted text borders and decorative annotation ink — sits between Marker Yellow and Olive Gold in the annotation palette |

## Typography

### ABC Social — Primary brand and UI typeface. The 108px and 72px sizes at weight 700 form the editorial poster headlines (e.g. "Write clearly. Collaborate effortlessly.") with aggressive negative tracking; the 18–25px range at weight 400–700 carries body and subheadings; 13px at weight 300–400 with positive tracking handles small caps and utility text. The custom font's geometric, slightly humanist letterforms are the system's signature — they carry the marker-stroke feel that the color palette is built to match.
- **Substitute:** Inter, GT Walsheim, or Söhne
- **Weights:** 300, 400, 700
- **Sizes:** 13, 16, 18, 25, 26, 35, 72, 108
- **Line height:** 0.89, 1.00, 1.05, 1.20, 1.43
- **Letter spacing:** -4.32px at 108px, -2.88px at 72px, -0.52px at 26px, -0.50px at 25px, -0.22px at 18px, -0.16px at 16px, 0.10px at 13px
- **OpenType features:** `"ss07" on`

### ABC Social Extended — Used for emphasis-level headlines and section openers (the 43–86px range) and for a slightly wider proportion on body sizes where extra room helps readability — e.g. feature descriptions and product UI labels. Pairs with ABC Social to add scale variation without leaving the family.
- **Substitute:** Inter Display, GT Walsheim Wide
- **Weights:** 400, 700
- **Sizes:** 16, 18, 24, 36, 40, 43, 86
- **Line height:** 0.88, 1.00, 1.05, 1.20, 2.63
- **Letter spacing:** -1.98px at 86px, -0.99px at 43px, -0.88px at 40px, -0.79px at 36px, -0.24px at 24px, -0.18px at 18px, 0.32px at 16px
- **OpenType features:** `"ss07" on`

### ABC Social Condensed — Reserved for short, high-impact labels and badges — the heavy condensed weight compresses copy into a tight pill block, often sitting inside a colored capsule (e.g. the "CONVERT" sticker). Treated as a display utility, not a running face.
- **Substitute:** Bebas Neue, Anton, or Druk Wide
- **Weights:** 900
- **Sizes:** 35
- **Line height:** 1.20
- **Letter spacing:** -0.35px at 35px
- **OpenType features:** `"ss07" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.43 | 0.1px |
| body-sm | — | — | 16px | 1.43 | -0.16px |
| body | — | — | 18px | 1.43 | -0.22px |
| subheading | — | — | 26px | 1.2 | -0.52px |
| heading-sm | — | — | 35px | 1.2 | -0.35px |
| heading | — | — | 43px | 1.05 | -0.99px |
| heading-lg | — | — | 72px | 1 | -2.88px |
| display | — | — | 108px | 0.95 | -4.32px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 60-80px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **nav:** 9999px
- **tags:** 9999px
- **cards:** 12px
- **images:** 12px
- **inputs:** 28px
- **buttons:** 9999px

## Components

### Filled Black CTA Button
**Role:** Primary action — "Get a Demo", "Get Started"

India Ink (#000000) filled pill, white text in ABC Social weight 700, ~14–16px font size, padded ~8px vertical / 15px horizontal. Fully rounded (9999px). 1px hairline border in the same black to sharpen the edge against Parchment. The system has no chromatic CTA — this black pill IS the action.

### Ghost Text Button
**Role:** Secondary action — "Get Started Free", "Book a Demo"

Transparent background, India Ink (#000000) text, no border, ~16px ABC Social weight 400. Sits inline to the right of the filled CTA. Optionally takes a thin underline or a trailing arrow glyph on hover.

### Pill Navigation Item
**Role:** Top nav links — Product, Solutions, Resources, Enterprise, Pricing

ABC Social weight 400 at 16px, India Ink (#000000) on Parchment (#f7f5f3). Items that open a menu carry a small downward chevron. Active state is indicated by weight 700 rather than underline. No background fill on default — the pills are shape-only.

### Annotation Highlighter
**Role:** Applied over running text to mark a word or phrase for review

A solid color block (Highlight Green, Marker Yellow, Edit Orange, Markup Purple, Comment Blue, Sticky Pink, Olive Gold, or Mustard) sits behind selected words, extending slightly above the cap height and below the baseline in an irregular stroke. Text remains India Ink on top, weight 700. The shape is hand-drawn, not a clean rectangle — this is the system's defining visual gesture.

### Status Tag
**Role:** Small label indicating review/approval state — e.g. "Reviewing"

ABC Social Condensed weight 900 at 13px, India Ink text on Highlight Green (#3e6b15) background, padded ~3px vertical / 8px horizontal, fully rounded (9999px). A tiny white flag/check icon sits to the left of the label. Sits as a tab on the upper-left corner of the annotated word.

### Assign Dropdown Pill
**Role:** Inline assignment control next to annotated copy

Highlight Green (#3e6b15) pill, white text at 13px ABC Social weight 400, padded ~6px vertical / 10px horizontal, 9999px radius. Contains a small avatar glyph and the assignee name. Expanding it reveals a list of team members in a white card with 12px radius and a 1px Linen border.

### Pill Sticker
**Role:** Decorative label floating over annotated text — e.g. "CONVERT"

Comment Blue (#0097e6) or Markup Purple (#b26dc2) capsule, ~20px tall, ABC Social Condensed weight 900 at 14px, white text, 9999px radius. Rotated 2–4° to feel placed rather than designed. Anchors a word without forming a full highlighter block.

### Workflow Stage Indicator
**Role:** Left rail showing the copy lifecycle — Draft, Design, Review, Translate, Personalize

Vertical list, 24px row height, ABC Social weight 400 at 18px. Active stage is marked with an Olive Gold (#aa7e2e) filled square (~24×24px, 0px radius) and weight 700 label. Inactive stages use a 1px border dot in Graphite Warm (#6a6559) and weight 400 label. The active square is the only filled chrome element in the rail.

### Product Screenshot Card
**Role:** Framed product UI shown in feature sections

Bone White (#ffffff) surface, 12px radius, 1px solid Linen (#dcd8cf) border, no shadow. Internal padding is structural only (the screenshot fills the card). Sits at the center of feature sections against the Parchment canvas.

### Input Field
**Role:** Text input inside the product UI

Bone White (#ffffff) fill, 1px solid #dcd8cf border, 28px corner radius (the highest non-pill radius in the system). ABC Social weight 400 at 16px, Charcoal Warm (#222222) text. Focus state swaps the border to India Ink (#000000) at 1.5px — no glow ring.

### Trust Logo Strip
**Role:** Row of customer logos beneath the hero

Single horizontal band on Parchment (#f7f5f3), logos rendered in Charcoal Warm (#6a6559) at uniform 20–24px height, spaced ~60–80px apart. A small italic label ("8,000+ teams trust Ditto") sits in the center in 13px ABC Social italic, flanked by the logos. No boxes, no card backgrounds — the logos float directly on the canvas.

### Announcement Banner
**Role:** Top-of-page product news bar

Markup Purple (#b26dc2) full-bleed band, ABC Social weight 400 at 14px, white text, centered, ~36px tall. Carries a small product icon and an inline arrow. Dismissable; sits above the nav.

## Do's and Don'ts

### Do
- Use the annotation palette (Highlight Green, Marker Yellow, Edit Orange, Markup Purple, Comment Blue, Sticky Pink, Olive Gold, Mustard) only as ink over running text or as small pill stickers — never as section backgrounds, never as card fills.
- Set the primary action to the Filled Black CTA: India Ink (#000000) fill, white text, weight 700, 9999px radius, ~8px 15px padding. Every page gets exactly one.
- Type display headlines in ABC Social weight 700 at 72–108px with -0.04em letter-spacing. The aggressive negative tracking on huge sizes is the system's signature — do not normalize to 1.0em.
- Apply the Parchment (#f7f5f3) canvas at 100% of the page. The only elevated surface is Bone White (#ffffff) for cards and product UI frames.
- Activate the "ss07" stylistic set on all three ABC Social variants. The alternate letterforms are part of the brand identity, not optional.
- Keep all buttons, tags, and nav items at 9999px radius. Reserve 12px for product screenshot cards and 28px for input fields only.
- Pair every annotation highlighter with India Ink text on top — the contrast ratios against the bright colors all clear AAA at #000000.

### Don't
- Do not introduce a chromatic CTA color. The system has no blue, green, or red filled button — the primary action is always the black pill.
- Do not use drop shadows, blur, or glassmorphism. All depth is surface contrast and 1px borders.
- Do not add gradients. The entire palette is flat ink on flat paper.
- Do not use the annotation colors as decorative section washes, hero backgrounds, or card fills — they lose meaning when they stop being markup.
- Do not mix two annotation colors on the same word. One color per highlight, ever.
- Do not set body text below 16px in ABC Social. The 13px caption is the floor, and only for utility labels with positive tracking.
- Do not straighten annotation highlighters into perfect rectangles — the slightly irregular block shape is what makes the system read as a markup tool rather than a CSS demo.

## Elevation

The system has no shadows. All depth comes from warm Parchment-to-white surface contrast and 1px hairline borders. Components are made distinct by shape (pill, full pill, 28px input) and color block, not by drop shadow or blur.

## Surfaces

- **Canvas** (`#f7f5f3`) — The page and most section backgrounds — the warm paper the system is printed on.
- **Card Lift** (`#ffffff`) — White surfaces for cards, dropdowns, and product screenshot frames that need to float above the Parchment.
- **Subtle Lift** (`#e2e2e2`) — Near-white surfaces for secondary pills, ghost states, and the lightest table-row alternation.

## Imagery

Visuals are almost entirely first-party: product screenshots framed in 12px-radius white cards, and text that functions as its own graphic. The only photography-adjacent content is the customer logo strip, which is rendered as monochrome Charcoal Warm marks on Parchment — no lifestyle photography, no full-bleed hero images, no abstract graphics. Icons throughout are simple stroke glyphs (the flag on the Reviewing tag, the chevrons in dropdowns) at 1.5–2px weight. The product screenshot in the workflow section uses warm grays and the same black type as the marketing site, so the editorial identity carries into the product chrome seamlessly.

## Layout

The page is a vertical scroll of full-bleed Parchment sections, each capped at a 1200px content column. The hero is centered with a 108px headline and a single pair of CTAs; below it, a horizontal trust logo strip breaks the rhythm. Feature sections alternate between centered text stacks and left-text/right-visual compositions, with 60–80px of vertical breathing room between blocks. The nav is a single floating row with the logo left, links centered/right, and the black CTA anchored far right. Sections that need emphasis (the workflow stage section) use a thick Olive Gold left border on a white card to create the only structural chrome in the system. No dark sections, no asymmetric grids — everything centers around the warm cream canvas.

## Similar Brands

- **Notion** — Same warm off-white default canvas with bold, high-contrast black type and pill-shaped UI controls — the cream + black + rounded geometry is a close cousin.
- **Loom** — Editorial-feel marketing site with heavy display type, full-bleed soft backgrounds, and a single saturated accent (their purple) used as small functional punctuation rather than decorative fills.
- **Figma Config** — Same marker/highlighter visual metaphor — saturated colors applied as ink over large editorial headlines, with no shadows and no gradients, the system reads as live markup.
- **Linear** — Pill-shaped buttons, no shadows, flat surface contrast, and a single dark CTA color (black) where competitors would reach for a chromatic primary.
