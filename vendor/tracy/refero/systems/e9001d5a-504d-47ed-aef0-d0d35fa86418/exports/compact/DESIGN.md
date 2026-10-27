# Ditto — Style Reference
> Sunlit wildflower compliance atelier. Warm cream surfaces, vivid yellow primary action, deep navy ink, organic color shapes blooming behind the product.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ditto uses a sunlit, garden-inspired SaaS language: a warm cream canvas, organic decorative blobs in vivid greens, pinks, and yellows, and a confident pairing of a warm serif (Hedvig Letters) for headlines with a clean grotesque (Inter) for everything else. The deep navy-violet #130e30 carries all structural text and borders, while a single bright yellow #ffe228 powers every primary action — the contrast is so high it reads almost like a highlighter. Components stay lightweight: pill-shaped buttons (1440px radius), generously padded cards on a slightly green-tinted surface (#eff2e5), and minimal elevation. The mood is optimistic and approachable, not corporate or clinical — the floral backdrop shapes, serif headlines, and warm neutrals keep it human.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Ink | `#130e30` | Primary text color, heading ink, card borders, secondary button fills — near-black violet that adds warmth over pure black |
| Hi-Yellow | `#ffe228` | Primary action fill (filled CTA buttons), hero pill backgrounds, accent highlights — bright highlighter yellow with near-black text for maximum contrast |
| Moss Green | `#59e25d` | Decorative organic shape fill behind hero — warm leaf green used in background blobs, not UI controls |
| Fuchsia | `#e261e5` | Decorative organic shape fill behind hero — vivid pink used in background blobs, not UI controls |
| Slate | `#5f5c6e` | Body text, helper copy, muted icons, subtle borders — cool desaturated gray for secondary information |
| Canvas | `#f9fbf2` | Page background, button ghost fills, lightest surface — near-white with slight green-warmth |
| Soft Meadow | `#eff2e5` | Card surfaces, nav background, elevated panels, hero backdrop — green-tinted off-white for soft surface separation |
| Charcoal | `#222222` | Secondary dark button text and borders, nav dividers — softer than pure black for dark UI elements |
| Onyx | `#000000` | Logo mark, nav text, input borders, fine stroke details — true black for highest-contrast elements |

## Typography

### Hedvig Letters Serif — Display and heading serif — all hero/section headlines, used at large sizes with tight letter-spacing. The warm humanist serif is the brand's voice; it gives the compliance product a literary, trustworthy quality instead of a sterile SaaS feel. The 700 weight carries the headlines, while 400 appears in larger pull-quote contexts.
- **Substitute:** DM Serif Display, Source Serif 4, Libre Caslon Text
- **Weights:** 400, 700
- **Sizes:** 22px, 32px, 48px, 64px
- **Line height:** 1.00–1.25
- **Letter spacing:** -0.0100em

