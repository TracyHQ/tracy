# Peloton — Style Reference
> Red beacon on charcoal runway. A fitness showroom where one electric red CTA cuts through vast dark exhibition space into clean white product galleries.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Peloton runs a disciplined two-mode visual system: cinematic charcoal hero surfaces that make product photography glow, followed by bright white product grids that let the merchandise speak. The palette is almost entirely achromatic — gunmetal, white, and warm grays — with one vivid red accent that acts as the only chromatic punctuation on the page, reserved exclusively for primary actions, brand marks, and the persistent chat widget. Inter carries the entire typographic voice at a wide range of weights, from whisper-light 300 display headlines to confident 500 nav labels, creating a calm, premium fitness-retail atmosphere. Components are generous: 28px pill buttons, 6px inputs, 24px image corners, and minimal elevation — surfaces do the structural work, shadows stay absent or near-invisible.

## Colors

| Name | Value | Role |
|------|-------|------|
| Peloton Red | `#df1c2f` | Red supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Carbon Black | `#181a1d` | Primary text color, dark hero surfaces, navigation bar, footer backgrounds, heading color — the structural anchor of the entire system |
| Pure White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Mist Gray | `#f7f7f7` | Page canvas, subtle section backgrounds behind product grids, alternate band separator |
| Silver Lining | `#e4e6e7` | Hairline borders, dividers between sections, card outlines, disabled surface fills, icon background washes |
| Slate | `#65666a` | Secondary body text, nav link default state, helper text, metadata, breadcrumb separators |
| Graphite | `#000000` | Headings on light surfaces, logo, strong emphasis text, icon strokes on light backgrounds |
| Fog | `#a8acb1` | Tertiary text, placeholder text, subtle icon fills, inactive form labels, decorative icon strokes |
| Steel | `#888b93` | Input borders in default state, secondary borders, subtle structural lines |
| Ash | `#a3a3a6` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |

## Typography

### Inter — Sole typeface across the entire system. Weight 300 at 48px for hero headlines creates an editorial, gallery-like restraint — the opposite of the shouting-bold approach typical of fitness brands. Weight 500–600 for navigation and CTAs gives interaction labels confident authority. Weight 400 carries all body copy. Tighter tracking (-0.008em to -0.004em) at larger sizes sharpens the geometric Inter forms for display use, while the positive +0.025em at 12px opens up micro-labels for legibility.
- **Substitute:** Inter (Google Fonts), or system-ui / -apple-system fallback stack
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 12, 14, 15, 16, 18, 20, 26, 32, 36, 48
- **Line height:** 1.07, 1.20, 1.25, 1.30, 1.33, 1.38, 1.39, 1.50, 1.69, 1.71
- **Letter spacing:** -0.0080em, -0.0060em, -0.0040em, 0.0250em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.69 | 0.3px |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.38 | — |
| heading-sm | — | — | 26px | 1.33 | -0.104px |
| heading | — | — | 32px | 1.3 | -0.192px |
| heading-lg | — | — | 36px | 1.25 | -0.288px |
| display | — | — | 48px | 1.2 | -0.384px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 6px
- **cards:** 24px
- **pills:** 204px
- **images:** 6px
- **inputs:** 6px
- **buttons:** 28px

## Components

### Primary Action Button
**Role:** Filled red CTA used for purchase paths, explore actions, and form submission

