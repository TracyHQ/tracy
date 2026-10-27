# GUSTAVO Faria © — Style Reference
> Editorial monograph on white paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Gustavo Faria's portfolio operates as a printed monograph on white paper: an editorial spread where one massive serif date range dominates the right column while a compact bio and portrait anchor the left. The system is almost aggressively monochrome — four grays/black on white, no decorative color, no shadows, no rounded corners. Typography does all the heavy lifting: a custom display serif at 125-142px creates scale contrast against 16px system body text, and negative letter-spacing tightens the display letters into a single confident statement. Content is organized as a work selection table — project name, category, year — separated by hairline rules. The atmosphere is that of an art director's contact sheet: restrained, intentional, every element earning its space.

## Colors

| Name | Value | Role |
|------|-------|------|
| Paper White | `#ffffff` | Page canvas, card surfaces — the foundational surface on which all content sits |
| Charcoal | `#282828` | Primary text, hairline borders, structural rules — softer than pure black, reduces glare for long reading |
| Ink Black | `#000000` | Display text fill, link borders, maximum contrast elements |
| Ash Gray | `#dcdcdc` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Flesh Peach | `#efc4b2` | Warm surface wash behind portrait and select portfolio imagery — the only chromatic surface, used sparingly as atmospheric punctuation |

## Typography

### -apple-system — Body text, navigation, bio description, and work list content — system font chosen for zero-loading neutrality, letting the custom display serif own the page's identity. The system choice is deliberate: it disappears so the display type can speak.
- **Substitute:** SF Pro Text or system-ui
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.00
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### custom_21879 / custom_49610 — Display serif used for the signature '2019 — 2025' hero statement at 125-142px with weight 400 and tight negative tracking; the 12px instance serves as small-caps section labels. The extreme size jump from 12px to 125px creates the page's defining scale contrast. Substitute: GT Sectra, Editorial New, or Tobias for similar editorial character.
- **Substitute:** GT Sectra or Editorial New
- **Weights:** 400, 700
- **Sizes:** 12px, 125px, 142px
- **Line height:** 0.81, 1.00, 1.02, 1.17, 1.67
- **Letter spacing:** -0.047em (-6.7px at 142px)
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### custom_49610 — custom_49610 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 125px
- **Line height:** 1.02
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.67 | -0.56px |
| body | — | — | 16px | 1.17 | — |
| display-lg | — | — | 125px | 1.02 | — |
| display | — | — | 142px | 0.81 | -6.67px |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Section gap:** 48-64px
- **Card padding:** 0px
- **Element gap:** 8px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Display Headline
**Role:** Hero-level typographic statement

Massive custom serif at 125-142px, weight 400, letter-spacing -0.047em, color #000000. Line-height 0.81-1.02 creates tight vertical rhythm. No background, no border — pure typographic presence. Used for date ranges and title statements that anchor a page.

### Work List Row
**Role:** Project entry in work selection

