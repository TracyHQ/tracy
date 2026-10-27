# LottieFiles — Style Reference
> Bright motion studio with teal accent

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

LottieFiles operates as a playful motion marketplace: a near-white canvas with confident near-black headlines, soft warm-gray surfaces, and a single signature teal that marks every primary action. Typography pairs Inter for utility and DM Sans for display, with aggressive negative letter-spacing at large sizes that pulls characters into tight, poster-like compositions. The system is built on generous rounded corners (16px–24px dominate) with minimal elevation, letting animated content and illustrations carry visual weight rather than chrome or shadows. Color is used sparingly — teal for action, near-black for text, warm gray for surfaces, and a curated handful of pastel cards (yellow, mint, blush) as categorical accents. The result feels like a well-organized creative studio: quiet structural chrome that recedes so motion can lead.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lottie Teal | `#019d91` | Teal action color for filled buttons, selected navigation states, and focused conversion moments. |
| Ink | `#09090b` | Primary text, headings, dark card surfaces, footer background, icon strokes — near-black with a barely-perceptible cool cast |
| Charcoal | `#18181b` | Dark card backgrounds, elevated dark surfaces, strong icon strokes, secondary dark UI blocks |
| Slate 700 | `#27272a` | Dark muted surfaces and inverse muted backgrounds |
| Steel | `#71717b` | Muted body text, secondary copy, icon fills, helper labels — sits between the primary ink and lighter grays |
| Fog | `#9f9fa9` | Subtle text, tertiary metadata, low-priority descriptions |
| Cloud | `#e4e4e7` | Hairline borders, input outlines, subtle dividers between UI sections |
| Mist | `#f2f2f3` | Largest-volume border color across the UI; subtle separators, input borders, form outlines |
| Warm Gray | `#f4f4f5` | Page canvas and soft card surfaces — the dominant background tone beneath white |
| Paper | `#ffffff` | Pure white surfaces: raised cards, button fills, content containers on top of warm-gray canvas |
| Sunshine | `#f0b100` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Mint Wash | `#b7ffe7` | Soft decorative fill in illustration/illustration-adjacent graphics |
| Mint Pop | `#61f7cf` | Bright decorative fill used in hero illustration characters and supporting graphics |
| Ember | `#ff6900` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |

## Typography

### DM Sans — Display and heading family. Used for hero headlines (48–96px, weight 500), section headings (24–32px, weight 500), and large body (20px, weight 400). Letter-spacing tightens aggressively at large sizes — -0.0500em at 96px pulls characters into a compressed, poster-like composition that feels editorial rather than utilitarian. The medium weight (500) is the headline default, avoiding the heavy 700-800 convention used by most SaaS sites.
- **Substitute:** Sora, Bricolage Grotesque, or Plus Jakarta Sans
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 18, 20, 24, 32, 48, 64, 96
- **Line height:** 1.04–1.56
- **Letter spacing:** -0.0500em at 96px, -0.0400em at 64px/48px, -0.0300em at 32px, -0.0100em at 24px and below

### Inter — Utility and body family. Owns all body copy (16px), navigation (14px medium), buttons (14px medium), small labels (10–12px medium), and supporting icons. Consistent -0.0100em letter-spacing keeps it visually aligned to DM Sans at smaller sizes. Two-weight discipline (regular and medium only) keeps the interface feeling light and fast.
- **Substitute:** system-ui, -apple-system, or Manrope
- **Weights:** 400, 500
- **Sizes:** 10, 12, 14, 16, 18, 24, 32
- **Line height:** 1.10–1.71
- **Letter spacing:** -0.0100em across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.12px |
| body-sm | — | — | 14px | 1.43 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 20px | 1.4 | -0.2px |
| subheading | — | — | 24px | 1.12 | -0.24px |
| heading-sm | — | — | 32px | 1.2 | -0.96px |
| heading | — | — | 48px | 1.15 | -1.92px |
| heading-lg | — | — | 64px | 1.15 | -2.56px |
| display | — | — | 96px | 1.04 | -4.8px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 16px
- **inputs:** 8px
- **buttons:** 8px
- **hero-panels:** 48px
- **feature-cards:** 24px

