# Fruitful — Style Reference
> Sun-drenched kitchen herb garden — warm cream surfaces, single deep green accent, botanical softness throughout.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fruitful operates as a sunlit kitchen-table financial practice: warm cream surfaces replace the cold grays of typical fintech, and a single deep forest green acts as the only chromatic voice. Type carries the weight — large, tight-tracked display sizes (up to 91px) that feel hand-set rather than engineered, grounding an otherwise gentle interface. Components are rounded and soft (12px on most containers, 80px on pills), with photographic portraits of real Guides in large rounded frames replacing the abstract product shots common in the category. Elevation is nearly invisible — a single multi-layer shadow reserved for the deepest cards — and borders are thin and quiet. The overall rhythm is: generous whitespace, centered headline bands, 2–3 column card grids, and a warm-but-bright palette that keeps the experience feeling like advice from a friend, not a dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Floor | `#0b7443` | Primary action buttons, active nav state, brand links — deep green against warm cream creates confident without corporate |
| Deep Moss | `#054f31` | Green outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Vivid Leaf | `#61bc76` | Green decorative accent for icons, marks, and small graphic details. Do not promote it to the primary CTA color |
| Bright Sprout | `#039855` | Green outline accent for tags, dividers, and focused UI edges |
| Mint Wash | `#d1fadf` | Soft highlight panels, nav dividers, secondary surface washes — pale botanical tint that adds warmth without saturation |
| Warm Putty | `#715039` | Decorative headings, card borders in warm compositions — toasted brown that bridges cream surfaces and deep green CTAs |
| Sandstone | `#d1a883` | Decorative icon and card stroke accent in warm layouts — softer sibling of the brown heading color |
| Apricot Cream | `#fee9d1` | Dominant card and section background, hero video backdrop — the signature warm canvas that replaces standard gray |
| Paper White | `#ffffff` | Page background, nav surface, inverse text on green CTAs — the base layer beneath all warm washes |
| Soft Mist | `#eceff4` | Card surfaces on white pages, nav background, secondary panel fill — the only cool neutral, used sparingly |
| Pale Stone | `#f4f4f4` | Alternate card surface, image containers — near-white neutral for layering above the cream |
| Graphite Text | `#5b616b` | Body copy, helper text, muted descriptions — warm-leaning gray that reads softer than pure black |
| Ink Black | `#000000` | Primary headings, body text, hairline borders, icon strokes — the structural baseline across all surfaces |

## Typography

### PP Neue Montreal — Single-family sans-serif system. Display sizes (45–91px) carry the brand voice — ultra-tight tracking (-0.019em) at 91px makes headlines feel hand-set rather than templated. Weight 500 dominates body and UI text, 600 for subheadings, 700 reserved for emphasis and button labels. The custom font's geometric warmth (rounded terminals, open apertures) is what makes the cream-and-green palette feel friendly instead of generic.
- **Substitute:** Inter or Söhne — both share the geometric warmth and tight tracking behavior at display sizes
- **Weights:** 400, 500, 600, 700
- **Sizes:** 11px, 12px, 13px, 14px, 15px, 16px, 18px, 19px, 20px, 21px, 23px, 24px, 26px, 38px, 45px, 48px, 49px, 60px, 91px
- **Line height:** 0.90, 1.00, 1.10, 1.20, 1.25, 1.32, 1.33, 1.38, 1.40, 1.50
- **Letter spacing:** -0.019em at 91px display, -0.010em at 38–48px headings, -0.004em at 14–16px body
- **OpenType features:** `"ss01" on (if available), tabular numerals for financial figures`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.4 | -0.004px |
| body | — | — | 16px | 1.5 | -0.004px |
| subheading | — | — | 20px | 1.33 | -0.004px |
| heading-sm | — | — | 24px | 1.32 | -0.01px |
| heading | — | — | 38px | 1.25 | -0.01px |
| heading-lg | — | — | 48px | 1.2 | -0.01px |
| display | — | — | 60px | 1.1 | -0.019px |
| display-lg | — | — | 91px | 0.9 | -0.019px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **nav:** 12px
- **cards:** 12px
- **pills:** 80px
- **video:** 12px
- **badges:** 80px
- **images:** 20px
- **buttons:** 12px
- **display-underline:** 100px

