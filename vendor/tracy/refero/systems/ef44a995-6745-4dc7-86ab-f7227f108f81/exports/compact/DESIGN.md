# Mobbin — Style Reference
> Grayscale specimen board — a printer's proof sheet where typographic weight IS color.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mobbin runs on pure achromatic restraint — zero chroma across the entire palette, forcing hierarchy through weight, size, and tone alone. The page is white space interrupted by near-black ink (#141414) at display sizes and warm-gray (#707070, #adadad) for secondary text. The custom 'saans' typeface is the single differentiator: fractional weights (440, 456, 652) that don't exist in any system font, creating headline mass that sits between regular and semibold — typography doing the work of color. 9999px pill shapes appear on every interactive element while card content sits on 16-24px rounded rectangles, making buttons feel like badges in a sea of contained thumbnails. The content itself — mobile app screenshots in grayscale cards — IS the visual texture of the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#141414` | Primary text, headings, filled CTA buttons, nav items, icon strokes — the single chromatic workhorse of an achromatic system |
| Pure Canvas | `#ffffff` | Page background, card surfaces, button text on dark fills |
| Graphite | `#707070` | Body copy, secondary links, descriptive text |
| Ash | `#adadad` | Tertiary text, disabled/muted button borders, placeholder icons |
| Fog | `#ededed` | Dividers, subtle borders, card outlines |
| Mist | `#f2f2f2` | Nav background tint, input fields, inner surface elevation |
| Silver | `#c2c2c2` | Skeleton loaders, inactive UI fills |
| Slate Shadow | `#e0e0e0` | Inset button shadow ring (rgba(64,64,64,0.16) 0px 0px 0px 1px) |

## Typography

### saans — Every text element on the site. Fractional weights (440, 456, 652) are the signature — they occupy visual mass between Regular and Semibold that no variable-axis font exposes as named stops. Display headlines at 80px/56px run weight 600–652 at lineHeight 1.00–1.13 with negative letter-spacing (-0.011em at large sizes). Body runs 14–16px at weight 400 with tracking +0.013–0.017em for small-size legibility.
- **Substitute:** Inter Variable or Geist (closest variable-axis fallbacks with comparable optical geometry)
- **Weights:** 400, 440, 456, 600, 652
- **Sizes:** 12px, 14px, 16px, 20px, 32px, 56px, 80px
- **Line height:** 1.00–1.50 (tight 1.00–1.15 at display, looser 1.38–1.50 at body)
- **Letter spacing:** -0.88px at 80px (-0.011em), -0.39px at 56px (-0.007em), +0.21px at 16px (+0.013em), +0.28px at 20px (+0.014em), +0.20px at 12px (+0.017em)
- **OpenType features:** `"calt" 0, "dlig", "ss07"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 16 | 0.2px |
| body-sm | — | — | 14px | 20 | — |
| body | — | — | 16px | 22 | 0.21px |
| subheading | — | — | 20px | 28 | 0.28px |
| heading | — | — | 32px | 42 | — |
| heading-lg | — | — | 56px | 63 | -0.39px |
| display | — | — | 80px | 80 | -0.88px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 9999px
- **cards:** 16-24px
- **inputs:** 9999px
- **modals:** 24px
- **buttons:** 9999px
- **thumbnails:** 16px

## Components

### Primary Filled Button
**Role:** Main CTA — 'Join for free'

Background #141414, text #ffffff, radius 9999px, padding 0px 16px (height set by line-height), font saans weight 600 at 14–16px. Inset shadow ring rgba(64,64,64,0.16) 0px 0px 0px 1px on hover state.

### Outlined Pill Button
**Role:** Secondary action — 'See our plans'

Background transparent, text #141414, border 1px solid #141414, radius 9999px, padding 0px 16px. Sits beside primary CTA as a lighter-weight alternative.

### Muted Pill Button
**Role:** Tertiary / inactive filter tabs

Background transparent, text #adadad, border 1px solid #adadad, radius 9999px, padding 0px 12px. Used for unselected tab filters like 'Most popular', 'Top rated'.

### Inline Underline Link
**Role:** Inline text action with no pill shape

Background transparent, text #141414, border-radius 0px, padding 2px on all sides. No background, no border — purely typographic. Used for secondary in-text navigation.

### App Screenshot Card
**Role:** Primary content unit in the gallery grid

White background, border 1px solid #ededed, radius 16px, padding 16px. Contains a mobile phone screenshot image (radius 12–16px on the image itself), a 'New' or 'Updated' badge (9999px pill, #141414 fill, white text, 12px font), and app name in saans 14px weight 440 #141414.

### Category Navigation Menu
**Role:** Mega-dropdown showing filter categories

White background, box-shadow rgba(0,0,0,0.04) 0px 8px 40px 0px, radius 24px, padding 24-32px. Four-column grid layout with category labels in saans 12px weight 400 #adadad uppercase, and category items in saans 16px weight 440 #141414.

### Top Navigation Bar
**Role:** Sticky global navigation

Background #ffffff or #f2f2f2 tint, padding 0 24px, height 60px. Logo left-aligned, nav links (saans 14px weight 440 #141414) center, 'Join for free' filled pill button right. All nav links are plain text — no underline, no border.

### Filter Pill / Tab Row
**Role:** Horizontal scrollable filter bar above the gallery

Row of pill buttons. Active: background #141414 text #ffffff radius 9999px padding 4px 12px. Inactive: background transparent text #141414 border 1px solid #141414 radius 9999px padding 4px 12px. Font saans 14px weight 440. Gap 8px between pills.

### Search Input
**Role:** App/screen search bar

Background #f2f2f2, border none, radius 9999px, padding 8px 16px, placeholder text saans 14px #adadad, input text saans 14px #141414. Search icon left-inset, 'Text in Screenshot' toggle pill right-inset.

### Section Stat Display
**Role:** Hero library size counter

Display number at 56–80px saans weight 652, letter-spacing -0.88px, line-height 1.00, color #141414. Label text below at 16–20px weight 440 #707070. Numbers are the visual centerpiece — no decorative elements.

## Do's and Don'ts

### Do
- Use #141414 as the only 'color' — every UI accent, icon, filled button, and active state is this near-black, never a chromatic hue.
- Apply 9999px radius to every interactive pill element: buttons, tags, search inputs, filter chips. Non-interactive content containers use 16–24px radius.
- Set display headlines (56–80px) at saans weight 600–652 with letter-spacing -0.007em to -0.011em and lineHeight 1.00–1.13.
- Use font-feature-settings: '"calt" 0, "dlig", "ss07"' on all saans text to activate the custom ligature and stylistic set that distinguish it from fallback sans-serifs.
- Differentiate card elevation with 1px solid #ededed borders only — never box-shadow on cards. Reserve box-shadow exclusively for floating dropdowns.
- Use fractional saans weights: 440 for UI labels/nav, 456 for mid-emphasis body, 652 for hero numerics — never round to 400/500/600 at sizes where the fractional weight is available.
- Maintain 80px vertical section rhythm between major content blocks, with 24px internal card padding as the baseline.

### Don't
- Never introduce a chromatic accent color — not blue for links, not green for success states, not any hue. The entire brand palette is achromatic.
- Never use box-shadow on cards or gallery thumbnails — borders do that work; shadows on content cards would compete with the screenshot imagery inside them.
- Never use font-weight 700 or 800 — the heaviest weight is 652. Heavier weights would break the typographic restraint that defines the system.
- Never use radius values other than 9999px (interactive), 24px (large containers), 16px (cards/images), or 8px (inline badges) — arbitrary intermediate values destroy the shape vocabulary.
- Never place colored backgrounds behind sections — alternating band layouts should use #ffffff vs #f2f2f2 at most, never tinted or chromatic fills.
- Never left-align hero headlines — the centered display type at 80px/56px is the layout anchor; shifting it breaks the symmetry that makes the screenshot grid feel organized.
- Never remove letter-spacing from display type — at 80px, the -0.88px tracking is what makes saans feel like a custom typeface rather than a generic web font.

## Elevation

Shadows are nearly absent — the one exception is a very soft ambient lift (rgba(0,0,0,0.04) 0px 8px 40px) on dropdown menus. Card elevation is expressed entirely through 1px #ededed borders against a white page, not shadow. This flat-border approach keeps the visual field clean enough that app screenshot content reads as the highest-contrast element on every surface.

## Surfaces

- **Page** (`#ffffff`) — Root page background
- **Card** (`#ffffff`) — Gallery cards, testimonial cards — differentiated from page by 1px #ededed border, not background change
- **Input / Chip** (`#f2f2f2`) — Search bars, nav tint, inner UI fills
- **Overlay Dropdown** (`#ffffff`) — Category mega-menu, floating panels — elevated via rgba(0,0,0,0.04) 0px 8px 40px shadow

