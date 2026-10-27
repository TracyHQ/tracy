# Becklyn — Style Reference
> Obsidian gallery with italic poetry — a black-walled room where one serif sentence glows and everything else is silence.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Becklyn operates as a near-monochrome dark gallery: an obsidian canvas with a single spectrum beam of color used as identity punctuation. The interface is almost entirely achromatic — white type on near-black, a slightly lifted charcoal for cards, mid-gray for hairline rules and muted copy — so the typography carries the entire expressive load. Headlines lean on Cambon's italic serif cut at hero scale, paired against UniversalSans's quiet neutral geometry for body and UI. Components are deliberately thin: pill-shaped controls, hairline borders, no heavy elevation. A vivid blue-to-plum-to-crimson gradient surfaces only as a brand mark, not as a functional button or accent. The mood is editorial and restrained — closer to a print portfolio than a SaaS dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone White | `#ffffff` | Primary text, icon strokes, hairline borders, inverted pill highlights. The single light color in the system — it does all the foreground work against the black canvas |
| Obsidian | `#1a1a1a` | Page canvas, section backgrounds, inverse surface for pills and inputs. Never pure #000 — the slight warmth keeps the surface from feeling harsh |
| Lifted Charcoal | `#3b3b3b` | Card and elevated panel surfaces. One step lighter than the canvas, giving containment without resorting to shadows |
| Smoke | `#606060` | Muted helper text, inactive nav labels, secondary dividers, tag outlines. Quiet enough to recede behind the white content layer |
| Spectrum Beam | `linear-gradient(200deg, #004eff 0%, #710966 75%, #8e2e45 100%)` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### Cambon — Display and editorial headings. Used in italic for hero statements like 'Wir transformieren' / 'Experiences' at 68–92px. The italic cut is the brand's signature — a serif whisper that anchors the otherwise typographically quiet page. At body sizes (22px) it appears for pull quotes and lede paragraphs. Substitute: Editorial New, Source Serif 4, or Tiempos Text.
- **Substitute:** Editorial New
- **Weights:** 400
- **Sizes:** 22px, 68px, 92px
- **Line height:** 1.00–1.15
- **Letter spacing:** -0.013em at 22px, -0.018em at 68px, -0.055em at 92px

### UniversalSans — Body copy, UI labels, navigation, buttons, and supplementary headings. The workhorse — appears at 20px for paragraph text, 22px for slightly emphasized body, 36–42px for sub-section headings, and 68–92px for sans-serif display moments that contrast with Cambon's serif headlines. Weight stays at 400 throughout; hierarchy is built through size and tracking, not weight. Substitute: Inter, Söhne, or Suisse Int'l.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12px, 20px, 22px, 36px, 42px, 68px, 92px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.014em at 12px, -0.023em at 20px, -0.024em at 22px, -0.025em at 36px, -0.042em at 42px, -0.043em at 68px, -0.059em at 92px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.17px |
| body | — | — | 20px | 1.2 | -0.46px |
| body-lg | — | — | 22px | 1.15 | -0.53px |
| subheading | — | — | 36px | 1.05 | -0.9px |
| heading | — | — | 42px | 1.05 | -1.76px |
| heading-lg | — | — | 68px | 1 | -2.92px |
| display | — | — | 92px | 1 | -5.43px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **tags:** 100px
- **cards:** 10px
- **buttons:** 100px
- **navPills:** 100px
- **decorative:** 31px
- **largeCards:** 20px

## Components

### Floating Bottom Navigation
**Role:** Primary site navigation — a fixed pill bar at the bottom of the viewport

Pill-shaped bar (border-radius: 100px) with #1a1a1a fill, sitting on the dark canvas. Contains nav labels in UniversalSans 20px weight 400 in #606060 (inactive) or #ffffff (active). Background is semi-opaque black with subtle backdrop blur. Vertically centered, horizontally centered, positioned with ~24px bottom margin from viewport edge.

### Active Nav Chip
**Role:** Indicates the current page in the floating navigation

The active nav item gets a white pill background (border-radius: 100px) with #1a1a1a text — a complete inversion of the bar's default state. Padding ~10px 20px. In the screenshots, 'Intro' is shown in this active state.

### Hero Display Heading
**Role:** The marquee editorial statement on the landing page

Cambon weight 400 in italic at 68–92px, line-height 1.00, letter-spacing -0.055em to -0.059em. Color #ffffff at ~40–60% opacity (appears muted against the dark canvas). Occupies the full viewport width, often bleeding off both edges. This is the visual signature — large, italic, and unmissable.

### Case Study Card
**Role:** Content cards in the 'Cases — Einblicke & Ergebnisse' section

Rounded card on #3b3b3b surface, border-radius 10–20px, padding 20px. Contains a project preview image and label text in UniversalSans 12–20px. No drop shadows — the surface lightness is the only elevation signal.

### Brand Gradient Mark
**Role:** The Becklyn logo / brand identity element

