# Reducto — Style Reference
> Magazine on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Reducto presents a warm-paper editorial system: an off-white canvas paired with a custom serif that behaves like a luxury magazine masthead, grounded by a single high-chroma magenta that punches through without shouting. The aesthetic borrows from print typography — oversized serif headlines (64–136px) set in a custom face with tight tracking, paired with a workmanlike sans for utility — and treats the page as a structured document rather than a product dashboard. Color is rationed: almost everything reads in warm grays and the deep plum #310632, and the vivid magenta #9d17a0 is reserved for the moment a user needs to act. Surfaces are paper-thin, borders are warm beige instead of cold gray, and shadows are essentially absent — depth comes from inset white highlights and subtle border contrast, not from elevation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aubergine | `#310632` | Primary text, headline color, nav active state, link accent, footer text — the deep plum that replaces black across the entire interface, giving body copy a warm violet cast instead of cold gray |
| Magenta Pulse | `#9d17a0` | Filled primary action background, selected nav indicator, brand icon color — the single vivid hue permitted on a CTA, used sparingly so the click target glows against the paper canvas |
| Damson | `#690f6b` | Outlined action border, secondary button outline — a darker shade of the action magenta, used when a ghost/outlined button needs chromatic weight without the filled fill |
| Lilac Wash | `#dcbffb` | Violet text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Ochre | `#a2541b` | Decorative icon accent, illustrative highlight — used inside product visualizations and tag chips to add warm contrast against the dominant magenta/plum palette |
| Moss | `#718613` | Decorative icon and illustration accent — secondary chromatic note for data visualization callouts, kept low-frequency |
| Reed | `#87a017` | Green text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Paper | `#fafaf9` | Page canvas, hero background, nav background — the warm off-white that defines the entire site's surface; never pure #ffffff at the top level |
| Vellum | `#f5f5f4` | Secondary surface, elevated card background, subtle section differentiation |
| Snow | `#ffffff` | Pure card surface, button text on dark/magenta fills, icon fill — only used as a surface lift or as foreground text, never as the page canvas |
| Sand | `#d7ccc1` | Primary border color, hairline dividers, card outlines — the warm beige border that replaces cold gray; the single most-used border token across the system |
| Driftwood | `#e7e5e4` | Subtle border, decorative separator, low-contrast outline — lighter than Sand for secondary dividers |
| Stone | `#d6d3d1` | Nav border, button border, body border — mid-tone warm gray for structural outlines where more contrast is needed than Sand provides |
| Graphite | `#292524` | Secondary body text, navigation labels, and subdued headings. Do not promote it to the primary CTA color |
| Slate | `#57534d` | Secondary heading text, icon stroke, strong body text — mid-dark warm gray for emphasis without going full black |
| Pewter | `#79716b` | Body text, nav text, button text on light backgrounds, helper text — the default readable text color, warm and low-contrast |
| Bark | `#44403b` | Neutral button treatment for secondary actions and selected controls. |
| Ash | `#a6a09b` | Muted helper text, disabled state, low-priority captions — the lightest readable neutral |

## Typography

### reductoSerif — Display and headline serif — the brand's signature voice. Set at 64–136px for hero/display, drops to 24–32px for section headings. Weight 470 is the workhorse (editorial body weight for a display face), weight 650 is reserved for stat numbers. The tight -0.01em tracking at every size is critical: it tightens the serif's natural rhythm into a modern, condensed look. Substituted with Playfair Display, Lora, or Source Serif Pro when unavailable.
- **Substitute:** Playfair Display, Lora, or Source Serif 4
- **Weights:** 400, 470, 650
- **Sizes:** 16px, 24px, 32px, 64px, 80px, 136px
- **Line height:** 0.74, 1.13, 1.25, 1.33, 1.50
- **Letter spacing:** -0.01em at all sizes

### Inter — Body and UI sans — the workhorse for nav links, buttons, descriptions, paragraphs, and form fields. Weight 400 for body, 500 for button labels and emphasized nav. Activates stylistic alternates 'salt' (single-storey 'a') and 'ss02' (open 'g') — these are essential to matching the brand; without them, Inter reads as generic.
- **Substitute:** DM Sans or General Sans
- **Weights:** 400, 500
- **Sizes:** 14px, 15px, 16px, 17px, 18px, 20px, 24px
- **Line height:** 1.33, 1.43, 1.50, 1.56, 1.60
- **OpenType features:** `"salt" on, "ss02" on`

### reductosans — Compact UI sans for small labels, tag chips, micro-copy, and dense interface text where Inter feels too tall. Functionally overlaps with Inter but provides a tighter, more 'captured' rhythm for chrome.
- **Substitute:** Inter at the same weight and size
- **Weights:** 400, 500
- **Sizes:** 14px, 15px, 16px
- **Line height:** 1.43, 1.50, 1.60

