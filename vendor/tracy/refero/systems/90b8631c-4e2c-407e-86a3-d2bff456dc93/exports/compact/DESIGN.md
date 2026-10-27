# SuperHi — Style Reference
> Paper-cut shapes scattered across a pale-blue classroom wall

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

SuperHi reads like a creative-school art room translated to screen: a near-white pale-blue canvas strewn with oversized flat paper-cut shapes in candy-bright primaries, wrapped around quietly confident typography that never competes with the playfulness. The palette is almost monochrome in interface chrome — deep ink text, white surfaces, one electric violet that powers every action — while the decorative layer is intentionally loud: yellow pentagons, red half-circles, green triangles, pink stars and powder-blue blobs float behind content like cutouts on a studio wall. Components are pill-soft (24–48px radii), buttons are chunky capsules with arrow glyphs, and the tone is friendly, confident, and unmistakably creative.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Iris | `#2727e6` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink Black | `#111118` | Primary text, dark secondary buttons, icon strokes, hairline borders — warmer than pure black, reads as ink rather than void |
| Paper White | `#ffffff` | Card surfaces, elevated panels, button text on dark fills, page sections that need to lift off the pale-blue canvas |
| Chalk Blue | `#f0f6ff` | Dominant page canvas — a barely-there blue tint that prevents the page from feeling clinical and ties the scattered blue shapes to the background |
| Frost Blue | `#e1edff` | Secondary surface wash, input field backgrounds, footer tint — a step deeper than the canvas to create soft layering without shadows |
| Carbon | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Marker Red | `#ff4141` | Decorative shape fill — the large red semicircle, star bursts, and accent blobs scattered through the decorative layer |
| Hi-Yellow | `#ffda00` | Decorative shape fill — the yellow pentagon and sunny accents in the cutout composition; also used as a section wash behind featured content |
| Powder Sky | `#91d8ec` | Decorative shape fill — soft powder-blue circles and cloud forms in the scattered cutout scene |
| Bubblegum Pink | `#ffbac4` | Red supporting accent for decorative details and low-frequency emphasis. |
| Jelly Green | `#16ab59` | Decorative shape fill — green triangle accents in the scattered cutout scene |
| Sunbeam | `#ffe54d` | Decorative shape fill — a slightly warmer yellow variant for layering against Hi-Yellow in the cutout composition |

## Typography

### Haas Grot Disp — Display and headings only — the geometric grotesque has a sturdy, slightly condensed skeleton that holds 92px hero lines without losing legibility; weight stays at 400 because the tight letter-spacing (-0.03em at the largest sizes) does the heavy-lifting, not bold weight
- **Substitute:** Inter, Manrope, or Suisse Int'l
- **Weights:** 400
- **Sizes:** 24px, 35px, 42px, 52px, 62px, 72px, 92px
- **Line height:** 1.00, 1.10, 1.15, 1.35
- **Letter spacing:** -0.0300em at 92px down to -0.0040em at 24px
- **OpenType features:** `"ss01" on, "tnum" on`

### Haas Grot Text — Body, navigation, buttons, and smaller UI text — the text cut of the same family tuned for readability at small sizes with looser tracking than the display companion
- **Substitute:** Inter, Manrope, or Suisse Int'l
- **Weights:** 400
- **Sizes:** 16px, 20px, 22px, 24px
- **Line height:** 1.10, 1.25, 1.35, 1.40
- **Letter spacing:** -0.0200em at 16px down to -0.0070em at 24px

### Martian Mono — Promotional ticker text, tag labels, and code-flavored micro-copy — a monospaced voice used sparingly for editorial texture, not for entire paragraphs
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 400
- **Sizes:** 12px, 17px
- **Line height:** 1.00, 1.30, 1.35
- **Letter spacing:** -0.0130em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption-mono | — | — | 12px | 1.35 | -0.156px |
| body-sm | — | — | 16px | 1.4 | -0.32px |
| body | — | — | 20px | 1.4 | -0.2px |
| subheading | — | — | 22px | 1.35 | -0.176px |
| heading-sm | — | — | 24px | 1.25 | -0.168px |
| heading-lg | — | — | 42px | 1.1 | -0.378px |
| display | — | — | 52px | 1.1 | -0.468px |
| display-lg | — | — | 62px | 1.05 | -0.558px |
| display-xl | — | — | 72px | 1 | -0.648px |
| mega | — | — | 92px | 1 | -2.76px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 5000px
- **cards:** 24px
- **small:** 16px
- **inputs:** 5000px
- **shapes:** 0px
- **buttons:** 48px

## Components

