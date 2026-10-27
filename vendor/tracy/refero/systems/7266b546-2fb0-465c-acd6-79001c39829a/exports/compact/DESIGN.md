# Tesla — Style Reference
> Automotive Showroom on Screen. High-fidelity product visuals dominate, framed by a minimal, functional interface that gets out of the way.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design operates like a premium automotive showroom translated to the screen. Every section is a full-bleed, cinematic product photograph, with UI elements acting as minimal, functional plaques. The palette is starkly achromatic, save for a single, electric Tesla Blue (#3e6ae1) reserved exclusively for primary calls-to-action, functioning like an ignition button. Typography is neutral and technical, serving information without asserting its own personality. This systematic subordination of UI to imagery ensures the product—the car, the solar panel—is always the undisrupted hero.

## Colors

| Name | Value | Role |
|------|-------|------|
| Tesla Blue | `#3e6ae1` | Primary CTAs ('Order Now') — a single, focused point of saturated color in an otherwise grayscale environment, creating an unmissable action prompt. |
| Pure White | `#ffffff` | Primary page backgrounds, card surfaces, text on dark/blue buttons. |
| Off-White | `#eeeeee` | Secondary content cards, subtle dividers between white sections. |
| Parchment | `#e5e3df` | Rare alternative background color for specific sections. |
| Light Border | `#cccccc` | Inactive UI element borders, subtle dividers. |
| Subtle Gray | `#8e8e8` | Placeholder text, tertiary UI details. |
| Steel | `#5c5e62` | Secondary text, footer links, icon fills. |
| Charcoal | `#393c41` | Primary body text, text on light buttons, header navigation. |
| Onyx | `#171a20` | Primary heading text, dark button backgrounds. |
| Carbon | `#000000` | SVG icon fills, text overlays on light images. |

## Typography

### Universal Sans Display — Used for all major headings and product titles. Its clean, geometric form provides a technical and confident voice that feels engineered, not decorated.
- **Substitute:** Inter, Manrope
- **Weights:** 400, 500
- **Sizes:** 12px, 20px, 28px, 34px, 40px, 48px
- **Line height:** 1.17-1.41

### Universal Sans Text — The workhorse font for body copy, buttons, navigation, and all UI text. Chosen for its supreme legibility and neutrality, it delivers information efficiently without distracting from the product visuals.
- **Substitute:** Inter, SF Pro Text
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 17px
- **Line height:** 1.00-1.67

### Roboto — Reserved for fine print, legal disclaimers, and other low-hierarchy text where utility is the sole concern.
- **Substitute:** Roboto, system-ui
- **Weights:** 400, 500
- **Sizes:** 11px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | — |
| body | — | — | 14px | 1.43 | — |
| heading-sm | — | — | 20px | 1.4 | — |
| heading | — | — | 28px | 1.29 | — |
| heading-lg | — | — | 40px | 1.2 | — |
| display | — | — | 48px | 1.17 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 8px
- **inputs:** 4px
- **modals:** 8px
- **buttons:** 4px

## Components

### Primary CTA Button
**Role:** The main action button for ordering or engaging.

Solid Tesla Blue (#3e6ae1) background with Pure White (#ffffff) text. 4px border radius. Padding is 4px top/bottom, 24px left/right.

### Secondary Ghost Button
**Role:** Secondary action like 'Learn More' or 'Demo'.

Transparent background with a thin Onyx (#171a20) border. Text is also Onyx (#171a20). 4px border radius. Padding is 4px top/bottom, 16px left/right.

### Modal Button (White)
**Role:** Secondary option within a modal or pop-up.

Solid Off-White (#eeeeee) background with Charcoal (#393c41) text. 4px border radius. Padding is 4px top/bottom, 24px left/right.

### Header Navigation Link
**Role:** Main site navigation.

Unstyled text link with Charcoal (#393c41) color. No background or borders.

### Footer Navigation Link
**Role:** Tertiary links in the site footer.

Unstyled text link with Steel (#5c5e62) color. Appears smaller than header navigation.

### Product Hero Section
**Role:** Full-screen container showcasing a single product.

Full-bleed background image. Contains a centered, stacked group of a Display heading (Onyx #171a20 or White #ffffff depending on image), Subheading text, and a pair of Primary/Secondary CTA buttons.

## Do's and Don'ts

### Do
- Always lead with a full-bleed, high-quality product image for every major section.
- Center-align text and CTAs over background images.
- Use Tesla Blue (#3e6ae1) exclusively for primary, high-priority actions like 'Order Now'.
- Pair a filled primary CTA with a white or ghost secondary CTA.
- Maintain a strict achromatic palette (white, grays, black) for all UI outside of the primary CTA.
- Use the 4px base unit for all padding, margins, and radii (e.g., 4px, 8px, 16px, 24px).
- Keep UI chrome, like headers and footers, visually minimal and unobtrusive.

### Don't
- Don't use Tesla Blue (#3e6ae1) for text, headlines, or decorative elements.
- Don't introduce any other saturated colors into the UI palette.
- Don't use complex components; prefer simple, stacked text and button layouts.
- Don't use large shadows, gradients, or heavy visual effects on UI elements.
- Don't create layouts where text dominates over imagery.
- Don't use border radii larger than 8px.
- Don't use serif or expressive display fonts; maintain a neutral, technical typographic voice.

## Imagery

The visual language is defined by cinematic, high-fidelity product photography. Every image is treated as a hero shot, typically full-bleed, occupying the entire viewport. The photography style is sharp, clean, and often aspirational, showing products in ideal contexts (a car on an open road, solar panels on a modern home). Color grading is natural and vibrant to make the product pop against the neutral UI. The density is image-dominant; text and UI exist only to support the visual narrative established by the photos.

## Layout

The page structure is a vertical series of full-screen, edge-to-edge content blocks, creating a 'scrolling presentation' experience. The dominant pattern is a centered stack: a large headline, supporting subtext, and action buttons overlaid directly onto a full-bleed background image. There is no visible page container; the browser viewport is the frame. Navigation is confined to a thin, non-sticky header bar at the very top, preserving maximum screen real estate for product visuals. Section transitions are seamless, with no visible gaps or dividers.

## Similar Brands

- **Apple** — Identical product-as-hero philosophy with full-bleed imagery, minimal UI, and a clean, technical sans-serif typography.
- **Rivian** — Direct competitor using a similar full-screen, scroll-based storytelling layout with centered text over aspirational vehicle photography.
- **Sonos** — Shares the use of pristine product shots on clean, achromatic backgrounds with minimal, functional UI components.
- **DJI** — Employs a similar high-tech, premium aesthetic with cinematic product visuals and a dark/light minimalist interface.
