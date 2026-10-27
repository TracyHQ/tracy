# Glyphs — Style Reference
> A letterpress workshop under neon light. Build white, spacious editorial compositions where exact vector-editing imagery is interrupted by bright color slabs and monumental letterforms.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Glyphs combines a white editorial canvas with oversized, high-contrast serif lettering and exposed type-design mechanics: Bézier handles, giant translucent glyphs, and application canvases remain visible rather than being hidden behind product mockups. The palette works in loud rectangular blocks—acid lime, cyan, orange, mustard, and deep cherry—while the surrounding page stays predominantly white and quietly spaced. One custom typeface spans every role, making navigation, editorial display copy, and UI annotations feel like outputs from the same font-making environment.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper | `#ffffff` | Page canvas, navigation surface, product-canvas interiors, and reversed text on dark feature panels |
| Blush Paper | `#f7eef1` | Pale tinted card surface and soft alternate content band |
| Control Gray | `#eeeeee` | Neutral utility-control backgrounds |
| Mint Wash | `#e9f3eb` | Soft green-tinted list and skip-link surface |
| Ink | `#000000` | Black utility text, compact headings, and neutral controls |
| Cherry Ink | `#42242e` | Deep plum feature-panel surface, large editorial headings, borders, and orange-on-cherry controls |
| Workshop Green | `#1e3219` | Default editorial text, navigation text, logo mark, and linework over the white canvas |
| Acid Glyph | `#9aff00` | Purchase and conversion surfaces, highlighted end-cap sections, and active outlined-action borders — the fluorescent green punctuates otherwise paper-and-ink layouts |
| Signal Orange | `#f66a06` | Secondary feature panels, tutorial links, oversized decorative glyphs, and circular action controls against Cherry Ink |
| Mustard Proof | `#f2ad0d` | Warm feature-card surface and colored editorial emphasis |
| Cyan Blueprint | `#1ad1e6` | Feature-card surface, product-canvas outlines, and vector-tool overlays; its technical blue makes the editor imagery read as live workspace material |
| Ochre Ink | `#604900` | Text and small labels on lime and cyan feature surfaces |
| Burnt Ink | `#4d2f1a` | Text and borders on mustard feature surfaces |
| Blueprint Ink | `#243f42` | Dark technical text within cyan-oriented editor and list content |

## Typography

