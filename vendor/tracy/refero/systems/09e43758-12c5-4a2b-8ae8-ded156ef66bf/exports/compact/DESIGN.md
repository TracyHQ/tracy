# MekaVerse — Style Reference
> monochrome gallery for digital artifacts — a pure black void where a rendered world hangs like a museum piece, and all UI is white ink on matte black glass.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

MekaVerse is a cinematic web3 game portal where the interface dissolves and the rendered world takes the stage. The entire UI is a monochrome shell — pure black canvas, white type, single charcoal button — built to frame massive full-bleed 3D artwork without competing with it. Typography does almost all the work: a single custom geometric sans (Roobert) stacked at extreme sizes with aggressive negative line-height for hero titles, and a quiet monospaced face (GT America Mono) whispering UI chrome in 10–12px. Surfaces are flat — no shadows, no gradients, no chromatic accent — the game art provides all color and depth. Every chrome element is featherweight: hairline 1px borders, 2px corner radii on interactive controls, and text-only hover states. The system reads less like a website and more like a gallery wall where the 3D world is the only object in the room.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, image overlays, nav background — pure black lets full-bleed 3D renders carry every chromatic moment while UI chrome disappears into the background |
| Bone | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Charcoal | `#444345` | Filled action buttons (Explore, Connect Wallet) and the one elevated surface level above the void — a soft dark step that reads as pressed-in rather than raised, keeping the flat-gallery feel |
| Frost | `#e2e2e2` | Hairline borders, divider lines, subtle structural edges — visible only where it separates two dark surfaces or wraps a control |
| Ash | `#b8bab9` | Subtle surface tone for inactive UI blocks and muted containers — sits between Void and Bone, used sparingly to indicate a non-default resting state |

## Typography

### Roobert — All display, hero, and heading type. A single geometric grotesque used at extreme sizes — 80px for hero titles with line-height 0.78 produces a tightly stacked monumental mark rather than a flowing headline. The choice to render a custom display face at weight 400 (not 700) is the signature: the type whispers authority rather than shouting it. Substitute: Inter at matching weights if Roobert is unavailable.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 26px, 30px, 80px
- **Line height:** 0.78 (hero), 1.00 (sub), 1.15 (body)
- **Letter spacing:** normal
- **OpenType features:** `"liga" 0`

### GT America Mono — All chrome, nav, micro-labels, and link text. The monospaced face is deliberately anti-display — it reads as system instrumentation rather than editorial design, which keeps the UI subordinate to the 3D world. Tracking at -0.02em tightens the mono rhythm for a quieter presence at 10–12px. Substitute: JetBrains Mono at matching weight.
- **Substitute:** JetBrains Mono
- **Weights:** 400
- **Sizes:** 10px, 12px
- **Line height:** 1.00 (nav), 1.30 (body micro)
- **Letter spacing:** -0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1 | -0.2px |
| heading-sm | — | — | 26px | 1.15 | 0px |
| heading | — | — | 30px | 1 | 0px |
| display | — | — | 80px | 0.78 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **nav:** 2px
- **cards:** 10px
- **buttons:** 2px
- **containers:** 20px

## Components

### Top Navigation Bar
**Role:** Sticky transparent header overlaid on full-bleed artwork

