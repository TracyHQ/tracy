# Aboard — Style Reference
> Editorial field journal under industrial light

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aboard reads as an editorial dossier drafted inside a working warehouse: Tobias serif headlines at weight 300 float over Atkinson Hyperlegible Mono body copy, a pairing that treats the page as a technical specification rather than a marketing surface. The system alternates full-bleed dark documentary bands with warm off-white reading sections, the rhythm controlled by a single vivid ember-orange that punctuates CTAs, icons, and active states against an otherwise achromatic palette. Components are deliberately thin: pill-shaped CTAs, translucent floating nav, hairline borders at 1px, almost no shadow or elevation — the interface recedes so the photography and the prose can carry the page. The warmth of the neutrals (bone white, linen, warm graphite) keeps the dark sections from feeling cold, while the orange never decorates — it always signals an action or a live status.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Orange | `#de4c00` | Primary CTAs, active nav items, icon fills, link accents — the only chromatic color in the UI, it acts as a power-switch indicator against the muted neutrals |
| Soft Ember | `#efa680` | Hover-state borders, subdued accent outlines, tag strokes — a desaturated echo of Ember Orange for quieter accents |
| Bone White | `#fffefb` | Page canvas on light sections, text color on dark/image sections |
| Linen | `#f3f2ee` | Warm secondary surface, elevated card backgrounds, subtle shadow tint |
| Hairline Gray | `#e5e7eb` | Hairline borders across cards, images, dividers, and form fields |
| Stone Border | `#c1bdba` | Medium-strength borders where hairline is too faint |
| Warm Taupe | `#a49784` | Translucent nav background tint, muted UI surfaces |
| Graphite | `#333833` | Strong dark borders, deep separators |
| Warm Graphite | `#271503` | Primary body and heading text on light surfaces — a warm near-black with brown undertone instead of pure black |
| Ink | `#000000` | Pure black for maximum-contrast text and image overlay scrims |
| Deep Forest | `#040c06` | Dark section canvases — nearly black with a green-warm undertone that complements the orange |

## Typography

### ui-sans-serif — ui-sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.5

### Tobias — Display and heading serif. Weight 300 across all sizes — the whisper-weight is anti-convention for 72px display, creating authority through restraint rather than volume. Used for hero headlines, section titles, and editorial pull-quotes.
- **Substitute:** Cormorant Garamond, Playfair Display, or system serif
- **Weights:** 300
- **Sizes:** 24px, 32px, 72px
- **Line height:** 1.10–1.30
- **Letter spacing:** -0.48px at 24px, -0.64px at 32px, -1.44px at 72px

### Atkinson Hyperlegible Mono — Body copy, labels, and micro-text. The mono body choice is the system's signature: it treats the page as a technical manual or terminal readout, not a marketing brochure. The wider tracking at 0.05em on small sizes (10–14px) creates generous rhythm for sidebar labels and captions.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or system monospace
- **Weights:** 300
- **Sizes:** 10px, 12px, 14px, 16px
- **Line height:** 1.57–1.83
- **Letter spacing:** -0.32px at 16px, +0.5px at 10px, +0.6px at 12px, +0.7px at 14px

### Work Sans — Navigation links, button text, and small UI controls where a humanist sans is preferable to mono. Acts as the utility face between the editorial headlines and the technical body.
- **Substitute:** Inter, system-ui, or Helvetica Neue
- **Weights:** 400
- **Sizes:** 12px, 16px
- **Line height:** 1.63–1.83
- **Letter spacing:** -0.0200em, -0.0170em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 1.6 | 0.5px |
| caption | — | — | 12px | 1.63 | 0.6px |
| body-sm | — | — | 14px | 1.63 | 0.7px |
| body | — | — | 16px | 1.57 | -0.32px |
| heading | — | — | 24px | 1.3 | -0.48px |
| heading-lg | — | — | 32px | 1.3 | -0.64px |
| display | — | — | 72px | 1.1 | -1.44px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 30px
- **tags:** 8px
- **cards:** 12px
- **buttons:** 9999px

## Components

### Ember Pill CTA
**Role:** Primary call-to-action button

Filled with #de4c00, white text in Work Sans 400 16px, 9999px border-radius, 10px vertical / 24px horizontal padding. Single-line label. No shadow. The pill shape is the only rounded element at full curvature — it makes the CTA unmistakable as the page's power switch.

### Translucent Floating Nav
**Role:** Top-of-page navigation

