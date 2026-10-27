# Monotype. — Style Reference
> Curated typography showcase on paper. Monotype's interface behaves like a gallery wall: white surfaces, hairline dividers, generous whitespace, and type itself as the only ornament.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Monotype's design is an editorial type museum on white: the type is the artifact, the chrome recedes. The interface is overwhelmingly monochrome — near-black ink (#1e242c) on paper-white, with hairline gray dividers and a single saturated blue reserved exclusively for conversion. Components are low-elevation and flat: thin 1px borders instead of shadows, modest 8px radii on controls, generous 16-24px internal padding. Typography is the hero: a custom HelveticaNow family handles body, nav, and display, with a -0.02em tracking on bold labels that signals the brand's typographic pedigree. Layout breathes — comfortable 8px base grid, 16px element gaps, wide section spacing — letting featured type specimens and photography carry visual weight without competition from the UI.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#1e242c` | Primary text, nav borders, icon strokes, card borders — near-black with a barely-there cool tint reads as a refined alternative to pure black |
| Steel | `#576579` | Secondary text, muted nav links, subtle borders — the workhorse mid-gray for everything that must be quieter than body copy |
| Paper | `#ffffff` | Page canvas, card surfaces, button text on filled controls — the dominant surface |
| Mist | `#e7eaee` | Nav dividers, subtle section separators — the lightest functional border |
| Fog | `#dbdfe5` | Card borders, content block outlines — slightly darker than Mist for card-level separation |
| Ash | `#cfd5dd` | Button focus shadow, input hover rings — the mid-neutral for interaction feedback |
| Signal Blue | `#1a73e8` | Blue action color for filled buttons, selected navigation states, and focused conversion moments. |
| Coal | `#000000` | Icon fills, SVG strokes — true black reserved for graphic assets only, not text |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### HelveticaNowMTDisplayMedium — Display headlines (page titles like 'Variable fonts') — the largest voice on the page, 57px with tight 1.12 line-height
- **Substitute:** Inter Tight, Helvetica Neue Display
- **Weights:** 500
- **Sizes:** 57px
- **Line height:** 1.12
- **Letter spacing:** normal

### HelveticaNowMTTextRegular — Body copy, nav items, buttons, article titles, card descriptions — the workhorse text family across 13/14/16px with line-heights that scale from tight nav (1.20) to generous article body (1.50)
- **Substitute:** Inter, Helvetica Neue
- **Weights:** 400
- **Sizes:** 13px, 14px, 16px
- **Line height:** 1.20-1.50

### HelveticaNowMTTextBold — Bold labels, active nav states, emphasized article titles — the -0.02em tracking is a brand signature: tight enough to read as deliberate typographic craft
- **Substitute:** Inter Bold, Helvetica Neue Bold
- **Weights:** 700
- **Sizes:** 13px, 16px
- **Line height:** 1.23-1.50
- **Letter spacing:** -0.02em

### HelveticaNowMTMicroRegular — Micro-copy, metadata, breadcrumb text, tag labels — 11px with 2.55 line-height for very fine annotations; 14px version for small UI labels
- **Substitute:** Inter, system-ui
- **Weights:** 400
- **Sizes:** 11px, 14px
- **Line height:** 1.45-2.55

### TypecaseVar — TypecaseVar — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 26px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 11px | 1.45 | 0px |
| caption | — | — | 13px | 1.2 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 26px | 1.2 | — |
| display | — | — | 57px | 1.12 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80-104px
- **Card padding:** 16-24px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **badges:** 8px
- **images:** 16px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary CTA Button
**Role:** High-emphasis conversion action

Filled #1a73e8 background, white text, 8px border-radius, 12px vertical / 24px horizontal padding. Uses HelveticaNowMTTextRegular at 16px weight 400. Single shadow: rgba(0,0,0,0.16) 0px 0px 2px 0px. Exclusively for 'Speak to sales' and similar conversion actions.

### Secondary Nav Button
**Role:** Navigation link in top bar

Transparent background, #1e242c text at 16px weight 400, no border, 12px horizontal padding. Hover/active states shift to #576579. Dropdown items use 8px radius container.

### Article Card
**Role:** Content card in resource/article grids

White surface, no shadow, 1px border in #dbdfe5 (Fog), 8px border-radius. 16px internal padding. Image at top with 16px border-radius. Title in HelveticaNowMTTextRegular 16px weight 400, #1e242c. No elevation — flat and editorial.

### Announcement Bar
**Role:** Top-of-page promotional strip

Full-width #1e242c background, white text at 14px, 8px vertical padding, centered. Used for Monotype Connect and similar announcements.

### Search Bar
**Role:** Global font/foundry search

White background, 1px border in #e7eaee, 8px radius, ~40px height. Placeholder text in #576579. No prominent focus ring — subtle interaction.

### Breadcrumb
**Role:** Page hierarchy indicator

11-14px HelveticaNowMTMicroRegular, #576579 text, separated by '/' delimiter. No background, sits above page title with minimal vertical padding.

### Tab Navigation
**Role:** Secondary navigation under page title

Horizontal row of text links in HelveticaNowMTTextRegular 16px, #576579 default, #1e242c active. No underline, no background — purely typographic state change. 8px vertical padding, 16-24px horizontal spacing.

### Tag Label
**Role:** Content categorization badge

Inline text label, 11-14px HelveticaNowMTMicroRegular, #576579. No background or border — just muted text reading 'Tag: Variable fonts' as a plain annotation.

### Footer
**Role:** Site-wide footer

Dark #1e242c background, white and #576579 text, 1px top border. Column-based link grid in HelveticaNowMTTextRegular at 14-16px.

### Hero Image
**Role:** Featured article or type specimen image

16px border-radius, no border, no shadow. Full-bleed within card padding. Images carry the visual weight — the UI around them stays invisible.

## Do's and Don'ts

### Do
- Use #1a73e8 (Signal Blue) only on primary conversion actions — never on links, icons, or decorative elements
- Set body text in HelveticaNowMTTextRegular at 16px with line-height 1.50 for article-level readability
- Use 8px border-radius for all controls (buttons, inputs, cards) and 16px for images
- Apply -0.02em letter-spacing on all bold-weight text (13px and 16px) — this tracking is a brand signature
- Use #1e242c (Ink) for all primary text and borders — avoid pure #000000 for text
- Maintain 16px as the standard element gap; jump to 24px only for major control padding
- Let images and type specimens carry visual weight — keep surrounding UI borderless or hairline-bordered

### Don't
- Never use Signal Blue for anything other than the primary CTA fill — it loses all impact if scattered across links and icons
- Don't apply shadows beyond the single subtle button shadow (rgba(0,0,0,0.16) 0px 0px 2px 0px) — the design is intentionally flat
- Don't use HelveticaNowMTDisplayMedium below 40px — the display family is calibrated for large sizes only
- Don't add backgrounds to tab or nav states — use only color/weight changes to indicate active
- Don't introduce additional border-radius values — the system is binary: 8px for UI, 16px for images
- Don't use chromatic colors for status indicators, badges, or tags — everything meta stays in the gray scale
- Don't compress section spacing below 80px — the editorial breathing room is part of the identity

## Elevation

- **Primary CTA Button:** `0px 0px 2px 0px rgba(0, 0, 0, 0.16)`

## Surfaces

- **Canvas** (`#ffffff`) — Page background — the dominant surface
- **Card** (`#ffffff`) — Content cards and article tiles — same white, delineated only by 1px #dbdfe5 border
- **Overlay** (`#1a73e8`) — Primary action button surface — the only filled control
- **Inverted** (`#1e242c`) — Announcement bar and footer — dark inverted band

## Imagery

Photography and type specimens dominate visual space. Article cards feature bold, full-bleed images — close-up product shots, bold typographic compositions, video stills, and type specimens at large scale. Images are tightly cropped with no decorative framing, using 16px border-radius to soften without ornament. No illustrations, no abstract graphics, no icons-as-decoration. The imagery is documentary: it shows the work (fonts, branding projects, type in use) rather than illustrating concepts. Color within images is unrestricted — bright greens, bold yellows, dramatic blacks — but the UI chrome around them stays completely neutral, making the images feel like editorial photography in a design magazine.

## Layout

Max-width contained at ~1280px, centered. Top: full-width dark announcement bar, then white nav bar with logo left, search center, nav items and blue CTA right. Hero zone: large left-aligned display headline with breadcrumb above and horizontal tab navigation below — no full-bleed image hero. Content flows as a 3-column card grid for articles, with each card stacking image over title. Generous vertical rhythm: 80-104px between major sections. Navigation is a single top bar with dropdown menus, no sticky behavior visible. The page is text-and-image dominant, not dashboard-dense — the layout follows editorial magazine conventions, not product UI conventions.

## Similar Brands

- **Google Fonts** — Same white-canvas editorial approach with a single blue accent for conversion; both treat type as the primary content
- **Type foundry sites (Hoefler & Co, Commercial Type)** — Same flat, image-forward editorial layout where type specimens and project photography dominate over UI chrome
- **It's Nice That** — Same magazine-style grid of editorial cards with generous whitespace and minimal UI ornamentation
- **Framer** — Same clean white canvas with a single chromatic action color and low-elevation flat components
