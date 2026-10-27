# Ordinal — Style Reference
> dark observatory with one mint filament — a near-black room where a single neon green switch glows as the only thing that matters

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ordinal is a near-monochrome dark canvas interrupted by a single luminous mint accent — the interface behaves like a dimmed control room where one neon switch is always lit. Almost the entire UI lives in #151316 with white type, gray hairlines, and quiet 5px corners, while #8ef5b5 is reserved as punctuation: primary action fills, eyebrow labels, active states, and logo glows. The product screenshot is the hero — no decorative imagery, no gradients, no illustrations — letting the calendar UI itself become the visual. Typography is Inter in only two weights (400, 500) paired with a custom monospace eyebrow face, all text sits tight with negative tracking, and the result reads as a calm, professional tool that earns its single color through restraint rather than scarcity.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Canvas | `#151316` | Page background, hero canvas, footer — near-black with a faint violet undertone that keeps the dark from feeling flat or sterile |
| Paper | `#ffffff` | Primary text and icon color on dark surfaces; borders on dark UI; inverted text on light feature cards |
| Elevated Surface | `#444245` | Card and panel surface above the void canvas — subtle lift achieved through one tonal step rather than shadow |
| Mist | `#8e8e8e` | Muted body text, hairline dividers, inactive icon strokes, and low-emphasis borders on dark backgrounds |
| Smoke | `#585657` | Mid-weight borders and subtle UI separators — slightly darker than Mist for structural rules |
| Ash | `#b9b9b9` | Light-mode body borders and secondary text on warm light sections |
| Bone | `#f4f2ee` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Charcoal | `#222222` | Primary text on light feature sections and nav borders in light mode |
| Mint Filament | `#8ef5b5` | The single chromatic accent — filled primary CTAs, eyebrow pill labels, active nav indicator, logo glow, and green-text logo tints. Against #151316 the contrast is 14:1, making it legible as both text and fill |
| Deep Teal | `linear-gradient(170deg, rgb(36,87,77), rgb(58,58,58))` | Muted teal used for gradient stops and subtle secondary accents — never appears alone, always paired as a background fade or shadow; Gradient overlay creating soft elevation behind product screenshot and logo wall |

## Typography

### Inter — Entire UI — body, nav, headings, buttons, cards. Only two weights used (regular 400, medium 500) which is the core typographic discipline: no bold display weight, no light italic, just calm and confident Inter. The 13px/17px pair forms the dense product text; 40–60px carries the marketing voice. Headlines use -0.03em tracking to pull letters tight against the dark canvas.
- **Substitute:** system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif
- **Weights:** 400, 500
- **Sizes:** 13, 17, 27, 40, 53, 60
- **Line height:** 1.0, 1.2, 1.5
- **Letter spacing:** -0.0300em, -0.0100em

### Inconsolata (custom-mapped eyebrow face) — Eyebrow labels, status pills, and small ALL CAPS markers like 'ASSEMBLY 15 NOW ORDINAL', 'SCHEDULING', 'WATCH A DEMO 4:15'. The monospace character at 13–17px is a deliberate break from Inter's proportions — signals 'metadata / system status / not body content'. 0.01em positive tracking on the eyebrow adds the ALL CAPS breath small caps need.
- **Substitute:** 'JetBrains Mono', 'IBM Plex Mono', 'Roboto Mono', monospace
- **Weights:** 400, 500
- **Sizes:** 13, 17
- **Line height:** 1.0, 1.5
- **Letter spacing:** 0.01em at eyebrow size; -0.01em at 17px body-mono

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | -0.01px |
| body | — | — | 17px | 1.5 | -0.01px |
| subheading | — | — | 27px | 1.2 | -0.27px |
| heading | — | — | 40px | 1.2 | -0.4px |
| heading-lg | — | — | 53px | 1.2 | -1.59px |
| display | — | — | 60px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 5px
- **icons:** 5px
- **pills:** 9999px
- **inputs:** 5px
- **buttons:** 5px
- **largeCards:** 18px

