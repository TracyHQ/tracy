# Heart Aerospace — Style Reference
> monumental type drifting through cloud-level gradient skies — the brand reads like an engineering manifesto printed on atmosphere.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Heart Aerospace uses a monumental-typography-over-atmospheric-sky language: the brand communicates through oversized type and full-bleed aviation photography, with almost no decorative UI chrome. The palette is nearly monochrome — a muted stratosphere purple-gray anchors atmospheric sections, a deep jetstream blue punctuates outlined actions, and black/white carry all structural weight. Every screen should feel like a single composition: type the subject, photography the environment, negative space the luxury. There are no cards, no shadows, no rounded surfaces, no gradients beyond the sky atmosphere — the design earns its restraint by letting a 156px display headline and a photograph do all the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Stratosphere | `#716e85` | Hero and section atmospheric backgrounds, sky gradient origin, the signature non-neutral surface that carries brand mood |
| Jetstream Blue | `#001489` | Outlined/ghost action borders, link text, image accent borders — the only chromatic accent, used as outlined-link color and focused-frame treatment, never as a filled button background |
| Onyx | `#000000` | Primary text, structural borders, footer background, partner logo fills |
| Cloud | `#ffffff` | Inverse text on dark and gradient backgrounds, content section canvas, navigation text on hero, gradient endpoint |

## Typography

### NeueHaasText — NeueHaasText — detected in extracted data but not described by AI
- **Weights:** 400, 600
- **Sizes:** 18px
- **Line height:** 1, 1.3
- **Letter spacing:** -0.01

### NeueHaasGroteskDisplay — Monumental display headlines (ES-30 wordmark, section showstoppers) — the weight 600 at 156px with -0.02em tracking is the brand's signature voice, engineered for aerospace-scale moments that fill the viewport
- **Substitute:** Inter Display Bold, Helvetica Neue Bold, or Söhne Breit Bold
- **Weights:** 600
- **Sizes:** 
- **Line height:** 1.00
- **Letter spacing:** -0.02em

### NeueHaasGroteskText — All UI and body text — navigation links, body copy, footer links, captions. Weight 400 is the default reading voice; weight 600 for subheadings and emphasized nav. The -0.01em tracking at 18px is subtle but consistent — tighter than browser default, which is the Ne Haas family hallmark
- **Substitute:** Inter, Helvetica Neue, or Söhne
- **Weights:** 400, 600
- **Sizes:** 
- **Line height:** 1.30
- **Letter spacing:** -0.01em

### NeueHaasDisplay — NeueHaasDisplay — detected in extracted data but not described by AI
- **Weights:** 600
- **Sizes:** 46px, 156px
- **Line height:** 1
- **Letter spacing:** -0.02

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 18px | 1.3 | -0.18px |
| heading-sm | — | — | 46px | 1 | -0.92px |
| display | — | — | 156px | 1 | -3.12px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 70px
- **Element gap:** 18-20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Transparent Hero Navigation
**Role:** Primary site navigation overlaid on atmospheric hero

No background, no border, no fill. Heart Aerospace logo (aircraft icon + wordmark, ~120px wide) anchored left, text links right-aligned (Our mission, Company, ES-30™, Newsroom, Careers, Media bank, Contact). Links in Cloud #ffffff at 18px weight 400 with 28px left margins between items. Sits directly on the gradient/photograph with no visual separation.

### Full-Bleed Atmospheric Hero
**Role:** Brand introduction section with photography and overlay headline

Edge-to-edge aviation photograph (aircraft above clouds) with a linear gradient overlay from Stratosphere #716e85 at top fading to lighter tones. No padding constraint — image fills viewport. Headline anchored to bottom-left in Cloud #ffffff, NeueHaasGroteskDisplay at ~120-156px, -0.02em tracking, line-height 1.0. 40px left padding from viewport edge.

### Monumental Display Section
**Role:** Product naming or section showstopper (e.g. 'ES-30')

