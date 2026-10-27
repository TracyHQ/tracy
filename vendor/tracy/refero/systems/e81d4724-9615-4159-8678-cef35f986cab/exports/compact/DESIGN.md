# Scale — Style Reference
> Museum-quality darkroom gallery meets technical blueprint

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Scale AI operates as a dark-to-light cinematic system: the hero is a full-bleed photographic frame with massive whisper-weight headlines at 64–116px, then drops into a deep black band where a wireframe illustration floats against pure void, before settling into a calm light-mode product surface. Typography is the signature — Aeonik at weight 400 for headings instead of the typical 600–700, creating authority through restraint rather than volume, with tight -0.01em tracking across the board and a mono companion for labels and tags. The palette is deliberately restrained: white, black, and a ladder of grays do 95% of the work, with muted earth tones (warm tan, forest green, dusty violet, slate blue) used as categorical accents on section headings and decorative surfaces. Cards are flat with 16px radii, no shadows, generous 32px padding — information sits on the surface rather than floating above it.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure White | `#ffffff` | Page background, card surfaces, text on dark — the dominant canvas that makes muted accents feel deliberate |
| Obsidian | `#000000` | Primary text, nav background, dark-band canvas, CTA fills — maximum contrast anchor |
| Soft Mist | `#f2f2f2` | Secondary surface for elevated cards and section backgrounds, one step above canvas |
| Pale Stone | `#eaeaea` | Section band dividers, mobile nav close buttons, alternating rhythm breaks |
| Bone | `#e5e5e5` | Sub-surface for nested cards and decorative icon washes |
| Graphite | `#575757` | Body text, helper copy, secondary descriptions — readable but recessed |
| Smoke | `#929292` | Mid-tone panel surface for subdued dark UI layers and secondary containers. Do not promote it to the primary CTA color |
| Charcoal | `#212121` | Filled button background, dark surface panels — soft alternative to pure black |
| Silhouette | `#c7c7c7` | Outlined login button border — visible but never assertive |
| Warm Sandstone | `#a8927c` | Earth-tone accent — large section surface tints and muted icon fills, used as a categorical color for one product vertical |
| Forest Sovereignty | `#193a29` | Deep green accent — large feature surface and heading color for a categorical product vertical |
| Dusty Iris | `#79648c` | Muted violet accent — categorical heading color and decorative iconography |
| Slate Blue | `#839cb2` | Cool blue-gray accent — decorative SVG strokes and icon fills |

## Typography

### Aeonik — Primary typeface across all UI — headings use weight 400 (anti-convention), body uses 400, emphasis labels use 500, uppercase link microcopy uses 600 with capitalize transform
- **Substitute:** Inter, or Satoshi for closer geometric proportions
- **Weights:** 400, 500, 600
- **Sizes:** 14px, 16px, 20px, 24px, 32px, 36px, 40px, 64px, 116px
- **Line height:** 1.00–1.50 depending on size
- **Letter spacing:** -0.025em at 116px display, -0.01em across 16–64px, 0.025em at 14px caps
- **OpenType features:** `"ss02" on`

