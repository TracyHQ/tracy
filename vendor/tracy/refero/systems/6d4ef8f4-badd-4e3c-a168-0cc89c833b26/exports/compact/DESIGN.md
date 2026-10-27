# MA Quilts — Style Reference
> Crayon-bright quilt workshop pinned to sunlit wall

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

MA Quilts is a crayon-bright textile-art studio: a flat, poster-like canvas where oversize Manrope headlines shout in tangerine against wash-yellow and blush-pink full-bleed blocks. The entire interface stays two-dimensional — no shadows, no gradients, no filled buttons — relying on thick chromatic borders, enormous letter-spaced type, and full-bleed color blocks to do all the visual work. Layout is spacious and gallery-like, with product imagery given room to breathe and labels in monospace caps. The system reads more like a zine or museum wall text than a SaaS dashboard, and any new page should preserve that paper-poster logic: chromatic borders instead of fills, type as ornament, and backgrounds that change like colored paper sheets rather than cards on a neutral surface.

## Colors

| Name | Value | Role |
|------|-------|------|
| Tangerine | `#f15a24` | Headlines, body text accents, and outlined button borders — the single loud color that carries the whole brand. Used as a 1-2px border on buttons and links, and as fill for all display and heading text. Never appears as a filled button background; the system speaks in outlines |
| Sun Yellow | `#ffed8c` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Blush Pink | `#ffcccc` | Secondary full-bleed background block, often paired with product photography to make fabric colors pop. Used as a flat color field, never as a tint or gradient |
| Midnight Navy | `#050133` | Secondary text and link borders — a near-black with a violet bias that softens the page's high-contrast black on white. Used for body copy and as an alternate outlined-action border |
| Coral Wash | `#f4a398` | Soft warm surface for transitional sections — a diluted cousin of Tangerine used when a page needs a quieter colored block |
| Paper White | `#ffffff` | Default page canvas and content section background. The neutral ground between colored blocks |
| Ink Black | `#000000` | SVG fills, occasional body text, and the darkest neutral when Midnight Navy reads too colored. Pure black only where the page demands the most weight |
| Graphite | `#333333` | Secondary text, image captions, and subtle borders. Sits between Ink Black and Paper White for muted helper copy |
| Mist Blue | `#cce1e2` | Decorative SVG fill and soft wash — a near-gray with a cool cast used inside illustrations and as a quiet background tint |

## Typography

### Manrope — Primary display and heading family across the entire site. Weight 200 (light) carries the massive display headlines — the thin strokes against tangerine fill create the signature 'stenciled poster' feel where the type reads as colored shape rather than inked letter. Weight 700 is used for emphasis and button labels.
- **Substitute:** DM Sans
- **Weights:** 200, 400, 700
- **Sizes:** 23px, 29px, 30px, 36px, 60px, 68px, 72px, 126px
- **Line height:** 1.00–2.40 depending on size
- **Letter spacing:** 0.06em at subhead sizes, 0.12em at display sizes

### Roboto Mono — Captions, dates, product labels, and metadata — all uppercase tracking in Tangerine beneath images. The monospace's mechanical rhythm contrasts with Manrope's humanist curves and signals 'catalog label' rather than 'editorial body'.
- **Substitute:** IBM Plex Mono
- **Weights:** 400, 700
- **Sizes:** 14px, 18px, 30px
- **Line height:** 1.60–2.00
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.6 | 0px |
| body-sm | — | — | 18px | 1.6 | 0px |
| body | — | — | 23px | 1.4 | 0px |
| subheading | — | — | 30px | 1.2 | 1.8px |
| heading-sm | — | — | 36px | 1.2 | 2.16px |
| heading | — | — | 60px | 1 | 7.2px |
| heading-lg | — | — | 72px | 1 | 8.64px |
| display | — | — | 126px | 1 | 15.12px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 48-80px
- **Card padding:** 24px
- **Element gap:** 14px

### Border Radius

