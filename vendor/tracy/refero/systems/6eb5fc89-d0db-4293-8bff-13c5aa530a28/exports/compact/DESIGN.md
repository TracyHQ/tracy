# Motto® — Style Reference
> Typographic monolith on paper — a single confident voice announcing itself on bone-white stock.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Motto® speaks in pure typographic voice: a light gray canvas, no chromatic accents, no shadows, and no decorative graphics — only two typefaces, generous whitespace, and the confidence to let a 154px headline carry an entire screen. Weight 500 is used everywhere; nothing is bold, nothing is light, so hierarchy comes from size, tracking, and whitespace rather than visual weight. Interaction is reduced to underlined text and pill-shaped controls (9999px radius), and the ® mark and asterisk-burst function as the only brand motifs. The result is a site that reads like an editorial spread rather than a product page — monochrome, declarative, and structurally disciplined.

## Colors

| Name | Value | Role |
|------|-------|------|
| Motto Ink | `#000000` | Primary text, headlines, logo wordmark, borders, decorative marks — the only ink in the system |
| Soft Carbon | `#1b1b1c` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Bone Paper | `#ffffff` | Card surfaces, testimonial panels, text on dark fills, inverted nav state |
| Parchment | `#f2f2f2` | Page canvas — the default background; sections sit on this without a card wrapper |
| Ash Rule | `#d8d8d8` | Hairline dividers between sections, subtle separators, secondary surface |
| Slate | `#717476` | Body secondary text, helper copy, muted annotations |
| Graphite | `#4d5153` | Body text on inverted or elevated surfaces, slightly stronger than Slate |
| Smoke | `#848484` | Disabled nav items, list bullets, low-priority metadata, scroll cues |
| Fog Border | `#c8cacd` | Input field borders, form control edges |
| Pewter | `#666666` | Tertiary text, footnote-level annotations |

## Typography

### disp (custom display face) — Reserved exclusively for hero statements and display headlines. The display face operates at 61–154px with line-height locked near 1.0–1.1, so lines almost touch and the type forms a wall. Weight 500 here is anti-convention — most display faces use 700–900; this medium weight gives the headlines editorial gravity without the shouting, which is the signature move of the system.
- **Substitute:** Bricolage Grotesque
- **Weights:** 500
- **Sizes:** 61px, 99px, 138px, 139px, 154px
- **Line height:** 1.00–1.10
- **Letter spacing:** normal

### sans (custom sans face) — Used for all body copy, navigation, buttons, labels, captions, card content, and footers. A single weight — 500 — runs through the entire secondary type system, so visual hierarchy comes from size and leading, never from bold or light. This creates an evenness that lets the display font dominate without competition.
- **Substitute:** Inter
- **Weights:** 500
- **Sizes:** 9px, 14px, 15px, 17px, 18px, 20px, 25px, 34px, 48px
- **Line height:** 1.14–1.60
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.4 | — |
| body-lg | — | — | 18px | 1.6 | — |
| subheading | — | — | 20px | 1.3 | — |
| heading-sm | — | — | 25px | 1.3 | — |
| heading | — | — | 34px | 1.26 | — |
| heading-lg | — | — | 48px | 1.14 | — |
| display-sm | — | — | 61px | 1.1 | — |
| display | — | — | 99px | 1 | — |
| display-lg | — | — | 154px | 1 | — |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1280px
- **Section gap:** 77px
- **Card padding:** 29px
- **Element gap:** 19px

### Border Radius

- **tags:** 9999px
- **cards:** 0px
- **pills:** 9999px
- **inputs:** 0px
- **avatars:** 9999px
- **buttons:** 9999px

## Components

### Display Headline
**Role:** Hero and section-defining statements

