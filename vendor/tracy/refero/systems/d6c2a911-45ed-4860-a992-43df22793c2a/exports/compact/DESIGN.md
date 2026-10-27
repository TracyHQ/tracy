# Granola — Style Reference
> Field notes on warm parchment — Granola reads like a well-worn Moleskine open on a sunlit desk: serifed headlines with editorial gravity, organic green accents like ink from a plant-based pen, and hairline-ruled card borders that suggest hand-drawn note margins.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Granola pairs a serif editorial headline face (Quadrant) with a humanist mono-inflected UI face (Melange) on a near-white canvas — the tension between old-print warmth and digital utility is the defining atmosphere. The chromatic system is almost entirely olive-green: a single muted-yellow-green (#b2c248 surface, #5b6f00 filled CTA, #788c15 border accents) against hairline-bordered white cards and an off-white page. Everything else is achromatic — dark ink, mid-gray text, and 0.5px solid borders that whisper rather than rule. Typography does the heavy lifting: Quadrant at -0.015em tracking for display sizes drops weight at 68px to feel like editorial print, while Melange's 0.01em tracking at UI sizes keeps body text crisp and warm. The result is a notepad-like surface — quiet, high-contrast text on parchment-adjacent white — punctuated by bursts of organic chartreuse green.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Canvas | `#f7f7f2` | Page background and disabled input surfaces — the barely-warm off-white that reads as paper, not screen |
| Pure Surface | `#ffffff` | Card backgrounds, nav surface, input fills, elevated overlays |
| Midnight Ink | `#0e0f0c` | Primary heading and body text — near-black with the faintest warm undertone that keeps it from feeling harsh |
| Deep Charcoal | `linear-gradient(90deg, #292929 0px, #292929 33.33%, #febe29 40%, #ff91e0 45%, #cebef8 50%, #d2e4f8 55%, #d1e043 60%, rgba(0,0,0,0) 66.67%, rgba(0,0,0,0))` | Nav text, footer text, secondary headings, filled icon fills; Decorative gradient on AI-enhanced copy indicators — transitions from dark charcoal through amber, pink, lavender, sky, chartreuse, then fades transparent |
| Carbon | `#454745` | Medium-emphasis link and body text, supporting secondary labels |
| Slate | `#72726e` | Tertiary nav labels, metadata, muted helper text, secondary icon fills |
| Graphite | `#818179` | List secondary text, overlay-context captions |
| Ash Border | `#e3e3e3` | Hairline dividers, card borders, rule lines across all UI contexts — the dominant structural border color |
| Stone Border | `#d5d5d2` | Button borders on white-fill controls, card-level contained borders |
| Fog Surface | `#eaebe5` | Soft hover state fills, subtle input surface overlays |
| Olive Press | `#b2c248` | Large decorative accent surfaces in product UI mockups — the vivid chartreuse that signals AI-enhanced state |
| Forest CTA | `#5b6f00` | Primary download/action button fill — deep olive-green that feels botanical and grounded against white, not techy |
| Fern Border | `#788c15` | Accent borders, focus-adjacent decorative strokes, icon tints in the green family |
| Sprout Tint | `#e5eacd` | Secondary pill button backgrounds (announcement badge, iPhone download) — the lightest olive wash |
| Twitter Blue | `#1d9bf0` | Social proof badge icons, X/Twitter brand color used in testimonial cards |
| Link Cobalt | `#006fd6` | Inline text links within body copy and social testimonial cards |
| Ember Fill | `#e95d3d` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Ember Border | `#bd4a30` | Orange outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |

## Typography

### Melange — All UI text: navigation, body copy, buttons, labels, card content, footer. Its 0.01em tracking at 13-16px sizes keeps small text from collapsing — the slightly wider-than-normal tracking is the fingerprint of this face at body sizes. Weight 300 appears for light supporting text, 600 for active nav states and strong labels.
- **Substitute:** DM Sans, Instrument Sans
- **Weights:** 300, 400, 500, 600
- **Sizes:** 13px, 14px, 15px, 16px, 20px, 24px
- **Line height:** 1.00–1.50
- **Letter spacing:** 0.01em across all UI sizes
- **OpenType features:** `normal`

### Quadrant — All display headings and hero text. The sole serif in the system — its old-style proportions at 68px with -0.015em tracking give headlines editorial gravity that sans-serif alternatives cannot replicate. At smaller sizes (16-24px) it serves section subheadings with the same print warmth. Weight 400 throughout — heavier weights would destroy the handwritten-note quality.
- **Substitute:** Playfair Display, Lora
- **Weights:** 400
- **Sizes:** 16px, 18px, 20px, 24px, 36px, 48px, 68px
- **Line height:** 1.00–1.40
- **Letter spacing:** -0.015em at display sizes (68px, 48px), +0.01em at smaller heading sizes

### -apple-system / system-ui — Fallback and embedded-content contexts (social card content, badge text, Twitter embed surfaces). Not a deliberate brand choice — follows OS defaults in embedded third-party content zones.
- **Substitute:** Inter, system-ui
- **Weights:** 300, 400, 500, 700
- **Sizes:** 14px, 15px, 16px, 20px
- **Line height:** 1.14–1.50
- **Letter spacing:** normal

### system-ui — system-ui — detected in extracted data but not described by AI
- **Weights:** 400, 500
- **Sizes:** 13px, 16px
- **Line height:** 1.23, 1.5
- **Letter spacing:** 0.01

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.23 | 0.13px |
| heading-sm | — | — | 20px | 1.33 | 0.2px |
| heading | — | — | 36px | 1.25 | -0.54px |
| heading-lg | — | — | 48px | 1.11 | -0.72px |
| display | — | — | 68px | 1 | -1.02px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **inputs:** 8px
- **buttons:** 9999px
- **cardsXL:** 16px
- **tooltips:** 4px
- **pillBadge:** 9999px
- **cardsLarge:** 12px
- **decorativeBlobs:** 64px

## Components

### Primary Download Button
**Role:** Main CTA for app download actions

Background #5b6f00 (Forest CTA), text #ffffff or #fcfcf8, font Melange 16px weight 500, radius 9999px, padding 10px 20px. Hover shifts to #4c5616. Contains Apple logo icon inline-left. The deep olive against white pages is the brand's primary interaction fingerprint.

### Announcement Pill Button
**Role:** Secondary/news banner linked badge

Background #e5eacd (Sprout Tint), text #0e0f0c, border 1px solid #d5d5d2, radius 9999px, padding 8px 16px, Melange 14px weight 400. Trailing arrow icon. Used for 'Announcing our Series C' style callouts — softest action in the hierarchy.

### White Surface Button
**Role:** Tertiary action on tinted or colored backgrounds

Background #ffffff, text #0e0f0c, border 1px solid #d5d5d2, radius 8px, padding 8px 12px, Melange 14px weight 400. Appears on product UI mockups and as in-app controls.

### Ghost Text Button
**Role:** Inline links within social/testimonial content

Background transparent, text #006fd6 (Link Cobalt), no border, radius 9999px, padding 0px 16px. Used for 'Read 25 replies' / 'Read more on X' — follows Twitter's own link convention inside embedded-style cards.

### Social Testimonial Card
**Role:** Twitter/X embed social proof blocks

Background #ffffff, border 1px solid #e3e3e3, radius 12px, padding 16px, box-shadow rgba(0,0,0,0.15) 0px 8px 48px 0px. Contains avatar 40px circle, username in Melange 15px weight 500 #0f1419, handle in Melange 14px #536471, body in system-ui 15px #0f1419, timestamp in #536471, action row with #536471 icons. Inline brand links appear in #006fd6.

### Feature Card
**Role:** Product UI preview cards with tinted background

Background #f7f7f2 (Parchment Canvas), radius 8px, padding 24px, no shadow, border 1px solid #e3e3e3. Contains product screenshot or illustration at full card width. Used in 3-column feature grids.

### Product Note Card
**Role:** In-product UI mockup showing the notepad itself

Background #ffffff, radius 12px, no box-shadow at card level, border 0.5px solid #d5d5d2. Internal rows use 0.5px solid #e3e3e3 hairline dividers. Olive-green (#b2c248) highlight fills span full-width rows to indicate AI-enhanced sections. Text in Melange 13-15px, primary #0e0f0c, metadata #72726e.

### Navigation Bar
**Role:** Top sticky site navigation

Background #ffffff with backdrop-filter blur(16px), border-bottom 0.5px solid #d5d5d2, box-shadow rgba(0,0,0,0.03) 0px 0px 36px. Logo + wordmark left, nav links center in Melange 15px weight 400 #292929, Download pill button right in Forest CTA (#5b6f00) with 9999px radius. Gap between nav items: 16px.

### Logo Marquee Strip
**Role:** Social proof partner/customer logo scrolling band

Background #ffffff, border-top and border-bottom 1px solid #e3e3e3, padding 16px 0. Logos rendered in #292929 or #72726 (desaturated to match brand neutrality). Animated with CSS marquee infinite scroll. No hover states — purely decorative trust signal.

### AI Enhanced Badge
**Role:** Inline label indicating AI processing state

Pill shape, background #e5eacd, border 1px solid #788c15 (Fern Border), radius 9999px, padding 4px 10px, Melange 13px weight 500 #5b6f00. Sparkle/AI icon at 14px in #b2c248 preceding label text. Signals the product's core value prop within the UI mockup.

### Recording Indicator Dot
**Role:** Live recording state status indicator

Circle 8px diameter, background #e95d3d (Ember Fill), border 1px solid #bd4a30 (Ember Border), CSS animation 'blink' at 0.9s ease. Appears in product UI mockups within the note-taking interface to signal active recording.

### Meeting Type Tag
**Role:** Categorical label for meeting template types

Background #ffffff, border 1px solid #d5d5d2, radius 8px, padding 6px 12px, Melange 14px weight 400 #0e0f0c. Examples: 'Customer discovery', '1 on 1', 'Pitch', 'Standup'. Horizontal scrollable row — functions as a filter/tab row inside the product UI preview.

## Do's and Don'ts

### Do
- Use Quadrant weight 400 at -0.015em tracking for all hero and section headings (48px and above); switch to Melange for every UI control, label, and body text instance.
- Apply #5b6f00 (Forest CTA) exclusively for filled primary action buttons — no other UI element should use this deep olive as a background fill.
- Use 9999px border-radius for all pill buttons, announcement badges, and tag chips; use 8px for card containers, inputs, and rectangular controls.
- Maintain 0.5px solid #d5d5d2 or 1px solid #e3e3e3 as the dominant border weight — hairline rules only, never 2px+ borders in the UI.
- Set page background to #f7f7f2 (Parchment Canvas) not pure #ffffff — white is reserved for card surfaces and elevated components that need contrast against the canvas.
- Apply the olive-green spectrum (#b2c248 surface, #5b6f00 text/CTA, #788c15 borders, #e5eacd tints) as a family — never mix with unrelated chromatic accents except Twitter Blue (#1d9bf0) in social embed contexts.
- Keep section vertical rhythm at 64px gaps; use 24px card padding for feature cards and 16px for compact note/list cards.

### Don't
- Don't use Quadrant for UI labels, buttons, or body text — it belongs only to headings and display-scale editorial moments.
- Don't add drop shadows to cards beyond the single social proof card exception (rgba(0,0,0,0.15) 0px 8px 48px) — flat hairline-bordered cards are the default surface treatment.
- Don't use #b2c248 (Olive Press) as a button background or text color — it is a decorative highlight surface in product mockups only, never an interactive element fill.
- Don't apply color backgrounds to full page sections — the page alternates white and parchment (#f7f7f2) only; chromatic backgrounds exist only as small card-level accents.
- Don't letter-space Quadrant headings positively — only negative tracking (-0.015em) or the slightly positive 0.01em for smaller sizes; wide-tracked display serifs would break the editorial compactness.
- Don't use the rainbow gradient (amber→pink→lavender→sky→chartreuse) as a UI element background — it exists solely as an animated text/icon decoration within AI-enhanced copy indicators.
- Don't substitute system fonts (San Francisco, Segoe UI) for Melange in navigation or button labels — the custom face's 0.01em tracking at small sizes is what separates the brand UI from generic system chrome.

## Elevation

- **Floating Nav / Sticky Header:** `rgba(0, 0, 0, 0.03) 0px 0px 36px 0px`
- **Social Proof Card:** `rgba(0, 0, 0, 0.15) 0px 8px 48px 0px`
- **Input / Text Area:** `rgba(0, 0, 0, 0.03) 0px 0px 2px 0px inset`

## Surfaces

- **Canvas** (`#f7f7f2`) — Page background — warm off-white, never pure white at page level
- **Card** (`#ffffff`) — White card surfaces, nav background, input fill backgrounds
- **Tinted Surface** (`#eaebe5`) — Hover fills, soft opaque states, subtle inset surfaces
- **Accent Tint** (`#e5eacd`) — Sprout-tinted button backgrounds for secondary actions and announcement pills

## Imagery

Granola uses product screenshot composites as its primary visual language — no lifestyle photography, no abstract illustration. The hero shows split-panel UI mockups: a raw notes view beside an AI-enhanced view, both contained in borderless floating card frames on the parchment canvas. Video feed thumbnails (user avatar crops at ~60×80px rounded 8px) appear inline with the product UI to simulate a live meeting context. The social proof section is image-free, relying entirely on text-based Twitter card reproductions. The logo strip uses monochrome partner wordmarks (Ramp, Linear, Brex, Replit, Index Ventures) desaturated to #292929 or #72726, no color logos. Icons are minimal and outlined/mono at 16-20px, used sparingly in navigation dropdowns and UI controls. Imagery density is very low — most screen area is white or parchment text surface, with product UI mockups occupying one contained mid-page strip.

## Layout

Max-width approximately 1200px, centered with symmetric horizontal padding. Hero is centered-stack: large Quadrant headline (68px) above a single-line subhead, then one CTA button, then a split product mockup panel below the fold — not full-bleed, the mockup floats on white with a thin border. The page flows in a single continuous white-to-parchment alternation: white nav → white hero → white product demo strip → white logo marquee strip (bordered top and bottom) → feature section on #f7f7f2 → testimonials grid on white → CTA footer. No dark sections at all. Testimonials use a 3-column masonry-like card grid with 16px column gaps. The navigation is a slim centered bar (~56px tall) with blur backdrop, logo left, 4-5 nav links center-spaced at 16px gaps, single pill Download button right. Vertical section gaps are 64px. No mega-menu — hoverable dropdowns with 8px radius white panels and 0.5px borders.

## Similar Brands

- **Notion** — Same serifed-headline + humanist-UI-font split on a near-white canvas, with color used only as small functional punctuation
- **Linear** — Shared hairline-border card treatment and near-zero shadow philosophy — flat surfaces defined by 0.5-1px rules rather than elevation
- **Craft Docs** — Editorial serif headings at large tracking with a single brand accent on an off-white page background, product-UI-as-hero approach
- **Cron / Notion Calendar** — Single bold-green primary action button against an otherwise achromatic light UI with olive/sage brand hue
- **Loom** — Testimonial-heavy social proof grid with Twitter-card style embeds and video-context UI mockups in the product demo section
