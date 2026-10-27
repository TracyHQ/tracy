# A24 — Style Reference
> opening title sequence on pure black

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A24 operates as a cinematic editorial system: pure monochrome pages where typography does all the emotional work. The design alternates full-bleed black and white bands, using a custom humanist sans-serif (NB International) at extreme sizes — up to 74px display — to let film titles and headlines become visual artifacts rather than mere labels. Every UI element is stripped to its barest form: hairline borders, zero radius, zero shadow, zero chromatic accent. The site's restraint IS the brand; it borrows the visual grammar of a film opening title sequence — high contrast, generous negative space, and confidence through absence rather than addition.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Section backgrounds for dark bands, primary body text on light surfaces, hairline borders and dividers throughout — the structural backbone of every page |
| Paper White | `#ffffff` | Light section backgrounds, card surfaces, product image containers, modal/overlay panels, primary text on dark backgrounds |
| Ash Gray | `#eeeeee` | Subtle surface variant for product showcase panels and soft background shifts on light sections |
| Smoke | `#888888` | Muted secondary text, subdued nav labels, low-emphasis borders — sits just above AA contrast for accessibility |
| Bone | `#cacaca` | Light hairline borders on white surfaces, minimal separator lines, very low-emphasis UI strokes |

## Typography

### NB International Web — Primary typeface for all UI — navigation, body copy, headings, and display film titles. Weight 400 carries body and most UI; weight 500 for emphasis. The 74px display size with tight tracking (-0.04em) and 0.92 line-height lets film titles stack in dense, almost poster-like blocks. The humanist proportions and slight warmth make it readable at 11px yet commanding at 74px — the same family spans the entire voice.
- **Substitute:** Inter, Söhne, or Untitled Sans
- **Weights:** 400, 500
- **Sizes:** 10px, 11px, 12px, 13px, 15px, 18px, 21px, 74px
- **Line height:** 0.92, 1.00, 1.07, 1.20, 1.23, 1.30, 1.32, 1.33, 1.50, 1.67, 1.92
- **Letter spacing:** -0.04em at 74px display, tightening toward 0.005-0.014em at 10-13px caption sizes
- **OpenType features:** `"cpsp"`

### NB International Mono Web — Monospaced companion for technical labels, year markers beside film titles, and code-like annotations. Used sparingly as a typographic accent that signals data/specification context.
- **Substitute:** IBM Plex Mono or JetBrains Mono
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 0.92
- **Letter spacing:** -0.065em
- **OpenType features:** `"cpsp"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 0.14px |
| body | — | — | 15px | 1.5 | 0px |
| subheading | — | — | 18px | 1.33 | -0.09px |
| heading-sm | — | — | 21px | 1.3 | -0.18px |
| display | — | — | 74px | 0.92 | -2.96px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 96px
- **Card padding:** 22px
- **Element gap:** 9px

### Border Radius

- **cards:** 0px
- **inputs:** 0px
- **modals:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Persistent header across all pages

Fixed-position bar, 0px radius, no background or transparent. Left: hamburger icon + 'MENU' label in NB International 400 at 13px, #000 or #fff depending on section. Center: 'A24' wordmark in NB International 500 at ~18px. Right: search icon. No border, no shadow. The bar floats on whatever section background is beneath it.

### Film Title Block
**Role:** Hero and film-list display

Left-aligned stacked headings. Film title in NB International 400 at 74px, line-height 0.92, letter-spacing -2.96px, color contrasting with section background. Year label (e.g. '2026') in NB International Mono at 15px, positioned to the right of the title at vertical-center. No padding, no border — the type IS the component. Multiple titles stack vertically with 0px gap (lines touch).

### CTA with Arrow
**Role:** Section navigation links

Inline link with right-arrow icon (→) preceding label. NB International 400 at 15px, uppercase tracking. Arrow is a simple line glyph, not an icon font. No background, no border, no padding. Color matches surrounding text. Used for 'LISTEN NOW', 'SHOP NOW' style actions.

### Product Showcase Card
**Role:** Merchandise display

Large image container on #eeeeee background. Product photo centered with generous padding (22px+ all sides). No border, no radius. Adjacent to the image: category label (e.g. 'SHOP') in uppercase NB International 400 at 10-11px, 0.14em tracking, #000. Product title below in NB International 400 at 21-30px, line-height 1.2.

### Email Signup Modal
**Role:** Newsletter capture overlay

Centered modal panel, #000000 background, 0px radius. Header text 'WANT MORE A24?' in NB International 400 uppercase at 10-11px, white, wide tracking. Close X in top-right corner, white stroke. Body copy in NB International 400 at 15px, white, 1.5 line-height. No padding around edges — text sits tight to the panel boundaries.

### Email Input Field
**Role:** Text capture within modal

Inline input with 1px solid #fff border on left/top/bottom, 0px radius, no background. Placeholder 'EMAIL' in uppercase NB International 400 at 11px, white, wide tracking. Padding 18px horizontal, 22px vertical. No focus ring color change — the existing border is the affordance.

### Sign Up Button
**Role:** Form submission in modal

Adjacent to email input, 0px radius, #ffffff background, #000000 text. NB International 400 at 11px, uppercase, tracking 0.14em. Padding 22px vertical, 18px horizontal. No border, no shadow. Inverted from the input — solid white block against the black modal.

### Podcast Feature Block
**Role:** Audio content promotion

Two-column layout: left side has category label 'PODCAST' at 11px uppercase, then large stacked title in NB International 400 at 40-74px, then 'LISTEN NOW' CTA with arrow. Right side: full-bleed black-and-white portrait photograph, 0px radius, hard rectangular crop. The portrait's blackness visually connects to the dark section treatment.

### Search Icon Button
**Role:** Search trigger in nav

Simple magnifying glass icon, 1.5px stroke, NB International or SVG, no background, no border, no padding. Sits flush in the nav bar right position.

### Hamburger Menu Trigger
**Role:** Primary navigation open

Two horizontal lines (hamburger icon) + 'MENU' label in NB International 400 at 13px, uppercase, 0.005em tracking. No background, no border. Color adapts to section (white on black, black on white).

### Scroll Indicator Arrow
**Role:** Vertical scroll prompt at page bottom

Simple downward arrow (↓), thin stroke, positioned bottom-right of viewport. No background, no text, no animation specified — static line glyph in the current section's contrast color.

## Do's and Don'ts

### Do
- Use #000000 and #ffffff as the only meaningful background and text values — alternate full-bleed black and white sections to create visual rhythm
- Set display headlines to 74px with NB International weight 400, line-height 0.92, letter-spacing -2.96px, letting titles stack with zero vertical gap
- Use NB International Mono at 15px for year labels and technical annotations — pair flush-right with display titles
- Apply 0px border-radius to every component — cards, buttons, inputs, modals, images. Sharp edges are non-negotiable
- Use NB International at 10-11px with 0.14em tracking for all uppercase labels (nav items, category tags, form labels)
- Separate form inputs and buttons with shared borders (input has left/top/bottom border, button is solid fill) to create a single connected control
- Let the page be full-bleed with no max-width constraint — let type and image define the grid

### Don't
- Do not introduce any color, gradient, or chromatic accent — the palette is strictly achromatic
- Do not use border-radius on any element, including images and product cards
- Do not apply box-shadow, drop-shadow, or any elevation effect — depth comes from value contrast alone
- Do not center-align body copy or film titles — everything reads left-aligned
- Do not use font-weight above 500 — NB International's range is restrained on purpose
- Do not add decorative elements, dividers, or ornamental graphics between content blocks
- Do not use a second typeface family beyond NB International Mono — the mono variant is the only permitted departure

## Elevation

A24 uses zero shadows. Depth is created exclusively through stark value contrast — alternating full-bleed black and white bands, and high-contrast text on solid surfaces. There are no soft elevations, no card lifts, no z-axis layering cues. Every element sits flush on its surface with hard, precise edges.

## Surfaces

- **Paper White** (`#ffffff`) — Default page canvas, light section backgrounds
- **Ash Gray** (`#eeeeee`) — Product image containers, subtle surface differentiation on light sections
- **Obsidian** (`#000000`) — Dark section bands, full-bleed black pages, modal overlays

