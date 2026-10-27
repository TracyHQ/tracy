# Modern Treasury — Style Reference
> Treasury ledger on graph paper. Build pages as a quiet white operating sheet where money flows are mapped with fine lines, labeled nodes, and exact dark controls.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Modern Treasury — treasury ledger on graph paper. The interface is a white financial canvas structured by faint grid lines, thin rules, and technical connector diagrams, with dark ink carrying almost all hierarchy. Large, softly weighted display headlines sit above compact operational UI; pale blue and muted plum blocks isolate product narratives, while deep forest green anchors the footer. Color is restrained to mint subscription controls, green network lines, and brown monospace labels, so the system reads as a payment infrastructure diagram rather than a colorful dashboard.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Paper | `#ffffff` | `--color-paper` | Page canvas, navigation surface, inputs, light cards, and high-contrast text on dark surfaces |
| Ink | `#151515` | `--color-ink` | Display text, headings, filled public buttons, dark rules, and inline control outlines |
| Graphite | `#424242` | `--color-graphite` | Secondary body copy and dense explanatory text |
| Steel | `#706f6f` | `--color-steel` | Muted metadata and low-emphasis supporting copy |
| Rule Gray | `#dcdcdc` | `--color-rule-gray` | Hairline dividers, grid rules, and low-emphasis structural borders |
| Edge Gray | `#cbcac8` | `--color-edge-gray` | Slightly stronger container and content-section borders |
| Ice Panel | `#f0f8f9` | `--color-ice-panel` | Contained story cards, problem/solution panels, and cool product-demonstration surfaces |
| Forest Ledger | `#0c221d` | `--color-forest-ledger` | Footer and full-width closing surfaces |
| Plum Ledger | `#543b4e` | `--color-plum-ledger` | Dark editorial/product cards and contrasting feature blocks |
| Network Green | `#29735c` | `--color-network-green` | Logo mark, payment-rail connector lines, and small solution markers — a restrained institutional green that makes the diagrams feel like live infrastructure |
| Mint Subscription | `#bae0cf` | `--color-mint-subscription` | Newsletter subscribe fill and bordered mint controls — the lone pale color action within the dark footer |
| Ledger Brown | `#7b5953` | `--color-ledger-brown` | Monospace problem labels and compact technical annotations |

## Tokens — Typography

### mt-neue-display — Hero and major section headings. The 450 weight keeps 71px headlines broad and quiet rather than bold; it makes financial infrastructure feel measured instead of promotional. · `--font-mt-neue-display`
- **Substitute:** Manrope
- **Weights:** 450
- **Sizes:** 47px, 71px
- **Line height:** 1.25 at 47px; 1.10 at 71px
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`
- **Role:** Hero and major section headings. The 450 weight keeps 71px headlines broad and quiet rather than bold; it makes financial infrastructure feel measured instead of promotional.

### mt-neue-text — Product narrative headings and feature titles. Use the text cut for tighter, more practical statements below display-scale hierarchy. · `--font-mt-neue-text`
- **Substitute:** Manrope
- **Weights:** 400
- **Sizes:** 21px, 32px
- **Line height:** 1.30 at 21px; 1.25 at 32px
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`
- **Role:** Product narrative headings and feature titles. Use the text cut for tighter, more practical statements below display-scale hierarchy.

### mt-sans — Navigation, body copy, links, inputs, buttons, footer lists, and card UI. Use 330 for subdued footer links, 360 for body paragraphs, 500 for navigation, and 600 for controls. · `--font-mt-sans`
- **Substitute:** Inter
- **Weights:** 330, 360, 400, 500, 600
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1.50
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`
- **Role:** Navigation, body copy, links, inputs, buttons, footer lists, and card UI. Use 330 for subdued footer links, 360 for body paragraphs, 500 for navigation, and 600 for controls.

### mt-mono — Technical eyebrow labels and diagram annotations; the monospace treatment turns short labels into ledger metadata rather than conventional marketing eyebrows. · `--font-mt-mono`
- **Substitute:** IBM Plex Mono
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.20
- **Letter spacing:** normal
- **OpenType features:** `"cv10" 1, "ss07" 1, "ss08" 1`
- **Role:** Technical eyebrow labels and diagram annotations; the monospace treatment turns short labels into ledger metadata rather than conventional marketing eyebrows.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| footer-link | mt-sans | 330 | 14px | 1.5 | 0px | `--text-footer-link` |
| technical-label | mt-mono | 500 | 14px | 1.2 | 0px | `--text-technical-label` |
| control-label | mt-sans | 600 | 14px | 1.5 | 0px | `--text-control-label` |
| nav | mt-sans | 500 | 14px | 1.5 | 0px | `--text-nav` |
| body | mt-sans | 360 | 16px | 1.5 | 0px | `--text-body` |
| body-strong | mt-sans | 600 | 16px | 1.5 | 0px | `--text-body-strong` |
| feature-heading | mt-neue-text | 400 | 21px | 1.3 | 0px | `--text-feature-heading` |
| section-heading | mt-neue-text | 400 | 32px | 1.25 | 0px | `--text-section-heading` |
| major-heading | mt-neue-display | 450 | 47px | 1.25 | 0px | `--text-major-heading` |
| hero-display | mt-neue-display | 450 | 71px | 1.1 | 0px | `--text-hero-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 48 | 48px | `--spacing-48` |
| 60 | 60px | `--spacing-60` |
| 64 | 64px | `--spacing-64` |
| 152 | 152px | `--spacing-152` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 8px |
| links | 2px |
| pills | 16777200px |
| inputs | 0px |
| buttons | 2px |
| navigationControls | 4px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `rgb(21, 21, 21) 0px 0px 0px 1px inset` | `--shadow-subtle` |
| xl | `lab(0 0 0 / 0.04) 0px 20px 25px -5px, lab(0 0 0 / 0.04) 0...` | `--shadow-xl` |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 24px
- **Element gap:** 8px

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

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Paper | `#ffffff` | Primary page canvas, navigation, and default content surface. |
| 1 | Ice Panel | `#f0f8f9` | Contained customer stories and product narrative panels. |
| 2 | Mint Subscription | `#bae0cf` | Footer subscription action surface. |
| 3 | Plum Ledger | `#543b4e` | Contrasting editorial and product feature card surface. |
| 4 | Forest Ledger | `#0c221d` | Footer and dark closing-region surface. |

