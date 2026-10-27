# Bongusta — Style Reference
> editorial linen closet behind museum glass

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bongusta operates as a quiet, editorial luxury system: warm white canvas, deep aubergine ink replacing pure black, and a single humanist sans-serif carrying all typography at compact sizes. The near-monochrome palette deliberately steps back so textile photography and interior still-lifes carry the visual weight — the UI is the gallery wall, never the artwork. Structure is built from warm linen hairlines rather than elevation, with pill-shaped actions carrying the only brand-tinted shadow in the entire system. The result reads like a curated museum catalog: dense with product, restrained in chrome, and confident enough to let the objects speak.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aubergine Ink | `#321929` | Primary text, icons, outlined action borders, badges, links — a warm near-black that gives the monochrome system its only chromatic voice without ever feeling colored |
| Warm Linen | `#e0dddf` | Structural borders on cards, dividers, image edges, nav, lists — the single most-used color in the system defines every edge between surfaces |
| Soft White | `#ffffff` | Page background, card surfaces, nav fill, badge fills — the canvas on which everything sits |
| Charcoal | `#1d1d1f` | Input field borders, image container borders, secondary structural edges where slightly more weight is needed than Warm Linen |
| Pure Black | `#000000` | Icon fills, SVG strokes, link text in decorative contexts — used sparingly where absolute contrast is required |
| Smoke Gray | `#636363` | Secondary muted text, price labels, helper copy — sits behind Aubergine Ink in the text hierarchy |
| Ink | `#141414` | Monochrome icon fills, brand marks, and high-contrast graphic details. Do not promote it to the primary CTA color |
| Stone | `#6f6d6b` | Card body text, descriptive copy — a warm gray that reads as natural on the white canvas |
| Pale Mist | `#f0f0f0` | Subtle background fills and dividers where Warm Linen would be too warm — a cool counterpoint for nested surfaces |

## Typography

### Neue Haas Grotesk — Workhorse sans for all UI text: body, nav, product names, prices, badges, inputs, buttons. The single weight (400) with near-zero tracking (0.007em) creates a calm, evenly-spaced rhythm that never competes with photography. Sizes are deliberately compact (body at 14-15px), giving the system an editorial density rather than a marketing scale.
- **Substitute:** Neue Haas Unica, Inter, or Helvetica Now Display
- **Weights:** 400
- **Sizes:** 11px, 14px, 15px, 16px, 18px, 22px
- **Line height:** 1.00, 1.30, 1.38, 1.50, 1.70
- **Letter spacing:** 0.007em across all sizes

### Bongusta — Custom display face reserved for the brand wordmark and signature headings only. The single-weight, single-size deployment suggests a refined serif or humanist display cut meant to act as a logo-like anchor — never used for body or UI text.
- **Substitute:** Cormorant Garamond, GT Sectra, or Italiana
- **Weights:** 500
- **Sizes:** 28px
- **Line height:** 1.50
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.3 | 0.08px |
| body-sm | — | — | 14px | 1.5 | 0.1px |
| body-lg | — | — | 16px | 1.5 | 0.11px |
| subheading | — | — | 18px | 1.38 | 0.13px |
| heading-sm | — | — | 22px | 1.5 | 0.15px |
| heading | — | — | 28px | 1.5 | 0.2px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 4px

### Border Radius

- **nav:** 3.5px
- **badges:** 9999px
- **buttons:** 9999px
- **image-containers:** 40px

## Components

### Pill Action Button
**Role:** Primary interactive element for CTAs, add-to-cart, navigation actions

Outlined pill with 9999px border-radius, 1px border in #321929 (Aubergine Ink), text in #321929 at 14px Neue Haas Grotesk weight 400, 16px vertical padding, 24px horizontal padding, white fill, and the signature brand-tinted shadow: rgba(50,25,41,0.15) 0px 2px 10px 0px. The shadow color is literally the brand color at 15% opacity — the only shadow in the entire system.

### Ghost Text Link
**Role:** Secondary navigation, inline links, category names

No border, no background. Text only in #321929 at 14px Neue Haas Grotesk weight 400. Underline appears on hover. Sits in the same text color as the pill button to maintain a single interactive voice.

### Product Card
**Role:** Display individual products in grid layouts

White surface with no fill, 1px border in #e0dddf (Warm Linen), 16px padding. Product image fills the card top with no radius. Product name in 14px Neue Haas Grotesk weight 400, #321929. Price in 14px, #636363 (Smoke Gray). No buttons, no badges inside the card — interaction lives on the image or in the card-level action.

### Top Navigation Bar
**Role:** Primary site navigation with logo, categories, account actions

Full-width white bar with Warm Linen bottom border (1px). Logo centered, category links left-aligned and right-aligned. Nav text in 14px Neue Haas Grotesk weight 400, #321929. Nav container has 3.5px border-radius. Tight 2px row gap between nav items. No background color change on scroll.

### Category Badge
**Role:** Small labels for product categories, tags, or status indicators

Pill shape with 9999px radius, 1px vertical padding, 5px horizontal padding, 1px border in #321929. Text in 11px Neue Haas Grotesk weight 400, #321929. Minimal visual weight — designed to be whispered, not shouted.

