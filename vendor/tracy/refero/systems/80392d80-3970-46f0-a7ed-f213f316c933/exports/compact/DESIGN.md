# Sublime — Style Reference
> white-walled curator's atelier — a quiet gallery where one bold black headline holds the room and a single green object is always the only thing worth picking up

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sublime operates as a digital atelier: vast white walls, a single monumental headline anchoring each view, and collected objects (text snippets, vintage images, 3D renders) that feel curated rather than organized. The palette is 98% achromatic — black on white carries the entire interface, with two whisper-soft washes (pale blue, pale green) and one vivid moss green that punctuates moments of intent. Typography does the structural work: a custom geometric sans at extreme sizes and tight tracking creates headline gravity, while Times New Roman supplies a literary counterpoint for body copy and quotes — the serif/sans collision is deliberate editorial tension, not a system oversight. Layout breathes aggressively — centered compositions, floating collaged elements that overlap and ignore grid lines, generous vertical rhythm. Radii split into two modes: crisp 5px for functional controls, 999px pill for tags and special actions.

## Colors

| Name | Value | Role |
|------|-------|------|
| Moss Green | `#38744d` | Green outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Signal Cyan | `#00aaff` | Blue outline accent for tags, dividers, and focused UI edges. |
| Ice Wash | `#e0f5ff` | Cool surface tint — content card backgrounds, highlight washes; a barely-there blue that hints at a Polaroid shadow without actually adding one |
| Mint Whisper | `#cbffa6` | Warm surface tint — secondary highlight washes, soft card fills; a pale chartreuse that pairs with Moss Green as a lighter sibling |
| Pure Black | `#000000` | Primary text, structural borders, icon strokes — the dominant workhorse (870 uses); never softened to gray, always full ink |
| Graphite | `#181816` | Heading text and icon fills — a near-black with the faintest warm shift, used where Pure Black would feel too clinical (display headings, filled icons) |
| Paper | `#ffffff` | Page canvas, card surfaces, text on dark fills — the gallery wall itself |
| Bone | `#efefef` | Elevated surface, button backgrounds, subtle dividers — the off-white that lets buttons and cards sit forward without using shadow |
| Stone | `#908f8e` | Button borders, secondary borders — medium gray for outlined controls that need definition without weight |
| Fog | `#a29e9c` | Body borders, nav borders, muted body text — the most-used border gray (275 instances); creates the hairline-grid that organizes the page without drawing attention |
| Slate | `#6a6967` | Heading borders, link text, secondary headings — darker than Fog for moments that need more presence than a border but less than a heading |

## Typography

### Control Upright — Primary interface sans — headlines, nav, buttons, body, icons. A single-weight geometric sans that does all structural work. Signature choice: it carries the 142px display headline at weight 400 only, so the extreme size creates weight rather than the font face. The custom stylistic sets ss12 and ss09 are active — these likely adjust letterforms (apertures, terminals) to keep the geometric structure readable at small sizes and dramatic at large.
- **Substitute:** Inter, DM Sans, or Satoshi
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px, 18px, 24px, 28px, 64px, 142px
- **Line height:** 0.90–1.39 (tight 0.90–1.00 at display sizes, opens to 1.39 at body sizes)
- **Letter spacing:** -0.02em at 64px and above, -0.015em at 18–28px, +0.008em at 12–16px
- **OpenType features:** `"ss12" on, "ss09" on`

