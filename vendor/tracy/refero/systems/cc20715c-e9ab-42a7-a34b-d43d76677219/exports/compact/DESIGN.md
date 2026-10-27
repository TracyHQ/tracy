# Prismic — Style Reference
> Isometric workshop on white paper — a clean editorial canvas where vivid 3D devices float beside pastel mood-board cards and one charcoal workshop band anchors the floor.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Prismic uses an editorial developer-tool language: white paper canvas interrupted by a charcoal workshop section, accented by vivid violet, sky blue, and mint green that read as creative-tools energy rather than enterprise software. Pastel-tinted cards (lavender, sky, peach, mint) carry testimonials and feature highlights like a designer's mood board, each card defined by a thin chromatic border rather than a filled background. Headlines whisper at 56px with tight -0.025em tracking for a confident editorial cadence, while the 500-weight body copy stays at 16-18px for calm readability. Buttons are weighted — solid graphite for primary action, ghost outlines in violet or blue for secondary — and isometric 3D illustrations of devices, sliders, and building blocks frame content as if a workshop were unfolding on the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Graphite | `#151515` | Primary action fill, body text, dark workshop background — dense near-black with 18.3:1 contrast on white gives the wordmark and CTAs architectural weight |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text on graphite, reverse section background — the paper on which everything sits |
| Ink Black | `#000000` | Icon strokes, hairlines, and SVG illustration outlines — 21:1 contrast on white guarantees icon legibility at any size |
| Fog Border | `#eeeeee` | Hairline dividers, card borders, table separators — the quiet grid line that organizes without asserting itself |
| Steel | `#505050` | Secondary text, muted nav borders, icon detail — 40-50% darker than fog for progressive disclosure |
| Silver Mist | `#a4a4a4` | Tertiary text, placeholder, decorative strokes — the lightest voice in the type hierarchy |
| Charcoal | `#303030` | Dark workshop card surfaces and elevated dark-mode containers — one step lighter than graphite to read as a separate surface layer |
| Plaster | `#f7f7f7` | Subtle surface for inset cards and section backgrounds when white needs to recede |
| Prismic Violet | `#8e44ec` | Violet accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Prismic Blue | `#59b5f8` | Secondary outlined actions, marketer-side accent headings, icon strokes — the cool counterweight to violet, always paired with dark text |
| Prismic Green | `#3bbb96` | Green decorative accent for icons, marks, and small graphic details |
| Lavender Wash | `#e8c7ff` | Testimonial card border, list highlight background — a pastel mood-board tint for social proof blocks |
| Lavender Cream | `#f5e6ff` | Lavender-tinted card surface, soft highlight wash — pairs with Lavender Wash border for layered mood-board cards |
| Sky Wash | `#c3eefe` | Testimonial card border, cool pastel accent — pairs with Prismic Blue for the marketer-side narrative |
| Peach Wash | `#fcdac4` | Warm testimonial card border — the third mood-board tint for testimonial rotation |
| Peach Cream | `#fef1e9` | Peach-tinted card surface — the warm counterpart to Lavender Cream |
| Mint Wash | `#d4f2e9` | Testimonial card border — the fourth mood-board tint closing the pastel set |
| Mint Cream | `#e8f8f3` | Mint-tinted card surface — pairs with Mint Wash border for cool-warm pastel balance |

## Typography

### copyFont — copyFont — detected in extracted data but not described by AI
- **Weights:** 500, 600, 700
- **Sizes:** 14px, 16px, 18px, 22px
- **Line height:** 1, 1.14, 1.43, 1.45, 1.5, 1.56

### Prismic Headings (custom) — All headings from subhead (16-22px) through display (56px); weight 500 for sub-section headers, weight 700 for hero/display; -0.025em tracking at every size creates the tight editorial cadence that distinguishes Prismic from generic SaaS headlines
- **Substitute:** Inter Tight or General Sans at matched weights
- **Weights:** 500, 700
- **Sizes:** 
- **Line height:** 1.10–1.38
- **Letter spacing:** -0.025em at every size (≈ -0.4px at 16px → -1.4px at 56px)

### Prismic Copy (custom) — Body text, nav items, button labels, link text, card copy; 16px @ 500/600 is the dominant voice at 1.5 line-height; 18px at 1.56 for paragraph reading comfort; 14px at 1.43 for dense list and footer contexts; weight 700 reserved for button labels and emphasized inline text
- **Substitute:** Inter or Söhne at matched weights
- **Weights:** 500, 600, 700
- **Sizes:** 
- **Line height:** 1.14–1.56
- **Letter spacing:** normal

