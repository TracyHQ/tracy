# wix.com — Style Reference
> Daylight gallery wall with electric blue signposts

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Wix's visual system reads as a spacious, air-filled workspace on a bright white canvas, where oversized headlines in the custom Madefor Display typeface set a confident but airy tone. The palette is overwhelmingly achromatic — black text, white surfaces, hairline gray borders — with a single saturated electric blue (#166aea) reserved for primary action buttons and a secondary black-filled pill as the alternative action. Color appears as intentional punctuation: a lime-green surface wash, a soft lavender gradient, a yellow highlight, a violet accent — each used sparingly to mark sections, not to decorate. Components are flat, rounded, and lightweight: pill buttons at 50px radius, cards at 20px, images at 8.9px, minimal shadows. The grid breathes — generous section gaps near 80px, centered hero compositions, alternating product mockups that feel like editorial spreads rather than SaaS screenshots.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pure Canvas | `#ffffff` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Slate Mist | `#f1f5f9` | Elevated surface tier, input backgrounds, subtle section panels |
| Carbon Ink | `#000000` | Primary text, icon strokes, borders, dark button fills — the typographic and structural black |
| Graphite | `#1c1d21` | Headline text alternative — slightly softened black for display type where pure black feels too clinical |
| Ash Border | `#d0d0d0` | Hairline dividers, card borders, structural separators |
| Fog Border | `#e8e6e6` | Subtle borders on less prominent elements |
| Electric Blue | `#166aea` | Primary action button fill, selected nav indicator, link accents — the only saturated action color in the system |
| Deep Violet | `#101585` | Brand violet for headings, link underlines, decorative accent — anchors the identity when blue is too functional |
| Indigo Pulse | `#2c34af` | Gradient endpoint, section heading accent — lighter companion to Deep Violet for layered brand moments |
| Lime Highlight | `#dff994` | Surface wash, background tints, decorative highlight zones — injects energy into otherwise monochrome sections |
| Lemon Note | `#fdf4a1` | Subtle highlight wash on text and borders, callout markers — warm counterpoint to cool brand colors |
| Lavender Mist | `#bfc8e8` | Soft section background gradient start, card shadow tint — atmospheric color for gradient washes |
| Input Blue | `#538ab6` | Input border on focus/active state — cool desaturated blue for form interactivity |

## Typography

### Arial — System fallback for icon labels, micro-UI tags, and utility text at 10–13px. Functions as the safety net for extremely small UI where custom fonts may not load.
- **Substitute:** system-ui or Arial
- **Weights:** 400
- **Sizes:** 10px, 13px
- **Line height:** 1.20

### madefor-display — All display headlines from 21px sub-headings up to 184px hero text. Geometric, slightly condensed sans-serif with wide apertures. The negative letter-spacing (-0.01em to -0.03em) tightens as size grows, creating a distinctive compressed display look at 82–184px. Substantial line-height range (0.85 at 184px) lets oversized type sit close together — a signature of editorial display use.
- **Substitute:** Inter, DM Sans, or Space Grotesk
- **Weights:** 400
- **Sizes:** 10px, 13px, 14px, 16px, 21px, 24px, 31px, 48px, 82px, 89px, 104px, 184px
- **Line height:** 0.85, 1.00, 1.10, 1.20, 1.30, 1.40, 1.48, 1.50, 1.60
- **Letter spacing:** -0.03em at 82px+, -0.02em at 31–48px, -0.01em at 21–24px

### madefor-text — Body text, nav links, list items, input fields, descriptions. Slightly looser than display at -0.01em. Generous line-heights (1.5–1.71) give body copy an airy, readable cadence. Pairs with display variant to create typographic contrast without switching families.
- **Substitute:** Inter, IBM Plex Sans, or Noto Sans
- **Weights:** 400
- **Sizes:** 10px, 13px, 14px, 15px, 16px, 18px, 21px, 25px
- **Line height:** 1.29, 1.30, 1.50, 1.60, 1.71
- **Letter spacing:** -0.0100em

