# 2.AG — Style Reference
> Clinical apothecary under teal light — a measured, prescriptive wellness brand that treats the product shot like a specimen slide.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

2.AG reads as a clinical apothecary crossed with a modern science brand: near-white canvas, deep teal structural surfaces, and one vivid mint accent that activates CTAs and data highlights. Inter Tight is tightened for a pharmaceutical voice — slightly negative tracking on display sizes, generous tracking on small caps for ingredient lists and badges. Components lean into large pill radii (30–50px) for buttons and soft 12–20px corners on cards, signaling a brand that is precise about dosage but warm on the body. Dark teal sections (Rapid Relief Cream header, stat blocks) ground the page in clinical authority, while bright green punctuation provides energetic, almost pharmacy-shelf accent. Layout is split, generous, and product-forward: hero pairs a dark editorial half with a bright product half, sections alternate white and teal, and reviews/stats form dense but airy card grids.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Teal | `#244d54` | Primary structural color — dark hero background, stat block surfaces, icon strokes, navigation wordmark, secondary button borders. A near-gray teal that reads as ink rather than ocean, so it grounds the brand without going clinical-cold |
| Mint Pulse | `#2ecea0` | Primary action color — filled CTA backgrounds, badge fills, active dots, announcement bar, review star highlights. Bright green with cyan lean, makes every interactive element feel switched on and biological |
| Soft Teal | `#6dddbd` | Teal text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Carbon | `#000000` | Body text, hairline borders, icon strokes, input borders. The dominant structural neutral — most borders on the site are pure black, giving the UI a stark, editorial frame |
| Ink | `#151515` | Primary heading text and secondary borders. Softer than pure black for large headlines where Carbon reads as too heavy |
| Graphite | `#4d4d4d` | Subhead text, button text on light surfaces, muted labels |
| Slate | `#858585` | Muted body text, helper copy, disabled labels, secondary icon strokes. The workhorse neutral for anything that needs to recede |
| Fog | `#999999` | Input borders, placeholder color, low-priority surface accents |
| Mist | `#e5e7eb` | Card and section dividers, subtle borders on white surfaces, separators between review cards |
| Bone | `#f0f1f2` | Lightest card and list surface — sits one step above pure white for subtle elevation on the page canvas |
| Paper | `#ffffff` | Page canvas, card surfaces, button text, input fills. The dominant light surface |

## Typography

### Inter Tight — Primary brand typeface across headings, body, buttons, badges, and UI. The custom tighter cut tightens headline rhythm and gives small caps a pharmaceutical, prescription-label feel.
- **Substitute:** Inter (variable), Manrope
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 12px, 13px, 14px, 15px, 16px, 18px, 20px, 24px, 30px, 36px, 45px, 62px
- **Line height:** 1.00–1.86 (tight 1.0 for caps, 1.21–1.25 for display, 1.5 for body, 1.86 for loose metadata)
- **Letter spacing:** -0.042em at display sizes, 0.005em default, 0.02–0.03em on body, 0.09–0.10em on small uppercase labels
- **OpenType features:** `"kern"`

### Inter — Secondary face used for stat block numerals and a few large product display sizes. Inter handles the very large gradient stats with clean digits that gradient-fill cleanly.
- **Substitute:** Inter Tight, system-ui
- **Weights:** 400, 500
- **Sizes:** 16px, 18px, 28px, 48px
- **Line height:** 1.10, 1.20
- **Letter spacing:** -0.042em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.86 | 1px |
| body | — | — | 16px | 1.5 | 0.08px |
| subheading | — | — | 20px | 1.4 | 0.4px |
| heading-sm | — | — | 30px | 1.3 | 0.6px |
| heading | — | — | 36px | 1.25 | 0.72px |
| heading-lg | — | — | 45px | 1.21 | 0.9px |
| stat-numeral | — | — | 48px | 1.1 | -2px |
| display | — | — | 62px | 1 | 1.24px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 12-20px
- **badges:** 50px (pill)
- **inputs:** 5px
- **buttons:** 30-50px (pill)
- **hero-cta:** 250px

## Components

### Announcement Bar
**Role:** Top-of-page promo strip

