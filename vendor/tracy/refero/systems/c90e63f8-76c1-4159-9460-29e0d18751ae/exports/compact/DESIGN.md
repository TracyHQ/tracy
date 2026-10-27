# Parloa — Style Reference
> warm editorial paper with ink and highlighter

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Parloa uses a warm editorial language: cream paper backgrounds, deep ink-black typography, and a single vivid orange that punctuates like a highlighter. The pairing of a display serif (Exposure30) with a precise grotesque (Geist) gives every screen the cadence of a premium magazine spread rather than a typical SaaS dashboard. Dark navigation and announcement bars anchor the warm cream canvas, while white cards float on that canvas as if pinned to a designer's moodboard. The orange accent never fills buttons — it only outlines, links, and marks icons — keeping the surface warm but the actions grounded in dark fills. The overall feeling is editorial-confidence, not tech-dashboard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#1f1c1b` | Primary text, filled action buttons, dark surfaces — warm near-black replaces pure black so the entire palette feels printed on cream rather than rendered on glass |
| Paper White | `#ffffff` | Card surfaces, button text on dark fills — the only true white in the system, reserved for elements that need to lift off the warm canvas |
| Canvas Cream | `#ebe9e1` | Page background — the dominant warm neutral that makes the entire site feel like uncoated stock paper rather than a screen |
| Linen | `#f5f4f0` | Nav bar background, subtle section alternation, heading hairlines — a lighter cream that layers on the canvas without breaking warmth |
| Stone | `#a69b92` | Muted text, input borders, heading underlines — warm gray for secondary information that should recede into the paper |
| Hairline | `#d9d6ce` | Link underlines, card borders, subtle dividers — the lightest warm border, almost invisible against the canvas |
| Espresso | `#2d2724` | Dark surface accent, input fills — slightly lighter than Ink Black for the announcement bar and secondary dark surfaces |
| Charcoal | `#000000` | SVG icon fills, pure black instances — used sparingly in vector icons where absolute black is needed |
| Cobblestone | `#c7c1b7` | Secondary border, decorative dividers — warmer than Hairline, used for borders that need slightly more presence |
| Highlighter Orange | `#ff7714` | Accent for links, icon strokes, outlined callouts — vivid warm orange that only outlines, never fills, keeping the energy of a marker on paper rather than a UI button |

## Typography

### Exposure30 — Display serif for all headings — the 350 weight at 82-96px is the signature move: a thin editorial serif at massive scale that whispers authority instead of shouting in bold. Used exclusively for headlines, never for body or UI.
- **Substitute:** Fraunces, Playfair Display, or DM Serif Display
- **Weights:** 350, 400
- **Sizes:** 24px, 28px, 42px, 82px, 96px
- **Line height:** 1.00, 1.10, 1.20, 1.30
- **Letter spacing:** -0.01em at display sizes, 0.01em at 24-28px

### Geist — Body and UI grotesque — handles all navigation, buttons, body copy, labels, and metadata. The 300-400 weights dominate; 500-600 are reserved for button labels and emphasis. Tracking opens up at 10-11px (0.02em) for caps metadata, closes at body sizes (0.01em) for density.
- **Substitute:** Inter, Manrope, or system-ui
- **Weights:** 300, 400, 500, 600
- **Sizes:** 10px, 11px, 13px, 14px, 16px, 18px
- **Line height:** 1.20, 1.30, 1.33, 1.40, 1.50
- **Letter spacing:** 0.01em at 14-16px, 0.02em at 10-11px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 0.2px |
| body | — | — | 16px | 1.5 | 0.16px |
| subheading | — | — | 18px | 1.4 | 0.18px |
| heading-sm | — | — | 24px | 1.3 | 0.24px |
| heading | — | — | 42px | 1.1 | -0.42px |
| heading-lg | — | — | 82px | 1.05 | -0.82px |
| display | — | — | 96px | 1 | -0.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 2px
- **cards:** 0px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Top Announcement Bar
**Role:** Site-wide promotional strip

