# Relate dot App — Style Reference
> Diversity mosaic behind frosted notes. A wall of color-blocked portraits carries every visual mood the system needs; every UI element is a clean white card or a flat colored chip floating above it.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A domain-marketplace surface that turns a wall of human portraits into the brand canvas: a dense color-coded photo mosaic of diverse faces on saturated background blocks, with crisp white information cards floating on top like sticky notes. Typography is the loud element — oversized all-caps display lockup sits above utilitarian sans body text in a calm neutral scale. Chromatic accents are functional, not decorative: a single blue drives links and the Buy Now affordance, while a vivid green signals availability and supplementary actions. The overall impression is a premium product card that breathes through whitespace inside each panel rather than through gaps between them, letting the portrait grid supply all the energy the chrome refuses to.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lime Pulse | `#7bd428` | Green outline accent for tags, dividers, and focused UI edges |
| Signal Blue | `#2484f2` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Deep Signal | `#2374c4` | Hover/pressed state for Signal Blue links and outlined actions, visited-link fallback — one step darker so the interactive state has a clear visual step |
| Carbon | `#222222` | Headline text, dark section headers, strong emphasis |
| Graphite | `#444444` | Body text, default copy, long-form paragraphs, footer text — the working text color for the entire interface |
| Ink | `#000000` | Heavy borders, heading underlines, icon fills, structural dividers |
| Mist | `#eeeeee` | Hairline borders, input outlines, ghost button borders, neutral chip backgrounds |
| Paper | `#ffffff` | Page background, floating information cards, content panels, price badge surface |

## Typography

### roboto — Secondary body, footer copy, link runs, button labels, small print — the workhorse text family that fills in around Proxima without competing with it
- **Substitute:** Roboto
- **Weights:** 400, 700
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1.20–1.31
- **Letter spacing:** normal

### proximacapsbold — Display lockup for the domain name itself (e.g. RELATE.APP). The all-caps heavy treatment at 46px is the single loudest element on the page — it IS the product. Substitute: Montserrat 800 uppercase, or League Gothic.
- **Substitute:** Montserrat 800 uppercase
- **Weights:** 400 (rendered as heavy/800 caps variant)
- **Sizes:** 46px
- **Line height:** 1.20
- **Letter spacing:** normal

### proxima — Primary UI and content family — section headings (31–33px), subheadings (22px), and larger body copy (20–21px). The 300/400 spread lets a subhead whisper while a label shouts without changing family. Substitute: Montserrat or Gotham.
- **Substitute:** Montserrat
- **Weights:** 300, 400, 500, 800
- **Sizes:** 17px, 20px, 21px, 22px, 31px, 33px
- **Line height:** 1.20–1.41
- **Letter spacing:** normal

### Georgia — Italic-feel body passages and editorial pull quotes — Georgia's serif forms give a small block of text a magazine tone amid the otherwise sans-serif chrome
- **Substitute:** Georgia
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.20
- **Letter spacing:** normal

### Arial — Fallback body for system-rendered blocks, older browser fallback, and any third-party widget copy that ships in Arial
- **Substitute:** Arial
- **Weights:** 400
- **Sizes:** 14px, 18px
- **Line height:** 1.33–1.67
- **Letter spacing:** normal

### sourcesanspro — sourcesanspro — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.31 | — |
| body-sm | — | — | 16px | 1.2 | — |
| body-lg | — | — | 20px | 1.21 | — |
| subheading | — | — | 22px | 1.2 | — |
| heading-sm | — | — | 31px | 1.2 | — |
| heading | — | — | 33px | 1.2 | — |
| display | — | — | 46px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 36px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **cards:** 0px
- **badges:** 2px
- **buttons:** 0px
- **priceChip:** 2px

## Components

### Brand Lockup Display
**Role:** Domain-name headline

