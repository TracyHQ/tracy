# Maëlan Le Meur — Style Reference
> Museum wall, warm parchment and tobacco — a portfolio printed on bone-colored paper with ink-black display type and deep umber chapter breaks.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Maëlan Le Meur is an editorial portfolio rendered in the voice of a printed art book: a warm parchment canvas (#eee9cc) carrying the entire interface, with deep tobacco and near-black blocks used as chapter dividers rather than chrome. Typography is a single weight — PP Neue Montreal 400 — stretched across an extreme scale that goes from 15px captions to 317px display words, creating hierarchy through size and whitespace alone rather than weight shifts or color emphasis. There are no buttons, no cards with shadows, no rounded containers in the conventional sense; the only radius that exists in the system is 40px, applied to link affordances. Every surface is a full-bleed band, every section is a typographic statement, and the whole composition reads like a gallery wall — confident, quiet, and unhurried.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#eee9cc` | Primary canvas and card surface — the warm bone tone that carries all body content, tables, and quiet sections |
| Aged Linen | `#cecab1` | Secondary surface and muted text — slightly deeper parchment for sub-surfaces, helper text, and table headers |
| Tobacco Brown | `#674825` | Chapter-break sections and featured band backgrounds — rich warm umber that anchors the page's heaviest typographic moments |
| Midnight Espresso | `#1e1915` | Full-bleed dark sections and navigation background — the near-black that creates the page's dramatic section breaks |
| Ink Black | `#111111` | Primary text and hairline rules — the deepest tone for body copy, headings, table content, and footer dividers |

## Typography

### PP Neue Montreal — The sole typeface across the entire system — used at every size from 15px captions to 317px display words. Weight stays at 400 throughout, so hierarchy is built purely through scale, whitespace, and the choice of dark or light ground. This single-weight restraint is the signature: no bold, no italic, no medium — just one calm voice that gets larger or smaller depending on how much the page wants to say. Substitute with Inter or Söhne for similar geometric neutrality.
- **Substitute:** Inter, Söhne, or any geometric grotesque at weight 400
- **Weights:** 400
- **Sizes:** 15px, 16px, 26px, 30px, 58px, 115px, 225px, 317px
- **Line height:** 0.95–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 1.5 | — |
| body | — | — | 26px | 1.2 | — |
| subheading | — | — | 30px | 1.2 | — |
| heading-sm | — | — | 58px | 0.95 | — |
| heading | — | — | 115px | 0.95 | — |
| heading-lg | — | — | 225px | 0.95 | — |
| display | — | — | 317px | 0.95 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Card padding:** 40px
- **Element gap:** 20px

### Border Radius

- **cards:** 0px
- **links:** 40px
- **buttons:** 0px

## Components

### Full-Bleed Dark Section
**Role:** Chapter-break bands that segment the portfolio

Full-viewport-width section with #1e1915 background, white or parchment text, 210px vertical padding. Labeled in large type (58px+) left-aligned. These are not cards — they are architectural divisions of the page.

### Display Heading Block
**Role:** Hero and section statement typography

PP Neue Montreal 400 at 115–317px, line-height 0.95, text in #111111 on parchment or #eee9cc on dark. Characters often bleed off the right edge of the viewport — the type is cropped, not contained. No margin, no max-width constraint.

### Top Navigation Bar
**Role:** Persistent site navigation

Full-width bar with #1e1915 background. Brand name 'Maëlan' left-aligned in small caps at 15–16px. Three nav items (VOUS, RÉALISATIONS, ÉCRIVEZ-MOI) right-aligned in uppercase tracking. No borders, no background fill on items — pure typographic links.

### Text Navigation Link
**Role:** All interactive navigation throughout the site

PP Neue Montreal 400 at 15–16px, uppercase, color #eee9cc on dark or #111111 on parchment. No underline, no background, no border. The 40px radius from the data applies to the link's hit area or subtle pill treatment.

### Section Label Heading
**Role:** Category headers within the portfolio grid

26–30px PP Neue Montreal 400, #111111, left-aligned with generous left padding (40px). Used to label sections like 'Design de marque', 'Design d'objet', 'Design d'événement', 'Design web'.

### Quote / Manifesto Block
**Role:** Large typographic statement sections

Multi-line statement set at 58–115px PP Neue Montreal 400, line-height ~1.0, #111111 on #eee9cc background. Text fills the viewport width without a max-width container — lines are deliberately long, creating a rhythmic typographic wall.

### Project Table
**Role:** Portfolio listing of works

Three-column table (PROJET, DESCRIPTION, DATE) with header row in #cecab1 tone and body rows separated by 1px hairlines in #111111. Headers in small uppercase at 15px, body text at 16px. Full-width, no rounded corners, no cell padding asymmetry — strict editorial grid.

### Table Row
**Role:** Individual project entry

Single row with 20px vertical padding, separated by a 1px #111111 hairline. Project name in uppercase, description in mixed case, date right-aligned. No hover state, no background change — static editorial listing.

### Featured Band Header
**Role:** Page title section with warm color background

Full-width #674825 (Tobacco Brown) band with large display text in #eee9cc at 225px+. Used for major page transitions like 'Réalisations'. Text bleeds to the right edge of the viewport, creating a cropped, dramatic title treatment.

### Footer
**Role:** Site footer

Minimal footer using #111111 text on #eee9cc background. Small text at 15px, hairline 1px border-top in #111111. No links, no social icons, no columns — just attribution text.

## Do's and Don'ts

### Do
- Use PP Neue Montreal 400 at every size — never introduce bold, medium, or italic weights; the single-weight restraint is the signature
- Set all large display text (58px+) with line-height 0.95 to create the tight, architectural rhythm
- Apply 210px vertical padding to full-bleed section bands to create the gallery-wall breathing room
- Use #1e1915 and #674825 as full-bleed chapter breaks — never as card or component backgrounds
- Let display type bleed off the right viewport edge without a max-width container
- Build all navigation as typographic text links at 15–16px uppercase — no buttons, no pills, no fills
- Separate table rows with 1px #111111 hairlines — never use row backgrounds or zebra striping

### Don't
- Do not introduce accent colors, gradients, or chromatic highlights — the warm earth palette is the entire system
- Do not add shadows, elevations, or depth effects to any component — the design is intentionally flat
- Do not use rounded corners on cards, inputs, or containers — the only radius is 40px, reserved for link hit areas
- Do not set a max-width on hero or display sections — the type is meant to crop at the viewport edge
- Do not use color to indicate interactive states — links remain typographically identical across hover, active, and visited
- Do not add icons, badges, or decorative graphics inside text blocks — the typographic hierarchy carries all meaning
- Do not use line-height above 1.20 for any heading or display size — tight leading is essential to the editorial feel

## Elevation

The system is entirely flat — no shadows, no glows, no elevation. Depth is created exclusively through the contrast between the warm parchment canvas and the deep umber/espresso section bands. Components sit on the page as typographic statements, not as raised surfaces.

## Surfaces

- **Parchment Canvas** (`#eee9cc`) — Default page background for all body content, tables, quotes, and text-heavy sections
- **Aged Linen Sub-surface** (`#cecab1`) — Muted secondary surface for table headers, helper zones, and slightly recessed text blocks
- **Tobacco Feature Band** (`#674825`) — Full-width featured sections with display typography — creates warm color punctuation
- **Midnight Espresso Break** (`#1e1915`) — Full-bleed dark section dividers, navigation bar, and the page's dramatic dark bands

## Imagery

No photography, illustration, or decorative imagery in the conventional sense. The visual content IS the typography — oversized words like 'Réalisations' at 225px+ serve as the hero imagery. The only graphic element is a serif/italic 'M' monogram used as a brand mark on dark sections. The portfolio itself is text-only (project names, descriptions, dates) — no thumbnails, no project images, no case study visuals. This is a purely typographic portfolio.

## Similar Brands

- **Studio Dumbar** — Same editorial portfolio approach with single-weight typography, full-bleed color bands, and oversized display type that bleeds off the viewport edge
- **Pentagram** — Identical typographic-first portfolio language — no decorative imagery, project listings as text tables, warm neutral canvas, and display type as the primary visual element
- **A Practice for Everyday Life** — Same museum-catalog sensibility with earth-tone palette, single-weight sans-serif, and section-based page architecture with generous vertical rhythm
- **Heydays (Oslo)** — Same warm parchment canvas, restrained earth-tone palette, and editorial typographic hierarchy built through scale rather than weight variation
