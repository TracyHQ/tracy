# AATHER — Style Reference
> Open palm, single flame — quiet luxury held in stillness.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

AATHER operates as an editorial candle studio rendered in near-total monochrome: white canvas, black ink, hairline rules, and photography doing all the emotional heavy lifting. The interface itself is austere to the point of being almost invisible — every typographic decision is calibrated toward whisper (weights 100–200) and air (tracking 0.036–0.056em), so the UI reads like a fashion magazine layout rather than a storefront. Warmth is never injected into the UI palette; instead, a single sand-toned surface (#dec39d) and full-bleed editorial photography carry the brand's tactile, hand-held mood. Components are reduced to their most elemental forms: text links with thin underlines stand in for buttons, 2px corners refuse decoration, and the centered wordmark navigation borrows directly from print editorial conventions.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. |
| Paper | `#ffffff` | Page background, card surfaces, reversed text on dark — the default canvas. Never tinted, never warmed; warmth arrives only through photography |
| Mist | `#f7f7f7` | Alternate canvas band, subtle section wash — used to separate content blocks without introducing a visible border line |
| Ash | `#e8e8e8` | Footer and secondary dividers — the lightest perceptible rule, reserved for structural seams that must recede |
| Graphite | `#808080` | Muted secondary text, low-emphasis borders, tertiary metadata. Pairs with body and link borders at lower visual weight than Ink |
| Warm Sand | `#dec39d` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |

## Typography

### Gestura Text Extra Light — Gestura Text Extra Light — detected in extracted data but not described by AI
- **Weights:** 100, 200
- **Sizes:** 14px, 16px, 20px
- **Line height:** 1.22, 1.35, 1.38

### Gestura Text — Primary editorial face for body copy, links, nav, cards, and the 35px display overlay heading. The use of Extra Light (100) and Thin (200) weights throughout is a signature anti-convention — most luxury e-commerce uses 300–400 minimum. Here the type is intentionally thin enough to feel like it could disappear, forcing the photography to lead.
- **Substitute:** Cormorant Garamond Light, Spectral Light, or a light humanist serif like Lora Light
- **Weights:** 100, 200
- **Sizes:** 35px
- **Line height:** 1.20–1.38
- **Letter spacing:** normal

### Untitled Sans — Workhorse sans for buttons, inputs, list items, and supporting UI chrome. The generous tracking (up to 0.056em) transforms a clean geometric sans into something that reads as typeset and intentional — labels feel engraved rather than typed. The 0.78 line-height at 9px is display micro-copy collapsed to its tightest possible rhythm.
- **Substitute:** Inter at weight 200, Söhne Light, or General Sans Light
- **Weights:** 100, 200, 400
- **Sizes:** 9px, 11px, 12px, 13px, 14px, 16px, 18px, 20px, 24px
- **Line height:** 0.78–1.39
- **Letter spacing:** 0.036em–0.056em

### Gestura Text Light — Gestura Text Light — detected in extracted data but not described by AI
- **Weights:** 200
- **Sizes:** 16px
- **Line height:** 1.38

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.22 | 0.36px |
| body-lg | — | — | 16px | 1.38 | 0px |
| subheading | — | — | 20px | 1.35 | 0px |
| heading | — | — | 24px | 1.2 | 0px |
| display | — | — | 35px | 1.2 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 30-35px
- **Card padding:** 20-25px
- **Element gap:** 10-15px

### Border Radius

- **all:** 2px

## Components

### Announcement Bar
**Role:** Top-of-page promotional strip

Full-bleed white bar, centered text in Untitled Sans at 9–11px, weight 200, tracking 0.042em. Content is a single line of free-shipping or campaign copy. No background tint, no border — defined only by its position above the header.

### Centered Logo Header
**Role:** Primary site navigation

Three-column flex: left cluster ('Menu' + 'Shop' with small dropdown carets), centered wordmark ('AATHER' in Untitled Sans, weight 200, ~16px, tracking 0.056em), right cluster (cart icon). No background fill, no shadow, no border. Vertical padding ~15px. The centered wordmark is a deliberate editorial cue — this header reads like a magazine masthead.

### Full-Bleed Hero Image
**Role:** Atmospheric brand introduction

Edge-to-edge photograph occupying the full viewport width. No overlay gradient, no vignette — the image carries the mood. A single line of display text is positioned bottom-center in white, weight 200, ~35px, with a paired underlined text link beside it.

### Hero Overlay Text
**Role:** Editorial caption on hero photography

Gestura Text Thin, 35px, weight 200, white (#ffffff) with no text shadow. Positioned in the lower third of the hero. The complete absence of shadow or scrim is a deliberate choice — the photography must be light enough to hold white type natively.

### Underlined Text Link (replaces buttons)
**Role:** Primary call-to-action

Untitled Sans, 14–16px, weight 200, tracking 0.036em. A 1px black bottom border acts as the underline. No background fill, no border-radius, no padding beyond the text. On hover the underline persists. This component is the system's de facto button — the brand never uses a filled rectangular button.

### Cookie Consent Bar
**Role:** Sticky bottom regulatory notice

White bar fixed to viewport bottom with a 1px top border in #e8e8e8. Left-aligned copy in Untitled Sans 11px, right-aligned 'OK' affordance. Minimal, functional, no styling beyond the hairline separator.

### Nav Dropdown Indicator
**Role:** Menu state affordance

A small downward triangle (▼ or ▾) rendered in Ink (#000000) next to 'Menu' and 'Shop' labels. Size ~6px, no border or background. Pure typographic punctuation.

### Cart Icon
**Role:** E-commerce entry point

Minimal line-icon shopping bag in Ink (#000000), ~16px, stroke weight 1px. Sits flush right in the header with no label or badge.

## Do's and Don'ts

### Do
- Use weight 100 or 200 for all body and heading text — never go above 400 outside of regulatory copy.
- Apply tracking of 0.036–0.056em to all Untitled Sans instances; let the letter-spacing do the luxury work.
- Reach for a 1px black underline before you reach for a button — the underlined text link is the system's primary action.
- Use 2px border-radius on every rounded element; do not introduce larger radii.
- Let photography supply all warmth and color; the UI palette stays pure monochrome.
- Center the wordmark in the header and treat navigation as a three-column editorial spread.
- Separate sections with hairline Ink (#000000) rules at 1px, not background tint shifts.

### Don't
- Do not introduce filled rectangular buttons with backgrounds — the underlined text link is the only CTA pattern.
- Do not use bold or semibold weights (500–800) anywhere in the system.
- Do not add drop shadows, glows, or elevation effects — surfaces stay flat.
- Do not use border-radius above 2px; the sharp corners are part of the brand's editorial restraint.
- Do not apply a chromatic accent color to UI elements — #dec39d lives only in photography.
- Do not left-align the wordmark in the header; centering is non-negotiable.
- Do not add gradients, textures, or noise to backgrounds; the canvas must read as flat paper.

## Elevation

The system uses zero shadow-based elevation. Hierarchy is achieved through typography weight contrast, whitespace, and hairline 1px rules in Ink or Ash. Components sit on the same plane as the canvas — the design reads as printed editorial rather than digital interface.

## Surfaces

- **Paper** (`#ffffff`) — Default page canvas and product backgrounds — the base on which everything else floats.
- **Mist** (`#f7f7f7`) — Alternate section wash for content blocks that need separation without a visible border.
- **Warm Sand** (`#dec39d`) — Editorial accent surface — appears within hero and product photography, never as a UI fill.

## Imagery

Imagery is the brand's primary expressive medium. Photography is editorial and intimate: tight crops of hands holding candles, fabric in warm earth tones, and single objects isolated on warm taupe or cream backgrounds. Treatments are full-bleed, unmasked, with no rounded corners on images. The color palette of the photography is restricted to warm sand (#dec39d), cream, terracotta, and muted blues — never saturated. Lifestyle context is stripped away; the object and the hand are always the subject. No illustration, no icons beyond a minimal cart glyph, no decorative graphics.

## Layout

The page is max-width contained at ~1200px but hero images break full-bleed to viewport edges. The hero is a full-viewport-height photograph with overlay text positioned in the lower third. Below the fold, sections stack vertically with 30–35px gaps, separated by hairline rules or subtle Mist (#f7f7f7) washes rather than card containers. Navigation is a centered three-column masthead. Content is predominantly single-column and text-driven, with photography interrupting at full-bleed intervals. The rhythm is slow and editorial — sparse text blocks, generous breathing room, and image-led section breaks.

## Similar Brands

- **Diptyque** — Same editorial monochrome UI with all warmth and color carried by product photography, centered wordmark navigation, and hairline-rule section dividers.
- **Byredo** — Identical restraint in UI chrome — nearly all-black-and-white interface with ultra-light sans typography, letting product imagery and fragrance photography provide the chromatic personality.
- **Le Labo** — Same minimal-monochrome aesthetic with thin sans-serif type, underlined text links in place of filled buttons, and a printed-editorial sensibility over a digital-commerce one.
- **Boy Smells** — Shared ultra-light typographic weights and generous tracking, with a warm-taupe-and-cream photography palette that never bleeds into the UI color system.
- **Aesop** — Same quiet-luxury restraint: monochrome chrome, thin sans type, text-link CTAs, and 2px or zero border-radius — the store reads like a printed monograph.
