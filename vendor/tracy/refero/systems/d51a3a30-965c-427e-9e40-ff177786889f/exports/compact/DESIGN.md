# Vetric — Style Reference
> Iridescent prism refracting clarity — a white room with one glass diamond that throws pink, blue, yellow, and green light across every surface.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Vetric uses an iridescent-prism visual language: a bright white canvas, near-black ink for text and actions, and a four-color rainbow accent set (blue, pink, yellow, green) that refracts across soft pastel washes like light through a glass diamond. The system pairs a humanist serif (Noto Serif) for headlines with a geometric sans (Manrope) for UI, creating a deliberate tension between editorial calm and technical confidence. Components stay light and flat — thin borders, gentle radii, no drop shadows — so the prismatic gradients and colored accents carry all the visual energy. The result reads as 'data made luminous': the chrome recedes, the color talks.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#090a1e` | Primary text, primary CTA fill, strong borders — the dominant brand dark; a slightly blue-tinted near-black that reads warmer than pure black on white |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on dark fills |
| Ash Border | `#e0e0e0` | Default hairline borders, button outlines, icon strokes |
| Carbon Nav | `#222222` | Navigation text and thin nav borders — sits one step lighter than Midnight Ink |
| Mist Blue | `#c3dae3` | Cool-tinted card borders and subtle section dividers |
| Pure Black | `#000000` | SVG fills, icon glyphs, and high-contrast decorative shapes only — not used for UI text or backgrounds |
| Prism Blue | `linear-gradient(90deg, #f75cc3, #2969ff, #ffd363, #5ab040)` | Brand accent and logo mark — the cool anchor of the rainbow; also acts as info/state accent on badges and borders; Signature iridescent gradient — the through-line of the brand, sweeping pink → blue → yellow → green like light through a prism |
| Prism Pink | `#f75cc3` | Accent stroke and badge accent — warm half of the prism spectrum |
| Prism Yellow | `#ffd363` | Accent stroke and warning/state highlight |
| Prism Green | `#5ab040` | Accent stroke and success state highlight |
| Cream Wash | `#fffdea` | Soft tinted surface for cards and badges tied to the yellow accent |
| Mint Wash | `#eaffed` | Soft tinted surface for cards and badges tied to the green accent |
| Blush Wash | `#fff3fb` | Soft tinted surface for cards and badges tied to the pink accent |
| Sky Wash | `#e5f5ff` | Soft tinted surface tied to the blue accent — appears in gradient fills and decorative washes |

## Typography

### Noto Serif — All editorial headlines and section titles — the serif against a sans UI gives the brand an editorial, almost magazine-like voice. Used at 77px for hero display, scaling down through 63/49/42/35/26px for h1→h5.
- **Substitute:** Source Serif 4, Lora, Crimson Text
- **Weights:** 400, 500
- **Sizes:** 26px, 35px, 42px, 49px, 63px, 77px
- **Line height:** 1.06, 1.20, 1.33, 1.40, 1.43
- **Letter spacing:** -0.05em to -0.04em

### Manrope — Body copy, UI controls, navigation, button labels, badges, and large numeric display. 18–19px for body, 14–16px for compact UI, 11px with +0.06em tracking for eyebrow labels like 'TRUSTED BY' and section kickers. The geometric construction balances the serif headlines.
- **Substitute:** Inter, Geist, DM Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 11px, 14px, 16px, 18px, 19px, 23px, 26px, 70px
- **Line height:** 1.30, 1.33, 1.50
- **Letter spacing:** -0.02em body, 0.06em eyebrow

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 0.66px |
| body-sm | — | — | 14px | 1.5 | -0.28px |
| body | — | — | 18px | 1.5 | -0.36px |
| subheading | — | — | 26px | 1.33 | -1.04px |
| heading-sm | — | — | 35px | 1.2 | -1.75px |
| heading | — | — | 49px | 1.1 | -1.96px |
| heading-lg | — | — | 63px | 1.06 | -3.15px |
| display | — | — | 77px | 1.06 | -3.85px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 28px
- **Element gap:** 14-18px

