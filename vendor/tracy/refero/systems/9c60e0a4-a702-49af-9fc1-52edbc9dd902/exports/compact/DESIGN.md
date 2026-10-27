# The Fascination The Fascination — Style Reference
> Sunday lifestyle magazine on cream paper. Warm off-white canvas, editorial photography grid, quiet sans-serif body type interrupted by handwritten script accents, with one vivid electric blue doing all the interactive work as link color and border accent — never as filled buttons.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The Fascination reads like a Sunday lifestyle magazine printed on warm cream paper: editorial photography dominates, type stays quiet, and color only appears as small chromatic punctuation. A geometric sans (Graphik) carries all functional text while a handwritten script (Qwitcher Grypen) interrupts section headers with hand-drawn personality. The vivid electric blue is reserved exclusively for links, borders, and interactive accents — never as filled button backgrounds — creating a system where the page feels mostly monochrome and blue is the only 'switched on' signal. Cards and product reviews float on subtle parchment surfaces (#efe8dc) against a cream canvas (#fbfbf7), with generous spacing and a tight 6px radius on interactive elements that keeps everything feeling tactile and paper-like.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#fbfbf7` | Page canvas, primary background |
| Parchment | `#efe8dc` | Card surfaces, secondary elevated backgrounds, subtle warm wash |
| Ink Black | `#000000` | Primary text, card borders, heading text |
| Stone Gray | `#767676` | Muted helper text, secondary metadata, input borders |
| Charcoal Slate | `#1a202c` | Body text alternative, link text on light surfaces |
| Gunmetal | `#1f2937` | Input text, dark UI element borders |
| Iron Gray | `#4b5563` | Subtle borders, low-emphasis text |
| Electric Blue | `#2ea3f2` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Deep Violet | `#4c40e0` | Heading text, brand wordmark color, editorial display text |
| Indigo Bloom | `#454ad3` | Secondary heading text, section title accents |
| Marigold | `#ffd92a` | Decorative highlight wash, seasonal accent blocks |
| Sage Splash | `#91dea8` | Decorative soft accent, editorial section markers |
| Sky Mist | `#90d3e3` | Decorative cool accent, editorial section markers |

## Typography

### Graphik — Primary UI and editorial typeface — all body copy, headlines, navigation, buttons, links, and functional text. Weight 400 for body, 500 for sub-emphasis, 700 for strong headlines, 100 as dramatic thin display
- **Substitute:** Inter, Söhne, or DM Sans
- **Weights:** 100, 400, 500, 700
- **Sizes:** 12, 14, 16, 18, 20, 24, 30, 96px
- **Line height:** 1.20–1.70 body, 0.80–1.02 display

### Qwitcher Grypen — Decorative handwritten script used exclusively for editorial section accents and brand voice moments — never for functional UI text. Its appearance next to geometric sans creates the magazine-spread tension
- **Substitute:** Caveat, Dancing Script, or Allura
- **Weights:** 400
- **Sizes:** 48, 60px
- **Line height:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.53 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 20px | 1.33 | — |
| heading | — | — | 24px | 1.2 | — |
| heading-lg | — | — | 30px | 1.2 | — |
| display | — | — | 48px | 1.02 | — |
| hero | — | — | 96px | 0.8 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 0px
- **links:** 6px
- **buttons:** 6px

## Components

### Navigation Header
**Role:** Top bar site navigation

Minimal top header on Cream Paper (#fbfbf7) background. Wordmark left in Graphik 700 at ~20px. Search icon and 'Advertiser Disclosure' dropdown right-aligned. No background fill or border — sits directly on the warm canvas. Generous vertical padding ~32px.

### Category Filter Tab — Active
**Role:** Selected category filter

Outlined pill button. Electric Blue (#2ea3f2) 1px border, 6px radius, ~8px 16px padding. Text in Graphik 500 at 14px, color #2ea3f2. The blue border is the sole 'active' signal — no fill.

### Category Filter Tab — Inactive
**Role:** Unselected category filter

Outlined pill button. #000000 1px border, 6px radius, ~8px 16px padding. Text in Graphik 400 at 14px, color #000000. No fill, just a thin black outline.

### Section Header with Script Accent
**Role:** Editorial section divider

Two-part type composition. Category label in Qwitcher Grypen script at 48–60px in a brand violet (#4c40e0) or decorative accent. Section title in Graphik 700 at 24–30px in Ink Black (#000000). The script-handwritten-to-clean-sans contrast is the signature move.

### Product Review Card
**Role:** Article tile in content grid

Full-bleed photograph on top (no border-radius on images — they run edge-to-edge within their grid cell). Below: category label in Graphik 400 at 12px in a muted category color, then article title in Graphik 700 at ~18px in Ink Black. No card background fill; sits directly on Cream Paper. ~16px gap between image and text.

### Hero Banner
**Role:** Top-of-page editorial hero

Full-bleed lifestyle photograph with overlaid product imagery. Type sits over image with no background plate. Thin Electric Blue (#2ea3f2) 1px borders frame accent elements. No shadow or overlay gradient — photography is the atmosphere.

### Newsletter Modal
**Role:** Email capture overlay

Centered card on a deep space/nebula photograph background (#1a0d2 area). Headline in Graphik 700 at 24px white. Body copy in Graphik 400 at 14–16px white. Email input: full-width, 1px white border, transparent background, white placeholder text, 6px radius. Submit button: filled Electric Blue (#2ea3f2) background, white text, Graphik 700 at 14px, 6px radius, full-width. Close X in top-right corner.

### Outlined Link / Interactive Border
**Role:** Inline links and bordered interactive elements

The system's primary interactive pattern. 1px Electric Blue (#2ea3f2) border, 6px radius. Text in #2ea3f2 Graphik 400–500. No fill. This outlined approach is used consistently instead of filled CTA buttons.

### Content Image Grid
**Role:** Multi-column product review layout

3-column grid of Product Review Cards. ~22px row and column gap. Cards align to a clean editorial grid — no alternating sizes, no masonry. Images maintain consistent aspect ratios within each row.

### Category Tag Label
**Role:** Small metadata text above article titles

Graphik 400 at 12–14px. Color varies by category: Fashion uses #9333ea violet range, Food & Drink uses muted earthy tones. No background fill or border — just colored text acting as a section identifier.

## Do's and Don'ts

### Do
- Use Electric Blue (#2ea3f2) exclusively as outlined link/border color and interactive text — never as a filled button background
- Maintain the warm cream canvas (#fbfbf7) as the base for all pages; introduce Parchment (#efe8dc) only for subtle card surface elevation
- Pair Qwitcher Grypen script with Graphik sans for section headers — the handwritten-to-geometric contrast is the editorial signature
- Use weight 100 Graphik at 96px for hero/display type — extreme thinness at extreme size creates editorial drama
- Keep all card and image corners square (0px radius) — only interactive elements (buttons, links, inputs) get the 6px radius
- Use 8px base unit consistently: 8/16/24/32/48px for all padding, margins, and gaps
- Let photography be the visual atmosphere; avoid heavy overlays, gradients, or decorative chrome on images

### Don't
- Don't use Electric Blue (#2ea3f2) as a filled button background — the system defines blue as an outlined/border accent only
- Don't use Qwitcher Grypen script for functional UI text, navigation, buttons, or form labels — it's decorative only
- Don't add box-shadows, drop-shadows, or elevation effects to cards — the system relies on surface color contrast and hairline borders, not shadow depth
- Don't introduce new chromatic colors for interactive elements — the two-color accent system (blue + violet) is complete
- Don't use rounded corners on images, cards, or content containers — the 0px radius on surfaces vs 6px on interactives is intentional
- Don't use dark mode patterns or dark surfaces for content — the cream canvas is the brand identity, not a theme variant
- Don't mix the decorative accents (Marigold, Sage, Sky Mist) with functional UI — they are editorial decoration only, never interactive states

## Surfaces

- **Cream Paper** (`#fbfbf7`) — Base page canvas, all content sits on this warm off-white
- **Parchment** (`#efe8dc`) — Elevated card surfaces, product review containers, subtle warm separation

## Imagery

Photography is the dominant visual language: full-bleed lifestyle and product photography fills the page. Images are square-cropped or maintain consistent aspect ratios within a strict 3-column grid. No rounded corners on photography — images run edge-to-edge in their grid cells with sharp edges. The photography style is bright, high-key, editorial product photography with clean white or pastel backgrounds. No duotone treatment, no color grading beyond natural product color. The newsletter modal uses a contrasting deep-space/cosmic photograph as background, creating a dramatic break from the cream-and-photo editorial rest of the site. Icons are minimal and functional (search icon, close X), thin-stroked, monochromatic.

## Layout

Max-width ~1200px centered content on a full-bleed cream canvas. Navigation is a minimal top bar with wordmark left, utility links right. The hero area features a large lifestyle photograph with overlaid product imagery, followed by a horizontal scrollable category filter row. Content flows in a 3-column card grid for product reviews, with square or 4:3 image crops. Section headers use a two-part type composition (script accent + bold sans title) and separate content blocks by category. The page reads top-to-bottom as: nav → hero photo with product overlay → category filters → first content grid → section break with script header → next category grid. No sidebar, no asymmetric layouts — everything centers on a clean editorial grid with generous 48px section gaps.

## Similar Brands

- **The Strategist (NY Mag)** — Same editorial product-review grid on warm background, category-driven content architecture, photography-forward cards with category labels above titles
- **Wirecutter** — Same product review density, sans-serif editorial type, clean image-grid layout with minimal chrome around content
- **Cup of Jo** — Same lifestyle-magazine warmth, cream background, serif/script decorative accents, editorial grid with large lifestyle photography
- **The Everygirl** — Same warm off-white canvas, editorial review content structure, category filter tabs, lifestyle photography dominance
