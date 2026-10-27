# Sleeve — Style Reference
> floating dock on marble

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sleeve's site reads like a macOS product page composed in a gallery: an infinite white canvas, a single hero product shot floating with app-icon satellites orbiting it, and typography that does all the work. The palette is nearly monochrome — black, white, and a hairline gray border are the only structural colors — while the only chromatic energy comes from the app's own blue gradient and a small set of colorful system icons used as decorative punctuation. Headlines are massive and tight-tracked (96px display at -0.025em letter-spacing, 48px section headings), body text is system-sans at 15-18px, and micro-labels like 'THEMING' and 'FEATURE LIST' use 0.05em tracking to whisper rather than shout. Components are soft and chunky: 24px card radii, 9999px pill buttons, inset 1px borders at 0.05 opacity instead of heavy shadows. The design language is confidence through restraint — no gradients on UI, no color on buttons, just typographic weight and generous breathing room carrying every screen.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Graphite | `#333333` | Secondary text, icon fills, button text — softer than pure black for body emphasis without losing weight |
| Slate | `#374151` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Silver Mist | `#e5e7eb` | Hairline borders, subtle dividers, light surface washes — the most-used color in the system, defines edges at 0.05 opacity equivalent |
| Ash | `#cccccc` | Shadow base, disabled borders, inset 1px borders on cards — deeper than Silver Mist for visible but quiet structure |
| Smoke | `#999999` | Muted helper text, shadow mid-tones, secondary icon fills — visible but recedes |
| Pure White | `#ffffff` | Page canvas, card surfaces, text on dark buttons — the dominant background tone |
| Paper White | `#f9fafb` | Subtle surface tier, announcement pill background, secondary card surface — barely warmer than pure white to suggest elevation without shadow |
| Ocean Drift | `linear-gradient(to right top, #0e95ee, #27c9f5)` | Brand accent — section labels (THEMING, FEATURE LIST), gradient anchor for the app showcase gradient; Decorative gradient used in the product showcase and as accent wash — linear-gradient(to right top, #0e95ee, #27c9f5) |
| Cyan Splash | `linear-gradient(to right bottom, rgba(150,255,238,0.1), rgba(24,192,233,0.1))` | Brand accent — gradient terminal for the app showcase gradient, decorative wash; Subtle background gradient wash — linear-gradient(to right bottom, rgba(150,255,238,0.1), rgba(24,192,233,0.1)) |

## Typography

### ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Inter' — All UI and display text — system sans-serif at weight 400 for body, 500-600 for emphasis, 700 for section headings, 900 for the 'Sleeve 3' display. The 96px display at lineHeight 1.00 with -0.025em tracking is the signature: massive weight-900 type compressed tight, creating a dense, confident hero mark rather than airy editorial.
- **Substitute:** Inter, Helvetica Neue, system-ui
- **Weights:** 400, 500, 600, 700, 900
- **Sizes:** 12, 13, 14, 15, 16, 18, 20, 24, 48, 96
- **Line height:** 1.00, 1.33, 1.40, 1.43, 1.50, 1.56
- **Letter spacing:** -0.025em for display/heading-lg (tightens large type for density), 0.05em for micro-labels (widens small uppercase tracking for legibility)
- **OpenType features:** `'ss01' on, 'cv11' on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 16 | 0.6px |
| body-sm | — | — | 14px | 22 | 0px |
| body | — | — | 16px | 24 | 0px |
| subheading | — | — | 18px | 26 | 0px |
| heading-sm | — | — | 20px | 28 | 0px |
| heading | — | — | 24px | 32 | 0px |
| heading-lg | — | — | 48px | 52 | -1.2px |
| display | — | — | 96px | 96 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 36px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 24px
- **pills:** 9999px
- **small:** 8px
- **inputs:** 12px
- **buttons:** 12px

## Components

### Primary Filled CTA Button
**Role:** Download/purchase action — the Mac App Store button on the hero

Black fill (#000000), white text, weight 500-600, 12px radius, 12px 24px padding, with an Apple logo glyph in white. Height ~48px. No shadow; relies on the absolute black against white for prominence.

### Outlined CTA Button
**Role:** Secondary purchase action — 'Buy Directly' button

Transparent fill, 1px solid #e5e7eb border, #000 text, 12px radius, 12px 24px padding. Includes an inline price badge nested inside the button. Weight 500.

### Inline Price Badge
**Role:** Price tag nested inside the outlined CTA

Small pill with #000 fill, white text, 9999px radius, ~8px 12px padding, weight 600. Text ~13px. Sits flush inside the outlined button to create a single composite CTA.

### Announcement Pill
**Role:** Sticky update notice — 'Sleeve 3 has arrived — refreshed for macOS Tahoe'

Full-width pill, #f9fafb fill, 1px solid #e5e7eb border, 9999px radius, ~10px 20px padding. Contains a small blue icon, body-sm text, and a circular dismiss arrow on the right.

### Section Label (Eyebrow)
**Role:** Small uppercase category label above section headings — 'THEMING', 'FEATURE LIST'

12-13px, weight 600, uppercase, 0.05em letter-spacing, color #0e95ee (Ocean Drift blue). Centered. Creates a quiet typographic punctuation before each major section.

### Section Heading
**Role:** Major section title — 'The ultimate music accessory for your Mac', 'Themes to match your style', 'A catalogue of hits'

48px, weight 700, line-height ~1.08, letter-spacing -1.2px, color #000000. Centered. Tight tracking on 48px creates density that weight 700 amplifies.

### Feature Card
**Role:** Content card in the feature grid — text + screenshot + accent icon

#ffffff fill, 1px solid #e5e7eb border, 24px radius, 36px padding on all sides. No shadow or minimal shadow. Contains a heading (20-24px weight 700), body paragraph, and a small colorful icon or screenshot. Cards alternate between text-left/visual-right and text-right/visual-left within a 2-column grid.

### Settings Preview Card
**Role:** Embedded screenshot of the app's settings panel inside a feature card

Sub-card with #f9fafb fill, 16px radius, 12px padding. Shows a settings sidebar with colored icon tiles (themes, layout, artwork, interface, track info) and a content area with size toggles (S, M, L, XL). Toggles are pill-shaped with a selected blue state.

### Size Toggle Button
**Role:** Setting size selector (S/M/L/XL) in the settings preview

Row of pill buttons, 9999px radius, each ~40x40px. Unselected: transparent with #e5e7eb border, gray text. Selected: #0e95ee fill, white text. The blue selected state is the only chromatic interactive element in the system.

### Floating App Icon
**Role:** Decorative 3D app icon orbiting the product showcase — YouTube, settings, paint, play controls

60-80px square, 16-20px radius, rendered with a gradient fill matching the source app (YouTube red-pink, settings gray, paint teal). Slight drop shadow for depth. Rotated at various angles (-15°, +20°) for organic floating composition.

### Product Showcase Window
**Role:** Hero centerpiece — the Sleeve app window mockup

Large rounded rectangle, 24px radius, containing a blue gradient background (#0e95ee → #27c9f5 diagonal). Shows the app's now-playing card with album art, track title, and artist. Window chrome at top shows traffic lights, app name, and date. Sits at center with floating app icons orbiting around it.

### Navigation Bar
**Role:** Top-level site navigation

Transparent fill, no border. Left: 'REPLAY' wordmark in weight 700, #0e95ee. Center: theme switcher pills (Sleeve, Umbra, Echo) with small colored dot icons. Right: text links 'Updates', 'Help' and a social X icon. Height ~64px, floats over the hero without background.

### Theme Switcher Pill
**Role:** Theme selector in the nav — Sleeve / Umbra / Echo

Small pill with #f9fafb fill, 1px solid #e5e7eb border, 9999px radius, 8px 16px padding. Contains a small colored status dot and 14px label text. Active state has a subtle blue dot.

### Display Heading
**Role:** The 'Sleeve 3' hero heading — the most extreme type in the system

96px, weight 900, line-height 1.00, letter-spacing -2.4px, color #000000. This is the only place weight 900 appears. The ultra-tight tracking and compressed line-height at 96px makes the text feel like a solid block rather than a line of text — a brand mark, not a headline.

## Do's and Don'ts

### Do
- Use 24px border-radius on all cards, images, and product showcases — this is the dominant shape language
- Use 9999px (pill) radius for all buttons, tags, toggles, and announcement bars
- Use weight 900 at 96px with -2.4px letter-spacing for the single display heading per page — never for body or section titles
- Use #000000 for the single primary CTA per page and outlined #e5e7eb border for secondary CTAs — no colored buttons
- Use the blue gradient (linear-gradient to right top, #0e95ee, #27c9f5) only for the product showcase and decorative washes — never for UI controls
- Use 0.05em letter-spacing on all small uppercase labels (12-13px) for a quiet, wide-tracked eyebrow above section headings
- Use 36px padding inside feature cards and 16px gap between grid columns

### Don't
- Don't use colored CTA buttons — the only button colors are #000000 (filled) and transparent with #e5e7eb border (outlined)
- Don't use heavy drop shadows — prefer 1px inset borders at 0.05 opacity or the 4-layer card shadow stack for elevation
- Don't use weight 900 for body text or section headings — reserve it exclusively for the 96px display heading
- Don't use letter-spacing -0.025em on text below 32px — the tight tracking only works at display sizes
- Don't use the blue accent color on text below 14px — it only appears on 12-13px uppercase section labels
- Don't use border-radius below 8px on visible elements — the system rounds everything aggressively
- Don't add background colors to navigation or section backgrounds — the page should feel like content floating on infinite white

## Elevation

- **Feature Card (elevated):** `rgba(0, 0, 0, 0.1) 0px 0px 0px 1px, rgba(0, 0, 0, 0.4) 0px 12px 24px -8px, rgba(0, 0, 0, 0.2) 0px 8px 24px 0px, rgba(0, 0, 0, 0.2) 0px 2px 4px 0px`
- **Standard Card:** `rgba(0, 0, 0, 0.05) 0px 0px 0px 1px inset`
- **Floating App Icon:** `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px`
- **Button (subtle):** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

## Surfaces

- **Canvas** (`#ffffff`) — Page background — the infinite white that the entire site floats on
- **Card Surface** (`#ffffff`) — Feature card and component backgrounds — same as canvas, defined by border not fill
- **Subtle Surface** (`#f9fafb`) — Announcement pills, nested sub-cards, inactive toggle backgrounds — barely warmer than white
- **Border Tier** (`#e5e7eb`) — Hairline borders on cards, buttons, dividers — the primary structural line color
- **Deep Border** (`#cccccc`) — Shadow base, inset borders on elevated cards, disabled states

## Imagery

The visual language is built on three layers: (1) a large hero product showcase — a rounded rectangle representing the Sleeve app window with a blue gradient fill, showing the now-playing card with album art, positioned at center; (2) floating app icons orbiting the product — YouTube (red-pink gradient), settings gear (gray), paint brush (teal), play controls (teal) — rendered as 60-80px rounded squares with gradient fills and soft drop shadows, rotated at organic angles to create depth; (3) embedded screenshots within feature cards showing the app's settings panel with colored sidebar icons and size toggles. The treatment is exclusively macOS-native: the product window has traffic-light controls, the app name in the title bar, and the date/time chrome. No photography, no illustration, no abstract graphics — just the product itself and its UI components repurposed as marketing imagery. The colorful app icons are the only chromatic energy on the page and they function as decorative satellites, not content.

## Layout

The page is a centered, max-width 1200px single-column flow on a pure white canvas. The hero is a full-bleed composition with no container — the product showcase window sits centered with floating app icons scattered around it at organic angles, and the 'Sleeve 3' display heading sits below at 96px centered. All subsequent sections follow the same centered max-width pattern: a small blue eyebrow label, a 48px centered heading, centered body paragraph, then a 2-column feature grid with 24px-gap cards. The feature grid alternates between asymmetric text-left/visual-right and text-right/visual-left cards, creating a zigzag reading rhythm. Navigation is a minimal transparent top bar with no background fill — it floats over the hero. Section rhythm is generous: ~96px between major sections, with the white canvas doing all the visual separation. There are no dark sections, no alternating bands, no dividers — just white space and 1px #e5e7eb borders on cards.

## Similar Brands

- **Linear** — Same monochrome palette with black text on white, oversized weight-700 section headings, and zero chromatic UI elements — the product itself carries all color
- **Setapp** — Similar macOS product page rhythm: floating product screenshots on infinite white, rounded card grids for features, 24px radii throughout
- **Things 3 (Cultured Code)** — Shares the macOS-native design language with system sans-serif typography, tight-tracked display headings, and minimal-color UI that lets product screenshots dominate
- **Raycast** — Same hero pattern: centered product showcase on white canvas, clean 2-column feature cards, and monochromatic interface with accent color reserved for decorative gradients
- **Apple Product Pages** — Direct lineage: centered max-width layout, oversized display type at 96px+, pill-shaped CTAs, and the 'infinite white gallery' treatment of product imagery