### madefor-text-mediumbold — Semi-emphasis body and small headings (12–24px). Functions as the medium weight for nav, subheadings, and labeled sections where extra weight is needed without going to a full bold.
- **Substitute:** Inter Medium, or DM Sans Medium
- **Weights:** 400
- **Sizes:** 12px, 14px, 15px, 16px, 18px, 20px, 21px, 23px, 24px
- **Line height:** 1.10, 1.20, 1.30, 1.50, 1.60, 1.71
- **Letter spacing:** -0.0100em

### wix-madefor-display-v2 — Alternate display variant for section headings at 53px and body emphasis at 20–21px. Provides a slightly different geometry for variety within sections.
- **Substitute:** Inter or Space Grotesk
- **Weights:** 400, 500
- **Sizes:** 20px, 21px, 53px
- **Line height:** 1.00, 1.10, 1.20

### wix-madefor-text-v2 — Secondary text body for links and supporting copy where the primary text variant is too dense.
- **Substitute:** Inter or DM Sans
- **Weights:** 400
- **Sizes:** 15px, 21px
- **Line height:** 1.30, 1.35, 1.50

### madefor-text-bold — madefor-text-bold — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.6

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.2 | -0.13px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 21px | 1.3 | -0.21px |
| heading-sm | — | — | 31px | 1.2 | -0.62px |
| heading | — | — | 48px | 1.1 | -0.96px |
| heading-lg | — | — | 82px | 1 | -2.46px |
| display | — | — | 104px | 0.95 | -3.12px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 20px
- **cards:** 20px
- **images:** 8.9px
- **buttons:** 50px
- **navPills:** 50px
- **buttonsAlt:** 20px
- **cardsSmall:** 8.9px

## Components

### Primary Action Button
**Role:** Main CTA (Get Started, Sign Up)

