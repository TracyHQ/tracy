# Aspelin Reitan — Style Reference
> Candlelit architectural archive — the page reads like a portfolio of built places pinned to a warm cream wall, with a single line of white type floating over each full-bleed image.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aspelin Reitan treats the website as a curated architectural gallery: warm cream canvases, full-bleed dark photography as section anchors, and a single custom sans-serif that stays small and editorial. The interface is deliberately quiet — no filled CTAs, no bright accent colors, no shadow stacks — letting the buildings and interiors carry the brand voice. Warmth is structural, not decorative: cream parchment for surfaces, deep walnut for dark sections, amber for the few interactive moments. Every UI element is a hairline outline or a small caption; the photograph does the heavy lifting.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Parchment | `#ffebd0` | Gray accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Candlelight | `#fff8e9` | Lighter cream for elevated surfaces and secondary text on dark — a half-step above Parchment for subtle layering |
| Obsidian | `#000000` | Structural borders, section dividers, image edge treatments — used as a hairline, never as a fill |
| Walnut Shell | `#2f2116` | Dark canvas behind full-bleed photographs, footer backgrounds, and dark editorial sections — the deep brown that makes white type glow warm |
| Aged Bronze | `#4f3622` | Secondary dark surface and border on dark sections — a half-step lighter than Walnut for subtle layering on dark |
| Amber Glow | `#fee197` | Navigation borders, active state accents, warning/attention states, and the single chromatic punctuation in an otherwise warm-neutral system |
| Muted Gold | `#987f61` | Link borders and heading underlines on dark sections — a desaturated brass for typographic detail without breaking the monochrome feel |

## Typography

### ModernEra — Sole typeface for body, navigation, buttons, links, headings, and overlay captions — a custom humanist sans that sits at 400 for body and 500 for emphasis. The entire type scale tops out at 40px, which is anti-SaaS: no 56px or 72px display sizes, no dramatic weight jumps. Authority comes from restraint, not volume.
- **Substitute:** Söhne, Inter, or GT America — all humanist sans-serifs with similar x-height and warmth
- **Weights:** 400, 500
- **Sizes:** 16px, 18px, 20px, 24px, 28px, 40px
- **Line height:** 1.17–1.40

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.4 | — |
| body | — | — | 18px | 1.25 | — |
| subheading | — | — | 20px | 1.22 | — |
| heading-sm | — | — | 24px | 1.2 | — |
| heading | — | — | 28px | 1.17 | — |
| display | — | — | 40px | 1.17 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 100px
- **Card padding:** 40px
- **Element gap:** 12-20px

### Border Radius

- **cards:** 0px
- **links:** 8px
- **images:** 0px
- **buttons:** 8px

## Components

### Outlined Navigation Button
**Role:** Primary interactive element in the header

