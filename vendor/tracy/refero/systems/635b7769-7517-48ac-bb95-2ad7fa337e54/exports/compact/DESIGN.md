# IFTTT — Style Reference
> Editorial darkroom with neon service tiles. A near-black gallery wall where each connected app brings its own paint.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

IFTTT reads as a dark editorial canvas punctuated by full-bleed brand-colored service tiles — the architecture is almost monochrome (#222222 canvas, white text, hairline borders) and then service tiles detonate in their native brand colors (Spotify green, YouTube red, Google blue). The visual system trusts geometric Avenir Next at confident sizes: 68px italic display heads with positive tracking, mid-weight body, and one-weight family across the whole stack. Primary action language is the pill: 100px radius, white fill, black text — repeated in inverse for the nav. Cards are flat, borderless, and color-as-surface rather than colored borders. The hero is a single dark band with centered display text and a solitary pill — no decoration, no gradient, no illustration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Charcoal | `#222222` | Page background, dark section bands, card surfaces on dark — the structural ground for 90% of the interface |
| Paper White | `#ffffff` | Primary text on dark, light section backgrounds, pill button fill, card backgrounds in light sections |
| Border Stone | `#333333` | Hairline dividers, card borders on dark surfaces, subtle structural lines |
| Muted Graphite | `#666666` | Secondary text, helper copy, muted metadata on light backgrounds |
| Whisper Gray | `#999999` | Tertiary text, icon fills, disabled states, low-emphasis borders |
| Fog Line | `#eeeeee` | Light-mode section dividers, ghost button borders, soft borders on white surfaces |
| IFTTT Signal Blue | `#0099ff` | Brand accent — primary highlights, featured service tiles, active indicators |
| Applet Green | `#2cbe60` | Green action color for filled buttons, selected navigation states, and focused conversion moments |
| Automate Violet | `#2c6efc` | Brand accent — Google service tiles, link emphasis, interactive hover on dark |
| Deep Navy | `#23448b` | Brand accent — secondary blue for service tile variants, subtle elevated surfaces |
| Alert Red | `#e44332` | Red action color for filled buttons, selected navigation states, and focused conversion moments |
| Forest Green | `#1d9a59` | Green action color for filled buttons, selected navigation states, and focused conversion moments |
| Ember Orange | `#ec7505` | Brand accent — RSS Feed tile, warm decorative accent |
| Pure Red | `#ff0000` | Brand accent — YouTube tile, high-saturation red service representation |
| Slack Plum | `#4a154b` | Brand accent — Slack tile, purple-pink service representation |
| Lime Pulse | `#8cc251` | Brand accent — secondary green for Android Device-adjacent tiles |
| Coral Warning | `#e8655c` | Red action color for filled buttons, selected navigation states, and focused conversion moments |
| Magenta Pop | `#e4405f` | Brand accent — Instagram tile, vivid pink-red service representation |

## Typography

### Avenir Next — Sole typeface across all surfaces. Geometric humanist sans with strong weight range from 400 (body) to 900 (display). The italic display treatment at 68px is the signature moment — confident, slightly editorial. Body holds 400–500, UI controls jump to 600, headings claim 700–800, display goes 800–900.
- **Substitute:** Nunito Sans, Mulish, or Avenir (standard) — match geometric humanist proportions
- **Weights:** 400, 500, 600, 700, 800, 900
- **Sizes:** 14, 15, 16, 18, 20, 24, 25, 28, 29, 32, 36, 38, 43, 48, 68
- **Line height:** 1.00–3.00 range; display 1.11–1.20, body 1.32–1.50, large block text 1.71–1.90
- **Letter spacing:** 0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | 0.28px |
| body | — | — | 16px | 1.5 | 0.32px |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 32px | 1.32 | — |
| heading-lg | — | — | 48px | 1.19 | 0.96px |
| display | — | — | 68px | 1.11 | 1.36px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 8px
- **badges:** 8px
- **inputs:** 8px
- **buttons:** 100px
- **filterPills:** 100px
- **serviceTiles:** 8px

## Components

### Pill Primary Button
**Role:** Hero and nav primary action — the only button shape in the system

White fill (#ffffff), black text (#222222), 100px border-radius, 18px horizontal × 12px vertical padding, Avenir Next weight 600 at 18px. No border, no shadow. Text centered, single line. The 'Start today' and 'Get started' buttons. Inverted variant swaps to #222222 fill with #ffffff text.

### Pill Dark Button
**Role:** Dark-mode primary action on light sections

#222222 fill, #ffffff text, 100px radius, 18px×12px padding, Avenir Next 600 at 18px. The 'Join today' button. Functions as the inverse of the white pill.

### Service Brand Tile
**Role:** Grid cell representing a connected service in the '1000+ services' section

Flat brand-color fill (e.g. #1d9a59 for Spotify, #e44332 for YouTube), 8px border-radius, ~24px padding, white icon (32–48px) top-left, white service name (Avenir Next 600, 16–18px) bottom-left. No border, no shadow, no gradient. Color IS the surface — the tile's identity comes entirely from its fill color.

### Applet Card
**Role:** Showcase card for a ready-made automation in the 'Connect an automation' grid

Brand-color fill matching the triggering service (green for Spotify, blue for Google, etc.), 8px radius, ~24px padding, white service icon at top, bold white headline (Avenir Next 700, 24px), small service-name attribution, user-count badge (white pill with brand-color text or inverse) at bottom. Pro badges appear as small white pills bottom-right.

### Category Filter Pill
**Role:** Tab-like filter for browsing Applets

8px radius for non-active, 100px radius for active. Inactive: transparent fill, #222222 text, 1px #eeeeee border. Active: #222222 fill, #ffffff text. Avenir Next 500–600 at 16px. Padding ~12px×16px.

### Search Bar
**Role:** Global service/applet search in nav

Dark surface (#222222 or transparent on dark), 1px white/gray border (#666666 or #ffffff), 8px radius, 40–48px height, white placeholder text at 16px Avenir Next 400, search icon prefix in white.

### Navigation Bar
**Role:** Top-level site navigation

Dark background (#222222) spanning full width, 64–72px height. IFTTT wordmark left (Avenir Next 800–900 italic, white), search bar center-left, nav links (Explore, Plans, Log In — Avenir Next 500, white), white pill button right.

### Usage Count Badge
**Role:** Social proof indicator on Applet cards

Small white pill or text, Avenir Next 500 at 12–14px, white on brand-color card surface. Shows install count (e.g. '124K'). No background, just white text with subtle icon.

### Section Header Block
**Role:** Title + subtitle for content bands

Centered on dark bands, left-aligned on light bands. Avenir Next 700 at 32–36px for title, 400 at 16–18px for subtitle. White on dark, #222222 on light.

### Wordmark Logo
**Role:** Brand identity in nav

'IFTTT' in Avenir Next 800–900 italic, white, ~28–32px. The italic treatment at this weight is distinctive — it reads as a masthead, not a tech logo.

### Pro Badge
**Role:** Premium feature indicator on Applet cards

Small white pill, ~6px×10px padding, Avenir Next 700 at 10–12px in #222222. 4px radius. Sits at bottom-right of Applet cards.

## Do's and Don'ts

### Do
- Use 100px border-radius for every button and active filter pill — the pill shape is the system's signature action geometry
- Alternate between #222222 dark bands and #ffffff light bands to create section rhythm; never stack two dark bands or two light bands consecutively
- Let brand colors serve as full card surfaces (fill, not accent) — a Spotify card should be entirely green, not white with a green border
- Set display headlines at 68px Avenir Next 800–900 italic on dark — this is the one moment typography goes expressive
- Use 8px radius for all cards, inputs, badges, and non-pill buttons consistently
- Keep the page 1% chromatic globally — chromatic color earns its space by representing a specific service brand
- Use #222222 as the dark canvas; never substitute pure #000000 — the slight warmth is intentional

### Don't
- Don't add drop shadows to cards or service tiles — depth is communicated by section banding and color contrast alone
- Don't use #000000 for any surface or text — always use #222222 or a warm near-black
- Don't mix two pill and non-pill button styles on the same page — if a button isn't a pill, rethink the affordance
- Don't apply chromatic colors as borders, text accents, or hover tints on neutral surfaces — they belong on full service tiles only
- Don't use system sans-serifs (Inter, Helvetica, Arial) — Avenir Next's italic display and geometric body are the voice
- Don't add gradients, glassmorphism, or blur effects to any surface — the system is intentionally flat
- Don't place colored cards on white backgrounds without a 8px radius and brand-color edge definition — flat color needs geometric containment

## Elevation

- **Interactive links/buttons on dark:** `rgba(0, 0, 0, 0.24) 0px 1.5px 6px 0px`

## Surfaces

- **Canvas Charcoal** (`#222222`) — Base page background, hero band, dark service-grid section
- **Border Stone** (`#333333`) — Hairline card edges and structural dividers on dark canvas
- **Paper White** (`#ffffff`) — Light content sections, light-mode card surfaces, pill button fill
- **Fog Line** (`#eeeeee`) — Subtle elevated card background within white sections

## Imagery

Photography and illustration are essentially absent. The visual system is built from typography, color tiles, and iconography only. Service brand tiles use simple monochrome white service icons (Spotify, WU, Google Calendar, YouTube, etc.) rendered as flat glyphs — no photography, no 3D renders, no illustrations. The only 'imagery' is the service icon set, which is always white on brand-color fill. No lifestyle photography, no product shots, no people.

## Layout

Full-width dark hero band (100% width, ~500–600px height) with centered headline + subtext + single pill CTA. Transitions to a white content section with left-aligned headings. The 'Connect an automation' section is a 4-column card grid on white, preceded by a centered row of category filter pills. The '1000+ services' section flips back to a full-width dark band containing a 6-column grid of colorful service tiles, capped with a centered pill CTA. Navigation is a fixed top bar spanning full width. The pattern: dark band → light content → dark service grid → light content, with the dark bands acting as visual punctuation. Max content width ~1200px centered within full-bleed dark/light bands. Section gaps of ~64px create breathing room between bands.

## Similar Brands

- **Zapier** — Same dark-canvas + colorful service-tile grid approach for showcasing connected apps, with the service's native brand color filling each card
- **Make (Integromat)** — Dark interface with scattered brand-color module tiles and a geometric sans-serif typeface carrying the same editorial confidence
- **Notion** — Alternating dark/white section bands with centered display headlines, near-flat surfaces, and a single weight-family geometric sans
- **Linear** — Dark canvas dominance with 1% chromatic restraint, 8px radius as the universal card radius, and bold italic display moments
