# Monarch — Style Reference
> warm linen notebook under morning light

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Monarch Money uses a warm editorial-fintech language: soft cream canvas, white product surfaces, and a single vivid orange that acts as functional punctuation against an otherwise monochrome warm-gray system. Typography is the signature — a high-contrast pairing of a light-weight modern sans for UI with a distinctive editorial display face at large sizes, both carrying aggressive negative tracking that tightens the layout into a confident, magazine-like rhythm. The interface feels handcrafted rather than corporate: pill-shaped controls, hairline warm borders, whisper-light shadows, and generous breathing room that lets product screenshots carry the visual weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Orange | `#ff692d` | Primary action buttons, active nav indicators, key UI accents — the only chromatic color in the system, reserved so it reads as decisive when it appears |
| Linen | `#efecea` | Page canvas and section backgrounds — the warm cream that separates the site from sterile white SaaS |
| Ink | `#22201d` | Primary text, icon strokes, heading color, footer text — near-black with a warm brown undertone that harmonizes with the cream canvas |
| Graphite | `#777573` | Muted body text, secondary helper text, captions — warm mid-gray that sits between Ink and Paper |
| Stone | `#dcd9d6` | Hairline borders, dividers, table separators, icon outlines — the warm neutral that stitches cards and sections together |
| Paper | `#ffffff` | Card surfaces, elevated product panels, input fields — pure white that floats above the Linen canvas |
| Smoke | `#cccccc` | Light text on dark surfaces, inverse labels, and high-contrast captions. Do not promote it to the primary CTA color |

## Typography

### ABC Oracle — All UI text — body, buttons, nav, links, cards, labels. The weight 350 default is unusually light; most fintech systems default to 400-500, but Monarch's lighter body weight lets the orange accent carry more visual weight. Letter-spacing sits at -0.010 to -0.012em across all sizes.
- **Substitute:** Inter or Söhne (use weight 350 if available, otherwise 400)
- **Weights:** 100, 350, 400, 500
- **Sizes:** 14px, 15px, 16px, 18px, 20px
- **Line height:** 1.30–1.56
- **Letter spacing:** -0.012em at 14px, -0.010em at 16px, normal at 20px+

### Copernicus — All display and section headings. The signature choice: a single weight 350 used at every heading size, paired with aggressive negative tracking (-0.050em to -0.067em). The tight tracking compresses wide headings into compact, editorial blocks rather than airy marketing copy. At 48px the -0.067em tracking is extreme — it pulls letters almost touching, creating a dense, premium feel.
- **Substitute:** Fraunces or Source Serif 4 (set weight 350, apply matching negative tracking)
- **Weights:** 350
- **Sizes:** 32px, 40px, 48px
- **Line height:** 1.20
- **Letter spacing:** -0.050em at 32px, -0.060em at 40px, -0.067em at 48px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.17px |
| body | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 18px | 1.56 | -0.18px |
| subheading | — | — | 20px | 1.33 | -0.2px |
| heading-sm | — | — | 32px | 1.2 | -1.6px |
| heading | — | — | 40px | 1.2 | -2.4px |
| display | — | — | 48px | 1.2 | -3.22px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **pills:** 9999px
- **inputs:** 8px
- **buttons:** 9999px

## Components

### Primary Pill Button
**Role:** Main call-to-action — 'Sign up', 'Unlock better money habits'

