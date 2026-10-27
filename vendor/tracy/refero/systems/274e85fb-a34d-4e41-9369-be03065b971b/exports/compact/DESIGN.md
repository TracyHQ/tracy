# Raw Materials — Style Reference
> brutalist editorial on warm cream

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Raw Materials operates as a typographic maximalist system: a warm cream canvas carrying display type that regularly exceeds 200px, with every major surface element given its own vivid color identity. The system abandons a single brand color in favor of seven section-marker hues (orange, violet, ink, cobalt, crimson, yellow, green) that label navigation and content blocks alike, creating a zine-like rhythm where the color tells you which chapter you're in. Surfaces are flat and rounded at 16px — no shadows, no gradients, no elevation. Typography does all the hierarchy work, jumping from 12px captions to 259px display headlines with a cast of four custom typefaces, all sharing the "ss02" stylistic alternate.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Orange | `#ff3d00` | Orange supporting accent for decorative details and low-frequency emphasis |
| Pulse Violet | `#5900cc` | Violet supporting accent for decorative details and low-frequency emphasis. |
| Cobalt Blue | `#2835f8` | Violet supporting accent for decorative details and low-frequency emphasis. |
| Crimson | `#ff003d` | Red supporting accent for decorative details and low-frequency emphasis |
| Caution Yellow | `#ffff00` | Yellow supporting accent for decorative details and low-frequency emphasis. |
| Voltage Green | `#05ff00` | Green supporting accent for decorative details and low-frequency emphasis |
| Electric Blue | `#1b73e6` | Headings and body text on cream, mid-saturation blue used in content |
| Sky Cyan | `#00c2ff` | Headings and accent text, cool counterpoint to warm cream |
| Forest | `#008163` | Card fills, moderate green for body-level content blocks |
| Lime Pulse | `linear-gradient(rgba(0, 0, 0, 0) calc(100% - 1px), rgb(62, 234, 90))` | Headings and body, brighter green counterpart to Voltage; Green supporting accent for decorative details and low-frequency emphasis |
| Tangerine | `#ff5c00` | Card fills, warm orange variant for content blocks |
| Signal Red | `#ee2526` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Ink | `#0e0e0e` | Dark supporting neutral for text, icons, and strong contrast. |
| Bone Cream | `#f4e9e1` | Primary page canvas, nav text on color blocks, card surface |
| Paper White | `#ffffff` | Active nav card, elevated card surface, input fields |
| Charcoal | `#242320` | Dark surface fill, image overlays, secondary text on light |
| Sage | `#cee4cd` | Tinted section background, warm green wash |
| Blush | `#e4d0cd` | Tinted section background, warm pink wash |
| Sand | `#e7e4d0` | Tinted section background, warm yellow wash, card fill |
| Sky Tint | `#cddae4` | Tinted section background, cool blue wash, image-related surfaces |
| Celadon | `#ddded3` | Tinted section background, muted green wash |
| Olive Slate | `#444639` | Dark olive section background, secondary text |
| Forest Slate | `#374936` | Dark green section background, heading text on light |
| Cocoa Slate | `#4a3937` | Dark warm section background, heading text on light |
| Plum Slate | `#493648` | Dark purple section background, heading text on light |

## Typography

### StabilGrotesk — Workhorse — every nav label, body text, button, badge, card label, and sub-heading up to 46px. The only font that touches interactive UI
- **Substitute:** Inter, Söhne, General Sans
- **Weights:** 100, 400, 500
- **Sizes:** 12, 13, 14, 16, 17, 18, 19, 20, 22, 23, 24, 28, 29, 32, 40, 46
- **Line height:** 1.20–1.38
- **Letter spacing:** -0.05em at 12px, -0.02em at 18-24px, -0.01em at 32-46px
- **OpenType features:** `"ss02"`

