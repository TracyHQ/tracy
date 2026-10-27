# Aaru — Style Reference
> Particle-field observatory at midnight

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aaru operates as a dark-mode scientific observatory: pure black canvas interrupted by one vivid electric-blue section and a single acid-yellow-green accent that reads like an instrument-panel indicator light. Typography is deliberately inverted from convention — weight 330 ultra-light runs through every role, body text carries positive letter-spacing (0.025–0.080em) for a data-label cadence, and only display headings tighten to negative tracking. Surfaces are flat and shadowless; hierarchy is built through thin 1px borders, generous whitespace, and numbered annotations rather than elevation. The visual language is terminal, measured, and anti-decorative — every element earns its place like a readout on a control panel.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, primary background — the dominant surface across all dark sections |
| Carbon | `#0a0a0a` | Elevated surface for nav borders, button outlines, and secondary structural elements against the black canvas |
| Graphite | `#18181b` | Subtle raised surface for cards or containers sitting on the black canvas — the lightest neutral step before chromatic sections |
| Frost | `#ffffff` | Primary text, hairline borders on dark sections, and inverted backgrounds — the most-used color after black |
| Ash | `#bababa` | Muted helper text, icon strokes, and secondary surface fills |
| Smoke | `#9d9d9d` | Medium-contrast borders, control outlines, and structural separators. Do not promote it to the primary CTA color |
| Slate | `#858484` | Body text borders and the quietest readable gray — used where content recedes into the background |
| Reactor Lime | `#ebfb10` | Primary action fill (CTA buttons), announcement bar background, and the sole warm accent — acid yellow-green against black creates instant focal hierarchy |
| Plasma Blue | `#1019ec` | Section background and chromatic border accent — vivid electric violet-blue that shifts the entire page into instrument-mode for feature blocks |

## Typography

### abcOracle — Primary UI and body typeface — used for navigation, body copy, labels, buttons, and medium-scale headings. Weight 330 ultra-light is the default; 400 is reserved for body paragraphs and readable text blocks. Positive letter-spacing on sizes ≤16px creates a data-label cadence.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 330, 400
- **Sizes:** 12, 13, 14, 15, 16, 34, 50
- **Line height:** 1.25–1.50
- **Letter spacing:** -0.025em at 50px and 34px, 0.025–0.040em at 12–16px
- **OpenType features:** `"ss01" on, "tnum" on, "ss02" on`

