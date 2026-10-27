# Tuple — Style Reference
> Developer pair-programming workshop — clean white surfaces, one violet CTA, playful multi-color accents, and a dark band that makes the light sections breathe.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tuple's design language is a developer's pair-programming workshop: bright, airy light surfaces with a single confident violet CTA that makes the primary action unmistakable. The visual identity leans on a four-color accent palette — violet, blue, orange, green — used sparingly as headings, icons, and the product-screenshot wallpapers, while the structural UI stays zinc-neutral and quiet. Typography pairs Inter Variable for everything functional with DM Mono for small all-caps labels and section eyebrows, which is a signature devtool move: mono labels say 'this is a product built by engineers' without resorting to skeuomorphism. Components are mostly flat and bordered rather than heavily shadowed, with a mix of 8px and 12px radii giving cards a modern-but-not-too-soft feel. The page alternates between generous white space sections and one dramatic dark band, creating rhythm without monotony.

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris | `#6a5ed9` | Primary action — CTA buttons, filled links, active nav states |
| Cobalt | `#3f71d4` | Brand accent — icons, heading highlights, link hover; the most-used chromatic color in illustrations and product chrome |
| Coral | `#db5434` | Brand accent — headings, product-screenshot strokes, decorative highlights; warm counterweight to the cool blues and violets |
| Sprout | `#1bb152` | Green text accent for links, tags, and emphasized short phrases |
| Emerald | `#16a34a` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Mint | `#22c55e` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Lime | `#4ade80` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Crimson | `#ef4444` | Red wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Saffron | `#ffb929` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Zinc 50 | `#fafafa` | Page background, hero canvas |
| Zinc 100 | `#f4f4f5` | Subtle section backgrounds, footer strips, surface wash |
| Zinc 200 | `#e4e4e7` | Hairline borders, dividers, card outlines, input borders — the most-used neutral, structural backbone of every component |
| Zinc 300 | `#d4d4d8` | Muted borders, disabled strokes, secondary dividers |
| Zinc 400 | `#a1a1aa` | Muted icon fills, placeholder text, tertiary text |
| Zinc 500 | `#71717a` | Secondary text, caption text, helper copy, muted nav links |
| Zinc 600 | `#52525b` | Card outlines, emphasized borders, tertiary surface strokes |
| Zinc 700 | `#3f3f46` | Body text accent, medium-emphasis text, card inner surfaces on dark sections |
| Zinc 800 | `#27272a` | Primary text color, heading text, dark card surfaces, dark band backgrounds |
| Zinc 900 | `#18181b` | Deepest dark — dark section canvases, near-black surfaces |
| White | `#ffffff` | Card surfaces, button text on dark, raised content backgrounds |
| Mint Wash | `#dcfce7` | Gray wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Saffron Wash | `#fdc75c` | Warm section background, decorative wash |

## Typography

### Inter Variable — Primary UI and heading typeface. Inter carries all functional text: body copy at 16px/400, nav at 14px/500, subheadings at 18–20px/600, and large display headlines at 48–60px/700. The custom font features (cv05, cv06, ss01) refine the alternate glyphs and tabular figures — a devtool-grade choice that signals engineering precision. Weight 700 is reserved for the hero headline; weight 500 dominates nav and buttons; weight 400 carries body copy.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 13, 14, 16, 18, 20, 24, 36, 48, 60
- **Line height:** 1.00–1.63
- **OpenType features:** `"cv05", "cv06", "ss01"`

