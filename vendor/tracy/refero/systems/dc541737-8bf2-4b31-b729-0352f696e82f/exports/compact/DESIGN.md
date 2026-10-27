# OpenAI — Style Reference
> Research lab notebook at noon.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

OpenAI's interface operates as a typographic, editorial canvas — pure white surfaces, near-black type, and almost no chromatic identity. The system is defined by restraint: the only filled element on the page is the black 'Try ChatGPT' button, which functions as a single period at the end of an otherwise monochrome sentence. Hairline borders at 12% black opacity create structure without weight; cards carry a barely-perceptible 6px radius that whispers geometry rather than announcing it. Typography does the heavy lifting: a custom sans (OpenAI Sans) set at a Major Second scale with progressively tighter tracking — -0.03em at display, normal at body — gives headlines a compressed, almost newsprint authority. Components feel deliberately lightweight: pill-shaped controls, ghost buttons, transparent surfaces, and minimal elevation. The visual mood is 'research lab notebook' — quiet, confident, and trusting the reader to focus on content rather than chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, filled action button (Try ChatGPT), strongest interactive emphasis — the single period of chromatic punctuation in an otherwise achromatic system |
| Graphite | `#666666` | Muted captions, helper text, and de-emphasized UI labels. |
| Smoke | `#8f8f8f` | Tertiary text, disabled states, icon strokes, placeholder text — the dimmest readable voice |
| Paper | `#ffffff` | Page canvas, card surfaces, input fills — the infinite background that lets type and imagery carry all weight |
| Ash | `#f1f1f1` | Subtle surface elevation, hover states, language selector background — a barely-visible plane shift from Paper |
| Hairline | `#0000001f` | All borders, dividers, card outlines, button outlines — structure without weight, defined as a semi-transparent black rather than a gray hex |
| Whisper | `#0000000a` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### OpenAI Sans — Primary typeface for all UI text — custom geometric sans with humanist warmth, used at weight 400 for body, 500 for nav/labels/headings, 600 only for the largest headings. Signature: -0.03em tracking at display sizes creates compressed authority; +0.011em at 28px adds subtle breathing for subheads. Font features: 'calt' and 'liga' enable contextual alternates and ligatures.
- **Substitute:** Inter, Söhne, or system-ui sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 13px, 14px, 16px, 17px, 18px, 22px, 28px, 48px
- **Line height:** 1.00–1.65
- **Letter spacing:** -0.03em at 48px, 0.011em at 28px, -0.01em at 22px and below
- **OpenType features:** `'calt' on, 'liga' on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.51 | -0.13px |
| input | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 18px | 1.32 | -0.18px |
| subheading | — | — | 22px | 1.26 | -0.22px |
| heading | — | — | 28px | 1.21 | 0.31px |
| display | — | — | 48px | 1.16 | -1.44px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 32-64px
- **Card padding:** 12px
- **Element gap:** 12-16px

### Border Radius

- **tags:** 9999px
- **cards:** 6px
- **links:** 4px
- **inputs:** 9999px
- **buttons:** 9999px

## Components

### Filled Action Button
**Role:** Primary conversion — the only filled button in the system

Solid #000000 background, white text at 14px weight 500, full pill radius (9999px), 8px vertical / 20px horizontal padding. Used sparingly — currently only for 'Try ChatGPT'. This is the system's only chromatic punctuation.

### Outlined Pill Button
**Role:** Secondary actions and category filters

Transparent background, #000000 text at 14px weight 500, 1px solid border at rgba(0,0,0,0.12), full pill radius (9999px), 8px vertical / 20px horizontal padding. The default for tag chips like 'Talk with ChatGPT', 'Research', 'API Platform'.

### Ghost Text Button
**Role:** Lowest-emphasis actions and navigation

No background, no border, #000000 text at 13-14px weight 500. Used for nav items, breadcrumb-style links, and the 'Log in' control. Relies on hover state (Whisper background) for affordance.

### Search Input
**Role:** Primary interaction surface — the ChatGPT prompt bar

Transparent background, #000000 text at 16px weight 400, 1px solid border at rgb(229,231,235), full pill radius (9999px), 10px vertical / 24px right / 52px left padding (left padding reserves space for an icon). Placeholder at #666666. No visible focus ring — system relies on the cursor.

### Article Card
**Role:** Content cards in the news/stories grid

Transparent background, 6px border-radius, no shadow, no padding — the card is defined entirely by its image and text block. The 6px radius applies to images, creating softly clipped photographic edges. Text sits directly below or overlaid on the image.

### Featured Article Hero Card
**Role:** Large editorial card — one per grid section

Full-width or two-column span, large photographic header (planets, space, etc.), 48px display headline in weight 500 with -0.03em tracking below, metadata at 14px weight 500 in Graphite (#666666). The image does the visual work; type provides editorial gravity.

### Section Header
**Role:** Dividing labels between content zones

Small caps-style labels at 14px weight 500 in Graphite, generous top margin (32-64px), often accompanied by a 'View more' ghost link. Functions as a section anchor without using a colored bar or rule.

### Top Navigation Bar
**Role:** Global site navigation

Fixed or sticky top bar, Paper (#ffffff) background, OpenAI wordmark left, nav items (Research, Products, Business, Developers, Company, Foundation) at 14px weight 500 in #000, search icon, Log in ghost button, Try ChatGPT filled button right. Total height ~64px. No border-bottom — separation is whitespace alone.

### Tag Chip Row
**Role:** Suggested prompts below the search input

Horizontal row of outlined pill buttons (see Outlined Pill Button) at 13-14px, spaced 8px apart. Functions as quick-action shortcuts. Sits centered below the prompt input on the hero.

### Footer
**Role:** Site footer with legal and secondary navigation

Paper background, multi-column layout with link groups at 13-14px weight 500, Graphite text color, generous top padding (64px+). No social icons, no newsletter signup — utilitarian and quiet.

## Do's and Don'ts

### Do
- Use #000000 as the sole filled button color — the 'Try ChatGPT' button is the system's only chromatic punctuation and filling any other button dilutes its signal
- Set all borders to rgba(0,0,0,0.12) rather than a gray hex — the semi-transparent black adapts to the background and maintains consistent visual weight on white and light-gray surfaces
- Apply 9999px radius to all buttons, tags, and inputs — the pill shape is the primary geometric signature and must be consistent across all interactive elements
- Use 6px radius for cards and images — this near-zero radius is a deliberate choice that feels architectural rather than soft; avoid 12px or 16px which would shift the system toward 'friendly SaaS' territory
- Set body text at 17px with 1.65 line-height and -0.01em tracking — the slightly larger base and generous leading create the editorial reading rhythm
- Use weight 500 for navigation, labels, and subheads — weight 400 is reserved for body copy and weight 600 only for the 28px heading tier
- Trust whitespace over dividers — sections are separated by 32-64px gaps and margin-bottom rather than horizontal rules or background color shifts

### Don't
- Do not introduce accent colors, gradients, or brand hues — the system is deliberately monochromatic; any chromatic addition competes with the single black CTA and breaks the editorial mood
- Do not use box-shadows on cards or content surfaces — the design relies on hairline borders and whitespace for structure; shadows would add visual noise the system explicitly avoids
- Do not use 8px or 12px radius on buttons — the pill (9999px) is a signature; non-pill buttons would break visual continuity with the tag chip row and search input
- Do not use weight 700 or 800 anywhere — the heaviest weight in the system is 600, and only at the 28px heading size; heavier weights would feel aggressive against the restrained type
- Do not set body text below 16px — 17px is the base; smaller text (13-14px) is reserved for nav, labels, and metadata where compactness is functional
- Do not use colored backgrounds for section breaks — separate sections with whitespace alone; the system has exactly two surface tones (Paper and Ash) and they appear only for interactive hover states
- Do not add icons inside buttons or text links — the system is text-first; icons appear only in the search input and nav utility area

## Elevation

- **Outlined Pill Button (hover state):** `rgba(0, 0, 0, 0.02) 0px 4px 6px 0px, rgba(0, 0, 0, 0.05) 0px 0px 2px 0px`

## Surfaces

- **Paper** (`#ffffff`) — Base canvas — all content sits directly on this surface
- **Ash** (`#f1f1f1`) — Elevated surface for language selector and subtle hover/selected states
- **Whisper** (`#0000000a`) — Interactive surface tint for ghost button hover and card selection

