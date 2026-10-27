# Windsurf — Style Reference
> Midnight aurora command center — a deep navy terminal where a single mint teal action glows and a chromatic ribbon is the only permitted spectacle.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Windsurf's visual system is a midnight IDE that walked out into a marketing site: deep navy canvas (#011c42) with one bioluminescent teal accent (#34e8bb) that makes every action glow against the dark. Display headlines use tomatoGrotesk at weight 300 — size does the heavy lifting while weight stays whisper-thin, an anti-convention choice that creates authority through restraint. An aurora ribbon (blue→purple→pink gradient) sweeps across the hero as the sole moment of color spectacle; everywhere else the palette stays disciplined. Components lean pill-shaped (9999px) for actions and gently squared (6px) for cards, with shadows used sparingly because contrast on the dark canvas already creates depth.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Navy | `#011c42` | Page background, section canvas, footer — the dominant surface that gives the entire site its terminal-like confidence |
| Canvas White | `#ffffff` | Primary text on dark surfaces, icon strokes, card text in light contexts |
| Obsidian | `#0b100f` | Near-black text for light-context sections, logo mark, high-contrast headings |
| Warm Sand | `#f8f1e5` | Secondary text on dark surfaces, warm accent surface, card borders in light contexts — adds cream warmth that prevents the dark UI from feeling sterile |
| Silver Mist | `#c0c1c6` | Hairline borders, dividers, subtle separator strokes — the dominant neutral structural line (5200+ occurrences) |
| Pewter | `#c5beb2` | Box-shadow tone, muted accents on cream surfaces |
| Bioluminescent Teal | `#34e8bb` | Primary action — filled CTA buttons (Download), in-text links, nav accent, active states. The single chromatic color permitted to carry interactive meaning; glows against midnight navy |
| Deep Teal | `#003326` | Text on teal surfaces, dark-mode button color variant |
| Lavender Mist | `#a95af8` | Card backgrounds, feature card fills, decorative chip backgrounds — provides purple dimension in card grids |
| Bubblegum | `#fb9ce5` | Outlined/ghost action borders, accent text, icon fills, pill button outlines — the secondary accent that complements teal in interactive components |
| Plum Wine | `#43045e` | Deep purple card surface variant, layered card backgrounds |
| Soft Blush | `#ffccf3` | Light pink card backgrounds, soft accent surface |
| Cosmic Blue | `#006aff` | Card accent fills, decorative stroke accent |
| Plum Statement | `#5c0047` | Magenta text and headings in accent contexts, feature highlight copy |

## Typography

### tomatoGrotesk — Display headlines only. The weight 300 at 64-96px is the signature choice — most marketing sites use 600-700 for display; this system lets size carry authority and keeps weight whisper-thin. Used for hero ('Where developers are doing their best work'), section titles ('Cascade', 'Devin'), and feature headings.
- **Substitute:** Inter (weight 300) or Söhne Breit
- **Weights:** 300, 400, 500
- **Sizes:** 40px, 48px, 64px, 72px, 96px
- **Line height:** 1.00
- **Letter spacing:** -1.08px at 40px, -0.576px at 48px, -0.576px at 64px, -0.864px at 96px

### DM Sans — Body text, subheadings, navigation, buttons, list items, card content. The workhorse font — comfortable geometric sans with moderate negative tracking that tightens the feel without sacrificing readability.
- **Substitute:** Inter or Söhne
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 14px, 16px, 18px, 20px, 28px, 40px
- **Line height:** 1.00, 1.30, 1.33, 1.50, 1.56, 1.71, 2.40
- **Letter spacing:** -0.45px at 10px, -0.26px at 12px, -0.31px at 14px, -0.34px at 16px, -0.36px at 18px, -0.4px at 20px, -0.56px at 28px, -0.8px at 40px

### DM Mono — Code-adjacent labels, BETA badges, nav micro-text, technical annotations. The monospace signals 'developer tool' — its 0.05em positive tracking on caps reads as technical/precise, a deliberate contrast to the whisper-thin display weight.
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 18px
- **Line height:** 1.20, 1.43, 1.56, 1.71
- **Letter spacing:** 0.6px at 12px, 0.7px at 14px (0.05em positive tracking for uppercase usage)