Set in disp at 99–154px, weight 500, line-height 1.0–1.1. Color: Motto Ink (#000000). The ® mark and asterisk-burst symbol sit inline at the same size — they are typographic marks, not icons.

### Section Heading
**Role:** Mid-page section titles (e.g. 'PRAISE FROM CLIENTS')

Set in disp at 61–99px, weight 500, line-height 1.1. Color: Motto Ink. Left-aligned, no underline, no ornament.

### Pill Button (primary)
**Role:** Primary call-to-action

9999px border-radius. Fill: Soft Carbon (#1b1b1c). Text: Bone Paper (#ffffff), sans 500 at 15–17px. Padding: 19px horizontal, 15px vertical. No border, no shadow, no hover lift — color may shift to pure black on interaction.

### Pill Button (outlined/ghost)
**Role:** Secondary action

9999px border-radius. Fill: transparent. Border: 1px Motto Ink (#000000). Text: Motto Ink, sans 500 at 15–17px. Same padding as primary pill.

### Underlined Text Link
**Role:** In-content navigation (e.g. 'Work with us', 'Here's how we can help')

No color change from surrounding text — always Motto Ink. A 1px solid underline sits at the baseline. Font: sans 500 at 17–18px. This is the system's universal link treatment; the underline is the affordance, not the color.

### Top Navigation Bar
**Role:** Primary site navigation

Full-width, transparent over Parchment (#f2f2f2). Logo wordmark 'Motto®' left, nav items centered, 'Work with us' right — all in sans 500. Nav items are spaced ~38–70px apart. Inverted/scrolled state: items dim to Smoke (#848484) when inactive.

### Testimonial Card
**Role:** Client quote panel

Fill: Bone Paper (#ffffff), sitting on the Parchment canvas. No border, no shadow, no radius. Padding: ~29px on all sides. Layout: circular avatar (9999px) at top-left, name in sans 500, company in Slate (#717476) below, then quote in sans 500 body text. Cards are placed in a 3-column grid with ~23–24px gap.

### Avatar Circle
**Role:** Client or person identifier

9999px border-radius. Diameter ~34–48px. Fill: Ash Rule (#d8d8d8) or similar neutral. Single letter or initial centered in Motto Ink. No border.

### Service Tag Cluster
**Role:** Capability label groupings (e.g. 'BUSINESS STRATEGY • BRAND POSITIONING')

Sans 500 at 14–15px, uppercase, letters spaced slightly. Separators are bullet points (•) in Motto Ink. No background, no border — just typographic strings centered on the canvas.

### Hero Scroll Indicator
**Role:** Inviting the reader down the page

A simple downward arrow (↓) in Motto Ink, displayed at 34–48px. Paired with a small underlined text link ('(SCROLL)') in sans 500 in Smoke (#848484) on the right. Sits in the lower hero region.

### Asterisk Mark
**Role:** Decorative typographic punctuation

A six-pointed asterisk/burst character set inline with display text, at the same size. Functions as a visual exclamation, a logo sub-mark, and a brand signature.

### Registered Mark (®)
**Role:** Brand device woven into headlines and logo

A circled-R glyph at 25–30% of the surrounding display type size, set as a superscript after key words ('Motto®', 'IDEAS WORTH RALLYING AROUND®'). Drawn or rendered as a thin-stroked circle with an R inside — not the default typographic glyph. Functions as the system's only consistent brand emblem.

### Footer
**Role:** Page footer / dark surface

Fill: Soft Carbon (#1b1b1c) or Motto Ink (#000000). Text: Bone Paper, sans 500. Contains site links, legal copy, and the Motto® wordmark.

## Do's and Don'ts

### Do
- Use weight 500 — never 400, 600, 700, or 800 — for every typographic element in the system
- Set the display face at 99px or larger for hero statements; the system is designed to be read at architectural scale
- Use 9999px border-radius for every pill button, tag, and avatar — the system has exactly one radius for interactive elements
- Underline text links with a 1px Motto Ink rule — do not change link color to communicate affordance
- Place white cards directly on the Parchment (#f2f2f2) canvas with zero shadow and zero border — contrast is the elevation
- Pair the ® mark and the asterisk-burst with display headlines to create brand moments; they are type, not icons
- Use 19–24px for element gaps and 67–77px for section gaps to preserve the spacious editorial rhythm

### Don't
- Do not introduce any chromatic color — no blues, no greens, no reds; the system is intentionally monochrome
- Do not apply box-shadow to cards, buttons, or any component — the canvas/card contrast is the only depth device
- Do not use bold (700+) or light (300-) weights — the system is calibrated entirely to medium (500)
- Do not round card corners — cards, panels, and surfaces are square-edged; only pills get the 9999px radius
- Do not color text links differently from surrounding body text — the underline is the affordance, not the hue
- Do not set the display face below 61px — it loses its editorial presence and competes with the sans
- Do not use the ® mark or asterisk as a separate icon asset — they are typographic characters and must be set in type

## Elevation

The system intentionally uses zero shadows. Cards are distinguished from the canvas by a white fill against the light gray background, not by elevation. This is a deliberate flatness — the discipline mirrors the editorial confidence of the typography: nothing decorative stands between the reader and the message.

## Surfaces

- **Parchment** (`#f2f2f2`) — Page canvas — the default light gray field every section sits on
- **Bone Paper** (`#ffffff`) — Card and testimonial surfaces — the only elevated layer in the system
- **Ash Rule** (`#d8d8d8`) — Secondary surface, dividers, rule lines
- **Soft Carbon** (`#1b1b1c`) — Inverted surface for footer and dark sections

## Imagery

The site is essentially imageless. There is no photography, no product imagery, no abstract graphics, no illustration. The only visual content is typography, the ® mark, the asterisk-burst glyph, and a single downward arrow. The strategy: let the display type and the canvas contrast carry every screen, with white-on-gray card panels introducing the only compositional rhythm.

## Layout

The page is full-width, running edge to edge on a Parchment canvas with no centered max-width container. The hero is a free-typographic statement: a massive display headline centered in the viewport, with a small body paragraph tucked at the upper-left and a scroll indicator at the lower-left. Sections flow in alternating left-aligned display headings and supporting body copy, separated by hairline rules. The testimonial grid is a 3-column card layout with white panels on the gray canvas. The footer is a full-bleed dark band. Vertical rhythm is generous — 67–77px between sections — creating an editorial-spread pacing rather than a product-page density.

## Similar Brands

- **Bureau Cool** — Same monochrome editorial approach — light gray canvas, massive serif/grotesque display headlines, pill buttons, zero color accents
- **Manual (manuallab.com)** — Same typographic-first agency site: display weight 500 headlines, underlined links, no shadows, editorial spacing
- **Pentagram** — Same monochrome restraint and confidence in letting oversized type do all the work; similar grid discipline
- **Guts & Glory** — Same flat-light, no-shadow aesthetic with pill buttons and typographic hero statements
- **DIA Studio** — Same editorial-spread pacing with black display type on near-white canvas and square-edged white card surfaces
