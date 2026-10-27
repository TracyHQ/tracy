# Liveblocks — Style Reference
> neon vapor trapped in obsidian

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Liveblocks runs on an obsidian-canvas logic: pure black backgrounds, a single clinical grotesque (Suisse) doing all typographic work, and color rationed to two narrow reserves — a vivid violet-magenta used as brand soul, and a broader neon palette (teal, electric blue, pink) that only ignites inside the product editor and code samples. The interface stays almost monastic — white type on black, hairline 1px borders, tiny 4px radii, no shadows, no gradients. Then a single dramatic magenta cloud texture erupts behind the hero product mockup, breaking the grid like ink dropped in water. Hand-drawn brush annotations float over screenshots, sketching human commentary onto the otherwise Swiss-precise system.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Canvas | `#000000` | Page background, hero backdrop, product mockup canvas |
| Obsidian Surface | `#111111` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Carbon Layer | `#141716` | Secondary surface level, nested panels, code editor background |
| Graphite Panel | `#21222b` | Product UI inner panels, inbox sidebar, tabbed editor frames |
| Ash Border | `#272626` | Hairline 1px borders on cards, inputs, dividers — the only visible separation in a no-shadow system |
| Steel Text | `#918d8d` | Muted body text, secondary labels, nav items, partner logo washes |
| Fog Text | `#a3a3a3` | Helper text, icon strokes, tertiary metadata |
| Smoke Divider | `#424242` | Deeper dividers, inactive tab underlines, icon outlines at rest |
| Bone Text | `#edecee` | Primary body text at 400 weight, the high-contrast default on void canvas |
| Pure Light | `#ffffff` | Headlines at full weight, button text on dark fills, emphasis runs |
| Plasma Violet | `#9f8dfc` | Primary brand accent — underlines, brand glow, active states, the signature chromatic note |
| Ultraviolet | `#bf7af0` | Secondary brand violet, code syntax keywords, badge fills, gradient partner with Plasma Violet |
| Wisteria | `#a667ff` | Deeper violet for hover states, brand gradients, emphasis borders |
| Ember Pink | `radial-gradient(60% 50%, #f76e99 0%, #c4356a 40%, #7a1a45 70%, #1a0508 100%)` | Red supporting accent for decorative details and low-frequency emphasis; The signature magenta smoke texture erupting behind the hero product mockup — radial wash from #f76e99 through pinks to deep crimson |
| Circuit Teal | `#00c1d6` | Code syntax strings, live cursors in multiplayer UI, data-viz highlights |
| Mint Pulse | `#6cefce` | Teal supporting accent for decorative details and low-frequency emphasis |
| Mint Whisper | `#70e1c8` | Softer teal for secondary presence states, comment thread highlights |
| Electric Blue | `#0090ff` | Code syntax types, link accents, comment thread timestamp markers |
| Sky Pulse | `#34a7ff` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Cloud Mist | `#ebf6ff` | Near-white blue tint used in shadow glows behind key elements |

## Typography

### Suisse Int'l — The sole interface typeface. All UI text, headings, nav, buttons, labels. 64px headlines use -0.02em tracking to tighten the Swiss grotesque rhythm; micro-text (10-12px) uses positive 0.01-0.025em tracking for legibility. The 1.0 line-height on display sizes is a signature choice — text feels compressed against the void.
- **Substitute:** Inter, GT America, or Neue Haas Grotesk
- **Weights:** 400, 500
- **Sizes:** 10, 11, 12, 14, 16, 20, 24, 32, 48, 52, 60, 64
- **Line height:** 1.00, 1.05, 1.10, 1.20, 1.25, 1.33, 1.38, 1.43, 1.50
- **Letter spacing:** Tightening: -0.02em at 48-64px, -0.01em at 24-32px. Loosening: 0.004-0.006em at 14-16px body, 0.01-0.025em at 10-12px micro.

