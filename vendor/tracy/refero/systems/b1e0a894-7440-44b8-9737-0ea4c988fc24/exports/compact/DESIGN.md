# Prevalent — Style Reference
> Editorial command observatory — serif intelligence briefings under a navy planetarium dome

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Prevalent's visual system is an editorial intelligence briefing set inside a dark observatory: a near-black navy hero anchors large serif headlines in Tiempos, while the body switches to a humanist sans (Matter) for UI, captions, and controls. A single vivid violet (#6360d8) carries the entire chromatic load — it paints the most important nouns in every headline, fills the primary CTA, and underlines article links — leaving the rest of the page in pure black-on-white. The product is illustrated, not photographed: whimsical hand-drawn scenes of miniature people navigating futuristic architecture replace the usual SaaS 3D renders, giving the brand a storybook quality that contrasts sharply with its serious cybersecurity subject matter. Components are flat, borderless by default, and depend on thin black hairlines rather than shadows for separation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris Voltage | `#6360d8` | Brand accent for primary CTAs, link color, accent words inside serif headlines, and the thin violet underlines/arrows on navigation and article links |
| Midnight Vault | `#060b25` | Hero and footer canvas — the deep navy that frames the largest serif headlines and the top of the page |
| Pure Ink | `#000000` | Primary text, default hairlines, and the 1px borders that separate every card, section, and image |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on violet, and inverse text on the dark hero |
| Graphite Slate | `#383c51` | Cool desaturated border and secondary text — sits between Pure Ink and Midnight Vault when a softer line or muted label is needed |
| Lavender Mist | `#dad9ed` | Light neutral action fill for buttons on dark surfaces. |

## Typography

### Tiempos Headline — Serif used exclusively for headlines and section titles. The single weight (400) plus aggressive negative tracking gives headings a literary, almost newspaper-editorial quality that contrasts with the cyber-security subject matter. Letter-spacing tightens to -0.02em at every size, pulling the serifs into a dense, confident block.
- **Substitute:** Source Serif 4 or PT Serif Caption
- **Weights:** 400
- **Sizes:** 16px, 30px, 45px, 48px, 50px, 80px
- **Line height:** 0.98–1.10
- **Letter spacing:** -1.6px at 80px, -1.0px at 50px, -0.96px at 48px, -0.9px at 45px, -0.6px at 30px (all -0.02em)

### Matter — Workhorse sans for body copy, navigation, buttons, captions, and card meta. Weight 400 is default; 500 is used sparingly for emphasis in labels and small UI text. Generous line-heights (1.4–1.6) keep body copy breathable on a spacious canvas. Letter-spacing -0.01em at body sizes gives it a tighter, more engineered feel than a typical system sans.
- **Substitute:** Inter or Söhne
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 50px
- **Line height:** 1.22–1.60
- **Letter spacing:** -0.24px at 24px, -0.2px at 20px, -0.18px at 18px, -0.16px at 16px, -0.14px at 14px, -0.12px at 12px (all -0.01em)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| small | — | — | 12px | 1.55 | -0.24px |
| caption | — | — | 14px | 1.43 | -0.28px |
| body-sm | — | — | 16px | 1.4 | -0.32px |
| body | — | — | 18px | 1.33 | -0.36px |
| subheading | — | — | 20px | 1.22 | -0.4px |
| heading-sm | — | — | 30px | 1.1 | -0.6px |
| heading | — | — | 48px | 1.1 | -0.96px |
| heading-lg | — | — | 50px | 1 | -1px |
| display | — | — | 80px | 0.98 | -1.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 40-48px
- **Element gap:** 24px

### Border Radius

- **cards:** 10px
- **pills:** 9999px
- **badges:** 9999px
- **buttons:** 4px

## Components

### Primary CTA Button
**Role:** The single conversion action on any page (Get a demo, Learn more)

