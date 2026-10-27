# Symbol Audio — Style Reference
> midcentury listening room after dusk

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Symbol Audio is a dark forest-green gallery for handcrafted audio furniture — a velvet wall behind museum-label typography. The entire site is anchored in a single deep evergreen (#1c3c27) that functions simultaneously as canvas, brand, and action border, with cream-bone cards floating on it like exhibition placards. Two custom serifs (Chalet-LondonSixty, Chalet-NewYorkSixty) carry every word of product copy, nav, and body, paired with a sharp geometric sans (SupremeLL-Bold) that exclusively handles display moments and headings — the contrast between rounded serif warmth and cold geometric boldness IS the voice. A single bottom marquee runs continuously, and the hero commits to a display headline so massive it bleeds off both edges of the viewport.

## Colors

| Name | Value | Role |
|------|-------|------|
| Evergreen Gallery | `#1c3c27` | Green accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Frost White | `#fffffd` | Product card surfaces, text on dark sections — slightly warm off-white, never pure #fff |
| Pewter Mist | `#dfe2e5` | Hairline borders, card outlines, divider rules, ghost-button borders on light cards |
| Onyx | `#000000` | Primary text on light cards, icon strokes, high-contrast detail |
| Bone | `#fffcda` | Alternate warm cream surface — contrast-pair companion to dark text on light cards |
| Ink Shadow | `#0e1e14` | Deepest text on evergreen, near-black with green undertone — pairs with frost-white for AAA contrast |
| Marquee Cobalt | `#447cf0` | Violet outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Ember Lacquer | `#c72a00` | Vivid red-orange seen in product photography (lacquered shelf units) — decorative, not functional |

## Typography

### Chalet-LondonSixty — Primary body and UI typeface — all nav links, product names, prices, badge text, footer copy, button labels. A custom rounded serif with distinctive ball terminals; its single weight is used universally
- **Substitute:** Recoleta, Domaine Display, or GT Sectra at weight 400
- **Weights:** 400
- **Sizes:** 11px, 13px, 15px, 16px
- **Line height:** 1.00–1.50
- **Letter spacing:** normal

### Chalet-NewYorkSixty — Secondary serif variant for body and link micro-copy — visually similar to LondonSixty but used in narrower contexts (small body, secondary links)
- **Substitute:** Recoleta Regular or GT Sectra Regular
- **Weights:** 400
- **Sizes:** 11px, 13px, 15px
- **Line height:** 1.00, 1.33
- **Letter spacing:** normal

### SupremeLL-Bold — Display and heading typeface — exclusively carries section headings ("What's on: Bestsellers…"), the hero wordmark, and large UI moments. A sharp geometric sans that cuts against the serif body type. The massive 80px size with -0.02em tracking is the signature move
- **Substitute:** Inter Tight Bold, Söhne Breit Halbfett, or Neue Haas Grotesk Bold
- **Weights:** 400
- **Sizes:** 14px, 20px, 34px, 52px, 80px
- **Line height:** 1.00–1.33
- **Letter spacing:** -0.02em (tighter at larger sizes)

### SupremeLL-BoldFlat — Flat-cut variant of the display sans for inline link emphasis within body copy
- **Substitute:** Inter Tight Bold
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.33
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.33 | 0px |
| body | — | — | 15px | 1.5 | — |
| subheading | — | — | 20px | 1.33 | — |
| heading-sm | — | — | 34px | 1.25 | -0.68px |
| heading | — | — | 52px | 1.13 | -1.04px |
| display | — | — | 80px | 1 | -1.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 40px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **tags:** 9999px
- **cards:** 0px
- **badges:** 9999px
- **buttons:** 9999px

## Components

### Top Navigation Bar
**Role:** Site-wide header

Transparent over the evergreen canvas. Left-aligned wordmark "Symbol" in SupremeLL-Bold at ~14px. Center group of serif text links (Shop, Learn, Showroom, Contact) in Chalet-LondonSixty 15px, #dfe2e5. Right-aligned utility icons (Search, Cart with count) in same serif. No background fill, no border — the evergreen shows through.

### Announcement Marquee
**Role:** Repeating bottom ticker

Fixed to viewport bottom, full-width band on evergreen (#1c3c27). Continuously scrolling text: "Our NYC Showroom is now open! Book an Appointment" in Chalet-LondonSixty 13px, #dfe2e5. "Book an Appointment" rendered as an underlined link. No padding above/below — hugs viewport edge.

### Hero Display Wordmark
**Role:** Brand statement above-the-fold

The word "Symbol" set in SupremeLL-Bold at ~80px (display scale), white/frost, tracking -0.02em. Deliberately oversized to bleed off both left and right edges of the viewport — it is a graphic element, not a headline. Anchors the hero above the product photography.

### Product Card
**Role:** Grid item for catalog

Frost-white (#fffffd) rectangular surface, 0px border-radius (sharp corners), hairline #dfe2e5 border. 20px internal padding. Product photograph fills the upper portion against the white card. Product name in Chalet-LondonSixty 15px, #000000. Price in same font, prefixed "from $". No elevation/shadow — the card reads as a flat placard pinned to the dark wall.

### Product Tag Badge
**Role:** Status indicator on product cards

Pill-shaped (9999px radius), transparent fill, 1px #1c3c27 border, ~8px vertical padding. Text in Chalet-LondonSixty 11–13px, #1c3c27. Variants: "Bestseller", "New Arrival". Positioned top-left of product image. Sits on the frost card surface so the green border is clearly visible.

### Section Heading
**Role:** Band title on evergreen

Set in SupremeLL-Bold at 34–52px (heading-sm to heading scale), #dfe2e5 or frost-white, tracking -0.02em. Left-aligned, single-line where possible, trailing ellipsis ("Bestsellers…") is a signature punctuation choice. Sits directly on the evergreen canvas with no container.

### Ghost Text Link
**Role:** Inline and standalone navigation

Chalet-LondonSixty 15px, #dfe2e5 on dark sections or #000000 on light cards. No underline by default; underline appears on hover. No background, no border — pure typographic link.

### Outlined Action Button
**Role:** Primary CTA on light surfaces

Transparent fill, 1px #1c3c27 border, 9999px radius, 10–15px vertical padding, 20px horizontal padding. Label in Chalet-LondonSixty 13–15px, #1c3c27. Used for "Book an Appointment" and similar — never a filled solid button. On evergreen backgrounds this style would be invisible, so CTAs always live on frost or bone surfaces.

### Hero Product Photograph
**Role:** Full-bleed editorial image

Photographs sit centered on the evergreen canvas with no frame. Subject is always a real product (audio console with turntable, stereo receiver in walnut housing). No rounded corners, no shadow — the product is presented as a documentary artifact, not a UI card.

## Do's and Don'ts

### Do
- Use #1c3c27 as the page canvas for every section band — the entire site lives inside this single color, section transitions are invisible.
- Pair the Chalet serif for all body, nav, prices, and badges with SupremeLL-Bold for every heading — never mix roles.
- Set product card backgrounds to #fffffd (Frost White) with 0px radius and a hairline #dfe2e5 border — the card is a placard, not a tile.
- Use 9999px border-radius for every badge, tag, and pill button — sharp corners everywhere else.
- Anchor display headlines to the left edge and let them run large (52–80px) with -0.02em tracking in SupremeLL-Bold.
- Place the announcement marquee fixed to the bottom viewport edge with the evergreen fill — it never scrolls away.
- Use #000000 text on frost-white cards and #dfe2e5 text on evergreen — maintain the 16:1+ contrast ratio at all times.

### Don't
- Do not introduce a filled solid-color button — this system only uses outlined/ghost actions on transparent fills.
- Do not use the blue (#447cf0) or red (#c72a00) as functional UI colors — they are decorative photography accents only.
- Do not apply border-radius to product cards or hero images — the system is sharp-edged everywhere except pills and badges.
- Do not set body text in SupremeLL-Bold — the sans is exclusively for display and headings.
- Do not add box-shadow or drop-shadow to cards or images — surfaces are flat, the contrast comes from color, not elevation.
- Do not use pure #ffffff for surfaces or text — the system runs #fffffd (frost) and #dfe2e5 (pewter) for its lightest tones.
- Do not break the marquee pattern — the announcement ticker is always present, always fixed, always evergreen-on-pewter.

## Surfaces

- **Evergreen Canvas** (`#1c3c27`) — Full-page background — hero, section bands, nav, announcement bar all sit on this
- **Frost Card** (`#fffffd`) — Product card surface — creates the gallery-placard effect against the dark canvas
- **Bone Alternate** (`#fffcda`) — Warm cream variant for select card or section surfaces — never used at the same prominence as Frost

## Imagery

Full-bleed product photography on the dark canvas — audio consoles, turntables, and stereo receivers in walnut and mid-century wood housings, shot in warm interior light. Products are framed dead-center, never cropped to a device edge, and float on evergreen with no background container. Product card photography is tightly cropped against a clean white field (the card itself is the background). No lifestyle imagery, no human subjects, no abstract graphics — every photograph is a documentary portrait of a product. The red and blue chromatic colors appear exclusively inside product photos (lacquered shelf units, control panel displays) and never as UI paint.

## Layout

Full-bleed evergreen canvas with no page-max-width container — sections stack vertically as continuous bands. The hero is a full-viewport evergreen wall with a massive left-bleeding wordmark above a centered product photograph. Below the fold, section headings ("What's on: Bestsellers…", "Staff Picks: Living Room Favorites…") sit left-aligned on the dark canvas, followed by a 2- or 3-column product card grid on frost-white cards. The grid columns are generous (cards are wide, not narrow) and cards have no gutters between them — they tile edge-to-edge. The announcement marquee is fixed to the bottom of the viewport at all times. Navigation is a single minimal top bar with no dropdowns visible. The overall rhythm is gallery-like: dark wall → heading → row of placards → dark wall.

## Similar Brands

- **Aesop** — Same single-color canvas discipline (deep brand wash across all sections) with stark serif/sans typographic contrast and minimal UI chrome
- **Muji** — Restrained product-as-art photography floating on a solid color field, sharp-edged card grids, no decorative gradients or shadows
- **Sonos** — Audio brand that treats hardware as gallery objects — large display headlines, dark immersive canvas, documentary product photography
- **Bowers & Wilkins** — Premium audio/furniture brand using full-bleed dark hero sections with oversized typography and white product card grids
- **Fellow (fellowproducts.com)** — Minimalist product commerce with a single dominant brand color, hairline-bordered cards, and custom serif body type paired with a geometric sans for display