## Components

### Top Navigation Bar
**Role:** Persistent header on dark canvas

5px radius, transparent over #151316. Left: wordmark logo (16px icon + 'Ordinal' in Inter 17px 500). Center: nav links (Resources, Product, Pricing) in Inter 15px 500, white, 8px gap. Right: 'LOG IN' ghost link, 'BOOK DEMO' outlined button, 'GET STARTED' mint pill button. Height ~64px, full-bleed with 1200px inner max-width.

### Mint Pill CTA (Primary)
**Role:** Highest-emphasis action button — reserved for the single most important action per screen

1440px (fully rounded) radius, 11px horizontal × 13px vertical padding, Inter 15px 500. Background #8ef5b5, text #151316. No border, no shadow. Always sits as a single accent against monochrome neighbors — never appears twice on the same view.

### Ghost Outlined Button
**Role:** Secondary action beside a mint CTA

5px radius, 11px × 13px padding, 1px border #ffffff, text #ffffff, background transparent. Inter 15px 500. Pairs with the mint pill in the hero and nav to form a 'primary + secondary' duo without introducing a second color.

### Eyebrow Label Pill
**Role:** Section or status marker above headlines

1440px radius, 5px vertical padding, 16px horizontal padding. Inset 1px border #8ef5b5, text #8ef5b5 in Inconsolata 13px 500, letter-spacing 0.01em, uppercase. Houses metadata like 'ASSEMBLY 15 NOW ORDINAL' or 'SCHEDULING'.

### Hero Headline
**Role:** Page-level value proposition

Inter 60px weight 500, line-height 1.0, letter-spacing -1.8px, color #ffffff. Center-aligned on the void canvas. Subhead below in Inter 17px 400, color #8e8e8, 1.5 line-height.

### Product Screenshot Frame
**Role:** Hero visual — the product UI is the image

