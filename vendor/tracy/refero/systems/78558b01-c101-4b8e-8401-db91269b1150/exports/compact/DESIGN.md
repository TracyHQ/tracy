# Checkly — Style Reference
> Mission control at deep orbit

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Checkly lives in deep midnight-navy — a near-black cosmic canvas where white type floats like HUD readouts and one vivid electric blue acts as the signal accent. The system is deliberately sparse: hairline light-gray borders define structure instead of heavy shadows, product UI is shown as floating light-themed cards suspended on the dark void, and code blocks are treated as first-class content in JetBrains Mono. Inter at weight 300 gives headlines a whisper-quiet authority that lets the technical subject matter do the talking, while weight 500–600 carries operational UI. The overall feel is mission control at altitude — minimal chrome, maximal legibility, one accent doing all the semantic work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Navy | `#041734` | Page background, hero canvas, section bands — the deep-space base on which all other UI floats |
| Signal Blue | `#0075ff` | Blue text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Probe Cyan | `#008ef0` | Hover/active accent variant for buttons and interactive states |
| Hub Navy | `#002652` | Secondary surface tint, logo wordmark — a slightly lighter shade of the void used for depth |
| Orbit Slate | `#0f172a` | Card surfaces, inset panels, terminal block backgrounds — the next level up from the void |
| Deck Charcoal | `#1a1f36` | Elevated card surfaces, nested panel backgrounds — sits above Orbit Slate for layered depth |
| Deep Hull | `#1f2937` | Borders on dark surfaces, section dividers within dark bands |
| Steel Edge | `#374151` | Borders and dividers on cards and panels — the most common structural border |
| Console Gray | `#445458` | Secondary body text, muted labels, icon fills — readable on dark without competing with white headings |
| Slate Mute | `#64748b` | Helper text, captions, tertiary metadata — drops information below the primary read |
| Mist | `#a7babe` | De-emphasized text, disabled labels, low-priority inline content |
| Halo | `#e5e7eb` | Hairline borders on dark surfaces, subtle dividers, the dominant structural line color |
| Pure White | `#ffffff` | Primary text, filled button background, logo fills — maximum contrast against the void |
| Status Green | `#4ade80` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |

## Typography

### Inter — Primary UI and heading typeface. Weight 300 for display headlines creates whisper-quiet authority; weight 400 for body; weight 500–600 for nav, buttons, and labels.
- **Substitute:** Inter (Google Fonts)
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 10, 12, 14, 16, 18, 20, 24, 30, 32, 48, 60
- **Line height:** 1.20–1.63 (display 1.20, body 1.50, small 1.43)
- **Letter spacing:** -0.0400em at 60px, -0.0250em at 48px, 0.0500em at 10–12px (tracked-out micro-labels)
- **OpenType features:** `"ss01" on, "cv11" on`

### JetBrains Mono — Code blocks, terminal output, CLI commands like `npx checkly init`. The custom font signal 'this is executable'.
- **Substitute:** JetBrains Mono (JetBrains), or Fira Code
- **Weights:** 400
- **Sizes:** 10, 12, 16
- **Line height:** 1.50–1.63

### ui-monospace — System monospace fallback for inline code, tab indicators, secondary code contexts
- **Substitute:** SF Mono, Menlo, Consolas, monospace
- **Weights:** 400, 500
- **Sizes:** 11, 12, 14
- **Line height:** 1.33–1.63

### Consolas — Consolas — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 0.5px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.4 | 0px |
| heading-sm | — | — | 24px | 1.33 | 0px |
| heading | — | — | 32px | 1.25 | 0px |
| heading-lg | — | — | 48px | 1.2 | -1.2px |
| display | — | — | 60px | 1 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **inputs:** 8px
- **buttons:** 8px
- **code-blocks:** 12px

## Components

### Primary CTA Button (White Filled)
**Role:** Main conversion action — 'Start for free', 'Book a demo'

