# Lattice — Style Reference
> Botanical field journal on warm parchment — a quiet cream canvas where dark forest ink does the speaking and pastel specimen cards provide the color.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lattice reads like a botanical field journal rendered in product form: a warm parchment canvas (#f7f6f2) carries the entire site, with a single near-black forest ink (#001f1f) doing the heavy lifting as both primary text and primary action surface. The signature is a system of pastel-tinted feature cards — mint, lime, lavender, buttercream — each color-coding a product module like a specimen tray, paired with dark filled and outlined buttons in the same forest green. Typography is a single geometric sans (Matter) at compact sizes, with tight tracking on large display copy and wide tracking on small uppercase labels. Everything sits on generous rounded corners (14–29px), soft 1px-tinted shadows, and zero decorative noise — color appears as functional punctuation, not ornament.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#f7f6f2` | Page background — the warm off-white canvas that gives the entire system its paper-like, non-clinical feel. Never use pure white for the body background |
| Paper White | `#ffffff` | Card surfaces, product UI mockups, and embedded media containers — pure white lifted above the parchment canvas to create subtle elevation without shadows |
| Forest Ink | `#001f1f` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Lichen Gray | `#5c7070` | Secondary text and medium-emphasis borders. Sits between Forest Ink and the lighter grays — use for body descriptions, supporting copy, and subtle dividers |
| Stone | `#6a7878` | Muted body text, nav borders, and tertiary UI elements. The readable-but-quiet gray for descriptions and helper text |
| Slate | `#455252` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Mist | `#889494` | Lightest text tier — captions, metadata, tertiary labels. Use for timestamps, footnotes, and non-essential annotations |
| Meadow | `#cdface` | Pill badge fills, success highlights, and light accent surfaces. The signature light green for category tags, status indicators, and soft highlight washes |
| Deep Forest | `#2a4e1c` | Dark green accent for data visualization, illustration strokes, and secondary green elements. Distinct from Forest Ink in that it reads clearly as green, not near-black |
| Deep Teal | `#003d3d` | Secondary brand accent — teal-toned borders, illustration fills, and data visualization. Used alongside Deep Forest for multi-color charts and decorative elements |
| Olive | `#515c0b` | Chart and illustration accent — the yellow-green in the multi-color palette system. Used in data bars, category indicators, and decorative strokes |
| Plum | `#7a2251` | Magenta-pink accent for data visualization and illustration. The warm-cool counterpoint in the multi-color palette system |
| Saffron | `#a36a14` | Amber-gold accent for data visualization and illustration. The warm yellow in the multi-color palette system, used in charts and decorative strokes |
| Iris | `#652ea3` | Violet accent for data visualization, illustration strokes, and the integrations section gradient. The cool counterpoint in the multi-color palette |
| Mint Surface | `#e4f7f9` | Pastel feature card background — the pale aqua tint assigned to product modules like Performance. Each product area gets its own pastel home |
| Lime Surface | `#f8fbe7` | Pastel feature card background — the pale yellow-green tint for modules like Goals & OKRs. The warmest pastel in the system |
| Lavender Surface | `#e1e1fa` | Pastel card background — pale violet for testimonial cards, secondary feature blocks, and the cool side of the pastel system |
| Blush Surface | `#fcf2fe` | Pastel card background — near-white pink for subtle surface differentiation. The quietest of the pastel tints |
| Buttercream | `#fff3c2` | Warm pastel accent surface — soft yellow for tag backgrounds and light highlight zones |
| Sage Glow | `#eff5ce` | Green pastel accent for tag backgrounds and soft category highlights. A more saturated green than Lime Surface |
| Petal | `#fde5ff` | Pink pastel accent for tag backgrounds and soft category highlights |
| Lilac Stroke | `#dcc2eb` | Muted violet for illustration strokes and decorative outlines |
| Halo Gradient | `radial-gradient(circle, rgb(191, 241, 245) 32%, rgb(169, 235, 169) 64%, rgb(103, 226, 235))` | Hero radial gradient — the lime-to-teal aurora behind the product device frame. Evokes a natural, organic light source rather than a tech glow |

## Typography

### Matter — Sole typeface across the entire system — nav, body, buttons, headings, and display. A geometric sans with humanist warmth that keeps the warm-parchment aesthetic feeling organic rather than clinical. Weight 500 for headings and buttons, weight 400 for body and supporting text. Tight tracking (-0.024em) on display sizes creates a compact, confident headline; wide tracking (0.08em) on 11px labels gives uppercase tags breathing room.
- **Substitute:** Inter, DM Sans, or Switzer
- **Weights:** 400, 500
- **Sizes:** 11, 13, 14, 16, 17, 18, 19, 22, 47, 72
- **Line height:** 0.90, 1.00, 1.10, 1.20, 1.30
- **Letter spacing:** -0.024em on display/headings (47–72px), 0.08em on 11px uppercase labels, normal at body sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.3 | 0.88px |
| body-sm | — | — | 14px | 1.3 | — |
| body | — | — | 16px | 1.3 | — |
| subheading | — | — | 19px | 1.2 | — |
| heading-sm | — | — | 22px | 1.2 | — |
| heading | — | — | 47px | 1 | -1.13px |
| display | — | — | 72px | 0.9 | -1.73px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 72px
- **Card padding:** 28px
- **Element gap:** 8-12px

### Border Radius

- **cards:** 14px
- **badges:** 22px
- **inputs:** 12px
- **buttons:** 29px
- **feature-cards:** 14-43px
- **small-elements:** 7px

## Components

### Filled Primary Button
**Role:** Main call-to-action — the highest-emphasis interactive element

Filled Forest Ink (#001f1f) background with white text. 29px border-radius (pill-like but slightly softened). 13px vertical / 11-18px horizontal padding. Matter 500 at 14-16px. Letter-spacing normal. This is the dark anchor that makes the warm cream canvas feel intentional.

### Outlined Secondary Button
**Role:** Companion to the primary CTA — same hierarchy weight, different surface treatment

Transparent background with 1.5px Forest Ink (#001f1f) border. Forest Ink text. 29px border-radius. Same padding as filled variant. Pairs directly beside the filled button (e.g. 'Request a demo' filled + 'Take a tour' outlined).

### Category Pill Badge
**Role:** Section labels and content taxonomy markers

Meadow (#cdface) background fill with Forest Ink (#001f1f) text and a 1px Forest Ink border. 22px border-radius. ~9px vertical / 11px horizontal padding. Matter 500 at 13px. Always paired with a small arrow icon (→) inside a circular forest-ink container on the right.

### Pastel Feature Card
**Role:** Product module showcase — each product area gets its own colored home

Rounded card with a pastel tint background (Mint #e4f7f9, Lime #f8fbe7, Lavender #e1e1fa). 14-43px border-radius. Contains a category icon (circular, filled with a slightly deeper shade), a title in Forest Ink at 19-22px, a description in Lichen Gray, and an embedded product UI screenshot. The pastel tint is the card's identity — never apply gradients or patterns to these.

### Testimonial Card
**Role:** Social proof — customer quotes with quantified results

Lavender (#e1e1fa) or pastel-tinted background. 14px border-radius. Contains: avatar (circular, ~48px), name in Forest Ink at 16px weight 500, role/company in Lichen Gray, quote text in Forest Ink at 14-16px, a large stat number (e.g. '30h', '2,000') in Forest Ink at 47px, and a 'Read the story →' link in Forest Ink.

### Product Device Frame
**Role:** Hero visual — the product UI displayed inside a device/laptop frame

A rounded-corner container (large radius ~14-29px) showing the product interface on a white card. Set against the Hero Gradient (radial mint→lime→teal). The frame has a subtle forest-tinted shadow. This is the only place where the radial gradient appears.

### Integration Banner
**Role:** Section-level call-to-action linking to integrations

Full-width card with a violet-to-blue gradient background. Contains a centered 'Integrations →' pill badge. Wide radius (~14-29px). This gradient is the cool counterpart to the hero's warm radial — used once per page as a section closer.

### Top Navigation
**Role:** Primary site navigation — persistent across all pages

Sticky top bar on Parchment background. Lattice logo (dark teal text + small multi-color petal icon) on the left. Center: nav items (Platform, Why Lattice, Customers, Resources, Pricing) in Slate (#455252) at 14px weight 500 with dropdown chevrons. Right: 'Log in' text link and a filled Forest Ink 'Request a demo' button with 11.5px radius.

### Announcement Banner
**Role:** Top-of-page promotional strip

Sits above the nav bar. Light mint/teal background. Contains event title in Forest Ink at 13px, a vertical divider, and a 'Register now →' link. Can be dismissed with a close button on the right.

### Customer Logo Strip
**Role:** Social proof — trusted-by logos below the hero

Horizontal row of customer logos (greenhouse, Robinhood, loom, duolingo, Discord, brooklinen, npr, gusto) in muted gray tones on the Parchment background. Logos sit at uniform size with even spacing. No background card — the logos float on the canvas.

### Link with Arrow
**Role:** Inline navigation link — used in body copy and card footers

Forest Ink text with an arrow character (→) trailing. Underlined on hover. 14-16px Matter 500. No background or border — color and weight carry the emphasis.

### Section Header
**Role:** Page section title pattern — the universal section opener

Category Pill Badge on top, then a heading at 47px Matter 500 in Forest Ink with -1.13px tracking, line-height 1.00. To the right or below: a description paragraph in Lichen Gray at 16-19px, optionally followed by a Link with Arrow. The badge → heading → description rhythm repeats across every section.

## Do's and Don'ts

### Do
- Use #001f1f (Forest Ink) for all primary text, primary buttons, and structural borders — let one dark color carry the entire system's weight
- Use Parchment #f7f6f2 as the page background on all screens — never substitute pure white for the body canvas
- Assign each product module or section category its own pastel tint (Mint, Lime, Lavender, Blush) for its feature card background — the color-coding system is signature
- Pair filled and outlined buttons side by side for every primary action: filled Forest Ink + outlined Forest Ink at 29px radius
- Use the 11px caption size with 0.08em letter-spacing for uppercase category labels and micro-text — wide tracking is the system's way of signaling 'tag/label'
- Apply the radial gradient (mint→lime→teal) only in the hero device frame area — it is a single-use atmospheric element, not a repeatable pattern
- Use the soft forest-tinted shadow stack (4% alpha, negative spread) for all card and image elevation — the 1px final ring replaces explicit border declarations

### Don't
- Don't use pure black (#000000) for text or UI elements — Forest Ink #001f1f is always the dark structural color, even though contrast ratios are identical
- Don't apply the pastel surface tints to full-page sections — they belong only on contained feature cards and testimonial blocks
- Don't use sharp corners (0px radius) on any interactive element — the system minimum is 7px, and most elements are 14-29px
- Don't introduce additional accent colors beyond the defined palette — the multi-color chart system (Deep Forest, Deep Teal, Olive, Plum, Saffron, Iris) is reserved for data visualization and illustration, never for UI surfaces
- Don't use heavy or high-opacity shadows — the entire shadow system stays at 0.04-0.08 alpha for the organic, paper-like lift
- Don't place colored buttons (green, violet, etc.) as primary actions — the primary CTA is always Forest Ink filled, regardless of section context
- Don't break the badge → heading → description section header rhythm — every section opens with the Category Pill Badge, then heading, then description

## Elevation

- **Cards, images, icons, links:** `color(srgb 0 0.121569 0.121569 / 0.04) 0px 12px 12px -6px, color(srgb 0 0.121569 0.121569 / 0.04) 0px 6px 6px -3px, color(srgb 0 0.121569 0.121569 / 0.04) 0px 3px 3px -1.5px, color(srgb 0 0.121569 0.121569 / 0.08) 0px 1px 1px -0.5px, color(srgb 0 0.121569 0.121569 / 0.04) 0px 0px 0px 1px`

## Surfaces

- **Parchment Canvas** (`#f7f6f2`) — Page background — the base layer everything sits on
- **Paper White Card** (`#ffffff`) — Product UI mockups, embedded content, and standard card surfaces lifted above the canvas
- **Pastel Feature Card** (`#e4f7f9`) — Color-coded product module cards — mint, lime, lavender tints assign each feature area its own visual territory

## Imagery

Imagery is product-led, not lifestyle. The hero uses a device frame containing a real product UI screenshot set against a soft radial gradient — no stock photography of people. Feature cards embed actual product interface screenshots (performance review panels, OKR tracking lists) as the primary visual proof. Customer logos appear in a flat monochrome strip — no testimonials photography beyond circular avatar crops. The only non-product visual element is the multi-color petal flower icon in the logo, which hints at the botanical/growth metaphor. All imagery sits on rounded containers with the soft forest-tinted shadow. No full-bleed photography anywhere — the Parchment canvas always wraps the content.

## Layout

Max-width 1200px centered, never full-bleed. Every section follows the same opening rhythm: Category Pill Badge → bold heading at 47px → description paragraph → content. The hero uses a two-column split (headline + buttons on the left, description text on the right) rather than a centered stack. Product feature sections use a 2-column card grid where each card has its own pastel tint. Testimonials display in a horizontal carousel with 3-up cards and dot pagination. Section gaps are generous (~72px) creating breathing room between bands. Navigation is a sticky top bar with the announcement banner above it. The page reads top-to-bottom as: announcement → nav → hero (split layout + device frame) → logo strip → platform overview (2-col pastel cards) → customer stories (carousel) → integrations banner (gradient closer).

## Similar Brands

- **Notion** — Same warm off-white canvas approach with a single dark text/button color and pastel-tinted feature blocks replacing section dividers
- **Linear** — Compact geometric sans-serif typography with tight tracking on large headlines and a restrained color palette that lets one dark accent do the structural work
- **Webflow** — Product-led homepage with embedded UI screenshots in rounded device frames, pastel-tinted feature cards, and a dark single-color primary CTA
- **Intercom** — Warm non-white canvas with soft shadows, pill-shaped badges, and a system of color-coded product cards each in its own pastel hue
