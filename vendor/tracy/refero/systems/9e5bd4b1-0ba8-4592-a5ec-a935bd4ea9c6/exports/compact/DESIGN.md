# Umbrel — Style Reference
> warm hearth inside a midnight server room — a black room where a single peach glow marks what matters.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Umbrel reads as a premium consumer-hardware brand rendered in near-total darkness: a black canvas, white sans-serif type, and a single warm peach accent that glows like an ember in the void. The floating glass-pill navigation, oversized product photography on dark stone, and pill-shaped ghost buttons all signal a hardware-first identity that borrows from the language of high-end consumer electronics. Color is rationed: ninety-eight percent of the interface is monochrome, with the warm accent used only for emotionally loaded words like 'home' and a cool violet reserved for purchase actions. Cards float on near-black surfaces with large, soft radii; gradients appear only as atmospheric backdrops or as vibrant app-store tiles, never as interface chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, hero backgrounds, section bands, image mattes — the absolute black that swallows the viewport and lets the product photography and peach accent feel lit |
| Graphite | `#191919` | Supporting neutral for secondary UI, dividers, and muted labels. |
| Charcoal | `#3d3d3d` | Secondary surface tone for button hover states, tertiary card layers, and the borders that separate a card from canvas |
| Warm Smoke | `#61635d` | Desaturated warm-gray for divider lines, muted metadata, and the border tone that gives the dark UI a slight olive cast rather than going cold blue |
| Shadow | `#292929` | Inset fills, shadow tones beneath floating elements, and the inner depth on product showcase cards |
| Paper White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Fog | `#cccccc` | Secondary text, subheadings under large titles, and icon strokes that need to recede from primary content |
| Ash | `#9e9e9e` | Tertiary helper text, caption metadata, and placeholder labels in inputs |
| Steel Lilac | `#797985` | Muted body copy and the cool-tinted gray used for sub-labels and pricing context — the only neutra with a cool cast, used sparingly |
| Ember Peach | `#e3a081` | Orange supporting accent for decorative details and low-frequency emphasis. |
| Twilight Violet | `#5351f3` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| App Store — Blue Gold | `linear-gradient(-26deg, rgba(0, 86, 255, 0.29) 0%, rgb(194, 142, 1) 100%)` | Terminal stop of the blue-to-gold linear gradient on app-store and feature cards |
| App Store — Violet Ember | `linear-gradient(-26deg, rgba(133, 93, 255, 0.27) 0%, rgb(254, 121, 0) 100%)` | Terminal stop of the violet-to-orange linear gradient on rotating feature tiles |
| App Store — Crimson | `linear-gradient(-26deg, rgb(89, 16, 16) 0%, rgba(69, 0, 16, 0.46) 22.631%, rgba(255, 59, 59, 0.5) 100%)` | Terminal stop of the deep-red feature tile gradient used on the OpenClaw card |
| Deep Space | `radial-gradient(100% 147.839% at 0px 0%, rgb(6, 87, 161) 0%, rgb(5, 30, 34) 36.2271%, rgba(3, 29, 60, 0.97) 72.4655%, rgba(30, 83, 161, 0.93) 84.8958%, rgb(53, 90, 163) 100%)` | Atmospheric radial gradient base for the closing app-store section — a near-black blue-violet that signals the transition into the app ecosystem |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400, 500
- **Sizes:** 12px
- **Line height:** 1.2

### Inter — The whole voice of the interface — headings, body, buttons, nav. Tight negative tracking at every size (-0.01em at 14px scaling to -0.03em at 48px) is a signature move that makes Inter feel custom-cut rather than system. The alt glyphs 'blwf', 'cv03', 'cv04', 'cv09', 'cv11' are explicitly set, choosing the single-storey 'a' and the curly 'l' that give the brand its distinct letterforms.
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 20px, 23px, 24px, 27px, 32px, 36px, 48px
- **Line height:** 1.10, 1.20, 1.24, 1.30, 1.40
- **Letter spacing:** -0.01em at 14px, scaling linearly to -0.03em at 48px
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Inter Display — Hero product-name headings like 'Umbrel Pro' — a heavier cut at 43px with -0.02em tracking that lands the name as a logo-mark rather than a sentence. Use only for the largest product titles on dark backgrounds.
- **Substitute:** Inter at 600
- **Weights:** 600
- **Sizes:** 43px
- **Line height:** 1.20
- **Letter spacing:** -0.02em

### Inter Tight — Tighter-metrics variant for compact nav links and small labels where Inter's default width feels too airy at 12px
- **Substitute:** Inter at 500, 12px
- **Weights:** 500
- **Sizes:** 12px
- **Line height:** 1.20
- **Letter spacing:** normal

### System Sans — Unstyled fallback stack for the dense body of legacy or dynamic content where loading the webfont is unnecessary — do not use for headings or branded surfaces
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400, 500
- **Sizes:** 
- **Line height:** 1.20

### Manrope — Manrope — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 13px
- **Line height:** 1.2
- **Letter spacing:** -0.01

