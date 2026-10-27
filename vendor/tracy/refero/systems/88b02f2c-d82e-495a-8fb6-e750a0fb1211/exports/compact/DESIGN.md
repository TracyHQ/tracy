# Secure and powerful crypto wallet | Ctrl Wallet — Style Reference
> sticker-bombed white lab — confetti cards on surgical chrome

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ctrl uses a stark-white-canvas minimalism interrupted by playful chromatic confetti — a near-monochrome chrome where black type and thin borders do the structural work, and saturated yellow, pink, blue, and green cards scatter across the layout like sticky notes. The single functional color is vivid green (#05c92f), reserved for the download/CTA pill that anchors every screen. Typography is a single custom grotesque (Tomato Grotesk) deployed at extreme display sizes with aggressive tight leading (0.77–0.90), making headlines feel architectural rather than typographic. Components are flat, border-driven, and generously rounded — pill buttons, soft-cornered cards at 17.5px, and larger 35–52px radii on interactive elements. The system avoids elevation entirely; hierarchy comes from size, weight, and chromatic contrast, not shadow depth.

## Colors

| Name | Value | Role |
|------|-------|------|
| Acid Lime | `#05c92f` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Sticker Yellow | `#fcea59` | Decorative accent card backgrounds, icon fills, confetti highlights on hero and feature spreads |
| Cotton Pink | `#ffd0e2` | Decorative accent card backgrounds, soft chromatic punctuation on feature layouts |
| Powder Blue | `#a7cbf6` | Decorative accent card backgrounds, informational callout surfaces |
| Obsidian | `#000000` | Primary text, primary icon strokes, hairline borders, filled download button in nav |
| Carbon | `#0f0f0f` | Secondary dark surface, button borders, card borders, strong interactive strokes |
| Ash Gray | `#5a585a` | Muted body text, link borders, nav sublabels, secondary icon strokes |
| Slate Gray | `#6e726e` | Helper text, low-emphasis borders, tertiary metadata |
| Paper White | `#f9faf9` | Page canvas, primary background, FAQ item surfaces |
| Pure White | `#ffffff` | Card surfaces, input fields, elevated content panels |
| Bone | `#ecefec` | Nav pill background, FAQ accordion rows, soft card surfaces, muted chips |
| Plaster | `#eeeeee` | Input field backgrounds, subtle disabled surfaces |

## Typography

### Tomato Grotesk — The single typeface carrying the entire brand — a custom geometric grotesque deployed at extreme display sizes (up to 176px) with aggressively tight leading (0.77–0.80) that makes headlines feel like architectural cutouts rather than composed type. Weight 600 at display, 500 at body and UI. The tight line-height at hero scale is the signature: it stacks 'Take' and 'Ctrl.' into a single visual block.
- **Substitute:** Inter Tight, Manrope, Space Grotesk
- **Weights:** 500, 600
- **Sizes:** 11, 13, 14, 18, 21, 25, 26, 28, 32, 35, 53, 70, 84, 105, 153, 158, 176
- **Line height:** 0.77–0.90 for display (70–176px), 1.0–1.13 for subheadings (25–53px), 1.25–1.50 for body
- **Letter spacing:** normal at all sizes — tracking stays default, the visual tightness comes from line-height compression, not negative tracking

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | — |
| body-lg | — | — | 18px | 1.5 | — |
| subheading | — | — | 25px | 1.13 | — |
| heading-sm | — | — | 35px | 1.06 | — |
| heading | — | — | 53px | 1.02 | — |
| heading-lg | — | — | 84px | 0.9 | — |
| display | — | — | 153px | 0.8 | — |
| display-xl | — | — | 176px | 0.77 | — |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 26px
- **Element gap:** 18px

### Border Radius

- **nav:** 9px
- **tags:** 14px
- **cards:** 17.5px
- **inputs:** 35px
- **buttons:** 35px
- **largeElements:** 53px

## Components

### Green Download Pill
**Role:** Primary action CTA

Vivid green (#05c92f) pill with white text, 35px border-radius, 18px vertical padding, ~26px horizontal padding. Contains a small Chrome dots icon (three overlapping circles in cyan/yellow/red or brand colors) followed by 'Download for Chrome' label in Tomato Grotesk 500 at 14–18px. This is the only filled chromatic button in the system — every other CTA is black or ghost.

### Black Nav Download Button
**Role:** Secondary action CTA in navigation

Solid black (#0f0f0f) pill, 35px radius, white text at 14px weight 500, 14px vertical / 18px horizontal padding. Sits in the top-right of the header. Lighter weight than the green pill — use as a supporting action when green is already present on the page.

### Ghost Nav Pill
**Role:** Navigation container with secondary links

Bone-colored (#ecefec) rounded container, ~9px radius, 18px vertical / 18px+ horizontal padding, holding the $CTRL | Support | Security | Resources links separated by thin vertical dividers in #0f0f0f. Links are 13–14px Tomato Grotesk 500 in #0f0f0f.

### Confetti Accent Card
**Role:** Decorative feature cards with chromatic fills

Solid-fill cards in Sticker Yellow (#fcea59), Cotton Pink (#ffd0e2), or Powder Blue (#a7cbf6), 17.5px border-radius, 26px padding. Contains short headline at 18–25px weight 500 in #0f0f0f and a small pill tag (e.g. 'Simple') at 11–13px. These cards scatter across feature sections to inject color into the monochrome system — never use more than 3 chromatic cards per visual field.

### FAQ Accordion Row
**Role:** Expandable FAQ item

Bone (#ecefec) background, 17.5px border-radius, 26px vertical padding, question text at 18px weight 500 in #0f0f0f on the left, circular plus icon (1px border, 24px) on the right. Rows stack with 4–8px gaps. Expand reveals additional padding and answer text in #5a585a.

### Display Headline
**Role:** Hero and section title text

Tomato Grotesk 600 at 153–176px, line-height 0.77–0.80, #0f0f0f or #000000. The extreme line-height compression makes multi-word titles feel like a single visual mass. Always centered or left-aligned — never justified.

### Section Eyebrow
**Role:** Small text above display headlines

Tomato Grotesk 500 at 14–18px, #0f0f0f or #5a585a, centered above display headlines (e.g. 'One wallet for all your crypto' above 'Take Ctrl.'). Provides tonal context for the massive headline below.

### Social Auth Icon Cluster
**Role:** OAuth provider buttons

Three small circular icons (Google G, Facebook f, Apple logo) at ~28–35px, each in a soft pastel circle (blue, yellow, green tints) with the brand glyph centered. Arranged horizontally in a row on the social login card.

### Phone Mockup Container
**Role:** Product preview frame

Tall rectangular device frame (phone aspect ratio) with a white interior displaying the app UI, surrounded by scattered confetti accent elements (yellow, pink, blue chips with playful text). The frame itself has a 1px #0f0f0f border and ~17.5px radius.

### Chrome Dots Icon
**Role:** Browser/extension indicator

Three small overlapping circles in a row (typically green, yellow, red or brand-colored), 12–16px diameter each, used inline before download labels. A signature mark of the Ctrl brand — identifies Chrome extension downloads.

### Plus Toggle Icon
**Role:** Expand/collapse indicator for accordions

Circular button, 1px #0f0f0f border, ~24px diameter, containing a thin plus glyph. Used on FAQ rows and any collapsible content. No fill — purely outline.

## Do's and Don'ts

### Do
- Use #05c92f (Acid Lime) exclusively for the primary download/CTA pill — it is the only chromatic action color in the system
- Set display headlines at 153–176px with line-height 0.77–0.80 to achieve the architectural cutout effect
- Use 17.5px radius for cards and 35px radius for buttons/inputs — this two-tier rounding is the system's structural signature
- Communicate elevation through surface color shifts (#f9faf9 → #ffffff → #ecefec) and 1px borders, never through drop shadows
- Scatter chromatic confetti cards (yellow, pink, blue) across feature sections to inject energy into the monochrome canvas — limit to 2–3 per visual field
- Keep all body and UI text at weight 500, all display text at weight 600 — do not introduce weight 400 or 700
- Use Tomato Grotesk as the sole typeface; never pair it with a second font family

### Don't
- Do not use drop shadows, glows, or blur effects — the system is intentionally flat and border-driven
- Do not use more than one chromatic accent card color in a single visual grouping — the confetti effect requires spacing between colors
- Do not set display text with line-height above 0.90 — the tight compression is what makes the headlines feel monumental
- Do not introduce a second action color for secondary CTAs — use black-filled or ghost buttons instead of more chromatic pills
- Do not use sharp corners (0px radius) on any interactive element — minimum 9px on nav, 17.5px on cards, 35px on buttons
- Do not pair the green CTA with another green element on the same screen — it must remain the single chromatic focal point
- Do not use #000000 and #0f0f0f interchangeably — reserve #0f0f0f for borders and dark surfaces, #000000 for primary text and nav

## Elevation

This system deliberately avoids box-shadows. Elevation is communicated through surface color shifts (canvas #f9faf9 → card #ffffff → bone #ecefec) and thin 1–2px borders in #0f0f0f or #5a585a. The flat, border-driven approach keeps the interface feeling graphic and print-like, like stickers laid on paper. Do not introduce drop shadows, glows, or blur effects — they would break the sticker/collage language.

## Surfaces

- **Canvas** (`#f9faf9`) — Page background — warm off-white that softens the stark contrast of pure white
- **Card** (`#ffffff`) — Content cards, feature panels, and elevated content blocks
- **Bone Surface** (`#ecefec`) — Nav pill, FAQ accordion rows, muted interactive surfaces
- **Input** (`#eeeeee`) — Form field backgrounds, disabled states

## Imagery

Product screenshots presented inside phone mockup frames with scattered chromatic confetti elements (sticker-like chips in yellow, pink, blue with short playful text) arranged around the device. No lifestyle photography, no human imagery. The visual language is sticker-bomb/collage — colorful paper-like accent pieces overlapping and floating around clean product frames on a white canvas. Icons are line-based, 1–1.5px stroke, monochrome (#0f0f0f) unless functioning as the confetti palette. The aesthetic reads as 'designer's moodboard' — curated chaos around a single clean product reveal.

## Layout

Full-width sections with max-width ~1200px centered content. Hero is centered: eyebrow text → massive display headline → green CTA pill, all stacked vertically with generous vertical breathing room. Feature sections alternate between left-text/right-visual and centered compositions. FAQ section is left-aligned with a centered eyebrow above the display heading. Navigation is a top bar with logo left, nav pill centered, download button right. Vertical rhythm uses 80px section gaps; cards within sections use 26px padding. The overall feel is spacious but compact in type — wide whitespace surrounding dense, tightly-led text blocks.

## Similar Brands

- **Phantom Wallet** — Same playful confetti-card aesthetic on a white canvas with a single vivid accent color driving the primary CTA, and similar pill-shaped download buttons
- **Rainbow Wallet** — Shared sticker-like chromatic accent cards scattered across a clean white layout, with oversized compressed headlines as the hero focal point
- **Notion** — Same warm off-white canvas (#f9faf9) and border-driven flat component style with no drop shadows, relying on surface color shifts for hierarchy
- **Linear** — Identical single-typeface discipline (one custom grotesque at weight 500/600), tight line-heights on display text, and pill-shaped navigation containers
- **Trust Wallet** — Similar crypto-wallet product page structure with centered hero, single-color download CTA pill, and monochrome chrome punctuated by a functional accent
