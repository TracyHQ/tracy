# Payments — Style Reference
> zesty citrus on royal violet. Deep electric purple acts as the night sky while lemon-yellow accents spark like fresh citrus zest across a clean white surface.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lemon Squeezy operates on an electric-citrus visual logic: deep royal violet dominates as the hero and CTA canvas, while a sharp lemon-yellow accent acts as functional punctuation for announcement bars and brand moments. The typography pairs a geometric custom display face (Circular Pro Book) with tight negative tracking against Inter for body, producing confident blocky headlines that feel modern without coldness. Cards are unusually rounded at 48px, giving every surface a soft approachable weight, while primary action buttons sit at a tighter 8px radius — a deliberate contrast between playful surfaces and decisive calls-to-action. Full-bleed purple feature bands alternate with white content sections, creating a rhythm of bright calm punctuated by bold brand color. Product mockups float on angled tablets with subtle elevation, reinforcing the all-in-one platform narrative through visual proximity.

## Colors

| Name | Value | Role |
|------|-------|------|
| Royal Violet | `#5423e7` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Electric Iris | `#7047eb` | Icon strokes, secondary accents on violet backgrounds, chart highlights — a slightly lighter companion to Royal Violet |
| Lemon Zest | `#ffc233` | Top announcement banners, brand lemon accent, key highlight moments — a sharp citrus spike against the violet/white system |
| Orchid | `#cf75ff` | Decorative pastel accent on violet sections, soft highlight washes, pill badge fills |
| Lilac Mist | `#e5b5fe` | Soft pastel background fills, subtle card highlights, eyebrow tag backgrounds |
| Blush | `#fcc7f3` | Pale wash backgrounds, secondary pastel accent |
| Cobalt | `#0075ad` | Brand icon accents, chart data lines, secondary illustration color |
| Emerald | `#1e874c` | Green supporting accent for decorative details and low-frequency emphasis |
| Magenta | `#db0bb9` | Decorative accent, illustration color, highlight moments |
| Crimson | `#d50b3e` | Decorative accent, illustration color, highlight moments |
| Ember | `#eb3a00` | Decorative accent, illustration color, warm highlight moments |
| Obsidian | `#121217` | Primary text, dark filled buttons, nav text, headings — the near-black that carries all foreground content |
| Paper | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Fog | `#f7f7f8` | Page canvas, subtle section backgrounds, surface level beneath cards |
| Slate | `#6c6c89` | Muted body text, secondary descriptions, nav links, helper copy |
| Ash | `#d1d1db` | Hairline borders, dividers, subtle separation lines |

## Typography

### Circularpro Book — Display and heading family — used for all headlines from 18px sub-labels up to 80px hero display. Custom geometric sans with tight negative tracking creates a blocky, confident presence. The ss04 alternate set should be enabled for brand character.
- **Substitute:** Plus Jakarta Sans or General Sans at weight 400
- **Weights:** 400
- **Sizes:** 18px, 26px, 36px, 38px, 48px, 56px, 80px
- **Line height:** 1.00, 1.13, 1.14, 1.20, 1.22, 1.25
- **Letter spacing:** -0.04em at 80px, -0.04em at 56px, -0.04em at 48px, -0.04em at 38px, -0.04em at 36px, -0.03em at 26px, -0.02em at 18px
- **OpenType features:** `"ss04" on`

### Inter — Body and UI text — nav links at 15px, body copy at 16-18px, uppercase labels at 14px with wide tracking. The 0.143em letter-spacing at 14px signals the eyebrow/label style for section headers.
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400, 500
- **Sizes:** 14px, 15px, 16px, 18px
- **Line height:** 1.29, 1.40, 1.60, 1.70, 1.80
- **Letter spacing:** -0.01em at 18px, normal at 16-15px, 0.143em (uppercase) at 14px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.29 | 2px |
| body | — | — | 16px | 1.7 | — |
| body-lg | — | — | 18px | 1.6 | -0.18px |
| subheading | — | — | 26px | 1.25 | -0.78px |
| heading-sm | — | — | 38px | 1.2 | -1.52px |
| heading | — | — | 48px | 1.14 | -1.92px |
| heading-lg | — | — | 56px | 1.13 | -2.24px |
| display | — | — | 80px | 1 | -3.2px |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 8px

### Border Radius

- **cards:** 48px
- **input:** 8px
- **buttons:** 8px
- **largeCTA:** 32px
- **navPills:** 40px

## Components

