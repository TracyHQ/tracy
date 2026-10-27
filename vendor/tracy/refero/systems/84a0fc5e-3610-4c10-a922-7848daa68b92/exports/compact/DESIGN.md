# Bee — Style Reference
> Sunlit honey-yellow talisman. Build each screen as a tactile editorial spread: intimate wrist-worn product imagery contained in generously rounded frames beside bold, near-black type on yellow or pale neutral fields.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bee pairs warm, close-cropped lifestyle photography with blocks of saturated honey yellow, pale lavender, putty gray, and near-black. Oversized Acidgrotesk headlines are heavy and tightly tracked, while Inter carries longer explanations with unusually loose leading. Surfaces are large rounded rectangles with no shadow hierarchy; the physical wearable, human hands, and color-blocked panels supply the page’s depth.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bee Ink | `#21200b` | Headlines, body text, hairline borders, dark surface panels, and outlined action borders |
| Pioneer Yellow | `#ffd900` | Navigation links, icon marks, colored content fields, and dark-surface button text — vivid yellow makes the near-black/yellow pairing unmistakably Bee |
| Lavender Memory | `#d2c4ff` | Feature-card surfaces and occasional supporting text treatment; this cool interruption prevents the yellow-and-ink system from becoming monochrome |
| Putty | `#e5e0dd` | Large card surfaces and the dominant warm-gray page canvas |
| Paper | `#f7f3f1` | Light card surfaces and filled light outlined-action backgrounds |
| True Black | `#000000` | Occasional deepest media or card surface |
| White | `#ffffff` | Hero text over photography and the lightest canvas surface |
| Recruiter Indigo | `#150a45` | Full-width recruitment and announcement strip behind white text |

## Typography

### Fff Acidgrotesk — The signature display and interface face: use 700 for 48-96px headlines, 700 at 19px for compact section statements, and 500 for navigation, controls, and feature labels. The 96px display tracking is aggressively tight, making large words read as one dense graphic form rather than separate letters.
- **Substitute:** Arial, Helvetica Neue, or Space Grotesk
- **Weights:** 400, 500, 700
- **Sizes:** 13px, 16px, 19px, 20px, 48px, 59px, 96px, 734px
- **Line height:** 0.80, 1.00, 1.20, 1.40, 1.50
- **Letter spacing:** -3.19px at 96px; -0.38px at 13px; -0.19px at 19px

### Inter Variable — Use for explanatory paragraphs, introductory copy, and small supporting information. At 16px/1.8 it creates a calm, spacious counterweight to Acidgrotesk’s compressed, emphatic headings.
- **Substitute:** Inter, Arial, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 13px, 16px, 19px, 22px, 24px, 32px
- **Line height:** 1.00, 1.20, 1.50, 1.80
- **Letter spacing:** -0.48px at 16px; -0.38px at 13px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| footer-nav | Fff Acidgrotesk | 500 | 13px | 1.5 | -0.39px |
| body | Inter Variable | 400 | 16px | 1.8 | -0.48px |
| section-label | Fff Acidgrotesk | 700 | 19px | 1.2 | 0px |
| feature-heading | Fff Acidgrotesk | 500 | 19px | 1.4 | -0.19px |
| section-heading | Fff Acidgrotesk | 700 | 48px | 1.2 | 0px |
| editorial-heading | Fff Acidgrotesk | 700 | 59px | 1.2 | 0px |
| hero-display | Fff Acidgrotesk | 700 | 96px | 1 | -3.168px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 38.325px
- **links:** 24px
- **pills:** 1440px
- **badges:** 9999px
- **images:** 38.325px
- **inputs:** 38.325px
- **buttons:** 38.325px
- **darkButtons:** 100px

## Components

### Public Header
**Role:** Top navigation over light or ink sections.

Use Bee Ink #21200b or Pioneer Yellow #ffd900 for the logo and navigation depending on the surrounding surface. Set navigation in Fff Acidgrotesk 500 at 13px with -0.38px tracking; keep the header as a flat band with no shadow.

### Outlined Order Button
**Role:** Public conversion control on light surfaces.

Fill with Paper #f7f3f1, use a 1px Bee Ink #21200b border and Bee Ink text, radius 38.325px, and 0px 60px horizontal padding. Pair it with Fff Acidgrotesk at 13px or 16px weight 500.

### Ink Order Pill
**Role:** Dark filled purchase control.

Fill with Bee Ink #21210a, set Pioneer Yellow #ffd900 text, use no contrasting border, radius 100px, and 22px vertical by 30px horizontal padding. Use Fff Acidgrotesk 500 at 20px.

### Rounded Lifestyle Hero
**Role:** Hero-level product storytelling through photography.

Use a warm, tightly cropped lifestyle photograph in a 38.325px-radius frame. Place white #ffffff Acidgrotesk display text directly over the lower image area at 96px/1.0/700 with -3.19px tracking; preserve the photograph as the dominant field.

### Hero Video Tile
**Role:** Playable media overlay within the hero.

Set a Bee Ink #21200b media tile over the photography with a 38.325px radius. Use Pioneer Yellow #ffd900 oversized wordmark-style lettering and a white #ffffff play icon; keep the tile compact relative to the hero image.

### Yellow Split Feature Panel
**Role:** Editorial product explanation beside a lifestyle image.

Use a Pioneer Yellow #ffd900 text panel paired edge-to-edge with a warm product photograph, clipped as one 38.325px-radius composition. Set the main statement in Fff Acidgrotesk 700 at 59px/1.2 in Bee Ink #21200b and body copy in Inter 400 at 16px/1.8 with -0.48px tracking.

