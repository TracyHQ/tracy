# Audyr — Style Reference
> Ink on cold-pressed paper. The interface reads as a meticulously typeset monograph — black ink, white stock, hairline rules, and the softest possible shadows to suggest depth.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Audyr uses a typeset-document language: white paper canvas, black ink text, and the faintest gray rules separating content blocks. The entire interface is intentionally near-monochrome — no brand color accent, no decorative gradients, no illustrated atmosphere — so the product's promise of clarity becomes the page's visual promise too. Typography carries all hierarchy through a single sans-serif (Inter) at three weights and tight -0.025em tracking that compresses letterforms into confident, compact blocks at every scale. Components are quietly constructed with hairline borders in #ededed, 4–8px radii on interactive elements, and shadows so subtle they read as paper grain rather than elevation. The system feels editorial — closer to a beautifully set technical brief than a typical SaaS landing page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#262626` | High-contrast neutral action fill for primary buttons on light surfaces. |
| Pure Paper | `#ffffff` | Card surfaces, elevated panels, content backgrounds — the base canvas color sits one step brighter than the page |
| Soft Mist | `#ededed` | Hairline borders, input outlines, dividers, subtle panel fills — the structural glue that separates regions without lines shouting |
| Charcoal | `#171717` | Secondary dark surface (pricing card, alternate hero), occasional dark fills where deeper weight is needed than Ink |
| Ash | `#686868` | Secondary body text, nav links, supporting copy — the first step down from primary text |
| Slate | `#515151` | Tertiary text, icon strokes on light backgrounds, muted metadata |
| Muted | `#737373` | Helper text, caption-level copy, secondary icon strokes |
| Fog | `#929292` | Placeholder text, disabled labels, very low-emphasis text |
| Chalk | `#cbcbcb` | Shadow residue on dark buttons, ultra-low-contrast surface markers |
| Mint Whisper | `#ecfdf5` | Primary page canvas and white card surfaces. Use as a supporting accent, not as a status color |

## Typography

