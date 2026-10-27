# Ready — Style Reference
> violet daylight workspace — a warm off-white page where a single periwinkle accent marks what matters and everything else recedes

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ready is a light, near-monochrome marketing surface where a single periwinkle violet (#7366fe) does all the chromatic work against warm off-white (#f5f3f2) and near-black text (#333333). The hierarchy is built by two contrasting type families: GT Walsheim 700 at 56-64px with 1.0 leading for headlines, and GT America at 300-500 for everything else, marked by a distinctive 0.167em tracking that gives body copy an open, slightly technical feel. Cards and product mocks sit on generous 32px radii with one soft shadow recipe, creating a gentle floating-above-paper effect rather than hard elevation. The product itself (shown in mocks) shifts into a darker, gradient-rich mode, but the marketing canvas stays quiet and confident — let the product screenshots carry the color drama.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Primary page background, card surfaces inside product mocks |
| Warm Linen | `#f5f3f2` | Subtle warm surface tint, nav borders, gradient fade-out color — gives the page its paper-like quality |
| Linen Stone | `#c4c3c1` | Mid neutral for muted dividers and secondary structural elements |
| Ink | `#333333` | Primary text, dominant border color — near-black, not pure, softer on the eye |
| Fog | `#8b8c96` | Muted text, placeholder copy, link underlines when unhovered |
| Lavender Mist | `#d5d1f4` | Soft highlight wash behind inline highlighted phrases in headlines, pale violet surface |
| Periwinkle | `#7366fe` | Sole chromatic accent — eyebrow labels, active states, icon strokes, link hover, accent borders. The one color that earns attention |
| Steel Violet | `#6c77b0` | Secondary violet surface for muted card backgrounds and tonal variety within the violet family |
| Dusk Gradient | `radial-gradient(circle farthest-side at 50% 100%, rgb(53, 28, 175), rgba(245, 244, 241, 0) 80%)` | Deepest stop in the product mock gradient (radial fade from #55269c to transparent warm linen) — used only inside product UI mocks, never on the marketing surface |

## Typography

### GT Walsheim — All section and page headlines. Weight 700 at 56-64px with tight 1.0 leading gives a wide, architectural, confident voice. The custom geometric forms (rounded but precise) define the brand's headline personality
- **Substitute:** Inter 700 or Space Grotesk 700
- **Weights:** 700
- **Sizes:** 56px, 64px
- **Line height:** 1.0
- **Letter spacing:** normal (0)

### GT America Standard — Body, nav, labels, UI controls, everything below the headline. The signature 0.167em tracking applies across all sizes — this is the system's most distinctive typographic choice. Use 300 for body, 400 for UI/default, 500 for emphasized subheadings and nav
- **Substitute:** Inter or Söhne
- **Weights:** 300, 400, 500
- **Sizes:** 12px, 14px, 16px, 18px, 24px
- **Line height:** 1.25 - 1.50
- **Letter spacing:** 0.167em across all sizes (≈2px at 12px, ≈2.3px at 14px, ≈2.7px at 16px, ≈3px at 18px, ≈4px at 24px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 2px |
| body-sm | — | — | 14px | 1.43 | 2.3px |
| body | — | — | 16px | 1.5 | 2.7px |
| subheading | — | — | 18px | 1.5 | 3px |
| heading-sm | — | — | 24px | 1.25 | 4px |
| display | — | — | 56px | 1 | 0px |
| display-lg | — | — | 64px | 1 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80-96px
- **Card padding:** 24-32px
- **Element gap:** 16-24px

### Border Radius

- **cards:** 32px
- **images:** 32px
- **avatars:** 9999px
- **buttons:** 8-12px
- **productMocks:** 32px

## Components

### Hero Headline with Highlighted Span
**Role:** Primary page and section headline

GT Walsheim 700 at 64px (page) or 56px (section), 1.0 line-height, #333333 text. One inline span wrapped in #d5d1f4 background with slight padding and 8px radius for the highlighted phrase — the visual signature of the brand.

### Eyebrow Label
**Role:** Small caps category label above headlines

GT America 500 at 12px, uppercase, #7366fe, 0.167em letter-spacing, centered above hero. Sets up the headline with quiet chromatic punctuation.

### Hero Body Paragraph
**Role:** Subheadline / supporting copy

GT America 300 at 18px, 1.5 line-height, #333333, centered, max-width ~600px. The 0.167em tracking and light weight make it feel open, not dense.

### Floating Product Mock Card
**Role:** Product UI screenshot embedded in marketing sections

Product screenshot wrapped in white card, 32px border-radius, rgba(0,0,0,0.1) 11px 11px 40px shadow, no border. The card itself is invisible — the screenshot fills it edge to edge. Floating on the warm linen canvas with generous 80px+ margin above.

### Calendar Event Card (Product UI)
**Role:** In-app event detail card

Dark surface (near-black #1a1721) with radial violet gradient from #55269c, 24px radius, generous padding, white text, avatar stack in upper right with overlapping circular 24px photos. This is where the gradient drama lives — opposite of the quiet marketing surface.

### Metrics Table
**Role:** Data display inside product UI

GT America 400-500 at 14px, #333333 text on white, 1px #c4c3c1 horizontal row dividers, 16px row padding. Bold first column for metric names, right-aligned numeric values. Minimal, spreadsheet-like.

### Section Heading
**Role:** Sub-page heading below hero

GT Walsheim 700 at 56px, 1.0 line-height, #333333, left-aligned. The same headline family as the hero but at 56px, signaling section depth.

### Avatar Stack
**Role:** Participant indicator in product UI

Three to five 24px circular photos with 4px white border, overlapping 8px horizontally. The only photography in the system — small, contained, always circular.

### Nav Bar
**Role:** Top-level navigation

White background, 1px bottom border in #f5f3f2, 64px height, GT America 400 at 14px for links, 0.167em tracking, #333333 default with #7366fe on hover/active. Brand wordmark on left, account avatars on right.

## Do's and Don'ts

### Do
- Set every headline in GT Walsheim 700 at 56-64px with 1.0 line-height
- Apply 0.167em letter-spacing to all GT America text at every size — this tracking is the system's most recognizable choice
- Use 32px border-radius on all cards, image containers, and product mocks
- Apply the single shadow recipe rgba(0,0,0,0.1) 11px 11px 40px to floating product mock cards only
- Keep all body text in #333333 on #ffffff or #f5f3f2
- Use #7366fe exclusively as the chromatic accent — eyebrow labels, active states, icon strokes, link hover
- Space major sections 80-96px apart to maintain the breathing, spacious rhythm

### Don't
- Do not introduce additional accent colors — the system is monochromatic plus one violet
- Do not use weight 600 or 800 — the type system uses 300/400/500/700 only
- Do not set body text in GT Walsheim — it is headlines only
- Do not use pure #000000 for text or borders — use #333333 for warmth
- Do not use radii smaller than 8px on cards or images
- Do not apply the radial violet gradient to the marketing page — it belongs only inside product UI mocks
- Do not center-align body paragraphs wider than 640px — the open tracking needs a measure constraint

## Elevation

- **Product mock card / floating UI screenshot:** `rgba(0, 0, 0, 0.1) 11px 11px 40px 0px`

## Surfaces

- **Paper** (`#ffffff`) — Main page background, base canvas
- **Warm Linen** (`#f5f3f2`) — Subtle warm wash for nav borders and section transitions
- **Lavender Mist** (`#d5d1f4`) — Inline highlight background within headlines, soft accent surface
- **Steel Violet** (`#6c77b0`) — Mid-tone violet card surface, tonal step between mist and periwinkle
- **Periwinkle** (`#7366fe`) — Saturated accent surface for tags, icon fills, active states

## Imagery

The site is UI-screenshot driven, not photography-driven. Product mocks show a dark-mode calendar app with gradient event cards, overlapping circular avatar photos, and a small embedded metrics table. Avatars are the only human imagery: tight 24px circular crops, overlapping in stacks, always 4px white-bordered. No lifestyle photography, no illustrations, no decorative graphics — the product UI IS the visual content. Mockups float on the warm linen canvas with the single soft shadow, edge-to-edge within 32px-radius frames, no inner border or chrome.

## Layout

Centered hero with max-width 1200px canvas, eyebrow label + massive GT Walsheim headline + short body paragraph stacked vertically and centered. Product mock cards break out below at full section width, floating with 32px radius and the soft shadow. Sections alternate between centered text blocks and left-aligned section headings with supporting product screenshots, always separated by 80-96px vertical gaps. Nav is a thin 64px top bar with brand wordmark left, user avatars right. The rhythm is: centered quiet text → large floating product visual → repeat. No sidebars, no multi-column layouts on the marketing surface — everything centers or flows left-to-right with generous breathing room.

## Similar Brands

- **Notion** — Same light spacious marketing canvas with near-black text, one soft accent color, and the habit of letting product UI screenshots carry the visual weight
- **Pitch** — Same generous 24-32px radii, warm off-white backgrounds, and restrained single-accent approach to collaborative tool marketing
- **Cron (Notion Calendar)** — Direct calendar-tool neighbor with similar clean light marketing surface and product-mock-driven hero sections
- **Linear** — Same typographic discipline and tight headline-to-body relationship, though Linear skews dark — the light-mode counterpart aesthetic
- **Mem** — Same soft, spacious, almost-paper-like background quality with muted accent restraint
