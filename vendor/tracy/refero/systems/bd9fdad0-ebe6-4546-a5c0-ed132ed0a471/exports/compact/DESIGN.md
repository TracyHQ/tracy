# DNA — Style Reference
> Midnight observatory through a particle lens

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

DNA Capital is a midnight observatory for healthcare capital: a near-black canvas hosts a serif display voice that whispers at weight 300, a geometric sans for everything utilitarian, and a single electric blue that draws arcs and traces particle constellations. The page is overwhelmingly achromatic — white type and hairline borders float on #070708 — with blue appearing as small functional punctuation, never as decoration. Vertical rhythm is generous (59px section gaps, 23–32px element breathing room), and the layout pairs a left-aligned editorial column with a persistent right-side particle field that bleeds between sections. The signature typographic tension: a high-contrast serif (Darius) at 45–72px against a narrow geometric sans (Graphik) at 13–18px creates a Vogue-meets-quantum-lab feel that most financial sites cannot reach.

## Colors

| Name | Value | Role |
|------|-------|------|
| Abyss Black | `#070708` | Page canvas, footer ground — near-black rather than #000 gives the cosmic field a slight warmth and lets white type feel luminous rather than harsh |
| Pure White | `#ffffff` | Primary text, hairline dividers, section borders, icon strokes — the sole foreground color across the system |
| Steel Gray | `#8f8f93` | Muted body copy, secondary descriptions — sits between the white headlines and the dark canvas to create a three-tier reading hierarchy |
| Carbon | `#000000` | SVG fill on iconography and button borders — true black for graphic elements that need maximum weight against the warm #070708 ground |
| Electric Cobalt | `linear-gradient(135deg, rgb(0, 204, 255), rgb(12, 146, 246) 43%, rgb(25, 84, 236) 75%, rgb(25, 84, 236))` | Accent stroke on circle indicators, gradient terminus, decorative line art — the only chromatic voice in the UI, reserved for the data-circle motifs and the particle field's deepest point; 135° gradient sweeping from cyan through electric blue to deep cobalt — wraps the right-side particle visualization and ties the cosmic backdrop to the accent color |

## Typography

### Graphik — Body text, UI labels, navigation, badges, small captions, the 59px display variant. Light weights (200–300) are the default; 400–500 reserved for emphasis and numeric data. Tabular figures enabled via 'tnum' — critical for stat readouts like '17' and '30M+'.
- **Substitute:** Inter, Untitled Sans, Söhne
- **Weights:** 200, 300, 400, 500
- **Sizes:** 9px, 10px, 13px, 14px, 15px, 18px, 59px
- **Line height:** 0.9, 1.0, 1.2, 1.4, 1.5, 1.55, 1.8
- **Letter spacing:** 0.4000em for micro-labels (9–10px tracking labels), 0.2000em for small uppercase UI (13px), 0.1800em for captions, 0.0100em for body, -0.0200em for the 59px display variant
- **OpenType features:** `"tnum"`

### Darius — Hero and section headlines only — a high-contrast didone-influenced serif used at whisper weight to create editorial gravity. The pairing against Graphik's geometric neutrality is the site's defining typographic move: the serif carries brand voice, the sans carries information. Single weight (300) forces restraint — no bold, no italic.
- **Substitute:** Playfair Display, Bodoni Moda, Cormorant Garamond
- **Weights:** 300
- **Sizes:** 45px, 52px, 54px, 72px
- **Line height:** 1.13, 1.34

### Arial — Button text fallback only — appears where Graphik is not loaded
- **Substitute:** system-ui
- **Weights:** 400, 500
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 4px |
| subheading | — | — | 18px | 1.4 | -0.36px |
| heading | — | — | 45px | 1.13 | 0px |
| heading-lg | — | — | 52px | 1.13 | 0px |
| display | — | — | 72px | 1.13 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 59px
- **Card padding:** 32px
- **Element gap:** 23px

### Border Radius

- **cards:** 0px
- **links:** 4px
- **badges:** 0px
- **buttons:** 0px

## Components

### Corner Navigation
**Role:** Minimal top-corner site nav

Logo 'DNA CAPITAL' in Graphik 10px weight 400 with 0.4000em letter-spacing, white, top-left, paired with a small geometric mark. 'MENU' label in same micro-tracking style top-right, followed by a diamond/rhombus stroke icon. No background, no border — floats directly on the dark canvas.

### Hero Headline (Serif Display)
**Role:** Opening editorial statement

Darius 300 at 52–72px, white, left-aligned, line-height 1.13. The single instance of the serif on the page. Key words can carry the Electric Cobalt accent — 'healthtech' is colored in the hero. Generous left margin; right side is reserved for the particle visual.

### Body Description Block
**Role:** Supporting paragraph copy

