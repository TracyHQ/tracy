# Coda — Style Reference
> Monumental letters on warm cream parchment — Coda reads like a hand-set marketplace poster, not a SaaS dashboard.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Coda's visual language is a confident, almost architectural marketplace identity built on a warm cream canvas (#f8f9eb) rather than stark white. The defining signature is monumental display type — a custom geometric grotesque (Monument Grotesk) set extremely tight (line-height 0.90) at sizes up to 134px, making headlines feel like carved signage rather than web copy. Every surface is bordered, not shadowed: hairline charcoal outlines on cream create a blueprint-like precision that pairs with pill-shaped tags, small rounded buttons (~13px radius), and one deep forest-green section that breaks the monochrome rhythm with organic blob shapes. Color is used as deliberate, sparse punctuation — a mint card here, a lilac or rose card there — while the structural palette stays earthy and achromatic. The effect is half editorial brutalism, half boutique storefront: warm, tactile, and emphatically physical rather than digital-glass.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Parchment | `#f8f9eb` | Page canvas, primary background, nav and body surface |
| Pure White | `#ffffff` | Elevated card surfaces, icon fills inside outlined containers, text on dark buttons |
| Obsidian | `#000000` | Hairline borders, primary text, outline strokes, dark surface dividers |
| Charcoal | `#202020` | Filled button background, dark elevated surfaces, secondary text on cream |
| Sage Mist | `#c0c2a9` | Muted borders, icon strokes, secondary text, soft dividers between sections |
| Olive Slate | `#5a5a4f` | Secondary and meta text, subdued captions, lower-emphasis copy |
| Pebble | `#7c7d76` | Tertiary text, caption labels, subdued helper copy on cream |
| Bone | `#edeee1` | Subtle button border, faint hover surface, near-canvas divider |
| Forest Depths | `#003d21` | Hero feature section background, brand-defining dark band, bold UI surface |
| Mint Sprout | `#aafdc0` | Light green card surface, heading accent stroke, lively pastel fill |
| Cobalt Ink | `#041668` | Decorative icon fill, deep accent stroke, secondary brand hue |
| Plum Depth | `#2d0078` | Decorative icon fill, deep accent stroke, tertiary brand hue |
| Wine Shadow | `#3f0929` | Decorative icon fill, deep accent stroke, warm accent hue |
| Lilac Wash | `#d3beff` | Soft purple card surface, pastel feature tile |
| Sky Wash | `#b0f4ff` | Soft teal card surface, pastel feature tile |
| Rose Wash | `#ffc0e6` | Soft pink card surface, pastel feature tile |

## Typography

### ui-sans-serif — ui-sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5

### Monument Grotesk (custom) — The single voice of the brand — headlines, body, buttons, nav, and tags all use this custom geometric grotesque. Weight 800 for monumental display, 500 for medium emphasis, 400 for body and UI. The tight 0.90 leading on large sizes is a signature: type compresses into architectural blocks instead of airy editorial columns.
- **Substitute:** Archivo, Space Grotesk, or Inter Tight at 700/800 weights
- **Weights:** 400, 500, 800
- **Sizes:** 10, 12, 14, 16, 18, 21, 22, 25, 34, 45, 54, 63, 72, 134
- **Line height:** 0.90–1.50 depending on size
- **Letter spacing:** Near-zero: -0.01em at all sizes for optical tightening on bold weights

### JetBrains Mono — Code-like monospace used for pill tags, small status badges, and technical microcopy. The mono voice deliberately contrasts the rounded geometric grotesque, signaling 'system' or 'label' rather than 'message'.
- **Substitute:** IBM Plex Mono or JetBrains Mono
- **Weights:** 400
- **Sizes:** 10, 12, 14, 16
- **Line height:** 1.20–1.37

### System UI Sans — Fallback and accessibility text where Monument Grotesk is unavailable; also used for non-brand secondary text and link rendering in card surfaces
- **Substitute:** System default sans-serif stack
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.37 | -0.01px |
| body-sm | — | — | 14px | 1.43 | -0.01px |
| body | — | — | 16px | 1.5 | -0.01px |
| subheading | — | — | 21px | 1.3 | -0.01px |
| heading-sm | — | — | 25px | 1.3 | -0.01px |
| heading | — | — | 34px | 1.13 | -0.01px |
| heading-lg | — | — | 45px | 1.02 | -0.01px |
| display | — | — | 72px | 0.9 | -0.01px |
| display-xl | — | — | 134px | 0.9 | -0.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 72px
- **Card padding:** 27px
- **Element gap:** 13px

### Border Radius

- **cards:** 22px
- **badges:** 9999px
- **buttons:** 13px
- **heroCards:** 45px
- **largeCards:** 27px
- **smallButtons:** 9px

