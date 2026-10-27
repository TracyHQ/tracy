# Madebyon — Style Reference
> black gallery with chartreuse spark. A dark void where one neon-green bullet pierces the silence, all voice carried by warm-white type that breathes in oversized editorial headlines.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Madebyon operates as a dark-canvas digital studio identity: near-black void backgrounds (#000000) push every element forward, with a warm off-white (#faf9f4) doing the heavy typographic lifting. A single electric chartreuse accent (#dcff4f) — the only chromatic color in the system — is rationed to a single filled CTA, giving it a searchlight quality against the dark. The type system uses one custom geometric sans (Favorit) across two voices: a wide-spaced extended cut at 40-56px for editorial-style headlines, and a regular cut at 11-24px for everything else. Layouts are generous and section-driven, with each section separated by substantial vertical air (64-96px) and contained within a centered max-width grid. Components are flat or barely elevated — borders do the structural work, shadows are absent. The overall rhythm is gallery-like: whitespace, tight type, and one green spark.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Void | `#000000` | Page background, hero canvas, deepest surface layer |
| Off-White | `#faf9f4` | Primary text, headlines, icon strokes, card backgrounds inside dark frames, borders on cards — warm cream gives the type a lit-from-within quality against pure black |
| Surface Charcoal | `#151515` | Elevated surface for inputs, nav elements, card interiors — sits one step above the canvas to create depth without lightness |
| Muted Smoke | `#666666` | Secondary text, inactive link borders, subdued metadata |
| Faint Fog | `#bdbdbd` | Tertiary borders, placeholder text, low-emphasis dividers |
| Chartreuse Pulse | `#dcff4f` | Filled CTA buttons, active nav indicators, accent borders, highlight strokes — the single chromatic spark against the monochrome void; near-black text on this fill creates an inverted button effect |

## Typography

### Favorit extended — Favorit extended — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 40px, 56px
- **Line height:** 1.2
- **Letter spacing:** -0.02

### Favorit — Primary typeface across all contexts — body copy, nav, labels, cards, and headings
- **Substitute:** Inter, Switzer, Söhne
- **Weights:** 400
- **Sizes:** 11px, 12px, 13px, 16px, 24px
- **Line height:** 1.00–1.50
- **Letter spacing:** normal at body sizes; -0.0200em at 40-56px
- **OpenType features:** `"ss04"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 24px | 1.35 | 0px |
| heading | — | — | 40px | 1.2 | -0.8px |
| display | — | — | 56px | 1.2 | -1.12px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 50px
- **cards:** 8px
- **inputs:** 16px
- **buttons:** 999px
- **containers:** 24px

## Components

### Pill CTA (Primary)
**Role:** Primary call-to-action — the only filled chromatic button in the system

Background #dcff4f, text #000000, radius 999px (fully rounded pill), padding 12px 25px, font Favorit 16px weight 400. The chartreuse fill against the dark void makes this button impossible to miss — it is rationed to one per view.

### Outlined Action Button
**Role:** Secondary action — 'Go to portfolio' style

Transparent background, 1px border #faf9f4, text #faf9f4, radius 50px, padding 12px 25px, font Favorit 16px weight 400. High-contrast ghost button that uses the off-white border as its structural element.

### Navigation Bar
**Role:** Top-level site navigation

Full-width transparent bar over #000000 canvas. Left: nav links (Projects, Capabilities, Labs) in #faf9f4 at 13-16px. Right: secondary links + Pill CTA. No background fill — the dark canvas is the nav background. Padding 11px vertical.

### Nav Link (Default)
**Role:** Standard navigation link

Favorit 13-16px weight 400, color #faf9f4, no underline, no background. Hover state shifts to #dcff4f or adds an underline.

### Testimonial Card
**Role:** Client quote panel in the social proof section

Background #000000 (same as canvas, so it reads as a borderless card), 1px border #faf9f4 or sits within a bordered grid, radius 8px, padding 24px. Contains: quote text in #faf9f4 at 16px, 'Read more' link, circular avatar photo (48px), name in #faf9f4 weight 400, title + company in muted #bdbdbd.

### Client Logo Strip
**Role:** Horizontal row of partner/client logos

Full-width band, #000000 background, logos rendered in #faf9f4 (monochrome — all logos unified to off-white). No gaps or dividers between logos; evenly spaced with generous horizontal padding.

### Browser Mockup Frame
**Role:** Device/screen showcase in hero area

Dark frame (#151515 or #000000) with browser chrome controls (traffic-light dots in macOS colors: red/yellow/green). Inner content area shows #faf9f4 (off-white) as a white-page simulation. Rounded corners on the frame (8-16px radius). Sits centered within a max-width container.

### Section Heading (Display)
**Role:** Large editorial section title

Favorit extended variant, 40-56px, weight 400, color #faf9f4, letter-spacing -0.0200em, line-height 1.2. Left-aligned, generous top margin. The extended letterforms at display size carry the brand's editorial confidence.

### Body Text Block
**Role:** Standard paragraph and descriptive copy

Favorit regular, 16px, weight 400, color #faf9f4, line-height 1.5. Maximum measure ~60-70 characters. Secondary paragraphs may use #bdbdbd for lower emphasis.

### Input Field
**Role:** Form input (not heavily used, but defined)

Background #151515, border 1px #faf9f4 or transparent, radius 16px, padding 24-26px vertical, Favorit 16px. Placeholder text in #666666.

### Tag/Pill (Non-Action)
**Role:** Category labels or metadata pills

Radius 999px, small padding 4-6px vertical, Favorit 11-12px, border or background in #dcff4f or #faf9f4 depending on context.

## Do's and Don'ts

### Do
- Use #dcff4f for exactly one filled CTA per visible viewport — its power comes from scarcity
- Set display headings at 40-56px with letter-spacing -0.0200em using the extended Favorit variant
- Use #faf9f4 for all primary text and borders — never pure white, the warm cream is part of the identity
- Maintain 80px section gaps to preserve the gallery-walk rhythm between bands
- Apply 999px radius to primary CTAs and 50px to ghost buttons — pill shapes dominate the button language
- Enable font-feature-settings 'ss04' on all Favorit text — this stylistic set is part of the brand voice
- Keep card radius at 8px — small, precise corners that feel intentional, not soft

### Don't
- Do not use #dcff4f for body text, backgrounds of full sections, or decorative fills — it is a functional accent only
- Do not add drop shadows or elevation effects — depth comes from color stepping and hairline borders
- Do not use multiple accent colors — the system is monochrome with one chartreuse spark
- Do not center-align body paragraphs or long-form text — left-align with a 60-70 character measure
- Do not use pure white (#ffffff) for text or borders — #faf9f4 is warmer and more distinctive
- Do not use heavy font weights (600+) — the system relies on weight 400 with extended letterforms for presence
- Do not use gradients — the system is flat by design; any gradient would break the editorial flatness

## Elevation

Shadows are absent. Depth is achieved through surface color stepping (canvas #000000 → surface #151515 → inverted #faf9f4) and 1px hairline borders in #faf9f4. The flatness is deliberate — shadows would soften the graphic, editorial feel and add visual noise to a system that relies on negative space and type weight.

## Surfaces

- **Canvas Void** (`#000000`) — Page base — the void everything sits on
- **Surface Charcoal** (`#151515`) — Inputs, nested card surfaces, nav internals
- **Off-White Card** (`#faf9f4`) — Inverted cards (testimonial panels, browser mockup) that flip the dark/light relationship

## Imagery

Imagery is minimal and product-focused: circular client avatar photos (48px, grayscale or color) in testimonial cards, monochrome client logos unified to #faf9f4 in the logo strip, and a browser mockup frame in the hero showing a white-page site preview. No lifestyle photography, no abstract illustrations, no decorative gradients. The visual language is gallery-clean: objects sit on the void with breathing room, no overlapping, no masking effects. Icons appear to be simple line-style glyphs in #faf9f4.

## Layout

Max-width 1200px centered container, full-bleed dark sections. Hero is a full-viewport dark canvas with left-aligned oversized headline, followed by a centered browser-mockup visual. Sections alternate between pure text blocks (two-column: heading left, body right) and grid-based content (testimonial cards in a 3-4 column horizontal scroll). Section gaps of 80px create gallery-walk rhythm. Navigation is a minimal transparent top bar. The page reads top-to-bottom as: hero → intro paragraph → client logos → testimonials — each section is a full-width band on the same #000000 canvas with internal max-width containment.

## Similar Brands

- **Active Theory** — Same dark-canvas editorial approach with oversized sans-serif headlines and rationed color accents
- **Resn** — Dark-mode digital studio site with single accent color and gallery-style section rhythm
- **Locomotive (scroll agency)** — Monochrome dark aesthetic with extended sans-serif display type and minimal flat components
- **Ueno** — Dark canvas, cream/off-white type, generous whitespace, and a single vibrant accent for CTAs
