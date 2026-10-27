# Daniel Triendl — Style Reference
> White gallery wall for loud art

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Daniel Triendl is a digital gallery wall disguised as a portfolio site. The chrome is deliberately austere — pure white canvas, black hairline borders, serif body text, a tiny avatar — so that the kaleidoscopic illustration work can carry every screen without competition. The UI behaves like a museum label: small, quiet, always secondary to the artwork it describes. Navigation is stripped to two ghost buttons and three floating pills, and the only surfaces that deviate from white are a single soft-gray tint used for those pills and the occasional tag background.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, hairline borders, avatar stroke, ghost button outlines — the only ink on the page; borders are the structural device, not shadows |
| Canvas White | `#ffffff` | Page background, card surface, nav fill — the gallery wall itself |
| Plaster Gray | `#f2f2f2` | Pill navigation background, subtle surface for tag chips, soft section washes |
| Ash Gray | `#9b9b9b` | Muted secondary text, caption labels under illustrations, hairline borders on less prominent elements |

## Typography

### Times — Body, captions, labels, links, footer — a deliberate serif choice for UI body copy, the kind of editorial-museum-label voice most portfolios replace with sans-serif
- **Substitute:** Times New Roman, Lora, EB Garamond
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.20
- **Letter spacing:** -0.14px

### UniversalSans 425 — Headings, emphasized body, link text — a neutral grotesque that steps in when the Times serif is too quiet
- **Substitute:** Inter, Untitled Sans, Söhne
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.21
- **Letter spacing:** -0.0100em

### UniversalSans 625 — Button text, nav labels, small caps — the only medium weight in the system, used exclusively for clickable elements to give them a slightly firmer voice
- **Substitute:** Inter Medium, Untitled Sans Medium
- **Weights:** 500
- **Sizes:** 10px, 14px
- **Line height:** 1.00
- **Letter spacing:** -0.0100em

### Rza — Brand wordmark / logo only — a custom display face that gives the header a distinct editorial signature, never used elsewhere
- **Substitute:** Tiempos Headline, GT Super
- **Weights:** 400
- **Sizes:** 24px
- **Line height:** 1.17
- **Letter spacing:** -0.0060em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1 | -0.1px |
| body-sm | — | — | 14px | 1.2 | -0.14px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 48-64px
- **Card padding:** 20px
- **Element gap:** 6-8px

### Border Radius

- **tags:** 4px
- **cards:** 10px
- **buttons:** 48px
- **thumbnails:** 10px

## Components

### Illustration Thumbnail Card
**Role:** Primary content unit — each piece of portfolio work

Tall or wide illustration image with 10px corner radius, no shadow, no padding around the image. Below the image: a title in Times 14px black (one or two words like 'Hildegard Knef', 'Kneecap'), then a row of hashtag-style tags in 14px Times #9b9b9b separated by 6px gaps (e.g. '#cover #portrait'). No border around the card itself — the image edge is the boundary.

### Ghost Header Button
**Role:** Top-right navigation (Explore, Index)

