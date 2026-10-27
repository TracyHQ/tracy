# EPIC agency — Style Reference
> violet observatory with gilded instruments — a gallery-as-night-sky where pale lavender light and warm gold details float over an infinite aubergine void.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

EPIC is a nocturnal creative agency language: a deep violet canvas plays the role of night sky while a pale lavender acts as the primary signal color for type, links, and iconography, with brushed gold as a second accent. The display face (Sang Bleu, a Garamond-class didone) arrives at colossal sizes (80–120px) to carry editorial weight, while Inter handles every working surface at compact sizes (9–18px) with generous tracking on uppercase labels. Layout is dense and magazine-like: a centered 3D hero illustration sits beside a vertical journal column, followed by a full-bleed black showreel block, with whitespace used as a controlled luxury rather than a cushion. Surfaces are flat — no shadows, no gradients — depth comes from color contrast (violet on black, lavender on violet) and from the typographic weight ratio between the display serif and the utilitarian sans.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aubergine Canvas | `#271a47` | Page background, hero canvas, filled button surface, deep surface elevation — the foundational night-sky tone that everything floats on |
| Moonlight Lavender | `#dbc9ff` | Violet supporting accent for decorative details and low-frequency emphasis. |
| Gilded Brass | `#bc994e` | Secondary link color, decorative icon accent, highlight strokes — a warm metallic counterpoint to the cool violet, used sparingly as jewelry on the page |
| Obsidian Black | `#000000` | Video/showreel container background, inverse button surface, maximum-contrast surface for media blocks |

## Typography

### Inter — Body, nav, buttons, labels, journal entries, metadata — the utilitarian workhorse that handles every reading surface. Compact sizes (9–14px) with tight line-heights (1.00–1.65) create the dense, information-rich layout. Uppercase labels use 0.5em tracking for the editorial tagline rhythm.
- **Weights:** 400, 600, 700
- **Sizes:** 9px, 10px, 11px, 13px, 14px, 16px, 18px
- **Line height:** 1.00, 1.33, 1.40, 1.56, 1.65, 1.70, 3.00
- **Letter spacing:** 0.036em at body, 0.111em at small uppercase labels, 0.5em at display taglines (e.g. 'IMAGINE, BUILD, TELL.')

### Sang Bleu (custom) — Display and editorial headlines — the serif voice that carries brand authority. Used at 80–120px for hero titles, 42px for section-level headings. The high contrast strokes and Garamond-class proportions give every page a magazine-cover gravitas. Substitute with Cormorant Garamond or Playfair Display Black for free alternatives.
- **Substitute:** Cormorant Garamond
- **Weights:** 400, 700, 900
- **Sizes:** 42px, 80px, 120px
- **Line height:** 1.00, 1.20, 1.65

### object-fit: cover — object-fit: cover — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.7

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.65 | — |
| body-lg | — | — | 16px | 1.7 | — |
| subheading | — | — | 18px | 1.7 | — |
| heading | — | — | 42px | 1.2 | — |
| display | — | — | 80px | 1 | — |
| hero | — | — | 120px | 1 | — |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **tags:** 30px
- **cards:** 10px
- **pills:** 30px
- **buttons:** 30px

## Components

### Hero Headline (Serif Display)
**Role:** Primary page title — the editorial anchor of every page

Sang Bleu at 80–120px, weight 400, line-height 1.0, color #dbc9ff. Set tight with no letter-spacing adjustment. Breaks naturally to two lines with the second line slightly indented or right-aligned to create asymmetric editorial composition. No text shadow, no gradient — the weight and size alone carry impact.

### Ghost Outlined Button
**Role:** Primary action surface — 'VISIT PROJECT', 'SEE ALL PROJECTS'

Inter 14px weight 600, uppercase, color #dbc9ff, letter-spacing 0.111em. 1px solid #dbc9ff border, 30px border-radius (pill shape), padding 12px 20px. Includes an arrow icon (→) after the label. Transparent background sits directly on the aubergine canvas. On hover the background fills with #dbc9ff and text inverts to #271a47.

### Pill Language Selector
**Role:** Locale switcher in the top nav

Inter 13px weight 600, color #dbc9ff, 1px solid #dbc9ff border, 30px radius, padding 4px 14px. Includes a chevron-down icon. Mirrors the ghost button language but at a smaller scale for the nav context.

### Top Navigation Bar
**Role:** Site-wide header with brand mark, tagline, and utility actions

Transparent over the aubergine canvas. Left: EPIC hexagonal mark in #dbc9ff at ~32px. Center: uppercase tagline 'IMAGINE, BUILD, TELL.' in Inter 11px weight 600 at 0.5em tracking, color #dbc9ff. Right: language pill + hamburger menu icon. A 1px hairline in #dbc9ff at ~10% opacity runs the full width below the nav as a divider.

### Journal Entry Row
**Role:** Vertical list of dated project entries in the hero sidebar

Each row separated by 1px hairline in #dbc9ff at low opacity. Date in Inter 11px weight 600, uppercase, 0.111em tracking, color #dbc9ff (e.g. '13 OCTOBER 2025'). Title in Inter 14–16px weight 400, color #dbc9ff, on the line below. Right-aligned 'READ' label in 11px with a small circle icon. Row padding 15–20px vertical.

### 3D Isometric Hero Illustration
**Role:** Brand storytelling centerpiece on the landing page