### Optimistic Text — Large display headlines at 80-193px, sometimes body pull-quote at 23px
- **Substitute:** Söhne Breit, GT Walsheim, Inter Display
- **Weights:** 100, 400, 700
- **Sizes:** 18, 23, 80, 95, 193
- **Line height:** 1.00–1.38
- **Letter spacing:** -0.04em at 80-95px, -0.03em at 23px, +0.112em when uppercase
- **OpenType features:** `"ss02"`

### KlarheitKurrent — The largest display voice — 200-259px hero type, also mid-size editorial headings at 79-107px
- **Substitute:** Söhne Schmal, ABC Diatype Mono, GT America Mono
- **Weights:** 400, 500
- **Sizes:** 20, 40, 79, 107, 200, 259
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.04em at 107-200px, -0.02em at 79px
- **OpenType features:** `"ss02"`

### HTQ-Waldenburg-FettSchmal — Narrow bold display for compressed-impact headlines, the only font using "case" feature
- **Substitute:** Druk Condensed, Maison Neue Extended Bold
- **Weights:** 500, 700
- **Sizes:** 95, 193
- **Line height:** 1.00–1.06
- **Letter spacing:** -0.021em at 95px, -0.002em at 193px
- **OpenType features:** `"case", "ss02"`

### RightGrotesk — Bold geometric display for 199px poster-scale headlines
- **Substitute:** Inter Black, GT America Black, Söhne Breit Halbfett
- **Weights:** 700
- **Sizes:** 98, 199
- **Line height:** 1.00–1.14
- **Letter spacing:** -0.02em at 199px, -0.01em at 98px
- **OpenType features:** `"ss02"`

### Moderat — Wide-tracked display — the +0.084em tracking is a signature, used for all-caps subhead labels
- **Substitute:** Söhne Breit, GT America Expanded, Neue Haas Grotesk Display
- **Weights:** 400
- **Sizes:** 24, 120
- **Line height:** 1.00–1.20
- **Letter spacing:** +0.084em at 120px all-caps, -0.01em at 24px
- **OpenType features:** `"ss02"`

