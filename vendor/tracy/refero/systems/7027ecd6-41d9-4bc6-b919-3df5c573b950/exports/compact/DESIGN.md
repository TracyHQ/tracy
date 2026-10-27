# Heynds — Style Reference
> Ember on fresh snow. A single vivid orange flame burning against pristine white, radiating subtle warmth.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Heynds speaks in a high-contrast productivity language: a near-white canvas (#fffafa) lit by a single vivid orange ember (#f53900) that does all the work — CTAs, accent text, icons, decorative rays. Typography is modern and confident via Geist, with heavy display weights anchoring headlines and comfortable 16px reading sizes for body. The surface treatment stays almost flat: hairline #e5e5e5 dividers, tiny 4–8px corner radii, and one whisper-soft 0.05 shadow that barely registers. The single-color discipline means the orange reads as energy and urgency against the quiet monochrome chrome. Decorative radiating line patterns in faint orange wash warmth across hero and FAQ sections without breaking the clean surface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Orange | `#f53900` | Primary brand accent — filled CTAs, outlined action borders, icon fills, decorative accents, sparkline highlights. The only chromatic color in the interface; its vividness against the achromatic canvas makes every action feel switched on |
| Peach Wash | `#ffe0d6` | Soft tinted surface — pill-badge backgrounds, subtle highlight panels, secondary button fills where a quieter orange is needed |
| Snow Canvas | `#fffafa` | Primary page background and elevated surface — the base on which all other elements sit |
| Ink Black | `#040101` | Primary text color for headings, body, and nav. Used for icon strokes and form input values |
| Fog Gray | `#827e7e` | Secondary and helper text — muted descriptions, captions, placeholder strings |
| Smoke Gray | `#4d4b4b` | Tertiary text — timestamps, micro-labels, fine print beneath primary content |
| Ash Border | `#e5e5e5` | Hairline dividers, card borders, FAQ separators, input field borders, icon outline strokes |
| Pebble Gray | `#c0bcbc` | Subtle alternating section backgrounds and disabled state fills |

## Typography

### Geist — Universal type family — all headings, body, nav, buttons, cards, footer. The tight line-height (1.0–1.11) on display sizes and 700 weight creates a dense, confident display voice; 400 at 1.4 keeps body readable without feeling loose.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 20, 24, 32, 36, 40, 48, 64, 80
- **Line height:** 1.0, 1.11, 1.25, 1.33, 1.4

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | — |
| body-sm | — | — | 14px | 1.4 | — |
| body | — | — | 16px | 1.4 | — |
| subheading | — | — | 20px | 1.33 | — |
| heading-sm | — | — | 24px | 1.25 | — |
| heading | — | — | 32px | 1.25 | — |
| heading-lg | — | — | 40px | 1.11 | — |
| display | — | — | 64px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 24px

### Border Radius

- **cards:** 8px
- **icons:** 9999px
- **badges:** 9999px
- **panels:** 12px
- **buttons:** 4px

## Components

### Primary CTA Button (filled)
**Role:** Main conversion action — purchase, sign up, primary download

Filled #f53900 background, #fffafa text, Geist 500 at 16px, 4px radius, 16px vertical × 24px horizontal padding, optional right-arrow icon. Sits at top-right of nav and as the hero's primary action.

### Secondary Ghost Button
**Role:** Secondary action — free trial, try without commitment

Transparent fill, 1px #f53900 border, #f53900 text, 4px radius, 16/24px padding, optional sparkle icon. Pairs directly with the primary filled button in the hero.

### Pill Announcement Badge
**Role:** Hero micro-eyebrow above main headline

#ffe0d6 background, #f53900 text, Geist 500 at 14px, 9999px radius, 8px vertical × 16px horizontal padding, leading sparkle/star icon in #f53900. Full-pill form with a small leading ornament.

### Hero Headline Stack
**Role:** Above-the-fold headline and subheadline

Two-line display: line 1 in #f53900 at 64–80px Geist 600, line 2 in #040101 at same size. Subheadline beneath in #040101 Geist 400 at 16–18px, max-width ~640px centered.

### Language Selector
**Role:** Locale switcher in top nav

Transparent fill, #040101 text, 14px Geist 500, trailing chevron-down icon, no border. Sits left of the primary CTA in the nav bar.

### Avatar Social Proof Stack
**Role:** Trust signal beneath hero CTAs

Row of 4–5 overlapping 32px circular user avatars, followed by a bold #040101 line ('+158 Professionals…') at 14px and a muted #827e7 subline at 14px. Centered, compact.

### Feature Card
**Role:** 3-column grid item under 'Instant AI' section

Transparent or #fffafa surface, no shadow, no border. Leading #f53900 icon (16–20px) inside a 9999px-radius tinted background, title in #f53900 Geist 500 at 16–18px, description in #040101 Geist 400 at 14–16px. Cards sit in a 3-column row with 24–32px gaps.

### Embedded Product Video
**Role:** Demonstration of the product in use

Wide 16:9 frame with subtle #e5e5e5 1px border, 8px radius, the 0.05/1px/2px shadow for separation. Shows a real person's face in picture-in-picture plus Mac app UI screenshot.

### FAQ Accordion Row
**Role:** Expandable question in the FAQ list

Full-width row, 1px #e5e5e5 bottom border, Geist 500 16–18px #040101 question text, trailing chevron icon that rotates on open. Generous vertical padding (~24–32px). No background fill.

### Availability Badge
**Role:** Platform availability indicator beneath social proof

Small Apple logo icon (16px) in #040101 above centered 'Available on:' label in #827e7 14px. Center-aligned, sits between social proof and the video.

### Section Headline with Accent Line
**Role:** Mid-page section header ('The Interface / Instant AI')

Two stacked lines centered: first in #040101 Geist 500 at 40–48px, second in #f53900 Geist 500 at 40–48px with a trailing sparkle icon. Subheadline beneath in #040101 16px.

### Decorative Radiating Line Pattern
**Role:** Background ornament in hero and FAQ

Thin #ffe0d6 or pale-orange lines radiating from a central point, filling the section background. Static, not animated. Adds subtle warmth without visual noise.

## Do's and Don'ts

### Do
- Use #f53900 Ember Orange only for the single primary CTA, outlined action borders, and icon accents — never as a surface fill for non-action content.
- Apply 4px radius to all buttons and form controls, 9999px to badges and icon containers, 8px to cards — do not mix these radius families.
- Use Geist 600–700 at 40–80px for display headlines, 1.0–1.11 line-height, centered above content.
- Separate content rows with 1px #e5e5e5 hairline borders instead of background color changes or heavy dividers.
- Use #ffe0d6 Peach Wash as a soft surface tint for badges, not for full sections or large containers.
- Keep all body text in #040101 Ink Black at 14–16px / 1.4 line-height; reserve #827e7 Fog Gray for helper and muted text only.
- Maintain 80–112px vertical gaps between major sections and 24px between elements within a section.

### Don't
- Don't introduce additional chromatic colors — the single-orange discipline is the brand's signature.
- Don't use large drop shadows, glowing effects, or 3D elevation on cards, buttons, or modals — the design stays flat.
- Don't use #fffafa Snow Canvas as a card surface when the page is already on Snow Canvas — go borderless or add a 1px #e5e5e5 hairline instead.
- Don't apply #f53900 to body paragraphs or long-form text — it should appear only on accent words, icons, and CTAs.
- Don't use sharp 0px corners — the smallest radius in this system is 4px, and most surface elements use 8px or 9999px.
- Don't place secondary text in #040101 when it could be #827e7 — reserve Ink Black for content that must be read first.
- Don't use gradients — the system is purely flat color with one shadow layer.

## Elevation

- **Floating Video Player Frame:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Snow Canvas** (`#fffafa`) — Base page background
- **Peach Wash** (`#ffe0d6`) — Tinted highlight surfaces, badge backgrounds
- **Pebble Gray** (`#c0bcbc`) — Subtle alternating section bands

## Imagery

The site relies on a single embedded product video showing the Mac app in use, with a real presenter visible in picture-in-picture — this is the only photographic content. The rest of the visual language is iconography and ornament: small line-art icons (microphone, pen, sparkle) rendered in #f53900, and a decorative radiating-line pattern in faint orange that fills the hero and FAQ backgrounds. No illustration, no lifestyle photography, no abstract graphics. Visual density is low — large swaths of Snow Canvas dominate, and the orange accent plus the video do the heavy lifting.

## Layout

Centered, max-width ~1200px page container with generous breathing room. The hero is a centered text stack (eyebrow badge → two-tone display headline → subheadline → button pair → social proof → availability badge → embedded video), all vertically stacked and centered. The mid-page 'Instant AI' section uses a 3-column feature card grid with 24–32px gaps. The FAQ section is a single-column list of full-width accordion rows separated by hairline borders. Navigation is a single top bar: logo left, language selector + filled CTA right, 40px vertical padding. The overall rhythm is spacious — 80–112px between major sections, no alternating dark/light bands (the entire page stays on Snow Canvas with the peach radiating-line pattern as the only background variation).

## Similar Brands

- **Raycast** — Same single-accent (red/orange) against clean white, Geist-adjacent modern type, small 4–6px button radii, and flat-surface design language
- **Linear** — Identical discipline of one vivid accent color over achromatic surfaces, hairline borders, no drop shadows, and tight modern sans-serif display type
- **Wispr Flow** — Closest peer in the voice-to-text AI category — same warm-orange brand accent, similar clean product marketing layout, comparable video-led hero
- **Notion** — Snow-white canvas with a single warm accent reserved for active states and CTAs, calm flat cards, generous spacing
- **Arc Browser** — Bold display type, one signature chromatic accent, decorative background ornaments, and a flat playful product marketing aesthetic
