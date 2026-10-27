# Arthursimonini — Style Reference
> printed film programme in black ink

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Arthur Simonini is a high-contrast editorial showcase built on absolute monochrome: pure black canvas, pure white type, and nothing in between. The visual identity is carried entirely by two custom serif faces — a quiet text-grade serif for navigation and metadata, and an ornamental didone with discretionary ligatures reserved for oversized display moments. Layout is ruled by hairline white borders that act as section dividers and grid rails, not by cards, shadows, or color. Content is presented like a printed film programme or a French luxury maison lookbook: typographic marquees scroll repeated section titles, film posters fill grids in grayscale, and generous negative space lets the ligature-rich display type breathe. No color, no gradients, no fills, no elevation — the entire system is an exercise in typographic and structural discipline.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page canvas, nav background, poster grid ground |
| Bone | `#ffffff` | All text, hairline section borders, image borders, icon strokes |

## Typography

### RomieLigatures-Regular — Display headlines, section titles, marquee text. The signature choice: this didone carries discretionary ligatures (dlig) that fuse letters into ornamental shapes — the oversized wordmarks and repeated marquee bands rely on these ligatures for their distinctive character. Line-height collapses to 0.73 at the 167px size so stacked display lines almost touch, creating a dense editorial block. Reserved exclusively for type-as-art moments; never used for body copy or UI labels.
- **Substitute:** Playfair Display, Bodoni Moda, GT Super
- **Weights:** 400
- **Sizes:** 18px, 65px, 167px
- **Line height:** 0.73, 0.90, 1.20
- **OpenType features:** `"dlig" on, "kern" on`

### LifeLTStd-Roman — Navigation links, metadata, body copy, timestamps, section category labels. A single weight at a single size — the system does not modulate emphasis through weight. Tracking is normal. This is the functional typeface that scaffolds the UI while the display face performs. Its quietness is the point: LifeLTStd is a transitional serif that reads cleanly at 18px without competing with the display type.
- **Substitute:** Cormorant Garamond, Lora, Spectral
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.00, 1.20
- **OpenType features:** `"kern" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 18px | 1 | — |
| heading-sm | — | — | 65px | 0.9 | — |
| display | — | — | 167px | 0.73 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 15px
- **Element gap:** 15px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Scrolling Marquee Navigation
**Role:** Primary navigation

Horizontal band of repeated section titles (BARDOT, PLAYLIST, AFFAIRES SENSIBLES, SHIN SEKAI) in RomieLigatures, white on black, separated by tiny uppercase category prefixes (B.O., PLAY, HABILLAGES, DISQUES) in LifeLTStd. The repeated text scrolls horizontally, filling the full viewport width with 15px vertical padding. No visible buttons, no underlines, no hover color shift — the entire nav is a typographic texture.

### Site Wordmark
**Role:** Brand identity header

ARTHUR SIMONINI at 167px in RomieLigatures, white on black, line-height 0.73, left-aligned, no margin above. The display ligatures fuse 'AR' and 'TH' and 'SI' into ornamental shapes. This is the single largest type element on the site.

### Hairline Section Divider
**Role:** Structural separator

1px solid white (#ffffff) horizontal line spanning the full viewport width. Used between every content block — between the wordmark and the first marquee, between marquees, and above grids. No padding gap; the line touches the text above and below directly. This is the only structural component.

### Playlist Track Row
**Role:** Music list item

Full-width row on black, track title in RomieLigatures 65px (or LifeLTStd 18px for parenthetical subtitles), duration timestamp right-aligned in LifeLTStd 18px. No background fill, no border, no hover state visible — rows are separated only by 40px vertical rhythm. The duration is a quiet typographic counterweight to the oversized title.

### Film Poster Grid
**Role:** Image gallery

Multi-column grid (approximately 6 columns) of poster thumbnails on black. Each poster is a grayscale photograph with a 1px solid white border. No gap between posters — the white borders form a continuous grid lattice. No captions, no titles beneath images. The images themselves are the content.

### Section Category Label
**Role:** Eyebrow / kicker text

Tiny uppercase prefix (B.O., PLAY, HABILLAGES, DISQUES, P.U.B.S., O.N.E.R.T.S., I.N.F.O.S.) in LifeLTStd 18px, white, positioned to the left of section titles. Acts as a taxonomy marker. Letter-spacing is normal — the visual gap between the dots in the abbreviations is a typographic device, not tracked space.

### Timestamp / Duration
**Role:** Metadata indicator

LifeLTStd 18px, white, right-aligned. Appears at the end of playlist rows. Line-height 1.0. No separator punctuation — just a bare number with colon-separated minutes:seconds.

### Poster Thumbnail
**Role:** Content card

Grayscale film still or poster art, framed by a 1px white border on all sides. No shadow, no padding inside the border, no caption. The image fills its frame edge-to-edge. Aspect ratios vary (portrait posters, landscape stills) but the white border is always exactly 1px.

## Do's and Don'ts

### Do
- Use only #000000 and #ffffff — every surface, every border, every character is one of these two values.
- Reserve RomieLigatures for display moments only: site wordmark, section titles, marquee bands, and track names at 65px+. Never use it for UI labels or metadata.
- Use LifeLTStd 18px as the single body/nav/label size across the entire site — do not introduce a type scale beyond the four documented roles.
- Separate every content block with a 1px solid white hairline that spans 100% viewport width with no padding gap.
- Set display type at 167px with line-height 0.73 so stacked lines nearly touch — this density is the editorial signature.
- Enable discretionary ligatures ("dlig" on) on all RomieLigatures usage — the fused letterforms are the brand's most recognizable visual element.
- Use 15px padding for all internal spacing within bands and 40px between major content sections.

### Don't
- Never introduce color — not for hover states, not for active nav, not for error messages, not for decorative accents.
- Never use border-radius — all corners are square (0px). This includes buttons, images, and tags.
- Never apply box-shadow or drop-shadow — elevation is expressed through white hairlines and negative space, not depth.
- Never use bold or semibold weights — both typefaces operate at 400 only. Emphasis comes from size contrast, not weight.
- Never use RomieLigatures for body copy, labels, timestamps, or anything below 65px — the decorative ligatures become illegible at small sizes.
- Never add background fills, gradients, or colored overlays to poster images — keep them raw grayscale with only a white border.
- Never center-align body text or metadata — left-align for content, right-align only for timestamps and durations.

## Surfaces

- **Obsidian Canvas** (`#000000`) — Full-bleed page background, navigation bar
- **Bone Image Frame** (`#ffffff`) — Hairline borders around poster thumbnails and between sections — the only non-text white usage

