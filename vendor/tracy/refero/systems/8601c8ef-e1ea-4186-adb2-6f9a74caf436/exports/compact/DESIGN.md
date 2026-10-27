# N8n — Style Reference
> Workflow engine at midnight — the feeling of a live automation canvas running in a dark server room, lit by status indicators and data flows.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

n8n is a dark workflow canvas that feels like staring into a running machine at night — deep purple-black surfaces lit from within by orange fire and electric blue current. The #0e0918 base is nearly black but carries a violet undertone that makes the darkness feel technological rather than neutral. The signature visual move is the orange-to-red gradient CTA against this void: rgb(253,137,37) → rgb(255,12,0) at 30deg creates an ember glow that reads as kinetic energy. Typography runs entirely in geomanist at weights 300 and 400 — the light weight at 54px headline sizes feels deliberately restrained, letting the lightning bolt hero illustration do the shouting. Cards are not floating objects but embedded panels, using inset white-10% borders and faint orange inset bottom-glows (rgba(255,142,93,0.3)) that suggest backlit hardware.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Base | `#0e0918` | Primary page background and hero section — the near-black violet creates depth without being neutral charcoal |
| Elevated Surface | `#1a1624` | Card backgrounds (rgb(26,22,36)) — one step above void, visible as panels |
| Deep Panel | `#1b1728` | Secondary card surface (rgb(27,23,40)) — close to Elevated Surface, used for 24px-radius feature cards |
| Muted Shell | `#2c2834` | Ghost button backgrounds — semi-transparent frosted layer over dark surfaces |
| Border Smoke | `#3e3a46` | Nav and container borders — low-contrast edge definition on dark surfaces |
| Ash Text | `#d1cece` | Primary body and UI text — warm-gray rather than pure white, reducing harshness against dark bg |
| Fog Text | `#9d9797` | Secondary body text, captions, de-emphasized labels |
| Silver Rail | `#e5e7eb` | Border lines across components and nav — light border on dark background creates fine hairline edges |
| Cloud White | `#ffffff` | High-emphasis headings, icon fills, badge text, active nav items |
| Steel Muted | `#48556a` | Badge text on light badge backgrounds |
| Ember CTA | `linear-gradient(30deg, rgb(253, 137, 37), rgb(255, 12, 0))` | Primary CTA buttons — orange-to-red gradient (rgb(253,137,37) → rgb(255,12,0)) burns against the dark void; the only warm-chromatic element above the fold, creating immediate focal pull |
| Electric Current | `linear-gradient(141deg, rgb(7, 122, 199), rgb(107, 33, 239))` | Link underline glow, active focus rings, node connection lines in workflow canvas — blue-to-violet gradient (rgb(7,122,199) → rgb(107,33,239)) signals data flow and connectivity |
| Ember Scorch | `#ff492c` | Icon fills and secondary highlight accents — pure saturated red-orange for SVG emphasis marks |
| Crimson Glow | `#56312d` | Card box-shadow tint — dark muted red used in shadow layers beneath cards, creating a heat-haze underneath panels |

## Typography

### geomanist — The sole display and body typeface. Weight 300 at 48–54px is the defining choice — headlines whisper against the dark background rather than asserting. Weight 400 handles body copy at 15–18px with 1.5–1.7 line-height for comfortable reading in dark contexts. The compressed line-height of 0.88 at 54px stacks headline lines into a dense visual block.
- **Substitute:** DM Sans, Inter (variable, set to weight 300 for display)
- **Weights:** 300, 400
- **Sizes:** 12px, 14px, 15px, 16px, 18px, 20px, 24px, 48px, 54px
- **Line height:** 0.88–1.70 (tight 0.88 at display sizes, 1.5–1.7 at body sizes)
- **Letter spacing:** -1.08px at 54px, -0.86px at 48px (from -0.018em to -0.020em; tight negative tracking at display sizes, normal at body)

### geomanist-book — Medium-emphasis subheadings and section labels. The 'book' variant sits optically between 300 and regular 400, used for callout text in feature cards and section introductions at 20–24px.
- **Substitute:** DM Sans 500
- **Weights:** 400
- **Sizes:** 16px, 18px, 20px, 24px
- **Line height:** 1.00, 1.50
- **Letter spacing:** -0.29px at 16px (from -0.0180em); -0.17px at 24px (from -0.0070em)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | -0.29px |
| subheading | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 20px | 1.25 | — |
| heading | — | — | 24px | 1.2 | -0.17px |
| heading-lg | — | — | 48px | 0.94 | -0.86px |
| display | — | — | 54px | 0.88 | -1.08px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Element gap:** 16-24px

### Border Radius

- **cards:** 16px
- **nodes:** 12px
- **pills:** 9999px
- **badges:** 24px
- **inputs:** 8px
- **buttons:** 8px
- **cardsLarge:** 24px

