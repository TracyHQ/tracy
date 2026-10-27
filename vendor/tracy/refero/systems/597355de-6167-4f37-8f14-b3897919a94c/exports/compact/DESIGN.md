# Exhibition Magazine — Style Reference
> Concrete editorial monolith

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Exhibition Magazine operates as a printed editorial artifact translated to screen: white canvas, hairline rules, and oversized condensed typography that commands the viewport. The visual system is almost entirely achromatic — color is virtually absent, replaced by the interplay of pure black text, white surfaces, and the grey 1px line that organizes everything. Two type families do all the work: DIN at 90–100px for display and section titles with extremely tight tracking and near-vertical line-height, and a serif (Cochin) for editorial body and descriptions that warms the otherwise clinical grid. Navigation and micro-labels use a tiny 13px all-caps face with generous 0.062em letter-spacing, creating a typographic hierarchy based on scale contrast alone — gargantuan display type against whisper-quiet UI chrome. Components are stripped to their essentials: image cards with no rounded corners, text buttons that are just underlined words, and a full-bleed black footer that closes the page with the same oversized type on inverted grounds.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page backgrounds, nav bar, card surfaces, image backgrounds |
| Ink Black | `#000000` | All text, nav links, display headings, footer background, card titles |
| Hairline Grey | `#e5e7eb` | 1px borders, dividers, card outlines, link underlines — the structural skeleton of the layout |
| Ash Grey | `#a9a9a9` | Muted surface fills, image placeholder backgrounds, secondary tonal blocks |
| Bone Blush | `#fff5fa` | Subtle warm-tinted card surface — near-white with a hint of warmth, used sparingly |

## Typography

### DIN — Display and section headings — used at 90–100px for the wordmark and feature titles, 36–52px for card titles, 25px for secondary headlines. Line-height collapses to 0.75–0.80 at the largest sizes, stacking lines into near-solid blocks. Tracking tightens proportionally: -0.004em at small sizes up to -0.008em at display. This single weight at extreme sizes carries the entire visual authority of the brand — no bold weight exists, scale alone creates hierarchy.
- **Substitute:** Bebas Neue, Oswald, Anton
- **Weights:** 400
- **Sizes:** 25px, 36px, 40px, 50px, 52px, 90px, 100px
- **Line height:** 0.75–1.20
- **Letter spacing:** -0.008em at 90–100px, -0.006em at 50–52px, -0.004em at 25–40px

### Cochin — Editorial body text and article descriptions. At 16px/1.50 it provides readable long-form copy with generous breathing room. At 46px it functions as an oversized serif lead — warm, literary counterpoint to the industrial DIN display type. The only serif in the system; its presence signals 'this is editorial content, not UI chrome'.
- **Substitute:** Hoefler Text, Cormorant Garamond, Lora
- **Weights:** 400
- **Sizes:** 16px, 46px
- **Line height:** 1.20–1.50
- **Letter spacing:** normal

### forma-djr-display — Navigation labels, micro-UI, category tags, footer links. Always rendered all-caps at 13px with 0.062em letter-spacing — the tracking is the signature: generous, almost luxurious spacing at tiny size creates a deliberate tension against the compressed DIN display type. This is the typographic glue that holds the system together at the functional level.
- **Substitute:** Futura PT, Avenir Next, Jost
- **Weights:** 500
- **Sizes:** 13px
- **Line height:** 1.60
- **Letter spacing:** 0.062em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 25px | 1 | — |
| body-sm | — | — | 36px | 1 | — |
| body | — | — | 40px | 1 | — |
| body-lg | — | — | 50px | 1 | — |
| heading-sm | — | — | 52px | 1 | — |
| heading | — | — | 90px | 1 | — |
| heading-lg | — | — | 100px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1400px
- **Section gap:** 60-100px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Display Wordmark
**Role:** Brand identifier in header

