# AIUC — Style Reference
> Alpine underwriting ledger — a white page ruled with hairline rules, topped by a single pale-blue mountain photograph.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

AIUC operates as a Swiss-style editorial system: white canvas, near-achromatic palette, and one whisper of icy blue that lives only in the hero photograph and a single cool surface tint. Typography does the heavy lifting — Almarai at weight 300 with tight negative tracking carries every headline, while ABC Diatype Semi-Mono punctuates labels and links with quiet technicality. Components are flat, hairline-bordered, and 4px-rounded; the only chromatic surface is the landscape hero. The overall feel is the trust language of a law firm or underwriter: restrained, confident, almost print-like.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas | `#ffffff` | Page background, card surfaces, primary surface for all content blocks |
| Ink | `#000000` | Hairline borders, icon strokes, fine dividers — the linework that structures the page |
| Obsidian | `#1a1a1a` | Primary text, heading text, filled CTA buttons, dark feature cards |
| Graphite | `#323232` | Secondary text, link text, default link borders — slightly softer than Obsidian for body copy |
| Smoke | `#5f5f5f` | Tertiary text, muted helper copy |
| Ash | `#707070` | Mid-gray borders and subdued supporting text |
| Fog | `#8d8d8d` | Lighter borders, inactive dividers |
| Mist | `#979595` | Subtle surface tint, muted block backgrounds, very light washes |
| Glacier Tint | `#d3dfeb` | Hero photograph cool wash, decorative ice-blue accent — appears only as a near-gray atmospheric tint, not a saturated brand color |

## Typography

### Almarai — Display and heading — the only font that carries headlines. Weight 300 is anti-convention: most enterprise brands use 600-700 for authority, Almarai Light achieves authority through restraint. Combined with -0.02em tracking it reads like editorial print, not SaaS. Originated as an Arabic typeface, its Latin glyphs have a distinctive humanist geometry that no system font replicates exactly.
- **Substitute:** Manrope Light or Inter Tight weight 300
- **Weights:** 300
- **Sizes:** 24px, 40px
- **Line height:** 1.20-1.30
- **Letter spacing:** -0.48px at 24px, -0.80px at 40px

### ABC Diatype — Body and running text. The workhorse — paragraphs, descriptions, card content. Neutral humanist sans that steps back to let the Almarai headlines lead.
- **Substitute:** Inter or Söhne
- **Weights:** 400
- **Sizes:** 14px, 16px, 18px, 20px
- **Line height:** 1.40-1.50

### ABC Diatype Semi-Mono — Technical labels, nav items, tag text, links, caption-style metadata. The monospaced variant of Diatype gives the UI a quiet engineering voice — used to mark functional elements that should read as system, not editorial.
- **Substitute:** JetBrains Mono or IBM Plex Mono at regular weight
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px, 18px
- **Line height:** 1.10-1.30

### System sans-serif — Smallest utility text, browser-default contexts, fallback
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.4 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 18px | 1.5 | 0px |
| small-heading | — | — | 20px | 1.4 | 0px |
| heading | — | — | 24px | 1.3 | -0.48px |
| display | — | — | 40px | 1.2 | -0.8px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **cards:** 4px
- **pills:** 4px
- **images:** 4px
- **buttons:** 4px

## Components

### Announcement Bar
**Role:** Top-of-page system message bar

