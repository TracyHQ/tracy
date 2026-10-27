# Podscan.fm — Style Reference
> Green-lit podcast radar on white paper — a quiet instrument panel where one emerald signal cuts through grayscale data.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Podscan.fm reads as a modern data-intelligence console on a crisp white canvas: monochrome foundation, one vivid emerald green as the single navigational north star, and a disciplined palette of categorical colors (violet, pink, blue, teal) used only to differentiate adjacent use-cases or pricing tiers. Typography is a system sans rendered tight — negative tracking at every size creates a compressed, data-display rhythm rather than editorial looseness. Components are flat, lightly bordered, rounded at 8–12px, and rely on hairline #e5e7eb dividers more than shadow for separation. Sentiment badges, colored icon disks, and tier-distinct CTA fills (black, green, violet) carry the color load, so a new page should feel mostly grayscale with green as the verb-action color and secondary hues appearing only as small functional punctuation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Emerald Signal | `#059669` | Green action color for filled buttons, selected navigation states, and focused conversion moments. |
| Mint Pulse | `#10b981` | Secondary green for iconography, category tags, and decorative emphasis where a lighter hue is needed |
| Onyx Ink | `#18181b` | Primary text, dark CTA fill, logo wordmark, elevated headings — the near-black that anchors every screen |
| Pure Canvas | `#ffffff` | Page background, card surfaces, button text on dark fills, input fields |
| Fog | `#f4f4f5` | Subtle surface lift for muted cards, table headers, tag backgrounds |
| Slate Whisper | `#71717a` | Muted helper text, link color in body copy, caption-level metadata |
| Graphite | `#52525b` | Secondary body text, table cell text, secondary nav items |
| Zinc Veil | `#a1a1aa` | Tertiary text, disabled controls, icon strokes at low contrast |
| Charcoal | `#3f3f46` | Strong secondary text, button label on light fills, table emphasis |
| Ash Border | `#e5e7eb` | Universal hairline border — the dominant structural divider between cards, inputs, table rows, and sections |
| Silver Trace | `#d4d4d8` | Secondary border on links and lighter dividers |
| Violet Tier | `#9333ea` | Advanced-plan CTA fill, Partnership/Discovery category icon, premium-tier accent — second tier-color signal |
| Indigo Spark | `#4f46e5` | Alternate violet for iconography and link emphasis where a cooler purple reads better |
| Pink Pulse | `#ec4899` | Audience Intelligence category icon, decorative accent strokes |
| Cobalt Signal | `#2563eb` | API & Data Platform category icon, link emphasis in body copy |
| Sky Veil | `#60a5fa` | Lighter blue for iconography and secondary accent strokes |
| Teal Trace | `#14b8a6` | Iconography accent, decorative stroke on category visuals |
| Sprout Wash | `#d1fae5` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Crimson Ink | `#b91c1c` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Rose Blush | `#db2777` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Forest Verdant | `#16a34a` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Marigold Spark | `#eab308` | Ideas nav marker, small highlight tokens, feature-flag dots |
| Mint Mist | `#ecfdf5` | Primary page canvas and white card surfaces |
| Sky Mist | `#eff6ff` | Soft blue-tint surface wash behind informational callouts |
| Lilac Mist | `#f3e8ff` | Soft violet-tint surface wash behind premium-tier highlights |

## Typography

### Inter Tight — Display and heading family — 60px weight 700 for hero headlines, 36px weight 700 for section titles, 24–30px weight 600 for subheadings. The compressed Inter Tight cuts width at every size, giving headlines a dense, data-screen weight rather than airy editorial feel. The 60px display sits at near-unity line-height (1.00), so it functions as a single stacked statement.
- **Substitute:** Inter Tight (closest free) → Inter, then system-ui sans-serif
- **Weights:** 400, 600, 700
- **Sizes:** 14, 20, 24, 30, 36, 60
- **Line height:** 1.00, 1.11, 1.20, 1.33, 1.40, 1.43
- **Letter spacing:** -0.029em at 14px (-0.41px), -0.025em at 20px (-0.5px), -0.020em at 24px (-0.48px), -0.017em at 30px (-0.51px), -0.013em at 36px (-0.47px), -0.011em at 60px (-0.66px)

