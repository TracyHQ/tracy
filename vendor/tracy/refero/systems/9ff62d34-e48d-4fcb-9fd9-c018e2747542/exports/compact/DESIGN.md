# Lovable — Style Reference
> Warm parchment canvas behind a single prismatic horizon

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lovable wraps an AI builder tool in a warm parchment world where the only spectacle is a single gradient horizon in the hero — everywhere else, the interface retreats into cream surfaces, near-black text, and one custom variable-weight sans-serif. The palette is almost entirely achromatic: warm off-whites and charcoal, with color appearing only as the hero's ambient rainbow gradient and never in UI controls. Components are pill-shaped or softly rounded, borders are warm beige rather than cool gray, and shadows are barely-there inset strokes rather than drop shadows. The overall rhythm is compact vertically but generously padded horizontally, creating a feeling of quiet space inside small containers.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#fcfbf8` | Page canvas, primary background, card surfaces when on darker parents |
| Warm Sand | `#f7f4ed` | Card backgrounds, elevated surface panels, secondary containers |
| Linen Border | `#eceae4` | All borders — nav dividers, card outlines, input strokes, section separators. Warm beige rather than cool gray gives the entire UI its distinctive non-tech softness |
| Stone | `#d4d3d0` | Subtle box-shadow tints, disabled borders, secondary dividers |
| Dim Gray | `#5f5f5d` | Secondary text, placeholder text, muted nav labels, subheadings |
| Charcoal | `#1c1c1c` | Primary text, nav labels, icon fills, inverse button background. Near-black rather than pure black keeps the warm tone consistent |
| Ink | `#030303` | Highest-emphasis text (hero headline, button labels in chat input), icon fills |
| Hero Gradient | `linear-gradient(90deg, rgb(28, 28, 28) 0%, rgb(28, 28, 28) 33.33%, rgb(130, 188, 255) 40%, rgb(36, 131, 255) 45%, rgb(255, 102, 244) 50%, rgb(255, 48, 41) 55%, rgb(254, 123, 2) 60%, rgba(0, 0, 0, 0) 66.67%, rgba(0, 0, 0, 0) 100%)` | Full-width hero background gradient — decorative brand moment, never used on individual UI elements |
| Indigo Accent | `#3451b2` | Reserved accent from CSS tokens (--bg-accent). Inline text links, focus rings, accent highlights when needed |

## Typography

