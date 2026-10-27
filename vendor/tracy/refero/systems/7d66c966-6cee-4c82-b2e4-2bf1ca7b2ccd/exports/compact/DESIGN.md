# Iad-lab — Style Reference
> art-school exhibition on charcoal

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Iad-lab operates as a digital exhibition wall rather than a conventional website: a near-black canvas interrupted by full-bleed photographic panels and two colossal display words that bleed past the viewport edges. The palette is essentially binary — off-white on charcoal — with zero chromatic decoration, letting the photography carry all emotional and visual weight. Navigation is reduced to three floating dots on the right margin; there is no header bar, no menu, no buttons. Typography does the structural work: a single grotesk family at restrained sizes handles all UI copy while an enormous, rounded display face delivers program titles at architectural scale. The rhythm is gallery-like: wide quiet sections, then sudden full-bleed visual ruptures, then quiet again.

## Colors

| Name | Value | Role |
|------|-------|------|
| Charcoal Canvas | `#222222` | Page background, the dominant surface across all sections and the base layer behind full-bleed photography |
| Bone | `#f8f8f8` | All body text, meta labels, navigation dots, and the dominant hairline border color — serves as the single foreground tone in this near-monochrome system |
| Graphite | `#2a2b2d` | Secondary icon strokes, subtle list dividers, and muted fill details — sits one step darker than the canvas for low-contrast decoration |
| Ash | `#757577` | Inactive or resting state for navigation dots and quiet UI affordances |

## Typography

### Neue Haas Unica — The sole text family for all UI copy: meta labels at 16px, body at 18px, list/links at 24px, subheadings at 27px, section headings at 36px. Weight 400 is default; 700 is reserved for emphasis in the meta block and active labels. The 1.10 lineHeight on 36px headings creates tight, architectural vertical rhythm.
- **Substitute:** Neue Haas Grotesk Display Pro, Inter, Helvetica Neue
- **Weights:** 400, 700
- **Sizes:** 16px, 18px, 24px, 27px, 36px
- **Line height:** 1.10, 1.25, 1.30, 1.35
- **Letter spacing:** normal

### Display (custom or system fallback) — Reserved exclusively for the two program words ('IMAGINE', 'PROGRAM') that span the full viewport width and bleed past both edges. This face is wide, heavy, with rounded terminals — it is the visual signature of the entire site and carries the brand's identity more than any other element. When recreating, use a heavy extended grotesque (e.g. Obviously Wide Black, Neue Machina Black) at a size that forces letter cropping at the viewport edges.
- **Substitute:** Obviously Wide Black, Neue Machina Pop, Cooper Black Extended
- **Weights:** 900 (Black/Heavy)
- **Sizes:** 
- **Line height:** 0.85

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.3 | — |
| body | — | — | 18px | 1.35 | — |
| subheading | — | — | 24px | 1.3 | — |
| heading-sm | — | — | 27px | 1.25 | — |
| heading | — | — | 36px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **tags:** 20px
- **cards:** 20px
- **inputs:** 20px
- **buttons:** 20px

## Components

### Full-Bleed Program Word
**Role:** Brand-defining display heading

The two largest typographic elements on the site. Set in a heavy, wide, rounded display face at 200px+ (fluid). Sized to overflow the viewport horizontally — 'IMAGINE' and 'PROGRAM' are both intentionally cropped at left and right edges. Color is always #f8f8f8. No padding, no margin — sits flush against the viewport top. This is not a heading; it is an architectural element.

### Meta Label Block
**Role:** Contextual site identity

Fixed top-left cluster: four lines of text reading 'Interaction / Design / Lab / Bern — 25'. Set in Neue Haas Unica 16px weight 400, line-height 1.30, color #f8f8f8. No background, no border, no container — text floats directly on the dark canvas or photography. Sits at approximately 16px from the left edge and 16px from the top.

### Section Navigation Dots
**Role:** Sole navigation control

Three small circles vertically stacked on the right margin, approximately 24px from the right edge and vertically centered. Active dot is filled #f8f8f8 (8px diameter), inactive dots are outlined #f8f8f8 with transparent fill. This is the only navigation — no menu bar, no hamburger, no links bar.

### Full-Bleed Photographic Panel
**Role:** Visual content section

