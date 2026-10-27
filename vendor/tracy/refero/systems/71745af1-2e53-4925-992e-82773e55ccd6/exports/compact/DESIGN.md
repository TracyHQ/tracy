# ONE — Style Reference
> art monograph on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ONE is an editorial gallery: warm paper-white canvas, hairline-thin type, and black ink that does all the work. The interface disappears so that dark cinematic video plates and a slowly cycling manifesto can carry the page. Almost everything is monochrome — a single warm off-white background, true black for text and rules, and one soft gray for muted states. Pill-shaped ghost controls float at the edges, the wordmark sits top-left as a quiet signature, and the right edge holds a single contact affordance. Components are thin: 1px borders, generous padding, 999px buttons, and no shadows or gradients. The mood is curated, unhurried, book-like — the type does not shout, it annotates.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Primary text, hairline borders, video frame outlines, pill button stroke — the only chromatic event in the UI |
| Paper | `#fbfbfa` | Soft icon strokes, subtle dividers, and low-emphasis decorative details. Do not promote it to the primary CTA color |
| Ash | `#bec0c5` | Muted text in the cycling manifesto, list dividers, inactive link tone — desaturated gray stays quiet next to ink |

## Typography

### MagicUiPro — Single-family system: body text and micro-headlines both sit in the 18–24px range at medium weight, with weight 600 reserved for the active manifesto item and button labels. The tight -0.01em tracking and modest size range mean type never breaks 24px — the page treats every word as a label, not a headline.
- **Substitute:** Söhne, Inter, General Sans
- **Weights:** 500, 600
- **Sizes:** 18px, 20px, 24px
- **Line height:** 1.0–1.4
- **Letter spacing:** -0.01em across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 18px | 1.4 | -0.18px |
| subheading | — | — | 20px | 1.2 | -0.2px |
| heading-sm | — | — | 24px | 1 | -0.24px |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **cards:** 12px
- **buttons:** 999px
- **videoFrames:** 12px

## Components

### Ghost Pill Button
**Role:** Primary navigation CTA (Contact)

999px radius, 1px Ink border on Paper fill, horizontal padding 19px, height ~36–40px. Text 18px weight 500 in Ink. The only button variant on the site — no filled, no link-style alternatives. Rests top-right of every screen.

### Wordmark
**Role:** Brand identity, top-left anchor

Plain text 'ONE' at 20px, weight 600, Ink on Paper. No logo glyph, no lockup — the brand name alone is the mark. Sits flush with the page edge with ~16px outer padding.

### Cinematic Video Plate
**Role:** Primary content surface

Full-bleed dark video embedded in a Paper canvas, 12px corner radius, ~720px max width centered, 16:9 aspect. Carries its own internal color (deep teal, amber sun) but lives inside the monochrome frame system. A circular play/pause control floats at center on a semi-transparent dark surface.

### Caption Block
**Role:** Annotation under video plates

Single short sentence at 18px weight 500, Ink on Paper, centered beneath the video. Generous 96px margin separates it from the video above — caption is treated as its own paragraph, not a subtitle.

### Cycling Manifesto List
**Role:** Repetitive, rhythmic brand expression

Vertical stack of 'ONE is X' statements, 18–20px weight 500, ~4px line spacing between items. Default items in Ash (#bec0c5); the active item flips to Ink at weight 600. No bullets, no numbers, no dividers — the type change is the only indicator. One item visible at a time emphasizes the active state, the rest dissolve into the background.

### Project Thumbnail
**Role:** Companion still alongside the manifesto

Small landscape image (~140×80px), 8–12px radius, Ink or soft color from the video plate. Sits to the left of the manifesto text, vertically aligned to the active item. Acts as visual ear to the text column.

### Top Navigation Bar
**Role:** Persistent page chrome

Full-bleed Paper background, transparent to the page, ~60–72px tall. Wordmark left, Ghost Pill Button right, both vertically centered. No center nav, no menu icon, no secondary links.

### Centered Play Control
**Role:** Video interaction state

48px circular surface, dark semi-transparent fill, white triangle glyph centered. Overlaid on the video plate at exact center — the only icon-sized element that breaks the Paper canvas.

## Do's and Don'ts

### Do
- Use only #000000 for text, borders, and outline strokes; #fbfbfa for any filled surface; #bec0c5 only for muted/secondary text and list dividers
- Set every button radius to 999px and every card/video frame radius to 12px
- Restrict type to 18px, 20px, and 24px at weight 500 or 600 with -0.01em letter-spacing
- Give video plates and section breaks at least 96px vertical breathing room
- Let the wordmark and Ghost Pill Button sit at the page edges with no centered nav or breadcrumbs
- Carry dark video content inside a 12px-radius frame rather than bleeding full-bleed against the Paper canvas
- Treat the manifesto list as a single column with weight/color as the only state indicator — no checkmarks, arrows, or icons

### Don't
- Do not introduce accent colors, brand hues, or saturated fills — the palette is strictly ink/paper/ash
- Do not add box-shadows, gradients, or background blurs to any surface
- Do not scale type above 24px or below 18px — both would break the label-scale system
- Do not use weight 400 or 700; the system is bound to 500 and 600 only
- Do not use square or 4px radii on buttons; pill is the only allowed control shape
- Do not add a filled/solid button variant; the Ghost Pill Button is the sole interactive pattern
- Do not add icons, badges, or secondary navigation in the header — the chrome is exactly two elements

## Elevation

The system has no elevation. All depth comes from inset video plates against the flat Paper canvas and from the weight/saturation change between Ink and Ash in the manifesto list. Shadows would break the printed-page metaphor.

## Surfaces

- **Paper** (`#fbfbfa`) — Page canvas — warm off-white reads as physical paper
- **Video Frame** (`#000000`) — Interior of the cinematic video plate — true black holds the dark footage
- **Play Overlay** (`#000000`) — Semi-transparent dark circle that hosts the play glyph over video

## Imagery

Imagery is exclusively dark, cinematic video: handheld natural-light footage of forests, water, and sunlit interiors, with deep teal, cyan, and warm amber color grades. Videos are contained inside 12px-radius frames on the Paper canvas — they never bleed full-bleed. No photography, no illustration, no 3D renders, no abstract graphics outside the video content. Icons are absent except for a single play triangle on a dark circular overlay. The visual density is extremely low — one video plate and one caption per section.

## Layout

Page is max-width ~1200px centered on a Paper canvas, but content within each section is independently centered rather than grid-aligned. The hero is a full-bleed dark video plate with no headline overlay. Sections alternate between single video+caption blocks and a three-column layout: small project thumbnail on the left, centered manifesto text stack in the middle column. Section gaps are 96px, section padding is 32px horizontal. Navigation is a single thin top bar — wordmark left, ghost pill right — with no center nav and no menu icon. The rhythm is vertical and reading-oriented: scroll down to encounter one video, one caption, one manifesto block, repeat.

## Similar Brands

- **Bureau Cool** — Same single-column Paper-canvas rhythm with a tiny wordmark, ghost contact button top-right, and full-bleed cinematic video as the primary content type
- **Active Theory** — Dark immersive video plates framed inside a minimal, type-only interface with no navigation chrome beyond a wordmark and a single CTA
- **Resn** — Creative-studio site that lets a cycling manifesto / 'is' list function as the main content block, with monochrome type and a paper-warm background
- **Manual** — Same restrained approach — warm off-white canvas, hairline type, pill button, and dark editorial photography/video as the only color
