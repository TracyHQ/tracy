# Akash Tyagi — Style Reference
> midnight gallery wall with hot pink markers

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Akash Tyagi is a dark editorial portfolio rendered as a midnight canvas with warm parchment text and a single vivid pink accent that acts as functional punctuation rather than decoration. The layout breathes — 200px section gaps, generous asymmetric two-column compositions, and display labels set in Geist Pixel Triangle create a gallery-wall rhythm where each project is given the silence it needs. Every neutral carries a warm sepia undertone, deliberately steering away from the cool blue-grays of typical tech portfolios. Components are minimal and flat: pill CTAs, hairline dividers, status dots, and large unfettered project imagery — there is no elevation, no gradients, no ornamentation beyond typography and a single chromatic accent.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian Canvas | `#000000` | Page background, card surfaces, inverted text on pink fills |
| Parchment | `#efe6d8` | Primary body and heading text — warm near-white with sepia undertone, replaces the typical cool white of dark UIs |
| Bone | `#aca69c` | Secondary text, button borders, metadata — mid-tone warm gray |
| Ash | `#736e68` | Muted body text, subtle link borders, inactive labels |
| Charcoal | `#605c56` | Hairline dividers, low-emphasis borders, heading underlines on dark |
| Neon Petal | `#ffa1f7` | Primary action buttons, active nav states, selected markers, occasional heading accents — the single chromatic punctuation in the system |
| Acid Lime | `#4dff00` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Geist — Primary UI and body typeface — medium and semibold weights, tight negative tracking at -0.013em to -0.031em. Used for body copy, links, navigation, and small headings.
- **Substitute:** Inter, Satoshi
- **Weights:** 500, 600
- **Sizes:** 13px, 14px, 15px
- **Line height:** 1.14, 1.23, 1.33
- **Letter spacing:** -0.031em at 13px, -0.029em at 14px, -0.013em at 15px
- **OpenType features:** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`

### Geist Pixel Triangle — Display and section-label typeface — pixel/decorative variant used for all-caps section headers like 'SELECTED WORK' and the year range '2015 — 2026'. The pixel treatment gives editorial weight without serifs.
- **Substitute:** Space Mono Bold, Departure Mono
- **Weights:** 400
- **Sizes:** 30px
- **Line height:** 1.33
- **Letter spacing:** -0.033em at 30px
- **OpenType features:** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`

