# Custo — Style Reference
> Gunmetal gallery with monolithic type. A muted gray-green showroom where a single dark object and 57px type do all the talking.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Custo operates as an industrial product gallery: a warm gunmetal canvas hosts the physical product while oversized display typography serves as the primary visual ornament. The system is rigorously achromatic — zero chromatic colors — letting the dark anodized mailbox and the geometric weight of a single sans-serif carry all brand personality. Every screen balances generous negative space against one monumental typographic statement, with the brand wordmark recurring as a near-architectural element. Surfaces are flat and matte; depth is implied by the product's own reflectivity rather than drop shadows or gradients.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Gunmetal | `#9ea29f` | Hero and feature-section background — the warm gray-green tint distinguishes Custo from generic white SaaS canvases and reads as architectural concrete rather than digital surface |
| Obsidian | `#000000` | Primary text, hairline borders, icon strokes — the highest-contrast ink in the system, used for headings and structural dividers |
| Paper White | `#ffffff` | Body section backgrounds, reversed text on gunmetal canvas, text on the dark product photography |
| Anodized Graphite | `#4b514d` | Dark surface for product photography, secondary headings, and elevated text — echoes the mailbox finish so the UI and product share a material |
| Brushed Steel | `#8e9194` | Muted body text, list dividers, secondary icon strokes — sits between Paper White and Obsidian for inline metadata and subdued links |
| Linen Mist | `#a7aaad` | Light border and divider color for headings and section rules — a hairline tone that never competes with Obsidian structural lines |
| Aluminum Hairline | `#d8d8d8` | Input field borders, footer separators, the lightest structural line — appears only where a near-invisible boundary is needed |

## Typography

### PP Neue Montreal — Single-family type system used for everything from body copy to 57px display statements — the geometric uniformity across weights is the signature choice, avoiding any secondary or display-specific font so the wordmark 'CUSTO®' set at 57px reads as the same typographic family as a 15px form input label
- **Substitute:** Inter, Manrope, or DM Sans at matching optical sizes
- **Weights:** 400 (Medium)
- **Sizes:** 15px, 16px, 19px, 20px, 30px, 38px, 57px
- **Line height:** 1.00–1.62 (tighter as size grows; 1.00 at 57px, 1.62 at 15–16px)
- **Letter spacing:** normal across the entire scale
- **OpenType features:** `"kern" on, "liga" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 15px | 1.43 | — |
| subheading | — | — | 20px | 1.38 | — |
| heading-sm | — | — | 30px | 1.25 | — |
| heading | — | — | 38px | 1.15 | — |
| display | — | — | 57px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 110px
- **Card padding:** 20px
- **Element gap:** 24px

### Border Radius

- **cards:** 8px
- **images:** 8px
- **inputs:** 8px
- **buttons:** 31.35px (pill) for primary action; 8px for secondary

## Components

### Ghost Pill Button (Primary Action)
**Role:** Hero and feature-section call-to-action — 'Order now', 'Discover our smart mailbox'

Transparent background, 1px white border on gunmetal canvas or 1px Obsidian border on white sections, Paper White or Obsidian text, 31.35px pill radius, ~16px vertical / ~28px horizontal padding, PP Neue Montreal at 16px / 1.62. No fill state; hover inverts fill and text color.

### Text Link with Arrow
**Role:** Inline section CTA that bridges body copy to the next scroll position

Underlined text link in Obsidian or Paper White (reversed on gunmetal) with a right-arrow glyph. 15–16px PP Neue Montreal, 1.43–1.62 line-height, 15px padding-bottom for the underline to breathe.

### Display Wordmark
**Role:** Hero-scale brand statement — the CUSTO® lockup at architectural size

57px PP Neue Montreal Medium, line-height 1.00, set in Paper White on the gunmetal hero so it bleeds into the product silhouette. Registered-trademark glyph sits to the right as a circle-stroke mark.

### Product Image Card
**Role:** Horizontal scroll/grid of mailbox photography — lifestyle, close-up, in-situ

8px border-radius, Paper White or transparent surface, 1px Linen Mist border optional, full-bleed photograph with no overlay text. Three-up grid on desktop, single column on mobile.

### Two-Column Text Block
**Role:** Content sections pairing a small caption heading on the left with body copy on the right

Left column: 15–16px caption label in Obsidian. Right column: 30–38px heading in Obsidian, 19px body in Obsidian, line-height 1.42. 24px column gap, 110px vertical section gap.

### Top Navigation Bar
**Role:** Persistent header across all pages

Transparent over hero, becomes Paper White on scroll. Wordmark 'CUSTO®' left in 15–16px PP Neue Montreal, nav links centered (Smart mailboxes, How it works, The app, About) at 15–16px, Order now pill button right. 32px vertical padding.

### Text Input Field
**Role:** Form input for email capture, delivery address, or app registration

1px Aluminum Hairline (#d8d8d8) border, 8px radius, 16px vertical / 32px horizontal padding, 15–16px PP Neue Montreal placeholder in Brushed Steel. No visible focus ring; active state deepens border to Obsidian.

### Feature Heading (Hero Scale)
**Role:** Second-tier display statement — 'Receive the world at your doorstep.'

38px PP Neue Montreal, line-height 1.15, Paper White on gunmetal hero or Obsidian on white sections. Two-line wrap at 30–38 character column.

### Section Caption Label
**Role:** Small kicker text introducing each content block — 'Never let a parcel delivery rule your entire schedule again.'

15–16px PP Neue Montreal, line-height 1.43, Obsidian, max-width ~280px, left-aligned to mark the start of a section before the larger heading arrives.

### Award Badge
**Role:** Third-party trust mark — CES Innovation Awards 2024

Fixed bottom-right floater, ~56px square, full-color source artwork preserved (blue/yellow), 4px radius. No border or shadow; acts as a single decorative punctuation mark.

### Footer
**Role:** Minimal site footer

Paper White background, 1px Linen Mist top border, 15px PP Neue Montreal body text in Brushed Steel, single row of links. No social icons, no logo repeat, no newsletter form.

## Do's and Don'ts

### Do
- Set the 57px display wordmark in Paper White directly on the Canvas Gunmetal #9ea29f hero so the type reads as part of the product silhouette rather than floating above it
- Use a single 1px border in Obsidian #000000 or Paper White #ffffff for all interactive elements — never introduce fills, gradients, or shadows on buttons or cards
- Apply 31.35px pill radius exclusively to the primary action button ('Order now'); use 8px radius for every other input, card, and secondary button
- Maintain the 110px vertical section gap between content bands and alternate between Canvas Gunmetal and Paper White to create the gallery rhythm
- Keep body text at 19px / 1.42 and reserve 30px+ sizes for actual section headings — never use the display scale for body copy or UI labels
- Source product photography on Anodized Graphite #4b514d backgrounds so the mailbox material and the UI surface share the same value
- Enable "kern" and "liga" OpenType features on all PP Neue Montreal text to preserve the geometric spacing at large display sizes

### Don't
- Do not introduce any chromatic color — no blues, reds, greens, or purples for buttons, accents, or status states; the system is intentionally achromatic
- Do not use drop shadows, inner shadows, or glow effects on cards, buttons, or images; depth comes from the gunmetal/white alternation only
- Do not set the 57px display type in a condensed, italic, or different font family — PP Neue Montreal Medium at 400 is the only display voice
- Do not use borders thicker than 1px; the entire system relies on hairline structure and thicker rules would break the gallery feel
- Do not place the primary action button as a filled solid — all CTAs remain ghost/outlined so the gunmetal canvas stays visible
- Do not use background colors other than Canvas Gunmetal, Paper White, or Anodized Graphite for full-bleed sections
- Do not break the 4px spacing base; pad and gap values must snap to multiples of 4 (18, 20, 24, 32, 40)

## Elevation

Custo avoids shadows entirely. Depth is communicated through three flat surface values (Canvas Gunmetal → Paper White → Anodized Graphite) and the product's own photographic reflectivity. This is a deliberate material decision — the UI behaves like a printed catalog spread, not a digital app.

## Surfaces

- **Gunmetal Hero Canvas** (`#9ea29f`) — Full-bleed hero and key feature band backgrounds
- **Paper White** (`#ffffff`) — Default content section background — body copy, text-image rows, footer
- **Anodized Graphite** (`#4b514d`) — Dark elevated surface, product photography backdrop, reversed heading text

