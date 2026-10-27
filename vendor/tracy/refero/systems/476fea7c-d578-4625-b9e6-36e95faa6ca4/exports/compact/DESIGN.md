# Preply — Style Reference
> Pink billboard with human stickers

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Preply projects a warm, confident energy built on saturated pink hero canvases, near-black typography, and white product surfaces. The visual system is deliberately loud in the top fold to express brand personality, then quiets down into a calm black-and-white catalog of tutors and content once the user moves into functional areas. Platform (a chunky, high-contrast display face) carries all headings at weight 700 with very tight tracking and line-heights, making 48–96px headlines read as solid blocks of voice rather than delicate type. Figtree handles all UI and body text at moderate weights with slightly looser tracking. Components are flat and rectangular — 4px and 8px corners are the only soft edge in the system, and shadows are nearly absent. Photography is integral: real tutor/learner portraits are cropped, slightly rotated, and layered with black text stickers, giving the brand a handmade, scrapbook-like quality that contrasts the structured grid below.

## Colors

| Name | Value | Role |
|------|-------|------|
| Preply Pink | `#ff7aac` | Red supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Midnight Ink | `#121117` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Soft White | `#ffffff` | Page canvas above the pink hero, card surfaces, tutor catalog backgrounds, button text on dark fills |
| Mist Gray | `#f4f4f8` | Subtle page background for content sections that need separation from pure white |
| Smoke | `#dcdce5` | Card borders, input outlines, dividers — structural hairlines that define the catalog grid |
| Pewter | `#6a697c` | Card border accent and tertiary text, slightly cooler than Midnight Ink for layered hierarchy |
| Graphite | `#4d4c5c` | Body copy, icon strokes, secondary text — the readable neutral that lives between Midnight Ink headings and lighter helper text |
| Pure Black | `#000000` | Icon fills, decorative sticker text, and any place where the absolute black is needed for photographic overlay |
| Signal Yellow | `#ffdf3d` | Accent highlights, announcement bar background, decorative stickers — used sparingly as a callout color over pink |
| Sky Pop | `#99c5ff` | Secondary accent, tag chips, and decorative illustration — the cool counterpoint to pink in multicolor compositions |

## Typography

### Platform — All headlines, section titles, hero copy, and the largest display text. Weight 700 dominates from 32px upward, creating dense, confident type blocks. The 1.00–1.08 line-heights at 48–96px make headlines read as solid slabs. Tracking tightens with size: -0.005em at body, -0.017em at display.
- **Substitute:** Mulish, Inter, or Manrope at matching weights
- **Weights:** 400, 600, 700
- **Sizes:** 14, 16, 20, 24, 32, 48, 64, 96
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.07px at 14px, -0.08px at 16px, -0.20px at 20px, -0.24px at 24px, -0.16px at 32px, -0.24px at 48px, -0.32px at 64px, -0.48px at 96px (progression from -0.005em at small to -0.005em tightening; dominant -0.005em across stack)

### Figtree — Body copy, UI labels, button text, card content, nav, links, footer text, and form fields. Weight 400 for paragraphs, weight 600 for emphasis and button labels. Line-height 1.43–1.71 at 14–18px gives body copy comfortable air. Letter-spacing stays near zero to slightly positive (+0.01 to +0.012em) for legible small sizes.
- **Substitute:** DM Sans, Plus Jakarta Sans, or Nunito Sans
- **Weights:** 400, 600
- **Sizes:** 12, 13, 14, 16, 18, 20
- **Line height:** 1.00–1.71
- **Letter spacing:** -0.06px at 12px, +0.065px at 13px, +0.14px at 14px, +0.16px at 16px, +0.18px at 18px, +0.20px at 20px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.06px |
| body | — | — | 16px | 1.5 | 0.16px |
| subheading | — | — | 20px | 1.4 | 0.2px |
| heading-sm | — | — | 24px | 1.33 | 0.24px |
| heading | — | — | 32px | 1.2 | 0.16px |
| heading-lg | — | — | 48px | 1.13 | 0.24px |
| display | — | — | 64px | 1.08 | 0.32px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 4px
- **cards:** 8px
- **inputs:** 4px
- **buttons:** 4px
- **stickers:** 4px

## Components

### Filled Dark Action Button
**Role:** Primary conversion button (Find your tutor, Get started)

Background #121117, text #ffffff, Figtree 16px weight 600, border-radius 4px, padding 14px 24px, inline arrow icon (→) at 16px. No border, no shadow. Hover lightens to #2a2935 or lifts text color slightly.

### Outlined Ghost Button
**Role:** Secondary actions in the nav and inline CTAs

Transparent background, 1px border #121117, text #121117, Figtree 14px weight 600, border-radius 4px, padding 8px 16px. Becomes filled dark on hover.

### Language Tutor Card
**Role:** Catalog entry in the subject grid (English tutors, Spanish tutors, etc.)

White #ffffff background, 1px border #dcdce5, border-radius 8px, padding 16px 20px. Left-aligned icon at 32px (line illustration in #121117), Platform 20px weight 700 title, Figtree 13px weight 400 teacher count in #4d4c5c, right chevron (›) at 20px in #121117. Hover adds subtle background tint #f4f4f8.

### Sticker Text Label
**Role:** Decorative rotated text tags layered on hero photography

