# Pravah — Style Reference
> engineering dossier on warm parchment

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Pravah's design system operates on a near-monochromatic warm-neutral palette anchored by a parchment-cream canvas and punctuated by deep aubergine-black sections. The visual language is closer to an engineering dossier than a SaaS landing page: wireframe grid illustrations, pointillist pixel-mapped photography, and uppercase tracked labels that read like field notes. Typography is single-family (ABCfavorit Book) and does all the expressive work through two weights, tight display tracking, and open uppercase badges. Contrast is achieved through tonal inversion — full sections flip from cream to near-black — rather than chromatic accents. The result feels measured, scientific, and quietly confident, like infrastructure software that doesn't need to perform.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#f3f1ed` | Primary page canvas — the warm off-white that gives the entire system its editorial, non-digital feel |
| Pure White | `#ffffff` | Card surfaces, badge fills, and inset panels — sits one step above the parchment canvas to create gentle elevation without shadows |
| Ink Black | `#181011` | Primary text, default borders, nav strokes, and structural outlines — the dominant typographic and border color across all contexts |
| Charcoal | `#222222` | Secondary headings and heavier-weight text where slightly softer than Ink Black is desired |
| Aubergine Black | `#302023` | Dramatic dark-section backgrounds (Problem, full-bleed inverse bands) — the only near-saturated tone, used to invert the page temperature |
| Ash | `#aaaaaa` | Muted text, inactive states, and lighter border treatments where Ink Black would be too heavy |
| Dim | `#666666` | Captions, timestamps, and tertiary metadata where hierarchy needs to recede |
| Bone | `#d8d4d4` | Hairline borders, illustration fills, and low-emphasis dividers — the lightest structural line color |

## Typography

### ABCfavorit Book — Single-family system carrying all UI text. The two-weight binary (regular/bold) replaces color or size variation for hierarchy. Weight 400 reads as body and supporting text; weight 700 is reserved for emphasis lines, key headings, and navigation. The two stylistic alternates ss04 and ss11 are enabled globally — these likely alter specific glyphs (likely the 'a' and 'g' or similar) that give ABCfavorit its distinctive contemporary grotesque character.
- **Substitute:** Inter, or Söhne (paid) — any neutral geometric grotesque with similar x-height and open apertures
- **Weights:** 400, 700
- **Sizes:** 12, 14, 15, 17, 20, 28, 32, 40, 48
- **Line height:** 1.10 (display), 1.30 (headings), 1.40 (subheadings), 1.50 (body)
- **Letter spacing:** -0.02em on display/headlines, 0.10em on uppercase labels and badges
- **OpenType features:** `"ss04" on, "ss11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0.1px |
| body-sm | — | — | 14px | 1.5 | — |
| body-lg | — | — | 17px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 28px | 1.3 | — |
| heading | — | — | 32px | 1.3 | -0.02px |
| heading-lg | — | — | 40px | 1.2 | -0.02px |
| display | — | — | 48px | 1.1 | -0.02px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 4px
- **badges:** 4px
- **inputs:** 4px
- **buttons:** 100px

## Components

### Pill CTA Button
**Role:** Primary call-to-action (Get In Touch, nav CTA)

Fully rounded (100px radius) ghost button. Ink Black (#181011) 1px border on transparent fill, ABCfavorit 400 at 15px, Ink Black text. Padding 8px 20px. No fill state — always outlined. The extreme radius makes the button read as soft and approachable against the technical surroundings.

### Square Outlined Button
**Role:** Secondary action in dense areas

4px radius, Ink Black 1px border, 4px 16px padding. ABCfavorit 400 at 14-15px. Used where a pill shape would feel too soft for a technical context.

### Uppercase Section Label
**Role:** Section tags (PROBLEM, VISION, CRITICAL)

White (#ffffff) fill, 4px radius, 2px 8px padding. ABCfavorit 400 at 12px in Ink Black with 0.10em letter-spacing. Uppercase tracked text reads like a field classification tag. In dark sections, the fill becomes the dark surface with white text or stays white-on-dark.

### Glass Notification Card
**Role:** Overlay alert/widget on hero imagery

Semi-transparent white fill over the hero image, 4-8px radius, soft blur backdrop. ABCfavorit 400 at 14px for body, 700 for the alert title (CRITICAL). Padding 12-16px. These cards feel like real-time monitoring widgets floating on the grid image.

### Diamond Grid Icon
**Role:** Visual marker for problem/vision list items

3×3 or 4×4 grid of small diamond/rhombus shapes (8-10px each). Filled or outlined in Ash (#aaaaaa) or white depending on section. The dot-pattern acts as a miniature legend or status grid — consistent with the pointillist aesthetic.

### Problem/Vision Item
**Role:** Row entry in the dark section lists

Two-column row: diamond grid icon on left (40-48px wide), heading + body text on right. Heading at 20px weight 700 white, body at 14-15px weight 400 Ash. Separated from next item by 1px Ink Black divider with 0.3 opacity. Padding 24px vertical.

### Top Navigation Bar
**Role:** Site-wide nav

Horizontal bar on Parchment canvas. Logo lockup (small diamond + 'Pravah' at 15px weight 400) on left, nav links (Problem, Technology, Team) at 14-15px in middle, pill CTA on right. Items separated by 12-16px gap. No background fill — sits directly on canvas with only a bottom hairline border in Bone (#d8d4d4) to separate from hero.

### Hero Text Block
**Role:** Hero left-column content

Two-line mixed-weight treatment: an introductory line at 28-32px weight 400 in Charcoal or Ash, followed by the main statement at 40-48px weight 400 in Ink Black. The weight stays at 400 throughout — hierarchy comes from size and the subtle tonal shift from Ash to Ink Black. The lead-in line ('The grid is at its limits.') sets a quieter register than the bold proclamation below it.

### Wireframe Illustration Panel
**Role:** Technical diagram in feature sections

Large square or rectangular panel containing thin black line art — isometric grids, utility poles, flow diagrams. 1px strokes in Ink Black on Parchment or white fill. No fills, no gradients. Functions as a technical schematic rather than decorative imagery. Often paired with a small alert card overlay (Overload risk detected).

### Inset Alert Card
**Role:** Contextual callout within illustrations

Small white card overlaid on a wireframe diagram. 4px radius, subtle 1px Bone border. ABCfavorit 700 at 14px for alert title, 400 at 12-14px Ash for explanation. Reads as a machine-generated status message within a technical schematic.

### Full-Bleed Dark Section
**Role:** Tonal inversion band (Problem section)

Entire section flips to Aubergine Black (#302023) background. All text becomes white or Ash. Diamond grid icons and list items are restyled in white. This inversion is used sparingly — at most one per page — to create a dramatic mid-page contrast and signal a shift from introduction to problem statement.

## Do's and Don'ts

### Do
- Use ABCfavorit Book at weight 400 for all body and most display text — the 700 weight is reserved for emphasis lines, nav, and specific heading accents, never decorative
- Set letter-spacing to -0.02em on all text 28px and above, and 0.10em on all uppercase labels and badges 12px or smaller
- Enable font features 'ss04' and 'ss11' globally on all ABCfavorit instances to preserve the custom glyph character
- Use the Parchment (#f3f1ed) canvas for all default page backgrounds and reserve Aubergine Black (#302023) for full-bleed section inversions only
- Apply 4px radius to all cards, badges, and buttons except primary CTAs, which use 100px (pill shape)
- Use the uppercase tracked label pattern (12px, 0.10em, 2px 8px padding, 4px radius) for all section classifications and status tags
- Separate list items in the dark sections with 1px Ink Black dividers at 30% opacity, not extra vertical padding

### Don't
- Do not introduce chromatic accent colors — the entire palette is warm-neutral, and any blue, green, or red will break the editorial-engineering tone
- Do not use shadows for card or button elevation — depth comes from surface tone shifts and 1px borders only
- Do not mix multiple font families — ABCfavorit Book is the sole typeface, and hierarchy must be achieved through weight and size alone
- Do not use the 700 weight for body text or long-form copy — it is reserved for short emphatic lines and navigation
- Do not use the Aubergine Black background for inline elements or small components — it belongs only in full-bleed section inversions
- Do not use gradients on text, buttons, or backgrounds — the system is flat and printed in feel
- Do not use rounded corners above 8px on cards or containers — only the pill CTA gets the 100px radius

## Elevation

- **Glass Notification Card:** `0 4px 20px rgba(0,0,0,0.15), backdrop-filter: blur(8px)`
- **Inset Alert Card:** `none — relies on 1px Bone border for definition`

## Surfaces

- **Parchment Canvas** (`#f3f1ed`) — Base page background across most sections
- **White Card** (`#ffffff`) — Inset panels, alert cards, and badge fills one level above canvas
- **Aubergine Inversion** (`#302023`) — Full-bleed dark sections that flip tonal register for dramatic contrast