## Imagery

Photography is high-impact and editorial: large-format cosmic/space imagery (planets, solar surfaces, nebulae) for hero articles, product UI screenshots for business sections, and abstract gradient washes (sunrise oranges, soft purples) for story cards. Images are edge-to-edge within cards with 6px corner radius — no padding insets, no drop shadows. The visual treatment is cinematic and full-bleed rather than lifestyle or product-shot. Illustrations and 3D renders are absent; the system uses photography as its primary visual medium. Icon style is minimal: thin-stroke line icons (search magnifier, arrow-up submit) at monochrome #000, no filled icons, no multi-color iconography.

## Layout

Page model is max-width contained (approximately 1200px) with generous side margins. The hero is a vertically centered prompt interaction on an empty white canvas — the search input is the entire first screen, creating a 'command line' feeling. Below the hero, content flows in a 2-column asymmetric grid: a large featured article (spanning ~65% width) on the left with full-bleed photography, and a stacked column of smaller article cards on the right. Section rhythm is consistent vertical spacing (32-64px gaps) with no background color shifts between sections. Navigation is a minimal top bar — no mega-menu, no sidebar. The overall density is spacious and editorial: one article per visual unit, large type, breathing room between elements. No card grids with 3+ columns; the layout favors 2-column editorial compositions over dashboard-style information density.

## Similar Brands

- **Anthropic** — Same monochromatic editorial approach — black text on white, no accent colors, pill-shaped buttons, and a focus on large-format photography for content cards
- **Vercel** — Identical restraint philosophy — pure black/white palette, hairline borders at low opacity, generous whitespace, and the same anti-decorative flatness
- **Linear** — Similar dark-on-light typographic confidence with custom sans, pill buttons, and 6-8px card radii — though Linear adds subtle gradients Linear omits
- **Stripe** — Shared editorial-composition approach: 2-column asymmetric article grids, large display headlines, photography as visual anchor, and zero chromatic UI accents
- **xAI / Grok** — Monochrome product interface with a single filled black CTA, pill-shaped controls, and the same 'research lab' typographic authority
