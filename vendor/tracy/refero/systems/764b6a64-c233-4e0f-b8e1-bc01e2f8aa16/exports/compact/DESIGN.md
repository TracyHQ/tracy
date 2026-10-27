# Apple (España) — Style Reference
> black theater with luminous hardware

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Apple's MacBook Pro page operates as a cinematic dark canvas: pure black backgrounds swallow everything except product photography, oversized type, and one precise blue accent. The visual grammar is restraint at extreme scale — headlines up to 80px in SF Pro Display weight 600 with negative tracking, body copy at 17px in SF Pro Text, and generous vertical breathing between sections. Color is rationed: blue (#0071e3) appears only on the primary purchase button; links adopt lighter blue (#2997ff) as functional punctuation; everything else is monochrome white-to-gray-on-black. Surfaces are defined by a 28px corner radius and zero shadows — elevation is achieved through photographic content and tonal contrast, not depth effects. The page reads like a product film: dark voids, luminous hardware, typographic calm.

## Colors

| Name | Value | Role |
|------|-------|------|
| True Black | `#000000` | Primary canvas, hero background, nav backdrop, full-page surface |
| Charcoal | `#1d1d1f` | Elevated card surfaces on dark mode, section dividers, body text on light surfaces |
| Smoke | `#333336` | Nav segment bar, secondary button fills, subtle tonal contrast on dark backgrounds |
| Graphite | `#424245` | Secondary body text, navigation labels, and subdued headings. Do not promote it to the primary CTA color |
| Ash Gray | `#86868b` | Muted body text, meta labels, input borders, helper copy |
| Platinum | `#cccccc` | Icon fills, nav glyphs, decorative outlines at low contrast |
| Silk | `#f5f5f7` | Primary heading and body text on dark backgrounds, light surface fills, badge backgrounds |
| Pure White | `#ffffff` | Maximum contrast text, icon fills, light card surfaces, button text |
| Apple Blue | `#0071e3` | Primary purchase CTA fill — the single chromatic action button, Buy button, focus ring |
| Link Blue | `#2997ff` | Blue text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Deep Link | `#0066cc` | Standard body link color, secondary anchor text |
| Ember | `#b64400` | New badge accent — small warm punctuation for freshness markers |
| M5 Spectrum Gradient | `linear-gradient(108deg, rgb(0,144,247), rgb(186,98,252) 33%, rgb(242,65,107) 66%, rgb(245,86,0))` | Decorative gradient endpoint — product chip badge backgrounds with prismatic color washes |

## Typography

### SF Pro Display — Display and headline typography — hero h1, section openers, product names. Weight 600 with aggressive negative tracking (-0.015em at 80px down to -0.003em) gives the type a compressed, architectural presence. The whisper-thin tracking on the largest sizes is signature: 80px headlines feel monolithic rather than decorative.
- **Substitute:** Inter
- **Weights:** 600
- **Sizes:** 40px, 56px, 64px, 80px
- **Line height:** 1.10, 1.07, 1.06, 1.05
- **Letter spacing:** -0.015em at 80px, -0.009em at 64px, -0.005em at 56px, 0 at 40px
- **OpenType features:** `"numr" on`

### SF Pro Display — Subheadings, card titles, eyebrow labels — transitions from display to functional type. Tracking shifts to slightly positive values (+0.007em at 28px, +0.012em at 19px) as size decreases, compensating for optical tightness in shorter strings.
- **Substitute:** Inter
- **Weights:** 600
- **Sizes:** 19px, 21px, 28px, 32px
- **Line height:** 1.21, 1.19, 1.14, 1.13
- **Letter spacing:** 0.004em at 32px, 0.007em at 28px, 0.011em at 21px, 0.012em at 19px
- **OpenType features:** `"numr" on`

### SF Pro Text — Body copy and primary paragraph text — the 17px/1.47 combination with -0.022em tracking is the workhorse of the system. Used everywhere from hero subtext to footer disclaimers.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 17px
- **Line height:** 1.47
- **Letter spacing:** -0.022em
- **OpenType features:** `"numr"`

### SF Pro Text — Small UI text — nav links, footnotes, legal copy, micro-labels. Tracking goes more negative (-0.037em at 10px) at the smallest sizes to maintain readability despite size.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12px, 14px, 20px
- **Line height:** 1.33, 1.29, 1.33
- **Letter spacing:** -0.010em at 12px, -0.006em at 20px
- **OpenType features:** `"numr"`

