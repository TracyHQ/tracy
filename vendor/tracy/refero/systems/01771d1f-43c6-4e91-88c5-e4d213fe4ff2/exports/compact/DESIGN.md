# Paper — Style Reference
> warm paper notebook under studio lights

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Paper uses a warm-paper-studio language: a cream ivory canvas instead of white, calm monochrome typography in a custom display face, and a single cool blue accent that does almost no UI work. The two-tone headline (dark first line, mid-gray continuation) is the signature move — it treats the hero copy as a composition of weights rather than a single block. Surfaces sit flat on the page with one barely-there card shadow, borders are hairline, and the product feels like a printed notebook page under cool studio light. Most of the chromatic energy lives inside the product screenshot; the marketing surface around it stays restrained, near-achromatic, and grid-quiet.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone Canvas | `#efefe4` | Page background — warm cream instead of white, the signature surface that makes the whole site feel like a notebook page |
| Paper White | `#fcfcf9` | Primary page canvas and white card surfaces. Do not promote it to the primary CTA color |
| Bright Card | `#ffffff` | Pure white card surface for highest elevation, code panels, product chrome |
| Mist | `#f3f3f4` | Subtle alternate band background, soft dividers in long pages |
| Ash Gray | `#e3e3e3` | Card backgrounds in denser sections, soft grouping surface |
| Stone | `#d7d7d6` | Hairline borders, card outlines, surface separators |
| Smoke | `#c1c1c0` | Secondary borders, diagram strokes, muted dividers |
| Pewter | `#a8a8a8` | Icon strokes, low-priority borders, decorative vector fills |
| Graphite | `#909090` | Secondary body text, the lighter half of the two-tone headline, heading accents |
| Slate | `#83837e` | Subdued heading and link text, warm-gray captions |
| Iron | `#666666` | Helper text, metadata, tertiary copy |
| Lava | `#434341` | Near-black emphasis text, slightly softer than full ink for long reads |
| Carbon | `#222222` | Near-black used in nav chrome and high-contrast text |
| Ink | `#181818` | Primary text, nav active state, filled button background — neutral dark, not chromatic |
| Studio Blue | `#5d8cd7` | Brand icon mark, decorative vector accent — cool blue against warm cream is the only chromatic tension in the marketing surface |
| Wash Blue | `#81adec` | Lighter blue used for soft body accents and nav underlines |

## Typography

### Matter — Display and headline face — custom, wide stance, unusual light-to-medium weights (360 is whisper-thin). Carries the hero, the two-tone headline split, and large pull quotes. Tight tracking on display (-0.0200em at 64px) gives the type a composed, editorial feel
- **Substitute:** Söhne, Inter Tight, or a humanist geometric like Manrope
- **Weights:** 360, 400, 480, 500, 550
- **Sizes:** 14px, 18px, 48px, 64px
- **Line height:** 1.00, 1.56, 2.00
- **Letter spacing:** -1.28px at 64px, -0.96px at 48px, -0.28px at 14px
- **OpenType features:** `"calt" on, "ss01" on`

### Inter — UI and body face — captions, button labels, nav, metadata, product chrome. Tight negative tracking on small sizes (-0.0100em at 12–14px) keeps dense UI legible
- **Substitute:** Inter (native), or system-ui
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 14px, 16px, 18px, 24px, 36px
- **Line height:** 1.20, 1.40, 1.50, 1.56, 1.75, 2.00
- **Letter spacing:** -0.30px at 12px, -0.14px at 14px, -0.16px at 16px, -0.18px at 18px, 0.10px at 24px
- **OpenType features:** `"calt" on`

