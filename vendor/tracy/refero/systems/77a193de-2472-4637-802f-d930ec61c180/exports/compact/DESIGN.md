# Flayks — Style Reference
> Oversized editorial broadsheet — dark forest green page, peach ink headlines bleeding off the page edges, tiny Nohemi caption text anchoring the corners.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Flayks is a maximalist editorial portfolio that treats every screen like a printed broadsheet: a deep forest-green canvas, oversized compressed display type that intentionally overflows the viewport, and a single warm peach tone as the dominant text and border color. The system pairs two custom typefaces — Mango Grotesque for monumental condensed headlines and Nohemi for the tiny UI chrome — creating an extreme scale contrast that defines the visual rhythm. Accents appear sparingly: coral-orange for emphasis type, lavender-violet for section labels and selected states. Surfaces are flat with a single deep shadow drop pattern on cards; 3D illustration tiles float above the canvas, slightly rotated, giving the page a tactile collage quality rather than a flat app feel.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#00381c` | Page canvas, section backgrounds — deep saturated green creates the base atmosphere; the page reads as forest-green, not black, which warms the dark theme and separates this system from generic dark-mode SaaS |
| Forest Deep | `#002d16` | Shadow and recessed surface tone — used in card drop-shadows and inner depth layers, the slightly darker shade of the canvas adds dimension without breaking the monochrome green field |
| Peach Cream | `#ffe0ce` | Primary text, hairline borders, outlined-action strokes — the system's only near-gray warm tone; carries the majority of legibility weight and acts as the universal border color across lists, cards, and images. Outlined ghost-button stroke color |
| Bone | `#f6e9d9` | Secondary text, decorative stroke and fill accents — a slightly cooler cream for subtle differentiation from Peach Cream without breaking the warm neutrals family |
| Charcoal | `#272221` | Card surface, elevated panels, secondary dark surface — sits one step off pure black, warm enough to harmonize with the green canvas, used for the back-layer of illustrated artwork tiles |
| Obsidian | `#000000` | Deepest surface, button border, text on light card — true black reserved for max-contrast elements and neutral button outlines |
| Slate | `#2c2f34` | Neutral card surface variant for utility panels — cool-tinted alternative to Charcoal for sections that need to feel mechanical rather than warm |
| Fog | `#c3bfbc` | Muted neutral card surface — desaturated warm gray for low-emphasis panels |
| Coral Flame | `#ff8370` | Display type accent, link text, emphasis headings — vivid warm orange that dominates the hero typography and section labels; against the green canvas it reads as high-energy poster ink, not a UI CTA color |
| Lavender | `#d1adff` | Violet accent for outlined action borders, linked labels, and lightweight interactive emphasis. |
| Sage | `#546f57` | Body background panels, list dividers, utility surfaces — desaturated green that sits between Forest Ink and the cream text, used for secondary content blocks and list separators |
| Ultraviolet | `#2d0458` | Dramatic card surface for featured work tiles — deep saturated violet as an alternative canvas for highlight cards; high contrast with Peach Cream text |
| Indigo Depth | `#1e1779` | Accent card surface — vivid indigo for occasional card variants that need to feel different from the green field without going warm |
| Heather | `#977eac` | Muted card surface — dusty violet for low-priority cards and section dividers |
| Navy Depths | `#002a3b` | Cool card surface — deep blue-teal for cards that need to break from the warm/green field with a cool note |

## Typography

### Mango Grotesque — Display and heading — Mango Grotesque is a condensed grotesque used at near-illegible sizes (88–518px) with compressed line-height (0.80–0.85), intentionally bleeding off the viewport. The tight tracking plus compressed leading is what makes the type read as 'poster' rather than 'web headline'. Substitutes: Anton, Bebas Neue, Druk Wide for the mass, Archivo Black for smaller weights.
- **Substitute:** Anton or Archivo Black
- **Weights:** 500, 700
- **Sizes:** 32, 40, 48, 88, 94, 97, 144, 256, 518px
- **Line height:** 0.80, 0.85, 1.00, 1.20
- **Letter spacing:** 0.0150em, 0.0200em, 0.0250em

