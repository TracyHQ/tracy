# Atlas Card — Style Reference
> Midnight vault with a single sapphire light — pure black space where one deep electric blue is the only thing that matters.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Atlas Card operates in a cinematic dark mode where near-black canvases dissolve into atmospheric photography, with one vivid sapphire blue doing all the communicative work. The system is built on extreme restraint: a single chromatic accent, two custom geometric sans-serifs, pill-shaped controls, and a monospaced voice for footnotes and metadata. The visual language borrows from luxury concierge services — sparse, intentional, invitation-only — where the interface itself communicates exclusivity through what it omits. Elevation is nonexistent; surfaces are distinguished only by subtle gray steps, and depth is created through photography and atmospheric haze rather than shadow. Every element earns its place: text is centered and confident, buttons are full-pill and singular, and color appears only where action is demanded.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, section backgrounds, image masks — pure absorption that lets photography and the blue accent carry all visual weight |
| Obsidian | `#1e1e1e` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Graphite | `#272727` | Hover states, tertiary surfaces, subtle panel backgrounds — the second elevation step, still achromatic |
| Ash | `#808080` | Secondary text, muted metadata, helper copy, de-emphasized body — sits between the white text and the void |
| Frost | `#cccccc` | Tertiary text, icon strokes on dark, disabled foregrounds — lighter than Ash but never as bright as primary text |
| Paper | `#f8f8f8` | Primary body and heading text, button text on filled controls — chosen over pure white for a softer, less clinical read on black |
| Pure White | `#ffffff` | Logo badge background, icon fills on light photography, maximum-emphasis text — reserved for logo lockups and peak contrast moments |
| Sapphire Volt | `#001391` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |

## Typography

### Sequel Sans Headline Book — Display and body headlines. The 700 weight carries section titles and hero text; 400 handles body copy and subheadings. Sequel Sans is a geometric sans with tall x-height and clean terminals — its near-equal weight across 400 and 700 means hierarchy is established by size and tracking, not by contrast in stroke weight. Letter-spacing sits between -0.0080em and +0.0080em, virtually neutral, so text reads as one confident voice rather than tight display or loose utility.
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 400, 700
- **Sizes:** 16px, 23px, 24px, 28px
- **Line height:** 1.17, 1.30, 1.40
- **Letter spacing:** -0.0080em to 0.0080em (near-zero tracking)

### Sequel Sans Book — Button labels, navigation links, footer text, inline emphasis — Sequel Sans in its single weight at 17px is the utility voice: controls, links, and micro-copy. Sharing DNA with the headline family creates a unified typographic system where buttons feel like a natural extension of the text, not a separate component.
- **Substitute:** Inter, Satoshi
- **Weights:** 400
- **Sizes:** 17px
- **Line height:** 1.24

### ApercuMono Pro — Captions, fine print, disclaimers, metadata, eyebrow labels, monospaced tags. ApercuMono provides the system's secondary voice: a monospaced counterpoint that signals 'annotation' or 'footnote' the moment it appears. The 10px and 12px sizes are reserved for legal/qualifier text below buttons; 15px with generous 1.67 line-height handles inline annotations and small labels. This pairing of geometric sans + monospace is a signature choice — it evokes fintech precision and concierge paperwork simultaneously.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Geist Mono
- **Weights:** 400 (Medium and Regular)
- **Sizes:** 10px, 12px, 15px
- **Line height:** 1.40, 1.50, 1.67

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | — |
| body | — | — | 15px | 1.67 | — |
| body-lg | — | — | 17px | 1.24 | — |
| subheading | — | — | 23px | 1.3 | — |
| heading | — | — | 28px | 1.4 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 640px
- **Section gap:** 88px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 4px
- **cards:** 12px
- **pills:** 128px
- **inputs:** 8px
- **buttons:** 24px

## Components

### Hero Atmospheric Image
**Role:** Full-bleed brand photography

Full-viewport-width photographic image (cityscape, fog, mist) treated as the hero canvas. The Atlas card object floats centered, rendered in metallic silver. No border-radius — the image bleeds to all edges. The visual weight comes from the fog/haze and the singular floating object, not from any frame or container.

### Logo Lockup Badge
**Role:** Brand mark, sticky header anchor

