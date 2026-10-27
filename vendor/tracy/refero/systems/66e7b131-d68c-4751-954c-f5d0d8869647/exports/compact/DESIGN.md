# Le Puzz — Style Reference
> Sunny Sunday circular — a yellow tabloid stuffed with puzzles.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Le Puzz is a maximalist boutique e-commerce system built on a two-color foundation: an aggressively saturated honeycomb yellow paired with pure black, floated on a cool pearl-gray canvas. The personality is vintage-newspaper-meets-puzzle-box — Times serif for body copy and a custom display serif (Times Now) for headlines, deliberately bucking the sans-serif e-commerce convention. The interface itself stays quiet and grid-driven so the photographed product packaging (dense, illustrated, toy-stuffed compositions) can carry the visual drama. UI controls are weighty: black-bordered buttons on yellow fills, pill-shaped badges, 12px-radius cards, and generous letter-spacing on small caps that gives even a "QUICK ADD" button editorial swagger.

## Colors

| Name | Value | Role |
|------|-------|------|
| Honeycomb Yellow | `#ffd931` | Primary brand color, header band, primary action buttons, nav active state, link underline color, accent fills — the one chromatic note everything else orbits around |
| Carbon Black | `#000000` | Primary text, heavy borders, button outlines, icon strokes, nav text — the structural ink of the entire system |
| Ink Black | `#231f20` | Secondary text, body copy, button borders, input borders — a slightly warmer near-black for softer reading |
| Pearl Gray | `#c8cbcd` | Page canvas, product card backgrounds, the cool stage on which yellow and black perform |
| Fog Gray | `#a6a8aa` | Muted badge surfaces, secondary chip backgrounds, low-emphasis UI fills |
| Smoke Line | `#d6d6d6` | Hairline dividers, subtle table/card separators |

## Typography

### Times Now — Display and heading serif — used for hero headlines, product names, and section titles. The ultralight 100 weight at 47px creates a tall, almost compressed editorial feel; the condensed letterforms (lineHeight 0.87–0.90) let large headlines sit close to their supporting copy, mimicking a printed poster.
- **Substitute:** Playfair Display, DM Serif Display, or GT Sectra
- **Weights:** 100, 400
- **Sizes:** 16px, 23px, 27px, 47px
- **Line height:** 0.87, 0.90, 1.15, 1.56, 1.93

### Times — Body copy serif — an unexpected choice for e-commerce that gives the whole site a literary, catalog-like voice. The tight 1.15 line-height keeps paragraph blocks compact and readable.
- **Substitute:** Times New Roman, Source Serif Pro, Lora
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.15

### Helvetica Neue — Small UI labels, button text, micro-copy — set in 11px with generous letter-spacing (0.0730em) to create an all-caps editorial feel even at body temperature
- **Substitute:** Helvetica, Inter, Neue Haas Grotesk
- **Weights:** 100, 400
- **Sizes:** 11px
- **Line height:** 1.15, 2.27
- **Letter spacing:** 0.0730em

### Helvetica — Navigation, links, utility text, large numbers — the utility sans that handles everything Times can't. Letter-spacing of 0.0630–0.0910em on small sizes gives all-caps nav items a wide, confident gait.
- **Substitute:** Helvetica, Arial, Inter
- **Weights:** 100, 300, 400
- **Sizes:** 11px, 13px, 14px, 16px, 40px
- **Line height:** 0.90, 1.15, 1.38, 1.56, 2.63
- **Letter spacing:** 0.0630em at 13px, 0.0730em at 11px, 0.0770em at 11px, 0.0910em at 11px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.15 | 0.8px |
| body | — | — | 16px | 1.15 | 0px |
| subheading | — | — | 23px | 1.15 | 0px |
| heading-sm | — | — | 27px | 0.9 | 0px |
| heading | — | — | 40px | 0.9 | 0px |
| display | — | — | 47px | 0.87 | 0px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 30-40px
- **Card padding:** 15px
- **Element gap:** 15px

### Border Radius

- **cards:** 12px
- **badges:** 12px
- **buttons:** 12px
- **heroImages:** 40-55px
- **pillButtons:** 25px
- **productImages:** 12px

## Components

### Yellow Primary Button
**Role:** Primary call-to-action (Add to Cart, Quick Add, Shop All)

