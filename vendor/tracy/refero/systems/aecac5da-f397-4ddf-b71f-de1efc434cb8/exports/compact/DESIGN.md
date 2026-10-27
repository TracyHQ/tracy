# Apple — Style Reference
> white room with a single blue switch.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Apple's design language is a study in restraint: near-white canvas, generous breathing room, and one vivid blue accent that makes every action feel deliberate. Typography is the primary voice — SF Pro set with negative tracking that tightens as size grows, giving headlines architectural clarity without weight. The product IS the design: large product photography and lifestyle imagery dominate, while chrome recedes into thin borders, ghost navigation, and hairline rules. Sections alternate on a light gray canvas with full-bleed color washes for promotional blocks, creating rhythm through scale shifts rather than decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Apple Blue | `#0071e3` | Filled action buttons, selected states — the only chromatic interactive color, used sparingly so each appearance carries weight |
| Link Blue | `#0066cc` | Outlined action borders, inline links — deeper saturation than Apple Blue, used where a filled pill would be too loud |
| Signal Blue | `#2997ff` | Decorative borders, image outlines, icon strokes — the lightest blue in the system, used for atmospheric emphasis rather than interaction |
| Carbon | `#1d1d1f` | Primary text, heading borders, nav rules, card borders — the dominant ink color, near-black with a whisper of warmth |
| Frost | `#f5f5f7` | Page canvas, body backgrounds, footer surface — the signature Apple light gray, slightly cooler than pure white |
| Ice | `#f4f8fb` | Elevated surface washes, subtle fills, button text on dark backgrounds — barely-blue tint that lifts a section without declaring it |
| Smoke | `#333333` | Secondary text, nav fills, button borders — the workhorse neutral for borders and icons that need more presence than mid-gray |
| Graphite | `#474747` | Nav text, nav borders, link borders — sits between Carbon and Smoke for tertiary hierarchy |
| Ash | `#707070` | Footer text, list borders, nav borders, muted body text — the mid-gray for content that should be present but quiet |
| Mist | `#858585` | Body borders, icon strokes, button borders — the lightest functional gray, for hairline rules on light surfaces |
| Onyx | `#000000` | Heading borders, nav borders, dark image backgrounds — true black for maximum contrast in promotional and heading contexts |
| Pebble | `#e2e2e5` | Button background fills, disabled surfaces — the only near-white surface that is deliberately grayer than the canvas |

## Typography

### SF Pro Display — Display headlines and large feature text — sizes 40px+ use the display cut for tighter aperture and stronger negative tracking; 700 reserved for promotional lockups, 400 for editorial product names
- **Substitute:** Inter, system-ui
- **Weights:** 400, 600, 700
- **Sizes:** 21px, 28px, 40px, 56px
- **Line height:** 1.07, 1.10, 1.14, 1.19
- **Letter spacing:** -0.005em at 21px, 0.007em at 28px, 0.011em at 40px+
- **OpenType features:** `"numr"`

### SF Pro Text — Body, navigation, buttons, subheads — the working typeface; 400 for body copy, 300 for subheads and refined labels, 600 for nav items and button text; negative tracking tightens proportionally with size (-0.022em at 12px down to -0.01em at 44px)
- **Substitute:** Inter, system-ui
- **Weights:** 300, 400, 600
- **Sizes:** 12px, 14px, 17px, 18px, 24px, 26px, 34px, 44px
- **Line height:** 1.18, 1.24, 1.29, 1.33, 1.47, 1.50, 2.12, 2.41
- **Letter spacing:** -0.022em at 12px, -0.016em at 17px, -0.011em at 24px, -0.01em at 44px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.264px |
| body-sm | — | — | 14px | 1.29 | -0.224px |
| body | — | — | 17px | 1.47 | -0.272px |
| subheading | — | — | 21px | 1.24 | -0.105px |
| heading-sm | — | — | 28px | 1.18 | 0.196px |
| heading | — | — | 40px | 1.14 | 0.44px |
| heading-lg | — | — | 44px | 1.18 | -0.44px |
| display | — | — | 56px | 1.07 | 0.616px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 980px
- **cards:** 8px
- **images:** 8px
- **inputs:** 8px
- **buttons:** 980px

## Components

### Filled Pill Button
**Role:** Primary action — Buy, Learn more, Shop

980px border-radius, #0071e3 background, white (#f4f8fb) text at 17px weight 400, padding 11px 15px, no border, no shadow. The single filled interactive element in the system.

### Outlined Pill Button
**Role:** Secondary action — pair with filled primary

980px border-radius, 1px solid #0066cc border, #0066cc text at 17px weight 400, transparent fill, padding 11px 15px. Used as the second action next to a filled blue button.

### Ghost Link
**Role:** Tertiary action or inline text link

No background, no border, #0066cc text at inherit size, underline on hover only. Weight 400, same family as body.

### Global Nav Bar
**Role:** Top-level site navigation

Full-width, #1d1d1f or white background, 8px vertical padding, horizontal links at 12px weight 400 in #1d1d1f or #f5f5f7. Apple logo on left, product categories centered, search and bag icons on right. 1px hairline bottom border in #1d1d1f or #333.

### Sticky Mini-Nav
**Role:** Product page sub-navigation that pins below global nav

