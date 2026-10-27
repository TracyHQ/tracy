# Base44 — Style Reference
> sunlit notepad with a lime highlighter

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Base44 operates in a sunlit, near-monochrome workspace language: a warm off-white canvas (#faf9f7) holds flat white cards with whisper-thin borders and almost no shadow, letting air and generous spacing carry the visual weight. Typography splits between a custom geometric sans for UI chrome and a lighter display face for headlines that breathe at 48-56px with tight tracking — authority through spaciousness, not density. Three signature colors punctuate this quiet system: a lime-green CTA (#ebffb1 fill, #ade900 border) that makes the primary action glow like a fresh highlighter, a vivid orange (#ff631f) reserved for the logo and decorative accents, and a sunset gradient band that breaks the monochrome with warmth. Components feel lightweight and fast — fully-rounded pill buttons, 8px-radius cards, ghost inputs, and minimal elevation. Motion is gentle and spring-like (cubic-bezier(0.22, 1, 0.36, 1)) with everything easing into place rather than snapping.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Bone | `#faf9f7` | Page background, section bands, large surface fills — the warm off-white that defines the entire atmosphere |
| Card White | `#ffffff` | Card surfaces, elevated panels, input backgrounds, footer — pure white sitting on the bone canvas |
| Ink Black | `#0f0f0f` | Primary text, filled action buttons, icon strokes, nav color — the dominant near-black that carries all type and the filled dark CTA |
| Graphite | `#232529` | Secondary text, button text, nav strokes — slightly softer than Ink Black for de-emphasized copy |
| Hairline | `#d1d1d1` | Default 1px borders on cards, inputs, dividers — the thinnest structural line |
| Soft Border | `#e6e6e6` | Secondary borders, subtle surface backgrounds — softer than Hairline for nested edges |
| Muted Ink | `#a0a0a0` | Tertiary text, disabled states, muted icon strokes |
| Lime Wash | `#ebffb1` | Primary CTA fill (Start Building button) — a pale lime that glows against the bone canvas like a fresh highlighter mark |
| Lime Edge | `#ade900` | Green accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Ember Orange | `#ff631f` | Logo color, decorative fill accents, secondary action — vivid orange used sparingly to anchor brand identity |
| Sunset Gradient | `linear-gradient(rgba(250, 249, 247, 0) 2.46%, rgb(255, 240, 222) 23.04%, rgb(255, 174, 83) 54.09%, rgba(255, 174, 83, 0) 93.84%)` | Full-bleed section banner — a warm peach-to-coral gradient used as a single atmospheric band between content sections |
| Sky Wash | `radial-gradient(97.22% 78.13% at 50% -21%, rgb(93, 179, 207) 22.39%, rgba(145, 201, 220, 0.56) 58.43%, rgba(250, 249, 247, 0) 85.73%)` | Hero radial gradient — a cool blue-cyan that radiates from the top of the hero section, giving the page an airy open-sky feeling |

## Typography

### WixMadeforText — Primary UI sans — body text, buttons, nav, inputs, badges, all chrome. The geometric forms and slightly expanded tracking on small sizes (0.025em at 12px, 0.18em uppercase) give it a friendly, slightly humanist feel that keeps 16px body text comfortable to scan
- **Substitute:** Inter
- **Weights:** 400, 500, 700
- **Sizes:** 12, 14, 16, 18
- **Line height:** 1.25, 1.30, 1.50
- **Letter spacing:** 0.025em at 12px, 0.18em uppercase at 12px, normal at 16px

### WixMisoRegular — Display headline face — used at 48-56px with tight tracking (-0.02em) and very tight line-height (1.05). The single weight at 400 creates a calm, confident headline that doesn't shout — authority through spaciousness. Body sizes (20-24px) share the same character, keeping the type system coherent across scales
- **Substitute:** DM Serif Display or Source Serif Pro at matching weight
- **Weights:** 400
- **Sizes:** 20, 24, 48, 54, 56
- **Line height:** 1.05, 1.10, 1.20, 1.42
- **Letter spacing:** -0.0200em

### WixMisoLight — Secondary display — lighter weight version for subheadings (25px) and lead body text (17px), creating tonal contrast against the Regular headlines. Same family guarantees harmony while the weight difference adds hierarchy without size jumps
- **Substitute:** DM Serif Display Light or a lighter serif like Lora at matching weight
- **Weights:** 400 (light cut)
- **Sizes:** 17, 25
- **Line height:** 1.20, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.25 | 0.3px |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.1 | — |
| heading-sm | — | — | 25px | 1.2 | — |
| heading | — | — | 48px | 1.05 | -0.96px |
| heading-lg | — | — | 54px | 1.2 | — |
| display | — | — | 56px | 1.05 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **inputs:** 8px
- **buttons:** 9999px
- **large-cards:** 30px

## Components

### Lime CTA Pill
**Role:** Primary action button

Fully rounded pill (9999px radius), filled #ebffb1 with a 1px #ade900 border, #0f0f0f text, 8px/16px padding, 14-16px WixMadeforText weight 500. The lime-on-lime-edge combo makes the primary action glow — it should be the most colorful element on any page

### Ink Filled Pill
**Role:** Secondary dark action

Fully rounded pill (9999px radius), solid #0f0f0f fill with #ffffff text, 0px/21.6px horizontal padding. Used for dark-mode CTAs and 'Get started' variants where the lime pill isn't appropriate

### Ghost Pill Button
**Role:** Tertiary action, suggestion chips

Transparent background, #232529 or #0f0f0f text, 1px #d1d1d1 border, 9999px radius, 8px/12px padding. Used for the suggestion chips ('Reporting Dashboard', 'Gaming Platform') beneath the hero input

### Frosted Nav Pill
**Role:** Sticky header CTA container

Semi-transparent white background (rgba(255,255,255,0.4)) with backdrop-filter blur(6px), 9999px radius, 1px border at rgba(15,15,15,0.15). The frosted-glass treatment makes the nav feel weightless and floating

### Text Link Button
**Role:** Inline nav and footer links

No background, no border, #0f0f0f text at 16px WixMadeforText weight 400. Zero padding — sits inline with nav items. Underline appears on hover only

### Flat White Card
**Role:** Standard content card, FAQ items, feature blocks

Pure white #ffffff fill, 8px radius, 1px #d1d1d1 border, no shadow, 24px padding. The absence of shadow keeps the page feeling flat and architectural — hierarchy comes from background contrast (white card on bone canvas), not elevation

### Soft Shadow Card
**Role:** Hero input container, elevated prompt card

Near-white #fefcfb fill, 30px radius, soft shadow rgba(0,0,0,0.07) 0px 6px 20px 0px. Used sparingly — only for the central hero input and elements that need to feel lifted and interactive. The 30px radius is much larger than standard cards, marking it as a 'focal' surface

### Ghost Input
**Role:** Prompt input, search field

Transparent background inside a Soft Shadow Card container, no border, #0f0f0f placeholder text, 25px top padding, 16px horizontal padding, 28px left padding (for icon). The input feels like writing on a clean sheet rather than filling a form field

### Orange Submit Circle
**Role:** Action trigger inside input

Solid #ff631f fill, circular shape (~40px), white arrow icon centered. The vivid orange against the white card creates a single hot-spot of color — the one moment where the brand orange becomes functional

### Uppercase Eyebrow Label
**Role:** Section labels, category tags

12px WixMadeforText weight 500, letter-spacing 0.18em, uppercase, #232529 color. Used for labels like 'NOT SURE WHERE TO START? TRY ONE OF THESE:' — the wide tracking transforms small text into architectural labels

### Accordion FAQ Row
**Role:** FAQ item

No background, no card — just a 1px #d1d1d1 bottom border, full-width row, question text in WixMadeforText 16px #0f0f0f, plus icon on the right. The flat list with hairline dividers replaces traditional card-based FAQs

### Top Navigation Bar
**Role:** Site header

Sticky header, #faf9f7 background, max-width 1200px centered, logo left (orange disc + black wordmark), nav links centered (Product, Use Cases, Resources, Pricing, Enterprise), language toggle + frosted lime CTA right. Height ~56px

### Sunset Gradient Band
**Role:** Atmospheric section divider

Full-bleed band using the sunset gradient (transparent → peach #ffe0de → orange #ffae53 → coral #ff7f47 → transparent). Used as a single horizontal band between content sections to break the monochrome without requiring a full dark section

## Do's and Don'ts

### Do
- Use WixMisoRegular at 48-56px weight 400 with -0.96px tracking for all primary headlines — the single-weight serif creates calm authority without shouting
- Set all buttons and tags to 9999px (pill) radius — the fully-rounded shape is the system's defining silhouette
- Use #ebffb1 fill + #ade900 border for the primary CTA, never plain black or blue — the lime glow is the brand's signature action
- Maintain hairline borders at 1px #d1d1d1 for all structural dividers — never use heavier borders or visible elevation to separate content
- Keep the page canvas at #faf9f7 (warm bone) and use #ffffff only for cards that need to lift off the canvas — the two-tone surface system is the entire depth model
- Apply the uppercase eyebrow label treatment (12px, 0.18em tracking, weight 500) to all section labels — it transforms small text into architectural wayfinding
- Use cubic-bezier(0.22, 1, 0.36, 1) for all entrance animations — the spring-like ease-out matches the warm, unhurried atmosphere

### Don't
- Don't add drop shadows to cards — the system uses background contrast (white on bone) for hierarchy, not elevation. Reserve the single shadow for the hero prompt card only
- Don't use #ff631f orange on text or large fills — it's reserved for the logo, decorative accents, and the submit circle inside the input
- Don't set headline weight above 400 — the system uses weight and tracking for hierarchy, not boldness. Heavier weights would break the calm, spacious feel
- Don't use saturated blue for links or actions — the system has no traditional 'info blue'; interactive elements are either lime, black, or ghost
- Don't create dark sections — the page is entirely light-mode. Use the sunset gradient band for atmospheric breaks, never a full dark background
- Don't use borders heavier than 1px — the hairline aesthetic is the entire structural language. Thicker borders feel heavy and corporate
- Don't use corner radii below 8px on any surface — the system rounds generously (8px cards, 30px hero card, 9999px pills). Sharp corners clash with the warm, friendly tone

## Elevation

Elevation is deliberately minimal: most surfaces are flat with hairline borders, and the single soft shadow (rgba(0,0,0,0.07) 0px 6px 20px) is reserved for the hero prompt card only. Depth comes from background contrast (white card on bone canvas) and generous spacing, not from stacked shadows. The system treats elevation as an exception, not a tool.

## Surfaces

- **Canvas Bone** (`#faf9f7`) — Page background, large section fills — the warm off-white that defines atmosphere
- **Card White** (`#ffffff`) — Content cards, FAQ rows, standard elevated surfaces — pure white sitting on bone
- **Soft Cream** (`#fefcfb`) — Hero prompt card, focal interactive surfaces — nearly-white cream with the single soft shadow
- **Lime Wash** (`#ebffb1`) — Primary CTA fill — the action surface that breaks the monochrome

## Imagery

Imagery is minimal and product-focused: the hero features a centered prompt-input card (the product itself as the hero visual), followed by full-bleed gradient bands (sky-blue radial wash, sunset horizontal band) that act as atmospheric dividers rather than decorative images. No photography, no stock illustrations, no product screenshots in the visible sections. Icons are simple line/stroke style in #0f0f0f, with the brand logo using a solid orange disc with black horizontal lines (a stylized database/server icon). The visual density is text-dominant with the product UI (the input card) serving as the primary visual anchor.

## Layout

Max-width 1200px centered container with generous side padding. The hero is a full-bleed light section with a centered headline stack (56px display + 18px subtext) and the prompt input card as the visual anchor, all sitting under a sky-blue radial gradient wash. Below the hero, a full-bleed sunset gradient band breaks the monochrome before returning to the bone canvas for content sections. Section rhythm is consistent: large vertical breathing room (~80px section gaps), centered text stacks alternating with asymmetric two-column layouts. The FAQ section uses a split layout: left-aligned heading column and right-aligned accordion list. Navigation is a sticky top bar with frosted-glass CTA pill, logo left, centered nav, and actions right. The footer is a dark band (contrasting with the light body) at the very bottom.

## Similar Brands

- **Linear** — Same single-accent approach — Linear uses a purple action color against a dark canvas; Base44 uses lime against a warm bone canvas with the same restraint
- **Vercel** — Both use generous whitespace, hairline borders, and minimal elevation; Vercel's Geist typography and Base44's WixMiso share the same single-weight display approach
- **Framer** — Same fully-rounded pill buttons, warm off-white canvas, and atmospheric gradient bands breaking up monochrome content sections
- **Notion** — Both use a nearly-monochrome palette with a single vivid accent color, ghost inputs that feel like writing on paper, and generous spacing that lets content breathe
