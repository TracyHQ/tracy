# Mercury — Style Reference
> Alpine banking at blue hour

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mercury operates in an alpine banking aesthetic: a near-black canvas (#171721) sets a cinematic, observatory-like atmosphere where content surfaces float as subtly lighter graphite cards. The interface is overwhelmingly monochromatic — ivory text on onyx, with a single vivid cobalt (#5266eb) acting as the only chromatic punctuation, reserved exclusively for the primary 'Open account' action. Typography carries the weight of expression: a custom display face at intermediate weight 480 (neither bold nor light) paired with a refined body face at weight 400, creating a voice that is confident but never loud. Components are flat and borderless, relying on the 12px-radius graphite card lift and pill-shaped controls to define structure rather than shadows. The full-bleed photographic hero — misty mountains with a solitary desk — establishes aspiration before the product UI takes over, and every subsequent surface maintains that hushed, premium darkness.

## Colors

| Name | Value | Role |
|------|-------|------|
| Onyx Canvas | `#171721` | Dominant page background, hero overlay base, footer and section canvases |
| Graphite Card | `#1e1e2a` | Elevated card and section surfaces — one step lighter than the canvas to create quiet separation |
| Obsidian Button | `#272735` | Secondary button fills, inline form backgrounds, subtle interactive surfaces |
| Slate Border | `#70707d` | Medium-weight dividers and structural borders between content blocks |
| Mist Border | `#e2e3ed` | Light hairline borders, ghost-button outlines, input edges — light-on-dark border |
| Ash Text | `#c3c3cc` | Muted body copy, helper text, secondary labels — reduced hierarchy without losing legibility |
| Ivory Text | `#ededf3` | Primary text, icons, nav items, ghost-button strokes and text — the dominant foreground color across the system |
| Cobalt | `#5266eb` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Pure White | `#ffffff` | Text and icon fills on cobalt primary buttons for maximum contrast |

## Typography

### arcadia — Body and UI typeface — handles navigation, body copy, buttons, inputs, labels, and supporting text at weight 400 for body and 480 for emphasis. The intermediate weight scale (360, 420, 480) instead of standard (300/400/600) gives Mercury's text a distinctly calibrated feel — never bold, never thin, always measured
- **Substitute:** Inter
- **Weights:** 360, 400, 420, 480
- **Sizes:** 12px, 14px, 16px, 18px, 21px
- **Line height:** 1.00–1.50
- **Letter spacing:** 0.005em at 14px, 0.01em at 12px

### arcadiaDisplay — Headline and display typeface — used at weight 480 for all heading sizes from 28px through 65px, with 530 reserved for the largest display moments. Tight line-heights (1.1–1.2) and positive letter-spacing (0.01–0.02em) give display copy a wide-set, architectural quality rather than compressed editorial tightness
- **Substitute:** Söhne Breit
- **Weights:** 360, 480, 530
- **Sizes:** 21px, 24px, 28px, 32px, 42px, 49px, 65px
- **Line height:** 1.10–1.20
- **Letter spacing:** 0.01em at 42px, 0.015em at 32px, 0.02em at 24px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1 | 0.12px |
| body-sm | — | — | 14px | 1 | 0.07px |
| body | — | — | 16px | 1.5 | — |
| body-lg | — | — | 18px | 1.35 | — |
| subheading | — | — | 21px | 1.35 | — |
| heading-sm | — | — | 28px | 1.2 | 0.42px |
| heading | — | — | 32px | 1.15 | 0.48px |
| heading-lg | — | — | 42px | 1.15 | 0.42px |
| display | — | — | 65px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 72px
- **Card padding:** 32px
- **Element gap:** 12px

### Border Radius

- **nav:** 40px
- **tags:** 40px
- **cards:** 12px
- **inputs:** 32px
- **buttons:** 32px
- **default:** 4px

## Components

### Primary CTA Button (Cobalt)
**Role:** The sole chromatic action in the system — reserved for the most important conversion

Filled with #5266eb Cobalt, white text at 16px arcadia weight 400, 32px border-radius (pill), 0px vertical padding with 20px horizontal padding for inline contexts, 40px vertical padding when standalone. No border, no shadow. The vivid blue against the dark canvas makes this button the gravitational center of any page.

### Ghost Outline Button
**Role:** Secondary or tertiary action on dark backgrounds

Transparent background, 1px solid #ededf3 Ivory border, Ivory text at 16px arcadia weight 400, 40px border-radius (pill). Zero padding top/bottom with 20px horizontal padding. Used for navigation links and secondary CTAs where a filled button would overpower the layout.

### Navigation Pill Link
**Role:** Top-bar navigation items with optional dropdown caret

Transparent background, no border, Ivory text at 16px arcadia weight 400, 40px border-radius, 0px vertical / 20px horizontal padding. Floats over the hero image and transitions to a solid dark fill on scroll via backdrop-blur.

### Graphite Card
**Role:** Content grouping surface — product features, feature blocks, and section containers

Background #1e1e2a, 12px border-radius, 32px padding on all sides, no shadow, no border. The one-step lift from the #171721 canvas creates separation through subtle value contrast rather than elevation. Cards sit flat on the dark plane.

### Email Capture Input (Pill, Left-Half)
**Role:** Hero email input with attached submit button

Transparent background, 1px solid #ededf3 Ivory border on left side only, Ivory text at 16px arcadia weight 400, border-radius 32px 0px 0px 32px (left-side pill, flat right edge where it meets the button), 20px left padding. Placeholder text in #c3c3cc Ash.

### Full-Bleed Hero Section
**Role:** Above-the-fold brand statement with photographic atmosphere

100vw × ~100vh, no padding constraints, centered content stack. Headline in arcadiaDisplay at 65px weight 480, subtext in arcadia at 18px weight 480. A full-bleed photographic background (atmospheric landscape) sits behind a subtle dark overlay. Content max-width ~640px centered vertically and horizontally.

### Transparent Top Navigation Bar
**Role:** Primary site navigation overlaid on hero

Full-width, fixed or sticky, transparent background over the hero image. Brand mark (Mercury logo with concentric-circle icon) on the left, nav links centered (Products, Solutions, Resources, About, Pricing), Log in text link and Cobalt 'Open account' pill button on the right. Uses backdrop-blur(8px or 20px) on scroll to create frosted-glass separation.

### Disclaimer Banner
**Role:** Legal/regulatory footnote strip at page bottom

Dark background (matches canvas or slightly lighter), small text at 12px arcadia weight 480 with 0.01em letter-spacing, centered or left-aligned, subtle Ivory or Ash text color. Minimal visual weight — present but never distracting.

### Section Container
**Role:** Horizontal content wrapper between hero and footer

Full-width dark canvas (#171721) with inner content constrained to 1200px max-width, 72px vertical padding. Contains 2- or 3-column grids of Graphite Cards or text+image splits.

## Do's and Don'ts

### Do
- Use Cobalt #5266eb exclusively for the single primary action per page — never as a decorative accent, icon fill, or secondary button
- Set all cards to #1e1e2a with 12px radius and 32px padding — rely on the one-step value lift from the canvas, not shadows, for separation
- Apply arcadiaDisplay weight 480 (not 600/700) for all headings — the intermediate weight is Mercury's signature restraint
- Use 32px or 40px pill radius for all interactive controls (buttons, inputs, nav items) — sharp 4px corners are reserved for structural elements only
- Set body text at 16px arcadia weight 400 with 1.5 line-height — this is the density baseline for all content
- Maintain 72px vertical rhythm between major sections — spacious density is part of the premium feel
- Use ivory #ededf3 on ghost/outline buttons for both border and text — never use a chromatic color for secondary actions

### Don't
- Do not use multiple bright accent colors — Cobalt is the only chromatic note; introducing greens, reds, or oranges breaks the monochrome discipline
- Do not add drop shadows to cards or components — separation comes from the graphite-on-onyx value difference alone
- Do not use bold weights (700+) for headings — arcadiaDisplay at 480 is the ceiling
- Do not use sharp corners (0–4px) on buttons, inputs, or nav items — the pill shape is non-negotiable
- Do not use #ffffff for body text — always #ededf3 Ivory; pure white on dark creates harsh, cold contrast
- Do not place Cobalt-filled elements next to each other without at least 32px gap — the vivid color creates visual competition when clustered
- Do not use bright or saturated backgrounds for sections — every surface is either #171721 (canvas) or #1e1e2a (card); no mid-gray or colored bands

## Elevation

Mercury deliberately avoids shadows. All elevation is communicated through value contrast alone — the graphite card (#1e1e2a) sits one step lighter than the onyx canvas (#171721), creating perceptible separation without any drop shadow. This flat aesthetic keeps the interface feeling modern, digital, and weightless, letting the photographic hero imagery and cobalt accent do the emotional work.

## Surfaces

- **Onyx Canvas** (`#171721`) — Base page background — hero overlay, section canvases, footer
- **Graphite Card** (`#1e1e2a`) — Elevated content surface — product cards, feature blocks, form containers
- **Obsidian Button** (`#272735`) — Interactive surface — secondary button fills, inline form attachments

## Imagery

Cinematic full-bleed photography dominates the hero — atmospheric, aspirational landscapes (misty mountains, isolated desks in nature) that position banking as a contemplative, elevated experience. Photography is high-quality, slightly desaturated with cool tones, and treated with a subtle dark overlay to maintain text legibility. Below the hero, imagery shifts to product UI screenshots and abstract atmospheric backgrounds. No illustrations, no icons-as-art — visuals are photographic or purely functional. Icon style throughout the UI is minimal line/glyph style in Ivory, appearing in nav, buttons, and form elements.

## Layout

Full-bleed dark canvas throughout. Hero is 100vw full-bleed photographic with centered headline + subtext + email-capture form stack (max-width ~640px). Below hero, content flows in 1200px max-width sections with 72px vertical padding, alternating between text-left/image-right 2-column splits and 3-column card grids for product features. Navigation is a transparent top bar overlaid on the hero, transitioning to a frosted-glass (backdrop-blur) solid dark fill on scroll. Footer is dark with disclaimer text. Vertical rhythm is generous — spacious density with large breathing room between sections. No sidebar navigation; all navigation lives in the top bar.

## Similar Brands

- **Wise** — Same dark-canvas + single-accent-color approach to fintech, with pill-shaped controls and flat card surfaces
- **Ramp** — Similar graphite-on-dark card system with minimalist borderless components and a restrained primary accent
- **Brex** — Dark-mode fintech aesthetic with comparable flat card elevation and confident intermediate-weight typography
- **Linear** — Same whisper-weight typography philosophy and dark monochrome canvas with a single chromatic action color
- **Stripe** — Shared approach to generous spacing, intermediate-weight display type, and letting one accent color carry the brand
