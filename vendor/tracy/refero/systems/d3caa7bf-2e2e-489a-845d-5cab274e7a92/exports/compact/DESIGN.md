# Frontier AI LLMs — Style Reference
> warm parchment with a campfire heart

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mistral's visual system reads as a sunlit workshop on warm paper — a cream-ivory canvas (#fffaeb) that feels like aged parchment, generously padded with a single vivid orange (#fa520f) doing all the chromatic talking. The hero erupts into a dramatic amber landscape gradient with mountain silhouettes, then everything afterward returns to that quiet, warm, almost tactile quietness. Typography stays in a clean system sans (Arial) with tight -0.025em tracking that tightens the lines into one confident whisper. The system has an unusual visual signature: warm-toned shadows tinted in olive-gold rather than cool gray, giving every elevated element a 'lit from within by firelight' quality. Density is comfortable and confident, not dense — breathing room is part of the brand. The product mockups in the body break into dark UI panels floating on the cream, creating contrast between the paper-warm site shell and the structured dark application surfaces.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Canvas | `#fffaeb` | Page background, hero body, section fills — warm cream-ivory that replaces the typical white SaaS canvas and gives the system its sunlit, paper-like quality |
| Pure Card | `#ffffff` | Card surfaces, elevated panels, feature blocks, and product mockup shells — pure white that reads brighter than the canvas and creates a subtle paper-on-paper layering |
| Midnight Ink | `#1f1f1f` | Primary body text, headings, nav links, button text — near-black rather than pure black keeps text from feeling harsh against the warm canvas |
| Carbon | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Graphite | `#3c3c3c` | Secondary text, button hover borders, muted supporting copy |
| Ember | `#fa520f` | Brand accent — decorative arrow icons, the flag mark, section punctuation, active indicators; vivid orange against warm cream creates urgency without aggression and is the only chromatic voice in the interface |
| Soft Butter | `#fff0c2` | Yellow supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Honeycomb | `#ecdaa2` | Warm hairlines, decorative block borders, subtle dividers that need to be visible against the cream canvas without breaking the warm palette |

## Typography

### Arial — All text — a single-weight system sans that ships in the browser. The 82px display with -0.025em tracking and 0.95 line-height gives headlines a sculpted, almost condensed feel without actually condensing. Because weight stays at 400, hierarchy comes purely from size and tracking — this is deliberate restraint: no weight-700 shouts, just scale.
- **Substitute:** Helvetica, Inter, system-ui
- **Weights:** 400
- **Sizes:** 14px, 16px, 24px, 32px, 38px, 48px, 56px, 82px
- **Line height:** 0.95-1.50
- **Letter spacing:** -0.025em across all sizes (tightest at 82px display, normalizing through body sizes)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.35px |
| body-sm | — | — | 16px | 1.5 | -0.4px |
| body | — | — | 24px | 1.33 | -0.6px |
| subheading | — | — | 32px | 1.15 | -0.8px |
| heading-sm | — | — | 38px | 1 | -0.95px |
| heading | — | — | 48px | 1 | -1.2px |
| heading-lg | — | — | 56px | 1 | -1.4px |
| display | — | — | 82px | 0.95 | -2.05px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-96px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **inputs:** 8px
- **buttons:** 6px

## Components

### Top Navigation Bar
**Role:** Site-wide header

Sticky top bar on #fffaeb canvas. Left: Ember M-flag logo. Center: nav links (Products, Solutions, Research, Blog, Customers, Company) in 16px Arial weight 400, #1f1f1f, with 24px gaps. Right: ghost 'Contact Sales' button (transparent fill, 1px #1f1f1f border, 6px radius, 16px 20px padding) followed by filled 'Try Studio' button (#000000 fill, white text, 6px radius, 16px 20px padding) with a trailing chevron. Height ~64px. No drop shadow — sits flush on canvas.

### Hero Landscape Banner
**Role:** Above-the-fold brand statement

Full-bleed 82px display headline 'Frontier AI. In your hands.' in #1f1f1f over an amber landscape gradient. The background uses the multi-stop warm gradient (olive → amber → rust) with mountain silhouette overlays, creating a campfire-at-dusk atmosphere. Subhead at 24px weight 400, body text at 16px. Two ghost text links ('Get in touch', 'Start building') with trailing arrow icons in #fa520f sit at 48-80px below the headline.

### Enterprise Logo Strip
**Role:** Social proof band

