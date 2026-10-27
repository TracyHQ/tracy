# Krea — Style Reference
> noir gallery at midnight

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Krea operates as a cinematic monochrome stage: pure black canvases, surgically tight Suisse Intl type, and zero chromatic noise compete for attention with the AI-generated imagery itself. The interface dissolves into atmosphere — the product floats on darkness rather than sitting on a surface. Buttons toggle between white-fill and ghost-outline pills, never introducing color. Typography does all the heavy lifting: compressed display weights at 96px/72px pull the eye down into the page, while sub-1.0 line-heights on heroes create an almost film-credit density. Spacing is generous but never airy — 80–96px section gaps with 12–20px element rhythm keeps things composed, not floaty.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary page background, hero canvas, image void — the default stage everything sits on |
| Midnight | `#0b0f15` | Hero ambient and large image containers — a near-black with the faintest blue undertone that keeps the void from looking flat |
| Charcoal | `#171717` | Elevated card surfaces, hover state for ghost buttons, secondary panels that need to lift off Obsidian |
| Graphite | `#262626` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Iron | `#404040` | Muted body text, inactive icon strokes, decorative dividers in dense blocks |
| Slate | `#525252` | Secondary supporting text, caption-level annotations, tertiary iconography |
| Ash | `#737373` | Tertiary text, helper copy, less-prominent metadata |
| Fog | `#a3a3a3` | Secondary body text and sub-labels that still need readability over dark surfaces |
| Pearl | `#d4d4d5` | Hairline borders, subtle stroke dividers, ghost button outlines |
| Mist | `#e5e5e5` | Light divider lines on dark surfaces where higher contrast isn't needed |
| Cloud | `#f5f5f5` | Light surface reserved for inverted sections or content blocks that demand brightness |
| Pure White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |

## Typography

