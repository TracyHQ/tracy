# Tracky — Style Reference
> doodled planner on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tracky reads like a creative's bullet journal that became a product: a warm light canvas (#f2f2f2) carries a near-black navy (#151b31) workhorse for text, borders, and primary actions, while coral red (#ff5858) and mint green (#86e0c1) appear as small functional punctuation for emphasis and live states. GRIFTER supplies the brand's voice at display scale — chunky, hand-printed, slightly loosened tracking — while Inter handles all UI and body work at compact, tightly-tracked sizes. Components sit on soft 8px and 16px radii with whisper-light shadows, generous section breathing, and hand-drawn illustration accents (doodles, organic blobs, bunny mascot) that make project management feel like doodling in a notebook rather than filing a ticket.

## Colors

| Name | Value | Role |
|------|-------|------|
| Inkwell Navy | `#151b31` | Primary buttons, dominant text and borders, dark feature card backgrounds — the workhorse near-black that reads as softer and warmer than pure #000 |
| Coral Emphasis | `#ff5858` | Accent text for key words in headlines, emphasis highlights, and selective links — warm red against navy creates playful energy without corporate aggression |
| Mint Pulse | `#86e0c1` | Green state accent for badges, validation surfaces, and short status labels. |
| Butter Yellow | `#fedf89` | Top announcement banner, highlight washes — warm pastel yellow for friendly alerts that don't shout |
| Graphite | `#333333` | Secondary text, hairline borders, icon strokes — sits between navy and pure black for less-load-bearing elements |
| Slate | `#6d6f75` | Muted helper text, subdued borders, caption-level content — the cool gray for de-emphasized UI |
| Ash Canvas | `#f2f2f2` | Page background — warm light gray that lifts white cards without the coldness of pure white |
| Paper White | `#ffffff` | Card surfaces, button labels, overlapping panels — the surface layer above the Ash Canvas |
| Pure Ink | `#000000` | Maximum-emphasis icons, strongest borders, logo mark — used sparingly where absolute contrast is required |
| Warm Stone | `#e8e7e5` | Card drop-shadow tint — warm desaturated beige replaces cold black shadows for a paper-like depth |

## Typography

### GRIFTER — Display and brand-voice headings — hero, section openers, decorative labels. The chunky hand-printed character carries the notebook personality. Slightly loosened tracking (0.03em) keeps it readable at display scale.
- **Substitute:** Bagel Fat One, Permanent Marker, or Bowlby One (Google Fonts)
- **Weights:** 400, 700
- **Sizes:** 12px, 24px, 36px, 48px, 64px
- **Line height:** 1.0, 1.1, 1.2, 1.41, 2.0
- **Letter spacing:** 0.03em — stays positive even at large sizes, the opposite of most display type which tightens at scale

### Inter — All UI and body text — buttons, navigation, body copy, card content, badges, form labels. Tight tracking (-0.01em) at all sizes creates a compact, efficient reading rhythm. The 108px outlier likely powers a single oversized hero element.
- **Substitute:** Inter (already Google Fonts) or DM Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 16px, 18px, 20px, 22px, 24px, 36px, 108px
- **Line height:** 1.0, 1.1, 1.16, 1.18, 1.3, 1.4, 1.5, 1.55, 1.74
- **Letter spacing:** -0.01em — uniformly tight, no display-grade loosening

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.12px |
| body-sm | — | — | 14px | 1.55 | -0.14px |
| body | — | — | 16px | 1.55 | -0.16px |
| body-lg | — | — | 18px | 1.5 | -0.18px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 24px | 1.3 | -0.24px |
| heading | — | — | 36px | 1.2 | -0.36px |
| heading-lg | — | — | 48px | 1.16 | 1.44px |
| display | — | — | 64px | 1.1 | 1.92px |
| display-xl | — | — | 108px | 1 | -1.08px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **badges:** 8px
- **inputs:** 8px
- **buttons:** 8px
- **featureCards:** 24px

