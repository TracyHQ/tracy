# ilovecreatives — Style Reference
> Gen-Z monochrome zine at viewport scale

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ilovecreatives is a monochrome editorial system for a Gen-Z creative community: every screen is a page from an indie print zine scaled to viewport. The palette is aggressively achromatic — deep ink black, soft charcoal, warm paper white, and one barely-there lime-cream surface — with zero chromatic accent. Photography carries the color: lush full-bleed color in the hero and course cards, then a deliberate pivot to high-contrast black & white in the profile grids. Typography is the only chrome: a Swiss grotesque (Suisse Regular) handles all UI, a custom Roman display serif (Romana) blasts the brand wordmark edge-to-edge across the hero, and aggressive negative letter-spacing ties everything to the page edges. Components are minimal: pill-shaped ghost buttons, pill-shaped location tags, 20px-radius photo cards, and almost no shadows. The feeling is warm, confident, editorial, community-first — never corporate SaaS.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#222222` | Primary text, pill button borders, hairline dividers, ghost button outlines, card borders — the workhorse near-black that reads softer than pure #000000 at body sizes |
| Pure Black | `#000000` | Logo, sharpest borders, true-black hero overlays, selected/active states, image masking — used sparingly where maximum contrast or absolute black is required |
| Paper White | `#ffffff` | Page canvas, card surfaces, button fills, badge backgrounds, hero photo overlay anchor — the default background of everything |
| Risograph Lime | `#e1ea99` | Secondary surface accent — warm cream-lime wash used on occasional highlighted blocks, tag fills, and standout cards; the only chromatic note in the entire system and intentionally muted to a riso-print tint |

## Typography

### Suisse Regular — Primary UI and body type — navigation, buttons, body copy, course titles, profile names, tags. Carries every functional text role. A neutral Swiss grotesque that disappears into the layout and lets imagery and the Romana display dominate. Substitute: Inter or Söhne if Suisse is unavailable.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 13, 14, 15, 16, 18, 20, 22, 32, 49, 54px
- **Line height:** 1.0–1.43
- **Letter spacing:** Tight throughout: -0.02em to -0.06em depending on size

### Romana — Display serif reserved for the brand wordmark and hero-scale headings. A modern Roman with sharp contrast that screams editorial at large sizes but is never used below 20px. The negative tracking (-0.06em at 59px) pulls the letterforms so tight they almost touch, creating the signature edge-to-edge wordmark that bleeds across the full viewport.
- **Substitute:** DM Serif Display or Playfair Display
- **Weights:** 400
- **Sizes:** 20, 35, 53, 59px
- **Line height:** 0.95–1.27
- **Letter spacing:** -0.0600em, -0.0400em

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 100
- **Sizes:** 10px, 18px, 32px
- **Line height:** 1, 1.1, 1.4, 2.52
- **Letter spacing:** -0.02

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | -0.02px |
| body | — | — | 15px | 1.4 | -0.018px |
| subheading | — | — | 20px | 1.17 | -0.02px |
| heading-sm | — | — | 22px | 1.2 | -0.022px |
| heading | — | — | 32px | 1.1 | -0.024px |
| heading-lg | — | — | 49px | 1.05 | -0.04px |
| display | — | — | 59px | 0.95 | -0.06px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 300px
- **images:** 20px
- **buttons:** 450px
- **smallElements:** 8px

## Components

### Top Navigation Bar
**Role:** Site header

Minimal horizontal bar on white with Ink Black text, ~14-16px Suisse Regular, items separated by ~20-32px gap. Logo wordmark left, nav links (Courses, Ads, Creatives, Resources, Shop, +Newsletter) center-left, social icons and 'Made for #Slashies' microcopy right. No background fill, no shadow — just a hairline border-bottom in some states.

### Ghost Pill Button
**Role:** Primary interactive element (replaces traditional CTA)

