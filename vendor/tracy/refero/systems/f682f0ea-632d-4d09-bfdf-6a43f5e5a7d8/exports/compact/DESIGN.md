# Operate — Style Reference
> Botanist's data terminal

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Operate reads like a research instrument placed on a herbarium paper: a muted green-gray canvas hosts data plots, dotted timelines, and axis-labeled diagrams as if the page itself were a botanical scatter chart. Typography is small-set and tight-tracked, with one decorative all-caps face (cinetype) reserved for axis labels, tags, and metadata — the effect is scientific, not promotional. Color is almost entirely a mono-green family: dark forest text on a sage paper background, with a single soft mint (#85c093) for the only filled action and occasional deep-emerald (#007010) for links and borders. Components are flat and hairlined: 4px and 12px radii, 0.5px inset borders instead of drop shadows, and almost no elevation. Density is compact and information-first — the page behaves like a control panel where whitespace is a measured gap, not a luxury.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#09352e` | Primary text, icons, and chart strokes — the load-bearing dark color. Reads near-black but carries a cool green undertone that ties the monochrome system together |
| Bone White | `#ffffff` | Card surfaces, data point fills, and reverse text on dark blocks |
| Sage Paper | `#e0e0e0` | Page canvas and large background fields. A green-tinted light gray that gives the whole surface its herbarium character |
| Ash Gray | `#e5e5e5` | Alternate surface tone for nested blocks, inset panels, and subtle differentiation beneath cards |
| Muted Sage | `#77aa83` | Soft fill washes, scatter plot halos, and decorative surface tints that sit behind darker data marks |
| Lichen | `#cad3d2` | Hairline borders, dotted gridlines, and chart axes. The structural line color when a neutral needs to be present without competing with text |
| Slate Smoke | `#6c7a79` | Secondary metadata, icon strokes, and caption text where the body tone is too heavy |
| Charcoal Bark | `#29211e` | Deep text, heavy borders, and dark surface blocks. Slightly warm-neutral, used for the rare dark panel and strong dividers |
| Moss | `#85c093` | The single filled action color — primary buttons, active state fills, and the rare chromatic surface. A soft, slightly desaturated mint that does not shout against the sage canvas |
| Deep Fern | `#007010` | Green text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Pine | `#117025` | Green text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Emerald | `#008023` | Alternate data-mark fill and emphasis backgrounds, used on scatter plot points and callout chips |
| Indigo Accent | `#433787` | A single chromatic exception — used on one special link or annotation to break the green-only system. Employ rarely; treat as a punctuation mark, not a palette member |

## Typography

### denim — Primary workhorse — body copy, headings, and UI text. Weight 500 is used for headings and emphasis; weight 400 carries all body. Tracking sits at a slightly open +0.012em at body sizes, making the face feel like a working tool rather than a display face.
- **Substitute:** Inter, IBM Plex Sans, or Söhne
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 32px, 48px
- **Line height:** 1.11–1.63
- **Letter spacing:** 0.012em at body sizes; tightening to near-zero on display sizes (48px).
- **OpenType features:** `"liga" 0`

### muoto — Compact UI sans for tags, labels, captions, axis tick text, and micro-copy. Tight negative tracking (-0.009 to -0.012em) at 11–13px makes it dense and instrument-like rather than friendly. Weight 500 is reserved for uppercase labels.
- **Substitute:** IBM Plex Mono, Geist Mono, or JetBrains Mono at slightly reduced size
- **Weights:** 400, 500
- **Sizes:** 11px, 12px, 13px
- **Line height:** 1.17–1.62
- **Letter spacing:** -0.009em to -0.012em
- **OpenType features:** `"liga" 0`

### cinetype — Decorative tracking-heavy display face used only on ALL-CAPS labels, axis titles, and stamp-like badges. Tracking swings from a tight -0.008em to an extreme +0.30em, which is the visual signature of the system — it produces the 'specimen label' feel on tags and section markers.
- **Substitute:** Söhne Mono, JetBrains Mono, or Suisse Int'l Mono with manual letter-spacing
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.14–1.19
- **Letter spacing:** -0.008em to +0.30em (the wide end is exclusive to uppercase decorative labels)
- **OpenType features:** `"liga" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.38 | -0.132px |
| body | — | — | 14px | 1.5 | 0.168px |
| body-lg | — | — | 16px | 1.44 | 0.192px |
| subheading | — | — | 18px | 1.4 | 0px |
| heading-sm | — | — | 20px | 1.35 | 0px |
| heading | — | — | 32px | 1.17 | 0px |
| display | — | — | 48px | 1.11 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 4px
- **cards:** 12px
- **buttons:** 12px
- **hero-blocks:** 24px
- **large-panels:** 18px

## Components

### Sage Paper Card
**Role:** Standard content card sitting on the green-gray canvas.

Bone White (#ffffff) surface, 12px radius, 20px padding, 0.5px inset hairline border in #cad3d2. No drop shadow. Used for the upper-right info panel and most grouped content blocks. The card should feel like a piece of paper laid on the canvas — flat, slightly lifted only by its white fill.

### Pill Tag (cinetype label)
**Role:** Uppercase metadata tag, axis label, or status badge.

4px radius, transparent or very-light fill, 1px border in Forest Ink (#09352e) or Lichen (#cad3d2). Text is cinetype at 12px, weight 400, letter-spacing +0.30em, uppercase, color Forest Ink. This is the system's signature decorative element — use for any label that should feel 'stamped' rather than written.

### Filled Mint Button
**Role:** The only chromatic filled action in the system.

Background Moss (#85c093), text Forest Ink (#09352e), 12px radius, padding 10px 20px, denim weight 500 at 14px. This is the lone filled button — every other action takes a non-filled variant. The soft mint against dark forest text keeps the button from feeling aggressive against the sage canvas.

### Outlined Button
**Role:** Secondary action.

Transparent background, 0.5px inset border in Forest Ink (#09352e), 12px radius, padding 10px 20px, denim weight 500 at 14px, text Forest Ink. Used for non-primary actions and form submission alternatives.

### Ghost Text Link
**Role:** Inline navigation and bracketed text links.

No background, no border, denim at 14px weight 500, color Deep Fern (#007010). Often wrapped in square brackets [ like this ] to create the system-wide 'annotation' feel. Underline appears only on hover.

### Scatter Data Point
**Role:** A data point on the page-as-chart visual.

Two states: hollow circle (stroke Forest Ink 1px, fill transparent, 8px diameter) and filled circle (fill Bone White or Emerald, 6–8px). Optional inner dot for highlighted points. Always sits on the Sage Paper canvas — no card behind it.

### Timeline Node
**Role:** Connected dot in a data timeline.

Bone White (#ffffff) filled circle, 10px diameter, 0.5px Forest Ink border, connected by a 1px Forest Ink hairline path. The timeline reads like a plotted sequence rather than a process diagram.

### Floating Round Chip
**Role:** Compact floating callout used for inline questions or status pings.

Background Forest Ink (#09352e) or Charcoal Bark (#29211e), text Bone White, 9999px radius (pill), padding 6px 12px, muoto at 12px weight 500. Sits absolutely positioned over the data viz.

### Axis Bracket Label
**Role:** Edge-of-canvas label that frames a section as a chart axis.

muoto at 12px weight 500, color Forest Ink, with a leading bracket glyph ('[ Chaos ]' / '[ Clarity ]'). Used at the top and bottom of major sections to reinforce the page-as-chart metaphor. Letter-spacing tight (-0.01em).

### Hairline Section Divider
**Role:** Thin separator between content bands.

1px line in Lichen (#cad3d2) or 0.5px inset in #cad3d2. No vertical bars or heavy rules — dividers are always one hairline, often dotted.

### Dark Inverse Panel
**Role:** Rare dark section for emphasis or terminal-feel content.

Background Charcoal Bark (#29211e) or #1a191a, text Bone White, 12px radius, 20px padding. Used only when the design needs to invert — no shadows, just a flat dark fill against the sage canvas.

### Version Stamp (footer)
**Role:** Rotated side-margin label, like a document version mark.

muoto at 11px, color Forest Ink, rotated 90° (or written vertically), positioned at the extreme left or right margin. Carries build date, section ID, or page version. Pure decoration-as-information.

## Do's and Don'ts

### Do
- Use Moss (#85c093) only for the single most important action per screen — every other action should be outlined, ghost, or text-only.
- Set card radius to 12px and tag radius to 4px consistently; reserve 18–24px exclusively for hero-scale panels.
- Use cinetype with +0.30em letter-spacing for any uppercase label that should feel like a specimen tag or axis title.
- Wrap inline links in square brackets [ like this ] to keep the page's annotation feel consistent.
- Place section titles at the canvas margin with muoto at 12px weight 500 in Forest Ink, preceded by a bracket glyph.
- Keep the canvas at Sage Paper (#e0e0e0) edge-to-edge — do not introduce a white page background anywhere on the layout.
- Use inset 0.5px hairlines in Lichen (#cad3d2) for card borders instead of 1px+ drop shadows.

### Don't
- Do not add a second chromatic action color — if Moss (#85c093) is taken, use an outlined Forest Ink button, not a different fill.
- Do not use cinetype for body copy or long headings — its wide tracking makes it illegible below 14px and above two words.
- Do not introduce drop shadows stronger than 6% opacity — the system is flat, and heavy shadows break the herbarium feel.
- Do not use pure black (#000000) for body text — Forest Ink (#09352e) carries the green undertone that makes the palette cohere.
- Do not put data points on a card — they belong directly on the Sage Paper canvas so the page itself reads as a chart.
- Do not use the Indigo Accent (#433787) more than once per page — it is punctuation, not a palette member.
- Do not use a white page background; the sage canvas is a structural choice, not a fill.

## Elevation

- **Card hover:** `rgba(9, 53, 45, 0.05) 0px 5px 6px -4px, rgba(174, 202, 197, 0.08) 0px 1px 1px 0.5px`
- **Card border:** `rgb(202, 211, 210) 0px 0px 0px 0.5px inset`
- **Hairline divider:** `rgb(224, 229, 229) 0px -0.5px 0px 0px inset`

## Surfaces

- **Sage Paper Canvas** (`#e0e0e0`) — The page field — where the entire layout sits, evoking graph paper or herbarium sheet.
- **Ash Block** (`#e5e5e5`) — Slightly recessed surface used beneath or around cards to create a shallow stepped hierarchy.
- **Bone Card** (`#ffffff`) — Card and panel surface — the only place where true white enters the system, giving cards a quiet lift off the green-gray canvas.
- **Charcoal Block** (`#29211`) — Rare dark surface for inverse sections, callout panels, or terminal-feeling blocks.

## Imagery

Imagery is minimal and scientific — no lifestyle photography, no product screenshots, no human faces. The dominant visual is data-as-illustration: scatter plots of circles, timelines of connected dots, axis brackets, and small hand-drawn wave doodles used as section dividers. When icons appear, they are 1px-stroke line icons in Forest Ink, 16–20px, monoline. The aesthetic borrows from botanical illustration, lab notebook diagrams, and vintage research charts — flat, annotated, and information-first.

## Layout

The page is a full-bleed sage canvas with no strict container — content sits within an implied 1280px wide working area, but data elements (scatter points, axis labels) are allowed to drift to the canvas edges. The hero is a single oversized scatter plot / timeline that occupies most of the viewport, with a small info card floating in the upper-right quadrant and a round 'What's New?' chip pinned to the lower-left. Sections are separated by hairlines rather than background-color changes, and each section carries bracket-style axis labels at its top and bottom margins ('[ Chaos ]' left, '[ Clarity ]' right). Vertical rhythm is 64px between sections, 8px between inline elements, 20px inside cards. The layout reads as a single instrument panel rather than a stacked page of bands.

## Similar Brands

- **Linear** — Same mono-accent approach with one vivid color doing the work of ten, plus tight custom-feeling typography and flat surfaces.
- **Vercel** — Same hairline-bordered, nearly-shadowless component language and a near-monochrome palette that uses the canvas itself as a color.
- **Observable** — Treats the page as a data canvas with bracket labels, axis-style annotations, and mono-color chart elements that feel like a research notebook.
- **Arc** — Same small-set UI sans plus decorative tracking-heavy display face pairing, and the same flat hairlined cards on tinted canvas.
- **Are.na** — Shares the herbarium/archival aesthetic — muted paper-toned canvas, tiny annotated labels, and a refusal of glossy SaaS conventions.
