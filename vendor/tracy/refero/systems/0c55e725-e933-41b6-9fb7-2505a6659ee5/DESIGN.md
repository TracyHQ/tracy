# Baselayer — Style Reference
> Baselayer — electric ledger in midnight. Treat the interface as an institutional document opened onto a luminous risk-analysis console.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Baselayer pairs a white editorial site canvas with deep-navy product worlds, using electric blue as a concentrated systems signal rather than a universal decoration. Large Season VF serif statements sit in generous blank space, while Uncut Sans carries compact navigation and Modern Era Mono turns labels, actions, and data language into operational notation. Product visuals are framed as flat verification consoles: sharp divisions, 1px rules, small 4px corners, grid fields, status rows, and plus-sign registration marks.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ledger Navy | `linear-gradient(90deg, #09234f 0%, #384ce3 100%)` | `--color-ledger-navy` | Hero bands, dark navigation, footer fields, and filled conversion controls — a dense blue-black base makes the electric interface panels appear illuminated |
| Registry Blue | `#384ce3` | `--color-registry-blue` | Product-console fields, logo marks, data-grid illumination, and active visual accents — vivid blue reads as a live system signal against Ledger Navy |
| Network Teal | `#1888a2` | `--color-network-teal` | Large feature-panel backgrounds and linked capability blocks — teal separates a data domain from the navy-and-blue product environment |
| Paper White | `#ffffff` | `--color-paper-white` | Page backgrounds, light header surfaces, cards, reversed type, logo rails, and hairline divisions |
| Ink Black | `#000000` | `--color-ink-black` | Editorial headlines, body copy, black feature panels, customer marks, and dark interface text |
| Carbon | `#121012` | `--color-carbon` | Near-black feature surfaces and dark data-card backgrounds |
| Mint Paper | `#eff5f0` | `--color-mint-paper` | Pale alternate panels, metric-card surfaces, and subdued content blocks |
| Sky Paper | `#c4f0ff` | `--color-sky-paper` | Pale blue feature surfaces, interface outlines, and diagram highlights |
| Rule Gray | `#e5e5e5` | `--color-rule-gray` | 1px navigation separators, card divisions, and light-page rules |
| Steel Rule | `#ced3dc` | `--color-steel-rule` | Cool 1px borders around light navigation controls and structured interface fields |
| Quiet Gray | `#595959` | `--color-quiet-gray` | Muted interface text and secondary navigation copy |

## Tokens — Typography

### Season VF — Editorial display and section headings. The 515 variable weight avoids the hard authority of a bold headline; its near-touching 1.02 leading lets multi-line statements behave like a single typographic object. · `--font-season-vf`
- **Substitute:** Cormorant Garamond
- **Weights:** 515
- **Sizes:** 40px, 48px, 56px, 72px
- **Line height:** 1.02, 1.10, 1.15
- **Letter spacing:** -0.36px at 72px, -0.24px at 48px, -0.005em across the family
- **Role:** Editorial display and section headings. The 515 variable weight avoids the hard authority of a bold headline; its near-touching 1.02 leading lets multi-line statements behave like a single typographic object.

### Uncut Sans — Navigation, body copy, panel headings, cards, lists, and product-interface labels. Tight tracking at larger sans steps gives diagrams and capability panels a compressed technical cadence. · `--font-uncut-sans`
- **Substitute:** DM Sans
- **Weights:** 400, 500
- **Sizes:** 13px, 15px, 16px, 18px, 20px, 22px, 24px, 30px, 60px, 64px
- **Line height:** 0.80, 1.00, 1.25, 1.35, 1.40, 1.50
- **Letter spacing:** -0.023em, -0.020em, -0.010em, -0.009em
- **Role:** Navigation, body copy, panel headings, cards, lists, and product-interface labels. Tight tracking at larger sans steps gives diagrams and capability panels a compressed technical cadence.

