# LaunchDarkly — Style Reference
> Neon control room — a dark cockpit where violet signals pulse through charcoal panels.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

LaunchDarkly is a midnight control room: deep charcoal canvas, cool violet-blue as the only chromatic voice, and white type that cuts through like console output. The interface is dense and technical without feeling cluttered — it borrows the visual language of developer tools (monospace code, panel grids, pill-shaped inputs) and wraps it in a confident marketing skin. The violet→blue gradient (#405bff → #7084ff) acts as the brand's electronic pulse, appearing in glows, hero text, active states, and decorative washes rather than flat fills. Components are pill-soft (30-60px radii dominate), borders are hairline-white on near-black, and elevation is communicated through glow rather than shadow.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Violet | `linear-gradient(179deg, #405bff 1.06%, #7084ff 123.42%)` | Hero text accent, link underlines, icon glows, decorative gradient endpoint — the brand's chromatic signature; used as paint, not fill; Hero ambient washes, card glow halos, decorative background floods |
| Voltage Blue | `#405bff` | Violet outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Midnight Ink | `#0e0e0e` | Page canvas, deepest background layer |
| Carbon | `#191919` | Surface level 1 — nav pill, card backgrounds, button fills, footer |
| Graphite | `#414042` | Surface level 2 — elevated panels, card borders, secondary surfaces |
| Steel | `#58595b` | Input borders, inactive form fields |
| Slate | `#6d6e71` | Muted helper text, disabled labels |
| Fog | `#a7a9ac` | Secondary text, subtle borders, placeholder copy |
| Ash | `#d1d3d4` | Tertiary text, icon strokes, list dividers |
| Paper | `#ffffff` | Primary text, heading fills, icon strokes, card backgrounds in product-screenshot panels |
| Smoke | `#2c2c2c` | List dividers, row separators in dense tables |
| Plasma Cyan | `#3dd6f5` | Secondary gradient endpoint — used sparingly in radial glows for atmospheric warmth |

## Typography

### bodyFont — bodyFont — detected in extracted data but not described by AI
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px, 20px, 22px, 24px, 26px, 28px, 32px, 36px, 40px, 66px, 84px, 85px, 100px, 125px
- **Line height:** 1, 1.09, 1.2, 1.3, 1.4, 1.5, 1.6, 1.71
- **Letter spacing:** 0.129, 0.167

### Sohne / custom grotesk — Primary interface and display typeface. Weight 500 dominates headings — heavier than typical marketing sites (400-600) but lighter than editorial displays (700-800), landing in a confident middle register. The largest sizes (84-125px) carry very tight line-height (1.0-1.09), letting headlines stack as a solid block of type. Letter-spacing opens up to 0.129-0.167em on small uppercase labels (eyebrows, tags) but stays normal on body and display.
- **Substitute:** Inter, Geist, Söhne (if licensed), or Space Grotesk
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 66, 84, 85, 100, 125
- **Line height:** 1.20, 1.30, 1.40, 1.50, 1.60

### Sohne Mono / JetBrains Mono — Code snippets, SDK names, technical labels. Normal letter-spacing, 1.50-1.65 line-height for readability. Appears in the hero email input and the 'Copy, paste, go.' code block.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Geist Mono
- **Weights:** 400
- **Sizes:** 14, 16, 20, 22
- **Line height:** 1.50, 1.65

### monoFont — monoFont — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px, 20px, 22px
- **Line height:** 1.09, 1.5, 1.65

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Helvetica — Helvetica — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.5
- **Letter spacing:** 0.007

### headingFont1 — headingFont1 — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 125px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.3 | — |
| heading | — | — | 36px | 1.2 | — |
| heading-lg | — | — | 66px | 1.09 | — |
| display | — | — | 100px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 32-48px
- **Element gap:** 16-24px

### Border Radius

- **tags:** 30px
- **cards:** 30px
- **inputs:** 10px
- **buttons:** 30px
- **navPill:** 60px

## Components

### Floating Nav Pill
**Role:** Primary site navigation

Centered floating pill at top of viewport, 60px radius, Carbon (#191919) fill, 1px white-alpha border. Contains: logo with arrow icon, nav links (Platform, Solutions, Resources, Developers, Pricing) with chevron dropdowns, Sign In text link, Sandbox text link, and Voltage Blue (#405bff) 'Get a demo' button. Sits 16-24px from viewport top with horizontal margin. No traditional header bar — the pill IS the header.

### Primary Action Button
**Role:** Main CTA

Voltage Blue (#405bff) fill, white text, 30px radius, 16px vertical × 24px horizontal padding. Used for 'Get a demo' in nav and 'Get started' in hero form. No border, no shadow — the saturated blue is enough presence.

### Hero Form Input
**Role:** Email capture

Large dark input with Carbon (#191919) fill, 10px radius, 1px subtle border. Internal layout: email field (white text, #58595b placeholder) fills left, Voltage Blue 'Get started' button fills right. The whole composite has a soft blue glow halo (rgba(64,91,255,0.25) box-shadow) making it feel like a glowing console. Approximately 600px wide, centered, with generous vertical padding (~16-20px).

### Segmented Tab Control
**Role:** Section navigation

Three-tab pill control (Release / Observe / Iterate) with 30px radius, Carbon fill, 1px border. Active tab indicated by a small Voltage Blue dot to the left of the label and brighter white text. Inactive tabs use Ash (#d1d3d4) text. Centered above a two-column section.

### Feature Checklist Item
**Role:** Section bullet list

Checkmark icon in Voltage Blue or white, followed by white text at ~16-18px. No background, no card. Vertical stack with 12-16px gap between items.

### Sub-feature Card
**Role:** Linked feature callout

Semi-transparent dark card with subtle violet/blue glow at edges, rounded 16-20px radius. Contains: small icon (blue or violet), white label text, right-arrow icon. Sits inside a larger section as a navigational sub-element.

### Product Screenshot Panel
**Role:** Embedded UI demonstration

Pure white (#ffffff) card with 12-20px radius and soft shadow, containing the actual LaunchDarkly product interface (pipeline configuration). Contrasts sharply with the dark page — the product UI is always shown as 'light' even on the dark marketing page, signaling that the real tool has its own bright workspace.

### Code Snippet Block
**Role:** SDK code example

Dark Carbon (#191919) panel with 12-16px radius, containing syntax-highlighted code. Language tabs (JavaScript / Python / iOS / React) at top in Ash text with active language in white. Code uses mono font at 14-16px with Dracula-inspired syntax colors (green strings, cyan keywords, pink literals). Copy button in top-right corner.

### SDK/Resource Card
**Role:** Linkable resource tile

Dark card (Carbon fill) with 1px white-alpha border, 20-30px radius, 32-40px padding. Contains: small icon top-left, white heading text (~18-20px weight 500), white subtext at 14-15px weight 400. Used in grids of 3 columns to link to Docs, Demo Project, Discord, etc.

### Logo Strip
**Role:** Social proof

Horizontal row of grayscale partner/customer logos (SpaceX, Tricentis, GoPro, Volvo, Ally, Priceline) at ~70% opacity, Ash or Fog tone. Logos are rendered in white-alpha on the dark background — no boxes, no borders, just quiet type marks.

### Hero Headline
**Role:** Primary page heading

Two-line display headline at 84-100px, weight 500, line-height 1.0-1.09. First line in white ('Move at AI speed.'), second line in Signal Violet ('Stay in control.'). The violet second line is the signature — the brand literally colorizes its differentiator. Letter-spacing tight (normal or slight negative).

### Ghost / Outlined Action
**Role:** Secondary CTA

Transparent fill with 1px Signal Violet (#7084ff) border, Signal Violet text, 30px radius. Used for secondary actions where the primary blue button already exists. The violet outline echoes the hero accent — secondary actions share the brand's signature hue rather than fading to neutral.

## Do's and Don'ts

### Do
- Use 30px radius for all buttons, tags, and cards — the pill-softness is non-negotiable for this brand
- Use 60px radius for the top navigation pill and any full-width pill containers
- Use Signal Violet (#7084ff) for the second half of hero headlines to split the message into 'what' (white) and 'why it matters' (violet)
- Render embedded product screenshots as pure white panels on the dark canvas — the contrast signals 'this is the real workspace'
- Use the #405bff → #7084ff linear gradient at 179deg for ambient glows behind cards and hero text
- Set body text at 16-18px weight 400, white on Carbon — never below 14px for readability on dark
- Use mono font for SDK names, code, and technical identifiers — the monospace voice is part of the developer-tool identity

### Don't
- Don't use square corners or small radii (4-8px) on user-facing components — they break the pill language
- Don't use drop shadows for elevation — use glow (rgba(64,91,255,0.25) or rgba(112,132,255,0.19)) instead to stay on-brand
- Don't introduce additional accent colors — the entire system is monochromatic-plus-violet; adding green, red, or yellow dilutes the signal
- Don't use white or gray for primary action buttons — Voltage Blue (#405bff) is the only correct fill for a main CTA
- Don't center-align body copy or feature lists — only headlines and hero blocks center; everything else is left-aligned
- Don't use 1.5+ line-height on display headlines — keep it tight (1.0-1.09) so the type stacks as a solid block
- Don't put dark product screenshots on the page — the real product UI is always bright/white, creating the page's key visual tension

## Elevation

- **Floating Nav Pill:** `0 4px 20px rgba(0, 0, 0, 0.45)`
- **Hero Form Input:** `0 0 40px rgba(64, 91, 255, 0.25)`

## Surfaces

- **Midnight Canvas** (`#0e0e0`) — Page background — the void beneath everything
- **Carbon Panel** (`#191919`) — Nav pill, footer, primary card surface
- **Graphite Edge** (`#414042`) — Card borders, elevated panel outlines, subtle separation on dark
- **Product White** (`#ffffff`) — Embedded product screenshots — the LaunchDarkly pipeline UI appears as a bright white card floating on the dark canvas

## Imagery

Imagery is sparse and functional. The primary visual content is embedded product UI screenshots — bright white panels showing the LaunchDarkly pipeline interface floating on the dark page. The hero has no photography or illustration; it relies on type, glow, and a large form input. Customer logos appear as a grayscale strip. The code-snippet section uses syntax-highlighted mono text as a visual element. There is no lifestyle photography, no abstract 3D, no decorative illustration — the brand's visual language is the product itself, the code, and the type.

## Layout

Full-bleed dark canvas with max-width 1200px content containers centered inside. The hero is a tall vertical block (80-100vh) with centered headline + subtext + form input stacked vertically with generous breathing room. Below the hero, sections alternate between two-column layouts (text-left / product-screenshot-right) and three-column card grids. The floating nav pill sits fixed at top center. Section gaps are large (80-120px) to let the dark canvas breathe between content blocks. Content rhythm: hero → logo strip → tabbed feature section (2-col) → code integration section (2-col) → resource card grid (3-col).

## Similar Brands

- **Linear** — Same dark-canvas + single-accent-glow approach; both treat the product UI itself as the hero visual, and both use pill-shaped inputs and tight type stacks.
- **Vercel** — Shares the monochrome dark palette with one chromatic accent, gradient-driven glow effects, and the practice of rendering product interfaces as bright white cards on a dark page.
- **Datadog** — Both use deep charcoal surfaces with violet/purple brand accents, and both embed real product dashboards (not mockups) as the primary visual proof.
- **Stripe** — Similar typographic confidence — large weight-500 display headlines, tight line-height, and the strategy of using color selectively on a subset of words in a headline for emphasis.
