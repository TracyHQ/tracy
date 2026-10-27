# Planpoint — Style Reference
> Blueprint on white drafting table — an interactive property plan rendered on pristine paper, with one blue pen and one yellow highlighter for emphasis.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Planpoint uses a clean, white-canvas real estate blueprint aesthetic: generous whitespace, pill-shaped components, and bold confident display type that reads like a property floor plan drafted on quality paper. The interface is nearly monochromatic — near-black text (#1d1d1f) and white surfaces carry the entire structural weight — with a single vivid blue (#0f68ea) reserved exclusively for the primary action and a warm yellow (#ffcb00) that appears only as novelty punctuation. Components stay light and soft: large pill radii, one barely-there drop shadow at 6% opacity, and no decorative gradients or skeuomorphism. Typography is the dominant design element: Inter at extreme sizes (50–72px headlines, 144px display) with tight negative tracking gives the page architectural authority, while body text sits at a comfortable 16–18px with generous line height.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#1d1d1f` | Primary text, icon strokes, dark button fills — a slightly warm near-black chosen over pure black to feel printed rather than digital |
| White | `#ffffff` | Page background, card surfaces, button text on dark fills, all input fields |
| Mist | `#f0f2f4` | Subtle surface elevation, inactive button fills, secondary card backgrounds |
| Fog | `#e5e6e8` | Hairline borders, subtle dividers, section separators |
| Carbon | `#000000` | Navigation borders, pure-black accents where maximum contrast is needed |
| Slate | `#333333` | Muted helper text, secondary image borders |
| Midnight | `#00051a` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Signal Blue | `#0f68ea` | Primary CTA fill and outline, active nav accent, the single chromatic action color in the system |
| Link Blue | `#007aff` | Hyperlink color, icon stroke accent — Apple-system blue used for inline text links and interactive iconography |
| Highlight | `#ffcb00` | Yellow action color for filled buttons, selected navigation states, and focused conversion moments. |
| Deep Navy | `#000a3b` | Rare dark surface for featured cards or hero blocks — a near-black with depth |

## Typography

### Inter — Universal typeface for everything — nav, body, headings, display. Inter's geometric neutrality and broad weight range let the system scale from 14px captions to 144px display numbers without switching families. Display sizes at weight 600–700 with tight negative tracking create the site's architectural authority — headlines feel engraved, not styled.
- **Substitute:** system-ui, -apple-system, Segoe UI, Roboto, sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14, 16, 18, 22, 23, 29, 32, 43, 50, 72, 144
- **Line height:** 1.50, 1.55, 1.60 for body; 1.10–1.30 for headings; 0.90–1.00 for display
- **Letter spacing:** -0.07em at 14px, -0.06em at 22px, -0.044em at 29px, -0.036em at 43px, -0.031em at 72px, -0.027em at 144px — aggressive negative tracking at all sizes, compressing the geometric forms for density and modernity
- **OpenType features:** `"cv11", "ss01"`

### system-ui — Minor fallback for badge and link rendering where system speed matters over Inter's polish
- **Substitute:** -apple-system, BlinkMacSystemFont, Segoe UI
- **Weights:** 500
- **Sizes:** 14
- **Line height:** 1.50
- **Letter spacing:** -0.0410em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | -0.98px |
| body-sm | — | — | 16px | 1.6 | -1.07px |
| body | — | — | 18px | 1.55 | -1.17px |
| subheading | — | — | 22px | 1.3 | -1.32px |
| heading-sm | — | — | 29px | 1.25 | -1.28px |
| heading | — | — | 43px | 1.15 | -1.55px |
| heading-lg | — | — | 50px | 1.1 | -1.65px |
| display | — | — | 72px | 1 | -2.23px |
| display-xl | — | — | 144px | 0.9 | -3.89px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 14px

### Border Radius

- **tags:** 46.8px
- **cards:** 28.8px
- **badges:** 100px
- **inputs:** 18px
- **buttons:** 100px

## Components

### Primary Pill Button
**Role:** Main call-to-action — the single filled blue button

Filled with #0f68ea (Signal Blue), white text at 16px Inter weight 500–600, fully rounded at 100px radius, padding 20px 22px. Sits prominently in nav and hero. One soft shadow at rgba(0,0,0,0.06) 0px 8px 48px 0px gives it lift without heaviness.

### Dark Pill Button
**Role:** Secondary navigation CTA in header

Dark fill (#1d1d1f Ink), white text, 100px radius, 22px padding horizontal, 20px vertical. Used for nav-level actions like "Free trial" where the blue would compete with primary content CTAs.

### Outline Pill Button
**Role:** Tertiary or paired action

Transparent fill, 1px border in #1d1d1f or #ffffff, matching text color, 100px radius, 22px padding. Used for "See what's new" and "Book a demo" paired beneath hero video.

### New Badge
**Role:** Novelty indicator on features or announcements

Yellow fill (#ffcb00 Highlight), dark text (#1d1d1f) at 14px Inter weight 500, fully rounded pill (100px), padding 2px 10px. Appears as warm punctuation next to feature names like "Redesigned Editor".

### Hero Section
**Role:** First-screen value proposition

White canvas, centered headline at 72px Inter weight 700 with -2.23px tracking, #1d1d1f color. Subhead at 18px in #1d1d1f or muted gray. Below: a 16:9 video embed with a solid blue (#0f68ea) background frame and white play button.

### Video Embed Frame
**Role:** Product demonstration container

Full-bleed #0f68ea blue background panel containing the video player. The blue frame makes the video the page's visual anchor and reinforces the brand color as action-driven.

### Trust Headline
**Role:** Social proof section title

Centered at 43px Inter weight 600, #1d1d1f, -1.55px tracking, with two lines: "Trusted by successful developers, property owners & marketing teams alike."

### Logo Cloud
**Role:** Client/partner logos grid

Logos displayed in 3-row grids of 6–7 columns, each logo in a #f0f2f4 (Mist) pill-shaped container with 18px radius. Logos rendered in their native brand colors to add visual variety while the neutral containers keep rhythm consistent.

### Top Navigation Bar
**Role:** Site-wide header

White background, 64–80px tall. Left: blue diamond logo + "Planpoint" wordmark in #1d1d1f. Center-left: text nav links in 16px Inter weight 500, #1d1d1f. Right: language flag icon, "Support", "Login" text links, then dark pill CTA "Free trial" with right-arrow icon.

### Card Surface
**Role:** Content containers, logo tiles, feature blocks

White (#ffffff) or Mist (#f0f2f4) background, 28.8px border radius, 24px padding. Optional 1px border in #f0f2f4 or #e5e6e8. Soft shadow at rgba(0,0,0,0.06) 0px 8px 48px 0px for elevation when needed.

### Input Field
**Role:** Form text inputs (not visible in screenshots but implied by system)

White fill, 1px border in #e5e6e8 (Fog), 18px radius, 16px Inter placeholder text in #333333. Focus state: border shifts to #0f68ea Signal Blue.

## Do's and Don'ts

### Do
- Use Inter weight 700 at 50–72px for all page-level headlines with tracking between -1.65px and -2.23px — the tight negative tracking is what makes display type feel engraved.
- Use #0f68ea Signal Blue exclusively for the primary action button and active nav states; never as a background fill for cards or decorative blocks.
- Apply 100px border-radius to all buttons and tags — pill geometry is a signature element, not optional rounding.
- Use #ffcb00 Highlight only for novelty or status badges (≤1% of screen area); warm punctuation, not surface fill.
- Stack surfaces as #ffffff (base) → #f0f2f4 (elevated) → #0f68ea (brand) to maintain a clear elevation hierarchy without relying on heavy shadows.
- Maintain generous section gaps of 80px between major page sections; the spacious density is what gives the white canvas room to breathe.
- Use #1d1d1f Ink for all text and icon strokes — never #000000, the slight warmth reads as printed rather than digital.

### Don't
- Do not use #0f68ea as a text color for body copy or headings; it is an action color, not a typographic color.
- Do not apply gradients anywhere in the system — the blueprint aesthetic depends on flat, matte surfaces.
- Do not add decorative shadows beyond rgba(0,0,0,0.06) 0px 8px 48px 0px; heavier shadows break the lightweight feel.
- Do not use square or low-radius buttons (under 50px); the pill shape is non-negotiable.
- Do not introduce additional accent hues (greens, purples, reds) — the system is bichromatic plus yellow, and adding colors dilutes the brand.
- Do not use #ffffff borders on white surfaces; borders must be at least #f0f2f4 to remain visible.
- Do not set display type below weight 600 or above 72px without a specific reason — the 700/72px combination is the signature lockup.

## Elevation

- **Primary CTA Button:** `rgba(0, 0, 0, 0.06) 0px 8px 48px 0px`
- **Elevated Card:** `rgba(0, 0, 0, 0.06) 0px 8px 48px 0px`
- **Hero Video Frame:** `rgba(0, 0, 0, 0.06) 0px 8px 48px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — the white drafting paper
- **Surface** (`#f0f2f4`) — Card backgrounds, logo containers, inactive button fills — subtle elevation above canvas
- **Brand Surface** (`#0f68ea`) — Video frame, hero accent panel — the only chromatic surface
- **Dark Surface** (`#000a3b`) — Rare deep accent for featured cards or contrast sections
- **Accent Surface** (`#ffcb00`) — Novelty badges, status indicators — warm highlight puncturing the cool palette

## Imagery

Photography is minimal — the design relies on product UI screenshots embedded in a video demo rather than lifestyle or property photography. The video player and product interface captures do the visual storytelling. The logo cloud uses brand-colored wordmarks in muted neutral pill containers, letting each partner's identity contribute a small chromatic moment without overwhelming the page. Icons are stroke-based, minimal, and rendered in #1d1d1f — small, functional, never decorative. The overall visual language is UI-first: screens, dashboards, and plan viewers, not photography.

## Layout

Max-width 1200px centered container, generous 80px section gaps. The hero is a centered text stack (badge → headline → subhead → video) on a white canvas, with the video framed in a full-width #0f68ea blue band that breaks out of the max-width constraint. Below the hero: a centered button pair (outline pills) on white space, followed by a social proof section with a centered 43px headline and a 3-row logo cloud grid. Navigation is a top-fixed bar with horizontal text links and a right-aligned dark pill CTA. The rhythm is vertical and stack-based — no sidebar, no asymmetric split layouts, just centered blocks with breathing room.

## Similar Brands

- **Mapbox** — Same white-canvas approach with a single vivid blue accent and bold display type for a map/data product
- **Figma** — Pill-shaped buttons, clean white surface stack, and aggressive negative tracking on display type
- **Linear** — Spacious layout, Inter typeface, near-black text (#1d1d1f family), and minimal shadow usage for a product UI feel
- **Arc browser** — Near-monochrome palette with one chromatic action color and pill geometry on all interactive elements
- **Vercel** — Centered hero stacks, generous section gaps, Inter at extreme sizes with tight tracking, and flat matte surfaces
