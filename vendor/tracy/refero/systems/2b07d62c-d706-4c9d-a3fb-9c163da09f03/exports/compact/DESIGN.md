# Schema — Style Reference
> Ink-black keynote stage with confetti-bright murals

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Schema by Figma runs on a stark monochrome architecture punctured by bold flat-color geometric murals. The UI uses pure black, near-black, and white with hairline gray borders — no shadows, minimal radii, no chromatic accents in the interface itself. Color appears only as decorative art (circles, hexagons, rectangles in purple, teal, maroon, green, orange) and as solid-background speaker portraits. Typography is the loudest element: Figma's custom display face at 56–86px with extreme negative tracking (-0.02em) and tight 0.90 line-height makes headlines feel carved rather than typeset. The hero inverts convention with a black canvas and an oversized outlined Register button; content sections then alternate through full-bleed colored bands before resolving into a clean white speaker grid.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Hero canvas, heavy structural borders, icon strokes — sets the high-contrast keynote-stage mood for the opening fold |
| Ink | `#0f0f0f` | Body and heading text on light surfaces, dark section borders |
| Paper | `#ffffff` | Page background, speaker card surfaces, light-section text on dark hero |
| Ash | `#e2e2e2` | Hairline borders, subtle icon fills, structural dividers between UI regions |
| Mint Wash | `#c7f8fb` | Teal wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Emerald Band | `#24cb71` | Full-bleed accent section background — a bright green horizontal band that closes the hero composition |

## Typography

### Source Sans Pro — Source Sans Pro — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Figma Sans Display — Headlines and display copy — used at 56–86px for hero ('Schema by Figma', 'Meet our speakers!') with tight leading (0.90–1.10) and -0.02em tracking that makes type feel carved from a block. Weight 400 carries the design; 700 is reserved for emphasis.
- **Substitute:** Inter Tight or a custom variable sans like General Sans
- **Weights:** 400, 700
- **Sizes:** 16, 24, 32, 56, 72, 86
- **Line height:** 0.90–1.40
- **Letter spacing:** -0.02em at 72–86px, -0.01em at 24–32px, 0.03em for some 16px contexts

### Figma Sans Text — Body, nav, button labels, supporting text. The companion text face at modest sizes (13–18px) with weight 400 as default and 600 for buttons/labels. -0.02em at 13px prevents the small type from feeling loose; 0.03em at 18px gives labels air.
- **Substitute:** Inter or Söhne
- **Weights:** 400, 600
- **Sizes:** 13, 16, 18
- **Line height:** 1.20–1.22
- **Letter spacing:** -0.02em at 13px, 0.03em at 18px

### Figma Mono — Code or metadata snippets — used sparingly at 16px with 0.03em tracking for an architectural, monospaced accent in a world of proportional text
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.30–1.40
- **Letter spacing:** 0.03em

### Figma VF-normal-700-75 — Figma VF-normal-700-75 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 24px
- **Line height:** 1.2

### Figma VF-normal-400-100 — Figma VF-normal-400-100 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2
- **Letter spacing:** 0.03

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | -0.26px |
| body | — | — | 16px | 1.2 | 0px |
| body-md | — | — | 18px | 1.22 | 0.54px |
| subheading | — | — | 24px | 1.2 | -0.24px |
| heading-sm | — | — | 32px | 1.1 | -0.32px |
| heading | — | — | 56px | 1 | -1.12px |
| heading-lg | — | — | 72px | 0.9 | -1.44px |
| display | — | — | 86px | 0.9 | -1.72px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 60px
- **Card padding:** 16px
- **Element gap:** 24px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **buttons:** 0px
- **speaker-images:** 0px

## Components

### Top Navigation Bar
**Role:** Persistent header across all sections

Transparent on the black hero, Paper on light sections. Left: small monogram logo (32px square, Obsidian or Paper fill). Right: 2–4 text links (FAQ, Agenda) at 16px Figma Sans Text weight 400, tracking 0.03em. 16px horizontal padding, 20px vertical. No background fill, no border.

### Hero Outlined Register Button
**Role:** Primary action on the dark hero

Full-width on the hero, 56–64px tall. 1px Paper border, no fill, Paper text. 0px radius. Text at 18–24px Figma Sans Text weight 400, centered. On hover, fills to Paper with Obsidian text.

### Eyebrow Label
**Role:** Section pre-heading (VIRTUAL, SPEAKERS, REGISTER)

12–13px Figma Sans Text weight 400 or 600, uppercase via CSS, tracking 0.03em. Color is Ink on light sections, Paper on dark. Sits 16–24px above the headline.

### Display Headline
**Role:** Section hero titles ('Schema by Figma', 'Meet our speakers!', 'Join us virtually!')

Figma Sans Display weight 400, 56–86px, line-height 0.90–1.00, letter-spacing -0.02em. Ink color on light sections, Paper on dark hero. No max-width constraint — fills available column.

### Geometric Mural Banner
**Role:** Decorative full-bleed section divider between hero and content

