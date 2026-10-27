# Aevi Wellness — Style Reference
> Nordic apothecary, weightless type. A muted slate-blue accent interrupts an otherwise achromatic, light-as-air editorial layout where product photography overlaps hairline-bordered cards on warm white.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aevi Wellness reads like a Nordic editorial spread translated into e-commerce: generous product photography overlapping a warm off-white canvas, whisper-weight typography that gives headlines room to breathe, and a single muted slate-blue accent that appears only where the brand needs to signal action or section shift. The palette is almost entirely achromatic — warm near-black text (#231f20), pure white surfaces, and a powder-blue band (#d5e0ea) that structures the page into editorial chapters. Components are barely-there: ultra-thin hairline borders, 2px corner radii on most elements, and 60px pill buttons for primary actions. The overall feel is clinical-luxury — the products themselves are the visual subject, and the interface stays out of their way.

## Colors

| Name | Value | Role |
|------|-------|------|
| Powder Blue | `#d5e0ea` | Section bands, card borders, decorative dividers — the brand's secondary canvas, used to segment the page into editorial chapters without introducing contrast |
| Slate Bloom | `#a3bfdb` | Primary action buttons, active states — the single chromatic accent; its low saturation keeps it feeling clinical rather than commercial |
| Warm Ink | `#231f20` | Primary text, hairline borders, card outlines, icon strokes — near-black with a warm undertone that softens the high-contrast text against white |
| True Black | `#000000` | Icon fills, occasional heavy borders — used sparingly for graphical weight when maximum contrast is needed |
| Paper White | `#ffffff` | Page background, card surfaces, text on dark blocks — the dominant canvas, never off-white or cream |
| Mist Gray | `#5f6368` | Muted helper text, secondary metadata, low-priority labels — only when a softer reading level is needed without leaving the achromatic palette |

## Typography

### Primary Font — Primary Font — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 10px, 12px, 14px, 16px
- **Line height:** 1.29, 1.3, 1.31, 1.33

### Primary Sans (custom, serif-influenced grotesque) — Body text, button labels, badge text, list items, card metadata at weight 300 — the light weight is anti-convention for utility text and signals editorial restraint
- **Substitute:** Inter, Söhne, General Sans
- **Weights:** 300
- **Sizes:** 
- **Line height:** 1.29–1.33
- **Letter spacing:** normal

### Tertiary Sans — Emphasized body copy, card descriptions — weight 500 lifts importance without breaking the light-typographic system
- **Substitute:** Inter, Söhne
- **Weights:** 500
- **Sizes:** 
- **Line height:** 1.29

### Display Sans — All headlines and section titles at weight 300 with extremely tight leading — the whisper-weight headlines create authority through restraint, not volume
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 300
- **Sizes:** 
- **Line height:** 1.08–1.11
- **Letter spacing:** normal

### Tertiary Font — Tertiary Font — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.29

### Button Font — Button Font — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.21, 2.71

### Heading Font — Heading Font — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 24px, 28px, 36px, 42px, 54px
- **Line height:** 1.08, 1.09, 1.1, 1.11

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.29 | 0px |
| body | — | — | 14px | 1.31 | 0px |
| body-lg | — | — | 16px | 1.33 | 0px |
| heading-sm | — | — | 24px | 1.11 | 0px |
| heading | — | — | 28px | 1.1 | 0px |
| heading-lg | — | — | 36px | 1.09 | 0px |
| heading-xl | — | — | 42px | 1.08 | 0px |
| display | — | — | 54px | 1.08 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 2px
- **pills:** 60px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Primary Pill Button
**Role:** Main call-to-action (e.g., 'Create Your Routine')

Filled background #a3bfdb, white text at 14px weight 500, 60px border-radius, 16px horizontal padding and 12px vertical padding. No shadow. The pill shape is the only soft radius in the system — everything else is sharp.

### Ghost / Outlined Button
**Role:** Secondary actions, filter triggers

Transparent background, 1px border in #d5e0ea, text in #231f20, 2px radius, 16px horizontal and 8–12px vertical padding. Sits quietly next to the primary pill without competing.

### Editorial Section Card
**Role:** Content blocks for features, product categories, reviews

White background (#ffffff), 1px hairline border in #231f20, 2px radius, 16px internal padding. No shadow, no elevation — the border alone defines the surface. Often overlaps with photography behind it.

### Product Hero Banner
**Role:** Full-bleed hero on landing and category pages

Full-viewport-width background image (product photography), overlaid with a large display headline (54px, weight 300) and a primary pill CTA. The brand wordmark is set at display size as a decorative overlay, not a heading.

### Press Logo Strip
**Role:** Social proof band of media mentions

Sits on a #d5e0ea background band, logos rendered in #231f20 at uniform height, evenly spaced across the full width. No card containers — the band itself is the container.

### Testimonial Block
**Role:** Customer reviews carousel

#d5e0ea background, 5-star row in #231f20 above body text at 14px weight 300, quoted review text centered, product name and reviewer attribution in small caps below at 10–12px. 2px radius container.

### Hairline Divider
**Role:** Structural separation between content blocks

1px line in #d5e0ea or #231f20, full-width or section-width. Used more often than spacing alone to define page structure.

### Product Category Card
**Role:** Grid cards linking to product categories (Bestsellers, New, Face Care)

Full-bleed photography with a category label overlaid in the bottom-left corner at 14px weight 300 white text. No border, no padding, no shadow — pure image with typographic caption.

### Header Navigation
**Role:** Top-level site navigation

Transparent or white background, logo left, nav links center or right in 14px weight 300, no background fill on active state — active state indicated by underline in #a3bfdb or color shift to #231f20.

### Badge / Tag
**Role:** Product tags, labels, status indicators

1px border in #d5e0ea, background #ffffff or #d5e0ea, 2px radius, 6–8px vertical padding, text 10–12px weight 300 in #231f20. Minimal footprint.

### Input Field
**Role:** Email capture, search, form fields

1px bottom border in #231f20 (no side or top borders), transparent background, placeholder text 14px weight 300, focus state darkens the border to #000000. No fill, no box.

### Icon
**Role:** Utility and decorative icons

Stroke-based, 1px weight, #231f20 fill, 16–20px size. Minimal, clinical — no rounded ends, no filled variants. Icons never carry color.

## Do's and Don'ts

### Do
- Use #a3bfdb exclusively for the primary action button — never as a decorative fill, text color, or large background area
- Set all headlines at weight 300 with line-height between 1.08 and 1.11; never bold a heading
- Use the 60px radius only for the primary pill button; all other elements (cards, inputs, ghost buttons) use 2px
- Build section separation with #d5e0ea background bands and 1px #231f20 hairlines, not with shadows or large margins
- Let product photography fill its container edge-to-edge; do not pad or frame product images with whitespace
- Keep the palette 95%+ achromatic; any chromatic use must be functional (action, active state) — decorative color dilutes the editorial tone
- Use 4px as the base spacing unit and snap all gaps to multiples of 4 (4, 8, 16, 24, 32, 48)

### Don't
- Do not introduce a second accent color — the system is built on a single muted blue against achromatic neutrals
- Do not apply shadows, glows, or blur to any element; the elevation philosophy is hairline borders only
- Do not use border-radius larger than 2px on anything except the primary pill button (60px)
- Do not set headings at weight 400 or above; weight 300 is the system voice and any heavier weight breaks the editorial register
- Do not use vibrant or saturated colors for icons, links, or hover states — keep all interactive chrome in the existing palette
- Do not pad product photography with large gutters or contained frames; images should bleed
- Do not use colored or filled backgrounds for cards; the card surface is always #ffffff with a 1px border

## Elevation

The design intentionally avoids shadows, glows, and blur effects entirely. All elevation is communicated through 1px hairline borders in #231f20 or #d5e0ea, through the #d5e0ea background band that separates editorial chapters, and through photography that bleeds beyond its logical container to create depth. The absence of shadow is a deliberate Nordic-apothecary choice — surfaces feel printed rather than digital.

## Surfaces

- **Paper White** (`#ffffff`) — Base page canvas, card surfaces, product image backgrounds
- **Powder Blue Band** (`#d5e0ea`) — Section dividers, press strip, testimonial background — editorial chapter break
- **Slate Bloom** (`#a3bfdb`) — Primary action surface, occasional highlight wash — the only chromatic surface
- **Warm Ink** (`#231f20`) — Inverted dark surface for text-heavy or closing sections

## Imagery

Photography is the dominant visual medium. Product shots are tightly cropped, often with overlapping bottles and dropper applicators creating editorial collage compositions. Lifestyle portraits are natural-light, intimate close-ups (faces, hands applying product), always desaturated or black-and-white in the editorial sections. Press imagery uses a grainy, high-contrast treatment. No illustration, no 3D renders, no abstract graphics — every image is photographic. Imagery is full-bleed and overlapping rather than contained in cards, and labels float over the bottom corner of the image in plain white type. The object is always the subject; there is no lifestyle staging or environmental context.

## Layout

Max-width ~1200px centered, but hero and section bands break out to full-bleed. The page reads as a sequence of full-width editorial chapters: a full-bleed product hero with overlaid wordmark, a press logo strip on a #d5e0ea band, a split editorial section (image left, text right with framed photography), a testimonial carousel on a #d5e0ea band, and a 3-column product category grid. Sections alternate between white and powder-blue to create rhythm. The navigation is a minimal top bar. Section gaps are 48px but feel larger because of the band-to-band color contrast. The layout is text-left/image-right in editorial sections and centered-stacked in product grids.

## Similar Brands

- **Tata Harper** — Same editorial-meets-clinical beauty language: hairline borders, light typography, generous product photography, nearly monochrome with one soft accent
- **Noble Panacea** — Similar ultra-minimal skincare aesthetic with whisper-weight headlines, full-bleed product photography, and an almost entirely achromatic palette
- **Lesse** — Same Nordic apothecary mood — sparse layout, product-forward imagery, thin sans-serif at light weights, subtle blue-gray accents on white
- **Sigil Scent** — Shared editorial restraint: weight 300 type, hairline dividers, near-monochrome palette with a single dusty accent, photography that overlaps layout edges
