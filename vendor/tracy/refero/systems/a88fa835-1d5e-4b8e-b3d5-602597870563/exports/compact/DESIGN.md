# Koto — Style Reference
> Obsidian gallery at midnight. A near-black stage where a single yellow mark is the only warm light, and condensed type floats in vast negative space like exhibition placards.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Koto is a creative agency site that feels like an empty gallery at midnight: a near-totally achromatic canvas where custom condensed type carries all the personality. The sole chromatic moment is the yellow logo mark — everything else is a disciplined gradient of grays against near-black, structured as sparse typographic waypoints rather than information-dense blocks. Navigation is whisper-quiet, whitespace is architectural, and components sit flat on the canvas with no shadows or gradients. The density is compact at the micro-level (tight padding, small type) but breathes generously between sections, creating a rhythm of typographic statements separated by void.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#060606` | Primary page canvas — the dominant background where all content floats; not pure black, but a warmthless near-black that keeps contrast at AAA |
| Graphite Surface | `#141414` | Elevated card and icon backgrounds — one step lighter than canvas, used to subtly separate surfaces without breaking the dark mood |
| Smoke Border | `#202020` | Hairline borders and dividers — barely visible structural lines that define regions without adding visual weight |
| Iron Mute | `#595959` | Muted text and secondary borders — body text at reduced emphasis, footer meta, tertiary labels |
| Ash Gray | `#989898` | Secondary body text and medium-emphasis borders — the most-used neutral after white, for body copy and structural outlines |
| Silver Whisper | `#b4b4b4` | Light body text — softer than white for inline body content where pure white would feel too sharp |
| Paper White | `#ffffff` | Primary text, heading strokes, and all key borders — the brightest mark in the system, reserved for content that must read first |
| Signal Yellow | `#ffe800` | Yellow decorative accent for icons, marks, and small graphic details. |

## Typography

### gtKotoheim — All UI, body, navigation, button, and small-display text. Custom monospace-feeling sans with 'salt' alternate glyphs — weight 350 is the default body, 400 for slightly stronger emphasis. The only typeface for everything below display size.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or a monospaced geometric sans like Space Mono
- **Weights:** 350, 400
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.25, 1.50
- **OpenType features:** `"salt"`

