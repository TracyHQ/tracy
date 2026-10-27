# Osmo — Style Reference
> developer museum on concrete gray

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Osmo reads as a brutalist editorial platform for web craftspeople: a concrete-gray canvas stamped with oversized black display type, then punctuated by three surgical color punches — a radioactive lime for brand accents, a deep violet for featured cards, and a vermillion red for handwritten annotations. The system refuses the soft-SaaS default: corners split between surgical 2–5px precision and extreme 1600px pill rounding, creating visual tension between machine-precise content tiles and chunky lozenge controls. Typography does most of the talking through Haffer XH display cuts that can run to 150px with aggressive negative tracking, while a monospaced label font stamps technical metadata. Density is compact and content-led, with tilted product cards fanning out like a developer's portfolio pinned to a gallery wall.

## Colors

| Name | Value | Role |
|------|-------|------|
| Concrete | `#f4f4f4` | Page canvas, card surfaces, and most border work — the off-white that everything sits on |
| Ash Gray | `#eaeaea` | Elevated surface layer, input fields, secondary card backgrounds |
| Bone | `#e1e1e1` | Subtle dividers, list separators, tertiary surface fill |
| Smoke | `#b8b8b8` | Muted image borders, disabled-state outlines, badge borders |
| Graphite | `#4f4c4c` | Subdued borders and dividers where Steel feels too heavy |
| Steel | `#7a7a7a` | Secondary body text, helper labels, muted badges |
| Charcoal | `#312e2e` | Card borders, input strokes, mid-depth structural elements |
| Ink | `#201d1d` | Primary text, heavy borders, dominant structural outlines — the workhorse near-black |
| Obsidian | `#151313` | Dark card surfaces, inverse text, maximum-contrast backgrounds |
| Volt | `#a1ff62` | Primary brand accent — badge fills, brand borders, featured highlights, success indicators. The radioactive lime that switches elements on |
| Ultraviolet | `#6840ff` | Featured card backgrounds, link accents, deep brand moments — used when content deserves a colored stage |
| Vermillion | `#f84131` | Annotation accent — handwritten callouts, emphasis text, icon highlights, never used as a fill or background |

## Typography

### Haffer VF — Body and UI workhorse — variable sans used for paragraphs, buttons, labels, and everything between 12–27px. Weight 500 for emphasis, 700 for nav items and button labels
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400, 500, 700
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 19px, 20px, 22px, 24px, 27px
- **Line height:** 1.00–1.56
- **Letter spacing:** -0.02em at 27px down to -0.007em at 12px

### Haffer XH — Display and heading typeface — an extreme-cut sans with tight apertures and dramatic vertical compression (lh 0.85 at the top of the scale). Carries every word above 40px and defines the editorial voice
- **Substitute:** Druk, Inter Display, or a compressed geometric sans like GT Sectra Display
- **Weights:** 400
- **Sizes:** 20px, 40px, 44px, 48px, 62px, 64px, 80px, 112px, 150px
- **Line height:** 0.85–1.08
- **Letter spacing:** -0.06em at 150px down to -0.03em at 62–64px

### Haffer Mono — Technical metadata stamps — course tags, version labels, mono badges. Tiny sizes only, stamps info like a typewriter
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Berkeley Mono
- **Weights:** 400
- **Sizes:** 9px, 11px, 12px
- **Line height:** 1.00

### Brisa Pro — Handwritten signature accent — used for the vermillion annotation callouts that feel like marker scrawl on a print proof. Reserved exclusively for that emotional beat
- **Substitute:** Caveat, Permanent Marker, or Reenie Beanie
- **Weights:** 400
- **Sizes:** 25px
- **Line height:** 0.80

### -apple-system — -apple-system — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5
- **Letter spacing:** -0.01

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| mono-label | — | — | 11px | 1 | — |
| caption | — | — | 13px | 1.54 | -0.09px |
| body-sm | — | — | 16px | 1.3 | -0.16px |
| body | — | — | 19px | 1.25 | -0.38px |
| annotation | — | — | 25px | 0.8 | — |
| subheading | — | — | 48px | 1.05 | -1.44px |
| heading-sm | — | — | 64px | 1 | -1.92px |
| heading | — | — | 80px | 0.95 | -4px |
| heading-lg | — | — | 112px | 0.9 | -5.6px |
| display | — | — | 150px | 0.85 | -9px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 5px
- **icons:** 160px
- **badges:** 1600px
- **inputs:** 5px
- **buttons:** 1600px
- **links-pill:** 48px
- **sharp-tiles:** 2px

