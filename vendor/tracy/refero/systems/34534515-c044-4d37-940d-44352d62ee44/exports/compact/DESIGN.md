# Ashton Bespoke — Style Reference
> Stone cathedral of craftsmanship — warm parchment surface, one whisper of burgundy, letterspaced serif that breathes.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ashton Bespoke operates as an editorial gallery for craftsmanship rather than a traditional website: a warm parchment canvas, one custom serif voice, and near-zero UI chrome. The entire palette collapses to stone, ink, and white with a single restrained wine note reserved for footer gravity and atmospheric emphasis. Photography carries the brand — full-bleed workshop imagery with no decorative overlay competes with nothing because the interface refuses to compete back. Generous negative space, hairline borders, and letterspaced serif headlines give every page the cadence of a printed monograph.

## Colors

| Name | Value | Role |
|------|-------|------|
| Burnt Wine | `#38141b` | Footer background, sectional dark bands, atmospheric accent — the sole chromatic note in an otherwise achromatic palette, used sparingly to anchor gravity |
| Ink Stone | `#262626` | Primary text, hairline borders, image frames, nav links — the structural near-black that defines every edge and label |
| Warm Parchment | `#e0ded8` | Dominant page canvas, section backgrounds, card surfaces — warm stone tone that gives the site its gallery-like, hand-made feel |
| White | `#ffffff` | Elevated surfaces, inverted text on dark sections, nav text over imagery, subtle highlight washes |

## Typography

### Arial — Body text fallback — sparse usage suggests it appears in long-form paragraphs where readability supersedes brand expression
- **Substitute:** Helvetica, system-ui sans-serif
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.10

### Legquinne VF — Display and heading serif — the single voice of the brand. Variable font allows optical weight tuning per context. Custom typeface; no system equivalent.
- **Substitute:** Cormorant Garamond, Playfair Display, or EB Garamond at weight 500
- **Weights:** 500
- **Sizes:** 32px, 46px, 60px
- **Line height:** 1.10
- **Letter spacing:** 0.017em (32px), 0.022em (46px), 0.031em (60px) — unusually wide tracking for a serif, gives headlines an engraved, hand-set quality
- **OpenType features:** `'liga' on`

### Basis Grotesque Pro — Navigation links, small caps-style captions, and compact body labels — the quiet supporting sans that stays out of the serif's way
- **Substitute:** Inter, Work Sans, or Söhne
- **Weights:** 400, 500
- **Sizes:** 15px, 18px
- **Line height:** 1.00–1.40
- **Letter spacing:** 0.021em at 15px

### Basisgrotesquepro 500 — Basisgrotesquepro 500 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.1
- **Letter spacing:** 0.021

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 15px | 1.1 | 0.32px |
| subheading | — | — | 18px | 1.3 | — |
| heading | — | — | 32px | 1.1 | 0.54px |
| heading-lg | — | — | 46px | 1.1 | 1.01px |
| display | — | — | 60px | 1.1 | 1.86px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 120px
- **Card padding:** 32px
- **Element gap:** 24px

### Border Radius

- **tags:** 4px
- **cards:** 0px
- **images:** 0px
- **buttons:** 4px

## Components

### Full-Bleed Cinematic Hero
**Role:** Opening statement section

