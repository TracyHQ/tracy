# HEY — Style Reference
> sunlit letters on a desk. White rounded panels, paper-like backgrounds, and handwritten marks sit above soft violet-and-salmon color washes.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

HEY treats the page as a stack of tactile paper objects floating over a warm off-white field. Giant, almost cartoon-heavy Really Sans headlines use violet-to-salmon color as an occasional burst, while dense Moniker text keeps navigation, messages, and interface copy compact and human. The recurring 25.6px rounded white panel, soft ink-tinted shadow, handwritten Shantell interruption, and pastel gradient product imagery make email feel personal rather than corporate.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ink | `#231c33` | `--color-ink` | Headlines, navigation, body copy, input text, play-control text, and dark button labels |
| Paper | `#f9f7f5` | `--color-paper` | Warm page canvas and large paper-like content sections |
| White Sheet | `#ffffff` | `--color-white-sheet` | Floating navigation, hero panels, cards, video controls, and reversed text |
| Quiet Gray | `#736c83` | `--color-quiet-gray` | Fine-print helper copy and low-emphasis supporting text |
| Blurple | `linear-gradient(135deg, #5522fa 0%, #ec8580 100%)` | `--color-blurple` | Links, emphasized headings, illustrated interface details, and the violet edge of expressive promotional gradients |
| Mint Note | `#b3f4e0` | `--color-mint-note` | Filled primary action backgrounds — mint against Ink labels keeps repeated conversion controls playful rather than forceful |
| Salmon Glow | `linear-gradient(135deg, #f95c5c 0%, #ec8580 100%)` | `--color-salmon-glow` | Warm gradient endpoint for promotional surfaces and colorful product demonstrations |
| Sky Wash | `linear-gradient(135deg, #b6dbff 0%, #eef8ff 100%)` | `--color-sky-wash` | Testimonial-card and soft interface background washes |
| Canary Note | `#fff5ca` | `--color-canary-note` | Occasional warm highlighted surface behind short content moments |
| Stone | `#edeae6` | `--color-stone` | Subdued neutral fills and secondary quiet surfaces |

## Tokens — Typography

### Really Sans Large — Display and section headlines. The 850–900 weight is intentionally oversized and soft-edged; authority comes from chunky letterforms rather than tight, technical type. · `--font-really-sans-large`
- **Substitute:** Nunito Sans Black
- **Weights:** 850, 900
- **Sizes:** 40px, 48px, 83px
- **Line height:** 1.10, 1.20
- **Letter spacing:** normal
- **OpenType features:** `"case", "liga", "ss04"`
- **Role:** Display and section headlines. The 850–900 weight is intentionally oversized and soft-edged; authority comes from chunky letterforms rather than tight, technical type.

### Moniker — Navigation, buttons, long-form letter copy, labels, links, testimonials, and UI controls. Its slightly condensed negative tracking lets conversational copy remain compact beside oversized display type. · `--font-moniker`
- **Substitute:** DM Sans
- **Weights:** 400, 500, 700
- **Sizes:** 14px, 16px, 18px, 20px, 21px, 24px, 27px, 32px
- **Line height:** 1.00, 1.20, 1.40, 1.45, 1.60, 1.80
- **Letter spacing:** -0.40px at 21px, -0.32px at 27px, -0.38px at 32px; generally -0.012em to -0.019em
- **OpenType features:** `"case", "liga"; "c2sc", "smcp"`
- **Role:** Navigation, buttons, long-form letter copy, labels, links, testimonials, and UI controls. Its slightly condensed negative tracking lets conversational copy remain compact beside oversized display type.

