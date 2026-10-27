# Apple (España) — Style Reference
> white gallery vitrine

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Apple's iPad Air page is a gallery of negative space — vast white canvas interrupted by single-product hero photography and generous vertical breathing room. The visual system is monochrome at its core (#1d1d1f text on #ffffff surface) with one saturated blue (#0071e3) as the sole accent for the primary action, and never more than one chromatic moment per band. Typography does the heavy lifting: SF Pro Display at 80px weight 600 for hero, tightening to 56px and 48px for section headlines, always with negative letter-spacing — the headlines feel carved rather than typed. Cards float at 28px radius with zero shadow and no border; surfaces separate purely through tint shifts (white → #f3f6f6 → #e8e8ed). Buttons are pill-shaped (980px–9999px) or underlined text links — never boxes. Everything is airy, precise, and restrained.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure White | `#ffffff` | Page canvas, card surfaces, nav background, icon fills |
| Fog Mist | `#f3f6f6` | Footer surface, secondary card tint, alternating section backgrounds |
| Paper Gray | `#fafafc` | Opened nav menu surface — barely-distinguished from white canvas |
| Silver Smoke | `#e8e8ed` | Tertiary surface, subtle dividers, chip backgrounds |
| Ash Border | `#dedfe2` | Hairline separators, disabled button backgrounds |
| Graphite | `#6e6e73` | Secondary body text, captions, helper labels |
| Charcoal | `#444545` | Nav text, secondary nav and link text |
| Steel | `#313131` | Nav icon fills, button text on light surfaces, dark surface tint |
| Near Black | `#1d1d1f` | Headlines, primary body text, all editorial copy — the dominant ink |
| True Black | `#000000` | Icon fills, input underline, maximum-emphasis headings |
| Apple Blue | `#0071e3` | Primary action fill — the only chromatic button color, also nav hover and focus ring |
| Link Blue | `#0066cc` | Inline text link color, secondary link accent |
| Ember | `#b64400` | Orange state accent for badges, validation surfaces, and short status labels. |
| Ocean Depth | `linear-gradient(rgb(0, 76, 148) 45%, rgb(41, 123, 196) 90%)` | Hero gradient stop — deep blue anchoring the product spotlight wash |

## Typography

### SF Pro Text — Body, navigation, micro-copy, and smaller headings. 17px/400 for primary body (line-height 1.47), 14px/600 for eyebrow labels and small link lists, 12px/400 for legal and fine print, 44px/400 for nav bar text, 34px/600 for card sub-headings.
- **Substitute:** Inter or system-ui
- **Weights:** 400, 600
- **Sizes:** 8, 12, 14, 17, 20, 34, 44
- **Line height:** 1.18–1.83
- **Letter spacing:** -0.022em at 17px body, -0.016em at 14px, -0.010em at 12px, -0.011em at 34px, -0.003em at 44px nav
- **OpenType features:** `"numr" on`

### SF Pro Display — Display and editorial headlines — 80px hero, 56px section opener, 48px feature, 28px sub-feature, 21px large body. Negative letter-spacing tightens as size increases (-0.015em at 80px down to 0.011em at 21px). The only family used at sizes ≥ 40px.
- **Substitute:** Inter (tight tracking variant) or system-ui
- **Weights:** 600
- **Sizes:** 21, 28, 40, 48, 56, 80
- **Line height:** 1.07–1.38
- **Letter spacing:** -0.015em at 80px, -0.005em at 56px, -0.003em at 48px, 0.007em at 28px, 0.011em at 21px
- **OpenType features:** `"numr" on`

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.12px |
| body-sm | — | — | 14px | 1.43 | -0.22px |
| body | — | — | 17px | 1.47 | -0.37px |
| subheading | — | — | 21px | 1.38 | 0.23px |
| heading-sm | — | — | 28px | 1.14 | 0.2px |
| heading | — | — | 40px | 1.1 | -0.12px |
| heading-lg | — | — | 56px | 1.07 | -0.28px |
| display | — | — | 80px | 1.05 | -1.2px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 10px

