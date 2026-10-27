# Stykka — Style Reference
> Scandi atelier under white light — a quiet, hand-built showroom where the only voice is the photograph

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Stykka is a Scandinavian kitchen brand that treats the interface like a museum catalog: pure white canvas, black hairline borders, and full-bleed photography that carries every ounce of warmth, color, and craft. The UI is deliberately invisible — there is no accent color, no decoration, no shadow stack — so that the kitchens in the imagery feel like the only subject on screen. Typography does the talking: Inter at tight negative tracking on large display sizes, uppercase tracked labels for section openers, and a system fallback for the tiniest metadata. Spacing is compact and editorial, with 10px gaps between elements and generous white space at the section level. Everything from the nav to the feature grid to the outlined CTA assumes a black-and-white photograph will do the emotional heavy lifting — the system stays out of the way.

## Colors

| Name | Value | Role |
|------|-------|------|
| Press Black | `#000000` | Primary text, 1px hairlines, icon strokes, outlined button borders. The structural ink of the entire system — every border, every label, every headline resolves to this single value |
| Gallery White | `#ffffff` | Page canvas, card surfaces, button text on dark surfaces, inverse overlay backgrounds. The unbroken ground on which every photograph sits |
| Plate Gray | `#b8b8b8` | Subtle disabled state, placeholder fill, secondary metadata. Reads as 10.6:1 on black (safe for muted labels) but only 2.0:1 on white — never use as body text on the default canvas |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Inter — Primary typeface for everything visible. Weight 400 carries body and nav; weight 500 lifts labels, button text, and the uppercase section openers. Display sizes (30–46px) use aggressive negative tracking (around -0.04em) that pulls letters together so headlines feel set in metal, not typeset. Sub-16px sizes flip to positive tracking (0.021em) for the small-caps label treatment that recurs across hero overlays and section headers
- **Substitute:** system-ui, -apple-system, Segoe UI, Roboto
- **Weights:** 400, 500
- **Sizes:** 11px, 14px, 16px, 22px, 24px, 30px, 46px
- **Line height:** 1.20, 1.25, 1.50
- **Letter spacing:** -1.93px at 46px / display, -1.20px at 30px / heading, -0.89px at 24px / heading-sm, -0.79px at 22px / subheading, -0.37px at 16px / body, +0.29px at 14px and +0.23px at 11px / small-caps labels and caption
- **OpenType features:** `"ss01" on for alternate single-storey 'a' if available, "tnum" for tabular numbers in any data row`

### Azeret Mono — Reserved for a single editorial moment in the body — a 18px monospace line that breaks the Inter rhythm. Use sparingly, never more than once per page, to mark a hand-set caption, specification, or builder's note
- **Substitute:** IBM Plex Mono, JetBrains Mono, ui-monospace
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.00
- **Letter spacing:** -0.0100em

### system-ui (sans-serif) — Invisible utility tier for the smallest chrome elements — copyright lines, version stamps, decorative micro-labels. Inter is the show; system-ui is the scaffolding you never notice
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | 0.23px |
| body-sm | — | — | 14px | 1.25 | 0.29px |
| body | — | — | 16px | 1.5 | -0.37px |
| subheading | — | — | 22px | 1.2 | -0.79px |
| heading-sm | — | — | 24px | 1.2 | -0.89px |
| heading | — | — | 30px | 1.1 | -1.2px |
| display | — | — | 46px | 1.05 | -1.93px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 60-80px
- **Element gap:** 10px

### Border Radius

- **tags:** 8px
- **cards:** 16px
- **buttons:** 8px
- **imageContainers:** 0px (photography is hard-edged to the grid line)

## Components

### Transparent Top Nav
**Role:** Primary navigation that sits over full-bleed hero photography

Full-width, position-absolute over hero, no background fill. Left cluster: nav links (About, Journal, Inspiration, Design) in Inter 16px weight 400 #000 with 20px horizontal spacing. Center: wordmark 'Stykka' in Inter 22-24px weight 500 #000. Right cluster: language selector and 'Start building' outlined button. 20px vertical padding. No border, no shadow, no background.