### Primary Pill Button
**Role:** Main call-to-action — course enrollment, catalog navigation, see-more links

Fill #2727e6, text #ffffff in Haas Grot Text 20px weight 400, letter-spacing -0.01em, 12px 24px padding, border-radius 48px (full pill), includes a trailing arrow glyph (→) after the label. Hard offset shadow 0 4px 0 0 #111118 gives a sticker-like pop without softness.

### Dark Pill Button
**Role:** Secondary action — free trials, sign-in entry points

Fill #000000, text #ffffff, same 48px pill radius and 20px label, 12px 24px padding, no arrow. Hard offset shadow 0 4px 0 0 #2727e6 echoes the primary brand color as the shadow hue.

### Ghost Text Button
**Role:** Tertiary navigation — 'About', 'Catalog' nav links, footer links

No fill, no border, text #111118 in Haas Grot Text 20px weight 400, 8px vertical padding, transparent background, underline only on hover.

### Announcement Ticker
**Role:** Site-wide promotional bar at the very top of every page

Full-bleed bar, fill #111118, text #ffffff in Martian Mono 12px, letter-spacing -0.013em, uppercase tracking. Repeating message with a bullet separator. Fades to transparent on the left edge via the violet-to-clear linear-gradient, suggesting an infinite marquee.

### Top Navigation Bar
**Role:** Primary site navigation, sticky below the ticker

White background #ffffff, 1px bottom border #e1edff, height ~64px. Left: round 32px logo mark + 'Catalog' and 'About' links in Haas Grot Text 20px. Right: search icon, 'Cart' link, 'Sign in' pill button. No drop shadow — the 1px hairline is the only separator.

### Hero Text Block
**Role:** Centered headline-and-CTA composition on the home hero

Headline in Haas Grot Disp 72px weight 400, color #111118, letter-spacing -0.03em, two lines maximum, centered. Above the headline, a small 48px round icon mark in #2727e6 (the smiley emoji container). Below: subhead in Haas Grot Text 20px #111118, then two pill buttons side by side with 16px gap.

### Decorative Shape Layer
**Role:** Atmospheric cutout shapes scattered behind page content

Absolute-positioned oversized flat geometric forms — pentagons, triangles, semicircles, stars, circles — in the five accent colors. Sizes range 200–600px, rotated at varied angles, with 0px radius and no shadow. Sits behind the content layer at z-index 0, partially clipped by the viewport edges to create the impression of shapes spilling off the page.

### Course Card
**Role:** Catalog grid item — links to individual course pages

White surface #ffffff, 24px border-radius, 1px border #e1edff, 24px padding. Course image at top with 16px top radius. Title in Haas Grot Text 20px weight 400, meta line below in Martian Mono 12px, price or 'Free' tag at bottom. Hard offset shadow 0 2px 0 0 #111118.

### Student Work Card
**Role:** Showcase grid item — displays student project thumbnails

White surface, 16px border-radius, no shadow, image fills the entire card edge-to-edge with the title overlaid at the bottom-left in a small text bar. Designed to be visual-first, with minimal chrome.

### Featured Section Wash
**Role:** Highlighted content band (e.g. 'Most popular')

Full-bleed background in #ffbac4 (bubblegum) or #ffda00 (hi-yellow), content sits inside a 1200px max-width container. Section heading in Haas Grot Disp 42px #111118 left-aligned, with a right-aligned 'See all content →' primary pill button at the section's vertical center.

### Input Field
**Role:** Email capture, search, newsletter signup

Fill #f0f6ff, border 1px solid #e1edff, border-radius 5000px (full pill), padding 12px 20px, placeholder text in #111118 at 40% opacity, Haas Grot Text 16px. Focus state adds a 2px #2727e6 outer ring with 2px offset.

### Tag / Category Pill
**Role:** Course category labels, filter chips

5000px border-radius, fill #e1edff, text #111118 in Haas Grot Text 16px, padding 4px 12px, no border. Active filter state swaps fill to #2727e6 and text to #ffffff.

### Cookie Consent Bar
**Role:** GDPR notice pinned to the bottom of the viewport

Fixed full-width, fill #111118, padding 16px 24px, text #ffffff in Haas Grot Text 16px left-aligned with body copy and a 'We use essential cookies…' message. Right side: two pill buttons — 'Essential cookies only' in ghost style (white text, 1px white border) and 'Sure thing' as a dark-fill pill with white text.

### Round Icon Container
**Role:** Brand mark, category icon, avatar fallback

48px circle, fill #2727e6, contains a centered emoji or icon glyph in #ffffff. Used as the small smiley mark above the hero headline and as a floating category indicator.

