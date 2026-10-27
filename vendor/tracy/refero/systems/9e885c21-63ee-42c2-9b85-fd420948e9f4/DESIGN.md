# Shortverse — Style Reference
> Shortverse — projector beam on white. Let a single full-width film still create the opening drama, then return to a bright editorial index of titles, metadata, and thumbnail strips.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Shortverse pairs an editorial film-magazine canvas with a cinema-scale spotlight treatment: stark white content bands, oversized condensed display type, and dark photographic hero frames. CooperHewitt headlines arrive dense and emphatic while JetBrainsMono turns navigation, metadata, and utility controls into technical film-catalog labels. Vivid violet is held back for the wordmark, iconography, and submission affordances; the rest of the interface relies on black, white, pale-gray comment tiles, and unrounded film stills.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| White Screen | `#ffffff` | `--color-white-screen` | Page backgrounds, navigation surface, hero utility buttons, and light text over photographic imagery |
| Charcoal Ink | `#262626` | `--color-charcoal-ink` | Primary headings, body copy, navigation labels, film titles, and dark iconography |
| Mist Tile | `#f1f1f1` | `--color-mist-tile` | Commenter strips, quiet linked-content tiles, and secondary surface blocks |
| Lilac Wash | `#e4eaff` | `--color-lilac-wash` | Pale icon tiles and restrained highlighted utility surfaces |
| Divider Ash | `#eaeaea` | `--color-divider-ash` | Hairline borders, search-field outlines, footer base surface, and quiet separators |
| Metadata Gray | `#999999` | `--color-metadata-gray` | Film metadata, timestamps, muted helper copy, and inactive supporting labels |
| Lavender Projector | `#a77eff` | `--color-lavender-projector` | Brand mark, section-icon graphics, and large featured violet fields that punctuate the monochrome catalog |
| Ultraviolet Type | `#6c00f4` | `--color-ultraviolet-type` | Submission and account-label text, violet icon details, and brand-word emphasis against pale lilac surfaces |

## Tokens — Typography

### CooperHewitt — The editorial voice: use 800 at 54px for section and hero displays, 700 at 32px for footer calls, 700 at 18px for film titles, and 300 at 16px for bylines and reading copy. The condensed, rounded grotesk makes oversized titles feel like festival-program cover lines rather than generic product headings. · `--font-cooperhewitt`
- **Substitute:** Barlow Semi Condensed
- **Weights:** 300, 500, 600, 700, 800
- **Sizes:** 14px, 16px, 18px, 24px, 32px, 54px
- **Line height:** 0.88, 1.00, 1.20, 1.25, 1.30, 1.40, 1.50, 1.70
- **Letter spacing:** Normal for section displays; 0.6px at 32px and 54px display treatments.
- **Role:** The editorial voice: use 800 at 54px for section and hero displays, 700 at 32px for footer calls, 700 at 18px for film titles, and 300 at 16px for bylines and reading copy. The condensed, rounded grotesk makes oversized titles feel like festival-program cover lines rather than generic product headings.

### JetBrainsMono — Use for all catalog metadata, genres, durations, navigation, utility buttons, and compact labels. Its 800 uppercase navigation at 14px with wide tracking makes the film archive feel indexed and machine-set beside the expressive CooperHewitt titles. · `--font-jetbrainsmono`
- **Substitute:** IBM Plex Mono
- **Weights:** 300, 400, 700, 800
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.00, 1.30, 1.40, 1.50, 1.70, 2.13, 2.44
- **Letter spacing:** 0.14px at 12px metadata; 1.12px at 14px uppercase navigation and buttons.
- **Role:** Use for all catalog metadata, genres, durations, navigation, utility buttons, and compact labels. Its 800 uppercase navigation at 14px with wide tracking makes the film archive feel indexed and machine-set beside the expressive CooperHewitt titles.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| film-metadata | JetBrainsMono | 300 | 12px | 1.4 | 0.144px | `--text-film-metadata` |
| nav-label | JetBrainsMono | 800 | 14px | 1 | 1.12px | `--text-nav-label` |
| body | CooperHewitt | 300 | 16px | 1.4 | 0px | `--text-body` |
| film-title | CooperHewitt | 700 | 18px | 1.3 | 0px | `--text-film-title` |
| footer-heading | CooperHewitt | 700 | 32px | 1.5 | 0.608px | `--text-footer-heading` |
| hero-display | CooperHewitt | 800 | 54px | 1 | 0.594px | `--text-hero-display` |
| section-display | CooperHewitt | 800 | 54px | 0.88 | 0px | `--text-section-display` |

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
| 40 | 40px | `--spacing-40` |
| 60 | 60px | `--spacing-60` |
| 64 | 64px | `--spacing-64` |
| 140 | 140px | `--spacing-140` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 8px |
| icons | 9999px |
| pills | 9999px |
| badges | 0px |
| inputs | 5px |
| buttons | 5px |
| imageTiles | 0px |

