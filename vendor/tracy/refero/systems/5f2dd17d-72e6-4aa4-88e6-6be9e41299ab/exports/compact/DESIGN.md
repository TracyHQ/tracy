# Yuga — Style Reference
> Black gallery with neon lime punctuation

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Yuga operates as a void-gallery: pure black canvases, pure white typography, and a single chartreuse flare that reads like neon in a darkroom. The system is brutally reductive — two tones carry the entire interface, with a third acid-lime color reserved for accent strips and decorative punctuation rather than action. Typography is monumental: ultra-tight tracking, crushed line-heights below 0.9 even at 100px+, and a custom geometric grotesque pushed to display sizes that fill viewports. Components are rounded generously (30–90px radii), creating a softness that contrasts with the otherwise severe monochromatic space. The halftone dot field and pixelated logo dissolve act as the only ornamentation, reinforcing a digital-art-meets-exhibition-hall atmosphere where content is the artifact and the chrome stays out of the way.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, card surfaces, footer background — the dominant black field that swallows everything except typography and accent |
| Charcoal | `#131313` | Elevated card surface above Void, hover-state surfaces — barely lighter than canvas, creates whisper-quiet depth |
| Pure | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Acid Lime | `#d3de5d` | Decorative accent strip, highlight washes, section punctuation — chartreuse against matte black creates voltage; never used for text or buttons |

## Typography

### AK Monument Grotesk — Single typeface carries the entire system. Weight 200 for massive display creates a featherlight monumental effect at 102–160px; weight 700–800 for 'BUILDING.'-style statements; weight 400 for body and nav. Crushed line-heights (0.78–0.83 at display sizes) eliminate inter-line space and let type stack into graphic blocks rather than paragraphs. Tight letter-spacing (-0.02em to -0.03em) pulls letters into near-solidity at large sizes.
- **Substitute:** Space Grotesk, Inter, or any geometric grotesque with tight default tracking
- **Weights:** 200, 400, 700, 800
- **Sizes:** 14, 16, 24, 26, 32, 52, 102, 160
- **Line height:** 0.78, 0.82, 0.83, 0.90, 0.94, 1.00, 1.10
- **Letter spacing:** -0.02em at body sizes, -0.03em at display sizes
- **OpenType features:** `no detected features`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.1 | -0.02px |
| body-sm | — | — | 16px | 1 | -0.02px |
| body | — | — | 24px | 0.9 | -0.02px |
| subheading | — | — | 26px | 0.94 | -0.02px |
| heading-sm | — | — | 32px | 0.83 | -0.03px |
| heading | — | — | 52px | 0.82 | -0.03px |
| heading-lg | — | — | 102px | 0.78 | -0.03px |
| display | — | — | 160px | 0.78 | -0.03px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 20-30px
- **Element gap:** 15-30px

### Border Radius

- **cards:** 30px
- **links:** 40px
- **buttons:** 90px

## Components

### Inverse Pill Button
**Role:** Primary call-to-action in the system

90px border-radius (full pill), 20px vertical padding, 30px horizontal padding, background #ffffff, text #000000 in AK Monument Grotesk weight 400–700. The extreme radius pushes the button into capsule territory, softening the otherwise severe black canvas. No shadow, no border — the shape itself is the affordance.

### Ghost Nav Link
**Role:** Header and footer navigation

40px border-radius, no fill, text #ffffff in 14px weight 400 with -0.02em tracking. Sits inline as a quiet underline-free link, relying on position and context to read as navigation rather than visual weight.

### Collection Card
**Role:** Featured project tiles in the collections grid

30px border-radius, background #131313 (Charcoal) on #000000 canvas, 30px padding. Centered artwork or logo (white on dark), title in 24–32px weight 700. Cards sit in a horizontal scroll or grid with generous gutter spacing (30–40px).

### Hero Display Block
**Role:** Full-viewport opening statement

Centered or left-aligned headline at 102–160px weight 200, line-height 0.78, letter-spacing -0.03em. Single sentence (e.g. 'BUILDING.'). Set against pure #000000 with optional halftone dot field as background texture. No supporting illustration — the typography IS the hero.

### Acid Lime Accent Strip
**Role:** Side decoration or section separator

Vertical bar in #d3de5d, typically 4–8px wide, running full-height of a section. Acts as a neon signpost against the black field. Never carries text or interactive content — purely decorative voltage.

### Halftone Dot Field
**Role:** Background texture for hero and transition zones

Repeating grid of small white circles (2–3px diameter) on #000000, with a radial gradient mask that fades dots to zero density at the edges. Creates a vignette of pixel-noise that frames central content and dissolves into pure black at the margins.

### Pixelated Logo Mark
**Role:** Brand mark and animated identity element

Geometric letterform built from rounded-square blocks in #ffffff. Reads as 8-bit/modular at rest, can animate into scattered particles. Functions as the visual anchor across all pages — the only iconography that needs to exist.

