# bella Kitchen Appliances — Style Reference
> Sunlit kitchen counter at golden hour — warm cream surfaces with a single pop of coral.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

bella is a warm, domestic kitchen-counter aesthetic built on a cream-and-coral palette that feels sunlit rather than clinical. The entire interface rests on a warm off-white canvas (#ebeadf) with slightly warmer beige cards (#d5cec0) and white surfaces floating above — layers are defined by hue temperature, not stark contrast. A single saturated coral accent (#f04923) provides all the energy: bestseller tags, promotional cards, price highlights, and active states. Typography uses a geometric sans (Supreme LL TT) with uniformly tight -0.05em tracking at every size, giving headings a compact, modern posture. The design avoids shadows in favor of color-temperature layering and 12px rounded corners; buttons and badges are full pills (999px). The overall feel is approachable, appetite-driven, and product-forward — photography does the heavy atmospheric lifting while the UI stays minimal and warm.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Canvas | `#ebeadf` | Page background — the foundational warm off-white that gives the whole interface its sunlit, lived-in feel |
| Pristine Surface | `#ffffff` | Elevated card surfaces, navigation bar, product card backgrounds, pill button fills |
| Sand Beige | `#d5cec0` | Secondary card surfaces and warm-toned background panels for product grouping and featured sections |
| Ink Black | `#000000` | Primary text, icon strokes, hairline borders, and the brand wordmark — defines the entire typographic system |
| Coral Pulse | `#f04923` | Bestseller badges, promotional card backgrounds, price callouts, and active accents — the singular warm energy that breaks the cream monochrome |

## Typography

### Supreme LL TT — Primary brand typeface used for all UI text, headings, navigation, buttons, and product labels — geometric sans with uniformly tight -0.05em tracking gives the type a compact, modern rhythm; weight 400 handles body and most labels while weight 700 drives headings and product names
- **Substitute:** Inter, DM Sans, or General Sans
- **Weights:** 400, 700
- **Sizes:** 13, 14, 16, 18, 22, 24, 40
- **Line height:** 1.0–1.83
- **Letter spacing:** -0.05em uniformly across all sizes
- **OpenType features:** `"ss01" on, "cv11" on`

### Times — Fallback or system-rendered text where Supreme LL TT is unavailable
- **Substitute:** Times New Roman, Liberation Serif
- **Weights:** 400, 700
- **Sizes:** 16, 32
- **Line height:** 1.0

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | -0.65px |
| body | — | — | 16px | 1.5 | -0.8px |
| subheading | — | — | 18px | 1.4 | -0.9px |
| heading-sm | — | — | 22px | 1.4 | -1.1px |
| heading | — | — | 24px | 1.4 | -1.2px |
| display | — | — | 40px | 1.1 | -2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 999px
- **cards:** 12px
- **badges:** 999px
- **buttons:** 999px

## Components

### Top Navigation Bar
**Role:** Primary site header with brand mark, category links, and search

White (#ffffff) background, full-width, 12px corner radius on the container, ~64px height. 'bella' wordmark in black Supreme LL TT 700 at ~16px on the left. Centered nav links (Shop, bella, bella PRO, Recipes, News, Made Better) in 16px Supreme LL TT 400 black. Search icon on the far right. Sits inside a rounded white card that floats on the warm canvas with ~16px gap from viewport edges.

### Product Card
**Role:** Grid item for product listings with image, label, and price

White (#ffffff) background, 12px border radius, 24px internal padding. Product image centered at top (transparent PNG on white, no frame). Product name in 16px Supreme LL TT 700 black below image. 'Bestseller' coral label above name when applicable. Price in 14px Supreme LL TT 400 black below name. Generous vertical rhythm — ~32px between image and text.

### Bestseller Badge
**Role:** Promotional label indicating top-selling products

Pill-shaped (999px radius), coral (#f04923) background, white text, 12px vertical / 20px horizontal padding. Text in 12–13px Supreme LL TT 700, uppercase or mixed-case tracking. Sits at the top-left of the product image or card.

### Pill Button
**Role:** Primary action button for shop, learn more, and navigation CTAs

Full pill (999px radius), 12px vertical / 24px horizontal padding. Filled white variant: #ffffff background, 1px black border, 14px Supreme LL TT 700 black text. Outlined ghost variant: transparent background, 1px black border. Text vertically centered. Width auto-sizes to content with ~16px min-height.

### Featured Product Card
**Role:** Promotional sidebar card in the hero highlighting a best-selling product

Full coral (#f04923) background, 12px border radius, 24px padding. Bestseller badge (white pill) at top-left. Headline in 22–24px Supreme LL TT 700 white, 2 lines max. Product image centered below headline. White pill CTA button at the bottom edge — provides a strong color-to-white contrast as the final action.

### Hero Banner
**Role:** Full-bleed hero introducing the brand campaign

Full-width split layout: left ~65% is a photographic sky-blue background with cloud imagery (content, not UI color), right ~35% is a Featured Product Card. Headline 'Fits-anywhere™ kitchenware' in ~40px Supreme LL TT 700 white over the sky image. A product (toaster) floats in the hero with red balloons for whimsy. Hero card has 12px border radius and sits inset from viewport edges.

### Lifestyle Scene Section
**Role:** Full-bleed editorial section with text overlay on a warm kitchen photograph

Full-width photographic image (warm kitchen scene) with a semi-transparent or white centered text card overlaid. Text card: white or warm cream background, 12px radius, 24px padding. Heading in 24px Supreme LL TT 700 black. Subtitle in 16px Supreme LL TT 400 black. Centered horizontally, positioned in the upper-middle of the image.

### Product Grid Section
**Role:** Four-column product showcase for space-saving essentials

Warm canvas (#ebeadf) background. Section heading at ~24–40px Supreme LL TT 700 black, centered. 4-column grid with 24px gaps, each column containing a Product Card. Grid is centered within ~1200px max-width container.

### Inspiration Feature Card
**Role:** Promotional card with a light blue background and CTA for recipe/inspiration content

Light periwinkle blue background (soft secondary accent, ~#b8c5e8), 12px border radius, 24px padding. Small eyebrow text in 12px Supreme LL TT 400. Headline 'Get inspired' in 24px Supreme LL TT 700. Product image (air fryer) on the right. White pill 'Learn more' button at bottom with black text.

### Category Link
**Role:** Inline navigation link used in the top nav and footer

16px Supreme LL TT 400 black text. No underline by default. A small downward chevron (‹) may accompany category links with sub-menus. Active or hover state could shift weight to 700 or add a coral underline.

### Price Display
**Role:** Product price label under each product name

14px Supreme LL TT 400 black text, prefixed with '$' (e.g. '$59.99'). Centered or left-aligned depending on card layout. Optional strikethrough variant for sale prices in lighter weight with coral accent on the sale price.

## Do's and Don'ts

### Do
- Use #ebeadf as the page background for all non-card areas — the warm cream is the canvas that makes white cards and coral accents feel intentional
- Use #f04923 exclusively as a functional accent: bestseller badges, promotional card backgrounds, and active price highlights — never as a large background fill for primary content
- Use Supreme LL TT with -0.05em letter-spacing at every size — the tight tracking is non-negotiable for brand consistency
- Use 999px border-radius for all buttons, badges, and tags — pill shapes are the button language
- Use 12px border-radius for all cards and image containers — this is the universal surface radius
- Use 24px internal padding for all card content — keep product cards, feature cards, and promotional cards consistent
- Stack three surface levels for depth: warm canvas (#ebeadf) → sand beige (#d5cec0) → pristine white (#ffffff) — define elevation by hue temperature, never by drop shadow

### Don't
- Do not use stark white (#ffffff) as the page background — the warm cream canvas is what gives bella its domestic, sunlit character
- Do not add drop shadows to cards — bella uses color-temperature layering (canvas → beige → white) instead of shadow elevation
- Do not use multiple accent colors — coral (#f04923) is the only chromatic accent; introducing a second brand color dilutes the warm domestic identity
- Do not use blue as a UI color — the sky blue in the hero is photographic content, not a design token
- Do not use serif fonts for UI — Supreme LL TT (or its geometric sans substitute) is the only acceptable typeface for all interface text
- Do not use sharp corners (0px radius) on cards or containers — every surface should have at least 12px radius for softness
- Do not center-justify body text or use long line lengths — keep product descriptions and body copy left-aligned with max 60ch width

## Surfaces

- **Warm Canvas** (`#ebeadf`) — Base page background — the warm off-white foundation
- **Sand Beige** (`#d5cec0`) — Secondary product grouping panels and warm-toned card backgrounds
- **Pristine Surface** (`#ffffff`) — Elevated product cards, navigation, and white pill buttons

## Imagery

Photography is the dominant visual language and carries all atmospheric weight. Product shots are clean cut-outs on white or cream backgrounds — the object is the hero, no lifestyle context. The hero image is a surreal, aspirational sky scene (blue sky with clouds, red balloons lifting a toaster) that communicates freedom and lightness. Lifestyle scenes use warm, lived-in kitchen photography with natural wood, tile, plants, and ceramics to evoke a real domestic space. Imagery fills sections full-bleed with text overlaid in white or cream cards. No illustrations, no icons beyond functional UI — the photographic product IS the visual identity. Color treatment is natural and warm, not desaturated or filtered. Image-heavy at the section level but text-dominant within cards and navigation.

## Layout

The page is max-width 1200px centered with ~16px outer padding creating a floating-card feel on the warm canvas. Navigation is a full-width white pill bar at the top. The hero is a split layout: ~65% photographic sky background with overlaid headline and floating product, ~35% coral promotional card. Sections alternate between full-bleed photographic blocks and cream-canvas product grids. Product grids are 4-column on desktop with 24px gaps. Content arrangement alternates between centered text stacks (for section headers) and asymmetric hero splits. The overall rhythm is: full-bleed image hero → centered lifestyle section with text overlay → 4-column product grid → split image+card inspiration section. Generous vertical spacing (~80px) between sections creates a comfortable, breathable pace. Navigation is a minimal top bar with centered links.

## Similar Brands

- **Our Place** — Same warm cream-canvas aesthetic with a single warm accent color (terracotta/coral), pill-shaped buttons, and product-forward photography on neutral backgrounds
- **Caraway** — Domestic kitchen brand using warm off-white surfaces, minimal sans-serif typography, and lifestyle photography with natural wood and ceramic textures
- **Muji** — Restrained warm-neutral palette with a single accent, generous whitespace, and product photography that lets the object be the hero against a cream backdrop
- **Great Jones** — Playful kitchen brand with warm beige backgrounds, bold display type, and a single vivid accent color used for promotional moments and badges
