# Uniswap — Style Reference
> Pink confetti over a clean white trading desk.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Uniswap's interface is a bright, mostly flat white canvas interrupted by one saturated hot-pink accent and scattered colorful decorative orbs that give the experience a playful, confetti-like atmosphere. The system deliberately rejects the dark-mode crypto convention in favor of an airy, almost editorial feel where the swap widget sits front-and-center as a quiet white card and the pink (#ff37c7) does all the expressive work — marking the primary action, the brand mark, and the only chromatic decision an interface designer needs to make. Typography is handled by a single custom face (Basel) at unusual mid-weights (485, 535) with tight tracking across all sizes, producing a geometric, slightly clinical tone that keeps the product feeling like a serious financial tool despite the candy-colored hero. Surfaces are nearly shadowless — the only elevation in the system is a barely-visible 10% black blur — and everything is separated by hairline borders and generous whitespace rather than stacked panels. The rainbow of secondary hues (#ff4d00, #2abdff, #00c3a0, #8251fb, etc.) functions as a token/asset taxonomy rather than a UI accent system, meaning most new screens should stay achromatic with pink as the sole chromatic verb.

## Colors

| Name | Value | Role |
|------|-------|------|
| Uniswap Pink | `#ff37c7` | Primary brand mark, filled CTA buttons, active nav indicator, and the only chromatic color an interface should use — saturated hot-pink against a white canvas creates instant focal hierarchy without darkening the page |
| Midnight Ink | `#131313` | Dark borders and separators for elevated surfaces and inverted UI. |
| Pure White | `#ffffff` | Page canvas, card surfaces, input fields, and text on pink buttons — the structural base everything sits on |
| Carbon | `#222222` | Secondary structural border and text variant used in nav and button outlines where slightly softer than Midnight Ink is desired |
| Slate | `#6a6a6a` | Dark borders and separators for elevated surfaces and inverted UI. |
| Ash | `#acacac` | Disabled states, placeholder text, hairline icon borders, and the lightest visible UI elements |
| Frost | `#f2f2f2` | Disabled button borders and the faintest possible surface separation |
| True Black | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Blush Mist | `#fef4ff` | Primary page canvas and white card surfaces. Do not promote it to the primary CTA color |
| Ember | `#ff4d00` | Orange decorative accent for icons, marks, and small graphic details |
| Iris | `#8251fb` | Token/asset category color for violet-branded assets and decorative purple orbs |
| Magenta | `#f50db4` | Token/asset category color for pink-branded assets and decorative orbs (a slightly different pink from the brand) |
| Sky | `#2abdff` | Token/asset category color for blue-branded assets and decorative orbs |
| Mint | `#00c3a0` | Token/asset category color for teal-branded assets and decorative orbs |
| Crimson | `#e01a2b` | Red decorative accent for icons, marks, and small graphic details. Use as a supporting accent, not as a status color |
| Forest | `#0c8911` | Green decorative accent for icons, marks, and small graphic details. Use as a supporting accent, not as a status color |

## Typography

### Basel — Sole typeface across every UI surface. The unusual mid-weights (485, 535) are the signature: Basel avoids the standard 400/500/600 ladder and instead calibrates precise intermediate weights, which is why body text and headings feel more like a continuous gradient than discrete steps. The geometric construction with tight -0.02em tracking across all sizes produces a slightly compressed, clinical-financial tone — readable but never decorative. For open-source replacement use Inter at 400/500/550, or DM Sans at 400/500/550.
- **Substitute:** Inter (400/500/550) or DM Sans (400/500/550)
- **Weights:** 400, 485, 500, 535
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 18px, 24px, 36px, 52px, 64px
- **Line height:** 0.75–1.49 depending on size (tight 0.75–0.96 for display, 1.19–1.33 for body)
- **Letter spacing:** -0.02em constant across all sizes

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.33 | -0.22px |
| subheading | — | — | 18px | 1.2 | -0.36px |
| heading-sm | — | — | 24px | 1.15 | -0.48px |
| heading | — | — | 36px | 1.11 | -0.72px |
| heading-lg | — | — | 52px | 0.96 | -1.04px |
| display | — | — | 64px | 0.75 | -1.28px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 20px
- **cards:** 20px
- **icons:** 20px
- **pills:** 9999px
- **inputs:** 20px
- **buttons:** 20px

## Components

### Filled Pink CTA Button
**Role:** Primary action — the only filled button in the system

Background #ff37c7, text #ffffff, weight 535 Basel at 14-16px, padding 8px 16px, border-radius 20px, no shadow. Used for the single most important action on any screen (Connect, Trade Now). Never pair with another filled button of equal weight on the same screen.

