# Rive — Style Reference
> Precision Night Vision. The interface is a specialized lens, cutting through darkness to focus on technical details with absolute clarity.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design feels like a high-end piece of creative software, a focused digital workshop cloaked in darkness. A pure black #000000 canvas eliminates all distraction, forcing attention onto the content and UI. The technical, wide-set 'Tomorrow' typeface is the defining visual signature, establishing a futuristic, blueprint-like quality for all headings. A single, warm 'Ignition Orange' accent appears only on primary CTAs, acting as a functional guidance point in the monochromatic environment. Elevation is conveyed not by shadows but by subtle shifts in dark gray surfaces, creating depth like nested panels on a piece of precision hardware.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ignition Orange | `#ffa41c` | Primary CTAs and eyebrow labels — the sole warm accent, providing a clear, unmissable call to action. |
| Obsidian | `#000000` | Primary page background. |
| Charcoal | `#111111` | Secondary surfaces, like contained button backgrounds. |
| Graphite | `#1d1d1d` | Tertiary surfaces, small button backgrounds. |
| Tarmac | `#262626` | Interactive element backgrounds. |
| Stark White | `#ffffff` | Headline text, icon fills. |
| Cloud | `#f1f1f1` | High-emphasis body text. |
| Ash | `#aaaaaa` | Standard body text. |
| Dusk Gray | `#999999` | Secondary text, navigation links. |

## Typography

### Tomorrow — All headings, subheadings, and prominent UI labels. Its technical, semi-monospace structure and distinctive letter-spacing define the brand's futuristic, tool-like identity.
- **Substitute:** Share Tech Mono, Roboto Mono
- **Weights:** 400, 500
- **Sizes:** 11px, 12px, 14px, 20px, 24px, 40px
- **Line height:** 1.00, 1.20, 1.30, 1.40, 1.60
- **Letter spacing:** Negative at large sizes (-1.32px at 40px) for tight headlines, positive at small sizes (+1.1px at 11px) for legible UI labels.

### Inter — All body copy and long-form text. Its neutrality provides a readable foundation that complements the stylized 'Tomorrow' headlines.
- **Substitute:** Inter, Roboto, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 13px, 16px
- **Line height:** 1.20, 1.60, 1.70

### sans-serif — Fallback and utilitarian text in less prominent contexts.
- **Substitute:** System UI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.1 | 1.1px |
| body | — | — | 16px | 1.6 | — |
| subheading | — | — | 20px | 1.3 | 0.2px |
| heading-sm | — | — | 24px | 1.2 | 0.19px |
| heading-lg | — | — | 40px | 1 | -1.32px |

## Spacing & Layout

**Density:** compact

- **Section gap:** 80-120px
- **Card padding:** 16px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 4-8px
- **cards:** 8px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary CTA Button
**Role:** The main call to action in a view.

Background: Ignition Orange (#ffa41c). Text: Stark White (#ffffff). Padding: 12px 24px. Radius: 8px. Font: Inter Bold.

### Secondary CTA Button
**Role:** Secondary action, like downloads or alternative options.

Background: Charcoal (#111111) or Graphite (#1d1d1d). Text: Stark White (#ffffff). Padding: 12px 24px. Radius: 8px. Font: Inter.

### Tertiary Button
**Role:** Small, supplemental actions like 'Learn More' or 'Features'.

Background: Graphite (#1d1d1d). Text: Stark White (#ffffff) or Ash (#aaaaaa). Padding: 8px 10px. Radius: 8px. Font: Tomorrow or Inter, often with an icon.

### Navigation Link
**Role:** Header and footer navigation items.

Text-only button. Text color: Dusk Gray (#999999). Hover/Active color: Stark White (#ffffff). Font: Tomorrow 500.

### Eyebrow Label
**Role:** A small label preceding a major headline.

Text color: Ignition Orange (#ffa41c). Font: Tomorrow 500, all-caps. Often paired with a small icon.

### Category Tag Card
**Role:** Interactive tags for filtering or navigation, seen in a grid.

Background: Graphite (#1d1d1d). Border: 1px solid Tarmac (#262626). Text: Dusk Gray (#999999). Radius: 8px. On hover, background lightens and text turns white.

### Hero Headline
**Role:** The main H1 on the page.

Font: Tomorrow 500 at a large size (e.g., 40px+). Color: Stark White (#ffffff). Tightly tracked letter-spacing.

## Do's and Don'ts

### Do
- Use the 'Tomorrow' font for all headings, subheadings, and nav items.
- Reserve 'Ignition Orange' (#ffa41c) exclusively for a single primary CTA per view.
- Build all layouts on a pure 'Obsidian' (#000000) background.
- Differentiate interactive surfaces using the neutral palette progression: #111111, #1d1d1d, #262626.
- Maintain an 8px border-radius on all primary interactive components like buttons and cards.
- Apply specific letter-spacing rules for the 'Tomorrow' font: negative for large sizes, positive for small.
- Use 'Stark White' (#ffffff) for headlines and 'Ash' (#aaaaaa) or 'Dusk Gray' (#999999) for body copy.

### Don't
- Don't use drop shadows. Use colored surfaces for elevation.
- Don't introduce any new saturated colors. The palette is strictly monochromatic plus one orange accent.
- Don't use 'Ignition Orange' for text, borders, or non-interactive decorations.
- Don't use pill-shaped or fully-rounded buttons. Stick to the 8px radius.
- Don't use light backgrounds. The entire brand experience is dark.
- Don't use 'Tomorrow' for long paragraphs of body text; use 'Inter'.
- Don't use gradients. The aesthetic is solid color blocks.

## Elevation

Elevation is achieved through layered, near-black surfaces (#111111, #1d1d1d) on a pure black (#000000) base, not box shadows. This creates a subtle, self-contained depth reminiscent of physical hardware panels rather than floating UI cards.

## Surfaces

- **Base** (`#000000`) — Page background
- **Raised** (`#111111`) — Secondary interactive surfaces
- **Overlay** (`#1d1d1d`) — Tertiary buttons and interactive tags

## Imagery

Imagery is minimal to non-existent, placing full emphasis on the product's UI and capabilities. The visual language is defined by typography and stark color contrasts, not photography or illustration. Dark, empty containers act as placeholders, suggesting potential for embedded animations or product demos, but the core identity remains text- and UI-centric.

## Layout

The layout is full-bleed and centered, creating an immersive, focused environment. The hero section occupies the entire viewport with a large, centered headline stack. Subsequent content is presented in simple, centered text blocks or contained grid-like structures for tags and categories. Vertical rhythm is spacious, allowing each piece of information to stand alone in the expansive dark space.

## Similar Brands

- **Linear** — Shares the developer-tool aesthetic with a dark-mode UI, sharp typography, and minimal accent colors.
- **Vercel** — Similar use of a pitch-black background, sharp sans-serif typography, and a minimalist, tech-focused identity.
- **Raycast** — Evokes a similar command-line utility feel with a dark UI, focus on function, and sparse use of color.
- **GitHub Codespaces** — Also uses a dark, code-editor-inspired theme that prioritizes text and function over decorative elements.