## Elevation

- **Global Navigation Bar:** `0 20px 25px -5px lab(0 0 0 / 0.04), 0 8px 10px -6px lab(0 0 0 / 0.04)`
- **Outlined Navigation Button:** `0 0 0 1px inset #151515`

## Imagery

Visuals are text-dominant product diagrams and contained interface snapshots rather than lifestyle photography. The hero uses a faint graph-paper field with thin gray and green payment-routing lines, small rectangular monospace rail labels, and a centered dark logo node; it occupies a wide horizontal field below the copy. Product UI examples sit inside Ice Panel #f0f8f9 cards with 8px corners, while dark plum cards create denser product contrast. Icons are small, mostly monochrome utility marks; the green logo and network strokes are the only repeated colored graphic treatment.

## Layout

The site uses a centered content frame up to 1200px within a dominant Paper #ffffff canvas, topped by a slim horizontal navigation bar. The hero is a centered text stack with a large display heading, narrow supporting paragraph, dark conversion button, and a broad technical payment-rail diagram extending beneath it over faint grid rules. Content progresses through spacious white bands and contained Ice Panel #f0f8f9 blocks, including two-column product-story compositions with product artwork on one side and text on the other; customer proof appears as a wide pale card with compact carousel arrows. The page ends with a full-width Forest Ledger #0c221d footer: newsletter row first, divider second, then a six-column sitemap.

## Agent Prompt Guide

Quick Color Reference:
- Paper: #ffffff — Page canvas, navigation surface, inputs, light cards, and high-contrast text on dark surfaces
- Ink: #151515 — Display text, headings, filled public buttons, dark rules, and inline control outlines
- Graphite: #424242 — Secondary body copy and dense explanatory text
- Steel: #706f6f — Muted metadata and low-emphasis supporting copy
- Rule Gray: #dcdcdc — Hairline dividers, grid rules, and low-emphasis structural borders
- Edge Gray: #cbcac8 — Slightly stronger container and content-section borders
- Ice Panel: #f0f8f9 — Contained story cards, problem/solution panels, and cool product-demonstration surfaces
- Forest Ledger: #0c221d — Footer and full-width closing surfaces
- Plum Ledger: #543b4e — Dark editorial/product cards and contrasting feature blocks
- Network Green: #29735c — Logo mark, payment-rail connector lines, and small solution markers — a restrained institutional green that makes the diagrams feel like live infrastructure
- Mint Subscription: #bae0cf — Newsletter subscribe fill and bordered mint controls — the lone pale color action within the dark footer
- Ledger Brown: #7b5953 — Monospace problem labels and compact technical annotations

Create a centered white hero with a 71px/450 mt-neue-display headline in Ink #151515, a 16px/360 mt-sans paragraph in rgba(21, 21, 21, 0.8), a Dark Standard Button, and a white graph-paper payment-rail diagram using Rule Gray and Network Green lines.
Create an Ice Narrative Card with 8px corners and 24px padding: place a contained dark product-status screen beside a text block with a Ledger Brown mt-mono 14px/500 eyebrow, a 32px/400 mt-neue-text heading in Ink, and 16px/360 Graphite body copy.
Create a wide customer proof card on Ice Panel #f0f8f9 with an oversized monochrome customer wordmark at left, 16px/360 Graphite testimonial text, a 14px/600 Dark Compact Button at right, and two Ink circular 16777200px-radius carousel controls above it.
Create a Forest Footer with a Paper 16px/600 newsletter heading, a square-cornered Paper email field at 16px/500, a Mint Subscription button, a thin translucent white divider, and six columns of 14px/330 60%-white links.

## Similar Brands

