# fastht.ml — Style Reference
> Confetti scattered across gallery walls

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

FastHTML runs on a sticker-pack logic: monochrome type and pill-shaped controls float over alternating full-bleed color bands (light canvas, deep aubergine, periwinkle violet) while vivid green, yellow, pink, and violet shapes scatter like confetti in the margins. The signature is the button — a black pill with a two-layer shadow that stacks a bright white inner highlight on top of a dark drop shadow, making every control read as a physical sticker peeled from the page. Typography stays geometric and compact (Geist, tight tracking on large sizes, Geist Mono for code) so the saturated accents can do the emotional work. Cards are generously rounded (24–40px) but never feel soft — they sit on hard color blocks, not on layered neutrals.

## Colors

| Name | Value | Role |
|------|-------|------|
| Sticker Green | `#3cdd8c` | Decorative blob shapes, accent fills in hero and code-demo section |
| Sticker Yellow | `#ffc435` | Decorative blob shapes, warm accent fill in hero |
| Sticker Pink | `#e699d9` | Decorative blob shapes, soft accent fill in hero |
| Periwinkle Violet | `#7575f0` | Full-bleed FAQ section background, section-level color band |
| Soft Periwinkle | `#939eeb` | Inline text accents, table text, light violet typography |
| Deep Aubergine | `#3a2234` | Dark code-demo section background — the primary dark band |
| Mint Cream | `#d4f7e6` | Tinted card surface — pale green card variant |
| Cotton Candy | `#ffccf7` | Tinted card surface — pale pink card variant |
| Butter Cream | `#ffeecc` | Tinted card surface — pale yellow card variant |
| Lavender Mist | `#e8e8fc` | Tinted card surface — pale violet card variant, nav pill background |
| Dusty Mauve | `#eddee9` | Tinted card surface — mauve card variant |
| Carbon | `#000000` | Primary text, filled button fill, hero headline color |
| Paper White | `#ffffff` | Light section canvas, card surface on dark/violet bands, button text on black |
| Fog | `#f3f3f3` | Light card surfaces on light sections, subtle fills |
| Silver | `#e5e7eb` | Hairline borders, dividers, table grid lines |
| Ash | `#cccccc` | Muted secondary text, placeholder labels |
| Graphite | `#999999` | Disabled/inactive text, table muted cells |
| Slate | `#333333` | Borders on dark sections, secondary dividers |

## Typography

### Geist — All interface text — headlines, body, buttons, nav, cards. Geist is a geometric sans with hard-cut terminals; weight 400 carries body, weight 500 carries UI controls and subheads. Display sizes use tight negative tracking (up to -0.015em) to lock letters together at hero scale.
- **Substitute:** Inter, Manrope, or system-ui
- **Weights:** 400, 500
- **Sizes:** 16px, 20px, 24px, 32px, 60px, 72px
- **Line height:** 1.10–1.50 (tight 1.10–1.25 on display, 1.40–1.50 on body)
- **Letter spacing:** -0.015em at 72px, -0.01em at 60px, -0.005em at 32px, normal at 16px
- **OpenType features:** `"clig" 0, "liga" 0`

### Geist Mono — Code blocks, inline code, file labels, tabular data. Loose 1.80 line-height is deliberate — it creates breathing room around syntax tokens so colored keywords read as decoration, not noise.
- **Substitute:** JetBrains Mono, Fira Code, or ui-monospace
- **Weights:** 500
- **Sizes:** 14px, 16px
- **Line height:** 1.80
- **OpenType features:** `"clig" 0, "liga" 0`