### gtKotoheimCondensed — Display headings only. Condensed cut at weight 300 with tight 1.0–1.1 leading and -0.01em tracking — these headlines whisper rather than shout, letting the vast negative space amplify their presence. Reserved for hero statements and section titles.
- **Substitute:** Inter Tight, Barlow Condensed, or any narrow geometric sans at light weight
- **Weights:** 300
- **Sizes:** 38px, 48px
- **Line height:** 1.00, 1.10
- **Letter spacing:** -0.01em
- **OpenType features:** `"salt"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| display-sm | — | — | 38px | 1.1 | -0.38px |
| display | — | — | 48px | 1 | -0.48px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 36px
- **Element gap:** 8px

### Border Radius

- **cards:** 6px
- **buttons:** 2px
- **general:** 10px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Full-width horizontal bar on #060606 canvas. Logo at far left, nav links center-left, UTC time at far right. No background fill, no border — sits directly on the void. Height ~60px with 36px horizontal padding.

### Koto Logo Mark
**Role:** Brand identity in nav

'KOTO' wordmark in #ffe800 (Signal Yellow) using gtKotoheim at ~14px weight 400 with the 'salt' feature on, plus a thin yellow smile arc beneath. The only chromatic element in the system — treated as a fixed asset, not a text component.

### Navigation Link
**Role:** Section navigation items

Uppercase gtKotoheim at 12px weight 400, letter-spacing normal, color #ffffff. Separated by ~36px column gap. Active state shown by a small dot indicator (•) in white. No underline, no background — pure typographic nav.

### UTC Time Indicator
**Role:** Live timezone display in nav

Top-right meta element: '20:23 UTC↗' in gtKotoheim 12px weight 400, #ffffff. Includes a small arrow glyph. Signals the studio's global presence across five cities.

### Hero Headline Statement
**Role:** Opening typographic declaration

gtKotoheimCondensed weight 300 at 48px, line-height 1.0, letter-spacing -0.48px, color #ffffff. Two-line left-aligned stack at the bottom-left of the first viewport. Massive negative space above and to the right — the text anchors the page through position alone.

### Body Text Block
**Role:** Paragraph content

gtKotoheim weight 350 at 16px, line-height 1.5, color #b4b4b4 (Silver Whisper). Max-width ~600px, left-aligned. Tight character through the 'salt' feature gives prose a distinctive technical tone. No paragraph spacing beyond natural line breaks.

### Dark Surface Card
**Role:** Content container for images or grouped content

Background #141414 (Graphite Surface) on #060606 canvas, 6px border-radius, 36px padding. No border, no shadow — the slight lightness shift is the only elevation signal. 48px row-gap between stacked cards.

### Outlined Action Border
**Role:** Interactive border treatment

1px solid #ffffff border, 2px radius, transparent background. Used for ghost-style interactive elements. The white border on void black is the system's equivalent of a CTA — there are no filled buttons in this palette.

### Footer City List
**Role:** Office locations meta

Inline text in gtKotoheim 14px weight 400, #989898, listing city names separated by commas. Embedded within body copy rather than isolated in a footer block — location is part of the narrative.

### Active Nav Dot
**Role:** Current page indicator

Small white dot (•) positioned next to the active nav item. 2px diameter, color #ffffff. The only interactive state indicator visible in the system.

## Do's and Don'ts

### Do
- Set page background to #060606 (Void Black); never use pure #000000
- Use gtKotoheimCondensed weight 300 at 38–48px only for display headlines; pair with -0.48px letter-spacing at 48px
- Use gtKotoheim at 12–16px for all UI, body, and navigation text with the 'salt' font-feature enabled
- Reserve #ffe800 (Signal Yellow) exclusively for the logo mark; it must not appear in any UI component, button, or text
- Communicate elevation through lightness shifts (canvas → #141414 cards), not through shadows or borders
- Keep element gaps at 8px and section gaps at 48px; the rhythm comes from these fixed multiples of the 4px base unit
- Left-align all text and let negative space carry the layout — never center body copy or add decorative dividers

### Don't
- Don't introduce any color outside the neutral scale and Signal Yellow; the system is 0% colorful by design
- Don't use filled buttons or colored CTAs; interactive elements are ghost/outlined with #ffffff borders on transparent fills
- Don't apply shadows, gradients, or blur effects to any element — the flat void treatment is non-negotiable
- Don't use radius values other than 2px, 6px, or 10px; mixing radii breaks the geometric discipline
- Don't set body copy in gtKotoheimCondensed or display in gtKotoheim regular; the two families are strictly separated by size and role
- Don't use pure #ffffff for body text — reserve it for headings, borders, and the UTC indicator; body copy uses #b4b4b4
- Don't add icons, illustrations, or imagery to the base layout; the page is typographic-first and visual assets should only appear inside Dark Surface Cards

## Elevation

The design has no shadows. Surface hierarchy is communicated purely through lightness shifts in the grayscale (#060606 → #141414) and the density of white text and borders against the dark canvas. This flat treatment is deliberate — any drop shadow would break the gallery-on-blackwall illusion.

## Surfaces

- **Canvas** (`#060606`) — Primary page background
- **Raised Surface** (`#141414`) — Cards, icon containers, elevated content blocks

## Imagery

The site has no visible imagery in the primary navigation states — it's pure typography on darkness. The visual language is deliberately empty: no decorative graphics, no illustrations, no background patterns. When project work is displayed, it appears as content within Dark Surface Cards (#141414) that sit as rectangles on the void canvas. The single graphic element is the yellow logo mark's smile arc, which functions as a brand signature rather than decoration. The overall impression is of a gallery wall before the artworks are hung — the type and the void are the design.

## Layout

The page uses a full-bleed dark canvas with no max-width on the background, but content is contained to ~1200px max-width. The hero pattern is a full-viewport near-empty screen with a large two-line display headline anchored to the bottom-left corner — the vast negative space above is the hero, not the text. Sections flow as discrete typographic blocks with 48px gaps, alternating between raw body text on the void and content contained within #141414 cards. Navigation is a single top bar (60px) with logo left, links center, time right. No sidebar, no mega-menu, no sticky behavior visible. Content is consistently left-aligned with no centered text blocks. The rhythm is: minimal nav → vast void → small headline → void → body paragraph → card → void, creating a pacing of visual rest and visual content.
