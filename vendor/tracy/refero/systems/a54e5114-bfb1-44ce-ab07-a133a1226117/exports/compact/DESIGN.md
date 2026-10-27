# Adanola — Style Reference
> Editorial lookbook on white paper. A fashion editorial spread where typography and photography breathe across clean white surfaces, with black ink for type and a whisper-thin custom sans-serif (Favorit) carrying the entire brand voice.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Adanola is a gallery-like fashion canvas where the product photography is the entire visual language and the UI almost disappears. The interface is near-monochrome — white surfaces, black text, and a single thin sans-serif typeface (Favorit) — letting the color of the garments themselves become the only chromatic accent on most pages. Components are deliberately lightweight: no shadows, no gradients, no decorative borders, just hairline rules, ghost outlines on primary actions, and 4px corner radii that read as crisp rather than soft. Spacing is compact and consistent (4px base), but the generous whitespace around imagery creates a calm, editorial rhythm that treats every product shot as a full-bleed editorial spread. The overall feel is closer to a high-end print lookbook than a typical e-commerce grid.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon Ink | `#000000` | Primary text, filled action buttons, icon strokes, hairlines — the dominant ink across the entire interface |
| Paper White | `#ffffff` | Page canvas, card surfaces, text on dark fills, image backgrounds |
| Soft Mist | `#e5e7eb` | Subtle surface alternation, disabled states, skeleton backgrounds, light dividers |
| Warm Fog | `#f0efe7` | Off-white surface variant for subtle banding between product rows and editorial sections |
| Blush Sand | `#f5ebd5` | Warm cream surface for editorial highlight sections and seasonal accents |
| Smoke Charcoal | `#333333` | Secondary text, input borders, subdued UI chrome |
| Onyx | `#1d1d1d` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Stone Gray | `#cccccc` | Placeholder backgrounds, image placeholder fills, neutral swatch defaults |
| Slate | `#2f3440` | Cool charcoal for product photography backgrounds and muted editorial surfaces |
| Olive Drab | `#636355` | Warm muted surface for product photography contexts |
| Maroon Clay | `#523037` | Warm muted surface for product photography contexts |
| Deep Iris | `#222845` | Cool muted surface for product photography contexts |
| Pewter | `#677284` | Cool gray for product photography contexts |
| Driftwood | `#dfccbe` | Warm beige for product photography contexts |
| Pale Tide | `#badce4` | Cool pastel surface for editorial accent sections |

## Typography

### Favorit — Brand and UI typeface — used across all navigation, headings, body, buttons, inputs, and product cards. Custom monoline sans-serif with tight tracking (0.025em). Substitutes: Inter, Söhne, or Neue Haas Grotesk. The whisper-weight 400 at 30px for hero headlines is a signature choice — most fashion sites use display serifs or bold weights, but Adanola's regular-weight headlines in a clean sans feel like editorial captions rather than advertising slogans.
- **Substitute:** Inter
- **Weights:** 400, 500, 700
- **Sizes:** 9, 12, 14, 16, 20, 30
- **Line height:** 1.00, 1.20, 1.33, 1.40
- **Letter spacing:** 0.025em
- **OpenType features:** `"ss01" on, "cv11" on`

### Nunito Sans — Secondary fallback for form inputs and minor chrome elements
- **Substitute:** Nunito Sans
- **Weights:** 400, 700
- **Sizes:** 12
- **Line height:** 1.20

### Arial — System fallback for legacy email and content blocks
- **Substitute:** Arial
- **Weights:** 400
- **Sizes:** 14
- **Line height:** 1.20

### swym-font — swym-font — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1

### Source Sans Pro — Source Sans Pro — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.33 | 0.35px |
| heading | — | — | 20px | 1.2 | 0.5px |
| display | — | — | 30px | 1.2 | 0.75px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Ghost CTA Button
**Role:** Primary hero and section action (e.g. 'SHOP ACTIVE')

Transparent fill, 1px solid #000000 border, Carbon Ink text in Favorit 12px weight 500, 4px border-radius, 6px 24px padding, no shadow. The outlined treatment is the default primary action — filled black is reserved for secondary inline actions.

### Filled Quick Add Button
**Role:** Compact product-card action for adding to bag

Solid #000000 fill, white text in Favorit 12px weight 500, no visible border (or 1px matching fill), 4px border-radius, 4px 10px padding, sits at bottom-right of each product card.

