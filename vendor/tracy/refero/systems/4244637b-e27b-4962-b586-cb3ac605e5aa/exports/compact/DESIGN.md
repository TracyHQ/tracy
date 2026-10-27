# Moffitt.Moffitt. - — Style Reference
> curated gallery on bone-white linen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Moffitt.Moffitt. operates as a curated gallery on bone-white linen: every screen begins on a pure white canvas, then disappears into full-bleed photography and monoline serif type. The palette is deliberately chromatic-free — black, white, and three grays carry all interface weight, while color lives exclusively inside editorial artwork (the red gown, the cyan poster). Components are minimal to the point of invisibility: pill-shaped controls, hairline borders, no shadows, no gradients, no decoration. Typography is the brand — a whisper-weight display serif sets tone at headlines, a neo-grotesque sans does utility work. The effect reads as a printed annual report or museum wall text: confident, restrained, and confident in letting imagery do the heavy lifting.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, filled pill buttons, hairline borders on light surfaces, active icons |
| Bone | `#ffffff` | Page canvas, card surfaces, text on dark buttons, image overlays |
| Mist | `#f5f5f5` | Elevated surface wash, subtle card backgrounds, section dividers |
| Fog | `#ebecec` | Hairline dividers between feed cards, faint table borders |
| Ash | `#d8d8da` | Subtle structural borders, disabled state outlines |
| Graphite | `#595b60` | Secondary text, supporting metadata, icon strokes |
| Steel | `#888888` | Muted helper text, timestamps, tertiary captions |

## Typography

### Lyon — Whisper-weight display serif for editorial headlines, pull quotes, and section titles — the anti-convention weight 100 creates authority through restraint rather than volume, making the brand feel printed rather than web-native
- **Substitute:** Lyon Display, Editorial New, Canela Thin, Playfair Display Hairline
- **Weights:** 100
- **Sizes:** 13px
- **Line height:** 1.00

### Suisse — Neo-grotesque sans for body copy, navigation, button labels, tags, and utility UI — 400 reads body, 500 carries button labels and nav, 600 anchors subheadings; the wide weight range lets this one family run the entire interface without switching faces
- **Substitute:** Suisse Int'l, Inter, Söhne, Neue Haas Grotesk
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 16px, 22px, 24px, 40px
- **Line height:** 1.00, 1.13, 1.17, 1.20, 1.25, 1.33, 1.39, 2.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | — |
| body | — | — | 16px | 1.25 | — |
| subheading | — | — | 22px | 1.2 | — |
| heading-sm | — | — | 24px | 1.17 | — |
| heading | — | — | 40px | 1.13 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **tags:** 50px
- **cards:** 5px
- **buttons:** 50px
- **iconButtons:** 50%

## Components

### Filled Pill Button
**Role:** Primary action control

