# Contractbook — Style Reference
> cream-paper contracts under ultramarine sky

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Contractbook operates on a quiet, paper-white canvas with a single saturated ultramarine (#1009f6) carrying all brand weight — used sparingly on feature cards, headlines, and the primary footer CTA. The yellow (#ffba09) is a warm functional accent for high-emphasis actions against the monochromatic field. Typography is uniformly Abcwhyte (a single sans-serif family) at all sizes, which gives the system a calm, document-like coherence rather than the typical display/body font split. Components lean soft and round: 24px cards, 40px hero panels, 999px pill buttons — nothing has sharp corners. The whole experience reads like a well-designed printed contract on heavy cream stock.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ultramarine | `#1009f6` | Feature card backgrounds, brand-emphasis headlines, footer primary CTA — vivid violet-blue carries the entire brand voice, used as punctuation against the monochromatic cream field |
| Gold | `#ffba09` | Primary action buttons (Request a demo), accent cards — warm yellow against neutral surfaces creates the only chromatic urgency in an otherwise achromatic system |
| Forest | `#304801` | Decorative illustration and testimonial card accents — deep dark green used in editorial color blocks |
| Tangerine | `#ff3b09` | Decorative scribble accents and highlight strokes in illustrations |
| Royal | `#505cf9` | Soft highlight washes and secondary illustration fills — lighter companion to ultramarine |
| Sky | `#add3e5` | Pastel card surfaces and muted testimonial accents — near-gray blue used as a quiet cool counterpoint to the warm beige field |
| Thistle | `#e3c7de` | Pastel illustration fills and testimonial card tints — near-gray mauve |
| Mint | `#00e9a7` | Decorative green accent for illustration highlights |
| Cream | `#f0f0ec` | Page background, card surfaces, input fills — warm off-white dominates the entire canvas |
| Pearl | `#f7f7f3` | Elevated card surfaces, lighter than cream — used for nested content blocks |
| White | `#ffffff` | Pure white cards and inverted button text |
| Smoke | `#d4d4d0` | Muted helper text and secondary labels |
| Concrete | `#eaeae6` | Hairline borders, subtle dividers, disabled states |
| Washed Black | `#1a1a1a` | Primary text, headings, body copy — slightly softer than pure black for warmer reading |
| Ink | `#222222` | Secondary text and nav items |
| Charcoal | `#4d4d4d` | Muted body text, captions, metadata |
| Dim | `#6d6868` | Tertiary text, timestamps, fine print |
| Black | `#000000` | Button text on bright fills, strong borders |

## Typography

### Abcwhyte — Single sans-serif family used for everything — display headings, body, nav, buttons, inputs, footer. At 48px/700 with tight 1.25 line-height for hero headlines, dropping to 16px/400 with 1.5 line-height for body. The uniformity of one family at all sizes gives the system a document-like coherence rather than a display/body contrast.
- **Substitute:** Inter, DM Sans, or General Sans
- **Weights:** 400, 700
- **Sizes:** 11px, 12px, 14px, 16px, 25px, 28px, 32px, 40px, 48px
- **Line height:** 1.00–1.87
- **Letter spacing:** normal
- **OpenType features:** `"ss01" on`

### Abcwhyte — UI micro-copy — nav labels, tag chips, small captions, footer links
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 11px, 12px, 14px, 16px, 25px, 28px, 32px, 40px, 48px
- **Line height:** 1.4
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.87 | — |
| body-sm | — | — | 14px | 1.4 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 25px | 1.3 | — |
| heading-sm | — | — | 28px | 1.3 | — |
| heading | — | — | 32px | 1.3 | — |
| heading-lg | — | — | 40px | 1.2 | — |
| display | — | — | 48px | 1.25 | — |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 120px
- **Card padding:** 48px
- **Element gap:** 14px

### Border Radius

- **cards:** 24px
- **chips:** 999px
- **images:** 40px
- **inputs:** 4px
- **buttons:** 999px
- **hero-panels:** 40px

## Components

### Gold Pill Button (Primary)
**Role:** Highest-emphasis call-to-action

Filled #ffba09 background, #1a1a1a text, 999px border-radius (full pill), 1px solid #1a1a1a border, padding 15.75px 28px. Abcwhyte 14px/400. Used for 'Request a demo' — the single bright chromatic action in the system.

### Outlined Pill Button
**Role:** Secondary action

Transparent background, #1a1a1a text and border, 999px border-radius, padding 15.75px 14px. Abcwhyte 14px/400. Used for 'Start free trial' and nav CTAs that need presence without competing with the gold primary.

### White Pill Button
**Role:** Inverted secondary

#ffffff background, #222222 text, #222222 border, 9999px border-radius, padding 10.5px 14px. Compact pill used inside dark sections.

### Cream Feature Card
**Role:** Content card with generous padding

#f0f0ec background, 24px border-radius, no shadow, 48px padding on all sides. The default content surface — holds feature descriptions, testimonials, and section content.

### Hero Panel Card
**Role:** Large rounded content block

#f7f7f3 or #ffffff background, 40px border-radius, generous internal padding (48–60px). Used for the main hero container and large editorial sections. The 40px radius gives the page its soft, paper-like feel.

### Ultramarine Brand Card
**Role:** Full-bleed accent card

#1009f6 background, 24px border-radius, 48px padding. White text on ultramarine — used for feature highlights where the brand color needs to dominate the panel.

### Form Input
**Role:** Text and select input fields

#f0f0ec background, 1px solid #b3b3b3 border, 4.375px border-radius, padding 9.1px 14px. Abcwhyte 14px. The cream-on-cream with subtle gray border makes inputs feel like form fields on paper.

### Nav Bar
**Role:** Top navigation

White/transparent background, horizontal layout with logo left, nav links center, login + CTA right. Abcwhyte 14px/400 nav labels with dropdown indicators. Secondary utility bar above (#f0f0ec background) holds 'Help Centre', 'Contact sales', 'Log in'.

### Testimonial Card
**Role:** Customer quote block

Pastel-tinted background (#add3e5, #e3c7de, or #f0f0ec), 24px border-radius, contains a quote in Abcwhyte 32px/700 heading style, attribution below. Each testimonial uses a different pastel for visual variety.

### Video Player Thumbnail
**Role:** Embedded video preview

Full-bleed image with 40px border-radius, overlaid with a #1a1a1a pill-shaped play button containing 'Play 1:38' in white Abcwhyte 12px/700.

### Demo Request Form
**Role:** Contact/sales form

Multi-field form with cream inputs (#f0f0ec), stacked layout inside a white card. Submit button is ultramarine (#1009f6) with white text — the footer CTA uses ultramarine while the header CTA uses gold, establishing a color hierarchy.

### Footer
**Role:** Site footer

#1a1a1a background, white text, multi-column link layout. The dark footer provides the only large dark surface on an otherwise bright page.

### Tag/Chip
**Role:** Category label

Small inline label, #f0f0ec background, Abcwhyte 12px/700, tight padding (~5px 14px), 999px radius. Used for section labels like 'Import & Extract'.

### Scribble Decoration
**Role:** Hand-drawn squiggle and line illustrations in #ffba09 or #ff3b09, placed as decorative accents around sections. Adds warmth and personality without formal imagery.

Hand-drawn squiggle and line illustrations in #ffba09 or #ff3b09, placed as decorative accents around sections. Adds warmth and personality without formal imagery.

## Do's and Don'ts

### Do
- Use 999px or 9999px border-radius on ALL buttons, nav items, and tags — pill shapes are non-negotiable
- Use #ffba09 fill with #1a1a1a text for the single highest-emphasis action on any page
- Use #f0f0ec as the default page background and #ffffff or #f7f7f3 for elevated card surfaces
- Use Abcwhyte (or substitute Inter/DM Sans) as the ONLY font family across all sizes and weights
- Use 24px radius for standard cards and 40px radius for hero panels and images — never intermediate values
- Separate content layers with color and spacing, not shadows — this system is intentionally flat
- Use #1009f6 ultramarine sparingly: feature panels, brand headlines, footer CTA — never as a general accent

### Don't
- Do not add box-shadow to any card, button, or panel — elevation comes from color and space, never shadow
- Do not use a serif or display font for headlines — the single-family approach is the signature
- Do not use #1009f6 for body text or borders — reserve ultramarine for card backgrounds and brand emphasis only
- Do not use sharp corners (0–8px radius) on content cards — minimum card radius is 24px
- Do not introduce a second primary action color — gold (#ffba09) is the only filled chromatic button
- Do not use pure black (#000000) for body text — use #1a1a1a for warmer reading
- Do not crowd sections — maintain 120px vertical gaps between major sections

## Elevation

The design deliberately avoids shadows entirely. Separation between layers comes from color contrast (cream → pearl → white) and generous spacing rather than elevation. This flat treatment gives the system a printed-document quality — content sits on the page like text on paper, not floating cards in a digital space.

## Surfaces

- **Cream Canvas** (`#f0f0ec`) — Page background — warm off-white dominates the entire page
- **Pearl Card** (`#f7f7f3`) — Elevated card surfaces, hero panels — slightly lighter than canvas for subtle lift
- **White Card** (`#ffffff`) — Pure white surfaces for highest contrast content blocks and form containers
- **Brand Surface** (`#1009f6`) — Ultramarine feature cards — brand-color surface for emphasis panels
- **Dark Footer** (`#1a1a1a`) — Footer background — only dark surface, anchors page bottom

## Imagery

Photography is limited to one human subject (a single person in a casual interview setting, mid-shot). The dominant visual language is editorial illustration: flat geometric shapes, pastel color blocks, hand-drawn eye and target motifs, scribble decorations. The yellow/pink/mauve illustration cards function as both decoration and content containers. Images use 40px border-radius to match the panel language. Product UI screenshots appear in white device frames. The overall feel is print-magazine rather than tech-product — illustrations carry more visual weight than photography.

## Layout

Full-width sections stacked vertically, max-width ~1200px content containers centered inside. Hero is a centered card on the cream canvas with large display headline left, illustrated eye graphic right, dual CTA buttons below. Feature sections use 2-column text+image cards alternating with 3-column feature card grids. Testimonials appear as 3-column pastel card grids. Section rhythm is defined by generous 120px vertical gaps between sections. Navigation is a top bar with utility links above and primary nav below — both are transparent/white on the cream canvas. The overall density is spacious and editorial, not information-dense.

## Similar Brands

- **Linear** — Same single-family sans-serif typography approach with one bold accent color against a near-white canvas, though Linear leans more minimal/technical
- **Notion** — Similar warm cream background and single accent color strategy with generous spacing and soft rounded cards, though Notion uses more neutral grays
- **Loom** — Bright accent color on a light canvas with editorial illustration language and pill-shaped CTAs, sharing the playful-but-restraint visual rhythm
- **PandaDoc** — Same contract-management category with similar warm neutral palette, though PandaDoc uses more blue saturation and less editorial illustration
- **Figma Config** — Bold geometric illustration accents on a clean light canvas with strong typographic hierarchy and pill-shaped controls
