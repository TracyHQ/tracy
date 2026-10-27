# Opennote — Style Reference
> warm leather journal on sunlit paper — the interface feels hand-bound, not engineered

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Opennote speaks in the voice of a well-loved notebook: warm cream paper, serif headlines that feel hand-set, and a dark-sepia CTA that reads like a leather binding rather than a SaaS button. The palette is almost entirely achromatic — ivory canvas, charcoal ink, hairline graphite rules — with four dark chromatic accents (sepia, ink-violet, forest, oxblood) used sparingly as marginalia, never as fills. Chrome is minimal: a 10px radius, a single border tone, and almost no shadow. Whitespace carries the layout, broken up by hand-drawn line illustrations that float like doodles in a margin. The result is a product that looks like it was designed in a studio with good natural light, not a dashboard that was optimized in a sprint.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ivory Page | `#fffdf8` | Primary canvas, page background, card surface. Warm off-white reads as paper, not screen |
| Ink Charcoal | `#0a0a0a` | Primary text, icon strokes, body copy. Near-black with a touch of warmth against the ivory canvas |
| Pressed Black | `#000000` | Illustration fill, SVG marks, fine ink details. Hard black reserved for the hand-drawn graphics layer |
| Graphite Rule | `#e5e5e5` | Hairline borders, dividers, card outlines, image frames. The dominant structural neutral — everything thin on the page is drawn with this |
| Smoke | `#8c8c8c` | Muted helper text, captions, secondary metadata. Reads as pencil-gray against ivory |
| Ash Border | `#d1d1d1` | Button borders, outlined-control frames, slightly heavier than Graphite Rule |
| Slate Body | `#474747` | Secondary body copy, subdued icon detail, supporting prose |
| Soft Halo | `#f9f9f9` | Alternate surface, recessed panels, secondary card backgrounds beneath the primary ivory |
| Sepia | `#512906` | Primary action fill, filled CTA buttons, key accent text. Dark warm brown reads as leather binding — the brand's single chromatic commitment to interface weight |
| Ink Violet | `#242d64` | Feature-panel surface, deep accent headings, large display blocks. The nocturnal counterpart to ivory — used as a full bleed to break the paper rhythm |
| Forest Ink | `#0c3b1a` | Secondary accent text, category tags, decorative strokes. Saturated dark green used the way a fountain-pen user might switch inks |
| Oxblood | `#5e0831` | Tertiary accent, pull-quote emphasis, rare highlight text. The most restrained of the ink colors — deployed once or twice per page at most |
| Margin Yellow | `#ffc934` | Decorative highlighter wash, accent backgrounds, illustration fill. The single vivid color — used as a flat block behind a handful of illustrations and never on chrome |

## Typography

### IowanOld — All headlines, hero text, feature titles, and emphasis blocks. The serif carries the 'notebook' voice — its oldstyle proportions, small contrast, and bracketed serifs read as editorial print, not product UI. Weight 400 at 42–48px lets the type feel set, not shouted; weight 500 reserved for the smallest display lines. IowanOld is a custom brand face; substitute with Source Serif Pro, Tiempos Text, or PT Serif.
- **Substitute:** Source Serif Pro
- **Weights:** 400, 500
- **Sizes:** 16px, 20px, 32px, 42px, 48px
- **Line height:** 1.08–1.50

### SuisseIntl — All body copy, navigation, button labels, footer text, utility chrome. The neo-grotesque companion stays quiet so the serif can lead. Line-height 1.00 is reserved for the smallest UI text inside compact controls; 1.50 for body paragraphs. SuisseIntl is a custom brand face; substitute with Inter, Söhne, or Helvetica Neue.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.00–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 32px | 1.12 | — |
| heading | — | — | 42px | 1.1 | — |
| display | — | — | 48px | 1.08 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 10px
- **cards:** 10px
- **buttons:** 10px

## Components

### Sepia Filled CTA
**Role:** Primary action button

Background #512906, text #fffdf8, SuisseIntl 14px weight 400, line-height 1.00, padding 8px 16px, radius 10px. The dark warm brown against ivory paper is the brand's signature interaction surface — it reads as a leather label on a book cover. No border, no shadow, no hover elevation — the button just deepens slightly on hover.

### Outlined Ghost Button
**Role:** Secondary action, "Get started free" in header

