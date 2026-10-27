# sunday — Style Reference
> white gallery with a neon pulse — a clean Helvetica poster where one hot pink line cuts through the black-and-white calm.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sunday is a white-canvas payment brand for hospitality with a single neon pink accent that acts as electric punctuation against an otherwise achromatic system. The visual logic is almost editorial: type does the heavy lifting, photography provides warmth, and color appears only where attention must land. Black is the structural default — text, borders, cards, primary buttons, even the feature section's background — while #ff17e9 is reserved for brand signals (logo, active nav, highlighted headings, badge borders). The type system is unified under one family (Helvetica Neue) but spans an extreme range from 12px captions to 200px stat numerals, with aggressive negative tracking at large sizes and positive tracking on small uppercase labels. Surfaces are flat — almost no shadows, reliance on hairline borders and contrast instead. Components lean rounded: 16px for cards and inputs, 64px pill for primary buttons, 100px for tags. The overall feel is confident minimalism warmed by real restaurant photography and one unmistakable neon pulse.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon Black | `#000000` | Primary text, hairlines, filled primary buttons, dark section backgrounds, and card surfaces on dark bands — the structural default that carries the entire system |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text on dark fills, form input fills — the negative space that frames everything |
| Warm Gray | `#736f7c` | Body text on light surfaces, subtle borders, muted helper text — a near-gray that warms the neutral palette slightly |
| Mist | `#dedede` | Hairline dividers, input borders, disabled states — the lightest structural line in the system |
| Fog | `#bdbdbd` | Placeholder text, inactive borders, secondary dividers |
| Slate | `#7f7f7f` | Inactive nav text, subtle metadata |
| Iris Shadow | `#8b8893` | Rare shadow tint and muted border accent |
| Neon Pulse | `#ff17e9` | Brand accent — logo mark, active nav underline, highlighted section labels, badge borders, decorative emphasis on key words — one vivid pink against the monochrome system |

## Typography

### Helvetica Neue — Single-family system used for everything from 12px captions to 200px stat numerals. The extreme range (16× scale) is the signature — the same weight carries caption text and hero headlines, letting scale and tracking do the differentiation. Positive letter-spacing (+0.08em) on the smallest sizes signals uppercase labels; aggressive negative tracking (-0.05em) on display sizes tightens large type to a poster-like density.
- **Substitute:** Inter, Helvetica, Arial
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px, 18px, 24px, 32px, 48px, 64px, 200px
- **Line height:** 0.80 to 1.78
- **Letter spacing:** +0.08em at 12–14px (labels), -0.01em at 16–24px (body/subhead), -0.03em at 32–48px (heading), -0.05em at 64–200px (display)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.78 | 0.96px |
| body-sm | — | — | 14px | 1.78 | 1.12px |
| body | — | — | 16px | 1.33 | -0.16px |
| subheading | — | — | 18px | 1.33 | -0.18px |
| heading-sm | — | — | 24px | 1.2 | -0.24px |
| heading | — | — | 32px | 1.13 | -0.96px |
| heading-lg | — | — | 48px | 1.13 | -1.44px |
| display | — | — | 64px | 0.95 | -3.2px |
| display-xl | — | — | 200px | 0.8 | -10px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 16px
- **cards:** 16px
- **badges:** 100px
- **inputs:** 16px
- **buttons:** 64px
- **link-pills:** 24px
- **large-cards:** 48px

## Components

### Primary Filled Button
**Role:** The dominant CTA — used for "Get a demo", "Discover it for free", and "get a free demo"

Solid #000000 background, #ffffff text, 64px pill radius, 16px vertical × 24px horizontal padding. Helvetica Neue 16px weight 400, -0.01em tracking. No shadow, no border. The high-contrast black-on-white inversion is the action signal — no color is needed.

### Ghost Nav Button
**Role:** Secondary navigation action (Login) in the header

Transparent background, 1px #ffffff (or #000000 on light) border, 64px pill radius, 16px vertical × 24px horizontal padding. Same type specs as filled button. The outlined variant signals a lower-priority action beside a filled CTA.

### Navigation Header
**Role:** Top-level site navigation

Sticky header on white canvas. Logo left (neon pink mark + black wordmark). Nav links in #000000 at 14–16px with 8px left/right padding and 14px gap between items. Right-aligned action pair: ghost Login + filled "Get a demo". Subtle 1px bottom border in #dedede. 11px top / 12px bottom padding.

### Form Input
**Role:** Text inputs in the demo request form

#ffffff background, 1px #dedede border, 16px radius. 16px vertical padding, 16px horizontal padding. Text at 16px weight 400 in #000000, placeholder in #bdbdbd. Focus state: border darkens to #000000. No shadow on rest or focus state.

### Form Textarea
**Role:** Multi-line input for open-ended form fields

