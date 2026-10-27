# Flighty — Style Reference
> Control tower at midnight — a luminous control room with glowing screens floating around a single device

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Flighty is a departure-board-meets-control-tower: the upper page reads as a crisp white airport information panel, then the page drops into a deep midnight-violet control room with glowing screens in the dark. The palette is overwhelmingly achromatic, with one vivid blue (#007bff) reserved for actions and one amber-yellow (#f7be00) for the download conversion — a signal-light system against the dark and light surfaces. Typography is confident and heavy: a 56px display headline with tight -0.025em tracking that lands like a gate-change announcement, supported by compact system-ui body text. The signature element is the phone mockup surrounded by floating notification cards — soft, shadowed, slightly tilted cards showing real-time flight data (delays, gate changes, check-in opens) that orbit the device and make the product feel alive rather than static. Surfaces are nearly flat with ultra-low-opacity shadows (0.02–0.04) and hairline borders, so depth comes from layering and the page's light-to-dark transition, not from heavy drop shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Blue | `#007bff` | Primary action button fill, active link states, focus indicators — the single chromatic action color in an otherwise achromatic system |
| Amber Alert | `#f7be00` | Download CTA, high-priority callouts, notification accents — warm yellow against dark surfaces for the conversion moment |
| Deep Indigo | `#0d0021` | Dark section backgrounds, announcement bar, hero gradient base — the midnight-violet that makes screens glow |
| Midnight Ink | `#05010d` | Dark card surfaces, deepest background layer — near-black with a violet undertone |
| Pure White | `#ffffff` | Light canvas, notification card surfaces, text on dark — the dominant surface color in the upper page |
| Pure Black | `#000000` | Primary text, icon strokes, hairline borders, ghost button fills — the structural ink of the system |
| Carbon | `#333333` | Secondary text, subdued body copy — reads softer than pure black for paragraph-length content |
| Slate | `#595959` | Tertiary text, metadata, timestamps in notification cards |
| Steel | `#737373` | Muted body text, disabled states, inactive nav items |
| Fog | `#808080` | Placeholder text, dimmed labels, low-priority metadata |
| Silver | `#cfcfcf` | Hairline borders, card outlines, subtle dividers, very light surface tint |
| Linen | `#faf8f7` | Warm off-white surface — alternate card background, subtle tonal shift from pure white |
| Ash | `#89898e` | Cool gray for pressed states and slightly cooler text — the only neutral with a slight blue cast |
| Alert Red | `#d92d20` | Red outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### system-ui — Primary typeface for the entire system — covers display headlines, navigation, body copy, and UI labels. Weight 700 dominates display sizes (56px, 32px) for the bold announcement-board voice; 500–600 for nav and emphasis; 400 for body. The choice of system-ui over a custom typeface is itself a signature: it reads native on every device and inherits the platform's voice rather than imposing a foreign one.
- **Substitute:** Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13px, 15px, 16px, 17px, 22px, 32px, 56px
- **Line height:** 1.00–2.00 (display headlines 1.00, body 1.38, loose body 1.50–2.00)
- **Letter spacing:** -0.025em at 56px, -0.025em at 32px, -0.010em at 17px, -0.006em at 16px, -0.005em at 15px

### EB Garamond — Editorial serif accent for emphasis moments — tight line-height (0.90) and 700 weight give it a display-poster quality. Used sparingly, probably for tagline or feature emphasis where the sans-serif would feel too uniform.
- **Substitute:** Playfair Display, Cormorant Garamond
- **Weights:** 700
- **Sizes:** 24px
- **Line height:** 0.90
- **Letter spacing:** -0.020em

### SF Pro Text Regular — SF Pro Text Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px, 15px
- **Line height:** 1.2, 1.5

### SF Pro Text Semibold — SF Pro Text Semibold — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Indie Flower — Indie Flower — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| heading-sm | — | — | 22px | 1.38 | -0.55px |
| heading | — | — | 32px | 1.1 | -0.8px |
| display | — | — | 56px | 1 | -1.4px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **nav:** 999px
- **tags:** 999px
- **cards:** 16px
- **icons:** 999px
- **inputs:** 12px
- **buttons:** 999px
- **floatingCards:** 20px

## Components

### Announcement Bar
**Role:** Top-of-page promotional strip

Full-width bar with #0d0021 (Deep Indigo) background, white text at 13px system-ui 500, centered content with a small icon (lightbulb) and a 'View Live →' link. Padding approximately 8px vertical. Optional close button on the right. This bar announces live features or news and uses the dark-indigo to set the control-room tone before the white page begins.

### Floating Navigation Pill
**Role:** Primary site navigation

Single rounded pill (999px radius) floating on the page with subtle shadow stack. Contains the ✈ logo mark, menu items (Pricing, Gift Cards, Passport, Airports, Help Center) in 15px system-ui 500 #000, and a 'Get the app' ghost button on the right. The pill itself has a white or very-light background with 1px border. Padding 8px vertical, 12-16px horizontal inside the pill. The pill form — rather than a full-width bar — is the signature: the nav sits on the page like a control device, not a structural element.

### Ghost App Button (nav)
**Role:** Secondary conversion in nav

Inside the nav pill: transparent background, #000 text, 1px border in #000 at 50% opacity, 999px radius, 8px 16px padding. Includes a small phone icon. This is the quiet 'get the app' prompt that lives inside the nav.

### Primary Blue Button
**Role:** Main call-to-action

Filled #007bff background, white text, 999px radius, 12px 24px padding, 15px system-ui 600. No border. The only chromatic filled button in the system — used sparingly for the most important action on a given page.

### Amber Download Button
**Role:** High-priority download conversion

Filled #f7be00 background, #000 text, 999px radius, 12px 24px padding, 15px system-ui 600 with a download icon. Appears at key conversion moments (hero floating, dark section). The yellow-against-dark contrast makes it the most attention-grabbing element on dark backgrounds.

### Dark Ghost Button
**Role:** Secondary action on dark backgrounds

Transparent or #05010d background, white text, 1px white-at-low-opacity border, 999px radius, 12px 24px padding, 15px system-ui 500 with a phone icon. Used alongside the Amber Download button in the dark section as the quieter companion action.

### Display Headline
**Role:** Hero and section headlines

56px system-ui 700, -1.4px letter-spacing, line-height 1.00, color #000 on light surfaces or #fff on dark. Sentence-case or title-case. The tight tracking and full line-height-to-font-size ratio make the headline feel like one block of type rather than wrapped text — like a gate-change announcement.

### Section Subheadline
**Role:** Supporting paragraph text

17px system-ui 400, -0.17px tracking, line-height 1.50, color #333 (Carbon) on light or #cfcfcf on dark. Centered or left-aligned. Generous line-height gives it a reading-optimized feel despite the compact density of surrounding UI.

### Award Badge Pair
**Role:** Social proof indicator

Horizontal pair of small pill-shaped badges, each ~40px tall with 999px radius. Left badge: white background, black text 'Apple Design Award · Winner 2023' with a small Apple logo icon. Right badge: blue gradient or solid blue background, white text 'App of the Year · Finalist 2023' with a small App Store icon. Sized as supporting evidence, not as primary content.

### Phone Mockup Frame
**Role:** Product showcase container

Large central element holding a realistic phone render showing the Flighty app interface. The phone sits in a realistic hand photograph with natural skin tones. The frame itself has no border or shadow — the photographic context provides all the depth. Sized at roughly 350-400px wide on desktop.

### Floating Notification Card
**Role:** Live-data product demonstration

The signature component. White (#ffffff) background, 20px border-radius, subtle multi-layer shadow at 0.02-0.04 opacity, 16px padding. Contains: a small icon or avatar (24-32px), a bold 15px headline in #000 ('Mom landed in New York', 'Check in is now open'), and muted 13px metadata in #737373 ('6:32am (22m early) and ↓ 88°', 'You can check-in at delta.com'). Cards are positioned around the phone at slight rotations (-3° to +3°) to feel scattered, not gridded. Some cards use a left border accent in #007bff, #d92d20, or #f7be00 to indicate status.

### Press Logo Card
**Role:** Media credibility grid

Each press logo sits in a #05010d or near-black card with 1px white-at-8% border, 12px or 16px border-radius, generous internal padding (40-60px vertical). Logo marks are rendered in white or light gray at ~60% opacity. Arranged in a 4-column grid (4×2) with 10-16px gaps. The cards are flat — no shadows — so they read as tiles on the dark surface, not as floating elements.

### Section Divider Band
**Role:** Light-to-dark page transition

Full-width bands that shift the page from white canvas to #0d0021 Deep Indigo. No hard border — the transition is seamless, using the deep-indigo background to envelop the next section. Headlines within these bands switch to white at the same 56px / 32px scale, maintaining typographic continuity across the theme change.

## Do's and Don'ts

### Do
- Use system-ui at 400-700 weights — never introduce a custom sans-serif for body or UI text
- Set display headlines at 56px system-ui 700 with -1.4px letter-spacing and line-height 1.00 — the tight tracking and full line-height are the announcement-board voice
- Use #007bff only for the single most important action on any given surface — never for decoration, tags, or secondary buttons
- Use #f7be00 exclusively for the download conversion moment — pair it with a download icon and dark surroundings for maximum signal
- Apply 999px radius to all buttons, tags, nav elements, and icon containers — the pill shape is the system default, not an option
- Position notification cards at slight rotations (-3° to +3°) around product mockups with 20px radius and whisper-thin shadows to create the scattered, real-time feel
- Transition between light and dark sections seamlessly — use #0d0021 as the dark canvas and keep the same type scale; only swap the color token

### Don't
- Don't add drop shadows heavier than the 0.02-0.04 opacity system — heavy shadows break the flat, departure-board aesthetic
- Don't use #007bff or #f7be00 for text, borders, or backgrounds other than their specific action roles — these are signal colors, not brand washes
- Don't introduce a second sans-serif typeface — system-ui covers the full range from caption to display
- Don't use sharp corners (0-4px radius) on cards, buttons, or containers — the minimum card radius in this system is 8px, the default is 16-20px
- Don't place colored borders or backgrounds on body text — keep #000 or #333 for text on light, #fff or #cfcfcf on dark
- Don't crowd sections — even with compact density, maintain 64-80px section gaps to let the large headlines breathe
- Don't use the #d92d20 red decoratively — it is a functional alert color for cancellations and critical delays, nothing else

## Elevation

- **Floating notification card:** `0px 0px 0px 1px rgba(0,0,0,0.04), 0px 1px 1px 0.5px rgba(0,0,0,0.02), 0px 3px 3px 1.5px rgba(0,0,0,0.02), 0px 6px 6px -3px rgba(0,0,0,0.02), 0px 12px 12px -6px rgba(0,0,0,0.02), 0px 24px 24px -12px rgba(0,0,0,0.02)`
- **Standard card:** `0px 0px 0px 1px rgba(0,0,0,0.04), 0px 1px 1px 0.5px rgba(0,0,0,0.02), 0px 3px 3px 1.5px rgba(0,0,0,0.02), 0px 6px 6px -3px rgba(0,0,0,0.02), 0px 12px 12px -6px rgba(0,0,0,0.02), 0px 24px 24px -12px rgba(0,0,0,0.02)`
- **Navigation pill:** `0px 1px 1px 0.5px rgba(0,0,0,0.03), 0px 3px 3px 1.5px rgba(0,0,0,0.03), 0px 6px 6px -3px rgba(0,0,0,0.03), 0px 12px 12px -6px rgba(0,0,0,0.03), 0px 24px 24px -12px rgba(0,0,0,0.03)`
- **Press logo card:** `1px solid rgba(255,255,255,0.08), no shadow — flat with hairline border`

## Surfaces

- **Light Canvas** (`#ffffff`) — Page background in light sections — the departure-board white
- **Linen Card** (`#faf8f7`) — Alternate light surface — subtle warm shift for nested cards
- **Silver Divider** (`#cfcfcf`) — Hairline borders and very light tonal bands
- **Deep Indigo** (`#0d0021`) — Dark section canvas — the control-room background
- **Midnight Ink** (`#05010d`) — Darkest surface — card backgrounds floating on the indigo

## Imagery

Product photography dominates: a large realistic phone render held in a human hand, photographed in natural light with visible skin texture and finger positioning — the hand is not staged flat, it has grip and dimensionality. Around the phone, floating UI notification cards (rendered, not photographed) orbit the device at slight angles, showing real flight data: gate changes, check-in openings, delay alerts, landing confirmations. No lifestyle photography of airports, planes, or travelers. The press section uses monochrome logo marks (CNBC, CNN, Fox News, WSJ, Inc., Business Insider, TechCrunch, The Verge) rendered in white/light gray on dark cards — no brand-color treatment. The visual language is product-first: the app and its data ARE the imagery, not supplementary decoration.

## Layout

The page is a scrolling narrative that alternates between two surface modes: a light departure-board mode (white canvas, centered content) and a dark control-room mode (#0d0021 canvas, centered content). The hero is full-width white with a centered headline stack, centered subtext, centered award badges, and a large phone mockup flanked by scattered notification cards. Sections are separated by seamless background-color transitions rather than visible dividers. Content is consistently center-aligned on a max-width ~1200px column. The dark section features a phone-in-hand at scale, then transitions to a press-logo grid (4 columns × 2 rows) followed by a left-aligned text block. Navigation is a floating pill at the top, not a full-width bar. The rhythm is: white hero → dark product showcase → dark press credibility → dark text closer. There are no sidebar or multi-column layouts — everything is single-column, centered, with the product imagery providing the only lateral content.

## Similar Brands

- **Apple Product Pages** — Same hero-with-headline-over-product pattern, same light-to-product-showcase rhythm, same heavy display typography with tight tracking
- **Things 3 (Cultured Code)** — Same app-in-hand photography style with product UI rendered around the device, same restrained color palette with one accent for action
- **Linear** — Same compact density, same preference for hairline borders over heavy shadows, same system-font typography approach with tight letter-spacing on display sizes
- **Arc Browser** — Same floating UI elements orbiting a central product, same playful scattering of notification-like cards, same dark-mode depth with glowing accent colors
- **Vercel** — Same minimal navigation (floating pill rather than full bar), same transition from light marketing surface to dark product surface, same ultra-subtle shadow approach