Background #121117, text #ffffff, Figtree 14px weight 600, border-radius 4px, padding 4px 10px. Sits at slight rotation (-5° to +5°) on top of photo tiles. Examples: 'Miki C. / Tutor', 'Roberto / Learner'.

### Top Utility Bar
**Role:** Announcement strip above the main nav

Background #121117, text #ffffff, Figtree 13px weight 400, centered content with optional inline flag emoji. 40px tall, single line, includes a right-side close (×) icon.

### Main Navigation
**Role:** Site-wide primary nav

White #ffffff background, 64px tall. Left: logo (Preply wordmark in #121117). Center: nav links in Figtree 14px weight 400 #121117, 24px horizontal spacing. Right: language/currency selector, help icon, and outlined 'Log in' button with 1px #121117 border, 4px radius.

### Stat Strip
**Role:** Social proof bar below the hero (100,000+ tutors, 4.8 stars, etc.)

White background, 5-column flex row, 48px vertical padding. Each stat: Platform 32px weight 700 #121117 for the number, Figtree 13px weight 400 #4d4c5c for the caption below. No dividers, generous horizontal spacing of ~57px between columns.

### Hero Headline Block
**Role:** Primary fold headline on pink background

Platform weight 700 at 64–96px, line-height 1.06–1.08, color #121117, max-width ~560px, left-aligned on the pink #ff7aac canvas. Subhead in Figtree 18px weight 400 #121117 at 24px top margin.

### Hero Photo Collage
**Role:** Right-side hero visual on pink background

Two overlapping portrait photos with 4px radius, slight rotation (-3° and +3°), black text stickers layered on top, large rotated black 'Progress Takes Two' wordmark with white text filling the middle. Photos extend off the right edge.

### Footer Column
**Role:** Site link directory in dark footer

Background #121117, 4-column grid. Column headings in Figtree 14px weight 600 uppercase #ffffff. Links in Figtree 14px weight 400 #dcdce5, 8px row gap, 32px top gap between heading and first link.

### Subject Grid Section
**Role:** 3×3 catalog of language subjects

3-column grid, 16px row and column gap, white background. Each cell is a Language Tutor Card. Section has 64px vertical padding.

### Section Heading
**Role:** Mid-page section titles (Progress starts with the right tutor)

Center-aligned, Platform 48px weight 700 #121117, line-height 1.13, max-width ~800px. Subhead below in Figtree 18px weight 400 #4d4c5c, 16px top margin.

## Do's and Don'ts

### Do
- Use Platform weight 700 for every heading from 32px upward; never go below weight 600 for headlines.
- Reserve #ff7aac for full-bleed section backgrounds and brand moments — never paint a single component pink.
- Set filled action buttons to #121117 with white text, 4px radius, 14px 24px padding, and a trailing → icon.
- Layer real, slightly rotated photos with black text stickers on pink backgrounds; keep the collage energy in hero zones.
- Keep borders at 1px #dcdce5 or 1px #6a697c — the catalog grid is defined by hairlines, not shadows.
- Anchor all body copy in Figtree weight 400 with line-height 1.43–1.71; let the comfortable air do the work.
- Use 4px and 8px as the only two corner radii in the system; 16px is reserved for one-off decorative surfaces.

### Don't
- Don't apply #ff7aac to buttons, links, or interactive surfaces — it is a canvas, not a control.
- Don't introduce drop shadows or multi-layer elevations; the system is flat and hairline-driven.
- Don't use rounded radii above 8px on functional components (cards, inputs, buttons).
- Don't set headline line-height above 1.2 — Platform is designed to sit tight at scale.
- Don't mix the pink with heavy gradients or filters; the pink is always solid and unmodulated.
- Don't use Figtree for display sizes above 32px — let Platform carry anything that big.
- Don't crowd the white catalog with color; keep tutor cards monochrome and let the pink sections do the talking.

## Elevation

- **Language Tutor Card:** `none — defined only by 1px #dcdce5 border on #ffffff`
- **Sticker Label:** `none — flat, relies on rotation to read as layered`

## Surfaces

- **Pink Hero Canvas** (`#ff7aac`) — Full-bleed top fold and occasional brand sections
- **Mist Page** (`#f4f4f8`) — Default body section background
- **Pure White** (`#ffffff`) — Cards, tutor catalog rows, elevated content surfaces
- **Midnight Footer** (`#121117`) — Inverted footer and rare dark UI zones

## Imagery

Photography is the signature visual asset. Real tutor and learner portraits are cropped to head-and-shoulders, placed on the pink hero, and slightly rotated (±3°) to create a scrapbook composition. Black rectangular text stickers are layered directly on the photos. On content sections below the fold, photography is largely absent — the catalog relies on simple black line illustrations of landmarks (Eiffel Tower, Brandenburg Gate, torii gates) at 32px next to tutor subject titles. No lifestyle or stock photography appears; every portrait is specific, present, and personal.

## Similar Brands

- **Duolingo** — Equally loud brand color treatment and bold display typography, though Duolingo leans more illustrative where Preply uses real photography.
- **Cambly** — Same language-learning market and similar use of real tutor portraits as the emotional center of the hero.
- **Headspace** — Confident display-type-at-scale paired with a single saturated brand color and flat, shadow-free components.
- **Italki** — Catalog of tutor subjects rendered in a clean white grid with hairline borders, sitting below a personality-driven hero.
- **Babbel** — Black-and-white product UI that lets a single brand color carry the entire top-fold personality.
