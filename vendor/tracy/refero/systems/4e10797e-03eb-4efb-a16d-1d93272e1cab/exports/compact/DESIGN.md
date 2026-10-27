# Luro — Style Reference
> Crimson laser chamber. Deep obsidian walls, every surface ringed in hot pink plasma.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Luro operates as a dark cinematic showcase where the product floats on near-obsidian canvas and every card emits a hot crimson halo. The signature isn't a surface color — it's a shadow: a wide pink plasma glow that lifts cards off the void and makes the UI feel like neon signage in a dark room. Typography is geometric and tightly tracked in Graphik, with negative letter-spacing pulling the large display headlines into a single dense block. Layout is spacious and centered, with a product screenshot hero above a 4-up media grid, then alternating feature blocks. The visual economy is extreme: a few card variants, a pill button, and one consistent glow shadow do all the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian Void | `#10020a` | Page canvas and primary surface background — the near-black that everything floats above |
| Dark Mulberry | `#1e0313` | Elevated card surface — the second tier above the canvas, slightly warmed by the glow that surrounds it |
| Frost White | `#ffffff` | Primary text, hairline borders, nav links, and icon fills on dark surfaces |
| Soft Chalk | `#f2f2f2` | Light surface fill for product mockup cards and inner product UI panels |
| Plasma Pink | `#ff0068` | Red supporting accent for decorative details and low-frequency emphasis |
| Deep Crimson | `#91013d` | Wide outer glow color — the broad pink wash that bleeds 99px from card edges into the void |
| Ruby Shadow | `#700130` | Largest ambient glow spread — the most diffuse layer of the multi-stop shadow stack |
| Magenta Wine | `#9f0142` | Secondary glow tint on product image frames; the slightly warmer pink in the shadow gradient |

## Typography

### Graphik Web — Primary typeface for all UI — nav, body, buttons, headings, and the display hero. Negative letter-spacing tightens every size from 14px up; the 104px display sits at -0.046em so the two-line headline reads as a single dense block. Weight 600 is the workhorse for nav and button labels, 700 for hero, 400 for body.
- **Substitute:** Inter, Söhne, Geist
- **Weights:** 400, 600, 700
- **Sizes:** 14, 16, 18, 28, 34, 40, 51, 62, 104
- **Line height:** 1.20, 1.25, 1.30, 1.50, 1.65, 2.00
- **Letter spacing:** -0.046em at 104px, -0.038em at 62px, -0.032em at 51px, -0.025em at 40px, -0.021em at 34px, -0.012em at 14-18px
- **OpenType features:** `"ss01" on, "cv11" on`

### Graphik Cond Web — Rare display variant for the gradient section heading — the condensed width creates a horizontal banner feel distinct from the upright display sizes
- **Substitute:** Inter Tight, Barlow Condensed
- **Weights:** 400
- **Sizes:** 38
- **Line height:** 1.00
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | -0.012px |
| body-sm | — | — | 16px | 1.5 | -0.012px |
| body | — | — | 18px | 1.5 | -0.012px |
| subheading | — | — | 28px | 1.3 | -0.021px |
| heading-sm | — | — | 34px | 1.25 | -0.021px |
| heading | — | — | 40px | 1.2 | -0.025px |
| heading-lg | — | — | 51px | 1.2 | -0.032px |
| display | — | — | 62px | 1.1 | -0.038px |
| display-lg | — | — | 104px | 0.95 | -0.046px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **cards:** 24px
- **images:** 24px
- **inputs:** 12px
- **buttons:** 180px
- **featureBlock:** 24px

## Components

### Glow Product Card
**Role:** Primary card pattern — a product screenshot or feature visual on a dark surface ringed by a pink plasma halo