### Shantell Sans — Handwritten interjections, especially a single symbolic character inside a display headline. Use sparingly as an imperfect human interruption within the otherwise heavy sans system. · `--font-shantell-sans`
- **Substitute:** Caveat
- **Weights:** 400, 900
- **Sizes:** 27px, 83px
- **Line height:** 1.00
- **Letter spacing:** -0.32px at 27px; -1.00px at 83px
- **OpenType features:** `"case", "liga", "ss04"`
- **Role:** Handwritten interjections, especially a single symbolic character inside a display headline. Use sparingly as an imperfect human interruption within the otherwise heavy sans system.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| fine-print | Moniker | 400 | 18px | 1.2 | -0.216px | `--text-fine-print` |
| body | Moniker | 400 | 21px | 1.6 | -0.399px | `--text-body` |
| letter-body | Moniker | 400 | 24px | 1.45 | -0.288px | `--text-letter-body` |
| handwritten-note | Shantell Sans | 400 | 27px | 1 | -0.324px | `--text-handwritten-note` |
| link-large | Moniker | 400 | 32px | 1.4 | -0.384px | `--text-link-large` |
| heading-support | Really Sans Large | 850 | 40px | 1.2 | 0px | `--text-heading-support` |
| heading-accent | Really Sans Large | 900 | 40px | 1.1 | 0px | `--text-heading-accent` |
| section-heading | Really Sans Large | 850 | 48px | 1.1 | 0px | `--text-section-heading` |
| display | Really Sans Large | 900 | 83px | 1.1 | 0px | `--text-display` |
| display-handwritten | Shantell Sans | 900 | 83px | 1 | 0px | `--text-display-handwritten` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 44 | 44px | `--spacing-44` |
| 64 | 64px | `--spacing-64` |
| 76 | 76px | `--spacing-76` |
| 92 | 92px | `--spacing-92` |
| 96 | 96px | `--spacing-96` |
| 124 | 124px | `--spacing-124` |
| 128 | 128px | `--spacing-128` |
| 156 | 156px | `--spacing-156` |
| 160 | 160px | `--spacing-160` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 25.6px |
| pills | 74.8px |
| images | 9999px |
| inputs | 0px |
| buttons | 43.68px |
| navigation | 38.4px |
| letter-card | 2.4px |

### Layout

- **Section gap:** 45px
- **Card padding:** 19px
- **Element gap:** 19px

## Components

### Floating Capsule Navigation
**Role:** Public top navigation

Use a White Sheet horizontal capsule with a 38.4px radius, Ink Moniker links at 20.8px/500, and the ink-tinted navigation shadow. Keep internal item gaps in the 10–11px range; place the compact sign-in control and prominent conversion control at the right edge.

### Mint Primary Action
**Role:** Repeated filled conversion button

Fill with Mint Note #b3f4e0, set Blurple #5522fa text and border, use a 43.68px radius, and apply 12.48px 18.72px 10.4px padding. Use Moniker 500 text; do not convert this treatment to a violet fill.

### White Play Control
**Role:** Video-overlay control

Use a White Sheet #ffffff pill with Ink #231c33 text, 20.88px radius, and 4.32px top/bottom with 15.84px right and 4.32px left padding for the icon-leading compact version. Give it the play shadow: 0 3.2px 6.4px -3.2px rgba(35,28,51,0.2), 0 6.4px 12.8px -6.4px rgba(35,28,51,0.4), 0 9.6px 19.2px -9.6px rgba(35,28,51,0.6).

### Gradient Promotional Pill
**Role:** High-visibility public conversion control

Use the 135deg Blurple-to-Salmon Glow gradient with white Moniker 500 text. Set a 57.2px radius with 16.64px vertical and 21.32px horizontal padding; the larger floating version uses a 74.8px radius with 23.8px 29.92px padding.

### New Navigation Marker
**Role:** Small announcement label

Use a coral-to-salmon 135deg gradient chip with White Sheet text in Moniker 16px/500, tight 1–4px padding, and a fully pill-shaped silhouette.

### Hero Paper Panel
**Role:** Opening content container

Place the display stack on White Sheet #ffffff inside a 25.6px rounded panel with the deep card shadow. Set the display headline in Really Sans Large 83.2px/900/91.52px in Ink, allowing Blurple-to-Salmon treatment on selected words and Shantell Sans 83.2px/900 for the handwritten plus sign.

### Product Video Frame
**Role:** Product demonstration media

Use a 25.6px top-rounded White Sheet media frame with no internal padding and the card shadow. Cover the product capture with a 135deg Blurple #5522fa to Salmon Glow #ec8580 translucent wash, then center the White Play Control.

### Sky Testimonial Card
**Role:** Social-proof message tile

Use a soft 135deg Sky Wash background, 25.6px rounded corners, Ink body text, and a small circular 9999px author avatar that overlaps the top edge. Set quote copy in Moniker with 21px/400/1.60 for reading text; reserve 10px gaps for compact metadata.

### Paper Letter Card
**Role:** Long-form editorial message

Use a White Sheet page with a nearly square 2.4px radius, 90px vertical and 96px horizontal padding, and the layered card shadow. Set letter copy in Ink Moniker 24px/400/1.45 with generous paragraph separation rather than decorative rules.

### Understated Text Input
**Role:** Inline form field