### Inter — All UI and body text — nav links, button labels, form fields, card copy, footer text, small caps labels. Inter handles the functional layer with neutral efficiency, letting the serif carry the personality. Weight 500 for nav and labels, 400 for body, 600 for emphasis.
- **Substitute:** Inter is freely available via Google Fonts; no substitute needed
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 14px, 16px, 18px, 22px
- **Line height:** 1.20–1.50
- **Letter spacing:** -0.01em body, -0.02em small caps labels
- **OpenType features:** `"ss01" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | -0.2px |
| body-sm | — | — | 14px | 1.5 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 18px | 1.5 | -0.18px |
| heading-sm | — | — | 22px | 1.25 | -0.22px |
| heading | — | — | 32px | 1.15 | -0.32px |
| heading-lg | — | — | 48px | 1.1 | -0.48px |
| display | — | — | 64px | 1 | -0.64px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48-80px
- **Card padding:** 24-48px
- **Element gap:** 12-16px

### Border Radius

- **nav:** 1440px
- **tags:** 1440px
- **cards:** 24px
- **icons:** 1440px
- **images:** 24-48px
- **buttons:** 1440px

## Components

### Primary CTA Button (Filled Yellow)
**Role:** Main action trigger — 'Get Started', 'Log In', 'Read More'

Background #ffe228, text #130e30 in Inter 500 at 16px. Full pill radius 1440px. Padding 12px 24px. No shadow. Black text on yellow achieves 16.2:1 contrast. The yellow is so bright it functions as a highlighter; one per viewport maximum.

### Secondary Button (Dark Pill)
**Role:** Alternative action — used for 'Log In' alongside primary CTA

Background #130e30, text #ffffff in Inter 500 at 16px. Full pill radius 1440px. Padding 12px 22px. Creates a dark/light button pair with the yellow primary for visual hierarchy.

### Email Input Field
**Role:** Hero email capture form

White background #ffffff, border 1px solid #000000, text #130e30 in Inter 400 at 16px. Placeholder text in Slate #5f5c6e. Pill radius 1440px — the input and its adjacent button share the same radius creating a continuous capsule. Padding 12px 22px.

### Logo Lockup
**Role:** Brand identity in nav and footer

Mark + wordmark 'ditto' in #130e30. The mark uses a leaf/petal shape echoing the organic decorative blobs. Always paired with a nav layout, never standalone.

### Nav Bar
**Role:** Top-level site navigation

Background #eff2e5, horizontal layout with logo left, nav links center (Inter 500 16px in #130e30), CTA pair right. Nav items separated by chevron-down indicators for dropdowns. Globe icon for language. No shadow, sits flush on canvas.

### Hero Card / Product Mockup Container
**Role:** Showcases the product UI with decorative blob backdrop

White product card sits on top of organic colored shapes (green, pink, yellow, violet). The card has subtle border-radius 24px. Behind it, SVG-style organic blobs in #59e25d, #e261e5, #ffe228, and #130e30 create a garden-like atmosphere without illustration.

### Feature Card
**Role:** Content cards in 'Get compliant four times faster' grid

Background #eff2e5, padding 24-48px, border-radius 24px. Contains a small logo mark at top, a Hedvig Letters Serif heading at 22-32px in #130e30, and body text in Inter 16px #5f5c6e. No shadow or border — the surface contrast alone defines the card.

### Customer Logo Card
**Role:** Client showcase row

Logo centered on #eff2e5 surface, padding 24px, radius 24px. Below each logo, a small-caps 'CASE STUDY' link in Inter 500 10px with chevron. Logos displayed in monochrome #130e30.

### Testimonial Card
**Role:** Customer quote carousel

Background #eff2e5, padding 32px, radius 24px. Large quote text in Hedvig Letters Serif 22-32px or Inter 18px in #130e30. Avatar + name (Inter 500 14px #130e30) + title (Inter 400 12px #5f5c6e) at bottom. Horizontal carousel with arrow controls.

### Pagination Dot
**Role:** Carousel/slider position indicator

Inactive: small line/rectangle in #5f5c6e. Active: Hi-Yellow #ffe228 pill. Centered below the carousel.

### Small Caps Label
**Role:** Micro-copy above sections, case study tags, nav eyebrows

Inter 500 at 10-12px, letter-spacing -0.02em, color #5f5c6 or #130e30. All uppercase. Used sparingly as taxonomic labels rather than decoration.

### Hero Headline
**Role:** Primary page title — 'Get the CSR recognition you deserve'

Hedvig Letters Serif weight 700 at 48-64px, line-height 1.0-1.1, letter-spacing -0.01em, color #130e30. Fills the left column of a two-column hero with the product mockup on the right.

## Do's and Don'ts

### Do
- Use the 1440px pill radius on every button, input, nav link, tag, and icon container — the pill shape is the brand's signature geometry
- Pair the yellow CTA #ffe228 with the dark pill #130e30 for button hierarchy; never use two yellow buttons side by side
- Use Hedvig Letters Serif exclusively for headings ≥22px and Inter for everything below; never use Inter for headings or Hedvig for body copy
- Set body text to #130e30 (not pure black) for warmth; reserve #000000 for the logo mark, input borders, and high-contrast fine details
- Build the surface stack as Canvas #f9fbf2 → Soft Meadow #eff2e5 cards; the slight green tint is intentional and should be preserved
- Use the decorative organic blobs (green #59e25d, fuchsia #e261e5, yellow #ffe228, violet #130e30) only as background atmosphere behind hero/product visuals — never as UI fills or icon colors
- Tighten letter-spacing to -0.01em on all headings and -0.02em on small caps labels for the warm, literary headline feel

### Don't
- Do not use sharp corners (<16px) on buttons, inputs, or nav items — the pill is non-negotiable
- Do not introduce additional accent colors into the UI; green, pink, and fuchsia are decoration-only and must not appear in buttons, badges, or status indicators
- Do not use pure white #ffffff for card surfaces when Soft Meadow #eff2e5 is the designated card layer
- Do not place two primary yellow CTAs in the same viewport; alternate with the dark pill for hierarchy
- Do not use Inter for display headlines or Hedvig Letters Serif for UI labels — the font-role boundary is strict
- Do not add drop shadows to cards or buttons; surface differentiation comes from the green-tinted #eff2e5 layer, not elevation
- Do not use the nav Slate #5f5c6 for primary body text — it is reserved for muted copy and helper text only

## Surfaces

- **Canvas** (`#f9fbf2`) — Page background, outermost layer
- **Soft Meadow** (`#eff2e5`) — Card surface, nav bar, hero backdrop, elevated panels
- **Hi-Yellow Accent** (`#ffe228`) — Primary action surface — CTA buttons and highlight pills
- **Deep Ink** (`#130e30`) — Dark mode/contrast surface — not used as full page but available for dark sections or inverted components

## Imagery

Product UI screenshots are the primary visual asset — shown inside a white card floating above organic colored blob shapes in green, fuchsia, yellow, and violet. The blobs are flat, irregular, and overlapping, creating a garden-meadow feel that softens the compliance/B2B context. Photography appears in section dividers (urban outdoor scenes with trees and architecture, high-saturation). Customer logos are monochrome in a horizontal trust strip. Iconography is minimal and line-style, not colorful. No 3D renders or illustrations of people — the visual identity is abstract, organic, and product-forward.

## Layout

Max-width 1200px centered container with generous side padding. Hero is a two-column split: left column holds the headline, subtext, email input with CTA, and Trustpilot badge; right column holds the product mockup card with organic blob backdrop. Below the hero, a customer logo trust strip sits on Soft Meadow. Sections alternate between white canvas and Soft Meadow bands, separated by 48-80px vertical gaps. Feature grids use 3 equal columns. Testimonials are a horizontal carousel with 3 cards visible. Navigation is a simple top bar, not sticky. The layout breathes — no information-dense blocks, every section has whitespace margins.

## Similar Brands

- **Sweep (sweep.net)** — Same warm cream canvas, organic decorative blob shapes behind product UI, serif headline + sans body pairing, and pill-shaped yellow/dark CTA pair
- **Watershed (watershed.com)** — Sustainability/compliance domain with light surfaces, soft organic accents, and a single bright highlight color for CTAs
- **Klim (klim.co)** — CSR-adjacent SaaS with cream backgrounds, serif display type, pill buttons, and nature-inspired decorative elements
- **Notion** — Light off-white canvas, Inter for body type, pill-shaped buttons, and minimal card elevation — shares the approachable, not-corporate base layer
