# Speakeasy — Style Reference
> Editorial broadsheet on a white field with a rainbow ribbon

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Speakeasy is a near-monochromatic editorial system built on a vast white canvas, with one extraordinary move: a custom serif (Tobias) rendered at weight 100, stretched to 140px headlines that whisper rather than announce. The interface feels like a high-end print magazine that accidentally became a product page — generous breathing room, hairline dividers, flat surfaces, and a single vibrant gradient hairline at the page's top edge that acts as a signature ribbon. Color is rationed like ink: black and a warm gray scale do nearly all the work, while small chromatic accents (green, orange, yellow, violet, red) appear as functional punctuation inside icons, badges, and feature illustrations. Components are deliberately flat — borders over shadows, small radii, compact spacing — letting the type and the top rainbow gradient do the brand-building.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Paper White | `#ffffff` | Page and card surfaces, button text on dark fills, inverse text on black |
| Ash Gray | `#dbdbdb` | Default hairline borders, dividers between sections, the most-used neutral border |
| Carbon | `#242424` | Navigation borders, deep surface tone, alt black for softer contrast |
| Graphite | `#545454` | Body text, icon strokes, secondary text, muted UI labels |
| Smoke | `#969696` | Tertiary text, placeholder labels, disabled icon outlines, decorative dot fields |
| Slate | `#7a7a7a` | Muted helper text, subtle borders, supporting metadata |
| Bone | `#e7e7e7` | Light borders, subtle surface separators, ghost button outlines |
| Iron | `#414141` | Icon strokes, dark borders, button shadows, dense text |
| Obsidian | `#333333` | Filled button background — the system’s only CTA fill, paired with white text |
| Mist | `#f1f1f1` | Subtle elevated surfaces, off-white section bands, card hover wash |
| Cinder | `#121212` | Deepest text and badge backgrounds, near-black accent |
| Signal Green | `#009966` | Green outline accent for tags, dividers, and focused UI edges |
| Spring Mint | `#00bc7d` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Fern | `#00d492` | Soft badge backgrounds, callout fills, gradient end-stop |
| Ember Orange | `#e17100` | Icon strokes and feature-card illustrations — the warmest functional accent in iconography |
| Marigold | `linear-gradient(90deg, rgb(51, 15, 31) 0%, rgb(200, 50, 40) 12.56%, rgb(251, 136, 65) 25.06%, rgb(211, 221, 146) 37.56%, rgb(89, 130, 79) 50.06%, rgb(0, 36, 20) 62.06%, rgb(0, 20, 61) 74.06%, rgb(40, 116, 215) 86.06%, rgb(153, 194, 255) 97.06%)` | Vivid icon fills, alert-tinged highlights, gradient mid-stop; The signature top-of-page gradient hairline — 9-stop spectrum from maroon through amber, green, indigo, to sky |
| Amber | `#ffb900` | Tag/badge backgrounds, warm highlight washes, featured callout fills |
| Coral | `#ff6467` | Red outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |
| Iris Blue | `#155dfc` | Link and icon accent — the only saturated blue, used sparingly for emphasis strokes |

## Typography

### ui-sans-serif (system) — UI chrome — nav labels, buttons, badges, table data, form fields. Renders as a system font (San Francisco / Segoe UI / Roboto fallback). Small sizes (9–13px) handle the dense secondary UI; 16–18px for button text. Wide tracking (0.05em) on uppercase micro-labels like “THE PROBLEM”.
- **Substitute:** System UI sans (San Francisco / Segoe / Roboto)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 9px, 10px, 11px, 12px, 13px, 14px, 16px, 18px
- **Line height:** 1.43–1.75
- **Letter spacing:** 0.0030em body, 0.0500em uppercase micro-labels
- **OpenType features:** `"calt", "rlig", "ss01"`

### Tobias — Display and headline serif — used at massive sizes (up to 140px) for hero statements, section openers, and oversized editorial moments. The weight-100 thinness is the brand’s single most distinctive choice; it makes headlines feel engraved rather than printed. No system font replicates this — substitute with a hairline serif (e.g. “Tobias”, “GT Super”, or “Fraunces 100”).
- **Substitute:** GT Super Thin, Fraunces 100, or any high-contrast hairline serif
- **Weights:** 100
- **Sizes:** 20px, 38px, 51px, 67px, 140px
- **Line height:** 1.00–1.40
- **Letter spacing:** -0.0400em at 51–140px, -0.0200em at 38px
- **OpenType features:** `"calt", "rlig", "ss01"`

### Diatype — Primary body and subheading sans — compact, neutral, engineered for reading. Weight 300 for lighter pull-quotes, 400 for body, 500 for subhead emphasis. The slight contrast with Tobias gives the editorial pairing its rhythm. Substitute with Inter, Söhne, or Geist.
- **Substitute:** Inter, Söhne, or Geist
- **Weights:** 300, 400, 500
- **Sizes:** 14px, 16px, 18px, 23px, 26px
- **Line height:** 1.29–1.75
- **Letter spacing:** 0.0020em at 14–26px
- **OpenType features:** `"calt", "rlig", "ss01"`