White (#ffffff) rounded square (8-12px radius) containing the Atlas cross/flag icon in Sapphire Volt (#001391). Floats centered at the top of the viewport over the hero image. Functions as both brand identity and scroll-position anchor. Dimensions feel like a small chip — roughly 40-48px square.

### Primary CTA Button (Pill)
**Role:** The only filled action button in the system

Sapphire Volt (#001391) background, Paper (#f8f8f8) text, Sequel Sans Book 400 at 17px, line-height 1.24. Full pill radius (24px). Horizontal padding ~32px, vertical padding ~16px. The button is the sole place the brand blue lives in the interface; it is intentionally a rare, high-commitment moment. Hover/active states deepen to a darker indigo. No border, no shadow.

### Secondary Ghost Button
**Role:** Low-emphasis actions, navigation

Transparent background with Paper (#f8f8f8) text, Sequel Sans Book 400. Pill radius (24px). Used for 'Learn more', nav items, and any action that should not compete with the primary CTA. On photography backgrounds, no surface fill is needed; on solid black, the button is text-only with a subtle border in Ash (#808080).

### Centered Body Block
**Role:** Long-form description, product narrative

Max-width ~640px, centered horizontally. Sequel Sans Headline Book 400 at 23-24px, line-height 1.30-1.40, color Paper (#f8f8f8). Text-align center. The narrow column width and centered alignment create an intimate, editorial reading experience — the text feels like a letter, not a web page.

### Annotation Caption
**Role:** Fine print, disclaimers, metadata

ApercuMono Pro 400 at 10-12px, line-height 1.50-1.67, color Ash (#808080). Centered below CTAs. Functions as the 'legalese' or 'waitlist explanation' voice. The monospace face immediately signals 'secondary annotation' and separates this text from the persuasive body copy above it.

### Scroll Indicator
**Role:** Visual cue to scroll below the fold

Thin horizontal line (~1px, 40-60px wide) in Frost (#cccccc) or Ash (#808080), positioned at the bottom-center of the hero image. No animation label needed — the line's placement and minimal weight do all the work.

### Gradient Image Overlay
**Role:** Smooth transition from hero photography to solid black sections

Linear gradient from #141414 to #000000 (oklab interpolation), used to fade photography into the void canvas below. Applied as a bottom-edge overlay on hero images. Prevents hard cuts between atmospheric photography and flat black sections.

### Link Inline Emphasis
**Role:** Text links within body copy

Inherits body text color (Paper) with a subtle underline or a shift to Sapphire Volt on hover. No boxed link styles — links should feel like editorial annotations, not UI controls. Underline offset ~2px, thickness 1px.

### Icon Glyph (Atlas Cross)
**Role:** Brand identity, favicon, app icon

The Atlas cross/flag mark: a plus-sign intersected by a vertical bar, rendered in Sapphire Volt (#001391) on white. Used as the favicon, the header badge icon, and the app icon. Stroke-based, not filled — the negative space within the cross is part of the mark's geometry.

## Do's and Don'ts

### Do
- Use #001391 exclusively for primary action buttons and the brand mark — it is the system's only chromatic voice and must remain rare
- Set body text to #f8f8f8, not pure white — the off-white reads as premium and reduces visual fatigue on large black canvases
- Apply pill radius (24px) to all buttons and tags; use 128px for the most extreme pill shapes on hero-level CTAs
- Pair Sequel Sans for persuasive body copy with ApercuMono for all annotations, disclaimers, and metadata — the monospace shift signals 'this is not marketing'
- Center-align body text in a max-width ~640px column to create the intimate, letter-like reading rhythm visible in the waitlist section
- Transition from hero photography to black sections using the #141414 → #000000 gradient overlay — never hard-cut between image and canvas
- Let photography carry atmospheric depth instead of adding box-shadows to cards or buttons

### Don't
- Never add box-shadow or drop-shadow to cards, buttons, or panels — depth comes from color stepping and photography only
- Never use a color other than #001391 for filled buttons; ghost/secondary buttons must use #f8f8f8 text on transparent or #1e1e1 fill
- Never set body text to pure #ffffff when #f8f8f8 is available — the warmer off-white is part of the brand's restrained luxury
- Never introduce a second accent color (no green for success, no red for error) — if states are needed, use Ash (#808080) for inactive and Frost (#cccccc) for active
- Never use border-radius below 8px on cards or below 18px on buttons — the rounded geometry is a signature, not a default
- Never left-align body copy in the narrative sections — centered text at 640px max-width is the editorial pattern that defines the voice
- Never use ApercuMono for headlines or CTA labels — it is strictly for annotations, fine print, and metadata under 15px

## Elevation

The design uses zero shadow-based elevation. Depth is communicated through surface color stepping (black → obsidian → graphite) and through atmospheric photography. This is a deliberate luxury choice: shadows would suggest skeuomorphic depth and casual materiality, while flat color stepping reinforces the vault-like, monolithic feel.

## Surfaces

- **Void Canvas** (`#000000`) — Page background, full-bleed section foundation
- **Obsidian Panel** (`#1e1e1`) — Elevated buttons, first surface step
- **Graphite Layer** (`#272727`) — Secondary panels, hover states, image overlays

## Imagery

Photography is cinematic and atmospheric: full-bleed cityscapes shrouded in fog, mist, or low cloud cover, shot in cool blue-gray tones that harmonize with the sapphire accent. The card product itself is photographed as a floating metallic silver object — isolated, not held or worn — suggesting preciousness and exclusivity. No lifestyle photography, no people, no hands, no warmth. Images are always full-bleed (no rounded corners on hero images), always desaturated toward blue-gray, and always treated as the entire visual field rather than contained illustrations. The only non-photographic visual element is the flat brand mark (cross icon). No 3D renders, no illustrations, no abstract graphics outside of the gradient overlays.

## Layout

The page follows a vertical scroll with two dominant sections: a full-bleed photographic hero occupying the full viewport height, followed by a solid black narrative section. The hero has a centered logo badge at the top and a scroll indicator at the bottom — no nav bar, no text overlay on the hero. The narrative section uses a single centered column (max-width ~640px) for body text, followed by a centered CTA button, followed by centered monospaced fine print. There is generous vertical breathing room between elements (88px section gaps, 32-48px between text blocks). The overall density is sparse and cinematic — large black voids, single focal points, and deliberate use of emptiness to communicate exclusivity. Navigation is minimal or absent on the landing page, reinforcing the 'invitation-only' positioning.

## Similar Brands

- **Apple Card** — Same dark-mode luxury positioning with a single premium product, full-bleed atmospheric photography, and extreme typographic restraint centered on a geometric sans-serif
- **Amex Centurion (Black Card)** — Same invitation-only exclusivity communicated through near-black canvases, generous whitespace, and a single accent color reserved for the brand mark and primary action
- **Linear** — Same dark-mode UI discipline with deep neutrals, centered narrative text blocks, and pill-shaped CTAs — though Linear uses a violet accent where Atlas uses electric indigo
- **Stripe Sessions** — Same full-bleed cinematic hero photography transitioning to dark content sections, with a single vivid accent color and clean geometric sans-serif typography
