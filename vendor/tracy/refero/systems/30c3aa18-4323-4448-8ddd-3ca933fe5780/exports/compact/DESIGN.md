# Frame.io — Style Reference
> Midnight cinema projection room.

A dark suite where a single blue spotlight does all the work and the UI recedes so creative content can project forward.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Frame.io is a midnight projection room for creative teams: a near-black canvas layered with deep cosmic gradients, where large confident display type floats above product surfaces like film titles above a reel. The palette is almost entirely achromatic — only one vivid blue (#6199f6) and a muted violet border tone (#4f4f80) break the monochrome, used sparingly for icons, eyebrow labels, and card edges. Typography is the loudest voice: a single geometric sans (FrameGothic) carries everything from 80px display headlines to 14px body copy, with custom inktrap letterforms reserved for tiny all-caps section labels. Components stay thin and editorial: pill-shaped nav buttons, ghost CTAs, 10px-radius cards with violet-tinted borders, and zero decorative ornament — every element exists to frame the work, not compete with it.

## Colors

| Name | Value | Role |
|------|-------|------|
| Carbon Vellum | `#fcfcfc` | Primary text, inverse button text, icon strokes — near-white reads as paper against the void |
| Obsidian | `#0a0a13` | Primary page canvas and dominant background; the slight blue undertone keeps it from feeling flat black |
| Pitch | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Void | `#040407` | Secondary canvas layer and topmost nav background, one shade lighter than Pitch |
| Graphite | `#08080c` | Card surface for elevated product mockups, sits one step above Obsidian |
| Smoke | `#757580` | Secondary body text and metadata — cool gray, never warm, stays quiet under headlines |
| Ash | `#a3a3b3` | Tertiary text, card descriptions, inactive nav, most frequently used muted foreground |
| Charcoal | `#2a2a32` | Subtle card border on light-mode-adjacent surfaces; hairline divider |
| Iris Glow | `#6199f6` | Sole chromatic accent — icons, eyebrow labels, links, active states, feature marks. One blue, used surgically, carries the entire brand identity |
| Twilight | `#4f4f80` | Muted violet used for card borders, glow halos, and atmospheric tints — the only color allowed to live near content surfaces |
| Specter Lilac | `#dedfee` | Soft highlight on violet accents and light-mode card edges; cool, desaturated lavender |

## Typography

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1

### FrameGothic — Primary brand typeface for everything from 80px display headlines down to 10px metadata. The custom geometric sans carries the entire voice — tight letter-spacing (-0.045em at display sizes) makes large type feel compressed and modern, while the wide weight range (400/500/600) lets hierarchy do the talking without changing family.
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 11px, 12px, 13px, 14px, 15px, 16px, 18px, 24px, 30px, 38px, 48px, 80px
- **Line height:** 0.96 to 1.50
- **Letter spacing:** -3.6px at 80px, -1.92px at 48px, -1.33px at 38px, -0.9px at 30px, -0.72px at 24px, +0.16px at 16px
- **OpenType features:** `"ss01" on, "cv11" on`

### NeueMachinaInktrap — Reserved exclusively for all-caps eyebrow labels (e.g. 'THE FRAME.IO PLATFORM', 'SHARING & PRESENTING', 'WORKFLOW MANAGEMENT'). Wide tracking (0.06em) and inktrap cuts give a mechanical, stamped feel — these labels are always Iris Glow or a light tone, never the body color.
- **Substitute:** Space Mono
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 0.90
- **Letter spacing:** +0.72px at 12px

### Arial — System fallback and small UI text inside embedded product mockups; carries no brand weight
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.45 | 0.72px |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.45 | 0.16px |
| subheading | — | — | 18px | 1.3 | — |
| heading-sm | — | — | 24px | 1.25 | -0.72px |
| heading | — | — | 38px | 1.04 | -1.33px |
| heading-lg | — | — | 48px | 1.02 | -1.92px |
| display | — | — | 80px | 0.96 | -3.6px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **nav:** 100px
- **cards:** 10px
- **pills:** 100px
- **buttons:** 100px
- **dividers:** 1px
- **featureCards:** 24px

## Components

### Pill Navigation Button
**Role:** Primary action in the top nav bar (e.g. 'Start Free Trial', 'Contact Us')

100px border-radius pill, 12px 20px padding, Carbon Vellum fill, Obsidian text at 14px FrameGothic 500. Zero border, no shadow. The pill geometry is the brand's most repeated shape.

### Ghost Nav Link
**Role:** Secondary navigation items (Features, Enterprise, Resources, Pricing)

Transparent fill, no border, Carbon Vellum text at 14px FrameGothic 400. Underline appears on hover; no background shift. Stays nearly invisible until interacted with.

### Sign In Text Link
**Role:** Authenticated user entry point in nav

Plain text button, Carbon Vellum at 14px FrameGothic 400, no background, no border. The lightest possible interactive element.

### Hero CTA Pill
**Role:** Primary conversion button in hero sections ('Start Free Trial')

100px radius, Carbon Vellum fill, Obsidian text, 14px FrameGothic 500, 14px 28px padding. Casts no shadow. The white pill against the cosmic gradient is the page's most contrasting element.

### Ghost CTA Button
**Role:** Secondary conversion button in hero sections ('Take a Product Tour')

100px radius, transparent fill, 1px Carbon Vellum border, Carbon Vellum text, 14px FrameGothic 400, 14px 28px padding. Inverts to filled Carbon Vellum on hover.

### Announcement Banner
**Role:** Top-of-page product update notification

Full-width strip with deep blue-to-violet gradient, Carbon Vellum text at 13px centered, dismiss 'x' on the right. Height ~40px, sits above the main nav.

### Eyebrow Label
**Role:** Tiny all-caps section identifiers ('THE FRAME.IO PLATFORM', 'SHARING & PRESENTING')

NeueMachinaInktrap 12px, weight 400, letter-spacing 0.06em, color Iris Glow (#6199f6) or Smoke. Line-height 0.90. Always sits above the section headline, left-aligned.

### Display Headline
**Role:** Hero and major section headlines (e.g. 'One platform for all your creative work.')

FrameGothic 400 at 48–80px, line-height 0.96–1.02, letter-spacing -1.92 to -3.6px, Carbon Vellum. Weight 400 (not bold) is a deliberate restraint choice — the size does the work, the weight whispers.

### Subheadline Paragraph
**Role:** Supporting body copy under hero and section headlines

FrameGothic 400 at 18px, line-height 1.30, Smoke (#757580). Max-width ~560px. Stays quiet — its job is to inform, not to compete with the headline.

### Feature Column Card
**Role:** Four-column feature grid items in mid-page sections

Transparent background, no card surface. Layout: Iris Glow icon (24px) at top, FrameGothic 500 18px Carbon Vellum heading, 14px Smoke body copy below. 24px column gap. The feature 'card' is really just a typographic block — no border, no background.

### Product UI Mockup Container
**Role:** Hero and feature visual: the actual Frame.io app interface shown as marketing imagery

10px border-radius, 1px Twilight (#4f4f80) border, inner surface is the native dark UI of the product (Graphite, ~#181826 with violet shadow #181826). The container is intentionally minimal — a thin violet halo, nothing else.

### Video Showcase Player
**Role:** Cinematic full-width video preview in lower sections

10px border-radius, embedded video player with Iris Glow play button overlay (48px circle, 60% opacity). Caption strip below at 12px Smoke. The video itself is the hero — the player chrome is nearly invisible.

### Section Divider
**Role:** Visual separation between full-width content bands

No physical divider — sections flow seamlessly using the cosmic gradient background. When separation is needed, a 1px Charcoal (#2a2a32) hairline.

### Adobe Logo Mark (nav)
**Role:** Adobe acquisition indicator in top nav

Tiny stacked-triangle Adobe 'A' mark at far right of nav, Carbon Vellum, 16px height. Pure brand signal, no interaction.

## Do's and Don'ts

### Do
- Use 100px border-radius for all buttons, nav items, and pills — the pill geometry is the brand's most repeated shape
- Set display headlines at weight 400 with tight negative letter-spacing (-1.92px at 48px, -3.6px at 80px) — never go bold for impact
- Reserve Iris Glow (#6199f6) for icons, eyebrow labels, links, and active states — one accent color, used surgically
- Place the NeueMachinaInktrap eyebrow label (12px, uppercase, 0.06em tracking) above every section headline as a section marker
- Layer at least one gradient on every page background — never use flat #0a0a13 alone, the cosmic atmosphere requires depth
- Set the max content width to 1280px and center all content within it, while backgrounds run full-bleed
- Use FrameGothic at 14–18px for all body and feature text in #a3a3b3 or #757580 — these two grays carry all secondary information
- Frame product imagery in 10px-radius containers with a 1px #4f4f80 violet border — the halo is the only frame allowed

### Don't
- Do not use weight 600 or 700 for display headlines — the 400 weight is a signature restraint choice
- Do not introduce additional accent colors — Iris Glow is the only chromatic accent in the system
- Do not use flat black (#000000) as a full-page background — always layer gradients to create the cosmic atmosphere
- Do not add card backgrounds or heavy borders to feature columns — they are typographic blocks, not cards
- Do not use serif fonts, decorative typefaces, or any font other than FrameGothic, NeueMachinaInktrap, or system fallbacks
- Do not add drop shadows to buttons or nav items — the fill contrast alone carries the hierarchy
- Do not center-align body paragraphs — left-align with a max-width of ~560px for readable line lengths
- Do not use the eyebrow label style (NeueMachinaInktrap caps) for any text other than section identifiers — it's a stamp, not a label

## Elevation

- **Product UI Mockup Container:** `inset 0 0 0 1px #4f4f80, 0 0 60px rgba(79, 79, 128, 0.15)`
- **Hero CTA Pill:** `none — relies on fill contrast, no shadow`
- **Video Showcase Player:** `0 24px 48px rgba(0, 0, 0, 0.5)`

## Surfaces

- **Cosmic Canvas** (`#0a0a13`) — Primary page background with deep purple/blue radial gradient overlay
- **Nav Veil** (`#040407`) — Slightly darker topmost layer behind navigation bar
- **Product Surface** (`#08080c`) — Embedded app UI mockups and product chrome
- **Card Halo** (`#181826`) — Inset shadow tint for cards with violet borders, creates depth without lifting the surface

## Imagery

Imagery is the product itself: high-fidelity screenshots of the Frame.io app interface dominate the hero, showing real video thumbnails, review threads, and version stacks. Below the fold, cinematic stills from actual films/projects (a silhouetted figure against warm light, a close-up portrait of a performer) are presented as full-bleed video showcases with minimal player chrome. No stock photography, no abstract illustrations, no 3D renders — the visual language is 'show, don't decorate.' The cosmic gradient backgrounds (deep purples, midnight blues, near-black) create an atmosphere of a dark editing suite or projection room. Icons throughout the UI are thin-stroke, single-color Iris Glow, 24px, outlined style. No filled iconography anywhere.

## Layout

Full-bleed dark canvas with all content constrained to a max-width of ~1280px centered. The hero is a split composition: left half carries the display headline and stacked CTAs (left-aligned), right half shows the product UI mockup floating against the cosmic gradient. Section rhythm alternates between text-dominant bands and product-visual bands, with 80px vertical gaps. Mid-page uses a 4-column feature grid (icon + heading + body) that reads more like editorial columns than cards. No sidebar, no mega-menu — navigation is a single slim top bar with pill buttons. Lower sections are full-width video showcases with centered text above. The overall density is spacious and cinematic — sections breathe, with generous padding and a single horizontal scroll metaphor implied by the flowing gradient background.

## Similar Brands

- **Adobe Premiere Pro** — Same dark editing-suite atmosphere with deep purple gradient backgrounds and one blue accent for active tools
- **Vimeo** — Dark-mode creative platform with pill-shaped CTAs and video-first product mockups dominating the hero
- **Linear** — Similar commitment to a single accent color against near-black, with display type at weight 400 and tight letter-spacing doing all the visual work
- **Pitch** — Dark product pages with cosmic gradient backgrounds, oversized thin-weight headlines, and one vivid accent for interactive elements
