# Wrike — Style Reference
> Lime switch on a clean engineer's console — vivid green accents powered against deep navy authority, floating on white.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Wrike's design language is built on a stark white canvas punctuated by a single vivid lime green that acts as a power switch across the interface. The system uses a deep midnight navy for authority text and dark sections, with cool blue-gray neutrals providing soft surface separation rather than warm grays or heavy shadows. Typography is carried by TT Norms Pro at comfortable 4px-grid spacing, with weight 700 headlines that command attention against whisper-thin 400 body text. Components are pill-shaped (40px radius) and card-soft (20px radius), using one signature shadow recipe that floats product mockups off the page. The overall feel is enterprise-confident but energetic — a work-management tool that looks like a productivity OS, not a form.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Green | `linear-gradient(to left, rgb(0, 153, 128), rgb(0, 178, 89), rgb(0, 224, 92), rgb(0, 178, 89), rgb(0, 153, 128))` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color; Decorative geometric shapes, radial glow accents in dark sections, gradient endpoints |
| Midnight Navy | `#162136` | Headlines, primary body text, navigation, dark footer sections — the structural anchor of the entire hierarchy |
| Slate Navy | `#2b3a57` | Secondary headings, card titles, muted dark text — a softened navy for sub-hierarchy |
| Steel Blue-Gray | `#657694` | Helper text, secondary copy, muted labels, dropdown menus — the cool-toned equivalent of mid-gray |
| Mist Blue | `#bfc7d9` | Hairline borders, dividers, input borders, subtle separators |
| Carbon | `#000000` | Icon strokes, high-contrast text, SVG fills, decorative geometric accents |
| Paper White | `#ffffff` | Page canvas, card surfaces, inverse text on dark, input fills |
| Frost Surface | `#f2f5fa` | Feature card backgrounds, subtle wash sections, ghost button hovers — the softest cool tint |
| Halo Blue-Gray | `#c1c9d8` | Shadow tones, elevated surface edges, decorative background shapes |
| Link Blue | `#0073d3` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Smoke Gray | `#737a86` | Disabled button states, inactive controls, de-emphasized metadata |

## Typography

### TT Norms Pro — Single-family system for all UI. Weight 700 for headlines and CTAs (commands attention on white), weight 600 for subheadings and button labels, weight 400 for body and descriptions. Tabular numerals (tnum) enabled for data-heavy product mockups; stylistic alternates ss01–ss04, ss06 active for refined letterforms in display sizes. The 0.125em letter-spacing on 12–13px all-caps creates the uppercase eyebrow pattern ('3+ HOURS', 'TRUSTED BY 20,000+ HAPPY CUSTOMERS WORLDWIDE') that structures every section.
- **Substitute:** Inter or DM Sans
- **Weights:** 400, 600, 700
- **Sizes:** 12, 13, 14, 16, 18, 20, 24, 32, 48, 64
- **Line height:** 1.10–2.00 (tight 1.10–1.20 for display, 1.38–1.50 for body, 2.00 for spacious eyebrows)
- **Letter spacing:** 0.125em for uppercase eyebrows at 12-13px, 0.013-0.014em for body and small headings
- **OpenType features:** `"ss01", "ss02", "ss03", "ss04", "ss06", "tnum"`

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 600
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.6 | 0.125px |
| body-sm | — | — | 14px | 1.4 | 0.014px |
| body | — | — | 16px | 1.5 | 0.013px |
| subheading | — | — | 18px | 1.4 | 0.013px |
| heading-sm | — | — | 20px | 1.38 | 0.014px |
| heading | — | — | 24px | 1.3 | 0.013px |
| heading-lg | — | — | 32px | 1.25 | — |
| display | — | — | 48px | 1.2 | — |
| hero | — | — | 64px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 32-40px
- **Element gap:** 12-24px

### Border Radius

- **cards:** 20px
- **pills:** 9999px
- **small:** 4px
- **inputs:** 8px
- **buttons:** 40px

## Components

### Primary CTA Button
**Role:** Main conversion action across hero, section CTAs, and footer