Use transparent fill, Ink #231c33 text and border, a 0px radius, and 21.6px left padding. Keep the field visually linear; do not place it in a rounded gray box.

### Fine Print
**Role:** Supporting conversion note

Set in Quiet Gray #736c83 Moniker 17.6px/400/21.12px with -0.22px tracking. Position immediately beneath a public conversion control with a small vertical gap.

## Do's and Don'ts

### Do
- Use Paper #f9f7f5 as the page canvas and White Sheet #ffffff for floating panels.
- Set major display headlines in Really Sans Large at 83px/900/1.10 and section headlines at 48px/850/1.10.
- Use Moniker with negative tracking between -0.012em and -0.019em for navigation, body copy, buttons, and links.
- Use Mint Note #b3f4e0 with Blurple #5522fa text for repeated filled conversion controls at a 43.68px radius.
- Use the 135deg #5522fa-to-#ec8580 gradient only for high-visibility promotional pills, expressive display type, and product-media washes.
- Give main white cards a 25.6px radius and the layered Ink shadow rather than a thin neutral border.
- Use 10–12px gaps for tight navigation and control groups, 19px for local component spacing, and 45px between major content blocks.

### Don't
- Do not use pure black for interface text; use Ink #231c33.
- Do not replace the warm Paper #f9f7f5 canvas with cool gray or bright white.
- Do not use sharp corners for navigation, hero media, testimonial cards, or public buttons; use their 38.4px, 25.6px, and 43.68px radii.
- Do not use Blurple #5522fa as a universal filled button color; the repeated filled action treatment is Mint Note #b3f4e0.
- Do not apply Shantell Sans to paragraphs, navigation, or button labels; restrict it to short handwritten interruptions.
- Do not flatten major panels with 1px gray outlines; use the multi-layer Ink shadow on White Sheet surfaces.
- Do not make long-form editorial cards rounded like product panels; use the 2.4px letter-card radius and 90px by 96px padding.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Paper Canvas | `#f9f7f5` | Warm full-page background and editorial section field. |
| 1 | White Sheet | `#ffffff` | Navigation, hero panels, cards, letter pages, and media controls. |
| 2 | Canary Highlight | `#fff5ca` | Occasional highlighted content surface. |
| 3 | Mint Action Surface | `#b3f4e0` | Filled public conversion controls. |

## Elevation

- **Floating Capsule Navigation:** `0 0 0 1px rgba(35,28,51,0.02), 0 3.2px 19.2px -6.4px rgba(35,28,51,0.2), 0 6.4px 32px -12.8px rgba(35,28,51,0.3), 0 6.4px 6.4px -12.8px rgba(35,28,51,0.4), 0 12.8px 12.8px -19.2px rgba(35,28,51,0.5), 0 19.2px 19.2px -25.6px rgba(35,28,51,0.6)`
- **Hero Paper Panel:** `0 0 0 1px rgba(35,28,51,0.02), 0 6.4px 51.2px -25.6px rgba(35,28,51,0.2), 0 12.8px 76.8px -32px rgba(35,28,51,0.3), 0 12.8px 25.6px -38.4px rgba(35,28,51,0.4), 0 25.6px 38.4px -51.2px rgba(35,28,51,0.5), 0 38.4px 51.2px -64px rgba(35,28,51,0.6)`
- **Product Video Frame:** `0 3.2px 38.4px -6.4px rgba(35,28,51,0.2), 0 6.4px 51.2px -12.8px rgba(35,28,51,0.3), 0 6.4px 25.6px -12.8px rgba(35,28,51,0.4), 0 12.8px 32px -19.2px rgba(35,28,51,0.5), 0 19.2px 38.4px -25.6px rgba(35,28,51,0.6)`

## Imagery

The visual language is product- and artifact-led rather than photographic. Wide contained product screenshots are softened beneath violet-to-salmon overlays and topped with a centered white play pill; testimonial content appears as overlapping pastel message cards with small circular portraits. Long editorial content becomes a stark white letter sheet with a faint offset page behind it. Icons are mostly compact mono Ink marks, while the HEY hand symbol and occasional Shantell handwriting provide the only deliberately hand-drawn note. Visuals occupy large horizontal bands, but every image remains subordinate to oversized text and paper surfaces.

## Layout

