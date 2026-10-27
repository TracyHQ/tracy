# WGSN — Style Reference
> editorial monochrome showroom

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

WGSN reads as an editorial monochrome showroom: a trend-forecasting catalog rendered in pure grayscale on warm-white paper. The system is defined by total chromatic absence — zero brand color — which pushes photography and editorial typography to do all emotional work. Surfaces alternate between cold pure white and a warm bone tint (#f6f2eb), with deep charcoal panels creating high-contrast hero zones. Components are confidently minimal: pill-shaped controls (40px radius), generously rounded image cards (16px), hairline borders instead of shadows, and a single sans-serif (DM Sans) carrying every voice from 12px metadata to a 92px display headline. The result feels like a high-end print magazine translated to web — restrained, premium, and image-led.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Primary canvas, card surfaces, button text, and the base against which every other neutral is measured. Carries ~21:1 contrast with deep charcoal for all body and display text |
| Bone Warm | `#f6f2eb` | Secondary surface wash — the system's only warm neutral. Used as a soft section background to break white-on-white monotony and evoke paper-stock texture. Contrasts 14.4:1 with charcoal text |
| Ash Mist | `#f5f5f5` | Input field backgrounds, inset card wells, and disabled surface states. The cool-gray complement to Bone Warm — use the warm tone for sections, the cool tone for form wells |
| Graphite Border | `#666666` | Default hairline border color (444 border usages — by far the most-used neutral in the system). Also used for muted helper text and icon outlines. The structural divider color of the entire UI |
| Smoke Border | `#999999` | Secondary hairline borders and placeholder text — used when #666666 would feel too heavy against a light surface |
| Pearl Border | `#cccccc` | Subtle dividers and very light borders in nav-adjacent contexts where separation should be nearly invisible |
| Silver Border | `#bdbdbd` | Light link borders, particularly for outlined navigation links that need separation without emphasis |
| Slate Text | `#333333` | Secondary body copy, link borders, and UI text that should recede from primary content. Pairs with Paper White for ~12.6:1 contrast |
| Carbon Input | `#495057` | Input field text color — a cool desaturated charcoal that feels typographic rather than aggressive, distinct from the warmer #333333 used elsewhere |
| Obsidian | `#212121` | Primary action fill, primary nav background, and the deepest neutral in the system. Used for the filled CTA button, sticky header band, and dark surface blocks. Contrasts 16.1:1 with white — strong enough for any text role |
| Pure Black | `#000000` | Maximum-emphasis text, heading borders, and accent strokes. Reserved for the most important typographic moments and thin rule lines — never used as a large fill surface (use Obsidian instead) |

## Typography

### DM Sans — Sole typeface across all UI, body, and display contexts. A geometric-humanist sans with optical-size-friendly proportions — its clean terminals and open counters let it survive at 12px metadata and 92px display equally well. Weight 400 carries all body and utility text; weight 500 handles button labels and emphasized inline text; weight 700 is reserved for headlines and section titles. The 92px display step is the system's signature — used for hero statements with tight tracking (letter-spacing: -0.0110em) to give display headlines a condensed, editorial authority. All-uppercase button and label text uses the wider 0.0560em tracking for letterform breathing room.
- **Substitute:** Inter, Manrope, or system-ui sans-serif as fallback
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 13, 14, 16, 17, 18, 20, 24, 28, 32, 36, 40, 48, 92
- **Line height:** 0.79, 1.10, 1.17, 1.18, 1.20, 1.33, 1.50, 1.60, 1.90
- **Letter spacing:** Display headlines: -0.0110em (tight, editorial). Uppercase labels and buttons: 0.0560em (wide, legible). Body and utility text: normal tracking.
- **OpenType features:** `Use 'ss01' stylistic alternates where available for the more geometric 'a' and 'g' — reinforces the editorial character.`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.6 | — |
| body | — | — | 16px | 1.6 | — |
| body-lg | — | — | 18px | 1.6 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading | — | — | 28px | 1.2 | — |
| heading-lg | — | — | 32px | 1.2 | — |
| display-sm | — | — | 40px | 1.17 | — |
| display | — | — | 48px | 1.17 | -0.53px |
| display-lg | — | — | 92px | 0.79 | -1.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 18px

### Border Radius

- **cards:** 16px
- **badges:** 40px
- **images:** 16px
- **inputs:** 8px
- **buttons:** 40px

## Components

### Pill Primary Button
**Role:** The system's sole filled action — used for 'Request a demo', 'Log in', and high-intent CTAs.

Filled Obsidian (#212121) background, Paper White (#ffffff) text, DM Sans weight 500 at 14–16px, horizontal padding 18px, vertical padding 11–13px, border-radius 40px (full pill). No border. Text uses 0.0560em letter-spacing when uppercase. Hover lifts to Pure Black (#000000).

### Pill Ghost Button
**Role:** Secondary action — paired alongside the primary to offer a low-commitment alternative.

Transparent background, Graphite Border (#666666) 1px border, Obsidian (#212121) text, DM Sans weight 500 at 14–16px, padding 12–13px vertical / 18px horizontal, border-radius 40px. Hover swaps to Ash Mist (#f5f5f5) fill.

### Pill Nav Link
**Role:** Top-bar navigation items and language switcher.

Transparent background, Slate Text (#333333) or Obsidian (#212121) text, DM Sans weight 400 at 14–16px, padding 8px 13px, border-radius 40px. Active state fills with Ash Mist (#f5f5f5).

### Image Feature Card
**Role:** Hero of content sections — editorial image with headline and body copy. Used in the 4-column grid for product offerings.

Pure white surface, no border, no shadow. Top image container with 16px border-radius (the image corners are rounded, not the card itself). Below image: 24px card padding, headline in DM Sans weight 600–700 at 20–24px Obsidian, body in weight 400 at 16px Slate Text (#333333). Gap between image and text block: ~18px.

### Hero Panel
**Role:** First-screen hero block with image collage and large display headline.

White or Obsidian (#212121) background, display headline at 48–92px in DM Sans weight 700 with -0.0110em letter-spacing. Eyebrow text in weight 500 at 14–16px with 0.0560em tracking. Left-aligned text beside an image collage (rounded 16px images overlapping at angles). Filled primary button anchors below the headline.

### Text Input
**Role:** Form fields for email, search, and data entry.

Ash Mist (#f5f5f5) background, Graphite Border (#666666) 1px border, border-radius 8px, vertical padding 4–5px, horizontal padding 12–13px. Placeholder in Smoke Border (#999999) at 14–16px. Input text in Carbon Input (#495057) at 14–16px DM Sans weight 400. Focus state darkens border to Obsidian.

### Top Navigation Bar
**Role:** Primary site navigation — sticky on scroll.

Paper White (#ffffff) background, bottom hairline border in Graphite Border (#666666). Logo on left at 24–28px DM Sans weight 700, then pill nav links centered or left-aligned, then language switcher + ghost login link + filled primary CTA on the right. Height ~64px with 16px horizontal page padding.

### Dark Feature Band
**Role:** Mid-page section that flips to dark surface for visual punctuation and contrast.

Obsidian (#212121) background, Paper White (#ffffff) text. Display headlines at 40–48px in DM Sans weight 700, body in weight 400 at 16–18px. Often contains a 2-column layout with text on one side and an image on the other, separated by ~80px section padding.

### Editorial Section Header
**Role:** Subsection title that introduces a row of cards or a content block.

DM Sans weight 600 at 28–32px Obsidian (#212121), optional 14px eyebrow above in Smoke Border (#999999) with 0.0560em tracking and uppercase. 18–24px gap between eyebrow and headline, then ~48px to the first content block.

### Pill Badge / Tag
**Role:** Inline metadata — category labels, region tags, article badges.

Transparent or Ash Mist background, Graphite Border (#666666) 1px border, Obsidian text, DM Sans weight 500 at 12–13px with 0.0560em tracking (uppercase), border-radius 40px, padding 4px 12px.

### Hairline Link
**Role:** Inline and standalone text links — the most common interactive text element.

Obsidian (#212121) text, DM Sans weight 400–500 at 14–18px, no underline by default. 1px bottom border in Graphite Border (#666666) that thickens to Obsidian on hover — this inset 1px border is the system's only 'shadow' pattern and its signature interactive treatment.

### Footer
**Role:** Closing navigation and legal block.

Paper White background, 1px top border in Graphite Border (#666666). Multi-column link list in DM Sans weight 400 at 14px Slate Text (#333333). Section headers in weight 600 at 14px Obsidian with 0.0560em tracking uppercase. ~64px vertical padding.

### Image Collage Block
**Role:** Editorial hero treatment — multiple overlapping photographs in a staggered layout.

Three to five images, each with 16px border-radius, arranged in a loose asymmetric grid with ~12–16px gaps. No borders, no shadows — the rounded corners and intentional overlaps carry the visual interest. Images retain their natural color (this is where the only color in the system appears, via photography).

## Do's and Don'ts

### Do
- Use pill radius (40px) for every button, tag, and nav link — pill geometry is the system's strongest signature shape.
- Use 16px radius for all images, image cards, and image containers — keep this consistent across the entire site.
- Use 8px radius for inputs only — a deliberate contrast with the pill buttons that signals interactivity without softness.
- Reach for #f6f2eb (Bone Warm) as the section background between two white bands — the warm tint is the only way this achromatic system creates rhythm.
- Set display headlines at 48–92px in DM Sans weight 700 with letter-spacing -0.0110em (≈ -0.53px at 48px, ≈ -1.01px at 92px) — tight tracking is what makes the type feel editorial rather than corporate.
- Use uppercase labels and button text with letter-spacing 0.0560em for breathing room — never use uppercase without expanding the tracking.
- Use hairline 1px borders in #666666 for all dividers and interactive affordances instead of shadows — the system deliberately avoids elevation in favor of line.

### Don't
- Never introduce chromatic color — the system is 0% colorful by design, and any accent hue would break the editorial monochrome logic.
- Never use shadows for elevation — the only shadow pattern in the system is the 1px inset border on links; do not add drop shadows to cards or buttons.
- Never use #000000 as a large filled surface — use #212121 (Obsidian) for dark backgrounds and reserve pure black for text and thin accent strokes only.
- Never use sharp 0px corners on images or cards — everything that contains an image uses 16px radius; flat-cornered images would feel foreign.
- Never use display-weight tracking on body text — the -0.0110em is calibrated for 40px+ sizes; applying it to 16px body copy will over-condense letters and hurt readability.
- Never use uppercase for body copy — uppercase is reserved for eyebrows, badges, and button labels where the 0.0560em tracking provides necessary letter spacing.
- Never use the warm Bone Warm (#f6f2eb) for form fields or interactive surfaces — it is a sectional wash only; form wells should use the cool Ash Mist (#f5f5f5) to signal input.

## Elevation

The system deliberately avoids drop shadows and elevation effects. The only 'shadow' pattern detected is a 1px inset border on links (rgb(0,0,0) 0px 0px 0px 1px inset) — used to create a subtle inner line that mimics a printed underline. Separation between elements is achieved through hairline 1px borders in #666666, generous whitespace, and the occasional warm Bone Wash (#f6f2eb) section background. This flat-by-design approach reinforces the editorial, print-catalog feel — surfaces should feel like pages laid on a table, not cards floating in a digital space.

## Surfaces

- **Paper White** (`#ffffff`) — Base canvas for the majority of the page — all content sections, card backgrounds, and form surfaces.
- **Ash Mist** (`#f5f5f5`) — Input fields and inset wells — slight cool lift from the paper canvas to indicate interactivity.
- **Bone Warm** (`#f6f2eb`) — Sectional warm wash — used between content bands to create editorial pacing and break monochrome fatigue.
- **Obsidian** (`#212121`) — Dark surface block — hero panels, navigation, filled actions. The only dark surface tier in the light theme.
- **Pure Black** (`#000000`) — Reserved for maximum-contrast accent moments — not a background tier, only for type and strokes.

## Imagery

Photography is the sole source of color in an otherwise achromatic system. WGSN uses tightly cropped, high-quality editorial product and lifestyle photography — fashion, food, materials, interiors — treated with natural color and studio lighting (no duotone or desaturation filters). Images are always presented in 16px-rounded containers, never full-bleed, and frequently composed as multi-image collages with 12–16px gaps and gentle overlaps. Iconography is monochrome line-based, drawn in #333333 or #212121 at consistent 1.5–2px stroke weight. No illustrations, no 3D renders, no abstract graphics — the photography does all the decorative work, and the UI frames it like a museum wall.

## Layout

The page model is max-width contained (1280px) with full-bleed sectional bands. The hero is a full-viewport-height dark or white panel with a left-aligned display headline (48–92px) and an image collage on the right, anchored by a filled primary button. Below the hero, content flows in alternating white and Bone Warm (#f6f2eb) bands, each with 80px vertical section padding. Feature offerings appear in a 4-column card grid (each card is image-top, text-bottom) on white. A single dark Obsidian (#212121) feature band appears mid-page for contrast punctuation, then returns to white. Spacing is generous and editorial — sections breathe with 80px gaps, never crammed. Navigation is a sticky 64px top bar with left logo, center pill nav links, and right-side language switcher + ghost login + filled CTA. Grid is rigid 4-column at desktop, collapsing to 2-column on tablet and single-column on mobile.

## Similar Brands

- **The New York Times Style Magazine** — Same editorial-monochrome philosophy with a single warm-white paper stock, large display sans-serif headlines, and photography as the only source of color.
- **Aesop** — Equally restrained achromatic palette with warm bone neutrals, generous whitespace, and pill-shaped UI controls — both brands trust typography and photography over chromatic accents.
- **Kinfolk Magazine** — Same catalog-as-website approach: paper-white canvas, soft warm section washes, large rounded image cards, and DM Sans-family geometric sans-serif for all type.
- **Mr Porter** — Premium editorial e-commerce with monochrome UI, image-led card grids, and 16px-rounded product imagery framed by hairline borders instead of shadows.
- **SSENSE** — High-contrast black-and-white editorial storefront with editorial display typography, alternating light/dark sections, and pill-shaped navigation.