### headingsFont — headingsFont — detected in extracted data but not described by AI
- **Weights:** 500, 700
- **Sizes:** 16px, 18px, 22px, 28px, 32px, 40px, 56px
- **Line height:** 1.1, 1.13, 1.14, 1.27, 1.33, 1.38
- **Letter spacing:** -0.025

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | 0px |
| body-sm | — | — | 16px | 1.5 | 0px |
| body | — | — | 18px | 1.56 | 0px |
| subheading | — | — | 22px | 1.38 | -0.55px |
| heading-sm | — | — | 28px | 1.33 | -0.7px |
| heading | — | — | 40px | 1.14 | -1px |
| display | — | — | 56px | 1.1 | -1.4px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **nav:** 2px
- **cards:** 12px
- **icons:** 9999px
- **links:** 8px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary Filled Button
**Role:** Highest-priority CTA (Get started, Explore your journey)

Graphite (#151515) background, white text, 8px radius, 12px 24px padding, Prismic Copy at 16px weight 700, 1.4 line-height. No shadow, no gradient — flat architectural block.

### Secondary Outlined Button
**Role:** Lower-priority CTA (Request a demo, Read story)

Transparent background, 1.5px border in #151515 or #505050 depending on contrast surface, #151515 text, 8px radius, 12px 24px padding, Prismic Copy 16px weight 600.

### Chromatic Outlined Action
**Role:** Section-accent CTA inside dark or pastel sections

Transparent background, 1.5px border in Prismic Violet (#8e44ec) or Prismic Blue (#59b5f8), matching chromatic text, 8px radius, 12px 24px padding. Never used as the primary page CTA — always secondary or contextual.

### Nav Item
**Role:** Top navigation entries with dropdown caret

Prismic Copy 16px weight 500, #151515 text, 8px radius, 8px 12px padding, 2px radius on dropdown containers. Prismic wordmark uses #151515 with 2px radius badge lockup.

### Testimonial Mood-Board Card
**Role:** Customer quote card in horizontal row

Pastel cream background (#fef1e9 / #e8f8f3 / #f5e6ff) with 2px border in matching wash color (#fcdac4 / #d4f2e9 / #e8c7ff), 12px radius, 32px padding, Prismic Copy 16-18px weight 500 body, author avatar 9999px circle, underlined Read story link at bottom.

### Dark Workshop Section Card
**Role:** White floating card inside the charcoal #151515 band

White background, no border, 16px radius, 40px padding, Prismic Headings at 28px weight 700 with colored first word (violet or blue), 18px body copy, chromatic icon list with 16px stroke icons in violet/blue.

### Logo Bar
**Role:** Social proof row of customer wordmarks

White canvas, single row of grayscale wordmarks (BERSHKA, Unmind, Glovo, texthelp, paddle) at uniform ~20-24px height, 48-80px horizontal gap, no borders, muted to ~60% opacity so they read as supporting cast.

### Icon
**Role:** Functional icon for list items, features, nav

1.5-2px stroke, 24-32px size, 9999px radius (circular badge in some contexts), stroke in #151515 by default or #8e44ec / #59b5f8 / #3bbb96 when in a chromatic context. No filled icons — outline only.

### Hero Headline
**Role:** First-screen display headline

Prismic Headings 56px weight 700, #151515, -1.4px letter-spacing, 1.10 line-height. Optional inline chromatic accent word (e.g. 'wow.' in green) at same size and weight. Centered or left-aligned depending on section.

### Feature Icon List
**Role:** Bullet list with leading icon inside dark or light cards

16px chromatic icon, 12px gap, Prismic Copy 16-18px weight 500 body text, 16px row gap between items, no bullet characters.

### Hero Illustration Cluster
**Role:** Decorative isometric 3D device art flanking hero

Isometric 3D renders of phones, sliders, and color palettes in Prismic Violet, Prismic Blue, Prismic Green, and #151515 with 2px black outlines. Full-bleed left/right, no border radius, no shadow — flat 3D with crisp edges.

### Inline Link
**Role:** Text link inside paragraphs or below cards

Prismic Copy 16px weight 500, #151515, 1px underline in currentColor, 2px underline offset, no background change on hover — underline thickens to 2px.

### Section Heading
**Role:** Section-title above card rows or features

Prismic Headings 40px weight 700, #151515, -1.0px letter-spacing, 1.14 line-height, 32px margin-bottom to content below, centered on page-width sections.

## Do's and Don'ts

### Do
- Use Prismic Headings at 56px / 40px / 32px / 28px with -0.025em tracking for all section and display titles; never set headings above 56px or below 22px from this family.
- Use 12px 24px padding and 8px radius for every button; never exceed 12px vertical padding or deviate from the 8px radius.
- Pair the four pastel wash/cream pairs exactly: Lavender Wash (#e8c7ff) with Lavender Cream (#f5e6ff), Sky Wash (#c3eefe) with white, Peach Wash (#fcdac4) with Peach Cream (#fef1e9), Mint Wash (#d4f2e9) with Mint Cream (#e8f8f3). Do not cross-pair warm and cool pastels on the same card.
- Keep the dark workshop band at #151515 with white floating cards; do not introduce gradients, patterns, or imagery inside the band — the contrast inversion is the visual statement.
- Use Prismic Violet (#8e44ec) for developer-side accents and Prismic Blue (#59b5f8) for marketer-side accents; never use both chromatic colors on the same element.
- Set body text at 18px with 1.56 line-height in long-form sections and 16px with 1.50 in dense contexts like nav, lists, and cards.
- Maintain 64px vertical gap between full-width sections and 32px padding inside cards; do not collapse section gaps below 48px on desktop.

### Don't
- Do not use Prismic Violet, Prismic Blue, or Prismic Green as filled button backgrounds — they are border-and-text accents only. Primary actions stay Graphite #151515.
- Do not introduce drop shadows on cards, buttons, or nav. Elevation must come from contrast inversion, pastel borders, or charcoal bands.
- Do not use more than one chromatic color per section. Pick violet OR blue OR green as the section's voice and let the others rest.
- Do not set type below 14px or above 56px. The Prismic Headings family stops at 56px display and the copy family stops at 14px caption.
- Do not use full-color photography in the hero or feature sections. Imagery must be isometric 3D illustration with 2px black outlines or grayscale wordmark logos.
- Do not round cards above 12px or below 12px. The 12px card radius is the single card language — do not mix in 16px or 8px cards.
- Do not pair Prismic Violet text with Prismic Blue borders, or mix wash/cream pastels across temperature. The system has two chromatic voices (violet/blue) and four pastel pairs that must stay internally consistent.

## Elevation

- **Dark Workshop Card:** `0 1px 0 rgba(255,255,255,0.08) inset — no outer drop shadow, only an internal hairline highlight to lift the card off the charcoal band`

## Surfaces

- **Canvas** (`#ffffff`) — Default page background across hero, features, and footer
- **Inset Surface** (`#f7f7f7`) — Subtle elevation when white needs to recede behind grouped content
- **Pastel Card** (`#e8c7ff`) — Mood-board testimonial cards with chromatic border treatment
- **Pastel Card Cool** (`#c3eefe`) — Cool-tinted mood-board variant for the marketer narrative
- **Dark Workshop** (`#151515`) — Charcoal band for developer/marketer split section, inverse cards float on top
- **Dark Card** (`#303030`) — Elevated dark surface for cards inside the workshop band

## Imagery

Imagery is exclusively isometric 3D illustration of digital devices, UI components, color palettes, and building blocks — rendered in Prismic Violet, Prismic Blue, Prismic Green, and Graphite with a consistent 2px black outline. No photography appears anywhere. Illustrations float full-bleed at the edges of the hero and section transitions, often overlapping the page boundary. Customer logos in social-proof rows are grayscale wordmarks, never photographs. The 3D art style is flat-shaded with crisp edges and no gradients inside the illustrations themselves — color blocks meet at hard lines, reinforcing the print-editorial aesthetic.

## Layout

Layout is max-width 1200px centered with a comfortable density. The hero is centered text with dual CTAs flanked by isometric illustration clusters on left and right edges. The first section transition drops into a full-bleed charcoal #151515 band containing a two-column white card (Developers left, Marketers right) with colored first-words splitting the narrative. Below, a centered section heading introduces a horizontal-scrolling row of pastel-tinted testimonial cards, each tinted with a different wash/cream pair. Sections alternate between full-width white and full-width charcoal bands separated by 64px vertical gaps. Card grids use 3-4 columns at desktop with 24-32px gutters. Navigation is a flat top bar with dropdown menus, no sticky behavior apparent, 1200px max-width aligned with content.

## Similar Brands

- **Webflow** — Same dual audience split (developer/marketer) and same use of flat chromatic illustrations plus a light editorial canvas
- **Sanity** — Headless CMS peer with similar white-canvas, single-chromatic-accent language and clean Prismic Copy-style body type
- **Storyblok** — Headless CMS with a playful pastel-tinted card system and similar isometric 3D illustration treatment in the hero
- **Linear** — Same graphite-on-white weight language with a single accent chromatic and an avoidance of drop shadows in favor of inversion-based elevation
- **Strapi** — Headless CMS with the developer-tool tone and a similar trust-in-density approach to heading and body type