9999px border-radius, Ember Orange (#ff692d) fill, white text at 16px weight 500, 12px 24px padding, subtle 1px shadow at rgba(34,32,29,0.05).

### Ghost Pill Button
**Role:** Secondary action — 'Sign in' in header

9999px border-radius, transparent fill, Ink (#22201d) text at 16px weight 500, 12px 24px padding, no border.

### Outlined Pill Button
**Role:** Tertiary action — 'Learn more' links in feature blocks

9999px border-radius, transparent fill, Ember Orange (#ff692d) text, 1.5px Ember Orange border, 8px 20px padding.

### Feature Card
**Role:** Feature block with label, headline, body text, and CTA

12px border-radius, white or transparent fill on Linen canvas, no visible border, 24px internal padding, generous vertical breathing room between label (uppercase tracked ABC Oracle 14px Ember Orange) and heading (Copernicus 32px Ink).

### Product Screenshot Card
**Role:** Embedded app UI mockups in 'What is Monarch?' and feature sections

12px border-radius, white (#ffffff) fill, 1px Stone (#dcd9d6) border, soft two-layer shadow at rgba(34,32,29,0.1) 0px 10px 15px -3px / 0px 4px 6px -4px.

### Top Navigation Bar
**Role:** Sticky header with logo, nav links, and auth actions

White background, 64px height, Monarch wordmark with orange butterfly icon left-aligned, nav links (Features, For Couples, For Professionals, Pricing, Download) center/left at 16px weight 400 Ink, ghost 'Sign in' and filled orange 'Sign up' buttons right-aligned.

### Hero Overlay Card
**Role:** Headline + subtext + CTA floating over lifestyle photography

Semi-transparent white (#ffffff at ~85%) background, 12px radius, 24-32px padding, 16px backdrop blur, Copernicus 48px heading, ABC Oracle 18px body in Graphite, Ember Orange pill CTA below.

### Stat Badge Overlay
**Role:** Floating data cards over hero image (net worth, account list)

Frosted glass effect — white at 75% opacity, 12px radius, 16px padding, Stone border, small monospace-style numerics in Ink.

### Press / Award Badge Row
**Role:** Social proof strip below hero

Single horizontal row on Linen canvas, 4-5 award logos (WSJ, Forbes, CNBC) separated by 5-star rating and descriptive caption, centered, 48px vertical padding.

### Promo Banner
**Role:** Top-of-page announcement bar

Ember Orange (#ff692d) background, white centered text at 14px weight 400, 8px vertical padding, spans full viewport width.

### Section Header
**Role:** Centered eyebrow + heading + subtext block

Uppercase tracked eyebrow in Ember Orange at 14px weight 500, Copernicus heading below at 40-48px Ink, ABC Oracle 18px Graphite subtext, all centered, 64px vertical gap to content below.

## Do's and Don'ts

### Do
- Use Ember Orange (#ff692d) exclusively for filled buttons, active states, and eyebrow labels — never as a text color for body copy or as a background wash
- Set all buttons to 9999px border-radius — the pill shape is the system's most recognizable element
- Apply Copernicus at weight 350 for all headings with the matching negative tracking per size (-3.22px at 48px, -2.40px at 40px, -1.60px at 32px)
- Use Linen (#efecea) as the page background and white (#ffffff) as card surfaces — never invert this stack
- Use Stone (#dcd9d6) for all hairline borders and dividers at 1px — the warm gray harmonizes with the cream canvas
- Set body text to ABC Oracle weight 350-400 with -0.010em tracking — lighter weight lets the orange accent dominate
- Embed product UI as 12px-radius cards with 1px Stone border and the two-layer shadow — these screenshots are the primary visual proof

### Don't
- Don't introduce additional accent colors — the monochrome warm-neutral + single orange is the entire system
- Don't use square or 4px-radius buttons — the pill (9999px) is non-negotiable
- Don't set headings in ABC Oracle or body text in Copernicus — the font split is strict by role
- Don't use pure black (#000000) or pure white (#ffffff) as backgrounds — the warm shift in Ink and Linen is what makes the system feel editorial rather than corporate
- Don't apply heavy shadows to cards or buttons — the system relies on hairline shadows at 5% opacity, not dramatic elevation
- Don't use uppercase or letter-spaced text for body content — tracked caps are reserved for eyebrow labels only
- Don't use the orange gradient (red→orange) on UI elements — it's a promotional accent only, not a surface treatment

## Elevation

- **Primary Pill Button:** `rgba(34, 32, 29, 0.05) 0px 1px 2px 0px`
- **Product Screenshot Card:** `rgba(34, 32, 29, 0.1) 0px 10px 15px -3px, rgba(34, 32, 29, 0.1) 0px 4px 6px -4px`

## Surfaces

- **Linen Canvas** (`#efecea`) — Full page background, section bands, hero backdrop behind photography
- **Paper Card** (`#ffffff`) — Product UI screenshots, feature cards, elevated content blocks sitting on the canvas
- **Ember Accent** (`#ff692d`) — Pill button fills, notification badges, active state highlights

## Imagery

Lifestyle photography dominates: warm, golden-hour couple-on-couch scenes with natural light, slightly desaturated to let the orange UI accents pop. Product UI is shown as embedded screenshots (dashboard, reports, transaction lists) at full fidelity — these carry the most visual weight after the hero photo. Icons are minimal: small orange butterfly brand mark, thin-line icons in Ink for UI controls, and award logos in grayscale. No illustration style is used — the system is photographic and product-screenshot driven. Imagery is always contained with 12px corners, never full-bleed except in the hero.

## Layout

Max-width 1200px centered container with 24px side padding. Hero is full-bleed: lifestyle photo fills the viewport, headline card overlays bottom-left, floating data cards overlay right side. Below hero, content flows in 64px vertical sections on Linen canvas, alternating between white product screenshot cards and text-forward feature blocks. Feature sections use a 3-column or 2-column grid: text-left, screenshot-right, with generous 64px gaps between sections. Press badges sit in a single full-width horizontal strip. Navigation is a sticky white top bar with centered logo-left, links-center, actions-right.

## Similar Brands

- **Copernicus (font foundries showcasing Copernicus)** — Editorial display typography with single-weight headings and tight tracking — same sculptural heading approach
- **Pinterest** — Warm lifestyle photography hero with floating data cards and a single accent color against cream/warm-neutral canvas
- **Acorns** — Personal finance with warm color temperature and lifestyle-forward photography rather than cold blue data dashboards
- **Notion** — Light, spacious layout with generous vertical breathing room, hairline borders, and pill-shaped controls
