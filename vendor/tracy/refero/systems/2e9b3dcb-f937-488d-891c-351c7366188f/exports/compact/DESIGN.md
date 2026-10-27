# Modern Treasury — Style Reference
> Treasury ledger on graph paper. Build pages as a quiet white operating sheet where money flows are mapped with fine lines, labeled nodes, and exact dark controls.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Modern Treasury — treasury ledger on graph paper. The interface is a white financial canvas structured by faint grid lines, thin rules, and technical connector diagrams, with dark ink carrying almost all hierarchy. Large, softly weighted display headlines sit above compact operational UI; pale blue and muted plum blocks isolate product narratives, while deep forest green anchors the footer. Color is restrained to mint subscription controls, green network lines, and brown monospace labels, so the system reads as a payment infrastructure diagram rather than a colorful dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper | `#ffffff` | Page canvas, navigation surface, inputs, light cards, and high-contrast text on dark surfaces |
| Ink | `#151515` | Display text, headings, filled public buttons, dark rules, and inline control outlines |
| Graphite | `#424242` | Secondary body copy and dense explanatory text |
| Steel | `#706f6f` | Muted metadata and low-emphasis supporting copy |
| Rule Gray | `#dcdcdc` | Hairline dividers, grid rules, and low-emphasis structural borders |
| Edge Gray | `#cbcac8` | Slightly stronger container and content-section borders |
| Ice Panel | `#f0f8f9` | Contained story cards, problem/solution panels, and cool product-demonstration surfaces |
| Forest Ledger | `#0c221d` | Footer and full-width closing surfaces |
| Plum Ledger | `#543b4e` | Dark editorial/product cards and contrasting feature blocks |
| Network Green | `#29735c` | Logo mark, payment-rail connector lines, and small solution markers — a restrained institutional green that makes the diagrams feel like live infrastructure |
| Mint Subscription | `#bae0cf` | Newsletter subscribe fill and bordered mint controls — the lone pale color action within the dark footer |
| Ledger Brown | `#7b5953` | Monospace problem labels and compact technical annotations |

## Typography

### mt-neue-display — Hero and major section headings. The 450 weight keeps 71px headlines broad and quiet rather than bold; it makes financial infrastructure feel measured instead of promotional.
- **Substitute:** Manrope
- **Weights:** 450
- **Sizes:** 47px, 71px
- **Line height:** 1.25 at 47px; 1.10 at 71px
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`

### mt-neue-text — Product narrative headings and feature titles. Use the text cut for tighter, more practical statements below display-scale hierarchy.
- **Substitute:** Manrope
- **Weights:** 400
- **Sizes:** 21px, 32px
- **Line height:** 1.30 at 21px; 1.25 at 32px
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`

