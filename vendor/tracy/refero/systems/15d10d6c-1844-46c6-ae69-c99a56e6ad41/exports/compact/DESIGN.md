# Swap — Style Reference
> Mint editorial greenhouse — pale sage rooms with vivid lime accents and whisper-weight serif type.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Swap's design is a pale-mint editorial canvas anchored by a high-fashion display serif and pill-shaped vivid green CTAs. The brand reads like a luxury fashion magazine spread digitized — generous whitespace, a barely-there sage wash, and lime-green accents that feel like fresh foliage against a near-white backdrop. Everything sits lightly: thin charcoal-black borders, soft 28px blur shadows, 24px card radii, and a custom display serif that shifts between ultra-thin (100) and light (300) to whisper rather than shout. The green-to-yellow gradient display text is the only moment of visual spectacle — the rest of the system stays restrained, monochrome, and editorial, with color appearing as small functional punctuation for primary actions, tags, and active states.

## Colors

| Name | Value | Role |
|------|-------|------|
| Mint Wash | `#f2ffe3` | Page canvas, section backgrounds, hero wash — the dominant surface tone |
| Vivid Lime | `linear-gradient(90deg, rgb(130, 255, 135), rgb(163, 253, 167) 50%, rgb(222, 255, 130))` | Primary action button fill, accent highlights, gradient mid-stop, active tag backgrounds; Display text treatment — vivid lime-to-citrus gradient on hero headlines |
| Forest Depth | `#0d5b3b` | Deep green card backgrounds, contrast surfaces, gradient anchor |
| Pine Shadow | `#083a26` | Darkest green for emphasis cards, gradient endpoints, high-contrast text on light surfaces |
| Spring Gradient Start | `#82ff87` | Gradient anchor for display type and decorative washes |
| Citrus Gradient End | `#deff82` | Gradient endpoint for display type — yellow-green warmth in hero text |
| Charcoal Ink | `#000000` | Primary text, hairline borders, dark action buttons, icon strokes |
| Cream Paper | `#ffffff` | Card surfaces, button text on dark fills, input backgrounds, elevated overlays |
| Stone Charcoal | `#2d3637` | Secondary dark surface, icon fills, dark borders, muted dark mode text |
| Warm Mist | `#e9e7e2` | Alternate section backgrounds, disabled states, cream-toned surfaces |
| Silver Border | `#cccccc` | Light dividers, inactive borders, subtle separators |
| Sage Gray | `#838676` | Muted accent card backgrounds, secondary decorative surfaces |
| Eucalyptus | `#9cb0a8` | Muted sage for outlined secondary action borders, subtle green-tinted UI |

## Typography

### mainFont — mainFont — detected in extracted data but not described by AI
- **Weights:** 400, 500, 700
- **Sizes:** 9px, 12px, 15px, 16px, 18px, 24px, 30px
- **Line height:** 1, 1.2, 1.4, 1.5
- **Letter spacing:** -0.01

### Custom Editorial Serif (swap-serif) — Display and headline serif — used exclusively for hero/headline contexts at 72–120px. Weight 100 for maximum impact headlines, weight 300 for sub-headlines. Negative letter-spacing (-0.017em) tightens the high-contrast strokes for fashion-editorial density. This ultra-thin serif against pale mint is the signature combination — it borrows from luxury print typography (Bodoni/Didone lineage) to make a commerce platform feel like a magazine spread.
- **Substitute:** Playfair Display, Cormorant Garamond, or Libre Caslon Display
- **Weights:** 100, 300
- **Sizes:** 
- **Line height:** 0.95, 1.00

### Custom UI Sans (swap-sans) — Primary interface and body typeface — 16px for body, 15px for compact UI, 18px for lead paragraphs, 24px and 30px for section sub-headings. Weight 400 is default, 500 for emphasis, 700 for labels and small caps eyebrow text. Slight negative tracking (-0.01em) tightens the geometric forms for a precise, modern feel. The sans is functional and quiet — it never competes with the display serif.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 500, 700
- **Sizes:** 
- **Line height:** 1.00, 1.20, 1.40, 1.50
- **Letter spacing:** -0.16px at 16px, -0.24px at 24px
- **OpenType features:** `"ss01" on`

