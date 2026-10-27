# Depot — Style Reference
> Dark server-rack terminal. A near-black developer console where one green LED signals action and the rest of the UI whispers in graphite.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Depot uses a developer-console language: a near-black canvas, hairline green-tinted borders, and a single vivid green accent that lights up the only button on the page. The interface feels like a terminal that grew up into a marketing site — compact, monospace-adjacent, and confident in its restraint. Typography splits into three Red Hat families: Display for tight tracked-out headlines, Text for slightly letter-spaced body copy, and Mono for code and terminal-style labels, creating a tri-tonal typographic system. Surfaces stack in barely-perceptible lifts of near-black, separated by thin 1px hairline borders with subtle green ambient glows — no drop shadows, just inset top highlights. Color appears sparingly: green for actions and status, blue for inline links, and a soft violet for secondary decorative accents. The whole system reads as 'infrastructure you can trust' rather than 'consumer app you enjoy'.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Green | `#71d083` | Green supporting accent for decorative details and low-frequency emphasis |
| LED Green | `#366740` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Moss Border | `#2d5736` | Subtle green-tinted border accent for highlighted cards and notification states — keeps the green theme at low intensity |
| Forest Wash | `#1d3a24` | Tinted card background for highlighted/featured panels — dark green surface that sets apart spotlighted content |
| Fern Ground | `#1b2a1e` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Link Blue | `#70b8ff` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Lilac Accent | `#baa7ff` | Decorative icon accent and secondary highlight — soft violet for visual variety in feature icons and subtle UI flourishes |
| Plum Edge | `#291f43` | Muted violet border tint for tag/label outlines — secondary border color for grouped metadata |
| Iris Border | `#473876` | Mid-violet link and body accent — used for inline code links and grouped label borders |
| Lavender Mist | `#e2ddfe` | Pale lavender text accent for highlighted inline labels and decorative typography touches |
| Carbon | `#04040b` | Page canvas — the base near-black that everything sits on |
| Graphite | `#121113` | First surface lift — card backgrounds, nav header surface, elevated panels |
| Obsidian | `#1a191b` | Second surface lift — nested cards, secondary panels, footer surface |
| Slate | `#232225` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Basalt | `#2b292d` | Borders and dividers — the primary hairline color separating surfaces and defining card edges |
| Iron | `#323035` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Pewter | `#3c393f` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Steel | `#49474e` | Mid-gray borders and muted icon strokes — subtle structural lines |
| Fog | `#7c7a85` | Muted body text, footer text, nav inactive items, secondary copy |
| Silver | `#b5b2bc` | Secondary text, placeholder text, button text on dark fills, icon outlines |
| Ash | `#eeeef0` | Primary body text — high-contrast off-white for reading copy |
| Chalk | `#e5e5e5` | Headings and primary headings — the brightest text for display type |

## Typography

### Red Hat Display Variable — Display and heading type — used at 48-60px for hero headlines with weight 700, at 36px for section headings with weight 600. The negative tracking at display sizes (-0.025em) tightens the letterforms for a compressed, industrial look. Weight drops to 400-500 for subheadings and feature card titles. Substitute: Inter, Space Grotesk
- **Substitute:** Inter, Space Grotesk
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14, 16, 18, 20, 36, 48, 60
- **Line height:** 1.00, 1.11, 1.38, 1.40, 1.50
- **Letter spacing:** -0.0250em at display sizes (36-60px), 0 at body sizes

### Red Hat Text Variable — Body and UI text — the workhorse family for paragraphs, nav items, button labels, and all functional text. The positive tracking (0.025em) at all sizes is a signature choice: body copy breathes with slightly loosened letterspacing, which gives the dense dark UI an airy, readable quality. Weight 500-600 for emphasis, 400 for default body. Substitute: Inter, IBM Plex Sans
- **Substitute:** Inter, IBM Plex Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10, 12, 14, 15, 16, 18, 20
- **Line height:** 1.00, 1.33, 1.40, 1.43, 1.50, 1.56, 1.63
- **Letter spacing:** 0.0250em across all sizes

### Red Hat Mono Variable — Code snippets, terminal-style labels, build status indicators — the monospace voice for developer-context content. Appears in the CI workflow comparison section for job names like 'Job picked up', 'Install dependencies'. Substitute: JetBrains Mono, IBM Plex Mono
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 14, 18
- **Line height:** 1.43, 1.56
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.025px |
| body-sm | — | — | 14px | 1.43 | 0.025px |
| body | — | — | 16px | 1.5 | 0.025px |
| subheading | — | — | 18px | 1.56 | 0.025px |
| heading-sm | — | — | 20px | 1.4 | 0.025px |
| heading | — | — | 36px | 1.11 | -0.9px |
| heading-lg | — | — | 48px | 1.11 | -1.2px |
| display | — | — | 60px | 1 | -1.5px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 2px
- **tags:** 2px
- **cards:** 6px
- **icons:** 2px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Primary CTA Button
**Role:** The only filled button on the page — drives sign-up and trial starts