Full-color 3D render with soft purple/violet platform base, character figures in lavender and pink, satellite and trophy props floating above. The illustration casts no shadow on the canvas — it sits as a self-contained vignette in the center of the hero. Lighting is studio-soft with a subtle violet glow underneath the platform.

### Showreel Video Container
**Role:** Full-bleed media block below the hero

Pure black (#000000) container with 10px border-radius, spanning the full content width. Centrally positioned circular play button: 80px diameter, #271a47 fill, white play triangle icon at 16px, with rotating text 'DOUBLE CLICK TO PLAY' wrapping the circle in Inter 10px weight 600 at 0.036em tracking. The black block sits on the aubergine canvas, creating a hard rectangular void.

### Section Eyebrow Label
**Role:** Small uppercase section identifier (e.g. 'SHOWREEL', 'JOURNAL')

Inter 11px weight 600, uppercase, letter-spacing 0.111em, color #dbc9ff. Centered or left-aligned above the section it labels. Tight line-height of 1.0. Functions as the editorial section name in a magazine spread.

### Rotating Circular Badge
**Role:** Decorative micro-component around interactive media controls

SVG text-path circle, 80–100px diameter, text in Inter 10px weight 600 at 0.036em tracking, color #dbc9ff, rotating slowly (CSS animation). Used around the showreel play button to add kinetic editorial detail.

## Do's and Don'ts

### Do
- Use Sang Bleu (or Cormorant Garamond substitute) for any display headline at 80px or larger — the serif voice is the brand's editorial signature
- Set all body, nav, and label text in Inter with 0.111em tracking on uppercase and 0.036em on mixed-case
- Apply 30px border-radius to all interactive elements (buttons, pills, tags) to maintain the pill-shaped rhythm
- Use #dbc9ff as the default text and interactive color on the #271a47 canvas — the 13.8:1 contrast ratio is the structural backbone
- Layer #000000 media blocks directly on the #271a47 canvas to create hard rectangular voids for video and imagery
- Keep vertical rhythm compact: 10px between elements, 20px for card padding, 80px between major sections
- Set the display tagline ('IMAGINE, BUILD, TELL.') in Inter 11px at 0.5em tracking — the wide tracking is a signature element of the brand voice

### Don't
- Do not introduce drop shadows or blur elevation — the design system is deliberately flat, depth comes from color contrast only
- Do not use rounded card corners above 10px for content containers — only buttons and pills get the 30px treatment
- Do not place body text below 11px — the system never uses sub-11px sizes for any interface text
- Do not use #bc994 (gold) for large fills or backgrounds — it is a jewelry accent for links and icons only
- Do not mix the display serif into body or button text — Sang Bleu is strictly for display, Inter handles everything below 42px
- Do not add gradients to backgrounds — the system is flat color, with depth expressed through value jumps between violet and black
- Do not use sans-serif typefaces other than Inter for working surfaces — the pair is locked: one serif display, one sans workhorse

## Elevation

Elevation is expressed through color contrast and scale, not shadow. Components float on the aubergine canvas by virtue of the 13.8:1 lavender-on-violet contrast; media blocks use pure black to carve negative space into the violet field. No drop shadows, no blur halos — depth is flat and graphic, derived from the value jump between layers.

## Surfaces

- **Aubergine Void** (`#271a47`) — Base page canvas — the night-sky background that defines the entire interface
- **Obsidian Block** (`#000000`) — Media containers (video/showreel), contrast inversions that punch through the violet

## Imagery

Imagery is dominated by 3D isometric illustrations rendered in a soft studio-lit style: pale lavender, pink, and violet color palette, glossy plastic-like material, floating props (satellites, trophies, charts) arranged on geometric platforms. Photography is absent — the 3D render IS the hero visual. The illustration casts no shadow and sits as a self-contained vignette centered on the aubergine canvas. Video content is presented in pure black containers that carve rectangular voids into the violet field. Icons are minimal line-style glyphs in #dbc9ff. The overall visual density is low — most of the page is the violet void with one or two media moments.

## Layout

Full-bleed dark sections on the #271a47 aubergine canvas, max content width 1200px centered. The hero is a split composition: left two-thirds hold the 3D illustration with the large serif headline overlaid at the bottom-left, right one-third holds a vertical 'JOURNAL' column with dated entries. Navigation sits in a thin transparent bar at the very top with a hairline divider below. Below the hero, a full-width black video block for the showreel creates a hard rectangular void. Section rhythm is compact (80px gaps) with flat seamless flow — no alternating light/dark bands, no visible card grids. Content stacks vertically in a single editorial column flow rather than multi-column grids.

## Similar Brands

- **Locomotive (locomotive.ca)** — Same deep purple-to-black color treatment, large editorial serif display, and ghost pill buttons for navigation — both agencies use the night-sky palette as a creative-agency signature
- **Resn (resn.co.nz)** — Dark canvas with vivid accent colors, large custom display type, and 3D/illustrated hero vignettes — both use flat surfaces with no shadows and let illustration do the visual heavy lifting
- **Active Theory** — Immersive dark-mode agency site with centered 3D hero art, compact metadata columns beside the main visual, and a full-bleed black showreel block as the secondary anchor
- **Ueno (ueno.co)** — Dark editorial layout, large serif display headlines, tight tracking on uppercase labels, and the same magazine-cover approach to agency landing pages
