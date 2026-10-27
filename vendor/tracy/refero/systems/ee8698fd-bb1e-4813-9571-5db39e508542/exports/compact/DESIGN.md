# Tailark Pro — Style Reference
> white gallery wall with violet sparks — a curated component museum

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tailark Pro is a gallery-grade component library interface: near-pure white canvas, hairline-bordered cards, and compact system-sans typography that recedes to let illustrated UI snippets breathe. A single vivid violet (#615fff) anchors the brand across icons, links, and the logo mark, while illustration previews introduce controlled chromatic punctuation — greens, oranges, yellows, reds — as colored tags, icons, and accent fills within the mockups. Surfaces are distinguished by 1px oklab-tinted borders and very soft 3–4 step shadows rather than heavy elevation, producing a flat, architecturally precise rhythm. Components are lightweight, monoline, and unembellished — the aesthetic echoes shadcn/ui and Geist-era Tailwind documentation, treating the white page as a museum wall for the components themselves.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Violet | `#615fff` | Logo mark, link text, icon accents, brand-colored borders and fills — the single chromatic anchor that signals the brand across an otherwise achromatic interface |
| Ink | `#09090b` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Paper | `#ffffff` | Page background, card surface, button surface — the dominant canvas |
| Hairline | `#e4e4e7` | Dividers, card borders, input borders, subtle structural separation |
| Graphite | `#52525c` | Secondary body text, descriptions, muted labels, caption text |
| Slate | `#848485` | Tertiary text, meta labels, inactive nav items, placeholder content |
| Charcoal | `#404040` | Dark surface for filled buttons and emphasis panels |
| Pure Black | `#000000` | SVG icon fills, deepest contrast for illustration artwork |
| Mint | `#00bc7d` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Forest | `#0d542b` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Amber | `#fe9a00` | Yellow supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Sunburst | `#ffb900` | Yellow supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Rust | `#e17100` | Orange supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Crimson | `#ec003f` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Maroon | `#82181a` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Ultraviolet | `#8200db` | Illustration accent violet, tag variant |
| Iris | `#9810fa` | Illustration accent purple, tag variant |
| Cobalt | `#155dfc` | Illustration accent blue, tag variant |
| Midnight | `#1c398e` | Illustration accent indigo, tag variant |
| Lilac Mist | `#dfdfff` | Soft violet surface wash, subtle card highlight |

## Typography

### ui-sans-serif (system: Inter / Geist Sans / SF Pro) — All UI text — body at 14px/1.43, labels and tags at 12px/1.33, navigation at 13–14px, subheadings at 16–18px, and display headings at 30px. The 30px display step is notably restrained — this system does not shout at scale; it informs through compact hierarchy
- **Substitute:** Inter, Geist Sans, system-ui
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 11px, 12px, 13px, 14px, 16px, 18px, 20px, 30px
- **Line height:** 1.20–1.71
- **Letter spacing:** normal throughout

### Geist Mono — Numeric data displays (invoice amounts, invoice numbers, code labels, metrics) — the monospace brings technical precision to data-heavy illustration cards. 10–12px for inline code/metric tags, 24–30px for prominent figures
- **Substitute:** JetBrains Mono, IBM Plex Mono, ui-monospace
- **Weights:** 100, 400, 600
- **Sizes:** 10px, 12px, 24px, 30px
- **Line height:** 1.20–1.50

### Mulish — Mulish — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.43

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | — |
| body | — | — | 14px | 1.43 | — |
| heading-sm | — | — | 18px | 1.56 | — |
| heading | — | — | 20px | 1.63 | — |
| display | — | — | 30px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 48px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 6px
- **cards:** 12px
- **inputs:** 6px
- **buttons:** 6px
- **featureCards:** 32px
- **galleryCards:** 16px

## Components

### Top Navigation Bar
**Role:** Global site header

Fixed white bar with 1px Hairline (#e4e4e7) bottom border. Left: violet logo mark + 'Tailark Pro' wordmark. Center-right: search icon, theme toggle, nav links (Illustrations, Blocks, Pages, Pricing, Docs) at 13–14px weight 500 in Graphite (#52525c), active link in Ink. Right: 'Login' text link + 'Get Tailark Pro' filled black CTA at 6px radius, 12px padding vertical, 16px horizontal, white text weight 500.

### Page Header
**Role:** Section title block

Centered single-line title at 30px weight 600 in Ink, with a large muted count number ('123') at 30px weight 300 in Slate (#848485) appended inline. Generous vertical padding (~48–64px) above and below.

### Illustration Gallery Card
**Role:** Showcase tile for a component illustration

White card, 12px radius, 1px Hairline border + soft 4px shadow. No explicit padding — the illustration mockup fills the card edge-to-edge with internal whitespace. The illustration mockup is a white mini-canvas (~160–200px square) with its own internal layout, topped or bottomed by a colored tag.

### Color Tag Badge
**Role:** Label overlay on illustration cards

Small pill or rectangle at 6px radius, positioned at bottom-right or bottom-left of the illustration card. Variants include: Mint (#00bc7d) solid fill white text, Amber (#fe9a00) solid fill white text, Crimson (#ec003f) solid fill white text, Sunburst (#ffb900) solid fill Ink text, Ultraviolet (#8200db) solid fill white text, and a '123' count tag in a light gray. ~6px vertical, 8–10px horizontal padding, 11–12px text weight 500.

### Filled Dark CTA Button
**Role:** Primary action button (Get Tailark Pro)

Ink (#09090b) background, white text, 6px radius, 12px vertical × 16px horizontal padding, 13–14px weight 500. No visible border — relies on contrast alone. Inner 1px oklab-tinted inset shadow at 5% opacity adds subtle definition.

### Ghost Text Button
**Role:** Secondary navigation action (Login)

Transparent background, Graphite (#52525c) text, no border, 13–14px weight 500. Sits inline beside the filled CTA without competing.

### Outline Tag / Pill
**Role:** Selectable filter or label tag

White background, 1px Hairline border, 6px radius, 12px text weight 500 in Ink. Used for category filters or metadata pills.

### Search Input
**Role:** Command/search field in nav

Transparent or subtle background, 6px radius, 13–14px text. Magnifying glass icon left-aligned. Borderless or with 1px Hairline at 5% opacity inset shadow.

### Illustration Mini-Mockup — Invoice Card
**Role:** Component preview artwork (finance domain)

White inner card, 12px radius, soft shadow, containing invoice number at 10–12px Geist Mono weight 400, large amount in 30px Geist Mono weight 600 in Ink, and form fields (To, From, Address) with Hairline underlines. Demonstrates a data-heavy finance component.

### Illustration Mini-Mockup — Invoice Tag Trio
**Role:** Component preview artwork (currency tags)

Three overlapping currency tags (BTC, USD, EURO) fanned at slight rotation. Each tag is white with 12px radius, 1px Hairline border, 2–4px gap between tags, with monospace text in Mint/Forest or Cobalt.

### Illustration Mini-Mockup — Loyalty Program Card
**Role:** Component preview artwork (promotional)

White card with 'Loyalty program' text, two 'Start Date' mini-cards side by side each with a colored top accent bar (Cobalt, Ultraviolet), 8px radius, 12px padding.

### Illustration Mini-Mockup — Chat Notification
**Role:** Component preview artwork (social/notification)

White card with avatar circle, name in 14px weight 600 Ink, message body at 12–13px weight 400 Graphite. Mint dot indicator for unread. 12px radius card, 16px padding.

### Illustration Mini-Mockup — Spending Limit Banner
**Role:** Component preview artwork (alert/warning)

White card with 'Spending Limit' title weight 600, supporting text at 12–13px Graphite, and a progress bar in Cobalt at ~40% fill on a Hairline track. 16px radius.

### Stat Row
**Role:** Metadata display row

Inline label-value pair: label at 12px Graphite weight 400, value at 12–13px Ink weight 600, separated by ~8px gap. Used in footer/status contexts.

## Do's and Don'ts

### Do
- Use 6px radius for all buttons, inputs, and tags — the small radius is the system's structural signature
- Pair #615fff Violet with white for the logo mark, link text, and active nav states — let it be the only chromatic element on chrome
- Use Geist Mono at 30px weight 600 for any prominent numeric figure in illustrations — this is the hero data treatment
- Build cards with a 1px Hairline (#e4e4e7) border plus the 3-step shadow stack (border + 4px/2px soft drop) — borders carry the weight, shadows whisper
- Keep the page canvas #ffffff; let illustration mockups introduce color internally rather than using colored section backgrounds
- Use the chromatic tag palette (Mint, Amber, Crimson, Sunburst, Ultraviolet, Iris) as small 24–32px badge overlays on cards — never as full-width elements
- Set page max-width to 1280px and maintain 4-column to 2-column gallery grids with 8–12px gaps between cards

### Don't
- Do not use colored section backgrounds — the canvas must stay white; color lives inside component cards only
- Do not use heavy drop shadows or glow effects — elevation is a 3-step whisper, not a 10–20px drop
- Do not exceed 30px for headings — this system communicates through compact hierarchy, not scale
- Do not use large radii (32px+) on buttons, inputs, or tags — reserve them for feature-level cards only
- Do not introduce more than one chromatic accent on any single chrome element — the violet is solo, tags are solo
- Do not use #ec003f Crimson, #fe9a00 Amber, or #ffb900 Sunburst for body text or large fills — they are tag/badge-only
- Do not center-align body copy or long descriptions — use left-align with max-width to preserve the gallery rhythm

## Elevation

- **Buttons:** `oklab(0.141 0.00136173 -0.00480696 / 0.05) 0px 0px 0px 1px`
- **Cards (resting):** `oklab(0 0 0 / 0.075) 0px 0px 0px 1px`
- **Cards (elevated):** `oklab(0 0 0 / 0.075) 0px 0px 0px 1px, oklab(0 0 0 / 0.065) 0px 4px 6px -1px, oklab(0 0 0 / 0.065) 0px 2px 4px -2px`
- **Cards (hover/lifted):** `oklab(0 0 0 / 0.075) 0px 0px 0px 1px, oklab(0 0 0 / 0.065) 0px 10px 15px -3px, oklab(0 0 0 / 0.065) 0px 4px 6px -4px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Dominant page background
- **Card Surface** (`#ffffff`) — Component illustration cards on the gallery — same white as canvas, distinguished only by hairline border and shadow
- **Soft Wash** (`#fef3c6`) — Subtle colored backgrounds within illustration mockups
- **Mint Wash** (`#b1eede`) — Illustration highlight surface
- **Charcoal Button** (`#09090b`) — Filled CTA button surface — only dark surface in the system

## Imagery

The site is a gallery of illustrated UI component mockups — the imagery IS the product. Each card contains a miniature, self-contained UI scene: invoice cards, currency tags, loyalty program cards, chat notifications, spending limit banners. Mockups are rendered in flat 2D with soft shadows, monoline structure, and restrained color washes (soft yellows, mints, lavenders as background fills within mockups). Icons are outlined or filled in Ink at 16–20px. There is no photography, no 3D, no human imagery — the visual language is pure product UI rendered at miniature scale, presented like specimens in a museum case.

## Layout

Full-bleed white page with a centered 1280px max-width content area. Top navigation is a fixed white bar with logo left, nav links center-right, CTA far right. The page header is a single centered line ('Tailark Pro Illustrations' + muted count) with generous vertical breathing room above and below. The gallery is a responsive grid: 4 columns on wide screens, collapsing to 2–3 columns on narrower viewports, with 8–12px gaps and tall card aspect ratios. Cards are uniform in size creating a strict modular rhythm. No alternating section bands, no hero image, no testimonials — the layout is gallery-grid purity, letting the component mockups be the only visual content. The page reads as a museum wall: white, flat, precise, with the objects (illustration cards) arranged in perfect columns.

## Similar Brands

- **shadcn/ui** — Same ultra-clean white canvas, 1px hairline borders, near-black filled CTAs, and system-sans typography — the documentation site aesthetic applied to a component gallery
- **Vercel Geist** — Shared Geist Mono for numeric data, minimal radius (6px), and the same white-on-black CTA pattern with hairline separators in navigation
- **Untitled UI** — Both present component illustrations in a strict grid gallery with 12–16px card radii, hairline borders, and compact system-sans labels
- **Magic UI** — Component-library marketplace layout with centered page titles, 4-column gallery grids, and colored tag overlays on white illustration cards
- **Aceternity UI** — Same museum-wall approach to showcasing UI components — white canvas, generous vertical rhythm, illustration mockups as the sole visual content
