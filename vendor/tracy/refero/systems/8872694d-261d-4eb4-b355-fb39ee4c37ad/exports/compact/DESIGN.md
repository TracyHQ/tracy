# Inthememory — Style Reference
> Architectural blueprint on white marble with a single warm spark. A quiet, editorial data room where deep teal ink and pill-shaped controls float over chalk-white surfaces, broken only by a single orange flare.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Inthememory presents a crisp editorial-meets-product surface: white canvas, deep ink-teal typography, and restrained warm-orange punctuation for moments of energy. Cards ride a light airy gray (#f1f7f9) with hairline borders, while pill-shaped controls (100px radius) and isometric line illustrations give the system a tactile, almost stationery-like warmth. Color is functional and rare — the electric blue (#0c67ff) is reserved for announcement bars and focus states, the orange (#fa4e1d) for hero iconography and occasional card backgrounds, and the entire chrome stays monochrome to let data and copy lead. Typography is custom Graphik at two weights only, creating a disciplined two-voice system where weight 500 earns emphasis and weight 400 carries everything else.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Teal | `#102126` | Primary text, borders, filled buttons, iconography — the structural backbone of the system. Its near-black teal reads as authoritative without the harshness of pure black |
| Slate Veil | `#3d5761` | Secondary text, subtle borders — bridges body copy and muted UI chrome without competing with the primary ink |
| Fog Gray | `#677b82` | Tertiary text, disabled states, low-emphasis labels — the quietest neutral that still maintains readability against white |
| Chalk White | `#ffffff` | Page canvas, card surfaces, button text on dark fills — the dominant surface that lets the dark ink and accent colors carry the visual weight |
| Pale Mist | `#f1f7f9` | Card backgrounds, section washes, subtle surface elevation — a barely-tinted cool gray that lifts cards off the white canvas without warmth |
| Hairline Gray | `#e9eef0` | Dividers, borders, input outlines — the thinnest structural line color, used where a 1px edge needs to exist without drawing attention |
| Ember Orange | `#fa4e1d` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Sunset Coral | `#fb6338` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Signal Blue | `#0c67ff` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Info Indigo | `#0519d5` | Violet state accent for badges, validation surfaces, and short status labels. Do not promote it to the primary CTA color |
| Soft Sky | `#e4eeff` | Info badge backgrounds, subtle blue washes — the pastel counterpoint to Info Indigo, used when a blue element needs a tinted surface rather than a solid fill |

## Typography

### Graphik — Single-family system. Weight 500 carries all emphasis (headings, nav, button labels, card titles) while weight 400 handles body, descriptions, and supporting text. The two-weight discipline creates a binary voice: 500 announces, 400 explains. The tight line-height ratio on display sizes (1.10 at 56px) gives headlines a compact, editorial density rather than airy marketing sprawl.
- **Substitute:** Inter, Geist, Satoshi
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 40px, 56px
- **Line height:** 1.00, 1.10, 1.18, 1.20, 1.33, 1.50, 1.70
- **Letter spacing:** normal at all sizes — the font's natural metrics carry the rhythm

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.7 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.33 | — |
| heading-sm | — | — | 20px | 1.2 | — |
| stats | — | — | 40px | 1.18 | — |
| display | — | — | 56px | 1.1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **cards:** 12px
- **links:** 20px
- **badges:** 12px
- **inputs:** 12px
- **buttons:** 100px

## Components

### Pill Primary Button
**Role:** Main call-to-action button for the highest-priority action on any surface.

Filled with #102126 (Ink Teal), white text in Graphik 500 at 16px, 100px border-radius for full pill shape, padding 12px 24px. Contains a small circular icon (16px, white) to the right of the label, separated by 8px gap. The dark fill against white canvas creates a solid anchor that other elements defer to.

### Outline Pill Button
**Role:** Secondary action or alternative path button.

Transparent fill with 1px border in #102126, #102126 text, Graphik 500 at 16px, 100px radius, 12px 24px padding. Mirrors the primary pill geometry but uses a hairline border to reduce visual weight while maintaining the same click target.

### Announcement Bar
**Role:** Site-wide promotional or update banner at the very top of every page.

Full-bleed #0c67ff (Signal Blue) background, white text in Graphik 400 at 14px, centered content with inline pill-shaped tags (#ffffff background, #102126 text, 12px radius). Includes a close (×) button on the right. The only place this blue appears at full saturation on a large surface.

### Top Navigation
**Role:** Primary site navigation and brand identity header.

White background, 64px height, 1px bottom border in #e9eef0. Logo (Graphik 500, 20px, #102126) left-aligned. Nav links in Graphik 400 at 14px, #102126, with 24px gap between items. A small circular #0c67ff badge with white numeral appears on the 'Careers' link. A globe icon and dark pill 'Book a demo' button anchor the right side.

### Feature Card
**Role:** Individual capability or product feature card in the features section.

White background, 1px border in #e9eef0, 12px border-radius, 24px padding. Contains a full-width isometric illustration at the top (200px height area), followed by a title in Graphik 500 at 20px, #102126, and description in Graphik 400 at 14px, #3d5761. Cards sit in a horizontal scrollable row with 16px gap between them.

### Tab Toggle
**Role:** Segment control for switching between audience views (e.g., Retailers vs Brands).

Two-state pill toggle: inactive tab is transparent with #3d5761 text; active tab has a #f1f7f9 background and #102126 text. 20px border-radius, 8px 16px padding, Graphik 500 at 14px. The active state's pale background creates a subtle inset effect.

### Stats Block
**Role:** Quantitative proof points displayed in a horizontal row.

Large number in Graphik 500 at 40px, #102126, followed by a 2-3 line description in Graphik 400 at 14px, #677b82. No background or border — relies on whitespace and size contrast. The 40px numerals are the only mid-scale type between body and display, creating a clear statistical register.

### Carousel Arrow
**Role:** Navigation control for horizontal scrolling content rows.

Circular 40px button with #102126 fill, white chevron icon, positioned at the vertical center of the card row. Overlaps the content edge to signal scrollability. Appears on both left and right sides of scrollable card sections.

### Info Badge
**Role:** Small status or category tag for labeling content.

12px border-radius, 8px 12px padding. Background #e4eeff (Soft Sky), text #0519d5 (Info Indigo) in Graphik 500 at 12px. The pastel-on-deep-blue combination is the only semantic color pairing in the system, reserved for information classification.

### Section Header
**Role:** Eyebrow label above a major section title.

Graphik 400 at 14px, #677b82, positioned 6px above the main heading. The muted gray creates a whisper-quiet category label that doesn't compete with the section title below.

### Isometric Illustration
**Role:** Decorative line-art graphics that visualize product capabilities.

Thin 1.5px stroke illustrations in #102126 on white card backgrounds, with selective warm fills (#fa4e1d or #fb6338) on 1-2 key objects per illustration. Isometric perspective at 30° angles. No shadows or gradients — pure line work with minimal color blocking. Style is architectural and precise, matching the editorial typography voice.

### Hero Headline
**Role:** Primary page-level headline with inline decorative icons.

Graphik 400 at 56px, #102126, line-height 1.10. Contains 1-2 inline circular icon replacements for words: a blue #0c67ff circle with a white diamond replaces a concept word, an orange #fa4e1d circle with a white arrow replaces another, and the word 'data' sits inside a pill-shaped outline border (1px #102126 stroke, 100px radius). The mixed-media approach turns the headline into a visual composition.

### Featured Surface Card
**Role:** Accent card with warm background for highlighting key content.

Background #fb6338 (Sunset Coral), 12px border-radius, 24px padding. White text throughout: Graphik 500 at 20px for title, Graphik 400 at 14px for description. Used sparingly — the warm surface is a deliberate interruption in the cool palette to draw the eye to a specific feature or testimonial.

## Do's and Don'ts

### Do
- Use 100px border-radius for all buttons, nav items, and interactive pill controls to maintain the consistent tactile geometry
- Reserve #fa4e1d (Ember Orange) for hero iconography and decorative moments only — never for large background fields or body text
- Apply Graphik 500 exclusively for emphasis (headings, labels, button text, card titles) and Graphik 400 for everything else to preserve the two-voice discipline
- Use 1px borders in #e9eef0 for card edges and dividers rather than shadows — the system relies on hairlines and surface color shifts for separation
- Keep the palette monochrome on structural elements (nav, cards, body text) and let chromatic color appear only as functional punctuation
- Set display type at 56px with 1.10 line-height for editorial density rather than the more common 1.2+ ratio that creates airy marketing headlines
- Place isometric line illustrations at the top of feature cards with 200px+ height to let the architectural style breathe

### Don't
- Don't use shadows or elevation effects on cards — the system separates surfaces with hairline borders and subtle background shifts (#f1f7f9, #e4eeff), never with drop shadows
- Don't introduce additional font weights beyond 400 and 500 — the binary voice is the typographic signature
- Don't apply #0c67ff (Signal Blue) to body text, borders, or non-interactive elements — it's reserved for announcement bars, focus states, and active indicators
- Don't use sharp corners (0px radius) on any interactive element — everything from buttons to cards carries a radius of 12px or 100px
- Don't combine warm orange and electric blue in the same component — they are separate accent registers, not co-equal brand colors
- Don't add gradients, textures, or background patterns to the white canvas — the surface must remain clean and architectural
- Don't use font-size values between 20px and 40px for body content — the type scale jumps deliberately from 20px to 40px to maintain the editorial register gap

## Elevation

The system deliberately avoids drop shadows as an elevation strategy. Surface separation is achieved entirely through: (1) hairline 1px borders in #e9eef0 for card edges, (2) background color shifts from #ffffff to #f1f7f9 to #e4eeff for tiered surfaces, and (3) the warm #fb6338 for featured/elevated content. This creates a flat, editorial, almost printed feel — like architectural plans on paper rather than a glass-morphism digital product. The absence of shadows is a signature choice, not an oversight.

## Surfaces

- **Canvas** (`#ffffff`) — Base page background — the dominant surface across all pages
- **Card Surface** (`#f1f7f9`) — Elevated cards, section washes, subtle surface differentiation from the white canvas
- **Info Wash** (`#e4eeff`) — Info badge backgrounds, very light blue tinted surfaces for semantic content
- **Warm Accent** (`#fb6338`) — Featured card surfaces that need to break the cool palette and draw the eye

## Imagery

The visual language is dominated by custom isometric line illustrations rendered in #102126 with selective warm fills (#fa4e1d, #fb6338) on 1-2 key objects per scene. These illustrations depict retail environments — store shelves, supply chains, merchandising layouts — at a 30° isometric angle with thin 1.5px strokes and no shading. The style is precise, architectural, and slightly technical, matching the data-intelligence product positioning. Photography is absent; the illustrations carry all explanatory visual weight. Icons are minimal: simple line or filled shapes in #102126, with occasional white icons on the dark pill buttons. The overall density is text-dominant with illustrations serving as visual anchors at the top of content cards.

## Layout

The page follows a max-width 1280px centered container with generous 80px section gaps creating clear vertical breathing room. The hero is a full-width white band with a centered headline (56px, max-width ~800px) and a single dark pill CTA below. Below the hero, sections alternate between white and #f1f7f9 backgrounds to create band-based rhythm. Feature content is organized in horizontal scrollable card rows (4-5 cards visible, with carousel arrows at the edges) rather than wrapping grids. Stats appear in a clean 4-column row with no dividers between them — relying on whitespace alone. The navigation is a fixed top bar (64px) with a full-width announcement bar above it. Content arrangement is consistently centered or left-aligned — no asymmetric or overlapping layouts. The overall density is spacious and editorial, with each section getting its own full viewport-height band to maintain a calm, unhurried reading pace.

## Similar Brands

- **Linear** — Same disciplined two-weight typography, pill-shaped controls with full rounding, and a monochrome-plus-single-accent color strategy where color appears only as functional punctuation
- **Vercel** — Identical editorial approach: large quiet headlines on white canvas, hairline borders instead of shadows, and a cool-neutral palette with rare warm accent moments
- **Retool** — Same pill-button geometry (100px radius) and the practice of letting product illustrations carry the visual storytelling rather than photography or decorative gradients
- **Pigment** — Similar isometric illustration style for product features and the same approach of using warm accent colors sparingly against a predominantly cool-white interface
- **Pitch** — Shared editorial typography discipline with tight line-heights on display sizes, white-canvas-first design philosophy, and the use of inline icons within headlines as visual punctuation
