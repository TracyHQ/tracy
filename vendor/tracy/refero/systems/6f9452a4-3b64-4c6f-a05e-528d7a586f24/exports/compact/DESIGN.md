# Dovetail — Style Reference
> blueprint control room at midnight.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Dovetail's design language is a dark command center: near-black canvas, subtle grid wireframes, and cool gray type that recedes so charts and data can lead. A single vivid cornflower blue (#6798ff) acts as the system's only chromatic accent — it appears on the announcement bar, feature icons, and active highlights, never as decorative noise. Typography is Inter at every layer with progressively tighter tracking as sizes grow (from -0.012em at 14px to -0.036em at 64px), giving headlines a compressed, engineered quality rather than a marketing gloss. Components are weightless: 8px radii, hairline borders at #1e1e1 or #313131, zero shadows, and flat surfaces that stack through tone rather than elevation. The overall rhythm is compact, technical, and instrument-like — a tool room, not a pitch deck.

## Colors

| Name | Value | Role |
|------|-------|------|
| Blue Cornflower | `#6798ff` | Accent for announcement bar, feature icons, active states, and data highlight strokes |
| Page Ink | `#0a0a0a` | Primary page background — the dark canvas that everything sits on |
| Card Carbon | `#1e1e1e` | Card surfaces, button backgrounds, and key borders that delineate panels |
| Deep Coal | `#141414` | Alternate surface level for nested cards and section backgrounds |
| Onyx | `#000000` | Pure black used in SVG illustration fills and contrast anchors |
| Steel Border | `#313131` | Hairline borders on image frames and subtle dividers |
| Graphite | `#454545` | Mid-tone borders on outline buttons and input frames |
| Fog | `#7c7c7c` | Disabled or de-emphasized button text |
| Ash | `#a7a7a7` | Secondary body text, borders on muted elements, icon strokes |
| Snow | `#ffffff` | Primary text, primary filled button background, icon fills, nav links |

## Typography

### Inter — All UI and editorial text. Weight 400 for body and meta, 500 for nav and button labels, 600 for headings. Display sizes (56–64px) carry heavy negative tracking to feel engineered and compact.
- **Substitute:** Inter is freely available on Google Fonts
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 20, 24, 40, 56, 64
- **Line height:** 1.13–1.57
- **Letter spacing:** -0.17px at 14px, -0.19px at 16px, -0.50px at 24px, -0.84px at 40px, -2.02px at 56px, -2.30px at 64px
- **OpenType features:** `"liga" on`

