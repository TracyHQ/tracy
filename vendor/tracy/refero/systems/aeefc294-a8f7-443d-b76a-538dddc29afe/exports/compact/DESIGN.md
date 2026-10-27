# Acctual — Style Reference
> Paper invoice on frosted glass

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Acctual runs a white-canvas invoicing product on a near-monochrome foundation: paper-white surfaces, dense near-black text, and a single electric blue (#0098f2) used as functional punctuation for checkmarks, rates, and inline highlights. The brand voice is geometric and confident — pill-shaped controls, generous 16px card radii, and rounded invoice mockups floating against pure white. Color is deployed sparingly: most screens stay achromatic so the blue, violet, and pink decorative chips read as deliberate accents rather than noise. Typography is built on Open Runde at weight 600, with tight -0.03em tracking on display sizes that gives headlines a compressed, almost monolinear feel, paired with handwritten Caveat signatures for testimonial contrast.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#1e1e1e` | Headings and primary body text — near-black with a slight cool cast reads as authoritative without the harshness of pure #000 |
| Carbon | `#0f0f0f` | Body text and secondary headings — deeper than Ink, used where maximum contrast against white surfaces is needed |
| Midnight | `#0d111b` | Primary action buttons (filled) — dark navy-black instead of pure black, giving CTAs a subtle blue undertone that harmonizes with the electric blue accent |
| Smoke | `#666666` | Secondary body text, helper copy, muted descriptions under headlines |
| Fog | `#8d8d8d` | Tertiary text, nav links, subdued metadata — the lightest readable neutral before borders take over |
| Ash | `#999999` | Disabled state text, placeholder text, low-priority labels |
| Mist | `#ccd1da` | Hairline borders, input outlines, divider lines — cool blue-gray instead of pure gray so dividers feel on-brand |
| Paper | `#ffffff` | Page canvas, card surfaces, hero background — the dominant surface, occupying the majority of every viewport |
| Snow | `#f7fafc` | Subtle section backgrounds, alternating bands — barely warmer than Paper, creates gentle visual rhythm without darkening the page |
| Concrete | `#afb0b1` | Muted surface fills, inactive chip backgrounds — sits between border and surface in the neutral stack |
| Electric Blue | `#0098f2` | Brand accent — checkmark icons, payment rate callouts, inline highlights, the single most prominent chromatic color across the page |
| Iris | `#6c56fc` | Decorative accent and illustration fill — violet chip on invoice cards, secondary brand signal |
| Magenta | `#f200ca` | Decorative accent and illustration fill — pink chip on invoice cards, tertiary brand signal |
| Leaf | `#5d9c06` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Coral | `#ff6363` | Red decorative accent for icons, marks, and small graphic details. Use as a supporting accent, not as a status color |
| Ice | `#cfeafa` | Tinted surface wash — light blue card backgrounds for highlight sections, soft accent backgrounds |
| Lavender | `#e1e0fc` | Tinted surface wash — light violet card backgrounds for feature blocks |
| Blush | `#f6d2f4` | Tinted surface wash — light pink card backgrounds, decorative highlight blocks |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Open Runde — Primary typeface for all headings and body text — geometric sans-serif with weight 600 at display sizes (64/48/40/32/24/20px) carrying -0.03em letter-spacing for compressed confident headlines; weight 500 for body (22/16/14px) with -0.02em tracking; 11px uppercase eyebrow labels at weight 600 with +0.02em tracking
- **Substitute:** Inter, DM Sans, or Outfit
- **Weights:** 500, 600
- **Sizes:** 11, 12, 14, 16, 20, 22, 24, 32, 40, 48, 64
- **Line height:** 1.13-1.78
- **Letter spacing:** -0.03em at 20px+ display, -0.02em at 14-16px body, +0.02em at 11px uppercase
- **OpenType features:** `"ss01" on`

### Caveat — Handwritten signature font for testimonial attributions — creates human warmth against the geometric system at small sizes only
- **Substitute:** Dancing Script or Kalam
- **Weights:** 600
- **Sizes:** 16, 24
- **Line height:** 1.33, 1.50

### SF Pro Text — Secondary system font for small uppercase labels — only used sparingly where system rendering is preferred over Open Runde
- **Substitute:** System UI sans-serif
- **Weights:** 600
- **Sizes:** 11
- **Line height:** 1.62
- **Letter spacing:** +0.02em

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400, 500
- **Sizes:** 16px, 32px
- **Line height:** 1, 1.25

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 11px | 1.62 | 0.22px |
| body-sm | — | — | 14px | 1.43 | -0.28px |
| body | — | — | 16px | 1.5 | -0.32px |
| body-lg | — | — | 22px | 1.29 | 0px |
| subheading | — | — | 24px | 1.33 | -0.72px |
| heading-sm | — | — | 32px | 1.25 | -0.96px |
| heading | — | — | 40px | 1.2 | -1.2px |
| heading-lg | — | — | 48px | 1.17 | -1.44px |
| display | — | — | 64px | 1.13 | -1.92px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 100px
- **cards:** 16px
- **icons:** 888px
- **images:** 20px
- **buttons:** 100px
- **largeCards:** 32px

## Components

### Filled Action Button
**Role:** Primary CTA — 'Send my first invoice', 'Create an invoice', 'Sign up for free'

Background #0d111b (Midnight), text #ffffff, border-radius 100px (pill), padding 8px 12px (small) or 6px 14px (nav), shadow rgb(36,38,40) 0px 0px 0px 1px + rgba(27,28,29,0.48) 0px 1px 2px 0px. Open Runde 14px/500, text #ffffff, letter-spacing -0.02em.

### Secondary Dark Button
**Role:** Compact dark action — nav-level CTAs and dense button rows

Background #0f0f0f (Carbon), text #ffffff, border-radius 100px, padding 6px 10px or 6px 14px. Same shadow stack as primary button. Used where a slightly smaller, denser button is needed in nav or toolbar contexts.

### Outline Link Button
**Role:** Navigation links — 'Freelancer', 'Agency', 'Pricing', 'Blog', 'Guides'

Background #ffffff, text #1e1e1, border-radius 100px, padding 8px 12px. No shadow. Functions as a ghost nav item inside the pill-shaped header container.

### Feature Card
**Role:** Standard content card for feature blocks and comparison panels

Background #fafafa (or #ffffff), border-radius 16px, padding 24px, no shadow. Open Runde 24px/600 heading with -0.03em tracking, body text 16px/500 in #666666. Sits flush on white canvas.

### Elevated Card
**Role:** Card with subtle elevation for invoice previews and testimonial blocks

Background #ffffff, border-radius 20px, shadow rgba(0,0,0,0.05) 0px 1.78px 8px 0px + rgba(0,0,0,0.04) 0px 0.89px 2.67px 0px. No padding (content fills card). Used for the invoice mockup stack and the testimonial quote card.

### Large Feature Panel
**Role:** Full-width feature section with generous internal padding

Background #fafafa, border-radius 32px, padding 96px 48px. No shadow. Used for the 'We designed an invoice...' section and similar spacious feature panels that need to feel like standalone editorial blocks.

### Tinted Accent Card
**Role:** Highlight block with brand-tinted background

Background rgba(0,152,242,0.16) (Ice at 16% opacity), border-radius 16px, no padding or shadow. Used for payment rate callout strips and highlighted info blocks.

### Invoice Mockup Card
**Role:** Overlapping invoice preview document

Background #ffffff, border-radius 16px, shadow rgba(10,13,20,0.03) 0px 1px 2px 0px. Contains a structured invoice layout: 'INVOICE NO' label at 11px uppercase in #666666, 'FROM/TO' blocks with brand-color circular icons (Iris #6c56fc, Leaf #5d9c06), line items in a table with #666666 labels and #1e1e1 values. Stacked with slight rotation and offset for depth.

### Star Rating Block
**Role:** 5-star rating indicator for testimonial credibility

Five solid orange/amber stars (default #f5a623 implied) centered above a quote. No border or background. Open Runde 24px/600 quote text below in #1e1e1, Caveat 16px/600 attribution in #666666.

### Payment Rate Badge
**Role:** Inline rate indicator — 'Cards 2.7%', 'Bank transfer 1%', 'Stablecoin 1%'

No background, inline horizontal arrangement: Electric Blue #0098f2 circular checkmark icon (radius 888px = fully round), followed by label text in #1e1e1 at 16px/500, rate value in bold. No padding, no border.

### FAQ Accordion Item
**Role:** Expandable question row in the FAQ section

Full-width row with no background, no border-radius, horizontal divider line (1px #ccd1da or similar hairline). Question text in #1e1e1 at 16px/500, plus icon (+) on the right in #1e1e1e. Vertical padding ~16px, spacing between items ~12px.

### Pill-Shaped Header Container
**Role:** Floating navigation bar wrapping logo, links, and CTAs

Background #ffffff, border-radius 100px, wrapping the entire nav row. Contains logo + nav links (outline buttons) + login text + filled CTA, all arranged inline with 8-12px gaps. Floats above the hero with subtle shadow.

### Logo Mark
**Role:** Acctual brand logo — stylized arrow/chevron monogram

Two stacked chevron/arrow shapes forming 'A' or '→' glyph, rendered in #1e1e1 (dark). Paired with 'Acctual' wordmark in Open Runde 16px/500, #1e1e1e.

### Eyebrow Label
**Role:** Small uppercase category tag above section headings — 'Used by 5,000+ businesses worldwide'

Open Runde 11px/600, letter-spacing +0.02em, text-transform uppercase, color #0098f2 (Electric Blue). No background, no border. Sits centered above the headline as a tiny blue capsule of context.

## Do's and Don'ts

### Do
- Use Open Runde weight 600 for all headings 20px and above with -0.03em letter-spacing — the tight tracking is the signature compressed headline feel
- Set primary action buttons to #0d111b with white text and 100px pill radius — never use colored fills for primary CTAs
- Use #0098f2 Electric Blue exclusively for inline icons (checkmarks), rate callouts, and eyebrow labels — never for button backgrounds or large surface fills
- Apply 16px border-radius to all content cards and 32px to large feature panels — radius hierarchy is a core part of the visual rhythm
- Set page canvas to pure #ffffff and use #fafafa or #f7fafc only for alternating section bands — keep the page as bright as possible
- Use Caveat 16px/600 for testimonial attributions only — it is a signature element, not a body font
- Stack invoice mockup cards with slight rotation and overlapping offset to create the layered paper effect visible in the hero

### Don't
- Don't use #0098f2, #6c56fc, or #f200ca as button backgrounds — the brand accent colors are decorative, not interactive
- Don't use pure #000000 for text or buttons — use #1e1e1 for text and #0d111b for button fills; the near-black tones are deliberate
- Don't apply box-shadow to feature cards — elevation is reserved for the invoice mockups and testimonial cards; flat surfaces are the norm
- Don't use border-radius below 10px on any interactive element — pills (100px), 16px, and 32px are the only valid radius values
- Don't use gradient backgrounds anywhere — the design is strictly flat with solid fills only
- Don't set body text below #666666 — the neutral floor for readable text is Smoke, not lighter grays
- Don't use more than two chromatic accent colors on a single screen — the system relies on color appearing as rare punctuation

## Elevation

- **Primary Button:** `rgb(36, 38, 40) 0px 0px 0px 1px, rgba(27, 28, 29, 0.48) 0px 1px 2px 0px`
- **Elevated Card:** `rgba(0, 0, 0, 0.05) 0px 1.78px 8px 0px, rgba(0, 0, 0, 0.04) 0px 0.89px 2.67px 0px`
- **Invoice Mockup:** `rgba(10, 13, 20, 0.03) 0px 1px 2px 0px`

## Surfaces

- **Paper** (`#ffffff`) — Page canvas — dominant background for the entire site, hero, and most content sections
- **Snow** (`#fafafa`) — Alternating section bands, feature card backgrounds, subtle contrast surfaces
- **Ice** (`#cfeafa`) — Tinted highlight blocks for payment info and feature callouts
- **Lavender** (`#e1e0fc`) — Violet-tinted card backgrounds for secondary feature blocks

## Imagery

Imagery is minimal and product-focused: flat-lay photography of office objects (keyboard, binder clip, red binder, Apple display) cropped at the edges and scattered around the page as atmospheric decoration. The dominant visual asset is the layered invoice mockup stack — rendered as actual UI, not illustration, showing real invoice data with brand-color icons. Icons are simple flat geometric shapes (circles for checkmarks, rounded squares) in Electric Blue. No illustrations, no 3D renders, no lifestyle photography. The aesthetic is 'desktop overhead shot meets UI artifact'.

## Similar Brands

- **Stripe** — Same flat white-canvas approach with pill-shaped buttons, minimal shadows, and restrained use of color for functional accents rather than decoration
- **Linear** — Same compressed geometric sans-serif headlines with tight negative letter-spacing, dark filled CTA buttons, and a near-monochrome palette with rare chromatic punctuation
- **FreshBooks** — Same invoicing product category with overlapping paper/invoice mockup photography and a clean white-surface aesthetic for financial UI
- **Plausible Analytics** — Same approach of using a single vivid accent color (blue) sparingly against a white canvas, with pill-radius buttons and generous card padding
- **Vercel** — Same near-black (#0d111b range) primary buttons instead of pure black, minimal shadows, and geometric typography with tight tracking on display sizes