### DM Mono — Monospace label and eyebrow typeface. DM Mono appears in small all-caps section tags (e.g. 'WORKFLOW'), nav micro-labels, and technical micro-copy. Letter-spacing opens up to 0.05em–0.1em at smaller sizes, which is the mono-label signature: tight tracking would look cramped, the extra air gives labels a 'badge' presence. Custom features (ss03, ss04, ss05) activate stylistic alternates for the mono character set.
- **Substitute:** JetBrains Mono
- **Weights:** 400, 500
- **Sizes:** 11, 12, 13, 14, 16
- **Line height:** 1.33–1.63
- **Letter spacing:** 0.05em–0.1em at 11–14px
- **OpenType features:** `"ss03", "ss04", "ss05"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.6px |
| body | — | — | 16px | 1.63 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 20px | 1.43 | — |
| heading | — | — | 24px | 1.33 | — |
| heading-lg | — | — | 36px | 1.2 | — |
| display | — | — | 48px | 1.14 | — |
| display-lg | — | — | 60px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-96px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 4-8px
- **tags:** 9999px
- **cards:** 8-12px
- **links:** 4px
- **inputs:** 8px
- **buttons:** 12px
- **large-cards:** 16-24px

## Components

### Primary CTA Button
**Role:** Main action button

Filled violet (#6a5ed9) button with white text, 12px radius, padding 12px 24px. Inter Variable 16px weight 500. Used for 'Start your free trial' and primary conversion actions.

### Ghost Nav Button
**Role:** Secondary navigation action

Transparent background, Zinc 800 text, no border, 4–8px radius. Used for 'Log in' and similar low-emphasis nav items.

### Outlined Button
**Role:** Secondary action

White background, 1px Zinc 200 border, Zinc 800 text, 12px radius, 12px 24px padding. Used for 'Sign up' and tertiary actions in nav.

### Pill Tag
**Role:** Label or badge

Full 9999px radius, small padding 4px 12px, Inter or DM Mono 12–13px text. Used for status indicators and category pills.

### Mono Section Eyebrow
**Role:** Category label above headings

DM Mono 11–13px weight 500, letter-spacing 0.05em–0.1em, uppercase, in a brand accent color (green for 'WORKFLOW'). Sits centered above section headings.

### Feature Card
**Role:** Content card for feature sections

White or Zinc 100 surface, 1px Zinc 200 border, 8–12px radius, 16–24px padding. Optional 0 25px 50px -12px shadow for elevated variants. Contains icon, heading, and body copy.

### Logo Strip Row
**Role:** Social proof / trusted-by section

Horizontal row of grayscale partner logos at single opacity, spaced 48–80px apart, centered, under a small DM Mono eyebrow label. Logos desaturated to Zinc 500 to reduce visual competition.

### Hero Headline
**Role:** Primary page headline

Inter Variable 48–60px weight 700, Zinc 900, centered, tight line-height 1.0–1.14. The hero signature is centered text + subtitle + single violet CTA on a clean white canvas.

### Product Screenshot Frame
**Role:** App preview image

Rounded 8–12px radius, optional subtle shadow, displayed full-bleed or contained within a gradient or solid backdrop. The product screenshot itself includes colorful macOS window chrome.

### Dark Feature Card
**Role:** Card on dark band sections

Zinc 800 or near-black surface, 1px subtle border, 8–12px radius. Contains folder/file-tree UI or feature illustrations. Used inside the dark 'Built for developers' section.

### Nav Bar
**Role:** Top navigation

Horizontal bar, white or transparent background, 1px Zinc 200 bottom border. Logo left, nav links center or right, CTA right. Sticky on scroll with subtle shadow. Height 56–64px.

### Footer
**Role:** Site footer

Zinc 100 background, 1px Zinc 200 top border, multi-column link layout, small Inter 13–14px text in Zinc 500. Centered logo above link grid.

## Do's and Don'ts

### Do
- Use #6a5ed9 exclusively for the primary CTA — never repurpose it for icons, headings, or decoration; its scarcity is what makes it feel like an action
- Use Inter Variable for all body, nav, button, and heading text; reserve DM Mono strictly for uppercase eyebrows, technical labels, and micro-copy
- Set buttons and cards to 12px radius; use 8px for inputs and nav items; use 9999px only for true pill tags and status badges
- Set hero headlines to 48–60px weight 700 in Zinc 900; center the headline, subtitle, and CTA vertically with generous 64–96px section gaps above and below
- Pair every section with a DM Mono uppercase eyebrow in a brand accent color (green, blue, or orange) — this is the signature move that signals devtool credibility
- Anchor light sections on #fafafa canvas with #ffffff card surfaces and #e4e4e7 hairline borders; do not introduce new background colors without a structural role
- Use the dark band (#18181b) sparingly — once per page — to make surrounding light sections feel brighter by contrast
- Reference exact token values (colors, radii, spacing) from this spec when generating new components; do not estimate or interpolate

### Don't
- Do not use #3f71d4, #db5434, #1bb152, or other brand accents as button fills — they are decorative, not action colors
- Do not apply heavy drop shadows to standard cards; use 1px borders and subtle 0 1px 3px shadows, reserving 0 25px 50px shadow for hero-level elevation only
- Do not mix Inter and DM Mono in the same sentence or label — DM Mono is for standalone labels and eyebrows only
- Do not center-align body copy or feature descriptions — keep body text left-aligned for readability, reserving center alignment for hero and section intros
- Do not introduce a new accent color outside the four-color brand palette (violet, blue, orange, green)
- Do not use #27272a for decorative text on light backgrounds where #71717a secondary text would suffice; reserve Zinc 800 for headings and primary copy
- Do not stack multiple colored gradients in the same view; one gradient or color-wash per section maximum
- Do not use border-radius above 12px for functional components (buttons, inputs, cards) — 16–24px should only appear on oversized feature cards or decorative frames

## Elevation

- **Card:** `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)`
- **Bordered card:** `0 0 0 1px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)`
- **Elevated card / modal:** `0 25px 50px -12px rgba(0,0,0,0.25)`
- **Heavy-outlined card:** `0 0 0 1px rgba(0,0,0,0.75)`
- **Sticky nav:** `0 0 0 1px rgba(0,0,0,0.05), 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)`

## Surfaces

- **Canvas** (`#fafafa`) — Page background, hero and feature sections
- **Card** (`#ffffff`) — Raised product cards, inner content blocks
- **Wash** (`#f4f4f5`) — Subtle alternating section background, footer strip
- **Dark Band** (`#18181b`) — Dark feature section (e.g. 'Built for developers')
- **Color Wash** (`#dcfce7`) — Decorative green section background for variety