## Components

### Primary Teal Button
**Role:** Main call-to-action — sign-up, start, explore

Fill #019d91, white text (#ffffff), Inter 14px weight 500, padding 8px 16px, border-radius 8px, no border. Used for 'Get started for free', 'Sign up', 'Explore All Animations'.

### Outline Button
**Role:** Secondary action — contact, learn more

Fill #ffffff, text #09090b, 1px border #e4e4e7, Inter 14px weight 500, padding 8px 16px, border-radius 8px. Used for 'Get in touch', 'Log in'.

### Ghost Button
**Role:** Tertiary or nav-adjacent action

Transparent fill, text inherits context (often #09090b or #71717b), no border, border-radius 0–6px, padding 4px 24px. Used for inline text-style actions and toolbar items.

### Search Field
**Role:** Animation search input in header and hero

White fill, 1px border #e4e4e7, border-radius 6–8px, padding 8px 16px, Inter 14px with ⌘K hint. Icon button on the right edge for submit.

### Language Toggle
**Role:** Locale selector in header

Pill-shaped control with transparent fill, hairline border, Inter 14px, and a chevron. 9999px radius or 6px depending on context.

### Feature Tile
**Role:** Compact 4-column feature highlight with icon

Off-white tile (#f4f4f5 or white), 16px radius, 24px padding, small colored icon block (yellow/pink/teal/dark-blue square) + bold label + muted helper line. No shadow.

### Brand Case-Study Card
**Role:** Featured customer animation showcase

Full-bleed art card at 16–24px radius, contains a brand's creative artwork (no chrome). Used in the horizontal brand carousel.

### Animation Preview Tile
**Role:** Lottie animation grid item

White card on #f4f4f5 grid background, 16px radius, no shadow, transparent inner surface so the animation sits on the page. Arranged in 5-column grid.

### Dark Feature Card
**Role:** Inverted card for emphasis sections

Fill #18181b or #09090b, 16px radius, 24px padding, white text. Used for 'Your motion' and footer-adjacent feature blocks.

### Hero Headline
**Role:** Page-top display headline

DM Sans 48–64px weight 500, color #09090b, letter-spacing -0.0400em. Sits left-aligned against the warm-gray canvas, paired with a colorful character illustration cluster on the right.

### Trust Logo Strip
**Role:** Social proof band beneath hero

Centered label in #71717b above a row of desaturated brand logos (Google, Disney, Nike, Uber, Spotify, Netflix, Microsoft, Airbnb, Amazon, TikTok). Logos rendered in #71717b or #9f9fa9 — muted gray to recede.

### Footer Block
**Role:** Site footer

Fill #09090b, white text, multi-column link grid, logo lockup top-left, social icons right-aligned.

### Search Input (Hero)
**Role:** Large centered search for animation library

White fill, 1px border #e4e4e7, radius 8px, generous 16px vertical padding, Inter 16px placeholder. Wider variant than header search.

### Navigation Bar
**Role:** Top-level site navigation

White background, logo left, link clusters center, search + lang + auth actions right. Inter 14px weight 500 for nav links, 16px gap between groups, no visible border but subtle separation via background.

## Do's and Don'ts

### Do
- Use #019d91 fill + #ffffff text for every primary action button (Get started, Sign up, Explore, See all).
- Apply border-radius 8px to buttons and inputs, 16px to standard cards, 24px to feature/hero panels, 48px to oversized dark hero panels.
- Headlines 32px and above must use DM Sans weight 500 with the matching negative letter-spacing: -0.0300em at 32px, -0.0400em at 48–64px, -0.0500em at 96px.
- Body, navigation, buttons, and small UI copy use Inter only — never mix DM Sans into utility text below 24px.
- Set page background to #f4f4f5 and place raised white cards (#ffffff) on top with 24px or 32px padding.
- Use 1px solid #e4e4e7 or #f2f2f3 as the only border treatment — never thicker than 1px on standard UI.
- Place colorful illustrations and animation thumbnails on the warm-gray canvas with no card chrome — let the artwork be the visual, not a wrapper.

### Don't
- Never use #000000 pure black as a card or surface fill — use #09090b or #18181b instead so surfaces feel ink-toned, not harsh.
- Never apply weight 700 or 800 to headlines — the system uses weight 500 even at 96px display sizes.
- Never use a drop shadow on cards — the elevation language is built from background contrast and rounded corners, not shadows.
- Never combine #019d91 with bold gradients, glassmorphism, or neon glow — the teal must read as a flat, confident fill.
- Never use #ff6900 (ember) for decoration or branding — it is reserved for warning/attention states.
- Never put body copy below 14px — captions stop at 12px and labels at 10px, and always use weight 500 for non-body sizes under 16px.
- Never break the spacing rhythm: gaps inside components are 4–8px, component-internal padding is 16–24px, between sections is 80px.

## Elevation

- **Buttons and inputs:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Warm Gray Canvas** (`#f4f4f5`) — Base page background, the largest surface tone beneath all content
- **Paper** (`#ffffff`) — Raised cards, primary buttons, content containers on warm-gray canvas
- **Soft Highlight Wash** (`#fff8e5`) — Subtle warm-tinted surfaces for category tiles and decorative panels
- **Charcoal Dark** (`#18181b`) — Dark-mode card blocks and contrast sections that invert the page
- **Ink Dark** (`#09090b`) — Deepest surface for footer and high-contrast feature panels

## Imagery

The visual language is animation- and illustration-first. Hero illustrations are flat, colorful vector character clusters with rounded organic shapes — faces, stars, robots, blobs — in saturated pastels (mint, orange, pink, teal, yellow) against the warm-gray canvas. Lottie animation thumbnails fill the library grid as full-bleed tile content (no card wrappers), each one a self-contained mini-scene. Brand case-study cards are full-bleed creative artwork from customers (Walmart smileys, Washington Post graphics, Canva birthday cards, CNN Create cityscapes). Photography is absent — the site replaces it entirely with motion graphics and illustration. Icons are mono-color filled glyphs, often small colored square backgrounds (yellow, pink, dark-blue, dark-green) behind simple line icons in feature tiles.

## Layout

Max-width 1200px centered container. Hero is a 2-column split: left-aligned oversized headline + subtext + dual CTAs, right-aligned illustration cluster. Below hero is a 4-column feature tile row, then a centered trust-strip with logo band, then a horizontal-scroll brand case-study carousel (full-bleed cards, partially visible peek on the right edge). Library section shifts to a centered stack: large centered headline, subtext, large search field, then a 5-column animation grid with rounded tiles. Footer is full-bleed dark (#09090b) with multi-column link grid. Vertical rhythm is consistent — sections separated by ~80px gaps, section headings centered above their content blocks, no alternating colored bands (the page stays on warm-gray canvas throughout, except for the dark footer).

## Similar Brands

- **Giphy** — Same marketplace-for-motion approach: white canvas, centered search, dense grid of full-bleed animated content tiles with minimal card chrome
- **Figma** — Same restrained neutral palette with a single saturated brand accent, generous rounded corners on cards, and oversized editorial headlines with tight negative tracking
- **Notion** — Same DM Sans / Inter pairing for display vs utility, same warm-gray canvas with white raised surfaces, same minimal-shadow flat elevation philosophy
- **Stripe** — Same oversized display headlines with aggressive negative letter-spacing at 48–96px and a quiet monochrome interface that lets featured content lead
- **Dribbble** — Same illustration-first hero, same trust-logo strip beneath hero, same warm-gray canvas with colorful artwork tiles — both feel like galleries more than product pages
