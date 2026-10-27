# Sequence — Style Reference
> API console on soft daylight — the interface is the product, and purple is the only power color.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sequence presents a light, developer-first visual language built on white surfaces, a confident sans-serif type system, and a single dominant purple that acts as the only serious brand signal on the page. The aesthetic reads like a modern API platform — generous whitespace, compact card grids, hairline borders, and soft elevation rather than heavy shadows or dark mode theatrics. Color is rationed: pages stay largely monochromatic, with purple reserved for primary actions, the logo, and a signature gradient that powers hero treatments and the dashboard call-to-action. Decorative accents in green, blue, and pink appear inside product illustrations and mockups, not in the chrome — they signal 'crypto-native' without competing with the brand. Components are flat and functional, leaning on geometry (8px button radius, 20px card radius, 24px soft shadow) rather than decoration to create rhythm and trust.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Iris | `linear-gradient(to right, #6c00f6 0%, #4f46e5 100%)` | Violet text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Bright Violet | `#7f22fe` | Violet text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Indigo Drift | `#4f46e5` | Gradient terminus — pairs with Electric Iris to create the right-leaning purple-to-indigo gradient on CTAs and hero accents |
| Midnight Slate | `#0f172b` | Primary text, dark surface fills, logo mark, and icon strokes — the heaviest neutral in the system |
| Graphite | `#1d293d` | Dark UI borders, secondary dark surfaces, and high-contrast dividers where a softer gray reads too faint |
| Ash | `#020618` | Near-black button text and icon glyphs — used as the foreground on filled purple CTAs to maximize contrast without true black |
| Fog | `#90a1b9` | Muted helper text, nav icons, and low-emphasis stroke work — the bridge between white canvas and primary text |
| Silver | `#e5e7eb` | Default hairline border, card dividers, and the most common neutral surface tone — carries the structural skeleton of every layout |
| Mist | `#f1f5f9` | Subtle surface tint for alt-row cards, input backgrounds, and section bands that need a whisper of separation from the white canvas |
| White | `#ffffff` | Page canvas, card surface, and button text on purple fills — the bright base everything floats on |
| Spearmint | `#00d492` | Decorative product-mockup accent — used in illustrations, code editor UI, and inline highlights inside screenshots, not in chrome |
| Sky Pop | `#51a2ff` | Decorative product-mockup accent — appears in wallet/payment UI illustrations to signal connected or live data states |
| Bubblegum | `#fb64b6` | Decorative product-mockup accent — pink wash on feature-card backgrounds and illustration shadows to add warmth to the otherwise cool palette |

## Typography

### Inter — Single-family type system. Weight 700 carries hero and section headlines at 32–52px, weight 600 handles subheadings and card titles at 18–20px, weight 500–600 sets buttons and nav links, and weight 400 runs body and helper copy at 14–16px. Inter is chosen for its developer-tools neutrality — humanist but precise — letting the purple brand color do the expressive work instead of the typeface.
- **Substitute:** Inter (Google) — system fallback to -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- **Weights:** 400 / 500 / 600 / 700
- **Sizes:** 14, 15, 16, 18, 20, 32, 52
- **Line height:** 1.10, 1.20, 1.25, 1.30, 1.40, 1.50, 1.71, 2.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 20px | 1.3 | — |
| heading | — | — | 32px | 1.25 | — |
| display | — | — | 52px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 4px
- **cards:** 20px
- **buttons:** 8px
- **containers:** 24px

## Components

### Purple Gradient CTA
**Role:** Primary action button on hero sections, nav, and key conversion moments.

