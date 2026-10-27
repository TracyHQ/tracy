# Generative AI — Style Reference
> 8-bit playground on clean white paper. A white canvas interrupted by flat colored bands and scattered pixel-art creatures, held together by one bold geometric typeface and zero shadows.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

fal uses a playful generative-canvas language: clean white surfaces, one bold geometric sans (focal) at compressed tracking, dark filled buttons that sit flat against brightly-colored full-bleed section bands, and scattered 8-bit pixel art decorations in lime, violet, and pink that break the otherwise minimal developer-tool grid. Color is used sectionally — each band gets its own flat wash (sky-blue hero, lime highlight, violet CTA strip, pink testimonial accent) — so the page reads like a series of colored panels stitched together by white gutters. Components stay flat and sharp: 4px button radii, 12px card radii, hairline #e5e7eb borders, no shadows, no gradients, no rounded-pill controls. The pixel creatures are the only decorative noise on an otherwise quiet, text-forward canvas — they signal 'creative playground' without ever competing with the type.

## Colors

| Name | Value | Role |
|------|-------|------|
| Pixel Lime | `#f1ffd2` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Sky Cyan | `#99ecff` | Hero band background, full-bleed section washes, pixel-art fill — the signature page-anchoring color |
| Electric Violet | `#6120ee` | Inline links, underlined text accents, dark-band pixel highlights — the primary brand chromatic |
| Deep Ultraviolet | `#4a17b0` | Dark section backgrounds, card pixel-art fills, footer band — deeper companion to Electric Violet |
| Lavender Pixel | `#ab77ff` | Pixel-art creature fills, soft decorative blocks — lighter violet for the 8-bit illustrations |
| Lilac Wash | `#d0b7f9` | Soft card surfaces, pastel pixel fills, announcement-bar tint |
| Bubblegum Pink | `#ffddfa` | Testimonial-section accent blocks, pixel-art creature fill, soft card surfaces |
| Forest Pixel | `#004012` | Dark pixel-art detail strokes and creature outlines — the deep contrast pixel in illustrations |
| Cobalt Pixel | `#0a4dce` | Pixel-art creature accent details, decorative icon strokes |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on dark fills |
| Hairline Gray | `#e5e7eb` | Universal border, divider, card outline — the only structural border color (1960 occurrences) |
| Fog Surface | `#f4f4f5` | Card backgrounds, secondary surfaces, button hover grounds |
| Ink Black | `#000000` | Primary display headline color, maximum-contrast text |
| Graphite | `#1b1b1d` | Primary text, nav links, icon fills — the dominant readable text color |
| Carbon | `#252527` | Dark filled button background — the only button fill color, white text on top |
| Obsidian | `#121216` | Darkest surface for inverted sections, near-black backgrounds |
| Slate Body | `#383a42` | Body paragraph text, secondary copy |
| Ash | `#787882` | Muted helper text, captions, tertiary metadata |

## Typography

### focal — Primary brand typeface — used for all display, heading, and body text. A custom geometric sans with high x-height and compressed apertures. The aggressive negative tracking on display sizes (60-120px) creates a dense, architectural headline block; at 16-18px it stays open enough for body reading. Weight 700 carries the display work, 500-600 handles subheadings, 400 is body. The tight tracking is the signature: other geometric sans would feel loose at 80px; focal feels like solid colored bars of type.
- **Substitute:** Inter Tight, Satoshi, General Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10, 12, 14, 16, 18, 24, 30, 36, 40, 48, 60, 80, 120
- **Line height:** 0.83, 0.88, 0.90, 1.00, 1.11, 1.20, 1.33, 1.40, 1.43, 1.50, 1.56, 1.60
- **Letter spacing:** 0 to -0.04em — tightens as size increases: -0.04em at 120px, -0.025em at 60-80px, -0.02em at 30-48px, -0.01em at 16-24px, normal at 14px and below

### Chivo Mono — Monospace for code snippets, terminal output, and technical metadata. Appears inline within body copy and in developer-facing blocks. Clean, neutral mono — not a design statement, just legible code.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Geist Mono
- **Weights:** 400
- **Sizes:** 14
- **Line height:** 1.14, 1.43, 1.50
- **Letter spacing:** normal

