# HeroKit — Style Reference
> Pale lemon neon on an obsidian void — an editorial poster that happens to be a product page.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

HeroKit uses an obsidian-canvas, neon-punctuation language: pure black surfaces swallow the page, and a single pale lemon yellow #ffffa7 is the entire chromatic vocabulary for action and brand identity. Display type is huge, tight-tracked PP Neue Montreal at 100–120px with negative tracking around -4.8px, giving headlines a compressed, editorial-poster feel that dominates the hero and section openers. The product speaks through 3D bubbly, organic renders rather than photography or flat illustration, floating against the void like jellyfish under spotlight. Components stay light: thin borders, 8px radii, no drop shadows, no gradients — structure is implied through contrast and whitespace rather than elevation. Density is generous; the site breathes because the product visuals do the heavy work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pale Lemon | `#ffffa7` | Primary action fill, brand accent, hero section wash, badge labels — the single chromatic voice of the entire system |
| Electric Yellow | `#fddd05` | Yellow outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Obsidian | `#000000` | Page canvas, card surfaces, text on light fills, hairline dividers, image borders — the base everything floats on |
| Paper | `#ffffff` | Primary text on dark, card surface alt, heading strokes, inverted button text |
| Graphite | `#333333` | Muted heading strokes, de-emphasized outline text, secondary borders on dark |
| Mist | `#999999` | Body subtext, link idle state, tertiary metadata — the only neutral that softens body copy without going silver |
| Steel | `#808080` | Captions, helper text, dense metadata rows, low-emphasis body |

## Typography

### PP Neue Montreal — Primary face across body, navigation, subheadings, and display. The custom geometric grotesque carries the entire brand voice: tight tracking at display sizes (up to -4.8px at 120px) compresses headlines into editorial-poster blocks, while relaxed tracking at body keeps 16px reading clean. Single weight 400 used throughout — weight does not differentiate hierarchy; size and color do.
- **Substitute:** Inter, General Sans, Satoshi
- **Weights:** 400
- **Sizes:** 16px, 20px, 30px, 32px, 50px, 120px, 144px
- **Line height:** 1.0–1.4
- **Letter spacing:** -0.0100em at body, -0.0200em at subheading/heading, -0.0400em at display

### PP Neue Montreal Medium — Navigation and select body emphasis at the 16px size — the only place a medium weight appears, used to give nav links a subtle lift over body text without breaking the single-weight visual rhythm
- **Substitute:** Inter Medium, General Sans Medium
- **Weights:** 500
- **Sizes:** 16px
- **Line height:** 1.2
- **Letter spacing:** -0.0100em

### ABC Monument Grotesk — Alternate display face for the largest hero statement — a wider, more architectural grotesque that provides a second editorial voice at maximum scale without competing with PP Neue Montreal elsewhere
- **Substitute:** Druk Wide, NB Architekt
- **Weights:** 400
- **Sizes:** 120px
- **Line height:** 1.0
- **Letter spacing:** -0.0400em

### System Sans-Serif — Micro labels, copyright, legal footnotes — the only size at which the system stack appears, keeping fine print neutral and invisible
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body-sm | — | — | 16px | 1.4 | -0.16px |
| body | — | — | 20px | 1.3 | -0.2px |
| subheading | — | — | 30px | 1.2 | -0.6px |
| heading | — | — | 32px | 1.2 | -0.64px |
| heading-lg | — | — | 50px | 1.08 | -1px |
| display | — | — | 120px | 1 | -4.8px |
| display-lg | — | — | 144px | 1 | -4.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **tags:** 8px
- **cards:** 8px
- **images:** 8px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary Filled Button (Pale Lemon)
**Role:** Default action for sign-up, CTA on the hero, and product entry points

Background #ffffa7, text #000000, 8px radius, 14px 20px padding, PP Neue Montreal 16px weight 400, letter-spacing -0.16px. No border. The Pale Lemon fill against Obsidian creates the system's only color contrast — this button should appear sparingly, one per viewport maximum.

### Primary Filled Button (Electric Yellow)
**Role:** High-emphasis CTA in the navigation bar (Try for free)

Background #fddd05, text #000000, 8px radius, 8px 16px padding, 16px weight 400. Sits in the top-right nav. Slightly smaller and more saturated than the Pale Lemon variant — this is the always-visible conversion entry point.

### Ghost Navigation Link
**Role:** Nav items: How it works, Pricing, Login

No background, text #ffffff, PP Neue Montreal Medium 16px, 14px padding vertical. Underline absent. Hover state inverts to Pale Lemon fill with #000000 text.

### Outlined Ghost Button
**Role:** Secondary action, e.g. 'Get started for free' on dark sections

Background transparent, border 1px #ffffff, text #ffffff, 8px radius, 8px 16px padding. Used when a Pale Lemon filled button would steal too much attention on a dark section.

### Product Gallery Card
**Role:** Showcase individual 3D hero assets in the gallery grid

Background #000000, 1px border #333333, 8px radius, 20px padding. Image fills the card body edge-to-edge. Footer row contains a Pale Lemon status dot, small 'HERO' label in #ffffff, and an asset name in #999999. Card is inert — no hover elevation, no scale.

### Hero Section
**Role:** Above-the-fold headline + visual introduction

Full-bleed Pale Lemon #ffffa7 background. Display headline at 120px PP Neue Montreal, #000000, line-height 1.0, letter-spacing -4.8px. Subhead at 20px weight 400 #000000 max-width ~480px. CTA button group below. Right side occupied by a floating 3D render (warm amber bubbles) that bleeds off the canvas edges. 80px section padding.

### Browser Frame Mockup
**Role:** Display product screenshots inside a stylized browser chrome

