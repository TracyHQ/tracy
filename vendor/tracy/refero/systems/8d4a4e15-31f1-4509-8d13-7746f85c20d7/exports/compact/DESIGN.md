# Rows — Style Reference
> blank spreadsheet at dawn — calm, precise, one warm spark on cold white

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Rows presents a near-monochrome workspace where black type on a vast white canvas does almost all the work, and a single warm marigold accent (used once per screen, never as fill) signals where attention belongs. The interface feels like a spreadsheet that learned to be a product: tabular density, hairline dividers, compact 8px gaps, and typographic restraint rather than chrome to organize information. Components are nearly borderless — the visual structure comes from whitespace, alignment, and the occasional thin 1px rule. Color never decorates; it only points. The single gradient (coral to marigold) exists as a brand mark, not as surface treatment.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink | `#1a1a1a` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Paper | `#ffffff` | Page canvas, card surfaces, button text on dark fills |
| Mist | `#f7f7f7` | Subtle surface lift for inset panels, hover states, secondary card backgrounds |
| Ash | `#eaeaea` | Hairline borders, dividers, tag outlines, input default border |
| Smoke | `#e1e1e1` | Table row dividers, secondary borders, icon outlines in inactive state |
| Graphite | `#838383` | Tertiary text, placeholder copy, disabled icon color |
| Steel | `#989898` | Secondary text, helper labels, subdued metadata |
| Slate | `#6f6f6f` | Body text secondary, link text in resting state, breadcrumb text |
| Marigold | `#ffb84d` | Accent stroke on the primary input — a single warm spark that signals focus, never fills a surface |
| Buttercream | `#ffe480` | Yellow supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Cream | `#fff6d4` | Very pale accent wash for soft highlight backgrounds behind marigold borders |

## Typography

