# Figura — Style Reference
> Black-box gallery with neon-white typography

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Figura operates in a stark monochrome register — a pitch-black canvas (#000000) with white typography that sits on the page like neon signage. The system is built on extreme contrast, not decoration: nothing competes with the words, the work, or the whitespace. White surfaces (the product mockup card) function as proscenium stages that interrupt the dark, creating a cinematic reveal between black sections. The visual attitude is confident and unapologetic — a design studio that bills itself as 'no design thinking theater' should look like one. Type does the heavy lifting: Inter Display in tight tracking for headlines, Geist Mono in wide tracking for small labels, creating a typographic duet between editorial prose and technical metadata.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page background, section canvas — the dominant ground that swallows 80%+ of the screen and gives white text its full charge |
| Paper | `#ffffff` | Primary text, reversed buttons, featured surface cards (product mockup stage) — used sparingly so each white element reads as a deliberate reveal |
| Ash | `#8f8f8f` | Muted helper text, secondary borders, disabled labels — the only non-pure neutral in the palette, carries low-emphasis metadata |
| Charcoal | `#1f1f1f` | First elevation step — subtle panel surfaces that lift content off pure black without breaking the dark mood |
| Graphite | `#333333` | Second elevation step — nested cards or dividers sitting on Charcoal surfaces |
| Bone | `#f0f0f0` | Light neutral used as an off-white card surface, softer than Paper for large background fills that need reduced glare |
| Mist Gradient | `linear-gradient(90deg, rgb(212, 234, 239) 0%, rgb(199, 219, 220) 25%, rgb(228, 232, 228) 50%, rgb(160, 197, 239) 75%, rgb(216, 217, 196) 87.5%, rgb(242, 204, 202) 100%)` | Decorative atmospheric gradient — cool, desaturated pastels (pale blue, sage, blush) used as rare background washes to add tonal depth without breaking the monochrome discipline |
| Fog Gradient | `linear-gradient(90deg, rgb(179, 213, 223) 0%, rgb(179, 211, 225) 25%, rgb(204, 224, 229) 50%, rgb(215, 233, 237) 75%, rgb(202, 221, 225) 100%)` | Secondary atmospheric gradient — a tighter, near-monochrome cool wash for quieter decorative moments |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Inter — Primary typeface for all body copy, headings, and UI. The tight tracking at large sizes (-0.03em at 36px, -0.02em at 32px, -0.01em at 22px) is signature — display headlines pull optically tight to feel compact and architectural rather than airy. Weight 500 for nav, 600-700 for emphasis and subheadings, 400 for body prose.
- **Substitute:** Inter (freely available on Google Fonts and Fontshare — the 'Display' variant in the source data is Inter's optical-size display cut; standard Inter is an acceptable substitute)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 15px, 16px, 18px, 20px, 22px, 32px, 36px
- **Line height:** 1.22, 1.33, 1.36, 1.38, 1.40, 1.43, 1.50, 1.87
- **Letter spacing:** -0.03em at 36px, -0.02em at 32px, -0.01em at 22px, 0 at body sizes

### Geist Mono — Technical labels, metadata tags, timestamps, status text. The wide tracking (+0.02em to +0.04em, with one outlier at +0.10em for an ultra-emphasized label) pushes mono text into a near-architectural-bluelprint register. Pairs against Inter's tight display to create a clear typographic hierarchy: editorial prose vs. technical annotation.
- **Substitute:** JetBrains Mono (Google Fonts) — closest free alternative in weight and proportion
- **Weights:** 500, 600
- **Sizes:** 10px, 12px
- **Line height:** 1.20, 1.33, 1.40
- **Letter spacing:** 0.02em at 12px, 0.04em at 10px, 0.10em for one emphasized label instance

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.4px |
| body | — | — | 15px | 1.5 | 0px |
| body-lg | — | — | 18px | 1.43 | 0px |
| subheading | — | — | 22px | 1.38 | -0.22px |
| heading | — | — | 32px | 1.36 | -0.64px |
| display | — | — | 36px | 1.22 | -1.08px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 32px
- **icons:** 40px
- **small:** 8px
- **buttons:** 56px
- **extraLarge:** 200px

## Components

### Pill Primary Button
**Role:** The single highest-emphasis action on the page

Filled white pill on black canvas. Background: #ffffff, text: #000000. Border-radius: 56px. Padding: 12px 24px. Type: Inter 15px / 600, letter-spacing 0. Inline-block, no border, no shadow. Compact height (~40px) keeps the button feeling like a label rather than a heavyweight UI element.

### Ghost Secondary Button
**Role:** Lower-emphasis companion action

Transparent fill with 1px #ffffff border on the dark canvas. Border-radius: 56px. Padding: 12px 24px. Type: Inter 15px / 500, text: #ffffff. Sits at the same height as the Pill Primary so the two read as a matched pair.

### Top Navigation Bar
**Role:** Minimal global header

Full-bleed black bar, ~64px tall. Logo (wordmark 'FIGURA' with a dot glyph) left-aligned in Inter 14px / 600, white. Nav links right-aligned: 'About', 'Manifesto', 'Services', 'Book a call' — last item separated by a 1px hairline divider at #333333. Links use Inter 14px / 500, white, 8px row-gap between items.

### Product Showcase Card
**Role:** Hero work display — the white stage that breaks the dark flow

Large surface: #ffffff background, 32px border-radius, padding 24-40px. Contains phone mockups arranged in a row. No shadow — the white-on-black contrast itself creates the lift. This card is the visual punctuation that stops the eye mid-page.

### Phone Mockup Frame
**Role:** Product visualization container

Realistic iPhone-frame device with dark bezel, inner screen showing the app UI. Sits on the white Product Showcase Card. No explicit border-radius applied to the frame — uses the device's natural rounded corners (~200px equivalent, matching the extraLarge radius token). Screen content (turf/golf app) is the actual color event in an otherwise monochrome system.

### Partner Logo Strip
**Role:** Social proof band showing past collaborators

Horizontal row of 3-5 logos on the black canvas, right-aligned in the hero, 40px row-gap. Each logo is a simple monochrome icon + wordmark in #ffffff. The 40px border-radius is used for any circular icon elements. Logos share a single baseline, aligned to optical center of the row.

### Centered Statement Block
**Role:** Editorial / manifesto text block

Full-bleed black background. Max-width ~720px, centered horizontally. Headline: Inter 22-32px / 400, white, tight tracking. Sub-text appears 40-56px below. No card background — text floats directly on the void. Vertical padding: 96px top and bottom.

### Hairline Divider
**Role:** Visual separator between nav items or sections

1px tall, 8-16px wide, color #333333. Used in nav between 'Services' and 'Book a call'. Not a full-width rule — a short tick mark that implies a break without drawing a visible line across the page.

### Manifesto Footer Link
**Role:** Single-link minimal footer anchor

Inter 12-14px / 400, white, text-decoration underline at 1px #ffffff. Center-aligned below the last text block. No background, no border — relies on underline as the only affordance.

## Do's and Don'ts

### Do
- Use #000000 as the page background for every section unless the section's purpose is to act as a white proscenium (product showcase, feature card) — then use #ffffff.
- Set all button border-radius to 56px. Buttons must read as pills, never as rectangles.
- Apply -0.03em letter-spacing to display headlines (32px+) and 0 tracking to body text (15-18px). The contrast between tight display and neutral body is the signature.
- Use Geist Mono at 10-12px with +0.02em to +0.04em tracking for metadata, timestamps, status labels, and tag chips — never for body prose.
- Limit color: 95%+ of the page should be pure #000000 and #ffffff. Use #8f8f8f only for true low-emphasis helper text or disabled states.
- Keep section vertical gaps at 96px. The dark canvas needs generous whitespace to let the white text breathe.
- Use 32px border-radius for large surface cards and 8px for small inline elements. Never mix — the jump from 8 to 32 to 56 is intentional and creates the system's geometric rhythm.

### Don't
- Don't introduce a chromatic brand color, accent, or button fill. The system is monochrome by conviction; adding color dilutes the discipline.
- Don't apply drop shadows. Figura uses surface color contrast (#000 vs #fff) as its only elevation mechanism — shadows are noise in a black-box environment.
- Don't use border-radius values outside the defined scale (8, 32, 40, 56, 200). The 200px token is reserved for full-curvature shapes like device mockups, not for cards or buttons.
- Don't center-align body paragraphs longer than 2 lines. Left-align prose; only center-align short statements and headlines.
- Don't use letter-spacing above 0 on Inter at any size above 22px. Tight tracking on display text is the signature — loosening it makes the type look generic.
- Don't add hover states that change color. The dark system can't afford chromatic hover affordances — use opacity (1.0 → 0.7) or a 1px border tick instead.
- Don't place white text on a non-pure-black background. If you need a surface that's not #000, use #1f1f1f or #333333 and confirm the contrast ratio stays above 12:1.

## Elevation

Figura has zero drop shadows. Elevation is communicated exclusively through surface color contrast — moving from #000000 up through #1f1f1f, #333333, #f0f0f0, and #ffffff creates a 5-step elevation ladder without a single shadow. The system treats shadows as visual noise that would compete with the high-contrast typography. White-on-black contrast is the only lift mechanism that matters.

## Surfaces

- **Void Canvas** (`#000000`) — Page background, hero section, all editorial text sections, footer — the default ground
- **Charcoal Panel** (`#1f1f1f`) — First elevation — subtle panel containers that need to separate from void without visual weight
- **Graphite Nest** (`#333333`) — Second elevation — nested cards, input fields, or dividers sitting on Charcoal
- **Bone Stage** (`#f0f0f0`) — Light off-white surface for large cards that need a softer alternative to pure white
- **Paper Procenium** (`#ffffff`) — Top surface — reserved for product mockup cards and filled buttons. Rare; each instance is a deliberate reveal

## Imagery

Imagery is product-first, not lifestyle. The only large visuals are realistic iPhone mockups rendered at full fidelity, presented on white cards as the featured work. The golf app's screen content (turf greens, blue score badges, orange/blue tee selection dots) provides the only chromatic event in an otherwise monochrome system — the color lives inside the product, not in the chrome. No photography, no illustration, no abstract graphics. The site's visual energy comes entirely from typography and the black/white surface contrast.

## Similar Brands

- **Manual (design studio)** — Same dark-canvas-plus-white-type editorial approach with product mockups as the only color event
- **Pentagram** — Stark monochrome layouts that treat typography and whitespace as the primary design system, no chromatic brand color
- **Resend** — Black background with white display type, tight letter-spacing on headlines, and pill-radius CTAs that disappear into the brand
- **Linear (marketing site)** — Same full-bleed dark sections interrupted by single product showcase surfaces, with Inter Display as the primary face