## Imagery

Imagery is restricted to film poster art and grayscale stills, presented in a dense borderless grid where 1px white frames create a lattice structure. All images are desaturated to near-grayscale. No photography of the designer, no lifestyle imagery, no product shots — the visual content is exclusively other people's film artwork. The rest of the site is pure typography: no illustrations, no icons (functional UI icons are absent entirely), no decorative graphics. The image grid sits at the bottom of the page as a portfolio wall, while everything above it is type-only.

## Layout

Full-bleed layout with no max-width container — every band stretches edge-to-edge across the viewport. The page reads as a vertical stack of typographic bands separated by hairline white rules: site wordmark → category marquee → second marquee → playlist list → poster grid. Navigation is embedded inline as scrolling marquee text rather than a separate header bar. The poster grid is a 6-column equal-width grid with zero gutter, where white image borders form the grid lines. Content is left-aligned throughout except for timestamps which are right-aligned. Density shifts from sparse (large margins around the wordmark and between sections) to dense (playlist rows at 40px rhythm, poster grid with no gaps). No sidebar, no sticky header, no breadcrumbs — the layout is a single scrollable column of horizontal bands.

## Similar Brands

- **Saint Laurent (ysl.com)** — Same absolute black-and-white discipline with oversized serif display type and zero decorative color — both treat typography as the sole brand expression
- **Celine (celine.com)** — Identical editorial restraint: pure monochrome, hairline dividers, serif typefaces, and large negative space framing type-as-art
- **S Moda (El País weekend magazine)** — Same high-contrast typographic masthead approach with custom ligature-rich display faces on a black field
- **Sleek Magazine (sleek-mag.com)** — Same white-on-black editorial layout with marquee-style repeated text bands and grayscale content grids
