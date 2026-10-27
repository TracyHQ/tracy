# Aninix — Style Reference
> white gallery wall with one indigo switch

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aninix operates on near-total chromatic restraint: a white canvas, bold confident type, and a single electric indigo that activates only where human intent lives. The page reads like a minimalist product gallery — every element is either pure structural gray or that one vivid blue-violet, which makes the brand color feel like a switch being thrown rather than decoration. Components are flat, lightly bordered, and generous with whitespace; the layout alternates light and dark showcase cards to let the product work breathe. Typography is large, heavy, and unapologetic — a 64px-plus display headline against a quiet field, with body text that stays at human scale.

## Colors

| Name | Value | Role |
|------|-------|------|
| Indigo Switch | `#374fd5` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Pure White | `#ffffff` | Page canvas, button surfaces, card backgrounds, reverse text on dark blocks |
| Soft Mist | `#f0f0f0` | Secondary card surfaces, subtle fill blocks beneath product showcases |
| Carbon Black | `#000000` | Primary text, heavy icon strokes, structural borders, divider lines |
| Ink Black | `#171717` | Heading text, deep borders where pure black feels too sharp |
| Shadow Gray | `#333333` | Body text secondary weight, supporting borders |
| Steel | `#89909a` | Muted helper text, ghost button borders, icon strokes at lower prominence |
| Midnight | `#0b1118` | Dark showcase card surfaces, near-black panels for gallery contrast |
| Fog | `#ced3d9` | Hairline borders, button shadow ambient layer, subtle dividers |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Euclid Circular A — Display and heading — the site loads heavy custom geometric type at 700+ for hero and section titles. The slightly tight tracking (-0.01em) and condensed geometric forms give headlines a monolithic, confident feel against the white field
- **Substitute:** Inter (700/800) or Söhne Breit
- **Weights:** 700-800
- **Sizes:** 18px, 20px
- **Line height:** 1.05-1.30
- **Letter spacing:** -0.0100em

### system-ui — Body and subhead text — leans on the native sans stack, letting the display face do the heavy lifting. Weight 500 appears in nav and subheadings, 700 for inline emphasis
- **Substitute:** Inter or system sans
- **Weights:** 400, 500, 700
- **Sizes:** 16px, 18px
- **Line height:** 1.40-1.50

### P22 Mackinac Pro — Editorial body accent — a slab-influenced serif used sparingly in testimonial or contextual blocks, adding human warmth where the geometric display would feel cold
- **Substitute:** Source Serif Pro or PT Serif
- **Weights:** 400
- **Sizes:** 20px
- **Line height:** 1.40-1.50

### system-ui — Captions, micro-labels, badge text — tiny, quiet, never decorative
- **Substitute:** system sans
- **Weights:** 400
- **Sizes:** 16px, 18px
- **Line height:** 1.20

### P22 Mackinac Pro Medium Italic — P22 Mackinac Pro Medium Italic — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| body-lg | — | — | 18px | 1.44 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading | — | — | 32px | 1.2 | -0.32px |
| heading-lg | — | — | 48px | 1.15 | -0.48px |
| display | — | — | 72px | 1.05 | -0.72px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **cards:** 16px
- **badges:** 4px
- **buttons:** 8px
- **largeShowcase:** 24px

## Components

### Primary CTA Button
**Role:** Main call-to-action ('Install plugin') — the one interactive element that demands visual presence

