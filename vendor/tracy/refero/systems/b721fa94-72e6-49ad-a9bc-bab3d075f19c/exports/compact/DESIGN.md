# Oxide Computer Company — Style Reference
> Datacenter rack at midnight with one green LED lit

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Oxide uses a terminal-grade infrastructure language: near-black canvas, razor-thin 1px hairlines, monospace labels that read like CLI output, and a single vivid green that behaves like an LED status indicator rather than a marketing accent. The site treats its own interface the way it treats its racks — exposed, functional, and free of decoration. Everything technical (tabs, badges, nav items, code, system labels) renders in GT America Mono at small sizes with wide tracking; everything human (headlines, body, marketing copy) uses SuisseIntl at comfortable sizes with tight tracking. Color is rationed: green only signals active/initialized/selected states, while magenta-tinted status lines (like 'STATUS ERROR') hint at secondary diagnostics. Surfaces are nearly flat — inset 1px strokes instead of drop shadows, no rounded corners on structural elements, and a surface stack that moves from true black through charcoal to deep teal rather than the usual gray ramp.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#0b0e12` | Page canvas, deepest background layer — absorbs everything below the fold |
| Carbon | `#181a1d` | Card surfaces, terminal mockup backgrounds, badge fill |
| Graphite | `#1f2124` | Elevated surface, nested panel backgrounds, subtle border against carbon |
| Slate Base | `#303235` | Dominant neutral — body text borders, hairlines, icon strokes, grid line color (appears 5,900+ times as borderColor) |
| Fog | `#5d5e61` | Muted body text, secondary labels, disabled helper text |
| Steel | `#818284` | Tertiary text, icon outlines, inactive nav items |
| Ash | `#a3a4a5` | Secondary text, link text at rest, footer copy |
| Silver | `#bababb` | Primary UI text, nav items, body copy at default weight |
| Bone | `#dedede` | Headline color, high-emphasis text, display copy — the lightest ink in the system |
| Phosphor Green | `#00d892` | Green accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Deep Teal | `#002923` | Filled CTA background, button fill, badge background — the only chromatic fill in the interface, reserved for primary action surfaces |
| Emerald Depth | `#005441` | Hover/active state for deep teal surfaces, decorative green wash in body copy contexts, large-area green-tinted backgrounds |
| Diagnostic Magenta | `#9f3f53` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Syntax Violet | `#c58aff` | Violet text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Syntax Coral | `#ff6285` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Syntax Forest | `#006d4a` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |

## Typography

### SuisseIntl — Primary interface typeface — body copy, headlines, nav items, hero text, footer. Weight 400 is the only weight used, which forces typographic hierarchy to come from size and tracking rather than bold weight. Display sizes (50–65px) use negative tracking (-0.005em to -0.003em) to tighten the headlines; small sizes (11–12px) use positive tracking (0.044–0.053em) to open up labels.
- **Substitute:** Inter, Helvetica Neue, system-ui
- **Weights:** 400
- **Sizes:** 11, 12, 14, 16, 18, 20, 25, 36, 50, 65
- **Line height:** 1.10, 1.17, 1.28, 1.29, 1.30, 1.33, 1.35, 1.38
- **Letter spacing:** -0.005em at 65px, -0.003em at 50px, 0.044em at 11px, 0.053em at 12px
- **OpenType features:** `"calt" 0, "ss02", "ss03", "ss06", "ss07", "ss08", "ss09"`

