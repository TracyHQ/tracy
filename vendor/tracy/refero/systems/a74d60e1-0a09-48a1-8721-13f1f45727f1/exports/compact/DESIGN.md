# Safepal — Style Reference
> Electric violet cosmos with mint stars. SafPal lives in a deep indigo night where the only warmth is a neon mint accent and a single violet that burns like a signal flare.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

SafePal speaks in a cosmic violet vernacular: deep indigo canvases recede into atmospheric space while mint-green punctuation snaps focus back to the surface. The visual system rides on a vivid electric violet (#4a21ef) that saturates mid-page sections, paired with a luminous mint (#79efbd) that functions as the sole chromatic accent for headings, tags, and outlined action borders. Typography is monumental and assertive — the display headline at 80px with weight 800 demands ownership of the viewport, while body copy sits at a calm 16px. The 100px pill radius on buttons is the most recognizable shape signature, creating a soft contrast against the 24px card radius and the angular isometric illustrations of hardware wallets and phones that float in deep space. Surfaces stack from white cards over violet fields, with almost no shadows — depth is communicated through color contrast and illustrative floating elements rather than elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Violet | `linear-gradient(154.24deg, rgb(191, 255, 228) 11.19%, rgb(74, 33, 239) 62.38%)` | Page backgrounds, section bands, gradient anchor — the dominant chromatic field that defines brand presence across mid-page sections; Hero atmospheric gradient bridging mint into violet — sets the cosmic mood |
| Mint Pulse | `#79efbd` | Headline text on violet fields, outlined action borders, pill button fills, accent highlights — the sole warm punctuation against the cool violet |
| Terminal Green | `#18d26e` | Green accent for outlined action borders, linked labels, and lightweight interactive emphasis. Use as a supporting accent, not as a status color |
| Deep Indigo | `linear-gradient(124.15deg, rgb(13, 11, 51) 0%, rgb(75, 62, 211) 218.07%)` | Hero background, darkest surface layer, text on light surfaces, gradient terminus; Dark section backgrounds, depth gradient behind illustrations |
| Carbon | `#1d1d1d` | Body text, heading text on light surfaces, high-contrast typography color |
| Lavender Mist | `#f7f6ff` | Light card surfaces, subtle tints, nav backgrounds, gentle surface lift over white |
| Paper White | `#ffffff` | Card surfaces, text on dark backgrounds, footer surfaces, badge fills |
| Steel Gray | `#666666` | Muted body text, secondary labels, dividers, icon strokes at rest |

## Typography

### AlibabaPuHuiTi-2 — All interface text — custom geometric sans with extreme weight range. Display uses 800 for assertive headlines; body sits at 400 with comfortable 1.5+ line-height. The 137px size enables wall-scale hero typography. Heavy weights (800–1000) are used sparingly to avoid visual fatigue.
- **Substitute:** Inter, DM Sans, or Poppins at matching weights
- **Weights:** 400, 700, 800, 900, 1000
- **Sizes:** 12px, 14px, 16px, 18px, 24px, 32px, 48px, 80px, 137px
- **Line height:** 1.00–1.60

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.57 | — |
| subheading | — | — | 18px | 1.56 | — |
| heading-sm | — | — | 24px | 1.5 | — |
| heading | — | — | 32px | 1.2 | — |
| heading-lg | — | — | 48px | 1.17 | — |
| display | — | — | 80px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-113px
- **Card padding:** 24px
- **Element gap:** 12-16px

### Border Radius

- **nav:** 12px
- **cards:** 24px
- **other:** 48px
- **buttons:** 100px

## Components

### Pill Primary Button
**Role:** Main call-to-action

Fully rounded 100px radius, mint (#79efbd) fill, Deep Indigo (#0d0b33) text, weight 700, 16px size, 12px 24px padding. The pill shape is the most recognizable interaction element.

### Pill Ghost Button
**Role:** Secondary or navigation action

100px radius, transparent or white fill, mint (#79efbd) border at 1-2px, white or mint text. Used for download CTAs in nav.

### Hero Headline
**Role:** Display-level section heading

80px size, weight 800, white or Deep Indigo text depending on field, line-height 1.0. Sets the monumental, ownership-staking tone of the brand.

### Section Heading
**Role:** Mid-page section title

48px size, weight 800, white text on violet or mint text on dark. Centered alignment with generous above-spacing.

### Wallet Card
**Role:** Product showcase card

24px radius, white (#ffffff) fill, no visible shadow, 24px padding. Contains product imagery with floating illustration treatment.

### Testimonial Card
**Role:** Social proof card

24px radius, white fill, 24-32px padding, no border, no shadow. Contains quote text, avatar circle, and attribution with role label.

### Navigation Bar
**Role:** Top-level site navigation

Transparent over hero, white surface on scroll. 12px radius on dropdown elements. Logo left, links centered, language selector and pill download button right.

### Announcement Bar
**Role:** Site-wide news strip

Violet (#4a21ef) fill, white text, centered, thin height. Link text underlined with mint accent.

### Isometric Illustration Set
**Role:** Decorative hero and section visuals

Angular isometric renders of hardware wallets, phones, and crypto objects. Deep indigo outlines with mint and white fills. Float in space at varied scales with no ground plane.

### Feature Card
**Role:** Product feature highlight

24px radius, lavender (#f7f6ff) or white fill, generous padding, icon at top, heading + body text below. Minimal decoration.

### Badge Tag
**Role:** Category or status label

Pill or 12px radius, mint fill with dark text, small 12px size, 4-8px padding. Used for token tags and status indicators.

### Footer Surface
**Role:** Bottom site navigation

White or dark surface, multi-column link grid, logo, social icons. Generous 48-64px padding top and bottom.

## Do's and Don'ts

### Do
- Use 100px border-radius on all buttons and tags — the pill shape is the system's most recognizable signature
- Set hero headlines at 80px weight 800 in white over Deep Indigo (#0d0b33) or mint (#79efbd) over violet — never dilute the display weight below 700
- Use #4a21ef as the dominant mid-page section background — let violet breathe across large vertical bands rather than appearing as small accents
- Pair mint (#79efbd) exclusively as accent text or outlined actions on violet fields — mint should never appear on white surfaces as a fill
- Maintain 80-113px between major sections to preserve the cosmic spaciousness — dense stacking breaks the atmospheric rhythm
- Use isometric illustrations of wallet hardware and phones as floating objects in space, not grounded product shots
- Keep all surfaces shadowless — communicate depth through color contrast and illustration layering only
- Center-align section headings and hero text — asymmetric layouts break the poster-like clarity

### Don't
- Never use #4a21ef as a small accent — it must dominate sections or not appear
- Do not apply drop shadows to cards or buttons — the system is flat by design
- Avoid body text below 14px — the scale starts at 12px for captions only
- Never use the mint (#79efbd) as a large background fill for content sections — reserve it for accents and pill buttons
- Do not mix multiple gradient directions in one screen — each gradient should anchor one atmospheric moment
- Avoid outlined rectangular buttons — all interactive elements must use 100px pill radius
- Do not place white text on #f7f6ff — the contrast fails at that combination
- Never use weight 400 for headlines — the system demands 700+ for any heading level

## Elevation

Elevation is communicated through color contrast and floating isometric illustrations rather than drop shadows. Surfaces separate by hue and saturation step — white cards sit on violet fields, mint pills sit on indigo — with no visible shadow stacks. This flat-elevation approach keeps the visual system graphic and poster-like.

## Surfaces

- **Cosmic Canvas** (`#0d0b33`) — Hero and dark section base — deepest surface
- **Signal Field** (`#4a21ef`) — Primary brand section backgrounds — mid-page bands
- **Mint Accent** (`#79efbd`) — Highlight surfaces, pill button fills, accent zones
- **Lavender Lift** (`#f7f6ff`) — Subtle card tint over white
- **Paper** (`#ffffff`) — Top-level card and content surfaces

## Imagery

Illustration-driven with strong isometric perspective. Hardware wallets, smartphones, and crypto coins are rendered as angular 3D objects with deep indigo outlines, white faces, and mint-green accent details. Objects float in space without ground planes, scattered at varied scales and rotations. No photography of people or environments. The treatment is graphic-poster style — think vector illustration meets product render. Sparkle marks and small star shapes add cosmic atmosphere around larger objects. Decorative purple gradient orbs appear behind some compositions to add depth.

## Layout

Full-bleed sections with no max-width constraint on backgrounds — only text and content containers are constrained to ~1200px. Hero is dark with centered headline over isometric illustration cluster. Mid-page sections alternate between solid violet (#4a21ef) bands and lighter treatments with centered headings. Card grids are 3-column for testimonials and product showcases, with generous gutters (24-32px). Navigation is a fixed top bar with transparent-on-hero behavior. Sections flow seamlessly with no visible dividers — transitions are marked by color field changes. Content rhythm is spacious: 80-113px between sections creates breathing room for the cosmic atmosphere.

## Similar Brands

- **Ledger** — Same dark cosmic crypto-wallet visual language with hardware product illustrations and a single brand color dominating sections
- **Phantom Wallet** — Similar violet-and-dark crypto branding with pill-shaped CTAs and bold display headlines
- **Trust Wallet** — Dark hero sections with floating 3D product illustrations and vibrant gradient transitions
- **MetaMask** — Crypto product showcase style with monochromatic hero and illustration-driven product pages