## Components

### Ember Gradient CTA Button
**Role:** Primary call-to-action, top nav and hero section

Background: linear-gradient(30deg, rgb(253,137,37), rgb(255,12,0)). Text: #ffffff, geomanist 400 14–16px. Border-radius: 8px. Padding: 10–14px vertical, 20–24px horizontal. No border. On hover, the gradient intensifies. This is the only warm-chromatic element in the nav.

### Ghost Outline Button
**Role:** Secondary action, hero section ('Talk to sales')

Background: rgba(0,0,0,0). Border: 1px solid rgb(229,231,235) (#e5e7eb). Text: #ffffff, geomanist 400. Border-radius: 6px. Padding: 24px all sides (generous equal padding creates a square-ratio for short labels). Shadow: none.

### Frosted Ghost Button
**Role:** Tertiary actions and icon buttons over dark card surfaces

Background: rgba(13,10,25,0.28). Border: 1px solid rgba(255,255,255,0.1). Text: rgb(209,206,206). Border-radius: 8px. Padding: 14px all sides. Box-shadow: rgba(0,0,0,0.26) 0px 0px 8px 0px. Translucent panel-within-panel effect.

### Pill Tag Button
**Role:** Use-case category pills and filter selectors

Background: rgba(163,163,163,0.2). Border: 1px solid rgb(229,231,235). Text: #ffffff. Border-radius: 8px. Padding: 0 20px. Height implicit from line-height. Flat matte surface, no gradient.

### Feature Card
**Role:** Primary content panels in features section

Background: rgb(26,22,36) (#1a1624). Border-radius: 16px. Padding: 48px 44px. No box-shadow. The elevated surface sits 1 step above the #0e0918 page background through color alone — no drop shadow needed.

### Glowing Inset Card
**Role:** Highlighted stats, testimonials, community proof cards

Background: rgba(0,0,0,0) — transparent so page bg shows through. Border: rgba(255,255,255,0.1) 0px 0px 0px 1px inset (white hairline) + rgba(255,142,93,0.3) 0px 1px 0px 0px inset (orange bottom-edge glow). Border-radius: 24px. The orange inset bottom line mimics a backlit indicator.

### Dark Feature Panel
**Role:** Full-width section panels with workflow canvas previews

Background: rgb(27,23,40) (#1b1728). Border-radius: 24px. No padding on container (content bleeds). Used as viewport-wide dark stage for product screenshots.

### Hiring Badge
**Role:** Status indicator tags (e.g., 'Hiring' label in footer nav)

Background: #ffffff. Text: rgb(72,85,106) (#48556a), geomanist 400 12px. Border-radius: 24px. Padding: 4px 10px. White pill on dark background — maximum contrast for status signaling.

### Workflow Node
**Role:** Canvas node objects in workflow diagram illustrations

Background: #1a1624 or app-brand color. Border-radius: 12px. Connected by lines using Electric Current gradient (linear-gradient(141deg, #077ac7, #6b21ef)). Icons centered with 40–48px container. Appear in product screenshot sections.

### Nav Bar
**Role:** Sticky top navigation

Background: #0e0918 (same as page, full-bleed). Border-bottom: 1px solid #3e3a46. Height: 66px. Left: n8n logo with chain-link icon. Center: nav links in geomanist 400 14px, color #d1cece. Right: GitHub star count (pill, frosted glass), 'Sign in' ghost, 'Get Started' Ember gradient button at 8px radius.

### Social Proof Row
**Role:** Logo bar showing enterprise customers

Background: transparent, sits within dark section. Logos rendered in #d1cece (muted ash) — desaturated to prevent brand color competition. No card wrapper, pure horizontal flex layout with 32–48px columnGap.

### Footer Mega-Nav
**Role:** Site-wide footer with multi-column link grid

Background: radial-gradient warm ember glow (rgba(175,106,140,0.46) → rgba(98,65,83,0.38) → transparent) overlaid on #0e0918. Column headers in geomanist 400 14px #ffffff. Links in geomanist 300 14px #9d9797. 5-column grid. Top section has logo + tagline + social icons in #d1cece at 24px size.

## Do's and Don'ts

### Do
- Use #0e0918 as the only page background — never substitute with pure #000000 or neutral dark gray; the violet undertone is load-bearing for the palette
- Apply the Ember gradient (linear-gradient(30deg, rgb(253,137,37), rgb(255,12,0))) exclusively to primary CTA buttons — using it for decorative elements dilutes its focal pull
- Set geomanist 300 at line-height 0.88 for 48–54px display headlines with letter-spacing -0.018em to -0.020em; the tight stack is intentional
- Use inset box-shadows (rgba(255,255,255,0.1) 1px inset + rgba(255,142,93,0.3) bottom inset) instead of border properties on transparent-background cards
- Maintain card surfaces at rgb(26,22,36) or rgb(27,23,40) — exactly one visible step above the base void; three distinct surface levels exist: page → card → elevated panel
- Use 8px border-radius for buttons and inputs, 16px for standard cards, 24px for large feature panels — apply the correct tier per component scale
- Apply Electric Current gradient (linear-gradient(141deg, #077ac7, #6b21ef)) only for link underlines, focus rings, and canvas connection lines — it signals interactivity and data flow

### Don't
- Never use a warm or neutral dark gray (#1a1a1a, #222, #333) as a surface — all surfaces must carry the violet undertone that differentiates n8n's dark from generic dark mode
- Never use geomanist 700 or 800 weight — the type system is intentionally limited to 300 and 400; heavy weight breaks the restrained visual register
- Never place body text in #ffffff at normal reading sizes — use #d1cece or #e5e7eb; pure white at 15–16px creates harshness against the violet-black background
- Never use drop-shadows (outset box-shadows) for card elevation — elevation is expressed through background color stepping, not shadow lifting
- Never use the Ember gradient as a background fill for sections or banners — it appears only on interactive CTA buttons
- Never apply 9999px radius to cards or section containers — pill radius (9999px) is reserved for tags, status indicators, and circular icon wrappers only
- Never show partner/customer logos in their brand colors — all logos in the social proof row must be monochrome #d1cece to avoid palette pollution

## Elevation

n8n uses color-stepping instead of drop shadows for elevation. Moving from #0e0918 → #1a1624 → #1b1728 creates three panel depths visible only through background color — no outset shadow appears on any card. The single exception is the frosted ghost button which uses rgba(0,0,0,0.26) 0px 0px 8px as a halo, not an elevation lift. Cards that need 'active' or 'highlighted' states use inset white and orange glow shadows (rgba(255,255,255,0.1) + rgba(255,142,93,0.3)) — light emanates from within the surface, not beneath it.

## Surfaces

- **Void Base** (`#0e0918`) — Page background, hero, full-bleed sections
- **Elevated Surface** (`#1a1624`) — Primary card backgrounds in features grid
- **Deep Panel** (`#1b1728`) — Large feature panels and workflow canvas backdrops
- **Muted Shell** (`#2c2834`) — Ghost buttons and tertiary interactive surfaces

## Imagery

Primary visual is a single hero 3D illustration — a glowing orange-red lightning bolt rendered with volumetric light, glass-like facets, and bloom glow, positioned right-bleed over the dark background. This is product-metaphor imagery, not photography. The bolt bleeds off the right edge with no containment, which creates asymmetric tension with the left-aligned headline block. Workflow canvas screenshots appear in product sections as contained flat UI captures with 24px border-radius clipping — the product IS the imagery. Section backgrounds use subtle radial gradients (warm ember at corners, faint blue halos) that function as atmospheric depth rather than visible graphics. No photography, no lifestyle imagery. Icons in workflow nodes are multi-color brand icons (Slack, Jira, etc.) appearing at 32–48px within 12px-radius containers — the only colorful elements outside the CTA and hero illustration. Overall density is image-light with one hero hero and one product-screenshot per section.

## Layout

Full-bleed dark canvas with max-width ~1200px content columns centered horizontally. Hero is left-aligned headline + CTA column with a right-bleed 3D illustration occupying 50% viewport width — the illustration breaks the content boundary intentionally. Below hero: a social proof logo bar flush to section bottom. Feature sections use large 24px-radius dark panels (full content width) containing split layouts: text column left, product screenshot right. A 'use case' section uses a left sidebar of vertical tab pills next to a right-fill product canvas — asymmetric 30/70 split. Stats/proof section: 3-column equal card grid using Glowing Inset Cards. Integration section: centered headline over a dense icon grid. Vertical section rhythm uses ~80–120px gaps with no divider lines — sections are distinguished by surface color changes (void → panel → void alternation). Footer is full-bleed with ember radial glow in the upper-right corner, 5-column link grid below a logo/tagline row.

## Similar Brands

- **Retool** — Same dark violet-black surface palette with orange accent buttons and workflow canvas product screenshots as primary imagery
- **Zapier** — Shared automation-platform category but inverted: where n8n uses dark violet + ember, Zapier uses white + orange — both isolate warm CTA against monochrome field
- **Temporal.io** — Dark dev-tools aesthetic with deep purple-black surfaces, light-weight display type, and electric-gradient accent on interactive elements
- **Supabase** — Dark background with single electric-green/blue accent isolated on CTA, geomanist-class geometric sans at light weight for headlines
- **Linear** — Violet-tinted dark surfaces (#0e0918 vs Linear's #0f0f10), weight-300 display headlines, inset border cards without drop shadows
