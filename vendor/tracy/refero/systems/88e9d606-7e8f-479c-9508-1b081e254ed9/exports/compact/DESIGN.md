# Marco — Style Reference
> Moleskine notebook in cool morning light — a personal workspace where widgets float like sticky notes on warm paper.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Marco's site reads like a personal workspace laid out on cool paper: a near-white canvas, furniture-soft cards, and dense but breathable type that feels like a Moleskine spread in morning light. The layout is a disciplined two-column grid — a long-form manifesto on the left, a stack of embedded widgets, app screenshots, and avatar cards on the right — held together by generous rounded corners and whisper-light shadows. Color is rationed: 99% of the page is neutral, with violet and coral-pink appearing only as tiny functional punctuation for active links, the 'Work' status dot, and one warm gradient card. Typography is the main voice — three custom geometric sans-serifs (Maison Neue, Graphik, Neue Montreal) layered with careful tracking shifts, wide on micro-labels and tightening on larger display sizes.

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris Glow | `#6366f1` | Violet accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Signal Blue | `#1685c7` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Ember Red | `#e92f48` | Red wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Coral Pulse | `linear-gradient(16deg, rgb(255, 77, 121), rgb(255, 128, 64) 85%)` | Gradient start and secondary accent — used sparingly on warm cards and the pink-orange wash |
| Sunset Amber | `#ff8040` | Gradient end — the warm terminal of the coral-to-orange wash used on featured cards |
| Ink | `#000000` | Headings, strong borders, icon fills — the heaviest text weight and the sharpest structural lines |
| Graphite | `#333333` | Primary body text and the workhorse border color — appears more than any other color, forming the connective tissue of the layout |
| Slate | `#707070` | Secondary headings and muted borders |
| Cool Gray | `#6b7280` | Body and helper text where lower contrast is acceptable |
| Steel | `#7e8389` | Subtle text and quiet borders |
| Fog | `#949494` | Tertiary text and disabled-leaning borders |
| Pearl | `#dedee0` | Hairline borders, icon containers, and link outlines that need to recede |
| Mist | `#cccccf` | Soft surface tints and the lightest structural dividers |
| Paper | `#ffffff` | Card surfaces and elevated content — sits one step above the page canvas |
| Linen | `#f7f7f9` | Page canvas and the base of the surface stack |
| Ash | `#f2f2f2` | Secondary surface for nested elements and subtle backgrounds |
| Cream | `#fff9ed` | Warm accent card surface — the only place the system breaks from cool neutrals |
| Lavender Mist | `#eff0ff` | Active and hover wash — the soft halo behind selected links and cards |
| Rose Glow | `#f8c1c8` | Tinted shadow color for warm cards — a blush offset shadow that ties to the coral accent |

## Typography

### Maison Neue — Primary body and UI text. Weight 400 for running copy, 600 for emphasis. The 40px size anchors the manifesto headlines. Substitutes: Inter, Söhne, General Sans
- **Substitute:** Inter
- **Weights:** 400, 600
- **Sizes:** 12px, 14px, 40px
- **Line height:** 1.00, 1.43, 1.67
- **Letter spacing:** 0.007em consistently
- **OpenType features:** `"ss01" on, "cv11" on`

### Graphik — Links, buttons, card titles, and section headings. The workhorse for anything interactive or navigational. Substitutes: Inter, Untitled Sans, Söhne
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 14px, 16px, 20px, 31px
- **Line height:** 1.25, 1.38, 1.43, 1.50
- **Letter spacing:** -0.013em at 31px, positive 0.005–0.014em at smaller sizes — headlines tighten, body loosens

### Neue Montreal — Micro-labels, tags, metadata, and tracked-out captions. The wide tracking at small sizes is the signature move — it makes 8–12px text feel like printed stationery, not UI chrome. Substitutes: Neue Haas Grotesk, Inter Tight, Monument Grotesk
- **Substitute:** Inter Tight
- **Weights:** 400, 500
- **Sizes:** 8px, 10px, 12px, 14px, 16px, 18px, 20px, 22px, 24px, 26px
- **Line height:** 1.00, 1.11, 1.13, 1.20, 1.25, 1.45, 1.67
- **Letter spacing:** 0.2em at 8px → 0.05em at 26px — inverse tracking curve where the smallest labels are widest

### SF Pro Display — System font fallback for native-feeling status bar text and a few embedded contexts. Rarely the primary face.
- **Substitute:** SF Pro Display
- **Weights:** 400, 600
- **Sizes:** 8px, 11px, 16px
- **Line height:** 0.75, 1.40, 1.63, 1.82
- **Letter spacing:** -0.0040em, 0.0130em, 0.0180em

