# Langbase — Style Reference
> Midnight aurora console

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Langbase is a midnight developer console where a single chromatic aurora is the only color in an otherwise pure dark-gray world. The canvas is #232324 — a near-black charcoal — structured by hairline borders at #232324 and #5c5c61 that create an architectural blueprint grid visible behind the hero. The interface reads as a terminal: GeistSans provides clean geometric UI, GeistMono adds the developer identity at display sizes, and CTAs are achromatic pills (white-on-dark) so the multi-hue gradient — peach, pink, violet, mint, sky — becomes the sole emotional accent. Components stay flat and lightweight: no decorative shadows, no colorful buttons, no rounded-everything softness. The only color is the aurora, and it appears as fragmented horizontal bars beside the hero — decorative spectacle, never functional chrome.

## Colors

| Name | Value | Role |
|------|-------|------|
| Console Charcoal | `#232324` | Dominant page canvas, structural hairline borders, and the visible grid backdrop behind the hero. The single most-used color in the system; defines the near-black field that everything else sits on |
| Bone White | `#fafafa` | Primary text, primary action fill, and the bright pole of the system. White-on-charcoal carries all the hierarchy; nothing else is allowed to compete |
| True Black | `#000000` | Deepest surface tone for the darkest interactive states and the reverse-text base inside white CTA buttons. Used sparingly — never as the page background |
| Off-White | `#ebeced` | Slightly warmer white for secondary text and subtle emphasis where #fafafa would feel too clinical |
| Mute Gray | `#a1a1aa` | Muted helper text, nav links, and secondary icon strokes. The readable-but-quiet gray that supports body copy without claiming focus |
| Wire Gray | `#5c5c61` | Hairline borders, icon strokes, and the dividing lines between content sections. The 1px wire that holds the console together |
| Recess Black | `#181818` | High-contrast neutral action fill for primary buttons on light surfaces. |
| Nav Ink | `#0e0e10` | Navigation bar background — the only surface darker than the canvas, anchoring the top of the page as a distinct horizontal band |
| Smoke | `#454546` | Muted body text and the mid-tone of the neutral scale. Quieter than #a1a1aa for de-emphasized copy |
| Ash | `#696970` | Quietest readable gray for tertiary metadata and timestamps |
| Aurora Spectrum | `linear-gradient(to right, #f6d1ac, #f3b5d2, #c7b8f5, #a7eadc, #afcdf6)` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### GeistSans — All UI text — navigation, buttons, body copy, and subheadings. Custom geometric sans with -0.025em tracking baked in; weight 500 carries most of the voice. The maximum sans size (48px) is reserved for the hero headline, after which GeistMono takes over for display.
- **Substitute:** Inter, system-ui, -apple-system
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 18, 20, 48
- **Line height:** 1.0–1.75
- **Letter spacing:** -0.025em at all sizes (≈ -0.3px at 12px, -1.2px at 48px)
- **OpenType features:** `"ss01" on, "cv11" on`

### GeistMono — Developer-identity display type and inline code/numeric emphasis. The extreme -0.3em letter-spacing at 60-72px collapses the letterforms into dense blocks of glyph — a signature choice that reads as 'terminal' rather than 'poster'. Used for large statistics, code tokens, and the largest display moments.
- **Substitute:** JetBrains Mono, IBM Plex Mono, ui-monospace
- **Weights:** 400, 500
- **Sizes:** 12, 13, 16, 60, 72
- **Line height:** 1.0–1.5
- **Letter spacing:** -0.3em at 60-72px (≈ -18px to -21.6px); tight tracking at smaller sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 18 | -0.3px |
| body-sm | — | — | 14px | 20 | -0.35px |
| body | — | — | 16px | 24 | -0.4px |
| subheading | — | — | 18px | 28 | -0.45px |
| heading | — | — | 20px | 28 | -0.5px |
| heading-lg | — | — | 48px | 56 | -1.2px |
| display | — | — | 60px | 60 | -18px |
| display-xl | — | — | 72px | 72 | -21.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 4px
- **cards:** 12px
- **icons:** 4px
- **inputs:** 4px
- **buttons:** 9999px
- **large-buttons:** 100px

