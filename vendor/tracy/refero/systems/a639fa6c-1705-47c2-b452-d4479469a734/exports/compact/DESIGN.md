# Chester's Garden — Style Reference
> Flimsy art-zine on drafting paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Chester's Garden is a personal digital garden rendered as a quiet, editorial broadsheet on soft gray paper. The visual language is deliberately unfussy: a near-white canvas layered onto a cool gray substrate, serif display type at whisper-weight 300 that feels typeset rather than designed, and a masonry grid where cards of varying heights lock together like magazine columns. Body text is compact Inter with selectively bolded words inside flowing sentences, echoing how a reader underlines a phrase in a book. Pastel tag pills (mint, butter yellow, sage) and one rust-orange link color provide the only chromatic moments — accents behave like highlighter marks, not like a brand identity. Everything else is restrained: hairline borders, tiny radii, no gradients, no decorative elevation, and images sit in their own muted card frames.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper Gray | `#e5e7eb` | Page background, card borders, hairline dividers — the cool, slightly blue-gray substrate that every surface sits on or against |
| Bone White | `#fafafa` | Card and content-tile surface — reads as warm white against the cool Paper Gray substrate, giving each block a subtle lift without any shadow |
| Full Black | `#000000` | Primary body text, nav logo, image letterbox bars — maximum contrast, used for sentences that need to carry the page |
| Ink Charcoal | `#171717` | Headline and link text — almost black but not quite, so Fraunces serifs feel printed rather than digital |
| Soft Graphite | `#404040` | Secondary body text, supporting metadata lines under headings |
| Pencil Gray | `#a3a3a3` | Tertiary text, icon strokes, placeholder labels — fades to the background and only earns attention when scanned for |
| Highlight Mint | `#daf5ae` | Pill-tag background (FILTER, READ) — the first chromatic accent tier, like a fluorescent marker on the page |
| Highlight Butter | `#fde5a7` | Pill-tag background (NOW BREWING) — second accent tier, warmer counterpart to the mint |
| Highlight Sage | `#b7f2cc` | Pill-tag background (READ variants) — third accent tier, softer green for less emphatic tags |
| Rust Underline | `#7c2d12` | Occasional inline emphasis — the only warm chromatic voice in the palette, used sparingly to single out one word or phrase inside a body sentence |
| Navy Quotation | `#0c4a6e` | Occasional inline emphasis — the cool counterpart to Rust Underline, used for the same hand-underline-in-a-book purpose |

## Typography

### Fraunces — Display and editorial headings — light-weight serif at 30/36/60px. The whisper weight and optical-size personality of Fraunces make every headline feel hand-set rather than UI-generated; this is the single most distinctive typographic choice on the site
- **Substitute:** Lora (300) or Cormorant Garamond Light
- **Weights:** 300
- **Sizes:** 30px, 36px, 60px
- **Line height:** 1.00-1.25
- **Letter spacing:** -0.03em

### Inter — Body, navigation, metadata, card titles, footer. Used everywhere the voice is functional and not editorial. Compact 14px for card-level metadata, comfortable 16px for running prose
- **Substitute:** system-ui or IBM Plex Sans
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.43-1.63
- **Letter spacing:** -0.025em

### ui-monospace — Code-fence and small technical labels — inherits the same tight tracking as Inter so mono blocks align with the proportional text around them
- **Substitute:** JetBrains Mono or SF Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.43
- **Letter spacing:** -0.025em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.35px |
| body | — | — | 16px | 1.5 | -0.4px |
| heading-sm | — | — | 30px | 1.2 | -0.9px |
| heading | — | — | 36px | 1.11 | -1.08px |
| display | — | — | 60px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 24px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **images:** 8px
- **buttons:** 4px

## Components

### Top Navigation Bar
**Role:** Minimal site header with brand mark and routing

Transparent bar sitting on the Paper Gray canvas. Left side: 'Chester' wordmark in Inter 16px/400 Ink Charcoal. Center: nav links (Projects, Writing, Reading, Hobbies) at Inter 16px, color shifts between Full Black and Pencil Gray for active/hover. Right side: social links (GitHub, Twitter, CV) at Inter 16px Full Black. No background fill, no shadow, no border — 20px vertical padding, 28-32px horizontal padding

