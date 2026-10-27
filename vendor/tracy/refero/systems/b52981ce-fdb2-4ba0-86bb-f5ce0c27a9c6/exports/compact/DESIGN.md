# Arcadia — Style Reference
> forest observatory at dawn — deep evergreen authority on warm cream paper, one mint LED accent and pale violet data orbs suspended in soft morning light.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Arcadia is a clean-energy observatory rendered in warm light: an off-white cream canvas with deep forest-green authority, one electric-mint accent that switches actions on like an LED, and violet used sparingly for decorative data-orb highlights. The system feels measured and considered — DM Sans at restrained weights, generous 24-40px breathing room, and a 16px radius that rounds corners enough to feel modern but not playful. Hero sections dissolve into ultra-soft sage-to-cream gradients, and product surfaces are flat white with thin sage borders rather than shadowed cards. Decorative moments — floating orb networks, isometric energy illustrations, bar charts — carry the visual interest, while the interface itself stays quiet, editorial, and high-trust.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canopy | `#104336` | Primary brand — announcement bar, nav strip, primary CTA fill, section borders. The deep evergreen reads as institutional and environmental at once: it is the only saturated color the interface wears as a uniform, giving every page an authoritative dark-green header band |
| Mint Pulse | `#0fff87` | Accent / secondary action — vivid electric-mint button fill, eyebrow label text, decorative highlights. Against the forest-green chrome, mint reads as a switched-on LED; use it only where the UI needs to feel powered or selected |
| Orb Violet | `#7c18d3` | Decorative data accent — floating sphere fills, chart highlights, illustrated node markers. Violet is the only non-green chromatic and appears only on ornamental 3D orbs and chart accents, never on controls |
| Cream Paper | `#f3f1ec` | Canvas / soft surface — primary page background on hero and section bands. Slightly warm so the page never reads as sterile white |
| Sheet White | `#ffffff` | Card and elevated surface — product cards, dashboard mockups, nav bar. Stacked on Cream Paper to create a one-step surface lift without shadows |
| Bark | `#101f1e` | Body text and high-contrast headings — a near-black with the faintest green cast that ties the text to the brand forest |
| Ink | `#000000` | Maximum-contrast heading color — used for the largest display headlines where pure black is needed for presence |
| Slate | `#535e5d` | Secondary body text, muted labels, card sub-copy. Cool gray-green that sits one step down from Bark |
| Charcoal | `#333333` | Dark UI text, footer copy, dense secondary lines |
| Sage Mist | `#afc4bf` | Hairline borders and dividers — card outlines, rule lines, table separators. The desaturated sage reads as an extension of the brand greens without competing with them |
| Pale Sage | `#c2cec8` | Lighter border for inputs and subtle separators |
| Muted Slate | `#798281` | Tertiary text, helper copy, disabled link states |
| Hero Wash | `linear-gradient(212.12deg, #afc4bf 14.83%, #e8e7f5 52.99%, #f1eee9 79.47%)` | Mid-stop of hero gradient — pale lavender bridging sage to cream |

## Typography

### DM Sans — Sole brand typeface. Weight 300 carries display headlines (48-56px) — the light stroke weight is the signature restraint: headlines feel confident without shouting. Weight 400 holds all body and UI labels. Weight 500 is used for sub-headlines and stat values. Weight 700 is reserved for short uppercase eyebrow labels (e.g. 'HOW WE DELIVER RESULTS', 'ENTERPRISE SOLUTIONS') which get +0.07em tracking to function as section punctuation. The same family at all sizes keeps the typographic voice uniform across 10px micro-copy and 56px display.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 300, 400, 500, 700
- **Sizes:** 10, 13, 14, 15, 16, 18, 20, 24, 36, 48, 56
- **Line height:** 1.0–1.5
- **Letter spacing:** -0.02em at 48-56px display; 0.01em at 18-24px sub-headlines; 0.07em at 13-14px uppercase eyebrows
- **OpenType features:** `"ss01" on`