### Symbol Helper — Single-family system for every text role: 14px navigation, 18px links and supporting copy, 20px interface labels, 24px card kickers, 34px introductions, 50px testimonial statements and arrows, 80px display headlines, and 480px decorative glyph-scale type. Keeping all weights at 400 makes scale and the font's sharply calligraphic serif shapes do the hierarchy work rather than boldness.
- **Substitute:** Cormorant Garamond
- **Weights:** 400
- **Sizes:** 14px, 18px, 20px, 24px, 34px, 50px, 80px, 480px
- **Line height:** 1.00, 1.10, 1.18, 1.25, 1.40, 1.43
- **Letter spacing:** normal
- **OpenType features:** `"calt", "clig", "kern", "liga"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| nav | Symbol Helper | 400 | 14px | 1.43 | 0px |
| body | Symbol Helper | 400 | 18px | 1.4 | 0px |
| label | Symbol Helper | 400 | 20px | 1.25 | 0px |
| kicker | Symbol Helper | 400 | 24px | 1.25 | 0px |
| intro | Symbol Helper | 400 | 34px | 1.18 | 0px |
| testimonial | Symbol Helper | 400 | 50px | 1.1 | 0px |
| display | Symbol Helper | 400 | 80px | 1 | 0px |
| decorative-glyph | Symbol Helper | 400 | 480px | 1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Section gap:** 40px
- **Card padding:** 36-40px
- **Element gap:** 20px

### Border Radius

- **cards:** 10px
- **pills:** 9999px
- **buttons:** 5px
- **product-canvases:** 10px
- **circular-controls:** 50%

## Components

### Public Header
**Role:** Top-level brand and public-site navigation

Use a Paper (#ffffff) header with the Workshop Green (#1e3219) logo and 14px/20.02px Symbol Helper navigation. Keep links compact with 18px horizontal padding where controls need a hit area; the purchase control is the only fluorescent interruption.

### Lime Purchase Button
**Role:** Filled public conversion action

Set the filled surface to Acid Glyph (#9aff00) with Workshop Green (#1e3219) 14px/20.02px Symbol Helper text. Use square corners rather than a pill and retain the highlighter-block silhouette.

### Language Pill
**Role:** Preferred-language selector

Render uppercase 14px/20.02px Workshop Green text inside a 9999px-radius outlined chip. Use a 1px Workshop Green (#1e3219) border on Paper with 4px vertical padding.

### Editorial Hero
**Role:** Opening display composition

Set the main statement in Workshop Green at 80px/80px Symbol Helper on Paper. Pair it with an oversized 480px/480px translucent or clipped glyph treatment and exposed black vector paths, circular handles, and Cyan Blueprint (#1ad1e6) guide lines.

### Intro Statement
**Role:** Large supporting product summary

Use Workshop Green text at 34px/40px Symbol Helper with no tracking adjustment. Keep the block separate from display type by a 40px gap and leave broad Paper space around it.

### Lime Testimonial Carousel
**Role:** Customer quotation feature

Use an Acid Glyph (#9aff00) panel with a 10px radius and Workshop Green quote text at 50px/54.968px. Frame or flank the panel with raw black-and-white portrait crops; navigation arrows use the same 50px/54.968px type treatment in Workshop Green.

### Cyan Feature Annotation Card
**Role:** Technical feature callout over product imagery

Use Cyan Blueprint (#1ad1e6), 10px radius, and padding of 36px top, 99.896px right, 40px bottom, and 40px left. Set the 24px/30px kicker and supporting text in Ochre Ink (#604900); use 18px/25.2px Signal Orange (#f66a06) for the linked continuation.

### Mustard Feature Annotation Card
**Role:** Alternate technical feature callout

Use Mustard Proof (#f2ad0d), 10px radius, and padding of 36px top, 40px right, 40px bottom, and 99.896px left. Set its text and border details in Burnt Ink (#4d2f1a); do not treat this yellow panel as the universal purchase treatment.

### Cherry Feature Annotation Card
**Role:** Dark alternate technical feature callout

Use Cherry Ink (#42242e), 10px radius, and padding of 36px top, 40px right, 40px bottom, and 99.896px left. Use Signal Orange (#f66a06) for 18px/25.2px links and Paper (#ffffff) for reversed long-form text.

### Outlined Product Canvas
**Role:** Contained font-editor showcase

Place editor screenshots and type-design diagrams on Paper inside a 10px-radius frame with a 1px Cyan Blueprint (#1ad1e6) border. Preserve raw toolbars, coordinate readouts, Bézier points, handles, and translucent glyph layers as explanatory content.

### Orange Circular Control
**Role:** Compact colored navigation control

Use a Signal Orange (#f66a06) circular surface with a 50% radius and Cherry Ink (#42242e) icon or arrow. Keep internal padding at 0px and let the circle's fixed control geometry define the hit area.

### Tutorial Text Link
**Role:** Inline continuation link

Set Symbol Helper at 18px/25.2px with no text decoration. Color the link Signal Orange (#f66a06) on light surfaces, Mustard Proof (#f2ad0d) on dark cherry surfaces, or Cyan Blueprint (#1ad1e6) where it belongs to a cyan feature context.

## Do's and Don'ts

### Do
- Use Paper (#ffffff) as the dominant page canvas and reserve colored surfaces for self-contained feature moments.
- Set display headlines in Symbol Helper 400 at 80px/80px in Workshop Green (#1e3219).
- Use Symbol Helper 400 at 14px/20.02px for public navigation and 18px/25.2px for text links.
- Apply 10px radius to feature cards and outlined product canvases; apply 5px radius to rectangular buttons.
- Build colored feature cards with 36px top and 40px bottom padding, using the documented 40px/99.896px asymmetric side padding.
- Use Acid Glyph (#9aff00) for filled purchase surfaces and retain Workshop Green (#1e3219) text.
- Keep primary layout gaps at 40px between content groups and 20px between related controls or text elements.

### Don't
- Do not introduce bold or semibold text; keep Symbol Helper at weight 400 and establish hierarchy through the 14px–480px scale.
- Do not round rectangular public actions into pills; reserve 9999px radius for language chips and similar compact selectors.
- Do not use drop shadows on cards, feature panels, or product frames.
- Do not replace Cyan Blueprint (#1ad1e6) product outlines with neutral gray borders.
- Do not make Mustard Proof (#f2ad0d), Cyan Blueprint (#1ad1e6), or Signal Orange (#f66a06) the default purchase fill; use Acid Glyph (#9aff00) for that role.
- Do not hide all vector nodes, handles, rulers, and interface chrome in product imagery; exposed construction is part of the visual language.
- Do not use gradients; color changes occur as flat, sharply bounded fields.

## Elevation

Surfaces separate through flat color, 1px outlines, raw image cropping, and overlap—not box shadows. Product canvases read as precise boards because Cyan Blueprint borders and visible editor chrome replace elevation.

## Surfaces

- **Paper** (`#ffffff`) — Primary page canvas, header, and editor-canvas interior.
- **Blush Paper** (`#f7eef1`) — Soft alternate card and content surface.
- **Mint Wash** (`#e9f3eb`) — Pale green list and utility surface.
- **Control Gray** (`#eeeeee`) — Neutral control background.
- **Acid Glyph** (`#9aff00`) — High-attention purchase and featured conversion surface.

## Imagery

Visuals are dominated by contained font-editor screenshots and abstract type-design process graphics: Bézier paths, node circles, pen handles, rulers, small toolbars, and oversized translucent glyph outlines. These diagrams often fill a large framed canvas and are partially covered by flat 10px-radius cyan, mustard, or cherry annotation cards. Testimonial imagery uses high-contrast black-and-white close portrait crops with raw rectangular edges around a lime quote block. The page is text-led rather than image-heavy, but product imagery occupies large horizontal bands as explanatory proof; icons are sparse, monochrome technical marks rather than decorative illustration.

## Layout

The page is a wide Paper canvas with a compact top header: logo at left, small public navigation grouped at right, followed by a fluorescent purchase block and language chip. The opening composition is left-aligned editorial display type above or against an oversized cropped letterform and full-width vector-editing artwork. Content moves in spacious 40px beats between contained product canvases, overlapping annotation cards, and broad color blocks; feature callouts alternate cyan, mustard, and cherry rather than forming a uniform card grid. A lime testimonial carousel uses a central quote panel bracketed by monochrome portrait crops, while late-page community and purchase sections become larger saturated fields. Navigation remains a top bar; product screenshots are framed, layered objects rather than separate right-column illustrations.

## Similar Brands

- **Swiss Typefaces** — Editorial serif-led type presentation paired with specimen-scale lettering and restrained white layouts.
- **Typewolf** — Type-centric compositions where large display faces, specimen imagery, and editorial spacing carry the interface.
- **Figma** — Exposed vector handles, canvas chrome, technical annotations, and bright cyan workspace cues.
- **Notion** — Predominantly white canvas, compact light-weight navigation, and sparse interface framing around content.
- **Mailchimp** — Flat, high-chroma color fields used as contained editorial panels rather than gradient-heavy decoration.
