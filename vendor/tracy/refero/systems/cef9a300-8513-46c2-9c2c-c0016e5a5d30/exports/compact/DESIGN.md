# Cards Against Humanity — Style Reference
> Apocalypse broadcast on blackout paper

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Cards Against Humanity's Climate Catastrophe Pack deploys an emergency-broadcast aesthetic: a pitch-black canvas saturated with flat, vivid red as the only chromatic signal. Typography does almost all of the heavy lifting — an extreme condensed display face (Spektra) stacked in 200+ px blocks creates poster-sized alarm, while the body text is a quiet, humanist sans (Helvetica Neue) that reads like a caption on a civil defense poster. The page is content-sparse and editorial: no dashboards, no product cards, no marketing chrome — just a large headline, centered prose, and scattered red hazard glyphs orbiting a radar/concentric-circle motif. Color is used surgically: cream for almost all readable text, red reserved for annotations (strikethrough corrections, underlined links, flame graphics, icon squares), with the red itself functioning less as decoration than as a wayfinding color for 'pay attention here.' There is essentially no elevation system, no soft cards, no shadows — the design rejects SaaS niceties in favor of a printed-flyer feel where information sits directly on the black page like ink on a wall.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, body borders, all text in dark contexts — the default background every other element sits on |
| Bone Cream | `#ebe4d8` | Primary text color, button fills, surface highlights — warm off-white that reads as paper, not screen white |
| Ash Taupe | `#c3bdb3` | Button box-shadow tint — the single warm-gray accent in the system |
| Alarm Red | `#ff4034` | Hazard icons, strikethrough editorial links, flame illustrations, concentric radar rings — the only chromatic signal in the system, reserved for things requiring attention |

## Typography

### Spektra — Display and heading face — extremely condensed, near-black weight even at 400, used for the campaign title and brand wordmark at poster sizes
- **Substitute:** Bebas Neue, Anton, League Gothic
- **Weights:** 400
- **Sizes:** 32px, 40px, 100px, 202px
- **Line height:** 0.82–1.00

### Helvetica Neue LT — Body, subheadings, UI text — quiet humanist sans at 400 for body, 800 for emphasized subheads and footer marks
- **Substitute:** Inter, Helvetica, Arial
- **Weights:** 400, 800
- **Sizes:** 14px, 16px, 28px, 30px
- **Line height:** 1.27–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.27 | — |
| body | — | — | 16px | 1.27 | — |
| subheading | — | — | 28px | 1.5 | — |
| heading-sm | — | — | 30px | 1.5 | — |
| heading | — | — | 40px | 0.88 | — |
| heading-lg | — | — | 100px | 0.88 | — |
| display | — | — | 202px | 0.82 | — |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 680px
- **Section gap:** 80px
- **Card padding:** 30px
- **Element gap:** 20px

### Border Radius

- **card:** 2520px
- **input:** 10px
- **button-lg:** 120px
- **button-md:** 80px
- **button-sm:** 48px

## Components

### Apocalypse Display Headline
**Role:** Hero title block

