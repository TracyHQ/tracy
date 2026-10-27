# GRAZA — Style Reference
> Mediterranean deli counter, sunlit and hand-set

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Graza channels a sun-drenched Mediterranean deli counter — warm cream surfaces, an olive-dark ink that reads like aged wood, and occasional bursts of acid-green that feel like produce under fluorescent market lights. Typography carries a confident editorial weight: a typewriter serif does the conversational work while a condensed Garamond swoops in for oversized display moments. Color behaves like a produce aisle — the canvas is always warm and neutral, and the vivid greens appear as full-bleed section bands or small functional punctuation, never as chrome on chrome. Components stay spare and hand-set: pill buttons, hairline borders, gentle 20px image radii, and almost no shadow. The rhythm alternates between photographic full-bleed hero plates, text-only editorial spreads on solid color fields, and split text+image compositions. Nothing is grid-locked; whitespace and asymmetry do the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Olive Ink | `#3c422e` | Primary text, nav links, borders, button outlines, icon strokes — near-black with an olive undertone that keeps the page from feeling clinical |
| Linen Cream | `#fff4ec` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Buttery Peach | `#f6e6d9` | Secondary surface and warm contrast bands — slightly deeper than Linen Cream, used to break long pages and nest cards |
| Squeeze Bottle Green | `#9eef80` | Full-bleed section bands, highlighted text treatments — bright produce-shelf green that carries entire pages |
| EVOO Yellow-Green | `#d1e030` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Mustard Sun | `#fbd535` | Full-bleed editorial section bands, large decorative type wash — warmer sibling to EVOO Yellow-Green, carries hero-level moments |

## Typography

### GT Alpina Typewriter — Primary workhorse for body copy, nav, buttons, links, captions, input fields, and small editorial labels. The typewriter serif gives the brand its hand-set, kitchen-counter voice — slightly imperfect letterforms make utility text feel editorial rather than transactional.
- **Substitute:** IBM Plex Serif, Lora, or Recoleta
- **Weights:** 400, 500, 700
- **Sizes:** 12, 16, 18, 20
- **Line height:** 1.0, 1.2, 1.25, 1.5
- **Letter spacing:** normal

### ITC Garamond Condensed — Display and hero headlines only — the tall, narrow Garamond contrasts sharply with the typewriter body, creating a magazine-cover hierarchy. The 120px size with -0.031em tracking is the brand's signature mark: editorial confidence that swallows the page.
- **Substitute:** Playfair Display, Cormorant Garamond, or DM Serif Display
- **Weights:** 400
- **Sizes:** 46, 48, 72, 102, 120
- **Line height:** 0.9, 1.0, 1.6
- **Letter spacing:** -0.031em at 120px, -0.030em at 102px, -0.021em at 46-48px

### Apercu — Badge and status micro-labels — a neutral geometric sans used in tight all-caps tags like 'BACK IN STOCK'. Appears only in badge contexts to avoid competing with the serif system.
- **Substitute:** Inter, Söhne, or Work Sans
- **Weights:** 400
- **Sizes:** 13
- **Line height:** 1.0
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| body-lg | — | — | 18px | 1.25 | 0px |
| subheading | — | — | 20px | 1.2 | 0px |
| heading-sm | — | — | 46px | 1 | -0.97px |
| heading | — | — | 72px | 0.9 | -2.16px |
| heading-lg | — | — | 102px | 0.9 | -3.06px |
| display | — | — | 120px | 0.9 | -3.72px |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 64px
- **Card padding:** 30px
- **Element gap:** 20px

### Border Radius

- **pills:** 9999px
- **images:** 20px
- **inputs:** 10px
- **buttons:** 10px
- **nav-capsule:** 32px

## Components

### Pill Nav Button
**Role:** Cart and account icon buttons in header

