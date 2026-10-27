# Geniestudio — Style Reference
> soft daylight notebook — the kind with generous margins and a single bold pen stroke

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Genie uses an airy, daylight-studio language: a pale sky-blue canvas (#ebf5ff) hosts an almost-monochrome interface where near-black buttons provide the only dense visual weight. Display type runs enormous — up to 148px in Aeonik — with a fixed weight 500 that feels engraved rather than shouted, and tracking pulled tight (-0.02em) so headlines read as confident typography, not decorative type. Rounded shapes dominate: 32px cards, 9999px pills, and soft pastel washes (lavender, mint, peach, sky) become the only places color appears beyond a single vivid blue accent and the dark charcoal CTA fill. Whimsical 3D-rendered illustrations — clouds, crayons, smiling objects, floating envelopes — float in the whitespace and carry the brand's personality; the UI itself stays disciplined, almost architectural in its restraint.

## Colors

| Name | Value | Role |
|------|-------|------|
| Sky Tint | `#ebf5ff` | Page canvas and soft background washes — the defining ambient color that sets the daylight atmosphere |
| Paper White | `#ffffff` | Pure card surfaces, button text, and icon fills on dark controls |
| Bone White | `#fafdff` | Primary card surface and elevated panel backgrounds — a barely-blue white that feels paper-like |
| Mist Gray | `#f6f7f8` | Subtle secondary surfaces and section dividers |
| Ink | `#0a0d12` | All heading text, primary display type, and deep emphasis copy |
| Charcoal | `#181d27` | Filled button backgrounds and the dense visual anchor against the airy canvas |
| Graphite | `#535862` | Secondary body text and supporting copy |
| Fog | `#93979f` | Muted helper text, FAQ answers, and low-emphasis body |
| Slate Shadow | `#3b3d41` | Dark shadow tone behind buttons and elevated controls |
| Iris Blue | `linear-gradient(rgb(71, 157, 255) 11.43%, rgb(0, 105, 224) 78.2%)` | Brand accent — chromatic borders, outline strokes, and the single vivid punctuation color in the otherwise pale system; Brand gradient used for decorative borders and accent fills |
| Sky Blue | `#0099ff` | Inline highlight text and emphasis spans within body copy |
| Lavender Wash | `#f1e6ff` | Pastel card surface for feature tiles and category blocks |
| Mint Wash | `#d3f6e3` | Pastel card surface for feature tiles and category blocks |
| Powder Blue | `#cce7ff` | Gray wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Solar Gradient | `linear-gradient(rgb(255, 249, 224) 0%, rgb(255, 236, 163) 100%)` | Warm gradient stop for decorative feature highlights |
| Violet Gradient | `linear-gradient(rgb(244, 235, 255) 0%, rgb(228, 204, 255) 100%)` | Decorative gradient wash for feature category blocks |
| Aqua Gradient | `linear-gradient(rgb(229, 246, 255) 0%, rgb(194, 233, 255) 100%)` | Decorative gradient wash for feature category blocks |
| Peach Gradient | `linear-gradient(rgb(255, 242, 235) 0%, rgb(255, 209, 184) 100%)` | Decorative gradient wash for feature category blocks |

## Typography

### Aeonik — Display and heading face for all editorial moments — 148px hero headlines, 72px section openers, 48px card titles, 32px subheadings. Fixed at weight 500; the brand never goes bolder. Tracking pulls tight at -0.02em which gives the geometric forms a sculpted, almost engraved quality at large sizes. Substitute: 'Söhne', 'Inter', or 'General Sans'.
- **Substitute:** Söhne or Inter
- **Weights:** 500
- **Sizes:** 20px, 24px, 32px, 48px, 72px, 148px
- **Line height:** 1.05–1.25
- **Letter spacing:** -0.02em at 72px+ ; tight tracking scales with size
- **OpenType features:** `"case"`

### Geist — UI and body face for everything below the headline tier — body copy, buttons, labels, captions, card descriptions, nav links. Weight 500 is the workhorse; 600 only for tiny 10px micro-labels. The 18px / 20px sizes with -0.01em tracking carry the interface's conversational voice. Substitute: 'Geist', 'Inter', or 'Söhne'.
- **Substitute:** Geist or Inter
- **Weights:** 500, 600
- **Sizes:** 10px, 12px, 14px, 16px, 18px, 20px
- **Line height:** 1.14–1.50
- **Letter spacing:** -0.01em across all sizes
- **OpenType features:** `"case"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | -0.1px |
| body-sm | — | — | 14px | 1.14 | -0.14px |
| body | — | — | 16px | 1.35 | 0px |
| body-lg | — | — | 18px | 1.33 | -0.18px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 24px | 1.17 | -0.48px |
| heading | — | — | 32px | 1.25 | -0.64px |
| heading-lg | — | — | 48px | 1.17 | -0.96px |
| display | — | — | 72px | 1.11 | -1.44px |
| hero | — | — | 148px | 1.05 | -2.96px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 24px

### Border Radius

- **tags:** 9999px
- **cards:** 32px
- **images:** 24px
- **inputs:** 16px
- **buttons:** 32px
- **cardsSmall:** 16px
- **buttonsPill:** 9999px

## Components

### Primary CTA Button
**Role:** Filled dark pill — the only dense visual element on the page

Background #181d27, white text (#ffffff), border-radius 32px (or 9999px for full pill), padding 12px 32px, font Geist 16px weight 500, letter-spacing -0.01em. Tight dark shadow ring (0 1px 2px rgba(10,13,18,0.8), 0 0 0 1px #0a0d12) gives it a pressed, pressed-into-page quality. Used for 'Sign up' and the single hero action.

### Secondary CTA Button
**Role:** Smaller filled pill for inline actions

Background #181d27, white text, border-radius 16px, padding 8px 16px, Geist 14px weight 500. Compact variant of the primary.

### Ghost Nav Link
**Role:** Header navigation text

No background, Geist 16px weight 500, color inherits from #0a0d12 or #535862, no underline, no hover background fill. Sits on the canvas as plain typography.

### Feature Card (32px radius)
**Role:** Primary content card — FAQ, testimonial, feature block

Background #fafdff (bone white), border-radius 32px, padding 40px on all sides, no visible border, no shadow. The card relies on the color shift from canvas (#ebf5ff) to surface (#fafdff) and the 32px radius to define itself.

### Pastel Category Tile
**Role:** Colored feature block — style library, category cards

Solid pastel background (#f1e6ff lavender, #d3f6e3 mint, #cce7ff powder blue, #fff2be solar), border-radius 32px, generous padding, no border. Each tile is a flat wash of color — no gradients on the tile itself, though some use gradient fills (#c2e9ff, #e4ccff, #ffd1b8).

### Testimonial Card
**Role:** Masonry-style horizontal card in the social-proof section

Background #fafdff, border-radius 32px, padding 40px, contains a pull-quote at Geist 18px #535862, a divider, then avatar + name (Geist 16px weight 500 #0a0d12) + role (Geist 14px #93979f) and a brand logo on the right. Cards bleed off the edges of the viewport in a continuous horizontal marquee.

### FAQ Accordion Row
**Role:** Expandable question/answer block

Background #fafdff, border-radius 32px, padding 40px. Question in Geist 18-20px weight 500 #0a0d12, answer in Geist 16px #93979f. Animated open/close using grid-template-rows transition at 0.65s ease.

### Pill Tag / Chip
**Role:** Category labels and status indicators

Border-radius 9999px, Geist 12-14px weight 500, padding 4px 12px. Appears in pastel-tinted backgrounds for category labels.

### Marquee Logo Strip
**Role:** Endlessly scrolling brand logo wall

Continuous horizontal marquee animation (no visible container). Logos are monochrome or brand-colored, float in the sky canvas with no card wrapper. Uses linear(0 0%, 0.55 7.5%, ...) timing function for the scroll.

### Hero Gradient Banner
**Role:** Decorative border/frame around hero artwork

Thin border using the iris gradient (linear-gradient(71,157,255 11.43%, 0,105,224 78.2%)) with 3px solid weight and border-radius 90px. The only place a gradient border appears — it frames the hero illustration like a polaroid edge.

### 3D Illustration Asset
**Role:** Whimsical floating objects — clouds, crayons, envelopes, smiley faces, flowers

Rounded, dimensional, pastel-colored 3D renders. They float in the canvas as isolated objects with no background container. Colors come from the pastel palette (#cce7ff, #f1e6ff, #d3f6e3, #ffd1b8) plus a vivid iris blue accent. Sized large and given room to breathe — they are the brand personality, not decoration.

### Section Header
**Role:** Centered display headline + supporting subhead

Aeonik 48-72px weight 500 in #0a0d12, centered, with a Geist 18px subhead in #535862 below. The 148px hero variant is reserved for the first screen. Letter-spacing tightens with size (-0.96px at 48px, -1.44px at 72px, -2.96px at 148px).

## Do's and Don'ts

### Do
- Use weight 500 (not 600 or 700) for all display and heading type — the system is intentionally mid-weight, never bold
- Apply 32px border-radius to all content cards and 9999px to all interactive pills and tags
- Set the page canvas to #ebf5ff and card surfaces to #fafdff — the pale blue-to-bone-white shift is the primary depth mechanism
- Use the dark fill #181d27 for all filled buttons; reserve #0069e0 for accent borders and inline highlight text only
- Pull heading tracking to -0.02em and body tracking to -0.01em; never set type with default or positive letter-spacing
- Let 3D illustrations float in the canvas without cards, borders, or backgrounds — they are the brand voice, not decoration
- Use the iris gradient (71,157,255 → 0,105,224) only for thin 3px accent borders; never as a button fill or large surface

### Don't
- Do not use bold weights (600+) for display headlines — Aeonik 500 is the ceiling
- Do not use 90° sharp corners on cards or buttons — minimum 16px, default 32px, pill 9999px
- Do not place saturated blue (#0069e0) as a button fill — it is an outline/accent color, not a CTA color
- Do not add box-shadows to content cards — depth comes from the canvas/surface color shift, not elevation
- Do not use body-weight black (#000000) for text — use #0a0d12, which has a hint of blue that ties to the canvas
- Do not mix more than two pastel washes in a single section — the pastel palette is for tile variety, not visual noise
- Do not set display type below 48px or use display sizes for body content — the scale has a hard floor for editorial moments

## Elevation

- **Primary Button:** `0 1px 2px rgba(10, 13, 18, 0.8), 0 0 0 1px rgb(10, 13, 18)`
- **Decorative Section Blocks:** `0 14px 20px 4px rgba(4, 69, 144, 0.08)`

## Surfaces

- **Sky Canvas** (`#ebf5ff`) — Page background — the defining pale-blue atmosphere
- **Paper Card** (`#fafdff`) — Primary card and panel surface
- **Pure White** (`#ffffff`) — Modal and elevated overlay surfaces
- **Mist Section** (`#f6f7f8`) — Subtle section banding and secondary surface

## Imagery

The site leans heavily on 3D-rendered illustrations: soft, rounded, dimensional objects in pastel colors (lavender, mint, peach, powder blue) with a single vivid iris-blue accent object per scene. Objects float in the canvas as isolated subjects — a cloud and a crayon here, an envelope and a smiley face there — with no background, no shadow plate, no lifestyle staging. The style is playful, toy-like, and slightly squishy, almost like clay renders. The canvas is the negative space; illustrations are the positive. There is no photography, no product screenshots in the traditional sense, and no abstract graphic patterns. The 3D objects carry all the personality.

## Layout

Max-width 1200px centered with generous side margins. The hero is a centered text+illustration stack: headline at 148px above a single 3D render, with one dark CTA button below — no left/right split, no columns. Sections alternate between centered single-column editorial stacks (headline → subhead → content) and full-bleed horizontal bands (marquee strips, category tile rows). Cards appear in 3-column grids for feature sections and in a continuous horizontal marquee for testimonials. The layout breathes — vertical section gaps run 80-120px, and even within sections the element gaps sit at 24-40px. Navigation is minimal: logo left, two text links center, single filled CTA right, all in a single row. The footer is a wide centered CTA block followed by a 4-column link grid.

## Similar Brands

- **Linear** — Same near-monochrome canvas with a single accent color, oversized display type at weight 500, and pill-shaped dark CTA buttons
- **Framer** — Same playful 3D illustration language floating on a pale tinted canvas, generous spacing, and 32px card radii
- **Vercel** — Same near-black button fill (#181d27 ≈ their dark surfaces) and typographic-first layout where type does the work and decoration stays minimal
- **Pitch** — Same dark filled pill buttons, pale neutral canvas, and confident mid-weight display typography