### publicSansRounded — UI controls — buttons, tags, nav CTAs, small icon labels. The rounded terminals soften the otherwise sharp geometric system, making interactive elements feel approachable without going pill-shaped. Only ever used at 14-16px (buttons) and 24px (large display buttons). The "ss01" feature setting activates the rounded alternates.
- **Substitute:** Public Sans, Nunito, DM Sans
- **Weights:** 400, 600, 700
- **Sizes:** 14, 16, 24
- **Line height:** 1.00, 1.43, 1.50
- **Letter spacing:** -0.02em, -0.01em
- **OpenType features:** `"ss01" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 18px | 1.56 | -0.18px |
| heading-sm | — | — | 24px | 1.4 | -0.24px |
| heading | — | — | 30px | 1.4 | -0.6px |
| heading-lg | — | — | 48px | 1.11 | -0.96px |
| display | — | — | 60px | 1 | -1.5px |
| display-lg | — | — | 80px | 0.9 | -2px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 24-32px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 4px
- **cards:** 8-12px
- **images:** 4-8px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Dark Filled Button
**Role:** Primary interactive element — Get started, Login, any conversion action

Background #252527, text #ffffff, radius 4px, padding 12px 20px. Font: publicSansRounded weight 600 at 14-16px, letter-spacing -0.01em. No border, no shadow, no hover lift — on hover the background lightens to #383a42 or inverts to white with dark text. The flat, sharp-cornered geometry is non-negotiable; this button must feel like a printed label, not a floating chip.

### White Outlined Button
**Role:** Secondary action paired with the dark button — Contact Sales, Learn more

Background #ffffff, text #1b1b1d, border 1px solid #1b1b1d, radius 4px, padding 12px 20px. Font: publicSansRounded weight 600 at 14-16px. Inverts on hover (fills to #1b1b1d, text to #ffffff). Used in the hero directly next to the dark Get started button.

### Ghost Nav Button
**Role:** Top-right header actions — Contact Sales

No background, text #1b1b1d, font publicSansRounded weight 600 at 14px, no border, no radius. Minimal weight; only the login button carries the dark fill in the header.

### Top Navigation Bar
**Role:** Sticky site header

Background #ffffff, height ~64px, full-width with max-width 1200px content centered. Logo (fal mark) on the left, nav links (Explore, Documentation, Pricing, Enterprise, Resources) in focal 14px weight 500 #1b1b1d centered or left-aligned, Contact Sales ghost button + dark Login button on the right. Bottom border 1px #e5e7eb.

### Announcement Bar
**Role:** Site-wide top banner above the nav

Background #d0b7f9 (lavender wash), full-bleed, height ~36px, centered text in focal 14px weight 500 #1b1b1d. Single line of promotional text. Separated from the nav by a 1px #e5e7eb hairline.

### Hero Section
**Role:** First-screen brand statement

Full-bleed background #99ecff (sky cyan), padding 80-120px vertical. Headline 'Generative media platform for developers.' at focal 80px weight 700 #000000, letter-spacing -2.0px, line-height 0.9, constrained to ~50% page width on desktop. Subheadline in focal 16px weight 400 #1b1b1d, max-width ~480px. Two CTAs stacked horizontally: dark filled 'Get started' + white outlined 'Contact Sales'. Pixel-art creature decorations (lime green #f1ffd2 blocks, violet #ab77ff capsule shapes, yellow accent) scattered as background atmosphere on the left and right edges. The pixel art is positioned absolutely and overlaps the text — it is decorative noise, not contained illustration.

### Trust Logo Bar
**Role:** Social proof strip below the hero

Background #ffffff, padding 48-64px vertical. Horizontal row of 7 company logos (Adobe, Shopify, Canva, Quora, Perplexity, PlayAI, Genspark) rendered in #1b1b1d at consistent height ~24px, distributed evenly with flexbox justify-between. Below the logos, left-aligned caption in focal 14px weight 400 #383a42: 'Trusted by over 1,500,000 developers and leading companies.' Right-aligned same-size link 'Enterprise Scale →'.

### Model Gallery Card
**Role:** Showcase tile for a generative model in the gallery grid

Aspect ratio ~3:4 portrait. Full-bleed AI-generated image as background (not a thumbnail — the image fills the card edge-to-edge). Radius 12px. Bottom-aligned white text overlay: model name in focal 24-30px weight 600 #ffffff, sitting on a subtle dark gradient at the bottom 30% of the card for legibility. No visible card border; the radius and the image fill define the edge. Cards are arranged in a 4-column grid on desktop with 16px gap.

### Section Heading Block
**Role:** Text-led section opener (e.g. 'The world's largest generative media model gallery')

Two-column layout: left column holds the headline in focal 48-60px weight 700 #000000, letter-spacing -1.2px, line-height 1.0-1.11. Right column holds a description paragraph in focal 16-18px weight 400 #383a42, max-width ~440px, with inline links in #6120ee underlined. An 'Explore all models →' ghost link sits below the headline, focal 16px weight 500 #1b1b1d. Generous 64-80px vertical padding above and below.

### Testimonial Card
**Role:** Customer quote in the social-proof wall

Background #ffffff, border 1px solid #e5e7eb, radius 12px, padding 24-32px. Top: company logo (focal wordmark or icon) in #1b1b1d, ~24px tall. Body: quote text in focal 14-16px weight 400 #383a42, 4-6 lines. Bottom: author avatar (32px square, radius 4px) + name in focal 14px weight 600 #1b1b1d + title in focal 12px weight 400 #787882, arranged horizontally with 12px gap. Cards arranged in a 2x2 staggered grid, offset from the centered section headline.

### Dark CTA Band
**Role:** Full-bleed conversion strip near the page bottom

Background #4a17b0 (deep ultraviolet) or #121216, full-bleed, padding 80-120px vertical. Centered or left-aligned headline in focal 36-48px weight 700 #ffffff. Pixel-art decoration in pink #ffddfa and white overlaid as background texture. Dark filled button (white text variant) as the action.

### Pixel Art Decoration
**Role:** Signature 8-bit visual element scattered across hero, testimonials, and dark bands

Constructed from 8-16px square blocks in a single fill color (most commonly lime #f1ffd2, lavender #ab77ff, pink #ffddfa, or yellow #facc15) with dark green #004012 or cobalt #0a4dce outline details. Shapes suggest creatures, capsules, and abstract glyphs but never resolve into clear objects. Positioned absolutely, overlapping content edges, rotating slightly. They are the only imagery on the site outside of model cards — they carry the entire 'creative playground' mood.

## Do's and Don'ts

### Do
- Use focal at 60-80px weight 700 with letter-spacing -0.025em for hero and section headlines
- Use #99ecff as a full-bleed section background for accent bands — never as a small swatch or button fill
- Use #252527 for dark filled buttons with #ffffff text and 4px radius — no shadows, no hover lift
- Keep all borders at 1px #e5e7eb — this is the only structural border color in the system
- Anchor all spacing to the 8px grid: 8/16/24/32/48/64px for element, card, and section rhythm
- Use 12px radius for cards and 4px for buttons/tags — never larger, never pill-shaped
- Include scattered 8-bit pixel-art decorations in lime #f1ffd2, violet #ab77ff, and pink #ffddfa in hero and section bands

### Don't
- Don't use chromatic colors for CTA buttons — the primary action is always neutral dark #252527
- Don't add shadows or elevation — the design is intentionally flat, relying on hairline borders and color contrast for separation
- Don't use gradients on UI elements — section bands use flat color fills, model cards use real images
- Don't use system fonts or rounded sans-serifs for body text — focal is the signature, system fonts will look generic
- Don't break the 8px spacing grid or use odd values like 13px, 17px, 23px
- Don't use border-radius larger than 12px — the design is angular and sharp, not soft
- Don't use the pixel-art colors as functional UI colors (buttons, text, borders) — they are decorative only

## Elevation

No shadows anywhere in the system. Separation is achieved through hairline 1px #e5e7eb borders, flat color blocks, and the 8px spacing grid. Cards and sections sit on the same surface plane — depth is implied by color contrast (white card on cyan band) rather than z-axis offset. This is a deliberate choice: shadows would soften the architectural, label-like quality of the components.

## Surfaces

- **Paper White** (`#ffffff`) — Default page canvas, card surfaces, model gallery background
- **Fog Surface** (`#f4f4f5`) — Secondary cards, input fields, subtle elevated surfaces
- **Sky Cyan Band** (`#99ecff`) — Hero section full-bleed background, primary accent surface
- **Lavender Wash** (`#d0b7f9`) — Announcement bar, pastel section tints
- **Bubblegum Band** (`#ffddfa`) — Testimonial-section accent wash
- **Deep Ultraviolet** (`#4a17b0`) — Dark CTA strip, inverted section background

