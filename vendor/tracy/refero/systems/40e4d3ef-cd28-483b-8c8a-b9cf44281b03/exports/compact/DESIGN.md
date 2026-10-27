# June — Style Reference
> Midnight ink on cream paper.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

June uses a soft editorial language: warm off-white canvas, generous spacing, and SF Pro Rounded giving every line of text a gentle, book-like friendliness. The signature is a deep midnight violet (#2a2a63) that carries headlines, body text, and border accents — never shouting, always present, like ink on cream paper. A single vivid periwinkle (#6868f7) is reserved for the rare accent surface, creating punctuation against the otherwise monochrome body. Components are flat and rounded (12–20px radii), elevated by hairline borders rather than drop shadows, giving the interface a notebook-page weight. Layouts breathe: centered single-column articles, comfortable line-height, and vertical rhythm that treats reading as the primary interaction.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Violet | `#2a2a63` | Headings, body text, link text, and border accents — the signature ink color |
| Deep Ink | `#151531` | Primary text, icon strokes, link color, and high-emphasis surface elements |
| Periwinkle Accent | `#6868f7` | Rare vivid accent surface for highlighted cards or callout blocks — a single bright note against the monochrome body |
| Cream Canvas | `#fafafa` | Page background and elevated card surface — the warm white base layer |
| Lavender Mist | `#f0f0fe` | Soft tinted card surface for content blocks and feature containers |
| Mist Border | `#e9ecef` | Hairline borders, dividers, card edges, and structural separators |
| Graphite | `#343a40` | Secondary text and muted surface details |
| Smoke | `#cfd0d1` | Subtle shadow base and low-contrast surface tone |
| Fog | `#c3c4c6` | Tertiary shadow tint for layered elevation |

## Typography

### SF Pro Rounded — Primary typeface — headings, body, links, UI chrome. The rounded terminals give text a soft, bookish warmth that defines the brand's voice.
- **Substitute:** Nunito or Quicksand for web fallback
- **Weights:** 400, 700, 900
- **Sizes:** 12px, 14px, 16px, 18px, 24px, 40px, 60px
- **Line height:** 1.00–1.56
- **Letter spacing:** -0.015em at display sizes, +0.025em at small sizes
- **OpenType features:** `"kern"`

### Inter — Secondary typeface — used sparingly for body text blocks
- **Substitute:** system-ui, -apple-system
- **Weights:** 400, 700
- **Sizes:** 16px
- **Line height:** 1.00, 1.50
- **Letter spacing:** normal
- **OpenType features:** `"kern"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.3px |
| body-sm | — | — | 14px | 1.5 | 0.35px |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.43 | -0.27px |
| heading-sm | — | — | 24px | 1.25 | -0.36px |
| heading | — | — | 40px | 1.17 | -0.6px |
| display | — | — | 60px | 1 | -0.9px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 720px
- **Section gap:** 64-80px
- **Card padding:** 48px
- **Element gap:** 24px

### Border Radius

- **tags:** 12px
- **cards:** 12px
- **inputs:** 12px
- **buttons:** 12px
- **featuredCards:** 20px

## Components

### Content Card
**Role:** Primary content container for articles and feature blocks

48px padding, 12px radius, background #f0f0fe, hairline border #e9ecef, subtle shadow using rgba(13,19,27,0.1) at 2px 10px. Text uses #2a2a63 at 16px/1.5 line-height.

### Featured Accent Card
**Role:** Rare highlight surface drawing the eye to a single callout

20px radius, background #6868f7 (periwinkle), white or #fafafa text. Used once per page maximum — the one vivid moment in an otherwise quiet layout.

### Navigation Link
**Role:** Top-bar nav items

SF Pro Rounded 16px weight 400 or 700, color #151531, no underline. Hover transitions to color #6868f7.

### Inline Link
**Role:** Body-text hyperlinks and dotted references

Color #151531 with a dotted underline in #2a2a63. 16px SF Pro Rounded weight 400. The dotted-underline treatment is a signature editorial detail.

### Hero Headline
**Role:** Page-top display title

SF Pro Rounded 60px weight 900, line-height 1.0, color #2a2a63, letter-spacing -0.9px. Centered or left-aligned. The heavy weight + rounded terminals creates a confident but friendly tone.

### Section Heading
**Role:** Sub-section titles within content

SF Pro Rounded 24px weight 700, color #2a2a63, line-height 1.25, letter-spacing -0.36px.

### Body Paragraph
**Role:** Long-form reading text

SF Pro Rounded 16px weight 400, line-height 1.5, color #2a2a63. Generous line-height prioritizes reading comfort over density.

### CTA Button
**Role:** Primary action button

Not strongly evidenced in raw data — no filled button background detected. If present: 12px radius, SF Pro Rounded 16px weight 700, padding 12px 24px, ghost/outlined style with #2a2a63 border or solid #2a2a63 fill with #fafafa text.

### List Item
**Role:** Bulleted content lists

8px gap between items, 16px SF Pro Rounded body text in #2a2a63. Disc or dash markers in #2a2a63.

### Signature Graphic
**Role:** Brand mark or small icon

Rounded geometric form in #2a2a63 on #fafafa. 8px internal margin. Matches the rounded-terminal typography.

### Form Input
**Role:** Text input or textarea

12px radius, 1px border #e9ecef, padding 12px 16px, SF Pro Rounded 16px, placeholder in #cfd0d1, focus ring in #6868f7 at 2px.

## Do's and Don'ts

### Do
- Use SF Pro Rounded as the only typeface for brand surfaces — it is the voice
- Set all headings in #2a2a63 Midnight Violet — never use black or #151531 for display text
- Use 12px radius on cards and buttons, 20px only for the rare featured accent card
- Maintain 1.5 line-height on all body text for editorial readability
- Use #e9ecef Mist Border for all structural separators — never darker than this for dividers
- Center long-form content at 720px max-width for optimal reading measure
- Use letter-spacing -0.015em on display sizes (40px+) to tighten the rounded forms

### Don't
- Do not use sharp 0px radii on any element — rounding is a core brand signal
- Do not introduce drop shadows heavier than rgba(13,19,27,0.1) — elevation stays whisper-soft
- Do not use #000000 or pure black for any text — use #151531 Deep Ink or #2a2a63 Midnight Violet
- Do not use Periwinkle #6868f7 on text or borders — reserve it for single accent surfaces only
- Do not add more than one accent-colored element per page
- Do not use system fonts like Arial or Helvetica — the rounded geometry defines the brand
- Do not compress line-height below 1.4 on body text — reading comfort is non-negotiable

## Elevation

- **Standard Card:** `rgba(13, 19, 27, 0.1) 0px 2px 10px 0px, rgba(13, 19, 27, 0.2) 0px 0px 2px 0px`
- **Inset Border Card:** `rgba(13, 19, 27, 0.05) 0px 0px 0px 1px inset`
- **Elevated Card:** `rgba(13, 19, 27, 0.25) 0px 0px 1px 0px, rgba(13, 19, 27, 0.05) 0px 2px 1px 0px`

## Surfaces

- **Cream Canvas** (`#fafafa`) — Page background — the warm off-white base
- **Lavender Mist** (`#f0f0fe`) — Tinted card or feature-block surface
- **Periwinkle Highlight** (`#6868f7`) — Rare accent surface for callout or featured content

## Imagery

The site is predominantly text-driven with minimal imagery. When visuals appear, they are flat illustrations or product UI crops in a rounded-geometry style matching the typography. No photography detected. Icons are simple geometric shapes in #2a2a63 on transparent backgrounds. The signature 'J' monogram in the nav is a rounded square with a stylized letterform. The overall visual language is editorial-first: the words and their rhythm do the work, with graphics as quiet punctuation.

## Layout

Max-width 720px centered content column for reading pages. Top navigation is a minimal bar with logo left, links right at 16px. Hero is a centered display headline at 60px over generous whitespace. Content cards use 48px padding and centered alignment. Section gaps are 64–80px to create breathing rhythm between content blocks. The overall page rhythm is single-column, top-to-bottom, with no sidebars or complex grid structures. Navigation is fixed-top, lightweight, and doesn't compete with content.

## Similar Brands

- **Notion** — Same soft rounded typography approach, generous whitespace, and minimal accent color usage on a warm off-white canvas
- **Linear** — Clean editorial layout with single-column reading flow and restrained color palette with one accent moment
- **Substack** — Long-form reading-first layout, centered narrow column, minimal chrome, warm-white background with deep text color
- **Figma Blog** — Similar blog/article presentation with rounded sans-serif type and generous vertical rhythm between content blocks
