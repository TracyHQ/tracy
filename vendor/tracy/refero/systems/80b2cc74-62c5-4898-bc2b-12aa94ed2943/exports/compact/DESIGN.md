# Design Full-Time — Style Reference
> black-box cinema with a single warm spotlight

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Design Full-Time runs a black-box cinema: pure #000000 canvas, white type, and one concentrated warm gradient (amber → ember → red) reserved for conversion surfaces and savings moments. The page is almost entirely achromatic — video thumbnails, course metadata, and navigation live in monochrome gray scale, letting the single gradient banner function as a stage spotlight. Components are flat and rectangular with hairline borders, minimal rounding, and zero shadows; hierarchy comes from type weight, whitespace, and the rare chromatic punctuation. Inter at 700/800 carries the brand's confident, instructor-led voice while body text stays at 400/600 in muted grays.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure Black | `#000000` | Page canvas, dominant background — absorbs everything so content and the warm gradient banner can command attention |
| Surface Black | `#111111` | Card backgrounds, elevated panels, filled neutral button surface — one step off the canvas creates depth without gray noise |
| Lifted Charcoal | `#252525` | Mid-elevation surfaces, hover states, and subtle card depth — bridges the page black and border tones |
| Border Gray | `#343434` | Hairline dividers, card outlines, table rules — defines structural edges in a flat world |
| Edge Gray | `#4d4d4d` | Heavier borders on outlined buttons and grouped control frames |
| Muted Text | `#888888` | Secondary body text, metadata, timestamps, supporting copy |
| Helper Gray | `#a0a0a0` | Body text borders and subtle helper text where full white feels too loud |
| Pure White | `#ffffff` | Primary headings, nav text, button text, logo fill — the only color allowed to compete with the gradient banner |
| Amber Glow | `linear-gradient(90deg, #ffc84 0%, #fa3a19 100%)` | Promotional banner start — the cool-yellow origin of the warm spotlight gradient (also gradient) |
| Ember Orange | `linear-gradient(90deg, #ff8a00 0%, #fa3a19 100%)` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Crimson Heat | `linear-gradient(90deg, #ff8a00 0%, #fa3a19 100%)` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### Inter — Sole typeface. Inter 700/800 for the wordmark and section headlines (confident, instructor-led); 600 for video titles and nav labels; 400 for body copy and metadata. No display-size font in the system — the brand keeps type compact (capped at 24px) and lets the gradient banner and video thumbnails carry visual weight instead.
- **Substitute:** Inter (Google Fonts) or system-ui as fallback
- **Weights:** 400, 600, 700, 800
- **Sizes:** 15, 16, 18, 20, 24
- **Line height:** 1.00, 1.33, 1.40, 1.50, 1.56

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 21 | — |
| body-lg | — | — | 18px | 28 | — |
| subheading | — | — | 20px | 28 | — |
| heading | — | — | 24px | 32 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 6px
- **badges:** 4px
- **banner:** 4px
- **buttons:** 6px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Full-width #000000 bar with 16px vertical padding, 32px horizontal padding. Left-aligned nav links in Inter 600/16px white, right-aligned 'Student Login' outlined button. 1px #343434 bottom border separates from page canvas.

### Brand Wordmark
**Role:** Logo / identity

Centered 'DESIGN FULL-TIME' in white, Inter 800, set in two stacked lines with a slight arc/swoosh framing — only chromatic-free brand mark, the gradient lives elsewhere.

### Promo Banner (Gradient Strip)
**Role:** Conversion / offer highlight

Full-width 64-72px tall bar with warm gradient wash (amber 12% opacity → red 10% opacity) on a #000000 base. 1px subtle border, 4px radius. Contains three zones: left 'Save 60%' in gradient text (amber → crimson), center 'Get all 5 courses for $399!' in white, right gradient-filled CTA button. This is the ONLY component allowed to introduce warm color.

### Promo Gradient Button
**Role:** Primary conversion CTA on banner

