# Monte — Style Reference
> rust-tinted coastal morning

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Monte Café is a sun-baked coastal café language: a single dominant terracotta field floods the hero like rusted corten steel under a Newcastle morning, then dissolves into warm cream interiors and café photography. The design is built on two surfaces only — terracotta and cream — and a single serif face (Riposte) that does all the talking, from eyebrow labels to display headlines. Apercu Mono appears as small functional print for metadata, hours, and temperature. The mood is hand-drawn and human: line-art illustrations, curved headline text wrapping circular forms, pill-shaped ghost buttons, and generous breathing room. There are no shadows, no gradients, no decorative chrome — just ink, warmth, and white space.

## Colors

| Name | Value | Role |
|------|-------|------|
| Corten | `#b84b30` | Primary brand color — hero field, headline text, icon strokes, pill button borders, link accents. The defining rust-orange that makes every page read as Monte |
| Bordeaux | `#5f1d1a` | Deep brand accent for SVG illustration fills and occasional link hover. Used sparingly as a deeper register of Corten |
| Sandstone | `#f8f4e9` | Primary canvas — body section backgrounds, card surfaces, text on terracotta fields. The warm cream that carries every page after the hero |
| Driftwood | `#e5e7eb` | Hairline borders, dividers, and card outlines. A barely-there neutral that separates without shouting |
| Charcoal | `#000000` | Line-art illustration strokes, icon fills, inline pictograms. Pure black for hand-drawn elements on the cream canvas |
| Bone | `#ffffff` | Pure white for text on terracotta fields, button text, image overlays. Also appears as subtle borders |
| Smoke | `#666666` | Muted helper text, secondary metadata, quiet body copy. Reads as a soft gray against Sandstone |
| Ash | `#999999` | Lowest-priority neutral — image metadata, placeholder tones. Sits behind Smoke in the hierarchy |
| Espresso | `#3e3d3a` | Dark surface for badge backgrounds, occasional deep contrast blocks. A near-black warm brown |

## Typography

### Riposte — Primary serif face — all headlines, display text, navigation, buttons, body copy. Riposte carries the entire brand voice with its warm geometric serif character. Weight 400 for body and most text, weight 600 reserved for display headlines. The wide tracking at 0.10em on uppercase labels (HELLO & GOOD MORNING) is a signature move — the serif breathes in all-caps, unlike most modern sans-serif systems that tighten.
- **Substitute:** DM Serif Display or Playfair Display
- **Weights:** 400, 600
- **Sizes:** 10, 11, 12, 13, 14, 15, 16, 17, 20, 23, 24, 36
- **Line height:** 0.90, 1.00, 1.10, 1.20, 1.25, 1.35, 1.40
- **Letter spacing:** 0.025em at 12px, 0.05em at 16px, 0.10em at 24px+

### Apercu Mono — Monospace secondary face — timestamps (TOMORROW FROM 6:30AM), temperature readouts (NEWCASTLE 22°C), input fields, and quiet data labels. Slight negative tracking tightens the mono for functional data display. Creates a typographic counterpoint to the serif — the serif speaks, the mono measures.
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 12, 15, 16
- **Line height:** 1.33, 1.35
- **Letter spacing:** -0.025em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.25px |
| body | — | — | 16px | 1.35 | 0.8px |
| subheading | — | — | 20px | 1.25 | — |
| heading-sm | — | — | 24px | 1.2 | 2.4px |
| heading | — | — | 36px | 1.1 | 3.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 20px

### Border Radius

- **cards:** 14px
- **inputs:** 9999px
- **buttons:** 9999px

## Components

### Pill Outlined Button
**Role:** Primary action — 'Book a Table', navigation CTAs

Transparent background, 1.5px solid #b84b30 border, 9999px border-radius, Riposte weight 400 at 15px with 0.75px tracking, #b84b30 text, 16px vertical / 32px horizontal padding. The border IS the action — no fill, no shadow. Text and border share the same Corten hue.

