# Superintelligence for work — Style Reference
> Architectural monograph on vellum — where the only ornament is letter-spacing and the only color is a single electric blue pressed into white space.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sana operates on near-total chromatic restraint: a monochromatic canvas of warm off-white, white, and a near-black ink, with one electric blue and one ember orange appearing only as functional punctuation on the single most important action per surface. The typography is the personality — Sana Sans set aggressively tight (-2.5% at display sizes) so headlines read as carved stone rather than rendered text, with weight staying between 400 and 500 to avoid shouting. Buttons are pill-shaped with large radii, cards are softly rounded, and the entire UI is flat — no shadows, no gradients, no decorative elevation. Sections alternate between white and #efefed bands to create rhythm without color, and the only depth comes from photographic content (editorial product still-lifes, full-bleed testimonial portraits) that floats on the otherwise silent canvas. The system behaves like an architectural monograph: one idea, one typeface, one material.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#090909` | Primary text, hairlines, card and input borders, list dividers, link underlines — the dominant dark anchor of the system |
| Pure Black | `#000000` | Icon fills, heading underlines, occasional deep accents where maximum weight is needed |
| Bone | `#ffffff` | Page background, card surface, text on filled buttons, button borders for ghost controls |
| Linen | `#efefed` | Section band background, elevated card surface, the warm neutral that gives the white space its temperature |
| Ash | `#d9d9d9` | Footer divider, hairline rules where Ink would be too heavy |
| Cobalt Pulse | `#0057f3` | Single primary action fill per page — the only chromatic punctuation, reserved for the decisive CTA and never used decoratively |
| Ember Signal | `#ff5102` | Rare secondary action or notification accent — a warm counterpoint to Cobalt Pulse, used at most once per surface |

## Typography

### Sana Sans — Sole typeface across the entire system — display headlines at 83px set weight 500 with -2.5% tracking for a carved, architectural feel; section headings at 48px weight 500 with -0.96px tracking; body copy at 15-16px weight 400 with barely-perceptible negative tracking. The font is geometric and humanist, and the refusal to go above weight 500 is deliberate: confidence comes from restraint, not boldness.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 450, 500
- **Sizes:** 14, 15, 16, 32, 40, 48, 83
- **Line height:** 0.95, 1.0, 1.1, 1.23, 1.4, 1.49, 1.6
- **Letter spacing:** Aggressively negative at large sizes: -2.49px at 83px, -0.96px at 48px, -0.44px at 40px, -0.32px at 32px, approximately -0.06px at body sizes. Tracking tightens as size grows, the opposite of conventional web typography.
- **OpenType features:** `"kern"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 20 | -0.06px |
| body | — | — | 16px | 24 | -0.06px |
| subheading | — | — | 32px | 39 | -0.32px |
| heading-sm | — | — | 40px | 44 | -0.44px |
| heading | — | — | 48px | 48 | -0.96px |
| display | — | — | 83px | 79 | -2.49px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 6px
- **cards:** 16px
- **buttons:** 32px
- **cards-elevated:** 24px

## Components

### Primary CTA Button
**Role:** The single decisive action on any page

Pill-shaped (32-36px radius), filled with Cobalt Pulse #0057f3, white text in Sana Sans 15px weight 500, padding 10px 20px. No border, no shadow. The vivid blue against the achromatic canvas is the loudest element on the page by design.

### Ghost Navigation Button
**Role:** Secondary action in the header

Pill-shaped with 32px radius, white background with 1px Ink #090909 border, Ink text in Sana Sans 14-15px weight 500, padding 8px 16px. Outlined not filled — reserves Cobalt Pulse for the page's single primary action.

### Pill Notification Toast
**Role:** Persistent status banner (e.g. acquisition announcement)

Centered floating pill, white background, 1px Ink border, 32px radius, Ink text at 14-15px weight 400, padding 8px 16px. Anchored at viewport bottom-center.

### Top Navigation Bar
**Role:** Primary site navigation

Full-width white bar, 6px corner radius on internal elements. Left: Sana wordmark in Ink weight 500. Center-left: nav links (Products with dropdown indicator, Mission, Careers) in Ink at 14-15px weight 400. Right: Ghost Navigation Button. No background blur, no shadow — sits on the white canvas.

### Brand Logo Strip
**Role:** Social proof via customer logos

Single horizontal row of 5-7 monochrome black logos on white, evenly spaced at 40-60px column gap. Logos are flat black, no color treatments. Centered on canvas.

### Feature Pill Item
**Role:** Sub-feature below a product section header

Vertical stack: small line icon (24px, Ink stroke) at top, bold label (15-16px weight 500, Ink) below, one-line description (14-15px weight 400, Ink). Centered alignment, 16-24px column gap between adjacent pills in a 4-column grid.

### Section Header Block
**Role:** Centered title and subtitle for each product section

Sana Sans 48px weight 500 heading in Ink with -0.96px tracking, centered. Subtitle in 15-16px weight 400 Ink, max-width ~600px, centered. Optional primary CTA button below with 24-40px gap.

### Editorial Product Showcase
**Role:** Full-bleed photographic still-life that presents a product screenshot in a real-world context

Full-width image (e.g. laptop stacked on books/notebooks), no border, no radius, no shadow — bleeds edge to edge of the viewport. The image carries the section's emotional weight, replacing what would otherwise be a screenshot.

### Testimonial Video Card
**Role:** Full-bleed video preview with quote overlay

Full-width image or video, edge to edge, no border radius. White quote text overlaid left-aligned at 32-40px weight 500, with attribution (name + role) at 14-15px weight 400. A small white Spotify logo above the quote. A ghost outlined 'Watch video' button below the attribution.

### Card with Soft Radius
**Role:** Elevated content blocks (pricing, features, content tiles)

16-24px corner radius, white background, optional 1px Ink border at very low contrast. No shadow. Padding 16-24px. Sits on Linen #efefed background bands for the only form of depth in the system.

### Footer
**Role:** Site-wide footer with links and legal

White or Linen background, 1px Ash #d9d9d9 top border, 40-80px padding-top. Multi-column link grid in Ink 14-15px weight 400. Sana wordmark at the top of the footer in Ink weight 500.

## Do's and Don'ts

### Do
- Use Sana Sans weight 500 for all headings and never exceed weight 500 — confidence comes from size and tracking, not boldness
- Set display headlines at 83px with -2.49px letter-spacing so the type reads as carved, not rendered
- Reserve Cobalt Pulse #0057f3 for exactly one filled CTA per visible surface; every other button stays ghost or neutral
- Use Linen #efefed bands to separate sections instead of borders, shadows, or dividers
- Make all buttons pill-shaped with 32-36px radius — angular buttons break the editorial language
- Default to 4px multiples for all spacing; element gap 8-16px, card padding 16-24px, section gap 80-120px
- Set body copy at 15-16px with line-height 1.4-1.6 in Sana Sans weight 400

### Don't
- Don't add box-shadow to any component — depth comes from surface color shifts, not elevation
- Don't use Cobalt Pulse decoratively on icons, illustrations, tags, or backgrounds — it is a CTA color only
- Don't introduce gradients — the system is built on flat, single-value surfaces
- Don't go above weight 500 in the type scale; bold/700 breaks the restrained voice
- Don't use #0000ee or any unstyled link blue — links inherit Ink #090909
- Don't add corner radii smaller than 6px or use sharp 0px corners on content blocks
- Don't place colored backgrounds under text — every text surface is white, linen, or photographic

## Elevation

The system intentionally avoids shadows entirely. Depth is achieved through surface color shifts (#ffffff on #efefed) and through photography, not through drop shadows. This keeps the visual language feeling like printed editorial design rather than software UI. Never add box-shadow to components.

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — the default reading surface
- **Band** (`#efefed`) — Section background that breaks the page into rhythmic alternating bands without using color or shadows
- **Card** (`#ffffff`) — Card surface on Linen bands — white-on-warm-white creates the only soft elevation in the system

