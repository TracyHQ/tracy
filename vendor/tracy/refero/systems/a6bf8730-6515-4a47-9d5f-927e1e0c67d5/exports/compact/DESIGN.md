# Kajabi — Style Reference
> Gallery white walls holding warm portraits — the framework is invisible, the humans are the brand.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Kajabi runs a monochrome editorial system: pure white canvas, near-black type, and no chromatic brand color anywhere. The page surrenders all color to the content — full-bleed expert portraits, warm lifestyle video, photography — so the interface recedes and the humans do the selling. Type does the heavy lifting through scale and tight tracking rather than color or weight, with Haffer rendering at display sizes up to 60px in near-black #0a0a0a. Surfaces are flat, corners are sharp at 2px (not the modern SaaS 8-12px), and buttons are solid black rectangles. The contrast between this strict achromatic UI and the rich, warm photography creates the brand's signature tension: a clinical framework housing emotional content.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on dark backgrounds, inverse text in dark sections |
| Ink Black | `#0a0a0a` | Primary text, filled CTA buttons, navigation, footer — the only action color in the entire system, near-black not pure #000 |
| Charcoal | `#1f1f1e` | Dark section backgrounds (category bands, video frame borders), elevated dark surfaces |
| Stone | `#535250` | Secondary body text, muted helper text, subdued list/border accents |
| Driftwood | `#949189` | Tertiary text, icon strokes, subtle borders — warm gray that hints at the brand's earthy content tone |
| Sand | `#bcb9ae` | Link borders at rest, muted borders, decorative dividers — warmest neutral, signals hover-to-reveal interaction |
| Mist | `#e9e8e7` | Light surface tint, input field backgrounds, secondary card surfaces, subtle washes |
| Ash | `#e0dedc` | Hairline borders, card outlines, divider lines between content blocks |
| Graphite | `#d4d3ce` | Stronger borders for form fields, table separators, more visible structural dividers |
| Smoke | `#333333` | Input text, focused form field borders, higher-emphasis text variant |

## Typography

### Haffer — Single typeface across the entire system. Custom sans with humanist warmth in the letterforms that counterbalances the achromatic palette. Weight 400 handles body and most UI; weight 500 for subheadings and emphasis; weight 600 reserved for statistics and numerical display. Display sizes (48–60px) at weight 400 with tight tracking carry all emotional weight — bold weight is rarely used because scale does the work instead.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 500, 600
- **Sizes:** 12, 14, 16, 20, 24, 28, 32, 40, 48, 60
- **Line height:** 1.0–1.5 (1.0 for display, 1.43–1.5 for body)
- **Letter spacing:** -0.02em to -0.03em at display sizes (40px+), normal at body sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.45 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.3 | -0.4px |
| heading | — | — | 32px | 1.2 | -0.64px |
| heading-lg | — | — | 40px | 1.1 | -0.8px |
| display | — | — | 60px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 64-80px
- **Card padding:** 20px
- **Element gap:** 12-24px

### Border Radius

- **cards:** 2px
- **pills:** 9999px
- **images:** 2px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Primary Filled Button
**Role:** Main call-to-action across the site

Solid #0a0a0a background, #ffffff text, Haffer 16px weight 500, 2px corner radius, 12px vertical × 24px horizontal padding. No drop shadow. The button is a pure black rectangle — it gains authority from contrast against white, not from color or depth.

### Secondary Outlined Button
**Role:** Secondary actions in nav and forms

Transparent background, 1px #0a0a0a border, #0a0a0a text, Haffer 16px weight 500, 2px radius, 12px × 20px padding. Sits next to the filled button as a quieter alternative.

### Email Input with Inline CTA
**Role:** Newsletter signup, trial start, lead capture

White background, 1px #e0dedc border, 2px radius, Haffer 16px weight 400, placeholder in #949189. The filled black CTA button is attached or sits immediately right with no gap, forming a single horizontal unit. Height ~48px.

### Top Navigation Bar
**Role:** Persistent site navigation

White background, logo + brand wordmark left, center links (Product, Cofounder, Pricing) in Haffer 14px weight 500 #0a0a0a, right side has Login text link and filled black 'Start Free Trial' button. ~64-72px tall, 1px #e9e8e7 bottom border or shadowless.

### Expert Portrait Card
**Role:** Social proof — featured creators/experts

Full-bleed portrait photograph with no border radius, overlaid with a dark #0a0a0a semi-transparent gradient at the bottom containing name (Haffer 16px weight 600 white) and title (Haffer 14px weight 400 white). Arranged in a horizontal row with no gaps between cards, creating a continuous strip of faces.

### Category Tab Pill
**Role:** Content type filter in the 'Choose how you turn expertise into income' section

