# Garden Eight — Style Reference
> Monumental cream-paper editorial. A 215px serif headline sits alone on warm parchment, surrounded by floating sculptural forms and ocean-air negative space — the page behaves like the cover plate of an art monograph, not a dashboard.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Garden Eight operates as an art-book editorial spread: a warm cream parchment canvas hosts monumental serif type that behaves like gallery wall text rather than product UI. The palette is ruthlessly binary — bone-white surface, ink-black type — and every additional color is treated as intrusion. Layout breathes at near-museum scale, with 180px gutter margins and oversized negative space letting type and sculptural 3D objects become the only content. There is no functional color language: no alert red, no success green, no info blue. Decisions are made by weight, scale, and silence. The system reads more like a couture magazine masthead than a SaaS interface, and any agent reproducing it should prioritize typographic drama and atmospheric restraint over conventional UI affordances.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#dbd6d0` | Page canvas, card surfaces, light dividers, link borders — a warm desaturated bone tone that replaces the conventional near-white and gives the whole system its editorial temperature |
| Carbon Ink | `#1e1f1f` | Primary text, display headlines, nav rules, card borders, icon strokes — near-black with the faintest warm cast that harmonizes with the parchment rather than fighting it |
| Pitch Black | `#000000` | Reserved for maximum-contrast display moments and the deepest text on the lightest surfaces — used sparingly so Carbon Ink carries the default reading weight |

## Typography

### Lausanne — Primary serif — carries nav labels at 12–15px weight 400, body and link copy at 14–15px weight 400, and the colossal 215px display headline at weight 200. The weight-200 display is the signature: most agencies use 600–700 for monumental type, Lausanne's hairline 200 lets the headline whisper at 215px and still feel like the loudest thing on the page through scale alone
- **Substitute:** Fraunces (Google Fonts) — shares the modern serif character with optical-size control; for closest free match use Fraunces opsz 144+ at the display size
- **Weights:** 200, 400
- **Sizes:** 12px, 14px, 15px, 215px
- **Line height:** 1.25–1.60 (body), 1.30 (headlines)

### Gunsan — Display serif companion — weight 600 at 215px with an aggressively tight 0.77 line-height creates the condensed, high-contrast letterspacing on hero compositions. The 0.77 leading is the tightest in the system and is the only place this font appears
- **Substitute:** Playfair Display (Google Fonts) — high-contrast modern serif that can replicate the 0.77 line-height drama at display sizes
- **Weights:** 600
- **Sizes:** 215px
- **Line height:** 0.77

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| display | — | — | 215px | 0.77 | — |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 60px
- **Card padding:** 12-30px
- **Element gap:** 4-10px

### Border Radius

- **tags:** 1440px
- **cards:** 30px
- **canvas:** 0px
- **buttons:** 1440px

## Components

### Monumental Display Headline
**Role:** Hero typography

215px Gunsan weight 600, line-height 0.77, color #1e1f1f on #dbd6d0 canvas. All-caps, centered or left-aligned. This is the single largest typographic element on any screen and should be the only text competing for attention — no subtitle, no supporting copy above the fold.

### Hairline Display Headline
**Role:** Alternative hero typography

215px Lausanne weight 200, line-height 1.30, color #1e1f1f. Same monumental scale but whisper-weight — used when the composition needs to feel like gallery wall text rather than magazine cover. The contrast between 200 and 600 at identical size defines the system's two display voices.

### Top Bar Navigation
**Role:** Global site navigation

Full-width transparent bar over the parchment canvas. Brand wordmark 'GARDEN EIGHT' at 12px Lausanne weight 400, 10px letter-tracking, top-left. Nav items (CASES, ABOUT, ARCHIVES, CONTACT) right-aligned, same 12px Lausanne weight 400, 38–45px horizontal padding between items. AI/JA language toggle at far right in identical treatment. No background fill, no border-bottom — the nav floats on the canvas.

### Pill Button
**Role:** Action trigger

1440px border-radius (true pill). 1px border in #1e1f1f or #dbd6d0 depending on surface, 12px horizontal padding, no fill by default. Text 12–14px Lausanne weight 400. On hover: fill inverts to the border color. The shape is the brand — every interactive element with a border should be a pill, never a rectangle.

### Text Link
**Role:** Inline navigation

12–15px Lausanne weight 400, color inherits from #1e1f1f. Underline is a 1px border-bottom in the same color. No color shift on hover — emphasis is created by weight change (400 → 200 reversal) rather than color, preserving the binary palette.

### Card with 30px Radius
**Role:** Project case, work tile

