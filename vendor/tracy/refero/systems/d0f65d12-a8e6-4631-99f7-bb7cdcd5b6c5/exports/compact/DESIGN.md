# Lightdash — Style Reference
> violet pixel-grid on drafting paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lightdash operates as a calm, developer-first command center: a near-white canvas populated by slate-gray typography, subtle hairline borders, and one saturated violet (#5e4cff) that powers every interactive moment. The brand voice is confident and quiet — headlines are set in a custom geometric sans (Britti Sans) at 48–76px with aggressively tight tracking (-0.025em), making them feel architectural rather than decorative. Body copy uses Inter at 14–18px with slightly negative letter-spacing, keeping dense information readable without feeling heavy. Surfaces layer gently from #ffffff canvas to #f6f8fa sections to 12px-rounded cards, and a pixel-art violet mosaic in the hero is the only ornamental gesture — a deliberate nod to the 'code-native' identity. Components are flat and borderless-by-default; elevation is borrowed from layered rgba shadows tinted with the brand's slate (#272835) rather than neutral gray, which keeps every card visually on-brand.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas White | `#ffffff` | Primary page background, card surfaces, input fills |
| Cloud Mist | `#f6f8fa` | Alternate section background, subtle surface tier below white |
| Frost Tint | `#eceff3` | Tertiary surface, muted background blocks |
| Ash Border | `#cdd2d9` | Hairline dividers, card borders, table separators |
| Mist Border | `#c1c7d0` | Secondary borders, disabled state outlines |
| Fog Text | `#a4abb8` | Helper text, link underlines in body copy, placeholder text |
| Steel Text | `#818898` | Muted metadata, timestamps, caption text |
| Slate Body | `#666d80` | Secondary body text, descriptions, supporting paragraphs |
| Graphite Heading | `#36394a` | Primary headings, strong body text, high-emphasis content |
| Midnight Ink | `#272835` | Dark surface fills, announcement bar, code terminal background, primary button background |
| Onyx | `#1a1b25` | Deepest text, high-contrast dark surfaces |
| Volt Violet | `#5e4cff` | Primary CTA fill, active link, brand accent — vivid violet against slate neutrals is the single chromatic punctuation of the entire system |
| Lavender Wash | `#c8ccf3` | Muted accent background, hero pixel-art mid-tones, tag chips |
| Lilac Whisper | `#dfdbff` | Tertiary accent surface, selected row tint, soft callout |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Britti Sans Trial Semibold — Display headlines and hero copy. The aggressive -0.025em tracking at 76px and condensed 0.95 line-height make text feel architectural and code-like. Substitute: Space Grotesk Bold or General Sans Semibold.
- **Substitute:** Space Grotesk Bold
- **Weights:** 600
- **Sizes:** 18px, 48px, 56px, 57px, 76px
- **Line height:** 0.95-1.00
- **Letter spacing:** -0.025em at 56-76px, -0.02em at 48px
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Britti Sans Medium — Section headings (H2/H3), nav items, emphasized UI labels. Carries brand personality into subhead levels. Substitute: Space Grotesk Medium.
- **Substitute:** Space Grotesk Medium
- **Weights:** 500
- **Sizes:** 14px, 16px, 18px, 20px, 24px, 32px
- **Line height:** 1.20-1.30
- **Letter spacing:** -0.02em at 24-32px, -0.01em at 18-20px, +0.01em at 14-16px

### Inter — Body copy, paragraphs, descriptions. The slight negative tracking (-0.01 to -0.02em) keeps even long-form text dense but readable. Substitute: Inter is already Google-hosted.
- **Substitute:** Inter (Google)
- **Weights:** 400, 500, 600
- **Sizes:** 9px, 12px, 13px, 14px, 15px, 16px, 17px, 18px, 24px
- **Line height:** 1.33-1.63
- **Letter spacing:** -0.0200em, -0.0150em, -0.0100em

### Inter Variable — UI controls, buttons, badges, form labels, nav links — the workhorse for interactive elements.
- **Substitute:** Inter (Google)
- **Weights:** 400, 500
- **Sizes:** 12px, 13px, 14px, 16px, 18px
- **Line height:** 1.43-1.70
- **Letter spacing:** -0.0100em

### IBM Plex Mono — Code snippets, terminal output, inline `<code>` elements. Signals the developer-first audience.
- **Substitute:** IBM Plex Mono (Google)
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.50
- **Letter spacing:** -0.0200em

### Britti Sans Trial Regular — Britti Sans Trial Regular — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 48px
- **Line height:** 1, 1.2
- **Letter spacing:** -0.02

### Micro 5 — Micro 5 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 31px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.14px |
| body-sm | — | — | 14px | 1.63 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 20px | 1.3 | -0.2px |
| heading-sm | — | — | 24px | 1.25 | -0.48px |
| heading | — | — | 32px | 1.2 | -0.64px |
| heading-lg | — | — | 48px | 1.05 | -1px |
| display | — | — | 76px | 0.95 | -1.9px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **nav:** 8px
- **cards:** 12px
- **badges:** 999px
- **inputs:** 8px
- **buttons:** 8px
- **special:** 80px

## Components

### Announcement Bar
**Role:** Top-of-page promo strip

Full-width #1a1b25 dark bar. 12px Inter Variable white text, centered, with inline link in #c8ccf3. Padding 8px vertical. No radius.

### Primary Navigation
**Role:** Sticky top-level nav with brand and auth

White background, 64px height, 8px radius dropdowns. Logo (lightning bolt glyph) in #5e4cff on the left, nav links in #36394a at 14px Inter Medium, Login as text link, 'Book a demo' as ghost button (1px #cdd2d9 border, 8px radius), 'Start for free' as filled #272835 button with white text and 8px radius.

### Ghost Button
**Role:** Secondary CTA (Book a demo, Try live demo)

White background, 1px #cdd2d9 border, 8px radius, 10px 16px padding, 14px Inter Medium #36394a text. Hover darkens border to #818898.

### Primary Filled Button
**Role:** Main action (Start for free, Sign up)

Filled #272835 background, white text, 8px radius, 10px 20px padding, 14px Inter Medium. Or the brand-violet variant: #5e4cff fill, white text, 8px radius, used for one hero CTA per page.

### Violet Accent Button
**Role:** Hero primary action

#5e4cff fill, white text, 8px radius, 12px 24px padding, 14-16px Inter Medium. The single saturated moment in an otherwise monochrome page — use sparingly, at most one per viewport.

### Tab Toggle
**Role:** Audience switcher (For developers / For business users)

Pill container, 999px radius, #f6f8fa inactive background, white active background with subtle shadow on the active tab. Text 14px Inter Medium, #666d80 inactive, #36394a active.

### Hero Section
**Role:** Above-fold headline and visual

White #ffffff canvas. Headline 56-76px Britti Sans Semibold #36394a with -0.025em tracking. Body 16-18px Inter Regular #666d80. Violet pixel-art mosaic decoration anchored to the right edge. CTAs stacked horizontally with 8-12px gap.

### Pixel-Art Hero Decoration
**Role:** Brand ornamental element

Scattered 4px-12px violet square tiles in a loose grid, anchored to the upper-right of the hero. Colors: #5e4cff (saturated), #c8ccf3 (muted), #dfdbff (pale), #ffffff (negative space). The only decorative flourish in the system.

### Product Preview Card
**Role:** Browser-frame screenshot of the product

White surface with 12px radius and the multi-layer shadow stack (see elevation). Contains a macOS-style window chrome at top, then product UI inside. Sits on #f6f8fa section background.

### Code Terminal Card
**Role:** Dark embedded code/terminal block

#1a1b25 background, 12px radius, 16px padding, IBM Plex Mono 12px text in #a4abb8 with syntax tokens in #5e4cff and #c8ccf3. Provides visual contrast against the white page.

### Logo Grid Section
**Role:** Customer/partner social proof

White background, 2-row x 6-column grid of customer logos, evenly spaced with 40px row gaps. Logos render monochrome in #36394a or original brand colors at 60% scale.

### Testimonial Block
**Role:** Quoted social proof

Centered 18-20px Inter Regular #36394a quote, 600px max-width, preceded by a small violet pixel-art icon (#5e4cff). Avatar row of 5 headshots below in 80px circles.

### Feature Card
**Role:** Feature highlight in 2 or 3 column grid

White surface, 12px radius, 16px padding, 1px #cdd2d9 border, no shadow by default. Heading 24px Britti Medium #36394a, body 14-16px Inter #666d80. Optional violet icon at top in #5e4cff.

### Input Field
**Role:** Text input / form control

White background, 1px #cdd2d9 border, 8px radius, 10px 12px padding, 14px Inter Regular #36394a text. Placeholder #a4abb8. Focus ring: 2px #5e4cff at 20% opacity.

### Badge / Tag
**Role:** Status or category label

Pill shape (999px radius), #f6f8fa or #dfdbff background, 12px Inter Medium text, 4px 10px padding, #36394a or #5e4cff text.

## Do's and Don'ts

### Do
- Use #5e4cff (Volt Violet) for exactly one primary CTA per viewport — never pair it with another accent color on the same screen.
- Set display headlines in Britti Sans Semibold at 48-76px with -0.025em letter-spacing; this aggressive tracking is the signature of the brand voice.
- Set body copy in Inter at 14-18px with -0.01 to -0.02em tracking, never in pure #000000 — use #36394a (Graphite Heading) for strong text and #666d80 (Slate Body) for descriptions.
- Use 12px radius for all cards and 8px radius for all buttons, inputs, and nav elements — these two values are the system's structural constants.
- Default cards to 1px #cdd2d9 border with no shadow; reserve the multi-layer shadow stack for hero product previews and elevated feature cards only.
- Use the pixel-art violet mosaic (#5e4cff, #c8ccf3, #dfdbff, #ffffff tiles) as the single decorative flourish — it is the brand's only ornament.
- Tint all shadows with #272835 rgba values, never neutral gray — this keeps elevation on-brand.

### Don't
- Don't introduce additional chromatic accent colors — the system runs on slate neutrals plus one violet.
- Don't use #000000 for body text; the brand reads as #36394a (Graphite) which is softer and more distinctive.
- Don't center body copy in feature sections — only hero headlines and testimonials are centered; everything else is left-aligned.
- Don't apply heavy drop shadows to standard cards; 1px borders are the default, shadows are earned by elevation tier.
- Don't set headlines at line-height > 1.10; the 0.95 line-height at 76px is a deliberate compression.
- Don't use the Inter font for display sizes above 32px — Britti Sans owns the display tier, Inter owns body and UI.
- Don't use rounded shapes above 16px radius for standard UI; 80px and 999px are reserved for special elements (tab toggles, full-width brand blocks).

## Elevation

- **Hero product preview:** `rgba(0,0,0,0.05) 0px 2px 5px 0px, rgba(0,0,0,0.04) 0px 9px 9px 0px, rgba(0,0,0,0.02) 0px 20px 12px 0px, rgba(0,0,0,0.01) 0px 35px 14px 0px, rgba(0,0,0,0.01) 0px 0px 0px 1px`
- **Branded card:** `rgba(39,40,53,0.1) 0px 0px 0px 1px`
- **Feature card (elevated):** `rgba(39,40,53,0.1) 0px 0px 0px 1px, rgba(39,40,53,0.08) 0px 24px 24px -12px, rgba(39,40,53,0.08) 0px 12px 12px -6px, rgba(39,40,53,0.08) 0px 6px 6px -3px, rgba(39,40,53,0.08) 0px 2px 2px -1px`
- **Soft card (no elevation):** `rgba(39,40,53,0.05) 0px 0px 0px 1px, rgba(39,40,53,0.01) 0px 50px 20px 0px, rgba(39,40,53,0.02) 0px 30px 18px 0px, rgba(39,40,53,0.04) 0px 13px 13px 0px, rgba(39,40,53,0.05) 0px 3px 7px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Default page background
- **Cloud Section** (`#f6f8fa`) — Alternating section bands, feature blocks
- **Frost Block** (`#eceff3`) — Inset content blocks, subtle callouts
- **Card Surface** (`#ffffff`) — Elevated cards on tinted sections, 12px radius, hairline border
- **Terminal** (`#1a1b25`) — Dark code/terminal surfaces embedded in light pages

## Imagery

Imagery is minimal and functional. The hero uses a custom pixel-art mosaic of violet squares (#5e4cff, #c8ccf3, #dfdbff) as the sole decorative element. Product screenshots appear inside browser-frame cards with macOS chrome, always set on white. Code/terminal screenshots use the dark #1a1b25 surface with IBM Plex Mono and violet syntax tokens. Customer logos are monochrome #36394a in a clean 2x6 grid. Avatars in testimonials render as 80px circular crops. There is no lifestyle photography, no full-bleed images, no abstract gradients — visuals are either product, code, logo, or the violet pixel motif.

## Layout

Layout is centered max-width 1200px with generous left/right padding. The hero is split-asymmetric: left two-thirds is headline + sub + CTAs, right one-third is the pixel-art mosaic. Below the hero, content alternates between white #ffffff and #f6f8fa bands at 40px section gaps. Feature sections use 2 or 3 column card grids with 12px radii. The product preview is a single full-width card with a browser-chrome frame. Customer logos sit in a centered 2x6 grid. Testimonials are centered at 600px max-width. Navigation is a single sticky 64px white bar with logo left, links center, auth right. Density is comfortable — pages breathe with whitespace rather than packing information tightly.

## Similar Brands

- **Linear** — Same single-accent restraint (Linear's purple vs. Lightdash's violet) and the same display-headline + tight-tracking combination on a near-white canvas.
- **Vercel** — Monochrome-first system with a single saturated accent, hairline-bordered cards, and developer-facing code/terminal blocks embedded in light pages.
- **Cal.com** — Open-source dev tool with a white canvas, slate-gray typography, and a violet accent used sparingly for primary actions only.
- **Cursor** — Code-first product landing pages that mix a clean white UI surface with dark terminal previews, set in a custom geometric sans at large display sizes.