9999px border radius, 8px × 16px padding, Haffer 14px weight 500, #0a0a0a text on #e9e8e7 background (active) or transparent (inactive). Active state inverts to black background with white text. Arranged in a horizontal row with 8px gaps.

### Stats Display
**Role:** Social proof metrics

Large numerical value in Haffer 48px weight 400 #0a0a0a, tight tracking. Label below in Haffer 16px weight 400 #535250. Centered alignment, three-column row on desktop.

### Video Hero Frame
**Role:** Product demonstration showcase

Dark #1f1f1 section background wrapping a video player with 2px border radius. Video occupies most of the width, with a floating course content card overlaid on the right showing lesson list. Centered play button in white circle on the video.

### Course Content Card (Overlay)
**Role:** Product UI preview floating over video

White surface, 8px radius, ~24px padding, contains thumbnail + title rows for course lessons. Haffer 16px weight 600 for title, 14px weight 400 for subtitle. Slight shadow to lift it from the video below.

### Dark Section Band
**Role:** Section break and content framing

Full-width #1f1f1 background, ~80px vertical padding. Headline centered in Haffer 40px weight 400 white. Creates the only chromatic (well, achromatic-inverted) break in the white-page rhythm.

### Two-Column Text + Form
**Role:** Newsletter / insights signup near page bottom

Left column: headline (Haffer 28-32px weight 400 #0a0a0a) + description (Haffer 16px #535250). Right column: email input + filled button in the same component. Light #ffffff background, ~40px section gap above.

### Logo Lockup
**Role:** Brand identifier in nav and footer

Small abstract mark (dark square with white cut) + 'kajabi' wordmark in Haffer 20px weight 600 #0a0a0a. Mark and text sit on a shared baseline with 8px gap.

## Do's and Don'ts

### Do
- Use #0a0a0a for all filled buttons and primary text — never #000000 pure black
- Set corner radius to 2px on all rectangular UI elements (buttons, inputs, cards, images)
- Use 9999px radius exclusively for pill-shaped category tabs and tag elements
- Let photography and video carry all color — keep UI elements strictly achromatic
- Apply tight tracking (-0.02em to -0.03em) at display sizes 40px and above; use normal tracking at body sizes
- Maintain 64-80px vertical breathing room between major sections
- Use Haffer weight 400 for headlines and rely on scale (not bold weight) for hierarchy

### Don't
- Don't introduce any chromatic brand color — the system is deliberately 100% achromatic
- Don't use 8px or 12px border radius on buttons, cards, or inputs — the sharp 2px is signature
- Don't use bold weight (600+) for marketing headlines — let size do the work instead
- Don't add drop shadows to buttons, inputs, or standard cards — surfaces stay flat
- Don't break the white page with a colored section background — only invert to #1f1f1 for dark bands
- Don't use icon outlines thinner than 1.5px or thicker than 2px — the weight should feel precise
- Don't letter-space body text — tight tracking is reserved for display sizes 40px+

## Surfaces

- **Paper** (`#ffffff`) — Default page canvas — the gallery wall
- **Mist** (`#e9e8e7`) — Subtle surface tint for form fields and quiet card variations
- **Charcoal** (`#1f1f1`) — Dark band sections that break the white rhythm and frame video/content showcases

## Imagery

Photography is the entire color system: full-bleed expert portraits (tightly cropped head-and-shoulders against plain backgrounds), warm lifestyle video (yoga, coaching sessions, workspaces), and creator photography with natural skin tones and earthy environments. Images receive no filters, no duotone treatment, no color overlays — they sit raw on the white canvas, which is precisely why the achromatic UI works. Icons are minimal 1.5-2px stroke line icons in #0a0a0a, used sparingly for navigation and category affordances. No illustrations, no 3D renders, no abstract graphics.

## Layout

Centered max-width container at ~1280px. Hero is centered text stack (headline → subtext → email+CTA) occupying upper viewport with no image. Below the hero, a full-bleed horizontal strip of expert portrait cards with zero gaps between them creates a continuous human band. Stats row is a centered 3-column grid. Dark section band breaks the white rhythm with centered headline + horizontal tab pills + a card grid. Video hero is near-full-width within the dark band with an overlay content card. Newsletter section returns to white, two-column (text left, form right) with centered max-width. Navigation is a thin white top bar, non-sticky, with the logo left and CTA right.

## Similar Brands

- **Medium** — Same monochrome editorial approach with a single custom serif/sans typeface carrying all hierarchy, and content (stories/photos) replacing brand color
- **Squarespace** — Shared achromatic framework that lets portfolio-quality photography and video dominate, with sharp rectangular UI and generous whitespace
- **Substack** — Near-identical philosophy of pure white canvas, near-black type, and no chromatic brand color — content creators are the visual identity
- **Apple (editorial sections)** — Same confidence in letting product photography and video breathe on a stark white stage with minimal UI chrome