### Paper Mono — Code, file paths, version labels, tiny metadata. Loose positive tracking (+0.0150em to +0.0160em) at small sizes gives the mono a calm, terminal-like cadence
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 11px, 12px
- **Line height:** 1.33, 2.55
- **Letter spacing:** 0.17px at 11px, 0.19px at 12px
- **OpenType features:** `"calt" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.33 | 0.17px |
| body | — | — | 14px | 1.56 | -0.14px |
| body-lg | — | — | 18px | 1.75 | -0.18px |
| subheading | — | — | 24px | 1.3 | 0.1px |
| heading-sm | — | — | 36px | 1.2 | -0.36px |
| heading | — | — | 48px | 1.14 | -0.96px |
| display | — | — | 64px | 1 | -1.28px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **buttons:** 4px
- **heroPanels:** 20px
- **largeCards:** 12px
- **imageFrames:** 24px

## Components

### Filled Dark Button
**Role:** Primary action — the only filled button in the system

#181818 background, #fcfcf9 text, 4px radius, 6px 14px padding, Inter 14px weight 500, no border. Used for 'download Paper' and equivalent primary CTAs. Lowercase label, no trailing arrow.

### Ghost Link Button
**Role:** Secondary action — paired with the filled button

Transparent background, #181818 text, no border, Inter 14px weight 500, trailing arrow glyph (→) at 6px gap. Used for 'open Paper in the browser →' and other soft CTAs.

### Nav Link
**Role:** Top-bar navigation item

Inter 14px weight 400, #181818 text, 8px horizontal padding, no underline. 'downloads' is set in weight 500 as the active endpoint. Right-aligned cluster: 'sign up' in weight 400, 'downloads →' in weight 500.

### Brand Wordmark
**Role:** Site logo

Word 'Paper' in Inter 16px weight 600, #181818, preceded by a 14×14 #5d8cd7 rounded-square mark. The blue mark is the only saturated color in the header.

### Two-Tone Headline
**Role:** Hero and section heading

Matter weight 400 at 64px / 48px, split across two visual weights: first line in #181818, continuation lines in #83837 at the same size. Tracking -1.28px at 64px, -0.96px at 48px. Line height 1.00–1.14 — the lines stack tight, almost overlapping, for a composed editorial feel.

### Eyebrow Label
**Role:** Section pre-title, status marker

Inter 12px weight 500, #909090, often lowercase ('used in production by designers at', 'open alpha'). Optional 8px gap to the heading below.

### Lead Paragraph
**Role:** Body copy under hero and section headlines

Matter 18px weight 400, #666666, line-height 1.75, max-width ~56ch. No drop-cap, no bold inline emphasis — the tone is calm and expository.

### Product Screenshot Card
**Role:** Hero visual and feature showcase

White (#fcfcf9) surface, 8px radius, 32px padding around the app chrome, elevated with the three-layer card shadow. Contains traffic-light dots top-left, a sidebar of file names, and a right-side properties panel — all rendered as flat product UI inside the card.

### Logo Cloud
**Role:** Social proof band

Single row or two-row grid of customer logos, Pewter (#83837e) monochrome, 40–48px tall, 32–40px gap, centered. No dividers, no card wrapping. Eyebrow 'used in production by designers at' centered above.

### Code Block (Claude Code panel)
**Role:** Developer-facing feature illustration

Rounded panel with 8px radius, 12–24px padding, #fcfcf9 background, hairline #d7d7d6 border. Body in Paper Mono 11–12px weight 400. File paths and code keywords colored with brand blue (#5d8cd7), comment lines in #909090. No syntax-highlight rainbow — palette stays near-monochrome.

### Ghost Card
**Role:** Marketing card without shadow

#fcfcf9 background, 1px #d7d7d6 border, 8px radius, 24–32px padding. Used when the product card would feel too heavy — text-only groupings, plan summaries, simple feature blocks.

### Geometric Pattern Overlay
**Role:** Decorative page-edge treatment

Subtle thin-line isometric grid in #d7d7d6, drawn at ~20% opacity, anchored to the upper-right corner of the hero and select sections. Never full-bleed, always clipped to a triangular wedge. Provides spatial depth without adding color.

## Do's and Don'ts

### Do
- Use #181818 as the only filled-button background — never introduce a chromatic CTA color
- Split headlines into two visual weights: first line in Ink (#181818), continuation in Slate (#83837e), both at the same Matter display size
- Set the page background to Bone Canvas (#efefe4); reserve #ffffff for elevated cards and product chrome only
- Use 4px radius for buttons and tags, 8px for cards, 12–24px for product frames — never mix these scales on the same surface
- Keep the body in Matter 18px weight 400 at #666666 with 1.75 line-height for editorial calm
- Use the three-layer card shadow only on product screenshots and floating tool panels — marketing cards stay flat with hairline borders
- Limit blue (#5d8cd7) to the brand mark, decorative vectors, and code accents — never as a button fill or large text color

### Don't
- Don't add a chromatic accent for CTAs, links, or active states — the action language is neutral dark, period
- Don't use white (#ffffff) as the page background; the cream canvas is the signature and replacing it kills the look
- Don't bold inline keywords inside body copy — the tone is uniform, not emphatic
- Don't apply the card shadow to headings, logos, or icon rows — it belongs only to the product screenshot and floating panels
- Don't set the two-tone headline in two different sizes or two different fonts; the effect comes from identical Matter metrics with different fill colors
- Don't use saturated semantic colors (red/green/yellow) for status — if needed, use Pewter or Iron instead
- Don't add gradients — the system is flat, warm, and achromatic, with the product screenshot providing the only visual richness

## Elevation

- **Product card, elevated panel:** `rgba(0, 0, 0, 0.12) 0px 4px 10px 0px, rgba(0, 0, 0, 0.12) 0px 2px 4px -1px, rgba(0, 0, 0, 0.12) 0px 0px 4px -1px`
- **Popover, floating tool palette:** `rgba(0, 0, 0, 0.08) 0px 8px 8px -4px, rgba(0, 0, 0, 0.08) 0px 2px 4px -2px, rgba(0, 0, 0, 0.08) 0px 1px 1px -1px, rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`

## Surfaces

- **Bone Canvas** (`#efefe4`) — Page background — warm cream, the signature base
- **Paper White** (`#fcfcf9`) — Card and panel surfaces floating on the canvas
- **Bright Card** (`#ffffff`) — Pure white elevation for product chrome and code panels
- **Mist** (`#f3f3f4`) — Alternate band and inset surface