## Imagery

The site uses two distinct visual languages that never mix. First, 8-bit pixel-art decorations: square-block creatures and glyphs in lime #f1ffd2, lavender #ab77ff, pink #ffddfa, and yellow, with dark green #004012 outlines. They are scattered as background atmosphere in the hero, testimonial section, and dark CTA band — overlapping content edges, never contained in frames, always at the same 8-16px block resolution. Second, AI-generated model showcase photography: full-bleed, edge-to-edge images filling the Model Gallery cards (people, nature, abstract scenes, all cinematic). No lifestyle photography, no product shots, no team photos. The pixel art is the brand personality; the model images are the product proof. Both are used sparingly — most of the page is type and white space.

## Layout

Max-width 1200px centered content on a full-bleed white canvas. Hero is a full-viewport-height cyan (#99ecff) band with left-aligned headline occupying ~50% width and pixel art bleeding off all four edges. Sections alternate between white and colored full-bleed bands (white trust bar, white gallery, white testimonial wall, violet CTA strip) — each band is a flat color rectangle from edge to edge with the 1200px content centered inside. Content arrangement is consistently two-column for text blocks (headline left, description right at ~440px max-width) and grid-based for media (4-column model cards, 2x2 staggered testimonial cards). Vertical rhythm is 64-80px between major sections, 24-32px between content blocks within a section. Navigation is a flat top bar with no sticky behavior, no mega-menu, no sidebar.

## Similar Brands

- **Together AI** — Same flat full-bleed color bands, same developer-focused minimal chrome, same bold geometric headline type with compressed tracking
- **Replicate** — Same light canvas with one vivid accent color, same model-card image grid pattern, same hairline-border flat components
- **Runway** — Same creative-AI visual personality with bold type and full-bleed imagery, same confident dark-on-light button treatment
- **Vercel** — Same compressed-tracking geometric sans for headlines, same 4px-radius flat buttons, same hairline-border component language
- **Perplexity** — Same light theme with selective chromatic accents, same clean type-led layout rhythm, same trust-bar social proof pattern
