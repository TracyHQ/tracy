# Overflow — Style Reference
> blueprint washed in indigo

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Overflow speaks in a near-whisper designer vernacular: a paper-cream canvas, one deep midnight-navy brand ink, a single sky-blue accent, and the rest rendered in honest monochrome. The page breathes — generous 80–120px section gaps, 24px card radii, 12px button radii, and very low-opacity shadows that barely register. Product UI is always shown in a macOS chrome frame floating over a soft indigo-to-sky gradient wash, signalling "this is a designer's tool for design people". Type is Inter at its tightest tracking — headings pull -0.025em, creating dense, confident blocks that sit beside lots of white space rather than filling it. The dark filled button is the only moment of full contrast on the page; everything else is quietly layered neutrals.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#161637` | Headings, navigation wordmark, key emphasis — a desaturated indigo-black that reads as navy without screaming blue, anchoring the typographic system |
| Sky Accent | `#0085e4` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Onyx | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Paper White | `#fafafc` | Page canvas, card surfaces, button text on dark — a barely-warm white that prevents the harsh clinical feel of pure #ffffff |
| Mist Gray | `#f0f0f2` | Alternate section background, input fields, subtle inset surfaces — the secondary canvas that separates bands without hard dividers |
| Graphite | `#666666` | Secondary body text, supporting copy, subdued metadata — readable but never competing with headings |
| Hairline | `#dadce0` | Borders, dividers, card outlines — the thinnest structural line, only visible where it defines an edge |
| Indigo Wash | `linear-gradient(127deg, #7272fb 0%, #b8e1ff 99%)` | Hero gradient start — a soft periwinkle that sets the dawn-wash atmosphere of the first viewport |
| Signal Blue | `linear-gradient(90deg, #007bff 0%, #62aeff 100%)` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### Inter — Single-family system. Headlines pull Inter's tightest tracking (-0.025em at display sizes) to feel dense and considered; body sits at standard tracking with 1.5–1.6 line height for comfortable reading. Weight 700 is the hero headline voice, weight 500–600 for section headings, weight 400 for body.
- **Substitute:** Inter (Google Fonts) or system-ui as fallback
- **Weights:** 400, 500, 550, 600, 700, 800
- **Sizes:** 12px, 14px, 15px, 16px, 20px, 24px, 26px, 32px, 48px, 56px
- **Line height:** 1.00, 1.07, 1.14, 1.25, 1.33, 1.42, 1.50, 1.57, 1.60
- **Letter spacing:** -1.4px at 56px, -1.0px at 48px, -0.6px at 32px, -0.4px at 24px, -0.24px at 20px, -0.16px at 16px, -0.12px at 15px, -0.08px at 14px, 0.71px (0.071em) for uppercase labels at 12px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.071px |
| body-sm | — | — | 14px | 1.57 | -0.08px |
| subheading | — | — | 20px | 1.42 | -0.24px |
| heading-sm | — | — | 24px | 1.33 | -0.4px |
| heading | — | — | 32px | 1.25 | -0.6px |
| heading-lg | — | — | 48px | 1.14 | -1px |
| display | — | — | 56px | 1.07 | -1.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 32px
- **Element gap:** 12-16px

### Border Radius

- **nav:** 12px
- **cards:** 24px
- **pills:** 9999px
- **inputs:** 8px
- **buttons:** 12px
- **product-frame:** 24px

## Components

### Top Navigation Bar
**Role:** Persistent header with brand identity and primary entry point

