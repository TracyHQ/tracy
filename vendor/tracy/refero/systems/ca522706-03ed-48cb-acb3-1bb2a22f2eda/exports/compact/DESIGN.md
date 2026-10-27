# Little Amps — Style Reference
> vinyl record sleeve in afternoon sun. Cream paper, burnt-orange ink, a single dusty blue stamp, every label set in monospace — the interface behaves like a printed coffee zine: tactile, editorial, never sterile.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Little Amps is a warm analog coffee-shop world: cream-paper canvas, rich espresso-brown type, and burnt-orange accents that feel like sun-faded label ink. The interface reads like a printed zine or vinyl insert — a custom chunky display serif handles headlines while monospaced type (Necto Mono, Roboto Mono) labels everything that is structural: nav, buttons, prices, dates, callouts. Photography is documentary and tactile (hands on records, café counters, coffee cherries) and anchors every section. Color is sparse but decisive: a single vivid red-orange does the work of links and highlights, a dusty blue and marigold yellow appear as quiet secondary signals. Surfaces are flat, borders are hairline warm-taupe lines, and radius stays small (3–8px) — the aesthetic is curated and editorial, not soft or rounded.

## Colors

| Name | Value | Role |
|------|-------|------|
| Espresso | `#522c25` | Primary text, icons, card borders, nav, footer, input fields — the structural dark that holds every screen together, warm rather than black to stay on-brand with roasted coffee |
| Burnt Orange | `#c03001` | Filled action buttons, active links, key highlights, badge fills — the single vivid accent that makes interactive elements feel switched on against the cream canvas |
| Amber Ink | `#c46500` | Secondary accent for emphasized text, hover states, and warm callouts — a slightly darker orange that pairs with Burnt Orange for tonal depth |
| Marigold Wash | `#febf6f` | Soft highlight backgrounds, tag fills, and decorative washes — used sparingly to add warm sunlight moments inside otherwise neutral layouts |
| Dusty Blue | `#89b4ca` | Cool counter-accent for secondary buttons, link backgrounds, and color variety — the only blue in the system, it reads as a quiet companion to the warm palette |
| Cream Paper | `#fff9f2` | Page canvas, card surfaces, button fills, input backgrounds — the base layer of every screen, warm off-white that replaces pure white |
| Linen Beige | `#f6ede3` | Card backgrounds, section surfaces, image borders, body borders — one step deeper than canvas, creates gentle layered surfaces without elevation |
| Taupe Hairline | `#e6dad4` | Hairline dividers, card borders, nav separators, subtle structural lines — the only border color most components need |
| Sandstone | `#cbbbb4` | Muted card backgrounds, soft surface fills, disabled surface states — a warm gray-taupe for low-emphasis panels |
| Coffee Dust | `#977e77` | Muted body text, helper text, low-emphasis copy — warm brown-gray that fades into the cream without disappearing |

## Typography

### Little Amps — Custom display serif for brand wordmark, section headlines, and large editorial titles. Heavy negative tracking (-0.10em) at 41–51px creates a tight, chunky retro-poster feel. The heaviest typographic element on every page and the signature voice of the brand.
- **Substitute:** Recoleta, Canela, or DM Serif Display
- **Weights:** 500
- **Sizes:** 20px, 22px, 41px, 45px, 50px, 51px
- **Line height:** 0.80–1.00
- **Letter spacing:** -0.10em

### Inclusive Sans — Primary body and UI text. Used for descriptions, paragraphs, and most readable content. Consistent 0.05em positive tracking gives a slightly looser, zine-like feel. The workhorse — appears in nearly every context.
- **Substitute:** Inter, Work Sans, or Public Sans
- **Weights:** 400
- **Sizes:** 12px, 13px, 14px, 15px, 16px
- **Line height:** 1.00–1.60
- **Letter spacing:** 0.05em

### Necto Mono — Labels, buttons, navigation, dates, prices, and all structural metadata. Tighter line-heights (0.80–1.20) and monospaced forms make it feel like stamped or typewriter-set type. 0.05em tracking is the system-wide small-caps standard.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 400, 500
- **Sizes:** 10px, 12px, 13px, 14px, 16px
- **Line height:** 0.80–1.20
- **Letter spacing:** 0.05em

### Roboto Mono — Secondary monospaced text for code-like or technical labels, supplementing Necto Mono in body and data contexts.
- **Substitute:** Roboto Mono, Space Mono, or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.10
- **Letter spacing:** -0.02em to 0.05em

