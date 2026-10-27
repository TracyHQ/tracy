# HNST Studio — Style Reference
> earthy atelier with rust on linen — a slow-fashion gallery where a single burnt-orange accent warms an otherwise monastic cream and charcoal interior

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

HNST Studio speaks in a warm, earthy editorial language: bone-white canvases tinted with raw silk cream, a single rust accent that anchors every interactive moment, and gallery-style uppercase typography that lets the photography breathe. The site treats full-bleed fashion imagery as the primary surface — text and chrome are whisper-thin, positioned like museum placards around the visual work. Two type families divide labor cleanly: Raleway handles UI, navigation, and body copy in humanist proportions, while Poppins takes display headings with extreme letter-spacing, turning section labels like 'TRENDING' into printed gallery signage. Components are stripped to essentials — thin borders, soft sand-toned badges, charcoal ink for action, no shadows, no gradients — so the rust accent lands with editorial gravity against the otherwise neutral palette.

## Colors

| Name | Value | Role |
|------|-------|------|
| Rust Hearth | `#892500` | Brand logo, active navigation state, section underlines, the only chromatic punctuation in the interface — carries identity weight wherever it appears |
| Blush Whisper | `#ea9195` | Secondary chromatic accent for hover states, soft tags, and paired decorative elements — never standalone, always supporting Rust Hearth |
| Linen | `#ffffff` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Raw Silk | `#f9f6f2` | Warm off-white page background — replaces sterile pure white to give the site a tactile, natural-fiber feel |
| Sand Plaster | `#eee5d9` | Card backgrounds, badge fills, soft surface lifts — the warm secondary tier that differentiates containers from the page canvas |
| Charcoal Ink | `#0e0e0e` | Primary text, navigation text, filled action buttons, dark hero overlays — near-black reads softer than pure black against the warm neutrals |
| Stone | `#868686` | Mid-gray for hairline borders, dividers, secondary metadata, inactive UI scaffolding — the dominant structural neutral |
| Ash | `#b7b7b7` | Lighter borders, muted helper text, disabled states, subtle list separators |
| Frost | `#d7d7d7` | Faintest divider lines on links, barely-there separators |

## Typography

### Raleway — Primary UI and body typeface — humanist sans with elegant terminals. Used for navigation, body copy, links, buttons, and footer. The 600 weight handles button labels and nav items; 400 carries running text with generous 1.67–1.79 line-height for editorial readability
- **Substitute:** Montserrat, Lato, Nunito Sans
- **Weights:** 400, 600, 700
- **Sizes:** 12px, 13px, 14px, 15px, 16px
- **Line height:** 1.67 (body), 1.70, 1.20 (tight UI)
- **Letter spacing:** 0.1920em, 0.2310em

### Poppins — Display and section-heading typeface — geometric sans used for hero-scale section labels like 'TRENDING' at 62px. Extreme letter-spacing (0.154em at display, 0.091em at 20px) transforms headlines into printed gallery signage, the signature typographic moment of the brand
- **Substitute:** Montserrat, Outfit, Space Grotesk
- **Weights:** 500, 600, 700
- **Sizes:** 11px, 13px, 16px, 20px, 62px
- **Line height:** 1.15 (display), 1.20, 1.25, 2.27 (small caps labels)
- **Letter spacing:** 0.154em at 62px, 0.091em at 20px, 0.065em at 16px, 0.050em at 11–13px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.25 | 1.69px |
| heading-sm | — | — | 20px | 1.2 | 1.82px |
| display | — | — | 62px | 1.15 | 9.55px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 75-170px
- **Card padding:** 42px
- **Element gap:** 15px

### Border Radius

- **cards:** 0px
- **pills:** 10px
- **badges:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Primary site header with brand mark and section links

