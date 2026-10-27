# Front — Style Reference
> Midnight plum control room, one lime spark. Deep aubergine walls, lavender mist borders, and a single chartreuse beacon that pulls every eye.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Front operates in a deep-plum command-center language: a single saturated purple (#300c41) carries the page, lighter lavender cards float above it, and one electric lime accent punches through the darkness as the only warm color. Typography is neo-grotesque and tightly tracked, with display sizes at weight 500 pulling inward at -0.02em so headlines feel machined rather than drawn. Surfaces are flat — no drop shadows, only a hairline 1px inset ring in pale lilac (#d0c6f0) to define interactive edges. The overall rhythm is confident and dense: rounded pill controls (40-64px radius), compact 8/16/24px spacing, and dark-on-dark layering that makes the lime CTA feel switched on.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aubergine | `#300c41` | Page canvas, hero backgrounds, nav background — the single dominant surface color that gives Front its unmistakable identity |
| Royal Plum | `#5b1f76` | Pink supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Lime Spark | `#dee948` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Bright Violet | `#8034bf` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Lavender Glow | `#b375f4` | Decorative borders, accent strokes on illustrations, gradient terminus in the chat widget |
| Ink | `#1c1e20` | Primary body and heading text on light surfaces — near-black with a faint warm cast |
| Frost | `#f0f4fe` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Pale Lilac | `#e2dcf6` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Stone | `#dedfe2` | Borders on light surfaces, table dividers, inactive outlines |
| Slate | `#5b5d63` | Secondary text, helper copy, metadata labels |
| Pewter | `#7c8088` | Tertiary text, placeholder copy, disabled labels |
| Ash | `#8e929b` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Midnight Navy | `#0d1d39` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Lavender Whisper | `#d0c6f0` | Inset focus ring color, soft hover wash, tinted shadow on elevated cards |
| Deep Olive | `#1d1f04` | Rare dark text accent on the lime button and light surfaces with maximum contrast |

## Typography

### Suisse Intl — Primary typeface across all UI — body, headings, buttons, navigation. The custom neo-grotesque gives Front its machined, Swiss-instrument feel; weight 500 carries both body and display, so the system relies on tracking and size to create hierarchy rather than weight contrast.
- **Substitute:** Inter, Helvetica Neue, or Aktiv Grotesk
- **Weights:** 400, 500
- **Sizes:** 10, 12, 14, 15, 16, 17, 20, 25, 30, 36, 43, 52, 62px
- **Line height:** 1.20 body, 1.10 display
- **Letter spacing:** Display sizes pull inward aggressively: -0.02em at 62px (-1.24px), -0.019em at 52px (-0.99px), -0.017em at 43px (-0.73px), -0.015em at 36px (-0.54px), -0.01em at 25px (-0.25px). Body and small sizes track neutral or slightly open.

### Suisse Works — Rare serif accent — appears as a single contextual flourish, not a structural face
- **Substitute:** Tiempos Text or Source Serif Pro
- **Weights:** 500
- **Sizes:** 25px
- **Line height:** 1.20
- **Letter spacing:** -0.0100em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 0.003px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.4 | -0.01px |
| heading-sm | — | — | 25px | 1.2 | -0.25px |
| heading | — | — | 36px | 1.19 | -0.54px |
| heading-lg | — | — | 43px | 1.17 | -0.73px |
| display | — | — | 62px | 1.1 | -1.24px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 20px
- **pills:** 64px
- **inputs:** 10px
- **buttons:** 40px
- **chatWidget:** 20px

## Components

### Lime Primary Action
**Role:** The single dominant CTA across all pages — the one element that should always be the most visible

Fill #dee948 lime, text #0d1d39 in Suisse Intl 500 at 16px, 9999px implied pill radius (rendered as 40px from the data), horizontal padding 24px, vertical padding 12px. No border, no shadow. Sits directly on the Aubergine canvas so the lime-to-plum contrast does all the visual work.

### Outlined Ghost Action
**Role:** Secondary CTA paired with the lime button on dark surfaces

Transparent fill, 1px border in #e2dcf6 (Pale Lilac), text #ffffff in Suisse Intl 500 at 16px, 40px radius, 24px horizontal / 12px vertical padding. The pale lilac border replaces the conventional drop shadow — it glows softly against the plum without competing with the lime.

### Filled Plum Nav Button
**Role:** Header-level action that sits in the dark navigation bar

Fill #300c41 (same as canvas, defined by a 1px Pale Lilac inset ring), text #ffffff, 40px radius, padding 10px 20px. Reads as a recessed slot in the nav rather than a raised button.

### Ghost Nav Button
**Role:** Tertiary header action next to the filled nav button

Transparent fill, 1px Pale Lilac border (#e2dcf6), white text, 40px radius, same padding as the filled nav button. Mirror of the hero ghost action at smaller scale.

### Chat Widget Card
**Role:** Persistent floating helper in the bottom-right corner

Lavender gradient card (#b375f4 → #d0c6f0), 20px radius, ~320px wide, with a purple Front icon mark at top, white 'Welcome to Front!' heading at 20px weight 500, a stack of white pill options (Get a Demo, Pricing, Product Tour, Chat with our AI Virtual Rep) at 40px radius, and a small purple send icon button in the corner. Internal padding 20px, gap between options 8px.

### Announcement Bar
**Role:** Top-of-page single-line notification

Lime fill #dee948, text #0d1d39 in Suisse Intl 14px weight 500, centered, full-bleed, padding 8px vertical. Underlined inline link in the same dark color. This is the only place lime appears as a background surface rather than a button fill.

### Top Navigation Bar
**Role:** Sticky header with logo, product links, and two CTAs

Background #300c41 (Aubergine), 64-72px height, padding 16px horizontal. Logo on the left in lavender gradient. Center nav links in white at 15px weight 500 with 32px gaps. Right cluster: 'Sign in' as plain white text, then the filled plum button, then the ghost button. No visible border or shadow — the nav floats on the same plum canvas.

### Hero Section
**Role:** First-screen value proposition with dual CTA

Full-width Aubergine (#300c41) background, 80-120px vertical padding, centered text stack. Display headline at 62px weight 500 in white, tracking -1.24px, max-width ~900px. Sub-headline at 17-20px weight 400 in #d0c6f0 (Pale Lilac) — the lilac subtext on plum is signature, avoiding plain gray. Two-button row with 16px gap: lime primary + ghost secondary. Below: three tab-style links ('Cross-team coordination', 'Multi-step workflows', 'AI command center') with the active tab underlined in white.

### Email Card Mockup
**Role:** Product visualization card embedded in the hero/feature section

Lilac Mist (#e2dcf6) fill, 20px radius, padding 20px, with a white inner email thread card. Avatar circle (40px), sender name in Ink 16px weight 500, subject in Slate 14px, message body in Ink 15px. Floating at a slight angle on the Aubergine background to suggest depth without a drop shadow.

### Customer Logo Strip
**Role:** Social proof band below the hero

Sits on a lighter purple band (#5b1f76 Royal Plum). Left-aligned 'Trusted by 9,000+ companies' label in white at 14px. Logos in white at ~60% opacity, 32px height, distributed horizontally with 48-80px gaps. No borders or dividers between logos.

### Pill Tab Indicator
**Role:** Active state underline for the three hero feature tabs

2px white underline below the active tab text, 24px width, centered under the label. Inactive tabs have no underline. Tab labels in white at 16px weight 500, 32px horizontal gap between tabs.

## Do's and Don'ts

### Do
- Use Lime Spark (#dee948) exclusively for the single primary action on any given page — it must be the only warm color visible
- Set all display headlines at 43px or above with negative tracking between -0.017em and -0.02em; the inward pull is what makes Suisse Intl feel machined
- Layer surfaces by color alone: Aubergine canvas → Royal Plum band → Lilac Mist card → Frost panel; never reach for a drop shadow to create depth
- Use the Pale Lilac 1px inset ring (#d0c6f0) on any interactive control that needs a defined edge on a dark surface
- Keep button radius at 40px and pill controls at 64px — the large radius is part of Front's silhouette
- Use #d0c6f0 (Pale Lilac) for secondary body text on dark surfaces instead of plain gray — it stays on-brand
- Anchor all spacing to the 8px base: 8/16/24/32/48/80 for gaps, padding, and section rhythm

### Don't
- Don't use Lime Spark for anything other than the primary action fill — it loses its power if it appears on more than one element per screen
- Don't add drop shadows to cards or buttons — depth comes from the color stack, not elevation
- Don't set body text in pure white on the Aubergine canvas for long passages — use Pale Lilac (#d0c6f0) for subtext to reduce harshness
- Don't mix two violet button fills on the same surface — pick Royal Plum (#5b1f76) or Aubergine (#300c41) for the section, not both
- Don't set display headlines at weight 700 or 800 — Suisse Intl weight 500 with tight tracking is the Front voice; bold would break the instrument-tone
- Don't use the 10px or 12px sizes for anything other than metadata, badges, or legal text — anything readable should start at 14px
- Don't introduce a new accent color — the system is Aubergine + Lime; any third chromatic breaks the one-spark rule

## Elevation

- **Lime CTA button:** `none — flat fill, depth implied by color contrast against the plum background`
- **Chat widget card:** `none — depth created by the lavender gradient fill, not a drop shadow`
- **Interactive controls (outlined buttons, inputs):** `rgb(208, 198, 240) 0px 0px 0px 1px inset — a hairline lilac ring replaces conventional drop shadow`

## Surfaces

- **Aubergine Canvas** (`#300c41`) — Base page and hero background — the dominant dark plum that sets the mood
- **Royal Plum Band** (`#5b1f76`) — Lighter purple sections, nav, card backgrounds that need to lift off the canvas
- **Lilac Mist** (`#e2dcf6`) — Light card surfaces floating on the dark sections — the interface layer where most product UI lives
- **Frost Panel** (`#f0f4fe`) — Highest elevation cards, modal surfaces, and white-light UI on light sections

## Imagery

Product visualization is Front's dominant visual language: email thread mockups, chat inbox previews, and workflow cards float as Lilac Mist rectangles on the Aubergine canvas, often at a subtle angle to suggest dimension without a shadow. The illustrations are flat UI snapshots, not 3D renders or lifestyle photography. Customer logos appear as white wordmarks on the Royal Plum band, no frames or treatments. The chat widget itself is the most decorative element — a lavender gradient card with pill-shaped options. No hero photography, no stock imagery, no abstract graphics: the product UI is the visual content.

## Layout

Max-width 1200px centered for content, but the page itself is full-bleed across the Aubergine canvas. The hero is a centered text stack with display headline, lilac subtext, and a two-button row, with an email card mockup floating to the lower right as a product preview. Below the hero, a Royal Plum band carries the customer logo strip as a full-width social proof moment. The overall page rhythm is: dark hero → lighter purple band → content sections. Navigation is a single sticky top bar, no sidebar, no mega-menu — the product and resources links appear to be simple dropdowns. The chat widget is a fixed floating element in the bottom-right corner, present on every screen.

## Similar Brands

- **Linear** — Same dark purple-to-lavender surface stack, same reliance on a single warm accent (Linear's purple-pink vs Front's lime), same flat cards without drop shadows, same tight neo-grotesque typography
- **Notion** — Both use minimal hero compositions with a single product mockup floating off-center, both rely on color layering rather than elevation, both use a single accent against a monochrome field
- **Intercom** — Shared customer-operations space and both use purple as a primary brand surface; Intercom's blue-purple gradients map to Front's lilac-to-violet card treatments
- **Attio** — Same dark-canvas product UI language, same preference for 1px hairline borders over shadows, same tightly tracked neo-grotesque headlines
- **Vercel** — Both lean on a single saturated dark background with one accent color, both use generous 40-64px pill radii on controls, both keep product UI as the visual centerpiece rather than hero photography
