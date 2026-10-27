# Verse — Style Reference
> monochrome terminal grid in a dark void — hairline cells on black, the work inside each cell carrying all the color

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Verse operates as a monochrome terminal: a near-black canvas bisected by a two-column grid of light-bordered project tiles, with Commit Mono at 11–16px carrying every piece of information. Color is not part of the UI vocabulary — it lives only inside the media surfaces (3D renders, product photography, gradients) that each tile contains. Elevation, rounded corners, and shadows are absent; the light hairline grid line on black is the sole structural device, doing the work that color, depth, and scale do in conventional systems. The result is a developer-console aesthetic where the work inside each frame is loud and the chrome around it is deliberately silent.

## Colors

| Name | Value | Role |
|------|-------|------|
| Grid Line | `#e5e7eb` | Primary border between tiles and around media surfaces — the only structural divider in the system, doing the work of card outlines, section separators, and elevation simultaneously |
| Body Text | `#d4d4d4` | Primary readable text — project names, bio copy, metadata labels |
| Muted Text | `#737373` | Secondary metadata, category tags, and the [link] indicator — recedes behind body text to create a two-tier reading hierarchy without changing weight |
| Subtle Divider | `#171717` | Low-contrast internal dividers and edge treatments — barely visible against the page background, used where a hairline would be too loud |

## Typography

### Commit Mono — Used for every text element in the system — headings, body, metadata, links, tags. The entire UI is a single monospace family; there is no sans-serif counterpart.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Geist Mono
- **Weights:** 400, 600
- **Sizes:** 11px, 14px, 16px
- **Line height:** 1.43–1.50
- **Letter spacing:** normal across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.43 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1080px
- **Section gap:** 80px
- **Card padding:** 0px
- **Element gap:** 16px

### Border Radius

- **all:** 0px
- **media:** 0px
- **tiles:** 0px

## Components

### Project Tile
**Role:** The atomic unit of the portfolio — a bordered cell containing a media surface and a metadata row

Full-bleed 2-column cell with a 1px #e5e7eb border. Top portion is a media surface (image, video, 3D render, or code screenshot) that fills the cell width with 0px radius. Below the media, a 16px-padded row holds tech stack text left-aligned in #d4d4d4 and a [link] indicator right-aligned in #737373. No inner padding around the media — the border touches the media edge.

### Grid Line
**Role:** The primary structural element of the entire page

1px solid #e5e7eb lines forming a 2-column grid. Lines are shared between adjacent tiles (no double borders), creating a single continuous lattice. The grid is the design — there are no cards, no panels, no raised surfaces, just cells.

### Metadata Row
**Role:** Caption beneath each project tile

16px vertical padding, 16px horizontal padding. Left side: tech stack in Commit Mono 14px weight 400 #d4d4d4, separated by bullet characters. Right side: [link] in #737373 — brackets included literally as part of the label.

### Header Block
**Role:** Identity section at the top of the page

Spans the full grid width above the project tiles. Contains the brand name in Commit Mono 16px weight 600 #d4d4d4 on the first line, a tagline in 16px weight 400, then two contact lines with labels (TWITTER:, EMAIL:) in 11px #737373 followed by values in 14px #d4d4d4.

### Media Surface
**Role:** Container for project visuals

No padding, no background, no radius. The media (image, video, canvas element, code block) fills the cell edge-to-edge, bounded only by the 1px #e5e7eb border. The border is the frame.

### External Link Tag
**Role:** Wayfinding indicator on tiles with outbound links

Renders literally as [link] in Commit Mono 14px #737373. The brackets are part of the design — they signal interactivity without using color or underlining.

### Category Label
**Role:** Tagging system for project types

Commit Mono 11px #737373, uppercase, used inline within the metadata row (e.g. REACT, CSS, VANILLA-JS). No background, no border, no padding — pure typographic tagging.

## Do's and Don'ts

### Do
- Use Commit Mono at 11px, 14px, or 16px for every text element — there is no type size above 16px in this system
- Separate all UI elements with 1px solid #e5e7eb borders on the #0a0a0a page background
- Keep the 2-column grid consistent — tiles share borders, never stack double lines between them
- Let project media fill its cell edge-to-edge with 0px radius; the border is the only frame
- Signal interactivity through literal text like [link] in #737373, not through color or weight changes
- Use 16px padding for metadata rows and 80px vertical gaps between major page sections
- Keep all UI chrome in the four-token grayscale palette — color belongs only inside media surfaces

### Don't
- Do not introduce rounded corners, drop shadows, or gradients anywhere in the UI
- Do not use a sans-serif or display font alongside Commit Mono — the monospace IS the identity
- Do not add a brand accent color, CTA color, or semantic color (success/error/warning) to the palette
- Do not use type sizes above 16px for any element, including hero headlines
- Do not fill button backgrounds or add hover states that change color — the system has no chromatic interaction states
- Do not use #0000ee or any default browser link color — links are #d4d4d4 or #737373 with optional [link] suffix
- Do not add padding inside media surfaces — the border should touch the media directly

## Elevation

Elevation is deliberately absent. The design uses a single flat surface level (the page background) and relies entirely on 1px #e5e7eb hairline borders to create structure. There are no cards above cards, no floating panels, no z-axis hierarchy. If a region needs separation, it gets a border line, never a shadow.

## Surfaces

- **Void** (`#0a0a0a`) — Page background — the uninterrupted dark canvas behind the grid
- **Tile Canvas** (`#0a0a0a`) — Inside each grid cell, matching the page so media appears to float within the border

## Imagery

Imagery lives exclusively inside project tile cells — 3D renders (skull with sticker decals, wireframe necklace), product photography (fashion ecommerce screenshots, dragon NFT art), interactive media (piano keyboard, particle animations), and gradient color studies. The UI chrome around these media surfaces is always pure monochrome. Media treatment is edge-to-edge with no rounded corners, no padding, no overlay text — the 1px border is the only frame. The visual language of the chrome is terminal/hacker aesthetic; the visual language of the contents is creative-agency portfolio (diverse 3D, web, code, and design work).

## Layout

The page is a single vertical scroll of a two-column grid on a #0a0a0a background, max-width 1080px centered. The first row is a full-width header block (brand + tagline + contact lines) spanning both columns. All subsequent rows are two equal-width cells side by side, with shared 1px #e5e7eb borders forming a continuous lattice. Each cell contains a media surface on top and a 16px-padded metadata row below. Rows are separated by 80px vertical gaps. The grid is uniform — no tile sizes vary, no cells span more than one column. Navigation is absent; the page is a single linear document. There is no sidebar, no sticky header, no footer beyond the continuing grid.

## Similar Brands

- **Bruno Simon (bruno-simon.com)** — Both are dark-mode creative portfolios that use a monochrome UI grid to frame colorful, media-heavy project work — the chrome stays quiet so the 3D/web work can be loud
- **Resn (resn.co.nz)** — Both use a near-black canvas with project tiles arranged in a grid, treating each cell as a framed media surface with minimal typographic metadata
- **Active Theory (activetheory.net)** — Both rely on a dark void background and let interactive/visual project work fill bordered cells, with extremely restrained UI typography
- **Locomotive (locomotive.ca)** — Both use a centered max-width grid layout with bordered project cells and a monospace-or-near-monospace type system for metadata