Same border and radius as text input (1px #dedede, 16px radius). Taller height with 16px internal padding. Placeholder at #bdbdbd. No resize handle styling visible — defaults to browser.

### Dark Feature Card
**Role:** Product showcase cards in the dark horizontal-scroll section

#000000 background, 16px radius, no border, no shadow. Each card contains a phone or product mockup with a short heading in white at 14–18px. Cards sit on a #000000 page band, creating a seamless dark zone with no visual seams between cards and background.

### Stat Display
**Role:** Large numeric proof points (3,500+ clients, 80M+ diners, $176M tips, 2M reviews)

Oversized numeral at 200px, weight 400, line-height 0.80, letter-spacing -0.05em in #000000. Label below at 14px in #736f7c, normal tracking. The extreme size jump from body to stat is intentional — each number reads as a poster headline.

### Brand Badge / Tag
**Role:** Section labels and category markers

Transparent background with 1px #ff17e9 border, 100px pill radius. Text at 12–14px in #000000 with +0.08em uppercase tracking. Used to mark highlighted words or section categories in neon pink.

### Nav Underline Indicator
**Role:** Active or hover state on navigation items

1px #ff17e9 bottom border under the active nav link, 2px height. Provides the only chromatic moment in the header on most pages.

### Split Hero Layout
**Role:** Above-the-fold hero composition

Two-column at desktop: left column holds the headline stack, right column holds a photograph. Left column: headline at 48–64px, subtext at 16–18px in #736f7c, filled CTA below with 24px top margin. Right column: full-bleed image cropped to 16px radius on the outer edge.

### Footer
**Role:** Site footer with link columns

White or light background, 1px #dedede top border. Link text at 14px in #000000, headings at 12px uppercase +0.08em in #736f7c. Standard multi-column link grid.

## Do's and Don'ts

### Do
- Use #ff17e9 only as a brand signal — logo mark, active nav underline, highlighted words in headlines, badge borders. Never as a background fill or body text.
- Set primary CTA buttons to #000000 fill with #ffffff text at 64px pill radius — this is the system's only filled action style
- Maintain the single-family type system: Helvetica Neue weight 400 at all sizes. Differentiate hierarchy through scale and tracking, never weight changes
- Apply -0.05em letter-spacing at 64px and above; +0.08em on 12–14px uppercase labels. These tracking jumps carry the editorial feel
- Default all borders to 1px in #dedede. Use #000000 borders only for active/focus states or structural dividers
- Use the 200px stat treatment for numerical proof points — the extreme size is the signature, not a bug
- Keep cards at 16px radius and inputs at 16px radius. Reserve 64px for buttons and 100px for tags/badges

### Don't
- Do not introduce a second accent color — the system runs on neon pink as its sole chromatic voice against black and white
- Do not add shadows to cards, buttons, or inputs. The single nav shadow is the only elevation in the system
- Do not use multiple font weights. The system is weight 400 only — hierarchy comes from size and tracking alone
- Do not use #ff17e9 for filled backgrounds or large text blocks — it should read as a pulse, not a wash
- Do not round buttons at 8px or 12px. The pill shape (64px) is the primary action's defining trait
- Do not use color to indicate form field states — rely on border darkening from #dedede to #000000
- Do not break the white canvas with gray page backgrounds. Use #000000 for tonal breaks, not mid-grays

## Elevation

- **Navigation Header:** `rgba(0, 0, 0, 0.15) 0px 12px 60px 0px — a soft, wide drop shadow that lifts the sticky header off the page`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — the white gallery wall
- **Card Light** (`#ffffff`) — Form inputs, light product cards on white sections
- **Band Dark** (`#000000`) — Full-width dark section for feature cards, creates tonal break
- **Card Dark** (`#000000`) — Feature cards on the dark band, no visible card edge

## Imagery

Photography is the primary visual language. Real people in active restaurant settings — the hero image shows two people exchanging payment in a warmly lit bar with red/orange ambient lighting. Images are full-color, high-energy, and cropped to fill their containers with 16px rounding. Product mockups (phone screens showing the payment flow) appear inside dark feature cards. No illustration, no abstract graphics, no icon decoration beyond functional UI icons. Photography occupies roughly 40% of the viewport in the hero and acts as the warmth against the cold white type-driven layout.

## Layout

Centered max-width layout at ~1200px with full-bleed bands. Hero is a split layout: left-aligned headline stack (50%) and right-aligned image (50%). A 4-column stats row sits directly below the hero on the same white canvas. A full-bleed #000000 band follows, containing a horizontal scroll of dark feature cards with no visible card-to-background separation. Form section returns to white with a centered, max-width-constrained form. Vertical rhythm is generous: 80px section gaps with comfortable breathing room. Navigation is a sticky white header with logo left, links center, actions right.

## Similar Brands

- **Toast** — Both target restaurant/hospitality with a clean white-canvas approach, but Sunday leans more editorial and minimal with a single neon accent versus Toast's broader product-saturated UI
- **Square** — Shared payment-industry context and a white-first layout with strong black type, though Sunday's neon pink accent and extreme type scale are more distinctive than Square's utility-first design
- **Stripe** — Similar confidence in a near-achromatic palette with a single vivid accent and editorial type scale, though Sunday's accent is magenta rather than indigo and the hospitality framing is warmer
- **Clover** — Both serve restaurant payments with a bright, approachable aesthetic, but Sunday's design language is more Swiss-poster minimal while Clover is more product-screenshot dense
- **Lightspeed Restaurant** — Shared hospitality-fintech positioning, though Sunday's single-accent, photography-warm approach contrasts with Lightspeed's denser, dashboard-oriented UI
