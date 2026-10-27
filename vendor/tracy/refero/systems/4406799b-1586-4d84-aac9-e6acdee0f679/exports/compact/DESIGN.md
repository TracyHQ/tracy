# Redis Agency — Style Reference
> After-hours editorial atelier — a pitch-black gallery where serif type and a single red radish do all the brand work.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Redis Agency is a darkroom editorial system: a pitch-black canvas where massive Times New Roman display type and a single warm coral accent do all the talking. The visual language borrows from fashion magazine spreads and surrealist art direction — surreal food photography, organic green botanical forms, oversized serif headlines that feel cropped and overlapping rather than neatly typeset. Body and UI copy sit in a clean humanist sans (Suisse Intl) at modest sizes, which makes the display serif feel even more theatrical. The page stays nearly monochrome — black canvas, white type, a mid-gray for secondary text and hairline borders, and a coral red (#eb516d) that acts like a single brushstroke across an otherwise austere composition. Components are minimal: pill-shaped buttons, hairline borders, generous whitespace. Everything feels curated rather than generated — this is brand craft, not a SaaS dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone White | `#ffffff` | Primary text, pill button outlines, card outlines on dark canvas — high-contrast foreground against the black field |
| Smoke | `#808080` | Secondary text, hairline borders, muted UI strokes — the mid-gray that softens without disappearing |
| Obsidian | `#000000` | Page canvas and true-black surface — the dominant ground that makes everything else float |
| Graphite | `#333333` | Deep divider borders, near-invisible structural lines between dark surfaces |
| Radish Bloom | `#eb516d` | Single chromatic accent — barcode panel surface, red-punctuation moments; warm coral against the black field functions like a magazine pull-quote, used sparingly as the only saturated color in the UI |

## Typography

### Times New Roman — Display and heading serif — set at 90px for the hero wordmark and 32px for secondary headlines; uses the system Times rather than a contemporary serif, which is the anti-trend move that gives the brand its archival-editorial feel. The tight 0.82 line-height at 90px lets letters touch and overlap, creating a cropped magazine-spread effect.
- **Substitute:** PP Editorial New, EB Garamond, or Playfair Display
- **Weights:** 400
- **Sizes:** 32px, 90px
- **Line height:** 0.82, 1.05
- **Letter spacing:** -0.0100em

### Suisse Intl WebM — Primary UI and body sans — handles body text (14–18px), card content (18–24px), and larger non-serif headings (36–38px). The slightly negative tracking and humanist proportions keep body text dense and confident without competing with the display serif.
- **Substitute:** Inter, Söhne, or Untitled Sans
- **Weights:** 400
- **Sizes:** 14px, 16px, 18px, 24px, 36px, 38px
- **Line height:** 1.16, 1.20, 1.40
- **Letter spacing:** -0.0080em

### Editorial New — Thin label and caption face at 100 weight — used for tiny annotations, breadcrumbs, or credits where extra-light strokes add editorial polish to a small detail
- **Substitute:** PP Editorial New Thin, Inter Thin, or GT America Thin
- **Weights:** 100
- **Sizes:** 14px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | Editorial New | — | 14px | 1.2 | 0px |
| body | Suisse Intl WebM | — | 16px | 1.4 | -0.13px |
| subheading | Suisse Intl WebM | — | 18px | 1.2 | -0.14px |
| heading-sm | Suisse Intl WebM | — | 24px | 1.2 | -0.19px |
| heading | Suisse Intl WebM | — | 36px | 1.16 | -0.29px |
| display | Times New Roman | — | 90px | 0.82 | -0.9px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 70px
- **Card padding:** 25px
- **Element gap:** 22px

### Border Radius

- **cards:** 0px
- **links:** 24px
- **pills:** 44px
- **buttons:** 40px

## Components

### Display Serif Headline
**Role:** Hero typographic anchor — the wordmark and section openers

Times New Roman at 90px, weight 400, line-height 0.82, letter-spacing -0.0100em (≈ -0.9px). White (#ffffff) on #000000 canvas. Deliberately oversized and tight-tracked so letters touch and overlap, creating a cropped, magazine-spread feeling. Set centered or left-aligned; never constrained by a tight measure.

### Pill Outline Button
**Role:** Primary call-to-action

1px solid #ffffff border, 40px border-radius (fully pill-shaped), #ffffff text on #000000 background. Padding approximately 10px 25px. Suisse Intl WebM 14–16px, weight 400, letter-spacing -0.0080em. No fill — outline only, keeping the surface feeling open and editorial rather than buttony.

### Rounded Asymmetric Link
**Role:** Inline text link within body copy

24px border-radius on the link container (asymmetric, gives a soft-blob shape rather than a true pill), #ffffff text with #ffffff underline or hairline. 20px horizontal padding. Used sparingly inside editorial copy blocks.

### Editorial Body Block
**Role:** Long-form paragraph text and descriptions

Suisse Intl WebM 16–18px, weight 400, line-height 1.4, letter-spacing -0.0080em. White (#ffffff) on black. 22px row-gap between paragraphs, 35–40px margin-bottom between distinct blocks. Tight measure (~60ch) for readability.

### Radish Accent Panel
**Role:** Sole chromatic surface — barcode and signature red moments

Solid #eb516d fill with #ffffff content. Functions as a magazine pull-quote or chapter marker. Sits on the black canvas as the only saturated color in the system; the eye locks onto it immediately.

### Barcode Element
**Role:** Decorative catalog/archival mark

Black-and-white #ffffff barcode on #eb516d accent panel or directly on #000000 canvas. Functions as a branding device — references product packaging and editorial mastheads. Centered with ~20–25px vertical padding around it.

### Hairline Divider
**Role:** Section separator

1px solid #808080 line at full or content width. No padding, no margin — the line does the work. Used between editorial sections rather than boxes or cards.

### Section Heading (Serif Secondary)
**Role:** Sub-section titles in editorial body

Times New Roman 32px, weight 400, line-height 1.05, letter-spacing -0.0100em. White. Centred or left-aligned. Sits above body text to introduce a new editorial beat.

### Sans Subheading
**Role:** UI labels and non-display headers

Suisse Intl WebM 36–38px, weight 400, line-height 1.16. White. Used for card titles, feature names, or any heading that should feel modern rather than editorial.

### Thin Label Caption
**Role:** Tiny annotations, breadcrumb trails, or credits

Editorial New 14px, weight 100, line-height 1.2, normal letter-spacing. White. The extra-light weight gives small details a quiet, typeset quality.

### Surreal Product Hero
**Role:** Primary visual centerpiece

Full-bleed editorial photograph: a single red radish surrounded by organic green plant or liquid forms floating in the black canvas. No border, no container, no rounded corners — the imagery occupies the field directly, breaking across the display type. Treated as artwork, not product UI.

### Ghost Navigation Link
**Role:** Top-level nav and footer links

Suisse Intl WebM 14–16px, weight 400, #ffffff text, no background, no border. 20–25px horizontal spacing between items. No underline by default; subtle hover state only.

## Do's and Don'ts

### Do
- Set the hero wordmark in Times New Roman 90px, line-height 0.82, letter-spacing -0.9px — the tight crop and overlapping letters are the signature
- Use #eb516d Radish Bloom for exactly one surface per screen — a barcode panel, a single badge, or a pull-quote block
- Outline buttons with 1px #ffffff border on 40px radius — never fill them, the ghost surface preserves the editorial openness
- Separate sections with 1px #808080 hairline dividers, not cards or boxes — the dark canvas does the structural work
- Set body copy at 16–18px Suisse Intl WebM, line-height 1.4, letter-spacing -0.0080em
- Allow imagery to overlap display type at the hero — the broken grid is intentional, not a layout bug
- Reserve Times New Roman for sizes ≥ 32px; below that it stops feeling editorial and starts feeling like a fallback

### Don't
- Do not fill buttons with #eb516d or any saturated color — buttons stay outlined in #ffffff, red is reserved for surfaces
- Do not use box-shadows or any drop-shadow elevation — the system relies on color contrast and hairline borders, not depth
- Do not introduce a second chromatic color into the UI palette — greens, blues, or any hue beyond #eb516d breaks the discipline
- Do not set Times New Roman below 32px — it loses its editorial authority and reads as a system default
- Do not use card containers with rounded corners and backgrounds for content blocks — content floats on the black canvas, separated by whitespace and hairlines
- Do not center body paragraphs — left-align editorial copy with a 600px measure for readability
- Do not use light-mode styling (white canvas, dark text) — the darkroom canvas is the system's defining surface

## Elevation

No shadows. The dark canvas and high-contrast white type do the work of separation. Hairline #808080 borders are the only structural lines; cards and surfaces are defined by negative space, not elevation.

## Surfaces

- **Obsidian Canvas** (`#000000`) — Full-bleed page background — the darkroom field
- **Radish Panel** (`#eb516d`) — Accent surface for barcode and signature moments — the only chromatic surface in the system

## Imagery

Surreal editorial product photography — a single red radish suspended in the void, surrounded by organic green botanical or liquid forms that feel 3D-rendered and hand-shaped. The aesthetic is fashion-meets-archival: high-contrast, dark-background, tight crop, no lifestyle context. Imagery overlaps display type rather than sitting beside it, breaking the grid. The green plant matter is saturated and hyperreal; the radish is a single saturated red moment. Overall: image-heavy at the hero, then becomes text-dominant as the user scrolls. Imagery is decorative atmosphere, not explanatory content.

## Layout

Full-bleed dark canvas with no visible page padding at the hero — the radish, green forms, and oversized 'Redis Agency' serif type all share the same black field and overlap. Content begins centered or left-aligned with generous whitespace (70px section gaps). Max-width ~1200px for body content; hero extends full-bleed. The page flows as an editorial scroll: hero typographic moment → surreal visual → centered text block on black → accent barcode panel → secondary hero → more editorial copy. No card grids, no pricing tables, no feature matrices — this is a portfolio/spread layout, not a SaaS page. Navigation is a minimal top bar with ghost text links; no sticky behavior, no mega-menu.

## Similar Brands

- **Buck (buck.co)** — Same dark-canvas + single accent editorial approach with massive serif display type and surreal 3D imagery
- **Locomotive (locomotive.ca)** — Editorial layout with overlapping display type, full-bleed photography, and near-monochrome palette punctuated by one brand color
- **Resn (resn.co.nz)** — Surreal digital art direction with dark canvas, oversized type, and imagery that breaks the grid
- **Pentagram (pentagram.com)** — Agency portfolio that treats each project as an editorial spread rather than a SaaS landing page
- **Gunner (gunner.co)** — Minimalist dark agency site with hairline borders, ghost outlined buttons, and let the work speak
