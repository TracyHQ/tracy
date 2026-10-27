# Aboard — Style Reference
> pastel paper notebook on a white desk

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aboard is a light, airy people-ops workspace that lives on a near-white canvas with a single vivid blue doing the work of a brand color and a palette of five pastel card surfaces doing the work of warmth. Typography leans on system-ui at compressed tracking: very large, very tight headlines (64px at -0.64px) sit above a neutral gray body, so the page reads confident and editorial rather than marketing-loud. Components are soft and rounded — 24px card radius, 99px pill buttons, 10px on small elements — and elevation is replaced by pastel color washes instead of shadows, which keeps the interface feeling like paper stationery rather than glass. Decorative emoji inlined into copy and pastel product-mockup cards give the brand a playful, almost notebook-like personality.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas | `#fafafa` | Page background, default surface — sets the off-white, paper-like base for the entire system |
| Pure White | `#ffffff` | Product UI panels, card surfaces, elevated content blocks — keeps content crisp against the off-white canvas |
| Ink | `#262626` | Primary headings and body text — softened black that reads warm rather than harsh |
| Graphite | `#757577` | Secondary text, captions, nav labels, muted borders — the everyday gray for supporting copy |
| Ash | `#aeaeaf` | Tertiary text, disabled labels, faint dividers — the quietest gray in the system |
| Outline | `#000000` | Hairline borders, icon strokes, divider lines at thin weights — provides structural edges without tonal noise |
| Shadow | `#cdcdcd` | Rare single-layer drop-shadow tone used for floating panels and the AI chat popover |
| Signal Blue | `#008ae8` | Blue outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Sky Tint | `#e0f2fe` | Notification pill background, subtle blue wash on interactive surfaces — the muted echo of Signal Blue used for non-action highlights |
| Blush | `#fbcfe8` | Decorative card surface — warm pink wash that frames product screenshots and feature blocks |
| Lavender Mist | `#e6dafd` | Decorative card surface — soft purple wash for variety blocks and callout cards |
| Mint Foam | `#b6edee` | Decorative card surface — cool teal wash for product mockup containers and accent cards |
| Powder Blue | `#afe4ff` | Decorative card surface — light blue wash used alongside the other pastels for tonal rhythm |
| Butter | `#ffe77a` | Decorative card surface — warm yellow wash, the highest-contrast pastel used sparingly for emphasis cards |

## Typography

### system-ui — All UI and editorial copy — body at 16/400, subheadings at 18–20/500, section headings at 24–44/600, hero display at 56–64/600. The stack is system-ui (San Francisco / Segoe UI / Inter fallback) so the brand inherits the OS-native feel without licensing a webfont.
- **Substitute:** Inter, -apple-system, Segoe UI, Roboto, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 12, 15, 16, 18, 20, 24, 44, 56, 64
- **Line height:** 1.20–1.60
- **Letter spacing:** Tightens as size grows: -0.64px at 64px, -0.50px at 56px, -0.26px at 44px, -0.14px at 24px, -0.10px at 20px, normal at 12px. The negative tracking on display sizes is signature — headlines feel set in metal type, not screen-default spaced.

### sans-serif — Caption-level fallback / metadata text at 12px
- **Substitute:** system-ui
- **Weights:** 400
- **Sizes:** 12
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 15px | 1.5 | -0.08px |
| subheading | — | — | 18px | 1.5 | -0.09px |
| subheading-lg | — | — | 20px | 1.4 | -0.1px |
| heading | — | — | 24px | 1.3 | -0.14px |
| heading-lg | — | — | 44px | 1.1 | -0.26px |
| display | — | — | 56px | 1.05 | -0.5px |
| display-xl | — | — | 64px | 1 | -0.64px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 40px
- **Element gap:** 10px

### Border Radius

- **tags:** 99px
- **cards:** 24px
- **inputs:** 10px
- **buttons:** 99px
- **productMockup:** 24px

