# Hardworkclub — Style Reference
> midnight black-box theater — a dark room where one round blue light glows above a stage, and the only thing louder than the silence is the film playing

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Hardworkclub operates as a black-box performance space: the page is a single dark room where cinematic footage plays full-bleed and the only interruptions are a luminous cobalt menu dot and a thin Maligna serif wordmark. The system is aggressively monochrome — pure black canvas, bone-white type, and one electric blue accent that exists solely on the circular nav control. Layout is left-aligned and editorial rather than centered and corporate; cards breathe inside 48px padding with no shadows and almost no visible borders, letting photography carry the visual weight. Typography splits cleanly between a grotesque workhorse (Founders Grotesk) for body and UI labels and a humanist serif (Maligna) that signals craft, warmth, and 'we are not a template' on the hero, logo, and work-card overlays.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pitch Black | `#000000` | Page canvas, hero backgrounds, card fills — the default surface for the entire site; every other element floats on this |
| Bone White | `#ffffff` | Primary text, hairline borders on dark surfaces, nav wordmark, overlay labels on imagery |
| Charcoal Whisper | `#313130` | Near-invisible secondary borders and dividers — just enough to separate layers without breaking the black-box illusion |
| Electric Cobalt | `#1200e3` | The circular nav toggle button and the only chromatic surface in the UI — a single stage light against an otherwise dark room |

## Typography

### Maligna — Display serif used for the wordmark, hero statement, and work-card overlay titles. A humanist serif with warmth and character in a system otherwise built on a cold grotesque — it signals craft, editorial confidence, and refusal of the default SaaS look. The -0.03em tracking tightens optical spacing at display sizes.
- **Substitute:** Cormorant Garamond, Tiempos Headline, or Recoleta
- **Weights:** 300, 500
- **Sizes:** 31px, 61px
- **Line height:** 1.1, 1.2
- **Letter spacing:** -0.03em

### Founders Grotesk — The workhorse sans covering body copy, UI labels, the 'HWC' monogram, eyebrow text like 'FEATURED WORK', and all button text. Weight 300 carries body, 500 holds subheadings, 700 is reserved for small-caps eyebrows and emphasis. The tight -0.03em tracking across all sizes gives text a slightly condensed, editorial rhythm.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 300, 500, 700
- **Sizes:** 16px, 18px, 22px, 31px
- **Line height:** 0.78, 1.0, 1.1, 1.2, 1.21, 1.5, 1.67
- **Letter spacing:** -0.03em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.5 | -0.48px |
| body | — | — | 18px | 1.5 | -0.54px |
| subheading | — | — | 22px | 1.2 | -0.66px |
| heading-sm | — | — | 31px | 1.2 | -0.93px |
| display | — | — | 61px | 1.1 | -1.83px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 96-160px
- **Card padding:** 48px
- **Element gap:** 8px

### Border Radius

- **nav:** 9999px
- **cards:** 8px
- **buttons:** 1440px
- **archedImage:** 24px

## Components

### Circular Nav Toggle
**Role:** Primary site navigation trigger

