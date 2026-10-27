# Awesomic — Style Reference
> editorial zinc grid with confetti-orange punctuation.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Awesomic operates in a restrained, neutral-first visual register: a zinc-gray scale carries nearly the entire interface, with one vivid orange badge accent and almost no other chromatic intrusion. The geometry is defined by generous corner rounding — 36px cards, 14px buttons, 10000px pills — and hairline 1px borders replace drop shadows as the primary elevation tool. Typography is a single custom geometric sans (Cosmica) deployed at bold display weights (56–64px / weight 600) for editorial headlines, paired with compact 14px body text that signals efficiency. The atmosphere is that of a confident, infrastructure-grade marketplace: quiet surfaces, precise density, and color deployed as functional punctuation rather than decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#09090b` | Primary action buttons, hero headlines, dominant text — the deepest near-black that grounds every dark CTA and display heading against the light canvas |
| Graphite | `#18181b` | Body text, nav text, badge text — the working ink color across paragraphs, links, and labels |
| Slate | `#27272a` | Secondary headings and elevated card surfaces — a mid-dark gray for cards that need visual weight |
| Iron | `#3f3f46` | Muted text, button labels on light surfaces, badge text — the mid-gray used for secondary UI labels and outlined-button text |
| Steel | `#52525b` | Icon strokes, supporting metadata — borders and icon outlines in darker contexts |
| Fog | `#71717a` | Helper text, tertiary labels — muted copy and supporting metadata |
| Ash | `#a1a1aa` | Placeholder text, disabled labels, light icon strokes — the lightest readable gray |
| Mist | `#d4d4d8` | Subtle borders, secondary card fills, link pill backgrounds — structural divider color |
| Cloud | `#ececee` | Primary border color across the system — 1px hairline rules on cards, badges, and inputs |
| Paper | `#f4f4f5` | Canvas background, card surfaces, badge fills — the warm-cool gray that carries the page surface |
| Snow | `#ffffff` | Elevated surfaces (cards on canvas), input fields, button backgrounds for ghost/neutral actions |
| Ember | `#ff5a00` | Accent badges (YC batch tags, highlight chips) — the single vivid color in the system, used sparingly for startup credentials and category emphasis |
| Magenta Spark | `#fe45e2` | Rare decorative card accent — used on one hero card as visual punctuation against the monochrome grid |

## Typography

### Cosmica — Single-family type system for everything: 56–64px weight 600 display headlines with tight 1.12–1.28 line-height, 32–40px weight 600–700 section headings, 14–16px weight 400 body and UI text, 12–13px weight 400 badge and meta labels
- **Substitute:** DM Sans
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 10, 12, 13, 14, 15, 16, 18, 20, 32, 40, 56, 64
- **Line height:** 1.0–1.8
- **Letter spacing:** normal across all steps (no tracking adjustments detected)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.64 | — |
| body | — | — | 15px | 1.45 | — |
| body-lg | — | — | 18px | 1.45 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 32px | 1.5 | — |
| heading | — | — | 40px | 1.28 | — |
| heading-lg | — | — | 56px | 1.28 | — |
| display | — | — | 64px | 1.12 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 28px
- **Element gap:** 8px

### Border Radius

- **cards:** 36px
- **icons:** 40px
- **pills:** 10000px
- **badges:** 12px
- **inputs:** 14px
- **buttons:** 14px

## Components

### Primary Action Button (Dark Filled)
**Role:** Main CTA — 'Book demo', 'Get started', 'Get match'

Background #09090b, white text (#ffffff), 1.5px solid #2c2e34 border with subtle inset highlight shadow, 14px border-radius, 12px vertical / 16px horizontal padding, 14px Cosmica weight 400. The near-black fill with hairline border creates depth without a drop shadow.

### Ghost Action Button (White)
**Role:** Secondary CTA on dark backgrounds

Background #ffffff, dark text (#3f3f46), 1px solid #3f3f46 border, 36px pill radius, 20px all padding, 14px Cosmica. Used in nav and contrasting on dark sections.

### Neutral Pill Button (Light)
**Role:** Subtle action on light backgrounds — 'Our work'

Background #fafafa, text #18181b, 14px border-radius, 12px vertical / 16px horizontal padding, 14px Cosmica weight 400. No visible border — relies on the subtle background contrast.

### Category Card (Image Top)
**Role:** Service category showcase — 'Web & product', 'Motion design'

Full-width image fills the top half, 36px border-radius, 28px bottom padding, no shadow. Title overlay or below image at 20px Cosmica weight 600. Tag pills sit inside the card at bottom.

### Dark Feature Card
**Role:** Pain-point listing with arrow bullets

Background #27272a or #18181b, white text, 28–36px border-radius, 24px padding. Each list item has a 20px Cosmica weight 500 with right-arrow accent. Creates a dark band that contrasts with the light page.

### Tag Pill Badge
**Role:** Category tags — 'Web', 'UX/UI design', 'Mobile app'

Transparent background with 1px solid #ececee border, text #18181b, 12px border-radius, 4px vertical / 8px horizontal padding, 12–13px Cosmica weight 400. Hairline border treatment keeps tags quiet.

### Filled Tag Badge
**Role:** Accent tags — 'Software development', 'Marketing'

Background #3f3f46, text #fafafa, 12px border-radius, 4px/8px padding. Used for skill/category labels that need more visual weight than outlined tags.

### Orange Accent Badge
**Role:** YC batch badges, highlight chips

