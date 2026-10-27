# Framer — Style Reference
> neon gallery in the void

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Framer operates as a near-total darkness — a black canvas where content floats like neon signage in a gallery opening. Headlines set in GT Walsheim Medium with tight 0.8–1.1 line-height and aggressive negative tracking (-0.04em at 54px) create compressed display type that pushes forward instead of sitting politely on the page. A single electric blue (#0099ff) provides all functional accent — borders, glows, badges, active states — while the rest of the interface stays achromatic, relying on subtle gray steppings (#111, #171717, #242424) to carve depth out of pure black. Components feel engineered rather than decorated: rounded 8–25px radii, 1px hairline borders, minimal shadows, and ghost/translucent surfaces that let the void show through.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, nav background, card surfaces, icon fills — the infinite black that swallows all non-essential content |
| Graphite | `#111111` | Elevated card surfaces one step above the void — large feature cards and modal containers |
| Obsidian | `#171717` | Mid-tier surface for buttons, secondary cards, UI fills — separates interactive elements from the canvas |
| Slate | `#242424` | Hover states, input fields, and elevated panels — the brightest neutral before reaching text territory |
| Ash | `#333333` | Deep fill for inactive backgrounds and structural elements |
| Smoke | `#666666` | Disabled text, low-emphasis body copy, tertiary strokes |
| Fog | `#888888` | Borders, dividers, icon strokes — the structural outline color |
| Mist | `#999999` | Secondary body text, captions, metadata — readable but never competing with headlines |
| Pearl | `#cccccc` | Light body text for contrast pairs on dark surfaces |
| Bone | `#ffffff` | Primary headings, body text on dark canvas, button backgrounds — the sole light source |
| Electric Blue | `#0099ff` | Accent borders, glows, link underlines, badge outlines, active states — the only chromatic punctuation in the entire system |
| Deep Current | `#00406b` | Dark accent fills and box-shadows paired with Electric Blue — the saturated shadow underneath blue glows |
| Midnight Tide | `#002238` | Subtle blue-tinted surface washes and shadow tints — keeps the blue accent feeling atmospheric even in flat fills |
| Signal Green | `#4cd963` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Vivid Violet | `#0066ff` | Primary action button fill — the only place a solid chromatic button background appears in the interface |
| Alert Red | `#ff0022` | Red wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Amber | `#ffbb00` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Lime | `#cbff00` | CSS token hint — secondary accent available in the design system but not actively surfaced in core pages |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### GT Walsheim — Display and heading type — the signature typeface. Aggressively compressed with line-height 0.8–1.1 and tracking -0.04em to -0.05em at 44–68px. This isn't decoration; GT Walsheim's geometric warmth at tight metrics creates the system's voice — confident, compact, slightly futuristic. Substitute: Inter Tight or Space Grotesk Bold for similar geometric presence.
- **Substitute:** Inter Tight, Space Grotesk
- **Weights:** 500
- **Sizes:** 44px, 54px, 68px
- **Line height:** 0.80, 1.00, 1.10
- **Letter spacing:** -0.0400em at 44px, -0.0400em at 54px, -0.0500em at 68px
- **OpenType features:** `"ss02"`

### Inter Variable — Body, nav, and secondary headings — the workhorse. Inter Variable's variable axis allows smooth weight interpolation. Tracking tightens as size grows: -0.001em at 18px to -0.027em at 22px. The variable version enables the site's fluid micro-animations. Substitute: Inter (Google) is a near-identical fallback.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 10px, 12px, 14px, 15px, 16px, 18px, 22px
- **Line height:** 1.00, 1.20, 1.25, 1.30, 1.35, 1.40
- **Letter spacing:** -0.0400em at 10px, -0.0370em at 12px, -0.0270em at 22px, -0.0200em at 18px, -0.0100em at 14px, -0.0010em at 15px
- **OpenType features:** `"cv01", "cv05", "cv09", "cv11", "ss03", "ss07"`

### Inter — Static Inter for UI controls, buttons (500/600), and uppercase labels (700 at 9px). Used where variable weight isn't needed. The 20px/600/lh=1.2 heading style with -0.04em tracking provides a compact sub-heading tier below GT Walsheim displays.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9px, 10px, 12px, 13px, 14px, 16px, 20px
- **Line height:** 1.00, 1.20, 1.30, 1.40, 1.50, 1.60, 1.67
- **Letter spacing:** -0.0500em at 20px, -0.0400em at 20px, -0.0040em at 16px, 0.0200em at 12px, 0.0300em at 9px
- **OpenType features:** `"cv01", "cv05", "cv09", "cv11", "cv01", "cv05", "cv09", "cv11", "tnum", "cv01", "cv09", "tnum", "cv01", "cv09", "cv01", "cv03", "cv04", "cv09", "tnum", "zero", "blwf", "cv01", "cv05", "cv09", "cv11", "cv01", "cv09", "cv11", "tnum", "blwf", "cv01", "cv05", "cv06", "cv09", "cv11", "cv13"`

### Input Mono — Code snippets, monospace tags, and technical metadata — appears in product UI screenshots and code-context moments. The mono voice contrasts the geometric sans-serif to signal 'this is structural, not prose'.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400, 700
- **Sizes:** 12px
- **Line height:** 1.33, 1.40

### JetBrains Mono — Secondary monospace for code blocks — shares the developer-tool vocabulary with Input Mono but used in longer-form code contexts.
- **Substitute:** JetBrains Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.30
- **Letter spacing:** -0.0010em
- **OpenType features:** `"cv05", "cv11", "ss03", "ss07"`

### Inter Medium — Inter Medium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 12px, 16px
- **Line height:** 1.2
- **Letter spacing:** -0.012

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.444px |
| body-sm | — | — | 14px | 1 | -0.14px |
| body | — | — | 16px | 1.35 | -0.16px |
| subheading | — | — | 20px | 1.2 | -0.8px |
| body-lg | — | — | 22px | 1.4 | -0.594px |
| heading | — | — | 44px | 1.1 | -1.76px |
| heading-lg | — | — | 54px | 0.8 | -2.16px |
| display | — | — | 68px | 1 | -3.4px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 45px
- **Element gap:** 10px

### Border Radius

- **nav:** 15px
- **tags:** 9999px
- **cards:** 20px
- **icons:** 8px
- **inputs:** 8px
- **buttons:** 9999px
- **largeCards:** 25px
- **featureCards:** 15px

## Components

### Primary Pill Button
**Role:** Hero CTA — the only action that demands immediate attention

Black background (#000000), white text (#ffffff), 9999px radius (fully pill-shaped), 10px 14px padding, font-weight 500 at 12px. No border, no shadow. The pill geometry is deliberate — fully rounded ends signal approachability against the void canvas. Used for 'Get started for free' in the hero.

### Ghost Translucent Button
**Role:** Secondary action with low visual weight

Translucent white background (rgba(255, 255, 255, 0.15)), white text, 8px radius, 10px 14px padding. Reads as frosted glass over the black canvas — lets background show through. Used for 'See Framer sites' and similar secondary CTAs.

### Solid Filled Button
**Role:** Standard interactive button

White background (#ffffff), dark text, 8px radius, 10px 14px padding. The inverted version of the Ghost — solid white creates a flash of brightness in the dark layout. Used for navigation-adjacent actions.

### Dark Surface Button
**Role:** Tertiary button on dark surfaces

Obsidian background (#171717) at full opacity, subtle text, 8px radius. Reads as a recessed control — visually quieter than the white pill, stronger than ghost.

### Large Pill Button
**Role:** Oversized CTA for landing conversion

Black background, 9999px radius, generous 40px padding on all sides. The inflated pill shape creates a distinctive landing-page CTA — wider and taller than standard buttons, demanding focus. Used for hero conversion moments.

### Void Feature Card
**Role:** Large content card — product showcases, feature highlights

Pure black (#000000) background, 25px radius, 10px padding internally. No shadow, no border — the card disappears into the canvas and is defined only by its content and the gap between it and surrounding elements. Minimalist to the extreme.

### Graphite Feature Card
**Role:** Elevated card one step above void

#111111 background, 25px radius, 10px padding. Subtle elevation via luminance difference rather than shadow — the one-step lighter gray creates depth perception without breaking the flat aesthetic.

### Obsidian Content Card
**Role:** Mid-tier card for grouped content

#171717 background, 20px radius, 0px padding (content directly on surface). Used for tighter content groupings where the card itself is the container.

### Padded Showcase Card
**Role:** Feature card with breathing room

Black background, 15px radius, 45px horizontal padding (asymmetric — tight top/bottom, generous sides). The asymmetric padding creates a cinematic feel for product screenshots and feature explanations.

### Blue Accent Border
**Role:** Active state, highlight border, interactive emphasis

1px solid #0099ff border applied to cards, inputs, or interactive containers. The only chromatic border in the system — when something needs to glow, it gets this electric blue outline.

### Electric Glow Shadow
**Role:** Ambient glow for accent elements

rgba(0, 153, 255, 0.2) 0px 5px 5px 0px — the blue-tinted shadow that gives Electric Blue accents a halo effect. Applied sparingly to elements that need to feel 'switched on'.

### Community Feed Container
**Role:** Dark-window chrome for product UI embedding

Rounded-rectangle container simulating a desktop application window — dark (#171717) header bar with traffic-light dots (red, yellow, green circles), rounded 15px outer radius. Used to frame product screenshots of the community feed feature. The window chrome makes the embedded UI feel like a live application rather than a static mockup.

### Ghost Navigation Link
**Role:** Top-nav items — Product, Community, Resources, Enterprise, Pricing

Mist-colored (#999999) text at 12px sans-serif, no background, 4px row-gap between items. On hover transitions to white (#ffffff). The nav is quiet — it floats on the black canvas without claiming visual territory.

### Blue-Tinted Deep Surface
**Role:** Atmospheric background wash for accent sections

#002238 background — the only chromatic neutral in the system. Used as a background fill for sections that need to feel cool or atmospheric without introducing a strong accent color. Creates a subtle blue ambient temperature.

## Do's and Don'ts

### Do
- Use GT Walsheim Medium weight 500 at 44–68px for all display headings — never substitute a different geometric sans-serif for display type
- Set display headings with line-height 0.8–1.1 and letter-spacing -0.04em to -0.05em — the compression is signature
- Apply Electric Blue (#0099ff) exclusively as 1px borders, glows, and link accents — never as a filled surface in hero sections
- Use Vivid Violet (#0066ff) only for the primary CTA button background — it is the single filled chromatic button in the system
- Set all buttons and tags to 9999px border-radius — fully pill-shaped controls are non-negotiable
- Use card radii from the 15px → 20px → 25px scale — match radius to card importance, not to a single global value
- Keep section gaps at 80px and element gaps at 10px — the compact density with generous section breathing is intentional

### Don't
- Don't introduce additional accent colors beyond Electric Blue (#0099ff) and Vivid Violet (#0066ff) — the system is deliberately monochromatic with one accent
- Don't use #ffffff as a background fill for cards — white is reserved for text and primary CTAs, cards stay in the #111–#242424 range
- Don't apply box-shadows to standard cards — depth is communicated through luminance stepping (#000 → #111 → #171 → #242), not elevation
- Don't set body text below 12px — the minimum size protects readability against the dark canvas
- Don't use warm grays or chromatic neutrals — the palette is strictly cool/achromatic in its grays, with blue as the only chromatic direction
- Don't mix font families within a single text block — GT Walsheim for display, Inter for everything else, mono for code only
- Don't use border-radius values outside the defined scale (8, 15, 20, 25, 9999) — every radius in the system maps to a specific component type

## Elevation

- **Standard button:** `rgba(0, 0, 0, 0.2) 0px 2px 6px 0px`
- **Elevated card:** `rgba(0, 0, 0, 0.1) 0px 1px 2px 0px`
- **Floating element:** `rgba(0, 0, 0, 0.25) 0px 4px 8px 0px`
- **Blue accent glow:** `rgba(0, 153, 255, 0.2) 0px 5px 5px 0px`

## Surfaces

- **Void** (`#000000`) — Page canvas — the infinite black background
- **Graphite** (`#111111`) — Large feature cards and elevated panels one step above void
- **Obsidian** (`#171717`) — Mid-tier surfaces — content cards, button fills, window chrome
- **Iron** (`#1e1e1`) — Subtle intermediate surface for hover and pressed states
- **Slate** (`#242424`) — Input fields, elevated panels, highest standard surface
- **Midnight Tide** (`#002238`) — Atmospheric blue-tinted wash for accent sections and shadow tints

## Imagery

Product UI screenshots dominate — framed in simulated window chrome with traffic-light dots, the embedded app screenshots become the hero imagery. Logo wall for social proof uses white wordmarks on black with generous spacing. No photography, no illustration, no abstract graphics — the visual language is the product itself, displayed as live interface. Icon style: minimal, outlined, mono-white at small sizes. Density: text-dominant with occasional large product screenshot breaks. The visual space ratio heavily favors typography over imagery.

## Layout

Full-width sections that bleed edge-to-edge on the black canvas, with content constrained to ~1200px max-width centered within. Hero is a left-aligned headline + single CTA pill, with the right side left intentionally empty — asymmetric, not centered. Sections alternate between type-only layouts (large headline + sub-text) and product-screenshot showcases. The 'Shipped with Framer' section uses a logo wall in a 4-column grid. The community section frames a product screenshot in a centered max-width container with rounded window chrome. Navigation is minimal — a thin top bar with left logo and right-aligned links, no sticky behavior visible. Section rhythm: generous 80px vertical gaps between sections, creating distinct islands of content floating in the void.

## Similar Brands

- **Linear** — Same dark-canvas aesthetic with compressed geometric display type and a single accent color (Linear uses purple/violet where Framer uses blue) — both treat black as a design surface, not a mode
- **Vercel** — Monochrome dark interface with monochrome logo walls for social proof, generous typographic display headings, and product-as-marketing approach — though Vercel uses Geist Mono more heavily
- **Raycast** — Dark UI with blue accent glows, window-chrome framing for product screenshots, and compact density — Raycast's Store sections share Framer's black-canvas-plus-embedded-screenshot approach
- **Arc Browser** — Pill-shaped navigation elements, translucent ghost surfaces over dark canvas, and electric-blue accent borders for interactive emphasis
- **Figma** — Dark-mode product showcase pages with large compressed display headlines and product-screenshot-as-hero treatment, though Figma's palette is more varied