Three-column row: project name (left, bold weight 700, #282828), category (center, weight 400, #282828 or #dcdcdc), year (right, weight 400, #dcdcdc). Separated by 1px solid bottom border in #dcdcdc. Padding 12-16px vertical. No hover state, no background change.

### Bio Block
**Role:** Personal introduction

Small body text block in -apple-system 16px, color #282828. Includes name as bold/link, age, location, and current work. Left-aligned in sidebar column. No background or border — sits directly on canvas.

### Hairline Divider
**Role:** Structural separator between sections

1px solid line, #dcdcdc or #282828. Full-width or column-width. The only structural element separating work list rows and page sections.

### Portrait Card
**Role:** Personal image with hover label

Square image container, 0px radius, on #efc4b2 background. Small '(+)' or '(Hover Here)' label overlaid at center in -apple-system 12px, #282828. No shadow, no border.

### Navigation Link
**Role:** Top-level navigation item

Plain text link in -apple-system 16px, weight 400, color #282828. 1px solid #282828 bottom border on active/hover. No padding, no background. Sits inline with other nav items with horizontal gap.

### Section Label
**Role:** Small heading for content groups

Uppercase or sentence-case label in -apple-system 12px, weight 400, color #dcdcdc. Marks sections like 'Work Selection' — intentionally muted to recede against project names.

### Brand Mark
**Role:** Identity lockup in header

'GUSTAVO Faria ©' in -apple-system 16px, weight 700, color #282828. Mixed case with capital first letter and lowercase. Sits at top-left as the page's identity anchor.

### Portfolio Thumbnail
**Role:** Preview image of work piece

Full-width or half-width image, 0px radius, no border, no shadow. May have a colored background (peach, green gradient) visible as part of the artwork itself. No caption or overlay chrome.

## Do's and Don'ts

### Do
- Use the custom display serif at 125-142px for hero statements with letter-spacing -0.047em
- Separate work list rows with 1px solid #dcdcdc bottom borders
- Set all text in #282828 on #ffffff — avoid pure #000000 for body text to reduce eye strain
- Maintain 0px border-radius on all elements — this is a flat, print-inspired system
- Use -apple-system for all UI and body text; the system font should disappear so the display serif owns the page
- Use #efc4b2 as the only chromatic surface, and only behind imagery — never as a UI background
- Anchor pages with a single massive display headline; let everything else stay small and quiet

### Don't
- Don't add shadows, gradients, or elevation effects — the design is intentionally flat
- Don't introduce accent colors, hover states with background fills, or decorative gradients
- Don't use border-radius greater than 0px — sharp corners are core to the editorial identity
- Don't mix the display serif into body text or UI labels — it belongs only at hero scale
- Don't use bold or heavy weights for body text — the 400 weight system font should stay calm
- Don't crowd the layout with multiple visual elements per section — let whitespace and scale do the work
- Don't use #000000 for borders or secondary text — reserve it for display text and high-contrast moments only

## Elevation

No shadows, no depth. The design is completely flat — separation between elements is achieved through whitespace, hairline borders, and scale contrast rather than elevation. This is a print-design sensibility applied to the web: elements sit on the same plane, divided by rules.

## Surfaces

- **Paper Canvas** (`#ffffff`) — Primary page background
- **Flesh Surface** (`#efc4b2`) — Warm atmospheric wash behind portrait imagery

## Imagery

Photography dominates: a single square portrait with a warm peach background anchors the left sidebar, and portfolio thumbnails appear as rectangular or square crops with their own contextual backgrounds (peach tones, green gradients). Images are sharp-edged with 0px radius, no overlays, no masks. The portrait is the only photographic element with a visible label ('(+) Hover Here'). Portfolio thumbnails may include typography or graphic elements as part of the artwork itself. No illustrations, no icons, no 3D renders — imagery is documentary and personal, treated as printed plates.

## Layout

Two-column asymmetric layout: a narrow left sidebar (roughly 25% width) holds the bio, portrait, and identity mark; the right column (roughly 75%) holds the massive display headline and the work selection list. The hero '2019 — 2025' headline spans the full width of the right column at ~140px. Below it, the work selection is a full-width three-column table (project | category | year) with hairline dividers. The page flows vertically as a single long scroll with no section breaks beyond the work list rows. Navigation sits inline at the top-left. The overall rhythm is: compact sidebar → massive typographic statement → dense list of work entries. Max-width is effectively full-bleed, with padding from viewport edges only.

## Similar Brands

- **Pentagram partner portfolios** — Same editorial-monograph approach: massive display type anchoring sparse layouts, monochrome palette, work presented as a structured list with hairline dividers
- **Mark Owens (markowens.id)** — Identical 'designer contact sheet' aesthetic — custom display serif, white canvas, no decorative elements, content organized as typographic list with project/category/year columns
- **Bureau Cool** — Shared restraint: custom display serif hero, monochrome interface, work entries as text rows with minimal chrome, 0px radius throughout
- **Studio Dumbar** — Editorial portfolio structure with oversized display type, flat surfaces, and work presented as a typographic index rather than a visual gallery