Full-width text logo 'EXHIBITION MAGAZINE' in DIN 400 at 100px, white text, letter-spacing -0.008em, line-height 0.80. Sits above the navigation bar, bleeding edge to edge with no padding. The 100px size on viewport width creates an immediate editorial authority — this is a magazine masthead, not a SaaS logo.

### Top Navigation Bar
**Role:** Primary site navigation

Horizontal bar with 8 items: HOME, FASHION, ART, DECODING, BEAUTY, STUDIO, SHOP, SEARCH. forma-djr-display 500 at 13px, all-caps, 0.062em letter-spacing, color #000000. Items distributed with generous horizontal spacing (235px gaps between groups). No background, no border — floats directly on white. Active item indicated by underline only.

### Full-Bleed Hero Slide
**Role:** Featured editorial content

Full-viewport-width image with overlaid text. Headline in DIN 400 at 50–52px, white, centered or right-aligned over image. Subtitle in Cochin 400 at 16px, white. No card background, no padding — text floats on the photograph. Navigation arrows (‹ ›) in white on left/right edges.

### Editorial Content Card
**Role:** Article or feature preview in grid

Square or portrait image on top (0px radius, no border). DIN 400 at 36–40px for card title in #000000, 24px margin-top from image. Cochin 400 at 16px/1.50 for description in #000000, 8px margin-top from title. No card container, no background fill — image and text sit directly on white page. Arranged in 4-column grid.

### Underlined Text Link
**Role:** Text-based call-to-action and navigation

forma-djr-display 500 at 13px, all-caps, 0.062em tracking, #000000, 1px underline (border-bottom: 1px solid #000000). Used for 'LOAD MORE CONTENT', category labels, and all interactive text. No background, no border-radius, no padding beyond text. The underline is the only affordance — no button chrome exists in the system.

### Image Grid (4-Column)
**Role:** Primary content arrangement

4 equal columns on desktop, 12px gap between cards. No gutters at row boundaries — images and text flow continuously. Each cell is an independent editorial unit. No card borders, no background separation between cards and page.

### Full-Bleed Image Strip
**Role:** Editorial feature interruption

Edge-to-edge photograph with no text overlay, 0px radius, no border. Sits between content grids to break visual rhythm and provide atmospheric scale. Typical height: 50–70vh.

### Dark Footer
**Role:** Site closure and secondary navigation

Full-width #000000 background. Two columns of forma-djr-display links at 13px, 0.062em tracking, #ffffff, left-aligned (CONTRIBUTORS, LEGAL/PRIVACY POLICY, ONLINE SHOP, ABOUT) and right-aligned (INSTAGRAM, TIKTOK, LINKEDIN). Centered DIN display text at 52px, white, with 1px white underline — mirrors the body link style at display scale. Wordmark 'EXHIBITION' in bottom-left at 25px DIN, white.

### Footer Display CTA
**Role:** Issue promotion in footer

DIN 400 at 52px, #ffffff, centered, with 1px solid #ffffff underline. Text like 'UNCOVER CRAFT ISSUE'. Functions as the primary action of the entire site — a text link scaled to display proportions. The underline is the interactive affordance; no button exists.

### Category Tag
**Role:** Content classification

forma-djr-display 500 at 13px, all-caps, 0.062em tracking, #000000. Inline text, no background, no border. Appears above card titles or beside content to indicate section (FASHION, ART, DECODING, etc.).

### Image Carousel Indicator
**Role:** Slide position in hero

