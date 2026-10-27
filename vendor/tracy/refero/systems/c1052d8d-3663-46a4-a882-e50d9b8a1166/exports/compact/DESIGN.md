# Joby Aviation — Style Reference
> Golden hour cockpit over a sleeping city — every screen is a window seat.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Joby Aviation's design language is cinematic aviation editorial: full-bleed golden-hour photography carries the narrative, with a warm parchment canvas (#f5f4df) and near-black ink (#0e1620) doing all the structural work. The interface stays minimal and almost invisible so the imagery does the persuading — text overlays float over photographs with thin left-border accents rather than boxed containers. Vivid electric blue (#007ae5) appears only as functional punctuation on floating cards, the bottom tour strip, and select icon strokes, while the custom Joby Display type at near-200px sizes whispers the headline rather than shouts it. Components are light, floating, and round; even the tour card and small chips use generous 16px radii, and the navigation is reduced to a centered logomark with a hamburger and a single text link. The system never decorates — every surface is either a photograph, the warm cream canvas, or a single solid blue band.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Cream | `#f5f4df` | Page canvas, card surfaces, text color on dark imagery — the warm off-white that keeps photography from feeling cold |
| Carbon Ink | `#0e1620` | Body text, headings, hairline borders, icon strokes — near-black with a cool blue undertone that pairs with the cream |
| Pale Sky | `#c1dfef` | Soft secondary surface wash, subtle section backgrounds when cream needs contrast |
| Shadow Khaki | `#abab9c` | Warm gray used in card box-shadow tinting — gives elevation a warm cast rather than a cold blue |
| Electric Blue | `#007ae5` | Blue wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Deep Cobalt | `#1c3f99` | Secondary brand surface for navigation bars and accent fills — darker register of the blue for layering |
| Outlined Action | `#083e6f` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Sunset Orange | `#eb6110` | Warm accent fill for decorative highlights and select illustration elements — echoes the golden-hour photography palette |
| Peach Glow | `#ffd9c9` | Soft warm surface accent, peachy wash that harmonizes with the sunset photography |
| Signal Blue | `#319fff` | Brighter blue accent for small icon and illustration highlights — lighter pop than the primary Electric Blue |

## Typography

### jobyDisplay — Display headlines and hero text. Sizes scale dramatically from 40px to 207px with tight tracking (-0.03em at the largest sizes) — the near-200px display weight is the signature: whisper-light at colossal scale, the opposite of typical bold-hero convention. Used for hero copy ('Skip traffic. Time to fly.') and section display headlines.
- **Substitute:** Inter Display or a geometric grotesque with low contrast and generous x-height
- **Weights:** 500, 550
- **Sizes:** 10px, 18px, 24px, 28px, 40px, 48px, 64px, 80px, 141px, 207px
- **Line height:** 1.00, 1.05, 1.20
- **Letter spacing:** -0.0300em, -0.0200em, -0.0100em

### jobyText — All body copy, navigation, badges, footer, and inline links. The 450 weight is distinctive — a custom intermediate weight between Regular and Medium that gives body text a subtly heavier presence than a standard 400. Tight letter-spacing (-0.01 to -0.02em) even at body sizes reinforces the display font's compressed character.
- **Substitute:** Inter or a humanist sans with similar weight gradations
- **Weights:** 400, 450, 500, 550
- **Sizes:** 12px, 14px, 16px, 18px
- **Line height:** 0.89, 1.00, 1.20, 1.30, 1.40
- **Letter spacing:** -0.0200em, -0.0100em

### Joby Sans Display — Micro-display usage at 12px for labels and tags that need display-type personality at small scale — -0.03em tracking gives these tiny labels the same compressed character as the 200px headlines
- **Substitute:** Same family as jobyDisplay at 12px
- **Weights:** 500
- **Sizes:** 12px
- **Line height:** 1.20
- **Letter spacing:** -0.0300em

### Arial — System fallback for button text and icon-adjacent micro-copy where system font rendering is preferred
- **Substitute:** Arial
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.36px |
| body-sm | — | — | 14px | 1.3 | -0.14px |
| body | — | — | 16px | 1.4 | -0.16px |
| body-lg | — | — | 18px | 1.3 | -0.18px |
| subheading | — | — | 28px | 1.2 | -0.56px |
| heading-sm | — | — | 40px | 1.05 | -1.2px |
| heading | — | — | 64px | 1.05 | -1.92px |
| heading-lg | — | — | 80px | 1 | -2.4px |
| display | — | — | 207px | 1 | -6.21px |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 113px
- **Card padding:** 40px
- **Element gap:** 8-32px