### Border Radius

- **cards:** 7px
- **badges:** 7px
- **buttons:** 7px
- **featureCards:** 24.5px

## Components

### Primary CTA Button
**Role:** Filled dark button for the single most important action on a screen

Background #090a1, text #ffffff, Manrope 14–16px weight 500, padding 11px 28px, border-radius 7px, no border. Used for 'Book an Intro Call'. Sits directly beside a ghost secondary.

### Ghost Secondary Button
**Role:** Outlined paired action beside the primary CTA

Transparent background, 1px border #090a1 or #e0e0e0, text #090a1, Manrope 14–16px weight 500, padding 11px 28px, border-radius 7px. Used for 'Join the Team'.

### Prism Hero
**Role:** Above-the-fold brand signature

Centered composition on #ffffff with Noto Serif 77px display headline (Midnight Ink, -0.05em), 18px Manrope subtext, CTA pair, and a large iridescent glass-diamond/prism graphic that bleeds pink, blue, yellow, and green gradient edges into the surrounding white. The prism is the only hero artwork.

### Feature Card (Compact)
**Role:** Small bordered card for benefit statements under 'We Do the Heavy Lifting'

Background #ffffff, 1px border #e0e0e0, border-radius 7px, padding 18–25px. Contains a small monochrome icon (top-left, 20–24px), Noto Serif or Manrope title at 19–23px, Manrope body at 14–16px, and a 3-bullet list. Stacks in a 2-column grid.

### Tinted Pastel Card
**Role:** Accent-keyed surface for category highlights or status cards

