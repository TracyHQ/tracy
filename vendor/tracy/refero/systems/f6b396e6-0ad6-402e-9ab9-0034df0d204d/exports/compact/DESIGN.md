# San Rita — Style Reference
> alpine field guide on sage paper

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

San Rita reads like a field journal for an outdoor boot brand: expansive landscape photography, a single pale mint accent that pops like highlighter on topo paper, and a custom condensed display face that turns section openers into landscape-blocking statements. The visual rhythm alternates between bright, full-bleed imagery and near-black (#161b13) dark bands where tilted Polaroid-style photos scatter across the canvas like a fly-fishing logbook. Typography is utilitarian and small for everything except the display moments — mono caps handle UI chrome while a single massive 300px+ display line carries each section's identity. Components stay flat and unembellished: thin outlined buttons, no shadows, no rounded corners to soften the edges. The whole system feels like topographic map meets adventure zine — confident, outdoorsy, and deliberately raw rather than polished SaaS.

## Colors

| Name | Value | Role |
|------|-------|------|
| Highlighter Mint | `#e2ffcc` | Primary brand accent — display text, nav links, button labels, icon fills. The signature color; reads as highlighter pen on topo map |
| Sage Stone | `#84907f` | Muted secondary accent — subtle background washes, subdued UI elements where Highlighter Mint would be too loud |
| Carbon Ink | `#161b13` | Dark section backgrounds — near-black with the faintest green undertone, anchors the dark bands of the page |
| Forest Charcoal | `#2d3329` | Mid-dark text and borders on light sections — softer than pure black, keeps the green-warmth consistent |
| Topo Gray | `#dde2e4` | Light section backgrounds, card surfaces, hairlines — the base canvas for light bands |
| Pure Black | `#000000` | Icon strokes, link underlines, high-contrast accents where maximum punch is needed |

## Typography

### F37stout — Display face for section openers and brand wordmark. The extreme condensed proportions at 0.90 line-height and a single weight (400) create landscape-blocking headlines that read as stamped signage, not web type. At 366px it fills the viewport; at 40–48px it becomes a tight sectional label.
- **Substitute:** Bebas Neue, Anton, Oswald
- **Weights:** 400
- **Sizes:** 40px, 48px, 366px
- **Line height:** 0.90
- **Letter spacing:** normal

### mono — All UI chrome, body copy, nav, captions, buttons, footer text. The -0.01em tracking and tight 1.20 line-height give it a screen-printed, field-guide density. Weight 700 is used sparingly for emphasis; weight 400 carries the load. All-caps treatments dominate — this face behaves like a typewriter.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Space Mono
- **Weights:** 400, 700
- **Sizes:** 10px, 12px, 16px
- **Line height:** 1.20
- **Letter spacing:** -0.01em

### Times — Serif accent for inline links, providing a newspaper/editorial contrast against the mono body. Used sparingly — one or two link moments per page.
- **Substitute:** Times New Roman, any system serif
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.20
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | -0.01px |
| body | — | — | 16px | 1.2 | -0.01px |
| subheading | — | — | 40px | 0.9 | — |
| heading | — | — | 48px | 0.9 | — |
| display | — | — | 366px | 0.9 | — |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 67px
- **Card padding:** 16px
- **Element gap:** 24px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **buttons:** 0px

## Components

### Brand Wordmark
**Role:** Logo lockup in the top-left corner

Custom display face (F37stout equivalent) reading 'San Rita' at approximately 40px. Color is Highlighter Mint (#e2ffcc) on dark sections, Forest Charcoal (#2d3329) on light sections. No icon, no container — just the wordmark as a direct stamp.

### Outlined Nav Button
**Role:** Primary navigation CTA in the header (e.g. 'SHOW TRAILS')

1px solid border in current text color, transparent fill, 0px radius, 12–16px horizontal padding, mono caps at 10–12px. Sits flush right in the header. On dark backgrounds: border and text in Highlighter Mint (#e2ffcc). On light backgrounds: border and text in Forest Charcoal (#2d3329).

### Display Headline
**Role:** Section-opener text that fills the viewport

F37stout at 366px, line-height 0.90, letter-spacing normal, weight 400. Set in Highlighter Mint (#e2ffcc) and overlaps photographic backgrounds. The extreme scale means one line of text occupies the full width — the headline IS the layout, not contained within it.

### Tilted Photo Card
**Role:** Scrapbook-style image cluster on dark sections

Photographs at roughly 280–360px wide, set at varying rotation angles (approximately -8°, +12°, +4°) to create a hand-scattered, Polaroid-tossed effect. No border, no shadow, no radius — raw 0px corners. Overlaps and partially covers neighboring images. Sits on Carbon Ink (#161b13) background.

### Circular Icon Badge
**Role:** Standalone illustrated icon pinned to sections

Small circular badge (approximately 40–48px diameter) with a 1.5px stroke outline in Highlighter Mint (#e2ffcc), transparent fill. Contains a simple line illustration (e.g. hat, house, location pin). Functions as a decorative marker — not interactive chrome.

### Footer Caption Block
**Role:** Small all-caps location/credit text in the lower-right

Mono 10–12px, line-height 1.20, letter-spacing -0.01em, color Highlighter Mint (#e2ffcc) on dark. All-caps. Two to three short lines of geographical/brand lineage copy. Right-aligned, sits near the bottom edge with generous margin (190px+ from one side).

### Section Band — Dark
**Role:** Full-bleed dark content band

Background Carbon Ink (#161b13), spans full viewport width, no max-width constraint. Contains scattered tilted photo cards, icon badges, and Highlighter Mint text. Section padding is roughly 67–70px top/bottom.

### Section Band — Light
**Role:** Full-bleed light content band

Background Topo Gray (#dde2e4) or photographic. Mono body text in Forest Charcoal (#2d3329). Section padding 67–70px. Often the top band under a full-bleed photographic hero.

### Inline Link
**Role:** Text links within body copy

Serif (Times) at 16px, underline present, color Forest Charcoal (#2d3329) on light backgrounds. The only serif moment in the system — reads as editorial anchor text.

### Scroll Cue Indicator
**Role:** Small fixed element near bottom of viewport

Tiny circular or hexagonal icon (approximately 24px) with 1px stroke in Forest Charcoal (#2d3329) or Highlighter Mint (#e2ffcc). Suggests downward scroll direction. No fill, no animation chrome — a quiet directional hint.

## Do's and Don'ts

### Do
- Use F37stout for display moments only — let 366px headlines own the viewport, never shrink below 40px
- Set all display text in Highlighter Mint (#e2ffcc) and let it overlap photographic backgrounds
- Keep line-height at 0.90 for all F37stout type — the extreme tightness is the signature
- Use mono (system mono substitute) at 10/12/16px for all UI, body, and caption text with -0.01em tracking
- Set section gaps at 67–70px and element gaps at 24px — the rhythm comes from the 6px base unit scaled up
- Scatter tilted photo cards at varying rotation angles (-12° to +12°) on Carbon Ink (#161b13) backgrounds
- Keep radius at 0px for all components — corners stay sharp, the design language is topo-map crisp

### Don't
- Don't add border-radius to buttons, cards, or images — sharp corners are non-negotiable
- Don't use a second chromatic accent — Highlighter Mint is the only color moment that carries brand
- Don't set F37stout at intermediate sizes (16–36px) — it only works at display scale or subheading scale (40–48px)
- Don't use Times for body copy — it's a link accent only, the rest of the system is mono
- Don't apply shadows or elevation — surfaces are defined purely by color and photographic layering
- Don't center body text — mono UI copy should sit left-aligned or right-aligned, never centered
- Don't introduce a third neutral — the five-tone scale (#dde2e4 → #84907f → #2d3329 → #161b13 → #000000) is the complete tonal range

## Elevation

No shadows, no drop shadows, no glow effects. Depth is created entirely through the layered overlap of photographic elements on solid color backgrounds, and through the surface scale from Topo Gray through Carbon Ink. The flatness is deliberate — it reads as printed paper, not digital UI.

## Surfaces

- **Topo Gray** (`#dde2e4`) — Light page canvas and card base
- **Highlighter Mint** (`#e2ffcc`) — Accent surface for highlighted text blocks and tonal emphasis
- **Sage Stone** (`#84907f`) — Mid-tone surface for subdued sections
- **Forest Charcoal** (`#2d3329`) — Deep UI surface on light themes
- **Carbon Ink** (`#161b13`) — Dark section background — alternate page band

## Imagery

Photography is the primary visual content — expansive landscape shots of canyons, mountains, and fly-fishing environments, treated as full-bleed hero backgrounds without color grading or filters. Tonal range is warm golden-hour to cool dusk. Secondary imagery appears as scattered, hand-tilted Polaroid-style snapshots (rotated -12° to +12°) on dark sections, creating a scrapbook/zine aesthetic. No illustrations, no product renders, no abstract graphics. The only non-photographic visual is simple line-drawn icon badges (hat, house, location markers) in 1.5px stroke. Photography occupies roughly 60% of total page real estate — image-heavy overall, with text punctuating rather than dominating.

## Layout

Full-bleed edge-to-edge layout with no max-width container — the canvas stretches to viewport edges on all sections. Hero pattern: full-viewport landscape photograph with the massive display headline overlapping the lower portion of the image. Section rhythm alternates between photographic/light bands and solid dark bands (#161b13), each spanning full width. Dark sections feature asymmetric, hand-scattered photo clusters rather than grids. Navigation is a minimal top bar — wordmark left, single outlined button right — with no sticky behavior apparent. Content arrangement is deliberately non-grid: photos are rotated and overlapping, text blocks sit at irregular margins (67px, 70px, 190px observed), creating a journal/zine composition rather than a SaaS dashboard. No card grids, no pricing tables, no feature matrices. Generous breathing room between sections (67–70px) but tight internal spacing (12–24px).

## Similar Brands

- **Topo Designs** — Same outdoor-brand full-bleed photography, condensed display type, and minimal chrome — both treat the website as a lookbook rather than a store
- **Patagonia** — Landscape-first hero imagery with environmental storytelling, though San Rita is more zine-scrapbook and less editorial
- **Rumpl** — Same utilitarian mono UI type, photographic full-bleed sections, and topographic/field-guide visual language
- **Poler** — Hand-tilted photo collage aesthetic, dark-and-photo alternating sections, casual outdoor brand attitude over polished e-commerce
- **Snow Peak** — Minimal nav chrome, landscape photography dominance, and typography that prioritizes display moments over body text density
