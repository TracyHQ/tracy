# Assurestor — Style Reference
> Electric terminal in a deep forest vault — lime phosphor on midnight olive.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Assurestor operates as a dark-mode command console: a deep forest-green canvas (#203400) swallows the viewport while a single electric lime (#bdff00) acts as the only signal of action or emphasis — like phosphor readouts on a military terminal. The custom "Denim Ink" typeface dominates with extreme size jumps (64→86→94px) and aggressive negative tracking, producing headlines that feel carved rather than written. Surfaces layer subtly within the green family (#1b2d00 cards, #335400 elevated panels) rather than introducing grays, keeping the system chromatically disciplined. Components stay lightweight: ghost outlines replace heavy fills, generous corner radii (32px cards, 9999px pills) soften the dark density, and lime is rationed to CTAs, active dots, and one large illustrative block.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Canopy | `#203400` | Primary page background, nav strip, footer canvas — the dominant surface that defines the entire brand atmosphere |
| Vault Floor | `#1b2d00` | Card surfaces, recessed panels, elevated content blocks within the forest canvas |
| Canopy Mid | `#335400` | Elevated card variant, highlighted surface tier above the base canvas |
| Lime Phosphor | `#bdff00` | Primary action buttons, active state indicators, illustrative highlight panels, brand-accent moments — the sole chromatic signal in the system |
| Moss Border | `#586740` | Hairline dividers, list separators, subtle table borders — barely-there green-on-green rules |
| Fern | `#73a303` | Secondary accent strokes, table emphasis borders, mid-saturation green used sparingly for variety within lime contexts |
| White | `#ffffff` | Body text, heading text, icon strokes, ghost button borders, link colors, input fields — the only neutral light tone in the palette |

## Typography

### Denim Ink — All interface text — from tiny labels to massive display headlines. The custom geometric face is the voice of the brand; weight 400 covers body and body-large, 600 for subheadings and emphasized inline, 700 reserved for the largest display moments. Extreme size jumps (40→64→86→94) create a poster-like hierarchy where the largest text dwarfs everything else on the page.
- **Substitute:** Space Grotesk, or Inter Tight as a fallback
- **Weights:** 400, 600, 700
- **Sizes:** 16px, 20px, 32px, 40px, 64px, 86px, 94px
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.045em at display (64–94px), -0.022em at heading (32–40px), -0.02em at body (16–20px)

### Courier New — Tiny monospaced labels (8px) for micro-annotations, likely near icons or status indicators. Ultra-tight tracking (-0.14em) at this size reads as a decorative tech-glitch element rather than readable text.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 8px
- **Line height:** 1.00
- **Letter spacing:** -0.14em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 16px | 1.5 | -0.32px |
| body | — | — | 20px | 1.5 | -0.4px |
| subheading | — | — | 32px | 1.2 | -0.7px |
| heading-sm | — | — | 40px | 1.1 | -0.88px |
| heading | — | — | 64px | 1 | -1.35px |
| display | — | — | 94px | 1 | -4.23px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 24px

### Border Radius

- **tags:** 12px
- **cards:** 32px
- **pills:** 9999px
- **buttons:** 16px
- **body-blocks:** 24px
- **alternate-button:** 20px

## Components

### Lime Primary Button
**Role:** High-emphasis action — booking calls, starting contact flows

Filled #bdff00 background, #1b2d00 or #203400 text, 16px radius, padding 18px 32px. Denim Ink weight 400–600 at 16–18px. The only fully filled button in the system — use sparingly as the lime is rationed.

### Ghost Outline Button
**Role:** Secondary action — press releases, read-more links, navigation

Transparent background, 1px #ffffff border, #ffffff text, 16px radius, padding 18px 32px. Denim Ink weight 400. The default button for anything that isn't the page's single primary action.

### Pill Navigation Link
**Role:** Top-nav items and supplementary action chips

9999px radius, small padding (~10px horizontal), Denim Ink weight 400, #ffffff text on transparent background. No border on default nav items; the Login button uses the same pill shape but with a white 1px border.

### Featured Lime Panel
**Role:** Decorative-content block — large visual moment with solid lime fill

#bdff00 background, 32px radius, padding 40px. Contains illustration or large graphic. This is how the brand deploys lime as a large surface (not just a button), creating a phosphor-screen effect against the dark canvas.

### Dark Content Card
**Role:** Section containers, content blocks, feature cards

#1b2d00 or #203400 background, 32px radius, padding 40px. No border, no shadow — the card separates from the page purely through the subtle dark-green shift between vault floor and forest canopy. Text inside is #ffffff at body sizes.

### Elevated Accent Card
**Role:** Highlighted variant for emphasis or hover/active states

#335400 background, 32px radius, 40px padding. One tier brighter than the base card, used to mark active or featured content within card grids.

### Hairline Divider
**Role:** Section separator, list rule, table border

1px line in #586740 (moss border) or white at low opacity. Very low contrast — these dividers whisper rather than announce, maintaining the calm dark atmosphere.

### Active Dot Indicator
**Role:** Status marker beside section labels ("NG Powered by HYCU", "360° Protection")

8px solid #bdff00 circle, sits inline before a caption or label. Functions as a section's 'armed' indicator — the lime dot says this area is live/important.

### Section Eyebrow Label
**Role:** Small green dot + tiny caption introducing each section

#bdff00 dot (8px) + Denim Ink 8–16px caption in #ffffff, tight tracking. Always paired vertically (dot above text). Acts as a section's identifier badge.

### Headline Block
**Role:** Hero and section headlines at display scale

Denim Ink weight 600–700, 64–94px, line-height 1.0, letter-spacing -0.045em. #ffffff color. These headlines are massive and aggressively tracked-tight; they read as architectural statements, not flowing prose.

### Ghost Input Field
**Role:** Form inputs, search fields, email capture

Transparent or #203400 background, 1px #ffffff border, 12–16px radius, Denim Ink 16px white text. Padding ~10px vertical. Placeholder text in muted white.

### CTA Card / Feature Card with Image
**Role:** Feature cards combining text and visual

#1b2d00 surface, 32px radius, two-column internal layout (text left 60%, image right 40%) or stacked. 40px internal padding. No shadow — surface separation comes from color tier shift only.

## Do's and Don'ts

### Do
- Use #bdff00 lime as the ONLY filled action color in the system; never substitute another hue for primary CTAs.
- Set headlines at 64–94px with Denim Ink weight 600–700 and -0.045em tracking — the extreme size and tight tracking is the brand's visual signature.
- Maintain the monochromatic green discipline: layer surfaces using #1b2d00 → #203400 → #335400, never introduce gray neutrals.
- Use 32px radius for all cards and 16px radius for all buttons; pill shapes (9999px) are reserved for nav items and tag chips.
- Place an 8px lime dot before every section eyebrow label — it is the brand's 'live signal' indicator.
- Keep body text in Denim Ink weight 400 at 16–20px, #ffffff, with line-height 1.5 and -0.02em tracking.
- Allow sections to breathe with 80px vertical gaps and full-width dark bands — density comes from content, not from tight spacing.

### Don't
- Never use #bdff00 as a large background outside of one featured decorative panel per page — rationing lime is what makes it feel like a signal.
- Do not introduce drop shadows for elevation; the system separates layers through color tier shifts, not shadow depth.
- Do not use gray (#808080, #999, etc.) for any UI element — the palette is green-monochrome plus white and lime only.
- Never set body text below 16px except for the 8px Courier New micro-labels — legibility is non-negotiable.
- Do not mix multiple accent greens (#73a303, #586740) into the same component — one accent per surface keeps the hierarchy clean.
- Do not add gradients — the design relies on flat color blocks for its terminal/phosphor aesthetic.
- Do not use heavy font weights below 32px — Denim Ink at weight 700 in body sizes destroys readability; reserve 700 for display moments only.

## Surfaces

- **Forest Canopy** (`#203400`) — Base page background — the dominant canvas filling all viewports
- **Vault Floor** (`#1b2d00`) — Card surfaces and recessed content blocks, one tier deeper than the canvas
- **Canopy Mid** (`#335400`) — Elevated or active card states, highlighted content tiers
- **Lime Phosphor** (`#bdff00`) — Featured decorative panel and primary action surface — the sole bright signal

## Imagery

Minimal illustrative photography; the brand favors flat lime-green geometric illustrations (hourglass, concentric circles) rendered in pixelated/dot-matrix style that echoes the phosphor-terminal aesthetic. Imagery is always contained within rounded-corner panels (32px radius), never full-bleed. No lifestyle photography, no people — the visual language is abstract-tech and object-focused. The only color used in illustrations is lime (#bdff00) as line-art on the dark canvas, or as a full solid-lime panel with white/green content inside. Icon style is line-based, thin stroke, monochromatic white or lime.

## Layout

Full-bleed dark canvas with a centered max-width content column (~1280px). Navigation is a slim top bar with logo left, nav center, login + lime CTA right. Hero is a two-column split: text block (60%) left with headline + subtext + 2–3 buttons, decorative illustration (40%) right. Subsequent sections alternate between text-left/visual-right two-column layouts and full-width centered headline stacks. A horizontal hairline divider separates major sections. Section rhythm is spacious: 80px vertical gaps between bands, each section introduced by a lime-dot eyebrow label. Card grids are not used heavily — content prefers single-column or two-column arrangements. No sidebar; no mega-menu. The overall page flows like vertical terminal output — section by section, each with its own green-dot identifier.

## Similar Brands

- **Pinecone** — Dark-mode developer platform with deep-green-to-near-black background and a single electric green accent for actions and data highlights
- **Vercel** — Extreme typographic hierarchy with massive display headlines on a dark canvas, and the discipline of one accent color used as signal
- **Retool** — Dense product UI with comfortable spacing, pill-shaped nav, and ghost outline buttons as the default interaction
- **Linear** — Dark interface with precise typography, generous corner radii on cards, and a disciplined monochromatic palette accented by a single vibrant color
