# Dovetail — Style Reference
> Cream-paper editorial magazine on a sunlit table

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Dovetail reads like a printed editorial spread digitized — warm cream canvases, near-black ink, and a single buttery yellow accent that functions as a mood rather than a brand color. Typography is confidently oversized (72px display headlines) yet tightly tracked, giving the site a literary weight without heaviness. The signature visual device is the pill-shaped capability tag (91px radius), used as a stacking motif on the right rail. Components are flat: filled near-black buttons, ghost text links, and 16px-radius photo cards. Imagery alternates between detailed monochrome editorial illustration and full-color photography, with no shadows, gradients, or decorative effects — separation happens through whitespace and hairline borders.

## Colors

| Name | Value | Role |
|------|-------|------|
| Butter Cream | `#f9e5b1` | Hero and section canvas — the warm cream that defines the entire brand atmosphere |
| Ink Black | `#1d1e21` | Primary text, filled buttons, and the dark surface that anchors contrast — softer than pure black, warm against the cream |
| True Black | `#000000` | Illustration strokes, icon fills, and SVG detail work — only the darkest graphic elements |
| Warm Bone | `#fef9f3` | Card surfaces, secondary text on dark, and the lighter off-white that sits above the cream canvas |
| Ash Gray | `#e5e7eb` | Hairline borders, image outlines, subtle dividers, and neutral tag fills — the structural neutral that separates every section |

## Typography

### Lausanne — Single typeface for everything. Weight 400 carries body and nav; weight 600 is the workhorse for subheadings and button labels; weight 700 dominates display headlines at 48–72px. Letter-spacing tightens at display sizes (negative tracking) and opens slightly on small body text — a classic editorial rhythm. Its grotesque geometry with humanist warmth is what gives the site its literary feel; a neutral like Inter or Söhne could approximate it.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400, 600, 700
- **Sizes:** 20px, 22px, 28px, 32px, 48px, 72px
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.0100em at 72px, -0.0050em at 48px, 0.0050em at 22–28px, 0.0070–0.0100em at 20px and below

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 20px | 28 | 0.14px |
| body | — | — | 22px | 30 | 0.11px |
| subheading | — | — | 28px | 36 | — |
| heading | — | — | 32px | 40 | — |
| heading-lg | — | — | 48px | 56 | -0.24px |
| display | — | — | 72px | 72 | -0.72px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-96px
- **Card padding:** 28-32px
- **Element gap:** 24px

### Border Radius

- **cards:** 16px
- **buttons:** 9999px
- **navItems:** 9999px
- **pillTags:** 91px

## Components

### Filled Pill Button
**Role:** Primary call-to-action (e.g., 'Get in touch')

