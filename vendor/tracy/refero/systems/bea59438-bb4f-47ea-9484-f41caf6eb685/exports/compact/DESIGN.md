# Milanote — Style Reference
> Milanote — pinned creative studio. Build pages as an editorial gallery around floating visual boards: dark framing walls, white exhibit space, and physical-looking screenshots with soft depth.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Milanote alternates a deep slate workspace backdrop with broad white editorial sections, treating product boards as tangible pinned canvases rather than abstract software diagrams. Large, high-contrast Tiempos headlines anchor each scene, while Inter keeps navigation, actions, and explanatory copy compact and direct. The orange #f4511c action color appears sparingly against slate and white; its restraint lets photographic moodboards and layered board screenshots carry the visual energy.

## Colors

| Name | Value | Role |
|------|-------|------|
| Slate Canvas | `#303b4b` | Dark hero, navigation, dark showcase bands, footer, and dark heading text |
| Charcoal Ink | `#28323f` | Deep text, dark input text, and the cool-black foundation of surface shadows |
| Paper White | `#ffffff` | Light page canvas, card surfaces, board frames, and inverse text |
| Gallery Gray | `#ebedee` | Muted board canvas, pale control surfaces, dividers, and light-gray section treatment |
| Body Slate | `#5d6673` | Long-form body copy, secondary links, and text on white controls |
| Mist Gray | `#a2a7af` | Muted text on dark surfaces, supporting labels, and fine icon strokes |
| Silver Gray | `#bbbec3` | Inset control outlines and low-contrast field boundaries |
| Ash Gray | `#8d929a` | Small legal copy and deeply secondary links |
| Steel Gray | `#767c86` | Quiet icon strokes, auxiliary labels, and subtle input definition |
| Studio Orange | `#f4511c` | Filled sign-up buttons and conversion moments — a concentrated warm mark against the blue-gray workspace |
| Mid Slate | `#46505f` | Dark filled account controls within the slate navigation system |

## Typography

### Tiempos — Display and section headings. The high-contrast serif makes the board-heavy interface read like a creative editorial workspace rather than a conventional product dashboard.
- **Substitute:** Libre Baskerville
- **Weights:** 600, 700
- **Sizes:** 20px, 24px, 40px, 64px
- **Line height:** 1.33
- **Letter spacing:** Near-zero tracking: -0.001em for headings; the 64px display treatment is 0px.

### Inter — Primary interface sans for navigation and buttons at 16px/700, large lead copy at 28px/400, and explanatory body copy at 24px/400.
- **Substitute:** Arial
- **Weights:** 400, 500, 700
- **Sizes:** 14px, 15px, 16px, 24px, 28px
- **Line height:** 1.25, 1.33, 1.43, 1.50, 1.60
- **Letter spacing:** -0.001em

### Source Sans — Supporting product-board, card, link, and utility text at 16px; it keeps embedded workspace UI quieter than the marketing typography.
- **Substitute:** Source Sans 3
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.33
- **Letter spacing:** -0.001em

### system-ui — Compact form, provider-signup, and utility text; use 14px/600 for provider buttons.
- **Substitute:** Arial
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.33, 1.43, 1.67
- **Letter spacing:** -0.001em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| utility | system-ui | 400 | 12px | 1.67 | -0.012px |
| provider-button | system-ui | 500 | 14px | 1.43 | -0.014px |
| input | Inter | 500 | 14px | 1.43 | -0.014px |
| body | Inter | 400 | 16px | 1.5 | -0.016px |
| nav-button | Inter | 700 | 16px | 1.33 | -0.016px |
| card-heading | Tiempos | 700 | 20px | 1.33 | -0.02px |
| hero-lead | Inter | 400 | 28px | 1.25 | -0.028px |
| section-heading | Tiempos | 700 | 40px | 1.33 | -0.04px |
| hero-display | Tiempos | 600 | 64px | 1.33 | 0px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 155px
- **Card padding:** 32px
- **Element gap:** 10px

### Border Radius

- **cards:** 10.26px
- **links:** 24px
- **pills:** 999px
- **inputs:** 4px
- **buttons:** 6px
- **elevatedCards:** 16px

## Components

### Slate Top Navigation
**Role:** Persistent public navigation above marketing sections.

Use a #303b4b bar with white 16px/700 Inter navigation labels. Keep utility controls compact with 16px horizontal internal spacing and 10px vertical padding.

### Orange Sign-up Button
**Role:** Filled conversion button for public signup.

Fill #f4511c with white 16px/700 Inter text, 6px radius, and 10px 16px padding. Use this treatment only for signup conversion moments.

### Slate Login Button
**Role:** Dark filled account-entry control in the public header.

Fill #46505f with white 16px/700 Inter text, 6px radius, and 10px 16px padding; it should remain visibly quieter than Studio Orange.

### White Provider Sign-up Button
**Role:** Third-party authentication option.

Use a #ffffff surface with #5d6673 14px/600 system-ui text, 4px radius, 10px 14px padding, and a 1px inset outline in #bbbec3.

### Editorial Section Heading
**Role:** Centered heading stack for white content bands.

Set the heading in #303b4b Tiempos 40px/700 with 1.33 line-height, followed by #5d6673 Inter 24px/400 at 1.25 line-height. Separate heading and lead copy by 22px.

### Dark Hero Heading Stack
**Role:** Centered opening message on the slate canvas.