### Feature Accordion Row
**Role:** Expandable capability statement.

Use Bee Ink #21200b text in Fff Acidgrotesk 700 at 19px/1.2. Separate rows with a 1px Bee Ink divider; maintain 16px internal spacing and avoid filled containers or shadows.

### Pioneer Purchase Stage
**Role:** Centered product-order module.

Place a centered Fff Acidgrotesk 700 section heading at 48px/1.2 in Bee Ink #21200b above Inter support copy and the Ink Order Pill. Use Paper #f7f3f1 or Putty #e5e0dd as the product-stage background, with the wearable render emerging from below the text.

### Putty Feature Card
**Role:** Neutral feature or product-detail card.

Fill with Putty #e5e0dd, use no shadow, no visible border, 38.325px radius, and 16px padding when text sits inside. Set headings in Bee Ink #21200b.

### Lavender Feature Card
**Role:** Accent feature or supporting product card.

Fill with Lavender Memory #d2c4ff, use no shadow and a 38.325px radius. Keep copy Bee Ink #21200b and limit this surface to distinct feature moments rather than the entire page canvas.

### Ink Media Card
**Role:** Dark product or video content tile.

Fill with Bee Ink #21200b or True Black #000000, use a 38.325px radius and no shadow. Set text in White #ffffff and reserve Pioneer Yellow #ffd900 for graphic marks, labels, or control text.

### Recruitment Announcement Strip
**Role:** Persistent full-width hiring notice.

Use Recruiter Indigo #150a45 as a flat full-width band with white #ffffff copy. Set the message in Inter 400 around 19px and the destination link in white; avoid radius and shadows.

### Footer Navigation Link
**Role:** Compact footer navigation.

Set links in Pioneer Yellow #ffd900 using Fff Acidgrotesk 500 at 13px/1.5 with -0.38px tracking. Use a dark Bee Ink #21200b footer field and 16px gaps between grouped items.

## Do's and Don'ts

### Do
- Use Bee Ink #21200b as the default text, border, and dark-surface color.
- Use Pioneer Yellow #ffd900 as a large color-block surface and as text or marks on Bee Ink #21200b surfaces.
- Set hero display type in Fff Acidgrotesk 700 at 96px with -3.19px letter-spacing and 1.0 line-height.
- Set explanatory copy in Inter Variable 400 at 16px with 1.8 line-height and -0.48px tracking.
- Clip photo frames and feature cards to a 38.325px radius with no box shadow.
- Use 1px solid Bee Ink #21200b rules for accordion rows and outlined controls.
- Build local spacing with 16px gaps and use 40px section gaps.

### Don't
- Do not replace Pioneer Yellow #ffd900 with a muted gold, amber, or gradient.
- Do not use drop shadows to elevate cards; Putty #e5e0dd, Lavender Memory #d2c4ff, and Ink cards stay flat.
- Do not use small-radius rectangles for primary cards or media; use 38.325px.
- Do not use a filled yellow primary button; the supported filled control is Bee Ink #21200b with Pioneer Yellow #ffd900 text.
- Do not set long paragraphs in Fff Acidgrotesk; use Inter Variable 400 at 16px/1.8.
- Do not use white body text on Paper #f7f3f1, Putty #e5e0dd, or Pioneer Yellow #ffd900 surfaces.
- Do not introduce blue, pink, or green interface accents alongside the yellow, lavender, putty, and ink palette.

## Elevation

Avoid elevation effects entirely: cards, photo frames, and purchase surfaces differentiate through oversized 38.325px clipping, warm surface changes, and product imagery rather than box shadows.

## Surfaces

- **Paper Canvas** (`#f7f3f1`) — Light page fields and outlined-control fill.
- **Putty Panel** (`#e5e0dd`) — Primary warm-gray card and product-stage surface.
- **Lavender Memory Panel** (`#d2c4ff`) — Accent feature-card surface.
- **Bee Ink Panel** (`#21200b`) — Dark media, footer, and filled-control surface.
- **True Black Panel** (`#000000`) — Deepest occasional media-card surface.

## Imagery

Photography is the primary visual material: warm, sunlit, close-cropped scenes of people wearing or handling the black wrist device, with skin, fabric, food, and domestic surroundings filling the frame. Images are contained in very large rounded rectangles and often paired directly with a solid yellow text panel. Product imagery is a dark, studio-like render on pale neutral ground, oversized and cropped so the hardware feels physical. Icons are sparse, compact, and predominantly monochrome or Pioneer Yellow; visuals occupy as much or more area than text in major sections.

## Layout

The page is an editorial sequence of wide rounded modules inside a lightly framed canvas, with a compact top header and a persistent full-width announcement strip near the viewport bottom. The opening screen is a full-bleed lifestyle-photo hero with oversized white display type anchored low and a compact dark video overlay near the upper-right. Follow it with a split yellow-copy/photography composition, then a long run of large product and feature cards in Putty, Lavender Memory, Bee Ink, and black; the purchase section returns to a centered pale product stage with a large wearable render. Content is spacious rather than dense, using large image fields, centered purchase information, and stacked feature areas rather than tightly packed grids.

## Similar Brands

- **Humane** — Wearable-AI hardware presented through intimate human-use photography and oversized product storytelling.
- **Nothing** — Consumer electronics language built from stark hardware close-ups, restrained palette blocks, and compact geometric controls.
- **Teenage Engineering** — Product pages treat hardware as an editorial object, using oversized type and deliberately sparse color fields.
- **Rabbit** — AI device marketing that combines playful saturated color surfaces with large, direct typographic statements.
