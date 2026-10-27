# Analogue — Style Reference
> Black gallery vitrine — products float in void

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Analogue presents as a black-box gallery: products float untethered against pure dark voids, lit like museum objects rather than marketed like commodities. The visual language is rigorously monochrome — black, white, and a single soft gray do all the work, with no chromatic accents competing for attention. Typography is a single custom family used at whisper-to-medium weights, carrying dramatic negative tracking that tightens aggressively as size increases. Components feel weighted and architectural: rounded card corners, generous breathing room, and the only 'action' surface is a clean white pill that reads as a beacon against the dark. Every screen should read as quiet and confident, letting the hardware itself be the spectacle.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon Canvas | `#000000` | Page backgrounds, section canvases, card surfaces in dark sections |
| Bone White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Ash Veil | `#e5e7eb` | Subtle borders, hairline dividers, light-mode card surfaces, light section backgrounds |
| Smoke | `#bfbfbf` | Secondary text, muted captions, supporting metadata on dark surfaces |
| Iron Gray | `#999999` | Tertiary text, placeholders, disabled state text, publication/attribution labels |

## Typography

### circularXx — Single-family system used everywhere. Display sizes (47-53px) carry dramatic -3.18px to -2.35px tracking that compresses letterforms into near-monoline blocks; body sizes hold -0.32px to -0.26px tracking. The 450 weight is the signature — lighter than typical medium, thicker than regular — giving headlines a precise, engineered feel. Font feature 'ss08' is globally active.
- **Substitute:** Inter, General Sans, Satoshi
- **Weights:** 400, 450, 500
- **Sizes:** 13, 15, 16, 18, 19, 21, 26, 35, 47, 53
- **Line height:** 0.80, 1.00, 1.11, 1.14, 1.15, 1.20, 1.23, 1.50
- **Letter spacing:** -0.06em at 53px, -0.05em at 47px, -0.033em at 35px, -0.03em at 26px, -0.029em at 21px, -0.031em at 19px, -0.02em at 16px and below
- **OpenType features:** `"ss08" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | -0.26px |
| body-sm | — | — | 15px | 1.5 | -0.3px |
| subheading-lg | — | — | 19px | 1.2 | -0.59px |
| heading-sm | — | — | 21px | 1.15 | -0.61px |
| heading | — | — | 26px | 1.14 | -0.78px |
| heading-lg | — | — | 35px | 1.11 | -1.16px |
| display | — | — | 47px | 1 | -2.35px |
| display-lg | — | — | 53px | 0.8 | -3.18px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 26px
- **Element gap:** 18px

### Border Radius

- **tags:** 9999px
- **cards:** 17.6px
- **buttons:** 9999px

## Components

### Primary Action Pill
**Role:** Single conversion surface — 'Available Now', 'Shop Now'

White filled pill, 9999px radius, 16px 32px padding, circularXx weight 500 at 15px in #000000. Sits as a beacon against the dark canvas. No border, no shadow — pure contrast is the affordance.

### Ghost Nav Link
**Role:** Primary navigation items in header

No background, no border. circularXx weight 400-450 at 15px in #ffffff, tracking -0.30px. Stack label (Store, Editions, Support) above link (Products, Developer, Announcements) with 2-3px row gap, creating a compact two-line nav cell.

### Brand Mark
**Role:** Logo placement in top-left

Abstract 'A' glyph in #ffffff on dark canvas, approximately 30px square. No wordmark adjacent — symbol carries identity alone.

### Section Title Block
**Role:** Section header pairing product family with status word

Two stacked centered lines: top line circularXx weight 400 at 21px in #e5e7eb (e.g., 'Analogue Pocket'), bottom line circularXx weight 450 at 47-53px in #ffffff (e.g., 'Restock', 'Shipping Now'). Tracking on the large line is -2.35px to -3.18px. No other decoration.

### Product Hero Composition
**Role:** First-screen product showcase

Central product device (Analogue Pocket) at 60-70% viewport height, surrounded by 6-8 floating game cartridges in random rotation, each with subtle drop shadow. Pure #000000 background. No grid, no alignment — objects appear scattered in 3D space.

### Review Card
**Role:** Press quotes on dark sections

17.6px radius, 1px border in rgba(255,255,255,0.1) or #e5e7eb at low opacity, 26px internal padding. Layout: rating (35px weight 450 #ffffff) top-left, publication logo top-right, pull-quote (16px weight 400 #e5e7eb) middle, attribution (15px weight 400 #999999) bottom. Arranged in 4-column grid with 12-18px gaps.

### Product Showcase Card
**Role:** Light-section product display tiles

#ffffff surface on #e5e7eb background, 17.6px radius, 26px padding. Product photo centered, label below at 16px weight 400 in #000000. No shadow — flat against the gray field.

### Shipping Note
**Role:** Temporal metadata under action button

circularXx weight 400 at 15px in #999999, centered, single line. No icon, no decoration — typographic only.

### Social Icon Button
**Role:** Header social link (Instagram)

24px square white stroke icon, no background, no label. Sits far-right of nav.

## Do's and Don'ts

### Do
- Use only the five neutrals: #000000, #ffffff, #e5e7eb, #bfbfbf, #999999. No chromatic colors in the system.
- Apply circularXx at weight 450 for all display and heading sizes — this mid-weight is the signature, not 500 or 700.
- Tighten letter-spacing aggressively as size grows: -0.02em at 16px, scaling to -0.06em at 53px. Never use positive tracking.
- Use the single 17.6px radius for all cards and containers. Buttons and tags get 9999px for pill shape.
- Set section backgrounds to pure #000000; let product photography carry color and light, not the interface.
- Pair every section title with a two-line stack: small light-gray label above large white status word.
- Keep the single white pill button as the only filled action surface on dark sections — no secondary buttons compete.

### Don't
- Don't introduce any color outside the five neutrals — no blues, reds, greens, or accent hues.
- Don't use weights above 500 — headlines should feel precise and engineered, not bold or shouty.
- Don't apply box-shadows to cards on dark backgrounds — use 1px hairline borders in low-opacity white instead.
- Don't use positive letter-spacing or letter-spacing: normal anywhere in the system.
- Don't use corner radii other than 17.6px (cards) or 9999px (pills). No sharp 0px corners, no 8px defaults.
- Don't add gradients, glows, or color washes — the aesthetic depends on flat darkness and pure contrast.
- Don't use icons in colored fills — all icons are white strokes on dark, or black strokes on light.

## Surfaces

- **Void** (`#000000`) — Primary page canvas and section background
- **Light Section** (`#e5e7eb`) — Alternating light bands for product showcases on light backgrounds
- **Pure White** (`#ffffff`) — Card surfaces within light sections, pill button fills