Filled button with linear-gradient(90deg, #ff8a00, #fa3a19) background, white Inter 700 text, 6px radius, 8px 16px padding. Sits right-aligned inside the promo banner.

### Outlined Nav Button
**Role:** Secondary account action

Transparent background, 1px #343434 border, 6px radius, 8px 16px padding, white Inter 600/15px label. Used for 'Student Login' and similar account-level actions.

### Video Lesson Card
**Role:** Course / free lesson entry point

#111111 background, 1px #343434 border, 6px radius, 16px internal padding. Composed of 16:9 video thumbnail on top, then 8px gap to title (Inter 700/16px white) and 4px gap to category label (Inter 400/15px #a0a0a0). Clickable as a unit.

### Video Duration Badge
**Role:** Thumbnail metadata overlay

Absolute-positioned bottom-right of video thumbnail. #000000 80% opacity background, 4px radius, 4px 8px padding, Inter 600/13px white text. Reports runtime (e.g., '21:35', '1:16').

### Section Heading
**Role:** Section title

Left-aligned Inter 700/24px white, 16px bottom margin, 0 letter-spacing. Used for 'Try these FREE video lessons' style headers. No accent color, no underline, no decoration — type weight alone does the work.

### Video Title
**Role:** Lesson card primary label

Inter 700/16px white, 1.4 line-height, max two lines. Sets the card's voice.

### Category Label
**Role:** Lesson card metadata

Inter 400/15px #a0a0a0, single line, below video title. Identifies the source course (e.g., 'Standout Web Designer', 'That Portfolio Course').

## Do's and Don'ts

### Do
- Use #000000 as the page canvas and keep all non-promo content achromatic — let the warm gradient banner be the only chromatic event on the page.
- Apply the linear-gradient(90deg, #ff8a00, #fa3a19) exclusively to the promo CTA button; never use it for nav, icons, or course cards.
- Use Inter 700/800 for all headings and Inter 400/600 for body — never mix in a second typeface family.
- Define card edges with 1px #343434 borders on #111111 surfaces; skip shadows and rely on flat color steps for hierarchy.
- Set video card padding to 16px and maintain an 8px gap between thumbnail, title, and category label inside each card.
- Keep the type scale capped at 24px — let video thumbnails and the gradient banner carry visual scale instead of oversized headlines.
- Use #ffffff for interactive text and headings, #a0a0a0 / #888888 for metadata and secondary copy.

### Don't
- Don't introduce any blue, green, or purple accent — the brand is a two-tone system (monochrome + warm gradient) and extra hues will dilute the spotlight effect.
- Don't apply the warm gradient to body text, icons, or borders — reserve it for the promo banner surface and its CTA button only.
- Don't use shadows or heavy rounded corners (>=12px); the system is intentionally flat with 4-6px radii and hairline borders.
- Don't set headings above 24px; oversized display type breaks the compact, instructor-led feel.
- Don't use #111111 as a button background for primary actions — that role belongs exclusively to the warm gradient CTA.
- Don't introduce a second typeface, custom display face, or serif — Inter alone carries the brand at every weight.
- Don't place the gradient banner inside cards or repeated lists; it must remain a singular full-width conversion event.

## Surfaces

- **Canvas** (`#000000`) — Page-wide background; absorbs visual noise so video thumbnails and the gradient banner read first
- **Card** (`#111111`) — Video lesson cards and grouped content blocks; one step off canvas to define edges without gray noise
- **Elevated** (`#252525`) — Subtle elevation for hover states, tooltips, or higher-tier promotional panels

## Imagery

Imagery is dominated by 16:9 video thumbnails showing the instructor (bearded, beanie-wearing) in his studio with board-of-design and tools visible behind him. Thumbnails are treated as rectangular crops with no rounded corners or color treatment — they read as direct screencaps. A few thumbnails use a slide/UI overlay on the left half (e.g., a 'modern way to build for the web' slide) composited against the instructor on the right. No illustration, no abstract graphics, no photography beyond the instructor videos. Icon usage is minimal (chevrons in nav dropdowns). The promo banner introduces the only non-photographic color via gradient. Visual density is medium: the page mixes 4-column thumbnail rows with text-led sections, so thumbnails occupy roughly 40-50% of above-the-fold visual real estate.

## Layout

Full-bleed dark layout with no decorative side margins — content is centered within a 1200px max-width container. The hero is a centered stack: nav bar → centered logo → single subtitle line → full-width promo banner → section heading → 4-column thumbnail row. Sections stack vertically with 48px gaps and no alternating light/dark bands (the page is uniformly #000000). The video grid is a 4-column equal-width row on desktop, collapsing to 2-1 columns on smaller widths. Content arrangement is strictly left-aligned within cards and sections; only the logo and subtitle are center-aligned. Navigation is a flat top bar with a single dropdown (Courses → Jobs and Events / Coming Soon) and a right-aligned login button. No sidebar, no sticky header, no mega-menu.

## Similar Brands

- **Maven** — Same dark monochrome course-platform canvas with instructor-led video thumbnails and minimal type-driven hierarchy
- **Refind** — Black-canvas content site that lets a single warm accent color or gradient own the only chromatic moment on the page
- **Levels.fyi** — Pure black background with hairline gray borders, flat rectangular cards, and zero decorative shadow — content-first density
- **Design Buddies** — Design-education brand using a black-canvas layout with bold centered wordmark and conversion-focused promo strips