### Courier New — Monospaced system fallback for data tables, tiny index numbers
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 14
- **Line height:** 1.00
- **Letter spacing:** -0.07em at 14px
- **OpenType features:** `"ss02"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.38 | -0.6px |
| body-sm | — | — | 14px | 1.38 | -0.7px |
| body | — | — | 16px | 1.38 | -0.32px |
| subheading | — | — | 20px | 1.2 | -0.4px |
| heading-sm | — | — | 24px | 1.2 | -0.48px |
| heading | — | — | 32px | 1.17 | -0.32px |
| heading-lg | — | — | 46px | 1.14 | -0.46px |
| display | — | — | 100px | 1.03 | -1px |
| display-lg | — | — | 200px | 1 | -2px |
| display-xl | — | — | 259px | 1 | -10.36px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 48-80px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 16px
- **pills:** 99px
- **badges:** 24px
- **images:** 16px
- **buttons:** 16px
- **nav-blocks:** 16px
- **display-shapes:** 187px

## Components

### Numbered Section Nav Card
**Role:** Primary navigation — each card labels a page section with its index number and title

Vivid solid-fill card, 16px radius, full width of sidebar (~150px). Two-line layout: tiny '00'–'07' index number in Bone Cream (#f4e9e1) at 12-13px StabilGrotesk 400, then the section label in Bone Cream at 16-18px StabilGrotesk 400. Padding 12-16px vertical, 16px horizontal. One card per section color: Ember Orange, Pulse Violet, Ink, Cobalt Blue, Crimson, Caution Yellow, Voltage Green.

### Active Section Nav Card
**Role:** Indicates the section currently in viewport

Same 16px-radius dimensions as a Numbered Section Nav Card, but filled Paper White (#ffffff) with Ink (#0e0e0e) text. The color inversion reads as 'you are here' without needing an underline or dot indicator.

### Display Headline
**Role:** Section hero type — the dominant visual on every page section

100-259px using KlarheitKurrent 400-500 or RightGrotesk 700. Ink (#0e0e0e) on cream, or Bone Cream on a color block. Line-height locked to 1.00-1.03 — the type touches itself. Letter-spacing -0.02em to -0.04em at display sizes. No max-width constraint; type bleeds to the container edge or wraps to 2-3 lines.

### Page Header
**Role:** Persistent top bar — brand identity and tagline

Full-width, sits on the cream canvas with ~24px padding. Left: 'Raw Materials' at 17-18px StabilGrotesk 400 in Ink. Right: 'An Unusual Design Company' in the same size and weight, Ink. No logo mark — the wordmark IS the logo. No border, no background fill — type sits directly on cream.

### Scroll Progress Bar
**Role:** Bottom-of-viewport reading progress indicator

Full-width Ember Orange (#ff3d00) bar, 4-6px tall, fixed to viewport bottom. Fills left-to-right as the user scrolls. Also includes a tiny '01/01' section counter in Ink at 12px StabilGrotesk on the right edge.

### Color Block Content Card
**Role:** Content containers in Work, Talent, and case-study sections

Full-saturation fill in one of the accent colors or dark slates, 16px radius, 24px padding. Content inside is Bone Cream or Paper White type at 16-18px StabilGrotesk 400. No shadow, no border. Often used as a 2-column or 3-column grid element.

### Tinted Section Background
**Role:** Alternating full-bleed section backgrounds between content blocks

Full viewport-width band in one of the five warm washes: Sage (#cee4cd), Blush (#e4d0cd), Sand (#e7e4d0), Sky (#cddae4), or Celadon (#ddded3). No border between sections — the color shift itself is the divider. 48-80px vertical padding. Type inside is Ink.

### Pill Tag
**Role:** Category labels, skill tags, metadata

99.36px radius (full pill), 6-8px vertical padding, 12-16px horizontal. Filled with a section color or Ink, text in Bone Cream or Paper White at 12-13px StabilGrotesk 400.

### Rounded Badge
**Role:** Index numbers, status indicators, small annotations

24px radius (slightly more than fully rounded at small sizes), 4-8px padding. Filled with a section accent color. Text at 12px StabilGrotesk 400 in Bone Cream or Paper White.

### Image Frame
**Role:** Container for photography in Work and Talent sections

16px radius, no border, no shadow. Image fills the frame edge-to-edge. Sits on cream canvas or inside a Color Block Content Card.

### Ghost Button
**Role:** Secondary action — 'Read more', 'View project', section transitions

Transparent fill, 1.5-2px Ink border (#0e0e0e), 16px radius, 12px 20px padding. Text at 16px StabilGrotesk 400 in Ink. No fill on hover — instead the border thickens to 3px. This is the system default; filled colored buttons only appear in nav.

### Body Text Block
**Role:** Paragraph content, descriptions, bios

StabilGrotesk 400, 16-18px, line-height 1.38, Ink (#0e0e0e) on cream, or Bone Cream on dark/colored surfaces. Max reading width ~640px even though the container is wider — text doesn't stretch full-bleed.

### Section Index Header
**Role:** Small marker above each section — '01', '02', etc.

12-14px StabilGrotesk 400 in Ink or Bone Cream, letter-spacing -0.05em. Sits above a display headline, left-aligned, with 8px gap to the headline.

### Link Inline
**Role:** Inline text links within body copy

StabilGrotesk 400 at body size, Ink with a 1px Ink underline. On hover: text color shifts to the accent color of the current section. No color-only differentiation — always underlined.

## Do's and Don'ts

### Do
- Use StabilGrotesk for every interactive element and any type below 80px — it's the only font that touches UI controls
- Set all type to feature-settings: 'ss02' — this stylistic alternate is applied to every font on the site and is part of the visual identity
- Lock display headlines to line-height 1.00-1.03 so the type touches itself vertically
- Use 16px radius for all cards, buttons, images, and nav blocks — never mix in 8px or 4px corners
- Assign each page section one of the seven nav colors and carry that color into its content blocks, badges, and accent type
- Let display headlines bleed past their container — do not constrain them to a max-width
- Alternate between cream canvas and one of the five warm tinted backgrounds (Sage, Blush, Sand, Sky, Celadon) to create section rhythm

### Don't
- Don't add drop-shadows, inner-shadows, or any blur effects — the system is entirely flat
- Don't use a single 'primary' brand color for CTAs — buttons inherit their section's accent color
- Don't set body text below 16px or above 20px — the body range is tight by design
- Don't apply letter-spacing wider than +0.01em to body or subheading text — only the +0.084em Moderat all-caps labels and +0.112em Optimistic uppercase use wide tracking
- Don't introduce a new color outside the seven nav hues and the five tinted washes — the palette is deliberately finite
- Don't use rounded corners smaller than 16px on any container — 4px or 8px corners will read as a different system
- Don't place display headlines centered on the canvas — they are always left-aligned and bleed right

## Elevation

No shadows. The system is entirely flat — depth comes from color contrast, not blur or offset. Color blocks sit directly on the cream canvas with zero shadow. Rounded corners (16px) and color saturation do all the work that drop-shadows would do in a conventional system.

## Surfaces

- **Bone Cream Canvas** (`#f4e9e1`) — Primary page background, the warm paper that everything sits on
- **Paper White** (`#ffffff`) — Elevated card surfaces, active nav state, input fields
- **Tinted Washes** (`#cee4cd`) — Alternating colored section backgrounds — Sage, Blush, Sand, Sky Tint, Celadon — one tint per content block
- **Saturated Color Blocks** (`#ff3d00`) — Full-saturation nav cards and content blocks using the seven section colors
- **Dark Slates** (`#444639`) — Dark sections with hue-tinted darks — Olive, Forest, Cocoa, Plum

