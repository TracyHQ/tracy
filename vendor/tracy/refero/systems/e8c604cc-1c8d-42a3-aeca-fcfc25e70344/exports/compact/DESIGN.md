# Astro — Style Reference
> Deep space mission control with a single purple nebula glow

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Astro speaks in the language of a cosmic command bridge: near-black canvas, a single signature purple-magenta nebula gradient that blooms from the hero, and white display type that reads like mission copy. The system is overwhelmingly achromatic — 4% colorfulness — so every chromatic pixel is doing real work: a mint-aqua syntax highlight, a violet link, a sky-blue inline chip. Components are geometric and confident: pill-shaped interactive controls at 9999px radius, 16px cards, 8px chips, and thin hairline borders at 8% opacity rather than colored dividers. The custom display face 'Obviously' does the heavy lifting with its wide, open apertures and quirky alternates (salt, ss06, ss11) that give headlines a friendly, slightly retrofuturist swagger against the dark void.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Canvas | `#1f232e` | Primary page background — the base layer for hero, sections, and footer. Slight cool-blue undertone, never pure black, so colored elements feel like they're floating in space rather than printed on paper |
| Abyss | `#0c0f19` | Deeper surface level for elevated cards, code blocks, and inset wells. One step darker than the canvas to create depth without using shadows |
| Singularity | `#060913` | Darkest surface for terminal windows, CLI boxes, and high-contrast containers. Almost pure black with a blue whisper |
| Carbon | `#17191e` | Mid-elevation card surface, sitting between canvas and abyss. Used for theme preview tiles and nested cards |
| Lunar White | `#f2f6fa` | Primary text and high-contrast foreground. The slightly cool tint keeps it from feeling clinical against the dark canvas |
| Platinum | `#e5e7eb` | Secondary text, icon strokes, and light dividers. Most-used achromatic token for hairline borders and muted foregrounds |
| Mist | `#bfc1c9` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Steel | `#858b98` | Muted body text and subdued descriptions. The default for paragraphs that should recede behind headlines |
| Gunmetal | `#545864` | Hairline borders and dividers on the dark canvas. Low contrast on purpose — structural, not decorative |
| Nebula Gradient | `linear-gradient(83.21deg, rgb(50, 69, 255), rgb(184, 69, 237))` | Primary brand gradient stop — the blue origin of the hero nebula and the color of highlighted CTAs and accent rings |
| Plasma Gradient | `linear-gradient(66.77deg, rgb(216, 51, 51), rgb(240, 65, 255))` | Secondary gradient (red-to-magenta) used sparingly for illustration accents and decorative energy bands |
| Aurora Mint | `#4bf3c8` | Teal supporting accent for decorative details and low-frequency emphasis |
| Plasma Blue | `#54b9ff` | Blue supporting accent for decorative details and low-frequency emphasis |
| Ultraviolet | `#acafff` | Code keywords, violet link variant, and decorative highlight. A desaturated violet that complements the nebula gradient without competing |
| Electric Cyan | `#00daef` | Secondary syntax token — reserved for specific code contexts and rare accent strokes |
| Amber | `#ffd493` | Yellow supporting accent for decorative details and low-frequency emphasis |
| Signal Blue | `#61dafb` | Decorative dot and badge accent — used for version pills and notification indicators |

## Typography

### ui-sans-serif — Body and UI text — system stack fallback. Weight 400 for body copy, 500/600 for button labels and nav, 700 for subheadings. Line-height 1.65 at 14px keeps dense UI readable without feeling airy.
- **Substitute:** Inter, system-ui
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 14px, 16px, 20px
- **Line height:** 1.40, 1.50, 1.65, 1.81
- **Letter spacing:** normal
- **OpenType features:** `"calt", "zero"`

### Obviously — Display and headline face — the custom workhorse. Weight 300/400 used for the largest headlines, 700 for the hero. The cv09 and salt alternates give it a distinctive wide, slightly retro character; ss06 and ss11 add quirky details. No web-safe substitute captures the feel — Inter Black or Space Grotesk Bold approximate it.
- **Substitute:** Space Grotesk, Inter
- **Weights:** 300, 400, 700
- **Sizes:** 20px, 30px, 36px, 48px
- **Line height:** 1.10, 1.11, 1.20, 1.40
- **Letter spacing:** normal
- **OpenType features:** `"calt", "cv09", "liga", "salt", "ss06", "ss11"`

