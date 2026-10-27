# Spécialiste Belge — Style Reference
> Linen-bound brand cookbook. Warm cream paper, black ink, single whispered serif, no decoration beyond the page edge.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Misuko operates as an editorial atelier for beverage branding: a warm cream canvas (#fcf9ee) carries a single custom serif-influenced sans (beausite) set in tight tracking, producing a magazine-spread calm. Every element speaks the same warm-monochrome dialect — black ink, warm-gray dividers, and beige paper — so color is reserved for product photography (cardboard tan) and the occasional pastel icon, never for chrome or decoration. The interface is almost entirely flat: no shadows, no gradients, no rounded corners beyond a single 20px pill on links, and no chromatic button fills — actions are ghost-outlined in black. Information density stays low; breathing room is generous and rhythm is dictated by large display headlines followed by narrow body columns, with three-column service grids and case-study cards doing the structural work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone White | `#fcf9ee` | Page canvas, hero left panel, newsletter input background — the warmest near-white, slightly yellowed like aged paper |
| Linen | `#f2efe3` | Card surfaces, section backgrounds, one decorative button fill — a half-shade deeper than Bone White, reads as the same material under indirect light |
| Pebble | `#bcbab2` | Hairline borders, input outlines, list dividers — warm gray that disappears against the cream, only visible at the exact edge it frames |
| Bark | `#6a6965` | Secondary text, muted body copy, card meta lines — warm dark gray, 5.2:1 on Bone White, carries metadata without competing with primary text |
| Ink Black | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |

## Typography

### beausite — Sole typeface — covers display headlines, section titles, body, nav, buttons, and footer. beausite is a contemporary humanist sans with calligraphic DNA; its soft terminals and slightly flared apertures give the warm-cream palette a hand-set quality that no system font can replicate.
- **Substitute:** Söhne, Inter, GT America
- **Weights:** 400, 500
- **Sizes:** 14, 21, 30, 34, 48px
- **Line height:** 0.97 (display) / 1.08–1.20 (headings) / 1.36–1.79 (body) / 2.86 (hero lead)
- **Letter spacing:** -0.036em (display) / -0.024em (headings) / -0.022em (body) — consistent negative tracking tightens the page into a unified block of type
- **OpenType features:** `"ss02", "ss04", "ss05"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.79 | -0.022px |
| body | — | — | 21px | 1.36 | -0.022px |
| subheading | — | — | 30px | 1.2 | -0.024px |
| heading-sm | — | — | 34px | 1.08 | -0.024px |
| heading | — | — | 48px | 0.97 | -0.036px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48-80px
- **Element gap:** 17px

### Border Radius

- **tags:** 20px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px (rectangular ghost) or 20px (pill links)

## Components

### Ghost Outline Button
**Role:** Primary action trigger (e.g. 'Let's get in touch')

Rectangular ghost button — transparent background, 1px solid #000000 border, 9px 20px padding, beausite 14px weight 400, #000000 text, leading arrow glyph. No fill, no shadow, no radius. The 1px black outline IS the button.

### Pill Link
**Role:** In-text link or tertiary action

beausite 14px weight 400 text, #000000 color, 20px border-radius, 16px vertical padding. Sits inline with body copy. Underline appears on hover only.

### Hero Split Panel
**Role:** Landing hero with copy + product visual

Full-width two-column hero. Left half: Bone White (#fcf9ee) background carrying a 48px weight 400 headline, 21px body paragraph, and ghost button. Right half: warm gray photo panel (~#d4d2cc) containing full-bleed product photography (cardboard boxes, no crop framing). 0px divider between panels — the tonal shift is the divider.

### Service Tier Card
**Role:** Three-column offering (Tailored Advisory, Holistic, Blueprint)

Transparent background, no border, 11px top margin between cards. Headline at 34px weight 400, #000000. Body at 14–21px weight 400, #000000. Bullet lists use small dot glyphs with 15px gap. Pricing/footer metadata at 14px weight 400, #6a6965. Cards sit on the canvas directly — no surface lift, no background card.

### Feature Card with Pastel Icon
**Role:** Capability highlight (Food ERP, Food Traceability, Digital HACCP)

Compact card with a 40px circular icon chip at the top (pastel backgrounds: mint #d6f0e0, pink #f8d6cc, or peach — colors appear only inside the icon circle, never on the card itself). Title in 21px beausite weight 500, #000000. Description in 14px weight 400, #6a6965. 'Learn more' link with right arrow at bottom. No card background, no border, no shadow.

### Case Study Card
**Role:** Inspiring stories grid item

Vertical card in a 3-column grid. Top: 16:9 cover image with sharp corners. Below image: 21px weight 400 title in #000000, date prefix in #6a6965, body excerpt in 14px weight 400 #6a6965. 17px horizontal padding. No border, no shadow — the image edge is the only visual break.

### Newsletter Input
**Role:** Footer email capture

Full-width single-line input on #fcf9ee canvas, 1px solid #bcbab2 bottom border (no top/side borders), 17px horizontal padding, beausite 14px. Placeholder text in #6a6965. Subscribe button text-link sits to the right, no button chrome.

### Top Navigation Bar
**Role:** Global header

Transparent over Bone White canvas. Left: wordmark 'misuko' at 21px weight 500 #000000, followed by 3 text links (Our story, Corporate, Private label) at 14px weight 400 with 20px gaps. Right: language toggle (EN), Login, Cart — same 14px. No underline, no icon, no border. Sits at 17px vertical padding.

### Section Heading Block
**Role:** Opens a content band (e.g. 'From Concept to Success', 'Inspiring stories')

Full-width band on Bone White. Heading 30–34px beausite weight 400 #000000, left-aligned with 17px left padding. Optional right-aligned text link 'View all →' at 14px. No rule line below — whitespace separates from content below.

### Footer Link Column
**Role:** Footer sitemap

Four-column grid on Bone White. Column title in 14px weight 500 #000000 (Orders & Support, About the Services, Social). Links below at 14px weight 400 #6a6965, 11px vertical gap. Newsletter input spans the leftmost column with a 'Stay up to date' subhead in 14px weight 500.

### Pricing Meta Line
**Role:** Service card footer (Monthly Rate, Pricing, Hourly Rate)

Bottom-of-card label group, 14px weight 400. Label text in #000000, value in #6a6965. Tight vertical stack with 5px gap between rows. Sits below a 1px solid #bcbab2 hairline separator.

## Do's and Don'ts

### Do
- Use beausite at every typographic level — never introduce a second family
- Set all display text weight 400 with letter-spacing -0.036em at 48px; tighter tracking is what makes beausite read as editorial
- Build buttons as 1px black-outlined ghosts on transparent or Linen backgrounds — never fill a button with saturated color
- Reserve the entire warm-cream palette (Bone White → Linen → Pebble → Bark) for structure; let photography supply the only chromatic moments
- Maintain 17px element gap and 17–34px card padding as the spatial unit across all cards, inputs, and sections
- Use 0px radius on cards, inputs, and section blocks; reserve the 20px pill exclusively for inline text links and tags
- Set icon backgrounds to soft pastels (mint, pink, peach) inside a 40px circle — keep the card itself colorless

### Don't
- Don't introduce a chromatic brand color, a gradient, or a colored button fill — the system is monochromatic by design
- Don't add box-shadows, drop-shadows, or glows — elevation comes from tonal layering, not blur
- Don't use system fonts (Inter, Roboto, Arial) as a substitute for beausite in a mockup without applying -0.022em to -0.036em tracking — the negative tracking is load-bearing
- Don't round card or input corners — sharp 0px edges are part of the editorial signal
- Don't mix icon styles — all icons should be the same stroke weight and 40px circular pastel background
- Don't place body text below 14px or above 21px in content areas; the 14–21px band is the readable register
- Don't separate sections with full-width rules — let whitespace and the Bone White/Linen tonal shift create the rhythm

## Elevation

The system is intentionally flat: no box-shadows, no drop-shadows, no glows. Elevation is communicated through the warm-cream tonal stack (Bone White → Linen) and through 1px Pebble or Ink Black hairlines. Cards and inputs sit directly on the canvas with no lift — the page reads as a printed sheet, not a stacked UI.

## Surfaces

- **Bone White** (`#fcf9ee`) — Page canvas, hero left half, footer background
- **Linen** (`#f2efe3`) — Card surface, secondary section background, one decorative button fill
- **Ink Black** (`#000000`) — Text and hairline borders — used as a 'surface' only for the rare filled marker

## Imagery

Photography is product-only and occupies roughly 40% of the hero and case-study cards. Treatment: full-bleed within its column, sharp corners (no rounding), no overlay text, no lifestyle context — the cardboard box, the beverage can, the jar is the entire subject. Color treatment is natural and slightly desaturated, leaning into the warm cardboard and kraft-paper palette that matches the cream canvas. No illustration, no 3D, no abstract graphics. Icons are the only non-photographic visual element: simple line glyphs inside 40px pastel circles (mint, pink, peach) that inject the system's only chromatic punctuation.

## Layout

Max-width 1200px centered, with a two-panel hero that breaks full-bleed (Bone White text panel on the left, gray-toned photo panel on the right — no divider, the tonal shift separates them). Below the hero, content flows in single-column bands: section heading (left-aligned 30–34px) followed by either a 3-column card grid (services, case studies) or a 2-column split (text-left / feature-cards-right with pastel icons). Section rhythm is quiet: generous 48–80px vertical gaps between bands, no alternating dark/light sections, no visual dividers. Navigation is a single transparent top bar with text-only links. Footer is a 4-column link grid plus a newsletter input. Density stays low throughout — this is an editorial spread, not a dashboard.

## Similar Brands

- **Aesop** — Same warm cream canvas, black serif-leaning type, and full restraint from chromatic UI chrome — the product photography does the only color work
- **Maude** — Editorial single-typeface discipline with tight negative tracking and a beige/cream monochromatic palette, no shadows or colored buttons
- **Glossier (early)** — Soft cream backgrounds, hairline borders, and ghost-outline buttons that let type hierarchy do all the work
- **Toast (tablerestaurant.com)** — Magazine-spread feel: large display type, generous whitespace, three-column service grids, and zero saturated UI color
