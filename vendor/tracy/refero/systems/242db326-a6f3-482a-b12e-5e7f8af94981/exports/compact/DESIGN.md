# Framer — Style Reference
> cinematic black gallery. Pure black canvases cradle white editorial type and one electric blue accent that traces edges rather than filling space.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Framer operates in absolute darkness: a pure black canvas (#000000) where white typography and one electric blue (#0099ff) do all the talking. The design language is cinematic and confident — oversized condensed display type (GT Walsheim at 85–110px) anchors every section, while the rest of the interface dissolves into near-black surface layers. The signature rhythm is alternating maximalist hero typography against minimal, gridded screenshots of customer sites, all bordered by hairline dividers and powered by compact 10px spacing. The blue accent never fills buttons; it traces edges, outlines cards, and fires on micro-interactions like text selection and link hover — restrained, never decorative. Components are weightless: pill-shaped controls, thin borders, and barely-there elevation that lets the photography and editorial typography carry the weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page background, primary canvas — the void that everything else sits on. Also used for filled primary buttons, nav background, card borders, and the vast majority of interface borders |
| Carbon | `#080808` | Card surface layer, elevated panels, secondary background — barely lifted from the void to suggest depth without leaving the dark family |
| Obsidian | `#111111` | Higher elevation cards and modal surfaces — the second step up from the page |
| Graphite | `#171717` | Top-tier surface for popovers, tooltips, and deeply nested panels |
| Slate | `#242424` | Mid-tone fills, hover states, subtle panel backgrounds |
| Fog | `#333333` | Button hover, pressed states, and darker UI fills |
| Ash | `#666666` | Muted text, secondary labels, disabled states, subtle borders |
| Smoke | `#8c8c8c` | Helper text, tertiary metadata, thin dividers |
| Silver | `#999999` | Secondary text, body copy at lower emphasis, border dividers |
| Bone | `#cccccc` | Light borders, subtle dividers on dark surfaces |
| Paper | `#ffffff` | Primary text, headings, filled button backgrounds, light-on-dark iconography — the dominant foreground against the void |
| Deep Harbor | `#021f33` | Deep blue-black for box-shadows and subtle tinted surface washes — carries the brand's cool undertone into elevation |
| Electric Cyan | `#0099ff` | Brand accent: link underlines, active nav state, focus rings, outlined button borders, decorative card borders, and text selection — appears only on edges and micro-states, never as a fill |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### GT Walsheim — Display and hero headlines. The ultra-condensed geometric character with aggressive negative tracking at 85–110px creates the editorial, almost cinematic weight that defines Framer's voice. At 110px the line-height compresses to 0.85, letting the headline feel like a single block of mass. Substitute: Inter Tight or Mona Sans as a free alternative.
- **Weights:** 500
- **Sizes:** 32px, 62px, 85px
- **Line height:** 0.85–1.13
- **Letter spacing:** -0.0500em to -0.0310em
- **OpenType features:** `"ss02", "tnum"`

### Inter Variable — Primary UI and body font. The extensive character variant alternates (cv01–cv11, ss02–ss07) tune individual glyphs — switching between straight and curved tails, alternate g shapes, and stylistic sets depending on context. Body text uses subtle negative tracking (-0.01em to -0.02em); uppercase labels use positive tracking (0.03em). Substitute: Inter (Google Fonts) with matching feature settings.
- **Weights:** 400
- **Sizes:** 8px, 12px, 13px, 14px, 15px, 18px, 24px
- **Line height:** 0.80–1.40
- **Letter spacing:** -0.0200em to 0.0300em
- **OpenType features:** `"cv01", "cv05", "cv09", "cv11", "dlig"; "cv06", "cv11"`

### Inter — Secondary text, nav items, links, form labels, and button text. Weights 500–700 for emphasized UI elements. Tracking tightens dramatically at larger sizes (22px at -0.05em). Substitute: Inter from Google Fonts.
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 13px, 14px, 20px, 22px
- **Line height:** 0.83–1.60
- **Letter spacing:** -0.0530em to 0.0200em
- **OpenType features:** `"cv01", "tnum"`

### Mona Sans — Secondary display and text accents. Used at 62px for section headers, with extremely tight tracking (-0.05em) giving it a dense, graphic feel. Substitute: Mona Sans (GitHub).
- **Weights:** 500
- **Sizes:** 12px, 13px, 17px, 18px, 62px
- **Line height:** 1.00–2.28
- **Letter spacing:** -0.0500em to -0.0460em

### Open Runde — Micro-labels and oversized tagline micro-text. Substitute: Inter at 600 weight.
- **Weights:** 600
- **Sizes:** 9px
- **Line height:** 1.11
- **OpenType features:** `"cv01", "cv09"`

### GT Walsheim Framer Medium — GT Walsheim Framer Medium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 110px
- **Line height:** 0.85
- **Letter spacing:** -0.05

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body | — | — | 14px | 1.3 | -0.14px |
| subheading | — | — | 18px | 1.4 | -0.18px |
| heading-sm | — | — | 24px | 1.2 | -0.48px |
| heading | — | — | 32px | 1 | -1.6px |
| heading-lg | — | — | 62px | 0.95 | -3.1px |
| display | — | — | 85px | 0.95 | -4.25px |
| display-xl | — | — | 110px | 0.85 | -5.5px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 60-80px
- **Card padding:** 20-24px
- **Element gap:** 10px

### Border Radius

- **tags:** 100px
- **cards:** 15px
- **icons:** 8px
- **images:** 8-12px
- **inputs:** 8px
- **buttons:** 100px
- **large-panels:** 20-30px

## Components

### Primary Filled Button
**Role:** Highest-emphasis action (e.g. 'Sign up', 'Start for free')

White background (#ffffff), black text (#000000), 100px pill radius, 10px 20px padding, Inter at 14px weight 500. No shadow. Borderless. This is the only button that fills with a solid color — everything else stays ghosted.

### Ghost/Outlined Button
**Role:** Secondary action beside primary (e.g. 'Start with AI')

Transparent background, 1px white border (rgba 10-20% white), white text, 100px pill radius, 10px 20px padding, Inter at 14px weight 500. Sits level with the void; border is the only signal.

### Electric Outlined Action
**Role:** Brand-tinted secondary action or focus/active state

Transparent background, 1px border in #0099ff, #0099ff text, 100px pill radius. Used sparingly for the rare moment the blue accent gets to act as a control — not for the default CTA.

### Hero Display Headline
**Role:** Page-top headline anchoring the visual identity

GT Walsheim Medium at 85–110px, weight 500, white (#ffffff), letter-spacing -0.05em, line-height 0.85–0.95. Centered. This is the dominant visual mass of any page — the oversized type is non-negotiable.

### Customer Site Card
**Role:** Showcase tiles in the logo wall / portfolio grid

Screenshot or render at 8–12px radius, contained within a grid with 10px gaps. No border by default; on hover, 1px #0099ff or #333 border may appear. Background is always the void (#000000) with the image doing all the work.

### Testimonial Card
**Role:** Social proof block with quote, attribution, and supporting visual

Carbon (#080808) or transparent background, no border, large white pull-quote at 24–32px GT Walsheim Medium, attribution at 12–14px Inter in #999999. Paired with a product screenshot on the right at 12px radius.

### Top Navigation Bar
**Role:** Persistent site navigation

#000000 background, logo at left, center nav links in Inter 14px weight 500 white, right side has ghost 'Log in' link and filled white 'Sign up' button (100px radius). Fixed/sticky at top. No visible border.

### Announcement Banner
**Role:** Thin strip above hero linking to reports, events, or promotions

Transparent over black, Inter 12px weight 500 white text, centered, no background fill. Optional • separator. Minimal — no pill, no background.

### Logo Grid (Customer Wall)
**Role:** Trust strip showing brands using the product

3-4 column grid on desktop, brand logos rendered in #999999 or #ffffff on #000000, even spacing at 40-60px gaps, no card chrome. Logos are monochrome to dissolve into the void.

### Section Heading
**Role:** Mid-page section titles (e.g. 'Powering ambitious teams worldwide')

GT Walsheim Medium at 62px or Inter at 32–40px, white, letter-spacing -0.03 to -0.05em, left-aligned with generous left padding. No subtitle decoration.

### Dark Image Container
**Role:** Framed media (screenshots, renders, video)

12px or 15px radius, #000000 or #080808 background behind the image, 1px border in #242424 or #333 to separate from void. Padding 0-8px between border and image edge.

### Subtle Overlay Wash
**Role:** Decorative gradient overlay for section transitions

linear-gradient(rgba(5, 255, 159, 0) 0%, rgba(0, 0, 0, 0.06) 100%) — an almost invisible downward darkening used to separate sections without hard dividers.

## Do's and Don'ts

### Do
- Set page background to #000000 and let all text be #ffffff by default — the void is the brand
- Use GT Walsheim at 85–110px for hero headlines with letter-spacing -0.05em and line-height 0.85
- Use 100px pill radius for all buttons and tags — never square buttons
- Use 10px as the standard element gap; only reach 20-24px for card padding and 60-80px for section gaps
- Apply Electric Cyan (#0099ff) only to edges: borders, underlines, focus rings, and active states — never as a fill
- Use Inter at 14px weight 400 for body text with letter-spacing -0.01em
- Express elevation through surface color progression (Carbon → Obsidian → Graphite) rather than heavy shadows

### Don't
- Don't introduce any background color other than the black-to-charcoal surface stack — no grays, no tinted backgrounds, no warm tones
- Don't use Electric Cyan (#0099ff) as a filled button background — it is an edge accent only
- Don't use box shadows with offset greater than 10px on regular cards — the design is flat-by-default
- Don't set border-radius below 8px on any container — the minimum visual softness is 8px
- Don't use font-weight above 500 for display type — GT Walsheim at 500 is already commanding; going heavier breaks the voice
- Don't add decorative gradients, glows, or colored backgrounds to sections — sections transition through pure black
- Don't use color for body text — keep all text in #ffffff, #999999, or #666666 only

## Elevation

- **Card:** `rgba(0, 0, 0, 0.25) 0px 1px 2px 0px`
- **Elevated Panel:** `rgba(0, 0, 0, 0.25) 0px 10px 30px 0px, rgba(255, 255, 255, 0.1) 0px 0.5px 0px 0.5px`
- **Modal:** `rgba(0, 0, 0, 0.6) -10px 10px 20px 10px`

## Surfaces

- **Void** (`#000000`) — Page background — the base canvas everything sits on
- **Carbon** (`#080808`) — Card surfaces, nested containers, secondary background
- **Obsidian** (`#111111`) — Elevated cards, modal backgrounds
- **Graphite** (`#171717`) — Top-level elevation, popovers, deeply nested panels
- **Slate** (`#242424`) — Hover states, interactive fills, subtle overlays

## Imagery

Photography and product renders do the heavy lifting in a nearly text-free design. Customer site showcases appear as contained screenshots in a 5-column tile grid, each at 8–12px radius, floating on pure black. Section visuals pair a large product render or editorial photograph (e.g. a creative professional portrait) with a dark overlay card containing UI chrome. Photography is high-contrast, editorial in quality, and always set against dark or neutral environments — no lifestyle clutter, no bright studio setups. Decorative gradients are nearly invisible (6% black overlay). Icons are minimal and outlined at 1px stroke weight in white or Electric Cyan. There are no illustrated characters, no 3D mascots, and no abstract geometric decorations — the visual restraint is total.

## Layout

Full-bleed dark canvas with max-width 1200px content containers. The hero is centered text-only: announcement strip → 110px headline → 3-line subhead → twin CTA row (filled + ghost). Below the hero, a full-bleed 5-column customer site tile grid bleeds edge-to-edge, breaking the container. Subsequent sections use a max-width 1200px left-aligned model: 62px section heading followed by single-column testimonial cards that are 2-column (quote-left / product-render-right). Navigation is a sticky top bar with centered nav links. Vertical rhythm is consistent: 60–80px section gaps, 10px within-card gaps. The page breathes — large blocks of negative space between editorial-type sections create a gallery-walk feeling.

## Similar Brands

- **Linear** — Same pure-black dark mode, pill-shaped controls, and oversized condensed display type at hero — both treat black as a first-class brand color
- **Vercel** — Identical philosophy: monochrome palette, hairline borders, compact spacing, and editorial-scale typography that dominates the layout
- **Raycast** — Same dark surface stack progression (near-black layers), compact 10px rhythm, and restrained single-color accent on edges rather than fills
- **Arc Browser** — Both use cinematic dark canvases with bold display type, customer/portfolio wall grids, and let a single accent color trace edges rather than fill shapes
