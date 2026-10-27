# User Interviews — Style Reference
> hand-drawn research field notes on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

User Interviews is a sunlit research-platform language built on a warm off-white canvas with pale mint and blush accent surfaces. Typography pairs a literary serif (P22 Mackinac Pro) for editorial headlines with a geometric sans (Sofia Pro) for confident UI, while IBM Plex Mono labels in spaced uppercase act as section eyebrows — the overall rhythm feels like a well-edited research journal translated into a SaaS product. A single deep teal (#1c5d5f) drives all primary action, with dusty rose, sage, and navy secondary buttons that never compete for the same attention. Hand-drawn line illustrations of people inside browser frames make the interface feel human and process-oriented rather than dashboard-heavy; the product stays flat, low-elevation, and pill-buttoned throughout.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Teal | `#1c5d5f` | Primary action button fill, filled CTA — a desaturated dark teal reads as confident and scholarly rather than aggressive or corporate |
| Pine Shadow | `#0e4749` | Outlined/ghost action borders, secondary link underlines — same hue family as the primary, one step deeper for quiet secondary actions |
| Sage | `#65b8a2` | Outlined action borders, decorative illustrations, and soft accent strokes — the mid-tone teal for secondary interactive elements |
| Lake Teal | `#2a7779` | Mid-saturation teal for decorative illustration fills and accent borders |
| Forest Floor | `#156152` | Dark variant of the brand teal used for filled button hover and selected states |
| Ink Navy | `#16325a` | Blue action color for filled buttons, selected navigation states, and focused conversion moments. |
| Dusty Rose | `#d6aec1` | Outlined/ghost action borders for accent buttons, decorative illustration tints — soft warm contrast to the cool teal primary |
| Mint Mist | `#a2cbcd` | Outlined action borders, soft illustration washes — pale teal for ghost buttons and decorative panels |
| Sea Foam | `#cae1e2` | Soft highlight washes and decorative illustration backgrounds — the lightest cool accent |
| Paper White | `#f2f8f7` | Page canvas — a warm near-white with a barely-perceptible mint tint instead of pure white, giving the whole site a printed-on-paper warmth |
| Card Mint | `#e4f0f1` | Card and panel surfaces — a slightly deeper mint that lifts cards off the canvas without contrast shock |
| Blush Sand | `#f2e8e2` | Warm-toned panel surface for alternating sections and illustration backgrounds — breaks the cool palette with a warm counter-rhythm |
| Charcoal Navy | `#283338` | Primary navigation text and nav borders — the darkest neutral, slightly blue-shifted to harmonize with the teal palette |
| Slate | `#333333` | Body text fallback and secondary headings |
| Soft Black | `#1a1a1a` | Link text and image fallback borders — the true near-black for text contrast |
| Illustration Ink | `#231e21` | Hand-drawn illustration outlines and fill — a warm near-black that feels inked rather than digital |

## Typography

### Sofia Pro — Primary UI and body sans — a geometric humanist sans with slight warmth. Handles body copy at 16–18px, subheadings at 20–24px, nav at 14px, and small UI at 12–13px. Tight tracking (-0.01em) at larger sizes keeps headlines crisp; slightly looser (0.043em) at small UI gives breathing room for labels.
- **Substitute:** Inter, DM Sans, Manrope
- **Weights:** 400, 500, 700
- **Sizes:** 12px, 13px, 14px, 16px, 18px, 19px, 20px, 22px, 24px
- **Line height:** 1.27, 1.33, 1.38, 1.40, 1.43, 1.44, 1.46, 1.50, 1.53, 1.56, 1.71, 2.00
- **Letter spacing:** -0.01em at 18px+, 0.043em at 12-14px

### P22 Mackinac Pro — Display and heading serif — a literary, slab-influenced serif that brings editorial credibility to section headlines. Used at 64px (display) and 44–50px (section headings) with generous line-height. The serif choice is the signature typographic decision: most SaaS products stay all-sans, but Mackinac makes the brand feel like a research publication, not a dashboard.
- **Substitute:** Source Serif 4, Lora, Crimson Pro
- **Weights:** 400, 500
- **Sizes:** 30px, 44px, 50px, 64px
- **Line height:** 1.16, 1.20, 1.32, 1.33
- **Letter spacing:** normal

### P22 Mackinac Pro Italic — Italic accent headline — used for emphasis within serif headings; the bold italic weight creates editorial pull-quote energy
- **Substitute:** Source Serif 4 Italic Bold, Lora Bold Italic
- **Weights:** 700
- **Sizes:** 30px, 36px, 50px
- **Line height:** 1.17, 1.20, 1.33
- **Letter spacing:** normal

### IBM Plex Mono — Section eyebrows, product labels, and category tags — always uppercase with wide tracking (0.038–0.059em). Functions as the 'system annotation' voice, marking product names, section IDs, and stat labels. This mono-with-tracking treatment is the system's structural punctuation.
- **Substitute:** JetBrains Mono, Fira Code, IBM Plex Mono (Google Fonts)
- **Weights:** 400, 500, 600
- **Sizes:** 13px, 14px, 15px, 17px, 20px
- **Line height:** 1.30, 1.57, 1.69, 2.24, 2.76
- **Letter spacing:** 0.038em at 14px, 0.059em at 13px

### P 22 Mackinac italic — P 22 Mackinac italic — detected in extracted data but not described by AI
- **Weights:** 700
- **Sizes:** 30px, 36px, 50px
- **Line height:** 1.17, 1.2, 1.33

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.52px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 24px | 1.38 | -0.24px |
| heading | — | — | 44px | 1.2 | 0px |
| heading-lg | — | — | 50px | 1.16 | 0px |
| display | — | — | 64px | 1.2 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 88px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 88px
- **tags:** 100px
- **cards:** 12px
- **pills:** 1000px
- **buttons:** 48px

## Components

### Primary Filled Button
**Role:** Main conversion action — sign up, get started

Filled button with #1c5d5f background, white text, 48px border-radius (pill shape), Sofia Pro 14px weight 500, padding 12px 24px. No border. Hover/active uses #156152 (darker teal). This is the dominant CTA color — every page should have at most one primary filled teal button in any viewport.

### Secondary Filled Button (Navy)
**Role:** Product-direction CTA — 'Explore Research Hub'

Filled button with #16325a background, white text, 48px border-radius, Sofia Pro 14px weight 500. Used alongside the teal primary to signal a different product direction within the same page — the teal/navy split is a signature dual-CTA system.

### Ghost Outline Button
**Role:** Tertiary actions, navigation links in body

Transparent background with #0e4749 1px border, #0e4749 text, 48px radius. Used for 'Learn more' style links and secondary inline actions.

### Pill Nav Button
**Role:** Header navigation items

88px border-radius with Sofia Pro 14px weight 400, #283338 text. No fill, no border in default state. Active state may use the pill shape with subtle teal text.

### Sign Up Header Button
**Role:** Top-right primary conversion

Teal #1c5d5f filled button in the header, 48px radius, white text, slightly more compact padding (8px 16px). The persistent conversion anchor at the top of every page.

### Section Eyebrow Label
**Role:** Category and product labels above headings

IBM Plex Mono 13–14px weight 500–600, uppercase, tracking 0.038–0.059em, color #283338 or #0e4749. Always paired with a small colored dot/icon prefix (teal, navy, or sage). Examples: '● recruit | PARTICIPANT-RECRUITMENT'.

### Feature Card (Two-Column)
**Role:** Product capability showcase blocks

Two side-by-side cards on a white/canvas background. Each card has #e4f0f1 (mint) background, 12px radius, padding 32px, with a product UI mockup screenshot on top and heading + checkmark list below. The mint surface distinguishes product cards from the page canvas without using heavy borders or shadows.

### Stat Banner Strip
**Role:** Social proof and key metrics

Full-width horizontal strip with a thin border (1px #e4f0f1 or 1px black), white or canvas background, containing uppercase mono text with monospace stats: '6 MILLION participants | 1 HOUR to first match | 98% POSITIVE session feedback'. Numbers in weight 600, labels in weight 400, separator pipes between stats.

### Filter Pill
**Role:** Interactive filter chips in selection UI

88–100px border-radius, #e4f0f1 background, Sofia Pro 13–14px weight 500, #283338 text, padding 6px 14px. Active/selected state: #1c5d5f background, white text. Removable filters show an × in the same color.

### Logo Trust Bar
**Role:** Client logo social proof

Horizontal row of grayscale client logos (Adobe, Spotify, Pinterest, Intuit, NN/g, Amazon) centered in a light bordered container. Logos rendered in #333 or desaturated to integrate with the monochrome palette. No logos in full brand color — uniformity signals trust through restraint.

### AI Assistant Pill Banner
**Role:** Top-of-page product announcement

Pill-shaped banner (88px–1000px radius) with light mint background (#e4f0f1 or #f2f8f7), thin border, star/sparkle icon prefix, body text 'AI-Assisted, Human Led: Trusted insights, delivered faster.' with a 'Explore AI Assistant →' link in teal.

### Illustration Panel
**Role:** Hero and section decorative visuals

Hand-drawn line illustrations of people inside browser/window frames, rendered in #231e21 (illustration ink) outlines with selective teal/rose color fills. Floating decorative elements (stars, arrows, circles, plant doodles) in #65b8a2, #d6aec1, and #cae1e2. The illustration style is the brand's strongest differentiator — it signals 'human research' over 'enterprise SaaS'.

### Checklist Feature List
**Role:** Feature benefit bullets in product cards

Vertical list with custom teal checkmark (✓ in #0e4749 or #1c5d5f, weight bold) as bullet, Sofia Pro 16px body text in #333 or #283338. 8px vertical gap between items. Each checkmark is slightly larger than the text and left-aligned in a fixed indent column.

### Card UI Mockup
**Role:** Product screenshot embeds within feature cards

Floating product UI cards with white background, 12px radius, thin border, showing form elements like filter chips, dropdown selectors, and stats. Embedded in the top portion of feature cards to give concrete product context above the textual benefits.

## Do's and Don'ts

### Do
- Use #1c5d5f filled teal as the sole primary action button color — one per viewport maximum
- Pair the teal primary with the navy #16325a filled button to signal a second product direction on the same page
- Set headline type in P22 Mackinac Pro at 44–64px with normal letter-spacing and 1.16–1.20 line-height
- Mark all section eyebrows with IBM Plex Mono uppercase 13–14px, tracking 0.038–0.059em, prefixed by a small colored dot
- Use 48px border-radius on all buttons and 1000px on nav pills for the signature rounded geometry
- Distinguish card surfaces with #e4f0f1 (mint) and #f2e8e2 (blush) fills, never with drop shadows
- Ground all illustrations in #231e21 line work with selective teal #65b8a2 and rose #d6aec1 fills

### Don't
- Don't add drop shadows to cards or panels — the system uses flat color layering only
- Don't use pure #ffffff as the page background — always use #f2f8f7 for the warm canvas tone
- Don't introduce additional button colors beyond teal, navy, and the ghost outline variants
- Don't set headlines in Sofia Pro — headlines must use the P22 Mackinac Pro serif to preserve the editorial identity
- Don't use system fonts for section labels — IBM Plex Mono with uppercase tracking is non-negotiable for eyebrows
- Don't use sharp or low-radius corners on buttons — 48px minimum, pill geometry is the signature
- Don't use photography in place of illustrations — the hand-drawn line-art style is the brand's visual anchor

## Elevation

Elevation is avoided entirely. Cards and panels are distinguished by background color shifts (canvas #f2f8f7 → mint #e4f0f1 → blush #f2e8e2) and 1px hairline borders rather than drop shadows. This flat-surface approach keeps the interface feeling like printed editorial material — paper, not glass. The only 'depth' in the system is the layering of background tones.

## Surfaces

- **Page Canvas** (`#f2f8f7`) — Primary page background, never pure white — the mint-tinted warm white
- **Card Mint** (`#e4f0f1`) — Standard card and feature panel surfaces
- **Blush Sand** (`#f2e8e2`) — Warm alternating section backgrounds and illustration washes
- **Sea Foam Wash** (`#cae1e2`) — Decorative highlight and light accent backgrounds

## Imagery

The visual language is defined by hand-drawn line illustrations rather than photography. Illustrations depict people (researchers, participants) inside stylized browser/window frames, rendered in #231e21 ink outlines with selective teal and rose fills. Floating decorative motifs — stars, arrows, circles, plus signs, plant doodles, speech bubbles — scatter around the figures in #65b8a2, #d6aec1, and #cae1e2. There is no lifestyle photography; the illustrated human IS the imagery. Product screenshots appear as small floating UI mockup cards (white surface, thin border) inside feature blocks, showing form elements and filter chips. Icons in the interface are minimal — small colored dots mark section labels rather than illustrative glyphs. The illustration style is the single most distinctive brand asset: it signals 'human research' and 'approachable' over 'enterprise platform'.

## Layout

Full-bleed canvas with max-width 1200px centered content. The hero is a split composition: large serif headline centered in the middle column with hand-drawn illustrations flanking both sides and a teal CTA button below the subtext. A trust-logo bar follows in a full-width bordered strip. Below the hero, content uses alternating surface bands: white canvas for product-introduction sections, mint (#e4f0f1) feature card backgrounds, and blush (#f2e8e2) for the stats banner — creating a warm-cool-warm rhythm. Feature sections use a two-column card layout (left: Recruit, right: Research Hub) on equal-width cards with product UI mockups. A full-width stat strip with mono uppercase text serves as social proof. The footer is minimal. Vertical rhythm uses 88px between major sections. Navigation is a top bar with logo left, centered nav links, and a teal 'Sign Up' button right.

## Similar Brands

- **Calendly** — Same pill-shaped buttons, light mint-tinted canvas, and flat-surface card approach with no drop shadows
- **Substack** — Same editorial serif headline treatment paired with warm off-white canvas and human-centered illustration tone
- **Notion** — Same restrained palette with a single brand teal as the sole saturated color, flat cards, and monochrome trust-logo bar
- **Zapier** — Same teal-primary CTA on warm off-white, with illustrated human characters in the hero as the brand signature
- **Typeform** — Same warm paper-like canvas, hand-drawn illustration style with people in browser frames, and editorial serif/sans typography pairing
