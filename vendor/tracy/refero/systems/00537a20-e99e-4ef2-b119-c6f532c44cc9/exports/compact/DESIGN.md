# Gsap — Style Reference
> animated chalkboard in a design studio. A near-black wall, warm cream chalk, and five color-coded highlighters — one for each animation discipline.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

GSAP is a dark-canvas design language built for a motion library: a near-black stage where massive cream type, thin outlined pill buttons, and individually color-coded category labels create a typographic showcase rather than a traditional marketing site. The system runs on a single warm cream surface color (#fffce1) against an almost-black background, with category words each wearing their own vivid hue (green for the brand mark, orange for SVG, pink for Scroll, violet for Text, blue for UI) — color functions as taxonomy, not decoration. Typography is the hero: a single sans-serif (Mori) at six weights, pushing to 224px for the main headline with aggressive negative tracking and near-1.0 line-height, so words feel carved rather than laid out. Buttons are almost exclusively ghost-pills with 100px radius and hairline cream borders; there are no filled CTAs, which lets the gradient hero flourish and keeps every interactive element weightless.

## Colors

| Name | Value | Role |
|------|-------|------|
| Just Black | `#0e100f` | Page canvas, footer surface, deep section backgrounds |
| Surface Cream | `#fffce1` | Primary text, outlined button borders, nav links, card text, the default surface-light used for ghost controls and headings |
| Surface 50 | `#7c7c6f` | Muted secondary text, icon fills at rest, subhead annotations, disabled-state labels |
| Surface 25 | `#42433d` | Hairline borders, dividers, low-contrast outlines against the black canvas |
| Off Black | `#191919` | Alternative dark surface for nested panels and code blocks |
| Shockingly Green | `linear-gradient(114.41deg, #0ae448 20.74%, #abff84 65.5%)` | Green text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Light Green | `#abff84` | Green text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Orangey | `#ff8709` | SVG category label, orange-tool icon fills, gradient endpoint in Orange Crush |
| Pink | `#fec5fb` | Scroll category label, decorative splashes, gradient endpoint in Summer Fair |
| Lilac | `#9d95ff` | Text category label, thin illustrative strokes, gradient endpoint in Purple Haze |
| Blue | `#00bae2` | UI category label, gradient endpoint in Skyfall and Emerald City |
| Core Green | `#dfffd1` | Subtle brand-tinted background washes for feature cards tied to the GSAP core |
| Lipstick Pink | `#f100cb` | Deep gradient stop for expressive decorative gradients, not used for text or UI |

## Typography

### Mori — Single-family system. Mori weight 600 at 224px with lh 0.9 and -0.02em tracking is the hero display; the same family at weight 400 body sizes carries every paragraph, label, and nav item. The custom face carries a slightly humanist warmth in the cream rendering that a geometric grotesque (Inter, Manrope) cannot replicate, so substitute with a humanist sans (e.g. Inter Tight or Söhne) and accept a tighter, colder fallback.
- **Substitute:** Inter Tight, Söhne, or DM Sans
- **Weights:** 400, 600
- **Sizes:** 14px, 16px, 17px, 18px, 19px, 20px, 21px, 23px, 24px, 32px, 33px, 34px, 40px, 44px, 66px, 76px, 89px, 101px, 224px
- **Line height:** 0.90–1.40
- **Letter spacing:** -0.02em at 224px display, -0.011em at 101px and below for headings, -0.01em for body and UI

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.4 | -0.14px |
| body-sm | — | — | 16px | 1.15 | 0px |
| body | — | — | 19px | 1.15 | 0px |
| body-lg | — | — | 23px | 1.38 | -0.23px |
| subheading | — | — | 34px | 1.2 | -0.34px |
| heading-sm | — | — | 44px | 1.2 | -0.44px |
| heading | — | — | 66px | 1.2 | -0.66px |
| heading-lg | — | — | 101px | 1 | -1.11px |
| display | — | — | 224px | 0.9 | -4.48px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **pills:** 9999px
- **buttons:** 100px
- **smallTags:** 8px

## Components

### Outlined Cream Pill Button
**Role:** Default interactive control — navigation entry points, secondary actions, explore links

Transparent background, #fffce1 text and 1px cream border, 100px border-radius, 15px vertical and 24px horizontal padding, Mori 18px weight 600 lh 1.05. Used for 'Tools', 'Explore Scroll', 'Explore SVG', 'Explore Text', 'Explore UI', 'Explore All Showcases'. The 100px radius plus thin border gives a high-tech, minimal-control feel; never fill these with color.

### Ghost Nav Link
**Role:** Top navigation items, footer text links

No background, no border, #fffce1 or #7c7c6f text at 16px Mori 400 lh 1.15. Underline on hover via color shift to #fffce1. Nav row gap 6px, vertical padding 10px. Group spacing tight (6–16px) to keep the nav bar compact and editorial.

### Gradient-Stroked CTA Pill
**Role:** Primary download action — the 'Get GSAP' call-to-action

Ghost button (transparent fill) with a 1.5–2px gradient border from #0ae448 to #abff84 along 114.41deg, cream text, 100px radius, 15px/24px padding. Implemented via the --color-core-button-gradient token on the border or as a border-image. This is the only chromatic control in the system; it carries the brand green and reads as 'actionable' without violating the outlined-only rule.

### Borderless Icon Button
**Role:** Close, menu, utility toggle in the nav row

Fully round (50% radius), no background, cream icon, 0px padding. Used sparingly for icon-only controls like the mobile menu trigger.

### Category Color Label
**Role:** Naming convention for each animation discipline — Scroll, SVG, Text, UI

Mori 19–24px weight 400, single-word, rendered in a discipline-specific hue: Scroll #fec5fb, SVG #ff8709, Text #9d95ff, UI #00bae2, GSAP #0ae448, Other #abff84. Functions as the visual anchor for each section and appears as both a heading label and a nav item in the same hue. The color-to-discipline mapping is the site's signature taxonomy.

### Announcement Banner
**Role:** Top-of-page site-wide notice (e.g. 'GSAP is now free')

Full-bleed band, cream text on near-black, centered single line at 14px Mori 400. Optional inline link rendered in Shockingly Green #0ae448. Sits at 0–40px from the top of the viewport and never carries a background tint.

### Hero Display Headline
**Role:** The 224px 'Animate Anything' statement on the landing hero

Mori weight 600, 224px, line-height 0.9, letter-spacing -0.02em (-4.48px), color #fffce1. The headline wraps across two lines and is allowed to bleed into the viewport edge; no max-width container. Decorative organic splashes (pinks, oranges, greens) overlap the type rather than sitting beside it.

### Curly-Bracket Annotation
**Role:** Section eyebrows: '{ Why GSAP® }', '{ GSAP® Tools }', footer taglines

Small 16–19px Mori 400 cream text wrapped in literal curly braces `{ }`. Functions as a typographic signature — every section is introduced by this bracket pair. No background, no border; the brackets are the visual system.

### Tool Feature Block
**Role:** Discipline sections (Scroll, SVG, Text, UI) — one per animation tool

Two-column row inside the Tools section: left side holds a large soft-rendered 3D-style shape in the tool's accent color (with internal gradient and ambient lighting); right side holds the category label in its hue, a 34–44px cream subhead, body copy at 23px, and an outlined cream pill 'Explore' button. Divided from the next block by a 1px #42433d hairline that spans the section width.

### 3D Organic Illustration
**Role:** Decorative hero and tool-section visual

Soft 3D shapes (pill, dome, liquid blob) rendered with multi-stop gradients — typically a tool's accent color graduating into a lighter tint (e.g. blue-to-pink for Scroll, orange-to-amber for SVG). No drop shadows on the canvas; the shapes are lit from within via gradient. Containment is loose; they overlap adjacent type rather than respecting a frame.

### Footer
**Role:** Closing navigation and legal block

Off-black #191919 background, 1px #42433d top divider, multi-column nav with cream links at 16px Mori 400, generous 60–80px vertical padding. Includes the GSAP wordmark, link columns, and social/secondary nav. The footer shifts one surface step lighter than the page, creating a subtle terminator.

### Showcase Card
**Role:** Grid item in the Showcase section

Near-black surface with 8px corner radius, cream heading at 24–33px, no visible border, and a contained 16:9 or 1:1 preview area. Sits in a 2–3 column grid with 24px gaps. Padding 24px on all sides; preview art overflows the card slightly to suggest motion.

## Do's and Don'ts

### Do
- Set body text and all primary UI in Mori weight 400 at 16–19px with line-height 1.15; this is the system's resting rhythm.
- Use the five-discipline color mapping (Green = GSAP, Orange = SVG, Pink = Scroll, Violet = Text, Blue = UI) for every category label — never reuse a color for a different discipline.
- Render every button as a 100px-radius ghost pill with a 1px cream border and #fffce1 text at Mori 600 18px; the only exception is the primary CTA, which uses a 1.5px green-to-light-green gradient stroke.
- Push the hero headline to 224px weight 600 with line-height 0.9 and -0.02em tracking; let it bleed to the viewport edge rather than centering it inside a max-width container.
- Introduce every section with a curly-bracket annotation in `{ }` at 16–19px Mori 400 — this bracket pair is the site's recurring signature.
- Place a 1px #42433d hairline divider between tool feature blocks, full section width, with no padding around it.

### Don't
- Don't add filled, solid-color CTA buttons — the system is outlined-only; the gradient-stroked pill is the maximum chromatic escalation allowed.
- Don't use pure white (#ffffff) for text or #000000 for the background — the warmth of #fffce1 cream and #0e100f off-black is what gives the system its character.
- Don't set body type below 14px or above 23px; the type scale is binary between editorial display (66–224px) and compact UI (14–23px).
- Don't introduce new category colors beyond the five-discipline palette; adding a sixth color dilutes the taxonomy that makes the system legible.
- Don't apply drop shadows to cards or illustrations — depth is communicated only through gradient washes and surface-step shifts, never via box-shadow.
- Don't break the cream-on-black pairing with reversed (cream background, black text) cards unless the design calls for a deliberate callout; the dark canvas should remain unbroken across the scroll.
- Don't use Inter, Roboto, or system sans defaults; the Mori humanist warmth is load-bearing, and a geometric substitute collapses the editorial tone.

## Elevation

- **Tool Feature Illustration:** `none — depth comes from internal multi-stop gradients, not box-shadow`
- **Showcase Card:** `none — separation is achieved with 8px radius and 24px gap, not elevation`
- **CTA Pill:** `none — the gradient border is the only 'lift' indicator`

## Surfaces

- **Canvas** (`#0e100f`) — Page background, all sections sit on this single dark stage
- **Nested Panel** (`#191919`) — Footer and code-block backgrounds, one step lifted from the canvas
- **Cream Surface** (`#fffce1`) — Light surface used sparingly for callout cards or promotional panels

## Imagery

Imagery is dominated by soft 3D-rendered organic shapes — pills, domes, liquid blobs, abstract splashes — rendered with multi-stop gradients in the discipline accent colors (e.g. pink-to-blue for Scroll, orange-to-amber for SVG). No photography of people or places appears. The shapes are loosely contained and intentionally overlap adjacent type to suggest motion, which aligns with the product's purpose. Icons in the nav are monochrome cream and stroked at roughly 1.5px. Backgrounds are always the flat dark canvas; visual richness comes from foreground shapes and gradient typography, not from photographic content.

## Layout

The page is full-bleed against a single dark canvas, with content generally respecting a ~1280px max-width and generous 80–120px section gaps. The hero is intentionally edge-bleeding: a 224px headline wraps across two lines, decorative 3D shapes overlap the type, and a curly-bracket annotation plus a single outlined CTA sit in the lower third. Subsequent sections follow a repeating pattern: a curly-bracket eyebrow, then either a centered two-to-three-line headline or a two-column row (large organic illustration left, category label + subhead + body + pill button right). Sections are separated by 1px #42433d hairlines that span the full content width. The Tools section stacks four such two-column blocks vertically. The Showcase section introduces a 2–3 column card grid with 24px gaps. Navigation is a single top bar with tight 6–16px link spacing, cream 16px Mori 400 text, and the wordmark on the far left. The footer shifts to a slightly lighter #191916 surface with multi-column link lists and 60–80px vertical padding.

## Similar Brands

- **Framer** — Same single-dark-canvas treatment with massive display headlines and outlined ghost controls; both lean on typographic scale rather than color to create hierarchy.
- **Linear** — Dark UI with a single chromatic accent reserved for the primary action, and category-level color coding for navigation items.
- **Vercel** — Near-black canvas, cream/off-white type, hairline section dividers, and an outlined-only button system that never uses solid fills.
- **Webflow** — Shares the editorial-display headline scale (100–200px) and the warm cream-on-dark palette, plus the sponsor-bys relationship GSAP has with Webflow.
- **Spline** — Both feature soft 3D organic shapes as primary imagery, rendered with internal multi-stop gradients that simulate ambient lighting rather than drop shadows.