Spektra 202px, line-height 0.82, Bone Cream (#ebe4d8), centered. Stacks across up to 3 lines with near-zero leading so the letters touch. The defining signature: massive condensed display on a black field.

### Brand Wordmark
**Role:** Small siteline above the display headline

Spektra 32–40px, Bone Cream, centered, single line. Reads as the campaign attribution rather than a logo lockup.

### Body Prose Block
**Role:** Long-form campaign copy

Helvetica Neue 16px, line-height 1.27, Bone Cream, centered, max-width ~680px. Sentence case throughout, no paragraph indentation, generous 30px bottom margin between paragraphs.

### Underlined Link
**Role:** Inline reference link inside body copy

Bone Cream (#ebe4d8) text, 1px cream underline, no hover color shift. Standard editorial link.

### Strikethrough Editorial Link
**Role:** Satirical or corrected inline link

Alarm Red (#ff4034) text, 1px red line-through applied as a typographic annotation rather than deletion. The signature 'correction' device — it's the only place red appears in body type.

### Hazard Icon Marker
**Role:** Decorative attention glyph

16–24px Alarm Red square with a white hazard symbol (radiation, biohazard, fire, skull) inset. Scattered at fixed orbital radii around the concentric-circle radar. Sits on black with zero padding around the symbol.

### Radar Concentric Field
**Role:** Background decorative motif for hero

Four to six concentric rings in Alarm Red at decreasing opacity, alternating solid and 2px dashed strokes. Ring diameters scale from viewport-center outward. No interactive function — purely atmospheric.

### Flame Footer Illustration
**Role:** Section terminator graphic

Flat Alarm Red flame silhouettes along the bottom edge of the page, 100–160px tall, bleeding off the viewport. Black background shows through the gaps between tongues. No gradient, no detail — pure silhouette.

### Pill Button (Large)
**Role:** Primary call-to-action

Bone Cream fill, black text, Helvetica Neue 16px weight 800, padding 20px 60px, border-radius 120px. Box-shadow 0 4px 0 #c3bdb3 — the only shadow in the system, hard-edged, no blur. Feels stamped, not floated.

### Pill Button (Compact)
**Role:** Secondary action

Same fill and shadow as the large button, padding 7px 15px, border-radius 80px. Used for inline form submits or footer actions.

### Text Input
**Role:** Form field

1px Bone Cream border, 10px radius, Bone Cream text, black fill, padding ~20px horizontal. No focus ring — the border simply thickens or inverts on focus.

### Blob Card
**Role:** Fully rounded content container

Border-radius 2520px — effectively a fully rounded organic blob. Used sparingly as a highlight surface when the page needs a cream 'paper' resting on the black canvas.

## Do's and Don'ts

### Do
- Use Spektra at 100–202px for any headline that needs to read as a campaign poster; let the line-height drop to 0.82 so characters collide
- Keep all readable text in Bone Cream (#ebe4d8) on Void Black (#000000) — the 16.6:1 contrast is the system's foundation
- Reserve Alarm Red (#ff4034) for annotation, hazard, and link layers — never as a background fill for body content
- Default to centered single-column layouts with a ~680px max-width for prose; the page is editorial, not dashboard
- Use border-radius 120px for primary buttons and 2520px for the rare container card — there are no 4–8px radii in this system
- Pair every filled button with the hard 0 4px 0 #c3bdb3 offset shadow; no soft drop-shadows anywhere
- Treat the radar/circle motif and flame illustrations as recurring page furniture — reuse the Alarm Red concentric ring set on any full-bleed dark section

### Don't
- Don't introduce a second chromatic accent — red is the only signal color and dilution destroys the alarm-broadcast feel
- Don't set Spektra below 32px; the face is unreadable at body sizes and breaks the system
- Don't use neutral grays (#777, #aaa) for text or borders — go from black to Bone Cream directly
- Don't apply border-radius under 10px to any surface; the system relies on extreme roundness or none at all
- Don't add card shadows, hover lifts, or transitions longer than ~150ms — the design is print, not app
- Don't center-align body paragraphs wider than 680px; longer line lengths destroy the poster rhythm
- Don't use photography or gradients — the visual language is flat, two-color graphic editorial only

## Elevation

- **Pill Button:** `0 4px 0 #c3bdb3`

## Surfaces

- **Blackout Canvas** (`#000000`) — Full-bleed page background — every section sits directly on black with no separator
- **Bone Paper** (`#ebe4d8`) — Highlight/button surface for inverted controls

## Imagery

Pure flat graphic editorial — no photography, no 3D, no gradients. The visual vocabulary is two-tone: Alarm Red shapes and glyphs on a black field. Hazard-icon squares (radiation, biohazard, fire, skull) appear as scattered attention markers; flame silhouettes bleed along section edges as terminator graphics; concentric red rings form a radar/sensor overlay behind the hero. Icons are uniformly 16–24px white symbol inside a solid red square. Imagery is decorative-atmospheric rather than explanatory — it signals 'emergency broadcast' rather than illustrating the product.

## Layout

Single centered column, ~680px max-width, with full-bleed decorative layers behind the content. The hero is a viewport-height black field with the radar concentric ring pattern radiating from center and the massive Spektra headline stacked over it. Body sections drop into a tighter 680px centered prose column on the same black background — no alternating light/dark bands, no cards, no sidebars. Navigation is minimal (likely a small footer mark) and never competes with the content. Decorative elements (hazard icons, flame graphics) sit at the page margins or bleed off the bottom edge, framing the centered text like editorial layout rather than grid. The rhythm is: massive poster → tight prose → flame terminator → next section. Spacing is generous — 80px between major sections, 30px between paragraphs.

## Similar Brands

- **VICE** — Same editorial dark canvas with a single high-saturation accent color and oversized condensed display type for section titles
- **Patagonia (activism pages)** — Print-poster aesthetic, hard-edged shadows, and centered editorial copy rather than SaaS card grids
- **The Outline** — Bold condensed display headlines over a flat dark background with minimal UI chrome and prose-first layout
- **Adbusters** — Civil-defense alarm vocabulary — flat red-on-black, hazard iconography, radar/concentric ring motifs, no soft shadows