Background Peloton Red (#df1c2f), white text, Inter weight 500, 16px size, 28px border-radius, 16px vertical × 24px horizontal padding, 8px horizontal gap between text and optional icon. No border. Hover deepens the red slightly. The 28px radius gives the button a generous pill-like softness without being fully circular.

### Secondary Ghost Button
**Role:** Outlined action paired with the primary CTA for non-conversion exploration

Transparent background, 1.5px border in currentColor (white on dark surfaces, Carbon Black on light), 28px border-radius, same padding as primary (16px × 24px), Inter weight 500 16px. Inherits text color from its surface — appears white on dark heroes, black on light sections.

### Product Card
**Role:** Equipment tile in the product lineup grid and merchandising blocks

White (#ffffff) surface on Mist Gray (#f7f7f7) page background, 24px padding or product-image bleed with label strip below, 24px border-radius on image, no shadow. Product image fills upper area at 6px corner radius; label area below uses Carbon Black heading at 20px weight 500 and Slate subtext at 14px.

### Navigation Bar
**Role:** Sticky top-level site navigation

Full-width Carbon Black (#181a1d) bar, 16px vertical padding, PELOTON wordmark at left in white at 16px weight 600 with generous letter-spacing. Center nav links in white Inter 14px weight 500 with dropdown carets; right side holds account icon and cart icon. No visible border between nav and hero — dark surface continues.

### Hero Section
**Role:** Full-bleed dark band carrying the primary campaign message

Carbon Black background fills the full viewport width and substantial height. Centered text stack: display headline at 48px Inter weight 300 white with -0.384px tracking, supporting line at 18px weight 400 white at 70% opacity, micro-label at 14px weight 500 white. Product photography sits in low-key lighting beneath the text. Two CTAs sit side-by-side centered: one filled red primary, one ghost outline.

### Form Input
**Role:** Text entry fields in signup, checkout, and account flows

White background, 1px Steel (#888b93) border, 6px border-radius, 12px vertical × 16px horizontal padding, Inter 15px weight 400 Carbon Black text. Placeholder in Fog (#a8acb1). Focus state shifts border to Peloton Red with a subtle outer ring at rgba(223,28,47,0.15).

### Section Header
**Role:** Interstitial label introducing a product lineup or content block

Left-aligned Carbon Black Inter at 26px weight 500 with -0.104px tracking, optional Slate descriptor below at 14px. Sits above a horizontal product carousel or grid with 40px vertical space.

### Chat Widget
**Role:** Persistent customer-support entry point fixed to bottom-right

Pill-shaped (204px radius) Peloton Red button anchored to viewport bottom-right, white chat-bubble icon, white 'Chat' label in Inter 14px weight 500. On dark surfaces the red pops; on light surfaces it still dominates due to its saturation.

### Footer
**Role:** Site-wide link repository and legal/contact area

Carbon Black background, white text, 64px vertical padding. Link columns in 4-column grid at max-width 1200px centered. Column headings in Inter 14px weight 600 white, links in Inter 14px weight 400 Slate (#65666a). Social icons at top of footer in single-color white stroke.

### Nav Dropdown
**Role:** Expanding category menu from primary nav items

Carbon Black surface, white text, no visible border or shadow — appears as a flush extension of the nav bar. Sub-category links in Inter 14px weight 400, with a thumbnail grid of products on wider dropdowns. 24px padding inside.

### Promotional Tag
**Role:** Small inline label for deals, limited offers, or product status

Peloton Red background, white text, Inter 12px weight 600, 6px border-radius, 4px vertical × 8px horizontal padding, often paired with a tiny white dot or arrow icon.

### Icon Button
**Role:** Circular icon-only controls for cart, account, search

Transparent background, white icon stroke (1.5px) on dark nav, Carbon Black stroke on light surfaces. 40px × 40px hit area, icon centered at 20px.

## Do's and Don'ts

### Do
- Use #df1c2f exclusively for primary actions, the brand mark, and the persistent chat widget — no other color carries conversion weight
- Set display headlines at 48px Inter weight 300 with -0.384px letter-spacing; the whisper-weight is a signature choice
- Use 28px border-radius for all primary and secondary buttons to maintain the generous pill softness
- Alternate between #181a1d full-bleed hero bands and #f7f7f7 light content sections to establish the dark-stage / light-catalog rhythm
- Keep product card backgrounds pure #ffffff on #f7f7f7 canvas with a #e4e6e7 hairline border — no drop shadows on cards
- Use the 300deg shimmer gradient only for skeleton/loading states, never as a decorative surface treatment
- Set form input borders to 1px #888b93 with 6px radius; shift border to #df1c2f on focus with a subtle outer ring

### Don't
- Don't introduce any chromatic color beyond #df1c2f — the single-accent discipline is the system's defining trait
- Don't use drop shadows on cards or buttons; depth comes from surface-layer contrast, not elevation
- Don't use weight 700 or 800 for headlines — the system is built on weight 300 displays and weight 400-500 for body
- Don't place a white card or light content block on a dark hero band — the dark stage carries text and CTAs only
- Don't use fully square (0px) or fully circular (9999px) corners — the system lives at 6px, 24px, and 28px
- Don't use the 204px pill radius for anything other than the chat widget or true pill-shaped status indicators
- Don't apply colored gradients to hero backgrounds — heroes are flat #181a1d to keep focus on text and CTAs

## Elevation

The system deliberately avoids drop shadows. Depth is communicated through surface-layer contrast — dark hero bands sit beside white card surfaces, cards sit on gray canvases, and borders at #e4e6e7 provide hairline separation. This creates a flat, gallery-like presentation where the only 'elevation' is the contrast between Carbon Black (#181a1d) and Pure White (#ffffff), letting product photography carry all visual weight.

## Surfaces

- **Charcoal Stage** (`#181a1d`) — Full-bleed hero bands, navigation bar, footer — the cinematic dark mode of the brand
- **Mist Canvas** (`#f7f7f7`) — Default page background for light content sections between dark heroes
- **White Card** (`#ffffff`) — Product cards, form inputs, elevated content blocks sitting on the Mist canvas
- **Silver Divider** (`#e4e6e7`) — Hairline borders, card outlines, structural separation between content zones

## Imagery

Product photography dominates — full equipment shots (bikes, treadmills, rowers) presented on clean backgrounds with no lifestyle context. In hero sections, equipment appears in low-key dramatic lighting against the charcoal backdrop, making the products glow. Product lineup tiles use clean white-background product crops at consistent aspect ratios. Iconography is line-based, 1.5px stroke, monocolor (white on dark, black on light) — no filled multicolor icons. No illustrations, no abstract graphics, no decorative photography outside of product shots.

## Layout

Full-bleed dark hero bands alternating with max-width 1200px centered light content sections. Heroes span the entire viewport width with centered text stacks and ambient product imagery. Light sections use a consistent grid: 2-column text+image blocks, 4–5 column product carousels, and 3-column feature blocks. Navigation is a fixed top bar that stays dark across the entire site regardless of the section below. Vertical rhythm is comfortable — 64px section gaps, 24px card padding, 12px element gaps. The product lineup section at the bottom of the visible page shows a horizontal scroll/grid of 5 product cards in a single row.

## Similar Brands

- **Apple** — Same cinematic full-bleed dark hero → clean white product gallery rhythm, with a single restrained accent color reserved for primary actions
- **Garmin** — Disciplined achromatic product-retail palette (gunmetal, white, warm gray) with photography as the primary visual language and minimal chromatic decoration
- **Tesla** — Dark immersive product-showcase bands breaking into minimal white specification sections; near-zero color noise, extreme typographic restraint
- **Rothy's** — Premium product e-commerce with white product tiles on soft gray canvas, hairline borders, and a single bold accent color for CTAs
- **Bowers & Wilkins** — Dark exhibition-style product presentation where equipment photography carries visual weight against near-black surfaces, with minimal typographic flourish
