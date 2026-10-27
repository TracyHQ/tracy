# Ecosia — Style Reference
> verdant search clearing — a white-canvas interface with a single lime-green accent and full-bleed leaf photography as the only chromatic noise.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ecosia positions itself as a verdant search engine: a clean white-canvas interface where one vivid lime-green accent (#d7eb80) acts as the brand's single chromatic punctuation against an otherwise monochrome system. The hero is a full-bleed nature photograph — a leaf-canopied backdrop that reframes the search bar as a clearing — while every other section returns to white space, warm off-white cards, and Founders Grotesk headlines. Components lean soft and rounded: 20px card radii, pill-shaped buttons at 9999px, generous 40-48px section gaps, and a single translucent dark stat overlay floating above the hero photo. The overall rhythm is one confident page, one quiet page, one page with a colorful donut chart — the system uses color sparingly so the lime accent and the nature photography carry the emotional weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lime Canopy | `#d7eb80` | Primary action buttons, brand accent border, surface highlight — the single chromatic accent; warm yellow-green reads as young foliage and gives the CTA a nature-coded urgency without alarm |
| Ink Black | `#333333` | Primary text, icon strokes, hairlines, structural borders, footer text — carries the entire interface's information hierarchy |
| Paper White | `#ffffff` | Page background, card surfaces, button text on lime fills, search bar fill — the dominant canvas |
| Warm Mist | `#f8f8f6` | Secondary card surfaces, subtle elevated panels — a barely-warm off-white that softens the page from clinical white |
| Linen Cream | `#f0f0eb` | Tertiary card surfaces, section backgrounds — the warmest neutral, used as gentle banding between content blocks |
| Stone Gray | `#6c6c6c` | Secondary text, link borders, icon strokes, muted descriptions, footer secondary copy |
| Ash Border | `#bebeb9` | Medium-contrast borders, control outlines, and structural separators. Do not promote it to the primary CTA color |
| Silver Surface | `#b6b6b6` | Occasional card surface or muted image treatment — the deepest achromatic before true shadow territory |

## Typography

### Inter — Body text, UI controls, labels, captions, links, buttons, input fields, badges, list items, footer. Inter is the workhorse — neutral and highly legible at 14-16px body, with 600 for emphasis and 700 reserved for compact labels. Positive tracking of 0.006-0.007em gives body copy a slightly airier feel than Inter's default.
- **Substitute:** Inter (Google Fonts) — directly available
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 18, 20px
- **Line height:** 1.40
- **Letter spacing:** 0.006-0.007em (~0.1px at body size)
- **OpenType features:** `"cv11", "ss01" on (Ecosia applies stylistic alternates and character variants to Inter for a more custom feel)`

### Founders Grotesk — Display headlines, section headings, hero text, large feature titles. Founders Grotesk is the signature typeface — used at 48-54px for hero and section titles with tight 1.10 line-height. The combination of geometric grotesk with Ecosia's lime accent and leaf photography creates the brand's editorial, magazine-meets-environment tone. No tracking adjustments — Founders handles its own optical spacing.
- **Substitute:** Inter Tight or Space Grotesk at matched weights, or General Sans
- **Weights:** 400, 600, 700
- **Sizes:** 16, 24, 36, 48, 54px
- **Line height:** 1.10-1.30

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0.084px |
| body-sm | — | — | 14px | 1.4 | 0.098px |
| body | — | — | 16px | 1.4 | 0.112px |
| subheading | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 20px | 1.3 | — |
| heading | — | — | 24px | 1.3 | — |
| heading-lg | — | — | 36px | 1.15 | — |
| display | — | — | 48px | 1.1 | — |
| display-lg | — | — | 54px | 1.1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 20px
- **chips:** 9999px (pill)
- **links:** 4px
- **inputs:** 9999px (pill)
- **buttons:** 9999px (pill)

## Components

### Pill CTA Button (Lime)
**Role:** Primary action — the brand's signature button

Fully pill-shaped at 9999px radius. Background: #d7eb80 (Lime Canopy). Text: #333333 (Ink Black), Inter 14-16px weight 600. Padding: 11-15px vertical, 16-24px horizontal. No border. Single small icon optional at 16px in #333333 to the left of text. This is the only filled chromatic button in the entire system.

### Outlined Ghost Button
**Role:** Secondary action

Pill-shaped at 9999px radius. Transparent background, 1px border in #333333. Text: #333333, Inter 14-16px weight 500. Padding: 11-15px vertical, 19-24px horizontal. Used for lower-emphasis actions like 'See our reports'.

### Hero Search Bar
**Role:** Primary interaction — the search input

Massive pill input, 9999px radius, white background (#ffffff), sits centered over the green hero photo. Height ~56-64px. Left: 16px magnifying glass icon in #333333. Placeholder text 'Search the web...' in #6c6c6c, Inter 16px. Right side: a small outlined pill chip '+ AI Chat' with 1px #333333 border, 12px Inter weight 500.

### Nature Image Card
**Role:** Value proposition or feature card

Rounded rectangle at 20px radius, full-bleed nature photograph filling the card. Below the image: bold title in Inter 16-18px weight 700, #333333. Body description in Inter 14-16px weight 400, #6c6c6c, 1.40 line-height. No visible card border or shadow — the image itself provides containment. 4-column grid layout with 24-32px column gap.

### Floating Stats Card
**Role:** Live metric display over hero photo

Dark translucent panel (background approx rgba(0,0,0,0.2-0.4) with blur), 20px radius, 24-32px padding. Contains a 20px icon (tree or euro) in #d7eb80 followed by a large number in white Inter 18-20px weight 700, and a small label in #d7eb80 or white Inter 12px. Shadow: rgba(0,0,0,0.2) 0px 11px 33px 0px lifts it above the photo. Displayed as a horizontal row of 2-3 stats.

### Section Header (Eyebrow + Title)
**Role:** Section introduction

Centered stack. Eyebrow: uppercase Inter 12-14px weight 700, letter-spacing 0.1-0.15em, #6c6c6c. Title: Founders Grotesk 36-48px weight 600-700, #333333, line-height 1.10-1.15. 40-48px vertical gap between eyebrow and title.

### Split Content Block (Text + Image)
**Role:** Long-form content with supporting visual

Two-column layout, roughly 50/50. Left column: eyebrow label (uppercase Inter 12px, #6c6c6c), heading (Founders Grotesk 24-36px weight 700, #333333), body paragraph (Inter 16px weight 400, #6c6c6c), optional outlined button. Right column: 20px-radius image filling its column, aspect ratio roughly 4:3 or 3:2.

### Financial Donut Chart
**Role:** Transparency visualization

Colorful donut chart on neutral background. Segments use: #2d8c3a (deep green — largest segment), #e44b4b (coral red), #f5c542 (golden yellow), #3aa8e0 (sky blue), #f0a0a0 (soft pink). Center label shows a large currency amount in Inter 24-36px weight 700, #333333, with a small caption in #6c6c6c below. Sits in a light card (#f8f8f6) with 20px radius.

### Wordmark Logo
**Role:** Brand identity

Simple wordmark 'ECOSIA' in Inter 18-20px weight 700, uppercase, letter-spacing 0.05em, #333333. Sits in the top-left corner of the page.

### Switch CTA (Top-Right Pill)
**Role:** Persistent conversion trigger

Lime Canopy (#d7eb80) pill button, 9999px radius, Inter 13-14px weight 600, #333333 text reading 'Switch to Ecosia — it's free'. Includes a small leading icon. Fixed in the top-right of every page. This is the brand's most repeated element.

### Chip / Tag
**Role:** Inline label or category marker

Small pill (9999px), 8-12px vertical padding, 12-16px horizontal. Light neutral background (#f0f0eb or #f8f8f6) or transparent with 1px #333333 border. Inter 12-14px weight 500, #333333.

## Do's and Don'ts

### Do
- Use #d7eb80 Lime Canopy as the only chromatic accent in the entire interface — it is the brand's signature and loses all meaning if diluted across multiple accent colors.
- Set all interactive buttons to 9999px pill radius — pill shapes are the system's defining component geometry, applied to buttons, search, and chips uniformly.
- Set card and image radii to 20px — this is the only large radius in the system and gives surfaces a soft, non-clinical feel.
- Set section gaps to 80px (10× base unit) to maintain the comfortable, breathable page rhythm — the system values whitespace over information density.
- Pair Founders Grotesk 36-54px weight 600-700 with tight 1.10-1.15 line-height for all section titles and hero text.
- Use Inter for everything below the display level — body, buttons, inputs, labels, badges, footer — and let the two typefaces create a clear editorial hierarchy.
- Anchor the hero with a full-bleed nature photograph and overlay the floating stats card with its 33px-blur shadow — this is the page's emotional centerpiece.

### Don't
- Never use any color other than #d7eb80 as a fill for primary action buttons — secondary buttons must be outlined in #333333, not filled with a different chromatic.
- Avoid square corners or radii below 10px on cards and images — the system commits to 20px softness.
- Do not use Founders Grotesk for body text or UI labels — it is reserved for 24px+ display contexts where its editorial character can be felt.
- Avoid adding gradients — the system is deliberately flat; all visual depth comes from photography, the single shadow token, and card surface stepping.
- Do not stack more than one dark or translucent surface on the page — the dark stats overlay over the hero photo is the only shadow-driven elevation in the system.
- Avoid dense information layouts — the comfortable spacing profile means 40-80px section gaps, not 16-24px.
- Never use #000000 as a replacement for #333333 — the slightly lifted black preserves the warm, paper-like atmosphere of the canvas.

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background and dominant content surface
- **Soft Card** (`#f8f8f6`) — Elevated cards, feature panels with subtle warmth
- **Warm Band** (`#f0f0eb`) — Section banding, tertiary card surfaces, gentle visual separation
- **Hero Photo + Stat Overlay** (`#d7eb80 / rgba(0,0,0,0.2)`) — Full-bleed leaf photography with a floating dark translucent stat card on top

## Imagery

Photography is the system's primary visual content and emotional driver. All photography is nature-focused: dense leaf canopies, forest clearings, hands holding phones, wildflowers, solar panel arrays, aerial landscape shots of reforestation sites. Images are tightly cropped, high-resolution, and full-color — no duotone treatment or desaturation. Card images are 20px-radius contained, hero photography is full-bleed edge-to-edge. A single dark translucent overlay (rgba(0,0,0,0.2-0.4) with 11px/33px shadow) is used to lift the stats card above the hero photo. The financial transparency section introduces a colorful infographic (donut chart) using the brand's nature-coded palette (green, coral, yellow, blue, pink) — this is the only non-photographic visual. No illustrations, no 3D renders, no abstract graphics. Icons are simple line/glyph style in #333333, 16-20px.

## Layout

The page model is max-width contained (~1200px) for content sections, but the hero breaks to full-bleed. Section rhythm alternates between full-bleed nature photography (hero) and white-canvas content blocks. Content sections follow three patterns: (1) centered stack with eyebrow + heading + 4-column card grid, (2) two-column split with text-left/image-right, (3) two-column split with visualization-left/text-right. Vertical spacing between sections is generous at 80px. The hero is centered — headline, search bar, and stats all stack vertically in the center of a full-viewport green photograph. Navigation is minimal: wordmark top-left, single lime CTA top-right, no hamburger menu, no sidebar. The page is scroll-driven with a subtle scroll-down chevron at the bottom of the hero inviting exploration.

## Similar Brands

- **DuckDuckGo** — Same privacy-focused search engine category with a single dominant accent color and clean white-canvas interface.
- **Evernote** — Similar soft-rounded card aesthetic with 20px radii and a green-leaning brand palette for nature/productivity crossover.
- **Headspace** — Same warm off-white card surfaces (#f8f8f6 family), generous 80px section gaps, and photography-driven hero sections.
- **Notion** — Same near-monochrome interface with one soft accent, warm off-white surfaces, and pill-shaped interactive controls.
- **Allbirds** — Same nature-brand visual language pairing full-bleed environmental photography with a quiet white-canvas product page.
