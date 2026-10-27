# Somos incansáveis pra você não precisar ser | Nubank — Style Reference
> Violet signal on white marble — one vivid accent on luminous off-white, all surfaces curved into soft pills.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Nubank operates on a radical one-accent system: a white porcelain canvas, black ink typography, and a single vivid violet that functions as the only chromatic note in the entire interface. The visual grammar is built on pill shapes — buttons, inputs, and links all curve into 999px capsules, giving the system a soft, rounded, approachable personality that softens the severity of high-contrast black-on-white. Typography carries the authority: a custom geometric sans (Graphik) at weights 400-500 with aggressive negative tracking, creating tight, composed headlines that whisper rather than shout. The page breathes — generous 8px-based spacing, large display sizes (up to 56px), and dark photo sections that contrast with otherwise luminous white surfaces. Every interaction surface is a pill, every accent is violet, and every screen feels like a single page from a meticulously typeset magazine.

## Colors

| Name | Value | Role |
|------|-------|------|
| Nubank Violet | `#820ad1` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Deep Iris | `#290b4d` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Dusty Violet | `#714f8f` | Subtle violet washes, disabled violet states, muted brand backgrounds |
| Ink | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Snow | `#ffffff` | Card surfaces, input fills, text on dark backgrounds, page sections over the mist base |
| Mist | `#f4f4f4` | Page canvas, subtle section backgrounds, input field fills — the porcelain tone that defines the overall light theme |
| Stone | `#a2a2a2` | Secondary text, helper labels, placeholder text, icon strokes at rest |
| Concrete | `#b3b3b3` | Hairline borders, dividers, subtle UI separators |
| Smoke | `#777777` | Tertiary text, footer secondary lines, metadata |
| Graphite | `#666666` | Mid-neutral fills, muted backgrounds for nested sections |

## Typography

### Graphik — All interface text — headings, body, buttons, inputs, navigation. The custom geometric sans with weights limited to 400-500 is deliberate: no bold ever appears, so weight contrast is replaced by size contrast, creating a system that whispers through scale rather than shouts through heaviness.
- **Substitute:** Inter, Geist, Manrope
- **Weights:** 400, 500
- **Sizes:** 12, 14, 16, 18, 20, 22, 24, 36, 48, 56
- **Line height:** 1.0–2.8 (tight for display, generous for body)
- **Letter spacing:** -0.0300em at 56px display → -0.0100em at body 16px (tightens as size increases)
- **OpenType features:** `"kern" — kerning is always on across all weights and sizes`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 12px | 1.44 | -0.12px |
| caption | — | — | 14px | 1.44 | -0.14px |
| body-sm | — | — | 16px | 1.5 | -0.16px |
| body | — | — | 18px | 1.5 | -0.18px |
| body-lg | — | — | 20px | 1.44 | -0.2px |
| subheading | — | — | 24px | 1.3 | -0.24px |
| heading-sm | — | — | 36px | 1.2 | -0.648px |
| heading | — | — | 48px | 1.1 | -0.96px |
| display | — | — | 56px | 1.1 | -1.68px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24-32px
- **Element gap:** 16-24px

### Border Radius

- **tags:** 999px
- **cards:** 24px
- **images:** 32px
- **inputs:** 24px
- **buttons:** 999px
- **smallButtons:** 8px

## Components

### Primary Violet Pill Button
**Role:** Main call-to-action across the site