Full viewport width, ~200–300px tall. Flat 2D art: circles, rectangles, hexagons, chevrons in saturated palette (indigo #4a4afc, lavender #b8b3ff, teal #c7f8fb, maroon #7a2e2, orange #ff6b2c, emerald #24cb71, yellow #ffe74a). No gradients, no shadows. Edges are hard/rectilinear where blocks meet the canvas.

### Speaker Portrait Card
**Role:** Speaker in the grid

Square portrait image, 0px radius, fills a 4-column grid. Each portrait sits on a solid background color (mint, emerald, indigo, lavender, orange, yellow). Below: name in Figma Sans Text weight 600 at 18px, title/role in Figma Sans Text weight 400 at 16px — both in Ink. 24px gap between portrait and text, 48px between cards vertically.

### Event Status Notice
**Role:** Inline status banner ('Event ended')

Centered or right-aligned block. Small triangular warning icon (~24px, Ink fill) above label. Label in Figma Sans Text weight 600 at 18–24px, subtext at 16px weight 400. Sits on the cyan Mint Wash band.

### Full-Bleed Color Section
**Role:** Horizontal content band with colored background

Edge-to-edge, ~200–400px tall, Paper or Ink text depending on contrast. Internal padding 60px top/bottom, 24–48px left/right. No border, no radius, no shadow.

### Date/Time Metadata Block
**Role:** Event date and time under hero headline

Two lines: bold date (16–18px Figma Sans Text weight 600) above time range (16–18px weight 400). Inherit text color from section (Paper on dark hero). 8–16px gap between lines.

### Grid Section Header
**Role:** Section title block above card grid (e.g., "Meet our speakers!")

Eyebrow label + display headline, left-aligned. 24px gap between label and headline. Sits 48–60px above the grid.

## Do's and Don'ts

### Do
- Use 0px border-radius on all cards, buttons, images, and tags — sharp corners are non-negotiable
- Pair the dark hero with a large outlined button (1px Paper border, no fill); fill it on hover
- Apply Figma Sans Display at 56–86px with -0.02em tracking and 0.90–1.00 line-height for any headline that needs to feel carved
- Reach 0.03em tracking on small labels (13–18px) to give uppercase eyebrows and nav links air
- Alternate full-bleed colored bands (Mint Wash #c7f8fb, Emerald Band #24cb71) between dark and light sections to create visual rhythm
- Use Ash (#e2e2e2) 1px borders for hairline separation; reserve Ink (#0f0f0f) borders for emphasis on light sections
- Keep the UI monochrome — let color appear only in decorative murals and speaker portrait backgrounds, never in controls

### Don't
- Don't add border-radius to any element — sharp corners define the system's poster-like character
- Don't use shadows, glows, or blur effects — flat is the only elevation language here
- Don't introduce a chromatic CTA color — the system is intentionally monochrome, actions are outlined or text-only
- Don't set body text below 16px; captions can go to 13px but never smaller
- Don't let display headlines exceed 0.90–1.00 line-height — tight leading is what makes them feel architectural
- Don't color-fill buttons with brand hues; outlined Paper-on-Obsidian is the only button pattern in the system
- Don't separate light sections with gray bands — use either full-bleed color or seamless Paper-to-Paper flow

## Elevation

Shadowless flat design — separation is achieved through hard edges, color blocks, and 1px hairline borders in Ash (#e2e2e2) or Ink. The absence of shadow is a deliberate editorial choice: every element is printed flat onto the page like a poster, never floating above it.

## Surfaces

- **Dark Hero Canvas** (`#000000`) — Opening fold, sets editorial tone, contains Register CTA and decorative mural
- **Colored Band** (`#c7f8fb`) — Cyan section separating hero from content
- **Colored Band** (`#24cb71`) — Green section band
- **Paper** (`#ffffff`) — Main content canvas for speaker grid and text sections

## Imagery

The site uses bold flat-color geometric illustration as a hero divider: circles, rectangles, hexagons, chevrons, and dots in a saturated palette (indigo, lavender, teal, maroon, orange, emerald, yellow) with hard rectilinear edges and no gradients or shadows. Speaker portraits are desaturated or black-and-white photographs, each placed on a solid color background (mint, emerald, indigo, lavender, orange, yellow) to create a poster-grid effect. Icons are minimal and mono — a single triangular warning glyph is the only iconographic element visible. The overall treatment is editorial-poster: no soft photography, no lifestyle shots, no depth — everything is either flat color, flat type, or a flat photo on flat color.

## Layout

The page follows a top-to-bottom band model. It opens with a full-bleed black hero (centered or left-aligned content block, full-width outlined Register CTA) that bleeds into a ~250px-tall geometric mural banner spanning the viewport width. Below the mural, a light teal (Mint Wash) band holds the secondary 'Join us virtually!' CTA and an event status notice, followed by a bright green (Emerald Band) strip. The page then resolves into a max-width 1200px white content area with 60px vertical section gaps, opening with a left-aligned section header (eyebrow + display headline) above a 4-column grid of speaker cards. Navigation is a minimal top bar — logo left, 2 text links right, transparent on the dark hero and Paper on light sections. There is no sidebar, no sticky header beyond the nav, and no modal overlays.

## Similar Brands

- **Config (Figma's annual conference)** — Same Figma Sans Display typography at hero scale, same poster-mural art style, same monochrome UI with full-bleed colored bands
- **Apple Event pages** — Black hero with large outlined CTA, editorial display type at extreme scale, full-bleed color band transitions between sections
- **Figma Config 2022–2024 microsites** — Identical geometric flat-color illustration system and Figma Sans pairing, with speaker portraits on solid color backgrounds
- **Are.na event pages** — Editorial-poster layout, sharp 0px corners, monochrome UI punctuated by bold flat-color section bands
- **It's Nice That conference coverage** — Design-zine aesthetic with oversized display headlines, tight tracking, and full-bleed decorative color blocks