### Modern Era Mono — Uppercase eyebrow labels, links, navigation utilities, status language, and button text. Mono labels make calls to action and field annotations feel like instructions from the verification system rather than promotional UI. · `--font-modern-era-mono`
- **Substitute:** IBM Plex Mono
- **Weights:** 500
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.15
- **Letter spacing:** normal
- **Role:** Uppercase eyebrow labels, links, navigation utilities, status language, and button text. Mono labels make calls to action and field annotations feel like instructions from the verification system rather than promotional UI.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| eyebrow | Modern Era Mono | 500 | 12px | 1.15 | 0px | `--text-eyebrow` |
| nav | Uncut Sans | 500 | 15px | 0.8 | 0px | `--text-nav` |
| body | Uncut Sans | 400 | 16px | 1.5 | 0px | `--text-body` |
| mono-action | Modern Era Mono | 500 | 16px | 1.15 | 0px | `--text-mono-action` |
| body-large | Uncut Sans | 400 | 20px | 1.4 | -0.18px | `--text-body-large` |
| panel-heading | Uncut Sans | 500 | 24px | 1.35 | -0.24px | `--text-panel-heading` |
| section-heading | Season VF | 515 | 48px | 1.1 | -0.24px | `--text-section-heading` |
| hero-display | Season VF | 515 | 72px | 1.02 | -0.36px | `--text-hero-display` |

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
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 36 | 36px | `--spacing-36` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 52 | 52px | `--spacing-52` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 96 | 96px | `--spacing-96` |
| 164 | 164px | `--spacing-164` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 0px |
| links | 4px |
| buttons | 4px |
| navigation | 4px |

### Layout

- **Page max-width:** 1312px
- **Section gap:** 32px
- **Card padding:** 20px
- **Element gap:** 12px

## Components

### Dark Desktop Header
**Role:** Hero and dark-section navigation shell

Use an 80px-tall Ledger Navy #09234f bar with Paper White #ffffff logo and navigation. Keep a 1px Paper White divider at reduced opacity; navigation labels use Uncut Sans 15px/500 at 12px line-height.

### Light Sticky Header
**Role:** Scrolled navigation shell

Use a Paper White #ffffff 80px bar with Ink Black #000000 navigation, Registry Blue #384ce3 logo treatment, and a 1px Rule Gray #e5e5e5 bottom rule. Navigation labels use Uncut Sans 15px/500 at 12px line-height.

### Dark Outline Utility Button
**Role:** Sign-in utility control on dark navigation

Set Paper White #ffffff text and a 1px Paper White border on transparent background, 4px radius, and Modern Era Mono 16px/500 uppercase text at 18.4px line-height.

### Light Outline Utility Button
**Role:** Sign-in utility control on light navigation

Set Ink Black #000000 text on transparent Paper White #ffffff, with a 1px Steel Rule #ced3dc border, 4px radius, and Modern Era Mono 16px/500 uppercase text at 18.4px line-height.

### Navy Filled Conversion Button
**Role:** High-commitment navigation and hero control

Fill with Ledger Navy #09234f, use Paper White #ffffff Modern Era Mono 16px/500 uppercase text, 4px radius, and 20px padding on all sides.

### Editorial Hero
**Role:** Centered opening statement over the product field

Center a Season VF 72px/515 headline with 73.44px line-height and -0.36px tracking in Paper White #ffffff over Ledger Navy #09234f. Place the conversion control beneath it with a 20px gap, then let the product console rise from the lower edge.

### Verification Console
**Role:** Product demonstration card

Build a Registry Blue #384ce3 primary field with Paper White #ffffff inset rows, a 1px Sky Paper #c4f0ff outline, 4px corners, and 20px internal padding. Use Uncut Sans for entity names and Modern Era Mono 12px/500 for compact labels and metadata.

### Data-Grid Backdrop
**Role:** Technical atmosphere behind product demonstrations

