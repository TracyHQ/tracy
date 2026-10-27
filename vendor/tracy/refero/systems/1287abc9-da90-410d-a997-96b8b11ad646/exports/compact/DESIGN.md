# Readymag — Style Reference
> Designer's editorial playground — a restrained white shell around bold, magazine-grade color blocks.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Readymag is a designer's editorial playground: a white-canvas product shell wrapped around an unmistakably bold, magazine-grade visual identity. The interface stays restrained — pure white background, near-black text, hairline borders — so the real work happens in feature blocks painted in saturated solid panels (electric violet, cobalt blue, ember orange, pure black, signal yellow). Typography carries enormous personality: a custom geometric display face at 30–80px with aggressively tight negative tracking does the heavy lifting for headlines, while a quieter workhorse sans handles body and UI. Components feel hand-set rather than templated — pill-shaped CTAs, thick section margins, and card surfaces that confidently fill their panels with color instead of nudging content forward with elevation. The result reads less like SaaS and more like a creative agency's homepage.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Violet | `#8800ff` | Headline accents, decorative strokes, feature callouts — vivid violet against the white canvas makes typographic moments feel electric and editorial rather than corporate |
| Deep Violet | `#2c0fb1` | Secondary violet accent, decorative borders and outlines paired with the primary violet for layered brand moments |
| Ember Orange | `#ff5000` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Burnt Orange | `#ec520b` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Signal Yellow | `#ffcc00` | Decorative full-bleed accent bands and section dividers — appears in few places but dominates attention where it does |
| Cobalt Blue | `#1551ff` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Ink Black | `#000000` | Pure black for solid feature card backgrounds and the strongest typographic moments — makes colored cards feel printed, not screen-painted |
| Graphite | `#282828` | Primary text color for body copy, links, and most UI text — the workhorse near-black that keeps reading comfortable without going full contrast |
| Carbon | `#141414` | Slightly deeper text tone used in specific body and border contexts for a richer near-black |
| Near Black | `#0f0e0e` | Heading text color — pushed darker than body for stronger hierarchy against the white canvas |
| Paper White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Fog Gray | `#f4f4f4` | Subtle surface elevation for inputs, inactive controls, and the softest card backgrounds |
| Mist Gray | `#e7e7e7` | Hairline borders, dividers, placeholder fills — the minimum-contrast separator |
| Steel Gray | `#808080` | Muted helper text, icon stroke, and secondary metadata — sits between body text and true gray for ambient labels |

## Typography

### -apple-system — -apple-system — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1, 1.25
- **Letter spacing:** -0.006
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### Readymag Display (custom) — Headlines, display copy, and large feature titles. The signature choice: a geometric sans pushed to 80px with -0.067em tracking, which makes letters visually touch and creates a tightly-set editorial title block. The 0.88 line-height on the 16px bold variant ('xgnl') is anti-conventional and creates stacked, compressed display moments in feature panels. Use for anything that needs to feel like magazine cover type.
- **Substitute:** Suisse Int'l
- **Weights:** 400, 700
- **Sizes:** 12, 14, 18, 30, 32, 40, 80
- **Line height:** 0.88, 1.00, 1.43, 1.83, 2.67, 2.70
- **Letter spacing:** -0.067em at 80px, -0.053em at 40px, -0.05em at 32px, -0.044em at 30px, -0.027em at 18px, -0.025em at 14px, -0.014em at 12px
- **OpenType features:** `"dlig" 0, "liga" 0`

### Graphik — Secondary body and link face for utilitarian contexts where the system stack would feel too generic but full display weight would be wasteful. Its near-zero tracking keeps body paragraphs tight and modern.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12, 16
- **Line height:** 1.50, 2.00
- **Letter spacing:** -0.003em at 16px, -0.002em at 12px

### System UI — Default body and UI text fallback — quietly supports the custom faces rather than competing. Tiny negative tracking (-0.006em) keeps it from feeling like a default browser font.
- **Substitute:** -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.00, 1.25
- **Letter spacing:** -0.006em at 16px
- **OpenType features:** `"liga" 0, "rlig" 0`

### custom_37866 — custom_37866 — detected in extracted data but not described by AI
- **Weights:** 400, 700
- **Sizes:** 12px, 14px, 18px, 30px, 32px, 40px, 80px
- **Line height:** 1, 1.43, 1.83, 2.67, 2.7
- **Letter spacing:** -0.067, -0.053, -0.05, -0.044, -0.027, -0.025, -0.014
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### xgnl — xgnl — detected in extracted data but not described by AI
- **Weights:** 700
- **Sizes:** 16px
- **Line height:** 0.88
- **Letter spacing:** -0.056
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1 | -0.168px |
| body-sm | — | — | 14px | 1.43 | -0.35px |
| body | — | — | 16px | 1.5 | -0.048px |
| subheading | — | — | 18px | 2.67 | -0.486px |
| heading-sm | — | — | 30px | 2.7 | -1.32px |
| heading | — | — | 32px | 1.83 | -1.6px |
| heading-lg | — | — | 40px | 1.43 | -2.12px |
| display | — | — | 80px | 0.88 | -5.36px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 86px
- **Card padding:** 24px
- **Element gap:** 6px