Edge-to-edge image or video panels that span 100vw with no border-radius, no padding, no margin. Images are abstract, high-saturation, large-scale (pink petal, amber paper, red 3D). The panel height varies but typically fills 70-100vh. The dark charcoal canvas (#222222) is only visible between panels as breathing space.

### List Item with Hairline Border
**Role:** Content links or project entries

Each list item separated by a 1px solid #f8f8f8 bottom border (used 248 times in the data — the dominant border usage). Text in #f8f8f8, Neue Haas Unica 24px weight 400. No background, no hover fill change indicated. 20px border-radius available for interactive containers but not applied to border lines themselves.

### Rounded Interactive Surface
**Role:** Buttons, tags, or clickable chips

When interactive elements appear, they use 20px border-radius — the dominant radius token. On the dark canvas, these would be transparent fills with 1px #f8f8f8 borders (the 'neutral-action-border-not-distinct-CTA' pattern). 16-24px horizontal padding, 10-15px vertical padding. No drop shadows, no gradients.

### Quiet Text Section
**Role:** Interstitial content between visual panels

Blocks of body text on the bare #222222 canvas with no container. Max-width is unrestricted (full-bleed layout), so text columns are short — likely 4-6 words per line. Neue Haas Unica 18-24px, line-height 1.30-1.35, color #f8f8f8. The emptiness around the text is as important as the text itself.

## Do's and Don'ts

### Do
- Use #f8f8f8 for all text and borders; #222222 is the only background. This binary is the system.
- Apply 20px border-radius to any rounded element — buttons, tags, chips, containers. Never use sharp corners on interactive surfaces.
- Set the display heading to overflow the viewport. The wordmark must bleed past both left and right edges — if all letters are fully visible, it is too small.
- Use Neue Haas Unica weight 400 as default; reserve weight 700 for active or emphasized labels only. Do not mix intermediate weights.
- Separate list items with 1px solid #f8f8f8 bottom borders. This hairline divider is the primary structural separator in the system.
- Use 24px as the default element gap and 16px as the tight gap. Maintain the 4px base unit for all spacing decisions.
- Let photography fill 100vw with zero padding or border-radius. Full-bleed is non-negotiable for visual panels.

### Don't
- Do not introduce any color beyond the four neutrals (#222222, #f8f8f8, #2a2b2d, #757577). Chromatic accents are forbidden.
- Do not add drop shadows, gradients, or glow effects. Elevation is communicated through photography scale, not CSS shadows.
- Do not add a traditional navigation bar, header, or footer chrome. The meta label and dot navigation are the entire structural frame.
- Do not center text in narrow columns. Text should be short, left-aligned, and surrounded by generous negative space.
- Do not use border-radius values other than 15px or 20px. Avoid 4px, 8px, or fully rounded (9999px) — neither matches the system's geometric language.
- Do not set the display heading at a size where all letters fit within the viewport. The cropping is intentional and defines the visual identity.
- Do not use line-height above 1.35 for body text or below 1.10 for headings. The tight heading leading creates the architectural feel.

## Elevation

The system has no elevation. There are no card surfaces, no floating panels, no modals, no tooltips with shadows. Hierarchy is achieved entirely through typographic scale, photographic scale, and the hairline 1px #f8f8f8 border. A surface either IS the full viewport (photography) or it IS the canvas (text). There is no middle layer.

## Surfaces

- **Charcoal Canvas** (`#222222`) — The base layer — page background and the surface visible between photographic panels
- **Photographic Surface** (`#222222`) — Full-bleed image/video panels that replace the canvas at section boundaries. Same hex but visually distinct due to content.
- **Text Surface** (`#222222`) — No actual elevated surface — text sits directly on the canvas or photography. The 'elevation' is purely typographic scale.

## Imagery

Full-bleed abstract photography dominates the visual language. Images are large-scale, high-saturation, and fill 100vw with no padding or border-radius. The subject matter is abstract and material: close-up flower petals in pink/magenta, folded paper or fabric in amber/orange, a 3D geometric form in deep red. No people, no products, no UI screenshots. The images function as environmental mood rather than informational content — they set emotional temperature between quiet text sections. Treatment is raw, unedited, with natural lighting and shallow depth of field. The photography is the only source of color in the entire system.

## Layout

Full-bleed, edge-to-edge layout with no max-width container. The page reads as a vertical sequence of full-viewport sections: display wordmark → meta text → full-bleed photo → dark interstitial text → full-bleed photo → next display wordmark. The two program words ('IMAGINE', 'PROGRAM') are each given their own full-viewport section with the text bleeding past the edges. Navigation is three vertical dots on the right margin — no header bar, no hamburger menu, no footer. Content is positioned with precise edge alignment: meta text at 16px from top-left, nav dots at 24px from right edge, vertically centered. The grid is invisible — there is no column system, only viewport-edge alignment and generous negative space.

## Similar Brands

- **Pentagram** — Same editorial-agency approach: massive display type, zero navigation chrome, photography as structural element, dark or neutral canvas with full-bleed sections
- **Bauhaus Archive Berlin** — Same art-institution restraint — display typography that functions as architecture, photography at viewport scale, and a near-monochrome palette that lets content carry weight
- **Tate Modern exhibition pages** — Same gallery catalog rhythm: quiet text sections punctuated by full-bleed visual panels, minimal UI chrome, type-led hierarchy
- **Studio Dumbar** — Same Dutch design-school discipline: single grotesk family, tight heading leading, generous negative space, and the confidence to leave screens mostly empty
