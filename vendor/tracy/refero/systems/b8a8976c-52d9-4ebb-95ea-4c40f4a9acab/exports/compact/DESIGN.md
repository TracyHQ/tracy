# Superwhisper — Style Reference
> aurora dissolving over midnight glass

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Superwhisper is a cinematic dark-mode product that earns its name through a hero aurora — a vertical gradient that bleeds from near-black through deep navy and violet into a dusty lavender-pink horizon, with only a shadowed silhouette of lips and a laptop edge to ground the abstraction. The whole page sits on a near-black canvas (#000000) with the hero card floating as a single rounded surface (24px radius), and every other surface is either a charcoal step up or a translucent black overlay. Inter is the only voice; display sizes use aggressive negative tracking (-3.4px at 60px) so large headlines feel compressed and confident rather than airy. Color is rationed: one electric blue (#0088ff) does the work of a traditional accent for icons, links, and small functional highlights, while white — not a chromatic color — is the primary action fill. The system is intentionally restrained, atmospheric, and product-focused, with most screens staying near-monochrome and letting the gradient hero do the emotional work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Signal | `#0088ff` | Brand accent — icons, link text, small functional highlights, inline code accents |
| Lavender Mist | `#b855e7` | Brand signature — terminal color of the hero aurora gradient, decorative washes |
| Sky Wash | `#60a5fa` | Accent — subdued link blue for secondary text-level links |
| Ember | `#e6714f` | Accent — warm decorative token used sparingly in illustration/code contexts |
| Amber Glow | `#ffb764` | Accent — warm decorative token, secondary highlight |
| Sunburst | `#ffdd00` | Accent — high-energy punctuation for icons and inline emphasis |
| Forest Pulse | `#16c253` | Green supporting accent for decorative details and low-frequency emphasis |
| Vivid Mint | `#27c93f` | Accent — saturated green for badges and inline highlights |
| Pink Static | `#dd55e7` | Accent — chromatic pink for decorative highlights and illustration |
| Midnight | `#000000` | Page canvas, deepest gradient stop, true black borders |
| Obsidian | `#0f0f10` | Primary card surface — the floating canvas around the hero card |
| Charcoal | `#1c1d1f` | Elevated surface — input fields, nested cards, nav pill background |
| Graphite | `#333333` | Mid-dark surface — button rest states, shadow base color |
| Slate | `#595959` | Mid neutral — secondary borders, disabled controls |
| Fog | `#70757c` | Muted body text, secondary metadata |
| Ash | `#888b91` | Tertiary text, button labels on dark surfaces |
| Silver | `#999999` | Muted helper text, icon strokes at rest |
| Mist | `#b8babf` | Subtle text on tinted surfaces |
| Pearl | `#cccccc` | Secondary text, high-contrast metadata on dark |
| Bone | `#e5e7eb` | Hairline borders, dividers — the most-used neutral in the system |
| White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Deep Navy | `#001b33` | Dark blue-tinted surface for feature cards and section backgrounds |
| Midnight Indigo | `#030719` | Blue-black card surface — second surface level above the canvas |
| Aurora Black→Lavender | `linear-gradient(#000000 0.85%, #112d72 33.4%, #4b52aa 49.68%, #a887dc 70.84%, #e6c4e7 95.8%, #fcdbef 107.19%)` | Signature hero gradient: black 0.85% → deep blue → violet → lavender → dusty pink — the single defining atmosphere of the brand |
| Signal Blue | `linear-gradient(#0fb7fa, #0072fb)` | Secondary gradient pair for call-out strips and inline emphasis bars |
| Aurora Wash | `linear-gradient(90deg, rgba(25,153,232,0.15) 2.75%, rgba(164,91,242,0.15) 99.26%)` | Subtle blue-to-violet wash used for low-opacity decorative bands |

## Typography

### Inter — Primary typeface for everything — display headlines, body, UI labels, nav. Weight 500–600 at 48–60px with aggressive negative tracking (-0.057em) gives the signature compressed, confident display feel. Body stays at 400/500 around 14–16px with light tracking. No chromatic CTA color — buttons rely on weight contrast alone.
- **Substitute:** system-ui, -apple-system, Segoe UI, Roboto
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 8px, 9px, 10px, 11px, 12px, 13px, 14px, 15px, 16px, 18px, 20px, 24px, 30px, 31px, 48px, 60px
- **Line height:** 1.00–1.78
- **Letter spacing:** -3.42px at 60px → -2.4px at 48px → -1.2px at 30px → -0.6px at 24px → -0.16px at 16px → 0.14px at 12px
- **OpenType features:** `"ss01" on, "cv11" on`

### ui-monospace — Inline code, keyboard shortcuts (⌘⏎), and micro-typography moments. Treated as a whisper — always at 11px, always quiet next to Inter.
- **Substitute:** SF Mono, Menlo, Consolas, monospace
- **Weights:** 300, 400
- **Sizes:** 11px
- **Line height:** 1.00–1.50

### -apple-system — System font fallback reserved for very small UI labels and icons on Apple-only surfaces
- **Substitute:** system-ui
- **Weights:** 500
- **Sizes:** 9px, 10px
- **Line height:** 1.60–1.78

### Flow Circular — Custom brand typeface used in tightly limited contexts — a single monoline geometric that warms up the otherwise Inter-only system
- **Substitute:** Inter Tight
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.43–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 1.6 | 0.25px |
| caption | — | — | 12px | 1.56 | 0.3px |
| body-sm | — | — | 14px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | -0.16px |
| body-lg | — | — | 18px | 1.5 | -0.18px |
| subheading | — | — | 24px | 1.25 | -0.6px |
| heading | — | — | 30px | 1.2 | -1.2px |
| heading-lg | — | — | 48px | 1.07 | -2.4px |
| display | — | — | 60px | 1.06 | -3.42px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 24px
- **icons:** 9px
- **inputs:** 9px
- **buttons:** 9px
- **nav-pill:** 9999px
- **inner-pill:** 9999px
- **small-card:** 12px

## Components

### Aurora Hero Card
**Role:** Full-bleed hero surface carrying the brand atmosphere

Rounded container at 24px radius, fills the hero with the signature black→navy→violet→lavender→pink linear gradient. Sits on a #000000 page canvas. No shadow — the gradient is the elevation. Internal padding ~48-64px vertical, content centered. Text on top is white Inter at 48-60px, weight 500-600, with -3.4px tracking. A subtle inset 1-2px white-alpha border may define edges.

### White Filled Button (Download Mac)
**Role:** Primary action — download CTA

White (#ffffff) fill, #000000 text, Inter 14-15px medium, 9px radius, padding 10px 16px. Apple platform glyph prefix in matching black. No shadow. This is the action color: white against near-black creates maximum contrast without introducing a chromatic brand color.

### Dark Outlined Button (Download Windows)
**Role:** Secondary platform download CTA

#1c1d1f fill with subtle hairline border, white text, Inter 14-15px medium, 9px radius, padding 10px 16px. Windows glyph prefix. Sits beside the white button as a visually quieter peer — same shape, inverted fill.

### Navigation Pill Container
**Role:** Top-of-page floating nav

Dark pill (~9999px radius) containing Home, Docs, Pricing links plus a white Download action. Background #1c1d1f or #0f0f10 with a 1px hairline white-alpha border. Centered horizontally, ~8-12px vertical padding. Nav links use Inter 13-14px regular, muted (#888b91) at rest, white on hover.

### White Nav Download Pill
**Role:** Primary action inside the nav

9999px radius pill, white fill, black text, Inter 13px medium. Smaller than the hero CTAs (padding ~6px 14px). The only saturated-light surface on the page, which is why it reads as action.

### Inline Platform Link (iPhone)
**Role:** Tertiary download path

No button chrome — just Inter 12-13px in #b8babf with a › chevron. Sits below the primary CTAs as a quiet, text-level alternative. Hover state lifts to white.

### Feature Card (Dark Tinted)
**Role:** Content card on a dark page

Rounded 18-24px radius, fill is one of the tinted darks (#001b33, #031310, #1c031f, #200401, #030719, #191303, #0f0f10). Padding 24px. Optional subtle 1px white-alpha inset border for definition. The full chromatic dark-tint palette is available — these tints are the system's way of adding hue without adding saturation.

### Audio Waveform Visual
**Role:** On-brand decorative element reinforcing the voice-to-text product

Uses #0088ff as the active waveform color on #001b33 or #030719 card backgrounds. Thin strokes (1-2px), no fill, rounded line caps. Often paired with #16c253 or #27c93f for secondary tracks.

### Inline Code Chip
**Role:** Micro component for keyboard shortcuts and code references

ui-monospace 11px, #b8babf text on #1c1d1f fill, 4px radius, 4px 6px padding. Characters like ⌘⏎ render in white for emphasis on the monospace string.

### Quiet Text Link
**Role:** Body-level links

Inter 14-16px, #60a5fa underline or #0088ff, no underline. Hover lifts to white. Inherits body line-height.

### Pill Nav Link (Home / Docs / Pricing)
**Role:** Navigation item at rest

No background. Inter 13-14px regular in #888b91. Active state: #ffffff. The active marker is color alone — no underline, no pill, no dot.

## Do's and Don'ts

### Do
- Use the aurora gradient (#000000 → #112d72 → #4b52aa → #a887dc → #e6c4e7 → #fcdbef) as the signature hero atmosphere — never replace it with a flat dark or a solid color.
- Use white (#ffffff) as the primary action fill on the dark canvas; do not introduce a chromatic CTA color.
- Use Inter at 60px / 48px with letter-spacing -3.42px / -2.4px respectively for all display headlines — the negative tracking is the signature.
- Use 24px radius for the hero card and large feature cards; use 9px for inline buttons and inputs; use 9999px (pill) for nav and small action chips.
- Pair #0088ff icons with #001b33 or #030719 card surfaces so the blue reads as signal, not decoration.
- Place dark-tinted cards (#001b33, #031310, #030719) at high contrast against the #000000 page so the tint is felt as hue, not as noise.
- Use 16px element gap and 24px card padding as the floor; allow section gaps to expand to 64px between major bands.

### Don't
- Don't add a saturated colored CTA button — white-on-dark is the action vocabulary.
- Don't use a flat dark background for the hero; the gradient is the brand.
- Don't soften display tracking below -3px at 60px — the compressed look is what makes Inter feel like a logo.
- Don't put shadows on the hero card; the gradient carries elevation.
- Don't use more than one chromatic accent color (#0088ff) in a single component — chromatic colors in this system are rationed.
- Don't center body copy in narrow columns; the hero centers but content sections should left-align at 600-800px measure.
- Don't use positive letter-spacing above 0.025em for body or display text.
- Don't round inline buttons to pill (9999px) — that radius is reserved for nav and small chips; use 9px instead.
- Don't use Flow Circular outside of its specific reserved contexts — Inter is the system voice.

## Elevation

- **Aurora Hero Card:** `none (the gradient itself provides elevation)`
- **Dark Feature Card:** `rgba(0, 0, 0, 0.25) 0px 1px 4px 0px, rgba(0, 0, 0, 0.1) 0px 4px 59px 0px`
- **Icon Container (inset ring):** `rgba(255, 255, 255, 0.2) 0px 0px 0px 2px inset`
- **Image Caption / Detail:** `rgba(0, 0, 0, 0.3) 0px 0px 10px 0px`

## Surfaces

- **Page Canvas** (`#000000`) — Deepest background, surrounds all cards
- **Obsidian** (`#0f0f10`) — Primary card surface, floating panels
- **Midnight Indigo** (`#030719`) — Tinted dark card — adds cool hue without saturation
- **Deep Navy** (`#001b33`) — Strongly blue-tinted card for feature blocks and waveform containers
- **Charcoal** (`#1c1d1f`) — Elevated inputs, nav pill, dark button rest
- **White** (`#ffffff`) — Maximum contrast surface — primary action fill and text

## Imagery

Atmospheric and sparse. The hero relies on a single dramatic vertical gradient (black → deep blue → violet → lavender → dusty pink) framed by a shadowed silhouette of lips on the left edge and a sliver of a laptop screen on the right — both bleeding off the canvas, never contained in boxes. No product screenshots, no lifestyle photography, no illustration mascots. The visual language is cinematic and abstract: the page sells mood before it sells features. Secondary screens may use small product-crop images inside the dark-tinted cards, with 24px rounded corners and a 1px white-alpha inset ring for definition. Icons are thin (1-2px stroke), monoline, and tinted with the brand blue #0088ff against dark surfaces. Density is image-light: the gradient and typography do 80% of the visual work.

## Layout

Single full-bleed hero card centered on a #000000 page canvas, max content width ~1200px. The hero is a vertically tall rounded surface (24px radius) with the aurora gradient as the background and all content centered — single-column stack: headline, sub-headline, button row, fine print, and a final helper line. Navigation is a floating pill at the top, horizontally centered, with no sticky behavior visible. The hero card has generous internal vertical padding (likely 96-128px) and a small horizontal padding (32-48px), so content lives in a centered column ~600-700px wide. Below the hero, the page is expected to use a single-column or 2-column rhythm of dark-tinted feature cards on the #000000 canvas, with 64px section gaps. There is no sidebar, no mega-menu, and no dense grid — the system is a series of full-bleed horizontal bands, each one a quiet step in the story.

## Similar Brands

- **Wispr Flow** — Same voice-to-text product category and dark cinematic hero with a single gradient atmosphere; both lean on compressed Inter display type.
- **Linear** — Dark-mode-only interface with a single chromatic accent (#0088ff here, #5e6ad2 there) and tight Inter typography with aggressive negative tracking.
- **Arc Browser** — Same restrained dark canvas, gradient-forward hero, and white-filled primary action — the 'gradient does the elevation' philosophy is shared.
- **Raycast** — Productivity tool with a near-monochrome dark UI, one electric accent color, and pill-shaped controls on a black canvas.
- **ElevenLabs** — Voice AI brand that also uses an aurora-like gradient hero against a black canvas to signal 'AI/atmosphere' without resorting to literal imagery.
