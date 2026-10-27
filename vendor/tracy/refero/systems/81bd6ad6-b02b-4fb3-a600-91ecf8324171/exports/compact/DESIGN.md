# August Health EHR — Style Reference
> Warm cream pharmacy with violet ink — a humanist clinical surface that softens healthcare's typical sterility.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

August Health uses a warm-clinical visual language: a soft cream canvas (#f8f3eb) replaces the cold white typical of healthcare SaaS, and shadows are tinted with warm brown rgba(75,68,57,0.1) rather than cool gray. The pairing of an editorial serif (Reckless Neue) with a geometric sans (Saans) gives the product an approachable, humanist feel appropriate for senior care, while a vivid indigo (#4865ff) anchors all primary actions. Color appears in concentrated bursts — circular portrait frames, tinted feature cards, and pill buttons — against an otherwise restrained neutral palette, creating rhythm and warmth without overwhelming the interface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Primary Indigo | `#4865ff` | Primary action buttons, active nav state, icon accents — the single saturated focal color that makes CTAs unmistakably interactive |
| Deep Ink | `#080331` | Headlines, body text, primary borders — near-black violet that pairs warmth with the serif typeface |
| Midnight Violet | `#1b1463` | Navigation borders, secondary surfaces, gradient terminus — darker sibling to Primary Indigo for layered depth |
| Forest | `#328a3b` | Green action color for filled buttons, selected navigation states, and focused conversion moments |
| Ember | `#ff6d39` | Tinted card surfaces, portrait frame backgrounds — warm orange that signals energy and human warmth |
| Blossom | `#f098d7` | Tinted feature card backgrounds, hero photo frame — mid-pink for category-coded surfaces |
| Petal | `#ffaefe` | Light pink surface washes and button backgrounds — lightest tint in the pink family for soft fills |
| Meadow | `#114e0b` | Dark green button background variant — deep saturated green for contrasting pill buttons |
| Lavender Mist | `#a2baff` | Outlined/ghost button borders, subtle violet washes — soft tint version of Primary Indigo |
| Cream | `#f8f3eb` | Page canvas, section backgrounds, link surfaces — the warm off-white base layer that defines the entire mood |
| Stone | `#333333` | Link and icon text — slightly lighter than pure black for secondary text |
| Pure White | `#ffffff` | Card surfaces, button text, inverted elements — the clean surface that sits on top of cream |
| True Black | `#000000` | Primary text, maximum-contrast borders, heading strokes |
| Info Blue | `#dce4fb` | Badge backgrounds for informational tags — near-gray blue for low-emphasis status indicators |

## Typography

### Reckless Neue — All headings and display text. A contemporary editorial serif used exclusively at weight 400 (regular) — no bold. This is anti-convention: most healthtech brands use sans-serif or bold serifs; the regular-weight serif at large sizes creates a literary, trustworthy quality without shouting. Largest sizes (48-64px) anchor section headlines, while 24-32px serves subheadings.
- **Substitute:** DM Serif Display or Source Serif 4
- **Weights:** 400
- **Sizes:** 24px, 32px, 48px, 64px
- **Line height:** 1.0-1.3

### Saans — Body text, UI controls, navigation, buttons, cards, labels, and everything non-headline. Weight 400 for body and descriptions, weight 500 for buttons and nav links where slight emphasis is needed. The geometric humanist sans provides clarity and warmth at small sizes, contrasting the editorial serif headings.
- **Substitute:** Inter or DM Sans
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 20px, 24px
- **Line height:** 1.0-1.6

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.6 | 0px |
| body-sm | — | — | 14px | 1.4 | 0px |
| body | — | — | 16px | 1.6 | 0px |
| subheading | — | — | 20px | 1.3 | 0px |
| heading-sm | — | — | 24px | 1.3 | 0px |
| heading | — | — | 32px | 1.1 | 0px |
| heading-lg | — | — | 48px | 1.1 | 0px |
| display | — | — | 64px | 1 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **nav:** 100px
- **cards:** 16px
- **links:** 24px
- **badges:** 1600px
- **images:** 1600px
- **buttons:** 1600px
- **special:** 100px

## Components

### Primary CTA Button
**Role:** Main call-to-action across all pages

Indigo (#4865ff) background, white text, 1600px border-radius (full pill), 8-12px vertical padding with 16-24px horizontal padding, Saans weight 500 at 14-16px. Casts the warm-tinted double shadow (rgba(75,68,57,0.1) at 12px/24px and 48px/48px offsets).

### Ghost/Text Button
**Role:** Secondary actions and inline links

Transparent background, Deep Ink (#080331) text, no border, Saans weight 500. Sometimes paired with an arrow icon. Used for navigation dropdowns and less prominent actions.

### Pill Navigation Bar
**Role:** Sticky top navigation

White (#ffffff) background with 1600px border-radius, floats above the cream canvas with warm-tinted shadow. Contains logo (left), nav links (center, Saans 14px weight 500), and CTA button (right). Internal spacing: 16-24px horizontal padding, 12-14px vertical.

### Tinted Feature Card
**Role:** Product capability showcase

16px border-radius, 32px padding, colored background fill (Forest #328a3b, Blossom #f098d7, or other accent tints). Contains a small icon, serif subheading (Reckless Neue 24px), body description (Saans 16px), and a circular arrow button (white, 100px radius) in the top-right corner.

### White Product Card
**Role:** UI screenshot or detailed feature container

White (#ffffff) background, 16px border-radius, 32px internal padding. Contains product UI screenshots or detailed feature breakdowns. Sits on cream canvas to create contrast layers.

### Circular Portrait Frame
**Role:** Hero decorative photography

Circular image masks (essentially 50% border-radius or large radius values) containing portrait photography, set inside larger solid-color circles (pink, green, orange, white). These create the hero's signature scattered decorative composition and break the rectangular grid.

### Info Badge/Pill
**Role:** Category labels and tags

1600px border-radius, 10px vertical padding, small text (Saans 12px). Used for section labels like 'THE PLATFORM', 'CASE STUDIES', and 'August Intelligence' indicators with a small icon prefix.

### Video Player Block
**Role:** Case study and testimonial content

Large rectangular media container with 16px radius, cream or white surface, centered play button overlay (circular, indigo background, white triangle). Accompanied by centered serif headline above.

### Logo Strip
**Role:** Social proof and trust signals

Horizontal row of partner/client logos on cream background, displayed in grayscale or muted tones, evenly spaced. No card containers — logos float directly on the cream canvas.

### Section Header
**Role:** Section introduction and navigation

Centered composition: small pill badge label at top, large serif headline (Reckless Neue 48-64px) below, optional subtext (Saans 16-20px) beneath. Generous vertical spacing (40-64px) between elements.

### Dropdown Nav Item
**Role:** Expandable navigation sections

Nav link with caret indicator. When active, shows a dropdown panel with white background, 16px radius, and warm-tinted shadow containing link lists.

### Gradient Hero Accent
**Role:** Decorative background gradient

Linear gradient (121deg) from pink rgb(204,122,181) through indigo rgb(72,101,255) to deep violet rgb(27,20,99). Used sparingly as a background treatment for special sections or feature highlights.

### Outlined/Secondary Button
**Role:** Alternative action variant

Lavender Mist (#a2baff) border, transparent or white background, Deep Ink (#080331) text, 1600px radius. Used when Primary Indigo CTA is already present and a secondary action is needed.

## Do's and Don'ts

### Do
- Use 1600px border-radius for all interactive elements: buttons, badges, nav bar, and image frames to maintain the pill-shaped consistency
- Set the page canvas to Cream (#f8f3eb), not pure white — the warm tone is the brand's emotional foundation
- Apply warm-tinted shadows (rgba(75,68,57,0.1)) to all elevated elements instead of cool gray shadows
- Pair Reckless Neue (serif, weight 400 only) for all headings with Saans (sans, weights 400-500) for all body and UI text
- Use Primary Indigo (#4865ff) exclusively for the primary action — do not dilute with secondary action colors when a strong CTA is needed
- Layer surfaces as: cream canvas → white card → tinted card → vibrant accent to create depth without heavy shadows
- Maintain 64px minimum vertical spacing between sections and 32px internal padding for all card containers
- Center-align hero and section headlines for editorial compositions; use left-align only for product UI and dense content areas

### Don't
- Do not use bold (600+) weights with Reckless Neue — the serif's power is in its regular weight restraint
- Do not apply cool gray shadows (rgba(0,0,0,...)) — warm brown shadows are part of the visual identity
- Do not use pure white (#ffffff) as the page background — cream is the base, white is for surfaces on top
- Do not use the accent colors (Forest, Ember, Blossom) for primary CTAs — reserve Primary Indigo for that role
- Do not add more than two weights to any text element — the system is intentionally restrained (400/500 for sans, 400 for serif)
- Do not use sharp corners (0px radius) on cards or buttons — the minimum card radius is 16px, buttons are always pills
- Do not break the cream/white/tinted surface hierarchy by placing a colored accent directly on cream without a white card container
- Do not use green for success states or red for error states unless explicitly required — the accent colors are decorative, not semantic

## Elevation

- **Primary CTA button:** `rgba(75, 68, 57, 0.1) 0px 12px 24px 0px, rgba(75, 68, 57, 0.1) 0px 48px 48px 0px`
- **Card surface:** `rgba(75, 68, 57, 0.1) 0px 48px 48px 0px`
- **Subtle elevation:** `rgba(75, 68, 57, 0.05) 0px 4px 4px 0px, rgba(75, 68, 57, 0.08) 0px 32px 16px 0px`
- **Soft button:** `rgba(99, 91, 79, 0.08) 0px 8px 16px 0px, rgba(99, 91, 79, 0.04) 0px 32px 32px 0px`

## Surfaces

- **Cream Canvas** (`#f8f3eb`) — Primary page background and section bands
- **White Surface** (`#ffffff`) — Card surfaces, product UI mockups, elevated content blocks
- **Tinted Card** (`#f098d7`) — Category-coded feature cards with pink wash
- **Accent Surface** (`#ffaefe`) — Lightest accent fill for soft callouts and pill buttons
- **Vibrant Accent** (`#ff6d39`) — Bold accent surface for portrait frames and high-energy cards

## Imagery

Photography is central and humanizing: circular portrait crops of caregivers and seniors in vibrant colored frames (pink, green, orange) function as the hero's visual signature. Images are full-face, high-key, candid or semi-staged portraits — not lifestyle environmental shots. The circular masking with bold color halos is a recurring decorative motif. Product UI is shown as floating device mockup screenshots with generous radius. No illustrations or abstract graphics — all visual energy comes from real photography and product screenshots.

## Layout

Max-width ~1200px centered content with full-bleed cream canvas. Hero is a centered headline stack (no sidebar image) flanked by scattered circular portrait frames that bleed to the page edges. Navigation is a floating pill-shaped bar (radius 1600px) with subtle shadow, positioned at the top. Sections alternate between white cards and cream backgrounds. Feature content uses 2-column card grids on cream. Case study sections use centered headlines above full-width video blocks. The overall rhythm is: generous vertical spacing (64px+), centered text compositions, and circular decorative elements that break the rectangular grid.

## Similar Brands

- **Calm** — Warm cream canvas replacing cold white, editorial serif headlines, pill-shaped buttons, and concentrated accent color usage
- **Headspace** — Warm off-white backgrounds, rounded pill buttons, and approachable typography that softens a typically clinical category
- **Abridge** — Healthcare AI with serif/sans typography pairing, warm background tones, and indigo/violet as the primary brand color
- **Sword Health** — Healthcare product using soft cream backgrounds, pill-shaped CTAs, and editorial serif display type against clean sans body text
- **Walnut** — Warm cream surfaces, concentrated accent colors on otherwise neutral palette, and the editorial serif + geometric sans typography approach
