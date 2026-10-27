# Ankar AI — Style Reference
> Patent vault opening into white atelier — a darkroom hero with a single illuminated manuscript, dissolving into generous editorial whitespace.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ankar operates as an editorial-monochrome system: strict black, white, and grays with zero chromatic accents. The hero is a full-bleed dark vault with a cinematic radial light burst, where a weight-300 transitional serif headline whispers authority instead of shouting it. Below, the page becomes a white atelier — generous whitespace, four-column feature cards with dark gradient surfaces holding white icons, and a calm sans-serif body. The aesthetic borrows from law journals and architectural monographs: disciplined, quiet, and expensive. Restrained 4px corners on buttons keep the feel precise rather than friendly, and the only typographic flourish is the serif's tight line-height (0.98–1.06) which lets display sizes feel carved rather than stacked.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, hairline borders, icon strokes |
| Paper White | `#ffffff` | Page canvas, card surfaces, text on dark |
| Ink | `#171717` | Filled button background, dark card surfaces, hero base |
| Charcoal | `#1f1f1f` | Dark feature card surfaces, elevated dark panels |
| Graphite | `#515151` | Secondary text, muted labels |
| Slate | `#979797` | Muted helper text, disabled labels, logo grayscale |
| Ash | `#b9b9b9` | Soft surface tint, placeholder backgrounds |
| Fog | `#cfcfcf` | Dividers, input borders, ghost button fills |
| Mist | `#c5c5c5` | Light borders on muted backgrounds |

## Typography

### Switzer Variable — Switzer Variable — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Kibitz Pro Light — Display and heading serif — used at all H1–H4 sizes. Weight 300 is anti-convention: most SaaS uses 600–700 for authority, this whisper-weight conveys authority through restraint. Tight line-heights (0.98–1.06) let large sizes feel carved from a single block rather than stacked lines.
- **Substitute:** Cormorant Garamond Light, Libre Caslon Text, EB Garamond
- **Weights:** 300
- **Sizes:** 24px, 32px, 40px, 48px, 64px
- **Line height:** 0.98–1.06
- **Letter spacing:** -0.01em uniformly
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Switzer — Primary UI and body sans-serif. Weight 400 for body and 500 for nav labels and emphasis. Geometric humanist construction keeps it neutral so the serif can lead.
- **Substitute:** Inter, Manrope, General Sans
- **Weights:** 400, 500
- **Sizes:** 12px, 13px, 14px, 16px, 18px
- **Line height:** 1.30–1.58
- **Letter spacing:** normal
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Space Mono — Monospace for labels, tags, metadata, and code-adjacent micro-copy. Adds technical credibility to the editorial voice.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 12px, 14px
- **Line height:** 1.30–1.58
- **Letter spacing:** normal
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### System sans-serif — Fallback utility text — secondary nav micro-copy and fallbacks. Lowest in the hierarchy; should not appear on hero or feature content.
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body | — | — | 14px | 1.58 | 0px |
| body-lg | — | — | 16px | 1.3 | 0px |
| subheading | — | — | 18px | 1.3 | 0px |
| heading-sm | — | — | 24px | 1.06 | -0.24px |
| heading | — | — | 32px | 1.04 | -0.32px |
| heading-lg | — | — | 40px | 1 | -0.4px |
| display | — | — | 48px | 0.98 | -0.48px |
| display-xl | — | — | 64px | 1 | -0.64px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **nav:** 4px
- **cards:** 4px
- **icons:** 100px
- **links:** 4px
- **buttons:** 4px

## Components

### Primary Filled Button
**Role:** Main conversion action — 'Book a demo', 'Learn more'

Background #171717, text #ffffff, Switzer weight 500 at 14px, padding 10px 16px, border-radius 4px, no border. On dark hero contexts, inverts to white background with #171717 text. No shadow, no gradient.

### Outlined Ghost Button
**Role:** Secondary action on dark surfaces — nav-level 'Book a demo' on hero

Transparent background, 1px border #ffffff, text #ffffff, Switzer 14px weight 500, padding 10px 16px, border-radius 4px. Used only when a filled dark button would be invisible on the dark hero canvas.

### Feature Card
**Role:** Showcases a platform capability with icon, title, and description

