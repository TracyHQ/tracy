# Exo Ape — Style Reference
> Venetian gallery at golden hour

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Exo Ape operates as a digital studio site that reads like a printed architecture monograph: one massive custom neo-grotesque (Lausanne) sets a near-monastic tone while full-bleed editorial photography does the heavy atmospheric work. The palette is almost entirely warm neutrals — a deep ink-black, warm canvas beige, and two sand-toned border colors that replace the usual cool-gray UI chrome. Headlines are not styled; they are BUILT at 144–250px with negative tracking tight enough to make the letterforms collide, while body copy drops to 14–16px in the same family at loose, breathable line-heights (1.88–2.64). There is no shadow, no gradient, no accent color, and no filled button — interactions are thin warm-beige outlined links that feel like captions, not calls to action. The whole system whispers prestige through scale, whitespace, and warmth rather than shouting it through saturation or contrast.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#0d0e13` | Primary text, dark UI frames, icon strokes — the deepest near-black with a barely-perceptible cool cast that keeps it from feeling warm or brown against the beige canvas |
| Pure White | `#ffffff` | Card surfaces, nav background, image bleeds — the brightest surface level that lifts content off the warm canvas |
| Canvas Beige | `#e4e0db` | Page background, section bands — a warm light gray-beige that gives the whole site its sunlit, paper-like quality |
| Steel Gray | `#6e6e71` | Secondary body text, muted borders — the only truly achromatic neutral in the system, used sparingly to signal de-emphasis |
| Footer Ink | `#070707` | Footer background — a pure near-black that reads as the deepest possible dark without losing detail |
| Sand Border | `#e0ccbb` | Default hairline borders, icon outlines, structural dividers — the warm tan that replaces cold gray chrome throughout the interface |
| Warm Linen | `#e6d7ca` | Outlined action borders, link underlines, interactive link states — the lighter, more luminous sand tone that signals interactivity without filling the shape |

## Typography

### Lausanne-400 — Lausanne-400 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 2.64

### Lausanne — Primary typeface for everything from 14px body to 250px display. The 250px hero display with -0.046em tracking is the signature element — letters nearly collide, creating a monolithic word-as-architecture presence. The single weight 400 across the full scale (from 14px to 250px) means hierarchy comes from size and tracking alone, not from bold.
- **Substitute:** Inter, Neue Haas Grotesk, Suisse Int'l
- **Weights:** 400
- **Sizes:** 14, 16, 24, 144, 250
- **Line height:** 0.76, 0.90, 1.33, 1.50, 1.88
- **Letter spacing:** -0.046em at 250px, -0.035em at 144–24px, +0.006em at 16px, +0.007em at 14px
- **OpenType features:** `"ss01" on, "tnum" on`

### Times — System serif fallback used in tertiary body contexts. Acts as a quiet typographic counterpoint to the neo-grotesque — never set in display sizes, always at 16px with generous leading.
- **Substitute:** Times New Roman, system serif
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.20, 2.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.88 | 0.098px |
| body | — | — | 16px | 1.5 | 0.096px |
| subheading | — | — | 24px | 1.33 | -0.84px |
| heading-lg | — | — | 144px | 0.76 | -5.04px |
| display | — | — | 250px | 0.76 | -11.5px |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 200px
- **Card padding:** 50-60px
- **Element gap:** 13-15px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Minimal primary navigation

Full-bleed white bar with the Exo Ape wordmark left-aligned and 4 text links (Work, Studio, News, Contact) right-aligned. 48–60px vertical padding, no border, no shadow. Links in Lausanne 14px at #0d0e13, no underline. The nav floats over hero imagery with no backdrop blur — it simply sits on the surface.

### Full-Bleed Hero Section
**Role:** Atmospheric page opening

Edge-to-edge editorial photography (architecture, landscape, lifestyle) at viewport height or larger. Overlay text in Lausanne 250px, weight 400, #ffffff, letter-spacing -0.046em, positioned bottom-left with 120px horizontal padding. The hero text acts as architectural type — it does not describe the image, it becomes part of it.

### Outlined Action Link
**Role:** Primary interaction element

The site's de facto button. 1px solid #e6d7ca border around Lausanne 16px text, #0d0e13, with 8–16px vertical and 20–32px horizontal padding. No fill, no shadow. On hover, the border darkens to #0d0e13. Zero corner radius. Reads as a caption with a frame, not a button.

### Display Headline Block
**Role:** Section-defining type

Lausanne 144–250px, weight 400, #0d0e13 on light sections or #ffffff on dark imagery. Line-height 0.76, letter-spacing -0.035em to -0.046em. No max-width constraint — headlines are allowed to break wherever the line-break algorithm decides, creating irregular right edges that feel editorial.

### Body Text Block
**Role:** Running prose and descriptions

Lausanne 16px, weight 400, #0d0e13, line-height 1.50, max-width ~480–560px. Secondary descriptions drop to 14px with line-height 1.88. No first-line indent, no drop cap. The narrow measure and generous leading give long-form text a literary, unhurried quality.

### Image Card
**Role:** Project thumbnail or case study

Full-bleed photograph with 0px corner radius, no border, no shadow. Caption text in Lausanne 14px, #0d0e13, positioned beneath with 13–15px gap. Cards sit directly on the #e4e0db canvas — the warm background provides the only visual separation.