### speakeasyAscii — speakeasyAscii — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5
- **OpenType features:** `"calt", "rlig", "ss01"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.43 | 0.05px |
| body-sm | — | — | 14px | 1.5 | 0.03px |
| body | — | — | 16px | 1.75 | 0.03px |
| subheading | — | — | 18px | 1.6 | 0.02px |
| heading-sm | — | — | 23px | 1.38 | 0.02px |
| heading | — | — | 38px | 1.3 | -0.76px |
| heading-lg | — | — | 51px | 1.2 | -2.04px |
| display | — | — | 67px | 1.1 | -2.68px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 6px

### Border Radius

- **tags:** 4px
- **cards:** 8px
- **badges:** 4px
- **buttons:** 4px

## Components

### Filled Dark Button
**Role:** Primary action — used for the highest-priority CTA on each page

Background #333333 (Obsidian), text #ffffff, border 1px solid #333333, border-radius 4px, padding 10px 16px, font 14px ui-sans-serif weight 500, uppercase tracking. Inset shadow (rgb(65,65,65) 0 2px 1px inset / rgba(0,0,0,0.05) 0 -2px 1px inset) gives a pressed-paper tactile feel.

### Outlined Ghost Button
**Role:** Secondary action — paired alongside the filled CTA

Background transparent, text #333333, border 1px solid #333333, border-radius 4px, padding 10px 16px, font 14px ui-sans-serif weight 500, uppercase tracking. Light inset highlight (rgb(255,255,255) 0 2px 1px inset / rgba(0,0,0,0.1) 0 -2px 1px inset).

### Top Nav Link
**Role:** Primary navigation items

Font 14px ui-sans-serif weight 500, color #242424, no underline. Chevron dropdown indicator in #545454. Active/hover state transitions to underline or weight shift — no color change.

### Top Nav Pill Button
**Role:** Header CTA — Book a Demo

Same as Filled Dark Button but in the header context, slightly smaller scale: 12–14px text, 4px radius, 8px 16px padding.

### NEW Badge
**Role:** Editorial flag on inline announcement links

Inline label, font 10–11px ui-sans-serif weight 600 uppercase, 0.05em tracking, border 1px solid #dbdbdb, border-radius 4px, padding 2px 6px, text #242424, background #ffffff. Sits inside a pill-shaped announcement row with border #dbdbdb and 4px radius.

### Announcement Pill
**Role:** Inline editorial callout above the hero

Full-width inline row, 1px #dbdbdb border, 4px radius, white background, contains a NEW badge + short text link + chevron arrow. Padding 8px 12px. Font 13px ui-sans-serif.

### Section Eyebrow Label
**Role:** All-caps micro-label above section headlines (e.g. “THE PROBLEM”)

Font 11–12px ui-sans-serif weight 500, uppercase, 0.05em letter-spacing, color #545454, centered or left-aligned depending on section.

### Display Headline
**Role:** Hero and major section headlines

Tobias weight 100, 51–67px (hero can reach 140px), line-height 1.10–1.20, letter-spacing -0.04em, color #000000. This is the signature element — paper-thin serif strokes at massive scale.

### Feature Card
**Role:** Three-column grid card for product features

Background #ffffff, border 1px solid #dbdbdb, border-radius 8px, padding 24px, optional subtle shadow. Contains a small orange icon at top (Iris Blue or Ember Orange stroke 1.5–2px), 18px Diatype subhead, 14–16px body text in #545454.

### Logo Cloud Cell
**Role:** Customer/partner logo display in a row

No container — logos float on #ffffff canvas in a single horizontal row, grayscale treatment (color #545454 to #969696), equal spacing 32–48px gap, aligned to a shared baseline.

### Halftone Illustration
**Role:** Decorative dotted/halftone graphic element

Vector illustration rendered as a halftone dot field in #545454 or #969696, used as a large visual element beside hero text or between sections. No container — the dot field IS the shape (animals, abstract patterns).

### Stacked 3D Layer Diagram
**Role:** Isometric stacked-layer illustration in the solution section

Three or more isometric rectangular layers, each in a different pastel tint (lavender, butter yellow, white), with small icon + uppercase label on each layer face. No border, no shadow — the layers sit on the white canvas with very soft 5–10% tinted fills.

### Rainbow Ribbon Bar
**Role:** The signature 3px-tall gradient hairline at the very top of every page

Full viewport width, 3px height, 9-stop linear gradient (maroon → red → amber → yellow-green → green → deep green → indigo → blue → sky blue). No padding, no margin. Sits flush against the top of the viewport above the nav.

### Agent View FAB
**Role:** Floating action button — bottom-right persistent chat trigger

Background #ffffff, border 1px solid #dbdbdb, border-radius 9999px, padding 8px 14px, font 12px ui-sans-serif weight 500, fixed bottom-right 16px 16px, subtle drop shadow rgba(0,0,0,0.1) 0 4px 6px. Contains a small icon + 'Agent view' label.

## Do's and Don'ts

### Do
- Use Tobias at weight 100 for all display and hero headlines — never substitute a bold serif; the thinness is the brand.
- Set filled CTA backgrounds to #333333 (Obsidian) with white text and 4px radius — this is the system’s only action color.
- Define card and section separators with 1px solid #dbdbdb borders, not shadows — borders are the depth mechanism.
- Place the 9-stop rainbow gradient as a 3px hairline at the absolute top of every page, flush to the viewport edge.
- Pair Diatype body text (weight 400) with Tobias headlines (weight 100) — the weight contrast is the editorial system’s engine.
- Reserve chromatic colors (Signal Green, Ember Orange, Iris Blue, Marigold) for icons, badges, and small status indicators — never as large fills.
- Use uppercase ui-sans-serif at 11–12px with 0.05em tracking for all section eyebrows (THE PROBLEM, THE SOLUTION).

### Don't
- Do not bolden or weight-shift Tobias headlines above 100 — the hairline is the entire point.
- Do not use chromatic fills for primary buttons — the CTA must stay neutral #333333, letting type carry the emphasis.
- Do not stack drop shadows to create card depth — use a 1px #dbdbdb border instead, or nothing at all.
- Do not use the chromatic accents (orange, green, violet, red) as large background areas — they belong inside icons and small tags only.
- Do not set body text below 14px or above 18px in Diatype — the 14–18px range is the reading zone.
- Do not replace the rainbow ribbon with a single-color or duotone bar — the full spectrum is the signature.
- Do not introduce a second serif or competing display face — Tobias owns the editorial space exclusively.

## Elevation

- **Button (filled):** `rgb(65, 65, 65) 0px 2px 1px 0px inset, rgba(0, 0, 0, 0.05) 0px -2px 1px 0px inset`
- **Button (light):** `rgb(255, 255, 255) 0px 2px 1px 0px inset, rgba(0, 0, 0, 0.1) 0px -2px 1px 0px inset`
- **Floating Card:** `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px`
- **Subtle Surface:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

## Surfaces

- **Canvas** (`#ffffff`) — Default page background — pure white, no off-white tint
- **Raised** (`#f1f1f1`) — Subtle elevated sections, card hover wash, secondary background bands
- **Divider** (`#dbdbdb`) — Hairline border tone that also reads as a subtle gray band in some sections
- **Accent Wash** (`#ffb900`) — Highlight backgrounds, tag fills, callout panels
- **Inverse** (`#333333`) — CTA button surface — the only dark fill in the system