### Border Radius

- **cards:** 16px
- **pills:** 200px
- **small:** 10px
- **panels:** 20px
- **buttons:** 200px

## Components

### Primary Pill CTA
**Role:** Filled call-to-action button (Sign up, Try Readymag)

Pill shape at 200px border-radius, filled in #ff5000 Ember Orange with Paper White text in the custom display face at 14–16px, weight 700. Padding roughly 12px vertical, 24px horizontal. The only warm, saturated button in the system — it must stand alone, not be repeated in clusters.

### Outlined Pill Button
**Role:** Secondary action button (Log in)

Pill shape at 200px border-radius, transparent or white fill, 1.5px border in #0f0e0 Near Black, text in #0f0e0e. Same dimensions as the primary pill so they pair cleanly in a nav row. Never fill the outlined variant with color — its job is to sit beside the orange and not compete.

### Ghost Nav Pill
**Role:** Navigation menu items (Solutions, Pricing, Examples, Templates, Learn)

Same pill radius (200px) but with no visible border or fill at rest, becoming a subtle background on hover. Text in Graphik or system at 14–16px, weight 400, Graphite. The shared pill shape across all interactive elements is the key — it creates a visual vocabulary of capsules floating in the header.

### Solid Color Feature Card
**Role:** Large content card for feature sections (Attract with interactivity, Streamline teamwork)

Full panel filled with #000000 Ink Black or #ff5000 Ember Orange, no shadow, no border. Headline sits directly on the color at 30–40px display weight with white or near-black text. Padding 40–60px. These cards occupy generous screen real estate and are the signature visual element — never reduce them to a compact widget.

### Interactive Demo Panel
**Role:** Editor preview surfaces (drag-and-drop, snap controls)

Filled with #1551ff Cobalt Blue or another saturated brand color, 16–20px corner radius, contains floating UI controls in white pills (Snap, Sizes, Guides, Grid) with small caption text. The panel demonstrates the product by being the product — a self-aware showcase surface.

### Yellow Accent Band
**Role:** Full-bleed horizontal section divider and feature highlight

Saturated #ffcc00 Signal Yellow filling the full width of a section, paired with a white or off-white text panel offset to the right or left. Used sparingly — one or two per page — to break visual rhythm and create a print-magazine page-turn moment.

### Project Showcase Tile
**Role:** Portfolio/grid items in the hero masonry

Variable aspect-ratio rectangles filled with project thumbnails, minimal 4–10px radius, no border, no shadow. Arranged in a loose grid that mimics a designer's moodboard rather than a uniform product gallery. The tiles are the content — no chrome around them.

### Section Heading Block
**Role:** Large left-aligned section title with supporting body text

Display face at 30–40px, Near Black #0f0e0, tight tracking. Body copy below in Graphik 16px Graphite. Optional small eyebrow label above in uppercase caption. Generous top/bottom margin (86px section gap) to let the heading breathe.

### Caption / Eyebrow Label
**Role:** Small uppercase or tight-set labels above headings or inside feature panels

Display face at 12–14px, weight 700, tracking tightened further (-0.025em). Sits above section headlines as a category tag. Sometimes reversed to white on dark cards.

### Layered Display Type Stack
**Role:** Multi-line headline treatment inside solid color cards (Collaborate / Connect domain / Publish / Delete)

Each line in the custom display face at 30–40px, with a small circular bullet or icon marker on one line, and lines layered with partial opacity or overlapping positioning. This is the editorial signature — headlines that feel set in a layout program, not typeset in CSS.

### Footer / Body Link
**Role:** Inline text links in body copy

Graphite #282828 text at 16px Graphik with a subtle underline on hover, or underlined at rest for important inline links. No buttons-as-links; links stay as text.

## Do's and Don'ts