## Components

### Announcement Bar
**Role:** Slim full-width strip above the navigation

Charcoal (#202020) background spanning edge-to-edge, 4–9px row gap inside, tracking-wide monospace caption in #f8f9eb at 12px, optional right-aligned close (×) in cream. Height is compact — one line of text with comfortable vertical padding.

### Top Navigation
**Role:** Primary site header with logo, links, language switcher, and CTA

Transparent or Cream Parchment (#f8f9eb) background, no bottom border. CODA wordmark in Monument Grotesk weight 800 at ~25px on the left. Center: four nav links in 16px weight 500, #202020. Right: language flag dropdown, 'Contact us' text link, and a filled dark Charcoal CTA button (13px radius, 13px 18px padding, white text). Nav links separated by ~27px horizontal gap.

### Filled Primary Button
**Role:** Primary call-to-action ('Get Started', 'Learn more')

Charcoal (#202020) fill, white text, Monument Grotesk weight 500 at 16px, 13px border-radius, padding 13px 18px, no border. Sits as the only filled button variant — there is no chromatic CTA. Hover slightly lightens to #2e2e2e.

### Outlined Ghost Button
**Role:** Secondary action on cream backgrounds

Transparent fill, 1.5px #c0c2a9 (Sage Mist) border, Charcoal text, 9px radius, 13px 18px padding. Used for low-emphasis actions that should not compete with the primary CTA.

### Pill Status Badge
**Role:** Small contextual label above section headlines ('READY TO GROW? WE'RE READY TO GO')

Full 9999px radius, 1.5px #c0c2a9 Sage Mist border, transparent fill, JetBrains Mono 12px uppercase in #202020. Padding 9px 13px. The pill shape and monospace text are a deliberate 'system tag' signal.

### Monumental Display Headline
**Role:** Hero and section-headline typography

Monument Grotesk weight 800 at 72–134px, line-height 0.90, letter-spacing -0.01em, color #000000. Icon glyphs (circular logos, smiley, arrow chips) are set inline as black outlined marks, aligned to the baseline — type and pictogram sit on the same line. Two-line stack: top line long, second line short and centered beneath.

### Subheadline
**Role:** Supporting paragraph under hero or section headlines

Monument Grotesk weight 400 at 18–21px, line-height 1.30, Charcoal (#202020), centered under the display headline. Acts as the 'quiet voice' after the monumental shout.

### Full-Bleed Forest Section
**Role:** Feature showcase band breaking the cream rhythm

Forest Depths (#003d21) background, full-bleed, ~45px corner radius on its top edge so it bleeds into the cream canvas as a soft mound. Inside: organic circular blob clusters in Mint Sprout at 60–80% opacity, layered like a 3D coin stack. Section padding 63–72px top/bottom.

### Feature Card with Outlined Icon
**Role:** Feature explanation card (e.g. 'Your web store, your way')

Forest Depths (#003d21) background continues behind, card itself is the Forest surface. Left side: Mint Sprout text headline in Monument Grotesk 800 at 45–54px, weight 800, line-height 1.02. Right side: a Mint Sprout (#aafdc0) rounded square card (~22px radius, 27px padding) containing a bold black icon (smiley face, etc.) in Monument Grotesk style, a short description in 14px Charcoal, and a Filled Primary Button (dark on the mint).

### Pastel Surface Card
**Role:** Tonal card highlighting a specific feature or content tile

Single full-bleed pastel surface in one of Lilac Wash (#d3beff), Sky Wash (#b0f4ff), Rose Wash (#ffc0e6), or Mint Sprout (#aafdc0). 22–27px radius, 27px padding. The color is the entire background — no border, no shadow. Headline in Monument Grotesk 800 in matching dark accent (Cobalt Ink, Plum Depth, Wine Shadow, or Charcoal).

### Icon-in-Rounded-Square
**Role:** Small icon container used in lists and feature callouts

22px radius, ~45×45px, filled with a chromatic accent (Mint Sprout, Cobalt Ink, etc.), 2px black outline. Icon is a single Monument Grotesk-styled pictogram (face, arrow, coin) in black, centered.

### Inline Graphic Glyph
**Role:** Decorative icon set inline with display headlines

Black-outlined geometric mark (circle with face, chip with arrow, spiral, double chevron) sized to match the cap-height of the display headline, set on the same baseline. Functions as a typographic ornament, not a separator.

## Do's and Don'ts

### Do
- Set display headlines in Monument Grotesk weight 800 at line-height 0.90 — type compression is the brand's identity, not a typographic mistake to fix.
- Default to Cream Parchment (#f8f9eb) as the canvas for all new screens; reserve Forest Depths (#003d21) for one feature band per page so it lands as a deliberate shift, not a competing background.
- Use Charcoal (#202020) as the only filled button color — there is no chromatic CTA. Accent colors belong to icons, card surfaces, and decorative strokes, never to action backgrounds.
- Border everything instead of shadowing: 1.5px Obsidian (#000000) or Sage Mist (#c0c2a9) outlines on cream surfaces. Elevation comes from outline and fill, not from box-shadow.
- Use the pastel palette (Mint Sprout, Lilac Wash, Sky Wash, Rose Wash) as full-card backgrounds — one color per card, no borders, no gradients inside.
- Apply 13px radius to buttons and 22px radius to cards consistently. Reserve 9999px for pill badges and tags only.
- Keep monospace (JetBrains Mono) restricted to 10–14px status tags, badges, and small caps labels — never use it for body sentences.

### Don't
- Do not set headlines with comfortable or airy line-height (1.3+) at display sizes — the brand's monumental effect collapses if display type breathes.
- Do not introduce a chromatic filled button (blue, green, purple) — the only CTA fill is Charcoal. Adding color to CTAs dilutes the monochrome discipline.
- Do not use #ffffff as the page background — Coda's warmth depends on Cream Parchment. Pure white makes the design feel like a generic SaaS page.
- Do not apply drop shadows or multi-layer box-shadows to cards or buttons — the border system replaces elevation. A shadow here breaks the blueprint metaphor.
- Do not mix the pastel colors inside a single card or use gradients to blend them — each pastel card is a single solid wash.
- Do not use rounded fonts (Inter, Nunito) or humanist serifs as substitutes for Monument Grotesk — the geometric grotesque compression is the signature.
- Do not add chromatic borders to dark cards. Dark sections use Mint Sprout or pastel fills internally; their outlines stay monochrome or none.

## Surfaces

- **Cream Parchment** (`#f8f9eb`) — Primary page canvas, nav background, hero surface
- **Pure White** (`#ffffff`) — Elevated card surface inside dark sections, icon fills
- **Pastel Mint** (`#aafdc0`) — Light feature card surface, text accent on dark sections
- **Pastel Lilac** (`#d3beff`) — Pastel card surface variant
- **Pastel Sky** (`#b0f4ff`) — Pastel card surface variant
- **Pastel Rose** (`#ffc0e6`) — Pastel card surface variant
- **Charcoal** (`#202020`) — Filled button surface, dark elevated card
- **Forest Depths** (`#003d21`) — Full-bleed feature band, brand-defining dark surface
- **Obsidian** (`#000000`) — Outlined and bordered containers, text, inline graphic glyphs

## Imagery

Imagery is minimal and text-driven. The site uses abstract 3D-rendered organic blob clusters (overlapping soft circular forms in Mint Sprout and Forest Depths) as decorative atmosphere inside the dark feature band — these are the only major visuals and feel sculptural, not photographic. Black-outlined icon glyphs (smiley faces, arrows, spirals, chip patterns) function as pictographic ornaments, set inline with display type at headline scale. There is no photography, no lifestyle imagery, and no product screenshots; the brand is expressed through monumental typography and the cream-and-forest color contrast alone. Icons are monoline geometric, matched to Monument Grotesk's character widths.

## Layout

Centered, max-width ~1200px contained layout with full-bleed feature bands. Top of page: announcement bar → nav → centered hero with a pill status badge, then a two-line monumental display headline with inline icon glyphs, then a short subheadline. Below the hero, a full-bleed Forest Depths band with organic blob decoration and a single feature card (icon + headline + CTA) sits inside. Sections are vertically separated by 63–72px gaps, with the Forest band connecting to cream via a ~45px radius mound rather than a hard edge. The rest of the page alternates cream canvas with isolated pastel card surfaces. Navigation is a single top bar with logo left, four text links center, language flag and CTA right. No sidebar, no sticky patterns beyond the announcement bar.

## Similar Brands

- **Stripe** — Same monumental gradient display typography and single-action-color discipline; Coda's cream parchment and bordered system echo Stripe's editorial restraint but with a warmer, more boutique canvas
- **Linear** — Shared tight line-heights on display type and a calm neutral canvas, though Coda replaces Linear's dark mode with a warm cream and uses outline-based elevation instead of dark cards
- **Gumroad** — Same creator/marketplace DNA, but Coda swaps Gumroad's saturated pink for a forest-green section, and uses Monument Grotesk weight 800 at monumental sizes where Gumroad leans on rounded display fonts
- **Cash App** — Both pair a single deep brand color (forest green vs Cash App green) with monumental display type, though Coda's monochrome cream system is far more restrained and editorial
- **Vercel** — Same hairline-bordered component language and confidence in negative space, but Coda builds on a warm cream instead of Vercel's near-black, and lets display type dominate instead of code
