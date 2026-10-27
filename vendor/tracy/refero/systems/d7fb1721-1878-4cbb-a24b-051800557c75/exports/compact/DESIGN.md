# Dock — Style Reference
> Sunlit cream paper, cobalt pulse

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Dock operates in a sunlit, cream-warm workspace language: a soft #faf9f7 canvas replaces the usual pure-white SaaS backdrop, giving every screen a paper-like, approachable feel. Typography carries the weight — 84px Roobert display headlines sit alongside 16px body text with generous breathing room, letting the copy feel like confident printed prose rather than UI chrome. A single electric cobalt blue (#0068f9) punctuates the calm neutrals as the only interactive color: filled CTAs, active states, and links all share this vivid hue, while a secondary violet (#6736eb) appears sparingly as decorative accent. Components stay featherlight — pill-shaped buttons, hairline borders, soft elevated cards, and zero heavy shadows — so the product screenshots become the visual heroes rather than chrome around them.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas Cream | `#faf9f7` | Page background — warm off-white instead of pure white gives the entire system a paper-like, approachable feel |
| Surface Ivory | `#fbfaf7` | Card and panel surfaces — one step brighter than canvas to create subtle elevation without shadows |
| Pure White | `#ffffff` | Elevated surfaces, nav background, button text on filled CTAs |
| Lavender Mist | `#f4f0ff` | Decorative wash behind icons or highlight badges — cool counterpoint to the warm cream canvas |
| Powder Blue | `#d6e4f1` | Outlined/ghost button border, subtle blue-tinted dividers within product UI |
| Ink Charcoal | `#121722` | Primary text, headings, icons — near-black with a cool blue undertone (17.9:1 on white) |
| Deep Ink | `#1d1d1d` | Secondary text, dark surface fills for footer or dark mode moments |
| Mid Graphite | `#2d2d2d` | Dark surface for dark UI moments (footer dark blocks, modal overlays) |
| Slate Gray | `#777c86` | Secondary body text, card metadata, table labels |
| Steel Gray | `#a5a5a5` | Muted helper text, placeholder text, disabled states |
| Hairline | `#efefef` | Borders and dividers — barely-there separation between cards and sections |
| Faint Gray | `#cccccc` | Icon strokes in nav, subdued borders on neutral controls |
| Electric Cobalt | `#0068f9` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Deep Cobalt | `#024bb1` | Pressed/hover state for Electric Cobalt buttons — darker shade of the brand blue |
| Cerulean | `#0074dd` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Vivid Violet | `#6736eb` | Decorative accent — secondary brand color for highlight tags, illustrative elements, and customer logo treatments |
| Forest | `#046645` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |

## Typography

