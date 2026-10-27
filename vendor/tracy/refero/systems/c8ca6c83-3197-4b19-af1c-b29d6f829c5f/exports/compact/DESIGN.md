# Dul Zorigoo — Style Reference
> ink-and-pencil gallery wall — a designer's portfolio rendered as monochrome exhibition panels on white, where structure is drawn not filled

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A monochrome gallery wall for a designer's portfolio — pure white canvas, hairline gray dividers, and a near-black ink for text, with the work itself (photography, UI captures, experiments) supplying every drop of color. Layout follows a two-column shell: a thin fixed bio rail on the left, a filter-tab bar across the top, and a breathable masonry of varied-size work tiles in the main well. The system is deliberately under-designed — no accent color, no shadow, no rounded softness beyond an 8px radius on the few controls that exist. The restraint is the brand: every visual decision is the absence of a decision, letting photographs and product screenshots carry the entire visual load. The single most defining trait is the 620-occurrence hairline border color #ebebeb, which structures every panel, card, and divider — a grid drawn in 1px pencil rather than built in elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page background, image wells, card surfaces inside embedded UI captures |
| Pencil Gray | `#ebebeb` | Hairline borders, panel dividers, card edges, button borders, the dominant structural line of the entire system |
| Graphite | `#a8a8a8` | Image captions, subdued headings, section labels, timestamp/location metadata |
| Smoke | `#8e8e8e` | Body helper text, secondary metadata, low-emphasis descriptors |
| Ink Black | `#252525` | Primary text, nav labels, the sidebar bio copy, button text — near-black rather than pure black keeps the system off the contrast ceiling and into a softer editorial register |

## Typography

### Inter — All UI text — sidebar bio, nav tabs, image captions, button labels. Inter is the safe system-substitute choice; the original is likely a neo-grotesque like Söhne, GT America, or Untitled Sans at a small optical size, tracking slightly tight.
- **Substitute:** Inter, system-ui, -apple-system
- **Weights:** 400, 500
- **Sizes:** 
- **Line height:** 1.4-1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | — |
| body | — | — | 15px | 1.5 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 32px
- **Card padding:** 12-16px
- **Element gap:** 8px

### Border Radius

- **cards:** 0px
- **links:** 8px
- **buttons:** 8px

## Components

### Fixed Bio Sidebar
**Role:** Identity rail anchoring every page

Left column, ~200px wide, no border, sits on the paper-white canvas. Contains name (Dul Zorigoo), 3-line bio ('Based in London. Exploring novel ways of interacting with technology. Currently designing ElevenLabs / Prev Humanae'), and two social links (X / Cosmos) as plain text with a leading icon. Text in Ink Black #252525, links inherit color with no underline. No background fill — the sidebar is defined by its whitespace, not by a panel.

### Filter Tab Bar
**Role:** Category navigation across the top of the work well

Horizontal row of text-only tabs: All (active), Photography, Thoughts, Work, Experiments. Active tab is Ink Black #252525, inactive tabs are Smoke #8e8e8 or Graphite #a8a8a8. No pills, no backgrounds, no underlines — state is communicated by color weight alone. Tab spacing ~8px between items. The bar is separated from the grid below by a 1px Pencil Gray #ebebeb hairline.

### Work Tile (Image + Caption)
**Role:** The atomic unit of the portfolio grid

A photograph or UI screenshot at its natural aspect ratio, edge-to-edge with no border, no shadow, no radius. Caption sits 8-12px below: Graphite #a8a8a8 text at ~12-13px, line-height 1.4. Captions are 1-2 lines — a title in Ink Black followed by a descriptor in Graphite, or a single muted line. Some tiles (the music/audio experiments) are wider, some are tall portrait crops, producing a masonry rhythm where tile widths vary but gutters stay consistent.

### Embedded UI Capture
**Role:** Portfolio pieces that are themselves product screenshots

Several tiles are screenshots of real product UIs (ElevenLabs agent publish flow, merge dialog, music prompt box). These carry their own internal visual systems — borders, radii, colors — and are presented as-is without a frame. The portfolio system adds nothing on top: no border, no caption box, no background panel. The screenshot IS the tile.

### Internal UI Card (within screenshots)
**Role:** Surfaces inside the embedded product captures

Where product UIs appear as portfolio pieces, their cards typically use white #ffffff fill on a slightly off-white #ebebeb or near-white canvas, with 8px-12px corner radius and 1px hairline borders in #ebebeb. This is the same Pencil Gray / Paper White system the portfolio itself uses — the work and the frame are built from the same ingredients.

### Text-Only Link / Social Handle
**Role:** Inline navigation and attribution

Plain Ink Black #252525 text, no underline, no hover affordance visible. Social handles (X, Cosmos) are prefixed with a tiny glyph icon. The minimal weight of these links reinforces the editorial tone — the sidebar reads as a colophon, not a nav menu.

