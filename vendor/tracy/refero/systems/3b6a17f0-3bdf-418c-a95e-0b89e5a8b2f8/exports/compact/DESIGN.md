# Raycast — Style Reference
> Midnight command center, coral neon

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Raycast reads as a dark power-tool cockpit: an almost-black canvas (#040506) with barely-visible elevation steps, a single warm coral accent (#ff6363) that carries brand identity, and quiet white/gray typography in Inter. Components are defined less by shadows and more by hairline borders, inset highlight strokes, and the distinctive 'keyboard key' inner-shadow treatment that makes cards feel pressed and tactile rather than floating. Color is rationed — the page is 98% achromatic, and the coral appears only in the logo, hero artwork, AI badge, and the occasional warm-tinted surface. Navigation floats with a glass-blur effect, and most interactive surfaces are neutral light-gray buttons on dark, not chromatic CTAs. The hero abandons the system entirely with large red/blue gradient geometry, then the rest of the page returns to the austere dark surface — contrast through atmosphere, not decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#040506` | Page canvas, dominant background — the near-pure-black base that most of the interface sits on |
| Ink | `#07080a` | Card surfaces, elevated panels, image backgrounds — one step up from the canvas for content blocks |
| Obsidian | `#111214` | Subtle surface tint, pressed states, input wells — used for slight depth on form fields and recessed containers |
| Graphite | `#1b1c1e` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. |
| Smoke | `#6a6b6c` | Secondary body text, muted labels — the everyday reading color on dark surfaces |
| Ash | `#9c9c9d` | Light text on dark surfaces, inverse labels, and high-contrast captions. |
| Mist | `#e6e6e6` | Light neutral action fill for buttons on dark surfaces. |
| Iron | `#454647` | Button text on light fills, mid-gray borders — paired with Mist for filled button labels |
| Slate | `#2f3031` | Dark button borders and labels on ghost/dark buttons |
| Pure White | `#ffffff` | Headings, high-emphasis text, reversed text on light buttons — the loudest text color in the system |
| Coral Pulse | `#ff6363` | Brand accent — logo diamond, AI badge fill, hero artwork saturation, the single warm punctuation in an achromatic system |
| Ember Hush | `#452324` | Warm-tinted card backgrounds, accent surface tints — desaturated coral used as a muted backdrop for coral-anchored content |
| Electric Sky | `#63a1ff` | Hero illustration mid-tone, decorative gradient — appears only in the dramatic abstract hero artwork, not in interface controls |
| Cobalt Edge | `#143ca3` | Hero illustration stroke, deep gradient anchor — paired with Electric Sky in the hero's blue geometry |
| Deep Space | `#02193b` | Hero illustration fill, darkest blue in the artwork gradient — not a UI token |
| Info Blue | `#56c2ff` | Blue wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Success Green | `#59d499` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |

## Typography

### Inter — Primary interface typeface — body text at 16px/400, nav and card labels at 13–14px/500, subheadings at 18–22px/400, section headings at 32–56px in the 400–600 range, and display at 64px/600. Inter's neutral geometry carries the developer-tool seriousness; weight 400 at the 56px hero headline is an anti-convention choice — most brands shout with 700, Raycast whispers with regular weight and lets the size do the work
- **Substitute:** system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 18px, 20px, 22px, 24px, 32px, 56px, 64px
- **Line height:** 0.91–1.71
- **Letter spacing:** 0.0040em at 56px, 0.0100em at 20px, 0.0140em at 14px, 0.0080em at 13px, 0.0730em at 11px (uppercase eyebrow)
- **OpenType features:** `'calt', 'kern', 'liga', 'ss03'`

### GeistMono — Monospace for version strings, technical micro-labels, terminal-style text — appears in footer metadata (v1.104.21), command-line hints, and 10px uppercase eyebrow tags. Geist Mono's compact, slightly geometric forms make the tiny labels feel engineered rather than decorative
- **Substitute:** 'JetBrains Mono', Menlo, Monaco, Courier, monospace
- **Weights:** 300, 400, 500
- **Sizes:** 10px, 12px, 14px
- **Line height:** 1.00–1.60
- **Letter spacing:** 0.0170em at 12px, 0.0500em at 10px (uppercase)
- **OpenType features:** `'calt', 'kern', 'liga', 'ss03', 'ss09'`

### SF Pro Text — System font used for icon glyphs and numeric stat callouts at 24–32px/500. Falls back to SF Pro on macOS for native feel — reinforces the 'this is a Mac app' identity
- **Weights:** 500, 700
- **Sizes:** 16px, 24px, 32px
- **Line height:** 1.15
- **OpenType features:** `"calt", "kern", "liga", "ss03"`

### SF Pro — SF Pro — detected in extracted data but not described by AI
- **Weights:** 700
- **Sizes:** 13px
- **Line height:** 1.23
- **OpenType features:** `"calt", "kern", "liga", "ss03"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 11px | 0.91 | 0.8px |
| body | — | — | 16px | 1.15 | 0px |
| body-lg | — | — | 18px | 1.15 | 0px |
| subheading | — | — | 20px | 1.2 | 0.2px |
| heading-sm | — | — | 24px | 1.15 | 0px |
| heading | — | — | 32px | 1.15 | 0px |
| heading-lg | — | — | 56px | 1.17 | 0.22px |
| display | — | — | 64px | 1.1 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 16px
- **pills:** 9999px
- **badges:** 6px
- **inputs:** 8px
- **buttons:** 8px
- **largeCards:** 20px
- **iconContainers:** 99999px

## Components

### Glass Navigation Bar
**Role:** Top-level site navigation

Floating pill-shaped bar with backdrop-blur(48px), 1px solid border at #363739, 8px radius, transparent dark fill (sits over #040506). Logo at left (red diamond + 'Raycast' wordmark in white, 13px/500), nav links centered at 13–14px in #9c9c9d, and a light-gray Download button at right. Padding approximately 8px vertical, 16px horizontal internally.

### Neutral Filled Button (Download CTA)
**Role:** Primary download and action button

Light Mist (#e6e6e6) fill, Iron (#454647) text at 13–14px/500, 8px radius, 8px 12px padding. Sometimes paired with a small black/dark icon (Apple, Windows logo) at 15px. This is the only filled action surface in the system — deliberately neutral rather than chromatic, letting the dark page do the contrasting.

### Ghost Nav Link
**Role:** Navigation and inline links

Transparent background, Ash (#9c9c9d) text at 13–14px, no border, no padding. Hover state transitions to Pure White. 0px radius — the nav bar's outer pill provides the visual containment.

### Feature Card with Key Shadow
**Role:** Content card for features, extensions, and showcase blocks

16px radius, 24px padding, 8px internal padding on content blocks. Signature treatment uses the 'keyboard key' shadow stack: rgba(255,255,255,0.05) inset top highlight, rgba(255,255,255,0.25) outer 1px ring, rgba(0,0,0,0.2) inset bottom shadow. This creates a pressed, tactile surface — not a floating card but a recessed key cap. Background is transparent on the card surface so the canvas shows through.

### Edge-Highlight Card
**Role:** Hover or featured card variant

16–20px radius, transparent fill, defined by 1px solid #363739 border plus the inset highlight stack. Used when a card needs to be defined by edge rather than surface — the border does the work that a background would on a lighter system.

### Inset Input Field
**Role:** Text input, search, and form fields

8px radius, rgba(255,255,255,0.05) fill, 8px 12px padding, Pure White text at 16px/400. Sits recessed in the surface — the slight white tint reads as 'this is a well you can type into' against the dark canvas. Placeholder text in Ash.

### Badge Tag
**Role:** Inline metadata, version labels, category tags

Graphite (#1b1c1e) fill, Pure White text, 6px radius, 0 6px padding (tight horizontal pill). Used for version numbers, 'beta' tags, and category labels. Compact and quiet — never draws attention away from the content it annotates.

### Circular Icon Container
**Role:** App icon, extension icon, feature icon backing

99999px radius (perfect circle), 20px padding, subtle dark surface fill. Contains a 24–32px SF Pro Text glyph or product icon. The circular frame makes app/extension icons feel like dock items.

### Hero Gradient Banner
**Role:** Hero section atmospheric backdrop

Full-bleed dramatic composition using the red/blue gradient geometry: the radial gradient from rgba(4,63,150,0.7) to rgba(6,18,37,0.25) anchors a blue atmospheric wash, while diagonal red/coral shapes (Coral Pulse with 40px+ blur) cut across the center. This is the one place the system breaks its own rules — color, blur, and scale are cranked to maximum for a 'cinematic' moment before the page returns to the austere dark surface below.

### Footer Meta Strip
**Role:** Version, platform, and installation info

Centered row of Geist Mono 12px/400 text in Ash, separated by vertical pipe characters. Contains version string (v1.104.21), platform requirement (macOS 13+), and install command. Sits below the download buttons with 8px gap — the monospace treatment signals 'this is technical metadata' without needing a label.

### App Window Mockup
**Role:** Product screenshot, feature preview

Recreated app interface shown in screenshots — 12px radius outer frame, 16px radius for the command bar at top, 8px radius for result list items. Uses the 'keyboard key' inner shadow stack on the window chrome to make it feel like a physical object. Internal UI uses Pure White text on #07080a, with a single Coral Pulse highlight on the selected/active row.

## Do's and Don'ts

### Do
- Use #040506 as the only page background — never introduce lighter or grayer canvas colors
- Reserve #ff6363 (Coral Pulse) for the logo, hero artwork, AI badge, and warm-tinted card surfaces — never use it for general accent text, icons, or borders in the body of the page
- Use the 'keyboard key' inner shadow stack (rgba(255,255,255,0.05) inset top + rgba(255,255,255,0.25) outer ring + rgba(0,0,0,0.2) inset bottom) on all elevated cards and feature blocks
- Set hero headlines at 56px/400 in Inter with +0.22px letter-spacing — the regular weight at large size is a signature, not a mistake
- Use Mist (#e6e6e6) filled buttons with Iron (#454647) text for all primary actions — the system has no chromatic CTA
- Use 8px radius for buttons, inputs, and badges; 16–20px radius for cards; 9999px for pills; 99999px for circular icon containers
- Separate footer metadata with vertical pipes and render in Geist Mono 12px to signal technical information

### Don't
- Don't use chromatic action buttons — the CTA system is deliberately neutral (Mist on dark), not blue/red/green
- Don't add drop-shadows to cards or panels — elevation comes from the inset key shadow stack, not outer shadows
- Don't use negative letter-spacing on large display text — the system uses slightly positive tracking (0.0040em at 56px) which is anti-convention and intentional
- Don't introduce light theme sections or alternating light/dark bands — the page is dark throughout
- Don't use #ff6363 for body text, link colors, or general icon accents — it is a brand mark, not a functional color
- Don't use multiple accent colors in the same surface — the system is monochromatic with one coral accent, not a multi-hue palette
- Don't use SF Pro Text for body copy — reserve it for icons and numeric stat callouts at 24–32px; body text is always Inter
- Don't break the 8px spacing grid — all padding, gaps, and margins should snap to 8/12/16/24/40 values

## Elevation

- **Hero atmospheric composition:** `No conventional shadow — instead uses multi-layer radial gradients and 37.5px blur filters to create depth through atmosphere`
- **Featured content cards:** `rgba(255,255,255,0.05) 0px 1px 0px 0px inset, rgba(255,255,255,0.25) 0px 0px 0px 1px, rgba(0,0,0,0.2) 0px -1px 0px 0px inset — the 'key' treatment`
- **Download buttons:** `rgba(0,0,0,0.03) 0px 7px 3px 0px, rgba(0,0,0,0.25) 0px 4px 4px 0px — subtle lift on neutral filled surfaces`

## Surfaces

- **Canvas** (`#040506`) — The default page background — near-pure black that most UI sits on
- **Card** (`#07080a`) — Elevated content blocks, hero image backdrops, the first visible step up from the canvas
- **Recessed** (`#111214`) — Input fields, pressed or inset wells, subtle depth on form controls
- **Badge** (`#1b1c1`) — Dense tag surfaces, monogram tiles, the darkest intentional filled surface
- **Accent Tint** (`#452324`) — Warm coral-tinted backdrop for sections anchored to the brand color

## Imagery

Imagery is dominated by the hero: massive abstract red/blue geometric shapes (diagonal bars, radial glows) that feel like a motion-graphics title sequence rather than product photography. Below the hero, the system shifts to in-context product screenshots that show the actual app interface — a dark command bar, result list, and extension icons rendered as if floating on the page. Photography is absent. The visual density shifts dramatically from the cinematic hero to austere product mockups and then to text-heavy feature sections with no imagery at all. Icon style: SF Pro Text system glyphs at 16–24px, weight 500, rendered in Mist (#e6e6e6) on dark surfaces. No photographic, lifestyle, or stock imagery — the product UI is the hero.

## Layout

Page model is max-width ~1200px centered with generous horizontal padding, but the hero and atmospheric sections are full-bleed. The nav bar is a floating pill that sits over the hero with backdrop-blur. Hero is full-viewport height with centered headline (56px Inter 400) over a dramatic red/blue gradient composition. Below the hero, content shifts to contained max-width sections with generous vertical rhythm (80–120px between sections). Card grids appear for features and extensions — 3-column for compact tiles, 2-column for wider feature blocks. Section rhythm is consistent: dark-on-dark bands with hairline dividers, no alternating light/dark sections. Navigation is a single floating glass bar; no sidebar, no mega-menu. The overall density is spacious — the system prefers one strong typographic statement per section over dense information layout.

## Similar Brands

- **Linear** — Same dark-near-black canvas with single-hue accent strategy, same Inter-based typography, same restrained component library with hairline borders instead of heavy shadows
- **Vercel** — Same full-bleed dark hero with gradient/geometric backdrop, same max-width contained content sections below, same neutral filled button approach against dark surfaces
- **Arc Browser** — Same dramatic colored hero artwork on a dark canvas, same coral/warm accent that punctuates an otherwise achromatic system, same browser/product-as-artifact aesthetic
- **Cron (Notion Calendar)** — Same dark product-site language with clean Inter type, same hairline-bordered feature cards, same minimal navigation over atmospheric hero
- **Tana** — Same power-user productivity tool positioning with dark UI, same tight typographic scale, same use of subtle warm accents against near-black backgrounds
