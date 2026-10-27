# Craft — Style Reference
> botanical conservatory on warm parchment — cream pages holding vivid green specimens and one quiet forest room.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Craft operates as a botanical conservatory on warm parchment: a cream canvas (#f7f5f2) carries the whole body, punctuated by a single deep-forest hero (#1d3023) that swallows the viewport behind a flowing organic green shape. Type is the primary voice — a custom condensed serif at 180px whispers the brand promise in tight -0.03em tracking, then a lighter Arizona Flare handles everything else at human scale. Color is used as punctuation, not decoration: the cream surface dominates, a near-black plum-brown carries all text, and a vivid lime green (#26d862) appears only on action, inline links, and the occasional accent word inside headlines. Components stay flat and unshadowed — the hierarchy comes from type size, generous whitespace (56px section gaps), and 8px-radius cards that hold full-bleed flower photography. The rhythm is editorial: one dramatic dark hero, then a stream of quiet cream sections with centered serif statements, 4-column stat strips, and image grids that let the botanical subjects do the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone Linen | `#f7f5f2` | Page canvas, body backgrounds — the warm off-white that carries almost every section and makes the dark hero and green accents feel like specimens on display |
| Oat Milk | `#eae6df` | Card surfaces, elevated panels, secondary containers — a half-step darker than the canvas for gentle separation without shadow |
| Driftwood | `#d7d2cc` | Hairline borders, dividers, structural separators — warm gray that reads as line work, not as color |
| Ash Mauve | `#645757` | Secondary text, captions, muted labels — used where near-black would be too heavy, sits at 80 instances |
| Mahogany Hush | `#504344` | Dark accent for small headings and emphasis — warmer alternative to the primary text color when a touch of depth is needed |
| Obsidian Plum | `#2a1a1d` | Primary text, body copy, all headings, nav links — a near-black with warm plum undertone that pairs with the cream canvas at 15.3:1 contrast |
| Forest Depths | `#1d3023` | Hero section background, dark surface, outlined ghost-button borders — the deep green room that introduces the brand and reappears as a dark contrast panel |
| Lime Pulse | `#26d862` | Primary action buttons, inline links, accent words inside headlines, active nav states — vivid green used sparingly as functional punctuation, never as decoration |
| Peacock Teal | `#0e634f` | Stat numbers, data emphasis — a deeper teal that shares hue with the forest hero but reads quieter so it can carry numerical data in stat cards |

## Typography

### ABC Arizona Flare Condensed Variable — Display and large headings — the condensed serif runs at 180px for the hero statement and steps down through 104, 48, 26, 20px for section headlines. Weight 300 carries the largest sizes, weight 400 takes the mid range. Negative tracking tightens at every size.
- **Substitute:** DM Serif Display, Bodoni Moda Condensed, Playfair Display
- **Weights:** 300, 400
- **Sizes:** 20, 26, 48, 104, 180px
- **Line height:** 0.85–1.18
- **Letter spacing:** -5.4px at 180px, -3.12px at 104px, -1.2px at 48px, -0.52px at 26px, -0.4px at 20px

### ABC Arizona Flare Variable — Body, nav, buttons, cards, captions, and mid-size headings up to 32px. Weight 350 handles 32px headings, weight 400 takes body and UI. The lighter weight at 32px keeps subheadings from competing with the condensed display sizes.
- **Substitute:** Recoleta, Tiempos Text, DM Serif Text
- **Weights:** 350, 400
- **Sizes:** 12, 13, 15, 16, 18, 32px
- **Line height:** 1.08–1.50
- **Letter spacing:** -0.48px at 32px, -0.18px at 18px, -0.16px at 16px, -0.15px at 15px, -0.13px at 13px, -0.12px at 12px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.18 | -0.12px |
| body | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 18px | 1.5 | -0.18px |
| subheading | — | — | 20px | 1.08 | -0.4px |
| heading-sm | — | — | 26px | 1.08 | -0.52px |
| heading | — | — | 32px | 1.25 | -0.48px |
| heading-lg | — | — | 48px | 0.95 | -1.2px |
| display | — | — | 104px | 0.85 | -3.12px |
| display-xl | — | — | 180px | 0.85 | -5.4px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 56-64px
- **Card padding:** 16-24px
- **Element gap:** 16-24px

### Border Radius

- **nav:** 4px
- **tags:** 4px
- **cards:** 8px
- **buttons:** 8px

## Components

### Floating Pill Navigation
**Role:** Primary site navigation, sticky at top center

A pill-shaped container with 4px radius holding 'Hire' and 'Move' text tabs, the 'Craft' wordmark in Arizona Flare Condensed at ~20px, and a square menu toggle with 3-dot icon. Background: #f7f5f2 matching the canvas. Text: #1d3023 for tabs, #2a1a1d for wordmark. Hairline 1px top border or subtle shadow for separation. The pill floats centered, not full-width, with ~8px vertical padding and 24px horizontal padding.

### Filled Primary Button
**Role:** Primary call-to-action — form submits, key conversions

Background: #26d862 (Lime Pulse). Text: #2a1a1d at 15–16px Arizona Flare weight 400. Padding: 8px 16px to 12px 24px. Radius: 8px. No shadow. The vivid green against the cream canvas is the highest-contrast action in the system — it should appear once per view maximum.

### Ghost Outlined Button
**Role:** Secondary actions, less important links

Transparent background. Border: 1px #2a1a1d or #1d3023. Text: matching border color at 15–16px. Padding: 8px 16px. Radius: 8px. Used when a filled green button would compete with the primary action or when the button sits on the dark hero.

### Hero Section
**Role:** Full-viewport opening statement

Background: #1d3023 (Forest Depths) full-bleed. A flowing organic green shape (abstract 3D or CSS shape, vivid green tones) sits behind the text as atmospheric decoration. Headline: Arizona Flare Condensed weight 300 at 180px, color #f7f5f2 (Bone Linen), line-height 0.85, letter-spacing -5.4px. The second line of the headline appears in a slightly different weight/style for rhythmic contrast. Supporting paragraph: Arizona Flare at 18px, #eae6df, max-width ~420px. The hero occupies the full first viewport with generous side padding.

### Centered Section Statement
**Role:** Mission/positioning text block in light sections

Centered text on #f7f5f2 canvas. Headline: Arizona Flare Condensed at 48px, weight 400, color #2a1a1d, line-height 0.95. Key phrases within the headline switch to #26d862 green as accent words (e.g., 'brands and agencies', 'design community'). Body paragraph below at 16px, #645757. Max-width: ~800px, centered.

### Stat Card
**Role:** 4-column data display strip

Flat card on #eae6df (Oat Milk) surface with 8px radius. Large number: Arizona Flare Condensed at 48px, weight 400, color #0e634f (Peacock Teal) or #1d3023. Label/description below: Arizona Flare at 13–15px, #645757, line-height 1.50. Padding: 24px. No shadow — separation comes from the half-step surface color difference. Four cards in a row with 16px gaps.

### Flower Image Card
**Role:** Full-bleed photography in content grids

Image fills the card edge-to-edge with 8px radius clipping. No padding, no text overlay. Images are close-up botanical subjects (flowers, plants) with vivid natural colors — yellow, pink, purple, green. Each card is 1 of 4 in a row at equal width. Gap between cards: 16px. The image does all the work; no caption, no overlay.

### Section Label
**Role:** Small uppercase or letter-spaced label above section content

Arizona Flare at 12–13px, weight 400, color #645757, letter-spacing normal or slight positive. Appears as a quiet kicker above section headlines (e.g., 'CRAFT AT A GLANCE', 'WAYS WE SUPPORT YOUR GROWTH'). All caps or sentence case with a period.

### Inline Green Link
**Role:** Highlighted text within paragraphs and headlines

Same surrounding text size, but color #26d862. No underline by default. Used to make specific phrases stand out within a block of dark text — the green reads as 'this is what makes us different' without disrupting flow.

### Body Paragraph
**Role:** Long-form descriptive text

Arizona Flare Variable weight 400 at 16px, line-height 1.50, color #2a1a1d. Max-width: 720px for readability. No first-line indent, generous bottom margin (24–32px) between paragraphs.

### Menu Toggle
**Role:** Hamburger/menu open trigger in nav

Square button, ~40×40px, 4px radius. Border: 1px #1d3023 or #eae6df depending on nav context. Icon: 3 horizontal dots or lines in #1d3023. Sits at the right end of the floating pill nav.

## Do's and Don'ts

### Do
- Use the 180px condensed serif only for the hero statement — it's the loudest voice in the system and should appear once per page
- Apply #26d862 (Lime Pulse) filled buttons sparingly — one primary action per viewport, never stack two green buttons side by side
- Set letter-spacing explicitly: -5.4px at 180px, -3.12px at 104px, -0.48px at 32px, scaling proportionally through the type ramp
- Use the surface color difference (#f7f5f2 → #eae6df) for card separation instead of box-shadows — the system is intentionally flat
- Let full-bleed flower imagery sit edge-to-edge in 8px-radius cards with no captions — the image is the content
- Anchor any dark moment to the Forest Depths #1d3023 — never use pure black, the warm green undertone is what makes it feel like a room rather than a void
- Pick one weight tier per size: weight 300 for 104–180px display, weight 400 for 20–48px mid-headlines, weight 350 only at 32px subheadings, weight 400 everywhere else

### Don't
- Don't introduce a new font family — the system runs on exactly two custom serifs (Arizona Flare and Arizona Flare Condensed) and the contrast between them is the signature
- Don't use Lime Pulse #26d862 for body text, borders, or decorative fills — it is exclusively an action and link color
- Don't apply box-shadows to cards or buttons — separation comes from the two-tone cream surface and 8px radius
- Don't mix line-height styles within a size — 0.85 for display (48px+), 1.08 for subheadings (20–32px), 1.18–1.50 for body (12–18px)
- Don't center-align body paragraphs longer than 2 lines — left-align at max-width 720px for readability
- Don't use the Peaacock Teal #0e634f outside of numerical data contexts — it is reserved for stat numbers and data emphasis
- Don't place colored text on the dark Forest Depths hero unless it's Bone Linen #f7f5f2 — the contrast math is tuned for cream-on-forest, not green-on-forest

## Surfaces

- **Page Canvas** (`#f7f5f2`) — Default body background for all content sections
- **Card Surface** (`#eae6df`) — Elevated cards, stat tiles, contained content blocks
- **Hero / Dark Section** (`#1d3023`) — Full-bleed dark sections — hero, feature moments, footer
- **Highlight Surface** (`#26d862`) — Filled action buttons and occasional green wash highlights

## Imagery

Imagery is botanical and close-cropped: flowers in full bloom, shot tight enough to fill the frame, treated with a soft slightly-saturated palette — vivid yellows, pinks, purples, and greens. The hero uses an abstract organic green shape (3D-rendered or fluid CSS/SVG) rather than photography: it flows like draped fabric or a leaf, in lime-to-forest gradient tones, with soft volumetric lighting. The image cards are full-bleed, edge-to-edge, clipped only by the 8px card radius — no padding, no overlays, no text. The overall effect is greenhouse/conservatory: each specimen is isolated on a cream wall and lit like it's on display. No people, no lifestyle photography, no stock imagery. Icons are minimal — line-based, 1px stroke, monochrome. No illustrations or decorative graphics beyond the hero shape.

## Layout

The page model is max-width contained (~1200px) with generous side margins (~77px). The hero is the only full-bleed section, breaking out edge-to-edge in Forest Depths. Below the hero, everything sits on the cream canvas in a centered single-column flow: centered headline blocks, then 4-column stat grids, then 4-column image grids, separated by 56–64px section gaps. Navigation is a floating centered pill that sits over the hero (not a full-width bar). The first content section is a centered text statement at max-width ~800px. Stats appear in a 4-up card row. Image cards appear in a 4-up row, full-bleed. Section rhythm is consistent vertical spacing with no alternating background colors — the dark hero is the only departure from cream. Content alternates between centered text stacks and 4-column grids, never two-column split layouts. The overall feel is editorial: one dramatic moment, then a calm, spacious stream of specimens and statements.

## Similar Brands

- **Locomotive** — Same warm cream canvas, condensed serif display type at hero scale, and botanical/organic imagery treated as specimens on a quiet page
- **Pentagram** — Shared editorial rhythm — one dramatic typographic moment per section, centered statements, generous whitespace, serif type doing the heavy lifting
- **Studio Daïdai** — Same flat two-tone surface approach without shadows, cream backgrounds, and vivid green used as functional punctuation rather than decoration
- **Resn** — Both pair dark immersive hero moments with light editorial body sections and use a single accent color for emphasis rather than a full palette
- **Instrument** — Similar creative-agency structure — full-bleed dark hero, centered pill nav, cream body sections with stat strips, and photography that fills cards edge-to-edge
