# Atelier Deux-Cé — Style Reference
> Sunlit editorial gallery

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Atelier Deux-Cé presents itself as a sunlit editorial gallery — a Paris-based creative agency whose site reads like a curated magazine spread rather than a software product. The system is photography-first: full-bleed images dominate every screen, with type acting as quiet captions and labels rather than interface chrome. A palette of warm, sun-bleached earth tones (cream, linen, sage, taupe, olive stone) replaces the typical white/gray SaaS canvas, giving every page the warmth of a Provençal villa. Black type sits at near-maximum contrast against these warm surfaces, and a single saturated green is reserved for the footer like a garden border at the end of a path. Components are deliberately few and weightless — no shadows, no gradients, no borders thicker than hairlines, no rounded corners fighting the editorial print sensibility.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Body text, headings, nav links, hairline borders, and link underlines — the single type color across the entire system |
| Canvas White | `#ffffff` | Page background, card surfaces, reverse text on dark photographic regions |
| Warm Linen | `#eee5da` | Soft section background, the first step off pure white — gives a page the warmth of unbleached paper |
| Pale Sage | `#d8ddc6` | Tinted section panels, the dominant non-white canvas tone |
| Driftwood | `#d8d0c5` | Deeper warm section background, used when a panel needs to recede from Pale Sage |
| Olive Stone | `#afb371` | Saturated warm section background — the deepest neutral step before any chromatic color enters |
| Weathered Taupe | `#9c978a` | Muted section background, used sparingly as a quieter alternative to Olive Stone |
| Soft Pebble | `#aaaaa4` | Light warm-gray section background, the coolest of the earth-tone neutrals |
| Garden Green | `#259558` | Footer background only — the single chromatic accent in the system, used as a deliberate closing beat rather than a brand color spread across the UI |

## Typography

### Helvetica — Primary UI and editorial type — body copy, navigation, links, project captions, category filters, and all functional text. Weight 400 for body and metadata, weight 600 reserved for the wordmark and the few moments that need emphasis. The system stack ensures identical rendering across platforms without depending on a webfont.
- **Substitute:** Helvetica Neue, Arial, sans-serif
- **Weights:** 400, 600
- **Sizes:** 16, 17, 20, 24
- **Line height:** 1.20
- **Letter spacing:** 0.02em on body and UI text (0.32–0.48px), 0.04em on navigation and labels (0.64–0.96px) — the slightly positive tracking gives the type a refined, typeset-in-metal quality rare in modern web UI

### minion-3 — Editorial accent serif — used for body paragraphs and select headings where a literary, book-page quality is desired. The contrast between this transitional serif and the geometric Helvetica mirrors the brand's positioning: strategy + craft, editorial + commercial.
- **Substitute:** Cormorant Garamond, EB Garamond, serif
- **Weights:** 400
- **Sizes:** 16, 17, 24
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.2 | 0.64px |
| subheading | — | — | 20px | 1.2 | 0.4px |
| heading | — | — | 24px | 1.2 | 0.48px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 48px
- **Card padding:** 0px
- **Element gap:** 24px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Split-Screen Hero
**Role:** Full-bleed opening composition that pairs two photographs meeting at a hard vertical center seam

Two edge-to-edge images, no gap, no border, no radius. Each half is a full-bleed photograph treated as equal weight. Type and a small white mark float over one or both halves. Background of the photographic regions is implicit; surrounding canvas uses Canvas White.

### Hero Caption Label
**Role:** Small editorial caption floating over a hero image — project credit, model, location

White text, Helvetica 16px weight 400, letter-spacing 0.04em, line-height 1.2. Multi-line stack with project name in weight 600, supporting lines in weight 400. No background plate — the text sits directly on the photograph.

### Wordmark + Hamburger Navigation
**Role:** Minimal global navigation — brand wordmark on the left, single hamburger icon on the right

Wordmark is Helvetica weight 600, 20px, letter-spacing 0.04em, color Ink Black. Hamburger is a thin black stroke icon. The entire nav is hairline-thin and floats over the page without a background fill or border.

### Editorial Body Text Block
**Role:** Long-form descriptive paragraph used for the 'What we do' and similar sections

minion-3 or Helvetica at 17px, line-height 1.2, color Ink Black. Set in a narrow reading column (roughly 480–600px wide) with generous surrounding whitespace. No drop cap, no pull quote, no decorative rule — the text is the design.

### Category Filter List
**Role:** Inline multi-row list of project categories with item counts, acting as a navigation index

Helvetica 16px weight 400, letter-spacing 0.04em, color Ink Black. Items flow inline with normal word spacing, counts in parentheses right after each label. No chips, no pills, no background fills — the list reads as a printed table of contents.

### Project Card
**Role:** Image-forward project entry in the 2-column portfolio grid

Image fills the card edge-to-edge with 0px radius. No border, no shadow, no padding around the image. Caption sits below the image: project name in Helvetica weight 600 at 16px, discipline label and date in Helvetica weight 400 at 16px, both color Ink Black, letter-spacing 0.04em. Column gap of 48px between cards.

### Read More Link
**Role:** Text link ending an editorial paragraph