## Imagery

Imagery is sparse and editorial. The dominant visual motif is the halftone dot illustration — vector shapes (often animals, abstract organic forms, or geographic silhouettes) rendered as a field of small dots in #545454 to #969696, sitting on the white canvas with no container, no background, no frame. These illustrations function as atmospheric scale-anchors next to hero text, not as explanatory diagrams. Product moments use minimal isometric layered illustrations in pastel tints (lavender, butter, cream) with tiny label chips. Photography is absent — there are no human or product photos. Logos in the social-proof cloud are rendered in flat grayscale (#545454) at equal visual weight. Icon style is thin-stroke (1.5–2px) line icons, often in Ember Orange or Iris Blue, used at 20–24px inside feature cards. The overall image-to-text ratio is low — text and typography dominate, with illustration providing occasional relief.

## Layout

Max-width 1200px centered content column on a full-bleed white canvas. The hero uses a two-column split: left half holds the eyebrow + display headline + body text + dual CTAs (filled + ghost), right half holds a large halftone illustration. Section rhythm is a repeating pattern of (1) a thin #dbdbdb horizontal divider, (2) a centered single-column statement section with oversized Tobias headline, (3) a 3-column card grid for features, (4) a two-column split (text + isometric illustration) for solution sections. Section gaps are 80px with comfortable internal padding. Navigation is a single thin top bar — logo left, links center, utility actions + CTA right — sitting directly below the 3px rainbow ribbon. A persistent floating 'Agent view' button sits bottom-right at 16px inset. The page alternates between full-width sections and contained 1200px content, with no sidebar or off-canvas pattern.

## Similar Brands

- **Linear** — Same restrained monochromatic canvas, hairline border depth model, and a single dark filled CTA — the shared DNA is borders-not-shadows and editorial type restraint.
- **Stripe** — Same gradient-ribbon signature (Stripe’s mesh gradients, Speakeasy’s top rainbow hairline) and the same combination of massive thin-serif headlines with monochrome supporting UI.
- **Vercel** — Same near-zero color palette, oversized hairline type for hero statements, and halftone/dot-field illustrations as decorative scale-anchors beside text.
- **Resend** — Same editorial-broadsheet atmosphere — white canvas, weight-100 serif at huge sizes, chromatic accents rationed to icons and small tags only.
- **Cursor** — Same dark filled button as the only CTA color, thin 1px borders on all surfaces, and 4–8px small radii for a flat product feel.
