# Altason — Style Reference
> architectural monochrome broadsheet

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Altason is a portfolio-as-canvas: a pure black-on-white editorial grid where massive, medium-weight Grotesk wordmarks are the hero and the work itself is the product. The system is 0% chromatic — every visual moment is built from ink, paper, and the negative space between them. Components are borderless except for hairline 1px black lines that quietly subdivide the page; there are no shadows, no gradients, no rounded corners, no accent hues. Type does all the work, and it speaks loudly by being huge and only weight 500 — the restraint of a medium weight at 288px is the signature move. Density is generous and architectural: sections breathe with 112–288px vertical padding, content sits in a three-column grid, and every surface is a flat plane with no elevation hierarchy. An AI agent should think of this as designing a printed magazine spread, not a SaaS dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Primary text, hairline borders, structural rules, image borders, heading fills — the dominant ink that draws the entire page |
| Paper White | `#ffffff` | Page canvas, card surfaces, reverse text on dark blocks — the surface that lets the black type speak |
| Charcoal Plate | `#212121` | Dark surface blocks and image backgrounds where white reverse type sits — a softer alternative to pure black for large dark areas |
| Silver Hairline | `#b0b0b0` | Subtle dividers and muted secondary links — a quiet mid-gray that recedes behind the black ink without disappearing |

## Typography

### Haas Grotesk DS Pro — Display and section wordmarks — used at 48–288px with extremely tight leading (0.77–0.80) so multi-line display type nearly touches. The DS variant's compressed proportions are what let 288px headlines fit within a single viewport without breaking rhythm. Substitute: Neue Haas Grotesk Display, or Akzidenz-Grotesk Pro Medium
- **Substitute:** Neue Haas Grotesk Display 65 Medium, or Inter Tight 500
- **Weights:** 500
- **Sizes:** 48px, 106px, 230px, 288px
- **Line height:** 0.77–1.20
- **Letter spacing:** normal (0)
- **OpenType features:** `"calt" on, "kern" on, "liga" on, "rclt" on, "rlig" on, "rvrn" on`

