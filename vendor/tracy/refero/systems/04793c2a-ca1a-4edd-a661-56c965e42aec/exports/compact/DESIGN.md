# Grain — Style Reference
> frosted glass desk with a single green pen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Grain's design system is a quiet, near-monochrome productivity canvas where a single confident green does all the talking. The interface behaves like a high-end workspace app: spacious white surfaces, hairline borders, and soft drop shadows create depth without weight, while Inter handles nearly all UI text with measured, slightly tightened tracking. Color is rationed — the vivid green appears only on the primary download action and as subtle background washes, never as decoration. Component density is comfortable but information-rich: cards feel like documents rather than buttons, and product screenshots float in the page with generous radius and minimal frame. The distinctive choice is using Poppins weight 600 for section display titles against an Inter body, creating a typographic contrast where the heading style shifts register from the rest of the page. Overall the system feels like a well-organized analyst's desk: precise, restrained, and engineered for serious work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#009959` | Primary action — filled download buttons, outlined CTAs, and active nav indicators carry this deep botanical green that reads as decisive without aggression |
| Vine | `#00b96c` | Soft surface accent and gradient wash for feature sections — the mid-tone green that fades into the white canvas as ambient atmosphere |
| Neon Sprout | `#00ff95` | Decorative illustration fill and gradient endpoint — appears only inside brand graphics, never on UI controls |
| Ice Blue | `#3de1ff` | Decorative illustration fill for brand mark and app icon glyphs — companion to Neon Sprout in the visual identity |
| Obsidian | `#000000` | Primary text, heavy borders, and the dominant hairline divider color throughout the layout |
| Graphite | `#141414` | Headline text and dark surface text — near-black with slight warmth for large display type |
| Carbon | `#313232` | Secondary text, image overlays, and dark UI text on light backgrounds — the workhorse body tone |
| Slate | `#545454` | Body text helper copy and tertiary borders |
| Fog | `#707070` | Muted body text and subtle border tone for de-emphasized content |
| Ash | `#949494` | Icon strokes, placeholder text, and low-priority text color |
| Mist | `#d6d6d6` | Button borders and faint dividers — barely-there structural lines |
| Cloud | `#e6e6e6` | Button background tint and elevated surface base |
| Veil | `#f0f0f0` | Hover states, tag backgrounds, and section background tint — the next surface above the canvas |
| Paper | `#fafafa` | Page canvas and card surfaces — the dominant background that everything floats on |

## Typography

### Inter Variable — Universal UI font — handles all navigation, body, button, card, and heading text from 12px captions to 36px section headers. Weight 500 carries medium-emphasis labels, weight 600 anchors the heaviest UI elements. Slightly tightened tracking at -0.02em to -0.03em keeps the geometric letterforms feeling engineered rather than soft.
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 12, 13, 14, 16, 18, 20, 32, 36
- **Line height:** 1.30, 1.43, 1.50, 1.60
- **Letter spacing:** -0.36px at 12px, -0.42px at 14px, -0.32px at 16px, -0.36px at 18px, -0.40px at 20px, -0.96px at 32px, -1.08px at 36px

### Poppins — Display heading font — used exclusively for major section titles like 'Everything your AI agents and team need from meetings'. The weight 600 Poppins at 38px creates a distinct typographic register shift from the Inter body, making section titles feel like editorial headings rather than UI labels. Normal letter-spacing lets the geometric forms breathe.
- **Substitute:** Poppins
- **Weights:** 600
- **Sizes:** 38
- **Line height:** 1.25

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 15.6 | -0.36px |
| body-sm | — | — | 14px | 20 | -0.42px |
| body | — | — | 16px | 24 | -0.32px |
| subheading | — | — | 18px | 27 | -0.36px |
| heading-sm | — | — | 20px | 30 | -0.4px |
| heading | — | — | 32px | 41.6 | -0.96px |
| heading-lg | — | — | 36px | 46.8 | -1.08px |
| display | — | — | 38px | 47.5 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 10px
- **hero:** 2px
- **tags:** 10px
- **cards:** 10px
- **images:** 14px
- **buttons:** 10px