## Imagery

A24's visual language is photography-driven and starkly editorial. Product photography is presented on pure flat backgrounds (#eeeeee or white) with no lifestyle context, no props, no staged environment — the object is isolated and centered. Portrait photography for podcast/media features uses high-contrast black-and-white treatment, tightly cropped, filling its frame with no border or radius. Film stills and promotional imagery maintain a cinematic, high-contrast quality. There are no illustrations, no 3D renders, no abstract graphics, and no icons beyond simple line glyphs (arrow, hamburger, search, X). Icon style is strictly outlined with thin ~1.5px strokes, monochrome, matching text color. Imagery density varies by section but tends toward large singular images rather than grids of thumbnails.

## Layout

Full-bleed page model with no max-width container — content stretches edge to edge. The first screen is a black band with large left-aligned film titles stacked vertically, the wordmark centered in a minimal nav above. Sections alternate between full-bleed black and full-bleed white/light-gray, creating dramatic contrast bands that define the page rhythm. Section gaps are generous (96px) to let the alternation breathe. Content arrangement is consistently left-aligned text paired with right-side image blocks (asymmetric two-column), occasionally stacking to full-width single-image bands. Product and podcast sections use a light-gray (#eeeeee) image container on the left with text content right-aligned beside it. Navigation is a minimal transparent top bar — hamburger left, logo center, search right — floating over whatever section is current. No sidebar, no mega-menu, no breadcrumbs. The scroll indicator arrow at bottom-right implies vertical continuation. Grid usage is minimal: the layout is fundamentally a series of full-width bands with internal asymmetric text+image splits, not card grids or multi-column content blocks.

## Similar Brands

- **Mubi** — Same cinematic editorial monochrome treatment with full-bleed black/white sections and large display type carrying film curation
- **Werkstatt (Werkstätte) design studios** — Same zero-radius, zero-shadow, typographically-driven minimalism with hairline borders and strict achromatic palette
- **The Criterion Collection** — Same art-house film aesthetic using stark black backgrounds, large serif/sans display titles, and generous negative space
- **Apple Newsroom** — Same full-bleed alternating dark/light bands with large left-aligned display type and minimal UI chrome
- **Ssense editorial** — Same fashion/culture brand approach using extreme typographic scale, stark contrast, and zero decorative ornamentation