### gtPantheon — Display and subheading typeface — weight 330 only, paired with tight negative tracking. Used for section openers and mid-scale titles. The contrast between its lighter cut and abcOracle's 330 creates two distinct text registers without using bold.
- **Substitute:** GT Pantheon (closest free alternative: Söhne Schmal, or Suisse Int'l Light)
- **Weights:** 330
- **Sizes:** 20, 30, 40
- **Line height:** 1.20–1.25
- **Letter spacing:** -0.050em at 40px, -0.025em at 20–30px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 0.96px |
| body | — | — | 15px | 1.5 | 0.6px |
| subheading | — | — | 20px | 1.25 | -0.5px |
| heading-sm | — | — | 30px | 1.25 | -0.75px |
| heading | — | — | 34px | 1.25 | -0.85px |
| heading-lg | — | — | 40px | 1.2 | -2px |
| display | — | — | 50px | 1.2 | -1.25px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 30px
- **Element gap:** 8px

### Border Radius

- **tags:** 0px
- **cards:** 6px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Announcement Bar
**Role:** Top-of-page alert bar

Full-bleed #ebfb10 background, 12–14px abcOracle weight 330, uppercase, letter-spacing 0.040–0.080em, color #000000. Height ~40px. Contains a short label and a 'READ MORE →' link. Padding 10px top/bottom.

### Ghost Navigation Button
**Role:** Secondary nav action (LOG IN)

Transparent background, 1px white border, white text, abcOracle 330 at 12–14px, uppercase, letter-spacing 0.040em. Padding 12px 32px. No radius.

### Filled Navigation Button
**Role:** Primary nav action (CONTACT)

White background (#ffffff), black text, abcOracle 330 at 12–14px, uppercase, letter-spacing 0.040em. Padding 12px 32px. No radius. Inverted from the ghost variant to create a clear two-step nav hierarchy.

### Hero Headline
**Role:** Primary page headline

abcOracle weight 330 at 50px, line-height 1.20, letter-spacing -0.025em, white on #000000. Sentence-case, not uppercase — the whisper-weight does the typographic work. Left-aligned, max-width ~600px.

### Section Statement
**Role:** Mid-page section opener

White text on #1019ec background, abcOracle 330 at ~34–40px, tight tracking. Max-width ~480px, left-aligned. Sets the tone for each feature block.

### Numbered Annotation Row
**Role:** Labeled section header with index

Two-part label: a small numeric prefix (01–04) in abcOracle 330 at 13px, #ffffff, paired with an uppercase label at 12–13px, letter-spacing 0.040em. A thin 1px white horizontal rule sits above the row. Used as section markers inside the blue block.

### Accordion Body Text
**Role:** Expandable content under a numbered row

White text on #1019ec, abcOracle 400 at 15px, line-height 1.50, normal tracking. Indented to align with the label, not the number. Max-width ~560px for comfortable reading width.

### Filled CTA Button
**Role:** Primary action button

#ebfb10 background, #000000 text, abcOracle 330 at 14px, uppercase, letter-spacing 0.040em. Padding 14px 30px. No radius. The acid green-on-black pairing is the highest-contrast action in the system.

### Hairline Divider
**Role:** Section separator

1px solid line, color shifts by section: #ffffff on dark, #000000 on blue. Full-width within the content column, used above numbered rows and below group labels.

### Particle Scatter Visualization
**Role:** Decorative data graphic in hero

Hundreds of small white/gray dashes and dots scattered across a vertical field on the right side of the hero. Functions as abstract brand mark — suggests population granularity. No fixed grid; reads as a scatter plot of human data points.

### Muted Link
**Role:** Inline or footer text link

abcOracle 330 at 13–14px, color #9d9d9d, no underline by default. Hover state lightens to #ffffff. Letter-spacing inherits the body cadence at 0.025–0.040em.

### Logo Lockup
**Role:** Brand mark in navigation

Small geometric icon (4-dot cluster) + lowercase wordmark 'aaru' in abcOracle 330 white, 16px. Sits left-aligned in the nav bar.

## Do's and Don'ts

### Do
- Use weight 330 as the default text weight for all UI elements; reserve weight 400 only for body paragraphs longer than two lines
- Apply positive letter-spacing (0.025–0.080em) to all text at 16px and below; apply negative tracking (-0.025 to -0.050em) at 20px and above
- Use #ebfb10 only for the single most important action per view — announcement bars and primary CTAs only
- Use #1019ec as a full-bleed section background to signal a tonal shift; never use it as a small accent fill
- Use 1px borders in inverted colors (white on dark, black on blue) instead of shadows to separate layers
- Maintain an 8px base-unit rhythm: all padding and gaps should resolve to 8, 10, 12, 16, 20, 24, 30, 32, or 40px
- Keep corner radii at 0px for buttons, inputs, and tags; the only permitted radius is 6px for card surfaces

### Don't
- Do not use bold (600+) or semibold (500+) weights — the system reads through weight contrast between 330 and 400 only
- Do not apply drop shadows, box-shadows, or glow effects to any element
- Do not introduce additional chromatic colors — the palette is exactly black, white, three grays, lime, and electric blue
- Do not use the blue or lime as text color on light backgrounds; both are background or button-fill colors only
- Do not center-align body text — the system reads left-aligned throughout, with asymmetric compositions
- Do not use border-radius above 6px on any component — the system is angular and terminal
- Do not use uppercase letter-spacing on text below 12px; the smallest sizes already carry enough cadence

## Elevation

The design intentionally avoids shadows and drop-shadow elevation. Hierarchy is created through three mechanisms only: surface color shifts (black → graphite → blue), 1px hairline borders in contrasting colors, and generous whitespace. This flat approach reinforces the instrument-panel metaphor — real data readouts don't cast shadows.

## Surfaces

- **Void Canvas** (`#000000`) — Base page background — the dominant surface
- **Carbon** (`#0a0a0a`) — Subtle elevation for borders and outlines on the dark canvas
- **Graphite** (`#18181b`) — Container surface for cards or callouts sitting on black
- **Plasma Blue** (`#1019ec`) — Chromatic section break — full-bleed feature background

## Imagery

Imagery is abstract and data-driven, not photographic. The hero features a particle-scatter visualization — hundreds of small dashes and dots forming a vertical cloud that suggests population data points or agent trajectories. The visual treatment is monochromatic (white/gray marks on black) with no photographic subjects, no people, no lifestyle shots. The overall image role is atmospheric and brand-defining rather than explanatory — it signals the product's domain (simulation, agents, data) without illustrating a specific use case. Decorative graphics are flat, sharp-edged, and terminal in feel — no gradients, no blurs, no organic shapes.

## Layout

The page alternates between two full-bleed tonal zones: a dominant black canvas and a single vivid blue section. The hero is dark with a left-aligned headline and a right-side particle visualization; the body shifts to #1019ec for the feature manifesto, then returns to black. Content within each zone is constrained to a max-width of ~1280px and left-aligned. The blue section uses a numbered accordion pattern: four labeled rows (01–04) stacked vertically, with thin dividers between them and expandable body text under the first row. Vertical rhythm is generous — 80px section gaps, 30px card padding, 8px element gaps — creating a spacious, slow-reading cadence. Navigation is a minimal top bar: logo left, three text links + two buttons right, sitting over a yellow-green announcement strip.

## Similar Brands

- **Linear** — Same dark-mode scientific aesthetic with ultra-light typography, generous whitespace, and flat borderless surfaces
- **Vercel** — Same minimal terminal-style navigation, weight 300 display type, and reliance on color contrast over shadows for hierarchy
- **Anthropic** — Same observatory-like dark canvas with a single chromatic accent color used for primary actions and announcement bars
- **Runway** — Same data-visualization-forward hero treatment and dark-canvas + single-vivid-accent color logic
- **Weights & Biases** — Same instrument-panel feel with numbered annotations, tracked uppercase labels, and flat hairlines instead of cards
