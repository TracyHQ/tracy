# Home — Style Reference
> Warm editorial atelier. Cream paper, charcoal ink, and one ember-orange period of emphasis — a job platform that feels like an art-book spread photographed under amber light.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Parallel operates as a warm editorial atelier: a cream-paper canvas (#e4dfd9) hosts product surfaces in white, photography is presented in full-bleed cinematic crops with deep blacks and amber-warm lighting, and the only chromatic punctuation is a small ember-orange dot that marks emphasis. Typography carries a dual-register system — a weight-500 editorial display face (Rules Font) for headlines and a neutral system sans-serif for everything functional — letting headings feel hand-set while the UI stays quiet and utility-driven. Components are physically restrained: 20px card radii, 8-12px button radii, hairline #c7c7c7 dividers, a single soft shadow for elevation, and pill-shaped toggles. The design vocabulary is closer to a magazine layout than a SaaS dashboard — generous breathing room, aligned text blocks, and photography treated as the hero, not the accent.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#e4dfd9` | Page background canvas, hero overlays, editorial section backdrops — the warm off-white that sets the entire system apart from generic SaaS grays |
| Pure White | `#ffffff` | Card surfaces, product UI mockups, input fields, text on dark photography |
| Charcoal Ink | `#000000` | Primary text, strong borders, icon strokes, logo wordmark — the maximum-contrast voice |
| Near Black | `#050505` | Body text and heading color for subtle warmth below pure black |
| Pressed Graphite | `#171717` | Filled button backgrounds, dark UI surfaces, photo overlay scrims |
| Slate | `#737373` | Secondary text, subtle heading borders, metadata — the 60% voice |
| Iron | `#4b4b4b` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Stone | `#999694` | Muted body text, caption-level copy, placeholder text |
| Pewter | `#666666` | Hairline borders on low-emphasis elements, dividers |
| Fog | `#c7c7c7` | Hairline borders, subtle dividers, ghost outlines — the most frequent border color in the system |

## Typography

### Rules Font — Editorial display face for all headings — the weight-500 medium is deliberately non-bold, creating a literary, hand-set quality rather than a SaaS marketing shout. Tight -0.02em letter-spacing at 69px tightens the large headline to a single confident line. Substitute: 'Söhne Breit', 'GT America', or 'Inter' at weight 500
- **Substitute:** Söhne Breit Medium or GT America Medium
- **Weights:** 500
- **Sizes:** 28px, 69px
- **Line height:** 1.10, 1.40
- **Letter spacing:** -0.02em at all sizes (≈ -0.56px at 28px, -1.38px at 69px)

### ui-sans-serif — System sans-serif for all functional text — body copy at 400/16px, UI labels and button text at 500, emphasized sub-labels at 600. The neutral system face keeps the interface quiet so the Rules Font headlines carry all the personality. Substitute: 'Inter', 'Söhne', or 'Geist'
- **Substitute:** Inter or Söhne
- **Weights:** 400, 500, 600
- **Sizes:** 14px, 16px, 19px, 23px
- **Line height:** 1.20, 1.40, 1.50
- **Letter spacing:** -0.02em at all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.2 | -0.28px |
| body | — | — | 16px | 1.5 | -0.32px |
| subheading | — | — | 19px | 1.4 | -0.38px |
| heading-sm | — | — | 23px | 1.4 | -0.46px |
| heading | — | — | 28px | 1.4 | -0.56px |
| display | — | — | 69px | 1.1 | -1.38px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 24-32px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **cards:** 20px
- **icons:** 8px
- **inputs:** 12px
- **buttons:** 8px
- **pillButtons:** 9999px

## Components

### Navigation Bar
**Role:** Top-level site navigation

Transparent or cream background, logo 'parallel' in Rules Font weight 500 at 28px in Charcoal Ink on the left, pill-shaped Talent/Employers toggle in center (12px radius, 18px horizontal padding, weight 500), ghost 'Sign in' text link and filled 'Find work' button (Pressed Graphite background, white text, 12px radius) on the right. Height auto with comfortable vertical padding.

### Pill Toggle (Talent/Employers)
**Role:** Audience switcher

Segmented control with 12px radius, active tab has white background with subtle shadow rgba(0,0,0,0.07) 0px 6px 27px, inactive tab is transparent on cream. Text at 14px weight 500 in Charcoal Ink. 8px gap between segments, 18px horizontal padding per segment.

### Ghost Button (Sign in)
**Role:** Low-emphasis action

No background, no border, text only in Charcoal Ink or Iron at 14-16px weight 500. 8px horizontal padding, 8px vertical padding.

### Filled Dark Button (Find work / Read more)
**Role:** Primary action

Pressed Graphite (#171717) background, white text at 14-16px weight 500, 8px border-radius, 18px horizontal padding, 10px vertical padding. Optional subtle shadow rgba(0,0,0,0.07) 0px 6px 27px for elevation.

### Hero Search Input
**Role:** Primary discovery input

Full-width white surface with 12px border-radius, subtle border in Fog (#c7c7c7), 16-24px horizontal padding, placeholder text 'What are you looking for?' in Stone (#999694) at 16px. Circular arrow button on the right side, 40px diameter, Charcoal Ink background, white arrow icon.

### Secondary Text Link (I'm not sure)
**Role:** Tertiary action

No background, text only in Charcoal Ink at 14px weight 500, underline on hover. Sits centered below the search input with 8-12px gap.

### Hero Display Headline
**Role:** Page-level headline

Rules Font weight 500 at 69px, white text, line-height 1.10, letter-spacing -1.38px. Followed by an Ember Dot (#ff6a1f) as a period/accent — the single chromatic moment. Centered over full-bleed photography.

### Feature Card
**Role:** Product capability showcase

White surface (#ffffff) on cream canvas, 20px border-radius, 32px internal padding, subtle drop shadow for separation. Contains a product UI mockup (mini search, chat input, or profile card) at top and a heading + body text stack at bottom. Heading in Rules Font weight 500 at 23px, body in system sans-serif at 16px weight 400 in Slate.

### Product UI Mockup (embedded in cards)
**Role:** In-context product preview

Small-scale white card components nested inside feature cards — search bars, chat inputs, profile badges. Use 8-12px radii, 91% match-score badge in ember-orange or green, small profile avatars with work-experience metadata.

### Full-Bleed Image Card
**Role:** Cinematic content section

Edge-to-edge photograph with 16-20px border-radius, dark scrim overlay in Pressed Graphite at ~40% opacity, centered CTA button floating at bottom. Image fills the card entirely — no padding inside.

### 3D Brand Mark (Large P Logo)
**Role:** Brand identity element

Large metallic/silver 3D rendered 'P' logo, centered in cream section space. Functions as a visual anchor between text blocks — not a UI component but a signature brand artifact.

### Live Status Indicator (23,237 new jobs)
**Role:** Real-time data signal

Small Ember Dot (#ff6a1f) bullet followed by text in system sans-serif at 14px weight 500 in Charcoal Ink. Indicates liveness and scale without being aggressive.

### Section Heading Block
**Role:** Editorial section title

Rules Font weight 500 at 28px, Charcoal Ink, left-aligned, followed by body text block in system sans-serif at 16px in Slate. Max-width ~500px for comfortable reading measure.

### Job Tag Chips
**Role:** Categorical filters or suggested roles

Small pill-shaped tags with 9999px radius, white or cream background, 10-12px vertical padding, 14-18px horizontal padding, text at 14px weight 500. Border in Fog (#c7c7c7) at 1px.

## Do's and Don'ts

### Do
- Use Cream Paper (#e4dfd9) as the default page background for all non-photography sections — never switch to pure gray or pure white canvas
- Apply Rules Font weight 500 at 28px or 69px for all headlines, with -0.02em letter-spacing — never use weight 600+ or bold variants
- Set card border-radius to 20px for all card surfaces, and 8px for standard buttons, 12px for inputs, 9999px for pill toggles and tag chips
- Use the single Ember Dot (#ff6a1f) accent for live-status indicators, the period after hero headlines, and match-score badges — never apply it to large fills, backgrounds, or button states
- Set card padding to 32px on all feature cards and product surfaces
- Use Pressed Graphite (#171717) as the filled button background with white text for primary actions
- Maintain section gaps of 24-32px and element gaps of 8px to preserve the comfortable, editorial breathing rhythm

### Don't
- Don't introduce additional chromatic colors — the system is intentionally monochrome with one ember accent; adding blues, greens, or other hues breaks the editorial discipline
- Don't use bold (700+) or heavy weights for headlines — the Rules Font at weight 500 is the signature restraint
- Don't apply drop shadows beyond the single soft pattern rgba(0,0,0,0.07) 0px 6px 27px — avoid colored, multi-layer, or hard shadows
- Don't use pure black (#000000) as a filled button background when Pressed Graphite (#171717) is available — the slight warmth matters
- Don't set border-radius to 4px or 0px on cards or buttons — the 8-20px range is the system's tactile signature
- Don't use more than one chromatic element per viewport — the Ember Dot should feel like punctuation, not decoration
- Don't apply the 69px display size to subheadings or body text — reserve it for hero-level headlines only

## Surfaces

- **Cream Paper** (`#e4dfd9`) — Base page canvas — the warm off-white that defines the entire system's atmosphere
- **Pure White** (`#ffffff`) — Card surfaces, product mockup containers, input fields — sits one step above the cream canvas
- **Pressed Graphite** (`#171717`) — Dark UI surfaces, photo scrims, filled button backgrounds
- **Charcoal Ink** (`#000000`) — Maximum-contrast overlay surfaces, deep photography zones

## Imagery

Photography is the dominant visual element, presented in full-bleed cinematic crops with deep blacks and warm amber/incandescent lighting. Subjects are people in motion or candid states — dancers, workers, professionals — shot with shallow depth-of-field and warm color grading. Images are used as hero backgrounds (edge-to-edge, with text overlay in white), as content cards (with dark scrim overlays and floating CTAs), and as section dividers. No illustrations, no 3D product renders, no abstract graphics — the photography IS the visual identity. The 3D metallic P logo is the only non-photographic visual element, functioning as a brand artifact rather than a UI component. Icons throughout the UI are line-based, minimal stroke weight, monochrome in Charcoal Ink.

## Layout

Full-bleed hero with centered headline and search input overlaid on dark photography, transitioning to cream-paper editorial sections with generous max-width 1200px contained layouts. Feature cards arranged in 3-column grid on cream background. Section rhythm alternates between photographic full-bleed bands and quiet text-and-card blocks. Navigation is a top bar with transparent-to-cream behavior. Content blocks are consistently left-aligned with comfortable reading measure (~500-600px). The overall page reads top-to-bottom as: cinematic hero → editorial manifesto → product feature grid → photographic CTA section.

## Similar Brands

- **Substack** — Same warm cream-paper aesthetic, editorial Rules-Font-equivalent headlines, and full-bleed photographic heroes with centered text overlay
- **Are.na** — Monochrome editorial platform with generous breathing room, weight-500 display headings, and photography treated as first-class content
- **Linear** — Restrained monochrome palette, single soft shadow pattern, and 8-20px border-radius system for cards and inputs
- **Notion** — Comfortable spacing rhythm, system sans-serif for body with a distinct display face for headings, and minimal elevation philosophy
