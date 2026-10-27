# Drepute — Style Reference
> midnight observatory over still water — a single sentence floats beneath a field of stars

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Drepute is a cinematic black-canvas teaser built around a single full-bleed photograph: a still alpine lake mirroring a starfield at midnight. The UI is deliberately invisible — no cards, no shadows, no panels. A single Playfair Display headline floats over the image while everything else is Source Sans Pro at 14–16px. The wordmark uses Montserrat 700 with extreme letter-spacing (0.154em), turning the brand name into a constellation of letters across the top. Color is almost entirely absent: pure black, white, and three grays form a five-step achromatic scale, with one deep teal (#00a4a6) appearing only as a link border. Radii are locked at 4px everywhere — no pills, no soft corners, just sharp rectangular edges. The whole site feels like a movie title card: a single image, a single sentence, and a brand name hovering above it all.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure White | `#ffffff` | Primary text on dark hero, input fills, light surfaces |
| Deep Ink | `#000000` | Dominant text and border color across body, nav, and dividers |
| Obsidian | `#161616` | Dark canvas and hero surface — the page's atmospheric base |
| Ash Gray | `#bfbfbf` | Subtle input borders, ghost box-shadows, disabled hairlines |
| Fog | `#a9a9a9` | Secondary body text, muted borders, low-emphasis dividers |
| Steel | `#7f8080` | Navigation and link borders, tertiary text on light surfaces |
| Slate Blue | `#8995a9` | Outlined ghost-button border — the only chromatic interactive treatment |
| Lagoon Teal | `#00a4a6` | Sole accent — link border, indicating the single interactive edge in the system |

## Typography

### Source Sans Pro — Workhorse sans for body, buttons, nav, inputs, and all UI microcopy; weight 700 reserved for emphasis
- **Substitute:** Inter, IBM Plex Sans, system-ui
- **Weights:** 400, 700
- **Sizes:** 14px, 16px
- **Line height:** 1.20–1.50
- **Letter spacing:** 0.071em

### Playfair Display — Display serif for hero headlines ('Launching Soon') — the single expressive type voice; weight 400 italic-leaning elegance rather than bold
- **Substitute:** Cormorant Garamond, Libre Baskerville, DM Serif Display
- **Weights:** 400
- **Sizes:** 16px, 44px, 62px
- **Line height:** 1.20–1.25
- **Letter spacing:** normal

### Montserrat — Wordmark only — 'DREPUTE' set wide at 0.154em to function as a typographic constellation above the hero
- **Substitute:** Oswald, Bebas Neue, Archivo Black
- **Weights:** 700
- **Sizes:** 26px
- **Line height:** 1.20
- **Letter spacing:** 0.154em

### GD Sherpa — Custom brand secondary; deployed alongside Source Sans Pro for select links and image overlays
- **Substitute:** Source Sans Pro (fallback for system use)
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.20

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | 1px |
| body | — | — | 16px | 1.5 | 0.07px |
| heading-sm | — | — | 26px | 1.2 | 4px |
| heading | — | — | 44px | 1.25 | 0px |
| display | — | — | 62px | 1.2 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 56px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **cards:** 4px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Full-Bleed Hero
**Role:** Atmospheric landing surface

#161616 base with a photographic image filling 100vw/100vh. Headline centered vertically in Playfair Display 62px #ffffff, weight 400, normal tracking. Wordmark 'DREPUTE' pinned to top in Montserrat 700 26px #ffffff with 0.154em tracking — floats above the image as a typographic anchor.

### Wordmark Lockup
**Role:** Brand identity element

Montserrat 700, 26px, uppercase, #ffffff on dark or #000000 on light, letter-spacing 0.154em (4px). Centered horizontally. No accompanying logo mark — type is the mark.

### Ghost Outlined Button
**Role:** Outlined call-to-action

Transparent fill, 1px border in #8995a9 (slate blue) or #000000, Source Sans Pro 14px weight 700, text color matching border, 4px radius, 8px vertical / 24px horizontal padding. 2px inner border offset on focus. This is the system's only filled-like interactive treatment.

### Minimal Link
**Role:** Inline navigation link

Source Sans Pro 14px, no underline by default, border-bottom 1px in #7f8080 (steel) or #00a4a6 (lagoon teal) on hover. Teal border is the single chromatic moment in the entire system.

### Top Notification Bar
**Role:** Slim promotional strip

Full-width bar with 56px vertical padding. White background, Source Sans Pro 14px #000000 text, centered layout. Inline link and ghost button sit on the same horizontal axis.

### Text Input Field
**Role:** Form input for email/name capture

#ffffff fill, 1px #bfbfbf border, 4px radius, Source Sans Pro 16px #000000 text. No label — placeholder text in #a9a9a9. Focus state darkens border to #000000.

### Subscribe Form Block
**Role:** Email capture below the hero

Centered stack on #161616 surface. 'Subscribe' heading in Playfair Display 44px #ffffff, then a single-row input + ghost button composition. 32px gap between heading and form row.

### Section Divider
**Role:** Visual break between dark hero and light content

Pure 1px #a9a9a9 horizontal line, full-width or 133px margins, no shadow or ornament. Divides the cinematic dark surface from functional light sections.

### Chat Widget Bubble
**Role:** Floating support affordance

Circular 48px dark surface pinned to bottom-right corner. Single light icon, no label. Floats above all content.

## Do's and Don'ts

### Do
- Use Playfair Display weight 400 exclusively for display text — never go above weight 400; the lightness is the luxury.
- Set the wordmark in Montserrat 700 with 0.154em letter-spacing — this tracking is the brand's signature and must not be reduced.
- Keep the canvas at #161616 for all dark surfaces and reserve #ffffff for light sections below the fold.
- Use 4px radius on every rounded element — buttons, inputs, cards. The system has no soft corners.
- Anchor headlines at 56px+ on Playfair Display and pair with Source Sans Pro 14–16px for all supporting text.
- Use 24px column gaps and 24px element padding as the default rhythm; 56px vertical section padding for hero-style blocks.
- Let the teal #00a4a6 appear only as a single link border — never as a fill, button background, or large surface.

### Don't
- Do not add shadows, gradients, or glows to any component — the system is flat and photographic.
- Do not introduce pills, circles, or any radius above 4px.
- Do not use color fills on buttons — all actions are ghost/outlined with border-only treatment.
- Do not use Playfair Display below 44px — it is a display face, not a body face.
- Do not place body text directly over the hero photograph without a #161616 backing layer — contrast must remain AAA.
- Do not add more than one chromatic accent — the teal is singular; adding another color breaks the cinematic restraint.
- Do not use bold (600+) on the wordmark — weight 700 is the ceiling, and it only applies to Montserrat.

## Elevation

- **Chat Widget:** `0 0 0 1px rgba(191,191,191,0.3)`

## Surfaces

- **Hero Canvas** (`#161616`) — Full-bleed dark surface hosting the photographic hero and headline
- **Page Canvas** (`#ffffff`) — Light surface below the fold for form sections and footer
- **Input Surface** (`#ffffff`) — Form field fills against the dark background

## Imagery

Imagery is singular and cinematic: one full-bleed photographic hero dominates the page. The photograph — a night-sky alpine landscape with mountain silhouettes and a glass-still lake reflection — is high-contrast, dark/moody, and occupies 100% of the viewport. There is no other photography, no illustrations, no product shots, no decorative graphics. The image is the entire visual identity. Icon style is minimal and line-based (single chat bubble). The site is overwhelmingly text-dominant everywhere except the hero, where text is reduced to a single sentence beneath a constellation of stars.

## Layout

The page model is a full-bleed vertical stack with no max-width container. The hero is a single full-viewport-height section: photographic background, centered wordmark at top, centered headline in the vertical middle. Below the hero, the layout collapses to centered single-column content — a subscribe form, a divider, and footer text — all stacked with 56px vertical breathing room. Navigation is minimal: the top bar is a single notification strip, and the wordmark serves as the only persistent brand element. No sidebar, no grid, no card layouts. The chat widget floats absolutely in the bottom-right corner. The overall rhythm is: one overwhelming image, then silence.

## Similar Brands

- **Apple (product launch teasers)** — Same full-bleed photographic hero with a single headline floating over a dark image, wordmark as the only persistent UI element, and near-zero color saturation
- **Aesop** — Serif display headlines paired with restrained sans body, deep neutral palette, and a sense of editorial calm
- **Mubi** — Cinema-grade dark hero with white serif typography, monospace-feel restraint, and an almost entirely achromatic interface
- **Squarespace (pre-launch states)** — Launching-soon pattern with centered serif headline over atmospheric photography, minimal UI, and a single subscribe form
