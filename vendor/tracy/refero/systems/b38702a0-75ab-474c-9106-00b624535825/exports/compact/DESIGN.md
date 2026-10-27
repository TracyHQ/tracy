# Ramp — Style Reference
> Editorial finance desk, black-and-white pages with a single neon highlighter. A near-monochrome publication surface where one vivid chartreuse mark turns every interaction into a money signal.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ramp operates as a black-and-white editorial system punctuated by a single highlighter-yellow accent — the visual equivalent of a finance journal with a neon Sharpie. The interface stays nearly monochrome: warm off-white canvas, white cards, hairline gray borders, and deep near-black text. That one vivid chartreuse (#e4f222) appears only where money moves — CTAs, live counters, active states — making every action feel switched-on. Typography is a single-weight, neo-grotesque custom face (lausanne) at 400, used at large display sizes with tight leading (lineHeight ~1.0 at 64px) and positive tracking on small uppercase labels. Components are flat, hairline-bordered, and shadow-free: cards rest on borders, not shadows, with 12–16px radii; buttons are 6px-radius rectangles. Density is comfortable, rhythm is 8/12/16/24px, and motion is moderate and utility-focused rather than decorative.

## Colors

| Name | Value | Role |
|------|-------|------|
| Highlighter Yellow | `#e4f222` | Primary action fill, live counters, active-state highlights — the only chromatic accent in the system, making CTAs read as switched-on |
| Ink | `#0c0a08` | Primary text, heading fill, dark surface backgrounds — near-black with the faintest warm cast |
| Obsidian | `#1a1919` | Dark panels, navigation bar, inverted sections — slightly warmer and lighter than Ink for tonal variation |
| Paper | `#ffffff` | Card surfaces, modal panels, light fills, reversed text on dark backgrounds |
| Bone | `#f4f2f0` | Page canvas, subtle card washes, link background hover states — warm off-white base layer |
| Ash | `#6d6c6b` | Secondary text, hushed captions, muted labels — the 60% opacity voice of --text-primary |
| Hairline | `#e5e7eb` | Card borders, divider lines, structural outlines — 1px hairlines replace shadows as the elevation primitive |
| Smoke | `#d3d3d3` | Subtle borders, muted backgrounds, skeleton states — the 200-step in the black scale |

## Typography

### lausanne — Sole typeface across the entire system — headings, body, UI labels, nav, buttons, inputs. A single weight (400) forces hierarchy through size and tracking rather than weight contrast.
- **Substitute:** Inter, IBM Plex Sans, or Söhne
- **Weights:** 400
- **Sizes:** 10px, 13px, 14px, 16px, 18px, 20px, 24px, 28px, 40px, 48px, 64px
- **Line height:** 0.74–2.20 (tight at display, generous at caption)
- **Letter spacing:** 0.018em at 10px (uppercase micro-labels), 0.05em at small uppercase, 0 (normal) at body and display sizes
- **OpenType features:** `"ss01" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 2.2 | 0.18px |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.3 | — |
| heading-sm | — | — | 24px | 1.17 | — |
| heading | — | — | 28px | 1.14 | — |
| heading-lg | — | — | 40px | 1.05 | — |
| display | — | — | 64px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-128px
- **Card padding:** 20-24px
- **Element gap:** 8px

### Border Radius

- **tags:** 6px
- **cards:** 16px
- **inputs:** 10px
- **buttons:** 6px

## Components

### Primary Button (Highlighter)
**Role:** Main CTA — 'Get started for free', 'Create report', 'See a demo'

6px radius, #e4f222 fill, #0c0a08 text, no border, 0px vertical padding with 20px horizontal padding (text-aligned height ~44px). The only chromatic button in the system; its chartreuse fill is the highest-contrast pair against Ink text (17:1).

### Outlined Button
**Role:** Secondary CTA — 'Switch in days', 'Explore Ramp Intelligence'

6px radius, transparent fill, 1px Ink border, Ink text, 0px vertical / 12px horizontal padding. Used when a second action sits beside the primary without competing for attention.

### Ghost / Link Button
**Role:** Tertiary action — nav items, 'Read the report', inline links

Transparent fill, no border, Ink text, 6px radius. Hover state transitions to #f4f2f0 background.

### Square Icon Button
**Role:** Compact action — '+ New dashboard', utility toggles

16px padding all sides, #f4f2f0 fill, 12px radius, Ink icon/text. Squarer feel than standard CTA; used for inline dashboard controls.

### Content Card
**Role:** Primary card surface for testimonials, feature blocks, logo grids

16px radius, #ffffff fill, 1px #e5e7eb border, no shadow, 20px padding. Border replaces shadow as the elevation primitive — 17 of these are the dominant card type.

### Wash Card
**Role:** Subtle feature or stat card

12px radius, #f4f2f0 fill, no border, 1px padding wrapper creates a hairline gap before content. Used for muted callouts that don't need white contrast.

### Email Input
**Role:** Hero email capture, form fields

10px radius, transparent fill, 1px rgba(33,33,33,0.1) border, #0c0a08 text, 24px left padding / 16px right padding. Sits flush beside the Primary Button to form a composite CTA.

### Testimonial Card
**Role:** Customer quote with avatar and attribution

16px radius, #ffffff fill, 1px #e5e7eb border, 20px padding, contains company logo badge (square), name + title in 16px lausanne 400, quote in #0c0a08 body. Arranged in horizontal scroll rows.

### Live Counter Ticker
**Role:** Scrolling metric strip ('Agents at work today', 'Expenses reviewed')

Full-width #1a1919 dark band, uppercase 10px lausanne labels in Ash (#6d6c6b), metric values in Paper (#ffffff) at 14px. Numbers pulse subtly via opacity transitions.

### Sticky Navigation Bar
**Role:** Primary site navigation

102px total height including 40px announcement bar above. #ffffff fill, 1px bottom border, 15 interactive elements (logo, Products, Partners, Solutions, Resources, Customers, Pricing, Sign in, See a demo). Frosted-glass inset shadow rgba(255,255,255,0.6) inset 0 0 2px adds subtle top highlight.

### Announcement Bar
**Role:** Top-of-page promotional strip

40px height, #ffffff fill, 13px centered lausanne body text with inline link 'Learn more'. Dismissible with close icon. Sits above the main nav.

### Hero Product Screenshot
**Role:** Dashboard / product visual in hero and feature sections

Rounded browser-chrome frame with traffic-light dots, floating UI panels with shadow-free white fills. Contains inline Highlighter Yellow CTA buttons to bridge product-as-marketing.

### Logo Grid Cell
**Role:** Customer logo display in social-proof block

Transparent fill, 1px #e5e7eb grid borders forming cells, centered grayscale logo. 7-column layout; last cell replaced with a dark '7 mo' Pullquote card to break the grid rhythm.

## Do's and Don'ts

### Do
- Use lausanne at weight 400 exclusively — never introduce a bold or semibold variant; hierarchy comes from size and tracking.
- Use #e4f222 only for primary action fills, live counters, and active states — never as a background wash or decorative accent.
- Express card elevation with 1px #e5e7eb borders on #ffffff fills — avoid box-shadow except for the nav's inset white highlight.
- Set display headlines at 64px / 48px / 40px with line-height ≤ 1.05 to maintain the editorial typographic voice.
- Apply 0.018em positive letter-spacing on 10px uppercase micro-labels and metric captions.
- Use 6px radius for buttons and tags, 10px for inputs, 12px for wash cards, and 16px for content cards.
- Include "ss01" in font-feature-settings on every lausanne declaration to preserve the typeface's editorial character.

### Don't
- Don't introduce additional chromatic accent colors — the system's power depends on a single highlighter-yellow signal against monochrome.
- Don't use bold or semibold font weights — lausanne 400 at larger sizes carries all heading hierarchy.
- Don't apply box-shadow to content cards, modals, or panels — use 1px #e5e7eb borders instead.
- Don't use #0c0a08 as a background fill for large sections — reserve it for text; use #1a1919 for inverted panels.
- Don't center body text or headlines — Ramp's layout is consistently left-aligned within centered max-width containers.
- Don't add decorative gradients, illustrations, or stock photography — the visual language is typography, product screenshots, and grayscale logos only.
- Don't use radii outside the system: 6 / 10 / 12 / 16px — never 4px or fully rounded pill shapes on UI elements.

## Elevation

Elevation is expressed entirely through hairline 1px borders (#e5e7eb) and surface tonal shifts (Bone → White → Inverted) rather than shadows. The one detected box-shadow is an inset white highlight on the sticky nav — a frosted-glass cue rather than a drop shadow. This deliberate flatness keeps the editorial feel intact and prevents visual noise on dense marketing surfaces.

## Surfaces

- **Canvas** (`#f4f2f0`) — Page background — warm off-white sets a paper-like editorial feel
- **Card** (`#ffffff`) — Standard card and content surface — pure white lifts above the Bone canvas
- **Wash** (`#f4f2f0`) — Subtle secondary surface, link hover backgrounds, feature callouts
- **Inverted** (`#1a1919`) — Dark panels, sticky nav, footer, hero inversion blocks
- **Action** (`#e4f222`) — Accent surface for active states, live counters, high-emphasis fills

## Imagery

Photography and lifestyle imagery are absent. The visual language is dominated by product screenshots (floating browser-chrome UI frames showing Ramp dashboards), grayscale customer logos in grid cells, and one full-bleed dark product image (a pink neon 'Stay Posted' installation) as a brand-moment card. Iconography is filled, mono-colored, and minimal — small flat UI glyphs rather than illustrated characters. Everything reads as a screenshot or a typographic statement; no decorative illustration, no stock photography, no human faces outside of testimonial avatar squares. The density is text-dominant with product UI visuals carrying the visual weight.

## Layout

Full-bleed light canvas with max-width ~1200px centered content columns. Hero is a left-aligned typographic statement (64px headline + 24px sub + composite input+button) over a large product screenshot that bleeds to the right edge. Section rhythm alternates between light editorial bands (Bone canvas, 64–128px vertical padding) and one full-bleed dark band (#1a1919 Live Counter strip). Content arrangement is consistently left-aligned within centered max-width containers; feature blocks use 2-column text-left/visual-right pairs. Grid usage: a 7-column logo grid (customer names), a 4-column testimonial scroll grid, and stacked metric strips. Navigation is a sticky top bar (white, hairline-bordered, with a 40px announcement strip above it). The overall feel is editorial-publication: generous whitespace, tight typographic columns, and rhythmic full-bleed interruptions rather than modular card grids.

## Similar Brands

- **Linear** — Same monochrome-first UI philosophy with a single vivid accent color (Linear's violet) reserved exclusively for action surfaces, and near-identical hairline-border card approach over shadows.
- **Stripe** — Editorial-grade typography, tight display leading, generous whitespace, and a restrained palette where one accent color carries the brand's visual energy.
- **Notion** — Warm off-white canvas with ink-black text, single-weight sans-serif feel, and a flat component vocabulary that avoids heavy shadows or gradients.
- **Substack** — Publication-leaning layout with oversized tight-leading headlines, warm neutrals, and a deliberate flatness that reads as editorial rather than product UI.
- **Brex** — Direct fintech competitor sharing the same high-contrast monochrome base with one neon accent for CTAs and the same hairline-border card grammar.
