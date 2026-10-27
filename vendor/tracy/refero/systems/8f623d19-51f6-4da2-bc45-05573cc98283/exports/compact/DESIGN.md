# Runway — Style Reference
> monochrome research studio — a printer's tray of cinematic stills on cold white paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Runway operates as a precision research lab on white canvas — almost entirely monochrome, with a single deep cobalt accent reserved for promotional banners and the occasional highlight. Typography does the heavy lifting: a neo-grotesque sans with tightly tracked headlines carries editorial weight, reading as research statements rather than marketing copy. Components are deliberately minimal — ghost buttons, hairline dividers, image cards that sit flat against the page, no decorative elevation. The page breathes like a long-form magazine spread where AI-generated research output is the visual content itself. Every interface decision is in service of letting the work speak: no gradients, no shadows, no ornament.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#0c0c0c` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Carbon | `#1a1a1a` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Graphite | `#2a2a2a` | Secondary dark surface, button hover states |
| Slate | `#404040` | Body text, secondary headings, dense paragraph copy |
| Steel | `#6b7280` | Muted helper text, tertiary metadata, subdued links |
| Silver | `#999999` | Disabled states, placeholder text, low-priority captions |
| Bone | `#e5e7eb` | Hairline borders, divider lines, card outlines, structural separators |
| Cloud | `#eef1f5` | Subtle background wash, hover state for neutral surfaces |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text on dark fills |
| Cobalt Signal | `#2b22fa` | Promotional announcement bar, brand accent — the only chromatic moment in the system, used sparingly to signal news or offers without competing with the research content |

## Typography

### abcNormal — Sole typeface across the entire interface — navigation, body, buttons, and display headlines. Weight 450 (a half-step) and 500 carry most UI text; 600 is reserved for emphasis. The tight tracking on large sizes (-0.025em at 48px) prevents headlines from feeling airy, keeping them grounded as editorial statements rather than marketing shouts. The positive tracking at 11px (+0.025em) compensates for small-size readability. Weight 400 for body keeps long research paragraphs light on the eye.
- **Substitute:** Söhne
- **Weights:** 400, 450, 500, 600
- **Sizes:** 11, 13, 14, 16, 20, 24, 36, 40, 48
- **Line height:** 1.00–1.50
- **Letter spacing:** -1.2px at 48px (display), -0.96px at 40px, -0.60px at 36px, -0.12px at 20px, -0.10px at 16px, -0.07px at 14px, +0.28px at 11px (caption)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.43 | 0.28px |
| body-lg | — | — | 16px | 1.5 | -0.1px |
| subheading | — | — | 20px | 1.3 | -0.12px |
| heading-sm | — | — | 24px | 1.25 | -0.24px |
| heading | — | — | 36px | 1.1 | -0.6px |
| heading-lg | — | — | 40px | 1.1 | -0.96px |
| display | — | — | 48px | 1 | -1.2px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 16-24px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 4px
- **cards:** 0px
- **images:** 0px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Promotional Announcement Bar
**Role:** Top-of-page promotional strip

Full-bleed bar at the very top of the page. Background #2b22fa (Cobalt Signal), text #ffffff, centered, 11-13px weight 400-500, 0.025em positive tracking. Contains a short promotional message with an underlined link and a small ghost-style 'Try Now' button on the right.

### Primary Navigation Bar
**Role:** Site-wide top navigation

White background, 1px #e5e7eb bottom border. Logo (Runway wordmark, #0c0c0c) flush left. Center nav items in a horizontal row: RESEARCH, PRODUCT, RESOURCES, SOLUTIONS, COMPANY — 13px weight 500, #0c0c0c, uppercase. Right cluster: 'Enterprise Sales' and 'Log in' as ghost text links, then 'Try Runway' as a filled dark button (#0c0c0c bg, #ffffff text, 8px radius, ~10px 20px padding).

### Ghost Text Link
**Role:** Low-emphasis navigation or action

No background, no border. Text #0c0c0c, 13-14px weight 500. Used for 'Log in', 'Enterprise Sales', and inline links. Hover state: text color shifts to #404040 or underline appears.

### Primary Dark Button (Filled)
**Role:** Main call-to-action

Background #0c0c0c, text #ffffff, 8px border-radius, padding 10px 20px. Font: 14px weight 500. No border. Used for 'Try Runway' in the nav. Sits with high contrast against the white canvas; the only filled button style in the system.

### Ghost Button with Arrow
**Role:** Secondary action or section entry point

No background, no border. Text #0c0c0c, 14px weight 500. Followed by a chevron arrow (→). Padding 8px 0. Used for 'Get Started >' in the hero. The arrow gives directional momentum without requiring visual weight.

### Learn More Pill Button
**Role:** Research feature call-to-action

Background #0c0c0c or #1a1a1a, text #ffffff, 8px radius (approaching pill), padding 10px 18px. Font: 14px weight 500. Used to drive traffic from research feature blocks to detail pages. Rounded but not fully pill — sits between sharp and soft.

### Logo Trust Strip
**Role:** Social proof via partner/brand logos

Horizontal row of company logos (CBS, NVIDIA, Adobe, Allstate, GUT, Legendary, Lionsgate) in grayscale. Rendered in #404040 or #999999 to blend with the page. No logos in full color — the monochromatic treatment signals 'this is a system' not 'these are ads'. Vertically centered, equal spacing.

### Editorial Display Headline
**Role:** Section or page title

Font 48px weight 400-450, line-height 1.00, letter-spacing -0.025em. Color #0c0c0c. Left-aligned, max-width ~900px. Reads as a research statement, not a marketing slogan. The tight tracking and light weight are anti-convention — most sites would use 600-700 here.