Filled Iris Voltage (#6360d8) background, Paper White (#ffffff) text in Matter 500 at 16px, padding 12px 24px, border-radius 4px. Optional trailing arrow icon in white. No border, no shadow — color alone does the work.

### Ghost Navigation Button
**Role:** Secondary actions in the header or inline within content

Transparent background, 1px Pure Ink (#000000) border, Pure Ink text in Matter 500 at 14–16px, padding 8px 16px, border-radius 4px.

### Pill Badge
**Role:** Compact label sitting next to the wordmark or beside a heading (e.g. 'Join our team')

Lavender Mist (#dad9ed) background, Pure Ink text in Matter 500 at 12px, padding 4px 12px, border-radius 9999px.

### Serif Section Heading
**Role:** Headlines that introduce every page section

Tiempos Headline 400 at 48–80px, letter-spacing -0.02em, line-height ~1.0. The pattern is two-tone: 2–3 key nouns are recolored in Iris Voltage while the rest stays Pure Ink (on light backgrounds) or Paper White (on the dark hero). The contrast between white and violet words inside a single serif line is the brand's signature typographic move.

### Feature Card
**Role:** Three-column value props beneath the hero

Paper White background, no shadow, 1px Pure Ink hairline border at the top, border-radius 10px. Heading in Tiempos 30px Pure Ink, body copy in Matter 18px Pure Ink. A small rounded-square icon container (10px radius) sits below the card, filled with Iris Voltage, coral, or green from the illustration palette.

### Article Card
**Role:** Blog or resource entry in a 3-column grid

Paper White background, no border. Full-bleed image at the top (square or 4:3 crop). Eyebrow label 'Article' in Matter 14px Iris Voltage above the title. Title in Tiempos Headline 400 at 20–24px Pure Ink. Trailing down-arrow link in Iris Voltage.

### Arrow Link
**Role:** Inline navigation from headings to detail pages

Matter 500 at 16px in Iris Voltage, followed by a small down-arrow (↳) glyph. No underline by default; the violet color and arrow are the affordance.

### Top Navigation Bar
**Role:** Persistent header across all pages

Paper White background, sits on a 1px Pure Ink hairline at the bottom. Wordmark + pill badge on the left, three nav items (Products, Company, Resources — each with a chevron dropdown) centered or left-aligned in Matter 500 16px Pure Ink, primary CTA on the right. No background blur or elevation.

### Hero Section
**Role:** Full-bleed opening band on the landing page

Midnight Vault (#060b25) background, content centered with a max-width of ~1200px. Display headline in Tiempos 80px Paper White with two words recolored Iris Voltage. Supporting paragraph in Matter 18px at ~70% white. Violet filled CTA centered beneath. A hand-drawn illustration of futuristic architecture and miniature people overflows the bottom edge of the hero, bleeding into the next section.

### Footer
**Role:** Closing band at the bottom of the page

Midnight Vault (#060b25) background mirroring the hero. Top edges clipped with a 20px radius, giving the footer a rounded 'card' feel even though it spans the full viewport. Wordmark and link columns in Paper White at 14–16px Matter.

## Do's and Don'ts

### Do
- Use Tiempos Headline 400 exclusively for all display and section titles — never use a sans for headlines, that contrast is the brand
- Recolor exactly 2–3 key nouns in Iris Voltage within every serif headline; leave the rest of the sentence in Pure Ink or Paper White
- Keep the page chromatic load below 5% — violet appears on one CTA, one link per card, and accent words; everything else stays black, white, or navy
- Use 1px Pure Ink hairlines for all card and section separators; never reach for shadows or colored borders to create division
- Set letter-spacing to -0.02em on every Tiempos size and -0.01em on every Matter body size — the tight tracking is part of the voice
- Lead with the dark navy hero on the landing page; any sub-page that opens on a dark band reads as part of the same system
- Illustrate the product with hand-drawn scenes of people and architecture rather than stock photography or 3D renders

### Don't
- Don't introduce a second accent color — the system is monochromatic plus one violet; coral, green, and orange only appear inside the illustration art
- Don't apply shadows, glows, or colored borders to cards or buttons — separation comes from 1px black hairlines or whitespace
- Don't use Tiempos at body sizes below 30px — the serif is a display face and will look fussy as paragraph copy
- Don't round buttons above 4px or cards above 10px — larger radii would clash with the editorial flatness
- Don't set headlines in Pure White on a white background; the dark navy hero is the only place Paper White display type should live
- Don't place violet text on the Midnight Vault background — the contrast drops and the accent loses its punch; use Paper White for hero body and iris only on white
- Don't fill pages with photography; if a visual is needed, use the same illustrated, whimsical scene-style as the hero

## Elevation

The system is deliberately flat — no shadows, no glows, no colored borders. Elevation is implied by layering (white card on white canvas, navy hero on white section) and by 1px Pure Ink hairlines when explicit separation is needed. The only curvature comes from the 4px and 10px radii and the asymmetric clip masks on the hero/footer illustrations.

## Surfaces

- **Paper White** (`#ffffff`) — Default page canvas for content sections, article cards, and feature cards
- **Lavender Mist** (`#dad9ed`) — Pill badges, gentle section tints, and decorative surface washes
- **Midnight Vault** (`#060b25`) — Full-bleed hero and footer backgrounds — the only dark surface in the system

## Imagery

Illustrations are the entire visual identity. Every visual asset is a hand-drawn, slightly whimsical scene — miniature people in spacesuits and office attire exploring futuristic cityscapes, domed laboratories, and rocket launchpads — rendered in a flat, editorial style with thick linework, saturated mid-tones (blues, corals, greens, purples), and white highlights. The illustrations overflow their containers, with the hero scene bleeding across the full width and even down into subsequent sections. There is no photography anywhere on the site; product UI and people are always depicted as drawn characters. Icons throughout the feature cards are simple, flat, and monochrome, sitting inside small rounded-square containers that pick up accent colors from the illustration palette.

## Layout

The landing page follows a strict rhythm: full-bleed dark hero (Midnight Vault) → white content sections → alternating subtle tints → dark footer. Content is centered in a ~1200px max-width container with generous side padding. The hero is a centered text stack (display headline → supporting paragraph → CTA) with the illustration bursting from the bottom. Content sections use a 2-column or 3-column grid — the value-prop section is a 3-column feature grid with equal-width cards separated by whitespace, and the resource section is a 3-column article grid. Section gaps are large (80–120px) giving the page a spacious, editorial cadence. The navigation is a single sticky top bar, white with a 1px bottom hairline; no sidebar, no mega-menu, no floating elements.

## Similar Brands

- **Linear** — Same restrained monochrome canvas with a single vivid accent and flat, borderless cards
- **Vercel** — Same large serif/sans pairing for headlines, tight tracking, and near-black hero
- **Framer** — Same illustration-driven hero and violet-on-near-black headline treatment
- **Notion** — Same hand-drawn illustration style replacing product photography across the marketing site
