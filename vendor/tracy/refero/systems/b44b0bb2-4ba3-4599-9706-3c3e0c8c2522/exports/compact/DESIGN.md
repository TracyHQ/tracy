# Impilo — Style Reference
> Midnight clinical observatory — a violet command console where health data glows in cyan.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Impilo operates in a deep midnight-violet universe where the canvas itself (#16165c) carries the brand — there is no white default, only progressively lighter violet surfaces stacking toward #f4f4f6 for inverted sections. A single typeface (Gilroy) speaks in two voices: weight 500 for running text and weight 600 for display, with aggressive negative tracking at large sizes that makes headlines feel engineered rather than written. The accent system is a clinical triad — cyan #00b1ff for data and links, mint #00ffaa for positive states, and a lighter violet #b1a6f6 for line-art illustration — so color never decorates, it always means something. Surfaces are pill-soft (1425px buttons, 24-32px cards) and float on ambient violet shadows rather than neutral grays, keeping every elevation on-brand.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Iris | `#16165c` | Page canvas, hero background, primary surface — the brand-defining midnight violet that sets the entire dark mode identity |
| Iris Shadow | `#232269` | Elevated card surfaces on dark canvas, secondary card backgrounds — one step lighter than canvas for depth without breaking the violet atmosphere |
| Iris Glow | `#403cd5` | Mid-tone accent surface, footer background, highlighted metric blocks — mid-violet for tertiary elevation and accent fills |
| Iris Pulse | `#5350cc` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Iris Border | `#4846c6` | Card border outlines, subtle surface edges on dark mode — keeps card perimeters defined without breaking the violet mood |
| Iris Veil | `#524fe1` | Body and card border accent, secondary surface outline — lighter violet for hairline separators on dark surfaces |
| Lilac Mist | `#b1a6f6` | Line-art illustration stroke, decorative SVG fills, wireframe graphics — soft violet for technical/medical illustration overlay |
| Clinical Cyan | `#00b1ff` | Data highlights, chart strokes, icon accents, inline links, interactive borders — the primary data-viz and link color across the UI |
| Cyan Soft | `#59b4ff` | Secondary cyan accent, softer data labels, gradient endpoints paired with Clinical Cyan |
| Mint Vital | `#00ffaa` | Green outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |
| Teal Signal | `#2ee9ff` | Highlight accent for key data callouts and chart emphasis — brighter teal-cyan for moments that need to pop |
| Cloud White | `#ffffff` | Primary text, button text on dark, button backgrounds in light section, high-contrast headings |
| Pearl | `#f4f4f6` | Soft icon strokes, subtle dividers, and low-emphasis decorative details. Do not promote it to the primary CTA color |
| Ash | `#d8d8e3` | Muted text on light sections, secondary borders, low-emphasis labels |
| Fog | `#9494a9` | Hairline dividers, disabled borders, low-contrast separators |

## Typography

### Gilroy — Sole typeface across the entire system — weight 500 for body, links, buttons, cards; weight 600 for all headings and display. Gilroy's geometric humanism gives medical data a friendly, non-clinical warmth
- **Substitute:** Manrope (closest free alternative with similar geometric humanist proportions) or Plus Jakarta Sans
- **Weights:** 500, 600
- **Sizes:** 12px, 13px, 14px, 17px, 18px, 24px, 46px, 54px, 66px, 92px, 124px
- **Line height:** 0.92 (display) / 1.00 (headlines) / 1.44 (body)
- **Letter spacing:** -0.0750em at 92px+ (display) / -0.0400em at 46-66px (headings) / -0.0300em at 17-24px (body) / 0.0200em at 12-14px (captions)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.44 | 0.24px |
| body-sm | — | — | 14px | 1.44 | 0.28px |
| subheading | — | — | 18px | 1.44 | -0.54px |
| heading-sm | — | — | 24px | 1.44 | -0.72px |
| heading | — | — | 46px | 1 | -1.84px |
| heading-lg | — | — | 54px | 1 | -2.16px |
| heading-xl | — | — | 66px | 1 | -2.64px |
| display | — | — | 92px | 0.92 | -6.9px |
| display-xl | — | — | 124px | 0.92 | -9.3px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 24px
- **icons:** 7px
- **inputs:** 16px
- **buttons:** 9999px
- **cards-elevated:** 32px

## Components

### Pill CTA Button (Primary)
**Role:** Primary action trigger in hero and navigation

Filled pill button, 9999px border-radius, Iris Pulse (#5350cc) background, Cloud White (#ffffff) text at 17px Gilroy weight 500, 16px 24px padding. Includes ambient violet box-shadow (#3c39b9 at low opacity) to lift it off the dark canvas. Used for 'Request Demo' in nav and main CTAs.

### Pill Button (Ghost)
**Role:** Secondary or outline action on dark canvas

Transparent or Pearl (#f4f4f6) fill with 9999px radius, Cloud White text/border, 17px Gilroy weight 500, used for secondary nav actions like arrow-prefixed links ('→ About Us').

### Pill Button (Light Section)
**Role:** Primary action in inverted Pearl sections

Pearl (#f4f4f6) or Cloud White fill, dark text, 9999px radius, 17px Gilroy weight 500, 16px 24px padding. Appears in the white 'End-to-end white glove service' section.

### Dark Canvas Card
**Role:** Data dashboard panel, elevated content block

Iris Shadow (#232269) background, 24px border-radius, 1px Iris Border (#4846c6) hairline, 24px internal padding. Contains metric headers, chart areas, and tab strips. No drop shadow — depth comes from the lighter violet fill against the deeper canvas.

### Highlighted Metric Card
**Role:** Hero metric display (e.g., 'Blood Pressure Average 127/73')

Semi-transparent Iris Glow (#403cd5) or Iris Shadow (#232269) background, 24px radius, large numeric value in Clinical Cyan (#00b1ff) at 66-92px Gilroy weight 600, with a small label in Cloud White at 12-14px.

### Tab Strip (Dashboard)
**Role:** Metric category selector within dashboard

Horizontal row of pill-shaped tabs (9999px radius) on a dark card. Active tab: Iris Pulse (#5350cc) background with white text. Inactive: transparent with Lilac Mist (#b1a6f6) text. Each tab pairs a small icon with a label at 14px Gilroy weight 500.

### Patient Profile Card
**Role:** Sidebar patient identity block

Left-aligned card on Iris Shadow (#232269) background, 24px radius, contains a branded logo mark, patient name in Cloud White weight 600, DOB metadata in Pearl at 13px, and contact/address lines with icon prefixes. No border — relies on tonal contrast.

### Billing Summary List
**Role:** Categorized list with icon-prefixed rows

Stacked list items within a card, each row: small icon (7px radius container) in Lilac Mist, label text in Pearl, value text in Cloud White at 17px Gilroy weight 500. 8-12px vertical gap between rows.

### Chart Container
**Role:** Data visualization wrapper

Full-width container within a dark card, transparent background, chart strokes in Clinical Cyan (#00b1ff) and Mint Vital (#00ffaa) for data series, Iris Border (#4846c6) for gridlines, Cloud White for axis labels at 12px. Charts float on the card's Iris Shadow fill.

### Word Highlight Box
**Role:** Dotted-outline emphasis treatment for key headline words

Transparent background with a 1px dashed border in Clinical Cyan or Lilac Mist at 7px radius, wrapping a single emphasized word in the headline. Used on 'personalized.' in the hero — a signature callout device.

### Navigation Bar (Dark)
**Role:** Top-level site navigation

Transparent or Deep Iris background, 80px height. Logo (Impilo wordmark with heart/pulse icon) left, nav links center in Cloud White at 17px Gilroy weight 500 with dropdown arrows, pill Request Demo button right.

### Section Divider (Light Inversion)
**Role:** Break between dark and light page sections

Hard color break from Deep Iris (#16165c) canvas to Pearl (#f4f4f6) section. Light section uses Deep Iris text on Pearl background. No gradient transition — the cut is intentional and stark.

### Compliance Badge Pair
**Role:** Dual certification display in light sections

Two hexagonal/shield-shaped badge containers side by side, 7px radius, with dark line-art icons and text labels in Deep Iris. Sits within a rounded rectangle frame with 1px Ash border.

### Line-Art Illustration
**Role:** Decorative wireframe graphics on dark hero

Monochromatic line drawings in Lilac Mist (#b1a6f6) at 1-2px stroke weight, depicting medical devices (stethoscope, monitor) and laptops. Full-height on the left side of the hero, no fills — pure outline aesthetic that signals 'connected health' without literalism.

## Do's and Don'ts

### Do
- Use Deep Iris (#16165c) as the page canvas for all dark sections — never introduce a neutral gray or pure black background
- Set all buttons and tags to 9999px border-radius — pill geometry is non-negotiable and defines the brand silhouette
- Apply -0.075em letter-spacing at 92px+ display sizes to make headlines feel compressed and engineered rather than airy
- Reserve Clinical Cyan (#00b1ff) for data, links, and chart strokes — never as a decorative fill
- Pair Mint Vital (#00ffaa) with health-positive data (vitals in range, active status) to give green semantic meaning beyond decoration
- Use the dotted-outline Word Highlight Box for the single most important word in any headline — one per page maximum
- Break between dark and light sections with a hard color cut at Pearl (#f4f4f6) — no gradient transitions between themes

### Don't
- Never use a neutral gray (e.g., #1a1a1a, #2a2a2a) as a background — all dark surfaces must stay in the violet family
- Do not mix weight 400 or 700 into the type system — Gilroy speaks only in 500 and 600
- Never apply Clinical Cyan (#00b1ff) as a large solid fill on buttons or hero blocks — it is a data/link color, not a surface color
- Do not use Mint Vital (#00ffaa) for error states or warnings — its meaning is locked to positive health signals
- Avoid sharp corners (0-4px radius) on any container — minimum 7px for icons, 16px for inputs, 24px for cards
- Do not introduce a second typeface — Gilroy at weights 500/600 covers every typographic need
- Never use white (#ffffff) as a card background on the dark canvas — the light inversion section is the only place Cloud White surfaces belong
- Do not use gradient transitions between dark and light sections — the hard cut is a signature choice

## Elevation

- **Primary CTA Button:** `0 0 20px rgba(60, 57, 185, 0.4) — ambient violet glow, not a neutral drop shadow`
- **Dashboard Card:** `no box-shadow`
- **Highlighted Metric Block:** `1px Iris Border (#4846c6) hairline, no shadow`
- **Navigation Pill Button:** `no shadow on dark canvas`

## Surfaces

- **Deep Iris Canvas** (`#16165c`) — Page and hero background — the foundational dark surface
- **Iris Shadow** (`#232269`) — Elevated cards and panels on dark canvas
- **Iris Glow** (`#403cd5`) — Highlighted metric blocks, footer, mid-elevation panels
- **Pearl Inversion** (`#f4f4f6`) — Light-section backgrounds, inverted content blocks
- **Cloud White** (`#ffffff`) — Top-elevation card surfaces in light sections, button fills

## Imagery

Line-art wireframe illustrations in Lilac Mist (#b1a6f6) at 1-2px stroke weight depict medical devices (stethoscope, heart-rate monitor, laptop) as decorative atmosphere on the left side of the hero. No photography or full-color illustration — the visual language is monochromatic, technical, and schematic, reinforcing a 'connected health infrastructure' metaphor. Icons are thin-stroke, single-color, at 7px container radius, used as functional markers (phone, location, mail, chart-type) rather than decorative elements. The dashboard screenshots show product UI embedded as hero evidence rather than marketing imagery.

## Layout

Full-bleed dark canvas with no max-width constraint on the violet sections — the Deep Iris fills edge to edge. Hero is split: left third holds the line-art illustration, right two-thirds carry the headline and CTA stack with the dashboard card overlapping the section bottom. Navigation is a transparent top bar with a pill CTA right-aligned. The page alternates between full-width dark bands and a centered max-width 1200px light section. Content in dark sections is right-aligned to the text column; the light section is centered with single-column text and a centered compliance badge pair.

## Similar Brands

- **Ro (direct-to-patient healthcare)** — Dark-violet canvas with clinical cyan data accents, pill-shaped CTAs, and a single-geometric-typeface system that makes health data feel approachable
- **Hims & Hers** — Deep saturated brand-color backgrounds used as the primary canvas rather than neutral surfaces, with rounded cards and pill navigation
- **Tempus AI** — Dark-mode health-tech dashboard aesthetic with violet/indigo canvas, cyan data accents, and oversized display headlines with aggressive negative tracking
- **Forward Health** — Midnight-violet dark theme with single bright accent color for data, rounded soft cards, and large compressed-tracking display type
