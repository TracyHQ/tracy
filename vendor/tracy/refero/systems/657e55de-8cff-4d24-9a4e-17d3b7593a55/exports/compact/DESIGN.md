# Home — Style Reference
> Swiss broadsheet behind a highlighter pen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Traffic Productions operates as a typographic poster dragged onto the web: a pale gray canvas framed by hairline black rules, a single fluorescent yellow that behaves like a marker pen, and a single typeface (Suisse) pushed to display sizes of 108px with aggressively negative tracking. The system rejects softness — no shadows, no rounded surfaces (except pill buttons), no gradients, no decorative imagery except monochrome photography treated as raw material. Layout is ruled-grid editorial: content lives inside thin black rectangles like entries in a printed specimen book, and the yellow accent is never decorative — it always labels, highlights, or marks an action. Density is compact, the type scale is extreme, and the overall feel is a Swiss production-house broadsheet that happens to scroll.

## Colors

| Name | Value | Role |
|------|-------|------|
| Highlighter Yellow | `#fff824` | Yellow supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink | `#151515` | Primary text, all borders and dividers, icons, nav links, button text — the near-black slightly softer than pure #000 used for most typographic and structural marks |
| Canvas | `#f3f3f3` | Page background, the off-white ground that prevents the design from reading as stark white — a subtle warmth that lets the black feel printed rather than digital |
| Pure Black | `#000000` | Icon fills, select structural marks, absolute contrast — used sparingly where maximum black is needed (SVG icon strokes, the heaviest emphasis) |
| Paper | `#e5e5e5` | Secondary surface tone, subtle differentiation beneath images or within contained blocks |

## Typography

### Suisse — Sole typeface — used for everything from 8px micro-labels to 108px display headlines. The extreme negative letter-spacing (-0.04em at display, -0.01em at body) and ultra-tight line-heights (0.96 at 108px) are the signature: type set like printed Swiss editorial, not web type. Weight 400 carries body and most UI; weight 700 appears in nav, labels, and occasional emphasis. The tight leading on massive sizes makes headlines stack into a single visual mass — the word 'TOUCH' reads as a black slab, not four letters.
- **Substitute:** Inter, Neue Haas Grotesk, Söhne
- **Weights:** 400, 700
- **Sizes:** 8px, 12px, 18px, 30px, 54px, 84px, 108px
- **Line height:** 0.89–1.17 (display sizes 0.93–0.96, body 1.17)
- **Letter spacing:** -0.01em at body, scaling to -0.044em at 108px display

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 18px | 1.17 | -0.18px |
| subheading | — | — | 30px | 0.89 | -0.6px |
| heading-sm | — | — | 54px | 0.93 | -1.62px |
| heading | — | — | 84px | 0.96 | -3.36px |
| display | — | — | 108px | 0.96 | -4.32px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 40-48px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **frames:** 0px
- **images:** 0px
- **labels:** 0px
- **buttons:** 9999px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Full-bleed horizontal bar, transparent over the canvas. Left: brand mark 'TRAFFIC PRODUCTIONS®' in 12px Suisse 700, Ink, uppercase, letter-spacing -0.12px. Right: nav items (WORK, SERVICES, ABOUT, CONTACT, TP®, WORK) in 12px Suisse 700, Ink, separated by 20px gaps. No background, no border, no logo lockup — text-only identity.

### Display Headline
**Role:** Hero and section-opening typography

108px Suisse 400, line-height 0.96, letter-spacing -4.32px, color Ink. Left-aligned, fills the full content width. At this size the negative tracking pulls characters together until the word reads as a single typographic mass. Weight stays 400 even at 108px — the system never uses bold for emphasis, only for labels.

### Large Section Headline
**Role:** Secondary section headers

84px or 54px Suisse 400, Ink, same tight leading (0.96 / 0.93) and proportional negative tracking. Used for mid-page headers like 'A non-agency offer for Brands…'. Always left-aligned, no underlines, no color.

### Yellow Label Bar
**Role:** Section/category markers

Rectangular bar filled #fff824, padding 2-4px vertical, containing uppercase 12px Suisse 700 Ink text (e.g. 'TRAFFIC', 'PRODUCTIONS', 'COOKIES'). No border, no radius — a literal highlighter swipe. Functions as the only way to mark or categorize content on the page.

### Bordered Frame Container
**Role:** Content grouping

