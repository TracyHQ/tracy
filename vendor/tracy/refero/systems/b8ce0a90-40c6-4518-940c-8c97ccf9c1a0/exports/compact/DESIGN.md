# Dribbble — Style Reference
> gallery wall at design week — a quiet white room where one magenta spotlight circles each piece

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Dribbble reads as a curated gallery wall for creative work: white canvas, near-black typography, and one unmistakable magenta accent that marks every brand moment. The system is compact and image-first — large rounded thumbnails fill a 4-column grid while chrome stays minimal and quiet. Dark solid buttons with 8px radii carry primary actions, while the pink appears as small functional punctuation for search, PRO badges, and highlights rather than flooding large surfaces. Typography uses Mona Sans at relatively tight line heights, producing a dense scannable rhythm that lets the submitted work carry the visual weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Dribbble Pink | `#ea4c89` | Brand signature accent — search submit button, PRO badge, logo mark, active heart, hover pulses — one vivid magenta against the monochrome canvas makes the brand unmistakable at any size |
| Midnight Ink | `#0d0c22` | Primary text, filled primary buttons, dark surface fills, icon strokes — a near-black with a cool blue undertone that reads warmer than pure black against white |
| Deep Plum | `#060318` | Navigation bar fill, darkest text tokens, logo wordmark — slightly cooler and deeper than Midnight Ink for the fixed header band |
| Charcoal Plum | `#3d3d4e` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Smoke | `#6e6d7a` | Secondary/muted body text, helper labels, view-count and heart-count numbers — carries the dense meta layer beneath thumbnails |
| Fog | `#9e9ea7` | Tertiary text, placeholder text, disabled icons, checkbox idle state — the lightest readable neutral |
| Mist | `#f3f3f6` | Soft surface fill, input field backgrounds, hover wells, secondary panels — the only off-white surface that sits above the page canvas |
| Frost Border | `#e2e8f2` | Hairline borders, divider lines, input outlines, card edges on hover — a cool-tinted off-white that reads as a boundary, not a fill |
| Muted Plum | `#524b63` | Lower-emphasis dark text, link hover in dense lists, designer name secondary line — a washed dark for tertiary copy on white |
| Slate Edge | `#3a3546` | Faint dark surfaces, tag backgrounds, low-key dark UI wells — bridges the gap between the deep nav black and the lighter grays |
| Paper | `#ffffff` | Page canvas, card surfaces, button text on dark fills, input text — the dominant surface of the entire product |

## Typography

