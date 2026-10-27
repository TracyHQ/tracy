# alet — Style Reference
> Vintage editorial contact sheet on warm taupe paper.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ALET Agency operates as a print-magazine spread translated to the web: a warm taupe canvas (#ada59b) swallows the entire page, typography stays whisper-small (11–13px WorkSans for all UI), and the ALET wordmark itself is set in a light serif with extreme letter-spacing that reads more like a magazine masthead than a logo. The entire color palette is strictly achromatic warm grays — there is no accent color, no CTA button fill, no state color. All visual interest comes from the photograph grid: an asymmetric, scattered arrangement of editorial imagery with floating category labels (GRAPHIC DESIGN, SOCIAL MEDIA, ART DIRECTION, etc.) positioned around it like captions on a contact sheet. Components are nearly invisible — no cards, no shadows, no fills, no rounded containers. The interface dissolves into the paper, and the work is the only thing the eye lands on.

## Colors

| Name | Value | Role |
|------|-------|------|
| Taupe Paper | `#ada59b` | Full-page canvas, the single dominant surface — every section and component sits on this warm gray, never on white or near-black. The warm undertone (vs cool slate) is what makes the whole site feel like printed stock rather than a digital UI |
| Ink Black | `#000000` | Primary text, all borders, all hairlines, all SVG strokes. Used at full opacity — no softened text grays, no 80% black. The crispness against warm taupe creates the magazine-printed feel |
| Charcoal | `#252525` | Navigation text and the nav underline borders. Slightly softer than pure ink for the persistent top-of-page chrome so the nav recedes behind the work |
| Graphite | `#101010` | Secondary text and supporting borders where Charcoal reads too soft but pure Ink is too loud. The single mid-step between nav and body |
| Stone | `#454545` | Occasional inset surface for body-level containers — the only tonal step above the canvas, used sparingly for any small frame or block that needs to separate from the page without introducing color |
| Press Black | `#060506` | Fine SVG illustration stroke — near-identical to Ink Black but kept distinct in the source. Use for line-art icons and decorative vector marks |

## Typography

### WorkSans — All UI chrome: navigation, category labels, body copy, metadata, toggle text. Deliberately tiny — 11–13px forces an editorial intimacy and keeps the page from feeling like a product interface. Set in Work Sans Regular at default tracking; the small size is what makes it feel like print captions rather than web UI.
- **Substitute:** Inter, IBM Plex Sans, or any humanist sans at the same size to preserve the caption-like feel
- **Weights:** 400
- **Sizes:** 11px, 12px, 13px
- **Line height:** 1.00–1.50

### SilkSerif — The ALET wordmark and any other serif display moment. Light weight at 23px with tight leading (0.94) and extremely wide letter-spacing — the letters almost float apart. The serif is the only non-sans on the site, which is what makes the brand mark readable as a masthead rather than a wordmark.
- **Substitute:** Cormorant Garamond Light, Playfair Display, or any high-contrast transitional serif at light weight with letter-spacing opened to roughly 0.5em
- **Weights:** 300 (Light)
- **Sizes:** 23px
- **Line height:** 0.94

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.1 | — |
| body-sm | — | — | 12px | 1.1 | — |
| body | — | — | 13px | 1.1 | — |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Section gap:** 101-180px
- **Card padding:** 0px
- **Element gap:** 11-23px

### Border Radius

- **images:** 0px
- **buttons:** 9999px
- **smallFrames:** 10.8px

## Components

### Editorial Image Tile
**Role:** The work — photography placed on the taupe canvas in an asymmetric scattered grid

Full-bleed photographs at varying aspect ratios, positioned with marginLeft/marginTop in irregular offsets (101–209px range). No border, no shadow, no radius. Sharp 0px corners. Image content provides all color in the entire system.

### Floating Category Label
**Role:** Anchors the image grid — names the discipline (GRAPHIC DESIGN, SOCIAL MEDIA, ART DIRECTION, etc.)

11–12px Work Sans Regular, uppercase, Ink Black (#000000), normal tracking, positioned absolutely around the image field like a contact-sheet caption. No background, no border, no underline.

### Corner Nav Link
**Role:** Primary navigation — top-left and top-right clusters

11–12px Work Sans Regular, uppercase, Charcoal (#252525). Separated by 36px gaps in the top bar. Hover swaps to Ink Black. No fill, no underline at rest — a 1px Charcoal border-bottom may appear on the active route.

### ALET Wordmark
**Role:** Centered masthead in the top bar — the only serif on the site

SilkSerif Light at 23px, Ink Black, letter-spacing opened to roughly 0.5–0.8em (letters nearly detached), line-height 0.94. Functions as a magazine title plate, not a logo lockup.

### Layout Toggle
**Role:** Switches the image grid between LINEAR and RANDOM arrangement

11px Work Sans, uppercase, flanking a 9999px-radius pill track with a small circular thumb (roughly 10.8px diameter). Track and thumb are stroke-only in Ink Black on the taupe canvas — no fill states, no color.

### Studio Statement
**Role:** Centered editorial blurb below the image field

13px Work Sans Regular, Ink Black, set in a centered single-block paragraph beneath the grid. No surrounding container — the type floats directly on the taupe paper.

### Hairline Divider
**Role:** Section separation

1px Ink Black line spanning the full viewport width. Used extremely sparingly — the system prefers whitespace and the scattered image field to communicate rhythm over explicit dividers.

### Pill Container
**Role:** Rare surface for a small inline element (e.g. the toggle track)

9999px border-radius, 1px Ink Black stroke, transparent fill on the taupe canvas. The pill is the only rounded form in the system and appears only on the layout toggle.

## Do's and Don'ts

### Do
- Use #ada59b as the page canvas for every section, every page, every state — the taupe paper is the brand
- Set all UI text at 11–13px in Work Sans Regular; never scale up to 14–16px for a 'primary' label
- Set the ALET wordmark in Silk Serif Light at 23px with letter-spacing opened to ~0.5em
- Use #000000 for all text, borders, and SVG strokes at full opacity — no softened blacks
- Place photographs at 0px radius, no border, no shadow — let the image edges meet the canvas directly
- Use 9999px radius only for the layout-toggle pill; 10.8px only for tiny inset frames; everything else stays sharp
- Keep section gaps in the 101–209px range — the page breathes like a printed spread, not a dashboard

### Don't
- Do not introduce any chromatic color — no accent, no CTA fill, no status greens/reds/blues
- Do not use white, off-white, or near-black as a section background — the taupe canvas is the only surface
- Do not add box-shadows, elevation, or gradient fills to any component
- Do not use a sans-serif for the wordmark or any display moment — Silk Serif is the only serif and the only size above 13px
- Do not round image corners or wrap photographs in cards with fills or borders
- Do not center body text in narrow columns — the studio statement is the only centered block, and it spans a wide measure
- Do not use large display weights (600–700) — the system runs entirely on Regular and Light

## Elevation

The design intentionally avoids elevation entirely. There are no shadows, no overlays, no z-axis depth cues. Components sit flush on the taupe canvas like prints pinned to a wall. Where a component needs separation, use a 1px hairline in Ink Black or a subtle 10.8px rounded frame in Stone — never shadow.

## Surfaces

- **Taupe Paper** (`#ada59b`) — The entire page. No section ever changes background color — the canvas is monolithic and the photographs are the only color that ever appears.
- **Stone Block** (`#454545`) — Rare inset surfaces — the occasional small framed block or bordered container that needs a subtle tonal lift off the canvas.

## Imagery

Photography is the sole source of color in the entire system. The site is a grid of tightly cropped editorial stills — packaging shots, interior photography, portrait details, product on table — all at high resolution, all at sharp 0px corners, scattered with irregular offsets (101–209px) so the grid reads as a contact sheet rather than a structured grid. The photographs are warm, slightly desaturated, lit naturally — they sit comfortably on the taupe canvas without jarring against it. No illustrations, no icons beyond tiny line-art strokes, no 3D renders, no abstract graphics. Image-heavy layout where photography occupies roughly 40–50% of the viewport in the hero band, tapering as the page scrolls. The role of imagery is to BE the work — the site is a portfolio, not a product page.

## Layout

Full-bleed page, no max-width container, no centered column. The top bar is a three-part composition: nav cluster top-left (OUR WORK), centered ALET wordmark, nav cluster top-right (ABOUT / PROCESS / CONTACT) — all sitting in the corners and center of the viewport, not inside a header container. Below the top bar, a tall asymmetric image field with floating category labels (GRAPHIC DESIGN, SOCIAL MEDIA, ART DIRECTION, COPYWRITING, PHOTOGRAPHY & FILM, CREATIVE CONSULTANCY) positioned at irregular coordinates around it. The grid has no visible columns or gutters — images overlap and offset freely. A centered studio statement and a LINEAR/RANDOM layout toggle sit below the field. Section rhythm is defined entirely by the scattered imagery and 101–180px vertical breathing room between bands; no alternating dark/light sections, no dividers, no cards.

## Similar Brands

- **Pentagram** — Same editorial-portfolio language: no accent color, full-bleed canvas, serif masthead, scattered project imagery, micro-typography
- **Marcin Rusak Studio** — Same warm-paper aesthetic with photography as the sole chromatic element and barely-there UI chrome
- **Bureau Cool** — Same caption-scale 11–13px sans-serif navigation with a centered serif wordmark and asymmetric image scatter
- **Hyer Goods** — Same contact-sheet image arrangement and ultra-minimal achromatic system where photography carries the color
