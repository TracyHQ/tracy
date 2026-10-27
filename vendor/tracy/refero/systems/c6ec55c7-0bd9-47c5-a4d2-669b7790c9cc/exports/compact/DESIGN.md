# OLIPOP — Style Reference
> Retro apothecary cream and forest teal — a soda fountain menu printed on warm paper.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

OLIPOP is a sun-faded apothecary meets soda fountain: warm cream canvases, one authoritative forest-teal that anchors every header, button, and brand mark, and a carousel of pastel-flavored product cards that read like candy shelf labels from a 1950s general store. Typography does most of the storytelling — a high-contrast retro display serif (WindsorEF) at weight 800 shouts from headlines, while a clean modern sans (Ano) handles everything else with workmanlike quietness. The system lives in the gap between vintage warmth and modern e-commerce utility: pill-shaped buttons, soft 16px-radius cards, and zero shadows except a single faint glow on the primary call-to-action. Color is rationed carefully — most of the page is cream and forest teal, with chromatic energy reserved for product cards, a single wine-red accent, and a bright teal secondary action.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#14433d` | Teal supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Cream Paper | `#fdf7e7` | Page canvas, section backgrounds — the off-white that every surface sits on, slightly warm so type never feels clinical |
| Mint Sage | `#d3e8e3` | Hero panel background, soft section washes — a desaturated mint that recedes so forest-teal text can lead |
| Charcoal | `#3a3a3a` | Body text, link text, secondary icons — softer than pure black to stay in harmony with the warm cream canvas |
| Pure White | `#ffffff` | Card surfaces on cream sections, button text on forest-teal fills, input fields — the only true white in the system |
| Hairline Gray | `#e3e3e3` | Dividers, subtle borders — barely-there structural lines |
| Wine Press | `#7e0022` | Red supporting accent for decorative details and low-frequency emphasis. |
| Bright Teal | `#2ad2c9` | Teal supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Fountain Teal | `#008b70` | Teal supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Cardinal Red | `#d32737` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Banana Cream | `#fdf4b5` | Product card background — Banana Cream flavor |
| Watermelon Lime | `#a9df71` | Product card background — Watermelon Lime flavor |
| Crisp Apple | `#febac4` | Product card background — Crisp Apple flavor |
| Classic Grape | `#e3d2ed` | Product card background — Classic Grape flavor |
| Vintage Cola | `#f8d5c0` | Product card background — Vintage Cola flavor |

## Typography

### WindsorEF — Display headlines, hero copy, section titles, and product card labels. This high-contrast retro serif is the brand's signature voice — it evokes vintage packaging and apothecary labels. Weight 800–900 at 48–80px for hero/section titles; weight 700 at 20–32px for product card names. The extremely tight 1.0 line-height and very large sizes make it command attention without feeling like a typical bold sans-serif. Substitute: Bagel Fat One, Cooper Black, or Playfair Display Black.
- **Substitute:** Playfair Display Black or Cooper Black
- **Weights:** 700, 800, 900
- **Sizes:** 20px, 32px, 48px, 52px, 72px, 80px
- **Line height:** 1.00
- **Letter spacing:** normal

### Ano — Body text, navigation, button labels, form inputs, footer text, and all UI chrome. A clean, friendly sans-serif that does the quiet work of the interface while the display serif performs above. Weight 400 for body, 600 for emphasized body or nav, 700 for button text. Generous line-heights (1.5–1.82) keep body copy breathable on the cream background. Substitute: Inter, DM Sans, or Söhne.
- **Substitute:** Inter or DM Sans
- **Weights:** 400, 600, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 22px, 24px
- **Line height:** 1.20–2.33
- **Letter spacing:** normal

### Helvetica — Fallback for icon labels and minor decorative text — present only in low-frequency decorative spots, not part of the core system
- **Substitute:** system-ui sans-serif
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 12px | 2.33 | — |
| caption | — | — | 14px | 1.8 | — |
| body-sm | — | — | 16px | 1.67 | — |
| body-lg | — | — | 20px | 1.5 | — |
| subheading-sm | — | — | 22px | 1.48 | — |
| subheading | — | — | 24px | 1.4 | — |
| heading-sm | — | — | 32px | 1 | — |
| heading-lg | — | — | 52px | 1 | — |
| display-sm | — | — | 72px | 1 | — |
| display | — | — | 80px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 40-64px
- **Card padding:** 20px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 50px
- **cards:** 16px
- **inputs:** 50px
- **buttons:** 50px
- **hero-panels:** 24px