## Imagery

Product photography is the entire visual language. Devices and game cartridges are shot on pure black, floating in space with no surface or context — each object is isolated like a museum artifact. Cartridges appear in slight rotation and varied scale, scattered around a central hero device in a loose orbital composition. Lighting is studio-precise: hard key light reveals product texture, no environmental spill. No lifestyle photography, no human subjects, no backgrounds beyond pure void. The product IS the image; the page provides only darkness and typography.

## Layout

Full-bleed page model with no persistent sidebar. Navigation is a minimal top bar: brand mark far-left, three two-line nav groups center, social icon far-right — all on a single transparent row over the dark canvas. Hero is a full-viewport dark composition with centered product cluster and centered title block below. Sections alternate between full-bleed dark (#000000) and full-bleed light (#e5e7eb) bands with sharp edges, no gradients between. Light sections house product showcase grids (centered, max-width ~1200px). Dark sections house review card grids (4 columns, equal-width). Vertical rhythm is generous: ~80px between major sections, 26-29px internal padding. Content is always horizontally centered with auto margins — no asymmetric or left-aligned compositions.

## Similar Brands

- **Apple** — Same product-as-sculpt presentation on pure black canvases with centered white typography and dramatic negative tracking on display sizes
- **Teenage Engineering** — Same dark, design-forward hardware aesthetic with monochrome palettes and product photography floating without context
- **Leica** — Same premium dark product presentation — objects on void, gallery-style isolation, minimal UI chrome
- **Nothing** — Same restrained monochrome interface and dramatic floating product compositions on pure black
- **Bang & Olufsen** — Same luxury hardware treatment with dark product photography and tightly tracked sans-serif display type
