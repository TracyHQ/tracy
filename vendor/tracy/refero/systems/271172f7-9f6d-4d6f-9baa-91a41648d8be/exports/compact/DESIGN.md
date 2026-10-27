# Tech Barcelona — Style Reference
> Editorial tech manifesto on white marble

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tech Barcelona operates on a typographic-first language: a single custom neo-grotesque (FavoritPro) set at a whisper-light 400 weight governs the entire interface, letting scale and whitespace do the structural work rather than weight contrast. The canvas is predominantly white and quiet, with a single vivid cobalt blue (#0075ff) reserved exclusively for action — it appears once as a filled button in the nav and never decorates elsewhere. A near-black #090707 carries headlines and image content, creating stark tonal contrast against the white surface. The hero band inverts this relationship: black canvas, white type, oversized geometric logo. Components are flat and minimal — hairline borders, no shadows, no gradients — letting the photography and large-scale type carry visual weight. The overall rhythm is editorial: generous vertical space, oversized display sizes up to 80px, and tight letter-spacing pulling large headlines into compact, confident masses.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cobalt Action | `#0075ff` | Primary CTA buttons, the only chromatic accent in the entire interface — one vivid blue against monochrome neutrals, used sparingly so it signals action without competing with content |
| Ink Black | `#090707` | Headline color, image borders, large display text — near-black with the slightest warmth, chosen over pure black to feel printed rather than digital |
| Graphite | `#212529` | Body text, nav links, icon strokes, card borders — the working neutral for interface chrome and readable paragraph copy |
| Pure White | `#ffffff` | Page canvas, card surfaces, text on dark hero and dark logo backgrounds — establishes the light-mode base and all content surfaces |
| Hairline Gray | `#cccccc` | Subtle dividers and secondary borders — thin separator lines on light surfaces where #212529 would be too heavy |
| Pure Black | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. |
| Shadow Whisper | `#eeeeee` | Near-invisible ambient shadow tint for button states — a 1px 1px wash so faint it barely registers, used instead of full drop-shadows |

## Typography

### FavoritPro-Light — Single-family type system used for every interface element — nav, body, buttons, headlines, and 80px display. Weight 400 throughout is a signature choice: the system relies on scale jumps (14px body → 50px subhead → 80px display) rather than bold weights to establish hierarchy, giving the entire site an understated, editorial cadence
- **Substitute:** Inter, Neue Haas Grotesk, or Helvetica Neue Light at matching weight
- **Weights:** 400
- **Sizes:** 10px, 12px, 13px, 14px, 16px, 18px, 20px, 22px, 50px, 80px
- **Line height:** 1.00–1.59
- **Letter spacing:** -0.045em at display sizes (50–80px), -0.01em at body, +0.08em and +0.09em reserved for tracked-out labels and small uppercase
- **OpenType features:** `"ss01" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | -0.45px |
| body | — | — | 14px | 1.5 | -0.14px |
| subheading | — | — | 18px | 1.33 | -0.18px |
| heading-sm | — | — | 22px | 1.2 | -0.22px |
| heading | — | — | 50px | 1 | -2.25px |
| display | — | — | 80px | 1 | -3.6px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 50-80px
- **Card padding:** 16px
- **Element gap:** 4-10px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Primary Action Button
**Role:** The only filled chromatic button in the system

Background #0075ff, text #ffffff, no border, 0px radius (square corners), 10–16px vertical padding, 15px horizontal padding. FavoritPro 400 at 14–16px. The vivid blue against white creates immediate focal hierarchy. Used once in nav ('Join Us') and for key conversion moments.

### Ghost Button
**Role:** Secondary or tertiary action on light surfaces

Transparent background, 1px border in #212529 or #cccccc, text #212529, 0px radius, 10–16px padding. FavoritPro 400 at 14px. Used for 'Discover how we can help you' and similar exploratory CTAs where visual weight should not compete with the primary blue.

### Top Navigation Bar
**Role:** Persistent header across all pages

White or transparent background, 40–48px height, horizontal nav links in FavoritPro 400 at 13–14px in #212529. Primary blue button anchored top-right. Search icon and language selector (EN ↗) sit to the right of nav links with thin dividers. No drop-shadows or borders on the bar itself.

### Hero Block
**Role:** Full-bleed dark opening band

Background #000000, full viewport width. Oversized geometric logo (white square pixel-art mark) at 300–400px on the left, large display headline in white #ffffff at 50–80px weight 400 with -3.6px tracking, positioned right of logo. Stats ticker bar below in a thin band with white text on dark.

### Stats Ticker Bar
**Role:** Horizontal numerical proof band

Narrow full-width strip (40–60px height) with white text on black #000000. Label-numeric pairs ('COMPANIES', 'PARTNERS', 'AUDIENCE', 'MEMBERS') in FavoritPro 400 with +0.08em tracking and uppercase treatment. Serves as the visual bridge between dark hero and light content sections.

### Full-Bleed Image Block
**Role:** Editorial photography section

Full viewport width, no border-radius, no padding around image. Photographs are environmental/architectural (brick buildings, cityscape) with natural color. Often used as section dividers or context setters between text blocks.

### Story Card
**Role:** Content preview tile for articles/news

White background, 0px radius, 1px border in #cccccc or #212529. Title in FavoritPro 400 at 16–18px in #090707, metadata label above in tracked uppercase. Small category tag below. No shadows, no rounded corners — relies on hairline border and type hierarchy.

### Section Divider
**Role:** Vertical or horizontal rule between content blocks

1px line in #cccccc or #212529, full container width. Used instead of background-color changes to separate content bands while keeping the white canvas uninterrupted.

### Language Switcher
**Role:** Locale toggle in nav

Compact text element showing current locale ('EN') with an arrow indicator, FavoritPro 400 at 13px in #212529. No background, no border, no chevron icon — just text and a glyph.

### Category Tag
**Role:** Small label for content taxonomy

No background, no border, text only. FavoritPro 400 at 10–12px in #212529, often with +0.08em tracking and uppercase. Sits adjacent to or below a card title to indicate content type.

## Do's and Don'ts

### Do
- Use FavoritPro 400 at every size and weight — do not introduce bold or medium weights; hierarchy comes from scale alone
- Use #0075ff exclusively for filled primary action buttons — never as a background surface, icon fill, or decorative accent
- Set headline letter-spacing to -0.045em at 50px and above to compress the display type into confident, tight masses
- Use 0px border-radius on all components — buttons, cards, inputs, and images all share sharp corners to maintain editorial discipline
- Maintain at least 50px vertical space between major content sections to let the large typography breathe
- Use +0.08em and +0.09em letter-spacing only for uppercase labels and tracked-out metadata, never on sentence-case body text
- Let the dark hero band (#000000) appear once per page; all subsequent sections should resolve to white #ffffff canvas

### Don't
- Do not use shadows or elevation effects — the system is intentionally flat with hairline borders only
- Do not introduce additional chromatic colors — the blue/cobalt is the sole accent and its power depends on singularity
- Do not use bold (600+) or semibold weights — the entire interface speaks at weight 400 and louder weights would break the voice
- Do not apply rounded corners (border-radius) to any element — the squared-off geometry is load-bearing
- Do not add gradients, textures, or background patterns to any surface — every surface is a flat solid color
- Do not use #ffffff as a filled button background for actions — the only filled action color is #0075ff; everything else is ghost or text-link
- Do not compress line-height below 1.0 on display sizes — the tight tracking combined with the geometric letterforms already create visual density

## Elevation

The system deliberately avoids all but the faintest ambient shadow. A single 1px 1px 0px wash in #eeeeee appears on one button state. Components are defined by hairline 1px borders in #cccccc or #212529, not by drop-shadows. The flatness reinforces the editorial, print-inspired character of the type-first design — it reads as laid-out rather than assembled.

## Surfaces

- **Hero Canvas** (`#000000`) — Dark hero band with oversized white logo and display headline
- **Page Canvas** (`#ffffff`) — Default light surface for all content sections below the hero
- **Accent Surface** (`#0075ff`) — Sparingly used filled surface for primary action buttons only

## Imagery

Photography is environmental and architectural: brick facades, city buildings, physical Tech Barcelona signage mounted on real walls. Shots are warm-toned with natural daylight, no lifestyle people, no abstract gradients. Full-bleed presentation with no border-radius, often used as section dividers between text blocks. The only non-photographic visual is the geometric pixel-art logo mark — a grid of white squares forming an abstract 'TC' monogram on the dark hero. Imagery density is low to moderate: most sections are text-dominant, with photographs appearing as full-width breaks rather than inline illustrations.

## Layout

The page model is a sequence of full-width horizontal bands: dark hero → stats ticker → light content sections with full-bleed photos → footer. No max-width container constrains the layout — every band spans the full viewport. The hero is a split composition with oversized logo left and large display headline right, both vertically centered on a black canvas. Below the hero, content shifts to white canvas with generous vertical space (50–80px section gaps) and full-bleed photography serving as visual punctuation between text blocks. Navigation is a slim top bar (40–48px) with no sticky behavior indicated. The overall rhythm is editorial: large type, full-width imagery, hairline dividers, and wide white margins creating a magazine-like cadence rather than a dense product UI.

## Similar Brands

- **MIT Media Lab** — Same editorial type-first approach with oversized light-weight headlines and minimal chrome
- **IDEO** — Similar white-canvas discipline with a single accent color and full-bleed photography as section breaks
- **Arc'teryx** — Shares the neo-grotesque single-weight typography philosophy and stark white/black contrast treatment
- **New York Review of Books** — Same print-editorial cadence: large light-weight display type, generous whitespace, hairline dividers, photography as content divider
