# Pixso — Style Reference
> pristine designer's canvas flooded with morning light

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Pixso's marketing surface is a near-monochrome gallery: a warm-white canvas, hairline borders, and black headline type let the colorful product work and design kit thumbnails do the visual talking. Figtree carries the entire voice in a wide weight range — whispers at 400, confident at 600, and a wall of presence at 700 for the hero statement. The only chromatic punctuation is a single pale-blue wash and a purple-to-blue logo gradient; everything else earns its color by showing real product, not decoration. Components sit flat with very soft shadows and modest radii, so the page feels like a designer's tool laid out on a marble desk — the tools are quiet, the work is loud.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, heading type, dark icons, and the strongest foreground layer |
| Carbon | `#121212` | Filled primary buttons, active nav state, dark surface fill |
| Graphite | `#333333` | Secondary headings, button labels on light surfaces, heavy icon strokes |
| Slate | `#666666` | Body secondary text, helper copy, muted metadata |
| Ash | `#808080` | Tertiary text, disabled states, placeholder copy, subtle borders |
| Fog | `#999999` | Inactive icons, low-emphasis dividers, shadow tinting |
| Pebble | `#8b8c8f` | Icon strokes on neutral surfaces, muted glyph color |
| Smoke | `#4d4d4d` | Heavy body text where Obsidian feels too sharp, small caption emphasis |
| Charcoal Veil | `#3d3d3d` | Navigation bar text and borders — the dark nav strip registers as a separate layer |
| Dusk | `#292929` | Deep surface fill for elevated dark blocks and image overlays |
| Paper | `#faf8fd` | Page canvas — barely-there warm/lavender tint that separates the site from pure white |
| Bone | `#f9f9fa` | Card surfaces, secondary panels, subtle raised containers |
| Mist | `#eaebee` | Hairline borders, divider rules, button outlines, input borders |
| Ice Wash | `#cfe7ed` | Pale cool-blue background tint for highlighted cards and feature panels |
| Iris Sweep | `linear-gradient(88deg, #ee7cff 1.37%, #4e6fff 45.72%, #559cff 106.06%)` | Brand logo gradient midpoint — the wordmark's signature purple-to-blue sweep |
| Orchid Edge | `#ee7cff` | Brand logo gradient start — warm violet anchor of the wordmark sweep |
| Sky Drift | `#559cff` | Brand logo gradient end — cool blue terminus of the wordmark sweep |

## Typography

### Figtree — Single-family system: 700 carries the hero and section headlines at 48–60px with tight tracking, 600 handles subheadings and prominent labels at 24–34px, 500 covers button labels and emphasized body at 16–18px, 400 runs body and caption copy at 13–16px. The geometric, low-contrast character of Figtree keeps the all-black type from feeling oppressive.
- **Substitute:** Inter, DM Sans, Manrope
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 24px, 28px, 30px, 34px, 48px, 50px, 60px
- **Line height:** 1.10–1.61 (display tight at 1.10–1.17, body generous at 1.50–1.61)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body | — | — | 14px | 1.6 | — |
| body-lg | — | — | 16px | 1.55 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 24px | 1.3 | — |
| heading | — | — | 30px | 1.21 | — |
| heading-lg | — | — | 34px | 1.21 | — |
| display | — | — | 48px | 1.17 | — |
| display-lg | — | — | 60px | 1.1 | — |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **nav:** 8px
- **cards:** 8px
- **inputs:** 8px
- **buttons:** 12px
- **buttons-prominent:** 18px

## Components

### Filled Primary Button
**Role:** Main conversion action — the loudest UI element on the page

#121212 background, #ffffff text, Figtree 500 at 14–16px, 12px horizontal / 8px vertical padding, 12px radius. Whisper-soft shadow stack. White hover invert or subtle darken. Used for "Get started" and similar conversion moments.

### Outlined Secondary Button
**Role:** Companion action — same row, lower weight

Transparent background, 1px #eaebee border (darker on hover, ~#999999), #000000 text, Figtree 500, 12px radius, same padding as primary. The pairing of filled + outlined on the same row is the signature CTA pattern.

### Ghost Nav Link
**Role:** Top navigation items and in-content links

Transparent background, #3d3d3d text at 14px Figtree 500, no underline, 8px hover background wash. Dropdowns indicated by chevron, no decoration.

### Design Kit Card
**Role:** Gallery tile in the design kit grid (4-column layout)

#ffffff surface, 8px radius, full-bleed colorful product mockup image filling the card body, 16–20px padding below image for title block. Title in Figtree 600 at 16px Obsidian, category label in 13px Slate. No visible border, relies on the 1px shadow for separation from the Paper canvas.

### Product Showcase Frame
**Role:** Large framed mockup in the product section

#ffffff card containing device-frame mockups at full width, 18px radius on outer container, landscape gradient backdrop (#7cb86a green/grass) visible behind the cards. Internal UI cards use 12–18px radius.

### Floating Feature Card
**Role:** Callout card floating over hero or product imagery

