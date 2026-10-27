# Waabi — Style Reference
> Concrete monolith with molten-pink ignition. Warm gray editorial canvas where a single chromatic accent cuts through like a signal flare.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Waabi reads as an editorial-tech manifesto: warm concrete canvas, oversized custom display type set in tight blocks, and a single molten-pink accent that makes every interactive surface unmistakable. The page breathes — most of the canvas is empty warm gray, then content lands as confident white panels or dramatic type. Everything monochrome until you need action, at which point #ff2c6b does the entire job. Components are sparse, pill-shaped, and prefer thin borders and flat surfaces over shadows or gradients. The rhythm is large-to-larger: hero headlines at 130–150px with 0.85 line-height, then a drop to 24–40px for body, creating a magazine-scale hierarchy rather than a UI scale.

## Colors

| Name | Value | Role |
|------|-------|------|
| Hot Signal | `#ff2c6b` | Red action color for filled buttons, selected navigation states, and focused conversion moments. |
| Carbon | `#191818` | Primary text, heading text, border lines, icon strokes — near-black with a faint warm cast; the dominant neutral carrying all structural information |
| Paper White | `#ffffff` | Light neutral action fill for buttons on dark surfaces. |
| Concrete | `#e8e6e3` | Page background, hero canvas, section bands — the warm neutral that defines the site's atmosphere; slightly desaturated and warm-toned, not cool gray |
| Ash | `#8c8b8b` | Muted helper text, secondary borders, caption labels — warm mid-gray for non-load-bearing information |
| Smoke | `#808080` | Tertiary text, disabled states, inactive borders — sits between Ash and Carbon in the warm-gray scale |
| Slate | `#d1d5dc` | Cooler secondary card surface, placeholder or empty-state panels — the only cool-tinted neutral, used sparingly to separate distinct UI layers |
| Ink | `#000000` | Pure black for icons and link borders where maximum contrast is required — used selectively, not as a general text color |

## Typography

### Zagma — Display and heading typeface — all hero headlines, section titles, and large editorial copy. The 0.85 line-height at 150px is the signature: type stacks into tight, sculptural blocks rather than airy paragraphs. Negative tracking tightens with scale (from -0.020em at 40px to -0.048em at 150px) to keep large glyphs from feeling spaced-out.
- **Substitute:** GT Sectra Display, Saol Display, or PP Editorial New
- **Weights:** 400
- **Sizes:** 10px, 16px, 20px, 24px, 40px, 60px, 80px, 130px, 150px
- **Line height:** 0.85, 0.90, 1.10, 1.20, 1.25, 1.40, 1.50
- **Letter spacing:** -0.048em at 150px, -0.040em at 80px, -0.030em at 60px, -0.020em at 40px
- **OpenType features:** `"liga" on`

### NeueHaas — UI and body text — nav items, button labels, captions, helper text, link text. Set at micro sizes (10–15px) with slightly open tracking (+0.010em to +0.020em) to stay legible at small scale. Weight 500 reserved for nav and button emphasis; 400 for everything else.
- **Substitute:** Neue Haas Grotesk, Inter, or Söhne
- **Weights:** 400, 500
- **Sizes:** 10px, 11px, 12px, 15px
- **Line height:** 1.40, 1.60
- **Letter spacing:** 0.0100em, 0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | 0.1px |
| heading-sm | — | — | 24px | 1.25 | -0.48px |
| heading | — | — | 40px | 1.2 | -0.8px |
| heading-lg | — | — | 60px | 1.1 | -1.8px |
| display | — | — | 80px | 0.9 | -3.2px |
| display-xl | — | — | 150px | 0.85 | -7.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **pill:** 9999px
- **cards:** 12px
- **panels:** 40px
- **buttons:** 50px
- **thumbnails:** 12px

## Components

### Navigation Bar
**Role:** Top-level site navigation

