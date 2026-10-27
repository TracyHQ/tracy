# Firstandforemost — Style Reference
> Protest poster on cream paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

First+Foremost is a monochrome canvas charged by a single vivid orange — a design system that treats one color as a loudhailer rather than a decoration. The aesthetic is editorial and protest-poster: vast white paper, giant thin sans-serif type that bleeds past the viewport, botanical line-art illustrations in the same orange, and pill-shaped controls with 80px radii. Layout is centered and breathing; content sections are either full-white statements or full-orange broadcasts with no middle ground. Photography is limited to circular black-and-white portrait crops on the orange field. The rhythm alternates between silence (white space, thin weight) and shouting (200px display, solid orange band).

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Orange | `#ff4501` | Brand color saturating hero text, navigation borders, section backgrounds, body text accents, and icon strokes — the only chromatic voice in the system; treated as both ink and fill |
| Apricot Wash | `#ffefe9` | Tertiary surface — soft peach band at the foot of white sections, footer background, subtle warmth under statement blocks |
| Peach Mist | `#ffc2a9` | Hairline border accent on the orange field, low-contrast divider where #ff4501 would be too loud |
| Paper White | `#ffffff` | Primary canvas and card surface; text-on-orange and image borders |
| Carbon Ink | `#000000` | SVG illustration fill, icon weight, photographic subjects — black only, never used for body text on white |

## Typography

### NeueMontreal — Single family carries the entire system. Weight 100 at 200px size is the signature — whisper-thin display type that becomes monumental through scale alone, not boldness. Weight 400 for body and navigation, weight 700 reserved for statement headlines and emphasis. Line-height compresses to 0.80 on the massive display sizes so the letterforms stack into a solid block.
- **Substitute:** Inter (weight 100 maps to Thin)
- **Weights:** 100, 400, 700
- **Sizes:** 16, 22, 26, 36, 58, 80, 200
- **Line height:** 0.80, 1.00, 1.20, 1.36, 1.40, 1.45
- **Letter spacing:** normal at all sizes; tracking stays default to let the tight line-heights do the work

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 16px | 1.45 | — |
| body-lg | — | — | 22px | 1.4 | — |
| subheading | — | — | 26px | 1.36 | — |
| heading-sm | — | — | 36px | 1.2 | — |
| heading | — | — | 58px | 1.2 | — |
| heading-lg | — | — | 80px | 1 | — |
| display | — | — | 200px | 0.8 | — |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 160px
- **Card padding:** 50px
- **Element gap:** 60px

### Border Radius

- **avatars:** 9999px
- **buttons:** 80px
- **sections:** 0px

## Components

### Pill Button
**Role:** Primary and secondary call-to-action control

80px border-radius creating a true pill shape. Two variants: (1) Ghost — transparent background, 1px #ff4501 border, #ff4501 text, 50px horizontal padding; (2) Filled — #ff4501 background, #ffffff text, no border. Padding approximately 16px vertical × 50px horizontal. Text in NeueMontreal weight 400 at 16px.

### Orange Broadcast Section
**Role:** Full-bleed content band that reverses the canvas

Full-width #ff4501 background, no border-radius, generous padding (110px bottom, 160px top). Content splits: text block left-aligned at 36–58px, circular avatar cluster right-aligned. Text in #ffffff at heading weight 700; supporting copy in weight 400.

### Portrait Circle Avatar
**Role:** Team member thumbnail

Circular crop (border-radius 9999px) of black-and-white photography, roughly 60–70px diameter. Arranged in overlapping horizontal row with negative gap so faces slightly touch. White 1–2px border separates photo from the orange field.

### Statement Block
**Role:** Centered mission text on white

Centered text stack on #ffffff canvas. Headline at 58px weight 700 in #ff4501, line-height 1.20, max-width constrained to keep three lines. Supporting paragraph at 16–22px weight 400 in #ff4501 below. Apricot Wash band (#ffefe9) anchors the bottom edge of the section.

### Display Headline
**Role:** Scrolling or static hero type that exceeds viewport

NeueMontreal weight 100 at 200px, line-height 0.80, #ff4501 fill. Intentionally overflows the viewport horizontally — the letters are clipped by the page edge rather than wrapping. Acts as both content and decorative texture.

### Botanical Line Illustration
**Role:** Decorative bottom-edge graphic in hero and section transitions

Hand-drawn leaf and frond forms in #ff4501 stroke, 1.5–2px weight, no fill. Arranged as a dense organic border along the bottom of the hero, overlapping and varying in scale. Functions as a typographic underline made of foliage.