### Arial Black — Arial Black — detected in extracted data but not described by AI
- **Weights:** 400, 700
- **Sizes:** 16px, 20px
- **Line height:** 1.5
- **OpenType features:** `"clig" 0, "liga" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.8 | 0px |
| body-sm | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.4 | -0.1px |
| heading-sm | — | — | 24px | 1.33 | -0.12px |
| heading | — | — | 32px | 1.25 | -0.16px |
| heading-lg | — | — | 60px | 1.22 | -0.6px |
| display | — | — | 72px | 1.1 | -1.08px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-96px
- **Card padding:** 32px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 9999px
- **hero:** 40px
- **tags:** 9999px
- **cards:** 24px
- **images:** 20px
- **buttons:** 9999px
- **codeBlocks:** 16px

## Components

### Pill Navigation Bar
**Role:** Floating top navigation

Horizontal pill (9999px radius) with Lavender Mist (#e8e8fc) fill, 8px vertical / 16px horizontal padding, containing a small FastHTML logo badge on the left and a black 'Read docs' button on the right. Floats over page content with the two-layer embossed shadow. Centered at the top of the page, sits inside a max-width container.

### Black Filled Button (primary action)
**Role:** Primary CTA — the only action color in the system

9999px pill, #000000 fill, #ffffff text at 16px/weight 500, 8px vertical / 24px horizontal padding, with the signature two-layer embossed shadow (white inner highlight + dark drop shadow). No colored alternative — every primary action is black.

### Ghost / Outlined Button (secondary action)
**Role:** Secondary CTA like 'Watch intro'

9999px pill, transparent or #ffffff fill, 1px #000000 border, #000000 text at 16px/weight 500, 8px/24px padding. Often contains a leading element (avatar thumbnail, icon) inline with the label. Same embossed shadow as the filled variant.

### Decorative Blob Shapes
**Role:** Background atmosphere in hero sections

Scattered geometric shapes — circles, rounded squares, capsule pills — in Sticker Green, Sticker Yellow, Sticker Pink, and Periwinkle Violet, each at 20–40px radius. Positioned absolutely around the hero content as oversized decorations (some spilling off-canvas), creating confetti-like rhythm. Never informational, never interactive.

### Dark Code-Demo Section
**Role:** Full-bleed band showing live components

Full-bleed band with Deep Aubergine (#3a2234) background, 64–96px vertical padding. Contains a centered white headline at heading-lg scale, then a 2-column split: code block on the left (16px radius, near-black fill, Geist Mono with syntax tokens) and a demo card on the right (Paper White surface, 20px radius, containing a rounded image at 16px radius).

### Code Block Card
**Role:** Syntax-highlighted code display

16px radius, near-black fill (#000000 or #1a1a1a), Geist Mono at 14px/weight 500, 1.8 line-height. Top bar shows a filename label (e.g. 'card3d.py') in 14px Geist with a copy icon at the right. Keywords and strings colored with site accents (periwinkle, pink, green) for visual rhythm against the dark background.

### Component Demo Card
**Role:** Right-column partner to the code block

Paper White (#ffffff) surface, 20px radius, 32px padding, containing a rounded image (16px radius) that demonstrates the component live. Sits at the same height as the code block for visual parity.

### Tab Pills Row
**Role:** Category switcher beneath code demo

Horizontal row of pill-shaped tabs inside a dark rounded container. Active tab has a slightly lighter/different fill than inactive. Labels: 'Components', 'Dynamic', 'Reusable', 'Databases' at 16px Geist. 9999px radius on every tab.

### Periwinkle FAQ Section
**Role:** Full-bleed band for Q&A content

Full-bleed Periwinkle Violet (#7575f0) background, 64–96px padding. Two-column: left column holds an eyebrow ('FAQ'), a heading-lg title, and body subtext all in #000000; right column stacks 6–8 accordion cards vertically with 16px gap.

### FAQ Accordion Card
**Role:** Expandable question card

Paper White (#ffffff) surface, 16px radius, 20px vertical / 24px horizontal padding. Question text at 16px/weight 500 in #000000, left-aligned. Plus icon ('+') in 20px sits at the far right. No visible border or shadow — the white card on violet background provides all the separation needed.

### Tinted Feature Card
**Role:** Pastel-colored card for feature highlights

Available in five pastel tints — Mint Cream, Cotton Candy, Butter Cream, Lavender Mist, Dusty Mauve. 24px radius, 32px padding, no border, no shadow. Used to break up monochrome content sections with color punctuation.

### Watch Intro Card
**Role:** Inline media preview in CTA row

9999px pill-shaped card combining a small circular avatar thumbnail, a 14px label ('Watch intro'), a duration timestamp ('7min 30sec') in muted #999999, and a red YouTube play icon at the right. White fill, sits inline with the primary CTA as its companion.

## Do's and Don'ts

### Do
- Use 9999px radius on every button, nav, tag, and pill-shaped control
- Apply the two-layer embossed shadow (white inner highlight + dark drop) to any interactive element that should feel like a physical sticker
- Alternate full-bleed color bands vertically — light canvas, then dark, then saturated — rather than padding one background with colored cards
- Use Geist at weight 400 for body and weight 500 for UI controls; never go above weight 500
- Apply tight negative letter-spacing on display sizes: -0.015em at 72px, scaling toward 0 at body size
- Scatter 3–5 oversized confetti shapes (circles, rounded rectangles, capsule pills) around hero content as absolutely positioned decorations in Sticker Green, Yellow, Pink, and Periwinkle Violet
- Use Geist Mono at 14px with 1.8 line-height for all code blocks; color keywords with site accents

### Don't
- Don't introduce a colored CTA — the primary action is always black filled; the only action color is #000000
- Don't use square or 4px-radius buttons — every interactive shape is a pill or a generously rounded rectangle (16–24px)
- Don't put cards on layered neutral grays — cards sit on hard color blocks or stay flat on the white canvas
- Don't use serif fonts, script fonts, or display fonts — Geist and Geist Mono only
- Don't set body line-height below 1.4 or code line-height below 1.6 — the loose spacing is part of the sticker-pack reading
- Don't use #7575f0 (Periwinkle Violet) as a small accent — it's a section-level full-bleed background color, not a token
- Don't add drop shadows to FAQ cards or code-demo demo cards — their separation comes from the color block beneath, not from elevation

## Elevation

- **Primary/Secondary buttons, nav pill:** `rgba(255, 255, 255, 0.5) 0px 2px 2px 0px, rgba(0, 0, 0, 0.2) 0px 3px 3px 0px`
- **Cards, elevated surfaces:** `rgba(255, 255, 255, 0.1) 0px 2px 4px 0px inset, rgba(0, 0, 0, 0.5) 0px 4px 8px 0px`

## Surfaces

- **Light Canvas** (`#ffffff`) — Default page background, hero and content sections
- **Card on Light** (`#f3f3f3`) — Light card surface that lifts off the white canvas
- **Tinted Card** (`#e8e8fc`) — Pastel card variant — lavender/mint/butter/cotton candy tints used as colorful card surfaces
- **Dark Band** (`#3a2234`) — Full-bleed code-demo section background
- **Colored Band** (`#7575f0`) — Full-bleed periwinkle FAQ section

