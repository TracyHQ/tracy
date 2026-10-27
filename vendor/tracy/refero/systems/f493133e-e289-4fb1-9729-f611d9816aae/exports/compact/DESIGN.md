# Solana — Style Reference
> neon aurora in a midnight void — flowing magenta and violet ribbons suspended against pure black

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Solana operates in a midnight void: a near-black canvas punctuated by flowing neon aurora graphics in violet, magenta, and green. The system is deliberately monochromatic — white and warm-gray typography carry all communication weight, while the only chromatic presence comes from the brand's signature flowing wave illustrations, never from interface chrome. Components are whisper-thin: 1px hairline borders, pill-shaped controls at 9999px radius, and cards that float on barely-distinguishable dark surfaces. The custom Diatype typeface, with its tightly negative letter-spacing that tightens further at display sizes, gives every headline a compressed, futuristic confidence. Buttons achieve a subtle 3D embossed effect through a layered shadow stack that pairs a soft drop shadow with inset white highlights — the chrome looks pressed into the surface rather than floating above it. Density is comfortable, never packed; the page breathes with generous section gaps and lets the aurora graphics do the visual heavy lifting.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page canvas, deepest background layer — the void against which everything else floats |
| Obsidian | `#0d0c11` | Card surfaces, elevated panels — a barely-perceptible warm purple-black lift from the canvas |
| Charcoal Press | `#121212` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Onyx | `#12151d` | Navigation bar background, sticky header surface |
| Smoke | `#050505` | Secondary canvas tone, gradient terminus — the deepest non-pure-black |
| Graphite | `#3e3c41` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Ash | `#848895` | Muted text, secondary navigation labels, icon strokes in resting state |
| Fog | `#ababba` | Body text, descriptions, secondary copy — warm gray that softens white's intensity |
| Bone White | `#ffffff` | Primary headings, high-emphasis text, icon fills, reversed button text |
| Hairline | `#eaecf0` | Ultra-subtle borders at low opacity — defines card edges and input fields against the void |

## Typography

### Diatype — Primary typeface for all UI — body text, headings, buttons, navigation. The geometric, slightly condensed forms paired with aggressively negative letter-spacing give every line a compressed, technical authority. Weight 300 for display headlines creates a whisper-confident tone; weight 400 for body; weight 500 for emphasis. Letter-spacing tightens proportionally: -0.04em at display sizes, -0.01em at body sizes.
- **Substitute:** Inter, Geist, Satoshi
- **Weights:** 300, 400, 500
- **Sizes:** 16, 18, 20, 21, 24, 28, 36, 40, 64, 88
- **Line height:** 1.00–1.56
- **Letter spacing:** -0.04em at 88px, -0.03em at 40-64px, -0.02em at 24-36px, -0.01em at 16-21px

### DSemi — Reserved for the Solana wordmark and select nav micro-labels at 12-14px. The heavy weight at micro sizes acts as a brand signature — a condensed monospaced bold that contrasts Diatype's lighter geometric forms.
- **Substitute:** JetBrains Mono Bold, Space Mono Bold
- **Weights:** 700
- **Sizes:** 12, 14
- **Line height:** 1.14, 1.33

### ui-sans-serif — ui-sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 21px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.12px |
| body-sm | — | — | 14px | 1.5 | -0.14px |
| body | — | — | 16px | 1.56 | -0.16px |
| body-lg | — | — | 18px | 1.5 | -0.18px |
| subheading | — | — | 21px | 1.4 | -0.21px |
| heading-sm | — | — | 24px | 1.33 | -0.48px |
| heading | — | — | 36px | 1.22 | -1.08px |
| heading-lg | — | — | 64px | 1.13 | -2.56px |
| display | — | — | 88px | 1 | -3.52px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 4px
- **cards:** 12px
- **badges:** 9999px
- **inputs:** 12px
- **buttons:** 9999px

## Components

### Pill Primary Button
**Role:** Primary action trigger

9999px border-radius (full pill). Background #121212 with the signature embossed shadow stack. Text: Diatype 16px weight 500, #ffffff. Padding: 10px 20px. Includes a leading icon (arrow/triangle) before the label. The inset white highlights make the pill look like it catches light from above.

### Pill Ghost Button
**Role:** Secondary action, view-all links

9999px border-radius. Transparent or #0d0c11 background with #eaecf0 border at low opacity. Text: Diatype 14-16px weight 400, #ababba or #ffffff. Padding: 8px 20px. Used for less prominent actions like 'View all'.

### Carousel Arrow Button
**Role:** Horizontal scroll navigation

Circular button (9999px radius), ~40px diameter. #121212 background with #eaecf0 border. Contains a left/right chevron in #ababba. Shadow-less — sits flat on the surface.

### Navigation Bar
**Role:** Persistent site header

Full-width sticky bar at #12151d background. Left: Solana wordmark (DSemi 14px weight 700, #ffffff) with the triple-bar logo mark. Center: nav links (Diatype 14px weight 400, #ababba) with chevron dropdowns. Right: search input, language selector. Padding: 12px 24px. Height ~56px.

### Search Input
**Role:** Global search and AI prompt

Rounded input with 12px radius. Background: #0d0c11. Border: 1px #eaecf0 at low opacity. Placeholder: 'Search or ask AI' in Diatype 14px #848895. Includes a keyboard shortcut badge ('⌘K') in the right corner. Padding: 8px 16px.

### Event Card
**Role:** Promotional content tile for conferences and hackathons

12px border-radius. Full-bleed gradient or photographic background. Contains overlaid event branding text in large display type, date, and location. No visible border — the card edge is defined by the imagery. Dimensions vary; typically 1:1.2 aspect ratio in horizontal carousels.

