# Vucko — Style Reference
> oversized type on white gallery floor — a type-specimen book where the wordmark is the room.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Vucko operates as a monochrome editorial canvas where the type is the architecture. Pure white surfaces meet pure black ink, with a single faint gray reserved for de-emphasized secondary text and ghost-list items in service lists. The custom Suisse typeface at display sizes — up to 211px — creates a monumental, almost architectural presence where the wordmark alone can fill a viewport. Chromatic color is absent from the system itself, appearing only inside project showcase content (vivid gradients, yellow cards) that punctuates the otherwise austere page. The interface is whisper-thin: hairline 1px borders, zero shadows, generous 58px section gaps, and pill-shaped nav elements. Every screen should read like a page in a high-end art book — restrained, confident, and anti-decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#000000` | Primary text, all borders, dark surface blocks, and the hero wordmark — the structural backbone of every screen |
| Paper | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Faint Ash | `#eeeeee` | Subtle surface tint for secondary cards or de-emphasized blocks, barely distinguishable from Paper |
| Steel | `#888a8b` | Muted secondary text and ghost-list items in service lists — the only non-black text color, used to create tonal hierarchy without introducing hue |
| Charcoal | `#222222` | Alternate dark surface for nav or panel backgrounds — a softer dark than Ink when full black is too severe |

## Typography

### Suisse Int'l — Sole typeface across the entire system. Weight 700 carries all display and heading roles up to 211px for the hero wordmark; weight 400 handles body and link text. The 211px weight-700 wordmark with -0.057em tracking is the signature — it turns the brand name into a room-scale installation. Weight 500 appears in nav and transitional text. The aggressive negative tracking on display sizes (-0.057em at 211px, -0.020em at 55px) tightens the Swiss grotesque geometry into a denser, more monolithic block — the type is meant to read as architecture, not as text.
- **Substitute:** Inter, Neue Haas Grotesk, or General Sans — any neo-grotesque with similar x-height and geometric terminals
- **Weights:** 400, 500, 700
- **Sizes:** 17, 18, 19, 43, 55, 120, 211
- **Line height:** 0.70, 1.00, 1.05, 1.13, 1.17, 1.21, 1.50
- **Letter spacing:** -0.057em at 211px, -0.020em at 55px, -0.010em at 43px; 0 (normal) at 17-19px body
- **OpenType features:** `"kern" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 17px | 1.5 | 0px |
| subheading | — | — | 19px | 1.5 | 0px |
| heading | — | — | 43px | 1.21 | -0.43px |
| heading-lg | — | — | 55px | 1.13 | -1.1px |
| display | — | — | 120px | 1.05 | -6.84px |
| display-xl | — | — | 211px | 1 | -12.03px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 58px
- **Card padding:** 24px
- **Element gap:** 23px

### Border Radius

- **tags:** 9999px
- **cards:** 9.6px
- **small:** 4.8px
- **medium:** 7.2px
- **buttons:** 9999px

## Components

### Top Navigation Bar
**Role:** Minimal site-wide navigation

White (Paper) background, no border, no shadow. Left: 'VUCKO' wordmark at 17px Suisse weight 700 in Ink. Center: location/time text ('Toronto, Canada 20:34 pm') at 17px Suisse weight 400 in Ink. Right: nav links ('Projects, Approach, About, Contact') at 17px Suisse weight 400 in Ink, followed by a small 8px Ink dot indicator with 9999px radius. 56px horizontal padding, approximately 19px vertical padding. The dot serves as an ambient status indicator — it is not interactive.

### Hero Display Wordmark
**Role:** Primary brand statement on landing

The wordmark 'VUCKO™' at 211px Suisse weight 700, color Ink, letter-spacing -12.03px, line-height 1.0. Sits directly on the Paper canvas with 56px left/right padding. The ™ superscript is positioned at the baseline-right of the final O. The wordmark is intended to overflow or fill the viewport width — it is architecture, not text. No background, no border.

### Floating Showcase Card
**Role:** Featured project overlay on hero

A small card positioned absolutely in the upper-right of the hero, ~9.6px border-radius, with a vivid chromatic background (project content — yellow in current instance). Contains a bold black project title ('2023 Wrapped') at ~43px Suisse weight 700 and a small description below at 17px. The card itself is content, not a system component, but the container follows the 9.6px card radius token and 24px internal padding.

### Tagline Section
**Role:** Brand statement below hero

Left-aligned narrow column on Paper canvas. Headline at 19px Suisse weight 400 in Ink, line-height 1.5, max-width ~480px. Below the headline, an underlined text link 'Learn more about our approach' at 17px Suisse weight 400 in Ink with 1px Ink underline. At the far right of the same row, a '(Scroll)' indicator at 17px Suisse weight 400 in Ink. 58px top margin from the hero wordmark.

### Project Showcase Card (Full-bleed)
**Role:** Client work presentation in portfolio

Full-bleed card with 9.6px border-radius, filling the container width minus 56px horizontal padding. Background is a vivid gradient (project content — blue-to-purple in current instance). Centered display text at 55px Suisse weight 700 in Paper (white), letter-spacing -1.1px, with playful decorative elements. A pill button (9999px radius, white fill, black text at 17px) overlaid at the bottom, labeled with a project name. Card internal padding approximately 56px.

### Service Block (Media + Text)
**Role:** Individual service description in services section

Split layout. Left side: a black (Ink) square block, approximately 200px wide, serving as a video/image placeholder. Below the block, body text at 17px Suisse weight 400 in Ink describing the service, max-width ~200px. Right side contains the Service List Display. 23px gap between media and text.

### Service List Display
**Role:** Large-scale service category headings

Three stacked display headings at 55px Suisse weight 700, each on its own line, left-aligned. The first item ('IDENTITIES') in Ink (#000000); subsequent items ('SYSTEMS', 'GUIDELINES') in Steel (#888a8b) to create visual de-emphasis through tonal shift rather than size or weight change. Letter-spacing -1.1px, line-height 1.13. This tonal hierarchy — not size hierarchy — is what makes the list read as a menu rather than a stack of headlines.

### Pill Tag / Button
**Role:** Project labels, nav indicators, and pill-shaped interactive elements

9999px border-radius, white (Paper) background, 1px Ink border optional. Text at 17px Suisse weight 400 in Ink. Padding approximately 10px vertical, 15px horizontal. No shadow, no gradient. Used for project name tags and ambient UI marks. The pill shape is the only non-rectangular element in the system.

### Underline Text Link
**Role:** Primary text-based link style

Text at 17px Suisse weight 400 in Ink with a 1px Ink underline. No background, no border, no padding beyond the text's natural line height. This is the system's link and CTA equivalent — there are no filled buttons in the interface. Hover state may shift underline to a thinner weight or remove it.

### Scroll Indicator
**Role:** Navigation hint at hero boundary

Right-aligned text '(Scroll)' at 17px Suisse weight 400 in Ink. Functions as a passive navigation prompt at the bottom of the hero section. No underline, no decoration. 58px top margin from the tagline section.

## Do's and Don'ts

### Do
- Use #000000 (Ink) for all primary text, borders, and dark surface blocks — it is the only structural color in the system
- Set the hero wordmark at 211px Suisse weight 700 with letter-spacing -12.03px — the type is meant to fill the room
- Apply 56px horizontal padding on the main container and 58px vertical gaps between major sections
- Use 9999px border-radius for all pill-shaped elements: nav dot, tags, and pill buttons
- Use tonal hierarchy (Ink vs Steel at #888a8b) rather than size or weight to create secondary text emphasis
- Use 9.6px border-radius for project cards and content containers
- Apply negative letter-spacing on all display sizes: -12.03px at 211px, -6.84px at 120px, -1.1px at 55px, -0.43px at 43px

### Don't
- Never add colored CTA buttons — this system uses underlined text links and neutral pill elements only
- Never use drop shadows, glow effects, or any form of CSS elevation — depth comes from whitespace and contrast alone
- Never center body text — all running text should be left-aligned
- Never use borders thicker than 1px
- Never introduce chromatic colors into the UI chrome — color belongs exclusively inside project showcase content
- Never use display sizes (55px+) for body copy or secondary content — reserve them for headlines and service titles only
- Never break the whitespace rhythm — maintain 58px minimum between major sections and let the type do the work

## Elevation

The system is entirely flat — no drop shadows, no glow effects, no z-axis elevation of any kind. Depth and hierarchy are achieved exclusively through generous whitespace (58px section gaps, 56px container padding), tonal contrast (Ink vs Paper vs Steel), and the sheer scale of the display type. Cards are distinguished by subtle background tint (#eeeeee) or by being placed on the white canvas with no border at all. This is a deliberate editorial choice: the page should read like a printed art book, not a software interface.

## Surfaces

- **Paper Canvas** (`#ffffff`) — Base page background — the negative space that defines the entire system
- **Faint Ash Card** (`#eeeeee`) — Subtle elevation for secondary cards or de-emphasized content blocks
- **Charcoal Panel** (`#222222`) — Alternate dark surface for nav or panel backgrounds when full Ink is too severe
- **Ink Block** (`#000000`) — Full-bleed dark sections and media placeholder blocks — the maximum-contrast surface