Place a low-contrast Registry Blue #384ce3 cross-grid over Ledger Navy #09234f, bounded by thin vertical rules and marked with isolated Paper White #ffffff plus signs. Keep this decorative layer flat with no shadow.

### Customer Logo Rail
**Role:** Institutional social-proof band

Use a Paper White #ffffff full-width field with Ink Black #000000 partner marks aligned in one horizontal row. Separate the rail from adjacent material with 1px Rule Gray #e5e5e5 lines; do not place logos in rounded containers.

### Customer Story Mosaic
**Role:** Editorial proof module

Compose square and rectangular cells without card rounding: Paper White #ffffff quote cells, photographic portrait crops, Mint Paper #eff5f0 brand cells, and Ink Black #000000 logo cells. Divide cells with 1px Rule Gray #e5e5e5; use 20px padding for copy cells.

### Metric Tile
**Role:** Evidence statistic block

Use a flat Mint Paper #eff5f0 or Paper White #ffffff tile with 20px padding, 0px radius, and 1px Rule Gray #e5e5e5 division. Set the metric label in Modern Era Mono 12px/500 uppercase and the large value in Season VF with Ink Black #000000 text.

### Capability Surface Link
**Role:** Large linked capability panel

Use full-bleed, square-cornered panels in Network Teal #1888a2, Sky Paper #c4f0ff, Ink Black #000000, or Ledger Navy #09234f. Apply 20px padding; pair Uncut Sans 20px/400 copy with a Modern Era Mono 16px/500 uppercase link treatment.

### API Registry Card Trio
**Role:** Three-part product explainer

Arrange three adjacent 0px-radius cards with 1px Steel Rule #ced3dc borders: a Carbon #121012 identity card with Paper White text, then Paper White #ffffff assessment cards with Ink Black text. Use 20px padding and 12px internal gaps.

### Underlined Mono Text Link
**Role:** Editorial secondary link

Use Ink Black #000000 or Paper White #ffffff Modern Era Mono 16px/500 uppercase text with a 1px current-color underline and 4px link radius. Preserve transparent fill and avoid pill backgrounds.

## Do's and Don'ts

### Do
- Use Paper White #ffffff as the default canvas and reserve Ledger Navy #09234f for large hero, navigation, footer, and system-field bands.
- Set display statements in Season VF 515; use 72px/73.44px with -0.36px tracking for hero-scale type and 48px/52.8px with -0.24px tracking for major section headings.
- Set navigation labels in Uncut Sans 15px/500 at 12px line-height.
- Set uppercase operational labels and conversion text in Modern Era Mono 16px/500 at 18.4px line-height.
- Use 1px Rule Gray #e5e5e5 or Steel Rule #ced3dc borders instead of shadows.
- Keep cards square at 0px radius; use 4px only for buttons, links, navigation controls, and product-console corners.
- Use the 4px base unit with 12px element gaps, 20px component padding, and 32px section gaps.

### Don't
- Do not round content cards, logo tiles, photographs, or large capability surfaces beyond 0px.
- Do not use pill buttons, badges, or 9999px radii; button and utility-control radius is 4px.
- Do not apply drop shadows to cards, product windows, or navigation.
- Do not set display headlines in Uncut Sans or Modern Era Mono; reserve Season VF 515 for statement-level headings.
- Do not use Registry Blue #384ce3 as a universal filled action treatment; confine it to product-system fields, marks, and active visual signals.
- Do not introduce gradients outside the Ledger Navy #09234f to Registry Blue #384ce3 system-field transition.
- Do not replace the dark-field grid, thin rules, and plus markers with generic floating decorative shapes.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Paper White | `#ffffff` | Default page canvas, customer-story field, logo rail, and light header. |
| 1 | Mint Paper | `#eff5f0` | Alternate metric and capability panel. |
| 2 | Sky Paper | `#c4f0ff` | Pale technical panel and interface highlight. |
| 3 | Ledger Navy | `#09234f` | Hero, dark navigation, footer, and product-system field. |
| 4 | Carbon | `#121012` | Highest-contrast capability block and dark data-card surface. |