### Newsletter Input
**Role:** Email capture in footer or inline sections

Flat rectangular field with 1px border in #1d1d1f (Charcoal), 0px radius (no rounding on inputs), 16px vertical padding, 12px horizontal padding. Placeholder text in #636363, 16px Neue Haas Grotesk weight 400. No focus ring color is defined — focus state should use a 1px Aubergine Ink border.

### Rounded Image Container
**Role:** Display large editorial or lifestyle photography with soft edges

Image with 40px border-radius, no border, no shadow. Used for featured editorial content where the rounded corners soften the otherwise sharp, hairline-driven system. The 40px radius is the largest corner radius in the system and is reserved for image treatments only.

### Section Header
**Role:** Title or label introducing a content section

Small label text in 14px Neue Haas Grotesk weight 400, #321929, with generous 48px bottom margin. No decorative elements — the section title is a line of text, not a banner. May be left-aligned or centered depending on the grid.

### Product Grid Item
**Role:** Single cell in the multi-column product grid

Full-bleed product image on white background, product name directly below in 14px #321929, price in 14px #636363. 10-12px column gap between items. No card chrome — the image itself defines the cell boundary.

### Editorial Content Block
**Role:** Large lifestyle or blog content section

Full-bleed or wide-canvas image with optional 40px radius, paired with a text block. Text uses 18px Neue Haas Grotesk weight 400 for body and 22px for subheadings, all in #321929. The block breathes with 48px vertical padding and sits between the product grid and the footer.

## Do's and Don'ts

### Do
- Use #321929 (Aubergine Ink) for all primary text, icons, and interactive borders — never substitute pure black
- Use 9999px border-radius for every button, badge, and pill-shaped interactive element
- Use #e0dddf (Warm Linen) for all structural borders — cards, dividers, image edges, nav separators
- Keep section vertical gaps at 48px to maintain editorial breathing room between content bands
- Use Neue Haas Grotesk weight 400 at 14-15px for all body and UI text — the single weight is the system's voice
- Apply the brand-tinted shadow (rgba(50,25,41,0.15) 0px 2px 10px) only to primary pill action buttons — nowhere else
- Let product and lifestyle photography fill the visual hierarchy; keep UI chrome to hairlines and small type

### Don't
- Don't introduce any chromatic color beyond Aubergine Ink — the monochrome system is the brand identity
- Don't use filled buttons with solid backgrounds — actions are always outlined or ghost
- Don't add drop shadows to cards, images, or content blocks — use 1px Warm Linen borders for structure
- Don't use letter-spacing greater than 0.01em — tracking stays nearly flat across the type system
- Don't use type sizes below 11px or above 28px in the core type system — the scale is deliberately compact
- Don't differentiate cards from the page using background color contrast — both are Soft White, separated only by borders
- Don't use decorative gradients, color washes, or background tints — the system is flat and achromatic

## Elevation

- **Pill Action Button:** `rgba(50, 25, 41, 0.15) 0px 2px 10px 0px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Primary page background — all content sits directly on Soft White
- **Card Surface** (`#ffffff`) — Product cards and content blocks share the page background; separation is achieved exclusively through Warm Linen hairlines, never fill contrast

## Imagery

Full-bleed lifestyle and interior photography is the primary visual content. Hero images are large-format still-life compositions — folded striped towels on ornate wooden armoires, natural light, warm earth tones. Product photography uses clean white or neutral backgrounds with soft shadows, showing textiles flat or gently draped. Editorial grid images mix portrait, detail, and still-life crops at consistent scale. The color palette across photography stays in muted, natural tones — whites, creams, dusty plums, warm woods, soft greens — harmonizing with the near-monochrome UI. No illustrations, no abstract graphics, no icons beyond minimal functional UI markers. Photography occupies the majority of visual real estate; text and chrome recede.

## Layout

Full-bleed hero with overlaid minimal navigation, followed by a 6-column product grid at max-width 1200px, then a 3-column editorial/lifestyle grid. Sections are separated by 48px vertical gaps on a continuous white canvas — no alternating background bands, no color-coded sections. The page reads as a single editorial spread: hero image, product row, lifestyle row, footer. Navigation is a single top bar with centered logo and split left/right category links. The product grid is the densest layout element (6 columns at 1200px), while editorial sections breathe with larger images and more spacing. Overall density is compact but not crowded — the 4-10px element gaps create tight internal rhythm while 48px section gaps provide visual punctuation.

## Similar Brands

- **Tekla** — Same near-monochrome palette with a single warm dark accent, compact editorial type scale, and hairline-driven card structure for a textile-first catalog
- **Hay** — Danish design restraint with pill-shaped actions, minimal UI chrome, and full-bleed lifestyle photography as the primary visual content
- **Toast** — Editorial luxury home goods with compact sans-serif type, hairline borders, and a single warm dark ink color replacing pure black
- **The Citizenry** — Curated catalog aesthetic with near-monochrome interface, warm dark text color, and lifestyle photography carrying all visual weight
- **Menu Space** — Nordic minimalism with the same flat surface approach, single-weight sans-serif typography, and the philosophy that the product should be the hero
