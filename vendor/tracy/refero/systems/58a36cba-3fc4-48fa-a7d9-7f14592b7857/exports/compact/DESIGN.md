# Hugo & Marie — Style Reference
> Monochrome gallery catalog — editorial photography mounted on infinite white, framed by whisper-thin serif.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Hugo & Marie operates as a curatorial monochrome canvas: pure white negative space frames dramatic full-bleed editorial photography, with content living in the tension between near-black ink and paper. Typography carries all the personality — an ultralight serif display (weight 100, 100px) sets ceremonial headlines that feel like gallery wall text, while a restrained neo-grotesque sans (soehne, weights 300/400) handles everything from navigation to body copy. The interface refuses decorative chrome: no filled buttons, no color accents, no shadows — navigation is text-with-arrow, badges are hairline pills, and section dividers are single-pixel rules. This is a portfolio-first system where the artists' imagery is the only chromatic event, and the UI must vanish around it.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page background, card surfaces, badge fills, nav dividers, input fields — the dominant surface that recedes to let imagery speak |
| Ink Black | `#000000` | Primary text, dense border structure, dark image overlays — the structural anchor for rules and headings |
| Soft Ink | `#0a0a0a` | Dark borders and separators for elevated surfaces and inverted UI. |
| Graphite | `#767676` | Input field borders — the only place a mid-gray border appears, marking form-field edges without competing with imagery |
| Smoke | `#b3b3b3` | Muted icon strokes, separators, and secondary graphic details. Do not promote it to the primary CTA color |
| Ash | `#cccccc` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. |

## Typography

### saol-display — Ceremonial headlines and editorial titles — ultralight serif at 100px with 0.95 line-height creates near-touching baselines that feel like fashion-magazine coverlines. This is the only place dramatic typography appears; everything else defers to sans-serif.
- **Substitute:** Playfair Display, Cormorant, Tenor Sans
- **Weights:** 100
- **Sizes:** 100px
- **Line height:** 0.95
- **Letter spacing:** -0.01em

### soehne — All interface text — nav links at 16px weight 300, section headings at 20–22px weight 300, body at 16px weight 400 with comfortable 1.64 leading, supporting copy at 14px. The weight-300 default for nav and headings is a signature choice: it makes the UI feel editorial and unpressured rather than assertive.
- **Substitute:** Inter, Söhne (if available), Neue Haas Grotesk, Helvetica Neue
- **Weights:** 300, 400
- **Sizes:** 14px, 16px, 20px, 22px
- **Line height:** 1.00, 1.15, 1.20, 1.40, 1.44, 1.64, 1.80
- **Letter spacing:** 0.008em, 0.02em

### soehne-mono — Badge labels and small metadata — monospace at 13px marks categorically different content (tags, IDs, status) from the proportional body text
- **Substitute:** JetBrains Mono, IBM Plex Mono, Space Mono
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.31
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.8 | 0.16px |
| body | — | — | 16px | 1.64 | 0.13px |
| subheading | — | — | 20px | 1.4 | 0.4px |
| heading-sm | — | — | 22px | 1.44 | 0.44px |
| display | — | — | 100px | 0.95 | -1px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 90px
- **Card padding:** 0px
- **Element gap:** 5px

### Border Radius

- **cards:** 0px
- **badges:** 9999px
- **images:** 0px
- **buttons:** 0px

## Components

### Editorial Text Link
**Role:** Primary navigation and inline CTAs

Plain text in soehne 16px weight 300, color #0a0a0a, with a 5px right margin before a → arrow character. No background, no border, no underline on default state. Sits directly in a horizontal nav row with 30px left/right padding between items.

### Hairline Divider
**Role:** Section separator

A 1px solid line in #0a0a0a spanning the full content width, used between major content blocks. Zero vertical margin; the line itself is the transition.

### Display Headline (Overlay)
**Role:** Hero text over full-bleed photography

saol-display 100px weight 100, color #ffffff, line-height 0.95, letter-spacing -0.01em, centered over a dark image. Followed by a small decorative line ornament beneath. Two-line maximum.

### Pill Badge
**Role:** Filter and category tags

soehne-mono 13px weight 400, text color #0a0a0a on #ffffff fill with 1px #cccccc border, 9999px radius, 6px top / 8px bottom / 24px horizontal padding. Functions as a toggleable filter.

### Three-Column Service Block
**Role:** Agency/Studio/Contact overview grid

Three equal columns separated by hairline #0a0a0a vertical borders. Each column: bold soehne heading at 16–20px, 'Explore →' text link below, then a 2–3 sentence body paragraph in 16px weight 400. No card chrome — just ruled columns on white.