### ui-sans-serif (system stack) — Workhorse body and UI family — 16px/1.50 weight 400 for paragraphs, 14px/1.43 weight 500 for labels and button text, 12px/1.33 weight 500 for caption and metadata, 18–20px weight 600 for emphasized body. Weight 600 carries nav and in-text emphasis; 700 is reserved for short uppercase-style labels. Negative tracking applied at every size keeps the system reading tight and tabular even in running text.
- **Substitute:** system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 18, 20, 30
- **Line height:** 1.20, 1.33, 1.38, 1.40, 1.43, 1.50, 1.56
- **Letter spacing:** -0.0330em, -0.0290em, -0.0250em, -0.0220em, -0.0200em, -0.0130em

### ui-monospace (system stack) — Inline code, transcript snippets, and tabular timestamps in feed cards — rendered at 12px with the same -0.033em tracking as UI text so monospace blocks sit flush with surrounding copy.
- **Substitute:** ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
- **Weights:** 400
- **Sizes:** 12
- **Line height:** 1.33
- **Letter spacing:** -0.0330em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.4px |
| body-sm | — | — | 14px | 1.43 | -0.41px |
| body | — | — | 16px | 1.5 | -0.4px |
| subheading | — | — | 20px | 1.4 | -0.4px |
| heading-sm | — | — | 24px | 1.33 | -0.48px |
| heading | — | — | 30px | 1.2 | -0.39px |
| heading-lg | — | — | 36px | 1.11 | -0.47px |
| display | — | — | 60px | 1 | -0.66px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 12px
- **pills:** 9999px
- **badges:** 9999px
- **inputs:** 12px
- **buttons:** 8px
- **largeCards:** 16px

## Components

### Primary Green CTA Button
**Role:** The dominant action verb — used for trial starts, monitor activations, and search submissions

Fill #059669, white text at 14px weight 600, padding 10px 20px, radius 8px, no border. On hover, gains a tinted green shadow at rgba(5,150,105,0.2) spread 15px. Sits with white text (not green text) — the dark-on-green contrast carries weight at 14px.

### Black Onyx CTA Button
**Role:** Secondary primary action — used in nav (Try Free) and as the Premium tier CTA

Fill #18181b, white text at 14px weight 600, padding 10px 20px, radius 8px. Functions as the neutral authority action when green is reserved for a higher-priority verb on the same screen.

### Violet Tier CTA Button
**Role:** Differentiates the Advanced/Enterprise pricing tier from other plans on the same page

Fill #9333ea, white text at 14px weight 600, padding 10px 20px, radius 8px. The single violet CTA on the pricing page — color itself communicates the tier above the price label.

### Ghost / Outline Button
**Role:** Secondary supporting action that pairs with a filled CTA on the same row

Fill #ffffff, 1px solid #e5e7eb border, text #18181b at 14px weight 600, padding 10px 20px, radius 8px. Used for 'See how it works' beside the green Start CTA.

### Navigation Bar
**Role:** Sticky top-level navigation on all pages

White background, 1px bottom border #e5e7eb, height 64px, horizontal padding 32px. Nav items at 14px weight 500 in #52525b, with the active/hover state at #18181b. Far-right contains a pill-shaped black 'Try Free' button with radius 9999px. Uses the subtle nav shadow 0px 1px 3px rgba(0,0,0,0.1) when sticky.

### Logo Wordmark Badge
**Role:** Brand mark in the top-left of the navigation

Pill-shaped container with #18181b fill, white 'podscan' wordmark, padding roughly 6px 14px, radius 9999px. The pill is the only dark element in the header besides the CTA button.

### Live Intelligence Feed Card
**Role:** The hero product surface — a real-time list of brand mentions, the system's primary value proof

White card, radius 12px, 1px #e5e7eb border, padding 16px, with an internal tab row at the top (Live Intelligence active, MCP for AI Agents and REST API inactive). Each row is 56–64px tall, contains a 32px square brand avatar, 2-line mention preview, timestamp at 12px in #71717a, and a sentiment badge aligned right. Tabs use a 2px emerald underline on the active tab.

