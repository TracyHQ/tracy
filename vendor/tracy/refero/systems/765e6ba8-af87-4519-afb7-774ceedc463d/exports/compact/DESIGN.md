# Aplós — Style Reference
> Old-world apothecary at dusk

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aplós is an old-world apothecary rendered in warm monochrome: bone-white canvas, deep cocoa accents, and a single editorial serif (Goudy Old Style) that does the work a sans-serif system normally would. The page rhythm is slow and confident — dramatic dark hero slabs, generous cream sections, and tightly spaced type that reads more like a printed cocktail menu than a DTC storefront. The product itself is always the visual hero; the interface stays out of the way with minimal borders, one shared 5px radius, and almost no chromatic accent. Color appears only as tonal shift: bone → white → cocoa → ink, never as decorative hue.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone | `#f2f1ed` | Page background, large section canvases — the warm off-white that gives the system its paper-like editorial feel |
| Paper White | `#ffffff` | Card surfaces, elevated panels, light benefit cards — sits one step above Bone to create lift without shadows |
| Cocoa | `#3b3429` | Dark accent cards, inverted text blocks — warm near-black that softens pure ink and keeps dark sections feeling organic rather than digital |
| Ink | `#000000` | Primary text, nav links, logo wordmark, hairline borders, hero backdrop |
| Stone | `#646464` | Secondary body copy, muted helper text, subdued descriptions |
| Ash | `#b4aeac` | Subtle link hover shadows, barely-there elevation hints |

## Typography

### Goudy Old Style — Sole typeface for headlines, section titles, product names, card titles, and editorial body — a classical Venetian serif that signals craft and heritage. The narrow weight range (400 only) and tight line-heights (1.05–1.08) let the type sit in dense, menu-like stacks. Letter-spacing of -0.012em tightens optical gaps in display sizes without losing the serif's elegance.
- **Substitute:** Cormorant Garamond, EB Garamond, Playfair Display
- **Weights:** 400
- **Sizes:** 26px, 40px
- **Line height:** 1.05–1.08
- **Letter spacing:** -0.012em
- **OpenType features:** `"liga" on, "kern" on`

### System Sans (UI chrome) — Inferred secondary face for navigation, buttons, captions, and dense utility text where serif would be illegible at small sizes. Kept restrained so the serif remains dominant.
- **Substitute:** Inter, system-ui, -apple-system, Helvetica Neue
- **Weights:** 400–500
- **Sizes:** 
- **Line height:** 1.4–1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.3 | -0.2px |
| heading-sm | — | — | 26px | 1.08 | -0.31px |
| heading | — | — | 40px | 1.05 | -0.48px |
| display | — | — | 56px | 1.05 | -0.67px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96-120px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 5px
- **cards:** 5px
- **inputs:** 5px
- **buttons:** 5px

## Components

### Announcement Bar
**Role:** Top utility strip

