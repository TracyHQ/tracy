# Fly.io — Style Reference
> surrealist cloud atlas in violet ink

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fly.io reads like a hand-drawn storybook for infrastructure: a near-white canvas washed in the faintest lavender, populated by surreal watercolor creatures and floating landscapes. The voice is two-part — a confident display serif (Mackinac) sets an editorial tone for headlines with aggressive negative tracking, while a humanist grotesque (Fricolage Grotesque) handles body and UI with subtle positive tracking that keeps the prose unhurried. Interactions live in a single vivid violet pill button that pops against the muted canvas, and a deep-violet ink carries all heading weight. Sections breathe between soft sky-to-pink gradient bands, trusting illustration to carry emotion while text and UI stay restrained.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Violet | `#7c3aed` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Deep Ink Violet | `#281950` | Headlines, high-emphasis text, logo mark — anchors the brand without feeling heavy |
| Heather Violet | `#5e537c` | Body copy, paragraph text, subdued UI labels — the workhorse text color that keeps prose warm rather than cold |
| Mist Violet | `#a39ac1` | Secondary text, footer labels, icon strokes, muted links — a washed violet that recedes gracefully |
| Midnight Plum | `#191034` | Footer background, deepest contrast surface — terminates the page with the same hue family as headings, just darker |
| Slate Dusk | `#202237` | Navigation text, dark-mode-leaning neutral — used where a neutral (not chromatic) dark is needed |
| Overcast | `#676b89` | Muted secondary text, helper copy, timestamps — the cool counterpoint to the violet body text |
| Pure Paper | `#ffffff` | Card surfaces, elevated panels, button text on violet fills |
| Lavender Mist | `#e7e6f4` | Hairline borders, card outlines, subtle dividers, inset focus rings — the dominant structural neutral, replacing what would normally be light gray |
| Iris Haze | `#f1f2f9` | Page background, the canvas beneath all content — a barely-perceptible lavender tint rather than pure white |
| Dawn Wash | `linear-gradient(to right, #7dd3fc, #a5b4fc, #f9a8d4)` | Decorative gradient stop — sky-to-pink section bands |
| Plum Veil | `linear-gradient(to right bottom, #a02be4, rgba(0,0,0,0), #4f46e5)` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### Fricolage Grotesque — Body copy, UI labels, button text, navigation, footer, captions. Used at 16–18px for body and 12–15px for meta. The weight 325 light is deliberate anti-convention — most devtools use 400 minimum, this whisper weight softens the dense infrastructure copy into something editorial. Positive tracking (0.025em–0.05em) at small sizes gives uppercase labels and button text a slightly spacious, unhurried feel.
- **Substitute:** Inter, DM Sans, or General Sans
- **Weights:** 325, 450, 500, 575
- **Sizes:** 12px, 15px, 16px, 17px, 18px, 19px
- **Line height:** 1.50–1.66
- **Letter spacing:** 0.025em at body sizes, 0.05em at button/label sizes