Black 1px border, 8px radius, dark interior #0a0a0a. Top bar contains three traffic-light dots in #808080. Content area fills with a product screenshot or animation. The frame sits centered on the Obsidian canvas with generous 80–120px margin.

### Logo Sticker Strip
**Role:** Social proof — platforms HeroKit integrates with

Single horizontal row of platform logos (Wix, Squarespace, WordPress, Framer, Webflow) rendered in white on Obsidian. Small caption 'Works with your favorite site builder' at 12px above. No cards, no borders, no hover — logos float directly on the canvas.

### Status Badge Dot
**Role:** Inline indicator on cards and metadata rows

6px filled circle in Pale Lemon #ffffa7 paired with 12px uppercase label in #ffffff. No border, no padding around the dot. Signals 'live' or 'new' state on product entries.

### Asset Tag (HERO label)
**Role:** Category label on each product gallery card

12px PP Neue Montreal weight 400 uppercase, text #ffffff, bullet separator between dot and label. Appears in the footer of every Product Gallery Card.

### Sticky Top Navigation
**Role:** Persistent site-wide header

Height ~56px, background transparent or Obsidian #000000 on scroll, full-bleed. Left: HeroKit wordmark in white with small lemon-yellow bolt icon. Right: three ghost nav links + Electric Yellow 'Try for free' button, 10px gap between elements. No drop shadow, no border bottom.

### 3D Product Render
**Role:** Primary visual content — the product IS the imagery

Tight crop of a 3D asset (bubbles, blobs, abstract organic forms) rendered in warm amber/peach or saturated single-hue palettes. Always contained within 8px radius frames on gallery cards, or full-bleed in hero/section openers. No lifestyle context, no human subjects — the object is the hero.

## Do's and Don'ts

### Do
- Use Pale Lemon #ffffa7 as the only chromatic action color — one filled button per viewport, maximum
- Set display headlines at 100–120px with letter-spacing -4.8px and line-height 1.0 for editorial compression
- Apply 8px radius to every interactive element and card — never mix in larger curves
- Keep the canvas pure #000000 for all non-hero sections; reserve Pale Lemon background for at most one full-bleed section per page
- Differentiate hierarchy through size and color, not weight — PP Neue Montreal ships at 400 only
- Let 3D renders bleed off canvas edges in hero/section openers; contain them in 8px-radius cards inside the gallery
- Maintain 80px section gaps and 10px element gaps; the generous negative space is what makes the minimal palette feel premium

### Don't
- Never introduce a second chromatic accent — the brand speaks in lemon yellow, obsidian, and paper only
- Never use drop shadows or scale-on-hover to imply elevation; use 1px #333333 borders or color contrast instead
- Never set body type below 16px or above 20px — the scale jumps from 20px body to 30px subheading deliberately
- Never mix multiple border radii; 8px is the only value across buttons, cards, tags, and inputs
- Never place Pale Lemon on a light section background — the contrast only works against Obsidian #000000
- Never add gradients to UI surfaces; the product sells flat 3D renders, the chrome must stay matte
- Never center-align body copy or nav items; the system is left-anchored, editorial-style

## Elevation

- **Product Gallery Card:** `none — distinguished by 1px #333333 border only`
- **Navigation Bar:** `none — flat against canvas`
- **Hero Section:** `none — Pale Lemon background defines its own plane`
- **Browser Frame Mockup:** `none — 1px border only`

## Surfaces

- **Obsidian Void** (`#000000`) — Page canvas, product gallery backdrop, full-bleed sections
- **Card Surface** (`#000000`) — Product cards and feature tiles — distinguished from canvas by 1px border, not by a lighter fill
- **Inverted Surface** (`#ffffff`) — Rare light sections, footer blocks, inverted control backgrounds
- **Pale Lemon Wash** (`#ffffa7`) — Hero section background — a single full-bleed chromatic moment that signals the brand's only color

## Imagery

The visual language is entirely 3D-rendered abstract forms: warm amber bubble clusters, metallic sculptural blobs, kinetic typographic shapes, and fractal gradient washes. These are the product — the site sells 3D hero assets, so every illustration is a self-referential showcase. Treatment is tight-crop, contained within 8px radius frames on gallery cards, or full-bleed in hero/section openers with forms bleeding off the canvas edge. No photography, no flat illustration, no human subjects. Icon style is minimal: small monogram-style logos for partner platforms, a single brand bolt icon, and tiny status dots — all mono, no decoration.

## Layout

Full-bleed sections that alternate between Obsidian #000000 and rare Pale Lemon #ffffa7 washes. The hero is a split layout: headline+CTA anchored left at max-width 480px, floating 3D render bleeding off the right edge. Below the hero, sections stack vertically with 80px gaps, content centered at max-width 1200px. Product gallery is a 3-column grid of cards with 10px gutters, allowing the dark cards to create a subtle grid pattern against the canvas. Navigation is a single sticky top bar, minimal and transparent. The page rhythm is: bold hero → trust strip → product showcase → feature deep-dives → CTA close. No sidebar, no mega-menu, no secondary nav.

## Similar Brands

- **Spline** — Same Obsidian-canvas + single neon accent approach, 3D product renders as primary visual content, tight geometric display type
- **Linear** — Same near-monochrome dark palette with one chromatic punctuation color, editorial-poster display headlines, zero drop shadows
- **Vercel** — Same black-canvas minimalism with sparse bright accent, thin borders over elevation, geometric grotesque typography
- **Stripe** — Same tight-tracked large display type and generous negative space; both treat whitespace as a primary design material
- **Framer** — Same product-as-imagery ethos where 3D renders and animated visuals float on a dark canvas with minimal chrome