30px border-radius (the only non-pill, non-zero radius in the system). Surface inherits the parchment canvas — cards are defined by 1px #1e1f1f borders and 12–30px internal padding, not by background fill or shadow. 3D sculptural imagery sits inside these cards and bleeds close to the 30px corners.

### Sculptural 3D Object
**Role:** Atmospheric visual

Organic cream-toned 3D renders (the same hue family as the canvas, not a contrast color) float behind and around display type. Always full-bleed or edge-touching, never contained in a card frame. Shadows on these objects are the only shadow language in the system — the UI itself casts none.

### Language Toggle
**Role:** Locale switcher

Two text tokens (AI / JA) at 12px Lausanne weight 400, 10px gap. Active language underlined with a 1px border-bottom in #1e1f1f. No background, no border, no color change — selection is communicated by the underline rule alone.

### Scroll Indicator
**Role:** Below-fold affordance

Small circular icon at bottom-right of viewport, parchment canvas with 1px #1e1f1f border, 30px diameter. Suggests vertical continuation without arrow language.

## Do's and Don'ts

### Do
- Set display headlines at 215px with line-height 0.77 (Gunsan 600) or 1.30 (Lausanne 200) — never scale down to 'fit'; if it doesn't fit, the layout is wrong
- Use 180px horizontal padding on the page canvas to preserve the gallery-wall negative space
- Make every bordered interactive element a 1440px-radius pill — rectangles are not in the system
- Let 30px radius be the only non-pill corner radius in the entire interface (reserved for cards and image containers)
- Use weight 200 Lausanne for display when the page should feel like exhibition text; switch to Gunsan 600 when the page should feel like a magazine cover
- Keep the palette to two tones — Parchment canvas and Carbon Ink — and let weight + scale carry hierarchy instead of adding a third color
- Let 3D sculptural objects cast soft shadows on the canvas; the rest of the UI is shadowless

### Don't
- Never add accent colors (blue, red, green) for CTAs, alerts, or status — the system is binary and a chromatic action would break the editorial register
- Never use 0–8px corner radius on cards, modals, or image containers — only 30px or 1440px are permitted
- Never apply box-shadow to UI components — shadows belong only to the 3D sculptural elements
- Never set body type above 15px or below 12px — the type system jumps from reading size to monument size with nothing in between
- Never use line-height above 0.85 on display headlines; the 0.77–0.80 range is what creates the stacked, condensed drama
- Never add background fills to nav or buttons by default — borders and text alone carry the visual weight
- Never introduce gradients, patterns, or texture overlays on the canvas — the parchment tone is the only surface treatment

## Elevation

- **Sculptural 3D Object:** `0 30px 60px rgba(30,31,31,0.08), 0 10px 20px rgba(30,31,31,0.04)`

## Surfaces

- **Parchment Canvas** (`#dbd6d0`) — The dominant page background — warm bone, never pure white
- **Ink Plate** (`#1e1f1f`) — Dark inset sections, inverse cards, and any surface that needs to recede behind Carbon Ink text

## Imagery

Imagery is dominated by large, organic 3D-rendered sculptural forms in the same warm cream hue family as the canvas. These objects are not product photography or illustration — they are abstract, biomorphic shapes (twisted ribbons, soft pods, melted geometries) rendered in matte cream with soft subsurface lighting. They float behind and around display type, partially overlapping, and treat the page as a shallow 3D stage. There is no human photography, no lifestyle imagery, no UI screenshots. The objects function as atmosphere and texture, not explanation.

## Layout

Full-bleed canvas with 180px horizontal gutter; content is never constrained to a max-width container. The hero is a centered or slightly off-center display headline at 215px with no supporting copy above the fold, set against floating 3D sculptural forms. Section rhythm is minimal — one editorial spread per screen, with generous 60px+ vertical breathing room between sections rather than alternating bands. Navigation is a single transparent top bar with brand-left and nav-right, never sticky-elevated, never shadowed. The overall density is sparse and museum-like: each screen contains one typographic moment and one sculptural moment, separated by silence.

## Similar Brands

- **Pentagram** — Same binary palette discipline — black type on warm off-white with monumental serif display and museum-scale negative space, no chromatic accents in the system
- **Locomotive (MTL)** — Editorial agency aesthetic with sculptural 3D forms floating behind oversized serif headlines, treating the page as a typographic plate rather than a UI
- **Resn** — Experimental agency sites that treat display type as the only content and use 3D/atmosphere as supporting texture rather than explanatory imagery
- **Bureau Cool** — Portfolio-first agency sites with hairline serif display weights at extreme scale, warm neutral canvases, and zero conventional UI color language
