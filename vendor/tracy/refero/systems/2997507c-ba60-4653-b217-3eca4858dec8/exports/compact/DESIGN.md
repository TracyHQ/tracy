# FigureAI — Style Reference
> Robotics lab catalog. White technical documentation is interrupted by cinematic evidence of a humanoid moving through real interiors.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

FigureAI treats the website as a product dossier: expansive white fields, exact black type, and full-bleed humanoid photography carry nearly all of the visual weight. The mechanical PP Neue Machina display face appears in large uppercase declarations and technical specifications, while Neue Haas Grotesk keeps descriptions, forms, and controls human-scaled. Dark photographic chapters interrupt the white canvas with white overlay copy; color is withheld so the robot’s black visor, pale body, and textured materials remain the visual event.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lab White | `#ffffff` | Page canvas, light content surfaces, reversed type, and sparse structural borders |
| Figure Black | `#0c0c0c` | Primary editorial text, dark pill button fill, navigation marks, and hairline action borders |
| Absolute Black | `#000000` | Full-bleed dark media chapters, black hero surfaces, and form text |
| Machine Gray | `#6d6d6d` | Technical measurements, secondary labels, muted navigation text, and subdued metadata |
| Calibration Gray | `#cecece` | 1px navigation separators and light technical rules |

## Typography

### pp-neue-machina-plain — Uppercase navigation, technical figures, image-overlay headlines, and the 122px display title. Its monospaced-machine character turns labels and specifications into product instrumentation rather than conventional marketing type.
- **Substitute:** Space Grotesk
- **Weights:** 400
- **Sizes:** 14px, 28px, 52px, 122px
- **Line height:** 1.00, 1.11
- **Letter spacing:** -1.22px at 122px; normal at 28px and 52px; +0.28px at 14px navigation
- **OpenType features:** `"ss12"`