### secondaryFont — secondaryFont — detected in extracted data but not described by AI
- **Weights:** 100, 300
- **Sizes:** 72px, 80px, 120px
- **Line height:** 0.95, 1
- **Letter spacing:** -0.017, -0.01

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.12px |
| body-sm | — | — | 15px | 1.4 | -0.15px |
| subheading | — | — | 18px | 1.4 | -0.18px |
| heading-sm | — | — | 24px | 1.2 | -0.24px |
| heading | — | — | 30px | 1.2 | -0.3px |
| display | — | — | 72px | 0.95 | -1.22px |
| display-lg | — | — | 120px | 0.95 | -2.04px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 30px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 200px
- **cards:** 24px
- **badges:** 10px
- **inputs:** 100px
- **buttons:** 200px

## Components

### Primary Lime Pill Button
**Role:** Main call-to-action across hero and section CTAs

Filled vivid lime (#a3fda7) with black text. Border-radius 200px (full pill). Padding 12px 24px. Body text at 16px weight 500, -0.01em tracking. No shadow. The lime-on-mint combination creates a fresh, botanical accent against the pale canvas.

### Secondary Black Pill Button
**Role:** Secondary action alongside primary CTAs (e.g. "Book a Demo")

Solid black (#000000) fill with white (#ffffff) text. Border-radius 200px. Padding 12px 24px. 16px weight 500. Hairline-thin or borderless. Pairs with the lime primary as a high-contrast anchor.

### Outlined Ghost Button
**Role:** Tertiary or alternative actions

Transparent fill with 1px black or sage (#9cb0a8) border. Border-radius 200px. 16px weight 500, black or dark charcoal text. Used for less prominent navigation or section links.

### Hero Gradient Display Block
**Role:** Oversized brand statement in hero and feature sections

Full-bleed text block with the green-to-citrus linear gradient (#82ff87 → #a3fda7 → #deff82) applied as background-clip text. Custom serif at 80–120px weight 100, line-height 0.95, tracking -0.017em. Creates a botanical, fresh visual punctuation — the only place where color is allowed to be loud.

### Soft Card
**Role:** Content cards, feature blocks, brand story panels

White (#ffffff) surface on the mint canvas. Border-radius 24px. Padding 30px. No border. Soft shadow rgba(0,0,0,0.09) 0px 0px 28px 0px for a gentle, diffused lift. The generous radius + soft shadow creates a pillow-like, premium feel.

### Brand Logo Grid Card
**Role:** Customer/partner logo showcase section

Grid of 5 columns × 3 rows of brand wordmarks on white or mint background. Logos are rendered in muted gray or original brand color, evenly spaced with 30–40px gaps. No card containers — logos float on the canvas to keep the editorial feel.

### Section Header with Eyebrow
**Role:** Section introduction with small caps label and serif headline

Small uppercase eyebrow text in sans weight 700 at 12px, letter-spacing slightly increased, black. Main headline in serif weight 300 at 48–72px, black, tracking -0.017em. Centered or left-aligned with generous top spacing (60–80px above).

### Pill Input Field
**Role:** Email capture, form fields, search

White fill with thin (#cccccc or #000000) 1px border. Border-radius 100px (full pill). Padding 14px 24px. 16px sans weight 400. Placeholder in #999999. Focus state shifts border to vivid lime (#a3fda7).

### Eyebrow Label
**Role:** Small all-caps section identifier above headlines

Uppercase sans weight 700 at 9–12px, black, slightly increased letter-spacing. Sits 20–30px above its associated headline. Used to introduce content sections with editorial precision.

### Top Navigation Bar
**Role:** Primary site navigation

White or transparent background over mint canvas. 64–72px tall. Logo left (serif "Swap" wordmark in black). Nav links in sans 15px weight 400, black. Sign in link and lime pill CTA pinned right. No shadow or hairline bottom border.

### Full-Bleed Hero Section
**Role:** Opening brand statement

Pale mint (#f2ffe3) background filling the viewport. Centered or left-aligned serif headline at 72–120px weight 100. Subtext at 18px weight 400 in charcoal (#2d3637). Two CTAs side by side: lime primary + black secondary. Generous vertical padding (120–160px top/bottom).

### Logo Strip Section
**Role:** Social proof via partner/customer logos

White or mint background. Serif heading at 30–48px weight 300 centered. Optional lime pill CTA below. Logo grid beneath with 5 columns, even spacing, logos in grayscale or muted tone. No card containers.

### Statement Section Divider
**Role:** Full-width editorial section break with large display text

Mint background with oversized serif headline at 72–120px weight 100, applied with the green-to-citrus gradient as text fill. Acts as a visual pause and brand moment between content sections.

## Do's and Don'ts

### Do
- Use the custom display serif at weight 100 for all hero/feature headlines — this whisper-thin weight is the signature; never substitute with bold sans headlines
- Use 200px border-radius for all buttons and tags to maintain the pill-shaped language
- Pair the vivid lime (#a3fda7) fill with pure black (#000000) text on all primary CTAs for 17:1 contrast
- Apply the 90deg green-to-citrus gradient as background-clip text only on display-sized serif headlines (72px+)
- Set section gaps to 80–120px to preserve the editorial breathing room between content blocks
- Use the pale mint (#f2ffe3) as the primary canvas and reserve white (#ffffff) for card surfaces and inputs — never invert this hierarchy
- Set the display serif to line-height 0.95 and letter-spacing -0.017em to maintain the tight, fashion-editorial density

### Don't
- Never use bold or semibold weights for display headlines — the ultra-thin serif is the brand signature
- Never use sharp or small border-radii on buttons — anything below 100px breaks the pill language
- Never apply the green-to-citrus gradient to body text, UI labels, or anything below 48px
- Never use a dark or charcoal page background — the entire system is built on pale mint and white
- Never use colored body text — all paragraph and UI copy stays in black (#000000) or charcoal (#2d3637)
- Never add heavy drop shadows — the only shadow allowed is the 28px soft black-9% blur on cards
- Never use multiple chromatic accent colors simultaneously — lime is the sole accent; sage gray and forest green appear only in gradients or specific card contexts

## Elevation

- **Soft Card:** `0px 0px 28px 0px rgba(0, 0, 0, 0.09)`

## Surfaces

- **Mint Canvas** (`#f2ffe3`) — Primary page background and hero wash
- **White Card** (`#ffffff`) — Card surfaces, input fields, elevated content blocks
- **Warm Mist** (`#e9e7e2`) — Alternate section background, disabled state fill
- **Vivid Lime Surface** (`#a3fda7`) — Active tag, highlight wash, primary CTA fill
- **Forest Surface** (`#0d5b3b`) — Dark contrast card, emphasis surface for inverted content

## Imagery

The site is overwhelmingly text-driven and editorial — no photography, no product imagery, no lifestyle shots. The only visual elements are: (1) oversized gradient-clipped display type that acts as the hero visual, (2) a grid of partner/customer logo wordmarks in muted grayscale serving as social proof, and (3) minimal line-style icons. The mint background, gradient display text, and logo wordmarks together form the entire visual language. When illustration appears, it is likely abstract botanical or geometric in lime and green tones.

## Layout

Max-width 1200px centered container with full-bleed mint sections. Hero is a centered stack: large serif headline, short subtext paragraph, two pill CTAs (lime + black) side by side, then an oversized gradient display block below as visual punctuation. Sections alternate between mint canvas and white card surfaces, separated by 80–120px gaps. Logo showcase is a 5-column grid centered with a serif heading and optional CTA. Content sections use left-aligned serif headlines with left-aligned body text below. Navigation is a single white/transparent top bar — no sticky behavior, no sidebar, no mega-menu. The overall rhythm is vertical and editorial, like scrolling through a fashion magazine spread.

## Similar Brands

- **The Yes (Boston-based fashion commerce)** — Same pale pastel canvas with a single vivid accent color, pill-shaped CTAs, and editorial serif display type for a fashion-luxury feel
- **Shopify (premium brand pages)** — Same generous whitespace, 24px card radii, and restrained single-accent color approach for commerce content marketing
- **Glossier brand site** — Same pale-toned canvas with botanical green accents, pill buttons, and editorial large-type hero treatment
- **Bambuser** — Same fashion-commerce editorial aesthetic with oversized gradient display type as the hero visual moment
- **Aritzia brand pages** — Same whisper-thin display serif headlines, near-white canvas, and pill-shaped dark secondary CTAs pairing with a vivid accent