### Pill Ghost Button
**Role:** Secondary action in the header

Transparent background, 1px border in #131313 or #222222, text #131313, border-radius 9999px (full pill), padding 7px 14px, font size 13-14px weight 500. Used for 'Get the app' and similar navigational CTAs that must sit beside the primary action without competing.

### Hero Swap Card
**Role:** The central product widget — token swap interface

White surface (#ffffff), 1px border in #f2f2f2, border-radius 20px, padding 16px internal panels. Contains two stacked sub-panels (Sell / Buy) each with their own inner border, separated by a circular arrow-button connector. No drop shadow — separation is purely border-based.

### Swap Input Panel
**Role:** Individual Sell/Buy sub-panel inside the swap card

White background, 1px border #f2f2f2, border-radius 20px, padding 16px. Label text in #6a6a6a at 12px, value text in #131313 at 36-52px, token selector chip on the right.

### Token Selector Chip
**Role:** Token selection button (ETH, Select token)

Filled with #ff37c7 for the primary 'Select token' action, white text, border-radius 20px, padding 8px 16px, weight 500. For tokens already selected, shows token icon + ticker + dropdown chevron on white background with #131313 text.

### Soft Pink Action Button
**Role:** Low-emphasis full-width action (e.g. 'Get started')

Background #fef4ff (Blush Mist), text #ff37c7, weight 535 at 16px, border-radius 20px, padding 16px horizontal, full width of its container. Lighter than the filled CTA — used when the action is important but not the page's primary conversion.

### Top Navigation Bar
**Role:** Persistent site navigation

White background (#ffffff), no visible border, 64-72px height. Left: Uniswap pink logo (unicorn) at 24px. Center: search bar with light gray fill #f2f2f2 and 9999px pill radius. Right: ghost pill button + filled pink 'Connect' button. Horizontally distributed with logo+nav on left, search centered, actions on right.

### Nav Link
**Role:** Top-level navigation item (Trade, Explore, Pool, Portfolio)

Text #131313 at 14px weight 500, no underline, 4px vertical padding, 8px horizontal padding. Active state shows pink underline (1px #ff37c7). Hover state: text color #6a6a6a.

### Search Bar
**Role:** Global token/pool/wallet search in the nav

Background #f2f2f2, border-radius 9999px (full pill), padding 8px 16px, placeholder text #6a6a6a at 14px, leading search icon in #6a6a6a. Keyboard shortcut hint shown as small badge on the right.

### Stats Card
**Role:** Display key platform metrics (volume, TVL, swappers)

White background, 1px border #f2f2f2, border-radius 20px, padding 24px. Label text in #131313 at 14px weight 500. Value text in #131313 at 36px weight 535. The 24H swap volume variant uses #0c8911 (Forest) for the value text to signal positive real-time data.

### Section Heading Block
**Role:** Large section titles (e.g. 'Powering trillions.', 'Built for all the ways you swap')

Text in #131313 at 36-52px weight 535, line-height 1.11, letter-spacing -0.72 to -1.04px. No max-width constraint — headings stretch full content width to create a 'newspaper headline' feel. Followed by body copy at 16-18px in #131313 or #6a6a6a.

### Text Link with Arrow
**Role:** Inline navigation link (e.g. 'Trade without fees →')

Text #131313 at 14px weight 500, right-arrow character appended. Underline on hover. Used in body copy to direct users to related pages.

### Decorative Color Orb
**Role:** Floating blurred circle in the hero background

Large (80-200px diameter) filled circles in #ff4d00, #2abdff, #00c3a0, #8251fb, #f50db4, #e01a2b, with heavy CSS blur filter. Positioned absolutely around the hero, partially clipped by the viewport. The orbs are the only non-structural visual element and they define the brand's playful personality.

## Do's and Don'ts

### Do
- Use #ff37c7 as the sole chromatic UI color — it is the only pink allowed on buttons, active states, and brand marks. Every other vivid hue is reserved for token/asset identification and decoration.
- Apply -0.02em letter-spacing to ALL Basel text regardless of size — this is not a display-only treatment, it is the base state of the typeface in this system.
- Use border-radius 20px as the default for cards, buttons, inputs, and chips. Reserve 9999px for genuine pill shapes (search bar, ghost nav button).
- Separate surfaces with 1px borders in #f2f2f2 or #222222 rather than shadows. The system has one shadow value (a nearly invisible 10% black 0px 0px 10px blur) — reach for it only on elevated floating elements.
- Place decorative color orbs (blurred circles in #ff4d00, #2abdff, #00c3a0, #8251fb, #f50db4, #e01a2b) in hero and section backgrounds with heavy CSS blur to create the system's signature playful atmosphere.
- Set display headings at 52-64px with line-height 0.75-0.96 — the tight line-height on large type is what gives Basel its clinical-financial authority.
- Limit the swap card to white-on-white with hairline borders. Never add a drop shadow or colored background to the hero product widget — it must read as the calm center of the colorful hero.

### Don't
- Do not use #ff37c7, #ff4d00, #2abdff, #00c3a0, #8251fb, #f50db4, or #e01a2b as generic accent colors for non-asset UI. These hues are a taxonomy, not a palette.
- Do not add elevation through drop shadows. The system's philosophy is flat — use border, not shadow, for separation. If you must use shadow, use only the 10% black 0px 0px 10px value.
- Do not use #fef4ff (Blush Mist) as a page background — it is a disabled/secondary surface only. The page canvas must be #ffffff.
- Do not pair two filled buttons of equal visual weight on the same screen. One filled pink CTA, one ghost/pill button, and all other actions are text links or chips.
- Do not use letter-spacing wider than -0.02em anywhere. The system never opens up tracking, even in small caps or labels — the compression is the personality.
- Do not use standard weight steps (400, 500, 600, 700) with Basel. The signature is the intermediate 485 and 535 weights — they prevent text from feeling either 'regular' or 'bold' and instead create a continuous weight gradient.
- Do not introduce gradients, dark-mode sections, or glassmorphism. The system is aggressively light-mode and flat. Any new section must be white or #fef4ff.

## Elevation

The system intentionally avoids meaningful elevation. The only shadow in the design is color(srgb 0.0745098 0.0745098 0.0745098 / 0.00313726) 0px 0px 10px 0px — a black shadow at 0.3% opacity with zero offset, producing a barely-perceptible blur on the pink CTA button. All surface separation is achieved through 1px borders in #f2f2f2 or #222222. This is a deliberate flat-design choice: the interface reads as a printed page or financial document, not as layered software.

## Surfaces

- **Canvas** (`#ffffff`) — Page background — the structural base for all screens
- **Card** (`#ffffff`) — Card, panel, and input surfaces sit on the same white as the canvas, separated only by 1px borders
- **Tinted Surface** (`#fef4ff`) — Soft pink-tinted background used for secondary action buttons and occasional section tints — the only non-white surface
- **Search Field** (`#f2f2f2`) — Inset search bar fill in the nav, creating a subtle depth cue without using shadows

## Imagery

The visual language is dominated by abstract decorative color orbs — large, heavily blurred filled circles in the full vivid palette (#ff4d00, #2abdff, #00c3a0, #8251fb, #f50db4, #e01a2b) scattered across the hero and section backgrounds. These orbs are purely atmospheric: they create depth and playfulness without depicting any real-world object. There is no photography, no illustration of people, and no 3D rendering. Token logos appear as small circular icons (32px) inside swap and stats components. The hero section may include faint grid/dot patterns at very low opacity as a secondary atmospheric layer. Icons throughout the UI are thin-stroke outlined glyphs in #131313 or #6a6a6a, approximately 1.5px stroke weight, with no filled variants. The system is image-light and color-heavy — the orbs do the visual work that photography would do on a traditional site.

## Layout

The page uses a max-width contained layout centered at approximately 1200px, with the nav bar spanning full viewport width and the hero/swap widget centered within the content column. The hero pattern is a centered headline ('Swap anytime, anywhere.') above a centered swap card, with decorative color orbs floating in the negative space around them. Section rhythm is consistent vertical spacing of ~80px between sections, with seamless flow (no alternating dark bands — everything stays light). Content arrangement alternates between centered stacks (hero, stats) and 2-column split layouts (heading + body text on the left, stats grid on the right). The stats section uses a 2x2 grid of metric cards. Navigation is a single top bar — no sidebar, no mega-menu. The overall density is spacious and editorial: each section is given room to breathe, with the swap card as the calm functional anchor in a sea of colorful background atmosphere.

## Similar Brands

- **Phantom Wallet** — Same light-mode crypto interface with a single saturated brand accent color and playful decorative orbs/blurs in the hero
- **Coinbase Wallet** — Light-mode crypto product with flat surfaces, 1px border separation instead of shadows, and a single vivid brand color as the sole CTA accent
- **Rainbow Wallet** — Playful light-mode DeFi interface that uses a full rainbow of vivid colors as token/asset identifiers rather than as UI accents
- **Lido Finance** — Same flat white-canvas approach with a single chromatic brand color, geometric custom or near-custom typeface, and border-based surface separation
