# North Kingdom — Style Reference
> cinematic void with luminous type — a black film-studio soundstage where a single wordmark glows

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

North Kingdom reads as a cinematic void: an almost-black canvas (#050311) swallowing everything except oversized white type and a single luminous accent. The wordmark is the hero — giant neo-grotesque letterforms spanning the full viewport, flanked by a 3D shield emblem with a circular play affordance. The entire palette is near-monochrome; there is no chromatic brand color, no gradients, no decorative warmth. Every component lives or dies by contrast: white type and hairlines on darkness, with a single muted gray (#9b9aa0) carrying all secondary information. Surfaces are flat — no shadows, no elevation tricks, no glass effects. Geometry is quiet and slightly sharp: 8px image/card radii, 4px button radii, with one outlier 26px pill input that signals interactivity. The effect is a digital agency portfolio treated like a film title card.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Ink | `#050311` | Page canvas, section backgrounds, dark surface base — the near-black stage on which all content sits, carrying a barely-perceptible cool-violet undertone that keeps it from feeling clinical |
| Pure White | `#ffffff` | Primary text, headline color, hairline borders, icon strokes, button outlines — the only high-contrast voice in the system; when something needs to be seen, it is white |
| Carbon Black | `#000000` | Monochrome icon fills, brand marks, and high-contrast graphic details. Do not promote it to the primary CTA color |
| Ash Gray | `#9b9aa0` | Muted body text, secondary headings, subtle borders, disabled states — carries all secondary information without competing with the white voice |
| Graphite | `#44424d` | Dividers, low-emphasis borders, hairline separators between sections — quiet structural lines that organize the dark canvas without drawing attention |

## Typography

### FKGroteskNeue — Universal type family — used for navigation, body, headings, badges, buttons, cards, and the massive hero wordmark. A neo-grotesque sans with tabular numerals as a deliberate feature. The single weight (400) is the system's signature: the hero 'North Kingdom' wordmark achieves its cinematic weight through sheer size, not font weight. Substitute: Space Grotesk or Inter at matching weight.
- **Substitute:** Space Grotesk
- **Weights:** 400
- **Sizes:** 24px
- **Line height:** 1.15–1.70
- **Letter spacing:** -0.01em
- **OpenType features:** `"tnum"`

### Arial — System fallback for button labels, icons, and input fields — used where the custom font license or loading constraints prevent the primary face from rendering
- **Substitute:** system-ui
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | 0px |
| heading | — | — | 24px | 1.15 | -0.24px |

## Spacing & Layout

**Density:** compact

- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **cards:** 8px
- **badges:** 100px
- **images:** 8px
- **inputs:** 26px
- **buttons:** 4px

## Components

### Hero Wordmark Display
**Role:** Primary brand expression — full-viewport typographic statement

The signature element: 'North Kingdom' rendered in FKGroteskNeue weight 400 at extreme scale (estimated 120–180px viewport-relative), letter-spacing -0.01em, color #ffffff, set against the #050311 void canvas. The text spans nearly the full viewport width with the 3D shield emblem embedded between the two words.

### 3D Brand Emblem Card
**Role:** Central brand icon — visual anchor within the hero wordmark

A square or slightly tall container (8px radius) holding a 3D-rendered shield/crest illustration with rich internal color (blues, greens, golds) — the only chromatic content in the system. A circular white play button (#ffffff fill, 4px radius or circular) is overlaid dead-center, signaling video. The container is 8px radius, consistent with all image cards.

### Top Navigation Bar
**Role:** Site navigation — minimal, non-competing

Fixed or top-anchored horizontal bar on the dark canvas. Left: small shield logo mark in #ffffff. Right: inline nav links (Work, About, Careers, Contact) in FKGroteskNeue 24px or smaller, #ffffff color, with 24px horizontal spacing between items. No background fill, no border — the nav floats directly on the void.

### Image Card
**Role:** Project thumbnail / work showcase tile

8px border-radius container holding project imagery or video stills. No border, no shadow. The image fills the card edge-to-edge. Cards sit directly on the void canvas with 10px gaps between them in grid arrangements.

### Outlined Button
**Role:** Primary interactive element

4px border-radius button with 1px border in #ffffff or #000000, transparent fill on the dark canvas. Padding: 6px horizontal, 7px vertical. Label in FKGroteskNeue 24px, #ffffff. The slight radius and hairline border create a precise, almost architectural feel.

### Pill Input Field
**Role:** Form input — newsletter, contact, search

26px border-radius (near-pill) input with #ffffff border on the dark canvas. Padding includes generous horizontal space. The large radius is a deliberate departure from the otherwise sharp 4–8px geometry, signaling 'type here' with a single visual gesture.

### Full-Pill Badge / Tag
**Role:** Category labels, filters, metadata chips

100px border-radius pill shape with #ffffff background and dark text, or #ffffff border with white text. Padding 20px horizontal. Used for project categories, filter pills, or status indicators — the only fully rounded element in the system.

### Play Button Overlay
**Role:** Video trigger — appears on hero emblem and video thumbnails

Circular #ffffff button with a centered triangular play icon in #050311. Sits as an overlay on video containers. The pure white circle on the dark void is the system's most recognizable micro-component.

### Section Divider
**Role:** Structural separator between content bands

1px hairline in #9b9aa0 or #44424d spanning the full width. No vertical padding tricks — just a single line that says 'new section begins' without visual ceremony.

### Footer Block
**Role:** Site footer — contact, social, legal

Dark block matching the void canvas. Content arranged in columns with 20px gaps. Heading text in #ffffff, body and links in #9b9aa0. 52px top padding creates breathing room from the last content section.

### Grid Project Layout
**Role:** Work portfolio grid — the 'Work' page pattern

Multi-column grid of Image Cards with 10px gaps. Full-bleed (no page max-width constraint), columns equal-width. Each card may contain a Play Button Overlay indicating video case studies.

## Do's and Don'ts

### Do
- Set all body text and headings in FKGroteskNeue weight 400 — the single weight is the system's voice; never introduce bold or light variants
- Use #050311 as the page canvas for every full-width background; let sections flow as uninterrupted bands of void
- Apply 8px border-radius to all image containers and project cards; use 4px for buttons; reserve 26px exclusively for input fields
- Let white (#ffffff) carry all primary information: text, borders, icons, button outlines — it is the only voice that speaks loudly
- Use #9b9aa0 for secondary text and muted borders; it should never compete with white for attention
- Let the hero wordmark be enormous — typographic scale is the design system, not color or imagery
- Include "tnum" font-feature-settings on all FKGroteskNeune usage to preserve tabular numeral alignment

### Don't
- Never introduce a chromatic brand color — the system is monochrome; color appears only inside the 3D emblem artwork
- Never use drop shadows, glows, or blur effects — depth comes from value contrast, not elevation
- Never use border-radius above 8px on cards or images — the 26px and 100px values are reserved for inputs and pills only
- Never use more than one font weight — the system speaks in a single 400 voice at varying sizes
- Never place white text on white surfaces or dark text on the void without testing contrast — the system depends on absolute clarity between two values
- Never use gradients on backgrounds — the canvas is a solid void; gradients were not detected in the system
- Never add decorative borders or ornamental elements — the aesthetic is architectural minimalism, not illustration

## Elevation

Elevation is avoided entirely. The system uses pure value contrast (white on near-black) rather than shadows to separate layers. No drop shadows, no glow effects, no blur. Depth comes from typographic scale and content density, not from lifted surfaces.

## Surfaces

- **Void Canvas** (`#050311`) — Base page background — the absolute floor of the design
- **Carbon Layer** (`#000000`) — Icon containers, button surfaces, card backgrounds where a step deeper than the canvas is needed
- **Inverted Surface** (`#ffffff`) — Full-bleed light sections, badge backgrounds, inverse text blocks — the dramatic opposite of the void

## Imagery

Imagery is treated as cinematic content, not decoration. The dominant visual is a 3D-rendered shield/crest emblem with rich internal coloring (blues, greens, golds, architectural stairways) — this single artwork is the only chromatic element in the entire interface and serves as the brand mascot. Project thumbnails and video stills appear as edge-to-edge 8px-radius cards. Photography is not present in the hero; the void + type + 3D emblem is the hero composition. Icons are minimal and line-based, rendered in #ffffff with thin strokes. The overall visual language is closer to a film studio title sequence than a typical agency portfolio.

## Layout

Full-bleed layout with no max-width container constraint — content stretches edge to edge of the viewport. The hero is a full-viewport dark canvas with the massive 'North Kingdom' wordmark split by the 3D emblem in the center; the wordmark text and emblem share a single horizontal baseline that is vertically centered. Navigation is a minimal top bar (logo left, links right) with no background fill, floating directly on the void. Below the hero, sections flow as uninterrupted horizontal bands separated by hairline dividers in #44424d, with 80px vertical gaps between major sections. Content within sections uses generous 140px horizontal padding for breathing room. Project grids use equal-width columns with 10px gaps. The overall rhythm is cinematic: one overwhelming opening frame, then quiet, spacious, content-driven scrolling.

## Similar Brands

- **Unit Image** — Same cinematic dark-canvas hero with oversized white type and a central 3D-rendered brand artifact — the title-card approach to an agency homepage
- **Active Theory** — Dark full-bleed creative agency aesthetic with a single immersive visual centerpiece and minimal monochrome navigation
- **Resn** — Dark-void canvas treatment with large neo-grotesque type and experimental 3D/webGL elements as the brand identity
- **Locomotive** — Agency portfolio with full-bleed dark sections, hairline dividers, and typography-led hero compositions
- **Ueno** — Single-weight custom neo-grotesque type at extreme sizes, monochrome dark palette, minimal navigation — the wordmark IS the hero
