# Pentagram — Style Reference
> Gallery wall of compressed restraint

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Pentagram's interface behaves like a curated gallery catalog: pure achromatic canvas where the only color that appears is the work itself. Every structural decision is typographic — no icons, no badges, no filled buttons, no decorative chrome. The site alternates between white and near-black bands with massive compressed type, then presents projects as oversized solid blocks that read as color swatches before resolving into actual work. Navigation is a single row of text links. Cards are borderless or hairline-bordered. The system earns its authority through restraint: the same tight tracking and modest weights across every role, so a 52px display heading feels as composed as 13px caption text.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page canvas, card surfaces, text on dark bands |
| Ink | `#1a1a1a` | Primary body text, heading text, hairline borders, link color — the near-black that carries 90% of all strokes |
| True Black | `#000000` | Solid surface fills for dark bands, inverted text backgrounds, inverted footer |
| Graphite | `#222222` | Elevated dark surface, input field fills on dark contexts |
| Carbon | `#333333` | Card border on light surfaces, subtle structural dividers |
| Ash | `#767676` | Muted body text, secondary metadata, less-prominent captions |
| Fog | `#8c8c8c` | Light borders, low-emphasis dividers, placeholder text |
| Mist | `#ededed` | Tinted light surface between pure white and true black bands |
| Haze | `#e3e4e5` | Subtle alt-row surface, hover wash, low-contrast card fill |

## Typography

### Plain — All roles — display, headings, body, caption, nav, button. The single typeface carries the entire site. Weight contrast is limited (400 vs 500) so hierarchy comes from size and tracking, not boldness. The 52px display at -0.02em tracking is anti-display: it whispers instead of shouts. Line-heights under 1.1 on 32–52px create stacked, compressed blocks where headings read as solid slabs. Open features 'kern' and 'case' hint at a typeface with carefully spaced uppercase alternates — the 'case' feature likely gives access to stylistic capital forms.
- **Substitute:** Söhne, Inter, Neue Haas Grotesk, ABC Diatype
- **Weights:** 400, 500
- **Sizes:** 13, 16, 19, 27, 32, 52
- **Line height:** 1.00 (display), 1.05–1.20 (headings), 1.25–1.32 (body), 1.88 (loose body)
- **Letter spacing:** -0.02em on ≥27px, -0.01em on <27px
- **OpenType features:** `"kern", "case"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.25 | -0.13px |
| body-sm | — | — | 16px | 1.32 | -0.16px |
| subheading | — | — | 19px | 1.2 | -0.19px |
| heading-sm | — | — | 27px | 1.19 | -0.54px |
| heading | — | — | 32px | 1.05 | -0.64px |
| display | — | — | 52px | 1 | -1.04px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1400px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Text Navigation Bar
**Role:** Primary site navigation

Pure black (#000000) or white (#ffffff) horizontal bar. Text-only links, no buttons or icons. Font: Plain 400 at 16px, letter-spacing -0.01em. Links use Ink (#1a1a1a) on light, Paper White on dark. A search icon and 'Archive' text sit at the far right. No background fill, no border — sits as plain text on canvas. Padding: 8px top/bottom.

### Full-Bleed Editorial Hero
**Role:** Opening visual for a project or the homepage

Edge-to-edge photograph or illustration occupying the full viewport width and ~60-70% height. No border-radius. No overlay gradient. Project metadata sits at the bottom-left in small Plain 400 13px, white text on a semi-transparent dark strip or directly over the image with a subtle text shadow. No CTA button — the image IS the entry point.

### Project Thumbnail Card
**Role:** Showcase a project in the grid

Borderless card. The thumbnail is a large solid color block (sized roughly 1:1, fills the card) — these blocks ARE the project visual, not a decorative frame. Below the block: project name in Plain 500 at 16px, one-line description in Plain 400 at 13px in Ash (#767676). 24px gap between block and text. No border, no shadow, no radius on the block — sharp corners read as a swatch or plate.

### Project Thumbnail Card with Imagery
**Role:** Showcase a project that uses a designed mark/identity

Same structure as the solid-block card, but the thumbnail contains a designed identity element (logotype, wordmark, editorial composition) composed over a dark or chromatic fill. The contrast between the fully achromatic interface and these chromatic project plates is the signature visual.

### Dark Band Section
**Role:** Break page rhythm, introduce new context

Full-width band with True Black (#000000) or Graphite (#222222) background. All text in Paper White. A single display heading (52px) anchors the band, optionally followed by body copy at 16px in Ash (#767676). Generous padding: 48–64px vertical. No decoration, no gradient, no imagery — the darkness itself is the visual statement.

### Inline Tagline Pill
**Role:** Occasional textual accent between sections

Small centered text string ('We design Everything~ for Everyone~') set in Plain 400 at 16px, Frost (#8c8c8c). No background, no border, no padding. Appears as standalone typographic punctuation between content blocks.

### Heading-Only Introduction
**Role:** Section opening before a grid or list

Large display heading (52px, weight 400, line-height 1.00, -0.02em tracking) in Ink on white or Paper White on black. Followed by a short paragraph block in Plain 400 at 16px, line-height 1.88, max-width ~640px. No subheading, no eyebrow, no label above — the heading is the only signal of section identity.

### Footer (Inverted)
**Role:** Site footer

Full-width True Black band. Plain 400 13px text in Paper White. Sparse — likely a few text links, copyright, and minimal metadata. No logo, no social icons, no newsletter form. 64px vertical padding.

### Dot Pagination
**Role:** Hero carousel / project slider indicator

Row of 5–8 small circles, 6px diameter, spaced 6px apart. Active dot is Paper White, inactive dots are 40% white. Sits at bottom-right of the hero. The only non-text UI element on the entire site.

### Search Trigger
**Role:** Open site search

Small magnifying glass icon (likely a thin stroke SVG, ~16px) + 'Archive' text link, Plain 400 13px in Ink. Sits at the far right of the nav. No field, no button — the icon is the affordance.

## Do's and Don'ts

### Do
- Use only the nine achromatic tokens — any chromatic color in the interface breaks the system. Color belongs inside project thumbnails, not on chrome.
- Set the tightest tracking (-0.02em) on any text 27px or larger; use -0.01em below that. Tracking is the primary hierarchy tool.
- Build cards as borderless blocks with sharp corners (no radius) when the thumbnail is a solid color swatch; reserve 8px radius for cards that contain photography or compound layouts.
- Alternate between Paper White and True Black bands at 96px vertical breaks — the rhythm of light/dark is the page's structural skeleton.
- Use weight 400 for everything by default; reach 500 only for project names in cards and nav links. Never use weight 600 or above.
- Set display headings at line-height 1.00–1.05 so lines stack into a compressed slab. Body copy opens to 1.88 for breathing room — the contrast between tight display and airy body is deliberate.
- Let the 4-column project grid do the visual work: large solid-color blocks fill 1:1 tiles, with a 24px gap below for two lines of Plain 400/500 metadata in 16/13px.

### Don't
- Don't add any color to navigation, buttons, or backgrounds. The interface is 100% achromatic — color only appears inside project thumbnails.
- Don't use border-radius above 8px on cards or 4px on buttons. Sharp corners read as editorial plates; rounding undermines the gallery-catalog feel.
- Don't introduce filled buttons, outlined buttons, or ghost buttons. There is no button component — every affordance is a text link, an image, or a dot.
- Don't use weight 600+ or italic. The typeface's weight range stops at 500; anything heavier breaks the compressed-restraint language.
- Don't add icons inside body content. The only icon on the entire site is the search affordance in the nav.
- Don't use background colors on text or dividers for emphasis. Emphasis comes from size, tracking, and the Paper White / Ink contrast pair — never from color fill or tint.
- Don't use shadows, gradients, or glow effects. Elevation is communicated purely through band alternation (white → black → white), not through drop shadows.

## Surfaces

- **Paper White** (`#ffffff`) — Default page canvas and card base
- **Haze** (`#e3e4e5`) — Low-contrast alt band, subtle card differentiation
- **Mist** (`#ededed`) — Slightly elevated light surface between white and dark bands
- **Graphite** (`#222222`) — Dark elevated surface (inputs, secondary dark bands)
- **True Black** (`#000000`) — Full dark band, inverted sections, footer

