# My Brentano — Style Reference
> Pharmacy broadsheet on cream paper. A Swiss editorial layout where one typewriter voice does all the speaking and warm-toned product photography supplies the only color.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

My Brentano channels a Swiss-editorial pharmacy aesthetic: warm cream canvas, one typewriter-serif display face at monumental sizes, and a single near-black ink for almost everything. The design is radical in its restraint — no shadows, no rounded cards, no accent colors, no gradient washes. Hierarchy is built through typographic scale (60px display down to 15px body) and generous negative space, not through color or elevation. Imagery is the only chromatic moment: warm product photography with beige, mustard, and burgundy tones that bleed off-frame. Components feel like printed editorial: thin horizontal rules, circular outlined arrows, and text-aligned links with no fills. Every surface sits on the same flat plane; the design is a typographic object, not a digital interface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Charcoal Ink | `#212529` | Body text, headings, nav text, footer text, most borders — the dominant text and structural color, slightly softer than pure black for warmth |
| Pure Press | `#000000` | Secondary text, button borders, link borders, input outlines, nav separators — true black for maximum contrast on outlined elements |
| Bone White | `#ffffff` | Page canvas, card surfaces, button fills, input backgrounds — the ground that all ink sits on |

## Typography

### Studio Feixen Sans Writer Book Regular — Studio Feixen Sans Writer Book Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 30px
- **Line height:** 1.2

### Studio Feixen Sans Writer — Primary typeface for all text — body, headings, nav, links, buttons, lists. The Writer variant carries a typewriter/letterpress quality with subtle ink-trapped details that a geometric sans cannot replicate. Weight 700 is used sparingly only on the 60px display; everything else stays at 400, making the single bold moment feel intentional and declarative.
- **Substitute:** IBM Plex Mono or JetBrains Mono for the typewriter character; Inter for a neutral fallback
- **Weights:** 400, 700
- **Sizes:** 12, 15, 18, 25, 30, 60
- **Line height:** 1.20, 1.67, 2.08, 2.50
- **Letter spacing:** normal across all sizes — no negative tracking on display, which is unusual and preserves the mechanical, evenly-spaced typewriter rhythm

### Studio Feixen Sans — Secondary sans variant for select body passages and inputs where the typewriter serifs would be too loud. The same family, stripped of the Writer details, creates a quiet alternation within the same typographic world.
- **Substitute:** Inter or system-ui sans-serif
- **Weights:** 400
- **Sizes:** 15, 30
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body-sm | — | — | 15px | 1.67 | — |
| body | — | — | 18px | 2.08 | — |
| subheading | — | — | 25px | 2.5 | — |
| heading-sm | — | — | 30px | 1.2 | — |
| display | — | — | 60px | 1.2 | — |

## Spacing & Layout

**Density:** compact

- **Section gap:** 40-60px
- **Element gap:** 10px

### Border Radius

- **images:** 0px
- **inputs:** 0px
- **buttons:** 9999px
- **navCircles:** 9999px

## Components

### Circular Nav Arrow Button
**Role:** Navigation link with directional affordance

40px circle, 1px border in #000000, transparent fill, centered right-arrow glyph in Charcoal Ink (#212529). Used for Shop, Blog, Über uns nav items. Pairs with the language selector.

### Language Selector Pill
**Role:** Locale switcher

Circular outlined element identical to nav buttons — 1px #000000 border, transparent fill, 'DE' label in Charcoal Ink at 15px weight 400 Writer font.

### Editorial Display Headline
**Role:** Hero and section H1

