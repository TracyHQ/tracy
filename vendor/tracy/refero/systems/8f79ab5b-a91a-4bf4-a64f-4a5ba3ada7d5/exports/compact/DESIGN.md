# Tailwind CSS — Style Reference
> Type specimen as product demo — a typographer's proof sheet where the headline IS the interface, bold black at 96px demanding attention through size alone.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tailwind CSS's homepage feels like a live code editor bleeding into a marketing page — black type hammered at near-display scale, monospace code fragments interrupting prose, and a white canvas that never apologizes for its blankness. The near-black #030712 dominates everything: headings, body copy, borders, and buttons all collapse toward the same ink-black anchor, creating a stark tonal discipline rarely seen on developer tools sites that usually reach for blue. The signature move is scale contrast: 96px Inter at weight 700 next to 14px monospace code, the size gulf doing all the visual work that color usually handles. Accent colors (sky blue #00a6f4, hot pink #e60076) appear exclusively inside inline code snippets as syntax highlights, never as UI chrome — they're content, not decoration. The color palette swatch section generates a systematic rainbow of every Tailwind hue, but the actual UI uses only ink-black, white, and near-grays.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#030712` | Primary text, borders, button backgrounds, and icon fills — the near-black with a trace of blue that reads as absolute black in context |
| Slate Mist | `#4a5565` | Secondary body text and icon fills |
| Slate Mid | `#6a7282` | Tertiary text, muted labels |
| Slate Cool | `#364153` | Subdued body copy and link text |
| Steel Veil | `#90a1b9` | Placeholder text, de-emphasized borders |
| Fog Line | `#cad5e2` | Subtle dividers and input outlines |
| Slate Deep | `#1e2939` | Dark surface borders, code window chrome |
| Pure White | `#ffffff` | Page background, button text on black, card surfaces |
| Off White | `#bfbfbf` | Inset ring shadows on image and card surfaces |
| Syntax Sky | `#00a6f4` | Syntax highlight for class names in code demos — sky blue signals utility class tokens specifically |
| Syntax Cyan | `#74d4ff` | Secondary code token highlight, icon fills in dark code windows |
| Syntax Rose | `#e60076` | Syntax highlight for property values and inline class references in body copy — vivid red-pink against white makes code fragments immediately scannable |
| Neon Pink | `#f6339a` | Secondary accent in inline code badges and color swatch demos |
| Electric Violet | `#e12afb` | Tertiary syntax accent in code blocks |
| Mint Glow | `#96f7e4` | Teal syntax highlight in dark code editor sections |
| Ocean Depth | `#00598a` | Inline link color in body text |
| Blush Silk | `#fb64b6` | Color palette demo swatches — pink row |
| Powder Blue | `#bedbff` | Muted blue syntax tokens in dark code blocks |

## Typography

### Inter — Every UI element — from 96px hero headline to 12px nav labels. Weight 700 at 96px is the defining visual statement; the same family at 400/14px handles footnotes, creating a 8:1 weight-to-size hierarchy within a single typeface. The letterSpacing at -0.05em tightens display sizes, pulling characters together at scale.
- **Substitute:** Inter (Google Fonts — this is already Inter)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 20px, 24px, 30px, 36px, 40px, 96px
- **Line height:** 1.00–2.00 (tightest at large display sizes, 1.5–1.75 at body sizes)
- **Letter spacing:** -0.05em (applied globally; at 96px = ~-4.8px, at 40px = -2px, at 16px = -0.8px)
- **OpenType features:** `"cv02", "cv03", "cv04", "cv11"`

