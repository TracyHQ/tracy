# Studio Gruhl — Style Reference
> matte-black gallery manifesto

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Studio Gruhl runs on a dark, text-first portfolio language: massive GreedStandard type bleeds edge-to-edge while UI chrome recedes into matte black surfaces. The interface is essentially achromatic — white text, charcoal surfaces, and a muted ash gray — so that case-study video and imagery carry all the chromatic weight. Components are minimal and compact: pill-shaped navigation at 9999px, a 12px radius as the universal workhorse for cards and buttons, and almost no decorative chrome. The work IS the decoration; the framework simply provides a quiet, full-bleed stage.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bright White | `#ffffff` | Primary text, hairline borders, nav dividers, icon strokes — white doubles as the divider system in this monochrome dark UI |
| Carbon | `#2e2e30` | Page canvas, card surfaces, neutral filled button background — the dominant surface for the entire dark experience |
| Obsidian | `#18181b` | Nav bar surface, deeper layered cards, footer base — sits one step below Carbon to create a subtle depth read |
| Ash | `#969696` | Muted body text, caption copy, low-emphasis dividers — never used for headings, always for secondary information |
| Pure Black | `#000000` | Deep border accent on certain buttons and nav edges, used sparingly for a near-invisible structural line |
| Lime Cream | `#eef0b1` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |

## Typography

### GreedStandard — Sole display and UI typeface. At 80px / weight 700 / line-height 1.00 it becomes the manifesto headline — the entire brand reads off this single oversized moment. At 15-16px / weight 400 it carries navigation, card metadata, and body. The 10px size handles micro labels and index marks.
- **Substitute:** Archivo (Google Fonts) for the grotesque DNA; pair with Anton if pure condensed display is needed for the 80px moments
- **Weights:** 400, 700
- **Sizes:** 10px, 15px, 16px, 80px
- **Line height:** 1.00, 1.15, 1.20

### Arial — System fallback for tiny UI labels and icon-adjacent text — appears in only a handful of minor contexts
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.15 | — |
| body-sm | — | — | 15px | 1.15 | — |
| body | — | — | 16px | 1.15 | — |
| body-lg | — | — | 80px | 1.15 | — |

## Spacing & Layout

**Density:** compact

- **Section gap:** 120px
- **Card padding:** 16px
- **Element gap:** 10px

### Border Radius

- **cards:** 12px
- **icons:** 9px
- **panels:** 40px
- **buttons:** 12px
- **nav-pills:** 9999px

## Components

### Pill Navigation Button
**Role:** Top-bar nav links