Full-width band in #2ecea0 mint with 12–14px white Inter Tight text, often a truck icon + shipping promise. Height ~40px, single line, no border, sits flush above the nav.

### Top Navigation
**Role:** Primary site header

White bar, ~64px tall, with black 2.AG wordmark left, 3–5 text links (Shop, Science, Contact) in 16px Inter Tight 500 with 15–30px horizontal padding, search icon and bag icon (with 8px black dot showing item count) right-aligned. No drop shadow, hairline #e5e7eb bottom border.

### Hero Panel — Dark Half
**Role:** Left-side editorial hero

Full-height #244d54 background with 3D wireframe human figure showing glowing joints. Headline in Inter Tight 62px / 500, white, letter-spacing ~1.2px, left-aligned at 50–60% width. Pill CTA below in transparent fill with 1px #2ecea0 mint border, white text, 50px radius, 14px 48px padding.

### Hero Panel — Product Half
**Role:** Right-side product hero

Light gray/white background with circular bubble/bokeh photography behind a product tube. Product image ~60% of panel width, centered. No text overlay.

### Pill CTA — Outlined Mint
**Role:** Primary action button on dark surfaces

Transparent background, 1px #2ecea0 border, white text 16px Inter Tight 500, 50px border-radius, 14px 48px padding. Used for the hero 'Get Relief' call. Tracking is tight — almost no letter-spacing.

### Pill CTA — Filled Mint
**Role:** Primary action on light surfaces

Solid #2ecea0 background, white text, 30–50px radius, 12–16px vertical and 24–48px horizontal padding. Used for 'Add to bag' and review prompt CTAs.

### Pill Badge — Mint
**Role:** Dosage and feature tags

30–50px radius, 8px 16px padding, #2ecea0 fill, white 12–14px Inter Tight 600 text. Used for '10,000 MG', '1000 MG', and active filter chips.

### Product Card
**Role:** PDP product image and box presentation

White #f0f1f2 background panel, 20px border-radius, 20–24px internal padding, 1px #e5e7eb hairline border. Holds the cream tube + outer box on a light stage. No shadow — relies on border for edge.

### Ingredient Feature Row
**Role:** Highlighted property list inside PDP

Stacked rows with ~56px height each, separated by 1px #e5e7eb hairline. Large 18–20px Inter Tight 500 in Deep Teal #244d54 for the value ('2 cannabinoids', '5 key ingredients'), 12–13px muted text in #858585 for the descriptor below.

### Review Card
**Role:** Customer testimonial tile

White card on #f0f1f2 background, 12–20px radius, 1px #e5e7eb border, 20–24px padding. 5 mint stars top, 18–20px quote in Inter Tight 500 Ink #151515, reviewer name in 12–13px Slate #858585 with a small mint checkmark for verified buyers.

### Video Review Card
**Role:** Playable customer testimonial

Same dimensions and styling as Review Card but holds a 9:16 vertical video poster with a centered white circular play button outlined in 1px mint. Replaces quote text with thumbnail.

### Stat Block
**Role:** Large numerical proof point

Deep Teal #244d54 background, 20px radius, 40–60px padding. Headline numeral 48–62px in a vertical gradient from Soft Teal #6dddbd to Mint #2ecea0, applied as a CSS background-clip text fill. Percent sign 24–30px in white, sitting at top-right of the numeral.

### Input Field
**Role:** Form input

White fill, 1px #999999 border, 5px radius, 12–16px padding, 14–16px Inter Tight 400 text in Carbon #000000. Placeholder in #999999. No visible focus ring in extracted data — relies on border thickening or state change.

### Review Marquee Row
**Role:** Auto-scrolling verified review strip

Single horizontal row at the top of the reviews section, 5-star header left-aligned, then inline reviewer quotes in Inter Tight 14–15px, 500, Carbon — separated by bullets, all caps spaced ~0.05em.

### Nav Text Link
**Role:** Top-level navigation item

16px Inter Tight 500 Carbon #000000, no underline, 15–30px horizontal padding, 7px vertical padding. Active state would shift to Deep Teal #244d54.

## Do's and Don'ts