### Sentiment Badge
**Role:** Color-coded classification chip on every feed row

Pill shape (radius 9999px), padding 2px 10px, 12px weight 500 text. Variants: Neutral — #f4f4f5 background, #52525b text; Positive — #d1fae5 background, #16a34a text; Negative — light rose background with #b91c1c text. Color is the only state differentiator — no icon inside.

### Hero Stat Line
**Role:** Triple-metric trust strip below the primary CTAs

Single horizontal row of three items separated by generous horizontal space, each item: a small 16px emerald green icon followed by a bold value (e.g. 4.6M+) in #18181b at 14px weight 600 and a muted descriptor in #52525b at 14px weight 400. No card or background — sits directly on the canvas.

### Use Case Card
**Role:** Top-of-funnel audience-segmentation cards (PR / Brand / Marketer)

White card, 1px #e5e7eb border, radius 8px, padding 20px. Left-aligned 24px emerald icon in a soft square, bold label at 14px weight 600 in #18181b, one-line descriptor at 13px in #71717a. Cards sit in a 3-column grid with 16px gaps.

### Database Search Bar
**Role:** Full-width search input for the episode database

Container is a single rounded input with radius 12px, 1px #e5e7eb border, padding 4px 4px 4px 16px. Inner text input is flush, 16px weight 400 in #18181b with placeholder in #a1a1aa. Trailing 36px square black submit button with white 'Search →' at 14px weight 600. Search-icon glyph sits inside the input at 16px in #71717a.

### Feature Category Card
**Role:** Four-card grid linking to the core product surfaces (Brand Monitoring, Partnership Discovery, API & Data, Audience Intelligence)

White card, 1px #e5e7eb border, radius 12px, padding 32px vertical / 24px horizontal, centered content. Top: 40px circular icon disk tinted in the category color (green, violet, blue, pink) with white glyph. Title at 18px weight 600 in #18181b below.

### Pricing Tier Card
**Role:** Three-tier pricing comparison surface

White card, radius 12px, 1px #e5e7eb border, padding 32px. Contains a category-tinted square icon (24px) top-left, tier name at 18px weight 600, large price at 36px weight 700 in #18181b with '/mo' at 14px in #71717a, billing-period subtext in #52525b. Feature list uses 14px weight 400 in #18181b with green check marks. The Professional card adds a 2px #059669 border and a 'Most Popular' emerald pill at the top-right edge.

### Most Popular Pill Badge
**Role:** Tier-selection indicator floating on the recommended plan

Emerald #059669 fill, white text at 12px weight 600, padding 4px 12px, radius 9999px, positioned overlapping the top border of the Professional pricing card.

### Text Input / Search Field
**Role:** Form input baseline for any text entry

1px #e5e7eb border, radius 12px, padding 12px 16px, 14px weight 400 text in #18181b, placeholder in #a1a1aa. On focus the border shifts to #059669 with a subtle green-tinted ring; no box-shadow otherwise.

## Do's and Don'ts

### Do
- Use #059669 as the single filled CTA color for the page's primary action verb; reserve Onyx #18181b for the secondary 'neutral' action and Violet #9333ea for enterprise-tier actions
- Set all body, subhead, and display text at negative letter-spacing between -0.4px and -0.66px — the tight tracking is what makes the system read as a data console rather than editorial
- Separate cards and panels with 1px #e5e7eb borders and 0–1px subtle shadows; reserve the rgba(0,0,0,0.1) 10-15px shadow for hover and the floating hero card only
- Differentiate categorical icons by hue (green = monitoring, violet = discovery, blue = API, pink = audience) and back them with 40px circular tinted disks from the Lilac/Mint/Sky Wash palette
- Keep page background at #ffffff and apply tinted washes (#ecfdf5, #eff6ff, #f3e8ff) only as 100px-ish callout blocks behind positive, info, or premium messaging
- Cap content at 1200px max-width with 32px gutter; use 64px vertical gap between major sections and 24px between card grid rows
- Use radius 9999px exclusively for pills, tags, badges, and the logo lockup — never for cards, inputs, or buttons

