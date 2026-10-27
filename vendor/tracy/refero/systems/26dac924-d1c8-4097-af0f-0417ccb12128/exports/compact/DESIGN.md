# HoneyBook — Style Reference
> sunlit creative studio on warm cream — a bright yellow marquee opening onto white workspace panels and dark pill stamps.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

HoneyBook uses a sunlit-creative-studio language: a saturated sunshine-yellow hero, warm dark-navy text, and white product surfaces. The visual system is built on the tension between a serif display voice (STK Bureau Serif) and a confident geometric sans (STK Bureau Sans), with a tiny all-caps eyebrow face (STK Gerhard) that whispers 'editorial' above section headers. Buttons are absolute pills — fully rounded, dark-navy, no shadows — making actions feel like physical stamps pressed onto the page. Surfaces stay quiet and white below the fold; the yellow appears as a deliberate color block for hero/marquee moments rather than scattered decoration, creating a recognizable entry-and-rest rhythm across long pages.

## Colors

| Name | Value | Role |
|------|-------|------|
| Honey Yellow | `#fffa77` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Marigold | `#fffa56` | Accent fills on cards, headline underline strokes, icon highlights, secondary callouts — slightly punchier sibling of Honey Yellow for moments that need to sit on white |
| Inkwell | `#142127` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Carbon | `#131416` | Body text and high-contrast borders on light surfaces, alt dark fill for emphasis blocks |
| Slate Gray | `#343c40` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Pebble | `#63696c` | Muted helper text, secondary metadata, low-emphasis captions |
| River Mist | `#c7d5d9` | Card and link borders on white surfaces, hairline dividers — cool enough to feel distinct from the warm yellow system |
| Fog | `#e0e5e7` | Subtle borders, disabled state outlines, very light separators |
| Paper White | `#ffffff` | Page and card surfaces, text on dark fills, primary button text |

## Typography

### STK Bureau Serif — Display and large headline face — the editorial voice for hero statements, section titles, and feature headlines. Tight tracking (-0.027em to -0.05em) pulls the letters into a dense, magazine-like block. A serif in a SaaS hero is the signature move; it humanizes the product and signals 'crafted for creatives'.
- **Substitute:** Playfair Display, Lora, or DM Serif Display
- **Weights:** 400
- **Sizes:** 16px, 28px, 40px, 48px, 56px, 64px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.0500em, -0.0420em, -0.0310em, -0.0270em

### STK Bureau Sans — Workhorse UI and body face — navigation, buttons, paragraphs, form fields, cards. Weights 500–700 handle subheads and CTAs. The pairing with the serif display creates a clear voice hierarchy: serif for poetry, sans for instructions.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 24px, 28px, 32px, 48px
- **Line height:** 1.20–1.80
- **Letter spacing:** -0.0500em, -0.0360em, -0.0300em

### STK Gerhard — Tiny all-caps eyebrow labels above section headers (e.g. 'CAPTURE LEADS') — wide tracking (+0.071em) in uppercase gives every section a labeled, editorial entry point. Used sparingly; one per section, never in body copy.
- **Substitute:** Inter at 14px with text-transform uppercase and letter-spacing 0.08em
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.20–1.50
- **Letter spacing:** 0.994px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.5 | -0.7px |
| body | — | — | 16px | 1.5 | -0.8px |
| subheading | — | — | 20px | 1.4 | -0.6px |
| heading-sm | — | — | 24px | 1.3 | -0.72px |
| heading | — | — | 32px | 1.2 | -0.96px |
| heading-lg | — | — | 48px | 1.1 | -2.4px |
| display | — | — | 56px | 1.05 | -2.8px |
| display-lg | — | — | 64px | 1 | -1.98px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 20px
- **images:** 20px
- **inputs:** 10px
- **buttons:** 9999px

## Components

### Dark Pill CTA
**Role:** Primary call-to-action button across hero, nav, and product sections

Fully rounded pill (border-radius: 9999px), background #142127, text #ffffff in STK Bureau Sans 16px weight 600, padding 20px 32px, no border, no shadow. The shape is the signature — absolute circles on the ends make every action feel like a physical stamp.

### Ghost Pill Button
**Role:** Secondary outlined button used in nav and inline actions

Border-radius: 9999px, background #ffffff, border 1px solid #c7d5d9, text #142127 in STK Bureau Sans 16px weight 500, padding 20px 32px. Used for 'Log in' and less emphatic CTAs.

### Promo Banner Bar
**Role:** Top-of-page seasonal or offer announcement

