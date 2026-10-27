# Lens — Style Reference
> mint signal on white paper — a single teal CTA floating in a sea of quiet graphite and pale gray.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lens Protocol reads as a quiet developer platform: white paper background, a single cloud-black logo mark, and one mint-teal accent that powers every interactive surface. The system is overwhelmingly achromatic — graphite type on white with a pale neutral mid-gray border palette — so the teal CTA feels switched on rather than decorative. Pill-shaped controls (50px radius) dominate over square cards (16px), creating a soft, rounded interaction language. Feature cards use faint pastels (peach, mint, lavender, periwinkle) as backdrops for small monochrome icons, giving each capability its own colored tile without ever breaking the achromatic system. Typography pairs Saans (a humanist display sans with ss01 alternates) for headings and Inter for utility text, with both using tight negative tracking that makes the type feel engineered rather than editorial.

## Colors

| Name | Value | Role |
|------|-------|------|
| Mint Signal | `#00caa0` | Primary CTA fill, active nav indicator, link accent on dark — vivid teal against white creates the only chromatic punctuation in the system |
| Graphite | `#2c2d30` | Primary text, heading strokes, icon fills, button borders — the near-black workhorse, kept slightly warm to avoid a cold digital feel |
| Carbon Black | `#211d1d` | Body text at high contrast, deep surface text — warmer alternative to Graphite for long-form copy |
| Slate Mid | `#808183` | Secondary text, helper copy, muted borders — sits between Graphite and Silver for tertiary hierarchy |
| Silver | `#afafaf` | Hairline borders, dividers, disabled states, icon outlines — the workhorse neutral border, freq=808 makes it the most-used color in the system |
| Paper White | `#ffffff` | Page canvas, card surface, input field, filled-on-accent button text |
| Peach Wash | `#ffe4d6` | Supporting palette color for small decorative accents when the core palette needs contrast. |
| Lavender Wash | `#e8e0ff` | Supporting palette color for small decorative accents when the core palette needs contrast. |
| Mint Wash | `#d4f5e8` | Supporting palette color for small decorative accents when the core palette needs contrast. |
| Periwinkle Wash | `#dde7f7` | Supporting palette color for small decorative accents when the core palette needs contrast. |

## Typography

### Saans — Primary display and heading face. Custom humanist sans with the ss01 stylistic set active across the entire site. Used at 46px for hero headlines (lineHeight 1.20), 28px for section titles, 26px for card headings, and 16–21px for UI labels. The positive +0.015em tracking on display sizes is an anti-convention — most crypto brands tighten display, but Saans loosens it, giving headlines a slightly architectural, blueprint-like cadence.
- **Substitute:** Inter (close geometric alternative) or General Sans
- **Weights:** 400, 500, 600
- **Sizes:** 16px, 21px, 26px, 28px, 46px
- **Line height:** 1.20, 1.35, 1.40
- **Letter spacing:** 0.015em (positive — the only positive tracking in the system, reserved for display)
- **OpenType features:** `"ss01" on`