White (#ffffff) pill-shaped bar with 50px border-radius, floating on the warm concrete canvas. Contains wordmark 'waabi' in Zagma 16px weight 400, nav links in NeueHaas 12–15px weight 500 at +0.02em tracking, and a hamburger icon. No drop shadow — the pill shape and white surface do the lifting. Padding approximately 10px vertical, 24px horizontal.

### Hero Display Headline
**Role:** Primary page headline

Set in Zagma weight 400 at 130–150px with line-height 0.85 and letter-spacing -0.048em. Two-line stacks are the norm (e.g. 'Built to think. / Born to haul.'). Color #191818 on the warm concrete canvas. The tight line-height makes each line pair read as a single sculptural block.

### Section Headline
**Role:** In-content section titles

Zagma weight 400 at 40–60px, line-height 1.1–1.2, letter-spacing -0.030em to -0.020em. Ends with a period as a recurring typographic device ('Insights.', 'Technology.'). Color #191818 on concrete or white surface.

### Primary Action Button (Filled Pink)
**Role:** Main CTA

Pill shape with 50px border-radius. Fill #ff2c6b. Text in NeueHaas 12px weight 500, color #ffffff, tracking +0.02em. Padding 10px vertical, 24px horizontal. No shadow. The pink fill is the loudest element on the page; never use it for anything decorative.

### Outlined Action Button
**Role:** Secondary CTA

Pill shape with 50px border-radius. Transparent fill, 1px border in #191818. Text NeueHaus 12px weight 500, #191818. Same padding as filled variant (10px / 24px). Used when a secondary action shares space with the primary pink button.

### Ghost/Text Button
**Role:** Tertiary link-style action

No border, no background. NeueHaas 12–15px weight 500, color #191818, with an arrow or chevron. Used for 'View all', navigation, and low-emphasis actions within content blocks.

### Content Card
**Role:** Article or insight thumbnail

White (#ffffff) surface on the concrete canvas, 12px border-radius. Internal padding 16–24px. Image fills the top portion at the same 12px radius (top corners only). No drop shadow — the white-on-warm-gray contrast provides the separation. Border 1px #191818 in some variants.

### Image Thumbnail
**Role:** Small visual content blocks

12px border-radius square crops, approximately 80–120px, used as inline visual accents within content sections (truck images, technology shots). Sit directly on the concrete canvas with no frame or border.

### Announcement Banner
**Role:** Top-of-page promotional strip

Full-width white bar at the very top of the page. NeueHaas 11–12px weight 400–500 text in #191818, centered. Contains an inline text link with underline in #191818. Dismissible via × icon at right edge. Height ~32px.

### Dark Info Panel
**Role:** Hero-adjacent content block

Dark #191818 surface, rounded 12px corners. Contains a circular progress indicator (ring chart) and a filled pink CTA button. Used to pair supplementary information with the hero image or headline.

### Carousel Navigation Controls
**Role:** Card carousel pagination

Circular 40px controls with 1px #191818 border, containing left/right chevron arrows. Filled variant (pink #ff2c6b) for the 'View all' or primary navigation target; outlined for directional arrows.

### Link
**Role:** Inline text links

NeueHaas 12–15px weight 400–500, color #191818, underlined. No color change on hover — the system communicates interactivity through weight or arrow appendage rather than color shift.

## Do's and Don'ts

### Do
- Use Zagma only for display and heading roles — never for body copy, captions, or UI labels. Below 24px it becomes illegible and loses its sculptural character.
- Set the hero headline at 130–150px with line-height 0.85 and letter-spacing -0.048em. This tight, stack-like block is the system's most recognizable typographic gesture.
- Use #ff2c6b exclusively for primary actions and active states. Never use it for decorative accents, illustrations, or informational UI.
- Keep the concrete canvas (#e8e6e3) dominant. White cards and panels should feel like placed objects, not the default surface.
- Use pill-shaped buttons (50px radius) for all interactive elements. The pill is non-negotiable and defines the system's interaction language.
- End section headlines with a period ('Insights.', 'Technology.') — this is a recurring typographic signature in the Zagma display style.
- Set body and UI text in NeueHaas at 10–15px with +0.01em to +0.02em letter-spacing. Never tighten tracking on text below 20px.

### Don't
- Do not use drop shadows, gradients, or blur effects. The system relies on flat color contrast and shape for depth, not elevation effects.
- Do not introduce additional chromatic colors. The palette is concrete, white, carbon, and one pink signal. Adding any other hue breaks the editorial restraint.
- Do not set body copy in Zagma. Zagma at small sizes is a legibility failure; reserve it for 24px and above.
- Do not use line-height above 1.0 for display headlines above 60px. The tight 0.85–0.90 stacking is what makes the large type feel sculptural rather than airy.
- Do not apply #ff2c6b to backgrounds, cards, or large surfaces. The pink works only at button-scale and small accent scale — it is a spark, not a paint.
- Do not use square or small-radius corners on buttons or major containers. The pill (50px) and the 12px card radius are the only two shape signatures.
- Do not use cool grays or blue-tinted neutrals. The entire neutral scale is warm-toned (#e8e6e3, #8c8b8b, #191818) — introducing cool tones shifts the atmosphere immediately.

## Elevation

The system deliberately avoids drop shadows. Depth is achieved entirely through surface contrast: warm concrete canvas, white cards, and dark carbon blocks stacked by tone, not by blur. This keeps the aesthetic flat, editorial, and fast.

## Surfaces

- **Concrete Canvas** (`#e8e6e3`) — Page background, hero backdrop, section bands — the warm gray that defines the site's atmosphere
- **Paper White** (`#ffffff`) — Card surfaces, content panels, navigation pill, button fills — the 'lifted' surface sitting on the canvas
- **Slate Panel** (`#d1d5dc`) — Secondary or empty-state card surface, slightly cooler tone to differentiate from primary white cards
- **Carbon Block** (`#191818`) — Dark info panels, inverse surfaces for high-contrast content blocks paired with hero imagery

## Imagery

Photography is real, gritty, and product-focused: autonomous trucks on highways, highway infrastructure, industrial environments. Images are tightly cropped into square or rectangular thumbnails at 12px radius, presented without lifestyle staging or decorative framing. The trucks ARE the hero — no models, no city skylines, no abstract overlays. Hero images get full-bleed treatment on white background sections; supporting imagery appears in card grids at consistent 12px radius. The visual language is documentary-industrial, not aspirational-lifestyle.

## Layout

Max-width 1200px centered content within a full-bleed warm concrete canvas. Navigation is a floating white pill, not a full-width bar. Hero sections are asymmetric: oversized display type left-aligned in the lower portion of the viewport, with content (images, dark info panels) filling the upper-right quadrant. Section rhythm alternates between the warm concrete canvas and white card sections, separated by 96px vertical gaps. Content grids use 3-column card layouts for article/insight blocks, with consistent 16px gaps. Carousels appear for content collections with circular pill controls at the right edge. The overall density is spacious — large empty regions of concrete canvas are a feature, not a waste.

## Similar Brands

- **Figure AI** — Same warm-neutral canvas with oversized display type and a single high-saturation accent color for CTAs; both feel editorial rather than typical SaaS
- **Einride** — Shared industrial/documentary photography approach for autonomous vehicles, warm-toned neutral palette, and minimalist card-based content layouts
- **Wayve** — Similar oversized headline treatment on muted background, single-accent interactive system, and typographic-first page hierarchy that lets type do the branding
- **Sanctuary AI** — Warm gray canvas with dramatic display serif/sans headlines, pill-shaped CTAs, and flat surfaces without shadows or gradients
