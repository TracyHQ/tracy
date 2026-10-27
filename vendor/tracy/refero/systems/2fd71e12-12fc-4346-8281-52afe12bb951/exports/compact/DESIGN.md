# Nomen Nescio — Style Reference
> ink on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Nomen Nescio is an editorial paper-and-ink system for a conceptual fashion label: a warm off-white canvas (#fdfdfa) holds oversized fashion photography while every interface element recedes into a single near-black ink (#2b2b2e). The entire typography stack uses one custom sans-serif at one weight (400) — no bold, no light, no italic — so hierarchy is built purely through size and negative letter-spacing rather than contrast. Components are flat rectangles, no shadows, no rounded corners, no color: identity comes from the restraint, the warm neutrals, and the photography bleeding edge-to-edge. The system feels like a printed zine reproduced as a website — whitespace is the layout grid, and every UI surface could be cut from the same sheet of paper.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper | `#fdfdfa` | Page canvas and card surfaces — warm off-white reads as aged paper, not digital white |
| Bone | `#f5f3ee` | Elevated surface and subtle washes — used for card backgrounds and hover states, one step warmer than canvas |
| Ink | `#2b2b2e` | Primary text, navigation, borders, and outlined actions — near-black with a warm undertone, never pure #000 |
| Ash | `#bebcb4` | Muted text and secondary borders — warm gray for metadata, subtitles, and hairline dividers |
| Pebble | `#deddd8` | Light dividers and structural borders — barely visible rules between sections |
| Mist | `#d9d7c9` | Form input borders — slightly warmer than pebble to read as a distinct UI surface |

## Typography

### Nomen Nescio (custom) — Single-weight display and body sans-serif — a monoline custom face used for every text element on the site. No bold, no light, no italic variants exist; hierarchy is achieved through size and negative letter-spacing only. Substitutes with a similar monoline character: 'Neue Haas Grotesk Display Pro' or 'Söhne' at weight 400.
- **Substitute:** Söhne or Inter at 400
- **Weights:** 400
- **Sizes:** 14, 15, 16, 18, 19, 28, 36
- **Line height:** 1.05–1.43
- **Letter spacing:** -0.036em at 36px, -0.028em at 28px, -0.021em at 19px, -0.017em at 18px, -0.016em at 16px, -0.008em at 14–15px, +0.007em for small uppercase labels

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | -0.112px |
| body | — | — | 16px | 1.43 | -0.256px |
| subheading | — | — | 18px | 1.25 | -0.306px |
| heading | — | — | 28px | 1.11 | -0.784px |
| heading-lg | — | — | 36px | 1.05 | -1.296px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 39-47px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **cards:** 0px
- **badges:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Full-Bleed Hero Image
**Role:** Opening viewport visual

Edge-to-edge photograph with no padding, no border, no radius. Navigation text overlays directly on the image in #fdfdfa (white) for legibility. Aspect ratio fills the full viewport width; the image bleeds to the page edges with no container.

### Text Navigation Bar
**Role:** Primary site navigation

Text-only nav links at 15px in Ink (#2b2b2e) for light backgrounds or Paper (#fdfdfa) when overlaid on dark hero. No backgrounds, no borders, no padding blocks — just spaced words separated by ~20px gaps. Left-aligned logo, right-aligned utility links (EUR, Search, Bag).

### Announcement Bar
**Role:** Site-wide top banner

Single-line centered text at 14px in Paper (#fdfdfa) on Ink (#2b2b2e) background. Full-bleed, 1px or minimal vertical padding, contains a dismiss 'Close' action right-aligned.

### Editorial Feature Card
**Role:** Large content card for collections, articles, and installations

Two-column card: full-width photograph on top, title and subtitle stacked below on Paper canvas. Title at 18–19px Ink, subtitle at 14–15px Ash. No border, no padding container around the image, 20px vertical spacing between image and text block.

### Product Grid Card
**Role:** Individual product listing

Square or portrait product photo (no radius, no border) with optional discount tag overlay in top-left corner. No text below the image in the visible grid; product details appear on interaction. Image fills its grid cell edge-to-edge.

### Discount Badge
**Role:** Sale indicator on product images

Plain text '-50%' at 14px in Ink (#2b2b2e), no background, no border, no pill shape. Positioned absolutely in the top-left of a product image. Relies on whitespace and position for emphasis.

### Ghost Link
**Role:** Default interactive text element

Ink-colored text link with 1px Ink underline or hairline border-bottom. No background fill, no padding, no hover background change. Inherits body font size and weight (always 400).

### Text Input
**Role:** Form fields for search, email, checkout

Borderless or 1px Mist (#d9d7c9) bottom border, Paper (#fdfdfa) background, Ink text. No focus ring color shift — focus state uses a thicker Ink bottom border instead. Placeholder text in Ash (#bebcb4).

### Outlined Action Button
**Role:** Primary interactive button

1px Ink (#2b2b2e) border, Paper (#fdfdfa) background, Ink text at 14–16px. 6–8px vertical padding, 20px horizontal padding. No radius. On dark/image backgrounds, inverts to Paper border with Paper text. This is the only button variant — there is no filled button.

### Section Heading
**Role:** Editorial section titles

Ink text at 28–36px, weight 400, negative letter-spacing (-0.028em to -0.036em). Left-aligned with no decorative element. Generous whitespace above and below (39–47px section gap).

### Product Grid
**Role:** Collection display layout

4-column grid of product cards on desktop, 2-column on tablet, 1-column on mobile. No gutters between cards — images touch edge-to-edge, creating a seamless editorial wall. Section sits directly on Paper canvas with no card container.

### Side Label (Explore)
**Role:** Vertical or edge-anchored category label

Small Ink text at 14–15px, vertically centered or left-edge anchored. Functions as a section divider label (e.g., 'Explore' on the left edge). No background, no border.

## Do's and Don'ts

### Do
- Use the custom 'Nomen Nescio' font at weight 400 exclusively — never introduce bold, light, or italic weights for hierarchy; build contrast through size and negative letter-spacing alone
- Set all borders to 0px radius — every corner is sharp, every image bleeds edge-to-edge without rounding
- Reach for #fdfdfa as the page canvas and #f5f3ee only when you need subtle surface elevation; never use white (#ffffff) or pure black (#000000)
- Apply letter-spacing of -0.036em at display sizes (36px) down to -0.008em at body sizes; reserve the positive +0.007em tracking exclusively for small uppercase micro-labels
- Keep all buttons ghost/outlined with a 1px Ink border on Paper background — there is no filled button variant in this system
- Let photography fill the entire viewport or grid cell; never pad, frame, or containerize images with backgrounds or borders
- Use 20px for element gaps, 39–47px for section breaks, and 4px as the base spacing unit for all micro-adjustments

### Don't
- Do not introduce any color outside the six neutrals (Paper, Bone, Ink, Ash, Pebble, Mist) — the system is 2% colorful by design and any accent will break the editorial paper language
- Do not use box-shadows, drop-shadows, or glow effects — elevation comes from surface color shifts and borders, never from shadow
- Do not use border-radius on any element — 0px everywhere, no exceptions for badges, buttons, or images
- Do not set backgrounds to pure white (#ffffff) or text to pure black (#000000) — always use the warm off-white (#fdfdfa) and warm near-black (#2b2b2e) variants
- Do not add a bold or semibold weight for emphasis — if something needs more visual weight, increase its size and tighten its letter-spacing further
- Do not containerize or pad product images with white space — images should touch the grid edges and the page edges
- Do not introduce filled (solid-color) buttons, gradient backgrounds, or colored badges — the discount tag is plain text on the image, not a pill

## Elevation

The design system has no shadow vocabulary. Elevation is communicated exclusively through surface color shifts (canvas #fdfdfa → bone #f5f3ee) and hairline borders. Every element sits flush against the paper — the flatness is intentional, mimicking a printed publication rather than a skeuomorphic software interface.

## Surfaces

- **Canvas** (`#fdfdfa`) — Page background — the warm white that everything sits on
- **Bone** (`#f5f3ee`) — Card and elevated surface — subtly warmer than canvas to create gentle separation

## Imagery

Imagery is the primary brand expression: full-bleed editorial fashion photography, predominantly featuring dark monochromatic clothing on models in architectural or outdoor settings (concrete tracks, brutalist buildings, natural light). Treatment is high-key with natural daylight, muted color grading, and tight or environmental framing — no studio backdrops, no product-only flat-lays. Images are always uncropped and unrounded, bleeding to the page edges. The role of photography is atmospheric and identity-defining rather than informational; it occupies 60–80% of the visual space on key pages, with text acting as captions. No illustrations, no icons, no decorative graphics — the only visual elements are photographs and type.

## Layout

The page model is full-bleed with no max-width container on the hero and editorial sections, transitioning to a 1440px max-width on grid and product sections. Navigation is a single-line text bar overlaying the hero. The hero is a full-viewport-width photograph with overlaid text navigation. Below the hero, content alternates between two-column editorial feature cards and a 4-column product grid, with a left-edge 'Explore' label anchoring the section. Section rhythm is consistent: 39–47px vertical gaps, no alternating background bands (everything sits on Paper), no dividers between sections. Content is left-aligned with generous left margin. Grid usage: 4-column product grid with no gutters, 2-column editorial feature layout, 1-column mobile fallback. Density is spacious — large photographs dominate while text labels are small and secondary.

## Similar Brands

- **COS** — Same warm off-white canvas, flat photography-led layout, and single-weight minimal sans-serif typography with no decorative elements
- **The Row** — Shared editorial restraint — near-monochrome palette, oversized fashion photography, text-only navigation, and a near-absence of UI color
- **Toteme** — Identical approach to Scandinavian minimal fashion: warm neutrals, sharp 0px corners, single-weight typography, and photography as the primary brand surface
- **Jil Sander** — Same conceptual minimalism — white-paper canvas, hairline borders, negative letter-spacing on display type, and editorial grid layouts
- **Lemaire** — Parallel philosophy of stripped-back presentation: warm cream surfaces, ghost outlines instead of filled buttons, and typography that whispers rather than shouts