### Outlined CTA Button
**Role:** The only button variant on the site — used for every actionable element

Inter 16px weight 500 #000, 1px solid #000000 border, 8px radius, padding 10px 18px (approx). Transparent fill so it sits cleanly over photography. Hover inverts: fill becomes #000000, text becomes #ffffff. No drop-shadow, no scale transform. The 8px radius is deliberately soft but not pill — it reads as pressed metal, not a tag.

### Hero Section (Full-Bleed)
**Role:** First-screen brand statement

100vw × ~100vh image, no overlay, no gradient. Text block sits in the lower-left third, aligned to the 10px grid, padded from the viewport edge. Contains a tracked uppercase label, a display headline, and a single CTA. The hero is a photograph first and a layout second — no fake device frames, no illustration, no animation chrome.

### Hero Overlay Label
**Role:** Tracked small-caps category tag above headlines

Inter 14px weight 500 #ffffff (sits over photography), letter-spacing +0.29px, uppercase. Used in the hero and as the opener of every editorial section — it is the system's only repeated chrome. Color flips to #000000 on white backgrounds.

### Display Headline
**Role:** Primary editorial statement on hero and section openers

Inter 46px weight 400 #ffffff on hero / #000000 on white sections, line-height 1.05, letter-spacing -1.93px. Weight 400 (not 700) is the signature — the headline never shouts. It is set tight enough to feel architectural, not typeset.

### Feature Grid Card
**Role:** 4-column editorial card for product attributes

Image on top (full-bleed, hard 0px corners, 4:3 or 3:4 aspect), 10px row gap to title, title in Inter 14-16px weight 500 uppercase #000 letter-spacing +0.29px, 10px gap to body, body in Inter 16px weight 400 #000 line-height 1.50. No card surface, no border, no shadow — the image edge IS the card edge. 4 columns on desktop, collapses to 2 then 1.

### Language Selector
**Role:** Locale switcher in nav