Transparent background with 1px Frost (#e2e2e2) bottom border at ~10% opacity, logo left, nav links centered, Connect Wallet right. Height driven by content (~40px), sits at top:0 over rendered scenes. Nav items use GT America Mono 12px, white, with 25px horizontal padding and 7px gap between links.

### Connect Wallet Button
**Role:** Primary persistent action in the nav

Charcoal (#444345) filled button, 2px radius, GT America Mono 10–12px uppercase, Bone (#ffffff) text, ~10px 20px padding, 1px Frost border optional. Reads as a quiet terminal button rather than a marketing CTA.

### Explore Action Button
**Role:** Hero call-to-action below stacked display title

Charcoal (#444345) fill, 2px radius, 1px Frost (#e2e2e2) border, GT America Mono 10–12px label, Bone text. Sits flush-left beneath the hero headline with 20px top margin. Deliberately understated — the artwork above it is the real hero.

### Hero Stacked Title
**Role:** Section title overlaid on full-bleed rendered art

Three lines of Roobert 80px / weight 400 / line-height 0.78, Bone (#ffffff), left-aligned with generous left margin (~60–80px). Each line underlined by a 1px Frost hairline that extends across roughly 30% of the title width — a distinguishing mark, not a generic divider. Letter-spacing 0; the tight line-height creates the stacked monumental effect.

### Underline Mark
**Role:** Signature horizontal rule beneath display titles

1px tall Frost (#e2e2e2) line positioned directly under each line of stacked hero text, extending from the left edge of the text to approximately the midpoint of the longest line. This is a recurring brand device, not a generic underline.

### Nav Link
**Role:** Header navigation item

GT America Mono 12px, -0.02em tracking, Bone text, no underline at rest. 25px horizontal padding, 3–7px gap to neighbor. Hover state: 1px Frost bottom border appears without shifting layout.

### Logo Lockup
**Role:** Brand identifier in nav

MekaVerse wordmark with a small geometric glyph to the left (diamond/cross mark). White on transparent, sits at top-left of nav with 25px left padding. ~20px height.

### Art Frame
**Role:** Full-bleed rendered artwork container

No padding, no border, no shadow — the rendered 3D scene fills the viewport edge-to-edge. Aspect ratio is free per section; the UI is simply laid on top with absolute positioning. This is the design system's central content primitive.

### Section Container
**Role:** Wraps overlaid text or interactive content over an art frame

Transparent background, no border, padded from viewport edges (20–30px). Content is positioned with absolute or flex alignment and never receives its own card treatment — it floats over the art.

### Subtitle Text
**Role:** Secondary headline or label under a hero title

Roobert 30px, weight 400, line-height 1.0, Bone (#ffffff). Used for 'Season 2' style secondary marks. No underline.

### UI Caption
**Role:** Micro-labels, counters, badges, wallet indicator

GT America Mono 10px, line-height 1.0, -0.02em tracking, Bone or Frost text. Used for cart counters, wallet status pills, and any 10px-or-smaller metadata.

## Do's and Don'ts

### Do
- Use #000000 as the page canvas beneath every full-bleed artwork and let renders carry all color and light
- Set hero titles in Roobert 80px weight 400 with line-height 0.78 — the tight stacking is the signature, not an accident
- Reserve #ffffff for type and high-contrast borders; never use it as a fill surface
- Use GT America Mono 10–12px with -0.02em tracking for all chrome, nav, and micro-labels
- Render buttons as 2px-radius Charcoal (#444345) fills with 1px Frost border — pressed-in, never raised
- Place a 1px Frost underline mark beneath each line of stacked hero text extending to roughly 30–50% of the line width
- Let rendered artwork bleed to the viewport edge; never wrap art in a card with padding or a border

### Don't
- Do not introduce any chromatic color — the palette is monochrome by design, and one accent will shatter the gallery frame
- Do not apply box-shadow to any element; elevation is communicated only through the surface stack and hairline borders
- Do not use a system font for display copy — Roobert (or Inter substitute) at weight 400 is the voice; sans-serif heavy weights break the whisper-authority effect
- Do not give cards or containers radii larger than 20px; the 2px / 10px / 20px triad is the entire system
- Do not center-align hero titles; they are always left-aligned with the underline mark extending rightward
- Do not use line-height above 1.0 for any display-size text — the stacked monumental mark depends on aggressive negative leading
- Do not add a footer chrome pattern (links, legal text, social icons in a row) unless the design calls for it; the page ends where the art ends

## Elevation

The design uses no shadows. Elevation is communicated exclusively through the three-step neutral surface stack (Void → Charcoal → Ash) and through 1px hairline borders in Frost. Every element should feel pressed onto the black canvas, not floating above it. Never introduce box-shadow.

## Surfaces

- **Void** (`#000000`) — Universal page canvas behind all rendered artwork and beneath all UI
- **Charcoal** (`#444345`) — First elevation step — filled action buttons and inline control surfaces that need to lift off the void without casting shadow
- **Ash** (`#b8bab9`) — Muted panel or disabled-state surface, used only when a non-interactive block needs a visible material

## Imagery

Full-bleed 3D rendered game artwork is the entire visual language. Every section is dominated by a painted-rendered diorama — fantasy castles on green islands, icy fortresses, mecha-characters on white dunes — shown edge-to-edge with no framing. Art treatment is high-detail cinematic with deep atmospheric depth, saturated mid-tones (greens, blues, warm whites) that contrast with the black UI overlay. There is no photography, no flat illustration, no iconography beyond a small logo glyph. Icons visible are minimal: a small diamond/cross mark in the logo. The visual hierarchy is: art (100% of viewport) > display type (overlay) > chrome (corners only).

## Layout

Full-bleed cinematic scroll. Every viewport-sized section is a rendered scene extending edge-to-edge with no horizontal margins. Text and controls are absolutely positioned over the art — typically bottom-left or center-left — with generous left padding (25–80px). Sections stack vertically with 0px gap between them; the page reads as a continuous film strip of rendered worlds. Navigation is a single transparent sticky bar at the top. There are no card grids, no sidebar, no max-width content columns; the only 'columns' are the implicit left-aligned text block and the right-aligned nav. The layout is essentially: [transparent nav] → [full-bleed art + overlaid hero] → [full-bleed art + overlaid title] → [full-bleed art + overlaid title] repeated to scroll length.

## Similar Brands

- **Azuki** — Same full-bleed cinematic 3D artwork with left-aligned white display type overlaid on rendered scenes, and a transparent sticky nav
- **Doodles** — Same monochrome chrome wrapping a colorful illustrated world; UI disappears so the art is the only object in the room
- **Loot (Foundation)** — Same anti-design approach: near-zero color, tiny mono labels, oversized stacked display type, and the product itself is the visual
- **RTFKT** — Same web3 product-portal feel — black canvas, white type, rendered 3D hero scenes that dominate every viewport
- **Yuga Labs (Otherside)** — Same world-building game-portal aesthetic with full-bleed rendered dioramas and whisper-quiet UI chrome in mono type
