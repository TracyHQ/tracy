# Phantom — Style Reference
> lavender candy shop at dusk. A monochromatic violet world where everything is a soft pill on a near-white plane, interrupted by a mischievous ghost and pastel highlights.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Phantom is a soft, monochromatic crypto-wallet world bathed in aubergine and lavender. The interface lives in a near-white canvas but bleeds into deep violet sections, creating a mood that oscillates between airy and intimate. Typography is whisper-weight (350) with aggressive negative tracking, letting massive 80-96px hero lines float with grace. The defining signature is generous pill-shaped geometry — navigation, buttons, and cards all dissolve into capsule forms with 24-100px radii. A single ghost mascot replaces vowels in headlines, breaking the grid with playful subversion. The palette is deliberately narrow: one primary violet does all the structural work, while pastel button tints (lavender, butter, blush) create a candy-store rhythm against the restrained backdrop.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aubergine | `#3c315b` | Primary brand — navigation borders, nav text, heading text, card surfaces in dark sections, icon strokes. The structural spine of the entire system |
| Ghost Lavender | `#e2dffe` | Primary action — filled CTA button background, violet glow shadow on buttons. The light-on-light button that only reveals its presence through a soft 4px halo |
| Periwinkle | `#ab9ff2` | Secondary action — brighter lavender for secondary CTAs, decorative fills, icon accents. Adds saturation to the pale-violet world |
| Cornflower Pop | `#4a87f2` | Accent button — occasional vivid blue button for emphasis or differentiation. Use sparingly as a high-energy interruption |
| Buttercream | `#ffffc4` | Accent button — pale yellow button fill for variety in multi-action contexts. Pastel punctuation in the candy palette |
| Blush Mist | `#ffdadc` | Accent button — near-gray pink button for warmth and tonal range. The softest of the pastel set |
| Mint Signal | `#2ec08b` | Success badge — vivid green for status indicators, positive confirmations, live signals |
| Paper White | `#fdfcfe` | Canvas — page background, card surfaces, button borders, text on dark backgrounds. Near-white with the faintest cool tint |
| Obsidian | `#1c1c1c` | Body text, heading text on light backgrounds, button borders, card borders. The near-black ink for all foreground content |
| Fog | `#86848d` | Muted text, icon strokes, secondary nav borders. The quiet gray for non-emphasized elements |
| Ash | `#e9e8ea` | Button background, subtle surface fill. The neutral pale surface beneath lavender hero panels |
| Bone | `#f4f2f4` | Surface background — light section panels, button fills. The warmest of the near-white neutrals |

## Typography

