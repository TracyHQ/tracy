# 21n — Style Reference
> Open atlas under pale daylight — a spacious, light-mode canvas where knowledge tools feel weightless against a single charcoal anchor.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Memotron is a whisper-quiet, light-mode knowledge workspace built on a near-monochrome neutral stack — pure white canvas, cool off-white surfaces, and a single hairline border gray carry the entire visual system. The only filled button variant is charcoal-dark, which makes the single primary action feel weighty and deliberate against an otherwise weightless interface. Two accent hues (vivid green and vivid blue) appear only as functional punctuation — icons, link states, decorative strokes — never as backgrounds or large fills. Typography is humanist (Sen) with a dramatic scale jump to 56px display, giving headlines atlas-scale presence. The system is flat and border-driven: 12.5px surfaces and #e5e7eb hairlines create structure, with zero shadows or gradients.

## Colors

| Name | Value | Role |
|------|-------|------|
| Snow | `#ffffff` | Primary canvas — page backgrounds, card surfaces, button text on dark fills |
| Fog | `#f9f9fb` | First surface layer above canvas — subtle alternating sections, soft elevated cards |
| Mist | `#eff0f6` | Cool card surface — slightly bluer than fog, used for inset panels and secondary cards |
| Silver | `#e5e7eb` | Hairline borders, dividers, and 1px structural lines — the system's primary separator color |
| Charcoal | `#333333` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Graphite | `#545454` | Secondary text, subdued button borders, and metadata — sits between primary text and muted gray |
| Smoke | `#767676` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Ash | `#808080` | Disabled and inactive states — lowest-priority neutral for de-emphasized text and icons |
| Emerald Pulse | `#24b26d` | Green supporting accent for decorative details and low-frequency emphasis |
| Cobalt Signal | `#2c70dd` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |

## Typography

### Sen — Display and body — humanist sans-serif with warm proportions and open apertures, the sole typeface in the system. Weight 400 carries body text, 500–600 for UI controls and subheadings, 700 reserved for the 56px display headline where it provides atlas-scale presence without resorting to a separate display face.
- **Substitute:** Inter, DM Sans, or Source Sans 3
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13px, 15px, 16px, 17px, 19px, 22px, 36px, 44px, 56px
- **Line height:** 1.07 (display) → 2.21 (loose body)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 20 | — |
| body-sm | — | — | 15px | 23 | — |
| body-lg | — | — | 17px | 26 | — |
| subheading | — | — | 19px | 33 | — |
| heading-sm | — | — | 22px | 33 | — |
| heading | — | — | 36px | 54 | — |
| heading-lg | — | — | 44px | 55 | — |
| display | — | — | 56px | 60 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-100px
- **Card padding:** 17-25px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **links:** 6px
- **buttons:** 12px or 9999px (pill)

## Components

### Top Navigation Bar
**Role:** Persistent site navigation

Horizontal bar with logo left, center nav links (Resources dropdown, Pricing, Compare, Extension, Discord), and dark pill button right. Height ~60px, white background, 1px #e5e7eb bottom border. Nav links at 15px Sen 500, #333. Dropdown indicated by chevron icon.

### Charcoal Pill Button
**Role:** Primary navigation action — the system's only filled button variant

Dark filled button, #333333 background, white text, 9999px border-radius (fully pill). 16px Sen 600, 8px 20px padding. Used for the single 'Go to web app' action in the header. No hover shadow — the button's weight comes from the dark fill against the white canvas, not from elevation.

### Ghost Download Button
**Role:** Secondary action with platform hint

Outlined pill button with small Apple icon prefix, text 'Download for Mac' at 15px Sen 500, #333. 1px #545454 border, 9999px radius, transparent background. 10px 20px padding. Sits centered in the hero below the headline.

### Nav Link Item
**Role:** Text-only navigation entry

15px Sen 500, #333, no underline by default. Hover state shifts to Cobalt Signal (#2c70dd). Resources includes a chevron-down icon to indicate dropdown. 17px horizontal spacing between links.

### Hero Headline
**Role:** Page-level display heading

56px Sen 700, #333, line-height 1.07, centered. Dramatic scale jump from 17px body to 56px display creates atlas-scale presence. Single-line or tight two-line treatment.

### Hero Subtitle
**Role:** Supporting description text below headline

19px Sen 400, #545454, centered, line-height 1.75. Sits 17px below the headline. Generous line-height creates breathing room around the dense body copy.

### Product Showcase Frame
**Role:** Multi-device product visual

