# DJI — Style Reference
> aerospace black canvas with a single electric blue thrust

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

DJI presents its products like aviation reveal footage: the hero is a near-black void where the device emerges from shadow, then the rest of the site opens into a clean, light-gray editorial grid of product cards. The palette is deliberately restrained — nearly monochromatic — with one vivid blue (#0070d5) that does the work of brand recognition, active state, and the one persistent call to action. Typography is Open Sans in a wide weight range (300–600) with tight negative tracking on display sizes, giving headlines a engineered, technical feel without serif warmth. Components are minimal: pill-shaped buttons at 64px radius, flat product cards with no decorative borders, ghost links with chevrons, and an almost shadowless surface system that lets the product photography carry all visual weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Onyx | `#000000` | Primary text, icons, dark hero backgrounds, footer — the dominant ink color across all UI |
| Paper | `#ffffff` | Card surfaces, nav bar, product detail panels, input fields — the lightest surface in the stack |
| Fog | `#ededed` | Page canvas behind card grids and product sections — slightly cool, lower than pure white so product imagery pops |
| Slate | `#6c7073` | Muted helper text, disabled states, secondary button borders, input placeholder |
| Graphite | `#595959` | Body copy, secondary nav text, descriptions — the workhorse text gray that sits between headlines and helper text |
| Iron | `#303233` | Primary nav item text, section headings on light backgrounds — darker than body to anchor hierarchy |
| Ash | `#8c8c8c` | Tertiary captions, meta text, fine print |
| Carbon | `#272727` | Footer background, dark panels — deep neutral for terminal/closing sections |
| Signal Blue | `#0070d5` | Blue supporting accent for decorative details and low-frequency emphasis. |
| Indigo Steel | `#3b63a9` | Secondary link state, hover or visited variant of Signal Blue — a muted counterpart that reads as the same brand without competing for attention |

## Typography

### Open Sans — Primary UI and content typeface across nav, body, headings, and buttons — chosen for its technical/neutral humanist character that pairs well with hardware product imagery; weight 300 on large display sizes with -0.03em tracking creates an engineered, almost aerospace-instrument feel
- **Substitute:** Inter, Source Sans 3, Noto Sans
- **Weights:** 300, 400, 500, 600
- **Sizes:** 12, 14, 16, 18, 20, 24, 32, 40
- **Line height:** 1.20, 1.33, 1.43, 1.50, 2.00
- **Letter spacing:** -0.03em at 40px, -0.02em at 24–32px, normal at 12–18px

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.43 | -0.02px |
| heading-sm | — | — | 24px | 1.33 | -0.02px |
| heading | — | — | 32px | 1.25 | -0.02px |
| display | — | — | 40px | 1.2 | -0.03px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 4px
- **tags:** 99px
- **cards:** 4px
- **inputs:** 4px
- **buttons:** 64px

## Components

### Hero Product Stage
**Role:** Full-bleed dark section introducing a new product

Black (#000000) background filling the viewport, centered display headline in white at 40px/300 weight with -0.03em tracking, subtext at 16px in #ededed, and a centered product render that emerges from the black with edge lighting. Includes a ghost outlined 'Leer más' button below the copy.

### Tienda Shop Button
**Role:** Persistent primary navigation CTA

Filled pill button with #0070d5 background, white text, 64px border-radius, approximately 8px 24px padding, Open Sans 14px/500. Sits at the right edge of the nav bar and is the only consistently chromatic action element on the site.

### Ghost Read-More Button
**Role:** Secondary text-style action with chevron

Transparent background, 1px solid white border in dark hero contexts (or #303233 in light contexts), 64px radius, white/dark text, chevron glyph after label. Used for 'Leer más', 'Comprar', 'Reservar' — all non-critical navigation actions.

### Product Card
**Role:** Product showcase tile in grid layouts

White (#ffffff) surface on Fog (#ededed) canvas, 4px corner radius, 24px internal padding, centered category label at 12px in Slate, product name at 24px/600 in Iron, short descriptor at 14px in Graphite, and a centered product image below. No border, no shadow — relies on background contrast alone.

### Category Tabs / Nav Items
**Role:** Horizontal navigation in the header

Inline text links in Open Sans 14px/500 in Iron (#303233), separated by 24px horizontal gap, 4px bottom padding with active indicator line. No background fills — active state shown by weight shift to 600 or color shift to Signal Blue.

### Language Selector
**Role:** Region/language picker in nav

Pill-shaped ghost control with globe icon and 'España' label, #303233 text, 1px border, 99px radius, 4px 12px padding.

### Full-Bleed Carousel Banner
**Role:** Large promotional image with overlaid headline

Edge-to-edge photographic background (landscape/scene imagery), large white display headline overlaid at 32–40px/300 with -0.02em tracking, ghost outlined 'Leer más' and 'Reservar' buttons beneath. Previous/next chevron controls on the left and right edges.

### Floating Action Buttons
**Role:** Persistent utility controls (support, chat)

Circular white buttons, ~48px diameter, with 1px border in #ededed, positioned fixed to the right edge. Blue accent (#0070d5) applied to the support icon background for the chat variant.

### Top Promo Bar
**Role:** Dismissable announcement strip

Centered single line of body-sm text in Iron on white, 8px vertical padding, with a close (×) icon on the right. Links within the bar use Signal Blue with an inline chevron.

### Footer
**Role:** Terminal site navigation and legal

Carbon (#272727) background, white text at 14px, multi-column link grid, Open Sans 400 for links and 600 for column headings. Generous 48px internal padding.

### Input Field
**Role:** Search and form inputs

White background, 1px border in Slate (#6c7073), 4px corner radius, 12px 16px padding, Open Sans 14px in Iron for value, Graphite for placeholder.

### Icon
**Role:** UI iconography (search, account, cart, support)

Stroke-based line icons at 20px, 1.5px stroke weight, single-color in Iron (#303233) by default, shifting to Signal Blue when interactive. No filled variants.

## Do's and Don'ts

### Do
- Use #0070d5 only for the persistent shop button, active nav indicators, and in-text links — do not introduce additional accent colors
- Use the dark hero pattern (#000000 full-bleed with white display text) for any product reveal or campaign landing
- Apply 64px border-radius to all buttons and tags to maintain the pill geometry that defines DJI's control shape
- Use Open Sans weight 300 with -0.03em letter-spacing for all display sizes 32px and above
- Let the Fog (#ededed) canvas separate white product cards without borders or shadows — do not add card outlines
- Apply 8px vertical spacing as the base element gap, scaling to 16px between card rows and 48px between sections
- Reserve shadow (rgba(0,0,0,0.1) 0px 8–16px 16px) exclusively for the sticky nav and floating overlays

### Don't
- Do not use Signal Blue for body copy, headings, or large background areas — it must remain a small functional accent
- Do not add decorative borders or heavy shadows to product cards — the 4px radius with no border is the signature
- Do not use a chromatic background for full-page sections other than the dark hero and footer
- Do not use serif, display, or decorative typefaces — Open Sans at 300–600 is the only family
- Do not introduce semantic colors (green/red/yellow) for status indicators unless a real product flow requires them
- Do not use sharp 0px or large 16px+ radii on buttons — the 64px pill is non-negotiable for brand consistency
- Do not apply gradients to backgrounds, buttons, or cards — the system is strictly flat

## Elevation

- **Navigation bar (sticky):** `rgba(0, 0, 0, 0.1) 0px 8px 16px 0px`
- **Floating nav elements / overlays:** `rgba(0, 0, 0, 0.1) 0px 16px 16px 0px`

## Surfaces

- **Hero Void** (`#000000`) — Full-bleed dark stage for product reveal — product silhouettes emerge from pure black with edge lighting
- **Page Canvas** (`#ededed`) — Default body background behind grids and content sections
- **Card Surface** (`#ffffff`) — Product cards, detail panels, nav bar — lifted from canvas by brightness alone, not shadow
- **Footer** (`#272727`) — Terminal dark band at the bottom of long pages

## Imagery

Imagery is hero-grade product photography on neutral backgrounds: the hero uses edge-lit device renders emerging from black, while the product grid uses clean three-quarter-angle product shots on white seamless backdrops. Lifestyle and scene photography (snow landscapes, aerial environments) appears in full-bleed carousel banners as aspirational context, not as UI decoration. No illustration, no 3D abstractions, no icon-as-decoration. Icons are minimal 1.5px stroke line icons for nav utility only. The visual language says: the product IS the brand — everything else is a quiet stage.

## Layout

Max-width 1200px centered content lane with full-bleed sections extending beyond. The page rhythm alternates: (1) full-bleed dark hero with centered display copy, (2) 2×2 product card grid on Fog canvas with generous 48px gaps, (3) full-bleed photographic carousel with overlaid headline, (4) 2×2 or 3-column category grid. The sticky nav bar is a single horizontal row with the DJI wordmark left, category links centered, and utility icons + the blue Tienda button right. No sidebar, no mega-menu in the visible flow — navigation is strictly horizontal. Content density shifts from sparse (hero, carousel) to compact (product grid) but never feels cluttered.

## Similar Brands

- **Apple** — Same dark-hero-into-light-grid rhythm and product-as-hero photography style, with a single restrained accent color used sparingly across an otherwise monochrome palette
- **GoPro** — Shares the action-camera product grid pattern with full-bleed lifestyle imagery, neutral canvas, and a single blue interactive accent
- **Garmin** — Comparable product-card density on a cool-gray canvas with pill-shaped buttons and minimal decorative chrome
- **Sony Electronics** — Similar editorial product grid with dramatic dark hero reveals, flat white cards, and a quietly chromatic link/CTA accent
