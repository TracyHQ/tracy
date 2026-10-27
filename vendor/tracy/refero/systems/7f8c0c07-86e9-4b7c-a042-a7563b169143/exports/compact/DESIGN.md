# Index — Style Reference
> Blueprint on a backlit drafting table — the entire interface is a wireframe drawing, with one periwinkle annotation pen.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Index operates as a technical wireframe drawn in negative space: a near-black canvas wrapped in dashed containment lines, a single muted periwinkle accent (#7089ba) used as quiet annotation, and display type set at maximum weight (Raveo 1000) that anchors every section. The visual logic is "blueprint on a light table" — components are not decorated but outlined, so the interface reads as a schematic rather than a finished product. Surfaces stay matte and flat; elevation is implied by hairline dashed borders and a slight surface lift from #1c1c1c to #808080, never by shadow. The only moment of softness is the hero's radial light wash, which acts like a focused desk lamp on a drafting table. Color is rationed — achromatic 99% of the time, with the violet-blue reserved for small chromatic punctuation (data connection nodes, icon fills, subtle washes). Typography does the emotional heavy lifting: weight 1000 display lines dominate, set tight (-0.04em) and large (70px) so they feel architectural rather than editorial.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page background, all structural borders, primary text on light surfaces — the absolute black that makes the dashed containment lines read as ink on paper |
| Carbon | `#1c1c1c` | Elevated surface — card backgrounds, section fills, the canvas where the hero spotlight lands; lifted one step from Void but barely |
| Graphite | `#4d4d4d` | Tertiary borders and disabled outlines, dividers in dense lists |
| Steel | `#808080` | Body text secondary, metadata labels, muted borders, checkbox/divider lines on dark |
| Ash | `#ababab` | Helper text, caption-level metadata, tertiary text on dark surfaces |
| Paper | `#ffffff` | Primary text, logo mark, active nav text, button borders, eyebrow chips — the one bright stroke against the void |
| Periwinkle Annotation | `#7089ba` | Decorative icon fills, data-node accents, subtle highlight washes on feature illustrations, checkmark accents — the only chromatic mark in the system, rationed to annotation roles |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Raveo Variable — Primary face for all display, heading, body, and nav text. Weight 1000 at 70px is the signature display; weight 500 for subheadings; weight 400 for body. The 1000 weight is the system's defining move — a single blocky headline silhouette against the void does more work than any color or shadow could.
- **Substitute:** Inter Variable, Manrope, or any grotesque with a weight axis reaching 900+
- **Weights:** 400, 500, 1000
- **Sizes:** 12, 14, 16, 24, 32, 70
- **Line height:** 1.10–1.80
- **Letter spacing:** -0.04em at 70px display, -0.01em at 16–32px body and headings
- **OpenType features:** `"tnum" on, "ss01" on if available`

### Geist Mono — Eyebrow chips, version tags ("NEW · INDEX 2.0 EARLY PREVIEW"), step labels, and all-caps micro-labels. Sets a technical/code-adjacent tone that reinforces the blueprint metaphor. Tracked +0.02em for legibility at small sizes.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 500
- **Sizes:** 9, 12
- **Line height:** 1.60
- **Letter spacing:** 0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.6 | -0.14px |
| body | — | — | 16px | 1.6 | -0.16px |
| subheading | — | — | 24px | 1.4 | -0.24px |
| heading | — | — | 32px | 1.2 | -0.32px |
| display | — | — | 70px | 1.1 | -2.8px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **nav:** 6px
- **tags:** 100px
- **buttons:** 100px
- **featureTiles:** 20px
- **iconContainers:** 50px

## Components

### Dashed Section Container
**Role:** Primary layout primitive — wraps every content block

Full-width section bordered by 1px dashed #000 (on light) or dashed #1c1c1c (on dark Carbon). Padding 40–80px vertical. The dashed stroke is the system's signature — it treats every section as a drawing on a page rather than a UI panel.

### Hero Spotlight Banner
**Role:** Above-the-fold hero with radial light wash

Full-bleed Carbon (#1c1c1c) background with a subtle radial gradient fading from #1c1c1c center to #000000 edges, evoking a desk lamp on a drafting surface. Contains a Geist Mono eyebrow chip at 9px tracking +0.18em, the 70px Raveo 1000 headline, a 16px body subtitle in Steel, and a single outlined button. Centered stack, max-width ~720px.

### Outlined Pill Button
**Role:** Primary action (Book demo, Login)

Border-radius 100px (fully pill). 1px solid #ffffff border on dark surfaces. Padding 8px 18px. Label in Raveo 500 at 14px, color #ffffff. No fill — the button is a wireframe of a button, consistent with the blueprint language.

### Eyebrow Chip
**Role:** Status/version label above headlines

1px solid #000000 or #ffffff dashed border, border-radius 100px, padding 4px 12px. Geist Mono 9px, weight 500, tracking +0.02em, uppercase. Often paired with a small inline arrow icon. The most technical-looking component in the system.

### Step Card
**Role:** 3-column "how it works" tile

No fill, no shadow. 32px Periwinkle icon centered top, Raveo 500 16px label beneath, Raveo 400 14px Steel description. Cards separated by even column gap, not by borders. The whole row lives inside a dashed section container.

### Feature Split Panel
**Role:** Two-column text + illustration block

Left column: 12px uppercase mono label ("CONNECT YOUR DATA"), 32px Raveo 1000 heading, 16px body, checklist of 4 items with Periwinkle check icons. Right column: a 1:1 square illustration area (periwinkle on Carbon or white on black) with a geometric wireframe graphic — gear, box, funnel — rendered as if in CAD. Padding 48px each side.

### Periwinkle Check Item
**Role:** Checklist line inside feature panels

Small check icon in #7089ba, 10px to the left of 14px Raveo 400 #ffffff text. Items separated by 10px vertical gap. The periwinkle is the only chromatic moment in the checklist — a quiet confirmation rather than a celebration.

### Top Navigation
**Role:** Sticky site header

Transparent over Carbon hero, switches to #000000 background on scroll. Logo (white Index mark + wordmark) left, 5 nav links center in Raveo 500 14px, Login (ghost) + Book demo (outlined pill) right. 16px horizontal padding, 6px border-radius on any filled elements. Hairline 1px bottom border on scroll.

### Logo Wordmark
**Role:** Brand mark in nav and footer

Custom 'Index' wordmark in Raveo 500, paired with a square bracket-style monogram. Color #ffffff. ~24px height in nav. The bracket mark and the 'I' dot are the two details that make it distinctive.

### Illustration Module
**Role:** Geometric wireframe graphic inside feature panels

Rendered as a 1:1 square with rounded 20px corners on Carbon background. Line-art isometric box / gear / pipeline in #7089ba, with stippled particle accents (small white dots) suggesting data points. No fills, no gradients — pure line geometry.

## Do's and Don'ts

### Do
- Use Raveo Variable weight 1000 for all display headlines ≥32px — it is the system's most distinctive move and the reason the interface reads as architectural rather than typical SaaS.
- Wrap every content section in a 1px dashed #000 (on Carbon) or dashed #1c1c1c (on light) container — the dashed border IS the section design, not a fallback.
- Set display headlines at 70px / line-height 1.10 / letter-spacing -0.04em; this tight blocky silhouette is what carries the page when everything else is restrained.
- Ration #7089ba to annotation roles only: check icons, illustration accents, small data-node fills. Never use it for full buttons, large fills, or text.
- Use Geist Mono 9px with +0.02em tracking for all uppercase eyebrows, step labels, and version tags — it is the only monospace moment and reinforces the technical tone.
- Keep button radius at 100px (fully pill). Outlined ghost buttons (1px white border, no fill) are the system's only action style; do not introduce filled buttons.
- Maintain the matte/flat surface stack: #000000 → #1c1c1c → #808080. Never introduce drop shadows — depth comes from the surface lift and the dashed containment, not from elevation.

### Don't
- Do not introduce any color outside the achromatic stack and #7089ba periwinkle — no greens, reds, oranges, or accent gradients. The 0% colorfulness is the point.
- Do not use weight 400 Raveo for headlines — anything below 1000 at 70px will look like a different system entirely.
- Do not use solid 1px borders where the design calls for dashed. Solid borders break the blueprint metaphor and make the interface look like a generic dark dashboard.
- Do not add drop shadows, glows, or blur effects to cards or buttons. The system implies elevation through the Carbon-on-Void surface lift only.
- Do not center-align body paragraphs. Center is for hero headlines and short CTAs only — feature panels and descriptions should be left-aligned.
- Do not use #7089ba as a button fill or active-link background. It is decorative annotation, not a brand action color. Actions stay white-on-dark outlined pills.
- Do not break the type scale to add intermediate sizes — 9 / 12 / 14 / 16 / 24 / 32 / 70 is the full set. Going to 18 or 28 collapses the rhythm.

## Elevation

The system deliberately avoids drop shadows. Depth is communicated through a three-level surface stack (#000000 → #1c1c1c → #808080) and 1px dashed containment borders that read as line drawings. Any shadow would break the blueprint metaphor and make the interface feel like a conventional dark dashboard rather than a schematic.

## Surfaces

- **Void Canvas** (`#000000`) — Page background, behind everything
- **Carbon Surface** (`#1c1c1c`) — Hero wash, elevated section backgrounds, card fills
- **Periwinkle Wash** (`#7089ba`) — Decorative highlight zones — feature illustration backgrounds, data-node fills

## Imagery

Imagery is line-art geometric illustration rendered in a CAD/wireframe style: isometric boxes, gears, pipelines, and funnel shapes drawn in 1px #7089ba strokes on a Carbon square background with rounded 20px corners. Illustrations are decorative and explanatory — they sit in the right column of feature split panels. The hero features a subtle radial light wash (Carbon center fading to Void edges) suggesting a desk lamp on a drafting table, with no actual photography. No product screenshots, no lifestyle photography, no 3D renders. Stippled particle accents (small white dots) are used sparingly to suggest data points or motion. The overall visual density is text-dominant — illustrations occupy at most 30% of any given section.

## Layout

Max-width 1200px centered, but the overall feel is generous: sections are full-bleed bands separated by hairline dashed containers that often span the full viewport. Hero is a centered single-column stack on a Carbon surface, max content width ~720px, surrounded by deep negative space. Subsequent sections alternate between centered 3-column step cards and 2-column feature splits (text-left, illustration-right), each wrapped in its own dashed-border container. Vertical rhythm is 80px between sections, with 24px card padding. The navigation is a minimal top bar (logo left, 5 links center, two pill buttons right) that becomes a black sticky bar on scroll. There is no sidebar, no mega-menu, no footer visible in the analyzed screens. The layout's signature move is the dashed container — it makes every section feel like a discrete drawing pinned to the canvas, rather than a continuous scroll.

## Similar Brands

- **Linear** — Shares the dark monochromatic canvas, single restrained accent color, and architectural-weight display type — though Linear's accent is violet/purple and Index's is muted periwinkle-blue
- **Vercel** — Same near-black canvas with white display type and minimal color use, though Vercel leans geometric/grid whereas Index leans wireframe/blueprint
- **Raycast** — Both use a dark interface with high-contrast white text, compact spacing density, and a single small chromatic accent reserved for interactive states
- **Resend** — Shares the near-zero colorfulness approach with a single accent, weight 1000-style display headlines, and a technical/blueprint visual register