### ui-sans-serif — System fallback for browser-default rendering and any text not covered by the primary fonts. Sparse usage — the custom fonts carry the brand.
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.43, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.3 | 0.5px |
| body | — | — | 16px | 1.56 | -0.34px |
| body-lg | — | — | 18px | 1.71 | -0.38px |
| subheading | — | — | 20px | 1.5 | -0.42px |
| heading-sm | — | — | 28px | 1.33 | -0.56px |
| heading | — | — | 40px | 1.3 | -0.8px |
| heading-lg | — | — | 48px | 1 | -0.58px |
| display | — | — | 72px | 1 | -0.65px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **cards:** 6px
- **badges:** 9999px
- **inputs:** 6px
- **buttons:** 9999px

## Components

### Primary CTA Button (Pill)
**Role:** Main download / conversion action in hero and nav

Filled teal (#34e8bb) background, deep teal (#003326) text, 9999px border-radius, 12px 24px padding, DM Sans weight 600 at 16px. Carries a 0px 4px 16px rgba(0,0,0,0.22) box-shadow for lift. The only filled chromatic button — instantly identifiable as the primary action across the entire site.

### Secondary Ghost Button (Pill)
**Role:** Secondary action paired with primary CTA

Transparent or near-transparent background with #ffffff text and a subtle white-on-navy border, 9999px radius, 12px 24px padding, DM Sans weight 500. Sits beside the teal Download button as a lower-commitment option.

### In-Text Action Link
**Role:** Inline section links like 'EXPLORE THE FEATURES →' and 'LEARN ABOUT DEVIN →'

Bioluminescent teal (#34e8bb) color, DM Sans weight 500 at 12-14px, uppercase, 0.05em letter-spacing, trailing arrow glyph. The wide tracking + teal is the signature pattern for scroll/navigation cues in body copy.

### Feature Badge (BETA Tag)
**Role:** Release announcement badge above hero headline

Subtle surface background with a small dot icon and text. DM Mono at 12px, uppercase, 0.05em tracking. Pill-shaped at 9999px radius. Sits as a compact pre-headline annotation, not a call-to-action.

### Top Navigation Bar
**Role:** Primary site navigation with logo, menu items, user icon, and persistent download CTA

Transparent or matching midnight navy background. Logo left, center menu with dropdown indicators, user icon in a thin circle outline (32px), and a teal Download pill button right. 12px DM Sans menu items, 6px gap between items.

### Hero Headline Block
**Role:** Primary page headline with supporting badge and dual CTAs

BETA badge → tomatoGrotesk weight 300 at 64-72px, white (#ffffff), letter-spacing -0.65px. Two-line layout, left-aligned. Subtitle in DM Sans 18px weight 400 at 1.71 line-height in #ffffff or warm sand. Paired CTA row: teal primary + ghost secondary, 12px gap between them.

### Section Heading Block
**Role:** Feature section titles like 'Cascade' and 'Devin'

Centered layout. Eyebrow link in teal DM Sans 12px uppercase (0.05em tracking). tomatoGrotesk weight 300 at 48-64px, white, centered. Description paragraph in DM Sans 16px at 1.56 line-height, max-width ~640px.

### Two-Column Feature Row
**Role:** Below-section content layout (left heading / right description + link)

Thin silver (#c0c1c6) horizontal divider on top at 1px. Two columns at roughly 1:1 ratio with 32px gap. Left: tomatoGrotesk weight 400 at 28-40px heading. Right: DM Sans body copy with teal in-text action link below.

### Client Logo Strip
**Role:** Social proof band of trusted-by logos

Horizontal row of grayscale corporate logos (Cisco, Mercado Libre, Dell, VMware, etc.), evenly spaced, white or light gray on midnight navy. Logos sit at uniform height (~28-32px) with consistent vertical alignment. No card backgrounds or dividers between them.

### Aurora Ribbon Decoration
**Role:** Hero decorative element — the signature visual spectacle

Flowing wave/ribbon SVG on the right side of the hero. Gradient transitions through blue → purple → pink (#006aff → #a95af8 → #fb9ce5). Partial opacity where it exits the frame. Anchored right, extends beyond viewport.

### Product Preview Surface
**Role:** Placeholder for product screenshots/visuals in feature sections

Rounded rectangle (6px) in a slightly lighter navy than the canvas, containing product imagery. Functions as a 'window' into the IDE. Should feel embedded in the page, not floating.

## Do's and Don'ts

### Do
- Set every page and section background to #011c42 (Midnight Navy) — the dark canvas is the brand identity
- Use #34e8bb (Bioluminescent Teal) exclusively for primary actions and in-text navigation links — it is the only chromatic color permitted to carry interactive meaning
- Set all display headlines to tomatoGrotesk at weight 300 — let the size (48-96px) carry authority, never the weight
- Use 9999px border-radius for all buttons, badges, and tags — the pill shape is the signature button form
- Use 6px border-radius for cards, inputs, and product preview surfaces
- Apply the aurora ribbon (blue→purple→pink gradient flow) as the sole moment of color spectacle in hero/feature sections
- Set body text to DM Sans at 16px / 1.56 line-height with -0.34px letter-spacing for comfortable reading density

### Don't
- Never use weight 600+ for display headlines — the whisper-thin 300 is the signature choice; bold display would betray the system
- Never add multiple chromatic accent colors to a single component — the palette is disciplined: teal for action, everything else is neutral or surface
- Never use a white or light-gray page background — the dark canvas is the brand; light sections would feel like a different site
- Never apply heavy drop shadows (opacity > 0.25) to most elements — depth comes from contrast on dark, not from elevation stacks
- Never use square (0px) or large (>12px) border-radius on buttons — pill (9999px) is the only correct button radius
- Never use system fonts for display — tomatoGrotesk (or its substitute) is required for headlines; the geometric character is load-bearing
- Never put the aurora gradient on buttons, text, or interactive elements — it is decorative-only, confined to hero ribbons and large background art

## Elevation

- **Primary CTA Button:** `rgba(0, 0, 0, 0.22) 0px 4px 16px 0px, rgba(0, 0, 0, 0.14) 0px 1px 3px 0px`
- **Elevated Card / Overlay:** `rgba(0, 0, 0, 0.2) 0px 10px 15px -3px, rgba(0, 0, 0, 0.2) 0px 4px 6px -4px`
- **Standard Card:** `rgba(0, 0, 0, 0.2) 0px 4px 6px -1px, rgba(0, 0, 0, 0.2) 0px 2px 4px -2px`

## Surfaces

- **Midnight Canvas** (`#011c42`) — Full-bleed page background — every section sits on this navy
- **Lifted Navy** (`#14376`) — Gradient endpoint for elevated sections and hero background transition
- **Cream Surface** (`#f8f1e5`) — Warm card surface, light-context section alternative
- **Accent Card** (`#a95af8`) — Colored card backgrounds for feature highlights

## Imagery

The site uses no photography. Visual language is built from three sources: (1) a flowing aurora ribbon — an SVG gradient wave transitioning blue → purple → pink that sweeps across the hero and lower sections, the sole moment of color spectacle; (2) a grayscale client logo strip (Cisco, Dell, VMware, etc.) for social proof, rendered flat at uniform height with no card backgrounds; (3) product preview surfaces — rounded rectangles in slightly lifted navy that act as windows into the IDE, to be filled with actual product screenshots. The brand mark ('W' for Windsurf) is a simple geometric wind/leaf glyph in white. Icons throughout are line-based, thin-stroke (1-1.5px), monochrome white or teal. The visual density is text-dominant: imagery occupies <15% of any screen, with the aurora ribbon doing the heavy atmospheric lifting.

## Layout

Full-bleed dark sections, max-width 1280px for content containers. The hero is a split composition: large left-aligned headline (tomatoGrotesk 72px weight 300) with badge → headline → dual CTAs → micro-bullet text, balanced against a decorative aurora ribbon anchored to the right edge that extends beyond the viewport. Navigation is a transparent top bar with logo left, centered menu, user-icon + teal Download pill right. A grayscale client logo strip sits as a horizontal band between the hero and first feature. Feature sections follow a consistent vertical rhythm: eyebrow teal link → centered tomatoGrotesk heading → centered description → thin silver divider → 2-column row (heading left, body+action link right) → product preview surface. Section gaps are generous (80px) to let the dark canvas breathe. The page reads as a single continuous dark environment rather than discrete cards stacked on a light background.

## Similar Brands

- **Linear** — Same midnight dark canvas with a single vivid accent for primary actions, and the same whisper-thin large display headlines that use size over weight for authority
- **Cursor** — Direct AI-coding-tool peer with the same dark IDE-derived palette, teal/green interactive accent, and developer-centric typographic confidence
- **Vercel** — Shares the full-bleed dark section model with gradient depth, generous vertical spacing between sections, and a disciplined single-accent-color system
- **Arc Browser** — Same dark-canvas product aesthetic with aurora-like gradient ribbons as decorative spectacle against otherwise disciplined chromatic restraint