### Roobert — All text — single typeface carries the entire system. Headlines use 600–700 at 48–84px with extremely tight leading (1.06–1.09) creating dense, confident type blocks. Body and nav use 400–500 at 14–16px with generous 1.50–1.60 leading for readability on the cream background.
- **Substitute:** Inter (closest open alternative; matches geometric warmth and weight range), or Söhne / GT America if licensed
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13, 14, 15, 16, 18, 20, 24, 40, 48, 57, 84
- **Line height:** 1.06–1.60 (tight at display sizes: 84px→1.06, 57px→1.09; relaxed at body: 16px→1.56)
- **Letter spacing:** 0.077em across tracked elements (uppercase labels, small caps in nav)
- **OpenType features:** `"ss01" on, "kern" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | 0.077px |
| body | — | — | 16px | 1.56 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 20px | 1.38 | — |
| heading | — | — | 24px | 1.33 | — |
| heading-lg | — | — | 40px | 1.25 | — |
| heading-xl | — | — | 48px | 1.2 | — |
| display | — | — | 57px | 1.09 | — |
| display-lg | — | — | 84px | 1.06 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 16px
- **icons:** 60px
- **pills:** 100px
- **images:** 16px
- **buttons:** 48px
- **navItems:** 48px

## Components

### Primary Filled Button
**Role:** Main conversion action (e.g., Start for Free, Request Demo)

Background #0068f9, text #ffffff, weight 500 at 15–16px. 48px border-radius (pill shape). 12px 24px padding. No visible border. On hover darkens to #024bb1.

### Ghost/Neutral Button
**Role:** Secondary action (e.g., Request Demo beside a filled CTA)

Background #ffffff, text #121722, weight 500 at 15–16px. 48px border-radius. 1px border in #efefef. 12px 24px padding. Sits next to the filled CTA with equal weight, creating a paired-button pattern.

### Text Link
**Role:** Inline navigation within paragraphs or product UI

Color #0074dd or #0068f9, no underline by default, underline on hover. Weight 500 at body size.

### Top Navigation Bar
**Role:** Primary site navigation

Background #ffffff, 1px bottom border in #efefef. Logo left, nav links center (Product, Pricing, Customers, Resources with dropdown chevrons), auth actions right. Nav links at 14–15px weight 500 #121722. Right side has Log in (text) + Request Demo (ghost pill) + Start for Free (filled cobalt pill).

### Hero Section
**Role:** Above-the-fold headline and CTA

Background transitions from #faf9f7 to a soft blue gradient (#d5ecff → #f4f0ff) at the bottom. Headline at 84px weight 600, line-height 1.06, #121722, centered. Subtext at 18px weight 400 #121722, max-width ~640px. Two CTAs centered: ghost Request Demo + filled Start for Free.

### Product Feature Card
**Role:** Showcasing product capabilities (Deal Rooms, Enablement Agent, etc.)

Background #ffffff, 16px border-radius, 1px border in #efefef, subtle multi-layer shadow. Internal padding 24px. Often paired with a product screenshot that overflows the card or sits on a gradient background.

### Tab Bar
**Role:** Switching between product feature areas

Horizontal row of text labels (Deal Rooms, Enablement Agent, AI Documents, etc.). Active tab has #fbfaf7 pill background with 48px radius. Inactive tabs are plain #121722 text. No underlines or borders — the pill background is the only active indicator.

### Customer Stat Card
**Role:** Social proof with metrics (Lattice +25% win rate, BrightHire +22%, Loom 2 hours saved)

Background #fbfaf7 to #ffffff, 16px radius, 1px border #efefef. Company logo + product label at top (14–15px). Large metric at 40–48px weight 600 in #0068f9 (the cobalt) or #6736eb (violet) — color varies per card to add rhythm. No heavy shadow.

### Gradient CTA Banner
**Role:** Final conversion section (Want a deeper tour of Dock?)

Full-width background with a diagonal blue gradient from #faf9f7 through #c8dcf5 to #0068f9 in the lower-right corner. Headline at 48–57px weight 600 #121722, centered. Single filled cobalt button below. The gradient corner is the signature — it bleeds electric blue into the otherwise quiet page.

### Footer
**Role:** Site-wide links and legal

Background #ffffff, 1px top border in #efefef. 6-column grid of link lists (Product, Sales, Enablement, Customer Success, Templates, Resources, General). Section headers at 13–14px weight 600, links at 14px weight 400 #777c86. Logo top-left. Bottom bar with legal links + copyright at 13px #a5a5a5.

### Pricing Table Row
**Role:** Product pricing display within Deal Room UI

Background #ffffff, 1px bottom border #efefef. Column headers at 14px weight 500 #777c86. Data cells at 15–16px weight 400 #121722. Alternating subtle background optional. Total column right-aligned and weight 600.

### Checklist/Step Item
**Role:** Task tracking within product (Success Criteria, Next Steps)

Green circle check icon (#046645) for completed, hollow circle for pending. Text at 15px weight 400 #121722. Compact 6–8px row gap. Optional right-side badge (In Progress, Schedule call) in 8px radius pill with tinted background.

## Do's and Don'ts

### Do
- Use #faf9f7 as the page background — never substitute pure #ffffff for the canvas
- Apply the 48px pill radius to all buttons and the 16px radius to all cards
- Set primary action buttons to #0068f9 fill with #ffffff text at weight 500, 15–16px
- Use 84px Roobert weight 600 for hero headlines with line-height 1.06
- Pair a filled cobalt CTA with a white ghost CTA in hero sections for balanced hierarchy
- Use #efefef for all borders — never heavier than 1px
- Let the electric blue gradient corner appear only in the final CTA banner, not throughout

### Don't
- Don't use #ffffff as the page background — it kills the warm cream paper feel
- Don't use flat shadows (e.g., box-shadow: 0 4px 8px) — the system uses feather-light multi-layer shadows or none
- Don't add a second chromatic color to CTA buttons — #0068f9 is the only filled action color
- Don't set headline line-height above 1.15 — the tight leading at display sizes is signature
- Don't use #6736eb for CTAs or links — it's decorative accent only (tags, highlights, stat numbers)
- Don't add heavy gradients to cards or panels — gradients belong only in the CTA banner and hero background
- Don't use more than 1px borders in #efefef or #d6e4f1 — heavier strokes break the lightweight feel

## Elevation

- **Cards and panels:** `rgba(0, 0, 0, 0.07) 0px 1px 1px 0px, rgba(0, 0, 0, 0.04) 0px -1px 1px 0px inset, rgba(0, 0, 0, 0.14) 0px 0px 0px 0.5px inset`
- **Product screenshot images:** `rgba(0, 0, 0, 0.04) 0px 20px 20px -8px`

## Surfaces

- **Canvas Cream** (`#faf9f7`) — Page background — base layer for all content
- **Surface Ivory** (`#fbfaf7`) — Cards, panels — subtle lift from canvas without shadow
- **Pure White** (`#ffffff`) — Elevated cards, nav bar, input fields, button hover
- **Lavender Mist** (`#f4f0ff`) — Decorative highlight wash, hero gradient zones