### Border Radius

- **cards:** 16px
- **buttons:** 8px
- **asymmetric:** 147.6px
- **promoCards:** 160px

## Components

### Floating Promo Card
**Role:** Promotional overlay card for campaign announcements (e.g. 'Electric Skies Tour')

Electric Blue (#007ae5) solid background, white text, 16px corner radius, ~32px padding. Positioned floating top-right of hero. Contains a small kicker label, a display-size headline, a thin white close-button circle, and a miniature product illustration. The card reads as a single bold chromatic moment against the dark photographic hero.

### Cinematic Full-Bleed Hero
**Role:** First-viewport hero using full-bleed photography

Edge-to-edge photographic image with no visible container. White or cream headline text overlaid at the lower-center in jobyDisplay at 64-80px, weight 500, tracking -0.03em. The text floats directly on the image with no card or background plate — the photography provides the contrast.

### Bordered Caption Block
**Role:** Short editorial text overlay on photography

Body text at 16px in Parchment Cream (#f5f4df) over dark imagery. Marked by a 2-4px vertical left-border accent line in cream. No background fill, no padding box — just the text and a thin guide line. Max width ~320px, positioned lower-left. The left border is the only structural element.

### Centered Logomark Navigation
**Role:** Minimal top navigation bar

Transparent bar over hero photography. Joby wordmark and aviation mark centered in white. Hamburger icon (two horizontal lines) at far left in white. A single 'Investors ↗' text link at far right in white, jobyText 16px weight 500. No background fill, no shadow, no border — the bar dissolves into the photograph.

### Saturated Banner Strip
**Role:** Full-width tour/event announcement band

Full-bleed Electric Blue (#007ae5) horizontal band, ~60-80px tall. Centered white text in jobyText 16px weight 500, tracking -0.01em. Single line of copy. No border, no rounded corners — sits as a sharp color transition at the page base.

### Outlined Icon Button
**Role:** Ghost/secondary action control

No background fill. Outlined Action (#083e6f) border at 1-2px, 8px radius. Icon centered in Outlined Action color. Sized approximately 40-48px square. This is the preferred action pattern: a chromatic border replaces a filled background so the control stays visually quiet against the cream canvas or photography.

### Warm Card Surface
**Role:** Content card on the cream canvas

Parchment Cream (#f5f4df) background with box-shadow in Shadow Khaki (#abab9c) at low opacity, giving the elevation a warm cast rather than a cold blue. 16px corner radius. 40px internal padding. Hairline border in Carbon Ink (#0e1620) at low opacity sometimes replaces the shadow for flatter compositions.

### Asymmetric Rounded Container
**Role:** Editorial content block with extreme corner curvature

Uses 160px or 147.6px corner radii — the intentionally asymmetric, near-circular rounding that signals a featured/promotional treatment. Always used for premium or hero-adjacent content. Carbon Ink text on Parchment Cream or Electric Blue fill.

### Footer Link List
**Role:** Footer navigation columns

jobyText 14px weight 450 in Carbon Ink, 15-26px horizontal padding between items, 32px vertical rhythm. Underlined link state in Outlined Action (#083e6f) at 14px. No visible dividers or backgrounds — the footer reads as a clean text grid.

### Hairline Divider
**Role:** Section separator

1px horizontal line in Carbon Ink (#0e1620) at ~10-20% opacity, or in Parchment Cream at similar opacity when over dark imagery. Used to separate content sections without adding visual weight.

### Dark Image Overlay
**Role:** Text contrast layer on photography

No actual overlay — text uses pure Parchment Cream (#f5f4df) at 16.4:1 contrast against the darkest parts of the photograph. The contrast ratio is designed into the photography, not achieved with a scrim.

## Do's and Don'ts

### Do
- Use jobyDisplay at 48-207px with tracking between -0.01em and -0.03em for all headlines — the compressed, large-scale typography is the brand's primary signature
- Default all content surfaces to Parchment Cream (#f5f4df) with Carbon Ink (#0e1620) text — the warm/cool duotone is the structural backbone
- Reserve Electric Blue (#007ae5) for floating cards, the bottom banner strip, and single-color accent moments — never tile it across large areas
- Use outlined actions with Outlined Action (#083e6f) borders at 8px radius instead of filled buttons — the ghost control pattern keeps the interface quiet against photography
- Apply 16px radius to standard cards and 160px radius to featured/promotional containers — the radius itself signals content importance
- Float body text directly over photography with a 2-4px left-border accent in cream rather than wrapping it in a card or scrim
- Maintain generous spacing: 40px card padding, 32px vertical rhythm, 8-32px element gaps — the spacious density lets the photography breathe

### Don't
- Do not use filled rectangular CTA buttons — the system uses outlined actions, floating cards, or text links instead
- Do not apply standard gray or blue-tinted drop shadows — the only shadow is the warm khaki glow on cream cards
- Do not use bold (700+) weight for headlines — jobyDisplay's signature is weight 500-550 at extreme sizes, not heavy weight at moderate sizes
- Do not add dark scrims or background plates behind text on photography — the contrast is built into the image itself
- Do not use multiple saturated colors in one composition — Electric Blue, Cobalt, and Sunset Orange each appear in isolated moments, never together
- Do not apply system fonts (Arial, Helvetica) to headlines or body — they are fallback only for 13px button text
- Do not add gradients, patterns, or decorative backgrounds — every surface is either solid cream, solid blue, or a photograph

## Elevation

- **Warm Card Surface:** `0px 0px 40px 0px rgba(171, 171, 156, 0.4)`

## Surfaces

- **Imagery Layer** (`#0e1620`) — Full-bleed photography and dark cinematic backgrounds — the dominant first impression
- **Parchment Canvas** (`#f5f4df`) — Default content surface for all editorial text sections, cards, and structural blocks
- **Pale Sky Wash** (`#c1dfef`) — Subtle alternative surface for section contrast against the cream
- **Electric Blue Band** (`#007ae5`) — Saturated accent surface for the bottom tour strip and floating promo card
- **Cobalt Depth** (`#1c3f99`) — Darker blue layer for navigation chrome and stacked accent surfaces

## Imagery

Photography is the primary visual asset and dominates the page. All imagery is cinematic, golden-hour aerial photography shot from inside an eVTOL cockpit looking out over a sleeping city skyline. The treatment is full-bleed, no rounded corners, no masks — images extend to all edges of the viewport. The lighting is consistently warm sunset/dawn with deep amber highlights and cool blue-grey city silhouettes, giving every image a built-in duotone that matches the Parchment Cream and Carbon Ink palette. Product illustrations appear only inside the floating Electric Skies promo card (small eVTOL render in white/blue line art). No lifestyle photography, no people in staged settings — the single human figure is a silhouetted passenger in the cockpit, visible only as a dark shape against the window. The photography is documentary in feel, not aspirational: the viewer is a passenger, not a spectator.

## Layout

The page is a full-bleed single-column experience with no visible grid or sidebar. The hero occupies the full viewport with centered text overlaid on the photograph. Below the hero, a saturated Electric Blue banner strip spans the full width. Content sections alternate between full-bleed photography (with text overlays) and the warm cream canvas. A centered logomark navigation sits at the top with a hamburger left and a single text link right — no horizontal nav bar, no mega-menu. Text blocks are left-aligned with a thin vertical accent border, max-width ~320px, positioned lower-left of the frame. The layout rhythm is: full-bleed photo → cream text section → full-bleed photo → cream text section, with no visible card containers or boxed layouts. The generous section gap (113px) and the spacious density make the page feel like flipping through a premium print magazine rather than navigating a website.

## Similar Brands

- **Lilium** — Same eVTOL aviation category with full-bleed cinematic photography and minimal UI overlay
- **Archer Aviation** — Same warm/cool duotone palette (cream + deep ink) with single electric blue accent and oversized display headlines
- **Tesla** — Same ghost-button + minimal-chrome approach with full-bleed product photography as the primary visual
- **Rivian** — Same spacious editorial layout with photography-first composition and quiet, restrained UI chrome