### SF Pro Text — Logo and brand mark rendering size in the global nav — weight 400 not 600, because the wordmark itself carries the form. Line-height 1.00 keeps it visually compact.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 44px
- **Line height:** 1.00
- **Letter spacing:** -0.0370em, -0.0270em, -0.0220em, -0.0190em, -0.0160em, -0.0100em, -0.0060em, -0.0030em
- **OpenType features:** `"numr"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.12px |
| body-sm | — | — | 17px | 1.47 | -0.374px |
| body | — | — | 21px | 1.19 | 0.231px |
| subheading | — | — | 28px | 1.14 | 0.196px |
| heading-sm | — | — | 40px | 1.1 | 0px |
| heading | — | — | 56px | 1.07 | -0.28px |
| heading-lg | — | — | 64px | 1.06 | -0.576px |
| display | — | — | 80px | 1.05 | -1.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 28px
- **Element gap:** 10px

### Border Radius

- **nav:** 980px
- **cards:** 28px
- **links:** 10px
- **badges:** 20%
- **inputs:** 210px
- **buttons:** 9999px

## Components

### Primary CTA Pill Button
**Role:** The single dominant purchase action on the page

Background #0071e3, text #ffffff, border-radius 9999px, padding 11px 22px. This is the only chromatic action button in the system — every other interaction is monochrome or ghost. Weight 400 at 17px SF Pro Text, letter-spacing -0.022em. Used exclusively for "Comprar" (Buy).

### Ghost Pill Button
**Role:** Secondary actions and navigation controls

Background transparent, text #ffffff at 80% opacity, border-radius 9999px, no visible border. Padding 11px 22px. Weight 400 at 17px. Used for "Ver el vídeo" (Watch the video) and feature-explorer controls. Borderless by default — relies on text-only affordance.

### Glassmorphic Floating Bar
**Role:** Price + Buy composite floating on hero

Background rgba(66,66,69,0.72), text #ffffff at 80% opacity, border-radius 36px (or 980px for extreme rounding), padding 11px 22px, backdrop-filter blur(20px) saturate(1). This is the glass-pill pricing component anchored at hero bottom-right. The 72% charcoal fill over the hero image is what makes this read as frosted glass.

### Text Link with Arrow
**Role:** Inline learn-more navigation

Color #2997ff, weight 400 at 17px, no underline by default, includes a ◊ or → glyph. The arrow glyph is part of the link, not a separate element. Tracking matches body copy at -0.022em.

### Dark Card Surface
**Role:** Feature card on dark backgrounds

Background #000000 or transparent, border-radius 28px, no shadow, padding 28px. Used in the "Lo principal." feature grid. The 28px radius is the system's signature softness — applied to every card-like container including product cards.

### Light Card Surface
**Role:** Feature card on light backgrounds (alternating sections)

Background #ffffff or #f5f5f7, border-radius 28px, no shadow, padding 28px. Text color shifts to #1d1d1f on these cards. The radius stays constant at 28px regardless of theme.

### Section Header
**Role:** Major section opener (Lo principal., Más de cerca., etc.)

Left-aligned heading at 40px SF Pro Display weight 600, letter-spacing 0, color #f5f5f7. Optional right-aligned "Ver el vídeo" link in #2997ff. Vertical padding 40-60px above the section content.

### Chip Badge with Prismatic Gradient
**Role:** Product family identifier (M5, M5 Pro, M5 Max)

Square badge approximately 200px, border-radius 20% (creating subtle rounded square), background uses the prismatic gradient linear-gradient(108deg, #0090f7, #ba62fc 33%, #f2416b 66%, #f55600), with white Apple logo and chip name overlay. The gradient creates an iridescent finish effect — the badge itself is the decorative element.

### Nav Link
**Role:** Top-level navigation item

Color #cccccc at 80% opacity, weight 400 at 12px SF Pro Text, letter-spacing -0.010em, no underline. Padding 10px. The 80% opacity is critical — full white nav text would feel aggressive against the black bar.

### Search Input (Global)
**Role:** Top-right search field

Background #000000, text #f5f5f7, placeholder #86868b, border #86868b at 1px, border-radius 210px (extreme pill shape), padding 0 22px left and 0 42px right (icon gutter). The 210px radius on a 36px-tall input creates a pure pill silhouette.

### Eyebrow Product Label
**Role:** Pre-headline product identifier

Weight 400 at 17px SF Pro Text, color #f5f5f7, letter-spacing -0.022em. Sits directly above the hero h1 ("MacBook Pro" above "La velocidad viene de familia."). The weight 400 at this size creates quiet product identification rather than screaming.

### Finishes Swatch
**Role:** Product color/finish picker item

Circular or rounded square swatches at ~40px, filled with finish-specific colors (#c8d8e0 Sky Blue, #f0e4d3 Starlight, #2e3642 Midnight, #e3e4e5 Silver). No border by default, border-radius 20% or 999px. These are product selectors, not decorative.

### Promo Banner Bar
**Role:** Secondary global message strip below nav

Background #1d1d1f (dark) or #ffffff (light), text #f5f5f7 or #1d1d1f, weight 400 at 14px, centered or left-aligned, includes inline "Comprar" link in #2997ff. Height ~52px (96px combined with nav). The thin strip communicates promotional urgency without competing with the hero.

## Do's and Don'ts

### Do
- Use #0071e3 fill with #ffffff text and 9999px radius exclusively for the primary Buy action — never introduce a second chromatic button color
- Set display type at 56-80px in SF Pro Display weight 600 with -0.015em to -0.005em letter-spacing for all hero and section openers
- Apply 28px border-radius to every card, product viewer, and light surface container — this single radius defines the system's softness
- Compose body copy at 17px SF Pro Text weight 400 with 1.47 line-height and -0.022em tracking as the universal paragraph spec
- Maintain pure black (#000000) as the page canvas with no gradient or texture — let product photography provide all visual warmth
- Use rgba(66,66,69,0.72) with backdrop-filter blur(20px) saturate(1) for any floating UI element that must layer over photography
- Keep nav text at 80% white opacity (#cccccc equivalent) at 12px weight 400 — full-white nav feels aggressive against the black bar

### Don't
- Never use a second accent color beyond #0071e3 for actions — the blue is rationed, do not dilute it with green, orange, or purple CTAs
- Never add box-shadows to cards or buttons — the system defines elevation through color and radius alone, shadows would feel cheap
- Never use font-weight 700 anywhere — the system maxes at 600 because 700 reads as desperate on the negative tracking
- Never set headings below 28px — the scale starts at subheading 28px and goes up; small bold text is not in the vocabulary
- Never introduce a new radius below 10px for interactive elements — pills (9999px), cards (28px), and links (10px) are the only curves
- Never use color #0066cc as a button fill — it is link-text only; filling a button with it would confuse the action hierarchy
- Never add background gradients to text blocks or content sections — gradients are reserved for chip badges and decorative product imagery

## Elevation

The system rejects shadow-based elevation entirely. Depth is communicated through three mechanisms only: (1) tonal contrast — charcoal #1d1d1f cards on black #000000 canvas, (2) frosted glass via rgba(66,66,69,0.72) + backdrop-filter blur(20px) saturate(1) for elements that float over photography, and (3) the 28px border-radius which optically lifts card edges from the background. Adding box-shadow would violate the flat, cinematic aesthetic.

## Surfaces

- **Canvas** (`#000000`) — Full-page background, hero, nav backdrop
- **Elevated Surface** (`#1d1d1f`) — Card surfaces on dark mode, promo banner, section dividers
- **Glass Surface** (`#424245`) — Floating UI over photography, frosted price/buy bar
- **Light Card** (`#ffffff`) — Alternating light sections, feature card backgrounds

