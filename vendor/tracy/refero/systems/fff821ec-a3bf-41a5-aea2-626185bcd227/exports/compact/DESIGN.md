# VEED — Style Reference
> white gallery wall with neon-green ignition buttons

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

VEED reads as a creator's studio on a clean white wall: calm matte surfaces, a single electric lime accent that ignites action, and a typographic contrast between a clinical neo-grotesque UI face and an editorial serif that lends unexpected sophistication. The page breathes — generous white canvas interrupted by full-bleed dark bands and large media cards — but the controls themselves stay compact and tool-like, sitting close together inside pill-shaped and softly rounded containers. Color is rationed: greens are reserved for active states, the AI creation prompt, and hero CTAs, while 99% of the interface stays achromatic. The signature move is the interplay between the vivid neon green and the warm near-black text (#0c0a09) — a creator-tool energy crossed with editorial polish.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lime Spark | `#96ff1a` | Primary CTA fills, active toggle states, the AI creation prompt accent — an electric green that functions as the brand's ignition switch, impossible to miss on the white canvas |
| Spring Wash | `#d6ffa6` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Forest Ink | `#083300` | Deep brand green used for borders, icon strokes, and text on light green washes — the anchor tone that gives the lime palette a grounded counterweight |
| Mint Mist | `#e6ffc8` | Subtle tint for secondary button hovers and soft highlight zones — the palest breath of the green family |
| Carbon | `#0c0a09` | Primary heading and body text — a warm near-black with a whisper of brown that pairs with the lime accent without reading as dead-black |
| Charcoal | `#323232` | Workhorse text, secondary borders, link undertones — the most-used neutral across borders and structural lines |
| Graphite | `#292a2e` | Dark surface fills, button text on light backgrounds, icon strokes — the primary dark tone for elevated dark sections |
| Onyx | `#121212` | Dark section backgrounds, heading text on light surfaces — the deepest neutral for full-bleed dark bands |
| Slate | `#4d4d51` | Icon borders, secondary structural lines — a mid-gray for non-content boundaries |
| Smoke | `#71737a` | Muted helper text, link borders, placeholder text — the voice of secondary information |
| Ash | `#444446` | Tertiary borders, icon detail strokes — a bridge tone between slate and charcoal |
| Mist | `#f2f1f0` | Secondary surface fills, button backgrounds on hero areas, subtle tonal dividers |
| Fog | `#e6e6e7` | Hairline borders on light surfaces, divider lines |
| Paper | `#ffffff` | Page canvas, card surfaces, button fills — the dominant light surface |

## Typography

### SwissNow — The universal workhorse — handles all UI, body, navigation, button labels, inputs, footer, and most headings. A neo-grotesque with tight geometry and very tight tracking at large sizes (-0.05em at display, easing to near-normal at body). Its neutrality lets the lime accent and editorial serif carry the personality.
- **Substitute:** Inter, Geist, or DM Sans
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 40px, 44px, 54px
- **Line height:** 0.88–1.80
- **Letter spacing:** -0.05em at 54px, -0.04em at 44px, -0.025em at 40px, -0.016em at 16px, -0.005em at 14px, -0.002em at 12px, 0.01em at 11px

### PPEditorialNew — The editorial display serif reserved exclusively for top-tier section headings. A high-contrast didone-influenced face with extremely tight tracking (-0.05em at 54px) and near-zero leading (0.88–1.0) — it whispers luxury into a tool that could otherwise feel utilitarian. The contrast between SwissNow and PPEditorialNew is the brand's typographic signature.
- **Substitute:** Playfair Display, DM Serif Display, or GT Super
- **Weights:** 400
- **Sizes:** 40px, 44px, 54px
- **Line height:** 0.88–1.00
- **Letter spacing:** -0.05em at 54px, -0.04em at 44px, -0.03em at 40px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 0.01px |
| body | — | — | 16px | 1.5 | -0.016px |
| subheading | — | — | 40px | 1 | -0.025px |
| heading | — | — | 44px | 0.9 | -0.04px |
| display | — | — | 54px | 0.88 | -0.05px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **pills:** 9999px
- **inputs:** 10px
- **buttons:** 10px

