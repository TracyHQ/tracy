# Figma Config — Style Reference
> modernist poster on black velvet

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Figma Config operates in a stark typographic gallery mode: pure black canvas, one near-white text color, and a single ultra-tight custom sans-serif that does all the visual work. There is no decorative chrome, no soft cards, no color coding — hierarchy comes from scale jumps (16px to 80px) and extremely tight tracking, not from fills or elevation. Navigation is reduced to a logo and three ghost-bordered text links, and CTAs are inverted-outline buttons rather than filled pills, so the user feels they are walking through a modernist poster exhibit rather than using a product UI. The colored squares and abstract shapes that appear in error/empty states are event-specific illustration, not interface tokens — the system itself is almost entirely achromatic. Density is compact and edges are hard: borders are hairline, corners are sharp, and the only texture is the rhythm of oversized type sitting on void.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page canvas, all surface backgrounds |
| Chalk | `#e2e2e2` | Primary text, nav links, ghost-button borders, hairline rules, footer text — the only foreground color in the system |
| Graphite | `#3d3d3d` | Subtle button borders and secondary dividers that recede against the canvas |
| Paper | `#ffffff` | Inverted button surface (ghost buttons flipped to filled) and rare high-contrast accents |

## Typography

### figmaSans — The single typeface carrying every UI surface — body, nav, button, hero, footer. Only weight 400 is used; hierarchy is built through size alone, not weight contrast. The 80px display weight uses line-height 0.95, letting lines nearly touch — this near-zero leading is the signature move and only works because figmaSans is a custom geometric sans with no visible ascender/descender collision. Tight letter-spacing (-0.03em at display, -0.02em at body) tightens optical color across the page.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 16px, 18px, 20px, 32px, 80px
- **Line height:** 1.30 (16px), 1.25 (18px), 1.25 (20px), 1.10 (32px), 0.95 (80px)
- **Letter spacing:** -0.03em at 32–80px, -0.02em at 16–20px
- **OpenType features:** `"kern"`

### figmaMono — Sparingly used for inline button labels and icon-adjacent text where a monospaced voice is needed. Letter-spacing is normal — monospaced faces should not be artificially tracked.
- **Substitute:** IBM Plex Mono
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.30

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.3 | -0.32px |
| body | — | — | 18px | 1.25 | -0.36px |
| subheading | — | — | 20px | 1.25 | -0.4px |
| heading | — | — | 32px | 1.1 | -0.96px |
| display | — | — | 80px | 0.95 | -2.4px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 160px
- **Card padding:** 12px
- **Element gap:** 12px

### Border Radius

- **cards:** 0px
- **badges:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Ghost Navigation Button
**Role:** Top-bar CTA (e.g. REGISTER) in event header

