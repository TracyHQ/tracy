# ClickUp™ — Style Reference
> Hardworking dashboard on white marble. The page is a product brochure for a productivity tool, so the visual language borrows from the product itself: dense lists, status pills, avatar clusters, and bold typographic claims that read like a product spec sheet at exhibition scale.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ClickUp speaks in a sharp, high-contrast productivity dialect: a white canvas where oversized bold headlines (52-80px, weight 650-800, tracking pulled to -0.04em) collide with compact 14px button labels and a black filled CTA. The signature move is the 9999px pill — chips, tags, nav items, and badges all share one relentless full-radius curve, giving the interface a soft, rounded personality against otherwise hard typographic weight. Color is used surgically: a single vivid purple (#6647f0) stamps brand identity, blue (#0091ff) handles interactive links, and the rest of the system is pure grayscale. Rotating conic-gradient borders animate around hero elements, the only moment the page lets its hair down. The product UI screenshot on the right of the hero anchors the brand: real, dense, working software — not abstract gradients or stock illustration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal White | `#ffffff` | Page background, card surfaces, button fills — the default canvas against which every other color is placed |
| Ink Black | `#202020` | Primary action fills, headline text, filled CTA buttons — near-black at 12.9:1 on white for confident authority without pure #000 harshness |
| Onyx | `#090c1d` | Headlines at maximum scale (48-80px display) — the deepest near-black with a barely perceptible cool tint |
| Carbon | `#2a2a2a` | Card borders, button text on light fills, section dividers — the workhorse dark neutral for structural elements |
| Slate | `#646464` | Body text secondary, link text, nav labels, icon fills — carries the 153-occurrence body copy load |
| Ash | `#838383` | Tertiary text, muted nav, meta labels, disabled states — recedes into the background hierarchy |
| Fog | `#b3b3b3` | Card borders at low contrast, subtle dividers, placeholder accents — the lightest border that still reads on white |
| Cloud | `#d4d4d4` | Hairline borders, dashed dividers, input outlines — appears 49× as borderColor |
| Bone | `#e8e8e8` | Default border color (88× in buttons), the most-used border tone in the system |
| Mist | `#f8f9fa` | Light neutral action fill for buttons on dark surfaces. |
| Plaster | `#e9ebf0` | Body section background band — appears 500×, the large neutral that breaks white sections |
| Mercury | `#eeeeee` | Badge text, card accents, neutral chip backgrounds — soft contrast for non-interactive surfaces |
| Brand Violet | `#6647f0` | Violet state accent for badges, validation surfaces, and short status labels. |
| Signal Blue | `#0091ff` | Blue accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Mint | `#6ee7b7` | Green text accent for links, tags, and emphasized short phrases |
| Emerald | `#00c07a` | Green outline accent for tags, dividers, and focused UI edges |
| Teal Tag | `#16c0a4` | Teal state accent for badges, validation surfaces, and short status labels. |
| Rainbow Conic | `conic-gradient(from 90deg, rgb(125, 91, 231) 19%, rgb(188, 63, 218) 28%, rgb(250, 36, 206) 37%, rgb(251, 73, 165) 45%, rgb(252, 109, 123) 52%, rgb(253, 132, 97) 55%, rgb(253, 154, 70) 58%, rgb(246, 135, 198) 65%, rgb(163, 160, 224) 80%, rgb(79, 185, 250) 95%, rgb(0, 145, 255) 100%)` | Animated conic-gradient border rotating around hero CTAs and Brain² element — the brand's most expressive moment |
| Primary Gradient | `linear-gradient(83deg,rgba(64,221,255) -5%,rgba(118,18,250) 51%,rgba(250,18,227) 125%)` | Cyan-to-magenta linear gradient for premium brand moments, 83deg angle — the system gradient for hero text and premium badges |
| Dark Fade | `linear-gradient(rgb(17, 17, 17) 24%, rgb(0, 0, 0))` | Section-level dark gradient from charcoal to true black — used on dark feature panels |

## Typography

### Plus Jakarta Sans — Primary brand typeface — handles all display headings (48-80px at weight 650-800, tracking -0.04em), body copy (16px/400), and button labels (14px/700). The geometric humanist proportions give headlines a confident, modern stance. Weight 800 at 42px for ultra-bold emphasis. Substitute: Inter or General Sans if unavailable.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 650, 700, 800
- **Sizes:** 14, 16, 34, 42, 48, 52, 60, 80
- **Line height:** 1.05–1.50
- **Letter spacing:** -0.0400em at 80px/52px, -0.0350em at 60px/48px, -0.0230em at 34px, normal at 16px body
- **OpenType features:** `"calt" 0`

### Inter — Secondary workhorse for supporting copy, body text in cards, captions, and micro-labels (8-24px). Used where Plus Jakarta would be too heavy or where extra x-height clarity is needed. Substitute: system-ui.
- **Substitute:** system-ui
- **Weights:** 400, 500, 600, 650, 700
- **Sizes:** 8, 12, 14, 15, 16, 17, 18, 19, 20, 24
- **Line height:** 0.90–1.57
- **Letter spacing:** -0.0260em at 24px, -0.0200em at 20px, -0.0140em at 18px, -0.0100em at 16px, -0.0080em at 8px
- **OpenType features:** `"calt" 0, "clig" 0, "liga" 0`

### Sometype Mono — Monospaced accent for 'status' labels, feature tags, code-like annotations, and the 10px tracking-wide uppercase meta labels (ls=0.0600-0.0800em). Brings a technical, almost developer-tool personality. Substitute: JetBrains Mono or IBM Plex Mono.
- **Substitute:** JetBrains Mono
- **Weights:** 400, 500
- **Sizes:** 10, 12, 14, 16, 40
- **Line height:** 1.10–2.00
- **Letter spacing:** 0.0600em at 12px uppercase, 0.0800em at 10px uppercase, -0.0080em at body sizes

### SF Pro — SF Pro — detected in extracted data but not described by AI
- **Weights:** 500, 590
- **Sizes:** 12px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.5 | -0.01px |
| body | — | — | 16px | 1.5 | -0.01px |
| subheading | — | — | 20px | 1.5 | -0.02px |
| heading-sm | — | — | 34px | 1.2 | -0.04px |
| heading | — | — | 48px | 1.25 | -0.035px |
| heading-lg | — | — | 60px | 1.1 | -0.035px |
| display | — | — | 80px | 1.2 | -0.04px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 28px
- **Element gap:** 12px

### Border Radius

- **tags:** 100px
- **cards:** 12px
- **badges:** 9999px
- **images:** 16px
- **inputs:** 9px
- **buttons:** 9999px
- **largeCards:** 20px

## Components

### Filled Dark CTA Button
**Role:** Primary action — the most important button on any page

Background #202020, text #ffffff at 14px Plus Jakarta Sans weight 700, border-radius 9999px (fully pill-shaped), padding 12px 24px, no border. Single solid color, no shadow. Used for 'Get started. It's FREE!', 'Sign Up' in header.

### Ghost Outline Button
**Role:** Secondary action or alternative path

Background transparent, 1px border in #e8e8e8 or #0091ff (blue for interactive, gray for neutral), text #202020 at 14px weight 700, border-radius 9999px, padding 10px 20px. The blue-border variant signals a chromatic outlined action.

### Nav Pill Button
**Role:** Compact interactive element in header/nav strips

Background rgba(0,0,0,0.04) hover, text #2a2a2a at 14-16px, border-radius 9999px, padding 4px 12px (very compact). No visible border. Sits inline with other nav items.

### Feature Tag Pill
**Role:** Category or feature tags (e.g., 'Projects', 'Docs', 'Chat')

Background transparent or #f8f9fa, text #202020 or #0091ff at 14px weight 700, border-radius 9999px, padding 8px 16px, no border or 1px #e8e8e8. The blue-text variant indicates the currently active or highlighted tag.

### Product Screenshot Card
**Role:** Hero image container — the product UI screenshot on the right side of the hero

No background fill, border-radius 12px, no shadow, the screenshot sits on the white canvas with breathing room. Padding 0 (screenshot is the content). 16-32px corner radius on screenshot itself.

### Stat Callout Card
**Role:** Large-number statistics in social proof sections (e.g., '85%', '3M+')

White background (#ffffff), no border, no shadow, padding 28px. Number in Plus Jakarta Sans 60-80px weight 700, tracking -0.04em, color #090c1d. Caption below in Inter 16-18px, color #646464.

### Dark Feature Card
**Role:** Dark surface card for contrast sections (the 'Brain' feature block)

Background #000000 to #191919 with subtle linear-gradient fade, border-radius 12-16px, no visible border, padding 40-80px vertical. White text (#ffffff) for headings at 48-60px weight 650, gray text (#b3b3b3) for body.

### Trust Badge Strip
**Role:** 'Trusted by' logo row beneath hero

No background, horizontal flex layout, logos rendered in #838383 to #202020 grayscale. No borders, no cards. Heading label 'TRUSTED BY THE BEST' in Sometype Mono 10px weight 400, tracking 0.08em, uppercase, color #838383.

### Rounded Avatar Cluster
**Role:** User avatar groups in product UI (Inbox, Tasks views)

Circular avatars (border-radius 9999px), 24-32px diameter, overlapping by ~8px, 1-2px white stroke border to separate overlapping faces. Mix of brand-tinted and neutral fills.

### G2 Award Badge
**Role:** 'Best Software' award badges in social proof grid

White card with 1px #d4d4d4 border, border-radius 8px, padding 16px, G2 red logo top-left, tier text centered, orange/blue gradient chevron at bottom. 3-column grid arrangement.

### Conic Gradient Border Element
**Role:** Hero CTA or premium feature element with animated rainbow border

1.5-2px conic-gradient border rotating at 0.45s linear infinite, starting from 90deg, cycling through #7d5be7 → #bc3fda → #fa24ce → #fb49a5 → #fc6d7b → #fd8461 → #fd9a46 → #f687c6 → #a3a0e0 → #4fb9fa → #0091ff. Inner fill white. Border-radius 9999px for pill, 12-20px for cards.

### Checkmark List Item
**Role:** Benefit bullets in hero (✓ Save money. ✓ Save time. ✓ Create infinite productivity.)

Blue checkmark icon (#0091ff) at 18px, bold lead text (#202020, 14-16px weight 600-700) followed by regular-weight descriptor text in #646464. 8-12px row gap between items.

### Status Pill (In UI Screenshot)
**Role:** In-product status indicators visible in hero screenshot

Pill-shaped with border-radius 9999px, small text 10-12px weight 600, colored backgrounds: green #6ee7b7 bg with dark text for 'DONE', blue #0091ff bg with white text for 'IN PROGRESS', pink/magenta for overdue. Padding 3px 9px.

## Do's and Don'ts

### Do
- Use Plus Jakarta Sans at weight 650-800 for any display text 34px or larger — the heavy weight with tight tracking is the brand's typographic signature
- Default all buttons, tags, and badges to border-radius 9999px — the fully-pill curve is the system's most consistent geometric choice
- Use #202020 (not pure #000) for filled CTA buttons and headline text — the slight softness reads more premium than absolute black
- Apply -0.04em letter-spacing to all display text 48px+ — the aggressive negative tracking is what makes the headlines feel confident rather than shy
- Use #6647f0 purple exclusively for brand identity moments (badges, Brain² tags, brand icon) — never as a primary action fill
- Maintain a 4px spacing base unit; snap all padding and margin values to multiples of 4
- Use 1px solid #e8e8e8 as the default border — 88 occurrences in buttons make it the structural baseline
- Add the rotating conic-gradient border to one hero element per page — restraint keeps the rainbow effect from becoming visual noise

### Don't
- Don't use #000000 for large text fills or backgrounds — use #202020 (Ink Black) or #090c1d (Onyx) instead for softer contrast
- Don't mix multiple border-radius values on the same component level — if buttons are 9999px, every button stays 9999px
- Don't use Plus Jakarta Sans below 14px — it gets too geometric for small text; switch to Inter for body-sm and caption roles
- Don't apply the brand purple #6647f0 to primary CTA buttons — it appears only on badges and brand marks
- Don't stack more than two surface elevation levels in a single section — the system relies on flat hierarchy, not deep shadow stacking
- Don't use letter-spacing wider than 0 for any body text — positive tracking appears only on uppercase mono labels
- Don't use Inter as a display font — it lacks the geometric authority of Plus Jakarta Sans at large sizes
- Don't add decorative gradients to cards or section backgrounds — gradients belong only in the conic border animation and hero text

## Elevation

The system treats elevation as negative space rather than positive shadow. Cards are defined by 1px #e8e8e8 borders or subtle #f8f9fa background shifts, not by drop shadows. The single exception is the product screenshot card which gets a soft directional shadow to lift it off the canvas. This flat-first approach makes the rare shadow (and the animated conic gradient) feel dramatic by contrast.

## Surfaces

- **Canvas** (`#ffffff`) — Page background — the default surface for 95% of the page
- **Card** (`#f8f9fa`) — Elevated card surface, subtle off-white for content blocks and secondary panels
- **Section Band** (`#e9ebf0`) — Large alternating section background to break white rhythm (appears 500× as body bg)
- **Dark Panel** (`#111111`) — Dark feature sections for contrast — gradient-faded from charcoal to true black
- **Ink Surface** (`#000000`) — Product screenshot context and deep-contrast feature cards

## Imagery

The page is UI-screenshot-dominant, not photo-dominant. The hero features a real product UI screenshot of the ClickUp app (sidebar nav, inbox, task list with status pills and avatar clusters) rendered at large scale. Secondary visuals include: G2 award badge grid (grayscale with red G2 logos), logo strip for 'trusted by' (Amazon, NVIDIA, Wayfair, Verizon, Spotify, Stanford — all rendered flat in grayscale), and abstract decorative elements made of gray swirling line-art (the 'context loss' illustration uses tangled gray ribbons with floating app icons). Photography is essentially absent. The visual language is: show the product, show the awards, show the logos — no stock lifestyle photography, no hero videos. Icons are colorful and flat in the product UI (red, blue, green, purple app icons) but rendered in single-tone grayscale in decorative contexts.

## Layout

Max-width 1200px centered, no sidebar. Hero is a 2-column split: left column holds the headline (80px display), checkmark benefit list, dark filled CTA, and a row of feature tag pills; right column holds the product UI screenshot at full column width. Below the hero, sections alternate: a centered-headline illustration section (the tangled gray 'context loss' graphic), then a G2 awards section (text left / badge grid right), then a stats band with large numbers. Navigation is a single top bar with logo, 6 nav items (some with dropdown indicators), a 'Get a Demo' ghost link, a 'Login' ghost button, and a 'Sign Up' filled dark pill. Section gaps are large (~80px) while internal element gaps are compact (8-12px), creating a rhythmic density contrast: tight inside sections, spacious between them. The page reads top-to-bottom as: announcement bar → nav → hero split → social proof logos → illustration section → awards grid → stats → footer.

## Similar Brands

- **Linear** — Same tight typographic discipline with display headlines at 48-80px, negative letter-spacing, monochrome canvas with a single brand accent (purple vs Linear's violet), and 9999px pill buttons for primary actions
- **Notion** — Shared compact density, 4px spacing base, and a flat UI philosophy that relies on hairlines and whitespace instead of heavy shadows; both use a near-black for primary CTAs and reserve color for badges and tags
- **Vercel** — Similar treatment of black/white/grayscale as the primary palette, with vivid color appearing only in decorative gradient borders; both use a custom geometric sans for display and rely on real product screenshots in hero sections
- **Webflow** — Comparable use of a conic-gradient rainbow border as the signature brand element, 9999px pills throughout the component system, and product-screenshot-driven hero layouts with bold oversized headlines
