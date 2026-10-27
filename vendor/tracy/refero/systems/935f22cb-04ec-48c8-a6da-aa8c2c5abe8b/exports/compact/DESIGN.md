# Clipdrop — Style Reference
> photo studio on bone paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Clipdrop reads like a contemporary art-book spread rendered as a working tool: bone-white canvas, oversized editorial serif headlines, a single vivid cobalt for actions, and generous negative space that lets the image-heavy content breathe. Surfaces are flat and borderless, with the visual system doing its work through typography, a 16px card radius, and pill-shaped controls rather than shadows or gradients. The checkerboard transparency pattern in the hero establishes the brand's image-tool DNA without competing with the photography. Color is rationed — almost the entire interface lives in three near-blacks and an off-white, with cobalt blue and a single warm orange used as precise functional punctuation for primary actions and brand marks.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cobalt Signal | `#1c60f6` | Violet action color for filled buttons, selected navigation states, and focused conversion moments |
| Ember Vermillion | `#fa4028` | Brand mark accent, the Jasper wordmark stem, and the rare warm fill. Used sparingly so it never dilutes the cobalt's primacy as the action color |
| Midnight Ink | `#24355c` | Deep navy-violet for icon fills and emphasis body copy. Sits between black and cobalt in the chromatic hierarchy — a quieter alternative to pure black when an element needs a hint of brand color |
| Periwinkle Mist | `#c9d7f5` | Soft lavender-blue used as a ghost/secondary button surface. Reads as a desaturated echo of Cobalt Signal — the same hue at low saturation, signaling a non-primary action without going neutral |
| Bone | `#ededed` | Page canvas, hairline borders, and the dominant surface tone. With 1000+ occurrences it is the structural backbone of the system — everything else sits on it or is carved out of it |
| Ink Black | `#000000` | Maximum-emphasis headings, primary text, and icon strokes. Reserved for the loudest moments; never used for body copy where 2d2d/404040 take over |
| Charcoal | `#2d2d2d` | Headings and button text — slightly softer than pure black for elements that need weight but not the harshest contrast |
| Graphite | `#404040` | Body copy, secondary headings, and icon fills. The workhorse neutral — used wherever readability matters but Ink Black feels too heavy |
| Slate | `#767676` | Muted helper text, captions, and low-emphasis labels. The lightest text color that still passes on bone canvas |
| Frost | `#dddddd` | Subtle dividers and elevated surface tone, one step darker than the canvas bone. Used when a section needs a quiet visual break |
| Ash | `#8f8f8f` | Card and tag backgrounds in compact density zones. Mid-gray surface that lifts content off the bone canvas without introducing color |
| Onyx | `#171717` | Deep alternative to Ink Black for links and emphasis icons when the element needs to feel slightly warmer or paired with cobalt |
| Paper White | `#ffffff` | Button text on cobalt fills, and the second surface tier for cards/elevated content layered over bone canvas |

## Typography

### Primary — Primary — detected in extracted data but not described by AI
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 20px
- **Line height:** 1, 1.2, 1.4, 1.5

### Custom Sans (likely Inter or a geometric humanist substitute) — Body copy, UI labels, button text, captions, card titles. The utilitarian workhorse — never decorative. Weight 500 for emphasis, 600 for card titles, 400 for body and labels.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 20px
- **Line height:** 1.00–1.50
- **Letter spacing:** normal

### Editorial Serif (custom — high-contrast modern serif, Didone family) — Hero and section headlines only. The signature choice — a whisper-weight serif at display sizes against an otherwise sans-serif interface creates editorial tension. Weight 400 at 96px is anti-convention; most AI tool brands use 700 sans-serif, this trusts the typeface's contrast and tracking to carry authority.
- **Substitute:** GT Sectra, Tiempos Headline, or Newsreader
- **Weights:** 400
- **Sizes:** 60, 96px
- **Line height:** 1.10
- **Letter spacing:** -0.02em

### SecondaryFont — SecondaryFont — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 60px, 96px
- **Line height:** 1.1
- **Letter spacing:** -0.02

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.4 | 0px |
| subheading | — | — | 20px | 1.2 | 0px |
| heading | — | — | 60px | 1.1 | -1.2px |
| display | — | — | 96px | 1.1 | -1.92px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 20-24px
- **Element gap:** 8-12px

### Border Radius

- **tags:** 9999px
- **cards:** 16px
- **links:** 8px
- **buttons:** 9999px
- **smallButtons:** 12px

## Components

### Cobalt Primary Button
**Role:** The only filled CTA on the site

Pill-shaped (9999px radius), #1c60f6 background, Paper White (#ffffff) text, 12px vertical × 20px horizontal padding, Inter weight 500 at 14-16px. Single-CTA-per-section discipline — these are the moments the system actually demands an action.

### Ghost Outline Button
**Role:** Secondary navigation and boundary actions

Pill-shaped (9999px radius), 1px #ededed border on bone canvas, #2d2d2d text, 12px × 20px padding. Used for 'Tools', 'API', 'Jasper Free Trial', 'Pricing' in the header and for 'Show more' in the FAQ.

### Periwinkle Soft Button
**Role:** Tertiary or low-emphasis action

