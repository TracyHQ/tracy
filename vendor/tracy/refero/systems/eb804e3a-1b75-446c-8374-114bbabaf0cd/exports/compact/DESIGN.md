# Cosmos — Style Reference
> Linen gallery wall with floating polaroids

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Cosmos is a gallery-wrapped canvas for visual discovery: a warm cream background (#f7f5f3) that reads like unprimed linen, black ink typography, and a strict monochrome UI where color only intrudes through user-curated imagery. The product believes in restraint — the chrome is invisible so the images can shout. Type is a single custom serif-influenced face (cosmosOracle) pulled tight with negative tracking, using weight 350 for hero copy to create editorial softness rather than marketing aggression. Surfaces are flat with a single signature radius (16px) repeated across cards, inputs, and video containers. The hero scatters image tiles in a free-form collage that frames centered copy, and the rest of the page settles into a three-column grid of image-led feature cards. There are no gradients, no shadows beyond what the collage cards cast naturally, and no chromatic accents in the interface itself.

## Colors

| Name | Value | Role |
|------|-------|------|
| Linen Canvas | `#f7f5f3` | Page background — warm off-white, never pure #ffffff at the root, gives the interface a paper-like, gallery-wall base |
| Ink Black | `#0d0d0d` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color; Borders, dividers, outlined button strokes — used at low opacity to create subtle structural lines, always Ink Black rather than a separate gray |
| Paper White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Stone | `#6e6a69` | Body text, secondary icons, inactive UI — warm mid-gray for body copy and supporting metadata |
| Pebble | `#9a9796` | Muted helper text, disabled states, tertiary icon strokes — lightest readable gray in the neutral ramp |

## Typography

### cosmosOracle — Single custom face used for everything. Weight 350 is the signature — hero and display copy use this whisper-weight instead of the conventional 700, creating editorial calm. Weight 400 for body, weight 500 reserved for buttons and labels. Negative tracking scales with size: tightest (-0.05em) on the 74px display, opening to normal at 14px. The low line-heights on large sizes (0.80–1.10) hug the baseline tightly so headlines read as deliberate blocks, not airy paragraphs.
- **Substitute:** GT Super, Fraunces, or any high-contrast didone-influenced serif with optical sizing; fall back to 'Georgia' if no serif is available
- **Weights:** 350, 400, 500
- **Sizes:** 14, 15, 16, 18, 24, 26, 33, 38, 58, 66, 74
- **Line height:** 0.80, 1.00, 1.06, 1.08, 1.10, 1.20, 1.25, 1.29, 1.50
- **Letter spacing:** -0.0500em at 74/66/58px, -0.0400em at 38/33px, -0.0200em at 24/26px, -0.0110em at 18/16px, 0 at 14/15px
- **OpenType features:** `Opt for old-style figures and discretionary ligatures if cosmosOracle exposes them; the typeface behaves like a didone-meets-grotesque hybrid`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | -0.18px |
| subheading | — | — | 18px | 1.29 | -0.2px |
| heading-sm | — | — | 24px | 1.2 | -0.48px |
| heading | — | — | 33px | 1.1 | -1.32px |
| heading-lg | — | — | 38px | 1.08 | -1.52px |
| display | — | — | 58px | 1.06 | -2.32px |
| display-xl | — | — | 74px | 0.8 | -3.7px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 24px

### Border Radius

- **cards:** 16px
- **inputs:** 16px
- **buttons:** 16px
- **imageTiles:** 12px
- **videoContainer:** 16px

## Components

### Primary Filled Button
**Role:** Main conversion action (Sign up)

Ink Black (#0d0d0d) fill, Paper White (#ffffff) text, cosmosOracle weight 500, 16px font-size, 16px border-radius, 16px vertical / 24px horizontal padding. Tight, pill-like but squared at the radius. No shadow, no border.

### Secondary Outlined Button
**Role:** Secondary action (Get the app, Login)

Paper White (#ffffff) fill, 1px Ink Black border at ~15% opacity, Ink Black text, 16px radius, 16px/24px padding. Identical sizing to the primary button so they pair as a two-button row.

### Pill Navigation Bar
**Role:** Top-of-page floating navigation

A single horizontal pill containing the logo (8-dot cluster glyph), Explore / Careers links, centered search input, and Login / Sign up. Background is Paper White with subtle border, 9999px radius, hovers just below the top edge of the viewport with no shadow.

### Search Input
**Role:** Global search inside the nav pill

Borderless text input with a leading magnifier icon, placeholder 'Search Cosmos...' in Stone (#6e6a69). Transparent fill so it sits flush inside the nav pill. 16px text, weight 400.

### Floating Image Tile
**Role:** Scattered collage images in the hero

User-content image cropped to ~12px border-radius, floating at slight rotations or in a loose grid around the hero text. No caption, no border, no shadow — the image is the component. Sized 60–140px, positioned absolutely around the centered headline.

### Feature Image Card
**Role:** Three-up feature row showing product capabilities

Large image-first card with a 16px radius. The image fills the card edge-to-edge; below it sits a cosmosOracle weight 400 label at 18px (e.g. 'By color'). No visible border, no shadow, no background color — the image defines the card. Three cards sit in a 3-column grid with 24px gap.

### Video Container
**Role:** Full-bleed film/video embed

A 16px-radius container spanning the page max-width, holding a video poster with a 9-dot loading animation overlaid in white at center. Split text overlay: 'Watch' left-aligned and 'the film' right-aligned at 38px weight 350, with a play triangle between. Small caption 'featuring Odessa Azion' centered near the bottom.

### AI Content Detection Overlay
**Role:** AI-generated image warning card

Paper White surface with 12px radius, ~280px wide, positioned top-right inside a feature card. Title 'AI content' in Ink Black 16px weight 500, body 'Content detected as likely generated by AI' in Stone 14px. Below: three text buttons — 'Show' (Ink Black, 16px radius, white fill), 'Blur' (neutral), 'Hide' (neutral).

### Text Link with Play Icon
**Role:** Inline call-to-action link (Watch our new film)

Inline at 18px weight 400, Ink Black, preceded by a small triangle play icon. No underline by default; subtle color shift on hover. Used for tertiary navigation cues that should not compete with the button row.

### Theme Toggle
**Role:** Light/dark mode switch in the nav

A small icon-only button (sun/moon glyph) at the right edge of the nav pill, before the Login/Sign up cluster. 32×32px hit area, no visible border, 9999px radius on hover background.

### Eyebrow Label
**Role:** Small uppercase section pre-title

cosmosOracle weight 500, 15–16px, tracked at 0em, rendered as 'COSMOS' above the hero headline. Sets the editorial tone: small, all-caps, almost a stamp rather than a label.

### Dot Cluster Logo
**Role:** Brand mark in nav and favicon

Eight small black dots arranged in a 3×3 grid with the center dot removed, reading as a tiny flower or asterisk. Always Ink Black on Linen Canvas, always at ~18px in the nav, larger at marketing contexts.

## Do's and Don'ts

### Do
- Use only Linen Canvas (#f7f7f5f3) as the root background — never pure white at the page level; white is reserved for cards and inputs.
- Apply 16px border-radius to every container, button, and input — this is the single signature radius of the system.
- Set hero and display copy at weight 350 with letter-spacing between -0.04em and -0.05em; do not bold headlines above 400.
- Pair every primary filled button with an outlined secondary at identical padding and radius so they read as a set.
- Let user imagery carry all chromatic content; the UI palette stays at black/white/cream/gray.
- Use 24px gaps between grid cards and 16px padding inside cards as the default content rhythm.
- Position the nav as a single floating pill with 9999px radius at the top of every page.

### Don't
- Do not introduce accent colors (red, blue, green) into interface chrome — color belongs only in user content.
- Do not use weights above 500 in cosmosOracle; the face is not designed for bold display and will feel chunky.
- Do not apply shadows to cards or buttons; the system is deliberately flat and relies on radius and surface contrast.
- Do not set body text larger than 18px or below 14px; cosmosOracle was sized for a tight 14–18px body range.
- Do not mix border-radius values within a single page (avoid 8px or 24px radii) — 16px is the rule, 12px only for image tiles.
- Do not use pure #000000; always #0d0d0d so the black warms against the cream canvas.
- Do not place colored backgrounds behind text; all text sits on Linen Canvas, Paper White, or directly on imagery.

## Elevation

Cosmos is intentionally flat: no drop shadows on cards, buttons, or the navigation pill. Elevation is communicated exclusively through surface color contrast — Linen Canvas (#f7f5f3) at the base, Paper White (#ffffff) for cards and inputs sitting on top. The only depth in the interface comes from the scattered hero image tiles, which read as physical polaroids on the canvas. Resist adding shadows; the flatness is the point.

## Surfaces

- **Linen Canvas** (`#f7f5f3`) — Root page background, the gallery wall
- **Paper White** (`#ffffff`) — Cards, inputs, outlined buttons — the only elevated surface in the system

## Imagery

Imagery is the product, not decoration. The hero scatters small cropped image tiles (60–140px) at 12px radius around the centered text like polaroids pinned to a gallery wall. The three feature cards lead with edge-to-edge photography and collage — vivid red florals, warm beige bag silhouettes, and moody purple portraiture — each carrying the only chromatic color in the interface. The video container uses a cinematic still (green-tiled interior, soft focus) with a 9-dot loading animation overlaid in white. There are no illustrations, no abstract graphics, no 3D renders. Icons are minimal stroked linework in Ink Black, used sparingly (magnifier, play triangle, sun/moon, social glyphs). Photography style across the collage feels curated and editorial: high contrast, varied subjects, no unified color treatment — the variety is the point.

## Layout

Page is centered with a ~1280px max-width content well, though the hero uses full-bleed positioning for the scattered image tiles. The hero is a centered text stack: eyebrow ('COSMOS') → 74px headline → two-button row, all vertically and horizontally centered while image tiles float around the periphery at varied rotations. Below the hero, the video container spans the full content width at 16px radius. The feature row is a strict 3-column grid with 24px gap, each cell leading with an image and trailing with a 18px label. Navigation is a single floating pill bar that hovers near the top of the viewport on every page, containing logo, two text links, centered search, theme toggle, and Login/Sign up — it never duplicates into a secondary bar. Vertical rhythm between sections is generous (80px+), giving each band room to breathe like separate gallery rooms.

## Similar Brands

- **Are.na** — Same warm cream canvas, monochrome UI that stays out of the way of user-curated imagery, and an editorial single-typeface approach to a visual bookmarking product
- **Pinterest** — Image-led grid systems and the philosophy that color belongs to user content, not the interface chrome
- **VSCO** — Gallery-wall aesthetic with floating image tiles, minimal text UI, and a single warm neutral background that frames rather than competes with photography
- **Cargo (cargo.site)** — Portfolio-first visual discovery tools that use restrained typography and generous whitespace to let creator imagery dominate
