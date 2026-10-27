# Micro — Style Reference
> sunrise over a digital meadow — a calm horizon gradient holding a quiet, ink-on-paper workspace beneath it.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Micro is a sunrise productivity workspace: a chromatic blue-to-teal gradient sky opens the page, then drops into a quiet, neutral canvas of warm off-white with a near-black ink text color. The signature typographic move pairs a chunky editorial display face (perfectlyNineties) for oversized headlines with a neutral workhorse (haffer) for the dense product UI — giving marketing pages a magazine-cover gravity and product screens a calm, readable density. Color is used as functional punctuation: one azure blue (#518bdb) for actions, plus a pastel accent system (mint, peach, lavender, teal-mist) for soft surface washes and a small multicolor icon palette (teal, pink, red, orange, green) that signals connectivity and categories. Components are flat-first, bordered and gently shadowed rather than heavily elevated; radii cluster at 8px and 14px, with 18px for the larger product cards. The overall feel is a software product that has been allowed to breathe — open, friendly, slightly nostalgic in its display type, but precise in its data-rich product surfaces.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#221f1c` | Primary text, dark CTA backgrounds, dark icon fills — warm near-black rather than neutral black keeps the palette from feeling clinical |
| Paper White | `#f5f5f5` | Page canvas, card backgrounds, subtle surface fills — the warm off-white that gives the product its paper-like base |
| Pure White | `#ffffff` | Elevated product card surfaces inside the app UI (inbox, context graph nodes) — one level above Paper White |
| Stone Gray | `#797267` | Secondary text, icon strokes, muted body copy — warm gray that stays in the same family as Ink Black |
| Pebble | `#8c8a88` | Tertiary text, disabled states, low-emphasis icons |
| Slate Edge | `#27272a` | Hairline borders on cards and inputs, subtle dividers |
| Azure Action | `linear-gradient(to right in oklab, rgb(81, 139, 219) 0%, rgb(54, 186, 184) 100%)` | Primary action background, focused links, active states, key icon accents — the one chromatic CTA color, vivid enough to register against the warm neutrals; Hero background gradient (Azure Action → Teal Pulse, left to right in oklab) — the signature opening visual |
| Teal Pulse | `#36bab8` | Teal text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Mint Wash | `#cbfbf1` | Soft pastel surface tint for feature cards and highlight washes |
| Peach Wash | `#f8ebd8` | Soft pastel surface tint, warm counterpart to Mint Wash |
| Lavender Wash | `#ede9fe` | Soft pastel surface tint for alternate feature blocks |
| Teal Mist | `#cff2ef` | Subtle teal-tinted surface, bridges brand teal and neutral canvas |
| Coral Marker | `#ed6d68` | Red text accent for links, tags, and emphasized short phrases |
| Amber Marker | `#e5a057` | Warm icon accent, category color in the multicolor icon palette |
| Orchid Marker | `#bf89cd` | Purple-toned icon accent, category color, decorative node edges in the context graph |
| Forest Edge | `#1a3a12` | Dark green border for the live-product mockup's edge treatment, deep botanical accent |
| Signal Green | `#3a6b2a` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Live Lime | `#7efa55` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |

## Typography

### perfectlyNineties — Display and editorial headlines (hero, section H1/H2, large marketing statements) — a chunky 70s/80s display face that gives the page magazine-cover weight. The 0.02em positive tracking at large sizes is a deliberate anti-trend: most modern display faces go tight, this one breathes open.
- **Substitute:** Druk Wide, Climate Crisis, Recoleta, or a heavy condensed serif like Playfair Display 900
- **Weights:** 400, 700, 800, 900
- **Sizes:** 14px, 24px, 30px, 36px, 48px, 72px
- **Line height:** 1.00, 1.20, 1.25
- **Letter spacing:** 0.0200em

### haffer — Primary workhorse for body, UI labels, buttons, nav, product chrome, card content, and the 96px hero brand mark. The tight -0.025em tracking at 24px+ creates compact, confident headings; the 0.10em tracking on 8-10px eyebrow/uppercase labels adds editorial rhythm.
- **Substitute:** Inter, Söhne, General Sans, or Geist Sans
- **Weights:** 400, 500, 600, 700, 900
- **Sizes:** 8px, 9px, 10px, 11px, 12px, 14px, 16px, 18px, 20px, 24px, 96px
- **Line height:** 1.00, 1.25, 1.33, 1.40, 1.43, 1.50, 1.56, 1.63
- **Letter spacing:** -0.0250em at display sizes; 0.10em at micro/eyebrow sizes

### ui-monospace — Monospace for timestamps, email addresses, technical metadata in inbox rows, and AI prompt placeholder text. The system-stack choice signals these are data, not prose.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or any system monospace
- **Weights:** 400, 500
- **Sizes:** 8px, 14px, 16px
- **Line height:** 1.43, 1.50, 1.71

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 10px | 1.4 | 1px |
| caption | — | — | 12px | 1.4 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 24px | 1.4 | -0.6px |
| heading | — | — | 30px | 1.25 | 0.6px |
| heading-lg | — | — | 48px | 1.2 | 0.96px |
| display | — | — | 72px | 1 | 1.44px |
| hero-mark | — | — | 96px | 1 | -2.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **pills:** 9999px
- **inputs:** 8px
- **buttons:** 8px
- **nav-pills:** 8px
- **large-cards:** 18px
- **small-cards:** 14px
- **feature-blocks:** 18px

## Components

### Dark Filled Button
**Role:** Primary action button on light backgrounds (Sign up, Get started)

Background #221f1c (Ink Black), text #ffffff, radius 8px, padding 10px 16px, haffer 500 at 14px, 1.4 line-height. Optional inset 0 -2px 0 0 rgba(0,0,0,0.2) for pressed state. Inverts to white-on-dark when used on the gradient hero.

### White Filled Button
**Role:** Secondary action on the gradient hero (Talk to sales)

Background #ffffff, text #221f1c, radius 8px, padding 10px 16px, haffer 500 at 14px. No border, no shadow — relies on the gradient backdrop for contrast.

### Ghost Text Button
**Role:** Tertiary / nav action (Log in, Learn more)

Transparent background, text #221f1c (or #ffffff on dark), radius 8px, padding 8px 12px, haffer 500 at 14px. No visible border; relies on hover state to reveal affordance.

### Pill Nav Tab
**Role:** Top-bar navigation items (Product, Resources, Pricing, Careers)

Transparent background, text #221f1c haffer 500 14px, trailing 6px chevron icon in #797267, padding 6px 12px, radius 8px. Active state: #f5f5f5 fill. Lighter and more compact than buttons — nav reads as a row of whispers, not shouts.

### Product Card (App UI)
**Role:** Inbox row, task row, person/company record inside the product

Background #ffffff, border 1px solid rgba(0,0,0,0.065), radius 14px, padding 12px 16px, haffer 400 at 14px for primary text and #797267 for secondary timestamps. Left-side avatar/initial in a 32px circle, optional unread dot in #518bdb.

### Context Graph Node
**Role:** Floating data card in the 'personal context graph' visualization

Background #ffffff, radius 18px, padding 16px, haffer 500-700 at 12-14px, a 2-3px accent border in one of the marker colors (Teal Pulse, Coral Marker, Orchid Marker, Azure Action). Connected by thin 1px lines in #797267 at 0.4 opacity. The accent border color is the categorical signal — same data shape, different domain.

### Soft Pastel Feature Block
**Role:** Marketing feature card with tinted background

Background one of the pastel washes (#cbfbf1, #f8ebd8, #ede9fe, #cff2ef), radius 18px, padding 32px, no border, no shadow. Headline in haffer 600 at 20-24px in #221f1c, supporting body in haffer 400 at 14px in #797267. The pastel fill IS the visual interest — no icons or illustrations needed inside.

### Search / Prompt Input
**Role:** AI ask-bar at top of the product ('Ask Micro AI anything...') and search fields

Background #ffffff, border 1px solid #27272a at low opacity, radius 8px, padding 10px 14px, haffer 400 at 14px, placeholder in #8c8a88. Focus state: 2px ring in #518bdb. Left-side icon (search or sparkle) in #797267, optional right-side mic icon.

### Sidebar Nav Item
**Role:** Left-rail navigation inside the product (Home, Inbox, People, Companies, Tasks)

Transparent background, 20px row height, 12px horizontal padding, radius 8px, 14px haffer 400 in #221f1c. Active state: #f5f5f5 fill, haffer 500 weight. Leading 16px icon in #797267 (active: #221f1c). Generous vertical breathing room — sidebar is quiet chrome, not a feature wall.

### Badge / Tag
**Role:** Category tags, status pills (Important, VIPs, All DMs)

Background transparent or #f5f5f5, text #221f1c, radius 9999px, padding 4px 10px, haffer 500 at 12px. For colored status: background in marker color at 0.15 opacity, text in the same marker color at full opacity. No border.

### Logo Strip
**Role:** Social-proof row of customer/investor logos

Single horizontal row, 5-6 monochrome logos in #221f1c, evenly spaced with 48-64px gap. Each logo is a simple geometric mark + wordmark at 18-20px haffer 600. No background card — logos float on the canvas.

### Floating Audio Player
**Role:** Bottom-right media player widget (New Computer track card)

Background #ffffff, radius 14px, shadow 0px 10px 15px -3px rgba(0,0,0,0.1), padding 8px 12px, 280-320px wide. 40px album art on left, track title in haffer 600 12px #221f1c, artist in haffer 400 10px #797267, transport controls on the right in #797267 with one accent (play) in #221f1c.

### Hero Product Mockup Container
**Role:** The floating app screenshot that overlaps the gradient sky and the green field below the fold

No visible card chrome — the screenshot is presented edge-to-edge with a subtle 0px 10px 15px shadow, 18px corner radius, and a 1px #1a3a12 (Forest Edge) border that gives it a framed-on-the-meadow feel. The border color is the signature: it ties the product UI to the green ground beneath it.

### Section Eyebrow Pill
**Role:** Small label above headlines (e.g., 'Watch the launch video')

Background #ffffff at 0.9 opacity, radius 9999px, padding 4px 12px, haffer 500 at 12px in #221f1c, optional leading icon at 12px. Floats above the headline with 16px gap.

## Do's and Don'ts

### Do
- Use the blue→teal gradient only on the hero; it is the single saturated viewport in the system and defines the brand opening
- Set hero and section display headlines in perfectlyNineties at 30-72px with 0.02em positive tracking — the open tracking is the signature
- Set body and product UI in haffer, not in the display face — the contrast between editorial and neutral is the typographic identity
- Use 8px radius for buttons, inputs, and nav; 14px for product rows; 18px for feature blocks and graph nodes — do not mix freely
- Keep product surfaces #ffffff with a 1px border and the subtle two-layer shadow — never heavy elevation
- Reach for the pastel washes (#cbfbf1, #f8ebd8, #ede9fe, #cff2ef) for marketing feature blocks; let the canvas stay #f5f5f5
- Color icons categorically with Teal Pulse, Coral Marker, Amber Marker, Orchid Marker, and Azure Action — never monochrome the icon set

### Don't
- Do not apply the gradient sky to anything other than the top of the page — repeating it kills the opening impact
- Do not use perfectlyNineties for body text, buttons, nav, or product UI — it is a display face only and will crush at small sizes
- Do not skip the 1px border on product cards — the system relies on hairline edges, not shadows, to define surfaces
- Do not use 4px radius on feature cards or marketing blocks — 4px is reserved for small chrome and icons, the card hierarchy starts at 8px
- Do not introduce new chromatic accents beyond the named marker palette — the multicolor icon system is closed
- Do not center body copy in the product UI — left-align data; the only centered text is the hero headline and section H1s
- Do not use pure black #000000 for text — use #221f1c Ink Black; the warm undertone is part of the paper-on-ink feel

## Elevation

- **Default card:** `0px 1px 3px rgba(0,0,0,0.1), 0px 1px 2px -1px rgba(0,0,0,0.1)`
- **Bordered card:** `0px 0px 0px 1px oklab(0.24 0.003 0.007 / 0.065), 0px 1px 3px rgba(0,0,0,0.1), 0px 1px 2px -1px rgba(0,0,0,0.1)`
- **Elevated product mockup / floating panel:** `0px 10px 15px -3px rgba(0,0,0,0.1), 0px 4px 6px -4px rgba(0,0,0,0.1)`
- **Pressed button / active link:** `inset 0px -2px 0px 0px rgba(0,0,0,0.2)`

## Surfaces

- **Canvas** (`#f5f5f5`) — Page background, the warm off-white base layer
- **Card** (`#ffffff`) — Product UI cards, feature blocks, elevated content panels
- **Pastel Wash** (`#cbfbf1`) — Soft tinted surface for highlight features and category blocks
- **Gradient Sky** (`#518bdb`) — Hero-only gradient background, the one place saturated color fills the viewport

## Imagery

Imagery is sparse and product-led: no lifestyle photography, no stock imagery. The hero is a full-bleed gradient sky over a green field, with a single floating product mockup that overlaps the horizon line — the product is the hero. Subsequent sections rely on large product UI screenshots (inbox, context graph) presented as floating cards with subtle shadows. The context graph is the most distinctive visual: a constellation of white data nodes connected by hairline lines, each node ringed in a different marker color, creating a network-as-illustration effect. Icons are multicolor line-and-fill marks in the brand palette. A small audio player widget (album art + transport) sits in the bottom-right corner as a persistent, almost decorative UI element. No 3D, no illustration system — the visual richness comes from data visualization and product UI itself.

## Layout

Page is max-width ~1200px centered, with the hero breaking full-bleed for the gradient sky. The hero itself is a vertical stack: centered eyebrow pill, centered oversized display headline in perfectlyNineties, centered subhead in haffer, centered button pair, then the product mockup floating at the bottom edge, overlapping the transition to the white canvas below. Below the hero, sections follow a consistent rhythm: centered section H1, centered supporting copy, then content arranged in 2-column (text + visual) or 3-4 column card grids. The context graph section is the most distinctive layout — a wide horizontal data visualization that fills the content width, followed by a 4-column feature grid below it. Social proof is a single centered row of monochrome logos. Navigation is a top bar with a left-aligned wordmark, centered nav pills, and right-aligned auth buttons. The product UI itself, shown in screenshots, has a fixed left sidebar (~200px), a top utility bar, and a main content area — a classic 3-zone productivity app shell.

## Similar Brands

- **Notion** — Same warm off-white canvas with near-black ink text, product-led hero with a single bold headline, and a similar reliance on subtle 1px borders rather than heavy shadows
- **Linear** — Compact product UI density, dark filled primary buttons on light backgrounds, and a multicolor accent system used categorically across icons and tags
- **Arc Browser** — Bold gradient hero paired with a quieter product surface below, and a willingness to use a distinctive display typeface (not just another geometric sans) for brand personality
- **Figma** — Pastel-tinted feature blocks floating on a neutral canvas, with the product UI itself doing the visual heavy lifting rather than illustration or photography
