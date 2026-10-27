# Stocketa — Style Reference
> Neon aurora on frosted glass — a light, weightless interface floating beneath a prism-washed sky.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Stocketa floats its product on a dreamy light canvas washed with a soft radial aurora — green, teal, purple, and pink bleeding from the top — where the color is felt as atmosphere rather than seen as decoration. The interface below stays calm and almost achromatic: white cards, hairline borders, and a signature three-layer shadow (a faint blue-tinted outer drop, a 1px white inner highlight, and a barely-there navy inset) that whispers elevation instead of declaring it. A single vivid magenta (#995bb9) does all the emotional work — painting headlines as a left-to-right gradient, filling icons, and pulling the eye through each section. Typography is a custom geometric sans (averta standard) cut for very tight negative tracking at display sizes up to 98px, giving even the biggest headlines a compressed, confident posture. The phone mockup is the hero: it sits at the visual center of every section, turning the product itself into the brand's primary visual asset.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aurora Magenta | `#995bb9` | Headline gradient start, icon fills, decorative brand strokes — the single chromatic voice of the system, used as gradient text on display headings and as fill on small icon badges |
| Deep Iris | `#5b638c` | Muted violet used for decorative SVG strokes and secondary graphic outlines — sits behind the magenta as the system-wide line color |
| Midnight Ink | `#1d2630` | Primary body and heading text on light surfaces — slightly warmer than pure black, reads softer at large sizes while keeping AAA contrast |
| Obsidian | `#000000` | Highest-weight text and the densest border color — used where maximum contrast is required against the near-white canvas |
| Lavender Mist | `#e0dde2` | Page canvas and subtle surface tint — the entire site reads on this near-white, giving the aurora gradient something warm to land on |
| Paper White | `#ffffff` | Card and elevated surface fill — floats above Lavender Mist as the base for product cards, phone screen, and feature panels |
| Frost Shadow | `#f0f0f0` | Shadow tone used in the multi-layer card elevation — too light to be a border, present only as the ambient outer blur |
| Pebble | `#9aa1b2` | Mid-neutral for muted body text and link borders — the default text color for descriptions and the border for inline link affordances |
| Silver Lining | `#a5afcb` | Light hairline border and secondary muted text — used on card edges and quiet metadata rows |
| Cloud Veil | `#abbdcf` | Softest neutral for decorative SVG fills and ambient accents — supports the aurora without competing with the magenta |
| Tidewater Navy | `#3a4766` | Violet accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Aurora Green | `radial-gradient(140% 119% at 50% 0%, rgba(105, 201, 102, 0.4) 14%, rgba(39, 187, 219, 0.33) 36%, rgba(139, 71, 206, 0.2) 52%, rgba(218, 64, 134, 0.1) 70%, rgba(255, 149, 116, 0) 82%, rgba(0, 0, 0, 0) 100%)` | Gradient stop in the page-level aurora and accent on positive chart lines inside the phone mockup |

## Typography

### averta standard — Sole typeface across the system. Custom geometric sans with humanist warmth — the slightly rounded terminals soften what would otherwise be a cold fintech voice.
- **Substitute:** Inter, General Sans, or DM Sans
- **Weights:** 400, 500, 600, 700, 800
- **Sizes:** 14px, 15px, 16px, 17px, 19px, 27px, 28px, 50px, 53px, 62px, 98px
- **Line height:** 1.0–1.4 (tighter as size increases)
- **Letter spacing:** Tightens with size: -0.018em at 14px, -0.016em at 15px, -0.011em at 16px, -0.006em at 17px, -0.003em at 19px
- **OpenType features:** `tnum on for numeric tables and price displays`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.4 | -0.25px |
| heading-sm | — | — | 19px | 1.25 | -0.06px |
| heading | — | — | 27px | 1.2 | -0.49px |
| heading-lg | — | — | 53px | 1.15 | -0.95px |
| display | — | — | 98px | 1 | -1.76px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 18px
- **buttons:** 100px
- **asymmetric:** 34px
- **decorative:** 22px

## Components

### Aurora Hero Background
**Role:** Page-level atmospheric wash

Radial gradient (140% 119% at 50% 0%) flowing from translucent green (rgba(105,201,102,0.4)) through teal and violet to transparent pink, fading to zero at the bottom. Sits behind all page content and is the only background treatment allowed at the section level.

### Gradient Text Headline
**Role:** Hero and section H1

Display text at 50–98px, weight 700, filled with a linear gradient left-to-right from Aurora Magenta (#995bb9) through Deep Iris to Tidewater Navy. Tracking is extremely tight (-0.95 to -1.76px). Always left-aligned, never centered.

### Filled Primary Button
**Role:** Single primary action per screen

Pill shape at 100px radius, background Tidewater Navy (#3a4766) with Paper White text, weight 600, 15–16px, padding 14px 30px. No drop shadow — the dark fill against Lavender Mist is the elevation.

### Outlined Ghost Button
**Role:** Secondary action

Pill shape at 100px radius, 1px border in Pebble (#9aa1b2) or Tidewater Navy, transparent fill, Midnight Ink text, weight 500, 15–16px, padding 14px 30px. Sits to the right of the primary with 16px gap.

### Feature List Item
**Role:** Vertical feature list (Transaction details, Widgets, etc.)

Horizontal row with a 24–28px icon in a soft tinted square (Silver Lining fill, Aurora Magenta icon at 60% opacity), bold heading at 17px weight 600 in Midnight Ink, and description at 15px weight 400 in Pebble. 40px vertical gap between items.

### Floating Stock Ticker Card
**Role:** Decorative product proof

White card at 22px radius, ~16px padding, soft three-layer shadow, containing a 3-letter ticker label and a 1-stroke sparkline chart. Two size variants: small (TSLA/SQ at ~60px wide) and large (AAPL at ~100px wide). Scattered around the phone mockup at 15–20° rotations.

### Phone Mockup Frame
**Role:** Product hero element

iPhone-shaped frame at 300×620px with a subtle 1px Cloud Veil border and the three-layer shadow stack. Rounded to 44px to mimic device corners. Contains the in-app holdings screen. Anchored to the right column on desktop, full-bleed centered on mobile.

### App Holdings Card
**Role:** In-app content card (white surface inside phone mockup)

White card, 18px radius, 16px padding, hairline Silver Lining bottom border. Contains ticker symbol (17px weight 700), company name (14px weight 400 in Pebble), current price (right-aligned, 17px weight 600), daily change in small Aurora Green or warm red text, and a 60px-tall sparkline chart.

### In-App Time Tab Bar
**Role:** Chart period selector

Horizontal row of time period chips (1D, 1M, 6M, 1Y, 5Y) at 14px weight 500. Active tab gets an Aurora Magenta fill at 10% opacity with Aurora Magenta text; inactive tabs are Pebble. Chips are pill-shaped at 100px radius, 4px 12px padding.

### Holdings Summary Header
**Role:** In-app portfolio total

Top of the holdings list inside the phone. 'Holdings' label at 15px weight 500 in Pebble, total value at 27px weight 700 in Midnight Ink, and a 'Daily change' delta line in small Aurora Green text. Bottom hairline border in Silver Lining.

### Gradient Brand Icon
**Role:** App icon and small logo mark

Rounded square (8px radius) filled with the same left-to-right magenta-to-navy linear gradient as the headline text. Contains a white chart-stroke glyph. Used as the app icon next to the wordmark and as small decorative marks.

### Section Container
**Role:** Wrapping container for each content band

Max-width 1200px centered, 80px vertical padding top and bottom. No visible border. Background is always the canvas color — sections are separated by space, not lines or alternating fills.

## Do's and Don'ts

### Do
- Use the aurora radial gradient as the only page-level background — never overlay it with a solid color or another gradient
- Apply the magenta-to-navy linear gradient only to display headlines (50px+) and the brand icon — never to body text or UI controls
- Use 100px pill radius for every button and chip — no exceptions for size, even on small icon buttons
- Keep the three-layer shadow stack (blue-tinted drop, white inner highlight, 1px navy inset) reserved for floating elements — never apply it to inline cards or list rows
- Set the type scale to negative tracking as sizes grow: -0.25px at caption, tightening to -1.76px at display — this compression is the system's voice
- Anchor the phone mockup to the right column on every section that features it — never let it drift center or stack below the headline on desktop
- Use Tidewater Navy (#3a4766) for the single filled primary button per screen, and pair it with an outlined ghost button using a Pebble or Navy border

### Don't
- Don't introduce green or red as semantic UI colors — they only appear inside the phone mockup's chart strokes and must not bleed into badges, alerts, or form states
- Don't use solid #ffffff as the page background — always use Lavender Mist (#e0dde2) so the aurora has warmth to land on
- Don't add visible card borders on white surfaces — rely on the shadow stack and the Lavender Mist canvas for separation
- Don't use corners sharper than 18px on product cards or 22px on decorative elements — the system requires consistent softness
- Don't set type below 14px or above 98px — the scale is intentionally narrow
- Don't apply the Aurora Magenta as a flat fill on large areas — it must always be expressed as a gradient or as a small icon/heading accent
- Don't center the hero headline — the magenta gradient text is left-aligned by design, anchored to the same gridline as the body copy below it

## Elevation

- **Floating card (stock ticker, phone mockup):** `0px 4px 15px 0px rgba(97, 110, 124, 0.114), inset 0px 1px 1px 0px rgba(255, 255, 255, 0.39), 0px 1px 1px 0px rgba(34, 50, 94, 0.08)`

## Surfaces

- **Canvas** (`#e0dde2`) — Page background, washed with the aurora radial gradient near the top
- **Card** (`#ffffff`) — Feature panels, in-phone UI, and product screenshots
- **Elevated** (`#ffffff`) — Floating stock ticker cards and phone mockup, lifted with the three-layer shadow stack

## Imagery

The site is overwhelmingly text-and-UI driven. The only recurring visual asset is the iPhone mockup of the app itself, which functions as both product proof and decorative centerpiece — it appears at full opacity in the right column and is reinforced by three floating stock ticker cards (TSLA, AAPL, SQ) scattered around it with 1-stroke sparkline charts. No photography, no illustrations, no abstract graphics beyond the aurora gradient and the magenta-to-navy linear gradient. Icons are uniformly small (24–28px), single-color, and filled with Aurora Magenta at full or 60% opacity — no outline icons, no multicolor glyphs.

## Layout

Two-column desktop layout, max-width 1200px centered. Left column (roughly 45%) holds all text content: the gradient headline, supporting paragraph, button row, and the full feature list. Right column (roughly 45%) is anchored by the phone mockup, which stays pinned to the same vertical position across every section. Hero is NOT full-bleed — it inherits the aurora-washed canvas and uses a 1200px container. Sections stack vertically with 80px gaps, no alternating dark/light bands, no dividers. The feature list is a single vertical column of rows (icon + heading + description) with 40px between items. Navigation is minimal — just the wordmark and small CTA in the top-left, no mega-menu, no sticky header. The right column has a slight staggered effect: the phone mockup is static while the floating ticker cards are positioned at irregular offsets to create visual rhythm.

## Similar Brands

- **Robinhood** — Same clean white card surfaces, same pill-shaped CTA buttons, and the same habit of letting the app UI do the visual heavy lifting while the marketing page stays almost monochrome
- **Linear** — Same tight negative tracking on large display type, same restraint with color (a single accent against near-white), and the same neumorphic-feeling soft shadows on floating panels
- **Acorns** — Same product-as-hero layout with a phone mockup anchored in the right column, same friendly geometric sans-serif voice, and the same aurora-like background washes on a light canvas
- **Mercury** — Same Tidewater-leaning navy as the primary action color, same hairline borders over soft shadows, and the same willingness to let a single gradient headline do the emotional work of the whole page