## Imagery

The site itself contains zero photography, illustration, or decorative imagery in the UI chrome. All visual content lives inside project showcase cards, which are client work — vivid gradients (blue-to-purple), bright yellow cards with bold display type, and video blocks. These are portfolio artifacts, not system imagery. The interface is purely typographic: massive Suisse wordmarks, body text, and hairline borders. No icons, no stock photos, no illustrations. The visual richness of the site is entirely generated by the scale and weight of the type itself.

## Layout

The page alternates between full-bleed display moments and narrow centered columns. The hero is a viewport-filling wordmark with no left/right constraint beyond 56px padding. Service sections use a strict split: small media block left (200px), massive display list right. Project showcase cards are full-bleed within the container, filling edge to edge. Body text sections are narrow (max ~480px) and left-aligned. Navigation is a single thin bar with no sticky behavior evident. The vertical rhythm is generous — 58px between major sections creates the feel of turning pages in a large-format book. Content is left-aligned by default; the only centered content is display type inside full-bleed project cards.

## Similar Brands

- **Manual (manualcreative.com)** — Same monumental-display-type approach with massive neo-grotesque headlines and pure white editorial canvas
- **Locomotive (locomotive.ca)** — Same restraint: monochrome palette, large-scale type, generous whitespace, and zero decorative chrome
- **Resn (resn.co.nz)** — Similar agency-portfolio language with custom type and confident negative space between sections
- **Active Theory (activetheory.net)** — Both position full-bleed project showcases as the visual content while keeping the chrome quiet and typographic
- **Instrument (instrument.com)** — Same editorial-agency sensibility: large custom type, white canvas, and project work as the only color