Full-bleed dark bar (#2d2724 background), Geist 14px weight 400 in Highlighter Orange (#ff7714) for the headline, white for body text, and an orange 'Learn more →' link at the right. No padding emphasis — sits as a single line at 8px vertical padding.

### Primary Navigation
**Role:** Sticky dark header with menu and CTA

Full-width bar with #1f1c1b background (or #2d2724), Geist 14px weight 400 in white for nav links with 2px column gaps between items. Logo (Parloa wordmark with angled bracket mark) left-aligned, nav center-aligned, search icon + language selector + 'Book a demo' filled dark button (white border on dark, white text) right-aligned. 8px vertical padding, 11-12px horizontal padding on items.

### Hero with Image Overlay
**Role:** Full-bleed first impression

Full-viewport-height photograph (warm-lit portraiture) with a diagonal gradient overlay transitioning from transparent to the cream canvas. Exposure30 at 82-96px weight 350 in Ink Black (#1f1c1b) overlays the bottom-left quadrant. No card chrome — the image IS the surface, the text floats on it.

### Logo Trust Bar
**Role:** Social proof strip

Horizontal row of 7-8 partner/client logos (Booking.com, Accenture, SwissLife, KPMG, Microsoft, SAP, TeamViewer) rendered in grayscale on the cream canvas. Geist caption text or no label. Even spacing with 2px-8px gaps, no card backgrounds.

### Feature Split Section
**Role:** Two-column content block

Left column: Exposure30 at 42px weight 400 heading in Ink Black, followed by Geist 16px body text, then a dark filled CTA button. Right column: white card (#ffffff) with 0px radius containing a blue circular abstract icon and description text. 24px padding inside card, 1px Hairline (#d9d6ce) border.

### Industry Solution Card
**Role:** Category tile in horizontal scroller

White card (#ffffff), 0px radius, 24px padding, 1px Hairline (#d9d6ce) border. Outlined icon (stroke only) in Ink Black at top, Exposure30 24px heading in Ink Black, Geist 14px body in Stone (#a69b92). Cards arranged in a 4-column row with 16px gaps, leftmost card has a small orange (#ff7714) dot accent top-left.

### Primary CTA Button (Filled Dark)
**Role:** Main action trigger

Ink Black (#1f1c1b) background, white text, Geist 14px weight 500, 12px vertical padding, 11px horizontal padding, 2px border-radius. No hover lift — maintains flat editorial feel. Used for 'Book a demo', 'How our platform works'.

### Ghost/Text Button
**Role:** Secondary action

No background, Ink Black text, Geist 14px weight 400, 2px radius, often paired with an arrow (→) in Highlighter Orange (#ff7714). Inline with text, minimal padding.

### Navigation CTA Button
**Role:** Header-level action

Dark or white surface, 1px white border, white text on dark nav, Geist 14px weight 400, 8px vertical padding, 12px horizontal padding, 2px radius. Functions as an outlined button on the dark navigation bar.

### Outlined Accent Element
**Role:** Orange-bordered callout or link

1px border in Highlighter Orange (#ff7714), no fill, Ink Black or orange text. Used for 'Learn more' links, icon badges, and decorative accents. Never used as a filled button.

### Section Heading (Serif)
**Role:** Display-level content heading

Exposure30 at 42px weight 400, Ink Black color, line-height 1.10, -0.01em letter-spacing. Left-aligned, often sitting alone above a two-column or card grid section. No decorative elements above or beside — the serif weight and scale do the work.

### Product Preview Card
**Role:** Inline UI element showcase

White surface (#ffffff), 0px radius, 1px Hairline border, 24px padding. Contains a circular blue-toned abstract graphic (left) and short descriptive text in Geist 16px (right). Represents product UI or concept imagery.

## Do's and Don'ts

### Do
- Use Exposure30 at weight 350 for all display-level headings (42px+); the thin serif at scale is the brand's signature voice
- Anchor all primary actions in Ink Black (#1f1c1b) filled buttons with white text — never use the orange as a filled button background
- Use Highlighter Orange (#ff7714) exclusively for outlines, links, icon strokes, and decorative accents — it marks, never fills
- Layer white cards (#ffffff) on the cream canvas (#ebe9e1) with 1px Hairline (#d9d6ce) borders at 0px radius for the editorial 'pinned to paper' effect
- Set body text in Geist at 16px weight 400 with 0.01em letter-spacing and line-height 1.50 for the comfortable editorial rhythm
- Use 4px as the base spacing unit; apply 8px and 12px for button padding, 16px for element gaps, 24px for card padding, 80px for section gaps
- Let photography carry the hero — full-bleed warm-lit portraiture with gradient overlay, never abstract graphics or illustrations in the hero position

### Don't
- Don't use the orange (#ff7714) as a filled button or large background block — it kills the editorial subtlety and turns the design into a generic tech site
- Don't introduce box-shadows or drop-shadows on cards — the design relies on flat surfaces with hairline borders, not elevation
- Don't use bold (600+) weights for headings — the serif at 350-400 is the entire point; bolding it destroys the whisper-quiet authority
- Don't apply border-radius above 4px on any element — the near-zero radii (0-2px) keep the design feeling like print, not app
- Don't use pure black (#000000) for body text or large surfaces — Ink Black (#1f1c1b) maintains the warm print quality
- Don't place colored backgrounds (blue, green, purple) beneath cards or sections — the entire system is warm cream + dark + orange, no cool tones
- Don't use bold or vivid colors for body text — all text should be Ink Black, Stone (#a69b92), or Hairline (#d9d6ce); the orange is never for paragraphs

## Surfaces

- **Canvas** (`#ebe9e1`) — Full page background — the warm cream that everything sits on
- **Linen** (`#f5f4f0`) — Nav bar fill, subtle section banding
- **Paper** (`#ffffff`) — Card surfaces that float above the canvas
- **Espresso** (`#2d2724`) — Dark surface for announcement bar
- **Ink** (`#1f1c1b`) — Deepest dark — navigation bar, filled buttons, heading text

## Imagery

Photography is the primary visual asset. Style: warm-lit, intimate portraiture with golden-hour tones — close crops of faces with natural smiles, often slightly backlit to create lens flare and warmth. Treatment: full-bleed with a diagonal gradient overlay (transparent to cream) that softens the image edge into the page. No illustrations, no abstract graphics in content areas, no 3D renders. Icons are exclusively outlined/stroked (thin black strokes), never filled, never multicolor. The lone decorative non-photographic element is a blue circular abstract graphic inside product preview cards. Overall: image-heavy hero, text-dominant body, no lifestyle stock-photo energy — the photography is candid and human, not staged or corporate.

## Layout

Page model: max-width ~1200px centered content, but hero and announcement bar are full-bleed. Navigation: sticky dark bar with centered nav items, logo left, CTA right. Hero: full-viewport-height photograph with overlaid serif headline bottom-left. Section rhythm: alternating cream/white bands with 80px vertical gaps between major sections. Content arrangement: two-column splits (heading-left, visual-right) followed by horizontal-scrolling 4-column card rows. Below the logo trust bar, layout moves into single-column heading + card grid pattern. Density: spacious — large type, generous padding (24px cards, 80px sections), few elements per row. The scrollable card rows (logo bar, industry solutions) create horizontal movement that breaks the otherwise editorial vertical flow.

## Similar Brands

- **Linear** — Same editorial pairing of refined display type with clean grotesque UI, and the same confidence in dark navigation bars anchoring a light content canvas
- **Arc Browser** — Warm cream-paper canvas with a single high-energy accent color and editorial serif headings — same print-inspired aesthetic applied to a digital product
- **Stripe** — Editorial-grade serif display type at massive scale, warm neutral backgrounds, and the restraint to use color only as punctuation rather than filling
- **Runway** — Full-bleed warm-lit photography as hero, near-flat card surfaces with hairline borders, and a single vivid accent color that only outlines
