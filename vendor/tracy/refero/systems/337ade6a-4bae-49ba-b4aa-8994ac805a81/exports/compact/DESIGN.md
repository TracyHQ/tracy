# Relate — Style Reference
> cool dawn over product canvas

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Relate renders as a cool-white SaaS surface with near-black headline ink and one vivid royal-blue accent that does all the brand talking. The product UI is shown through soft rounded cards floating on a pale lavender wash, with colored status dots (blue/green/red/orange) punctuating pipeline columns like Kanban tickets. Typography is tight: Inter at 56–80px with strong negative tracking whispers scale, body copy sits compact at 14–16px on generous line-height, and spacing leans dense (8–12px gaps) rather than airy. Everything lives in pill and rounded-rect containers; hard corners are absent.

## Colors

| Name | Value | Role |
|------|-------|------|
| Snow Canvas | `#fcfcfc` | Page background, card surfaces, nav surface — the dominant neutral that makes blue accents feel switched on |
| Lavender Wash | `#f0f4fe` | Subtle accent surface behind hero and feature blocks — gives cool-tinted depth without darkening the page |
| Midnight Ink | `#020520` | Hero and section headings — near-black with a violet cast, reads warmer than pure black against white |
| Graphite Body | `#14141e` | Body text, secondary headings, product UI labels — workhorse dark neutral with cool undertone |
| Slate Caption | `#374151` | Muted body text, nav labels, list items — medium-dark gray for subordinate copy |
| Ash Helper | `#6b7280` | Helper text, metadata, timestamps — lighter gray for tertiary information |
| Stone Divider | `#e2e8f0` | Hairline borders, card edges, divider lines — barely-there separation between surfaces |
| Fog Surface | `#f1f5f9` | Input backgrounds, disabled states, subtle grouping surfaces — one shade darker than canvas |
| Royal Signal | `#145aff` | Primary brand accent — headlines, links, hero word highlight, pipeline-active dots, logo mark. Single saturated hue carries the entire brand identity |
| Cobalt Glow | `#3b82f6` | Blue wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Mint Win | `#16ca2e` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Coral Lost | `#f26052` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Amber Pending | `#ffa64d` | Orange text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Azure Focus | `#0099ff` | Input focus ring glow — pure blue that distinguishes active form state from ambient blue brand color |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Inter — Primary typeface for headings, body, nav, buttons — the only text family on the page. Weights split: 600 for hero/section headlines, 500 for subheadings and nav, 400 for body copy. Display sizes (56–80px) use aggressive negative tracking (-0.027 to -0.037em) that compresses letterforms into a tight confident block.
- **Substitute:** DM Sans, Geist, Manrope
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 12px, 14px, 15px, 16px, 18px, 20px, 22px, 40px, 56px, 80px
- **Line height:** 1.05–1.50
- **Letter spacing:** -0.0370em, -0.0270em, -0.0190em, -0.0100em, -0.0090em, 0.0060em, 0.0070em, 0.0110em, 0.0130em

### Pretendard — Secondary typeface used for Korean-language rendering and specific UI labels with positive tracking (+0.019 to +0.030em) — appears in localized product UI strings
- **Substitute:** Pretendard (Google Fonts CDN)
- **Weights:** 400
- **Sizes:** 12px, 14px, 15px, 16px, 18px
- **Line height:** 1.17–1.71
- **Letter spacing:** 0.0190em, 0.0210em, 0.0250em, 0.0300em

### Roboto Mono — Monospace accent for code-adjacent text, numerical callouts, and technical labels — negative tracking makes it feel geometric
- **Substitute:** JetBrains Mono, Geist Mono
- **Weights:** 500, 700
- **Sizes:** 12px, 22px
- **Line height:** 1.00–1.27
- **Letter spacing:** -0.0450em, -0.0300em

### Font Awesome 6 Pro Light — Font Awesome 6 Pro Light — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 8px, 10px, 11px, 12px, 14px
- **Line height:** 1, 1.09, 1.55, 1.71, 2, 2.4, 2.5

### Font Awesome 6 Pro Solid — Font Awesome 6 Pro Solid — detected in extracted data but not described by AI
- **Weights:** 400, 900
- **Sizes:** 8px, 10px, 11px
- **Line height:** 1, 1.09, 1.25

### Font Awesome 6 Pro Regular — Font Awesome 6 Pro Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 11px, 12px, 14px, 18px
- **Line height:** 1, 1.09, 1.2
- **Letter spacing:** 0.011

