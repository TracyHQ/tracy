# Obscura — Style Reference
> 8-bit arcade floating on cloud paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Obscura runs on a playful 8-bit arcade vocabulary pressed onto a soft, sky-toned paper canvas. The display type (Jersey 10) is the visual signature: chunky pixel letterforms that read like Game Boy subtitles, paired with the calm, modern geometry of Manrope for everything that needs to be read. A single vivid orange (#ff5e24) does the loud work — CTA fills, link hovers, hero emphasis, card borders — while the rest of the system stays in cream, sky-blue, and graphite. Surfaces float on a pale #e3f1fe cloud with hairline borders and whisper-soft shadows; the page feels like a pixel-art console wallpaper you actually want to live inside. The mood is privacy-as-playfulness, not privacy-as-fortress.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Orange | `#ff5e24` | Primary CTA fill, hero headline emphasis, active nav link, card accent border, hover state — the single chromatic voice that earns every pixel it touches |
| Ember Crust | `#6c3200` | Footer background, dark-mode brand block — used where the orange needs to recede into a deep, warm base |
| Cloud Mist | `#e3f1fe` | Page canvas tint, card surface wash, secondary button border, decorative fill behind pixel art — the soft sky that everything floats on |
| Graphite Ink | `#232629` | Primary text, nav links, icon strokes, body copy — the near-black with a cool cast that keeps the page from feeling sterile |
| Paper White | `#ffffff` | Card surface, button text on dark fills, nav background, app-window chrome — the brightest readable layer |
| Slate Pencil | `#5c6066` | Secondary body text, subdued button labels, muted icon fills — the tone of helpful but unhurried copy |
| Ash Mist | `#989ea4` | Tertiary text, placeholder, disabled icon color, decorative pixel tints — the quietest readable neutral |
| Blush Shadow | `#dbced0` | Warm-tinted shadow base for card elevation — keeps shadows from looking blue-cold against the cream surface |
| Midnight Ink | `#101828` | Headline text and strong links where the orange isn't appropriate — a rare, almost-black alternative |

## Typography

### Jersey 10 — Display and headline type only — the chunky pixel font that names the brand. Used for hero, section headings, and any title that needs to feel like a Game Boy boot screen. Never for body or UI labels.
- **Substitute:** Press Start 2P, VT323, Pixelify Sans
- **Weights:** 400, 500
- **Sizes:** 36px, 48px, 60px, 72px, 96px
- **Line height:** 0.70, 0.80, 0.85, 1.00, 1.11
- **Letter spacing:** -0.0310em at 96px, -0.0250em at 36-72px

### Manrope Variable — Body, nav, button labels, links, small UI text, captions. Carries all the prose and functional copy so the pixel font can stay loud. Weight 600-700 for emphasis, 400 for paragraphs, 500 for buttons and nav.
- **Substitute:** Inter, Plus Jakarta Sans, DM Sans
- **Weights:** 400, 500, 600, 700, 800
- **Sizes:** 12px, 14px, 16px, 18px
- **Line height:** 1.33, 1.43, 1.50, 1.56, 1.75
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.56 | — |
| heading-sm | — | — | 36px | 1.11 | -0.9px |
| heading | — | — | 48px | 0.85 | -1.2px |
| heading-lg | — | — | 60px | 0.85 | -1.5px |
| display | — | — | 96px | 0.8 | -3px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **nav:** 6px
- **cards:** 12px
- **links:** 6px
- **images:** 24px
- **buttons:** 6px
- **cardsLarge:** 16px
- **featurePanels:** 32px

## Components

### Primary CTA Button
**Role:** The single filled-orange action — the loudest element on any page

Filled #ff5e24 background, white text in Manrope 500 at 16px, 6px radius, padding 8px 16px or 16px 32px. Carries an inset orange-tinted shadow + 1px orange outer ring to read as 'pressed in'. Right-arrow icon in white sits to the right of the label. Never outlined, never ghost for the primary.

### Secondary Outlined Button
**Role:** Low-emphasis alternative to the orange CTA

Transparent fill, 1px border in #e3f1fe (Cloud Mist), Graphite Ink text at Manrope 500 16px, 6px radius, same 8px/16px vertical padding as primary. Soft Cloud Mist outer shadow. Used for 'Manage Account' and similar utility actions.

### Ghost Text Link
**Role:** Inline and nav-link clickable text

No background, no border, Graphite Ink (#232629) at Manrope 500 14-16px. Underline appears on hover in Signal Orange. Active state in nav uses orange text + 1px orange ring shadow.

### Hero Section
**Role:** First-fold brand statement

Centered stack on Cloud Mist (#e3f1fe) canvas. Jersey 10 at 96px / 60px for the two-line headline — first line in Graphite Ink, second line in Signal Orange for contrast. Body sentence in Manrope 400 16px, Slate Pencil color, max-width ~560px. Primary CTA centered below. Pixel-art cloud sprites float around the edges as decoration, never cropped by the container.

### Feature Card
**Role:** Mid-page content panels with illustration

White (#ffffff) surface, 12px radius, 16px internal padding, Soft border in #e3f1fe. Multi-layer blue-tinted shadow stack (the 4-layer rgba(15,34,52,…) pattern). Jersey 10 heading at 36-48px in Graphite Ink, Manrope body below in Slate Pencil. Pixel illustration or icon sits above the heading.

### App Window Mockup
**Role:** Product UI screenshot embedded in marketing

Rounded 12-16px outer radius. macOS-style traffic-light row (red, yellow, green dots) in top-left. Internal sidebar with nav items — active item gets a blue (#e3f1fe) pill background. Main panel is white with a status card showing 'Connected to [City]' in Signal Orange, a green check icon, and a ghost 'Disconnect' button in pale red/pink.

### Status Pill (Connected / Disconnected)
**Role:** Inline state indicator inside app mocks and trust badges

Manrope 500 14px, white text, 6px radius, full padding 6px 12px. Connected = #ff5e24 fill. Disconnected = soft pink/coral fill with dark text. Always paired with a small check or cross icon to the left of the label.

### Pixel Cloud Sprite
**Role:** Decorative 8-bit cloud graphic scattered across hero and section dividers

Hand-drawn pixel cloud, ~3-4 shades of #e3f1fe and #ffffff to suggest depth, with a thin #5c6066 1px outline. Always 2-3 sprites per section, never centered — they drift into corners and edges. No shadow, no gradient — pure flat pixel blocks.

### Footer Block
**Role:** Bottom-of-page dark warm surface

Full-width #6c3200 (Ember Crust) background. White and warm-cream text in Manrope 400-500. Sits as a tonal contrast to the sky-blue page — the only dark surface on the entire site.

### Navigation Bar
**Role:** Top sticky header with logo, links, and account controls

Transparent or white background, no visible border. Logo 'obscura' left in Manrope 700 lowercase Graphite Ink. Centered nav links in Manrope 500 14px. Right cluster: 'Manage Account' as ghost text link + 'Get Started' as the orange CTA with 6px radius. Active nav item gets the orange ring inset shadow.

### Inline Pixel Mascot
**Role:** Branded character (cat) appearing in product mocks and section accents

Tiny pixel-art cat or robot in Manrope-orange and warm grays, ~40-80px tall. Appears in app mockup sidebar, as a section accent, and in the hero lower-left. No outlines other than the pixel grid itself — flat 1-2 color fill per block.

### Section Divider (Pixel Cloud Cluster)
**Role:** Visual breath between content sections

A 2-3 cloud sprite cluster sitting in the negative space between sections, always off-center. No text, no line — the clouds ARE the divider. Uses the same Cloud Mist palette as the page canvas.

## Do's and Don'ts

### Do
- Use Jersey 10 for every display heading (36px and above) — it's the brand's voice and the fastest way to make a page read as Obscura.
- Keep the CTA palette disciplined: one Signal Orange (#ff5e24) fill per screen, nothing else in that color slot.
- Let the Cloud Mist (#e3f1fe) canvas do atmospheric work — apply it as a full-bleed page background, not just card fills.
- Pair the two display line-heights intentionally: 0.80-0.85 for multi-line heroes so the pixel font stacks tightly, 1.11 for single-line section heads that need breathing room.
- Use 6px radius on all interactive elements (buttons, nav pills, tags) and reserve 12px+ for cards and app mocks — the contrast in corner softness is part of the system.
- Anchor every page with 1-2 pixel cloud sprites drifting in the corners; a page without them loses its arcade personality.
- Apply the orange-ring inset shadow to the active nav state and focused primary button only — it signals interaction without color-shifting.

### Don't
- Don't use Jersey 10 for body text, button labels, nav links, or any UI copy below 36px — the pixel grid becomes unreadable.
- Don't introduce a second brand color. Blue-tinted surfaces (#e3f1fe) are atmospheric, not chromatic — they are not 'blue accents'.
- Don't apply the Signal Orange to large background fills; the orange is for small punctuation (buttons, emphasis words, active states, borders) only.
- Don't use pure black (#000000) for text — the Graphite Ink (#232629) cool cast is what keeps the cream surface from looking dead.
- Don't stack elevation: a card uses exactly one shadow pattern. Adding a second outer ring or glow breaks the soft, paper-like feel.
- Don't use sharp 0px corners on feature cards — 12-16px radius is the floor for any panel surface.
- Don't place pixel cloud sprites centered, behind text, or larger than ~120px — they should always feel like a sky decoration, not a feature illustration.

## Elevation

- **Standard Card:** `rgba(15, 34, 52, 0.01) 0px 27px 11px 0px, rgba(15, 34, 52, 0.02) 0px 15px 9px 0px, rgba(15, 34, 52, 0.04) 0px 7px 7px 0px, rgba(15, 34, 52, 0.04) 0px 2px 4px 0px`
- **Elevated Card:** `rgba(0, 0, 0, 0.01) 0px 49px 30px 0px, rgba(0, 0, 0, 0.03) 0px 22px 22px 0px, rgba(0, 0, 0, 0.03) 0px 5px 12px 0px`
- **Active Nav / Focused Button:** `rgba(255, 94, 36, 0.17) 0px 0.5px 0.5px 0.5px inset, rgba(153, 37, 18, 0.2) 0px -1px 0.5px 0px inset, rgb(255, 94, 36) 0px 0px 0px 1px`

## Surfaces

- **Sky Canvas** (`#e3f1fe`) — The page-wide pale-blue tint that gives the entire site its cloud-paper atmosphere
- **Card Paper** (`#ffffff`) — Lifted card and content-panel surfaces — the default elevated reading surface
- **App Window** (`#f5f5f7`) — macOS-style chrome behind product UI — slightly cooler than card paper to recede
- **Ember Ground** (`#6c3200`) — Footer block — the dark warm surface that anchors the page

## Imagery

Obscura runs on hand-built 8-bit pixel art rather than photography or 3D renders. The visual vocabulary is Game Boy / NES sprite work: flat-color pixel blocks, 1-2 shades per object, no anti-aliasing, no gradients inside the art. Three recurring subjects carry the system — pixel clouds (the most-used motif, drifting in cream and sky-blue tones), a small pixel cat/robot mascot (orange and warm gray, appears in app mocks and section corners), and the macOS-style app window containing the product UI. Product screenshots are styled with real window chrome (traffic-light dots, sidebar nav) so the product feels native to a desktop. There is no photography, no stock imagery, no abstract gradient blobs. Illustrations are always flat-outlined or flat-filled, always contained inside cards or floating in the page margin, never overlapping text blocks. The pixel art carries mood (playful, retro, privacy-as-adventure) while the product UI screenshot carries credibility (real, installed, usable).

## Layout

Page layout is max-width contained (1200px) on a full-bleed Cloud Mist (#e3f1fe) canvas. The hero is centered-stack: a two-line pixel headline, a single short paragraph, a single orange CTA, and two ghost platform options below — with pixel cloud sprites floating in the negative space to the left and right. Sections stack vertically with 48px gaps and breathe generously; there are no hard horizontal dividers, the cloud sprites do the visual separation. Content alternates between centered single-column (hero, CTA bands) and 2-column text-plus-card (feature explanations, where the left text block pairs with a right-side card mockup or pixel illustration). Card grids appear as 2- and 3-column at desktop, collapsing to single column on mobile. The app-window mockup sits as a large, centered hero element below the fold, stretching to the edges of the content column. Navigation is a single top bar — logo left, centered links, account cluster right — transparent or white, no sticky shadow. Footer is a single full-bleed dark band in Ember Crust (#6c3200), breaking the otherwise all-cream rhythm.

## Similar Brands

- **1Password** — Same friendly-privacy tone with a single warm accent color and clean white-on-cream surfaces, though Obscura leans more playful with its pixel font.
- **Proton Mail** — Comparable trustworthy-privacy palette logic — near-black text on white, single brand color doing the action work, minimal decorative noise.
- **Linear** — Shares the 'one chromatic accent against a quiet neutral canvas' discipline and the restrained, modern Manrope-grade body type paired with a strong display voice.
- **Oh My Zsh / Pixel-art developer tools** — Same 8-bit retro typography and cloud-sprite decoration vocabulary, though Obscura uses it for marketing warmth rather than terminal nostalgia.
