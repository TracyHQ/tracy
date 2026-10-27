# Anthropic — Style Reference
> scientific field journal on warm parchment — quiet ivory surfaces, editorial serif headlines, and a single clay accent that only appears when you must act

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Anthropic's interface reads like a curated research publication on warm parchment paper. Ivory and oat neutrals replace the typical cool-gray tech palette, giving every surface a paper-like quality that pairs with a custom serif used at unprecedented scale for both body and display text. A single clay-toned accent surfaces only at moments of action; everything else stays quiet and editorial. Components are flat — hairline borders and selective bottom-corner radii replace shadows as the elevation language, sans-serif handles UI chrome, and the serif carries voice.

## Colors

| Name | Value | Role |
|------|-------|------|
| Slate Dark | `#141413` | Primary text, headings, footer background, hairline borders — near-black with a hint of warmth, never pure black |
| Ivory Medium | `#f0eee6` | Page canvas and large surface fills — the parchment background that sets the entire warm tone |
| Ivory Light | `#faf9f5` | Card surfaces, elevated panels, skip-link buttons — one step brighter than canvas for subtle layering without shadows |
| Cloud Medium | `#b0aea5` | Muted helper text, inactive nav items, secondary labels — the neutral that recedes without disappearing |
| Cloud Dark | `#87867f` | Outlined button borders, mid-contrast dividers |
| Stone | `#cccbc8` | Hairline borders and dividers between sections — visible but never assertive |
| Slate Medium | `#3d3d3a` | Dark-on-dark borders inside the footer |
| Oat Warm | `#e3dacc` | Secondary warm surface for grouped panels and feature containers — a deeper paper tone for variety |
| Manilla | `#f5e3c7` | Featured hero card background — vintage paper tone that signals editorial importance without color shouting |
| Clay | `#d97757` | Filled CTA buttons (e.g. cookie consent accept) — the single chromatic accent in the system, a terracotta warmth that belongs to the earth-tone family rather than typical UI blue |
| Clay Deep | `#c6613f` | Hover/pressed state for Clay CTAs and the canonical accent token — deeper version of the primary accent |

## Typography

### Anthropic Serif — Editorial voice — used for the display heading at 68px, all body copy at 20px, card titles, and supporting paragraphs. The serif carries personality; its presence in body text (unusual for tech sites) signals research-publication DNA. Weight 400 is default, 600 for emphasis.
- **Substitute:** Georgia, Source Serif Pro, Charter
- **Weights:** 400, 600
- **Sizes:** 14px, 18px, 20px, 24px, 68px
- **Line height:** 1.10, 1.40, 1.43
- **Letter spacing:** normal

### Anthropic Sans — UI chrome and display sans — nav links, buttons, footers, badges, and the bold sans display heading at 61px weight 700. The 61px sans display sits beside the 68px serif display as a deliberate dual-system: sans shouts declarative statements, serif reads as editorial essay.
- **Substitute:** Inter, system-ui, Arial
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 15px, 16px, 20px, 24px, 61px
- **Line height:** 1.00, 1.10, 1.25, 1.30, 1.40
- **Letter spacing:** -0.0200em at 12px (tight nav/caption tracking), -0.0050em at 15-16px (subtle UI tightening), -0.0020em at larger sizes

### Anthropic Mono — Reserved for code or technical snippets — appears sparingly
- **Substitute:** JetBrains Mono, SF Mono, Menlo
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.40

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | -0.24px |
| body-sm | — | — | 16px | 1 | -0.08px |
| body | — | — | 20px | 1.4 | 0px |
| subheading | — | — | 24px | 1.3 | -0.05px |
| heading | — | — | 61px | 1.1 | -0.12px |
| display | — | — | 68px | 1.1 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1280px
- **Section gap:** 80-120px
- **Card padding:** 24-32px
- **Element gap:** 8px

### Border Radius

- **nav:** 0px
- **cards:** 24px
- **links:** 0px
- **badges:** 0px
- **buttons:** 8px (bottom-only on filled variants), 12px (outlined)

## Components

### Text Link Button
**Role:** Primary inline link styled as a button — used for navigation and inline actions

Transparent background, #141413 text color, no border, 0px radius, padding 22px 12px. Underline appears on hover. No background fill at any state — this is text that happens to be clickable, not a container.

### Filled Ivory Button
**Role:** Primary action button on light surfaces

Background #faf9f5, text #141413, bottom-only border-radius 8px (top corners sharp), padding 12px 31px. The bottom-only radius is a signature choice — the button reads like a tab or card pulled from a stack, not a generic pill. No border, no shadow.

### Outlined Dark Button
**Role:** Secondary action on dark backgrounds (cookie consent, modal footer)

Transparent background, #ffffff text, 1px border in #87867f, 12px radius, padding 8px 16px. Compact size, ghost treatment that lets the dark background show through.

### Clay Filled Button
**Role:** The single chromatic CTA — used sparingly for the most consequential actions

Background #d97757, white text, 8px radius, padding matching Filled Ivory Button proportions. Reserved for moments where acceptance must be visually distinct from the rest of the editorial interface. Deepens to #c6613f on hover.

### Featured Hero Card
**Role:** Large editorial card for announcements and story highlights

Background #f5e3c7 (manilla), 24px border-radius, no shadow, no border. Generous internal padding (~48-64px) to accommodate large serif display text and editorial illustration. The warm paper tone separates it from ivory cards without using color.

### Release Card
**Role:** Compact card for latest releases grid

Background #faf9f5, 24px radius, 1px border in #cccbc8 or no border, padding ~24px. Title in Anthropic Sans 24px weight 600 or Anthropic Serif 20px, body in serif 20px. Three-column grid layout.

