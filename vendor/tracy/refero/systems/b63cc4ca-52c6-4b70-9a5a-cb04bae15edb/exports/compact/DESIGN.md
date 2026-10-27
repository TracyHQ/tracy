# LogoArchive — Style Reference
> midnight gallery of iconic marks

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

LogoArchive uses a midnight-gallery language: a near-black canvas, hairline white borders, and Swiss-precision typography (Suisse International) that alternates upright and italic weights to mark emphasis. The entire interface is monochromatic — black, three shades of charcoal, and white — with a single vivid yellow (#fde533) used as functional punctuation for primary actions, badges, and the logo book mark. Surfaces are flat with no shadows; depth comes from tonal layering between #18181b, #27272a, and #343538. Components are pill-shaped or generously rounded, compactly spaced, and always low-weight. The aesthetic reads as a curated archive or design museum after hours — quiet, authoritative, slightly editorial.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Charcoal | `#27272a` | Page background, primary canvas surface |
| Elevated Ink | `#18181b` | Card surfaces, product window backgrounds, logo tiles — one step deeper than canvas for contrast |
| Slate Surface | `#343538` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Deep Void | `#000000` | Nav fills, deepest surface tone, pure black accents |
| Near Black | `#0c0c0e` | List borders, hairline dividers, subtle structural edges |
| Pure White | `#ffffff` | Primary text, icons, borders, high-contrast elements — the dominant interface color |
| Fog Gray | `#a8afb7` | Muted body text, secondary headings, subtle borders — readable but recessive |
| Mist Gray | `#dadee4` | Light borders, disabled-state text, very subtle dividers |
| Dim Stone | `#8c8c8d` | Placeholder/disabled surfaces, inactive list backgrounds |
| Signal Yellow | `#fde533` | Yellow outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |

## Typography

### Suisse International — Primary typeface for all UI text, body, navigation, buttons, and most headings
- **Substitute:** Inter, Söhne, Neue Haas Grotesk
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16, 18, 19, 24, 28, 65, 96
- **Line height:** 0.9–1.75

### Suisse Works Book — Italic display emphasis in hero and section headlines
- **Substitute:** Söhne Buch Italic, GT Sectra Italic
- **Weights:** 400
- **Sizes:** 65, 96
- **Line height:** 1.0–1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.75 | — |
| body | — | — | 16px | 1.75 | — |
| subheading | — | — | 19px | 1.2 | — |
| heading-sm | — | — | 24px | 1.2 | — |
| heading | — | — | 28px | 1 | — |
| display | — | — | 65px | 1 | — |
| display-lg | — | — | 96px | 0.9 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **cards:** 28px
- **large:** 40px
- **tiles:** 20px
- **badges:** 999px
- **subtle:** 4px
- **buttons:** 999px

## Components

### Primary CTA Button
**Role:** Main call-to-action for conversion (pricing, signup)

Pill-shaped, 999px radius. Background #fde533, text #000000. Padding 10px 16px. Font: Suisse International 14px weight 500. No border. The yellow against charcoal creates high contrast that makes the action feel urgent but not aggressive — it's editorial, not e-commerce.

### Secondary Button
**Role:** Secondary actions (pricing, learn more)

Pill-shaped, 999px radius. Background #343538 or #27272a, text #ffffff. Padding 10px 16px. Font: Suisse International 14px weight 500. Sits quietly next to the primary CTA — a supporting voice.

### Ghost Nav Button
**Role:** Top-right utility actions (Log in)

Pill-shaped, 999px radius. Transparent or #27272a background, 1px #343538 border, text #ffffff. Padding 4px 12px. Font: Suisse International 12px. Minimal weight — almost disappears into the nav bar.

### Feature Badge
**Role:** Pill label above section headings (e.g., 'A new format of logo inspiration')

Pill-shaped, 999px radius. Background #fde533, text #000000. Padding 4px 8px. Font: Suisse International 12px weight 500. Centered above the section headline — signals 'new' or 'featured' without using color words.

### Logo Tile Card
**Role:** Individual logo display in the product grid

Rounded rectangle, 20px radius. Background #18181b, 1px #27272a border. White logo icon centered. Padding 32px. Represents the product's core unit — each logo is presented as a museum specimen on a dark plinth.

### Product Window Frame
**Role:** Desktop app screenshot container

macOS-style window chrome with traffic-light dots. Background #18181b interior, #27272a frame. 20px radius. Contains the product UI mockup. The window itself is part of the visual language — showing the product 'in context'.

### Mobile Device Frame
**Role:** Mobile app screenshot container

Phone-shaped frame with rounded corners (~40px). Dark interior #18181b. Overlaps or sits beside the desktop frame to show responsive design. Behaves like a secondary product specimen.

### Nav Bar
**Role:** Top navigation, site-wide

Full-width, 64px height. Background #000000 or transparent over canvas. Logo mark at far left (white LA monogram), utility button at far right. No centered nav links — minimal and directional.

### Hero Headline
**Role:** Primary page headline

Suisse International 65–96px, weight 400 (regular) for body of headline, weight 500 for bold fragments, Suisse Works Book italic for emphasis words. Text #ffffff. Line-height 0.9–1.0 for display. The typographic mix of roman + bold + italic is the signature.

### Subtext Paragraph
**Role:** Supporting copy below headlines or CTAs

Suisse International 14–16px weight 400. Color #a8afb7 (Fog Gray). Line-height 1.75. Centered in hero contexts. Recessive — never competes with the headline.

### Pricing Card
**Role:** Subscription tier display

Rounded card, 28px radius. Background #18181b, 1px #27272a border. Padding 32px. Contains tier name (24px weight 500 white), price (display size yellow), feature list (14px #a8afb7), and CTA button. The card is a dark showcase box — price glows yellow.

### Feature List Row
**Role:** Checklist item in pricing or feature sections

Horizontal row with small icon (white) and text (14px #ffffff). 8px gap between icon and text. 4–8px vertical padding. No background or border — just a clean row.

## Do's and Don'ts

### Do
- Use #fde533 only for primary CTAs, badges, and the logo mark — never for body text, icons, or decorative elements
- Pair Suisse International roman (400) with italic (Suisse Works Book) for editorial emphasis in display copy
- Use 999px border-radius for all buttons, badges, and interactive pills
- Layer surfaces using the tonal stack: #000000 → #0c0c0 → #18181b → #27272a → #343538
- Set body text to #a8afb7 at 14–16px with 1.75 line-height for readable, recessive supporting copy
- Keep all borders 1px and use #27272a or #343538 — never thicker, never chromatic
- Center-align hero and section headlines; left-align body and list content

### Don't
- Don't introduce a second accent color — the system is monochromatic with one yellow signal
- Don't use box-shadow for elevation — rely on tonal surface contrast only
- Don't use display sizes below 65px for headlines — the scale jumps from 28px to 65px intentionally
- Don't use system fonts or non-Swiss grotesques — the typographic identity is precise and mechanical
- Don't add gradients — the system is fully flat
- Don't use light-theme colors or white backgrounds — the system is dark-first
- Don't use borders thicker than 1px or with high contrast — borders are always hairline and subtle

## Elevation

- **Card on canvas:** `none — depth via tonal contrast (#18181b on #27272a), not shadow`
- **Button on card:** `none — flat fill distinguishes the button`

## Surfaces

- **Deep Void** (`#000000`) — Nav bar, deepest layered surfaces
- **Near Black** (`#0c0c0`) — Structural borders and dividers
- **Elevated Ink** (`#18181b`) — Logo tiles, product window interiors
- **Canvas Charcoal** (`#27272a`) — Main page canvas, default surface
- **Slate Surface** (`#343538`) — Ghost buttons, secondary cards, subtle elevation

## Imagery

Imagery is minimal and product-focused. The primary visual content is the product itself — screenshots of the desktop and mobile apps showing the logo grid are the hero visuals. The logo grid is presented as specimens on dark tiles (like museum cards). No lifestyle photography, no illustrations, no decorative graphics. Icons are line-style, white, 1px stroke, used sparingly for nav and feature lists. The 'LA' monogram in the top-left is the only persistent brand mark.

## Layout

Full-bleed dark canvas, max-width ~1200px for content. Hero is a centered text block (not split) with a single headline, subtext, and dual CTA. Sections alternate between centered text and product showcase compositions — the product screenshots are the visual breaks between text blocks. Navigation is a minimal top bar with logo left and single utility button right (no horizontal nav links). Content density is compact but breathing — sections separated by 64px+ vertical gaps, with generous internal padding. The overall rhythm is: centered headline → product visual → centered headline → product visual, creating a museum-exhibit cadence.

## Similar Brands

- **Are.na** — Same dark-canvas, hairline-border, minimal-CTA approach with monochromatic palette and editorial restraint
- **Read.cv** — Dark mode, single accent color, pill-shaped buttons, Swiss-grotesk typography, and zero decorative imagery
- **Pitch** — Dark UI with compact density, rounded components, and a single vivid accent color against charcoal surfaces
- **Linear** — Dark-first interface, tonal surface layering without shadows, precise grotesque typography
- **Krea AI** — Dark gallery aesthetic with product-as-hero layout, minimal chrome, and one signal color for actions