## Imagery

Product screenshots are the dominant visual: real interface captures showing Deal Rooms, pricing tables, checklists, and file tabs — not mockups. These are presented in rounded 16px containers, often with a subtle soft shadow (rgba(0,0,0,0.04) 0px 20px 20px -8px) and positioned on a gradient or lavender mist background to make them float. Customer logos (Lattice, BrightHire, Loom) appear as compact marks paired with colored metric numbers. No lifestyle photography, no abstract illustrations, no 3D renders — the product IS the hero. Icons are minimal, monoline-style, used sparingly in nav and status indicators.

## Layout

Full-width page with max-width 1200px centered content. Hero is a centered stack: 84px headline → 18px subtext (max ~640px) → two pill buttons, sitting on a cream-to-blue gradient. Feature sections alternate between full-bleed gradient backgrounds and contained card grids. Product tabs (Deal Rooms, Enablement Agent, etc.) sit as a horizontal pill-bar above a large product screenshot. Social proof uses a 3-column card grid (Lattice / BrightHire / Loom) with company mark + product label + large colored metric. Final CTA is a full-bleed section with a diagonal blue gradient bleeding from the lower-right corner. Footer is a 6-column link grid on white. Vertical rhythm uses 80px section gaps; cards use 24px internal padding with 8px element gaps.

## Similar Brands

- **Linear** — Same single-accent-color discipline (Linear uses purple, Dock uses cobalt) against a warm light background with pill-shaped buttons and large confident type
- **Attio** — Warm cream/off-white canvas rather than pure white, soft rounded cards, single vivid interactive color, generous section spacing
- **Raycast** — Clean light SaaS with pill buttons, product screenshots as heroes, minimal chrome, and a single accent color doing all interactive work
- **Pitch** — Same approach of letting a custom geometric typeface carry the brand, with featherlight components and a gradient hero section as a signature moment
- **Loom** — Warm approachable light theme, rounded everything, and product UI shown as embedded screenshots rather than abstract illustrations