### ui-monospace — Code blocks, terminal commands, and inline code. Fixed 14px with generous 1.65 line-height for readability of multi-line snippets.
- **Substitute:** JetBrains Mono, Fira Code
- **Weights:** 300, 400
- **Sizes:** 14px
- **Line height:** 1.65
- **OpenType features:** `"calt", "zero"`

### MDIO — Icon and badge face — used at 12-16px with widened tracking (0.0250em) for small labels and version chips. The slight letter-spacing and geometric forms give badges a technical, instrument-panel feel.
- **Substitute:** Space Mono, IBM Plex Mono
- **Weights:** 300, 400
- **Sizes:** 12px, 16px
- **Line height:** 1.00, 1.33, 1.50
- **Letter spacing:** 0.0250em
- **OpenType features:** `"calt", "zero"`

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 200, 400
- **Sizes:** 16px, 18px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.3px |
| body-sm | — | — | 14px | 1.65 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 30px | 1.2 | — |
| heading | — | — | 36px | 1.11 | — |
| display | — | — | 48px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 8px
- **cards:** 16px
- **chips:** 9999px
- **images:** 12px
- **buttons:** 9999px

## Components

### Primary Pill Button
**Role:** Main call-to-action (e.g., 'Get Started')

Full pill shape at 9999px radius, background #ffffff, text #1f232 at 16px weight 600, padding 12px 24px. High contrast inverted style — white on dark. No border. The inversion (white bg, dark text) is the system's signature CTA pattern.

### Terminal Command Box
**Role:** CLI install command display

Background #060913 with 1px border at #1f232, 8px radius, padding 12px 16px. Contains monospace 14px text in #f2f6fa with a copy icon at right. Rounded corners are soft, not pill — the box should feel like a terminal window embedded in the page.

### Version Badge
**Role:** Release announcement pill (e.g., 'Astro 6.1')

Inline pill at 9999px radius, background #1f232 with 1px border #2c303b, padding 4px 12px. Text in #f2f6fa at 14px weight 500. Optionally preceded by a colored dot (Signal Blue #61dafb). Compact, instrument-panel aesthetic.

### Feature Icon Circle
**Role:** Icon container in feature columns

48px circle with 1px colored border (blue, pink, or amber), transparent background. Contains a small inline icon. The colored border is the only color in the feature row — makes the icon feel like a charged node.

### Theme Preview Card
**Role:** Showcase tile for theme marketplace

16px radius, background #17191, 1px border #1f232e. Internal image fills at 12px radius. Padding 0 (image bleeds to edges). Title and metadata appear below the image, not overlaid. The card sits on the void canvas with a barely-there border.

### Filter Tab Pill
**Role:** Category filter for grids (e.g., 'Trending', 'E-Commerce')

9999px radius, two states: active = background #1f232 + border #2c303b + white text; inactive = transparent + border transparent + #858b98 text. Padding 8px 16px, text 14px weight 500. Active state uses the border as the only visual differentiator.

### Logo Cloud Item
**Role:** Customer/partner logo display