## Components

### Primary Pill CTA
**Role:** The only filled action button in the system

Bone White #fafafa background, True Black #0e0e10 text, fully rounded at 9999px. Padding 8px 16px (compact) or 10px 20px (comfortable). GeistSans 14px weight 500. Carries the single subtle shadow: rgba(0,0,0,0.1) 0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px -1px. No hover state changes color — it stays the system anchor.

### Ghost Outline Button
**Role:** Secondary action that defers to the primary

Transparent background, 1px Wire Gray #5c5c61 border, Bone White #fafafa text, 9999px radius. Same padding scale as the primary pill (8px 16px or 10px 20px). GeistSans 14px weight 500. Sits beside the primary CTA as the quieter option — outlined, never filled.

### Sticky Navigation Bar
**Role:** Top-of-page anchor that persists on scroll

Nav Ink #0e0e10 background (distinctly darker than the canvas), 1px Console Charcoal #232324 bottom border. Height ~56px. Horizontal flex: logo left, link cluster center, Primary Pill CTA right. GeistSans 14px weight 500 for links in Mute Gray #a1a1aa.

### Announcement Strip
**Role:** Time-sensitive message above or below the nav

Full-width band, 1px Console Charcoal #232324 border on all sides, centered GeistSans 12px text in Mute Gray #a1a1aa. Small leading icon (4px radius, 16px). 8px vertical padding. Acts as a quiet ticker, not a banner.

### Hero Grid Backdrop
**Role:** Architectural texture behind the hero

1px Console Charcoal #232324 lines forming a visible coordinate grid across the hero section. Creates a 'blueprint' or 'IDE canvas' feel — the grid is the visual texture, not a gradient or image. Sits behind both the headline and the aurora bars.

### Aurora Gradient Bars
**Role:** The single decorative spectacle on the page

Fragmented horizontal bars (8px height, varying widths) filled with the multi-hue aurora gradient: peach #f6d1ac → pink #f3b5d2 → violet #c7b8f5 → mint #a7eadc → sky #afcdf6. Positioned right of the hero headline as an abstract chart-like arrangement. Never used as a button fill, text color, or container background.

### Hero Headline
**Role:** Largest type on the page

GeistSans 48px weight 500 (or GeistMono 60px for a terminal feel), Bone White #fafafa, -1.2px letter-spacing. Line height 56px. Two-line max. The most visually weighted element after the aurora.

### Logo Trust Strip
**Role:** Social proof band below the hero

Horizontal grid of company wordmarks (6 per row, then 5). Logos rendered in Bone White #fafafa or Mute Gray #a1a1aa — monochrome, never brand-colored. 24px gap between logos, 32px row gap. 'Trusted by developers at 5000+ companies' caption in GeistSans 12px Mute Gray above the grid.

### Code / Mono Label
**Role:** Inline technical references and terminal snippets

GeistMono 13px weight 400 in Mute Gray #a1a1aa. No background. 0 letter-spacing at body size (the -0.3em tracking is for display only). Used for file paths, API endpoints, and command-line cues that need to read as code.

### Input / Code Field
**Role:** Text entry in a dark recessed surface

Recess Black #181818 background, 1px Wire Gray #5c5c61 border, 4px radius. Padding 12px 16px. GeistMono 13px for code inputs, GeistSans 14px for regular text. Placeholder in Mute Gray #a1a1aa. Focus ring: 1px Bone White #fafafa border, no glow.

### Dark Card Surface
**Role:** Content container for features, pricing, or API examples

Console Charcoal #232324 background (same as canvas, distinguished by border), 1px Wire Gray #5c5c61 border, 12px radius, 24px padding. No shadow — the border is the entire depth signal. Cards never float above the page.

### Icon (Geometric Mono)
**Role:** Functional and decorative iconography

1.5px stroke weight, 16-20px size, 4px square or 9999px circular bounding. Color: Bone White #fafafa for primary, Mute Gray #a1a1aa for secondary, Wire Gray #5c5c61 for tertiary. Outlined, never filled. No multi-color icons — the aurora gradient is the only color in the system.