## Elevation

Avoid box shadows. Sections, cards, and product windows establish depth through hard 1px borders, opposing surface colors, grid overlays, and overlap at the edge of a dark field.

## Imagery

Imagery is text-dominant and product-led. Verification dashboards are contained technical illustrations with blue console fields, thin linework, data rows, and grid backdrops; they overlap dark sections rather than appearing as device mockups. Customer proof uses one tightly cropped studio portrait in a square editorial mosaic, surrounded by black partner marks and typographic statistic tiles. Icons are sparse, geometric, and mostly monochrome; plus-sign registration marks and small status symbols act as system notation rather than decorative iconography.

## Layout

The page is a max-width 1312px editorial site interrupted by full-bleed dark product fields. A centered Ledger Navy hero places a large white statement above an overlapping verification-console demonstration; the initial dark header switches to a Paper White sticky header as the page enters the white content field. White sections use broad vertical pauses, centered Season VF statements, logo rails, 1px horizontal divisions, and asymmetric customer-story mosaics that mix quote copy, portrait crop, marks, and metrics. Product explanation returns to centered copy over a three-card registry demonstration, while large colored capability surfaces create full-width tonal breaks. Desktop navigation is a single top bar with a left logo, compact horizontal links, and right-side utility controls.

## Agent Prompt Guide

