# Atlassian — Style Reference
> Confetti-edged engineering blueprint. A clean white enterprise canvas interrupted by dark navy editorial panels framed in torn geometric color — vivid violet, taxicab yellow, electric blue, leaf green — like precise diagrams pinned between paint-splattered dividers.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Atlassian operates as an enterprise workshop dressed in casual confidence: a white canvas where dense product interfaces meet bold, colorful editorial moments. The visual system splits between quiet functional surfaces (white, light gray, subtle blue) and expressive dark hero blocks (near-black navies) framed by fragmented geometric confetti in vivid violet, yellow, blue, and green. Typography is a paired custom sans family — Charlie Text for dense UI, Charlie Display for editorial headlines that grow to 80px with tightened tracking. Components are large, rounded, and borderless — pills for actions, generous 20px radii for cards, almost no shadow. Color is disciplined: one electric blue drives every primary action and link, while chromatic energy lives only in decorative edges and section dividers, never bleeding into functional UI.

## Colors

| Name | Value | Role |
|------|-------|------|
| Atlassian Blue | `#1868db` | Primary action buttons, active links, focus states, icon accents — the single chromatic action color across the entire system, providing directional clarity against monochrome surfaces |
| Midnight Navy | `#101214` | Primary text, heading fills on light surfaces, dark hero panel backgrounds, link text — the dominant ink color |
| Carbon Edge | `#292a2e` | Card borders on light surfaces, body text, input borders, secondary heading text |
| Slate Current | `#1c2b42` | Outlined action borders, icon strokes, list dividers, tertiary text — a blue-tinted near-gray that hints at brand without committing to color |
| Muted Indigo | `#42526e` | Helper text, form labels, info badges, icon tints, secondary metadata |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text on dark fills, dark-section backgrounds where contrast demands it |
| Fog White | `#f0f1f2` | Muted button backgrounds, secondary surface fills, hairline section dividers |
| Ash Gray | `#b7b9be` | Disabled borders, subtle list separators, card shadow tints |
| Taxicab Yellow | `#fca700` | Sporadic CTA alternative (event registration), decorative fill in geometric confetti, accent punctuation in dark banners |
| Lavender Wash | `#eed7fc` | Soft purple section backgrounds, highlight bands, decorative geometric fills |
| Confetti Gradient | `conic-gradient(rgb(191, 99, 243) 170deg, rgb(252, 167, 0) 171deg, rgb(252, 167, 0) 230deg, rgb(77, 140, 237) 231deg, rgb(77, 140, 237) 360deg)` | Decorative geometric borders around video and hero blocks — conic gradient sweeps violet → yellow → blue |

## Typography

### Charlie Display — Editorial headlines, hero text, section titles — scales from 24px sub-headings to 80px display. Weight 400-500 creates a humanist warmth uncommon in enterprise tools; letter-spacing tightens to 0.012em at large sizes for optical correction.
- **Substitute:** Manrope
- **Weights:** 400, 500, 700, 800
- **Sizes:** 14, 24, 28, 32, 40, 44, 48, 70, 80
- **Line height:** 1.00, 1.10, 1.14, 1.17, 1.19, 1.20, 1.25, 1.43
- **Letter spacing:** 0.0120em at 40px+; 0.0300em at small display sizes

### Charlie Text — Body copy, UI labels, navigation, button text, input fields, footer text. Weight 400 for body, 500 for emphasized labels, 700 reserved for inline strong elements. Tight line-heights (1.20-1.25) at UI sizes maximize information density without feeling cramped.
- **Substitute:** Inter
- **Weights:** 400, 500, 700
- **Sizes:** 13, 14, 16, 20, 24
- **Line height:** 1.20, 1.25, 1.29, 1.40, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.29 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.25 | — |
| heading | — | — | 32px | 1.2 | — |
| heading-lg | — | — | 48px | 1.14 | — |
| display | — | — | 80px | 1 | 0.012px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 2px
- **tags:** 10000px
- **cards:** 20px
- **images:** 5px
- **inputs:** 8px
- **buttons:** 28px

