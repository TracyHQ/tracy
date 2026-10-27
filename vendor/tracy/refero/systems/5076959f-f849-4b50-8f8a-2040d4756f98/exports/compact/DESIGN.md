# Daylit — Style Reference
> Burgundy ink on cream parchment — a modern ledger rewritten for the AI era.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Daylit operates in a warm, candlelit fintech vernacular — a parchment-ivory canvas (#fbf9f6) replaces the cold white norm, and a single deep burgundy (#4d1520) does all the heavy lifting as text, borders, and the primary action fill. Pale lemon (#faffa7) acts as a secondary highlight accent that appears in decorative illustration blocks, testimonial card borders, and badge fills, keeping the palette to roughly two chromatic anchors. Type is large, confident, and tightly tracked — display sizes push to 76–85px with aggressive negative letter-spacing, giving headlines a sculptural, almost editorial quality. Components are flat and low-elevation: hairline warm borders, a 6px default radius, and a single brand-tinted shadow reserved for hero-scale elevation. The overall rhythm is spacious and unhurried, with generous section padding and a centered max-width reading column that feels like a well-typeset annual report rather than a dense SaaS dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Wine Ink | `#4d1520` | Primary text, primary filled button background, active states, heading color, card borders, and dominant brand stroke — the single chromatic anchor of the entire system |
| Midnight Wine | `#360912` | Darkest surface for footer bands and inverted panels |
| Lemon Whisper | `#faffa7` | Decorative accent fill and border — used in illustration blocks, testimonial card outlines, icon highlights, and soft highlight washes |
| Blush Rust | `#662f3d` | Softened brand fill for secondary surfaces and SVG illustration shading |
| Citrine Pop | `#e6b800` | Rare saturated accent for micro-detail and decorative strokes |
| Mauve Ash | `#825b63` | Muted body text and subtle borders when full brand ink would be too loud |
| Parchment | `#fbf9f6` | Primary page canvas — the warm ivory that replaces cold white throughout |
| Pure White | `#ffffff` | Card surfaces, input fields, elevated panels — the brightest neutral layer above the parchment canvas |
| Linen Beige | `#f2eee7` | Hairline borders, dividers, ghost button outlines, and subtle UI separators |
| Sandstone | `#d3cac3` | Muted borders and secondary divider lines on cards and links |
| Driftwood | `#aaa49f` | Lowest-contrast neutral for decorative borders and inactive link text |
| Slate Smoke | `#717182` | Body secondary text, icon strokes, and helper copy — the only cool-leaning neutral |
| Charcoal Ink | `#101828` | Occasional dark text and info-toned badge borders when Wine Ink would be too warm |
| Butter Cream | `#feffe1` | Ultra-soft warm fill for highlight zones and subtle surface washes |
| Dawn Glow | `#e9e3d8` | Warm card background tint used sparingly for warm-on-warm contrast |
| Rose Whisper | `#d7a0a0` | Soft card border accent for warm-toned testimonial and content cards |
| Plum Echo | `#906c7b` | Badge and pill background for muted tag variants |

## Typography

### Tt Commons Pro Variable — Primary typeface across all contexts — headings, body, nav, buttons, cards. The variable weight axis (400–600) and extreme size range (9px micro-labels to 85px display) make it the sole workhorse. Display sizes use aggressive negative tracking (-0.04em at 76–85px) for a sculptural editorial feel; body sizes stay near normal tracking. The 600 weight carries emphasis without ever feeling bold-shouty.
- **Substitute:** Switzer, General Sans, or Inter as close geometric-grotesque alternatives
- **Weights:** 400, 500, 600
- **Sizes:** 9, 10, 12, 14, 15, 16, 18, 20, 22, 32, 44, 56, 64, 68, 76, 85
- **Line height:** 1.20–2.39 (tight for display, generous for body)
- **Letter spacing:** -0.0400em, -0.0210em, -0.0200em, -0.0150em, -0.0120em, 0.0200em

### Geist Mono — Monospace accent for badge labels, inline code, and small caps-style tags like '+ AI AGENTS FOR ACCOUNTS RECEIVABLE'. Normal letter-spacing — not tracked like the primary face.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 400, 500
- **Sizes:** 14, 18
- **Line height:** 1.33–1.75

### Open Sans — Open Sans — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.2
- **Letter spacing:** -0.02

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.5 | -0.012px |
| body | — | — | 16px | 1.5 | -0.012px |
| subheading | — | — | 22px | 1.33 | -0.015px |
| heading-sm | — | — | 32px | 1.2 | -0.02px |
| heading | — | — | 44px | 1.15 | -0.021px |
| heading-lg | — | — | 56px | 1 | -0.021px |
| display | — | — | 76px | 0.95 | -0.04px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 6px
- **badges:** 1440px
- **inputs:** 6px
- **buttons:** 6px
- **navLinks:** 6px
- **largeButtons:** 24px
- **illustrationCards:** 13px

## Components

### Primary Filled Button
**Role:** Main call-to-action — used for 'Book a Demo' and all conversion actions

Background #4d1520, text white (#ffffff) or #faffa7 accent, 6px radius, padding 10px 20px or 12px 20px, font Tt Commons Pro 500 at 16px. Often paired with a small yellow grid/dot icon trailing the label. The contrast between the deep wine fill and the warm canvas makes these feel like ink stamps.

### Ghost / Text Button
**Role:** Secondary action — 'Meet our AI agents', 'Learn more' links

No background or border. Text in #4d1520 or #717182 at 16px weight 500, optionally with a right-arrow chevron. Sits inline with body copy, never competing with the primary.

### Navigation Link
**Role:** Top nav menu items — Product, Capital, Industries, Resources, About

Text #4d1520 at 14–15px weight 500, no background. Caret/chevron icons in matching color for dropdowns. Items separated by 24–32px horizontal gap.

### Announcement Banner
**Role:** Top-of-page news strip

Full-bleed #faffa7 background, text #4d1520 at 14px, centered, with a right-side close (×) button. Thin bottom border or no border — sits flush against the page.

### Hero Headline
**Role:** Section-defining display text — 'Get paid on time. Every time.'

Tt Commons Pro at 56–68px, weight 400, color #4d1520, letter-spacing -0.021em to -0.04em, line-height 1.0–1.05. The restrained 400 weight at enormous size is a signature choice — it whispers rather than shouts.

### Testimonial Card
**Role:** Customer quote card in the social proof section

Warm tinted background (#faffa7 lemon or #feffe1 cream variants), 1px border in matching warmer tone, 6–13px radius, padding 20–24px. Company name in #4d1520 at 14px weight 600, quote text in #4d1520 at 15–16px weight 400, author line with avatar circle at bottom.

### Logo Bar Card
**Role:** Trusted-by logo row in a single horizontal band

Parchment canvas, logos in grayscale or muted brand colors at 40–48px height, evenly spaced with 8–10px gaps. A small 'Trusted by' label in #717182 sits to the left.

### Pill Badge / Tag
**Role:** Category labels — '+ AI AGENTS FOR ACCOUNTS RECEIVABLE'

Background #faffa7 or #906c7b, text #4d1520 or white, 1440px radius (full pill), padding 4px 12px or 6px 14px, font Geist Mono 500 at 12–14px, uppercase. The mono font in pill form is the system's signature micro-component.

### Illustration Panel
**Role:** Hero visual and decorative graphic blocks

Large rounded rectangles (#13px radius) with #faffa7 or #feffe1 fill containing flat geometric illustrations of products (invoice printers, calculators). Sits in a 2-column hero with text on the left. The only place the system allows large color blocks.

### Card Surface
**Role:** Generic content card base

White (#ffffff) background, 1px border in #f2eee7, 6px radius, padding 24px. Optional brand-tinted shadow: rgba(77,21,32,0.16) 19px 32px 73px — a deep wine-tinted shadow used sparingly for hero-scale elevation only.

### Body Text Block
**Role:** Paragraph and helper copy

Tt Commons Pro 400 at 18px, color #4d1520 for primary body or #717182 for secondary, line-height 1.5–1.6, letter-spacing -0.012em. Comfortable reading width within the 1200px max column.

### Top Navigation Bar
**Role:** Sticky or static header with brand and primary nav

Parchment (#fbf9f6) background, full-width, 64–80px height. Logo left (wordmark + icon), nav links center-right, Login + Capital + Book a Demo right. Thin bottom border in #f2eee7 optional.

## Do's and Don'ts

### Do
- Use #4d1520 as the default text color and primary button fill — it is the system's single chromatic anchor and should appear in every screen
- Set page canvas to #fbf9f6 parchment, not pure white — the warm ivory is what makes the burgundy sing
- Use 6px radius for all cards, buttons, and inputs as the default; reserve 1440px for pill badges only
- Use Tt Commons Pro at weight 400 for display headings 44px and above — the whisper-weight at large size is a signature
- Apply the wine-tinted shadow rgba(77,21,32,0.16) 19px 32px 73px only on hero-scale elevated cards, never on small UI elements
- Use #faffa7 lemon as a decorative accent fill in illustration blocks and badge backgrounds — never as a text color on dark surfaces
- Center content within a 1200px max-width column with 24–40px horizontal padding for comfortable reading rhythm

### Don't
- Do not introduce cold grays (#e5e7eb, #f3f4f6, #6b7280) — the entire system is warm-toned and cool neutrals will clash
- Do not use 8px or 12px border-radius on cards or buttons — the 6px radius is part of the system's distinctive geometry
- Do not set body or heading text to weight 600 or 700 — the system maxes out at 600 for emphasis and prefers 400–500
- Do not use pure black (#000000) for text — use #4d1520 wine ink instead, even for body copy
- Do not add drop shadows to buttons, nav items, or small interactive elements — shadows are reserved for hero-scale elevation
- Do not use blue, green, or standard semantic colors for status — the system communicates state through opacity, position, and the single brand hue
- Do not center-align body paragraphs longer than two lines — left-align for readability; center only for headlines and short CTAs

## Elevation

- **Hero illustration panel:** `rgba(77, 21, 32, 0.16) 19px 32px 73px 0px`

## Surfaces

- **Parchment Canvas** (`#fbf9f6`) — Base page background — warm ivory that sets the entire system's temperature
- **Card White** (`#ffffff`) — Elevated card and content surfaces above the canvas
- **Butter Cream** (`#feffe1`) — Soft warm fill for highlight zones and muted content cards
- **Lemon Whisper** (`#faffa7`) — Decorative accent fill for illustration blocks and accent cards
- **Midnight Wine** (`#360912`) — Inverted dark surface for footer and occasional dark-band sections

## Imagery

Illustration-only, no photography. Visuals are flat geometric compositions — invoice printers, calculators, and product diagrams rendered as simplified vector shapes in the brand palette (wine outlines on lemon or cream fills). Illustrations sit in large rounded-rectangle panels (#13px radius) with generous internal padding. The style is intentionally retro-tech: chunky devices, flat shading, no gradients on objects (gradients are reserved for the gradient blobs behind the headline). No people, no lifestyle photography, no product screenshots — the abstract illustrations carry the entire visual load and reinforce the system's 'modern ledger' identity.

## Similar Brands

- **Mercury** — Same warm-ivory canvas (#fbf9f6-adjacent) replacing cold white, with a single deep chromatic anchor color doing all text and button duty. Both use generous spacing and whisper-weight display headlines.
- **Ramp** — Similar flat, editorial fintech aesthetic with muted warm palette, low elevation, and large confident type. Both avoid the typical SaaS blue/gray template and use a distinctive brand color throughout.
- **Pillpack (now part of Amazon Pharmacy)** — Shared warm-illustration visual language — flat geometric product illustrations in rounded panels with soft accent-color backgrounds, no photography, brand-colored type doing structural work.
- **Brex** — Both use a single dominant brand hue against a warm off-white canvas, with pill-shaped badges, tight-tracked large headlines, and a flat low-elevation component system that feels editorial rather than dashboard-y.
- **Kalshi** — Same restricted two-color chromatic palette (one deep brand + one bright accent) on warm neutrals, with sculptural display type and illustration-driven hero sections instead of product screenshots.
