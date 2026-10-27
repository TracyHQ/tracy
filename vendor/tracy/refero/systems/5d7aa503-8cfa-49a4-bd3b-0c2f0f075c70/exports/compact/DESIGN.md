# Cal.com — Style Reference
> Monochrome Utility, Human Touch. A system that prioritizes clarity and function with a stark black-and-white palette, but softens it with friendly typography and rounded forms.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The design feels like a pragmatic, high-precision instrument. It's built on a strict and disciplined monochrome palette of black, white, and echelon grays, where color is intentionally excluded from the core UI to emphasize function. The custom font, 'Cal Sans', defines the visual identity with its geometric yet open letterforms, giving headlines a technical but approachable character. Nearly all interactive elements are either solid black or pill-shaped outlines, creating a binary system of action. Cards are the fundamental building block, using soft 8-12px radii and extremely subtle shadows to create a quiet, layered topology on a light gray background.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#101010` | Primary CTAs, primary text, active states. Used as the strongest dark tone, providing maximum contrast and visual weight for key actions. |
| Action Blue | `#0099ff` | Tertiary links, informational banner text. A rare, functional splash of color reserved for secondary calls to action and informational highlights. |
| White | `#ffffff` | Card backgrounds, text on dark buttons. |
| Paper | `#f4f4f4` | Main page background. |
| Graphite | `#242424` | Headlines, primary body text. |
| Slate | `#6b7280` | Secondary text, descriptive copy, disabled states. |
| Stone | `#898989` | Placeholder text, decorative UI elements. |
| Silver | `#e5e7eb` | Borders, dividers, subtle backgrounds. |
| Info Banner BG | `#eff6fe` | Background for the top-of-page informational banner. |
| Google Blue | `#4285f4` | Integration logos only. |
| Google Yellow | `#fbbc04` | Integration logos only. |
| Google Green | `#34a853` | Integration logos only. |
| Google Red | `#ea4335` | Integration logos only. |

## Typography

### Cal Sans — Primary headline font. Its geometric forms and slightly wide stance give the brand a unique, technical-yet-friendly voice. Used exclusively for headings to establish hierarchy.
- **Substitute:** Poppins, Gilroy
- **Weights:** 600
- **Sizes:** 20px, 24px, 48px, 64px
- **Line height:** 1.10 - 1.30
- **Letter spacing:** +0.01em tracking adds airiness at display sizes.

### Cal Sans UI Variable Light — Primary body and UI text font. The light weight and tight negative tracking create a clean, modern text block that is readable without being loud.
- **Substitute:** Inter Light
- **Weights:** 300
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1.40 - 1.50
- **Letter spacing:** Tight negative tracking from -0.19px to -0.24px for a compact feel.

### Inter — Secondary UI and body font. Used for smaller text, labels, and inside complex components like the calendar widget where utmost clarity is required.
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 12px, 14px, 16px
- **Line height:** 1.14 - 1.43

### Matter — Tertiary UI text for captions and metadata where a highly legible, neutral choice is needed.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 10px, 12px, 14px
- **Line height:** 1.14 - 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | -0.24px |
| body-sm | — | — | 14px | 1.5 | -0.2px |
| body | — | — | 16px | 1.5 | -0.19px |
| subheading | — | — | 18px | 1.4 | -0.2px |
| heading-sm | — | — | 20px | 1.3 | 0.2px |
| heading | — | — | 24px | 1.3 | 0.24px |
| heading-lg | — | — | 48px | 1.1 | 0.48px |
| display | — | — | 64px | 1.1 | 0.64px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **inputs:** 8px
- **buttons:** 9999px (pills), 8px (rectangular)

## Components

### Primary CTA Button
**Role:** The main call-to-action on the page.