### Mona Sans — Sole typeface across the product — Mona Sans is a custom geometric humanist sans drawn by GitHub, used for everything from 9px meta labels to 48px hero headlines. Its openness keeps dense 4-column grids readable, and the 450/500 mid-weights carry the designer's brand without shouting
- **Substitute:** Inter, General Sans, or Söhne
- **Weights:** 400, 450, 500, 600, 700, 800
- **Sizes:** 9px, 12px, 13px, 14px, 16px, 48px
- **Line height:** 1.00–2.33 (tight 1.20–1.36 for UI, loose 1.67–2.00 for small caps labels)
- **OpenType features:** `"ss01"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.38 | — |
| body-sm | — | — | 13px | 1.38 | — |
| body | — | — | 14px | 1.38 | — |
| body-lg | — | — | 16px | 1.38 | — |
| heading-sm | — | — | 48px | 1.3 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 40px
- **Card padding:** 12px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **badges:** 12px
- **inputs:** 12px
- **buttons:** 8px
- **thumbnails:** 8px
- **hero-feature:** 16px

## Components

### Filled Dark CTA
**Role:** Primary action button (Log in, Sign up, Start a Project Brief)

Midnight Ink (#0d0c22) fill, white text, Mona Sans 14px weight 600, 8px radius, 10px 18px padding. No shadow. Becomes the visual anchor on the page — high contrast, compact, never decorative.

### Ghost Navigation Button
**Role:** Secondary text link in the nav band

No fill, no border, white text at Mona Sans 14px weight 500 on the Deep Plum (#060318) nav. Hover adds a subtle white-alpha wash. Padding 8px horizontal. A small 4px-tall chevron pairs with dropdown triggers.

### Dribbble Pink Search Submit
**Role:** Search action button — the only persistent pink element on most pages

Dribbble Pink (#ea4c89) fill, white magnifier icon, 8px right-side radius anchoring the search input. Sits flush against the Mist (#f3f3f6) input field. 12px radius on the right edge where it meets the input.

### Search Input
**Role:** Primary search field in the hero

Mist (#f3f3f6) fill, no visible border, Frost Border (#e2e8f2) on focus, Smoke (#6e6d7a) placeholder, Mona Sans 14px. Pill-shaped with 12px radius on the left, flush with the pink submit on the right. Height ~44px.

### Category Pill
**Role:** Popular-tag filter chip below the search bar

White fill, Frost Border (#e2e8f2) 1px border, Smoke (#6e6d7a) text, 9999px radius, 6px 14px padding, Mona Sans 13px weight 500. The 'Popular:' lead-in label is bold Midnight Ink. Hover darkens text to Midnight Ink.

### Filter Tab
**Role:** Category navigation in the content band (Discover, Animation, Branding, etc.)

No fill or border by default. Mona Sans 14px weight 500, Smoke text. Active tab adds a 2px Midnight Ink underline and shifts text to Midnight Ink. Spacing: 16px horizontal padding between tabs.

### Filter Dropdown Trigger
**Role:** 'Popular' and 'Filters' selectors

White fill, Frost Border (#e2e8f2) 1px border, 8px radius, Mona Sans 14px weight 500, Midnight Ink text. Right-aligned chevron at Fog (#9e9ea7). Padding 8px 12px.

### Shot Thumbnail Card
**Role:** Single piece of design work in the discovery grid

8px radius around the image itself (no card chrome — the image IS the card). Image fills a 1:1-ish aspect container. Meta block below the image: 12px gap. Designer avatar 24px circle, name in Mona Sans 13px weight 600 Midnight Ink, PRO badge 11px pill in pink, heart icon + count in Smoke, view count in Smoke.

### PRO Badge
**Role:** Marks paying/designer-tier accounts next to usernames

Dribbble Pink (#ea4c89) fill, white 'PRO' text, 4px radius, 2px 6px padding, Mona Sans 9px weight 700 uppercase. Sits inline with the designer name in a 12px tag list.

### Hero Showcase Device
**Role:** Large featured-work frame in the hero column

Dark device frame around a 16:9 design composition, 16px outer radius, Midnight Ink (#0d0c22) frame fill. Holds the rotating featured work with a QClay attribution strip below in a white pill, 12px radius, Mona Sans 11px.

### Start a Project Brief Card
**Role:** Inline call-to-action band between hero and grid

Full-width row, no fill (transparent on the white canvas), separated by 1px Frost Border dividers above and below. Left: outlined 'Start a Project Brief' button (Midnight Ink border, Midnight Ink text, 8px radius). Right: descriptive Mona Sans 14px Smoke text.

### Top Navigation Bar
**Role:** Fixed dark band at the top of every page

Deep Plum (#060318) fill, 64px tall. Left: white Dribbble wordmark. Center: dropdowns (Explore, Hire Talent, Get Hired, Community) in Mona Sans 14px weight 500 white. Right: 'Sign up' ghost link, 'Log in' filled Midnight Ink button. Bottom border: none, but the contrast against the white canvas does the work.

### Bottom Promo Banner
**Role:** Persistent dark call-to-action strip at the page foot

Full-width Deep Plum (#060318) fill, ~56px tall. White Mona Sans 13px text. Right-side CTA: white-fill button with Midnight Ink text, 8px radius. Used for feature announcements (Dribbble Select, year-end lists).

## Do's and Don'ts

### Do
- Use #ea4c89 only for brand-anchored moments: search submit, PRO badge, logo mark, heart-fill, and one-per-page highlight. Never paint a large surface pink.
- Set filled primary buttons to #0d0c22 fill, white text, 8px radius, 10px 18px padding, Mona Sans 14px weight 600.
- Build the navigation as a 64px tall #060318 band with white text in Mona Sans 14px weight 500 — never add a shadow or border beneath it.
- Use Mona Sans at 48px weight 700 with line-height 1.08 for hero headlines; let the work below it provide the visual weight.
- Keep the 4-column thumbnail grid on a pure white canvas with 8px image radius and 12px meta gap — no card backgrounds, no shadows, no dividers between tiles.
- Render the PRO badge as #ea4c89 fill, white text, 4px radius, 9px weight 700 uppercase, inline with the designer name.
- Maintain 40px between content bands and 8px between meta items in the shot card — the rhythm should feel dense but breathable.

### Don't
- Don't use #ea4c89 for body text, icons, borders, or large fills — it loses its meaning when overused.
- Don't add drop shadows to cards, buttons, or the navigation — the system relies on color contrast and 8px radii for hierarchy.
- Don't use any color other than Midnight Ink or Deep Plum for filled dark buttons — avoid #3d3d4 for primary CTAs.
- Don't apply radii above 16px to standard UI — thumbnails are 8px, hero frames are 16px, and anything rounder reads as wrong.
- Don't introduce a second accent color — the palette is monochrome plus one magenta, and a second accent will dilute the brand signal.
- Don't set body copy below 12px or above 16px — the system compresses information at 13–14px and reserves 48px for the hero only.
- Don't decorate the dark navigation with gradients, glows, or transparency — keep it a flat #060318 band.

## Elevation

- **Navigation bar:** `none — dark fill separates it from the white canvas without any shadow`
- **Shot thumbnails:** `none — content is the surface, no card elevation`
- **Buttons:** `none — contrast and weight carry hierarchy`

## Surfaces

- **Canvas** (`#ffffff`) — Page background, thumbnail wells, dominant product surface
- **Soft Surface** (`#f3f3f6`) — Input fields, hover wells, search bar fill, subtle panel separation
- **Hairline Edge** (`#e2e8f2`) — Borders and dividers that read as boundaries, not as fills
- **Mid Dark** (`#3d3d4`) — Secondary button fills, dark meta badges
- **Top Bar** (`#060318`) — Fixed navigation band, primary dark CTA fills, deepest surface

