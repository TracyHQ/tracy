# Adaline — Style Reference
> botanist's specimen journal beside a developer's terminal — warm linen pages, sage ink annotations, and tracked mono tags.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Adaline operates as a naturalist's field journal beside a developer terminal: warm linen canvas, sage-green annotations, and a single literary serif headline anchoring the top of the page. Color is used sparingly and organically — dark forest ink carries body text and CTA fills, while muted sage, teal, and crimson appear as specimen-card backgrounds and category labels rather than as flat accent washes. The type system pairs a neo-grotesque workhorse (Akkurat) with a whisper-light editorial serif (Newsreader) and a tracked monospace (Fragment Mono) that acts as field-note tagging across badges, buttons, and inline labels. Surfaces are flat with hairline borders instead of shadows; photography appears as full-bleed landscape plates between content sections, turning the page into a sequence of specimen sheets rather than dashboard panels.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#0a1d08` | Gray text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Olive Press | `#2b390a` | Headings at large sizes, high-contrast body text, hover states on filled buttons |
| Sage Leaf | `#4a6d47` | Decorative icon accent, badge fills, subtle wash backgrounds on spec cards |
| Deep Teal | `#2b6b5e` | Secondary category fills, alt-card backgrounds, tonal pair with the dominant greens |
| Crimson Specimen | `#991e4b` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Amber Pin | `#80581c` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Linen | `#f8f9f5` | Page canvas, default surface — warm off-white with a faint green cast |
| Bone | `#eff2e8` | Card surface, elevated panels, subtle inset containers |
| Mist | `#e1e6df` | Hairline borders, card outlines, separator strokes |
| Slate Hollow | `#2a332a` | Inverse surface for footer and dark bands, modal scrims |
| Sage Gray | `#6b7860` | Secondary body text, supporting copy, icon strokes |
| Sage Mist | `#a5ac9f` | Muted helper text, disabled labels, low-emphasis metadata |
| Eucalyptus | `#c9d5c5` | Soft surface tints, category tag backgrounds, hover wash |
| Lichen | `#c5ccb6` | Outlined-button border color, link underlines, specimen-card borders |
| Blush | `#e3c9d0` | Decorative alt-card background, tonal contrast specimen |
| Sand | `#ad9d80` | Decorative card surface, tertiary alt fill |
| Sage Foam | `#729d92` | Decorative alt-card surface, soft cool counterpoint to the sage family |
| Rose Clay | `#c27c93` | Decorative alt-card background, warm-tonal specimen |
| Surface Glow | `#fdfefb` | Surface-highest token, used for elevated card layers above Linen |

## Typography

### akkurat — Workhorse sans for body, nav, headings, buttons, cards across the entire system
- **Substitute:** Inter, IBM Plex Sans, Söhne
- **Weights:** 400, 500, 700
- **Sizes:** 9, 10, 11, 12, 13, 14, 15, 16, 18, 26, 30, 53
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.04em at 53px, -0.02em at 30px, -0.015em at 16px, 0 at 18px body
- **OpenType features:** `"calt", "kern"`

### Newsreader — Single display-size serif headline — unexpected literary anchor against the utility sans
- **Substitute:** "Newsreader", "Cormorant Garamond", "EB Garamond"
- **Weights:** 300
- **Sizes:** 108
- **Line height:** 0.98
- **Letter spacing:** -0.032em
- **OpenType features:** `"calt", "kern"`

### Fragment Mono — Field-note tagging: badges, category labels, button text, code-lite metadata, tracked micro-copy
- **Substitute:** "Fragment Mono", "JetBrains Mono", "IBM Plex Mono"
- **Weights:** 400
- **Sizes:** 9, 10, 11
- **Line height:** 1.11–1.52
- **Letter spacing:** 0.01em at 9px, 0.02em at 11px, 0.04em at 10px
- **OpenType features:** `"calt", "kern"`

### ui-monospace — System mono fallback for the tightest micro-tags (8px, 500 weight, 0.04em tracking)
- **Substitute:** system-ui monospace stack
- **Weights:** 400, 500, 600
- **Sizes:** 8, 9, 11
- **Line height:** 1.00
- **Letter spacing:** 0.04em at 8px, 0.08em at 11px
- **OpenType features:** `"calt", "kern"`

### GT America Mono — GT America Mono — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1.2