### Ghost Nav Link
**Role:** Header navigation — MENU, BOOK A TABLE

No background, no border, Riposte weight 400 at 12px, #f8f4e9 (Bone) text on terracotta, 0.6px tracking uppercase. Sits flush left and right of the centered wordmark. Minimal, almost invisible until hovered.

### Centered Wordmark
**Role:** Brand mark in navigation

'monte' in Riposte, lowercase, weight 400, ~24px, #f8f4e9 on terracotta / #b84b30 on cream. The only logo treatment — no icon, no tagline. Its serifs and weight carry the entire brand identity.

### Curved Headline Text
**Role:** Hero text wrapped around illustration

Display text at ~36px Riposte weight 600, #f8f4e9, following a circular path (SVG textPath). Tagline reads 'WHERE COFFEE MEETS THE COAST' wrapping the line-art figure. The curve is the signature — type as illustration, not just copy.

### Line-Art Illustration
**Role:** Decorative hero graphic, inline content visuals

Hand-drawn continuous-line style, ~3px stroke weight, #5f1d1a (Bordeaux) on terracotta / #000000 on cream. Figures are people drinking from cups, holding mugs. No fills, no shading — pure contour. Acts as both decoration and brand mark.

### Eyebrow Label
**Role:** Section openers — 'HELLO & GOOD MORNING'

Riposte weight 400, 24px, #b84b30, uppercase, 2.4px tracking. Centered above section headlines. Wide tracking on the serif is the most distinctive typographic gesture in the system — it makes the label feel like a stamp or a printed card.

### Display Headline
**Role:** Section titles — 'MONTE IS FOR LAIDBACK BREKKIES...'

Riposte weight 600, 36px, #b84b30, centered, line-height 1.10, tracking 3.6px uppercase. Sits below eyebrow label with generous gap. The weight-600 Riposte at this size is the loudest the system ever gets.

### Full-Bleed Hero Section
**Role:** Opening viewport

100% width, 100vh height, #b84b30 background, centered illustration with curved text. No card, no frame — the entire screen IS the hero. Padding 0. Navigation floats over the top with 24px margins.

### Content Image Block
**Role:** Interior photography, food shots, lifestyle images

Full-width within max-width container, natural aspect ratio, no border-radius on the main image. Paired with 14px-radius illustration cards beside or below. Images bleed edge-to-edge in the gallery carousel.

### Gallery Carousel
**Role:** Interior photography slider