White background, product name in 21px weight 600 + colored wordmark, action links at 14px weight 400. 1px bottom border in #d2d2d7.

### Product Hero Section
**Role:** Full-bleed product showcase

#f5f5f7 background, centered product name at 56px weight 600 in #1d1d1f, tagline at 26px weight 300, two action buttons centered below. Large product render fills the section with generous bottom padding.

### Feature Banner
**Role:** Full-bleed promotional or service content

Full-width photographic or color-washed background, overlay text and CTA. Can be dark with white text, or a pastel wash with dark text. No card surface — the image IS the surface.

### Service Card Grid
**Role:** Multi-service promotional row (Apple TV+, Fitness+, Music, Arcade)

Horizontal scroll or grid of cards, each full-bleed photographic background, 8px radius, white text overlay. Card title 24-28px weight 600, genre label in 12-14px, pill action button (Listen now, Play now, Watch now) at bottom.

### Typography-Only CTA Block
**Role:** Compact product call-out within a section

Centered stack: product name at 40-56px weight 600, one-line descriptor at 21px weight 300, optional italic product variant (e.g. 'iPad air') at 28px in #2997ff. Two pill buttons below, generous vertical breathing room.

### Footer
**Role:** Site-wide legal and link directory

#f5f5f7 or #1d1d1f background, multi-column link grid at 12px weight 400 in #707070 or #f5f5f7, 1px hairline dividers in #333 or #d2d2d7, fine print at 12px. No card surfaces — flat, typographic, structural.

### Form Input
**Role:** Search, email capture, configuration inputs

8px radius, 1px border in #d2d2d7 or #707070, 14-17px text, #f5f5f7 fill. Focus ring in #0071e3 at 2px.

## Do's and Don'ts

### Do
- Use #0071e3 only for filled action buttons and selected/active states — one color, one job.
- Pair every filled blue button with an outlined blue secondary action, never stack two filled buttons.
- Set body text at 17px with -0.016em letter-spacing — the negative tracking is what makes Apple type feel precise, not the size alone.
- Let product photography fill the full viewport width — never constrain hero images to a max-width container.
- Use 980px border-radius for every interactive button, tag, and pill — the fully rounded shape is non-negotiable.
- Set section backgrounds to full-bleed #f5f5f7 or a single product color wash — never use card containers inside a section.
- Weight 300 for subheads and editorial descriptors creates the signature Apple whisper-voice — 400 is for body, 600 is for nav.

### Don't
- Never use #0071e3 for text, borders, or decoration — it is exclusively a button fill color.
- Never add drop shadows to cards, buttons, or nav — the system uses hairline borders and surface shifts, not elevation.
- Never set headlines at 700 weight for product names — 600 is the maximum; 700 only appears in editorial lockups or promotional art.
- Never use a card or panel inside a #f5f5f7 section — the canvas itself is the surface; containers break the spatial logic.
- Never constrain the main content to a narrow column — Apple pages breathe at 100% width with internal max-widths only for text-heavy blocks.
- Never use radius below 980px for buttons or above 8px for cards/images — these are the only two radius values in the system.
- Never mix the three blues in one interactive element — #0071e3 is fill, #0066cc is outlined action, #2997ff is decorative.

## Surfaces

- **Canvas** (`#f5f5f7`) — Page background, section default
- **Elevated Wash** (`#f4f8fb`) — Light blue-tinted section background for featured products
- **Pebble** (`#e2e2e5`) — Button fills, disabled states, surface differentiation

## Imagery

Photography is the dominant visual language. Product shots are rendered on pure white or soft gray backgrounds with no environmental context — the device IS the hero, isolated and lit. Lifestyle photography appears in feature banners at full-bleed width, often with subjects cropped tightly. Color washes (pastel blue, pink, green) serve as section backgrounds for product highlights, not as decoration. Iconography is minimal and line-based, weight 1-2px, in the same gray scale as text. No illustrations, no abstract graphics, no 3D renders beyond the product photography itself.

## Layout

Full-bleed page model with no fixed max-width container — sections stretch edge-to-edge while text blocks center internally at roughly 980px. Navigation is a single sticky global bar with a secondary product-specific sub-nav that appears on scroll. Hero pattern is always centered: large product name, one-line tagline, two pill buttons, then the product render filling the remaining viewport. Sections stack vertically with generous vertical rhythm (64px+ between sections), alternating between #f5f5f7 and color-wash backgrounds. The lower page is a single horizontal row of full-bleed service cards (Apple TV+, Fitness+, Music, Arcade), each a photographic tile with overlaid text and a pill action. No sidebars, no multi-column content layouts, no asymmetric compositions — everything is centered, stacked, and symmetrical.

## Similar Brands

- **Bang & Olufsen** — Same product-as-hero isolation photography on white canvas, same generous whitespace, same whisper-thin typography for product names
- **Teenage Engineering** — Same near-monochrome product pages with generous spacing, though TE adds more personality through type and color accents
- **Nothing (tech)** — Similar minimal product showcase layout, though Nothing uses more dot-matrix texture and dark surfaces
- **Dyson** — Same centered product hero with large render, minimal copy, and paired pill action buttons on a light gray canvas