### Reddit Mono — Single-purpose display monospace for oversized stat numbers — the '2,000,000,000' counter. The -0.03em tracking pulls the mono's natural width inward so the number doesn't look like code, but a label. Substituted with JetBrains Mono or IBM Plex Mono.
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 80px
- **Line height:** 1.13
- **Letter spacing:** -0.03em at 80px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | — |
| body-sm | — | — | 16px | 1.5 | — |
| body-lg | — | — | 18px | 1.5 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 24px | 1.33 | -0.01px |
| heading | — | — | 32px | 1.25 | -0.01px |
| heading-lg | — | — | 64px | 1.13 | -0.01px |
| display-sm | — | — | 80px | 1.13 | -0.01px |
| display | — | — | 136px | 1.13 | -0.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24-32px
- **Element gap:** 16-24px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Announcement Bar
**Role:** Top-of-page product announcement strip

Full-width bar with #9d17a0 (Magenta Pulse) background, white text at 14px Inter weight 400, centered. 2px bottom inset highlight of rgba(255,255,255,0.3) gives it a subtle embossed feel. Padding 2–4px vertical.

### Top Navigation
**Role:** Sticky site navigation

#fafaf9 background with 1px Stone (#d6d3d1) bottom border. Logo left, nav links center in 14px Inter weight 500 Pewter, 'Log in' text link and 'Contact sales' filled dark button right. 2px white inset highlights top and bottom for a paper-sheet feel. Height ~60px, horizontal padding 24px.

### Contact Sales Button (Dark Filled)
**Role:** Primary dark CTA in nav

