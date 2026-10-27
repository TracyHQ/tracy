# Bumble — Style Reference
> Sunlit honey editorial

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bumble runs on a monochrome-plus-one-warmth system: near-black ink (#202020) carries every word, every border, every interactive surface, and one vivid honey-yellow (#ffdb5b) floods the hero and feature canvases as the brand's emotional signal. The geometry is soft and confident — 16-24px radii on cards and buttons, pill-shaped badges at 1000px, barely-there shadows at 12% opacity — so nothing feels sharp or aggressive. BumbleSans speaks in slightly opened letter-spacing (0.007-0.02em), which is unusual for a geometric sans and gives even the smallest UI copy a warm, unhurried cadence. Content is arranged in generous 24-40px padded cards over white surfaces, with full-bleed yellow bands acting as the visual punctuation between sections. The result reads like a sunlit lifestyle magazine: human photography does the heavy lifting, the brand color is never decorative noise, and the UI recedes so the people in the photos lead.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bumble Honey | `#ffdb5b` | Yellow state accent for badges, validation surfaces, and short status labels. |
| Pollen | `#fff386` | Lighter yellow accent surface for secondary card frames and tonal variation against Honey |
| Bumble Ink | `#202020` | Primary text, filled action buttons, all borders and dividers — the structural near-black that carries 2,100+ UI instances and is the de facto primary action color |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on dark fills, body text inverse |
| Mist | `#f3f3f3` | Subtle elevated card surface for sections that need to step forward from the white page without going dark |
| Charcoal | `#3b3b3b` | Secondary borders, muted icon strokes, and supplementary divider lines when Ink feels too heavy |
| Graphite | `#575656` | Muted helper text, inactive nav borders, and low-emphasis UI labels |
| Onyx | `#343333` | Badge borders and badge text — the slightly warmer dark used inside pill-shaped tags |

## Typography

### BumbleSans — Single typeface for the entire product — nav, body, headings, buttons, badges, hero wordmark. Weights 400-500 for body and nav, 600 for subheadings and emphasis, 700 for display headlines.
- **Substitute:** Inter, DM Sans, or Nunito Sans for close geometric warmth; avoid Helvetica/Geist (too clinical).
- **Weights:** 400, 500, 600, 700
- **Sizes:** 15, 16, 17, 18, 20, 24, 32, 34, 40, 49, 68
- **Line height:** 1.00, 1.10, 1.12, 1.18, 1.20, 1.25, 1.29, 1.33, 1.50
- **Letter spacing:** 0.007em at 15px (~0.11px), scaling to 0.02em at 32px+ (~0.64px)
- **OpenType features:** `Not detected, but the slightly open tracking suggests 'kern' on and possibly 'ss01' stylistic alternates if available in the proprietary face.`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 1.5 | 0.11px |
| body | — | — | 17px | 1.5 | 0.2px |
| subheading | — | — | 20px | 1.33 | 0.32px |
| heading-sm | — | — | 24px | 1.25 | 0.43px |
| heading | — | — | 32px | 1.2 | 0.64px |
| heading-lg | — | — | 40px | 1.18 | 0.8px |
| display | — | — | 68px | 1 | 1.36px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 24px

### Border Radius

- **nav:** 16px
- **cards:** 24px
- **badges:** 1000px
- **buttons:** 16px
- **small-elements:** 9px

## Components

### Filled Action Button (Entrar / Descargar Bumble)
**Role:** Primary interactive element — the only filled button in the system.

#202020 background, #ffffff text, 16px radius, 14px 24px padding, BumbleSans 500 at 16-17px. Used for 'Sign In', 'Download', 'Subscribe', and the 'Inscribirme' CTA. No hover state lift; relies on color inversion for feedback.

### Active Nav Pill
**Role:** Marks the user's current section in the top navigation.

#ffffff background, #202020 text, 16px radius, 10px 22px padding, BumbleSans 500. The active state is a white pill floating on the page canvas — the inverse of the filled action button, creating a clean toggle relationship.

### Inactive Nav Link
**Role:** Standard navigation items.

Transparent background, #202020 text, no border, 500 weight at 16px. The nav bar itself is borderless and floats over the page.

### Language Selector
**Role:** Globe icon + locale label in the top utility area.

Transparent background, #202020 icon and text, 16px radius, paired with a filled 'Entrar' button on its right.

### Hero Wordmark Section
**Role:** Full-bleed brand statement with oversized typography and tilted product screenshots.

#ffdb5b background, the brand name rendered in BumbleSans 700 at approximately 200-300px+ in #202020, with phone screenshots rotated at ~5-8° and overlapping the type. This is the page's most distinctive component — the wordmark IS the hero.

### Feature Card (White)
**Role:** Content card for feature explanations with image and text.

#ffffff background, 16-24px radius, subtle shadow rgba(32,32,32,0.12) 0px 1px 8px 0px, 24-40px padding. Contains a lifestyle photo on one side and headline + body copy on the other in a 2-column arrangement.

### Product Variant Card (Bumble Date / BFF)
**Role:** Showcases different product modes with phone mockups.

Pollen (#fff386) or Honey (#ffdb5b) frame, 24px radius, contains 2-3 overlapping phone screenshots with verified-user badges, product name in BumbleSans 700 at 32px, and a short descriptive paragraph.

### Profile Verification Badge
**Role:** Small trust indicator on profile screenshots.

White background, #202020 text, 1000px radius (pill), 15px, with a small checkmark icon. Reads 'X% verified' in compact form.

### Member Circle Badge
**Role:** Decorative seal for the community/membership program.

Circular badge with gold/honey border, dark inner circle, hexagonal icon center. Appears overlaid on feature photography.

### App Store Download Badge
**Role:** Platform-specific download link in the hero.

#202020 background, white icon + text, 9px radius, horizontal layout with app store icon and 'Download on the App Store' / 'Get it on Google Play' label.

### Stats Counter Pill
**Role:** Rotating metric badges ('Correr', 'Reggaeton', etc.) near the hero.

#ffdb5b or white background, #202020 text, 1000px radius, 15-16px, with small icon prefix. Decorative but on-brand.

### Footer Link List
**Role:** Site map and legal links in the page footer.

#202020 text at 15-16px, 500 weight, vertical stacking with 8-12px row gaps, no dividers between items.

## Do's and Don'ts

### Do
- Use #ffdb5b as a full-bleed section background or large card frame — never as a small accent swatch or button fill.
- Set the primary action button to #202020 fill with #ffffff text at 16px radius; reserve yellow for brand warmth, not clickability.
- Set card radii between 16-24px; use 1000px only for badges and tags.
- Apply the one subtle shadow (rgba(32,32,32,0.12) 0px 1px 8px 0px) to white cards that need to lift off the page — avoid stacking or intensifying shadows.
- Keep letter-spacing positive (0.007-0.02em) across all BumbleSans sizes; this is what gives the type its warm, open cadence.
- Use lifestyle photography with diverse subjects as the primary visual content; let the people lead, let the UI recede.
- Maintain 24-32px card padding and 64px section gaps to preserve the comfortable, unhurried rhythm.

### Don't
- Don't use #ffdb5b as a button or CTA fill — it carries no clickable affordance in this system and will compete with the dark action button.
- Don't introduce additional chromatic colors (blue, green, red) for states or categories — the system is monochrome+one-yellow, and adding hues breaks the brand constraint.
- Don't use sharp corners (0-4px) on cards, buttons, or nav elements; the 16-24px softness is non-negotiable.
- Don't set body text below 15px or use weight 300; BumbleSans starts at 400 and the smallest size in the system is 15px.
- Don't use heavy drop shadows, colored shadows, or multi-layer shadow stacks; the one approved shadow is a whisper at 12% opacity.
- Don't use full-opacity black (#000000) — use #202020 for all text and interactive elements; the slight warmth is deliberate.
- Don't center-align body paragraphs; the system uses left-align for all prose and reserves centering for hero display type only.

## Elevation

- **White Feature Card:** `rgba(32, 32, 32, 0.12) 0px 1px 8px 0px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default background for most content sections and card inner surfaces.
- **Soft Card** (`#f3f3f3`) — Tonal step up from white for sections that need quiet elevation without shadow.
- **Pollen Frame** (`#fff386`) — Lighter yellow card background for product variants and secondary feature frames.
- **Honey Band** (`#ffdb5b`) — Full-bleed hero and feature section canvas — the brand's dominant warm surface.

## Imagery

Photography is the dominant visual medium and the emotional engine of the brand. Lifestyle shots feature diverse young adults in real-world settings — cafes, parks, social gatherings — shot in natural daylight with warm color grading that echoes the honey brand palette. Phone screenshots are tilted at 5-8° angles and overlap each other and the background wordmark, creating a dynamic collage feel. Product UI mockups show real app screens with profile cards, verification badges, and chat interfaces. The imagery-to-text ratio is high: photos occupy 50-60% of most feature sections, with the UI chrome intentionally minimal so the people and the app feel lead.

## Layout

The page follows a full-bleed-first pattern: a yellow hero band with oversized wordmark and tilted phone screenshots, then alternating white and yellow content sections in a single-column stacked rhythm. Content sections are max-width ~1200px centered, using 2-column image+text feature blocks and 2-column product variant cards. The nav is a floating borderless bar at the top with a white pill for the active link and a dark filled button for sign-in. Vertical spacing is generous (64px between sections, 24-40px card padding), creating a magazine-like cadence. Photography sections break the grid by going edge-to-edge, then the next text section snaps back to contained width.

## Similar Brands

- **Headspace** — Same warm-yellow + rounded-card + soft-shadow approach; both treat a single vivid hue as emotional signal rather than functional UI color.
- **Duolingo** — Single bold brand color (green for Duolingo, yellow for Bumble) flooding full-bleed sections while the rest of the UI stays near-monochrome with soft rounded geometry.
- **Oatly** — Custom-friendly geometric sans, generous whitespace, lifestyle photography that leads, and a deliberately limited color palette with one warm signature tone.
- **Calm** — Comfortable density with 24-40px card padding, pill-shaped nav and CTAs, and a brand color used as full-bleed canvas rather than button accent.