### Camera Plain Variable — The only typeface on the entire site. A custom variable-weight sans-serif that carries both body text and display headlines. The 480 weight is unusual — heavier than normal but not semi-bold, giving headlines a confident but non-aggressive stance. Ligatures are explicitly disabled ("liga" 0), keeping the letterforms mechanical and preventing decorative swashes.
- **Substitute:** Inter Variable or DM Sans
- **Weights:** 400, 480, 600
- **Sizes:** 14px, 15px, 16px, 18px, 20px, 36px, 48px, 60px
- **Line height:** 1.00–1.60 (tighter at large sizes, looser at body)
- **Letter spacing:** -0.025em at all sizes, producing noticeably tight tracking even at body scale — approximately -0.4px at 16px and -1.5px at 60px
- **OpenType features:** `"liga" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | -0.35px |
| body | — | — | 16px | 1.5 | -0.4px |
| subheading | — | — | 18px | 1.38 | -0.45px |
| heading-sm | — | — | 20px | 1.25 | -0.5px |
| heading | — | — | 36px | 1.1 | -0.9px |
| heading-lg | — | — | 48px | 1.1 | -1.2px |
| display | — | — | 60px | 1 | -1.5px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 64-80px
- **Card padding:** 20-24px
- **Element gap:** 6-8px

### Border Radius

- **cards:** 16-24px
- **badges:** 9999px
- **images:** 12px
- **inputs:** 8px
- **buttons:** 9999px
- **containers:** 16px

## Components

### Ghost Nav Button
**Role:** Top navigation items

Transparent background, #1c1c1c text at 15px weight 400, no border, 0px border-radius, padding 4px 0px 4px 6px. On hover, text color shifts subtly. No background change. These are nearly invisible as buttons — they read as plain text links.

### Outlined Pill Button
**Role:** Secondary actions like 'Log in'

Transparent background, #1c1c1c text, 1px solid #eceae4 border, border-radius 9999px (full pill), padding 6px 10px. The warm beige border makes it feel softer than a typical outlined button.

### Dark Pill Button
**Role:** Primary action ('Get started')

Background rgba(0,0,0,0.88) (#1c1c1c at 88% opacity), text #fcfbf8, border-radius 9999px. Padding 6px 10px minimum, scales with content. The slight transparency prevents the button from feeling like a harsh black block against the warm canvas.

### Frosted Pill Button
**Role:** Overlay actions on the hero gradient

Background rgba(255,255,255,0.8), text #1c1c1c, border-radius 9999px, no visible border. The translucency lets the hero gradient bleed through, tying the button to its context.

### Chat Input Card
**Role:** Hero prompt area where users type their app idea

Background #f7f4ed, border-radius 24px, padding 24px 20px. Contains placeholder text at 16px weight 400 in #5f5f5d, a '+' icon, and a 'Build' dropdown with a circular send button. The send button is a small circle (approx 28px) with a gradient fill matching the hero. Inner shadow: oklch(0 0 0 / 0.25) 0px 0px 0px 0.5px inset. Elevated shadow: oklab(0 0 0 / 0.08) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 20px 25px -5px, rgba(0,0,0,0.1) 0px 8px 10px -6px.

### Template Preview Card
**Role:** Template gallery items in the 'Discover templates' grid

Transparent background (sits on page canvas), no border, no shadow, 0px padding on outer wrapper. Contains a screenshot image with 12px border-radius, followed by a title at 16px weight 480 in #1c1c1c and a description at 14px weight 400 in #5f5f5d. Spacing between image and text is 8px.

### Warm Surface Card
**Role:** Feature explanation panels, content containers

Background #f7f4ed, border-radius 24px, padding 24px 20px, no shadow, no border. Used for the chat prompt mockup and feature illustrations. Content inside maintains 6-8px element gaps.

### Logo Bar
**Role:** Social proof strip showing company logos

Full-width strip on #fcfbf8 background. Logos rendered in monochrome #1c1c1c, evenly spaced in a horizontal row. Preceded by a muted label at 14px weight 400 in #5f5f5d.

### Section Heading
**Role:** Major content section titles like 'Meet Lovable', 'Discover templates'

Text at 48px weight 480, color #1c1c1c, line-height 1.1, letter-spacing -1.2px. Left-aligned, no decoration. Followed by a subtitle or description at 16-18px weight 400 in #5f5f5d with 8px gap.

### Feature Step
**Role:** Numbered feature explanations ('Start with an idea', 'Watch it come to life')

Stacked text-only layout. Heading at 36px weight 480 #1c1c1c, body at 16px weight 400 #5f5f5d. Steps are stacked vertically with ~32px gap between them. No icons, no numbers, no decorative elements — relies entirely on typography weight contrast.

### View All Link
**Role:** Secondary navigation to full listings

Text link at 15px weight 400, color #030303, with an outlined pill border: 1px solid #eceae4, border-radius 9999px, padding 6px 10px. Functions as a soft secondary action.

### Sticky Navigation Bar
**Role:** Top-of-page persistent navigation

Full-width, height ~48px, background transparent or rgba(255,255,255,0.8) with backdrop-filter blur(4px) when scrolled. Contains logo on left, nav links center, 'Log in' (outlined pill) and 'Get started' (dark pill) on right. Bottom border: 1px solid #eceae4.

## Do's and Don'ts

### Do
- Use 9999px border-radius for all buttons, badges, and pill-shaped controls — the full-pill shape is the signature interactive affordance
- Keep the palette almost entirely achromatic; reserve chromatic color exclusively for the hero gradient and semantic states — never for buttons, links, or UI accents
- Apply -0.025em letter-spacing globally across all text sizes; this tight tracking is a defining characteristic of the type system
- Use #f7f4ed (Warm Sand) for card surfaces and #fcfbf8 (Parchment) for the page canvas — the two warm whites create the surface hierarchy
- Use weight 480 for headings and weight 400 for body text — this subtle weight contrast (not bold vs regular) defines the typographic hierarchy
- Set 'liga' 0 in font-feature-settings on all text to disable ligatures, matching the original type rendering
- Use 1px solid #eceae4 for all borders — dividers, card outlines, input strokes, nav separators — one warm beige border color everywhere

### Don't
- Never use cool grays (#e5e7eb, #6b7280) — all neutrals skew warm with a yellow undertone; cool grays would break the parchment atmosphere
- Never apply colored backgrounds to buttons; the primary action is near-black (rgba(0,0,0,0.88)) and secondary is transparent — there is no colored CTA
- Never use drop shadows for elevation except on the chat input card; most cards and surfaces are flat with no shadow at all
- Never use more than one font family — Camera Plain Variable (or its substitute) handles everything from 14px captions to 60px display headlines
- Never use sharp corners (0px radius) on interactive elements; even image thumbnails get 12px radius
- Never use the hero gradient colors on individual UI components like buttons, badges, or icons — the gradient exists only as a full-bleed atmospheric background
- Never add visual weight to feature sections with icons, colored badges, or decorative elements — this system communicates through type weight and scale alone

## Elevation

- **Chat Input Card:** `oklab(0 0 0 / 0.08) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.1) 0px 8px 10px -6px`
- **Input Field (inset):** `oklch(0 0 0 / 0.25) 0px 0px 0px 0.5px inset`

## Surfaces

- **Canvas** (`#fcfbf8`) — Page background, default surface for all content
- **Card** (`#f7f4ed`) — Elevated cards, chat input panels, feature containers — slightly warmer than canvas
- **Inverse** (`#1c1c1c`) — Dark pill buttons, inverse overlays, high-contrast moments

