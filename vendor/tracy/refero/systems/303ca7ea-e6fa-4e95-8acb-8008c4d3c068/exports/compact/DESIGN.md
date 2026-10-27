# Svelte — Style Reference
> Editorial broadsheet on white marble — serif voice, single ember accent

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Svelte's site reads like a literary broadsheet translated into a framework landing page. Serif typography — EB Garamond for running text, DM Serif Display for hero headlines — carries the voice while a tight sans-serif (Fira Sans) handles the chrome: nav, buttons, tags, search. The canvas is pure white, surfaces are rare, and elevation is almost nonexistent; hierarchy comes from type size and weight rather than cards or shadows. A single vivid orange (#d43008) punctuates the monochrome page: it owns the logo, the GET STARTED arrow, the /svelte/ wordmark, and the documentary link. CTAs are arrow-suffixed text links, never boxed buttons. The site breathes — generous vertical rhythm, centered serif headlines, grayscale sponsor logos, and very little ornamentation between sections.

## Colors

| Name | Value | Role |
|------|-------|------|
| Svelte Ember | `#d43008` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink | `#262626` | Primary text, nav items, body copy, button labels — soft black that avoids the harshness of #000 while preserving 15:1 contrast on white |
| Carbon | `#141414` | Headlines and display copy — slightly heavier than Ink to give the serif wordmarks visual weight against the white canvas |
| Paper | `#ffffff` | Page canvas, card surfaces, nav background — the dominant background everywhere |
| Fog | `#f2f2f2` | Subtle surface elevation, button hover wash, search/input field background |
| Slate | `#666666` | Muted secondary text, helper labels, breadcrumb text |
| Ash | `#808080` | Deemphasized text, disabled labels, tertiary metadata |
| Obsidian | `#000000` | Input field borders, form focus states, text input text |

## Typography

### EB Garamond — Body text and section copy — Garamond gives the framework a literary, editorial voice that no sans-serif system font can replicate; 22px at line-height 1.5 is the site's reading rhythm, uncharacteristically large and serif for a devtool site
- **Substitute:** Source Serif Pro, Crimson Pro, Lora
- **Weights:** 400
- **Sizes:** 10px, 22px
- **Line height:** 1.50

### Fira Sans — All UI chrome — nav links, search input, button labels, the ADJECTIVE tag, section eyebrows. Fira Sans is the workspace font; it keeps interactive elements quiet so the serif voice can lead
- **Substitute:** Inter, system-ui, -apple-system
- **Weights:** 400
- **Sizes:** 10px, 12px, 13px, 14px, 16px, 20px
- **Line height:** 1.00–1.70

### DM Serif Display — Hero and section display headlines — used sparingly (only 4 occurrences on the page) as a typographic exclamation point; the heavy serif slab at 54px contrasts with the lighter Garamond body to create editorial tension
- **Substitute:** Playfair Display, Cormorant Garamond Bold
- **Weights:** 500
- **Sizes:** 54px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | — |
| subheading | — | — | 20px | 1.2 | — |
| body | — | — | 22px | 1.5 | — |
| display | — | — | 54px | 1.2 | — |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 40px
- **Card padding:** 48px
- **Element gap:** 10px

### Border Radius

- **nav:** 56px
- **tags:** 4px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Text Link CTA
**Role:** Primary action