### fragmentMono — fragmentMono — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 11px, 14px, 28px
- **Line height:** 1, 1.27
- **Letter spacing:** 0.02, 0.04, 0.05, 0.1
- **OpenType features:** `"calt", "kern"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| tag | — | — | 11px | 1.33 | 0.22px |
| caption | — | — | 14px | 1.29 | — |
| body-sm | — | — | 16px | 1.5 | -0.24px |
| subheading | — | — | 18px | 1.44 | — |
| heading-sm | — | — | 26px | 1 | -0.52px |
| heading | — | — | 30px | 1.16 | -0.6px |
| heading-lg | — | — | 53px | 1.21 | -2.12px |
| display | — | — | 108px | 0.98 | -3.46px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 20px
- **Element gap:** 6px

### Border Radius

- **tags:** 9999px
- **cards:** 10px
- **small:** 1.5px
- **inputs:** 4px
- **buttons:** 20px

## Components

### Primary Pill CTA
**Role:** Filled dark-pill button for top-level conversion (Get Started, header CTA)

Solid Forest Ink (#0a1d08) fill, Linen (#f8f9f5) text, 20px corner radius (effectively pill), horizontal padding 24px, vertical 12px. Akkurat 400/500 at 14–16px. Used in header and hero; appears at most once per viewport to preserve weight.

### Outlined Ghost Button
**Role:** Secondary action — Read Docs, Learn More, lower-emphasis navigation links

Transparent fill, 1px Lichen (#c5ccb6) border, Olive Press (#2b390a) text, 20px corner radius. Padding 12px 20px. Hover swaps border to Forest Ink (#0a1d08). Akkurat 400 at 14–16px.

### Transparent Nav Pill
**Role:** Header and section-level inline links (Docs, Pricing, Blog, footer links)

Fully transparent fill, no border, Forest Ink (#0a1d08) text, 9999px radius (pill), 12px horizontal padding. Akkurat 400–500 at 13–14px, uppercase optional via Fragment Mono variant.

### Category Tag (Field Note)
**Role:** Badge above headlines — 'THE SELF-IMPROVING AGENT', section labels, spec IDs

Sage-tinted fill (oklab green wash at 8% alpha over Linen) or transparent with hairline border. Fragment Mono at 11–12px, uppercase, 0.04em tracking. 9999px radius or 4px rectangle. Includes trailing arrow glyph in same color.

### Specimen Card
**Role:** Content container for feature blocks, variant comparisons, test-result panels

Bone (#eff2e2) or Eucalyptus (#c9d5c5) background, 10px radius, 1px Mist (#e1e6df) border, no shadow. Internal padding 20px. Alternates to decorative alt fills (Blush, Sand, Sage Foam, Rose Clay) for tonal variety.

### Code Block Panel
**Role:** Terminal-style trace display, code snippets, trace log views

Linen (#f8f9f5) or near-white background, hairline Mist border, monospace body (Fragment Mono) at 9–11px, line-height 1.5+. No shadow, no radius on outer container; inner rows separated by 1px dividers. Status markers use Crimson (#991e4b) outline.

### Trusted-By Logo Strip
**Role:** Social proof band of partner/company logos

Full-width Linen background, centered logo row, logos rendered in Olive Press (#2b390a) or Sage Gray (#6b7860). Above the row sits the label 'TRUSTED BY' in Fragment Mono 10–11px, uppercase, 0.04em tracking, Sage Mist color.

### Hero Headline (Serif Anchor)
**Role:** Opening headline on the page — 'Never stop learning'

Newsreader 300 at 108px on desktop, Linen (#f8f9f5) or Forest Ink (#0a1d08) depending on band. Line-height 0.98, letter-spacing -0.032em. Unique among an otherwise sans-serif system — gives the page its editorial opening.

### Section Headline (Akkurat)
**Role:** Mid-page section titles — 'Truly understand your agents', 'Evals that write themselves'

Akkurat 400 at 30–53px, Forest Ink (#0a1d08), tight tracking (-0.04em at 53px, -0.02em at 30px). Line-height 1.16–1.21. Always paired with a supporting body paragraph in 18px Akkurat 400, Sage Gray (#6b7860).

### Nav Header
**Role:** Top-of-page brand and link bar

Linen background, brand wordmark left, link cluster (Docs, Pricing, Blog) in Akkurat 500/700 at 13–14px uppercase-tracked, Primary Pill CTA on the far right. 64px tall, hairline Mist bottom border.

### Landscape Plate Divider
**Role:** Full-bleed photographic breaks between content sections

Full-width photograph with no border, no radius, subtle warm color treatment (lavender/peach grading on natural scenery). Acts as a visual exhale between specimen-card sections.

### Footer Band
**Role:** Closing conversion and link cluster

Slate Hollow (#2a332a) dark inverse background, Linen text, large headline (Akkurat 400 at 30–53px), Primary Pill CTA. Link list in Akkurat 400 at 14px, Sage Mist (#a5ac9f) for separators.

### Input Field
**Role:** Form input for search, email capture, trace filtering

Transparent fill, no visible border by default, Olive Press (#2b390a) text. Underline-only or hairline Mist (#e1e6df) border on focus. Fragment Mono at 11–13px for query-style inputs, Akkurat for prose inputs.

### Pill Tab / Segment
**Role:** Filter tabs and segmented controls inside product UI

Transparent fill pill (9999px radius), Forest Ink text, subtle Sage Mist wash on active state. Fragment Mono 11px tracked or Akkurat 13px. 12px vertical, 16px horizontal padding.

## Do's and Don'ts

### Do
- Use the 108px Newsreader 300 serif for the single opening headline on any page; do not repeat it for subheadings.
- Use Akkurat 400 at 18px for body copy with line-height 1.44 — this is the workhorse rhythm.
- Set filled CTA buttons to Forest Ink (#0a1d08) with Linen text and 20px radius; never use a chromatic green or blue for primary action fills.
- Use Fragment Mono 10–11px with 0.04em tracking for category badges, spec IDs, and field-note labels — always uppercase.
- Separate content sections with full-bleed landscape photography instead of dividers or background-color shifts.
- Stack surfaces via 1px Mist (#e1e6df) borders and tonal fills (Linen → Bone → Eucalyptus); avoid drop shadows.
- Maintain a 6px element gap and 96px section gap as the spatial rhythm across all pages.

### Don't
- Do not pair the serif display font with sans-serif headings — Akkurat at 30–53px owns all non-display headlines.
- Do not introduce bright chromatic CTAs (blue, red, vivid green) — the action palette stays in Forest Ink and Olive Press.
- Do not add drop shadows to cards or modals; rely on borders and surface tints for separation.
- Do not use icons or illustrations to fill empty space — the layout is intentionally sparse and specimen-like.
- Do not mix the Fragment Mono labels into running body copy — keep mono reserved for badges, IDs, and metadata.
- Do not place content into multi-column dashboard grids; sections are wide, centered, and stacked.
- Do not break the 96px vertical rhythm between major sections — Adaline reads as printed pages, not cards.

## Elevation

Adaline avoids drop shadows almost entirely. Elevation is conveyed through surface layering (Linen → Bone → Eucalyptus → Sage tints) and 1px Mist borders. The two shadows detected are functional 1px outlines (Crimson ring for error cells, subtle green focus ring) rather than cosmetic elevation. This keeps the system flat, printed, and specimen-like — like pages in a field notebook rather than floating material cards.

## Surfaces

- **Linen** (`#f8f9f5`) — Page canvas and primary background
- **Bone** (`#eff2e8`) — First elevation — cards and panels
- **Eucalyptus** (`#c9d5c5`) — Mid-elevation — tags, spec cards, hover wash
- **Sage Leaf** (`#4a6d47`) — Tinted surface — featured blocks, decorative wash
- **Slate Hollow** (`#2a332a`) — Inverse surface — footer, dark bands, modal scrim