Pill-shaped button with 450px border-radius, transparent background, 1px Ink Black (#222222) border, 6-10px vertical padding and 20-24px horizontal padding. Text in Ink Black at 14-15px Suisse Regular weight 400. The only 'CTA' style on the site — used for enrollment, view-all, browse, and watch actions.

### Location Tag Pill
**Role:** Profile metadata badge

Small pill badge with 300px border-radius, white background, 1px Ink Black border, ~2-4px vertical and 8-13px horizontal padding. Text at 11-13px Suisse Regular in Ink Black. Appears in clusters above profile names (City · Country format).

### Course Card
**Role:** Featured course in Edutainment carousel

Tall card (~4:3 image) with 20px border-radius on the photo, no shadow. Image area carries full-color vibrant graphic design. Below image: course title in 22-32px Suisse Regular, short testimonial quote in 13-14px body, then a Ghost Pill Button labeled 'Enrollment Open' or similar. White card surface, no border.

### Creative Profile Card
**Role:** Community member showcase

Portrait photo (4:5 ratio) with 20px border-radius, rendered in high-contrast black & white (signature treatment — the rest of the site uses color photos, these are deliberately desaturated). Below photo: name in 18-22px Suisse Regular, role/title in 13-14px body, location tags as Location Tag Pills above. No card border, no shadow — photo sits directly on white.

### Hero Display Wordmark
**Role:** Brand identity moment

The literal text 'ilovecreatives' rendered at 80-120px+ in Romana serif, weight 400, letter-spacing -0.06em, white text. Bleeds edge-to-edge across the full viewport width, partially cropped by the frame. Sits directly over a full-bleed color hero photograph with a subtle dark overlay for legibility.

### Hero Photo Background
**Role:** Full-bleed visual

Edge-to-edge color photograph filling the entire hero viewport. No border-radius. Subject (person) positioned so the large white display wordmark wraps around them — photo is the container, wordmark is the chrome.

### Section Heading with Inline Highlight
**Role:** Section title with editorial emphasis

Large display text (35-49px) mixing two treatments: plain Suisse Regular body-weight text alongside words wrapped in 1px Ink Black pill borders (e.g. 'your profile' or 'community' rendered as inline outlined words). Creates a visual rhythm where key terms are literally circled. The 'circular pill on a word' is a signature interaction pattern.

### Hero Subtext Block
**Role:** Hero body copy with call-to-action

Small paragraph at 14-16px Suisse Regular in white, positioned bottom-left of the hero over the photo. Accompanied by an outlined Ghost Pill Button ('Watch: About Us Video') directly beneath. Generous left margin, no background.

### Carousel Pagination Dots
**Role:** Carousel navigation indicator

Vertical column of small (~4-6px) circles along the left edge of card carousels. Active dot is filled Ink Black, inactive dots are outlined or light gray. A subtle but consistent navigation pattern across all horizontal card rows.

### Footer Newsletter Bar
**Role:** Bottom-of-page engagement strip

A condensed bar near the footer combining the brand wordmark in Romana with a newsletter signup call-to-action. White background, Ink Black text, 1px hairline border-top.

## Do's and Don'ts

### Do
- Use 450px border-radius for all interactive buttons and 300px for all tags/badges — pill shape is the only shape in the system
- Set all body and UI type in Suisse Regular; reserve Romana exclusively for display sizes 20px+ and the brand wordmark
- Apply -0.02em to -0.06em letter-spacing across the entire type scale, tightening further as size increases (-0.06em at display, -0.02em at body)
- Render all images with 20px border-radius — no exceptions, no sharp corners on any photo or illustration
- Render creative profile photos in black & white; reserve full color photography for hero and course card imagery only
- Use the 1px Ink Black (#222222) border as the primary structural divider and button outline — no shadows, no fills for depth
- Use the #e1ea99 Risograph Lime only as a sparse surface accent on occasional blocks or tags, never as text color or primary action

### Don't
- Never introduce a chromatic accent color (no blues, reds, purples) — the system is deliberately and aggressively monochrome
- Never use filled solid-color CTA buttons with bright fills — all buttons are ghost/outlined pills
- Never apply drop shadows or elevation glows to any component — flatness is the design philosophy
- Never use Romana below 20px — it is display-only and loses its character at body sizes
- Never use rounded corners smaller than 8px on images or larger than 20px — the radii vocabulary is strict
- Never set body text in #000000 — use #222222 for softer contrast at small sizes; reserve #000000 for true-black emphasis
- Never color the full-bleed hero photo edge — let it bleed to the viewport edge with no padding or frame

## Elevation

The system is flat by design. No drop shadows, no elevation glows, no layered surfaces. Visual depth comes entirely from image bleed, background color shifts, and 1-2px hairline borders in Ink Black. This keeps the feel editorial and print-like — closer to a magazine spread than a SaaS dashboard.

## Surfaces

- **Paper White** (`#ffffff`) — Default page background and card surface
- **Risograph Lime** (`#e1ea99`) — Sporadic warm accent surface for highlighted blocks, active tags, standout cards
- **Ink Black** (`#222222`) — Inverted surface — used behind the giant white display wordmark and in dark image overlays

## Imagery

Photography carries 100% of the color and warmth in this system. The site uses two distinct photographic treatments: lush, full-color editorial portraits in the hero and course card imagery (lifestyle, candid, warm-lit), then a deliberate hard pivot to high-contrast black & white portraiture in the Creative Profiles grid. Photos are tight, person-focused crops — never wide environmental shots, never stocky. Images are always 20px-radius, never full-bleed except in the hero. No illustrations, no abstract graphics, no icons beyond simple social marks. The black & white treatment on profile photos is the signature move — it signals community and editorial credibility against the color chaos everywhere else.

## Layout

The page model is centered, max-width ~1280px, with generous side padding. The hero is a full-bleed exception: 100vw color photograph with the massive white Romana wordmark bleeding edge-to-edge, subtext and outlined button anchored bottom-left. Below the hero, the layout settles into a vertical stack of horizontal card carousels — one for 'Edutainment' courses, one for 'Creative Profiles' — each with a left-aligned section heading (Suisse Regular body weight, large size, with inline outlined-pill words for emphasis) and a right-aligned 'View all →' Ghost Pill Button. Carousels are horizontally scrollable with vertical pagination dots anchored to the left edge of the section. Sections are separated by 48-64px vertical gaps. The overall rhythm is: one dramatic full-bleed moment, then calm horizontal bands of card content stacked vertically. Navigation is a single minimal top bar with no sticky behavior evident.

## Similar Brands

- **Are.na** — Same monochrome editorial palette with zero chromatic accents, same pill-shaped outlined buttons, same zine-like community-first aesthetic
- **It's Nice That** — Same mix of large display headings and compact Swiss grotesque body, same generous use of editorial photography in tight crops, same Gen-Z creative-community positioning
- **Pinterest** — Same card-grid layout for community/creator profiles with location metadata, same rounded 20px photo treatment, same horizontal scrollable carousel rhythm
- **Cargo Collective** — Same indie-creative-portfolio energy with mixed color and B&W photography, same flat no-shadow component treatment, same emphasis on the creator portrait as the primary content
- **Readymag** — Same display-serif-meets-Swiss-grotype type pairing, same oversized edge-to-edge display headings, same editorial-print-meets-web-page rhythm