60px Studio Feixen Sans Writer, weight 700, line-height 1.20, Charcoal Ink (#212529). Left-aligned, full-width, no max-width constraint. The typewriter weight at this size is the signature moment — mechanical but monumental.

### Section Heading
**Role:** H2/H3 within content blocks

30px Writer weight 400, line-height 1.20, Charcoal Ink. Same family as display but at half the size and regular weight — maintains the editorial voice without competing with the hero.

### Body Paragraph
**Role:** Long-form description text

15–18px Writer weight 400, line-height 1.67–2.08 (generous, almost double), Charcoal Ink. The tall line-height is a print-magazine convention; it makes reading feel like turning a page, not scrolling a feed.

### Offset Image Stack
**Role:** Product/editorial imagery placement

Two or three rectangular photographs overlapping at slight angles (2–5° rotation), unbordered (0px radius), casting no shadow. One image is always rotated to break the grid — a deliberate Swiss-editorial gesture. Warm-toned: beige, mustard, deep burgundy product photography on warm cream paper backgrounds.

### Text Link
**Role:** Inline navigation and reference

15px Writer weight 400, Charcoal Ink, no underline by default, no color change. Underline or contextual differentiation is avoided — navigation is implied by position and surrounding arrows.

### Outlined Action Button
**Role:** Interactive controls (implied from nav pattern)

1px #000000 border, transparent fill, Charcoal Ink text, 0px radius, 5px vertical / 10px horizontal padding. Ghost/outlined — never filled. The same pattern is used for nav and would extend to all CTAs.

### Shopping Bag Icon
**Role:** Cart access in top-right

Small line-icon in Charcoal Ink, no background, no badge. Sits in the top-right corner as a quiet utility affordance.

### Top Navigation Bar
**Role:** Primary site navigation

Single horizontal row, full-bleed, separated from content by a 1px hairline border in #000000. Left: brand text 'Hallo. Wir sind Brentano'. Center: language + 3 nav arrows. Right: cart icon. Fixed height, no background fill distinct from page.

## Do's and Don'ts

### Do
- Use Studio Feixen Sans Writer at 60px weight 700 for the single most important headline on any page
- Set body text at 15–18px with line-height between 1.67 and 2.08 — never tighter than 1.5
- Use 0px border-radius on all images, inputs, and rectangular elements; reserve 9999px exclusively for circular nav controls
- Separate the top nav from page content with a single 1px #000000 hairline — no background fill, no shadow
- Let product imagery supply all color; keep UI strictly in Charcoal Ink (#212529), Pure Press (#000000), and Bone White (#ffffff)
- Break the grid by rotating overlapping product images 2–5° rather than aligning them perfectly
- Use 10px gaps for inline element spacing, 40–60px for vertical section rhythm

### Don't
- Never introduce an accent or brand color — the system is intentionally near-monochrome, and color belongs only to photography
- Never apply shadows, glows, or any form of elevation — surfaces must remain flat like printed paper
- Never use bold weight (700) for anything smaller than 30px — the single bold moment must remain monumental
- Never round corners on cards, images, or input fields — 0px radius is non-negotiable
- Never use more than two typefaces per view; alternate between Writer and Sans within the same family only
- Never center-align body paragraphs or set them narrower than 50% of the viewport — the grid is left-aligned and generous
- Never apply a colored background to the page — the cream warmth comes from the paper-tone canvas and the imagery, not from a tint

## Elevation

Elevation is absent by design. The system treats the page as a flat printed sheet — no box-shadows, no z-axis differentiation. Hierarchy is achieved entirely through typographic scale, whitespace, and hairline 1px borders. A surface that needs to feel distinct should rely on a different image crop or a rotated placement, never on a drop shadow.

## Surfaces

- **Bone White Canvas** (`#ffffff`) — The single page surface — no separate card or elevated layers exist; all content sits directly on this plane

## Imagery

Imagery is the sole chromatic system. Product photography is shot on warm cream paper backgrounds with natural daylight, featuring hands holding skincare jars and dropper bottles. The palette within photography is tightly controlled: beige/butter, mustard yellow, deep burgundy/wine red, and soft skin tones. Images are presented as unframed rectangles (0px radius) that frequently overlap at slight rotation angles, breaking the grid. No lifestyle or environmental context — the product and the hand holding it are the entire composition. No icons beyond minimal line-glyphs in the nav.

## Similar Brands

- **Aesop** — Same near-monochrome restraint with warm cream backgrounds and serif/typewriter-flavored type, where product photography is the only source of color
- **Le Labo** — Editorial pharmacy aesthetic with oversized display type, hairline rules, and a radical absence of decorative UI chrome
- **Mara Hoffman** — Swiss-grid editorial layouts with large left-aligned typewriter-quality headlines and unframed offset imagery on a flat cream canvas
- **Studio Feixen (parent type studio)** — The custom typeface and its mechanical, evenly-spaced rhythm define the visual identity — brands using Feixen fonts inherit this same editorial discipline