Oval capsule at 9999px radius, 1px Olive Ink (#3c422e) border, Linen Cream (#fff4ec) fill, 10px horizontal padding, contains small icon + text count. Sits flush in the top-right nav cluster.

### Nav Capsule
**Role:** Distinct rounded nav container

32px radius container holding a single icon, used as a floating utility element above the main nav row.

### Primary Filled CTA
**Role:** Key purchase or action trigger

EVOO Yellow-Green (#d1e030) background, Olive Ink (#3c422e) text, 10px radius, roughly 20px vertical and 30px horizontal padding. GT Alpina Typewriter at 16px weight 700, all-caps tracking. The single saturated CTA in the system.

### Outline Ghost Button
**Role:** Secondary action, editorial call-to-action

Transparent or Linen Cream background, 1px Olive Ink (#3c422e) border, 10px radius, 20px vertical padding, 30px horizontal padding. GT Alpina Typewriter 16px weight 500. Used for 'Get The Chips' style links.

### Carousel Arrow Control
**Role:** Paginated content navigation

Small pill at 10px radius, 1px Olive Ink border, Linen Cream fill, contains left/right arrow glyph. Sits centered under hero text blocks.

### Editorial Section Band
**Role:** Full-bleed colored content section

Edge-to-edge block in Mustard Sun (#fbd535) or Squeeze Bottle Green (#9eef80). No internal max-width on the color fill — content inside is loosely centered with 30px side padding. Display headlines in ITC Garamond Condensed drop to 72–120px.

### Full-Bleed Hero Plate
**Role:** Lifestyle/product photography hero

Photograph bleeds to all four edges, no radius. Headline and CTA overlay bottom-left in Olive Ink on a subtle gradient dim or directly on the warm image. Headline set in Garamond Condensed 46–72px.

### Split Feature Block
**Role:** Text + image product highlight

50/50 grid on editorial bands: text column left (centered vertically, max ~480px wide), image column right with 20px radius and slight internal padding. Headline at 46–72px Garamond, body at 16–18px Alpina.

### Product Image Card
**Role:** Lifestyle product shot in editorial layouts

Photograph at 20px border radius, no shadow, no border. Often paired with a caption block below in GT Alpina Typewriter 12–16px.

### Status Badge
**Role:** Inline label like "BACK IN STOCK"

No container — text-only in Apercu 13px, all-caps, weight 400, Olive Ink. Flanked by small decorative asterisk or floral glyphs. Sits centered above section headlines.

### Text Link with Arrow
**Role:** Editorial link like "MAKE THIS DISH →"

Olive Ink GT Alpina Typewriter 16px weight 500, underlined or followed by an em-arrow. No button chrome — reads as editorial cross-reference.

### Inline Recipe Card
**Role:** Recipe caption paired with a food photo

Photograph at 20px radius on top, caption below in GT Alpina Typewriter 12–16px: 'Recipe: [name]' in weight 400, followed by a text link arrow. No card surface, no border — floats on the section band color.

### Scattered Text Cluster
**Role:** Asymmetric keyword cloud on green section

Large ITC Garamond Condensed words (Sear, Grill, Fry, Roast, Bake, Garnish, Knead) placed at varying sizes (46–72px) and slight rotations within a full-bleed Squeeze Bottle Green band. One word circled with a thin Olive Ink oval. Editorial, not functional.

### Footer Olive Branch Photo
**Role:** Atmospheric closing image

Full-bleed photograph of olive branches, no radius, no overlay text — serves as a tonal palette cleanser between content sections and the next navigation moment.

## Do's and Don'ts

### Do
- Set display headlines in ITC Garamond Condensed at 72–120px with -0.03em tracking — the condensed swoop is the brand's signature silhouette.
- Use Olive Ink (#3c422e) for all text and borders; never use pure black or a neutral gray. The olive undertone is non-negotiable.
- Let accent colors (Mustard Sun #fbd535, Squeeze Bottle Green #9eef80) run full-bleed as section bands rather than as small UI chips — their job is to carry pages, not decorate buttons.
- Apply 20px radius to all product and lifestyle imagery; 10px radius to buttons and inputs; 9999px to cart/account pills.
- Center editorial section content with roughly 30px side padding rather than locking it to a max-width grid; the page is meant to feel hand-set.
- Pair the typewriter serif (GT Alpina Typewriter) with all utility text — nav, buttons, inputs, body, captions — at 12–20px weight 400–700.
- Use the Apercu 13px badge style only for all-caps status labels flanked by small decorative glyphs.

### Don't
- Don't use a neutral system gray or pure black for text or borders — always reach for Olive Ink (#3c422e).
- Don't set body copy in ITC Garamond Condensed; the condensed display serif is reserved for headlines 46px and above.
- Don't apply shadows to cards, buttons, or images. The system relies on color bands and radius, not elevation.
- Don't use the vivid greens as small button fills or chip backgrounds — they are full-bleed section colors or large decorative type, not chrome.
- Don't lock the layout to a rigid 12-column grid; editorial sections breathe with asymmetric text placement and scattered keyword clusters.
- Don't mix multiple accent colors within a single section — one section gets one accent band (yellow OR green), never both.
- Don't add a neutral gray border or divider where a 1px Olive Ink line would do; the border color is part of the system, not a fallback.

## Elevation

The system has no shadow vocabulary. Depth is communicated through full-bleed color bands transitioning from cream to yellow to green, and through 20px image radius. Components sit directly on the canvas with 1px Olive Ink hairlines when separation is needed. No drop shadows, no glow, no floating cards.

## Surfaces

- **Canvas** (`#fff4ec`) — Default page background — warm linen white for most content
- **Warm Card** (`#f6e6d9`) — Secondary surface and alternating content bands — slightly deeper peach-cream
- **Mustard Band** (`#fbd535`) — Full-bleed editorial section background — warm yellow for feature spreads
- **Green Band** (`#9eef80`) — Full-bleed editorial section background — bright produce green for recipe/keyword sections
- **CTA Surface** (`#d1e030`) — Action accent — only on the primary filled button, not as a section band

## Imagery

Photography is the dominant visual content — warm-toned, natural-light food and lifestyle shots showing hands spreading, slicing, pouring, and plating olive oil. Images are tight product crops or medium shots of food in domestic kitchen contexts, not staged studio setups. Treatment: full-bleed hero plates with no radius, 20px-radius product cards in editorial layouts. No illustrations, no icons beyond minimal line glyphs, no 3D renders. The photography carries the color story (warm cream, olive green produce, golden oil) rather than relying on graphic overlays. Dense: a single large photograph typically occupies 50–100% of any given section.

## Layout

Full-bleed page model with no rigid max-width container — sections either run edge-to-edge in solid color or feature edge-to-edge photography. Hero pattern: full-viewport lifestyle photograph with bottom-left headline overlay. Section rhythm alternates between photographic plates and flat color bands (Mustard Sun → Squeeze Bottle Green), with the warm cream canvas threading between them. Content arrangement is editorial and asymmetric: centered headline blocks over color fields, 50/50 split text+image blocks, and scattered keyword clusters (Sear, Grill, Fry) that break the grid intentionally. No card grids, no pricing tables, no masonry. Navigation is a minimal top bar with brand wordmark left, text links center-right, and pill-shaped cart/account buttons at far right. Vertical spacing is generous — 35–64px between editorial sections — creating a magazine-spread pace rather than a product-listing density.

## Similar Brands

- **Fly By Jing** — Same warm cream + bold accent color band approach for food ecommerce, with editorial serif display headlines and full-bleed lifestyle photography
- **Omsom** — Playful use of vivid full-bleed section colors (their yellow, green, pink) against warm neutrals, with confident serif type and hand-set editorial layouts
- **Brightland** — Olive oil adjacent food brand with warm linen backgrounds, dark olive text, and bold condensed serif display headlines on lifestyle product photography
- **Magic Spoon** — Direct-to-consumer food brand leaning into bright single-accent color blocks and large condensed serif editorial headlines over warm cream surfaces
