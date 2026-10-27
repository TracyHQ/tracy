# Slash — Style Reference
> Midnight vault with gilded ledger lines.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Slash operates in a midnight gallery mode: an almost-black canvas, white type, and a single warm copper accent that functions as editorial punctuation. Display headings are set in Ivy Presto, a high-contrast didone serif used at extreme sizes (up to 88px) — this serif-versus-sans collision is the system's signature, lending financial seriousness without the stockbroker gravitas of traditional banking. The rest of the UI is deliberately quiet: thin borders, pill-shaped controls, compact 16px body text, and barely-there elevation that lets the serif breathe. A single golden gradient (chart line, micro-accents) injects warmth into an otherwise monochrome system, evoking the warm glow of a Bloomberg terminal rendered for a design audience.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#08080a` | Page canvas, footer background, deepest surface — near-black with the faintest blue undertone |
| Onyx | `#040406` | Card surface, secondary backdrop — one step deeper than the page for visual weight |
| Carbon | `#121317` | Elevated panels, subtle UI fills — the first clearly lighter step in the surface stack |
| Graphite | `#1c1d22` | Borders, dividers, icon containers, slider controls — the hairline color that defines structure |
| Slate | `#2e3038` | Secondary borders, muted icon strokes, subtle dividers between content blocks |
| Smoke | `#464853` | Tertiary borders, inactive nav items — barely visible structural lines |
| Ash | `#5e616e` | Muted body text, placeholder content, secondary metadata |
| Steel | `#777a88` | Button borders, icon strokes, secondary text, ghost button outlines |
| Fog | `#9194a1` | Nav text, body descriptions, helper text — the workhorse readable gray |
| Mist | `#acafb9` | Subdued body copy, supplementary text, less-emphasized paragraphs |
| Silver | `#c7c9d1` | Light body text, medium-emphasis paragraphs, secondary headings |
| Bone | `#e2e3e9` | High-emphasis body text, dense data labels, the default text tone across most UI |
| Paper White | `#ffffff` | Primary action button fill, headings, nav active state — the highest contrast color, reserved for elements that must command attention |
| Copper | `#cc9166` | Category labels, editorial links, warm accent punctuation — the only chromatic color, used sparingly to mark curated content and category tags |
| Gilded Gradient | `linear-gradient(103deg, rgb(174, 147, 87), rgb(255, 240, 204) 40%, rgb(174, 147, 87) 70%, rgba(189, 157, 79, 0))` | Chart line stroke, financial data visualization accent — a warm gold-to-cream gradient that brings the only color energy to data displays |

## Typography

### Ivy Presto — Display and heading serif — used exclusively for hero headlines and section titles at 28px and above. The high-contrast didone strokes with hairline serifs create editorial luxury; the slight 0.01em positive tracking is unusual and gives the type a printed, ledger-like feel. This serif is the primary brand signature — it separates Slash from every other SaaS fintech that defaults to geometric sans.
- **Substitute:** Playfair Display, DM Serif Display, Libre Caslon Display
- **Weights:** 400, 500
- **Sizes:** 28px, 44px, 52px, 64px, 88px
- **Line height:** 1.0–1.38
- **Letter spacing:** 0.0100em

### Inter — UI sans — body, nav, buttons, labels, links, form fields, and the 48px subhead level. The 300 weight appears on 18px body for whisper-quiet secondary copy; 500 dominates for medium-emphasis text and button labels; 600 is reserved for small-caps category labels. Negative letter-spacing tightens at 20px (−0.04em) and loosens as size decreases, characteristic of Inter's optical sizing.
- **Substitute:** Inter (self-hosted via Google Fonts)
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px, 20px, 24px, 48px
- **Line height:** 1.0–1.56
- **Letter spacing:** -0.0400em, -0.0250em, -0.0200em, -0.0130em, -0.0070em, 0.0100em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 13px | 1 | -0.26px |
| body-xs | — | — | 16px | 1.5 | 0px |
| body-sm | — | — | 18px | 1.38 | -0.36px |
| body | — | — | 20px | 1.38 | -0.8px |
| subheading | — | — | 24px | 1 | -0.31px |
| heading-sm | — | — | 44px | 1.38 | 0.44px |
| heading | — | — | 52px | 1.13 | 0.52px |
| heading-lg | — | — | 64px | 1.13 | 0.64px |
| display | — | — | 88px | 1 | 0.88px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1216px
- **Section gap:** 160px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 2px
- **tags:** 9999px
- **cards:** 10px
- **icons:** 9999px
- **inputs:** 9999px
- **buttons:** 9999px

