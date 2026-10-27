# Woven — Style Reference
> Ink on cream parchment. A distiller's editorial spread where warm cream canvases, a single dark ink color, and wide-tracked uppercase type create the only visual structure; product photography provides all the color.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Woven is an editorial whisky label with a parchment-on-press feel: warm cream canvases, a single dark ink color for every text and hairline border, and generous tracking that lets type breathe like a luxury magazine masthead. The entire interface is monochrome — zero chromatic accent — so product photography (amber bottles, foil caps, liquid) becomes the only color the eye ever sees. Layouts are spacious and centered, with uppercase navigational micro-copy stacked in narrow columns and section headings set far apart from their content. Components stay flat and quiet: white product cards with hairline borders, underlined text links, ghost controls, and no shadows or gradients — the cream surface is the elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Cream | `#eeede5` | Page canvas, footer surface, and dominant background — the warm off-white that gives the entire site its editorial, paper-like feel |
| Ink Black | `#232323` | Primary text, all hairline borders, footer ink, and the near-black that forms every structural line on the page |
| Pure White | `#ffffff` | Product card surfaces, alternating section backgrounds, and high-contrast text on dark or photographic surfaces |
| Iron Gray | `#4a4a4a` | Secondary body text, subdued borders, and the muted text layer that sits between primary ink and background |
| Soft Stone | `#ddddda` | Subtle surface differentiation beneath cards and secondary panels — barely warmer than the cream canvas |

## Typography

### Spezia Semi-Mono — The workhorse typeface for body copy, navigation links, card text, list items, and most UI labels. Semi-mono construction gives it a precise, typeset quality that reinforces the editorial identity. 700 weight is used sparingly for emphasis within mono-spaced blocks.
- **Substitute:** IBM Plex Mono or JetBrains Mono
- **Weights:** 400, 700
- **Sizes:** 12px, 14px, 15px, 16px, 18px, 20px
- **Line height:** 1.20, 1.50, 1.63, 2.40
- **Letter spacing:** 0.063em–0.167em
- **OpenType features:** `"ss01" on, "tnum" on`

### Spezia Medium — Headline and display font — the proportional companion to the Semi-Mono, used for the hero wordmark 'WOVEN' and section titles. Single weight keeps the type system disciplined; contrast comes from size and tracking, not weight.
- **Substitute:** Söhne or Inter Display
- **Weights:** 400
- **Sizes:** 16px, 20px, 24px, 32px
- **Line height:** 1.00, 1.13, 1.20, 1.23, 1.50, 1.63, 1.71, 2.40

### Figtree — Small UI utility font for buttons, icon labels, and tight navigation tags. Rounds out the system where a humanist sans feels warmer than the mono family.
- **Substitute:** Inter or DM Sans
- **Weights:** 400, 700
- **Sizes:** 12px, 14px
- **Line height:** 1.63, 1.71
- **Letter spacing:** 0.083em, 0.167em

### Spezia Semi-Mono Light — Lighter voice for inputs, helper text, and link descriptions — a whisper-weight variation that creates hierarchy without bold.
- **Substitute:** IBM Plex Mono Light or Space Mono Regular
- **Weights:** 400
- **Sizes:** 14px, 15px, 20px
- **Line height:** 1.63, 1.71

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.63 | 1px |
| body-sm | — | — | 14px | 1.71 | 1.17px |
| body-lg | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.2 | 1.26px |
| heading-sm | — | — | 24px | 1.13 | 0px |
| heading | — | — | 32px | 1 | 0px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 120-160px
- **Card padding:** 26px
- **Element gap:** 20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Minimal Header Bar
**Role:** Site-wide navigation

Three-element header: hamburger icon (left, 2px stroke), centered WW wordmark in Spezia Medium 16px, and a thin-line cart icon (right). Sticky transparent overlay on hero, solid #eeede5 on scroll. No background fill, no border — just 40px vertical breathing space with items justified to the edges.

### Hero Overlay Wordmark
**Role:** Full-viewport brand statement