### GT America Mono — Technical labels, tab names (CLI, API, CONSOLE), badge text, button labels, nav annotations, code blocks, metadata. Wide positive tracking (0.014–0.064em) at all sizes gives the typeface a 'system readout' quality. The 'calt' 0 setting deliberately disables contextual alternates so the monospace grid stays rigid — this is mono as system chrome, not mono as code.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Roboto Mono
- **Weights:** 400
- **Sizes:** 10, 11, 12, 13, 20
- **Line height:** 1.00, 1.20, 1.25, 1.30, 1.33, 1.40, 1.45, 1.60
- **Letter spacing:** 0.014em at 20px, 0.053em at 12px, 0.058em at 11px, 0.064em at 10px
- **OpenType features:** `"calt" 0, "ss02", "ss03", "ss06", "ss07", "ss08", "ss09"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.6 | 0.64px |
| body | — | — | 14px | 1.38 | 0px |
| subheading | — | — | 20px | 1.3 | 0.28px |
| heading-sm | — | — | 25px | 1.28 | 0.5px |
| heading | — | — | 36px | 1.17 | 0px |
| display | — | — | 65px | 1.1 | -0.33px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 12px

### Border Radius

- **nav:** 1px
- **cards:** 1px
- **badges:** 1px
- **inputs:** 1px
- **buttons:** 1px

## Components

### Filled Primary Button
**Role:** Primary action — the only filled chromatic button in the system

Background #002923 (Deep Teal), text in Phosphor Green (#00d892) at 12px GT America Mono, weight 400, letter-spacing 0.053em. Padding 6px 12px. Border 1px solid #002923. Radius 1px. No shadow. This button reads as a status indicator that happens to be clickable, not a marketing CTA.

### Outlined Ghost Button
**Role:** Secondary action — used for 'TRY NOW' in the nav

Transparent background, 1px border in Silver (#bababb) or Ash (#a3a4a5), text in matching color at 12px GT America Mono, tracking 0.053em. Padding 6px 12px. Radius 1px. On hover, border and text shift to Bone (#dedede).

### Text Link Button
**Role:** Tertiary action or inline link

No background, no border. Text in Ash (#a3a4a5) at 14px SuisseIntl, no underline. On hover, text shifts to Bone (#dedede). Used for navigation-level CTAs and inline references.

### Terminal Mockup Panel
**Role:** Product capability demo — shows the CLI/API experience

Background #181a1d (Carbon). 1px border in Slate (#303235). Internal tab bar with monospace labels (CLI, API, CONSOLE) in 12px GT America Mono, tracking 0.053em. Active tab has Phosphor Green (#00d892) text with a 1px green underline. Body contains monospace code lines in 13px GT America Mono with syntax coloring (green prompts, violet keys, coral values, green-300 comments). Radius 1px. No shadow — relies on border and background contrast.

### Status Badge
**Role:** System state indicator — 'INITIALIZED', 'POWERING THE BEST TEAMS'

Background Carbon (#181a1d) with a 1px inset stroke in Phosphor Green (#00d892) at 15% opacity. Text in Phosphor Green at 10–11px GT America Mono, tracking 0.064em, uppercase. Padding 1–2px vertical, 6–12px horizontal. Radius 1px. The inset green ring is the badge's signature — it looks like an LED housing, not a pill.

### Navigation Link
**Role:** Top-nav items (PRODUCT, SOLUTIONS, RESOURCES, COMPANY, PODCASTS, BLOG)

12px GT America Mono, weight 400, tracking 0.053em, uppercase. Color Silver (#bababb) at rest, Bone (#dedede) on hover. Chevron indicators in matching color. No background, no border, no underline. Items sit on the dark canvas with 20–24px horizontal spacing.

### Comparison Grid Diagram
**Role:** Side-by-side comparison block (Traditional on-prem vs Public cloud)

Two equal-width panels separated by a 1px Slate (#303235) vertical divider. Each panel uses dashed 1px Slate borders to form a technical floorplan-style grid. Accent lines in Phosphor Green (#00d892) and Diagnostic Magenta (#9f3f53) trace paths through the grid. The magenta path terminates in a 'STATUS ERROR 0x42B-0W' label in monospace. Below each diagram, a bullet list in 14px SuisseIntl with bold-400 lead-ins (the 400 weight reads as emphasis here).

### Hero Headline
**Role:** Primary page headline

SuisseIntl weight 400 at 50–65px, color Bone (#dedede), line-height 1.10, letter-spacing -0.005em to -0.003em. No bold, no italic — size and tight tracking do the work. Sits in the lower-left third of the hero, leaving the right side for the product render.

### Product Render Frame
**Role:** Server rack / data center photography placement

Full-bleed or large-aspect photographic composition with no border, no radius, no frame treatment. Green LED indicators on the rack hardware echo the Phosphor Green brand color, making the product photography itself act as brand identity. Caption labels in 10–11px GT America Mono with figure numbers (e.g., 'FIG. 1 OXIDE CLOUD COMPUTER').

### CLI Prompt Card
**Role:** Standalone command-line callout with green action state

Carbon (#181a1d) background. Two-line layout: top line shows 'Rack 6' label in Silver 12px SuisseIntl with 'INITIALIZED' in Phosphor Green GT America Mono at the right. Bottom line is a full-width green button bar (#002923) with 'SIGN IN WITH SSO' in Phosphor Green 12px GT America Mono. Radius 1px. 1px Slate border.

### Section Heading
**Role:** H2-level section opener

SuisseIntl weight 400 at 36px, color Bone (#dedede), line-height 1.17, no letter-spacing adjustment. Left-aligned, max-width ~700px. No decorative element above or beside it — the type is the section marker.

### Footer Link Column
**Role:** Standard footer navigation

SuisseIntl 14px weight 400, color Steel (#818284) for column headers, Ash (#a3a4a5) for links. 12px row gap. No separators, no borders. On a #181a1d background.

### Logo Mark
**Role:** Brand identifier in nav

Wordmark 'oxide' in lowercase, 20px SuisseIntl weight 400 with a custom '@' character replaced by a green glyph or the 'o' rendered in Phosphor Green (#00d892). The rest of the wordmark is Bone (#dedede) or Silver. No tagline, no container.

### Customer Logo Strip
**Role:** Social proof — 'POWERING THE BEST TEAMS'

Single-row horizontal strip of partner logos in grayscale (rendered in Fog #5d5e61 or Steel #818284 on dark canvas). Logos separated by generous whitespace (40–60px gaps), no dividers. Label above strip in 10–11px GT America Mono, tracking 0.064em, uppercase, color Steel.

## Do's and Don'ts

### Do
- Use #002923 (Deep Teal) as the only filled button background; pair it with #00d892 (Phosphor Green) text in GT America Mono 12px
- Set border-radius to 1px on all buttons, badges, inputs, cards, and nav items — never use 4px or higher on structural elements
- Use GT America Mono 10–12px with tracking 0.053–0.064em for every technical label, tab, badge, and button
- Step surfaces by color (Void → Carbon → Graphite) and by 1px Slate borders; never use drop shadows to create elevation
- Use the surface stack #0b0e12 → #181a1d → #1f2124 in that order for base → card → elevated panels
- Set headlines in SuisseIntl 50–65px weight 400 with negative tracking (-0.005em to -0.003em); let size do the work instead of bold weight
- Reserve Phosphor Green (#00d892) for active states, logo, and status indicators — never as a decorative accent or large fill

### Don't
- Do not use border-radius above 1px on buttons, badges, cards, or nav — the sharp edges are signature
- Do not use drop shadows for elevation; the system communicates depth through surface color stepping and 1px inset strokes only
- Do not apply bold (600+) or semibold weight — Oxide runs entirely on weight 400 across both typefaces
- Do not use Phosphor Green (#00d892) as a background fill, page section background, or large decorative area
- Do not use diagnostic magenta (#9f3f53) for user-facing alerts, form errors, or destructive action buttons — it is a terminal-readout color, not an error UI color
- Do not center body text or stack headlines in centered compositions — Oxide reads left-aligned with a generous left margin
- Do not use rounded photographic treatments, blur effects, or gradient overlays on product renders — hardware photography is presented raw with no border or radius

## Elevation

- **Status Badge:** `inset 0 0 0 1px oklab(0.77 -0.184 0.054 / 0.15)`
- **Status Badge (neutral variant):** `inset 0 0 0 1px oklab(0.79 -0.0002 -0.001 / 0.15)`

## Surfaces

- **Void** (`#0b0e12`) — Page canvas — the deepest background, used for full-bleed sections
- **Carbon** (`#181a1d`) — Card surfaces, terminal mockup panels, badge fills
- **Graphite** (`#1f2124`) — Nested panels, elevated content blocks, link backgrounds
- **Slate** (`#303235`) — Hairline border color, structural dividers, the dominant neutral