Transparent background, 1px Warm Parchment (#ffebd0) border, 8px radius, 16-18px horizontal padding, 6-8px vertical padding. Text in ModernEra 400 at 16px in Warm Parchment. The 'Portefølje' button in the header is the canonical example. No fill state — outlined only.

### Ghost Link with Border
**Role:** Text links throughout content sections

No background, 1px bottom border in the link's color (Obsidian on cream sections, Muted Gold on dark sections). Text in ModernEra 400-500 at 16-18px. Padding-bottom of 8-12px to create breathing room below the border line. The border IS the affordance — no underline color change needed.

### Full-Bleed Editorial Hero
**Role:** Opening section of each major page

Photograph fills the entire viewport with no padding or margin. White type overlay positioned bottom-left at 40px / 1.17 in ModernEra 400, with ~40px left/bottom inset. Navigation floats on top: logo top-left, buttons top-right. The photograph's content provides all color and atmosphere — the UI adds no overlay tint.

### Portfolio Image Card
**Role:** Project or case-study thumbnails in the portfolio grid

Large image at full column width, no border, no radius, no shadow — images are sharp-cornered and bleed to the grid edge. Caption sits below at 16-18px ModernEra 400 in Obsidian, with ~40px padding around the text. The image and caption are vertically separated; no card container.

### Two-Column Project Layout
**Role:** Portfolio detail or story sections

Two images side by side in a single row on a Warm Parchment (#ffebd0) background. The left image is ~40% width, the right image fills the remainder. A single line of project name text sits below the right image at 16px ModernEra 400, aligned left, with 40px of padding around the entire group.

### Dark Overlay Section
**Role:** Editorial story or mood sections between cream content areas

Full-bleed warm-toned photograph with Walnut Shell (#2f2116) as the base if the image is absent. Section title in ModernEra 400 at 28-40px in Warm Parchment (#ffebd0) positioned top-left with ~40px inset. Optional 'Historier' or category label at top-right at 16px. The contrast between dark image and light text is the entire design — no gradient overlays needed.

### Header Bar
**Role:** Persistent navigation across all pages

Fixed or absolute over hero imagery. Logo 'ASPELIN REITAN' top-left at 16-18px ModernEra 500 in Warm Parchment, letter-spaced wide enough to read as a wordmark. Navigation items top-right: an outlined 'Portefølje' button (8px radius) and a 'Meny' text label. No background fill — the header is transparent over the hero photograph.

### Navigation Item
**Role:** Menu links in the header

Plain text in ModernEra 400 at 16px in Warm Parchment. No border, no background. 20px margin-right between items. Active state indicated by Amber Glow (#fee197) bottom border at 1px.

### Section Heading
**Role:** Titles for content blocks on cream backgrounds

ModernEra 500 at 24-28px in Obsidian (#000000). No decorative element, no underline. Left-aligned with 40px left padding. Generous space below before content begins (40-100px).

### Footer
**Role:** Bottom of page

Walnut Shell (#2f2116) background. Text in Warm Parchment (#ffebd0) at 16px ModernEra 400. Single column or two-column layout with 40px padding. Same outlined-button pattern for any footer CTAs.

### Outlined Action Button (Cream Section)
**Role:** Interactive buttons when on a cream background

Transparent background, 1px Obsidian (#000000) border, 8px radius, 18px horizontal padding, 16px vertical padding. Text in ModernEra 500 at 16px in Obsidian. Hover state: background fills with Obsidian, text shifts to Warm Parchment.

### Input Field
**Role:** Form inputs (newsletter, contact)

Transparent background, 1px Warm Parchment (#ffebd0) or Obsidian border (context-dependent), 8px radius, 16px padding. Text in ModernEra 400 at 16px. Placeholder in same color at reduced opacity.

## Do's and Don'ts

### Do
- Use outlined buttons with 8px radius exclusively — no filled CTAs. Pair with 1px borders in Warm Parchment on dark or Obsidian on cream.
- Let full-bleed photography carry the visual weight. Keep UI chrome transparent or minimal over photographs.
- Stay within the type scale: 16, 18, 20, 24, 28, 40px. Do not exceed 40px for display text — the restrained scale is the signature.
- Use Warm Parchment (#ffebd0) as the dominant canvas for content sections and Walnut Shell (#2f2116) for dark editorial breaks.
- Maintain 100px vertical section gaps to preserve the spacious, gallery-walk rhythm.
- Pair every link with a visible border or bottom-line treatment — the line IS the affordance, not a color change.
- Set body text at 18px / 1.25 in ModernEra 400 — never below 16px, and keep line-height generous.

### Don't
- Do not introduce filled CTA buttons, drop shadows, or gradient backgrounds — the system is flat and outlined by design.
- Do not add chromatic colors beyond Amber Glow (#fee197) and Muted Gold (#987f61). The palette is warm-neutral only.
- Do not use display sizes above 40px or bold weights above 500. The system whispers; it does not shout.
- Do not apply border-radius to images or cards. Only buttons and links get 8px. Images and cards are sharp-cornered.
- Do not place white text on Warm Parchment backgrounds — contrast is reserved for Walnut Shell dark sections.
- Do not add icons, illustrations, or decorative graphics over photographs. The photograph is the only visual layer.
- Do not use multiple typefaces. ModernEra is the sole family — no serifs, no display fonts, no mono.

## Elevation

No shadows. The design uses flat surfaces, hairline borders, and photographic backgrounds to create depth. There is no z-axis layering via box-shadow — separation comes from color contrast between Warm Parchment and Walnut Shell, and from the full-bleed photographic sections that naturally create visual breaks.

## Surfaces

- **Walnut Shell** (`#2f2116`) — Dark full-bleed sections, photo overlays, footer canvas
- **Warm Parchment** (`#ffebd0`) — Primary page canvas where text, cards, and project grids live
- **Candlelight** (`#fff8e9`) — Lighter cream for elevated content blocks and secondary surfaces

## Imagery

Full-bleed architectural photography is the dominant visual content. Exterior shots of completed buildings (historic brick facades, modern glass towers, residential developments) serve as full-viewport section anchors. Interior shots appear in two-column layouts, showing furnished hotel lobbies, offices, and residential interiors with people present to convey scale and livability. Photographs have a warm color temperature — amber-lit interiors, golden-hour exteriors — that harmonizes with the cream palette. No illustrations, no abstract graphics, no product mockups. The imagery is documentary, not aspirational: real places, real light, real scale. Images are sharp-cornered and bleed to the viewport edge with no rounded masks.

## Layout

The page follows a full-bleed gallery rhythm: each major section is either a full-viewport photograph with minimal text overlay, or a cream canvas with a contained content block. Hero sections are 100vh with text positioned bottom-left in 40px ModernEra 400. Content sections sit on Warm Parchment (#ffebd0) with 1200px max width, 40px inner padding, and images arranged in two-column or single-column grids. Section transitions alternate between dark photographic breaks and cream content blocks. Navigation is a minimal floating bar over the hero — logo left, two items right. The overall density is very spacious: 100px between sections, single-image compositions, no multi-row card grids.

## Similar Brands

- **Snøhetta** — Same warm cream backgrounds, full-bleed architectural photography, and restrained editorial typography — both treat the website as a portfolio of built work rather than a product
- **Selvaag Bolig** — Norwegian real estate with the same gallery-walk rhythm: dark photographic hero sections alternating with cream content areas, custom sans-serif, minimal outlined navigation
- **M Moser Associates** — Same flat-design discipline with no shadows, hairline borders, warm neutral palette, and full-bleed photography as the primary visual content
- **BIG (Bjarke Ingels Group)** — Architecture firm using full-viewport project photography with minimal text overlays and a single restrained typeface throughout
- **The Modern House** — Same editorial gallery approach to real estate — warm cream page surfaces, large untitled photographs, and a single humanist sans-serif at modest sizes