All-caps Proxima Nova 46px, weight 800, color Carbon #222222, letter-spacing normal, rendered as 'RELATE.APP' with a period. Sits inside a white floating card with 20px padding. The single loudest element on the page.

### Availability Pill
**Role:** Status indicator

Inline label reading 'Available!' in Lime Pulse #7bd428, Proxima 500/600, paired with a small green check or dot. 2px radius, no background fill — color alone carries the signal. Sits flush left of the domain lockup.

### Price Badge
**Role:** Primary price chip

Filled Signal Blue #2484f2 background, white #ffffff text, Proxima 700 22–24px, 2px radius, 15px horizontal padding, ~10px vertical padding. Contains '$34,999'. This is the only filled chromatic surface in the system.

### Buy Now! Outlined Action
**Role:** Primary call to action

Outlined chip: 1px border in Signal Blue #2484f2, transparent or white fill, Signal Blue text, 2px radius, 15px horizontal padding. Sits to the right of the price badge as a paired action. On hover, border deepens to Deep Signal #2374c4.

### Floating Info Card
**Role:** Content panel over the photo grid

White #ffffff surface, 20px padding all sides, no radius (0px), no border, no shadow. Sits semi-translucent over the portrait mosaic. Acts as the readable canvas for the domain name, price, and descriptive paragraphs.

### Description Paragraph Block
**Role:** Long-form domain pitch

Proxima 17–20px weight 400, Graphite #444444, line-height 1.41, sitting on the white floating card. Inline 'Buy Now!' link is Signal Blue, inline 'Learn more' link is Lime Pulse — the two chromatic link colors map to two distinct intent levels.

### Trust Badge (GoDaddy Secure Transaction)
**Role:** Third-party trust signal

Compact white card with a thin Ink #000000 hairline border, ~10px padding, containing the GoDaddy lockup plus the phrase 'Secure transaction with' in Roboto 14px Graphite, and 'Learn more' as a Lime Pulse link.

### Top Bar / Logo Lockup
**Role:** Site identity

TOPDOMAINS wordmark in Proxima 800 uppercase ~22px, Carbon #222222, with the tagline 'Domain names that define your brand™' in Roboto 14px Graphite directly below. Left-aligned on a 36px-padded band above the mosaic.

### Inline Link (Primary)
**Role:** In-prose link to the purchase action

Roboto or Proxima 400, Signal Blue #2484f2, underline on hover only or always underlined. Color alone differentiates it from body — no weight change.

### Inline Link (Secondary)
**Role:** In-prose 'Learn more' link

Roboto or Proxima 400, Lime Pulse #7bd428, underlined. Used exclusively for supplemental information links, never for purchase actions.

### Photo Mosaic Grid
**Role:** Page background / brand canvas

Edge-to-edge grid of portrait photographs, each portrait set on a flat saturated color block (pinks, greens, blues, oranges, teals, yellows, etc.). No radius on the portrait cells — they tile as hard rectangles. Acts as the entire visual atmosphere; the UI is built ON TOP of this grid, not around it.

### Installment Pricing Block
**Role:** Alternative payment breakdown

Inline text block in Proxima 17px Graphite, embedding bold emphasis on '36 installments at $1167/month' — the bold weight draws the eye to the monthly figure without changing color.

## Do's and Don'ts

### Do
- Use Proxima Nova Caps 46px 800 uppercase for the primary domain-name lockup — it is the product, not a heading.
- Keep the Price Badge and the Buy Now! chip as a pair: filled Signal Blue #2484f2 price on the left, outlined Signal Blue Buy Now! on the right, both at 2px radius.
- Use Lime Pulse #7bd428 exclusively for 'Available!' status pills and 'Learn more' supplemental links — never for purchase actions.
- Let the photo mosaic carry color; keep all chrome on white Paper #ffffff with no drop shadows and no rounded corners.
- Set body copy in Proxima 17–20px weight 400 Graphite #444444 with 1.41 line-height for the floating card paragraphs.
- Map link intent to color: Signal Blue for the buy action, Lime Pulse for learn-more, and never the reverse.
- Use Roboto 14px for footer, fine print, and GoDaddy-style trust copy — keep it as the supporting voice beneath Proxima.

