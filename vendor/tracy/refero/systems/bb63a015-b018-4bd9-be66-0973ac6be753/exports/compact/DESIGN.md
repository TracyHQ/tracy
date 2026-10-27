# Patrick Miller — Style Reference
> oversized masthead on chalky color fields — a portfolio that behaves like a printed poster

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Patrick Miller's site treats every viewport as a single editorial spread: full-bleed color fields carry one oversized typographic statement, then a split-screen gallery follows with almost no UI. The palette is warm and chalky — salmon, blush linen, candlelight cream, and a whisper of sage — never digital or saturated, more like pastel chalk dusted across a wall. MlrStandard, a custom sans, does the heavy lifting at extreme sizes (331px hero) with tight tracking, while a near-invisible secondary chrome handles wayfinding: tiny centered labels, hairline arrows, and one small dark circle as the only solid interactive element. There are no cards, no grids, no shadows — content is presented as flat color blocks and monumental type, the way a magazine cover treats a masthead.

## Colors

| Name | Value | Role |
|------|-------|------|
| Persimmon Wash | `#fd9b65` | Hero full-bleed section background — warm terracotta field that carries the massive name lockup |
| Blush Linen | `#e9d1c7` | Section background, split-screen left or right panel — dusty rose that softens adjacent fields |
| Candlelight | `#f8f5d1` | Section background, split-screen panel — off-white cream that recedes behind type |
| Sage Whisper | `#9ac8ae` | Accent full-bleed background for occasional sections — desaturated eucalyptus that cools the warm system |
| Inkwell Blue | `#004b82` | Solid circle action button, link underlines and text — the only dark saturated mark against the chalky fields, dense and editorial |
| Slate Moss | `#4c564b` | Alternate muted button or surface fill — warm-leaning gray-green for secondary controls |
| Fossil | `#a4b1b3` | Muted section background, quiet tonal step between cream and white |
| Obsidian | `#000000` | All typography, hairline borders, icon strokes, arrow marks — the sole ink color across every surface |
| Paper | `#ffffff` | Canvas background, inverse text on dark button, rotated Contact badge fill |

## Typography

### MlrStandard — Sole typeface for all text — 331px for the hero name with lineHeight 0.80 and -0.02em tracking, 32px for section labels at lineHeight 1.20, 16px for pagination and UI chrome at lineHeight 1.30 with +0.01em to +0.02em tracking. The custom face has near-zero terminals and uniform stroke weight that holds up at 331px without distortion — a system font would look brittle at that size.
- **Substitute:** Inter Tight, or Suisse Int'l
- **Weights:** 400, 500
- **Sizes:** 16px, 32px, 331px
- **Line height:** 0.80, 0.90, 1.20, 1.30
- **Letter spacing:** -0.02em at 331px, 0 at 32px, +0.01em to +0.02em at 16px
- **OpenType features:** `"ss01" on, "tnum" on`

### -apple-system — Ultralight fallback reserved only for the secondary button label — used at 32px weight 200 to contrast with MlrStandard's heavier editorial presence
- **Substitute:** SF Pro Display Ultralight, or Helvetica Neue UltraLight
- **Weights:** 200
- **Sizes:** 32px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.3 | 0.16px |
| subheading | — | — | 32px | 1.2 | 0px |
| display | — | — | 331px | 0.8 | -6.62px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Card padding:** 0px
- **Element gap:** 16px

### Border Radius

- **badges:** 0px
- **fields:** 0px
- **buttons:** 9999px
- **surfaces:** 0px

## Components

### Hero Masthead Lockup
**Role:** Full-bleed opener carrying the studio name

