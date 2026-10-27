# Ballpark — Style Reference
> editorial white studio, single vermilion flare

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ballpark uses a confident, editorial research-platform language: a near-pure white canvas, oversized grotesque display headlines, and a single warm vermilion accent (#fc4a2b) that fires across borders, highlights, and icon strokes. The system feels quiet by default — almost every surface is white or whisper-gray — and lets the orange act as a small, functional flash against monochrome typography. Components are flat and pill-leaning: floating rounded tags, hairline-bordered cards, and a dark CTA that grounds the page against the airy type. The result reads like a magazine spread that happens to be a SaaS homepage — weight, scale, and one chromatic note doing all the work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vermilion Flame | `linear-gradient(268.33deg, rgb(252, 74, 43), rgb(255, 126, 103), rgb(255, 172, 158), rgb(255, 206, 198))` | Brand accent — borders, highlight strokes, icon fills, small inline emphasis marks. The only saturated color in the system; appears as punctuation, never as a wash; Brand-to-tint linear gradient — appears as a full-bleed color bar behind embedded product screenshots |
| Ember Pulse | `#ea3718` | Deeper vermilion variant — icon glyphs and small filled marks where the primary accent needs more weight against white |
| Tangerine Signal | `#f97316` | Secondary warm accent — decorative strokes and illustration outlines that sit beside the primary vermilion |
| Coral Blush | `#ffac9e` | Soft warm fill — subtle wash backgrounds, shadow tints that carry the brand's warmth without screaming |
| Peach Mist | `#ffe5e0` | Tinted surface — warm-tinted card or section background, barely-there warmth to differentiate from neutral gray |
| Apricot Wash | `#ffedd5` | Lightest warm tint — badge fills, tag backgrounds, and hover surfaces that need warmth without saturation |
| Brick Alert | `#dc2626` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Forest Confirm | `#15803d` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Ink Black | `#000000` | Headlines, body text, filled dark buttons, the heaviest typographic weight in the system |
| Slate 900 | `#111827` | Supporting neutral for secondary UI, dividers, and muted labels. |
| Slate 700 | `#374151` | Secondary headings and body emphasis where Slate 600 is too light |
| Slate 600 | `#4b5563` | Body text, paragraph copy, secondary descriptions, link text |
| Slate 500 | `#6b7280` | Tertiary text, captions, icon strokes at reduced weight, disabled labels |
| Paper White | `#ffffff` | Primary canvas, card surfaces, button text on dark fills |
| Fog Whisper | `#f9fafb` | Section background — the quietest gray band used to separate content zones from the pure white canvas |
| Mist Gray | `#f2f3f5` | Elevated surface — card backgrounds that sit on the Fog band, subtle inputs, and table row alternation |
| Ash Border | `#e6e8eb` | Hairline dividers, card borders, input outlines at rest |
| Coral Wash Gradient | `linear-gradient(268.33deg, rgb(255, 126, 103), rgb(255, 206, 198), rgb(255, 229, 224), rgb(255, 243, 241))` | Decorative warm gradient — used behind product imagery to extend the brand's warmth into visual sections |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Inter Display — Display headlines only — the 96px hero 'Research without the complexity' is the signature moment. Weight 800 at display sizes with -0.035em tracking creates a compressed, editorial block of type. lineHeight 1.0 stacks lines tightly. Do not use below 42px; below that, switch to Inter.
- **Substitute:** Inter (Google) with font-stretch and tighter letter-spacing, or General Sans Bold
- **Weights:** 700, 800
- **Sizes:** 42px, 60px, 96px
- **Line height:** 1.00
- **Letter spacing:** -0.035em at 96px, -0.030em at 60px, -0.030em at 42px
- **OpenType features:** `"cv06", "cv13", "zero"`

### Inter — Body, UI, navigation, and sub-headings. Weight 400 for paragraphs, 500 for nav and UI labels, 600 for sub-headings and strong emphasis, 700 for inline emphasis. Negative letter-spacing tightens the body (-0.01em to -0.03em) — a small but consistent editorial choice.
- **Substitute:** Inter (Google) is the source — direct match
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 13px, 14px, 16px, 18px, 20px, 24px
- **Line height:** 1.20–1.65
- **Letter spacing:** -0.030em at 24px, -0.020em at 20px, -0.014em at 18px, -0.010em at 16px and below, +0.050em for uppercase UI labels
- **OpenType features:** `"cv01", "cv02", "cv04", "cv09"`

### IBM Plex Mono — Eyebrow and label text — 'DEMOCRATISING RESEARCH AT CUSTOMER OBSESSED COMPANIES SUCH AS' and similar uppercase tags. The +0.15em letter-spacing creates wide mechanical tracking that reads as editorial metadata. Always uppercase, always at 11px.
- **Substitute:** JetBrains Mono Bold or IBM Plex Mono (Google)
- **Weights:** 600
- **Sizes:** 11px
- **Line height:** 1.50
- **Letter spacing:** +0.15em

### Source Serif 4 — Pull-quote and testimonial body text — introduces a serif counterpoint to the otherwise all-grotesque system. Used sparingly to add texture in quote cards and long-form editorial moments.
- **Substitute:** Source Serif 4 (Google) or Lora
- **Weights:** 400
- **Sizes:** 20px
- **Line height:** 1.60
- **Letter spacing:** -0.020em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | -0.01px |
| body | — | — | 16px | 1.5 | -0.01px |
| subheading | — | — | 18px | 1.46 | -0.014px |
| heading-sm | — | — | 20px | 1.6 | -0.02px |
| heading | — | — | 24px | 1.43 | -0.03px |
| display | — | — | 96px | 1 | -0.035px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 6px
- **hero:** 16px
- **tags:** 9999px
- **cards:** 10px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Top Announcement Bar
**Role:** Site-wide notification strip above the navigation

Full-width bar with Mist Gray (#f2f3f5) background, 5px vertical padding, centered IBM Plex Mono 11px 600 uppercase text with +0.15em tracking. Contains a small inline emoji and a link arrow. Border-bottom: 1px solid #e6e8eb.

### Primary Navigation
**Role:** Sticky top navigation bar

White background, 0px border-bottom (relies on spacing for separation). Logo (Ballpark wordmark with subtle strikethrough detail) left-aligned, nav links (Inter 500, 14px, Slate 900) center-aligned, two buttons right-aligned. Height approximately 64px. Max-width 1200px container.

### Ghost Nav Button (Sign In)
**Role:** Secondary navigation action

Transparent fill, 1px solid #e6e8eb border, 6px radius, Inter 500 14px in Slate 900, padding 8px 16px. Hover: border darkens to Slate 600.

### Filled Dark CTA (Book a Demo)
**Role:** Primary conversion action

Ink Black (#000000) background, white text, Inter 600 14px, 6px radius, padding 8px 16px. Contains a small arrow icon trailing the label. This is the only dark button in the system — the contrast against the white canvas makes it the clear action target.

### Display Headline
**Role:** Hero and section-opening typography

Inter Display 800 at 96px (hero) or 60px (section), lineHeight 1.0, letterSpacing -0.035em, color Ink Black. Stacks as a tight block — often 2-3 lines. No color emphasis; relies on weight and scale alone.

### Eyebrow Label
**Role:** Uppercase section metadata

IBM Plex Mono 600, 11px, +0.15em letter-spacing, uppercase, Slate 600. Always appears above a headline or section title. Functions as a typographic tag identifying the section category.

### Floating Capability Tag
**Role:** Feature category indicator (Surveys, Interviews, Video, etc.)

White fill, 1px solid #e6e8eb border, 9999px radius (pill), Inter 500 14px Slate 900, padding 6px 16px. Small box-shadow: 0 1px 2px rgba(0,0,0,0.05). Arranged in a horizontal row above product previews, often with thin connecting lines to a central node.

### Product Preview Card
**Role:** Embedded product UI screenshot

White card, 16px radius, floating on a full-bleed vermilion-to-coral gradient background. Contains browser-chrome mockup with tab labels, content sections, and UI elements. Elevation: 0 50px 100px -20px rgba(50,50,92,0.05), 0 30px 60px -30px rgba(0,0,0,0.15). The gradient bar behind the card is the strongest color moment on the page.

### Customer Logo Grid
**Role:** Social proof — client logos

4-column grid, all logos rendered in Slate 900 (#111827) or pure black. 24px row gap, 40px column gap. No color, no boxes — just monochrome wordmarks on white. The absence of color signals trust and lets the content speak.

### Testimonial Card
**Role:** Client quote with attribution

White background, no border, 16px radius on the image side, 10px radius on the text side. Left: full-bleed photo with subtle warm gradient overlay. Right: company logo (top), quoted text in Inter 500 16px Slate 700, attribution with avatar circle (40px) + name (Inter 600 14px) + role (Inter 400 13px Slate 600). Dot pagination indicators below.

### Feature Card (Grid Item)
**Role:** Product capability showcase in a card grid

White background, 10px radius, 1px solid #e6e8eb border, 24px padding. Icon at top in Vermilion Flame (#fc4a2b), heading in Inter 700 20px Ink Black, body in Inter 400 16px Slate 600. No shadow at rest; subtle hover lift.

### Input Field
**Role:** Form text input

White fill, 1px solid #e6e8eb border, 6px radius, Inter 400 16px Slate 900 text, padding 10px 14px. Placeholder: Slate 500. Focus: 2px Vermilion Flame ring (0 0 0 2px #fc4a2b) replaces the border.

### Badge — Warm
**Role:** Status or category tag with warm tint

Apricot Wash (#ffedd5) background, Ink Black text, Inter 600 12px, 9999px radius, padding 4px 10px. Used for feature tags and category labels where the brand warmth should carry through.

### Footer
**Role:** Site footer with navigation columns

White or Fog background, 16px radius on the top edge (curved top boundary), multi-column link grid with Inter 400 14px Slate 600. Column headings in Inter 600 14px Ink Black. Generous vertical padding (48-64px).

## Do's and Don'ts

### Do
- Use Inter Display 800 at 60-96px for all display headlines, with -0.035em letter-spacing and 1.0 line-height
- Use IBM Plex Mono 11px 600 with +0.15em tracking for all uppercase eyebrow labels above section headings
- Use 9999px radius for all pill-shaped tags, badges, and capability indicators
- Use the Vermilion Flame (#fc4a2b) accent only on borders, strokes, and small icon fills — never as a large background wash (except the product preview gradient bar)
- Set the primary CTA to Ink Black (#000000) with white text, 6px radius, 8px 16px padding — this is the only dark fill in the system
- Maintain 80px vertical section gaps and 1200px max-width containers for all page-level layout
- Use the warm gradient (vermilion to coral) as a full-bleed background band behind embedded product screenshots only

### Don't
- Do not use the vermilion accent (#fc4a2b) as a filled CTA button background — the system uses dark/black for primary actions
- Do not use Inter Display below 42px — switch to Inter for any sub-heading or body use
- Do not apply shadows to cards at rest; rely on 1px borders and surface color shifts for separation
- Do not use colors outside the neutral grayscale and the single vermilion accent for interface elements — no blues, greens, or purples in UI
- Do not use rounded corners above 16px on cards — the system is built on 6px and 10px radii with 9999px reserved for pills only
- Do not mix serif and grotesque within the same text block — Source Serif 4 is only for standalone pull-quotes
- Do not center-align body paragraphs longer than two lines; center only headlines, eyebrows, and short descriptions

## Elevation

- **Card — default:** `0 1px 2px rgba(0, 0, 0, 0.05)`
- **Card — elevated:** `0 6px 9px rgba(0, 0, 0, 0.1)`
- **Product preview — hero:** `0 50px 100px -20px rgba(50, 50, 92, 0.05), 0 30px 60px -30px rgba(0, 0, 0, 0.15)`
- **Input — focus ring:** `0 0 0 2px rgb(252, 74, 43)`
- **Button — ghost hover:** `0 0 0 1px rgba(75, 85, 99, 0.2), 0 2px 2px rgba(0, 0, 0, 0.06)`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — pure white dominates the system
- **Fog Band** (`#f9fafb`) — Section separator — the first step away from pure white, used for alternating content bands
- **Mist Card** (`#f2f3f5`) — Card surface — sits on top of Fog bands for subtle elevation without shadows
- **Warm Tint** (`#ffe5e0`) — Brand-tinted surface — warm wash for product showcase areas and color-coded content blocks

## Imagery

The visual language is product-first and editorial. Photography appears only in testimonial cards — warm-toned lifestyle portraits (outdoor, golden-hour, candid) with a subtle warm gradient overlay that ties into the brand palette. Product screenshots are the dominant visual element: full browser-chrome mockups floating on a vermilion gradient bar, showing the actual product UI with orange accent highlights. Customer logos are rendered in pure monochrome black — no color, no boxes, no treatment. The overall density is low: large white space between elements, one photograph or product shot per section maximum. Icons are minimal, single-weight line icons that pick up the vermilion accent when active.

## Layout

Centered, max-width 1200px container with generous breathing room. The hero is a centered text stack: eyebrow label → massive 96px display headline → single paragraph subtext → floating capability tags above an embedded product preview. Below the fold, the rhythm alternates between centered text sections and two-column splits (text left / product visual right or vice versa). Customer logos form a 4-column grid with 24px row gaps. Testimonials appear in a carousel format with large left-image / right-text cards. Sections are separated by 80px vertical gaps, and the product preview is the only section that uses a full-bleed color band. Navigation is a minimal top bar with logo, centered links, and two right-aligned buttons. No sidebar, no mega-menu.

## Similar Brands

- **Linear** — Same editorial display-headline approach with oversized grotesque type, minimal color palette, and pill-shaped feature tags floating above product previews
- **Vercel** — Shared monochrome-on-white aesthetic with a single chromatic accent and massive centered display headlines, though Vercel uses a cooler palette
- **Pitch** — Similar pill-tag navigation above product screenshots, warm accent against white, and confident typographic scale
- **Notion** — Same generous whitespace philosophy, monochrome-by-default interface with restrained color accents, and editorial headline treatment
- **Framer** — Both use a single warm accent color against pure white with oversized display type, floating element tags, and product-preview-as-hero layouts
