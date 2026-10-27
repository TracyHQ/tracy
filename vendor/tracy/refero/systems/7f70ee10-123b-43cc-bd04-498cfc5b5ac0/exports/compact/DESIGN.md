# Moxie — Style Reference
> Editorial darkroom with a single periwinkle flare — serif headlines float on a black void while a vivid blue accent punctuates the silence.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Moxie's design system operates as an editorial PR-agency darkroom: deep black canvas, warm cream typography, and a single vivid periwinkle accent that lights up interactions like a stage spotlight. The pairing of IBM Plex Serif (for headlines) with IBM Plex Sans (for everything else) creates a magazine-meets-product tension — the serif whispers authority and editorial polish, while the sans keeps functional UI grounded and modern. Layout breathes generously with large centered serif hero statements, asymmetric card grids for work showcases, and horizontal scrolling case-study carousels. Color is used sparingly: the cream (#f4efd4) does the heavy lifting for text and hairline borders on cards, the periwinkle blue (#84acfb) acts as a singular accent for italic emphasis, active states, and the sole filled CTA, and deeper warm grays layer card-on-card depth. There are no shadows, no gradients, no decorative chrome — the system relies on generous spacing, type contrast, and selective color punctuation to create hierarchy.

## Colors

| Name | Value | Role |
|------|-------|------|
| Periwinkle Flare | `#84acfb` | Primary action background, italic emphasis text, active nav state, heading accent — the lone chromatic signal in an otherwise achromatic system, used surgically to make interactions feel switched on |
| Warm Cream | `#f4efd4` | Primary text, card borders, hairline dividers, card surfaces — a warm off-white that softens the black void and carries the editorial tone |
| Warm Ash | `#626055` | Secondary card borders, muted text, button borders — a mid-tone warm gray for layering depth between cream borders and the black canvas |
| Charcoal Veil | `#333333` | Subtle borders, low-emphasis dividers, body text borders — the deepest visible neutral for near-invisible structural lines |

## Typography

### IBM Plex Serif — Display and heading typeface — weight 300 at 55px creates a whisper-light editorial presence; this serif choice signals PR-agency sophistication and gives the brand a magazine-editorial voice that distinguishes it from typical sans-serif tech sites
- **Substitute:** EB Garamond, Cormorant Garamond, Source Serif Pro
- **Weights:** 300, 400, 500
- **Sizes:** 17px, 22px, 26px, 28px, 43px, 55px
- **Line height:** 1.10, 1.20

### IBM Plex Sans — Body, UI, navigation, buttons, captions — the functional workhorse at 16-17px weight 400; weight 300 is used for secondary text creating a light, airy body voice; weight 500 for emphasis and button labels
- **Substitute:** Inter, Source Sans Pro, system-ui
- **Weights:** 300, 400, 500
- **Sizes:** 10px, 12px, 14px, 16px, 17px, 24px
- **Line height:** 1.00, 1.20, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | — |
| body-lg | — | — | 17px | 1.5 | — |
| subheading | — | — | 24px | 1.2 | — |
| heading-sm | — | — | 28px | 1.2 | — |
| heading | — | — | 43px | 1.1 | — |
| display | — | — | 55px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 19-35px
- **Element gap:** 17-21px

### Border Radius

- **tags:** 1000px
- **cards:** 8-14px
- **buttons:** 1000px

## Components

### Pill Navigation Button
**Role:** Primary CTA in nav bar

Fully rounded pill (1000px radius) filled with #84acfb periwinkle blue, cream text (#f4efd4) in IBM Plex Sans weight 500, 7px vertical / 21px horizontal padding. The single chromatic element in the header, making it the obvious action target.

### Outlined Pill Button
**Role:** Secondary action button

