# AngelList — Style Reference
> midnight greenhouse with violet dawn — a near-black teal void where mint-green serif type glows and lavender buttons bloom as the single point of warm light

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

AngelList operates as a midnight greenhouse: an almost-black teal canvas (#001d21) is the floor, mint-green serif display type (#e0fee6) glows as if bioluminescent, and one lavender-violet accent (#cdcbff) punctuates the interface like a dawn light. The visual system is dark-first — the entire page sits on the deep teal, including cards, navigation, and footer — creating a nocturnal, private-banking atmosphere rather than a typical SaaS light mode. Typography is the hero: a custom serif display face renders numerical and headline copy at extreme sizes (90–216px) with tight negative tracking, while a neutral sans handles all UI chrome. Surfaces are flat with minimal elevation; depth comes from tonal shifts between near-black teals and occasional earth-toned full-bleed bands (olive grove, mint wash). Photography is warm-toned lifestyle — people in natural light, working — contained within rounded cards that sit on the dark canvas.

## Colors

| Name | Value | Role |
|------|-------|------|
| Abyssal Teal | `#001d21` | Page canvas, hero background, navigation surface, footer, primary text on light surfaces — the void that everything sits on |
| Deep Reef | `#002b31` | Elevated card surfaces, secondary buttons, filled chip backgrounds — one tonal step above the canvas to create subtle depth without leaving the dark family |
| Bio Mint | `#e0fee6` | Display headlines, hero copy, large numerical type — bioluminescent mint that carries the brand's visual identity on the dark canvas |
| Lavender Dawn | `#cdcbff` | Violet text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Vivid Iris | `#3a25f5` | Outlined link borders, chromatic accent borders, selected/active link text — high-saturation violet for moments that need a sharper electric accent |
| Pale Periwinkle | `#bdbbff` | Secondary button fill, hover state for lavender actions — lighter wash of the primary violet for tonal stepping |
| Mint Whisper | `#cdeed3` | Navigation accents, stroke details, secondary mint highlights — a desaturated version of the headline mint for subtle interface details |
| Olive Grove | `#5d5337` | Full-bleed earth-toned section background, warm break-band — introduces an unexpected organic warmth to the dark system |
| Dark Olive | `#544a2e` | Borders and text within olive-toned sections, link borders on warm bands |
| Fog Veil | `#f1f3f2` | Light surface break, navigation pill backgrounds, light-mode card surfaces — the neutral that appears when the system briefly surfaces to light |
| Paper White | `#ffffff` | Outlined button text, light card surfaces, inverted text on dark, image card content backgrounds |
| Graphite | `#1d2a29` | Subtle dark borders, hairline dividers within dark sections |
| Steel | `#68706f` | Body text on light surfaces, muted helper text, secondary copy |
| Ash Border | `#ccd5d6` | Hairline borders across all surfaces, card outlines, divider lines, subtle structural edges |
| Pewter | `#e1e3e3` | Secondary text on light cards, muted body copy, icon fills in neutral contexts |

## Typography

### angellistDisplay — Display serif — reserved for hero headlines, section titles, and large numerical statements (e.g. $171B). Its single weight at 400 with extreme negative tracking (-0.04em to -0.05em) creates a compressed, sculptural quality. A serif at fintech scale is anti-convention; the choice signals editorial confidence over utility-app sterility. Substitute: 'GT Sectra', 'Tiempos Headline', or 'DM Serif Display'.
- **Substitute:** GT Sectra
- **Weights:** 400
- **Sizes:** 28px, 38px, 60px, 90px, 112px, 216px
- **Line height:** 0.90–1.30
- **Letter spacing:** -0.04em at 60–112px, -0.05em at 216px

### angellist — Primary sans for all UI, body, navigation, buttons, cards, and micro-copy. Weights step cleanly from 400 (body) to 600 (subheadings) to 700 (emphasis). The tall line-heights (up to 2.64 for oversized text) and tabular numerals make it a working interface face. Font features 'lnum' and 'tnum' ensure consistent digit widths in financial contexts. Substitute: 'Inter', 'GT America', or 'Söhne'.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 18px, 90px, 216px
- **Line height:** 1.10–2.64
- **Letter spacing:** -0.005em at 16px, -0.003em at 14px, -0.002em at 12px, 0.01em at small caps, 0.08em for labels
- **OpenType features:** `"lnum", "ss01", "tnum"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 0.08px |
| heading-sm | — | — | 18px | 1.4 | -0.005px |
| heading | — | — | 28px | 1.25 | -0.04px |
| heading-lg | — | — | 38px | 1.2 | -0.04px |
| display | — | — | 90px | 1.1 | -0.05px |
| display-xl | — | — | 216px | 0.9 | -0.05px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 9999px
- **cards:** 4px
- **pills:** 9999px
- **buttons:** 9999px

## Components

### Lavender Filled Button
**Role:** Primary action CTA (header, high-emphasis)

Filled button with #cdcbff background, #001d21 text, 9999px (pill) radius, 10px 18px padding, 14px angellist weight 500. Text is the dark abyssal teal, creating high-contrast readability against the soft violet. Used sparingly — only the most important single action per section.

### Outlined Ghost Button
**Role:** Secondary action CTA on dark canvas

Transparent background with 1px #ffffff border, #e0fee6 (Bio Mint) text, 9999px radius, 10px 18px padding, 14px angellist weight 500. Sits on the dark teal canvas as the default body-level CTA. Mint text + white border = signature dark-mode button.

### Header Contact Sales Button
**Role:** Persistent top-right CTA

Lavender filled button (#cdcbff) with #001d21 text, slightly smaller than body CTAs. Always visible in the sticky header, contrasting against the dark navigation bar.

### Navigation Pill
**Role:** Centered top nav container

Rounded pill container (9999px radius) with subtle #f1f3f2 or translucent background holding Products, Solutions, Pricing, Resources links. Links use 14px angellist weight 400 in #e0fee6 mint. Each nav item has a small chevron indicator for dropdowns.

### Product Card
**Role:** Feature card in 4-column grid (Venture Funds, SPVs, Scout Funds, Digital Subscriptions)

Full-bleed photography card on dark canvas. Image fills the card top portion with 4px radius, followed by white headline text (16px weight 600) and description (13px weight 400 in #e1e3e3). Right-pointing arrow link in mint. No visible card border — photography edges define the card.

### Section Divider
**Role:** Horizontal rule between sections

Thin 1px line in #ccd5d6 spanning the content width, used to separate the product grid from the partner logos section.

### Partner Logo Bar
**Role:** Trust/credibility strip

Single row of 5 partner logos centered on the dark canvas, rendered in white/monochrome. No background card — logos float directly on #001d21. A pill-shaped outlined link button sits below: 'Our premier partnership program…' with arrow.

### Fund Description Banner
**Role:** Full-bleed light section with circular avatar portraits

Light mint background (#cdeed3 or pale green wash) containing a short descriptive paragraph and an underlined text link, with 3–4 circular avatar cutouts on the right edge. Creates a visual break from the dark canvas using the brand's mint family.

### By The Numbers Display Block
**Role:** Large numerical statement section

Full-bleed olive (#5d5337) background. Left column: section label, headline ('Fueling innovation') in angellistDisplay at 90px in mint/light color, and body copy in light text. Right column: monumental numerical display (e.g. '$171B') at 216px in angellistDisplay, with a caption below ('Assets on platform'). The oversized serif numeral on earth-toned ground is the system's most dramatic moment.

### Announcement Chip
**Role:** Hero eyebrow link (e.g. 'Explore the Fund Benchmarks Report 2025')

Subtle dark pill (#002b31 background) with #e0fee6 mint text at 12–13px weight 400, 9999px radius, 4px 12px padding. Includes a right arrow icon. Sits above the hero headline as a navigational teaser.

### Inverted Light CTA
**Role:** CTA appearing on light/mint sections

Outlined button with #002b31 border and #002b31 text, 9999px radius, sitting on light green (#cdeed3) background. Inverts the standard dark-mode ghost button for use on the rare light surface.

## Do's and Don'ts

### Do
- Use #001d21 as the default canvas for all full-page layouts; the dark teal is the system's identity, not a theme toggle.
- Render display headlines in angellistDisplay weight 400 at 60–216px with -0.04em to -0.05em letter-spacing; the serif compressed tight is the brand's most recognizable moment.
- Use #e0fee6 (Bio Mint) for all text and display type sitting on the dark canvas; never use pure white for primary text on #001d21.
- Apply 9999px radius to all buttons, chips, and navigation containers; 4px radius for content cards. Do not mix intermediate radii.
- Use #cdcbff (Lavender Dawn) filled buttons for single primary actions per section; pair with ghost outlined buttons in white/mint for secondary actions.
- Set font-feature-settings to 'lnum', 'ss01', 'tnum' on all text rendering; tabular numerals are critical for financial data.
- Separate sections with 80px vertical gaps and thin 1px #ccd5d6 divider lines on the dark canvas.

### Don't
- Do not introduce drop shadows anywhere in the interface; depth comes from tonal stepping between #001d21 and #002b31 only.
- Do not use pure white (#ffffff) as body text on the dark canvas; use #e0fee6 (Bio Mint) for primary text and #e1e3e3 (Pewter) for secondary.
- Do not apply intermediate border radii (8px, 12px) to buttons or chips; the system is binary: 4px for cards, 9999px for interactive elements.
- Do not use the multi-color gradient as a page or section background; it is a decorative brand swatch only, never a surface treatment.
- Do not place more than one filled lavender (#cdcbff) CTA per section; the violet should feel like a singular warm point, not scattered.
- Do not use angellistDisplay for body copy or UI labels; reserve it exclusively for display-scale headlines (60px+) and numerical statements.
- Do not introduce light-mode as a default; the system is dark-first. Light surfaces (#f1f3f2, #cdeed3) appear only as intentional break bands, not as page backgrounds.

## Elevation

- **Product Cards:** `none — flat photography edges on dark canvas define the card boundary without shadow`
- **All UI elements:** `none — the system avoids drop shadows entirely`

## Surfaces

- **Abyssal Teal** (`#001d21`) — Base page canvas — the dark teal void that fills the viewport
- **Deep Reef** (`#002b31`) — Card and button surface — subtle elevation within the dark family
- **Fog Veil** (`#f1f3f2`) — Light break surface — navigation pill, occasional light-band sections
- **Olive Grove** (`#5d5337`) — Earth-toned full-bleed band — warm contrast section

## Imagery

Photography is warm, natural-light lifestyle: people working with phones, in meetings, outdoors. Images are full-bleed within cards with 4px radius corners, never masked into circles. The tone is golden-hour warm against the cool teal canvas — a deliberate warm/cool tension. The fund description banner uses circular avatar crops for faces. No product screenshots or abstract 3D renders appear; the photography carries all the human warmth. The only non-photographic visual is a multi-color gradient swatch that appears as a decorative brand element.

## Layout

Full-bleed dark canvas with max-width 1280px centered content. Hero is a left-aligned text block (headline + subhead + CTA) on the dark void with no hero image — the typography is the hero. Below: 4-column equal-width product card grid with generous gutters. A thin divider line separates the partner logo strip (centered single row). Then a full-bleed light mint band with text-left, avatars-right composition. Finally, a full-bleed olive section with a 2-column split: descriptive text left, monumental numeral right. Navigation is a centered pill floating in the header, not a full-width bar. Section gaps are 80px. The rhythm is: dark → dark → dark → light break → dark → warm break → dark.

## Similar Brands

- **Mercury** — Same dark-teal financial aesthetic with full-bleed dark canvas and warm-toned photography; both use a single restrained accent color for actions.
- **Plaid** — Dark-mode fintech with large display type, minimal elevation, and a deep near-black canvas; both let typography carry hierarchy without surface layering.
- **Brex** — Bold dark canvas with oversized numerical/statistical display type and minimal card elevation; both treat financial data as visual centerpiece.
- **Linear** — Dark-mode product UI with pill-shaped navigation and buttons, tight letter-spacing on large type, and a near-monochrome palette with single accent color.
- **Arc** — Dark-canvas financial interface with pill navigation, warm photography contrasting cool canvas, and restrained single-accent CTA system.
