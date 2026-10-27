# B150 — Style Reference
> Future workshop in film grain. Build bright ivory editorial sections around dark, human-scale product and creator imagery.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

B150 — future workshop in warm film grain. The system alternates an ivory editorial canvas with immersive, dark photographic moments, using near-black ink and warm-white type instead of cool digital neutrals. Huge, tightly tracked Geist headlines occupy decisive blocks of space, while Fragment Mono turns navigation, labels, and metadata into tiny technical annotations. Surfaces stay flat and lightly bordered; pill actions and rounded media frames soften the otherwise direct, poster-like composition.

## Colors

| Name | Value | Role |
|------|-------|------|
| Charcoal Ink | `#1f1915` | Primary text, dark photographic overlays, dark page bands, logo marks, and iconography |
| Workshop Ivory | `#f2efe9` | Page canvas, light hero fields, and broad editorial section backgrounds |
| Paper White | `#fffdf6` | Warm light text over dark media, light pill actions, and high-contrast light surfaces |
| Studio White | `#ffffff` | Filled pill actions, product-interface surfaces, and compact elevated media controls |
| Soft Paper | `#f7f5f1` | Large display text on dark imagery and the palest alternate surface |
| Drafting Line | `#e6e3dd` | Hairline borders, card fills, image frames, and dividers |
| Quiet Graphite | `#6b6661` | Secondary body copy and subdued supporting descriptions |
| Faded Graphite | `#8d8883` | Tertiary metadata, low-emphasis icons, and supporting labels |
| Signal Coral | `#fa725a` | Orange text accent for links, tags, and emphasized short phrases |

## Typography

### Geist — Primary editorial and interface family. Use 400 at 120px for display headlines; its -8px tracking and 0.93 line-height make the message read as a compressed poster rather than a conventional marketing headline. Use 500 for section titles, body hierarchy, and interface controls.
- **Substitute:** Arial, sans-serif
- **Weights:** 400, 500
- **Sizes:** 10px, 12px, 16px, 32px, 40px, 48px, 120px
- **Line height:** 0.93, 1.00, 1.12, 1.50, 1.70
- **Letter spacing:** -8px at 120px; approximately -2px at 48px; approximately -1.24px at 40px; approximately -0.99px at 32px; +0.5px at 16px; -0.3px at 10px

### Fragment Mono — Technical microtype for all-caps navigation, small labels, status text, and compact metadata. At 10px with +0.3px tracking, it gives the interface its workshop-inventory character against the expressive Geist display type.
- **Substitute:** IBM Plex Mono, monospace
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px
- **Line height:** 1.00, 1.33, 1.42, 1.50
- **Letter spacing:** +0.3px for tracked uppercase labels; -0.3px for compact utility text

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| nav | Fragment Mono | 400 | 10px | 1.5 | 0.3px |
| micro-label | Geist | 500 | 10px | 1.5 | -0.3px |
| body | Geist | 400 | 12px | 1.7 | 0px |
| button-label | Geist | 500 | 16px | 1.5 | 0.496px |
| section-title | Geist | 500 | 32px | 1.12 | -0.992px |
| display | Geist | 400 | 120px | 0.93 | -8.04px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 40px
- **Card padding:** 12px
- **Element gap:** 8px

### Border Radius

- **cards:** 16px
- **links:** 8px
- **images:** 8px
- **buttons:** 1440px
- **media-frame:** 16px
- **large-panels:** 24px

## Components

### Transparent Top Navigation
**Role:** Persistent public navigation over both light sections and dark hero media.

Use a 65px-tall horizontal bar with a 1px solid #e6e3dd bottom divider on light sections; over dark hero media, use a low-contrast light divider. Render the B150 wordmark at the far left and Fragment Mono navigation at 10px/400, 15px line-height, +0.3px tracking, uppercase.

### Light Pill Navigation Button
**Role:** Public conversion control in the header and light sections.

Use #ffffff or #fffdf6 fill, #1f1915 text, a 1px solid #e6e3dd border, 1440px radius, and 12px vertical padding with 16px or 20px horizontal padding.

### Dark Hero Glass Pill
**Role:** Conversion control placed directly over dark photography.

Use rgba(255,253,246,0.16) fill with a 1px solid rgba(255,253,246,0.32) border, #fffdf6 label text, 1440px radius, and 12px 20px padding.

### Photographic Display Hero
**Role:** Opening full-bleed editorial statement.

Fill the hero with muted, dark documentary photography; place the content in the left portion of the image and let the subject occupy the opposing side. Set the display headline in Geist 400 at 120px, 111.6px line-height, -8px tracking, and #f7f5f1; use #fffdf6 for the compact supporting copy.

### App Download Badge
**Role:** Compact platform-download action beside the hero pill.

Use a black #000000 rectangular badge with #ffffff iconography and lettering, 8px corner radius, and no visible shadow. Keep it visually smaller than the adjacent 1440px-radius pill.

### Floating Film Teaser
**Role:** Inset media control layered in the lower hero corner.

Wrap the video still in an rgba(255,253,246,0.32) container with 16px radius and 8px padding. Use an 8px-radius image inside, a centered #ffffff circular play control, and a small Fragment Mono caption beneath.

### Eyebrow Capsule
**Role:** Centered section label above editorial statements and logo strips.

