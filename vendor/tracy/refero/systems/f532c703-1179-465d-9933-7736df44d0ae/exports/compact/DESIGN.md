# Stability AI — Style Reference
> Lavender pulse in a darkroom. Full-bleed editorial photography floats over near-black surfaces, with a single vivid violet accent that electrifies every interactive element without ever shouting.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Stability AI is a dark-canvas creative platform with a single electric lavender accent cutting through near-black surfaces. Full-bleed editorial photography dominates the hero, with floating product UI composited over models and flora to fuse tool and output into one image. Typography is Archivo in confident weights, with display sizes tightened at low line-heights (≈0.98–1.07) so headlines stack as compact editorial blocks rather than airy marketing copy. Interaction is signaled almost entirely by the violet pulse — pill-shaped CTAs, underlined links, arrow affordances, and even footer social icons all read as the same lavender frequency. Surfaces layer subtly (#1e1e1 → #383838 → #000000) with zero decorative shadow, so depth comes from tonal shifts and generous negative space rather than elevation. Components are lightweight and confident: pill buttons, thin dividers, and muted-violet body text (#725d91) that recedes while keeping the page tonally unified.

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris Spark | `#a381ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Indigo Edge | `#776cff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Mauve Veil | `#725d91` | Headings, body text on dark, and muted link text — a desaturated violet that keeps the page tonally unified with the accent while letting content recede |
| Lilac Ash | `#b6a9c6` | Secondary body copy, helper text, subtle link variants on dark — the lightest purple-tinted neutral, bridging the gap between mauve headings and white labels |
| Deep Amethyst | `#330066` | Dark-mode link variant, decorative deep-violet wash — used at low prominence for links on lighter surfaces within the footer band |
| Obsidian Canvas | `#1e1e1e` | Page background, section canvas, input fields, dark surface base — the dominant near-black that everything else floats on |
| Carbon Layer | `#383838` | Elevated card surface, image borders, list-item dividers — one step lighter than the canvas for subtle layering without shadows |
| Void | `#000000` | Hero overlay, deepest contrast surface, text-shadow reservoir — pure black for cinematic hero grading and maximum text contrast |
| Bone | `#e5e7e6` | Primary light text on dark surfaces — the dominant body and label color, nearly white but warmed off pure to sit comfortably on near-black |
| Paper White | `#ffffff` | Headlines, logo, pure-contrast text, button labels on violet fills — reserved for highest-emphasis copy where absolute white reads correctly |
| Pewter | `#bbbbbb` | Secondary body text, muted labels, low-emphasis copy — sits between Bone headings and darker supporting text for a clear hierarchy |
| Graphite | `#888888` | Tertiary text, disabled states, footer micro-copy — the deepest readable gray, used when content should be present but invisible |

## Typography

### Archivo — Primary typeface for all interface text — geometric sans-serif with a slightly condensed, editorial feel. Weights 400 for body, 600 for subheads and nav, 700 for display headlines. Display sizes (40–72px) use tight line-heights (0.98–1.07) so multi-line headlines stack as compact editorial blocks rather than airy marketing copy.
- **Substitute:** Inter, DM Sans, or Manrope
- **Weights:** 400, 600, 700
- **Sizes:** 12, 13, 14, 15, 16, 18, 20, 25, 30, 32, 40, 42, 50, 72
- **Line height:** 0.98, 1.00, 1.05, 1.06, 1.07, 1.20, 1.23, 1.25, 1.27, 1.29, 1.30, 1.34, 1.39, 1.40, 1.50, 1.56, 1.80, 1.86, 2.22

### Figtree — Button labels and small-caps CTAs — a slightly softer, rounder sans-serif that warms the button type. Use only for interactive labels at 14–16px where the geometric Archivo reads too clinical.
- **Substitute:** DM Sans 600 or Plus Jakarta Sans 600
- **Weights:** 600
- **Sizes:** 14, 16
- **Line height:** 1.20

### Clarkson — Sparingly used serif/display accent for editorial pull-quotes or section eyebrows — brings a magazine-voice contrast to the otherwise all-sans interface.
- **Substitute:** Fraunces 400 or Recoleta 400
- **Weights:** 400
- **Sizes:** 18
- **Line height:** 1.50, 1.70

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.56 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.3 | — |
| heading-sm | — | — | 25px | 1.29 | — |
| heading | — | — | 32px | 1.2 | — |
| heading-lg | — | — | 42px | 1.07 | — |
| display-lg | — | — | 50px | 1.05 | — |
| display | — | — | 72px | 0.98 | — |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 300px
- **cards:** 8px
- **links:** 11px
- **inputs:** 99px
- **buttons:** 300px
- **decorative:** 700px

## Components

### Announcement Bar
**Role:** Slim top-of-page banner for product launches and promotions

Full-bleed dark strip (#1e1e1e) at the very top of the page, centered text in Bone (#e5e7e6) at 13px Archivo 400 with a violet underlined link and a small × dismiss icon on the right. Height ≈ 40px, no border, sits flush against the nav.

### Primary Navigation
**Role:** Site-wide top navigation with logo, links, and CTA

Transparent background over hero, switches to #1e1e1 on scroll. Left: white "stability.ai" wordmark in Archivo 600. Center: horizontal nav links (Models, Solutions, Brand Studio, Deployment, Insights, Press, Company) in Bone at 15px Archivo 400. Right: pill-shaped "Contact us" button in #a381ff with white label, 300px radius, 8px 24px padding.

### Pill Primary Button
**Role:** Filled violet CTA for highest-priority actions

Background #a381ff, label white at 16px Figtree 600, 300px border-radius, 10px vertical × 24px horizontal padding. No border, no shadow. Used for "Get started here", "Sign up", "Contact us". Letter-spacing normal, text-center.

### Outlined Violet Button
**Role:** Ghost/outlined secondary action with chromatic border

Transparent background, 1.5px border in Indigo Edge #776cff, label in #776cff at 16px Figtree 600, 300px radius, 10px 24px padding. Used when a secondary action should still carry brand color but not compete with the filled primary.

### Text Link with Arrow
**Role:** Inline link with directional affordance

Bone (#e5e7e6) or Iris Spark (#a381ff) label at 16px Archivo 400 with a trailing "→" arrow in the same color. Underline appears on hover. Used for "Work with us →" style inline CTAs inside body copy.

### Pill Input Field
**Role:** Text input for email capture and form fields

Background #1e1e1, 1px border in #383838, Bone placeholder text at 14px Archivo 400, 99px border-radius, 12px 20px padding. On focus: border shifts to #a381ff. Label sits above in Pewter (#bbbbbb) at 12px Archivo 400.

### Hero Section
**Role:** Full-bleed photographic hero with composited UI overlay

Full-viewport height, background is a cinematic editorial photograph (no gradient overlay in the image area). Left third: a dark gradient overlay (Void #000000 → transparent at 30deg) carries a left-aligned kicker ("_ brand studio" with an underscore prefix in Mauve Veil), then a 5-line display headline in Paper White at 72px Archivo 700, line-height 0.98, followed by the Pill Primary Button. The right two-thirds of the hero shows the raw photograph with floating UI mockup cards composited on top — dark semi-transparent panels with light text and images, suggesting the product in use.

### Centered Editorial Section
**Role:** Dark-background statement section between feature blocks

Full-width #1e1e1 background, max-width 800px content centered horizontally, generous vertical padding (120px top/bottom). Headline in Paper White at 50–72px Archivo 700, tight line-height 1.05. Body in Pewter (#bbbbbb) at 18px Archivo 400, max 2 lines. Ends with a Text Link with Arrow in Iris Spark.

### Footer
**Role:** Site-wide footer with sitemap, newsletter, and social

Dark #1e1e1 background with a thin Iris Spark (#a381ff) gradient band at the top edge as a brand divider. Four-column layout (Brand + Newsletter | Models | Deployment | Legal) at max-width 1200px, column headers in Bone uppercase at 12px Archivo 600 with letter-spacing 1px. Column links in Pewter at 14px Archivo 400, 10px row-gap. Newsletter block has Pill Input + Pill Primary Button stacked. Social icons (LinkedIn, X, YouTube, Discord) as 36px circular buttons with #a381ff background and white icons. Copyright in Graphite (#888888) at 12px.

### Footer Column Header
**Role:** Section label in the footer sitemap

All-caps Bone (#e5e7e6) text at 12px Archivo 700, letter-spacing 1px, with a 2px Iris Spark (#a381ff) underline accent (8px wide) directly below the text to mark the section start.

### Social Icon Button
**Role:** Circular social link in the footer

36px × 36px circle, background #a381ff, white icon centered, no border, no shadow. Arranged in a horizontal row with 8px gap.

### Dropdown Select
**Role:** Native-styled select for form choices

Pill-shaped (99px radius) with #1e1e1 background, 1px #383838 border, Bone label at 14px Archivo 400, and a small chevron icon in Pewter. Matches the Pill Input Field exactly except with a dropdown caret.

## Do's and Don'ts

### Do
- Use #a381ff as the sole chromatic accent for all filled CTAs, active states, and directional arrows
- Set all buttons and tags to 300px border-radius and all inputs to 99px border-radius — pill shapes are non-negotiable
- Use Archivo at 700 weight for display headlines with line-height between 0.98 and 1.07 to keep multi-line headlines tightly stacked
- Layer depth through tonal shifts (#1e1e1 → #383838 → #000000) and 1px hairline dividers — never introduce box-shadows
- Reserve #e5e7e6 Bone for body text and #ffffff Paper White for highest-emphasis headlines and button labels
- Use #725d91 Mauve Veil for headings and body text on dark when you want the page to feel tonally unified with the violet accent
- Set section vertical padding between 80px and 120px and constrain editorial text blocks to max-width 800px

### Don't
- Do not introduce any chromatic color outside the violet family — the single-accent system is the identity
- Do not add box-shadows to cards or panels; the dark canvas makes them invisible or artifactual
- Do not use sharp corners (0–4px radius) on buttons, inputs, or tags — the system is pill-first
- Do not use #ffffff as a body color on dark; reserve it for headlines and button labels where pure white reads correctly, use #e5e7e6 for running text
- Do not use #330066 as a primary action color — it is a deep link/decoration tone, not a CTA
- Do not mix serif and sans within the same content block; Clarkson appears only as a rare editorial accent, not alongside Archivo body copy
- Do not let photography sit in rounded containers or masks — hero images must bleed to the viewport edge

## Elevation

This design deliberately avoids drop shadows. On a #1e1e1 canvas, shadows are invisible — depth is communicated through tonal layering (Obsidian Canvas #1e1e1 → Carbon Layer #383838 → Void #000000), generous negative space, and 1px hairline dividers in #383838. Do not introduce box-shadows on cards or panels; they will read as artifacts, not elevation.

## Surfaces

- **Obsidian Canvas** (`#1e1e1`) — Page-level background for all non-hero sections
- **Carbon Layer** (`#383838`) — Elevated card and panel surfaces on the dark canvas
- **Void** (`#000000`) — Hero gradient overlay and deepest contrast zone
- **Iris Spark** (`#a381ff`) — Chromatic accent surface for filled buttons and active states

## Imagery

Photography is the primary visual medium and dominates the hero. Treatment is full-bleed, editorial, high-production — a model wearing branded headphones set against a field of poppies, lit in warm golden-hour tones that contrast with the cold dark UI. The image is never masked or rounded; it bleeds to the full viewport. Floating UI mockups (dark semi-transparent panels showing product screenshots, model selectors, and image galleries) are composited on top of the photograph, merging the product and its output into a single frame. No illustrations, no 3D renders, no abstract graphics. Icon style: small, monochrome, line-weight icons inside the composited UI panels and footer social links. Photography role: aspirational proof-of-capability — the image is the creative output the platform promises. Density: hero is image-dominant (≈70% of viewport), while remaining sections are text-dominant with no photography.

## Layout

Full-bleed cinematic hero with a left-aligned text block composited over a dark gradient on the left third and a full-bleed photograph on the right two-thirds. The page then transitions to centered editorial sections on the #1e1e1 canvas — single-column max-width ≈ 800px blocks with generous 80–120px vertical padding between them. The footer is a four-column contained layout at max-width 1200px with a thin Iris Spark gradient band as a brand separator. Navigation is a transparent top bar over the hero, becoming opaque on scroll. No card grids, no masonry, no pricing tables on the visible screens — the layout is editorial and linear. Spacing density is comfortable: sections breathe, body text is centered and short, and the only tight density lives inside the composited UI mockup overlays.

## Similar Brands

- **Runway** — Same dark-canvas editorial layout with full-bleed cinematic photography and a single vivid accent for CTAs
- **Midjourney** — Dark-mode interface with minimal chrome, violet-leaning accent system, and image-first hero where the generated output IS the page
- **Pika** — Near-black canvas with a single chromatic button color, pill-shaped CTAs, and editorial display headlines stacked tight
- **Linear** — Dark UI with one accent color, generous spacing rhythm, and pill-shaped inputs and buttons — though Linear skews blue, the structural DNA is identical
- **Anthropic** — Dark editorial layout with centered statement sections, full-bleed hero, and a single warm accent against near-black