### Research Image Card
**Role:** Showcase of a research project or product

Image at top (full-bleed within card, no radius — sharp corners), project title below in 20px weight 500 #0c0c0c, short description in 14px weight 400 #404040. No card border, no shadow. Arranged in a 2-column grid with ~24px gap. The image IS the visual treatment.

### Alternating Feature Row
**Role:** Research or product detail section

Two-column layout, alternating image-left/text-right and image-right/text-left. Image takes ~50% width, no radius. Text column: heading 36px weight 400, body 16px weight 400 #404040, then a 'Learn more' pill button. ~80-120px vertical padding between rows. The alternation creates reading rhythm.

### Image-Only Feature Block
**Role:** Full-width research visual

Single image spanning the content width, no border, no overlay. Sometimes followed by a text block, sometimes standalone. Used for hero product shots or keyframe stills from AI-generated video. The image is the message.

### Hairline Divider
**Role:** Section separator

1px solid #e5e7eb line, full content width. Used between major sections where white space alone isn't enough. No double lines, no dashes — always a single hairline.

### Inline Underlined Link
**Role:** Mid-emphasis link in body copy

Text inherits body color (#0c0c0c or #404040), 1px underline, no color change. Underline offset ~2px. Hover: underline thickens or color shifts to Cobalt Signal #2b22fa for the rare colored link.

## Do's and Don'ts

### Do
- Use the neo-grotesque sans at weight 400-450 for headlines — the light weight is the signature; never bold up to 600-700 for display copy
- Maintain the 8px radius for all buttons and the 4px radius for tags — keep corners subtly soft but never pill-shaped
- Reserve #2b22fa Cobalt Signal exclusively for the announcement bar and one or two promotional moments per page — it must remain scarce to carry weight
- Use 1px #e5e7eb hairlines or white space to separate sections — never reach for drop shadows or elevation
- Left-align all body copy and headlines; the design is editorial, not centered-marketing
- Set letter-spacing to -0.025em at 48px and scale linearly down — tight tracking is part of the typographic identity
- Keep the page at 1% colorfulness: monochrome first, accent only as punctuation

### Don't
- Do not introduce drop shadows, glow effects, or any elevation system — the flat print-like surface is the look
- Do not add gradients — the design is purely flat color
- Do not use the Cobalt Signal blue for buttons, links, or icons outside the announcement bar — it will lose its scarcity
- Do not center body text or long-form copy — left-alignment is structural, not stylistic
- Do not add secondary accent colors (green, purple, red) — there is no room in a 1% colorfulness system for a second chromatic voice
- Do not use rounded corners larger than 8px on buttons or 12px on any container — the sharp/minimal geometry defines the feel
- Do not increase body weight above 500 — the interface is calibrated for airy 400-450 text; heavier weights break the editorial register

## Elevation

The design deliberately avoids shadows. Cards and content blocks are separated from the page by hairlines (1px #e5e7eb borders) or by white space alone, never by drop shadows or elevation. This flat, print-like treatment keeps the page reading as editorial rather than app-like, and ensures that the AI-generated imagery and research content remain the only sources of visual depth.

## Surfaces

- **Page Canvas** (`#ffffff`) — Base background for the entire site
- **Card Surface** (`#ffffff`) — Research project cards, feature blocks — sit flat against the page, distinguished by content not elevation
- **Soft Wash** (`#eef1f5`) — Subtle section backgrounds, hover states for neutral elements
- **Announcement Bar** (`#2b22fa`) — Promotional banner — the only chromatic surface, signals news/offers above the fold

## Imagery

Imagery is the centerpiece of every page: the AI-generated video stills and research keyframes ARE the visual content. Images are full-bleed within their containers, sharp-cornered (no border-radius), high-resolution, and often cinematic in framing — wide aspect ratios, dramatic lighting, surreal or hyperreal subject matter. The product page leads with a video or still frame; research pages alternate text blocks with generated imagery. No stock photography, no lifestyle shots, no decorative illustrations — the visual language is 'our AI made this, look at it.' Photography treatment is unfiltered: true colors, full saturation, no duotone or color grading overlay. The only branded visual treatment is the monochromatic logo strip, which uses grayscale to signal partner ecosystem without competing with the product imagery.

## Layout

Max-width 1200px centered content column with full-bleed bands for the announcement bar and hero media. The hero is a near-empty white canvas with a single 'Get Started >' ghost link — deliberate restraint before the logo strip. Below the trust strip, a large editorial headline (left-aligned, ~900px) introduces a 2-column image card grid showcasing research projects. Deeper sections use alternating left-right image+text rows at 50/50 split, with ~80-120px vertical rhythm between rows. No sticky sidebar, no mega-menu — navigation is a simple centered top bar. Density is compact but the overall page is long-form editorial: you scroll through research stories like a magazine. Section transitions are marked by 1px hairlines or simply by white space, never by contrasting background bands.

## Similar Brands

- **Stability AI** — Same monochrome research-publication aesthetic — white canvas, single bold headline, image-led research showcase, no decorative elevation or gradients
- **Midjourney** — Editorial AI research presentation with full-bleed AI-generated imagery as primary content, minimal UI chrome, neo-grotesque typography with tight tracking
- **Anthropic** — Restrained monochromatic interface with editorial weight — large left-aligned headlines, ghost navigation, research-forward content blocks alternating with imagery
- **Figma Config** — Large-scale editorial layout language — generous section gaps, alternating image+text rows, single brand accent reserved for announcements, flat surfaces without shadows