### Mackinac — Display headlines and section titles. A high-contrast serif used at weight 500 only — the medium weight gives authority without feeling editorial-stiff. Aggressive negative tracking (-0.045em at 64px, -0.025em at 22–36px) tightens the letterspacing so the serif feels modern rather than traditional. Single most distinctive type choice on the site: pairs a humanist grotesque body with an editorial serif display to create a storybook voice.
- **Substitute:** Source Serif Pro, Tiempos Headline, or GT Super
- **Weights:** 500
- **Sizes:** 22px, 36px, 64px
- **Line height:** 1.15–1.33
- **Letter spacing:** -0.045em at 64px display, -0.025em at 22–36px headings
- **OpenType features:** `"liga" on, "kern" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 18 | 0.6px |
| body-sm | — | — | 15px | 25 | 0.38px |
| body-lg | — | — | 18px | 30 | 0px |
| subheading | — | — | 22px | 25 | -0.55px |
| heading | — | — | 36px | 48 | -0.9px |
| display | — | — | 64px | 74 | -2.88px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96-120px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **nav:** 9999px
- **cards:** 16px
- **small:** 4px
- **inputs:** 10px
- **buttons:** 9999px

## Components

### Pill Navigation Bar
**Role:** Top-level site navigation

Floating pill container at 9999px radius, white (#ffffff) fill, hairline border at #e7e6f4, subtle drop shadow. Holds logo on left, nav links centered, Sign In ghost link and 'Get Started' violet CTA on right. Padding 10px vertical, 12px horizontal inside the pill.

### Primary CTA Button
**Role:** Primary conversion action (Deploy, Get Started, Sign Up)

Vivid violet (#7c3aed) fill, white text in Fricolage Grotesque 16px weight 500, 9999px radius, 10px 20px padding. Soft violet-tinted shadow (rgba(91,33,182,0.1) two-layer) lifts it off the page. Optional right-arrow glyph in white at 14px.

### Outlined Action Button
**Role:** Secondary action (Enterprise Features, Fly.io Security)

Transparent fill, 1.5px solid #7c3aed border, 9999px radius, violet text in Fricolage 16px weight 500, 10px 20px padding. Right-arrow chevron in violet. Used for lower-emphasis but still conversion-oriented actions.

### Ghost Text Link
**Role:** Inline navigation and tertiary actions

No background or border, text in #281950 or #5e537c, underline on hover only. Fricolage 16px weight 450. Used for 'Sign In', 'Learn more', and inline editorial links.

### Display Headline
**Role:** Hero and section titles

Mackinac 64px weight 500, color #281950, letter-spacing -2.88px, line-height 1.15. Two-line structure common; italic word accent (e.g. 'fearlessly') set in the same Mackinac italic if available, otherwise Fricolage italic 500. Sits centered or left-aligned above a 16–18px body paragraph in #5e537c.

### Hero Section
**Role:** Above-the-fold introduction

Full-bleed Iris Haze (#f1f2f9) canvas. Centered display headline stack (max-width 720px) floats over a wide hand-drawn watercolor illustration that extends edge-to-edge. Body paragraph 18px #5e537c, centered, max-width 560px. Single violet CTA below paragraph. Illustration occupies top 40% of viewport behind the text.

### Gradient Feature Band
**Role:** Section transition with illustration

Full-bleed band with linear-gradient background: #7dd3fc → #a5b4fc → #f9a8d4 (left to right). Contains a two-column layout: text block left (60%), illustration right (40%). Headline 36px Mackinac #281950, body 18px #5e537c, single horizontal hairline divider at #e7e6f4.

### Trusted By Logo Strip
**Role:** Social proof

Centered uppercase label 'TRUSTED BY TEAMS AT' in Fricolage 12px weight 500, letter-spacing 0.05em, color #7c3aed. Single horizontal row of 6–8 partner logos below, evenly spaced, each in monochrome dark (#281950) at consistent height ~24px.

### Checkmark Feature List
**Role:** Feature checklist (Enterprise, Pricing)

Vertical stack of 5–7 items. Each row: small violet checkmark glyph (16px, #7c3aed) on left, label text in Fricolage 17px weight 450 #281950 on right. Row gap 16px, no dividers between items.

### Two-Column Feature Section
**Role:** Product/feature explanation with illustration

Max-width 1200px centered. Alternating left-text/right-illustration and right-text/left-illustration columns. Text column: 36px Mackinac headline, 18px body paragraph, 10px hairline divider (#e7e6f4), optional outlined CTA. Illustration column: contained watercolor character scene, max-width 480px.

### Enterprise Feature Card
**Role:** Grouped feature highlight

White (#ffffff) surface, 16px radius, no visible border, sits on Iris Haze canvas. Internal padding 32px. Contains a headline in Mackinac 36px #281950, a 2–3 sentence body, and a row of two outlined action buttons.

### Footer
**Role:** Site-wide footer

Full-bleed #191034 (Midnight Plum) background. White and Mist Violet (#a39ac1) text. Multi-column link grid with column headers in Fricolage 12px uppercase weight 500 letter-spacing 0.05em. Logo mark and copyright row at bottom.

## Do's and Don'ts

### Do
- Use Mackinac at 64px / -2.88px tracking for any hero or section display headline — the serif is the brand's editorial signature, do not substitute it.
- Use #7c3aed Electric Violet exclusively for filled CTA buttons and active nav states; no other saturated color should appear as a button background.
- Apply 9999px radius to all primary buttons and the top navigation container; the pill shape is a defining silhouette.
- Use #5e537c Heather Violet for body copy rather than pure gray — the warm violet tint keeps the page on-brand.
- Use #e7e6f4 Lavender Mist for all hairline borders and dividers instead of neutral gray; the structural neutral should carry the same hue family as the text.
- Space sections with 96–120px vertical gap; the generous breathing room is what makes the whimsical illustrations feel intentional rather than crowded.
- Use the sky→indigo→pink gradient (#7dd3fc → #a5b4fc → #f9a8d4) for full-bleed section bands that introduce illustrated content.

### Don't
- Do not use a display sans-serif for headlines — the Mackinac serif is the single most distinctive type choice and removing it collapses the brand voice.
- Do not use bright or saturated colors other than #7c3aed for any UI element; the system runs on one accent.
- Do not use square or 4px-radius buttons for primary actions — pill shape is mandatory for CTAs and nav.
- Do not use pure black (#000000) for body text; use #281950 Deep Ink Violet or #5e537c Heather Violet.
- Do not apply heavy drop shadows to cards or panels; the design relies on hairline borders and tonal contrast for separation, not depth.
- Do not use tight tracking on body copy or button text; the positive letter-spacing (0.025–0.05em) at small sizes is part of the editorial voice.
- Do not use real photography in place of illustrations — the hand-drawn watercolor style is load-bearing for the brand atmosphere.

## Elevation

- **Primary CTA Button:** `rgba(91, 33, 182, 0.1) 0px 5px 5px -2px, rgba(91, 33, 182, 0.1) 0px 2px 4px -2px`
- **Focused Input/Nav:** `rgba(67, 56, 202, 0.25) 0px 0px 0px 1px inset`
- **Navigation Bar:** `rgba(32, 34, 55, 0.075) 0px 0px 0px 1px, rgba(32, 34, 55, 0.05) 0px 10px 15px -3px, rgba(32, 34, 55, 0.05) 0px 4px 6px -4px`

## Surfaces

- **Iris Haze Canvas** (`#f1f2f9`) — Page background — the lavender-tinted base beneath all content
- **Pure Paper** (`#ffffff`) — Card surfaces, elevated panels, nav pill background
- **Lavender Mist** (`#e7e6f4`) — Subtle elevated washes, gradient band bases, decorative overlays
- **Midnight Plum** (`#191034`) — Footer terminal surface