Full-bleed gradient background (Stratosphere #716e85 to Cloud #ffffff, linear, top to bottom). Single NeueHaasGroteskDisplay word in Cloud #ffffff at 156px, weight 600, -0.02em tracking, filling 80%+ of viewport width. No supporting copy in the same viewport — the type IS the content. Product imagery enters from the bottom edge as a subtle reveal.

### Outlined Ghost Link
**Role:** Primary interactive accent — navigation CTA, external links, focused treatments

1-2px border in Jetstream Blue #001489, no background fill, Cloud or Onyx text inside. Text in NeueHaasGroteskText 18px weight 400. Zero radius. Used for link borders (48 occurrences in data) and image frames (44 occurrences) — this is a bordered/outlined action style, never a filled button.

### Partner Logo Grid
**Role:** Social proof — investors, airline partners, institutional backers

Cloud #ffffff background section. 5-column grid wrapping to 3 rows, generous 40px+ vertical gap between rows. All logos rendered in Onyx #000000 monochrome (original brand colors stripped). Logos centered within their grid cells at uniform optical size. No borders, no cards, no background tiles.

### Onyx Footer
**Role:** Terminal site navigation, social links, and corporate address

Solid Onyx #000000 background, full-bleed. Three-column layout: Navigation (internal links), Follow (social platforms), Address (201 Nevada St Suite B, El Segundo, CA 90245). Column headers in Cloud #ffffff weight 600, list items weight 400. 20px vertical padding per link. 40px horizontal section padding. Small bottom-left logo mark in Cloud as a closing signature.

### Section Headline (Cloud Canvas)
**Role:** Content section titles on white background pages

NeueHaasGroteskDisplay 46px weight 600, -0.02em tracking, Onyx #000000 color, line-height 1.0. Sits with 46px margin-bottom from body content. Left-aligned, 40px from container edge.

## Do's and Don'ts

### Do
- Set display headlines at 156px in NeueHaasGroteskDisplay weight 600 with -0.02em tracking — this scale is the brand's signature and should not be reduced for non-product pages
- Use the linear gradient from Stratosphere #716e85 to Cloud #ffffff for all atmospheric/hero section backgrounds
- Render all partner and third-party logos in monochrome Onyx #000000 on light surfaces — never preserve original logo colors
- Keep all interactive elements as outlined/ghost (Jetstream Blue #001489 border, no fill) — never introduce filled buttons with backgrounds
- Set all border-radius to 0 — this system has no rounded surfaces anywhere
- Use Cloud #ffffff text on Stratosphere/Onyx surfaces; use Onyx #000000 text only on Cloud surfaces
- Anchor headlines to the left edge with 40px padding from viewport — never center display type

### Don't
- Do not use Jetstream Blue #001489 as a filled button background — it is an outlined-action color only (ACTION_BACKGROUND=0 in the data)
- Do not introduce card components with padding, borders, or shadows — the system is flat and full-bleed
- Do not add border-radius to buttons, inputs, tags, or images — every corner is sharp
- Do not use color for section differentiation — the palette is intentionally three colors plus white, repetition is the point
- Do not place body copy directly on the Stratosphere #716e85 background — it fails contrast (2.9:1 with Jetstream Blue, 4.3:1 with Onyx); only Cloud #ffffff text survives on atmospheric surfaces
- Do not add drop shadows or elevation effects — the design language is flat, depth comes from photography and gradient not from CSS shadows
- Do not use decorative icons or illustrations — the only mark is the Heart Aerospace aircraft logo

## Surfaces

- **Atmospheric Canvas** (`#716e85`) — Full-bleed hero and feature sections — the gradient origin for sky photography overlays
- **Cloud Canvas** (`#ffffff`) — Content sections below the fold — partner grids, article bodies, secondary pages
- **Onyx Footer** (`#000000`) — Terminal footer surface for navigation, social, and address columns

## Imagery

Photography is the primary visual medium — full-bleed aviation photography dominates the hero, showing the ES-30 aircraft in flight above clouds at golden-hour sunset. Treatment is atmospheric and aspirational: high-altitude perspective, soft natural light, the aircraft positioned small within vast sky to emphasize scale and environment over product detail. No lifestyle photography, no people, no ground-level shots. Logos in the partner grid are stripped to monochrome Onyx — original brand color is always removed. There are no illustrations, no icons beyond the minimal logo mark, no 3D renders, no decorative graphics. When photography ends, white space and type take over.

## Layout

Full-bleed edge-to-edge design with no max-width container — every section fills the viewport. The page is a vertical sequence of atmospheric bands: full-bleed gradient/photography hero → gradient display section (ES-30) → white content sections with partner grid → Onyx terminal footer. There is no centered narrow column, no asymmetric split layouts, no card grids with padding — the layout grammar is 'band, headline, photograph, repeat.' Navigation is a transparent overlay on the hero only. Content alignment is left-edge anchored (40px from viewport) for headlines, centered for logo grids. Vertical rhythm is generous: 70px section gaps, 40px content padding, plenty of empty atmosphere between type moments. The layout is architectural — each screen is a single composition, not a collection of components.

## Similar Brands

- **Boom Supersonic** — Same aerospace-scale display type (200px+ headlines) over full-bleed photography with a nearly monochrome palette — both treat type and photography as the only two design elements
- **Joby Aviation** — eVTOL competitor with the same restrained palette, oversized product-name typography, and edge-to-edge atmospheric hero sections
- **Northvolt** — Nordic industrial brand sharing the NeueHaasGrotesk type system, zero-radius flat surfaces, and a single deep-blue accent against monochrome — same engineering-manifesto restraint
- **Rivian** — Clean industrial branding with monumental type, full-bleed environmental photography, and a near-monochrome palette punctuated by a single deep accent color
