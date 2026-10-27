# NGLORA — Style Reference
> NGLORA - Apothecary's Formulary. A meticulously organized space where typography and product photography are treated with scientific precision.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design evokes a scholarly apothecary's formulary, where every element is presented with meticulous precision. It operates on a starkly limited palette of warm off-white and charcoal, creating a high-contrast, text-forward environment. A rigid, architectural layout with sharp 0px corners dominates, reinforcing a sense of order and clinical quality. The system's signature is the typographic tension between the humanist serif 'Zapf-Humanist' for expressive headlines and the neutral sans-serif 'SuisseIntl' for all functional text, lending an air of classicism to a modern digital interface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#fffef2` | Primary page background, light surfaces. |
| Charcoal | `#333333` | Primary text, UI icons, primary buttons, borders. |
| Ink Black | `#000000` | Hero section text, high-emphasis text elements. |
| Carbon | `#252525` | Footer background, secondary dark surfaces. |
| Stone | `#666666` | Secondary body text. |
| Slate | `#d6d5cc` | Carousel scrollbar track. |
| Alabaster | `#ffffff` | Text on dark backgrounds, rare highlight surfaces. |
| Umber | `#945c26` | Accent text on specific badges; provides a rare, earthy color pop. |

## Typography

### SuisseIntl — The workhorse font for all UI text, body copy, navigation, product titles, and buttons. Its neutrality provides a stable, legible foundation for the more expressive serif.
- **Substitute:** Inter, Helvetica Neue
- **Weights:** 400, 700
- **Sizes:** 11px, 12px, 14px, 16px, 18px, 30px
- **Line height:** 1.20-2.86

### Zapf-Humanist — Reserved for major, atmospheric headlines. Its humanist serif form contrasts with the clinical sans-serif, adding an editorial, classic quality.
- **Substitute:** Optima, Palatino
- **Weights:** 400
- **Sizes:** 31px
- **Line height:** 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.7 | — |
| body | — | — | 14px | 1.6 | — |
| heading-sm | — | — | 18px | 1.33 | — |
| heading | — | — | 30px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1600px
- **Section gap:** 96-128px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Dark Action Button
**Role:** Primary call-to-action, such as 'Add to Cart'.

Background: Charcoal (#333333). Text: Parchment (#fffef2). Padding: 12px 24px. Radius: 0px. No border. Font: SuisseIntl.

### Outline Navigation Button
**Role:** Secondary header actions like 'Email sign up' or 'Search'.

Background: transparent. Text: Charcoal (#333333). Border: 1px solid rgba(51, 51, 51, 0.2). Padding: ~8px 16px. Radius: 0px. Font: SuisseIntl.

### Text Link
**Role:** Inline navigation or tertiary actions.

Background: transparent. Text: Charcoal (#333333). No border or padding. Underlined on hover. Font: SuisseIntl.

### Hero Outline Button
**Role:** Main CTA within the hero section.

Background: transparent. Text: Alabaster (#FFFFFF) or Ink Black (#000000) depending on hero video. Border: 1px solid matching text color. Padding: 12px 24px. Radius: 0px. Font: SuisseIntl.

### Text Input / Select
**Role:** Form fields for user input or selection.

Background: Parchment (#fffef2). Text: Charcoal (#333333). Border: 1px solid rgba(51, 51, 51, 0.2). Radius: 0px. Padding: ~12px 20px.

### Informational Badge
**Role:** Small text labels above product titles, e.g., 'New addition'.

Background: transparent. Text: Charcoal (#333333). Radius: 0px. Font: SuisseIntl, 11px, bold.

### Circular Arrow Button
**Role:** Carousel navigation controls.

Background: transparent. Border: none. Radius: 9999px. Contains a simple arrow icon in Charcoal (#333333).

## Do's and Don'ts

### Do
- Use Zapf-Humanist exclusively for large, emotive headlines, otherwise default to SuisseIntl.
- Maintain sharp 0px corners on all rectangular UI elements like cards, buttons, and inputs.
- Rely on generous whitespace (96px+ between sections) for separation, not dividers or shadows.
- Center-align text and imagery within product cards and feature blocks.
- Use the Parchment (#fffef2) and Charcoal (#333333) combination for primary content.
- Keep layouts simple: centered stacks or balanced multi-column grids.
- Use the Dark Action Button for all primary purchasing actions.

### Don't
- Do not use rounded corners on any element other than circular icon buttons.
- Do not use drop shadows or any other 3D-effect for elevation.
- Do not introduce new colors; the palette is intentionally restricted.
- Do not use gradients.
- Do not place text over complex parts of images; ensure high contrast.
- Do not use lifestyle photography that shows models or hands using products.
- Do not create complex, overlapping, or asymmetrical layouts.

## Elevation

This system actively avoids shadows for elevation. Depth and hierarchy are achieved through typographic scale, stark color contrast between Parchment (#fffef2) and Charcoal (#333333), and generous whitespace, not through layered surfaces or drop shadows. This creates a flat, graphic, and print-inspired aesthetic.

## Imagery

The visual language for imagery is stark and artifact-like. Product photography features items isolated and centrally framed against the Parchment (#fffef2) background, akin to specimens in a lab or objects in a gallery. There is a deliberate absence of lifestyle context, models, or hands. The focus is purely on the product's form, amber glass, and typographic labels. Hero sections may use moody, atmospheric video focusing on texture and sensation (e.g., fur, water) rather than direct product use, providing a sensory counterpoint to the clinical product shots.

## Layout

The page follows a highly structured, architectural model with a generous max-width of around 1600px, within which content is neatly centered. The structure is a vertical stack of full-width bands, often alternating between the Parchment background and full-bleed imagery or video in the hero. Vertical rhythm is defined by expansive gaps (96px+) between sections. Content is arranged in simple, centered stacks or rigid 3-column grids for product carousels. This methodical, spacious, and grid-based approach reinforces the brand's precision and focus.

## Similar Brands

- **Byredo** — Similar minimalist product photography, monochrome palettes, and premium typographic focus.
- **Le Labo** — Shares the 'apothecary' label aesthetic, reliance on typography for branding, and a refined e-commerce experience.
- **SSENSE** — Employs a similar brutalist-inspired grid layout and a strong, singular sans-serif font as a core identity element.
- **Vitra** — Swiss design sensibility with a focus on gridded layouts, high-quality typography (sans-serif), and clean product presentation.