## Imagery

Product screenshots dominate the visual language: full macOS window captures with menu bars, code editors, and colorful gradient wallpapers (green-to-coral, violet-to-blue) serve as the primary 'hero images'. These are always contained within a rounded frame (8–12px radius), never full-bleed. Illustration style is minimal — small line-art character mascots (the cartoon gnome/bird figures flanking the Linux announcement pill) and simple folder/file-tree icons in the dark section. No lifestyle photography, no stock imagery. The dark 'Built for developers' section uses a subtle radial-line concentric-circle motif behind the UI card, giving depth without illustration. Icon style: thin-stroke outlined icons in brand accent colors (violet, blue, green), consistent 1.5–2px stroke weight. Imagery is decorative-atmosphere and product-showcase — it sells the product, not the brand.

## Layout

Max-width ~1200px centered content area with generous side padding. Hero is a centered vertical stack: nav bar → DM Mono eyebrow pill → large display headline → subtitle → single violet CTA → free-trial micro-copy → product screenshot frame. The page alternates between light and dark bands in a consistent rhythm: light hero → light product showcase → light trusted-by logo strip → dark 'Built for developers' feature band. Each band is separated by 64–96px vertical padding, with seamless flow (no dividers between bands). Feature sections inside the dark band use centered 2-column or 3-column card grids. The overall density is spacious and breathing — sections rarely compete for attention, and the single dark band creates a strong rhythm reset mid-page. Navigation is a clean top bar with logo left, links center, CTA right; sticky on scroll with a subtle border.

## Similar Brands

- **Linear** — Same devtool sensibility — zinc neutrals, single accent color for CTAs, generous whitespace, mono labels for technical identity
- **Vercel** — Dark-band rhythm device, minimal bordered cards, 8–12px radius, Inter Variable as primary typeface with mono accents
- **GitLab** — Purple primary CTA on light surfaces, multi-color accent palette used as decoration, section-eyebrow pattern above headings
- **CodeSandbox** — Devtool brand that uses colorful gradient product screenshots as hero imagery, clean white canvas, confident single-color CTA