Full-bleed black (#1a1a1a) strip, 12px system sans text in white, centered content. Sets the formal, almost legalese tone of the brand immediately on page load.

### Site Header
**Role:** Primary navigation and brand mark

White background, no border, 24px vertical padding. Brand mark left (serif-feeling wordmark stacked on two lines), nav items below in ABC Diatype Semi-Mono at 12-14px in #323232, CTA button right-aligned.

### Primary CTA Button
**Role:** Top-level action trigger

Filled button, #1a1a1a background, white text, 4px radius, 6px vertical / 16px horizontal padding, ABC Diatype Semi-Mono at 12-14px. The only filled button in the system — every other action is ghost or text.

### Hero Section
**Role:** Opening narrative block

Full-bleed photographic background of a pale-blue alpine mountain landscape, image treated with a subtle #d3dfeb cool wash. Headline overlay in Almarai 300, 40px, #1a1a1a, with -0.80px tracking, left-aligned with generous left margin (~5% of viewport).

### Partner Logo Card
**Role:** Social proof grid

White card, 4px radius, 1px #000000 border, ~24px internal padding. Contains a short label in body text, then a grid of partner logos in 5 columns with 10px gaps. Each logo cell is a grayscale brand mark with small caption text above in ABC Diatype Semi-Mono.

### Section Header with Hairline Rule
**Role:** Section divider and title

Almarai 300 at 24px, #1a1a1a, left-aligned. A 1px #000000 horizontal rule runs the full content width below the title, creating a print-magazine column-rule effect. Optional right-aligned 'Our solution' link in ABC Diatype Semi-Mono.

### Body Text Block
**Role:** Descriptive paragraph

ABC Diatype 400 at 16px, line-height 1.50, #323232, max-width ~400px. Narrow measure keeps reading comfortable and creates a strong left-aligned typographic block next to visuals.

### Dark Feature Card — Origin
**Role:** Diagram node (left side of process flow)

Square card, #1a1a1a background, 4px radius, white icon centered in upper third, label in ABC Diatype Semi-Mono uppercase 12px below. Used in the 'AI Company → Enterprise' flow diagram.

### Dark Feature Card — Destination
**Role:** Diagram node (right side of process flow)

Same shape and dimensions as the Origin card but with a radial blue glow on the right edge (from the hero palette, applied as a subtle accent). Signals the 'certified' end state.

### Flow Arrow Connector
**Role:** Process indicator between diagram nodes

Thin horizontal line in #323232 with a small circular icon at center, connecting the two dark cards. Minimalist, almost architectural.

### Navigation Link
**Role:** Primary nav item

ABC Diatype Semi-Mono at 12-14px, #323232, no underline, 10-12px horizontal spacing between items. No active state indicator visible in screenshots — hover/active likely shifts to #1a1a1a or adds an underline.

### Logo / Wordmark
**Role:** Brand identity mark

Custom serif-feeling mark (resembles a classical monogram) stacked above two lines of text: 'Artificial Intelligence' / 'Underwriting Company'. Black, ~14-16px in what appears to be a serif companion to the main type system.

## Do's and Don'ts

### Do
- Use Almarai weight 300 exclusively for headlines — never set Almarai bold or semibold; the whisper-weight is the brand signature.
- Set headline letter-spacing to -0.02em (multiply size by -0.02); this tracking is what makes Almarai read as editorial rather than web.
- Use 4px radius on all cards, buttons, and images — do not introduce larger radii; the slight rounding is intentional, pill shapes are not in this system.
- Keep the palette achromatic: #ffffff, #1a1a1a, #323232, and the neutral gray scale. The only chromatic surface is #d3dfeb, used as atmospheric wash only.
- Use 1px borders in #000000 or #323232 to define regions instead of box-shadows — the design is deliberately flat.
- Apply ABC Diatype Semi-Mono to functional labels (nav, tags, captions) and ABC Diatype Regular to body paragraphs — this split creates the system's quiet technical voice.
- Set body line-height to 1.50 and keep paragraph max-width to ~400px for comfortable reading.

### Don't
- Do not add drop shadows, glows, or elevated cards — the system is flat by doctrine.
- Do not use saturated colors, gradients, or accent hues beyond #d3dfeb; the 0% colorfulness is the brand.
- Do not use bold or semibold weights for headlines; weight 300 is the only weight Almarai should appear in.
- Do not introduce border radii larger than 4px; the slight corners are part of the editorial language.
- Do not use the system font (sans-serif) for visible UI text — it's only for the smallest browser-default contexts.
- Do not use pill-shaped buttons (the 1000px radius token appears only twice and is not a pattern).
- Do not mix typography systems across components — the Diatype/Diatype Semi-Mono/Almarai triad is the complete set.

## Elevation

Flat by doctrine. The design uses hairline 1px borders in #000000 and #323232 to separate regions rather than shadows. Even cards on white sit flush, defined only by their border. This zero-shadow approach is a deliberate editorial choice — the page should read as a printed document, not a layered software interface. The only visual depth comes from the hero photograph.

## Surfaces

- **Canvas** (`#ffffff`) — Page background
- **Glacier Wash** (`#d3dfeb`) — Hero atmospheric overlay and decorative cool surface
- **Obsidian Plate** (`#1a1a1a`) — Dark feature cards, filled CTA buttons

## Imagery

Imagery is sparse and atmospheric: a single full-bleed alpine mountain photograph dominates the hero, rendered in pale icy blues and whites. No lifestyle photography, no product shots, no people. The rest of the page is pure UI — partner logos (grayscale, tightly cropped, no context), small line icons in dark feature cards, and a subtle radial blue glow as the only decorative element. The mountain photograph does the emotional work: cold, vast, trustworthy. Everything else is editorial white space.

## Layout

Max-width ~1200px centered with generous left alignment. The hero is full-bleed, breaking out of the content column to span the entire viewport. After the hero, the layout settles into a single-column rhythm: section header with hairline rule, then a two-zone block (narrow text column on the left ~400px, wider visual on the right). Navigation is a simple top bar with left-aligned brand, vertical nav stack, and right-aligned CTA — no sticky behavior visible. The partner logo grid is 5 columns. The process diagram uses two large dark cards with a thin connector, centered horizontally. Spacing between sections is generous (~80px), creating a print-like vertical rhythm.

## Similar Brands

- **Linear** — Same near-achromatic light theme, hairline borders, and editorial restraint — though Linear uses more density and a single violet accent where AIUC uses none.
- **Stripe** — Shared hairline-rule section dividers, generous vertical spacing, and a confidence-through-restraint typographic approach with whisper-weight headlines.
- **Anthropic** — Similar editorial-print sensibility: white canvas, full-bleed atmospheric photography, mono-accented nav, and a typographic hierarchy that prioritizes reading over selling.
- **Vercel** — Same flat-by-doctrine approach with zero shadows, tight type tracking, and a minimal palette — Vercel uses black as brand where AIUC uses black as structure.
- **Arc Browser** — Shared monochromatic discipline, generous use of white space, and a custom-feeling type pairing (display + mono) that signals craft over convention.