### Wordmark Lockup
**Role:** Brand mark in header

"First + Foremost" stacked on two lines, NeueMontreal weight 700, #ff4501. The "+" sits between the two words as a visual fulcrum. Approximately 22–26px in the header, never scales to match other type — stays compact and recognizable.

### Ghost Navigation Link
**Role:** Top-bar navigation item

NeueMontreal weight 400 at 16px, #ff4501 text, no background, no underline at rest. Right-aligned cluster with ~58px gap between items. Active state adds a 1px #ff4501 underline.

### Tagline Pillar
**Role:** Centered descriptive text beside the wordmark

Vertical orange hairline rule (1px #ff4501) on the left, three lines of NeueMontreal weight 400 at 16px in #ff4501 on the right. Functions as a compact value proposition, not a navigation element.

### Full-Bleed Canvas Section
**Role:** Default content section background

#ffffff background, no border, section padding 160px top and bottom. Content centered horizontally with generous side margins. This is the system's resting state — silence between orange broadcasts.

## Do's and Don'ts

### Do
- Use Signal Orange (#ff4501) for all chromatic type, borders, and section fills — never introduce a second color
- Set hero display type at 200px weight 100 with line-height 0.80 so letters stack into a solid mass
- Apply 80px border-radius to every button; never use square or slightly-rounded buttons
- Let display headlines overflow the viewport horizontally — clipping is intentional
- Alternate between full-white and full-orange sections at 160px padding; avoid mid-tone grays
- Use botanical line illustrations in #ff4501 stroke as section transitions
- Set body type at 16–22px weight 400 in Signal Orange on white — black body text breaks the system

### Don't
- Don't add shadows, gradients, or glass effects — the system is flat ink on paper
- Don't use weight 400 or 700 for display sizes; the whisper-thin 100 weight is the signature
- Don't wrap the 200px display headline to multiple lines or scale it down to fit
- Don't place orange type on orange backgrounds or white type on white — the system has no mid-tones
- Don't introduce a secondary accent color, even for hover states — deepen the existing orange or invert to white
- Don't use card components with drop shadows or visible borders; sections are color blocks, not cards
- Don't use border-radius under 80px on any interactive element

## Elevation

The system is deliberately flat — no drop shadows, no glows, no layered translucency. Depth is created by alternating solid color blocks (white → orange → apricot) rather than by stacking surfaces with shadows. Borders are 1px hairlines in #ff4501, not raised edges.

## Surfaces

- **Paper White** (`#ffffff`) — Default canvas for hero, statement blocks, and resting sections
- **Apricot Wash** (`#ffefe9`) — Subtle warm band at the foot of white sections, footer area
- **Signal Broadcast** (`#ff4501`) — Full-bleed inverted section for team, calls-to-action, and emphasis blocks

## Imagery

Imagery is minimal and tightly curated. Photography appears only as black-and-white circular portrait crops (60–70px) on the orange broadcast section, arranged in an overlapping row. Illustration dominates: hand-drawn botanical line art in #ff4501 stroke, 1.5–2px weight, no fill, used as a decorative bottom border in the hero. No product photography, no lifestyle imagery, no 3D renders. The visual system treats illustration and typography as the primary content, with photography as functional identification only.

## Layout

Full-bleed page architecture with no max-width container. The header is a compact horizontal bar: wordmark left, tagline center, navigation right. Hero is a vertical stack — centered or left-aligned statement type, then a massive 200px display headline that intentionally overflows the viewport, then a botanical illustration border at the bottom edge. Body sections alternate between centered statement blocks on white and full-width orange broadcast bands. Content within orange bands is split: text left, visual cluster right. Vertical rhythm is dramatic — 160px section padding, 110px between major blocks, 60px between elements within a block. Navigation is a minimal top bar with generous 58px gaps. The overall density is spacious to the point of theatrical — white space is content, not absence.

## Similar Brands

- **Wieden+Kennedy** — Same poster-scale editorial typography and willingness to let a single saturated color carry an entire brand expression
- **Mucca** — Shared typographic confidence — oversized thin sans-serif as the primary visual instrument, monochrome canvas with one chromatic accent
- **Pentagram** — Flat ink-on-paper aesthetic, generous white space as active design element, pill-shaped controls, and botanical/illustrative accents
- **Ueno** — Agency site language that treats display type and illustration as the interface itself, with minimal photography and strong color-block sectioning