Globe icon (16px stroke, 1px #000) + 'English' in Inter 16px weight 400 + small chevron. No background, no border. Sits inline with other nav elements with 20px gap.

### Section Header Block
**Role:** Editorial opener for a content section

Stack: tracked uppercase label (14px) → display or heading headline (30-46px) → optional supporting paragraph (16px, max-width ~60ch). Vertically centered or left-aligned to the 10px grid. Generous 60-80px section gap before and after. The header does most of the brand voice work — no decorative graphics.

### Image Grid (Multi-Column)
**Role:** Full-bleed photography showcase below the fold

2- or 3-column grid of hard-edged images, 10-15px gutters, no captions, no borders. Each image bleeds to the edge of its cell. This is the system's only way of communicating product warmth — by showing it, not by styling it.

### Inline Text Link
**Role:** Links within body copy

Inter 16px weight 400 #000, 1px underline offset 3px, underline color #000. No color shift, no bold — the link is identified by the underline alone, which keeps the editorial line unbroken.

### Footer Block
**Role:** Closing black band

Full-width #000000 background, text in #ffffff. Inter 14-16px weight 400. Same 20px internal padding rhythm as the nav. Minimal: a wordmark, a link list, and a copyright line in system-ui 12px. No social icons, no newsletter form — the system stays austere to the end.

### Monospace Spec Callout
**Role:** Editorial accent line for a material or dimension

Azeret Mono 18px weight 400 #000, line-height 1.00, letter-spacing -0.18px. Single line, full-bleed across the content column. Breaks the Inter rhythm deliberately — use for a quote, a dimension, or a builder's note. Never more than one per page.

## Do's and Don'ts

### Do
- Use #000000 for every text element and every 1px border — never introduce a second ink color, the system is intentionally monochromatic
- Set display headlines at Inter weight 400 (not 700) with tracking between -1.2px and -1.93px — the tight setting is the signature, not the weight
- Use the 14px uppercase tracked label (ls +0.29px) as the opener of every section — it is the only repeated UI motif and it carries the editorial voice
- Use the outlined CTA (1px #000 border, 8px radius, transparent fill) for every action — there is no filled or ghost variant, this is the only button
- Let photography fill the entire viewport for hero and feature sections — 0px corner radius on all image containers, the photo bleeds to the grid line
- Hold element gaps to 10px and section gaps to 60-80px — the compact density is what makes the white space feel intentional rather than empty
- Use 16px card radius (not 12px, not 8px) on any card surface that contains text — the extra softness separates editorial content from the harder 8px button geometry

### Don't
- Never introduce an accent color, brand color, or chromatic highlight — the system has none by design, the photography provides all warmth
- Never use a drop-shadow, box-shadow, or elevation token to group content — use a 1px border or whitespace instead, this is a flat system
- Never set a display headline at weight 500+ — the headline must whisper at 400 to preserve the editorial register
- Never use positive letter-spacing on sizes above 16px — the positive tracking is reserved for the 11-14px small-caps label tier only
- Never use a filled or solid button — the outlined 1px border is the only button geometry in the system
- Never apply the 16px card radius to images — images are always hard-edged (0px), the 16px is for text-bearing surfaces only
- Never place body text directly on a full-color photograph without a tonal treatment — the hero overlay uses #ffffff text, and any text on a photograph must be either pure white or pure black to survive the contrast

## Elevation

Zero shadow vocabulary. Structure is communicated entirely through 1px hairline borders in #000000 and whitespace. Cards, sections, and feature blocks float by adjacency, not by depth. Adding a drop-shadow breaks the editorial flatness of the system — if you need to group something, draw a border instead.

## Surfaces

- **Canvas** (`#ffffff`) — Default page background and image-negative space between sections
- **Ink** (`#000000`) — Reserved as a contrast surface for inverse buttons, footer block, or full-bleed black sections — not used as page background

## Imagery

Photography is the entire visual system. The site uses no illustrations, no icons beyond simple line glyphs (globe, chevron, arrows), no abstract graphics, and no 3D renders. All imagery is warm, natural-light, editorial interior photography: timber kitchens, natural materials, daylight, human scale. Treatments are full-bleed with hard 0px corners — no rounded masking, no drop-shadow on photos, no duotone or color grading. Images occupy roughly 60% of the page area across the site, dominating the visual hierarchy over every UI element. The system is image-heavy in the sense that the few images shown are large, but the overall density is restrained — usually one full-bleed photograph per screen.

## Layout

Full-bleed max-width ~1280px centered container. Hero is a single 100vw × ~100vh photograph with a text overlay in the lower-left third — no split layout, no card hero, no video. Below the fold, the rhythm alternates: a centered 4-column feature grid, then a full-bleed 2- or 3-column image grid, then a black footer band. Sections are separated by 60-80px vertical whitespace, never by dividers. Navigation is a transparent bar absolutely positioned over the hero, becoming part of the page flow as the user scrolls. The layout reads as a long-scroll editorial spread — closer to a print catalog than a typical product page.

## Similar Brands

- **Menu (space.menu)** — Same Scandinavian furniture-brand restraint, transparent nav over full-bleed interior photography, Inter at tight tracking, and an exclusively black/white interface that lets the product imagery carry all warmth
- **Hem** — Editorial Scandi furniture catalog with the same uppercased tracked label openers, hard-edged full-bleed product photography, and a gallery-white canvas with hairline structural borders
- **USM** — Modular furniture brand that uses a near-identical monospace label + Inter headline pairing, 0px image corners, and a 4-column feature grid layout for product attributes
- **Vitra** — Same museum-catalog posture: large confident display headlines at weight 400 (not bold), 1px black rules instead of shadows, and full-bleed interior photography that does the brand's emotional work
