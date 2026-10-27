# Passionfroot — Style Reference
> Twilight cloud library on warm parchment. A serif headline drifts above cream cards lit by a violet-to-coral sky, where a pastel mascot peeks from the corner.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Passionfroot operates as a dusk-lit creative workspace: warm parchment canvas (#f8f7f2), a custom serif (new-kansas) for editorial-grade headlines, and a full-spectrum accent palette that treats color as joyful punctuation rather than corporate branding. Screens often open against a twilight sky gradient (deep violet bleeding into coral) before resolving into cream cards and content. The visual language is compact, rounded, and tactile — 12px radii everywhere, pill-shaped interactive chips, warm-toned layered shadows (oklch-tinted, not pure gray) that feel like sunlight on paper, and a 3D mascot that anchors the dreamy atmosphere. Components stay lightweight: thin 1px borders, ghost buttons, white elevated surfaces, no heavy drop-shadows. Color appears as small functional sprinkles — pastel card backgrounds, vivid icon strokes, chromatic borders — never as a single dominant brand color.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#1d1d1c` | Primary text, primary borders, dark surface fills — the workhorse neutral that carries all high-contrast text and structural outlines |
| Parchment Cream | `#f8f7f2` | Page canvas, default body background, nav surface — warm off-white that replaces pure white to avoid sterile SaaS feel |
| Sand Gray | `#d8d6ce` | Hairline borders, dividers, soft box-shadow base — the warm-tinted stroke that gives components a paper-on-paper quality |
| Linen Beige | `#edeae4` | Card surfaces, elevated backgrounds, shadow tint — sits one step above Parchment Cream as the secondary surface level |
| Paper White | `#ffffff` | Highest-elevation surfaces, button fills, input fields — the brightest neutral reserved for the focal interactive elements |
| Charcoal Stone | `#43423e` | Secondary text, muted button borders, button text on light fills — the mid-dark neutral for body copy and neutral action outlines |
| Ash Gray | `#99978f` | Muted text, placeholder text, subtle icon strokes, disabled state borders — the warm mid-gray for de-emphasized content |
| Slate Warm | `#7a7974` | Secondary muted text, button labels in ghost variants — one step darker than Ash Gray for slightly more legible de-emphasis |
| Electric Violet | `#b26bf5` | Primary brand accent — the most-prominent chromatic across the system, used for highlighted card surfaces, illustration fills, and brand emphasis; vivid lavender that defines the Passionfroot identity |
| Twilight Indigo | `#190922` | Dark hero section base, deep contrast text on light surfaces — the near-black plum that anchors the twilight gradient backgrounds |
| Bubblegum Pink | `#f788d2` | Accent card surface, tag pill, illustration fill — one of the pastel punctuation colors in the rainbow accent set |
| Tangerine | `#ff9147` | Accent card surface, warm illustration fill, decorative highlight — the sunset-orange accent for warmth and energy |
| Aqua Teal | `#4ad5e8` | Accent card surface, cool-toned illustration fill — the bright sky-cyan for variety in the multi-color accent set |
| Sky Blue | `#51b1fb` | Accent card surface, cool illustration fill — lighter blue accent used in color card rotation |
| Sunshine Yellow | `#ffe747` | Accent card surface, highlight wash — the warm yellow accent for cheerful punctuation in card backgrounds |
| Lavender Glow | `#b977f8` | Decorative border, icon stroke, soft accent outline — slightly lighter than Electric Violet for outlined elements |
| Pale Violet | `#dab2ff` | Outlined button border, soft accent stroke — the desaturated lavender for ghost/outlined action elements |
| Lilac Mist | `#f3e8ff` | Outlined button background wash, soft accent fill — extremely pale violet for subtle tinted button states |
| Deep Violet | `#8200db` | Icon border, decorative stroke, bold accent outline — the saturated dark violet for iconography and emphasis strokes |
| Coral Red | `#ee5968` | Illustration fill, warm accent, character highlight — the warm coral used in the mascot and decorative artwork |
| Mint Green | `#58df8c` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Forest Green | `#00a63e` | Green decorative accent for icons, marks, and small graphic details. Use as a supporting accent, not as a status color |
| Burnt Orange | `#eb6928` | Icon border, warm stroke, illustrative accent — darker orange for icon outlines and warm decorative elements |
| Deep Teal | `#2c91af` | Icon border, cool stroke, informative accent — the desaturated teal for cool-toned iconography and strokes |
| Magenta Bloom | `#b036a4` | Icon border, decorative stroke, pink-magenta accent — the warm magenta for iconography and brand emphasis strokes |
| Mint Wash | `#dcfce7` | Gray wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |

## Typography

### new-kansas — Display and heading serif — the editorial voice. new-kansas carries the brand's literary/storybook personality at 48px and 64px display sizes, with letter-spacing tightening from -0.023em at 64px to -0.010em at 16px. The 400 weight (not 700) is anti-convention: it whispers authority through restraint, letting size and letter-spacing do the work rather than weight. Font features 'calt', 'kern', 'liga' enable the custom ligatures that give new-kansas its distinctive character. Substitute with 'DM Serif Display' or 'Source Serif Pro' for close character.
- **Substitute:** DM Serif Display
- **Weights:** 400, 500
- **Sizes:** 16px, 20px, 28px, 48px, 64px
- **Line height:** 1.20, 1.25, 1.35, 1.45, 1.50
- **Letter spacing:** -0.023em at 64px, -0.013em at 48px, -0.010em at 16px
- **OpenType features:** `"calt" on, "kern" on, "liga" on`

### Nunito Sans — UI and body sans-serif — the functional workhorse. Nunito Sans covers everything below the headline: nav links, button text, body copy, card labels, form inputs, footer text. Weights range from 400 (body) to 700 (emphasis). Letter-spacing tightens to -0.012em at larger sizes. Font features 'kern', 'liga' for clean rendering. Its rounded geometric character complements the 3D mascot aesthetic. Substitute with 'Inter' or 'DM Sans'.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 14px, 15px, 16px, 18px, 20px
- **Line height:** 1.25, 1.33, 1.40, 1.43, 1.50, 1.56, 1.63
- **Letter spacing:** -0.012em at 18-20px, -0.011em at 14-16px
- **OpenType features:** `"kern" on, "liga" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.01px |
| body-sm | — | — | 14px | 1.43 | -0.011px |
| body | — | — | 16px | 1.5 | -0.011px |
| subheading | — | — | 20px | 1.4 | -0.012px |
| heading-sm | — | — | 28px | 1.35 | -0.01px |
| heading | — | — | 48px | 1.2 | -0.013px |
| display | — | — | 64px | 1.2 | -0.023px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 12px
- **pills:** 9999px
- **inputs:** 12px
- **buttons:** 12px
- **special:** 24px
- **large-cards:** 16px

## Components

### Filled Action Button
**Role:** Primary CTA — the most prominent interactive element

White background (#ffffff), Ink Black text (#1d1d1c), 12px radius, padding 10px 20px. Nunito Sans 14-16px weight 500-600. No visible border, but subtle layered shadow: oklch(0.23 0.002 98 / 0.04) at multiple offsets creating soft elevation. Label text uses -0.011em letter-spacing. The 'Start for free' button is the canonical example.

### Ghost Action Button
**Role:** Secondary CTA — paired alongside the primary

Transparent or very dark transparent background, white/cream text (#f8f7f2), 12px radius, padding 10px 20px. No border in hero context. Includes a play icon (▷) for trailer actions. Uses Nunito Sans 14-16px weight 500.

### Outlined Violet Button
**Role:** Tertiary or categorical action with chromatic emphasis

Pale Violet background (#f3e8ff), Pale Violet border (#dab2ff) at 1px, Ink Black text, 12px radius, padding 10px 16px. The chromatic border gives it personality without overwhelming. Nunito Sans 14px weight 500.

### Neutral Bordered Button
**Role:** Standard secondary button in content areas

Paper White background (#ffffff), Charcoal Stone border (#43423e) at 1px, Ink Black text, 12px radius, padding 8px 16px. Includes a subtle shadow: oklch(0.876 0.011 98) ring + soft layered drop-shadow. Used for form actions and neutral interactions.

### Metric Card
**Role:** Floating product UI element — shows data in hero and features

White background (#ffffff), Sand Gray border (#d8d6ce) at 1px, 12px radius, padding 12-16px. Contains a label in Nunito Sans 12px Ash Gray (#99978f) and a value in new-kansas or Nunito Sans 16-20px weight 500 Ink Black. Optional small positive delta (e.g. '+54%') in Forest Green. Cards float with layered oklch shadows and slight rotation for dimensional playfulness.

### Chart Card
**Role:** Data visualization container — bar/line charts in floating product cards

White background, 12px radius, 16px padding. Contains a chart label in Nunito Sans 12px, and a chart with brand-colored data: Tangerine bars, Electric Violet line strokes, Forest Green for positive trends. Legend dots in matching chromatic colors at 8px circles.

### AI Prompt Input
**Role:** Central input element — AI chat/command interface

White background (#ffffff), Sand Gray border at 1px, 12px radius, padding 12px 16px. Contains placeholder text in Ash Gray Nunito Sans 14px, an '@' mention chip with Pale Violet background, and a dark circular send button (Ink Black, 32px, white arrow icon) at the right. The 'How many people did our @Q1 Campaign reach?' field is canonical.

### Tab Navigation
**Role:** Content switcher — used for mode/category selection

Horizontal row of text tabs in Nunito Sans 14-16px. Active tab: Ink Black text with 2px Ink Black underline. Inactive: Ash Gray text, no underline. 8px gap between tabs. The 'Launch a product / Announce a fundraiser / Stay top of mind' tab set is canonical.

### Pill Tag/Chip
**Role:** Category labels, suggestion chips, mention tokens

12px to 9999px (full pill) radius, padding 4px 10px. Background varies: Pale Violet for mentions (#f3e8ff), Paper White for suggestions. Text in Nunito Sans 12-14px weight 500. Includes optional small icon (8-12px). The 'Plan strategy / Run campaign / Measure results' suggestion chips are canonical.

### Logo Bar Row
**Role:** Social proof — trusted-by company logos

Horizontal scrollable row of company logos on Parchment Cream background (#f8f7f2). Logos rendered in Charcoal Stone (#43423e) or Ash Gray (#99978f) at uniform 24-32px height. Even spacing with 32-48px gaps. Overline text above: 'Trusted by B2B marketing and growth teams' in Nunito Sans 12-14px weight 500, Ash Gray, centered.

### Floating Product Card Stack
**Role:** Hero visual — the product UI peek that overlaps the hero content

Multiple cards (Metric, Chart, AI Prompt Input) arranged in a loose floating composition with slight rotations (-2° to 2°). Each card has white background, 12px radius, warm layered shadows (oklch-tinted at 1px, 3px, 6px, 12px offsets), and 1px Sand Gray border. The stack creates depth and signals 'real product' without showing the full app.

### Hero Section
**Role:** First-screen section — full-width twilight gradient

Full-bleed background using Twilight Indigo (#190922) at top blending into a purple-pink-orange gradient (resembling sunset clouds). Centered content with max-width ~800px. Display headline in new-kansas 64px weight 400, white text, -0.023em letter-spacing. Subhead in Nunito Sans 16-18px weight 400, warm cream/white at reduced opacity. Button row centered below.

### Testimonial Block
**Role:** Social proof — large-format quote with attribution

Parchment Cream background. Large quote text in new-kansas or Nunito Sans 28-48px weight 400, Ink Black, centered, with a large opening quotation mark. Below: small avatar circle (32px) in Sand Gray placeholder, name in Nunito Sans 14px weight 500, title in Nunito Sans 12px Ash Gray.

### Navigation Bar
**Role:** Top-level site navigation

Transparent or Parchment Cream background, positioned over hero. Left: brand wordmark 'passionfroot' in Nunito Sans 14px weight 700, lowercase. Center: nav items in Nunito Sans 14px weight 400. Right: text links + 'Get access' filled button (Ink Black bg, white text, 12px radius, small arrow icon).

### Accent Color Card Set
**Role:** Feature/benefit cards — rainbow card rotation for visual energy

Cards with full-saturation pastel backgrounds from the accent set: Electric Violet, Bubblegum Pink, Tangerine, Aqua Teal, Sky Blue, Sunshine Yellow, Mint Green. 12px radius, 16-20px padding, Ink Black text. Nunito Sans 14-16px for labels. Used in feature grids to create rhythm and energy without needing photographic imagery.

## Do's and Don'ts

### Do
- Use new-kansas (or DM Serif Display) at 48-64px weight 400 for all display headlines — the light weight is the signature, not a fallback for 700
- Set page background to Parchment Cream (#f8f7f2), never pure white — the warm tint is what makes the system feel like paper rather than screen
- Apply 12px radius consistently across cards, buttons, and inputs — this is the single most defining shape token in the system
- Use 9999px radius exclusively for tag pills and suggestion chips — full pills create a distinct typographic category from standard buttons
- Layer shadows with oklch warm-tinted colors (not pure rgba(0,0,0,0.1)) — the 237/234/228 base color makes elevation feel like soft sunlight on paper
- Pair the rainbow accent set (violet, pink, orange, teal, blue, yellow, green) as card backgrounds in feature grids — color rotation creates visual rhythm without illustration
- Use Ink Black (#1d1d1c) for all primary text and structural borders — the warm-tinted near-black is softer than #000 and more distinctive than pure gray

### Don't
- Do not use weight 700 for display headlines — the 400 weight new-kansas is intentional restraint; bolding it destroys the whisper-quiet authority
- Do not use pure white (#ffffff) as a page background — the warm cream canvas is a signature trait, not an oversight
- Do not use pure black (#000000) for text — Ink Black (#1d1d1c) is warmer and the correct token
- Do not add heavy drop-shadows with gray/black tints — shadows must use oklch warm tones to stay on-brand
- Do not create a single-color CTA (e.g. solid Electric Violet button) — the system uses neutral filled buttons (white/ink) with chromatic accents reserved for decorative elements
- Do not use radii other than 12px, 16px, 24px, or 9999px — these four values are the complete shape vocabulary
- Do not mix the serif and sans-serif at body sizes — new-kansas stays at 28px and above; Nunito Sans owns everything below

## Elevation

- **Floating Product Card:** `rgb(237, 234, 228) 0px 0px 0px 1px, oklch(0.23 0.002 98 / 0.04) 0px 1px 1px -0.5px, oklch(0.23 0.002 98 / 0.04) 0px 3px 3px -1.5px, oklch(0.23 0.002 98 / 0.04) 0px 6px 6px -3px, oklch(0.23 0.002 98 / 0.02) 0px 12px 12px -6px`
- **Content Card:** `oklch(0.958 0.007 98) 0px 0px 0px 1px, oklch(0.23 0.002 98 / 0.02) 0px 1px 1px -0.5px, oklch(0.23 0.002 98 / 0.02) 0px 3px 3px -1.5px, oklch(0.23 0.002 98 / 0.02) 0px 6px 6px -3px, oklch(0.23 0.002 98 / 0.01) 0px 12px 12px -6px`
- **Hero Elevated Button:** `oklch(0.876 0.011 98) 0px 0px 0px 1px, oklch(0.23 0.002 98 / 0.04) 0px 1px 1px -0.5px, oklch(0.23 0.002 98 / 0.04) 0px 3px 3px -1.5px, oklch(0.23 0.002 98 / 0.04) 0px 6px 6px -3px, oklch(0.23 0.002 98 / 0.02) 0px 12px 12px -6px, oklch(0.23 0.002 98 / 0.02) 0px 24px 24px -12px`

## Surfaces

- **Twilight Sky** (`#190922`) — Hero section background base — dark indigo gradient field with starfield and cloud illustration
- **Parchment Canvas** (`#f8f7f2`) — Primary page background — warm cream that replaces pure white for the editorial feel
- **Linen Card** (`#edeae4`) — Secondary card surface — one step above canvas for subtle depth
- **Paper White** (`#ffffff`) — Elevated card, button fill, input field — the brightest interactive surface

## Imagery

The visual language is dominated by 3D-rendered illustration rather than photography. A pink/coral blob-shaped mascot character (rounded body, small green leaf on top, large black eyes) appears as a brand anchor, peeking from the bottom-right of the hero and floating among clouds in secondary sections. Hero backgrounds feature a photorealistic purple-to-coral sunset sky with volumetric clouds and a starfield — this gradient sky is the primary atmospheric device, not a photograph of a real sky but a CGI/3D rendered environment. The clouds are bulbous, rounded, almost candy-like in their softness. Product screenshots are simulated through floating UI cards (metric cards, chart cards, AI input fields) rather than literal app captures, creating a 'product peek' composition. No human photography is present. The illustration style is warm, dreamy, slightly surreal — a children's-book-meets-tech aesthetic that signals approachability and creativity over corporate polish.

## Layout

The page uses a max-width 1200px centered content model with full-bleed atmospheric sections. The hero is full-viewport with a centered text composition (headline + subhead + dual-button row) layered over a twilight sky gradient, with floating product UI cards arranged in a loose 2-3 card cluster below the text and a 3D mascot character at the bottom-right. Section rhythm alternates: dark hero → cream canvas section with logo bar → another twilight illustration section → white card section (tab navigation + prompt input) → testimonial. The white card section (Meet Zest) uses a rounded white panel (16-24px radius) that sits ON TOP of the illustration, creating a paper-on-sky layering effect. Content within cards is centered. The logo bar is a single horizontal row with wide gaps. Tab interfaces use simple text-with-underline active states. Grid usage is minimal — most layouts are centered single-column or paired card compositions rather than multi-column grids. Navigation is a floating top bar (transparent over hero, solid cream over content) with brand left, nav center, CTA right.

## Similar Brands

- **Linear** — Same compact 12px-radius cards, warm-toned layered shadows, and dark-to-light section transitions with floating product UI
- **Notion** — Same playful mascot-as-brand-anchor approach, warm cream canvas with pastel accent palette, and editorial serif mixed with functional sans-serif
- **Arc Browser** — Same dreamy atmospheric gradients, rainbow accent palette treated as joyful punctuation, and 3D illustration over flat UI
- **Pitch** — Same warm parchment aesthetic, compact rounded components, and twilight/dusk atmospheric color stories in hero sections
- **Framer** — Same serif-meets-sans-serif typographic pairing, floating product card compositions, and violet-dominant accent strategy