### mt-sans — Navigation, body copy, links, inputs, buttons, footer lists, and card UI. Use 330 for subdued footer links, 360 for body paragraphs, 500 for navigation, and 600 for controls.
- **Substitute:** Inter
- **Weights:** 330, 360, 400, 500, 600
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1.50
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`

### mt-mono — Technical eyebrow labels and diagram annotations; the monospace treatment turns short labels into ledger metadata rather than conventional marketing eyebrows.
- **Substitute:** IBM Plex Mono
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.20
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| footer-link | mt-sans | 330 | 14px | 1.5 | 0px |
| technical-label | mt-mono | 500 | 14px | 1.2 | 0px |
| control-label | mt-sans | 600 | 14px | 1.5 | 0px |
| nav | mt-sans | 500 | 14px | 1.5 | 0px |
| body | mt-sans | 360 | 16px | 1.5 | 0px |
| body-strong | mt-sans | 600 | 16px | 1.5 | 0px |
| feature-heading | mt-neue-text | 400 | 21px | 1.3 | 0px |
| section-heading | mt-neue-text | 400 | 32px | 1.25 | 0px |
| major-heading | mt-neue-display | 450 | 47px | 1.25 | 0px |
| hero-display | mt-neue-display | 450 | 71px | 1.1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **links:** 2px
- **pills:** 16777200px
- **inputs:** 0px
- **buttons:** 2px
- **navigationControls:** 4px

## Components

### Global Navigation Bar
**Role:** Public site navigation

Use a Paper #ffffff horizontal bar with Ink #151515 navigation at 14px/500 and 21px line-height. Keep 8px control gaps, 1px Ink inset outlines on bordered controls, and the single navigation shadow: 0 20px 25px -5px lab(0 0 0 / 0.04), 0 8px 10px -6px lab(0 0 0 / 0.04).

### Navigation Dropdown Trigger
**Role:** Top-level menu control

Set mt-sans at 14px/500 with Ink #000000 text, a transparent background, 4px 8px padding, a 1px Ink #000000 border, and a 4px radius. Pair the text with a small downward chevron.

### Outlined Navigation Button
**Role:** Account and secondary conversion control

Use a transparent Paper background, Ink #151515 text in mt-sans 14px/600, 4px 8px padding, a 1px Ink inset outline, and a 4px radius.

### Dark Compact Button
**Role:** Public conversion and story controls

Use Ink #151515 fill with Paper #ffffff text in mt-sans 14px/600 and 21px line-height. Apply 6px 12px padding, a 2px radius, and a 1px Paper #ffffff border.

### Dark Standard Button
**Role:** Hero and section-level conversion control

Use Ink #151515 fill, Paper #ffffff mt-sans 16px/600 text, 8px 16px padding, a 2px radius, and a 1px Ink #151515 border.

### Circular Carousel Control
**Role:** Story carousel navigation

Use an Ink #151515 circular control with Paper #ffffff directional icon, 6px internal padding, a 16777200px radius, and a 1px border in rgba(21, 21, 21, 0.2).

### Ice Narrative Card
**Role:** Problem, solution, and customer-story container

Use an Ice Panel #f0f8f9 background, 8px radius, no shadow, and either 24px internal padding for text-led cards or edge-to-edge contained product artwork. Keep Ink #151515 headings and Graphite #424242 explanatory copy.

### Plum Feature Card
**Role:** Contrasting product feature surface

Use a Plum Ledger #543b4e fill with an 8px radius and no shadow. Preserve edge-to-edge media or product compositions instead of adding generic white card padding.

### Technical Eyebrow
**Role:** Narrative state label

Set short labels in mt-mono 14px/500 with 16.8px line-height and Ledger Brown #7b5953 text. Place directly above an Ink #151515 text-cut heading with an 8px to 12px gap.

### Payment Rail Diagram
**Role:** Hero infrastructure visual

Draw thin Rule Gray #dcdcdc and Network Green #29735c connector paths across the white grid canvas. Use pale label chips, compact mt-mono 14px/500 text, and a centered Ink #151515 square logo node; do not turn the diagram into a rounded dashboard card.

### Newsletter Email Input
**Role:** Footer subscription field

Use a Paper #ffffff rectangular field with Ink #151515 mt-sans 16px/500 text, 8px 12px padding, 0px radius, and a 1px border in rgba(255, 255, 255, 0.2).

### Mint Subscribe Button
**Role:** Footer subscription submit control

Use Mint Subscription #bae0cf fill and border with Ink #151515 mt-sans 14px/600 text, 6px 12px padding, and a 2px radius.

### Forest Footer
**Role:** Newsletter and sitemap region

Use Forest Ledger #0c221d as a full-width closing band. Set group titles in Paper #ffffff mt-sans 14px/600, sitemap links in rgba(255, 255, 255, 0.6) at 14px/330, and separate the subscription row from link columns with a 1px rgba(255, 255, 255, 0.2) rule.

## Do's and Don'ts

### Do
- Use Paper #ffffff as the dominant canvas and Rule Gray #dcdcdc for 1px structural rules and faint grid lines.
- Set hero displays in mt-neue-display at 71px/450 with 78.1px line-height; use mt-neue-display at 47px/450 for major section headings.
- Use mt-sans body copy at 16px/360 with 24px line-height and Graphite #424242 or rgba(21, 21, 21, 0.8).
- Keep public dark buttons at Ink #151515 with Paper #ffffff text, 2px radius, and 6px 12px or 8px 16px padding.
- Use 48px section gaps, 24px card padding, and 8px intra-component gaps on the 4px spacing grid.
- Reserve Network Green #29735c for logo marks, connector paths, and small infrastructure accents.
- Close broad white pages with a Forest Ledger #0c221d footer using Paper headings and 60% white sitemap links.

### Don't
- Do not use border radii larger than 8px for cards or larger than 4px for rectangular controls.
- Do not apply drop shadows to Ice Panel #f0f8f9 or Plum Ledger #543b4e cards.
- Do not use Mint Subscription #bae0cf as the universal public button fill; confine it to newsletter-style footer controls.
- Do not replace the pale grid-and-connector hero visual with floating dashboard tiles or gradient blobs.
- Do not set display headlines in 600 or 700 weights; keep mt-neue-display at 450.
- Do not color ordinary body copy with Network Green #29735c or Ledger Brown #7b5953.
- Do not round newsletter inputs; keep their radius at 0px.

## Elevation

- **Global Navigation Bar:** `0 20px 25px -5px lab(0 0 0 / 0.04), 0 8px 10px -6px lab(0 0 0 / 0.04)`
- **Outlined Navigation Button:** `0 0 0 1px inset #151515`

## Surfaces

- **Paper** (`#ffffff`) — Primary page canvas, navigation, and default content surface.
- **Ice Panel** (`#f0f8f9`) — Contained customer stories and product narrative panels.
- **Mint Subscription** (`#bae0cf`) — Footer subscription action surface.
- **Plum Ledger** (`#543b4e`) — Contrasting editorial and product feature card surface.
- **Forest Ledger** (`#0c221d`) — Footer and dark closing-region surface.

## Imagery

Visuals are text-dominant product diagrams and contained interface snapshots rather than lifestyle photography. The hero uses a faint graph-paper field with thin gray and green payment-routing lines, small rectangular monospace rail labels, and a centered dark logo node; it occupies a wide horizontal field below the copy. Product UI examples sit inside Ice Panel #f0f8f9 cards with 8px corners, while dark plum cards create denser product contrast. Icons are small, mostly monochrome utility marks; the green logo and network strokes are the only repeated colored graphic treatment.

## Layout

The site uses a centered content frame up to 1200px within a dominant Paper #ffffff canvas, topped by a slim horizontal navigation bar. The hero is a centered text stack with a large display heading, narrow supporting paragraph, dark conversion button, and a broad technical payment-rail diagram extending beneath it over faint grid rules. Content progresses through spacious white bands and contained Ice Panel #f0f8f9 blocks, including two-column product-story compositions with product artwork on one side and text on the other; customer proof appears as a wide pale card with compact carousel arrows. The page ends with a full-width Forest Ledger #0c221d footer: newsletter row first, divider second, then a six-column sitemap.

## Similar Brands

- **Stripe** — Payment-infrastructure framing with technical product diagrams, compact conversion controls, and restrained white-page composition.
- **Column** — Banking API presentation that pairs sparse editorial typography with infrastructure-oriented interface visuals.
- **Increase** — Developer-finance visual language built from white space, dark utility text, exact controls, and technical operational content.
- **Treasury Prime** — Financial platform pages using institutional navigation, contained product demonstrations, and muted dark-green financial surfaces.
