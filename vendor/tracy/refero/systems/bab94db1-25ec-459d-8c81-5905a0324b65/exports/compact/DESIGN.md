# ARTWORLD — Style Reference
> fashion masthead on white linen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ARTWORLD is a typographic art piece masquerading as a website — an agency masthead where the entire visual system is built from two weights of contrast: pure white paper and pure black ink. The aesthetic borrows from high-fashion editorial credits pages, where the talent roster becomes the design itself, and a single oversized wordmark anchors the composition like a magazine cover. Two type families do all the work: Cardinal Fruit (a refined display serif) provides the elegant italic voices for names, while Graphik Light at weight 300 supplies the quiet, whisper-thin supporting text — a deliberate anti-convention choice that makes the 75px display serifs feel monumental by contrast. Everything is left-aligned in a ragged editorial grid, with no color, no shadows, no rounded corners, no decoration. The system is monochrome to its bones and treats typography as the only meaningful design surface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | All text, the ARTWORLD wordmark, hairline structural borders, link strokes — the only mark-making color in the entire system |
| Paper White | `#ffffff` | Page canvas, negative space between type, reverse text on the wordmark bar |

## Typography

### Graphik Light — The invisible support system — body text, captions, metadata, role tags, the legend, the info link. Weight 300 is deliberately thin: it recedes so the Cardinal Fruit can dominate. This is the typographic equivalent of using whisper voice in a conversation where someone else is speaking. The consistent -0.065em letter-spacing tightens the already-light forms, giving the sans-serif an editorial density that prevents it from feeling like default UI text.
- **Substitute:** Inter Light, IBM Plex Sans Light, or Söhne Buch
- **Weights:** 300
- **Sizes:** 12px, 16px, 20px
- **Line height:** 1.20–1.58
- **Letter spacing:** -0.0650em

### Cardinal Fruit (and Italic / Classic Italic variants) — The editorial display voice — used for talent names, artist credits, and any moment of typographic expression. The italic variant carries the romantic, fashion-magazine feeling while the upright version provides structural headlines. Custom serif with high contrast strokes, used at extreme sizes (65–75px) to dominate the page. The whisper weight (300) on such a large serif is anti-convention: most editorial serifs use 400–700 here, but the light cuts create airier letterforms that feel more printed than digital.
- **Substitute:** Playfair Display, Cormorant Garamond, or Libre Caslon Text
- **Weights:** 300
- **Sizes:** 18px, 65px, 75px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.0100em at 75px, -0.0310em at 65px, -0.0110em at 18px

### Cardinal Fruit Italic — Cardinal Fruit Italic — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 16px, 65px, 75px
- **Line height:** 1, 1.09, 1.5
- **Letter spacing:** -0.031, -0.01

### Cardinal Classic Italic — Cardinal Classic Italic — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 18px
- **Line height:** 1.2
- **Letter spacing:** -0.011

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.78px |
| body | — | — | 16px | 1.5 | -1.04px |
| body-lg | — | — | 20px | 1.58 | -1.3px |
| display | — | — | 65px | 1.09 | -2.015px |
| display-lg | — | — | 75px | 1 | -0.75px |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 76-95px
- **Card padding:** 30px
- **Element gap:** 20px

### Border Radius

- **all:** 0px

## Components

### Talent Name Cell
**Role:** Primary unit of the talent grid — individual artist/creator name in the credits section

Name set in Cardinal Fruit Italic at 18px, line-height 1.20, letter-spacing -0.011em, color #000000. Followed immediately by a superscript role tag (e.g., P, D, V, C, S) also at 12–18px in Cardinal Fruit Italic. The tag sits as a raised annotation, like a footnote in a magazine masthead. No border, no background, no decoration — just type on white.

### Role Legend
**Role:** Key explaining the superscript role tags in the talent grid

A single horizontal line of Graphik Light at 12px, color #000000, centered or left-aligned at the bottom of the credits section. Format: (P) Photographer (D) Director (V) Virtual (C) CGI (S) Stylist — parenthetical letters followed by lowercase labels. Generous 29–30px horizontal padding between items to create breathing room.

### ARTWORLD Wordmark
**Role:** Brand identifier and visual anchor — the page's only large-scale graphic element

Set in a heavy bold sans-serif (distinct from Cardinal Fruit and Graphik — appears to be a Neue Haas or similar grotesque at 900 weight) at approximately 120–150px, letter-spacing tight (-0.02em range), color #000000, line-height 1.00. Occupies the full viewport width, left-aligned. This is the loudest element on the page by an order of magnitude — its only structural function is to assert brand presence against the whisper-quiet grid above it.

