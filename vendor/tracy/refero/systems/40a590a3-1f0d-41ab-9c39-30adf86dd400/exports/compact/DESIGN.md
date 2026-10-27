# Petertarka — Style Reference
> curated gallery on warm concrete — every card a framed print, every margin deliberate, every type weight a whisper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Petertarka presents a curated gallery aesthetic: a warm light gray canvas anchors a two-column grid where every project card feels like a framed print. Typography whispers at weight 200-300 in GT America — ultra-light headlines that gain authority through restraint rather than volume, a deliberate anti-convention against the SaaS standard of bold display type. Color is monastic: the system is almost entirely achromatic, with occasional full-bleed color blocks acting as project identifiers rather than brand expression. The signature move is a colorful 3D illustration that breaks the grid by overlapping card boundaries — one moment of visual exuberance against the quiet monochrome. Sharp corners (zero border-radius), 1px hairline borders, and 45px internal padding create an editorial, almost architectural feel — more museum wall than web page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Concrete | `#eaeaea` | Page canvas — the warm light gray that makes the whole gallery feel architectural rather than digital |
| Bone | `#f0f0f0` | Card surface — barely distinguishable from the canvas, creating the illusion of cards floating in space |
| Hairline | `#d8d8d8` | 1px card borders and dividers — structural, never decorative |
| Obsidian | `#000000` | All text, heading borders, and the top/bottom hairline rules that frame the page |
| Paper | `#ffffff` | Nav text and link borders — appears in the hamburger menu area and link underlines |

## Typography

### GT America — Sole typeface across all contexts — nav, body, cards, headings, links. Weight 200 for display headlines is the signature anti-convention: most sites use 600-700 for headlines, this whisper-weight gains authority through restraint. Weight 300 for body and UI text, weight 400 reserved for occasional emphasis.
- **Substitute:** Inter (weight 200/300/400) or Söhne (weight 200/300/400) — both share GT America's geometric-humanist proportions
- **Weights:** 200, 300, 400
- **Sizes:** 16px, 21px, 38px
- **Line height:** 1.00, 1.31, 1.32, 2.37

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 2.37 | 0px |
| subheading | — | — | 21px | 1.31 | — |
| heading | — | — | 38px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Card padding:** 45px
- **Element gap:** 10-20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Project Card (Neutral)
**Role:** The structural unit of the gallery — a framed print for each project

Background #f0f0f0, 1px solid #d8d8d8 border, 0px border-radius, 45px padding on all sides. Contains a category label (16px GT America 300, top-left), project name (38px GT America 200, left-aligned), and year (16px GT America 300, bottom-right, line-height 2.37 to push it to the card's lower edge). Cards butt directly against each other — the 1px borders form a continuous grid lattice.

### Project Card (Color Block)
**Role:** Variant where the card interior is filled with a project-specific color instead of #f0f0f0