### Inter Regular — Inter Regular — detected in extracted data but not described by AI
- **Weights:** 400, 600
- **Sizes:** 16px
- **Line height:** 1.4

### Roboto Condensed — Roboto Condensed — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.24
- **Letter spacing:** -0.01

### Inter Variable — Inter Variable — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.3
- **Letter spacing:** -0.03

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body | — | — | 16px | 1.4 | 0px |
| subheading | — | — | 18px | 1.3 | -0.54px |
| heading-sm | — | — | 20px | 1.3 | -0.6px |
| heading | — | — | 27px | 1.24 | -0.81px |
| heading-lg | — | — | 36px | 1.2 | -1.08px |
| display | — | — | 48px | 1.1 | -1.44px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 40px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **cards:** 16px
- **icons:** 5px
- **pills:** 99px
- **images:** 12px
- **inputs:** 24px
- **buttons:** 24px

## Components

### Floating Navigation Pill
**Role:** Primary site navigation

Horizontal pill centered at the top of the viewport, Graphite (#191919) fill with a soft warm-brown shadow. Logo mark on the left, text links in Paper White at 12px Inter 500, locale flag on the right. Full pill radius 99px, sits ~16px from the top edge and follows the user on scroll.

### Hero Headline
**Role:** First-screen brand statement

Centered display type, 48px Inter 600, -0.03em tracking, Paper White with the closing word colored Ember Peach. Subtext in Fog (#cccccc) at 18px Inter 400, max-width ~560px, center-aligned. No background image, no decoration — pure type on Void.

### Filled White CTA
**Role:** Primary conversion action

Paper White fill, Void text, Inter 500 at 13px, 24px corner radius (pill), 10px vertical × 20px horizontal padding. Used for 'Order now' on product hero blocks. No shadow — the white-on-black contrast is the only emphasis needed.

### Ghost Outline Button
**Role:** Secondary action

Transparent fill, 1px Paper White border at 80% opacity, Paper White text, 24px corner radius, same 10×20 padding as the filled variant. Paired with the filled CTA as the secondary action in a button group.

### Violet Purchase Button
**Role:** Direct buy action on product cards

Twilight Violet (#5351f3) fill, Paper White text, Inter 500 at 13px, 24px radius, 10×20 padding. The only saturated cool fill in the system, used exclusively for 'Buy now' on Umbrel Home and similar commerce moments.

### Feature Icon Row
**Role:** Three-up benefit cluster below hero

Three equally-spaced columns on a single row, each with a small app-icon tile (rounded 12px square, app-color gradient fill) above a two-line label. Label is Fog at 14px Inter 400 with bold key terms in Paper White. Column gap 40px, centered within 1200px page width.

### Product Showcase Section
**Role:** Hero block for a single product

Two-column split — left column holds a 'NEW' pill badge (Graphite fill, 99px radius, 12px Inter 500, Ember Peach text), the product name at 43px Inter Display 600, two short benefit lines in Fog at 16px, and pricing in Paper White. Right column carries a large product photo with a 12px radius, negative-offset shadow, bleeding into a dark stone texture background.

### Product Card — Handheld
**Role:** Product lineup tile, light variant

Void background, no border. Center-aligned photograph of the product in a hand (rounded 12px), product name in Paper White at 27px Inter 600, one-line description in Fog at 14px, price in Paper White 14px Inter 500, then a button group of one filled violet + one ghost.

### Product Card — OS / Software
**Role:** Software product tile

Void background, no border. Photograph of two devices (tablet + phone) at 12px radius. Product name 'umbrelOS' in lower-case Paper White 27px Inter 600 — the only product that breaks the capitalization convention, signaling it as a platform rather than a device. Single ghost 'Learn more' button, no filled CTA.

### App Store Feature Tile
**Role:** Rotating app-highlight carousel card

Rounded 16px card with a full-bleed -26° linear gradient background. Heading at 20px Inter 600 Paper White top-left, descriptive copy in Fog at 14px, and a UI screenshot or photo inset at the bottom with 12px radius. Three variants ship: blue→gold (media), violet→orange (productivity), crimson (AI).

### App Store Closing Banner
**Role:** Call to action for the app store

Full-width section on the Deep Space radial gradient (near-black with a faint blue rim), centered headline in Paper White 32px Inter 600 with the words 'app store' in Twilight Violet — the only place a second chromatic color joins the peach, creating a hierarchy: peach for home, violet for software.

### Spec Strip Card
**Role:** Small two-line benefit callout

Compact Graphite card, 16px radius, 24px padding. Two-line text block: line one is the benefit in Paper White 18px Inter 500, line two is the descriptor in Fog 14px. Sits at the bottom of the Umbrel Home section as a four-up grid.

### Chat Widget Button
**Role:** Persistent floating support button

32px-radius circle pinned to the bottom-right of the viewport, Twilight Violet fill, Paper White chat-bubble icon. Stays fixed across scroll, offers a single tap to open support.

## Do's and Don'ts

### Do
- Use #000000 as the only page background — never introduce off-black, blue-tinted, or warm-tinted canvas colors; the absolute black is the point.
- Reserve #e3a081 Ember Peach for emotionally loaded words in headlines (always the closing noun, never the verb) and for the 'NEW' badge text; never use it as a button fill or a border color.
- Use #5351f3 Twilight Violet only as a filled button background for direct purchase actions; never use it for text, borders, or non-commerce UI.
- Set Inter's font-feature-settings to 'blwf', 'cv03', 'cv04', 'cv09', 'cv11' on every text node — the single-storey 'a' and the curly 'l' are part of the brand voice, not a stylistic choice you can toggle.
- Apply negative letter-spacing on every size above 16px: -0.01em at 14px, -0.02em at 20px, -0.03em at 48px. Body text at 16px and below stays at normal tracking.
- Use 24px corner radius on every button, input, and pill — the pill shape is a brand signature, not a generic 'rounded' choice. 99px only for fully circular elements like badges and the nav pill.
- Offset shadows negatively (-12px on x and y) on hero product photography so the shadow falls upward and to the left, giving the dark scene a 'lit from the product' quality.

### Don't
- Don't introduce a third accent color — the system is bichromatic by design (warm peach for narrative, cool violet for commerce); any additional hue breaks the rationing.
- Don't use blue-tinted or cool gray neutrals as a replacement for the warm grays (#61635d, #797985) — the slight olive cast in the grays is what keeps the black interface from feeling clinical.
- Don't apply gradients to text, buttons, or default cards — gradients are reserved for the app-store tile system and the closing atmospheric banner only.
- Don't use capital-case for 'umbrelOS' — the product-platform name is deliberately lower-case to signal it as a platform rather than a device, paralleling conventions like 'macOS' or 'webOS'.
- Don't add visible borders to product cards on the Void background — the contrast between image and canvas is the only delineation needed; a border would make the design feel cluttered.
- Don't use shadows in pure black at high opacity — the two shadow recipes (rgba(0,0,0,0.24) and rgba(104,65,13,0.23)) are deliberately soft and the warm-brown one ties the shadow to the brand accent.
- Don't add icons inside buttons or use iconography in the navigation beyond the locale flag and a small logo mark — the interface relies on typography, not symbols, to carry hierarchy.

## Elevation

- **Product hero image:** `rgba(0, 0, 0, 0.24) -12px -12px 32px 0px`
- **Floating product card:** `rgba(104, 65, 13, 0.23) 0px 10px 20px 0px`

## Surfaces

- **Void** (`#000000`) — Full-viewport page canvas, hero backgrounds, image mattes
- **Graphite** (`#191919`) — Product cards, navigation pill, badges, elevated containers
- **Charcoal** (`#3d3d3d`) — Button hover, active states, inner card layers
- **Warm Smoke** (`#61635d`) — Dividers, muted metadata strips, tertiary chrome

## Imagery

Photography is product-led and dark: tight crops of the Umbrel hardware on near-black backgrounds, often with the product sitting on a dark stone or concrete surface that picks up faint ambient light. The signature shot is a hand holding the Umbrel Home — a literal, human-scale framing that contrasts with the otherwise abstract, server-room mood. Product photos use a soft negative-offset shadow rather than a hard box shadow, making the object feel lit by an off-camera key light. Beyond product photography, the only other imagery is software UI screenshots (tablet + phone displaying the umbrelOS interface) shown at small scale inside the product cards. No lifestyle photography, no people, no environments — the device is always the hero. Illustration is absent; the brand communicates entirely through type, product photo, and the three app-store gradient tiles that close the page.

## Layout

Every page is a single dark vertical scroll with no light-mode bands or alternating section colors — the only break from pure black is the closing app-store banner with its Deep Space radial gradient. The page max-width is 1200px centered, and most sections use a two-column split (text-left, image-right or image-left, text-right) rather than a centered stack. The hero is the exception: fully centered type with a three-icon row beneath. Feature blocks are three-column grids with 40px column gaps, product cards alternate between hand-held and software-OS framings in the same row, and the app-store carousel uses full-width edge-to-edge gradient tiles that bleed to the viewport edge. Vertical rhythm is tight — 40–48px between major sections, 10px between elements within a block — and the floating navigation pill (99px radius, centered) remains fixed at the top throughout. The chat widget sits in the bottom-right at 32px radius, overlapping content edges without reservation. Spacing breathes through large product photography, not through whitespace padding.

## Similar Brands

- **Framework Laptop** — Same dark-canvas hardware product page, large centered product photography on near-black, pill-shaped ghost buttons, and a single restrained accent color (Framework uses orange where Umbrel uses peach)
- **Nothing.tech** — Same monochrome-first product page with one warm accent, floating dark-pill navigation, and oversized product photography that bleeds to the canvas edge
- **Apple AirPods Max** — Same premium consumer-hardware treatment: dark backgrounds, hero product shot with a warm-toned shadow, product name as a display-type logo, single primary CTA
- **Vercel** — Same near-total-black interface, Inter typography with negative tracking, and pill-shaped navigation that floats above content
- **Tailscale** — Same dense, dark, devtools-meets-consumer-product aesthetic with bichromatic accent rationing and tight 16–24px card radii