### Date / Location Stamp
**Role:** Contextual metadata at the foot of the page

'LDN 02:20' and 'Crisp blue skies, perfect for a brisk walk.' — appears in the lower-left of the sidebar, 12-13px, Graphite #a8a8a8. Functions as a soft live-data signature, treated as a quiet annotation rather than content.

## Do's and Don'ts

### Do
- Use #ebebeb for every divider, card border, and panel edge — it is the structural line of the system, occurring ~620 times
- Keep the page canvas at #ffffff; never tint the background, let whitespace carry the layout
- Reserve #252525 for body copy and primary labels; let #a8a8a8 carry captions and metadata, #8e8e8 for the quietest helper text
- Let images be edge-to-edge with zero frame — no border, no shadow, no background card wrapping a photograph or screenshot
- Use 8px border-radius on the few buttons and link chips that exist, and 0px on everything else
- Communicate tab and nav state through color weight (Ink Black active, Graphite inactive) not through pills, backgrounds, or underlines
- Maintain a masonry grid where tile sizes vary but gutters stay at a consistent 32px section gap and 8-12px caption offset

### Don't
- Do not introduce any color — no accent, no brand hue, no semantic red/green/blue. The system is 0% colorful by design
- Do not add shadows or elevation. Structure is drawn in 1px Pencil Gray hairlines, never lifted with blur or drop-shadow
- Do not round photographs or screenshot tiles. Edge-to-edge raw rectangles are the rule
- Do not use filled or outlined CTA buttons. The system has no action surface — interactions are text links, filter tabs, and the images themselves
- Do not set body text in pure #000. Ink Black #252525 keeps the page in an editorial register rather than a terminal one
- Do not use Pill Gray or chip backgrounds for active nav states. Weight of gray is the only allowed state signal
- Do not exceed ~15px for any UI text. The entire type system operates at small optical sizes — headlines do not exist on this site

## Elevation

The design has no elevation system. There are zero box-shadows. Structure is communicated entirely through 1px hairline borders in #ebebeb and through whitespace — panels are drawn, not lifted. This is a deliberate flatness: the portfolio is a gallery wall, not a stack of cards.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, the only background color in the system. Everything floats on it.
- **Pencil** (`#ebebeb`) — Hairline border, divider, and panel edge color. Not a fill — a 1px line drawn on the paper.

## Imagery

Image-dominant. Photography and full-bleed product screenshots occupy the majority of viewport real estate, arranged in a varied-size masonry that feels like an exhibition wall rather than a grid. The photography itself is editorial: black-and-white landscape, golden-hour cityscape, chalk-white cliffs, candid park scenes — all shot with a contemplative, non-commercial eye. Embedded UI screenshots (ElevenLabs agent flows, music stem downloader) are presented as raw captures with no frame, border, or background plate, letting the product's own visual system become part of the portfolio's visual language. The site has no illustration, no 3D, no abstract graphics — only photographs and screenshots, both serving as the work itself. Iconography is minimal and monochrome (small X and Cosmos glyphs in the sidebar), and the entire icon set reads as thin-line text-adjacent marks rather than a system.

## Layout

Two-column shell: a ~200px fixed left sidebar (name, bio, social links, live date stamp) and a flexible right work well. The work well opens with a horizontally-flowing filter tab bar (All, Photography, Thoughts, Work, Experiments) separated from the grid below by a 1px #ebebeb hairline. Below the tab bar, the main content is a masonry-style image grid where tile sizes vary (mix of portrait and landscape crops, some full-width spans) but the gap rhythm stays consistent at 8-12px between images and 32px between logical sections. Captions sit directly under each tile in Graphite #a8a8a8, 12-13px. Navigation is minimal — no sticky header, no mega-menu, no sidebar nav beyond the bio rail. The page scrolls as a single continuous gallery; the only structural breaks are the hairline rule under the tab bar and the natural visual gaps between work groupings. Density is generous: large photographs get full breathing room, and the fixed sidebar never competes with the grid for attention.

## Similar Brands

- **Are.na** — Same channel-based masonry grid of varied-size image tiles with muted captions and zero chrome around the content
- **Rauno Freiberg's portfolio (raunofreiberg.com)** — Identical editorial discipline — monochrome palette, hairline borders only, work tiles that are edge-to-edge with no frames
- **Readymag project showcases** — Same exhibition-wall presentation of design work, where the portfolio's restraint amplifies the chromatic content of the work itself
- **Linear's changelog/blog** — Same use of #ebebeb hairline structure with 0% colorful UI and Ink Black text — though Linear adds a single accent, this site holds the line at zero
- **Manual design studio (manual.com)** — Same design-as-gallery sensibility: work presented as raw tiles in a masonry, with the portfolio chrome reduced to a thin bio rail and quiet metadata
