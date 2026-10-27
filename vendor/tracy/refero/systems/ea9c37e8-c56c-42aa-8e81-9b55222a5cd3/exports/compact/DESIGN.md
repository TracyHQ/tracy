# Stark — Style Reference
> midnight lecture hall with yellow highlighter

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Stark operates as a confident accessibility-infrastructure brand sitting on a dual-surface canvas: a deep midnight-navy hero that crashes into a warm cream secondary field, linked by a vivid violet primary action and a mustard-yellow highlighter that reads like a teacher's marking pen. The type system is anchored by ArminGrotesk at its heaviest possible weight (900) for hero display — the 110px headline is not a statement, it is a wall — then steps down through 56/48/28/24/20/16/14 with tight negative tracking (-0.02em) that pulls large letters into a single sculpted block. Yellow is not decoration; it marks emphasis inside running copy (the diagonal-split gradient) and signals one specific action. Violet is the chromatic engine: CTA fills, card borders, icon accents, active states. Everything else stays in a narrow achromatic corridor of #000, #fff, and #e5e7eb hairlines, so the two chromatic colors always read with maximum signal.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Navy | `#10284b` | Hero background, primary headings, footer surface — the dominant brand color establishes authority and anchors the dark-to-light page split. Used as a background field for the above-the-fold section and as body-text color on the cream secondary surface |
| Stark Violet | `#381fd1` | Primary action fills (Get started, Sign up, Request demo), card border accents, active nav state, decorative icon strokes, and inline emphasis text. The vivid violet against midnight navy creates a switched-on, electric feel without aggression |
| Highlighter Yellow | `#fedb63` | Diagonal text-highlight gradient fill, one specific secondary CTA, and illustration accent. Yellow never decorates broadly — it marks, underlines, and punctuates specific words within dark-on-light headlines |
| Lilac Tint | `#e5e0ff` | Soft button surface variant, gentle tinted card backgrounds. A desaturated wash of the violet brand that softens interactive elements without competing with the primary action |
| Mint Splash | `#99d6cc` | Decorative illustration accent in feature cards and dashboard widgets. Used sparingly in flat geometric shapes within artwork, not in core UI controls |
| Page Canvas | `#faf5ff` | Lightly purple-tinted near-white page background. The faint violet cast unifies the cream and white surfaces under one chromatic family |
| Cream Field | `#f6f6eb` | Secondary section surface and body-text color on the dark hero. The warm greenish-cream provides a relaxed counterpoint to the midnight navy and is the dominant body-text/link color on the dark section |
| Carbon | `#000000` | Body text on light surfaces, icon strokes, and high-contrast elements. Not used as a background — the system prefers the midnight navy for darkness |
| Pure White | `#ffffff` | Text on dark hero, card surfaces, nav backgrounds, product screenshot frames. The bright surface that holds product imagery and dashboard content |
| Hairline Gray | `#e5e7eb` | Universal border color for cards, inputs, dividers, link underlines, and structural separators. The single achromatic border workhorse |

## Typography

### ArminGrotesk — The single custom typeface carries the entire brand voice. Weight 900 is the hero display weapon (110px headline) — used at maximum volume for the opening statement. Weight 600 handles section headings and subheadings (24-48px). Weight 500 is the button and label workhorse. Weight 400 is body text. The geometric grotesque construction gives a contemporary, slightly technical authority.
- **Substitute:** Space Grotesk or Inter at equivalent weights
- **Weights:** 400, 500, 600, 900
- **Sizes:** 14, 16, 20, 24, 28, 48, 56, 110
- **Line height:** 1.10, 1.43, 1.50, 1.70
- **Letter spacing:** -0.0200em at 110px, -0.0100em at 48-56px, 0.0200em at 16-20px, 0.0800em at 14px uppercase labels