### Mono — Tertiary labels, tag pills, button microcopy — uppercase at 11px with +0.05em tracking, sentence-case at 13px with -0.01em
- **Substitute:** JetBrains Mono, or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 11px, 13px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.01em at 13px, +0.05em at 11px uppercase
- **OpenType features:** `"ss02" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro-label | — | — | 11px | 1 | 0.55px |
| caption | — | — | 14px | 1.5 | 0.35px |
| body-sm | — | — | 16px | 1.5 | — |
| body | — | — | 20px | 1.5 | -0.2px |
| subheading-sm | — | — | 24px | 1.5 | -0.24px |
| subheading | — | — | 32px | 1.19 | -0.32px |
| heading-sm | — | — | 36px | 1.1 | -0.36px |
| heading | — | — | 40px | 1.25 | -0.4px |
| heading-lg | — | — | 64px | 1.05 | -0.64px |
| display | — | — | 116px | 1 | -1.16px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **tags:** 8px
- **cards:** 16px
- **buttons:** 8px
- **nested-cards:** 12px
- **feature-panels:** 24px

## Components

### Hero Full-Bleed Photo
**Role:** Opening frame — full-viewport photographic background with centered overlay headline

Full-bleed dark-toned photograph with a dark overlay tint. Centered headline at 64px Aeonik weight 400, white, letter-spacing -0.64px, line-height 1.05. No card chrome — the image IS the surface. Bottom-right scroll prompt with down-arrow glyph in an 8px-radius outlined square.

### Black Void Section
**Role:** Intermediate transition band — pure black canvas for wireframe illustration and statement

Full-bleed #000000 background, no border, no shadow. Centered wireframe illustration floats in negative space. Subheadline at 24px Aeonik 500 white, supporting body at 16px white at 70% opacity. This section exists to make the return to white feel like daylight.

### Primary CTA Button (Filled Dark)
**Role:** Main conversion action — nav 'Book Demo' and primary form submissions

Background #000000 or #212121, text #ffffff, 6–8px radius, 16px vertical / 16px horizontal padding, Aeonik 400 at 16px. No border. Inverts to white background / black text on hover within dark sections.

### Ghost Text Button (Nav Link)
**Role:** Inline navigation and editorial links — Products, Solutions, Research, Resources

Transparent background, text #000000, no border, no radius, no padding. Aeonik 400 at 16px. Becomes the default link style — the site's primary clickable surface.

### Outlined Login Button
**Role:** Secondary nav action — Log in

Transparent background, 1px solid #c7c7c7 border, text #929292, 8px radius, padding 8px 16px. Aeonik 400 at 16px. Deliberately quiet — signals a lower-stakes action than the dark filled CTA beside it.

### Feature Card (Flat White)
**Role:** Testimonial, case study, and feature content containers

Background #ffffff, 16px radius, NO shadow, 32px padding on all sides. Content stacks vertically with 16–32px gaps. No border. Flat sits-on-surface treatment — cards are defined by padding and radius alone.

### Category Accent Surface
**Role:** Large decorative panels tinted with a categorical accent color

Background uses one of the four accent tones (#a8927c, #193a29, #79648c, #839cb2) as a wash. Headline text in the same or deeper shade. 12–24px radius. No border, no shadow. These are NOT cards — they are editorial color fields.

### Logo Grid Card
**Role:** Partner / client logo showcase tile

White card, 16px radius, 32px padding. Logo positioned top-left in an 8px-radius container. Headline at 16–24px Aeonik 400, partner name caption at 13px Aeonik 400 in Graphite #575757.

### Section Heading Stack
**Role:** Editorial section opener — used above all content sections

Display headline at 40–64px Aeonik weight 400, #000000, tracking -0.4 to -0.64px. Optional eyebrow or tagline above in mono micro-label at 11px uppercase, +0.55px tracking. Single-line restraint — no decoration.

### Carousel Navigation Arrow
**Role:** Pagination control for horizontal scrolling card grids

Square button ~40×40px, 8px radius, 1px solid border, white background, black chevron glyph centered. Left/right pair always visible at the right edge of the section heading.

### Scroll Prompt
**Role:** Bottom-right hero affordance — tells the user there is more content below

Text 'Scroll to explore' at 13px mono in white, paired with a 40×40px outlined square containing a downward chevron. Anchored to the bottom-right of the hero viewport.

### Footer Container
**Role:** Dark closing band — legal, sitemap, and secondary nav

Background #000000, generous vertical padding (80–120px), white text. Logo and tagline stack at the left, link columns in a 3–4 column grid. Mono micro-labels at 11px uppercase for column headers.

## Do's and Don'ts

### Do
- Use weight 400 for all headings — authority comes from size and tracking, not weight
- Apply -0.01em letter-spacing consistently across 16–64px type
- Set cards to 16px radius with NO box-shadow — let padding and radius define the surface
- Use 32px padding for all card interiors at the standard tier
- Constrain content to max-width 1280px with a 16px viewport gap
- Keep the dark hero → black void → white product surface rhythm when designing multi-section pages
- Use the four accent tones (warm tan, forest green, dusty violet, slate blue) as categorical section colors, not decoration

### Don't
- Do not use bold (600+) for headlines — the system relies on weight 400 restraint
- Do not add drop shadows to cards or panels — elevation is communicated by spacing and tone
- Do not use the accent colors as text on white — they are surface washes, not foreground tokens
- Do not introduce gradients — the palette is deliberately flat
- Do not use border-radius below 8px or above 24px on standard components
- Do not place body copy above 20px size — readability collapses past this point
- Do not use saturated brand colors for buttons — the CTA system is monochrome (black or white)

## Elevation

The system uses no decorative elevation. Cards, panels, and surfaces are defined by background color contrast, generous padding, and 8–16px border-radius. The only shadow in the system is a utility-level 0 1px 3px rgba(0,0,0,0.1) used sparingly for floating interactive elements. This flatness is deliberate — it reads as technical, editorial, and confident rather than playful or skeuomorphic.

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background for the light-mode product surface
- **Soft Mist** (`#f2f2f2`) — Section band background, elevated card surface
- **Pale Stone** (`#eaeaea`) — Rhythm break between sections, mobile nav chrome
- **Bone** (`#e5e5e5`) — Nested card sub-surface, icon container background
- **Accent Wash** (`#a8927c`) — Categorical color field for editorial sectioning
- **Dark Void** (`#000000`) — Full-bleed dark band for statement moments and footer

## Imagery

Imagery operates in two distinct registers. The hero uses full-bleed documentary photography — a darkened, desaturated image of a person inside an MRI scanner — treated with a near-black overlay so the white headline reads cleanly. This is mood-establishment photography: staged but not lifestyle, human but not portraiture. Below the hero, imagery shifts to wireframe and blueprint illustration — thin white line-work on pure black showing geometric AI/ML diagrams — which reads as technical schematic rather than decoration. Further down, the site moves into a near-illustration-free zone: logo grids, partner wordmarks, and white card content do the work. Icons throughout are mono-stroke, thin-weight, drawn from a single geometric family — no multicolor icon sets.

## Similar Brands

- **Linear** — Same weight-400 headline restraint and tight tracking, same flat-no-shadow card system, same dark-to-light cinematic page rhythm
- **Anthropic** — Massive whisper-weight serif/sans headlines over photographic backgrounds, monochrome UI with single categorical accents
- **Stripe** — Same gradient-free flat surface system, same generous 32px card padding, same technical editorial register
- **Vercel** — Same near-monochrome palette with a single muted accent, same flat cards with no elevation, same 16px standard radius
- **Runway** — Same full-bleed dark photographic hero treatment, same wireframe/blueprint illustration style for technical content