### List Item with Sand Divider
**Role:** Work index, navigation lists, footer links

List items separated by 1px #e0ccbb bottom borders, 30–50px vertical padding per row. Text in Lausanne 14–16px, #0d0e13. The warm tan divider replaces the conventional cool-gray hairline, making every list feel like a printed table of contents.

### Footer Block
**Role:** Terminal dark surface

#070707 background, full-bleed, 200px vertical padding. All text in #ffffff, Lausanne 14–16px. No social icons rendered in color, no accent highlights. The footer closes the page with the deepest possible black, creating maximum contrast against the warm beige canvas above.

### Section Spacer
**Role:** Vertical rhythm between sections

Not a component but a rhythm rule: 200px of vertical breathing room between major sections, implemented as paddingTop/paddingBottom on the outer section wrapper. This is the system's primary elevation tool — it replaces shadows, cards, and dividers with pure whitespace.

## Do's and Don'ts

### Do
- Set display type at 144–250px in Lausanne weight 400 with tracking between -0.035em and -0.046em — the size IS the hierarchy
- Use #e6d7ca 1px borders for all interactive elements; let the outlined link be the only action shape in the system
- Maintain 200px section gaps to create editorial whitespace; resist pulling sections closer together
- Use #e4e0db as the default page canvas, not pure white, to preserve the warm paper-like atmosphere
- Set body text line-height at 1.88 for 14px and 1.50 for 16px; the generous leading is what makes Lausanne readable at small sizes
- Use #e0ccbb for all structural dividers, list separators, and hairline borders — never default to cool gray
- Let images bleed to all four edges with 0px corner radius; the warmth comes from the canvas behind, not from rounded framing

### Don't
- Do not introduce filled buttons, filled backgrounds for actions, or any solid color button — the outlined link is the only action component
- Do not use box-shadow, drop-shadow, or blur effects; depth comes from surface color contrast and whitespace only
- Do not use saturated colors, gradients, or brand accent hues; the palette ends at warm sand tones
- Do not set body type below 14px or above 16px; the 14–16px range is the only legible band in the system
- Do not add corner radius to cards, buttons, or images; every edge in the system is sharp 0px
- Do not use bold or semibold weights; the system has one weight (400) and hierarchy comes from size alone
- Do not center-align body prose; keep running text left-aligned with a 480–560px measure for editorial readability

## Elevation

The system deliberately uses zero box-shadow. Depth is communicated exclusively through surface color contrast — white cards on a beige canvas, dark footer on light sections, and warm sand borders as visual dividers. This is a design-without-shadows philosophy rooted in editorial print design, where page layers are read by ink density and color temperature rather than by drop-shadow.

## Surfaces

- **Canvas** (`#e4e0db`) — Full-page warm background establishing the paper-like base
- **Surface White** (`#ffffff`) — Card and panel surfaces that lift content off the canvas
- **Sand Tint** (`#e0ccbb`) — Subtle warm wash for highlighted sections or accent bands
- **Footer Ink** (`#070707`) — Terminal dark surface closing the page with contrast

## Imagery

The visual language is dominated by full-bleed editorial photography — architectural exteriors (domes, basilicas, civic buildings), warm-toned landscapes, and lifestyle imagery shot at golden hour. Treatment is always full-bleed, always edge-to-edge with zero corner radius, always with the warmest possible white balance to match the #e4e0db canvas. Images are never cropped to thumbnails with padding; they are always presented at maximum scale, often as full-viewport hero backgrounds. The photography style is high-key warm, staged but not sterile, with deep shadow detail preserved in the architecture. Icons, when present, are minimal thin-stroke line icons at 1px weight in #0d0e13. The site is image-heavy but uses images as atmosphere, not as product showcase — the photography sells the studio's aesthetic sensibility, not its deliverables.

## Layout

Full-bleed, viewport-scale layout with no max-width container. The hero is a single full-viewport image with overlay display text anchored bottom-left at 120px horizontal padding. Below the hero, sections alternate between #ffffff and #e4e0db surfaces, each separated by 200px of vertical breathing room. Content blocks are left-aligned, narrow-measure prose columns (480–560px) for body text, with display headlines allowed to break at their natural line-length creating irregular right edges. The grid is loose — no rigid 12-column system, no card grids with uniform sizing. Navigation is a single top bar with no sticky behavior, no mega-menu, and no visual weight. The page reads top-to-bottom as a vertical scroll through atmospheric photography punctuated by monumental type, ending in a near-black footer that provides the only dramatic contrast in the entire layout.

## Similar Brands

- **Locomotive** — Same editorial full-bleed photography approach with massive neo-grotesque display type and warm-neutral canvas — both treat the website as a printed monograph
- **Resn** — Similar oversized display headlines, generous whitespace, and warm-toned hero photography with minimal UI chrome
- **Pentagram** — Same single-weight type scale spanning body-to-display sizes, warm-neutral palette, and editorial layout that prioritizes type and photography over UI elements
- **Active Theory** — Same full-bleed atmospheric hero photography with overlay display type and minimal navigation, though Active Theory pushes more into motion and depth
