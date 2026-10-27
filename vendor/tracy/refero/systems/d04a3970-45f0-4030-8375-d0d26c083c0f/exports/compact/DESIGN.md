# ALSO — Style Reference
> Bicycle zine on cream paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ALSO reads as a confident, editorial product showcase — a bicycle zine reimagined for the web rather than a conventional e-commerce interface. A warm cream canvas (#fcf7fa) carries every surface while a single electric violet (#ac74fc) does the work of an entire color system, appearing on links, borders, highlights, and the dominant CTA fill. Type is whisper-tight: ABCCameraPlainVariable pushes negative tracking harder as size grows and line-heights collapse to 0.93 at display, making even the 60px headline feel architectural rather than shouty. Uppercase mono labels (SerialC-Heavy) with positive tracking act as eyebrows, button text, and section markers — the only place the type system opens up. Pill buttons (9999px) sit on hard 2px violet offset shadows with zero blur, reading as stickers pressed onto paper rather than soft UI elevation. Full-bleed violet sections flip the canvas to accent mode without changing typography, spacing logic, or component rules — the same buttons, same shadows, same rhythm, just inverted.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#fcf7fa` | Page canvas, soft section background — warm off-white with a barely-there pink cast, never pure white |
| Pure Card | `#ffffff` | Card surfaces, elevated panels, button text on violet fills |
| Ash Mist | `#f1f1f1` | Tertiary surface, muted dividers, subtle background washes |
| Carbon Black | `#000000` | Primary text, default borders, icon strokes — the structural ink of the system |
| Graphite Input | `#212121` | Input field borders, secondary dark surfaces |
| Obsidian Pill | `#1a1a1a` | Dark CTA fill — the secondary action button (e.g. Reserve), pairs with white text and violet shadow |
| Electric Violet | `#ac74fc` | Primary accent — link borders, active states, icon highlights, section accent borders. The brand's signal color |
| Lilac Pill | `#c181ff` | Primary CTA button fill — the dominant call-to-action, sits on violet hard shadow with black text |
| Deep Plum | `#381b5e` | Dark violet text variant, deep accent borders, section-level emphasis when Electric Violet feels too bright |
| Shadow Plum | `#48316a` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Acid Lime | `#b1ff8f` | Sparingly used highlight wash or accent surface for urgency moments (limited drops, reservation states) |
| Signal Blue | `#1276a9` | Outlined action border — secondary ghost button or informational outline accent |

## Typography

### ABCCameraPlainVariable — Primary UI and display typeface — handles body, headings, navigation, and product copy
- **Substitute:** Inter (free) or Söhne (paid) — a neo-grotesque with mechanical proportions; the system depends on aggressive negative tracking and tight line-heights that most grotesques can be pushed into
- **Weights:** 400
- **Sizes:** 12px, 16px, 20px, 24px, 32px, 44px, 60px
- **Line height:** 0.93–1.50
- **Letter spacing:** -0.05em at 12px → -0.016em at 44px, positive 0.05em only for the all-caps display eyebrow

### SerialC-Heavy — Uppercase eyebrows, button text, section labels, mono-influenced captions
- **Substitute:** Space Grotesk Bold (free) or ABC Diatype Mono Bold (paid) — needs a grotesque with monospace DNA and a heavy weight to carry the industrial uppercase treatment
- **Weights:** 400, 900
- **Sizes:** 14px, 16px, 20px
- **Line height:** 1.20–1.43
- **Letter spacing:** 0.036em–0.063em (always positive, always tracked out)

### SerialC — SerialC — detected in extracted data but not described by AI
- **Weights:** 400, 700
- **Sizes:** 12px, 16px, 20px
- **Line height:** 1, 1.2
- **Letter spacing:** 0.05

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.6px |
| body-sm | — | — | 16px | 1.2 | -0.75px |
| subheading | — | — | 20px | 1.09 | -0.9px |
| heading-sm | — | — | 24px | 1.13 | -1px |
| heading | — | — | 32px | 1.17 | -0.8px |
| heading-lg | — | — | 44px | 1 | -0.7px |
| display | — | — | 60px | 0.93 | 3px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **pills:** 9999px
- **inputs:** 12px
- **buttons:** 9999px
- **feature-cards:** 56px

## Components

### Primary CTA Button (Lilac Pill)
**Role:** The dominant call-to-action — "LEARN MORE", "EXPLORE", primary product actions

Pill radius 9999px, fill #c181ff, text #000000 in SerialC-Heavy 900 uppercase at 14px with 0.05em tracking, padding 20px 40px (or 12px 20px for compact). Sits on a 2px solid Shadow Plum hard shadow (#48316a) with no blur. No border, no hover lift — the shadow is the depth.

### Dark CTA Button (Obsidian Pill)
**Role:** Secondary high-emphasis action — "RESERVE NOW" top banner button

Pill radius 9999px, fill #1a1a1a, text #ffffff in SerialC-Heavy 900 uppercase at 14px, padding 20px 40px. Same 2px Shadow Plum hard shadow as primary CTA. Pairs black-on-white with violet shadow to keep brand cohesion.

### Green CTA Button (Acid Lime)
**Role:** Scarce/limited state CTA — reservation confirmations, low-stock urgency

Pill radius 9999px, fill #b1ff8f, text #000000 in SerialC-Heavy 900 uppercase, padding 20px 40px. Same 2px Shadow Plum hard shadow. Used sparingly — its presence signals urgency or availability windows.

### Ghost Navigation Link
**Role:** Top-bar nav items (BIKE, QUAD, HELMET, GEAR, COMPANY)

Text-only in ABCCameraPlainVariable 400 at 16px, color #000000, no underline. Active state: Electric Violet (#ac74fc) color or 1px bottom border in violet. No background, no padding — sits in the navigation flow like a magazine TOC.

### Section Eyebrow Label
**Role:** Uppercase section markers — "WHEN YOU RIDE ON ALSO, YOU SEE, FEEL, AND NOTICE THINGS"

SerialC-Heavy 400 uppercase at 14px, tracking 0.063em, color #000000, centered or left-aligned. Functions as a typographic divider between sections — the most reliable signal that a new content block is beginning.

### Product Card (Hero Showcase)
**Role:** Large illustrated/photographic product cards in the grid — bikes, quads, helmets, riders

Radius 0 (sharp corners), no border, no shadow — the card IS the image. Image fills the entire card on a #fcf7fa canvas (isolated cutout). A small counter label in SerialC-Heavy (e.g. "1,043") sits at top-left in 14px black. Cards are large (roughly 280–340px wide), arranged in a horizontal flex/grid that can extend past the viewport edge.

### Feature Card (Three-Column Grid)
**Role:** Editorial cards in the "SEE, FEEL, NOTICE" section — TM-B, Alpha Wave, Our Company

Radius 12px, full-bleed photographic background (no border, no shadow). Title overlay bottom-left in ABCCameraPlainVariable 32px black (-0.8px tracking). A compact pill CTA ("EXPLORE") in Lilac Pill style sits at bottom-left below the title. The middle card (Alpha Wave) flips to a full violet (#ac74fc) fill with white product photography — same card structure, inverted palette.

### Story Card (Purple Section)
**Role:** Editorial story cards in the Stories carousel — "Join ALSO at the Sea Otter Classic 2026"

Radius 0, no border, no shadow. Full Electric Violet (#ac74fc) background as the card canvas itself (no card-on-card layering — the card IS the section). Title in ABCCameraPlainVariable 20–24px black at top-left. Date in SerialC-Heavy 14px uppercase tracked at top-left below title. Image fills the bottom 50% of the card, sharp corners, no rounding.

### Pagination Control
**Role:** Carousel navigation — "01/03" counter with prev/next circle buttons

Counter "01/03" in SerialC-Heavy 14px uppercase at right of section header. Prev/next: 32px circle buttons with 1px #000000 border, Electric Violet arrow icon, no fill. No shadow, no hover fill change.

### Input Field
**Role:** Form inputs (email, address, reservation details)

Radius 12px, 1px solid #212121 border, no fill (transparent over canvas), padding 12px 16px. Text in ABCCameraPlainVariable 16px black. Placeholder in #212121 at 50% opacity. Focus state: border becomes Electric Violet (#ac74fc), no glow ring, no shadow — the border color change is the focus signal.

### Top Announcement Bar
**Role:** Site-wide reservation banner — "RESERVE NOW TO RIDE SOONER"

Full-bleed strip, Electric Violet (#ac74fc) or #b1ff8f fill (status-dependent), centered text in SerialC-Heavy 14px uppercase with 0.05em tracking, black text. No padding beyond a tight 10–12px vertical. Sits above the main navigation as a fixed utility rail.

### Logo Wordmark
**Role:** Brand mark — "ALSO." with period

ABCCameraPlainVariable 400 at 24px, black, letter-spacing 0. The trailing period is part of the wordmark — not punctuation, not a typo. Sits top-left of the navigation bar.

### Rider Counter Tag
**Role:** Small numerical labels next to product cutouts — "1,043", "2,803", "2,041"

SerialC-Heavy 400 at 14px, black, with comma thousands separator. Functions as a stat annotation — how many riders, how many rides, a tactile product-counter feel. Always paired with a rider/product cutout.

### Chat Bubble (Bottom-Right)
**Role:** Persistent customer support / reservation concierge entry point

48px circle, Electric Violet (#ac74fc) fill, white chat icon, 1px #000000 border, no shadow. Fixed bottom-right, 24px margin from viewport edge. Sits over both cream and violet sections without color adjustment — the violet fill works on both.

## Do's and Don'ts

### Do
- Set all buttons and tags to 9999px radius — the pill is non-negotiable across every variant (primary, dark, green, ghost).
- Use the single Shadow Plum (#48316a) 2px solid hard shadow on every elevated element — never use blur, never stack shadows, never change the offset.
- Use Electric Violet (#ac74fc) for links, active states, icon highlights, and section borders — it is the signal color and should appear in functional roles, not decoration.
- Set SerialC-Heavy labels in uppercase with positive tracking (0.036–0.063em) — never use it in mixed case or tight tracking.
- Push ABCCameraPlainVariable line-heights tighter as size grows: 1.5 at body, 1.0 at heading-lg, 0.93 at display — the system is defined by compression at scale.
- Maintain 8px base unit spacing: 16px element gap, 24px card padding, 80px section gap — never break to a 4px or 12px base.
- When a section flips to Electric Violet (#ac74fc) background, keep the same component structure, shadows, and type system — only the canvas color changes.

### Don't
- Never use soft drop shadows with blur — the 2px solid hard shadow is the only shadow in the system.
- Never use Pure White (#ffffff) as page canvas — always start from Cream Paper (#fcf7fa); white is reserved for cards and elevated surfaces.
- Never set ABCCameraPlainVariable with positive letter-spacing on body or heading text — the system compresses at scale, it does not expand.
- Never use rounded corners on product images, story cards, or hero photography — these are sharp-edged; only buttons, inputs, and feature cards get radius.
- Never add a second chromatic accent — Electric Violet is the system; Acid Lime and Signal Blue are rare utility colors for specific states only.
- Never use a different shadow color — Shadow Plum (#48316a) stays constant even on dark or green buttons, keeping the brand cohesive across all CTA variants.
- Never set SerialC-Heavy in lowercase or sentence case — it is an uppercase-only typeface in this system; using it otherwise breaks the typographic rhythm.

## Elevation

- **Primary CTA (Lilac Pill):** `rgb(72, 49, 106) 0px 2px 0px 0px`
- **Dark CTA (Obsidian Pill):** `rgb(72, 49, 106) 0px 2px 0px 0px`
- **Green CTA (Acid Lime):** `rgb(72, 49, 106) 0px 2px 0px 0px`

## Surfaces

- **Cream Paper** (`#fcf7fa`) — Base page canvas — every section starts here unless deliberately flipped to violet
- **Pure Card** (`#ffffff`) — Product cards, story cards, elevated content blocks sitting on the cream canvas
- **Ash Mist** (`#f1f1f1`) — Tertiary wash for muted sections, subtle background variation within cream zones
- **Electric Violet** (`#ac74fc`) — Full-bleed accent canvas for Stories / editorial sections — inverted mode without changing component logic

## Imagery

The visual system is product-photography-dominant with a strong cutout/isolated treatment. Riders on bikes, quads, and helmets are photographed against pure white or pure cream, then placed on the canvas as full-bleed cutouts with no shadows, no borders, no context — the object is the hero, not the environment. Treatment is high-key, bright, slightly desaturated to keep focus on form. Lifestyle photography appears in feature cards and story cards with environmental context (San Francisco bridge, trail riding, urban commuting), but always shot in bright daylight with no dark/moody moments. The hero grid showcases the cutouts as a horizontal procession of riders — almost like a parade, each annotated with a small numerical counter. There is no 3D rendering, no illustration, no abstract graphics — the brand trusts photography to carry the visual weight, and the system earns its personality from the typographic and color treatment around those photos rather than from the imagery itself.

## Layout

The page model is centered max-width (~1200px) with content blocks that can extend to the viewport edges when needed for image grids. The top bar is a simple horizontal nav: logo left, nav items centered, utility icon right — no sticky behavior, no mega-menu, no sidebar. The hero opens with a horizontal procession of rider cutouts that can extend past the container, then drops into a centered headline ("One machine for every being.") with a single CTA below. Sections are stacked vertically with 80px gaps and no visible dividers — flow is seamless, separated only by the typographic eyebrow labels. Feature sections use a 3-column equal grid. The Stories section flips the entire viewport to Electric Violet and uses a 3-column card grid with a pagination control at top-right. Navigation between sections is purely vertical scrolling — no tabs, no anchors, no carousels except in the Stories section. Density is spacious: most sections breathe, with the product grid being the densest moment. Footer is minimal — no multi-column sitemap, just the wordmark and a few links in a single row.

## Similar Brands

- **Aimé Leon Dore** — Same editorial product-catalog-as-zine approach — warm off-white canvas, large centered headlines, uppercase tracked-out eyebrow labels, and isolated product photography with no environment
- **Aesop** — Identical warm cream canvas, restraint with a single accent color, tight grotesque type, and editorial section rhythms that trust whitespace over decoration
- **Glossier** — Cream background, product-as-hero photography on isolated cutouts, playful uppercase labels, and the same 'friendly editorial' tone that treats commerce as a magazine
- **Cowboy** — Direct e-bike category neighbor with a similarly playful product-celebration layout — centered headline hero, horizontal procession of bike cutouts, pill buttons with hard offset shadows
- **VanMoof** — Fellow e-bike brand with a near-identical product grid structure, full-bleed isolated product photography, uppercase mono-style labels for specs and counters, and pill-shaped CTAs