Obsidian or Mulberry card surface (#10020a or #1e0313), 24px radius, 32px internal padding, box-shadow stack: 0 0 33px 0 rgba(255,0,104,0.54) and 0 0 99px -21px rgba(255,0,104,0.4). Contains a product image at 24px radius, optional caption, and play-button affordance centered over the image.

### Glow Feature Block
**Role:** Two-column feature panel — illustration on the left, title and description on the right

Mulberry card surface (#1e0313), 24px radius, 32px padding, 80px ambient glow: 0 0 90px 0 rgba(255,0,104,0.36). Title at 28-34px Graphik 700 in Frost White, description at 16-18px Graphik 400 in Frost White at 70% opacity.

### Pill Button
**Role:** Primary action shape — fully rounded pill with the same glow treatment as cards

180px border-radius (extreme pill), 14px vertical and 24px horizontal padding, Graphik 600 at 16px, Frost White text on Mulberry surface. Box-shadow: 0 0 33px 0 rgba(255,0,104,0.54) plus the wide 99px spread. Used sparingly — the site is primarily showcase, not action-driven.

### Ghost Nav Link
**Role:** Text-only navigation item, no fill or border

Graphik 600 at 16px, Frost White, no background, no border. Top-right 'Blog' link uses this treatment; active state is the same weight and color (the nav is intentionally flat).

### Brand Lockup
**Role:** Wordmark + symbol in the top-left of every page

White mark in a 36px circular container with a thin Frost White hairline border, followed by 'LURO' in Graphik 700 at 18-20px, letter-spacing -0.021em, Frost White. The circular mark has the same hairline ring used on avatar and badge containers throughout.

### Stat Badge (Floating Metric Card)
**Role:** Compact data badge floating beside the hero — the '91% Design system adoption' pattern

Mulberry surface (#1e0313), 24px radius, 16-20px padding, pink plasma glow. Contains a circular progress ring (2px stroke, Plasma Pink #ff0068) and a Graphik 700 number in Frost White with a 14px Graphik 400 label in Frost White at 60% opacity.

### Product Video Tile
**Role:** Clickable video thumbnail in the 4-up media grid

Product screenshot on a Mulberry surface, 24px radius, centered circular play button at 48px diameter — solid Obsidian fill with a Frost White triangle. The same two-stop glow stack as the Glow Product Card.

### Section Heading (Gradient)
**Role:** Display heading for mid-page sections — 'Built for your workflow' pattern

Graphik Cond Web 400 at 38px, line-height 1.0, no letter-spacing adjustment. Fill is a horizontal pink gradient (Plasma Pink #ff0068 to a lighter rose), with a soft horizontal glow band running behind the text. Centered above the section description at 18px Graphik 400 in Frost White at 60% opacity.

### Hairline Divider
**Role:** 1px separator between nav items, card edges, and footer sections

1px solid Frost White at 8-12% opacity, full-width or 24px rounded, no shadow. The only non-glow structural separator in the system.

## Do's and Don'ts

### Do
- Use the two-stop pink plasma shadow stack (0 0 33px 0 rgba(255,0,104,0.54) + 0 0 99px -21px rgba(255,0,104,0.4)) on every card and image — that halo IS the elevation language
- Set border-radius to 24px on all cards, images, and feature blocks; reserve 180px for the pill button only
- Tighten letter-spacing progressively as size grows: -0.012em at 14-18px, -0.025em at 40px, -0.046em at 104px display
- Pair Frost White text with the deep canvas (#10020a) or the warmer Mulberry (#1e0313) — never place white text on a flat mid-gray
- Use weight 600 for nav and buttons, 700 for headings, 400 for body — do not introduce 500
- Center the hero composition and let the 91% stat badge float to the right with its own ring, breaking the symmetrical headline block
- Let product screenshots sit on the light Chalk surface (#f2f2f2) inside the dark card — the contrast between the void and the bright product is the page's structural rhythm

### Don't
- Do not use a gray or black drop shadow — any non-pink shadow will break the brand instantly
- Do not use a square or 4-8px radius on a primary card — the 24px curve is what makes the glow read as a soft halo rather than a hard box
- Do not set the Plasma Pink (#ff0068) as a fill on a large surface — it should only appear as a thin stroke, an icon accent, or a shadow color
- Do not use weight 500 — the system jumps from 400 to 600, and 500 reads as washed out against the tight tracking
- Do not place body text at 70% opacity on light surfaces — the muted opacity treatment is only for text on the dark canvas
- Do not use a 1-2px border to create card edges — cards are defined entirely by their glow and surface step, not by outlines
- Do not mix two heading typefaces on the same screen — Graphik Cond is reserved for a single gradient section heading per page; everything else is Graphik Web

## Elevation

- **Glow Card (primary):** `0 0 33px 0 rgba(255,0,104,0.54), 0 0 99px -21px rgba(255,0,104,0.4)`
- **Glow Image Frame:** `0 0 21px -5px rgba(255,0,104,0.9), 0 0 27px -3px rgba(255,0,104,0.6)`
- **Glow Feature Block:** `0 0 90px 0 rgba(255,0,104,0.36)`

## Surfaces

- **Obsidian Canvas** (`#10020a`) — Page-wide background — the void everything sits on
- **Mulberry Card** (`#1e0313`) — Elevated card and feature block surface — reads as a step up from the canvas even in the dark
- **Chalk Product** (`#f2f2f2`) — Inverted light surface used inside product mockup panels and the product card browser frame

## Imagery

The visual language is screenshot-first and dark. The hero is a single large product dashboard mockup (line chart, data table, sidebar) sitting on the dark canvas with the pink plasma halo — no lifestyle photography, no abstract illustration. Below the hero, a 4-up grid of video thumbnails repeats the same dashboard family (overview, button component, colors, components inventory) with circular play buttons centered. Feature blocks use small UI-crop illustrations: a Figma sync node connected to a sync icon, a Figma/CodePen/ProtoPie icon stack beside a sign-up form mockup, a button wireframe. Every illustration is white-line or chrome-on-dark, never colorful. Photography and 3D renders are absent — the product UI is the imagery, and the glow shadows are the atmosphere.

## Layout

Max-width 1200px centered container. The page is a vertical stack of distinct, well-separated sections rather than a continuous scroll. Hero is a split: left-aligned two-line headline (104px Graphik 700, two lines, tight tracking) with a 16-18px description below, and a floating stat badge to the right at the vertical center of the headline. Below the hero, a single product mockup card spans nearly full-width. The mid-page has a centered gradient section heading above a 2-column feature grid (cards with illustration-on-left, text-on-right). A 4-column video grid sits in the lower third. Navigation is a minimal top bar: brand lockup left, a single text link right. Section gaps are generous (80-96px) to let the glow halos breathe without bleeding into each other.

## Similar Brands

- **Linear** — Same dark cinematic canvas with tightly tracked geometric sans display headlines and a single saturated accent for interactive states
- **Vercel** — Same obsidian-on-near-black surface stack with generous glow halos around hero cards and ultra-tight negative letter-spacing on large display type
- **Pitch** — Same dark UI with a vivid neon accent (Pitch uses purple, Luro uses pink) used as gradient fills and icon strokes rather than large surface fills
- **Raycast** — Same minimal top nav with brand mark left and a single text action right, paired with a product-screenshot hero floating on a near-black canvas
