# Glideapps — Style Reference
> monochrome drafting table with one electric teal spark

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Glide is a near-monochromatic, border-driven interface: black text, white canvas, and a single vivid teal that sparks to life only on primary actions. Typography is the main expressive instrument — a heavy workhorse sans for UI and a distinctive display face for headlines, both pulled tight with negative tracking. Components sit on hairline borders rather than shadows; the whole system reads like a precise drafting table where one electric accent is allowed to break the discipline.

## Colors

| Name | Value | Role |
|------|-------|------|
| Glide Teal | `#71eaee` | Primary action background, logo mark — the single chromatic accent in an otherwise black-and-white system, creating unmistakable focus on CTAs without warmth or aggression |
| Teal Mist | `#e4feff` | Tinted wash for announcement pills, hover states on teal actions, and subtle accent backgrounds — extends the brand teal into ambient surface treatments |
| Ink Black | `#000000` | Body text, heading text, icon strokes, hairline borders, and the dominant structural element — borders outnumber fills, so black reads as architecture not just type |
| Charcoal | `#303030` | Secondary text, link borders, list dividers — slightly softer than pure black for non-headline copy |
| Graphite | `#5c5c5c` | Muted text, button borders, link borders — mid-gray for tertiary information and inactive outlines |
| Obsidian | `#171715` | Input field shadows and deep UI accents — near-black with a barely-perceptible warm undertone |
| Slate | `#242421` | Icon borders, link text on dark surfaces — another near-black tier for fine-grained contrast control |
| Ash Gray | `#80807c` | Disabled or placeholder text — the lightest readable gray |
| Fog | `#999991` | Faint link borders, low-emphasis dividers |
| Stone | `#d9dad3` | Section background bands, muted surface alternation — warm-leaning neutral that prevents the page from feeling cold |
| Bone | `#edede8` | Card surfaces, input backgrounds, secondary surface level — sits between white and stone for subtle elevation |
| Paper White | `#ffffff` | Primary canvas, card surfaces, button backgrounds — the base layer of the surface stack |

## Typography

### bootonFont (custom — likely a neo-grotesque or geometric sans similar to Inter, Söhne, or GT America) — Workhorse family for body, navigation, buttons, inputs, cards, and smaller headings. Weight 575 (a custom semi-bold) carries the brand's confident-but-not-heavy voice across UI. Weight 700 anchors the largest headlines; weight 400 handles everything else.
- **Substitute:** Inter or Söhne
- **Weights:** 400, 575, 600, 700
- **Sizes:** 12, 14, 16, 20, 22, 48, 60, 85
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.01em to -0.02em, tighter at larger sizes

### affairsFont (custom — a distinctive display face, possibly a high-contrast serif or a wide neo-grotesque) — Reserved exclusively for hero and display headings at 36px and 80px. Used at weight 400 only, which is anti-convention — most display faces use 700+ for impact. This whisper-weight creates drama through restraint and lets the display face carry personality that the workhorse cannot.
- **Substitute:** GT Sectra Display or Tobias
- **Weights:** 400
- **Sizes:** 36, 80
- **Line height:** 1.05–1.20
- **Letter spacing:** -0.01em to -0.02em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 22px | 1.3 | -0.22px |
| heading | — | — | 36px | 1.2 | -0.36px |
| heading-lg | — | — | 48px | 1.1 | -0.96px |
| display | — | — | 80px | 1.05 | -1.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 6px
- **cards:** 6px
- **images:** 6px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Teal Primary Button
**Role:** Filled CTA — the system's one chromatic action

Background #71eaee, text #000000 in bootonFont weight 575, 6px radius, 10px–12px vertical padding and 20px horizontal padding. An inset white highlight (rgba(255,255,255,0.2) 0px -1px 0px 0px inset) adds a subtle top bevel without using drop shadow. This is the only button that uses color; everything else is monochrome.

### Ghost Text Link
**Role:** Inline navigation and footer links

No background, no border. Text in #303030 or #5c5c5c at 14–16px bootonFont weight 400, with -0.16px letter-spacing. Color shifts to #000000 on hover. Underline appears only on hover, not by default.

### Outlined Ghost Button
**Role:** Secondary action — 'Contact sales' in header

Transparent background, 1px solid #000000 border, 6px radius, bootonFont weight 575 at 14px. Black text. The hairline border and absence of fill keep it visually subordinate to the teal primary.

### Teal Announcement Pill
**Role:** Banner-style notice above hero — 'The Next Generation of Glide is Coming Soon'

Background #e4feff (teal mist), no border, 9999px pill radius. Text 14px bootonFont weight 400, black. Contains a teal-tinted action link ('Join the waitlist') in a slightly darker weight. Floats centered above the hero headline.

### Hero Input + Action
**Role:** Combined prompt field and creation button in hero

Single horizontal container with 6px radius. Left side: text input with placeholder 'Describe the app you want to build' in #80807c. Right side: upload affordance with paperclip icon. The teal 'Create app' button sits flush at the right edge. The whole unit is one visual block, not separate components.

### Card Carousel Item
**Role:** Horizontal scrolling feature cards in mid-page section