### Inter — The sole typeface. Weight 600 reserved for section labels and small UI controls; weight 500 for nav and secondary buttons; weight 400 for body and most copy. The system commits to one family rather than pairing a display serif — a deliberate editorial choice that keeps the visual signal monochrome.
- **Substitute:** system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 20px, 24px, 30px, 36px, 48px
- **Line height:** 1.20–1.63
- **Letter spacing:** -0.025em applied at every size (≈-0.3px at 12px up to -1.2px at 48px)
- **OpenType features:** `"cv11", "ss01"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.3px |
| body-sm | — | — | 14px | 1.5 | -0.35px |
| body | — | — | 16px | 1.56 | -0.4px |
| subheading | — | — | 18px | 1.63 | -0.45px |
| heading-sm | — | — | 20px | 1.5 | -0.5px |
| heading | — | — | 24px | 1.4 | -0.6px |
| heading-lg | — | — | 30px | 1.38 | -0.75px |
| display | — | — | 48px | 1.11 | -1.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 120-160px
- **Card padding:** 32px
- **Element gap:** 16-20px

### Border Radius

- **cards:** 14px
- **badges:** 9999px
- **images:** 8px
- **inputs:** 4px
- **buttons:** 4px
- **largePanels:** 18px

## Components

### Top Navigation Bar
**Role:** Site-wide header

Full-width white bar, 64px tall, 1px bottom border in #ededed. Logo left (24px square X-mark), center nav links at 14px Inter 500 in #686868 with #262626 on hover, right cluster holds a ghost 'Sign In' link and a dark filled 'Get Started' button. No drop shadow — just the border.

### Dark Filled Action Button
**Role:** Primary CTA

Background #262626, text #ffffff, 14px Inter 500. Padding 10px 20px. Radius 4px. Subtle inset highlight (oklab 0.16 inset 1px) plus a soft 0.05 alpha 1px drop shadow to register the surface. This is the only button style that carries visual weight on the page.

### Ghost Outline Action Button
**Role:** Secondary action

Transparent background, 1px border in #ededed, text #262626, 14px Inter 500. Same 10px 20px padding and 4px radius as the filled variant. Used for 'Watch Demo' and similar non-primary actions.

### Pricing Tier Card
**Role:** Pricing display (Free, Hobby, Pro)

White surface, 1px border in #ededed, radius 14px, padding 32px. Tier name at 24px Inter 600 #262626, price at 36px Inter 600 #262626 with '/ month' in 14px #686868. Feature list uses 14px body text with 8px row gap and small dark check icons.

### Highlighted Pricing Card (Hobby)
**Role:** Featured/Recommended tier

Same structure as standard pricing card but with a dark surface (background #171717, text #ffffff, subtext #cbcbcb) and a 'Popular Option' pill badge floating above the card. The dark surface breaks the all-white field to draw the eye.

### Pill Badge
**Role:** Status / label / tag

Fully rounded (9999px), padding 4px 12px, 12px Inter 500. Default variant: light gray fill (#ededed) with #262626 text. Highlight variant for 'Popular Option' or 'Save 20%': #ecfdf5 fill with green-tinted text.

### Pricing Toggle
**Role:** Billing period switcher

Segmented control, 40px tall, radius 4px, 1px border in #ededed. Active segment filled #262626 with #ffffff text; inactive segment is transparent with #686868 text. A small 'Save 20%' pill in green floats above the active option.

### Hero Section
**Role:** Above-the-fold introduction

Centered single-column, max-width 720px, 80–120px vertical padding. Headline at 48px Inter 600 in #262626 with -1.2px tracking, line-height 1.11. Subtext at 18px Inter 400 in #686868. Two-button row: filled primary + ghost secondary. 'No credit card required' microcopy at 12px below.

### Product Mockup Frame
**Role:** Embedded dashboard screenshot

White surface, 1px border in #ededed, radius 18px, large diffuse shadow (lab 0.1 0px 25px 50px -12px). Mockup fills the inner area with 8px corner rounding on the UI chrome. Floats below the hero as the visual proof point.

### Tab Group
**Role:** Section switcher (used in product mockup)

Horizontal pill cluster, 36px tall, radius 4px, 1px border #ededed. Active tab: #ededed fill, #262626 text. Inactive: transparent, #686868 text. Items separated by 4px gaps.

### Logo Bar
**Role:** Social proof / 'teams switching from'

Single horizontal row, centered, with competitor wordmarks rendered in #929292 (desaturated) to integrate with the monochrome system. 80–100px vertical padding above and below.

### Two-Column Feature Section
**Role:** Asymmetric content layout

Left column: large headline at 30–36px Inter 600 #262626. Right column: 18px Inter 400 body text in #686868. Column gap 80–120px. No card, no background — just two text columns on the white canvas.

### Feature Checklist Item
**Role:** Bullet item in pricing cards

14px Inter 400 in #262626, preceded by a 16px circular check icon in #262626. 8px row gap between items.

### Chat Bubble (bottom-right)
**Role:** Floating support widget

32px circle, #262626 background, white speech-bubble icon. Fixed position, sits above all content with a small bottom-right offset.

## Do's and Don'ts

### Do
- Use #262626 as the only filled button background — it is the single visual anchor in the monochrome system
- Apply -0.025em letter-spacing to every text element at every size, from 12px captions up to 48px displays
- Use #ededed for all structural dividers, card borders, and input outlines at 1px
- Set card radii to 14px, button radii to 4px, and badge radii to 9999px — these three radii define the visual language
- Limit the chromatic surface tint (#ecfdf5) to success/popular badges only; never apply it to large surfaces
- Keep shadows to the two soft levels: the diffuse card shadow (lab 0.1 25px 50px -12px) and the button micro-shadow (oklab 0.05 1px 2px)
- Maintain 80–160px section padding to preserve the editorial breathing room

### Don't
- Don't introduce a brand color accent — the absence of color IS the brand
- Don't use radii outside the 4 / 8 / 14 / 18 / 9999px scale; no 6px or 12px intermediate values
- Don't add drop shadows heavier than the documented card shadow — anything more theatrical breaks the paper-grain feel
- Don't pair Inter with a second typeface for display use — the single-family commitment is structural
- Don't use #ffffff for text on white surfaces, and don't use #ededed for body text — both will fail contrast
- Don't apply gradients — the system is committed to flat, unshaded fills
- Don't use colored status indicators on the marketing site; restrict color to badges and the pricing 'Popular' highlight

## Elevation

- **Dark filled button:** `inset 0 0 0 1px oklab(0.999 0 0 / 0.16), 0 1px 2px oklab(0.269 0 0 / 0.24)`
- **Product mockup frame:** `0 25px 50px -12px lab(0 0 0 / 0.1)`
- **Generic card / elevated panel:** `0 1px 3px lab(0 0 0 / 0.05), 0 1px 2px -1px lab(0 0 0 / 0.05)`

## Surfaces

- **Page Canvas** (`#ffffff`) — The base background; everything else sits on this white field
- **Card Surface** (`#ffffff`) — Same hex as canvas but lifted by a 1px #ededed border and a 14–18px radius
- **Highlighted Surface** (`#171717`) — Dark inverse used for the 'Popular' pricing tier to break the white field
- **Accent Wash** (`#ecfdf5`) — Mint tint applied only to small badge fills (Save 20%, Popular Option)

## Imagery

Imagery is almost entirely absent from the marketing surface. The hero relies on typography alone, and the single visual asset is a full product screenshot of the dashboard embedded in a framed card. No photography, no illustration, no decorative graphics, no icon system beyond simple monoline check marks and the X-mark wordmark. When competitor logos appear, they are rendered in #929292 to dissolve into the monochrome field rather than stand out as colorful brand marks.

## Similar Brands

- **Linear** — Same commitment to a single sans-serif at tight tracking, hairline borders, and a near-absence of decorative color — Linear's UI is also a typographic system with grayscale as its base
- **Canny** — Direct competitor in the same product category; shares the feature-feedback dashboard chrome, the pill-shaped badges, and the monochrome data-table aesthetic
- **Vercel** — Same editorial-product sensibility: black-and-white marketing pages, large display headlines, generous section padding, and a single typeface carrying all hierarchy
- **Read.cv** — Same typeset-document philosophy — Inter throughout, tight tracking, no illustrative atmosphere, hairline rules separating content blocks, and an almost total commitment to grayscale
