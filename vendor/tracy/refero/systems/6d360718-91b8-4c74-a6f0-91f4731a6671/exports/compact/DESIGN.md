# Adopt — Style Reference
> Editorial broadsheet on warm paper. A cream canvas with one near-black ink, a tall narrow serif for headlines, and a compact grotesque whispering the labels — the page feels typeset, not designed.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Adopt reads as an editorial broadsheet rendered on warm paper: a single near-black ink against a soft cream canvas, with no gradients, no shadows, and no accent color to soften the starkness. The signature is a narrow Garamond serif at near-display sizes carrying every statement headline, paired with a compact grotesque for labels, body, and UI chrome — a two-voice system that splits content into 'editorial title' and 'production note' registers. Layout uses a rigid three-column grid for content blocks and dramatic left-aligned section numbers with hairline rules, letting generous vertical air (80–140px between sections) do the pacing. Components are deliberately invisible — no cards, no buttons with fills, no elevation — only type, rules, and whitespace organize the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone | `#f4f1ec` | Page canvas — warm off-white that makes the black ink read like printed type rather than screen pixels |
| Carbon | `#1e1e1e` | Primary text, body copy, headlines, section rules — the single ink that carries the whole page |
| Ash | `#8c8c8c` | Muted helper text, timestamps, secondary metadata — desaturated enough to recede behind Carbon |
| Lampblack | `#000000` | Hard borders on outlined controls, maximum-emphasis rules — used sparingly where Carbon is not black enough |

## Typography

### ITCGaramondStdLightNarrow — All statement and display headlines. The Light Narrow cut is the signature — its condensed proportions let massive sizes (up to 130px) fit on a line while the 0.90 line-height stacks lines into a dense editorial block. Substituting Cormorant Garamond Light or EB Garamond with a tight tracking and line-height override will read close enough.
- **Substitute:** Cormorant Garamond Light (condensed), or EB Garamond with letter-spacing -0.02em and line-height 0.9
- **Weights:** 300, 400
- **Sizes:** 80px, 130px
- **Line height:** 0.90–0.92
- **Letter spacing:** -0.02em

### PPNeueMontreal — Everything non-headline: body text, section labels, timestamps, nav, column headings, footer. Weight 500 for body, 600 for small bold labels (section titles, column headings). The 0.01em tracking opens the grotesque just enough to feel print-set rather than digital. Substituting Inter or Neue Haas Grotesk at the same weight/track will read close enough.
- **Substitute:** Inter, Neue Haas Grotesk, or General Sans
- **Weights:** 500, 600
- **Sizes:** 18px
- **Line height:** 1.33
- **Letter spacing:** 0.01em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.4 | 0.01px |
| heading-sm | — | — | 18px | 1.33 | 0.01px |
| display | — | — | 80px | 0.92 | -0.02px |
| display-lg | — | — | 130px | 0.9 | -0.02px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Section Header
**Role:** Numbered section label with hairline rule

Two-digit number (01–04) in PPNeueMontreal 14px weight 500, color Carbon, letter-spacing 0.01em. Beneath it, a section title (e.g. 'Who We Are', 'Our Partners', 'How We Work', 'Information') in the same font/size/weight. A 1px Carbon rule extends full-width below the label, reaching the right edge of the content column. The number sits at the top-left, the rule immediately below — no gap between rule and title.

### Display Headline
**Role:** Statement serif headline at the top of each section

ITC Garamond Light Narrow, weight 300, sizes 80–130px, line-height 0.90–0.92, letter-spacing -0.02em, color Carbon. Left-aligned, typically spanning 2–3 lines. The tight line-height makes multi-line headlines stack into a near-solid block of type — an editorial pull-quote feel rather than airy web display type.

### Content Column
**Role:** Three-column body content block

Each column contains a bold PPNeueMontreal 18px weight 600 heading in Carbon, followed by 1–2 lines of body text at 18px weight 500 in Carbon, line-height 1.33. Columns are separated by ~40px gutters; the block sits within the page's 50px horizontal padding. No card backgrounds, no borders between columns — type rhythm alone separates them.

### Partner List
**Role:** Stacked serif word list for partner/credit sections

Centered stack of brand names or proper nouns in ITC Garamond Light Narrow, weight 300–400, sizes 80–130px, line-height 0.90, color Carbon, letter-spacing -0.02em. Each name sits on its own line, centered, creating a typographic sculpture — no logos, no images, only type. This is the most visually dramatic pattern in the system.

