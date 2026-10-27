# Beings — Style Reference
> portrait gallery on warm paper. Build with monumental type, tightly cropped human photography, and sharp rectangular compositions punctuated by pale peach and dark cocoa fields.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Beings combines oversized, almost poster-like black typography with sharp-edged editorial portraiture and warm skin-tone section fields. The white opening canvas is interrupted by deep brown and peach editorial panels, where compact uppercase navigation sits far quieter than the imagery and type. The system gives visual authority to representation-led photography: faces are cropped close, media blocks are large and unrounded, and thin circular linework creates a recurring gallery-layout gesture.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Primary page canvas, header background, and bright media surround |
| Milk Paper | `#fff4ec` | Warm light surface for talent pages, partner labels, and soft text on dark sections |
| Cocoa Ink | `#1b0800` | Primary text, navigation, outlined controls, logo treatment, and dark surface |
| Talent Peach | `#f6c9a1` | Talent-section display text and supporting copy on Cocoa Ink — the muted peach makes dark editorial panels feel human rather than corporate |
| Home Umber | `#381a06` | Deep brown feature-section surface for high-contrast editorial statements |
| Join Blush | `#fae3cf` | Pale peach participation and joining surface |
| Shortlist Clay | `#78492d` | Shortlist area surface and dark-on-light warm brown emphasis |
| Shortlist Cream | `#fdf4ed` | Text on Shortlist Clay surfaces |
| Peach Wash | `#ffe2cc` | Secondary pale warm surface |
| Profile Copper | `#db9a68` | Profile dark-theme text and small warm highlight |
| Fine Grey | `#999999` | Hairline decorative circles and subdued interface marks |

## Typography

### Die Grotesk B SemiBold — Workhorse reading and utility face for compact body copy, links, skip navigation, and partner names. Its 12px and 16px settings retain a blunt, compact texture instead of expanding into conventional airy sans-serif body text.
- **Substitute:** Space Grotesk
- **Weights:** 400
- **Sizes:** 12px, 15px, 16px
- **Line height:** 1.10, 1.40
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`

### Die Grotesk B Bold — Navigation, text controls, brand links, and the 22px introductory heading. Keep the nominal 400 weight mapping: visual boldness comes from the bespoke face rather than a CSS 700 value.
- **Substitute:** Archivo
- **Weights:** 400
- **Sizes:** 12px, 22px
- **Line height:** 1.10, 1.40
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`

### Die Grotesk B Black — Rare 12px emphatic micro-label treatment.
- **Substitute:** Archivo Black
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.40
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`

### Die Grotesk C Black — 30px statement heading for dark, warm-toned editorial panels. The black cut gives short declarations a dense, carved texture.
- **Substitute:** Archivo Black
- **Weights:** 400
- **Sizes:** 30px
- **Line height:** 1.18
- **Letter spacing:** normal
- **OpenType features:** `"kern", "ss01", "ss02", "ss03", "ss04"`

### Bonto — Display face for the 66px Talent title and major identity-scale words. The tight tracking and single-line leading make the lettering read as a graphic slab rather than ordinary headline text.
- **Substitute:** Anton
- **Weights:** 400
- **Sizes:** 66px
- **Line height:** 1.00
- **Letter spacing:** -1.99px at 66px
- **OpenType features:** `"kern", "ss01" 0, "ss02", "ss03" 0, "ss04" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| nav-control | Die Grotesk B Bold | 400 | 12px | 1.4 | 0px |
| body | Die Grotesk B SemiBold | 400 | 12px | 1.4 | 0px |
| skip-link | Die Grotesk B SemiBold | 400 | 15px | 1.4 | 0px |
| partner-label | Die Grotesk B SemiBold | 400 | 16px | 1.1 | 0px |
| intro-heading | Die Grotesk B Bold | 400 | 22px | 1.1 | 0px |
| statement-heading | Die Grotesk C Black | 400 | 30px | 1.18 | 0px |
| display-title | Bonto | 400 | 66px | 1 | -1.98px |

## Spacing & Layout

**Base unit:** 6px

**Density:** comfortable

- **Element gap:** 12px

### Border Radius

- **links:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Utility Header
**Role:** Top-level public navigation

Use a Paper White #ffffff horizontal bar with Cocoa Ink #1b0800 12px Die Grotesk B Bold navigation labels, 16.8px line-height, uppercase text, and 8px internal link padding.

### Text Navigation Link
**Role:** Public-section and brand navigation

Render as transparent text in Cocoa Ink #1b0800, Die Grotesk B Bold at 12px/16.8px, uppercase, with 0px radius and 8px padding. Do not add a filled background.

### Transparent Utility Button
**Role:** Playback and shortlist controls

Use transparent background, Cocoa Ink #1b0800 text and border color, 0px radius, 0px padding, and uppercase Die Grotesk B Bold at 12px/16.8px.

### Skip Link
**Role:** Keyboard-accessible route into page content

Place White #ffffff Die Grotesk B SemiBold text at 15px/21px on a Cocoa Ink #1b0800 focus surface.

### Intro Copy Block
**Role:** Talent-directory introduction

