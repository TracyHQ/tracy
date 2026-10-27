# Oevra — Style Reference
> sage greenhouse at dawn

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Oevra speaks in a single quiet voice: sage green on white, whispered through enormous light-weight headlines. The chromatic palette is ruthlessly restrained — one muted olive (#778643) does all the talking across text, borders, and the occasional button, while every surface stays a white canvas washed with a soft sage radial gradient. Typography is the show: Suisse Int'l at 300-weight blows up to 90px display sizes that read like a meditation, paired with a 14–15px body in Space Grotesk. Components feel like artifacts in a greenhouse — rounded 15px corners, hairline 1px borders, no shadows, no fills, no decoration. The result is less an interface and more a slow walk through a plant nursery at dawn.

## Colors

| Name | Value | Role |
|------|-------|------|
| Eucalyptus | `radial-gradient(ellipse at 50% 50%, rgba(119,134,67,0.35) 0%, rgba(119,134,67,0.08) 50%, #ffffff 100%)` | Headline accents, body text emphasis, hairline borders, single filled CTA — the only chromatic voice in the entire system. Muted enough to never shout, present enough to carry the brand; Full-bleed background gradient behind hero and section text. The green is a breath, not a wall — it fades to white at the edges so text remains the focus |
| Ink Black | `#000000` | Primary text, dividers, image borders, icon strokes. Used at 1px hairline weight almost exclusively — never as a fill |
| Pure Canvas | `#ffffff` | Page background, card surfaces, button text on filled green CTAs. The dominant surface color across the entire site |
| Graphite | `#4e4e4e` | Secondary body text, muted link borders, helper copy, footer text. Quieter than black but still AA-readable on white |
| Mist | `#c8c8c8` | Subtle surface wash for elevated panels, image placeholder backgrounds, very faint dividers. Used sparingly to add depth without darkening the page |

## Typography

### space-regular — space-regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 8px, 12px, 14px, 15px
- **Line height:** 1.2, 1.25, 1.3, 1.5

### Suisse Int'l — Display and headline face. Light weight at 45–90px is the signature — headlines whisper instead of shout, creating a contemplative, editorial tone. Used for all section headlines, hero copy, and feature titles.
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 300 (light), 400 (regular)
- **Sizes:** 34px, 45px, 75px, 90px
- **Line height:** 1.0–1.1

### Suisse Int'l — Secondary body and footer text. Regular weight adds density to descriptions and supporting paragraphs beneath light-weight headlines.
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 400 (regular)
- **Sizes:** 12px, 14px, 15px
- **Line height:** 1.2–1.3

### Space Grotesk — Primary body, UI labels, buttons, and navigation text. The geometric counter-forms pair with Suisse to give dense text a different texture from the display headlines.
- **Substitute:** DM Sans, Inter, General Sans
- **Weights:** 400 (regular)
- **Sizes:** 8px, 12px, 14px, 15px
- **Line height:** 1.2–1.5

### System Sans — Micro-utility text, scroll indicators, and fine-print captions where a 1–2 word label sits in the margins.
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 400
- **Sizes:** 8px
- **Line height:** 1.5

### ui-sans-serif — ui-sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 8px
- **Line height:** 1.5

### suisse-light — suisse-light — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 34px, 45px, 75px, 90px
- **Line height:** 1, 1.1

### suisse-regular — suisse-regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px, 14px, 15px
- **Line height:** 1.2, 1.25, 1.3

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 15px | 1.3 | — |
| subheading | — | — | 34px | 1.1 | — |
| heading-sm | — | — | 45px | 1.1 | — |
| heading | — | — | 75px | 1 | — |
| display | — | — | 90px | 1 | — |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 75px
- **Card padding:** 30px
- **Element gap:** 23px

### Border Radius

- **cards:** 15px
- **images:** 15px
- **buttons:** 22.5px

## Components

### Navigation Bar
**Role:** Top-level site navigation

Transparent, floats over the sage gradient. Logo (glasses icon + 'oevra' wordmark) at left in white at 12–14px. Nav links (ABOUT, LOGIN) in white, 8–12px Space Grotesk, uppercase. SIGN UP button is a white outlined pill at 22.5px radius with 11px padding. No background fill on the bar itself — the gradient shows through.

### Display Headline Block
**Role:** Hero and section headlines

Text in Suisse Light at 75–90px, line-height 1.0, color #ffffff (on green gradient) or #778643 (on white). Headlines span 3–4 lines, often with a short underline rule breaking the flow. This is the dominant visual element on every section.

### Inset Headline Image
**Role:** Photo embedded mid-headline

A small square photograph (approximately 60–80px) tucked into a headline, replacing a word or sitting inline with text. The image has 15px border-radius and breaks the typographic flow as a deliberate visual surprise.

### Ghost Pill Button
**Role:** Primary call-to-action

GET STARTED / GET THE APP. Outlined pill: 22.5px border-radius, 1px stroke, 11–15px vertical padding, 23–30px horizontal padding. Stroke and text in current text color (white on green sections, black on white sections). Arrow glyph (→→) follows the label. No fill, no shadow.

### Filled Green Button
**Role:** Sole chromatic CTA (SIGN UP in nav context)

The only filled button in the system. Background #778643, text #ffffff, 22.5px border-radius, 1px transparent border, 11px vertical / 23px horizontal padding. Used sparingly — most actions stay ghost/outlined to preserve the airy feel.

### Section Label
**Role:** Small uppercase eyebrow above headlines

AVAILABLE NOW / APP FEATURES. 8–12px Space Grotesk, uppercase, letter-spacing slightly wide, color matches the current text tone (white on green, #778643 on white). Sits to the left of or above the main headline, aligned to its first line.

### Numbered Feature Item
**Role:** Step indicators in feature lists

Three-column row at the section base. Each item: 2-digit number (01, 02, 03) in 8px Space Grotesk above a short uppercase label (THE CREATIVE PROCESS, THE FLOW STATE, GET UNBLOCKED) in Suisse Regular at 12–14px. Column gap 60px.

### Image Card
**Role:** Product screenshot or photograph container

Photograph or product shot placed in the lower-right of sections. 15px border-radius, often with a 1px black hairline border. No shadow, no padding — the image touches the radius edge. Sits at a slight angle or offset from the text grid to feel placed, not gridded.

### Body Description Block
**Role:** Supporting paragraph text

15px Suisse Regular or Space Grotesk, line-height 1.3–1.5, color #4e4e4e. Max width around 45ch. Sits below the display headline, left-aligned, generous margin-top (23–30px). Accompanied by a ghost CTA below it.

### Vertical Scroll Indicator
**Role:** Page-position cue on left margin

Word 'SCROLL' rotated 90° counter-clockwise, 8–12px, 1px line above it. Fixed to the left edge of the viewport, color matches the current section text tone.

### Footer Link Column
**Role:** Footer navigation list

Stack of links in 14–15px Suisse Regular, color #4e4e4, 15px vertical spacing between items. 1px hairline border separates columns. No headings — the list speaks for itself.

### Hairline Divider
**Role:** Visual separation

1px horizontal line in #000000 or #4e4e4, used inline within headlines to break text flow (e.g. a short rule sits between two headline lines). 30–45px width. Decorative typographic pause, not a structural divider.

## Do's and Don'ts

### Do
- Use Suisse Int'l at 300/400 weight for all headlines, scaled 45–90px with line-height 1.0–1.1
- Apply the Sage Mist radial gradient as the default page background wash — it should breathe, not saturate
- Reach for #778643 on text, borders, and the single filled CTA — never on large filled surfaces
- Use 15px border-radius on cards and images, 22.5px on all interactive elements (buttons, links, pills)
- Set section gaps at 75px and card padding at 30px — the spaciousness IS the brand
- Keep body text at 15px with 1.3 line-height in #4e4e4 for graphite-toned supporting copy
- Pair every display headline with a short uppercase section label (8–12px) as its anchor

### Don't
- Do not introduce a second chromatic color — the entire palette is one green and four neutrals
- Do not use bold or semibold weights for headlines; light weight at large size is the signature
- Do not apply box-shadows, glows, or blur effects for elevation — separation comes from whitespace and hairlines
- Do not use sharp corners (0–4px radius) on any surface or interactive element
- Do not use #778643 as a solid page or section background — it must always be diluted by the gradient or rendered as a thin line
- Do not crowd the layout with small text; if a paragraph exceeds 3 lines, the type is too small for the system
- Do not use icon fills or saturated illustrations — the visual language is photography, type, and gradient only

## Elevation

Elevation does not exist in this system. Surfaces are separated by whitespace, 1px hairlines, and the sage gradient wash — never by shadow. Adding a shadow would shatter the flat, greenhouse-like calm that defines the brand.

## Surfaces

- **Canvas** (`#ffffff`) — Page background, full-bleed white
- **Sage Mist** (`#778643`) — Soft radial gradient overlay on canvas — atmospheric, not structural
- **Mist Panel** (`#c8c8c8`) — Subtle elevated surface for image placeholders and light separators

## Imagery

Imagery is restrained and photographic, never illustrated or 3D. Product screenshots (phone in hand, app UI crops) appear in 15px-radius image cards with hairline borders, positioned in the lower-right of sections as visual counterweights to text. One signature move: a small square photo is inset directly into a display headline, breaking the typographic line as a deliberate moment of surprise. Backgrounds are never photographic — they are always the sage radial gradient. No icons, no illustrations, no decorative graphics.

## Layout

Full-bleed page with a soft sage radial gradient that fills the entire viewport. Content sits in a max-width 1200px container, but sections rarely feel boxed — headlines span 70–80% of the viewport width and breathe against the gradient. Hero opens with a centered/left-aligned display headline (90px) and supporting copy, with a ghost CTA anchored to the bottom-right corner. A vertical 'SCROLL' indicator lives on the far left margin. Subsequent sections alternate between green-wash backgrounds and white, each anchored by a 45–90px Suisse Light headline, a small uppercase section label to its left, and body copy with a ghost CTA below. Numbered feature items (01, 02, 03) sit at section bases in a 3-column row. Image cards break the grid by floating into the lower-right, slightly offset from the text column. Navigation is transparent and floats over the hero gradient. The overall rhythm is slow, vertical, and editorial — a single column of generous sections rather than a dense multi-column dashboard.

## Similar Brands

- **Headspace** — Same soft, organic atmosphere with a single muted accent color against generous white space and rounded components
- **Calm** — Editorial-grade display headlines at 60–80px+, whisper-light weights, and a nature-evoking palette that relies on whitespace instead of decoration
- **Notion AI** — Monochrome interface with one chromatic accent used in text and thin borders rather than large fills; large confident display type
- **Linear** — Spacious single-column layouts with 15px-radius surfaces, hairline borders, and zero shadow elevation
- **Are.na** — Restrained two-tone palette (neutral + one accent), oversized editorial headlines, and a contemplative, slow-scrolling rhythm
