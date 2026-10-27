# The online bank — Style Reference
> Digital vault in deep ocean teal — a bank that earns calm through quiet white space and a single confident color.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

N26 presents a calm, confident digital banking sanctuary anchored by a single deep teal hero that commands the viewport while the rest of the interface recedes into warm off-white space. The visual hierarchy is built on contrast: dense dark ink (#1b1b1b) on near-white canvas (#faf8f5), with teal appearing as purposeful punctuation for primary actions and brand moments rather than decoration. Typography carries a distinctive tension between the compact, slightly tracked N26 sans-serif used for navigation and body content, and the wider N26-Extended display face that gives headlines room to breathe at 58–80px. Components feel architectural and minimal — thin borders, generous padding, small radii on controls, large radii on imagery — reflecting a European design-banking sensibility where trust is conveyed through restraint rather than ornament.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Teal | `#088177` | Teal supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink | `#1b1b1b` | Primary body text, headings, icon strokes, link text, and nav labels — a near-black that softens to charcoal, avoiding the harshness of pure black on warm white |
| Canvas Warmth | `#faf8f5` | Page background — a warm, paper-like off-white that gives the entire interface a human, editorial quality distinct from clinical SaaS whites |
| Surface White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Hairline | `#e9e9e9` | Subtle borders, dividers between content blocks, and input field outlines — light enough to recede but present enough to structure information |
| Border Soft | `#d9d9d9` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Pure Black | `#000000` | Reserved for icon fills and the rare element requiring maximum contrast — used sparingly alongside the softer Ink |
| Teal Mist | `#d8edeb` | Light teal-tinted surface for accent backgrounds, highlight panels, and soft washes that echo the brand color without dominating |
| Blush Neutral | `#f5e1e3` | Warm pink-tinted surface for category differentiation in editorial layouts — used as a subtle alternative to teal-tinted sections |

## Typography

### N26 — The workhorse sans-serif for all navigation, body copy, buttons, labels, and UI micro-text. Weight 500 for emphasis, 700 for primary action labels and key headings. Slight positive tracking (0.008–0.019em) gives small sizes a controlled, legible quality — the custom feel comes from this restrained openness rather than display flourishes.
- **Substitute:** Inter, DM Sans, or system-ui
- **Weights:** 400, 500, 700
- **Sizes:** 11px, 14px, 16px, 18px, 20px, 24px
- **Line height:** 1.33, 1.38, 1.43, 1.50, 1.60
- **Letter spacing:** 0.0080em at 24px, 0.0100em at 18px, 0.0160em at 14px, 0.0190em at 11px — tracking widens as size decreases for optical balance

### N26-Extended — Display face reserved for hero headlines, section titles, and large statement copy. The wider proportions at 58–80px create breathing room that contrasts the compact N26 body face — this duality (tight UI type + expansive display type) is the typographic signature. Normal letter-spacing lets the wide letterforms do the work.
- **Substitute:** Inter Display, Söhne Breit, or a wide-proportion alternative
- **Weights:** 400, 500
- **Sizes:** 18px, 32px, 44px, 58px, 80px
- **Line height:** 1.10, 1.20, 1.25, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.38 | 0.21px |
| body-sm | — | — | 14px | 1.5 | 0.22px |
| body | — | — | 16px | 1.5 | 0.16px |
| subheading | — | — | 20px | 1.43 | 0.16px |
| heading-sm | — | — | 24px | 1.38 | 0.19px |
| heading | — | — | 32px | 1.25 | 0px |
| heading-lg | — | — | 44px | 1.2 | 0px |
| display | — | — | 80px | 1.1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 32-48px
- **Element gap:** 8-16px

### Border Radius

- **images:** 24px
- **inputs:** 4px
- **buttons:** 8px
- **small_elements:** 4px

## Components

### Primary Filled Button
**Role:** Top-of-page conversion actions, nav CTAs

Filled with #088177 Deep Teal, white text, N26 weight 500 at 14-16px, 8px border-radius, approximately 8px 20px padding. Sits in the top nav as the highest-prominence action on the page.

### Inverse Button
**Role:** CTAs placed on teal hero backgrounds

White background, #1b1b1b Ink text, 8px border-radius, 12px 24px padding. Used on the full-bleed teal hero to create inversion contrast while maintaining the same compact button shape.

### Text Link Nav Item
**Role:** Primary navigation items

N26 weight 500 at 16px, #1b1b1b text, no underline by default, 8px horizontal padding. Generous spacing between items creates the quiet, unhurried navigation rhythm.

### Hero Band
**Role:** Full-bleed opening section

#088177 Deep Teal background spanning the full viewport width, centered content with 80px vertical padding. N26-Extended display headline at 58-80px in white, body subtext at 18px in white, followed by the inverse button. The color band itself is the hero — no image, no gradient.

### Risk Disclosure Strip
**Role:** Regulatory/compliance information panels

White background, #e9e9e9 hairline borders, small N26 body text at 14px in #1b1b1b. Two-column layout with 1/6 and 6/6 risk indicators. Padding 16-24px, no rounded corners — utilitarian and informational.

### Brand Wordmark
**Role:** Logo and brand mark in nav

N26 in condensed form, weight 500, approximately 20-24px, #1b1b1b. The overline/tilde above the N is a distinctive brand mark. Links to homepage from any page.

### Card Surface
**Role:** Content cards on warm canvas

#ffffff background on the #faf8f5 canvas, no shadow, 24px border-radius for image-forward cards or 8px for compact info cards. 32-48px internal padding. Elevation comes from color contrast, not shadow.

### App Download QR
**Role:** Floating app acquisition element

Small white card with 8px radius, fixed-position bottom right, QR code image with 'Get the app' caption at 14px N26 weight 500. Stays accessible without disrupting the main content flow.

### Locale Selector
**Role:** Language/country switcher in nav

Inline element with #1b1b1b text at 14px, small flag indicator, minimal styling — appears as a simple text link rather than a dropdown chrome.

### Hairline Divider
**Role:** Section separators and content structure

1px solid #e9e9e9 horizontal rule. Used between risk disclosure rows and to separate content blocks without requiring additional spacing.

## Do's and Don'ts

### Do
- Use #088177 Deep Teal for filled primary action buttons and full-bleed brand sections — it is the only chromatic color with permission to dominate a screen.
- Set all page backgrounds to #faf8f5 Canvas Warmth; reserve #ffffff for card surfaces that need to lift off the canvas.
- Apply N26-Extended at 44-80px with line-height 1.10-1.25 for display headlines; the wide proportions need scale to read correctly.
- Use 8px border-radius for buttons and interactive controls; reserve 24px for image cards and large media.
- Maintain section gaps of 64-80px to preserve the spacious, unhurried rhythm visible in the hero-to-content transition.
- Use #e9e9e9 for all hairline borders and dividers — never heavier than 1px on the warm canvas.
- Apply slight positive tracking (0.008-0.019em) to all N26 text at 24px and below for optical balance at small sizes.

### Don't
- Never introduce additional accent colors — the entire system runs on Ink, white, and one teal. Adding a second hue breaks the brand discipline.
- Don't use #000000 for body text — always use #1b1b1b Ink for softer contrast on the warm canvas.
- Don't apply N26-Extended to body copy or UI micro-text — it is a display face only and loses legibility below 24px.
- Never use drop shadows for elevation — N26 achieves layering through background color contrast (#faf8f5 → #ffffff → tinted surfaces) alone.
- Don't set body text below 14px — the type scale starts at 11px for legal/caption text only.
- Never use border-radius larger than 8px on buttons or smaller than 24px on hero imagery — the radius scale is intentional and narrow.
- Don't place colored buttons on the teal hero — always use the white inverse button on brand-colored backgrounds to maintain the inversion relationship.

## Elevation

N26 deliberately avoids drop shadows. Elevation is achieved entirely through background color layering: the warm canvas (#faf8f5) provides the base, white cards lift off it through tonal contrast alone, and the deep teal brand band sits as the highest visual layer. This shadow-free approach reinforces the editorial, paper-like quality and avoids the generic SaaS card-with-shadow pattern.

## Surfaces

- **Canvas** (`#faf8f5`) — Base page background — warm off-white that gives the entire interface its editorial, paper-like quality
- **Surface** (`#ffffff`) — Cards, elevated panels, and content blocks that need visual lift from the canvas
- **Teal Mist** (`#d8edeb`) — Light teal-tinted accent surface for highlight panels and category sections
- **Blush** (`#f5e1e3`) — Warm pink-tinted surface for editorial category differentiation
- **Brand Band** (`#088177`) — Full-bleed brand hero sections and primary action fills — the highest-prominence surface

## Imagery

The homepage is text-dominant with minimal imagery. The teal hero band relies on typography alone — no background image, illustration, or photographic element. Photography, when present on deeper pages, is treated as tight, contained crops with 24px border-radius, no overlays or duotone treatments. The visual language is fundamentally typographic and color-driven, with the brand teal serving as the primary 'image' on the hero.

## Layout

The page model is centered and max-width contained at approximately 1200px, with the hero band breaking to full-bleed for the teal section. The hero pattern is a centered headline over a solid color field — no split layout, no media. Below the hero, content flows in centered stacks with generous 64-80px vertical breathing room between sections. Navigation is a minimal top bar with brand mark left, primary nav links center, and action buttons (login + primary CTA) right. The overall density is spacious and editorial rather than information-dense.

## Similar Brands

- **Revolut** — Same teal-or-purple single-accent strategy on a light neutral canvas, with a hero band that dominates the viewport through color rather than imagery
- **Monzo** — Shared approach of using one vivid brand color as a full-bleed hero, with otherwise monochrome light interface and minimal ornamentation
- **Klarna** — Similar typographic-forward hero with a solid brand color band, clean light backgrounds, and compact button styling
- **Wise (TransferWise)** — Same financial-product minimalism: warm off-white canvas, single brand accent, generous spacing, and editorial typography-driven hero