Full-width row of monochrome partner logos (IBM, ASML, HSBC, Cisco, Teleperformance, SAP) on #fffaeb canvas, centered, with equal 48px column gaps. Logos rendered in #1f1f1f only — no brand colors from the partners survive. This neutralization is a deliberate brand-strengthening move: the partners lend credibility but don't compete with the visual identity.

### Split Feature Section
**Role:** Mid-page value proposition

Two-column layout. Left: large heading at 48px ('Your AI future belongs in your hands.') followed by a decorative block-grid pattern of #fff0c2 rectangles that echo Tetris-like shapes. Right: vertically stacked feature blocks, each with a small Ember arrow icon, a 32px subheading, and 16px body text in #1f1f1f. Feature blocks separated by 32px vertical gaps with no dividers — breathing room does the structuring.

### Product Capability Section
**Role:** Feature deep-dive with UI showcase

Two-column with heading on the left and stacked dark-mode product mockups on the right. Background is a faint grid pattern (#fff0c2 hairlines at 10% opacity) over the cream canvas. Left side features a 56px heading ('Autonomous work.') with 16px body text, a vertical stack of 3 Soft Butter tag pills (Workflow automation, Enterprise search, Content creation) at 9999px radius, and a filled #000000 CTA button 'Discover Le Chat' with trailing Ember arrow.

### Ghost Text Button
**Role:** Secondary action / inline link

No background, no border. 16px Arial weight 400, #1f1f1f text, with a trailing 12px Ember arrow icon (→). Underline appears on hover. Used for inline actions like 'Get in touch', 'Start building', feature list headers. The arrow becomes the visual anchor — text is just a label for the direction.

### Filled Dark Button
**Role:** Primary action

#000000 background, #ffffff text, 6px border-radius, 16px vertical / 20px horizontal padding, 16px Arial weight 400. May carry a trailing chevron-down for dropdown variants. Used sparingly: 'Try Studio' in nav, 'Discover Le Chat' in feature sections. The deep black against the warm cream creates the highest contrast on the page — these buttons are anchors, not decorations.

### Ghost Outline Button
**Role:** Tertiary action

Transparent background, 1px #1f1f1f border, 6px radius, 16px/20px padding, 16px Arial weight 400 in #1f1f1f. Hover: fills to #fff0c2. Used for 'Contact Sales' — the gentler sibling that invites conversation without competing with the primary black button beside it.

### Soft Butter Pill
**Role:** Filter, tag, or category label

#fff0c2 background, #1f1f1f text, 9999px border-radius, 8px vertical / 12px horizontal padding, 14px Arial weight 400. May include a trailing checkmark icon. Used as a row of capability tags in the Autonomous work section. The pill radius contrasts intentionally with the 6px button radius — pills feel soft and categorical, buttons feel precise and actionable.

### Feature List Item
**Role:** Scannable value-proposition block

Vertical stack: 12px Ember right-arrow icon → 32px heading in #1f1f1f → 16px body text in #1f1f1f. 32px gap between items. No borders or backgrounds — the eyebrow icon is the only chromatic element, and it appears as a small spark of intent at the start of each block.

### Dark Product Mockup Panel
**Role:** Application UI showcase

Dark #1f1f1f panel with 12px radius, floating on the cream canvas. Contains simulated chat/file list interfaces with white text, colored file-type icons (xlsx in green, pdf in red — but these are product content, not design system tokens). Warm-toned shadow: rgba(127, 99, 21, 0.12) -8px 16px 39px with cascading layers extending to -130px 256px 115px at 0.02 alpha. The olive-gold shadow tint makes the dark panel feel lit by the same firelight as the hero.

### Decorative Block Grid
**Role:** Visual texture in feature sections

A pattern of #fff0c2 rectangles of varying sizes arranged in a loose grid/Tetris composition, sitting behind or beside heading text. No interactivity, no content. This is the system's playful signature — it turns empty layout space into brand character, the way Stripe uses gradient meshes or Linear uses dotted grids.

## Do's and Don'ts

### Do
- Use #fffaeb as the default page background — never pure white for full-page canvas; white is reserved for card surfaces that need to lift off the parchment.
- Let the Ember orange (#fa520f) appear only as small functional punctuation: arrow icons, the M-mark, active indicators, and small accent shapes. It should never fill large surfaces except the hero landscape.
- Keep all type at weight 400 — hierarchy comes from size and tracking, not from bolding. Headlines whisper; they do not shout.
- Apply -0.025em letter-spacing at every size; the tracking tightens the system sans into something that feels custom-sculpted even though it ships in the browser.
- Use the warm shadow stack (tinted in rgba(127, 99, 21, 0.x)) for all elevated elements — never use cool gray shadows; they would break the campfire palette.
- Set button radius at 6px and tag radius at 9999px — the contrast between crisp buttons and soft pills is part of the visual vocabulary.
- Stack 12px gaps within groups, 32px between groups, 80-96px between sections. The breathing room is the brand — do not pack it dense.

### Don't
- Do not introduce new chromatic colors — the system is cream + black + one orange. Any new hue dilutes the signature.
- Do not use weight 600 or 700 — the entire typographic system runs on 400 with size-driven hierarchy; introducing bold breaks the anti-shout aesthetic.
- Do not use cool gray shadows (#000000 with low alpha) — always tint shadows in the warm olive-gold hue (127, 99, 21) to stay on-palette.
- Do not use 9999px radius on buttons or cards — reserve pill radius exclusively for tags, chips, and filter labels.
- Do not fill the Ember orange as a button background — it is a brand accent, not an action color. The only filled button color is #000000.
- Do not use pure #ffffff as a page background — the warm canvas (#fffaeb) is the system's defining surface; white pages feel clinical by comparison.
- Do not stack more than two type sizes in a single block — the hierarchy must read at a glance through size jumps, not through cumulative scaling.

## Elevation

- **Dark Product Mockup Panel:** `rgba(127, 99, 21, 0.12) -8px 16px 39px 0px, rgba(127, 99, 21, 0.1) -33px 64px 72px 0px, rgba(127, 99, 21, 0.06) -73px 144px 97px 0px, rgba(127, 99, 21, 0.02) -130px 256px 115px 0px`

## Surfaces

- **Parchment Canvas** (`#fffaeb`) — Page background — the warm cream-ivory that replaces white and defines the system's sunlit character
- **Pure Card** (`#ffffff`) — Product UI shells, elevated feature cards, mockup containers — brighter than the canvas to read as 'lifted off the page'
- **Butter Tag** (`#fff0c2`) — Highlight surfaces — selected filter chips, active tags, soft callouts that need a third tonal step
- **Dark Application** (`#1f1f1f`) — In-app product mockups and dark UI panels floating on the cream — the structured application surface contrasted against the warm marketing shell

## Imagery

The site uses three imagery modes in sequence: (1) a full-bleed warm landscape gradient with mountain silhouettes as the hero, establishing the campfire palette; (2) decorative #fff0c2 block-grid patterns that function as abstract texture in feature sections — never photographic, always geometric and soft; (3) dark product UI mockups floating on the cream canvas, showing chat interfaces and file lists as proof of the actual product. There is no lifestyle photography, no people, no stock imagery. The only 'real world' image is the hero landscape, and even that is illustrated/silhouetted, not photographed. Iconography is minimal: the Ember M-mark as a custom flag shape, small right-arrow chevrons for actions, and simple line icons inside the product mockups. Everything else is typographic and structural.

## Layout

Layout is max-width 1200px centered for all content blocks, with the hero breaking to full-bleed. The page rhythm follows a consistent pattern: (1) full-bleed warm hero with centered-or-left-aligned headline, (2) a white-on-cream partner logo band, (3) split sections alternating between left-text/right-feature-list and left-text/right-product-mockup, (4) 80-96px vertical breathing room between sections, no alternating dark bands — the entire post-hero page stays on the cream canvas. Navigation is a single sticky top bar. The site uses a 2-column split for all mid-page sections; no 3-column card grids. The autonomous-work section introduces a faint background grid pattern (#fff0c2 hairlines) to add texture without breaking the palette. Content arrangement is text-left dominant, with the right column always carrying either a list or a dark product surface.

## Similar Brands

- **Stripe** — Both use a restrained palette with one vivid accent, generous whitespace, and tight tracking on headlines — but Mistral swaps Stripe's cool blue gradient for warm cream and amber.
- **Linear** — Similar display headlines with tight -0.025em tracking and a single-weight sans approach, though Linear's violet/indigo accent becomes Mistral's ember orange.
- **Vercel** — Both let one strong typographic voice carry the hero with minimal UI chrome, but Mistral's warm parchment canvas replaces Vercel's pure white/grayscale palette.
- **Notion** — Both have a paper-like canvas feel and use decorative geometric blocks (Notion's shapes, Mistral's #fff0c2 Tetris grids) as visual texture in feature sections.