## Components

### Filled Primary Button
**Role:** Main call-to-action (Get started, Sign up)

Inkwell Navy (#151b31) background, Paper White (#ffffff) text, Inter 16px weight 500-600, 8px radius, 13px vertical / 20px horizontal padding, subtle 0 1px 3px shadow. Tight tracking and compact sizing keep it functional rather than celebratory.

### Outlined Ghost Button
**Role:** Secondary action on light backgrounds (Login / Sign up)

White or transparent background, 1px border in #e8e7e5 or Slate (#6d6f75), Inter 16px weight 500 in Inkwell Navy. 8px radius, 8px vertical / 16px horizontal padding. No shadow.

### Inverse Button
**Role:** Action on dark feature cards (Try me)

White background or white text on Inkwell Navy card, 8px radius, 13px-16px vertical padding. Same compact Inter treatment as primary button, inverted for dark surfaces.

### Top Announcement Banner
**Role:** Full-width site-wide message bar

Butter Yellow (#fedf89) background spanning full viewport width, Inter 14-16px centered, Inkwell Navy text with a 'Let's Talk' link in Coral Emphasis. Close (×) button at right edge.

### Navigation Header
**Role:** Site header with logo and auth

Minimal: logo mark (Inkwell Navy circle with white play-shape) + 'Tracky' wordmark in Inter 600 on left, Outlined Ghost Button on right. Transparent or Ash Canvas background, no shadow.

### Hero Display Headline
**Role:** Page-opening headline

GRIFTER 64px-108px weight 700 in Inkwell Navy, with one phrase swapped to Coral Emphasis for energy. Centered or left-aligned, 1.0-1.1 line-height, 1.92px tracking. Often mixed with inline hand-drawn SVG illustration between phrases.

### Dark Feature Card
**Role:** Inverted content section (Note your thoughts, etc.)

Inkwell Navy (#151b31) background, 16-24px radius, generous 40-48px internal padding. GRIFTER or Inter display heading in white, body text in Paper White at 70% opacity, Inverse Button for action. Warm stone shadow: 0 1px 4px rgba(138,133,125,0.2).

### Overlap White Card
**Role:** Product preview element overlapping the dark feature card

Paper White (#ffffff) surface, 16px radius, slight rotation (-3 to -8 degrees), positioned to overlap the right edge of the dark card. No visible border, relies on contrast against dark surface.

### Timer Widget
**Role:** Inline product demo element showing the timer feature

White pill-shaped card, Inkwell Navy text showing '0:00:00', circular Mint Pulse (#86e0c1) play button icon, small icon button to the right. Sits inline within hero text to demonstrate product contextually.

### Annotation Label
**Role:** Handwritten tutorial-style callout (start → stop → continue, click me)

GRIFTER or similar hand-printed font at 24-36px, typically in a blue or Inkwell Navy stroke, with a curved hand-drawn arrow. Positioned above or beside interactive elements to suggest 'try this'. Underlines are hand-drawn squiggles in Coral Emphasis.

### Text Link
**Role:** Inline text links and 'Let's Talk' style CTAs

Inter 16-18px weight 500-600, Coral Emphasis (#ff5858) for emphasis links or Inkwell Navy for utility links. No underline by default; underline appears on hover in the same color or in Graphite.

### Badge / Tag
**Role:** Small status indicators and category labels

8px radius, 8-10px vertical / 12-16px horizontal padding, Inter 12px weight 500. Backgrounds: Mint Pulse for success, Butter Yellow for highlight, Ash Canvas for neutral. Text in Inkwell Navy.

## Do's and Don'ts

### Do
- Use GRIFTER 64px+ weight 700 for hero and section openers — its hand-printed character is the brand voice, not decoration
- Apply Coral Emphasis (#ff5858) to exactly one word or phrase per headline for energy — never entire headings
- Pair Inkwell Navy (#151b31) fills with Paper White (#ffffff) text on primary buttons at 8px radius — this is the canonical CTA
- Use Ash Canvas (#f2f2f2) as the universal page background — it lifts white cards with a warm paper feel
- Apply the warm stone shadow rgba(138,133,125,0.2) 0 1px 4px on feature cards instead of cold black shadows
- Use Inter at -0.01em tracking for all UI text — let GRIFTER carry the personality at display scale
- Overlap a tilted Paper White card onto a dark Inkwell Navy feature card to create visual product demo moments

### Don't
- Don't use GRIFTER for body text, buttons, navigation, or form labels — it loses readability below 24px and dilutes the brand voice
- Don't apply Coral Emphasis (#ff5858) to more than one element per visual zone — it loses emphasis when overused
- Don't use pure #000000 as a background or large fill — Inkwell Navy (#151b31) is the system black, pure black is reserved for icon strokes
- Don't stack multiple bold shadows on elevated components — the system relies on 1-4px blurs with under 25% opacity
- Don't use radius below 8px on interactive elements — the softness is part of the friendly personality
- Don't use cold gray drop-shadows (rgba(0,0,0,*)) on cards — the warm stone shadow is the signature depth treatment
- Don't introduce new accent colors — the system speaks through navy, coral, mint, and butter yellow; adding more breaks the notebook palette

## Elevation

- **Primary buttons:** `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`
- **Feature cards:** `0 1px 4px rgba(138,133,125,0.2) — warm stone shadow replaces cold black`

## Surfaces

- **Ash Canvas** (`#f2f2f2`) — Page background — the warm paper base
- **Paper White** (`#ffffff`) — Card surfaces, elevated panels, button labels
- **Butter Yellow** (`#fedf89`) — Announcement banner — temporary high-attention surface
- **Inkwell Navy** (`#151b31`) — Dark feature card — inverted surface for contrast sections

## Imagery

Illustration-first visual language with zero photography. Hand-drawn SVG characters (a bunny mascot), organic blob shapes in Mint Pulse and a soft blue scattered as decorative atmosphere, and inline doodled annotations with curved arrows and handwritten labels ('start → stop → continue', 'click me'). Illustrations are outlined and lightly filled in brand colors, positioned to overlap text and cards rather than sit in dedicated image containers. The bunny character and organic shapes are decorative atmosphere, not explanatory content — they signal creativity and approachability. No product screenshots in the traditional sense; instead, live product elements (timer widget) appear inline within headlines as contextual demos. Overall density is text-dominant with illustration as accent punctuation, never as hero imagery.

## Layout

Single-column max-width contained flow at 1200px. Hero is full-width on Ash Canvas with a centered display headline mixed with inline hand-drawn illustration and a centered Filled Primary Button. Below the hero, content flows in vertical sections of 80px gap, alternating between light sections (Ash Canvas with Paper White cards) and dark sections (Inkwell Navy feature cards with overlapping white product-preview cards rotated -3 to -8 degrees). No multi-column grids in the main flow — the system stays single-column, letting the dark feature cards provide visual variety through inversion rather than through column complexity. Navigation is a minimal sticky-or-static top bar with logo left and a single auth button right, no mega-menu. A full-width Butter Yellow announcement banner sits above the header. Sections feel spacious and breathing, with each dark card acting as a full-bleed moment of inversion before returning to the light canvas.

## Similar Brands

- **Notion** — Same hand-crafted personality with display type, muted canvas, and single-color accent punctuation in headlines
- **Trello** — Same project management space with playful illustration accents and a warm light canvas, though Trello leans more on saturated brand blue
- **Pitch** — Same bold display typography paired with Inter UI, generous spacing, and personality-forward micro-illustrations
- **Height** — Same product management space with a single dominant dark color as workhorse, compact UI, and inverted dark feature cards
- **Linear** — Same tight Inter tracking, compact 8px-radius components, and a near-black navy as the primary workhorse color