### Output Sans — Single-family type system: 24px/700 for the page heading, 18px/400 for the hero greeting and primary links, 14px/400–700 for body, controls, and template labels, 10px/400 for micro-labels and column headers. The tight negative tracking at 18–24px (-0.043em) tightens the headline and greeting into a compact, spreadsheet-like block, while positive tracking on 10–14px caps and labels adds quiet authority to tiny type.
- **Substitute:** Inter
- **Weights:** 400, 700
- **Sizes:** 10, 14, 18, 24
- **Line height:** 1.00–1.45
- **Letter spacing:** −0.043em at 24px; +0.008–0.021em at 10–14px
- **OpenType features:** `"tnum" on, "ss01" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1 | 0.21px |
| heading-sm | — | — | 18px | 1.45 | -0.774px |
| heading | — | — | 24px | 1 | -1.032px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1080px
- **Section gap:** 48-64px
- **Card padding:** 16-24px
- **Element gap:** 8px

### Border Radius

- **tags:** 4px
- **cards:** 8px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Top Bar
**Role:** Minimal app chrome

Full-bleed white bar, 1px Ash (#eaeaea) bottom border. Left: small workspace name at 14px/700 Ink with a subtle back chevron icon. Right: 'Log in' as 14px/400 Steel ghost text and 'Free sign up' as 14px/400 Ink inside a 1px Ink border, 4px radius, 6px vertical / 12px horizontal padding. No shadow, no fill on the bar itself.

### Primary Input
**Role:** Prompt field

Full-width within content column (max ~960px), 1px Marigold (#ffb84d) border, 4px radius, generous vertical padding (16–20px). Placeholder text 18px/400 in Graphite. A trailing action cluster on the right (send/attach icons at 18px Slate). On hover, border stays marigold; on focus, a 1px cream (#fff6d4) glow halo. This is the only chromatic border on the screen.

### Template Grid
**Role:** Discovery surface

4-column grid with 24px column gap, 8px row gap. Each cell is a clickable row, not a card: no border, no fill, no radius. The structure is implied by alignment alone. Column headers ('Import', 'Marketing Dashboard', etc.) at 10px/700 Graphite, positively tracked, uppercase-style restraint.

### Template Item
**Role:** Template entry

Single horizontal row: 6px colored dot (category color) + 14px/400 Ink label, 8px gap between dot and text, 12px vertical padding. No hover state beyond subtle text color shift to Ink-from-Slate. No background, no underline, no card chrome.

### Category Color Dots
**Role:** Template iconography

6px solid circles in muted category colors (soft pink, sky blue, mint, amber, violet). They are the ONLY chromatic elements across the entire grid — a quiet, functional wayfinding system that avoids icon complexity.

### Ghost Link Button
**Role:** Inline action

14px/400 Slate text with trailing arrow glyph (→), no border, no fill. On hover, text shifts to Ink. Used for 'Start from blank →' and similar low-emphasis actions.

### Outlined Button
**Role:** Secondary action

1px Ink border, 4px radius, 6px vertical / 12px horizontal padding, 14px/400 Ink text. No fill in resting state. Used for 'Free sign up' in the top bar.

### Filled Button
**Role:** Primary action

Ink (#1a1a1a) background, Paper (#ffffff) text, 14px/700, 4px radius, 8–10px vertical / 16–20px horizontal padding. Reserved for the most important single action on a screen. No shadow, no gradient fill.

### Footer Link
**Role:** Minimal footer

Centered row at the bottom of the canvas, 14px/400 Slate text links separated by 16–24px gap. No border, no fill, no logo lockup — just text on white.

## Do's and Don'ts

### Do
- Use Ink (#1a1a1a) for all primary text and filled button backgrounds; never substitute a lighter gray for emphasis.
- Reserve Marigold (#ffb84d) for the single most important interactive border per screen — the prompt input or one focused control — and never use it as a fill.
- Use 4px radius for buttons and inputs, 8px for cards; never exceed 8px or reach for pill shapes.
- Use Output Sans at 24px/700 with -0.043em tracking for the page heading and 18px/400 with the same negative tracking for the hero greeting; this negative spacing at large sizes is the signature.
- Separate template/entry items with whitespace and 8px row gaps — no borders, no card backgrounds, no hover fills beyond a subtle Ink color shift.
- Use the 6px colored dot convention for categorical iconography instead of full icons when the label is already present.
- Anchor all micro-labels (column headers, tags) at 10px/700 with +0.021em positive tracking to create the spreadsheet-like precision.

### Don't
- Don't introduce any chromatic fill color on buttons, cards, or surfaces — color belongs on borders and dots only.
- Don't add box-shadows or elevation to cards or inputs; the design is flat and relies on 1px borders.
- Don't use letter-spacing of 0 or positive values on headings 18px and above — the negative tracking is non-negotiable.
- Don't use more than one marigold element per viewport; its power comes from scarcity.
- Don't use a system font fallback that changes the geometric proportions; Output Sans / Inter are the only acceptable families.
- Don't wrap template items in bordered or filled cards — the grid is defined by alignment, not containers.
- Don't use the coral-to-marigold gradient as a background or button fill; it is a brand mark only, never a surface.

## Elevation

No shadows. The design is intentionally flat: all spatial hierarchy comes from 1px hairline borders in Ash (#eaeaea) and Smoke (#e1e1e1), and from generous whitespace. Elevation is conveyed by Ink fill, not by drop shadow.

## Surfaces

- **Paper** (`#ffffff`) — Page canvas — the dominant surface, occupying 80%+ of the viewport
- **Mist** (`#f7f7f7`) — Subtle inset panels and secondary card backgrounds for low-elevation distinction
- **Cream** (`#fff6d4`) — Accent wash behind the marigold-bordered input or highlighted selection

## Imagery

No photography, no illustration, no product screenshots. The visual language is pure UI: type, dots, lines, and one bordered input. When visuals are needed, they appear as the 6px colored category dots — flat, solid, never gradient or photographic. Density is overwhelmingly text-dominant.

## Layout

Centered, max-width ~1080px content column on a full-bleed white canvas. Hero is a vertically stacked composition: small top bar, then ~15% vertical breathing room, then a single-line 24px heading, then the full-width marigold-bordered prompt input, then a 4-column template grid with 24px column gaps, then a right-aligned 'Start from blank →' link, then deep white space, then a centered two-link footer. No sidebar, no mega-menu, no sticky elements beyond the top bar. Navigation is minimal — a back chevron and a workspace name on the left, two text-level actions on the right.

## Similar Brands

- **Linear** — Same extreme monochrome discipline with a single accent color, compact 14px type, and 4–8px radii on a flat, shadowless surface
- **Notion** — Same near-grayscale palette, hairline Ash borders, text-dominant layouts, and the feeling of a document/workspace rather than a marketing site
- **Causal** — Same spreadsheet-adjacent minimalism: white canvas, tiny colored dots for category iconography, typographic restraint over chrome
- **Vercel** — Same flat hierarchy with no shadows, 4–8px radii, and a single warm accent used sparingly for focus indication
