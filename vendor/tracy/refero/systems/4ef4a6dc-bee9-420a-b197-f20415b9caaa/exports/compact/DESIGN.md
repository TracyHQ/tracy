# Ori — Style Reference
> Server-room at midnight — black void, white light, one ignited switch.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Radiant (formerly Ori) operates in a dark infrastructure-at-night language: pure black canvas, bright white typography at whisper-light weight, and a single saturated orange that ignites action and full-bleed statements. The visual grammar borrows from data-center photography — server racks, neon edge-lights, and hard architectural lines — and translates that into UI: zero border-radius on interactive elements, hairline borders, and monospaced labels that feel like terminal readouts. Headlines in TWK Everett at weight 300 create a cool, confident scale that never shouts; orange is rationed for CTAs, one full-bleed band, and accent details, making it feel like a power-on indicator rather than decoration. The system is text-forward and cinematic — large type breathes against dark voids, sections alternate between black and orange with no gradients or shadows to soften transitions.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Orange | `#ff4f2b` | Orange action color for filled buttons, selected navigation states, and focused conversion moments. |
| Void Black | `#000000` | Page canvas, hero background, card surface base, footer — the dominant stage on which everything floats |
| Carbon | `#1a1a1a` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. |
| Graphite Border | `#3c3c3c` | Hairline dividers, ghost button borders, section separators — barely-there structural lines |
| Steel Mid | `#737373` | Secondary metadata, timestamps, muted labels, tertiary body copy |
| Fog Light | `#bfbfbf` | Card borders on dark surfaces, secondary text, dimmed paragraph copy — a lighter neutral for readability without full white |
| Bone White | `#f5f5f5` | Primary text, headlines, nav items, icon strokes, ghost button borders — the luminous text color across all dark surfaces |

## Typography

### TWK Everett — Display and heading family. Weight 300 at 60–96px for hero headlines ('We Are Powered Intelligence') — light weight at massive sizes gives a cool, architectural feel. Weight 400 for section headings. Weight 700 for emphasized words inside headlines. Negative tracking tightens the scale.
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 300, 400, 700
- **Sizes:** 24px, 36px, 48px, 60px, 72px, 96px
- **Line height:** 0.95–1.30
- **Letter spacing:** -0.0110em

### Switzer — Body text and primary paragraph copy. The neutral geometric grotesque companion to Everett's sharper display cut. 16px for standard body, 18px for hero subtext and larger paragraphs.
- **Substitute:** Inter, Söhne, Untitled Sans
- **Weights:** 400
- **Sizes:** 16px, 18px
- **Line height:** 1.40

### Chivo Mono — Monospaced labels, nav items, buttons, tags, metadata ('AUTHOR:', '01' section numbers, button text). Gives the system a terminal/data-center texture — every label reads like a system status readout.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Space Mono
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.00–1.40

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.2 | 0px |
| body | — | — | 16px | 1.4 | 0px |
| subheading | — | — | 18px | 1.4 | 0px |
| heading-sm | — | — | 24px | 1.3 | -0.26px |
| heading | — | — | 36px | 1.2 | -0.4px |
| heading-lg | — | — | 48px | 1.1 | -0.53px |
| display | — | — | 72px | 1 | -0.79px |
| display-lg | — | — | 96px | 0.95 | -1.06px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 48-80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 0px
- **badges:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Announcement Bar
**Role:** Slim top banner for system-level messages (mergers, updates)

Full-bleed #1a1a1a background, single line of centered 14px Switzer text in #f5f5f5, 4–8px vertical padding. Inline links in #ff4f2b. No border-radius.

### Primary Navigation
**Role:** Top-level site navigation

Transparent or #000000 background, 40px horizontal padding. Wordmark 'RADIANT' left-aligned in 16px Chivo Mono weight 400. Nav items in 14px Chivo Mono, uppercase, #f5f5f5 text, 16–24px gap. Contact CTA as filled orange button (#ff4f2b bg, #000000 text, 8px 16px padding, 0 radius). Login as ghost button (#f5f5f5 border, #f5f5f5 text, 0 radius).

### Filled CTA Button
**Role:** Primary action trigger

Background #ff4f2b, text #000000, 14px Chivo Mono weight 400 uppercase, 8px 16px padding, 0 border-radius, no border. Tight, rectangular, terminal-button feel.

### Ghost Button
**Role:** Secondary action or outlined trigger

Transparent background, 1px solid #f5f5f5 border, #f5f5f5 text, 14px Chivo Mono uppercase, 8px 16px padding, 0 border-radius. Inverts on hover (fills with #f5f5f5, text goes #000000).

### Hero Section
**Role:** First-screen brand statement

Full-viewport #000000 background, optional dark photographic overlay (server rooms with orange light streaks). Headline in TWK Everett weight 300 at 72–96px, #f5f5f5 with one word or phrase in #ff4f2b for emphasis. Body subtext in 16–18px Switzer, #f5f5f5, max-width ~540px. Dual CTA row: filled orange + ghost white, 16px gap.

### Full-Bleed Statement Section
**Role:** Dramatic brand assertion between dark sections

Full-width #ff4f2b background, no padding above/below (bleeds to viewport edges). Centered text in TWK Everett weight 400, 36–48px, #000000 color. Typically a single sentence or two. Acts as a visual interruption in the dark rhythm.