Indigo Switch (#374fd5) fill, white text, 8px radius, 24px horizontal × 13px vertical padding. Body weight, 16px. Carries a dual-layer cool gray shadow (rgba(104,116,123,0.15) 2px 7px + rgba(104,116,123,0.3) 5px 15px) — the only shadow in the system. Often paired with a small Figma icon prefix.

### Ghost / Outlined Button
**Role:** Secondary actions in the nav ('Log in', 'Install plugin' outline variant)

Transparent fill, 1px Steel (#89909a) border, 8px radius, 24px × 10px padding. Text in body or muted gray. No shadow.

### Aninix Attribution Chip
**Role:** Brand watermark on showcase cards — 'by Aninix' tag overlaid on gallery content

Indigo Switch (#374fd5) fill, white text at 12px caption weight, 4px radius, compact 4-8px padding. Appears bottom-left on both light and dark showcase cards as a consistent brand signature.

### Light Showcase Card
**Role:** Product gallery block on white canvas — displays the Figma app icon or light product work

White or Soft Mist (#f0f0f0) surface, 16px radius, generous internal padding (40px+), no border, no shadow. Contains centered product visual. Anchored by the indigo attribution chip.

### Dark Showcase Card
**Role:** Product gallery block for dark-mode product work — phone mockups, video stills, animation frames

Midnight (#0b1118) surface, 16px radius, 40px+ internal padding, no shadow. White or light-gray content sits on the dark ground. The indigo attribution chip is the only color in the card.

### Navigation Bar
**Role:** Top-level site navigation

White transparent, full-width, with 80px horizontal padding. Left: logo + wordmark. Center: text links (16px, body weight, #333). Right: ghost 'Install plugin' button + ghost 'Log in' button. No background fill, no border, no sticky shadow.

### Hero Display Block
**Role:** Above-the-fold headline and subhead stack

Centered on white. Display type at 72px / weight 700-800 / -0.72px tracking in Carbon Black (#000). Subhead at 20px system-ui weight 400 in Shadow Gray (#333). 40-48px vertical gap between headline and subhead.

### Social Proof Line
**Role:** User count reassurance beneath primary CTA

14px body-sm, muted gray (#333), centered, unadorned. No badge, no icon — a single quiet line of trust.

### Logo Mark
**Role:** Brand identity — play-button glyph in a rounded square

Indigo Switch (#374fd5) rounded square (~20px), white play triangle centered. Paired with 'Aninix' wordmark in body weight.

### Section Heading
**Role:** Mid-page section titles ('Hard to believe these animations...')

Heading-lg scale (48px), system-ui or Euclid Circular A weight 700, -0.48px tracking, Carbon Black (#000). Centered or left-aligned depending on section rhythm.

## Do's and Don'ts

### Do
- Use #374fd5 exclusively for the CTA fill, the logo mark, and the 'by Aninix' attribution chip — never as background fill for large sections
- Set the hero headline at 72px / weight 700+ with -0.72px tracking in #000 — the large type against white is the page's identity
- Apply 16px radius to all card surfaces and 8px radius to all buttons — these two values define the component geometry
- Let the dual-layer button shadow be the only shadow in the system; keep cards and nav completely flat
- Alternate light (#f0f0f0 or #ffffff) and dark (#0b1118) showcase cards to create visual rhythm without adding color
- Keep body text at 16-18px in system-ui weight 400-500; let the display face carry the brand voice
- Use 80px horizontal padding on the nav and 80px section gaps — the page breathes

### Don't
- Never use a chromatic color other than #374fd5 — the 1% colorfulness is the entire brand strategy
- Never apply the dual-shadow elevation to anything except the primary CTA button
- Never use more than 2 type families on a single screen — Euclid Circular A for display, system-ui for body, Mackinac only for editorial pull-quotes
- Never add gradients — the system is flat by philosophy
- Never use #000000 for body text at small sizes; switch to #171717 or #333333 for anything below 24px
- Never add icons inside body text or cards — iconography is restricted to the logo, CTA prefixes, and the nav
- Never use the indigo accent on text longer than a single word; it is for chips, buttons, and the glyph only

## Elevation

- **Primary CTA button:** `rgba(104, 116, 123, 0.15) 0px 2px 7px 0px, rgba(104, 116, 123, 0.3) 0px 5px 15px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Page-level background; the void everything else sits on
- **Card Light** (`#f0f0f0`) — Soft secondary surface beneath product showcases and highlight blocks
- **Card Dark** (`#0b1118`) — Gallery cards showcasing dark-mode product work; the contrast beat
- **Accent Surface** (`#374fd5`) — CTA fills and brand chips; the chromatic punctuation point

## Imagery

Product-first gallery aesthetic. The visuals are full-bleed product work — app icons, animation frames, UI mockups — displayed in flat cards rather than lifestyle photography. No people, no environments. Dark and light product cards alternate to create rhythm. Accent artwork (a vivid yellow block with building icons) appears as deliberate chromatic punctuation, breaking the monochrome rule. Iconography is minimal: the logo play-glyph, a small Figma mark on CTAs, and social glyphs. No decorative illustration or stock photography anywhere.

## Layout

Max-width 1200px centered, with 80px outer horizontal padding on the nav. Hero is a centered single-column stack: massive display headline → subhead → CTA → social proof → two-card gallery row. Section rhythm alternates white and light-gray bands, each section separated by 80px vertical gap. Content is predominantly centered stacks with occasional 2-column or 3-column card grids. Dark showcase cards break the white-field monotony mid-page. The overall density is spacious — one focal element per viewport, no information-dense blocks.

## Similar Brands

- **Linear** — Same near-monochrome palette with a single vivid accent, bold geometric display type, and card-based gallery layouts
- **Vercel** — White-canvas minimalism, heavy display headlines at 64-72px, generous 80px section spacing, and flat cards with large radii
- **Framer** — Dark-and-light alternating showcase cards, single accent color for CTAs and brand chips, spacious gallery rhythm
- **Pitch** — Restrained colorfulness, confident geometric type, and product-first imagery over decorative photography
- **Figma Config** — Plugin-marketplace aesthetic with indigo accent, Figma-branded CTA buttons, and community social proof lines