### Font Awesome 6 Brands Regular — Font Awesome 6 Brands Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.63 | — |
| subheading | — | — | 20px | 1.4 | -0.16px |
| heading-sm | — | — | 22px | 1.4 | -0.2px |
| heading | — | — | 40px | 1.05 | -1.48px |
| heading-lg | — | — | 56px | 1.05 | -1.51px |
| display | — | — | 80px | 1.05 | -1.52px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 12px
- **Element gap:** 8-12px

### Border Radius

- **cards:** 8px
- **pills:** 100px
- **inputs:** 12px
- **buttons:** 9999px
- **containers:** 16-40px
- **pipeline-cards:** 16px

## Components

### Ghost Outline Button
**Role:** Secondary action — 'Book a demo', nav CTAs

Background #fcfcfc, text #145aff (or #020520), border 1px #145aff, border-radius 50px (pill), padding 14px 32px. Semi-transparent variant uses rgba(255,255,255,0.8) background on dark surfaces.

### Filled Dark Button
**Role:** Primary action on light backgrounds — 'Get started free', login

Background appears as dark text-link style; actual filled CTAs in the hero use white surface with #145aff text and pill radius. The dominant CTA pattern is a ghost-outline or frosted button, never a heavy filled block.

### Pipeline Column Card
**Role:** Kanban deal cards in product UI screenshot

Background #ffffff, border-radius 16px, subtle shadow rgba(0,0,0,0.1) 0px 0px 4px -2px, padding 12px. Column header has a 4px colored dot (blue/green/red/orange) followed by count and total deal value in #145aff.

### Deal Card
**Role:** Individual deal items inside pipeline columns

Background #ffffff, border-radius 8px, padding 12px 16px, shadow rgba(0,0,0,0.1) 0px 0px 4px -2px. Contains: company avatar + name, deal value, last-activity note, assignee avatar, time-ago badge.

### Prospect List Card
**Role:** Lead/contact rows in product feature screenshot

Background #ffffff, border-radius 16px, padding 12px. Row contains company logo, name, contact person, timestamp, and a right-side detail panel with email-thread and properties.

### Logo Mark Badge
**Role:** Relate brand mark in nav and footer

Rounded square 32–40px container with #145aff background, white lowercase 'r' glyph inside. Sits beside wordmark 'relate' in Inter 600.

### Nav Link
**Role:** Top navigation items — Product, Pricing, Customers, Blog, Resources

Inter 15px weight 500, color #14141, no underline, 16px horizontal gap between items. Active/hover state: color shift to #145aff.

### Hero Gradient Banner
**Role:** Blue gradient band behind hero headline and CTA

Linear gradient from rgba(20,90,255,0.1) to rgba(182,203,253,0.4) creating a soft blue glow under the 'Get started free' CTA. Extends full-width with large border-radius (40–48px) on the bottom edge.

### Feature Section Card
**Role:** Large rounded containers for product feature blocks (Prospect, Close, etc.)

Background #fcfcfc, border-radius 40px, padding 52px 72px, multi-layer shadow: rgba(0,0,0,0.08) 0px 0.36px 1.8px -1.4px, rgba(0,0,0,0.07) 0px 1.37px 6.87px -2.8px, rgba(0,0,0,0.016) 0px 6px 30px -4.25px. Gives a floating elevated feel.

### Glassmorphic Container
**Role:** Frosted feature cards with backdrop-blur

Background rgba(252,252,252,0.2), border-radius 28–48px, padding 12–20px, backdrop-filter blur(15px). Reveals underlying gradient — used in dark or tinted sections.

### Status Dot
**Role:** Pipeline column indicators — Potential/Pending/Closed Won/Lost

4–6px filled circle, color-coded: #3b82f6 (Potential/blue), #ffa64d (Pending/orange), #16ca2 (Closed Won/green), #f26052 (Lost/red). Sits inline with column title text.

### Customer Logo Strip
**Role:** Social proof band — 'Powering the next generation B2B startups'

8 monochrome brand logos arranged in 2 rows of 4 on white canvas. Logos rendered in #14141 at ~60% opacity, no color, evenly spaced with 40–60px gaps.

### Input Field
**Role:** Form inputs — search bar, email fields

Background rgba(255,255,255,0.08) on dark or #ffffff on light, border 1px #ffffff or #e2e8f0, border-radius 12px, padding 15px. Focus state: box-shadow with #0099ff glow ring.

### Y Combinator Badge
**Role:** Trust signal above hero headline

Small inline element: orange square #f26052 icon + 'Backed by Y Combinator' text in #14141 Inter 14px. Centered above headline.

## Do's and Don'ts