## Components

### Primary Filled Button
**Role:** Single dominant call-to-action in the hero and section leads

Pill shape (99px radius), Signal Blue (#008ae8) background, white text, 12px vertical padding × 24px horizontal padding, system-ui at 16px/500. Two instances only per viewport — the loudness of blue is preserved by scarcity.

### Ghost Outlined Button
**Role:** Secondary action that sits beside the primary CTA

Pill shape (99px radius), transparent background, 1px Signal Blue (#008ae8) border, Signal Blue text, same 12×24px padding as the filled button. Always paired with the filled variant to create a clear primary/secondary tension.

### Header CTA Pill
**Role:** Persistent book-demo action in the sticky nav

Same construction as the Primary Filled Button but slightly smaller (10px padding) and uses the Sky Tint (#e0f2fe) background with Signal Blue text — a softer nav-level call that doesn't compete with hero buttons.

### Notification Badge
**Role:** Compact announcement pill above the hero headline

Sky Tint (#e0f2fe) background, 99px radius, 4px vertical × 12px horizontal padding, 12px system-ui text in Signal Blue, with a small sparkle/dot prefix character. Sits centered above the hero headline.

### Pastel Product Card
**Role:** Full-bleed product mockup container in the hero and section transitions

A pastel background wash (Blush, Lavender Mist, Mint Foam, Powder Blue, or Butter — rotate between them) with a 24px radius, generous 40px internal padding, and a white product screenshot inset that breaks slightly below the card edge to feel hand-placed. The pastel card is the system's signature substitute for drop shadows.

### Feature Column
**Role:** Three-up value-prop block in the mid-page section

Centered stack: a small custom line-icon (thin stroke, Ink color) at ~32px, then a 16–18px subheading in Ink, then a body-sm supporting line in Graphite. 32px vertical gap between icon and label, 8px between label and body. No card chrome — sits directly on canvas.

### In-Product App Card
**Role:** White panel representing the Aboard application UI in mockups

Pure white surface, 10px radius, 1px #fafafa-tinted border, soft 0 2px 8px #cdcdcd shadow. Used inside pastel product cards to make the app feel like a real product rather than a flat illustration.

### Task Checklist Card
**Role:** In-product component shown in mockups — assigned-tasks list

White card, 10px radius, thin top border accent, left-edge success-green check icon, title row in Ink/500, progress counter in Graphite, checklist items as 16px rows with small left-side dot indicators.

### AI Chat Panel
**Role:** Floating assistant drawer shown on the right edge of mockups

White panel, 10px radius, single 0 4px 16px #cdcdcd shadow, 320px wide. User message bubbles in Sky Tint (#e0f2fe) with Ink text, assistant replies as plain text rows, input field at the bottom with a 10px radius and Signal Blue send icon.

### Sticky Top Navigation
**Role:** Persistent header across all pages

White background, 1px bottom border in #fafafa-tone, 64px tall, Aboard logo (with 'by Teamtailor' lockup at 12px) left, three text links (Product / Price / Resources) centered in Graphite 15px/500, and a small blue CTA pill on the right. No mega-menu — nav stays minimal.

### Sticky Mini Nav
**Role:** Compact scroll-triggered navigation that appears on top of pastel product mockup sections

White pill-shaped bar (99px radius), 0 2px 8px #cdcdcd shadow, contains a mini logo lockup, three text links, and a filled Book demo button. Floats centered, 16px from the top of the viewport.

### Three-Column Value Grid
**Role:** Section-level layout for the 'Built for people' block

Three equal columns with 32px column gap, centered content, and the headline spanning the full width above. Emoji inlined into the headline (💜 😎 🦋 style) set at the same 44px display size in full color — the brand's one concession to ornamentation.

### Outlined Action Link
**Role:** Inline text link used in body copy

Ink color (#262626) by default, Signal Blue (#008ae8) on hover, no underline by default, 1px Signal Blue underline on hover. Inherits the surrounding body size and weight.

## Do's and Don'ts

### Do
- Use Signal Blue (#008ae8) for exactly one filled button per viewport — scarcity is what makes it pop
- Reach for the pastel card surfaces (Blush, Lavender Mist, Mint Foam, Powder Blue, Butter) instead of drop shadows when you need to frame a product screenshot or feature block
- Set all headlines at their extracted sizes with the matching negative letter-spacing — 64px gets -0.64px, 44px gets -0.26px, 24px gets -0.14px
- Use 99px radius on every button, tag, and notification pill — the pill shape is the system's signature
- Keep 24px radius on every card and product mockup container; use 10px radius only on inner product UI panels
- Set 40px padding on pastel product cards and 32px gap between feature columns
- Keep the canvas at #fafafa (off-white) rather than pure white — the warmth is what makes the pastels sing

### Don't
- Do not introduce a second saturated accent color — Signal Blue is the lone chromatic voice in the system
- Do not use heavy multi-layer drop shadows; the system relies on a single #cdcdcd shadow at 0 2px 8px and only for floating panels
- Do not use straight (0px) letter-spacing on any headline above 20px — the negative tracking is load-bearing for the editorial feel
- Do not pair the ghost button with anything other than the filled blue button — the two are a pair, not alternatives
- Do not put pure white cards on the pastel washes with hard edges; soften with the 24px radius and let the pastel bleed
- Do not use emoji in body copy — they only appear inside the display headline of the value-prop section
- Do not exceed 1200px page max-width; the system is designed for a centered, contained reading column

## Elevation

- **AI Chat Panel:** `0 4px 16px rgba(205, 205, 205, 0.5)`
- **Sticky Mini Nav:** `0 2px 8px rgba(205, 205, 205, 0.6)`
- **In-Product App Card:** `0 2px 8px rgba(205, 205, 205, 0.4)`

## Surfaces

- **Canvas** (`#fafafa`) — Page-level background, the off-white desk surface
- **Pure White** (`#ffffff`) — Product UI panels, white cards, and elevated content blocks
- **Pastel Wash** (`#fbcfe8`) — Decorative product-mockup card frames and feature highlight blocks
- **Pastel Wash Alt** (`#e0f2fe`) — Notification pill and soft interactive highlight backgrounds

## Imagery

Imagery is dominated by product UI mockups presented inside pastel card frames rather than standalone photography. The product screenshots show the Aboard application — nav bar, task lists, employee cards, AI chat panel — rendered crisp at 1x with thin 1px borders. Decorative emoji inlined into the display headline adds personality without committing to an illustration system. No lifestyle photography, no 3D renders, no abstract graphics. When the system needs atmosphere it uses a pastel wash + product UI, not stock imagery.

## Layout

Centered, max-width 1200px page model with generous vertical breathing room. The hero is a centered stack on canvas: announcement pill → display headline (two lines, 56–64px) → supporting paragraph → dual-button pair → full-bleed pastel product card below. Mid-page uses a single full-width three-column value grid (32px gaps) under a centered display headline with inline emoji. Section gap is 64px between major blocks. The sticky nav remains a fixed 64px white bar; a floating pill-shaped mini nav appears once the user scrolls into the product mockup section. The overall rhythm is: white → pastel card → white → pastel card → white, creating a paper-stack cadence rather than alternating dark/light bands.

## Similar Brands

- **Linear** — Same centered-display-headline hero pattern, tight negative letter-spacing on large type, and pastel accent washes replacing drop shadows
- **Notion** — System-ui type stack, off-white canvas, and a single accent color doing all the chromatic work while decorative surfaces stay pale and paper-like
- **Loom** — Light airy layout with product mockups framed in colored card backgrounds and a single vivid primary action color
- **Teamtailor** — Parent brand affinity — same HR/people-ops category, same friendly pastel card vocabulary, same pill-button CTA pattern
