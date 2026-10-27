# The Leap — Style Reference
> espresso ink on warm cream

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

The Leap uses a warm-creator economy visual language: near-white canvas, espresso-brown text instead of black, a single acid lime-yellow CTA that pops against muted surfaces, and serif display headlines paired with a contemporary neo-grotesque body. Decorative pastels (lavender, mint, sky blue, lemon) appear inside product mockups and section washes rather than chrome. Cards are generously rounded (30px), buttons are fully pill-shaped (100px), and the whole system reads approachable and editorial — the opposite of corporate SaaS. The brown-on-cream + lime accent palette signals a brand built for individual creators, not enterprise buyers.

## Colors

| Name | Value | Role |
|------|-------|------|
| Espresso Ink | `#482317` | Primary text, headings, nav links, body copy, and outlined button borders — a warm dark brown that replaces pure black and gives the whole system a softer, editorial voice |
| Fog Border | `#e5e7eb` | Hairline borders, dividers, input outlines, and icon strokes across cards, nav, and body containers |
| Cream Canvas | `#fafafa` | Page background and card surfaces — the off-white that everything sits on, warmer than pure white |
| Lime Spark | `#ecf956` | Green action color for filled buttons, selected navigation states, and focused conversion moments. |
| Lilac Whisper | `#efd8f0` | Decorative pastel surface used inside product mockups and gradient washes — soft lavender that recedes behind content |
| Mint Tint | `#c6e57d` | Decorative pastel surface — light green used in card backgrounds and gradient endpoints |
| Lemon Cream | `#f3fb9a` | Decorative pastel surface — pale lemon used in testimonial card washes and gradient stops |
| Sky Hush | `#b1dcfc` | Decorative pastel surface — muted blue used as occasional card background accent |

## Typography

### Favorit — Body text, links, nav items, card content — same family as ABC Favorit with slightly looser line-height (1.5) for reading comfort
- **Substitute:** Inter
- **Weights:** 350, 400
- **Sizes:** 13px, 15px, 16px, 20px, 29px
- **Line height:** 1.00, 1.50
- **Letter spacing:** +0.01em at 13px, +0.008em at 16px

### Tobias — Display serif for hero and section headlines — large sizes with tight tracking (-0.02em) create editorial gravitas. The light weight (300) is anti-convention for hero text; most sites use 600-700, this whisper-weight signals confidence and restraint
- **Substitute:** Source Serif Pro
- **Weights:** 300
- **Sizes:** 54px, 60px, 70px
- **Line height:** 1.03, 1.20
- **Letter spacing:** -1.4px at 70px, -1.2px at 60px, -1.08px at 54px

### ABC Favorit — Primary UI and body typeface — neo-grotesque with slight warmth, weight 350 for body and 400 for emphasis. Tight tracking (-0.02em) at larger sizes gives headings a compressed, modern feel
- **Substitute:** Inter
- **Weights:** 350, 400
- **Sizes:** 14px, 15px, 16px, 20px, 22px, 25px, 27px, 30px
- **Line height:** 1.00, 1.07, 1.20
- **Letter spacing:** -0.02em at 30px, -0.015em at 16px, +0.008em at 14px

### Favorit-Bold — Emphasis headings and subheads — bold weight with aggressive tracking (-0.037em) creates a tight, assertive counterpoint to the light serif displays
- **Substitute:** Inter Bold
- **Weights:** 700
- **Sizes:** 18px, 24px
- **Line height:** 1.00, 1.20
- **Letter spacing:** -0.89px at 24px, -0.67px at 18px

### Favorit-Regular — Favorit-Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 20px
- **Line height:** 1.2
- **Letter spacing:** 0.008

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | 0.13px |
| body | — | — | 16px | 1.5 | 0.13px |
| subheading | — | — | 20px | 1.2 | 0.16px |
| heading-sm | — | — | 27px | 1.07 | -0.54px |
| heading | — | — | 30px | 1.2 | -0.6px |
| heading-lg | — | — | 54px | 1.03 | -1.08px |
| display | — | — | 70px | 1.03 | -1.4px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 30px
- **Element gap:** 16px

### Border Radius

- **nav:** 20px
- **body:** 6px
- **cards:** 30px
- **links:** 9px
- **buttons:** 100px
- **smallCards:** 15px

## Components

### Lime CTA Button
**Role:** Primary action — sign up, get started, submit

Pill-shaped button with 100px border-radius, #ecf956 lime-yellow fill, #482317 espresso text, ABC Favorit weight 700 at 14-15px, 16px horizontal × 8px vertical padding. The only filled chromatic button in the system; its acid green against warm cream creates visual urgency without aggression

### Ghost Text Button
**Role:** Secondary action — learn more, sign in

No background fill, #482317 espresso text, uppercase tracking, weight 700, sits inline with CTAs. Used for 'SIGN IN' in nav and secondary flow actions

### Outlined Brown Button
**Role:** Tertiary action with border emphasis

1px #482317 espresso border, transparent fill, espresso text, 100px pill radius. Used when a secondary action needs more weight than a ghost link but less than the lime CTA

### Testimonial Card
**Role:** Social proof — customer review display

30px border-radius, #fafafa cream background, 1px #e5e7eb fog border, 30px padding. Contains: review title (Favorit-Bold 18px), body text (Favorit 14-16px), 5 yellow stars, reviewer name and Trustpilot link. Cards sit in a 3-column grid with 16-24px gaps

### Product Card Mockup
**Role:** Hero visual — creator link-in-bio preview

