# Carrot — Style Reference
> Activist poster on a single sheet of acid-lime paper — confident, flat, and slightly loud.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Carrot commits to a radical single-color canvas — an electric chartreuse field that saturates the entire page and makes the brand impossible to misread. The rest of the system is deliberately stripped: black ink for type and structural elements, white for surfaces and button text, and a dark olive reserved for quiet secondary marks. Typography draws a sharp line between editorial and functional — a light-weight custom serif (Signifier at 300) carries the hero voice while DM Sans handles everything utilitarian at conversational weights. The result reads like a printed sustainability manifesto rendered as a web product: confident color, generous breathing room, zero ornament, and an almost rebellious refusal to use shadows, gradients, or rounded softness.

## Colors

| Name | Value | Role |
|------|-------|------|
| Citrus Field | `#d4e04a` | Full-page canvas and dominant brand surface — the chartreuse wash that defines the entire product. Used as hero background, section backgrounds, and feature card backgrounds with no variation or gradient |
| Carbon Black | `#000000` | Primary type, filled CTA buttons, icon strokes, borders, and graphic silhouettes (the bottle hero). The structural ink of the system |
| Paper White | `#ffffff` | Text on black buttons, product screenshot card backgrounds, and any inverted surfaces. Pure white — not off-white |
| Moss Shadow | `#535521` | Quiet secondary accent for subdued text or border moments where pure black would feel too heavy. Rarely used — the chartreuse does the color work |

## Typography

### Signifier — Display and large headings only — the editorial voice of the brand. The 300 weight is deliberately anti-convention: at 72px it whispers authority rather than shouts. The old-style numerals (onum) add a printed-magazine quality to any data that appears. Used exclusively for hero and section-headline moments.
- **Substitute:** Source Serif 4 (weight 300) or Cormorant Garamond (weight 300)
- **Weights:** 300
- **Sizes:** 50px, 72px
- **Line height:** 1.15
- **Letter spacing:** -0.01em (-0.72px at 72px, -0.50px at 50px)
- **OpenType features:** `"liga" on, "onum" on`

### DM Sans — Body copy, subheadings, UI labels, buttons, card titles, navigation. 400 for running text and 500 for emphasis (card titles, button labels). Tight line-height (1.25) at heading sizes and loose (1.40) at body sizes creates a clear rhythm shift between scan and read modes.
- **Substitute:** Inter or system-ui sans-serif
- **Weights:** 400, 500
- **Sizes:** 16px, 17px, 20px, 24px, 29px
- **Line height:** 1.25 (headings), 1.40 (body)
- **Letter spacing:** -0.01em (-0.16px at 16px, -0.29px at 29px)
- **OpenType features:** `"liga" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 16px | 1.4 | -0.16px |
| subheading | — | — | 20px | 1.4 | -0.2px |
| heading-sm | — | — | 24px | 1.25 | -0.24px |
| heading | — | — | 29px | 1.25 | -0.29px |
| display-sm | — | — | 50px | 1.15 | -0.5px |
| display | — | — | 72px | 1.15 | -0.72px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 120px
- **Card padding:** 24px
- **Element gap:** 32px

### Border Radius

- **cards:** 0px
- **images:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Primary Filled Button
**Role:** Main conversion action — Demo, Get in touch, Sign up

Solid black background (#000000), white text (#ffffff), DM Sans 500 at ~16px. Zero border-radius — completely sharp corners. Padding approximately 8px vertical, 14px horizontal. Tight, dense, utilitarian. Sits against the chartreuse field like a black stamp.

### Ghost Text Button
**Role:** Secondary actions or inline links

No background, black text, no border. Same DM Sans 500 weight and size as the primary button. The chartreuse shows through, so the button reads as text with a click target.

### Navigation Bar
**Role:** Top-level site navigation

Sits directly on the chartreuse with no separator. Brand wordmark (DM Sans 500) with a small carrot glyph on the left, text links in DM Sans 400, and two compact filled buttons (Demo, Log in) on the right. Height approximately 56-64px. No background fill — the chartreuse is the nav.

### Feature Card with Device Mockup
**Role:** Product capability explanations in the 3-column grid

White (#ffffff) background card with a product screenshot or device mockup at the top. Card padding ~24px, zero radius, no shadow. Title in DM Sans 500 at ~20px in black. Body copy in DM Sans 400 at 16px. The white surface against the chartreuse is the primary visual separator — no border needed.

### Hero Split Section
**Role:** Above-the-fold brand statement

Two-column layout: left side holds a Signifier 300 headline at 72px with negative tracking, right side holds a full-bleed product visual (the black bottle silhouette on dotted chartreuse). Below the headline, a short body paragraph in DM Sans 400 with a primary filled button. The dotted grid pattern behind the bottle is a subtle but signature texture.

### Section Headline Block
**Role:** Major section intros (e.g. 'Commercial Real Estate')

Signifier 300 at 50px, left-aligned, with generous 48px top margin separating it from the preceding section. No subheadline or eyebrow — the serif weight does all the structural work.

### Three-Column Feature Grid
**Role:** Product capability showcase

Three equal columns on the chartreuse field with 32px column gap. Each column stacks: white mockup card → title (DM Sans 500) → body (DM Sans 400). No card borders, no shadows — separation comes purely from the white-on-chartreuse contrast.

### Product Device Mockup
**Role:** Embedded product screenshots

Tablet, laptop, and phone frames containing actual app UI. Frames have a thin black or dark border, no shadow, zero radius. The device screens show the product in its native light theme (white UI with chartreuse accents), creating a meta-visual where the product echoes the marketing page.

### Dotted Grid Texture
**Role:** Background pattern behind hero visual

A uniform grid of small black dots on the chartreuse, creating a subtle technical/blueprint texture behind the bottle silhouette. Dot spacing approximately 24-32px. Not used everywhere — reserved for the hero area to add depth without breaking the flat aesthetic.

## Do's and Don'ts

### Do
- Use Citrus Field (#d4e04a) as the background for every section of every page — never break the field with a different canvas color.
- Set all border-radius to 0px across cards, buttons, inputs, and images. Sharp corners are the system.
- Reserve Signifier 300 for headlines at 50px and above. Never use it for body copy or UI labels.
- Use 120px vertical margins between major sections to let the chartreuse breathe.
- Default all action buttons to the black filled variant. Ghost buttons are only for secondary inline actions.
- Include "liga" and "onum" font features on Signifier headings — the old-style numerals are a signature detail.
- Keep type tracking at -0.01em (1%) across all sizes for consistent optical density.

### Don't
- Do not introduce shadows, gradients, or blur effects — the flat aesthetic is load-bearing.
- Do not use rounded corners on any element, even inputs or tags. The system is all sharp edges.
- Do not add a second brand color or a chromatic accent beyond the chartreuse, black, white, and olive.
- Do not set body copy in a serif — DM Sans handles everything below 50px.
- Do not place white cards on a white background or black buttons on a black background. The chartreuse must always be visible as a separator.
- Do not use weights above 500 in DM Sans or above 300 in Signifier — the type system is deliberately narrow.
- Do not darken or tint the chartreuse for hover states or section variants. The single color is the single color.

## Elevation

The system has zero shadows and zero rounded corners. Depth is created entirely through color contrast: the chartreuse field, white cards, and black forms stack visually without any softness. This is a deliberate flat-design conviction — elevation would dilute the poster-like impact of the single-color canvas.

## Surfaces

- **Citrus Canvas** (`#d4e04a`) — The entire page — no other base surface exists. Hero, sections, and gaps all share this single field.
- **White Card** (`#ffffff`) — Product screenshot cards and device mockup containers that need to lift off the chartreuse.
- **Black Inversion** (`#000000`) — CTA buttons and the hero bottle silhouette — solid black forms floating on the chartreuse.