### Do
- Use Inter Tight at weight 500 for all headlines and CTAs; reserve weight 600 for badges and active filter chips
- Apply the Mint #2ecea0 only for filled actions, active dots, and dosage badges — never as body text on white
- Use Deep Teal #244d54 as the background for any section that introduces a proof point, statistic, or scientific claim
- Set all primary action buttons to pill radii between 30px and 50px — the roundness signals the body-care category
- Apply letter-spacing of 0.09–0.10em on all uppercase labels and ingredient callouts at 10–12px to get the prescription-label rhythm
- Use the #6dddbd-to-#2ecea0 vertical gradient via background-clip text only on large stat numerals (48px+); never on body copy
- Keep section backgrounds alternating between Paper #ffffff and Deep Teal #244d54 to maintain the clinical, rhythmic page scan

### Don't
- Do not introduce new chromatic colors — the system is deliberately two-tone (Deep Teal + Mint) on a neutral scale
- Do not use sharp 0–4px radii on buttons or badges; the brand's softness is carried by pill shapes
- Do not place Mint text on white at body sizes below 16px — the contrast drops below accessible thresholds
- Do not use heavy box shadows for elevation; the design system relies on hairline #e5e7eb or #000000 borders and surface color shifts
- Do not mix Inter and Inter Tight within the same line of text — pick one face per content block
- Do not use letter-spacing tighter than -0.05em at sizes below 24px — the small-size tight tracking will collide glyphs
- Do not add decoration outside the existing palette (no purples, reds, or warm neutrals); the cold teal system is the brand

## Elevation

The design system deliberately avoids box shadows. All depth is communicated through hairline 1px borders (#e5e7eb on white surfaces, #000000 on neutral fills) and tonal surface steps from Paper #ffffff to Bone #f0f1f2 to Deep Teal #244d54. This is a clinical, flat aesthetic — the product does the heavy lifting, the chrome stays out of the way.

## Surfaces

- **Page Canvas** (`#ffffff`) — Default body background and main content area
- **Soft Card** (`#f0f1f2`) — Subtle elevation for review list rows and secondary card groups
- **Structural Dark** (`#244d54`) — Hero left panel, stat blocks, deep editorial sections
- **Highlight Wash** (`#2ecea0`) — Announcement bar and pill badge fills for active emphasis

## Imagery

Imagery is sparse and product-led. Hero combines a 3D wireframe human figure with glowing pain-point nodes (deep teal stage, mint glow accents) against a product photograph with bubble/serum bokeh on white. PDP uses clean product-on-white photography of the cream tube and outer carton with no lifestyle context. No human lifestyle photography appears; the science diagram and the object shot are the only visual languages. Icon style is thin-line 1px stroke monochrome, mostly white on teal or black on white. Decorative star fields in the stat blocks carry no extra imagery — the large gradient numerals do the visual work.

## Layout

Max-width 1280px centered container, with full-bleed dark/light split hero as the only section that breaks out. Hero is a 50/50 split: dark teal editorial panel left, bright product panel right. Subsequent sections alternate Paper #ffffff and Deep Teal #244d54 in horizontal bands. Content blocks use 2-column asymmetric (image left, copy right) for product, and 4–5 column card grids for reviews, with one slot swapped for a vertical video card. Stats section is a 3-column grid of large gradient numerals on deep teal. Vertical rhythm is generous — ~64px between major sections, ~24px within cards. No sidebar; navigation is a single top bar. Bottom review marquee scrolls horizontally above the card grid.

## Similar Brands

- **Athletic Greens / AG1** — Same clinical wellness language: white canvas, deep teal-green structural surfaces, bright green CTA, pill-shaped buttons, and ingredient-badge hierarchy
- **Hilma** — Pharmaceutical-adjacent branding with uppercase tracked labels, deep teal accents, and split editorial hero
- **Care/of** — Direct-to-consumer wellness with clean sans-serif, soft card surfaces, and a single bright accent for dosage and CTA
- **Cuup** — Minimalist product-led hero with oversized pill CTA, editorial split panels, and editorial uppercase tracked labels
- **Recess** — Modern apothecary feel with deep cool brand color, generous white space, and small uppercase tracked metadata