## Imagery

Photography is the primary visual content and dominates the page surface. Treatment: product hero shot on pure black background with dramatic side-lighting revealing the laptop's metallic edge — no environmental context, no lifestyle staging, the object exists in a void. Secondary product imagery follows the same isolation principle: devices on pure black or against gradient washes. Chip badges use prismatic iridescent gradients (blue→purple→pink→orange) as decorative texture on otherwise minimal cards. Iconography is monochrome white outlined glyphs (play button, plus, arrow) at the SF Symbols stroke weight. No illustration, no 3D rendering, no abstract graphics — photography and typographic scale carry the entire visual weight.

## Layout

Full-bleed dark canvas with centered max-width ~1440px content container. Hero is a single-screen viewport with oversized headline left-aligned at ~20% from left edge, product image centered-right with dramatic negative space, and a floating glass price/buy bar anchored bottom-right. Section rhythm alternates between full-bleed black bands and full-bleed white bands (section openers like 'Lo principal.', 'Más de cerca.', 'Batería', 'macOS Tahoe'), separated by 80px vertical padding. Feature grids use 3-column card layouts at 28px radius. Content arrangement is consistently text-first: left-aligned headline, optional right-aligned video link, then media grid below. Navigation is a sticky 44px top bar + optional 52px promo strip, both fully opaque. No sidebar, no mega-menu — navigation is horizontal text links only with extreme minimalism.

## Similar Brands

- **Apple (apple.com)** — Same SF Pro Display weight 600 with negative tracking, same pure-black hero canvas, same single-blue (#0071e3) rationing for CTA buttons, same 28px card radius
- **Tesla (tesla.com)** — Same full-bleed dark hero with product photography on black void, same oversized minimal headline typography, same zero-shadow flat card surfaces, same rationed single-accent color strategy
- **Bang & Olufsen (bang-olufsen.com)** — Same black-canvas product photography with dramatic side-lighting, same 28px corner radius on all containers, same premium restraint in color palette — monochromatic with minimal chromatic punctuation
- **Nothing (nothing.tech)** — Same dark-mode-first aesthetic with pure black backgrounds, same typographic confidence at large display sizes, same minimal interactive color budget — single accent for CTAs, monochrome everywhere else
