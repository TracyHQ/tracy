# Felt — Style Reference
> topographic atlas at dusk — moss-green pages, serif headlines, one amber needle

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Felt renders as a cartographer's field journal at dusk: a deep mossy-green canvas carries oversized editorial serif headlines that feel pulled from a vintage atlas, while a grotesque sans handles utility text. The warm amber accent appears sparingly — a compass needle against the green — punctuating CTAs, links, and interactive borders without ever flooding the surface. Layout is centered, magazine-like, with generous breathing room and full-width product reveals that feel like fold-out map spreads. The visual rhythm alternates between typographic hero zones and embedded product UI, creating a sense of a working tool rather than a marketing site.

## Colors

| Name | Value | Role |
|------|-------|------|
| Moss Canvas | `#314218` | Page background, hero sections, dominant canvas — the deep mossy green that carries the entire site and grounds the editorial atmosphere |
| Fern | `#3d521e` | Mid-green surface for cards, elevated panels, and the topside of the surface stack |
| Lichen | `#64754b` | Muted green for secondary surfaces, borders on cards, and subtle dividers against the canvas |
| Forest Floor | `#212f0c` | Deeper green for nested surface layers and inset product UI backgrounds |
| Deep Bog | `#18210c` | Darkest green for the deepest surface layer, code blocks, and high-contrast panels |
| Amber Compass | `#dc8c46` | Primary action — filled CTA buttons, link borders, active link text. The single warm accent that cuts through the green monochrome like a compass needle |
| Bone White | `#ffffff` | Primary text, heading color, button text on amber fills, and the dominant border for ghost/outlined controls |
| Parchment | `#eeeeee` | Light surface for embedded product UI, inset map views, and light-mode panel surfaces against the dark canvas |
| Charcoal | `#333333` | Text and borders inside the light parchment product UI panels — the dark-on-light text color for embedded app surfaces |
| Limestone | `#d8dcd2` | Soft warm-tinted gray for badge backgrounds, subtle borders, and muted helper text inside light panels |
| Ink | `#000000` | SVG fills, max-contrast elements, and the map marker pin color |

## Typography

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.25, 1.33, 1.43

### GT Alpina Standard — Display and heading serif — the editorial headline face. Used at large sizes for hero headlines and section titles. The tight negative tracking (-0.033em to -0.040em) and line-height under 1.0 give the serif a compressed, almost carved-into-stone quality that evokes old cartographic title plates. This is the signature type choice: a humanist serif that feels hand-drawn rather than mechanical.
- **Substitute:** Fraunces, Tiempos Headline, Playfair Display
- **Weights:** 300, 400
- **Sizes:** 28px, 36px, 43px, 46px, 50px, 86px
- **Line height:** 0.80, 0.96, 1.00, 1.11, 1.33
- **Letter spacing:** -0.0400em at 86px, -0.0330em at 36-50px

### Atlas Grotesk — Primary UI and body sans-serif — handles navigation, body text, button labels, badges, and links. The slight positive tracking (0.033em) on body sizes adds legibility on the dark green canvas. The grotesque geometry provides a clean utility counterpoint to the expressive serif headlines.
- **Substitute:** Inter, Söhne, Helvetica Neue
- **Weights:** 300, 400, 500, 700
- **Sizes:** 12px, 14px, 16px, 18px, 19px, 20px
- **Line height:** 1.00, 1.11, 1.20, 1.25, 1.30, 1.33, 1.43, 1.50, 1.56
- **Letter spacing:** 0.0330em

### Times New Roman — Fallback system serif at extreme display sizes. The 101px / 0.88 line-height ratio confirms the compressed display treatment for the largest headlines.
- **Substitute:** system serif
- **Weights:** 400
- **Sizes:** 36px, 101px
- **Line height:** 0.88, 2.46

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.43 | 0.4px |
| body-sm | — | — | 14px | 1.43 | 0.46px |
| body | — | — | 16px | 1.5 | 0.53px |
| subheading | — | — | 19px | 1.33 | 0px |
| heading-sm | — | — | 28px | 1.11 | -0.92px |
| heading | — | — | 36px | 1 | -1.19px |
| heading-lg | — | — | 50px | 0.96 | -1.65px |
| display | — | — | 86px | 0.88 | -3.44px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **cards:** 6px
- **badges:** 6px
- **images:** 6px
- **inputs:** 6px
- **buttons:** 20px

## Components

### Amber CTA Button
**Role:** Primary action — filled button for conversion moments

Filled #dc8c46 background, white (#ffffff) text in Atlas Grotesk 16px weight 500, tracking 0.033em. 20px border-radius (pilled). Horizontal padding 20-24px, vertical padding 12-16px. No border. Includes a white play-arrow icon inline at the right.

### Ghost Link Button
**Role:** Secondary action — text link with underline border treatment

No fill, no border. Atlas Grotesk 16px weight 400, #ffffff text. Underline created by a 1px white bottom border. Used for "Book a demo" style secondary CTAs.

### Navigation Bar
**Role:** Top-level site navigation

Transparent on Moss Canvas. Felt wordmark in white serif at left. Nav items (PLATFORM, INDUSTRIES, RESOURCES, PRICING) in Atlas Grotesk 12px weight 500, uppercase, 0.033em tracking, white. Right side: "BOOK A DEMO" and "LOG IN" as ghost text links, "SIGN UP" as a filled Amber CTA with play icon.

### Hero Section
**Role:** Above-the-fold headline and CTA zone

Centered layout on Moss Canvas. Headline in GT Alpina Standard 86px weight 300, white, line-height 0.88, letter-spacing -3.44px. Subtitle in Atlas Grotesk 18px weight 400, #eeeeee. Two CTAs side by side: Amber CTA + Ghost Link.