Transparent background, 1px border #d1d1d1, text #0a0a0a, SuisseIntl 14px, padding 8px 16px, radius 10px. Used when the filled Sepia would compete with the primary action. On dark Ink Violet panels, the border inverts to a light hairline and text becomes ivory.

### Tab Navigation
**Role:** Section-level tab switcher above feature panels

Horizontal row of text-only tabs in SuisseIntl 14px, color #8c8c8c inactive / #0a0a0a active, separated by ~24px gaps. The active tab is the only one without a visual treatment — just a color shift and an underline. No background, no pill, no border.

### Ink Violet Feature Panel
**Role:** Hero feature surface, the single dark section in a page

Full-width surface #242d64, padded generously (40px+ on all sides), with #fffdf8 text. The headline is IowanOld 32–42px and the supporting body SuisseIntl 16px in #fffdf8. A single ghost button with light hairline border anchors the bottom-left. This panel is the page's reset moment — it is the only place the interface stops being paper and starts being book cover.

### University Logo Strip
**Role:** Social proof band beneath the hero

Single row of monochrome wordmark logos (Michigan, NUS, Yale, Waterloo, Caltech, Stanford, CMU, Princeton) set in #0a0a0a on #fffdf8, evenly distributed with ~40px gaps. No card, no background, no caption — the logos float directly on the canvas. Height is the natural cap-height of the marks; no equal-height forcing.

### Centered Hero Block
**Role:** Above-the-fold headline + illustration + single CTA