Background #ff5a00, white text, 12px border-radius, 4px/8px padding. The sole chromatic badge — reserved for startup credibility signals and category emphasis.

### Email Input Field
**Role:** Hero email capture, newsletter signup

White background (#ffffff), text #333333, 14px border-radius, 12px vertical / 16px horizontal padding, 1px transparent border. Pairs directly with a dark CTA button to its right.

### Logo Strip
**Role:** Social proof — partner/client logos

Grayscale logos (Coca-Cola, Disney, Genesis, Udemy, EY) rendered in #71717a at 60–70% opacity, horizontally centered with even spacing. No background container.

### Stats Block
**Role:** Headline metrics — '20 000+ completed projects'

Large number at 40–56px Cosmica weight 600 in #09090b, adjacent descriptor at 14px weight 400 in #52525b. Minimal spacing between number and label.

### Breakthrough Image Section
**Role:** Full-bleed visual divider — landscape/moss

Full-width photographic image (no overlay, no text), 48px or 64px corner radius on top corners, functions as a visual breath between content sections.

### Navigation Bar
**Role:** Top-level site navigation

Sticky white header, logo left, nav links center (14px Cosmica), login + dark CTA button right. No visible border — floats on canvas.

## Do's and Don'ts

### Do
- Use #09090b for all primary action buttons — the dark filled CTA is the system’s single most important interactive element
- Set card border-radius to 36px and rely on 1px solid #ececee borders instead of shadows for elevation
- Keep body text at 14–15px Cosmica weight 400 in #18181b — compact, dense, marketplace-grade
- Reserve #ff5a00 exclusively for YC-style accent badges and startup credential chips — never use it for general UI
- Use 56–64px Cosmica weight 600 with line-height 1.12–1.28 for hero and section display headlines
- Apply 28px padding inside cards and 80px vertical rhythm between major page sections
- Use 10000px border-radius for pill-shaped CTAs in the navigation, and 14px for inline action buttons

### Don't
- Do not introduce new accent colors — the system is 99% achromatic; adding blues, greens, or purples would break the restrained editorial register
- Do not use drop shadows on cards — hairline borders at 1px solid #ececee are the only permitted elevation on content surfaces
- Do not set display headlines below weight 600 — the bold weight is what makes the editorial typography read as authoritative
- Do not use #ff5a00 for body text, links, or large fills — it’s a badge color, not a brand color for general UI
- Do not use border-radius below 12px on any container — the system’s geometry is defined by generous rounding
- Do not break the single-font rule — Cosmica handles every typographic role from 10px badges to 64px displays
- Do not use pure black (#000000) — #09090b is the deepest permitted ink, keeping warmth in the neutrals

## Elevation

- **Primary Dark Button:** `inset 0 0.5px 0 0 rgba(255,255,255,0.5), inset 0 9px 14px -5px rgba(117,123,133,0.4), 0 0 0 1.5px rgb(44,46,52), 0 4px 6px 0 rgba(0,0,0,0.14)`
- **Card:** `none — uses 1px solid #ececee hairline border instead`
- **Link/Pill:** `inset 0 1px 0 0 rgb(228,228,231)`

## Surfaces

- **Canvas** (`#f4f4f5`) — Page background — the warm-cool gray that fills the viewport
- **Card** (`#ffffff`) — Elevated content surfaces sitting on the canvas
- **Subtle Card** (`#fafafa`) — Slightly recessed surfaces within content areas
- **Dark Surface** (`#18181b`) — Dark feature blocks and inverted sections
- **Deep Dark** (`#27272a`) — Darker feature cards and dark mode accents

## Imagery

Photography plays a structural role rather than decorative: full-bleed landscape/macro nature shots (green moss, organic textures) serve as visual dividers between content sections, creating breath and warmth in an otherwise monochrome grid. Category cards use real product/work imagery — screenshots of apps, video thumbnails, design portfolios — filling the top half of rounded card containers. No illustrations or abstract graphics; no 3D renders. Logos in social-proof strips are desaturated to grayscale. Image treatment: no overlays, no duotone, no masks — raw photography with generous corner-radius (48–64px) to integrate with the rounded geometry of cards and sections. The overall density is image-medium: roughly 30–40% of viewport is photographic, concentrated in category showcases and breakthrough sections.

## Layout

The page follows a centered max-width (1200px) container with generous vertical rhythm (80px section gaps). The hero is a split composition: massive left-aligned headline (56–64px) with rotating keyword animation, paired with a compact right-aligned email-capture form and supporting paragraph. Below the hero, a horizontal scroll of category image-cards creates a portfolio band. The mid-page alternates light card sections with dark feature blocks — a rhythm of #f4f4f5 canvas, white cards, then inverted dark surface for pain-point lists. Stats appear as a horizontal row of three large-number blocks. A full-bleed nature photograph breaks the grid before testimonial/social-proof sections. Navigation is a sticky white top bar with logo left, centered nav links, and a dark CTA right. The overall feel is editorial-magazine meets marketplace dashboard: spacious section gaps but compact internal card density.

## Similar Brands

- **Linear** — Same monochromatic zinc-gray palette with hairline borders replacing shadows, and similarly compact 14px body text on generous rounded cards
- **Vercel** — Dark filled CTAs on white canvas, large bold geometric display headlines, and near-zero chromatic palette with functional color only
- **Stripe** — Editorial-grade typography with bold display weights at 48–64px, generous section spacing, and hairline border card treatments
- **Framer** — Rounded geometry (28–36px cards), neutral-first palette with occasional vivid accent, and marketplace-style dense information layout
