# Adaptive ML — Style Reference
> Printed monograph on warm cream paper. A confident editorial monochrome where the only color is the artwork on the cards and the only ornament is the serif.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Adaptive ML presents a warm editorial-monochrome language: a near-black ink (#272421) on warm cream-white paper (#ffffff, #edebe8), with classical serif headlines (Egyptienne F) that read like printed monograph typography rather than web display text. The interface is deliberately austere — no chromatic accent, no decorative gradient panels, no colored badges — so the eye is pulled to one of two things: the editorial headlines, or the vivid abstract gradient artwork on content cards that acts as the only color in the system. Components are flat and confident: dark filled buttons, hairline borders, 9px radii, and an almost invisible 12px shadow reserved for elevated cards. The overall rhythm is spacious and sectioned, with uppercase tracked mono labels (Diatype Mono) used as quiet typographic furniture next to flowing serif display text.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#272421` | Primary text, filled buttons, dark inverse surfaces, hairlines, logo mark. The single darkest token in the system — a warm near-black that reads as ink, not pure black |
| Paper Warm | `#edebe8` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Paper Cool | `#e3e3e2` | Tertiary surface tint, alternating row backgrounds, inset wells. Slightly cooler than Paper Warm — used sparingly to create layered depth without color |
| Mist | `#eeeeed` | Subtle dividers, low-contrast borders, badge fill backgrounds, hover wash on neutral surfaces. Sits one step lighter than Paper Warm for hairline detail work |
| Stone | `#7d7c7a` | Muted body copy, secondary metadata, disabled labels, low-emphasis icon strokes. The mid-warm-gray that keeps supporting text legible without competing with Ink |
| Charcoal | `#333333` | Link text and link borders for in-content references. A step lighter than Ink, used only when a link needs to feel slightly less assertive than the primary type |
| White | `#ffffff` | Page canvas, button text on Ink fills, nav background, card image overlay text. The paper the whole system is printed on |

## Typography

### Egyptienne F LT — Display and hero headlines. This serif is the signature voice — its classical bracketed serifs and even stroke contrast give the brand a printed-monograph feel that sans-serif alternatives cannot reproduce. Used only for editorial display text, never for body or UI.
- **Substitute:** Source Serif Pro or PT Serif
- **Weights:** 400, 500
- **Sizes:** 22px, 77px, 94px
- **Line height:** 0.90, 1.00, 1.20
- **Letter spacing:** -0.028em to -0.030em (tight at all sizes)
- **OpenType features:** `"liga"`

### Diatype — Primary UI and body typeface. Geometric humanist sans that carries navigation, body copy, buttons, subheadings, and large sans-serif display text. 500 for emphasized labels, 700 reserved for rare weight contrast, 400 as the workhorse.
- **Substitute:** Inter
- **Weights:** 400, 500, 700
- **Sizes:** 14px, 15px, 18px, 24px, 32px, 48px, 72px, 88px
- **Line height:** 1.20, 1.30, 1.40, 1.43
- **Letter spacing:** -0.030em at 32px+ (tight), 0.018em at 14–24px (open)

### Diatype Mono — Micro-labels: step numbers, category tags (USE CASES, ADAPT, EVALUATE, SERVE), uppercase nav items, badge text. The wide tracking and mono face create the 'typographic furniture' that signals system structure without competing with the serif display.
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 11px, 13px
- **Line height:** 1.00, 1.40
- **Letter spacing:** 0.030em, 0.090em (wide, for uppercase tracked labels)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.4 | 0.33px |
| body | — | — | 15px | 1.43 | 0.27px |
| subheading | — | — | 18px | 1.3 | 0.32px |
| heading-sm | — | — | 24px | 1.3 | 0.43px |
| heading | — | — | 32px | 1.2 | -0.96px |
| heading-lg | — | — | 48px | 1.2 | -1.44px |
| display | — | — | 77px | 1 | -2.16px |
| display-xl | — | — | 94px | 0.9 | -2.82px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 9px
- **pills:** 9999px
- **badges:** 9px
- **inputs:** 9px
- **buttons:** 9px

## Components

### Primary Navigation Bar
**Role:** Site-wide header anchoring brand identity and top-level IA

White background, 1px bottom border in #edebe8 (or borderless). Logo left (Adaptive ML mark + wordmark, Ink). Centered uppercase nav items in 13px Diatype Mono, 0.090em tracking, Ink. Right-aligned filled dark CONTACT button. Total height roughly 72–80px with 24px horizontal padding inside a 1200px max-width container.

### Filled Dark Button
**Role:** Primary interactive control — the only button fill style in the system

Background #272421 (Ink), text #ffffff in 13px Diatype Mono uppercase, 0.090em tracking, 500 weight. 9px border-radius. Padding 10px 24px. No border. Optional trailing arrow icon for directional actions like 'Book a demo'. Used for top-right CONTACT and inline hero BOOK A DEMO.

### Outlined Ghost Button
**Role:** Secondary action when a neutral choice is needed

Transparent background, 1px border in #edebe8, Ink text in 13px Diatype Mono uppercase, 0.090em tracking. 9px border-radius. Padding 10px 24px. Sits beside or below filled dark buttons when two equal-weight actions are required.

### Workflow Tab Pill
**Role:** Segmented control for switching between platform stages

Fully rounded stadium shape (9999px radius). Active tab: Ink background, white text. Inactive tab: transparent, Ink text, 1px Ink hairline border. Labels in 13px Diatype Mono uppercase, 0.090em tracking. Padding 10px 20px. Used in the platform section for USE CASES / ADAPT / EVALUATE / SERVE.

### Use Case Card
**Role:** Content card surfacing a single use case with vivid gradient artwork

Full-bleed gradient image (abstract, organic, high-chroma) filling the card area. 9px border-radius. Label overlay in white 15px Diatype 500, positioned bottom-left with 16–24px inset padding. No visible border or shadow — the gradient image is the card. Cards arranged in a 3-column grid on desktop, gap 12–16px.

### Platform Feature Card
**Role:** Long-form content card describing a platform capability

Background #edebe8 (Paper Warm). 9px border-radius. Soft shadow 0 4px 12px rgba(39,36,33,0.1). 24–32px internal padding. Layout: left side holds an icon/illustration in a 160×160 area, right side holds an uppercase mono step label (11px, 0.33px tracking, Stone), a 24–32px serif heading, and a 15px body paragraph. Cards sit in a 2-column grid.

### Step Number Label
**Role:** Micro-label identifying a numbered section or step

11px Diatype Mono, 0.090em tracking, uppercase, color Stone (#7d7c78). Pattern: '001 ADAPT', '002 FASTPATHNESS'. Sits above a heading and acts as a section anchor — typography furniture, not navigation.

### Case Study Tag
**Role:** Pill tag labeling a logo or testimonial as a case study

Paper Warm background (#edebe8), Ink text, 9999px radius. 11px Diatype Mono uppercase, 0.090em tracking. Padding 6px 12px. Always paired with a customer logo above it.

### Customer Logo Strip
**Role:** Social proof band showing enterprise customers

Single row of customer logos rendered in grayscale (Stone or lighter). Logos separated by generous horizontal whitespace. Optional CASE STUDY pill beneath a logo. No borders, no backgrounds — logos float on white.

### Hero Section
**Role:** First-viewport editorial headline area

White canvas, centered content within 1200px. Headline 77–94px Egyptienne F, weight 400, -0.030em tracking, Ink, line-height 0.9–1.0, max 3 lines. Sub-paragraph in 15–18px Diatype 400, Stone. Dark filled BOOK A DEMO button beside or below the sub-paragraph. Generous vertical breathing room — roughly 80–120px top padding.

### Footer Logo Mark
**Role:** Wordmark and cluster icon used in nav

Three-dot cluster icon (representing a constellation or three nodes) paired with 'Adaptive' in Diatype 500 Ink, followed by a raised 'ML' superscript in 11px Diatype Mono, 0.090em tracking. Ink on white.

## Do's and Don'ts

### Do
- Use Egyptienne F (or Source Serif Pro substitute) at 77–94px, weight 400, line-height 0.9, -0.030em tracking for all hero and section headlines. Never set the serif above 100px or below 18px.
- Use 13px Diatype Mono uppercase with 0.090em tracking for every nav item, button label, and step label. This mono+wide-tracking pattern is the typographic signature of the system.
- Fill all primary action buttons with #272421 Ink, white text, 9px radius, and 10px 24px padding. Do not introduce a chromatic button color.
- Use 9px border-radius on every card, button, badge, and input. Reserve 9999px radius exclusively for stadium-shaped tab pills and case study tags.
- Apply the single shadow pattern — 0px 4px 12px rgba(39,36,33,0.1) — only to elevated feature cards. Do not stack or vary shadows anywhere else.
- Use #edebe8 (Paper Warm) as the card/panel surface and #ffffff as the canvas. Use #e3e3e2 (Paper Cool) only for inset wells and recessed containers.
- Let abstract gradient artwork carry all chromatic content on use case cards. Never add chromatic accents to buttons, borders, icons, or text — the system is monochrome by design.

### Don't
- Do not introduce a chromatic brand color, accent, or CTA fill. The system has no distinct CTA color; the primary action is a dark neutral fill, and that restraint is the identity.
- Do not use the serif typeface for body copy, button labels, or UI chrome. Reserve Egyptienne F for editorial display only.
- Do not use full black (#000000) anywhere — use #272421 Ink. The warm cast is intentional.
- Do not use bold (700) weight on body text or headlines. Reserve 700 for rare emphasis only; 400 and 500 carry the system.
- Do not use shadows larger than the single 12px 10%-opacity drop shadow, and never use shadows on buttons, inputs, or modals.
- Do not use tracking wider than 0.090em or tighter than -0.030em. The letter-spacing is bounded and intentional.
- Do not place text inside the gradient artwork on use case cards. Labels always sit at the bottom-left with a 16–24px inset on a clean white overlay or directly on the image's darker edge.

## Elevation

- **Elevated card (use case card, platform feature card):** `0px 4px 12px 0px rgba(39, 36, 33, 0.1)`

## Surfaces

- **Canvas** (`#ffffff`) — Page background, base layer for all content sections
- **Soft Surface** (`#edebe8`) — Card backgrounds, feature panels, secondary buttons, soft section bands
- **Cool Surface** (`#e3e3e2`) — Inset wells, table headers, slightly recessed containers
- **Inverse Surface** (`#272421`) — Filled buttons, dark badges, rare inverted sections — the only dark surface token

## Imagery

Imagery is the only color in the system and it is concentrated in one place: the use case cards. These are abstract, full-bleed, high-chroma gradient compositions — organic swirls of complementary and split-complementary colors (violet→orange, teal→red, indigo→amber) with a soft grain texture overlay. They feel like pigment mixing on wet paper or oil-on-canvas color fields, not corporate stock photography. The treatment is rounded (9px radius on the card), never masked, never overlaid with text inside the color. White labels sit at the bottom-left corner of each gradient. Outside of these cards, the site uses no photography, no people, no product screenshots — the gradient art IS the brand expression. Icons inside platform feature cards are simple geometric line+fill constructions (hexagons, circles, connecting dots) in Ink on the warm card surface.

## Layout

Centered max-width 1200px container with 24px gutters. Hero is a vertically generous centered text block (no split image, no video) with a single dark filled button. Below the hero, the use case grid is a 3-column masonry-style card wall where the gradient images provide all visual energy. A horizontal customer logo strip with generous whitespace breaks up the page. The platform section shifts to a 2-column card layout with icon+text pairs, centered serif section heading above. Nav is a single horizontal bar with logo left, uppercase mono links center, dark filled contact button right — no sticky behavior visible, no sidebar, no mega-menu. Section transitions are seamless white-to-white; depth comes from the warm Paper Warm card surfaces and the rare 12px shadow. The page is text-dominant everywhere except the use case grid, which is fully image-dominant.

## Similar Brands

- **Replicate** — Same warm-monochrome UI shell with abstract high-chroma gradient artwork as the only source of color on content cards
- **Mistral AI** — Editorial monochrome palette with classical serif headlines and spacious centered hero sections
- **Linear** — Restrained warm grayscale interface with confident typographic hierarchy and 8–10px corner radii throughout
- **Hugging Face** — Comfortable-density light theme with a single dark filled button style and no chromatic accent system
- **Anysphere (Cursor)** — Monochrome dev-tool aesthetic with editorial display type and uppercase tracked mono labels for navigation
