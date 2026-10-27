# ToDesktop — Style Reference
> Cosmic command deck transitioning into a bright spec sheet. Dark gradient hero with a single electric blue accent button; below, a calm, light, hairline-bordered document surface with pill navigation and floating product mockups.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ToDesktop operates as a dual-environment system: a deep space-grade dark hero with gradient atmosphere that transitions into a bright, document-like feature surface. The dark zone uses a sweeping white-to-near-black gradient to position the product against a cosmic backdrop, while the light zone feels like a clean product spec sheet. The single saturated #0036ff blue/violet is the only chromatic moment — used exclusively on primary action buttons — making every CTA feel like switching on a spotlight. Components are flat and confident: pill navigation, hairline 1px borders, generous 14-24px card radii, and almost no elevation shadow. The type system pairs Aeonik Pro's geometric character at display sizes with Inter's neutrality for UI, while Geist Mono marks developer-facing elements. The overall attitude is premium developer tool — the visual language of a tool that respects your attention.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Iris | `#0036ff` | Primary CTA fill, active nav indicators — the only saturated hue on the entire page, it functions as a switch-on moment against an otherwise achromatic or deep-blue canvas |
| Signal Cyan | `#0093ff` | Blue state accent for badges, validation surfaces, and short status labels. Do not promote it to the primary CTA color |
| Deep Void | `#05061b` | Card surface within dark sections, box-shadow tone on dark cards — near-black with a violet undertone matching the hero gradient |
| Ink Black | `#141414` | Primary heading and body text on light surfaces, dark button labels |
| Pure White | `#ffffff` | Primary page canvas, card surface, button text on dark fills |
| Hairline Gray | `#e5e7eb` | Default 1px borders, table dividers, icon strokes, card outlines — the structural line color that defines component edges |
| Quiet Gray | `#c2c2c9` | Card surface tint in dark sections, subtle shadow base |
| Soft Mist | `#d6d6db` | Secondary surface fill, muted card backgrounds |
| Dim Steel | `#656565` | Secondary body text, muted descriptions, icon fill |
| Lavender Frost | `#e1ecff` | Subtle blue-tinted surface wash for accent cards |
| Mint Whisper | `#e6fff7` | Cool green-tinted surface accent |
| Charcoal | `#333333` | Dark button fill, high-contrast interactive surface |

## Typography

### Aeonik Pro — Display and heading typeface — geometric humanist sans with distinctive flared characters. Used at 64-74px for hero headlines, 36-48px for section headings. The weight-500 (never bold 700) at massive sizes is a signature choice: authority through size and tracking, not weight. Alternate character sets (ss02, ss05) are activated — these swap specific glyphs for the brand's preferred letterforms.
- **Substitute:** Inter Tight, Satoshi, General Sans
- **Weights:** 400, 500
- **Sizes:** 18px, 24px, 36px, 48px, 64px, 74px
- **Line height:** 1.08, 1.13, 1.14, 1.22, 1.33, 1.78
- **Letter spacing:** -0.015em at 74px (-1.11px), -0.01em at smaller sizes
- **OpenType features:** `"ss02", "ss05", "ss10", "ss11"`

### Inter — Body and UI typeface — handles everything from 9px micro-labels to 18px subheads. Weight 400 for body, 500 for emphasized text, 600 for nav and button labels. Features cv01 and ss01 are enabled, giving Inter's default character set subtle brand-specific alternates. Tight tracking (-0.01em) at body sizes keeps paragraphs dense without feeling cramped.
- **Substitute:** Inter (native)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9px, 10px, 12px, 13px, 14px, 16px
- **Line height:** 1.07, 1.33, 1.43, 1.50, 1.54, 1.57, 1.63, 1.67, 1.78, 1.83, 2.40
- **Letter spacing:** -0.01em at 16px (-0.16px), -0.005em at 14px (-0.07px), normal at smaller
- **OpenType features:** `"cv01", "ss01"`

### Geist Mono — Code and technical accents — terminal mockups, version strings, and uppercase eyebrow labels like 'END-TO-END ELECTRON'. The wide tracking (+0.03em) on small caps creates the characteristic monospaced eyebrow tags. Geist Mono is a Vercel-designed face with a slightly geometric, modern stance.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400, 500
- **Sizes:** 10px, 11px, 12px, 14px, 16px
- **Line height:** 1.45, 1.50, 1.57, 2.00, 2.40, 2.67
- **Letter spacing:** -0.01em default, 0.03em for badge/eyebrow labels

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 1.45 | — |
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.57 | -0.07px |
| body | — | — | 16px | 1.63 | -0.16px |
| body-lg | — | — | 18px | 1.78 | — |
| subheading | — | — | 24px | 1.33 | -0.24px |
| heading-sm | — | — | 36px | 1.22 | -0.36px |
| heading | — | — | 48px | 1.14 | -0.48px |
| heading-lg | — | — | 64px | 1.13 | -0.64px |
| display | — | — | 74px | 1.08 | -1.11px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 999px
- **cards:** 14px
- **inputs:** 6px
- **buttons:** 999px
- **heroCards:** 24px
- **largeCards:** 20px
- **featureBlocks:** 32px
- **smallElements:** 6px

