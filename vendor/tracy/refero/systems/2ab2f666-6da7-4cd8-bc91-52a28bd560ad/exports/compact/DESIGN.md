# Shelby Kay — Style Reference
> botanical editorial spread on warm linen — two-color ink system on aged paper, with display type that bleeds past the page edge and metadata that whispers from the margins.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Shelby Kay is a botanical editorial portfolio: a warm linen canvas, one dark-olive ink color, and a single sage-green accent that does all the brand expression. Typography is extreme — Ranade display type stretches to 265px and bleeds edge-to-edge, while Switzer handles everything else at a compact 10–20px range, creating a magazine-spread tension between monumental headers and whispering metadata. Navigation is text-only with no buttons, no rounded controls, no shadows — the interface reads as a printed art book, not a software product. Sections shift through warm tonal layers (cream → tan → taupe) rather than alternating hard color blocks, and the overall system rewards restraint: hierarchy comes from scale, weight, and whitespace, never from color or chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Olive Ink | `#393c2a` | Primary text, borders, and structural strokes — all type from body to display headings, all card and image borders, all interactive outlines |
| Sage Type | `#737955` | Display headings and brand voice — used for the monumental SHELBY wordmark, section anchors, and selective heading accents that carry the brand's botanical identity |
| Linen | `#efe6d9` | Primary canvas and card surfaces — page background, card fills, the base warm tone the entire system sits on |
| Sienna | `#d6b292` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Driftwood | `#afa199` | Tertiary surface and muted helpers — profile-section backdrop, desaturated metadata, low-emphasis UI text and dividers |
| Riverstone | `#7b8785` | Cool-toned neutral for subtle contrast shifts — secondary surface, hover or muted state for UI elements needing visual separation from the warm base |

## Typography

### Ranade — Display and editorial headlines. Used at extreme scale (83–265px) for the wordmark and section anchors, and at 24px for the CONTACT callout. The geometric, slightly condensed forms give the brand its monumental-but-restrained voice — the type fills the frame without shouting. Substitute: Boldonse or Bold Neue for display, Space Grotesk for smaller uses.
- **Substitute:** Boldonse, Space Grotesk
- **Weights:** 400, 700
- **Sizes:** 24px, 83px, 158px, 265px
- **Line height:** 0.90, 1.00, 1.20

### Switzer — Everything else: body copy, nav, labels, metadata, card titles, list items. The compact grotesque reads as editorial running text. Weight 500–600 is the workhorse range; 700 is reserved for section headers and emphasized nav. Substitute: Inter, Untitled Sans, or Suisse Int'l for full weight coverage.
- **Substitute:** Inter, Untitled Sans
- **Weights:** 500, 600, 700
- **Sizes:** 10px, 11px, 14px, 16px, 20px
- **Line height:** 1.00, 1.20, 1.25, 1.30

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | — |
| body | — | — | 14px | 1.3 | — |
| heading-sm | — | — | 20px | 1.2 | — |
| heading | — | — | 24px | 1.2 | — |
| display | — | — | 83px | 0.9 | — |
| display-lg | — | — | 158px | 0.9 | — |
| wordmark | — | — | 265px | 0.9 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Section gap:** 36-56px
- **Card padding:** 20px
- **Element gap:** 12px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Wordmark Display
**Role:** Brand-defining type element