## Components

### Primary Action Button
**Role:** Main conversion CTA — filled forest green pill

Filled background #0b7443, white text, 12px radius, 12px 24px padding, weight 500 at 16px. Hover transitions to #054f31. Used for the highest-intent action on each page.

### Ghost Button
**Role:** Secondary CTA — outlined neutral

Transparent background, 1px #000000 border, #000000 text, 12px radius, 12px 24px padding, weight 500 at 16px. Pairs alongside the primary action at equal visual weight.

### Pill Navigation Link
**Role:** Nav bar links with soft pill backgrounds

12px to 20px radius, 8px 16px padding, 14–16px text in #000000. Active state uses #0b7443 text on #d1fadf background or a #0b7443 left border indicator.

### Guide Portrait Card
**Role:** Large photographic card featuring a financial Guide

Photograph fills the card, 20px radius, contained in a larger #fee9d1 or #ffffff container with generous padding (24–32px). Guide name overlaid at bottom in white over a subtle gradient, with role tags in pill badges. The portrait is the hero — no decorative borders around the image.

### Trust Badge
**Role:** Laurel-wreath award badge in a 3-column row

Centered icon-and-text composition, no card background. Laurel wreaths in #61bc76 (vivid leaf green), bold display text ("Best", "Excellent") at 24–38px, descriptor text below at 13–14px in #5b616b. Placed on white canvas.

### Hero Video Container
**Role:** Full-width video embed with warm backdrop

12px radius, fills the content max-width, backdrop color #fee9d1 (cream) bleeding beyond the video frame. Caption text appears as a green-bordered label (#d1fadf background, #054f31 text) overlaid near the bottom.

### Section Header Block
**Role:** Numbered section intro with title, description, and CTAs

Left-aligned within content area, large two-line title at 38–48px in #000000, body description at 16px in #5b616b. Small numeric label ("01") in muted gray above the title. Optional CTA row below.

### Green Wash Highlight Label
**Role:** Inline emphasis label with pale green background

#d1fadf background, #054f31 text, 4–6px padding, 4–6px radius, 14px weight 500. Used for in-content highlights like key phrases or feature labels.

### Numbered Step Indicator
**Role:** Large outlined number for ordered process steps

Light weight, 38–48px display size, color #5b616b or #000000. Placed above the step title with 12–16px gap. No background or border — purely typographic.

### Footer
**Role:** Dark or white footer with link columns

#ffffff or #000000 background, multi-column link grid, small body text (13–14px). Logo + social icons row at top. Generous 48–64px internal padding.

### Video Play Overlay
**Role:** Semi-transparent dark overlay with play icon and controls

Subtle dark gradient at bottom of video frame, white play triangle, timecode in small white text. Volume and progress controls appear on hover.

### Tag Pill
**Role:** Small role or category tag on Guide cards

#d1fadf or #ffffff background, 80px radius (full pill), #0b7443 or #000000 text, 5–6px vertical padding, 10–12px horizontal padding, 11–12px font size. Often with a small checkmark or dot icon.

## Do's and Don'ts

### Do
- Use #0b7443 exclusively for the single primary action on any screen — never introduce a second chromatic button color.
- Apply #fee9d1 (Apricot Cream) as the dominant surface for any non-white section to maintain the warm, non-corporate identity.
- Set display type at 48–91px with -0.019em tracking — tight letter-spacing at large sizes is the signature voice.
- Use 12px radius for all buttons, cards, nav elements, and video containers for visual consistency.
- Pair every primary filled button with an equal-weight ghost button (1px black border, transparent fill) as its secondary action.
- Place large photographic portraits (real people, not stock) in 20px-radius containers on warm cream backgrounds to reinforce the human, advisory feel.
- Reserve #039855 and #61bc76 for icon fills, botanical illustrations, and decorative strokes — never for text or buttons.

