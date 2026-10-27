# Channel Studio — Style Reference
> Studio darkroom with a single coral flare

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Channel Studio lives in a monochrome studio-darkroom: near-black canvas, flat surfaces, no shadows, no gradients, and a single warm coral red that fires like a signal flare against the grayscale. Typography carries the entire identity — one neo-grotesque sans-serif at one weight, tight negative tracking, and display sizes (45px, 75px) set at sub-1.0 line-heights so headlines stack like a concrete poem. Layout is full-bleed and editorial: alternating type-only black panels and oversized project photography that treats the viewport as a gallery wall. Components are stripped to bare text and raw images — no buttons in the traditional sense, just links with arrows, small uppercase labels, and a red accent reserved exclusively for project titles and signature borders.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone Gray | `#cacaca` | Primary text on dark surfaces, hairline borders on images and links, divider strokes — a desaturated near-white that reads softer than pure #fff against black |
| Carbon Black | `#0a0a0a` | Page background, section canvas, project card surface — the entire design lives here |
| Iron Gray | `#727272` | Muted secondary text, low-emphasis borders, caption-level metadata |
| Coral Flare | `#ff7777` | Accent for project titles, signature heading borders, and occasional decorative strokes — the only chromatic element in the system, used sparingly for editorial emphasis |

## Typography

### Lausanne — Sole typeface across all roles — navigation, body, subheadings, and display headlines. Weight stays at 400 throughout; visual hierarchy is built entirely through size and tracking, not weight. Display at 75px uses line-height 0.90–0.95, creating a compressed poetry-staircase effect unique to this system.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 13px, 15px, 16px, 18px, 45px, 75px
- **Line height:** 0.90–1.20
- **Letter spacing:** -0.03em on display (75px) = -2.25px, -0.03em on heading (45px) = -1.35px, -0.02em on body and smaller (13–18px) = -0.26 to -0.36px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | -0.26px |
| body-sm | — | — | 15px | 1.2 | -0.3px |
| subheading | — | — | 18px | 1.2 | -0.36px |
| heading | — | — | 45px | 1.19 | -1.35px |
| display | — | — | 75px | 0.9 | -2.25px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 40px
- **Card padding:** 0px
- **Element gap:** 10px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Top Navigation
**Role:** Primary site navigation

Flat text-only nav in the top-left corner. Logo 'C:S' set in 18px Lausanne, navigation links (Home, Projects, About, Careers) below in 13px. No background, no border, no hamburger — just typographic blocks against the black canvas with 9–10px vertical rhythm.

### Hero Display Headline
**Role:** Hero section typography

75px Lausanne weight 400, line-height 0.90, letter-spacing -0.03em, color #cacaca. Lines stack tightly creating a staircase block. Set in the top-left over a full-bleed grayscale photographic background (studio lighting / brushed metal).

### Full-Bleed Hero Background
**Role:** Atmospheric hero surface

Grayscale photographic or 3D-rendered texture filling the entire viewport — often soft studio lighting, particle clouds, or abstract metallic gradients. All desaturated to near-monochrome. Acts as the only non-black surface in the system.

### Section Display Headline
**Role:** Large editorial text on black panels

45–75px Lausanne weight 400, line-height 0.95, color #cacaca on black background. Typically left-aligned, no max-width constraint beyond the viewport. Carries the full message of the section in type alone.

### Client Logo Strip
**Role:** Social proof / client listing

Small uppercase label 'Select Clients:' in 13px #cacaca, followed by a horizontal row of grayscale client logos (NYT, Microsoft, Google, etc.). Logos are rendered in #cacaca or near-white, no color, no borders, evenly spaced with 10–19px gaps.

### Project Card
**Role:** Portfolio entry / case study preview

Full-bleed image filling the entire viewport width. Above the image: small uppercase label (e.g. 'Channel Studio - Selected Projects:') in 13px #cacaca, project title in 45px Lausanne #ff7777 (the only red element), and a 'See Project →' link in 13–15px #cacaca right-aligned. No card chrome, no border, no radius — the image IS the card.

### Arrow Link
**Role:** Text link with directional indicator

13–15px Lausanne #cacaca text followed by a thin → arrow. Used for navigation to projects, external links, and calls-to-read. No underline, no button background — the arrow glyph is the affordance.