### JetBrains Mono — Code blocks only. 14px body, 10px annotations. 0.025em positive tracking gives monospace text air without feeling scattered.
- **Substitute:** Fira Code, IBM Plex Mono, or Geist Mono
- **Weights:** 400, 500
- **Sizes:** 10, 14
- **Line height:** 1.00, 1.43
- **Letter spacing:** 0.025em across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 1 | 0.25px |
| caption | — | — | 12px | 1.38 | 0.12px |
| body-sm | — | — | 14px | 1.43 | 0.056px |
| body | — | — | 16px | 1.5 | 0.096px |
| subheading | — | — | 20px | 1.33 | -0.1px |
| heading-sm | — | — | 24px | 1.25 | -0.24px |
| heading | — | — | 32px | 1.2 | -0.32px |
| heading-lg | — | — | 48px | 1.1 | -0.96px |
| display | — | — | 64px | 1.05 | -1.28px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24-32px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 8px
- **pills:** 9999px
- **inputs:** 4px
- **modals:** 12px
- **buttons:** 4px

## Components

### Ghost Nav Button
**Role:** Top-right nav action (e.g. 'Get started')

Transparent background, 1px white border (#ffffff), white text at 14px Suisse 500, 4px radius, 8px 16px padding. The border is the only separator from the void canvas.

### Filled White Action Button
**Role:** Primary hero action (e.g. 'Get started for free')

Solid white (#ffffff) background, black (#000000) text at 14px Suisse 500, 4px radius, 12px 20px padding. The only fully filled button — used sparingly as the dominant call. High contrast against the void.

### Filled Dark Action Button
**Role:** Secondary section action (e.g. 'Read the docs')

Obsidian (#111111) background with 1px Ash Border (#272626), white text at 14px Suisse 500, 4px radius, 12px 20px padding. Reads as recessed into the canvas.

### Arrow Text Link
**Role:** Tertiary action (e.g. 'Contact sales →', 'Browse examples →')

No background, no border. White text at 14px Suisse 500 with a rightward arrow (→) suffix. Hover brightens text to pure white from #edecee.

### Announcement Badge
**Role:** Pill above hero headline (e.g. 'ANN 1.0 — The Age of Agent-Ready Software')

Transparent background with 1px Plasma Violet (#9f8dfc) border, violet text at 12px Suisse 500, 9999px radius (pill shape), 6px 14px padding. Includes a small right-arrow icon. The brand accent's only pill-format usage.

### Product Editor Panel
**Role:** The central product mockup (Document/Workflow/Sheet/Dashboard tabs)

Graphite Panel (#21222b) background with rounded 8px corners, inner tab bar with Obsidian (#111111) active tab, Ash Border (#272626) divider below tabs. Contains sidebar (Inbox) with row items at 32px height.

### Comment Thread Card
**Role:** Floating annotation cards in product mockup and feature sections

Pure white (#ffffff) background (inverted from system), black text, 8px radius, subtle 1px shadow or no shadow depending on context. Contains avatar + name + timestamp header, message body, reaction row.

### Code Block
**Role:** SDK/import code examples

Carbon Layer (#141716) background, 8px radius, 1px Ash Border. JetBrains Mono 14px/1.43. Syntax highlighting: keywords in Ultraviolet (#bf7af0), strings in Circuit Teal (#00c1d6), types in Electric Blue (#0090ff), comments in Steel (#918d8d). Line numbers in deep gray.

### Partner Logo Grid
**Role:** Social proof row below hero ('Trusted by...')

Centered label 'Trusted by leading engineering, product, and design teams' at 14px Steel Text. Below: 5-column grid of partner logos rendered in Fog Text (#a3a3a3) — all monochrome washes, no brand colors. Even Vercel's triangle and Cisco's bars are desaturated to steel.

### Hand-Drawn Annotation
**Role:** Script-style overlay labels on product mockups (e.g. 'Your app with Liveblocks', 'Multiplayer undo/redo', 'AI toolbar')

White brush-script font (not Suisse — a handwritten face like Caveat or a custom brush), 18-24px, with a thin curved arrow pointing to the feature. These are signature overlays that break the Swiss grid and add human commentary.

### Top Navigation Bar
**Role:** Sticky header across all pages

Void Canvas (#000000) background, no visible border, 64px height. Left: Liveblocks wordmark (white, 16px Suisse 500). Center: Product / Resources / Docs / Pricing in Steel Text. Right: 'Sign in' text link + Ghost Nav Button.

### Hero Cloud Backdrop
**Role:** Atmospheric background behind hero product mockup

A radial magenta-to-crimson cloud texture, centered behind the product UI frame. Creates the only organic, non-geometric element on the page. The product mockup floats over it with sharp 8px corners, creating a hard-edge vs. soft-cloud tension.

## Do's and Don'ts

### Do
- Use Void Canvas (#000000) as the base for all pages — never introduce a light section or gray canvas
- Reserve Plasma Violet (#9f8dfc) and Ultraviolet (#bf7af0) for brand moments: announcement pills, active states, brand glows — never as background fills
- Separate elements with 1px Ash Border (#272626) hairlines — the system rejects shadows as separation
- Use 4px radius for buttons and inputs, 8px for cards and panels — never exceed 12px
- Set headlines at Suisse 400 with -0.02em tracking at 48-64px — the tight grotesque rhythm is non-negotiable
- Let the neon accent palette (teal, electric blue, pink) appear only inside the product editor and code blocks — keep marketing surfaces monochrome
- Overlay hand-drawn brush annotations on product screenshots — they're the system's signature humanity layer

### Don't
- Don't introduce any chromatic CTA button fill — there is no purple/violet button; actions are white-filled or outlined-white
- Don't use box-shadows for elevation — the system separates surfaces with 1px borders and surface lightness steps, not shadows
- Don't round corners beyond 8px for standard components — the system is sharp and clinical, not soft
- Don't render partner logos in their original brand colors — desaturate everything to steel gray (#918d8d / #a3a3a3)
- Don't use color on body copy — text is Bone (#edecee) or white, never chromatic
- Don't add section background colors (no gray bands, no light sections) — the void must remain uninterrupted
- Don't substitute the handwritten annotation font with Suisse — the brush script is the intentional contrast point

## Elevation

The system intentionally rejects drop-shadows. Elevation is communicated through a four-step surface lightness scale (Void → Obsidian → Carbon → Graphite) combined with 1px hairline borders in Ash Border (#272626). The only shadow-like effect is a 1px inset white glow on a few buttons for focus state. This creates a flat, clinical, almost diagrammatic feel — every surface boundary is declared, never implied.

## Surfaces

- **Void Canvas** (`#000000`) — Page background, hero backdrop, full-bleed sections
- **Obsidian Surface** (`#111111`) — Elevated cards, nav bar, filled dark buttons, dropdown panels
- **Carbon Layer** (`#141716`) — Code editor background, secondary elevated panels
- **Graphite Panel** (`#21222b`) — Product UI inner panels, inbox sidebar, tabbed editor frames

## Imagery

Imagery strategy is split between two modes: (1) Full-bleed product mockup screenshots that dominate the hero and feature sections, rendered as sharp-cornered (8px) dark panels floating against a dramatic magenta cloud texture. These mockups are the heroes — no lifestyle photography, no abstract graphics. (2) Hand-drawn brush-script annotations overlay the mockups, with curved arrows pointing to features, creating a sketchbook critique feel. (3) Partner logos in the social proof row are uniformly desaturated to steel gray — no brand color leaks. Photography is absent entirely; the product UI IS the visual content.

## Similar Brands

- **Linear** — Same Swiss-grotesque-on-black clinical aesthetic, hairline 1px borders replacing shadows, tiny 4px radii, and a restrained accent palette used only for status/priority
- **Vercel** — Identical pure-black canvas, white grotesques with negative tracking, neon accent colors that ignite only inside code blocks and product surfaces
- **Cursor** — Dark-mode devtool with dramatic gradient/atmospheric backdrops behind product mockups, sharp-cornered UI panels floating over organic textures
- **Raycast** — Same obsidian-canvas approach with monospace accents, no-shadow separation philosophy, and a single brand accent color rationed across a monochrome system