### Top Navigation Bar
**Role:** Sticky site navigation

Transparent or #f0eee6 background, logo left in Anthropic Sans 12px weight 700 all-caps letter-spaced, nav links right-aligned at 12px sans with #b0aea5 hover-to-#141413 transition. Dropdown indicators as chevrons. The 'Try Claude' button on the right uses Filled Ivory Button styling. No background blur, no shadow.

### Footer
**Role:** Dark closing section with link columns

Full-bleed #141413 background, #faf9f5 text, multi-column link grid with 8px link gaps. Section headings in sans 12px weight 600, link items in sans 12px at #b0aea5. The dark footer is the only inversion in the system — a final grounded anchor after all the parchment above.

### Hero Heading Block
**Role:** Asymmetric first-screen composition

Two-column layout: left holds Anthropic Sans 61px weight 700 heading with inline underlined links mid-phrase; right holds supporting serif paragraph at 20px. Generous whitespace around the block. Headings use #141413, supporting text #141413 at reduced visual weight.

### Inline Underlined Link
**Role:** Text link embedded in paragraphs and headings

No background, text inherits parent color (#141413), 1px underline always visible (not just on hover) in #141413. The persistent underline is editorial — it matches print convention where links are typeset with underlines, not the UI convention of reveal-on-hover.

### Badge / Inline Label
**Role:** Small tag for categories and metadata

Transparent background, #141413 text, 0px radius, no padding above/below the text baseline. Effectively just bold or weighted text in flow — not a container. Used sparingly.

### Cookie Consent Bar
**Role:** Bottom-pinned consent prompt

Dark band (#141413 background) or dark overlay containing body text and three action buttons: Filled Ivory Button (Accept), Outlined Dark Button (Customize, Reject). The contrast inversion makes consent legible against the parchment above.

### Skip Link
**Role:** Accessibility utility for keyboard navigation

Background #faf9f5, text #141413, small padding, visible only on focus. Positioned absolutely at the top edge.

## Do's and Don'ts

### Do
- Use Anthropic Serif at 20px for all body copy and Anthropic Sans at 12-16px for UI chrome — the serif/sans split defines the system's voice.
- Use #f0eee6 as the page canvas and #faf9f5 for cards; reach for #f5e3c7 only when a card needs to feel like a featured editorial spread.
- Use the bottom-only 8px radius on filled buttons (Filled Ivory Button); this signature corner treatment replaces the generic pill.
- Use #d97757 Clay exclusively for the most consequential single CTA on any given page; never apply it to multiple actions or decorative elements.
- Keep underlines persistent on inline links — editorial print convention, not reveal-on-hover.
- Reach for 24px radius on all card-level surfaces to maintain the paper-stacked feel.
- Use the 61px sans weight 700 paired with the 68px serif weight 400 as the dual display system — sans for declarative statements, serif for editorial reflection.

### Don't
- Don't introduce cool grays, blues, or any color outside the warm earth-tone family — the palette is ivory/oat/clay, period.
- Don't use box-shadow for elevation — this system elevates through surface tone (#f0eee6 → #faf9f5 → #f5e3c7) and 1px borders only.
- Don't use the Clay accent for decoration, icons, hover states, or non-CTA elements; reserve #d97757 for filled action buttons only.
- Don't set body text in sans-serif — body must be serif at 20px; sans is UI chrome only.
- Don't apply uniform border-radius to buttons; the bottom-only 8px is a signature, not a default that should be rounded everywhere.
- Don't use bright white (#ffffff) as a surface — the system is ivory-tinted throughout (#faf9f5, #f0eee6, #f5e3c7); pure white would feel clinical and break the paper metaphor.
- Don't add gradients, glows, or color washes to backgrounds; surfaces are flat solid fills only.

## Elevation

- **Card:** `none — elevated through surface tone shift, not shadow`
- **Button:** `none — identity through fill color and bottom-corner radius`
- **Navigation:** `none — flat, relies on tonal difference from page canvas`

## Surfaces

- **Canvas** (`#f0eee6`) — Page-level background — the parchment that everything sits on
- **Card Surface** (`#faf9f5`) — Standard card and elevated panel — one tonal step above canvas
- **Warm Feature Surface** (`#f5e3c7`) — Featured hero card and editorial highlights — manilla paper tone for visual emphasis
- **Deep Warm Surface** (`#e3dacc`) — Secondary grouped panels and deeper warm containers
- **Inversion Surface** (`#141413`) — Footer and dark utility bands — the only dark surface in the system

## Imagery

Imagery leans heavily into vintage scientific illustration: the hero feature card contains a dense botanical/zoological collage of butterflies and moths rendered in classic naturalist plate style, evoking 19th-century field guides. Illustrations are warm-toned to harmonize with the parchment background rather than pop against it. No photography, no product screenshots, no abstract gradients. Iconography is minimal — small chevrons for dropdowns and sparse line indicators, always in the same warm-neutral family as text. The visual density is low: large blocks of text and whitespace dominate, with imagery appearing only at hero-feature scale.

## Similar Brands

- **Arc Browser** — Same warm parchment neutrals and nature-inspired accent palette, editorial type treatment, and rejection of cold tech-blue UI conventions
- **Stripe** — Editorial documentation aesthetic with serif body text paired with sans UI, warm grays instead of cool blues, and section-based max-width reading layout
- **Notion** — Type-driven minimal interface where typography carries hierarchy more than color or shadow, generous whitespace, restrained palette
- **Linear** — Monochrome restraint and the discipline of using a single accent color only at decisive action moments
- **Cursor** — Contemporary AI-product visual language with custom sans + serif type pairing and minimal decorative chrome