### Product Card
**Role:** Grid item in product listing sections

Zero border-radius, 16px padding, white background. Image fills card width with no rounding. Below image: product name in Favorit 12px weight 400 at #000000, price directly underneath in same style. Color swatch row (small 12-16px squares) sits above the title. No card shadow or border — the image edge defines the card boundary.

### Top Navigation Bar
**Role:** Site-wide navigation header

White background, 4px vertical padding rows inside nav container, horizontal layout with left-aligned category links (SHOP, ACTIVE, SWEATS, SPRING SUMMER) in Favorit 12px weight 500, center-aligned wordmark 'ADANOLA' in Favorit 30px weight 700, right-aligned icon cluster (wishlist heart, search, account, bag). Hairline 1px bottom border in #000000.

### Announcement Bar
**Role:** Top-of-page promotional strip

Black (#000000) background, white text in Favorit 9px weight 400, centered single-line message ('FREE Standard Delivery on orders over €125'). Full-bleed width, minimal vertical padding (~4-6px).

### Category Tab Filter
**Role:** Horizontal category switcher above product grids

Text-only tabs in Favorit 12px weight 500. Active tab has #000000 background with white text and 0px border-radius (sharp rectangle). Inactive tabs are black text on white with no border. 4-6px horizontal gap between tabs. No underline or chevron indicators.

### Wishlist Heart Icon
**Role:** Save-to-favorites trigger on product cards

Small outline heart icon in top-right of each product card image, #000000 stroke, 1.5px weight, ~16px size. Fills to solid black on active/hover state. No background container — floats over image.

### Color Swatch Row
**Role:** Product colorway selector on cards

Horizontal row of 4-6 small 12x12px squares below product image, each representing a color variant. 4px gap between swatches. Outlined active swatch with 1px #000000 border, inactive swatches have no border. Colors are exact garment hues (blues, greens, grays, blacks, whites).

### Search Input
**Role:** Site search and product filtering

Underlined text input with 1px #333333 bottom border, no side borders, no background fill. Placeholder text in Favorit 12px weight 400, #333333 at 60% opacity. 4px border-radius only on the underline terminals if any rounding exists.

### Chat Widget
**Role:** Live chat and support trigger

Circular floating button bottom-right of viewport, ~48px diameter, black (#000000) fill, white speech-bubble icon centered. No shadow or elevation — flat circle. Sits above page content at all times.

### Hero Image Section
**Role:** Full-bleed editorial photography

Edge-to-edge lifestyle photography with no overlay or gradient. Centered headline 'The Ultimate staples' in white Favorit 30px weight 400 overlaid on image with 0.025em letter-spacing. Ghost CTA button centered below headline. Image aspect ratio approximately 16:6, filling the full viewport width.

### Product Grid
**Role:** Main product listing layout

4-column grid on desktop, 16-24px column gap, generous 64px row gap between sections. White background. Section heading ('New & Trending') in Favorit 20px weight 700 at top-left. Grid items are flush — no card containers, just images with metadata beneath.

### Split Editorial Section
**Role:** Two-image lifestyle feature block

Two equal-width images side by side, full-bleed, no gap or 4px gap. Each image fills 50% viewport width. No text overlay — the imagery speaks alone. White or neutral background between this section and adjacent content.

### Slide Pagination Dots
**Role:** Carousel/slider position indicator

Two small horizontal bars (~30px wide, 2px tall) centered below the hero. Active bar is #000000, inactive is #cccccc. No circular dots — uses thin rectangular bars to match the editorial-minimal tone.

## Do's and Don'ts

### Do
- Use Favorit at all UI touchpoints — navigation, buttons, product names, headings — with 0.025em letter-spacing as the brand's defining typographic fingerprint
- Set primary actions as ghost/outlined buttons (1px #000000 border, transparent fill) — filled black is reserved for compact secondary actions like Quick Add
- Keep all border-radius values at 0px for product cards, images, and tags; use 4px only for buttons and inputs — the crisp rectangular geometry is core to the editorial lookbook feel
- Let product photography provide all color on listing and editorial pages — the UI chrome should stay near-monochrome (white surfaces, black text, #e5e7eb alternation) so garment hues read as the only chromatic accents
- Use compact 4px-based spacing (4/8/16/24px) for UI elements, then break to generous 64px+ section gaps to create the calm editorial rhythm between product grids
- Anchor the product card layout to a 4-column desktop grid with images that fill card width edge-to-edge — no card containers, no shadows, no borders around product images
- Apply the black announcement bar (#000000 bg, white 9px Favorit text) as a persistent strip above the nav for promotions and shipping messages

### Don't
- Do not introduce drop shadows or box-shadow elevation on any component — the design system is deliberately flat and relies on whitespace and hairlines for separation
- Do not use saturated brand colors for buttons, links, or interactive states — keep the action palette strictly black/white/outline
- Do not round product card images or product card containers — the sharp rectangular edges are signature to the lookbook treatment
- Do not use display serifs, script fonts, or decorative typefaces for headings — the whisper-weight regular Favorit at 30px is the hero voice
- Do not add gradient backgrounds, colored section bands, or decorative patterns to page sections — alternation should be subtle (#e5e7eb, #f0efe7, #f5ebd5) at most
- Do not add icon containers, badges, or pill shapes around UI elements — tags and labels should be plain text with optional hairline underlines
- Do not use large border-radius values (8px+) on any element — the entire system is anchored to 0px and 4px radii only

## Elevation

The design system deliberately avoids shadows and elevation as a defining choice. Separation between elements is achieved through whitespace, hairline 1px borders in #000000 or #333333, and subtle surface color alternation (#e5e7eb, #f0efe7, #f5ebd5) rather than z-axis depth. The only floating element — the chat widget — uses a solid black fill rather than a shadow to stand out. This flatness reinforces the editorial print-magazine metaphor: pages sit on the surface of the screen the way photographs sit on paper.

## Surfaces

- **Paper White** (`#ffffff`) — Primary page canvas and product card background
- **Soft Mist** (`#e5e7eb`) — Alternate section background for visual banding
- **Warm Fog** (`#f0efe7`) — Off-white editorial section background
- **Blush Sand** (`#f5ebd5`) — Warm cream editorial highlight sections
- **Pale Tide** (`#badce4`) — Cool pastel editorial accent band

## Imagery

Photography-dominant visual language centered on full-bleed lifestyle imagery of models in activewear. Treatment is editorial rather than commercial: models captured in candid motion (stretching, walking, mid-stride) rather than static studio poses. Color treatment is natural and unfiltered — garment colors are true-to-life without duotone or color grading. Images have zero border-radius and are not masked — raw rectangular crops that fill their containers edge-to-edge. The hero uses a wide aspect ratio (~16:6) with no overlay graphics, letting the photograph itself carry the visual weight. Product card images are clean studio shots on neutral backgrounds, tightly cropped to the garment. The overall density is image-heavy on editorial sections and grid-heavy on product listings, with text always subordinate to imagery. No illustrations, no 3D renders, no abstract graphics — photography is the only visual medium.

## Layout

Full-bleed page model with content constrained to ~1440px max-width on desktop. The hero is a full-viewport-width image with centered headline overlay and ghost CTA. Below the hero, the page alternates between product grid sections (4-column desktop grid) and editorial split-image blocks (two equal-width lifestyle photos). Navigation is a minimal top bar with a black announcement strip above it — no sticky header behavior apparent, no sidebar, no mega-menu. Category browsing uses simple horizontal tab filters above product grids rather than a full category page. The rhythm is spacious: 64px+ vertical gaps between major sections, compact 8-16px spacing within product cards. Grid usage is consistent 4-column for products, 2-column for editorial features, single-column for category navigation. No masonry, no asymmetric layouts — everything is rigidly grid-aligned to reinforce the catalog/lookbook structure.

## Similar Brands

- **Aritzia** — Similar gallery-like product presentation with minimal UI chrome, photography-first editorial layouts, and compact sans-serif typography with generous whitespace
- **Gymshark** — Same activewear category with clean product grids, ghost/outline CTA buttons, and monochrome UI that lets product photography provide all color
- **Reformation** — Editorial fashion site with full-bleed lifestyle photography, minimal navigation, custom sans-serif typography, and an almost zero-shadow flat interface
- **COS** — Minimalist fashion brand with restrained UI, generous whitespace between sections, hairline borders instead of shadows, and near-monochrome palette that lets garment colors stand alone
- **Everlane** — Clean e-commerce with product-grid-first layout, transparent/outlined action buttons, compact spacing, and a deliberate absence of decorative UI elements
