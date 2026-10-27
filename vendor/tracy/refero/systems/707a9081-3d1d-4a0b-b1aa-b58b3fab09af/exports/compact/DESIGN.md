# Sequence — Style Reference
> blueprint paper with violet annotations. A near-white editorial surface where everything is grayscale and one precise violet pulse marks every action worth taking.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sequence reads like an editorial finance publication rendered in product form: a near-white canvas, a humanist sans (TWK Lausanne) carrying almost all interface text, and a light-weight serif (Moderat Serif) used sparingly on large display headlines to inject editorial gravity. Depth comes from hairline borders and thin layered shadows, not heavy panels or colored fills. A single vivid violet (#a565ff) is the only chromatic accent in the system — it functions as a precise annotation, appearing on primary CTAs, active icons, and subtle brand glows, while the rest of the interface stays in cool grays. Soft blue-violet radial washes in hero and section backgrounds create atmospheric depth without committing to color, and the overall density is compact and precise rather than spacious or airy.

## Colors

| Name | Value | Role |
|------|-------|------|
| Violet Pulse | `#a565ff` | Primary CTAs, active icons, brand glow accents — the single chromatic accent in the system; everything else defers to it |
| Indigo Ink | `#5e5cff` | Link text, secondary text emphasis, and accent strokes where violet would be too loud |
| Lavender Wash | `#ebebff` | Soft tinted backgrounds for highlighted callouts and subtle surface differentiation |
| Iris Glow | `#e0c9ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ledger Green | `#2e7317` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Paper White | `#ffffff` | Primary canvas, card surfaces, button fills, and elevated surface layer |
| Bone | `#f7f7f7` | Recessed card surfaces and subtle panel backgrounds one step off white |
| Fog | `#f1f1f1` | Disabled surface fills, table row alternates, and recessed UI regions |
| Silver | `#efefef` | Inset borders, button outlines, and shadow-stack fills for elevation |
| Marble | `#fff6df` | Warm cream accent for announcement bars and subtle highlight bands |
| Graphite | `#1d1d20` | Primary heading and body text — near-black with a barely-warm tint |
| Slate | `#42424a` | Secondary headings, emphasized body text, and list accents |
| Iron | `#505050` | Default body text and the most-used text color across the system |
| Steel | `#757575` | Muted helper text, navigation labels, and secondary table text |
| Smoke | `#92939e` | Placeholder text, disabled labels, and tertiary table cells |
| Ash | `#e5e7eb` | Default hairline border — the structural backbone of the entire UI; the most-used color in the system |
| Mist | `#d1d9e4` | Cooler border for inputs, dividers, and sections needing visual separation from Ash |
| Olive Gray | `#808076` | SVG illustration stroke and fill — the default for vector graphics in content |
| Noir | `#000000` | Icon fills and contrast anchors where pure black is required |

## Typography

### TWK Lausanne — Primary UI typeface — all body text, navigation, buttons, labels, and most headings from 8px to 24px. A humanist sans with open apertures that stays legible at 10–12px in dense tables and form chrome.
- **Substitute:** Inter, IBM Plex Sans, or Söhne
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 24
- **Line height:** 1.00–2.00 (body 1.50–1.60, tight 1.00–1.20 for compact UI)
- **Letter spacing:** -0.003em at display sizes, -0.002em at subhead sizes, normal at body

### Moderat Serif — Editorial display serif used only on the largest marketing headlines (h1). Light weight at 40–46px with aggressive -0.025em tracking — the contrast against the humanist sans signals premium editorial tone and breaks the product-UI pattern.
- **Substitute:** GT Sectra, Tiempos Headline, or Canela
- **Weights:** 300, 400
- **Sizes:** 40, 46
- **Line height:** 1.00
- **Letter spacing:** -0.0250em

### SF Mono — Monospaced micro-text for API references, code snippets, and technical annotations at 10px. Rare and deliberate — appears only where machine-readable content is shown.
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 10
- **Line height:** 1.50–1.80

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.45 | -0.022px |
| body | — | — | 14px | 1.57 | — |
| body-lg | — | — | 16px | 1.63 | — |
| subheading | — | — | 18px | 1.56 | — |
| heading-sm | — | — | 24px | 1.33 | -0.048px |
| heading | — | — | 40px | 1 | -1px |
| display | — | — | 46px | 1 | -1.15px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **badges:** 9999px
- **inputs:** 4px
- **buttons:** 9999px
- **large-panels:** 16px

## Components

### Primary Action Button
**Role:** Filled CTA for the single most important action on any screen

Background #a565ff, text #ffffff, border-radius 9999px (pill), padding 10px 20px. TWK Lausanne 14px weight 500. Gains a violet halo via box-shadow using #e0c9ff at low opacity. This is the only filled chromatic button in the system.

### Secondary Action Button
**Role:** Outlined or ghost action when two actions appear on one screen

Background transparent or #ffffff, border 1px #efefef, text #1d1d20, border-radius 9999px, padding 10px 20px. Hover lifts to #f7f7f7 background. Layered shadow: rgba(58,58,64,0.1) 0 0 0 1px + rgba(0,0,0,0.1) 0 1px 3px 0.

### Navigation Link
**Role:** Top-level nav items and inline text links

Text #505050 weight 500 at 14px, no underline. Active state shifts to #1d1d20 and may carry a 1px #1d1d20 underline. Hover transitions to #1d1d20.

### Display Headline Block
**Role:** Hero h1 and section-opening headlines

Moderat Serif weight 300 at 46px, line-height 1.00, letter-spacing -0.025em (-1.15px). Color #1d1d20. Centered or left-aligned, always followed by a TWK Lausanne body paragraph at 16px weight 400 in #505050.

### Product Feature Card
**Role:** Cards in the product suite grid and feature sections

Background #ffffff, border 1px #e5e7eb, border-radius 8px, padding 24px. Icon at 24px in #1d1d20 sits top-left. Title in TWK Lausanne 18px weight 500 #1d1d20. Description in 14px weight 400 #757575. No shadow on resting state.

### Product Screenshot Card
**Role:** Faux product UI cards floating in the hero

Background #ffffff, border 1px #e5e7eb, border-radius 8px, padding 16px. Uses the layered shadow stack: rgba(58,58,64,0.1) 0 0 0 1px + rgba(0,0,0,0.1) 0 1px 3px 0 + rgba(0,0,0,0.1) 0 1px 2px -1px. Internal mock chrome uses #f7f7f7 fills and #ebebff tints for active fields.

### Input Field
**Role:** Form inputs, search fields, and inline editors

Background #ffffff, border 1px #d1d9e4, border-radius 4px, padding 8px 12px. TWK Lausanne 14px weight 400. Placeholder text in #92939e. Focus state shifts border to #a565ff with 2px outer ring of #ebebff.

### Integration Logo Tile
**Role:** Third-party brand logos in the integration grid

Background #ffffff, border 1px #e5e7eb, border-radius 8px, padding 16px. Logo mark centered, no accompanying text. Renders at roughly 48–64px square within the tile.

### Status Badge
**Role:** Inline status indicators (Sent, Scheduled, Approved)

Background #ebebff or #f7f7f7, text #5e5cff or #2e7317 weight 500 at 11px, border-radius 9999px, padding 2px 10px. Success variant uses #2e7317 text on #f7f7f7 background.

### Announcement Bar
**Role:** Top-of-page promotional strip

Background #fff6df, text #1d1d20 weight 400 at 13px, centered. Full-bleed, padding 8px vertical. Arrow link in #5e5cff.

### Logo Lockup
**Role:** Brand mark + wordmark in nav and footer

Hex-cluster glyph in #1d1d20 followed by 'Sequence' in TWK Lausanne weight 500 at 18px, letter-spacing -0.002em. No tagline.

### Section Header
**Role:** Eyebrow label + h2 combination introducing each section

Eyebrow in TWK Lausanne 12px weight 500 #757575 uppercase or sentence-case, optional 4px row-gap. h2 in TWK Lausanne 40px weight 300 #1d1d20 line-height 1.00. Centered stack pattern in hero, left-aligned in product sections.

### Customer Logo Strip
**Role:** Row of customer wordmarks for social proof

No background or border. Wordmarks in #1d1d20 at consistent visual weight, spaced with 48–80px column-gap. Centered horizontally with star rating above at 14px in #757575.

## Do's and Don'ts

### Do
- Use Violet Pulse (#a565ff) exclusively for the single primary CTA per screen; never for body text, icons in resting state, or large fills
- Set all headings 24px and above in TWK Lausanne weight 300; reserve Moderat Serif for the 40–46px display headline only
- Use Ash (#e5e7eb) 1px as the default border across cards, dividers, inputs, and tiles — this is the structural line of the system
- Apply the pill radius (9999px) to all buttons, nav items, and tags; use 8px for cards and 4px for inputs and small interactive elements
- Anchor every section to a white or near-white surface; let depth come from hairline borders and the layered shadow stack, not colored fills
- Pair Lavender Wash (#ebebff) with Iris Glow (#e0c9ff) when building tinted callouts or highlighted states — never use them as large surface fills
- Keep section gaps at 80px and card padding at 24px; drop to 16px padding only in dense grid cells or product chrome

### Don't
- Don't introduce any new chromatic color — the system is monochrome grays plus exactly one violet accent and one green semantic
- Don't use Moderat Serif below 40px or for anything other than the h1 display headline; it will lose its editorial weight
- Don't apply colored backgrounds to large content regions; atmospheric depth comes from the soft blue-violet radial gradient washes, not solid color
- Don't use heavy drop shadows; the system relies on thin 1px rings and tightly-clamped offset shadows, never blurry elevation blobs
- Don't set body text below 12px; the smallest TWK Lausanne size for any user-facing text is 12px, with 14px as the comfortable default
- Don't use Indigo Ink (#5e5cff) as a button background — it is a link and secondary-text color, not an action fill
- Don't round buttons or tags with 8px; they must be pills (9999px) to maintain the contrast against the 8px card radius

## Elevation

- **Primary CTA button:** `0px 0px 0px 1px rgba(58,58,64,0.1), 0px 1px 3px 0px rgba(0,0,0,0.1), 0px 1px 2px -1px rgba(0,0,0,0.1) + violet halo via #e0c9ff at ~20% opacity 0 0 8px 2px`
- **Product screenshot cards:** `0px 0px 0px 2px rgb(239,239,239), 0px 22px 9px 0px rgba(0,0,0,0.01), 0px 12px 7px 0px rgba(0,0,0,0.04), 0px 5px 5px 0px rgba(0,0,0,0.06), 0px 1px 3px 0px rgba(0,0,0,0.07)`
- **Secondary/outlined button:** `0px 0px 0px 1px rgba(29,29,32,0.08)`
- **Subtle elevation ring:** `0px 0px 0px 1px rgba(0,0,0,0.05)`

## Surfaces

- **Page Canvas** (`#ffffff`) — Base page background, hero and section backgrounds
- **Recessed Surface** (`#f7f7f7`) — Card and panel surfaces sitting one step below the canvas
- **Tinted Surface** (`#ebebff`) — Lavender-tinted highlight regions for special content blocks
- **Warm Accent** (`#fff6df`) — Cream announcement bar and warm highlight bands

## Imagery

Imagery is restrained and product-centric: no lifestyle photography, no stock imagery, no decorative illustrations. The visual content is almost entirely UI mockups — floating product screenshot cards showing contract interfaces, billing forms, and invoice tables rendered in the same TWK Lausanne / grayscale palette as the rest of the site. Integration logos appear as small monochrome wordmarks inside bordered tiles. A subtle concentric-circle diagram appears once in the product suite section as a structural diagram in #e5e7eb strokes. The hero uses a soft blue-violet radial gradient wash (radial-gradient with rgba(186,217,249,0.8) and rgba(234,234,255,0.8)) as background atmosphere rather than any photographic content. Icons are 1.5–2px stroke, line-style, monochrome in #1d1d20 or #505050 — the only colored icon usage is the Violet Pulse active state.

## Layout

Max-width 1200px centered container with 24px gutter. The page is built as a vertical stack of distinct sections separated by 80px gaps, with a thin #e5e7eb hairline divider between some sections. The hero opens full-bleed white with a centered headline stack (eyebrow → serif display → paragraph → CTA pair) and product screenshot cards floating below as a 3-column grid with slight stagger. The social-proof strip is a single horizontal row of customer wordmarks, centered, with a 5-star rating above. Product suite sections use a left-aligned text column beside a right-side visual column, alternating sides. A 2-column feature section uses a diagram on one side and a 2×3 icon+text grid on the other. Navigation is a single fixed top bar: logo left, product/customer/docs/pricing/resources center-left, sign-in and Book demo button right — the demo button is the only filled violet element in the chrome. No sidebar, no mega-menu, no sticky scroll behavior beyond the nav.

## Similar Brands

- **Linear** — Same near-monochrome light canvas with a single vivid accent and editorial restraint; both use hairline borders and compact density to feel precise rather than decorative
- **Stripe** — Similar quiet light-mode product chrome with one chromatic brand color used surgically; both use layered subtle shadows and pill buttons for primary actions
- **Mercury** — Same financial-product confidence expressed through generous whitespace, editorial sans typography, and violet/purple accent appearing only on primary actions
- **Vercel** — Both use a near-white canvas with hairline #e5e7eb borders as the dominant structural element, and rely on a single brand color rather than multi-color palettes
- **Notion** — Same light-dominant interface with muted gray text hierarchy and pill-shaped interactive controls; both treat color as functional punctuation rather than decoration
