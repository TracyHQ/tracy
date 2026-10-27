# Tinybird — Style Reference
> developer terminal at midnight — black void, one electric green cursor, monospace whispers

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tinybird is a dark-mode developer console aesthetic: near-black canvas, one electric green accent that acts as the only chromatic voice on screen, and a strict division between humanist Roboto for prose and monospaced Roboto Mono for tags, labels, and code. The interface reads as terminal-grade — monospace badges sit inside square brackets like log entries, and the green accent behaves like a blinking cursor rather than a brand color, used sparingly for CTAs, links, and the occasional inline highlight. Surfaces are flat, borders are hairline, and elevation is achieved through subtle dark-to-darker layering rather than shadows. The result is a product page that feels engineered rather than marketed, confident in its restraint.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cursor Green | `#27f795` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Hover Green | `#008060` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Terminal Red | `#800000` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Pure White | `#ffffff` | Primary text and headlines. Maximum contrast against the near-black canvas for immediate legibility |
| Void Black | `#000000` | Deepest surface layer for hero backgrounds and video poster frames, one step darker than the page canvas |
| Console Black | `#0a0a0a` | Primary page canvas — the dominant background of every screen. A hair above true black to soften OLED contrast |
| Panel Charcoal | `#151515` | First elevated surface — used for embedded media frames and video containers that need to sit above the page canvas |
| Card Graphite | `#262626` | Testimonial and content card backgrounds. Two steps above the canvas, enough lift to separate without casting shadow |
| Border Smoke | `#353535` | Hairline borders, input fields, and dividers. Defines component edges without competing with content |
| Muted Ash | `#8d8d8d` | Secondary body text, descriptions, and sub-labels — the voice for anything supporting but not starring in the hierarchy |
| Tertiary Fog | `#999999` | Tertiary text and disabled-state labels. The faintest human voice before falling into silence |
| Highlight Mist | `#d9d9d9` | Bright border accent used on emphasized outlined elements like the active workflow step |

## Typography

### Roboto — Prose and headlines. Weight 400 for body and descriptions, weight 600 for primary CTA button text, weight 700 reserved for the 64px display headline. The tight negative tracking at 64px tightens the headline into a single confident block.
- **Substitute:** Inter, system-ui, sans-serif
- **Weights:** 400, 600, 700
- **Sizes:** 12, 14, 16, 18, 24, 64
- **Line height:** 1.13, 1.33, 1.50, 1.57, 1.67, 1.78
- **Letter spacing:** -0.0200em at 64px (display), -0.0130em at 24px (heading)

### Roboto Mono — Tags, badges, code labels, workflow step indicators, and monospaced stat figures. The extreme -0.084em tracking at 56px is anti-convention — monospace usually stays loose, but this tightens the digits into a dense data block that feels engineered, not displayed.
- **Substitute:** JetBrains Mono, IBM Plex Mono, monospace
- **Weights:** 400
- **Sizes:** 12, 14, 16, 56
- **Line height:** 1.00, 1.50, 1.57, 1.67
- **Letter spacing:** -0.0840em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.57 | 0px |
| body-sm | — | — | 14px | 1.57 | — |
| body | — | — | 16px | 1.67 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 24px | 1.33 | -0.31px |
| stat-figure | — | — | 56px | 1 | -4.7px |
| display | — | — | 64px | 1.13 | -1.28px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 4px
- **cards:** 8px
- **buttons:** 4px

## Components

### Primary CTA Button
**Role:** Filled button for the single most important action on a screen

Background #27f795 (Cursor Green), text #000000 or #0a0a0a, Roboto weight 600 at 16px, 4px radius, 12px vertical and 24px horizontal padding. This is the only filled button in the system — every other interactive element is ghost or text. The green fill is the visual equivalent of a blinking cursor.

### Ghost Link Button
**Role:** Secondary action that sits beside the primary CTA

No background, text #27f795, Roboto weight 400 at 16px, no border, no radius. Reads as a text link with cursor affordance — a quieter companion to the filled CTA.

### Navigation Header
**Role:** Persistent top bar with product links and auth actions

Transparent background over the #0a0a0a canvas. Logo (bird mark + 'tinybird' wordmark) on the left in white at 14px weight 700. Center nav items in white at 14px weight 400. Right side: ghost 'Sign in' text link in #27f795, followed by a filled 'Sign up' button using the Primary CTA style at compact 10px vertical and 16px horizontal padding.

### Bracket Workflow Tag
**Role:** Step indicator in workflow sequences

No background, Roboto Mono weight 400 at 12px, color #27f795 for active step and #8d8d8d for inactive steps. Wrapped in literal square brackets: [Get Started] [Develop] [Ingest] [Query] [Monitor] [Iterate]. Pipe characters separate steps. This is the signature micro-component — it makes the interface feel like a log output.

### Category Tag
**Role:** Topical classification badge

1px border in #353535 (Border Smoke), transparent background, Roboto Mono weight 400 at 12px, text #d9d9d9, 4px radius, 4px vertical and 12px horizontal padding. Used in the hero to categorize use cases like 'SaaS / Dashboards', 'Observability', 'AI Analytics'.

### Stat Card
**Role:** Hero metric display

Large Roboto Mono figure at 56px weight 400 in #27f795, tracked at -0.084em to compress digits into a dense block. Adjacent label in Roboto Mono at 12px in #8d8d8d, uppercase. No card chrome — sits directly on the canvas.