### Haas Grotesk TX Pro — Body copy, captions, image labels, navigation links, UI text. Weight 400 for body, weight 500 for navigation labels and emphasis. The 36px size at line-height 0.90 creates a tight subheading that bridges body and display scales. Substitute: Neue Haas Grotesk Text, or Inter
- **Substitute:** Neue Haas Grotesk Text, or Inter 400/500
- **Weights:** 400, 500
- **Sizes:** 16px, 18px, 36px
- **Line height:** 0.90–1.30
- **Letter spacing:** normal (0)
- **OpenType features:** `"calt" on, "kern" on, "liga" on, "rclt" on, "rlig" on, "rvrn" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.2 | 0px |
| body | — | — | 18px | 1.3 | 0px |
| subheading | — | — | 36px | 0.9 | 0px |
| heading-sm | — | — | 48px | 0.8 | 0px |
| heading | — | — | 106px | 0.8 | 0px |
| heading-lg | — | — | 230px | 0.77 | 0px |
| display | — | — | 288px | 0.77 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Card padding:** 20px
- **Element gap:** 8-10px

### Border Radius

- **cards:** 0px
- **badges:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Display Wordmark
**Role:** Brand name or section title rendered as oversized type

The brand name 'Atlason' rendered in Haas Grotesk DS Pro weight 500 at 230–288px, line-height 0.77, pure black on white. This is the primary visual element of the page — it occupies nearly the full height of a single column. No decoration, no underline, no color. The sheer scale and tight leading create the wordmark's presence.

### Section Heading
**Role:** Column or section labels in the three-column grid

Words like 'Works' and 'More' set in Haas Grotesk DS Pro weight 500 at 106–230px, line-height 0.80, black on white. Sized to anchor their column while leaving room for content below. The size step between the brand wordmark (288px) and these section labels (106–230px) creates a clear typographic hierarchy through size alone, not weight.

### Portfolio Tile
**Role:** Image card displaying a project thumbnail with caption

Rectangular image (no border-radius) with a 1px black border (borderColor from #000000), followed by a caption in Haas Grotesk TX Pro weight 400 at 16px, line-height 1.20, in black. The 1px black border frames the image like a museum print. No hover effects, no shadows, no overlay. Images sit directly on the white canvas with 20–32px gap between tiles.

### Footer Contact Block
**Role:** Multi-column footer with studio address, contacts, and press info

Divided into four narrow columns by hairline 1px vertical borders (black). Labels ('Visit', 'Contact', 'Connect', 'Follow') in Haas Grotesk TX Pro weight 500 at 16px, values below in weight 400 at 16px. Black on white, 20px padding-top/bottom, 48px padding-left for the first column. No background fill, no dividers heavier than 1px.

### Three-Column Page Grid
**Role:** Primary layout structure dividing the page into three equal-width columns

Full-bleed layout with three equal columns separated by 1px black vertical rules. The left column holds the brand wordmark and footer contact info; the center column holds the 'Works' portfolio grid; the right column holds the 'More' section. The grid has no max-width — it extends edge-to-edge. Column gaps are created by the 1px borders, not by padding.

### Hairline Rule
**Role:** Structural 1px border used to subdivide the page

A 1px solid line in #000000 used to separate columns, frame images, and divide footer sections. The rule is the only structural device in the system — there are no shadows, no background fills, no card containers. The visual hierarchy comes entirely from where these rules are placed.

### Image Frame
**Role:** Border treatment for all portfolio and content images

Every image is wrapped in a 1px solid black border (#000000). No padding between the image and the border, no radius, no shadow. This gives all images the quality of mounted photographic prints in an architecture portfolio.

### Navigation Link
**Role:** Text-based navigation item in the footer or header

Plain text in Haas Grotesk TX Pro weight 500 at 16px, black on white. No underlines by default; links may use a 1px black bottom border for emphasis. No hover color change, no background fill. Navigation is typographic, not buttonographic.

### Dark Image Panel
**Role:** Large image or section with a dark/charcoal background where reverse white type sits

A surface filled with #212121 containing a single large image or block of white text (e.g. 'Everything we imagine can be made.'). White text in Haas Grotesk TX Pro weight 500 at 18–36px. The dark panel creates the only tonal contrast in the system — it's the place where reverse type appears, and it functions as a visual pause between white sections.

## Do's and Don'ts

### Do
- Use Haas Grotesk DS Pro weight 500 at 48–288px for all display headings with line-height 0.77–0.80
- Set all border-radius to 0px — corners are always sharp
- Use 1px solid #000000 borders to frame every image and separate every column
- Use 112–288px padding-bottom for major section breaks to create architectural breathing room
- Use weight 500 (not 700) for emphasis — the medium weight at large sizes carries all the authority needed
- Set body text in Haas Grotesk TX Pro weight 400 at 18px with line-height 1.30
- Use #212121 as the only dark surface — reserve #000000 for text and borders, not large fills

### Don't
- Never introduce chromatic colors — the palette is strictly black, white, and gray
- Never add box-shadow, drop-shadow, or any elevation effect — the page is flat
- Never use border-radius greater than 0px on any element
- Never use weight 700+ for headings — medium (500) is the heaviest weight in the system
- Never set display type with line-height above 0.85 — the tight leading is what makes oversized type feel structural
- Never use colored hover or active states on links — navigation is purely typographic and static
- Never center text within columns — all text aligns left within its column

## Elevation

The system deliberately avoids shadows as an elevation mechanism. All structural separation is achieved through 1px hairline rules and tonal contrast (white → #212121 → #000000). There is no z-axis — the page is a flat editorial plane where hierarchy comes from typographic scale, not depth.

## Surfaces

- **Paper Canvas** (`#ffffff`) — Base page background — the default surface for all content
- **Charcoal Plate** (`#212121`) — Dark accent surface for image panels and reverse-type blocks
- **Ink Ground** (`#000000`) — Full-black surfaces used sparingly for maximum contrast moments

## Imagery

Imagery is portfolio photography and product shots treated as archival plates: each image is framed by a 1px black border, sits directly on the white canvas with no surrounding card, and is captioned in 16px Grotesk below. No lifestyle photography, no people in environmental shots, no color grading — the work itself (furniture, objects, interiors) is shot cleanly and presented without artifice. Images are arranged in a 2-column grid in the 'Works' section and a single-column stack in the 'More' section, with generous white space between rows. The overall visual register is that of an architecture or design monograph: documentation, not marketing.

## Layout

Full-bleed three-column grid with no max-width and no centered container. The page divides immediately at the top into three equal columns separated by 1px black vertical rules: left column holds the brand wordmark ('Atlason' at ~230px) and the footer contact block; center column holds the 'Works' section heading and a 2-column portfolio grid of framed images with captions; right column holds the 'More' section heading and a single large dark image with reverse-type caption. There is no navigation bar — the page is a single full-viewport experience. Footer sits at the bottom of the left column, aligned to the baseline of the page. Section spacing is architectural: 112–288px of vertical padding separates major regions. No alternating bands, no background color shifts between sections — everything sits on the same white plane.

## Similar Brands

- **Pentagram** — Same agency-portfolio-as-homepage structure with a three-column grid, oversized wordmark as the hero element, and no chromatic accent — the design IS the portfolio
- **Mass Moca / institutional art museum sites** — Same editorial broadsheet approach: full-bleed white canvas, 1px black rules, massive Grotesk headings, flat image frames with captions
- **Vitsoe** — Same monochrome black-on-white restraint with massive Helvetica-family display type and product photography framed by hairline borders
- **Order of Design (or similar architecture studios)** — Same portfolio-as-monograph presentation: work shown as archival plates with 1px black borders, captioned in clean Grotesk, laid out in a strict columnar grid
