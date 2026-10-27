# Apple (España) — Style Reference
> Cathedral of white space with whispered headlines. A vast pale hall where massive weight-700 type hangs in the air, tethered only by pastel product colors and a single blue thread.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Apple's product page language is a study in typographic generosity: oversized SF Pro Display headlines floating on near-white canvas, surrounded by enormous negative space that makes every word feel deliberate. The palette is almost monochrome — text at #1d1d1f, canvas alternating between #ffffff and #f5f5f7 — with a single blue accent (#0071e3) reserved exclusively for interactive moments. Color appears in the product imagery itself (the pastel finishes), never as UI decoration. Components are borderless: rounded cards with 28px radii, pill-shaped buttons that nearly touch the page edges with no visible containers, and zero shadow. Rhythm comes from alternating white/gray bands rather than dividers or borders.

## Colors

| Name | Value | Role |
|------|-------|------|
| Primary Ink | `linear-gradient(184deg, #1d1d1f 20%, #0000f9 76%, #252525 95%)` | Headlines, body text, button labels — the dominant foreground tone across all surfaces; Hero product image background — fades from solid #1d1d1f at top into chromatic blue |
| Mid Gray | `#707070` | Secondary text, nav inactive state, muted UI labels |
| Deep Gray | `#474747` | Navigation text and iconography at medium emphasis |
| Hairline | `#d6d6d6` | Hairline borders between sections and UI elements |
| Canvas | `#f5f5f7` | Alternating section backgrounds — the gray band that breaks up white sections |
| Paper | `#ffffff` | Card surfaces, primary page background, button text on dark fills |
| Cool Wash | `#e8e8ed` | Subtle button backgrounds, hovered surfaces, pagination dot fills |
| Faded Surface | `#fafafc` | Global nav opened state, elevated panel surfaces |
| Quiet Dot | `#777779` | Pagination indicator fills, tertiary interactive state |
| Electric Blue | `#0071e3` | Filled action buttons — the only chromatic accent in the UI, used sparingly for CTAs |
| Link Blue | `#0066cc` | Inline body text links, arrow-link chevron text |
| Ember | `#b64400` | Orange state accent for badges, validation surfaces, and short status labels. |
| Sky | `#c8d8e0` | Product finish swatch — pastel blue surface option |
| Citrus | `#dddc8c` | Product finish swatch — pastel yellow-green surface option |
| Starlight | `#f0e4d3` | Product finish swatch — warm cream surface option |
| Silver | `#e3e4e5` | Product finish swatch — cool gray surface option |
| Blush | `#e8d0d0` | Product finish swatch — soft pink surface option |
| Indigo | `#596680` | Product finish swatch — muted indigo surface option |
| Midnight | `#2e3642` | Product finish swatch — deep charcoal surface option |
| Citrus Gradient | `linear-gradient(184deg, #1d1d1f 0%, #dfe74f 33%, #5a7e2 100%)` | Product hero alternative finish — dark base fading through yellow-green highlight |

## Typography

### SF Pro Display — Hero headlines and display titles — weight 700 at 80–96px with negative tracking up to -1.44px creates the signature Apple 'enormous headline floating in white' feel. Substitutes: Inter, system-ui
- **Substitute:** Inter
- **Weights:** 600, 700
- **Sizes:** 21px, 24px, 28px, 32px, 40px, 56px, 80px, 96px
- **Line height:** 1.04–1.07
- **Letter spacing:** -1.44px at 96px, -0.28px at 56px
- **OpenType features:** `"numr"`

### SF Pro Display — Section headings, card titles, subheadings — weight 600 with slightly positive tracking reads as warm and approachable at mid sizes, contrasting the tight display headlines above
- **Substitute:** Inter
- **Weights:** 600
- **Sizes:** 21px, 24px, 28px, 32px, 40px, 56px, 80px, 96px
- **Line height:** 1.14–1.38
- **Letter spacing:** 0.007em at 28px (opens up for mid-size), 0.011em at 21px
- **OpenType features:** `"numr"`

