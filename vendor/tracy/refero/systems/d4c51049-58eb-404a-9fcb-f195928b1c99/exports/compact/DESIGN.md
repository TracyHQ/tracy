# Warp — Style Reference
> obsidian command center — a developer's IDE cockpit where the only glow is a single violet phosphor on matte black, and typography carries every signal

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Warp speaks in the language of a high-end terminal: an obsidian-black canvas where nearly every surface stays achromatic, typography does the heavy lifting, and a single whisper of violet (#cbb0f7) functions as quiet functional punctuation rather than decoration. The system is built for compact density — tight tracking, small body sizes, and narrow gaps create an IDE-like confidence that respects the reader's time and screen real estate. Custom Matter typeface with extreme negative tracking at display sizes (up to -0.04em at 56px) creates headlines that feel engineered rather than designed, while a warm off-white (#faf9f6) instead of pure white text keeps the dark surface from feeling clinical. The button language is defined by pill shapes (33-50px radius) on neutral fills — there is no chromatic CTA, so action hierarchy emerges from filled vs ghost contrast alone. Surfaces rise through subtle gray steps (#121212 → #1e1e1d → #333333) rather than dramatic shadows, giving the impression of flat panels stacking in negative space.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary page canvas, nav background, terminal preview windows — the void that every other surface floats on |
| Graphite | `#121212` | Secondary page surface, body backgrounds behind hero sections, footer base |
| Onyx | `#1e1e1d` | Elevated card and panel surfaces — first step up from the canvas for product cards and testimonials |
| Carbon | `#333333` | Mid-level surface for nested UI, secondary buttons, and tag/badge backgrounds |
| Slate Deep | `#40403f` | Highest neutral surface — hover states, elevated modals, and pill chip backgrounds |
| Bone | `#faf9f6` | Primary text and headline color — warm off-white avoids the clinical feel of pure white on black |
| Paper | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Ash Light | `#e3e2e0` | Secondary heading text, soft dividers, subtle borders on elevated cards |
| Ash Mid | `#b4b4b2` | Body copy, secondary text, button text on dark fills, muted descriptions |
| Ash | `#868684` | Tertiary text, captions, nav links at rest, metadata, timestamps |
| Ash Mute | `#a0a0a0` | Sub-heading emphasis, medium-muted text where Ash feels too dim |
| Iron | `#666469` | Lowest-priority text, disabled labels, nav metadata |
| Ink | `#080808` | Near-black for fine borders, deep text on light fills, separator strokes |
| Phosphor Violet | `#cbb0f7` | The only chromatic color in the system — decorative icon strokes, code accents, product mark highlights, and subtle borders. Never used for filled CTAs; it is a whisper, not a shout |

## Typography

### Matter Regular — Matter Regular — detected in extracted data but not described by AI
- **Weights:** 400, 600, 700
- **Sizes:** 10px, 12px, 13px, 14px, 16px, 18px, 20px, 24px, 32px, 40px, 42px, 56px
- **Line height:** 0.96, 1, 1.1, 1.15, 1.19, 1.2, 1.25, 1.33, 1.35, 1.38, 1.4
- **Letter spacing:** -0.04, -0.027, -0.02, -0.012, -0.011, -0.01, 0.01, 0.02, 0.1, 0.2

### Matter — Primary display and UI typeface — a custom geometric sans with engineered proportions. Weight 400 carries body and nav, 600–700 escalates to subheadings and emphasis. Extreme negative tracking at large sizes (-0.04em at 56px) tightens headlines into a single visual mass. Free substitute: Inter or General Sans
- **Substitute:** Inter
- **Weights:** 400, 600, 700
- **Sizes:** 10, 12, 13, 14, 16, 18, 20, 24, 32, 40, 42, 56
- **Line height:** 0.96–1.40 depending on size
- **Letter spacing:** Display: -2.24px at 56px (-0.04em), -1.13px at 42px (-0.027em), -0.8px at 40px (-0.02em). Headings: -0.29px at 24px (-0.012em), -0.22px at 20px (-0.011em). Body: -0.18px at 18px (-0.01em), tightens to near-zero at 14-16px. Labels: 0.2px at 10px (+0.02em) and 1px at 10px (+0.1em) for eyebrow/uppercase tags

### Geist Mono — Monospace for code snippets, terminal output, and technical micro-copy inside buttons and tags. Free substitute: JetBrains Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.00

### Matter Mono — Companion monospace for inline code and signature terminal callouts — ties back to the primary type family visually. Free substitute: Berkeley Mono or IBM Plex Mono
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.00
- **Letter spacing:** -0.0120em

### Inter — Secondary body fallback for long-form content blocks, testimonial quotes, and support copy where Matter may not load. Tight tracking (-0.012 to -0.014em) matches Matter's geometric feel
- **Weights:** 400, 500
- **Sizes:** 14, 16
- **Line height:** 1.00–1.38
- **Letter spacing:** -0.0140em, -0.0120em

### system-ui sans-serif — Ultra-small UI labels (icon captions, footer micro-text) where system rendering is acceptable and loading a web font is wasteful
- **Weights:** 400
- **Sizes:** 12
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 10px | 1.2 | 2px |
| caption | — | — | 12px | 1.2 | 0.12px |
| body | — | — | 14px | 1.25 | -0.14px |
| body-lg | — | — | 16px | 1.33 | -0.18px |
| subheading | — | — | 18px | 1.2 | -0.18px |
| heading-sm | — | — | 20px | 1.2 | -0.22px |
| heading | — | — | 24px | 1.19 | -0.29px |
| heading-lg | — | — | 32px | 1.15 | -0.64px |
| display | — | — | 42px | 1 | -1.13px |
| display-lg | — | — | 56px | 0.96 | -2.24px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **tags:** 50px
- **cards:** 20px
- **icons:** 4px
- **links:** 7px
- **inputs:** 7px
- **buttons:** 33px

## Components

### Top Navigation Bar
**Role:** Global site header

Obsidian (#000000) background, 60-72px tall, flex row. Left: Warp wordmark logo (12px tall, white). Center: nav links (Matter 400, 14px, #868684) with 24px gaps. Right: ghost 'Contact sales' link and a filled white pill 'Download for Mac' button. No border-bottom, no shadow — the bar floats on the void.

### Announcement Banner
**Role:** Top-of-page promotional strip

Full-width, 36-40px tall, centered text 'Introducing Oz: the orchestration platform for cloud agents.' in Matter 400 at 12px, color #b4b4b2, with an inline 'Learn more.' link in Phosphor Violet (#cbb0f7) underlined. Background is pure obsidian with a 1px bottom border in #1e1e1d.

### Filled Pill Button (Primary)
**Role:** Primary action — download, sign up

Background #ffffff, text #080808, Matter 600 at 14px, 33px border-radius (near-full pill), horizontal padding 20px 22px, no border. Hover: background #e3e2e0, transition 150ms ease. Vertically centered with a subtle 1px inner highlight to keep the edge crisp on the dark canvas.

### Ghost Button (Secondary)
**Role:** Secondary action — learn more, contact sales

Background transparent, 1px border in #333333, text #b4b4b2, Matter 400 at 14px, 33px border-radius, padding 9px 20px. Hover: border #b4b4b2, text #faf9f6. Used for every non-primary action on dark surfaces.

### Text Link Button
**Role:** Tertiary inline action

No background, no border, text in Matter 400 at 14px, color #868684, 4px radius on the underline. Hover shifts color to #faf9f6 and reveals a 1px underline. Sits inline with descriptive product copy.

### Product Showcase Card
**Role:** Side-by-side product preview (Warp Terminal / Oz)

Rounded rectangle at 20px radius, 1px border in #1e1e1d, background #000000 with a subtle internal gradient overlay (0% to 8% violet tint top-left). Padding 0px — the product screenshot fills the entire card. Caption block above the card: icon (16px, white), bold product name (Matter 700, 18px, #faf9f6), description (Matter 400, 14px, #868684), and a Learn More + secondary button row.

### Testimonial Card
**Role:** Customer quote with branded banner

Vertical stack: top is a 200-240px branded banner image (company logo on the brand's signature color/gradient, e.g. Microsoft dark gray, IBM blue, OpenAI pink-violet). Below the image, a black panel with 24px padding contains attribution (Matter 600, 13px, #b4b4b2) and a pull quote (Matter 400, 16px, #faf9f6, line-height 1.38, letter-spacing -0.01em). The card itself has 7px radius and a 1px #1e1e1d border.

### Trusted-By Logo Grid
**Role:** Social proof — enterprise customer logos

Responsive grid of company logos, 6 columns on desktop. Each cell is 120-160px wide with the logo rendered in monochrome white (#faf9f6) at 40-50% opacity to feel quiet. Cell height 80px, gap 40px horizontal / 32px vertical. No borders, no backgrounds — logos float directly on obsidian.

### Featured Partner Card
**Role:** Highlighted case-study or livestream link

Rounded card at 20px radius, dark surface #121212 with a 1px #1e1e1d border. Contains a white partner logo (Matter 700, 32px), a small pill-shaped category tag below (e.g. 'Livestream', 'Case Study') with 50px radius, transparent background, 1px #333333 border, Matter 400 at 10px, letter-spacing 0.1em, uppercase, #b4b4b2.

### Section Heading (Centered)
**Role:** Mid-page section title

Centered horizontally, Matter 400 (not bold — the system trusts the size to carry hierarchy), 32-42px, color #faf9f6, letter-spacing -0.02em to -0.027em, line-height 1.10-1.15. No eyebrow text above unless introducing a new product. Generous top margin (80px) to create breathing room between sections.

### Pill Tag / Category Chip
**Role:** Metadata badge for content categorization

Background transparent, 1px border #333333, text in Matter 400 at 10px, uppercase, letter-spacing 0.1em, color #b4b4b2. Radius 50px (full pill). Horizontal padding 10px 12px, vertical padding 4px. Used for case study categories, feature tags, and filter pills.

### Terminal Preview Window
**Role:** Code/terminal screenshot embed

Full-bleed inside product cards. Black background, monospace text (Geist Mono 16px). Renders a faux terminal with a title bar (3 traffic-light dots top-left in #333333, filename in #868684), and command lines with Phosphor Violet (#cbb0f7) used sparingly for path/command highlights. Output text in #b4b4b2.

### Icon Glyph (Product Mark)
**Role:** Small brand icon beside product names

16-20px square, 4px radius, white or Phosphor Violet stroke/fill. Warp Terminal uses a 2x2 grid glyph; Oz uses a cube/box mark. Always paired with a bold product label in 18px Matter 700.

### Footer Base
**Role:** Site footer

Obsidian (#000000) background, 64px top padding, 40px bottom padding. Contains secondary nav links in Matter 400, 12px, #666469, arranged in 4-5 columns. Bottom row: copyright text at 11px, #666469, with social icons (white at 60% opacity) right-aligned.

## Do's and Don'ts

### Do
- Use #faf9f6 (Bone) for all primary text on dark surfaces — never #ffffff, the warm tone prevents clinical harshness
- Apply negative letter-spacing aggressively at display sizes: -2.24px at 56px, -1.13px at 42px, -0.29px at 24px
- Use 33px radius for all action buttons and 50px for category tags — pill shapes are the system's button signature
- Reach for Matter 400 (not 700) for headlines up to 42px; trust the size and tracking to carry hierarchy
- Layer surfaces using #121212 → #1e1e1d → #333333 → #40403f — never use drop shadows for elevation
- Reserve #cbb0f7 (Phosphor Violet) exclusively for icon strokes, code highlights, and link accents — never for filled buttons or large background washes
- Keep gaps compact: 10px for inline elements, 8-12px for component padding, 64px for section separation

### Don't
- Don't introduce a second chromatic accent — the 0% colorfulness is the system, not an oversight
- Don't use drop shadows or blur effects to separate cards; the system uses flat 1px borders and surface stepping instead
- Don't use bold (700) weights for body copy or UI labels — Matter 400 and 600 are the only weights in the interface
- Don't use pure white (#ffffff) as a text color on dark surfaces — the warm #faf9f6 is the intentional choice
- Don't use 9999px radius for buttons — the system uses an honest 33px (slightly less than full pill) on filled actions
- Don't add gradients to backgrounds, buttons, or cards — the surface treatment is strictly flat
- Don't use any font other than Matter for headlines and UI; Inter is a fallback only, never a stylistic choice

## Elevation

The system deliberately avoids drop shadows. Elevation is expressed entirely through flat surface stepping: a card on the page canvas is one or two hex steps lighter than its parent, separated by a 1px hairline border in #1e1e1d. This keeps the interface feeling like a high-end IDE — flat, fast, terminal-native — where shadows would feel out of place against the obsidian backdrop.

## Surfaces

- **Obsidian** (`#000000`) — Page canvas, nav background, terminal preview windows, full-bleed sections
- **Graphite** (`#121212`) — Section backgrounds, body panels, footer base — first lift from the void
- **Onyx** (`#1e1e1d`) — Card and panel surfaces — product cards, testimonial containers, content blocks
- **Carbon** (`#333333`) — Nested UI — secondary buttons, input borders, tag outlines, code text contrast
- **Slate Deep** (`#40403f`) — Highest neutral elevation — hover states, modal overlays, elevated popovers

## Imagery

Product photography and UI screenshots dominate over lifestyle imagery. The hero features two side-by-side product preview cards showing actual terminal output and a data table — the product IS the hero. Customer testimonial cards use full-bleed branded banner images (IBM blue, Microsoft dark gray, OpenAI pink-violet gradient) as visual anchors, with the quote text in a separate dark panel below. No stock photography, no illustrations, no 3D renders. Logo grid is monochrome white at reduced opacity. Icon style is geometric, minimal, and monochrome white with optional Phosphor Violet accent.

## Layout

Full-bleed dark canvas with content constrained to a 1200px max-width centered column. Hero pattern: centered headline (56px) over two side-by-side product preview cards with an icon + label + description + dual-button caption block above each. Below the hero: a single-row logo grid (6 columns) of trusted partners, then a 3-column testimonial grid, then alternating full-width sections. Navigation is a top bar only — no sidebar, no sticky mega-menu. Section rhythm is consistent: 64px vertical gap between major sections, flat borders instead of dividers, seamless flow on the obsidian canvas. Card grids are 2- and 3-column; content blocks are single-column with generous horizontal margins.

## Similar Brands

- **Linear** — Same dark-mode IDE aesthetic, monochrome palette with a single purple/violet accent, pill-shaped buttons, and tight geometric sans-serif typography
- **Vercel** — Near-identical obsidian canvas, warm off-white text, compact spacing, and the same philosophy of letting typography do the work with minimal chromatic decoration
- **Raycast** — Developer-tool dark UI with flat surfaces, hairline borders instead of shadows, and pill-shaped action buttons on neutral fills
- **Arc Browser** — Dark-canvas product showcase with large centered headlines, tight tracking, and a restrained single-accent color philosophy
