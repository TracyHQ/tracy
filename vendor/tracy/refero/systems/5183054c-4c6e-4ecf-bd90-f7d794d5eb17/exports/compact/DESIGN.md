# Telepathic Instruments — Style Reference
> broadcast control room at golden hour — obsidian screens, warm cream paper, one tungsten bulb

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Telepathic Instruments operates in a studio-dark, broadcast-crisp visual register: full-bleed atmospheric photography gives way to white product surfaces and pill-shaped controls, with a single vivid orange as the only chromatic punctuation in an otherwise monochrome world. Typography is the brand's loudest instrument — Suisse Intl set at near-display sizes with aggressive negative tracking (up to -0.03em) creates headlines that read as engineering specimens rather than marketing copy. The aesthetic borrows from audio hardware UIs and Bauhaus signage: hairline borders, flat surfaces, one functional accent, generous negative space. Components stay low-weight and gestural — pill buttons, ghost links, soft 24px card radii — letting product imagery and music equipment screenshots carry visual weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Solder Orange | `#ff6c2f` | Primary action background, call-to-action pills, featured product highlight — the single chromatic accent that makes interactive elements feel switched on against the otherwise neutral canvas |
| Bone | `#d7cdb8` | Warm beige wash — soft highlight surfaces and muted decorative fills that keep the palette from feeling clinical |
| Signal White | `#ffffff` | Card surfaces, content backgrounds, reversed text on dark fills — the clean base layer where product photography sits |
| Linen Gray | `#e5e7eb` | Page canvas, hairline borders, nav separators, input borders — the dominant neutral providing the structural baseline across the entire interface |
| Fog | `#c2c2c2` | Muted surface fills, secondary panel backgrounds, disabled states |
| Soft Mist | `#dddee2` | Tertiary surface tint — subtle elevation step between canvas and card |
| Ash | `#a3a3a3` | Muted helper text, secondary nav labels, icon strokes at rest, footer meta — the quiet voice for non-primary content |
| Carbon Black | `#000000` | Primary text, filled button backgrounds, high-contrast borders, icon fills — the authority tone for headlines and structural elements |
| Deep Charcoal | `#191919` | Near-black surface for the floating nav pill, dark overlay panels, and any near-pure-black surface that needs slightly less harshness than pure black |

## Typography

### Suisse Intl — Primary typeface for all display, heading, body, and UI text. The 100px display size paired with -0.0300em tracking and 0.85 line-height creates headlines that read as tightly engineered display specimens — a grotesque with neo-grotesque calm. Weight 500 is used sparingly for emphasis in nav and labels; weight 400 carries body and most headings. Substitute with Inter or Neue Haas Grotesk if Suisse Intl is unavailable.
- **Substitute:** Inter, Neue Haas Grotesk, Söhne
- **Weights:** 400, 500
- **Sizes:** 12px, 16px, 18px, 20px, 24px, 100px
- **Line height:** 0.85, 1.20, 1.25, 1.40, 1.50
- **Letter spacing:** -0.0300em at display (100px), -0.0200em at heading (24px+), normal at body and below

### Suisse Intl Mono — Monospaced companion for technical labels, button text, nav items, tag captions, and any interface element that needs to read as instrument-grade or technical. Letter-spacing stays normal — the mono face provides the engineering voice while the grotesk provides the editorial voice. Substitute with JetBrains Mono or IBM Plex Mono.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Geist Mono
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.00, 1.20, 1.25, 1.33, 1.43, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.25 | 0px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 18px | 1.4 | 0px |
| heading-sm | — | — | 20px | 1.25 | -0.4px |
| heading | — | — | 24px | 1.2 | -0.48px |
| display | — | — | 100px | 0.85 | -3px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 2px
- **cards:** 24px
- **inputs:** 2px
- **buttons:** 9999px
- **navPill:** 64px
- **largeSurfaces:** 32px

## Components

### Floating Pill Navigation
**Role:** Primary site navigation