### Layout

- **Section gap:** 27px
- **Card padding:** 16px
- **Element gap:** 16px

## Components

### Top Catalog Navigation
**Role:** Persistent public-site header

Use a #ffffff bar with a 1px #eaeaea bottom border. Set category and account labels in JetBrainsMono 14px/800, uppercase, 1.12px tracking, with #262626 text and 16px control gaps.

### Header Search Field
**Role:** Film, people, and festival search

Use a #ffffff input with a 1px #eaeaea border, 5px radius, and 14px horizontal padding. Keep placeholder text muted in #999999 and use a compact #262626 search icon.

### Lavender Submission Button
**Role:** Header submission link

Set the control on #e4eaff with #6c00f4 JetBrainsMono 14px/800 uppercase text at 1.12px tracking. Use a 5px radius and 4px 24px padding.

### Hero Spotlight Frame
**Role:** Featured-film introduction

Build a wide photographic frame with a black-to-transparent left overlay that leaves the film image visible on the right. Set all overlay copy in #ffffff: 24px/700 CooperHewitt for the spotlight line, 54px/800 at 1.0 line-height with 0.6px tracking for the title, and 12px/300 JetBrainsMono uppercase metadata.

### White Watch-Film Button
**Role:** Hero viewing control

Use a #ffffff rectangular control with #262626 JetBrainsMono 14px/800 uppercase copy and 1.12px tracking. Apply a 1px rgba(0,0,0,0.15) border, 5px radius, and 0px 20.88px padding; place a solid #262626 play triangle before the label.

### Hero Slide Dots
**Role:** Spotlight carousel pagination

Use small #ffffff and #999999 circular indicators with 9999px radius across the lower edge of the hero image. Keep the row tight on a 4px rhythm.

### Editorial Section Header
**Role:** Catalog section introduction

Pair a 54px/800 CooperHewitt #262626 heading at 0.88 line-height with an 8px-radius #e4eaff icon tile. Use #6c00f4 for the outlined section icon and place a JetBrainsMono uppercase see-all link nearby.

### Comment Column
**Role:** Recent audience-comment module

Use a text-first column with a CooperHewitt 18px/700 #262626 film title, 16px/300 #262626 comment copy, and 12px spacing between stacked text groups. Avoid card outlines around the main comment text.

### Commenter Activity Strip
**Role:** Compact commenter attribution

Place avatar, name, comment status, and timestamp in a #f1f1f1 strip with 5px radius and 16px padding. Use #262626 for the name and #999999 for compact supporting metadata.

### Film Thumbnail Card
**Role:** Horizontal editorial film catalog card

Use a sharp-cornered 16:9 still with no visible radius, then stack a #262626 CooperHewitt 18px/700 title, a smaller creator line, and #999999 JetBrainsMono 12px/300 uppercase genre/year/runtime metadata. Separate image and text with 8px, and retain 12px gaps between cards.

### See-All Text Link
**Role:** Section-level catalog expansion

Set this as #262626 JetBrainsMono uppercase text with wide 1.12px tracking and a compact right-pointing chevron. Keep the background transparent, borderless, and square-cornered.

### Circular Carousel Control
**Role:** Thumbnail-rail navigation

Use a #ffffff circular button with 50% radius, 8px padding, and a 1px #eaeaea border. Center a #262626 directional glyph within the control.

### Violet Join Banner
**Role:** Closing participation panel

Use a broad #a77eff featured field for the final invitation, with #ffffff CooperHewitt 32px/700 text at 48px line-height and 0.6px tracking. Keep the callout distinct from the #eaeaea footer base rather than carrying violet through every lower-page element.

### Pill Utility Marker
**Role:** Small icon or count control

Use 9999px radius with 8px padding for compact circular or pill utility controls. Keep the default surface #ffffff, text #262626, and border 1px #eaeaea.

## Do's and Don'ts