## Imagery

Photography is the only chromatic element in the system and is treated as editorial content, not decoration. Two dominant types: (1) editorial product still-lifes — laptops, notebooks, coffee cups, and office objects arranged in tactile compositions on neutral surfaces, used to present product screenshots within a real-world context; (2) full-bleed portrait photography for testimonials, warm-toned and slightly underexposed, with the subject's face partially in shadow. Both styles are desaturated, warm, and unglamorous — they feel like magazine photography, not marketing photography. Product UI itself is shown only as a screenshot inside the editorial photography, never as a floating mockup with shadow. The only other visual element is a small set of monochrome line icons (24px, Ink stroke) used sparingly for feature labels.

## Layout

Centered, max-width-1200px contained layout with full-bleed photographic sections breaking the container. The page rhythm is: minimal top nav → centered hero with oversized headline → monochrome logo strip → centered product section header (Sana Learn) on a Linen band with a 4-column feature row below → full-bleed editorial product showcase → full-bleed testimonial with overlaid quote → footer. Hero is a single centered headline with no hero image. Section transitions alternate between white and Linen #efefed bands rather than using dividers. Feature grids use 4 equal columns at 24-40px gaps. The entire layout breathes: vertical section gaps of 80-120px and generous internal padding give it the feel of a printed document rather than a dashboard.

## Similar Brands

- **Linear** — Same near-total achromatic restraint with one chromatic accent reserved exclusively for primary action, pill-shaped buttons, and tight custom-feeling type with aggressive negative tracking
- **Stripe** — Same editorial-monograph voice: white canvas, oversized headlines with tight tracking, flat surfaces with no shadows, and color used only as functional punctuation on CTAs
- **Notion** — Same warm off-white banding and the practice of letting monochrome photography carry the emotional weight of the page in place of decorative color
- **Vercel** — Same ruthless typographic confidence — a single geometric sans-serif set tight and large, with almost no color and no shadows, and a single blue used for the decisive action
