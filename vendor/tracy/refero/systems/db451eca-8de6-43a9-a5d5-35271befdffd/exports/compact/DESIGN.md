# Amplemarket — Style Reference
> Sunlit workspace with scattered confetti

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Amplemarket uses a warm, editorial-meets-product language: off-white canvas with a soft cream wash, generous breathing room, and dark near-black type that reads like printed ink. The visual signature is a multi-hue pastel palette — petal pink, mint green, canary yellow, violet, cyan — used as flat card and section backgrounds rather than decoration, creating a 'color-coded' taxonomy of product areas. A vivid phoenix-orange accent grounds the brand identity against a charcoal secondary surface (#272625). Type is set in a geometric grotesque (Labil Grotesk) with aggressive negative tracking on display sizes, where weight 900 84px uppercase headlines act as poster titles and weight 400 44–56px headlines feel calm and confident. The overall mood is light, airy, and approachable — a productivity tool that doesn't feel like enterprise software.

## Colors

| Name | Value | Role |
|------|-------|------|
| Phoenix Orange | `radial-gradient(386.06% 162.79% at 3.76985% -12.1005%, rgb(232, 64, 13) 0%, rgb(255, 238, 216) 31.14%, rgb(208, 178, 255) 81.98%)` | Brand accent, hero gradient origin, marketing highlights — vivid warm orange that gives the brand its identity; Hero background gradient — radial wash from phoenix orange through cream to violet |
| Midnight Indigo | `#10054d` | Deep brand surface, feature card backgrounds, text on light cards — the dark counterweight to the bright accents |
| Charcoal | `#272625` | Secondary dark surface, testimonial card backgrounds, dark UI panels — warm-tinted near-black |
| Ink | `#111111` | Primary text, heading color, filled action button background — near-black with slight warmth |
| Canvas White | `#ffffff` | Primary page background, card surface, text on dark surfaces |
| Cream Wash | `#f6f5f3` | Soft surface tint, secondary card backgrounds, muted section backgrounds |
| Ash | `#6d6c6b` | Muted body text, secondary labels, helper copy |
| Stone | `#b1b1af` | Hairline borders, subtle dividers, muted placeholder |
| Pearl | `#ecebea` | Subtle button backgrounds, hover states on ghost controls |
| Petal Pink | `#ffd7f0` | Pastel accent card surface — category-coded color tile |
| Mint Green | `#b7efb2` | Pastel accent card surface — category-coded color tile |
| Canary Yellow | `#ffef99` | Pastel accent card surface — category-coded color tile |
| Soft Violet | `#e2ddfd` | Pastel accent card surface — category-coded color tile |
| Aqua | `#99fff9` | Gradient endpoint, hero highlight wash |
| Indigo Deep | `#2e2460` | Dark input field background, form surface on dark sections |

## Typography

### Labil Grotesk Variable — Primary typeface — geometric grotesque with variable weight axis. Weight 400 for all body, nav, and most headings (unusual restraint at large sizes); weight 900 reserved for poster-size 84px display headlines set uppercase. Negative letter-spacing scales aggressively with size: -0.05em at 56px, -0.04em at 44px, -0.03em at 36px. Body and small UI text tracks at normal or near-zero.
- **Substitute:** Inter, DM Sans, or General Sans Variable
- **Weights:** 400, 500, 700, 900
- **Sizes:** 8, 10, 12, 14, 16, 18, 20, 24, 28, 36, 44, 56, 84
- **Line height:** 0.8, 1.0, 1.1, 1.2, 1.3, 1.4
- **Letter spacing:** -0.05em at 56px; -0.04em at 44px; -0.03em at 36px; -0.02em at 24-28px; -0.017em at 28px; -0.011em at 20px; +0.03em at 10px uppercase; +0.025em at 8px
- **OpenType features:** `"ss02" on, "ss01" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 10px | 1 | 0.3px |
| caption | — | — | 12px | 1 | — |
| body-sm | — | — | 14px | 1.3 | — |
| body | — | — | 16px | 1 | — |
| body-lg | — | — | 20px | 1.3 | -0.4px |
| subheading | — | — | 28px | 1.1 | -0.476px |
| heading-sm | — | — | 36px | 1.1 | -1.08px |
| heading | — | — | 44px | 1.1 | -1.76px |
| heading-lg | — | — | 56px | 1 | -2.8px |
| display | — | — | 84px | 0.8 | -2.52px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 20px
- **Element gap:** 8-12px

### Border Radius

- **cards:** 12px
- **small:** 4px
- **badges:** 9999px
- **inputs:** 12px
- **buttons:** 8px

## Components

### Primary Filled Button
**Role:** Main call-to-action, highest-emphasis interactive element

Background #111111 (Ink), text #ffffff, no border, border-radius 8px, padding 12px 16px. Label in 16px Labil Grotesk weight 400. Used for 'Get free trial' and 'Get started' actions. Pair with white-outlined secondary beside it.

### Ghost Navigation Button
**Role:** Secondary CTA in navigation and footer

Transparent background, text rgba(255,255,255,0.6) on dark surfaces, no border, border-radius 8px, padding 12px 16px. Inverts to Ink text on light surfaces. Used for 'Open app' in nav.

### Neutral Filled Button
**Role:** Tertiary action on light surfaces

Background #ecebea (Pearl), text #111111 (Ink), no border, border-radius 8px, padding 12px 16px. Subtler alternative to the primary filled button when a secondary action needs more presence than ghost.

### White Pill Badge
**Role:** Logo lockup with brand mark

Background #ffffff, text #111111, border #ffffff, border-radius 12px, padding 6px 6px 6px 14px. Small icon-prefixed badge used for the Amplemarket logo lockup and similar brand marks.

### Email Capture Input
**Role:** Hero email signup field

Background #ffffff, text #111111, 1px border rgba(17,17,17,0.08), border-radius 12px, padding 0 16px. Field height ~48px. Joined inline with primary filled button — input fills flex space, button sits at right.

### Pastel Category Card
**Role:** Feature/category showcase tile

Flat color fill from the pastel palette (Petal Pink, Mint Green, Canary Yellow, Soft Violet), border-radius 12px, padding 16px 20px. No shadow, no border. Color IS the differentiation — these are color-coded taxonomy tiles for product capabilities.

### Dark Testimonial Card
**Role:** Customer quote on dark sections

Background #272625 (Charcoal), border-radius 12px, padding 8px. Subtle inset — no drop shadow. White text, small avatar with name in 14px and title in #6d6c6b Ash.

### Light Feature Card
**Role:** Feature content card on light sections

Background #ffffff, border-radius 12px, padding 16px 20px. Minimal elevation using rgba(17,17,17,0.02) ambient shadow or none at all. Borders are hairline 1px rgba(17,17,17,0.08) when present.

### Logo Grid Card
**Role:** Customer logo with migration caption

Transparent or #ffffff background, border-radius 12px, padding ~20px. Centered logo above small caption 'Migrated off [competitor]' in Ash #6d6c6b. Part of 4-column grid.

### Sticky Navigation Bar
**Role:** Top-level page navigation

Transparent to #ffffff on scroll, height ~62px, horizontal layout with logo left, center links (Product, Why us, Resources, Customers, Pricing), and dual-action cluster right (ghost + filled). Backdrop blur 16-32px on scroll for frosted-glass effect over content.

### Hero Video Container
**Role:** Large embedded media frame below hero text

Black background (#000000), border-radius ~12px, full-width within max-width container, aspect ratio ~16:9. Contains video player with centered play button.

### Dark Section Panel
**Role:** Full-bleed dark content sections (testimonials, footer)

Background #272625 or #10054d (Midnight Indigo), full viewport width, internal padding 80-120px vertical. White text (#ffffff), Ash #6d6c6b for secondary copy. Creates a dramatic light-to-dark rhythm against the predominantly white page.

## Do's and Don'ts

### Do
- Use Labil Grotesk Variable at weight 400 for headings up to 56px — restraint at large sizes is the signature
- Apply weight 900 uppercase at 84px only for poster/display moments, not regular section titles
- Use the pastel palette (Petal Pink, Mint Green, Canary Yellow, Soft Violet) as flat card fills for category differentiation — never as decoration or gradients
- Set border-radius to 8px on buttons and 12px on cards — these two values define the entire shape language
- Use #111111 (Ink) for primary action buttons and #272625 (Charcoal) for dark surface backgrounds
- Apply negative letter-spacing proportional to size: -0.05em at 56px, scaling down to 0 at body text
- Alternate light sections (#ffffff / #f6f5f3) with dark panels (#272625 / #10054d) for visual rhythm

### Don't
- Don't use weight 500 or 700 for large headings — weight 400 at 44-56px is the signature, not 600-700
- Don't apply shadows to pastel category cards — the flat color IS the elevation
- Don't use the pastel colors as gradients — they are flat solid fills for taxonomy coding
- Don't set border-radius above 12px on cards or below 8px on buttons — the system uses exactly these two values
- Don't use #000000 pure black for text — #111111 (Ink) is the primary text color with subtle warmth
- Don't add drop shadows to cards on white backgrounds — use 1px borders or hairline insets instead
- Don't use color for decoration on dark sections — reserve Phoenix Orange for hero gradient origins and brand moments

## Elevation

- **White cards:** `rgba(17, 17, 17, 0.02) 0px -6px 6px 0px, rgba(17, 17, 17, 0.01) 0px -23px 9px 0px`
- **Featured cards:** `rgba(17, 17, 17, 0.12) 0px 26px 60px -6px, rgba(17, 17, 17, 0.02) 0px 28px 28px -14px, rgba(17, 17, 17, 0.04) 0px 6px 6px -3px, rgba(17, 17, 17, 0.04) 0px 1px 1px -0.5px`
- **Hairline insets:** `rgba(17, 17, 17, 0.05) 0px 0px 0px 1px inset`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background
- **Cream Wash** (`#f6f5f3`) — Soft secondary surface, alternating section bands
- **Pastel Tiles** (`#ffd7f0`) — Color-coded category cards (taxonomy system)
- **Midnight Indigo** (`#10054d`) — Brand feature surface, deep accent cards
- **Charcoal** (`#272625`) — Dark testimonial and footer surfaces

## Imagery

Hand-drawn line illustrations with loose, sketchy quality — the rocket/spaceship motif appears as a black outlined drawing with minimal fill. Hero uses a warm radial gradient (orange → cream → violet) as a soft atmospheric backdrop rather than a photographic image. Product screenshots are presented in dark-framed video containers with rounded corners. Customer logos are monochrome black on white in a clean 4-column grid. Overall: minimal photography, relies on illustrated personality + gradient washes + product UI captures.

## Layout

Centered max-width ~1200px container with full-bleed sections that alternate between white and dark backgrounds. Hero is split: centered headline + subtext + email capture stacked vertically, with gradient atmosphere behind. Video container below hero spans near-full container width. Feature sections use 3-4 column card grids with pastel color-coded tiles. Testimonial section is full-bleed dark with masonry-style quote cards. Footer is dark with centered headline and CTA. Navigation is sticky at top with frosted-glass blur on scroll.

## Similar Brands

- **Linear** — Same weight-400-at-large-sizes typographic restraint and minimal dark accent approach, though Linear leans dark while Amplemarket is light
- **Notion** — Similar generous whitespace, off-white canvas, and quiet monochrome-with-pastel-punctuation palette for category surfaces
- **Framer** — Same flat pastel card system for feature taxonomy, large weight-400 geometric headings, and minimal elevation philosophy
- **Pitch** — Shared editorial-meets-product feel with negative-tracked display headings and warm dark surfaces contrasting light sections
- **Raycast** — Similar playful brand accent (orange) against a clean off-white canvas with geometric grotesque type at restrained weights
