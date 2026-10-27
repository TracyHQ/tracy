# Kraken — Style Reference
> violet ledger on frosted glass — a precise financial document where one electric purple ink does all the talking.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Kraken is a light-mode crypto exchange interface that reads like a precise financial ledger: a near-white canvas (#ffffff, #f6f5f9), near-black typography (#101114) at very high contrast, and one signature violet (#7132f5) that appears sparingly as brand punctuation on headlines, icons, links, and the primary action. Surfaces stay almost weightless — cards float on a barely-there 3% black shadow with 4px/24px blur rather than hard borders, so the whole UI feels printed rather than boxed. The system uses two custom typefaces: Kraken-Product (400/500) for all UI and body text from 10–16px, and Kraken-Brand (400/700) for 20–48px display with tight negative tracking (-0.0210em to -0.0140em) that compresses headlines into a confident, compact block. Information density is high and deliberately so: nav bars, asset tickers, stat grids, and news cards pack together with 12px gutters, letting the white space between sections do the breathing.

## Colors

| Name | Value | Role |
|------|-------|------|
| Kraken Violet | `#7132f5` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Deep Iris | `#2e3350` | Dark surface backing for the brand radial gradient and darker brand moments |
| Midnight Ink | `#202333` | Dark surface backing paired with violet gradients, section-level dark accents |
| Ink Black | `#101114` | Primary text, headlines, icon strokes, and input borders — the dominant ink at 18,000+ occurrences |
| Pure White | `#ffffff` | Page canvas, card surfaces, input fills, and button text |
| Linen Mist | `#f6f5f9` | Subtle off-white for alternating section bands and the hero background tint |
| Fog Border | `#d4d4dc` | Hairline dividers and disabled button borders |
| Steel Slate | `#686b82` | Secondary body text, icon tints, muted nav labels, secondary button text |
| Ash | `#9497a9` | Tertiary text and low-emphasis icon strokes |
| Graphite | `#484b5e` | Hover and active states on dark elements, deep nav accents |
| Lilac Wash | `#e4dcf9` | Soft violet-tinted background for ghost buttons and tag highlights |
| Bull Green | `#08844f` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Mint Badge | `#d2e7e1` | Light supporting surface for subtle backgrounds and section separation. Use as a supporting accent, not as a status color |
| Bear Red | `#d11d45` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Forest Seal | `#026b3f` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |

## Typography

### Kraken-Product — The single workhorse for body, nav, buttons, badges, inputs, and table rows — 16px/1.40 for primary body, 14px/1.43 for secondary text and nav, 12px/1.33 for badges and helper text, 10px/1.00 for micro-labels. Weight 500 carries emphasis (numbers, labels) without jumping to a heavy weight, keeping the interface uniformly lean.
- **Substitute:** Inter (400, 500)
- **Weights:** 400, 500
- **Sizes:** 10px, 12px, 14px, 16px
- **Line height:** 1.00–1.71

### Kraken-Brand — Display and headline typeface — 48px for hero H1 at weight 700 with -0.0210em tracking, 36px for section H2s, 24px for card titles, 20px for subheadings. The custom cuts give a slightly condensed, slightly geometric profile that compresses nicely under negative tracking to read as one tight block rather than airy editorial type.
- **Substitute:** Inter (700) or General Sans Bold
- **Weights:** 400, 700
- **Sizes:** 20px, 24px, 36px, 48px
- **Line height:** 1.17–1.40
- **Letter spacing:** -0.0210em, -0.0140em

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1 | 0px |
| body-lg | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.33 | -0.28px |
| heading-sm | — | — | 24px | 1.33 | -0.34px |
| heading | — | — | 36px | 1.22 | -0.76px |
| display | — | — | 48px | 1.17 | -1.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 12px

### Border Radius

- **cards:** 8px
- **icons:** 9999px
- **pills:** 9999px
- **badges:** 9999px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary Brand Button
**Role:** The single filled action across the product — Sign up, Get started, Buy now

Filled with Kraken Violet #7132f5, white text at 14px Kraken-Product weight 500, padding 10px 20px, border-radius 8px, subtle 0px 1px 4px rgba(16,24,40,0.04) shadow. The 8px radius (not 9999px) on the primary action is a deliberate choice — it reads as a confident rectangular control, while pills elsewhere handle the softer roles.

### Ghost Button
**Role:** Secondary actions and inline link-buttons

Transparent background, Lilac Wash #e4dcf9 on hover, Ink Black #101114 text at 14px weight 500, border-radius 8px, padding 10px 20px. No border by default — relies on fill change to signal interactivity.

### Outline Text Link
**Role:** Inline text links and tertiary nav actions

Ink Black #101114 text at 14px weight 500 with violet underline on hover; the link sits flush with body text, no pill or border.

### Email Input
**Role:** Hero email capture and form fields

White fill, 1px Ash #9497a9 border, border-radius 8px, padding 12px 16px, placeholder text in Steel Slate #686b82. Focus state tightens border to Ink Black #101114 with no colored ring — the border itself darkens to signal focus.

### Pill Tab
**Role:** Tab strip selectors (Popular, Rewards, Stablecoins, Newly listed)

Border-radius 9999px, padding 6px 16px, Kraken-Product 14px weight 500. Inactive: Ink Black text on white. Active: Ink Black text on Linen Mist #f6f5f9 — the active state inverts through a soft fill, never through a colored highlight.

### News/Feature Card
**Role:** Editorial cards in the horizontal news rail (MICA licensed, F1, Proof of Reserves, etc.)

White surface, border-radius 8px, the signature 0px 4px 24px rgba(0,0,0,0.03) shadow. Header image fills the top edge to the card's 8px corners (no separate image frame). Title in Kraken-Product 14px weight 500, meta line (read time) at 12px in Steel Slate. Brand-tinted cards replace the white header with the violet radial gradient for branded announcements.

### Brand Gradient Card
**Role:** Hero brand cards (Kraken Is Officially MICA Licensed) and decorative feature tiles

Background is the radial gradient rgb(145,107,230) → rgb(105,47,228) → rgb(79,36,173) positioned at 93.96% -5.23%, giving an off-center bloom. White logo or white headline text overlays. Border-radius 8px, no shadow — the gradient itself is the visual weight.

### Stat Block
**Role:** Three-up metrics (651 Crypto assets, 190+ Countries, $2T+ Volume)

Centered in a horizontal band. Number in Kraken-Brand 36px weight 700 with -0.76px tracking. Label in Kraken-Product 14px weight 400 in Steel Slate #686b82, one line below. No dividers between blocks — spacing alone separates them.

### Crypto Asset Row
**Role:** Ticker rows in the portfolio section (Solana, Polkadot, Dogecoin, etc.)

Single horizontal row: circular token icon left, ticker symbol in Kraken-Product 14px weight 500, price right-aligned in 14px weight 500, change percentage in 12px in Bull Green #08844f or Bear Red #d11d45. Row gap 12px, no dividers between rows — whitespace alone separates.

### Success Badge
**Role:** Status pills for verified/confirmed states

Mint Badge #d2e7e1 background, Forest Seal #026b3f text and border, border-radius 9999px, padding 2px 10px, Kraken-Product 12px weight 500. The green-tint palette is muted enough to not compete with the violet brand.

### QR Download Block
**Role:** App download callout beside the email signup

Small inline block: QR code graphic on the left, two-line text on the right ('Download the Kraken app') in Kraken-Product 14px weight 500, no border, no card — floats directly on the Linen Mist section.

### Phone Mockup
**Role:** Hero right-side product showcase

A photographic iPhone render tilted slightly, showing the portfolio screen with a violet price chart line. No frame border — the phone is the visual, and its angle gives the otherwise flat layout a single moment of dimensionality.

### Horizontal Carousel
**Role:** Scrollable news/feature rail

Cards arranged in a single horizontal row, 16px column gap, 20px row gap to the section heading. Navigation arrows (right-pointing chevrons) sit top-right of the section header in a small circular button.

## Do's and Don'ts

### Do
- Use Kraken Violet #7132f5 as the only saturated color across the interface — one accent, no second chromatic voice.
- Set headlines at 48/36/24px in Kraken-Brand weight 700 with -0.0210em to -0.0140em letter-spacing; the negative tracking is what makes the type read as one confident block.
- Keep cards on the 0px 4px 24px rgba(0,0,0,0.03) shadow — do not increase opacity or blur to gain attention; use a bigger headline instead.
- Default to 8px radius on buttons, inputs, and cards; reserve 9999px for pills, badges, and icon containers only.
- Compose sections on the #ffffff → #f6f5f9 alternation for rhythm; a violet gradient card is a once-per-section punctuation, not a recurring surface.
- Use Kraken-Product 14px/1.43 for body, 12px/1.33 for meta, 10px/1.00 for micro-labels — stay inside this scale and do not invent new sizes.
- Express state changes through fill, not color: tab active = Linen Mist fill, input focus = border darkens to Ink Black, no violet focus rings.

### Don't
- Do not introduce a second accent color. Green and red are reserved for semantic price-change indicators — never use them for buttons, icons, or decorative elements.
- Do not use 9999px radius on the primary action button — that radius belongs to pills, badges, and icons. The CTA stays at 8px.
- Do not add a colored focus ring (violet glow) to inputs; the 1px border darkening to #101114 is the focus signal.
- Do not use Kraken-Brand for body text — its minimum size is 20px. Body, nav, badges, and table rows belong to Kraken-Product only.
- Do not layer multiple shadows or add colored elevation tints. The single 3%-black shadow is the entire elevation system.
- Do not place white text on the full-strength Kraken Violet #7132f5 for body paragraphs — it works for short labels and CTAs but degrades at paragraph length. Use white on the deeper gradient end (#4f24ad) for longer reading.
- Do not use rgba(0,0,238) blue or any browser-default link color — all links are Ink Black with optional violet underline.

## Elevation

- **Card:** `0px 4px 24px 0px rgba(0, 0, 0, 0.03)`
- **Button:** `0px 1px 4px 0px rgba(16, 24, 40, 0.04)`

## Surfaces

- **Canvas** (`#ffffff`) — Page background, the baseline everything sits on
- **Linen Band** (`#f6f5f9`) — Hero backdrop and alternating section bands for visual rhythm
- **Lilac Tint** (`#e4dcf9`) — Soft violet surface for ghost controls and tag chips
- **Mint Chip** (`#d2e7e1`) — Success status pill background
- **Brand Bloom** (`#7132f5`) — Brand decorative cards with radial gradient overlay

## Imagery

Photography is minimal and product-only: a single tilted iPhone render in the hero showing the portfolio screen with a violet price-chart line, and editorial header photos on the news rail (a colorful F1 racing scene, an abstract 3D sphere) that are tightly cropped to the card's 8px corners. The brand uses a radial violet gradient as a self-contained decorative surface for branded cards. Icons are line-style at 1.5–2px stroke, monocolor in Ink Black or Kraken Violet, no filled duotone variants. There is no lifestyle photography, no people, no environmental context — the product and brand marks are the visual content.

## Layout

The page is a max-width 1200px centered column with full-bleed Linen Mist (#f6f5f9) section bands. The hero is a split layout: left half carries a 48px headline, 16px subhead, email input + primary button stack, and a QR download block; the right half holds a single tilted phone render. Sections stack vertically with 64px gaps and alternate between white and Linen Mist to create rhythm without dividers. The news rail is a horizontal 4-card carousel with right-arrow nav. The portfolio section uses a centered heading with a pill tab strip beneath, then a 2-row compact ticker grid at 12px row gaps. Stat blocks are a 3-column equal grid at 24px+ column gaps, no dividers between columns. The navigation is a single horizontal bar — logo left, center links, language/search/login/signup right — no sticky variants, no mega-menus.

## Similar Brands

- **Stripe** — Same single-accent strategy — one signature violet on a white canvas — and the same compact, flat, near-shadowless card system that lets the brand color do the heavy lifting.
- **Coinbase** — Light-mode crypto interface with a single brand chromatic note, information-dense asset rows, and large confident display type on a near-white canvas.
- **Robinhood** — Financial-product clarity on a white canvas, with green/red reserved exclusively for price-change semantics and a single brand color for everything else.
- **Wise** — Clean light fintech aesthetic with a brand-tinted accent, hairline dividers, soft card shadows, and a tight custom-or-system type pair across a compact information layout.
- **Linear** — Compact information density, custom display type with negative tracking, and a preference for tone-based separation over heavy borders or shadows.