Full-viewport dark video or still image with large letterspaced serif headline centered. No navigation chrome, no CTA, no eyebrow — just imagery and one line of text. Headline at 60px Legquinne VF, white (#ffffff), tracking 0.031em. Nav floats transparently over the imagery in white.

### Monogram Brand Mark
**Role:** Brand identity anchor

Interlocking 'AB' serif ligature, 60–80px, centered, #262626 on parchment. Functions as both a visual rest and a brand signature between content sections.

### Editorial Statement Block
**Role:** Centered mission/manifesto display

Centered column on parchment. Serif headline at 46px Legquinne VF, line-height 1.10, tracking 0.022em, #262626. Caption below in Basis Grotesque Pro 15px, tracking 0.021em. No dividers, no icons, pure typography.

### Split Image-Text Section
**Role:** Two-column editorial layout

50/50 split with text left, image right (or alternating). Text column: heading 46px serif, body 16px sans-serif at line-height 1.40, multiple short paragraphs separated by 16–24px gaps. Image edge-to-edge, no border-radius, no caption.

### Transparent Top Navigation
**Role:** Site navigation

Fixed or absolute nav bar with no background, no border, no shadow. Logo 'ASHTON BESPOKE' in tracked sans (Basis Grotesque Pro 18px, tracking 0.022em) at far left. Four text links at far right in same typeface, 12–18px gap between items. Text is white when over dark imagery, ink (#262626) when over parchment.

### Hairline-Bordered Image Frame
**Role:** Image presentation

Photographs wrapped in 1px solid #262626 borders. The border is the frame — no shadow, no radius, no caption overlay. The image sits flush on the canvas.

### Wine Footer
**Role:** Closing section

Full-bleed #38141b band at page bottom. Text in #ffffff, same serif and sans pairing as rest of site. Functions as the only chromatic moment on the site — a final tonal note before the user leaves.

### Underlined Inline Link
**Role:** Text-level navigation

1px solid underline offset 1–3px from baseline. Color #262626 on parchment, #ffffff on dark. No color change on hover — the underline may shift weight or the link may reveal a second line of text below.

### Section Anchor Tag
**Role:** Section divider indicator

Small Basis Grotesque Pro 15px label, tracking 0.021em, centered, positioned above major content sections. Functions as an editorial chapter mark rather than a navigation element.

## Do's and Don'ts

### Do
- Set headlines in Legquinne VF (or Cormorant Garamond) at 32–60px with tracking between 0.017em and 0.031em — the wide letter-spacing is signature, not optional
- Use #e0ded8 as the dominant canvas for at least 60% of the page; it is the brand's defining surface
- Reserve #38141b exclusively for the footer or at most one dark section per page — its power depends on scarcity
- Keep interfaces borderless or use 1px solid #262626 hairlines only; never apply shadows, gradients, or rounded corners larger than 4px to UI elements
- Let photographs be full-bleed or edge-to-edge with no decorative frame beyond a 1px border; the image is the component
- Use generous vertical rhythm: 80–120px between sections, 24–32px between text blocks — editorial spacing, not app spacing
- Pair the serif display with Basis Grotesque Pro for all navigation, labels, and captions; never substitute a slab or geometric sans

### Don't
- Do not introduce bright or saturated colors — the palette is deliberately achromatic with one wine note
- Do not apply border-radius larger than 4px to cards, images, or buttons; the editorial feel requires sharp geometry
- Do not use shadows, glows, or blur effects on any UI element; depth comes from photography and spacing, not elevation
- Do not set the serif below 24px or above 60px — the typeface is designed for display scale, not body or billboard
- Do not center body paragraphs or use justified text; body copy is left-aligned at line-height 1.40
- Do not add icons, badges, tags, or decorative elements; the site is typographic and photographic, not symbolic
- Do not use button fills or background colors on interactive elements; links are text-only with underlines

## Elevation

The design intentionally avoids all shadows and depth effects. Flatness is the philosophy — surfaces are distinguished by color (parchment → white → wine) and whitespace, never by elevation. The only depth cue permitted is a 1px solid #262626 hairline border for image framing.

## Surfaces

- **Parchment Canvas** (`#e0ded8`) — Primary page background — warm stone field that dominates most sections
- **White Surface** (`#ffffff`) — Elevated blocks, card surfaces, contrast breaks within parchment sections
- **Wine Ground** (`#38141b`) — Footer and dark band backgrounds — rare inversion that signals end of page

## Imagery

Photography is the primary visual language. Full-bleed workshop imagery dominates the hero and key sections — close-cropped hands-on-tools shots, material textures (raw timber, leather, metal), and process documentation. The aesthetic is high-key warm and editorial: natural light, shallow depth of field, muted earth tones, no lifestyle staging. Images are always presented edge-to-edge or with a 1px ink border, never rounded or masked. The mood is documentary-craftsman, not luxury-catalogue. There is no illustration, no 3D rendering, no abstract graphics — the work itself is the only visual that matters.

## Layout

Full-bleed editorial layout with no max-width container. The hero is a full-viewport video or still image with a single centered serif headline. Subsequent sections are split-screen (50/50 text + image), centered statement blocks on parchment, and occasional full-width image breaks. The navigation is transparent and floats over the hero, then settles into parchment sections. Vertical rhythm is dramatic: 80–120px between sections, with most sections breathing through 40–60% of their height as negative space. The grid is implicit — no visible columns, no card grids, no pricing tables. Information density is low: one headline, one image, two or three short paragraphs per section. The site reads top-to-bottom like a magazine spread.

## Similar Brands

- **Aesop** — Same warm-stone-and-ink palette, same editorial restraint, same reliance on full-bleed photography and near-zero UI chrome
- **Boffi** — Luxury Italian joinery brand using similar parchment canvas, letterspaced serif headlines, and full-bleed workshop photography
- **House of Hackney** — British luxury craft brand with cream editorial layouts, custom serif display type, and hairline-bordered image presentation
- **Loro Piana** — Same quiet-luxury language: warm neutral canvas, single deep accent color, letterspaced serif, and photography that does the brand work