### Chirp — Twitter embed text — appears only inside embedded tweet widgets, never used for first-party content
- **Substitute:** Chirp
- **Weights:** 400, 700
- **Sizes:** 16px, 17px, 24px
- **Line height:** 1.20, 1.35, 1.40

### Bluu suuperstar — Display/decorative accent — used at most three times on the page for a single moment of personality. The 38px size is the signature flourish.
- **Substitute:** Recoleta
- **Weights:** 700
- **Sizes:** 15px, 16px, 38px
- **Line height:** 1.00, 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| label-sm | — | — | 10px | 1.2 | 0.75px |
| label | — | — | 12px | 1.25 | 0.6px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.38 | 0.1px |
| heading-sm | — | — | 24px | 1.25 | 0px |
| heading | — | — | 31px | 1.25 | -0.4px |
| display | — | — | 40px | 1.67 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 24px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 18px
- **icons:** 4px
- **images:** 12px
- **inputs:** 12px
- **buttons:** 100px
- **navPill:** 230px
- **widgets:** 32px

## Components

### Pill Navigation Bar
**Role:** Top-level site navigation

White capsule with 230px border-radius floating at the top center. Contains 4 nav links in a single horizontal row. Background #ffffff, no visible border, subtle shadow rgba(0,0,0,0.06) 0px 1px 2px. Height ~48px, padding 6px vertical.

### Nav Link with Status Dot
**Role:** Active navigation item indicator

Graphik 14px weight 500, color #333333. When active, a 6px Ember Red (#e92f48) dot sits to the left of the label with 6px margin. The active 'Work' item in the screenshot shows this pattern — the dot is the only color in the nav.

### Manifesto Card
**Role:** Long-form statement block on the left column

No visible card surface — text sits directly on the Linen canvas. Maison Neue 14px line-height 1.67, color #333333. The pattern is short declarative statements, each on its own line, creating vertical rhythm. Asterisk-prefixed footnotes in 12px at the bottom.

### Widget Embed Card
**Role:** Container for third-party app embeds (Notion, Twitter, etc.)

White #ffffff surface, 18px border-radius, 24px padding. Contains a small label header in Neue Montreal 12px with 0.05em tracking, followed by the embed content. Soft dual-layer shadow rgba(0,0,0,0.06) 0px 1px 2px, rgba(0,0,0,0.1) 0px 1px 3px.

### Avatar Profile Card
**Role:** Social identity display (Twitter handle, etc.)

White surface, 18px radius, 24px padding. Contains 40px circular avatar on the left, display name in Graphik 16px weight 600, handle in Graphik 14px weight 400 color #707070. A small action link (Twitter icon or 'Read mid tweets') sits at the bottom with an arrow.

### Gradient Feature Card
**Role:** Single warm-accent card that breaks the monochrome system