### Content Card
**Role:** Article or feature card

12px border-radius. Background: #0d0c11. Border: 1px #eaecf0 at very low opacity. Padding: 24px. Contains a small icon mark, headline (Diatype 24-28px weight 400, #ffffff), and optional body text in #ababba. No drop shadow — the border alone defines the edge.

### Partner Logo Strip
**Role:** Social proof and trust signals

Horizontal row of 6-8 partner logos (Western Union, Visa, Worldpay, Circle, PayPal, Fiserv). Logos rendered in their native brand colors or in #ababba monochrome. Centered, no dividers, generous spacing between logos.

### Hero Section
**Role:** Above-the-fold brand statement

Full-width dark canvas with the aurora gradient (linear-gradient black to #14001d). Left-aligned headline at 64-88px Diatype weight 300, #ffffff. Sub-text at 18px Diatype weight 400, #ababba. Primary pill button below. Flowing wave SVG graphics occupy the right 60% of the viewport, extending beyond the fold.

### Floating Chat Bubble
**Role:** AI assistant entry point

Fixed bottom-right element. Dark pill shape with #eaecf0 border. Solana logo mark + 'Ask AI' label in Diatype 14px #ffffff. Sits independently from the page flow — always visible regardless of scroll position.

### Section Heading
**Role:** Subsection title anchor

Diatype 40-64px weight 300, #ffffff. Two-line structure common (e.g., 'Meet Solana IRL. / Build connections.'). Left-aligned. No accompanying decorative element — relies on size and weight contrast for hierarchy.

## Do's and Don'ts

### Do
- Use the void black (#000000) as the base canvas for all pages — never introduce a light background section
- Apply Diatype weight 300 for all display and hero headlines; reserve weight 500 only for button labels and short emphasis runs
- Set border-radius to 9999px for every button, tag, and pill-shaped element — the pill is a brand signature
- Use the embossed button shadow stack (inset white highlights + soft drop shadow) on all primary actions to maintain the pressed-glass feel
- Reference the aurora gradient (black to #14001d) as the only acceptable canvas gradient — it creates depth for the wave graphics
- Keep all body and description text in #ababba Fog; reserve pure white exclusively for headings and high-emphasis labels
- Use 12px radius for cards and content containers, 4px for small UI elements — never default to 8px

### Don't
- Do not introduce a chromatic CTA color — all primary actions use the dark embossed pill with white text
- Do not use drop-shadow elevation on cards or panels; the system defines surface layers through background luminance shifts, not shadows
- Do not break the negative letter-spacing pattern at any size — tracking loosens the brand's compressed authority
- Do not use decorative gradients on UI components (buttons, cards, inputs) — gradients belong only in the hero aurora and event imagery
- Do not set border-radius to 0 or to common defaults like 8px on interactive elements; the radius scale is 4/12/9999 only
- Do not place light or white surfaces in the interface — the entire system lives in the void
- Do not use saturated colors for icons, badges, or status indicators; all functional UI is monochrome

## Elevation

- **Pill Button:** `rgba(0, 0, 0, 0.17) 0px 2px 4px 1px, rgba(255, 255, 255, 0.29) 0px -4px 12px 0px inset, rgba(255, 255, 255, 0.4) 0px 1px 0px 0px inset, rgba(255, 255, 255, 0.2) 0px -1px 0px 0px inset`

## Surfaces

- **Void** (`#000000`) — Base page canvas — the absolute background
- **Obsidian** (`#0d0c11`) — Card surfaces, content containers
- **Charcoal** (`#121212`) — Elevated buttons, hover-state surfaces
- **Onyx** (`#12151d`) — Sticky navigation, persistent UI chrome

## Imagery

The signature visual element is the flowing aurora wave: smooth, ribbon-like 3D curves in violet, magenta, and electric green that sweep horizontally across the hero canvas. These are rendered as soft, semi-transparent gradient meshes — not sharp line art — giving them a nebulous, atmospheric quality. Event cards feature full-bleed photographic and graphic composites with heavy gradient overlays. Partner logos appear in their native brand colors but small and contained. Product and protocol imagery is absent from the homepage; the aurora and event photography carry all visual weight.

## Layout

Full-bleed dark canvas, no max-width constraint on background color — content containers are max-width 1280px centered. Hero is left-aligned text occupying the left 40% with aurora wave graphics filling the right 60% and bleeding off-screen. Sections stack vertically with 80px gaps, alternating between black canvas and slightly elevated obsidian surfaces. Content blocks are 2-column or 3-column grids: event cards in horizontal carousels (3 visible at once with edge bleed), content cards in 2-up splits, partner logos in single horizontal rows. Navigation is a single sticky top bar at 56px height. No sidebar, no footer columns visible above the fold — the page prioritizes generous vertical breathing room over information density.

## Similar Brands

- **Polygon Labs** — Same dark-void canvas with flowing neon-purple wave graphics in the hero, and similarly compressed geometric sans-serif headlines at display sizes
- **Ethereum.org** — Dark theme with minimal UI chrome, white-only typography hierarchy, and large display headlines that dominate the viewport
- **Vercel** — Pure black canvas with high-contrast white type, ultra-thin hairline borders, and pill-shaped controls — same anti-decorative philosophy
- **Linear** — Near-identical typographic restraint: custom geometric sans-serif, aggressively negative letter-spacing at display sizes, dark elevated surfaces defined by background shifts rather than shadows
- **Stripe** — Similar gradient-based hero illustrations that create atmospheric depth without UI noise, and the same compressed weight-300 headline treatment at hero scale