## Imagery

The site is image-first by definition: every primary content unit is a user-uploaded design thumbnail filling an 8px-radius container. The product itself uses almost no decorative imagery — the hero pairs text with a single dark device frame showing a featured work, and the rest of the page is the community's work. No lifestyle photography, no illustrations, no abstract graphics. Icons are simple monochrome line glyphs in Fog (#9e9ea7) or Midnight Ink at 1.5–2px stroke weight. Avatars are 24px circles with no border. The visual hierarchy is: submitted work > brand pink > everything else recedes.

## Layout

Fixed dark top navigation (64px) spans full width. Below: max-width ~1280px centered content. Hero is a 2-column split — left half holds a 48px headline, search input with pink submit, category pills, and the Start a Project Brief inline CTA; right half shows a 16:9 dark device frame with the featured work. Beneath the hero: a horizontal filter tab strip (Discover, Animation, Branding, Illustration, Mobile, Print, Product Design, Typography, Web) with 'Filters' dropdown pinned right. Main content is a 4-column responsive grid of shot thumbnails, each with a tight meta row below. A full-width dark promo banner anchors the page foot. Cards have no visible chrome — the work is the card.

## Similar Brands

- **Behance** — Same gallery-grid layout for creative work with a single brand accent (Behance blue) against a near-monochrome palette and tight meta rows
- **Pinterest** — Same image-first masonry approach where the submitted content carries the visual weight and the chrome stays near-white with small accent punctuation
- **Readymag** — Same near-black/white palette with one vivid brand color and compact 4px-based spacing — both treat the work as the hero and keep UI chrome quiet
- **Cargo** — Same portfolio-first gallery approach with rounded 8px thumbnails and a flat dark navigation band, though Cargo trends more editorial
- **Are.na** — Same restraint — the content blocks are the design, and the surrounding chrome is almost invisible, with category navigation done as quiet text tabs