Filled violet (#820ad1) pill with white text at 16px weight 500. Radius 999px, horizontal padding 24px, vertical padding 12-16px. Carries an arrow icon for directional actions. The rounded capsule form is signature — Nubank has no rectangular buttons.

### Ghost Dark Pill Button
**Role:** Secondary action on dark/image backgrounds

Dark semi-transparent fill (#000000 or rgba 0,0,0,0.5) with white text, radius 999px. Used as 'Saiba mais' over product card images. Always pill-shaped, never rectangular.

### Small Radius Button
**Role:** Compact inline action

8px radius variant of the pill system for compact spaces. Violet fill with white text. Used where the full pill is too wide.

### Product Hero Card
**Role:** Full-bleed hero with overlaid form

Dark photographic background spanning full viewport width, with large white display text (48-56px) at left and a floating white card (#ffffff) at right containing a heading, input field, and violet CTA. The card has radius 24px and 32px padding. This pairing of dark image + floating white form is Nubank's signature hero pattern.

### Product Carousel Card
**Role:** Showcase card in a 3-card carousel

Rounded image card (32px radius) with a photo fill, centered white product name overlaid (24px weight 500), and a ghost dark pill button ('Saiba mais') at the bottom. Cards overlap slightly in the carousel. Height approximately 400px, aspect ratio roughly 3:4.

### Pill Input Field
**Role:** Text input for forms (CPF, email, etc.)

Rounded input with 24px radius, light gray fill (#f4f4f4), placeholder text in Stone (#a2a2a2), body text 16px. No visible border by default. Feels soft and approachable rather than clinical.

### Navigation Bar
**Role:** Top-level site navigation

Light mist (#f4f4f4) background, Nubank 'nu' logo in violet at far left, horizontal nav items in black (16px weight 500) with dropdown carets, search icon, a ghost outlined 'Login Empresas' button, and a filled violet 'Quero ser Nubank' pill button at far right. No heavy borders — sits cleanly on the canvas.

### Dark Footer
**Role:** Site-wide footer with links and contact

Full-width black (#000000) background, white text links in a 4-column grid, social icons in a row, legal copy at bottom in small Stone-toned text. Section headings in white weight 500, phone numbers in white. The dark surface is the visual counterweight to the light page.

### Inline Text Link
**Role:** Hyperlink within body text

Violet (#820ad1) text, no underline at rest, underline on hover. Weight matches surrounding text. Sits naturally in body copy without visual weight change.

## Do's and Don'ts

### Do
- Use the 999px pill radius for every button, input, and tag — rectangular buttons break the brand
- Apply Nubank Violet (#820ad1) as the only chromatic accent in any view; never introduce a second hue
- Set letter-spacing to -0.0100em or tighter on all text; positive tracking would destroy the composed feel
- Use Graphik weight 400 for body and 500 for emphasis; never use bold (700) — the system doesn't have it
- Float white cards on the mist (#f4f4f4) canvas with 24-32px padding to create depth without shadows
- Keep dark image sections full-bleed; let them break the 1200px container for visual punctuation
- Size display headlines at 48-56px with line-height 1.10 to match the magazine-like editorial scale

### Don't
- Don't add drop shadows, elevation, or glow effects — Nubank uses surface contrast only
- Don't use sharp corners on interactive elements; the pill is the brand's most recognizable shape
- Don't introduce a second accent color or background tint beyond violet, white, mist, and black
- Don't use bold or extra-bold weights; the type system stops at 500 and relies on size for hierarchy
- Don't put violet fills on large background areas — violet is for actions and small accents only
- Don't use positive letter-spacing; all text should feel optically tightened
- Don't mix icon styles; use a single stroke-based icon family at 1.5-2px weight

## Elevation

Nubank avoids drop shadows entirely. Depth is communicated through surface contrast — white cards float on mist canvas, dark images anchor sections. The pill geometry and generous spacing do the work that shadows would do in a conventional system.

## Surfaces

- **Mist Canvas** (`#f4f4f4`) — Base page background — the porcelain surface everything floats on
- **Snow Card** (`#ffffff`) — Product cards, form cards, input fields — lifted off the mist canvas
- **Ink Surface** (`#000000`) — Dark hero image overlays, full-dark footer — dramatic contrast sections

## Imagery

Photography dominates: large full-bleed aerial and lifestyle photos anchor hero sections and product cards. The stadium hero shot (aerial drone view of a branded arena) is editorial in scale. Product carousel cards use intimate lifestyle photography — people in natural moments (laughing, swimming, working). All photos are treated with full-bleed framing inside 32px-radius masks. No illustrations, no abstract graphics, no 3D renders. The photography is bright, warm-toned, and human — the opposite of clinical fintech imagery.

## Layout

Max-width 1200px centered container, but hero sections and footer are full-bleed. The hero pattern is consistently: dark full-viewport image left, floating white form card right. Below the fold, the rhythm alternates between white sections and the carousel of product image cards. Section spacing is generous (64px gaps) creating room to breathe. Navigation is a minimal top bar — no sidebar, no mega-menu, just horizontal links with caret indicators. The overall flow is: full-bleed dark hero → white product showcase → more white content sections → full-bleed dark footer.

## Similar Brands

- **Revolut** — Same pill-button language and single-accent-on-light-canvas approach, though Revolut uses black as its dominant accent rather than violet
- **Monzo** — Similar rounded-soft component geometry and clean light surfaces, though Monzo leans more colorful with coral and yellow
- **Wise (TransferWise)** — Same white-canvas-plus-one-bold-accent strategy, with generous spacing and confident display typography
- **Klarna** — Shares the pill-button system and light background with single accent color (pink for Klarna vs violet for Nubank)
- **Cash App** — Same commitment to a single brand color as the only chromatic note in the interface, with clean white surfaces
