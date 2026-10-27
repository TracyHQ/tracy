# Agence Foudre — Style Reference
> Magazine splash page in lipstick pink.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Agence Foudre uses a bold editorial-magazine language: warm cream canvas, oversized condensed display type in vivid magenta, and a surprising deep-forest green that reads as both body text and accent. The interface is deliberately sparse — most of the viewport is empty space, and content arrives in dense typographic punches rather than card grids or product visuals. Color is used as emotional punctuation: hot pink screams, faded pink whispers, deep green grounds, and warm off-white softens every surface. Components are minimal — circular pink buttons, pill-shaped badges, and big chunky type are the only chrome. This is a portfolio/expression site, not a product UI: the brand's personality IS the typography and color, everything else stays out of the way.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lipstick Magenta | `#db3c8a` | Display headlines, primary brand color, icon buttons, heading accents — vivid pink carries 100% of brand recognition |
| Forest Ink | `#00522d` | Body text, links, iconography, footer — deep saturated green against cream creates editorial gravitas no neutral could |
| Blush Cream | `#fce5df` | Soft surface tint, badge backgrounds, gentle wash blocks, hover states — warm off-pink that sits between page and accent |
| Warm Chalk | `#fff8f6` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Charcoal Black | `#000000` | High-contrast text, dark icons, line art, SVG fills — used sparingly for maximum punch |
| Lilac Mist | `#d1cfe4` | Decorative type tint, subtle dividers, soft outline strokes — cool gray-lilac for the quietest visual moments |
| Bubblegum | `#f29ebd` | Secondary accent, lighter pink washes, faded display type, ghost button borders — pink dialed back from brand magenta |
| Cotton Pink | `#e878b2` | Mid-tone pink surface for elevated cards, tonal accent between magenta and bubblegum |

## Typography

### Beni — Display headlines only — ultra-black weight with 0.70 line-height packs lines tightly, creating dense typographic blocks that dominate the viewport. Letter-spacing normal lets the heavy weight do the work; no tracking adjustment needed at this scale
- **Substitute:** Druk Wide Heavy, Tungsten Bold, Antonio Black
- **Weights:** 900
- **Sizes:** 46px, 80px, 94px, 130px, 230px
- **Line height:** 0.70

### Clash Grotesk — Body text, labels, navigation, buttons, badges, links, all UI chrome — geometric grotesk carries the functional load while Beni performs. Weights create clear hierarchy: 400 for body, 500 for emphasized, 700 for buttons and active states
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 400, 500, 700
- **Sizes:** 10px, 12px, 13px, 14px, 16px, 20px, 24px, 30px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 12 | — |
| label | — | — | 12px | 14 | — |
| caption | — | — | 14px | 17 | — |
| body-sm | — | — | 16px | 19 | — |
| body | — | — | 20px | 24 | — |
| subheading | — | — | 46px | 32 | — |
| heading-sm | — | — | 80px | 56 | — |
| heading | — | — | 94px | 66 | — |
| heading-lg | — | — | 130px | 91 | — |
| display | — | — | 230px | 161 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 120px
- **Card padding:** 30px
- **Element gap:** 15-20px

### Border Radius

- **tags:** 9999px
- **cards:** 20px
- **badges:** 10px
- **buttons:** 10px
- **elevated:** 25px
- **iconButtons:** 9999px

## Components

### Circular Menu Trigger
**Role:** Primary navigation launcher

