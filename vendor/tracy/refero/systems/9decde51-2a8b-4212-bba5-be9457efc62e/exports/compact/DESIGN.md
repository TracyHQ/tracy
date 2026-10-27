# Oura Ring — Style Reference
> Warm oatmeal atelier under soft daylight

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Oura speaks in a warm, tactile language of skin and ceramic: a cream-oatmeal canvas (#f7f1e8), deep charcoal text, and photography that fills every viewport with human-scale detail. The type system pairs a precise grotesque (AkkuratLL) for everything functional with an editorial high-contrast serif (Editorial New) for emotional headlines — italic flourishes in the serif whisper rather than shout. Color is nearly absent by design: the entire palette lives in warm neutrals, with a single muted olive (#5b6550) used as the only chromatic accent. Components are quiet and rounded — pill buttons, 8px-radius cards, 12px-radius inputs, hairline 1px borders in #ececec. The feeling is luxury wellness: less technology product, more considered object you wear on your body.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream | `#f7f1e8` | Page canvas, hero backgrounds, card surfaces — the warm paper-white that makes every photograph feel tactile |
| Soft Charcoal | `#4a4741` | Body copy, secondary headings, button borders, input borders — warm near-black that sits softer than pure #000 |
| Pure Black | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Bone White | `#fefaef` | Secondary card surface, button border tint, subtle elevated panels |
| Stone Border | `#ececec` | Hairline dividers, image borders, card outlines, input borders — the structural 1px that holds the system together |
| Ash Mist | `#a8a5a0` | Muted helper text, secondary metadata, inactive nav, sub-labels |
| Slate Stone | `#838280` | Tertiary text, icon secondary states, disabled button text |
| Dusk | `#d3d1ce` | Subtle background fills for alternating sections, muted surface layer |
| Pure White | `#ffffff` | Text on dark fills, inverted button text, clean card highlights |
| Onyx Pill | `#222428` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Sage Whisper | `#5b6550` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |

## Typography

### AkkuratLL — Primary workhorse — body text, navigation, buttons, labels, UI chrome. Weight 400 for body, 500 for labels, 700 for emphasis. Light weights (200/300) appear in large display sizes for an airy editorial feel. Custom alternative: Inter, Neue Haas Grotesk, or Söhne.
- **Substitute:** Inter
- **Weights:** 200, 300, 400, 500, 700
- **Sizes:** 12, 14, 16, 18, 24, 40, 48, 80, 96
- **Line height:** 1.0–1.5
- **Letter spacing:** -0.05em at 96px, -0.025em at 48–80px, 0.025em at 12–14px, 0.05em at small caps
- **OpenType features:** `"kern" 1, "liga" 0, "dlig" 0, "onum" 0, "ss01" 0, "tnum" 0`

### Editorial New — Display serif reserved for hero headlines and emotional section titles. Light weight (100/300) with negative tracking creates high-contrast elegance. Italic cuts deliver the poetic 'Made for you.' moments. Custom alternative: GT Super, Canela, or Domaine Display.
- **Substitute:** GT Super
- **Weights:** 100, 300, 500
- **Sizes:** 30, 40, 80, 96
- **Line height:** 1.0–1.5
- **Letter spacing:** -0.025em across all sizes
- **OpenType features:** `"dlig" 0, "kern", "liga" 0, "onum" 0, "ss01" 0, "tnum" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.5px |
| body-sm | — | — | 14px | 1.5 | 0.35px |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 24px | 1.38 | — |
| heading | — | — | 40px | 1.25 | -1px |
| heading-lg | — | — | 48px | 1.25 | -1.2px |
| display | — | — | 80px | 1 | -2px |
| display-xl | — | — | 96px | 1 | -4.8px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **large:** 24px
- **small:** 4px
- **images:** 8px
- **inputs:** 12px
- **buttons:** 9999px

## Components

### Dark Pill Button (Primary)
**Role:** Primary CTA — filled, rounded-full, near-black on cream backgrounds

Background #222428, text #ffffff, border-radius 9999px, padding 14px 28px, font AkkuratLL weight 500 size 16px, letter-spacing 0.025em. Used for 'Discover Oura Ring 4', 'Shop', 'How It Works'.

### Ghost Pill Button (Secondary)
**Role:** Secondary action — outlined pill with no fill

Background transparent, border 1px #4a4741, text #4a4741, border-radius 9999px, padding 14px 28px, font AkkuratLL weight 500 size 16px. Used for 'Explore' next to Shop on product cards.

### Product Card (Lifestyle)
**Role:** Product showcase card with full-bleed photography

Full-bleed photographic background, 8px border-radius, 1px #ececec border, product name overlay in white (#ffffff) at 30–40px Editorial New weight 300, price label in body-sm AkkuratLL. Dark scrim at bottom for text legibility. Explore + Shop ghost buttons positioned bottom-right.

### Navigation Bar (Top)
**Role:** Primary site navigation with centered links

Transparent or #f7f1e8 background, no border, logo (Oura wordmark) left, nav links center (Shop, Health Features, Experiences, For Organizations) in AkkuratLL weight 400 size 14px #4a4741, account icon right. Dropdown carets in #838280.

### Announcement Bar
**Role:** Top promotional strip above nav

Background #f7f1e8, text #4a4741 AkkuratLL weight 400 size 14px, centered single line. Minimal, no border.

### Section Heading (Editorial)
**Role:** Large display headline for content sections

Editorial New weight 300 size 80–96px, color #4a4741 or #000000, letter-spacing -0.025em. Centered or left-aligned. Italic variant (weight 300 italic) for poetic phrases.

### Body Paragraph
**Role:** Standard body copy block

AkkuratLL weight 400 size 16–18px, line-height 1.5, color #4a4741, max-width ~600px for readability in body contexts.

### Text Input
**Role:** Form input for newsletter, account creation

Background transparent or #ffffff, border 1px #4a4741 or #ececec, border-radius 12px, padding 14px 20px, font AkkuratLL weight 400 size 16px #000000. Focus state: border darkens to #000000.

### Membership CTA Pill
**Role:** Dark pill button for membership conversion

Background #222428, text #ffffff, border-radius 9999px, padding 14px 28px, font AkkuratLL weight 500 size 16px. Same as primary button but used in lower-priority conversion contexts.

### Hero Overlay Card
**Role:** Small product teaser card overlaid on hero photography

Dark background (#222428 or #1c1b1a), 8px border-radius, product thumbnail left, title + CTA right, white text, positioned bottom-right of hero. Compact 320px width.

### Tab Navigation
**Role:** Horizontal tab strip for product feature sections

Underline-style tabs in AkkuratLL weight 400 size 16px, color #a8a5a0 (inactive) and #000000 (active), 2px solid #000000 underline on active tab. Spacing: 40px between tabs.

### Footer
**Role:** Site footer with link columns

Background #f7f1e8 or #d3d1ce, multi-column link lists in AkkuratLL weight 400 size 14px #4a4741, section headings weight 500 size 14px, generous 80px vertical padding.

## Do's and Don'ts

### Do
- Use Editorial New only for display headlines 30px and above — never for body text or UI labels
- Set body line-height to 1.5 and display line-height to 1.0–1.25 — the contrast between airy display and breathable body is a signature
- Use 8px border-radius for all cards and images, 9999px for all buttons, 12px for inputs — these three radii define the system's geometry
- Pair negative letter-spacing (-0.025em to -0.05em) with sizes 40px and above; use 0.025–0.05em positive tracking on 12–14px small text for refined micro-labels
- Default to #f7f1e8 cream as background; reach for #ffffff only when you need inverted contrast on a dark surface
- Use #5b6550 sage as the sole chromatic accent — restrict it to icon strokes and decorative moments, never use it for text or buttons
- Maintain 80px section gaps in long-form layouts; collapse to 40px only in product card grids

### Don't
- Do not use Editorial New for body copy, nav items, button labels, or any text under 30px — the serif is display-only
- Do not use pure #ffffff as the page background — the warm cream #f7f1e8 is what gives the system its tactile character
- Do not apply drop shadows to cards or panels — use 1px #ececec borders and surface differentiation instead
- Do not use #5b6550 for CTA buttons, links, or body text — it is decorative accent only
- Do not mix more than two typefaces in a single view — Editorial New for the headline, AkkuratLL for everything else
- Do not use fully saturated colors or bright hues — the entire palette lives in desaturated warm territory
- Do not break the 9999px button radius convention for rectangular buttons — all buttons are pills
- Do not use tight letter-spacing on small text — 12–14px sizes need positive tracking (0.025–0.05em) to breathe

## Elevation

Elevation is achieved through contrast, not shadow. The system relies on warm surface differentiation (cream → bone → dusk → onyx) and 1px #ececec hairlines rather than drop shadows. When shadows do appear, they are extremely soft and warm-tinted, barely perceptible. This keeps the interface feeling like printed paper rather than digital material.

## Surfaces

- **Cream Canvas** (`#f7f1e8`) — Base page background — warm paper-white that makes photography feel organic
- **Bone White** (`#fefaef`) — Secondary card or panel surface, subtle differentiation from canvas
- **Pure White** (`#ffffff`) — Inverted card surfaces, input fields, dark-on-light contrast zones
- **Dusk Layer** (`#d3d1ce`) — Alternating section bands, muted background fills for visual separation
- **Onyx** (`#222428`) — Dark surfaces — footer, hero overlay cards, filled buttons

## Imagery

Photography is the dominant visual element — always full-bleed, always human-scale, always warm-toned. Lifestyle shots show hands wearing the ring, close-cropped skin texture, soft natural light. No product-on-white clinical shots. Color treatment is warm and slightly desaturated, with golden-hour undertones. Icons are line-drawn and minimal, rendered in #5b6550 olive or #4a4741 charcoal. No illustrations, no 3D renders, no abstract graphics — the product and the human body are the only visuals.

## Layout

Full-bleed hero with a large editorial headline left-aligned over a warm photograph filling the viewport. Navigation floats transparently over the hero. Below the fold: two-column product card grid with full-bleed photography and overlay text. Content sections alternate between cream canvas and subtle dusk bands. Section headings are centered or left-aligned at display size. Footer is a wide multi-column layout. Max content width approximately 1280px with generous 80px section gaps. The rhythm is slow, spacious, editorial — never information-dense.

## Similar Brands

- **Aesop** — Same warm cream backgrounds, restrained near-monochrome palette, and serif-grotesque type pairing for luxury wellness positioning
- **Ganni** — Editorial serif display headlines over full-bleed warm lifestyle photography with pill-shaped ghost buttons
- **Mejuri** — Warm neutral canvas, pill buttons, lifestyle product cards with overlay text, and a single muted accent tone
- **M.Gemi** — Editorial New-style high-contrast serif for emotional headlines paired with clean grotesque body, warm paper-like backgrounds
- **By Far** — Warm cream canvas, oversized serif display type, ghost pill CTAs, and full-bleed warm-toned lifestyle photography