## Imagery

The visual system is product-screenshot driven with a strong illustrative anchor. The hero features a large flat black silhouette of a bottle (the Carrot mascot/product metaphor) sitting on a dotted grid pattern — this is geometric, completely flat, and monochrome. Product showcases use realistic device mockups (tablet, laptop, phone) containing the actual app UI, which itself uses white surfaces and chartreuse accents that echo the marketing page. There is no lifestyle photography, no abstract gradients, no 3D renders. Photography, when it appears (like the Commercial Real Estate section), is real architectural imagery — modern glass buildings — treated at full saturation with no duotone or color grading. Icons are simple and appear to be thin-stroke or filled black glyphs at small sizes.

## Layout

The page operates on a max-width of approximately 1200px centered on the chartreuse field. The hero is a split layout: left column holds the serif headline + body + CTA (roughly 45% width), right column holds the product visual (roughly 55% width). Below the hero, the page flows into a 3-column equal-width feature grid with 32px gutters, then into single-column section intros with left-aligned Signifier headlines. Vertical rhythm is driven by 120px section gaps — the generous spacing is critical to letting the chartreuse breathe. Navigation is a simple top bar with no sticky behavior visible, no sidebar, and no mega-menu. The overall feel is editorial: wide margins, long line lengths for body, and unhurried vertical pacing.

## Similar Brands

- **Huel** — Same single-color full-bleed canvas approach with bold black type and zero ornament — a sustainability brand that commits to one loud background color as its entire visual identity.
- **Oatly** — Editorial sustainability voice using a light-weight serif for headlines paired with a clean sans for body, and a brand-defining flat background color used without apology.
- **Allbirds** — Minimalist sustainability brand with zero shadows, sharp corners, and a willingness to let a single color do the heavy lifting across the entire page.
- **Nothing (nothing.tech)** — Flat design conviction with hard edges, monochrome-on-color compositions, and product silhouettes as hero graphics — though Nothing is dark where Carrot is acid-bright.
- **World Economic Forum** — Editorial publishing layout with generous 120px section gaps, left-aligned serif headlines at light weights, and a calm three-column grid rhythm.