### Suisse Intl — The only typeface in the system. Used for every interface element: nav, body, buttons, hero, pricing, footer. Display weights 500–600 at 48–96px with aggressive -0.025em tracking create the compressed, cinematic headline feel; the unusual 450 weight handles editorial body emphasis without crossing into semibold territory.
- **Substitute:** Inter (closest free analogue, same Swiss grotesque DNA), or Söhne / Neue Haas Grotesk if licensed
- **Weights:** 400, 450, 500, 600, 700
- **Sizes:** 12, 13, 14, 15, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96
- **Line height:** 1.00–1.56
- **Letter spacing:** Tight at display: -0.025em (96px → -2.4px), -0.015em at 48px (-0.72px), near-normal at body (0), opens to +0.01em at small sizes, and +0.10em for uppercase eyebrow/label tracking
- **OpenType features:** `"ss01" on, "tnum" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0.12px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading-sm | — | — | 20px | 1.38 | -0.3px |
| subheading | — | — | 24px | 1.33 | -0.36px |
| heading-sm | — | — | 36px | 1.2 | -0.54px |
| heading-md | — | — | 48px | 1.11 | -1.2px |
| heading | — | — | 60px | 1.05 | -1.5px |
| heading-lg | — | — | 72px | 1 | -1.8px |
| display | — | — | 96px | 1 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 80-96px
- **Card padding:** 24-32px
- **Element gap:** 12-20px

### Border Radius

- **cards:** 8px
- **badges:** 9999px
- **inputs:** 8px
- **buttons:** 9999px
- **largeSurfaces:** 14-32px

## Components

### Primary CTA Button
**Role:** Hero and header conversion — the system’s only light source

Pill-shaped (9999px), Pure White (#ffffff) fill, Obsidian (#000000) text in Suisse Intl weight 500 15px, 10px 20px padding, subtle 0 1px 2px rgba(0,0,0,0.05) shadow. The single highest-contrast element on the page.

### Ghost CTA Button
**Role:** Secondary action paired with primary CTA

Pill-shaped (9999px), transparent fill with Pearl (#d4d4d5) 1px border, Fog (#a3a3a3) text, Suisse Intl 500 15px, 10px 20px padding. Hovers to Charcoal (#171717) fill with white text.

### Navigation Link
**Role:** Top-bar menu items and inline anchors

Suisse Intl 400 14px, Fog (#a3a3a3) text, no underline, 0px letter-spacing. Active/hover state: Pure White (#ffffff). 20px horizontal gap between items.

### Auth Pill (Sign Up)
**Role:** Header right-side conversion in ghost-white style

Pill (9999px), Pure White (#ffffff) fill, 8px 16px padding, 13px Suisse Intl 500, Obsidian text. Smaller scale than hero CTA — sits inline in nav without overwhelming.

### Log In Text Link
**Role:** Tertiary header action

Ghost-styled link, no border, Fog text 13px weight 500, hovers to white. Sits inline with zero chrome.

### Hero Headline Block
**Role:** First-screen attention grabber

Centered, max-width ~900px, Suisse Intl 500 at 60–72px, white text, line-height 1.05, letter-spacing -0.025em. Followed by a single 16–18px Fog subtitle with no italic or secondary color.

### Feature Card
**Role:** Mid-page capability or product-mode blocks

Charcoal (#171717) fill, 8px radius, 24–32px padding, no border, no shadow. Internal hierarchy: 20–24px white heading, 14–15px Fog body, 16px gap between elements. Optional full-bleed screenshot or preview at top with 8px radius.

### Pricing Tier Card
**Role:** Plan comparison block

Charcoal fill, 14px radius (slightly more generous than feature cards to signal importance), 32px padding, 1px Iron (#404040) border on non-featured tiers. Featured tier: white border (#ffffff) or Pure White fill inversion. Tier name 20px weight 500, price 48px weight 500 with -0.025em tracking, feature list 14px Fog with 10px row gap.

### Text Input Field
**Role:** Form input for email collection, settings, generation prompts

8px radius, Charcoal (#171717) fill, 1px Iron (#404040) border, 12px 16px padding, 15px Suisse Intl 400 white text. Placeholder: Ash (#737373). Focus: border shifts to Pearl (#d4d4d5), no glow ring.

### Eyebrow Label / Tag
**Role:** Section labels, category tags, status indicators

Suisse Intl 500 12px, uppercase, letter-spacing +0.10em (0.12px in spec, applied as ~0.012em in CSS), Fog (#a3a3a3) or Ash color. Optional pill background: Charcoal fill with 9999px radius and 4px 10px padding.

### Footer Block
**Role:** Bottom-of-page navigation and legal

Full-width Obsidian background, top 1px Iron (#404040) divider, 80px top padding, 40px bottom. Column headings: 14px weight 500 white. Links: 14px weight 400 Fog, 12px row gap. Logo and copyright at 13px Ash.

### Product Monitor Mockup
**Role:** Hero visual showing the product in context

Realistic device frame (monitor or browser chrome) with rounded edges, 8–14px radius on the frame, 2px Iron border, the dual-layer drop shadow `0px 9px 8px rgba(0,0,0,0.2), 0px 6px 4px -1px rgba(0,0,0,0.2)` to seat it in the void. Interior displays the actual app UI.

### Mode Tabs (Image / Video / Upscaler / API)
**Role:** Top-level navigation between product modes

Horizontal row of text links, 14–15px weight 500, 20px gaps. Active tab: Pure White with 1px white underline 2px below. Inactive: Fog. No pill backgrounds — pure typographic distinction.

## Do's and Don'ts

### Do
- Use Pure White (#ffffff) for the single primary CTA on any given view — never introduce a second light-colored button
- Set display text at 48–96px Suisse Intl 500 with -0.025em tracking and line-height 1.0–1.11
- Reserve Charcoal (#171717) for surfaces that need to lift off Obsidian, and add 1px Iron borders only when a card sits on a near-identical tone
- Use 9999px radius for every button, tag, and pill; 8px for inputs and small cards; 14–32px for large feature surfaces
- Maintain 80–96px gaps between major sections and 12–20px between sibling elements
- Default to uppercase +0.10em tracking at 12px weight 500 for any eyebrow, section label, or category tag
- Let the product imagery own the page — surround AI-generated visuals with maximum dark negative space rather than decorative chrome

### Don't
- Never introduce a chromatic accent color — the system is intentionally 0% colorfulness; adding red, blue, or green would break the noir-gallery identity
- Don't use 8px radius on buttons — they are exclusively 9999px pills
- Don't use shadows on cards or feature blocks — elevation comes from surface tone, not blur
- Don't use italic, underline, or colored inline links — links are weight or color shifts only (Fog → White)
- Don't set body text below 14px or above 16px without a typographic reason (captions go to 12px uppercase only)
- Don't use line-height above 1.5 for body — Suisse Intl is calibrated for tighter vertical rhythm on dark surfaces
- Don't place light surfaces (#f5f5f5, #e5e5e5) as page backgrounds — they are reserved for content blocks inside an inverted section, never as full-page canvas

## Elevation

- **Ghost/Outline Button:** `0px 1px 6px rgba(0, 0, 0, 0.1)`
- **Filled Primary Button:** `0px 1px 2px rgba(0, 0, 0, 0.05)`
- **Hero Product Mockup:** `0px 9px 8px rgba(0, 0, 0, 0.2), 0px 6px 4px -1px rgba(0, 0, 0, 0.2)`

## Surfaces

- **Obsidian** (`#000000`) — Base page canvas — the default background of every screen
- **Midnight** (`#0b0f15`) — Hero and image-dominant sections that need the faintest lift from pure black
- **Charcoal** (`#171717`) — Card and panel surfaces that read as objects floating on the void
- **Graphite** (`#262626`) — Hovered/active interactive surfaces and the most lifted elevated state