Filled with the brand gradient (#6c00f6 → #4f46e5), white text at Inter 16/600, horizontal padding 16px, vertical padding 8–10px, 8px radius. Pill-like but not fully rounded — the 8px corner keeps it feeling structural rather than playful.

### Ghost Text Link
**Role:** Secondary action that lives next to a primary CTA without competing visually.

No background or border. Inter 16/500 text in #0f172b with a trailing → arrow chevron in Electric Iris. Pair with a filled CTA when offering a docs/learn-more alternative.

### Logo Bar
**Role:** Social-proof band of partner/brand logos between the hero and first content block.

Centered row of monochrome gray logos on a light gray (#f1f5f9) band, separated by even horizontal spacing. Logos share a consistent optical weight; no logos in color.

### Feature Spotlight Card
**Role:** Hero-sized card that introduces a product pillar with a product mockup.

White card, 20px radius, 24px soft shadow (oklab at 0.1 opacity, 0px 0px 24px). Left column holds a small purple pill tag, a 20px weight-600 heading, a body paragraph, and a row of two text-link CTAs. Right column holds a product mockup or illustration, often backed by a decorative pink-to-purple gradient blob.

### Solution Tile Card
**Role:** Compact 4-column grid card for the 'Solutions' section.

White card, 20px radius, 24px shadow, 20px padding. Stack: outlined icon in a square container, 18px weight-600 title, 2–3 lines of body copy, then a full-width purple filled button at the bottom labeled 'Explore'. Buttons span the card width — each tile reads as a complete mini-page.

### Outlined Icon Container
**Role:** Visual anchor at the top of every solution tile.

Soft square (8px radius) with a 1px border in #e5e7eb, holding a single-line icon in #0f172b. Consistent 40×40 footprint; icons are line-style at 1.5px stroke.

### Purple Pill Tag
**Role:** Category label that introduces each feature spotlight card.

Light purple tinted background (rgba of #7f22fe at low opacity), 4px radius, 8px horizontal padding, 6px vertical padding, Inter 12/500 text in #7f22fe. Sits above card headlines like a section eyebrow.

### Announcement Bar
**Role:** Top-of-page purple band for acquisition news and promos.

Solid #6c00f6 background, white Inter 14/500 text centered, with an underlined 'Learn more' link. Full-bleed across the viewport, 40px tall.

### Top Navigation
**Role:** Primary site navigation.

White background, 64–72px tall, sticky-feeling. Left: purple '≡ sequence' logo lockup plus a small 'a polygon company' sublabel. Center: text nav with #0f172b Inter 14/500 items and dropdown chevrons. Right: a ghost 'Docs' text link and a filled purple-gradient 'Dashboard' CTA button, 8px radius.

### Dark Testimonial Banner
**Role:** Full-bleed dark band for customer quotes between content sections.

Deep purple gradient background (rgb(50,30,72) → rgb(28,16,43)), rounded corners on the container, 20px radius. White quote text at Inter 18/400 with the brand logo bottom-right.

### Hero Mockup Cluster
**Role:** Visual element directly under the hero headline — layered product UI mockups.

Three overlapping product cards (sign-in dialog, payment search, and a code/query panel) sitting on a white canvas with soft purple/pink decorative blobs behind. Each mockup card is white with a 12–16px radius, thin border in #e5e7eb, and a small drop shadow. Purple/pink SVG accents float around the cluster as atmosphere.

### Partner Logo Lockup
**Role:** Wordmark + 'a polygon company' sublabel in the nav.

Purple (#6c00f6) 'sequence' wordmark in Inter 16/700 preceded by a 4-bar mark icon. Sublabel 'a polygon company' in #90a1b9 Inter 12/500 sits immediately to the right.

## Do's and Don'ts

### Do
- Use the purple-to-indigo gradient (#6c00f6 → #4f46e5) for the single most important action on any screen — never apply it to more than one CTA per view.
- Set card radius to 20px and use the 24px diffuse soft shadow on every elevated surface to maintain a single, consistent depth language.
- Pair every primary CTA with a ghost 'Read docs →' style secondary link in Midnight Slate so the purple gradient stays scarce and high-signal.
- Use Inter weight 700 at 32–52px for section and hero headlines; weight 600 at 18–20px for card titles; weight 400 at 14–16px for body.
- Place a small purple pill tag above every feature card heading to establish a consistent eyebrow pattern across pages.
- Use 40–64px vertical section gaps and 8px between sibling elements to keep the layout feeling comfortable and confident, never cramped.
- Reserve green (#00d492), blue (#51a2ff), and pink (#fb64b6) for product mockup illustrations only — never in chrome, borders, or text.

### Don't
- Don't apply the purple gradient to secondary buttons, badges, or icons — it dilutes the primary action's weight.
- Don't use #000000 for body text or borders; use Midnight Slate (#0f172b) for text and Silver (#e5e7eb) for borders to keep the system feeling soft rather than harsh.
- Don't introduce new border radii — cards are 20px, buttons are 8px, and tags are 4px. Mixing values breaks the geometry.
- Don't use bold or heavy drop shadows on buttons, inputs, or icons; depth is reserved for full cards.
- Don't decorate with gradients on cards or backgrounds outside the brand gradient and the dark testimonial band — flat surfaces keep the system readable.
- Don't place chromatic text in green/blue/pink over white; these colors are illustration-only and don't meet body-text contrast expectations.
- Don't stretch the CTA button full-width on hero screens — let it sit at its natural width beside a ghost link to preserve the visual rhythm of action + alternative.

## Elevation

- **Feature spotlight card:** `oklab(0.554391 -0.00887066 -0.039739 / 0.1) 0px 0px 24px 0px`
- **Solution tile card:** `oklab(0.554391 -0.00887066 -0.039739 / 0.1) 0px 0px 24px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Default page background
- **Soft Band** (`#f1f5f9`) — Logo bar and low-contrast section bands
- **Card** (`#ffffff`) — Feature and solution tile surfaces, distinguished from canvas by shadow + border
- **Testimonial** (`#321e48`) — Dark purple band for customer quotes

## Imagery

Imagery is dominated by layered product UI mockups (sign-in panels, payment search bars, code editors) that sit on white canvas with a soft purple-to-pink decorative blob behind them. No lifestyle photography, no abstract 3D renders — the product IS the hero. Decorative SVG accents in green, blue, and pink float around mockup clusters to add color energy without competing with the purple brand. Icons are line-style at a consistent stroke weight, monochrome on outlined containers, or chromatically filled when used as section eyebrows. The dark testimonial band uses only a wordmark — no headshots.

## Layout

Pages use a centered max-width 1200px content column with generous outer gutters. The hero is a centered text stack (headline → subtext → CTA + ghost link) with a mockup cluster beneath. Below the hero, a full-bleed light-gray band holds a single-row logo strip. Content sections alternate between white and soft-mist backgrounds, separated by 64px vertical rhythm. Feature spotlights are 2-column (text left, mockup right) inside a single rounded card. The solutions grid is a 4-column equal-width tile row on desktop, collapsing to stacked cards on mobile. The testimonial band is a full-bleed dark card that breaks the light rhythm. Navigation is a single white sticky-feeling top bar with a left logo lockup, centered text nav with dropdown chevrons, and right-side Docs link + Dashboard CTA.

## Similar Brands

- **Alchemy** — Same developer-platform positioning with a dominant single-accent purple on near-monochrome white surfaces, Inter-style sans-serif, and 4-column solution grids.
- **Thirdweb** — Same light-mode API/SDK product aesthetic, Inter typography, purple-forward brand color, and 20px-radius card grids with soft shadows.
- **Stripe** — Same generous whitespace rhythm, hairline #e5e7eb borders, rounded cards with diffuse shadows, and disciplined single-accent brand color used only on primary actions.
- **Moralis** — Same crypto-developer-tool visual language — light canvas, purple brand, Inter type, 4-column solution tile grid, and product mockups instead of lifestyle photography.
