# Public — Style Reference
> monochrome editorial on cold marble — a near-monochrome canvas, a serif at weight 300, one violet accent doing all the chromatic work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Public reads like a financial broadsheet rendered in UI: a near-monochrome canvas of cool grays and bone white, with one vivid violet used sparingly as a linking accent. The signature is Denton, a custom serif held at an almost whispered weight 300 for display headlines — a deliberate inversion of fintech convention that swaps the usual bold sans for something editorial and considered. Inter carries every functional surface, keeping the interface legible and quiet. Surfaces are flat and unembellished, depth is earned through the occasional 16px-radius card or a soft 10px shadow rather than gradients or heavy elevation. The only true color is #0027b3 violet, reserved for links and the rare inline accent tag; everything else is ink, paper, and shadow. Buttons are long pill shapes (100px radius) — the primary action is a matte black fill, secondaries are ghost outlines. Generous vertical breathing room between sections and a centered editorial layout reinforce the sense that this is a place for reading, not scanning.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Card surfaces, elevated panels, inverted button fills |
| Marble Canvas | `#f3f6f9` | Page background — the dominant surface behind every section |
| Bone Mist | `#e9edf3` | Hairline borders, subtle dividers, card outlines on canvas |
| Fog Line | `#dce2ea` | Secondary borders, input outlines, table dividers |
| Slate Pencil | `#a8b4bf` | Muted helper text, inactive tags, disabled labels |
| Steel | `#516880` | Body text on canvas, secondary borders, the workhorse neutral |
| Lampblack | `#1b2128` | Primary text, nav ink, strong borders — the deepest reading tone |
| Graphite | `#262626` | Dark surfaces, nav bar fills, inverted card backgrounds |
| Carbon Black | `#000000` | Primary button fill, hardest borders, maximum-weight text |
| Violet Ink | `#0027b3` | Inline text links, link borders, the sole chromatic accent — a deep electric violet that makes the rare colored element read as switched on |
| Sky Wash | `#95d0ff` | Decorative illustration fills, subtle highlight washes, icon tints |

## Typography

### Denton — Display headlines and hero text — the signature choice. Held at weight 300 (not 600-700), this custom serif trades fintech's usual shouting for an editorial whisper. Use at 80px for the primary hero, 48-52px for section openers. Substitute with a high-contrast light serif like 'GT Sectra Display' or 'Tiempos Headline Light'.
- **Substitute:** GT Sectra Display Light or Tiempos Headline Light
- **Weights:** 300
- **Sizes:** 48px, 52px, 80px
- **Line height:** 1.00, 1.11, 1.12, 1.13

### Invest Pro — Mid-scale UI: subheadings, card titles, feature labels, button text, nav items. Weight 500 for emphasis, 400 for supporting copy. This custom sans bridges Denton's editorial headlines and Inter's functional body.
- **Substitute:** Inter or Söhne
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 20px, 24px, 32px
- **Line height:** 1.00, 1.13, 1.14, 1.15, 1.17, 1.20, 1.28, 1.29, 1.31, 1.37, 1.38, 1.50

### Inter — Body copy, captions, table data, form fields, badges, all functional UI. Weight 400 for body, 600 for inline emphasis and small labels. Sized down to 10-11px for dense data contexts.
- **Substitute:** Inter
- **Weights:** 400, 600
- **Sizes:** 10px, 11px, 12px, 14px, 16px
- **Line height:** 1.00, 1.15, 1.42, 1.43, 1.50, 1.54, 1.60, 2.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | — |
| body | — | — | 14px | 1.54 | — |
| heading-sm | — | — | 20px | 1.2 | — |
| heading | — | — | 24px | 1.2 | — |
| heading-lg | — | — | 32px | 1.15 | — |
| display | — | — | 48px | 1.12 | — |
| display-lg | — | — | 80px | 1.05 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 4px
- **cards:** 16px
- **small:** 4px
- **inputs:** 4px
- **buttons:** 100px

## Components

### Header Nav Bar
**Role:** Top-level navigation

Full-width white bar on #f3f6f9 canvas. Logo (left), centered nav items with chevron dropdowns (Products, Agents, Tools & Resources, Company), auth buttons (right). Height ~64px. Nav text in Inter 14px weight 400 in #1b2128. No background fill — the nav sits directly on the canvas.

### Primary Filled Button
**Role:** Main call-to-action

