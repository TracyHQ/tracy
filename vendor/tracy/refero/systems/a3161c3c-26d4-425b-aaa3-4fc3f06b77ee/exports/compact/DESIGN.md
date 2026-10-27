# Revolut — Style Reference
> Monochrome editorial banking on cloud photography — white ink, pill buttons, one blue ribbon of color in an otherwise grayscale world.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Revolut runs an editorial-monochrome banking language: the product UI is nearly entirely achromatic — white surfaces, #1f1f1f ink, hairline #c9c9cd dividers — and the entire color budget is outsourced to full-bleed sky photography that washes across hero sections. Aeonik Pro at weight 500 carries every display moment with aggressively tightened tracking (-0.024em at 88px), while Inter at 16px handles all UI density. Controls are exclusively pill-shaped (9999px) in four restrained variants, and the only chromatic element in the entire system is a single blue gradient reserved for the promotional bar. Surfaces prefer to float without shadows — edges do the work that elevation usually would.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#1f1f1f` | Primary text, footer background, filled dark buttons. The near-black that carries all body and display copy |
| Pure Black | `#000000` | Button text on light surfaces, pure-black background blocks. Used where maximum contrast is required |
| Bone | `#ffffff` | Page canvas, card surfaces, button text on dark fills, button borders on light fills. The dominant surface color across all sections |
| Ash Grey | `#c9c9cd` | Hairline borders, disabled dividers, and the dominant link color at 80 occurrences. The neutral that defines edge separation without shadow |
| Mist | `#f7f7f7` | List and grouped-background fills — the recessed surface beneath cards, tables, and secondary containers |
| Slate | `#717173` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. |
| Graphite | `#4c4c4c` | Tertiary body text, inline badge copy, and minor muted surfaces between true ink and slate |
| Cobalt Wash | `linear-gradient(to right, rgb(18, 39, 253), rgb(111, 160, 255))` | Promotional bar gradient start. The single chromatic accent in the entire system — only ever appears as part of the blue gradient on top-of-page offer strips |

## Typography

### Aeonik Pro — Marketing display and heading face. Weight 500 across the entire scale — never heavier. Used for hero headlines ('Banking & Beyond' at 88px), section headings, and emphasis paragraphs. The signature choice is that no heading goes bolder than 500: authority comes from size and tracking, not weight.
- **Substitute:** Inter, DM Sans, or Manrope at matching weights
- **Weights:** 400, 500
- **Sizes:** 16, 18, 24, 32, 40, 52, 88
- **Line height:** 1.00, 1.17, 1.19, 1.20, 1.33, 1.38
- **Letter spacing:** -0.0240em at 88px → -0.0120em at 52px → -0.0100em at 40-24px

### Inter — Product UI and body face. Carries all buttons, form labels, navigation, badges, and the 16px default body copy. Uppercase 12px labels open to +0.0150em — the only positive tracking in the system, reserved for micro-tags and button labels to add breathing room at small sizes.
- **Substitute:** System UI sans (already in the design tokens as fallback)
- **Weights:** 400, 600, 700
- **Sizes:** 12, 14, 16
- **Line height:** 1.20, 1.50, 1.57
- **Letter spacing:** -0.0100em to -0.0050em for body, +0.0150em for uppercase 12px labels

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 18 | 0.18px |
| body-sm | — | — | 14px | 22 | -0.07px |
| body | — | — | 16px | 19.2 | — |
| subheading | — | — | 18px | 24 | — |
| heading-sm | — | — | 24px | 28 | -0.24px |
| heading | — | — | 32px | 38 | -0.32px |
| heading-lg | — | — | 40px | 48 | -0.4px |
| display | — | — | 52px | 52 | -0.624px |
| display-xl | — | — | 88px | 88 | -2.112px |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 22.5px
- **lists:** 20px
- **buttons:** 9999px
- **smallControls:** 12px

## Components

### Pill Button (Light)
**Role:** Primary button on light surfaces and hero sections

White background, #1f1f1f text, #1f1f1f 2px border, 9999px radius, 10px 24px padding. 16px Inter weight 600. The 'Explore Savings' and 'Sign up' variant.

### Pill Button (Dark)
**Role:** Primary button on photo and light hero contexts

#1f1f1f background, white text, 9999px radius, 0px 20px padding with vertical centering. The 'Download the app' CTA — appears as a solid dark pill that photographs cleanly against sky imagery.

### Pill Button (Ghost on Photo)
**Role:** Secondary action over photographic backgrounds

rgba(255,255,255,0.1) background, white text, white 1px border, 9999px radius, 10px 24px padding. Glassmorphic treatment for buttons sitting on top of hero photography.

### Pill Button (Text Link)
**Role:** Inline interactive link styled as a button

Transparent background, #1f1f1f at 80% opacity text, 12px radius, no padding. Smaller interactive elements inside body copy.

### Promo Gradient Bar
**Role:** Top-of-page offer strip