### RobotoMono — All-caps eyebrow labels and section markers (e.g., 'EXPLORE THE STARK PLATFORM', 'SPEED UP DESIGN & DEV'). The monospaced mono with wide tracking creates a distinct utilitarian signal that sits above the display heading and below the nav — a consistent navigational breadcrumb layer.
- **Substitute:** JetBrains Mono Bold or IBM Plex Mono Bold
- **Weights:** 700
- **Sizes:** 13, 16
- **Line height:** 1.40
- **Letter spacing:** 0.0800em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.28px |
| body-sm | — | — | 16px | 1.5 | -0.16px |
| body | — | — | 20px | 1.7 | 0.4px |
| subheading | — | — | 24px | 1.5 | 0px |
| heading-sm | — | — | 28px | 1.5 | 0px |
| heading | — | — | 48px | 1.1 | -0.48px |
| heading-lg | — | — | 56px | 1.1 | -0.56px |
| display | — | — | 110px | 1.1 | -2.2px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 56px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 6px
- **cards:** 12px
- **pills:** 20px
- **buttons:** 6px
- **feature-cards:** 40px

## Components

### Violet Primary Button
**Role:** Main conversion action

Filled button with #381fd1 background, white text, ArminGrotesk 500 at 16px, 6px border-radius, 8px vertical × 24px horizontal padding. Used for 'Sign up for free', 'Get started for free'. The vivid violet against both midnight navy and cream fields makes the action immediately findable.

### Yellow Secondary Button
**Role:** Alternate call-to-action on dark hero

Filled button with #fedb63 background, midnight navy text, ArminGrotesk 500 at 16px, 6px border-radius, same padding as primary. Appears once on the dark hero to provide a second action path that doesn't compete with the main violet CTA.

### Ghost Outline Button
**Role:** Tertiary action in navigation

Transparent fill, 1px white border, white text, 6px border-radius, used for 'Request Demo' in the nav. Minimal weight that recedes behind the primary yellow or violet action.

### Pill Label
**Role:** Category and feature eyebrow tags

Small uppercase tag with ArminGrotesk 600 or RobotoMono 700 at 13-14px, 0.08em tracking. 20px border-radius for fully rounded pill shape. Violet text on light, white text on dark. Used above feature card titles and on the 'Team Project' avatar-group label.

### Hero Stat Card
**Role:** Animated metric callout on hero

Compact card floating over the midnight hero, showing a large number (e.g., '120', '641') in white with a label below. Contains a small icon (lightning bolt) and sits with partial transparency over the dotted chart pattern.

### Status Legend Card
**Role:** Right-side stack on hero

Three vertically stacked rows with colored dot indicators (violet, violet, teal) and labels: Violations, Potential Violations, Passed Checks. Semi-transparent dark background with white text, 8px padding between rows.

### Product Screenshot Frame
**Role:** Desktop and mobile app previews

White card with subtle shadow, housing actual product UI. Desktop frames are wide rectangles with 12px radius; mobile frame is a phone-shaped rounded rectangle. Positioned with intentional overlap to create depth.

### Feature Card with Illustration
**Role:** Four-column feature grid

Each card contains: an isometric/geometric flat illustration (teal, yellow, violet, navy palette) at top, a small uppercase violet label, a bold navy heading at 24px, and body text at 16px. 40px border-radius, generous internal padding, no visible border or shadow — relies on the illustration as visual anchor.

### Navigation Bar
**Role:** Top-level site navigation

Horizontal bar on midnight navy background. Left: logo (circular leaf icon). Center: nav items in white uppercase with dropdown carets. Right: 'LOG IN' text link and outlined 'Request Demo' button. Sits over the dark hero without separate background fill.

### Highlighted Text Run
**Role:** Inline emphasis within headings

