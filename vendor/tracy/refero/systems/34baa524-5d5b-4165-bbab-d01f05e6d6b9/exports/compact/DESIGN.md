# General Intelligence Company — Style Reference
> Literary journal beside a bonfire

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

General Intelligence Company uses an editorial, almost literary visual language: a warm off-white canvas interrupted by hand-painted atmospheric illustrations (moonlit skylines, wildflower meadows) that do the emotional work, while the actual UI lives on clean white between these scenes. Typography carries the brand — a custom display serif (ppmondwest) speaks in a low, measured voice at 48–54px with tight -0.04em tracking, while a custom sans (af) handles everything utilitarian at 13–18px. Color is nearly absent: a warm parchment white, a soft green-gray border, and one vivid blue (#41a1cf) used only as an outlined action border. Components whisper — 4px and 8px radii, hairline 1px borders, subtle backdrop-blur on the navigation, no decorative shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#fefffc` | Page canvas — warm off-white slightly creamier than pure white, gives the whole site its book-page atmosphere |
| Paper | `#ffffff` | Card surfaces, section backgrounds, footer — the slightly cooler clean white used for elevated content areas |
| Linen | `#f9faf7` | Input fields, subtle surface wash, nav fill — barely-perceptible off-white that reads as neutral |
| Ink Black | `#171717` | Primary foreground token, strong body text where maximum contrast is needed |
| Graphite | `#2c2c2c` | Headlines and key body text — softer than pure black, pairs with the warm canvas |
| Charcoal | `#444141` | Secondary text, button text — the workhorse text tone for body copy and UI labels |
| Ash | `#646464` | Muted helper text, descriptive copy, subdued UI |
| Fog | `#b4b8b4` | Tertiary borders, disabled states, lightest neutral in the scale |
| Mist | `#dee2de` | Hairline borders on cards, buttons, and section dividers — green-tinted to harmonize with illustrations |
| Twilight | `#282834` | Near-black with a cool blue undertone — used for nav borders, icon strokes, and outlined actions; reads darker than its lightness suggests |
| Dusk | `#1f1f29` | Filled button background — a near-black with cool violet undertone, the only non-white filled surface in the system |
| Signal Blue | `#41a1cf` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Cerulean | `#0081c0` | Vivid blue used for a singular saturated card surface — the lone moment of pure color intensity, used sparingly as atmospheric punctuation |

## Typography

### ppmondwest — Custom display serif for headlines and editorial copy — the voice of the brand. Tight -0.04em tracking at large sizes makes it feel set rather than typed; weight 400 even at 54px creates a confident, literary register rather than the 700-weight shouts common in tech. Liga features disabled.
- **Substitute:** Fraunces, Recoleta, GT Sectra
- **Weights:** 400, 500
- **Sizes:** 27px, 40px, 48px, 54px
- **Line height:** 1.1 (display), 1.5 (lead body)
- **Letter spacing:** -0.04em at 27px, -0.02em at 40-54px
- **OpenType features:** `"liga" 0`

### af — Custom sans for all UI, body copy, navigation, buttons, and small headings — a quiet, neutral workhorse. Weight 500 is the default for interactive and label text; weight 400 for body. Slight negative tracking (-0.01em) keeps dense UI from feeling airy.
- **Substitute:** Inter, Geist, Söhne
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13px, 15px, 16px, 18px
- **Line height:** 1.0 (nav/icons), 1.3 (body-sm/headings), 1.5 (body)
- **Letter spacing:** -0.01em to -0.012em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.3 | -0.13px |
| body-sm | — | — | 15px | 1 | -0.15px |
| subheading | — | — | 18px | 1.3 | -0.18px |
| heading-sm | — | — | 27px | 1.5 | -1.08px |
| heading | — | — | 40px | 1.1 | -0.8px |
| heading-lg | — | — | 48px | 1.1 | -0.96px |
| display | — | — | 54px | 1.1 | -1.08px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 32-64px
- **Card padding:** 16px
- **Element gap:** 8-12px

### Border Radius

- **nav:** 50px (pill)
- **cards:** 12px or 16px
- **buttons:** 4px or 8px
- **large-surfaces:** 24px

## Components

### Frosted Navigation Pill
**Role:** Primary site navigation

Floating pill at top center of the page, background rgba(255,255,255,0.06) with backdrop-blur(9-20px), 50px border-radius (fully rounded), 1px border in #282834 or white. Contains a small sun/landscape icon, three text links (About, Writing, Careers) in af 15px weight 500, and a bordered 'Get Cofounder' CTA button. The blur and transparency let the illustrated hero show through softly.

### Primary Outlined CTA Button
**Role:** Main call-to-action

8px border-radius, transparent background, 1px border in #41a1cf (Signal Blue), text in #41a1cf, af 15px weight 500, padding 5px 12px. The chromatic border is the entire visual identity of the button — no fill, no shadow. Arrow icon (→) inside a circle at the right edge.

### Secondary Outlined Button
**Role:** Secondary action

8px border-radius, transparent background, 1px border in #282834 (Twilight), text in #282834, af 15px weight 500, padding 5px 12px. The neutral cousin of the primary CTA — used when a second action appears alongside.

### Filled Dark Button
**Role:** Sole filled button variant

8px border-radius, background #1f1f29 (Dusk), text white, border 1px in #282834, af 15px weight 500, padding 8px 16px. Used very sparingly — the only filled button in the system, appears in footer or high-emphasis contexts.

### Ghost Text Link
**Role:** Inline links and tertiary navigation

No background, no border, text in #444141 or #282834, af 16px weight 400, often with an arrow icon. The default for 'Get to know us' style links. Underlined version used inline within headings for cross-references.

### Frosted Hero Overlay Card
**Role:** Hero information card

Overlays the illustrated hero. 24px border-radius, semi-transparent background, backdrop-blur, generous padding (80px on the vivid blue variant), white or dark text depending on background. The frosted glass treatment ties the UI to the painted illustration.

### White Content Card
**Role:** Standard content container

12px border-radius, background #ffffff (Paper), 1px border in #dee2de (Mist), shadow rgba(0,0,0,0.08) 0px 1px 1px / 0px 4px 5px. Padding varies — 0px for media cards, 16px for text cards. The soft green-tinted border is the signature edge treatment.

### Atmospheric Illustration Card
**Role:** Full-bleed illustrated section

Large format (often 1100000+ px area), 24px border-radius, vivid background color (#0081c0 Cerulean or painted landscape), generous internal padding 80-128px. These are the moments where color is allowed to exist — illustration-as-component.

### Diagram Card
**Role:** Visual explanation container

16px border-radius, semi-transparent white background, subtle shadow rgba(0,0,0,0.05) 0px 1px 8px, padding 12px. Houses line-art diagrams (isolated agent squares, coordinator nodes) — the visual explanations are always inside this soft frame.

### Input Field
**Role:** Form text input

0px border-radius (flat edges), background #f9faf7 (Linen), text #444141 (Charcoal), border-bottom-only in #444141. No visible top/side borders — the input is defined by its fill color and a single bottom line, giving a paper-form feel.

### Cookie Consent Banner
**Role:** Bottom-right notification

White background, rounded corners, small font af 13px, inline text + Decline/Accept text buttons separated by a vertical divider. The minimal, text-first treatment is characteristic — no icons, no color, no urgency.

### Footer
**Role:** Site footer

White background, large editorial statement in ppmondwest serif, small navigation links in af, generous vertical padding. The footer extends the literary feel — reading like the colophon of a book.

## Do's and Don'ts

### Do
- Use ppmondwest for any heading 27px and above; never use the sans for display text
- Set all ppmondwest headings to weight 400, never 600 or 700 — the serif does the work
- Use 1px solid #dee2de for all card and section borders; this green-tinted hairline is the visual signature
- Apply 8px border-radius to buttons and 12-16px to cards — avoid mixing 4px and 24px in the same surface
- Use #41a1cf as a border-only accent on CTAs; the system has no filled chromatic buttons
- Let the canvas be #fefffc (warm off-white), not pure #ffffff, to maintain the book-page atmosphere
- Pair display headings with line-height 1.1; pair body text with line-height 1.5 — the contrast is intentional

### Don't
- Do not use #000000 for text — use #171717 (Ink Black) or #2c2c2c (Graphite) for softer warmth
- Do not apply box-shadow to buttons; the system uses borders and backdrop-blur instead of elevation
- Do not introduce new accent colors — the palette is deliberately 95% neutral with one blue
- Do not use weight 600+ on ppmondwest; the serif's personality is in its thin strokes
- Do not use rgba or transparency on body text — all text colors should be solid hex values
- Do not use radius values above 24px except for the navigation pill; this is not a soft-rounded design
- Do not fill buttons with #41a1cf or #0081c0; Signal Blue and Cerulean are border/surface colors only

## Elevation

- **Navigation Pill:** `rgba(0, 0, 0, 0.15) 0px 2px 6px 0px`
- **Content Card:** `rgba(0, 0, 0, 0.08) 0px 1px 1px 0px, rgba(0, 0, 0, 0.08) 0px 4px 5px 0px`
- **Diagram Card:** `rgba(0, 0, 0, 0.05) 0px 1px 8px 0px`
- **Atmospheric Card:** `rgba(0, 0, 0, 0.06) 0px 2px 2px 0px, rgba(0, 0, 0, 0.04) 0px 0px 0px 5px`

## Surfaces

- **Parchment Canvas** (`#fefffc`) — Base page background — warm off-white that gives the whole site its editorial register
- **Paper Card** (`#ffffff`) — Elevated content surfaces, footer, white content sections between illustrations
- **Linen Wash** (`#f9faf7`) — Input fields, subtle surface differentiation, nav pill fill at low opacity
- **Vivid Blue** (`#0081c0`) — Rare atmospheric accent surface — the only saturated color in the system, used as a punctuation moment

## Imagery

Hand-painted digital illustrations carry the emotional narrative: a moonlit New York skyline with cherry blossom branches framing the composition, a dark wildflower meadow with golden poppies and purple flowers, a pixelated yellow-and-pink flower rendered in a low-resolution game-art style. The illustrations are painterly, not flat-vector — they have visible brush texture, atmospheric depth, and cinematic color grading (cool blues for night, warm greens for fields). All illustrations sit full-bleed or at 24px radius against the white canvas. No photography, no product screenshots, no abstract 3D. The pixelated flower is the one element that breaks the painted language — a deliberate contrast. Icons are minimal: a small sun-over-landscape glyph in the nav, simple line arrows in buttons.

## Layout

Full-bleed illustrated hero sections alternate with clean white content sections in a vertical rhythm. The hero is a 100vh painted illustration with a floating frosted-glass navigation pill at top-center and a glassmorphic overlay card at bottom-left containing the headline and CTA. Content sections are max-width 1200px centered, with generous vertical breathing room (64-96px). Headlines are left-aligned and large, often spanning 6-8 columns. Two-column layouts pair text with diagrams or illustrations. The diagram sections use a 6+6 split: explanatory text and figure caption on the left, line-art diagram in a soft-bordered card on the right. Navigation is a single floating pill — no sidebar, no mega-menu. Footer is a white band with a large editorial statement. The overall density is spacious: one idea per screen, never crowded.

## Similar Brands

- **Stripe** — Same editorial use of large custom serif headings on a warm off-white canvas, with illustrations doing narrative work between clean white content sections
- **Linear** — Similar restraint in color usage — near-monochrome palette with a single chromatic accent, hairline borders, 8px button radius, and generous spacing
- **Anthropic** — Shared literary, almost book-like visual register: warm canvas, serif display type, and painted or hand-crafted imagery replacing stock photography
- **Notion** — Comparable soft-green border tones (#dee2de family) and the same approach of using atmospheric illustrations as structural section dividers
- **Pitch** — Similar product-as-editorial-object sensibility with custom serif display type, off-white canvas, and full-bleed illustrated sections punctuating clean white content blocks