linear-gradient(to right, #1227fd, #6fa0ff), 16px Inter weight 400 white text, centered. The only chromatic surface in the entire design system. 32-40px tall. Contains an underlined white link.

### Navigation Header
**Role:** Primary site navigation

Dark #1f1f1f band across the top. White 'Revolut' wordmark left, 16px Inter nav items centered, 'Log in' text + 'Sign up' pill right. Sits above photo heroes without competing with them.

### Location Selector Pill
**Role:** Country/region switcher in the top utility bar

White background, 9999px radius, country flag emoji + label, 12-16px Inter. Sits inside a white utility strip above the dark nav.

### Phone Preview Card
**Role:** Product screenshot overlay on hero sections

22.5px top-left/top-right radius, 0px bottom radius. Full-bleed photo behind it, white card overlapping the photo bottom. Internal product UI shows on a clean white surface with a pill label like 'Accounts'.

### Pricing Tier Card
**Role:** Three-column plan comparison on dark background

White background, 22.5px radius, 24-40px internal padding. Tier name (Aeonik Pro 24px weight 500), price (Aeonik Pro 32px weight 500), description body. Sits on a #1f1f1f section background to maximize card contrast.

### Trust Badge Block
**Role:** Award/social-proof cell in the social proof grid

Transparent background, centered logo or icon, 12-14px Inter caption below in #717173. Arranged in 3-column or 4-column grids separated by 40-80px gaps.

### Section Header (Muted)
**Role:** Section-level subheading above gridded content

24-40px Aeonik Pro weight 500, color #717173 (not #1f1f1f). The choice to use slate for section titles instead of ink is deliberate — it creates a calm editorial rhythm between hero and content.

### List Container
**Role:** Grouped content rows (feature lists, FAQ items)

#f7f7f7 background, 20px radius, 16-24px internal padding. The recessed surface that sits one step below card white.

## Do's and Don'ts

### Do
- Use 9999px radius for every button, tag, and input — pill geometry is the signature.
- Keep display headlines at Aeonik Pro weight 500, never heavier — authority comes from size, not weight.
- Reserve #1227fd→#6fa0ff gradient exclusively for the top promotional bar; never use it on buttons, cards, or section backgrounds.
- Use #c9c9cd hairlines (1-2px) instead of shadows to separate cards and lists from the page canvas.
- Let full-bleed photography carry all color and atmosphere — keep UI surfaces #ffffff, #f7f7f7, or #1f1f1f.
- Apply tightening tracking at every display size: -0.024em at 88px through -0.010em at 24px, opening only at 12px uppercase (+0.015em).
- Place pricing and conversion sections on #1f1f1f backgrounds with white cards — the dark/light flip is the pricing module's signature.

### Don't
- Don't introduce new chromatic colors — the palette is 7 neutrals and one blue gradient, and that's the whole system.
- Don't apply shadows to cards or buttons — separation is achieved with #c9c9cd borders and surface color shifts, not elevation.
- Don't use a heading weight above 500 on Aeonik Pro — going to 600/700 breaks the editorial calm.
- Don't place the promo gradient on hero sections, buttons, or product cards — it loses its meaning if it appears more than once per page.
- Don't use square or slightly-rounded corners on primary actions — pills (9999px) are the only acceptable control shape.
- Don't mix Inter and Aeonik Pro at the same size — Aeonik Pro owns 18px and above, Inter owns 16px and below.
- Don't use color to indicate state on neutral surfaces — use opacity shifts and border weight instead (e.g. #1f1f1f at 80% vs 100%).

## Elevation

Revolut's design system deliberately avoids elevation shadows on standard cards and buttons. Surface separation is achieved through three mechanisms instead: (1) color shifts from #ffffff canvas to #f7f7f7 recessed, (2) hairline #c9c9cd 1-2px borders, and (3) full-bleed dark-to-light section bands (#1f1f1f pricing footer under white content). The shadow tokens exist in the system for popovers and modals only.

## Surfaces

- **Canvas** (`#ffffff`) — Default page background for all editorial and content sections
- **Recessed** (`#f7f7f7`) — List groups, grouped backgrounds, secondary containers below cards
- **Edge** (`#c9c9cd`) — Hairline dividers and disabled-state borders, not a background
- **Card** (`#ffffff`) — Card and pricing tier surfaces (visually identical to canvas but defined by radius and border)
- **Inverted** (`#1f1f1f`) — Dark section bands, footer, navigation, and filled dark buttons

## Imagery

Photography is the primary color source. Hero sections use full-bleed, high-key sky-and-cloud photography — pale blues, whites, and warm skin tones — that acts as the canvas for white display headlines. People are shot close-up, looking off-camera, in soft natural light, with a candid editorial feel rather than staged commercial poses. No decorative graphics, no 3D renders, no illustrations. Icons throughout the product are monochrome line icons at 1.5-2px stroke weight, neutral-colored, never filled with brand color. Award logos in the trust section are full-color third-party brand marks on white. Product UI is shown via iPhone-frame overlays with 22.5px top radius, never as flat screenshots.

## Similar Brands

- **Apple** — Same full-bleed sky/cloud photography with massive light-weight display headlines overlaid, and the same near-black-on-white editorial restraint
- **Wise (TransferWise)** — Same monochrome fintech language with a single accent color, pill-shaped buttons, and oversized Aeonik-style display type
- **N26** — Same achromatic banking palette and pill-button geometry, though N26 tends to use deeper blacks and heavier contrast
- **Cash App** — Same editorial monochrome approach with full-bleed photography carrying all the color, though Cash App uses green as a brand accent where Revolut uses blue