Bark (#44403b) background, white text, 14px Inter weight 500, 4px radius, 8px 16px padding. Inset 2px white highlights on top and bottom edges create a 3D embossed look. The dark fill on warm-paper canvas makes this the highest-contrast interactive element above the fold.

### Magenta Primary Button
**Role:** Hero CTA, primary conversion action

#9d17a0 (Magenta Pulse) background, white text, 14px Inter weight 500, 4px radius, 12px 24px padding. Arrow icon (→) follows the label. Inset rgba(255,255,255,0.25) top and bottom highlights give a glossy raised feel. This is the only filled chromatic button in the system.

### Ghost/Outlined Button
**Role:** Secondary action, demo request

Transparent background, 1px Damson (#690f6b) border, Aubergine (#310632) text, 14px Inter weight 500, 4px radius, 12px 24px padding. Pairs directly beside the magenta CTA as the lower-commitment option.

### Hero Headline
**Role:** Above-the-fold page title

Set in reductoSerif weight 470 at 64–80px, line-height 1.13, letter-spacing -0.01em, color Graphite (#292524). Two-line stack with a maximum width of ~900px. One word (e.g. 'data') is set in Magenta Pulse (#9d17a0) for emphasis — this word-color treatment is a signature pattern.

### Hero Subtext
**Role:** Supporting paragraph under headline

Inter weight 400, 17–18px, line-height 1.5, color Pewter (#79716b), max-width ~600px centered. Inline emphasis word (e.g. 'most accurate') recolored in Aubergine (#310632) for subtle weight.

### Customer Logo Strip
**Role:** Social proof row

Single row of 5+ customer wordmarks on Paper background, evenly spaced, separated by thin dividers. Logos are rendered in their own brand colors (Harvey = dark, Scale = pink, Newfront = Aubergine, Medallion = dark + blue icon). Optional '+ many more' text link in Pewter right-aligned.

### Stat Display Number
**Role:** Oversized metric counter

80px Reddit Mono weight 400, line-height 1.13, letter-spacing -0.03em, color Graphite. The mono choice with tight tracking makes the number feel like a typeset label rather than code. Small caption above in Inter 14px ('Over') centered.

### Feature Card
**Role:** 3-column feature grid card

White (#ffffff) surface on Paper background, 1px Sand (#d7ccc1) border, 8px radius, 24–32px padding. Top half contains an illustrative visual (document mockup, chart, or icon grid). Title in reductoSerif 24px Graphite, body in Inter 16px Pewter. Three cards per row, 24px gap between cards.

### Section Header
**Role:** Centered section title block

Small eyebrow label in Inter 14px weight 500 with a 4-dot icon prefix (##) in Aubergine, followed by reductoSerif heading at 48–64px Graphite, then Inter body subtext 17px Pewter. All centered, max-width ~700px, 16–24px between elements.

### Product Visualization
**Role:** Decorative document/data illustration

Flat, outlined document mockups with bounding-box overlays in Sand (#d7ccc1) and accent color tags (Lilac #dcbffb, Ochre #a2541b) on selected cells. Pixelated mosaic backgrounds scatter color squares at low opacity. No drop shadows — depth is implied by the grid.

## Do's and Don'ts

### Do
- Set all hero/display headlines in reductoSerif weight 470 at 64–136px with -0.01em letter-spacing; never use a sans face for a display heading.
- Use #9d17a0 (Magenta Pulse) as the only filled chromatic action background; pair it with white text and 12px 24px padding.
- Color exactly one word in a hero headline in #9d17a0 to create emphasis; this accent-word pattern is the system's signature rhythm.
- Use #d7ccc1 (Sand) as the default border color for all cards, dividers, and outlines; avoid cool gray borders.
- Set body copy in Inter 17px weight 400 at line-height 1.5 with 'salt' and 'ss02' features enabled — these alternates are non-negotiable for brand fidelity.
- Maintain a paper-canvas base: page background must be #fafaf9, never #ffffff; lift cards with #ffffff over the warm canvas instead of using shadows.
- Use Reddit Mono with -0.03em tracking at 80px for oversized stat numbers; the mono face signals 'this is a measurement, not a word'.

### Don't
- Don't use black (#000000) for body or heading text; use Graphite (#292524) or Aubergine (#310632) to keep the warm palette consistent.
- Don't apply drop shadows to cards or sections; depth must come from border color contrast or white-on-warm layering, not from blur shadows.
- Don't use cool gray (#6b7280, #94a3b8, etc.) for borders or text — every neutral in this system is warm (brown- or beige-tinted).
- Don't activate the magenta action color on more than one element per viewport section; if the CTA is magenta, the nav must stay neutral.
- Don't use the reductoSerif face for body copy or UI labels under 24px; it loses legibility below that and breaks the display/utility split.
- Don't introduce additional chromatic accent colors beyond Ochre, Moss, and Lilac; the palette intentionally restricts to plum-family + warm neutrals + 2–3 illustration accents.
- Don't use #0000ee or default browser link blue; all links must use Aubergine or Lilac Wash.

## Elevation

- **Filled action button (magenta):** `inset 0 -2px 0 0 rgba(255,255,255,0.25), inset 0 2px 0 0 rgba(255,255,255,0.25), 0 1px 2px 0 rgba(0,0,0,0.05)`
- **Nav bar:** `inset 0 -2px 0 0 rgba(255,255,255,0.3), inset 0 2px 0 0 rgba(255,255,255,0.3)`

## Surfaces

- **Paper** (`#fafaf9`) — Base page canvas — warm off-white, the dominant surface of every section
- **Snow** (`#ffffff`) — Card surface, elevated panel — pure white sits on top of Paper to create gentle lift without shadows
- **Vellum** (`#f5f5f4`) — Subtle section differentiation, nav background variant, secondary surface
- **Magenta Pulse** (`#9d17a0`) — Accent surface — announcement bar, filled CTA, selected state
- **Graphite** (`#292524`) — Dark surface — dark button, inverted panel, footer dark zone

## Imagery

Product visualizations dominate over photography. Document mockups are rendered as flat outlined rectangles with visible bounding-box overlays, grid guides, and small color-coded cell tags — they read as 'annotated data' rather than realistic screenshots. A pixelated mosaic of scattered color squares (in Ochre, Moss, Lilac, and Plum) appears as a decorative background element behind the stat counter, giving a digital-data texture. No lifestyle photography, no people, no environments. Icons are thin-stroke line icons in Slate or Graphite. The visual language is 'schematic document intelligence' — the product is shown as structured data being extracted, always flat, always annotated, never photographic.

## Layout

Max-width 1200px centered container with generous horizontal padding. Hero is a centered text block (headline → subtext → two-button row) occupying the upper third of the viewport, followed by a full-width row of document-to-data illustrations spanning the page width with no container constraint. Customer logos sit in a single horizontal row inside the container. Below the fold, sections alternate between centered-text headers and 3-column card grids, each card containing an illustration above a title and short body. Vertical rhythm is generous: 80px between major sections, 24px between cards, 16–24px between text elements within a block. The nav is a sticky horizontal bar with logo left, links center, and a dark filled CTA right. No sidebar, no mega-menu.

## Similar Brands

- **Linear** — Same editorial-serif-meets-utility-sans typography pairing, same single-accent-color rationing, same paper-white canvas with warm neutrals
- **Vercel** — Same disciplined use of one chromatic action color against an otherwise monochrome interface, same generous vertical section rhythm
- **Stripe** — Same warm off-white canvas replacing pure white, same serif headlines at 60–80px for hero, same border-as-depth philosophy instead of drop shadows
- **Notion** — Same warm-gray text palette and hairline warm-beige borders, same absence of heavy shadows, same document-first visual language