### Editorial Intro Block
**Role:** Opening prose section above the card grid

Large left-aligned text block on the Paper Gray canvas, no card chrome. Begins with 'Hey there, I'm Chester 👋' at 60px Fraunces 300 in Ink Charcoal. Body sentences at 16px Inter 400, with strategic words bumped to weight 600 (Chester, digital garden, building, Mobbin, coffee, plants, climbing, reading, writing). 24px row gap between paragraphs. No box, no border — text floats on the substrate

### Project Tile (Image Card)
**Role:** Default unit in the masonry grid, links out to external project

Bone White card with 8px radius, 1px hairline border in Paper Gray. Full-bleed image (or screenshot) clipped to the card's top, 8px top radius. Below image: 16px padding block containing 'Projects · [Project Name]' caption at Inter 14px in Soft Graphite, and a 12×12 external-link arrow icon top-right in Pencil Gray. No drop shadow. Inset top + bottom borders using rgba(0,0,0,0.1) at 1px give a subtle ruled-paper edge

### Book Cover Tile
**Role:** Card variant for reading-shelf entries

Bone White card, 8px radius, 1px Paper Gray border. Left: book-cover image clipped to 4px radius. Right column: 16px Inter 600 title in Ink Charcoal, 'Donald A. Norman' at 16px Inter 400 in Soft Graphite, and an 'READ' pill badge floating at the right edge

### Accent Tag Pill
**Role:** Compact label badge on cards and metadata lines

9999px (pill) radius, horizontal padding 6-8px, vertical padding 2-4px. Inter 12-14px uppercase, letter-spacing 0.5px, weight 500. Available background fills: Highlight Mint, Highlight Butter, Highlight Sage. Text always Full Black for AAA contrast on the pastels. Floating, no border

### Hobby Feature Card
**Role:** Photo-forward card for hobbies (Coffee, Plants) with headline + descriptor

Tall Bone White card, 8px radius, 1px Paper Gray border. Top: full-bleed photograph at 8px top radius. Below: stacked text — a Highlight Butter or Highlight Mint tag pill, then a 30-36px Fraunces 300 headline in Ink Charcoal, then a Soft Graphite descriptor line at 14px Inter. 20px padding inside the text block

### Image Letterbox Card
**Role:** Photo entry with date and film stock caption (Camera section)

Bone White card, 8px radius. Image framed by Full Black letterbox bars top and bottom (typical 2.4:1 cinematic crop). Caption strip: 'Film:NeverBik KIRO 400' at Inter 12px in Pencil Gray, bottom-left of the letterbox

### Inline Word Emphasis
**Role:** Selective bolding of single words within body sentences

Within a 16px Inter 400 sentence, one or two words are bumped to weight 600 in Ink Charcoal to simulate hand-underlining. No underline, no highlight background, no italic — just a weight shift. Used for personal-noun and activity-noun emphasis (Chester, plants, climbing, writing)

### Ghost Link Arrow
**Role:** External-link affordance on every project tile

12×12 outlined arrow-up-right icon in Pencil Gray, absolutely positioned top-right of card with 8px inset. No background, no border, no hover state beyond color shift to Full Black

### Footer Social Row
**Role:** Bottom-of-page social links and CV

Inter 16px Full Black text links separated by 8-12px gaps, left-aligned or right-aligned in the page column. No background, no border, no icon — plain text only, matching the nav's restraint

## Do's and Don'ts