### Info Link
**Role:** Persistent utility link, likely to contact or about details

Set in Cardinal Fruit Italic at 12px, color #000000, positioned in the bottom-right corner of the page. No underline by default — the italic serif itself signals interactivity. Minimal padding, sits alone with significant white space around it.

### Credits Grid
**Role:** The main content surface — a multi-row, multi-column layout of talent name cells

Flexible ragged grid of 3–4 columns on desktop. Column gap 40–95px, row gap 20–35px. Each row is vertically centered, not baseline-aligned, creating a slightly uneven but visually rhythmic flow. The mix of italic and upright Cardinal Fruit across cells creates natural variation — some names lean right, some stand straight. The grid is the page; there is no other content structure.

## Do's and Don'ts

### Do
- Use only #000000 and #ffffff. Any introduction of grey, tint, or color breaks the monochrome contract.
- Set all display type in Cardinal Fruit (upright or italic) at 65–75px with weight 300. The whisper weight is non-negotiable — it creates the airiness that makes the type feel printed, not digital.
- Set all body and supporting type in Graphik Light at weight 300. Do not promote to Regular or Medium; the thinness is the point.
- Use the two type families as a system of contrast: Cardinal Fruit speaks, Graphik Light stays quiet. Never let Graphik Light appear at sizes that compete with Cardinal Fruit.
- Maintain tight letter-spacing: -0.065em for Graphik Light, -0.010 to -0.031em for Cardinal Fruit. This tracking is what gives the type its editorial density.
- Keep all spacing generous — 76–95px between major sections, 20–30px between elements. This is a spacious design that breathes.
- Left-align everything. Center-alignment would break the ragged editorial grid that gives the page its fashion-magazine rhythm.

### Don't
- Do not add any color beyond black and white. No accent colors, no state colors, no hover tints. Monochrome is the brand.
- Do not use rounded corners. Every edge is sharp, every surface is flat. The system has no curves.
- Do not add shadows, gradients, or elevation effects. The design is completely flat — depth comes from type size contrast, not from visual effects.
- Do not use bold or semibold weights for body or display type. The system lives at 300. Heavier weights break the whisper voice.
- Do not use system sans-serifs (Arial, Helvetica, Roboto) as substitutes for Graphik Light. The lightness and tight tracking of Graphik are what make it disappear correctly.
- Do not center-align body text or grid items. The ragged left edge is a design feature, not a limitation.
- Do not add icons, illustrations, photography, or decorative graphics. This is a typography-only system. The wordmark is the only visual element that isn't running text.

## Elevation

No shadows, no elevation, no depth effects whatsoever. The design achieves hierarchy entirely through type scale and weight contrast — a 75px Cardinal Fruit display naturally dominates a 16px Graphik Light body without needing any visual lift. Surfaces are absolute: pure black ink on pure white paper, nothing between.

## Surfaces

- **Paper White** (`#ffffff`) — Full-page canvas — the entire site lives on this surface

## Imagery

No photography, no illustration, no product imagery, no icons. The entire visual system is typography. The only graphic element is the ARTWORLD wordmark itself, which functions as both brand identifier and the page's only visual mass. Any imagery would be foreign to this system.

## Layout

Single-page editorial layout with full-bleed content (no max-width container). The page reads top-to-bottom as: (1) talent credits grid occupying the upper 60% of the page in a ragged 3–4 column layout of mixed italic/upright serif names with superscript role annotations, (2) a small horizontal legend line explaining the role codes, (3) the massive ARTWORLD wordmark spanning full viewport width at the bottom in heavy bold sans-serif. Everything is left-aligned. There is no traditional navigation, no hero section, no sidebar — the talent roster IS the page. The layout treats the browser as a printed editorial spread.

## Similar Brands

- **Saint Laurent (ysl.com)** — Same editorial-masthead aesthetic with massive bold sans-serif wordmark on pure white, zero color, type-only composition, whisper-thin supporting text
- **Acne Studios (acnestudios.com)** — High-fashion agency feel with serif italic names, generous white space, monochrome palette, and type as the sole design element
- **The Gentlewoman magazine** — Editorial roster/credits approach with mixed serif italic display type, generous spacing, and a roster-as-design philosophy
- **Mubi (mubi.com)** — Cultural curation site with extreme type contrast, monochrome palette, whisper-light body text supporting bold display moments
