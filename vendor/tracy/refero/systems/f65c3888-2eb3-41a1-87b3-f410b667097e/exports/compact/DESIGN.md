# Valo — Style Reference
> noir observatory at midnight — weight-300 typography floats on pure black while a single teal-violet gradient passes through like a laser line across the room.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Valo runs on a noir observatory aesthetic: deep-black canvas, a single custom serif-less voice at whisper weight (300), and one luminous blue-teal-violet gradient used as deliberate punctuation rather than decoration. Typography does the heavy lifting — 100px display headlines with tight negative tracking feel like illuminated ink on obsidian, while the rest of the interface stays nearly invisible. The gradient appears in exactly three roles: a single accent word inside a headline, a thin floating ring/torus visual, and a wash at the page foot — never as a button fill or panel background. Components are flat, hairline-bordered, and borderless where possible; interaction is signaled by circular arrow buttons and numbered sequencing, not by color or shadow. Every screen should feel like a page torn from a dark scientific monograph: quiet, confident, with one moment of light.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, hero background, all primary surface area. Sets the dark-stage tone for every screen |
| Bone | `#e5e7eb` | Hairline borders, dividers, and muted secondary text. The workhorse neutral that defines edges without adding visual weight |
| Paper | `#ffffff` | Primary headings, body text, nav links, and icon strokes. Maximum contrast against Void for clear information hierarchy |
| Graphite | `#4d4d4d` | Subtle nav borders and disabled/inactive state lines. Sits between Void and Bone for low-emphasis structural lines |
| Spectrum Wash | `linear-gradient(270deg, rgb(158, 61, 178), rgb(27, 102, 248), rgb(36, 218, 217), rgb(179, 198, 232))` | Hero accent gradient — applied to a single headline word and the floating torus visual. Cool blue midpoint of the signature violet→blue→teal→lavender ramp |
| Deep Field | `linear-gradient(90deg, rgb(30, 35, 60), rgb(10, 64, 153))` | Footer band gradient origin — near-black indigo transitioning into brand blue. Defines the bottom-of-page atmospheric shift |
| Atmospheric Fade | `linear-gradient(90deg, rgb(25, 81, 162), rgb(112, 218, 180))` | Secondary gradient — blue-to-mint wash used in supporting visuals and transitional bands. Cooler, more subdued than the hero spectrum |

## Typography

