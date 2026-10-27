# Awwwards — Style Reference
> Swiss editorial gallery wall — oversized type, full-bleed photography, and a single black floating rail to navigate.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Awwwards operates as a curatorial editorial surface: near-monochrome gallery where one massive typographic statement introduces each featured site, anchored by full-bleed hero photography and minimal navigational chrome. The palette is ruthlessly achromatic — ink-black text on a warm pale-gray canvas — letting featured website imagery and a single sparse orange accent carry all visual energy. Components are flat, weighty, and rectangular: 8px radii across most surfaces, a floating dark tab bar, pill buttons that read as labels rather than actions. Type drives hierarchy almost entirely; the 127px display weight at 300 whispers authority rather than shouting, and the same Inter Tight family renders everything from 9px metadata to gallery-scale titles with quiet consistency.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#222222` | Primary text, filled buttons (Be Pro), dark floating nav rail, icons, input borders, table borders |
| Paper | `#ffffff` | Card surfaces, button labels, badge text, image backgrounds, content panels |
| Canvas | `#e9e9e9` | Page background, card borders, section fills — the warm gray that makes the whole surface feel printed rather than digital |
| Fog | `#dedede` | Secondary borders, icon strokes, list dividers, subtle structural lines |
| Smoke | `#808080` | Table borders, hairline dividers, muted structural lines |
| Graphite | `#4d4d4d` | Secondary surfaces, link backgrounds in compact contexts, darker fills for nested elements |
| Ash | `#b8b8b8` | Badge borders, low-emphasis outlines |
| Ember | `#fa5d29` | Sporadic accent — appears as a single-color punctuation mark on rare UI elements and score indicators; the only chromatic color in the system, used sparingly to draw the eye |

## Typography

### Inter Tight — The sole typeface. Weight 300 at 127px with 0.75 line-height for the project display title — the condensed, light weight lets 'ODD RITUAL' occupy the full viewport width as a single typographic gesture. Weight 400 covers body, nav, badges. Weight 500–600 for buttons, labels, and emphasis. The extreme size range (9px metadata to 127px display) within one family creates a deliberate mono-typographic system where hierarchy is scale, not style.
- **Substitute:** Inter Tight (Google Fonts) or Inter as fallback
- **Weights:** 300, 400, 500, 600
- **Sizes:** 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21, 22, 24, 32, 42, 127
- **Line height:** 0.75, 0.93, 1.00, 1.10, 1.17, 1.20, 1.27, 1.29, 1.36, 1.44, 1.45, 1.50, 1.70, 1.75, 1.87, 2.00, 2.15, 2.40, 3.00
- **Letter spacing:** normal at all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.5 | — |
| heading-sm | — | — | 18px | 1.36 | — |
| heading | — | — | 24px | 1.29 | — |
| heading-lg | — | — | 42px | 1.17 | — |
| display | — | — | 127px | 0.93 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 48px
- **Card padding:** 16-24px
- **Element gap:** 8-12px

### Border Radius

- **cards:** 8px
- **badges:** 4px
- **images:** 8px
- **buttons:** 8px
- **featured-cards:** 14px

## Components

### Display Project Title
**Role:** Featured site name in the hero

Inter Tight 127px weight 300, color #222222, line-height 0.93, centered. Spans nearly the full viewport width. This is the page's typographic anchor — it should be the only element competing with the hero image for attention.

### Top Navigation Bar
**Role:** Primary site navigation

Transparent/canvas background. Logo 'W.' left, nav links (Explore, Directory, Academy, Jobs, Market) in Inter Tight 13–14px weight 500 #222222, search bar centered (rounded, #e9e9e9 background, #222222 text), auth actions right. Flat, no border, no shadow. Sits directly on the warm gray canvas.

### Filled CTA Button (Be Pro)
**Role:** Primary conversion action

Background #222222, text #ffffff, Inter Tight 13–14px weight 500, 8px radius, padding 8px 16px. No border, no shadow. Dark-on-dark text contrast within the component, high contrast against the canvas.

### Outlined Button (Submit Website)
**Role:** Secondary action

Transparent background, 1px border #222222, text #222222, 8px radius, padding 8px 16px. Same dimensions as filled variant — they are a matched pair.

### Floating Tab Bar
**Role:** Section navigation overlaid on hero content

Dark pill-shaped bar with background #222222, 14px radius, horizontally centered over the hero. Contains text tabs (Nominees, Courses, Collections, Directory, Market) in #ffffff at 12–13px, plus a white 'Visit Site' button (#ffffff background, #222222 text, 8px radius) as the terminal action. Floats above content with no shadow — relies on contrast, not elevation.

### Search Input
**Role:** Site search

Background #e9e9e9 or #ffffff, border 1px #dedede, 8px radius, Inter Tight 13px placeholder text. Compact, sits inline with nav. No focus ring detected — keep minimal.

### Score Badge (New)
**Role:** Label for new or featured content

Background #222222, text #ffffff, Inter Tight 10–11px weight 600, 4px radius, padding 2px 6px. Small, rectangular, sits inline next to the label it qualifies (e.g. 'Academy [New]').

### Project Hero Image
**Role:** Full-bleed featured site screenshot

Large photograph or screenshot, 8px radius, full viewport width minus page margins. Contains overlay text elements (e.g. '01', '05', 'Scroll', 'SHOP NOW EXPLORE OUR FIRST COLLECTION') rendered directly on the image in Inter Tight — the image IS the editorial surface.