## Imagery

Photography is a deliberate structural element: full-bleed landscape plates (lavender-pink toned mountains, misty forests, alpine ridges) serve as visual exhales between text-and-card sections. No lifestyle, no product shots, no UI mockups inside the page — the landscape imagery itself IS the visual punctuation. Imagery is high-key, desaturated, warm-toned, and slightly hazy, reinforcing the naturalist-journal mood. Icons are minimal, stroked, 1px weight, Sage Gray (#6b7860) — they annotate rather than decorate. No 3D, no illustration, no abstract gradients.

## Layout

Page reads as a vertical sequence of wide, centered bands. The hero is a two-column split: left column holds the serif display headline + supporting copy + dual CTAs (filled pill + outlined ghost), right column holds the terminal/trace visual. Below the hero sits a centered 'TRUSTED BY' logo strip. Content sections alternate between text-left + specimen-card-right patterns and full-bleed landscape photographs. The page is max-width 1200px centered with generous outer padding (--grid-margin: 48px), but sections that carry photography break out to full-bleed. Vertical rhythm is spacious — 96px between major sections, 6px between inline elements, creating a printed-page cadence rather than a dense dashboard. Navigation is a single thin header bar (64px) with the brand wordmark left, text links center-right, and a filled pill CTA far-right.

## Similar Brands

- **Linear** — Same monochrome-with-muted-accent calm, generous whitespace, and a single editorial display moment anchoring the hero.
- **Resend** — Warm off-white canvas with tracked mono category tags and compact 6px spacing rhythm — both feel like printed spec sheets rather than SaaS dashboards.
- **Posthog** — Sage/olive-leaning neutrals with a serif display accent and specimen-card content containers rather than conventional product UI.
- **Pitch** — Editorial pacing — large type, generous vertical rhythm, and landscape photography used as section dividers instead of UI chrome.