Each card has a 6px radius and contains a full-bleed image or product screenshot. No visible card border — the image edge defines the card edge. Below the image: 2–3 lines of body text (bootonFont 16px, #303030) with a bold lead-in phrase. Cards are equal width and scroll horizontally with arrow controls.

### Dark Video Panel
**Role:** Full-bleed video showcase section

Pure black background (#000000) breaking from the otherwise white page. Contains a video thumbnail with rounded edges and a centered 'Watch Video' ghost button. This section is the only dark moment in the layout — it acts as a visual rest between white sections.

### Logo Trust Bar
**Role:** Social proof strip with company logos

Horizontal row of grayscale client logos (KROHNE, AIRBUS, HEALTHADVISOR, MERCURY, HP, TTR Sotheby's) separated by thin dividers. Centered text 'Trusted by over 100,000 high-performing companies' in bootonFont weight 575. No background, no border — logos sit directly on white canvas.

### Navigation Bar
**Role:** Top-level site navigation

White background, no border or shadow. Left: Glide logo (black mark + wordmark). Center: nav links (Product, Solutions, Customers, Resources, Pricing) in bootonFont 14px weight 400, #000000. Right: search icon, 'Log in' text link, 'Contact sales' ghost button, and teal 'Start for free' filled button. Fixed height, generous horizontal padding.

### Input Field
**Role:** Text inputs in forms and hero prompt

White or #edede8 background, 1px solid #d9dad3 or #000000 border, 6px radius. Placeholder text in #80807c. No visible focus ring in raw data — focus likely shifts border to #000000. Padding 12px vertical, 16px horizontal.

### Feature Card (Product Screenshot)
**Role:** Showcase card with embedded product UI screenshot

Contains a full product screenshot (phone mockup or dark app UI) at native resolution. 6px image radius. The screenshot itself provides the color and visual interest — the card wrapper is invisible. Caption text below in 2 lines maximum.

## Do's and Don'ts

### Do
- Use #71eaee exclusively for primary action fills — never for decorative backgrounds, icons, or non-action elements
- Set headline letter-spacing to -0.02em at 48px and above, and -0.01em at 20–36px; body text stays at default tracking
- Use 6px border-radius on all cards, buttons, inputs, and images — consistency at this radius is the system's signature
- Layer surfaces in this order: #ffffff (page) → #edede8 (card) → #d9dad3 (section band) → #e4feff (accent wash) → #000000 (dark break)
- Use 1px solid #000000 borders for structural separators; reserve #d9dad3 for non-structural dividers
- Set hero and display headlines in affairsFont at weight 400 only — the whisper weight is the point
- Keep body and UI text in bootonFont weight 400–575; reserve weight 700 for the largest headings only

### Don't
- Do not use drop shadows on cards, buttons, or any elevated surface — the system uses inset highlights and border weight, not shadows
- Do not introduce additional accent colors — the entire system is black, white, and one teal
- Do not use rounded radii above 6px on standard components — 12px or larger radii break the architectural feel
- Do not use affairsFont for body text, navigation, buttons, or anything below 36px — it is a display face only
- Do not set headlines in bootonFont weight 700 at 80px — the system uses affairsFont weight 400 at that size for contrast
- Do not use teal (#71eaee) for text — use it only as a fill or background
- Do not add gradients, blurs, or glassmorphism effects — the system is deliberately flat and border-driven

## Elevation

- **Teal Primary Button:** `rgba(255, 255, 255, 0.2) 0px -1px 0px 0px inset`
- **Card or surface with top highlight:** `rgb(255, 255, 255) 0px -2px 0px 0px inset`

## Surfaces

- **Page Canvas** (`#ffffff`) — Primary page background — clean white, letting typography and teal accents do the work
- **Card Surface** (`#edede8`) — Nested card or input backgrounds, slightly warm to differentiate from pure white
- **Section Band** (`#d9dad3`) — Alternating section backgrounds to create rhythm between content blocks
- **Accent Wash** (`#e4feff`) — Teal-tinted background for announcement pills, highlight callouts, and active-zone backgrounds

## Imagery

Imagery is functional, not decorative. Product screenshots (phone mockups, dark app UIs) serve as the primary visual content in feature cards, embedded at native size with no framing or shadow. A single dark video panel provides the only photographic moment. Client logos in the trust bar are grayscale. No lifestyle photography, no abstract gradients, no 3D renders — the interface is the visual.

## Layout

Centered max-width 1200px layout with full-bleed section capability. The page follows a strict vertical rhythm: white hero with centered headline and input, dark video break, white trust bar, white feature carousel, with sections separated by 80px gaps. Hero is a centered text stack (no split layout). Feature cards use a horizontal carousel rather than a grid. The navigation is a single horizontal bar — no sidebar, no mega-menu. The entire layout reads as one tall column with alternating density, not a multi-column dashboard.

## Similar Brands

- **Linear** — Same monochrome-first approach with hairline borders, 6px–8px radii, and a single accent color reserved exclusively for primary actions
- **Vercel** — Near-identical surface stack logic (white canvas, gray card, dark section break) and the same restraint of using color only on CTAs
- **Stripe** — Custom display typeface for headlines paired with a workhorse sans for UI, with negative letter-spacing tightening the typographic rhythm
- **Frame.io** — Border-driven layout architecture where 1px lines define structure rather than shadows or cards, with a single vivid accent for actions
- **Pitch** — Same minimalist monochrome canvas with one electric accent color, tight typographic tracking, and small uniform border radii
