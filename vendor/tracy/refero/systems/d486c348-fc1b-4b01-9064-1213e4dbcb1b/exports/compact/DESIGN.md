# Doo — Style Reference
> pastel sticky notes drifting on white linen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Doo reads as an empty notebook waiting to be filled: nearly all-white canvas, cool-gray hairline borders, charcoal type, and a single deep-indigo CTA acting as the page's only saturated punctuation. The visual system is deliberately monochrome on the surface while the product itself is colorful — colored category tags, pastel task cards, and a tri-color logo carry the warmth. Layout is centered, symmetrical, and Apple-like in its discipline: a single headline, one button, then product imagery doing all the visual work. Components are pill-shaped controls with generous radius, text-first hierarchy, and almost no decoration — no shadows, no gradients, no background tints behind content. The mood is calm, organized, and unhurried.

## Colors

| Name | Value | Role |
|------|-------|------|
| Indigo Pulse | `#3b3996` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Slate | `#6e6d7a` | Hairline borders, dividers, secondary text, list separators — the structural gray that quietly defines the page grid |
| Graphite | `#383938` | Navigation text, heading text, dark UI elements — the primary readable dark on white |
| Ink | `#111111` | Headline color, strongest body emphasis, near-black for maximum contrast on light surfaces |
| Paper | `#ffffff` | Page background, card surfaces, text on dark/indigo fills — the dominant canvas |
| Mist | `#edeef3` | Elevated panels, subtle background washes, light borders — the cool-tinted off-white that lifts content above the page |
| Cloud | `#f7f7f7` | Secondary card surfaces, quiet content panels |
| Mint Whisper | `#c3f5dd` | Task category tag accent (product UI), logo green dot — pastel annotation, not interface chrome |
| Lavender Drift | `#d1cafa` | Task category tag accent (product UI), logo blue dot — pastel annotation |

## Typography