## Components

### Primary Action Button
**Role:** Highest-emphasis interactive element — final conversion

Pill-shaped, 9999px radius. White (#ffffff) fill, black (#000000) text at 14px Inter weight 500. Padding 10px 20px. Used for 'Get Started' CTAs in header and hero. No border. The white-on-black inversion is the system's only loud visual signal — treat it as a rare resource.

### Ghost Outline Button
**Role:** Secondary action — paired with the primary in the header

Transparent fill with 1px white (#ffffff) border, 9999px radius. White text at 14px Inter weight 500. Padding 10px 20px. The 1px outline defines shape without filling — used for 'Sign in' and less-critical actions.

### Pill Tag Button
**Role:** Category filter, status indicator, small inline action

Transparent background, 1px border in #777a88, 9999px radius, padding 6px 10px. White text at 12–14px Inter. Smaller and more subdued than action buttons — the border color is intentionally cool gray, not white, to read as secondary.

### Hero Chart Card
**Role:** Showcase product visualization in the hero

Dark surface (#040406) with 10px radius. No visible border. Contains a balance header, period filter pill, a golden gradient line chart, and a spend-limit input field. The chart line uses the gilded gradient (linear-gradient 103deg) as its stroke — this is the only place where the copper/gold accent animates the page.

### Transaction List Card
**Role:** Dense data display panel

Right-side panel in hero, 10px radius, transparent fill. Contains rows with brand-color icon avatars (Meta blue, Adobe red, Stripe purple, Amazon orange, Etsy orange). Each row: icon well (1px border #2e3038, 9999px) + merchant name + amount right-aligned. Dense vertical rhythm with 2px internal padding.

### Testimonial Video Card
**Role:** Social proof with embedded video/photo

10px radius, image-fill background with a dark gradient overlay for text legibility. White text overlay at bottom: name in 16px Inter weight 500, title/company in smaller muted text. No border. The image fills 100% of the card area — text sits on a bottom-aligned gradient mask.

### Blog Post Card
**Role:** Editorial content card for insights/articles

10px radius, transparent fill. Top: image at native aspect ratio. Below: category eyebrow in Copper (#cc9166) at 13px Inter weight 600, date separator, then title in 18–20px Inter weight 500 in white. Read-time meta at bottom in #acafb9. No border — cards separate through whitespace alone.

### Email Capture Input
**Role:** Hero CTA email field

Transparent fill, 1px white (#ffffff) border, 9999px radius. Padding 10px 10px 10px 20px. Placeholder text in #777a88. The pill shape matches the primary button — the input and the 'Get Started' button are designed to read as a single unit, with the input's left padding larger to offset the button's visual weight on the right.

### Navigation Link
**Role:** Top-level menu item

No background, no border. Text at 14px Inter in #9194a1 (inactive) or #ffffff (active/hover). Dropdown chevron for items with sub-menus (Company, Products, Solutions). Padding 6px 10px for click target. 2px underline radius on hover indicators.

### Status Badge — Active
**Role:** Positive state indicator in data tables

Small pill, transparent fill with 1px green-toned border. Text in green at 12px Inter weight 500. 9999px radius, 2px vertical padding. The green is a desaturated sage that reads on dark without vibrating.

### Stat Display
**Role:** Large numerical proof point

Number in 28–44px Ivy Presto weight 400, white. Caption below in 14px Inter weight 400 in #9194a1. Example: '10,000+' headline number with 'businesses' label. The serif numeral creates editorial gravitas for statistics.

### Category Eyebrow
**Role:** Section-above-section label, article category

13px Inter weight 600, letter-spacing -0.02em. Copper (#cc9166) for blog categories, #9194a1 for section types. Functions as a typographic period before each content block — a small, precise label that sets up what follows.

### Data Table Row
**Role:** Spend limit, virtual account, or transaction table

Transparent fill, 1px bottom border in #1c1d22. No row padding between cells — density is high. Column headers in #9194a1 at 14px. Cell values in #e2e3e9 at 14–15px. Right-aligned numerics. The table relies on hairline dividers, not card containers.

## Do's and Don'ts

### Do
- Use Ivy Presto for all display and heading text at 28px and above — never for body copy under 20px.
- Set body text at 16px Inter weight 400 with line-height 1.5 in #e2e3e9 (Bone) — this is the default readable tone.
- Use the white (#ffffff) filled pill button exclusively for the single most important action on each screen — it is a scarce visual resource.
- Apply Copper (#cc9166) only to category labels and editorial links — never to buttons, icons, or large text blocks.
- Use 1px borders in #1c1d22 or #2e3038 for card and table edges; never use drop shadows for elevation.
- Space sections with 160px vertical gaps on desktop — the generous breathing room lets the serif headlines dominate.
- Use 9999px border-radius for all buttons, inputs, tags, and status indicators; use 10px for cards and 2px for nav underlines.

### Don't
- Don't substitute Inter for Ivy Presto on display text — the serif/sans contrast is the brand's identity, not decoration.
- Don't introduce blue, green, or any chromatic color as a brand accent — Copper is the only warm note in the palette.
- Don't use the white filled button more than once per viewport — its power diminishes with repetition.
- Don't add drop shadows to cards, modals, or popovers — use surface color steps and 1px borders instead.
- Don't set body text larger than 20px in Inter — larger sizes belong in Ivy Presto.
- Don't use #ffffff for long-form body copy — switch to #e2e3e9 (Bone) to reduce eye strain on dark backgrounds.
- Don't apply the gilded gradient outside data visualization contexts — it is reserved for chart lines and financial data accents.

## Elevation

- **Icon rings:** `rgba(255, 255, 255, 0.2) 0px 0px 0px 1px`

## Surfaces

- **Void** (`#08080a`) — Page canvas, page-level background
- **Card** (`#040406`) — Card surfaces, contained content blocks
- **Panel** (`#121317`) — Elevated panels, dropdown surfaces, input backgrounds
- **Floating** (`#1c1d22`) — Borders, dividers, floating UI elements, icon wells

## Imagery

Photography is editorial and naturalistic: warm-toned portrait shots of founders and team members in their actual work environments (offices, living rooms, construction sites). Images fill card frames edge-to-edge with no padding. A dark gradient overlay is applied to the bottom portion of testimonial cards for text legibility. The aesthetic is 'LinkedIn meets editorial magazine' — candid, human, slightly desaturated, never stock-photo polished. Article thumbnails mix photography with illustrated concepts (a man standing on a labyrinth, a fireplace with money bags). Product UI is shown in dark mode at full opacity, floating above the page on subtle dark surfaces — these are the hero's centerpiece. Icons are monochrome with 1px strokes in #2e3038 or #777a88, never filled with brand color.

## Layout

Max-width 1216px centered content with 160px vertical section gaps. The hero is a full-width dark canvas with a split composition: left-aligned serif headline at 64–88px with email capture below, and a large product UI card (the dashboard screenshot) on the right at 50% width. Subsequent sections use a single-column centered headline (serif at 44–64px) with subtitle in Inter, followed by 3-column card grids for features/testimonials/blogs. Navigation is a fixed top bar: logo left, center menu (Company, Products, Solutions, Customers, Pricing, FAQ), right-aligned Sign in (ghost) and Get Started (white filled pill). Footer is a dense 5-column link grid with company info and legal. The page alternates between content-rich grid sections and full-bleed stat callouts — rhythm is established by generous whitespace between bands, not by alternating background colors (the entire page is one continuous #08080a canvas).

## Similar Brands

- **Mercury** — Same dark-canvas fintech aesthetic with a single warm accent and serif/sans display pairing — both use generous whitespace, pill-shaped controls, and hairline borders rather than shadows.
- **Arc** — Shares the midnight-black surface stack, single-accent palette philosophy, and the use of a high-contrast serif for hero headlines to differentiate from generic SaaS fintech.
- **Brex** — Similar compact density, dark mode default, and 9999px pill buttons — though Brex leans more colorful and brand-illustrated, where Slash is monochrome with copper punctuation.
- **Ramp** — Comparable card-grid layouts and 1216px content width, but Ramp's palette is warmer and more saturated; Slash's is closer to a Bloomberg terminal with editorial restraint.
- **Stripe** — Both achieve premium fintech feel through typography discipline and hairline borders over heavy shadows, though Stripe's gradient system is more visible and Slash is nearly monochrome.