## Imagery

Almost no marketing photography. The single hero visual is a product screenshot of the Paper app itself, presented inside a white card with the three-layer shadow. Customer logos appear as flat monochrome wordmarks in a centered cloud. A faint isometric line grid in #d7d7d6 sits in the upper-right corner of the hero and repeats on select sections, providing spatial depth without color. Iconography (in the product UI) is line-based at ~1.5px stroke, monochrome, using Pewter and Iron.

## Layout

Centered max-width container at 1200px with comfortable side gutters on a full-bleed Bone Canvas. The hero is a left-aligned text block (eyebrow → two-tone headline → lead → button pair) with the product screenshot card centered below, slightly wider than the text column. Subsequent sections are centered single-column with eyebrow + two-tone heading + lead + content block, separated by 96px vertical gaps. Logo cloud sits as a centered band between hero and the first product section. The page uses a consistent rhythm: eyebrow → headline → lead → visual or content, never asymmetric or magazine-style. Navigation is a flat top bar with left-aligned logo and right-aligned CTA cluster; no sticky shadow, no mega-menu.

## Similar Brands

- **Linear** — Same cream-tinted neutral palette, hairline borders, and a single dark filled button as the only CTA weight
- **Vercel** — Compact density, tight display tracking, and a marketing surface that stays achromatic while the product UI carries the color
- **Figma** — Design-tool hero with a large product screenshot card centered below a left-aligned text block on a soft neutral canvas
- **Pitch** — Editorial two-tone headlines mixing dark and mid-gray at the same size, calm sans-serif body, product-first composition
- **Notion** — Warm near-white page background instead of pure white, hairline-bordered ghost cards, monochrome iconography
