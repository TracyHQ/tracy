# Vivid Spain — Style Reference
> Lavender dusk over white marble — a soft violet wash on a clean white surface, where one vivid purple accent does all the work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Vivid is a lavender-lit fintech canvas: a white marble surface washed in soft violet gradients, where the only chromatic decision a designer makes is how much purple to pour on. The system is radically monochromatic — a single vivid violet (#7d33f6) carries every interactive moment, from logo to CTA to active toggle, while the rest of the interface stays in a disciplined gray-on-white scale. Components breathe through soft pastel card backgrounds (#f4edff, #e9d4fb) and pill-shaped controls (100px radius) that feel like rounded candy, never corporate. Typography is geometric Satoshi at every weight, with aggressive negative letter-spacing on display sizes pulling the headlines tight, and generous positive tracking on small uppercase labels. The visual signature is restraint: no shadows, no borders on hero surfaces, no decorative noise — just purple light, white space, and confident type.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vivid Violet | `#7d33f6` | Primary CTAs, logo, active nav, toggle thumb, link emphasis — the single chromatic decision that powers all interactivity. Deeply saturated against white to command attention without the corporate-blue cliche |
| Lilac Veil | `#f4edff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Orchid Whisper | `#e9d4fb` | Muted violet wash for feature card backgrounds and decorative fills. Sits between Lilac Veil and Vivid Violet to create tonal depth in card grids |
| Periwinkle Glow | `#9292ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Onyx | `#24282d` | Headings, high-emphasis text, dark icons, dark button text — the near-black that carries all type hierarchy. Cool-tinted, not pure black, matching the violet system |
| Graphite | `#333333` | Body text, paragraph copy, default icon strokes. The workhorse text color for all reading content |
| Slate | `#79797f` | Muted/secondary text, helper labels, inactive nav, subtle icon fills. Carries supporting copy without competing with primary type |
| Mist | `#bbbbc1` | Disabled states, very light icon fills, de-emphasized borders |
| Frost | `#eceef2` | Hairline borders, input borders, divider lines, neutral card surfaces. The most common structural separator |
| Stone | `#f5f5f4` | Alternate page background tint, body section backgrounds — used when a section needs to step away from pure white without introducing color |
| Pure White | `#ffffff` | Primary page canvas, card surfaces, button text, input fills. The dominant surface that lets violet accents pop |
| Ink | `#000000` | Icon fills, deep contrast elements where absolute black is needed |
| Hero Dusk | `linear-gradient(251deg, rgb(248, 240, 237) -9.1%, rgb(242, 228, 240) 36.43%, rgb(170, 147, 234) 105.93%)` | Hero gradient warm stop, Pro pricing card background gradient — soft peach-to-lavender atmospheric wash |
| Amethyst Bloom | `radial-gradient(circle at 0px 100%, rgb(247, 236, 238) 0px, rgb(231, 215, 239) 60%, rgb(199, 164, 230) 68%, rgb(159, 127, 225) 100%)` | Radial gradient deep stop for the Pro card hero glow — concentrated violet at the corner anchor point |

## Typography

### Satoshi — Sole typeface across all UI — geometric sans-serif with distinctive tight apertures. Weight 700 for display headlines creates immediate authority; weight 400 body text feels clean and modern. The aggressive negative letter-spacing on large sizes (-1.2px at 56px) pulls characters tight for a premium compressed look that system fonts cannot replicate. Satoshi replaces with Inter or General Sans as freely available substitutes.
- **Substitute:** Inter, General Sans, Switzer
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10, 12, 13, 14, 15, 16, 20, 24, 36, 40, 52, 56, 60
- **Line height:** 1.00-1.60
- **Letter spacing:** Negative tracking on display: -0.021em at 56px, -0.020em at 52px, -0.015em at 40px, -0.011em at 36px, -0.010em at 24px. Neutral at body. Positive tracking on micro/uppercase: 0.010em at 12px, 0.030em at 10px.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.3px |
| body | — | — | 14px | 1.57 | 0px |
| subheading | — | — | 20px | 1.29 | -0.18px |
| heading-sm | — | — | 24px | 1.25 | -0.24px |
| heading | — | — | 36px | 1.17 | -0.4px |
| heading-lg | — | — | 52px | 1.1 | -1.04px |
| display | — | — | 60px | 1 | -1.26px |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 8-12px

### Border Radius

- **cards:** 24px
- **badges:** 100px
- **buttons:** 100px
- **toggles:** 100px
- **buttonsSmall:** 10px

## Components

### Primary CTA Button
**Role:** Highest-priority action — account creation, plan selection

Filled Vivid Violet (#7d33f6) background, white text, 100px border-radius (fully pill-shaped), padding 12px 28px. Satoshi weight 500 at 15-16px. No shadow, no border. The pill shape is the signature — never square, never 8px radius.

### Ghost/Secondary Button
**Role:** Lower-priority action — login, secondary navigation

Transparent background, Vivid Violet (#7d33f6) text and 1px border, 100px border-radius, padding 10px 24px. Satoshi weight 500. Inverts to filled violet on hover.

### In-Card CTA Button
**Role:** Action inside pricing/feature cards

10px border-radius (not pill), Lilac Veil (#f4edff) background, Vivid Violet text at weight 500, 16px padding vertical. Filled Vivid Violet variant for the highlighted Pro tier card. The 10px radius inside cards is a deliberate departure from the 100px pill of the global nav — card-internal actions feel more contained.

### Feature Card
**Role:** Product feature showcase in 4-column grid

24px border-radius, padding 32px, background alternates between Lilac Veil (#f4edff) and Orchid Whisper (#e9d4fb) to create rhythm across the row. Centered icon (24-32px) at top, heading at 20px weight 600, body at 14px Graphite (#333333). No border, no shadow — color alone defines the card boundary.

### Pricing Tier Card
**Role:** Plan comparison in 3-column layout

Three variants: Standard (white bg, Frost border 1px, 10px radius, ghost Lilac Veil CTA), Featured/Pro (gradient background using radial-gradient from Amethyst Bloom to light lavender, Vivid Violet filled CTA, 10px radius). 32px padding, tier name at 20px weight 600, price at 36-40px weight 700. The Pro card's gradient is the only place the system breaks monochrome — the gradient IS the premium signal.

### Top Navigation Bar
**Role:** Persistent global navigation

White background, 64-72px height, logo left (Vivid wordmark in Vivid Violet weight 700), nav links center in Slate (#79797f) weight 500 at 15px, language selector + Ghost Login button + filled Primary CTA right. Bottom shadow: rgba(0,0,0,0.08) 0px 8px 32px — the only shadow in the entire system, creating a floating paper feel.

### Monthly/Annual Toggle
**Role:** Pricing period switch

100px radius pill track, Lilac Veil (#f4edff) background, Vivid Violet circular thumb (24px). Labels flanking the track: 'Monthly' left, 'Annual' right with 'Save up to 24%' badge in Vivid Violet text. The pill track with violet thumb is the only interactive feedback pattern besides buttons.

### Trustpilot Rating Badge
**Role:** Social proof in hero

Inline row of 5 green star icons (decorative green not in palette) + 'Trustpilot: Excellent | 25.000+ reviews' text in Graphite weight 500 at 13px. Sits directly below the hero subtext as a trust signal.

### Award Badge Row
**Role:** Credibility strip below hero

4-column row, each item: small badge icon (32-40px) + 2 lines of text (award name in Onyx weight 600 at 13px, source in Slate at 12px). Light dividers between items. No background or card — sits directly on white canvas.

### Section Heading
**Role:** Page-level section titles

Centered, Onyx (#24282d), Satoshi weight 700 at 36-52px, letter-spacing -0.4 to -1.04px (tight). Line-height 1.10-1.17. No subtitle by default — the heading alone carries the section identity.

### Hero Section
**Role:** Above-fold brand introduction

Full-width Hero Dusk linear-gradient background (peach → lavender → amethyst). Two-column layout: left = headline (60px weight 700, Onyx, -1.26px tracking) + subtext (16px Graphite) + CTA + Trustpilot; right = isometric phone mockup with floating card graphic. The gradient is the mood-setter — the page begins in warm lavender light and settles into pure white below.

### Navigation Arrow Controls
**Role:** Carousel pagination for card rows

Two simple arrow icons (← →) centered below the 4-card row. 20px Slate (#79797f) icons, no background or button chrome. Minimal pagination that doesn't compete with the card content.

## Do's and Don'ts

### Do
- Use 100px border-radius for all buttons, toggles, and pill-shaped controls in global nav and hero — the fully rounded pill is the system's signature shape
- Set display headlines at 52-60px Satoshi weight 700 with negative letter-spacing (-1.0 to -1.26px) to achieve the premium compressed look
- Fill primary CTAs with Vivid Violet (#7d33f6) on white — never use violet text on violet backgrounds, and never use violet for body copy
- Alternate Lilac Veil (#f4edff) and Orchid Whisper (#e9d4fb) card backgrounds to create rhythm in multi-column card grids without adding borders
- Apply the 10px radius to all in-card buttons and form controls, distinguishing them from the 100px pill buttons in global navigation
- Use the single shadow pattern rgba(0,0,0,0.08) 0px 8px 32px only for the floating top navigation — all other surfaces are shadowless
- Keep all secondary text at 12-14px in Slate (#79797f) — never use Slate for primary headings or interactive elements

### Don't
- Don't add borders to feature cards or pricing cards — pastel background fills alone define card boundaries
- Don't use multiple chromatic accents — Vivid Violet is the only saturated color; Periwinkle Glow is the only secondary tint and only for de-emphasized links
- Don't use square or 8px-radius buttons in global navigation — the 100px pill is mandatory for nav and hero CTAs
- Don't apply shadows to cards, buttons, or any surface other than the top navigation bar
- Don't use positive letter-spacing on headlines or body text — tracking is positive only on 10-12px micro/uppercase labels
- Don't introduce a second typeface — Satoshi carries everything from 10px captions to 60px display headlines
- Don't use raw black (#000000) for text — use Onyx (#24282d) for headings and Graphite (#333333) for body to stay within the cool-tinted neutral system

## Elevation

- **Top Navigation Bar:** `rgba(0, 0, 0, 0.08) 0px 8px 32px 0px`

## Surfaces

- **Pure White Canvas** (`#ffffff`) — Primary page background, dominant surface for all content sections
- **Stone Wash** (`#f5f5f4`) — Alternate section background when stepping away from pure white without color
- **Lilac Veil** (`#f4edff`) — Card surfaces, ghost button fills, toggle tracks, the primary tinted surface
- **Orchid Whisper** (`#e9d4fb`) — Feature card alternates, decorative fills slightly more saturated than Lilac Veil
- **Hero Dusk Gradient** (`#f2e4f0`) — Hero section atmospheric background — peach to lavender to amethyst wash

## Imagery

Product photography is limited to 3D-rendered phone mockups shown in isometric/angled perspective, floating against the hero gradient. The phones display the Vivid banking app interface at a slight tilt, creating depth. A physical Vivid card (violet with gold VISA chip) hovers beside the phones as a brand artifact. All other imagery is icon-based: simple flat illustrations in the feature cards (3D box, tree on platform, two avatars, phone with coins) rendered in a soft 3D-blender style with purple/lavender color treatments. Photography is absent — the visual language is entirely rendered objects and flat icons. The hero composition places the product mockup on the right half while text occupies the left, creating an asymmetric diagonal flow.

## Layout

Max-width 1200px centered container with generous side padding. Hero is a two-column asymmetric split: text-left (40%) / angled phone mockup-right (60%) on a full-width lavender gradient. Below the hero, a 4-column award badge strip runs edge-to-edge. Feature cards form a 4-column equal grid with 12-16px gaps, each card with 24px radius and alternating pastel backgrounds. Section headings are centered above each block. The pricing section uses a 3-column card grid with the Pro tier slightly taller and gradient-filled. Navigation is a fixed white top bar with shadow, containing logo-left, links-center, actions-right. The page rhythm alternates: full-bleed gradient hero → white section → white section with cards → white section with pricing. No sidebar, no mega-menu, no full-bleed dark sections — the page stays light from top to bottom.

## Similar Brands

- **N26** — Same light fintech canvas with a single bold accent color, pill-shaped CTAs, and flat product phone mockups in the hero
- **Revolut Business** — White-dominant layout with purple-toned brand color, card-based feature grids, and 3-tier pricing with a highlighted premium plan
- **Mercury** — Clean white interface with generous pastel card backgrounds, tight geometric sans-serif headlines, and minimal borderless component design
- **Lunar** — Soft gradient hero washes, purple/violet brand color on white, and pill-shaped navigation buttons in a compact Scandinavian fintech style