Single large image with circular prev/next arrow buttons (9999px radius, 1.5px #b84b30 border, centered arrows). Images sit within max-width, no border-radius on the photo itself.

### Card with Illustration
**Role:** Content blocks pairing photo with line-art

Two-column layout: photo left (no radius, natural edges), line-art illustration right at ~300px wide. Both vertically centered. 14px radius only appears on smaller contained cards, not on the full-bleed images.

### Data Badge / Meta Pill
**Role:** Status indicators, small metadata

Pill shape (9999px radius), Riposte 12px weight 400, uppercase, 0.6px tracking. Background varies: #3e3d3a for dark badges, transparent for inline text. Used sparingly for functional labels.

### Circular Nav Button
**Role:** Carousel controls — left/right arrows

40px diameter circle, 1.5px #b84b30 border, transparent fill, Riposte weight 400 arrow glyph centered inside in #b84b30. Matches the pill button language but compressed to a circle.

### Form Input
**Role:** Text inputs, booking fields

Apercu Mono 16px, weight 400, -0.4px tracking, #000000 text on #f8f4e9 background. 9999px border-radius (pill shape), 1px #e5e7eb border. Placeholder in #999999. No focus ring color change — restraint over visual feedback.

## Do's and Don'ts

### Do
- Use #b84b30 for all primary actions as an outlined pill — 9999px radius, 1.5px border, #b84b30 text matching border. Never fill the pill.
- Set display headlines in Riposte weight 600 at 36px with 3.6px tracking in uppercase — the wide-tracked serif caps are the system's signature typographic gesture.
- Pair every section with a centered uppercase eyebrow label in Riposte 24px, #b84b30, 2.4px tracking, sitting 20-24px above the headline.
- Use Apercu Mono exclusively for data: times, temperatures, coordinates, input fields. Never for headlines or long-form copy.
- Let the hero bleed full-viewport in #b84b30 with the wordmark centered and nav flush to edges. No container, no card — the screen IS the hero.
- Use 14px border-radius on content cards and 9999px on buttons, inputs, and badges. This two-radius system is the entire shape language.
- Use line-art illustrations with 3px continuous strokes in #5f1d1a on terracotta fields and #000000 on cream. No fills, no shading.

### Don't
- Don't use shadows or elevation effects. The system is flat — depth comes from the terracotta-to-cream surface transition, not from drop shadows.
- Don't introduce a third surface color. The palette is exactly two: #b84b30 and #f8f4e9. Everything else is neutrals for text and borders.
- Don't fill buttons with solid color. All actions are ghost/outlined — the border carries the weight.
- Don't use Riposte for body paragraphs longer than 2 lines. The wide tracking that makes it beautiful in caps becomes exhausting in running text — switch to a system serif for long-form.
- Don't add gradients, patterns, or background textures. The surfaces are always flat color fields.
- Don't use #5f1d1a (Bordeaux) for text or UI elements — it's reserved for SVG illustration fills only.
- Don't round image corners. Photography sits with natural edges within the max-width container. The 14px radius applies to cards, not photos.

## Elevation

This system uses no shadows or drop-shadow elevation. Depth is achieved entirely through surface color contrast — the jump from #b84b30 to #f8f4e9 is the only elevation the design needs. Cards and images sit flush on the canvas, distinguished only by content and 14px border-radius on contained elements. This flatness is a deliberate anti-pattern to modern SaaS card-with-shadow conventions; the system trusts typography and color to create hierarchy without artificial lift.

## Surfaces

- **Corten Field** (`#b84b30`) — Full-bleed hero background, section accents, the dominant brand surface
- **Sandstone** (`#f8f4e9`) — Primary content canvas for all post-hero sections
- **Bone** (`#ffffff`) — Image overlays, button text on terracotta, subtle border accents

## Imagery

Photography is documentary café-interior style: warm natural light, terracotta tiles, green plants, wooden surfaces, baristas in motion (deliberate motion blur on one figure). Images are unfiltered, slightly desaturated, and always horizontal landscape orientation. No food close-ups dominate — the space IS the subject. Illustrations are hand-drawn continuous-line figures (people drinking from cups) at ~3px stroke weight, Bordeaux on terracotta fields and black on cream. No icons in the traditional sense — illustrations and type do all the symbolic work. Imagery occupies roughly 40% of the page surface, alternating with generous text blocks.

## Layout

Full-bleed hero (100vw × 100vh) in #b84b30, then content constrained to max-width 1200px centered on #f8f4e9. Navigation is a minimal three-element bar (MENU / wordmark / BOOK A TABLE) floating over the hero with no background. Sections alternate between full-width image carousels and centered text blocks with 80px vertical gaps. The body content follows a pattern of: full-bleed image → centered text intro → two-column image+illustration pairs → more centered text. Grid is implicit rather than explicit — most content is centered single-column, with two-column splits only for image+illustration pairings. No sidebar, no multi-column text flow. The rhythm is: one image, one thought, generous space.

## Similar Brands

- **St. Frank Coffee** — Same rust/terracotta-dominant brand language with serif headlines and documentary café photography
- **Devoción** — Bold single-color full-bleed hero with serif wordmark and generous cream whitespace below
- **Ona Coffee** — Warm earthy brand palette, serif display type, and hand-drawn illustrative accents
- **Pact Coffee** — Outlined pill buttons, single dominant brand color, serif display headlines with wide tracking
