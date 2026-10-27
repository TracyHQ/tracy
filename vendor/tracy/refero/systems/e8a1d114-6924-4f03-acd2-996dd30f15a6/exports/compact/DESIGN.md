# Monzo — Style Reference
> Warm coral on cool mint paper — confident restraint with a single hot accent.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Monzo operates as a digital-first challenger bank with a light, warm, and unapologetically friendly visual language. The canvas is a whisper-soft mint off-white (#f2f8f3) that sits behind crisp white card surfaces, creating a layered paper-on-paper feel without relying on heavy shadows. A single vivid Hot Coral (#ff4f40) carries all chromatic energy — it stains the logo, links, headings, icons, and the physical card product itself, while the rest of the interface stays achromatic and quiet. Typography is custom sans-serif in two voices: a text family with a distinctive negative letter-spacing of -0.05em that tightens paragraphs, and a chunky display face at 600-800 weight for headings. Components are generously rounded (pills for actions, 64px for containers) and deliberately low-elevation — the brand trusts color, type weight, and whitespace to create hierarchy, not drop shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Hot Coral | `#ff4f40` | Brand signature — logo, links, headings, icons, card product. One vivid accent against the achromatic interface; every chromatic moment in the system draws from this single hue |
| Midnight Ink | `#091723` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Deep Navy | `#112231` | Secondary surface tint and footer accents. Slightly lighter than Midnight Ink for layered dark elements |
| Page Mist | `#f2f8f3` | Page canvas — the dominant background behind all content sections. A barely-green off-white that gives the interface warmth without competing with white surfaces |
| Pure White | `#ffffff` | Card surfaces, elevated panels, button text on dark fills. Sits one layer above the mint canvas |
| Soft Mint | `#e3ebe4` | Hover washes, subtle filled buttons, inset surface treatment. Sits between the page canvas and white cards |
| Fog | `#b5b9bd` | Tertiary text, placeholder, low-emphasis borders |
| Steel | `#6b747b` | Secondary body text, metadata, descriptive copy. The workhorse neutral for supporting information |
| Ash | `#75817e` | Icon strokes, decorative line work, subtle dividers |
| Slate Button | `#3b4c54` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Pure Black | `#000000` | Maximum-contrast text, the darkest token in the system. Used sparingly for the highest-emphasis text on light surfaces |

## Typography

### MonzoSansText — Body and UI text — navigation labels, button copy, descriptive paragraphs, card content, footer text. The custom -0.05em letter-spacing tightens running text for a dense, modern feel; the 400/600/700 spread lets the same family handle everything from captions to subheadings. Substitute with Inter or DM Sans if unavailable.
- **Substitute:** Inter
- **Weights:** 400, 600, 700
- **Sizes:** 13px, 16px, 20px, 24px, 32px, 36px
- **Line height:** 1.15, 1.38, 1.40, 1.50
- **Letter spacing:** -0.05em

### MonzoSansDisplay — Headlines and display text — hero statements, section headings, large product titles. Bolder weights (up to 800) at large sizes (39-61px) create confident, blocky headlines that feel architectural. No custom letter-spacing, letting the weight do the work. Substitute with Inter or Manrope at heavy weights.
- **Substitute:** Manrope
- **Weights:** 600, 700, 800
- **Sizes:** 16px, 20px, 25px, 31px, 39px, 44px, 49px, 61px
- **Line height:** 1.00, 1.20, 1.40
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.38 | -0.65px |
| body-sm | — | — | 16px | 1.5 | -0.8px |
| body | — | — | 20px | 1.4 | -1px |
| subheading | — | — | 24px | 1.38 | -1.2px |
| heading | — | — | 36px | 1.15 | -1.8px |
| heading-lg | — | — | 44px | 1.2 | — |
| display | — | — | 61px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 30-32px
- **Element gap:** 24px

### Border Radius

- **cards:** 64px
- **badges:** 4px
- **inputs:** 24px
- **buttons:** 500px
- **nav-pills:** 500px
- **containers:** 32px

## Components

### Pill Nav Toggle
**Role:** Segment-style personal/business selector in the top bar

Light mint fill (#f2f8f3) on the active segment, transparent on the inactive. 500px border-radius (fully pill-shaped). MonzoSansText 16px weight 600. 8px vertical / 12-16px horizontal padding. The icon sits left of the label with a small chevron-right.

### Sign Up CTA (Dark Pill)
**Role:** Primary dark action in the top-right navigation

500px border-radius. Midnight Ink (#091723) background with white text. MonzoSansText 16px weight 600. 12px vertical / 20-24px horizontal padding. No shadow, no border. The highest-emphasis action on every screen.

### White Pill CTA
**Role:** Light-on-image call-to-action over the hero carousel

500px border-radius. White background with Midnight Ink text. 14-16px vertical / 28-32px horizontal padding. Sits on top of photography without competing — the eye reads the image first, then the button.

### Category Link List
**Role:** Expandable topic links in the help/footer navigation panel

Large-format links rendered in Hot Coral (#ff4f40) at 32-36px MonzoSansDisplay weight 700. Separated by 1px hairline borders in Soft Mint (#e3ebe4). Each row is 60-72px tall. The coral text against the pale mint background is the system's loudest text moment — intentional, guiding the eye down the list.

### Carousel Card
**Role:** Full-width hero image slider

64px border-radius on the outer container. Contains a full-bleed photograph with overlaid text (MonzoSansDisplay 44-61px weight 700 white) and a CTA button. Navigation dots are small white circles at the bottom-center. Left/right arrow controls are 40px circles with thin white outlines.

### Product Card
**Role:** Showcase for a banking product (current account, savings, etc.)

64px border-radius, 30-32px padding. Sits on the mint canvas. Contains a coral product visual (card image) on the left, MonzoSansText description on the right. No shadow, no border — separation is achieved through whitespace on the warm background.

### Which? Badge
**Role:** Third-party endorsement / trust signal

Circular badge, approximately 100-120px diameter, white background with a thin Hot Coral border. MonzoSansText 11-13px. Floats in the top-right corner of the hero card.

### FSCS Badge
**Role:** Regulatory trust mark

Small white rounded rectangle (4px radius), FSCS Protected logo in coral and dark navy. Positioned at the bottom-right of hero imagery.

### Arrow Control (Circular)
**Role:** Carousel pagination buttons

40px diameter circle, transparent fill, 1.5px white or Midnight Ink stroke. Simple chevron icon centered. No fill state, no shadow.

### Fixed Bottom Search Bar
**Role:** Persistent help/search input docked at the viewport bottom

64px border-radius. White background with a 2px Hot Coral focus ring on the left edge. Full-width minus margins. MonzoSansText 16px placeholder in Steel (#6b747b). Hovers above content as a floating utility.

### Sticky Top Bar
**Role:** Global navigation header

Transparent or white background, 64-80px height. Monzo logo (Hot Coral wordmark) on the left, segment toggle centered-left, Sign Up button on the right. 1px bottom border in Soft Mint on scroll.

### Menu Label
**Role:** Bold category heading in the expandable navigation panel

MonzoSansText 24-32px weight 700 in Midnight Ink. Sits above the coral link list. Acts as a quiet table-of-contents header.

### Carousel Dot Indicator
**Role:** Position indicator for the hero slider

Three to five small circles (8px). Active dot is white at full opacity, inactive dots are white at 40% opacity. No labels, no text.

## Do's and Don'ts

### Do
- Use 500px border-radius for all interactive pills — buttons, nav toggles, tag chips, and the search bar. This is the system's defining shape.
- Keep the interface 95% achromatic. Let Hot Coral (#ff4f40) appear only on the logo, links, headings, icons, and the card product — never as a background fill for UI controls.
- Use MonzoSansDisplay 600-800 for all headings at 36px and above. The heavier weight range is non-negotiable for display type.
- Apply -0.05em letter-spacing to all MonzoSansText usage. This is a brand-defining typographic detail, not optional.
- Layer surfaces on the mint canvas (#f2f8f3 → #ffffff → #e3ebe4) instead of using shadows. Elevation is communicated by color stepping, not by drop shadows.
- Set body text at 20px with 1.4 line-height for descriptive paragraphs. Monzo's text size runs larger than typical SaaS — 16px is the floor, not the default.
- Use 64px border-radius on all large containers — hero cards, product showcases, section panels. This generous rounding is as recognizable as the coral.

### Don't
- Don't use Hot Coral as a button background fill. It is for text, icons, logos, and the card product only — never for a solid CTA surface.
- Don't add drop shadows to cards or buttons. The system uses a single rgba(0,0,0,0.1) 0px 0px 10px shadow sparingly; most separation comes from surface color stepping on the mint canvas.
- Don't use system fonts or non-brand sans-serifs. Always specify MonzoSansText for body and MonzoSansDisplay for headings.
- Don't use letter-spacing other than -0.05em on MonzoSansText or normal on MonzoSansDisplay. Deviating breaks the brand's typographic fingerprint.
- Don't mix red and dark navy as a gradient or color pair on the same element. Coral is the accent; navy is the ground. They alternate, they don't blend.
- Don't use square or 8px radii on primary buttons or large containers. 500px pills and 64px containers are the two shape languages — anything between looks generic.
- Don't set body text below 16px or headlines below 32px. The type scale is deliberately generous; small text breaks the warm, spacious feel.

## Elevation

- **Floating Search Bar:** `rgba(0, 0, 0, 0.1) 0px 0px 10px 0px`

## Surfaces

- **Page Canvas** (`#f2f8f3`) — Base background — the warm mint that fills the viewport and defines the system's light theme.
- **Card Surface** (`#ffffff`) — Elevated content surfaces — hero card, product cards, floating search bar. One step brighter than the canvas.
- **Soft Fill** (`#e3ebe4`) — Inset surfaces, hover washes, subtle filled states. Sits between canvas and card for intermediate layering.
- **Active Highlight** (`#b5b9bd`) — Low-emphasis borders, inactive state washes, placeholder surface tone.

## Imagery

Monzo's visual language is built on real photography of people in everyday financial moments — hands paying for coffee, fingers tapping card readers, casual lifestyle scenes with warm natural lighting. Photos are always full-bleed within a 64px-rounded container, never cropped to sharp rectangles, and always carry a dark overlay or darken treatment so white text remains legible. The Hot Coral card product itself functions as a recurring graphic element — a flat, vivid red rectangle that anchors product showcases. Iconography is minimal: simple outlined arrows and chevrons in thin strokes, never filled. No illustration, no 3D, no abstract graphics. The brand's confidence comes from believing one good photograph and one good color can carry a whole screen.

## Layout

Monzo's page structure is centered and max-width contained at approximately 1200px. The hero is a full-viewport carousel — each slide is a 64px-rounded image card spanning the full content width, with overlaid headline, subtext, and a white pill CTA positioned bottom-left. Below the hero, content sections stack vertically with 64-80px gaps, alternating between white product cards on the mint canvas and full-width coral-themed feature blocks. The fixed bottom search bar creates a persistent utility layer across all pages. Navigation is a simple sticky top bar with a pill segment toggle (Personal/Business), the coral wordmark logo left, and a dark Sign Up pill right. The expandable help/navigation panel uses a single-column list of oversized coral links — no grids, no cards, just typography at scale doing the structural work.

## Similar Brands

- **Starling Bank** — Same UK challenger-bank aesthetic — light off-white canvas, minimal elevation, single bold accent color (Starling uses teal, Monzo uses coral) and generous rounded corners on all containers.
- **Revolut** — Flat light surfaces with a single saturated brand color, oversized pill buttons, and a reliance on custom sans-serif typography at heavy display weights.
- **Klarna** — Light canvas, pink/coral as the sole chromatic accent, oversized rounded containers (similar 64px+ radii), and a warm approachable typographic voice aimed at consumer finance.
- **N26** — Minimal fintech layout with generous whitespace, large display headlines, and a brand that trusts one accent color and typographic weight to create hierarchy without shadows or gradients.
