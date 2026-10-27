# NaN — Style Reference
> mint greenhouse of living letters — a pastel type lab where every headline is the product itself

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

NaN runs its website like a working specimen sheet: the mint-green canvas is the page, and the page is the product. Massive custom display faces (200-336px) are the visual architecture; a monospaced sans (NaN Holo Mono) set in uppercase with 0.075em tracking is the chrome that holds everything together. The palette is ruthlessly tight — one pastel canvas, near-black text (#262626, never pure black), one bright lime accent (#00ff00) for raw typographic flourishes, and a single pink-purple-blue gradient for the lone chromatic CTA. Borders do the work that shadows usually do: 1-2px hairlines define cards, inputs, and the type tester frame with no elevation. The interaction model is a live font tester — sliders for size and leading, dropdowns for family and weight — letting visitors steer the display in real time, which makes the site function as both storefront and demo.

## Colors

| Name | Value | Role |
|------|-------|------|
| Mint Canvas | `#b7ffb4` | Page background, card surfaces — the signature pastel that makes dark type appear sunlit rather than printed |
| Lime Spark | `#00ff00` | Decorative typographic flourishes and SVG scribble overlays — a raw signal-green that contrasts the pastel canvas without warming it |
| Carbon Ink | `#262626` | Primary text, borders, icon strokes, button outlines — softer than pure black, sits on mint without vibrating |
| Obsidian | `#000000` | Display-type fills at the largest sizes, pure-black SVG fills for the heaviest display specimens |
| Fog | `#999999` | Muted helper text, inactive borders, disabled controls — the quietest readable neutral on the mint canvas |
| Smoke | `#767676` | Input field borders in resting state — darker than fog to signal interactivity without competing with the canvas |
| Bone | `#efefef` | Light surface for elevated UI bits (button hover, inverted controls) — provides a near-white counterpoint when the canvas needs to recede |
| Paper | `#ffffff` | Input field interior, pure-white text on dark inverted moments |
| Aurora Gradient | `linear-gradient(270deg, rgb(255, 163, 182), rgb(221, 169, 255) 33%, rgb(162, 209, 255) 66%, rgb(255, 163, 182))` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### NaN Holo Mono — All interface chrome — navigation, labels, buttons, form controls, metadata, keyboard hints. Set uppercase with +0.075em tracking, the letter-spacing is the signature that makes mono read as a deliberate UI system rather than terminal output. The weight range lets it flex from thin nav links to heavy button text without leaving the family.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Space Mono
- **Weights:** 300, 400, 500, 700, 800, 900
- **Sizes:** 12, 13, 14, 16, 20, 24, 26, 32, 45px
- **Line height:** 1.0–3.0
- **Letter spacing:** 0.075em (≈1.2px at 16px, ≈3.4px at 45px)
- **OpenType features:** `"dlig" 0, "liga" 0`

### NaN Holo — Prose body and large secondary headlines that need to sit beside display specimens without competing. The 86px weight-300 size is a typographic statement — a humanist counterweight to the blocky display faces above it.
- **Substitute:** Inter, Söhne, Untitled Sans
- **Weights:** 300, 400, 700
- **Sizes:** 12, 16, 45, 86px
- **Line height:** 1.2–1.5
- **OpenType features:** `"dlig" 0, "liga" 0`

### NaN Archy On ExtraBlack — Hero display headline — the signature specimen face, shown at its native 228px with tight 0.90 leading so the letterforms stack into a near-monolithic mass. This is the typeface the homepage exists to sell.
- **Substitute:** Druk, Compacta, Inter Black Compressed
- **Weights:** 400
- **Sizes:** 228px
- **Line height:** 0.90
- **OpenType features:** `"dlig", "frac" 0, "onum" 0, "ss01" 0, "ss02" 0, "ss03" 0, "ss05" 0, "tnum" 0`

### NaN SuperX Sans Display Black — Secondary display face — ultra-tight 0.85 leading creates a dense typographic slab, the contrast to Archy's rounded forms. Used in alternate hero rotations.
- **Substitute:** Druk Wide, Inter Black, Söhne Breit
- **Weights:** 400
- **Sizes:** 216px
- **Line height:** 0.85
- **OpenType features:** `"dlig", "frac" 0, "onum" 0, "ss01" 0, "ss02" 0, "ss03" 0, "tnum" 0`

### NaN SuperX Serif Text Thin Italic — Editorial italic display — the serif counterpoint that proves the practice spans humanist letterforms, not just geometric sans. Thin weight at 216px is a tension device: fragile strokes at monumental size.
- **Substitute:** Tiempos Headline, Domaine Display, Canela
- **Weights:** 400
- **Sizes:** 216px
- **Line height:** 1.00
- **OpenType features:** `"dlig" 0, "frac" 0, "onum" 0, "ss01" 0, "ss02" 0, "ss03" 0, "ss05" 0, "tnum" 0`

### NaN Holo Gigawide Ultra1 — Ultra-condensed display at 336px — the widest single-character scale on the site, used sparingly as a one-word exclamation.
- **Substitute:** Druk Condensed Super, Compacta Black
- **Weights:** 400
- **Sizes:** 336px
- **Line height:** 0.80
- **OpenType features:** `"ss01" 0, "ss02" 0, "ss03" 0, "ss04" 0, "ss05" 0, "ss06" 0, "ss07" 0, "ss08" 0, "ss09" 0, "ss10" 0`

### NaN Rage family (Zipp, Soft, Beau, Sans Narrow) — Card specimen headlines in the 'You Might Have Missed' grid — each card shows the family name rendered in that exact family at 86px, making the grid self-documenting.
- **Substitute:** Recoleta, Pangram Sans, GT America
- **Weights:** 400
- **Sizes:** 86px
- **Line height:** 1.00

### NaNRageZippNarrowThin — NaNRageZippNarrowThin — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 86px
- **Line height:** 1

### NaNRageSoftXCondensedRegular — NaNRageSoftXCondensedRegular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 86px
- **Line height:** 1

### NaNRageBeauStandardSemibold — NaNRageBeauStandardSemibold — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 86px
- **Line height:** 1

### NaNRageSansNarrowMedium — NaNRageSansNarrowMedium — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 86px
- **Line height:** 1

### NaNSerfATextLightItalic — NaNSerfATextLightItalic — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 86px
- **Line height:** 1

### NaNSerfSansLightItalic — NaNSerfSansLightItalic — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 86px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body | — | — | 16px | 1.5 | 1.2px |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 24px | 1.2 | — |
| heading | — | — | 32px | 1.2 | — |
| display-sm | — | — | 45px | 1.2 | 3.4px |
| display | — | — | 86px | 1 | — |
| display-lg | — | — | 216px | 0.85 | — |
| display-xl | — | — | 228px | 0.9 | — |
| display-mega | — | — | 336px | 0.8 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **cards:** 18px
- **small:** 2px
- **inputs:** 2px
- **buttons:** 29.4px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Sticky top bar on #b7ffb4 canvas. Left: 'NaN' wordmark in NaN Holo Mono 14px uppercase. Center: nav links (FONTS, COMMISSIONS, PROJECTS, TXT, SHOP, STUDIO) in NaN Holo Mono 14px uppercase, #262626, letter-spacing 0.075em, 32px gap. Right: CART (0), ACCOUNT, then a tri-color circle icon and a small 'NaN' dot. No background fill, no shadow — sits directly on canvas. Bottom edge: no border, sections define their own top spacing.

### Hero Statement Block
**Role:** Opening brand description

Left-aligned paragraph in NaN Holo Mono 26px weight 400, #262626, line-height 2.25. Content fills roughly 75% of viewport width. No background, no border — the text IS the hero. A lime-green (#00ff00) SVG scribble overlays the right portion at ~40% opacity, drawing the eye past the text without blocking it.

### Live Font Tester
**Role:** Interactive type specimen controller

Sectioned widget with four control rows stacked vertically on a #b7ffb4 canvas. Row 1: small section label (◉ Our Latest Font Release, NaN Holo Mono 14px #262626, 0.075em tracking). Row 2: Size slider (left-aligned label 'Size 220px', then NaN Holo Mono 12px, line-track 1px #262626 with 6px #262626 thumb) + Leading slider (right-side label 'Leading', identical track style) + two select dropdowns (NaN Holo Mono 13px, 1px #262626 border, 2px radius, no fill). Row 3: keyboard-shortcut chips (rounded squares, 1px #262626 border, NaN Holo Mono 12px) + a pear emoji. Row 4: a massive display specimen in the selected family at the selected size. No drop shadows — borders and whitespace define the frame.

### Aurora CTA Button
**Role:** Sole chromatic primary action

Filled pill button, 29.4px radius, horizontal aurora gradient (pink #ffa3b6 → violet #dda9ff → blue #a2d1ff → pink). Label in NaN Holo Mono 14px weight 500, #262626, uppercase, 0.075em tracking. Padding 14px 20px. Sits centered below the display specimen. One per page — this gradient is rationed because it is the only warm element in a cool palette.

### Display Headline (Specimen)
**Role:** Full-bleed type demonstration

Massive custom typeface rendered at 216-336px, weight 400, #000000 or #262626, line-height 0.80-0.90 depending on face. Text bleeds to both edges of the viewport (no max-width clamp) so the letterforms define the page's lateral scale. No background, no border — the type floats on the mint canvas.

### Font Specimen Card
**Role:** Library entry in the 'You Might Have Missed' grid

Three-column grid on the mint canvas. Each card: 1px #262626 border, 18px radius, transparent fill (shows mint through). Interior padding 20px. The card's own family name is rendered IN that family at 86px, weight 400, #262626, line-height 1.0 — the card is its own specimen. Two-line stack: 'NaN' (smaller) above 'Rage Zipp' (larger). No shadow, no hover elevation — the 1px border does all the work.

### Section Label
**Role:** Subsection heading

Left-aligned '◉ Section Name' in NaN Holo Mono 14px weight 400, #262626, 0.075em tracking. The hollow circle (◉) is a recurring typographic bullet that marks every new section without using color or weight changes. Followed by generous vertical breathing space (60-80px) before the section content.

### Select Dropdown
**Role:** Form control within the font tester

Inline select element, NaN Holo Mono 13px, #262626, 1px #262626 border, 2px radius, transparent fill. No focus ring color change — interaction is communicated through a 1-2px border darkening to #000000 on hover/focus. Inline with text controls on a single row.

### Range Slider
**Role:** Numeric control for size/leading

Native range input styled as a 1px #262626 line track with a 6px square #262626 thumb. Label text in NaN Holo Mono 12px, #262626, sits above the track. No value tooltip — the display specimen updates in real time as the user drags, providing feedback.

### Keyboard Hint Chip
**Role:** Reveals power-user shortcuts

Small rounded-square button, ~20×20px, 1px #262626 border, 2px radius, NaN Holo Mono 11px #262626 label. Used to surface shortcuts (e.g. 'R', arrows, 'OT') adjacent to the font tester controls.

## Do's and Don'ts

### Do
- Set all interface text in NaN Holo Mono with 0.075em tracking — the monospace + tracking combo is what reads as 'NaN UI' versus generic mono
- Use #262626 for text and borders, never #000000 for UI chrome — pure black is reserved for the heaviest display specimens
- Let display specimens bleed to viewport edges without a max-width clamp; the type defines the lateral scale
- Use the aurora gradient button (29.4px radius) exactly once per page — the gradient is rationed because it's the only warm element
- Mark every new section with a hollow circle bullet (◉) in 14px NaN Holo Mono, followed by 60-80px vertical space
- Make specimen cards self-documenting: render the card's font name IN that font, not as a label
- Keep all elevation to 1-2px hairline borders in #262626 — never introduce drop shadows

### Don't
- Don't use #ffffff as a page surface — it kills the mint canvas identity
- Don't use #000000 for body text or UI borders — it fights the pastel canvas
- Don't set the Holo Mono tracking below 0.05em — the letter-spacing is what makes the mono read as deliberate UI
- Don't introduce additional accent colors — the palette is mint, lime, carbon, and the aurora gradient, nothing else
- Don't add drop shadows to cards or buttons — the site defines depth through borders and whitespace only
- Don't use a 4px or 8px radius on cards — the 18px card radius is the signature soft-corner language
- Don't wrap display specimens in centered containers; full-bleed is what makes the type feel architectural

## Surfaces

- **Mint Canvas** (`#b7ffb4`) — Page background and base surface for all sections
- **Bone Lift** (`#efefef`) — Rare elevated surface for inverted or hover states where mint needs to recede
- **Aurora CTA** (`#ffa3b6`) — The sole gradient surface — the discover-more button

## Imagery

Zero photography, zero illustration beyond the lime SVG scribble overlay. The site IS imagery: each custom typeface is photographed (rendered) at 200-336px and the resulting letterforms ARE the visual content. Product screenshots are absent because the product is the typography itself. The only non-typographic graphical element is a tri-color circle icon (likely a theme/palette swatch) in the nav and a pear emoji in the font tester — small, playful, and accepted as part of the studio's informal voice. Card specimens double as their own photography: the card titled 'Rage Zipp' is photographed by being typeset in Rage Zipp.

## Layout

Full-bleed canvas with no global max-width clamp on display type. Top nav is a single horizontal row, sticky, with the wordmark left and utility links right. The hero is a left-aligned statement paragraph occupying ~75% viewport width, with no centered hero or split-screen image. Sections stack vertically with 60-80px gaps, each opened by a small mono-uppercase label. The 'You Might Have Missed' section is a 3-column card grid. The display specimens in the font tester span the full viewport width and bleed off the right edge intentionally. Density is sparse and editorial — the mint canvas breathes between sections, and the only dense moment is the font tester control row.

## Similar Brands

- **Pangram Pangram** — Same type-foundry-as-website model where custom display faces at 100-200px ARE the page, with a minimal mono-uppercase nav wrapping the specimens
- **Klim Type Foundry** — Same specimen-first architecture — large type specimens dominate the viewport, monospaced metadata labels, single-color canvas with no decorative imagery
- **OH no Type** — Same bold-display-on-pastel-canvas approach and playful studio tone, with type specimens doubling as page composition
- **Future Fonts** — Same experimental-foundry aesthetic — mint-toned canvas, uppercase mono nav, type families presented as cards with the family name set in its own face
- **Commercial Type** — Same live font-tester pattern with sliders and dropdowns controlling a real-time display specimen, and 1px hairline borders defining all UI frames