Inverted to white (#f2f6fa) on the dark canvas. No container or border — logos float directly on the background. Sized to a consistent visual weight (~24-32px height). Arranged in a single row or two-row wrap.

### Section Header
**Role:** Eyebrow label + headline + description block

Eyebrow at 14px weight 600 in a chromatic accent (violet #acafff, teal #4bf3c8, or blue #54b9ff). Headline in Obviously 36px weight 300-400 in #f2f6fa. Description in body 16px weight 400 in #858b98. The colored eyebrow is the only chromatic punctuation in the section.

### Navigation Bar
**Role:** Top-level site navigation

Transparent background, sits on the void canvas. Logo (Astro mark) left, nav links center-right, GitHub icon far right. Nav text in #f2f6fa at 14px weight 500. No border or shadow — the nav is position-relative and disappears into the canvas.

### Hero Gradient Backdrop
**Role:** Atmospheric background glow behind hero content

Radial gradient blooming from center-top, combining the nebula blue (#3245ff at 30% opacity) blending into the void canvas (#1f232e). The gradient is positioned above the text layer with mix-blend-mode for a soft cosmic glow effect. No hard edges.

### Stats Bar
**Role:** Performance metric display (e.g., '% of real-world sites with good Core Web Vitals')

Horizontal bar chart on a #060913 background with 1px #1f232 border, 8px radius. Bars in the brand gradient (#3245ff → #b845ed). Label in 14px monospace, value in 16px weight 600 #f2f6fa.

## Do's and Don'ts

### Do
- Use 9999px radius for all interactive elements (buttons, tabs, badges, chips)
- Set the primary CTA to white background (#ffffff) with dark text (#1f232e) — inversion is the system's signature action pattern
- Use the nebula gradient (linear-gradient(83.21deg, #3245ff, #b845ed)) only for hero atmospheric backdrops and stat bars — never for buttons or cards
- Set section eyebrows (14px weight 600) in chromatic accent colors (#4bf3c8, #acafff, #54b9ff) to create the only color punctuation in each section
- Use Obviously at weight 300-400 for headlines to keep the voice whisper-confident rather than shouty
- Maintain 4px base unit for all spacing — element gaps at 8px or 16px, section gaps at 80px
- Place colored borders (1px) on circular icon containers in feature columns using Aurora Mint, Plasma Blue, or Amber

### Don't
- Don't use drop shadows for elevation — the system relies on 1px borders in slightly lighter dark shades
- Don't apply the nebula gradient to text — it destroys legibility against the dark canvas
- Don't use chromatic colors for large background fills — they break the cosmic void atmosphere
- Don't use radius values between 12px and 16px on cards — the system snaps to 8px, 12px, or 16px
- Don't set body text below 14px or above 18px — the type scale is tight to maintain the instrument-panel density
- Don't use obviously > 700 for headlines — the weight 300-400 range is the signature restraint
- Don't add decorative icons inside buttons — pills should be text-only or text + chevron

## Elevation

- **Theme Preview Card:** `0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(31, 35, 46, 1)`
- **Terminal Command Box:** `inset 0 0 0 1px #1f232`

## Surfaces

- **Void Canvas** (`#1f232`) — Page background — the deep space floor
- **Carbon Card** (`#17191`) — Elevated card and panel surfaces
- **Abyss Well** (`#0c0f19`) — Inset wells, terminal boxes, and nested containers
- **Singularity** (`#060913`) — Deepest surface for high-contrast CLI and code blocks

## Imagery

Imagery is minimal and functional: the hero relies on a single purple-magenta radial gradient glow with no photographic content. The rest of the site uses product screenshots (theme previews, terminal windows) contained within rounded card frames. The only photographic-style visuals are customer logos in the trust strip, rendered in white monochrome. No lifestyle photography, no abstract illustrations, no 3D renders — the void canvas is the visual statement. When illustrations appear (feature icons, decorative elements), they are flat, single-color line icons or small geometric shapes in the chromatic accent palette.

## Layout

Full-width dark canvas with content constrained to 1200px max-width, centered. Hero is a centered stack: badge → headline → subhead → primary CTA → terminal box → logo cloud, with the nebula gradient blooming behind the headline. Sections alternate between full-bleed dark bands with no dividers, creating a seamless vertical flow. Feature sections use a 3-column grid for icon+text blocks. Content sections use 2-column text-left/visual-right or centered text-over-grid patterns. Theme showcase uses a 3-column card grid with 24px gaps. Navigation is a single transparent top bar with no sticky behavior. Vertical rhythm is maintained at 80px between major sections, with 32px between sub-blocks within a section.

## Similar Brands

- **Vercel** — Same dark cosmic canvas with a single brand-gradient hero glow, wide display type, and pill-shaped CTAs centered in a vertical stack
- **Linear** — Near-black background, hairline border elevation strategy, and geometric sans-serif headlines — the 'devtools dark void' language
- **Svelte** — Similar developer-framework landing page structure with centered hero, terminal command box, and logo cloud trust strip on dark background
- **GitHub** — Dark mode with achromatic palette, monospace code accents, and the same instrument-panel badge/tab aesthetic
