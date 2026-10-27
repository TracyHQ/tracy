# July Fund — Style Reference
> dark gallery monograph with chromatic chapter cards

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

July Fund is an editorial venture-capital mosaic rendered in a dark, museum-like gallery space. The base is near-black (#000000 and #433e3c warm charcoals), and content is built from individual themed cards — each one a saturated color field acting as a chapter in a visual index. Typography is deliberately split: a high-contrast custom serif (Portrait) sets headlines that feel like gallery wall text, while compact Helvetica Neue runs the labels, metadata, and body copy underneath in a quiet, typewriter-precise voice. The system reads as a printed monograph made interactive — generous padding inside cards, pill-shaped controls, uppercase letter-spaced badges, and zero decorative shadow. Color is not decoration here; it is categorization. Each chromatic card (forest green, twilight violet, olive, solar yellow, ember red) signals a different fund vertical or post type, so the grid itself becomes a navigation system.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page canvas, deepest card base, and the void between sections — the room the cards hang in |
| Coffee Bean | `#433e3c` | Dominant border color across cards, badges, and dividers — the hairline that frames every chromatic block |
| Cream Paper | `#f0e7e4` | Light card surface for the hero/about panel and inverted buttons — a warm off-white that reads as printed paper on the dark canvas |
| Charcoal | `#2b2b2b` | Secondary surface and elevated card base for monochrome content blocks |
| Espresso | `#221f1e` | Button background for primary text controls on dark surfaces — one shade deeper than the card it sits in |
| Stone Gray | `#898989` | Muted body copy, list markers, and supporting metadata — the whisper tier below primary text |
| Paper White | `#ffffff` | Headline color on dark cards, badge text on chromatic fills, and link highlights |
| Forest Floor | `#113619` | Themed card surface for nature/climate/sustainability chapters — the deepest chromatic field, reads as moss or deep canopy |
| Twilight Violet | `#322b66` | Themed card surface for space, frontier, and science verticals — saturated enough to dominate a grid cell, dark enough to hold white type |
| Olive Depth | `#2e2909` | Themed card surface for energy and industry chapters — a near-black ochre that glows against the canvas |
| Solar Yellow | `#fde440` | High-impact accent card fill for transformation and thesis verticals — the loudest single block in the system, used sparingly to punctuate the grid |
| Mint Chip | `#56d270` | Small uppercase tag/badge fill for news and announcement labels — the only saturated green used at small scale |
| Lavender Mist | `#c6bffa` | Soft accent for secondary badges and highlight borders on the violet card family |
| Ember Red | `#b9534a` | Reserved research and analytical-content badge fill — used almost never; its rarity makes it register as a category marker |

## Typography

### Portrait — Display and heading serif used for the wordmark, section titles, and card headlines. Portrait is a high-contrast didone-style serif; its hairline strokes and sharp serifs give the site its monograph feel. A single weight (400) is used — no bold headlines, authority comes from size and contrast alone.
- **Substitute:** DM Serif Display, Playfair Display, or Cormorant Garamond
- **Weights:** 400
- **Sizes:** 18px, 30px, 34px, 35px, 40px
- **Line height:** 1.20
- **Letter spacing:** normal

### Helvetica Neue — Body, UI, badges, buttons, and metadata. Tight 400 for body, 700 for emphasis. The wide letter-spacing at small sizes (0.20–0.25em) is the defining micro-typography move: even 8px labels read as intentional, not afterthoughts.
- **Substitute:** Inter, Neue Haas Grotesk, or system-ui sans
- **Weights:** 400, 700
- **Sizes:** 8px, 10px, 15px, 16px, 18px
- **Line height:** 1.15, 1.20, 1.30
- **Letter spacing:** 0.20em at 10px, 0.25em at 8px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-lg | — | — | 16px | 1.3 | — |
| subheading | — | — | 18px | 1.3 | — |
| heading-sm | — | — | 30px | 1.2 | — |
| heading | — | — | 35px | 1.2 | — |
| heading-lg | — | — | 40px | 1.2 | — |
| display | — | — | 96px | 1.05 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 20px

### Border Radius

- **cards:** 20px
- **badges:** 8px
- **images:** 12px
- **buttons:** 24px
- **smallControls:** 5px

## Components

### Themed Category Card
**Role:** Primary content unit — each card carries a single saturated background and acts as a chapter in the grid.

Background is one of the chromatic fields (Forest Floor #113619, Twilight Violet #322b66, Olive Depth #2e2909, Solar Yellow #fde440, or Charcoal #2b2b2b). Border-radius 20px. Inner padding 40px on the dominant axis. Headline set in Portrait 30–35px, white (#ffffff) on dark fields, Coffee Bean (#433e3c) on Solar Yellow. No shadow. Contains a 12px-radius image block anchored top or center, a 9px-padded uppercase badge near the headline, and supporting body copy in Helvetica Neue 15px at Stone Gray (#898989).

### Cream Hero Panel
**Role:** Light inverted opening section that introduces the fund before the dark grid begins.

Full-bleed Cream Paper (#f0e7e4) surface against the Obsidian canvas. 20px radius. 40px padding. Wordmark 'July Fund' set in Portrait 96px at Coffee Bean (#433e3c) — the single largest type on the site. Mint Chip (#56d270) tag pill sits above the wordmark. A two-column footer block (label + paragraph) lives beneath the headline with 45px column gap.

### Portfolio Founder Card
**Role:** Monochrome card introducing an individual team member.

Charcoal (#2b2b2b) background, 20px radius, 40px padding. Mint Chip (#56d270) uppercase label badge at the top. Portrait 30px name headline in white. Body description in Helvetica Neue 15px, Stone Gray. Single pill ghost button (See LinkedIn) at the bottom.

### News Article Card
**Role:** Editorial post preview with a photographic image, date, excerpt, and read-more control.

Cream Paper (#f0e7e4) or Charcoal background, 20px radius. 12px-radius image block at the top. Mint Chip tag badge. Portrait 30–35px headline. Date stamp in Helvetica Neue 8–10px, 0.25em letter-spacing, Stone Gray. Ghost pill button at the bottom (Read More).

### Category Tag Badge
**Role:** Uppercase label that classifies a card's content vertical.

8px border-radius (softly rounded rectangle). 9px vertical padding, 16px horizontal padding. Background is the badge's semantic color: Mint Chip (#56d270) for news, Lavender Mist (#c6bffa) for cosmic/frontier, Ember Red (#b9534a) for research, Solar Yellow (#fde440) for theses. Text is Helvetica Neue 8–10px weight 700, letter-spacing 0.25em, set in Coffee Bean or Obsidian depending on background luminance.

### Ghost Pill Button
**Role:** Default text control for navigation, read-more, and secondary actions.

24px border-radius (full pill). 5px vertical padding, 22px horizontal padding. Transparent background. 1px Coffee Bean (#433e3c) border on dark surfaces, or 1px Cream Paper (#f0e7e4) border on light surfaces. Label in Helvetica Neue 8–10px weight 700, 0.25em letter-spacing, uppercase.

### Filled Pill Button
**Role:** Rare primary action — used only where a strong CTA is needed.

24px border-radius. Espresso (#221f1e) or Cream Paper (#f0e7e4) background. No border. 5/22px padding. Helvetica Neue 8–10px weight 700, 0.25em letter-spacing, uppercase. Inverted text color against the fill.

### Location Card
**Role:** Compact monochrome card displaying a city and weather metadata.

Charcoal (#2b2b2b) or Obsidian background, 20px radius. Small outlined weather icon (1.5px stroke, Coffee Bean or Cream). City name in Portrait 30–35px. Weather condition in Helvetica Neue 8–10px uppercase, 0.25em letter-spacing, Stone Gray.

### Image Tile
**Role:** Inset photographic or illustrative block within a card.

12px border-radius. Sits at the top or center of a card. Full-width of the card's inner padding. No caption — the image stands alone as visual evidence.

### Map Tile
**Role:** Light-surface map preview for location-based content.

Cream Paper or white background, 12px radius. Full-bleed street map render. No border. Functions as a content image inside a larger card.

### Fund Thesis Statement Block
**Role:** Long-form text card on a solid chromatic field that explains a fund vertical.

Solar Yellow (#fde440), Lavender Mist (#c6bffa), or Charcoal background. 20px radius. 40px padding. Headline in Portrait 30–35px. Body paragraph in Helvetica Neue 15px. Optional 'Core Theme' or 'Rent' badge at the top.

### Footer Link Block
**Role:** Closing navigation and contact region on the dark canvas.

Obsidian background, no panel. Coffee Bean 1px hairline divider above. Helvetica Neue 10–15px, 0.20em letter-spacing, uppercase labels in Stone Gray, links in Cream Paper.

## Do's and Don'ts

### Do
- Use Portrait 400 at 30–96px for every heading — never substitute a sans-serif headline.
- Set all uppercase labels (badges, buttons, metadata) at 8–10px with 0.20–0.25em letter-spacing and weight 700.
- Let each card pick exactly one chromatic field (Forest Floor, Twilight Violet, Olive Depth, Solar Yellow, or Charcoal) as its background — no gradients, no images-as-backgrounds inside cards.
- Use 20px radius for cards, 24px for buttons (full pill), 8px for badges, 12px for images.
- Pair Mint Chip (#56d270) badges only with dark or neutral cards; reserve Solar Yellow (#fde440) for the single loudest thesis card in any grid.
- Keep 40px card padding on the dominant axis and 20px on the minor axis; 45px column gap between paired text columns.
- Separate sections with 80px of Obsidian void — never use a divider line between cards, the radius and the gap are the separator.

### Don't
- Don't add box-shadow, glow, or blur to any element — the system is flat by design.
- Don't use bold weights for Portrait headlines; authority comes from size, not weight.
- Don't mix two chromatic fills inside a single card — pick one field and commit.
- Don't place body copy in a chromatic color other than Stone Gray (#898989), Paper White, or Coffee Bean — no accent text.
- Don't use buttons with square or 8px corners; the 24px pill is non-negotiable.
- Don't set background gradients on text-forward cards — gradients are reserved for the radial accent washes in hero/empty states.
- Don't center body paragraphs or labels; left-align everything except the wordmark.

## Elevation

The system is entirely flat. No box-shadows, no glows, no blurs. Depth is communicated exclusively through chromatic contrast — a Solar Yellow card sitting next to a Forest Floor card next to an Obsidian void creates the sense of layered paper without any rendered shadow. The single visual exception is the occasional radial-gradient wash in empty hero states, which simulates spotlight on a gallery wall rather than a UI drop shadow.

## Surfaces

- **Obsidian Canvas** (`#000000`) — The void between every grid cell and the outer page background.
- **Charcoal Card** (`#2b2b2b`) — Default monochrome card surface for text-forward content.
- **Cream Panel** (`#f0e7e4`) — Inverted hero/about card — the only light surface in the system, acts as a full-bleed opener.
- **Themed Chromatic Field** (`#113619`) — Category cards that substitute the neutral surface for a saturated chapter color (also #322b66, #2e2909, #fde440).

## Imagery

Imagery is used as documentary evidence, not decoration. Article cards carry full-color editorial photography (copper mines, oil rigs, glacial fields, aerial urban shots) clipped to 12px-radius tiles. Some cards use flat geometric illustrations (a constellation diagram for the Berlin card, a wind-turbine sketch for the Sakana AI card) — these are monochrome line art in Coffee Bean on a chromatic fill. Icons are line-only, ~1.5px stroke, and sit inside Location cards. There are no full-bleed hero photographs, no overlapping layers, no masked edges — every image lives inside a 12px-radius rectangle inside a 20px-radius card. The visual language is closer to a printed annual report than a SaaS landing page.

## Layout

The page is an asymmetric, masonry-flavored grid of themed cards on an Obsidian canvas. The hero is a single full-width Cream Paper panel (one card spanning the grid) containing the Portrait wordmark and a two-column meta block beneath. Below the hero, the layout breaks into a responsive 3-column card grid that itself becomes the navigation: each card is a destination, and the chromatic fills form a color-coded index. Cards are not uniform in height — a tall Cream Panel sits next to a shorter Charcoal card next to a full-bleed Solar Yellow thesis block. Column gaps are ~20px, row gaps are ~25–40px, and the outer page is centered within a 1280px max-width container. Section breaks are achieved with 80px of empty Obsidian space, never with a divider line.

## Similar Brands

- **Andreessen Horowitz (a16z)** — Same dark canvas with thematic color-coded content cards and a single oversized serif wordmark anchoring the hero.
- **Cyan Banister's blog / Future Fund** — Same editorial card-grid-as-index pattern, where each card's background color signals a different fund vertical or post type.
- **Substack's publication directory** — Similar tight card grid with chromatic fills per publication, pill-shaped read buttons, and uppercase 0.25em metadata labels.
- **Pitchbook / Crunchbase editorial** — Same monograph-on-dark approach — quiet body typography, oversized serif headlines, and cards that function as chapters rather than widgets.