### Image Grid Thumbnail
**Role:** Artist portfolio grid items

Square or portrait image thumbnails, 0px radius, placed in a multi-row horizontal grid with minimal gaps. No caption, no border, no hover chrome — the image is the content.

### Full-Bleed Editorial Hero
**Role:** Page-opening image section

Edge-to-edge image covering the entire viewport, no border, no radius, with overlaid display headline. Images carry their own atmosphere; the UI contributes nothing.

### Section Header Row
**Role:** Content section titles with secondary action

Left-aligned: section name in soehne weight 400 + sub-action like 'Watch Reel →' below. Right-aligned: filter pills (Latest / Femme & Childlike). Separated from content by a hairline divider.

### Navigation Bar
**Role:** Top-level site navigation

Full-width white bar, logo on far left (Hugo & Marie wordmark in soehne weight 300), nav links centered (Creative Agency / Artist Bureau / Helium →) in 16px weight 300 with 30px horizontal padding, 'Info' link on far right. 1px hairline border-bottom in #0a0a0a.

## Do's and Don'ts

### Do
- Use soehne weight 300 as the default for all navigation and section headings — never default to 400 or higher for UI chrome
- Use saol-display weight 100 at 100px with 0.95 line-height for ceremonial display moments; never use it below 48px
- Render all buttons and links as text-with-arrow (→), never as filled rectangles — the system has no filled buttons
- Apply 9999px radius exclusively to badges; keep all other elements (cards, images, inputs) at 0px radius
- Separate content sections with 1px solid #0a0a0a hairlines, not whitespace gaps or shadows
- Use white (#ffffff) as the only surface color for cards and content blocks — never introduce tints, off-whites, or gray fills for grouping
- Place imagery edge-to-edge with no border, padding, or radius when used as a section anchor

### Don't
- Never introduce a chromatic accent color, brand color, or decorative gradient — the system is strictly achromatic and adding color breaks the editorial contract
- Never apply box-shadow, drop-shadow, or any elevation effect — depth is communicated through image bleed and hairline rules, not shadows
- Never use soehne-mono for body copy or navigation — reserve it exclusively for badge labels and small metadata
- Never use saol-display at body sizes (14–22px) — it is a display face only; body work belongs to soehne
- Never add border-radius to cards, images, or inputs — 0px radius is the system default for all non-badge elements
- Never use filled background colors for buttons or interactive elements — text links and hairline buttons are the only interactive pattern
- Never use a font weight above 400 in soehne for UI text — heavier weights break the restrained editorial tone

## Elevation

The system has zero elevation. No shadows, no blurs, no z-axis depth. Dimensionality is achieved through full-bleed photography bleeding to viewport edges and 1px hairline rules that organize content into columns and sections.

## Surfaces

- **Paper** (`#ffffff`) — Base canvas — the entire site sits on pure white, making all imagery and ink feel mounted
- **Ash Fill** (`#cccccc`) — Soft badge surface — appears only as a 1px border tone, never as a large fill

## Imagery

Imagery is the sole carrier of color and atmosphere. The site features high-fashion editorial photography — extreme close-up portraits with iridescent/oil-slick color treatments, studio-lit product shots, and artist self-portraits. Images are always full-bleed or thumbnail-grid, never contained in rounded cards or frames. Treatment is dramatic and high-contrast, often with the subject's face filling the frame. Color appears only inside the photography itself — the UI stays pure monochrome so the images feel exhibited rather than decorated.

## Layout

Full-bleed editorial layout. The hero is a full-viewport image with centered overlay text. Below, content lives in a borderless three-column structure where columns are defined by 1px vertical hairlines, not by card containers. Section transitions are hairline horizontal rules spanning the full width. Artist portfolios use a multi-row horizontal thumbnail grid with no captions, no gaps wider than the natural image spacing. The nav is a single hairline-bordered white bar with logo left, links centered, 'Info' right. Overall density is sparse and curated — long vertical breathing room, large images, short text blocks. The system behaves like a printed art catalog translated to the web.

## Similar Brands

- **Apartamento Magazine** — Same full-bleed editorial photography, no UI chrome, typographic restraint, and a layout that behaves like a printed publication translated to the web
- **Systemic Films** — Identical use of an ultralight serif display face (weight 100) for ceremonial titles over full-bleed images, with a strictly monochrome interface
- **Saint Laurent (ysl.com)** — Same editorial-fashion full-bleed hero photography, whisper-weight typography, and refusal of decorative UI elements — the images carry the entire experience
- **Bureau Cool** — Three-column hairline-bordered content sections, zero-radius everything, text-link navigation with arrows, and a curatorial gallery-like white canvas