Pill shape (1000px radius) with warm ash (#626055) border, transparent fill, cream text (#f4efd4) in IBM Plex Sans 14-16px weight 400. Used for secondary CTAs like 'Meet the team'.

### Hero Serif Statement
**Role:** Section-opening editorial headline

Centered IBM Plex Serif weight 300 at 55px, warm cream (#f4efd4) color, line-height 1.10. Key words in italic periwinkle (#84acfb) for emphasis — the italic-periwinkle combination is the signature accent pattern.

### Brand Logo Strip
**Role:** Client/brand showcase row

Horizontal row of client brand wordmarks in cream (#f4efd4) on black canvas, centered, evenly spaced with ~35px gaps. Each logo is a different typographic identity (serif, sans, script) at uniform visual weight.

### Case Study Card
**Role:** Portfolio work tile

Rounded card (~8-14px radius) with cream (#f4efd4) hairline border, no fill, contains a full-bleed image with cream border, and a small circular '+' button overlay in the top-right corner. 17-21px internal padding.

### Testimonial Card
**Role:** Client quote card

Card with ~14px radius, cream (#f4efd4) border, slightly elevated dark surface. Opens with a large periwinkle (#84acfb) opening quotation mark. Quote text in IBM Plex Sans 14-16px cream, attribution name in weight 500, title in lighter weight.

### Carousel Navigation Arrows
**Role:** Horizontal scroll controls

Small circular buttons with cream (#f4efd4) border and arrow icons, positioned at the top-right of carousels. Minimal, functional, ghost-style.

### Section Heading
**Role:** Subsection title

IBM Plex Serif weight 300 at 43px, cream (#f4efd4), left-aligned, with generous top spacing (~80-100px) from previous section. Establishes the editorial section rhythm.

### Italic Accent Phrase
**Role:** Inline emphasis within serif headlines

Words or short phrases set in IBM Plex Serif italic, periwinkle blue (#84acfb) color, embedded within cream serif statements. The signature visual move — 'builds category leaders', 'venture' — turns ordinary headlines into typographic compositions.

### Hamburger Menu Icon
**Role:** Mobile/simplified nav trigger

Three thin horizontal lines in cream (#f4efd4), minimal weight, positioned top-left. No background, no border — pure typographic icon.

## Do's and Don'ts

### Do
- Use IBM Plex Serif weight 300 at 43-55px for all section and hero headlines — the whisper-light weight is non-negotiable for the editorial voice
- Apply the italic-periwinkle accent pattern: set one key phrase per headline in IBM Plex Serif italic, color #84acfb, to create typographic rhythm
- Use 1000px border-radius (full pill) for all buttons and interactive tags
- Set card borders to 1px #f4efd4 with no fill or shadow — structure is created by lines and spacing, never by elevation
- Maintain black (#000000) as the sole page background — never lighten it with gray washes or subtle gradients
- Use IBM Plex Sans weight 300 for secondary body text and weight 500 for button labels and attributions to create clear text hierarchy
- Space sections with 80-120px vertical gaps to let the dark canvas and serif type breathe

### Don't
- Don't use drop shadows on any element — the system is intentionally shadowless and relies on borders and spacing for structure
- Don't use #84acfb for large background areas or decorative blocks — it is a surgical accent, not a surface color
- Don't set headlines in IBM Plex Sans — the serif/sans split is a load-bearing system choice; headlines must always be Plex Serif
- Don't use weight 600-700 for headlines — the whisper-light 300 weight is the signature; heavier weights would break the editorial tone
- Don't introduce additional accent colors — the system is monochromatic plus one periwinkle; adding a second chromatic would dilute the signal
- Don't add gradients, glows, or blur effects to any element — the flatness is the point
- Don't use square or small-radius buttons for primary actions — all interactive elements should be pill-shaped (1000px radius)

## Elevation

No shadows. Hierarchy is created through generous spacing, hairline cream borders, and card-on-card tonal layering — never drop shadows. This deliberate shadowlessness keeps the design flat, editorial, and fast.

## Surfaces

- **Void Canvas** (`#000000`) — Page background — the deep black that everything sits on, creating maximum contrast for cream typography
- **Card Surface** (`#1a1a1a`) — Elevated card backgrounds for testimonials, case study tiles, and content blocks
- **Cream Border** (`#f4efd4`) — Hairline card borders that define structure without elevation — the primary border color

## Imagery

Imagery is photo-driven and editorial: full-bleed campaign stills (Liquid Death portrait), product close-ups (Oura ring macro shot), and video call screenshots fill case study tiles. Treatment is raw and uncropped — images sit in their card containers with cream hairline borders rather than masked or shaped. Photography is high-contrast and dramatic, matching the dark canvas. No illustrations, no abstract graphics, no 3D renders. Icons are minimal — only the '+' overlay button and carousel arrows. The visual language is 'show the work at full fidelity' rather than stylized or decorative.

## Layout

Full-width dark sections separated by generous vertical rhythm (80-120px). Hero is centered text-only with a large serif statement floating on black void. Content sections use a max-width ~1200px centered container. Case study tiles appear in a 2-column grid with one large featured tile and a grid of smaller thumbnails. Testimonials use a 3-column horizontal card row with carousel navigation. The brand logo strip is a single full-width centered row. Navigation is minimal: hamburger left, wordmark center, single pill CTA right — no mega-menu, no sidebar.

## Similar Brands

- **Pentagram** — Same editorial dark canvas with serif headlines and generous whitespace — both treat the homepage as a typographic composition rather than a product surface
- **Giant Spoon** — Agency-site convention of large centered serif statements on dark backgrounds with a single accent color for emphasis and CTAs
- **Anomaly** — Dark-mode agency aesthetic mixing serif and sans typography with pill-shaped navigation CTAs and a single vivid accent color
- **Red Antler** — Brand-agency pattern of warm cream typography on black with strategic color accents and editorial serif headlines