### Do
- Use #ffffff as the main page canvas and #262626 for all default reading and heading text.
- Set section displays in CooperHewitt 54px/800; use 0.88 line-height for the compact editorial heading treatment.
- Set film titles in CooperHewitt 18px/700 and catalog metadata in JetBrainsMono 12px/300 uppercase with 0.14px tracking.
- Use JetBrainsMono 14px/800 uppercase with 1.12px tracking for navigation and button labels.
- Use 5px radius for rectangular buttons and inputs, 8px for pale icon tiles, and 9999px only for circular or pill utilities.
- Keep film stills sharp-cornered and separate thumbnail cards with 12px gaps.
- Reserve #6c00f4 text and #a77eff fields for brand navigation, submission language, and section-icon punctuation.

### Don't
- Do not use #a77eff as a universal filled primary-button background; public viewing controls are #ffffff with #262626 text.
- Do not round film thumbnails, poster stills, or horizontal catalog cards beyond the 0px image-tile treatment.
- Do not replace JetBrainsMono metadata with CooperHewitt or remove its uppercase 0.14px tracking at 12px.
- Do not use a generic 16px/600 sans-serif for section headers; use CooperHewitt 54px/800.
- Do not use shadows to turn every catalog item into a floating card; use #eaeaea borders and #f1f1f1 surface blocks.
- Do not introduce saturated colors beyond Lavender Projector #a77eff and Ultraviolet Type #6c00f4.
- Do not apply pill radii to rectangular navigation, search, or submission controls; retain the 5px corner geometry.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | White Screen | `#ffffff` | Primary navigation and catalog canvas. |
| 1 | Mist Tile | `#f1f1f1` | Commenter strips and subdued linked-content surfaces. |
| 2 | Lilac Wash | `#e4eaff` | Pale icon tiles and submission-control surface. |
| 3 | Divider Ash | `#eaeaea` | Footer base, borders, and surface transitions. |
| 4 | Lavender Projector | `#a77eff` | Large featured brand panel. |

## Elevation

Keep the catalog largely flat: hierarchy comes from photographic contrast, surface shifts, and 1px #eaeaea or rgba(0,0,0,0.15) borders. Where an icon needs separation, use the restrained 0 2px 0 rgba(0,0,0,0.25) drop-shadow rather than diffuse card shadows.

## Imagery

Photography is the primary visual language: full-bleed cinematic stills lead the hero, while smaller raw rectangular film frames form dense horizontal editorial rails. Images are dark, moody, and narrative rather than lifestyle-oriented; the hero uses a black left-side overlay so white text can sit directly on the still. Graphics are limited to compact violet outlined section icons, mono play and arrow glyphs, and the lavender wordmark; imagery occupies large horizontal bands but text remains the organizing structure.

## Layout

The page begins with a shallow full-width white navigation bar, then a full-bleed cinematic spotlight image with left-aligned white editorial copy over a dark gradient. Below, the site becomes a broad white catalog: titled modules sit in a vertical sequence, recent comments use multiple text columns, and film programs run as wide horizontal thumbnail rails that visibly continue beyond the viewport. Section headers are left-aligned with a colored icon tile and a compact see-all link; the closing area separates a violet invitation panel from a quieter #eaeaea footer surface. The information density is comfortable inside modules, but the horizontal rails are deliberately compact and archive-like.

## Agent Prompt Guide

Quick Color Reference:
- White Screen: #ffffff — Page backgrounds, navigation surface, hero utility buttons, and light text over photographic imagery
- Charcoal Ink: #262626 — Primary headings, body copy, navigation labels, film titles, and dark iconography
- Mist Tile: #f1f1f1 — Commenter strips, quiet linked-content tiles, and secondary surface blocks
- Lilac Wash: #e4eaff — Pale icon tiles and restrained highlighted utility surfaces
- Divider Ash: #eaeaea — Hairline borders, search-field outlines, footer base surface, and quiet separators
- Metadata Gray: #999999 — Film metadata, timestamps, muted helper copy, and inactive supporting labels
- Lavender Projector: #a77eff — Brand mark, section-icon graphics, and large featured violet fields that punctuate the monochrome catalog
- Ultraviolet Type: #6c00f4 — Submission and account-label text, violet icon details, and brand-word emphasis against pale lilac surfaces