### Don't
- Don't introduce new saturated accent colors beyond the green/violet/blue/pink/teal set — the system has exactly five categorical hues and they are already mapped to specific roles
- Don't use 700-weight for anything other than the display hero (60px), large section titles (36px), and price numerals — heavy weight on body text breaks the console feel
- Don't apply gradients, drop shadows beyond the listed tokens, or blur effects — the design is deliberately flat and border-driven
- Don't use warm grays or off-white backgrounds; the canvas must be pure #ffffff and the only tinted surfaces are the three semantic washes
- Don't set border-radius above 16px on cards or inputs; the 12px max is what gives components their crisp, dashboard-like profile
- Don't place more than one emerald CTA on the same row; if multiple actions are needed, the secondary must be Ghost (white fill, #e5e7eb border) or Black (Onyx fill)
- Don't add decorative imagery, illustrations, or background patterns to the main page sections — the system communicates entirely through type, color-coded icons, and feed-row data

## Elevation

- **Subtle Card / Inline Element:** `0px 1px 2px 0px rgba(0, 0, 0, 0.05)`
- **Raised Card / Button Hover:** `0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)`
- **Nav Bar / Sticky Header:** `0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)`
- **Primary Green CTA Hover:** `0px 10px 15px -3px rgba(5, 150, 105, 0.2), 0px 4px 6px -4px rgba(5, 150, 105, 0.2)`
- **Floating Hero Card:** `0px 25px 50px -12px rgba(0, 0, 0, 0.25)`

## Surfaces

- **Pure Canvas** (`#ffffff`) — Default page background — the system sits on white, never off-white or warm cream
- **Fog Plate** (`#f4f4f5`) — First surface lift for table headers, muted background panels, and tag clusters
- **Mint Wash** (`#ecfdf5`) — Tinted success-positive callout surfaces, paired with green text and Sprout Wash badges
- **Sky Wash** (`#eff6ff`) — Tinted informational callout surfaces paired with blue accents
- **Lilac Wash** (`#f3e8ff`) — Tinted premium-tier callout surfaces paired with violet accents

## Imagery

The site is imagery-light by design — no hero photograph, no product screenshots, no decorative illustration. The visual centerpieces are the Live Intelligence feed rows (real brand logos cropped to 32px squares inside cards) and a small set of 24–40px category icons rendered as flat filled glyphs inside circular tinted disks. Icon style is flat, single-weight, mono-glyph with no outlines; categorical color (green/violet/blue/pink) does the differentiation work. The only atmospheric element is the floating hero card which sits on a soft 25px-50px black-tinted shadow, giving the product preview a slight 'lifted' feel against the otherwise flat canvas. The aesthetic is best described as a screenshot-first interface — the data IS the hero, not a stylized image of the data.

## Layout

Max-width 1200px centered layout with 32px outer gutters. The hero follows a centered-stacked text pattern: 60px display headline, 18px subhead, side-by-side primary + ghost CTAs, a single trust line, then a horizontal stat row. Below the hero, a full-bleed product surface (the Live Intelligence card) is the first thing the user sees — it overlaps the visual flow between hero and feature blocks. Section rhythm is a single alternating pattern of white-background sections separated by 64px vertical gaps; no dark/light band alternation. Content arrangement is centered-stacks for hero and pricing, 3-column equal grids for use-case and pricing cards, 4-column grid for feature category cards, and 2-column image+text alternation is not used — Podscan stays single-column or symmetric-grid throughout. The database search bar is a centered contained block (roughly 800px wide) sitting on a faint bordered card. Navigation is a single sticky 64px top bar with a right-aligned black pill CTA; there is no sidebar or mega-menu.

## Similar Brands

- **Brand24** — Same social/listening intelligence layout pattern — centered hero, live feed preview card, three-tier pricing with a green Most-Popular highlight
- **Mention** — Identical emerald-as-CTA color discipline on a white canvas, with 3-column use-case cards and a border-driven flat component system
- **Linear** — Same Inter Tight headline treatment with tight -0.5px tracking, dark-on-light primary buttons paired with ghost secondaries, and a hairline-border card aesthetic
- **Pinecone** — Same data-intelligence console rhythm — white canvas, single green primary action, categorical icon colors, and pricing tiers distinguished by CTA hue
