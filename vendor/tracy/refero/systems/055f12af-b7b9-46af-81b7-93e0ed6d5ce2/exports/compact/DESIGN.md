# Krepling — Style Reference
> Quiet white atelier with one violet spark

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Krepling's design system is a near-monochrome canvas where black text and white surfaces carry the interface, and a single vivid violet (Bolt Violet) provides the only chromatic voice for actions, links, and interactive states. The layout breathes: generous whitespace, a comfortable density, and section rhythm built from large typographic jumps (16px → 80px) rather than colored bands. Surfaces are flat — borders and subtle background tints (#f1f1f1) define elevation; shadows are essentially absent. Rounded geometry is consistent (8px for cards/buttons, 14px for larger containers), reinforcing a soft, approachable feel. The system is counterweighted by playful 3D-rendered decorative objects in saturated hues — these are pure atmosphere, never UI tokens.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bolt Violet | `#b154f9` | Filled CTA backgrounds, link borders, active tab indicators — the sole chromatic signal in the system |
| Ink Black | `#000000` | Primary text, headings, icon strokes, nav labels, all hairline borders and dividers |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on filled CTAs, reversed text in dark zones |
| Mist Gray | `#f1f1f1` | Alt-surface tint for sub-sections, secondary card backgrounds, hover wash |
| Charcoal | `#171717` | Footer background, near-black text where softer than pure ink is needed |
| Steel Gray | `#6c6b6b` | Secondary/helper text, muted icons, disabled states, low-priority borders |
| Fog Gray | `#b3b3b3` | Subtle card borders, placeholder text, low-contrast dividers |

## Typography

### Regular — Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px, 18px, 24px, 32px, 48px, 64px, 80px
- **Line height:** 1.1, 1.2, 1.3
- **Letter spacing:** -0.01, 0.01, 0.02

### Custom Sans (Krepling Regular) — Single-weight grotesk used for every text role — body, headings, nav, buttons. A weight-400-only system is a deliberate signature: hierarchy is built through size and tracking, not boldness, producing a calm, editorial, anti-shout tone. Free substitute: Inter at 400, or Söhne Buch.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 16, 18, 24, 32, 48, 64, 80px
- **Line height:** 1.10–1.30
- **Letter spacing:** -0.01em at 48–80px, 0.01em at 16–24px, 0.02em at small caps/labels

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.3 | 0.01px |
| body | — | — | 18px | 1.3 | 0.01px |
| subheading | — | — | 24px | 1.2 | 0.01px |
| heading-sm | — | — | 32px | 1.2 | 0px |
| heading | — | — | 48px | 1.2 | -0.01px |
| heading-lg | — | — | 64px | 1.1 | -0.01px |
| display | — | — | 80px | 1.1 | -0.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **buttons:** 8px
- **hero panels:** 30px
- **large containers:** 14px

## Components

### Filled Violet Button
**Role:** Primary action — 'Request a demo', submit

Background #b154f9, text #ffffff, radius 8px, padding 14px 20px, weight 400 at 16–18px. The only filled button in the system.

### Outlined Violet Button
**Role:** Secondary action — 'Get started' in nav

Background #ffffff, border 1.5px #b154f9, text #b154f9, radius 8px, padding 14px 20px. Inverse of the filled variant — same hue, transparent fill.

### Ghost Text Link
**Role:** Nav links, inline links

No background, text #000000 at 16–18px, hover shifts to #b154f9. Underline only on hover.

### Header / Top Nav
**Role:** Global navigation bar

White background, 1px bottom border in Ink Black at low opacity. Left: wordmark logo. Center: text nav at 16–18px. Right: 'Log in' ghost link + outlined violet 'Get started' button. Padding ~21px vertical.

### Hero Block
**Role:** First-screen headline and subtext

Max-width ~1200px centered. Display headline 64–80px weight 400 with -0.01em tracking, left-aligned, black on white. Supporting subtext 18–24px, #000000, right-aligned or beside CTA. Filled violet CTA below subtext.

### 3D Decorative Object Cluster
**Role:** Atmospheric hero/section visuals

Pastel gradient cubes/spheres in saturated hues (coral, lavender, mint, sky, yellow) rendered as 3D illustrations. Always floating, soft-shadow, no sharp edges. Purely decorative — never informational.

### Feature Section Heading
**Role:** Section opener with icon + title

Small black icon (~32–40px) in a rounded square, paired with a 48–64px weight-400 heading. Example: 'Workflows' with a black icon tile to its left.

### Tab Strip
**Role:** In-section navigation (Workflows / Storefront / Dashboard)