### Section Header
**Role:** Opening title for content sections

Left-aligned title in TWK Everett weight 300, 48–60px, #f5f5f5 on black. Optional large numeric counter (e.g. '01', '02') right-aligned in Chivo Mono 16px, #f5f5f5. Separated from content by 40–48px vertical space.

### News/Blog Card
**Role:** Content card for articles, news, resources

#000000 background, no border or shadow. Full-bleed image at top (no radius, edge-to-edge). 20–24px padding below image. Author meta in 12–14px Chivo Mono uppercase, #f5f5f5. Title in TWK Everett weight 400, 24px, #f5f5f5. Excerpt in 14px Switzer, #bfbfbf, 2–3 line clamp. 'READ MORE' link in 14px Chivo Mono, #ff4f2b.

### Dark Input Field
**Role:** Text input for forms

Background #1a1a1a, 1px solid #3c3c3c border, 0 border-radius. Text in 14–16px Switzer, #f5f5f5. Placeholder in #737373. No visible focus ring — relies on border color shift to #ff4f2b on focus.

### Data Center Product Screenshot
**Role:** Product/UI showcase within content sections

Dark product UI mockup floating on #000000, no border or shadow treatment, slight rotation or overlap with text. Appears as a 'device floating in the void' rather than a framed screenshot.

### Footer
**Role:** Site footer

#000000 background, 40px+ padding. Wordmark + nav columns in 14px Chivo Mono, #f5f5f5 text with #737373 secondary. No dividers or boxes — flat columns of text.

## Do's and Don'ts

### Do
- Use 0px border-radius on every button, card, input, and badge — the sharp rectangular geometry is structural, not aesthetic
- Set hero and section headlines in TWK Everett weight 300 at 60–96px — the light weight at scale is the system's signature confidence move
- Use Chivo Mono at 14px for all labels, nav items, buttons, and metadata — the monospace texture makes the UI feel like a control panel
- Reserve #ff4f2b for filled CTAs, one full-bleed statement band per page, and key emphasis words in headlines — rationing it keeps it powerful
- Use #f5f5f5 on #000000 for all primary text — the 19.3:1 contrast ratio is the default readable state
- Alternate sections between #000000 canvas and one #ff4f2b full-bleed band to create binary color rhythm across the page
- Apply 1px solid #3c3c3c or #bfbfbf hairlines for borders and dividers — never use shadows for depth

### Don't
- Do not add border-radius to any element — even 2px or 4px breaks the architectural language
- Do not use drop shadows, glows, or blurred elevation — depth comes from surface color shifts, not shadows
- Do not use #ff4f2b for body text, decorative backgrounds, or non-interactive accent fills — it must mean 'action' or 'ignition'
- Do not set headlines in weight 700 or 900 — the whisper-weight 300–400 range is the signature; bold kills the cool scale
- Do not use rounded or pill-shaped buttons — stay rectangular and terminal
- Do not introduce gradients, soft pastels, or warm secondary colors — the palette is binary: black, white, and one orange
- Do not use lifestyle photography, illustrations, or decorative iconography — imagery is restricted to dark architectural/infrastructure photography

## Elevation

The system intentionally avoids shadows. Depth is communicated through surface color (black → carbon), full-bleed color interruptions (orange bands), and photographic overlays — not drop shadows or glows. Everything sits flush on the void. Where a component needs separation, a 1px hairline border in #3c3c3c or #bfbfbf does the work.

## Imagery

Photography is cinematic and dark: server-rack interiors, data-center corridors, architectural grids, industrial infrastructure. Images are full-bleed with no border-radius, often overlaid with dark gradients to maintain text legibility. The aesthetic is 'infrastructure at night' — no people, no lifestyle, no warmth. News/blog thumbnails lean toward abstract architectural and technology photography (scaled surfaces, server arrays, patterned facades). Iconography is minimal — thin-stroke monochrome icons in #f5f5f5, consistent with the monospaced label system. No illustrations or 3D renders; the visual story is told through photography and type.

## Layout

Full-bleed dark sections with no visible container borders. Page max-width 1280px centered for text content, but images and full-bleed bands break out to viewport edges. Hero is left-aligned text stack with dark photographic right-side or full background. Sections alternate between black and one orange full-bleed statement band, creating a binary color rhythm. Content sections use a 2-column layout (text-left / product-screenshot-right) and a 3-column card grid for news/resources. Navigation is a single top bar — no sidebar, no mega-menu, no sticky behavior beyond standard scroll. Vertical spacing is generous: 48–80px between sections, 40px between content blocks within a section. The layout is text-forward and cinematic — type breathes against void, not packed into dense grids.

## Similar Brands

- **CoreWeave** — Same dark void canvas, single neon accent color (green or orange), large light-weight display headlines, infrastructure-photography hero — AI/cloud provider visual grammar
- **Lambda Labs** — Dark-mode GPU cloud branding with rationed accent color, monospaced labels, sharp rectangular buttons, and data-center hero imagery
- **Anthropic** — Dark surfaces with warm accent (terracotta/orange), large light-weight serif-inspired display type, generous breathing room, terminal-style mono labels
- **Together AI** — Black canvas, single saturated accent, bold display type at extreme sizes, infrastructure/AI positioning with photographic server imagery