The wordmark or icon mark filled with the spectrum gradient (linear-gradient(200deg, #004eff 0%, #710966 75%, #8e2e45 100%)). Sits in the top-right corner of the header. The only chromatic moment on the page — appears as a small, concentrated splash of color against the achromatic field.

### Body Paragraph
**Role:** Long-form descriptive text

UniversalSans weight 400 at 20–22px, line-height 1.20, letter-spacing -0.023em. Color #ffffff at full or slightly reduced opacity. Generous line-height creates breathing room. Paragraphs span ~600–700px max width within the 1200px page container.

### Muted Secondary Text
**Role:** Helper labels, metadata, inactive nav items, tag text

UniversalSans 12–20px weight 400, color #606060. Used for navigation labels not in the active state, timestamps, filter labels, and any copy that supports but doesn't compete with the primary content layer.

### Hairline Divider
**Role:** Section separators and content boundaries

1px border in #ffffff at ~10–20% opacity, or #606060 at full opacity. No horizontal rules with heavy weight — dividers are whisper-thin, barely visible. Often implied by whitespace alone.

### Top Header Bar
**Role:** Minimal page header with tagline and brand mark

Sits at the very top of the page with the tagline 'Exploring Digital Future. Together.' in UniversalSans on the left and the gradient brand mark on the right. No background fill — the text floats directly on the #1a1a1a canvas. Padding ~20px vertical.

### Tag / Filter Pill
**Role:** Category labels and interactive filters

Pill shape (border-radius: 100px) with a 1px border in #ffffff or #606060, padding 6px 16px. Text in UniversalSans 12–14px, color matching the border. No fill — these are outlined chips, not solid buttons. Used for project categories, skill tags, or filter controls.

### CTA Button (Outlined)
**Role:** Primary call-to-action — notably outlined, not filled

Pill shape (border-radius: 100px) with 1px solid #ffffff border, transparent or #1a1a1a fill. Text in UniversalSans 16–20px weight 400, color #ffffff. Padding 12px 24px. The outlined treatment is deliberate — this is a gallery, not a shopping cart. Actions whisper; they don't shout.

### More Link
**Role:** Inline link with arrow indicator leading to additional content

UniversalSans 20px weight 400 in #ffffff or #606060, followed by a small arrow glyph. No underline. Used for 'Mehr über uns' and similar navigational text within body copy. Padding-bottom: 2px for precise vertical alignment.

### Section Heading
**Role:** Sub-section titles within page content

UniversalSans weight 400 at 36–42px, line-height 1.05, letter-spacing -0.025em to -0.042em. Color #ffffff. Used for headings like 'Cases — Einblicke & Ergebnisse'. No serif, no italic — these are functional markers, not editorial moments.

## Do's and Don'ts

### Do
- Use Cambon italic at 68–92px for all hero/display headings — the italic serif is the brand's voice, not a stylistic option
- Set all interactive elements (buttons, nav, tags) to border-radius: 100px — pill shapes are non-negotiable
- Build elevation through surface lightness (#1a1a1a → #3b3b3b → #ffffff), never through box-shadow
- Keep letter-spacing aggressively negative at display sizes: -5.4px at 92px, -2.9px at 68px, -1.8px at 42px
- Use #1a1a1a as the canvas — never #000000, the slight warmth is intentional
- Reserve the spectrum gradient exclusively for the brand mark and identity moments — never apply it to buttons, icons, or functional UI
- Let body text use UniversalSans at 20–22px with 1.20 line-height for comfortable reading rhythm

### Don't
- Don't add drop shadows, glow effects, or blur-based elevation to any element
- Don't use the spectrum gradient as a button fill, link color, or interactive state
- Don't introduce additional font weights — the system stays at weight 400 across both families; hierarchy comes from size and tracking
- Don't use pure black (#000000) or pure white on white — the warmth of #1a1a1a and the clarity of #ffffff are the tuned values
- Don't fill buttons with solid white — the primary CTA treatment is outlined/ghost, not filled
- Don't use color for emphasis — emphasis comes from size, tracking, and the Cambon/UniversalSans contrast
- Don't add decorative imagery, patterns, or background textures — the canvas should remain flat and uninterrupted

## Elevation

The design deliberately avoids drop shadows. Elevation is expressed exclusively through surface lightness — the canvas at #1a1a1a lifts to #3b3b3b for cards, and inverts to #ffffff for active/selected states. This creates depth through contrast, not blur, keeping the visual language crisp and architectural rather than soft and skeuomorphic.

## Surfaces

- **Canvas** (`#1a1a1a`) — Full-page background, hero backgrounds, section backdrops
- **Card** (`#3b3b3b`) — Case study cards, content panels, elevated blocks
- **Inverted Pill** (`#ffffff`) — Active nav states, selected filters, the highlighted 'Intro' chip

## Imagery

Imagery is sparse and editorial. Project previews appear as contained cards with sharp or slightly rounded edges, sitting on the lifted charcoal surface. The tone is product-focused — screenshots and visual case studies rather than lifestyle photography. No full-bleed hero images; the hero is typographic. The only chromatic imagery is the gradient brand mark itself. The overall density is text-dominant, with images supporting rather than leading.

## Layout

Max-width 1200px centered container, with content sometimes bleeding to full viewport width for display headings. The hero is a centered or left-aligned typographic statement — no image, no video, just a large italic serif sentence occupying the first viewport. Sections follow a single-column or two-column text+card rhythm with 80px vertical gaps. A floating bottom navigation bar (pill-shaped, centered, fixed) is the only persistent UI element. The top header is minimal — just a tagline and brand mark with no navigation. The overall feel is a vertical scroll through a printed portfolio, with generous whitespace and no decorative chrome.

## Similar Brands

- **Locomotive** — Same dark-canvas agency aesthetic with large editorial typography and minimal chromatic palette
- **Resn** — Near-achromatic dark portfolio sites that let one typographic moment carry the entire hero
- **Active Theory** — Dark-mode creative agency layouts with pill-shaped navigation and restrained color usage
- **Instrument** — Editorial dark layouts with serif display type and monochrome-first component systems
- **&Walsh** — Agency sites that use a single vivid brand color against an otherwise black-and-white canvas
