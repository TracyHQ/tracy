# Mage — Style Reference
> data alchemy on parchment. Warm off-white canvas, whisper-weight Inter headlines, one cobalt switch for action, dark-mode product islands floating inside a bright editorial page.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mage operates on a warm parchment canvas (#f7f7f1) that gives the data-platform brand an editorial, almost lab-notebook warmth rather than the cold gray most SaaS tools default to. The interface is deliberately quiet: soft cards on a warm white field, generous breathing room, and a single vivid electric-cobalt accent (#244cff) that acts as a switch — it appears only on primary actions, nowhere else. Typography is Inter-only, used at restrained weights (400 dominates even at display sizes), which makes the large headlines feel declarative rather than shouting. Product surfaces (the pipeline editor) are dark-mode islands embedded inside the light page, creating a clear visual contract: marketing context is warm-paper light, working context is deep-graphite dark. Decorative violet (#c3aeff) threads through the brand illustration as a secondary color note, never as UI chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Cobalt | `#244cff` | Primary action fill — CTA buttons, active nav state, the single switched-on color in an otherwise muted system |
| Lavender Mist | `#c3aeff` | Brand illustration accent — decorative fills in the hero artwork and supporting graphics, echoes the cobalt at lower saturation |
| Parchment | `#f7f7f1` | Page canvas — warm off-white background that gives the whole site its editorial, paper-like quality |
| Snow | `#ffffff` | Card surfaces, text on dark backgrounds, product thumbnail containers |
| Ice Wash | `#e8f8ff` | Tinted card surface — subtle blue-white variant for differentiated cards (logo bar, feature callouts) |
| Sky Tint | `#d6f2ff` | Decorative card wash — pale blue background for illustration overlays and feature card accents |
| Lemon Wash | `#ffffbd` | Decorative card wash — warm yellow tint for illustration card backgrounds and feature highlights |
| Blush | `#fcc2cd` | Decorative card wash — soft pink for illustration card backgrounds |
| Buttercream | `#fced9f` | Decorative card wash — warm cream-yellow for illustration card backgrounds |
| Azure | `#3388ff` | Illustration accent — mid-blue used in hero artwork and data visualization elements |
| Slate Blue | `#5487a1` | Illustration accent — muted blue for decorative borders and secondary graphic elements |
| Amber | `#9e770b` | Illustration accent — warm dark-yellow for decorative graphic elements |
| Lilac Pop | `#ba9ffc` | Illustration accent — vivid lavender for hero artwork highlights |
| Deep Cobalt | `#294dba` | Illustration accent — darker blue for hero artwork depth and contrast |
| Pure Black | `#000000` | Primary text, hairline borders, high-contrast edges |
| Graphite | `#2b2b2b` | Secondary text, body copy on light surfaces — softer than pure black for reading comfort |
| Obsidian | `#1d1f21` | High-contrast neutral action fill for primary buttons on light surfaces. |
| Ash | `#878787` | Muted text — captions, helper text, secondary metadata |
| Fog | `#b0b0b0` | Borders, dividers, disabled state outlines, muted link text |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Inter — Workhorse body and UI text — body copy at 400, buttons/labels at 500-600, bold callouts at 700. The font's open apertures and tall x-height make it readable at 12-16px on the warm canvas
- **Substitute:** system-ui, -apple-system, 'Segoe UI', sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 13px, 15px, 16px, 17px, 18px, 21px, 22px, 24px
- **Line height:** 1.20-1.65
- **OpenType features:** `"cv03", "cv04", "cv09", "cv11", "blwf"`

### Inter Variable — Display and heading sizes — 60px display headlines, 38px section headers, 30px subheadings. Weight stays at 400 even at display size: the headlines whisper rather than shout, authority through scale not weight
- **Substitute:** Inter (static weights)
- **Weights:** 400
- **Sizes:** 20px, 22px, 30px, 38px, 60px
- **Line height:** 1.30-1.40

### Geist — Small bold labels — compact uppercase-style tags and category markers at 14px weight 600
- **Substitute:** Inter 600
- **Weights:** 600
- **Sizes:** 14px
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| body-lg | — | — | 18px | 1.5 | — |
| subheading | — | — | 22px | 1.3 | — |
| heading-sm | — | — | 24px | 1.3 | — |
| heading | — | — | 30px | 1.4 | — |
| heading-lg | — | — | 38px | 1.3 | — |
| display | — | — | 60px | 1.3 | — |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24-40px
- **Element gap:** 10px

### Border Radius

- **cards:** 6px
- **images:** 16px
- **buttons:** 100px
- **largeSurfaces:** 12px

## Components

### Primary CTA Button
**Role:** High-emphasis action — 'Start Building', form submissions

Electric Cobalt #244cff background, white text, Inter 500 at 15-16px, pill radius (100px), padding 12px 24px. The single vivid color in the system — every primary action uses this exact shade. No hover darkening needed at this saturation; it already commands attention.

### Dark CTA Button
**Role:** Secondary high-emphasis — 'Try Mage' in nav, product entry points

Obsidian #1d1f21 background, white text, Inter 500 at 15-16px, pill radius (100px), padding 8px 16px. Used for the persistent product-access button in the nav bar. The dark-on-warm-white contrast creates a different kind of urgency than the cobalt — more 'enter the tool' than 'start here'.

### Ghost Text Link
**Role:** Low-emphasis action — 'Get a demo', inline navigation

No background, Graphite #2b2b2b text, Inter 500 at 15-16px. Sits beside filled CTAs as the secondary path. Underline appears on hover only.

### Navigation Bar
**Role:** Top-level site navigation

Transparent over Parchment #f7f7f1 canvas. Left: Mage logo (custom mark) + nav links (Platform, Solutions, Resources, Pricing, Try) in Inter 500 at 15px. Right: 'Demo' ghost link + 'Try Mage' dark pill button. No background fill, no border — the bar relies on whitespace and the warm canvas to separate from content below.

### Hero Product Thumbnail
**Role:** Embedded product preview in the hero section

Dark-mode product UI screenshot (Obsidian #1d1f21 surface) inside a Snow #ffffff container with 16px radius. Central play button overlay (white circle with cobalt play icon) signals video. The dark product island inside the warm light page is the signature visual contrast — 'here is where the work happens'.

### Trust Logo Bar
**Role:** Social proof — 'Trusted by data teams at leading companies'

Horizontal strip of company logos (Samsung, Stability.ai, Comcast, IBM, etc.) on Parchment #f7f7f1 canvas. Logos rendered in Pure Black or Graphite. The logos themselves sit on subtle individual card containers with 6px radius and Ice Wash #e8f8ff or Parchment backgrounds.

### Feature Card (Product Screenshot)
**Role:** Feature showcase — 'Build pipelines', 'Connect data', 'Run continuously', 'Fix and recover'

Two-column layout: heading (Inter 400 at 18-22px) + subtext (Inter 400 at 16px, Graphite) above a dark-mode product screenshot with 6px radius. The screenshot shows the pipeline editor with dark sidebar and monospace code. The dark product image anchors each card and signals 'this is real, working software'.

### Section Heading Group
**Role:** Section titles and descriptions

Inter Variable 400 at 38px for the section title, Inter 400 at 16-18px Graphite for the subtitle. The 38px headline at weight 400 is the signature: no bold, no uppercase, no decorative flourishes — just scale and Inter's geometric clarity doing the work.

### Illustration Overlay
**Role:** Decorative hero artwork — people interacting with a data orb

Full-color custom illustration: characters in varied clothing (coral, yellow, purple, teal) around a central blue spherical data object with circuit patterns. Uses the illustration palette: Lavender Mist #c3aeff, Azure #3388ff, Blush #fcc2cd, Buttercream #fced9f. Sits to the right of the hero text, roughly 50% of viewport width.

### Data Source Icon Grid
**Role:** Integration showcase within the product UI

Grid of colorful integration logos (PostgreSQL, MongoDB, etc.) visible in the 'Connect data' product screenshot. Each icon is a rounded square with the brand's native color. This is product UI content, not design system chrome.

## Do's and Don'ts

### Do
- Use Electric Cobalt #244cff exclusively for primary action fills — never as a decorative element or text color
- Set all buttons to pill radius (100px) for both the cobalt primary and obsidian dark variants
- Keep headlines at Inter weight 400 — authority comes from size (38px section, 60px display), not weight
- Use Parchment #f7f7f1 as the page canvas for all marketing pages; reserve Snow #ffffff for elevated cards and containers
- Embed dark-mode product screenshots (#1d1f21 surface) as visual anchors inside the light page — this light-dark contrast is the signature
- Apply Inter font features "cv03", "cv04", "cv09", "cv11" to get the alternate glyph sets that distinguish Mage's Inter from default Inter
- Use 6px radius for cards and product thumbnails, 16px for larger image containers, 100px (pill) for all interactive controls

### Don't
- Do not use multiple vivid colors as action buttons — the system has one action color (cobalt) and one dark variant; everything else is text or surface
- Do not set headlines to weight 600 or 700 — the whisper-weight 400 at large size is the signature; bolding breaks the editorial tone
- Do not add drop shadows to cards on the Parchment canvas — the warm tonal contrast between #f7f7f1 and #ffffff is enough separation
- Do not use the illustration palette colors (#fcc2cd, #fced9f, #ba9ffc) as UI chrome — they are reserved for the hero artwork and decorative card washes
- Do not mix Light Slate Blue #5487a1 or Amber #9e770b into text or border roles — they are illustration-only accents
- Do not use sharp corners (0px radius) on cards or images — the 6px minimum radius is a system-wide baseline
- Do not put body text below 14px — the Inter 12px usage is limited to micro-labels and metadata, never running prose

## Surfaces

- **Parchment** (`#f7f7f1`) — Page canvas — the warm off-white base of all marketing pages
- **Snow** (`#ffffff`) — Card surfaces, elevated containers, product thumbnails
- **Ice Wash** (`#e8f8ff`) — Tinted card surface for differentiated sections (logo trust bar, feature callouts)
- **Obsidian** (`#1d1f21`) — Dark-mode product UI — the code editor and pipeline builder embedded as screenshots

## Imagery

Hero features a large custom illustration: 3-4 illustrated characters in colorful casual clothing (coral pants, yellow tops, purple overalls) interacting with a central blue spherical data object with circuit-board patterns. The illustration uses the brand's decorative palette (lavender, azure, blush, buttercream) and occupies the right half of the hero. Product screenshots are dark-mode (graphite sidebar + code editor) with vibrant integration logos in a grid. No photography. No abstract gradients or 3D renders beyond the illustration. Icon style in the UI is a mix: product UI uses small monospace-style code icons; the illustration uses flat filled shapes with no outlines.

## Layout

Max-width 1200px centered content. Hero is a two-column split: left ~40% holds headline + subtext + CTAs + a dark product video thumbnail stacked vertically; right ~55% holds the full-color illustration. Below the hero, a full-width trust logo bar spans the content width. Feature sections use a 2x2 grid: each cell has a heading + subtext on top, dark product screenshot below with 6px radius. The page alternates between warm-canvas sections and slightly different surface tints (Ice Wash) for visual separation. Navigation is a simple top bar with left-aligned logo + links, right-aligned CTA pair. No sidebar, no mega-menu. Section gaps are generous (~64px) creating a comfortable editorial rhythm rather than a dense product-grid feel.

## Similar Brands

- **Vercel** — Same single-accent-plus-black approach with whisper-weight headlines and a warm off-white canvas; both use a dark-mode product surface inside a light marketing page
- **Linear** — Similar pill-radius buttons, generous whitespace, Inter typography at restrained weights, and a dark product island embedded in light marketing context
- **Airplane** — Same warm off-white canvas, Inter type system, single vivid accent color for primary actions, and dark-mode product screenshots as feature anchors
- **PlanetScale** — Light editorial canvas with dark product UI previews, generous section spacing, and a single saturated brand color for action
- **Modal** — Similar data-platform identity with light parchment-toned pages, custom illustration as hero centerpiece, and dark product UI as feature evidence
