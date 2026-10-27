# CHELSEA — Style Reference
> Black-box cinema with a single blue spotlight — the roster plays, the chrome disappears.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Chelsea is a talent roster presented as a black-box cinema: full-bleed cinematic photography sits directly on pure black, with a single vivid blue (#4490ff) as the only chromatic voice. The interface is deliberately skeletal — a thin top bar, a tiny floating blue dot, and a name list rendered in the accent color — letting the roster's work carry all visual weight. Typography is one family (Neue Haas Unica Pro) in two weights, set with tight 1.0–1.15 line-heights so the type reads like a film credit rather than a website. Everything that can be invisible is invisible: no borders on the canvas, no shadows, no card containers, no section backgrounds — the only surface transition is the sudden black-to-photography cut. Buttons and links are pill-shaped (9999px radius) and extremely compact, reinforcing the sense that this is a viewing room, not a product dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, all section backgrounds, negative space — the floor everything sits on |
| Spotlight Blue | `#4490ff` | Primary action, interactive links, roster name listings, focal dot indicator, highlighted borders — the only chromatic voice in an otherwise monochrome system |
| Carbon Slate | `#1f2937` | Headings, heavy borders, structural borders on dark surfaces — near-black with a slight cool cast for separation from the pure black canvas |
| Bone White | `#f4efe9` | Warm off-white for text and subtle borders — softer than pure white, evoking film stock and gallery walls against the black canvas |
| Pure White | `#ffffff` | Maximum-contrast text and dividers when absolute clarity is needed over photography or dark media |
| Ash Gray | `#e5e7eb` | Light-mode surfaces, neutral borders on cards or panels, secondary dividers — provides a paper-like counterpoint when a section lifts off the black canvas |

## Typography

### Neue Haas Unica Pro — All UI and content type — nav labels at 14px, body at 16px, section headings at 32px, display at 48px
- **Substitute:** Neue Haas Grotesk, Inter, Helvetica Neue
- **Weights:** 400, 700
- **Sizes:** 12px, 14px, 16px, 32px, 48px
- **Line height:** 1.00–1.50
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| heading-sm | — | — | 32px | 1.12 | — |
| display | — | — | 48px | 1.1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Section gap:** 96px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **links:** 9999px
- **images:** 0px
- **buttons:** 9999px

## Components

### Cinema-Full-Bleed Media Frame
**Role:** Hero and section media containers

Photographic or video content scaled edge-to-edge with zero margin, zero radius, zero border. The image bleeds off all four sides of the viewport, sitting directly on the #000000 canvas with no wrapper or frame.

### Thin Top Navigation Bar
**Role:** Primary site navigation

Single horizontal row of text links (Roster, Latest, Team, Collaborators) in 14px Neue Haas Unica Pro weight 400, #ffffff, spaced across the full viewport width with generous gaps. A 1px #1f2937 or hairline white rule separates it from the canvas. No logo block, no background fill — text floats on black.

### Focal Dot Indicator
**Role:** Brand punctuation and active-state marker

A small solid #4490ff circle (~12px diameter) placed inline with content — used as a near-logo near the nav, and as a visual anchor on key media frames. No border, no shadow, no label. Its job is to plant the brand color in a monochrome field.

### Pill Button / Pill Link
**Role:** All interactive controls

Fully rounded (9999px radius) controls. Default: 8px vertical / 16px horizontal padding, 12–14px Neue Haas Unica Pro weight 700. Two variants: (1) Outlined — 1px #4490ff border, transparent fill, #4490ff text; (2) Solid — #4490ff fill, #ffffff text. No shadow, no hover transform, no state gradient.

### Roster Name Listing
**Role:** Talent directory display

Names rendered in #4490ff, Neue Haas Unica Pro weight 400 at 32px with 1.12–1.15 line-height, flowing as a continuous text block. Regional labels (US, UK) sit to the left as small #4490ff caps. No bullets, no dividers between names — periods separate them like a credit roll.

### Wordmark Lockup
**Role:** Brand identity stamp

The 'CHELSEA' wordmark set in three stacked lines (CH / EL / SEA.) at large size in Neue Haas Unica Pro weight 700, white, bottom-left anchored over imagery. The period after SEA. is deliberate — it functions as a redacted/censored signal and is part of the mark.

### Hairline Divider
**Role:** Section separation

1px line in #1f2937 or #ffffff at low opacity, used to separate the nav from the canvas and to section transitions where background color does not change. The only structural line in the system.

### Credit Caption
**Role:** Metadata under media

Small 12–14px Neue Haas Unica Pro weight 400, #f4efe9 or #4490ff, used for project titles, collaborator credits, or category labels. Often appears in the corners of media frames at 8–16px inset.

## Do's and Don'ts

### Do
- Use #4490ff as the only chromatic color in the system — every link, every accent, every focal dot uses it
- Set all interactive elements to 9999px border-radius for the pill shape that defines the brand
- Keep the canvas pure #000000; never introduce a card surface, a gray panel, or a light section mid-page
- Let media bleed edge-to-edge with zero margin, zero radius, and zero frame
- Use Neue Haas Unica Pro weight 400 for body and weight 700 only for the wordmark and button labels
- Set headlines and body at tight line-heights (1.0–1.15) to maintain the credit-roll density
- Use 8px for element gaps and 16px for component padding; jump to 96px between major sections

### Don't
- Do not introduce drop shadows, elevation layers, or card containers — the system is flat by design
- Do not add a second accent color or any warm tone; the palette is black + white + one blue
- Do not round images or media frames — they must be sharp rectangles bleeding to the viewport edge
- Do not use #0000ee or browser-default link blue; links must be #4490ff
- Do not add a visible logo block, nav background, or header bar — the nav is text floating on black
- Do not set body type above 1.5 line-height; the credit-roll feel depends on tight leading
- Do not introduce semantic colors (green/yellow/red) for status — the system has no UI states to encode

## Elevation

Zero elevation. The system treats depth as a sin: no shadows, no z-axis layering, no floating panels, no card lift. Media bleeds directly on the black canvas and type floats on the same plane. The single visual hierarchy device is the jump from #000000 to full-color photography, which is an absolute contrast rather than a soft elevation.

## Surfaces

- **Void Canvas** (`#000000`) — Base page background — every section, every gap, every margin is this color
- **Media Surface** (`#000000`) — Photographic and video content replaces the void — no surface transition, the canvas IS the background behind media

## Imagery

Photography and video are the entire visual system. Imagery is full-bleed, edge-to-edge, unmasked, with zero rounding and no frame. Treatment is cinematic and high-production: warm tungsten key lights, deep shadows, saturated color pockets against darker backgrounds — the aesthetic is music-video or indie film still, not corporate lifestyle. No illustration, no abstract graphics, no product shots. The people in the imagery are the roster — the work is self-portraiture of the talent. Imagery occupies 100% of the viewport in hero and section positions; there is no image-on-canvas composition, only image-as-canvas. A small blue focal dot is sometimes the only UI element overlaid on the photography.

## Layout

Full-bleed, edge-to-edge layout with no max-width container. The page reads as a vertical sequence of full-viewport-height screens: (1) a full-bleed photographic or video hero with a minimal top nav overlaid and a small wordmark bottom-left, (2) subsequent full-bleed media sections stacking vertically with generous 96px breathing gaps, (3) a terminal section that is pure black with a two-column text layout — tiny region labels (US, UK) left-aligned and a flowing block of talent names right-aligned. Navigation is a single thin horizontal row of four evenly-spaced text links with no background and no logo block. Content alignment is asymmetric: nav is spread across the full width, wordmark anchors bottom-left, text blocks pull left with a slight indent. The grid is implicit — there is no visible column structure, only full-width media and text that reads as a credit roll. Density is sparse between sections but tight within text blocks.

## Similar Brands

- **Anonymous Content** — Same black-canvas cinema aesthetic with full-bleed directorial photography and minimal text UI
- **RSA Films** — Talent roster presented as a viewing room — dark mode, pill links, single accent color, no card containers
- **Wieden+Kennedy** — Agency portfolio treated as art exhibition: black canvas, edge-to-edge imagery, skeletal nav
- **Somesuch** — Director roster with the same credit-roll name presentation and monochrome dark UI
