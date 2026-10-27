# Freelance frontend UI developer and designer, Rou Hun Fan — Style Reference
> Riso-printed zine on black construction paper

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A brutalist editorial portfolio for an independent frontend developer: near-black canvas, oversized condensed display type, and a single high-saturation accent block that detonates against the void. Layout behaves like a printed magazine spread — text breaks across asymmetric columns, type meets image at hard edges, and whitespace is used as a structural element rather than padding. The signature move is the cyan card with magenta display text that feels pasted onto the page like a sticker, breaking the monochrome discipline. Typography carries all the weight: a monospaced geometric for system voice, a heavy condensed sans for shouting, and a calligraphic script for editorial flourishes that humanize the machine aesthetic.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon | `#0a0a0a` | Page canvas and section backgrounds — near-true-black maximizes the contrast pop of white type and saturated accent blocks |
| Bone | `#ffffff` | Primary text, display headlines, borders, and link strokes — the only voice for the majority of the page |
| Voltage Cyan | `#1ef0e4` | Accent card backgrounds, highlight panels — flat saturated cyan that screams against the dark canvas, reserved for project cards and editorial callout blocks |
| Plasma Magenta | `#e91e8c` | Display text on cyan cards, decorative script flourishes — hot pink/magenta used only as ink-on-cyan contrast or as editorial accent |
| Ember | `#ff3a1a` | Supporting palette color for small decorative accents when the core palette needs contrast. |

## Typography

### Azeret Mono — Monospace system voice — navigation, metadata, UI labels, footer text. Brings a developer-terminal identity that matches the frontend-developer positioning
- **Substitute:** JetBrains Mono, IBM Plex Mono, Space Mono
- **Weights:** 400, 700
- **Sizes:** 100px
- **Line height:** 1.4–1.5
- **OpenType features:** `"aalt" on`

### AzeretMono (display variant) — Oversized condensed display headlines (ROU HUN FAN, UI DEV, DESIGN, MOTION & FRONTEND). The extreme scale and bold weight turn the page into a typographic poster — type IS the design
- **Substitute:** Bebas Neue, Anton, Tungsten Bold
- **Weights:** 700, 900
- **Sizes:** 
- **Line height:** 1.0–1.2