### neue-haas-grot-text — Body copy, contact fields, utility links, buttons, and small editorial headings. The slightly tightened grotesk keeps explanatory writing compact beside oversized technical display type.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 14px, 16px, 17px, 22px
- **Line height:** 1.00, 1.10, 1.20, 1.50, 1.60
- **Letter spacing:** -0.14px at 14px, -0.16px at 16px, -0.17px at 17px, -0.22px at 22px
- **OpenType features:** `"ss12"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| nav | pp-neue-machina-plain | 400 | 14px | 1 | 0.28px |
| button-label | neue-haas-grot-text | 500 | 14px | 1.2 | 0px |
| body | neue-haas-grot-text | 400 | 16px | 1.5 | -0.16px |
| body-large | neue-haas-grot-text | 400 | 17px | 1.6 | -0.17px |
| editorial-heading | neue-haas-grot-text | 400 | 22px | 1.1 | -0.22px |
| media-heading | pp-neue-machina-plain | 400 | 28px | 1.11 | 0px |
| technical-stat | pp-neue-machina-plain | 400 | 52px | 1.11 | 0px |
| display | pp-neue-machina-plain | 400 | 122px | 1 | -1.22px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 32px
- **Element gap:** 20px

### Border Radius

- **links:** 8px
- **pills:** 9999px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 24px
- **content-panels:** 12px
- **utility-controls:** 29px

## Components

### Transparent Overlay Header
**Role:** Global navigation placed over hero media

Use a 98px-tall transparent header over the opening image, with a blurred backdrop of 10px or 16px. Set the Figure mark and six PP Neue Machina navigation labels in Lab White at 14px/14px, 400 weight, uppercase, with +0.28px tracking.

### Technical Navigation Link
**Role:** Desktop section navigation item

Render as PP Neue Machina 14px/14px, 400 weight, uppercase, +0.28px tracking. Use Lab White on dark media and Figure Black on light sections; separate grouped navigation with Calibration Gray 1px rules where dividers are needed.

### Figure Display Hero
**Role:** Opening product introduction

Use a white, edge-to-edge hero with the humanoid product crop occupying the left side and a Figure Black PP Neue Machina title at 122px/122px with -1.22px tracking on the right. Place supporting Neue Haas Grotesk text at 16px/24px with -0.16px tracking directly beneath the title.

### Technical Specification Rail
**Role:** Measured product attributes beside a product crop

Stack right-aligned Machine Gray labels and PP Neue Machina values on Lab White. Use 52px/57.72px values at 400 weight, 16px/24px supporting labels, and divide each row with a 1px Calibration Gray horizontal rule.

### Cinematic Image Chapter
**Role:** Full-bleed contextual robot photography

Use full-width, square-edged photographic frames with no card treatment. On dark or shadowed photography, anchor a Lab White PP Neue Machina uppercase heading at 28px/31.08px and a Lab White Neue Haas Grotesk paragraph at 17px/27.2px in a lower corner.

### Black Pill Button
**Role:** Filled conversion control

Fill with Figure Black and use Lab White Neue Haas Grotesk text at 14px/16.8px, 500 weight. Set a 24px radius, 0px vertical padding, 32px horizontal padding, and a Figure Black border.

### Underlined Contact Control
**Role:** Text-led secondary action

Use a transparent background, Figure Black Neue Haas Grotesk text at 14px/16.8px and 500 weight, 0px radius, and no internal padding. Draw the affordance with a Figure Black 1px border or underline rather than a filled surface.

### Contact Text Input
**Role:** Minimal contact-form field

Keep the field transparent with 0px radius and no internal padding. Use black 14px Neue Haas Grotesk text at 1.5 line-height and a single black 1px rule; do not enclose it in a rounded gray box.

### Editorial Section Heading
**Role:** Light-surface supporting section title

Use Neue Haas Grotesk at 22px/24.2px, 400 weight, with -0.22px tracking in Figure Black. This quieter, sentence-case heading sits on Lab White rather than competing with the machine-display headlines.

### Technical Statistic
**Role:** Measurement readout

Set the value in PP Neue Machina at 52px/57.72px, 400 weight, Machine Gray; pair it with a smaller Machine Gray descriptor and align both to the right edge of the specification rail.

### Footer Navigation Matrix
**Role:** Dense closing site navigation

Arrange grouped links with 16px to 24px internal gaps and 40px group separation. Use Neue Haas Grotesk body text at 16px/24px for utility content and PP Neue Machina 14px uppercase labels where section navigation repeats.

## Do's and Don'ts

### Do
- Keep the primary canvas Lab White #ffffff and reserve Absolute Black #000000 for full-bleed media chapters.
- Set display titles in pp-neue-machina-plain 400; use 122px/122px with -1.22px tracking for the largest light-surface statement.
- Use pp-neue-machina-plain at 14px/14px with +0.28px tracking for uppercase navigation labels.
- Set explanatory paragraphs in neue-haas-grot-text 17px/27.2px with -0.17px tracking.
- Use Figure Black #0c0c0c filled buttons only with a 24px radius and 32px horizontal padding.
- Build specification rows from Machine Gray #6d6d6d type and 1px Calibration Gray #cecece rules.
- Use 20px element gaps, 32px content padding, and 40px section gaps as the default rhythm.

### Don't
- Do not introduce saturated accent colors, gradients, or colorful status treatments.
- Do not place display headlines in a bold 600 or 700 weight; pp-neue-machina-plain remains 400.
- Do not round photographic frames or turn full-bleed image chapters into floating cards.
- Do not use heavy box shadows; separate sections through white space, image boundaries, and 1px rules.
- Do not use gray filled input fields; contact fields stay transparent with square 0px corners.
- Do not use Machine Gray #6d6d6d for long copy on Absolute Black #000000.
- Do not replace the 24px pill button with a rectangular button or a 9999px capsule.

## Elevation

Avoid floating elevation. Components sit flush on their surface; depth comes from full-bleed photography, black-to-white chapter changes, thin 1px rules, and the header’s restrained backdrop blur.

## Surfaces

- **Lab White Canvas** (`#ffffff`) — Primary page background, product specification field, and light editorial sections.
- **Figure Black Surface** (`#0c0c0c`) — Filled pill controls, dark marks, and high-contrast editorial text.
- **Absolute Black Media Field** (`#000000`) — Dark image chapters and immersive hero-level media surfaces.

## Imagery

Photography is the primary graphic system: tightly cropped, high-resolution product portraits expose the robot’s glossy black visor, white shell, textile-like gray body surface, and mechanical joints. The opening uses isolated product imagery on pure white, while later imagery places the humanoid in dark, architectural residential interiors; these frames are full-bleed, square-edged, and used as proof rather than decoration. Icons are minimal and monochrome, including the stepped Figure mark; there are no illustrated scenes, ornamental gradients, or colorful diagrams. Pages are image-led, with sparse type occupying open areas of the same frame or a controlled edge of the photograph.

## Layout

The page is an edge-to-edge editorial sequence rather than a centered card layout. A transparent 98px header overlays the opening white product hero, where an oversized humanoid crop occupies the left half and a large right-side product title with compact explanatory copy occupies the remaining field. Product documentation follows as a split composition: an enlarged torso crop on the left and a vertically stacked, right-aligned specification rail on white at right. Later chapters shift to full-bleed, dark interior photography with lower-corner white copy, then return to light contact and footer areas; navigation is a thin top bar rather than a sidebar or mega-menu.

## Similar Brands

- **Nothing** — Shares oversized product-led compositions, severe monochrome restraint, and hardware details treated as editorial evidence.
- **Tesla** — Shares full-bleed product photography, sparse conversion controls, and specification-driven storytelling.
- **Apple** — Shares isolated object photography on broad white fields and minimal supporting copy around a hero object.
- **Unitree Robotics** — Shares humanoid robotics imagery, technical product framing, and dark cinematic demonstrations.
- **Teenage Engineering** — Shares technical typography, product-catalog pacing, and a monochrome hardware-first visual vocabulary.
