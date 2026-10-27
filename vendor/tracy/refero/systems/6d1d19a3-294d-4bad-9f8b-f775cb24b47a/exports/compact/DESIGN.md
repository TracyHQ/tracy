# herding.app — Style Reference
> Warm charcoal desk with a single neon spray — monochrome editorial dark UI broken by one vivid teal-lime wash.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Herding operates as a dim, warm-toned control room: a near-black canvas of olive-charcoal surfaces, one tight utilitarian typeface at every size, and almost no chromatic noise. The interface stays monochrome and editorial — close-set type, generous gutters, soft 16px corners, and a persistent ink-into-paper inset shadow that makes cards feel pressed into the page rather than floating. The single color event is a saturated teal-to-lime gradient used sparingly as a feature banner or highlight wash; everywhere else, hierarchy comes from value contrast between warm grays and a slightly cream off-white. Components are flat, rounded, and weightless — buttons are thin-stroked outlines, tags sit as small monospaced chips, and the only 'accent' punctuation is the gradient itself.

## Colors

| Name | Value | Role |
|------|-------|------|
| Off-White Ink | `#fffffe` | Primary text, icon strokes, heading color — slightly cream warm-white reads softer than pure #fff against olive-charcoal surfaces |
| Page Void | `#1c1c1a` | Deepest page background, behind everything; the recessed layer |
| Graphite Card | `#232320` | Primary card and surface — most panels, modals, and elevated containers |
| Slate Matte | `#2e2e2b` | Canvas-level surface, outer page background, content area baseline |
| Ash Step | `#35352f` | Subtle surface lift, nested card backgrounds, hover wash |
| Stone Lift | `#3e3e38` | Higher elevation tier, active rows, secondary surface |
| Pewter Button | `#45453e` | Button and chip backgrounds, pressed states |
| Bistre Border | `#161615` | Dark border stroke, hairline separators, outline button border on hover |
| Fog Text | `#7f7e77` | Secondary muted text, captions, inactive controls; Reserved for button/dark accents |
| Sand Label | `#a3a29c` | Mid-level text, metadata, helper copy, list labels — warm gray that holds presence without competing with primary text |
| Spray Wash | `linear-gradient(90deg, #2ad4d8 0%, #3fe0a6 50%, #c8f57a 100%)` | Decorative highlight — the only chromatic accent in the system, used exclusively inside the teal-to-lime gradient banner |

## Typography