## Imagery

The site uses two distinct visual modes that never mix. Mode one is full-bleed editorial photography: architectural exteriors, institutional buildings, museum interiors — always documentary in tone, no lifestyle, no staged models, no people-centric framing. Shots are wide, composed with strong verticals, and lit naturally. Mode two is solid color blocks: each project card uses a single flat fill (saturated blue, dark green, warm peach, near-black) as its thumbnail, reading first as a swatch or painted plate before identity work is revealed on top. Project thumbnails that contain designed work — like a wordmark — compose that work centered on the chromatic field. There is no illustration, no 3D, no abstract graphic art. Icons are absent except for a single thin-stroke magnifying glass in the nav.

## Layout

Page model is full-bleed with no side margins; content cards live inside a max-width ~1400px container centered on the canvas. The hero is always a full-viewport-width editorial image with no text overlay competing for attention — metadata sits small at the bottom-left. Below the hero, sections alternate between white bands and full-width black bands at roughly 96px vertical intervals, creating a stark light/dark rhythm. The project grid is a strict 4-column row on desktop, collapsing to 2 columns on tablet and single-column on mobile. The dark bands contain a single massive left-aligned heading (52px) with optional short body copy, nothing else. The white bands contain the 4-column card grid. Navigation is a single horizontal text bar at the very top — no sticky behavior, no sidebar, no mega-menu. The footer is a narrow black band with minimal text.

## Similar Brands

- **Werkplaats Typografie** — Same editorial-portfolio restraint: no UI chrome, no color, large type against white, work presented as large blocks with minimal metadata.
- **Collins (collins.us)** — Same agency-portfolio grammar — achromatic interface, full-bleed project photography, large compressed display type, project cards that use chromatic blocks as thumbnails.
- **Bureau Borsche** — Single-family typography system, hairline navigation, project grid built from oversized color/identity blocks, zero decorative chrome.
- **Mucca** — Gallery-catalog feel with large compressed type on white, dark band section breaks, and work presented as solid color plates with two-line captions.
- **Studio Dumbar** — Work-first portfolio layout with achromatic chrome, large identity marks as card thumbnails, restrained hairline navigation.
