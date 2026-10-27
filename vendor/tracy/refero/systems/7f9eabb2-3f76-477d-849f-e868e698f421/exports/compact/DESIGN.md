# Graphy — Style Reference
> Blueprint on white marble. A hushed, indigo-inked technical surface where a single vivid blue is the only raised voice, and floating glassy chart fragments drift across a soft gray void.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Graphy is a luminous, blueprint-clean SaaS surface that treats data visualization as a calm craft rather than a loud spectacle. The canvas is a whisper-soft lavender-gray (#f2f4f8), and card surfaces sit one level brighter in pure white, creating a quiet two-tier depth that lets vivid cobalt-blue actions glow as the only chromatic punctuation. Typography leans on Aeonik's geometric warmth with aggressively tightened tracking (negative up to -0.05em on display sizes), making even the 82px hero feel engineered rather than decorative. The signature gesture is the floating 3D chart illustrations that orbit the hero — translucent, glassy, impossibly light — paired with hairline borders, generous breathing room, and a single saturated CTA color that never competes with the data on screen.

## Colors

| Name | Value | Role |
|------|-------|------|
| Indigo Ink | `#20295a` | Violet outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Cobalt Signal | `#2e62ff` | Filled CTA buttons, active states, chart accents, and interactive highlights — the single saturated voice in an otherwise muted system. Used sparingly so it reads as functional energy, not decoration |
| Electric Blue | `#0099ff` | Outlined/ghost action borders and link underlines — a secondary chromatic for less-committed interactive states that still need a colored border or underline hint |
| Paper White | `linear-gradient(rgba(255, 255, 255, 0.3) 0%, rgba(76, 48, 237, 0.2) 100%)` | Card surfaces, elevated panels, button fills, and form inputs — the brightest surface level sitting one tier above the canvas; Translucent-to-violet gradient used on floating glassy chart illustrations and hero ornaments — fades from semi-opaque white into a soft violet aura |
| Mist Gray | `#f2f4f8` | Page canvas and section backgrounds — the base layer that makes white cards feel like they are floating just above the surface |
| Charcoal | `#333333` | Secondary heading text and darker UI text where Indigo Ink is too colored — a neutral fallback that still reads as authoritative |
| Slate | `#444444` | Input field text and input borders — the slightly lifted neutral for form interactivity |
| Graphite | `#666666` | Body helper text, captions, and muted descriptions — the workhorse mid-gray for supporting copy |
| Stone | `#999999` | Muted body text, placeholder text, and low-emphasis borders — the quietest readable neutral |
| Ash | `#c2c2c2` | Light borders, dividers, and disabled-state outlines — the hairline gray that separates content without commanding attention |
| Onyx | `#000000` | Maximum-contrast borders, icon strokes, and structural rules — used where the system needs an unambiguous line |
| Lilac Veil | `#e2e9f6` | Soft highlight washes, decorative gradient stops, and illustration shadow tints — a barely-there blue-gray that adds depth to floating graphic elements |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Aeonik — Primary brand typeface used for everything from body copy to display headlines. Aeonik's geometric warmth with subtly rounded terminals gives the system a friendly-technical feel — engineered but approachable. The tight tracking (up to -0.05em at display sizes) is the signature typographic choice: it makes even the 82px hero feel like blueprint type rather than editorial display.
- **Substitute:** Inter, or DM Sans as a close geometric match
- **Weights:** 400, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 22px, 24px, 32px, 40px, 56px, 68px, 82px
- **Line height:** 0.85, 1.05, 1.10, 1.20, 1.30, 1.35, 1.40, 1.60, 1.83
- **Letter spacing:** -0.05em at 82px, -0.044em at 56–68px, -0.033em at 24–40px, -0.02em at 16–18px, normal at 12–14px
- **OpenType features:** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`

### Inter — Secondary fallback for fine print, system labels, and utility text. Inter fills the micro-typography role at 12–14px where Aeonik's character would be too expressive for chrome-level UI.
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400
- **Sizes:** 12px, 14px
- **Line height:** 1.10, 1.20, 1.50
- **Letter spacing:** -0.05em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-sm | — | — | 14px | 1.5 | -0.28px |
| body | — | — | 16px | 1.6 | -0.32px |
| body-lg | — | — | 18px | 1.83 | -0.36px |
| subheading | — | — | 22px | 1.35 | -0.44px |
| heading | — | — | 32px | 1.15 | -1.06px |
| heading-lg | — | — | 40px | 1.13 | -1.32px |
| display | — | — | 56px | 1.05 | -2.46px |
| display-lg | — | — | 68px | 1.05 | -2.99px |
| hero | — | — | 82px | 0.85 | -4.1px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **icons:** 4px
- **images:** 8px
- **inputs:** 8px
- **buttons:** 12px
- **large-blocks:** 40px

## Components

### Primary CTA Button
**Role:** High-priority action button for the single most important step on any page

Filled cobalt-blue background (#2e62ff), white text in Aeonik Medium 16px, 12px border-radius, 16px vertical padding and 24px horizontal padding. No border. The vivid blue is the only filled button color in the system — it must be reserved for the one action that moves the user forward.

### Ghost/Secondary Button
**Role:** Companion action with lower visual weight next to a primary CTA

White background, 1px Onyx (#000000) border, Indigo Ink (#20295a) text in Aeonik Medium 16px, 12px border-radius, 16px vertical and 24px horizontal padding. Reads as an outlined button that defers attention to the primary CTA beside it.

### Navigation Link
**Role:** Top-level navigation and inline text links

No background. Indigo Ink (#20295a) text in Aeonik Regular 14–16px with 1px underline on hover. Nav items separated by 24–32px horizontal gap. Active item may carry a 2px Cobalt Signal (#2e62ff) underline.

### Announcement Banner
**Role:** Pill-shaped badge above the hero announcing a product update or feature

Light Mist Gray (#f2f4f8) background, Indigo Ink text in Aeonik Regular 14px, 9999px border-radius, 6px vertical and 16px horizontal padding. Optional small green dot indicator for 'live' status.

### Hero Section
**Role:** Full-bleed above-the-fold introduction with centered headline, subtitle, and dual CTAs

Canvas background (#f2f4f8) with 40–80px vertical padding. Centered headline at 68–82px Aeonik Medium in Indigo Ink with -4.1px tracking. Subtitle at 18px Graphite (#666666) with max-width 560px. Two buttons side by side: Primary CTA + Ghost. Floating 3D chart illustrations orbit the hero at corners with the Dawn Wash gradient.

### Testimonial Card
**Role:** Single user quote in the social-proof grid

White background, 1px Onyx (#000000) border at 5–8% opacity, 8px border-radius, 16–24px padding. Circular avatar (32–40px) above name in Aeonik Medium 14px Indigo Ink and role/title in Stone (#999999) 12px. Quote text in Aeonik Regular 14px Charcoal (#333333). Arranged in a 4-column grid with 16px gap.

### Logo Strip
**Role:** Single-row display of customer/partner logos for social proof

Canvas background, 6–8 logos in a single horizontal row with equal spacing (~40px gap). Logos rendered in desaturated gray (#999999) for uniform visual weight. Optional white card container with 8px radius and 16px padding around the group.

### Section Heading Block
**Role:** Centered or left-aligned section title with optional eyebrow icon

Decorative 3D icon (60–80px) centered above the heading. Heading at 40–56px Aeonik Medium in Indigo Ink, tracking -1.32 to -2.46px. Optional subheading at 18px Graphite. Vertical spacing of 24px between icon and heading, 16px between heading and subheading.

### Text Input
**Role:** Single-line or multi-line form input field

White background, 1px Stone (#c2c2c2) border, 8px border-radius, 10–12px vertical padding and 14–16px horizontal padding. Placeholder text in Stone (#999999) 14px Aeonik Regular. Focus state: 2px Cobalt Signal (#2e62ff) outer ring or border color change to Slate (#444444).

### Rating Badge
**Role:** Compact social-proof display showing star rating and platform

Inline horizontal layout: 'Brand' text in Aeonik Medium 14px Charcoal, followed by 5 filled stars in Cobalt Signal (#2e62ff) or gold, then 'on' label and platform icon (e.g. Product Hunt badge). Centered or left-aligned in footer/section context.

### Cookie Consent Toast
**Role:** Fixed bottom-right notification with message and dismiss action

White background, 1px Onyx border at 10% opacity, 8px border-radius, 12px padding. Message text at 12–14px Aeonik Regular in Charcoal. Dismiss button: small ghost-style with Ash border and 4px radius.

## Do's and Don'ts

### Do
- Use Cobalt Signal (#2e62ff) exclusively for filled primary CTAs — never as a text color, border, or background for non-action elements
- Set hero headlines at 68–82px Aeonik Medium with -4.1px tracking and line-height 0.85 to achieve the signature engineered-display feel
- Maintain the two-tier surface system: Mist Gray (#f2f4f8) canvas, Paper White (#ffffff) cards — never introduce a third surface level without removing one
- Apply 8px border-radius to all cards, images, and inputs consistently — this is the single radius that defines the system's geometric calm
- Use Indigo Ink (#20295a) for all primary text and headings, reserving Charcoal (#333333) only for body text in cards where a neutral is needed
- Pair the Primary CTA with a Ghost button at 24px horizontal gap — the contrast between filled and outlined carries the visual hierarchy without size jumps
- Float 3D-style chart illustrations with the Dawn Wash gradient (white-to-violet) as the signature decorative gesture on hero sections

### Don't
- Do not use Cobalt Signal (#2e62ff) for decorative shapes, illustration fills, or large background washes — its job is to be a small, functional signal
- Do not introduce a shadow on standard cards — the system relies on hairline borders and surface contrast for separation, not elevation
- Do not use positive letter-spacing on display sizes — the negative tracking (-0.033em to -0.05em) is the typographic signature
- Do not mix Inter into body copy or headings — Inter is only for micro-typography at 12–14px in system labels
- Do not use multiple vivid colors in the same view — Cobalt Signal is the only saturated voice; Electric Blue (#0099ff) is its outlined sibling and must not appear simultaneously as a filled element
- Do not set body text below 14px or above 18px — the 14–18px range with generous line-height (1.6–1.83) is the readability window
- Do not round buttons to 9999px (pill shape) — the 12px radius on buttons is a deliberate choice that separates this system from the rounded-pill SaaS convention

## Elevation

- **Floating Hero Illustration:** `0 20px 60px rgba(46, 98, 255, 0.15), 0 8px 24px rgba(32, 41, 90, 0.08)`
- **Cookie Toast:** `0 4px 16px rgba(0, 0, 0, 0.08)`

## Surfaces

- **Canvas** (`#f2f4f8`) — Page background and section base — the mist-gray void everything floats on
- **Card** (`#ffffff`) — Card surfaces, testimonial panels, content containers elevated one tier above canvas
- **Highlight** (`#e2e9f6`) — Decorative tint washes on floating illustrations and soft glow backgrounds

## Imagery

The visual language is dominated by floating 3D-style chart illustrations — translucent bar charts, pie segments, and dashboard fragments rendered in Cobalt Signal blue with the Dawn Wash gradient (white-to-violet). These are not photorealistic; they are stylized, glassy, and slightly inflated, like data objects suspended in gel. They orbit hero sections at corners and appear as decorative glyphs above section headings. Photography is absent — there are no lifestyle shots, no team photos, no product screenshots. The testimonial grid uses small circular avatar illustrations (24–40px) rather than photographs. Logos in the social-proof strip are rendered flat and desaturated. The overall density is text-dominant with imagery occupying maybe 15–20% of total visual space, always as accent rather than content.

## Layout

The page is a max-width 1200px centered column with full-bleed Mist Gray (#f2f4f8) canvas. The hero is a centered stack: announcement pill, 68–82px headline, 18px subtitle (max-width 560px), and a two-button row (Primary + Ghost) with floating 3D chart illustrations at the four corners. Below the hero, a single-row logo strip sits at ~80% page width. Sections alternate between centered text blocks and content grids, with 40px vertical gaps between major sections. The testimonial section is a 4-column × 2-row card grid with 16px gaps. Content blocks are always centered within the 1200px container; there is no left-aligned asymmetric layout. Navigation is a minimal top bar with logo left, 3–4 links center, and Log in / Sign up right, with 24px gaps between nav items. The overall rhythm is calm and spacious — generous vertical breathing room between sections, never information-dense.

## Similar Brands

- **Linear** — Same tightly-tracked geometric display type, single vivid accent color against a muted dark/light canvas, and hairline-bordered card grids for social proof
- **Vercel** — Centered max-width layout, floating 3D-style geometric illustrations around hero, and the same two-tier surface system (canvas gray + white cards) with minimal decoration
- **Framer** — Soft mist-gray canvas with white elevated cards, a single saturated blue as the only functional color, and the same compact information density in testimonial/logo sections
- **Cron** — Identical Aeonik-style geometric type with tight negative tracking, white cards on lavender-gray canvas, and the same restrained single-accent-color philosophy
- **Notion** — Clean white-on-soft-gray surface treatment with hairline borders and the same calm, spacious breathing room between sections