## Imagery

Content IS the imagery: grayscale mobile app screenshots displayed as contained cards in a 3-column grid. Screenshots are cropped to phone frames, placed on white card backgrounds with 16px radius, and rendered in desaturated tones that match the achromatic brand palette — colorful apps appear muted because the surrounding UI demands it. No lifestyle photography, no illustrations, no abstract graphics. Partner/customer logos (Uber, Meta, Airbnb, etc.) appear as flat monochrome SVGs in a trust bar. The Revolut-style app icon in the hero (rounded square, 24px radius, green fill with white symbol) is the only chromatic element on the page — a deliberate specimen of the content being showcased, not a brand choice. Icon style throughout the UI is outlined, thin stroke (~1.5px), monochrome #141414.

## Layout

Max-width centered (~1280px), white background throughout. Hero is vertically centered text stack — large display headline (80px) over a subtitle paragraph over two pill CTAs side by side, with a featured app icon above the headline as a specimen. Below the hero: full-width trust logo bar with muted gray brand logos. The gallery section introduces a sticky secondary nav (app type tabs, search bar, filter row) above a 3-column card grid with comfortable 16-20px gutters. Testimonials section uses a 4-column masonry-style text card grid on white. Navigation is a floating top bar with logo left, text links center, CTA pill right — switches from transparent to white/f2f2f2 on scroll. Section vertical rhythm is consistently 80px between major blocks. No alternating dark/light bands — the entire page is white with card grids providing visual texture.

## Similar Brands

- **Screenlane** — Same achromatic gallery-of-screenshots model with white backgrounds and card-border-only elevation
- **Dribbble** — Pill-button navigation and 3-column content grid for design inspiration browsing
- **Lookup.design** — Identical concept — no-chroma UI wrapping colorful screenshot content — with similar nav and filter-pill patterns
- **Linear** — Fractional-weight custom typography as the primary brand differentiator in an otherwise near-monochrome system
- **Refero.design** — App screenshot library with the same white/gray achromatic chrome and pill-shaped filter chips above a grid
