# Home page | Impossible Foods — Style Reference
> Blood-red punk poster in velvet darkness. A custom condensed display face bleeds across a wine-dark canvas while single-color red CTAs punch through like a price tag on a butcher's chalkboard.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Impossible Foods runs a dark, wine-dark canvas flooded with blood-red accents — the visual register of a punk-rock manifesto printed on butcher paper. Typography is the loudest voice: display text is enormous, brutally tight (line-height 0.73), and slightly opened in tracking, shouting product names like 'STEAK (FROM PLANTS)' in a custom condensed sans that fills the viewport. The single red (#e10600) carries all action and emphasis, with a soft blush pink (#ffc7c6) providing tonal relief and a near-black burgundy (#4f0423/#260212) for depth. Surfaces are flat, borders are crisp black hairline strokes, and food photography is presented in irregular mask-cut shapes that float around the type rather than inside conventional frames. The overall rhythm is aggressive but disciplined: massive display moments punctuated by compact product grids and pill-shaped toggle controls.

## Colors

| Name | Value | Role |
|------|-------|------|
| Velvet Wine | `#260212` | Page canvas and deepest section background — the floor everything sits on |
| Burgundy Stage | `#4f0423` | Section and card surfaces, slightly lifted from the canvas to separate bands of content |
| Impossible Red | `#e10600` | Primary action buttons, active toggles, headline accents, icon emphasis — the single chromatic signal that commands attention |
| Blush Highlight | `#ffc7c6` | Soft secondary text, pill toggles in default state, link hover, tonal counterpoint to the aggressive red |
| Butcher Black | `#000000` | Top navigation background, hairline borders, card outlines, deep contrast strokes |
| Bone White | `#ffffff` | Navigation and button text, body copy on dark surfaces, inverted toggle text |

## Typography

### sans-meat — The only typeface on the site. Carries everything from 10px micro-labels to 231px hero statements. Weight 700 dominates display and CTAs; 400 and 500 handle body, nav, and secondary UI. The display sizes are anti-convention — most brands cap hero text around 64–80px; sans-meat's display reaches viewport-filling proportions because the brand is built on the stunt of oversized declarations like 'STEAK (FROM PLANTS)' and 'THE POTLUCK'.
- **Substitute:** Druk Wide or Knockout (Hoefler) for display; Inter or Söhne for body and UI
- **Weights:** 400, 500, 700
- **Sizes:** 10, 12, 14, 18, 20, 22, 24, 28, 32, 40, 48, 103, 126, 149, 150, 153, 160, 161, 185, 189, 204, 226, 228, 231px
- **Line height:** 0.73–0.90 for display, 1.10–1.70 for body and UI
- **Letter spacing:** 0.02em on UI labels, 0.03em on small caps, 0.06em on the most aggressive display moments

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | 0.02px |
| body-sm | — | — | 14px | 1.4 | 0.02px |
| body | — | — | 18px | 1.4 | 0.02px |
| subheading | — | — | 24px | 1.15 | 0.02px |
| heading-sm | — | — | 32px | 1.1 | 0.02px |
| heading | — | — | 48px | 0.9 | 0.02px |
| heading-lg | — | — | 103px | 0.75 | 0.03px |
| display | — | — | 160px | 0.73 | 0.06px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 40-64px
- **Card padding:** 16-24px
- **Element gap:** 6-16px

### Border Radius

- **nav:** 15px
- **cards:** 12px
- **buttons:** 15px
- **toggles:** 15px
- **feature-cards:** 38px

## Components

### Sticky Top Navigation
**Role:** Persistent site header

Full-width #000000 bar, 15px radius on right-side CTA buttons, left-aligned 'IMPOSSIBLE' wordmark in #e10600, centered nav links in #ffffff with caret indicators, right-aligned 'Foodservice' dropdown and 'Find Us' CTA. Sticky to top of viewport.

### Primary CTA Button
**Role:** Filled action button

#e10600 background, #ffffff text, sans-meat weight 500, 14px size, 0.02em letter-spacing, uppercase. Radius 15px, padding 10px 14px, gap 6px. Includes a right-side caret arrow. Used for 'LEARN MORE', 'FIND US'.

### Ghost CTA Button
**Role:** Secondary action button

Transparent background, #ffffff 1px border, #ffffff text. Same typography, radius, and padding as Primary CTA. Pairs with a filled CTA to offer two-step engagement (e.g. LEARN MORE filled + FIND IT ghost with location pin).

### Filter Pill Toggle
**Role:** Category or recipe filter selector

Pill-shaped (15px radius), padding 10px 16px, 6px gap between pills. Active state: #e10600 background, #ffffff text. Default state: transparent with #ffc7c6 text or dark border with #ffffff text. 14–18px sans-meat uppercase, weight 500, 0.02em tracking.

### Hero Display Block
**Role:** Full-width section opener with oversized type

Centered stack on #260212 or #4f0423 canvas. Eyebrow label at 14–18px sans-meat 500 uppercase. Display headline at 160–231px sans-meat 700, line-height 0.73, letter-spacing 0.06em, color #e10600. Often uses parenthetical asides in a second line. A small CTA button (Primary CTA pattern) sits below.

### Product Carousel Card
**Role:** Showcase for packaged product

Product packaging photograph on #4f0423 background, no visible card border, no shadow. Below image: product name in 22–24px sans-meat 700 uppercase #ffc7c6 or #ffffff, 0.02em tracking. Two CTAs side by side — filled 'LEARN MORE' and ghost 'FIND IT' with pin icon. Pagination dots below carousel.

### Category Tab with Number Badge
**Role:** Product line selector (Beef, Sausage, Chicken)