Persimmon (#fd9b65) fills the viewport edge-to-edge. '© Patrick Miller' sets in MlrStandard 331px / 0.80 lineHeight / -0.02em, all in Obsidian (#000000), arranged as a single line that wraps so 'Miller' drops to a second line, followed by a separate down-arrow glyph of equivalent weight. No logo, no nav, no padding other than 72px left/right viewport margin. The copyright circle acts as a logomark — it is the brand mark.

### Rotated Contact Badge
**Role:** Persistent call-to-action in the top-right corner

A small white square (~80×80px) in Paper (#ffffff) with Obsidian (#000000) text reading 'Contact → Studio' in MlrStandard 16px, rotated approximately -15° to -20° clockwise, anchored to the top-right corner of the viewport. Sharp 0px corners. This is the only persistent nav element on the hero.

### Split-Screen Gallery Section
**Role:** Project showcase, two equal panels side by side

Viewport split exactly 50/50. Each panel is a flat color field — typically Blush Linen (#e9d1c7) on one side, Paper (#ffffff) or Candlelight (#f8f5d1) on the other. No images, no cards, no borders between panels. The project name ('Form Magazine', 'Flowers') sits as a tiny MlrStandard 16px label, top-right of the right panel in Obsidian, tracking +0.01em.

### Section Pagination Strip
**Role:** Bottom-of-viewport wayfinding for gallery sequence

A single horizontal row at the bottom of the viewport with three elements: a hairline Obsidian left-arrow on the left, a centered counter ('1/2', '1/10') in MlrStandard 16px Obsidian, and a solid Inkwell Blue (#004b82) circle button on the right. The circle is approximately 48–56px diameter, 9999px radius, with a white right-arrow centered. 72px left/right padding aligns it to the same gutter as the section label.

### Solid Circle Action Button
**Role:** Primary forward-navigation control

Inkwell Blue (#004b82) fill, 9999px radius, no border, no shadow. Contains a Paper (#ffffff) arrow glyph in MlrStandard at roughly 20–24px. The button is the only saturated solid object on the entire site — every other element is type or flat color field. Approximately 48–56px diameter.

### Hairline Arrow Control
**Role:** Secondary backward-navigation

Obsidian (#000000) 1px-stroke arrow, no fill, no border, no background. Sits in a hit area of roughly 48×48px centered on the 32px MlrStandard glyph. No button shape — just the mark and its click target.

### Section Label
**Role:** Project or context identifier

MlrStandard 16px / lineHeight 1.30, Obsidian (#000000), tracking +0.01em, set flush right at the top of a section panel. The only running text on the page besides pagination.

### Full-Bleed Color Field Section
**Role:** Atomic building block for every section

A single full-viewport-height rectangle in one of the four accent colors (Persimmon, Blush Linen, Candlelight, Sage Whisper). No padding inside, no internal structure, no border. Type sits directly on the color with no containers. Padding from viewport edge to content is 72px left/right and 32px top/bottom.

## Do's and Don'ts

### Do
- Set the hero name at 331px in MlrStandard, lineHeight 0.80, letterSpacing -0.02em — this is the signature scale, not a guideline
- Use 72px as the standard viewport edge gutter for all type and controls
- Apply full-bleed color fields as sections, never contained cards or bordered panels
- Use the four accent colors (#fd9b65, #e9d1c7, #f8f5d1, #9ac8ae) as the entire section system — no neutrals between them
- Set the only solid interactive element to Inkwell Blue (#004b82) at 9999px radius — everything else stays flat or outlined
- Anchor the rotated Contact badge to the top-right corner of the viewport with approximately -15° rotation
- Keep all secondary type at 16px MlrStandard with tracking between +0.01em and +0.02em

### Don't
- Don't introduce shadows, gradients, or blur effects anywhere — the system is entirely flat
- Don't use border-radius on anything except the circle action button (9999px) — surfaces, badges, and fields stay at 0px
- Don't add cards, panels, or containers around type — type sits directly on color fields
- Don't mix system fonts into headings — MlrStandard is the sole display face, -apple-system weight 200 is only for one specific button label
- Don't use a second saturated color for buttons or links — Inkwell Blue (#004b82) is the only chromatic interactive
- Don't set the hero name smaller than 200px on desktop — the 331px scale is the identity
- Don't use light grays for text — all type is Obsidian (#000000) at full opacity against every surface

## Elevation

The design is strictly flat. No box-shadows, no inner shadows, no blurred glows. Depth is communicated only through adjacent color fields meeting at a hard edge — the eye registers Salmon meeting Cream as a spatial shift, not an elevation. This is a deliberate editorial-print choice: paper posters do not cast shadows.

## Surfaces

- **Canvas** (`#ffffff`) — Default page background and split-screen right panel
- **Candlelight** (`#f8f5d1`) — Soft cream section — sits one step above white
- **Blush Linen** (`#e9d1c7`) — Dusty rose section — introduces warmth without saturating
- **Sage Whisper** (`#9ac8ae`) — Cool green section — palette counterweight
- **Persimmon** (`#fd9b65`) — Hero color field — maximum warmth, carries the masthead

## Imagery

No photography, no illustration, no product renders. Imagery is replaced by full-bleed chromatic color fields and the typographic masthead itself. The 'image' of the site is the oversized name lockup — the studio name is treated as the artwork. The split-screen gallery panels are colored planes rather than picture frames; project identity is conveyed by the section label, not by a photograph. Icons are absent except for the copyright circle and the arrow glyphs, both rendered as type.

## Layout

Full-bleed edge-to-edge at all breakpoints, no max-width container, no centered column. The hero is a single color field with the name lockup left-aligned at 72px gutter, wrapping freely. Subsequent sections are 50/50 viewport splits — each half a different color field, no gutter, no divider. The page reads as a sequence of full-viewport plates rather than a scrolled document. Navigation chrome is minimal: the rotated Contact badge persists top-right, pagination sits in a thin bottom strip, and the Inkwell Blue circle is the sole forward action. There is no top bar, no sidebar, no footer.

## Similar Brands

- **Bureau Cool / Studio Dumbar portfolios** — Same full-bleed color-block sections, oversized display type set flush left, and a near-total absence of UI chrome
- **Manual (manualcreative.com)** — Editorial portfolio rhythm — one full-viewport color field per project, monumental masthead type, minimal navigation
- **Locomotive MT portfolio** — Flat color fields as page sections, custom display sans at extreme sizes, warm desaturated palette over neutral grays
- **Pentagram partner sites (e.g. Paula Scher, Michael Bierut)** — Massive personalized name lockup as hero, single-rotated contact mark in the corner, split-screen project gallery below