Full-width bar with Paper White background (#fafafc), logo left (Overflow wordmark in Midnight Ink #161637), centered link group (Product, Examples, Blog, Pricing) in Graphite (#666666) weight 500 at 15px, and a dark filled button on the right. 12px radius on the CTA. ~64px tall, sits directly on the canvas with no border or shadow.

### Dark Filled Button
**Role:** Primary filled button — the only maximum-contrast interactive in the system

Onyx (#000000) background, Paper White (#fafafc) text, weight 600 at 15px, 12px radius, 16px vertical × 24px horizontal padding. 13px internal spacing. Used for the main conversion path (Download, Sign up). No shadow; the solid black fill provides all the visual weight needed.

### Ghost / Outlined Button
**Role:** Secondary interactive — steps back from the dark filled button

Paper White background, Hairline (#dadce0) border 1px, Onyx text, 12px radius, 8–12px vertical × 16–20px horizontal padding. Lower visual weight makes the dark filled button win on the same screen.

### Hero Gradient Banner
**Role:** First-viewport atmospheric container with centered headline and product shot

Full-bleed linear-gradient(127deg, #7272fb 0%, #b8e1ff 99%) background. Centered stack: display headline (56px, weight 700, white, -1.4px tracking), subheading (20px, weight 400, white at 90% opacity, -0.24px tracking), then dark filled button. Product screenshot floats below, partially cropped at the viewport edge, contained in a macOS-style window frame.

### Product Window Frame
**Role:** macOS-chrome container wrapping app screenshots throughout the page

Rounded 24px outer radius, white background, subtle shadow rgba(0,0,0,0.08) 0px 8px 20px -7px. Top bar has three traffic-light dots (red, yellow, green) on the left and a centered file label in Graphite. Sits at full opacity over gradient washes in the hero, and over flat sections elsewhere.

### Feature Card
**Role:** 3-column grid card in the "Discover your new superpowers" section

24px radius, white (#fafafc or #ffffff) background, 1px Hairline (#dadce0) border or very low-opacity shadow rgba(0,0,0,0.08) 0px 4px 16px -8px. 32px internal padding. Heading at 24px weight 700 in Onyx, illustration block above. Some cards swap to a vivid blue gradient fill (linear-gradient(90deg, #007bff, #62aeff)) with white text as visual punctuation in the grid.

### Logo Bar
**Role:** Trust strip of well-known brand wordmarks

Single horizontal row, evenly spaced, all logos rendered in Onyx (#000000) at 60–70% opacity. No color logos. Sits centered on the canvas with generous 40–60px vertical padding above and below. Caption above the row at 14px Graphite centered.

### Text Input
**Role:** Form fields in pricing, signup, and inline flows

8px radius, Mist Gray (#f0f0f2) background, 1px transparent border that becomes Midnight Ink on focus, Graphite placeholder, 12px vertical × 16px horizontal padding. No label — placeholder-only convention.

### Color Accent Card
**Role:** Punctuation card that breaks the monochrome feature grid

Same 24px radius and 32px padding as the regular feature card, but the entire surface is a Signal Blue gradient (linear-gradient(90deg, #007bff 0%, #62aeff 100%)) with white heading and a small product preview composite. Used once per 3-card row to break the rhythm and direct the eye.

### Speech / Comment Bubble
**Role:** In-card illustration element showing team feedback

White background, 12px radius, subtle 1px Hairline border, small circular avatar at 40px, Graphite text at 14px. No tail, no shadow — the geometry does the work.

### Progress / Check Dial
**Role:** Circular confirmation element in the "Share only when ready" card

Circular ring with 75% arc in Sky Accent (#0085e4) and 25% in Hairline (#dadce0), check mark centered in Onyx. No surrounding card chrome — sits directly in the card canvas.

### Section Heading Block
**Role:** Left-aligned section opener used for feature bands

Heading-lg (48px) or heading (32px) at weight 700 in Onyx, tight tracking (-1.0px or -0.6px). No subtitle or eyebrow in the data — the heading stands alone. Sits flush left, not centered.

## Do's and Don'ts

### Do
- Use 24px radius for all cards and 12px for all buttons — the two-radius system is the signature
- Apply Inter tracking of -0.025em on any text 40px or larger; never let headlines breathe with positive spacing
- Place the dark filled button (#000 background, #fafafc text, 12px radius) as the single conversion path on any screen
- Wrap every product screenshot in a macOS window frame with three traffic-light dots and 24px outer radius
- Reserve the Signal Blue gradient (linear-gradient(90deg, #007bff, #62aeff)) for at most one card per 3-card grid row to create rhythm
- Keep section vertical gaps at 80–120px; the page should feel like it has air between thoughts
- Use Midnight Ink (#161637) for any heading that needs to carry weight without becoming a button

### Don't
- Do not introduce a new chromatic accent — Sky Accent (#0085e4) is the only blue in the system
- Do not use 9999px pill radius on feature buttons; pills are reserved for tags and status indicators
- Do not apply shadows darker than rgba(0,0,0,0.08) or larger blur than 20px — the elevation is meant to barely register
- Do not center-align section headings; Overflow keeps them flush left
- Do not use Inter weight 300 or 200 — the thinnest weight in the system is 400
- Do not use pure #ffffff for card surfaces; the slight warmth of #fafafc prevents clinical flatness
- Do not stack more than two shadows on a single element; the design relies on a single low-opacity elevation

## Elevation

- **Feature Card:** `rgba(0, 0, 0, 0.08) 0px 4px 16px -8px`
- **Product Window Frame:** `rgba(0, 0, 0, 0.08) 0px 8px 20px -7px`

## Surfaces

- **Page Canvas** (`#fafafc`) — Default page background and base layer for all content
- **Alt Section** (`#f0f0f2`) — Secondary band background for visual separation without hard dividers
- **Card Surface** (`#fafafc`) — Feature cards and product frames sit on this same near-white, distinguished only by border or shadow
- **Dark Surface** (`#000000`) — Filled button background — the only dark surface, used for the singular conversion path

## Imagery

Overflow's visual language is product-screenshot-first, never photography. Every product image appears inside a macOS chrome frame with three traffic-light dots (red/yellow/green) and a centered file label, sitting over either a soft indigo-to-sky gradient wash (hero) or the flat Paper White canvas (later sections). The hero gradient is a true atmospheric backdrop — lavender fading to pale blue at 127 degrees. Feature cards use flat geometric illustration: speech bubbles with circular avatars, circular progress dials, simplified device frames, and small UI mocks. No stock photography, no people in lifestyle contexts, no 3D renders. The only "warm" visual is the gradient; everything else is clean line and flat fill.

## Layout

Max-width 1200px centered container with full-bleed gradient sections that break out. Hero is a single full-viewport gradient band with centered headline stack and a product window frame that extends below the fold. Feature sections follow as 3-column card grids with flush-left section headings above. Logo bar is a single centered horizontal row with generous vertical padding. The page rhythm alternates between the full-bleed indigo hero, flat Paper White product demo sections, and the white 3-card feature grid — no sidebar, no asymmetric layouts, no sticky elements beyond the top nav. Vertical spacing between bands is 80–120px, creating the sense of a scrollable designer's presentation deck rather than a dense product page.

## Similar Brands

- **Figma** — Same near-white canvas, Inter-family type at tight tracking, rounded cards with low-opacity shadows, and product screenshots presented as the hero — designer-tool aesthetic with monochrome restraint
- **Framer** — Shares the cream-white surface, bold display headlines with negative tracking, generous section breathing room, and the macOS-chrome product frame convention
- **Webflow** — Light minimalism with one deep-navy brand ink, Inter typography, flat illustration inside feature cards, and a single dark filled button as the only maximum-contrast element
- **InVision** — Same era and category of design collaboration tool, light cream canvas, soft gradient hero washes behind product UI, and the trust-logo bar pattern