Background uses one of the four pastel washes (#fffdea, #eaffed, #fff3fb, #e5f5ff), 1px border tinted to the matching prism hue, border-radius 7–24.5px, padding 25–28px. Lets the rainbow accent system apply to whole regions, not just strokes.

### Tracked Eyebrow Label
**Role:** Section kicker above a headline ('TRUSTED BY', 'We Do the Heavy Lifting')

Manrope 11px weight 500, letter-spacing 0.06em (0.66px), color Midnight Ink or a muted gray. All-caps. Sits centered or left-aligned directly above a serif headline.

### Logo Strip
**Role:** Social-proof row of partner/client marks

Horizontal row of monochrome or light-tinted wordmarks at uniform height (~24px), separated by generous 35–42px gaps. Rendered in muted gray (#222 or #e0e0e0), never in full color.

### Comparison Split Section
**Role:** Two-column 'problem vs. solution' panel

Left column on #ffffff with scattered chaotic tags/pills, right column on a full-bleed iridescent gradient (pink → blue → yellow → green) with white-tinted supporting text. The visual contrast IS the message.

### Pill / Tag Chip
**Role:** Small inline label in the comparison section and feature lists

Background #ffffff, 1px border #e0e0e0, border-radius 7px, padding 6px 14px, Manrope 13–14px. In the 'Struggle' column these float in scattered, overlapping positions to suggest disorder.

### Top Navigation Bar
**Role:** Persistent site header

White background, 1px bottom border #e0e0e0 or transparent, 64–72px tall. Logo (blue diamond + 'vetric' wordmark) left, 4–5 text links (Products ▾, Use Cases, About, Careers) right in Manrope 14–16px weight 500 Midnight Ink. No background fill, no shadow.

### Prism Gradient Banner
**Role:** Full-width decorative section background

Horizontal linear gradient sweeping #f75cc3 → #2969ff → #ffd363 → #5ab040 with soft feathered edges so it dissolves into white. Used to make text appear 'illuminated' without any chrome.

### Borderless Feature Row
**Role:** Icon + title + paragraph unit without a card container

No border, no background. Icon (24px, Midnight Ink or a single prism color) above, Noto Serif 26–35px title, Manrope 16–18px body. Used when the section already has its own surface treatment.

## Do's and Don'ts

### Do
- Use Noto Serif at 49–77px for every primary headline and pair it with Manrope 16–19px body beneath — the serif/sans contrast is the typographic signature.
- Pull from the four-color prism set (#2969ff, #f75cc3, #ffd363, #5ab040) when you need accent color; never introduce a fifth hue.
- Apply the iridescent gradient (pink → blue → yellow → green) only as a full-bleed section wash or behind a single large graphic — never as a button fill or card background.
- Use the four pastel wash surfaces (#fffdea, #eaffed, #fff3fb, #e5f5ff) keyed to the matching prism color when you need a tinted card or badge.
- Set eyebrows (TRUSTED BY, section kickers) at 11px Manrope weight 500 with 0.06em tracking in all caps.
- Reach for #090a1 Midnight Ink for both primary text and the filled primary CTA — a single dark token carries the brand's seriousness.
- Separate surfaces with 1px borders in #e0e0e0 or #c3dae3; never use drop shadows.

### Don't
- Don't use drop shadows, glows, or any elevation effects — flatness is intentional.
- Don't use fully rounded (9999px) buttons; the 7px radius is a deliberate near-square.
- Don't render icons in more than one color at a time, and never use filled multicolor icon sets.
- Don't place body text directly on the iridescent gradient without a white scrim or overlay treatment — the contrast fails below AA.
- Don't introduce a new accent hue; the four-color prism is closed.
- Don't use Noto Serif for body copy or UI controls — it is reserved for editorial headlines only.
- Don't use pure #000000 for body text; Midnight Ink (#090a1e) is warmer and on-brand.

## Elevation

The system deliberately avoids drop shadows. Separation is achieved through hairline borders (1px #e0e0e0 or #c3dae3) and occasional tinted pastel backgrounds. The flatness makes the prismatic gradients feel like the only thing casting light.

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas, default background across all sections
- **Tinted Pastel Cards** (`#fffdea`) — Soft-tinted card and badge surfaces keyed to each accent color (cream/mint/blush/sky variants)
- **Prism Gradient Field** (`#2969ff`) — Full-bleed iridescent wash used in hero bleed and the 'Vetric Does it Better' comparison panel

## Imagery

Imagery is minimal and almost entirely abstract. The hero uses a single iridescent glass-diamond/prism graphic — faceted, translucent, throwing pink/blue/yellow/green refraction at its edges — that functions as the brand's only 'product photo'. Supporting sections use full-bleed pastel gradient washes (pink → blue → yellow → green) with feathered edges, never hard rectangular banners. No photography of people, offices, or devices appears. The comparison section relies on scattered pill-shaped text chips to evoke visual noise, and the right-side 'solution' half uses a flowing rainbow gradient to evoke clarity. Icons throughout the UI are flat, single-weight outlines in Midnight Ink or a single prism accent color — never multicolor, never filled. The whole visual language is about light and color doing the work that stock photography would do elsewhere.

## Layout

Max-width 1200px centered container with generous horizontal padding. The hero is a single centered column (headline → subtext → CTA pair → prism graphic) rather than a split layout. Sections stack vertically with 80px+ gaps, no alternating background bands — everything sits on white, with color appearing only in discrete gradient panels or card tints. Feature grids use a 2-column layout for benefit cards, with each card being compact and left-aligned (icon top, title, bullets). The comparison section breaks the centered rhythm with a full-bleed split: a left 'chaos' half on white and a right 'clarity' half on an iridescent gradient that reaches the page edge. Navigation is a single minimal top bar; no sidebar, no mega-menu, no sticky behavior beyond standard scroll. The page reads as one long editorial scroll, not a dashboard.

## Similar Brands

- **Linear** — Same restrained light-mode canvas, single dark CTA, minimal chrome, and emphasis on one signature graphic (their gradient/3D mark) over photography.
- **Stripe** — Both lean on iridescent gradient washes and pastel-tinted surfaces to add color without borders or shadows, with editorial serif headlines paired with clean sans body.
- **Resend** — Shares the minimal white-canvas aesthetic, generous spacing, single dark filled CTA, and a preference for abstract gradient/iridescent visuals over stock imagery.
- **Pitch** — Same serif-headline-over-soft-gradient language, restrained palette punctuated by a few vivid accents, and flat components with hairline borders instead of shadows.