White (#ffffff) background, Void Navy (#041734) text, 8px radius, Inter weight 500 at 14–16px, padding 10px 20px. Inverts against the dark canvas like a lit control panel switch.

### Secondary CTA Button (Outlined)
**Role:** Alternative action alongside primary CTA

Transparent background, 1px border in #cfdfec or #041734, white text, 8px radius, padding 10px 20px. Low-emphasis companion that defers to the filled button.

### Pill Badge / Status Tag
**Role:** Environment labels, status indicators, inline tags

9999px radius, 4–8px vertical padding, 10–12px horizontal padding. Background varies: green (#4ade80) for 'passing/available', dark navy for 'test/staging/prod' code blocks, subtle gray for category labels. Inter at 10–12px weight 500, letter-spacing 0.05em.

### Terminal / CLI Block
**Role:** Code snippets, install commands, config examples

Orbit Slate (#0f172a) background, 12px radius, padding 16–24px. JetBrains Mono at 12–16px, line-height 1.63. White text with green (#4ade80) and light blue (#bfdbfe) syntax accents. Often prefixed with a copy icon.

### Embedded Product Screenshot Card
**Role:** Dashboard previews, feature demonstrations, product evidence

White (#ffffff) background, 12–16px radius, subtle box-shadow rgba(0,0,0,0.25) 0px 25px 50px -12px. Floats on the dark canvas as a bright window into the product. Contains light-themed UI (charts, tables, status badges in green/red).

### Navigation Bar
**Role:** Top-level site navigation

Transparent or slightly tinted dark background, Inter weight 500 at 14px, white text, 24px horizontal padding on nav items, 8px vertical padding. Logo left, links center, auth actions right. Sticky on scroll.

### Section Heading with Blue Accent Words
**Role:** Display-level section titles

Inter weight 300 at 48–60px, white (#ffffff), letter-spacing -0.025em to -0.04em. Select words rendered in Signal Blue (#0075ff) to create semantic emphasis without underlining. Line-height 1.00–1.20.

### Feature Card (Dark Surface)
**Role:** Three-column feature highlights, capability summaries

Orbit Slate (#0f172a) or Deck Charcoal (#1a1f36) background, 12px radius, 24px padding, 1px border in #374151. Heading in white weight 500 at 20–24px, body in Console Gray (#445458) at 16px.

### Trust Logo Bar
**Role:** Social proof — customer/partner logos

Single row or two-row grid of company logos in white or light gray on the dark background. Logos desaturated to grayscale or rendered in white. No borders or containers — logos float directly on the section.

### Code Syntax Token
**Role:** Inline and block code highlighting

Colored tokens within terminal blocks: keywords in #d8b4fe (purple), strings in #4fd785 (green), numbers in #fde047 (yellow), function names in #bfdbfe (light blue), comments in #6094c1 (muted blue). Against the Orbit Slate background.

### Command Input Pill
**Role:** CLI install command display in hero

Dark rounded container with a copy affordance, monospace text showing the install command. Centered below hero CTAs as a secondary call-to-action. 12px radius, subtle border.

### Chat Widget Bubble
**Role:** Support chat launcher (bottom-right)

Signal Blue (#0075ff) circular button with a blue glow shadow rgb(0,117,255) 0px 25px 50px -12px. Fixed position bottom-right corner.

## Do's and Don'ts

### Do
- Use weight 300 Inter at 48–60px for display headlines — the whisper-weight is the signature
- Use #0075ff Signal Blue exclusively for accent text, highlighted words, icon strokes, and interactive links — never for backgrounds
- Use 9999px radius for all status pills, environment tags, and inline badges
- Use 8px radius for all buttons and 12px for cards — the 8/12 split is consistent across the system
- Use #e5e7eb at low opacity (or #374151 on dark surfaces) for hairline borders instead of heavy shadows
- Use JetBrains Mono for any code, CLI commands, or terminal output — never let Inter render code
- Use white (#ffffff) filled buttons as the primary CTA on the dark canvas — they read as 'switched on' controls

### Don't
- Don't use shadows as the primary structural method — use hairline borders in #374151 or #e5e7eb instead
- Don't use #0075ff as a large filled background — it's an accent, not a surface
- Don't use weight 700 or 800 for headlines — the system speaks at weight 300, not weight 900
- Don't use rounded radii above 16px on cards or panels — the 8/12/16 progression is the system
- Don't introduce new chromatic colors beyond Signal Blue, Status Green, and syntax-token colors
- Don't use Inter for code — always JetBrains Mono or system monospace
- Don't add gradients to UI surfaces — the system is flat with one subtle white-to-blue wash as the only gradient

## Elevation

- **Embedded product card:** `rgba(0, 0, 0, 0.25) 0px 25px 50px -12px`
- **Standard surface card:** `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px`
- **Chat widget:** `rgb(0, 117, 255) 0px 25px 50px -12px`
- **Inset dark card:** `rgba(0, 0, 0, 0.25) 0px 4px 12px 0px, rgba(0, 0, 0, 0.15) 0px 1px 3px 0px, rgba(255, 255, 255, 0.04) 0px 1px 0px 0px inset`

## Surfaces

- **Void** (`#041734`) — Page and section background — the deep-space base
- **Orbit** (`#0f172a`) — Card surfaces, terminal blocks, code panels
- **Deck** (`#1a1f36`) — Elevated nested panels, tab content backgrounds
- **Product Light** (`#ffffff`) — Embedded product screenshot cards — light-themed UI floating on the dark canvas

## Imagery

The visual language is predominantly iconographic and abstract rather than photographic. The hero features a stylized illustration of the raccoon mascot at the center of a network of curved connection lines radiating outward to floating tool/tech icons (GitHub, Slack, browser logos). Customer logos appear as monochrome white wordmarks in a trust bar. Product evidence comes from embedded light-themed dashboard screenshots that float as cards on the dark canvas. No lifestyle photography, no human faces, no real-world environments — the aesthetic is diagrammatic and infrastructural.

## Layout

The page is full-bleed dark navy with max-width 1200px content containers centered within sections. The hero is a centered text stack (headline → subhead → dual CTA → CLI command) with the raccoon illustration radiating connection lines as the visual anchor. Below the hero, sections alternate between text-left/visual-right 2-column patterns and 3-column feature card grids. Product screenshots are embedded as light cards spanning 2/3 to full width. The trust logo bar sits as a full-width band. Navigation is a top bar with logo left, links center, auth actions right. The overall rhythm is generous vertical breathing room (80px section gaps) with dense information packed into each section. Sections are separated by slight background color shifts within the navy family rather than hard dividers.

## Similar Brands

- **Vercel** — Same near-black canvas with white type and a single vivid accent color for interactive emphasis, same flat low-elevation aesthetic
- **Linear** — Same developer-tool dark UI with weight-300 display headlines, hairline borders, and Inter typography at whisper volumes
- **Railway** — Same deep navy infrastructure-tool aesthetic with code-as-first-class content and minimal chrome
- **PlanetScale** — Same dark-mode devtools pattern with floating product screenshots as evidence cards on a dark background