A pill-shaped button. Background: Ink (#101010). Text: White (#ffffff). Font: Cal Sans UI at 14-16px. Radius: 9999px. Padding: ~12px 24px.

### Secondary Ghost Button
**Role:** A secondary call-to-action, often next to the primary.

A pill-shaped outline button. Background: transparent or Paper (#f4f4f4). Text: Graphite (#242424). Border: 1px solid Silver (#e5e7eb). Radius: 9999px. Padding: ~12px 24px.

### Header CTA Button
**Role:** The main call-to-action in the sticky header.

A rectangular button. Background: Ink (#101010). Text: White (#ffffff). Font: Cal Sans UI at 14px. Radius: 8px. Padding: ~8px 16px.

### Tag Button
**Role:** Small, non-critical buttons for categorizing or filtering content.

A small pill button. Background: Paper (#f4f4f4) or Silver (#e5e7eb). Text: Graphite (#242424). Radius: 9999px. Padding: ~4px 12px.

### Scheduling Widget Card
**Role:** The hero component showcasing the product's core functionality.

Background: White (#ffffff). Padding: 16px. Radius: 12px. Shadow: `rgba(36, 36, 36, 0.05) 0px 4px 8px 0px`. Contains an interactive calendar UI.

### Navigation Link
**Role:** Links in the main site header.

Text-only link. Color: Graphite (#242424). Font: Cal Sans UI at 14-16px. No underline.

## Do's and Don'ts

### Do
- Use 'Cal Sans' weight 600 exclusively for headings (size 20px and above).
- Employ a strict monochrome palette (Ink, Graphite, Slate, Paper, White) for 99% of the UI.
- Use pill-shaped buttons (9999px radius) for all primary and secondary page CTAs.
- Apply a 12px border radius to all content cards and large containers.
- Use subtle, diffuse shadows (`rgba(36, 36, 36, 0.05) 0px 4px 8px 0px`) for elevation.
- Set body copy in 'Cal Sans UI Variable Light' with tight negative letter-spacing.
- Reserve the single 'Action Blue' (#0099ff) for secondary links or informational highlights.

### Don't
- Do not introduce any new colors to the core UI; confine color to logos and the single blue accent.
- Do not use sharp corners on buttons or cards.
- Do not use font weights heavier than 600.
- Do not use traditional outlined buttons; use either solid 'Ink' or 'ghost' pill buttons.
- Do not use gradients on any buttons or card backgrounds.
- Do not use borders on cards; use shadows for separation.
- Do not set body text in 'Cal Sans'; it is for headlines only.

## Elevation

- **Feature Card, Scheduling Widget:** `rgba(36, 36, 36, 0.05) 0px 4px 8px 0px`
- **Hover/Focus Card:** `rgba(36, 36, 36, 0.7) 0px 1px 5px -4px, rgba(36, 36, 36, 0.05) 0px 4px 8px 0px`

## Imagery

The visual language is entirely product-centric and informational. Imagery consists solely of clean, isolated product UI screenshots and the logos of integration partners. There is no lifestyle photography, illustration, or abstract graphics. This choice reinforces the brand's focus on its functional capabilities, letting the product itself be the hero. All visual elements are presented within contained cards, never full-bleed, maintaining the page's orderly, grid-based structure.

## Layout

The site uses a centered layout within a max-width of 1200px, creating generous breathing room on either side. Sections are clearly demarcated by 96px of vertical space, establishing a calm, deliberate rhythm. The hero combines a large headline stack with a prominent product UI visual. Content below follows a predictable pattern of centered headlines followed by 3-column feature card grids or alternating text-and-visual blocks. This simple, highly structured approach emphasizes clarity and ease of navigation.

## Similar Brands

- **Calendly** — Direct competitor with a similar clean, utility-focused scheduling UI, but uses more color.
- **Linear** — Shares the disciplined monochrome palette, precision typography, and subtle shadows.
- **Vercel** — Similar use of a geometric sans-serif for headlines (Geist) against a stark black-and-white UI.
- **Pitch** — Employs a custom slab-serif for identity and relies on a clean, card-based layout with a primarily B&W palette.