Near-black (#1d1e21) fill, white text (#fef9f3) at 16px weight 600, 9999px border-radius, 14px vertical padding × 16–20px horizontal padding. Sits as a compact, dark punctuation mark on the cream canvas.

### Ghost Text Link
**Role:** Secondary navigation or inline links (e.g., 'About us ↗', 'Learn more')

Ink Black text (#1d1e21) at 16–18px weight 400, no border, no fill. Often paired with an arrow glyph (↗) in 600 weight. Underline only on hover.

### Capability Pill Tag
**Role:** Stacking service/discipline labels (Capital, + Design, + Tech, + Strategy, + Finance)

Warm Bone (#fef9f3) fill with Ash Gray (#e5e7eb) 1px border, 91px border-radius, 20–24px vertical padding × 24–32px horizontal padding. Text at 22–28px weight 600. The extreme radius makes them read as soft lozenges that overlap visually when stacked.

### Editorial Illustration Panel
**Role:** Decorative hero or section illustration

Monochrome line-and-fill illustration in True Black (#000000) on the cream canvas. Detailed human figures, organic line work, no color. Functions as a visual counterweight to the typography on the right side of the hero.

### Photo Card
**Role:** Portfolio or team imagery in a grid

Color photograph with 16px border-radius, 1px Ash Gray (#e5e7eb) border, 32px internal padding context. No shadow — separation comes from the hairline border against the cream background.

### Section Divider
**Role:** Horizontal rule between major content sections

1px solid Ash Gray (#e5e7eb) line, full content-width, no decorative ornament. Provides the only visual break between sections on lighter pages.

### Brand Mark Glyph
**Role:** Logomark in nav (custom 'Ж' or ligature symbol)

Pure black (#1d1e21) filled geometric glyph, ~32–40px tall, positioned at far right of nav. Acts as a visual signature — the one purely symbolic element in the system.

### Wordmark Header
**Role:** Site title in nav (e.g., 'Dovetail')

Lausanne 700 at 32–48px, Ink Black, sits at far left of nav. Functions as a home link. Same treatment across all pages.

### Two-Column Split Section
**Role:** Primary content layout pattern

Max-width 1200px, 50/50 split. Left column: heading + body text + optional ghost link. Right column: stacked pill tags, illustration, or photo. Vertical alignment: top-aligned, with generous 32–48px gap between columns.

### Tagline Pill Cluster
**Role:** Vertical stack of capability tags on right rail

4–5 pill tags (91px radius) stacked with 8–12px row gap, right-aligned. Creates a visual list that reads as a word cloud of disciplines.

### Inline Tag Label
**Role:** Section identifiers like 'Our portfolio'

Ink Black text at 16–18px weight 600, no decoration, sits directly above section headlines as a one-word category marker.

## Do's and Don'ts

### Do
- Use #f9e5b1 (Butter Cream) as the dominant canvas for hero and feature sections — it is the brand's atmosphere, not just a background color
- Set display headlines at 48–72px in Lausanne 700 with negative letter-spacing (-0.0050 to -0.0100em) for editorial weight
- Use the 91px pill radius exclusively for capability/discipline tags; never apply it to buttons or cards
- Stack pill tags with 8–12px gaps to create the signature vertical column on the right rail of split sections
- Separate sections with 1px Ash Gray (#e5e7eb) hairlines rather than shadows or background changes
- Keep CTAs to a single dark filled pill — the button is punctuation, not a banner
- Pair text-only ghost links with an arrow glyph (↗) in weight 600 to signal off-page navigation
- Set body text at 20–22px with slightly positive tracking (0.0050–0.0070em) for the printed-page reading rhythm

### Don't
- Never use shadows or gradients — this system is completely flat; depth comes only from layering cream over cream and hairline borders
- Don't introduce additional accent colors — the entire system runs on Butter Cream, Ink Black, and Warm Bone plus two neutrals
- Don't apply 9999px (pill) radius to cards or image containers — pills are for interactive elements and tags only, cards stay at 16px
- Don't use display weight (700) for body copy — reserve it for headlines 28px and above; body sits at 400
- Never set body text below 18px — the editorial scale starts generous and stays generous
- Don't center-align long-form body text — left-align everything below 32px for readability
- Avoid overlapping decorative elements or z-axis layering — the layout is strictly horizontal and two-dimensional
- Don't add icon badges, avatars, or decorative dots — the system is typographically driven with imagery as the only visual accent

## Surfaces

- **Butter Cream Canvas** (`#f9e5b1`) — Hero and feature section backgrounds — the brand's signature warm surface
- **Warm Bone** (`#fef9f3`) — Card surfaces, pill tag fills, and lighter secondary sections
- **Ash Gray** (`#e5e7eb`) — Hairline borders, subtle dividers, and neutral structural elements
- **Ink Black** (`#1d1e21`) — Darkest surface — filled buttons, footer accents, and high-contrast panels

## Imagery

Two distinct visual modes alternate across the site. The first is detailed monochrome editorial illustration — fine-line human figures, organic shapes, filled-black elements — rendered in True Black on the cream canvas, functioning as a literary counterweight to large headlines. The second is full-color documentary-style photography (team portraits, workspace overheads) presented in 16px-radius cards with hairline borders. Both treatments are full-bleed within their containers and never overlap. The illustration carries the hero; photography carries the portfolio and about sections. No 3D renders, no abstract gradients, no product mockups — visuals are either drawn or shot, never generated.

## Layout

Max-width 1200px centered content on a full-bleed Butter Cream canvas. The nav is a single horizontal bar: wordmark left, text links center-right, brand glyph far right, with generous 32px horizontal padding. The hero is a full-viewport-height split — oversized headline left at 72px, editorial illustration right, dark CTA pill below the headline. Subsequent sections alternate between two-column splits (text-left / visual-right) and centered stacked headlines, each separated by a hairline divider rather than background changes. Card grids are simple 2-column with 24px gutters. The overall rhythm is slow and generous: 64–96px between sections, 32–48px between elements, no sticky navigation, no sidebar. The page reads top-to-bottom as a continuous editorial spread.

## Similar Brands

- **Klasse14** — Same warm cream-and-black editorial palette with a single accent-free canvas and oversized confident headlines
- **Aether Capital** — Similar near-black text on warm off-white with hairline borders and no shadows — the investment-firm-as-editorial-spread approach
- **Open Store** — Cream canvas, monochrome illustration paired with photography, and pill-shaped stacked capability tags as a signature motif
- **Antler** — Same two-column editorial layout with oversized serif-adjacent sans headlines and a single warm neutral canvas color
- **Northzone** — Light cream backgrounds, near-black ink, generous whitespace, and the same flat zero-shadow component treatment
