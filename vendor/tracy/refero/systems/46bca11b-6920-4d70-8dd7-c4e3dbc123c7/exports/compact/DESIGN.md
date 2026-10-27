# iUSPC by Coinshift — Style Reference
> Midnight trading floor — cold slate surfaces, a single ember pilot light, and grid lines drawn on darkness.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

iUSPC is a midnight trading floor rendered in near-grayscale: a near-black canvas with a faint blue cast, flat surfaces separated by hairline borders rather than shadows, and a single ember accent that glows from the edges like a pilot light. The system communicates institutional weight through restraint — Inter at weight 300–400 dominates, with all-caps tracked labels providing the only typographic punctuation. Color is rationed: 97% of the surface stays cold and neutral, the remaining 3% is a warm red-orange used only for atmospheric glow, focus states, and the live signal dot. Ghost controls replace filled buttons; the page is full-bleed with centered max-width content blocks separated by generous vertical breathing room. The grid lines visible in the hero background signal a financial-instrument sensibility — precise, measured, and architectural.

## Colors

| Name | Value | Role |
|------|-------|------|
| Abyss Ink | `#020617` | Page canvas, hero background, section backgrounds — the base surface every other color sits on |
| Deep Slate | `#0a0e1a` | Elevated surfaces, card backgrounds, subtle surface lift from the canvas |
| Frost White | `#f1f5f9` | Primary headline text, logo wordmark, highest-emphasis content |
| Cloud Gray | `#e5e7eb` | Body text, secondary headlines, hairline borders, divider lines — the workhorse neutral that draws the structural lines of the page |
| Slate Mist | `#64748b` | Tertiary text, muted sub-headlines, nav secondary items, icon fills at rest |
| Graphite | `#475569` | Card body text, secondary paragraph copy, low-emphasis content |
| Steel Border | `#353845` | Outlined button borders, ghost control frames, subtle elevated dividers |
| Pale Mist | `#cbd5e1` | Micro-copy, fine-print detail, rare light text accents |
| Ember Glow | `#fa3812` | Supporting palette color for small decorative accents when the core palette needs contrast. |
| Ember Border | `#651a15` | Deep red border tone for warm-bordered emphasis elements and the underside of the gradient wave |
| Signal Green | `#34d399` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |

## Typography

### Inter — The sole display and body typeface. Weight 300 on hero and section headlines whispers rather than shouts — institutional confidence through restraint. Weight 400 for body, 500 for navigation, and 600 reserved for emphasized content. Negative letter-spacing (-0.025em) tightens display sizes while wide tracking (0.200–0.300em) on all-caps section labels gives them the cadence of architectural annotations.
- **Substitute:** Inter (Google Fonts) or system-ui sans-serif
- **Weights:** 300, 400, 500, 600
- **Sizes:** 11px, 12px, 14px, 16px, 18px, 20px, 24px, 30px, 36px, 48px, 56px
- **Line height:** 1.00–1.63
- **Letter spacing:** -0.025em at 48–56px, 0.200–0.300em on 10–12px all-caps labels, normal elsewhere

### ABCSynt — ABCSynt — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px, 16px, 18px
- **Line height:** 1, 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 0.2px |
| body | — | — | 16px | 1.63 | 0px |
| body-lg | — | — | 18px | 1.56 | 0px |
| subheading | — | — | 20px | 1.43 | 0px |
| heading-sm | — | — | 24px | 1.33 | 0px |
| heading | — | — | 36px | 1.2 | 0px |
| heading-lg | — | — | 48px | 1.11 | -0.025px |
| display | — | — | 56px | 1.08 | -0.025px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 24px

### Border Radius

- **nav:** 8px
- **cards:** 8px
- **badges:** 9999px
- **buttons:** 9999px

## Components

### Ghost CTA Button
**Role:** Primary action trigger — 'Launch App', hero call-to-action

Outlined pill button: 1px solid #353845 border, transparent fill, Frost White (#f1f5f9) text at 14px Inter weight 500, 9999px radius, 10px vertical / 20px horizontal padding. Includes a right arrow icon (›) in the same text color. No fill, no shadow — the button earns attention by being the only outlined element in a sea of flat content.

### Section Eyebrow Label
**Role:** All-caps section identifier — 'THE PROBLEM', 'THE SOLUTION', 'TIER 1: INSTANT TO DAILY'

