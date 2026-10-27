# Popcorn — Style Reference
> warm broadsheet on cream paper — a near-monochrome editorial where a single serif headline does all the emotional work and everything else whispers in warm gray

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Popcorn operates as a warm editorial-monochrome system: a creamy off-white canvas (#f7f7f7) carries a near-black warm gray for type (#393737) and a dual-font pairing where Untitled Serif at 64–88px acts as broadsheet display and Messina Sans handles every functional role underneath. The two custom typefaces — a high-contrast serif and a humanist sans — create an editorial gravitas rarely seen in telecom, and the aggressive negative tracking on display sizes tightens the headlines into confident blocks rather than decorative flourishes. Color is nearly absent (2% colorfulness); the system relies on scale contrast, tight tracking, and one soft drop shadow (rgba(0,0,0,0.05) 0 4px 20px) to build hierarchy. Interactive elements are uniformly pill-shaped (100px radius) to create a soft humanistic counterpoint to the formal type, while a conic gradient and a lavender testimonial band provide the only chromatic punctuation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Graphite | `#393737` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Cream Canvas | `#f7f7f7` | Page background, badge fills, soft surface wash. The dominant canvas color — warmer than pure white, gives the serif type a paper-like substrate to sit on |
| Paper White | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Fog Gray | `#888787` | Muted helper text, secondary borders, inactive link text. The mid-tone that separates supporting copy from primary text without introducing color |
| Mist Blue | `#e9eff6` | Soft card surface tint, cool-toned highlight wash. The only chromatic-leaning neutral — used sparingly on informational cards to break the warm cream without breaking the monochrome discipline |
| Lilac Field | `#f3f0f8` | Testimonial section background. The single chromatic section break — a warm desaturated lavender that signals a different content zone while staying within the muted palette |
| Spectrum Wash | `conic-gradient(from 180deg, rgb(235, 246, 242) 0deg, rgb(231, 243, 224) 56.3deg, rgb(229, 239, 248) 118.8deg, rgb(254, 241, 216) 176.4deg, rgb(247, 244, 250) 237.6deg, rgb(247, 219, 229) 295.2deg, rgb(235, 246, 242) 360deg)` | Decorative conic gradient base — soft mint, sage, sky, cream, blush, lilac orbiting in a 360° conic. Used only as background fill behind feature illustrations, never on UI controls |

## Typography

### Untitled Serif — Display and editorial headlines only. The custom high-contrast serif at 84px with -0.03em tracking is the signature move — it borrows broadsheet gravitas and makes a telecom product feel like a magazine cover. Used for hero headlines, section titles, and the largest question prompts. Never appears below 20px.
- **Substitute:** GT Sectra, Tiempos Headline, Canela, or Source Serif 4
- **Weights:** 400
- **Sizes:** 20px, 22px, 24px, 30px, 40px, 58px, 84px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.0300em at 84px, -0.0250em at 40–58px

### Messina Sans — All functional and body type — nav links, body copy, button labels, badges, captions, card titles. Weight 400 for body, 600 for button labels and nav emphasis, 700 reserved for maximum-emphasis inline moments. The 88px usage is a single oversized brand-mark moment; the body lives at 13–18px with 1.4–1.5 line height.
- **Substitute:** Inter, Söhne, Untitled Sans, or General Sans
- **Weights:** 400, 600, 700
- **Sizes:** 11px, 13px, 14px, 16px, 18px, 19px, 64px, 88px
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.0200em at 18–19px, 0 at body sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 18px | 1.5 | -0.36px |
| heading-sm | — | — | 22px | 1.2 | -0.55px |
| heading | — | — | 30px | 1.2 | -0.75px |
| heading-lg | — | — | 40px | 1.2 | -1px |
| display | — | — | 84px | 1 | -2.52px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 18px

### Border Radius

- **nav:** 100px
- **cards:** 12px
- **links:** 100px
- **badges:** 100px
- **buttons:** 100px
- **iconCircles:** 100px
- **featureCards:** 24px
- **testimonialCards:** 15px

## Components

### Pill CTA Button
**Role:** Primary call-to-action in hero and section endings

Dark filled pill, 100px radius, Messina Sans 16px weight 600, white text, 18px vertical × 18px horizontal padding (effectively ~36px height). Warm Graphite (#393737) background, no border, no shadow. The only filled button variant — used sparingly to maintain weight.

### Ghost Nav Link
**Role:** Top navigation items

No background, no border, Messina Sans 14–16px weight 400, Warm Graphite text. Active state indicated by a 2px Warm Graphite underline bar positioned below the text. No hover fill.

### Pill Nav Button (Sign up)
**Role:** Right-aligned header CTA

Dark filled pill identical to Pill CTA Button but compact — 16px vertical × 18px horizontal padding, 100px radius, Messina Sans 14px weight 600, white text on Warm Graphite.

### Status Pill Badge
**Role:** Eyebrow label above hero headline ("Now live in Alpha!")

Cream Canvas (#f7f7f7) fill, 1px Warm Graphite border, 100px radius, Messina Sans 13px weight 400, Warm Graphite text, 4px vertical × 14px horizontal padding. Carries the soft shadow rgba(0,0,0,0.05) 0 4px 20px.

### Editorial Display Headline
**Role:** Hero and section titles

Untitled Serif 84px weight 400, line-height 1.00, letter-spacing -0.0300em, Warm Graphite text. Centered alignment. Sets two lines on the hero; the descending line heights tighten the optical block.

### Feature Icon Circle
**Role:** Icon container for the three feature columns

100px radius circle, Cream Canvas fill, 1px Warm Graphite border at low opacity, 48–56px diameter, single-tone line icon centered inside in Warm Graphite.

### Feature Column
**Role:** Three-column value proposition row

Vertically stacked: icon circle at top, then a 2-line Messina Sans 18–20px weight 400 caption below, Warm Graphite text. Centered. 3 columns with generous column gap on desktop, stacking to 1 column on narrow screens.

### Testimonial Card
**Role:** Social proof block in the lilac section

Paper White (#ffffff) fill, 15px radius, soft shadow rgba(0,0,0,0.05) 0 4px 20px, 24px padding. Quote in Messina Sans 16px weight 400 italic-style quote marks in Warm Graphite, username caption in 13px weight 400 Fog Gray below.

### FAQ Accordion Item
**Role:** Expandable question in the help section

Full-width Paper White row, 1px hairline Warm Graphite border at low opacity, no radius (rectangular block stacking), 18px vertical padding. Question in Messina Sans 18–20px weight 400 Warm Graphite, trailing 16px round icon-button in Fog Gray for expand toggle.

### Phone Showcase
**Role:** Product visual in the hero and feature sections

Two iPhone mockups rendered at slight rotation, overlapping each other, floating above a soft circular conic gradient halo. Phones display the actual eSIM app UI in Paper White cards with Warm Graphite type. No heavy device frame chrome — the gradient halo does all the atmospheric work.

### Section Heading Block
**Role:** Section title with optional eyebrow

Centered stack. Optional small Status Pill Badge above (eyebrow), then Untitled Serif 40–58px weight 400 heading, letter-spacing -0.0250em, line-height 1.20, Warm Graphite. Optional 16px body subtitle in Fog Gray below with 12–16px gap.

## Do's and Don'ts

### Do
- Use Untitled Serif weight 400 for any display text 30px and above — never use the sans for hero headlines
- Apply 100px border-radius to every interactive control, badge, and nav element to maintain pill consistency
- Set letter-spacing to -0.0300em on the 84px display size and scale proportionally down — tight tracking is what makes the serif feel confident rather than decorative
- Restrict the palette to Warm Graphite (#393737) for type and Cream Canvas (#f7f7f7) for backgrounds; use Paper White (#ffffff) only as a lifted card surface
- Use the single soft shadow rgba(0,0,0,0.05) 0 4px 20px on cards and badges — no other shadow values exist in the system
- Center hero and section titles; left-align body copy and FAQ items
- Break the warm cream canvas with a Lilac Field (#f3f0f8) section band only when shifting from primary content to social proof or secondary content

### Don't
- Never use pure black (#000000) for text — Warm Graphite (#393737) is the darkest neutral; pure black breaks the warm paper metaphor
- Never use saturated brand colors (blue, red, green) for CTAs, links, or text — the system is monochromatic; a chromatic button would feel like a different product
- Never apply sharp corners (0–6px radius) to buttons, badges, or nav elements — pills are the only shape language for interactive surfaces
- Never stack multiple shadows or use colored drop shadows — the 5% black soft shadow is the only elevation primitive
- Never use Untitled Serif below 20px — it loses its editorial weight and becomes hard to read at body sizes
- Never introduce gradients on UI controls (buttons, badges, cards) — the conic gradient is reserved for decorative halos behind product imagery
- Never set body line-height below 1.4 — the warm cream canvas and serif display need air to breathe; tight body text collapses the editorial feel

## Elevation

- **Card:** `rgba(0, 0, 0, 0.05) 0px 4px 20px 0px`
- **Badge:** `rgba(0, 0, 0, 0.05) 0px 4px 20px 0px`

## Surfaces

- **Canvas** (`#f7f7f7`) — Page background — warm off-white substrate
- **Card** (`#ffffff`) — Lifted card and panel surfaces
- **Tint** (`#e9eff6`) — Cool-tinted informational card variant
- **Section Break** (`#f3f0f8`) — Lavender testimonial band — chromatic zone separator
- **Inverse** (`#393737`) — Dark button fill and dark elevated surfaces

## Imagery

Product-forward visual language centered on iPhone device mockups showing the eSIM app interface. Devices are rendered at slight rotation, overlapping in pairs, floating above a soft circular conic gradient halo (mint → sage → sky → cream → blush → lilac). The halo does the atmospheric work — no lifestyle photography, no human subjects, no environmental context. Icons are line-style, single-tone Warm Graphite, monoweight, contained within 100px-radius circles. The imagery philosophy is 'the product is the hero': tight device crops, pure Paper White screen surfaces, and a single pastel orbital gradient replace the lifestyle stock photography convention of telecom marketing.

## Layout

Max-width 1200px centered container with generous side margins. Hero is a single centered column: small status pill badge, then a two-line Untitled Serif 84px display headline, then a two-line 16px body subtitle, then a single Pill CTA Button. Below the hero, the phone showcase breaks full-bleed with overlapping device mockups on a conic gradient halo. Feature row is a 3-column grid (icon circle + 2-line caption per column) with comfortable column gaps. Testimonial section shifts to a full-bleed Lilac Field band with 3 white cards in a row. FAQ section returns to cream canvas, single-column accordion stack. Navigation is a minimal top bar: logo left, 4 nav links center, pill Sign up button right. No sidebar, no mega-menu. Section gaps are ~96px — the page breathes between bands.

## Similar Brands

- **Stripe** — Same warm off-white canvas + Warm Graphite near-black text + serif display headlines approach, though Stripe uses a humanist sans for display where Popcorn uses a high-contrast serif
- **Linear** — Same pill-shaped button + monochrome restraint philosophy, but Linear leans dark mode with neon accents where Popcorn stays light and editorial
- **Arc browser** — Same near-monochrome palette, warm cream canvas, and pill-shaped interactive elements — both reject the typical SaaS blue-accent convention
- **Vercel** — Same display-type-does-the-work approach with minimal color, though Vercel uses Geist Sans for display where Popcorn commits to an editorial serif
- **Notion** — Same warm monochromatic restraint and custom sans + serif pairing, though Notion's display is sans-only — Popcorn's serif commitment is the key divergence