### Testimonial Card
**Role:** Social proof block in 3-column grid

Background #262626 (Card Graphite), 8px radius, 24px padding all sides. 40px circular avatar at top-left, name in Roboto weight 600 at 14px in #ffffff, title and company in #8d8d8d at 12px. Quote body in Roboto weight 400 at 14px in #d9d9d9. 1px border in #353535 for definition against the slightly lighter card surface.

### Hero Section
**Role:** Above-the-fold headline and CTA

Centered layout on #0a0a0a. Headline at 64px Roboto weight 700 in #ffffff, tracked at -0.020em, line-height 1.13. Subtext at 18px Roboto weight 400 in #8d8d8d. Primary CTA and ghost link side by side with 16px gap. Category tags below with 8px gap.

### Logo Bar
**Role:** Partner or customer logo strip

Single row of 7–8 grayscale logos centered, separated by 40px gap, inside a card with #262626 background and 1px #353535 border. Logos rendered in #8d8d8d to recede — they are evidence, not heroes.

### Video Embed Frame
**Role:** Full-width media container for demos

Background #151515 (Panel Charcoal), 1px border in #353535, no radius. Circular play button centered at 64px diameter, #353535 fill with white triangle icon. Frame extends edge-to-edge within its container with no internal padding — the video is the content.

### Data Hero Band
**Role:** Promotional strip combining social proof and live metrics

Inline composition on the canvas: partner attribution (small avatar + name) in #8d8d8d, followed by a description sentence with the phrase '30M requests/day' highlighted in #27f795. Below, a two-column split: left column has stacked stat figures in Cursor Green, right column has a white-quote testimonial block.

## Do's and Don'ts

### Do
- Use #27f795 fill only for the single most important action per screen — one filled CTA, everything else ghost or text.
- Wrap workflow steps and inline labels in square brackets rendered in Roboto Mono to maintain the terminal-log aesthetic.
- Use Roboto Mono for all numerics, stats, and tag labels; use Roboto only for prose, descriptions, and headlines.
- Set headline tracking to -0.020em at 64px and stat-figure tracking to -0.084em at 56px to compress type into dense, confident blocks.
- Build surface hierarchy through four levels of charcoal (0a0a0a → 151515 → 262626 → 353535) rather than drop shadows.
- Keep all borders at exactly 1px in #353535 — the system is defined by hairline edges, not weight.
- Use 4px radius for buttons and 8px radius for cards — no larger radii anywhere.

### Don't
- Do not introduce any color outside the palette — the system is achromatic plus one green, and adding a second chromatic voice breaks the terminal metaphor.
- Do not use filled buttons with neutral or white backgrounds — the only fill color is #27f795, and only for primary actions.
- Do not use Roboto for tags, labels, or code — these must stay in Roboto Mono to preserve the developer-tool identity.
- Do not use shadows or glows to create elevation — the design achieves layering through surface darkness, never drop shadows.
- Do not use radii larger than 8px — anything rounder would feel consumer-friendly and break the engineered feel.
- Do not use the red #800000 as an error state — it is a quiet inline accent, not a semantic signal.
- Do not left-align hero content — the centered headline with tight tracking is the signature opener.

## Elevation

- **Card on Canvas:** `none — achieved through #262626 surface against #0a0a0a canvas`
- **Testimonial Card:** `none — 1px #353535 border on #262626 surface`
- **Video Frame:** `none — 1px #353535 border on #151515 surface`

## Surfaces

- **Void** (`#000000`) — Deepest surface for hero bands and full-bleed media frames
- **Console** (`#0a0a0a`) — Primary page canvas across all sections
- **Panel** (`#151515`) — Embedded media containers, video posters
- **Card** (`#262626`) — Testimonial and content card backgrounds
- **Edge** (`#353535`) — Borders, input fields, subtle dividers

## Imagery

Visuals are minimal and functional. The only photographic content is small circular avatar portraits in testimonial cards (40px, tightly cropped to face). The primary visual artifact is a full-bleed video demo frame rendered as a flat charcoal panel with a centered play button — no thumbnail, no preview. Partner logos in the logo bar are desaturated to #8d8d8d monochrome, presenting social proof as evidence rather than endorsement. No illustrations, no 3D renders, no decorative graphics. The green accent does the visual work that ornament would do elsewhere.

## Layout

Max-width 1200px centered content on a full-bleed #0a0a0a canvas. The page follows a vertical rhythm of full-width sections separated by 80px gaps, with no alternating light/dark bands — every section shares the same dark canvas. Each section is centered text-first, with the hero using a centered stack (headline → subtext → CTA pair → tag row) and subsequent sections alternating between centered text blocks and 3-column card grids. Navigation is a minimal transparent top bar with no sticky shadow. Content density is comfortable rather than dense — large vertical breathing room and centered compositions create a stage for the single green accent.

## Similar Brands

- **Vercel** — Same black-canvas developer-tool aesthetic with a single chromatic accent and geometric sans-serif headlines, though Vercel uses white accents where Tinybird uses green
- **Railway** — Dark-mode infrastructure product page with monospace labels and flat surface layering, though Railway leans more purple than green
- **PlanetScale** — Terminal-grade dark interface with monospace stat figures and flat card hierarchy, though PlanetScale uses a broader gradient palette
- **Supabase** — Dark developer-tool product page with a single vivid accent color (green for Supabase) and monospace tag badges
