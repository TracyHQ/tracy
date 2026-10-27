# SAPGOODENERGY — Style Reference
> marathon finish line in a cleanroom

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

SAP Good Energy operates on a brutalist split personality: a full-bleed race-day video hero crashes into a clinical white product stage where a single silver packet floats alone in negative space. The palette is essentially monochrome — warm white canvas, near-black ink, and one vivid orange that appears only as functional punctuation (a vertical side tab, isolated CTA fills). Typography pairs a compressed neo-grotesque display face with aggressive negative tracking for headlines against a precise utility sans for body and navigation copy, both set tight and never shouting. Components are almost invisible — the product IS the hero on white screens, the race atmosphere IS the hero above the fold, and almost everything in between is empty air with hairline rules.

## Colors

| Name | Value | Role |
|------|-------|------|
| Fuel Orange | `#ff7840` | Side tab accent, occasional filled action — a single warm orange against clinical white acts as the only chromatic signal in an otherwise achromatic system, reading as urgency without aggression |
| Ink Black | `#000000` | Primary text, filled CTA buttons, strongest borders — the hard stop in a system that otherwise lives in warm grays |
| Graphite | `#303030` | Dominant text color, card and nav borders, icon strokes — softer than pure black for sustained reading while still reading as ink |
| Sterling | `#707070` | Muted helper text, secondary headings, subdued borders |
| Silversmith | `#c0c0c0` | Quiet dividers, decorative heading borders |
| Bone | `#e7e7e7` | Card surfaces, soft fills, decorative icon backgrounds — the step between canvas and card |
| Lab White | `#fffffb` | Page canvas, the slightly warm white that makes the product photograph read as clinical rather than sterile |
| Pure White | `#ffffff` | Card surfaces, button fills, highlighted text — the cleanest tone, used where maximum contrast against graphite is needed |

## Typography

### GT Pressura LC Standard — Workhorse for all utility, body, navigation, button, and small-headline copy. The slightly compressed, technical character set gives every label a clinical-instrument feel; sizes stay small (10–24px) and line-heights tight, reinforcing the system’s compact density.
- **Substitute:** Inter, IBM Plex Sans, or Söhne
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10, 13, 14, 16, 24
- **Line height:** 1.00–1.60

### Helvetica Neue LT Std — Display and section-heading face. Used at 30–56px with weight 800 and aggressive negative tracking (−0.04em to −0.05em) so headlines compress into a dense, race-bib-like slab. Weight 500 covers the few mid-size emphasis moments. The signature choice is using the heaviest weight with the tightest tracking to create visual density without raising size — authority through compression.
- **Substitute:** Helvetica Now Display Bold, Inter Tight, or Neue Haas Grotesk Display
- **Weights:** 500, 800
- **Sizes:** 14, 18, 30, 38, 53, 56
- **Line height:** 1.00–1.60
- **Letter spacing:** -0.05em at 53–56px, -0.04em at 30–38px

### GTStandard-M — GTStandard-M — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.6 | — |
| heading-sm | — | — | 18px | 1.11 | -0.72px |
| heading | — | — | 24px | 1.14 | — |
| heading-lg | — | — | 30px | 1 | -1.2px |
| display | — | — | 53px | 1 | -2.65px |
| display-xl | — | — | 56px | 1 | -2.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 100px
- **Card padding:** 20-24px
- **Element gap:** 4-8px

### Border Radius

- **cards:** 18px
- **links:** 7px
- **inputs:** 7px
- **buttons:** 7px
- **smallInteractive:** 14px

## Components

### Floating Side Promotion Tab
**Role:** Persistant vertical call-to-action

Fixed-position vertical tab pinned to the left edge, #ff7840 background, white GT Pressura 11–12px text rotated 90°. Reads as a ticket-stub or race bib clipped to the viewport — the only sustained splash of color in the system.

### Minimal Top Navigation
**Role:** Site navigation bar

White background, no border or shadow. Three entries — brand mark in parens, SHOP, WHY SAP — and a cart count (0) in the far right. GT Pressura 13–14px weight 500, uppercase or small-caps, black on white. Anchored top, no background fill, maximum air.

### Full-Bleed Race Hero
**Role:** Above-the-fold brand video/image

100vw video or still photograph of race conditions, overlaid with a massive 53–56px Helvetica Neue weight 800 headline at near-zero letter-spacing sitting above the viewport frame. The headline bleeds off the top edge so only its lower half is visible, creating a marquee-banner effect. No gradient, no overlay tint — the raw image carries all mood.

### Centered Floating Product Stage
**Role:** Product hero on white canvas