## Imagery

Imagery is minimal and product-focused. The dominant visual is large-format photography of Oxide's rack-scale hardware in data center environments, shot in high-contrast near-monochrome with green LED accents that echo the brand color. The hardware IS the hero — no lifestyle context, no people, no abstraction. Secondary imagery includes screen captures of the Oxide UI (terminal mockups, dashboard panels) that look like real product screenshots rather than marketing renders. The comparison section uses technical line-art diagrams (dashed grids with traced paths) rather than photography. There is no decorative illustration layer, no abstract gradient backgrounds, and no icon set beyond a small set of monoline chevrons and arrows. The radial gradient detected in the data (oklch 0.483 → oklch 0.247) is used only as a subtle vignette behind hero compositions, not as a graphic element.

## Layout

Page is full-bleed with a 1200px content max-width centered on the dark canvas. The hero is asymmetric: a 5/12-width terminal mockup in the top-left, a 7/12-width product render filling the right side, and the headline anchored to the lower-left quadrant. This split is maintained as a recurring motif. Below the hero, sections use a consistent rhythm: full-width dark band, centered 1200px content, 80px vertical padding between bands. The comparison section breaks the single-column flow into a 2-column grid with a 1px vertical divider down the center. Lists and feature blocks are left-aligned with generous left margin rather than centered. Navigation is a minimal top bar — logo left, 5 nav items center, 2 CTAs right — with no sticky behavior and no background fill (it sits on the page canvas directly). There is no sidebar, no mega-menu, and no breadcrumb. Density is comfortable: large blocks of negative space between sections, single-column body text at a readable measure (~660px), and no information-dense table layouts.

## Similar Brands

- **Fly.io** — Same dark canvas with a single vivid accent color (Fly uses purple, Oxide uses green) and terminal-grade monospace UI labels for nav and tabs
- **Tailscale** — Dark-mode infrastructure product with sharp 1px borders, monochrome body text, and a single accent color used sparingly for active states
- **Cloudflare** — Same aesthetic of technical diagrams, dashed-line comparisons, and a palette that treats orange/cloud-color as a system status signal rather than decoration
- **Equinix** — Data center / infrastructure brand that uses raw hardware photography as the primary visual identity, with dark UI and green status indicators echoing LED racks