## Imagery

The visual language is product-imagery-dominant: AI-generated artwork, realistic device mockups, and atmospheric full-bleed photographs (desk, monitor, dark room scenes) carry the page. There are no illustrations, no icons beyond utilitarian UI glyphs (arrows, chevrons, menu), and no abstract decorative graphics. Product screenshots appear inside realistic device frames — monitors, browser windows — rendered with deep drop shadows to feel like physical objects on a dark desk. Photography is high-contrast and dark/moody: wood textures, low-key lighting, near-black environments with a single light source. The user-generated AI imagery (which Krea helps create) is the visual hero whenever it appears, treated full-bleed or in generous 14–32px-radius containers with no overlaid UI chrome. The overall effect: a portfolio gallery where the user's creative output is the only thing worth illuminating.

## Layout

Full-bleed dark canvas with no page-max-width container — content blocks center themselves within the viewport rather than inside a fixed column. The hero is centered text-over-image: a large headline (60–72px) above a single 16–18px subtitle and a paired CTA cluster, all floating over a full-bleed dark photographic background. Below the hero, sections stack vertically with 80–96px gaps, alternating between pure Obsidian (#000000) canvas and slightly lifted Charcoal (#171717) bands that use tone rather than dividers to separate content. Feature sections follow a 2-column alternating text-left/image-right or centered-stacks pattern, never asymmetric/editorial. Pricing and capability grids are clean 2–3 column arrangements with equal card weights. Navigation is a single top bar — no sidebar, no mega-menu, no sticky doubling — with the logo at far left, menu items center, and dual CTA at far right. Density is comfortable: sections breathe, but inside each section the typography stays tight and the element rhythm is 12–20px, never airy.

## Similar Brands

- **Midjourney** — Same monochromatic noir canvas with zero UI color, AI-generated imagery as the visual hero, centered display type, pill-shaped CTAs
- **Linear** — Same dark-first, tight-tracked Swiss grotesque typography, flat surface tone elevation, minimal shadow reliance, white-fill + ghost-outline button pairing
- **Runway** — AI creative tool aesthetic — full-bleed dark hero, product mockup as centerpiece, monochrome palette, cinematic atmosphere over UI density
- **Vercel** — Premium dark surface treatment, generous section gaps, compressed display type with negative tracking, pure white as the only accent
