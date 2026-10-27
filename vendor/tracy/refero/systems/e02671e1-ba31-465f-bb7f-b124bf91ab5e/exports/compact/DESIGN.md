# Champions4good — Style Reference
> midnight sports broadside — a vintage club poster screaming from a plum-dark wall

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Champions4good is a dark-first club poster: deep plum canvas, one screaming lavender accent, and ultra-condensed display type that fills the screen like a vintage sports broadside. The visual hierarchy is brutally simple — everything chromatic is lavender-pink (#e894ff) against the plum ground, and supporting accents (mint, amber) appear as small functional punctuation rather than competing for attention. Body sections break to white canvas with the same condensed display type rendered in dense black, creating a high-contrast section rhythm. The type attitude is anti-restraint: Druk Condensed at 200-300px with tight tracking and tight line-height pushes the display copy to the edges of its container, while Neue Montreal handles UI chrome at human sizes. Components are minimal — pill toggles, a single filled lavender button, sparse navigation — letting the typography and the plum-to-white contrast do the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Plum | `#23002b` | Hero canvas, dark section backgrounds, page-level ground — sets the exclusive nighttime club mood |
| Lavender Shock | `#e894ff` | Pink supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Espresso Brown | `#291900` | Warm near-black for card backgrounds, dark UI surfaces, warm-tinted borders — adds subtle warmth to the otherwise cool palette |
| Ink Teal | `#002629` | Cool near-black for body text, deep card surfaces, cool borders — the teal undertone distinguishes dark text from the plum background |
| Slate | `#333333` | Primary body text on light sections, icon strokes, dense UI text |
| Charcoal | `#121212` | Headlines on light sections, heavy text blocks, near-black emphasis |
| Black | `#000000` | Maximum-contrast text on white sections, solid fills for condensed display type in light zones |
| Paper White | `#ffffff` | Light section canvas, reverse text on dark plum, card surfaces in light zones |
| Mint Signal | `#93ffe4` | Accent punctuation: highlight washes, badge backgrounds, small functional moments — cool contrast against lavender |
| Amber Pulse | `#ffac47` | Accent punctuation: warm highlight moments, secondary badges, energy markers — warm contrast against the cool palette |

## Typography

### Druk Condensed Super Desktop — Display and section headings — extreme condensed bold that fills containers edge-to-edge; 151-317px for hero-scale words, 24-44px for subheadings
- **Substitute:** Oswald (700, condensed) or Bebas Neue for free alternatives; Anton as last resort
- **Weights:** 400, 500
- **Sizes:** 24px, 29px, 32px, 43px, 44px, 151px, 187px, 317px
- **Line height:** 0.78, 0.85, 1.00
- **Letter spacing:** +0.005em to +0.008em — slightly positive tracking prevents the ultra-condensed letterforms from feeling claustrophobic at display sizes

### Neue Montreal — UI body, navigation, buttons, supporting copy — geometric sans-serif that stays quiet so Druk can shout; 58px is the bridge size between UI and display
- **Substitute:** Inter, Manrope, or DM Sans
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 14px, 15px, 16px, 58px
- **Line height:** 1.00, 1.10, 1.20, 1.30, 1.40, 1.43
- **Letter spacing:** -0.022em — negative tracking tightens the UI type into a compact, confident block that visually anchors against the sprawling display type

### Arial — System fallback for body text rendering
- **Substitute:** system-ui, sans-serif
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.43

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.43 | -0.22px |
| body-sm | — | — | 14px | 1.43 | -0.22px |
| subheading | — | — | 24px | 1 | 0.05px |
| heading-sm | — | — | 32px | 0.85 | 0.05px |
| heading | — | — | 58px | 1.1 | -0.22px |
| display | — | — | 187px | 0.85 | 0.05px |
| display-xl | — | — | 317px | 0.78 | 0.05px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 6px
- **cards:** 14px
- **pills:** 9999px
- **buttons:** 9999px
- **special:** 24px

## Components

### Hero Display Headline
**Role:** Full-bleed poster-scale word stack

Druk Condensed 317px at line-height 0.78, color Lavender Shock (#e894ff) on Deep Plum (#23002b) ground. Letters push to the edges of the viewport with near-zero padding. No line-wrap — each word is a separate element. Secondary connecting words ('YOUR', 'OF') sit in Neue Montreal 58px at 600 weight, breaking the display rhythm. The extreme vertical compression (line-height 0.78) causes descenders and ascenders to overlap adjacent lines, creating the poster-stacked effect.

### Sport Toggle Pill
**Role:** Two-option selector for sport type (tennis/golf)

Pill shape (9999px radius), 80×48px frame, Deep Plum (#23002b) background. Active state: Lavender Shock (#e894ff) fill with dark icon. Inactive: outlined with 1px Lavender Shock border on transparent. Icon is a simple white-line sport figure centered within.

### Filled Lavender Button
**Role:** Primary action — Join, Sign Up, CTA

Pill shape (9999px radius), 12px 20px padding, Lavender Shock (#e894ff) background, Deep Plum (#23002b) text, Neue Montreal 14px 500 weight. No border, no shadow. On hover: slight brightness shift to 100% saturation. Compact — this is a one-word button.

### Navigation Bar
**Role:** Top-level site navigation

Transparent over hero, 64px tall, horizontal: logo left, nav links center, action button right. Links in Neue Montreal 14px, Paper White (#ffffff) on dark sections, Slate (#333333) on light sections. Active link gets Lavender Shock underline or color shift. No background bar — the nav floats directly on the section canvas.

### Wordmark Logo
**Role:** Brand identity mark

Stacked text logo: 'CHAMPIONS FOR GOOD CLUB' in three lines, Druk Condensed 400 weight at ~20px, Lavender Shock (#e894ff). Preceded by a small mark icon. No tagline, no subtext — the mark IS the identity.

### Light Section Display Block
**Role:** Headline blocks on white canvas sections

Druk Condensed 187px at line-height 0.85, Black (#000000) or Charcoal (#121212) fill, left-aligned. Words stack vertically with tight tracking. White space dominates right side of the layout. This is the 'poster' moment on light sections — same type treatment as hero, different color.

### Card Surface
**Role:** Content card on either dark or light ground

14px border-radius, 20px padding, no shadow. Dark variant: Espresso Brown (#291900) background with Paper White (#ffffff) text. Light variant: Paper White background with Slate (#333333) text and 1px hairline border in #e5e5e5.

### Badge / Tag
**Role:** Small status or category label

6px border-radius, 3-5px vertical padding, 8-10px horizontal padding. Mint Signal (#93ffe4), Amber Pulse (#ffac47), or Lavender Shock (#e894ff) fills with dark text. Neue Montreal 12px 500 weight, uppercase optional.

### Footer Link List
**Role:** Bottom-of-page navigation

Neue Montreal 14px, Paper White on dark footer sections, Slate on light. 8px row-gap between links, left-aligned columns. No decoration — just dense, readable type.

## Do's and Don'ts

### Do
- Use Druk Condensed for all display headings at 58px or larger — this font is the brand voice, not a decoration
- Set display type to line-height 0.78-0.85 to create the poster-stacked overlap effect
- Use Lavender Shock (#e894ff) as the ONLY chromatic color on Deep Plum (#23002b) sections — let the duotone do the work
- Apply 9999px border-radius to every button, tag, and pill element — no sharp corners in the UI
- Break the page rhythm with white (#ffffff) sections after dark plum sections — the contrast IS the layout
- Use Mint Signal (#93ffe4) and Amber Pulse (#ffac47) only as small accents under 20% of viewport — they are punctuation, not surfaces
- Keep Neue Montreal at 12-16px for all UI chrome — it must stay quiet enough that Druk dominates

### Don't
- Don't use any font other than Druk Condensed for display type — system serifs or regular sans-serifs at 200px+ will collapse the poster energy
- Don't place Lavender Shock (#e894ff) on white or light backgrounds — the contrast is designed for dark plum only
- Don't add box-shadows to cards or buttons — the design uses flat color layering, not elevation
- Don't use line-height above 1.0 for display type — the tight vertical compression is the signature
- Don't mix the accent colors (mint, amber) into the dark plum sections — they belong in light/transition zones only
- Don't use border-radius smaller than 6px on any interactive element — the system is built on pills and soft corners
- Don't center-align display headlines — left-align pushes type to the viewport edge for the broadside effect

## Surfaces

- **Deep Plum Ground** (`#23002b`) — Hero and dark section canvas — the primary brand surface
- **Espresso Card** (`#291900`) — Dark card surfaces, warm-tinted elevated elements on plum ground
- **Ink Teal Card** (`#002629`) — Cool-tinted card surfaces and deep text on light sections
- **Paper White** (`#ffffff`) — Light section canvas, reverse text, high-contrast break sections

## Imagery

Iconography is the primary visual language: simple line-art sport figures (tennis player, golfer) rendered as single-stroke outlines in white or lavender, used inside pill toggles. No photography, no illustrations, no 3D renders. The display type itself is the imagery — the huge condensed words function as visual art on the plum canvas. Any photographic content would need to be tightly cropped sports imagery with high contrast and minimal background.

## Similar Brands

- **The Players' Tribune** — Same dark-canvas + ultra-condensed display type approach for sports community branding
- **On Running** — Bold condensed type filling the viewport, single accent color against dark, poster-scale typography
- **WHOOP** — Dark-first interface with a single saturated accent (lavender/electric) on deep neutral ground
- **Gymshark** — High-contrast display type pushing to viewport edges, club/community energy through typographic scale