A fully round button in Electric Cobalt (#1200e3) anchored to the top-right corner. No text, no border, no shadow — a single saturated disc that is the only chromatic element in the entire UI. Radius 1440px (effectively infinite). Acts as the one consistent interactive target across every page.

### Wordmark Lockup
**Role:** Brand identity mark in the header

Centered 'HardWorkClub' in Maligna weight 300, white on black, at approximately 22-31px. No icon, no tagline, no container — the text floats directly on the black canvas. On interior pages, collapses to the 'HWC' monogram in Founders Grotesk weight 500.

### Full-Bleed Hero Stage
**Role:** Opening cinematic canvas

Edge-to-edge video or still image filling the full viewport against #000000. No overlay copy, no CTA, no gradient — the imagery IS the message. Visual content is dark and underexposed so the white wordmark and blue nav dot remain legible. 96px top padding separates the hero from the header.

### Intro Statement Block
**Role:** Brand manifesto on landing

Left-aligned three-line statement in Founders Grotesk weight 300 at 18-22px, white on black. No heading, no decoration, no background — just type sitting in the void. Generous 48px padding-bottom separates it from the next section.

### Eyebrow Section Label
**Role:** Section identifier above content groups

Small uppercase wordmark text ('FEATURED WORK') in Founders Grotesk weight 500, white, left-aligned. No divider, no dot, no line — just the label and then 48px of breathing room before the content begins.

### Arch-Top Work Card
**Role:** Featured project with architectural framing

Image container with a rounded arch at the top (achieved via a large 24px+ top radius and 8px bottom radius, or a CSS clip-path). Full-width image fill, no visible border, no shadow. Maligna weight 300 overlay text in white sits at the bottom-left of the image, approximately 31px.

### Rectangular Work Card
**Role:** Standard featured project tile

Rectangular image with 8px corner radius, no border, no shadow. Overlay title in Maligna weight 300 white at 31px, bottom-left aligned. Functions as a quiet pair to the arch-top card — same type, same padding logic, different silhouette.

### Pill Button
**Role:** Inline link or action

Text-only pill using 1440px border-radius. White text, no fill, optional white border. Internal padding 13px horizontal, 5-7px vertical. Used sparingly for navigational links and secondary actions.

## Do's and Don'ts

### Do
- Use Pitch Black (#000000) as the default canvas for every page and surface — the black room is non-negotiable
- Reserve Electric Cobalt (#1200e3) for the circular nav control and nothing else — one blue dot per screen
- Set type in Maligna for the wordmark, hero statement, and work-card overlays; use Founders Grotesk for everything else
- Apply -0.03em letter-spacing to all text regardless of size — the tight tracking is a system signature
- Pad cards and content blocks with 48px on all sides to let the black space breathe
- Use the 1440px pill radius for buttons and links, 8px for rectangular cards, and a larger arch radius for the specialty work card
- Left-align all body and intro text — centered alignment would break the editorial theater atmosphere

### Don't
- Do not introduce drop shadows, glow effects, or any z-axis elevation — the system is intentionally flat
- Do not add a second accent color or a secondary CTA color — Electric Cobalt is the only chromatic surface in the UI
- Do not use white or light-gray card fills against the black canvas — cards stay transparent over images or black-filled
- Do not center-align body copy, statements, or labels — the entire layout grammar is left-aligned editorial
- Do not apply system fonts, Inter, or generic grotesques as the display serif — Maligna (or its substitute) is what makes the wordmark and hero feel crafted rather than templated
- Do not use borders thicker than 1px on dark surfaces — hairlines only, or the black-box illusion breaks
- Do not stack multiple work cards in rows of 3 or more — the featured work is shown as deliberate 2-up pairs

## Elevation

No shadows, no glows, no z-axis. Depth is implied by content layering (image over text, button over canvas) and by the single accent color, not by drop-shadow elevation. Cards sit flush against the black ground; the absence of elevation is itself a signature — the room is flat and dark, the only light is from the imagery and the cobalt dot.

## Surfaces

- **Stage Floor** (`#000000`) — Page background, hero canvas, all card surfaces — the unbroken black of the theater
- **Accent Bloom** (`#1200e3`) — The circular nav control — the only raised color surface in the entire interface

## Imagery

Cinema-grade full-bleed photography and video: dark, underexposed, stage-lit subjects (drummer under string lights, intimate human close-ups, product still lifes). Treatment is editorial and observational — not polished brand photography but raw, atmospheric frames with deep shadows and warm practical light. Images are contained inside arched or rectangular frames with 8-24px corner radii; no full-bleed decorative graphics. The only non-photographic element is the Electric Cobalt nav dot, which reads as a single stage light in a dark room.

## Layout

Full-bleed cinematic hero at the top edge, then left-aligned editorial text blocks separated by 48-96px vertical rhythm on a pure black canvas. Content is asymmetric and grid-loose rather than centered or symmetrically stacked. The 'Featured Work' section uses a 2-column grid pairing an arch-top card with a rectangular card — matching silhouettes is deliberately avoided to create visual tension. Navigation is minimal: a centered wordmark and one circular button, nothing else. No sidebar, no mega-menu, no footer chrome visible in the fold. Max content width approximately 1440px, but the hero and imagery always break full-bleed regardless.

## Similar Brands

- **Anomaly** — Creative agency that rejects the agency template — pure black canvas, single accent color, editorial left-aligned type, photography-first layouts
- **Buck** — Design studio with full-bleed dark cinematic work pages, Maligna-adjacent serif display, minimal chrome, and generous black space between projects
- **Mubi** — Same black-box theater atmosphere — dark canvas, single vivid accent on the nav, serif wordmark, and cinema-grade full-bleed imagery
- **Acne Studios** — Fashion brand that treats the website as a dark editorial spread — oversized serif type floating on black, no UI chrome, imagery as the only decoration
- **SSENSE** — Dark-mode editorial commerce with serif display headlines over full-bleed photography, hairline borders, and minimal text labels
