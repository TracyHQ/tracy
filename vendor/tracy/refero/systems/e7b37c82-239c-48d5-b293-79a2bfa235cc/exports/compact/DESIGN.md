# IKEA — Style Reference
> sunlit Swedish flat-pack showroom

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

IKEA's interface reads as a high-contrast editorial spread: near-black type on warm white, punctuated by flat yellow panels that function as built-in call-to-action zones. The system is deliberately sparse — one custom sans-serif (Noto IKEA) at just two weights (400 and 700), one 8px corner radius across every component, zero shadows, no gradients. The tightness is structural, not minimalism-as-trend: the negative letter-spacing (-0.029em at display, -0.027em at body) makes even 13px captions feel architectural. Cards are large and media-led, arranged in generous two-column blocks with gradient-to-black text overlays for legibility. The yellow #ffdb00 does all the interface work — it never decorates, it only activates.

## Colors

| Name | Value | Role |
|------|-------|------|
| IKEA Yellow | `#ffdb00` | Primary CTA fills, featured card backgrounds, hero accent panels, the singular chromatic workhorse of the system |
| Ink Black | `#111111` | Primary text, body copy, headings, dominant borders (851 occurrences), icon strokes |
| Pure White | `#ffffff` | Page background, card surfaces, nav background, button text on dark fills |
| Warm White | `#fffefb` | Slightly off-white surface variant for buttons and cards — barely warmer than pure white, breaks digital coldness |
| Steel Gray | `#818181` | Secondary text, muted borders, disabled icon states |
| True Black | `#000000` | SVG icon fills, input borders, true-black accents where maximum contrast is needed |
| Link Blue | `#0159a3` | Text link color, used extensively across navigation and body links — the only blue in the system |
| Soft Pink | `#ffa6da` | Occasional decorative highlight, used sparingly on select link elements or promotional accents |

## Typography

### Noto IKEA — Sole typeface — custom IKEA-branded Noto variant. Two-weight system (regular 400, bold 700) is deliberate restraint: no italics, no medium weight, no light. The 700 headlines at 36–51px carry the entire brand voice; body at 16px stays neutral. Letter-spacing tightens as size grows, giving display text a compressed, architectural quality.
- **Substitute:** Inter, DM Sans
- **Weights:** 400, 700
- **Sizes:** 13px, 14px, 16px, 20px, 36px, 51px
- **Line height:** 1.00–1.62
- **Letter spacing:** -0.029em at 51px display, -0.027em at 20px+ headings
- **OpenType features:** `N/A`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.4 | — |
| body | — | — | 16px | 1.57 | — |
| subheading | — | — | 20px | 1.2 | -0.54px |
| heading | — | — | 36px | 1.08 | -0.97px |
| display | — | — | 51px | 1 | -1.48px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 24px

### Border Radius

- **cards:** 8px
- **images:** 8px
- **inputs:** 8px
- **buttons:** 8px
- **default:** 8px

## Components

### Top Navigation Bar
**Role:** Site header

White background, horizontal flex layout. IKEA logo (yellow+blue badge) left-aligned, text links (Stories, Jobs, Newsroom, Our business) in Ink Black at 14px weight 400, evenly spaced. 1px bottom border in white/light gray. No sticky behavior, no search bar visible in this view.

### Hero Media Card
**Role:** Primary featured content card

Large image card, roughly 2/3 viewport width. Contains full-bleed product photography. Bottom-left text overlay with small kicker label (13–14px, white) and bold headline (36–51px, white, weight 700, letter-spacing -0.027em). Gradient overlay from transparent to black at bottom for text legibility. 8px border radius. Circular play/pause button bottom-right with dark semi-transparent fill.

### Yellow CTA Card
**Role:** Primary action panel

Solid #ffdb00 background, 1/3 viewport width beside the hero media card. Contains bold black text (36–51px, weight 700) like 'Go shopping'. Circular Ink Black button with white right-arrow icon for the action. 8px border radius. This card is the system's signature: flat yellow plane + minimal content + arrow = unmistakable primary action.

### Image Story Card
**Role:** Editorial content card

Media card used in 2-column grids. Full-bleed lifestyle or product photography. Gradient-to-black overlay at bottom with small kicker (13px white) and headline (20–36px white, weight 700). 8px border radius. Some variants have solid backgrounds (gray-to-black gradient) without photography.

### Circular Media Control
**Role:** Play/pause button

Small circular button (~40px diameter) with Ink Black or dark fill and white icon. Positioned bottom-right of media cards. 50% border radius (pill/circle). Used to indicate video or audio content.

### Arrow Link Button
**Role:** Inline navigation action