Uppercase sans-meat 400–500 label, 20–24px, #ffc7c6. Small circular number badge to the right, 16px, #ffffff text on #4f0423 fill, fully round. Underline appears on active tab.

### Masked Food Photography
**Role:** Decorative hero imagery

Food shots cropped in irregular organic shapes (not rectangles, not circles — something between a blob and a rough hexagon). Treated as floating decoration around hero display type, not framed in a card. No border, no shadow, full color saturation, sharp edge.

### Section Heading with Bracket Accents
**Role:** Mid-page section introducer

Small all-caps eyebrow phrase bracketed by stylized arrow or chevron glyphs (e.g. '◂ FLEX ON EVERYONE AT ▸') at 14–18px sans-meat 500, #e10600. Massive display headline directly below at 103–160px sans-meat 700 #e10600.

### Recipe / Product Grid Card
**Role:** Content grid unit

12px or 38px radius (the large radius is used for one prominent feature card). #4f0423 surface, 1px #000000 hairline border, 16–24px internal padding. Image fills top, text and optional CTA below.

### Location Pin Icon Button
**Role:** Find product / store locator

Ghost button variant carrying a small map-pin glyph before the label. #ffffff border, #ffffff text, 14px sans-meat 500, 15px radius, 10px 14px padding.

### Nav Logo Mark
**Role:** Brand identifier in top nav

'IMPOSSIBLE' set in condensed sans-meat 700, all caps, #e10600, tightly tracked, 18–20px. Sits in a small white pill or directly on the black nav bar.

## Do's and Don'ts

### Do
- Use sans-meat at display sizes of 103px or larger for hero and section opener text — anything smaller defeats the aggressive declaration effect.
- Set display line-height to 0.73–0.75 and letter-spacing to 0.06em; this tight-but-opened tracking is what makes the type feel like a shouted label rather than a polished headline.
- Reserve #e10600 exclusively for primary action, active toggles, and the display type itself — never use it for body copy or borders.
- Pair a filled Primary CTA with a Ghost CTA on the same row; the contrast between filled-red and outlined-white creates the brand's signature two-step engagement.
- Set pill toggles and buttons to 15px radius — this is the unifying shape language across nav, CTAs, and filters.
- Crop food photography in irregular organic mask shapes when used decoratively near hero text; use clean rectangular framing only inside product cards.
- Keep the nav bar solid #000000 with white text regardless of the section beneath; the black bar is the visual anchor across the dark page.

### Don't
- Don't add drop shadows, glows, or gradients to cards or buttons — the system is intentionally flat and relies on color contrast alone for hierarchy.
- Don't introduce new chromatic colors; the entire interface is wine + red + blush + black + white. Any additional hue breaks the discipline.
- Don't use sans-meat below 10px or for long-form paragraphs — it is a display and UI face, not a reading face.
- Don't place body copy or secondary text in #e10600; red is reserved for actions and headline punctuation.
- Don't use rectangular product photography in hero zones — only mask-cut shapes belong near display type.
- Don't soften the line-height of display text below 0.80; open tracking is the only thing preventing the massive type from feeling cramped.
- Don't use a light or white page background; the wine-dark canvas is the non-negotiable foundation of the brand's visual register.

## Elevation

The design system is deliberately flat. There are no drop shadows on cards, buttons, or images. Hierarchy is built through color contrast (red against wine, white against black) and scale (massive display type against compact UI), not through elevation. The only depth cue is a subtle surface step from #260212 canvas to #4f0423 cards — a 12–15% lightness shift, not a shadow.

## Surfaces

- **Velvet Wine** (`#260212`) — Page background — the deepest floor
- **Burgundy Stage** (`#4f0423`) — Section banding and card surfaces
- **Impossible Red** (`#e10600`) — Accent wash and active-state surface
- **Butcher Black** (`#000000`) — Navigation bar and elevated framing

## Imagery

Product photography is the dominant visual: tightly framed shots of Impossible packaging (bags, boxes, trays) on the dark wine canvas, presented at high saturation with no lifestyle context. Decorative food photography appears only in the hero zone, cropped into irregular organic mask shapes that float around the oversized display type — the food is the asterisk next to the shouted claim. The masking is deliberately rough and asymmetric, not geometric circles or hexagons. No illustrations, no 3D renders, no abstract graphics. Iconography is minimal: a location pin for store locator and a small caret arrow on CTAs, both in white or red, flat, single-stroke.

## Layout

Full-bleed dark canvas with centered content stacks. The hero is a single centered column of type floating over the page background, flanked by mask-cut food images at irregular positions — not a split-screen or text+image row. Below the hero, the page alternates between centered display-text sections and horizontal product carousels. Product carousels use a single visible card with the rest peeking off-edge, creating a sense of overflow and abundance. The product grid is a 4-column row of cards. Category selectors (BEEF / SAUSAGE / CHICKEN) sit as a centered tab group above the carousel. Section dividers are formed by vertical spacing alone, never by lines or color bands. Navigation is a sticky black bar at top, present on every section.

## Similar Brands

- **Beyond Meat** — Same plant-based food category, same dark wine-and-red palette, same product-carousel-with-packaging-photo layout pattern
- **Liquid Death** — Same punk-rock brand register on a dark canvas, same oversized condensed display type, same single-accent-color discipline, same attitude-forward hero
- **Graza** — Same food-brand-as-manifesto energy with bold condensed display type and a single dominant accent color carrying all emphasis
- **Bark (dog food brand)** — Same dark-canvas food product photography, same uppercase condensed sans display, same aggressive attitude in a consumer-food context
- **Omsom** — Same wine-and-red food brand palette, same use of oversized display type for product names, same compact pill-button UI