### Avenir Next — Sole typeface across the entire system — nav, body, headings, display. Avenir Next's geometric humanism gives the page a calm, friendly, Apple-adjacent feel. Weight 400 carries everything; weight 600 is reserved for navigation and small emphases. Display headlines at 65px with negative tracking create a compressed, confident presence rather than shouting.
- **Substitute:** Nunito Sans, Quicksand, or system-ui
- **Weights:** 400, 600
- **Sizes:** 13, 16, 17, 20, 29, 39, 65
- **Line height:** 1.0, 1.2, 1.8
- **Letter spacing:** -0.04em for display/headings (29px+), 0.1em for small caps/labels (13px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | 1.3px |
| body-sm | — | — | 16px | 1.8 | — |
| subheading | — | — | 20px | 1.2 | — |
| heading-sm | — | — | 29px | 1.2 | -1.16px |
| heading | — | — | 39px | 1.2 | -1.56px |
| display | — | — | 65px | 1 | -2.6px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 100-140px
- **Card padding:** 30px
- **Element gap:** 20-26px

### Border Radius

- **tags:** 20px
- **cards:** 30px
- **buttons:** 39px

## Components

### Primary CTA Button
**Role:** Single conversion action per screen

Pill-shaped (39px radius), filled with Indigo Pulse (#3b3996), white text in Avenir Next 600 at 16px. Horizontal padding 26px, vertical padding 13px. No shadow, no border. Width hugs content. The only colored filled element on the marketing page.

### Navigation Bar
**Role:** Top-level site navigation

Full-width, height ~50px, transparent over white background. Logo (tri-color dots) left-aligned, nav links right-aligned. Links in Graphite (#383938) at 13px Avenir Next 600, separated by 26-39px horizontal gaps. Active state uses bold/600 weight, no underline, no color change.

### Hero Section
**Role:** Above-the-fold value proposition

Centered single column, generous vertical padding (100-140px top/bottom). Display headline at 65px Avenir Next 400 in Ink (#111111), tracking -2.6px. Subhead at 20px in Slate (#6e6d7a). Single Primary CTA below with 33px margin-top. No background imagery above the fold.

### Product Showcase Frame
**Role:** Multi-device product display

Large product screenshot or device render, centered, near-full-bleed within the 1200px container. No frame chrome, no device bezels added. Sits on white with generous breathing room above and below.

### Task Card (Product UI)
**Role:** Individual task/reminder item within the app

White card, 30px radius, 20px internal padding. Left edge has a small colored category tag (16-20px wide, pill-shaped, in Mint Whisper, Lavender Drift, yellow, or brown). Task title in Avenir Next 400 at 17px Ink (#111111). Due date in 13px Slate (#6e6d7a). Optional trailing action icon in Indigo Pulse.

### Category Color Tag
**Role:** Task categorization indicator

Small pill or rounded square (20px radius) in a pastel color (Mint, Lavender, yellow, brown). Functions as a color-coded identifier on the left of task cards. Never used as a button or interactive element — purely decorative categorization.

### Press Logo Strip
**Role:** Social proof / press mentions

Three-column grid of publication logos (TNW, WIRED, BuzzFeed style) in black/Ink (#111111) on white, evenly spaced. Below each logo, a short pull-quote in 13-16px Slate (#6e6d7a) Avenir Next 400. Logos are monochrome, no color treatment.

### Feature Section
**Role:** Product capability showcase with large headline

Centered or single-column layout. Eyebrow label in 13px Avenir Next 600 with 0.1em tracking (small caps style) in Slate (#6e6d7a). Headline at 39px Avenir Next 400 in Ink. Supporting text at 17px in Slate. Large product UI screenshot below with 33px gap.

### Logo Mark
**Role:** Brand identity anchor

Three small overlapping circles, left-to-right: Mint Whisper (#c3f5dd), Lavender Drift (#d1cafa), and a mid-blue. Each circle ~12px diameter, slight overlap. Sits top-left of the page in the nav.

### Section Divider
**Role:** Visual separation between content blocks

Full-width hairline (1px) in Slate (#6e6d7a) at very low opacity, or generous whitespace alone. No decorative dividers, no gradient fades.

## Do's and Don'ts

### Do
- Use Indigo Pulse (#3b3996) for exactly one CTA per screen — it is the only saturated fill color on the marketing surface and loses power if overused
- Set all buttons and links to 39px border-radius for the pill shape; set all cards to 30px radius — these two radii are the system's only curves
- Use Avenir Next 400 for all display and body text; reserve weight 600 for nav items and small labels only
- Apply -0.04em letter-spacing to any text 29px and above; use 0.1em tracking on 13px labels for a small-caps eyebrow effect
- Achieve separation with whitespace and Slate (#6e6d7a) hairlines — never with drop shadows
- Keep the marketing surface monochrome; let the product UI's pastel category tags carry all color in screenshots
- Center-align hero and feature headlines; use max-width 1200px container for all content blocks

### Don't
- Don't introduce additional chromatic UI colors on the marketing page — Indigo Pulse is the only saturated fill permitted
- Don't use drop shadows, gradients, or glow effects — the design is deliberately flat and paper-like
- Don't use any border-radius value other than 30px (cards) or 39px (buttons/links/pills)
- Don't use weight 700 or 800 — Avenir Next caps at 600 in this system, and the whisper-weight 400 headlines are the signature
- Don't add background colors to content sections — the page stays Paper white; use Mist (#edeef3) only for specific elevated panels
- Don't use icons or decorative graphics on the marketing page — product photography and the tri-dot logo are the only visual elements
- Don't use tight column grids; the layout is centered and spacious, not information-dense

## Elevation

The design deliberately avoids drop shadows. All separation between elements is achieved through whitespace, hairline borders in Slate (#6e6d7a), and subtle background tints. When depth is needed, it is tonal, not cast — a card in Cloud (#f7f7f7) on a Paper (#ffffff) page, or a Mist (#edeef3) panel lifting above white. The only visual weight comes from type size, not elevation. This creates the 'paper notebook' feel — flat, printed, calm.

## Surfaces

- **Paper** (`#ffffff`) — Page background — dominant canvas
- **Cloud** (`#f7f7f7`) — Quiet card/panel surfaces, nearly invisible elevation
- **Mist** (`#edeef3`) — Elevated panels, light tinted sections, hairline border base

## Imagery

Product photography is the sole visual content: large device renders (iMac, iPhone, Apple Watch) showing the Doo app, and close-up product UI screenshots of task cards. No lifestyle photography, no abstract graphics, no illustration. Device shots are clean, unstyled, and full-bleed within the content container. The product UI itself contains the only color: pastel category tags in mint, lavender, yellow, and brown on white cards. The mood is 'app store hero shot' — product-first, context-free, with the device as the hero.

## Layout

Centered single-column layout with a 1200px max-width container. The hero is a vertically centered text block (headline → subhead → CTA) with generous padding (100-140px). Below the fold, a full-bleed product showcase spans the container width. A press logo section follows in a 3-column grid. Feature sections alternate between centered text-then-screenshot blocks and large product UI close-ups. Navigation is a minimal top bar with logo left and links right, transparent over white. The rhythm is: generous whitespace, centered headlines, single CTA, product image, repeat. No sidebar, no two-column asymmetric layouts, no dark sections.

## Similar Brands

- **Things (Cultured Code)** — Same monochrome marketing surface with product-as-hero photography, centered headlines, and a single restrained CTA — both projects sell calm through visual quiet
- **Notion** — Similar centered single-column hero, generous whitespace, and product screenshots doing the visual work rather than abstract illustration
- **Hey (Basecamp)** — Same large-weight-400 display headlines, single brand accent color against an otherwise achromatic page, and pill-shaped CTA buttons
- **Bear (notes app)** — Same paper-white canvas with cool-gray borders, pastel product UI accent colors, and a disciplined typographic hierarchy with no decorative shadows