### Don't
- Don't introduce a filled wide-width Signal Blue button — the only filled blue surface is the compact price chip, and the only action is an outlined chip next to it.
- Don't round corners on cards, panels, or the photo grid — the 0px radius on cards and the sharp tile edges on the mosaic are signature.
- Don't add drop shadows to floating cards; the photo grid already provides depth through layering, and shadows would muddy the mosaic.
- Don't use Lime Pulse for 'Buy Now' or any purchase action — green here means available/learn-more, never checkout.
- Don't use Georgia outside editorial pull quotes and italic-feel passages; mixing it into navigation or labels breaks the system.
- Don't use #000000 for body text — reserve pure black for borders, underlines, and icon fills; body text stays at Graphite #444444 or Carbon #222222.
- Don't place the domain lockup anywhere except the center of a white floating card over the photo grid — the mosaic-to-card-to-lockup stack is the page's core composition.

## Surfaces

- **Photo Mosaic Canvas** (`#ffffff`) — Base page background — white under the portrait grid; the portrait grid itself acts as the visual floor
- **Floating Info Card** (`#ffffff`) — White semi-translucent panel that holds the brand lockup, price, description, and trust badges over the mosaic
- **Price Badge** (`#2484f2`) — Filled Signal Blue chip carrying the dollar amount — the most saturated surface in the UI

## Imagery

The imagery is the page. A full-bleed photo mosaic of diverse human portraits — men and women of varied ethnicities and ages — each cropped to a square or near-square tile and set against a flat saturated color block (coral pink, lime, sky blue, orange, teal, yellow, purple). The portraits are tightly cropped, smiling, high-key studio photography. The tiles butt against each other with no gap and no radius, creating a quilt of color and faces that functions as the brand canvas. There is no product photography, no illustration, no abstract graphics — human diversity IS the visual identity. UI chrome (white cards, price chip, trust badge) floats above this grid as crisp opaque or near-opaque white panels, creating a two-layer system: colorful photographic atmosphere below, clinical white information above.

## Layout

Full-bleed edge-to-edge layout. The photo mosaic runs the full width and height of the page as a background layer. White floating cards are centered horizontally on a 1200px max-width rail and stack vertically down the page — the domain lockup card, the description paragraphs, the trust badge — each with 20px internal padding and 36px between cards. The top bar is a left-aligned TOPDOMAINS wordmark with a tagline, sitting on a white or near-white band with 36px of vertical padding. The hero is essentially the lockup card centered over the mosaic. Below the hero, content cards continue to float over the mosaic in a single centered column rather than a multi-column grid. Navigation is minimal — no sidebar, no mega-menu, just the top bar. The composition is one of stark contrast: a maximally colorful background against maximally clean white information surfaces, with the user's eye forced from the faces down to the domain name and price.

## Similar Brands

- **Squadhelp (domain marketplace)** — Same single-domain product card composition — one centered white panel over a photographic or colorful backdrop, oversized domain lockup, prominent price chip, and a 'Buy Now' outlined link as the action.
- **Dan.com** — Identical marketplace hierarchy — large domain name in heavy display weight, paired price-and-buy chip, white card surface, monochrome body text with a single blue link accent.
- **Afternic** — Same 'domain name as product' treatment: a strong typographic lockup, a price in a colored chip, and a buy-side action link, all on a clean white surface.
- **Efty** — Same premium domain portfolio feel — minimal chrome, oversized domain name, bold color accent on the price, and editorial body copy beneath.
- **Brandbucket** — Similar product-as-hero pattern: one named asset front-and-center with a single saturated action color, a clean white information layer, and minimal supporting navigation.
