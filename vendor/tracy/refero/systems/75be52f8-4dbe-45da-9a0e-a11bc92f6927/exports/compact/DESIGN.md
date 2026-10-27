# Smiling Wolf — Style Reference
> Print magazine in monochrome.

Two-tone cream and near-black panels alternate like editorial spreads; monospace metadata stamps float over large display type with tight tracking.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Smiling Wolf uses an editorial Swiss-minimalist language: a warm off-white canvas (#f7f3f0) and near-black surfaces (#131713) alternate to create a strict two-tone rhythm, with no chromatic accent, no gradients, and no shadows anywhere. Typography carries the entire brand voice — a custom display serif/sans hybrid (Bagoss Standard) speaks at large sizes with tight negative tracking and near-unity line-heights, while a wide-tracked monospace (General Grotesque Mono) stamps every label, tag, and metadata line in uppercase 9-10px. All corners are 4px sharp. The result reads like a print magazine spread — high-contrast blocks, generous negative space, hairline dividers, and a refusal of decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone | `#f7f3f0` | Page canvas, card surfaces, dark-section text — warm off-white that keeps the page from feeling clinical |
| Obsidian | `#131713` | Primary text on light canvas, dark-section backgrounds, inverse-surface text — near-black with a barely-perceptible green undertone |
| Carbon | `#000000` | Hairline borders, dividers, link strokes — the structural outline color; appears 1340× as border, defining every panel edge |
| Ash | `#bebcb9` | Secondary borders, inactive dividers — a step lighter than Carbon for de-emphasized edges |
| Graphite | `#858582` | Muted helper text, secondary metadata, label text — sits at AA on dark and fails on light, so it belongs in the dark sections and monospace stamps |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Bagoss Standard — Primary typeface for headings, subheadings, and body — weights 385 and 520 are near-custom; the 520 medium at 59-63px with -0.02em tracking is the display voice, the 400 at 14-20px is body
- **Substitute:** Söhne, Inter, or General Sans at matching weights
- **Weights:** 385, 400, 520
- **Sizes:** 14, 20, 59, 63
- **Line height:** 0.98–1.40
- **Letter spacing:** -0.0200em at display (59-63px), -0.0100em at subheading, 0.0100em at body
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### General Grotesque Mono — All-caps metadata, category labels, footer blocks — the 0.10em positive tracking at 9-10px is the signature stamp: every nav item, tagline, and micro-label uses it
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Berkeley Mono
- **Weights:** 400
- **Sizes:** 9, 10
- **Line height:** 1.60
- **Letter spacing:** 0.1000em
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.4 | 0.14px |
| subheading | — | — | 20px | 1.15 | -0.2px |
| display | — | — | 59px | 0.98 | -1.18px |
| display-lg | — | — | 63px | 1 | -1.26px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 60-80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **tags:** 4px
- **cards:** 4px
- **images:** 4px
- **buttons:** 4px

## Components

### Display Headline
**Role:** Hero and section titles

Bagoss Standard weight 520 at 59-63px, line-height 0.98-1.0, letter-spacing -0.02em, color #131713 on Bone or #f7f3f0 on Obsidian. The near-unity line-height makes multi-line headlines lock into a tight block.

### Monospace Metadata Label
**Role:** Category tags, nav items, footer labels, timestamps

General Grotesque Mono weight 400, 9-10px, line-height 1.6, letter-spacing 0.10em, uppercase. Color: #131713 on Bone, #f7f3f0 on Obsidian, or #858582 for de-emphasized.

### Hairline Divider
**Role:** Section and row separators

1px solid #000000 border, full-width or proportional. Appears 1340× in the data — the most-used visual element. No rounded corners.

### Image Card
**Role:** Project thumbnails, journal hero images

4px border-radius, 1px #000000 border, full-bleed image with no overlay text. The border is structural, not decorative.

### Outlined Action Border
**Role:** Featured/metadata badge borders

1px solid #000000, 4px radius, padding 6px 10px. Contains uppercase monospace text at 9-10px. No fill — ghost style.

### Dark CTA Panel
**Role:** Contact/hero conversion sections

Full-bleed #131713 background. Left: 59-63px display headline in #f7f3f0. Right: stacked list of three monospace CTA links (e.g., 'Start a Project →', 'Say Hello →', 'Call Us →') separated by 1px #f7f3f0 hairline dividers, each row 60px tall, with a right-aligned arrow in #f7f3f0.

### Footer Block
**Role:** Site footer with contact details and nav

Bone background, 1px Carbon top border. Three monospace columns: left = contact email, center = social links, right = physical address. 9-10px uppercase, 0.10em tracking. Logo mark bottom-left in #131713.

### Top Navigation Bar
**Role:** Primary site navigation

Bone background, no border. Left: logo + 'SMILING WOLF' monospace stamp. Center: 'BRAND & DIGITAL AGENCY' monospace descriptor. Right: 'WORK ABOUT JOURNAL CONTACT' monospace nav, 9-10px, 0.10em tracking. Fixed-height, generous horizontal padding.

### CTA Link Row
**Role:** Action items in the dark panel

Full-width row, 60px height, 1px bottom border in #f7f3f0 (on Obsidian) or #000000 (on Bone). Left-aligned monospace label, right-aligned arrow character (→). Hover: no fill change, arrow translates 4px right.

### Project Grid Card
**Role:** Featured work thumbnails in the journal/work grid

Two-column grid on the work index. Each card: 4px radius, 1px #000000 border, image fills card edge-to-edge, monospace category label overlaid or positioned below in 9-10px.

## Do's and Don'ts

### Do
- Use only the five neutrals — Bone #f7f3f0, Obsidian #131713, Carbon #000000, Ash #bebcb9, Graphite #858582. No chromatic color, ever.
- Set display headlines in Bagoss Standard weight 520 at 59-63px with -0.02em tracking and line-height 0.98-1.0.
- Stamp all metadata, labels, and nav in General Grotesque Mono 9-10px uppercase with 0.10em tracking.
- Alternate sections between Bone and Obsidian full-bleed — never blend them with gradients or shadows.
- Use 4px border-radius on every rectangular element (cards, images, tags). No exceptions.
- Separate content with 1px #000000 hairlines, not spacing alone.
- Keep element gaps at 10px and section gaps at 60-80px; the rhythm depends on tight clustering punctuated by large breaks.

### Don't
- Don't introduce any color outside the five neutrals — no blues, no reds, no accents.
- Don't use shadows, glows, or blurs for elevation. Use surface flips and hairlines.
- Don't round corners beyond 4px. The design is structurally sharp.
- Don't set body copy above 20px or below 14px — the type scale is intentionally narrow.
- Don't use sans-serif for headings. Bagoss Standard carries the brand; system sans is only for sub-12px utility text.
- Don't set monospace text at sizes above 10px — the small stamp size is what makes it function as a label, not a heading.
- Don't use centered body text. The layout is left-aligned with tight tracking.

## Elevation

Zero shadows. All separation is achieved through: (1) alternating Bone/Obsidian surface flips, (2) 1px hairline borders in Carbon, and (3) generous negative space. The design treats shadow as an admission of weak layout — every panel edge is either a color change or a 1px line.

## Surfaces

- **Bone Canvas** (`#f7f3f0`) — Default page background — warm off-white dominates the work and editorial sections
- **Obsidian Panel** (`#131713`) — Full-bleed dark sections — hero CTA panels, footer, and alternating bands that flip the type to Bone

## Imagery

Imagery is minimal and editorial: project thumbnails appear as rectangular crops with 4px corners and 1px Carbon borders, presented in a two-column grid. No lifestyle photography, no decorative illustration, no abstract graphics. When present, photographs are tightly cropped, natural-color, and treated as document scans rather than brand assets. The dominant visual is typography itself — the 59-63px display headlines and the wide-tracked monospace stamps are the imagery.

## Layout

Full-bleed page with alternating surface bands. The dark CTA panel uses a two-column split: left half holds a 59-63px display headline, right half stacks three monospace CTA rows separated by 1px hairlines. The light sections use a max-width ~1200px centered container. The work grid is a two-column card layout with equal gutters. Navigation is a single fixed-height top bar with logo-left, descriptor-center, nav-right. The footer is a three-column monospace block beneath a 1px Carbon rule. Sections breathe with 60-80px vertical gaps; internal element gaps stay at 10px.

## Similar Brands

- **Pentagram** — Same editorial two-tone surface alternation and oversized display type against restrained monochrome palette
- **Manual (manualcreative.com)** — Shared wide-tracked monospace metadata stamps and 1px hairline-divided content rows
- **Studio Dumbar** — Same Swiss-minimalist restraint: warm off-white canvas, near-black inverse panels, custom display serif, zero shadows
- **Locomotive (locomotive.ca)** — Agency sites that use compact monospace labels and tight negative-tracking display headlines in a strict two-color system