### Announcement Banner
**Role:** Top-of-page yellow bar for promotions and feature announcements

Full-width strip with #ffc233 (Lemon Zest) background. Text at 14px Inter weight 500, #121217, uppercase with 2px letter-spacing (0.143em). Optional pill-shaped white CTA on the right with 40px radius, 8px 16px padding, #121217 text at 14px Inter weight 500.

### Navigation Bar
**Role:** Primary site navigation

White #ffffff background, height ~64px, subtle border-bottom #d1d1db at 1px. Logo left (lemon icon + wordmark in Obsidian #121217). Nav links center at 15px Inter weight 500, #6c6c89, with 8px 16px padding. Right side: dark filled CTA button (#121217 fill, #ffffff text, 8px radius, 12px 20px padding) and a ghost text link ("Sign in") in #6c6c89.

### Filled Primary Button
**Role:** Primary action button (Get started, Sign up)

Dark fill #121217, white #ffffff text at 15px Inter weight 500. 8px border-radius. 12px vertical, 20px horizontal padding. Trailing arrow icon at 16px. On hover: slight elevation. When placed on violet hero: inverts to white #ffffff fill with #121217 text.

### Ghost Secondary Button
**Role:** Secondary action or outlined button

Transparent or white #ffffff fill, 1px border #d1d1db (or #ffffff border on violet backgrounds). Text at 15px Inter weight 500, #121217 (or #ffffff on violet). 8px border-radius. 12px 20px padding.

### Pill Nav Link
**Role:** Rounded pill navigation or tag link

40px border-radius, 8px 16px padding, 15px Inter weight 500 in #6c6c89. Active state: #5423e7 background with #ffffff text.

### Hero Section
**Role:** Full-bleed opening section with product showcase

Full-width #5423e7 (Royal Violet) background. Left column: 56px Circularpro Book weight 400 headline, #ffffff, letter-spacing -2.24px (-0.04em), line-height 1.13. Below: 18px Inter weight 400 subtext in #ffffff with 80% opacity. CTA button below subtext. Right column: angled tablet product mockup floating at slight perspective, with subtle drop shadow.

### Feature Card
**Role:** Content card for features, blog posts, pricing tiers

White #ffffff background, 48px border-radius, 40px padding on all sides. Optional 1px border #d1d1db or subtle shadow (0 4px 24px rgba(18,18,23,0.06)). Heading at 26px Circularpro Book #121217. Body at 16px Inter #6c6c89. When on a violet background: white card with same internal structure.

### Product Mockup Tablet
**Role:** Floating tablet device showing dashboard or product UI

Realistic tablet frame with thin bezels, displayed at 15-20 degree rotation, positioned in the right half of hero or CTA sections. White screen showing actual product interface (charts, tables, navigation). Cast shadow: 0 20px 60px rgba(18,18,23,0.15) for floating effect.

### Section CTA Band
**Role:** Full-bleed purple section with closing call-to-action

Full-width #5423e7 background, max-width 1200px content centered. Eyebrow label at 14px Inter uppercase, 2px tracking, #ffc233 or white at 80% opacity. Heading at 48px Circularpro Book weight 400, #ffffff, -1.92px letter-spacing. CTA button (white fill, #121217 text, 32px radius — larger variant). Product mockup on right at slight angle.

### Eyebrow Label
**Role:** Small uppercase section header above headlines

14px Inter weight 500, uppercase, letter-spacing 2px (0.143em). On white backgrounds: #6c6c89. On violet backgrounds: #ffc233 or #ffffff at 80% opacity. Always paired with a larger heading below.

### Nav Dropdown Item
**Role:** Items within a dropdown menu

White #ffffff background, 8px border-radius, 16px padding. Text at 15px Inter weight 500, #121217 for title, 13px Inter #6c6c89 for description. Hover: #f7f7f8 background.

### Icon Button
**Role:** Small standalone icon button (social, utility)

32px to 40px square or circle, transparent background. Icon at 20px, fill #7047eb (Electric Iris) on violet backgrounds or #121217 on white. Optional 1px border #d1d1db.

### Stat Counter Block
**Role:** Large number display in feature or social proof sections

Number at 56px Circularpro Book weight 400, #121217 or #ffffff depending on background. Label at 14px Inter #6c6c89 below, uppercase with 2px tracking.

## Do's and Don'ts