## Components

### Primary CTA Button
**Role:** Main conversion action — 'Start free trial', 'Sign up'

Filled pill button: #0036ff background, white text, Inter weight 500 at 14px, 999px radius, 10px 20px padding. Subtle multi-layer inset highlight shadow (white 0.12 opacity) gives the fill a soft glass-like sheen. No border. Arrow icon (→) appended after label. Padding is generous for a pill — the 10px vertical makes the button feel substantial despite the compact density.

### Secondary Ghost Button
**Role:** Companion action — 'Read docs', 'Log in'

Ghost/outline button: transparent background, #141414 border at 1px, dark text, 999px radius, identical padding to primary. In the hero (dark section), border and text invert to white/white with slight transparency. Sits to the right of the primary CTA at equal visual weight but lower contrast.

### Pill Navigation Bar
**Role:** Top-level site navigation

Floating pill-shaped nav container: white background, 1px #e5e7eb border, 24px radius, slight box-shadow for elevation. Contains brand logo (small blue rounded square), nav links (Products, Docs, Changelog, Blog with dropdown chevron), and action buttons on the right. Sits centered with margin from page edges, slightly elevated above the hero gradient.

### Eyebrow Tag
**Role:** Section label above headlines — 'END-TO-END ELECTRON', 'FEATURES'

Small pill badge: #e5e7eb or dark-tinted background, Geist Mono weight 500 at 10-12px, uppercase, letter-spacing 0.03em. Sits centered above section headings as a category marker. In dark sections, appears with a subtle gradient or border treatment.

### Feature Card
**Role:** Feature explanation blocks in the light section grid

White or near-white background, 14px radius, 1px #e5e7eb border, no shadow or extremely subtle 1px shadow. Internal layout: icon at top (rounded container with tinted background), heading at 24px Aeonik Pro weight 500, body text at 14-16px Inter weight 400 in #656565. Padding 24-32px. Cards sit in a 2-column grid with 8-16px gap.

### macOS Window Mockup
**Role:** Product showcase — terminal, code editor, app window illustrations