## Components

### Top Navigation Bar
**Role:** Sticky header containing brand mark, primary nav links, and dual action buttons

White background (#fafafa) with 10px border-radius, 48px height, Inter at 14px weight 500 for nav links in #141414. Right side stacks a ghost 'Login' text link, an outlined 'Book a demo' button, and a filled green 'Download' button. The green Download button reappears as the dominant visual anchor in the top right corner.

### Filled Primary Action Button
**Role:** Highest-priority conversion action — download CTA

Background #009959, white text, 10px border-radius, 12px 20px padding. Inter at 14px weight 500. Includes Apple logo icon prefix at 14px. This is the only filled chromatic button in the system — it carries the entire weight of the primary conversion path.

### Outlined Secondary Button
**Role:** Secondary action for demo requests

White background (#fafafa), 1px border in #d6d6d6, text in #141414, 10px border-radius, 12px 20px padding. Inter at 14px weight 500. Ghost-style — visually quiet, waiting for the filled green button to claim attention.

### Ghost Nav Link
**Role:** Navigation items in the top bar

No background, text in #141414, Inter at 14px weight 500, 8px horizontal padding. Hover state shifts to underline. Includes dropdown items like 'Use Cases', 'Resources', 'Pricing' that expand on click.

### Trust Badge Pill
**Role:** Social proof indicator near the hero headline

White background with 1px border in #fafafa-toned hairline, 10px border-radius, contains a small Google 'G' icon, star rating, and review count. Inter at 12-13px. Sits as a quiet credibility signal above the hero headline.

### Compliance Badge
**Role:** Trust and certification signal above section titles

White pill shape, 10px border-radius, 1px border in #e6e6e6, 12px 16px padding. Contains a small icon plus label like 'SOC 2 audited' or 'GDPR compliant' in Inter at 13px weight 500. Appears in pairs centered above section headers.

### Feature Card
**Role:** Four-column feature grid item explaining product capabilities

White background (#fafafa), 10px border-radius, subtle shadow rgba(0,0,0,0.04) 0px 4px 8px 0px, 24px padding. Contains a 48px icon at top-left in a light gray rounded square, then a bold title in Inter 16-18px weight 600, and a description in Inter 14px weight 400 at #545454. Cards are breathable and document-like, not boxed-in.

### Product Screenshot Frame
**Role:** Hero product visualization with browser/app chrome

Large rounded container at 14px border-radius, thin border, white surface showing the Grain app interface. Contains internal navigation tabs, meeting metadata, and a tabbed summary view. The frame floats with a soft drop shadow rgba(0,0,0,0.08) 0px 4px 16px 0px to separate it from the page.

### Section Display Heading
**Role:** Major section title using the Poppins display font

Poppins weight 600 at 38px, line-height 1.25, color #141414, centered above the section content. This is the only place Poppins appears — the typographic shift from Inter signals editorial gravity and section breaks.

### Video Call Overlay Card
**Role:** Product feature illustration with recording controls

Dark surface (#313232) at 14px border-radius, showing a video call grid with participant thumbnails and a bottom control bar. A floating white card overlays with a 'Stop' button (dark filled), wavefORM audio visualization, and a '32m' timer — demonstrates the recording feature in product.

### Brand Logo Strip
**Role:** Social proof row of customer/partner logos

Horizontal row of grayscale logos at #949494 tone, evenly spaced, no borders or background. Logos include Adobe, Podium, Zapier, Vendra, Pocus, and others. Sits at the bottom of the hero section as a quiet credibility band.

### Feature Detail Split
**Role:** Two-column section with text-left, product-right layout

Left column: small category label badge at top, then a 32px Inter weight 600 headline, followed by a vertical list of 2-3 sub-feature blocks. Each sub-feature has a 14px bold title and 13px body description. Right column: product screenshot or video frame. Generous 96px vertical gap between sections.

## Do's and Don'ts

### Do
- Use #009959 only for the single primary download action — never for secondary buttons, links, or decorative elements
- Set all cards, buttons, nav elements, and tags to 10px border-radius; reserve 14px for product screenshots and 40px for special hero cards
- Apply Poppins weight 600 at 38px exclusively to major section display headings; never use it for body text or UI labels
- Use #fafafa as the universal page and card surface — avoid introducing new whites or grays outside the defined scale
- Maintain hairline 1px borders in #e6e6e6 or #d6d6d6 for structural separation rather than heavy borders or filled backgrounds
- Apply the -0.03em letter-spacing to all display sizes 32px and above; use -0.02em for sizes 20px and below
- Stack sections with 96px vertical gaps and 24px card padding to preserve the spacious, document-like density

### Don't
- Do not use #00ff95 or #3de1ff as UI colors — these are decorative illustration fills only and will look like system errors on actual controls
- Do not use the green gradient as a background fill for cards or sections — it is a subtle wash for hero/section transitions only
- Do not add shadows darker than rgba(0,0,0,0.08) — the system relies on near-invisible elevation, not dramatic depth
- Do not use Poppins for navigation, buttons, or body text — the Inter system is the workhorse; Poppins signals editorial display
- Do not introduce accent colors beyond the green palette — the 1% colorfulness is the design
- Do not use 0px border-radius on any container — every surface in the system is softened
- Do not set body text below 14px or above #545454 in tone — readability depends on this neutral mid-range

## Elevation

- **Feature Card:** `rgba(0, 0, 0, 0.04) 0px 4px 8px 0px`
- **Product Screenshot:** `rgba(0, 0, 0, 0.08) 0px 4px 16px 0px`
- **Card Inset Highlight:** `rgba(0, 0, 0, 0.05) 0px 0px 12px 0px inset`

## Surfaces

- **Paper** (`#fafafa`) — Page canvas — the dominant background for the entire site
- **Cloud** (`#e6e6e6`) — Elevated button backgrounds and subtle surface tint
- **Veil** (`#f0f0f0`) — Hover states, tag fills, and next-layer surface above the canvas

## Imagery

Product screenshots dominate the visual language — the Grain app interface is shown at large scale in the hero and feature sections, presented as floating framed artifacts with soft shadows and 14px radius. The screenshots are styled like document mockups, not screenshots: clean white app surfaces, precise typography, and browser-chrome details. There is no lifestyle photography, no human subjects outside the video call thumbnails, and no abstract illustration beyond a sparse green gradient wash. A grayscale logo strip provides social proof without color competition. The overall visual density is text-and-screenshot dominant with minimal decoration.

## Layout

The site uses a centered max-width container at 1200px with full-bleed sections that alternate between white canvas and subtle green-tinted washes. The hero splits asymmetrically: text-left (40%) and product screenshot-right (60%) on a white background. Below the hero, sections transition to centered display headings with 4-column feature card grids. Deeper feature sections use a 2-column split (text-left, product-right) that alternates. Vertical rhythm is spacious — 96px section gaps create generous breathing room between blocks. The navigation is a minimal top bar that stays fixed. Footer uses a logo strip approach. The overall flow is editorial-product: large section titles, generous whitespace, and product artifacts as the primary visual content.

## Similar Brands

- **Linear** — Same near-monochrome canvas with a single bold accent color, Inter-based typography, and product screenshots as hero imagery
- **Notion** — Spacious white layouts with hairline borders, 10px-radius cards, and Inter as the universal UI font with restrained color usage
- **Loom** — Product-led SaaS with a green primary action, comfortable card density, and large framed product screenshots floating on white
- **Vercel** — Minimalist light theme with near-black text, tight letter-spacing on headlines, and zero decorative color outside the primary accent
- **Pitch** — Editorial-meets-product design language with large display headings, generous 96px section gaps, and a single chromatic brand color