### Border Radius

- **cards:** 28px
- **chips:** 9999px
- **buttons:** 980px
- **nav-pill:** 32px
- **small-elements:** 12px

## Components

### Hero Product Spotlight
**Role:** Full-bleed product reveal section

White (#ffffff) canvas, no card chrome. Product name in SF Pro Display 80px weight 600 #1d1d1f, letter-spacing -1.2px, centered. Tagline in SF Pro Display 28px weight 600 #1d1d1f. Single product render centered with generous whitespace — minimum 160px vertical padding above and below. No borders, no shadows, no decorative elements.

### Primary Blue Pill Button
**Role:** Single primary action per section

Background #0071e3, white (#ffffff) text, SF Pro Text 17px weight 400, border-radius 980px (full pill), padding 12px 22px, no border. Used at most once per viewport; if present, it is the only filled button. Saturated blue against pure white creates immediate focal weight.

### Text-Link Button
**Role:** Secondary or tertiary action — Apple's default

Transparent background, text #1d1d1f or #0066cc, SF Pro Text 17px weight 400, with right-arrow character (›) appended. Zero padding, zero border, zero radius. The arrow is part of the text, not an icon — it inherits color. This is the dominant button type on the site.

### Outlined Pill Link
**Role:** Tertiary navigation-style action

Transparent fill, 1px border #1d1d1f, text #1d1d1f, border-radius 32px, padding 8px 18px, SF Pro Text 14px weight 400. Used for compact inline actions like 'Ver el vídeo' where a contained affordance is needed without color emphasis.

### Feature Card (White)
**Role:** Product or feature showcase panel

Background #ffffff, border-radius 28px, zero shadow, zero border. Padding 40px minimum internal. Often contains a single product image, 28px headline, and one text-link button. Relies on container background contrast (sits on #f3f6f6 or #e8e8ed parent) for visual separation.

### Feature Card (Tinted)
**Role:** Secondary feature panel with subtle surface tint

Background #fafafc or #f3f6f6, border-radius 28px, zero shadow, zero border. Identical typography to the white card — the tint is the only differentiator. Used to create gentle banding when stacking multiple feature cards vertically.

### Global Navigation Bar
**Role:** Persistent top navigation

Background #ffffff (or #161617 in dark mode), height 44px, SF Pro Text 12px weight 400 #1d1d1f/#313131 nav items, 44px line-height, letter-spacing -0.01em. Apple logo left, centered item list, search and bag icons right. Backdrop filter saturate(1.8) blur(20px) when scrolled. Hamburger open state reveals #fafafc surface.

### Section Header Block
**Role:** Editorial section title with optional inline link

Left-aligned headline at SF Pro Display 48px or 56px weight 600 #1d1d1f, letter-spacing -0.003em to -0.005em. Optional right-aligned text link (17px #0066cc) on the same baseline. No eyebrow, no kicker — the headline is the sole title element. Vertical spacing 60–80px from preceding section.

### Eyebrow Label
**Role:** Small uppercase or sentence-case category label above headlines

SF Pro Text 14px weight 600 #1d1d1f or #0066cc, letter-spacing -0.016em. Pairs with a 56px headline. No decorative bullet, no separator — typographic hierarchy alone.

### Inline Text Link
**Role:** Hyperlink within paragraph copy

SF Pro Text 17px weight 400, color #0066cc, underline on hover only (no persistent underline). Sits inline within body text; no button chrome.

### Price Block
**Role:** Starting price display

SF Pro Text 17px weight 400 #6e6e73 with 'Desde' prefix. No decorative currency symbol treatment — the euro sign is inline at the same size and color. Sits below the CTA, vertically close (~8px).

### Badge (New / Limited)
**Role:** Product freshness indicator

Transparent background, text color #b64400 (ember orange), SF Pro Text 12px weight 400 or 14px weight 600, zero padding, zero radius. Inline with product name. No pill shape — the word 'Nuevo' is naked typographic punctuation.

### Footer Band
**Role:** Bottom regulatory and link surface

Background #f3f6f6, full-width, generous padding (~40px vertical). Link lists in SF Pro Text 12px weight 400 #6e6e73, dividers between columns are absent — spacing alone separates columns. Fine print and legal in same size and color, no smaller variant.

### Floating Video Play Badge
**Role:** Play button affordance on video thumbnails

Circular #ffffff badge (~40px) with concentric ring border, containing a play triangle in #0066cc. Floats over a card or image. Zero shadow — the white circle against the image is the elevation.

## Do's and Don'ts

### Do
- Use #0071e3 (Apple Blue) as the only filled button color — one per section maximum, never two blue buttons side by side.
- Set all card radii to 28px and pair with zero border, zero shadow — let container background tint create separation.
- Set hero headlines at SF Pro Display 80px weight 600 with letter-spacing -1.2px and line-height 1.05.
- Anchor all body copy in SF Pro Text 17px weight 400 at line-height 1.47 with letter-spacing -0.37px.
- Use 980px border-radius on every pill-shaped button so it renders fully round regardless of width.
- Maintain minimum 80px vertical gap between editorial sections; hero sections get 160px+ breathing room.
- Reserve #0066cc exclusively for inline text links within paragraph copy; never as a standalone chip.

### Don't
- Do not use any chromatic color other than #0071e3 for buttons — no orange, green, or red CTAs.
- Do not add borders or drop-shadows to cards; separation must come from surface tint or whitespace alone.
- Do not use sans-serif weights below 400 or decorative typefaces; the system is two families (SF Pro Display, SF Pro Text) only.
- Do not place two filled buttons in the same row — pair a single filled button with a text-link or an outlined pill.
- Do not use letter-spacing wider than 0.011em on any size; the system is always tight or normal tracking.
- Do not introduce background colors other than #ffffff, #fafafc, #f3f6f6, and #e8e8ed for surfaces.
- Do not use radius values other than 12px (small), 28px (card), 32px (nav pill), or 980px+ (full pill) — no 4px or 8px rounded corners.

## Elevation

- **Feature card (rare):** `rgba(0, 0, 0, 0.05) 0px 0px 35px 20px`

## Surfaces

- **Pure White Canvas** (`#ffffff`) — Default page background, dominant canvas for hero and product sections
- **Fog Mist** (`#f3f6f6`) — Footer, banded secondary sections, subtle section alternation
- **Paper Gray** (`#fafafc`) — Opened global nav menu surface
- **Silver Smoke Card** (`#e8e8ed`) — Tertiary card or chip surface when further visual separation is needed

## Imagery

Product photography is the sole visual medium: high-resolution renders of iPad hardware on pure white seamless backgrounds, photographed at slight 15–25° angles rather than flat orthographic views. No lifestyle staging, no human subjects, no environmental context. Images are always centered within their section, never cropped to bleed. One decorative gradient wash (linear #004c94 → #297bc4) appears behind select hero sections. Icons are monochrome SF Symbols-style glyphs in #1d1d1f or #313131 at ~24px, 1.5px stroke. No illustrations, no 3D renders beyond the product photography itself, no abstract graphics. Density is image-heavy in hero bands, text-dominant in feature grid sections.

## Similar Brands

- **Tesla** — Same single-product hero with pure-white canvas, oversized weight-600 headline, and absence of traditional navigation chrome.
- **Bang & Olufsen** — Same monochrome restraint with product photography as the dominant visual element, generous negative space, and one accent color for action.
- **Nothing.tech** — Same typographic-driven hierarchy with weight-600 display headlines on near-white canvas and pill-shaped button affordances.
- **Linear** — Same strict two-family typography system (one display, one text), tight letter-spacing, and near-zero use of borders or shadows on surfaces.
- **Dyson** — Same high-key product photography on white, editorial section rhythm with oversized headlines, and minimal button chrome — text-link style CTAs.