Transparent background, 1px Chalk (#e2e2e2) border, figmaSans 16px/1.30, -0.02em tracking, Chalk text. Padding 12px top/bottom and left/right. No radius. The border is the button.

### Nav Text Link
**Role:** Plain text links in the header (SPEAKERS, FAQ)

No border, no background, figmaSans 16px/1.30 uppercase, Chalk color. Spacing 23px between links, 6px vertical padding inside the nav rail.

### Inverted CTA Button
**Role:** Primary action button (GO TO HOMEPAGE on the 404, main event CTAs)

Paper (#ffffff) background, Obsidian (#000000) text, figmaSans 16px/1.30. Padding 12px vertical, 12px horizontal. 0px radius. No shadow. The inversion against the black canvas makes the action the only filled object on the page.

### Logo Mark
**Role:** Brand identifier in the top-left

figmaSans 16px custom logotype 'config' in Chalk. Compact, sits at the same baseline as nav links. No icon mark — the wordmark is the logo.

### Error Headline
**Role:** Display-level copy on the 404 screen

figmaSans 80px / line-height 0.95 / -0.03em tracking, Chalk color. Up to three lines, left-aligned. The 0.95 line-height is the system signature — lines nearly overlap.

### Eyebrow Label
**Role:** Small uppercase label above a display headline (e.g. '404 error')

figmaSans 16px/1.30, Chalk, no weight change. Acts as a typographic stand-in for a section badge — there are no pill badges in this system.

### Cookie Consent Dialog
**Role:** Bottom-right overlay with policy text and two actions

Paper (#ffffff) background, Obsidian text, figmaSans 16px/1.30. Two stacked actions: 'ALLOW ALL COOKIES' as a filled Obsidian button with Chalk text (full-width, 0px radius, 12px padding), and 'DO NOT ALLOW COOKIES' as a text link. A small × close icon top-right.

### Page Footer Wordmark
**Role:** Oversized brand mark anchored to the page bottom

figmaSans 80px or larger, Chalk, leading cropped to the viewport — the letters bleed off the bottom edge of the screen as a deliberate poster-style motif.

### Section Spacer
**Role:** Vertical breathing rhythm between event content blocks

160px top and bottom padding on hero-level sections, 40px between stacked utility sections. Compact 12px gaps inside nav rails and button groups.

## Do's and Don'ts

### Do
- Use Obsidian (#000000) as the only canvas; every other color in the system is a foreground stroke or text against it
- Set body copy to figmaSans 18px/1.25 with -0.02em tracking; do not introduce a second weight
- Reserve 80px / line-height 0.95 for true display moments — one per screen maximum
- Build CTAs as ghost buttons (Chalk border, transparent fill) or inverted buttons (Paper fill, Obsidian text); never use a chromatic brand color for actions
- Keep all radii at 0px — the system has no rounded corners anywhere
- Use 160px vertical padding for hero sections and 40px for stacked utility rows
- Let large display type bleed off the viewport edge in the footer rather than constraining it to a safe area

### Don't
- Do not introduce a brand accent color into the UI — the event-illustration squares are decoration, not tokens
- Do not add card surfaces, drop shadows, or elevated panels; the canvas is flat
- Do not use a second type family for body copy; figmaMono only appears inline with buttons or icons
- Do not set line-height above 1.30 on body or above 1.10 on the 32px heading — loose leading breaks the poster feel
- Do not round button corners or add padding beyond 12px — the geometric rigor depends on tight, square elements
- Do not use color for state communication (hover, active, error); if a state is needed, swap the border between Chalk and Graphite
- Do not break tracking on the 80px display — -0.03em is what lets the headline read as a single block

## Elevation

The system is intentionally flat — no shadows, no glow, no elevation. Depth is implied by typographic scale and by the inversion of foreground/background (Paper surface on Obsidian canvas), never by z-axis effects. Any drop shadow would undermine the poster aesthetic.

## Surfaces

- **Canvas** (`#000000`) — Page background — the dominant surface across all screens
- **Inverted Card** (`#ffffff`) — Rare inverted surface for the cookie consent dialog; functions as a sheet lifted off the black canvas

## Imagery

Event illustration is the only imagery: large flat-colored geometric squares (green, cyan, orange, yellow) with white abstract shapes layered on top, used to fill negative space on error and empty states. The illustration is decorative atmosphere, not explanatory content — it never carries UI information. There is no photography, no product screenshots, no 3D. Iconography is absent; the wordmark and headline typography are the only graphics besides the event shapes.

## Layout

Max-width ~1200px centered, with display type and footer wordmarks allowed to bleed full-bleed past the container. The hero pattern on the 404 is a two-column split: left column holds the eyebrow, the 80px display headline (three lines, left-aligned), and a single inverted CTA; right column carries the event illustration block. Section rhythm is defined by 160px vertical padding between hero-level bands and 40px between stacked rows — no alternating light/dark bands because there is only one surface color. Navigation is a single fixed top bar: logo flush left, three text links flush right with 23px gaps, 6px vertical padding inside the rail, 12px horizontal padding on each link. The footer is a single oversized wordmark cropped against the bottom viewport edge. Density reads as compact because element gaps are 12px and text sits close to its containers, even though section gaps are very generous.

## Similar Brands

- **Apple Events** — Same poster-on-black visual logic — oversized display type, hard edges, zero chrome, and a single inverted CTA per screen
- **Linear changelog** — Pure-black canvas with near-white text, no card surfaces, and a single custom geometric sans doing all the work
- **Vercel marketing** — Dark-mode minimalism that lets oversized type and a single ghost/outline button carry the entire composition
- **Nothing.tech** — Brutalist wordmark treatment, flat surfaces, and dot-matrix-style small text labels on a black canvas