### IBM Plex Mono (plexMono) — All code blocks, inline code badges, and the live editor demo sections. The +0.1em letter-spacing is deliberate — monospace with tracking creates visual distance from prose, immediately signaling 'this is code'. Used exclusively at small sizes (12–17px), never for headings.
- **Substitute:** IBM Plex Mono (Google Fonts)
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 17px
- **Line height:** 1.33–2.15 (loose line height for code readability)
- **Letter spacing:** +0.1em (at 14px ≈ +1.4px — unusually open for code, widens the visual gap between code and prose)
- **OpenType features:** `"ss02", "zero"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body | — | — | 14px | 1.71 | — |
| heading-sm | — | — | 20px | 1.4 | — |
| heading | — | — | 30px | 1.33 | -1.5px |
| heading-lg | — | — | 40px | 1.2 | -2px |
| display | — | — | 96px | 1 | -4.8px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 16px
- **cards:** 8px
- **modals:** 12px
- **buttons:** 32px (pill CTA), 4px (code/tag badges)
- **codeBlocks:** 8px

## Components

### Primary CTA Button
**Role:** Main calls to action — 'Get started', 'Become a sponsor'

Black (#000000) background, white text, 32px border radius (pill shape), 8px top/bottom padding, 16px left/right padding. Inter 400 at 14px. No border visible — the fill is the form. High contrast 21:1 against white backgrounds. The pill shape is the only rounded UI element at this scale.

### Dark Code Badge Button
**Role:** Version label and secondary tags inside dark sections

Nearly transparent dark background (oklab ~5% black), white text, 4px border radius, 4px vertical padding, 8px horizontal padding. 1px inset white shadow at 5% opacity creates a subtle border without a hard color. Inter 400 at 13px.

### Ghost Dark Button
**Role:** Secondary actions within dark code editor UI

Transparent background, white text, 4px radius, 4px/8px padding. 1px inset white border at full opacity. Identical shape to Dark Code Badge but with fully opaque border, making it read as outlined rather than ghosted.

### Version Pill Badge
**Role:** Current version tag in navigation (v4.2)

~5% black background on light page, near-black text (#030712), 16px border radius, 2px top/bottom padding, 10px left padding, 6px right padding. Inset 1px ring shadow in near-black at 5% opacity. Inter at 13px weight 500.

### Inline Code Tag
**Role:** Class name references in body text (flex, pt-4, text-center)

Colored text (Syntax Sky #00a6f4, Syntax Rose #e60076, or Mint Glow #96f7e4 depending on token type) on white background. No background fill on the tag itself — color alone signals code. IBM Plex Mono at 14px with +0.1em letter-spacing and 'ss02'/'zero' features.

### Search Input Bar
**Role:** Quick search command palette trigger in header

Transparent background, 0px border radius, no visible padding. Black text (#000000) with keyboard shortcut hint (⌘K) in Slate Mid (#6a7282). No box shadow or border in rest state — completely borderless, distinguished only by a search icon and the shortcut badge.

### Sponsor Logo Card
**Role:** Partner and sponsor logos in the 'Supported by the best' section

White background, no border or shadow. Black monochrome logo treatment — all sponsor logos rendered in solid black (or close to it) against white. Logos displayed at ~40–60px height in a 4-column responsive grid with 24px column gap. No hover state visible.

### Navigation Bar
**Role:** Top sticky header with brand, links, and utilities

White background, full width. Tailwind CSS logomark left-aligned. Nav links (Docs, Blog, Showcase, Sponsor) in Inter 400 14px, Ink Black (#030712). 'Plus' link rendered as a bright blue pill badge. GitHub icon and search icon at right. 8px gap between items. No bottom border or shadow — floats above content.

### Section Label
**Role:** Eyebrow text above section headings ('SPONSORS')

All-caps, Inter 600 at 12px, tracking wider. Syntax Sky (#00a6f4) or brand accent color. Placed 8px above the section heading. Signals section identity without competing with the heading weight.

### Card with Inset Ring Shadow
**Role:** Image cards and UI preview cards throughout the page

White or near-white background, 8px border radius, inset shadow: `oklab(0.129999 -0.00404751 -0.027702 / 0.1) 0px 0px 0px 1px inset` — a 1px near-black ring at 10% opacity. This replaces a border entirely; the shadow approach means no box-model interference with layout. No outer drop shadow.

### Card with Elevation Shadow
**Role:** Elevated cards that need more depth (overlaid preview cards)

White background, 8px radius. Compound shadow: `oklab(white/0.2) 0px 0px 0px 1px inset, oklab(black/0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px -1px`. Inner white ring + outer dark ring + 1-3px drop shadow. Depth without dramatic lifting.

## Do's and Don'ts

### Do
- Use Inter with font-feature-settings: '"cv02", "cv03", "cv04", "cv11"' at all sizes — these alternates are non-negotiable for Tailwind's typographic identity.
- Apply -0.05em letter-spacing globally on Inter text; at 96px this compresses to ~-4.8px, giving display text the tightly-set newspaper feel visible in the hero.
- Use the inset 1px ring shadow (`oklab(0.129999 -0.00404751 -0.027702 / 0.1) 0px 0px 0px 1px inset`) instead of CSS borders on cards — this prevents layout shift and matches the exact surface treatment used throughout.
- Reserve 32px pill-radius buttons exclusively for primary CTAs; use 4px radius for all secondary tags, version badges, and code labels.
- Render inline code references with IBM Plex Mono at +0.1em letter-spacing and features '"ss02", "zero"' — the wide tracking visually separates code tokens from surrounding prose at a glance.
- Use syntax colors (#00a6f4, #e60076, #96f7e4) ONLY inside code blocks and inline code references — never as UI chrome, button colors, or decorative fills.
- Place section eyebrow labels in all-caps Inter 600 at 12px in Syntax Sky (#00a6f4) — this is the only recurring non-black UI element on the marketing page.

### Don't
- Don't use any background color other than #ffffff or #030712-family darks for page sections — the entire marketing site alternates between pure white and near-black; any mid-gray background breaks the tonal discipline.
- Don't use rounded corners larger than 8px on cards or content containers — only pill buttons (32px) and version badges (16px) use high-radius; cards stay at 8px.
- Don't apply accent colors (sky blue, hot pink, mint) to navigation items, headings, or UI buttons — they belong exclusively in code syntax contexts.
- Don't use IBM Plex Mono for anything except code blocks and inline code badges — no headings, nav items, or body copy should appear in monospace.
- Don't add drop shadows to sponsor logos or section-level card grids — the inset ring shadow is the only depth signal; external shadows are reserved for elevated overlay cards only.
- Don't set heading weights below 700 at display sizes — the hero's authority comes entirely from weight-plus-scale, not color or decoration.
- Don't introduce gradients into UI chrome — the extensive gradient color data represents the Tailwind color palette documentation swatch system, not page decoration.

## Elevation

Tailwind CSS marketing uses inset ring shadows instead of traditional drop shadows for most components. A 1px inset shadow at 10% black opacity (`oklab(0.129999 -0.00404751 -0.027702 / 0.1) 0px 0px 0px 1px inset`) defines card boundaries without adding visual mass. Only truly elevated elements (overlaid preview cards) add a minimal 1–3px drop shadow alongside the ring. This matches the framework's philosophy of composable, low-specificity primitives — shadows define edges rather than assert depth.

## Surfaces

- **Page Canvas** (`#ffffff`) — Primary marketing page background — pure white, no tint
- **Code Editor Dark** (`#030712`) — Dark code demo blocks, simulating a terminal or code editor window
- **Card Surface** (`#ffffff`) — White cards with inset 1px ring shadow to lift from page canvas
- **Elevated Overlay** (`#ffffff`) — Cards with compound inset+outer shadow for maximum elevation

## Imagery

Product UI screenshots and live code editor demos dominate — no lifestyle photography anywhere. The hero section shows an actual HTML file in a dark code editor window with real Tailwind classes highlighted in syntax colors, making the product the hero literally. A secondary card shows a real-world UI output (a product card with photography), demonstrating the output of writing those classes. Photography within demo cards is tight editorial product shots (album covers, property images), displayed in rounded-corner containers (8px) with inset ring shadows — the photography is always framed, never full-bleed. Icon style is filled/solid, monochromatic black, at 16–20px. The color palette section uses flat solid color swatches in a systematic grid — no gradients or imagery, pure chromatic data visualization. Overall image density is low — wide text-dominant whitespace with one large code demo occupying roughly 40% of the first viewport's lower half.

## Layout

Max-width contained (~1280px) centered on white. Hero is asymmetric: headline text at full-width left-aligned (not centered), with two demo cards floating to the right and overlapping partially offscreen — creating a deliberate bleed that suggests the framework is bigger than the viewport. The hero headline occupies 60% of viewport width at display size. Section rhythm is consistent white bands with 96px vertical gaps — no alternating dark/light banding in the marketing sections (the dark is reserved for the embedded code editor block, not full-width section backgrounds). Sponsor logos in a 4-column grid with generous whitespace between items. Navigation is a flat top bar, not sticky based on screenshot evidence, with logo left, links right, and utility icons far-right. Content arrangement below the fold switches to centered headings with left-aligned supporting text — a subtle asymmetry that prevents monotony. Zero sidebar usage on the marketing page.

## Similar Brands

- **Vercel** — Same ink-black (#000) dominant palette with pure white backgrounds, pill-shaped primary buttons, and Inter as the sole UI typeface — both treat type scale as the primary design tool
- **Linear** — Monochromatic near-black text system with a single vivid accent that appears in specific contexts only, never as general UI chrome
- **Radix UI** — Developer tool marketing using live code demos as hero content, dark code blocks floating over white, and monospace syntax highlighting as the primary visual decoration
- **Shadcn/ui** — Same Inter + monospace code pairing, inset ring shadows instead of borders, and black/white tonal discipline with zero mid-gray backgrounds