Row of small dots (4px diameter, #ffffff with varying opacity) centered below hero content. No active state color shift — opacity gradient indicates position. Minimal, non-intrusive.

### Expand Icon
**Role:** Fullscreen or expand affordance

Simple '+' symbol in forma-djr-display at 13px, #ffffff, centered between hero text elements. No border, no background — pure typographic glyph.

### Section Divider
**Role:** Horizontal separation between content groups

1px solid #e5e7eb line spanning full content width. No margin — sits flush between sections. The only structural divider in the system; replaces card backgrounds and shadows entirely.

## Do's and Don'ts

### Do
- Use DIN at 90–100px for any display-level headline — the extreme scale is the signature, not a preference
- Set all navigation and micro-labels in forma-djr-display at 13px, all-caps, with 0.062em letter-spacing — this tracking is non-negotiable
- Apply 1px solid #e5e7eb borders for all structural lines — dividers, card outlines, link underlines
- Use Cochin 16px/1.50 for all editorial body and descriptions — never substitute a sans-serif for body copy
- Set line-height to 0.75–0.80 on DIN display sizes (50px+) to create dense, stacked typographic blocks
- Maintain 0px border-radius on all elements — no rounded corners anywhere in the system
- Use white (#ffffff) as the sole page and card background — no tinted surfaces unless matching #fff5fa exactly

### Don't
- Do not add color, gradients, or shadows — the system is intentionally achromatic; any chromatic addition breaks the editorial contract
- Do not use bold or heavy weights on DIN — weight 400 at extreme sizes is the only correct approach
- Do not apply border-radius to images, cards, or buttons — all edges must remain sharp
- Do not use letter-spacing on Cochin body text — tracking belongs only to display and micro-UI
- Do not introduce button components with backgrounds or padding — all actions are underlined text links
- Do not add card background colors or box-shadows to create separation — use hairlines and whitespace
- Do not use warm or cool greys beyond #e5e7eb and #a9a9a9 — the two-value grey scale is deliberate restraint

## Elevation

The system deliberately avoids all box-shadows and elevation effects. Visual separation is achieved exclusively through 1px hairline borders (#e5e7eb), whitespace, and typographic scale. This flat-everything approach reinforces the printed editorial metaphor — the screen behaves as a page, not a software interface.

## Surfaces

- **Paper White** (`#ffffff`) — Page background, nav bar surface, content card background
- **Bone Blush** (`#fff5fa`) — Subtle warm card surface — used on rare editorial cards to break the pure-white field
- **Ash Grey** (`#a9a9a9`) — Image placeholder fills, muted tonal blocks behind absent photography
- **Ink Black** (`#000000`) — Footer background, inverted text contexts — the only non-white surface in the system

## Imagery

Full-bleed editorial photography dominates the visual system. Images are high-fashion, art-directed portraits and scenes with cinematic lighting — moody, desaturated, often with strong directional light. Treatment is always edge-to-edge with 0px radius, no masks, no overlays beyond text. No illustrations, no icons, no abstract graphics. Photography functions as both atmosphere and content — the hero image IS the page, not decoration around it. The product is the image; type and chrome exist only to frame it.

## Layout

Full-bleed layout with no max-width container on the hero — images and the wordmark span the entire viewport. Content sections use a centered max-width of ~1400px with no side gutters beyond natural centering. Hero is a full-viewport image carousel with overlaid text, no split-screen or boxed hero. Below the hero, a 4-column equal grid presents editorial cards in a continuous flow with 12px gaps. A full-bleed image strip interrupts the grid rhythm at intervals. The footer is a full-width black band with two-column micro-navigation flanking a centered display CTA. Section spacing is generous (60–100px) with 1px hairline dividers marking transitions. Navigation is a minimal top bar — no sticky behavior, no sidebar, no mega-menu. The page scrolls vertically as a single editorial sequence.

## Similar Brands

- **032c Magazine** — Same oversized condensed sans-serif display type, all-caps micro-navigation, and pure black-on-white editorial layout with no decorative elements
- **Apartamento** — Editorial magazine aesthetic with hairline borders, oversized serif headlines, and full-bleed photography with minimal UI chrome
- **System Magazine** — Extreme typographic scale contrast, full-bleed hero photography, and near-zero color palette — image and type as the only content
- **KALEIDOSCOPE** — Same art-magazine discipline: white canvas, oversized condensed display type, hairline structural lines, and zero chromatic UI elements