### Outlined Button
**Role:** Ghost/outlined action button

Transparent background, 1px solid Carbon border, PPNeueMontreal 18px weight 500 text in Carbon, letter-spacing 0.01em, padding 12px 24px, border-radius 0px. No fill state, no shadow. The outlined chrome and square corners keep it feeling printed rather than interactive.

### Top Nav Bar
**Role:** Minimal site identifier and timestamp

Full-width row, 50px horizontal padding, Bone background, no border. Left: 'ADOPT' in PPNeueMontreal 14px weight 500, letter-spacing 0.01em, Carbon. Right: live date/time string (e.g. 'Sunday • 3:01 PDT') in the same font/size/weight, color Carbon. No links, no nav items — this is an intro/manifesto page, not a product surface.

### Footer Bar
**Role:** Minimal footer with brand, link, and copyright

Full-width row with Bone background, 50px horizontal padding, no border. Three-cell layout: left 'ADOPT' in PPNeueMontreal 14px weight 500 Carbon, center 'Founders' (or a single short label), right '©ADOPT 2026' in Ash (#8c8c8c). All 14px, weight 500, letter-spacing 0.01em. No dividers, no rules.

### Hairline Rule
**Role:** Full-width section divider

1px solid Carbon (#1e1e1e), spanning the full content width within the 50px page padding. Used only directly under section number/title labels. Never decorative, never mid-section — the rule is a structural marker that says 'new section begins'.

## Do's and Don'ts

### Do
- Use ITC Garamond Light Narrow (or Cormorant Garamond Light condensed) at 80–130px with line-height 0.90 and letter-spacing -0.02em for any display or statement headline
- Use PPNeueMontreal (or Inter/Neue Haas Grotesk) at 18px weight 500 for body, 600 for column labels, always with 0.01em tracking and 1.33 line-height
- Set all borders, text, and rules to #1e1e1 — never introduce a second ink color
- Use #8c8c8c only for timestamps, metadata, and copyright — never for body copy or headings
- Let section gaps breathe at 80–140px; the vertical air is the layout
- Set border-radius to 0 on every component — buttons, tags, inputs, cards stay square
- Separate content into exactly three columns within the 50px horizontal padding; never use cards, backgrounds, or shadows to group content

### Don't
- Do not introduce any accent color, brand color, or chromatic hue — the system is monochromatic by design
- Do not use gradients, box-shadows, or any form of elevation — the canvas is flat
- Do not use a sans-serif or system font for headlines — the Garamond serif IS the brand
- Do not use border-radius above 0 on any UI element
- Do not place more than 2 lines of body text per column without increasing vertical gap — the 3-column grid is for scannable blocks, not paragraphs
- Do not use bold (600+) for body text — weight 500 is the body maximum; 600 is reserved for short column labels
- Do not add icons, illustrations, or imagery unless replacing a partner name with a logo — the system is type-only by default

## Surfaces

- **Bone** (`#f4f1ec`) — The only surface — the entire page is one flat warm-white field with no elevated tiers

## Imagery

No imagery. The system is type-only — no photography, no illustration, no icons, no product shots. Partner names appear as large serif type rather than logos. The only visual elements beyond type are 1px hairline rules in Carbon. This is a deliberate editorial choice: the brand presents itself as a writing and ideas practice, and any visual asset would compete with the typography.

## Layout

Single full-page manifesto layout with no separate pages. Full-bleed Bone canvas, 50px horizontal padding on all sides, content max-width ~1200px. The page flows through four numbered sections (01–04) stacked vertically, each opening with a small label + hairline rule, followed by a large serif display headline (left-aligned), then either a three-column content grid or a centered serif word stack. Section gaps of 80–140px create editorial pacing. Navigation is a single top bar with brand mark and live timestamp; footer is a single row with three short text cells. No sidebar, no sticky elements, no scroll-triggered reveals.

## Similar Brands

- **Pentagram** — Same editorial broadsheet sensibility — monochrome canvas, oversized serif display type, no decorative imagery, type as the entire visual system
- **Studio Dumbar** — Same restraint-first approach with a warm off-white canvas and near-black ink, letting typography and grid do all the work
- **Mucca** — Same two-voice type system pairing a narrow display serif with a compact grotesque, with hairline rules and generous air as the only structural devices
- **Wieden+Kennedy** — Same manifesto-page format — a single scrollable statement piece with numbered sections, a live timestamp, and zero product surface
