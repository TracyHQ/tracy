# Basic.Space — Style Reference
> curated gallery on white marble

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Basic.Space is a curated gallery-commerce platform built on near-total achromatic restraint. White gallery walls, 2px-sharp product frames, and one electric blue (#0700ff) that appears only on the top announcement strip — a single chromatic interruption in an otherwise monochrome world. Typography is a custom geometric humanist (FTBasicSpace) used in three restrained weights, with tight negative letter-spacing that gives headlines a quietly confident voice. Components are gallery-light: pill-shaped controls, hairline #ebebeb dividers, no shadows, no rounded card corners. Layout is full-bleed horizontally-scrolling rails of product cards, evoking the experience of walking through a design museum where the objects are the heroes and the interface disappears.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Cobalt | `#0700ff` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Gallery Black | `#000000` | Primary text, product titles, prices, navigation links, icon strokes, and dominant fill on collection overlay labels |
| Paper White | `#ffffff` | Card surfaces, product image backgrounds, and inverse text on dark imagery and the cobalt announcement bar |
| Hairline Gray | `#ebebeb` | Primary border color, page canvas background, card dividers, list separators, input field backgrounds — the dominant structural neutral |
| Fog Gray | `#cecccc` | Secondary surface for elevated sections and secondary borders, providing one subtle step above the dominant #ebebeb |
| Chalk White | `#f7f7f7` | Soft background wash for alternating sections and subtle card lift without shadows |
| Ash Gray | `#b5b5b5` | Muted helper text, disabled icon fills, and secondary metadata |

## Typography

### FTBasicSpace — Single custom typeface used across all surfaces — UI chrome, product metadata, and section headlines. The 500/600 weights are reserved for product titles and brand labels (WAKA WAKA, RARIFY, PROSA), while 400 carries navigation, prices, and body. The signature is the tight negative tracking (-0.0220em at display sizes) which compresses the letterforms into a dense, almost monolinear rhythm — unlike typical e-commerce type that opens up, this tightens.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 18, 20, 38, 39, 40
- **Line height:** 1.12–1.71
- **Letter spacing:** -0.0220em at display sizes (38–40px), -0.0100em at body sizes (14–18px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.38 | -0.14px |
| body-sm | — | — | 16px | 1.43 | -0.16px |
| body | — | — | 18px | 1.22 | -0.18px |
| subheading | — | — | 20px | 1.2 | -0.2px |
| heading-sm | — | — | 38px | 1.13 | -0.836px |
| display | — | — | 40px | 1.12 | -0.88px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 48px
- **Card padding:** 0px
- **Element gap:** 4px

### Border Radius

- **cards:** 2px
- **images:** 2px
- **inputs:** 16px
- **buttons:** 9999px

## Components

### Cobalt Announcement Bar
**Role:** Top-of-page promotional strip

Full-bleed #0700ff background, 100% page width, approximately 32px tall. White (#ffffff) text centered at 14px weight 400. The sole chromatic element in the entire design system — acts as a deliberate visual interruption above an achromatic world.

### Primary Navigation Bar
**Role:** Site-wide horizontal navigation

White (#ffffff) background, no shadow, no border-bottom. Left: wordmark 'Basic.Space' in 16px weight 500 #000000. Center-left: text-only category links (All, Design, Art, Womens, Mens, Basic.Space LA) in 14px weight 400 #000000, separated by consistent 24px gaps, with subtle section dividers between groups. Right: search input, 'Account', and 'Cart' as text links. No backgrounds, no borders on nav items — the typographic hierarchy alone provides structure.

### Pill Button (Primary)
**Role:** Call-to-action and navigation controls

9999px border-radius (fully pill-shaped). 8px vertical / 16px horizontal padding. Background #000000 with #ffffff text at 14px weight 500. No border, no shadow. Used for 'Shop' CTA and app download prompts. The pill shape is the signature — no sharp-cornered buttons exist in the system.

### Pill Button (Ghost)
**Role:** Secondary actions and text-level controls

9999px border-radius, transparent background, 1px solid #ebebeb border, #000000 text at 14px weight 400. Used for arrow navigation controls (← →) in section headers.

### Product Card
**Role:** Individual product listing in horizontal scroll rails

Zero card padding, zero border, zero shadow. Structure: 2px-radius product image filling the card width on a #ffffff background, followed by 12px gap, then product title (16px weight 500 #000000, truncated to 2 lines), price (14px weight 400 #000000), and brand label in uppercase 12px weight 500 #000000 with 8px letter-spacing. The image itself carries the 2px corner radius — the card has no container chrome at all.

### Section Header
**Role:** Subsection title with carousel controls

Left-aligned title in 20px weight 500 #000000 with an external-link arrow icon. Right-aligned ghost pill buttons (← →) for horizontal rail navigation. 48px vertical margin above and below the section content rail.

### Horizontal Product Rail
**Role:** Scrollable product collection display

Full-viewport-width horizontal scroll container. Cards arranged in a single row with 4px gap between cards. No visible scrollbar — navigation via the ghost pill arrows. Each card is approximately 180–220px wide. The rail extends beyond the viewport edge, creating the gallery-continuous-scroll effect.

### Hero Collection Banner
**Role:** Full-bleed lifestyle image for featured collection

Full-viewport-width image, approximately 60vh tall. Bottom-left overlay contains: date label in 14px weight 400 white with 80% opacity, then large collection title in 38–40px weight 500 #ffffff. Bottom-right contains a white pill button ('Shop') with 9999px radius and black text. No gradient overlay — text sits directly on the image.

### Collection Category Card
**Role:** Large featured collection tile

Full-bleed image, approximately 400px tall. Centered overlay with two text lines: small uppercase category label (14px weight 500 #ffffff, letter-spacing 0.08em) above a large collection title (38px weight 500 #ffffff). No background scrim, no border. Arranged in a 3-column grid with no gaps between cards (seamless).

### Search Input
**Role:** Site search field in navigation

16px border-radius, 80px right/left padding (from icon), no visible border. Icon (magnifying glass) at left in #b5b5b5. Placeholder text 'Search' in 14px weight 400 #b5b5b5. Appears flush within the nav bar — no container chrome distinguishes it from the nav links.

### Product Image Thumbnail
**Role:** Primary product photography

Square or 4:5 aspect ratio, 2px border-radius, #ffffff background (the image canvas). No border, no shadow, no padding. Photography is studio-shot on pure white — the object IS the image, no lifestyle context.

### Brand Label (Metadata)
**Role:** Designer/maker attribution on product cards

Uppercase, 12px weight 500, #000000, 8px letter-spacing. Appears below price. The uppercase tracked treatment distinguishes it from the sentence-case product title, creating a two-tier metadata hierarchy.

## Do's and Don'ts

### Do
- Use 9999px border-radius for all interactive controls — buttons, tags, icon containers. The pill shape is non-negotiable; sharp-cornered buttons break the gallery-curator language.
- Set card and image border-radius to 2px. This near-sharp radius reads as 'gallery mount' rather than 'app card' — it should feel like a print pinned to a wall.
- Use only #ebebeb for dividers and borders. Never use shadows to separate elements — separation comes from hairline 1px borders and surface tone shifts.
- Restrict the electric cobalt #0700ff to the top announcement bar only. It is the single chromatic accent in the entire system; diluting it across buttons or links destroys its interruptive power.
- Apply -0.0220em letter-spacing at display sizes (38–40px) and -0.0100em at body sizes. The tight tracking is what makes headlines feel curated rather than generic.
- Let product images fill their containers edge-to-edge with 2px corners. Never wrap product photos in padded containers or apply drop shadows.
- Use full-bleed horizontally-scrolling rails for product collections. The continuous-scroll gallery experience is core to the site's museum-walk rhythm.

### Don't
- Don't introduce any color other than the cobalt announcement bar into the interface. Greens, warm tones, pastels — all break the gallery-white-wall discipline.
- Don't use box-shadows on cards, buttons, or images. Depth is expressed through surface tone differences (#ebebeb canvas vs #ffffff cards), never through elevation.
- Don't use rounded corners above 2px on cards or images. The contrast between 9999px pill buttons and 2px sharp cards is the signature geometry.
- Don't use more than two font weights per visual element. The hierarchy is weight + case + tracking, not weight + size + color + decoration.
- Don't place text on colored backgrounds other than the announcement bar's cobalt or full-bleed photography. All UI text sits on #ebebeb, #ffffff, or #f7f7f7.
- Don't add padding inside product card containers. Cards are zero-chrome — the image and text stack with only 12px internal gap, no bordered container.
- Don't use icons with fills or multi-color treatments. Icons are single-weight line glyphs in #000000 or #b5b5b5 only.

## Elevation

The design uses zero shadows as a deliberate philosophy. All depth and hierarchy are achieved through flat surface tone differences (#ebebeb canvas, #ffffff cards) and hairline #ebebeb borders. This produces the gallery-wall effect where objects sit directly on their surface without artificial lift, reinforcing the curatorial, museum-object sensibility.

## Surfaces

- **Canvas** (`#ebebeb`) — Default page background, creating a soft warm-gray gallery wall behind white product cards
- **Card** (`#ffffff`) — Product image and content card surface — the bright white object against the gray wall
- **Soft Lift** (`#f7f7f7`) — Subtle background for nested sections and quiet visual separation without elevation
- **Divider** (`#cecccc`) — Heavier neutral used for section boundaries and secondary structural elements

## Imagery

Product photography is the dominant visual element. All product shots are studio-captured on pure white or contextual neutral environments — the object fills the frame with no lifestyle staging, no models, no environmental context. The product IS the hero. Hero banners and collection tiles use editorial lifestyle photography (warm interior scenes, art gallery shots) that creates mood and aspiration, contrasting with the clinical product cards. Photography is full-bleed and edge-to-edge with 2px corner radius. No illustrations, no 3D renders, no abstract graphics. Icons are line-weight single-color glyphs, never filled or multicolor. Image density is high: a typical viewport contains 6+ product images or one full-bleed hero — the interface is image-led, text-secondary.

## Layout

The page is full-bleed with no max-width container. The dominant pattern is horizontally-scrolling rails of product cards (6+ visible per row) that extend beyond the viewport, navigated by ghost pill arrow controls. The hero section is a full-viewport-width lifestyle image with overlaid text. Section rhythm: announcement bar → nav → product rail ('For You') → full-bleed hero banner → 3-column collection grid → additional product rails. Vertical gaps between sections are 48–72px. The grid system is implicit — cards size to viewport width with a consistent 4px gap, creating flexible column counts (5–8 cards visible depending on viewport). Navigation is a flat horizontal bar, not sticky on scroll, with no logo-background distinction. The overall feeling is museum-continuous: the eye scrolls horizontally through curated objects, then vertically to the next gallery room.

## Similar Brands

- **SSENSE** — Same achromatic e-commerce gallery approach with full-bleed editorial imagery, near-zero card chrome, and tight typographic restraint
- **The Citizenry** — Curated home goods marketplace using white-on-warm-gray surfaces, product-first photography, and minimal type hierarchy
- **Muji** — Same museum-object sensibility — products photographed on pure white, no decorative chrome, typographic labels as the only metadata
- **Areaware** — Design-object retailer with gallery-wall product presentation, single-column metadata, and 2px-sharp image edges
- **Goodreads (product rails)** — Same horizontally-scrolling collection rails with arrow-controlled navigation and zero card container chrome