### JetBrains Mono — Monospaced labels for section eyebrows (e.g. "HOW IT WORKS"), BETA tags, and small data codes. Wide positive tracking (0.071–0.083em) gives these labels a technical, instrument-panel feel.
- **Substitute:** JetBrains Mono via Google Fonts
- **Weights:** 400
- **Sizes:** 12, 14
- **Line height:** 1.00, 1.40
- **Letter spacing:** 1.0px at 14px, 0.85px at 12px
- **OpenType features:** `"liga" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0.85px |
| body-sm | — | — | 14px | 1.5 | -0.17px |
| body | — | — | 16px | 1.5 | -0.19px |
| subheading | — | — | 20px | 1.4 | -0.42px |
| heading-sm | — | — | 24px | 1.33 | -0.5px |
| heading | — | — | 40px | 1.2 | -0.84px |
| heading-lg | — | — | 56px | 1.14 | -2.02px |
| display | — | — | 64px | 1.13 | -2.3px |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64-96px
- **Card padding:** 24-32px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 4px
- **cards:** 8px
- **inputs:** 8px
- **buttons:** 8px

## Components

### White Filled Button (Primary)
**Role:** Primary action — the most prominent CTA on a page

White background (#ffffff), near-black text (#0a0a0a), 8px radius, 16px horizontal / 10px vertical padding. Inter 500 at 14px. Used for "Contact sales" and "Try Dovetail free" in high-priority positions. No border, no shadow.

### Dark Outlined Button (Secondary)
**Role:** Secondary action paired beside a primary

Transparent or #0a0a0a background, 1px border at #454545, white text (#ffffff), 8px radius, 16px / 10px padding. Inter 500 at 14px. The lower-emphasis counterpart to the white filled button.

### Ghost Nav Button
**Role:** Top-bar utility actions like "Log in"

No background, no border, white text at 14px Inter 500. Sits inline with nav items. Padding matches nav height rhythm.

### Stat Card
**Role:** Highlights a single metric in the "How it works" section

#1e1e1 background, 1px border at #1e1e1 (or transparent — separation comes from surface tone), 8px radius, 24px padding. A small #6798ff icon sits above a 40px Inter 600 metric value in white, followed by a 14px label in #a7a7a7. No shadow, no hover lift.

### Section Eyebrow Label
**Role:** Small uppercase label above section headlines (e.g. "HOW IT WORKS")

JetBrains Mono 400 at 12px, white or #a7a7a7 text, letter-spacing 0.85px. No background, sits directly above headline with 16-24px gap.

### Product Preview Card
**Role:** Inset mockup of the Dovetail dashboard inside the hero

#1e1e1 surface with 8px radius, contains a real product UI rendering with charts, tables, and colored data bars. Acts as a flat, borderless visual element — no shadow or frame chrome.

### BETA Tag
**Role:** Marks features in early release (e.g. "AI Docs BETA")

Inline text tag, no background, #a7a7a7 text at 12px Inter 400, with "BETA" uppercase in JetBrains Mono 400 at 12px. Sits beside the feature name with 8px gap.

### Logo Strip Item
**Role:** Customer logo in the trust bar

Greyscale SVG, roughly 80px wide, 8-16px gap between items. Logos sit on transparent background at ~60% opacity to stay subordinate to the page.

### Footer Link Column
**Role:** Site map columns in the footer

Column header in 12px Inter 500 uppercase at #a7a7a7 (letter-spacing ~0.5px). Links below in 14px Inter 400 white, 8-12px vertical gap between links. No bullet markers.

### Social Icon Button
**Role:** LinkedIn, X, Instagram, YouTube in footer

24px square, white stroke or fill, no background, no border, no hover chrome — flat icon-on-dark.

### Announcement Bar
**Role:** Top-of-page promo strip

Full-width #6798ff blue background, white text at 14px Inter 500, centered content with a small dismiss icon on the right. 8px vertical padding.

### Rating Badge
**Role:** G2 and Capterra star ratings below the logo strip

5 white stars at 12-14px, followed by "4.5/5 · 62" or similar in 12px Inter 400 #a7a7a7. Inline horizontal layout with 16px gap.

## Do's and Don'ts

### Do
- Use 8px radius for all buttons, cards, and inputs — the only deviation is 4px for small tags and inline chips.
- Set page background to #0a0a0a and reserve #1e1e1 exclusively for card and button surfaces so the surface hierarchy reads through tone alone.
- Use #6798ff only for functional accents: announcement bars, feature icons, active nav states, and data highlight strokes — never as a background fill for content blocks.
- Set display headlines at 56-64px Inter 600 with tracking between -2.0 and -2.3px so they feel engineered, not editorial.
- Reserve JetBrains Mono for eyebrows, BETA tags, and small data labels with positive 0.85-1.0px tracking — never use it for body or headings.
- Keep section gaps between 64-96px and element gaps between 8-16px to maintain the compact, technical density.
- Default to white filled buttons for primary actions and dark outlined (1px #454545) for secondary — never use the blue accent on a button background.

### Don't
- Do not introduce a second chromatic color — the system is monochrome with a single blue accent.
- Do not use shadows or elevation to separate surfaces — rely on tone shifts between #0a0a0a, #141414, and #1e1e1e.
- Do not use gradients on any surface, button, or background.
- Do not use #6798ff as a filled button background — it belongs only on icons, the announcement bar, and small accent strokes.
- Do not use 66px or pill radii on cards or buttons — the 8px corner is the system signature.
- Do not set body text below 14px or use weights lighter than 400 — the type stack is deliberately compact, not delicate.
- Do not use pure #000000 as a page background — it is reserved for SVG illustration fills; pages live on #0a0a0a or #141414.

## Elevation

The system deliberately avoids box-shadows entirely. Surface separation is achieved through flat tone shifts (#0a0a0a → #141414 → #1e1e1 → #313131) and 1px hairline borders at #1e1e1 or #454545. Components feel like instrument panels — flush, parallel, and dimensional only through color value, not depth.

## Surfaces

- **Canvas** (`#0a0a0a`) — Page background
- **Section** (`#141414`) — Alternate band or inset section background
- **Card** (`#1e1e1`) — Card, button fill, and bordered component surface
- **Raised Edge** (`#313131`) — Image frames and fine separators

## Imagery

Imagery is minimal and functional: greyscale customer logos in a single trust strip, one or two product-screenshot cards showing real dashboard UI (charts, tables, data bars), and sparse flat illustrations in the footer (a pixel smiley face on a #6798ff tile). No lifestyle photography, no hero video, no decorative 3D. The grid wireframe pattern overlaid on the dark background is the only repeated visual motif — it signals "blueprint" and gives the dark surface structure. Icons are small, single-color (white or #6798ff), 16-20px, stroke-based with a 1.5-2px weight, and sit inline with text rather than floating as decoration.

## Layout

Pages are max-width 1200px centered with generous side padding. The hero uses an asymmetric 50/50 split: left column carries headline, subtext, and dual CTAs; right column holds a product preview card. Section rhythm is uniform — dark background continues throughout with no alternating bands, separated only by vertical spacing. Stat highlights and feature grids use 3-column or 4-column card rows at equal widths. Navigation is a single top bar with logo, product/use-cases/resources/enterprise/customers/pricing links center-left, and Log in + Contact sales right-aligned. No sidebar, no mega-menu. Footer is a 4-column link grid plus a single illustration card on the right. The overall density is compact and consistent — every section breathes the same amount.

## Similar Brands

- **Linear** — Same dark canvas, single vivid blue accent, Inter typeface, 8px radii, and zero-shadow flat surfaces with tone-based hierarchy.
- **Vercel** — Dark-first instrument-panel aesthetic with tight Inter tracking on display sizes, monochrome palette, and minimal blue functional accents.
- **Cursor** — Compact dark UI with a single cool accent color, compact density, and a product-preview-led hero layout.
- **Retool** — Developer-tool dark theme with neutral primary buttons, hairline borders, and product UI inlined directly into marketing sections.