Ranade at 265px, weight 400, line-height 0.90, Sage Type (#737955), no letter-spacing. Stretches full viewport width edge-to-edge, character spacing visually tight. This is the signature element — a single word filling the frame. Always uppercase, always at maximum scale.

### Section Anchor
**Role:** Section transition label

Ranade at 24px, weight 400, line-height 1.20, Olive Ink (#393c2a). Centered, used as a quiet callout like 'CONTACT' that invites scroll rather than commanding action. No underline, no decoration — the typographic scale does the work.

### Rotated Side Label
**Role:** Vertical decorative element

Ranade at 83–158px, weight 400, Olive Ink (#393c2a), rotated 90° counter-clockwise, pinned to the right edge of the viewport. Functions as a running header equivalent — stays fixed or appears on hero to mark the page identity without competing with the wordmark.

### Minimal Nav
**Role:** Text-only site navigation

Switzer 11–14px, weight 500, uppercase, Olive Ink (#393c2a), letter-spacing normal. Aligned to the page edges (left for primary links, right for meta like '2026'). No buttons, no backgrounds, no separators between items — whitespace defines the links. Links carry an Olive Ink underline or border on hover.

### Project Card
**Role:** Work grid item

Full-bleed image inside a 0px-radius frame on Sienna (#d6b292) background. Date stamp in top-left corner at Switzer 10px, weight 500, Olive Ink. Two-letter abbreviation label centered below the card at Switzer 11px, weight 600, Olive Ink. No card border, no shadow — the image IS the card.

### Date Stamp
**Role:** Editorial metadata

Switzer 10px, weight 500, Olive Ink (#393c2a), positioned absolutely in the top-left of a project card or section. Oriented vertically (rotated 90°). Functions as an issue number on a magazine cover — establishes the editorial metaphor.

### Client List Column
**Role:** Sidebar content list

Switzer 11–14px, weight 500, Olive Ink (#393c2a), no bullet points, no indentation — items stack directly. Functions as a type-only index, running vertically along the left margin of the work section.

### Portrait Image Card
**Role:** Profile photo with duotone treatment

Square or near-square image, 0px radius, desaturated to sit within the olive palette. No border, no caption box. The image breathes directly against Driftwood (#afa199) surface. Functions as the only 'media' moment on the profile page — type does the rest.

### Recognition / Award List
**Role:** Right-aligned metadata column

Switzer 11–14px, weight 500, Olive Ink, right-aligned text. Multi-line entries with project name on one line, award details indented below. Dense, compact — reads as a colophon or index page from a printed book.

### Full-Bleed Botanical Background
**Role:** Hero atmosphere layer

Large nature/plant photography at extremely low opacity (roughly 10–15%) overlaid on the Linen (#efe6d9) canvas. Images extend edge-to-edge with no border. Creates a greenhouse/atelier atmosphere without competing with the wordmark. No rounded corners, no mask.

### Hero Subtitle
**Role:** Opening statement below the wordmark

Switzer 14–16px, weight 500, line-height 1.30, Olive Ink (#393c2a). Two short lines maximum, left-aligned. Sets the editorial voice — reads as an author's bio on a book jacket, not a marketing tagline.

## Do's and Don'ts

### Do
- Use Ranade at 83px or larger for any brand or section-defining headline — it is the only type with permission to fill the frame.
- Set body and metadata in Switzer weight 500–600 at 10–16px — the compact grotesque is the workhorse and should handle 90% of the interface.
- Build the palette from exactly two brand colors: Olive Ink (#393c2a) for structure, Sage Type (#737955) for brand voice. Use Sage sparingly — one display element per section maximum.
- Let the canvas shift through warm tonal layers (Linen → Sienna → Driftwood) to define sections instead of hard borders or color blocks.
- Use 0px border-radius everywhere — cards, images, tags. The printed-page metaphor demands sharp corners.
- Use 7–8px padding for tight metadata containers and 20px for card padding — the 8px base unit governs all spacing.
- Use Olive Ink (#393c2a) for all text and borders. The 9.2:1 contrast ratio on Linen makes it readable at 10px and monumental at 265px.

### Don't
- Don't add drop shadows, glows, or any CSS elevation — the system is deliberately flat and print-like.
- Don't introduce rounded corners (border-radius > 0) on any element — it breaks the editorial metaphor.
- Don't use Sage Type (#737955) for body text — its 3.7:1 contrast on Linen fails readability standards. Reserve it for display headings only.
- Don't create filled button backgrounds in any color — this system has no CTA buttons. Navigation is text-only, contact is a typographic anchor.
- Don't use gradients, brand illustrations, or icon sets — the visual language is photography, type, and tonal layering only.
- Don't use any cool or neutral gray outside the Riverstone (#7b8785) token — all neutrals must stay warm to maintain the botanical atmosphere.
- Don't center body text. Left-align everything except section anchors, which are the only elements that get centered treatment.

## Elevation

The system is flat by editorial design principle: no drop shadows, no elevation, no floating surfaces. Depth is created only through tonal layering of warm surfaces, border lines, and full-bleed photography. Cards sit directly on their section surface with a hairline border or none at all — the printed-page metaphor forbids digital lift.

## Surfaces

- **Linen** (`#efe6d9`) — Primary page canvas — hero, default section background
- **Sienna** (`#d6b292`) — Work/index section — tonal page break
- **Driftwood** (`#afa199`) — Profile section background — deeper warm shift
- **Riverstone** (`#7b8785`) — Cool-tinted neutral for contrast states or secondary overlays

## Imagery

Photography is botanical and atmospheric, used as a low-opacity texture layer behind the wordmark — large plants, palms, foliage rendered at 10–15% opacity so they read as a greenhouse shadow rather than a subject. One full-bleed portrait appears on the profile page, desaturated to sit within the olive palette and cropped tight. No product photography, no abstract 3D, no illustration. No icon system — the only graphic elements are type itself. Image treatment is always full-bleed with 0px radius and no border or mask. Imagery is atmospheric, never explanatory.

## Layout

Full-bleed layout with no max-width container — the wordmark stretches edge-to-edge, and section backgrounds span the full viewport. The hero is a single massive headline (SHELBY) overlaid on low-opacity botanical photography, with a hero subtitle in the lower-left and minimal nav along the bottom edge. A rotated 'KAY' label sits on the right margin. The work section uses a 4-column card grid on a warm tan background, with a vertical client list running down the left margin. The profile section shifts to a 3-column layout: portrait left, label/title center, dense metadata right. Section rhythm is defined by tonal surface shifts (cream → tan → taupe) rather than hard dividers. Navigation is a bottom-aligned minimal text bar on the hero; absent on interior pages which use scrolling. The page model is editorial — asymmetric, generous vertical breathing room between sections, no centered max-width constraint.

## Similar Brands

- **Locomotive (locomotive.ca)** — Same editorial-portfolio approach with massive display type bleeding edge-to-edge, warm neutral palette, and botanical/nature photography as atmospheric backdrop
- **Bureau Cool** — Two-color ink system (dark + one accent) on warm cream canvas, custom display type at extreme scale, text-only navigation, no buttons or shadows
- **Pentagram (pentagram.com)** — Editorial portfolio rhythm — full-bleed sections, type-as-imagery, tonal surface shifts instead of color blocks, zero chrome between sections
- **Rauno Freiberg** — Minimal text-only nav, extreme type contrast between display and metadata, flat surfaces with no shadows, warm neutral palette
- **Eli Hava (personal portfolio)** — Large stretched wordmark hero, rotated side text element, card-based work grid with date stamps — same magazine-spread structure