- **Stripe** — Payment-infrastructure framing with technical product diagrams, compact conversion controls, and restrained white-page composition.
- **Column** — Banking API presentation that pairs sparse editorial typography with infrastructure-oriented interface visuals.
- **Increase** — Developer-finance visual language built from white space, dark utility text, exact controls, and technical operational content.
- **Treasury Prime** — Financial platform pages using institutional navigation, contained product demonstrations, and muted dark-green financial surfaces.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-paper: #ffffff;
  --color-ink: #151515;
  --color-graphite: #424242;
  --color-steel: #706f6f;
  --color-rule-gray: #dcdcdc;
  --color-edge-gray: #cbcac8;
  --color-ice-panel: #f0f8f9;
  --color-forest-ledger: #0c221d;
  --color-plum-ledger: #543b4e;
  --color-network-green: #29735c;
  --color-mint-subscription: #bae0cf;
  --color-ledger-brown: #7b5953;

  /* Typography — Font Families */
  --font-mt-neue-display: 'mt-neue-display', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mt-neue-text: 'mt-neue-text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mt-sans: 'mt-sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mt-mono: 'mt-mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-footer-link: 14px;
  --leading-footer-link: 1.5;
  --tracking-footer-link: 0px;
  --text-technical-label: 14px;
  --leading-technical-label: 1.2;
  --tracking-technical-label: 0px;
  --text-control-label: 14px;
  --leading-control-label: 1.5;
  --tracking-control-label: 0px;
  --text-nav: 14px;
  --leading-nav: 1.5;
  --tracking-nav: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.5;
  --tracking-body-strong: 0px;
  --text-feature-heading: 21px;
  --leading-feature-heading: 1.3;
  --tracking-feature-heading: 0px;
  --text-section-heading: 32px;
  --leading-section-heading: 1.25;
  --tracking-section-heading: 0px;
  --text-major-heading: 47px;
  --leading-major-heading: 1.25;
  --tracking-major-heading: 0px;
  --text-hero-display: 71px;
  --leading-hero-display: 1.1;
  --tracking-hero-display: 0px;

  /* Typography — Weights */
  --font-weight-w330: 330;
  --font-weight-w360: 360;
  --font-weight-regular: 400;
  --font-weight-w450: 450;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-48: 48px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-152: 152px;

  /* Layout */
  --page-max-width: 1200px;
  --section-gap: 48px;
  --card-padding: 24px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-lg: 8px;
  --radius-2xl: 16px;

  /* Named Radii */
  --radius-cards: 8px;
  --radius-links: 2px;
  --radius-pills: 16777200px;
  --radius-inputs: 0px;
  --radius-buttons: 2px;
  --radius-navigationcontrols: 4px;

  /* Shadows */
  --shadow-subtle: rgb(21, 21, 21) 0px 0px 0px 1px inset;
  --shadow-xl: lab(0 0 0 / 0.04) 0px 20px 25px -5px, lab(0 0 0 / 0.04) 0px 8px 10px -6px;

  /* Surfaces */
  --surface-paper: #ffffff;
  --surface-ice-panel: #f0f8f9;
  --surface-mint-subscription: #bae0cf;
  --surface-plum-ledger: #543b4e;
  --surface-forest-ledger: #0c221d;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-paper: #ffffff;
  --color-ink: #151515;
  --color-graphite: #424242;
  --color-steel: #706f6f;
  --color-rule-gray: #dcdcdc;
  --color-edge-gray: #cbcac8;
  --color-ice-panel: #f0f8f9;
  --color-forest-ledger: #0c221d;
  --color-plum-ledger: #543b4e;
  --color-network-green: #29735c;
  --color-mint-subscription: #bae0cf;
  --color-ledger-brown: #7b5953;

  /* Typography */
  --font-mt-neue-display: 'mt-neue-display', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mt-neue-text: 'mt-neue-text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mt-sans: 'mt-sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mt-mono: 'mt-mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-footer-link: 14px;
  --leading-footer-link: 1.5;
  --tracking-footer-link: 0px;
  --text-technical-label: 14px;
  --leading-technical-label: 1.2;
  --tracking-technical-label: 0px;
  --text-control-label: 14px;
  --leading-control-label: 1.5;
  --tracking-control-label: 0px;
  --text-nav: 14px;
  --leading-nav: 1.5;
  --tracking-nav: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-body-strong: 16px;
  --leading-body-strong: 1.5;
  --tracking-body-strong: 0px;
  --text-feature-heading: 21px;
  --leading-feature-heading: 1.3;
  --tracking-feature-heading: 0px;
  --text-section-heading: 32px;
  --leading-section-heading: 1.25;
  --tracking-section-heading: 0px;
  --text-major-heading: 47px;
  --leading-major-heading: 1.25;
  --tracking-major-heading: 0px;
  --text-hero-display: 71px;
  --leading-hero-display: 1.1;
  --tracking-hero-display: 0px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-48: 48px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-152: 152px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-lg: 8px;
  --radius-2xl: 16px;

  /* Shadows */
  --shadow-subtle: rgb(21, 21, 21) 0px 0px 0px 1px inset;
  --shadow-xl: lab(0 0 0 / 0.04) 0px 20px 25px -5px, lab(0 0 0 / 0.04) 0px 8px 10px -6px;
}
```