### Ephidona — Calligraphic editorial script for section labels (PROJECTS). Counter-typography that breaks the geometric/mono discipline with human handwriting — the anti-machine flourish that signals personal craft over automated output
- **Substitute:** Pinyon Script, Allura, Tangerine
- **Weights:** 400
- **Sizes:** 100px, 108px
- **Line height:** 1.2
- **OpenType features:** `"aalt" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.3 | — |
| heading | — | — | 56px | 1.1 | — |
| heading-lg | — | — | 72px | 1.05 | — |
| display | — | — | 100px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 1400px
- **Section gap:** 80-120px
- **Card padding:** 32-48px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Display Headline
**Role:** Primary typographic element — sets the poster/magazine tone

AzeretMono 700/900 at 72–100px, white (#ffffff) on Carbon (#0a0a0a), line-height 1.0–1.2, no letter-spacing. Text breaks across columns asymmetrically. This is the dominant UI element — larger than any other component on the page.

### Editorial Script Label
**Role:** Section divider and humanizing accent

Ephidona 400 at 72–108px, Ember (#ff3a1a) on Carbon, overlapping the edge of a Voltage Cyan card. Used as a diagonal/rotated overlay on project cards to add editorial energy. Only 1–2 instances per page.

### Voltage Project Card
**Role:** Featured project showcase block

Background Voltage Cyan (#1ef0e4), Plasma Magenta (#e91e8c) display text (PROBLEM STUDIO) at 48–72px AzeretMono bold, small Plasma Magenta body text below. Zero border-radius. Hard rectangular edge. Often contains a torn-paper or organic decorative shape in Plasma Magenta at the bottom edge.

### Monospace Navigation
**Role:** Top-of-page nav and section links

Azeret Mono 400 at 14–16px, white, uppercase, tracking slightly expanded. No background fill — text only, sitting directly on Carbon. Minimal: 3–5 items max. Separated by generous whitespace, not dividers.

### Photo Plate
**Role:** Personal photography and project imagery

Full-bleed or near-full-bleed images on Carbon, zero border-radius, no border. Images butt directly against display text — no padding gutters. Photography is warm-toned, candid, medium-format feel.

### Metadata Tag
**Role:** Small labels for project categories, years, skills

Azeret Mono 400 at 12–14px, white or dimmed white on Carbon. No background. Uppercase. Stacked vertically with 9px gaps (the detected elementGap token). No pill shape, no border.

### Footer
**Role:** Contact and social links

Azeret Mono 400 at 12–14px white on Carbon, full-width, left-aligned. Includes email, social handles, and copyright. No dividers. Maximum 3–4 lines.

### Decorative Organic Shape
**Role:** Graphic accent on Voltage cards

Plasma Magenta (#e91e8c) irregular blob/torn-paper shape at the base of Voltage Cyan cards. Flat fill, no gradient, no border. Creates visual friction between the geometric card and organic flourish.

## Do's and Don'ts

### Do
- Use AzeretMono 700/900 at 72–100px for all primary headlines — type scale should feel oversized, never comfortable
- Apply Voltage Cyan (#1ef0e4) as flat panel backgrounds only — never as gradients, never as semi-transparent overlays
- Keep all border-radius at 0px — cards, buttons, images, tags are all hard rectangles
- Use Ephidona script sparingly (1–2 instances per page) as editorial flourishes on Voltage cards, not for functional text
- Set elementGap to 8–16px and use whitespace as structural division between content blocks
- Let display text break across columns naturally — asymmetric, magazine-grid layout is intentional
- Pair Plasma Magenta text exclusively with Voltage Cyan backgrounds — never use magenta on dark or magenta as body text

### Don't
- Don't add box-shadows, drop-shadows, or any form of depth simulation — the design is ruthlessly flat
- Don't round corners on any element — hard edges define the brutalist editorial language
- Don't use the brand accent colors for buttons or CTAs — there are no traditional CTAs; navigation is text-only
- Don't introduce a third display weight between 56px and 100px — the scale jumps from readable to poster-sized, no comfortable middle ground
- Don't apply gradients to any surface — the palette is 100% flat fills
- Don't use the Ephidona script for body copy, navigation, or functional labels — it is decorative only
- Don't soften the white text with opacity below 80% for body content — if hierarchy is needed, drop the size and weight instead

## Elevation

No shadows, no depth, no glassmorphism. The design is deliberately flat — every element sits on the same plane. The impression of hierarchy comes from scale contrast (100px display vs 12px caption) and color contrast (white on black, magenta on cyan), not from elevation. This is a print-design, not a UI-design sensibility applied to the web.

## Surfaces

- **Carbon Canvas** (`#0a0a0a`) — Full-bleed page background, section bands
- **Voltage Card** (`#1ef0e4`) — Featured project cards, editorial callout panels
- **Image Plate** (`#1a1a1a`) — Photo containers, embedded media blocks

## Imagery

Photography is warm-toned, candid, slightly desaturated — medium-format film aesthetic rather than polished commercial. Images are presented full-bleed or near-full-bleed with no rounded corners, no borders, and no decorative framing. A humanizing counterpoint to the machine typography: the photographer is shown mid-action, smiling, in a real space with natural light. The combination of a person + organic photo against the geometric type + flat cyan panels creates the core visual tension of the brand.

## Layout

Full-bleed dark canvas with no visible page margins constraining the content — elements break to the viewport edges. The hero is a typographic poster: oversized white text (ROU HUN FAN, UI DEV, DESIGN, MOTION & FRONTEND) wrapping asymmetrically across multiple columns, with a Voltage Cyan project card pasted on top at an offset position. Below, a full-width candid photo sits beside a large serif/script '10+ YEARS' stat block. The page rhythm alternates between text-dominant poster sections and image-dominant photo sections, separated by generous 80–120px vertical gaps. No sidebar, no sticky header, no max-width constraint — the layout is intentionally uncontained, like a zine spread.

## Similar Brands

- **Locomotive** — Same editorial web-magazine layout with oversized display type, asymmetric column breaks, and a dark canvas punctuated by a single saturated accent color
- **Pentagram** — Brutalist typographic-poster hero treatments where type itself is the design, paired with full-bleed candid photography and zero decorative chrome
- **Rauno Freiberg** — Independent developer portfolio using monospaced system type at extreme scale against dark backgrounds, with flat saturated accent panels that feel pasted onto the page
- **Tobias van Schneider** — Personal portfolio using oversized condensed display type as the primary visual element, with accent color blocks and editorial spacing rhythm
- **Active Theory** — Dark-canvas creative studio site with flat saturated accent panels, oversized type, and a print-poster rather than app-UI sensibility