Thin 1px border in Ink (#151515), radius 0, padding 20px. Used to group hero content, case study blocks, and contact information. The frame is the layout device — everything is either full-bleed or boxed in these black-ruled rectangles, evoking a printed page layout grid.

### Pill Button
**Role:** Action trigger (only used for cookies and a few controls)

9999px border-radius, 2-4px vertical padding, 8px horizontal padding. 12px Suisse 700 Ink text. Default: transparent background with Ink border. Active/filled: #fff824 background, Ink text, no border. The pill is the only rounded element in the entire system.

### Two-Column Body Text
**Role:** Editorial description blocks

18px Suisse 400, Ink, line-height 1.17, letter-spacing -0.18px. Arranged in two equal columns with ~40px gap. Short paragraphs (2-3 lines each), no drop caps, no pull quotes. Reads as a printed magazine column.

### Image Card with Caption
**Role:** Case study / project preview

Full-width B&W photograph, 0px radius, no border, no shadow. Caption above in 12px Suisse 700 Ink uppercase with yellow underline accent (e.g. 'A) HOUSE OF SCHWARZKOPF'). Photography is desaturated or monochrome — the system avoids color imagery so the yellow accent remains the only chromatic mark.

### Arrow Icon (↳)
**Role:** Link/list indicator

Thin stroke arrow glyph preceding nav items and footer links. Drawn in Ink at 12px, monoline. Functions as a typographic bullet — the angle and weight match Suisse's geometric character.

### Double Chevron Decoration (⇊)
**Role:** Hero accent / scroll indicator

Two stacked downward-pointing chevrons in Ink, 54px, placed in the bottom-right of the hero frame. A purely decorative typographic mark — no interactivity, no label. The geometric shape echoes the grid system.

### Footer / Contact List
**Role:** Site footer with location links and legal

Ink (#151515) full-bleed bar, light text. Left: 'ALL RIGHTS RESERVED 2026' in 12px. Right: 'LEGAL NOTICE', 'PRIVACY POLICY' links in 12px Suisse 700 with arrow prefixes. Above: two columns of city names (BERLIN, COLOGNE, HAMBURG, MUNICH) with arrow prefixes, same 12px size.

### Cookie Bar
**Role:** Compliance prompt

Black (#151515) full-width bar, 20px vertical padding. Left: 'COOKIES' label in 12px Suisse 700 on a #fff824 background bar. Right: Ink '✕' close button. This is the only place yellow + black interact as a button pair.

## Do's and Don'ts

### Do
- Use Suisse for every text element — no secondary typeface, no system fonts, no serif accents.
- Set display headlines at 108px with line-height 0.96 and letter-spacing -0.04em; never increase line-height to 'improve readability' — the tightness is the identity.
- Use #fff824 exclusively as a highlighter: label bars, text highlights, and button fills. Never as a background fill for large surfaces.
- Frame content blocks with 1px Ink (#151515) borders at 0px radius — the system is built on ruled rectangles, not cards with shadows.
- Use weight 700 only for labels, nav items, and footer links — body copy and headlines stay at 400.
- Keep spacing compact: 20px element gaps, 2-4px padding inside label bars, 40-48px between framed sections.
- Use 0px radius on every surface except the pill button (9999px) — the system is angular by default.

### Don't
- Do not introduce a second accent color — the system is monochrome plus one yellow. Adding any other hue breaks the highlighter logic.
- Do not use box-shadow, drop-shadow, or any form of elevation — the system is flat, printed, ruled.
- Do not use bold (700) for headlines or body emphasis — use size, tracking, or yellow highlight instead.
- Do not round corners on images, cards, or frames — the only curve in the system is the 9999px pill button.
- Do not use full-color photography — images should be monochrome or desaturated so the yellow remains the only chromatic mark on the page.
- Do not add gradients, blurs, or glassmorphism — the canvas is matte paper, not a screen.
- Do not increase line-height on display sizes — 0.96 at 108px is correct; loosening it destroys the typographic mass.

## Elevation

The system is deliberately shadowless. All separation is achieved through 1px Ink borders and the contrast between the #f3f3f3 canvas and the #151515 structural marks. This makes the design read as printed editorial — flat, ruled, and architectural — rather than as a software interface. Elevation is expressed through the grid of frames, not through z-axis depth.

## Surfaces

- **Canvas** (`#f3f3f3`) — Base page background, the printed-paper ground
- **Highlight** (`#fff824`) — Yellow label bars, action button fill, inline text highlights — functions as a physical marker on the page
- **Paper** (`#e5e5e5`) — Subtle secondary surface for differentiated content blocks
- **Ink** (`#151515`) — Dark surface for inverted blocks (footer, cookie bar) — black ground with light text

## Imagery

Photography is present but treated as raw editorial material: full-width, monochrome or desaturated, sharp edges, zero radius, no overlay text. The single image in the data (House of Schwarzkopf) is a B&W environmental portrait. No illustrations, no 3D, no abstract graphics. The only non-photographic visual elements are the geometric typographic marks (double chevron, arrows) drawn in the same Ink as text. Imagery occupies generous space when present but is sparse — most of the page is type and rules.

## Layout

Full-bleed page with a ruled-grid editorial layout. The hero is a single full-viewport frame with a massive left-aligned headline (108px) and a double-chevron mark bottom-right. Sections alternate between framed blocks (thin 1px black borders) and full-bleed bands. The contact/footer section uses a two-column 'GET IN TOUCH' display where one word sits left and one sits right, creating typographic asymmetry. Navigation is a single transparent bar — no sticky behavior visible. Content is always left-aligned, with two-column body text blocks for longer descriptions. Image blocks span full width beneath their caption labels. The overall rhythm is: massive type → framed block → type → full-bleed image → framed block → massive type → dark footer. Sections are separated by ~40-48px gaps, creating a poster-like cadence rather than a card-grid flow.

## Similar Brands

- **Bureau Mirko Borsche** — Same Swiss editorial typography pushed to display scale, same single-accent highlighter approach, same hairline-border framed layout, same refusal of shadows and rounded surfaces
- **Werkplaats Typografie** — Sole-typeface discipline with extreme size jumps from 8px caption to 100px+ display, tight negative tracking, monochrome palette with one chromatic mark
- **Heydays (Oslo)** — Ruled-rectangle layout grammar, compact spacing, all-black typography, geometric decoration marks instead of photographic content
- **Pentagram partner sites** — Editorial broadsheet treatment of an agency portfolio: massive set headlines, monochrome photography, typography as the primary visual, minimal chrome