## Imagery

Imagery is exclusively hand-drawn watercolor illustration with fine ink outlines. Surreal, dreamlike, populated by anthropomorphic characters (fox-like creatures, geometric beings, bird forms) and floating landscape elements — stars, moons, leaves, architectural fragments, abstract organic shapes. Color treatment is pastel: lavender, peach, teal, mint, cream, soft yellow. Illustrations are contained within sections (not full-bleed except as decorative backdrops in the hero) and always sit on the right or behind text. No photography, no 3D renders, no product screenshots. The illustration carries emotional weight while the UI stays restrained.

## Layout

Max-width 1200px centered content. Full-bleed section bands with Iris Haze (#f1f2f9) canvas and occasional sky-to-pink gradient washes. Hero is full-bleed illustration behind a centered headline stack. Below the fold, sections alternate between two-column text+illustration layouts and centered text blocks. Trusted-by logo strip is a full-width centered row. Generous 96–120px vertical section gaps create a quiet, gallery-like rhythm. Navigation is a floating pill at the top center-left, not a full-width bar.

## Similar Brands

- **Linear** — Same violet-tinted dark/light contrast, pill navigation, single saturated accent for CTAs, and confident display typography
- **Vercel** — Similar ultra-clean light canvas with generous spacing, pill buttons, and a single dark text color for hierarchy
- **Stripe** — Same editorial body type treatment with humanist grotesk, soft neutral canvas, and restrained use of a single brand color
- **Railway** — Same devtools audience and pill-shaped navigation, though Fly distinguishes itself with hand-drawn illustration vs Railway's terminal aesthetic
- **Notion** — Similar warm-neutral canvas, light hairline borders instead of heavy shadows, and playful illustrated personality
