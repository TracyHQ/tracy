# Tableland — Style Reference
> alpine dusk at the terminal — soft coral peaks rising over a deep green-black void with one mint-green signal light glowing on the horizon.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tableland operates as a dark-mode developer surface punctuated by a single painted moment: a lavender-coral hero landscape that gives way to a calm, infrastructure-feeling interior. Typography is geometric humanist (Poppins) with weight 300 doing the heavy lifting on display copy, giving headlines a quiet, engineered feel rather than a marketing punch. A muted teal (#75b6b5) carries all interactive voice — nav, icons, links, learn-more affordances — while a single vivid mint green (#0be291) is reserved exclusively for emphasized headings, creating a clear hierarchy where teal navigates and green signals the primary read. Surfaces are layered in near-black steps (page → card → elevated), with cards and buttons rounded modestly (8–16px) and never pill-shaped except for tags and icon containers. The visual signature is the contrast between the soft painterly hero and the hard-edged terminal aesthetic below it — a database that feels both approachable and uncompromising.

## Colors

| Name | Value | Role |
|------|-------|------|
| Abyss Teal | `#75b6b5` | Teal text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Mint Beacon | `#0be291` | Green text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Coral Ember | `#f4706b` | Decorative icon accent — used sparingly in nav icons and the hero illustration's mountain highlights. Warm counterpoint to the cool teal/mint palette |
| Lavender Mist | `#e4cbf2` | Hero atmosphere — the soft lavender backdrop of the hero section and mountain illustration sky. Only used in the hero band; never in component surfaces or UI chrome |
| Void | `#101e1e` | Page canvas and primary action background — the base layer of the dark theme and the fill of filled CTA buttons (Enter Studio, Discord). Slightly green-tinted black rather than pure neutral |
| Carbon | `#1a1a1a` | Deep surface — code block backgrounds, terminal interiors, darkest elevated layers. One step below void for maximum contrast terminal aesthetic |
| Slate | `#162929` | Mid surface and hairline borders — card backgrounds, button borders, dividers. Bridges between void and the lighter elevated steps |
| Graphite | `#3b4949` | Elevated card surface and hover-state fills — the topmost card tier, used for testimonial cards and hover backgrounds |
| Fog | `#718b8b` | Muted text and inactive nav icons — body helper text, inactive nav glyphs, secondary metadata. The de-emphasized reading layer |
| Ash | `#e5e7eb` | Hairline borders and dividers — the universal 1px border color used across nav, cards, icons, and structural separators. Primary border token |
| Paper | `#ffffff` | Primary text and icon fill — all high-emphasis body copy, headings, and filled icon shapes. The top of the text contrast scale |

## Typography

### Poppins — All UI and display copy. Weight 300 dominates display and hero headings, creating an unusually quiet headline voice — the database speaks softly. Weight 400 for body and nav, 500 for button labels and emphasized metadata, 700 reserved for rare structural emphasis.
- **Substitute:** Nunito Sans or DM Sans as system-friendly alternatives; for the same light-weight display feel, Manrope (300) is the closest match.
- **Weights:** 300, 400, 500, 700
- **Sizes:** 12, 14, 16, 18, 22, 24, 30, 48
- **Line height:** 1.00–1.78
- **Letter spacing:** normal at all sizes; no tightening observed on large display

### monospace — Code snippets, terminal output, SQL examples, and inline technical tokens. System monospace at a single small size — functional, not decorative.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Fira Code
- **Weights:** 300
- **Sizes:** 12px
- **Line height:** 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | — |
| body-sm | — | — | 14px | 1.45 | — |
| body | — | — | 16px | 1.56 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 22px | 1.43 | — |
| heading | — | — | 24px | 1.33 | — |
| heading-lg | — | — | 30px | 1.2 | — |
| display | — | — | 48px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 128px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **buttons:** 4px
- **code-blocks:** 4px
- **elevated-cards:** 16px
- **icon-containers:** 9999px

## Components

### Primary CTA Button (filled)
**Role:** Main conversion action — 'Enter Studio', 'Discord'

Filled dark button on dark surface: #101e1 background, #ffffff text, 4px radius, 12px vertical × 24px horizontal padding. Poppins 500 at 14px. Arrow glyph (→) follows label, rendered in the same white. No border. Hover lifts to #1a1a1a or adds subtle 1px #e5e7eb outline.

### Ghost Nav Button
**Role:** Secondary action in nav bar — 'Enter Studio' in header

Outlined button: transparent or #101e1 background, 1px #e5e7eb border, #ffffff text, 9999px radius (pill). Poppins 500 at 14px. 8px vertical × 20px horizontal padding. Inverts on hover (background becomes #e5e7eb, text becomes #101e1e).

### Nav Link
**Role:** Primary navigation — GitHub, Docs, Blog, Rigs

Text-only nav item, no underline. Poppins 400 at 14px, #75b6b5 (teal). 8px vertical padding. Hover: opacity 0.7 or shifts to #0be291. No background, no border.

### Code Terminal Block
**Role:** SQL example, command preview, developer-facing syntax

Dark terminal panel: #1a1a1a background, 4px radius, 1px #162929 border. Monospace 12px text, #ffffff on dark. 24px internal padding. Optional top bar with traffic-light dots (#f4706b, #0be291, #75b6b5). The terminal is always full-width within its container.

### Feature Card
**Role:** Product feature blocks — SQLite, On-chain security, Portable, Multi-chain, Pricing

Flat dark card with no background fill (sits directly on #101e1 canvas). Icon container is 32px circle with 1px #75b6b5 border, icon stroke in #75b6b5 or #0be291. Heading Poppins 500 at 18px, #ffffff. Body Poppins 400 at 14px, #718b8b. 'Learn more' link in #75b6b5 with underline. No card border or background — the negative space IS the card.

### Testimonial Card
**Role:** Community quotes — Twitter-style cards in 'Join the community' section

Elevated card: #3b4949 background, 1px #e5e7eb border, 16px radius, 24px padding. Avatar 32px rounded square with 1px #e5e7eb border, placed top-left. Display name Poppins 500 at 14px #ffffff beside @handle in #718b8b. Quote body Poppins 400 at 14px #ffffff with natural line wrapping. Cards may overflow horizontally with peek effect on the section edges.

### Section Heading (mint)
**Role:** Emphasized section titles — 'Join the community', key feature headers

Poppins 300 at 30px, #0be291. Centered alignment. The mint green is the only chromatic heading color; it signals the most important reading on the page. No underline, no decoration.

### Section Heading (white)
**Role:** Standard section titles — 'Build on decentralized data without the headache'

Poppins 300 at 30px, #ffffff. Centered. The default heading voice — quiet, engineered, not marketing-loud.

### Display Headline
**Role:** Hero headline — 'The decentralized cloud database.'

Poppins 300 at 48px, line-height 1.0, #1a1a1a on the lavender hero. The word 'decentralized' is bolded (weight 700) in the same color for contrast within the whisper-weight line. Small eyebrow label above in Poppins 500 at 12px uppercase #718b8b with 'ANYWHERE' bolded in #1a1a1a.

### Body Paragraph
**Role:** Standard explanatory copy

Poppins 400 at 16px, line-height 1.56, #ffffff. Max-width ~640px for readable line length. No drop cap, no first-line indent.

### Helper / Metadata Text
**Role:** Captions, timestamps, secondary metadata

Poppins 400 at 12px, #718b8b. Used for @handles, section subtitles, footnotes, and de-emphasized metadata.

### Icon Container (circular)
**Role:** Wrapping small feature/inline icons

32px–40px circle, 1px #75b6b5 or #e5e7eb border, transparent or #101e1 fill. Icon inside is 1.5px stroke, #75b6b5 or matching border color. Used for feature card headers and inline section markers.

### Hero Landscape Illustration
**Role:** Brand identity artwork — the mountain peaks in the hero

Illustrated mountain ridge in #f4706b (coral) with darker shadow planes, sitting on a soft #e4cbf2 to #f5d4e8 gradient sky. Flat illustration style, no outlines, geometric facets. Anchored to the right side of the hero, bleeding off the right edge. The illustration is the brand signature — no other decorative graphics are used in the dark interior.

## Do's and Don'ts

### Do
- Use Poppins 300 for all display and section headings — the whisper-weight is the signature voice
- Reserve #0be291 (mint) exclusively for emphasized section headings; never apply it to body, links, or backgrounds
- Use #75b6b5 (teal) for all interactive voice — nav links, icon strokes, learn-more affordances
- Layer surfaces using the four-step scale: #101e1 (page) → #162929 (mid) → #3b4949 (elevated card) → #1a1a1a (terminal)
- Use 4px radius for buttons and code blocks, 8px for content cards, 16px for elevated testimonial cards, 9999px only for tags and icon containers
- Center-align section headings and give each section at least 128px vertical breathing room
- Keep the lavender hero as the single painted moment — do not introduce gradients or illustrations into the dark interior

### Don't
- Do not use weight 600+ on display headings — the light-weight restraint IS the brand voice
- Do not apply #0be291 to links, icons, or backgrounds — it loses hierarchy when scattered
- Do not use pill radius (9999px) on buttons or cards — pills are reserved for tags and icon containers only
- Do not introduce shadows or elevation effects — the design relies on surface color steps, not depth
- Do not use pure black (#000000) — all darks are slightly green-tinted (#101e1, #1a1a1a, #162929)
- Do not add accent colors beyond the existing four (teal, mint, coral, lavender) — the palette is intentionally narrow
- Do not use more than one chromatic color per UI region — teal for interaction, mint for emphasis, coral only in the hero illustration

## Elevation

The design uses no shadows or blur effects. Depth is communicated entirely through a four-step surface color scale (#101e1 → #162929 → #3b4949 → #1a1a1a) and 1px #e5e7eb hairline borders. This flat, hard-edged approach reinforces the infrastructure/database identity — nothing floats, everything sits precisely on a surface.

## Surfaces

- **Canvas** (`#101e1`) — Page background — the base dark layer across all interior sections
- **Mid Surface** (`#162929`) — Subtle card backgrounds and structural borders — bridges void and elevated
- **Elevated Card** (`#3b4949`) — Testimonial and elevated content cards
- **Terminal** (`#1a1a1a`) — Code blocks and deepest UI elements — the darkest tier for maximum contrast

## Imagery

The site has exactly one illustrative element: a painted mountain landscape in the hero section, rendered in flat geometric facets of coral (#f4706b) with soft gradient sky (#e4cbf2 to #f5d4e8). No photography, no 3D renders, no decorative graphics anywhere in the dark interior. Icons throughout are simple line-drawn strokes in 1.5px weight, using teal (#75b6b5) as the standard color. The visual language is deliberately sparse: the hero illustration is the only emotional moment, and the rest of the page communicates through type, surface color, and code. This restraint signals developer credibility — the product is the content, not the decoration.

## Layout

Page is max-width 1200px centered with generous horizontal padding (80px on desktop). The hero is split-layout: left column holds eyebrow label, display headline, body copy, and CTA; right column is dominated by the mountain illustration bleeding off the right edge. Below the hero, the page alternates into full-width dark bands with centered headings and either 2-column or 4-column content grids. The 'Build on decentralized data' section uses a 4-column equal grid for feature cards (SQLite, On-chain security, Portable, Multi-chain), then drops to a single-column full-width block for Pricing. The 'Join the community' section breaks the grid with a horizontally scrolling testimonial card carousel that peeks cards at the edges. Section gaps are 128px, giving each dark band room to breathe. Navigation is a minimal top bar: logo left, 4 text links plus 1 ghost pill button right, 64px height, 1px bottom border in #e5e7eb.

## Similar Brands

- **The Graph** — Same dark-mode developer infrastructure aesthetic with a single hero illustration and quiet, weight-300 display headlines
- **Filecoin** — Dark canvas with an illustrated landscape hero, mint-green accent for emphasized headings, and terminal-style code blocks
- **Ceramic Network** — Near-black surface stack with a four-step elevation scale, teal interactive voice, and flat geometric illustration in the hero
- **IPFS** — Developer-facing dark surface with a single brand-color moment in the hero, monospace code examples, and whisper-light Poppins-style headlines
