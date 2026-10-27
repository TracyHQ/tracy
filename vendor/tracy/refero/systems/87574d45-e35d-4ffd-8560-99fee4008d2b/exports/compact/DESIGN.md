# Kikin — Style Reference
> Vintage park-poster on cream paper — a financial product wearing a patch jacket.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Kikin operates in the visual register of a vintage national-park poster that grew up and learned to do invoice financing. The system alternates between a deep forest-green hero and a warm cream content canvas, with one vivid grass-green (#55dd4a) acting as the single switch-on accent for every primary action. Headlines are set in Deacon, an ultra-condensed display sans pushed to absurd scale (up to 259px) with line-height compressed to 0.8 — type is treated as a landscape feature, not a label. Everything else is grounded: Graphik handles body, illustrations are limited-palette line-and-fill patches of mountains, trees and water, and circular illustrated badges float around content like enamel pins on a hiking jacket. The result is warm, environmental, slightly handmade, but with a serious financial product underneath — the green is a meadow, not a neon.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#122315` | Hero canvas, primary heading text, nav bar surface, footer — the dominant dark that anchors every green-on-green moment |
| Meadow | `#55dd4a` | Primary action fill (GET FUNDING), accent headline words, tag fills — one switch-on green against both dark and cream surfaces |
| Sage Border | `#566053` | Muted green-gray for secondary borders, dividers on cream, subhead accents — lets Meadow read as the only chromatic action |
| Lichen | `#77e46e` | Outlined/ghost action border, hover-state ring — a softer Meadow for non-filled interactive states |
| Paper Cream | `#f3ede4` | Main content canvas after the hero, card surface on dark hero, ghost-button fill — warm off-white that replaces typical SaaS white |
| Charcoal | `#333333` | Body text on cream, hairline borders, image overlays — the workhorse neutral that keeps #122315 reserved for display moments |
| Slate | `#141414` | Icon strokes, near-black text, very dark UI fills when Forest Ink would be too green |
| Frost | `#e5e7eb` | Subtle dividers on cream, secondary card edges — quieter than Sage Border |
| Moss Gray | `#999c91` | Helper text, metadata, low-emphasis captions on cream |
| Driftwood | `#626d66` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| River Blue | `#73d3eb` | Illustration accent for water and sky in the hero artwork and badge illustrations, small data-viz highlight |
| Sun Yellow | `#ffed52` | Illustration accent for suns and warm callouts in the patch artwork, limited to decorative moments |
| Deep Navy | `#0a071b` | Illustration dark fills, badge backgrounds where Forest Ink would blend with the canvas |

## Typography

### Deacon — Display and headline family. The signature choice: an ultra-condensed sans scaled from 58px subheads up to 259px hero lines, with line-height compressed to 0.8 so two-line headlines read as a single block. Weight 900 for hero and section openers, 700 for mid-page headings, 400 for badge labels and small caps callouts. This is the only voice allowed to be loud.
- **Substitute:** Oswald (700, 900), Antonio (700, 900), or Bebas Neue — any tall condensed sans with tight tracking
- **Weights:** 400, 700, 900
- **Sizes:** 14, 24, 32, 58, 72, 101, 137, 259
- **Line height:** 0.80–0.90
- **Letter spacing:** -2.85px at 259px, -2.06px at 137px, -2.12px at 101px, -1.87px at 72px, -0.83px at 32px, -0.55px at 24px
- **OpenType features:** `"ss01" on if available`

### Graphik — Body, UI, and small-text family. Weight 400 for paragraphs, captions, and nav; weight 500 for button labels, tag text, and emphasized subheads. The geometric humanist sans provides the quiet counterweight to Deacon's shouting display — every sentence is calm, every headline is compressed. Use at -0.4px tracking at 24px and above.
- **Substitute:** Inter (400, 500), Manrope (400, 500), or DM Sans (400, 500)
- **Weights:** 400, 500
- **Sizes:** 12, 14, 15, 16, 24, 32
- **Line height:** 1.20–1.43
- **Letter spacing:** -0.96px at 24px, -0.16px at 16px, 0.22px at 12px (positive tracking reserved for uppercase tags and eyebrow labels)

### Arial — System fallback and chart/dashboard data labels where a neutral numeric voice is needed; 40px reserved for stat readouts in the dashboard preview
- **Substitute:** Helvetica, system-ui
- **Weights:** 400
- **Sizes:** 14, 16, 40
- **Line height:** 1.25–1.43

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0.22px |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.43 | -0.16px |
| subheading | — | — | 24px | 1.2 | -0.96px |
| heading-sm | — | — | 32px | 1.13 | -0.83px |
| heading | — | — | 58px | 0.9 | -1.51px |
| heading-lg | — | — | 72px | 0.85 | -1.87px |
| display | — | — | 137px | 0.8 | -2.06px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **cards:** 20px
- **badges:** 20px
- **buttons:** 10px
- **stickerBadges:** 9999px

## Components

### Filled Primary Button
**Role:** The single GET FUNDING action across hero, mid-page, and final conversion moments

Meadow (#55dd4a) fill, Forest Ink (#122315) text, Graphik 500 at 14px, uppercase tracked +0.18em, 10px radius, 14px 28px padding. No border. Hovers deepen to #45c43a.

### Ghost Navigation Button
**Role:** Secondary nav action (LOG IN) sitting next to the primary CTA

Transparent fill on dark hero, 1px solid #f3ede4 (Paper Cream) border, Paper Cream text, Graphik 500 14px uppercase +0.18em, 10px radius, 10px 20px padding. Inverts to Forest Ink border on Paper Cream sections.

### Circular Carousel Arrow
**Role:** Testimonial and content carousel controls

64px circle, 1px Lichen (#77e46e) border on Paper Cream, centered chevron in Lichen. No fill, no shadow — a quiet navigational pin.

### Display Headline Block
**Role:** Section openers and hero title — the loudest voice in the system

Deacon 900 at 137px (hero) or 72px (section opener), line-height 0.80–0.85, tracking -2px or -1.87px, Forest Ink on cream or Paper Cream on dark. The second line of a hero can swap to Meadow to create a two-color sentence.

### Eyebrow Step Label
**Role:** Small numeral or kicker above section openers (01, 02, 03)

Graphik 400 14px, tracking +0.22em, uppercase, Meadow text. Sits 24px above the display headline with a 1px Sage Border underline.

### Illustrated Patch Badge
**Role:** Circular floating badges around the mission section — the system's signature decorative motif

120–160px circle, limited-palette illustration (Deep Navy fill, Meadow/River Blue/Sun Yellow accents, Paper Cream linework), 2px Paper Cream outer ring, caption in Deacon 400 curving around the edge or Graphik 400 10px underneath. Float with 8–12px rotation for handmade feel.

### Sticker Badge
**Role:** Overlapping rectangular or circular callouts on testimonial photos (PRIORITY PLANET, WORK TOGETHER)

Rectangular: Meadow fill, Forest Ink text, Graphik 500 12px uppercase, 0px radius (sharp corners), 4°–8° rotation. Circular variant: Deep Navy fill with Paper Cream type, 9999px radius. Must overlap the parent image by at least 20%.

### Dashboard Preview Card
**Role:** Product screenshot card in feature sections

20px radius, Paper Cream surface, 1px Sage Border, 32px internal padding, subtle 0 12px 40px rgba(10,7,27,0.12) shadow. Contains Graphik data labels and a soft River Blue chart area.

### Testimonial Quote Card
**Role:** Customer story layout with photo, quote, and attribution

Two-column on cream: 5:7 split, product photo left (full-bleed within column, no radius), quote right. Quote in Graphik 400 18px Charcoal, attribution in Deacon 400 14px Forest Ink with 1.2em letter-spacing. No card chrome — cream canvas is the surface.

### Floating Calculate Funding Chip
**Role:** Persistent bottom-right conversion pin

White fill, Forest Ink text, 20px radius, 12px 20px padding, Graphik 500 13px, with a small thumbs-up icon in Meadow. Lifts with 0 8px 24px rgba(10,7,27,0.18). Stays fixed across scroll.

### Top Navigation Bar
**Role:** Sticky header across all screens

Forest Ink fill on hero, Paper Cream on content sections. Kikin wordmark left in Graphik 500 18px, center nav links in Graphik 400 12px uppercase +0.18em, right cluster holds Ghost + Filled Primary buttons. 64px tall, no bottom border.

### Numbered Feature Section
**Role:** Mid-page explainer blocks (GROW WITH… 01, 02, 03)

Single column on cream: 01 eyebrow in Meadow, Deacon 900 72px section title, Graphik 400 16px body, optional dashboard card below. 96px vertical breathing between blocks.

### Hero Landscape Illustration
**Role:** Full-bleed decorative scene anchoring the hero

Mountains, pine forest, sunset, water, and a backpacker — built from limited palette (Deep Navy, Meadow, River Blue, Sun Yellow, Paper Cream linework) with no gradients and no photographic realism. Hand-drawn line quality, no perspective vanishing. Anchors the bottom 40% of the hero canvas.

## Do's and Don'ts

### Do
- Use Deacon 900 between 58px and 259px for any display moment — its compressed geometry is the system, not a decoration
- Reserve Meadow (#55dd4a) for exactly two roles: primary action fill and the second line of a two-color hero headline
- Set line-height at 0.80–0.90 on every Deacon block — letting it breathe at 1.2 destroys the condensed silhouette
- Default body canvas to Paper Cream (#f3ede4); pure white is a violation of the warm, paper-poster mood
- Use the Patch Badge motif whenever illustrating an abstract concept (sustainability, impact, values) — it is the system's native decoration
- Rotate sticker badges 4–8° and let them overlap images by 20%+ to keep the handmade feel
- Keep illustration palette to Deep Navy + Meadow + River Blue + Sun Yellow + Paper Cream — adding a sixth hue breaks the poster cohesion

### Don't
- Don't introduce a second chromatic accent — Meadow is the only green, River Blue is illustration-only, Sun Yellow is decorative-only
- Don't set Deacon at line-height above 0.95 or weight below 700 for headings — the quietness comes from the compressed line, not the weight
- Don't use pure black (#000000) for text on cream — use Charcoal (#333333) or Forest Ink (#122315) to keep the warm tone
- Don't apply shadows to patch badges or sticker badges — they should feel printed on the page, not floating
- Don't use gradients — the system is flat poster-ink, not glass-morphism
- Don't round cards at more than 20px or buttons at more than 10px — both radii are extracted from the source
- Don't place a filled Meadow button on a Meadow or Lichen background — there is no chromatic action contrast in that pairing, use Ghost or a dark surface

## Elevation

- **Floating action chip (Calculate Your Funding):** `0 8px 24px rgba(10, 7, 27, 0.18)`
- **Dashboard preview card:** `0 12px 40px rgba(10, 7, 27, 0.12)`
- **Testimonial card:** `none — relies on cream canvas contrast, not shadow`

## Surfaces

- **Hero Canvas** (`#122315`) — Dark forest ink for the hero, nav, and any full-bleed dark band
- **Content Paper** (`#f3ede4`) — Warm cream for all body content, replacing typical SaaS white
- **Ink Card** (`#0a071b`) — Dark surface for testimonial quote cards and badge sticker backgrounds
- **Sage Tint** (`#566053`) — Muted surface for secondary cards sitting on cream where a pure white would feel cold

## Imagery

Illustrations dominate over photography. The hero and all section accents use hand-drawn limited-palette line-and-fill scenes (mountains, forests, sunsets, rivers, backpackers, a hiker raising a fist on a summit) built from Deep Navy, Meadow, River Blue, Sun Yellow, and Paper Cream linework — no gradients, no perspective vanishing points, slightly naïve in proportion. Photography appears only in the testimonial section as tight, high-contrast product crops (a blue water bottle mid-splash) that pop against the cream canvas. Decorative circular 'patch' badges — enamel-pin style illustrations of trees, logs, suns, and globes — float around hero-adjacent sections at slight rotations. The system never uses lifestyle photography, never uses stock imagery, and never uses duotone treatments.

## Layout

Hero is full-bleed dark Forest Ink with the Kikin wordmark top-left, centered nav, and centered action cluster top-right. Headline sits centered above the hero, then a full-width illustrated landscape anchors the bottom 40%. The rest of the page alternates between Paper Cream content bands and occasional Forest Ink feature bands. Content is max-width 1200px centered, with two-column splits (text-left/image-right or vice versa) and 96px vertical breathing between sections. Numbered feature blocks stack single-column on cream. The Calculate Funding chip floats fixed bottom-right across the entire page, riding over every section.

## Similar Brands

- **Allbirds** — Same earth-tone palette and environmental brand storytelling with cream-and-forest coloring, but Kikin keeps the condensed-display poster energy
- **Patagonia** — Shared nature-illustration visual language and warm cream content surfaces paired with a single bold accent
- **Watershed** — Climate-fintech crossover with the same dark-to-cream section rhythm and single bright green for primary action
- **Cuvva** — Uses an ultra-condensed display sans at massive scale over warm cream content — the same 'shout headlines, calm body' typographic duet