- **tags:** 66px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 66px

## Components

### Outlined Pill Button
**Role:** Primary interactive control across the site

Transparent background with 1-2px Tangerine (#f15a24) border, 66px border-radius, 9px vertical / 46px horizontal padding. Label in Manrope weight 400-700, uppercase, Tangerine fill. On hover the border thickens or inverts to filled Tangerine with white text. No drop shadow. The pill radius (66px) is the system's only rounded element — everything else is sharp-cornered.

### Ghost Link Button
**Role:** Secondary navigation and inline links

No background, no border. Underline rendered as a 1-2px Tangerine or Midnight Navy border-bottom. Text in Tangerine or Midnight Navy at body-sm (18px) Manrope. Sits inline within paragraphs and list items.

### Display Headline Block
**Role:** Hero and section-opening typography

Manrope weight 200 at 126px (display) or 60-72px (heading), line-height 1.00, letter-spacing 0.12em. Fill is always Tangerine (#f15a24). Text wraps naturally and is left-aligned, never centered. The light weight + wide tracking combination is the site's defining typographic signature.

### Full-Bleed Color Section
**Role:** Page-level background blocks that replace the white canvas

Edgeless section spanning the full viewport width. Background is Sun Yellow (#ffed8c), Blush Pink (#ffcccc), or Coral Wash (#f4a398). Internal content is contained within the 1200px page max-width. Used to break the page into 'colored paper sheets' rather than cards on a neutral surface.

### Product Gallery Card
**Role:** Catalog item display in the shop grid

Square or 4:5 product photograph on a flat Blush Pink or Paper White background. No border, no shadow, no rounded corners. Caption sits beneath in Roboto Mono 14px uppercase Tangerine: product name on one line, optional price below. Padding around image is 0 — the photo bleeds to the card edge.

### Blog Post Card
**Role:** Editorial entry in the blog list

Rectangular photograph (3:2 or 4:3 ratio) on Paper White, no border or radius. Date in Roboto Mono 14px Tangerine sits directly below the image, then the post title in Manrope 23px weight 400 in Ink Black. 30px gap between image and date, 10px between date and title. No card container — each post is a vertical stack on the white canvas.

### Catalog Label
**Role:** Caption beneath product images

Roboto Mono 14px, uppercase, Tangerine (#f15a24), letter-spacing normal. Centered beneath the corresponding image. Functions as a museum-style object label.

### Top Navigation Bar
**Role:** Site-wide header

Transparent or Sun Yellow background depending on the current section. Left: Tangerine 'M' wordmark at 30px Manrope weight 700. Right: hamburger menu icon rendered as two Tangerine horizontal lines (no border, no background). Fixed to top edge with no visible divider.

### Split Hero Block
**Role:** Opening screen layout

Two-column split at full viewport height. Left column: Sun Yellow background with left-aligned Display Headline (Manrope 200 at 126px, Tangerine) stacked vertically. Right column: Blush Pink background containing a single large product photograph (the quilt coat) hanging from a visible wooden hanger. No margins between the two color blocks — they meet at a hard edge.

### Section Heading
**Role:** Subsection openers like 'BOLD AND GEOMETRIC'

Manrope weight 700 at 60-72px, Tangerine, uppercase, left-aligned, letter-spacing 0.12em. Sits above a row of product cards with 48px vertical breathing room. Often breaks across multiple lines with each word on its own line.

## Do's and Don'ts

### Do
- Use Manrope weight 200 at 126px with 0.12em letter-spacing for display headlines — the whisper-thin strokes against Tangerine fill are the brand's defining look.
- Apply the 66px border-radius exclusively to buttons and tags; keep all cards, images, and sections at 0px radius for a paper-poster feel.
- Render buttons as outlined pills (1-2px Tangerine border, transparent fill) rather than filled rectangles — the system speaks in borders, not backgrounds.
- Use full-bleed Sun Yellow, Blush Pink, or Coral Wash as section backgrounds in place of white cards with shadows.
- Label product and blog images with Roboto Mono 14px uppercase Tangerine text, centered beneath the image.
- Reserve Tangerine (#f15a24) for all heading text, button borders, and metadata — it is the only chromatic voice in the type system.
- Set line-height to 1.00 for all display and heading sizes; the tight stacking is essential to the poster aesthetic.

### Don't
- Do not fill buttons with Tangerine or any solid color — the outlined pill is non-negotiable.
- Do not add drop shadows, gradients, or any elevation to cards, buttons, or images — the system is strictly flat.
- Do not center display headlines — they are always left-aligned and stacked vertically word by word.
- Do not use Manrope weight 400 or 700 for display headlines — only weight 200 produces the signature thin-stroked poster type.
- Do not introduce a fourth background color beyond Sun Yellow, Blush Pink, and Coral Wash without a clear visual reason.
- Do not apply border-radius to images, cards, or product containers — sharp corners preserve the cut-and-paste craft identity.
- Do not use letter-spacing below 0.06em on any heading or display text — the wide tracking is what makes the type read as label rather than sentence.

## Surfaces

- **Paper White** (`#ffffff`) — Default canvas for product grids, blog lists, and the dominant content surface
- **Sun Yellow** (`#ffed8c`) — Full-bleed hero and accent sections — the brand's most recognizable surface
- **Blush Pink** (`#ffcccc`) — Product photography backdrop and secondary colored block
- **Coral Wash** (`#f4a398`) — Tertiary warm surface for section transitions

## Imagery

Photography is the product. Every product and blog image is a tight, straight-on photograph of a finished quilt or garment — no lifestyle context, no models in environments, no styled rooms. Garments are photographed hanging from visible wooden hangers against flat Blush Pink or Paper White backdrops, making the wooden hanger a recurring visual motif. Quilt photographs are shot flat-lay on neutral surfaces or hung vertically. Color treatment is true-to-life and saturated — the oranges, navies, pinks, and yellows of the patchwork read as vivid as possible because the rest of the interface is otherwise flat color blocks. No illustrations, no abstract graphics, no icons beyond the simple 'M' wordmark and the two-line hamburger. The quilt patterns themselves function as the site's only ornamental visual content — every triangle and stripe in a photograph echoes the geometric language of the headlines.

## Layout

The page reads as a vertical stack of full-bleed colored panels rather than a contained card grid. The hero is a 50/50 split: yellow left with left-aligned oversize headline, pink right with a single hanging garment photograph. Below the hero, sections return to white canvas with generous 48-80px vertical gaps between blocks. Product grids use a 4-column row of equal-width photographs, each captioned beneath — no gutters beyond the caption gap. Blog sections use a 3-column row. Section headings are oversized and left-aligned, often breaking across multiple lines with single words per line. Navigation is minimal: a small 'M' logo top-left and a hamburger top-right, both flat against whatever colored block the page is currently on. There are no sticky headers, no sidebars, no breadcrumbs — the page scrolls linearly through colored panels like turning pages in a zine. Content is contained within a 1200px max-width but the colored backgrounds themselves always bleed to the viewport edge.

## Similar Brands

- **Bode** — Same craft-portfolio presentation with oversize serif/sans display type, textile-photography-first grids, and a single saturated accent color carrying the entire brand.
- **Hay (hay.dk)** — Same flat-poster aesthetic with full-bleed color blocks, product photography on saturated backgrounds, and oversized geometric type as the dominant visual element.
- **Marimekko** — Same bold geometric pattern language treated as hero content, flat color-block sectioning, and oversized sans-serif headlines in a single brand color.
- **Studio Bergini** — Same zine-like layout with full-bleed colored panels, minimal outlined navigation, and display type that breaks across lines word by word.
- **Toast (toa.st)** — Same craft-brand approach of oversize headings in a single accent color, flat product photography without lifestyle staging, and museum-label caption typography.