## Do's and Don'ts

### Do
- Use #2727e6 as the single chromatic for every filled action button, active link, and brand-tinted icon container — no secondary brand colors on buttons.
- Set border-radius to 48px for all primary and secondary buttons; 24px for cards; 5000px for inputs, tags, and icon containers.
- Weight 400 across all three type families — the hierarchy comes from size, line-height, and letter-spacing, not from going bold.
- Anchor letter-spacing to -0.03em at 92px and ease it to -0.004em at 24px so display type tightens as it scales up.
- Scatter at least 3–5 oversized flat geometric shapes in the five accent colors behind any full-bleed hero or section, with 0px radius and no shadow.
- Use Martian Mono 12px only for promotional ticker text, tag labels, and code-flavored meta lines — never for paragraphs.
- Build cards on #ffffff with a 1px #e1edff hairline border and a hard 0 2px 0 0 #111118 offset shadow — no soft drop shadows.

### Don't
- Don't introduce a second brand chromatic on buttons or links — #2727e6 owns every action; the five accent colors are decoration only.
- Don't use bold or semibold weights — the type system runs entirely on 400, and bumping weight breaks the quiet, confident voice.
- Don't apply soft blurred drop shadows (rgba 0,0,0,0.x with blur > 4px) — the system uses hard offset shadows or no shadow at all.
- Don't use gradients inside decorative shapes or content blocks — only the announcement ticker carries a gradient, and only as a fade-to-clear.
- Don't put text directly on the pale-blue canvas without a card or button surface — the contrast ratio of #111118 on #f0f6ff is fine, but layout rhythm requires cards to create the page grid.
- Don't use the accent colors (red, yellow, green, pink, sky) on text or borders — they live exclusively as fills of the decorative shape layer.
- Don't use border-radius below 16px on any visible component — sharp corners would break the soft, pill-driven visual language.

## Elevation

- **Primary CTA button:** `0 4px 0 0 #111118`
- **Secondary dark button:** `0 4px 0 0 #2727e6`
- **Course card:** `0 2px 0 0 #111118`

## Surfaces

- **Chalk Blue Canvas** (`#f0f6ff`) — Page background — the default stage for the scattered cutout shapes
- **Paper White Card** (`#ffffff`) — Card surfaces, elevated content blocks, button fills
- **Frost Blue Wash** (`#e1edff`) — Soft section background and input field rest state
- **Bubblegum Section** (`#ffbac4`) — Featured content section wash (e.g. 'Most popular')
- **Hi-Yellow Section** (`#ffda00`) — Promotional section wash for high-attention blocks

## Imagery

Imagery is split into two distinct registers. The decorative layer is oversized flat paper-cut geometric shapes — pentagons, triangles, semicircles, stars, and circles in marker-red, hi-yellow, jelly-green, powder-sky, and bubblegum-pink — scattered behind content at full-bleed, overlapping the canvas edges, with sharp corners and zero shadow. The content layer is student project cards and course thumbnails shown as tight rectangular crops with 16px radii, no rounded masking, sitting on white card surfaces. Photography (when used) is high-key and product-focused, not lifestyle. There are no gradients in the decorative shapes; the only gradient is a violet-to-transparent left fade on the announcement bar.

## Layout

Layout is full-bleed with a 1200px content rail. The announcement ticker spans edge to edge at the very top, followed by a sticky white nav bar with the wordmark on the left and account actions on the right. The hero is a centered text block — single headline, subhead, and two pill buttons side by side — with decorative shapes floating in the negative space around the text rather than in a split column. Below the hero, sections alternate between Chalk Blue canvas and white card surfaces, stacking vertically with 80px gaps. Course and student work cards use a 3-column grid that collapses to 2 then 1. Section headers are left-aligned with a right-aligned 'See all' link. The cookie consent is a fixed full-width bar at the bottom with a dark fill and two action buttons aligned right.

## Similar Brands

- **Skillshare** — Same creative-education positioning with a bright, illustrative decorative layer behind content and pill-shaped CTA buttons
- **Canva's design school pages** — Same single-vibrant-accent-plus-pastel-canvas treatment and oversized flat geometric shapes used as atmospheric background
- **Maven** — Same soft-blue canvas, confident centered hero typography, and pill-radius buttons with trailing arrow glyphs
- **Glitch** — Same playful, creative-platform tone with a pale pastel background and one saturated brand color doing all the action-button work
- **Are.na** — Same clean, near-white canvas with quiet typography and the visual personality carried by scattered color accents rather than chrome
