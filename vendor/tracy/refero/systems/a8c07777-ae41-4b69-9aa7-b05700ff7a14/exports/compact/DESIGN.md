# NEAR — Style Reference
> Emerald constellation on obsidian void — a black chamber where geometric star-crosses hover like fiber-optic nodes, and a single neon green pulse is the only color that matters.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

NEAR operates as a void-and-signal system: an obsidian canvas scattered with glowing emerald star-cross particles, interrupted by flat mint-green full-bleed bands and a repeating "AI" text-tile that functions as a signature wallpaper. Typography is geometric and confident — FKGrotesk at 80px for display headlines holds weight 500, bold through scale not heft, and tight tracking keeps blocks dense. Color discipline is total: pure black, pure white, and one vivid neon green (#00ec97) carry every functional role, with a softer sage (#c7f5d8) reserved exclusively for full-bleed light sections. Components are sharp and flat — 4px radii dominate, borders are 1px hairlines, shadows are absent, and elevation comes from color contrast and section rhythm rather than depth. The page alternates dark and light bands deliberately, making each section transition a moment of contrast rather than a fade.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text on light surfaces, dark section backgrounds, inverse text on light cards — the void that carries the constellation |
| Paper White | `#ffffff` | Light section text on dark backgrounds, card surfaces, button backgrounds on dark hero — the positive space |
| Hairline Gray | `#e5e7eb` | Hairline borders, dividers, card outlines — the most-used neutral at 1500+ occurrences forms the structural skeleton |
| Mid Gray | `#757575` | Secondary text, muted link borders, disabled states, tertiary metadata |
| Warm Bone | `#f2f1e9` | Input field borders, warm off-white fills — a slight warm shift from the achromatic scale |
| Ash | `#acaba6` | Tertiary borders, muted icon fills — the quietest neutral in the system |
| Signal Green | `#00ec97` | Primary action buttons, active link backgrounds, accent text, and any element that must pulse — the only chromatic function color in the system |
| Mint Sage | `#c7f5d8` | Full-bleed light section backgrounds — a flat, desaturated mint that reads as ambient rather than decorative, providing visual rest between dark bands |
| Teal Pulse | `#17d9d4` | Secondary accent within the AI text-tile pattern and illustration details — cool teal offset against Signal Green adds chromatic depth without competing |

## Typography

### FKGrotesk — Primary typeface for all UI, headings, and body — a geometric grotesque that handles the extreme 16-to-80px range without losing character. Weight 500 carries display headlines, allowing scale (80px) to do the work that weight 700 would do in a conventional system. The tight letter-spacing and near-1.0 line-height at large sizes make headlines feel architectural rather than editorial.
- **Substitute:** Space Grotesk or Inter
- **Weights:** 400, 500, 700
- **Sizes:** 16, 20, 24, 44, 64, 80
- **Line height:** 1.0–1.5

### Mona Sans — Caption/eyebrow labels and micro-copy — weight 600 at 12px creates compact, all-caps-feeling tags that sit beside larger FKGrotesk text as functional punctuation
- **Substitute:** Inter or IBM Plex Sans
- **Weights:** 600
- **Sizes:** 12
- **Line height:** 1.17

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.17 | 0px |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.25 | — |
| heading | — | — | 44px | 1.09 | — |
| heading-lg | — | — | 64px | 1.09 | — |
| display | — | — | 80px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24-32px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 4px
- **cards:** 4px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Primary Signal Button
**Role:** Main call-to-action on light sections

Filled with Signal Green (#00ec97), black text at 16px FKGrotesk weight 500, 4px radius, padding 16px 24px. Used sparingly — this button should appear once per screen maximum, the rest of the action language stays neutral.

### Inverse Primary Button
**Role:** Main action on dark sections

White fill (#ffffff), black text, same 4px radius and 16px 24px padding as Signal Button. The dark-section counterpart — when a primary action appears on the void, it inverts to white rather than staying green, preserving the green's status as accent.

### Ghost Outline Button
**Role:** Secondary action on dark sections

Transparent background with 1px white border, white text, 4px radius, 16px 24px padding. Pairs beside the Inverse Primary Button as a quiet secondary — e.g. the Builders/Resources pair on the hero.

### Neutral Border Button
**Role:** Secondary action on light sections

Transparent background with 1px Hairline Gray (#e5e7eb) border, black text, 4px radius, 16px 24px padding.

### Top Navigation Bar
**Role:** Persistent site navigation

Horizontal bar on dark/void background, 64px tall, NEAR wordmark and N monogram on left, nav items right-aligned in 16px FKGrotesk weight 400 white text with chevron dropdowns. No background fill — the nav floats on whatever section is behind it.

### Constellation Hero
**Role:** First-viewport brand statement

Full-bleed Obsidian (#000000) background overlaid with a field of glowing emerald star-cross particles (randomized opacity and scale). Display headline 80px FKGrotesk weight 500 white, centered, with 16px subtitle at weight 400 in #757575 or white. Two buttons centered below at 24px gap.

### Mint Vision Band
**Role:** Full-bleed editorial section

Mint Sage (#c7f5d8) background, max-width 1200px centered content. Headline 64px FKGrotesk weight 500 in black, body 16px weight 400 in black, comfortable line-height 1.5. Acts as a visual exhale between dark bands.

### AI Text Tile
**Role:** Signature decorative wallpaper

Repeating grid of the letters "AI" set in FKGrotesk weight 500, alternating white and Signal Green (#00ec97) in a deliberate checkerboard pattern on Obsidian background. Functions as a full-bleed section divider and brand signature — appears at least once per page.

### Crystalline Accent Graphic
**Role:** 3D illustration accent

Geometric gem/crystal forms in Signal Green (#00ec97) gradients, rendered with sharp angular facets. Used as floating elements beside content blocks — 2-3 per page maximum, each roughly 200-300px wide.

### Content Card
**Role:** Feature or content container

White (#ffffff) or Obsidian (#000000) fill, 1px Hairline Gray (#e5e7eb) border on light or transparent on dark, 4px radius, 24-32px padding. No shadow — elevation comes from the 1px hairline and color contrast.

### Input Field
**Role:** Text input

Transparent or Warm Bone (#f2f1e9) fill, 1px Hairline Gray border, 4px radius, 12px 16px padding, 16px FKGrotesk weight 400 text. Focus state shifts border to Signal Green.

### Footer Band
**Role:** Site footer

Obsidian background, repeating the AI Text Tile pattern at lower opacity. Footer links and legal text in 12-14px FKGrotesk weight 400 in Mid Gray (#757575).

## Do's and Don'ts

### Do
- Use #00ec97 Signal Green exclusively for primary actions, active states, and the AI Text Tile pattern — never as a decorative background fill or large surface color
- Alternate full-bleed dark (#000000) and light (#c7f5d8 or #ffffff) sections to create rhythm — every page should have at least one dark-to-light transition
- Set all radii to 4px — buttons, inputs, cards, tags. The flatness is the brand.
- Use FKGrotesk weight 500 for all display headlines (44px+) — let scale do the emphasis, not weight
- Place the AI Text Tile pattern at least once per page as a brand signature, either as a section divider or footer band
- Use 1px #e5e7eb hairlines to define card edges on light surfaces — never use box-shadow for elevation
- Constrain content to max-width 1200px centered, but let section backgrounds run full-bleed to the viewport edges

### Don't
- Do not introduce additional accent colors — Signal Green is the only chromatic function color; Teal Pulse appears only in the AI tile and illustrations
- Do not use box-shadow or drop-shadow effects anywhere — elevation is achieved through color contrast and section rhythm only
- Do not use radii larger than 4px for UI components — no pill buttons, no rounded cards, no 8px+ corners
- Do not use FKGrotesk weight 700 for headlines — weight 500 at scale is the signature; reserve 700 for inline emphasis only
- Do not place Signal Green buttons on dark sections — invert to white fill instead, preserving green's role as light-section accent
- Do not use photography or lifestyle imagery — the visual language is constructed from typography, geometry, and the green-on-black relationship
- Do not use gradients on UI surfaces — the only acceptable gradients are inside the crystalline 3D illustration forms

## Elevation

NEAR is deliberately flat — no box-shadows appear anywhere in the system. Elevation is created through three mechanisms only: (1) alternating dark/light section bands that read as stacked layers, (2) 1px Hairline Gray borders on light cards to define edges without depth, and (3) the glow effect on star-cross particles which is decorative atmosphere, not UI elevation. The 4px radius reinforces the flatness — no pill shapes, no soft rounding, no soft drop shadows. This keeps the visual language architectural and crystalline rather than soft or skeuomorphic.

## Surfaces

- **Void** (`#000000`) — Dark section base — hero, feature blocks, and footer bands form the dominant canvas
- **Paper** (`#ffffff`) — Light section base and card surface — appears as a white band in the alternating rhythm
- **Mint** (`#c7f5d8`) — Full-bleed accent section — used sparingly for the Vision band
- **Signal** (`#00ec97`) — Active state surface — button fills, link hovers, the only chromatic surface layer

## Imagery

Imagery is highly distinctive and minimal: (1) the constellation field — randomized 4-pointed star-cross shapes in Signal Green with glow filters, scattered across Obsidian backgrounds like fiber-optic nodes in a data center. (2) Crystalline 3D forms — sharp-faceted gem/crystal shapes in Signal Green gradients, used as floating accent objects (2-3 per page, never decorative backgrounds). (3) The AI Text Tile — a repeating typographic wallpaper of "AI" letterforms alternating white and green on black, functioning as a brand signature rather than illustration. No photography appears. No lifestyle imagery. No product screenshots in the hero. The visual identity is entirely constructed from typography, geometry, and the green-on-black color relationship — the brand voice IS the visual.

## Layout

Full-bleed alternating bands, no container constraint on outer sections. The page reads as a sequence of void/mint/void/mint color shifts, each band 60-100vh tall. Content within bands is constrained to max-width 1200px and centered. The hero is a centered text stack over a full-bleed constellation field, not a split layout. Below the hero, the Vision band is left-aligned text within a mint background. The "What is NEAR?" section breaks into a left-visual (crystalline 3D forms) / right-text asymmetric arrangement, followed by the AI Text Tile band. Navigation is a minimal top bar with no sticky behavior implied. The grid is implied through the AI Text Tile's regular columns rather than explicit grid containers. Section rhythm is the primary structural device — each dark-to-light or light-to-dark transition marks a new content block.

## Similar Brands

- **Aptos Labs** — Same void-black hero with glowing particle fields, same alternating dark/light band rhythm, same commitment to a single neon accent color
- **Celestia** — Dark-mode crypto brand with sharp geometric forms, minimal radii, and constellation-like visual motifs in the hero
- **Render Network** — Similar flat-no-shadow design philosophy, single green-on-black accent system, and crystal/3D geometric illustration accents
- **Monad** — Dark canvas with bright accent, geometric sans display headlines at 60-80px, and a typography-driven section rhythm
