# OpenServ — Style Reference
> Bright blueprint on frosted glass

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

OpenServ operates in a bright, almost gallery-like visual register: pure white canvas, hairline-bordered surface cards, and two high-contrast typographic voices — a geometric grotesque for UI and a whisper-light transitional serif for headlines and section moments. Color is rationed: a single vivid violet (#5f79ff) carries every interactive moment, while a saturated mint (#01fe93) flashes only on success, highlights, and a thin gradient stripe at section boundaries. The interface is deliberately unweighted — no drop shadows on content, no decorative gradients, no emoji-grade illustration. Rounded geometry at 16px for surfaces and 100px for action buttons gives the whole product a soft, optimistic feel without sliding into the rounded-everything SaaS template.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Violet | `#5f79ff` | Primary action fill, active nav state, icon accent strokes, focused border — the single chromatic anchor that makes buttons feel switched on against the white canvas |
| Mint Pulse | `#01fe93` | Green action color for filled buttons, selected navigation states, and focused conversion moments |
| Pure White | `#ffffff` | Page background, card surface, button text on violet fill, inverted surface for nav float |
| Ink Black | `#000000` | Primary text, heading text, hairline borders, icon strokes, footer ink |
| Fog Gray | `#f5f5f5` | Card surface lift, subtle background blocks, muted link backgrounds |
| Mist Gray | `#a6a6a6` | Muted nav text, secondary borders, placeholder strokes |
| Ash Gray | `#4d4d4d` | Body secondary text, subdued copy, supporting label color |
| Smoke Gray | `#9c9c9c` | Tertiary borders, disabled or inactive outlines |
| Slate Gray | `#707070` | Helper text, metadata, fine print |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### OS Studio Grotesk — Primary UI and body typeface — geometric grotesque used for nav, buttons, body copy, cards, and most interface text at sizes 12–24px. At 40–72px it serves as secondary display when paired with the serif. Slightly negative tracking (-0.017em to -0.020em) tightens dense UI labels.
- **Substitute:** Inter, Manrope, or DM Sans
- **Weights:** 400
- **Sizes:** 12px, 13px, 15px, 20px, 22px, 24px, 30px, 40px, 72px
- **Line height:** 0.90, 1.00, 1.10, 1.14, 1.18, 1.25, 1.40
- **Letter spacing:** -0.02em to -0.017em
- **OpenType features:** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`

### OS Chronik — Display serif used for editorial headlines like 'Build • Launch • Run' and 'Join the Appcelerator' — the 300 weight is the signature: most product sites push serifs to 400–600, but this light cut lets headlines read as quiet announcements rather than shouts. Tighter tracking at 72px (-0.020em) keeps the long descenders visually anchored.
- **Substitute:** Cormorant Garamond Light, Playfair Display Light, or EB Garamond Light
- **Weights:** 300
- **Sizes:** 18px, 24px, 34px, 72px
- **Line height:** 0.90, 1.00, 1.10, 1.20
- **Letter spacing:** -0.020em at 72px, -0.015em at 24–34px
- **OpenType features:** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body | — | — | 15px | 1.4 | — |
| subheading | — | — | 20px | 1.25 | — |
| heading-sm | — | — | 24px | 1.2 | — |
| heading | — | — | 30px | 1.18 | — |
| heading-lg | — | — | 40px | 1.1 | — |
| display | — | — | 72px | 0.9 | -1.44px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 10-20px

### Border Radius

- **nav:** 16px
- **cards:** 16px
- **badges:** 100px
- **images:** 16px
- **inputs:** 12px
- **buttons:** 100px

## Components

### Floating Nav Bar
**Role:** Primary site navigation

Pill-shaped container with #ffffff background, 16px border radius, 48px soft shadow, containing logo lockup left, center nav links in OS Studio Grotesk 15px #000000, and a violet pill CTA on the right. The bar floats with generous top margin and does not span full width — it lives centered with white space on both sides.

### Violet Pill CTA
**Role:** Primary action button

Filled #5f79ff background, white text in OS Studio Grotesk 15px weight 400, 100px border radius (fully rounded), 10px vertical padding, 18–20px horizontal padding. Arrow glyph in white after label. Used for 'Open App', 'Read', 'See More' style actions.

### Ghost Nav Link
**Role:** Secondary navigation

Text-only, no background, OS Studio Grotesk 15px #000000, 8px horizontal padding. No underline, no hover fill — hover state only shifts color toward #5f79ff.

### Content Card
**Role:** Categorical content tile (Docs, Economics, Whitepaper)

White background with 1px #f5f5f5 or #a6a6a6 border, 16px border radius, 24px internal padding. Header label in violet (#5f79ff) caption weight, title in OS Studio Grotesk 20–24px #000000, body copy in 15px #4d4d4d. Footer row with violet pill button left and a circular plus/expand button right at 40px diameter.

### Highlight Card
**Role:** Featured content with image

Same structure as Content Card but with a 16px radius image block filling 40–50% of the card height. Images are full-bleed within the card with no internal padding; can be dark photographic or network-graph illustrations.

### Editorial Headline Block
**Role:** Section title with editorial typography

Centered stack on pure white. Display heading in OS Chronik 300 at 72px, color #000000, letter-spacing -1.44px, line-height 0.9. Supporting subtitle in OS Studio Grotesk 18–20px #4d4d4d below with 16–20px gap. No decorative elements — the typography does all the work.

### Decorative Sparkle
**Role:** Atmospheric hero illustration

Four-pointed star shapes and small circles in #d9defc or light violet at 10–20% opacity, scattered asymmetrically around display text. Acts as subtle atmosphere without competing with the headline.

### Section Divider Stripe
**Role:** Visual break between content bands

A thin 2–4px tall band running full-bleed at the page edge, split into segments of #01fe93, #5f79ff, and #000000. Functions as a section closer and brand recolor in a single line.

### Logo Lockup
**Role:** Brand mark in nav and footer

Circular concentric ring icon in #000000 paired with 'OpenServ' wordmark in OS Studio Grotesk 400 #000000, 15px. Icon sits flush-left of wordmark with 8px gap.

### Expand Button
**Role:** Card action affordance

Circular 40px diameter button with 1px #a6a6a6 border, white fill, containing a thin '+' glyph in #000000. Sits bottom-right of content cards to invite interaction.

## Do's and Don'ts

### Do
- Use #5f79ff filled pills with 100px radius for every primary action — never rectangular CTAs.
- Pair the two typefaces deliberately: OS Chronik 300 for editorial moments (hero, section openers, large quotes), OS Studio Grotesk 400 for everything functional.
- Keep cards flat with 1px hairline borders at #a6a6a6 or #f5f5f5 — no drop shadows on content surfaces.
- Apply -0.020em letter-spacing at 72px display and -0.017em at 20–24px UI sizes; let the negative tracking do the tightening work.
- Center editorial headlines on pure white with no decoration — the OS Chronik 300 weight is the visual event.
- Use 16px radius for all cards, images, and nav containers — the 100px pill is reserved exclusively for buttons and badges.
- Apply the mint-violet-black section stripe only as a closing band, not as inline decoration.

### Don't
- Don't use drop shadows on cards, buttons, or images — shadow is reserved for the floating nav.
- Don't push the serif above weight 300 — heavier weights break the whisper-quiet editorial voice.
- Don't introduce additional accent colors — the system is monochromatic with exactly two chromatic notes.
- Don't use rectangular buttons with 4–8px radius; the pill shape is a system commitment.
- Don't apply gradients to surfaces; the only gradient-adjacent element is the tri-color section stripe.
- Don't set body text below 13px or above 18px — the 15px body / 13px small / 18px subhead range is the readable band.
- Don't use #01fe93 as a CTA fill — mint is a status/accent role, not an action color.

## Elevation

- **Floating Nav Bar:** `0px 0px 48px 0px rgba(0, 0, 0, 0.1)`

## Surfaces

- **Canvas** (`#ffffff`) — Page background — pure white, no texture
- **Card** (`#f5f5f5`) — Elevated content blocks and soft surface distinction
- **Tint Wash** (`#d9defc`) — Subtle violet-tinted accent surface for highlighted panels

## Imagery

Imagery is sparse and deliberate. The hero uses abstract decorative elements only — small four-pointed sparkle shapes and circles in light violet at low opacity, plus a single italicized word 'Run' as a visual anchor. Content cards use two image modes: clean editorial photography on the left edge (portrait crops with hard cut, no rounded treatment on the photo itself beyond the 16px card radius) and dark network-graph illustrations with green/teal neural-network visualization on dark backgrounds. No lifestyle photography, no staged scenes, no 3D renders — imagery either documents (whitepaper covers, document photos) or diagrams (AI agent network topologies). The visual language treats imagery as informational, not emotional.

## Layout

The page uses a max-width 1200px centered container with generous outer white space. The hero is a vertically centered stack with decorative sparkles and a large display word, followed by a full-width editorial headline block. Content sections alternate between centered text blocks and 3-column card grids (docs, economics, whitepaper) with horizontal scroll capability. The floating nav is the only element that breaks the page rhythm — it sits elevated above the content with a soft 48px shadow halo. Section transitions use full-bleed colored stripes rather than whitespace gaps. Overall density is comfortable with 80px section gaps and 24px card padding, creating a gallery-like breathing rhythm.

## Similar Brands

- **Linear** — Same white-canvas minimalism with a single vivid chromatic accent for actions, hairline-bordered flat cards, and tight geometric sans-serif UI typography
- **Vercel** — Near-identical floating pill nav bar, generous section whitespace, pure white surfaces with no decorative shadows, and rationed single-accent color usage
- **Stripe** — Editorial serif headlines paired with clean grotesque body type, gradient-free flat surfaces, and the same gallery-like document-card grid rhythm
- **Anthropic** — Restrained typography with intentional weight contrast between display and body, off-white card surfaces, and minimal use of a single brand chromatic
- **Framer** — Pill-shaped primary CTAs, light-mode interface with floating elevated nav, and the same pattern of decorative atmospheric shapes (sparkles, dots) around display type