### Phantom — Custom typeface used for everything. Weight 350 is the default body and display weight — unconventional lightness creates an airy, anti-bold personality. Weight 400 reserved for body copy that needs slightly more presence. Sizes scale dramatically from 13px caption to 96px display. Tight -0.025em letter-spacing at all sizes creates compressed, high-density headlines. Line-height collapses to 1.0-1.1 at display sizes for sculptural headline forms.
- **Substitute:** Inter, Söhne, or DM Sans at matching weight 300/400 with -0.025em tracking
- **Weights:** 350, 400
- **Sizes:** 13, 15, 16, 20, 24, 30, 64, 80, 96
- **Line height:** 1.00, 1.10, 1.20, 1.21, 1.25, 1.35, 1.40
- **Letter spacing:** -0.025em at all sizes (converts to -2.4px at 96px, -1.6px at 64px, -0.4px at 16px, -0.325px at 13px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.35 | — |
| body-sm | — | — | 15px | 1.4 | -0.375px |
| subheading | — | — | 20px | 1.35 | -0.5px |
| heading-sm | — | — | 24px | 1.25 | -0.6px |
| heading | — | — | 30px | 1.21 | -0.75px |
| heading-lg | — | — | 64px | 1.1 | -1.6px |
| display | — | — | 96px | 1 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 48px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 100px
- **tags:** 100px
- **cards:** 24px
- **links:** 32px
- **buttons:** 100px

## Components

### Pill Navigation Bar
**Role:** Primary site navigation

White pill container (#fdfcfe) with full 100px border-radius, containing nav links (Features, Learn, Explore, Company, Developers, Support) at 15px weight 350 in #3c315b. Each link has a 4px chevron indicator. Separated from the logo and Download CTA by 24-48px gap. The pill geometry is signature-defining — no flat nav bars allowed.

### Download Button (Header)
**Role:** Primary CTA in navigation

Ghost Lavender (#e2dffe) fill with #3c315b text, 100px border-radius, 16px 32px padding, 16px font size weight 350. Gains a subtle rgb(226,223,254) 0px 0px 4px 0px glow. Sits at the far right of the header.

### Hero Section (Dark)
**Role:** Full-bleed hero with inverted color treatment

Aubergine (#3c315b) background, white (#fdfcfe) text at 64-80px weight 350 with -1.6px letter-spacing. Centered headline stacked on 2-3 lines. A pill-shaped CTA sits centered below. This is the dramatic, intimate mode of the system.

### Hero Section (Light)
**Role:** Full-bleed hero on light background

Paper White or Bone (#f4f2f4) background, Aubergine (#3c315b) text at 64-80px weight 350. The ghost mascot character replaces a vowel in the headline as a brand signature. Ghost is rendered in Periwinkle (#ab9ff2).

### Muted Purple Hero Panel
**Role:** Intermediate hero — soft violet wash

Desaturated violet panel (appears as muted gray-violet) with white text and a centered Download CTA. Sits between the light and dark hero modes as a tonal bridge.

### See More Link Button
**Role:** Inline section navigation

Ghost Lavender (#e2dffe) fill, #3c315b text, 100px border-radius, 12px 24px padding, 15px weight 350. Includes a small diagonal arrow icon after the text. The secondary action pattern.

### Ghost Character Accent
**Role:** Decorative brand element within headlines

The Phantom ghost mascot rendered in Periwinkle (#ab9ff2), substituted inline for a vowel in display headlines. Creates a moment of play and brand recognition in otherwise austere typographic compositions.

### Pastel Accent Button Set
**Role:** Multi-variant action buttons for variety

Includes Buttercream (#ffffc4), Blush Mist (#ffdadc), and Cornflower Pop (#4a87f2) fills. Same 100px radius and padding as other buttons. Used in groups to create a candy-palette rhythm when multiple actions are needed.

### Logo Lockup
**Role:** Brand mark

The Phantom wordmark with ghost icon in Aubergine (#3c315b) on light backgrounds, Paper White (#fdfcfe) on dark backgrounds. 100px container radius around the icon. Sits at the far left of the header.

### Search Icon Button
**Role:** Header utility action

32px square button with a search/magnifying-glass icon stroke in Aubergine (#3c315b). No background, no border — pure icon. Sits between nav and Download CTA.

### Success Badge
**Role:** Status indicator

Mint Signal (#2ec08b) background, white text, 100px radius, 8px 16px padding, 13px weight 350. Used sparingly for live status, confirmations, or positive states.

### Card Surface
**Role:** Content container

Paper White (#fdfcfe) background, 24px border-radius, 48px padding, 1px border in #e9e8ea or #f4f2f4. No shadow — relies on border and generous padding for separation. Weight feels light, not chunky.

## Do's and Don'ts

### Do
- Use 100px border-radius for all navigation containers, buttons, and tags — the pill geometry is the system's defining silhouette
- Set all text at weight 350 by default; reserve weight 400 for body copy that needs extra legibility
- Apply -0.025em letter-spacing at every type size — the tight tracking is non-negotiable for brand fidelity
- Use Ghost Lavender (#e2dffe) as the primary CTA fill, paired with the rgb(226,223,254) 0px 0px 4px 0px glow shadow
- Alternate between light and Aubergine dark sections to create rhythm — both modes are equally native to the system
- Collapse line-height to 1.0-1.1 for display sizes 64px and above; let the massive type breathe vertically without gaps
- Replace a vowel in display headlines with the ghost mascot rendered in Periwinkle (#ab9ff2) for brand playfulness

### Don't
- Don't use drop shadows beyond the single 4px violet glow on primary CTAs — the system stays flat
- Don't set text at weight 600+ — the 350 whisper-weight is the brand's voice, not a choice for emphasis
- Don't use sharp corners under 16px — the world is pills and soft capsules
- Don't introduce saturated colors outside the pastel accent set (#4a87f2, #ffffc4, #ffdadc) — the palette is intentionally narrow
- Don't set body text larger than 16px weight 400 or use line-height above 1.4 — readability rules apply but stay restrained
- Don't use high-contrast decorative elements like gradients, patterns, or backgrounds images — surface is always flat color
- Don't add border-radius values below 24px on cards or 16px on smaller elements — every container should feel soft

## Elevation

- **Primary button (Ghost Lavender fill):** `rgb(226, 223, 254) 0px 0px 4px 0px`

## Surfaces

- **Paper White** (`#fdfcfe`) — Base canvas — the default page background, the lightest possible near-white
- **Bone** (`#f4f2f4`) — Light section panels — subtle warm shift for content blocks on white
- **Ash** (`#e9e8ea`) — Neutral button surface — used for secondary buttons and quiet containers
- **Ghost Lavender** (`#e2dffe`) — Primary CTA surface — lavender fill with violet halo for the system's main action
- **Aubergine** (`#3c315b`) — Dark section background — the deep-violet surface for inverted hero panels

## Imagery

No photography, no product screenshots, no abstract graphics. The visual language is pure typography and brand mascot (the ghost character). The ghost is the only recurring illustrated element, rendered flat in Periwinkle (#ab9ff2) and always inline within text. There is no image-heavy content — text dominates the visual hierarchy completely, with the ghost providing occasional personality interruptions.

## Similar Brands

- **Linear** — Same ultra-rounded pill navigation and monochromatic restraint; both use aggressive letter-spacing tightening and weight-light display type
- **Rainbow Wallet** — Same crypto-wallet audience with pastel button palettes and soft capsule geometry
- **Belka** — Same playful mascot-in-headline pattern and candy-pastel button set within a monochromatic framework
- **Stripe** — Same generous pill radii and minimal-elevation approach; both let typography and color do the heavy lifting