Black fill (#000000), white text (#ffffff), 50px border-radius (full pill), 11px vertical × 20px horizontal padding, Suisse 500 at 13-16px. Used for 'Our Services', 'Our Profile', 'Our Projects' and CTAs.

### Ghost Pill Button
**Role:** Secondary or filter action

Transparent fill, 1px Obsidian border (#000000), Obsidian text, 50px border-radius, 11px × 20px padding, Suisse 500 at 13px. Used for 'See more' and category filters like 'Music'.

### Circular Icon Button
**Role:** Navigation and progress control

50% radius (true circle), Obsidian 1px border, Obsidian icon stroke inside. Examples: the arrow button (→) and the 01/05 counter with progress ring. ~44px diameter.

### Split Hero Frame
**Role:** Full-bleed editorial opener

50/50 two-column layout, each half contains one full-bleed photograph edge-to-edge with no padding or radius. Headline (Lyon 100, ~40px, white) overlaid bottom-left on dark imagery, absent on light imagery.

### Editorial Pull Quote
**Role:** Long-form manifesto text

Pure white background, Lyon 100 at ~13-16px, Obsidian text, ~20-30px right margin from edge, free-flowing paragraph without a visible card container. 40px column gap to the right of follow-up content.

### Feed Card
**Role:** Portfolio grid item

5px border-radius, no shadow, full-bleed image fills the card. Tag pill (50px radius, 5-7px padding, Suisse 500 at 12px) overlaid top-left — tag variants: 'New Work' on white, 'Coming soon' on white, 'Team News' on Obsidian with white text. Hairline 1px Fog (#ebecec) divider between cards in the grid.

### Category Tag
**Role:** Content classification

50px pill radius, small (~5-7px padding), Suisse 500 at 12px. White fill with Obsidian text for active filters, transparent with 1px Obsidian border for unselected.

### Top Nav Bar
**Role:** Global site navigation

Transparent overlay on hero, no background fill. Left: circular 'm' wordmark in 1px Obsidian border. Right: hamburger menu icon (three horizontal lines) in Obsidian. Sits at the very top with ~20px padding.

### Slide Counter
**Role:** Carousel position indicator

Bottom-right of hero, displays '01/05' in Suisse 400 with a small circular progress indicator next to it. Functions as a stepper — no progress bar fill, just a ring or dot.

## Do's and Don'ts

### Do
- Use 50px border-radius for all buttons, tags, and filter pills — the pill shape is the signature control geometry
- Set the page canvas to pure #ffffff and let images bleed to the edge with no margin or framing
- Reserve Lyon weight 100 exclusively for headlines and pull quotes — never use it for body or UI labels
- Separate surfaces using 1px #ebecec hairlines and value contrast, never box-shadow
- Keep the palette fully achromatic in all interface chrome — any color must live inside editorial artwork
- Set body copy at Suisse 400, 16px, with generous line-height (1.25-1.39) to match the editorial register
- Use 20px element gaps and 40px section gaps to maintain the magazine-spread rhythm

### Don't
- Do not introduce a chromatic brand color, gradient, or decorative fill anywhere in the UI chrome
- Do not apply box-shadow to cards, buttons, or images — the design is deliberately flat
- Do not use Lyon weight 100 for functional labels, buttons, or navigation — it is a display face only
- Do not round card corners beyond 5px — the contrast between 50px pill controls and 5px cards is structural
- Do not add borders, backgrounds, or containers to the editorial pull-quote block — let it float on canvas
- Do not use bold weights (600+) for body copy — Suisse 500 is the heaviest functional weight
- Do not add drop-shadows or glows to the circular icon buttons or the slide counter

## Elevation

The design deliberately avoids shadows — surfaces separate through value contrast (white vs. #f5f5f5 vs. black) and 1px hairline borders, never elevation. This flatness keeps the interface reading as printed editorial rather than app UI.

## Surfaces

- **Canvas** (`#ffffff`) — Page background, the dominant surface — sets the gallery-floor tone
- **Wash** (`#f5f5f5`) — Subtle elevation layer for cards, inputs, secondary panels
- **Ink** (`#000000`) — Inverted surface for filled buttons, dark hero moments, image overlays

## Imagery

Photography is the dominant visual content and occupies the majority of screen real estate. Treatment is full-bleed, edge-to-edge, with sharp corners and no masks or rounded overlays. Images are editorial in register — architectural exteriors, human subjects in dramatic monochrome environments, cultural/civic moments — never product shots or stock photography. The color lives inside the photographs (a red gown, a cyan poster) rather than in the UI frame around them. There is no illustration, no 3D, no abstract graphics. Icons are minimal monochrome line work, approximately 1-1.5px stroke weight, matching the typography's restraint. The overall image-to-text ratio is roughly 70/30, leaning heavily on visual storytelling.

## Layout

Full-bleed page model with no max-width container — content reaches the viewport edge. The hero is a 50/50 split-screen with two photographs meeting at the center seam. Below the hero, the manifesto quote flows as a single column with generous right margin (the left ~60% holds text, right ~40% is white space). The feed section is a horizontal card grid (4 cards visible per row, scrollable) with tight 1px dividers between them. Navigation is a single-line top bar: logo far left, hamburger far right, no center cluster. Section transitions are seamless — no colored bands, no alternating backgrounds, just white space and the occasional 1px hairline. The rhythm is spacious and unhurried, reading more like a gallery walkthrough than a product page.

## Similar Brands

- **Pentagram** — Same editorial-gallery aesthetic, full-bleed photography, achromatic interface, whisper-weight serif headlines on white
- **Manual (manualcreative.com)** — Same pill-button geometry, monochrome palette, large-scale photography, serif display type
- **Locomotive (locomotive.ca)** — Same hairline-border minimalism, full-bleed imagery, black-and-white interface with color confined to editorial artwork
- **Bureau Cool** — Same anti-decoration flatness, generous spacing, serif-led typographic identity, museum-label restraint
- **Wieden+Kennedy portfolio** — Same split-hero composition, 50/50 image layout, white-canvas navigation, typographic confidence
