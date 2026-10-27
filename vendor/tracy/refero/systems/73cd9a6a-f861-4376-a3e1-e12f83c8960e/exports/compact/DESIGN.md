# Paradigm — Style Reference
> midnight lab notebook opening to daylight — a dark first screen cracks into a bright, data-rich scroll.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Paradigm opens in a dark observatory atmosphere — near-black canvas, white serif display type, and a live data table that already proves the product — then dissolves into a daylight research interface of white paper, soft tinted surfaces, and pastel status badges. The signature move is the Atacama VAR serif at 44–54px with -0.06em tracking, paired against a workhorse PP Neue Montreal that carries the entire UI at 14–22px with tabular numerals. Color is rationed: one vivid blue (#0a33ff) punctuates the brand through active states and step indicators, status is communicated through six dark-ink + pastel-wash badge pairs (forest, sapphire, mulberry, amber, crimson, plum), and the rest of the system lives in carefully tuned warm and cool grays. Components feel like research instruments — 4px corners, hairline borders, a signature white inner-glow on product mockup cards, and almost no drop shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#080b12` | Primary text, hero background, card borders, table rules — the structural near-black that anchors both dark and light regions |
| Paper | `#ffffff` | Page background, card surfaces, inverted button fill in dark hero |
| Fog | `#f6f7f8` | Subtle surface lift for secondary panels, table zebra rows, input wells |
| Pearl | `#edeef1` | Quiet button backgrounds, nested surface tint |
| Stone | `#d9d9d9` | Table column dividers, neutral hairline borders |
| Lavender Mist | `#dbdbee` | Tinted table surface and the dominant data-grid border — a barely-violet line that sets the product interface apart from generic grays |
| Mist | `#b5b9c4` | Light borders on secondary controls, list separators |
| Pewter | `#9898ae` | Medium cool border for outlined buttons and inputs |
| Steel | `#848a9c` | Cool gray border used at extremely high frequency (392) — the workhorse rule-line color for structural divisions |
| Smoke | `#acacae` | Icon stroke and muted body text on light surfaces |
| Ash | `#9d9ea1` | Muted icons, placeholder text, inactive controls |
| Iron | `#606167` | Body text secondary level, icon stroke weight |
| Graphite | `#6c6d73` | Tertiary body text, supporting metadata |
| Slate | `#4f535e` | Strong secondary borders, card outline emphasis, footer text |
| Charcoal | `#2b2b2c` | Deep text for body emphasis on light backgrounds |
| Electric Iris | `#0a33ff` | Brand accent — active tab indicator, step pill, the Enrich action, selected row check, brand wordmark dot — the single chromatic punctuation across an otherwise neutral system |
| Periwinkle | `#7f90ce` | Muted action fill, secondary blue surfaces, desaturated hover state for the brand blue |
| Hero Dawn | `linear-gradient(180deg, #010b18 0%, #010818 16%, #103b91 49%, #4c7de8 78%, #bad0ff 97%)` | Hero gradient terminus — the deepest point of the dark-to-light blue backdrop |
| Sky Whisper | `#e2efff` | Info badge background wash |
| Sapphire Ink | `#061353` | Info badge dark text and border |
| Mint Whisper | `#e4f3e2` | Success badge background wash |
| Forest Ink | `#03350f` | Green state accent for badges, validation surfaces, and short status labels. |
| Sprout Whisper | `#d6ffe0` | Light success badge alternative background |
| Saffron Whisper | `#faeed1` | Warning badge background wash |
| Amber Ink | `#423301` | Warning badge dark text and border |
| Blossom Whisper | `#ffe6f7` | Pink/magenta tag badge background — category label |
| Mulberry Ink | `#600537` | Pink/magenta tag badge dark text and border |
| Plum Ink | `#21034d` | Deep violet tag badge dark text and border — alternative category color |
| Crimson Ink | `#580101` | Red state accent for badges, validation surfaces, and short status labels. |
| Apricot Whisper | `#fee8dd` | Orange/copper tag badge background |
| Russet Ink | `#581c01` | Orange/copper tag badge dark text and border |

## Typography

### Atacama VAR — Display serif for all section and hero headlines 44px and above — the editorial weight 317–370 reads as research-journal rather than marketing, and the -0.06em tracking tightens the wide capitals into a confident mass
- **Substitute:** Tiempos Text, Lora, or Source Serif Pro
- **Weights:** 317, 370, 400
- **Sizes:** 44px, 48px, 54px
- **Line height:** 1.0–1.2
- **Letter spacing:** -0.06em at 44–48px, -0.05em at 54px

### PP Neue Montreal — Workhorse UI font — body copy, buttons, nav, badges, table cells, and pre-headline labels. The 450 weight (a rare half-step) is the default for interactive elements, sitting between regular and medium for restraint
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 450, 500
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 17px, 18px, 21px, 22px, 160px
- **Line height:** 1.2–1.6
- **Letter spacing:** -0.01em body, 0.14–0.15em on all-caps eyebrow labels (THE OLD WAY, WITH PARADIGM)
- **OpenType features:** `"tnum" on, "ss01" off`

### Inter — Secondary UI text — tight table cells, micro-labels, and dense numerical columns where PP Neue Montreal is swapped for the slightly narrower Inter to save horizontal space
- **Substitute:** Inter (already Google Fonts)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9px, 10px, 11px, 12px, 13px, 14px, 15px
- **Line height:** 1.2–1.6
- **Letter spacing:** -0.006em to -0.02em body, 0.02em eyebrow

### Suisse Intl — Rarely used body fallback, appears in micro-copy where 0.08em letter-spacing creates a quiet institutional voice
- **Substitute:** Söhne or Inter
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.2
- **Letter spacing:** 0.0100em, 0.0800em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.12px |
| body-sm | — | — | 14px | 1.5 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 18px | 1.4 | -0.18px |
| heading-sm | — | — | 21px | 1.3 | -0.21px |
| heading-lg | — | — | 44px | 1.1 | -2.64px |
| display | — | — | 54px | 1 | -2.7px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tabs:** 100px
- **cards:** 4px
- **badges:** 4px
- **buttons:** 4px
- **feature-cards:** 16px

## Components

### Dark Hero Section
**Role:** Opening viewport with product proof

Full-bleed #080b12 background, 1200px inner content. Left-aligned: 54px Atacama VAR display headline in #ffffff, 18px PP Neue Montreal subhead in #4f535e-equivalent muted gray. Two CTAs side by side — white filled 'Request a demo →' and ghost 'Try now'. Below the fold, a tabs row (Deal Sourcing active) and the data table mockup bleeds edge-to-edge with a slight #dbdbee tint on the table surface.

### Hero Primary Button
**Role:** Primary action in the dark hero

Filled white (#ffffff) background, #080b12 text, 4px radius, weight 450 PP Neue Montreal at 14px, 8px vertical / 16px horizontal padding, optional right arrow (→). Tracking -0.01em. Sits against the dark hero so the inversion does the heavy lifting — no shadow, no border.

### Hero Secondary Button
**Role:** Secondary action in the dark hero

Transparent fill, #ffffff text, 4px radius, weight 450 PP Neue Montreal at 14px, 8px vertical / 16px horizontal padding. The lighter visual weight makes it read as the low-commitment companion to the filled primary.

### Blue Accent Button
**Role:** Sole chromatic action in the system (Enrich, Step pills)

Filled #0a33ff background, #ffffff text, 4px radius, weight 500 PP Neue Montreal at 13–14px, 6px vertical / 12px horizontal padding. Used for the 'Enrich' action on data tables and the active step indicator. Restrict to one per surface — this is the system's only saturated fill.

### Section Heading
**Role:** Display heading on light body sections

Atacama VAR weight 317–370 at 44–54px, color #080b12, letter-spacing -0.06em to -0.05em, line-height 1.0–1.1. The unusually light weight for such a large size is the anti-convention choice — most sites use 600–700 here, the whisper-weight creates authority through restraint.

### Eyebrow Label
**Role:** All-caps pre-headline label above section titles

PP Neue Montreal weight 500, 12px, letter-spacing 0.14em, color #6c6d73. Sits 16–24px above the section heading, creating a two-step vertical entry into each section.

### Problem List Item
**Role:** X-marked list in 'The Old Way' section

Thin gray X glyph in #848a9c, 16px PP Neue Montreal body 400 in #2b2b2c, 8px vertical gap between items. The cross icon is rendered as a simple SVG, not emoji — stroke weight ~1.5px.

### Solution List Item
**Role:** Checkmarked list in 'With Paradigm' section

Check glyph in #0a33ff, 16px PP Neue Montreal body 400 in #2b2c2c, 8px vertical gap. The shift from gray X to blue ✓ is the entire visual argument of the section.

### Category Tag Badge
**Role:** Inline categorization label in data tables

4px radius, 2px vertical / 8px horizontal padding. Background is a light pastel wash (#ffe6f7, #e2efff, #e4f3e2, #faeed1) and text+border is the matching dark ink (#600537, #061353, #03350f, #423301). 12px PP Neue Montreal 500. The two-color badge (dark text on pastel fill) is the only color-expression channel in the system.

### Status Fit Pill
**Role:** Deal fit indicator (Highest / High / Low)

4px radius, 4px vertical / 8px horizontal padding, 12px PP Neue Montreal 500. 'Highest' and 'High' use the Forest Ink (#03350f) text on a soft border; 'Low' uses Crimson Ink (#580101). The pill is intentionally quieter than a full badge — it sits inline in a dense data row.

### Tabs Row
**Role:** Category navigation above the data table

100px radius pills on a transparent bar. Inactive tab: 14px PP Neue Montreal 450 in #6c6d73 with a 1px #b5b9c4 hairline border. Active tab: same dimensions but #080b12 text with a #080b12 1px border and a white #ffffff fill background. The pill shape is the only break from the system's 4px geometry.

### Data Table
**Role:** Primary product interface

Full-width table on #ffffff surface with #dbdbee 1px row dividers (46+ uses confirm this is the intentional tinted rule). Header row in 13px PP Neue Montreal 500 #6c6d73, body cells in 14px 400 #080b12 with tabular numerals (tnum). Row height ~44px, cell padding 9–12px vertical. First column uses a #0a33ff square checkbox in the selected row.

### Step Indicator
**Role:** Sequential step pills in 'Encode your best thinking' section

100px radius. Active step: filled #0a33ff with #ffffff 'Step 1' label. Inactive steps: #ffffff fill with 1px #b5b9c4 border and #2b2b2c text. 13px PP Neue Montreal 500, 6px vertical / 12px horizontal padding. The active state is the only place outside the hero where #0a33ff appears as a fill.

### Product Mockup Card
**Role:** Screenshot of the product embedded in body sections

#ffffff surface, 4px radius, the signature elevation: rgb(255,255,255) 0 0 24px inset — a white inner glow that makes the card appear to sit on a soft light source from within. Often paired with the 135deg subtle blue gradient (rgb(123,149,196) → rgb(223,236,255)) as the card backdrop, giving product mockups a frosted-screen quality.

### Trust Logo Bar
**Role:** Social proof strip of client logos

Light #f6f7f8 band, centered. Eyebrow text 'Trusted by 10,000+ decision makers...' in 14px PP Neue Montreal 400 #6c6d73. Logos are monochrome #080b12, rendered at uniform ~24px height, spaced 64–80px apart in a single horizontal row.

## Do's and Don'ts

### Do
- Use Atacama VAR for every display heading 44px and above at weight 317–370 with -0.06em tracking — the whisper-weight serif is the system's defining typographic choice
- Use 4px border-radius on all buttons, cards, badges, and inputs; reserve 100px only for tabs and step pills
- Pair every status badge as a dark saturated text + matching 1px border on a light pastel wash — never invert this (no dark fills with light text)
- Apply the white 24px inner-glow (rgb(255,255,255) 0 0 24px inset) on any product mockup card — this is the signature elevation
- Enable tabular numerals (tnum) on PP Neue Montreal for all numeric data in tables and stat blocks
- Use #0a33ff sparingly — one accent per surface, only on the Enrich action, active tab, active step, and selected row check
- Use letter-spacing 0.14–0.15em on all 12px PP Neue Montreal 500 eyebrow labels above section headings

### Don't
- Don't use rounded pill buttons on cards or actions — 4px corners are the system geometry, pills are reserved for tabs and step indicators
- Don't use drop shadows for depth — depth comes from the white inner-glow and the blue 135deg gradient backdrop, not from elevation
- Don't use #0a33ff as a filled CTA background on landing sections — reserve it for in-product actions and active states only
- Don't use emoji or filled multicolor icons — icons are thin-stroke outlined SVGs in #080b12 or #6c6d73
- Don't center-align body text or section content — the layout rhythm is left-aligned with an asymmetric image companion
- Don't introduce new saturated colors — the only chromatic channels are #0a33ff and the six dark-ink badge colors; everything else stays in warm and cool grays
- Don't use auto-animation or scroll-triggered effects — the system has no motion personality and relies on static composition
- Don't set display headings in PP Neue Montreal or Inter — the Atacama VAR serif is mandatory for any text 44px or larger

## Elevation

- **Product Mockup Card:** `rgb(255, 255, 255) 0px 0px 24px 0px inset`
- **Standard Card:** `rgba(0, 0, 0, 0.06) 0px 1px 3px 0px`
- **Badge:** `rgba(0, 0, 0, 0.04) 0px 1px 3px 0px`
- **Focus Ring:** `rgba(76, 120, 250, 0.14) 0px 0px 0px 3px`
- **Elevated Feature Card:** `rgba(0, 0, 0, 0.09) 0px 4px 40px 0px`

## Surfaces

- **Paper** (`#ffffff`) — Default page background and primary card surface
- **Fog** (`#f6f7f8`) — Quiet lift for trust bars, footer bands, and secondary panels
- **Lavender Mist** (`#dbdbee`) — Tinted surface for the data table interior — the barely-violet tint signals 'this is a data environment' without being decorative
- **Midnight** (`#080b12`) — Hero and dark section backgrounds — anchors the system's most dramatic moments

## Imagery

Imagery is product-led, not lifestyle. The page embeds actual screenshots of the data table and enriched company profile inside card frames, with the signature white inner-glow making them feel like frosted screens. No photography of people, no abstract 3D renders, no stock illustrations. The brand mark is a small dark square with a centered glyph. Icons throughout are thin-stroke outlined SVGs (stroke weight ~1.5px), monochrome in #080b12 or #6c6d73. Trust logos are rendered as monochrome vector marks in #080b12. Visual density is low — text and data structures carry the page, with imagery playing a supporting evidence role rather than a decorative one.

## Layout

The page uses a max-width 1200px contained layout with sections separated by 80px vertical gaps. The hero is full-bleed #080b12 with left-aligned content (headline left, subhead and CTAs below), transitioning via a tabbed data table that bleeds edge-to-edge. Body sections follow a strict alternating rhythm: text-left/image-right ('The Old Way') then image-left/text-right ('With Paradigm'), each anchored by a 44–54px Atacama VAR heading, a 12px all-caps eyebrow above, and 4 short list items below. The trust logo bar is a centered single row on a #f6f7f8 band. The step section is a centered headline over a horizontal row of three step pills. Navigation is a minimal top bar: brand mark left, four nav items center, 'Log in' text and 'Request a demo' outlined button right. The entire system is grid-disciplined — no masonry, no overlapping panels, no asymmetric experimental compositions.

## Similar Brands

- **Linear** — Same dark-hero-into-light-body structure, 4px geometry, hairline borders, and single-accent-color discipline
- **Retool** — Data-table-dense interfaces with tabular numerals and pastel status badges for row-level categorization
- **Anthropic** — Editorial serif display headings paired against a workhorse sans, the research-publication voice in a product interface
- **Vercel** — Restrained neutral palette with one vivid accent, sharp 4px corners, and a preference for inner glow over drop shadow
- **Notion** — Comfortable light density, #f6f7f8 quiet surfaces, and minimal decorative chrome — content and tables are the design
