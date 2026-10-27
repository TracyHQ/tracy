# Dropmark — Style Reference
> Warm paper atelier with cubist murals

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Dropmark lives on a warm cream paper canvas (#f7f7f1) with almost no chrome, letting a vivid cubist illustration system carry the brand's voice while the interface stays nearly monochrome. The type system pairs DropmarkRealHead (weight 500, used sparingly for display and section titles) with DropmarkRealText (400/600/700) for everything else, creating a calm editorial cadence where headings whisper at medium weight rather than shout bold. A single cyan (#00affa) is the only chromatic UI accent, reserved for the outlined action border language and the filled primary button — every other surface and border is warm gray. Radii are near-zero (3px) and shadows are essentially absent, producing a flat, paper-like feel that contrasts deliberately with the bold geometric illustration murals acting as section art.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cyan Signal | `#00affa` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Cream Paper | `#f7f7f1` | Page canvas, section backgrounds, soft card surfaces — the warm off-white ground everything sits on |
| Pure White | `#ffffff` | Inset cards, modal surfaces, inverse button text, nav background |
| Stone Gray | `#dcdcd4` | Subtle accent surfaces, inset focus rings, warm shadow tints |
| Graphite | `#404040` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Mid Ink | `#333333` | Button text and border on dark surfaces, icon stroke |
| Charcoal | `#111111` | Headline text alternative, deep emphasis borders |
| Pewter | `#7f7f7f` | Secondary body text, muted helper text, inactive state text |
| Ink Black | `#000000` | SVG illustration linework, deepest icon fills |
| Midnight Violet | `#1e2554` | Illustration primary — the dominant dark shape color in cubist murals |
| Deep Iris | `#2c2a6c` | Illustration mid-tone — secondary dark purple in mural compositions |
| Coral Burst | `#ff5d43` | Illustration warm accent — orange-red shape fills in murals |
| Aqua Glow | `#38dede` | Illustration cool accent and icon highlight — teal punctuation in murals |
| Vivid Amethyst | `#9164fa` | Illustration bright accent — saturated purple shape fills |
| Blush | `#f8b3b8` | Illustration soft accent — pink shape fills for warmth in murals |

## Typography

### DropmarkRealHead — Display and section headings only — used at 60px for hero, 40px for section titles, 24px for sub-section headings. Medium weight is deliberate; avoids the heavy 700 convention to keep headlines calm and editorial rather than assertive.
- **Substitute:** Inter, system-ui
- **Weights:** 500
- **Sizes:** 24px, 40px, 60px
- **Line height:** 1.20
- **OpenType features:** `"lnum", "tnum"`

### DropmarkRealText — Body, buttons, nav, list, footer, supporting UI. 400 for body and links, 600 for emphasized sub-labels and button text, 700 reserved for occasional inline emphasis. Functions as the working sans — every non-heading element uses it.
- **Substitute:** Inter, system-ui
- **Weights:** 400, 600, 700
- **Sizes:** 13px, 14px, 15px, 16px, 17px, 20px, 24px, 40px
- **Line height:** 1.20–1.50
- **OpenType features:** `"lnum"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | — |
| heading-sm | — | — | 20px | 1.2 | — |
| heading | — | — | 24px | 1.2 | — |
| heading-lg | — | — | 40px | 1.2 | — |
| display | — | — | 60px | 1.2 | — |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 60px
- **Card padding:** 30px
- **Element gap:** 10-20px

### Border Radius

- **nav:** 3px
- **cards:** 0px
- **pills:** 60px
- **buttons:** 3px

## Components

### Primary Action Button (filled)
**Role:** Main conversion CTA on hero and section blocks

#00affa fill, white text, DropmarkRealText 600 at 16px, 3px radius, 12px 24px padding. No shadow. Hover should deepen the fill or add a subtle inner ring.

### Outlined Action Button
**Role:** Secondary conversion CTA paired with primary

Transparent fill, 2px #00affa border, #00affa text, DropmarkRealText 600 at 16px, 3px radius, 10px 22px padding. The chromatic outlined action is a signature of this system — it keeps the page from looking CTA-heavy.

### Dark Filled Button
**Role:** Top-right nav conversion ('Sign up')

#404040 fill, white text, DropmarkRealText 600 at ~14px, 3px radius, 8px 16px padding. Compact, contrasts the cream canvas.

### Text Link
**Role:** Inline links, footer links, nav links

#404040 default, #00affa on hover/active, DropmarkRealText 400, no underline by default, underline on hover. Border-bottom also used as a 1px divider element.

### Nav Bar
**Role:** Top-of-page site navigation

Cream #f7f7f1 or white background, 1px hairline bottom border in #dcdcd4 or stone-gray, DropmarkRealText 400 at ~15px. Left-aligned brand mark (cyan drop icon + wordmark), right-aligned text links spaced 20–35px apart, dark 'Sign up' button at far right. 8–10px vertical padding. Optional 2px inset focus ring on the active/hovered link.

### Hero Section
**Role:** Above-the-fold headline and primary conversion

Cream #f7f7f1 background, centered or left-aligned DropmarkRealHead 500 at 60px headline in #404040 (or near-black), subhead in DropmarkRealText 400 at 17px in #404040, paired filled + outlined CTAs below. Headline may wrap to two lines with a wide tracking. Followed immediately by a full-bleed cubist illustration band.

### Feature Card (horizontal)
**Role:** Feature highlight blocks below the hero

Horizontal layout: square or 4:3 image on the left (often a cubist illustration tile), text block on the right with DropmarkRealText 600 at 20px heading, body at 15–16px, and a #00affa text link ('Find out more', 'See resources', 'Show me how'). No card chrome — sits directly on cream, separated by 30px vertical rhythm.

### Illustration Mural Band
**Role:** Full-bleed decorative art between sections

Wide horizontal composition using the accent palette: #1e2554, #2c2a6c, #ff5d43, #38dede, #9164fa, #f8b3b8 on cream. Geometric cubist/isometric shapes with human figures. Acts as the brand's emotional punctuation — it carries personality so the UI doesn't have to.

### Statistics Panel
**Role:** Dark emphasis block ('Trusted for 15+ years')

#404040 or near-black background, white text, DropmarkRealHead 500 at 40px for the figure, DropmarkRealText 400 at smaller sizes for the label. 30px+ padding. Contrasts the cream surroundings to anchor credibility.

### Logo Strip
**Role:** Social proof — customer/team logos

Horizontal row of monochrome logos on cream background, no card chrome, generous 30–40px vertical padding, #404040 logo fills only.

### Footer Link Group
**Role:** Footer column links

DropmarkRealText 400 at 14–15px, #404040 with #00affa hover, stacked with ~5–10px vertical spacing. 1px #404040 hairline borders used as section dividers within the footer.

## Do's and Don'ts

### Do
- Use #00affa exclusively for the outlined action border and filled primary button — no other UI element should carry color
- Set border-radius to 3px for nav, buttons, and tags; reserve 60px for true pill shapes only
- Anchor headlines at DropmarkRealHead weight 500 — do not bold-up to 600/700 for display text
- Keep the page background #f7f7f1; use #ffffff only for inset cards and elevated surfaces
- Lean on the accent illustration palette (#1e2554, #2c2a6c, #ff5d43, #38dede, #9164fa, #f8b3b8) for mural art only, never for UI components
- Use 1px #404040 hairline borders as the primary structural divider, not boxes or shadows
- Pair every primary CTA with a #00affa outlined secondary action to maintain the two-button rhythm

### Don't
- Do not introduce additional chromatic colors into the UI — the system is intentionally monochrome with one cyan accent
- Do not use drop shadows for elevation; depth comes from surface color and illustration, not shadow
- Do not use border-radius larger than 3px on cards or buttons — the flat editorial geometry is the signature
- Do not bold body text above 600; 700 should appear only for rare inline emphasis
- Do not use #00affa as a text or background tint for non-action elements like tags, badges, or icons
- Do not place the illustration palette colors on text, borders, or background fills — they belong inside mural compositions
- Do not use the cream #f7f7f1 for buttons or CTAs; the canvas color must not compete with actions

## Elevation

The design is intentionally flat — the only shadow is a 2px inset stone-gray ring on the nav (rgb(220,220,210) 0 0 0 2px inset), used as a hairline focus/active state rather than elevation. Depth is created through the illustration murals and color blocks, not drop shadows.

## Surfaces

- **Cream Paper** (`#f7f7f1`) — Page canvas and full-bleed section backgrounds
- **Pure White** (`#ffffff`) — Inset cards, feature cards, nav bar, stat panel background
- **Stone Gray** (`#dcdcd4`) — Subtle accent panels, illustration ground planes
- **Graphite** (`#404040`) — Inverse dark surface for emphasis panels and stat blocks

## Imagery

The visual identity is dominated by large cubist/isometric illustration murals using a fixed accent palette (#1e2554 dark violet, #2c2a6c iris, #ff5d43 coral, #38dede teal, #9164fa amethyst, #f8b3b8 blush) set against the cream canvas. Murals are full-bleed, flat-vector, geometric, with simplified human figures interacting with oversized abstract objects (monitors, books, shapes). They function as section dividers and brand punctuation — not explanatory content. Feature cards pair small square mural crops with text. Photography is absent; no product screenshots, no real-world images. The illustration is the brand's voice, so the UI deliberately stays quiet around it. Iconography is minimal and uses the same geometric language at small sizes.

## Layout

Max-width ~1200px centered content on a full-bleed cream canvas. The hero is a centered or left-aligned text block with paired CTAs, followed by a full-bleed illustration mural band that bleeds edge-to-edge. Below, the page uses a consistent vertical rhythm of 60px section gaps with alternating cream and white card strips. Feature blocks are horizontal 2-column (image-left, text-right at roughly 1:1.5 proportions), stacked vertically. Social-proof logo strip and stat panel break the rhythm with a dark inverse surface. Navigation is a flat top bar, not sticky, with right-aligned text links. No sidebar. Grid is used sparingly — most composition is text-plus-illustration or simple stacking.

## Similar Brands

- **Notion** — Same nearly-monochrome UI with a single accent color and flat editorial typography, though Notion uses black-and-white almost exclusively
- **Milanote** — Direct visual sibling — warm cream canvas, flat geometric illustration as brand voice, and a quiet UI that lets the art carry personality
- **Pitch** — Calm light-theme interface with a single vivid accent for actions and generous spacing between sections
- **Are.na** — Editorial cream-paper aesthetic, minimal UI chrome, and imagery-first page compositions with quiet typography