### GTStandard-M — Rare body fallback — appears in minimal contexts.
- **Substitute:** Söhne, Inter, or system-ui
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.50
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.1 | 0.5px |
| body | — | — | 14px | 1.6 | 0.7px |
| heading-sm | — | — | 20px | 1 | -2px |
| heading | — | — | 22px | 1 | -2.2px |
| display | — | — | 50px | 0.85 | -5px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40-64px
- **Card padding:** 24-36px
- **Element gap:** 6-12px

### Border Radius

- **cards:** 8px
- **badges:** 3px
- **images:** 8px
- **inputs:** 3px
- **buttons:** 3px

## Components

### Filled Action Button
**Role:** Primary CTA — Shop, Read More, Listen Now, Quick View

Solid Burnt Orange (#c03001) background, Cream Paper (#fff9f2) text, 3px radius, Necto Mono at 12–14px weight 400, 0.05em tracking, uppercase. Padding 10px 12px. Small, tight, stamp-like. The button reads as a printed label, not a pill.

### Ghost Outline Button
**Role:** Secondary action — border-only variants

Transparent background, Espresso (#522c25) 1px border, Espresso text, 3px radius, Necto Mono 12–14px uppercase. Padding 6–10px vertical. Used when a filled orange button would compete with a primary on the same screen.

### Navigation Link
**Role:** Top nav menu items: SHOP, ABOUT, WHOLESALE, COMMUNITY BOARD, CONTACT

Necto Mono 12–14px weight 400, 0.05em tracking, uppercase, Espresso (#522c25) text. No background. Small dropdown caret next to SHOP. Aligned in a single horizontal row centered in the header.

### Hero Brand Block
**Role:** Brand lockup overlaid on hero image

Little Amps display serif at 45–51px weight 500, -0.10em tracking, in Burnt Orange (#c03001). Two lines: brand name stacked over a small decorative line-art icon (espresso machine or coffee bag). Positioned top-left of the hero image with generous padding.

### Product Card
**Role:** E-commerce product tile — Friend Blend shown

Linen Beige (#f6ede3) background, 8px radius, product image framed with 8px radius and hairline border. Below image: product name in Inclusive Sans 16px Espresso, price in Necto Mono, tasting notes in Coffee Dust (#977e77), roast level bar, and a Dusty Blue (#89b4ca) Quick View button at 3px radius. Padding 24–36px.

### Editorial Card
**Role:** Community Board / blog post tile

Cream Paper (#fff9f2) background, Taupe Hairline (#e6dad4) 1px border, 8px radius. Image on top (8px radius), then date in Necto Mono 10–12px, title in Little Amps serif 20–22px -0.10em, excerpt in Inclusive Sans 14px Coffee Dust, and a filled Burnt Orange Read More button at 3px radius.

### Horizontal Scroll Carousel
**Role:** Community Board and product sliders

Row of 4–5 cards with consistent 14–16px gaps. Small circular prev/next arrow buttons (12px) in the top-right corner. No visible scrollbar — navigation is icon-only.

### Header / Nav Bar
**Role:** Site-wide top navigation

Cream Paper (#fff9f2) background, thin Taupe Hairline (#e6dad4) 1px bottom border. Brand wordmark logo on the left (lowercase custom mark), centered nav links in Necto Mono uppercase, right-aligned Account dropdown and Cart counter. Height approximately 64–80px.

### Date Stamp
**Role:** Article and post publication dates

Necto Mono 10–12px weight 400, 0.05em tracking, Coffee Dust (#977e77) text. Dot-separated format (e.g. '06.03.2026'). Sits above titles in editorial cards.

### Tasting Notes Bar
**Role:** Flavor profile indicator on product pages

Three small monospace labels (Roastness, Acidity, Complexity) with circular dot indicators below each, in Necto Mono 10–12px Espresso. A horizontal scale bar below shows roast level (e.g. Medium Roast) in Inclusive Sans 14px.

### Hero Image Banner
**Role:** Full-bleed top-of-page photography

Edge-to-edge lifestyle or product photography (record player, café interior) on Cream Paper canvas. No overlay, no gradient — the image IS the hero. Often paired with the Hero Brand Block in the top-left corner.

### Decorative Line-Art Icon
**Role:** Small brand mark and section accents (duck, espresso machine, coffee bag)

Espresso (#522c25) or Burnt Orange (#c03001) 1–2px stroke, no fill, approximately 24–40px. Hand-drawn illustrative style — appears next to headlines and as the brand mascot in the header logo.

### Slider Counter
**Role:** Carousel position indicator (01 — 03)

Necto Mono 10–12px in the bottom-right of carousels. Format: current slide number, em-dash, total slides, flanked by small prev/next arrow buttons.

### Shop All Pill Button
**Role:** Section transition link at bottom of carousels

Small Burnt Orange filled button with Cream Paper text at 3px radius. Necto Mono 12px uppercase, tight padding (8–10px vertical). Appears at the bottom-left of each major carousel section.

## Do's and Don'ts

### Do
- Use Little Amps serif for all display headlines at 20–51px with -0.10em tracking — it is the only voice that signals brand identity.
- Set all UI labels, nav, buttons, dates, and prices in Necto Mono uppercase with 0.05em tracking — this monospace voice IS the structural system.
- Default page background to Cream Paper (#fff9f2) and use Linen Beige (#f6ede3) for the next surface up — never use pure white.
- Use Burnt Orange (#c03001) as the single filled action color; keep all primary CTAs on a 3px radius for a printed-label feel.
- Hairline all borders at 1px in Taupe Hairline (#e6dad4) — never use heavy shadows or thick borders.
- Use Coffee Dust (#977e77) for any muted, secondary, or helper text — never use plain gray.
- Pair full-bleed documentary photography with the Hero Brand Block in the top-left corner; let the image do the atmosphere.

### Don't
- Don't use pure black, pure white, or blue-gray system neutrals — the palette is warm and coffee-toned throughout.
- Don't use large border-radius (pill shapes, 16px+, fully rounded) — the system is sharp-cornered at 3–8px.
- Don't use heavy drop shadows or elevation effects — depth comes from surface color shifts, not shadows.
- Don't set body or paragraph text in display serif or monospace — Inclusive Sans is the only body face.
- Don't introduce additional accent colors — the system is disciplined: one vivid orange, one amber, one marigold, one dusty blue.
- Don't use bright pure red, green, or blue for state semantics — the warm palette rewrites these into Espresso and Burnt Orange.
- Don't use Inter, Helvetica, or system-ui for branding moments — the custom display serif and monospace pairing is non-negotiable.

## Elevation

The system deliberately avoids drop shadows. Depth is communicated through three flat cream/beige surface levels (Cream Paper → Linen Beige → Sandstone) and 1px hairline borders in Taupe Hairline. Components float through color layering, not shadow. This keeps the aesthetic flat, editorial, and zine-like — consistent with the printed-label and vinyl-sleeve metaphor.

## Surfaces

- **Cream Paper** (`#fff9f2`) — Page canvas and default background
- **Linen Beige** (`#f6ede3`) — Card surfaces, section bands, image frames
- **Sandstone** (`#cbbbb4`) — Muted panel fills, secondary card surfaces

## Imagery

Photography is documentary, tactile, and lifestyle-led: hands touching record players, café counter scenes with baristas and customers, raw coffee cherries in hands, vinyl records, coffee bag packaging. Treatment is warm and slightly desaturated, matching the cream-and-espresso palette. Images are full-bleed at the hero level but contained in 8px-radius frames within cards. No stock photography, no abstract gradients, no 3D renders. Illustrations are minimal line-art icons (espresso machine, coffee bag, duck mascot) in 1–2px Espresso or Burnt Orange strokes — hand-drawn, never geometric. Imagery occupies roughly 40–50% of page real estate and carries the brand atmosphere more than typography or color alone.

## Layout

Page model is centered max-width (~1200px) on a full-bleed Cream Paper canvas, with content comfortably contained rather than edge-to-edge except for the hero image. The hero pattern is a full-bleed documentary photograph (record player / café interior) with the brand lockup overlaid in the top-left corner, followed by a horizontal nav bar pinned below the image. Section rhythm alternates between editorial text blocks (centered or left-aligned headlines over short paragraph copy) and image-heavy carousels (Community Board, product grids). Card grids use 3–4 columns on desktop with 14–16px gaps. Content density is comfortable — generous breathing room between sections (40–64px), with small tight internal padding. Navigation is a single horizontal bar with no sidebar or mega-menu. Carousels include small icon-only prev/next controls and a numeric position counter.

## Similar Brands

- **Blue Bottle Coffee** — Same documentary café photography on cream/off-white canvas with a single dark accent for text and one warm accent for CTAs
- **Sey Coffee** — Editorial zine-like layout with monospaced labels, tight corners, and warm coffee-toned palette replacing standard neutrals
- **Onyx Coffee Lab** — Heavy use of monospaced typography for technical metadata (roast dates, origins, scores) and flat surfaces without shadows
- **Stumptown Coffee** — Warm cream canvas, burnt-orange accent, and lifestyle photography that leads the page rather than supporting it
- **Counter Culture Coffee** — Editorial grid system with strong typographic hierarchy, small-radius buttons, and a restrained warm palette with one vivid accent