Specific words within a headline get a diagonal yellow highlighter effect via the linear-gradient(to right bottom, transparent 50%, #fedb63 50%) technique. Creates the impression of a marker pen swipe. Also available in violet variant for secondary emphasis.

### Avatar Group + Label
**Role:** Social proof element

Stack of 3-4 circular avatars (overlapping) followed by a pill-shaped label reading 'Team Project' in violet. Sits inline with hero copy as a trust signal.

### Decorative Dot Pattern
**Role:** Hero background texture

Grid of small dots and vertical bar shapes in lighter purple/lilac tones, scattered across the bottom of the dark hero. Creates data-visualization atmosphere without literal chart content.

## Do's and Don'ts

### Do
- Use ArminGrotesk weight 900 at 110px with -2.2px letter-spacing for the primary hero headline — this is the signature wall-of-text moment.
- Apply the diagonal yellow highlighter gradient (transparent 50% → #fedb63 50%) to one or two words inside a dark-on-light headline to create inline emphasis.
- Set primary action buttons to #381fd1 fill with white text, 6px radius, and 8px×24px padding. Never use the midnight navy as a button fill.
- Use RobotoMono 700 at 13px with 0.08em tracking for all uppercase eyebrow labels above section headings.
- Alternate between midnight-navy hero sections and cream (#f6f6eb) body sections to maintain the dark-to-light page split.
- Set the page background to #faf5ff (not pure white) to carry the subtle violet cast across all light surfaces.
- Use #e5e7eb hairline borders at 1px for all card edges, input fields, and structural dividers — the system relies on lines, not shadows.

### Don't
- Do not use weight 400 or 500 for the hero display headline — the 900 weight at 110px is the brand's signature and must be deployed at maximum volume.
- Do not apply the yellow highlighter gradient to more than 2-3 words in a single headline; it dilutes the marking-pen effect.
- Do not use shadows for cards on the cream or light purple surfaces — the system prefers flat surfaces with hairline borders.
- Do not introduce a second brand-violet shade; #381fd1 is the single chromatic action color and must remain uncontested.
- Do not set body text below 16px or use letter-spacing wider than -0.01em at display sizes — the tight tracking is essential to the geometric grotesque feel.
- Do not place CTA buttons on the midnight-navy hero without sufficient contrast padding or a distinctive fill — the violet and yellow must be the only bright spots on the dark field.
- Do not use the cream (#f6f6eb) as a background for the hero — it is exclusively a secondary-section surface that appears after the dark fold.

## Elevation

- **Product Screenshot Frame:** `0 20px 60px rgba(16, 40, 75, 0.15)`
- **Hero Stat Card:** `0 8px 32px rgba(0, 0, 0, 0.2)`

## Surfaces

- **Hero Field** (`#10284b`) — Full-bleed dark navy above the fold, with decorative dot/bar chart pattern in lighter purple
- **Page Canvas** (`#faf5ff`) — Primary light background for the body of the page, faintly violet-tinted
- **Cream Section** (`#f6f6eb`) — Alternating warm-cream band that provides visual contrast and houses feature sections
- **Card Surface** (`#ffffff`) — Elevated white cards for product screenshots, stat displays, and content blocks

## Imagery

The visual language is split between two modes. On the dark hero, the imagery is abstract: a field of dots and vertical bars in lighter lilac/purple that suggests a data-visualization chart without committing to literal content. On the light sections, the imagery is functional: real product screenshots (desktop dashboard with charts, a detailed scan-results panel, and a mobile app showing project lists) float in white frames with subtle shadows. Feature cards use flat, isometric-style geometric illustrations built from simple shapes (rectangles, circles, arrows, document icons) in a controlled palette of teal, yellow, violet, and midnight navy. No photography of people or environments appears — the product UI and abstract data patterns are the entire visual vocabulary. Iconography is minimal: simple line icons in the stat cards and feature illustrations, with stroke weight proportional to their container size.

## Layout

The page follows a dark-to-light vertical split. The hero is a full-bleed midnight-navy section with centered copy (headline at 110px, body text below, single yellow CTA), flanked by floating stat cards and avatar groups positioned asymmetrically. Below the fold, the layout transitions to a cream (#f6f6eb) band containing overlapping product screenshots (desktop, detail, mobile) arranged in a z-composition with intentional overlap. Feature sections use a max-width 1200px centered container with 4-column card grids on desktop. Each section begins with a centered uppercase eyebrow label, a large two-line headline (with yellow-highlighted phrase), and optional subtext. The rhythm alternates between tight, information-dense product-screenshot sections and spacious 4-column feature grids with 56px vertical gaps. Navigation is a flat top bar over the dark hero with no sticky behavior or shadow.

## Similar Brands

- **Linear** — Same geometric grotesque display typography at maximum weight for hero headlines, single vivid accent color, and clean hairline-border card aesthetic on near-white backgrounds
- **Notion** — Similar dark-to-light page split with full-bleed colored hero section transitioning to white/cream product content areas, plus confident oversized headline scale
- **Pitch** — Shared approach of vivid chromatic CTA button as the single bright interactive element against neutral surfaces, with display-typeface hero at extreme weight and size
- **Loom** — Similar product-screenshot-on-light-canvas presentation with floating overlapping frames, uppercase eyebrow labels above section headings, and high-contrast dark hero opening
