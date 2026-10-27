# Volume — Style Reference
> gallery wall with whispers — editorial restraint on paper-white canvas, the chrome is invisible, the imagery is the only color

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Volume reads as an editorial gallery for design publications: full-bleed photographic campaigns with whisper-light Messina Sans headlines floating over image backgrounds. The chrome itself is nearly invisible — paper-white canvas, charcoal type, hairline borders, and a small set of pill-shaped status tags that carry the only chromatic punctuation. The extreme light weights (300/350) and tight negative tracking create a refined, magazine-page atmosphere where negative space and imagery do the heavy lifting. Every surface favors restraint and breathing room, letting the projects — not the interface — command attention.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#272727` | Primary text, nav, footer text, dark pill tags (funded, successful) — the workhorse near-black that grounds every layout |
| Graphite | `#717171` | Secondary text, hairline borders on cards, images, and inputs — the quiet structural neutral |
| Ash | `#949494` | Tertiary text, subtle borders, disabled or muted states |
| Fog | `#cdcccc` | Light placeholder text, decorative dividers on dark surfaces |
| Paper | `#ffffff` | Page canvas, card surfaces, text on dark/image overlays — the dominant background across all sections |
| Void | `#000000` | Occasional deep surface for emphasis blocks, SVG fills |
| Ember | `#e75a00` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Signal Red | `#c52910` | Accent — alert and availability tags, sits between Ember and Brick in the warm surface stack |
| Brick | `#962921` | Red wash for highlight backgrounds, decorative bands, and soft emphasis behind content |

## Typography

### Messina Sans — Single-family system covering nav, body, display, and UI. The signature choice is using weight 300/350 everywhere — headlines whisper rather than shout, creating editorial restraint. 50px and 80px display sizes with tight tracking (-0.02em) float over full-bleed campaign imagery; 14–20px handles body and UI; 0.07em wide tracking is used for eyebrow labels and tag text.
- **Substitute:** Inter (weight 300) or Söhne Buch
- **Weights:** 300, 350
- **Sizes:** 14px, 18px, 20px, 32px, 50px, 80px
- **Line height:** 1.00, 1.18, 1.40, 2.00
- **Letter spacing:** -0.02em for display/headlines, 0.07em for small UI labels and tags

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.4 | 0.98px |
| body | — | — | 18px | 1.4 | -0.36px |
| subheading | — | — | 20px | 1.4 | -0.4px |
| heading-sm | — | — | 32px | 1.18 | -0.64px |
| heading | — | — | 50px | 1.18 | -1px |
| display | — | — | 80px | 1 | -1.6px |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 80-120px
- **Card padding:** 30px
- **Element gap:** 10-15px

### Border Radius

- **tags:** 50px
- **cards:** 50px
- **buttons:** 50px

## Components

### Top Navigation Bar
**Role:** Minimal site chrome with centered primary links and account/cart on the right