### Do
- Use #145aff as the sole saturated accent for headings, links, logos, and the one word-of-color in hero copy — never introduce a second brand hue
- Set body text at 14–16px Inter 400 with #14141 or #374151 on #fcfcfc canvas; minimum 17.8:1 contrast ratio
- Apply pill radius (9999px or 100px) to all buttons, tags, and nav items — hard 90° corners should not appear in interactive elements
- Use the multi-layer soft shadow stack (three rgba layers at increasing blur) on feature section cards for floating elevation
- Render colored status dots at 4–6px diameter with #3b82f6/#16ca2e/#f26052/#ffa64d for pipeline and deal states
- Set hero and display headings at 56–80px Inter 600 with letter-spacing -0.027 to -0.037em for tight compressed scale
- Use 8px border-radius for inner cards (deal rows, prospect items) and 16–40px for outer feature containers — maintain a two-tier rounding system

### Don't
- Don't use #0000ee or browser-default link blue — it is an artifact, not a brand choice; use #145aff or #3b82f6
- Don't fill CTA buttons with heavy solid color blocks — the pattern here is ghost-outlined or frosted pills, not filled rectangles
- Don't introduce gradients with more than two stops; all detected gradients are simple linear or radial two-color blends
- Don't use sharp 0px corners on any visible element; the minimum radius in the system is 4px
- Don't set body text below 14px or above #6b7280 lightness — legibility collapses below this threshold
- Don't stack multiple saturated accent colors in one component — only one blue, green, red, or orange dot per surface
- Don't use Inter weights above 600 or below 400 — the system operates in a tight 400/500/600 range

## Elevation

- **Pipeline/deal cards:** `rgba(0, 0, 0, 0.1) 0px 0px 4px -2px`
- **Feature section cards:** `rgba(0, 0, 0, 0.082) 0px 0.36px 1.8px -1.4px, rgba(0, 0, 0, 0.07) 0px 1.37px 6.87px -2.8px, rgba(0, 0, 0, 0.016) 0px 6px 30px -4.25px`
- **Blue glow accents:** `rgba(20, 90, 255, 0.1) 0px 0px 100px -28px`

## Surfaces

- **Canvas** (`#fcfcfc`) — Page background — pure-white-feeling surface that maximizes contrast for dark text and blue accents
- **Wash** (`#f0f4fe`) — Hero and feature band background — cool lavender tint that frames content blocks without darkening the page
- **Card** (`#ffffff`) — Product UI cards, pipeline cards, prospect cards — pure white floating on canvas or wash
- **Frosted** (`#fcfcfc`) — Glassmorphic nav and feature cards with backdrop-blur — semi-transparent surface that reveals underlying gradient

## Imagery

Minimal literal photography — the page relies on product UI screenshots rendered as floating mockups rather than lifestyle or product photography. The hero features a large Kanban-style CRM screenshot showing pipeline columns with deal cards. Below sections show prospect-list and contact-detail UI screenshots, all rendered as white cards on light backgrounds. Customer logos appear as monochrome black marks in a grid. The Y Combinator badge uses a small flat-color icon. No illustrations, no 3D renders, no decorative graphics — visual interest comes entirely from the product interface itself, which acts as the brand's visual proof.

## Layout

Full-width sections with centered content capped at ~1200px max-width. Hero is a centered single-column layout: YC badge above, oversized headline (56px) with one colored word, body paragraph (18px), single ghost-outline CTA button, all centered over a blue gradient band. Product UI screenshots appear as large floating elements below the fold. Mid-page sections alternate: centered heading + description above, then full-width product UI mockup. Feature blocks use large rounded containers (40px radius) with generous internal padding. Customer logo strip is a 4×2 centered grid. Footer is a dark navy section. Navigation is a horizontal top bar with logo left, center links, dual CTAs right.

## Similar Brands

- **Notion** — Same ultra-clean white-canvas approach with near-black headings and a single saturated accent color (Notion's red, Relate's blue); both use tight Inter-style type with negative tracking on display sizes and pill-radius buttons
- **Linear** — Identical compact-density philosophy, dark-near-black headline ink (#020520 vs Linear's similar), product-UI-as-hero pattern showing the app interface, and tight typographic rhythm with compressed letter-spacing on large sizes
- **Attio** — Same CRM-product-as-hero approach with floating pipeline/contact screenshots on pale tinted backgrounds, cool-blue accent palette, and rounded soft-card components with minimal shadow
- **Vercel** — Identical near-black heading color (#020520), single vivid accent for highlights, white-canvas-with-soft-blue-wash section pattern, and pill-radius ghost-outline button system
- **Stripe** — Same restrained color discipline (one brand blue, achromatic everything else), generous 40–48px border-radius on feature containers, and tight Inter display type with aggressive negative tracking