### Section Heading
**Role:** Mid-page section titles like 'OUR COLLECTION'

52–102px weight 700 or 200, line-height 0.82–0.94, left-aligned or centered, #ffffff. Sits with 40px+ vertical breathing room above and below. Followed immediately by content with no subtitle — the heading carries the full weight of section entry.

### Footer Bar
**Role:** Persistent site footer

Fixed-bottom, full-width, #000000 background with a single 1px hairline #ffffff divider at top. Left-aligned brand name 'Yuga Labs' in 14px weight 400, right-aligned nav links in matching style. Minimal — two text elements and a line, nothing else.

### Badge Tag
**Role:** Optional category or status marker

40px border-radius (pill), 6–12px vertical padding, 20px horizontal padding, background #131313 or #d3de5d, text in 14px weight 700. Rare — only appears when categorization is needed; not a primary UI pattern.

## Do's and Don'ts

### Do
- Set hero and section headlines at 52–160px in AK Monument Grotesk weight 200, line-height below 0.85, letter-spacing -0.03em
- Use #000000 for all page backgrounds and #ffffff for all primary text — never introduce mid-gray text colors
- Apply 90px border-radius to all buttons, 40px to nav links and tags, 30px to cards — these three radii define the system
- Reserve #d3de5d for decorative accent strips and washes only; never place it on text or interactive surfaces
- Let typography fill the viewport — single-sentence hero statements at display sizes with generous margin breathing room
- Use the halftone dot field only as a radial-fade background texture behind hero content, fading to pure black at edges
- Maintain full-bleed layouts — do not introduce a centered max-width container; the dark field should extend edge to edge

### Don't
- Do not introduce additional colors — the two-tone black/white system with one acid lime accent is the entire palette
- Do not add box-shadows to cards or buttons; the design relies on flat depth via surface color shifts only
- Do not set body text below 16px or above 26px — the type scale jumps aggressively to display sizes
- Do not use line-height above 1.1 at any size; the system is defined by its compressed vertical rhythm
- Do not use #d3de5d for button fills, text, or link borders — it is decoration, never interaction
- Do not add secondary fonts; AK Monument Grotesk (or substitute) carries every text role from caption to display
- Do not round corners below 30px on any surface element; sharp or small radii break the system's softness

## Elevation

Elevation is communicated through surface color alone, never through shadows. The stack goes: #000000 canvas → #131313 card → #ffffff inverse fill. There is no blur, no drop-shadow, no glow. Depth exists only as a whisper of lightness against the void — one step up from absolute black for elevated surfaces, and a full inversion for the most prominent elements like the logo and inverse buttons.

## Surfaces

- **Void Canvas** (`#000000`) — Page background, the absolute base
- **Charcoal Plate** (`#131313`) — Elevated card surface, used for collection cards and feature panels
- **Acid Wash** (`#d3de5d`) — Accent strip, decorative side bar, highlight zone
- **Pure Surface** (`#ffffff`) — Inverse fill for logo marks, inverse button states

## Imagery

The visual language is split between three modes: (1) typographic-first screens where the headline IS the image — no illustration, no photography, just monumentally scaled letterforms on void; (2) artwork showcases for collection cards featuring flat white-on-black graphic marks (skull illustrations, geometric logos) with no backgrounds, shadows, or product staging; (3) the halftone dot field as generative texture, acting as the only atmospheric graphic. No lifestyle photography, no 3D renders, no gradients. The aesthetic references 8-bit pixel art, brutalist print, and gallery-wall minimalism equally.

## Layout

Full-bleed page model with no centered max-width constraint — content extends to viewport edges. Hero sections are full-viewport with centered or left-aligned display type over a halftone dot field. Section rhythm flows as alternating density: sparse type-driven sections followed by dense card grids, separated by 40px+ vertical gaps. The collection area uses a horizontal card row (2–3 visible cards at 30px radius, 30–40px gutters) that may scroll horizontally. Navigation is minimal — a single text line in the footer plus occasional inline links, no top bar or sticky header. Content asymmetry is common: left-aligned headings with right-aligned or off-grid supporting elements, creating a curated-gallery walkthrough rather than a standard SaaS page flow.

## Similar Brands

- **Otherside (Yuga Labs sister brand)** — Same custom geometric grotesque, same monochrome void-canvas approach, same reliance on monumental type over imagery
- **BAYC (Bored Ape Yacht Club site)** — Shared black-canvas gallery treatment with white pixel-style mark and acid yellow accent strip
- **RTFKT** — Crypto-native brand using single-vivid-accent-against-black with oversized display typography
- **Doodles** — Dark-mode NFT brand using minimal type-driven layout and a single decorative color as punctuation
- **Rhizome / digital art institutions** — Gallery-wall severity: pure black, white only, content as artifact — the system borrows exhibition design language rather than SaaS conventions