9999px border-radius pill, 9px horizontal padding, white 1px border on Carbon (#2e2e30) fill, 15px GreedStandard 400 text in white. The nav bar itself is an Obsidian (#18181b) pill container holding the hamburger, monogram, and contact icon in a single horizontal cluster.

### Neutral Filled Button
**Role:** Primary action when no chromatic accent is available

12px border-radius, Carbon (#2e2e30) fill, 1px Pure Black (#000000) border, 6-8px vertical / 16px horizontal padding, 15px GreedStandard 400 white text. Used for in-content actions like 'More About Us' — reads as a pressed surface, not a colored CTA.

### Ghost White Button
**Role:** Secondary action or outlined link

12px border-radius, transparent fill, 1px Bright White (#ffffff) border, 6-8px vertical / 16px horizontal padding, 15px GreedStandard 400 white text. The 'More About Us' treatment often appears as this ghost variant.

### Manifesto Display Headline
**Role:** Brand-defining oversized type block

80px GreedStandard weight 700, line-height 1.00, all-caps, Bright White (#ffffff) on Carbon canvas. Fills roughly 60% of viewport width and runs 3-4 lines. The signature element of the brand — every page should have at least one such moment.

### Top Navigation Bar
**Role:** Sticky minimal header

Centered horizontal pill, Obsidian (#18181b) fill, 9999px radius, 10px vertical padding, contains hamburger icon (left), S monogram (center), email icon (right). Sits 24px from the top edge, floating above all content.

### Full-Bleed Video Hero
**Role:** Case study opener

Edge-to-edge video block filling ~80% of viewport height with 12px corner radius. Bare playback controls (pause bottom-left, volume + fullscreen bottom-right) in thin white line icons. No title overlay on the video itself — copy lives in the adjacent manifesto block.

### Project Case Study Card
**Role:** Grid item for case study index

Carbon (#2e2e30) surface, 12px border-radius, 16px padding, optional 1px white border at low opacity. Image or video fills the card body; project name and category metadata below in 15px GreedStandard 400 white / Ash (#969696). No elevation, no shadow.

### Floating Info Card
**Role:** Project title overlay on showcase media

Obsidian (#18181b) surface, 12px border-radius, ~16px padding, 24-29px horizontal padding. Contains a 40-48px square icon tile on the left (9px radius), project name in 15px GreedStandard 700 white, one-line description in 13px Ash, and a thin white arrow icon on the right. Anchored near the bottom-center of full-bleed media.

### Stacked Panel Showcase
**Role:** Multi-frame case study progression

Five to six vertical panels of equal width filling the viewport, each a slightly different shade of a single color family (e.g. variations of indigo/purple). Panels are separated by the canvas color, not by borders. Used to show screen sequences or process stages within a single project.

### Icon Tile
**Role:** Project category or app icon container

40-48px square, 9px border-radius, white or Carbon fill, 1px border. Contains a thin line glyph (e.g. the 4-petal cross) at ~50% scale. Pairs with Floating Info Cards as the left-side thumbnail.

### Footer Link Bar
**Role:** Minimal site footer

Carbon canvas, no container. 15px GreedStandard 400 Ash (#969696) text with 29px horizontal padding between links. 1px white or near-black top border. No logo, no social icons, no copyright walls.

### Tag/Label Pill
**Role:** Project category metadata

9999px radius, 6-8px vertical / 12px horizontal padding, 1px white border, 10-13px GreedStandard 400 white text. Always inline with other metadata, never standalone.

## Do's and Don'ts

### Do
- Use GreedStandard at 80px / weight 700 / line-height 1.00 for the one manifesto headline moment on every page — it is the brand's only typographic anchor
- Build every screen on the Carbon (#2e2e30) canvas; Obsidian (#18181b) only for sticky nav and deep layers, Lime Cream (#eef0b1) only for rare inverted sections
- Use 12px border-radius for all functional surfaces (cards, buttons, tiles) and reserve 9999px exclusively for nav pills and inline tags
- Default to 15-16px GreedStandard 400 for body, nav, and card text — never reach for Arial unless a system-fallback is rendering
- Let case study video and imagery run full-bleed with raw edges; contain the work only in floating info cards, not in rounded image frames
- Communicate depth with surface color shifts (Carbon → Obsidian → Lime Cream) and 1px white borders — never with box-shadow
- Keep secondary copy in Ash (#969696); reserve Bright White for headings, active states, and primary metadata

### Don't
- Never introduce a chromatic CTA color — the system has no accent button; actions are neutral filled (#2e2e30) or ghost white outlined
- Never use box-shadow, drop-shadow, or blur on any component — the design is intentionally flat with surface-only elevation
- Never apply gradients to UI chrome or functional components — gradients are reserved for content media and belong inside the video/image, not the frame
- Never break the 12px radius convention for cards or buttons; only nav pills (9999px), icons (9px), and rare showcase panels (40px) deviate
- Never use a light or white page background for the main canvas — Carbon is the only acceptable base; Lime Cream is a rare full-bleed inversion, not a background
- Never replace GreedStandard with a system font for display moments — the custom face at 80px is what makes the manifesto read as Studio Gruhl
- Never add multi-column dashboard layouts or sidebar navigation — the structure is single-column full-bleed scroll with a centered pill nav

## Elevation

Zero-shadow design. The system communicates depth through surface color shifts alone (Carbon → Obsidian → Lime Cream → White) — no drop shadows, no glow, no blur. A card sitting on the canvas is distinguished only by its 12px radius and a 1px white or near-black border. Components appear stamped onto the surface, not floating above it. This flatness is the design: the visual energy comes from the work and the type, not from layered UI chrome.

## Surfaces

- **Carbon Canvas** (`#2e2e30`) — Default page background — every section sits on this unless explicitly inverted
- **Obsidian Layer** (`#18181b`) — Sticky nav, deeper cards, and structural zones that need to feel pressed-in from the canvas
- **Lime Cream Inversion** (`#eef0b1`) — Full-bleed section accent — rare moments where the entire band flips to a pale lime wash for typographic contrast
- **Bright White Pop** (`#ffffff`) — Highest elevation — used for inline chips, floating info cards, or micro-elements that need to cut through the dark surface

## Imagery

Full-bleed video and photography dominate — case studies open with edge-to-edge loops (e.g. the Nike swoosh on warm amber gradient) that fill 80-100% of viewport height. Imagery is always raw-edged or masked with the canvas; no rounded photo treatments, no contained thumbnails. The hero is a video player with minimal chrome (pause, mute, fullscreen icons at corners). Photography within cards tends to be tight product or motion crops on neutral backgrounds. Iconography is minimal: a stylized S monogram for the wordmark, a 4-petal cross glyph for project categories, and thin line icons for nav controls. The interface contains no decorative illustration — the case study media is the only visual content.

## Layout

Full-bleed portfolio structure with zero page max-width. The page is a vertical scroll of single-screen sections, each taking up most of the viewport. The hero is a full-bleed video with a floating pill nav anchored top-center. Below, a manifesto block runs massive left-aligned type against the dark canvas with extreme negative space. Case studies appear as full-bleed image or video bands, often with a floating info card overlaid near the bottom edge. Some case studies use a stacked vertical panel layout (5-6 columns of slightly different shades) to show sequence or progress. Navigation is a single horizontal pill at the top — no sidebar, no mega-menu. Density is intentionally sparse between work, but each work piece is presented at maximum scale with no surrounding scaffolding.

## Similar Brands

- **Pentagram** — Same text-first, monochromatic dark canvas approach where the work and oversized typography carry all the visual energy
- **Studio Dumbar** — Identical philosophy of letting case study color and media dominate while UI chrome stays restrained and achromatic
- **&Walsh** — Full-bleed dark portfolio with massive display type and zero decorative UI scaffolding around the work
- **Koto** — Brand studio aesthetic with compact UI, minimal chromatic accents, and oversized custom display type as the identity anchor
- **Mast Studio** — Creative studio that pairs dark surfaces with single large display type and floats minimal info cards over full-bleed case study media
