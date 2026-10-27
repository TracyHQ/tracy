# Datalands — Style Reference
> Black cathedral with a single neon heartbeat. The wordmark fills the nave; everything else is a whispered caption beneath it.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Datalands is a monochrome-black studio portfolio built around a single act of typographic spectacle: an OZIK Black wordmark blown to 358px, reducing the entire brand to a shape you feel before you read. The interface is deliberately austere — pure black canvas, white text, Martian Mono for all UI chrome and labels, Basis Grotesque for body copy with aggressive negative tracking. Chromatic color appears only as punctuation: a vivid magenta #fc74dd for the primary action, a small ember-orange #ff4c33 dot ticking in the nav, and case study visuals that erupt with flat geometric color. Everything rounded — inputs, buttons, tags, and the 'LET'S TALK' CTA all use 96px+ radii, creating a soft, almost capsule-like quality that contrasts the brutalist display type. The grid breathes; sections sit 80px apart, cards carry 48px of internal padding, and the dark mode is treated as a content environment, not a surface to be layered.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Universal canvas, page background, default text, hairline borders, monogram fills. Pure black, no warm or cool bias — used at maximum density to let white type and color accents do all the work |
| Bone | `#ffffff` | Primary headings, body copy on dark, inverse button labels, inverted card surfaces for case studies |
| Charcoal | `#1d1a1a` | Elevated card and button-fill surfaces sitting one step above the black canvas. Slightly warm-tinted dark gray |
| Ink | `#111212` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. |
| Graphite | `#3d3d3d` | Secondary button borders and button text — a mid-gray frame for outlined/ghost controls on dark |
| Mist | `#d9d9d9` | De-emphasized body text and subtle border work when pure white would overstate the hierarchy |
| Parchment | `#f3f3ef` | Light input field background — a warm near-white that gives the rare form elements a paper-like quality against the black void |
| Neon Magenta | `#fc74dd` | Pink action color for filled buttons, selected navigation states, and focused conversion moments. |
| Ember Dot | `#ff4c33` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Deep Violet | `#122d8b` | Decorative illustration fill used in data-visualization case study artwork. Not an interface token — appears inside graphics |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### OZIK Black — Display wordmark only — the brand's signature act. 358px condensed ultra-black with distinctive cut-out apertures in the 'a' and 'd' forms. No substitute captures the same geometric density; treat as a logo asset, not a system font.
- **Substitute:** Druk Wide Heavy, obviously
- **Weights:** 400
- **Sizes:** 358px
- **Line height:** 0.83
- **Letter spacing:** -0.01em

### Basis Grotesque Pro — Primary body and heading family for all running text and subheadings. Aggressive negative tracking at large sizes (–0.04em at 80px) tightens the geometric forms; at body sizes tracking relaxes to near-normal. The wide size range (14–80px) and tight leading (1.00–1.10 for display) let it carry both paragraph text and large editorial headlines.
- **Substitute:** Inter, Söhne, or any geometric grotesque
- **Weights:** 400
- **Sizes:** 14px, 18px, 22px, 35px, 38px, 42px, 60px, 80px
- **Line height:** 1.00–1.45
- **Letter spacing:** -0.04em at 80px, scaling down to -0.002em at 14px

### Martian Mono — UI chrome — nav labels, button text, tags, case study categories, time stamps, and the 'CASE STUDIES' / 'MICROSOFT' / 'NIKE' labels. The tracked-out positive spacing (0.05–0.10em) on small sizes creates a typewriter/terminal feel that codes the meta-information as system, not content. All caps throughout.
- **Substitute:** JetBrains Mono, IBM Plex Mono, Space Mono
- **Weights:** 200, 400, 600
- **Sizes:** 13px, 16px
- **Line height:** 1.00–1.45
- **Letter spacing:** 0.02em at 15px, 0.05em at 16px, 0.10em at 16px, -0.05em at 16px

### Martian Mono Std xLt Extra-light — Martian Mono Std xLt Extra-light — detected in extracted data but not described by AI
- **Weights:** 200, 600
- **Sizes:** 18px
- **Line height:** 1.4

### Martian Mono Std xLt — Martian Mono Std xLt — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.45
- **Letter spacing:** -0.05

