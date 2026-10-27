# Modern Business Intelligence — Style Reference
> Sunlit greenhouse editorial

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mode uses a botanical-editorial language: a pale sage canvas (#eef2e3) replaces the usual sterile SaaS white, and a single chartreuse accent (#c8f169) punctuates actions with a sharp, almost fluorescent pop. The headline font is a custom serif (Grenette) at 56–96px with aggressive negative tracking — the words feel pulled tight, almost condensed, and they read like a magazine cover rather than a dashboard. Depth comes from a three-layer color stack (sage → forest green → chartreuse) rather than shadows; surfaces sit flat against each other and rely on hue contrast for hierarchy. Interactive elements use small 4px corner radii while cards and large surfaces use 16px, creating a consistent geometric vocabulary. The mood is confident, warm, and intellectual — BI without the corporate coldness.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pale Sage | `#eef2e3` | Page canvas, light card surfaces, eyebrow backgrounds, hero photo mats |
| Paper White | `#fcfcfc` | Elevated card surfaces, nav background, modals, footer |
| Ink Black | `#000000` | Primary text, icon strokes, hairline borders, ghost button outlines |
| Charcoal | `#242423` | Secondary text and icon fills — softer than pure black for muted UI elements |
| Deep Forest | `#043f2e` | Brand primary — dark section backgrounds, stat cards, nav text, primary text on light surfaces, dominant illustration color |
| Chartreuse Lime | `#c8f169` | Primary action button fill, accent highlights, tag/badge backgrounds, the singular chromatic punctuation across the UI |
| Forest Mid | `#2a6f2b` | Hover/active state for forest surfaces, secondary green used in chart highlights and stat card accents |
| Vivid Green | `#78c51c` | Tertiary accent — decorative chart strokes, data visualization secondary color, support to chartreuse |

## Typography

### Times (system serif fallback) — System fallback only — not a design choice. Appears in icon labels and tertiary link contexts where Graphik failed to load
- **Substitute:** Times New Roman
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.20

### Grenette — Display and section headlines — a custom serif used only at large sizes (36px+). The tight letter-spacing (-0.02em to -0.031em) and single weight (400) force hierarchy through size alone, creating an editorial authority that a bold sans-serif headline would destroy
- **Substitute:** Fraunces, Source Serif 4, Tiempos Headline
- **Weights:** 400
- **Sizes:** 16px, 36px, 56px, 70px, 72px, 96px
- **Line height:** 0.90, 1.10, 1.20, 1.31
- **Letter spacing:** -0.72px at 36px, -1.68px at 56px, -2.1px at 70px, -2.98px at 96px

### Graphik — Body, UI, buttons, navigation — the workhorse sans-serif. The 0.06em positive tracking at 12–18px creates uppercase eyebrow labels and small caps; the -0.01em at 36px tightens subheadings slightly. Weight 600 is reserved for nav and button labels, never body
- **Substitute:** Inter, Söhne, Untitled Sans
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 14px, 16px, 18px, 22px, 36px
- **Line height:** 1.00, 1.03, 1.10, 1.18, 1.20, 1.30, 1.44
- **Letter spacing:** 0.72–1.08px at 12–18px (eyebrow/uppercase), -0.36px at 36px (subheading)

### --fonts-sans — --fonts-sans — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.72px |
| body-sm | — | — | 14px | 1.3 | 0px |
| body | — | — | 16px | 1.3 | 0px |
| subheading | — | — | 18px | 1.44 | 0px |
| heading-sm | — | — | 22px | 1.2 | 0px |
| heading | — | — | 36px | 1.1 | -0.72px |
| heading-lg | — | — | 56px | 1.1 | -1.68px |
| display | — | — | 96px | 0.9 | -2.98px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 56-80px
- **Card padding:** 16-24px
- **Element gap:** 12-20px

### Border Radius

- **tags:** 9999px
- **cards:** 16px
- **inputs:** 4px
- **buttons:** 4px
- **largeSurfaces:** 16px

## Components

### Display Headline (Grenette Serif)
**Role:** Hero and section-spanning headlines

Grenette at 56–96px, weight 400, letter-spacing -0.031em to -0.02em, line-height 0.90–1.10. Color is always Deep Forest (#043f2e) on sage, or black on white. Never bold, never italic — the serif shape and tight tracking carry the weight.

### Section Heading (Grenette Serif)
**Role:** Mid-page section titles, card titles within forest-green sections

Grenette at 36px, weight 400, letter-spacing -0.02em (-0.72px), line-height 1.10. Inverts to Paper White (#fcfcfc) when sitting on Deep Forest background.

### Filled CTA Button (Chartreuse)
**Role:** Primary action — 'Try for free'

Background Chartreuse Lime (#c8f169), text Ink Black (#000000), 4px radius, 12px 20px padding, Graphik 16px weight 500. No border. Hover darkens toward Forest Mid (#2a6f2b). This is the only filled chromatic button in the system.

### Ghost CTA Button
**Role:** Secondary action — 'Request demo'

Transparent background, 1px Ink Black border, 4px radius, 12px 20px padding, Graphik 16px weight 500, Ink Black text. Inverts to white border/text on dark forest sections.

### Navigation Pill Button
**Role:** Top nav items, footer links

Transparent background, no border, Graphik 16px weight 500, 16px horizontal padding, 2px vertical padding. Active state shows a subtle underline or weight shift to 600.

### Pale Sage Card
**Role:** Feature cards, content blocks, image mats

Background Pale Sage (#eef2e3), 16px radius, 24px padding, no border, no shadow. The sage-on-sage disappears at the page level — cards are defined by content, not by elevation. Often wraps a photo with no inner padding on the image.

### Forest Stat Card
**Role:** Hero metric display, featured statistics

Background Deep Forest (#043f2e), 16px radius, 24px padding, Paper White (#fcfcfc) text. Used for the '8.2K' hero stat. Graphik weight 400 at large sizes, tight tracking. The card is dense — content sits close to edges.

### Paper White Elevated Card
**Role:** Pricing tiers, feature comparisons, modal content

Background Paper White (#fcfcfc), 16px radius, 24px padding, optional 1px hairline border. Used when the card needs to lift off the sage canvas without using shadow.

### Announcement Banner
**Role:** Top-of-page promotional strip

Full-width bar at the very top of the page. Pale Sage or white background, centered Graphik 14px text, 'Learn More' as a Chartreuse-filled pill link (4px radius) or inline bold link.

### Eyebrow Label
**Role:** Section pre-headlines, category tags

Graphik 12–14px weight 500, letter-spacing 0.06em (positive tracking), uppercase, Ink Black or Deep Forest. Sits above section headlines as a small all-caps category marker.

### Tag / Badge
**Role:** Feature tags, plan indicators

Chartreuse Lime (#c8f169) or Pale Sage (#eef2e3) background, Ink Black text, 4px radius (or 9999px for pill variant), 2px 8–12px padding, Graphik 12–14px weight 500.

### Hero Image Block
**Role:** Photography in hero and feature sections

Full-bleed or contained within a sage card, 16px radius when contained. Photos are warm, human, documentary-style — people at desks, teams collaborating — never staged stock. No overlay or duotone treatment.

### Icon
**Role:** UI icons, feature bullets, nav indicators

Stroke-based, 1.5–2px weight, Ink Black or Deep Forest stroke, no fill. Inverts to Paper White on dark sections. Simple geometric forms — no decorative flourishes.

## Do's and Don'ts

### Do
- Use Deep Forest (#043f2e) for all body text on Pale Sage or Paper White surfaces — the 18.4:1 contrast is intentional, not a fallback
- Use Grenette serif for all display and section headings at 36px+; never use Graphik for sizes above 36px
- Use Chartreuse Lime (#c8f169) as the filled CTA background with Ink Black text; this is the only filled button color in the system
- Apply 16px radius to all cards, image blocks, and large surfaces; 4px radius to all buttons, inputs, and tags
- Layer surfaces using the sage → forest → chartreuse stack (light to dark, neutral to chromatic) rather than shadows for depth
- Use uppercase Graphik 12–14px with 0.06em letter-spacing for all eyebrow labels above section headings
- Keep photography warm, documentary, human; never use staged stock, duotone, or color overlays on images

### Don't
- Do not use Graphik for display headlines — the serif/sans contrast at large sizes is the signature and must not be broken
- Do not add box-shadows to cards or buttons — depth comes from the sage/forest/chartreuse color stack, not elevation
- Do not use pure white (#ffffff) as a page background — always use Pale Sage (#eef2e3) for canvas, Paper White (#fcfcfc) only for elevated cards
- Do not apply bold (600+) to body or display text — weight stays at 400 in serif headlines, max 500 in Graphik UI
- Do not use more than one chromatic accent per viewport — Chartreuse Lime is the only accent, Forest Mid is its hover, Vivid Green is data-viz only
- Do not mix radii: never use 8px, 12px, or 20px — the system only uses 4px (small/buttons) and 16px (large/cards)
- Do not apply the serif to sizes below 36px — it loses its editorial impact and becomes hard to read at body sizes

## Elevation

This design intentionally avoids box-shadows entirely. Depth and hierarchy are achieved through a three-layer color system: Pale Sage canvas → Paper White elevated cards → Deep Forest dark sections. The Chartreuse Lime accent sits on top of all layers as the singular chromatic punctuation. Adding shadows would break the flat, editorial, magazine-like quality of the system.

## Surfaces

- **Sage Canvas** (`#eef2e3`) — Page background — the warm off-white that defines the entire system
- **Paper White** (`#fcfcfc`) — Elevated cards, navigation bar, footer, modals — the only true white
- **Chartreuse Highlight** (`#c8f169`) — Accent surface for tags, filled CTAs, and stat highlights
- **Forest Dark** (`#043f2`) — Dark section backgrounds, hero stat cards, inverted text containers

## Imagery

Photography is documentary and human — people collaborating at desks, teams reviewing screens, candid workspace moments. Images are warm-toned, naturally lit, never staged stock or overly polished. They sit inside Pale Sage cards with 16px radius, often extending to the card edge with no internal padding. No duotone, no color overlays, no decorative filters. The sage background acts as a warm mat that makes the photos feel grounded and editorial rather than corporate.

## Layout

Max-width 1200px centered content within a full-bleed sage canvas. The hero is a two-column asymmetric split: large serif headline and stat card on the right, human photo on the left, both contained within sage-tinted cards. Section rhythm alternates between white and sage bands with generous 56–80px vertical gaps. Feature sections use 2-column text+image alternating layouts. Navigation is a minimal top bar with centered links, a left-aligned logo, and right-aligned CTA pair. The overall density is comfortable and spacious — this reads more like a brand site than a product dashboard.

## Similar Brands

- **Notion** — Same warm off-white canvas replacing sterile SaaS white, and a single chromatic accent used sparingly for primary actions
- **Linear** — Similar use of a custom serif/grotesque pairing for display headlines, with tight negative tracking at large sizes creating editorial authority
- **Pitch** — Same botanical-editorial mood — pale neutral canvas, confident serif display type, and a single vivid accent color that punctuates rather than dominates
- **Mercury** — Same flat-surface philosophy with no shadows, depth achieved through color layering and a distinctive warm off-white background
- **Stripe** — Same use of a custom serif at display sizes with aggressive negative tracking, paired with a geometric sans for UI — the serif/sans contrast is the signature