### Helvetica — Helvetica — detected in extracted data but not described by AI
- **Weights:** 400, 700
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | 0.07px |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.29 | — |
| heading-sm | — | — | 24px | 1.2 | 0.01px |
| heading | — | — | 36px | 1.15 | -0.02px |
| display | — | — | 56px | 1.1 | -0.02px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24-40px
- **Element gap:** 24px

### Border Radius

- **cards:** 16px
- **pills:** 9999px
- **inputs:** 4px
- **buttons:** 8px

## Components

### Announcement Bar
**Role:** Top-of-page system message

Full-bleed Canopy (#104336) band, 8-12px vertical padding, centered white DM Sans 13-14px weight 400, optional right-arrow link. Used for acquisitions, events, releases.

### Top Navigation
**Role:** Primary site nav

Sheet White background, 64-72px height, Arcadia wordmark left in Canopy (#104336), DM Sans 14-15px weight 400 nav items with caret dropdowns, Sign in as ghost button, Request demo as filled Canopy CTA (8px radius, 15-16px vertical / 24px horizontal padding, white text). Sticky on scroll.

### Primary CTA Button
**Role:** Filled action

Canopy (#104336) background, white text, DM Sans 14-15px weight 500, 8px radius, 15-16px vertical and 24px horizontal padding. Single solid block — no gradient, no shadow.

### Mint Accent Button
**Role:** High-attention action

Mint Pulse (#0fff87) background, Bark (#101f1e) text, 8px radius, same padding as primary. Reserved for the single most important action on a hero or in a featured card.

### Ghost / Outlined Button
**Role:** Secondary action

Transparent background, 1px Canopy or Sheet White border, brand-color text, 8px radius, same padding as primary. Used for Sign in, secondary nav, cancel actions.

### Eyebrow Label
**Role:** Section super-heading

DM Sans 13px weight 700, 0.07em letter-spacing, uppercase. Color is either Canopy, Mint Pulse, or Orb Violet depending on section. Functions as a 1-word or 3-word punctuation above each major heading.

### Hero Section
**Role:** Top-of-page brand statement

Cream Paper base washed with the diagonal sage→lavender→cream gradient (212deg, #afc4bf → #e8e7f5 → #f1eee9). Centered headline at 48-56px weight 300 letter-spacing -0.02em in Ink, supporting copy at 16-18px weight 400 in Slate, optional CTA below.

### Product Dashboard Card
**Role:** Embedded UI mockup

Sheet White, 16px radius, 1px Sage Mist border (no shadow). Contains a left vertical icon rail in Canopy and a content area with stat tiles using 36px weight 500 numerics. Internal padding 24-40px.

### Stat Tile
**Role:** Key-metric display

Sheet White card with 8-16px radius, sage-green leaf or icon accent at 20-24px, label in 13px uppercase 0.07em tracking, primary value at 24-36px weight 500 in Bark, delta in 13-14px weight 500 with up/down arrow. 24px internal padding.

### Logo Strip
**Role:** Social proof row

Single row of 6-8 monochrome dark partner logos evenly distributed with 40-80px column gap, no captions, no card chrome. Logos rendered in Bark (#101f1e).

### Network Diagram
**Role:** Decorative data-viz section

Light cream background with thin dotted line connections between 3D orb nodes. Orb fills mix Orb Violet, Mint Pulse, and pale lavender. Each orb is paired with a small uppercase label tag (DM Sans 13px weight 700 0.07em) on a white pill. No borders or cards — the diagram floats in open space.

### Isometric Feature Section
**Role:** 3D illustration showcase

Mint-tinted green gradient background (#e8f0ec to #f1eee9). Isometric 3D renders of wind turbines, power lines, and trees sit on white platform blocks with Canopy labels. No card borders — the illustration is the chrome.

### Bar / Column Chart Card
**Role:** Data visualization container

Sheet White, 16px radius, 1px Sage Mist border. Bars use Canopy, Mint Pulse, Orb Violet, and Slate at 8-12px width with 4-8px gap. Axis labels 13px Slate, legend 13px uppercase.

### Footer
**Role:** Site footer

Canopy (#104336) background, white DM Sans 13-15px text, multi-column link lists, Arcadia wordmark in white, social icons in white outline. 80-120px vertical padding.

## Do's and Don'ts

### Do
- Use Canopy (#104336) for all primary CTA fills and the announcement bar — it is the brand's structural color.
- Reserve Mint Pulse (#0fff87) for a single most-important action per screen; never scatter it across multiple buttons.
- Set display headlines at 48-56px DM Sans weight 300 with -0.02em letter-spacing in Ink (#000000).
- Use uppercase 13px DM Sans weight 700 with 0.07em tracking for eyebrow labels in Mint Pulse, Canopy, or Orb Violet.
- Separate cards from the Cream Paper canvas with a 1px Sage Mist (#afc4bf) border, not a drop shadow.
- Maintain 80-120px vertical gap between major sections; let screens breathe.
- Center hero text stacks at max-width 1200px and keep CTAs directly under the supporting copy.

### Don't
- Don't use drop shadows on cards or buttons — the system relies on color-step and hairline borders, not elevation shadows.
- Don't introduce new saturated colors; the chromatic palette is exactly Canopy, Mint Pulse, and Orb Violet.
- Don't use weight 700 for body or long-form copy — reserve 700 for short uppercase eyebrows only.
- Don't apply Mint Pulse to a full-width background or large surface; it is a small-attention accent, not a canvas color.
- Don't place text directly on the hero gradient without testing contrast — pair the gradient with centered black or Bark text on its lightest stop.
- Don't use border-radius larger than 16px on standard cards; the soft-but-not-rounded feel depends on this restraint.
- Don't add photography to sections that already have 3D illustrations or diagrammatic content — mixing styles breaks the editorial mood.

## Elevation

Elevation is achieved by surface color step and 1px sage borders rather than drop shadows. Cards never cast shadow; they sit on the cream canvas and are separated by hairline Sage Mist rules. This keeps the system flat, editorial, and print-like — closer to a sustainability report than a typical SaaS dashboard.

## Surfaces

- **Cream Paper** (`#f3f1ec`) — Primary page canvas — hero and section bands
- **Sheet White** (`#ffffff`) — Cards, dashboards, nav bar — one-step lift without shadow
- **Sage Tint** (`#e8e7f5`) — Gradient mid-stop and section wash

## Imagery

Imagery is sparingly used and highly stylized. The hero relies on a subtle diagonal gradient rather than photography. Two featured sections use 3D isometric illustrations (energy infrastructure on a mint-green platform) and floating 3D orb networks connected by thin dotted lines — both brand-colored rather than photographic. Partner logos are monochrome Bark wordmarks on white. Product surfaces appear as flat UI mockups (dashboard cards, stat tiles, bar charts) rather than screenshots. Photography is absent from the above-the-fold flow; the visual language is diagrammatic and illustrative, with violet orb accents providing the only saturated punctuation.

## Layout

Page is max-width 1200px centered, but hero and announcement bar run full-bleed. Hero is a centered text stack (headline, sub-copy, CTA) on a soft diagonal gradient, followed by a product dashboard mockup centered at roughly 80% page width. Sections alternate between Cream Paper and Sheet White bands with 80-120px vertical gap. The 'How we deliver results' section uses centered headline + a wide network diagram floating in open space with no container. The isometric feature section is a 2-column split: 3D illustration left, text block right. Logo strip and CTA blocks are full-bleed centered. Navigation is a single sticky top bar with no sidebar. Overall density is comfortable — one focused idea per screen, generous vertical breathing, no masonry or card-grid overload.

## Similar Brands

- **Watershed** — Same sustainability-report aesthetic — cream paper canvas, forest-green chrome, monochrome dashboard cards with hairline sage borders and almost no shadows.
- **Patch** — Same energy/climate domain language with a deep brand-green primary, soft gradient hero washes, and generous editorial spacing.
- **Stripe** — Same restrained 16/8px radius discipline and clean white-product-surface treatment, though Arcadia swaps Stripe's purple for forest green.
- **Notion** — Same generous vertical rhythm, centered text-stack heroes, and eyebrow-label punctuation above section headings.
- **Lime** — Same use of a single vivid electric accent (lime green) against a deep brand color to make CTAs feel switched on.