Full-width white (#ffffff) bar, 1px bottom border in #e5e3df. Single line of small sans-serif text (12–14px) centered in #000000. Fixed height ~40px.

### Primary Navigation
**Role:** Site header with logo + nav links

White background, logo wordmark 'APLŌS' in Goudy Old Style 26px #000000 left-aligned. Nav links (Shop, Recipes, Journal, Store Locator, Cart) right-aligned in sans-serif 14px #000000. Generous horizontal padding (24px+), height ~72px.

### Dark Hero Section
**Role:** Full-bleed editorial hero

Pure black (#000000) background, full viewport width. Headline in Goudy Old Style 40–56px white, left-aligned, sitting beside or overlapping large product photography (can + cocktail glass). No gradient, no decoration — just type and image in negative space.

### Outlined CTA Button (Light)
**Role:** Primary action on dark hero

White background, no border or 1px border in #ffffff, 5px radius. Sans-serif text 14px, weight 500, #000000. Padding 9px 12px. Compact pill proportion.

### Ghost Text Link
**Role:** Secondary action (Learn More, Shop Now)

No background, no border. Sans-serif 14px, #000000, text-decoration: underline on hover only. Sits centered below content blocks.

### Benefits Section Heading
**Role:** Editorial section title

Centered Goudy Old Style 40px #000000, letter-spacing -0.48px, line-height 1.05. Small body paragraph below in sans-serif 14–16px #646464, max-width ~600px, centered.

### Benefit Card (Light)
**Role:** Standard feature card

White (#ffffff) surface on Bone (#f2f1ed) canvas. 1px border in #e5e3df. 5px radius. 24px internal padding. Goudy Old Style heading 20–26px #000000 at top, small Stone (#646464) sans-serif number ('01', '02') positioned in corner or below.

### Benefit Card (Dark / Cocoa)
**Role:** High-contrast accent card

Cocoa (#3b3429) surface, 5px radius, 24px internal padding. Goudy Old Style heading 20–26px #ffffff. Optional small white descriptive text in sans-serif 14px. No border — the dark fill is the contrast.

### Product Collection Card
**Role:** Featured product showcase

Overlapping composition: large product image (bottle/can) bleeds across full card width, ~60–70% card height. White (#ffffff) text panel overlays the lower-left with Goudy Old Style product name 26px #000000 and sans-serif description 14px #646464. No visible card border — image and text panel merge.

### Section Divider Spacer
**Role:** Vertical rhythm control

No visible line. Pure whitespace of 96–120px between major sections, creating the slow editorial pace.

## Do's and Don'ts

### Do
- Set all section backgrounds to Bone (#f2f1ed); reserve pure white only for card surfaces that need lift.
- Use Goudy Old Style at 26px and 40px with letter-spacing -0.012em for every heading and product name — the serif IS the brand.
- Anchor all CTAs to 5px radius with 9px 12px padding; never round buttons to pill or full-circle.
- Place 96–120px of vertical whitespace between major sections to maintain the printed-menu cadence.
- Use Cocoa (#3b3429) for inverted accent cards to add tonal variety — never introduce chromatic color where grayscale shift can do the work.
- Keep hero photography full-bleed on Ink (#000000) with white serif headlines; the contrast does the dramatization.
- Set secondary body copy in Stone (#646464) at 14–16px sans-serif, never in the serif at small sizes.

### Don't
- Don't introduce any chromatic color (blue, green, red, etc.) — the system is deliberately 0% colorful and any hue will break the apothecary language.
- Don't use large border-radius (12px+) or pill shapes — the 5px radius is non-negotiable and keeps the system feeling editorial, not app-like.
- Don't use bold weights (600+) for headings — Goudy Old Style 400 only; the whisper-weight serif is the signature.
- Don't add drop shadows, glows, or gradient overlays — elevation comes from tonal contrast between Bone, Paper, and Cocoa, not from blur effects.
- Don't use a sans-serif for product names or section titles — those are exclusively Goudy Old Style domain.
- Don't crowd sections with dense grids — the rhythm depends on 96–120px breathing room between blocks.
- Don't place dark text directly on Cocoa (#3b3429) without testing contrast — use white (#ffffff) text on Cocoa surfaces.

## Elevation

The system deliberately avoids drop shadows and blur effects. Elevation is communicated entirely through tonal layering: Bone canvas → Paper White cards → Cocoa accent cards → Ink hero slabs. The only shadow token (#b4aeac) is a barely-perceptible link hover state, never used for component lift.

## Surfaces

- **Bone** (`#f2f1ed`) — Page-level canvas, most section backgrounds
- **Paper White** (`#ffffff`) — Card surfaces, product panels, light benefit cards
- **Cocoa** (`#3b3429`) — Inverted accent cards, dark feature blocks
- **Ink** (`#000000`) — Hero backdrop, footer, maximum contrast slabs

## Imagery

Product photography is the dominant visual element — tightly cropped cans, bottles, and styled cocktail glassware on pure black. No lifestyle, no people, no contextual environments: the object IS the hero. Photography is high-contrast, studio-lit, and occupies 60–80% of hero and product card real estate. No illustrations, no icons beyond minimal UI chrome, no decorative graphics. Color treatment is natural (sage green can, pale yellow cocktail liquid) but always grounded against black backgrounds so the warmth feels intentional rather than incidental.

## Layout

Max-width 1200px centered content with full-bleed dark hero and alternating section bands. The hero is a full-viewport dark slab with large product photography and left-aligned serif headline. Below, the page shifts to a Bone (#f2f1ed) canvas hosting a centered 'Benefits' section: serif heading, body paragraph, then a 3-column card grid mixing one Cocoa card and two Paper White cards. The grid is symmetric and equal-width. Subsequent sections follow the pattern: centered serif heading → 1–2 column product showcases with overlapping image+text panels. Navigation is a simple top bar (not sticky, not mega-menu) with logo left and 4–5 text links right. Footer follows in dark Ink. Vertical rhythm is very slow — 96–120px between sections — creating a gallery-like scroll rather than a dense commerce page.

## Similar Brands

- **Chamberlain Coffee** — Same warm cream (#f2f1ed-style) canvas, serif-forward editorial type, and monochrome product photography approach
- **Ghia** — Non-alcoholic apothecary positioning with botanical product shots, serif headlines, and a restrained warm-neutral palette
- **Olipop** — Editorial commerce layout with large product imagery, centered serif section titles, and generous section breathing room
- **Augustinus Bader** — Luxury wellness brand language: cream canvas, deep near-black accent blocks, classical serif typography, and product-as-art photography
- **Theopiq / Kin Euphorics** — Non-alcoholic spirit category neighbor with dark hero slabs, serif wordmarks, and monochrome-tonal product pages
