# Getharvest — Style Reference
> Golden hour workbench — warm cream canvas, white floating cards, and one vivid orange flame.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Harvest uses a sunlit productivity-workspace language: warm cream canvas (#fff8f1) replaces the typical SaaS white, giving every screen a golden-hour warmth, while white cards and panels float above that base for product surfaces. One vivid orange (#fa5d00) carries all the energy — every CTA, link, icon accent, and brand border — making it the only chromatic decision in an otherwise achromatic system of warm grays. Typography is confident and editorial: a geometric sans (MuotoWeb) for everything functional, with a serif display face (Monarch) reserved for hero-grade emotional moments. Components are soft and tactile: 16–20px radii, low warm-tinted shadows, generous breathing room, and decorative orange wash gradients that suggest movement without ever competing with content.

## Colors

| Name | Value | Role |
|------|-------|------|
| Harvest Flame | `#fa5d00` | Primary CTA fill, active nav indicator, brand link color, heading underlines — warm vermilion that reads as energetic but not aggressive, the single chromatic decision in an otherwise achromatic system |
| Marigold Glow | `#fee3b5` | Soft warm highlight wash on cards, decorative glow tint behind product UI — never functional, only atmospheric |
| Parchment Shadow | `#e3d6c5` | Warm-tinted card shadow color, subtle image shadow — the shadow hue is not neutral gray but matches the cream base |
| Ink Black | `#1d1e1c` | Primary text, icon strokes, nav borders, card headings — warm near-black rather than pure #000, preserves the system warmth |
| Paper White | `#ffffff` | Card surfaces, input fields, elevated panels, button text on orange fill |
| Cream Canvas | `#fff8f1` | Page background, hero section base, nav backdrop — the signature warm cream that replaces standard SaaS white |
| Mist Gray | `#d9d9d9` | Hairline dividers, subtle borders on neutral surfaces |
| Warm Stone | `#615f5c` | Secondary body text, list items, muted icon strokes |
| Driftwood | `#8e8b87` | Tertiary body text, decorative strokes, subtle metadata |
| Ironwood | `#4a4a47` | Strong secondary text, emphasized muted labels |
| Ash | `#777571` | Helper text, placeholder-adjacent copy, low-priority borders |
| Bone | `#c0bbb6` | Input borders, form field outlines at rest |
| Smoke | `#a5a19c` | Disabled text, decorative borders, very low-priority separators |
| Graphite | `#999999` | List borders, tertiary structural lines |

## Typography

### MuotoWeb — Primary UI and body typeface — geometric sans covering navigation, buttons, body copy, subheadings, and most headings up to 50px. Custom-drawn letterforms give it warmth that generic Inter or Helvetica cannot: slightly humanist terminals and open apertures that read friendly rather than cold.
- **Substitute:** Inter or Sohne
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13, 14, 16, 17, 18, 20, 22, 24, 25, 26, 28, 34, 48, 50
- **Line height:** 1.15–1.50
- **Letter spacing:** 0.015em
- **OpenType features:** `"ss01" on, "cv11" on`

### Monarch — Hero display serif — used only for the largest emotional headline (72px) where editorial weight is needed. The serif is the signature contrast against MuotoWeb's sans body: the page whispers functional in sans, then ROARS one moment in serif. Reserve for hero/page-title moments only.
- **Substitute:** GT Super or Tiempos Headline
- **Weights:** 400
- **Sizes:** 72
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.35 | 0.2px |
| subheading | — | — | 18px | 1.4 | 0.27px |
| heading-sm | — | — | 20px | 1.3 | 0.3px |
| heading | — | — | 24px | 1.26 | 0.36px |
| heading-lg | — | — | 28px | 1.2 | 0.42px |
| display | — | — | 48px | 1.15 | 0.72px |
| display-lg | — | — | 72px | 1.2 | 0px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 32-40px
- **Element gap:** 16-24px

### Border Radius

- **tags:** 999px
- **cards:** 20px
- **images:** 16px
- **inputs:** 16px
- **buttons:** 16px

## Components

### Primary CTA Button
**Role:** Filled orange action button — the system’s single most important interactive element

Fill: #fa5d00. Text: #ffffff, MuotoWeb 16px weight 600, letter-spacing 0.015em. Padding: 12px 24px. Border-radius: 16px. Shadow: rgba(0,0,0,0.2) 0px 1px 4px 0px for subtle lift. Hover darkens the orange ~10%. Used for: 'Try Harvest free', 'Get started for free', 'Start your free trial'.

### Ghost/Text Link
**Role:** Secondary action — 'Learn more' style links under feature cards

Text: #fa5d00, MuotoWeb 16px weight 500. No background, no border, no padding. May carry a small → arrow icon. Underline appears on hover.

### Email Input Field
**Role:** Hero form input for email capture

Fill: #ffffff. Border: 1px solid #c0bbb6. Border-radius: 16px. Padding: 14px 20px. Placeholder text: #8e8b87 16px. Focus ring: #fa5d00 2px outline with 4px offset.

### Feature Card
**Role:** Three-column feature highlight card with icon, heading, body, and link

Fill: #fff8f1 (cream, same as canvas — depth comes from shadow not contrast). Border-radius: 20px. Padding: 40px 32px. Optional shadow: rgba(250,166,0,0.25) 6px 4px 24px 0px for warm glow. Icon: dark #1d1e1c at 48px. Heading: MuotoWeb 20-24px weight 600 #1d1e1c. Body: 16px weight 400 #615f5c. Link: orange #fa5d00 weight 500.

### Integration Logo Circle
**Role:** Round badge displaying third-party app logos

48px circle, fill #ffffff, contains colorful third-party brand logo (not a system color — logos are literal brand marks). Arranged in horizontal or grid patterns to show ecosystem breadth.

### Navigation Bar
**Role:** Top sticky navigation with logo, menu items, sign-in, and primary CTA

Background: #fff8f1 with 1px solid #fff8f1 border (subtle). Logo: orange 'harvest' wordmark with bar-chart icon. Nav links: MuotoWeb 16px weight 500 #1d1e1c. Dropdown chevrons on Features, Why Harvest, Resources. Right side: 'Sign in' as ghost link + 'Try Harvest free' as primary orange CTA.

### Dashboard Preview Card
**Role:** Product screenshot container — shows actual app UI as social proof

White surface (#ffffff) with border-radius 16px, soft shadow, contains literal Harvest product screenshots (timesheet grid, profitability report with bar/line charts). Used in hero area as floating proof elements.

### Section Heading (Eyebrow + Title)
**Role:** Reusable section header pattern with small uppercase label and large title

Eyebrow: MuotoWeb 14px weight 600 uppercase, letter-spacing 0.015em, #fa5d00 (e.g., 'WHY HARVEST'). Title: MuotoWeb 34-48px weight 400-500 #1d1e1c, centered, max-width ~700px. Optional subtitle in #615f5c 17px.

### Trust Badge Logo Row
**Role:** Grayscale logo strip for social proof — 'TRUSTED BY 70,000+ COMPANIES'

Label: MuotoWeb 13px weight 600 uppercase #615f5c with #fa5d00 highlight on the number. Logos: rendered in #1d1e1c grayscale at 60-80% opacity, evenly spaced horizontal row. No logos are colored — the grayscale treatment keeps the orange accent uncontested.

### Hero Gradient Wash
**Role:** Decorative flowing gradient background behind hero content

Soft flowing wash of #fa5d00, #fee3b5, and warm peach tones rendered as an organic flowing shape (not a hard gradient strip). Low opacity (~30-50%), positioned behind the product preview cards. Creates sense of warmth and movement without ever competing with text.

### Feature Grid (2-column)
**Role:** Alternating two-column layout: heading+body left, product screenshot right

Max-width container with 2 equal columns, 40px gap. Left column: heading, paragraph body, optional inline CTA. Right column: product screenshot or illustration. Background alternates: #fff8f1 base with white cards floating above.

## Do's and Don'ts

### Do
- Use #fa5d00 exclusively for primary actions, active states, and brand moments — never for body text or large decorative areas where it would overwhelm the cream canvas
- Set all page backgrounds to #fff8f1 (cream), not #ffffff — the warmth is the system identity
- Reserve Monarch serif for hero-grade 72px display headlines only; use MuotoWeb for all headings 50px and below
- Apply 16px radius to all buttons and inputs, 20px radius to all cards — these two values are the system's tactile signature
- Use 0.015em positive letter-spacing on all MuotoWeb text — this tracks-wide feel softens the geometric sans into something friendlier
- Keep shadows warm-tinted (rgba(250,166,0,0.25) for cards, rgba(0,0,0,0.2) for buttons) — never use cold blue or neutral gray shadows that would fight the cream base
- Place trust/partner logos in grayscale (#1d1e1c) so the orange accent remains the only chromatic focal point

### Don't
- Don't use #ffffff as the page background — the cream #fff8f1 canvas IS the brand
- Don't introduce a second accent color — the system's discipline is one orange against warm neutrals
- Don't use Monarch serif for body text, subheadings, or anything under 48px — it dilutes the hero impact
- Don't use sharp 0-4px corner radii on cards or buttons — the 16-20px softness is essential to the warm tactile feel
- Don't use cool blue-tinted shadows or borders — everything in this system carries a warm undertone
- Don't apply saturated colors to large background fills — keep the orange small, concentrated, and functional
- Don't use pure #000000 for text — #1d1e1c (warm near-black) preserves the system's warmth

## Elevation

- **Primary CTA Button:** `rgba(0, 0, 0, 0.2) 0px 1px 4px 0px`
- **Feature Card (soft warm glow):** `rgba(250, 166, 0, 0.25) 6px 4px 24px 0px`

## Surfaces

- **Cream Canvas** (`#fff8f1`) — Page-level background — the warm cream base that defines the entire system mood
- **Paper White** (`#ffffff`) — Card and elevated surface — floats above the cream canvas to create product depth
- **Orange Brand Surface** (`#fa5d00`) — CTA buttons, active states, and brand accent surfaces — the only chromatic surface

## Similar Brands

- **Toggl Track** — Same warm cream + orange palette, same time-tracking product focus, same soft rounded card aesthetic with single-accent-color discipline
- **FreshBooks** — Same warm approachable SaaS feel with orange accent, cream backgrounds, and product-screenshot-as-hero treatment
- **Notion** — Same generous whitespace and warm-neutral palette approach, though Notion uses black where Harvest uses warm near-black and orange
- **Basecamp** — Same friendly productivity-tool voice with warm backgrounds and rounded components, though Basecamp leans more colorful where Harvest stays disciplined to one orange
- **QuickBooks** — Same professional-services workflow focus with warm UI palette and product-preview hero pattern