Pill-shaped, #c9d7f5 background, Midnight Ink (#24355c) text. The desaturated echo of the cobalt primary — signals 'available but not required'.

### Tool Card
**Role:** Grid card showcasing each AI tool capability

White (#ffffff) surface, 16px border-radius, image-first layout (full-bleed photo up to 16px radius corners), 20-24px padding on the text block. Title in Inter weight 600 at 16px with small icon prefix; description in Inter weight 400 at 14px Graphite (#404040). No visible border or shadow — the card is defined purely by the white-on-bone surface contrast.

### Hero Visual Card
**Role:** Full-width hero showcase with transparency grid

Rounded container (16px radius) with a checkerboard transparency pattern as background, overlay text in white at 48-60px editorial serif, play button centered. This is the signature component — it visually communicates 'image tool' without explanation.

### FAQ Accordion Row
**Role:** Expandable question/answer in the FAQ section

Full-width row, 1px #ededed bottom border, no background. Question in Inter weight 500 at 16px in Charcoal (#2d2d2d), chevron icon in Slate (#767676) on the left. Expanded answers add 12-16px vertical padding.

### Header Navigation Bar
**Role:** Sticky top navigation

Bone (#ededed) background matching canvas, no border, 64-80px height. Logo left ('Clipdrop by jasper' with 'jasper' in Ember Vermillion), centered or right-aligned nav links in Inter weight 500 at 14px Charcoal, 'Sign-in / Sign-up' as Ghost Outline Button on the far right.

### Editorial Section Heading
**Role:** Centered section titles like 'Tools' and 'Frequently Asked Questions'

Editorial serif at 60px, weight 400, letter-spacing -1.2px, Charcoal (#2d2d2d) color, centered alignment. The visual signature of the entire site — never use sans-serif for section titles, the serif is reserved for these moments.

### Icon Prefix Tag
**Role:** Small icon+label used in tool cards

Inter weight 600 at 16px, 4-8px gap between icon and text, icon in Midnight Ink (#24355c) at 16-20px.

## Do's and Don'ts

### Do
- Use the editorial serif at 60-96px for all section and page headlines — never substitute the sans-serif for these moments
- Use Cobalt Signal (#1c60f6) as the only filled button background on the page — one CTA per section maximum
- Apply 16px border-radius to all cards, images, and media containers
- Use pill-shaped (9999px) radius for every button, tag, and pill control
- Keep the page bone canvas (#ededed) as the dominant background — introduce white only for cards that need to lift
- Pair Ember Vermillion (#fa4028) exclusively with the Jasper wordmark or single-point brand accents
- Use 1px #ededed hairline borders for section dividers, never rely on shadows to separate regions

### Don't
- Don't use the editorial serif for body copy, UI labels, or button text — it is reserved for headlines only
- Don't introduce green/red semantic colors for success/error states — extend the neutral and cobalt palette instead
- Don't add drop shadows to cards, buttons, or navigation — the system is intentionally flat
- Don't use 9999px radius on cards or images — pill radius is for buttons and tags only
- Don't fill large surfaces with Periwinkle Mist (#c9d7f5) — it is a button surface, not a section background
- Don't set body copy in pure black (#000000) — use Graphite (#404040) or Charcoal (#2d2d2d) for text
- Don't stack more than one Cobalt primary button in the same viewport — the system demands action hierarchy

## Elevation

- **Tool Card:** `none — cards rely on white surface against bone canvas, no shadow`
- **FAQ Row:** `none — dividers are 1px #ededed borders, not shadows`
- **Header:** `none — flat against canvas`

## Surfaces

- **Canvas** (`#ededed`) — Full-page background — the bone paper that the entire system is printed on.
- **Card Surface** (`#ffffff`) — Tool cards, FAQ items, and any content block that needs to lift off the canvas.
- **Subtle Elevation** (`#dddddd`) — Quiet section dividers and inline emphasis blocks, one shade darker than canvas.

## Imagery

Photography is the dominant visual content — tool cards feature lifestyle and product photography (people, fashion, objects, food) that demonstrate the AI capabilities. Images are full-bleed within 16px-radius card containers, no internal padding. The hero features a checkerboard transparency grid as a signature graphic element, communicating 'image tool' instantly. No illustrations or 3D renders are used; no abstract decorative graphics. Icon style is minimal outlined/duotone in Midnight Ink or Slate, 16-20px, single-stroke weight.

## Layout

Max-width 1200px centered container on a full-bleed bone canvas. Hero is a centered editorial headline (96px serif) above a single large media card spanning the container width. Below the hero, the Tools section uses a 3-column card grid with generous gutters (24-32px). The FAQ section switches to a single-column centered stack. Section gaps are 64-80px — spacious, editorial breathing room. The header is a single-row sticky bar with left-aligned logo and right-aligned nav. No sidebar, no mega-menu.

## Similar Brands

- **Framer** — Same oversized editorial headlines over a near-white canvas with a single saturated blue accent driving actions
- **Linear** — Similar pill-shaped controls, hairline borders, and flat surfaces — though Linear is dark, the component vocabulary overlaps
- **Arc Browser** — Same editorial typography choice mixing a display serif with a workhorse sans for body, generous spacing, single accent color
- **Vercel** — Minimalist near-white canvas, generous vertical rhythm, hairline borders, and a single chromatic action color