## Components

### Top Navigation Bar
**Role:** Primary site navigation — fixed top, white background, hairline bottom border

White (#ffffff) background, 8px vertical padding, horizontal layout with logo (left), nav links with dropdown chevrons (center: Product, Use Cases, AI, APIs, Resources, Enterprise, Pricing), and a Login text link + black Sign Up pill button (right). Nav links in SwissNow 14px weight 500 in #323232. The 'Sign Up' button is #0c0a09 fill, white text, 10px radius, 8px 16px padding. The nav has a barely-visible hairline border in #e6e6e7.

### Hero Headline Block
**Role:** Centered hero with rating badge, primary headline, and subtext

A trust badge (5-star rating + review count in SwissNow 12px) sits above a 54px PPEditorialNew headline in #0c0a09 with -0.05em tracking, line-height 0.88 — extremely tight, almost display-poster feel. Subtext in SwissNow 16px weight 400 in #71737a, max-width ~560px, centered. Generous 64px+ vertical padding above and below.

### Hero CTA Pair (Lime + Ghost)
**Role:** The dual-action prompt — primary creation + secondary edit

Two buttons side by side, centered. Primary: #96ff1a fill, #083300 border (1px), #083300 text, 10px radius, SwissNow 14px weight 600, 14px 24px padding, with a small inline icon (camera/play). Secondary ('AI Edit'): no fill, #323232 text, 10px radius, same dimensions, with a sparkle/stars icon. The lime-on-white with deep-green text is the brand's primary ignition moment.

### AI Prompt Input
**Role:** The signature creation input — a rounded container that invites the user to type a video idea

White (#ffffff) background, 16px radius, 1px border in #e6e6e7, 24px padding. Placeholder text 'Describe or edit a product video' in SwissNow 16px weight 400 in #71737a. A '+' add button and 'Character' dropdown chip sit at the bottom-left in pill form (10px radius). The submit arrow is a circular #96ff1a button (28px circle) at the right. This is the most visually important interactive element on the page.

### Use Case Category Card
**Role:** Video template/use-case tiles in a horizontal scroll row

Portrait-oriented card, 10px radius, full-bleed video/image fill. A small category label (e.g. 'Explainer', 'Product Demo', 'Ad', 'Testimonials', 'Thought Leadership') sits top-left in white text on a subtle dark gradient overlay. Cards are ~220px wide, ~350px tall, arranged in a horizontal row with 16px gaps. The middle card ('Ad') contains a green-accented product mockup with the lime green as a functional UI color.

### Partner Logo Strip
**Role:** Social proof — trusted-by enterprise brand logos

A simple row of monochrome (black) partner logos on white: PENTAX, Ventura Foods, P&G, BBC, TARGET, Meta, Amazon. SwissNow or matched sans-serif, weight 500, ~14-16px equivalents, in #323232. Logos are evenly distributed across the full width, separated by generous whitespace. Section heading above in SwissNow 40px weight 500 in #0c0a09.

### Dark Feature Section Header
**Role:** Full-bleed dark band that introduces a new content group

Background #121212 (Onyx), 80px+ vertical padding. Centered headline in PPEditorialNew 54px weight 400 in #ffffff, tracking -0.05em. This full-width dark band creates a dramatic visual break from the light sections — a structural rhythm device that alternates throughout the page.

### Feature Showcase Card (Asymmetric Grid)
**Role:** Large video/feature cards arranged in an asymmetric 1-large + 2-stacked layout

Left: one large 16:9 card with full-bleed video and a small lime play button (#96ff1a, 32px circle) plus headline in SwissNow 14px weight 500 white. Right: two stacked smaller cards, same treatment. The asymmetric layout (60/40 split) is a signature composition pattern. Cards have 16px radius, no border, content is video-driven with text overlay.

### Pill Navigation Dot
**Role:** Carousel pagination indicator

Horizontal row of 8px circular dots, 8px gap. Active dot is #0c0a09 (10px), inactive dots are #e6e6e7 (8px). Centered below the card carousel. Flanked by small circular left/right arrow buttons (32px, #ffffff fill, 1px #e6e6e7 border).

### Category Tag Chip
**Role:** Small inline labels for use-case categories overlaid on cards

White text on semi-transparent dark background (rgba(0,0,0,0.4) or gradient). SwissNow 12px weight 500, 4px 8px padding, 4px radius. Positioned top-left of media cards. The pill is small, almost a whisper — not the focal point.

### CTA Pill Button (Dark)
**Role:** Secondary action — sign up / start free

Solid #0c0a09 background, white text, 9999px radius (true pill), SwissNow 14px weight 600, 8px 20px padding. Used in the top nav and end-of-section conversion moments. The contrast between this dark pill and the lime CTA creates a clear hierarchy: lime = creation, black = conversion.

## Do's and Don'ts

### Do
- Use #96ff1a only for the primary creation action and active/selected states — it is rationed, not decorative.
- Pair display headlines in PPEditorialNew 54px with -0.05em tracking and 0.88 line-height to maintain the editorial signature.
- Apply 10px radius to buttons, inputs, and small cards; 16px radius to large media cards; 9999px only for true pill buttons.
- Alternate full-bleed #121212 dark bands with #ffffff light sections to create the page's structural rhythm.
- Set body and heading text in #0c0a09 (warm near-black) rather than pure #000 — the slight warmth is part of the brand's editorial character.
- Use #d6ffa6 as a soft wash behind text or icons when extending the lime family without competing with the CTA.
- Keep all body copy and UI labels in SwissNow weight 400-500; reserve weight 600 for button labels and active states.

### Don't
- Don't use #96ff1a for large backgrounds, section fills, or non-action decoration — it must remain a spark, not a wash.
- Don't apply PPEditorialNew to body text, button labels, or any UI smaller than 40px — it is display-only.
- Don't use pure #000 for text — always use #0c0a09 to preserve the warm editorial tone.
- Don't add drop shadows to cards — VEED uses borders and surface contrast for separation, not elevation shadows.
- Don't introduce additional accent colors — the system is monochrome with a single lime ignition; adding a second hue breaks the discipline.
- Don't set letter-spacing to normal or positive on headlines — the tight tracking (-0.025em to -0.05em) is signature.
- Don't mix border radii within the same component group — stay consistent: 10px for compact controls, 16px for media cards.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, primary background
- **Mist** (`#f2f1f0`) — Subtle elevated surface for hero input surrounds and tonal sections
- **Spring Wash** (`#d6ffa6`) — Brand-tinted card backgrounds and feature highlight zones
- **Onyx** (`#121212`) — Full-bleed dark bands for structural rhythm breaks
- **Graphite** (`#292a2`) — Deepest elevated dark surface for nested dark-mode content

## Imagery

Photography-dominant with a creator-casual tone: real people in real environments (home offices, studios, outdoor greenery), shot in warm natural light, candid mid-action poses (eating, sitting on floors, gesturing). Video thumbnails use full-bleed framing with category labels overlaid top-left. Product mockups appear in the AI tool context with the lime green as the interactive accent (keyboard keys, buttons). No illustrations, no abstract 3D, no stock-lifestyle glossiness — the imagery feels shot-by-the-team, not stock-photo. Icons are minimal, used only inside buttons and the input bar.

## Similar Brands

- **Descript** — Same light-canvas + single electric accent + media-heavy creator tool aesthetic with rounded cards and prominent video/portrait imagery
- **Runway** — Same monochrome base with a single vivid color ignition, large media-driven hero cards, and creator-focused minimalism
- **Framer** — Same disciplined palette (white canvas + near-black text + one accent), editorial-style display headings, and pill/rounded component language
- **CapCut** — Same video-creation tool positioning with lime-green accent, dark-mode feature bands, and card-based use-case browsing
- **Linear** — Same clean neo-grotesque UI typography, tight letter-spacing, and pill-button + monochrome discipline with color reserved for primary action