Create a full-bleed featured-film hero using a dark cinematic still, a black left overlay, #ffffff CooperHewitt 54px/800 title text at 1.0 line-height with 0.6px tracking, and #ffffff JetBrainsMono 12px/300 uppercase metadata with 0.14px tracking.
Create a catalog section header on White Screen with an 8px Lilac Wash icon tile, Ultraviolet Type outlined icon, and a Charcoal Ink CooperHewitt 54px/800 heading at 0.88 line-height.
Create a horizontal film rail of sharp 0px-corner stills, 12px card gaps, Charcoal Ink CooperHewitt 18px/700 titles, and Metadata Gray JetBrainsMono 12px/300 uppercase film details.
Create a Lavender Projector closing banner with #ffffff CooperHewitt 32px/700 text at 48px line-height and 0.6px tracking, above a Divider Ash footer surface.

## Similar Brands

- **MUBI** — Shares the editorial cinema catalog structure of prominent film stills, restrained metadata, and text-led curation.
- **Letterboxd** — Shares the film-community pattern of activity commentary paired with title-centric browsing modules.
- **NOWNESS** — Shares the use of full-width moody film imagery as the dominant entry point before editorial content modules.
- **FilmFreeway** — Shares festival and filmmaker utility navigation, but Shortverse expresses it with condensed editorial display type and violet brand punctuation.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-white-screen: #ffffff;
  --color-charcoal-ink: #262626;
  --color-mist-tile: #f1f1f1;
  --color-lilac-wash: #e4eaff;
  --color-divider-ash: #eaeaea;
  --color-metadata-gray: #999999;
  --color-lavender-projector: #a77eff;
  --color-ultraviolet-type: #6c00f4;

  /* Typography — Font Families */
  --font-cooperhewitt: 'CooperHewitt', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-jetbrainsmono: 'JetBrainsMono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-film-metadata: 12px;
  --leading-film-metadata: 1.4;
  --tracking-film-metadata: 0.144px;
  --text-nav-label: 14px;
  --leading-nav-label: 1;
  --tracking-nav-label: 1.12px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-film-title: 18px;
  --leading-film-title: 1.3;
  --tracking-film-title: 0px;
  --text-footer-heading: 32px;
  --leading-footer-heading: 1.5;
  --tracking-footer-heading: 0.608px;
  --text-hero-display: 54px;
  --leading-hero-display: 1;
  --tracking-hero-display: 0.594px;
  --text-section-display: 54px;
  --leading-section-display: 0.88;
  --tracking-section-display: 0px;

  /* Typography — Weights */
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-extrabold: 800;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-140: 140px;

  /* Layout */
  --section-gap: 27px;
  --card-padding: 16px;
  --element-gap: 16px;

  /* Border Radius */
  --radius-md: 5px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  /* Named Radii */
  --radius-cards: 8px;
  --radius-icons: 9999px;
  --radius-pills: 9999px;
  --radius-badges: 0px;
  --radius-inputs: 5px;
  --radius-buttons: 5px;
  --radius-imagetiles: 0px;

  /* Surfaces */
  --surface-white-screen: #ffffff;
  --surface-mist-tile: #f1f1f1;
  --surface-lilac-wash: #e4eaff;
  --surface-divider-ash: #eaeaea;
  --surface-lavender-projector: #a77eff;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-white-screen: #ffffff;
  --color-charcoal-ink: #262626;
  --color-mist-tile: #f1f1f1;
  --color-lilac-wash: #e4eaff;
  --color-divider-ash: #eaeaea;
  --color-metadata-gray: #999999;
  --color-lavender-projector: #a77eff;
  --color-ultraviolet-type: #6c00f4;

  /* Typography */
  --font-cooperhewitt: 'CooperHewitt', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-jetbrainsmono: 'JetBrainsMono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-film-metadata: 12px;
  --leading-film-metadata: 1.4;
  --tracking-film-metadata: 0.144px;
  --text-nav-label: 14px;
  --leading-nav-label: 1;
  --tracking-nav-label: 1.12px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-film-title: 18px;
  --leading-film-title: 1.3;
  --tracking-film-title: 0px;
  --text-footer-heading: 32px;
  --leading-footer-heading: 1.5;
  --tracking-footer-heading: 0.608px;
  --text-hero-display: 54px;
  --leading-hero-display: 1;
  --tracking-hero-display: 0.594px;
  --text-section-display: 54px;
  --leading-section-display: 0.88;
  --tracking-section-display: 0px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-60: 60px;
  --spacing-64: 64px;
  --spacing-140: 140px;

  /* Border Radius */
  --radius-md: 5px;
  --radius-lg: 8px;
  --radius-full: 9999px;
}
```