### Do
- Use #5423e7 (Royal Violet) for any full-bleed hero or CTA section — it is the dominant brand canvas
- Set all card border-radius to 48px for the soft approachable surface feel
- Apply Circularpro Book at weight 400 with -0.04em letter-spacing for all headlines 26px and above
- Use #ffc233 (Lemon Zest) exclusively for announcement bars and brand accent moments, never as a background for content
- Pair Inter 14px uppercase with 2px letter-spacing for all eyebrow/section labels above headlines
- Float product mockups at 15-20 degree angles with 0 20px 60px rgba(18,18,23,0.15) shadow
- Set all primary action buttons to #121217 fill with #ffffff text and 8px radius — never use a chromatic CTA color
- Use Electric Iris #7047eb for icon strokes on violet backgrounds, never Royal Violet on violet
- Maintain 80px section gaps and 40px card padding as the vertical rhythm baseline
- Enable "ss04" font feature setting on all Circularpro Book instances for brand-consistent character alternates

### Don't
- Do not use chromatic colors for CTA buttons — Lemon Squeezy uses neutral dark or white fills for all primary actions
- Do not set border-radius below 48px on cards or above 8px on buttons — the 40px gap between them is signature
- Do not place body text directly on #5423e7 at full opacity without testing — use #ffffff at 80-100% opacity only
- Do not use letter-spacing wider than -0.01em on body text — the negative tracking is essential to the geometric feel
- Do not use the decorative chromatic colors (#cf75ff, #db0bb9, #d50b3, #eb3a00) for UI elements — they are for illustrations and chart accents only
- Do not add heavy box-shadows to cards — keep elevation subtle (rgba 0.06-0.08) or use borders instead
- Do not center-align body paragraphs — headlines and body copy are left-aligned within their containers
- Do not use more than two type families in a single view — Circularpro Book for headings, Inter for everything else
- Do not apply gradients — the system is flat color, depth comes from surface layering and subtle shadows only
- Do not use rounded images smaller than 16px radius — the system favors generous rounding or sharp edges, not medium values

## Elevation

- **Product Mockup Tablet:** `0 20px 60px rgba(18, 18, 23, 0.15)`
- **Feature Card:** `0 4px 24px rgba(18, 18, 23, 0.06)`
- **Filled Primary Button:** `0 1px 2px rgba(18, 18, 23, 0.08)`

## Surfaces

- **Fog** (`#f7f7f8`) — Page canvas — the base background behind all content
- **Paper** (`#ffffff`) — Card surfaces, navigation bar, form backgrounds — one level above canvas
- **Royal Violet** (`#5423e7`) — Brand hero and CTA section backgrounds — the highest visual level

## Imagery

Product mockups dominate the visual language: realistic tablet devices shown at 15-20 degree perspective angles, floating with soft drop shadows against violet backgrounds. The tablet screens display actual dashboard interfaces with charts, tables, and sidebars — never abstract wireframes. No lifestyle photography or decorative illustrations. When charts appear, they use a mix of violet (#5423e7) primary lines with secondary accents in #7047eb and pastels. Icons throughout are 2px-stroke geometric line icons in Electric Iris #7047eb on violet, Obsidian #121217 on white. No stock photography, no human imagery — the product UI IS the hero.

## Layout

Full-bleed alternating section pattern. Hero is a full-viewport #5423e7 band with left-aligned headline (max-width 560px) and angled tablet mockup on the right. Content sections drop to white #ffffff or Fog #f7f7f8 with max-width 1200px centered, using 2-column text+image or 3-column card grids. Every 2-3 sections, a full-bleed purple CTA band repeats the hero treatment at reduced scale. Navigation is a sticky white top bar with centered dropdowns. Vertical rhythm uses 80px section gaps with 40px internal card padding. Feature sections alternate text-left/image-right and text-right/image-left. Grid usage: 3-column card grid for feature highlights, 2-column for detailed feature blocks, 4-column for logo/brand bars.

## Similar Brands

- **Stripe** — Same full-bleed colored hero bands with product mockups on the right, clean white content sections, and restrained chromatic palette
- **Linear** — Same left-aligned geometric headlines with tight negative tracking and product-first mockup heroes on dark/colored backgrounds
- **Paddle** — Same fintech-for-SaaS positioning with violet-leaning brand palette and tablet product showcases
- **Chargebee** — Same purple-toned brand identity and alternating content/CTA section rhythm for subscription billing platforms
- **Vercel** — Same generous card rounding (48px), tight tracking on display type, and full-bleed dark hero pattern with floating product visuals