White background, no border, ~30px vertical padding. Logo top-left at ~30px. Centered nav links (EXPLORE, ABOUT) in 14px Messina Sans weight 300, Ink (#272727), letter-spacing 0.07em uppercase. Right-aligned ACCOUNT and CART links in same style. No sticky behavior implied; transparent over hero images.

### Full-Bleed Campaign Hero
**Role:** Project showcase card with photographic background and overlaid text

Full-viewport-width image background, 500–600px tall. White text overlay bottom-left at 30px from edge. Project title at 50px Messina Sans weight 300, white, letter-spacing -1px. Subtitle (author name) at 20px weight 300, white. Below subtitle: pill-shaped status tags with 10px gap. No gradient overlay; relies on image contrast for legibility.

### Dark Status Pill (Funded/Successful)
**Role:** Indicates funding milestone reached

50px border-radius (full pill). Ink (#272727) background, white text, 14px Messina Sans weight 300, letter-spacing 0.07em uppercase. Horizontal padding 15px, vertical padding 8–10px. No border.

### Warm Status Pill (Limited/Available)
**Role:** Indicates scarcity or availability state

50px border-radius. Signal Red (#c52910) or Ember (#e75a00) background, white text, 14px Messina Sans weight 300, letter-spacing 0.07em uppercase. Same dimensions as dark pill; distinguished only by warm fill.

### Editorial Headline Block
**Role:** Large typographic statement below hero sequences

White background, generous top/bottom padding (80–120px). Headline at 80px Messina Sans weight 300, Ink color, letter-spacing -1.6px, line-height 1.0. Max-width ~800px left-aligned with 30px page-edge padding. No supporting imagery — pure typography breathing.

### Hairline-Bordered Card
**Role:** Content cards for supplementary project info

White background, 1px Graphite (#717171) border, 50px border-radius, 30px internal padding. Content stacks vertically with 10–15px gaps. No shadow; the border alone defines the card edge.

### Tag Input
**Role:** Search or filter field

Transparent or white background, 1px Graphite (#717171) border, 17px horizontal padding × 13px vertical padding. 14px Messina Sans weight 300, Ink text, Fog (#cdcccc) placeholder. No focus ring color specified; relies on border.

### Footer
**Role:** Minimal site footer

White background, 30px padding. Ink text at 14px weight 300, letter-spacing 0.07em uppercase for links. Centered or left-aligned with no visual divider from content above.

### Cookie Consent Bar
**Role:** Fixed-bottom compliance notice

White or very light background, full-width, ~60px tall. Left-aligned body text at 14px with a link to Privacy policy. Right-aligned two buttons: 'Preferences' (outlined, Ink border) and 'Accept' (filled Ink background, white text). Both buttons at 50px radius, 15px horizontal × 8px vertical padding.

## Do's and Don'ts

### Do
- Use Messina Sans at weight 300 or 350 for all text — heavier weights break the editorial restraint
- Set pill tags, buttons, and status indicators to 50px border-radius for the full pill shape
- Apply -0.02em letter-spacing on display sizes (50px+) and 0.07em on small UI labels and uppercase tags
- Use full-bleed photographic backgrounds for hero sections — never flat color blocks for campaign showcases
- Keep the page canvas Paper (#ffffff) and let imagery be the only source of color in a section
- Stack pill tags with 10px gaps beneath the hero subtitle, never float them separately
- Reserve warm accent colors (Ember, Signal Red, Brick) exclusively for status and availability tags

### Don't
- Do not use type weights above 350 — bold or semibold text violates the whisper-light voice
- Do not use sharp corners on cards, tags, or buttons — 50px radius is system-wide
- Do not add drop shadows to cards or elevated surfaces — borders alone define edges
- Do not apply the warm accent palette to buttons, headings, or icons — those are strictly for status tags
- Do not constrain heroes to a max-width — campaign imagery must span the full viewport
- Do not use system fonts or sans-serif alternatives at different weights as a substitute for Messina Sans's specific light cut
- Do not introduce gradients — the system is flat color + photography only

## Elevation

The system is deliberately shadowless. Elevation is communicated through hairline borders (1px Graphite #717171) and the 50px pill radius rather than box-shadow. This preserves the flat editorial print feel — cards look like printed inserts, not floating panels.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, body backgrounds, editorial text sections
- **Card** (`#ffffff`) — Bordered content cards on Paper, defined by hairline Graphite border rather than fill
- **Overlay** (`#000000`) — Text on photographic backgrounds relies on image contrast, not a scrim

## Imagery

Photography dominates as full-bleed campaign backgrounds — no illustration, no product renders, no abstract graphics within the UI itself. The geometric teal illustration in the first hero is part of the project's own artwork, not system chrome. Images are large-format editorial: architectural, typographic, atmospheric (night scenes, workshop interiors). No duotone or color treatment is applied at the system level; photographs appear in their native tonal range. Iconography is minimal to absent in the visible chrome.

## Layout

Full-bleed, viewport-spanning campaign heroes stack vertically with no gaps between them. Each hero is ~500–600px tall with bottom-left text overlay. Below the hero sequence, a spacious white editorial section holds a single large headline at 80px, left-aligned with generous left padding (~30px). Navigation is a thin top bar — logo top-left, centered links, account/cart top-right — with no sticky behavior. The overall rhythm alternates between immersive photographic full-bleed blocks and quiet typographic white space, creating a gallery-walk cadence rather than a scrollable feed.

## Similar Brands

- **Kickstarter** — Same full-bleed campaign hero with overlaid title/subtitle and pill-shaped status badges beneath
- **It's Nice That** — Editorial gallery rhythm alternating between large photography and quiet white typographic space
- **Unseen** — Design-publishing sensibility with restrained chrome, letting project imagery carry the visual weight
- **Drip** — Single-light-weight sans-serif system with pill UI elements and minimal interface decoration