### Valo — Exclusive typeface across all UI: nav links, body copy, section labels, and display headlines. Weight 300 carries headlines and body — the anti-convention whisper-weight creates scientific authority through restraint. Weight 700 is reserved for micro-labels and the few moments that need to anchor a page. The custom cut of this single family is the brand voice.
- **Substitute:** Inter (for 400/700) paired with a thin display weight like Söhne Breit Halbfett or National 2 Thin for 300
- **Weights:** 300, 400, 700
- **Sizes:** 10, 13, 15, 18, 24, 30, 38, 60, 100
- **Line height:** 1.0–1.63 by role
- **Letter spacing:** -0.0270em, -0.0130em, 0.1000em
- **OpenType features:** `"clig" on, "liga" on, "ss03" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | 1px |
| body | — | — | 15px | 1.63 | — |
| subheading | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 24px | 1.33 | -0.31px |
| heading | — | — | 38px | 1.2 | -0.49px |
| heading-lg | — | — | 60px | 1.2 | -0.78px |
| display | — | — | 100px | 1 | -2.7px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 45px
- **Element gap:** 18-20px

### Border Radius

- **icons:** 9999px
- **links:** 9999px
- **buttons:** 9999px

## Components

### Top Navigation Bar
**Role:** Global site navigation anchored to top of every page

Horizontal bar on Void (#000000) background. Wordmark "Valo" at 24px weight 400 Paper (#ffffff) flush left. Nav items (Approach, Company, Partnership, News & Insights, Contact) right-aligned at 13px weight 400 Paper with 27px horizontal spacing. 7px top/bottom padding. No background fill, no border below — the negative space defines the bar.

### Hero Display Headline
**Role:** Opening page-level statement, left-aligned on dark canvas

100px Valo weight 300 Paper (#ffffff), line-height 1.0, letter-spacing -2.7px. The word "aha" is the only chromatic moment — rendered in the Spectrum Wash gradient (linear 270deg violet→blue→teal→lavender) as inline text. No background, no border. Sets the editorial tone.

### Hero Subhead Paragraph
**Role:** Supporting description under the display headline

15px Valo weight 400 Bone (#e5e7eb), line-height 1.63. Max-width constrained to align with headline measure. No label, no link, no decoration — the paragraph is the quiet second beat.

### Section Label Tag
**Role:** Micro-category label introducing each major content section

10px Valo weight 400 Paper (#ffffff), letter-spacing 1.0px (0.1em), uppercase. Sits above section content with 18px top padding. Functions as a typographic flag, not a button — no background, no border.

### Gradient Torus Visual
**Role:** Decorative conceptual illustration representing the feedback loop of drug discovery

Large thin-stroke ring (approximately 400px diameter) rendered with the Spectrum Wash gradient applied as a stroke. Floats on Void canvas to the left of paired content. The only saturated-color shape on the page — its presence is the page's focal anchor.

### Numbered Content Block
**Role:** Sequential feature/item layout with index number and description

Two-column structure. Left column: 13px Valo weight 400 Bone (#e5e7eb) numeral ("01", "02") at 0.1em tracking. Right column: 18px Valo weight 700 Paper subheading, followed by 15px weight 400 Bone body at line-height 1.63. 14px gap between subheading and body. 23px vertical gap between numbered items.

### Circle Arrow Link Button
**Role:** Inline call-to-action for secondary navigation ("Explore our approach", "Join our team")

48px circular button (9999px radius) with 1px Bone (#e5e7eb) border on Void background. White right-arrow icon (→) centered inside. Paired with a 18px Valo weight 400 Paper text link to its right with 20px gap. The circle is the system's only geometric interaction primitive — used wherever a click is invited.

### Content Section Heading
**Role:** Mid-page section title introducing a new content block

38px Valo weight 300 Paper (#ffffff), line-height 1.2, letter-spacing -0.49px. Left-aligned, sits 36-45px below the preceding section. No underline, no background — weight 300 is the only emphasis needed.

### Gradient Footer Band
**Role:** Atmospheric closing zone with site links and copyright

Full-bleed band with the Atmospheric Fade gradient (linear 90deg #1951a2 → #70dab4) transitioning into the Spectrum Wash tones. Contains the Valo wordmark (24px Paper, left) and a row of footer links (13px Paper, right) at 20px gaps: Privacy Policy, Terms & Conditions, Cookie Consent, Preferences, Twitter, LinkedIn, © line. No top or bottom border — the gradient itself defines the zone.

### Hairline Section Divider
**Role:** Vertical separation between content sections

1px solid Bone (#e5e7eb) line, full content-width. No other styling. Used sparingly — most sections breathe on whitespace alone.

## Do's and Don'ts

### Do
- Set all display and body text in Valo weight 300 — the whisper-weight is the brand voice, not a fallback
- Apply the Spectrum Wash gradient to exactly one word per headline maximum — chromatic type is punctuation, not paint
- Use 9999px radius for every interactive element (buttons, link icons, tags) — circles are the only geometric interaction shape in the system
- Set display headlines at -2.7px letter-spacing (100px) and -0.78px (60px) — the negative tracking tightens large type to feel carved rather than typed
- Use 0.1em letter-spacing on all small-caps labels, nav items, and numbered prefixes — the wide tracking signals scientific precision
- Anchor every section with the uppercase Section Label Tag at 10px — the typographic flag gives pages a magazine-like structure
- Use the 01, 02 numbered pattern for sequential content blocks — sequencing reads as methodical, fitting the discovery narrative

### Don't
- Don't use weight 700 for body copy or long-form paragraphs — the voice is light; 700 belongs to subheadings and micro-labels only
- Don't apply the Spectrum Wash gradient to button backgrounds, panel fills, or large-area surfaces — it belongs on text accents, ring strokes, and the footer band only
- Don't introduce card surfaces, drop shadows, or elevated panels — the canvas stays flat; depth comes from type scale, not from z-axis
- Don't use borders thicker than 1px — the entire system runs on hairlines (Bone at 1px); anything heavier breaks the editorial register
- Don't add a chromatic brand color outside the violet→blue→teal→lavender ramp — the system is intentionally near-monochrome with one gradient family
- Don't center body text or multi-line content — the layout is left-aligned and the measure should align with the headline edge
- Don't use stock photography, emoji, or decorative illustration — visuals are limited to the gradient torus and the footer wash; everything else is type and whitespace

## Elevation

This system intentionally avoids shadows and elevation. Depth is communicated through type scale and whitespace, not z-axis layering. The only layered surface is the gradient footer band, which acts as a horizon line rather than an elevated card. No box-shadows, no blur, no glow.

## Surfaces

- **Void Canvas** (`#000000`) — Full-bleed page background — the dominant surface for hero, content, and mid-page sections.
- **Gradient Footer Band** (`#1b66f8`) — Atmospheric full-width wash at the page foot, blending teal, blue, and violet to close the visual story.

## Imagery

Imagery is minimal and geometric: a single large gradient-stroke torus/ring floats on the hero of feature sections, and a full-bleed gradient band closes the page. No photography, no illustration beyond the ring, no product screenshots. The gradient itself is the visual content — a teal-to-blue-to-violet-to-lavender sweep used as both text fill (on one headline word) and as a thin stroke (on the ring). Iconography is restricted to a single white right-arrow glyph inside circular buttons. Every other visual element is type, hairline, or empty canvas.

## Layout

Max-width 1200px centered content column on a full-bleed #000000 canvas. Hero is left-aligned: large display headline (100px) over a 15px subhead paragraph, all flush to the content column's left edge with generous left padding. Below the hero, sections alternate between text-only blocks and paired text+visual layouts — the gradient torus sits to the left of a two-column content block containing subheading, numbered items, and a circle-arrow link. Section rhythm is set by 45px+ vertical gaps and the occasional hairline divider; no banding colors, no card grids. Navigation is a single top bar with logo left and links right. The page closes with a full-bleed gradient footer band containing footer links — the only moment the canvas shifts from pure black to color.

## Similar Brands

- **Linear** — Same dark-canvas + weight-light typography + single-hue accent restraint — Linear's dark mode uses one purple accent against near-black surfaces with whisper-weight display type
- **Vercel** — Identical minimalist dark aesthetic with a single chromatic gradient moment, ultra-thin display headlines, and the same flat-no-elevation philosophy
- **Arc Browser** — Editorial dark-mode sensibility with oversized display type set tight, generous negative space, and circular interaction primitives
- **Recursion** — Fellow AI-bio company with a comparable scientific-monograph-on-black visual register — large light-weight type, restrained color, and torus/loop motifs in hero illustrations
- **SpaceX** — Shares the deep-black canvas, sparse whitespace, and weight-300-400 display typography that reads as engineering-precise rather than marketing-loud