## Imagery

Imagery is exclusively product photography of the Custo mailbox, shot in three modes: full-body hero portrait on the gunmetal canvas, lifestyle shots showing a person interacting with the unit, and extreme close-ups of the scanning interface and LED ring. All photography shares a desaturated, high-key treatment with the mailbox's matte black finish as the consistent visual anchor. No illustrations, no abstract graphics, no stock photography. Photographs are contained within 8px-radius cards or used full-bleed behind the 57px display wordmark. The CES award badge is the only piece of multicolor artwork on the entire site.

## Layout

The page model is a vertically stacked single column with a max content width of ~1280px centered in the viewport. The hero breaks full-bleed as Canvas Gunmetal #9ea29f from edge to edge, with the mailbox photograph centered-right and the 57px CUSTO® wordmark anchoring the bottom. Below the hero, sections alternate: a 2-column text block (small caption left, large heading right), followed by a horizontal 3-card product image grid, then 2-column text-image rows where body copy alternates sides. Section gaps are 110px, creating strong vertical breathing room. Navigation is a single transparent top bar that becomes Paper White on scroll. The CES badge is a fixed bottom-right floater. The overall rhythm is gallery-like: few elements per section, large type, wide gaps, and the product photograph as the visual punctuation between text bands.

## Similar Brands

- **Teenage Engineering** — Same product-gallery presentation — large wordmark overlapping a single dark product photo, achromatic palette, oversized geometric sans-serif as the primary visual device
- **Nothing.tech** — Shared achromatic industrial product language with the display wordmark treated as a graphic element rather than just a brand mark, monochrome hero with a single physical object
- **Dyson** — Product-as-hero photography on a muted neutral background with a tall display headline and minimal UI chrome — the product's own material finish drives the visual system
- **Bowers & Wilkins** — Same restrained typographic scale, gunmetal-and-white alternation, and the wordmark deployed at architectural size as a near-watermark across hero sections
- **Bang & Olufsen** — Premium hardware brand that lets the product photograph and one oversized display type carry the entire page — no decorative UI elements, no chromatic accents