Horizontal pill-shaped tabs, each 8px radius, padding 10–14px vertical / 18–20px horizontal. Inactive: #ffffff bg, #000000 text, 1px border. Active: #b154f9 border or fill indicator.

### Content Card
**Role:** Generic card container for features, pricing, content blocks

Background #ffffff or #f1f1f1, 1px border in Fog Gray or Ink Black at low opacity, radius 8px, padding 20px. No drop shadow.

### FAQ Accordion Row
**Role:** Expandable question/answer list

Full-width row, 1px Ink Black bottom border (no top/left/right border), padding 20px vertical, question text 16–18px weight 400 #000000, chevron icon on the right in #000000. Expands inline with answer in #6c6b6b.

### Footer
**Role:** Site footer

Background #171717, text and links in #ffffff, generous vertical padding, multi-column link grid. Inverts the entire light system to near-black.

## Do's and Don'ts

### Do
- Use #b154f9 exclusively for filled CTAs, outlined CTAs, and active tab/link states — it is the system's only chromatic voice
- Build hierarchy with size and tracking (16→80px, -0.01em on displays), never with bold weight — the font ships in weight 400 only
- Use 8px radius for all buttons, cards, and small containers; 14px for larger panels; 30px only for hero-scale surfaces
- Communicate elevation with 1px borders in Ink Black or Fog Gray, or with the Mist Gray (#f1f1f1) alt-surface — never with drop shadows
- Let the 3D decorative objects carry all color in hero/section compositions; the surrounding UI must stay achromatic so the objects pop
- Set the page canvas to #ffffff and the page max-width to 1200px centered; let vertical rhythm (80px section gaps) create the pacing
- Reverse to #171717 with #ffffff text only in the footer — keep every other surface light

### Don't
- Do not introduce a second brand color into the UI palette — the violet must remain the only chromatic accent
- Do not use weight 600 or 700 — there is no bold; hierarchy must come from size
- Do not apply drop shadows to cards, buttons, or modals — the system is deliberately flat
- Do not use 4px or 12px radius on cards or buttons — stick to 8px / 14px / 30px
- Do not set body text below 16px or above line-height 1.3 — the scale is opinionated
- Do not place UI text in any of the decorative illustration hues (coral, mint, yellow, etc.) — those are artwork-only
- Do not alternate dark and light section bands — the page is light throughout, with the footer as the single dark inversion

## Elevation

Elevation is communicated through border weight (1px Ink Black at 8–10% opacity) and background tint shifts, never drop shadows. The flatness is deliberate: the 3D decorative elements supply the only depth in the experience.

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas, default card surface
- **Mist Gray** (`#f1f1f1`) — Alt-section background, secondary surface
- **Charcoal** (`#171717`) — Footer / dark surface

## Imagery

Imagery is dominated by 3D-rendered decorative objects: soft, rounded cubes and spheres in pastel-saturated hues (coral, lavender, mint, sky blue, butter yellow, pink) floating in composition with one another. They sit on pure white, occupy roughly 40–60% of hero/section real estate, and function purely as atmospheric brand texture — not as product screenshots or photography. No stock photography, no lifestyle imagery, no human figures. Iconography is monochrome black line/filled glyphs in small rounded squares (e.g., the Workflows icon tile). The 3D style is the visual signature: tactile, candy-like, and the only place saturated color is allowed.

## Layout

Centered max-width ~1200px container, full-bleed white canvas. The hero is a two-column composition: massive left-aligned display headline (64–80px) with a floating cluster of 3D decorative objects occupying the upper-right and center, and a smaller right-aligned subtext + filled violet CTA block in the lower-right. Below the hero, sections flow as single centered stacks or two-column text+visual blocks with 80px vertical gaps. The Workflows section uses a centered icon+headline opener followed by a full-width tab strip and content area. The FAQ section is a centered max-width column (~800px) of full-width accordion rows with hairline dividers. Navigation is a top bar, no sidebar, no sticky shadow. The single full-bleed dark surface is the footer.

## Similar Brands

- **Stripe** — Same near-monochrome white canvas with a single signature color carrying all interactive state; same comfortable density and large display type.
- **Linear** — Same flat-surface philosophy with hairline borders instead of shadows, generous whitespace, and one chromatic accent per surface.
- **Notion** — Same quiet white-base UI, weight-400-only typographic voice, rounded geometry, and decorative 3D illustration as atmospheric brand texture.
- **Framer** — Same playful 3D decorative objects floating on white, large editorial display type at weight 400, and minimal chromatic UI palette.