### Martian Mono Nr xLt — Martian Mono Nr xLt — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Martian Mono Extra-light — Martian Mono Extra-light — detected in extracted data but not described by AI
- **Weights:** 200
- **Sizes:** 12px
- **Line height:** 1

### Martian Mono ExtraLight — Martian Mono ExtraLight — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 15px
- **Line height:** 1.25
- **Letter spacing:** 0.02

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.05px |
| body-sm | — | — | 14px | 1.25 | -0.002px |
| body | — | — | 18px | 1.45 | -0.008px |
| subheading | — | — | 22px | 1.2 | -0.01px |
| heading-sm | — | — | 35px | 1.1 | -0.02px |
| heading | — | — | 42px | 1.1 | -0.025px |
| heading-lg | — | — | 60px | 1 | -0.03px |
| display | — | — | 80px | 1 | -0.04px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 48px
- **Element gap:** 10-20px

### Border Radius

- **tags:** 30px
- **cards:** 18-30px
- **inputs:** 96px
- **buttons:** 96px
- **special:** 300px

## Components

### Wordmark Display
**Role:** Brand-defining hero title

OZIK Black at 358px, white on void, line-height 0.83, letter-spacing -0.01em. One per page, full viewport width. The letterforms have distinctive cut-out apertures that are the brand's geometric signature.

### Pill Nav Button (LET'S TALK)
**Role:** Primary header CTA

Ghost pill: 1px border #3d3d3d, border-radius 96px, padding 10px 22px, text in Martian Mono 12px weight 200 all-caps, tracked +0.10em, white. A 34px circular icon button sits flush right containing a directional arrow.

### Filled Magenta CTA
**Role:** Primary action button

Background #fc74dd, text #1d1a1a, border-radius 96px, padding 10px 24px, Martian Mono 12px weight 200 all-caps, letter-spacing 0.10em. The only filled chromatic element in the system.

### Ghost Outline Button
**Role:** Secondary action

Transparent fill, 1px border #3d3d3d or #ffffff, border-radius 96px, padding 10px 22px, Martian Mono label white or #3d3d3d.

### Status Dot + Timestamp
**Role:** Live indicator in nav

8px #ff4c33 dot paired with Martian Mono 12px weight 200 white time text. Signals 'now' / recording metaphor.

### Ticker Label
**Role:** Uppercase header descriptor (e.g. 'BRANDING AND DATA, TOGETHER AT LAST >')

Martian Mono 12px weight 200 all-caps, white, letter-spacing 0.10em, with trailing arrow glyph. Functions as marquee/tagline.

### Case Study Card
**Role:** Project showcase block

Variable: white card variant uses #ffffff background, 30px radius, 48px padding, with a small dark pill category tag ('NIKE', 'MICROSOFT') in Martian Mono 12px white-on-charcoal. Dark card variant uses #1d1a1a on the void canvas. Featured artwork (data viz) uses flat chromatic shapes (orange #ff4c33, gray, neon yellow).

### Category Pill Tag
**Role:** Brand/client label on case studies

Dark pill, background #1d1a1a, text white, border-radius 30px, padding 4px 12px, Martian Mono 12px weight 400 all-caps. Sits in the top-left of case study cards.

### Input Field
**Role:** Form input (rare in this portfolio context)

Background #f3f3ef, border 1px #111212, border-radius 96px, padding 10px 22px, text in Martian Mono 18px weight 200. The only light-on-dark inverted form surface in the system.

### Video Player
**Role:** Full-bleed media block

Native HTML5 video with custom controls at 1.50 line-height for timestamps. Black background, white progress bar, mute/fullscreen icons in white.

### Section Heading Pair
**Role:** Two-column intro text under hero

Two columns at ~50/50 width: left in Basis Grotesque Pro 22px weight 400 white, right in Basis Grotesque Pro 18px weight 400 #d9d9d9 or white. Acts as manifesto/positioning statement.

### Accent Bar
**Role:** Decorative vertical element on cards

Thin vertical bar (3-6px wide) in #fc74dd or case-study-specific chromatic color, positioned flush to the left edge of a card. Functions as a color code for project category.

### Data Visualization Artwork
**Role:** Case study hero illustration

