# Neon — Style Reference
> Server Room After Dark. A deep black environment where data and interactions are the only sources of light.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design feels like a high-end server room after dark — a pure black void where information glows. A strict monochrome palette of pure black (#000000) and white (#ffffff) creates maximum contrast, ensuring text and UI are starkly legible. All visual energy comes from a single, electric green (#34d59a) that mimics terminal output and data visualizations, used exclusively for accents and decorative, code-like background graphics. The system achieves depth not with shadows but with subtle, layered near-black surfaces. A unique tension exists between the pill-shaped buttons and the sharp, 4px corners of all other UI containers.

## Colors

| Name | Value | Role |
|------|-------|------|
| Neon Glow | `#34d59a` | Key brand accent, active state indicators, data visualizations — injects a vibrant, code-like energy. |
| Neon Muted | `#285d49` | Subtle background tones in visualizations, less prominent brand elements. |
| Scanline Fade | `linear-gradient(90deg, rgba(57, 165, 125, 0.6) 50%, rgba(0, 0, 0, 0) 50%)` | Special effect for highlighting code or UI elements, mimicking a terminal scanline. |
| System Warning | `#ff3621` | Used sparingly for icons or highlights requiring urgent attention. |
| Whiteout | `#ffffff` | Primary text, primary CTA button backgrounds, icons. |
| Ash | `#797d86` | Secondary text, descriptive copy, inactive navigation links. |
| Pewter | `#94979` | Tertiary text, metadata, placeholder text. |
| Cloud | `#c9cbcf` | Hover states on dark elements, subtle highlights. |
| Graphite Light | `#303236` | Borders, dividers, subtle UI structure. |
| Graphite | `#242628` | Secondary surfaces floating on the background. |
| Graphite Deep | `#151617` | Card backgrounds, code block surfaces. |
| Depth | `#0a0a0b` | The darkest surface color before pure black, for subtle elevation. |
| Blackout | `#000000` | The absolute page background. |

## Typography

### Inter — Headlines and primary marketing copy. Its clean, neutral geometry provides high readability, contrasting with the more stylized monospaced font.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 10px, 12px, 13px, 14px, 15px, 16px, 18px, 20px, 24px, 28px, 32px, 40px, 44px, 48px, 60px, 80px
- **Line height:** 1.00, 1.13, 1.25, 1.38, 1.50
- **Letter spacing:** Tight negative tracking on all display and heading sizes (-3.2px at 80px, -1.2px at 48px), becoming normal at body copy sizes.

### GeistMono — Code snippets, UI labels, and data displays. Its monospaced form adds a technical, typewriter-like precision, reinforcing the developer-centric identity.
- **Substitute:** Fira Code, Source Code Pro
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 14px, 16px, 18px, 20px
- **Line height:** 1.00, 1.13, 1.38, 1.50, 1.65
- **Letter spacing:** Slight negative tracking enhances density in UI contexts (-0.7px at 14px, -0.43px at 16px).

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.7px |
| body-sm | — | — | 14px | 1.5 | -0.7px |
| body | — | — | 16px | 1.5 | -0.43px |
| subheading | — | — | 18px | 1.38 | -0.36px |
| heading-sm | — | — | 24px | 1.25 | -0.24px |
| heading | — | — | 32px | 1.25 | -0.64px |
| heading-lg | — | — | 48px | 1.13 | -1.2px |
| display | — | — | 80px | 1 | -3.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96-128px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 4px
- **inputs:** 4px
- **buttons:** 9999px
- **containers:** 4px

## Components

### Primary Pill Button
**Role:** The main call-to-action, e.g., 'Get started', 'Sign up'.

A pill-shaped button with a Whiteout (#ffffff) background and Graphite Deep (#151617) text. Uses Inter font. Padding is H: 28px, V: 12px. Radius is 9999px.

### Ghost Pill Button
**Role:** Secondary actions, e.g., 'Read the docs', 'Log in'.

A pill-shaped button with a transparent background, Whiteout (#ffffff) text, and a 1px solid border in Graphite Light (#303236). Uses Inter font. Padding is H: 18px, V: 12px. Radius is 9999px.

### Feature List Item
**Role:** Bulleted items in feature sections.

Whiteout (#ffffff) text using Inter. Preceded by a small dot or icon colored with Neon Glow (#34d59a).

### Navigation Link
**Role:** Links in the main site header.

Text in Ash (#797d86) using Inter font. On hover or active state, text becomes Whiteout (#ffffff).

### Tag Badge
**Role:** Small informational tags, like 'A DATABRICKS COMPANY'.

Small, all-caps text using GeistMono in Ash (#797d86) or a similar gray. Often preceded by a Neon Glow (#34d59a) icon or symbol.

### Announcement Bar
**Role:** A persistent top bar for site-wide announcements.

Full-width bar with a Blackout (#000000) background. Text uses Inter font in a legible color like Whiteout (#ffffff) or Neon Glow (#34d59a).

### Logo Bar
**Role:** A section displaying logos of partner or client companies.

A row of logos rendered in a monochrome Ash (#797d86) or Pewter (#94979e) color on a Blackout (#000000) background.

## Do's and Don'ts

### Do
- Use pure Blackout (#000000) for all main section backgrounds.
- Reserve Neon Glow (#34d59a) for interactive highlights, data visualizations, and small decorative accents only.
- Employ the Whiteout (#ffffff) pill button for all primary calls-to-action.
- Use GeistMono for all code snippets, terminal simulations, and compact UI labels.
- Apply tight negative letter-spacing (-1.2px or more) to all headlines 48px and larger.
- Achieve depth by layering near-black surfaces (e.g., #151617 on #000000), not with box-shadows.
- Maintain a strict dichotomy of shapes: 9999px radius for buttons, 4px for all other containers.

### Don't
- Don't use gradients or background colors on main page sections.
- Don't use traditional box-shadows for elevation.
- Don't use Neon Glow (#34d59a) for body copy or headlines.
- Don't use saturated colors other than the primary brand green and the occasional red alert accent.
- Don't mix Inter and GeistMono within the same sentence or headline.
- Don't use rounded corners larger than 4px on cards, code blocks, or input fields.
- Don't create buttons that aren't pill-shaped.

## Elevation

Elevation is achieved through layered, near-black surfaces, not traditional box-shadows. Surfaces like Graphite Deep (#151617) float on the pure Blackout (#000000) background, creating depth through contrast without relying on blurs. This reinforces a flat, digital-native aesthetic.

## Imagery

Visuals are exclusively abstract, generative graphics resembling data streams, server activity, or glitch art. Composed of thin vertical lines in Neon Glow (#34d59a) and other muted tones, they serve as atmospheric backdrops rather than informational content. Product visuals are limited to stylized screenshots of terminal windows and code blocks, treated as UI components. Photography and traditional illustrations are absent. This text-and-abstract-graphic approach creates a purely digital, code-native environment.

## Layout

The page structure is full-bleed black, creating an immersive, infinite canvas. A centered headline over an abstract data-viz graphic defines the hero. Below the hero, content is organized within a centered max-width container (approx. 1200px), creating focus. Sections flow seamlessly into one another without visual dividers, relying on generous vertical spacing (96-128px) to create rhythm. Content is arranged in simple, symmetrical layouts: centered stacks for headlines, two-column grids for feature lists, and multi-column grids for logos. A sticky header provides persistent navigation.

## Similar Brands

- **Vercel** — Identical developer focus with a black/white monochrome palette, single accent color, and use of Inter font.
- **Linear** — Shares a pristine, high-contrast dark UI, minimalist aesthetic, and sharp focus on typography.
- **GitHub** — Similar dark-mode theming, developer-centric tooling aesthetic, and heavy reliance on monospaced fonts for identity.
- **Replit** — Also uses a dark, code-focused environment with vibrant color accents to appeal to a developer audience.
