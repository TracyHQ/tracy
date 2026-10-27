# Flowers For Society — Style Reference
> indigo editorial on white gallery — a single deep-violet voice laid over a paper-white canvas, where the product photograph and the typography do all the talking.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Flowers For Society is a fashion house that speaks in a single, assertive voice: deep indigo (#203b90) threading through every surface — logo, headings, buttons, borders, and hero scrims — anchored by a white gallery that breathes. The product is the hero: full-bleed photography with gradient overlays for legibility, oversized pill-shaped CTAs at 41-60px radius, and centered display type that uses Integral's tight line-heights (0.92-1.0) to compress vertical space. The system is deliberately minimal — two custom typefaces, no shadows, extreme border radii, and a single chromatic color. Soehne carries the UI with wide letter-spacing (0.033-0.063em) that gives even small text a boutique, editorial cadence. The result feels like a magazine spread: confident, restrained, and unmistakably branded.

## Colors

| Name | Value | Role |
|------|-------|------|
| Indigo Statement | `#203b90` | Primary brand color — logo, all headings, primary action fills, action borders, and the left-side hero scrim. This is the only chromatic color in the system; it appears on roughly every surface to assert brand presence |
| Indigo Mist | `#7989bc` | Tonal violet for subtle borders and secondary outlines — the softer sibling of Indigo Statement used where full saturation would feel heavy |
| Paper White | `#ffffff` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Carbon | `#000000` | Icon strokes, sharp borders, and high-contrast text accents. Used sparingly where the indigo brand color would be too soft |
| Graphite | `#1b1b1b` | Near-black for button borders and the SHOP NOW text — a softer alternative to pure black for refined edges |
| Fog | `#f2f2f2` | Footer background — the only departure from pure white, creating a quiet band at the page base |

## Typography

### Soehne — Body, navigation, buttons, UI text — the workhorse. The deliberately wide tracking on small sizes (0.063em at 11px, 0.055em at 14px) gives even utility text a boutique, editorial cadence. Weight 700 is reserved for nav items and button labels.
- **Substitute:** Inter, DM Sans
- **Weights:** 400, 700
- **Sizes:** 11px, 14px, 16px, 18px
- **Line height:** 1.20, 1.30, 1.40, 1.50, 1.80
- **Letter spacing:** 0.033em at 16-18px, 0.043-0.056em at 14px, 0.063em at 11px

### Integral — Display and headings — the editorial voice. Used at a single weight (400) that relies on the font's natural density and extreme tight line-heights (0.92-1.0) to create compressed, magazine-style display type. The 0.077em tracking at 52px is a logo-specific treatment.
- **Substitute:** Druk Wide, Bebas Neue, Anton (for display only)
- **Weights:** 400
- **Sizes:** 13px, 15px, 18px, 35px, 37px, 45px, 52px
- **Line height:** 0.92, 1.00, 1.10, 1.28
- **Letter spacing:** 0.013-0.017em at 45-52px (tight), 0.035-0.048em at 35-37px (moderate), 0.04em at 18px, 0.077em at 52px (logo display)

### Arial — System fallback for non-brand contexts (email, transactional surfaces). Not used in the main site chrome.
- **Substitute:** system-ui
- **Weights:** 400, 700
- **Sizes:** 14px
- **Line height:** 1.20

### Nunito-Sans-Klaviyo-Hosted — Nunito-Sans-Klaviyo-Hosted — detected in extracted data but not described by AI
- **Weights:** 400, 700
- **Sizes:** 18px, 20px
- **Line height:** 1, 1.2

### GTStandard-M — GTStandard-M — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.5
- **Letter spacing:** 0.033

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 0.69px |
| body-sm | — | — | 14px | 1.5 | 0.6px |
| body | — | — | 16px | 1.4 | 0.53px |
| subheading | — | — | 18px | 1.1 | 0.72px |
| heading-sm | — | — | 35px | 1 | 1.23px |
| heading | — | — | 45px | 1 | 0.77px |
| heading-lg | — | — | 52px | 0.92 | 0.68px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 50px
- **Card padding:** 30px
- **Element gap:** 12px

### Border Radius

- **tags:** 41px
- **cards:** 4px
- **inputs:** 41px
- **buttons:** 41px
- **buttons-lg:** 60px

## Components

### Announcement Bar
**Role:** Top-of-page utility strip for promotions or campaign tags.

White background, centered text in Soehne 11px weight 700, uppercase, letter-spacing 0.063em, #203b90. Height ~40px. May include a trailing arrow glyph.

### Header Navigation
**Role:** Primary site navigation — left links, centered logo, right utility icons.

White background, no border or shadow. Left: nav links in Soehne 14px weight 400, #203b90, letter-spacing 0.043em, separated by ~24px gap. Center: logo mark. Right: account and cart icons in #203b90, 20-24px size.

### Logo Mark
**Role:** Wordmark — the brand's single most identifiable element.

"FLOWERS FOR SOCIETY" stacked in two lines, Integral 52px weight 400, #203b90, letter-spacing 0.077em, line-height 0.92. The wide tracking and tight line-height create a compressed, editorial logo block.

### Hero Banner
**Role:** Full-bleed product showcase with text overlay.

Edge-to-edge product photography (sneaker in a daisy field). Left-to-right gradient scrim from rgba(32,59,144,0.7) to transparent for text legibility. Overlay text: Soehne 14-18px weight 700, uppercase, white, letter-spacing 0.055em. CTA positioned bottom-right.

### Primary CTA Button (Pill)
**Role:** The dominant call-to-action — used for SHOP NOW and primary actions.

White fill (#ffffff), #1b1b1b text, 41-60px border-radius (pill), Soehne 14px weight 700, uppercase, letter-spacing 0.043em, 30px horizontal padding / 12-15px vertical padding. No border, no shadow. The white-on-image contrast makes it pop against the hero photograph.

### Indigo Action Button
**Role:** Secondary CTA on light surfaces where the brand color should carry the action.

#203b90 fill, white text, 41px border-radius, Soehne 14px weight 700, uppercase, letter-spacing 0.043em, 30px horizontal padding. Used on white or light-gray sections where a white pill would lack contrast.

### Section Display Heading
**Role:** Centered editorial headlines for content sections below the hero.

Integral 35-45px weight 400, #203b90, uppercase, centered, letter-spacing 0.017-0.035em, line-height 1.0. Example: "A BRAND BUILT ON PURPOSE" — tight, compressed, statement-making.

### Navigation Link
**Role:** Header and inline navigation items.

Soehne 14px weight 400, #203b90, letter-spacing 0.043em, no underline, no hover color change indicated (the indigo is already the brand color). 24px gap between items.

### Footer
**Role:** Page-base utility area.

#f2f2f2 background, 30px+ padding, Soehne 14px weight 400 in #203b90 for links and body text. The only non-white surface on the site.

### Input Field
**Role:** Form inputs (email, search, etc.).

41px border-radius (pill), 1px border in #000000 or #203b90, 15-16px padding, Soehne 16px weight 400. The extreme radius matches the button system for visual consistency.

## Do's and Don'ts

### Do
- Use #203b90 as the only chromatic color — it should appear on the logo, headings, borders, and the hero scrim to assert brand identity.
- Use pill-shaped buttons at 41-60px radius for all actions; never use rectangular or slightly-rounded buttons.
- Use full-bleed product photography with a left-to-right gradient scrim for hero sections.
- Use Soehne with wide letter-spacing (0.043-0.063em) for all UI and body text to maintain the editorial cadence.
- Use Integral with tight line-heights (0.92-1.0) for all display headings to create compressed, magazine-style type.
- Keep the page white-dominant — use #f2f2f2 only for the footer band.
- Use 30px horizontal padding and 12-15px vertical padding on all interactive elements.

### Don't
- Don't introduce additional chromatic colors — the entire system speaks in indigo and neutrals.
- Don't use box-shadows or elevation effects — the design is intentionally flat.
- Don't use rectangular buttons or inputs — the extreme radii (41-60px) are a signature.
- Don't use body fonts for headings or display text — Integral carries the editorial voice exclusively.
- Don't use tight letter-spacing on Soehne — the wide tracking is what gives the UI its boutique feel.
- Don't add decorative gradients or background patterns to non-hero sections.
- Don't use multiple border colors — stick to #203b90 for brand borders, #000000 for utility borders.

## Elevation

The design is intentionally flat — no shadows, no elevation effects. Visual hierarchy is achieved through color (indigo on white), typography (Integral display vs. Soehne body), and the extreme border-radius system, not through depth.

## Surfaces

- **Paper White Canvas** (`#ffffff`) — Primary page background — the white gallery that lets indigo carry the brand.
- **Fog Footer** (`#f2f2f2`) — The only non-white surface, used exclusively for the footer band.

## Imagery

Full-bleed, high-quality product photography in natural, romantic settings — sneakers in a daisy field, products styled against organic environments. The imagery is lush, saturated, and lifestyle-rich, contrasting with the flat, minimal UI chrome. Treatment: edge-to-edge, no rounded corners, gradient scrims for text overlay. The photograph is the hero; the UI is the frame.

## Layout

Full-bleed hero photography dominates the first viewport, followed by a centered content stack on a white canvas. The header is a thin white bar with left-aligned nav, centered logo, and right utility icons — no sticky behavior indicated. Content sections use centered display headings with generous vertical breathing room (50px+ section gaps). The layout is editorial: each section is a statement, not a grid of features. Navigation is minimal — four text links, no mega-menu, no sidebar.

## Similar Brands

- **Aesop** — Same single-color brand identity approach — a deep, distinctive hue carried across a white canvas with editorial typography and minimal chrome.
- **Aimé Leon Dore** — Same boutique fashion aesthetic — wide letter-spacing on UI text, pill-shaped buttons, full-bleed lifestyle product photography, and a single brand color anchoring the entire system.
- **Glossier** — Same flat, no-shadow design philosophy with a single chromatic brand color and generous white space letting product photography breathe.
- **On Running** — Same extreme border-radius system (pill buttons and inputs) and lifestyle product photography treatment with gradient scrims for text overlays.