Helvetica 16px weight 600, color Ink Black, letter-spacing 0.04em, rendered in all caps. No underline at rest; a 1px black underline appears on hover. No background, no border, no padding.

### Footer Banner
**Role:** Full-bleed closing band of the page

Background color Garden Green (#259558), full viewport width, no radius, no border. Contains navigation links and credits in reverse type (Canvas White) at the same Helvetica sizes and letter-spacing used throughout.

### Inline Section Label
**Role:** Small uppercase tag identifying a section ('WHAT WE DO')

Helvetica 16px weight 600, all caps, color Ink Black, letter-spacing 0.04em. Sits at the start of a section, left-aligned, with 24px gap to the body text below.

## Do's and Don'ts

### Do
- Let full-bleed photography drive every primary screen — type and chrome are captions, not the subject
- Stack sections using the warm neutral scale (Canvas White → Warm Linen → Pale Sage → Driftwood → Olive Stone) to create rhythm without shadows
- Use the two type families in deliberate contrast: Helvetica for functional UI and metadata, minion-3 for editorial body paragraphs and book-page moments
- Apply letter-spacing 0.02em to body and 0.04em to navigation, labels, and uppercase tags across both type families — this slightly positive tracking is the system's quiet signature
- Keep all component radii at 0px — the design is print-flat, not card-lifted
- Reserve Garden Green (#259558) exclusively for the footer — do not introduce it as a button, link, or accent elsewhere
- Set the type scale at 16 / 17 / 20 / 24px only — a compressed scale is a discipline, not a limitation

### Don't
- Do not add box-shadows, drop shadows, glows, or gradient overlays — hierarchy comes from color and image, never from elevation
- Do not introduce saturated colors beyond the single footer green — the palette is warm earth tones, period
- Do not round corners on cards, buttons, images, or tags — 0px radius is non-negotiable
- Do not use filled buttons, ghost buttons, or pill buttons — the system has no button component, only text links and the footer band
- Do not use icons beyond a single minimal hamburger — the site is image-led, not icon-led
- Do not set type in negative letter-spacing — the positive 0.02–0.04em tracking is a defining choice and must not be tightened
- Do not add decorative borders thicker than 1px hairlines, and never use border colors outside the neutral scale

## Elevation

No box-shadows, no glows, no drop filters. The system creates hierarchy exclusively through full-bleed photography and warm color shifts between adjacent sections. Components are weightless — they sit on the page like prints pinned to a wall, not cards lifted off a surface. Any visible separation comes from a hairline black rule or a tonal step in the neutral scale.

## Surfaces

- **Canvas White** (`#ffffff`) — Base page background and any reverse-text surface
- **Warm Linen** (`#eee5da`) — First tinted step — section bands, project card surfaces
- **Pale Sage** (`#d8ddc6`) — Dominant warm panel tone, used for content sections and category list backgrounds
- **Driftwood** (`#d8d0c5`) — Deeper warm panel, used to create gentle tonal rhythm between Sage sections
- **Olive Stone** (`#afb371`) — Saturated warm panel — the deepest neutral surface before chromatic color

## Imagery

Editorial photography is the dominant content type and the primary visual subject of every page. Images are full-bleed, edge-to-edge, rectangular with no radius, and often paired in split-screen compositions where two photographs meet at a hard vertical seam. The photography style is warm, naturally lit, and lifestyle-adjacent — fashion models, hotel exteriors, packaging close-ups, Mediterranean landscapes, and product-in-context shots (champagne in rapeseed fields, chocolate on linen). No illustration, no 3D renders, no abstract graphics, no product UI screenshots. The only icon present on the site is a single minimal white mark in the hero. Photography is the hero; the interface is the frame around it.

## Layout

The page is a max-width-agnostic, full-bleed layout that reads top-to-bottom like a printed magazine. The hero is a split-screen: two full-viewport-height images meeting at a hard vertical center seam, with floating type and a small white mark. Below the hero, content sections alternate between narrow reading columns (roughly 480–600px) of editorial body text and full-bleed 2-column image grids for project showcases. Section rhythm is created by shifting the warm neutral background tone between sections — there is no light/dark alternation, only warm-pale to warm-saturated tonal shifts. A flat inline list of categories with parenthetical counts acts as a table of contents, sitting on a Pale Sage band. Navigation is minimal: wordmark left, hamburger right, no sticky bar, no sidebar, no mega-menu. The footer is a single full-bleed Garden Green band.

## Similar Brands

- **Cereal Magazine** — Same editorial-magazine reading flow, warm naturally lit photography as primary content, compressed type scale, and earth-toned neutral palette
- **Aesop** — Warm cream-and-taupe surface stack, photography-led product presentation, restrained Helvetica type, and absence of shadows or decorative chrome
- **Hermès corporate site** — Luxury agency feel with warm earth-tone palette, photography as the hero, and minimal type-driven UI
- **Acne Studios** — Editorial fashion-agency sensibility, compressed sans-serif type scale, and print-flat layout with 0px radii throughout
- **Maison Martin Margiela** — Editorial restraint, type used as quiet captioning over imagery, and a single saturated accent reserved for a closing beat