Quick Color Reference:
- Ledger Navy: linear-gradient(90deg, #09234f 0%, #384ce3 100%) — Hero bands, dark navigation, footer fields, and filled conversion controls — a dense blue-black base makes the electric interface panels appear illuminated
- Registry Blue: #384ce3 — Product-console fields, logo marks, data-grid illumination, and active visual accents — vivid blue reads as a live system signal against Ledger Navy
- Network Teal: #1888a2 — Large feature-panel backgrounds and linked capability blocks — teal separates a data domain from the navy-and-blue product environment
- Paper White: #ffffff — Page backgrounds, light header surfaces, cards, reversed type, logo rails, and hairline divisions
- Ink Black: #000000 — Editorial headlines, body copy, black feature panels, customer marks, and dark interface text
- Carbon: #121012 — Near-black feature surfaces and dark data-card backgrounds
- Mint Paper: #eff5f0 — Pale alternate panels, metric-card surfaces, and subdued content blocks
- Sky Paper: #c4f0ff — Pale blue feature surfaces, interface outlines, and diagram highlights
- Rule Gray: #e5e5e5 — 1px navigation separators, card divisions, and light-page rules
- Steel Rule: #ced3dc — Cool 1px borders around light navigation controls and structured interface fields
- Quiet Gray: #595959 — Muted interface text and secondary navigation copy

Create a centered Ledger Navy hero with a Paper White Season VF 72px/515 headline at 73.44px line-height and -0.36px tracking; place a 4px-radius Ledger Navy conversion control with Paper White Modern Era Mono 16px/500 uppercase text beneath it, then overlap a Registry Blue verification console at the lower edge.
Create a Paper White customer-proof section with a centered Ink Black Season VF 48px/515 statement at 52.8px line-height and -0.24px tracking, a Modern Era Mono 16px/500 underlined text link, a single-row black logo rail, and 1px Rule Gray dividers.
Create a square-corner customer-story mosaic with a Paper White quote cell, a tightly cropped portrait cell, a Mint Paper metric cell, and an Ink Black brand-mark cell; use 20px padding and 1px Rule Gray divisions.
Create a three-card API registry demonstration with one Carbon card using Paper White text and two Paper White cards using Ink Black text, 1px Steel Rule borders, 0px card radius, 20px padding, and 12px gaps.

## Similar Brands

- **Persona** — Identity-verification product framing with deep blue system surfaces, evidence-driven flows, and compact data UI.
- **Alloy** — Fintech risk vocabulary expressed through dark product demonstrations, operational labels, and structured information panels.
- **Sift** — Fraud-platform visual language that combines dark analytical fields with bright technical accents and decision-oriented interface visuals.
- **Stripe** — Editorial serif-led statements paired with dense product diagrams, wide white-space intervals, and a sharply structured navigation bar.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-ledger-navy: #09234f;
  --gradient-ledger-navy: linear-gradient(90deg, #09234f 0%, #384ce3 100%);
  --color-registry-blue: #384ce3;
  --color-network-teal: #1888a2;
  --color-paper-white: #ffffff;
  --color-ink-black: #000000;
  --color-carbon: #121012;
  --color-mint-paper: #eff5f0;
  --color-sky-paper: #c4f0ff;
  --color-rule-gray: #e5e5e5;
  --color-steel-rule: #ced3dc;
  --color-quiet-gray: #595959;

  /* Typography — Font Families */
  --font-season-vf: 'Season VF', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-uncut-sans: 'Uncut Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-modern-era-mono: 'Modern Era Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-eyebrow: 12px;
  --leading-eyebrow: 1.15;
  --tracking-eyebrow: 0px;
  --text-nav: 15px;
  --leading-nav: 0.8;
  --tracking-nav: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-mono-action: 16px;
  --leading-mono-action: 1.15;
  --tracking-mono-action: 0px;
  --text-body-large: 20px;
  --leading-body-large: 1.4;
  --tracking-body-large: -0.18px;
  --text-panel-heading: 24px;
  --leading-panel-heading: 1.35;
  --tracking-panel-heading: -0.24px;
  --text-section-heading: 48px;
  --leading-section-heading: 1.1;
  --tracking-section-heading: -0.24px;
  --text-hero-display: 72px;
  --leading-hero-display: 1.02;
  --tracking-hero-display: -0.36px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-w515: 515;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-52: 52px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-164: 164px;

  /* Layout */
  --page-max-width: 1312px;
  --section-gap: 32px;
  --card-padding: 20px;
  --element-gap: 12px;

  /* Border Radius */
  --radius-md: 4px;

  /* Named Radii */
  --radius-cards: 0px;
  --radius-links: 4px;
  --radius-buttons: 4px;
  --radius-navigation: 4px;

  /* Surfaces */
  --surface-paper-white: #ffffff;
  --surface-mint-paper: #eff5f0;
  --surface-sky-paper: #c4f0ff;
  --surface-ledger-navy: #09234f;
  --surface-carbon: #121012;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-ledger-navy: #09234f;
  --color-registry-blue: #384ce3;
  --color-network-teal: #1888a2;
  --color-paper-white: #ffffff;
  --color-ink-black: #000000;
  --color-carbon: #121012;
  --color-mint-paper: #eff5f0;
  --color-sky-paper: #c4f0ff;
  --color-rule-gray: #e5e5e5;
  --color-steel-rule: #ced3dc;
  --color-quiet-gray: #595959;

  /* Typography */
  --font-season-vf: 'Season VF', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-uncut-sans: 'Uncut Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-modern-era-mono: 'Modern Era Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-eyebrow: 12px;
  --leading-eyebrow: 1.15;
  --tracking-eyebrow: 0px;
  --text-nav: 15px;
  --leading-nav: 0.8;
  --tracking-nav: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-mono-action: 16px;
  --leading-mono-action: 1.15;
  --tracking-mono-action: 0px;
  --text-body-large: 20px;
  --leading-body-large: 1.4;
  --tracking-body-large: -0.18px;
  --text-panel-heading: 24px;
  --leading-panel-heading: 1.35;
  --tracking-panel-heading: -0.24px;
  --text-section-heading: 48px;
  --leading-section-heading: 1.1;
  --tracking-section-heading: -0.24px;
  --text-hero-display: 72px;
  --leading-hero-display: 1.02;
  --tracking-hero-display: -0.36px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-52: 52px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-164: 164px;

  /* Border Radius */
  --radius-md: 4px;
}
```