Filled Signal Green (#00e05c) background, white text, TT Norms Pro weight 600 at 16px, 40px pill radius, 14px 28px padding. The vivid green against pure white makes it impossible to miss. Used for 'Try Wrike for free' everywhere.

### Ghost Text Button
**Role:** Secondary action below primary CTA (e.g. 'Discover Wrike in 3 minutes')

No background, no border. Link Blue (#0073d3) text at 14-16px weight 400, paired with a small icon (play triangle, arrow). 8px padding. Sits directly under the primary CTA as a low-pressure alternative.

### Top Announcement Bar
**Role:** Time-sensitive promo strip above the nav

Full-bleed Signal Green (#00e05c) background, black or dark navy text at 13px weight 600, centered. 8-10px vertical padding. Lightning-bolt icon prefix. Appears only when a campaign is active.

### Navigation Bar
**Role:** Primary site navigation with logo and utility links

White background, no visible border bottom, sits on the white canvas. Wrike green checkmark wordmark left, nav links (Solutions, Product, Why Wrike?, Resources, Enterprise, Pricing) in Midnight Navy at 16px weight 400 with dropdown chevrons. Right cluster: 'Contact Sales' text link, language selector ('EN'), 'Log in' text, then filled Primary CTA. The single signature shadow rgba(24, 31, 56, 0.25) 0px 25px 45px -45px may apply on scroll.

### Feature Card
**Role:** Three-column feature block in AI section and similar grids

White background, 20px radius, no visible border. Card padding 32-40px internal. Eyebrow ('3+ HOURS') in uppercase 13px letter-spacing 0.125em weight 600 muted blue. Heading in Midnight Navy weight 700 at 20-24px. Body in Steel Blue-Gray #657694 at 14-16px weight 400. Green link text with right-arrow affordance. Bottom half contains a photo or illustration with floating green icon badges overlaid.

### Hero Section
**Role:** Above-the-fold landing

Full-bleed white background, max-width 1200px content. Two-column layout: left half has a 64px hero headline in Midnight Navy weight 700 (line-height 1.10) with one keyword highlighted in Signal Green, supporting body in Steel Blue-Gray, then Primary CTA + Ghost button stack. Right half shows a product mockup (dashboard UI) floating with the signature shadow rgba(24, 31, 56, 0.25) 0px 25px 45px -45px.

### Product Mockup
**Role:** Dashboard/UI screenshot rendered as a floating element

White card with 12-20px radius, floating via the signature shadow rgba(24, 31, 56, 0.25) 0px 25px 45px -45px. Internal content shows Kanban boards, charts, avatars, and project data in full color. Sometimes slightly rotated or offset to feel alive.

### Dark CTA Footer Section
**Role:** Final conversion band before page end

Full-bleed Midnight Navy #162136 background. Decorative green geometric shapes (triangles, pill blobs, glow circles) float on the edges as brand energy. Centered white headline weight 700 at 32-48px. Sub-copy in muted lighter navy. Email input (white fill, 8px radius, 14px placeholder) paired inline with Primary CTA. Star rating row below.

### Email Input + Button Combo
**Role:** Lead capture in the dark footer section

Horizontal flex row. Input: white background, 8px radius, 1px Mist Blue border, 14px placeholder in Steel Blue-Gray, 12-16px vertical padding. Button: same Primary CTA, 8px radius variant (not pill) to nest against the input edge.

### Client Logo Strip
**Role:** Social proof band below hero

White background, centered uppercase eyebrow 'TRUSTED BY 20,000+ HAPPY CUSTOMERS WORLDWIDE' at 13px letter-spacing 0.125em in muted gray. Row of 7-8 grayscale client logos at uniform height, evenly spaced. Logos are rendered in #000000 or muted navy with no color highlights.

### Award Badge
**Role:** Third-party recognition (G2, TrustRadius, Capterra)

Colorful shield/ribbon-shaped badge with multi-color gradient fills, 80-100px tall, centered above a caption label in Midnight Navy. Appears in a 3-column grid.

### Floating Icon Badge
**Role:** Small decorative icon overlaid on feature card photos

8-12px radius square or circle, Signal Green or white fill with green icon, semi-transparent backdrop. Overlaps the bottom corner of feature card photos to add brand color energy to otherwise neutral imagery.

## Do's and Don'ts

### Do
- Use Signal Green #00e05c as the ONLY chromatic accent in the interface — no secondary brand colors, no red error states rendered in chromatic red (use navy or muted gray for errors)
- Apply 40px pill radius to all standalone buttons; use 8px radius only on the email-capture button nested against an input
- Use the single shadow recipe rgba(24,31,56,0.25) 0px 25px 45px -45px for product mockups and sticky nav — never stack multiple shadows
- Highlight exactly one word in Signal Green within any hero or section headline (e.g. 'One platform', 'Wrike AI') — the green keyword is the visual anchor
- Set all eyebrows to uppercase 12-13px with letter-spacing 0.125em in Steel Blue-Gray #657694 to create the section-rhythm pattern
- Use Frost Surface #f2f5fa for feature card backgrounds and subtle section washes — never use it as a page background
- Keep the final CTA section dark navy #162136 with Signal Green geometric decorations as the page's energy release

### Don't
- Do not introduce a second accent color (no purple, no orange, no teal) — the system is monochromatic plus one green
- Do not use square or sharp-cornered buttons — pill radius is signature
- Do not stack multiple shadow recipes or add inner shadows — one shadow recipe only
- Do not render the dark CTA section in any color other than #162136 — light or mid-gray breaks the final-section contrast
- Do not use warm grays or beige neutrals — the entire neutral palette is cool blue-gray
- Do not use full-bleed photography as a hero — the product UI mockup is always the visual hero
- Do not render the Signal Green CTA in any variant other than a fully filled pill — no outlined green, no ghost green, no green text-only

## Elevation

- **Product mockup cards:** `rgba(24, 31, 56, 0.25) 0px 25px 45px -45px`
- **Sticky navigation:** `rgba(24, 31, 56, 0.25) 0px 25px 45px -45px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background
- **Frost Card** (`#f2f5fa`) — Feature cards, subtle section washes
- **Dark Stage** (`#162136`) — Final CTA section, dark-mode contrast band
- **Signal Layer** (`#00e05c`) — CTA fills, announcement bar, active state fills

## Imagery

Photography appears only inside feature cards: real human shots of people at laptops, in meetings, in office contexts. Photos are treated as contained rectangles inside white cards, never full-bleed, and always overlaid with small floating green icon badges in the corners to inject brand color. No lifestyle hero photography — the product UI mockup IS the hero visual. Decorative geometric shapes (triangles, pill blobs, glows) appear in the dark footer section in Signal Green as brand energy. Icons are minimal: outlined or single-color flat, no 3D, no gradients, paired with green when interactive.

## Layout

Max-width 1200px centered container. Hero is a two-column split (text left, product mockup right) on white. Sections are full-bleed white bands stacked vertically with 80-120px vertical gaps, no alternating dark/light rhythm until the final CTA section which is a full-bleed dark navy band. Feature sections use 3-column card grids with equal widths. Content blocks are centered stacks with 2-column text+image alternating. Navigation is a single horizontal top bar, sticky on scroll, with no sidebar. Density is comfortable — generous padding inside cards, wide vertical breathing room between sections, never cramped.

## Similar Brands

- **Notion** — Same near-monochrome palette with a single vivid accent and pill-shaped CTAs; product mockups as hero visuals
- **Asana** — Same enterprise-SaaS white canvas with cool blue-gray neutrals, generous card padding, and structured 3-column feature grids
- **Linear** — Same restraint with a single signature accent color used sparingly for active states and CTAs, plus a deep navy inverse section for final CTAs
- **ClickUp** — Same competitive work-management positioning with bright green brand color, product mockup heroes, and award-badge social proof strips
- **Monday.com** — Same vivid accent-on-white SaaS pattern with rounded card components, feature grid sections, and dark-mode final CTA bands