Dark pill-shaped floating nav (Deep Charcoal #191919 background) centered at the top of the page, containing the brand wordmark on the left, uppercase nav links in Suisse Intl Mono 12px with generous letter-spacing, and a globe icon + bag counter on the right. Uses 64px border-radius to achieve the full pill shape, with 36px horizontal padding and ~14px vertical padding. Sits above content with a subtle drop, creating a control-panel header.

### Primary CTA Pill Button (Orange)
**Role:** Primary action button

Solder Orange (#ff6c2f) filled pill with white text, 9999px border-radius, 16px vertical × 24px horizontal padding, Suisse Intl Mono 12px uppercase. The single chromatic button in the system — used sparingly for the most important action on any page (mailing list, buy now). Always sits on a neutral or photographic surface to maximize contrast.

### Secondary Ghost Pill Button
**Role:** Secondary action button

White or transparent background with Carbon Black border (1px), Carbon Black text, 9999px radius, 16px × 24px padding, Suisse Intl Mono 12px uppercase. Paired with a right-arrow chevron. Used for secondary actions like 'Join Discord' and 'Join Patreon'.

### Tertiary Text Link
**Role:** Tertiary navigation or inline link

No background, no border. Carbon Black text in Suisse Intl Mono 12-14px, with a right-arrow chevron suffix to indicate action. Used for exploratory navigation like 'Explore Product' in card overlays.

### Featured Product Card (Large)
**Role:** Hero product showcase

Large card with 24px border-radius, generous internal padding (40px), containing a product label in the top-left, a ghost 'Explore Product' link in the top-right, and a full product screenshot filling the body. The Pistil Plugin card uses a warm gradient wash (Bone #d7cdb8 to a peach tone) as background. Cards sit on the Linen Gray canvas with no shadow — flat presentation.

### Merchandise Product Card
**Role:** Product grid item for merch

Tall portrait-ratio card (roughly 1:1.3) with 24px border-radius, no internal padding — the product image fills the entire card edge-to-edge with a forest/outdoor photographic background. Product name overlaid in white Suisse Intl at the top-left, small ghost circle link in the top-right. Image-dominant, text-minimal.

### Community Portrait Card
**Role:** Social proof / community showcase

Portrait-format photo card with 24px border-radius, 2-3px white border ring creating a printed-photo feel. Image fills the card with a username handle overlay in the bottom-right in white Suisse Intl Mono 12px. No shadow — flat photographic grid.

### Section Header Block
**Role:** Section title and description pair

Two-column layout: section title on the left (Suisse Intl 20-24px weight 500, Carbon Black) and descriptive paragraph on the right (Suisse Intl 16px, Ash #a3a3a3 or Carbon Black). Followed by a horizontal row of action buttons below. Used for the 'The Garden' / community section.

### Hero Text Overlay
**Role:** Full-bleed hero with atmospheric photography

Full-viewport-width atmospheric photographic background (dark teal/green blurred studio imagery) with centered display text in Suisse Intl weight 400 at 100px, -0.0300em tracking, 0.85 line-height, in white. No overlay scrim — the text relies on the image's dark areas for contrast. A single CTA pill button sits centered at the bottom of the viewport.

### Mail List Sticky Bar
**Role:** Persistent mailing list prompt

Thin fixed bar at the bottom-left of the viewport, Solder Orange (#ff6c2f) background, white uppercase Suisse Intl Mono text reading 'JOIN THE MAITLIST' (note the intentional brand typo), with a small white dismiss circle (×) at its right edge. Acts as a persistent low-friction conversion prompt.

## Do's and Don'ts

### Do
- Use Solder Orange #ff6c2f only for the single most important action on a page — once maximum. All other actions use Carbon Black or ghost variants.
- Set display headlines at 100px with -0.0300em letter-spacing and 0.85 line-height in Suisse Intl weight 400. The tight tracking is the signature — do not loosen it.
- Apply 24px border-radius to all product cards, community photos, and large surface containers. Use 2px for inputs, tags, and small UI elements. Use 9999px for all buttons and pills.
- Use Suisse Intl Mono for all button text, nav links, labels, and any element that should read as technical or instrument-grade. Keep it uppercase with normal letter-spacing.
- Let the floating dark pill nav sit above content with generous top margin (56px+). It is the first thing a visitor sees and must read as a control surface.
- Build card grids that are image-dominant: full-bleed photography filling the card edge-to-edge, with text overlaid or in a minimal header strip.
- Anchor sections with 80px vertical gaps. The comfortable density requires air — do not compress sections below 56px.

### Don't
- Do not introduce additional accent colors. The entire chromatic system is one orange. Adding a blue, green, or second orange dilutes the signal.
- Do not use soft drop shadows on cards or panels. The design is deliberately flat — depth comes from surface color steps and photography, not elevation.
- Do not set body text below 14px. The mono face in particular becomes illegible below 12px; use it only for true labels.
- Do not center-align body paragraphs. Use left-aligned two-column section headers (title left, description right) for all non-hero content blocks.
- Do not use the Bone beige #d7cdb8 as a button background or interactive surface — it is decorative wash only. Interactions live in the neutral/orange binary.
- Do not apply letter-spacing to the Suisse Intl Mono face. It already reads as technical; adding tracking breaks the instrument-grade voice.
- Do not mix sans-serif fonts beyond the Suisse Intl + Suisse Intl Mono pair. No serif introductions, no system font fallbacks in final output.

## Elevation

The design is deliberately flat. No drop shadows are applied to cards, buttons, or panels. Depth is communicated exclusively through surface color steps (canvas → card → elevated tint) and the contrast between the dark floating nav and the light canvas beneath it. This reinforces the broadcast/instrument aesthetic where physical hardware has zero shadow when front-lit.

## Surfaces

- **Page Canvas** (`#e5e7eb`) — The dominant background — a near-gray linen that recedes behind all content
- **Card Surface** (`#ffffff`) — Clean white product cards and content panels sitting on the linen canvas
- **Soft Tint** (`#dddee2`) — Subtle elevation step for nested or secondary panels
- **Muted Fill** (`#c2c2c2`) — Disabled or inactive surface state
- **Featured Wash** (`#ff6c2f`) — Full-bleed warm gradient background for hero product cards

## Imagery

Imagery is atmospheric and photographic, not illustrative: dark blurred studio photography dominates the hero (cool teal/green with obsidian shapes suggesting synthesizer equipment or circuit boards), while product sections use warm peach gradient backgrounds and outdoor forest photography for merchandise. Treatment is always full-bleed with 24px rounded corners — no hard-edged photography. Community section uses gritty candid phone-camera aesthetic (Damon Albarn studio shot, album art reproduction) with no color correction, embracing the lo-fi authenticity. Icons throughout are minimal — a small globe for locale, a bag icon for cart, and a close × for dismiss — all single-stroke mono style. No illustration or 3D rendering appears; the visual language is entirely photographic and product-screenshot based.

## Layout

The page follows a broadcast-stack rhythm: a full-bleed dark photographic hero with centered display text and a single bottom-anchored CTA, followed by a white content band containing a 2-column product grid (one large feature card on the left spanning ~60% width, two stacked product cards on the right), then a generous 80px gap leading to the community section. The community section uses a two-column header (title left, description + button row right) above a 3-column equal grid of community portrait cards. Navigation is a single floating dark pill centered at the top, not a full-width bar. The layout is strictly centered, max-width 1280px, with all content contained — no full-bleed sections beyond the hero image itself. Section gaps are large (80px) creating a magazine-spread rhythm rather than a dense feed.

## Similar Brands

- **Teenage Engineering** — Same single-accent-monochrome approach with a vivid orange against white/neutral, pill-shaped controls, and grotesk + mono type pairing for hardware-adjacent product UI
- **Moog Music** — Similar dark atmospheric hero photography of studio equipment, white product card grid, and engineering-voice mono labels for technical product details
- **Splice** — Same flat card-on-canvas layout, generous spacing, dark floating nav pill, and image-dominant product grids with minimal text overlay
- **Universal Audio** — Same professional audio aesthetic: tight grotesk display headlines, mono labels for plugin UI, dark moody hero photography of studio gear