## Components

### Primary Action Button
**Role:** High-emphasis CTA — registration, get started, primary conversions

Filled #1868db background, #ffffff text in Charlie Text 16px weight 500. Pill radius of 28px (or 10000px for full pill). Padding 10px 22px. No border. Sits flat with zero shadow — the color does the work.

### Secondary Action Button
**Role:** Tertiary CTA — learn more, see agenda, navigation onward

Transparent background, #101214 or #ffffff text (inverts on dark), Charlie Text 16px weight 500. Optional thin underline on hover. Sits beside primary actions as a text-link counterpart.

### Ghost Button
**Role:** Low-emphasis interactive — filter chips, toggle controls

Border 1px #101214 or #ffffff, transparent fill, same text spec as primary. Pill radius.

### Dark Hero Banner
**Role:** Top-of-page event/campaign promotion

Full-width #101214 background, framed on left/right by jagged geometric color shapes (violet #bf63f3, yellow #fca700, blue #1868db, green confetti). Charlie Display 80px weight 400-500 headline in white, left-aligned with supporting body in #ffffff at 16px. Primary button in vivid yellow (#fca700) for contrast against dark — the only place the yellow CTA appears.

### Product Screenshot Card
**Role:** Embedded product UI showcase (Jira board, Confluence, etc.)

Screenshot image placed on solid #1868db blue background, offset/tilted slightly. Image has ~5px radius corners. Functions as a showcase layer between white content sections. Zero border, zero shadow — the blue background IS the frame.

### Video Player Block
**Role:** Embedded video content with brand frame

16:9 video container, thumbnail darkened to ~60% opacity, centered white play button (circle, ~64px). Surrounded by asymmetric geometric color shapes in violet/yellow/blue/green that break the rectangular frame — signature editorial device.

### Lavender Feature Band
**Role:** Editorial section divider with content

Full-width #eed7fc background, centered Charlie Display heading 32-40px weight 400 in #101214, body copy in #101214 at 16px. No card containers — text floats on the tinted surface. Breaks visual rhythm between white sections.

### Inverted Dark Section
**Role:** Product collection or feature highlight block

#101214 background spanning full width, left half holds white text content (heading + body), right half holds colorful illustration or product visual. Charlie Display 40-48px weight 500 headline, Charlie Text 16px body.

### Top Navigation Bar
**Role:** Primary site navigation

Sticky white bar, #ffffff background, bottom border 1px #f0f1f2 or 2px hairline. Atlassian wordmark + blue triangle logo at left. Menu items in Charlie Text 14px weight 400 #101214, dropdowns revealed on hover. Sign in link right-aligned in #1868db. Height ~56px.

### Centered Editorial Headline
**Role:** Section opener for marketing pages

Centered Charlie Display 40-48px weight 500 in #101214, with a yellow hand-drawn underline scribble beneath key words (signature editorial flourish). Subhead in Charlie Text 16px #42526, max-width 600px centered.

### Info Badge
**Role:** Metadata tags, status indicators, category labels

Pill shape (10000px radius), small padding 4-6px horizontal, Charlie Text 13px weight 500. Uses #42526 text on #f0f1f2 background, or #1868db text on #e9f2fe for brand-tinted variants.

### Card Container
**Role:** Generic content card — features, blog posts, resource tiles

#ffffff background, 20px border radius, 24px internal padding, minimal border (1px #f0f1f2) or the navy-tinted micro-shadow. No drop shadow at scale — the radius and whitespace do the lifting.

## Do's and Don'ts