Set the display line in white Tiempos 64px/600 with 1.33 line-height and 0px tracking; set the supporting line in #a2a7af Inter 28px/400 with 1.25 line-height.

### Product Board Showcase
**Role:** Large product screenshot used as the primary visual proof.

Present the board on a #ffffff surface with 10.26px corner radius and shadow: rgba(0, 0, 0, 0.16) 0px 16px 56px 4px, rgba(0, 0, 0, 0.08) 0px 2px 10px 0px. Keep the screenshot frame unpadded.

### Creative Discipline Card
**Role:** Horizontal carousel card for a creative workflow category.

Use a #ffffff visual card with 10.26px radius, no internal card padding, and the product-board shadow. Set its title in #303b4b Tiempos 20px/700 and supporting copy in muted slate text.

### Elevated Sign-up Panel
**Role:** Contained registration or conversion form surface.

Use #ffffff with 16px radius and 32px 40px padding. Apply shadow: rgba(27, 37, 54, 0.08) 0px 12px 28px 0px, rgba(27, 37, 54, 0.03) 0px 8px 8px -2px, rgba(27, 37, 54, 0.04) 0px 3px 3px -1.5px.

### Outlined Form Field
**Role:** Standard account form input.

Use a transparent background, #323b4a text and outline, 4px radius, and 10px 14px padding. For the icon-leading field, reserve 40px left padding; use a 1px inset #767c86 outline where the darker field variant appears.

### Muted Text Link
**Role:** Quiet footer, legal, and auxiliary inline navigation.

Use transparent fill, #a2a7af text, 2.5px radius, and no added padding. Keep legal-level links at #8d929a.

## Do's and Don'ts

### Do
- Use #303b4b for full-width hero, showcase, navigation, and footer bands; place #ffffff Tiempos type on these bands.
- Use #f4511c only for filled sign-up buttons with 6px radius and 10px 16px padding.
- Set hero displays with Tiempos 64px/600 and section headings with Tiempos 40px/700.
- Set explanatory copy in #5d6673 Inter 24px/400 with 30px line-height on white sections.
- Separate major page sections by 155px and use 10px as the default local control gap.
- Render product board frames as #ffffff cards with 10.26px radius and the 16px/56px black shadow.
- Use #ebedee as a board canvas or low-contrast divider surface rather than a text color.

### Don't
- Do not use #f4511c as a broad page background, banner color, or status color.
- Do not replace Tiempos headings with Inter or use sans-serif for the 64px hero display.
- Do not round public buttons, fields, or board cards into pills; use 6px, 4px, and 10.26px radii respectively.
- Do not place #5d6673 body copy directly on #303b4b; use #ffffff for headings and #a2a7af for supporting dark-surface copy.
- Do not remove the layered shadow from floating product-board cards or substitute a generic faint shadow.
- Do not compress major content bands below the 155px section gap.
- Do not use gradients or neon accent colors; the palette stays slate, paper, gray, and Studio Orange.

## Elevation

- **Product Board Showcase:** `rgba(0, 0, 0, 0.16) 0px 16px 56px 4px, rgba(0, 0, 0, 0.08) 0px 2px 10px 0px`
- **Elevated Sign-up Panel:** `rgba(27, 37, 54, 0.08) 0px 12px 28px 0px, rgba(27, 37, 54, 0.03) 0px 8px 8px -2px, rgba(27, 37, 54, 0.04) 0px 3px 3px -1.5px`
- **Muted Text Link:** `rgba(0, 0, 0, 0.1) 0px 5px 10px 0px`

## Surfaces

- **Slate Canvas** (`#303b4b`) — Hero, navigation, showcase bands, and footer.
- **Paper White** (`#ffffff`) — Editorial page bands, cards, form panels, and board frames.
- **Gallery Gray** (`#ebedee`) — Product-board canvas, dividers, and subdued control surfaces.
- **Elevated Paper** (`#ffffff`) — Floating screenshots and sign-up panels lifted by layered shadows.

## Imagery

The visual language is product-board-first: large contained screenshots show white and pale-gray canvases filled with overlapping notes, image crops, color swatches, files, sketches, and media cards. Photography is used inside these boards as raw editorial and product imagery, often black-and-white portraiture or tightly cropped objects, punctuated by saturated artwork colors that belong to the showcased content rather than the site palette. Screenshots have rounded outer frames and soft lift shadows; the marketing page itself remains text-led with imagery functioning as product demonstration. Icons are small, thin, and mostly gray or white, while the carousel uses a simple white circular arrow control.

## Layout

The page begins with a full-width #303b4b header and centered hero stack, with the product board presented directly beneath the hero copy as a wide floating proof surface. It then moves into expansive white editorial bands: centered heading and lead copy above a large contained board screenshot. A later #303b4b showcase band returns to the dark frame, using a centered serif heading above a horizontally scrolling row of tall white creative-workflow cards, with a circular next control overlapping the right edge. The overall rhythm is spacious and gallery-like, alternating broad dark and white fields rather than using persistent card grids; the top navigation remains a compact horizontal bar.

## Similar Brands

- **Miro** — Large collaborative-canvas screenshots and broad product-demonstration sections give the interface proof the same central role.
- **Milanote** — Dark framing bands, editorial serif headings, and overlapping visual-board imagery define this exact creative-workspace language.
- **Notion** — White workspace surfaces and restrained gray interface chrome keep content boards visually legible.
- **Are.na** — The composition treats gathered images, notes, and references as the primary visual material rather than decorative stock art.