## Imagery

The hero uses a full-bleed horizontal gradient as an ambient backdrop — not an image but a color field transitioning from dark charcoal through blues, magentas, reds, and oranges, creating a sunrise/prism effect. Below the hero, the site is almost entirely text-dominant. Template gallery cards show small rectangular screenshots with 12px rounded corners, displayed in a 4-column grid. These screenshots are the only photographic content and serve as thumbnails, not atmosphere. Company logos in the social proof bar are monochrome SVGs in #1c1c1c. Feature sections use small UI mockups (chat input recreations) rather than illustrations or photography. The overall visual density is very low — most sections are pure typography on warm cream backgrounds with no decorative imagery at all. Icon style is minimal: thin outlined icons at approximately 1.5px stroke weight, monochrome in #1c1c1c or #5f5f5d.

## Layout

Max-width 1280px centered container. The hero is full-bleed with the gradient background extending edge-to-edge, centered headline at 60px, subtitle at 18px, and a floating chat input card below. After the hero, the page settles into cream (#fcfbf8) sections with generous vertical spacing (64-80px between major sections). The logo bar is a single horizontal row of 5-6 monochrome logos. Feature explanations use a 2-column layout: left side has a UI mockup in a warm card, right side stacks 3 text-only feature descriptions vertically. Template gallery uses a 4-column grid of screenshot cards with minimal gaps. Navigation is a sticky top bar with backdrop blur, logo left, text links center, two pill buttons right. Footer is multi-column with warm beige (#eceae4) top border. Section rhythm: gradient hero → white with logos → cream feature sections → white template grid → stats → footer.

## Similar Brands

- **Vercel** — Near-black on white/cream canvas, single custom sans-serif for all text, pill-shaped buttons, minimal color in UI with gradient used only as decorative hero moment
- **Linear** — One typeface system with tight letter-spacing, achromatic UI controls, color reserved for a single ambient gradient rather than distributed across components
- **Notion** — Warm off-white canvas (#fcfbf8 range) instead of pure white, monochrome UI, text-dominant layouts with minimal imagery, company logo bar in monochrome
- **Cursor** — AI coding tool with chat input as the hero interaction, warm neutral palette, pill buttons, custom sans-serif with negative tracking
- **Raycast** — Command-bar-style hero input, single font family across all scales, warm cream surface tones rather than cool grays