Circular Ink Black button (~40px) with white right-arrow icon. Paired with bold text in Yellow CTA cards. The arrow+circle is a recurring interaction pattern — always means 'go to' or 'navigate'.

### Store Selector Footer
**Role:** Utility footer

Minimal footer beneath CTA cards. Contains store label (e.g. 'Store: IKEA.es') in Ink Black at 14px weight 400, right-aligned, with a small chevron-up icon. 8px padding, 8px radius. Separated from card by subtle spacing.

### Timeline Section Block
**Role:** Historical/year display

White background section with large numerical display (51px+ weight 700, Ink Black). Accompanied by rows of decorative green circles (not part of the core palette but used in this context). Left-aligned layout with generous 80px+ vertical padding. Headlines sit tight against the numbers.

## Do's and Don'ts

### Do
- Use #ffdb00 exclusively for primary CTAs and featured accent cards — never as a background for body text or informational content
- Set all corners to 8px — there is exactly one border radius in the system
- Use weight 700 for every headline and weight 400 for every body element — never introduce medium, semibold, or light weights
- Apply gradient-to-black overlays at 30–60% opacity on all image cards that contain text overlays
- Use the circular black arrow button (Ink Black fill, white arrow, 8px or 50% radius) as the universal 'navigate' affordance
- Keep body text at 16px with 1.57 line-height — IKEA's body line-height is generous, not tight
- Use #0159a3 exclusively for text links, never for buttons or backgrounds

### Don't
- Do not introduce shadows, elevation, or any depth effects — the system is entirely flat
- Do not use more than one border radius — 8px everywhere, no exceptions
- Do not add additional font weights (300, 500, 600) — the binary 400/700 system is the constraint
- Do not place body text directly on photography without a gradient overlay
- Do not use the blue #0159a3 as a CTA button fill — it is link-only, not action
- Do not soften the letter-spacing — the negative tracking is structural, not decorative
- Do not add accent gradients or color transitions — the system rejects all gradient fills on surfaces

## Elevation

The system deliberately uses zero shadows and zero elevation. All depth and hierarchy is created through: (1) solid yellow surface contrast against white, (2) image overlays with gradient-to-black, (3) size and weight contrast in type, and (4) generous spacing between cards. The absence of shadow is not a missing feature — it is the defining visual stance. Everything sits on the same plane, like printed pages on a table.

## Surfaces

- **Page Canvas** (`#ffffff`) — Base page background, top navigation
- **Card Surface** (`#ffffff`) — Default card background on white pages
- **Warm White Surface** (`#fffefb`) — Subtle off-white for specific card or button surfaces
- **Accent Surface** (`#ffdb00`) — Yellow solid-fill cards and hero panels — the highest surface level, demands attention

## Imagery

Product and lifestyle photography is the dominant visual language. Treatment: high-key, naturally lit, warm Scandinavian interiors with lived-in authenticity — not studio-white. People appear in product interaction scenes (holding, assembling, using). Images are always full-bleed within their 8px-rounded cards, never cropped to organic shapes. Gradient-to-black overlays appear at the bottom 30-40% of any image card that carries text. Occasional flat illustration appears (e.g., the Germany map with cultural iconography in teal/green/orange). Photography is editorial-confident: no stock-photo gloss, no overly stylized color grading.

## Layout

Full-bleed with centered content container capped at ~1440px. Navigation is a simple top bar, not sticky. The page is built from horizontal card sections stacked vertically with ~80px gaps. Hero pattern: split layout — 2/3 media card (image) + 1/3 solid yellow CTA card. Body sections use 2-column card grids alternating between image-led and text-led blocks. Content density is spacious, never compact. Cards are large (roughly 600x400 minimum) with generous internal padding. A timeline/history section breaks the grid with oversized numerals. No sidebar, no mega-menu, no complex navigation architecture.

## Similar Brands

- **H&M** — Same Scandinavian design DNA — flat layout, yellow as accent against white, 2-column card grids, no shadows, and bold sans-serif headlines with tight tracking
- **LEGO** — Similar primary-color-against-white approach with product-led card layouts, though LEGO uses red where IKEA uses yellow; both are large media cards with text overlays
- **Best Buy** — Yellow brand accent on white, bold sans-serif type, 2-column featured content grids with image cards and text overlays — comparable e-commerce editorial pattern
- **Craigslist** — Minimal interface chrome, blue text links, no decorative elements — though IKEA has far more visual hierarchy and media
- ** Depot** — Bold brand color (orange vs yellow), flat card-based homepage, large media blocks, utilitarian sans-serif type — same functional-not-pretty retail aesthetic