### Styrene — Single typeface serves everything from 11px captions to 45px display. Geometric humanist sans with tight apertures; weight 400 only — no bold. Tight -0.05em tracking is applied at every size, making headings feel condensed and utilitarian rather than elegant
- **Substitute:** Inter (400), General Sans, Söhne
- **Weights:** 400
- **Sizes:** 11px, 14px, 15px, 20px, 27px, 45px
- **Line height:** 1.12 (display), 1.20 (subhead), 1.56 (body)
- **Letter spacing:** -0.05em at all sizes (≈ -0.55px at 11px, -0.75px at 15px, -1.0px at 20px, -1.35px at 27px, -2.25px at 45px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | -0.55px |
| body-sm | — | — | 14px | 1.56 | -0.7px |
| subheading | — | — | 20px | 1.2 | -1px |
| heading | — | — | 27px | 1.2 | -1.35px |
| display | — | — | 45px | 1.12 | -2.25px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 32px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 9999px
- **cards:** 16px
- **small:** 12px
- **images:** 7.5px
- **buttons:** 16px

## Components

### Outlined CTA Button
**Role:** Primary and secondary actions (Sign Up, Log In, Accept Folders)

Transparent fill, 1px border in #a3a29c, 16px radius, text in #fffffe at 14px, letter-spacing -0.7px. Horizontal padding ~24px, vertical ~12px. No fill ever — the button is purely stroked. On hover, border brightens to #fffffe.

### Theme Switcher Toggle
**Role:** Light/dark mode control in header

Pill shape (9999px radius), 1px #a3a29c border, tiny circular knob inside at #a3a29c, label 'THEME SWITCHER' in 11px uppercase tracking -0.55px to the right. Sits as a compact 28px-high element.

### Gradient Banner Card
**Role:** Featured content panel with the only color in the system

Full-bleed teal-to-lime gradient (linear-gradient 90deg from #2ad4d8 through #3fe0a6 to #c8f57a) filling the top of a 16px-radius card. Acts as a stage for product mockups or hero imagery. Used at most once per page to preserve the system rule that color is rare.

### Product Mockup Card
**Role:** Screenshot container showing the app interface

#232320 surface, 16px radius, inset shadow stack creates a recessed well. Two-pane layout inside: narrow left sidebar rail (#35352f) with category list in #a3a29c, wider right pane (#232320) with folder items and thumbnail strips. 7.5px radius on inner thumbnails.

### Top Hero Grid
**Role:** Three-column intro band (logo+headline, description, CTA cluster)

Three equal cards, each 16px radius, #232320 fill, ~32px internal padding, 16-24px column gap. Left card holds a small icon mark and 27px display headline. Middle holds 15px body description. Right holds stacked outlined CTA buttons and helper text in #a3a29c.

### Numbered Instruction List
**Role:** Step-by-step explainer block

Left-aligned vertical list inside a 16px-radius card. Each row: monospace-feeling digit prefix (15px, #fffffe) + instruction text (15px, #fffffe, line-height 1.56). 15px vertical row gap, 32px card padding.

### Category Card
**Role:** Folder/collection item with grouped sub-items

#232320 surface, 16px radius. Header in 14px uppercase tracking -0.7px (#a3a29c) with a small dot bullet. Sub-items listed vertically at 14px #fffffe with 8px row gap. Optional thumbnail strip along the bottom with 7.5px radius on each thumb.

### Icon Feature Card
**Role:** Small feature highlight tile (Order, Through, Reorder)

#2e2e2b surface, 12-16px radius, 32px padding. Centered geometric icon in #a3a29c (stroke-based, no fill). Label below in 14px #fffffe, with two small social/link icon chips at bottom right.

### Content Type Chip Row
**Role:** Inline tag list for content formats (images, videos, text, code)

Pill-shaped (9999px) chips, transparent fill, 1px #a3a29c border, 11px uppercase text in #fffffe, ~8px horizontal / 4px vertical padding. The word 'code' is bolded (visually emphasized via color #fffffe) inside the sentence to mark a type.

### Image Thumbnail
**Role:** Bookmark preview tile

7.5px radius, fills its container, object-fit cover. No overlay, no caption inside. Used in rows or grids to preview saved content.

### Inset Well Card
**Role:** Base elevated container that 'sinks' into the canvas

#232320 fill, 16px radius, no drop shadow. Instead, the multi-layer inset shadow (rgba(8,9,1,0.08) at 56px blur down to rgba(8,9,1,0.047) 1px ring) creates an inner vignette and a 1px inner border, making the card feel like a depression in the page.

## Do's and Don'ts

### Do
- Use only the warm-charcoal surface stack — Page Void #1c1c1a → Slate Matte #2e2e2b → Graphite Card #232320 → Ash Step #35352f → Stone Lift #3e3e38 — for all layering
- Apply the teal-to-lime gradient at most once per screen; it is the only chromatic event and must stay rare
- Set letter-spacing to -0.05em on every text element regardless of size, including 11px captions
- Use the inset shadow stack on all card and panel surfaces instead of any drop shadow
- Use 16px radius on cards and buttons, 7.5px on images and icons, 9999px on tags and toggles
- Use #fffffe for primary text and #a3a29c for secondary labels — never introduce a third text gray
- Keep all headings and body in weight 400; the system has no bold weight

### Don't
- Do not introduce a filled primary button — actions are always outlined in #a3a29c or #fffffe
- Do not use the gradient on text, icons, or strokes — reserve it for a large feature banner only
- Do not apply drop shadows to any element; the system uses inset shadows exclusively
- Do not pair Styrene with a second typeface; the single-font system is the signature
- Do not use bright white #ffffff — always use the slightly cream #fffffe for warmth against the olive-charcoal canvas
- Do not exceed 45px for display sizes; the scale tops out and curves back down
- Do not place multiple gradient banners on a single page; color saturation must remain below 2% of the surface area

## Elevation

- **Card / Panel:** `inset rgba(8,9,1,0.08) 0px 56px 72px 0px, inset rgba(8,9,1,0.024) 0px 24px 29px 0px, inset rgba(8,9,1,0.02) 0px 11px 14px 0px, inset rgba(8,9,1,0.01) 0px 6px 7px 0px, inset rgba(8,9,1,0.008) 0px 2.5px 2px 0px, inset rgba(8,9,1,0.047) 0px 0px 0px 1px`

## Surfaces

- **Page Void** (`#1c1c1a`) — Deepest recess, behind the outer canvas
- **Slate Matte** (`#2e2e2b`) — Outer page background, baseline canvas
- **Graphite Card** (`#232320`) — Primary card and panel surface
- **Ash Step** (`#35352f`) — Nested surface, sidebar rails, sub-cards
- **Stone Lift** (`#3e3e38`) — Top-level elevation, active items, toggles

## Imagery

No photography. Imagery consists of product mockups rendered as dark UI screenshots inside recessed cards, small geometric stroke icons in #a3a29c, and the teal-to-lime gradient used as a single decorative wash. The gradient is the only full-bleed color; everything else stays inside the warm-charcoal palette. Icons are line-based, 1px-1.5px stroke, monoline, geometric. Thumbnails are tight crops of saved content (images, video stills, page captures) with no lifestyle context — the saved object is the hero, presented at 7.5px radius.

## Layout

Max-width ~1200px centered. The top of the page is a 3-column equal grid: logo+headline left, description middle, CTA cluster right — each cell is its own 16px-radius card. Below that, a full-width gradient banner card holds a 2-pane product mockup (narrow sidebar + wider content area). Sections are stacked vertically with 48px gaps. The lower half alternates between single full-width content cards and 2-column grids. Navigation is minimal — no sticky header, no sidebar; controls live inside the right column of the top grid (Sign Up, Log In, Theme Switcher). The grid is rigid and columnar, not fluid or asymmetric.

## Similar Brands

- **Linear** — Same dark-mode-only canvas with near-black surfaces, one tight geometric sans, and color restricted to a single vivid accent
- **Vercel** — Identical approach of monochrome dark UI with one gradient hero, strict typographic hierarchy, and hairline-outlined buttons
- **Raycast** — Shares the recessed-card aesthetic with inset shadows, warm-charcoal palette, and minimal use of color outside featured moments
- **Things 3** — Same editorial restraint: single typeface, generous spacing, rounded surfaces, and an almost puritanical color discipline
