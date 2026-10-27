# Freshman — Style Reference
> cinema title card on black velvet

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Freshman runs a near-black canvas with almost no color noise — the white type and the lone red accent do all the heavy lifting. The visual language borrows from high-end print and cinema: a massive italicized wordmark anchors every screen, type is set ultra-light (weight 200) in Editorial New and tight in Altform, and a thin horizontal project ticker acts as the page's spine. Surfaces are flat with no shadows or gradients; hierarchy comes from scale and weight contrast, not elevation. Interaction is restrained — a single + MENU trigger, bracket-wrapped editorial labels, and a project reel that feels like a film festival credit roll rather than a SaaS nav.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure White | `#ffffff` | Primary text, logotype fill, border strokes, and the dominant foreground on the dark canvas — carries 92% of all color instances |
| Carbon Black | `#000000` | Base canvas and primary background — the default surface for every page |
| Charcoal Shale | `#101010` | Secondary surface for icon wells, sub-panels, and slight tonal lift above the pure-black canvas |
| Signal Red | `#ff2936` | Sparingly-applied accent for active states, marquee highlights, and high-emphasis punctuation — used as a single saturated note against the monochrome system |

## Typography

### Editorial New — Hero and headline display — the ultralight weight 200 is anti-convention; combined with the 20px breakpoint it reads as editorial print rather than web UI
- **Substitute:** Cormorant Garamond, Playfair Display
- **Weights:** 200
- **Sizes:** 16px, 20px
- **Line height:** 1.00, 1.25
- **Letter spacing:** -0.01em

### TT Firs Neue — Workhorse UI and body sans — the only geometric grotesque in the system, anchors the project ticker labels, menu trigger, and utility text
- **Substitute:** Inter, Neue Haas Grotesk, Söhne
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.00

### Altform — Compact meta and condensed labels — tight 0.86–0.88 line-height and -0.03em tracking make it read like a festival credit roll
- **Substitute:** Druk, Tungsten, Bebas Neue
- **Weights:** 400, 700
- **Sizes:** 14px, 16px
- **Line height:** 0.86, 0.88
- **Letter spacing:** -0.03em

### Wasted Year — Signature editorial flourishes — bracket-wrapped taglines and small accent phrases; its hand-set quality is used for personality, not information density
- **Substitute:** Caveat, Reenie Beanie
- **Weights:** 400
- **Sizes:** 12px, 14px, 17px, 20px
- **Line height:** 0.86, 0.94, 1.00, 1.25
- **Letter spacing:** -0.0100em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1 | — |
| body-sm | — | — | 14px | 1 | — |
| body | — | — | 17px | 1 | — |
| body-lg | — | — | 20px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 48-80px
- **Card padding:** 12-20px
- **Element gap:** 12px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Hero Wordmark
**Role:** Brand identity anchor — the primary visual element on the dark canvas