UPPERCASE Svelte Ember (#d43008) text, 14px Fira Sans weight 400, letter-spacing slightly wide, followed by a right arrow (→). No background, no border, no padding. The arrow animates on hover by nudging right. Examples: 'GET STARTED', 'Watch the full Svelte Origins documentary'.

### Ghost Navigation Link
**Role:** Top nav item

Fira Sans 14px, Ink (#262626) color, no underline by default, underline appears on hover. Items: Docs (with dropdown caret), Tutorial, Packages, Playground, Blog. Right-aligned: search field, Discord, GitHub, Open collective, Apple icon.

### Search Field
**Role:** Site search

Pill-shaped (56px radius), Fog (#f2f2f2) background, Ink (#141414) placeholder text reading 'search', 8px horizontal padding, ~32px height. Cmd+K shortcut hint shown inside.

### Adjective Tag
**Role:** Highlight label

Small pill adjacent to the /svelte/ wordmark: dark Ink (#262626) background, white text, Fira Sans 10-12px uppercase, 4px radius, 5px vertical / 8px horizontal padding. Reads 'ADJECTIVE' as a templated fill-in.

### Section Heading
**Role:** Display headline

DM Serif Display weight 500 at 54px, Carbon (#141414) color, centered alignment. Line-height 1.2. Used for hero ('web development for the rest of us') and sponsor section ('used by companies you've heard of').

### Body Paragraph
**Role:** Editorial copy

EB Garamond 22px weight 400, Ink (#262626), line-height 1.5. Justified or left-aligned depending on column. Generous measure (~600-680px wide). The Svelte Ember color highlights inline terms like '/svelte/'.

### Code Terminal Card
**Role:** Product screenshot frame

Dark Ink (#262626) or near-black background, monospace syntax highlighting inside, subtle 4px radius, no shadow. Contains REPL or framework comparison output. Sits beside editorial text in a two-column layout.

### Logo Grid
**Role:** Social proof

Single horizontal row of grayscale sponsor logos (overflow, yelp, Square, Apple, Spotify, NYT, IKEA) at uniform size, spaced ~115px apart. All logos desaturated to ~50% gray. Centered in section with headline above.

### Hero Illustration
**Role:** Brand visual

3D isometric render of a factory production line in Svelte Ember (#d43008) and Ink, with the Svelte 'S' logo as a building. Sits in the right half of the hero on a very light blue-gray gradient canvas. Full-color, dimensional, photoreal rendering style.

### Two-Column Content Section
**Role:** Feature explanation

Left column: /svelte/ wordmark (DM Serif Display, Ember orange) + Adjective Tag + 2-3 paragraphs of EB Garamond body. Right column: stacked code terminal cards and chart screenshots. 48px horizontal padding within columns.

### Footer Link
**Role:** Secondary navigation

Fira Sans 14px, Ink (#262626), no decoration, hover underline. Left-aligned in footer band.

## Do's and Don'ts

### Do
- Use EB Garamond 22px / line-height 1.5 for all paragraph copy — the serif body is the site's voice
- Use Svelte Ember #d43008 exclusively for the brand wordmark, in-text links, and arrow CTAs — never as a fill color for buttons or cards
- Set hero and section headlines in DM Serif Display weight 500 at 54px, centered, in Carbon #141414
- Use Fira Sans 14px for all UI chrome: nav, buttons, tags, inputs, helper text
- Build CTAs as uppercase text links with a trailing arrow, not boxed buttons — 'GET STARTED →' not 'Get Started' on a colored fill
- Keep the canvas pure white #ffffff and let Fog #f2f2f2 handle the only surface variation (inputs, hover washes)
- Maintain 40px between sections and 48px horizontal padding inside content columns

### Don't
- Don't use DM Serif Display for body text — reserve it for display headlines at 54px only
- Don't add drop shadows, card elevations, or gradient backgrounds — the design is flat and relies on whitespace for separation
- Don't use boxed primary buttons with fills — actions are text links with arrows
- Don't introduce additional accent colors — Svelte Ember is the only chromatic token; everything else is grayscale
- Don't use border-radius above 4px on content elements; 56px is reserved for the search pill only
- Don't left-align section display headlines like 'used by companies you've heard of' — center them
- Don't use sans-serif fonts for headlines — the serif/serif contrast between Garamond body and DM Serif Display is signature

## Elevation

The site avoids shadows entirely. Visual hierarchy is achieved through typographic weight (Garamond 22px body vs. DM Serif 54px display) and whitespace (40px section gaps), not elevation. The only depth comes from product screenshots and the 3D hero illustration, which are pre-rendered assets — not UI elevation.

## Surfaces

- **Paper** (`#ffffff`) — Primary page canvas and default surface
- **Fog** (`#f2f2f2`) — Input fields, button hover states, subtle dividers
- **Slate** (`#666666`) — Inverted surface for dark code blocks or footer panels
- **Ink** (`#262626`) — Dark code terminal and product screenshot frames

## Imagery

Imagery is sparse and deliberate. The hero uses a single large 3D isometric illustration of a production-line factory in Svelte Ember orange and dark gray, filling the right half of the viewport on a near-white blue-gray canvas. Product screenshots (REPL, framework comparison charts) appear as framed code-terminal cards with dark backgrounds. The sponsor section uses desaturated grayscale logos in a single row. No lifestyle photography, no stock imagery — the visual language is illustration + product UI, nothing else. Icon style throughout is minimal: outlined 16-20px line icons in nav (search, Discord, GitHub, etc.), no filled icon variants.

## Layout

Centered single-column with a max-width around 1200px. The hero is a two-column split: left half holds the headline and GET STARTED arrow, right half holds the 3D illustration. Below, sections alternate between centered display-headline + content and two-column text+product-screenshot layouts. The sponsor logos section is a single horizontal row of grayscale marks with the display headline centered above. Navigation is a single fixed-height top bar with logo + 5 nav items left-aligned and search + social icons right-aligned. Vertical rhythm is generous: ~100px top/bottom padding on major sections, 40px between stacked elements. The page reads top-to-bottom in one uninterrupted scroll with no sidebar, no modals visible.

## Similar Brands

- **Evan You's personal site / Vite** — Same editorial serif-headline + monochrome-canvas approach with a single accent color, very restrained UI
- **Astro** — Both are devtool sites that reject the typical dark dashboard aesthetic, using generous whitespace and serif/sans typographic contrast
- **Stripe Press** — Same literary-broadsheet language — serif display headlines, restrained color, white canvas, type-driven hierarchy
- **Observable** — Both use centered serif display headlines over content, with product screenshots as the primary visual element