Graphik 300–400 at 14–15px, Steel Gray (#8f8f93), line-height 1.5, max-width ~480px. Sits below headlines as a quiet secondary voice. No bullet styling, no border.

### Circle Stat Indicator
**Role:** Quantitative data visualization

A partially-drawn circle (SVG stroke) in Electric Cobalt (#1954ec), stroke-width 1px, ~180px diameter. Center holds a Graphik 300 numeral at ~52px white. Below the circle, a Graphik 10px caption in Steel Gray with 0.2000em tracking, max-width ~140px. The arc length encodes progress/percentage.

### Scroll Prompt
**Role:** Vertical scroll affordance

Graphik 10px 'SCROLL TO EXPLORE' in white with 0.4000em letter-spacing, uppercase, followed by a thin vertical line (1px white, ~60px tall) extending downward. Positioned bottom-left, signals continuation.

### Section Divider
**Role:** Horizontal section separator

A single 1px white hairline at low opacity, spanning the content width. No visual ornamentation — the spacing itself does the work.

### Stage Label
**Role:** Investment-stage category heading

Darius 300 at 45px, white, line-height 1.13. Two-line stack: 'Early / Stage' or 'Late / Stage' — line break after the first word is intentional. Right column carries the matching Graphik body description.

### Footer
**Role:** Page closure

Abyss Black (#070708) ground, white text, 54px bottom padding. Minimal: small Graphik labels, no card surface, no border above — the canvas extends seamlessly.

### Ghost Link
**Role:** Inline text link

Graphik 400 at 13px, white, no underline by default, 4px border-radius on the clickable area. Padding 20px vertical, 25px horizontal. No background fill.

### Outline Button
**Role:** Secondary action control

Graphik 400 at 13px white text, 1px white border, no fill, 8px vertical margin. Square corners (0px radius). Used for non-primary actions where the filled alternative is absent — restraint is the brand.

## Do's and Don'ts

### Do
- Use Darius 300 exclusively for headlines at 45–72px — never set the serif below 32px or above 80px
- Reserve #1954ec for circle indicators, gradient terminations, and at most one accent word per hero — blue should never fill a button background
- Set all micro-labels (nav, captions, scroll prompts) in Graphik 10px with 0.4000em letter-spacing in uppercase
- Maintain 59px minimum vertical space between major sections; 23–32px between elements within a section
- Use the 135° cyan-to-cobalt gradient only for the particle/cosmic backdrop and decorative line work — never for text backgrounds or UI fills
- Set numeric data in Graphik with 'tnum' feature enabled so figures in the circle indicators and stat blocks align vertically
- Keep all corners square (0px) for cards, buttons, and badges; reserve 4px radius only for inline links

### Don't
- Do not introduce a second serif weight — Darius ships at 300 only, adding bold or regular would dilute the whisper-weight signature
- Do not add drop shadows, glows, or box-shadows — depth comes from the particle field and generous negative space, not elevation
- Do not use #ffffff borders at full opacity across large areas — borders should be 1px hairlines at reduced contrast to read as structural, not loud
- Do not place accent blue on body text — blue is a graphic accent, not a reading color
- Do not break the two-column rhythm — left column text, right column visual/description is the consistent section pattern
- Do not use sans-serif for any headline — the Darius/Graphik tension is the brand; letting Graphik creep to 40px+ flattens the identity
- Do not add more than one chromatic color to any single component — the palette is monochromatic with a single blue accent

## Elevation

The design has no box-shadows or elevation. Depth is achieved through the cosmic particle field on the right side of every section and through generous vertical spacing. Components sit flat on the canvas — they do not lift. If a layered effect is needed, it comes from a 1px white hairline border, not from a shadow.

## Surfaces

- **Abyss Canvas** (`#070708`) — Primary page background across all sections — the warm near-black that makes the particle field and white type read correctly
- **Particle Field** (`#1954ec`) — Right-side decorative layer that bleeds across sections; not a true surface but a visual depth marker using the cobalt gradient

## Imagery

No photography or illustration in the traditional sense. The sole visual element is a procedural particle/dot-field on the right side of every section — thousands of small luminous dots arranged in a sweeping wave pattern that transitions from cyan at the top to electric cobalt at the bottom. The field is abstract, not representational; it evokes a cosmic stream or DNA helix data visualization. The dots are dense and form a curved volume, not a flat texture. There are no product screenshots, no lifestyle photography, no human figures. The left two-thirds of the canvas is always empty space for text.

## Layout

Full-bleed dark sections with no max-width container — content sits on the canvas with generous left margin (~80–120px) and runs edge-to-edge. Every section uses a two-column structure: left column holds the serif headline or stat indicator, right column holds the particle field plus optional supporting text. No card grids, no pricing tables, no feature matrices. Vertical rhythm is 59px between sections, 23–32px between elements. Navigation is two corner elements (logo top-left, menu top-right) with no bar or background. The hero is a full-viewport dark screen with a single serif headline and the particle field anchored to the right edge. Section transitions are seamless — the particle field continues across section boundaries rather than being clipped.

## Similar Brands

- **KKR** — Same dark-canvas editorial approach with serif display headlines and a single restrained accent — both treat the homepage as a brand statement rather than a product catalog
- **Generation Investment Management** — Climate-finance firm that uses Darius-weight serif headlines on near-black backgrounds with particle/atmospheric visual backdrops — the whisper-weight serif + dark canvas pairing is nearly identical
- **Index Ventures** — Dark-mode VC site with generous whitespace, two-column text+visual sections, and a single vivid accent (their red) used sparingly for emphasis rather than buttons
- **Northzone** — Dark editorial VC layout with serif display type, micro-tracked uppercase labels, and a right-side visual element that bleeds across sections