#ffffff surface, 12–18px radius, soft drop shadow, small device thumbnail on the left (40–60px), title at Figtree 600 16px Obsidian, description at Figtree 400 13–14px Slate. Sits offset from its parent, creating the layered look.

### Top Navigation Bar
**Role:** Persistent site header

White/transparent background flush with the page canvas, no bottom border, 64–72px tall. Logo (colorful Iris Sweep gradient mark + Obsidian wordmark) on the left, horizontal nav items centered, "Log in" ghost link + filled "Get started" button on the right. 8px radius on the CTA button.

### Section Divider
**Role:** Vertical separation between content sections

No visible rule — sections are separated by ~80px of whitespace on the Paper canvas. Occasionally a 1px #eaebee hairline marks a transition.

### Decorative Icon Scatter
**Role:** Atmospheric floating icons in the hero margins

Small (24–40px) flat colorful icons positioned absolutely around the hero. Each rendered in a single brand-adjacent color (pinks, purples, blues, greens, oranges). No animation implied, but placement feels intentionally asymmetric — they exist to soften the otherwise empty white space.

## Do's and Don'ts

### Do
- Use Figtree for everything — no secondary font family, no system fallbacks in production output
- Let the page background be #faf8fd, never pure #ffffff, so cards visibly lift
- Pair a Filled Primary Button (Carbon #121212) with an Outlined Secondary Button (Mist border) in the same action row
- Reserve 8px radius for cards and nav, 12px for buttons, 18px only for prominent product frames
- Keep shadows to the signature two-layer stack: 1px hairline dark + 2–4px soft blur
- Use the Iris Sweep gradient only on the wordmark and brand-identity surfaces — never on buttons or functional UI
- Let product mockups and design kit thumbnails carry all the color; keep chrome grayscale

### Don't
- Don't introduce a chromatic CTA color — the primary action is always Carbon #121212
- Don't use heavy drop shadows or colored shadows; elevation must stay hairline
- Don't set body type below 13px or use Figtree below weight 400
- Don't add gradient backgrounds to UI surfaces; gradients belong to the logo and decorative imagery
- Don't center-align body paragraphs — the system uses left-aligned running text below the hero
- Don't use #0000ee or browser-default link blue for any interactive element
- Don't round buttons to pill (9999px); the system uses 8/12/18px radii only

## Elevation

- **Primary button:** `rgba(0, 0, 0, 0.04) 0px 2px 4px 0px, rgba(0, 0, 0, 0.3) 0px 0px 1px 0px`
- **Secondary outlined button:** `rgba(0, 0, 0, 0.1) 0px 1px 1px 0px, rgba(0, 0, 0, 0.4) 0px 0px 1px 0px`

## Surfaces

- **Canvas** (`#faf8fd`) — Page background — warm-white with a whisper of lavender so cards float above rather than blending in
- **Card** (`#ffffff`) — Elevated card surface for product mockup frames, design kit thumbnails, feature tiles
- **Panel** (`#f9f9fa`) — Subtle raised panels and secondary containers
- **Cool Wash** (`#cfe7ed`) — Soft cool-tinted highlight surface for featured callouts

## Imagery

Imagery is the only source of color in this system. The product showcase uses full-width landscape photography (green grass field with wildflowers) as a backdrop for floating device-frame mockups. The design kit gallery is a 4-column grid of vibrant product screenshots — Apple CarPlay, Material 3, HarmonyOS, iPadOS, 3D avatar sets, fitness apps, finance apps — each thumbnail a different vivid color story. The hero is decorated with small flat icons (24–40px) in pink, purple, blue, green, and orange scattered asymmetrically around the white space. No photography of people, no lifestyle imagery, no abstract 3D renders — it's all real product work presented as visual evidence. Icon style is flat, single-color, geometric, with a slight chunky quality that matches Figtree's character.

## Layout

Full-bleed page structure with a 1200px max-width content rail. The hero is centered: oversized headline (48–60px, Figtree 700, tight 1.10 line-height) over a 16–18px subtitle, then a horizontally paired button row, then a floating product card. Product showcase sections use a 4-up row of device-frame mockups over a landscape photo background, framed by a 1200px container. The design kit gallery is a strict 4-column grid with 20px gaps, equal-height cards. Navigation is a flat 64–72px top bar, transparent over the canvas, with the logo left, links center, and CTA right. Section rhythm is generous — 80px vertical gaps between major sections on the Paper canvas, with no alternating dark/light bands. Everything is left-aligned or center-aligned; there are no asymmetric or magazine-style compositions.

## Similar Brands

- **Figma** — Same near-monochrome marketing canvas with a single-color brand gradient, and design kit gallery rows of colorful product thumbnails doing the visual work
- **Framer** — Same quiet off-white page with oversized centered headlines, paired filled + outlined CTA buttons, and product mockups as the primary color source
- **Notion** — Same restrained neutral palette and hairline-border card aesthetic, letting user content and screenshots supply all the color
- **Linear** — Same single-family geometric sans (Figtree/Inter) carrying the entire voice and same near-black filled button as the only foreground accent