### Do
- Use the 200px pill radius for every button in the system — outline, filled, and ghost controls all share the capsule shape to create a unified button vocabulary
- Reach for the custom display face at 30px or above for any heading; body and subheading sizes (12–18px) belong to Graphik and the system stack, never the display face
- Fill feature cards with solid color (#000000, #ff5000, #1551ff) instead of adding shadows — depth comes from saturation against the white canvas
- Apply the 86px section margin between major page sections to create print-magazine page-turn rhythm rather than SaaS compact spacing
- Use #ff5000 Ember Orange sparingly and only on primary CTAs — one filled orange button per viewport maximum so the signal stays hot
- Tighten tracking aggressively on display sizes: -0.067em at 80px, -0.05em at 32px, -0.014em at 12px — the negative tracking is what makes the display face feel set rather than typed
- Pair any saturated brand panel with white or near-black text only — never put colored text on colored panels, and never put mid-gray on a black card

### Don't
- Do not add drop shadows to cards or panels — Readymag separates elements with solid color, not elevation
- Do not use a corner radius other than the defined scale (10, 16, 20, 200) — avoid 4px or 8px defaults that would read as generic SaaS
- Do not use the orange #ff5000 for anything other than the primary action fill; do not paint large sections with it unless it is a deliberate brand-moment panel
- Do not use the display face below 18px — it loses its geometric personality and starts to feel like a body font that forgot to be quiet
- Do not stack multiple filled colored buttons next to each other in a row — the orange must be alone so the eye lands on it
- Do not put two solid-color feature cards of the same hue adjacent — alternate between black, orange, blue, and violet panels across the page
- Do not use system font for any heading or display moment — even at small sizes the custom face is what makes the brand feel editorial

## Elevation

Readymag avoids shadow-based elevation almost entirely. Instead of lifting cards off the surface, it fills cards with solid color — black, orange, violet, cobalt — and lets the color contrast against the white page do the separation work. Depth comes from color saturation, not drop shadows. Hairline borders at #e7e7e7 handle the rare cases where a neutral surface needs to read as a discrete component. This is a print-editorial approach to depth: full-bleed panels, not floating cards.

## Surfaces

- **Paper White** (`#ffffff`) — Default page canvas and card surface
- **Fog Gray** (`#f4f4f4`) — Subtle elevation for inputs and inactive controls
- **Mist Gray** (`#e7e7e7`) — Borders, dividers, and soft card backgrounds
- **Solid Color Panels** (`#000000`) — Feature card backgrounds and full-bleed dark sections that break the white canvas
- **Saturated Brand Panels** (`#ff5000`) — Full-bleed ember orange feature blocks
- **Interactive Canvas** (`#1551ff`) — Cobalt blue interactive demo surfaces

## Imagery

Readymag's visual language is dominated by its own UI and product showcase rather than traditional photography. The hero is a masonry of user-project screenshots — the platform's own canvas is the imagery, presented without padding, captions, or attribution chrome. Where photography appears, it tends to be high-contrast portrait crops on saturated color backgrounds (the purple-hooded figure in the hero tile) treated as graphic objects rather than lifestyle imagery. There is no illustration system in the traditional sense — instead, the interface uses large solid-color panels and oversized typography as visual content. Icons are minimal: a small filled X (back/close) mark, circular bullet markers, and abstract glyph-like UI controls in the demo panels. Decorative treatment is flat, full-bleed, and unframed — nothing sits inside a card with a border or shadow.

## Layout

The page follows an editorial, magazine-grade vertical scroll. The hero is a full-bleed masonry of project tiles (roughly 3–4 rows, mixed aspect ratios) with no padding from the viewport edges, creating a wall-of-work first impression. Below the hero, the page settles into a max-width ~1200px centered column for the main headline and CTA, then alternates into large, full-bleed colored feature blocks — a black card next to an orange card, a cobalt blue interactive demo — that break out of the centered column. Section rhythm is generous (86px gaps) with occasional full-bleed yellow bands acting as page-turn dividers. The grid is 2-column for feature comparisons and 1-column for solo statements. Navigation is a minimal floating top bar: logo X-mark on the left, a horizontal row of pill-shaped nav items centered or left-aligned, and the outlined Log in + filled orange Sign up pair on the right. No sidebar, no mega-menu, no sticky header pattern beyond a standard fixed nav.

## Similar Brands

- **Squarespace** — Same editorial, design-forward homepage with full-bleed project tiles, oversized headlines, and a single warm accent CTA color against a white canvas
- **Webflow** — Same bold display typography with tight tracking, generous section spacing, and a confident single-color accent (Webflow's blue, Readymag's orange) that drives primary action
- **Framer** — Same restraint of the surrounding shell (white, near-black text) contrasted with saturated full-bleed feature panels, and the same pill-shaped navigation controls
- **Krea** — Same dark canvas moments inside an otherwise light page, and the same creative-tool brand confidence expressed through solid color blocks rather than illustrative decoration
- **Cargo** — Same portfolio-platform editorial heritage — full-bleed masonry of user work as the hero, and the same print-magazine typographic attitude in section headlines