Set the heading in Cocoa Ink #1b0800 using Die Grotesk B Bold at 22px with 24.2px line-height; pair only with compact 12px/16.8px Die Grotesk B SemiBold support copy.

### Bonto Display Title
**Role:** Section-scale identity wordmark

Set a single short word in Bonto at 66px/66px with -1.99px tracking. Use Talent Peach #f6c9a1 when the title sits on Home Umber #381a06.

### Dark Editorial Statement Panel
**Role:** High-emphasis narrative section

Use Home Umber #381a06 as the full panel surface; set the main statement in Talent Peach #f6c9a1 using Die Grotesk C Black at 30px/35.25px, with supporting copy in Die Grotesk B SemiBold at 12px/16.8px.

### Sharp Portrait Media Block
**Role:** Talent showcase imagery

Use high-contrast, tightly cropped portrait photography in a raw rectangular frame with 0px image radius. Surround against Paper White #ffffff or Milk Paper #fff4ec; do not add card borders or shadows.

### Orbital Line Motif
**Role:** Editorial divider and image overlap device

Overlay a single oversized Fine Grey #999999 circular hairline across the boundary of a sharp portrait block and adjacent empty surface. Keep the interior transparent and avoid filling the circle.

### Shortlist Surface
**Role:** Warm saved-talent area

Use Shortlist Clay #78492d as the surface with Shortlist Cream #fdf4ed text in Die Grotesk B SemiBold at 16px/17.6px; retain square 0px geometry.

### Partner Name Label
**Role:** Funding and partner acknowledgement

Set Milk Paper #fff4ec text in Die Grotesk B SemiBold at 16px/17.6px on Cocoa Ink #1b0800 or Home Umber #381a06.

## Do's and Don'ts

### Do
- Use Paper White #ffffff as the primary canvas and Milk Paper #fff4ec as the warm secondary surface.
- Set public navigation and text controls in uppercase Die Grotesk B Bold at 12px with 16.8px line-height.
- Use 0px radius for buttons, navigation links, and portrait media.
- Reserve Bonto at 66px/66px with -1.99px tracking for isolated section-scale words.
- Place Talent Peach #f6c9a1 type only on Cocoa Ink #1b0800 or Home Umber #381a06 surfaces.
- Keep repeated local spacing on the 6px base unit, using 12px for adjacent control and copy gaps.
- Use Fine Grey #999999 only as thin unfilled circular linework or subdued interface detail.

### Don't
- Do not use rounded cards, pill buttons, or any radius above the documented 0px geometry.
- Do not set Talent Peach #f6c9a1 text on Paper White #ffffff or Milk Paper #fff4ec.
- Do not introduce drop shadows beneath portrait blocks, header controls, or editorial sections.
- Do not replace the 66px Bonto display treatment with a generic bold sans-serif headline.
- Do not turn transparent 12px navigation controls into filled buttons without a documented section-specific surface.
- Do not use bright blue, green, or red status colors; the system stays within Cocoa Ink #1b0800 and its peach-to-umber range.
- Do not use soft rounded stock imagery; crop portraits close and retain sharp rectangular edges.

## Elevation

Surfaces are separated by hard image edges, white space, warm field changes, and thin orbital strokes rather than shadows. Portraits should look placed on a printed editorial spread, not raised as interface cards.

## Surfaces

- **Paper White** (`#ffffff`) — Primary page canvas and header surface.
- **Milk Paper** (`#fff4ec`) — Warm talent-area and light editorial surface.
- **Join Blush** (`#fae3cf`) — Pale peach participation surface.
- **Cocoa Ink** (`#1b0800`) — Dark text field and high-contrast surface.
- **Home Umber** (`#381a06`) — Deep editorial statement-panel surface.

## Imagery

Photography is the central visual language: high-contrast portraits of people are tightly cropped, often allowing hair, shoulders, and faces to exceed the apparent frame. Images are large, raw rectangular blocks with no rounding, no device mockups, and little visual separation from the page; their role is talent showcase rather than background decoration. The page is text-dominant only in the masthead and dark declaration panels, while most visual weight belongs to documentary/editorial portrait crops. Graphics are limited to thin mono circular outlines that overlap media and adjacent negative space.

## Layout

The page opens on a Paper White #ffffff canvas with a thin, widely distributed utility header and an enormous dark identity wordmark spanning most of the viewport. The first content composition is asymmetric: a large, tightly cropped portrait anchors the left while a compact 22px introductory heading occupies the open white area to the right. Subsequent sections behave like an editorial collage rather than a card grid, placing large raw-edge portraits in offset two-column arrangements over warm light and brown fields; fine circular outlines bridge image and negative-space boundaries. The page is spacious and image-led, with minimal navigation, large uninterrupted media rectangles, and occasional full-width dark statement bands.

## Similar Brands

- **The Gentlewoman** — Shares the editorial use of oversized typography, direct portrait photography, and expansive white space.
- **A24** — Uses graphic-scale wordmarks and image-led compositions with intentionally sparse interface chrome.
- **It’s Nice That** — Shares the gallery-like treatment of creative work, sharp media framing, and typography-led page structure.
- **Dazed** — Uses tightly cropped human portraiture and editorial layouts where photography carries the visual hierarchy.
