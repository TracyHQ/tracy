# Shade — Style Reference
> Editorial paper cutouts on white

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Shade operates in a near-monochrome design language: white canvas, soft warm-charcoal text, and one restrained violet accent that appears almost exclusively as hairline borders and a single logo gradient. The interface feels editorial and unhurried — Inter Display at compressed negative tracking gives headlines a sculpted, magazine-cover quality rather than the typical SaaS breathing-room look. Buttons are pill-shaped with hard, solid-color offset shadows (no blur, no diffusion) that read as paper cutouts rather than Material elevations. Color is used as rare punctuation: the violet never fills large surfaces, it traces edges and marks selected states, letting the photographic content do the emotional work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Charcoal Ink | `#131315` | Primary text, dark pill button fill, heading borders — warm near-black, the only filled button color in the system |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text, ghost button background |
| Bone | `#f7f5ff` | Secondary canvas, subtle violet-tinted off-white for alternating sections |
| Cutout Gray | `#f1f1f1` | Solid offset shadow color under primary buttons and secondary surfaces |
| Slate Mid | `#717173` | Muted body text, secondary metadata, helper copy |
| Hairline | `#d0d0d0` | Subtle borders, dividers, inactive tab indicators |
| Deep Charcoal | `#444444` | Input borders, slightly heavier dividers than Hairline |
| Logo Violet | `#855cf7` | Brand mark gradient terminus, logo cube fill — the only saturated color in the system |
| Lavender Trace | `#dacefd` | Selected tab underline, violet hairline accents, announcement pill border — violet at whisper volume |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Inter Display — Primary typeface for all UI text, body and headings alike. Single weight 400 carries the entire hierarchy through size and tracking alone — no bold, no light. The custom stylistic sets (ss01, ss07, ss08) reshape the g, a, and l terminals into a more geometric, editorial silhouette that distinguishes it from stock Inter.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 10px, 14px, 16px, 18px, 20px, 21px, 24px, 28px, 32px, 36px, 40px, 48px, 56px, 72px
- **Line height:** 1.0–1.57 (size-dependent)
- **Letter spacing:** -0.01em to -0.03em (tighter as size increases: -0.01em at body, -0.03em at display)
- **OpenType features:** `"ss01", "ss07", "ss08", "cv03", "cv04", "cv09", "cv11", "blwf"`

### Aux Mono — Monospaced label font for section eyebrows (e.g. 'DAY 1', 'LET'S CHAT', nav items, badge text). Sets at 14px with -0.04em tracking gives timestamps and labels a technical, archival feel against the editorial display type.
- **Substitute:** JetBrains Mono
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.29
- **Letter spacing:** -0.04em

### Inter — Secondary fallback / system-level utility text where the custom display features aren't required
- **Substitute:** system-ui
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.2–1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.12px |
| body-sm | — | — | 14px | 1.29 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 24px | 1.3 | -0.24px |
| heading | — | — | 32px | 1.22 | -0.96px |
| heading-lg | — | — | 48px | 1.15 | -1.44px |
| display | — | — | 72px | 1.1 | -2.16px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 100px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **tabs:** 2px
- **cards:** 14px
- **inputs:** 9px
- **buttons:** 35px
- **smallChips:** 2px
- **secondaryButtons:** 20px

## Components

### Primary Pill Button
**Role:** Highest-emphasis action