Matte black pill (#000000 fill, #ffffff text). Border-radius 100px. Padding 12px 24px. Text in Inter 14px weight 600. Carries the dual-tone glow shadow: rgba(255,196,250,0.25) 8px -8px 20px and rgba(56,205,255,0.25) -8px 8px 30px. This is the only element with a colorful shadow in the system.

### Ghost Outlined Button
**Role:** Secondary action

White fill with #000000 1.5px border. Border-radius 100px. Text in #000000, Inter 14px weight 600. Same padding as primary. No shadow. Used for Log in, Sign up, and other non-primary actions.

### Inline Text Link
**Role:** Navigational link within body copy

Text in #0027b3 violet, Inter 14px weight 400. Underlined by default. This is the only chromatic text in the system — its rarity makes it instantly scannable.

### Yield Tag
**Role:** Inline data callout (e.g. "5.88% yield*")

Small pill or inline badge with #000000 text. Border-radius 4px. Appears inline within flowing text lists of asset categories. No background fill — just bold weight text that breaks from the surrounding regular weight.

### Feature Pill Row
**Role:** Highlight tags below hero headline

Horizontal row of small icon+text pairs (e.g. Multi-asset investing, AI Agents). Inter 14px weight 400 in #516880. Icons are small, 16px, monochromatic. Separated by even spacing. No background or border — just inline text with a leading icon.

### Product Showcase Card
**Role:** Hero visual: desktop and mobile app mockup

Product screenshots displayed at large scale. No card container — the screenshots sit directly on canvas. Desktop view is ~800px wide, mobile phone overlaps the right edge, angled slightly. The overlap creates depth without a shadow.

### Asset Category Flow List
**Role:** Navigational index of all available asset types

Centered text list with categories separated by bullet dots (·). Inter or Invest Pro at 20-24px weight 400 in #000000. Categories include Stocks, Bonds, Treasuries, Options, Crypto, ETFs, and accounts. Inline yield tags (5.88% yield*, 3.30% APY*, 1% MATCH) break the line with bold weight.

### Agent Feature Card
**Role:** Panel displaying agent configuration details

White card on canvas. Border-radius 16px. Padding 16-24px. Soft shadow rgba(0,0,0,0.08) 0px 1px 10px. Two-column layout: checkbox list of active agents on the left, agent detail panel on the right. Inter for all text, #000000 for active states, #a8b4bf for inactive.

### Feature Card
**Role:** Section content card (Market briefing, Key moments)

White card, border-radius 16px, padding 24px. Soft shadow. Title in Invest Pro 20-24px weight 500. Description in Inter 14px weight 400 in #516880. Learn more link in #0027b3 violet.

### Cookie Consent Modal
**Role:** GDPR/privacy notification

Small white card in bottom-left corner. Border-radius 4px. Thin shadow. Body text in Inter 12-14px. Blue 'Got it' button (#0027b3 fill, white text, 4px radius). Close X in top-right corner.

### Floating Promo Banner
**Role:** Bottom-right promotional notification

Dark card (#262626 fill) with white text. Product thumbnail on left side showing '0% commissions'. Inter 12-14px text. Small close X. Border-radius 4px. Sits fixed at viewport bottom-right.

## Do's and Don'ts

### Do
- Use Denton at weight 300 exclusively for display headlines 48px+ — the whisper-weight serif is the brand's most recognizable element
- Keep the palette 95% monochrome; #0027b3 violet appears only on text links and the rare inline accent
- Use 100px border-radius for all buttons — every interactive element should read as a pill
- Set section gaps at 64px minimum; the editorial spaciousness is non-negotiable
- Use 16px border-radius for cards and content panels, 4px for tags and small UI elements
- Apply the dual-tone glow shadow only to the primary CTA — it is the one place color may exist as elevation
- Use Invest Pro for mid-scale headings (20-32px) and Inter for everything 16px and below

### Don't
- Never use Denton at weight 400+ — the light whisper is the entire point
- Do not introduce additional accent colors; the system is monochrome plus one violet
- Do not use 8px or 12px radii on buttons — only 100px pills are buttons
- Avoid heavy shadows; depth comes from the canvas-to-card contrast, not from elevation
- Do not use sans-serif fonts for display text 48px+ — the serif is the signature
- Do not fill buttons with #0027b3 violet; the primary CTA is always matte black
- Do not center-align body paragraphs; only headlines and short labels get centered treatment
- Avoid decorative gradients — the system is flat, not dimensional

## Elevation

- **Card:** `rgba(0, 0, 0, 0.08) 0px 1px 10px 0px`
- **Elevated Card:** `rgba(0, 0, 0, 0.06) 0px 24px 24px 0px`
- **Primary Button:** `rgba(255, 196, 250, 0.25) 8px -8px 20px 0px, rgba(56, 205, 255, 0.25) -8px 8px 30px 0px`

## Surfaces

- **Marble Canvas** (`#f3f6f9`) — Page background — the base plane behind all content
- **Paper White** (`#ffffff`) — Card surfaces, elevated content blocks, product screenshots
- **Graphite** (`#262626`) — Dark cards, nav fills, inverted sections
- **Carbon Black** (`#000000`) — Primary action buttons, maximum-contrast elements

## Imagery

Imagery is limited to product UI mockups: dashboard screenshots and mobile app views displayed on the hero. These are clean, light-themed interface renders shown at large scale with a slight overlap between desktop and mobile views to create depth. No photography, no lifestyle imagery, no illustrations beyond the product showcase. Icons are small, monochromatic line-style glyphs (16px) used inline within text. The only decorative color outside UI mockups is the subtle sky-blue (#95d0ff) used for occasional highlight washes. The visual approach is "show the product, don't decorate it."

## Layout

Max-width 1200px centered for content blocks, with the nav bar and hero extending full-bleed. The hero is a centered headline + subtext + CTA stacked vertically, followed by a large product showcase that breaks the centered column for visual impact. Below the hero, a flowing centered text list of asset categories acts as a navigational index. Further sections alternate between centered text blocks and two-column feature layouts (text left, visual right or centered card). Card grids use 2-3 columns with 24px gaps. Vertical rhythm is generous — 64px minimum between sections. Navigation is a minimal top bar with dropdown menus. Floating elements (cookie consent, promo banner) anchor to viewport corners.

## Similar Brands

- **Robinhood** — Similar investing/brokerage domain with clean financial product UI, though Public is more editorial and monochrome while Robinhood is more colorful and app-focused
- **Wealthfront** — Clean monochrome financial product surface with strong typographic hierarchy and restrained color usage
- **Stripe** — Shares the monochrome-with-one-accent-color philosophy, generous whitespace, and pill-shaped buttons for primary actions
- **The New York Times (digital)** — The Denton serif at weight 300 for display headlines mirrors the editorial newspaper typography tradition — broadsheet DNA in a product interface
- **Linear** — Compact density, monochromatic palette, sharp typographic hierarchy, and the philosophy that restraint communicates quality