Outlined button: 1px black border (#000000), 48px border-radius (full pill), 10px vertical / 20px horizontal padding. Icon left of label, label in UniversalSans 625 at 10px / 14px, letter-spacing -0.14px, color #000000. No fill, no shadow.

### Floating Pill Navigation
**Role:** Sticky bottom-center nav (Work, About, Contact)

Three items in a single pill container: 48px border-radius, #f2f2f2 fill, 8px vertical padding. Each label in UniversalSans 625 at 14px, color #000000, separated by ~16px. The pill appears to float over page content with a single subtle shadow (rgba(0,0,0,0.1) 0px 4px 4px).

### Avatar + Brand Mark
**Role:** Top-left site identity

Small circular avatar image (~24px) followed by 'Daniel Triendl' set in Rza 24px / 1.17 line-height, letter-spacing -0.144px, color #000000. The custom display face makes the wordmark the only typographic event in the header.

### Hash Tag Label
**Role:** Metadata under each illustration (medium, style)

Inline text in Times 14px color #9b9b9b, letter-spacing -0.14px. Tags run together separated by a single space, each prefixed with '#'. No background, no border.

### About Block
**Role:** Self-description in a featured grid cell

White card with no border, no shadow. Small 'About' label at top in Times 14px #000000. Body copy in Times 14px #000000, ~3 lines ('Daniel Triendl is an illustrator living in Austria & loves coffee.'). 'Find out more' link below in UniversalSans 425 #9b9b9b.

### Newsletter / Stay-up-to-date Block
**Role:** Audience engagement cell in the grid

Small 'Live stories' label above. Circular avatar (matching header) beside headline in Times 14px black ('Stay up to date with Daniel'). Below: 'Follow me on Facebook Instagram' with the two platform names in a link color.

### Image Border / Frame
**Role:** Hairline border around images in lists and cards

1px solid #000000 border, 0px radius (or matching thumbnail radius). This black hairline is the most-used border in the system — it defines every image edge and list separator on the page.

## Do's and Don'ts

### Do
- Keep the canvas pure white (#ffffff) — the illustrations provide all color, the UI must not compete
- Use Times 14px for body, captions, and labels; switch to UniversalSans 425 only for headings or emphasized runs
- Frame every image with a 1px #000000 hairline — the black border IS the visual device, not shadows
- Round interactive elements (buttons, pills) to 48px for full pill shape; round image cards to 10px
- Use #f2f2f2 exclusively for the floating pill nav and soft tag chips — never for page sections
- Set body and caption text at exactly 14px / 1.2 line-height / -0.14px letter-spacing — the compactness is deliberate
- Let the Rza wordmark appear exactly once, in the header — it is the only display moment in the system

### Don't
- Do not introduce any chromatic UI color — green, red, blue, or accent hues — the palette is black/white/gray by design
- Do not add box-shadows to illustration cards; the single shadow allowed is the floating pill nav (rgba(0,0,0,0.1) 0px 4px 4px)
- Do not use Times for headings at large sizes; it is a 14px label face, not a display face
- Do not mix Rza into body copy or labels — it lives only in the brand wordmark
- Do not use #9b9b9b for body text on white — it fails contrast (2.8:1); reserve it for meta/tags on black or as a hairline border
- Do not add padding or chrome around illustration images — the image fills its grid cell edge-to-edge
- Do not create filled buttons; every interactive element is ghost/outlined (#000000 border, no fill)

## Elevation

The system is intentionally flat. There are no shadows on cards, no elevation on thumbnails, no z-axis depth on the grid. The single permitted shadow is the subtle drop on the floating bottom pill nav, which exists only to lift that one element off the artwork beneath it. All other structure is communicated through 1px black hairlines and whitespace.

## Surfaces

- **Canvas** (`#ffffff`) — Full-page background, card base, floating pill fill
- **Plaster** (`#f2f2f2`) — Tag chips, pill nav resting state, soft highlight wash

## Imagery

The site is an illustration portfolio, so imagery IS the product. The visual system shows large-format illustration thumbnails in a masonry/grid — each piece is a full-color editorial or cover-style artwork (characters, landscapes, abstract 3D shapes, line art). Treatments vary wildly by piece (flat color, gradient, line work, 3D render) because the portfolio showcases range. In the UI layer, the only recurring image is a small circular personal avatar. Images are displayed edge-to-edge in their grid cells with a 1px black hairline frame, no rounded masking beyond the 10px thumbnail radius, no overlap. Photography is absent — everything is authored illustration.

## Layout

Full-bleed page on a white canvas, content constrained to a max-width around 1440px and centered. The header is a single thin row: avatar + Rza wordmark on the left, two ghost pill buttons (Explore, Index) on the right. The body is a dense masonry/grid of illustration cards — mixed tall and wide cells packed tightly with small 20px gutters. Each card stacks image-on-top, title-and-tags below. A floating pill nav (Work / About / Contact) sits fixed at the bottom-center of the viewport over the grid. Some grid cells are repurposed as text blocks (About, Live stories) so the grid is a mix of artwork and editorial copy. Vertical rhythm is tight — sections do not alternate light/dark, the whole page stays on white.

## Similar Brands

- **Dribbble portfolio pages** — Same edge-to-edge image grid with tight gutters and minimal chrome — the work fills the cell and the UI gets out of the way
- **It's Nice That** — Editorial portfolio aesthetic with serif body labels, black hairline borders on imagery, and zero chromatic UI color
- **Mike Mills / independent illustrator sites** — White-canvas gallery wall approach where the portfolio is the only color source and the header is reduced to a name and two buttons
- **Cargo Collective portfolios** — Dense masonry of large-format artwork on white with tiny gray metadata labels and almost no UI ornamentation
- **New York Times 'T Magazine' feature pages** — Editorial use of Times serif for UI labels, image-first hierarchy, hairline-black image frames, and a strictly achromatic interface