Simulated desktop window with traffic-light dots (red/yellow/green) in the title bar, window title (e.g. 'Terminal', 'ChatSphere'), and content area showing either a dark terminal with command text, a code editor with syntax highlighting, or a gradient desktop background. Border radius 14px, subtle shadow with multi-layer transparency. The title bar uses a light gray fill (#f1f1f1) with Inter text at 12px.

### Code Snippet Window
**Role:** Inline code display in feature explanations

Dark window (#05061b or #1a1a2e) with syntax-highlighted code: keywords in violet/purple, strings in green, variables in white, line numbers in muted gray. Geist Mono at 12-14px. Functions as visual evidence within feature cards — the code itself is the illustration.

### Stat/Bullet Row
**Role:** Three-column feature summary in the hero — Upload, Bulletproof, Distribution

Horizontal trio: icon (rounded container with blue tint, 40-48px), short bold heading (Inter weight 500 at 14px), one-line description (Inter weight 400 at 14px, #656565). Separated by vertical hairline dividers. Spaced evenly across the hero width below the CTA buttons.

### Dark Hero Section
**Role:** Above-the-fold landing zone

Full-width dark gradient background: white at top transitioning through light blue (#80bfef), deep blue (#1046e9), indigo (#1046e9), violet (#061db6), and ending at near-black (#0f071d). Centered text stack: eyebrow tag, 64-74px headline, subtitle at 18px in muted white, CTA pair. Decorative wireframe lines suggest a topographic or circuit pattern.

### Badge/Pill Label
**Role:** Category tags, status indicators, version labels

999px radius, 2-4px vertical padding, 8-12px horizontal padding. Background: tinted version of color (e.g. light blue for info). Text: Inter or Geist Mono at 10-12px, weight 500. Color #0093ff for info/informational badges.

### Icon Container
**Role:** Icon backgrounds in feature cards and stat rows

Small rounded square: 40-48px, 6-14px radius, tinted background (light blue #e1ecff or light gray #f1f1f1). Icon inside uses #0036ff or #141414 at 20-24px. 1px border matching the tint slightly darker.

### Footer Link List
**Role:** Site footer navigation columns

Multi-column layout with column headers in Inter weight 600 at 14px, links below in weight 400 at 14px, #656565. Column gap 32-48px. Separated from main content by a 1px #e5e7eb horizontal rule.

## Do's and Don'ts

### Do
- Use #0036ff exclusively for primary CTA fills — this is the only saturated color and must remain singular
- Apply 999px border-radius to all buttons, tags, and pill-shaped elements
- Set heading tracking to -0.01em or -0.015em — never use default or positive letter-spacing on display text
- Use hairline 1px #e5e7eb borders for structural separation instead of shadows
- Keep the dark hero gradient directional (top-white to bottom-near-black) — never invert it
- Apply Geist Mono at +0.03em tracking for uppercase eyebrow labels
- Use 14-24px border-radius on cards — avoid sharp 0px or overly large 40px+ radii

### Don't
- Don't introduce a second saturated color — the system is fundamentally monochromatic with one electric blue accent
- Don't use bold weight 700 on display headings — Aeonik Pro at weight 500 is the ceiling
- Don't apply heavy drop shadows — shadows should be barely perceptible or 1px hairlines
- Don't use square corners (0px) on interactive elements — the minimum is 6px
- Don't mix the dark and light section aesthetics — the dark hero and light feature zone are distinct environments
- Don't use #0093ff for filled buttons — it is for links and accents only, not primary actions
- Don't use Inter at sizes above 18px for body content — Aeonik Pro takes over at 24px and above

## Elevation

- **Cards:** `rgba(0, 0, 0, 0.04) 0px 0px 0px 1px`
- **Buttons (primary, filled):** `rgba(255, 255, 255, 0.12) 0px 1px 2px -0.5px inset, rgba(255, 255, 255, 0.16) 0px 0.5px 0.5px 0px inset, rgba(255, 255, 255, 0.16) 0px 8px 24px -4px inset`
- **Floating elements (macOS mockups, nav bar):** `rgba(0, 0, 0, 0.06) 0px 12px 12px -3px, rgba(0, 0, 0, 0.04) 0px 6px 6px -3px, rgba(0, 0, 0, 0.02) 0px 3px 3px -1.5px, rgba(0, 0, 0, 0.03) 0px 1px 1px -0.5px`

## Surfaces

- **Cosmic Canvas** (`#0f071d`) — Hero section base — near-black with deep violet undertone, serves as the bottom of the gradient
- **Pure White** (`#ffffff`) — Light section page background and card surface
- **Soft Mist** (`#d6d6db`) — Muted card surface for feature blocks
- **Lavender Frost** (`#e1ecff`) — Blue-tinted accent surface for highlight cards and icon containers
- **Mint Whisper** (`#e6fff7`) — Cool green-tinted accent surface for variety in section backgrounds

## Imagery

Product mockups dominate — specifically macOS window simulations with traffic-light controls, showing terminal output, code editors, and app interfaces. The mockups float against gradient backgrounds: in the dark hero, a terminal window with a blue-to-orange gradient desktop wallpaper; in the light section, white code editor windows with syntax highlighting. No photography or lifestyle imagery. Icons are line-style with 1.5-2px stroke weight, contained in small rounded-square tinted backgrounds. The visual language is entirely product-screenshot-as-illustration — the tools you use are the heroes.

## Layout

Two-zone page model: a full-bleed dark hero (100vw) with centered text stack and floating product mockup, transitioning to a max-width 1200px light content zone below. The hero uses a dramatic vertical gradient as its canvas with generous vertical padding (120-160px). The light section flows as a single column of centered headings followed by a 2-column card grid (equal width, 16-24px gap). The nav bar is a floating pill centered at the top with margin from page edges. Content rhythm: centered headline → supporting text → 3-column stat row → product mockup (alternating left/right or centered) → 2-column feature cards. Section gaps are 64-80px. The overall density is compact — information is presented densely but with clear visual hierarchy through size and spacing, not whitespace abundance.

## Similar Brands

- **Linear** — Same premium dark-to-light dual-zone hero structure, single electric accent color, pill-shaped floating navigation, hairline borders replacing shadows
- **Vercel** — Shared Geist Mono for code/eyebrow labels, geometric display sans for headlines, minimal elevation philosophy, gradient hero backgrounds
- **Resend** — Identical compact density, Aeonik-family display type, pill CTA buttons, macOS window mockups as product illustration
- **Cal.com** — Same monospaced eyebrow tag pattern, centered hero text stack over gradient, feature card grid with tinted icon containers
- **Railway** — Dark gradient hero with floating product UI, light documentation-style feature zone below, single saturated brand accent
