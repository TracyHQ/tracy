# Promova — Style Reference
> midnight magazine with one yellow highlighter — a black page, white type, and a vivid lemon swatch that says 'press here'.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Promova is a midnight-magazine language learning surface: near-black canvas, white type, a single electric yellow (#fff050) used as functional punctuation for the primary action and icon highlights. Headlines are set in Nekst, a custom display face used exclusively at oversized scales (40–140px) — never as UI text — giving every screen a confident editorial weight. Body and interface type run on Manrope from 200 to 700, with weight 200 doing the work most sites assign to 300. The system is ruthlessly monochromatic (1% colorfulness) and the visual rhythm comes from oversized type, generous 30px corner radii, and the yellow accent appearing only where action or attention is required. Components feel like magazine spreads rather than dashboard widgets: flat, rounded, low-elevation, with cards that read as paper inserts against the black page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Jet Black | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Paper White | `#ffffff` | Primary text on dark canvas, inverted button surface, logo, nav foreground |
| Ash | `#595959` | Muted helper text, secondary captions, subdued metadata |
| Fog | `#dddddd` | Hairline borders, low-emphasis dividers, card outlines on dark backgrounds |
| Smoke | `#f5f5f5` | Light surface variant for inverted sections, light card fills against the dark page |
| Highlighter Yellow | `#fff050` | Yellow supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Periwinkle Wash | `#dfe3ff` | Soft accent surface, tinted card backgrounds, decorative wash behind phone mockups |
| Iris Veil | `#bec8ff` | Decorative illustration tint, secondary surface accent, cool shadow for hero imagery |

## Typography

### Nekst — Display and headline face — used exclusively at 40px and above for hero text, section headers, and oversized editorial statements. Single weight (400) with no bold variant, forcing the size itself to carry emphasis. Custom geometric grotesque with tight apertures that give headlines a sharp, print-poster quality on the black canvas.
- **Substitute:** Bricolage Grotesque, Space Grotesk, or General Sans at the same weights
- **Weights:** 400
- **Sizes:** 14px, 15px, 16px, 18px, 19px, 24px, 40px, 50px, 60px, 70px, 100px, 120px
- **Line height:** 1.00–1.20

### Manrope — Interface and body workhorse — navigation, body copy, buttons, captions, form labels, and footers. Weight 200 handles light/secondary text, 400–500 for body, 700 for emphasized UI labels. Carries every functional element that isn't editorial display.
- **Substitute:** Inter, Plus Jakarta Sans, or DM Sans
- **Weights:** 200, 400, 500, 700
- **Sizes:** 10px, 14px, 15px, 16px, 18px, 20px, 24px, 25px, 140px
- **Line height:** 1.40–1.67

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body-lg | — | — | 16px | 1.67 | — |
| subheading | — | — | 18px | 1.5 | — |
| subheading-lg | — | — | 20px | 1.44 | — |
| heading-sm | — | — | 24px | 1.42 | — |
| heading | — | — | 40px | 1.2 | — |
| heading-lg | — | — | 60px | 1.2 | — |
| display | — | — | 100px | 1 | — |
| display-xl | — | — | 140px | 1 | — |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 30px
- **Element gap:** 10px

### Border Radius

- **tags:** 4px
- **cards:** 30px
- **buttons:** 20px
- **buttons-sm:** 10px

## Components

### Promova Logo Lockup
**Role:** Brand identity

Lowercase wordmark 'promova' set in Manrope weight 700, white on the black header. The wordmark sits flush-left in the nav bar with no icon glyph or padding buffer — the word IS the mark.

### Header Navigation Bar
**Role:** Primary site navigation

Full-width black bar with Manrope 15px / 500 weight nav items (Languages, Courses, For business, Why Promova, Resources), each with a chevron-down caret. White text, no background fill on items, 30px corner radius on the overall container. Pairs with two right-aligned CTAs.

### Ghost Button (Sign Up)
**Role:** Secondary action in nav

Transparent background, 1px white border (or Fog #dddddd), white Manrope 14px / 700 uppercase text, 10px corner radius, 10px 15px padding. Inverts to filled-white on hover.

### Filled Dark Button (Get Started)
**Role:** Primary action in nav

Black background (#000000), white Manrope 14px / 700 uppercase text, 10px corner radius, 10px 15px padding. On the dark canvas this button reads as a subtle outlined ghost rather than a filled block — the brand relies on the yellow for real action emphasis.

### Yellow CTA Button (Try Promova)
**Role:** Primary conversion action

Highlighter Yellow (#fff050) background, black Manrope 14–16px / 700 uppercase text, 20px corner radius, 20px 30px padding. The single chromatic element on the page — this is where Promova spends its only color budget. Feels like a highlighter mark over a printed page.

### Hero Headline Block
**Role:** Above-the-fold editorial statement

Nekst weight 400 at 100–140px, white text, line-height 1.0. Sits left-aligned on the black canvas, occupying the full left half of the hero. The size and the custom face's geometric sharpness make it read as a magazine cover, not a SaaS headline.

### Content Card
**Role:** Feature, method, and article containers

White or Smoke (#f5f5f5) background, 30px corner radius (the signature radius of the entire system), 30px padding on all sides, no shadow or border. On the dark page, white cards read as paper inserts laid on a black table.

### Method/Feature Card
**Role:** Two-column explanation blocks

White card with 30px radius, contains a Nekst 40–60px heading (black), Manrope 16px body text in Ash #595959, and optional small icon. Arranged in a 2-column grid with 40px gap between cards.

### FAQ Accordion Row
**Role:** Expandable question/answer item

Transparent or dark surface, no background, 1px Fog (#dddddd) bottom border. Question text in Manrope 18–20px / 500, white. Chevron icon right-aligned. No card container — the list feels like editorial copy, not a widget.

### Promo Modal (Usyk Campaign)
**Role:** Overlay marketing card

Periwinkle (#dfe3ff) background, 30px corner radius, centered on the page with a dark backdrop. Contains Nekst 50–60px heading, Manrope 16px body, a yellow CTA button, and a phone mockup illustration to the right. Functions as a single-color editorial insert.

### Phone Mockup Frame
**Role:** Product screenshot container

Iris Veil (#bec8ff) or Periwinkle (#dfe3ff) rounded background, phone device frame rendered at slight angle, app UI visible inside. The cool purple-blue tints differentiate product visuals from the achromatic UI without breaking the monochrome rule.

### Language Pill
**Role:** Language selector tags

White or Smoke background, 4–10px corner radius, Manrope 14px / 500 text, minimal padding (5–10px). Small, functional, no decoration.

### Icon Set
**Role:** Interface iconography

Yellow (#fff050) filled icons for highlighted or interactive glyphs, white outlined icons for secondary UI. Consistent stroke weight, geometric and flat — no skeuomorphism. The yellow icons are the most visible brand mark after the wordmark.

## Do's and Don'ts

### Do
- Use #fff050 exclusively for the single primary CTA on any page — never for decorative fills, secondary buttons, or status indicators
- Set all display headings in Nekst at 40px or larger; never use Nekst for body, nav, or button text
- Apply 30px border-radius to all cards, modals, and major content containers — this radius IS the brand
- Keep the page canvas #000000 across all sections; use white or Smoke (#f5f5f5) cards as the only way to create surface separation
- Use Manrope weight 200 for light/secondary text and weight 700 for emphasized UI labels; weight 500 is the default for body and nav
- Let headlines sit at line-height 1.0 with no extra tracking adjustments — the geometric Nekst at scale carries its own density
- Place icons only as small functional elements or as yellow accent glyphs — never as large decorative illustrations

### Don't
- Don't introduce additional accent colors — blue, green, red, or purple as UI tokens. The system is one-color-on-black
- Don't use Nekst below 40px or for button labels, nav items, or form fields — it loses its editorial power at small sizes
- Don't apply box-shadows to cards or buttons — the flat paper-on-table aesthetic is intentional
- Don't use borders thicker than 1px on dark surfaces — use Fog (#dddddd) for hairlines, never a chromatic border
- Don't alternate section backgrounds between black and light gray — keep the canvas black throughout, with white card inserts for content blocks
- Don't use fully rounded (9999px) pill buttons — the system's button radius is 10–20px, never circular
- Don't place body text below 14px or above 20px — the type scale jumps from body to display via Nekst at 40px+

## Elevation

- **Modal/Overlay:** `0 0 0 100vmax rgba(0,0,0,0.7)`
- **Cards on dark canvas:** `none — flat surfaces, no shadow`

## Surfaces

- **Void** (`#000000`) — Page canvas — the dominant background across all sections
- **Ash Layer** (`#f5f5f5`) — Elevated light surface for inverted cards, feature blocks, FAQ items
- **Periwinkle Mist** (`#dfe3ff`) — Tinted accent surface for decorative and product showcase areas
- **Iris Glow** (`#bec8ff`) — Highest-elevation accent wash for hero visual containers and phone mockup backgrounds

## Imagery

Imagery is minimal and product-led: phone mockups showing the app interface sit against soft purple-blue tints (Periwinkle #dfe3ff, Iris Veil #bec8ff), never against photographic backgrounds. Portrait photography of people (Oleksandr Usyk in the campaign modal) is presented in circular crops, small, and subordinate to type — the typography leads, imagery supports. No full-bleed hero photography. Icons are flat, yellow-filled or white-outlined, geometric. The overall effect is a printed page with sparse illustration, not a screen-first product.

## Layout

Promova uses a max-width 1200px centered column with generous side padding. The hero is an asymmetric split: oversized Nekst headline left, product visual right. Below the hero, content flows in a 2-column card grid for method/feature blocks, then a full-width FAQ accordion list, then a 3-column article grid. Section gaps are large (80px+) to let the black canvas breathe. The header is a simple horizontal bar, not a mega-menu. Sticky behavior is not visually indicated — the nav stays quiet. All sections share the same black background; visual separation comes from white card inserts, not from alternating background colors.

## Similar Brands

- **Duolingo** — Same language-learning category and similar use of a single bold accent color (green for Duolingo, yellow for Promova) against a brand-dominant canvas
- **Linear** — Dark-mode UI with oversized display type, generous corner radii, and a single accent color for interactive elements
- **Notion** — Monochrome-on-black interface with flat cards, minimal shadows, and typography-led hierarchy
- **Babbel** — Language-learning competitor with a similar dark-canvas editorial layout and oversized display headlines
- **Vercel** — Near-black canvas with one chromatic accent, geometric sans-serif display type, and the same flat-paper card aesthetic
