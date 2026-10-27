# Doug–Alves — Style Reference
> Oversized typographic monolith on warm charcoal

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Doug Alves' portfolio treats every viewport like a gallery wall: one massive piece of typographic art dominates the dark hero, then the site steps down into compact, editorial information grids. The palette is ruthlessly achromatic — warm espresso black, bone white, and graphite — with no chromatic accent anywhere; all visual energy comes from type scale and contrast. Headlines run to 197px at weight 300 with aggressive negative tracking, while body copy stays at 16-18px, creating a 10:1 size ratio that makes the whole site feel like a single oversized poster surrounded by fine-print specifications. Layout is full-bleed with sections switching between warm-dark and white, and information always arranges into crisp multi-column grids separated by hairline graphite rules.

## Colors

| Name | Value | Role |
|------|-------|------|
| Espresso | `#1d1610` | Hero and dark section background — warm-tinted near-black reads as architectural, not as raw #000, giving the oversized display type a gallery-wall feel |
| Graphite | `#282828` | Primary body text, structural borders, section dividers — the workhorse neutral that draws the hairline rules and most interface lines |
| Slate | `#333333` | Secondary body and heading text — slightly lighter than Graphite, used for headings and emphasized body copy where Graphite is reserved for borders |
| Obsidian | `#000000` | Display headings on light sections and pure-black accents — used sparingly for maximum impact on the white About and Latest sections |
| Paper | `#ffffff` | Content section surfaces and inverted text on dark hero — the bright surface that the warm espresso sections cut against |
| Bone | `#fff5f2` | Warm off-white page canvas — subtle pink-ivory tint replaces plain white as the base, keeping the entire palette on the warm side of neutral |

## Typography

### Inter — Primary body and UI text. The 18px body size with 1.78 line-height creates a generous, editorial reading rhythm that contrasts the compact, tight display type. The 0.89 line-height variant handles single-line labels and metadata where vertical density matters.
- **Substitute:** Inter (Google Fonts) or Söhne at 400
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.78 (body) → 0.89 (tight label)
- **Letter spacing:** normal
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### wtqc — Signature display and heading face. The massive 197px/72px/28px scale at weight 300 with tight tracking (-0.033em → -0.014em) creates the poster-art identity. At 300 weight, headlines whisper rather than shout — authority through scale and restraint, not boldness. The lighter weight prevents the enormous letterforms from feeling heavy or aggressive.
- **Substitute:** Inter Tight at weight 300, or Söhne Breit at 300 as a free alternative
- **Weights:** 300, 400
- **Sizes:** 12px, 28px, 72px, 197px
- **Line height:** 1.00 (display) → 1.33 (caption)
- **Letter spacing:** -0.033em at 197px, -0.021em at 72px, -0.014em at 28px, -0.003em at 12px
- **OpenType features:** `default ligatures only`

### System UI (-apple-system) — Tertiary fallback for cards, metadata blocks, and system-level UI that doesn't carry brand typographic weight
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.00