Flat geometric compositions: large overlapping circles in gray (#d9d9d9) and solid fills (#ff4c33 orange, neon yellow #d4f542, #94bcee blue), with numeric labels in Martian Mono centered inside. No gradients, no shadows — pure flat color blocking.

## Do's and Don'ts

### Do
- Set primary display text in OZIK Black at 358px, line-height 0.83, letter-spacing -0.01em, one wordmark per page maximum
- Use Martian Mono 12px weight 200 with letter-spacing 0.10em for all uppercase UI labels, nav items, and tags
- Apply border-radius 96px to every button and input; 300px for special capsule elements
- Reserve #fc74dd exclusively for filled primary action buttons and thin accent bars; never use it for body text or large surfaces
- Maintain a pure #000000 canvas across all sections; let white type and single-color accents carry the visual weight
- Set Basis Grotesque Pro headings with aggressive negative tracking: -0.04em at 80px scaling linearly toward 0 at 14px
- Use #ff4c33 only for the status dot in the nav and inside data viz artwork — never as a button or text color

### Don't
- Don't apply gradients, shadows, or glassmorphism — the system is flat and high-contrast
- Don't use #fc74dd for anything other than the primary filled action; one vivid color must stay singular
- Don't use OZIK Black for body copy or UI labels — it's a wordmark asset, not a system face
- Don't introduce mid-gray surfaces between #000000 and #1d1a1a; the elevation stack is intentionally two steps
- Don't use rounded corners below 18px on cards or 96px on interactive elements; the capsule geometry is the system
- Don't set body copy larger than 22px; the type system separates editorial display (60–80px) from prose (14–22px) with a deliberate gap
- Don't use color for de-emphasized text — use #d9d9d9 or reduced opacity on white instead of gray-blue or gray-violet

## Elevation

The design deliberately avoids drop shadows and material elevation. Depth is communicated through value contrast (black canvas → #1d1a1a card → #ffffff inverted card) and through the dramatic typographic scale jump from 22px body to 358px display. There is no shadow stack, no blur, no glow — only flat planes and type weight doing the work.

## Surfaces

- **Void** (`#000000`) — Base canvas, page background, hero stage
- **Charcoal** (`#1d1a1a`) — Elevated cards, dark filled button states
- **Bone** (`#ffffff`) — Inverted case study cards, light mode contrast blocks

## Imagery

Photography and traditional imagery are absent. The visual language is built from flat geometric data-visualization compositions — overlapping circles, pie segments, and bar charts rendered in solid chromatic fills (orange #ff4c33, neon yellow, gray, soft blue) with numeric labels in Martian Mono centered inside. Case study artwork sits on solid color backgrounds (orange, white, dark) and acts as the only 'color' on the page. Icons are minimal and line-based in white. No lifestyle photography, no product shots, no stock — the studio positions data itself as the aesthetic subject. Video content appears as a single full-bleed black player near the top of the page.

## Layout

Full-bleed dark page with the OZIK wordmark occupying the entire hero viewport. Below the hero, content is centered within a max-width of ~1440px with generous left/right gutters. The page rhythm is: massive wordmark → video block with two-column manifesto text below → vertical case study list. Case study cards stack vertically with consistent vertical rhythm (~80px between sections), each opening with a small monospace category tag, then a large image/video artwork block, then a short caption in Basis Grotesque. Navigation is a single thin top bar: left-side ticker text, centered live status with timestamp, right-side pill CTA — all in 12px Martian Mono. The grid is implicitly single-column at the section level with internal two-column splits for intro text and media. No sidebar, no footer chrome visible above the fold — the wordmark IS the page.

## Similar Brands

- **Resn** — Same studio-portfolio-as-artwork philosophy with a single oversized typographic hero and a nearly all-black canvas that lets individual project tiles erupt with color
- **Locomotive** — Dark-mode agency site using condensed geometric sans for display and monospaced type for UI labels, with generous vertical rhythm between case study blocks
- **Active Theory** — Full-bleed dark creative agency site where the wordmark or hero visual fills the viewport and the rest of the page is a quiet monochrome support system
- **Manual (manualcreative.co)** — Brutalist display type at extreme sizes on a black canvas, with minimal UI chrome and a single accent color punctuating an otherwise monochrome system