Dark surface (#1f1f1f to #171717 with subtle radial gradient wash), white icon (24px, centered top), white title in Switzer weight 500 16px, light-gray (#cfcfcf) description in Switzer 14px below the card. Card itself has no border or shadow — it sits as a tonal block on the white page. Border-radius 4px.

### Testimonial Card
**Role:** Displays a customer quote with portrait, attribution, and CTA

White background, contained image at top (16:9 or similar), quote in Switzer 16px weight 400 in #171717, attribution row with circular avatar, name in Switzer 14px weight 500, role/title in Space Mono or Switzer 12px in #979797. Dark filled 'Learn more' button below.

### Navigation Bar
**Role:** Top-level site navigation

Transparent over hero (white text on dark), turns white with dark text on scroll. Logo 'ANKAR' left in Switzer weight 500 with a small geometric mark. Nav items centered: Switzer 14px, weight 400, with chevron-down carets for dropdowns. 'Book a demo' button right. Padding 16px vertical, max-width 1200px centered. No border, no shadow.

### Carousel Arrow Control
**Role:** Pagination control for testimonial or feature carousels

32×32px square, background #171717, white chevron icon centered, border-radius 4px. Adjacent arrows sit side by side in a centered cluster below the active slide.

### Section Heading Block
**Role:** Opens a content section with eyebrow, title, and optional subtext

Optional eyebrow label in Space Mono 12px with a small icon prefix. Title in Kibitz Pro Light 300 at 40–48px, color #171717, line-height ~1.0, letter-spacing -0.01em. Subtext in Switzer 16px weight 400, color #515151, max-width 640px. Left-aligned by default.

### Logo Bar Item
**Role:** Client or partner logo in social-proof strip

Grayscale logo rendered at native proportion, 32–40px tall, sitting on white with ~48px horizontal padding. No border, no background — the logos themselves carry the weight.

### Hero Light-Burst Canvas
**Role:** Full-bleed dark hero with cinematic radial light burst

Full viewport width, background #000000 base, overlaid with a soft radial gradient emanating from lower-center: warm white core dissolving through muted orange and red into blue and purple at the edges, then fading to black at the corners. Content sits in a centered 1200px column with serif headline, subtext, and CTA.

### Platform Tag
**Role:** Section identifier above a heading — 'Our Platform'

Small icon (12px, filled) + label in Switzer 13px weight 500, color #171717, with 8px gap between icon and text. No background, no border — purely typographic.

### Icon Container (Pill)
**Role:** Circular badge wrapping a feature icon

100px border-radius (effectively full pill), square 48–64px container, dark background with subtle color gradient (blue, red, orange) per card variant, white icon centered.

## Do's and Don'ts

### Do
- Use Kibitz Pro Light at weight 300 for all display and heading text — never bold it to compensate for hierarchy; use size instead
- Set letter-spacing to -0.01em on every serif size from 24px upward
- Use #171717 as the filled button background, not pure #000000 — the slightly lifted black reads as Ink, not a void
- Keep border-radius at 4px for all rectangular UI (buttons, nav items, links) — reserve 100px only for icon containers
- Set section gap to 80px and constrain content to a 1200px max-width centered column
- Use Space Mono 12px for technical labels, metadata, and eyebrow tags — never for body paragraphs
- Let dark surfaces (#1f1f1f, #171717) create visual hierarchy instead of adding drop shadows

### Don't
- Don't introduce chromatic accent colors — the system is strictly monochrome and any color breaks the editorial voice
- Don't use bold (600+) weights for the serif — the whisper-weight is the signature; going heavier flattens the hierarchy
- Don't apply line-height above 1.10 on display sizes — the carved, tight leading is what makes 48–64px feel architectural
- Don't add drop shadows to cards, buttons, or nav — the design is intentionally flat and shadow kills the editorial feel
- Don't use pill-shaped (fully rounded) buttons — 4px corners read as precise and professional, pills would feel consumer/playful
- Don't use the system sans-serif fallback for any user-facing content beyond utility micro-copy
- Don't center-align body paragraphs or long-form descriptions — left-align with a max-width column

## Elevation

- **Navigation bar:** `none — sits flat on the page without shadow`
- **Feature cards:** `none — surface difference (dark vs white) provides hierarchy, not shadow`
- **Testimonial cards:** `none — flat with hairline border if present`
- **Buttons:** `none — contrast and radius define them, no drop shadow`

## Surfaces

- **Paper White** (`#ffffff`) — Base page canvas for all content sections
- **Fog** (`#cfcfcf`) — Subtle dividers, input field backgrounds, ghost button surfaces
- **Ash** (`#b9b9b9`) — Tertiary tinted backgrounds, placeholder zones
- **Ink** (`#171717`) — Filled button surface, header on light pages, carousel arrow controls
- **Charcoal** (`#1f1f1f`) — Feature card dark surface, elevated dark panels
- **Obsidian** (`#000000`) — Hero canvas base, deepest dark for atmospheric sections

## Imagery

Imagery is sparse and editorial. The hero uses an abstract cinematic light burst — a radial gradient of warm white, muted orange, red, and blue dissolving into black — not a photograph. Feature cards hold white flat icons on dark gradient surfaces (no product screenshots, no UI mockups). Testimonial cards use contained customer photographs (lifestyle/portrait, natural lighting) with no filters applied. No decorative photography, no illustration system, no 3D renders. The visual language is closer to a Wall Street Journal feature spread than a typical SaaS site.

## Layout

Max-width 1200px centered column with generous side margins. The page opens with a full-bleed dark hero (100vw) that breaks the column constraint, then settles into a white editorial layout. Section rhythm alternates between content-forward sections (heading + 4-column feature grid) and social-proof bands (logo strip, testimonial carousel). The feature grid is consistently 4 columns at desktop, collapsing to 2 then 1. Navigation is a minimal top bar — logo left, centered nav items, single CTA right — with no sticky behavior visible above the fold. Section dividers are whitespace, not lines.

## Similar Brands

- **Linear** — Same restrained monochrome palette with dramatic dark hero moments, and similar reliance on tight letter-spacing and weight-300/400 typography for authority without boldness
- **Vercel** — Shares the editorial-monochrome voice, minimal border-radius (4px), and the habit of letting full-bleed dark hero sections break out of an otherwise white constrained layout
- **Cursor** — Closely aligned developer-tools / AI aesthetic — dark-to-light hero transition, whisper-weight serif headlines against white atelier sections, monochrome discipline
- **Stripe** — Similar editorial confidence — gradient hero, generous whitespace, sans body with serif accent, and the same restraint in avoiding chromatic UI accents
- **Harvey (legal AI)** — Direct vertical cousin — legal/professional AI brand with the same monochrome editorial voice, large-weight-300 serif headlines, and quiet luxury over loud color