## Imagery

No photography. The visual language is built from two sources: (1) scattered geometric confetti shapes — circles, rounded squares, capsule pills in vivid green, yellow, pink, and violet — positioned as oversized background decorations that spill off-canvas, and (2) small product/illustration thumbnails inside demo cards (a dragon illustration at 16px radius in the code-demo section). Icons appear as small filled glyphs in the nav and tab rows. The decorative shapes are flat, hard-edged, and brand-colored; the few product images are tight crops with rounded corners and no lifestyle context — the object IS the demo.

## Layout

Full-bleed alternating color bands — light canvas hero, Deep Aubergine code-demo band, Periwinkle Violet FAQ band — stacked vertically with no gutters between them. Content inside each band is centered in a ~1200px max-width container with 64–96px vertical padding. Hero is a centered single-column stack: nav pill, headline, subtext, CTA row. Code-demo section splits 2-column (code left, demo right). FAQ section splits 2-column (title left, accordion stack right). Decorative confetti shapes are positioned absolutely around hero content, partially clipping off-canvas. Navigation is a single floating pill at the top — no sidebar, no mega-menu.

## Similar Brands

- **Vercel** — Same alternating full-bleed light/dark/saturated band structure and pill-shaped navigation floating over content
- **Linear** — Same tight Geist-class geometric typography, generous card radii (20–24px), and a single neutral-black action color
- **Resend** — Same confetti-decorated hero approach with scattered geometric accent shapes around centered copy
- **Railway** — Same sticker-pack logic with pill controls, pastel card variants, and a two-layer embossed button shadow