### Author Attribution
**Role:** Credit featured site creators

Inter Tight 13–14px weight 400 #222222, centered below the display title. Avatar circle (small, ~24px) with name, optional 'PRO' label. Compact, single-line, low visual weight.

### Metadata Row
**Role:** Contextual info above the display title

Three items inline: label ('Site of the Day'), date ('Apr 11, 2026'), score ('Score 7.55 of 10'). Inter Tight 11–12px weight 400, separated by spacing. Ember (#fa5d29) may appear here for the score value.

### Editorial Overlay Text
**Role:** Large text placed on hero imagery

Inter Tight weight 300–400, 32–42px, #ffffff or #222222 depending on image contrast. Examples: 'SHOP NOW EXPLORE OUR FIRST COLLECTION'. Treated as part of the image composition, not UI chrome.

### Section Heading (NOMINEES)
**Role:** Section divider title

Inter Tight 42–64px weight 300–400, #222222, centered. Acts as a typographic full-stop between editorial sections — the 'Latest' label sits above in 11–12px as a kicker.

## Do's and Don'ts

### Do
- Use Inter Tight weight 300 at 100–127px for any display/project title — the light weight is the signature, not bold
- Set 8px border-radius on all buttons, cards, badges, and images; use 14px only on featured/large cards, 4px on small inline badges
- Keep the palette 95% achromatic — Ink (#222222), Paper (#ffffff), Canvas (#e9e9e9), Fog (#dedede) — and reserve Ember (#fa5d29) for single-element punctuation
- Use 0.93–1.0 line-height on display sizes (42px and above) to let oversized type feel architectural rather than airy
- Place text directly on hero photography as editorial overlay — don't wrap images in card containers
- Match filled and outlined button pairs at identical padding (8px 16px) and radius (8px) so they read as one system
- Use 8px as the base gap between elements; jump to 24px or 48px for section separation, skip the in-between

### Don't
- Don't introduce color beyond Ember — no blues, greens, or multi-color accent systems. The achromatic discipline IS the brand
- Don't use weight 700+ for titles. The system is anti-bold; weight 300 at extreme sizes is the voice
- Don't add box-shadows to cards or buttons. Elevation comes from color contrast against the warm gray canvas, not drop shadows
- Don't use border-radius values other than 4px, 8px, or 14px — the system has exactly three radii and they map to specific element types
- Don't constrain the hero to a max-width. Project displays and hero images are full-bleed; the page is a gallery wall, not a centered document
- Don't use gradients on any UI element. The palette is flat — gradients dilute the editorial clarity
- Don't set body text below 11px or above 16px. The type system has a tight body range; everything else is display or metadata

## Elevation

- **Floating Tab Bar:** `none — relies on color contrast against the hero image, not shadow`
- **Cards:** `none — flat against the warm gray canvas`
- **Buttons:** `none — flat surfaces, contrast carries hierarchy`

## Surfaces

- **Canvas** (`#e9e9e9`) — Page background — the warm gray foundation
- **Paper** (`#ffffff`) — Card surfaces, content blocks, raised panels
- **Ink** (`#222222`) — Dark floating nav rail, filled buttons, inverse surfaces
- **Graphite** (`#4d4d4d`) — Nested dark elements, secondary inverse fills

## Imagery

The site is image-forward in an editorial, not marketing, way. Full-bleed photography dominates: large editorial shots of designers, studio scenes, and lifestyle imagery that contextualize each featured website's creators. Photography treatment is naturalistic — warm, slightly muted color grading, no heavy filters or duotones. The images serve as canvases for overlaid display type rather than as decorative accents. No illustrations, no abstract graphics, no 3D renders. Icon style is minimal: small monoline icons in #222222 with ~1.5px stroke weight, used sparingly for nav and UI controls. The overall density is image-dominant in the hero region, text-dominant in navigation and metadata areas.

## Layout

Full-bleed editorial layout with no max-width constraint on the canvas. The page is a vertical sequence of full-viewport editorial moments: (1) top nav bar sitting directly on the warm gray canvas, (2) centered metadata + massive display title + author credits, (3) full-bleed hero photograph with floating dark tab bar overlay and editorial text burned into the image, (4) 'Latest' section with large typographic section header. Navigation is a single top bar with inline search. The floating dark tab bar (Nominees, Courses, etc.) persists over hero content and provides section switching without traditional nav. Section rhythm is generous — 48px+ between editorial moments — with the typographic scale providing separation rather than visual dividers or colored bands. Content is centered within the full-bleed canvas; there is no asymmetric grid in the editorial hero zone.

## Similar Brands

- **It's Nice That** — Same editorial gallery approach with oversized light-weight display type, full-bleed creative photography, and near-zero chromatic color
- **SiteInspire** — Curatorial web design showcase with similar monochrome restraint, single-typeface system, and typography-driven hierarchy
- **Minimal Gallery (Cargo)** — Portfolio/showcase aesthetic with full-bleed imagery, minimal UI chrome, and warm gray canvas backgrounds
- **The Browser Company** — Dark floating nav elements paired with light content surfaces, and a typographic-forward layout that lets content breathe
- **Kottke.org** — Dense editorial single-column layout with minimal color, where typography size (not color or weight) creates the visual rhythm