### Inter — Secondary body and UI face. Handles all long-form copy, table cells, nav links, button text, and form labels. The cv11 alternates and the aggressive negative tracking on larger sizes make Inter feel custom-tuned for the protocol's data-dense areas. The 0.88 lineHeight on certain 14–15px contexts suggests inline icon+label rows.
- **Substitute:** System default Inter
- **Weights:** 400, 500
- **Sizes:** 14px, 15px, 16px, 18px, 20px
- **Line height:** 0.88, 1.10, 1.20, 1.29, 1.40, 1.43, 1.45
- **Letter spacing:** -0.025em to -0.006em (tight negative tracking scales with size: -0.025em at 20px, -0.006em at 14px)
- **OpenType features:** `"cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.006px |
| body | — | — | 16px | 1.4 | -0.015px |
| subheading | — | — | 18px | 1.29 | -0.017px |
| heading-sm | — | — | 20px | 1.4 | -0.022px |
| heading | — | — | 26px | 1.35 | 0.015px |
| heading-lg | — | — | 28px | 1.2 | 0.015px |
| display | — | — | 46px | 1.2 | 0.015px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48-80px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **nav:** 8px
- **cards:** 16px
- **links:** 28px
- **small:** 4px
- **buttons:** 50px

## Components

### Pill Primary Button
**Role:** Main CTA

Filled mint pill: background #00caa0, text #ffffff, 50px border-radius, 16px vertical × 24px horizontal padding, Saans 16px weight 500, includes trailing arrow icon (↗). Used for the single high-intent action per view — 'Create Account', 'Start Building'.

### Pill Ghost Button
**Role:** Secondary CTA

Outlined pill: background #ffffff, 1px border #2c2d30 or #afafaf at 5% opacity, text #2c2d30, 50px border-radius, 16px × 24px padding, Saans 16px weight 500. Used for 'Developer Docs' and other secondary actions.

### Top Nav Bar
**Role:** Global navigation

White background, 64–72px height, 8px radius on hover states. Left: cloud logo + 'Lens' wordmark in Graphite. Center-left: 'News', 'FAQs', 'Developers' (with dropdown chevron) in Inter 16px weight 500. Right: 'Bridge' (icon + label) then the Pill Primary Button. All separators invisible, balanced on whitespace.

### Hero Section
**Role:** Above-the-fold introduction

Full-width white canvas, centered stack. Cloud logo (Graphite, ~80px). Display headline Saans 46px weight 400 Graphite, letter-spacing +0.015em, lineHeight 1.20. Subheadline Inter 21px weight 400 in Slate Mid. Two-button row: Pill Ghost ('Developer Docs') + Pill Primary ('Start Building'). Optional faint radial gradient or contour lines in the background — near-imperceptible.

### Feature Card — Pastel
**Role:** Capability highlight tile

Three-column grid card, 16px border-radius, 24px–32px padding. Background is one of the four pastel washes (Peach, Mint, Lavender, Periwinkle). Small monochrome Graphite icon (~32px) centered in a white circular badge. Heading Saans 21px weight 500, body Inter 15px in Slate Mid. Card has no border — the pastel fill is the surface.

### Integration Feature Card
**Role:** Two-column capability card

2×2 grid in a 2-column layout. White card with 1px #afafaf border at 5% opacity, 16px radius, 32px padding. Left column: circular badge with Graphite icon on a faint pastel wash. Right column: heading Saans 21px weight 500 Graphite, body Inter 16px weight 400 Slate Mid. Used for the 'Integrate Lens' section.

### Node Diagram Card
**Role:** Process flow visualization

White card with dashed border (1px dashed #afafaf). Contains 4 circular node badges connected by faint lines, each with a Graphite icon and label below in Inter 14px. The four nodes (Explore, Earn, Social, Transact, Publish) form a cross/plus pattern.

### Icon-Lead List Item
**Role:** Feature explanation row

Horizontal row: small Graphite icon (24px) + heading Saans 16px weight 500 Graphite + descriptive body Inter 15px weight 400 Slate Mid. No card chrome — sits directly on white. Used in 'Your users will love it' section.

### Dashed Section Divider
**Role:** Visual section separator

Full-width 1px dashed line in #afafaf at low opacity. Separates major content bands (e.g., hero → All-in-One, Integrate → node diagram). Creates a printed-blueprint rhythm.

### Nav Dropdown Trigger
**Role:** Expandable nav item

Inter 16px weight 500 Graphite label with trailing chevron (▾). Hover state shows a subtle background fill. The 'Developers' nav item uses this pattern.

## Do's and Don'ts

### Do
- Use #00caa0 only for the single primary action per view — never as a decorative accent, icon fill, or text color.
- Default every button to 50px border-radius and every card to 16px border-radius; the pill/square split is the system's strongest visual signal.
- Pair Saans (display) with Inter (body) — never use Inter for headings above 20px or Saans for body copy below 18px.
- Reserve the four pastel washes for feature card backgrounds only; never apply them to buttons, text, or page backgrounds.
- Use 1px dashed #afafaf dividers to separate content bands — not solid lines, not extra whitespace alone.
- Keep page background pure #ffffff and let Graphite (#2c2d30) carry all text weight; do not introduce new dark surfaces.
- Apply Saans ss01 and Inter cv11 font features globally; both faces are tuned for these alternates and look generic without them.

### Don't
- Do not use the teal #00caa0 for borders, icons, or hover states — its only job is filled-button background.
- Do not add box-shadow beyond the 1px border-shadow (`rgba(0,0,0,0.05) 0 0 0 1px`); the system has no elevation, only hairline separation.
- Do not use square buttons or sharp-edged cards — the pill language is signature and any radius under 16px reads as a system break.
- Do not introduce additional accent hues (purple, orange, etc.) outside the four pastel washes; the system is 99% achromatic.
- Do not center-align long-form body copy; the system uses left-aligned stacked text for everything below hero headlines.
- Do not use positive letter-spacing on Inter; negative tracking is part of its identity, and loosening it flattens the type.
- Do not place cards directly on a colored section background without a white surface layer — pastels are card-only, never page-level.

## Elevation

- **Buttons, nav items, interactive surfaces:** `rgba(0, 0, 0, 0.05) 0px 0px 0px 1px`

## Surfaces

- **Paper Canvas** (`#ffffff`) — Global page background — the only base surface, used at all times
- **Card Surface** (`#ffffff`) — Feature and integration cards sit on the same white as the canvas, differentiated by 1px border or pastel backdrop
- **Pastel Tile** (`#ffe4d6 / #d4f5e8 / #e8e0ff / #dde7f7`) — Soft color tiles that float inside cards as icon containers or feature backdrops

## Imagery

The site avoids photography entirely. The only visual elements are: (1) a single cloud-shape brand mark used at hero scale, (2) small monochrome Graphite icons inside white circular badges or pastel wash containers, and (3) a faint contour-line background pattern behind the hero that resembles a topographic map. All capability illustrations are abstract diagrams (node-and-connector flows) rather than product screenshots. The visual density is very low — imagery occupies under 10% of the page area; type and whitespace carry the design.

## Layout

Max-width 1200px centered container. The hero is a centered single-column stack (logo → headline → sub → two buttons). Below the fold, content alternates between 3-column pastel card grids and 2-column white integration cards. Section separators are dashed hairlines, not background color changes — the entire page is white with periodic pastel insets. Navigation is a thin top bar (no sticky behavior visible). Vertical rhythm is generous: ~80px between major bands, ~48px between sub-sections, 16px between elements within a section.

## Similar Brands

- **Optimism** — Same white-canvas + single accent color + pill CTA approach, though Optimism uses red where Lens uses mint
- **Aave** — Developer-protocol aesthetic with achromatic body and one chromatic action color, pill-shaped buttons, generous whitespace
- **Mirror.xyz** — Minimal Web3 publishing platform with white background, centered hero, and pastel-tinted feature cards
- **Uniswap** — Same restraint: near-monochrome UI with a single brand-pink accent and pill navigation controls