Full-bleed bar, 10–15px vertical padding, no shadow. Rust Hearth (#892500) lowercase wordmark 'hnst' at ~32px Raleway 700 left-aligned. Right side: uppercase nav links (HOME, SUSTAINABILITY, PRESS, SHOP) in Raleway 600 at 12–13px with 0.192–0.231em letter-spacing and Stone (#868686) color, 15px horizontal gap. Active state switches text to Rust Hearth. Thin Stone hairline border-bottom separates from content.

### Hero Carousel
**Role:** Full-viewport lifestyle photography opening the homepage

Full-bleed image at 100vw width, ~80vh height, no radius. Left/right arrow controls rendered as thin chevrons in semi-transparent white, 48px tap targets, vertically centered. Four-dot pagination indicator centered at the bottom in white with the active dot at full opacity. No headline overlay — the photograph carries the message.

### Section Display Heading
**Role:** Gallery-label style title for content sections

Poppins 700 at 62px, letter-spacing 9.55px (0.154em), line-height 1.15, color Charcoal Ink (#0e0e0e). Centered or left-aligned depending on context. This is the signature type moment — the extreme tracking makes 'TRENDING' read as a printed wall label, not a web heading.

### Filled Action Button
**Role:** Primary call-to-action in Charcoal Ink

Charcoal Ink (#0e0e0e) background, Linen (#ffffff) text, Raleway 600 at 13–14px, uppercase with 0.192em letter-spacing. Padding 15px horizontal, 42px to 45px on wider variants. Zero radius — the sharp corners reinforce the editorial gallery aesthetic.

### Ghost Navigation Button
**Role:** Secondary or inactive link styled as borderless uppercase text

No background or border. Raleway 600 at 12–13px, uppercase, letter-spacing 0.192em, color Stone (#868686). Hover transitions to Charcoal Ink (#0e0e0e). Used in the nav bar and footer link clusters.

### Editorial Image Block
**Role:** Large product or story photograph in a content section

Full-width or right-column image with zero radius, no border, no shadow. Floating at the edge of the container or centered. Sits on Raw Silk (#f9f6f2) or Linen (#ffffff) canvas. The image itself is the component — no frame or caption chrome around it.

### Sand Badge
**Role:** Soft warm-toned tag for metadata or status

Sand Plaster (#eee5d9) background, no border, zero radius. Raleway 600 at 12–13px, Charcoal Ink text, padding 8–10px horizontal, 4–6px vertical. Used for small contextual labels, timestamps, and category markers.

### Info Icon Button
**Role:** Small floating circular button for secondary actions

Charcoal Ink (#0e0e0e) fill, white lowercase 'i' glyph at 16px, 40×40px square with zero radius. Fixed-position utility button (info panel toggle, cart preview). High contrast against the warm canvas.

### Carousel Arrow
**Role:** Slide navigation control for the hero and product carousels

Minimal chevron icon, 24px, white at 70% opacity over imagery, Charcoal Ink on light backgrounds. No background shape — the arrow floats directly on the image. 48px invisible hit area for touch.

### Section Divider Band
**Role:** Full-bleed photographic strip separating content sections

100vw width, ~20–30vh height, zero radius, edge-to-edge image. Functions as a visual palate cleanser between text blocks. Examples: the industrial textile-mill photograph and the leather/texture close-up that appear as horizontal bands between editorial sections.

### List Item with Marker
**Role:** Bulleted or numbered list inside editorial copy

Raleway 400 at 14–15px, line-height 1.70, color Charcoal Ink. 9px horizontal gap between marker and text. Stone (#868686) thin left-border on the list container at 1px. No custom bullet glyphs — relies on default markers or small rust-colored dots when brand-styled.

### Pill Filter Tag
**Role:** Rounded interactive tag for filtering product lists

The only rounded component in the system at 10px radius. Sand Plaster (#eee5d9) or Linen (#ffffff) background with 1px Stone (#868686) border. Raleway 600 at 12–13px, 10–15px horizontal padding, 4–6px vertical. Active state: Rust Hearth border and text.

### Footer Link Cluster
**Role:** Organized link groups in the site footer

Multi-column layout, Raleway 400 at 14px for links, Stone color, 15px vertical gap. Column headers in Raleway 600 uppercase at 12px with 0.192em letter-spacing. Thin Stone top-border separates footer from content. No background color change — footer sits on Raw Silk canvas.

## Do's and Don'ts

### Do
- Use Rust Hearth (#892500) exclusively for the brand wordmark, active nav states, and section underlines — let it carry full identity weight as the only chromatic accent
- Apply Poppins 700 at 62px with 0.154em letter-spacing for all display section headings to maintain the gallery-label signature
- Keep all component corners sharp (0px radius) except pill filter tags, which use 10px — this single exception is intentional
- Set body text at Raleway 400, 15px, line-height 1.70 for editorial readability on the warm Raw Silk canvas
- Use Sand Plaster (#eee5d9) for badge and tag fills to create soft warm-tinted containers that feel like craft paper
- Separate sections with full-bleed photographic bands rather than decorative dividers — the imagery is the structural element
- Maintain 1px Stone (#868686) hairline borders for all structural separation; never use shadows to imply elevation

### Don't
- Do not introduce additional accent colors beyond Rust Hearth and Blush Whisper — the 1% colorfulness is the brand
- Do not use rounded corners on cards, buttons, or images — sharp edges are essential to the editorial-print identity
- Do not add drop shadows or elevation effects to any component — the design system is deliberately flat
- Do not use pure white (#ffffff) as the page background — always use Raw Silk (#f9f6f2) to preserve the warm, natural-fiber atmosphere
- Do not set body text below 14px or above 17px — the type scale is narrow and intentional for editorial reading comfort
- Do not apply tight letter-spacing to display headings — the extreme tracking (0.154em) at 62px is a signature, not a mistake
- Do not overlay text, buttons, or UI chrome on top of hero photography — let the image breathe without interference

## Elevation

- **Navigation Bar:** `none — separated from content by a 1px Stone (#868686) bottom border only`
- **Product Cards:** `none — flat surfaces with thin Stone hairline borders or no border at all`
- **Buttons:** `none — solid fill provides all visual weight`
- **Info Icon Button:** `none — Charcoal Ink solid fill is the visual anchor`

## Surfaces

- **Raw Silk** (`#f9f6f2`) — Page canvas — warm off-white base for the entire site
- **Linen** (`#ffffff`) — Card surfaces, product panels, and elevated content blocks
- **Sand Plaster** (`#eee5d9`) — Badge fills, soft tag backgrounds, warm-toned containers
- **Charcoal Ink** (`#0e0e0`) — Dark inverted sections, navigation bar, filled action buttons

## Imagery

Editorial fashion photography dominates the visual language. The hero features intimate, warmly lit studio portraits of models in relaxed poses against neutral backdrops — high-key with golden undertones, no harsh shadows. Interior editorial sections use industrial and craft-process imagery: textile-mill machinery, raw denim, leather close-ups with warm directional lighting. All photography is full-bleed, sharp-cornered, and unmasked — no rounded edges, no overlays, no decorative frames. The treatment is always cinematic and tactile, favoring material texture (denim weave, leather grain, fabric folds) over product-pack shots. No illustrations, no icons beyond simple UI glyphs, no 3D renders.

## Layout

The page follows a full-bleed editorial rhythm: a full-viewport hero photograph opens the experience, followed by asymmetric content sections where a large image occupies the right half and empty Raw Silk canvas holds the left. Sections are separated by full-bleed photographic bands that act as visual breath. Headlines are centered or left-aligned with extreme letter-spacing, reading as gallery wall text. The grid is single-column or two-column asymmetric, never multi-column card grids. Navigation is a minimal top bar — no sidebar, no mega-menu, no sticky header. Content density is spacious: 75–170px between sections, generous whitespace around all text blocks. The overall feel is of a curated zine or museum catalog, not a retail catalog.

## Similar Brands

- **Patagonia** — Same warm earthy neutral palette with a single rust/burnt-orange brand accent, photography-first editorial layout, and anti-corporate sustainable-fashion tone
- **Eileen Fisher** — Shared commitment to full-bleed lifestyle photography, generous whitespace, cream/off-white canvases, and a minimal sans-serif typography system
- **Toast (toa.st)** — Identical slow-fashion editorial language — warm bone-white backgrounds, sharp-cornered components, no shadows, and a single chromatic accent used sparingly
- **Studio Nicholson** — Same gallery-catalog approach with wide-tracked uppercase section headings, asymmetric image+text layouts, and a restrained near-monochrome palette
- **Asket** — Shared minimal navigation, single accent color philosophy, body-text-forward type system, and photography that fills the viewport without decorative chrome