### Scrolling Ticker Banner
**Role:** Top announcement bar

Full-width strip. White text on Moss Canvas (#314218). Atlas Grotesk 12px weight 500, uppercase, repeated headline text with separators. Sits above the navigation.

### Product UI Panel
**Role:** Embedded application screenshot / product surface

Light surface (#ffffff or #eeeeee) with rounded corners 6px. Dark text (#333333) inside. Subtle shadow rgba(0,0,0,0.2) 0px 2px 5px. Contains toolbars, map canvases, and library sidebars — mimics the actual Felt product.

### Client Logo Row
**Role:** Social proof — trusted-by brand logos

Horizontal row of client logos (Lyft, Lime, Turo, Cushman & Wakefield) rendered in white on Moss Canvas. Section title "Leading a modern GIS movement" in GT Alpina Standard 36px weight 300, white, centered above.

### Feature Section
**Role:** Mid-page content blocks with headline + product visual

Centered serif headline (GT Alpina Standard 36-50px, white) followed by Atlas Grotesk 18px subtext, then a full-width Product UI Panel below. Generous 80px vertical gap between sections.

### Badge / Tag
**Role:** Category labels and metadata tags

Limestone (#d8dcd2) background, small radius 6px, Atlas Grotesk 12px weight 500, 0.033em tracking. Minimal padding 2px 6px.

### Map Marker Pin
**Role:** Interactive map point indicator

#dc8c46 (Amber) circular pin with a white border, placed on the map canvas. Small drop shadow. Acts as the brand's visual signature on the product surface.

## Do's and Don'ts

### Do
- Use GT Alpina Standard weight 300 for all display and section headlines — the thin serif is the brand's most distinctive choice and must carry the editorial voice
- Set display headlines at 86px with line-height 0.88 and letter-spacing -3.44px for the compressed, carved-into-stone effect
- Use Amber Compass (#dc8c46) exclusively for filled CTAs and accent moments — never as a surface fill or decorative wash
- Step surfaces using the green scale: Moss Canvas (#314218) → Fern (#3d521e) → Lichen (#64754b) for elevation, not shadows
- Set body and UI text in Atlas Grotesk weight 400 with 0.033em letter-spacing for legibility on the dark green canvas
- Embed product UI panels in light surface (#ffffff) with 6px radius and the single subtle shadow to create contrast against the dark page
- Maintain centered, magazine-style layouts with 80px section gaps — the page rhythm should feel like turning pages in an atlas

### Don't
- Don't use Amber Compass (#dc8c46) for body text, backgrounds, or large surface areas — it loses its compass-needle effect when overused
- Don't set serif headlines at line-height above 1.0 — the compressed treatment is essential to the editorial feel
- Don't apply multiple shadow layers — Felt uses elevation through color stepping, not shadow stacks
- Don't use pure black (#000000) as a page background — the mossy green tones are the canvas, not black
- Don't replace GT Alpina Standard with a geometric or grotesque display face — the serif is the brand identity
- Don't use border-radius above 6px on cards, images, or product panels — only buttons get the 20px pill radius
- Don't introduce new accent hues — the entire palette is green monochrome plus one warm amber; any other color breaks the system

## Elevation

- **Embedded product UI panels:** `rgba(0, 0, 0, 0.2) 0px 2px 5px 0px`

## Surfaces

- **Moss Canvas** (`#314218`) — Primary page background and hero zones
- **Fern** (`#3d521`) — First elevation — cards and content panels sitting on the canvas
- **Lichen** (`#64754b`) — Secondary surface for sub-cards and dividers
- **Bone White** (`#ffffff`) — Inverted product UI surfaces (embedded map app panels)

## Imagery

Imagery is dominated by embedded product screenshots showing the Felt map application — these are full-width, light-surface panels with real GIS map content (street maps, satellite views, data overlays, map markers). The product UI itself IS the hero imagery. No lifestyle photography, no stock imagery, no decorative illustration. The only non-product visual elements are topographic contour-line patterns in muted green (#64754b) that appear as background decoration on hero sections, evoking actual cartographic map texture. Client logos appear in white monochrome. The map marker pin (#dc8c46 with white border) serves as the brand's recurring visual signature across product surfaces.

## Layout

Centered, magazine-style page layout with max-width 1200px for content. Hero is full-bleed dark green with centered oversized serif headline, subtitle, and two side-by-side CTAs. Below the hero, a full-width embedded product UI panel breaks the layout to a wider reveal (like a fold-out map spread). Sections alternate between typographic hero zones (centered text, 80px vertical padding) and product reveal zones (full-width embedded app surfaces). A scrolling ticker banner sits at the very top. Navigation is a clean transparent bar overlaying the dark canvas. The page rhythm is: ticker → nav → hero headline → product reveal → social proof logos → feature section (headline + product) → repeating feature sections. All content is centered; no asymmetric or left-aligned compositions.

## Similar Brands

- **Mapbox** — Both use dark canvas backgrounds with a single warm accent color and center their hero on embedded map product UI rather than abstract imagery
- **Notion** — Same editorial approach with oversized serif headlines on dark backgrounds, though Notion uses black rather than green canvas
- **Linear** — Dark monochromatic UI with one distinctive accent color, centered layouts, and serif/serif-adjacent display type for a premium editorial feel
- **Roam Research** — Both use nature-inspired dark canvas palettes (Roam uses deep navy, Felt uses moss green) with serif headlines and a single warm accent for interactive elements
- **Stamen Design** — Cartographic design studio aesthetic — mossy greens, topographic texture, and serif typography rooted in atlas and map traditions