The word 'WOVEN' set enormous (estimated 180–220px) in Spezia Medium, #ffffff at ~60% opacity over a photographic hero, centered both axes. A subtle circular vignette/shadow appears behind the letter O. No CTA, no subhead — the wordmark IS the hero. Below the viewport, a 80–100px band of Parchment Cream (#eeede5) with the label 'EXPERIENCE WHISKY' centered in uppercase 12px Figtree.

### Split Footer-Letterhead Bar
**Role:** Brand seal and category navigation

Circular typographic seal (160px diameter) centered in a cream band, containing stacked uppercase text 'WOVEN / WHISKY MAKERS / THE WORLDWIDE'. Below it, two narrow text-link columns pushed to far left and far right edges: 'WORLDWIDE / WHISKY / MAKERS' and 'BLENDING / BEYOND / BORDERS' — each word on its own line in 12px uppercase, underlined, tracking 0.167em.

### Section Heading Block
**Role:** Subsection label

Single-line uppercase label in Spezia Semi-Mono, 14px, letter-spacing ~1.17px, centered above a section. 40–60px space below before content begins. No decorative rules, no emoji, no subhead — just the label floating in white space on Parchment Cream.

### Latest Releases Dual Card
**Role:** Side-by-side product showcase

Two large product cards side by side, each ~45% page width with 20–26px gap. White (#ffffff) background, 1px #232323 hairline border, 0px radius. Product photo fills the upper 75% of the card edge-to-edge. Below: 20–26px padding with product name (Spezia Semi-Mono 14px uppercase centered) and price (Figtree 12px below). No shadow, no rounded corners.

### Product Range Card
**Role:** E-commerce product tile

Larger card variant for the 'Discover Our Range' section. Full-width product photo (bottle) centered in a #ffffff card with 1px #232323 border, 0px radius. Card name 'HOMEMADE' or 'SUPERBLEND' in 14px uppercase below image, price in £ format (14px) 10px below name. Two cards in a row, 8px gap. Photography fills card edge to edge, no internal padding around the image.

### Underlined Text Link
**Role:** Navigation and category links

Plain text in Spezia Semi-Mono, 12–14px, uppercase, with 1px #232323 underline. No color change, no background — the underline is the entire interactive affordance. Links often break into 2–3 stacked lines for a column-like reading rhythm.

### Ghost Icon Button
**Role:** Cart and menu triggers

24px line-icon buttons in the header — hamburger (2px stroke) and shopping cart. Pure #232323 stroke, no fill, no border-radius, no background. The icon's line weight IS the design.

### Circular Brand Seal
**Role:** Decorative wordmark medallion

~160px diameter circle, 1px #232323 border, no fill. Contains text set on a circular path and stacked horizontal lines reading 'WOVEN / WHISKY MAKERS / THE WORLDWIDE'. Appears centered at the top of secondary pages. Pure typographic — no illustration, no ornament.

### Image Container
**Role:** Product photography frame

Photographs of amber glass bottles set against neutral studio backgrounds. Displayed edge-to-edge inside cards with no internal padding, no border-radius. Photography is the only source of color in the system — the warmer the light on the bottle, the more visual energy the page carries.

## Do's and Don'ts

### Do
- Use Parchment Cream (#eeede5) as the page canvas for every primary section; alternate to pure white (#ffffff) only for product card surfaces and one or two contrast bands
- Set all body and UI text in Spezia Semi-Mono, 14–15px, with letter-spacing of 0.063–0.094em for uppercase labels and 0.121–0.167em for nav and tag text
- Use 1px #232323 hairlines for every border — cards, product frames, footer rules, link underlines — never use any other color for borders
- Keep corner radius at 0px for all cards, buttons, tags, inputs, and images; the system relies on sharp edges, not curves
- Center section headings in uppercase Spezia Semi-Mono 14px and let 40–60px of vertical space do the visual separation work
- Use Spezia Medium at 32px+ for all display headlines and the wordmark; this is the only proportional (non-mono) face in the system
- Break multi-word links into one-word-per-line stacked columns to create the editorial columnar rhythm in header and footer areas
- Let product photography provide all color in the system; never introduce chromatic accents, gradients, or brand colors

### Don't
- Never add a chromatic accent color, gradient, or brand fill — the system is 0% colorful by design
- Never use rounded corners on cards, buttons, inputs, or images — 0px radius is intentional and defines the editorial print look
- Never apply box-shadow, drop-shadow, or blur effects — surfaces separate through color and hairline borders only
- Never use bold (700) weight for body paragraphs; reserve 700 for short emphasized spans within mono text blocks
- Never set headings left-aligned with body copy; section titles are always centered with generous vertical space above and below
- Never introduce an icon system with fills, duotones, or color — icons are single-weight 1.5–2px #232323 line work only
- Never place text directly on a product photograph without a cream or white surface underneath; readability requires a solid layer
- Never use display sizes below 32px for the wordmark or section openers; the type scale's authority comes from its restraint at small sizes and generosity at large ones

## Elevation

The design system deliberately avoids all shadow, blur, and glow effects. Surface hierarchy is communicated entirely through flat color layering — Parchment Cream for canvas, Pure White for cards, and 1px Ink Black hairlines for boundaries. This produces a print-editorial feel where depth comes from typographic scale and whitespace, not from elevation effects.

## Surfaces

- **Parchment Canvas** (`#eeede5`) — Dominant page background, footer surface, hero letterhead band
- **Pure White Card** (`#ffffff`) — Product card surfaces, alternating section backgrounds, contrast bands
- **Soft Stone** (`#ddddda`) — Subtle panel differentiation beneath elevated sections
- **Ink Black** (`#232323`) — Inverted dark surface for footer ink or night-mode treatment

## Imagery

The visual language is dominated by product photography of whisky bottles — amber and olive-green glass, foil caps, paper labels, liquid catches the light. Photographs are set against clean neutral studio backgrounds (light gray, off-white) and displayed edge-to-edge inside sharp-cornered product cards with no internal padding or border-radius. There is no lifestyle photography, no human subjects, no environmental context — the bottle IS the hero. Decorative graphics are limited to the circular typographic seal. Photography is the only source of color in an otherwise strictly monochrome system, so the warmer the bottle photography, the more visual energy any given page carries.

## Layout

Layouts are max-width contained (centered, ~1200–1280px) and overwhelmingly centered/symmetric rather than asymmetric. The hero is a full-bleed photographic background with a centered oversized wordmark overlay and a 80–100px cream letterhead band beneath. Below the fold, sections stack vertically with 120–160px of vertical breathing space between them, each section introduced by a single centered uppercase label. Content within sections tends toward two-column symmetry: split text-link columns pushed to far edges, paired product cards, or the centered circular seal. Card grids are consistently 2-column on desktop, with generous 20–26px gutters and 1px borders. Navigation is a single minimal header bar — hamburger, centered wordmark, cart icon — with no mega-menu, no sidebar, and no sticky behavior beyond a tonal shift. The overall rhythm is that of a luxury magazine spread: whitespace, centered type, paired imagery, no visual clutter.

## Similar Brands

- **Aesop** — Same editorial restraint with cream-on-ink typographic system, no chromatic accent, and product photography as the only source of color
- **Aēsop / Le Labo style apothecary sites** — Same warm cream canvas, hairline 1px borders, sharp 0px corners, and generously tracked uppercase micro-copy for navigation
- **Hendrick's Gin** — Same monochrome editorial mood with amber-bottle photography as the sole color source and circular typographic seal as a brand mark
- **The Macallan** — Same luxury whisky-editorial language: restrained cream backgrounds, centered single-line section labels, and product cards with hairline borders and no decoration
- **Aram (design store)** — Same warm-neutral monochrome layout philosophy with sharp-cornered product cards, wide-tracked uppercase labels, and whitespace-driven hierarchy