### Don't
- Don't use the vivid greens (#039855, #61bc76) for body text or headings — they lack the contrast weight of the deep forest green.
- Don't apply #eceff4 (Soft Mist) next to #fee9d1 in the same section — the cool/warm clash breaks the warm atmosphere.
- Don't set body text below 16px or above 20px — the type system is calibrated for that 16–20px sweet spot.
- Don't use sharp corners (0px radius) on any container — even small elements get at least 4–12px radius.
- Don't add drop shadows to buttons, nav, or text — the only shadow belongs on the deepest elevated cards.
- Don't use the brown accent (#715039) for body copy or buttons — it's decorative only, for warm-section headings and card borders.
- Don't introduce a second typeface — PP Neue Montreal covers the full range from 11px captions to 91px display.

## Elevation

- **Elevated Card:** `rgba(0, 0, 0, 0.05) 0px 25px 16px 0px, rgba(0, 0, 0, 0.1) 0px 10px 10px 0px, rgba(0, 0, 0, 0.1) 0px 3px 6px 0px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Base page background — the default under all sections
- **Warm Card** (`#fee9d1`) — Dominant card and section surface — the signature warm cream that defines the brand
- **Soft Green Wash** (`#d1fadf`) — Highlight panels, nav dividers, botanical accent surfaces
- **Cool Card** (`#eceff4`) — Secondary card surface on white pages, for contrast against the dominant warm cream
- **Pale Stone** (`#f4f4f4`) — Tertiary surface for image containers and layered cards above cream
- **Inverse Dark** (`#000000`) — Rare dark sections or overlay surfaces — used very sparingly

## Imagery

Photography-first: large, warm-toned portrait shots of real people (Guides) filling 20px-radius containers on cream backgrounds. No abstract product mockups, no stock photography, no illustrations except simple laurel-wreath trust badges and small green checkmark icons. Video content is baked into the hero as a full-width embed with a warm beige backdrop, featuring a single person speaking directly to camera — the format is confessional and human, not polished corporate. The warm color temperature of the photography (golden-hour lighting, earth tones in clothing) matches the cream surfaces, creating a unified sunlit palette. Decorative elements are limited to: outlined laurel wreaths in vivid green, small filled checkmarks, and the wordmark leaf icon. No product screenshots, no data visualizations, no abstract geometric graphics.

## Layout

Centered, max-width 1200px content column with generous outer margins. The page opens with a full-bleed white section containing a centered headline band (max ~800px wide for the text, large 60–91px display type) over a 1200px-wide video container. Sections alternate between white canvas and warm cream (#fee9d1) full-bleed bands, each separated by 80px vertical gaps. The trust badge row is a centered 3-column grid on white. Guide cards appear in a 2–3 column scrollable row with a left-aligned numbered section header ("01 / Get paired with a Guide") beside the card group — this asymmetric pairing is a signature layout move. Navigation is a simple horizontal bar with a small wordmark on the left, centered links, and a ghost 'Log in' + filled 'Get started' pair on the right. No sidebar, no mega-menu. Footer is a full-bleed white or dark band with 3–4 columns of links.

## Similar Brands

- **Marcus by Goldman Sachs** — Same warm, approachable fintech tone with rounded typography and soft card surfaces — though Marcus uses more photography and less cream
- **Wealthfront** — Similar single-color accent (green) on white with large display headlines, though Wealthfront is cooler and more data-driven
- **Betterment** — Friendly financial guidance brand with rounded UI, warm photography of people, and a single accent color — shares the human-advisory positioning
- **Rocket Money** — Same personal-finance-meets-friend aesthetic with cream-friendly palette and large friendly headlines, though Rocket leans more playful