Filled with Signal Green (#71d083), border in LED Green (#366740) at 1px, text in Carbon (#04040b) weight 500, 6px radius, 10px 20px padding. Small font size (14px) with 0.025em tracking from Red Hat Text. The dark text on bright green creates maximum contrast — the button glows against the dark canvas.

### Ghost/Outline Button
**Role:** Secondary action — 'Talk to a human', alternative paths

Transparent background, 1px border in Basalt (#2b292d), text in Ash (#eeeef0) weight 500, 6px radius, 10px 20px padding. On hover the border lightens to Pewter (#3c393f). Same size and typography as the primary button so they pair evenly.

### Navigation Button (Inactive)
**Role:** Sign in and utility nav buttons in the header

Subtle dark fill in Obsidian (#1a191b), 1px border in Basalt (#2b292d), text in Ash (#eeeef0) at 14px weight 500, 6px radius, 8px 16px padding. Barely visible — designed to recede so the CTA 'Get started' dominates.

### Top Notification Banner
**Role:** Site-wide announcement bar (e.g. new product launches)

Full-bleed strip in Carbon (#04040b) with a 1px bottom border in Moss Border (#2d5736). Text at 13-14px in Ash with a sparkle emoji prefix. Links within are in Link Blue (#70b8ff). Height ~40px, centered content.

### Feature Card
**Role:** Product capability cards (Depot CI, Container Builds, GitHub Actions)

Background in Graphite (#121113), 1px border in Basalt (#2b292d), 6px radius, 24px padding. Top label in uppercase caption text (12px, letter-spacing 0.025em, weight 500) in Signal Green for the active/featured card or Fog gray for secondary. Title in Chalk at 18-20px weight 600. Content body in Silver at 14-15px. The active card may have a Moss Border (#2d5736) outline instead of Basalt.

### CI Workflow Comparison Panel
**Role:** Side-by-side build log comparison (GitHub Actions vs Depot CI)

Dark container in Graphite (#121113) with 1px border in Basalt, 6px radius. Header bar in Obsidian with a section label in Red Hat Mono 14px. Each workflow column separated by a 1px hairline in Iron (#323035). Job rows use Red Hat Mono for job names, Silver for status text, and Signal Green or Fog for status indicators (pending/success).

### Customer Logo Grid
**Role:** Social proof — company logos in a 5-column grid

Logos rendered in Chalk (#e5e5e5) or Silver (#b5b2bc) against the Carbon canvas, each in a grid cell of roughly equal width. Cell separators are 1px hairlines in Basalt (#2b292d) or transparent. Logos sit at their natural proportions, vertically centered. No card containers — the grid is flat.

### Section Header
**Role:** Slogan headlines and section titles

Display type in Red Hat Display weight 700, sizes 48-60px, letter-spacing -0.025em (-1.2px to -1.5px), line-height 1.0-1.11. Text in Chalk (#e5e5e5). No eyebrow text or subtitle decoration — the headline stands alone with maximum impact.

### Inline Link
**Role:** Text links within paragraphs and feature descriptions

Link Blue (#70b8ff) text at body size (16px), weight 400-500, no underline by default. May include a subtle arrow character (→). Within code/mono contexts, appears in Iris Border (#473876) or Lilac Accent (#baa7ff).

### Tag/Label
**Role:** Category labels, status badges, metadata pills

Small uppercase text in Red Hat Text 12px weight 500, letter-spacing 0.025em. Background in Fern Ground (#1b2a1e) or transparent, 1px border in Moss Border (#2d5736) or Plum Edge (#291f43), 2px radius, 4px 8px padding. Text in Signal Green or Lavender Mist depending on tag type.

### Nav Menu Item
**Role:** Primary navigation links in the header

Red Hat Text 14px weight 500 in Ash (#eeeef0), no background by default. Active/hover state may show a subtle dropdown indicator (chevron). Dropdown menus appear as dark panels in Graphite with Basalt borders, 6px radius.

### Status Indicator
**Role:** Build status dots and system state indicators

Small 6-8px circles in Signal Green (#71d083) for success/active, Fog (#7c7a85) for pending, or muted red for error states. Used inline with Red Hat Mono text in the CI workflow panel.

## Do's and Don'ts

### Do
- Use Signal Green (#71d083) exclusively for the primary CTA — it is the only element that should demand visual attention on any screen
- Maintain the tri-typographic system: Red Hat Display for headlines, Red Hat Text for body, Red Hat Mono for code/status — never substitute one for another
- Apply -0.025em letter-spacing to all display sizes (36px+) and +0.025em to all body sizes (10-20px) — the tracking contrast defines the typographic personality
- Stack surfaces using the five-level neutral ladder: Carbon (#04040b) → Graphite (#121113) → Obsidian (#1a191b) → Slate (#232225), each 1-2px border in Basalt (#2b292d)
- Use 6px radius for buttons and cards, 2px for tags and nav items — the small radii are a defining geometric choice, not an oversight
- Separate sections with 1px hairline borders in Basalt (#2b292d) rather than spacing alone — the hairlines create the developer-console feel
- Keep shadows off entirely — use the inset white highlight (rgba(255,255,255,0.06) 0px 1px 0px 0px inset) for surface edge definition instead of drop shadows

### Don't
- Never use Signal Green (#71d083) for anything other than the primary CTA fill — dilute it through the green scale (#366740, #2d5736, #1d3a24, #1b2a1e) for secondary uses
- Never apply drop shadows — the design system deliberately relies on hairline borders and surface level changes, not elevation shadows
- Never use large border radii (12px+) — the maximum radius in the system is 6px, and even 10px appears only rarely. Large pill shapes or rounded cards break the identity
- Never mix the letter-spacing direction — body text always has positive tracking (+0.025em) and display text always has negative tracking (-0.025em). Never flatten both to normal
- Never use Link Blue (#70b8ff) for buttons or CTAs — it is reserved for inline reading links only. Action elements must be green or neutral
- Never introduce a new accent color without strong reason — the system is built on green dominance with blue for links and violet for tertiary decoration. Adding a fourth chromatic breaks the 3-color identity
- Never use pure white (#ffffff) for text — always use Chalk (#e5e5e5) or Ash (#eeeef0) for the slight warmth and reduced contrast burn

## Elevation

The design system intentionally avoids drop shadows. Elevation is communicated through three techniques only: (1) a five-level surface stack where each level is 3-8% lighter than the previous, (2) 1px hairline borders in Basalt (#2b292d) defining surface edges, and (3) a single inset top highlight (rgba(255,255,255,0.06) 0px 1px 0px 0px inset) on select elements to suggest a light source from above. This creates the feel of a flat dark terminal rather than a skeuomorphic card system.

## Surfaces

- **Carbon Canvas** (`#04040b`) — Page background — the deepest near-black that all content sits on
- **Graphite Card** (`#121113`) — First elevated surface — feature cards, content panels, nav dropdowns
- **Obsidian Panel** (`#1a191b`) — Secondary surface — nested panels, section dividers, footer surface
- **Slate Interactive** (`#232225`) — Interactive surfaces — button fills, input fields, hover states
- **Fern Ground** (`#1b2a1`) — Tinted highlight surface — featured/active card backgrounds with green identity

## Imagery

Imagery is minimal and product-focused. The site relies on UI screenshots and terminal-style code blocks rather than photography or illustration. The CI workflow comparison panel is the key visual asset — it shows real build log data in a side-by-side format, making the product the hero. Customer logos appear as flat monochrome wordmarks in Chalk/Silver on the dark canvas, arranged in a clean 5-column grid with hairline dividers. No decorative photography, no lifestyle imagery, no 3D renders. Icons are thin-stroke and minimal, using Signal Green, Lilac Accent, or Silver. The overall visual density is text-dominant with product UI screenshots doing the heavy visual lifting.

## Layout

Full-width sections with content constrained to a ~1200px max-width centered container. The hero is left-aligned text with no hero image — the headline 'Build faster. Waste less time.' anchors the left side with CTAs below, letting the product comparison panel sit directly underneath as the visual proof. Section rhythm is defined by generous 64px vertical gaps between major sections, with each section flowing seamlessly into the next on the same Carbon canvas (no alternating dark/light bands). Feature cards appear in a 3-column grid for the capability highlights, then the CI workflow panel spans full width for the product demo. The customer logo section uses a flat 5-column grid with vertical and horizontal hairline dividers creating individual cells. Navigation is a sticky top bar with the logo left, menu center, and auth buttons right. The overall density is comfortable — sections breathe, but the dark surface and tight radii prevent it from feeling sparse.

## Similar Brands

- **Vercel** — Same near-black canvas with hairline border separation, single accent color driving CTAs, and developer-focused minimalism with generous section spacing
- **Linear** — Dark-mode developer product UI with precise small radii (4-8px), a vivid single-color accent system, and ultra-precise hairline borders replacing shadows
- **Railway** — Infrastructure-tool aesthetic with dark surface stack, green/terminal-inspired accent color, and monospace text in feature comparisons
- **PlanetScale** — Dark developer-database marketing with restrained single-accent approach, left-aligned hero without imagery, and terminal-style product screenshots as social proof
- **Fly.io** — Dark-mode infrastructure branding with monospace UI elements, flat logo grid for customers, and developer-console visual language