A small hand-drawn line illustration sits centered above an IowanOld 42–48px headline (#0a0a0a) on a #fffdf8 canvas. The headline is two lines, centered, with a single filled Sepia CTA directly beneath. Generous vertical breathing room (80–120px above and below) — the hero is a single beat, not a stacked column.

### Marginalia Illustration
**Role:** Decorative line drawings scattered around feature sections

Hand-drawn black-stroke illustrations (DNA helix, keys, beaker, compass, notepad, equation sketches) rendered in #000000 or #0a0a0a with no fill, placed loosely in the negative space around content blocks. They sit at varied sizes and rotations, anchored to nothing — the placement is editorial, not gridded. They never overlap body copy.

### Feature Card (paper)
**Role:** Compact card on the ivory canvas

1px border #e5e5e5, radius 10px, background #fffdf8, padding 24px. No shadow. Holds an IowanOld 20–32px title and SuisseIntl 16px body. Optional small icon in #0a0a0a at the top.

### Section Heading
**Role:** Centered serif title introducing a new module

IowanOld 42–48px weight 400, color #0a0a0a, centered, with a line-height of 1.08–1.10. Often paired with a single-line subhead in SuisseIntl 16px #8c8c8c directly below, 16–24px gap. The serif at 48px is the largest type that appears anywhere on the site.

### Header Bar
**Role:** Site-wide navigation

Transparent background, 1px bottom border #e5e5e5. Left: wordmark + small logomark. Center: nav links in SuisseIntl 14px #0a0a0a with ~20px gaps. Right: outlined ghost button. Height approximately 60–72px. No sticky shadow, no background fill — the border is the only separator.

### Cream Band Background
**Role:** Sectional canvas for tabbed feature areas

Background transitions from #fffdf8 to a slightly cooler washed blue (#daeff8 detected in surface stack) with thin horizontal hairline rules in #e5e5e5 spaced ~40px apart, evoking ruled notebook paper. Text and cards sit on top of this lined texture; the lines run full-bleed.

### Body Paragraph
**Role:** Default long-form copy

SuisseIntl 16px weight 400, line-height 1.50, color #0a0a0a on #fffdf8. Max-width roughly 60ch for readability. No first-line indent, no drop cap — the journal voice comes from the serif headlines around it, not the body styling.

## Do's and Don'ts

### Do
- Use #512906 Sepia as the only filled button background — it is the brand's single chromatic commitment to chrome.
- Set all headlines in IowanOld (or Source Serif Pro) weight 400; never bold the serif. The restraint is the voice.
- Reserve #242d64 Ink Violet for one full-bleed feature panel per page — the contrast against #fffdf8 ivory is the only elevation the system needs.
- Draw structural separation with 1px borders in #e5e5e5 Graphite Rule. Do not use shadows, gradients, or background tints to divide sections.
- Keep all radii at 10px — buttons, cards, tags. A single radius is part of the quiet, notebook-stapled feel.
- Place hand-drawn line illustrations (#000000 stroke, no fill) loosely in the negative space; let them float, do not center them on a grid.
- Pair the serif headline with a small SuisseIntl 16px #8c8c8c subhead directly beneath — the type pairing is the brand.

### Don't
- Do not introduce a cool blue, green, or red as a "modern" accent — the four ink colors (Sepia, Ink Violet, Forest, Oxblood) are the entire chromatic vocabulary.
- Do not apply drop shadows, glow effects, or layered elevations to cards or buttons. The paper metaphor has no thickness.
- Do not bold the IowanOld serif headlines. Use weight 500 only for the smallest display lines if emphasis is needed.
- Do not fill the canvas with #ffffff pure white. The ivory #fffdf8 is the point — losing the warm tint makes the design feel like a generic SaaS template.
- Do not use a sans-serif for headlines, feature titles, or any text above 24px. The serif/sans split is non-negotiable.
- Do not apply #ffc934 Margin Yellow to buttons, badges, or any interactive surface — it is a decorative wash for illustration backgrounds only.
- Do not stack more than one filled Sepia CTA in a single viewport. If a second action is needed, use the outlined ghost variant.

## Elevation

Opennote has no shadow system. Elevation is expressed entirely through a chromatic contrast jump — the ivory canvas (#fffdf8) to the Ink Violet feature panel (#242d64) — and through 1px hairline borders in #e5e5e5. Cards do not float; they sit on the page like a sheet of paper laid over another sheet. This is a deliberate anti-shadow stance: the notebook metaphor has no thickness, and introducing elevation would break the voice.

## Surfaces

- **Ivory Page** (`#fffdf8`) — Base canvas, the literal page the product is metaphorically printed on.
- **Soft Halo** (`#f9f9f9`) — Recessed sections, sub-panels, tabular areas that sit one shade below the page.
- **Ink Violet Panel** (`#242d64`) — Hero feature surface, used as a full-bleed band to introduce a new module and reset the eye.
- **Sepia Action** (`#512906`) — Filled CTA — the only chromatic interactive surface, and the only surface darker than charcoal.

## Imagery

Imagery is hand-drawn line illustration in the style of a thoughtful margin doodle: DNA helices, keys, beakers, compass roses, notepad sketches, physics equations, abstract shapes. All illustrations are black-stroke on no-fill, sometimes with a single flat wash of #ffc934 yellow or #242d64 violet behind one element. They float in negative space at varied scales and slight rotations — editorial placement, not grid-snapped. There is no photography, no product screenshots in the hero, no 3D renders. The brand uses a single small illustration per hero (a person riding a surfboard-shaped rocket), then scatters smaller marginalia illustrations around feature sections. Density is low: illustrations are punctuation, not content.

## Layout

Centered, max-width ~1200px, generous vertical breathing room. The hero is a single-column stack: small illustration, two-line serif headline, single CTA, nothing else. Sections are separated by either whitespace (64–96px) or a single full-bleed band — a lined-paper cream/blue section or an Ink Violet feature panel — that resets the eye. Below the hero, a single horizontal logo strip serves as the only social proof. Feature sections alternate between a centered three-column card layout and a tabbed full-bleed Ink Violet panel. Content is consistently centered; there is no asymmetric or z-pattern layout. Navigation is a thin top bar with transparent background, a 1px bottom border, wordmark left, nav center, ghost button right. The page reads top-to-bottom as a series of quiet spreads, not a dashboard.

## Similar Brands

- **Notion** — Same restrained chromatic palette, serif/sans type pairing for editorial warmth, and a single dark accent surface (Notion's near-black) breaking up an otherwise light page.
- **Are.na** — Both treat the canvas as a piece of paper — generous whitespace, hand-drawn or editorial illustration accents, and a single chromatic commit that feels like a chosen ink color rather than a brand-guideline afterthought.
- **Substack** — Same editorial-print sensibility with serif headlines on a warm off-white canvas, minimal chrome, and a focus on the page-as-publication metaphor rather than the dashboard metaphor.
- **Read.cv** — Both use a notebook/personal-journal visual language: hand-drawn line illustrations, sparse color, warm cream background, and serif headlines that signal craft over scale.
- **Cron (Notion Calendar)** — Same warm cream canvas, hairline gray rules, single saturated accent reserved for the brand's most distinctive interactions, and serif-in-headlines confidence.
