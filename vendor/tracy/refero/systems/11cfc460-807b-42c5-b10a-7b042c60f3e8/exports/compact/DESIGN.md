# Websmith Studio — Style Reference
> morning light on cream paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Websmith Studio is a quiet, almost monastic portfolio language built on warm cream paper and one near-black ink. The hero is typographic — a 96px sentence that carries the entire first screen — and everything else retreats to give it room. The interface is 99% achromatic; color appears only as three pastel card surfaces (powder blue, mint, blush) and a single vivid green status dot, used as functional punctuation rather than decoration. Components are flat and borderless, relying on generous whitespace, 12px image radii, and a single dark filled button to create rhythm. The system feels less like a website and more like a printed editorial spread — confident, restrained, and deliberately under-designed.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#f8f8f2` | Page canvas and base surface — warm off-white that softens the starkness of pure white, giving the whole site a printed-editorial warmth |
| Card White | `#ffffff` | Elevated card surfaces and the nav bar — sits one step above the cream canvas to create subtle layering without shadows; White text and button labels — used on dark backgrounds and as the light-mode border on neutral card edges |
| Studio Ink | `#1a1a1a` | Primary text, icons, and the filled button — near-black rather than pure black, softer on the warm canvas and used as the sole dark element in the system |
| Deep Black | `#000000` | Reserved for SVG icon fills — logo glyph and nav icon strokes; rarely surfaces as a background |
| Powder Blue | `#bedbff` | Blue wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Mint Wash | `#a4f4cf` | Feature card surface — pastel green used as a category tint in the services grid, always paired with near-black text and an icon |
| Blush Tint | `#ffc9c9` | Feature card surface — soft coral used as the third category tint; the warmest of the three pastels, slightly louder on the cream canvas |
| Signal Green | `#00c950` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content |

## Typography

### -apple-system — Sole typeface used across the system — the page commits fully to a single geometric system stack at a 96px display size with tight -0.025em tracking, which is the signature move: most agency sites use a serif display; Websmith uses a 96px geometric sans at negative tracking to create a flat, architectural, almost-Futura authority. Substitute with Inter at the same tracking.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14, 16, 20, 30, 48, 88, 96
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.025em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.35px |
| body | — | — | 16px | 1.5 | -0.4px |
| subheading | — | — | 20px | 1.4 | -0.5px |
| heading | — | — | 30px | 1.2 | -0.75px |
| heading-lg | — | — | 48px | 1.2 | -1.2px |
| display | — | — | 88px | 1 | -2.2px |
| display-xl | — | — | 96px | 1 | -2.4px |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 96-112px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **images:** 12px
- **buttons:** 8px

## Components

### Top Navigation Bar
**Role:** Site-wide header