### Decorative Coral Border
**Role:** Signature accent stroke

1px solid #ff7777 line used as a horizontal divider or section accent. Appears under key headings or as a section separator. The coral red stroke against black is the system's most distinctive non-typographic element.

### Footer
**Role:** Site footer

192px top margin separates footer from content above. Contains small text links and metadata in 13px #cacaca. Minimal, text-only, no social icons or decorative elements.

### Inline 3D Render
**Role:** Decorative/artistic element

Full-color or grayscale 3D renders (particle clouds, abstract forms) embedded in type-only sections as visual punctuation. Floats or sits beside text, breaking the pure typography flow.

## Do's and Don'ts

### Do
- Use #cacaca for all text and borders on black surfaces — never pure #fff, the slight desaturation is the signature
- Set display headlines at 75px with line-height 0.90 and letter-spacing -0.03em for the compressed staircase effect
- Reserve #ff7777 exclusively for project titles and signature borders — never use it for body text, navigation, or UI controls
- Keep all radii at 0px — sharp edges are non-negotiable for this editorial aesthetic
- Use full-bleed imagery (viewport-width) for all project cards and hero sections; never constrain images to card-sized containers
- Maintain generous vertical spacing: 40px between sections, 192px above the footer
- Set all type in Lausanne weight 400 — build hierarchy through size and tracking, never through bold weights

### Don't
- Never use shadows, gradients, or any elevation effects — the design is deliberately flat
- Never add border-radius to cards, buttons, images, or any element — 0px everywhere
- Never use color other than #ff7777 for accents — no blues, greens, or other hues; the system is monochromatic plus one coral
- Never set body or heading text in pure #fff — always use #cacaca for the softened-light quality
- Never use multiple font weights — the system is weight 400 only across all roles
- Never use centered text alignment for body content — everything is left-aligned with the viewport edge
- Never add background colors to cards, buttons, or interactive elements — they sit directly on the black canvas

## Elevation

No shadows, no elevation effects, no z-axis depth. All elements sit flat on the black canvas. Visual separation comes from whitespace, typographic scale, and full-bleed imagery — not from drop shadows or card elevation. This flatness is a deliberate editorial choice that keeps the design feeling like a printed magazine spread rather than a software interface.

## Surfaces

- **Carbon Canvas** (`#0a0a0a`) — Page background, all section panels, footer — the single base surface
- **Grayscale Photographic Surface** (`#cacaca`) — Full-bleed hero backgrounds and atmospheric imagery — desaturated photographic textures that read as a lighter surface without being a solid color

## Imagery

Photography is central — full-bleed, viewport-width, often desaturated or near-monochrome to harmonize with the black-and-gray palette. Project showcases use tight, intimate crops (close-up of a translucent sculpture, macro product detail) rather than wide environmental shots. 3D renders (particle clouds, abstract forms) appear as decorative punctuation in type-only sections. The grayscale hero in the first screenshot — soft studio lighting on what appears to be brushed metal or fabric — exemplifies the atmospheric, gallery-lit treatment. No stock photography, no people, no lifestyle imagery.

## Layout

Full-bleed sections that fill the entire viewport width. Content is left-aligned against the left edge with consistent left padding. The page alternates between two section types: (1) type-only black panels with large display headlines, small labels, and inline 3D renders or client logos, and (2) full-bleed project images with overlaid labels. No max-width content container — text and images both edge-to-edge. Vertical rhythm is generous: 40px between sections, 192px above the footer. Navigation is a small text block in the top-left corner, not a bar. The overall effect is a vertical-scroll editorial spread, not a typical SaaS page layout.

## Similar Brands

- **Acne Studios** — Same editorial fashion-studio aesthetic with full-bleed photography, monochrome palette, and a single warm accent color used sparingly
- **COS** — Minimal fashion-brand restraint with flat surfaces, zero radii, and typography-driven hierarchy over decorative UI elements
- **Pentagram** — Design-agency portfolio layout with large display type, project-card-as-full-bleed-image pattern, and minimal navigation chrome
- **Manual (design agency)** — Dark-mode design studio site with single-weight sans-serif, tight letter-spacing, and image-led case study presentation
- **Bureau Cool** — Editorial studio aesthetic with compressed display type, generous whitespace, and flat black-canvas layout