### Do
- Set every headline in Fraunces weight 300 at 30, 36, or 60px with line-height 1.0-1.25 and -0.03em tracking — never bold or semibold the serif
- Place every card surface on the Paper Gray (#e5e7eb) substrate using Bone White (#fafafa) as the fill; rely on this single color step instead of drop shadows for separation
- Use 8px radius for image cards, 4px radius for small UI controls, and 9999px for accent tag pills
- Bump single words inside Inter body sentences from 400 to 600 weight for emphasis — never use underline, italic, or color for the same purpose
- Reach for Highlight Mint (#daf5ae), Highlight Butter (#fde5a7), or Highlight Sage (#b7f2cc) as tag backgrounds with Full Black text — these are the only allowed chromatic fills on UI elements
- Use ui-monospace 14px with -0.025em tracking for any inline code or technical label so the mono block aligns with surrounding Inter
- Keep the nav and footer as transparent text rows on the Paper Gray canvas — no fills, no borders, no logos, no icons

### Don't
- Do not raise Fraunces above weight 300 — the whisper-weight serif is the defining choice and bolding it destroys the editorial voice
- Do not introduce drop shadows, gradient fills, or glow effects on standard content tiles — the only shadow is the soft 10% black blur on hero image cards and the 1px inset paper edge
- Do not use bright saturated brand colors for buttons, links, or CTAs — there is no CTA color in this system; actions are text links in Ink Charcoal
- Do not alternate dark and light sections or introduce a dark mode — the entire page is a single Paper Gray tone
- Do not add icon systems, illustrations, or 3D graphics; visuals are restricted to photographs, book covers, and screenshots inside Bone White cards
- Do not set body text above 16px or below 14px — the Inter scale is intentionally narrow to maintain the compact zine rhythm
- Do not use the two inline emphasis colors (Rust Underline, Navy Quotation) on more than one or two words per sentence — they are the most chromatic elements on the site and must remain rare

## Elevation

- **Project tile / image card:** `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px`
- **Inset card border (paper-edge effect):** `rgba(0, 0, 0, 0.1) 0px 0px 0px 1px inset, rgba(0, 0, 0, 0.1) 0px -2px 0px 1px inset`

## Surfaces

- **Drafting Paper** (`#e5e7eb`) — Page substrate — everything sits on or is defined against this color
- **Bone White Card** (`#fafafa`) — Standard content card or project tile
- **Highlight Pill** (`#daf5ae`) — Accent tag surface floating on a card

## Imagery

Imagery is photograph-first, not illustration-first. The site is photo-heavy in the masonry grid: book covers (studio-lit product shots against solid backgrounds), still-life photos (plants on shelves, climbing wall crops, phone screens), black-and-white film photography with visible grain, and product/app screenshots framed in white. Treatment is editorial — photos sit in their own Bone White cards with 8px radius, letterboxed where the aspect ratio demands, and captioned in 12px Inter beneath. There is no decorative illustration, no abstract gradient art, and no 3D rendering. Iconography is restricted to a single 12×12 outlined external-link arrow used to signal outbound cards; otherwise the only icons are emoji (👋 🌱 🪨) used inline in the intro prose, treating them as a typographic flourish rather than a graphic system.

## Layout

The page is a single, unbroken vertical scroll with a max-width of ~1200px centered on the Paper Gray canvas. The first viewport is the editorial intro: a full-width left-aligned prose block on the bare substrate, no card chrome, no hero image. Below the intro, the layout shifts into a multi-column masonry grid where tiles of varying heights (2x, 3x, 4x row spans) interlock — some tiles are pure text, others are full images, others are image-plus-metadata. The grid breathes with 12-24px gaps between tiles, and individual tiles alternate between 8px and 4px corner radii to keep the rhythm slightly irregular. There is no sticky header, no sidebar, and no mega-menu; the navigation is a single thin row at the very top. Sections do not alternate light/dark — the entire page is one continuous paper-gray tone, with individual tiles doing all the visual work through their Bone White surfaces and photographic content.

## Similar Brands

- **Maggie Appleton** — Same digital-garden-as-portfolio concept, same light-gray substrate with white tiles, and the same selective-bolding-within-prose emphasis pattern
- **Tom Critchlow** — Personal site with a low-saturation pastel palette, serif display type for editorial voice, and a masonry card grid of mixed content blocks
- **Are.na** — Quiet, almost print-like visual restraint with hairline borders, small radii, and chromatic restraint to a few pastel accent tones
- **Craig Mod** — Editorial-portfolio hybrid with a light-warm canvas, serif headlines treated as long-form reading rather than UI, and almost no decorative chrome
- **Coby Sherman / Coby's Garden** — Nearly identical digital-garden masonry layout, Paper-Gray-on-Bone-White surface treatment, and Fraunces-light display headlines