50px diameter pink circle (#db3c8a), full radius. Contains a three-line hamburger glyph in dark or white. Fixed position top-left. No border, no shadow. The pink circle is the only UI element that breaks the cream canvas

### Circular Brand Mark
**Role:** Logo / brand icon button

50px diameter circle matching menu trigger. Contains the agency mark (lightning bolt variant). Fixed top-right. Same pink fill (#db3c8a), same weight as menu — visual symmetry establishes these as the only two interactive dots on screen

### Display Headline Block
**Role:** Hero typographic statement

Beni weight 900, sizes 94-230px, line-height 0.70. Color cycles between #db3c8a (full intensity), #f29ebd (mid pink), and #fce5df (faded wash) to create visual rhythm across sections. Left-aligned, bottom-anchored in viewport. No margins — the type itself is the layout

### Faded Echo Headline
**Role:** Repetition / counterpoint display type

Same Beni 900 treatment as main headline but in #fce5df or #f29ebd — appears as a ghost version of a statement the full-color version just made. Creates dialogue between sections. Same massive scale (80-130px)

### Section Label
**Role:** Micro-typography category tag

Clash Grotesk 400-500, 12-14px, uppercase or sentence case. Color: #00522d or faded #db3c8a. Positioned directly above the display headline it describes. Tight tracking, no decoration — just a whispered label

### Pill Badge / Tag
**Role:** Category or filter chip

Clash Grotesk 500, 12-14px, #00522d text on #fce5df background. Radius 9999px (fully rounded). Padding 7px 15px. No border. Appears sparingly to tag content without competing with display type

### Body Paragraph
**Role:** Readable editorial text

Clash Grotesk 400, 16-20px, line-height 1.20, color #00522d. Max width ~60ch. Generous vertical spacing (30-60px between blocks). The deep green on warm cream is the primary reading experience

### Text Link
**Role:** Inline navigational or editorial link

Clash Grotesk 500, inherits body size, color #00522d with possible #db3c8a accent. No underline by default; underline appears on hover in #db3c8a. Minimal, confident — the link should feel like a directional gesture, not a button

### Icon Button Ghost
**Role:** Minimal interaction surface

No background, no border. Icon only in #000000 or #00522d, 20-24px. Hover state: icon shifts to #db3c8a. Used for secondary actions where the pink circle buttons are too loud

## Do's and Don'ts

### Do
- Use Beni weight 900 with 0.70 line-height for all display type — the tight leading is what makes the headlines feel architectural, not just big
- Default to #fff8f6 as the canvas; let #fce5df appear only as a 5-10% accent surface, never as a full page background
- Pair #db3c8a (loud) with #fce5df (whisper) of the same hue to create dialogue between sections — full color makes a statement, faded color echoes it
- Use #00522d for all body text and links — the deep green is a signature choice that no neutral substitute can replicate
- Let whitespace do the structural work: 60-120px section gaps, and let individual display blocks own full viewport heights
- Set all interactive circles (menu, brand) to 50px diameter with full radius and #db3c8a fill — these are the only two dots on the page
- Cap body text width at 60ch regardless of viewport — readability over impact

### Don't
- Never use #000000 for body text — #00522d is the editorial voice; black is reserved for icons and graphic elements only
- Don't set Beni at body sizes (under 30px) — it was designed for display only; use Clash Grotesk for everything functional
- Avoid card-heavy layouts — this system breathes through type and space, not through information density
- Never apply #db3c8a to large body areas — pink is an exclamation, not a wallpaper
- Don't add shadows, gradients, or glass effects — the system is deliberately flat; depth comes from color contrast and typographic scale
- Avoid mixing more than two type families — Beni for display, Clash Grotesk for everything else; no serif, no monospace, no decorative fonts
- Don't use symmetric centered layouts — everything left-aligns or uses deliberate asymmetric placement; the type should feel editorial, not ceremonial

## Surfaces

- **Warm Chalk** (`#fff8f6`) — Page canvas — the base everything sits on
- **Blush Cream** (`#fce5df`) — Soft tinted surface for badges, tags, and gentle color blocks
- **Cotton Pink** (`#e878b2`) — Elevated accent surface, used rarely for standout card moments

## Imagery

Almost no traditional imagery. The site is a typographic showcase where oversized Beni display type IS the visual content. Where images appear (portfolio pieces, team, or case studies), they are treated as full-bleed editorial crops with no rounded corners, no shadows, no decorative frames — raw photographs presented in rectangular slabs. Any illustrations or graphic elements use the brand palette: hot pink forms, deep green line work, lilac accents. Icons are minimal line-art glyphs in black or green, never filled or colorful. The visual density is inverted: 95% typography, 5% image.

## Layout

Full-bleed single-column layout with extreme vertical whitespace. Each section typically owns an entire viewport height, anchored by massive display type at the bottom-left or top-left. Navigation is stripped to two pink circles in the absolute corners — no nav bar, no mega-menu, no breadcrumbs. Content scrolls as a sequence of typographic statements rather than traditional sections: each scroll position delivers one bold message, then vast white space, then the next. No card grids, no multi-column layouts, no sidebar. The page reads like a typographic manifesto: one idea per screen, each rendered at maximum scale. Responsive behavior collapses display type proportionally but preserves the generous spacing and corner-circle navigation.

## Similar Brands

- **Pentagram** — Same editorial-magazine approach where oversized display typography replaces product imagery and layout is radically minimal
- **Locomotive (studio)** — Shared commitment to bold custom display type and generous whitespace as the primary structural system
- **Resn** — Experimental agency aesthetic with unconventional navigation (circular triggers) and typographic-first page rhythm
- **Buck (studio)** — Creative agency portfolio language using display type as hero content with restrained UI chrome