Same dimensions, padding (45px), and border (1px solid #d8d8d8) as the neutral card. Background is a solid project color (e.g. muted violet, sage green). Text remains #000000. These are the only chromatic elements in the system — each one is a one-off, not a repeating accent.

### Year Label
**Role:** Timestamp anchored to the bottom-right corner of each card

16px GT America weight 300, #000000, line-height 2.37. The loose line-height pushes the year to the visual bottom of the 45px-padded card, creating a consistent baseline across the grid regardless of how much content the card holds.

### Category Tag
**Role:** Small descriptor at the top of each card (e.g. 'Print and Digital')

16px GT America weight 300, #000000, no background, no border, no padding. Sits at the top-left of the card interior, aligned to the 45px padding edge.

### Project Title
**Role:** The name of the project — the only large text in the system

38px GT America weight 200, #000000, line-height 1.00. Left-aligned within the card's 45px padding. The ultra-light weight at 38px is the signature: the type appears to hover rather than sit on the page.

### Hamburger Menu
**Role:** The only navigation element — minimal, almost invisible

Two thin horizontal black lines (#000000, ~1.5px stroke) in the top-right corner of the page. No background, no border, no padding. Vertically stacked with a small gap. This is the entire navigation — no logo, no links, no visible affordance beyond the lines.

### 3D Illustration Overlay
**Role:** Signature layout element — a full-color 3D render that breaks the grid

A large, colorful 3D rendered scene (room/space with furniture, plants, objects) positioned to overlap multiple grid cards. Uses vivid pinks, oranges, yellows, greens, and teals — the only place saturated color appears in the system. Sits above the grid (z-index highest), partially obscuring card content. This is not a repeatable component — it is a one-off compositional device for the portfolio's hero moment.

### Top/Bottom Page Rules
**Role:** Horizontal black hairlines that frame the entire page

1px solid #000000 horizontal lines running the full viewport width at the very top and very bottom of the page. The page is literally framed like a print.

## Do's and Don'ts

### Do
- Use GT America weight 200 for all display-level text (38px). The whisper-weight is the brand voice — never substitute 400 or 500 here.
- Set card padding to exactly 45px on all four sides. This generous interior is what makes the grid feel like framed art.
- Use 0px border-radius everywhere. Sharp corners are non-negotiable — they signal editorial, architectural intent over soft SaaS convention.
- Use 1px solid #d8d8d8 for all card borders. Depth comes from hairlines, never from shadows or background contrast.
- Anchor year labels at line-height 2.37 to push them to the visual bottom of cards regardless of content height.
- Keep the system achromatic. If color appears, it is a full-bleed project card or a singular illustration — never a button, badge, or UI accent.
- Let the hamburger menu be the only navigation visible. No logos, no nav bars, no link lists in the default state.

### Don't
- Do not use bold or semibold weights (600+) anywhere — not for headings, not for CTAs, not for emphasis. Weight 200-400 is the system ceiling.
- Do not add box-shadow, drop-shadow, or any elevation effect to cards. Depth is 1px borders only.
- Do not use border-radius greater than 0px on cards, buttons, tags, or images. Sharp edges define the gallery aesthetic.
- Do not introduce a chromatic accent color for buttons, links, or interactive states. Interactive elements inherit #000000 text and #ffffff borders from the monochromatic system.
- Do not use a max-width container. The grid and its hairlines should run edge-to-edge of the viewport at all breakpoints.
- Do not add gradients to UI surfaces. The single detected gradient is a one-off content element, not a design token.
- Do not use color for status indicators (success, error, warning). The system has no semantic color vocabulary — state changes happen through weight, position, or border style only.

## Elevation

Zero shadows. Depth is created exclusively through 1px hairline borders (#d8d8d8) against the canvas. Cards do not float — they are framed. This is an anti-elevation design: flat, architectural, and deliberately resistant to the Material/Fluent card-lift convention.

## Surfaces

- **Warm Concrete** (`#eaeaea`) — Page canvas — the warm gray backdrop for the entire gallery
- **Bone** (`#f0f0f0`) — Card surface — subtle lift from canvas via 1px hairline border rather than contrast shift

## Imagery

The site uses exactly one type of imagery: highly saturated, colorful 3D renders of interior/exterior spaces with stylized furniture, plants, and objects. These renders are the sole chromatic element in an otherwise achromatic system — they function as a counterpoint, not as decoration. Treatment: overlapping the grid (breaking card boundaries), rounded forms within the render itself but no border-radius on the render container, always positioned to span multiple grid cells. The renders are illustrative/sculptural rather than photographic — they read as designed objects, not captured moments. No photography, no flat illustration, no icons-as-imagery. The rest of the site is pure typography and white space.

## Layout

Full-bleed two-column grid (50/50 split) that runs the entire viewport width with no max-width constraint. Cards in adjacent columns share a 1px #d8d8d8 border that forms a continuous vertical and horizontal lattice. The grid is the primary structural device — no separate sections, no alternating bands, no distinct header/footer areas beyond the 1px black hairlines that frame the page top and bottom. A single 3D illustration overlaps the grid at the top of the page, breaking the lattice for one compositional moment. Navigation is a hamburger icon in the top-right corner. The page reads as a single continuous grid of framed projects, scrolled vertically, with no page-level section breaks.

## Similar Brands

- **Pentagram** — Same editorial gallery aesthetic — work presented as a grid of bordered cards, monochromatic palette, no decorative chrome, typography as the primary visual element
- **Tobias van Schneider** — Portfolio-as-gallery pattern with generous whitespace, thin borders, and a single type family carrying the entire visual system
- **Instrument (instrument.com)** — Full-bleed grid layouts with sharp corners, hairline dividers, and work presented as framed tiles rather than cards with shadows
- **DIA Studio** — Ultra-light display typography (weight 200-300) and achromatic canvases that let content — illustration, photography, 3D — provide the only color