### Do
- Use #1868db for every primary action button, link, and focus state — it is the only chromatic action color in the system
- Set card radius to 20px and button radius to 28px (or 10000px for full pill) — flatness is the point
- Pair Charlie Display weight 400-500 with Charlie Text weight 400-500; reserve weight 700+ for inline emphasis only
- Frame dark hero panels with geometric confetti shapes in violet (#bf63f3), yellow (#fca700), blue (#1868db), and green — never use these colors as fills inside functional UI
- Use #eed7fc lavender for editorial section dividers between white blocks; never use it for buttons or interactive elements
- Reach for the navy-tinted shadow stack (rgba(9, 30, 66, ...)) when any elevation is needed — never use neutral black shadows
- Set headlines at 40-80px with tightened 0.012em letter-spacing; body at 16px with 1.50 line-height for generous reading rhythm

### Don't
- Don't introduce additional accent colors for UI — yellow, violet, and green are decorative-only and must never appear on buttons, links, or form controls
- Don't use heavy drop shadows or elevation stacks — the system is deliberately flat; depth comes from color inversion and radius alone
- Don't use sharp corners on cards or images — always apply 20px radius to cards and at least 5px to images
- Don't mix the two font families' weights arbitrarily — Charlie Text handles UI (13-24px), Charlie Display handles editorial (24-80px)
- Don't use black (#000000) as a background or large fill — it appears only as text and border ink; dark panels use #101214
- Don't place white text on lavender or blue — contrast pairs are dark-on-light or white-on-navy only
- Don't tile or repeat the confetti gradient — it is a single decorative frame device, not a pattern or texture

## Elevation

- **Feature card:** `rgba(9, 30, 66, 0.31) 0px 0px 1px 0px, rgba(9, 30, 66, 0.25) 0px 1px 1px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background for content sections
- **Soft Surface** (`#f0f1f2`) — Muted buttons, subtle section bands, low-emphasis fills
- **Tinted Surface** (`#e9f2fe`) — Blue-tinted highlight wash, feature card backgrounds
- **Lavender Band** (`#eed7fc`) — Editorial accent sections, decorative dividers
- **Dark Panel** (`#101214`) — Hero banners, product feature blocks, inverted sections

## Imagery

Imagery is split into two distinct registers. Functional: product screenshots (Jira boards, Confluence pages) shown raw on solid color backgrounds, slightly tilted for energy. Editorial: colorful flat geometric shapes — torn rectangles, angled bars, confetti fragments — in a fixed palette of vivid violet, taxicab yellow, electric blue, and leaf green that frame hero banners and video blocks. No photography, no 3D renders, no lifestyle imagery. Illustrations (when present, e.g. in the Teamwork Collection block) are flat, brand-colored, and character-driven — stylized human figures in solid fills. The visual energy comes entirely from these geometric color fragments, not from photographic content.

## Layout

Full-width bands of alternating white and lavender (#eed7fc) sections, with occasional full-bleed dark navy (#101214) panels that break the rhythm. Content is max-width 1200px centered within each band. Hero is a full-bleed dark panel with left-aligned text and right-side promotional card, framed by geometric confetti bleeding off-page edges. Below the hero, sections alternate between centered editorial headlines with single CTAs, and two-column layouts (text-left/visual-right or visual-left/text-right) for product features. Product showcases use tilted screenshots on solid blue (#1868db) backgrounds as transitional elements. Navigation is a single sticky top bar with dropdown mega-menus. Vertical rhythm: 64-80px between major sections, 24-40px within. The page breathes generously but information density stays high in product blocks.

## Similar Brands

- **Notion** — Similar light-canvas SaaS aesthetic with generous whitespace, single accent color, and large editorial headlines paired with product screenshots
- **Linear** — Shared disciplined single-accent-color system with custom sans typography, dark hero panels, and minimal shadow philosophy
- **Figma** — Similar use of colorful geometric shapes as editorial decoration around dark sections, paired with clean white product showcases
- **GitHub** — Enterprise developer-tool sensibility with custom sans pairing, dark navigation panels, and functional monochrome product surfaces
- **Slack** — Close companion brand using the same Atlassian design DNA — vivid accent color, custom humanist sans, flat rounded components, minimal shadows