## Components

### Announcement Bar
**Role:** Site-wide top banner for promotions and shipping notices

Full-width forest-teal (#14433d) bar with white (#ffffff) text. White (Ano) at 12–14px, centered. Fixed at 1px or 2px vertical padding. Functions as a dark anchor strip at the very top of every page.

### Primary Navigation
**Role:** Main site navigation

Cream (#fdf7e7) background, centered OLIPOP wordmark logo in forest-teal, nav links (Shop, Learn, Subscribe) left-aligned in charcoal (#3a3a3a) Ano weight 400 at ~14–16px, utility icons (Find in Store, account, cart) right-aligned. Spacing of ~20px horizontal padding on link groups.

### Primary CTA Button
**Role:** Highest-priority conversion button

Pill-shaped (50px border-radius), forest-teal (#14433d) fill, white (#ffffff) text in Ano weight 700 at 16px. Padding 12px 24px. Subtle box-shadow rgba(0,0,0,0.1) 0px 0px 24px 0px — a soft ambient glow rather than a hard elevation. Used for 'Shop Now' and main purchase actions.

### Secondary CTA Button
**Role:** Secondary conversion — loyalty/rewards sign-up

Pill-shaped (50px border-radius), bright teal (#2ad2c9) fill, forest-teal (#14433d) text in Ano weight 700 at 16px. Same padding as primary. The vivid teal against the cream page makes it pop without using the dominant brand color.

### Ghost Text Link
**Role:** Inline links within body text

No background or border. Charcoal (#3a3a3a) text, Ano weight 400, underlined or with subtle color shift on hover. Compact, unobtrusive, treats links as text continuity rather than interactive chrome.

### Hero Panel
**Role:** Above-the-fold brand statement section

Two-tone: cream (#fdf7e7) page background with an inset mint-sage (#d3e8e3) rounded panel (24px radius) taking up roughly 40% of the viewport width. Display serif (WindsorEF) weight 800 at 72–80px in forest-teal. Subtext in Ano weight 400 at 18px in charcoal. Primary CTA button below. The mint panel creates a 'card' on a card effect — the hero reads as a poster pinned to cream paper.

### Flavor Product Card
**Role:** Product listing card in the 'Pure Nostalgia-ahh' carousel

Full-bleed colored card (one of 15+ pastel flavors — butter yellow, apple green, blush pink, lavender, peach, etc.), 16px border-radius. Contains a circular product photo crop. Card name in WindsorEF weight 700 at 20–24px in forest-teal below the image. Five-star rating row in Ano 12px. No shadow, no border — the color itself defines the card boundary.

### Section Heading
**Role:** Mid-page section titles

WindsorEF weight 800 at 48–52px, forest-teal (#14433d), centered. Minimal subtext in Ano 18px charcoal directly below. The large serif centered on cream creates a poster-like rhythm between sections.

### Rewards Feature Section
**Role:** Loyalty/rewards promotion with image and text

Cream background. Two-column layout: left column is a large circular image area (rounded illustration with pink, cherry-red, and cream elements), right column has a small wine-red (#7e0022) accent label ('Cherry on Top'), then a WindsorEF display heading at 32–48px, then body copy, then a bright-teal CTA button. The circular image container is a signature layout device — image cropped to a perfect circle, floating on cream.

### Product Image Circle
**Role:** Circular product or illustration container

Perfectly round container (border-radius 50%) holding product photography or illustration. Used within flavor cards and the rewards section. The circle motif appears repeatedly — it softens the rectangular grid and references vintage bottle caps and medallions.

### Form Input Field
**Role:** Newsletter signup, search, and form inputs

White (#ffffff) fill, fountain-teal (#008b70) 1px border, 50px border-radius (pill-shaped), Ano 16px text, 12–16px vertical padding. Focus state deepens border to forest-teal (#14433d).

### Star Rating
**Role:** Product review star display

Five small filled stars in forest-teal (#14433d), inline with product cards. No background, no container — raw characters in Ano 12px or as SVG icons. Functional micro-element, not a decorative badge.

### Footer
**Role:** Site-wide footer with links and legal

Forest-teal (#14433d) background with white (#ffffff) text. Multi-column link grid in Ano 14–16px. Logo at top. The dark footer mirrors the announcement bar, framing the page top and bottom with forest-teal bands.

## Do's and Don'ts

### Do
- Use WindsorEF at weight 800 or 900 for all headlines 32px and above — this display serif IS the brand voice
- Set primary CTA buttons to 50px border-radius (full pill) with forest-teal (#14433d) fill and white text
- Use cream (#fdf7e7) as the base page background for all sections — never pure white as the canvas
- Apply 16px border-radius to all content cards, 50px to all interactive elements (buttons, inputs, tags)
- Pair the cream canvas with one chromatic surface per product card — each flavor gets its own pastel, never shared
- Keep body text at 16–18px in Ano weight 400 with charcoal (#3a3a3a) — never use pure black on cream
- Use the soft ambient shadow rgba(0,0,0,0.1) 0px 0px 24px only on the primary CTA — all other elements stay flat

### Don't
- Don't use WindsorEF below 20px — the display serif loses character at small sizes and becomes hard to read
- Don't apply sharp corners (0–8px radius) to buttons or inputs — the pill shape is essential to the system
- Don't introduce additional dark surface colors beyond forest-teal (#14433d) — the brand's darkness IS that specific teal
- Don't add heavy drop shadows or elevation effects — the system is fundamentally flat with one exception (primary CTA glow)
- Don't mix the wine-red (#7e0022) accent with forest-teal (#14433d) in the same component — pick one for heading, one for body
- Don't use the product-card pastel colors for UI chrome (nav, buttons, borders) — they are flavor-locked to product context only
- Don't set body text at line-height below 1.4 — Ano needs breathing room to feel warm on cream, not clinical

## Elevation

- **Primary CTA Button:** `rgba(0, 0, 0, 0.1) 0px 0px 24px 0px`

## Surfaces

- **Page Canvas** (`#fdf7e7`) — Warm cream — the default page background that every other surface sits on
- **Hero Panel** (`#d3e8e3`) — Mint sage inset panel within the hero, creating a tonal card on the cream canvas
- **Product Card** (`#fdf4b5`) — Pastel flavor-colored cards — each product gets its own hue from the 15-color pastel palette
- **Dark Frame** (`#14433d`) — Forest-teal announcement bar and footer — dark bookends that bracket the cream page

## Imagery

Product photography is the dominant visual: full-can soda shots on clean pastel backgrounds, tightly cropped with no lifestyle context. The can IS the hero — no hands, no people, no environment. Supporting illustrations appear in the rewards section with a retro/folk-art style (cherry stem, varsity jacket, milkshake glass with sparkle motifs), rendered in flat color blocks of pink, cherry red, and cream. Iconography is minimal — the brand relies on the wordmark and product photography rather than an icon system. The circle motif recurs throughout: product images, illustration containers, and the logo's wordmark treatment. The visual language is 'vintage packaging photography meets folk-art merch' — warm, slightly nostalgic, and proudly analog.

## Similar Brands

- **Recess** — Same warm cream canvas with a single dark teal/green as the dominant brand color, retro display serif headlines, and pastel product cards in a horizontal carousel
- **Oatly** — Warm off-white page background, oversized retro display typography for headlines, and a single dark color carrying all primary actions — though Oatly leans more ironic/playful in tone
- **Magic Spoon** — Vintage cereal-box aesthetic with cream backgrounds, high-contrast serif display type at large sizes, and per-flavor pastel card colors in product grids
- **Public Goods** — Cream and off-white minimal e-commerce aesthetic with pill-shaped buttons and a single forest-toned dark color for primary actions
- **Halfday (formerly MTE)** — Warm cream + forest-green palette with pill buttons, oversized serif headlines, and pastel product cards in a apothecary/general-store visual language