Pill-shaped container at 30px border-radius, warm taupe (#a49784) at low opacity over the page, containing the 

### Serif Display Heading
**Role:** Hero and section headlines

Tobias weight 300, 72px on hero, 32–24px on section titles. Line-height 1.10–1.30. Letter-spacing -0.02em. Color Bone White (#fffefb) on dark sections, Warm Graphite (#271503) on light sections. The light weight is non-negotiable — bolding it kills the editorial feel.

### Mono Body Block
**Role:** Paragraph copy in content sections

Atkinson Hyperlegible Mono weight 300, 14–16px, line-height 1.63–1.83, letter-spacing -0.32px at 16px. Color Warm Graphite (#271503) on light surfaces, Bone White (#fffefb) on dark. Max-width ~480px to preserve the terminal-readout measure.

### Two-Column Editorial Section
**Role:** Content layout: heading left, body right

Side-by-side grid with 48–64px gap. Left column holds the Serif Display Heading at 32px. Right column holds Mono Body Block at 14–16px. Both vertically top-aligned. Background: Bone White or Linen. Section padding: 64px horizontal, 64px vertical.

### Full-Bleed Documentary Image
**Role:** Atmospheric image band between content sections

Edge-to-edge photograph on Deep Forest (#040c06) background. Optional dark scrim (rgba(0,0,0,0.3–0.5)) for text contrast. White or Bone White overlay text in Tobias 300. Images are documentary/candid, not stock-polished.

### Vertical Sidebar Label
**Role:** Section indicator on page edge

Rotated 90° text on the left page margin, positioned 24–49px from the edge. Atkinson Hyperlegible Mono 10–12px, letter-spacing 0.05em, uppercase or as-is. Color: Warm Graphite on light sections, Hairline Gray (#c1bdba) or Bone White on dark. Functions as a section marker, not navigation.

### Ghost Text Link
**Role:** Inline links in body copy

No background, 1px underline in #de4c00 or Warm Graphite depending on context. Work Sans or mono at 14–16px. Hover increases opacity or shifts to Ember Orange.

### Hairline Divider
**Role:** Section separator

1px solid #e5e7eb or #c1bdba, full-width or contained. No ornamentation, no gradient fade. The division between sections is implied by spacing, not visual lines — this is a fallback.

### Image Frame Card
**Role:** Content card with image

1px solid #e5e7eb border, 12px border-radius, Linen (#f3f2ee) interior, 24px padding. Image at top with 1px border in #e5e7eb. Body text in mono 14px below. Minimal elevation — no drop shadow.

### Compact Pill Tag
**Role:** Category or status badge

8px border-radius (subtle pill, not full curvature), 4–8px vertical / 8–12px horizontal padding, Work Sans 12px or mono 10–12px. Border 1px in #e5e7eb or #efa680. Background: Bone White or transparent. Color: Warm Graphite or Ember Orange.

## Do's and Don'ts

### Do
- Set all primary CTAs to 9999px border-radius with #de4c00 fill and Bone White text in Work Sans 400 16px.
- Use Tobias weight 300 for every heading at 24px, 32px, and 72px — never bold the serif.
- Write body copy in Atkinson Hyperlegible Mono weight 300 at 14–16px with line-height 1.63–1.83.
- Separate sections with 64px vertical padding, not dividers or background color changes alone.
- Apply 1px solid #e5e7eb borders to all cards and images — never use drop shadows for elevation.
- Use #fffefb for light canvases and #040c06 for dark bands; let photography fill the dark bands edge-to-edge.
- Limit color usage: Ember Orange (#de4c00) appears only on CTAs, active states, and icon fills — nowhere decorative.

### Don't
- Do not use bold (600–700) weights on Tobias headings — the whisper-weight 300 is the signature.
- Do not introduce drop shadows for card elevation; use Linen (#f3f2ee) surface color and hairline borders instead.
- Do not use a proportional sans-serif for body copy — the mono body is the system's defining choice.
- Do not apply Ember Orange to backgrounds, section bands, or decorative elements — it is action-only.
- Do not use radius values outside the four tokens: 8px (tags), 12px (cards), 30px (nav), 9999px (buttons).
- Do not break the two-tone canvas rhythm — do not insert a third surface color (e.g. blue or purple) into light or dark sections.
- Do not use stock photography, illustrations, or 3D renders — imagery must be documentary and candid.

## Elevation

The system deliberately avoids drop shadows. Elevation is expressed through surface color shifts (Bone White → Linen) and hairline borders (#e5e7eb at 1px). The only shadow-adjacent value is a faint box-shadow tinted with #f3f2ee on buttons — and even that is barely perceptible. The interface should feel printed, not floating.

## Surfaces

- **Bone Canvas** (`#fffefb`) — Light reading sections, default page background
- **Linen Card** (`#f3f2ee`) — Elevated content blocks, secondary panels
- **Taupe Nav** (`#a49784`) — Translucent floating navigation surface
- **Deep Forest** (`#040c06`) — Dark documentary sections, image band canvases

## Imagery

Photography is documentary and candid: warehouse floors with workers in hi-vis vests, open-plan offices with natural light, real human activity rather than staged corporate stock. Images run full-bleed as section bands, often with a dark scrim for text overlay. They carry a muted, slightly desaturated color grade that matches the warm-neutral palette. No illustrations, no 3D renders, no product screenshots — the photography IS the visual content. Iconography is minimal: small mono-weight line icons in Warm Graphite or Ember Orange, never decorative.

## Layout

The page alternates between two canvas states: full-bleed dark documentary bands (Deep Forest #040c06 with photo) and warm light reading sections (Bone White #fffefb). Content is center-constrained at 1200px max-width. The hero is a full-viewport dark image with centered Tobias headline and orange CTA. Subsequent content sections use a two-column editorial split — serif heading left, mono body right — with generous 64px vertical gaps. Vertical sidebar labels sit on the left page edge as section markers. Navigation is a floating pill capsule, not a full-width bar. The overall density is spacious and breathing; the page is text-and-photography dominant, not grid-of-cards dominant.

## Similar Brands

- **Linear** — Shared dark editorial band + light reading section alternation, restrained color palette with a single vivid accent for actions
- **Vercel** — Monospace micro-text for labels and metadata, generous whitespace, minimal border-radius tokens
- **Ramp** — Full-bleed documentary photography sections, warm off-white reading surfaces, single warm accent color for CTAs
- **Pitch** — Editorial serif-meets-mono typography pairing, spacious two-column content layouts, pill-shaped navigation