## Imagery

The visual language is built from three distinct image types: (1) Pointillist pixel-mapped photography — real photographs of power infrastructure (transmission towers, grid hardware) rendered as dot-matrix patterns, giving them a data-scanned quality; (2) Thin-line wireframe illustrations — isometric grids, utility poles, and flow diagrams drawn in 1px black strokes on Parchment or white, functioning as technical schematics; (3) Overlaid glass notification cards — semi-transparent widgets with real-time data, creating a monitoring-dashboard feel. Photography is dark and moody (deep purples and blacks), always full-bleed and contained within the right half of the hero. Illustrations sit in large square panels on the left, balanced with text on the right. No lifestyle photography, no human subjects, no decorative stock — every image serves a technical or data-narrative purpose.

## Layout

The page is structured as a full-bleed max-width (1200px) container with a two-column hero that splits left (text, 45%) and right (image, 55%). Below the hero, sections alternate between Parchment and full-bleed Aubergine Black bands, each 64-80px vertical padding. Content within sections is arranged in two equal columns for problem/vision lists, or as left-illustration/right-text pairs for technology sections. Navigation is a minimal top bar with no sticky behavior or shadow. The overall rhythm is unhurried — generous vertical breathing room between sections, no dense data tables, and a clear left-to-right reading flow. The dark Problem section creates a dramatic midpoint before returning to Parchment for the technology/solution content below.

## Similar Brands

- **Common Sense Machines** — Same near-monochromatic warm-neutral palette with dark inversion sections, single-family grotesque typography, and uppercase tracked labels for section tags
- **Anthropic** — Similar editorial scientific tone with cream canvas, restrained palette, weight-only typographic hierarchy, and dark dramatic section inversions
- **Hugging Face** — Engineering-dossier aesthetic with wireframe-style illustrations, pointillist or pixel-mapped photography, and uppercase technical labels
- **Form Energy** — Infrastructure/energy domain with same parchment-and-aubergine warm-neutral palette, ABC-like grotesque type, and dramatic full-bleed dark section breaks
- **Mistral AI** — Restrained near-monochromatic interface, two-weight type system, pill-shaped ghost CTAs, and technical schematic illustrations replacing decorative imagery