### Nohemi — UI body, navigation, buttons, meta text — Nohemi runs at a deliberately tiny 14–18px with generous +0.10em tracking, a signature move that makes the UI text feel like caption furniture rather than body copy. The +10% tracking is anti-convention: most body systems tighten tracking, this loosens it to keep the small text airy and readable against the dark green. Substitutes: Inter, General Sans, Satoshi.
- **Substitute:** Inter or General Sans
- **Weights:** 400, 600
- **Sizes:** 14, 18px
- **Line height:** 0.85, 1.10, 1.20, 1.35
- **Letter spacing:** 0.1000em

### Arial — System fallback for the smallest UI metadata — 13px Arial is used purely as a safe baseline when custom fonts fail; treated as invisible utility, not a design choice.
- **Substitute:** Arial
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | 0px |
| body | — | — | 18px | 1.2 | 1.8px |
| subheading | — | — | 32px | 1 | 0.48px |
| heading-sm | — | — | 48px | 0.85 | 0.96px |
| heading | — | — | 88px | 0.85 | 1.76px |
| heading-lg | — | — | 144px | 0.8 | 2.88px |
| display | — | — | 256px | 0.8 | 5.12px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 64px
- **Card padding:** 12-16px
- **Element gap:** 4-10px

### Border Radius

- **md:** 10px
- **sm:** 6px
- **pill:** 900px

## Components

### Status Bar Footer
**Role:** Persistent meta-information strip across the entire page

Fixed to the bottom edge of the viewport, full-width, transparent over the green canvas. Three zones — left: location marker (Lavender dot) + 'CURRENTLY IN TOULOUSE, FR (CET)'; center: 'AVAILABLE FOR NEW PROJECTS'; right: snowflake icon + 'CONTACT'. Nohemi 14px, weight 400, letter-spacing 0.10em, uppercase, color Peach Cream. Dot indicators use 6px circles in Lavender. No background fill, no border — the type floats directly on the Forest Ink canvas with 12–16px vertical padding.

### Wordmark Logo
**Role:** Brand identity lockup anchored top-left