Coral Pulse to Sunset Amber gradient (16deg, #ff4d79 → #ff8040), 18px radius, 24px padding. White text. Graphik 20px weight 600 for the title, 16px weight 400 for body. One per page maximum — the warm hit that earns the rest being cool.

### App Icon Row
**Role:** Horizontal scroll of app/product icons

Series of 40–48px square icons (4px radius) in a horizontal row with 8px gaps. Each icon is the native brand mark — colorful, not custom-styled. Sits inside a Widget Embed Card.

### Phone Mockup Card
**Role:** iPhone screenshot embed

White surface, 12px radius, contains a phone-shaped image with its own internal radius. The phone image has rgba(0,0,0,0.25) 0px 1px 2px shadow. Sits inside a Widget Embed Card with 24px padding.

### Pill Link Chip
**Role:** Inline link with chromatic border

100px border-radius, Signal Blue (#1685c7) or Iris Glow (#6366f1) border 1px, transparent background, Graphik 14px weight 500 in the matching color. 8px 14px padding. Shadow rgba(0,0,0,0.25) 0px 1px 3px for subtle depth.

### Schedule Bar
**Role:** Availability sharing widget

White card, 18px radius, contains stacked time-zone rows in Graphik 14px. The primary 'Create new reply with availability' action is a full-width pill in the Coral Pulse gradient with white text, 100px radius, 14px 20px padding.

### Color Swatch Row
**Role:** Multi-color tag/label row

Horizontal row of 8px-radius pill chips, each with a different pastel background (pink, yellow, green, blue, purple). Neue Montreal 12px label text, 100px radius, 6px 12px padding. Functions as category filters or status tags.

### Tracked Label
**Role:** Small section header or metadata tag

Neue Montreal 12px weight 500, letter-spacing 0.05em, color #707070. Often paired with a 4px colored dot prefix (violet, green, orange, red) to create a tagged-list pattern.

## Do's and Don'ts

### Do
- Use 18–32px border-radius on all card surfaces — sharp corners break the soft-furniture feel
- Use 100px+ radius for all interactive elements (links, tags, buttons) to maintain the pill vocabulary
- Apply the inverse tracking curve: Neue Montreal at 8–12px needs 0.05–0.2em letter-spacing, Graphik at 31px needs -0.013em
- Keep chromatic colors to single-pixel punctuation — one dot, one border, one gradient card per region
- Use the Coral-to-Amber gradient on at most one card per page; the rest of the system stays cool
- Place widgets and embeds in the right column with 24px padding and 18px radius — never let them touch the page edge
- Pair a 4px colored dot with Neue Montreal tracked labels to build tagged-list patterns

### Don't
- Don't fill buttons with chromatic colors — the system uses outlined and pill links, not filled CTAs
- Don't use shadows deeper than 3px blur — elevation should whisper, not announce
- Don't apply the cream (#fff9ed) or gradient surface to more than one element per view
- Don't use sharp 0–4px radii on card surfaces — reserve those for icons and small UI only
- Don't break the two-column rhythm: manifesto left, widgets right, never full-width text blocks
- Don't use system fonts for body copy — the custom geometric sans-serifs are the voice
- Don't use black (#000000) for body text — reserve it for headings and strong borders, use Graphite (#333333) for running text

## Elevation

- **Embedded images and screenshots:** `rgba(0, 0, 0, 0.25) 0px 1px 2px 0px`
- **Widget cards:** `rgba(0, 0, 0, 0.06) 0px 1px 2px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px`
- **Link chips with border:** `rgba(0, 0, 0, 0.25) 0px 1px 3px 0px`
- **Tinted warm card:** `Box shadow tinted with #f8c1c8 for a blush offset`

## Surfaces

- **Linen Canvas** (`#f7f7f9`) — Page background — the cool paper the whole layout sits on
- **Paper Card** (`#ffffff`) — Primary card surface for widget and embed containers
- **Cream Card** (`#fff9ed`) — Warm accent surface for one featured card per page
- **Ash Surface** (`#f2f2f2`) — Nested element backgrounds inside cards
- **Lavender Wash** (`#eff0ff`) — Active state and hover halo

## Imagery

The visual language is embed-driven rather than illustrated: product screenshots from native apps (Notion, iPhone, Figma, Word), colorful third-party app icons, real photography (a coastal landscape photo appears in the widget grid), and the Twitter blue checkmark badge. All images sit inside white cards with 12px radius and soft 1–2px shadows. No custom illustration system, no abstract graphics, no 3D renders. The philosophy is: show the real tools, not representations of them. Full-bleed photography is rare; most visuals are contained within card boundaries at 4–12px radius. The color treatment of native app icons is left untouched — the violet Notion, red Figma, and blue Word marks provide the only multicolor moments in an otherwise neutral system.

## Layout

The page uses a two-column grid at max-width 1200px, centered on the Linen (#f7f7f9) canvas. The left column (~40%) holds long-form manifesto text in a single vertical stack of declarative statements, with no card surface — text floats directly on the canvas. The right column (~60%) holds a masonry-like stack of widget cards of varying heights: Notion workspace previews, app icon rows, phone mockups, avatar cards, and one warm gradient card. Navigation is a single pill-shaped capsule centered at the top of the page with 230px radius. A 'Look around...' prompt sits in the top-right corner. The rhythm is consistent: 24px gap between widgets in the right column, breathing room around the left column text, and a max of 24px section padding. The overall density is compact but never cramped — cards have generous internal padding (24px) while the gaps between them stay tight.

## Similar Brands

- **Read.cv** — Same personal-workspace aesthetic: two-column layout with manifesto-style left text, widget/embed right column, generous rounded corners on cards, and near-monochrome palette with a single warm accent card
- **Bento.me** — Similar compact grid of link cards with pill-shaped interactive elements, soft shadows, and the 'embed your real tools' philosophy of showing native app icons rather than custom illustrations
- **Are.na** — Same restrained typography, generous whitespace, and the discipline of using color only as functional punctuation rather than decorative fills
- **Linear** — Shares the custom geometric sans-serif typography approach and the use of subtle 1–3px shadows on elevated surfaces rather than dramatic elevation
- **Notion** — The widget-embed card pattern directly mirrors Notion's embed blocks — white surface, 18px radius, soft dual-layer shadow, small tracked label header