30px border-radius, floating card with pastel gradient fill (lavender to mint), contains avatar, creator name, social icons, and embedded product cards. Slightly rotated for playful composition, sits on the hero section

### Navigation Bar
**Role:** Top-level site navigation

Horizontal bar with logo left, center nav links (FEATURES, PRICING, DISCOVER, RESOURCES) in uppercase ABC Favorit weight 350, right side has ghost 'SIGN IN' and lime CTA 'SIGN UP FREE'. Subtle drop shadow: rgba(0,0,0,0.1) 0px 4px 6px -1px. No background fill — transparent over page canvas

### Section Heading Group
**Role:** Section title and subtitle stack

Tobias serif 54-60px for main heading, espresso ink color, -1.08 to -1.2px letter-spacing, line-height 1.03. Subtitle below in Favorit 16-20px, espresso ink, max-width ~600px, centered or left-aligned depending on section

### Step Illustration Block
**Role:** How-it-works step with phone mockup

Numbered step (Tobias serif numeral), short label (Favorit), phone mockup with UI screenshot, decorative hand-drawn arrow connecting steps. Pastel background washes (mint, lavender) for visual separation

### Star Rating Display
**Role:** Review rating indicator

5 solid yellow/gold stars (approximately #f5b800 implied), inline with testimonial cards. No container, no background — stars sit directly on cream card surface

### Pastel Section Background
**Role:** Decorative section wash

Full-width section with gradient or solid pastel fill (lemon #f3fb9a, lavender #efd8f0, mint #c6e57d), 30px border-radius on contained content blocks, creates visual rhythm between white sections

### Creator Profile Badge
**Role:** Inline creator attribution

Small pill badge with 20px border-radius, #fafafa background, 1px fog border, contains circular avatar + creator name + role. Used floating over product mockups in hero

### Nav Dropdown Indicator
**Role:** Expandable nav item chevron

Small downward chevron icon (stroke #482317, 1px) next to nav items with submenus (FEATURES, RESOURCES). No background, sits inline with nav text

## Do's and Don'ts

### Do
- Use #ecf956 lime as the only filled button color — it must remain the single chromatic action accent against the warm neutral system
- Set all buttons to 100px pill radius; cards to 30px radius; never mix sharp corners with this system
- Pair Tobias weight 300 serif displays (54-70px) with ABC Favorit weight 350-400 body — the serif/sans contrast is the system's editorial signature
- Use #482317 espresso for all text — never pure #000000, the warm brown is what makes the system feel approachable
- Apply pastel washes (#f3fb9a, #efd8f0, #c6e57d) to section backgrounds, not to text or interactive elements
- Set hero and section headings to line-height 1.03 with negative letter-spacing — the tight rhythm is essential to the editorial feel
- Use uppercase ABC Favorit weight 700 with positive tracking for nav items and button labels

### Don't
- Don't introduce a second action color — the lime CTA only works because everything else is neutral or pastel decorative
- Don't use Tobias serif for body text or UI labels — reserve it for displays and large section headings only
- Don't apply shadows to cards — the system uses flat surfaces with borders; the only shadow is the nav bar drop shadow
- Don't use pure white #ffffff or pure black #000000 — cream #fafafa and espresso #482317 define the warm palette
- Don't set card radius below 15px — the generous rounding (15-30px) is core to the friendly creator-economy feel
- Don't add gradient text effects or color overlays to the serif headings — keep them flat espresso on cream
- Don't use more than one pastel wash per section — multiple competing pastels will flatten the visual hierarchy

## Elevation

- **Navigation bar:** `rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px`

## Surfaces

- **Page Canvas** (`#fafafa`) — Off-white page background
- **Card Surface** (`#fafafa`) — Testimonial cards, product cards, content blocks
- **Decorative Wash** (`#efd8f0`) — Pastel lavender section or card accent
- **Accent Wash** (`#f3fb9a`) — Pastel lemon section or card accent

## Imagery

Lifestyle photography of real creators (not stock models) is the primary visual: warm, candid, individual personality. Product mockups are the secondary visual: phone screens, link-in-bio cards, and course previews with pastel gradient backgrounds. Decorative elements are hand-drawn and playful — sketchy arrows, star stickers, organic shapes in lime and yellow. No 3D renders, no corporate stock photography, no abstract gradient meshes. Icons are thin-stroke (1px) line icons in espresso brown, no filled icon variants.

## Layout

Centered max-width container (1200px) with generous side padding. Hero is full-bleed with a two-column split: left text block (headline + subhead + CTA), right floating product card mockup at slight rotation. Sections alternate between cream canvas and pastel washes (lavender-to-mint gradient, solid lemon, solid mint) creating visual rhythm. How-it-works section uses centered text above a 2-step illustration flow with connecting arrow. Testimonials are a 3-column card grid on a lavender-mint gradient background. Vertical spacing is generous (80px section gaps) with comfortable density throughout. Navigation is a minimal top bar — no sidebar, no mega-menu, just centered text links with dropdown chevrons.

## Similar Brands

- **Substack** — Same warm-creator palette approach with editorial serif displays paired with simple sans body, generous card rounding, and a single accent color
- **Gumroad** — Same creator-economy friendliness with pastel washes, pill buttons, and approachable rounded cards targeting individual sellers
- **Kit (ConvertKit)** — Same warm neutral base with a single vivid accent color, generous spacing, and editorial typography mixing serif and sans
- **Stan Store** — Same link-in-bio creator platform visual language with bold serif headlines, lime/bright CTAs, and pastel decorative cards