White (#ffffff) bar spanning full width on the cream canvas. Left: small SVG wordmark 'Websmith' in Studio Ink at 16px. Center-left: nav links (Home, Collabs, FAQs, Blog, Contact) in 16px Studio Ink, weight 500, with the active link underlined. Right: a 8px Signal Green status dot beside '10:56 am' in 14px Studio Ink. No border, no shadow — separation comes from the white-on-cream color shift only.

### Display Headline
**Role:** Hero typography

Single sentence at 88–96px, weight 700, line-height 1.00, letter-spacing -2.4px (-0.025em), in Studio Ink on the cream canvas. No subtitle decoration, no kicker, no buttons in the hero — the type IS the hero. Paired with a 20px weight 400 subtitle in Studio Ink at 60% opacity, left-aligned, with a 32px gap above it.

### Collaboration Project Card
**Role:** Portfolio thumbnail

Full-bleed image filling the card, 12px radius, no border, no shadow. White text overlaid top-left at 20px weight 600 (project name) and 14px weight 400 (collab credit). Two-column grid at 32px column gap, images at roughly 16:9 ratio. Card surface is transparent — the image itself is the card.

### Dark Filled Button
**Role:** Primary action

Background #1a1a1a, text #ffffff, 16px weight 500, padding 16px 24px, 8px radius. Centered as a single solitary action. No hover state change detected beyond standard opacity. Used sparingly — typically one per page section.

### Service Category Card
**Role:** Feature/service tile

Rounded rectangle with one of three pastel fills: Powder Blue, Mint Wash, or Blush Tint. 12px radius, 32px internal padding, label in 20px weight 600 Studio Ink at top-left, icon in 24px Studio Ink at bottom-right. Cards sit in a 2- or 3-column grid at 32px gaps. No border, no shadow — the color fill IS the visual weight.

### Neutral Service Card
**Role:** Feature/service tile (default state)

White (#ffffff) surface variant of the Service Category Card — same 12px radius, 32px padding, 20px label, 24px icon, but sits on the cream canvas with no color fill. Used as the 'default' or first card before the pastel tints introduce color.

### Testimonial Block
**Role:** Social proof / quote

Two-column layout at 64px gap. Left: square or portrait black-and-white photograph, 12px radius. Right: oversized opening quotation mark (48px Studio Ink) above a 30px weight 400 quote in Studio Ink, with 16px weight 600 name and underlined link for the attribution below at 32px gap.

### Section Heading
**Role:** In-page section title

30–48px weight 600 Studio Ink, left-aligned, 0px margin-bottom, with content starting at 32–48px below. No kicker, no eyebrow text — just the heading and what follows.

### Blog List Card
**Role:** Editorial content entry

Horizontal layout with text on left and small image on right, separated by a 1px #1a1a1a hairline border. 20px weight 600 title, 14px meta line in Studio Ink at 60% opacity. No card surface — the border IS the card.

### Status Dot
**Role:** Live indicator

8px diameter circle in Signal Green (#00c950) paired with 14px Studio Ink text immediately to its right. Sits in the nav bar to communicate availability — the only place a vivid color appears at small size.

### Footer
**Role:** Site footer

Cream canvas continuing the page surface, 96–112px top padding, 1px top border in #1a1a1a, simple text links and copyright in 14px Studio Ink. No social icons, no logo repeat — minimal closing.

## Do's and Don'ts

### Do
- Use #1a1a1a Studio Ink for all body text, icons, and the filled button — never use pure #000000 for text or backgrounds.
- Set the hero headline at 88–96px, weight 700, line-height 1.00, letter-spacing -2.4px to recreate the signature typographic statement.
- Apply 12px radius to all cards and images, and 8px radius to buttons — these two values are the only radii in the system.
- Use the three pastel tints (Powder Blue, Mint Wash, Blush Tint) exclusively as full card backgrounds for service/category tiles, never as text colors or small accents.
- Reserve Signal Green (#00c950) for the status dot only — it is a one-pixel punctuation, not a brand color for CTAs or icons.
- Maintain 96–112px vertical padding between major page sections to preserve the spacious, editorial rhythm.
- Pair white (#ffffff) with cream (#f8f8f2) to create surface layering without using shadows — the color shift IS the elevation.

### Don't
- Don't introduce a second typeface or a serif display — the system uses a single geometric sans at every size.
- Don't use the pastel tints for text, borders, or icons — they are surface fills only and lose readability at small sizes.
- Don't add box-shadows to cards or buttons — elevation comes from color shifts and whitespace, not drop shadows.
- Don't use Signal Green on anything other than the status dot — it would over-promise the brand's restraint.
- Don't use a CTA button with a colored background — the only action color in the system is the dark Studio Ink fill.
- Don't compress section padding below 64px — the layout reads as cramped when vertical rhythm is reduced.
- Don't apply radius values other than 12px (cards/images) or 8px (buttons) — these two values define the visual softness.

## Elevation

The system deliberately avoids drop shadows entirely. Elevation is expressed through color contrast between the cream canvas (#f8f8f2) and white card surfaces (#ffffff), and through generous whitespace that lets elements breathe rather than float. A shadow would break the printed-editorial metaphor.

## Surfaces

- **Cream Canvas** (`#f8f8f2`) — Page background, the warm base everything sits on
- **Card White** (`#ffffff`) — Nav bar, white service cards, and elevated content surfaces
- **Pastel Tints** (`#bedbff`) — Colored service cards — one step above white in the visual stack

## Imagery

Photography is central to the portfolio sections — full-bleed device mockups, workspace shots, and environmental product photography fill the collaboration cards. Images are treated with rich, saturated color (warm orange phone renders, dramatic blue water splash, natural wood textures) and capped with 12px rounded corners, no overlays or duotones. A single black-and-white portrait appears in the testimonial block, creating a tonal shift from the color work above. No illustration, no abstract graphics, no icon-as-imagery — the only icons are small functional glyphs (compass, grid) in the service cards.

## Layout

Full-width sections on a cream canvas, with content constrained to a centered max-width of ~1200px. The hero is a single text block, left-aligned, with no image — typographic-first. Portfolio cards sit in a 2-column grid at 32px column gap. The 'What we do' section alternates to a colored-card grid (2 or 3 columns). Testimonial uses a 2-column split: image left, text right at 64px gap. Vertical rhythm is built on 96–112px section padding, creating a slow scroll pace. Navigation is a simple top bar, not sticky. The overall composition feels like a printed magazine spread — large, quiet, and image-driven in the middle third, text-driven at top and bottom.

## Similar Brands

- **Studio Schicketanz** — Same approach of pairing a massive typographic hero with a quiet near-monochrome canvas and image-driven portfolio grid
- **Pentagram** — Editorial-style portfolio layout with cream/off-white canvas, oversized sans-serif headlines, and large image blocks with rounded corners
- **Locomotive** — Agency site with warm off-white background, dark filled button as the only dark element, and project showcase cards in a clean grid
- **Manual** — Minimalist agency site with a single geometric sans at display sizes, pastel category cards, and generous vertical section padding
- **Heydays** — Scandinavian agency aesthetic with cream canvas, no shadows, and project cards using full-bleed photography with 12px corner radius