### Geist Mono — Metadata typeface — timestamps, email, technical labels, year stamps. The monospace signals system/data language against the proportional body.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400, 500
- **Sizes:** 13px
- **Line height:** 1.23, 1.54
- **Letter spacing:** -0.031em at 13px
- **OpenType features:** `"blwf" on, "cv03" on, "cv04" on, "cv09" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0px |
| body-lg | — | — | 15px | 1.4 | -0.2px |
| display | — | — | 30px | 1.33 | -1px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1400px
- **Section gap:** 200px
- **Card padding:** 0px
- **Element gap:** 16px

### Border Radius

- **pills:** 1000px
- **buttons:** 40px
- **indicators:** 1000px

## Components

### Pill CTA Button
**Role:** Primary action trigger

Filled pill button, #ffa1f7 background, Obsidian (#000000) text, 40px border-radius, 12px vertical padding × 24px horizontal padding. Geist 500 at 13px. Used for the single most important action on screen (e.g. 'Book an intro call').

### Ghost Text Link
**Role:** Secondary navigation and inline links

No background, Parchment (#efe6d8) text with 1px Ash (#736e68) or Bone (#aca69c) border-bottom underline. Geist 500 at 13–14px. Underline appears only on hover, not at rest.

### Status Availability Indicator
**Role:** Live availability signal

8px Acid Lime (#4dff00) circle with 1000px border-radius, paired with Parchment (#efe6d8) text 'Available for work' at 13px Geist 500. The green dot is the only green element in the entire system.

### Section Header with Date Range
**Role:** Editorial section divider

Two-part label: section name left, date range right. Set in Geist Pixel Triangle 400 at 30px, Parchment (#efe6d8) for the label, Ash (#736e68) for the date range. Tight -0.033em letter-spacing. Separated from content by 104px of vertical space.

### Project Showcase Card
**Role:** Portfolio project entry

Full-width project image displayed edge-to-edge on the Obsidian canvas with no card chrome. No border, no shadow, no radius — the image IS the card. Caption/description appears below in Geist 500, 14px, Parchment text.

### Minimal Header Bar
**Role:** Identity and time stamp

Single-row layout: designer name left ('Akash Tyagi' in Geist 600, Parchment), current time and email right (Geist Mono 400, Ash). No logo, no nav links, no hamburger — the header is identity + clock, nothing more.

### Two-Column Intro Block
**Role:** Personal statement

Asymmetric two-column text block. Left column: condensed bio (2–3 short paragraphs). Right column: left empty or holds the CTA + status. Column gap 24–48px. Body text in Geist 500, 14px, Parchment with 16px paragraph spacing.

### Footer Social Link
**Role:** External profile references

Plain text links — 'X.com', 'LinkedIn', 'Dribbble' — set in Geist Mono 400, 13px, Ash (#736e68) color. No icons, no badges. Separated by consistent 24px gaps.

## Do's and Don'ts

### Do
- Use #000000 as the universal background for every screen — never introduce a lighter or colored canvas
- Apply #ffa1f7 only to the single primary action per view; treat it as the system's only chromatic voice
- Set section labels in Geist Pixel Triangle 30px with -0.033em tracking for editorial weight
- Maintain 200px vertical gaps between major sections to preserve the gallery-wall rhythm
- Use warm neutrals (#efe6d8 → #aca69c → #736e68 → #605c56) in descending tonal order for text hierarchy
- Use the green dot (#4dff00) exclusively for live status/availability — never as a generic accent or button color
- Render all project imagery edge-to-edge with no card chrome, radius, or shadow

### Don't
- Never introduce box-shadows, gradients, or glow effects — flatness is the point
- Never use #ffa1f7 for body text, backgrounds, or decorative purposes — it is an action color only
- Never round image corners on project showcases — images must meet the canvas edge
- Never add more than one filled CTA per screen — the system is single-action
- Never use cool blue-grays or pure whites for text — the warm sepia palette is the identity
- Never use icons in the header or footer — plain text links only
- Never reduce section gaps below 104px — the generous whitespace is structural, not optional

## Elevation

No shadows. Surfaces are separated purely by tone and whitespace. Elevation is expressed through typographic scale and generous spacing, not box-shadow stacks. This flatness is deliberate — shadows would introduce visual noise on a portfolio that treats each project as a gallery frame.

## Surfaces

- **Canvas** (`#000000`) — Full-bleed page background — true black for maximum contrast against warm text
- **Project Surface** (`#000000`) — Project image and content frames sit directly on canvas without card elevation
- **Accent Surface** (`#ffa1f7`) — Inverted pill buttons and selected markers — the only chromatic surface

## Imagery

Product photography dominates — large, high-fidelity device mockups (tablets, phones) shot in lifestyle or twilight contexts with dramatic sky gradients. Images are full-bleed, occupying the full viewport width within the project showcase cards. No rounded corners, no masks, no frames — images meet the dark canvas edge-to-edge. No illustration or iconography beyond a single green status dot. The visual rhythm is: text block → silence → massive product photograph → silence → text block. Photography is the only visual content; UI screenshots inside product shots show dark UIs with warm text, mirroring the portfolio's own aesthetic.

## Layout

Full-bleed dark canvas with max-width 1400px centered content. The page reads as a vertical scroll of alternating text and image bands with extreme vertical breathing room (200px between sections). No sidebar, no sticky nav, no mega-menu — the header is a single static line. Hero pattern: two-column asymmetric text block (bio left, CTA right) on pure black, no hero image. Content arrangement alternates between text-only sections and full-bleed project images, creating a gallery-wall rhythm. Section labels ('SELECTED WORK 2015 — 2026') act as horizontal typographic dividers. The grid is implicit — no visible columns or gutters, content flows in max-width containers with generous margins. Navigation is reduced to name + time + email in the header and three text links in the footer.

## Similar Brands

- **Brittany Chiang** — Dark portfolio canvas with single accent color, all-caps section labels, generous vertical spacing, and minimal navigation reduced to name and contact
- **Rauno Freiberg** — Dark, near-black background with tight tracking, monospace metadata, and an editorial single-column scroll rhythm
- **Linear** — Same flat-on-black surface treatment with no shadows or gradients, and tight negative letter-spacing on small body text
- **Cobe (Pieter Levels)** — Personal portfolio with extreme whitespace, monospace timestamps, and text-only footer links without icons