### Times New Roman — Literary counterpoint — body paragraphs, quotes, editorial text. The intentional clash: a contemporary geometric sans for headlines, a 1930s book serif for body. The serif makes long reads feel like a printed catalog page rather than a SaaS dashboard. ss12 is active, likely for old-style figures and ligatures.
- **Substitute:** Source Serif Pro, EB Garamond, or PT Serif
- **Weights:** 400
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1.20–1.39
- **Letter spacing:** -0.03em at 14px, -0.02em at 16–18px
- **OpenType features:** `"ss12" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.39 | 0.096px |
| body-sm | — | — | 14px | 1.39 | -0.21px |
| body | — | — | 16px | 1.39 | -0.32px |
| body-lg | — | — | 18px | 1.39 | -0.36px |
| subheading | — | — | 24px | 1.16 | -0.48px |
| heading-sm | — | — | 28px | 1.13 | -0.56px |
| heading | — | — | 64px | 1 | -1.28px |
| display | — | — | 142px | 0.9 | -2.84px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 18-25px
- **Element gap:** 15-30px

### Border Radius

- **tags:** 999px
- **cards:** 5px
- **pills:** 999px
- **footer:** 40px
- **buttons:** 5px

## Components

### Green Filled Action Button
**Role:** Primary conversion — the 'try now' entry point in the nav

Moss Green (#38744d) fill, white (#ffffff) text, Control Upright 14px weight 400, letter-spacing -0.21px, 5px radius, 8px vertical / 18px horizontal padding. The green is the only saturated color in the entire interface, so this button is always the loudest object on the page. No hover state needed — the green is already committed.

### Outlined Nav Button
**Role:** Secondary nav action — 'login' in the header

Transparent fill, Stone (#908f8e) 1px border, #000000 text, 5px radius, 8px vertical / 18px horizontal padding. Sits to the left of the green action; its quiet neutrality makes the green feel intentional rather than decorative.

### Pill Tag
**Role:** Label marker for referenced content — 'related', 'reference'

Signal Cyan (#00aaff) background, white text, 999px radius, Control Upright 12px, 4px vertical / 12px horizontal padding. Functions like a Post-it stuck to a clipped image. The cyan against monochrome gives the tag the same weight as a hand-drawn annotation.

### Text Note Card
**Role:** Quoted or saved text content, displayed as a clipped excerpt

Ice Wash (#e0f5ff) or Mint Whisper (#cbffa6) background, #000000 text, Control Upright 14–16px, 18–25px padding, 5px radius. No border, no shadow — the colored fill alone separates it from the canvas. Sometimes contains a Pill Tag at the bottom.

### Image Collage Card
**Role:** Saved visual content — photography, screenshots, prints

White or Paper (#ffffff) surface, Fog (#a29e9c) 1px border, 5px radius, 18px padding around an image fill. Cards are placed at slight offsets and rotations in the collage, not aligned to a grid — the overlap is the signature.

### Navigation Bar
**Role:** Site-wide header — logo left, actions right

Transparent background, 50px padding top, 15px gap between logo and actions. Logo is a small organic bird/leaf mark + 'sublime' wordmark in Control Upright 16px. Actions sit flush right: outlined login button, then green action button, separated by 10px.

### Display Headline
**Role:** Hero and section anchor text

Control Upright 142px (hero) or 64px (section), weight 400, line-height 0.90–1.00, letter-spacing -2.84px at 142px / -1.28px at 64px. Color is Pure Black (#000000). The line-height under 1.0 is critical — it allows the text to feel like a physical object sitting on the page, not floating text in space.

### Quote Block
**Role:** Standalone editorial quote — the 'wtf is a knowledge worker' section

Centered, Stone (#908f8e) text, Control Upright 28px weight 400, line-height 1.13, 200px+ vertical padding above and below. The generous padding makes the quote feel like a wall plaque, not body copy.

### Green Inline Text Block
**Role:** Highlighted body excerpt — the Björk quote card

Moss Green (#38744d) text on Paper (#ffffff) background, Control Upright 14px, left-aligned within a 5px-radius container with no fill. Functions as a pulled quote — the color is the emphasis, no box needed.

### Footer Surface
**Role:** Site footer container

Bone (#efefef) or Paper (#ffffff) background, 40px top-radius on the top edge (container has a curved upper boundary like a stage lip), 25px padding, Control Utright 14px in Fog (#a29e9c).

### Media Card with Play Overlay
**Role:** Video or interactive content preview

Image fill inside a Fog (#a29e9c) 1px border, 5px radius container. Play button is a small circular icon in Pure Black (#000000) centered on the image. No background tint — the media IS the card.

## Do's and Don'ts

### Do
- Use Control Upright at weight 400 for all UI text — the single-weight system means size and color do the hierarchy work, not font weight
- Set display headlines (64px+) to line-height 0.90–1.00 so text feels like a physical object, not a text block
- Use Moss Green (#38744d) for exactly one element per view — the moment a second green appears, the accent stops reading as accent
- Keep page background at Paper (#ffffff) and let Ice Wash (#e0f5ff) or Mint Whisper (#cbffa6) carry the only color in content areas
- Use 999px radius for all tags and pill markers, 5px for all functional buttons — the radius split is a system, not a choice per element
- Let image cards overlap and rotate slightly in collages — strict grid alignment destroys the editorial feel
- Reserve 142px for hero display only; section headings max at 64px to maintain the size gap that makes the hero feel monumental

### Don't
- Don't introduce additional font weights for Control Upright — the system runs on weight 400 plus extreme size contrast
- Don't use Times New Roman for UI controls, nav, or buttons — it is for body and quotes only, the clash with Control Upright is the point
- Don't add drop shadows to cards — the surface palette (Paper → Bone → Ice Wash) provides elevation through color, not shadow
- Don't pair Moss Green with Signal Cyan on the same element — the green and cyan are the only two saturated colors and must never compete
- Don't use border-radius values between 5px and 999px on standard components — the system jumps from crisp (5px) to fully round (999px) with nothing in between
- Don't right-align or left-align display headlines — they are always centered to hold the page's vertical axis
- Don't fill large areas with Signal Cyan — it lives only in pill tags and inline highlights; a cyan background block would break the monochrome discipline

## Elevation

No drop shadows. Elevation is communicated entirely through surface color steps (Paper → Bone → Ice Wash → Mint Whisper) and hairline borders in Fog (#a29e9c). The only visual depth cue is the stacking of off-white surfaces and the occasional colored wash. This keeps the interface feeling like a flat gallery wall — objects sit ON the wall, not above it.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas — the gallery wall
- **Bone** (`#efefef`) — Elevated card surfaces, button fills, subtle separation
- **Ice Wash** (`#e0f5ff`) — Cool content card wash — quotes, text notes, reference cards
- **Mint Whisper** (`#cbffa6`) — Warm highlight wash — accent card surfaces, emphasis zones