5px radius card, white (#ffffff) background to read as 'the app', soft 0 20px 60px rgba(0,0,0,0.5) shadow. Sits on a subtle teal-to-charcoal gradient backdrop (#24574d → #3a3a3a) that bleeds into the void at the edges.

### Feature Block Card
**Role:** Feature explanation in the light section of the page

18px radius, white background, 24px padding, soft 0 2px 8px shadow. Contains a screenshot or icon block above, a heading (Inter 27px 500, #222222), body copy (17px 400, #8e8e8e), and a 5px-radius outlined link button.

### Feature Section Heading
**Role:** Section-level title in the light/mixed area

Inter 53px weight 500, line-height 1.2, letter-spacing -1.59px, color #222222. Followed by a 40px 500 subhead in #8e8e8 that visually softens the lead.

### Logo Wall Cell
**Role:** Social proof — customer logos

8-column grid on the dark canvas, no card chrome. Logos are flat vector marks; brand-aligned logos render in #8ef5b5 (active) or #ffffff (neutral). Each cell ~140px wide, 32–40px tall, vertically centered.

### Calendar Product Surface
**Role:** Screenshot inside the hero — demonstrates the scheduling grid

White surface with 5px outer radius, weekly grid (7 columns), 56px row height. Date headers in Inter 13px 500 #b9b9b9, content chips with 5px radius, 8px internal padding, soft gray #f4f2ee background and #8ef5b5 channel-color tags.

### Social Platform Icon Tile
**Role:** Brand-color icon set inside feature block

10px radius square, 64×64px, filled with the platform's own brand color (LinkedIn blue, Twitter sky, Instagram magenta, Facebook blue, YouTube red, Slack purple, etc). Flat, no shadow, arranged in a 2×5 grid on white.

### Footer
**Role:** Closing surface

Full-bleed #151316, 64px vertical padding, 1200px inner. Top row: wordmark + nav columns in Inter 13px. Hairline 1px #585657 separator above footer base. No social icons in footer.

## Do's and Don'ts

### Do
- Use #8ef5b5 for exactly one filled action per view — never two mint buttons side by side
- Pair every mint CTA with a #ffffff ghost outlined button as the secondary action
- Set border-radius to 5px for cards, inputs, and small buttons; reserve 1440px only for pill CTAs and eyebrow labels
- Restrict headings to Inter weight 500 — no 600/700, no italic; the calm weight IS the hierarchy
- Apply -1.8px letter-spacing at 60px and -0.01em at body sizes to maintain Inter's tight display rhythm
- Render eyebrows as Inconsolata 13px 500 in #8ef5b5, uppercase, inside a 1440px pill with a 1px green border
- Keep the page 95%+ achromatic — mint appears only on the active CTA, the eyebrow label, and ~50% of customer logos

### Don't
- Don't introduce a second brand color — the system is monochrome + one mint, nothing else
- Don't use shadows to separate cards from the void — step the surface to #444245 instead
- Don't set headings in bold or semibold; weight 500 is the ceiling
- Don't use decorative gradients on body content — the teal→charcoal gradient only appears behind the hero product screenshot
- Don't add rounded corners larger than 18px to cards — the system reads precise, not soft
- Don't use the mint as a background fill for large sections; it loses the 'single switch' effect
- Don't stack the ghost button on ghost button; every secondary action must be ghost, and the tertiary is a text link

## Elevation

- **Product Screenshot Card:** `0 20px 60px rgba(0,0,0,0.5)`
- **Feature Card (light section):** `0 2px 8px rgba(15,15,20,0.06)`

## Surfaces

- **Void Canvas** (`#151316`) — Base page and section background — the room everything sits in
- **Elevated Panel** (`#444245`) — Cards, feature blocks, and product surface — one step lighter than the canvas
- **Teal Wash** (`#24574d`) — Gradient backstop behind product screenshots and logo wall — softens the void

## Imagery

No photography, no illustration, no 3D. The visual language is product-screenshot-first: the actual app UI (calendar grid, post composer, social channel tiles) serves as the hero imagery. Product screenshots live inside 5px-radius white frames on the dark canvas, with a subtle teal-to-charcoal gradient softening the edges. The only other 'imagery' is the customer logo wall — flat vector marks rendered in mint or white. Icon style is flat, filled, brand-colored when representing a third-party platform (LinkedIn blue, YouTube red), monochrome mint or white when representing Ordinal's own UI.

## Layout

Full-bleed dark sections alternate with a single light feature section in the middle. The page is 1200px max-width centered. Hero is a centered text stack (eyebrow pill → 60px headline → 17px subhead → CTA pair) over the product screenshot, vertically centered. Below: a dark logo-wall band with a 1px #585657 top rule. The light feature section breaks the dark rhythm with two side-by-side feature blocks (image + text), each capped by a 53px heading. Navigation is a fixed top bar at ~64px, transparent on the dark canvas. Section gaps are ~80px; element gaps inside cards stay tight at 8–16px. The calendar product screenshot is the largest single visual element on the page — everything else breathes around it.

## Similar Brands

- **Linear** — Same dark-canvas-plus-single-accent discipline — Linear's purple-on-near-black maps to Ordinal's mint-on-near-black, and both use a single bright color reserved exclusively for active state and primary CTA
- **Vercel** — Identical Inter-only-at-two-weights typography approach and a similarly restrained dark UI with geometric sans headlines at -0.03em tracking
- **Cursor** — Same product-screenshot-as-hero-image pattern: no marketing illustration, the actual product surface (calendar/editor) is the visual, framed on a near-black canvas with minimal chrome
- **Railway** — Same 'one bright color on near-black void' color strategy and the same tight Inter headline weight-500 display, though Railway leans purple where Ordinal leans mint
- **Resend** — Identical monospace-eyebrow + Inter-body typographic pairing and the same 1px-hairline-on-dark UI separator treatment