Filled Honeycomb Yellow (#ffd931) background, Carbon Black (#000000) 1-2px border, black text in Helvetica 11px at 0.0730em letter-spacing, 12px border-radius, ~6px 14px padding, uppercase tracking. The 15.2:1 contrast against black text makes the label feel stamped on.

### Outlined Nav Button
**Role:** Navigation and secondary actions (Shop All, Merch, About, Sign in)

Transparent or Pearl Gray fill, Carbon Black 1-2px solid border, black text at 11px Helvetica with 0.0630em tracking, 12px radius, ~10px vertical padding. Sits directly on the yellow header band as black-outlined cells.

### Ghost Text Link
**Role:** Inline links, nav text, footer links

No background, Carbon Black text, often with a black 1px underline (328 occurrences of black link border). 14px Helvetica with 0.0770em letter-spacing on small variants.

### Product Card
**Role:** Individual puzzle listing in grid

Pearl Gray (#c8cbcd) background, 12px border-radius, product image fills card with ~12px corner radius, product name in Times serif italic below, price in black bold, Honeycomb Yellow 'QUICK ADD' pill button at the bottom edge.

### Header Bar
**Role:** Site-wide top navigation

Full-width Honeycomb Yellow (#ffd931) band, 1-2px Carbon Black bottom border, centered logotype in Times Now display weight, flanked by email signup (left) and shipping/cart (right). Nav row below with outlined buttons on the same yellow.

### Quick Add Pill
**Role:** One-tap purchase on product cards

Honeycomb Yellow fill, Carbon Black text, fully rounded ends (25px radius), 11px Helvetica uppercase, sits as a compact action chip at the base of each product card.

### Hero Feature Block
**Role:** Featured collection showcase

Large centered photographic hero (person holding puzzle boxes) with rounded corners (40-55px radius), 23-27px Times Now headline, body description in Times serif 16px, no gradient — the photography carries the drama.

### Search Icon
**Role:** Header utility

Carbon Black outlined magnifier, 16-20px size, sits inline with right-rail header text on yellow background.

### Tag/Badge
**Role:** Labels, categories, status indicators

Fog Gray (#a6a8aa) or Pearl Gray background, Carbon Black text, 12px radius, 11px Helvetica uppercase with 0.0730em letter-spacing, 2-5px padding.

### Footer Section
**Role:** Site footer

Light background with Carbon Black text, 1px black hairline borders, Times serif body copy, narrow column layout with generous 15px gaps.

### Input Field
**Role:** Email signup, search, form fields

Transparent or white fill, 1-2px Carbon Black border, black placeholder text, 11-14px serif or sans, minimal 1-2px vertical padding. Border-bottom emphasis style on some inputs.

### Price Label
**Role:** Product price display

Carbon Black, bold, 14-16px Helvetica or Times, sits directly under product title with no decoration — the price is a statement, not a highlight.

## Do's and Don'ts

### Do
- Use Honeycomb Yellow (#ffd931) as the singular chromatic accent — it should appear on the header band, primary CTAs, and at most one element per viewport
- Pair every yellow surface with a 1-2px Carbon Black (#000000) border to maintain the stamped/printed look
- Set body copy in Times serif at 16px / 1.15 line-height — resist the urge to switch to sans-serif for 'readability'
- Apply 0.0630–0.0910em letter-spacing to all 11px Helvetica text (nav, buttons, micro-copy) to create an editorial small-caps feel
- Use 12px border-radius as the workhorse for cards, buttons, badges, and product images
- Let product photography fill the visual role — keep UI surfaces flat and quiet so packaging art can carry the drama
- Maintain the 15:1 minimum contrast between text and background — never soften black to gray for large text

### Don't
- Don't introduce additional chromatic colors — the system is monochrome black/white with one yellow accent, any second hue breaks the identity
- Don't use drop shadows, glows, or blur effects — depth comes from borders and color contrast, not elevation
- Don't set body text in Helvetica or any sans-serif — the serif is the signature
- Don't round corners above 12px on standard components — reserve 25px+ for pill buttons and hero images only
- Don't use low-contrast gray text on the yellow background — black at 15.2:1 is the only acceptable combination
- Don't center-align long-form paragraphs — left-align Times body copy to preserve editorial rhythm
- Don't apply gradients to any surface — the system is entirely flat, gradients would break the printed-catalog metaphor

## Elevation

- **Product Cards:** `none — flat with 12px border-radius`
- **Buttons:** `none — flat fills with 1-2px black borders`
- **Header:** `none — anchored by 1-2px black bottom border`

## Surfaces

- **Page Canvas** (`#c8cbcd`) — Cool pearl background that lets the yellow pop
- **Product Card** (`#ffd931`) — Yellow surfaces for featured/highlighted areas
- **Elevated Section** (`#a6a8aa`) — Fog gray for badge/chip clusters and secondary groupings
- **Ink Surface** (`#231f20`) — Near-black for inverted text or strong contrast zones

## Imagery

Product photography is the dominant visual element. Puzzle boxes are shot frontally on white/neutral backgrounds, then placed on a warm blue or natural studio backdrop. The hero features a person holding multiple puzzle boxes — a lifestyle product shot with candid energy. The packaging itself is dense, illustrative, and maximalist: crowds of toys, food items, and characters in bright primary colors with thick black outlines, designed to look like a children's book illustration exploded across a 500-piece jigsaw. No abstract graphics, no 3D renders, no iconography beyond a single search magnifier — the puzzles ARE the visual language.

## Layout

Classic e-commerce grid with a strong editorial frame. The header is a full-bleed Honeycomb Yellow band with a 1-2px black border below, containing centered logotype and a secondary outlined-button nav row. Below, a centered welcome headline in Times Now sits above a 3-column product grid on a Pearl Gray canvas. The hero is a centered photographic block with rounded corners (40-55px) flanked by two product cards. Section rhythm is consistent: large vertical breathing room (30-40px section gaps), alternating yellow and gray surfaces, and a max-width of ~1200px centered on the page. Product cards are uniform in size, arranged in a clean 3-column grid with 15px gaps. The layout is symmetrical and grid-locked — no asymmetric compositions, no overlapping elements.

## Similar Brands

- **Areaware** — Same maximalist product-photography-forward e-commerce with flat color backgrounds and thick black borders on packaging art
- **Mudpuppy (puzzles)** — Same illustrated puzzle packaging aesthetic with dense character/object compositions on bright primary-color boxes
- **Chronicle Books** — Same editorial catalog feel — Times serif body copy, generous letter-spacing on small caps, quiet canvas that lets product art dominate
- **MoMA Design Store** — Same flat-design product grid with a single brand color accent and serif-driven editorial voice
- **Firebox** — Same playful product-first e-commerce with thick black borders, centered grid, and maximalist product photography as the visual hero