White (#fffffb) background with a single product packet (silver gel sachet) floating dead-center at slight rotation. No surface, no card, no shadow platform — the product is photographed against pure canvas and presented as a specimen. Heading at 24–30px Helvetica Neue weight 500 sits to the left in a tight 2–3 line stack.

### Filled Black CTA Button
**Role:** Primary purchase action

#000000 fill, white text, GT Pressura 13–14px weight 500–600 uppercase, 7px border-radius, 16px vertical × 24px horizontal padding. Hard rectangular silhouette. This is the conversion workhorse — 'BUY SAP 25G' style labels.

### Ghost Outline Button
**Role:** Secondary or supporting action

Transparent fill, 1px #000000 or #303030 border, 7px radius, 16px × 24px padding, same type spec as the filled variant. Used for less critical actions.

### Hero Overlay Close Button
**Role:** Dismiss the full-bleed video hero

Small circular or square 32px button in the upper-left of the hero, white or black background depending on image exposure, single 'X' glyph in 16px weight 500.

### Hero Corner Shop Pill
**Role:** Persistent shop shortcut over the video

White rounded pill in the bottom-right of the hero, black 'SHOP' label in GT Pressura 12–13px, 14px radius, light box-shadow for legibility over moving imagery.

### Hairline Section Divider
**Role:** Structural separator

1px line in #c0c0c0 or #e7e7e7 spanning the content column, used to separate sparse text blocks on white canvas sections.

### Distance Marker Badge
**Role:** Editorial KPI callout on hero imagery

Cyan-blue (#7DDFFA range) rectangular sign placed in the environment of the photograph (visible in race signage at '21 KM' mark). Functions as editorial rhythm, not a UI component, but the type treatment is Helvetica Neue weight 800 white on cyan at ~80px — a borrowed visual language from real marathon signage.

### Cart Count Indicator
**Role:** Header utility

Plain numeric '0' in GT Pressura 13px black, right-aligned in nav, no badge background or pill — treated as a label not a notification.

## Do's and Don'ts

### Do
- Use #ff7840 sparingly — reserve for the vertical side tab and isolated filled CTAs only; let it function as a single accent, not a brand coat of paint
- Set display headlines in Helvetica Neue weight 800 with −0.04em to −0.05em letter-spacing at 38–56px so the wordforms compress into a slab
- Use GT Pressura at 13–16px weight 500 for all body, button, and navigation copy — never above 24px for this face
- Give the product at least 100px of vertical breathing room above and below; the white canvas is part of the product
- Use 7px border-radius on every button, link, and input; 18px only on cards; 14px is reserved for small floating pills
- Lean on 1px hairline borders in #e7e7e7 or #c0c0c0 instead of shadows to separate content on the white canvas
- Let the hero video or photograph fill 100vw with no overlay tint, gradient, or vignette — the raw image does the work

### Don't
- Do not introduce additional accent colors — the 0% colorfulness is the system; one orange is the entire chromatic vocabulary
- Do not set body copy in Helvetica Neue — reserve that face for 30px+ display moments only
- Do not use shadows, glows, or elevated cards on the white product sections; rely on whitespace and hairline rules
- Do not exceed 7px radius on buttons or 18px on cards — the radii are tightly defined and misusing them breaks the geometric rhythm
- Do not center long-form paragraphs; left-align body copy in a 480–640px measure
- Do not use gradient fills on backgrounds, buttons, or images — the system is strictly flat
- Do not add decorative icons, illustrations, or emoji to the white product pages; the product and copy alone carry meaning

## Elevation

The system intentionally avoids drop shadows. Separation comes from hairline 1px borders in #e7e7e7 or #c0c0c0 against the warm white canvas, plus generous negative space. The only allowed shadow is a soft offset on floating UI elements (like the hero SHOP pill) that need legibility over photographic imagery.

## Surfaces

- **Lab White Canvas** (`#fffffb`) — The slightly warm page background that frames all white-canvas product sections
- **Pure White Card** (`#ffffff`) — Card surfaces and button fills where maximum contrast against the canvas is needed
- **Bone Surface** (`#e7e7e7`) — Quiet secondary fills and decorative icon backgrounds, one step above the card

## Imagery

Hero photography and video are documentary race-day imagery — desaturated winter light, urban marathon settings, a lone runner, signage, barriers. No studio photography, no lifestyle, no models. On white-canvas sections, the only imagery is a single product packet photographed against seamless white with subtle environmental shadows, rotated slightly in the frame. The visual language is split: raw athletic chaos above the fold, clinical product isolation below.

## Similar Brands

- **On Running** — Same split-personality approach — raw race-day imagery above the fold, clinical white product isolation below; single warm accent against monochrome
- **Huel** — Clinical white canvas with a single product floating center-stage and ultra-precise utility typography; the product is presented as a specimen, not a lifestyle object
- **Mast Brothers** — Dense negative tracking on display headlines, almost laboratory-clean product photography, and a single warm accent color used as punctuation rather than as coat-of-paint branding
- **Gymshark66** — Compressed neo-grotesque display type at extreme sizes with tight letter-spacing, paired with a quiet utilitarian body face for functional copy