### -apple-system — -apple-system — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### Roboto — Roboto — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.33
- **OpenType features:** `"dlig" 0, "hlig" 0, "liga" 0, "rlig" 0, "smcp" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.04px |
| body-sm | — | — | 16px | 1.5 | — |
| body | — | — | 18px | 1.78 | — |
| subheading | — | — | 28px | 1.29 | -0.39px |
| heading | — | — | 72px | 1.04 | -1.51px |
| display | — | — | 197px | 1 | -6.5px |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 24-32px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 20px
- **buttons:** 0px

## Components

### Hero Display Block
**Role:** Full-bleed opening section carrying the signature oversized type

Espresso (#1d1610) full-viewport background, no padding constraints, text fills the width. Display text at 197px, weight 300, letter-spacing -6.5px, color Bone (#fff5f2) with secondary word fragments in Graphite (#282828) for internal contrast. A single small monochrome refresh icon (8-12px, Bone) sits in the top-right corner. No CTAs, no nav — the type IS the content.

### Section Mega-Header
**Role:** Section opener that repeats the poster-scale type on white

White or Bone surface, massive black or Graphite text at 72-120px, weight 300-400, tight tracking. Examples: "LATEST", "ABOUT" filling the left portion of the viewport. Acts as a visual reset between dark and light sections, re-establishing scale each time.

### Project Image Card
**Role:** Showcase tiles for case studies and design work

Full-bleed image container with 20px border-radius, no border, no shadow. Sits directly on Bone or Paper surface. Images carry their own color (design work, photography) — the chrome around them is invisible. Caption metadata in Inter 12px, Slate text, sits 8-16px below the image edge.

### Info Grid Row
**Role:** Multi-column structured data display (footer, contact, experience)

4-column grid on desktop, collapsing to 2 on mobile. Columns separated by hairline 1px Graphite (#282828) borders or generous whitespace (32-64px gutters). Column header in Inter 12-16px, weight 400, Slate color. Column content in Inter 16-18px, weight 400, Graphite color. Vertical padding 24-32px per row. Horizontal rules between rows are 1px Graphite at 50-80% opacity.

### Bio Statement Block
**Role:** Long-form introductory text on white sections

Single text column, max-width 800-900px, left-aligned. Inter 18px, weight 400, line-height 1.78, Graphite (#282828) color. No background, no border, sits directly on Paper or Bone. Arrow glyphs (↪) and em-dashes act as typographic punctuation between clauses.

### Experience Entry
**Role:** Compact career timeline item within the Info Grid

Three-line stack: date range (Inter 14-16px, Slate), role title (Inter 16-18px, Graphite, weight 400), employer (Inter 14-16px, Graphite). No bullets, no icons — pure typographic separation. 8-16px vertical gap between entries.

### Hairline Divider
**Role:** Section separator and row delimiter

1px solid Graphite (#282828) at full or near-full width. No color variation, no decorative treatment. The ONLY structural element that repeats throughout the site — it is the skeleton.

### External Link
**Role:** Outbound links to Instagram, LinkedIn, email, etc.

Inter 16-18px, weight 400, Graphite color. Inline text style — no underline by default, no button chrome. A trailing arrow glyph (↪ or ⤴) signals the link is external. A 1px bottom border in Graphite appears on hover.

### Refresh Icon Button
**Role:** Top-right utility icon on the dark hero

12-16px monochrome SVG icon in Bone (#fff5f2) on Espresso background. 1px hairline border, no fill, square corners (0px radius). Triggers a page/state refresh.

## Do's and Don'ts

### Do
- Use weight 300 at display sizes (72px+). The light weight on massive type is the identity — using 600+ kills the gallery-wall feel.
- Set letter-spacing at -0.033em or tighter for any text above 48px. Tight tracking is what makes the display type look like one continuous mark.
- Alternate between Espresso (#1d1610) full-bleed sections and Paper/Bone sections with no gradient transitions. Hard cuts only.
- Use 1px Graphite (#282828) rules as the primary structural element between rows and sections.
- Keep the palette strictly achromatic. No brand color, no accent, no hover tint — color in the work itself is the only chromatic element.
- Set body copy at 18px with 1.78 line-height. The generous reading rhythm balances the compressed display type.
- Maintain a 4-column grid for all structured information (contact, experience, portfolio meta). Consistency of grid is the layout signature.

### Don't
- Don't add a brand accent color. The system is monochrome by design — introducing a blue or red CTA breaks the editorial identity.
- Don't use border-radius above 0px on UI elements (buttons, cards, dividers, tags). The single 20px radius applies only to image containers. Sharp corners are the rule.
- Don't set display type above weight 400. The 300 weight whispers — bolding it turns a poster into a billboard.
- Don't use drop shadows, glows, or blur effects. Elevation is communicated through contrast (dark on light, light on dark) and the hairline border system, never through shadow.
- Don't add decorative gradients. The palette is flat — gradients introduce a visual register the system doesn't support.
- Don't set body text below 16px. The 18px body is paired with massive display type; shrinking body to 12-14px breaks the hierarchy rhythm.
- Don't add icons to body content, navigation, or section headers. The refresh icon in the hero is the only icon in the system — all other structure is pure typography.

## Elevation

No shadows anywhere. Elevation is expressed exclusively through surface color contrast (Espresso on Bone, Paper on Espresso) and 1px hairline borders. This is a deliberate flat-design choice that keeps every element on the same physical plane, letting type scale do all the depth work.

## Surfaces

- **Bone Canvas** (`#fff5f2`) — Base page background — warm off-white tints the entire site away from clinical white
- **Paper Surface** (`#ffffff`) — Content cards, image containers, and structural sections that need to lift off the bone canvas
- **Espresso Field** (`#1d1610`) — Full-bleed dark hero and section breaks — the warm dark that carries the massive display type
- **Obsidian** (`#000000`) — Accent-only black, used for pure display headings on light sections

## Imagery

The site itself is image-free as a design system — it contains no decorative photography, no illustrations, no product mockups, no abstract graphics. Imagery appears only as content (project showcases, case study images) with no consistent photographic treatment: crops are full-bleed or near-full-bleed inside 20px-radius containers, often at extreme angles. The 'visual language' of the chrome is purely typographic.

## Layout

Full-bleed sections alternating between warm-dark and warm-light. The dark hero (Espresso) occupies 80-100vh with text left-aligned, overflowing the right edge — type breaks the viewport intentionally. White content sections are contained to ~1200px max-width, centered, with 4-column grids for structured information and single-column text blocks for prose. Section rhythm: dark hero → light work showcase → light about/contact → dark footer repeat. Navigation is absent or minimal (just the refresh icon). Vertical gaps between sections are 80-120px; within sections, 8-16px. The layout reads top-to-bottom as a sequence of poster-art moments connected by fine-print specification blocks.

## Similar Brands

- **Bureau Cool** — Same editorial portfolio approach with oversized display type on monochrome backgrounds and structured multi-column info grids
- **Pentagram partner sites** — Same gallery-wall aesthetic with poster-scale typography filling the viewport and compact biographical grids below
- **Rauno Freiberg (raunofreiberg.com)** — Same minimalist portfolio language with extreme type scale contrast and zero chromatic accent
- **Manual (manual.co)** — Same warm-tinted dark backgrounds and achromatic palette with light-weight oversized display headlines