Centered frame containing three overlapping device mockups (tablet, laptop, phone) on a soft warm cream background (#f9f9fb with wave illustration). No shadow on the frame — the cream canvas creates the separation. 12.5px radius on the cream background. Play button overlay centered on the laptop screen.

### Vertical Side Label
**Role:** Section anchor text on page edges

Rotated 90° text at the far left ('21n') and far right ('Products') of the page. 13px Sen 500, #767676. Acts as a section index rather than navigation — fixed-position or per-section, aligned to the viewport edge.

### Hairline Section Divider
**Role:** Structural separator between content sections

1px solid #e5e7eb line, full width or content-width. No vertical padding on the line itself — sections use 80-100px vertical gap above and below. The divider is invisible in many sections, only appearing where two surfaces of similar brightness need separation.

### Wave Illustration Decoration
**Role:** Atmorphic background graphic

Thin curved line illustrations in soft coral/red and warm gray tones, rendered as overlapping sine-wave patterns. Full-bleed behind the product showcase section, masked by the cream background container. No fill colors — stroke-only at ~1px, 40% opacity.

### Feature Content Card
**Role:** Content container for feature blocks

White or #f9f9fb surface, 12.5px border-radius, 1px #e5e7eb border, 17-25px padding. No shadow. Optional inner content uses 19-22px Sen headings and 16px body. Cards stack in 2- or 3-column grids with 33px gap.

### Availability Caption
**Role:** Small platform-availability note below download CTA

15px Sen 400, #767676, centered. 'Available as web, chrome extension, iOS and macOS apps.' No icon, no link styling — pure muted text.

## Do's and Don'ts

### Do
- Use #333333 (Charcoal) exclusively for the single filled button variant — never introduce a chromatic fill for primary actions
- Set all borders to 1px solid #e5e7eb (Silver) — hairline structure is the system's primary separator
- Use 9999px border-radius for pill buttons and tags, 12px for cards and surfaces, 6px for inline links
- Reserve #24b26d (Emerald Pulse) and #2c70dd (Cobalt Signal) for icons, link states, and small functional accents — never as surface fills or large background blocks
- Follow the type scale strictly: 13/15/16/17/19/22/36/44/56 — the 56px display jump is the system's signature scale gesture
- Use #f9f9fb (Fog) and #eff0f6 (Mist) for surface layering instead of shadows to imply depth
- Keep element gaps at 8px and section gaps at 80-100px to maintain the atlas-scale breathing room

### Don't
- Do not introduce drop shadows, glows, or blur effects — the system is intentionally flat
- Do not use gradients on buttons, cards, or backgrounds — the palette is pure solid color
- Do not call #2c70dd or #24b26d a CTA or primary action color — they are accent hues only
- Do not add a chromatic background fill to any button — Charcoal #333 is the only filled button color
- Do not use letter-spacing adjustments on Sen — the typeface ships with normal tracking across all sizes
- Do not use #545454 (Graphite) for body text — reserve it for secondary metadata and button borders; primary text is always #333
- Do not introduce a second display font — Sen carries from 13px caption to 56px display with no substitution

## Elevation

The system is intentionally shadow-free. Structure comes from hairline #e5e7eb borders, 12.5px surface rounding, and surface-layer contrast (#ffffff → #f9f9fb → #eff0f6) rather than from drop shadows. Depth is implied through cool-tinted off-whites stacking against pure white, not through elevation. This keeps the interface flat, fast, and atlas-like — no visual weight that would compete with the product content.

## Surfaces

- **Snow Canvas** (`#ffffff`) — Base page background — the dominant surface
- **Fog Section** (`#f9f9fb`) — First elevated section band — subtle alternation
- **Mist Card** (`#eff0f6`) — Card and inset panel surface — cool-tinted elevation
- **Silver Border** (`#e5e7eb`) — Structural hairline — the primary separator
- **Charcoal Anchor** (`#333333`) — Dark button and inverse text — the only heavy surface

## Imagery

Product-device mockups (tablet, laptop, phone) are the primary visual — three overlapping screens showing the actual app interface, arranged on a warm cream canvas. The product UI itself is the hero imagery. Supporting graphics are thin stroke-only wave illustrations in soft coral and warm gray, rendered as overlapping sine curves at ~40% opacity. Photography is entirely absent — no lifestyle shots, no stock imagery, no team photos. Icons are mono-weight, small-scale, and appear inline with text rather than as standalone decoration. The visual density is low: large expanses of white space punctuated by the single product showcase frame.

## Layout

Centered max-width container at 1200px, with full-bleed sections inside it. The hero is a centered text stack (headline → subtitle → download button → availability caption) over a subtle cream/wave background. Vertical side labels ('21n' left, 'Products' right) sit at the viewport edges, rotated 90°, acting as section anchors. Sections flow seamlessly with hairline #e5e7eb dividers rather than alternating background bands. The product showcase section uses a centered frame with overlapping device mockups. Navigation is a fixed top bar with logo left, center links, and dark pill button right. Content grids are 2- or 3-column with 33px gaps. Vertical rhythm is generous — 80-100px between sections — giving the interface an open-atlas feel.

## Similar Brands

- **Notion** — Same airy, light-mode knowledge-tool aesthetic with generous whitespace, humanist sans-serif typography, and a near-monochrome palette accented by small functional color
- **Capacities** — Similar light-mode productivity tool with flat surfaces, hairline borders, and a single dark button variant against an otherwise white canvas
- **Reflect** — Same whisper-quiet light-mode notes app with minimal chromatic palette and border-driven structure rather than shadow-based elevation
- **Tana** — Similar airy, structured knowledge tool with humanist sans-serif type and a calm, atlas-like spatial rhythm between content sections