Dark charcoal fill (#131315), white text, 35px border-radius, ~15px vertical / 24px horizontal padding, Inter Display 16px weight 400 with white color. Carries the signature 8px 8px 0px 0px #f1f1f1 hard offset shadow beneath — no blur, reads as a cutout hovering above the page.

### Ghost Pill Button
**Role:** Secondary action paired with primary

No fill, 1.5px solid #131315 border, #131315 text, 35px radius, same padding as primary. The 8px offset shadow is rendered in semi-transparent gray (rgba(226,226,227,0.5) 10px 10px 0px -2px) so the button appears to sit on a slightly lifted paper plane.

### Top Navigation Bar
**Role:** Site-wide navigation

Sticky white bar with 1px bottom hairline (#d0d0d0). Logo cube left, then 5–6 Inter Display 14px links in #131315 with 20px gap; right side: 'Log In' text link plus the primary pill CTA. Vertical padding ~20px.

### Announcement Pill
**Role:** Inline news/feature flag above hero

Lavender Trace (#dacefd) 1px border, fully rounded (~999px or matching button radius), Aux Mono 14px text in violet. No fill, no shadow. Floats centered above the hero headline.

### Hero Headline
**Role:** Page-level display

Inter Display 72px (desktop) / 48px (tablet) weight 400, #131315, line-height 1.1, letter-spacing -0.03em. Centered, max-width ~900px. No gradient, no mixed weight — the size and negative tracking do all the work.

### Tab Navigation Strip
**Role:** In-section content switcher

Four labels (Search / Access / Share / Archive) in Inter Display 16px, evenly spaced, separated by hairline dividers. Active tab is marked by a 2px-tall violet (#855cf7) underline directly beneath the text — not a pill background, just a precise accent line. Inactive tabs are #717173.

### Product Screenshot Card
**Role:** Feature proof point

Product UI rendered as a browser-frame screenshot, slight tilt or straight, sitting on the bone (#f7f5ff) surface. Card has 1px inset #00000014 hairline, 14px radius, no outer shadow. Image bleeds nearly to the card edge.

### Logo Strip
**Role:** Social proof / partner bar

Horizontal row of 7–8 partner logos in mid-gray (#717173 or desaturated), evenly spaced with ~40px gaps, all rendered at uniform height (~20px). No labels, no borders — just quiet marks.

### Timeline Onboarding Row
**Role:** Step-based explanation

Three columns headed by Aux Mono 14px labels ('DAY 1', 'DAY 14', 'DAY 21') in #717173, then Inter Display 24px headings in #131315, then body text. Below the columns runs a full-width hairline with 2px solid charcoal circles at each step; active step is filled, future steps are outlined.

### Cookie Consent Banner
**Role:** Bottom-right compliance notice

Fixed bottom-right card, white fill, 1px #d0d0d0 border, 9px radius, ~16px padding. Body text in 12px #717173, small 'Okay' button with #131315 text and no background.

### Brand Logo Mark
**Role:** Identity

A small cube/diamond glyph filled with a conic gradient from transparent to #855cf7, ~24px square, followed by 'shade' wordmark in Inter Display 20px weight 400, #131315. The gradient is the only saturated color mark in the system.

## Do's and Don'ts

### Do
- Use the hard offset shadow (8px 8px 0px 0px #f1f1f1) exclusively on primary pill buttons — never apply blur or diffusion to elevation
- Set Inter Display at weight 400 only; let size and -0.03em tracking carry hierarchy, never switch to bold
- Reserve #855cf7 for the logo gradient and the active tab underline — every other accent must be the muted #dacefd lavender
- Pair every primary CTA with a ghost secondary button of identical 35px radius and padding
- Use 100px between major sections, 10–12px between inline elements, 24px inside cards
- Treat photography as full-bleed and unbordered — let the white canvas frame it like a gallery wall
- Apply Aux Mono 14px -0.04em to all eyebrow labels, timestamps, and tab headings

### Don't
- Do not introduce additional brand colors or saturated fills — the system is 99% achromatic by design
- Do not use soft blurred shadows on buttons; the signature is hard, solid, paper-cutout offsets
- Do not bold headlines or use weight 500+ in Inter Display — the single-weight hierarchy is intentional
- Do not round the active tab into a pill background; the 2px violet underline is the only acceptable indicator
- Do not add gradient backgrounds to sections or cards — gradients are reserved for the brand mark
- Do not use border-radius values outside the defined scale (35/20/14/9/2px)
- Do not center-align body paragraphs longer than two lines — the system is left-aligned with a centered display headline only

## Elevation

- **Primary CTA Button:** `#f1f1f1 8px 8px 0px 0px (hard solid offset, no blur — reads as paper cutout)`
- **Ghost/Link Button:** `rgba(226,226,227,0.5) 10px 10px 0px -2px (hard offset, partially behind element)`
- **Secondary Action Button:** `rgba(19,19,21,0.12) 0px 1px 4px 0px (subtle soft shadow for small buttons)`
- **Product Card:** `rgba(0,0,0,0.05) 0px 0px 0px 1px inset (inset hairline, no outer shadow)`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background
- **Bone** (`#f7f5ff`) — Alternating section background, subtle violet-tinted band
- **Cutout** (`#f1f1f1`) — Offset shadow plane under elevated buttons and cards

## Imagery

Photography is the emotional engine: full-bleed, high-saturation action and lifestyle imagery (surfing, fashion, vibrant product crops) that contrast sharply against the bone-white interface. Images are treated raw — no overlays, no duotone, no rounded corners, no borders. The interface frames the photography like a gallery wall. Product UI is shown as tilted browser-frame screenshots floating on the canvas. Logo strip is desaturated grayscale partner marks at mid-gray opacity, each monochrome and small. Icons are minimal: a purple gradient cube/diamond for the brand mark, otherwise absent or hairline.

## Layout

Max-width 1200px centered content column on a full-width white canvas. Hero is vertically centered with a display headline, short muted paragraph, and two side-by-side pill CTAs; no hero image — the first visual break is the logo strip, then a large full-bleed photograph. Sections alternate white and bone (#f7f5ff) bands with 100px vertical breathing room. Feature blocks use a 4-column card grid for product screenshots, each card on the bone surface with a 1px inset hairline. Onboarding uses a 3-column timeline with circle checkpoints on a hairline rule. Navigation is a single fixed top bar: logo left, link cluster center-left, login + dark pill CTA right. No sidebar, no mega-menu.

## Similar Brands

- **Linear** — Same single-weight display type, near-monochrome canvas, pill CTAs with offset flat shadows, and editorial negative tracking on headlines
- **Vercel** — Inter-family typography with compressed letter-spacing, bone-white canvas, full-bleed photography breaks, and minimal component ornamentation
- **Frame.io** — Media-product focus, dark pill primary button on white, and a restrained palette that lets imagery carry the brand
- **Pitch** — Editorial SaaS sensibility with single-weight display headlines, generous section breathing room, and a single muted accent color against monochrome UI