### SF Pro Text — Body copy, navigation, supporting paragraphs, small labels — weight 400 at 17px is the workhorse. Negative tracking tightens the body for crispness on dense informational pages
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 8px, 12px, 14px, 17px, 20px, 44px
- **Line height:** 1.18–1.47
- **Letter spacing:** -0.022em at 17px, -0.003em at 44px
- **OpenType features:** `"numr"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 12px | 16 | -0.12px |
| caption | — | — | 14px | 18 | -0.224px |
| body-sm | — | — | 17px | 25 | -0.374px |
| body | — | — | 21px | 29 | 0.231px |
| body-lg | — | — | 28px | 32 | 0.196px |
| subheading | — | — | 32px | 36 | 0.128px |
| heading-sm | — | — | 40px | 48 | — |
| heading | — | — | 56px | 60 | -0.28px |
| heading-lg | — | — | 80px | 84 | -1.2px |
| display | — | — | 96px | 100 | -1.44px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 100-120px
- **Card padding:** 28px
- **Element gap:** 8-10px

### Border Radius

- **cards:** 28px
- **links:** 10px
- **badges:** 36px
- **buttons:** 980px
- **smallButtons:** 999px
- **productImages:** 28px

## Components

### Filled Pill Button (Primary CTA)
**Role:** High-emphasis action button — the only chromatic button in the system

Pill shape at 980px radius. Background #0071e3, white text. 17px SF Pro Text weight 400. Horizontal padding 16px, vertical 11px. Used for "Comprar" and "Más información" — appears once per section maximum.

### Ghost Pill Button
**Role:** Medium-emphasis action on light backgrounds

Transparent fill, 1px border at #1d1d1f or rgba(0,0,0,0.8). 999px radius. Text in #1d1d1f at 17px weight 400. Padding 16px horizontal.

### Text Link with Arrow
**Role:** Inline directional link within body copy and section footers

No background, no border. Text color #0066cc with trailing arrow glyph (› or →). 17px SF Pro Text weight 400. Underline only on hover.

### Hairline Underlined Link
**Role:** Minimal nav and footer links

Transparent fill, text #1d1d1f or #474747, bottom border 1px solid matching text color. 12–14px SF Pro Text. Used in global nav and footer.

### Feature Showcase Card
**Role:** Large content card with rounded corners, no shadow or border

28px border-radius. White or #f5f5f7 background. Padding 28–40px internal. Contains headline at 40–56px SF Pro Display, supporting body at 17px, and optional CTA. No visible stroke.

### Product Finish Swatch
**Role:** Color selector for hardware variants

Small rounded square (~80px) at 28px radius, filled with one of the product finish colors (Sky, Citrus, Starlight, etc). No border, no label inside — color IS the content.

### Section Header
**Role:** Opening label for each content band

28–32px SF Pro Display weight 600, color #1d1d1f. Followed by optional supporting paragraph at 21px. Left-aligned with generous left/right padding matching page grid. Letter-spacing slightly positive (+0.007em) makes mid-size headings feel warmer.

### Global Navigation Bar
**Role:** Sticky top bar across all Apple pages

Height 44px. Background transitions from white/transparent to #fafafc on scroll (backdrop-filter blur 20px). Logo + 7 product links + search + bag icon. Links at 12px SF Pro Text weight 400, color #1d1d1f, separated by 8–10px gaps.

### Promo Ribbon
**Role:** Slim announcement bar above the nav

Centered single-line text at 12–14px SF Pro Text. Black text on white. Optional inline link in #0066cc.

### Product Hero
**Role:** Full-width product presentation with centered text above and product visual below

White background. Product name (e.g., "MacBook Neo") at 17px centered. Hero headline at 96px SF Pro Display weight 600, color #1d1d1f, letter-spacing -1.44px. CTA button below, then pricing text at 17px. Product image fills lower half with rounded or full-bleed edges depending on product type.

### Color Variant Showcase
**Role:** Two-column comparison of product color options

Two side-by-side cards at 28px radius, each containing a product render on its finish-colored background. Cards sit on #f5f5f7 canvas. No text inside — the visual does the work.

### "Nuevo" Badge
**Role:** New-product indicator

Inline text only, no background or shape. Text "Nuevo" in #b64400 (warm orange) at 12–14px SF Pro Text weight 500. Sits above product name as a warm punctuation against the cool palette.

### Dot Pagination Indicator
**Role:** Carousel position indicator

Small circles ~8px diameter. Active dot at #1d1d1f, inactive dots at #777779. Horizontal spacing 7px between dots.

### Section Divider (Implicit)
**Role:** Visual break between content bands

No explicit divider line. Sections alternate between #ffffff and #f5f5f7 backgrounds, and the color shift alone signals separation. Vertical spacing 100–120px between bands.

### Footer Legal Block
**Role:** Dense fine-print at page bottom

Background #f5f5f7. Body copy at 12px SF Pro Text weight 400, color #707070. Inline links in #0066cc. Tight line-height 1.33.

## Do's and Don'ts

### Do
- Use SF Pro Display weight 700 for hero headlines at 80–96px with negative tracking up to -1.44px — the tight tracking on huge type is what makes Apple headlines feel architectural.
- Set section backgrounds to alternate between #ffffff and #f5f5f7 to create visual rhythm without borders or dividers.
- Use 28px border-radius on all cards and product images — this is the signature rounding that softens the entire system.
- Reserve #0071e3 for filled CTA buttons only — never as text color, never as decoration. Inline links use #0066cc instead.
- Use pill buttons at 980px or 9999px radius. Square or lightly rounded buttons break the system's fluid feel.
- Set body copy at 17px SF Pro Text weight 400 with -0.022em letter-spacing — this is the canonical reading size across all Apple pages.
- Apply the "numr" font-feature-setting on all numeric content for consistent tabular figures.
- Keep line-height tight on display sizes (1.04–1.07) and open up for body (1.47) — the contrast creates hierarchy without size jumps.
- Let product imagery carry the color. The UI stays monochrome; the MacBook, iPhone, or finish swatch provides all chromatic interest.

### Don't
- Don't use shadows or elevation on cards. The system relies on background-color alternation and 28px radii to establish hierarchy.
- Don't introduce accent colors beyond #0071e3 and #0066cc. Even the orange "Nuevo" badge is used at most once per page.
- Don't set headlines below 40px. Apple's system depends on oversized type to create its cathedral-of-white-space feel.
- Don't use borders to separate sections. Alternate the canvas color (#ffffff ↔ #f5f5f7) instead.
- Don't apply border-radius below 10px to interactive elements. Pills and 28px corners are non-negotiable.
- Don't put decorative gradients on UI surfaces. The complex product-color gradients belong inside product renders, not buttons or cards.
- Don't use weight below 400 for body text or below 600 for headings. The system speaks in clear, weighty voices.
- Don't add background fills to text links. Use color and arrow glyphs only — never boxes around inline links.
- Don't center body paragraphs. Apple headlines can be centered, but multi-line descriptions and supporting copy are left-aligned.

## Surfaces

- **Canvas White** (`#ffffff`) — Primary page background and card surfaces — the default light canvas
- **Canvas Gray** (`#f5f5f7`) — Alternating section bands, footer, badge backgrounds — provides visual rhythm without borders
- **Hover Wash** (`#e8e8ed`) — Interactive hover state on light buttons and pagination dots
- **Nav Elevated** (`#fafafc`) — Global nav background after scroll, slight frosted distinction from white canvas