10–12px Inter weight 500, Cloud Gray (#e5e7eb) or Slate Mist (#64748b), uppercase, letter-spacing 0.200–0.300em. Sits above section headlines as a tracked annotation mark. Functions like a chapter heading in a financial prospectus.

### Two-Tone Section Headline
**Role:** Primary section headings

Two-line headline: first line in Frost White (#f1f5f9) at 36–48px Inter weight 300, second line in Slate Mist (#64748b) at the same size and weight. The color split creates a built-in emphasis hierarchy without changing type weight. Negative letter-spacing (-0.025em) at 48px tightens the display.

### Tier Card
**Role:** Credit sleeve detail rows — 'BlackRock ICS USD Liquidity Fund'

Flat card on Deep Slate (#0a0e1a) background with 1px Cloud Gray (#e5e7eb) hairline border, 8px radius, 32px internal padding. Left column: title in Frost White weight 500, subtitle in Slate Mist at 12px. Right column: live status badge. No shadows, no elevation — the border IS the card.

### Live Status Badge
**Role:** Real-time indicator for active credit strategies

Pill badge, 9999px radius, transparent background with subtle border. Contains a 6px Signal Green (#34d399) filled dot and 'Live' text in Cloud Gray at 12px weight 500. The dot is the only element on the page allowed to be chromatically saturated and positive.

### Top Navigation Bar
**Role:** Persistent site navigation

Full-width bar on Abyss Ink background, transparent or 1px bottom border. Left: brand mark (amber dot + 'iUSPC' wordmark in Frost White). Center: nav links in Cloud Gray weight 500 at 14px. Right: utility icons (X, Discord, LinkedIn) in muted gray + Ghost CTA Button. Height ~64px, horizontal padding 24px.

### Two-Column Body Block
**Role:** Problem/solution narrative sections

Two-column layout with 32px gap. Left column: stacked label list separated by hairline Cloud Gray borders, each item in Slate Mist 16px. Right column: explanatory paragraph in Cloud Gray 16px with 1.63 line-height. Optional left vertical accent bar in Ember Glow (#fa3812) for emphasized callout paragraphs.

### Trust Bar (Footer Logo Strip)
**Role:** Backer/investor social proof

Centered 'BACKED BY' eyebrow label (10–12px, tracked uppercase, Cloud Gray) above a horizontal row of partner logos in muted gray monochrome. Logos sit at 40–60% opacity to prevent competing with primary content. No borders, no background — floats on the Abyss canvas.

### Hero Ambient Background
**Role:** Hero section atmosphere — the only area with visible decoration

Full-bleed Abyss Ink (#020617) canvas overlaid with a faint perspective grid in Cloud Gray at 4–8% opacity (converging toward a vanishing point near center-bottom). Bottom edge: conic gradient with Ember Glow (#fa3812) warmth bleeding from the bottom-right corner, creating a soft horizon-line glow. No images, no photos — pure atmosphere.

### Launch App Ghost Button (Hero)
**Role:** Hero call-to-action

Same Ghost CTA Button pattern but slightly larger: 16px text, 12px vertical / 28px horizontal padding, 9999px radius. Outlined with Steel Border (#353845), Frost White text. Centered in the hero below the sub-headline. The arrow icon shifts to Ember Glow on hover to telegraph the single point of interaction.

## Do's and Don'ts

### Do
- Use 9999px radius for all buttons, badges, and status pills — pill geometry is the control shape of this system
- Use Cloud Gray (#e5e7eb) for all hairline borders at 1px — the border IS the surface, no shadows needed
- Keep Inter at weight 300–400 for headlines; reserve weight 500–600 for nav, labels, and interactive text only
- Apply the two-tone headline pattern: Frost White first line + Slate Mist second line at the same size, never bold the difference
- Use letter-spacing 0.200–0.300em on all-caps eyebrow labels at 10–12px — this is how sections announce themselves
- Center content at 1200px max-width within full-bleed dark sections; let the Abyss canvas breathe around the content column
- Use Ember Glow (#fa3812) only for ambient warmth (gradients, glows, the Live aura) and the single live status dot — never as a filled button background

### Don't
- Don't add drop shadows to cards or panels — the system uses borders, not elevation, to define surfaces
- Don't introduce new chromatic colors; the palette is 97% neutral, and any new hue breaks the institutional register
- Don't use filled colored buttons — all primary actions are ghost/outlined with Steel Border
- Don't use bold (weight 700+) or extra-bold weights — Inter tops out at 600 and rarely uses it
- Don't apply the Ember accent to large fills, backgrounds, or button bodies — keep it as a low-opacity glow or micro-accent
- Don't use rounded card radii above 8px — large rounded cards feel consumer-app, not institutional
- Don't add photography or illustrations; the system communicates through type, negative space, and grid lines alone

## Elevation

- **Ember Glow Accent:** `0px 0px 8px 0px rgba(250, 56, 18, 0.15)`

## Surfaces

- **Abyss Canvas** (`#020617`) — Full-bleed page background, hero, section backgrounds
- **Deep Slate** (`#0a0e1a`) — Card surfaces, elevated panels, tier cards, subtle surface differentiation

## Imagery

The site carries no photography or illustration. Visual language is built from three elements: (1) a perspective grid drawn on the hero background in Cloud Gray at low opacity, creating a floor that recedes into darkness; (2) typography as the primary visual — large weight-300 Inter headlines that command the page; (3) a conic gradient warmth bleeding from the bottom-right of the hero in Ember Glow, acting as the only atmospheric color. Partner logos in the trust bar are rendered in monochrome gray at reduced opacity. The absence of imagery is itself the design language — it signals precision, seriousness, and the trading-floor sensibility where data and type are the only visuals that matter.

## Layout

Full-bleed dark sections stacked vertically with generous vertical breathing room (80px section gaps). Content is centered at 1200px max-width within each full-bleed band. The hero is a centered stack: eyebrow label, large two-tone headline, sub-headline, and a single ghost CTA, all centered over the perspective grid. Body sections alternate between two-column text blocks (left label list, right paragraph) and single-column centered narrative. Tier cards appear as bordered rows with title-left, badge-right. Navigation is a persistent top bar with brand left, nav center, utility icons + CTA right. The trust bar at the bottom is a centered eyebrow + horizontal logo row. There is no sidebar, no mega-menu, and no content-dense grid — the page flows as a series of spacious, dark, centered narrative blocks.

## Similar Brands

- **Goldfinch Finance** — Same dark-near-black canvas with institutional credit-product positioning and flat bordered cards on a single dark surface
- **Maple Finance** — Same monochromatic dark palette, weight-300 Inter headlines, and ghost button treatment for institutional DeFi credit
- **Centrifuge** — Same near-grayscale institutional fintech language with a single warm accent used sparingly for live/active states
- **Compound Labs** — Same flat dark surfaces, hairline-bordered card rows, and weight-300/400 type pairing with a single semantic green for live status
- **Ondo Finance** — Same institutional tokenized-finance visual register: dark canvas, tracked uppercase eyebrows, bordered tier rows, and ghost outlined actions