Filled electric blue (#166aea) with white text. Pill shape at 50px border-radius. Padding 12px right/left, Madefor Text 16px. Single chromatic action in the system — use sparingly, one per section maximum.

### Secondary Action Button
**Role:** Alternative CTA when primary is unavailable

Filled black (#000000) with white text. Same 50px pill radius, 12px horizontal padding, Madefor Text 16px. Sits next to or replaces the blue primary on dark-background sections.

### Ghost Button
**Role:** Tertiary action, navigation controls

Transparent background with 1px border (#000000 or contextual color), Madefor Text 15–16px. 50px pill radius. Used for less important actions or on sections with strong colored backgrounds.

### Rounded Button (20px)
**Role:** Compact action for cards and tight layouts

20px border-radius variant of the action buttons. Same color system (blue/black/ghost) but with a softer rectangular feel. Common in card overlays and inline actions.

### Template Preview Card
**Role:** Showcase website templates in grid

20px border-radius, 8.9px inner image radius, no visible border, soft shadow. Image fills most of card with a small text label below (eCommerce →, Portfolio →). Arranged in 4-column grid on desktop.

### Product Mockup Card
**Role:** Display product UI screenshots in hero/sections

8.9px border-radius for sharp tech feel, subtle border or no border, sits directly on canvas. Often shows browser chrome (URL bar, page controls) to feel like a real product capture.

### Navigation Bar
**Role:** Top-level site navigation

Transparent or white background, Wix logo left, nav items center (Product, Solutions, Resources, Pricing), utility items right (Login, Get Started). Clean horizontal layout with dropdown indicators (▾). Get Started is a blue pill button, Login is a ghost text link.

### Input Field
**Role:** Text input for prompts, search, forms

White or Slate Mist (#f1f5f9) background, 1px border transitioning to #538ab6 on focus, Madefor Text 15–16px. 8–12px border-radius. Placeholder text in light gray. Rounded but not pill-shaped.

### Hero Headline Block
**Role:** Page-level H1 with subtitle

Centered or left-aligned Madefor Display 82–104px, line-height 0.95–1.0, letter-spacing -2.46 to -3.12px. Subtitle in Madefor Text 18–21px below. CTA button positioned below subtitle with 24–32px gap.

### Section Heading
**Role:** H2 for content sections

Madefor Display 48px, line-height 1.1, letter-spacing -0.96px. Left-aligned with supporting paragraph to the right or below. Sets a quieter tone than hero display.

### Gradient Section Background
**Role:** Atmospheric section differentiation

Vertical or angled gradient from Lavender Mist (#bfc8e8) fading to white. Applied as full-bleed background to alternate sections, creating visual rhythm without hard dividers.

### Badge / Tag
**Role:** Category labels, status indicators

Small pill or 20px-radius tag with optional colored fill. Madefor Text 13–14px. Used for template categories, feature tags, and metadata. Often appears as ghost (border only) rather than filled.

### Side Panel (AI Assistant)
**Role:** Contextual tools panel (Aria AI)

White card on right side of screen, subtle shadow or border, 20px radius. Contains chat interface or tool controls. Fixed positioning, collapsible. Header with close button.

## Do's and Don'ts

### Do
- Use Madefor Display at 48–104px for all headlines; the negative letter-spacing (-0.02em to -0.03em) is signature
- Reserve #166aea electric blue exclusively for primary action buttons; never use it for text, icons, or decoration
- Set border-radius to 50px for all interactive buttons and tags — the pill shape is a defining system trait
- Apply generous section gaps of 80px between content blocks; the air-filled rhythm is critical to the feel
- Use the Lavender Mist gradient (#bfc8e8 → white) as a full-bleed section background to break up white-on-white sections
- Set images and product mockups to 8.9px border-radius for a slightly rounded tech-product feel
- Pair black filled buttons with blue filled buttons as the two-tier action system; never use three different button fill colors in one section

### Don't
- Don't use Deep Violet (#101585) or Indigo Pulse (#2c34af) for action buttons — they are brand/heading colors only
- Don't add visible drop shadows to cards or buttons; the system relies on flat surfaces with hairline borders, not elevation
- Don't use border-radius below 8px on cards or 20px on buttons — sharp corners break the rounded, friendly tone
- Don't set headline line-height above 1.2 at 48px+; the tight leading (0.95–1.1) is what makes the display type feel editorial
- Don't apply Lime Highlight (#dff994) or Lemon Note (#fdf4a1) to text longer than a word; they are wash/accent colors, not text backgrounds
- Don't introduce new accent colors beyond the defined palette; the system's restraint is its strength
- Don't center body text longer than a subtitle; the layout is left-aligned for paragraphs and right-aligned for supporting metadata

## Elevation

- **Navigation bar:** `rgba(0, 0, 0, 0.1) 0px -1px 0px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background, default state for all sections
- **Mist** (`#f1f5f9`) — Elevated panels, input fields, subtle section differentiation
- **Lime Wash** (`#dff994`) — Accent surface for highlight sections, feature callouts
- **Lavender Fade** (`#bfc8e8`) — Gradient section backgrounds, atmospheric color zones

## Imagery

Product mockups dominate the visual language: browser-framed screenshots of the Wix editor, template previews with real photography (furniture, fashion, architecture), and UI captures showing the AI prompt interface. Photography is lifestyle-oriented for templates (eCommerce, portfolio examples) and product-focused for the editor demos. Gradients are abstract and atmospheric — soft lavender washes and periwinkle glows that fill hero spaces without competing with content. No heavy illustration system; visuals are either real UI captures or smooth gradient backgrounds. Icons are minimal, mostly stroke-based at 1px, appearing in nav and feature lists.

## Layout

Max-width 1200px centered content with full-bleed gradient sections. Hero is left-aligned headline + centered subtitle, CTA below. Alternating section rhythm: white canvas → lavender gradient → white canvas. Content blocks use a 2-column pattern (headline left, supporting text + CTA right) for feature sections. Template gallery is a 4-column equal-width grid. Generous vertical breathing room — 80px between sections, 24–32px between elements within sections. Navigation is a single horizontal bar, transparent on hero, white on scroll. Product mockups are centered below their headline, often overlapping into the next section's gradient to create flow.

## Similar Brands

- **Squarespace** — Same oversized serif/sans-serif display headlines, generous white space, single-color accent strategy, and template-driven hero compositions
- **Linear** — Shared pill-button geometry, monochrome-dominant palette with one electric accent color, and the discipline of flat surfaces without shadows
- **Figma** — Similar spacious landing pages with large editorial display type, gradient section backgrounds, and a product-mockup-as-hero approach
- **Webflow** — Same visual rhythm — centered/left-aligned headlines over product screenshots, pill-shaped CTAs, and the template gallery grid pattern
- **Framer** — Shared custom geometric sans-serif typography, black-and-white-first design with strategic color pops, and the spacious editorial layout language