Full-bleed horizontal band, background light gray (#edf1f3 implied), centered text in STK Bureau Sans 14px weight 500, flanked by floral illustration decorations, with an inline ghost pill CTA ('CLAIM OFFER'). Height ~56px.

### Navigation Bar
**Role:** Primary site navigation

White background, sticky, max-width 1200px centered, logo left, nav links center (STK Bureau Sans 16px weight 500, #142127), Log in (ghost) + Start for free (dark pill) right. No drop shadow — separation via 1px bottom border #e0e5e7.

### Yellow Hero Section
**Role:** First-screen value proposition

Full-bleed #fffa77 background, centered content stack. Social proof row (★★★★★ 15K+ REVIEWS) in STK Gerhard 14px caps. Headline in STK Bureau Serif 56–64px weight 400, color #142127, tight tracking. Subtext in STK Bureau Sans 18–20px weight 400, #142127. Dark pill CTA below. Tabbed product preview (Project pipeline, Lead capture, etc.) at the bottom edge with underline active state.

### Feature Split Section
**Role:** Two-column feature highlight with screenshot on the right

White background, 1200px max-width, 2-column grid (40% text / 60% visual). Eyebrow label in STK Gerhard 14px caps (#142127). Headline in STK Bureau Serif 48px weight 400. Body in STK Bureau Sans 16px. Right side: app screenshot or composite card mockup with 20px radius.

### Product App Screenshot
**Role:** Embedded product UI screenshot or composite illustration

20px border-radius, white card background, subtle 1px border #c7d5d9, no drop shadow. Shows the actual product interface (Projects view, Lead form, etc.) — used as the 'proof' on the right side of feature splits.

### Tab Navigation Strip
**Role:** Feature category switcher below hero

Horizontal row of 5 tab labels in STK Bureau Sans 16px weight 500, #142127 text. Active tab has a 2px solid #142127 bottom border; inactive tabs are unstyled. No background fill change — just the underline.

### Lead Capture Form Card
**Role:** Product feature showcase — form builder preview

White card, 10px radius, 1px border #c7d5d9, padding 24px. Contains form fields: text inputs with 6px radius, 1px #c7d5d9 border, placeholder #63696c. Above the form: floating stats badge (white, 10px radius, subtle shadow) showing 'New leads: 7' and 'Unread messages: 8'.

### Stats Badge
**Role:** Floating metric callout layered over product imagery

White surface, 10px border-radius, 1px border #c7d5d9, soft drop shadow (0 4px 12px rgba(20,33,39,0.08)). Two-column layout: label in STK Bureau Sans 12px weight 500 #63696c, number in STK Bureau Serif 28px weight 400 #142127.

### Eyebrow Section Label
**Role:** Small caps category tag above section headlines

STK Gerhard 14px weight 500, uppercase, letter-spacing 0.994px, color #142127. Always sits 8–12px above the section headline. One per section, never repeated.

## Do's and Don'ts

### Do
- Use border-radius: 9999px for all interactive buttons and tag pills — the fully rounded shape is the most recognizable element of the system.
- Set display headlines in STK Bureau Serif 48–64px with tracking between -0.027em and -0.05em; the tight serif block is the editorial signature.
- Apply the all-caps STK Gerhard 14px eyebrow label (+0.071em tracking) above every major section headline, exactly once per section.
- Use #fffa77 as a full-bleed hero/marquee background block; never as a small inline accent — its power is in the large flat field.
- Use Inkwell (#142127) for all primary CTA fills and body text; it provides 16:1+ contrast on both white and yellow surfaces.
- Keep product UI surfaces on Paper White (#ffffff) with 1px River Mist (#c7d5d9) borders; avoid drop shadows on cards.
- Maintain 80px vertical gaps between major sections and 24px internal padding on cards.

### Don't
- Don't use drop shadows on cards, buttons, or nav — the system relies on 1px borders and color contrast for separation.
- Don't apply the yellow to small UI elements (badges, dots, icon backgrounds); it only works at hero/marquee scale.
- Don't use STK Bureau Sans at display sizes; reserve sans for 32px and below and let the serif own the big moments.
- Don't mix radius values within a single component group — buttons are always 9999px, cards always 20px or 10px, never 16px.
- Don't add gradients; the system is strictly flat color blocks — even the yellow hero is a solid fill.
- Don't use the ghost pill for primary actions; dark fill is reserved for the single most important action on a given screen.
- Don't break the serif/sans pairing by using serif for body copy or sans for display headlines — the voice contrast is the system.

## Elevation

- **Stats Badge (floating metric card):** `0 4px 12px rgba(20, 33, 39, 0.08)`
- **Product App Screenshot (elevated variant):** `0 8px 24px rgba(20, 33, 39, 0.06)`

## Surfaces

- **Paper White** (`#ffffff`) — Default page canvas and card surfaces for product UI and most content sections
- **Honey Yellow** (`#fffa77`) — Full-bleed hero band, marquee promotional blocks, attention-anchoring sections
- **Marigold** (`#fffa56`) — Accent feature panels, highlight cards, decorative inline fills

## Imagery

Imagery is minimal and decorative: hand-drawn floral illustrations in soft pastels (pink, yellow, purple, green) appear only in the promo banner and scattered marketing moments. Product screenshots are the dominant visual asset — real UI captures shown at large scale on white card surfaces. No stock photography, no lifestyle imagery, no abstract gradients. The visual weight sits on the product itself and the typographic system.

## Layout

Max-width 1200px centered container with generous side padding. The page opens with a full-bleed yellow hero (extending edge-to-edge), then alternates between white content sections and occasional yellow accent bands. Feature sections use a consistent 2-column split: text left (40%), product visual right (60%). Cards stack vertically in single-column within feature blocks, occasionally forming 3-column grids for feature lists. Vertical rhythm is set by 80px section gaps with 24px internal padding. Navigation is a sticky white top bar with logo left, links center, CTAs right. No sidebar, no mega-menu complexity.

## Similar Brands

- **Squarespace** — Same editorial serif/sans pairing, full-bleed colored hero blocks, and large confident display headlines on saturated backgrounds
- **Notion** — Similar minimal white product surface treatment with a single bold accent color and pill-shaped navigation controls
- **ConvertKit** — Creative-entrepreneur SaaS targeting similar audience; shares the warm confident tone, pill buttons, and lifestyle-illustration banner approach
- **Mailchimp** — Playful brand personality expressed through bold color blocks, illustration, and a custom-feeling type system rather than generic SaaS gray
