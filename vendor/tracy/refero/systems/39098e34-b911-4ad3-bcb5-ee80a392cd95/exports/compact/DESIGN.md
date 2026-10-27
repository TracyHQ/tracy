# Clyde — Style Reference
> Vault showroom with a single spotlight — a near-black gallery where one warm gradient orb is the only color in the room.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Clyde treats product protection as luxury editorial: a near-black canvas dominates every section, warm cream (#f6f6f4) carries all text and hairline borders, and a single yellow-to-orange-to-purple gradient appears only inside 3D abstract shapes and product accents. Display headlines at 80–125px in Recoleta serif create magazine-cover scale, while Oldschool Grotesk at 300/400 handles all UI and body copy at a measured, compact rhythm. The palette is 99% achromatic — buttons are dark fills or cream-outlined pills, never chromatic, and surfaces separate through tonal contrast and hairline borders rather than shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Bone | `#f6f6f4` | Primary text on dark surfaces, hairline borders, light section backgrounds, ghost-button outlines, nav links — the warm cream that defines the entire light/dark polarity |
| Slate | `#7d7d7d` | Mid-gray surface accent, secondary UI fill, muted element backgrounds — sits between bone and obsidian for tonal layering |
| Paper | `#ffffff` | Inner product-image containers, pure-white card panels, maximum-contrast text — the brightest surface in the stack |
| Char | `#1a1a1a` | Near-black hairline borders, subtle dark surface differentiation from the true-black canvas |
| Solstice Gradient | `linear-gradient(90deg, #feed7a 0%, #ff8400 48.96%, #df91f7 100%)` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### Recoleta — All display and heading text from 36px to 125px. The single weight (400) and dramatic size range create an editorial magazine-cover scale. Line-height tightens to 1.00 at 80px+ for a luxurious, sculpted feel. Negative letter-spacing increases with size: -0.36px at 36px up to -3.75px at 125px.
- **Substitute:** GT Super, Canela, or Tiempos Headline
- **Weights:** 400
- **Sizes:** 36px, 47px, 61px, 80px, 125px
- **Line height:** 1.00–1.10
- **Letter spacing:** -0.36px at 36px, -0.94px at 47px, -1.22px at 61px, -2.4px at 80px, -3.75px at 125px
- **OpenType features:** `"clig" on, "liga" on`

### Oldschool Grotesk — All UI, body copy, sub-labels, button text, nav, and supporting content. Weight 300 for secondary descriptions adds quietness; weight 400 for primary body and interactive elements. The slightly negative tracking at body size tightens the grotesque to feel engineered rather than casual.
- **Substitute:** Söhne, Inter, or Neue Haas Grotesk
- **Weights:** 300, 400
- **Sizes:** 15px, 16px, 21px, 80px, 138px
- **Line height:** 1.30–1.60
- **Letter spacing:** 0.15px at 15px, -0.16px at 16px, -0.42px at 21px
- **OpenType features:** `"clig" on, "liga" on`

### Times (system fallback) — System-fallback serif for secondary annotations; rarely surfaces as the primary typeface when Recoleta is unavailable.
- **Substitute:** Times New Roman, Georgia
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.20–1.25
- **OpenType features:** `"clig" on, "liga" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 15px | 1.6 | 0.15px |
| body-lg | — | — | 21px | 1.3 | -0.42px |
| subheading | — | — | 36px | 1.1 | -0.36px |
| heading-sm | — | — | 47px | 1.1 | -0.94px |
| heading | — | — | 61px | 1.1 | -1.22px |
| heading-lg | — | — | 80px | 1 | -2.4px |
| display | — | — | 125px | 1 | -3.75px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 20px

### Border Radius

- **tags:** 100px
- **cards:** 16px
- **links:** 12px
- **inputs:** 4px
- **buttons:** 100px
- **large-panels:** 38px

## Components

### Announcement Bar
**Role:** Top-of-page promotional strip

Full-width #f6f6f4 bar with centered text. 12px vertical padding. Text in Oldschool Grotesk 15px weight 400, #000000. No border, no shadow — just a tonal band break at the top edge.

### Dark Navigation Header
**Role:** Primary site navigation

Transparent over dark canvas, logo centered (Clyde wordmark + 'by Cover Genius' lockup), nav links left-aligned (Product, Resources), Login + Demo pill right-aligned. No background fill, no bottom border — nav floats on the dark canvas. Text in Oldschool Grotesk 15px weight 400, #f6f6f4.

### Hero Display Section
**Role:** Above-the-fold brand statement

Full-bleed #000000 canvas with centered Recoleta serif headline at 80–125px, line-height 1.00, #f6f6f4. Floating 3D abstract shape (the Solstice Gradient blob) positioned below as the only chromatic element. Left-aligned supporting body copy in Oldschool Grotesk 16px weight 400, #f6f6f4 at ~50% width.

### Filled Pill Button
**Role:** Primary action (Request a Demo)

100px border-radius, solid #000000 fill, 20px 28px padding. Text in Oldschool Grotesk 15px weight 400, #f6f6f4. Used on light/bone surfaces. No shadow, no hover gradient — just tonal inversion.

### Ghost Pill Button
**Role:** Secondary action on dark surfaces

100px border-radius, 1px #f6f6f4 border, transparent fill, 20px 28px padding. Text in Oldschool Grotesk 15px weight 400, #f6f6f4. The default action style on dark hero and section backgrounds.

### Product Protection Card
**Role:** Feature illustration with product image

16px border-radius, #f6f6f4 background, 24px internal padding. Product image contained in an inner #ffffff container. Headline in Oldschool Grotesk 21px weight 400, #000000, uppercase or sentence case. Bulleted feature list in Oldschool Grotesk 15px weight 300 below.

### Program Performance Card
**Role:** Data visualization panel

16px border-radius, #f6f6f4 background, 44px horizontal padding. Tab/filter pills (Running Total, Month over month, Day over day) at top — 100px radius, small, with the active tab filled #7d7d7d or bordered. Chart area below uses a muted green/mint accent for data lines. Heading in Oldschool Grotesk 21px weight 400, uppercase, #000000.

### Stats Feature Bar
**Role:** Horizontal credibility row

Full-width horizontal strip with 4–5 items separated by hairline #f6f6f4 borders (1px). Each item: small circular check icon (#f6f6f4) + Oldschool Grotesk 15px weight 400 #f6f6f4 text. No card background, no elevation — items sit directly on the dark canvas.

### Case Study Card
**Role:** Client testimonial or proof point

16px border-radius, #1a1a1a or #000000 background, 24px padding. Client logo (square outlined box, 40–48px) top-left, body text in Oldschool Grotesk 16px weight 300, #f6f6f4, ghost pill CTA button at bottom. An inner product illustration fills the lower half with the Solstice Gradient on select elements.

### Filter Tab Pill
**Role:** Toggle/filter control within cards

100px border-radius, 10px 16px padding. Inactive: transparent with #000000 1px border. Active: #7d7d7d fill with #000000 text. Text in Oldschool Grotesk 14–15px weight 400.

### Section Heading Block
**Role:** Major content section title

Left-aligned Recoleta serif, 47–80px, #f6f6f4 on dark sections or #000000 on bone sections. Line-height 1.00–1.10. No eyebrow tag, no subtitle — the type IS the heading.

### Body Description Block
**Role:** Supporting paragraph copy

Max-width ~520px, Oldschool Grotesk 16px weight 300–400, #f6f6f4 at ~70% opacity on dark surfaces, #000000 on light surfaces. Line-height 1.40–1.60. No bullet styling, no special formatting — clean editorial paragraph.

## Do's and Don'ts

### Do
- Use Recoleta serif (weight 400) for all text 36px and above — never substitute a sans-serif for display sizes
- Apply increasingly negative letter-spacing as type scales: -0.36px at 36px up to -3.75px at 125px
- Use 100px border-radius for every interactive element — buttons, tags, filter pills, and tab controls
- Keep the palette 99% achromatic; the Solstice Gradient is the only chromatic element and belongs exclusively in 3D decorative shapes
- Define surface separation with 1px #f6f6f4 or #1a1a1a hairline borders — never use box-shadows for elevation
- Set display headlines at line-height 1.00 to create the tight, editorial vertical rhythm that defines the brand
- Use Oldschool Grotesk weight 300 for descriptive body copy and weight 400 for primary body and interactive text

### Don't
- Do not introduce any new chromatic color to the UI — the gradient is the only color permitted
- Do not use Recoleta for body text below 36px — Oldschool Grotesk handles everything at UI scale
- Do not use box-shadows for card elevation; the system is intentionally flat with border-based separation
- Do not apply the Solstice Gradient as a button fill, text color, border, or UI surface — it is decorative only
- Do not use letter-spacing of 0 or positive values on display sizes — large type must always be tightened
- Do not use border-radius values outside {4px, 12px, 16px, 38px, 100px} — these five values are the complete radius scale
- Do not mix chromatic button styles — actions are either #000000 filled pills or #f6f6f4 ghost outlines, never both

## Elevation

Elevation is achieved entirely through surface tonal contrast and 1px hairline borders, never through drop shadows. Dark sections use #f6f6f4-on-#000000 for definition; light sections use #1a1a1a-on-#f6f6f4. Cards separate from their parent surface through a 16px radius and a 1px #f6f6f4 border rather than shadow depth. The absence of shadows is a deliberate choice — it keeps the design flat, editorial, and gallery-like.

## Surfaces

- **Obsidian Canvas** (`#000000`) — Default page and section background
- **Bone Section** (`#f6f6f4`) — Light-alternating section background, announcement bar, oversized surface contrast
- **Slate Surface** (`#7d7d7d`) — Mid-tone UI panels and secondary backgrounds
- **Paper Card** (`#ffffff`) — Product image containers and highest-contrast card panels
- **Char Edge** (`#1a1a1a`) — Subtle dark surface separation above the canvas

## Imagery

Imagery is split between two distinct registers: (1) a signature 3D abstract shape — a fluid, organic blob with the Solstice Gradient (yellow→orange→purple) applied as a soft, luminous surface treatment — that floats in hero and transition zones as the sole chromatic atmosphere; (2) clean product photography (Marshall amplifier, headphones) contained within rounded white or bone cards, treated as tight product crops on pure white with no lifestyle context — the object is the hero. No illustrations, no stock photography, no icons beyond small circular check marks. The visual density is very low: imagery occupies less than 20% of any viewport, with the majority given to massive serif type and breathing room.

## Layout

Max-width 1200px centered content within a full-bleed dark canvas. The hero is a full-viewport dark band with a centered massive serif headline and a floating gradient 3D shape as atmosphere. Sections alternate between dark (#000000) and light (#f6f6f4) bands in a deliberate rhythm — dark hero → light product feature section → dark stats bar → dark case study. Content within sections is typically 2-column (text-left, visual-right) or single-column centered. A 3-column card grid appears for product protection features. The page model is contained-max-width on a full-bleed dark canvas, with generous vertical breathing room (80px section gaps). Navigation is a minimal transparent header — no sticky behavior, no sidebar, no mega-menu.

## Similar Brands

- **Aesop** — Same editorial restraint — warm cream and near-black palette, serif display type, zero chromatic UI elements, product treated as object on white
- **Vercel** — Shared dark-canvas dominance, hairline border definition, pill-shaped CTAs, and the conviction that a single accent moment is stronger than a full palette
- **The Row** — Identical luxury-monograph atmosphere — massive serif at tight line-height, nearly monochromatic surfaces, and 3D organic forms as the only expressive element
- **Linear** — Same ultra-restrained dark UI with 1px hairline borders, pill controls, and a refusal to use color for anything that isn't structurally meaningful