## Components

### Floating Navigation Bar
**Role:** Primary site navigation

Horizontal pill bar floating at the top of the viewport. Concrete (#f4f4f4) background with 1px Ink (#201d1d) border, 1600px radius, 8px vertical padding. Contains a 'Menu' trigger on the left, centered wordmark, and a Login button (ghost) + Join button (Volt #a1ff62 fill, Ink text) on the right. No shadow — it sits flat.

### Volt CTA Button
**Role:** Primary action

Filled lime (#a1ff62) pill button with 1600px radius, Ink (#201d1d) text at 16px Haffer VF weight 700, 8px 20px padding. The signature call-to-action — always reads as 'switched on' against the concrete canvas.

### Ink Pill Button
**Role:** Secondary action

Filled near-black (#151313) pill with 1600px radius, Concrete (#f4f4f4) text, same 8px 20px padding as Volt. Used when a second action needs weight without competing with the primary.

### Ghost Text Link
**Role:** Inline navigation

Ink (#201d1d) text at 14–16px Haffer VF with no underline by default. On hover, a 2px Ink bottom border slides in. Often wrapped in a 48px-radius pill for button-like click targets.

### Product Resource Card
**Role:** Showcase individual resources or tools

Dark card (#151313 background) with 5px radius and 1px Charcoal (#312e2e) border. 16px internal padding. Contains a product title in Concrete text (Haffer VF 16px) and a mono sub-label in Haffer Mono 11px at #b8b8b8. Cards are displayed at slight rotation angles in a fan layout.

### Featured Testimonial Card
**Role:** Social proof block

Ultraviolet (#6840ff) background, 5px radius, 24–32px padding. Headline in Concrete (Haffer XH 40–48px, letter-spacing -1.44px). Avatar circle (80px) + name in Haffer VF 16px + role badge in Volt pill. Quote body in Concrete at 16px Haffer VF.

### Volt Badge
**Role:** Tags, status indicators, course labels

Volt (#a1ff62) fill with 2px or 1600px radius depending on context, Ink (#201d1d) text in Haffer Mono 11px or Haffer VF 12px weight 700, 3px 8px padding. Used for 'NEW' tags, course markers, and live status.

### Video Reel Thumbnail
**Role:** Inline video preview

Dark image card (#151313) with 2px radius, 16px padding at the bottom for the title overlay. White play icon centered, duration timestamp in top-right in Haffer Mono 11px Concrete.

### Mono Tag Strip
**Role:** Marquee of course/resource labels

Horizontal scrolling strip of small badges: Concrete background, 2px Ink border, 1600px radius, 2px 8px padding, Haffer Mono 11px Ink text. Often prefixed with a green '✱' marker for new items.

### Globe/Map Component
**Role:** Community visualization

Oval-shaped (border-radius that creates an ellipse, around 160px vertical) dark surface (#151313) with a dotted circular border at 1px Smoke (#b8b8b8) dashed. Contains a stylized world map silhouette in Ink with Volt accent on a single region. Volt handwritten label underneath.

### Annotation Callout
**Role:** Handwritten emphasis

Vermillion (#f84131) text in Brisa Pro 25px with lh 0.80, paired with a small hand-drawn arrow stroke. Appears sparingly to point at UI elements and add editorial commentary. No background, no border — pure marker scrawl.

### Input Field
**Role:** Form text input

Ash Gray (#eaeaea) background, 1px Charcoal (#312e2e) border, 5px radius, 10px 12px padding. Placeholder text in Steel (#7a7a7a) Haffer VF 14px. Focus state adds a 2px Volt (#a1ff62) outer ring.

### Dotted Radial Divider
**Role:** Decorative section separator

A perfect circle rendered as a dashed/dotted 1px Smoke (#b8b8b8) stroke at large diameters (400–600px). Contains no content but marks the center point of compositions. Functions as visual punctuation between sections.

## Do's and Don'ts

### Do
- Use Haffer XH (or a compressed display sans) for any text above 40px — the extreme vertical compression (lh 0.85–0.95) and tight tracking are the signature
- Reserve Volt (#a1ff62) for brand moments: badges, fills on the primary CTA, and feature callouts. Never dilute it as a background or body color
- Pair sharp 2–5px corners on content tiles with 1600px pill radii on buttons and badges — the contrast between machine-precise and chunky-rounded is the visual identity
- Use Concrete (#f4f4f4) as the default canvas and Ash Gray (#eaeaea) for the first surface elevation; reserve Ultraviolet only for the single most important card per section
- Set body text at 16–19px Haffer VF with -0.007em to -0.02em tracking — the negative letter-spacing at all sizes gives the system its typographic snap
- Stamp technical metadata in Haffer Mono at 9–12px: course names, version tags, timestamps. Mono is for facts, not narrative
- Place Vermillion (#f84131) only as annotation text in the handwritten Brisa Pro style — never as a fill, border, or background

### Don't
- Don't apply soft 8–12px radii to content cards — the system only uses 2px (sharp) or 5px (slight) for tiles. Rounding belongs on pills only
- Don't introduce gradients, drop shadows, or glassmorphism — the aesthetic is flat, concrete, and stamp-printed
- Don't use Ultraviolet (#6840ff) as a button fill or for body text — it is exclusively a featured-card surface color
- Don't set display text above 64px in Haffer VF or any workhorse sans — large sizes belong only in Haffer XH or equivalent compressed display faces
- Don't use warm grays or off-tone neutrals — the palette stays strictly in cool/achromatic concrete tones (#f4f4f4 through #151313)
- Don't add more than three chromatic colors to any single screen — the system runs on restraint, and additional hues break the editorial discipline
- Don't use letter-spacing of 0 or positive values on display sizes — negative tracking from -0.03em to -0.06em is required at 60px and above

## Surfaces

- **Canvas** (`#f4f4f4`) — Page background — the concrete gray that everything composes on
- **Card Surface** (`#eaeaea`) — Elevated card backgrounds, input fields, secondary panels
- **Brand Surface** (`#a1ff62`) — Volt lime used as accent fill for badges, tags, and feature callouts
- **Feature Surface** (`#6840ff`) — Ultraviolet used for featured content cards — testimonials, highlighted sections
- **Inverse Surface** (`#151313`) — Dark product cards, image overlays, maximum-contrast blocks

## Imagery

Imagery is sparse and editorial: dark product screenshots and UI captures presented as tilted cards fanning out from a central axis, like polaroids pinned to a board. Video reels appear as dark rectangles with centered play states. A dotted-line globe renders as a dark oval with a map silhouette and one Volt-highlighted region. The visual language is screenshot-first — real product artifacts rather than illustrations or lifestyle photography. The handwritten Vermillion annotation arrows add a magazine-editor layer, pointing at elements like a print proof markup. No 3D renders, no abstract gradients, no stock photography. The concrete gray background does the atmospheric work; imagery is content, not decoration.

## Layout

Page is a full-width concrete canvas with a centered max-width 1200px content column. Hero is text-dominant: oversized display headline centered, a smaller body paragraph below, then a horizontal fan of tilted product cards spread across the lower third at -5° to +5° rotations. Navigation is a floating pill bar at the top, not a full-bleed header. Sections flow vertically with 64px gaps, alternating between centered text blocks and two-column split compositions (text left, artifact right). A large dotted circle appears as a vertical-axis marker between sections, creating an invisible plumb line down the page center. Feature grids are 3-column on desktop. Testimonial and feature cards are placed inside colored surfaces (Ultraviolet, Volt) that break the neutral palette at carefully spaced intervals. The overall rhythm is: quiet concrete → loud color card → quiet concrete — like a typeset magazine spread.

## Similar Brands

- **Linear** — Same monochrome-first discipline with a single vivid accent color and compact, content-dense layouts
- **Vercel** — Identical approach of concrete-gray canvas, near-black text, and tight display typography with one chromatic accent moment per page
- **Resend** — Same brutalist-developer aesthetic with oversized compressed headlines and pill-rounded CTAs on flat neutral surfaces
- **Framer** — Editorial product-showcase layouts with tilted card fans, extreme display type, and restrained color punctuation
- **Railway** — Compact dark-card product grids, mono technical labels, and the same flat-stamp visual attitude toward UI