## Do's and Don'ts

### Do
- Use 9999px radius for all primary and ghost buttons — the pill is the system's shape signature
- Apply -0.025em letter-spacing to every GeistSans size and -0.3em to GeistMono display sizes — tracking is part of the brand
- Anchor every page on the Console Charcoal #232324 canvas with Nav Ink #0e0e10 reserved exclusively for the top navigation band
- Use the aurora gradient only as fragmented horizontal bars in hero/feature sections — never as a button fill, text color, or container background
- Hold the 4px spacing grid: 4, 8, 12, 16, 24, 32, 40, 48, 64 — no exceptions
- Express depth through #181818 recessed surfaces rather than shadows — inputs and dark buttons press into the canvas, not float above it
- Pair GeistMono 60-72px with -0.3em tracking for the largest display moments to read as terminal, not poster

### Don't
- Don't introduce any chromatic color for buttons, links, or icons — the palette is 99% achromatic; the aurora is the only exception and it is decoration only
- Don't use shadows beyond the single 1px whisper on the primary CTA — depth comes from tonal recess, not elevation
- Don't use #000000 as a page or section background — it is reserved for the deepest interactive states and inverted text
- Don't break the 4px grid or invent radii outside 4, 12, 100, and 9999px — the radius scale is closed
- Don't use the aurora gradient as text fill, border, or icon stroke — it appears exclusively as fragmented horizontal bars
- Don't introduce a second accent color, a brand red, or a success green — the system has no chromatic functional palette; state communication happens through weight and opacity
- Don't use multi-color or filled icons — outlined 1.5px mono icons in white or gray only

## Elevation

- **Primary Pill CTA (only):** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

## Surfaces

- **True Black** (`#000000`) — Deepest accent surface — used inside inverted CTAs and the darkest focus states
- **Nav Ink** (`#0e0e10`) — Sticky navigation band, the only surface that reads as distinctly darker than the canvas
- **Recess Black** (`#181818`) — Recessed interactive fields — input boxes and dark-context buttons that feel pressed into the page
- **Console Charcoal** (`#232324`) — Dominant page canvas — the architectural ground plane that carries all content

## Imagery

Minimal decorative approach. The hero is dominated by a multi-hue aurora gradient rendered as fragmented horizontal bars — peach, pink, violet, mint, sky — providing the only chromatic burst against the monochrome interface. A subtle architectural grid of hairline #232324 lines creates a blueprint backdrop behind the hero. Company logos appear as monochrome wordmarks (Bone White or Mute Gray) in a two-row trust band. No photography, no illustrations, no 3D renders — the entire visual interest comes from the type, the grid, and the single aurora gradient.

## Layout

Full-bleed dark canvas (no max-width on the background) with content constrained to ~1200px. Sticky top navigation in Nav Ink. Hero uses a two-column split: headline + dual CTAs on the left, fragmented aurora bars on the right, all overlaid on a visible coordinate grid. Generous vertical spacing (64-80px between sections) with hairline #5c5c61 dividers rather than full color shifts. Below the hero, a compact two-row logo trust strip (6+5 grid) sits in Mute Gray. Section rhythm: announcement strip → nav → hero (generous) → trust strip (compact) → content sections follow the same spacious cadence. No sidebar, no mega-menu, no asymmetric column work — the layout is terminal-grid clean.

## Similar Brands

- **Vercel** — Same Geist typeface family, same near-black canvas, same developer-platform terminal feel, same achromatic pill CTAs
- **Linear** — Dark-mode product UI with hairline borders, pill buttons, and a single restrained palette — though Langbase is more console-like and less dense
- **Together.ai** — AI infrastructure platform with a similarly dark, type-forward hero and developer-terminal identity
- **Modal** — Developer infrastructure brand with comparable dark canvas, Geist-like geometric type, and hairline structural borders
- **Replicate** — AI cloud platform with a dark, minimal interface and a single decorative visual accent above the fold