## Imagery

Apple's visual language is product-first photography: tightly cropped hardware renders on pure white or finish-colored backgrounds, with no lifestyle context or staging. The hero shows hands holding a pastel-green MacBook Neo — the human element is incidental, showing scale and texture rather than emotion. Product variant sections pair two devices side-by-side on their respective finish colors (pink, green, silver, sky blue), each card a flat color field with the product centered. Detail shots use extreme close-ups (laptop hinge, camera module) against neutral backgrounds. There are no illustrations, no abstract graphics, no decorative imagery — the product IS the visual. Iconography throughout is monochrome SF Symbols-style line icons at 1.5–2px stroke weight, drawn from Apple's system icon set. Photography treatment is always high-key: even, shadowless lighting that flattens the product into a graphic shape rather than a dimensional object.

## Layout

Full-bleed sections that stretch edge-to-edge with generous internal padding (~40–80px sides). Content max-width effectively 1200px centered within each band. The hero is a centered stack: eyebrow label, oversized headline, single CTA button, pricing line, then product image filling the lower 60% of the viewport. Sections follow a repeating pattern: heading left-aligned in a band, then either a 2-column feature layout (text-left/image-right or alternating), a 3-column card grid, or a centered visual showcase. Content rhythm is controlled entirely by alternating white/#f5f5f7 backgrounds with 100–120px vertical gaps — no dividers, no cards wrapping features. The global nav is a single 44px sticky bar. Product spec sections use full-width bands with generous internal whitespace, where text sits in narrow columns (~560px) centered against a wider visual area.

## Similar Brands

- **Apple iPhone product pages** — Same oversized SF Pro Display headlines floating on alternating white/#f5f5f7 bands, same 28px card radii, same pill-shaped blue CTAs, same borderless flat surfaces with zero shadow
- **Apple Vision Pro pages** — Same typographic generosity, same monochrome UI with single blue accent, same product-color gradients used only inside hero imagery, same cathedral-of-white-space layout rhythm
- **Apple AirPods Max pages** — Identical component language — pill buttons at 980px radius, 17px body copy with -0.022em tracking, alternating canvas bands without dividers, color presented through product finish swatches not UI decoration
- **Nothing.tech product pages** — Same font-first hierarchy, same generous whitespace, same near-monochrome UI that lets typography carry all weight
- **Teenage Engineering** — Same deliberate restraint — the UI itself is so quiet that the product and its color options become the only visual interest, achieved through identical flat surfaces and absence of decorative chrome