The page uses a warm Paper canvas with a floating capsule navigation bar near the top and large White Sheet panels suspended beneath it. The opening sequence is centered: review snippets, an oversized display headline, a two-line bold supporting statement, a conversion control, and a wide rounded product-video frame. Subsequent sections alternate centered editorial headings with clustered Sky Wash testimonial cards, then transition into a tall, narrow paper-letter composition with generous internal margins. The rhythm is spacious between major blocks but dense inside navigation and message cards; a persistent gradient promotional pill can sit over the lower-right edge of content.

## Agent Prompt Guide

Quick Color Reference:
- Ink: #231c33 — Headlines, navigation, body copy, input text, play-control text, and dark button labels
- Paper: #f9f7f5 — Warm page canvas and large paper-like content sections
- White Sheet: #ffffff — Floating navigation, hero panels, cards, video controls, and reversed text
- Quiet Gray: #736c83 — Fine-print helper copy and low-emphasis supporting text
- Blurple: linear-gradient(135deg, #5522fa 0%, #ec8580 100%) — Links, emphasized headings, illustrated interface details, and the violet edge of expressive promotional gradients
- Mint Note: #b3f4e0 — Filled primary action backgrounds — mint against Ink labels keeps repeated conversion controls playful rather than forceful
- Salmon Glow: linear-gradient(135deg, #f95c5c 0%, #ec8580 100%) — Warm gradient endpoint for promotional surfaces and colorful product demonstrations
- Sky Wash: linear-gradient(135deg, #b6dbff 0%, #eef8ff 100%) — Testimonial-card and soft interface background washes
- Canary Note: #fff5ca — Occasional warm highlighted surface behind short content moments
- Stone: #edeae6 — Subdued neutral fills and secondary quiet surfaces

Create a centered hero on Paper #f9f7f5 inside a White Sheet #ffffff panel with a 25.6px radius and layered Ink shadow; set the headline in Really Sans Large 83.2px, weight 900, 91.52px line-height, using Ink #231c33 with a single Shantell Sans 83.2px handwritten symbol.
Create a Mint Primary Action using Mint Note #b3f4e0, Blurple #5522fa Moniker 27.2px weight 500 text, 43.68px radius, and 12.48px 18.72px 10.4px padding; place Quiet Gray #736c83 Moniker 17.6px helper text beneath it.
Create a product video frame on White Sheet #ffffff with 25.6px top corners, a 135deg Blurple #5522fa to Salmon Glow #ec8580 media wash, and a centered white play pill with Ink Moniker 20.8px weight 500 text.
Create a Sky Testimonial Card with the Sky Wash gradient, 25.6px corners, an overlapping circular avatar, and Ink #231c33 Moniker 21px/400/1.60 quote text.
Create a Paper Letter Card with White Sheet #ffffff, 2.4px radius, 90px vertical and 96px horizontal padding, layered Ink shadow, and Ink Moniker 24px/400/1.45 body copy.

## Similar Brands

- **Basecamp** — Shares 37signals-style conversational editorial copy, warm paper surfaces, and blunt Ink typography.
- **Mailchimp** — Uses oversized friendly display type and occasional handwritten or playful visual interruptions around product messaging.
- **Dropbox** — Pairs large expressive headlines with colorful gradient product imagery and rounded content containers.
- **Superhuman** — Also frames email as a premium product experience through concentrated product demonstrations and prominent conversion controls.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-ink: #231c33;
  --color-paper: #f9f7f5;
  --color-white-sheet: #ffffff;
  --color-quiet-gray: #736c83;
  --color-blurple: #5522fa;
  --gradient-blurple: linear-gradient(135deg, #5522fa 0%, #ec8580 100%);
  --color-mint-note: #b3f4e0;
  --color-salmon-glow: #ec8580;
  --gradient-salmon-glow: linear-gradient(135deg, #f95c5c 0%, #ec8580 100%);
  --color-sky-wash: #b6dbff;
  --gradient-sky-wash: linear-gradient(135deg, #b6dbff 0%, #eef8ff 100%);
  --color-canary-note: #fff5ca;
  --color-stone: #edeae6;

  /* Typography — Font Families */
  --font-really-sans-large: 'Really Sans Large', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-moniker: 'Moniker', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-shantell-sans: 'Shantell Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-fine-print: 18px;
  --leading-fine-print: 1.2;
  --tracking-fine-print: -0.216px;
  --text-body: 21px;
  --leading-body: 1.6;
  --tracking-body: -0.399px;
  --text-letter-body: 24px;
  --leading-letter-body: 1.45;
  --tracking-letter-body: -0.288px;
  --text-handwritten-note: 27px;
  --leading-handwritten-note: 1;
  --tracking-handwritten-note: -0.324px;
  --text-link-large: 32px;
  --leading-link-large: 1.4;
  --tracking-link-large: -0.384px;
  --text-heading-support: 40px;
  --leading-heading-support: 1.2;
  --tracking-heading-support: 0px;
  --text-heading-accent: 40px;
  --leading-heading-accent: 1.1;
  --tracking-heading-accent: 0px;
  --text-section-heading: 48px;
  --leading-section-heading: 1.1;
  --tracking-section-heading: 0px;
  --text-display: 83px;
  --leading-display: 1.1;
  --tracking-display: 0px;
  --text-display-handwritten: 83px;
  --leading-display-handwritten: 1;
  --tracking-display-handwritten: 0px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;
  --font-weight-w850: 850;
  --font-weight-black: 900;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-64: 64px;
  --spacing-76: 76px;
  --spacing-92: 92px;
  --spacing-96: 96px;
  --spacing-124: 124px;
  --spacing-128: 128px;
  --spacing-156: 156px;
  --spacing-160: 160px;

  /* Layout */
  --section-gap: 45px;
  --card-padding: 19px;
  --element-gap: 19px;

  /* Border Radius */
  --radius-sm: 2.4px;
  --radius-md: 4.8px;
  --radius-2xl: 20.88px;
  --radius-3xl: 25.6px;
  --radius-3xl-2: 38.4px;
  --radius-3xl-3: 43.68px;
  --radius-full: 54.4px;
  --radius-full-2: 57.2px;
  --radius-full-3: 74.8px;
  --radius-full-4: 9999px;

  /* Named Radii */
  --radius-cards: 25.6px;
  --radius-pills: 74.8px;
  --radius-images: 9999px;
  --radius-inputs: 0px;
  --radius-buttons: 43.68px;
  --radius-navigation: 38.4px;
  --radius-letter-card: 2.4px;

  /* Surfaces */
  --surface-paper-canvas: #f9f7f5;
  --surface-white-sheet: #ffffff;
  --surface-canary-highlight: #fff5ca;
  --surface-mint-action-surface: #b3f4e0;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-ink: #231c33;
  --color-paper: #f9f7f5;
  --color-white-sheet: #ffffff;
  --color-quiet-gray: #736c83;
  --color-blurple: #5522fa;
  --color-mint-note: #b3f4e0;
  --color-salmon-glow: #ec8580;
  --color-sky-wash: #b6dbff;
  --color-canary-note: #fff5ca;
  --color-stone: #edeae6;

  /* Typography */
  --font-really-sans-large: 'Really Sans Large', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-moniker: 'Moniker', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-shantell-sans: 'Shantell Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-fine-print: 18px;
  --leading-fine-print: 1.2;
  --tracking-fine-print: -0.216px;
  --text-body: 21px;
  --leading-body: 1.6;
  --tracking-body: -0.399px;
  --text-letter-body: 24px;
  --leading-letter-body: 1.45;
  --tracking-letter-body: -0.288px;
  --text-handwritten-note: 27px;
  --leading-handwritten-note: 1;
  --tracking-handwritten-note: -0.324px;
  --text-link-large: 32px;
  --leading-link-large: 1.4;
  --tracking-link-large: -0.384px;
  --text-heading-support: 40px;
  --leading-heading-support: 1.2;
  --tracking-heading-support: 0px;
  --text-heading-accent: 40px;
  --leading-heading-accent: 1.1;
  --tracking-heading-accent: 0px;
  --text-section-heading: 48px;
  --leading-section-heading: 1.1;
  --tracking-section-heading: 0px;
  --text-display: 83px;
  --leading-display: 1.1;
  --tracking-display: 0px;
  --text-display-handwritten: 83px;
  --leading-display-handwritten: 1;
  --tracking-display-handwritten: 0px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-64: 64px;
  --spacing-76: 76px;
  --spacing-92: 92px;
  --spacing-96: 96px;
  --spacing-124: 124px;
  --spacing-128: 128px;
  --spacing-156: 156px;
  --spacing-160: 160px;

  /* Border Radius */
  --radius-sm: 2.4px;
  --radius-md: 4.8px;
  --radius-2xl: 20.88px;
  --radius-3xl: 25.6px;
  --radius-3xl-2: 38.4px;
  --radius-3xl-3: 43.68px;
  --radius-full: 54.4px;
  --radius-full-2: 57.2px;
  --radius-full-3: 74.8px;
  --radius-full-4: 9999px;
}
```
