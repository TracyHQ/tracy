# Halfhelix — Style Reference
> Gallery wall on white marble — restrained, text-led, photographic

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Domaine operates as a luxury editorial canvas: near-total achromatic palette, one neutral grotesque typeface at weight 400 only, and display-sized headlines that dominate the viewport. The interface recedes so that full-bleed lifestyle and product photography can carry the brand — every UI element is a quiet frame for the image, never a competing surface. Typography is the primary interface: massive stacked words ('Strategy / Creative / Technology / Marketing'), tight tracking, and line-heights approaching 1.0 create a magazine-spread density. Components are minimal and text-driven — ghost links, thin underline rules, 3px corners, no shadows, no filled color buttons. The single chromatic accent (#2749ff) appears so rarely it functions more as a hyperlink convention than a brand color.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure White | `#ffffff` | Page canvas, card surfaces, inverse text on dark blocks |
| Ink Black | `#000000` | Primary text, primary borders, hairline rules, icon strokes, logo |
| Carbon | `#262626` | Dark surface blocks, inverse badges, input fields on dark |
| Graphite | `#484a4c` | Footer borders, subtle dark dividers, secondary dark UI |
| Steel | `#686c6d` | Secondary body text, muted captions, low-emphasis borders |
| Fog | `#a5a7a8` | Disabled borders, lowest-emphasis outlines |
| Ash | `#dbdbdb` | Light dividers, icon borders, subtle field separators |
| Mist | `#ededed` | Soft surface wash behind cards and tags, ghost link fill, badge background |
| Smoke | `#808080` | Mid-tone surface for secondary panels, muted button fills |
| Signal Blue | `#2749ff` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |

## Typography

### Suisse Intl — Suisse Intl — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 24px, 32px, 40px, 48px
- **Line height:** 1, 1.1, 1.2
- **Letter spacing:** -0.04, -0.02, -0.01

### Suisse Int'l — Sole typeface across every context — navigation, body, display headlines, buttons, badges, inputs. The brand carries a single weight (400) and a single letterform language, creating typographic unity without hierarchy through weight. The tight line-heights (1.00–1.20) and negative tracking across all sizes make text feel architectural rather than comfortable.
- **Substitute:** Inter, Helvetica Neue, Neue Haas Grotesk
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.00 (display), 1.10 (headings), 1.20 (body)
- **Letter spacing:** -0.04em at 48px display, -0.02em at 24–40px headings, -0.01em at 14–18px body

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.12px |
| body | — | — | 14px | 1.2 | -0.14px |
| body-md | — | — | 16px | 1.2 | -0.16px |
| subheading | — | — | 18px | 1.2 | -0.18px |
| heading-sm | — | — | 24px | 1.1 | -0.48px |
| heading | — | — | 32px | 1.1 | -0.64px |
| heading-lg | — | — | 40px | 1.1 | -0.8px |
| display | — | — | 48px | 1 | -1.92px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 60px
- **Card padding:** 15px
- **Element gap:** 5px

### Border Radius

- **cards:** 3px
- **pills:** 1440px
- **badges:** 3px
- **inputs:** 3px
- **buttons:** 3px

## Components

### Minimal Top Navigation
**Role:** Primary site navigation

White background, 0 border. Logo flush-left in Ink Black at 14px. Centered nav links (Work, Services, Insights, Partners, Contact) at 14px weight 400 Ink Black with tight 5–10px row gaps. Right-aligned utility icons (bell, chat) at 16px. No background fill, no border, no shadow. Padding 12px vertical.

### Underline Text Link
**Role:** Inline navigation and content links

Ink Black 14–18px, 1px solid Ink Black bottom border applied directly to the text baseline. No background. 3px corner radius does not apply. The underline is the entire visual treatment — no color shift on hover, no fill change.

### Ghost Link Pill
**Role:** Secondary call-to-action

Mist (#ededed) background fill, 3px radius, 10px vertical / 15px horizontal padding, 14px Suisse Int'l weight 400 Ink Black. No border. Appears as a subdued alternative to text links — used for actions like 'About Our Services' and search affordances.

### Full-Bleed Hero Frame
**Role:** Opening viewport

Edge-to-edge photographic background covering the entire viewport. Headline overlays bottom-left in white at 40–48px display weight, tracking -0.04em, line-height 1.0. Small brand tag in 12px white above the headline. No gradient overlay — the image provides its own contrast.

### Project Card (Editorial Grid)
**Role:** Portfolio tile

No visible card chrome. Tall image at native aspect (roughly 3:4) with no border and no radius. Brand name overlaid top-left in white at 18–24px, weight 400, tracking -0.02em. Caption sits in a 3-column grid below the image at 12–13px secondary text color.

### Stat Block Row
**Role:** Quantitative proof points

Inline horizontal arrangement. Large number at 24–32px Ink Black weight 400, descriptor at 12–14px Steel (#686c6d). 3px or 5px gap between number and label. No dividers between stat groups, no background.

### Service Word Stack
**Role:** Service taxonomy display

Vertically stacked words (Strategy / Creative / Technology / Marketing) at 40–48px display, weight 400, line-height 1.0, Ink Black, letter-spacing -0.04em. Each word on its own line. Section label 'SERVICES' above in 12px tracking-out or small-caps style. No decoration, no icons — typography alone carries the hierarchy.

### Stats Inline Annotation
**Role:** Supporting data labels

12–13px text in Steel (#686c6d), 3–5px from the metric value it describes. Used to qualify portfolio numbers and service descriptions.

### Cookie Consent Panel
**Role:** Privacy dialog

Fixed bottom-right, semi-transparent dark overlay (~rgba(0,0,0,0.55)) with white text and 3px radius. Three buttons: 'Accept All' (Ink Black fill, white text), 'Accept Selection' (outlined white border, white text), 'Reject All' (outlined white border, white text). 10px 15px button padding, 3px radius.

### Dark Featured Block
**Role:** Highlighted partner callout

Carbon (#262626) background, white text. Small green certification badge or status icon top-left at 12px. Body copy in 14px white. This is the only block where the palette inverts — used sparingly for high-priority partner or partner-program content.

### Search Field (Header)
**Role:** Quick content search

No visible border. White background, 14px placeholder text in Steel. Magnifying-glass icon at 14px Ink Black. Inline with the navigation row, roughly 280px wide. 3px corner radius only if a background fill is applied.

### Notification Badge
**Role:** Status indicator

Mist (#ededed) or Carbon (#262626) background, 12px Ink Black or white text, 3px radius, 3–5px vertical padding. Appears as a small pill adjacent to utility icons.

### Input Field
**Role:** Form input

No border. 1px bottom border in Ash (#dbdbdb) or no rule at all. 14px Ink Black text, 1.2 line-height. Placeholder in Steel. 3px radius if the field uses a fill. Generous internal padding (10–15px vertical).

## Do's and Don'ts

### Do
- Use Suisse Int'l at weight 400 exclusively — never introduce bold, semibold, or italic variants to create hierarchy; use size and tracking instead
- Set display headlines at 40–48px with line-height 1.0 and letter-spacing -0.04em
- Anchor every interactive element with a 1px Ink Black underline; do not add colored fills to indicate clickability
- Keep corner radii at 3px for all rectangles; use 1440px only for full-pill elements like round tags
- Let photography fill the viewport edge-to-edge with no border, shadow, or radius
- Maintain an achromatic palette: black, white, and the five-step gray scale (#262626 → #dbdbdb) for all UI surfaces
- Use the Mist (#ededed) fill for ghost elements that need subtle separation from white without introducing contrast

### Don't
- Do not add box-shadows to cards, buttons, or images — the system is deliberately shadowless
- Do not introduce additional accent colors beyond Signal Blue (#2749ff), and use it sparingly
- Do not use bold or semibold font weights — weight 400 across the entire typographic system is the signature
- Do not add colored fill backgrounds to buttons; the system uses ghost (Mist fill) and text-link patterns only
- Do not round corners beyond 3px on rectangles — sharp or near-sharp geometry defines the brand
- Do not apply gradients, glows, or decorative color washes to surfaces or text
- Do not increase line-height above 1.2 for body text or above 1.1 for headings — tight leading is a core visual identifier

## Elevation

The design is intentionally shadowless. All separation between elements is achieved through typographic hierarchy, 1px borders in Ash or Ink Black, and subtle Mist (#ededed) surface fills — never through drop shadows, blur, or stacking effects. This creates the flat editorial-gallery feel where photographs appear printed onto the page rather than floating above it.

## Surfaces

- **Canvas** (`#ffffff`) — Page background, default card surface
- **Mist Wash** (`#ededed`) — Subtle elevated card, badge pill, ghost link fill
- **Ash Line** (`#dbdbdb`) — Hairline dividers, low-contrast separators
- **Smoke Panel** (`#808080`) — Mid-tone overlay, muted secondary surface
- **Carbon Block** (`#262626`) — Dark inverse surface for featured blocks and badges

## Imagery

Full-bleed editorial photography dominates the visual language. Imagery is high-quality lifestyle and product photography: extreme close-ups of watches on skin, hands holding objects, furniture details, fashion in nature. All images are sharp, high-resolution, and unframed — they bleed to the viewport edges with no border, radius, or padding. The photographic style is warm-toned, naturally lit, and intimate. There is no illustration, no abstract graphics, and no iconography beyond simple line-based UI icons. The images function as the primary content and emotional carrier; UI is purely structural.

## Layout

Editorial, magazine-inspired layout with three core patterns. The hero is a full-viewport image with headline overlaid in the bottom-left corner, no gradient or scrim. Below, a three-column grid presents portfolio work as equally-weighted image tiles with overlaid brand names — the grid is uniform with no varying tile sizes. The services section uses a two-column asymmetric split: left column holds the vertically stacked display words and section label, right column holds a single paragraph of body copy and a small image collage. Vertical rhythm is consistent at roughly 60px between sections. Navigation is a single minimal row at the top — no sticky behavior visible, no sidebar, no mega-menu. Content is centered within a max-width of 1440px but frequently breaks to full-bleed for hero and image sections.

## Similar Brands

- **Pentagram** — Same editorial gallery approach — massive type, achromatic palette, full-bleed photography, and zero reliance on colored UI to carry the brand
- **Locomotive** — Shared Swiss-typographic discipline with tight tracking, single-weight headlines, and minimal interface chrome that lets imagery lead
- **Hugo & Marie** — Agency sites that treat the portfolio as a printed magazine — high-contrast photography, stacked display words, and ghost-text link patterns
- **Bureau Cool** — Achromatic luxury aesthetic with one neutral grotesque, 3px radii, and an editorial rhythm of image-then-statement