## Imagery

Primarily typographic and color-block-based — the system treats massive display type itself as the dominant visual. When photography appears (in Work, Talent, Careers sections), it is contained in 16px-radius frames on the cream canvas, never full-bleed, and never given a shadow. No illustrations, no 3D, no decorative graphics — the seven section colors and the display type ARE the visual identity. Iconography is minimal to absent; when present, it is a single-color flat glyph at 16-24px. Image-to-text ratio is low: text dominates, images serve as proof points within color blocks.

## Layout

Full-bleed layout with no max-width constraint. A fixed left sidebar (~160px) holds the seven numbered section nav cards stacked vertically, each card a different vivid color. The main content area fills the remaining viewport with the warm cream canvas. The hero is a single oversized display headline (200-259px) that bleeds past its container — the type IS the hero, not a background image. A bottom progress bar (Ember Orange) spans the full viewport width. Sections alternate between cream canvas and one of five warm tinted backgrounds (Sage, Blush, Sand, Sky, Celadon) or one of four dark slates, creating a zine-like chapter rhythm. The page model is asymmetric: the sidebar is a permanent anchor while content flows full-width to the right edge.

## Similar Brands

- **Pentagram** — Same maximalist agency approach where each project gets its own typographic identity, with massive display type and bold color blocks on neutral canvases
- **DIA Studio** — Same warm cream/neutral canvas with oversized editorial type and section-by-section color shifts; similar Swiss-poster-meets-zine DNA
- **Locomotive (Montreal)** — Same flat-design agency aesthetic with vivid accent colors on muted warm backgrounds and strong typographic hierarchy
- **Studio Dumbar** — Same Dutch-design confidence in treating type as the primary visual element, with flat surfaces, saturated color blocks, and no decorative shadows
- **Order Design** — Same numbered-section navigation pattern and warm-paper canvas with bold display type, though with a slightly more restrained color palette