## Imagery

Imagery is collected, not illustrated. The signature element is a hyperreal 3D render — moss-covered stone formations physically sculpting the word 'sublime', placed as a full-bleed hero object rather than a background. Supporting visuals lean editorial-archive: vintage magazine clippings, art prints, Polaroid-style portraits, and nature photography (butterflies, botanical studies, hands at work). Cards hold these images at slight rotation and overlap, creating a scrapbook or mood-board density rather than grid alignment. A monarch butterfly with a file label ('headintheclouds.txt') recurs as a signature motif — organic, slightly surreal, digitally composited. The overall treatment: objects feel physically placed on the white page, not displayed in frames. No lifestyle photography, no staged people shots — the content IS the object, isolated and centered. The logo mark is a small organic bird/leaf silhouette, hand-drawn line weight, monochrome.

## Layout

Centered, max-width 1200px page model. Hero is a centered monumental headline (142px Control Upright) stacked above a 3D-rendered sculptural object that spans the full content width — text and image share the viewport, not a split column. Section rhythm alternates between generous vertical breathing (200px+ between sections) and dense collage moments where multiple cards overlap at slight rotations. Content arrangement is asymmetric z-pattern: centered quote blocks, then scattered card clusters, then a feature section with text-left/visual-right but with the visual offset above and below the text boundary. Grids are loose — card clusters use 2-4 columns but cards break alignment intentionally. Density is predominantly spacious (60% white space by area) with two concentrated collage zones. Navigation is a single thin top bar: logo left, two action buttons right, no mega-menu, no sidebar.

## Similar Brands

- **Are.na** — Same minimal white-canvas knowledge curation aesthetic with collage-style content blocks and the same refusal to impose grid rigidity
- **Readymag** — Same editorial display-sans-meets-serif-body tension and willingness to let a single headline dominate the viewport at extreme size
- **Cargo Collective** — Same creator-first white-wall portfolio language with overlapping content blocks and monochrome discipline
- **Pinterest** — Same visual bookmarking model with card-based content display, but Sublime's editorial typography and white space replace Pinterest's dense visual grid