Use a minimal outlined capsule with a 1px solid #e6e3dd border, 1440px radius, 8px horizontal internal gaps, and Fragment Mono 10px uppercase text. Pair with a small mono icon rather than a filled color marker.

### Editorial Statement Block
**Role:** Centered manifesto-style introduction.

Set large Geist 500 copy in #1f1915 on #f2efe9, centered in a narrow multi-line block. Keep the lettering tightly tracked at large sizes and leave a 40px gap before the product visual.

### Product Interface Frame
**Role:** Contained product showcase beneath a centered statement.

Present the interface screenshot on a #ffffff surface with 1px solid #e6e3dd framing and 16px corner radius. Preserve the pale product UI rather than placing it on a dark device mockup; use 32px internal padding when the frame includes surrounding content.

### Trusted By Logo Rail
**Role:** Partner and sponsor recognition strip.

Place monochrome or native-color logos in one horizontal rail bounded by 1px solid #e6e3dd rules. Use #f2efe9 as the field, an outlined mono eyebrow above, and 24px gaps between individual marks.

### Four-Column Resource Grid
**Role:** Text-led overview of network resources.

Use four evenly distributed columns on #f2efe9 with a small #8d8883 icon, Geist heading in #1f1915, and #6b6661 supporting copy. Separate columns with whitespace rather than card borders; use 16px internal text gaps and 24px column gaps.

### Pale Feature Card
**Role:** Contained supporting module for denser content.

Use #e6e3dd fill, no shadow, 16px radius, and 32px padding. Keep typography in #1f1915 and avoid saturated fills inside the card.

## Do's and Don'ts

### Do
- Use #f2efe9 as the default page canvas and #1f1915 for primary text.
- Set display headlines in Geist 400 at 120px with 111.6px line-height and -8px letter-spacing when using the full editorial hero treatment.
- Use Fragment Mono 10px with +0.3px tracking for uppercase navigation, labels, and metadata.
- Build public conversion buttons as #ffffff or #fffdf6 pills with 1440px radius, #1f1915 text, and 12px vertical padding.
- Use 1px solid #e6e3dd dividers and frames instead of shadows for light-section structure.
- Use 16px radius for cards and media containers, with 8px radius for inset images.
- Reserve #fa725a for compact availability or upcoming-status text.

### Don't
- Do not use blue, green, or purple as general interface accents; keep the working palette achromatic with #fa725a as the exception.
- Do not replace the 1440px button radius with rounded rectangles such as 8px or 16px.
- Do not use drop shadows on #ffffff, #fffdf6, or #e6e3dd cards.
- Do not set large headings in bold weights; use Geist 400 for the 120px display treatment and Geist 500 for subordinate headings.
- Do not use pure #ffffff as the broad page background when #f2efe9 is available.
- Do not turn the four-column resource layout into four heavy bordered cards.
- Do not use photographic imagery as bright stock imagery; retain dark, muted documentary treatment behind light hero type.

## Elevation

Avoid cast shadows entirely. Hierarchy comes from the #f2efe9 → #ffffff → #e6e3dd surface progression, 1px #e6e3dd frames, translucent light overlays on dark photography, and nested 8px or 16px rounded media edges.

## Surfaces

- **Workshop Ivory** (`#f2efe9`) — Default page canvas and broad editorial bands.
- **Soft Paper** (`#f7f5f1`) — Pale alternate field and light display text on dark imagery.
- **Studio White** (`#ffffff`) — Pills, product-interface surfaces, and compact elevated controls.
- **Drafting Line** (`#e6e3dd`) — Framed cards, rules, and muted feature panels.
- **Charcoal Ink** (`#1f1915`) — Dark hero overlays, dark page bands, and primary foreground.

## Imagery

Imagery is sparse but dominant where it appears: the opening visual is a full-bleed, darkened documentary-style photograph of a young maker holding a complex object, with subdued warm-gray color and no glossy color grade. Product screenshots are explanatory rather than decorative, presented as wide, contained pale interfaces with soft 16px frames. The only layered graphic treatment is the small film teaser, which uses a cropped still, centered play icon, and translucent rounded surround. Icons are tiny, mostly mono black or muted graphite line marks; the page remains text-dominant outside hero photography and product showcase sections.

## Layout

The page is a long, vertically sequenced editorial landing page on a #f2efe9 canvas, with a slim horizontal navigation bar repeated across the top. The opening screen breaks the light-page pattern with a full-bleed dark photographic hero: oversized left-aligned display text, compact supporting copy and actions below, a human subject centered or right-weighted, and a floating film teaser in the lower-right corner. Light sections return to centered statement blocks followed by wide contained product screenshots, then a ruled horizontal logo rail and spacious text-led resource modules. Content favors broad seams of empty canvas over dense stacking; the resource overview resolves into a four-column grid without heavy card treatment.

## Similar Brands

- **Vercel** — Shares restrained monochrome product presentation, dense technical micro-navigation, and large high-contrast editorial type.
- **Are.na** — Shares an editorial, community-network composition where pale canvas and small utility typography frame content rather than decorate it.
- **Linear** — Shares a tightly controlled dark-light surface system, compact mono-like metadata behavior, and minimal reliance on shadows.
- **Notion** — Shares warm off-white surfaces, black-first typography, sparse dividers, and product screenshots treated as primary content.
- **A24** — Shares dark cinematic photography paired with oversized quiet typography and an editorial rather than conventionally corporate page rhythm.
