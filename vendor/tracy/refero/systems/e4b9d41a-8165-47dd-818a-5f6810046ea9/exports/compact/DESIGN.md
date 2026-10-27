# Pirsch Analytics — Style Reference
> sunlit paper notebook with highlighter swatches

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Pirsch uses a warm paper-notebook language: a soft cream canvas (#f8f5ed) replaces the usual SaaS white, and the only chromatic punctuation is a sunshine yellow (#ffda6e) that reads as a highlighter, not a brand stamp. Almost the entire interface is achromatic — ink-black text and 1px hairline borders do the structural work that shadows and fills do elsewhere. Typography is a single family (DM Sans) running from a whisper at 14px to a commanding 64px display, with generous 8px-grid breathing room and unusually rounded 24px corners that make cards feel like sticky notes. Green (#6ece9d) appears sparingly as a status/availability signal (happy-customer badge, theme-toggle dot) and never competes with yellow. The overall feel is editorial and tactile — closer to a printed report than a dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Sunshine Highlight | `#ffda6e` | Primary action fill, step badges, accent highlights, callout backgrounds |
| Mint Signal | `#6ece9d` | Green action color for filled buttons, selected navigation states, and focused conversion moments |
| Cream Paper | `#f8f5ed` | Page canvas, card surfaces, pill interiors |
| Ink | `#000000` | Primary headings, body text, 1px hairline borders on cards, images, and dividers |
| Graphite | `#707070` | Secondary body text, link text, muted borders and dividers |

## Typography

### DM Sans — Single-family system carrying everything from body copy to 64px display headlines. Weight 400 for prose, 500 for headings, step badges, and button labels. Activating ss03 and ss04 stylistic alternates gives DM Sans a more humanist, slightly editorial character that suits the paper-notebook metaphor.
- **Substitute:** Inter, Nunito Sans
- **Weights:** 400, 500
- **Sizes:** 14, 16, 18, 20, 24, 28, 64
- **Line height:** 1.25–2.22
- **Letter spacing:** -0.016em on display headings, +0.286em on uppercase step badges
- **OpenType features:** `"ss03", "ss04"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | 0px |
| body-sm | — | — | 16px | 1.5 | 0px |
| body | — | — | 18px | 1.5 | 0px |
| subheading | — | — | 20px | 1.5 | 0px |
| heading-sm | — | — | 24px | 1.5 | 0px |
| heading | — | — | 28px | 1.25 | 0px |
| display | — | — | 64px | 1.25 | -1.02px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 24px
- **images:** 12px
- **inputs:** 6px
- **buttons:** 24px

## Components

### Sunshine Filled Button
**Role:** Primary action

24px radius, #ffda6 fill, #000000 text, 16px 24px padding, DM Sans 500. Centered text, used for the main 'Get Started For Free' conversion. Single instance per view — yellow is rationed.

### Ghost Ink Button
**Role:** Secondary action

24px radius, transparent fill, 1px #000000 border, #000000 text, 16px 24px padding, DM Sans 500. Pairs with the sunshine button or stands alone on neutral contexts.

### Numbered Step Badge
**Role:** Section index marker

Pill (9999px radius) split into two zones: a left 24x24 cream square with #000000 numeral at 14px 500, and a right zone with the step name in uppercase 14px 500 letterspaced +0.286em. 1px #000000 border surrounds the whole pill. Identifies '1 EASY START', '2 INSTANT OUTPUT', '6 GOOD COMPANY'.

### Feature Card
**Role:** Two-up feature content

Cream (#f8f5ed) surface, 24px radius, 1px #000000 hairline border, 32px padding, no shadow. Heading in 24px DM Sans 500, body in 18px #707070. Cards define themselves through outline, not fill.

### Filter Tag Pill
**Role:** Active filter chip

24px radius, near-white (#f8f5ed) fill, 1px #000000 border, 14px DM Sans 500 with a leading icon. Used for the 'Pages / Entry Pages / Exit Pages / Referrers / Sources' tag set and the dark 'Country is Germany' variant.

### Dark Filter Chip
**Role:** Applied filter state

24px radius, #000000 fill, #f8f5ed text, 14px DM Sans 500, with a trailing × dismiss. Contrasts with the light filter tags to show applied state.

### Logo Grid Cell
**Role:** Social proof / customer logos

Transparent, no border, centered monochrome wordmark or mark in #000000. 8-column responsive grid with 32px gap. Logos are rendered as raw shapes on the cream canvas — no card wrappers.

### Display Headline
**Role:** Page section hero

64px DM Sans 500, #000000, letter-spacing -0.016em (~-1.02px), line-height 1.25. Centered, sits below a step badge with 32px gap. Carries the editorial weight of the whole page.

### Section Subhead
**Role:** Supporting paragraph

18px DM Sans 400, #707070, max-width ~640px, centered. Voice is instructional and plain — sits 16px below the display headline.

### Status Dot Badge
**Role:** Live / happy state indicator

24px radius pill or 12px circle, #6ece9 fill with optional #000000 label. Used sparingly for the 'happy customer' indicator and the theme-toggle dot in the corner.

### Bordered Avatar Tile
**Role:** Brand mark display

48px (or similar) square with 12px radius, cream fill, 1px #000000 border, centered monochrome icon. Used for the Pirsch logo lockup in the CTA block.

### CTA Block
**Role:** Final conversion section

Centered stack: avatar tile (12px radius) → 64px display question → 18px #707070 subtext → sunshine button. 64px section padding top and bottom. The whole page resolves here.

### Image Frame
**Role:** Inline image border

12px radius, 1px #000000 border, no shadow. Gives every product screenshot a printed-on-paper feel.

## Do's and Don'ts

### Do
- Use #ffda6 (Sunshine Highlight) for the single primary CTA per view; never fill large surfaces or backgrounds with it.
- Define cards and tiles with 1px #000000 hairline borders at 24px radius — never use drop shadows for elevation.
- Set display headlines at 64px DM Sans 500 with -0.016em letter-spacing; this is the editorial anchor of every section.
- Use uppercase DM Sans 500 with +0.286em letter-spacing for step badges and small labels only; leave body copy untracked.
- Keep the cream (#f8f5ed) canvas unbroken across sections — alternate rhythm through spacing and border weight, not background color.
- Activate DM Sans stylistic alternates 'ss03' and 'ss04' globally; they carry the humanist character that makes the system feel editorial.
- Reserve #6ece9d (Mint Signal) for status dots and positive state chips; it is a signal, not a brand color.

### Don't
- Don't add drop shadows, blurs, or any form of box-shadow elevation — the system is intentionally flat and ink-on-paper.
- Don't introduce a second body font or a serif — DM Sans at multiple weights is the entire typographic voice.
- Don't use pure white (#ffffff) as a surface — the cream #f8f5ed is the canvas, and white would break the paper metaphor.
- Don't use the yellow (#ffda6e) on body text at small sizes; its contrast against cream drops below readable thresholds.
- Don't use the green (#6ece9d) as a CTA or button background — it is a status signal, not an action color.
- Don't set body or caption text in #000000 when #707070 reads cleanly; reserve ink for headings and emphasis.
- Don't add gradients, image overlays, or decorative fills — the system is flat color, 1px lines, and one accent swatch.

## Elevation

The system has effectively zero shadow elevation. Cards, images, and tiles are defined entirely by 1px #000000 hairline borders on the cream surface — the visual logic of ink lines on paper, not of floating layers. No drop shadows, no inner glow, no blur. If a component needs to feel above the page, raise its border weight or switch to the yellow surface — never add a shadow.

## Surfaces

- **Cream Page** (`#f8f5ed`) — Base canvas — warm paper background that carries the whole system
- **Cream Card** (`#f8f5ed`) — Feature cards sit on the same cream but are defined by 1px ink hairline borders and 24px radius, not by color contrast
- **Sunshine Callout** (`#ffda6`) — Yellow surface used for primary CTAs and step-number badges — the only chromatic surface in the stack

## Imagery

Imagery is restrained and functional: monochrome product screenshots (dashboard tiles, filter chips, data tables) framed by 1px ink borders at 12px radius, never full-bleed. Customer logos appear as raw monochrome wordmarks on the cream canvas, no card wrappers or color treatments. The Pirsch brand mark is a single black glyph on cream. No photography, no illustrations, no decorative graphics — the only color in the visual system comes from the two accent swatches, and they appear as flat fills, never as gradients or tinted images.

## Layout

Centered, max-width 1200px container with generous 64px section gaps. The page reads as a vertical scroll of editorial bands: logo cloud → numbered step → display headline → centered subtext → two-up feature cards → logo cloud → CTA. All hero sections are centered stacks on the cream canvas — no split text/image compositions, no asymmetric layouts. Feature sections use a 2-column card grid at 32px column gap; logo clouds use a 4–8 column grid. Navigation is minimal: a small wordmark, no sticky header, no sidebar. Density is comfortable and breathy — each section gets full vertical room to settle before the next begins.

## Similar Brands

- **Stripe** — Same single-family sans (DM Sans / Inter lineage), generous whitespace, and a near-monochrome palette that lets a single accent color carry the hierarchy
- **Linear** — Same hairline-border-on-light-surface logic with no drop shadows, and the discipline of rationing color to one vivid accent per view
- **Notion** — Same warm off-white canvas, rounded 20–24px card radii, and a minimal two-tone accent system that reads as paper rather than screen
- **Fathom Analytics** — Direct competitor in the privacy-analytics space with the same editorial single-accent approach, cream canvas, and 64px-class display headlines