Bubbly 3D-extruded 'FLAYKS' wordmark in turquoise/mint (#7df0d8 range) with cream highlights and a soft drop shadow — treated as an illustration object, not a text logotype. Pairs a glossy plastic material against the matte dark green canvas. Sits at top-left with 14px padding from the viewport edge and functions as a home link.

### Floating Illustration Tile
**Role:** Featured project artwork displayed as a physical card

Square or near-square card containing 3D-illustrated artwork (crystalline structures, sci-fi vehicles, clouds) on a bright blue sky background. Card sits on Charcoal (#272221) backing with slight rotation (-3° to +5°) for collage feel. 10px border-radius, 6px Peach Cream border, layered shadow stack: rgba(0,0,0,0.2) 0 0 112px 0 (ambient glow) + rgba(0,0,0,0.1) 4px -4px 12px 0 (directional). Width varies 240–400px. Tiles overlap or cluster asymmetrically rather than aligning to a grid.

### Ghost Action Button
**Role:** Outlined interactive trigger — the only button variant in the system

Transparent fill, 1.5–2px Peach Cream border, Nohemi 14px uppercase weight 600, letter-spacing 0.10em. 6px border-radius. Padding 10px 16px. No filled state — hover increases border weight or shifts to Coral Flame. There is no filled-button variant in this system; all CTAs are ghost-strokes against the dark canvas.

### Vertical Side Navigation
**Role:** Section-anchor list rendered as a vertical pill stack

Left-edge vertical list of section markers — 6–8px Lavender circles or rounded pills, 10px vertical gap. Active item renders as a larger filled Lavender dot or pill with Nohemi 14px label beside it. Inactive items are outline-only circles. The nav reads as a precise gauge rather than a horizontal bar — the page's primary navigation surface is a thin vertical column.

### Meta Label Tag
**Role:** Small uppercase caption for section context

Nohemi 14px, weight 400, letter-spacing 0.10em, uppercase, Peach Cream. No background, no border. Used for captions like 'I'M FÉLIX', 'UP NEXT', 'SHOWCASE OF DIVERSE WORKS'. Sits 8–16px above the element it labels. The tag is the typographic system doing the work of a section header at the smallest scale.

### Project Preview Card
**Role:** Selected-project showcase tile with shadow and border

Rectangular card on Ultraviolet (#2d0458) or Charcoal (#272221) background, 10px border-radius, 1px Peach Cream border. Multi-layer drop shadow: rgba(0,0,0,0.01) 0 62px 25px / 0.05 0 35px 21px / 0.09 0 16px 16px / 0.1 0 4px 9px. 16px internal padding. Contains Mango Grotesque title and Nohemi meta. Acts as a hard-edged container against the soft green canvas.

### Hairline Divider
**Role:** Separator line for list items and section breaks

1px Peach Cream line at full or partial width, often used inside Sage (#546f57) or dark panels. No margin on the line itself — adjacent elements supply 8–16px vertical breathing room. Functions as the structural rhythm of lists and metadata stacks.

### Oversized Headline Block
**Role:** Hero display type that bleeds off the viewport

Mango Grotesque weight 700 at 144–518px, line-height 0.80, letter-spacing 0.015–0.025em, color Coral Flame. Headline is positioned to overflow the right and/or bottom edge of the viewport — this is intentional, not a bug. The bleed creates the editorial-poster effect that defines the system's hero rhythm. Sits on Forest Ink with no container.

### Section Accent Label
**Role:** Colored eyebrow text marking section transitions

Mango Grotesque weight 500 at 32–48px, Lavender (#d1adff) or Coral Flame (#ff8370), letter-spacing 0.025em, line-height 0.85. Examples: 'SELECTED', 'PROJECTS', 'DIGI-TAL'. Acts as a visual chapter mark — bold enough to be a typographic moment, small enough not to compete with the hero headline.

### Status Dot Indicator
**Role:** Colored circular marker for live meta states

6px filled circle in Lavender (#d1adff) with a subtle 1px Peach Cream outer ring. Sits inline with Nohemi 14px caption text. Used to indicate 'live' status (current location, availability, active nav). The dot is the smallest semantic mark in the system.

## Do's and Don'ts

### Do
- Use Mango Grotesque at 88px or larger for any headline meant to carry the page; below 48px, switch to Nohemi weight 600.
- Set all Nohemi text to letter-spacing 0.10em and uppercase — the airy tracking on small text is the signature of this system.
- Use Peach Cream (#ffe0ce) as the default text and hairline border color; reserve Coral Flame and Lavender for typographic accent only, not body content.
- Keep display headlines compressed at line-height 0.80–0.85 and allow them to bleed off the viewport edge — the overflow is the point.
- Render cards on Charcoal or Ultraviolet surfaces with 10px radius and the four-layer black drop shadow stack, never flat against the green canvas.
- Anchor the status bar (location / availability / contact) to the bottom of every page; it is a persistent furniture element, not a footer block.
- Pair 3D illustration tiles with slight rotation (-5° to +5°) so they read as a collage, not a grid.

### Don't
- Do not introduce a filled button variant — all actions in this system are ghost-stroked with Peach Cream borders.
- Do not set Mango Grotesque below 32px; the compressed grotesque loses its identity at body sizes.
- Do not use white (#ffffff) text or borders; the system runs on warm Peach Cream and Bone, never neutral white.
- Do not tighten letter-spacing on Nohemi — the +0.10em tracking is what makes the tiny UI text legible against the dark green canvas.
- Do not center-align the hero headline — Flayks uses asymmetric, left-bleeding editorial composition throughout.
- Do not add gradients; the design is strictly flat color with single-direction drop shadows only.
- Do not use the violet card surfaces (#2d0458, #1e1779) for more than one tile per section — they are accent canvases, not default cards.

## Elevation

- **Floating Illustration Tile:** `rgba(0, 0, 0, 0.2) 0px 0px 112px 0px, rgba(0, 0, 0, 0.1) 4px -4px 12px 0px`
- **Project Preview Card:** `rgba(0, 0, 0, 0.01) 0px 62px 25px 0px, rgba(0, 0, 0, 0.05) 0px 35px 21px 0px, rgba(0, 0, 0, 0.09) 0px 16px 16px 0px, rgba(0, 0, 0, 0.1) 0px 4px 9px 0px`
- **Hero Feature Card:** `rgba(0, 0, 0, 0.01) 0px 262px 105px 0px, rgba(0, 0, 0, 0.05) 0px 148px 89px 0px, rgba(0, 0, 0, 0.09) 0px 66px 66px 0px, rgba(0, 0, 0, 0.1) 0px 16px 36px 0px`

## Surfaces

- **Forest Ink Canvas** (`#00381c`) — The page field — all sections and heroes sit directly on this deep green; no lighter background exists at the page level.
- **Sage Panel** (`#546f57`) — Body and list background panels that need a subtle lift from the canvas without breaking the green field.
- **Charcoal Card** (`#272221`) — Elevated cards and illustration tile backings — warm dark surface that complements the green canvas.
- **Ultraviolet Feature Card** (`#2d0458`) — Accent surface for featured work tiles — the only high-chroma card surface in the system.

## Imagery

3D illustration is the dominant visual language: glossy plastic-rendered vehicles, crystalline architectural forms, sci-fi vehicles on blue-sky backgrounds with cartoon clouds, and bubbly extruded logo marks. Tiles are square or near-square, slightly rotated, with a collage arrangement rather than a grid. Photography is absent — all visual content is either 3D render or hand-drawn/illustrated logo objects. The mint-turquoise 3D 'FLAYKS' wordmark with cream highlights establishes the material palette: high-gloss plastic, warm light, soft pastel environments. Imagery occupies roughly 30–40% of the hero viewport and clusters asymmetrically alongside the oversized typography rather than behind it.

## Layout

Full-bleed editorial composition with no max-width container — every section runs edge-to-edge against the Forest Ink canvas. The page is built in horizontal bands: hero (massive Mango Grotesque headline bleeding off the right edge + 3D illustration tile clustered bottom-left), about (asymmetric title + small Nohemi body), and a 'selected projects' section that shifts to a near-black canvas with centered Mango Grotesque section labels. Navigation is a vertical pill stack anchored to the left edge rather than a top bar; the status meta bar is pinned to the bottom of the viewport and persists across all sections. Vertical rhythm comes from oversized display type and clustered 3D tiles rather than from a column grid — the layout reads as a printed broadsheet, not a SaaS app. Section gaps are 60–100px but the giant typography makes the actual visual gaps feel larger.

## Similar Brands

- **Locomotive (locomotive.ca)** — Same editorial-portfolio treatment: oversized compressed display type that bleeds off the canvas, dark moody page tone, 3D illustration as primary visual content, asymmetric collage layout rather than grid.
- **Pentagram (pentagram.com)** — Full-bleed editorial dark canvases, paired custom typefaces with extreme scale contrast between display and body, work tiles rendered as illustrated cards floating off the page edge.
- **Active Theory (activetheory.net)** — Same maximalist agency-portfolio language: oversize condensed display headlines, 3D-rendered project tiles, single saturated accent color against a dark field, ghost-stroked navigation rather than filled buttons.
- **Gunner (gunner.io)** — Custom condensed display grotesque used at near-illegible sizes, warm peach/cream against a deep dark canvas, tiny tracked-out Nohemi-style UI text anchoring the corners of the page.
- **B-Reel (b-reel.com)** — Agency portfolio with 3D-illustrated project tiles, asymmetric collage composition, and oversized display typography that treats the viewport as a printed spread rather than a screen.