Full-bleed 'freshman' logotype, set ultra-large in italic Editorial New weight 200, white (#ffffff) fill on Carbon Black (#000000). Letter-spacing -0.01em. A small registered-trademark ® sits at the upper-right of the mark. No background, no border, no shadow — the wordmark is the only object on screen.

### Project Reel Ticker
**Role:** Persistent bottom band showcasing latest work like a film festival credit roll

Full-bleed horizontal bar anchored to the viewport bottom. Pure Black (#000000) background with a 1px top hairline in White (#ffffff). Items arranged in a single row with 12px column gaps; each item pairs a small thumbnail (Altform, condensed, weight 700) with a project title (TT Firs Neue, 14-16px, weight 400) and a secondary label (TT Firs Neue, 12px, 0.86 line-height, uppercase). 20px vertical padding, zero radius.

### Menu Trigger
**Role:** Primary navigation entry point

Top-right 'MENU' label prefixed by a + glyph, set in TT Firs Neue 16px weight 400 in White (#ffffff). No background, no border — a bare typographic control. Inherits the 'all type, no chrome' philosophy of the system.

### Brand Glyph
**Role:** Persistent mark in the upper-left corner

A small hash/cross-like symbol in White (#ffffff) on the Black canvas. Sits at the same cap height as the MENU trigger, anchoring the top bar in quiet symmetry. Likely set in TT Firs Neue or a custom icon font, ~16px.

### Year Counter
**Role:** Cinematic page-position indicator

Centered '2025' string set in Altform weight 400 at 14px with 0.88 line-height and -0.03em tracking in White (#ffffff). Reads as a chapter marker; updates per scroll position to mimic a film leader countdown.

### Editorial Tagline Block
**Role:** Voice/mission statement with typographic personality

Two stacked lines of body text in TT Firs Neue 16px weight 400, White (#ffffff), centered, max-width ~600px. Followed by a bracket-wrapped Wasted Year phrase at 14–17px — the handwritten font transforms the tagline into a signed autograph.

### Cookie Consent Strip
**Role:** Bottom-right regulatory notice

Minimal pill-less bar in Charcoal Shale (#101010) with 1px White (#ffffff) hairline border, ~12px text in TT Firs Neue, uppercase tracking. Rounded zero. Sits flush to the viewport edge, never centered — treated as utility, not design.

### Project Item Cell
**Role:** Individual entry inside the project reel

Three-line vertical stack: uppercase project name (TT Firs Neue 16px, weight 400, White), short sub-label (TT Firs Neue 12px, Altform 0.88 line-height, White at ~70% perceived opacity), and optional thumbnail to the left at ~80px tall. No border, no background tile — text sits directly on the Black bar.

### Thin Hairline Divider
**Role:** Section separator — the only structural chrome in the system

1px horizontal line in White (#ffffff) at 70-100% opacity. Used between the hero and ticker, and between any stacked zones. Zero radius, zero shadow.

## Do's and Don'ts

### Do
- Set the wordmark at 200 weight italic in Editorial New — never bold, never regular; the ultralight is the signature
- Use only #ffffff text on #000000 canvas; treat the 1px white hairline as the only structural divider allowed
- Anchor the project reel to the viewport bottom on every page — it functions as the site's navigation spine
- Pair the body description (TT Firs Neue 16px) with a bracket-wrapped Wasted Year tagline directly beneath it; the handwriting-font punctuation is non-optional
- Use #ff2936 for at most one element per viewport — it is punctuation, not paint
- Set compact UI labels (reel items, counters) in Altform with 0.86-0.88 line-height and -0.03em tracking for the festival-credit-roll rhythm
- Keep the MENU trigger as a bare typographic label — no border, no background, no icon button chrome

### Don't
- Do not introduce shadows, gradients, or elevation of any kind — flatness is the system
- Do not add card backgrounds or rounded corners; all surfaces are 0px radius on the black canvas
- Do not use bold or semibold weights for headlines — the weight 200 Editorial New is the anti-convention that defines the brand
- Do not use #ff2936 as a button fill or large background block — it loses all impact if used at scale
- Do not add a secondary navigation, breadcrumbs, or page tabs — the MENU trigger and the reel are the entire IA
- Do not set body copy above 16px or below 14px — the type scale is deliberately tight
- Do not alternate between light and dark sections; the page is uniformly dark, depth comes from type scale not surface color

## Elevation

The system intentionally avoids shadows and gradients. Depth is communicated exclusively through type scale, weight contrast, and the two-step surface stack (#000000 → #101010). This is a deliberate editorial-print decision — shadows would make the screen feel like software; flatness makes it feel like cinema.

## Surfaces

- **Carbon Black** (`#000000`) — Primary page canvas — the dominant surface covering the viewport
- **Charcoal Shale** (`#101010`) — Subtle elevation for utility elements like the cookie consent bar; barely perceptible shift above the canvas

## Imagery

Imagery is almost absent from the main canvas. Photography appears only as small horizontal thumbnails inside the project reel ticker — tight, cinematic crops around 80px tall with no rounded corners and no overlay treatments. The visual identity is driven entirely by the oversized italic wordmark, ultra-light editorial type, and the vertical rhythm of bracketed handwritten flourishes. No illustration, no 3D, no decorative gradients — the wordmark IS the imagery.

## Similar Brands

- **Hypebeast** — Same editorial-meets-streetwear sensibility with oversized italic wordmarks on a near-black canvas and a ticker-like feed of content at the bottom
- **A24 Films** — Cinema-title-card aesthetic — white type on pure black, ultralight editorial headlines, minimal chrome, and the feeling that the brand IS the logotype
- **Bureau Cool** — Indie creative agencies that use editorial type, custom serifs at weight 200, and near-zero decoration; both treat the homepage as a statement rather than a product page
- **Buck (studio)** — Production/creative studios with full-bleed dark canvases, restrained type, and project reels that double as the primary navigation rhythm
